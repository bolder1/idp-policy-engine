import { describe, expect, it } from 'vitest'

import { cond, groups, policies, type Policy, type Rule } from '../data'
import { diagnose, impactOf, outcomeSplit, shadowedBy } from './diagnostics'

/* -----------------------------------------------------------------------------
   The value of a diagnostics panel is entirely in its precision. A false
   positive on a correct policy teaches admins to ignore the panel, after which
   the true positives are worthless too — so these tests weigh "stays quiet when
   it should" as heavily as "fires when it should".
   -------------------------------------------------------------------------- */

let seq = 0
function rule(over: Partial<Rule> = {}): Rule {
  seq += 1
  return {
    id: `t${seq}`,
    name: `Rule ${seq}`,
    enabled: true,
    appliesTo: ['all'],
    conditions: [],
    decision: '2fa',
    firstFactor: 'Password',
    secondFactor: 'any',
    rememberMfa: false,
    allowDisable2fa: false,
    matchEstimate: 100,
    ...over,
  }
}

function policy(rules: Rule[]): Policy {
  return {
    id: 'p',
    name: 'Test',
    type: 'App Access',
    appIds: ['salesforce'],
    status: 'active',
    lastModified: 'now',
    modifiedBy: 'test',
    rules,
  }
}

const ids = (p: Policy) => diagnose(p, groups).map((d) => d.id.split('-')[0])

describe('unreachable rules', () => {
  it('flags a rule sitting under a conditionless rule with the same audience', () => {
    const p = policy([rule({ conditions: [] }), rule({ conditions: [cond('country', 'is', ['India'])] })])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('unreachable'))
    expect(d).toBeDefined()
    expect(d!.ruleIndex).toBe(1)
    expect(d!.relatedIndex).toBe(0)
    expect(d!.severity).toBe('error')
  })

  it('stays quiet when the earlier rule HAS conditions — it might not match', () => {
    // The whole soundness argument: a conditional rule above proves nothing.
    const p = policy([
      rule({ conditions: [cond('country', 'is', ['India'])] }),
      rule({ conditions: [cond('device-type', 'is', ['Mobile'])] }),
    ])
    expect(ids(p)).not.toContain('unreachable')
  })

  it('stays quiet when the earlier catch-all targets a narrower audience', () => {
    const p = policy([
      rule({ appliesTo: ['finance'], conditions: [] }),
      rule({ appliesTo: ['all'], conditions: [cond('country', 'is', ['India'])] }),
    ])
    expect(ids(p)).not.toContain('unreachable')
  })

  it('flags when the earlier catch-all is broader (all covers finance)', () => {
    const p = policy([rule({ appliesTo: ['all'] }), rule({ appliesTo: ['finance'] })])
    expect(ids(p)).toContain('unreachable')
  })

  it('ignores a disabled catch-all — a switched-off rule blocks nothing', () => {
    const p = policy([rule({ enabled: false }), rule({ conditions: [cond('country', 'is', ['India'])] })])
    expect(ids(p)).not.toContain('unreachable')
  })
})

describe('contradictory conditions', () => {
  it('flags is / is not on the same value joined by AND', () => {
    const p = policy([
      rule({
        conditions: [cond('country', 'is', ['India']), cond('country', 'is not', ['India'], 'AND')],
      }),
    ])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('contradiction'))
    expect(d).toBeDefined()
    expect(d!.severity).toBe('error')
  })

  it('stays quiet when the pair is joined by OR — either side can satisfy it', () => {
    const p = policy([
      rule({
        conditions: [cond('country', 'is', ['India']), cond('country', 'is not', ['India'], 'OR')],
      }),
    ])
    expect(ids(p)).not.toContain('contradiction')
  })

  it('stays quiet when the values do not overlap', () => {
    const p = policy([
      rule({
        conditions: [cond('country', 'is', ['India']), cond('country', 'is not', ['Germany'], 'AND')],
      }),
    ])
    expect(ids(p)).not.toContain('contradiction')
  })

  it('flags zone in / not in as the same class of contradiction', () => {
    const p = policy([
      rule({
        conditions: [cond('zone', 'in zone', ['office']), cond('zone', 'not in zone', ['office'], 'AND')],
      }),
    ])
    expect(ids(p)).toContain('contradiction')
  })

  it('reports an exact repeat as info, not an error — it is redundant, not broken', () => {
    const p = policy([
      rule({
        conditions: [cond('country', 'is', ['India']), cond('country', 'is', ['India'], 'AND')],
      }),
    ])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('duplicate'))
    expect(d?.severity).toBe('info')
  })
})

describe('shadowing is reported on the cause', () => {
  it('counts how many rules a catch-all shadows', () => {
    const p = policy([rule({ conditions: [] }), rule({}), rule({})])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('catchall'))
    expect(d).toBeDefined()
    expect(d!.ruleIndex).toBe(0)
    expect(d!.title).toContain('2 rules')
  })

  it('says nothing when the catch-all is last, which is the correct place for one', () => {
    const p = policy([rule({ conditions: [cond('country', 'is', ['India'])] }), rule({ conditions: [] })])
    expect(ids(p)).not.toContain('catchall')
  })
})

describe('quiet on healthy policies', () => {
  it('raises no errors on any seeded policy — no rule in the seed is unreachable', () => {
    for (const p of policies.filter((x) => x.rules.length > 0)) {
      const errors = diagnose(p, groups).filter((d) => d.severity === 'error')
      expect(errors, `${p.name}: ${JSON.stringify(errors.map((d) => d.title))}`).toHaveLength(0)
    }
  })

  it('catches the one genuine flaw in the seed: Finance mixes AND with OR', () => {
    /* "Off-network finance access" is zone AND time OR device-type. The model
       stores a joiner per condition and defines no precedence, so that reads
       differently depending on where the brackets go — a real ambiguity, kept
       in the seed deliberately because it is exactly what admins write. */
    const finance = policies.find((p) => p.id === 'finance-high')!
    const found = diagnose(finance, groups)
    expect(found.filter((d) => d.severity === 'warning').map((d) => d.title)).toEqual([
      'Mixes AND with OR',
    ])
  })
})

describe('impact', () => {
  it('sums the audience exactly from group membership', () => {
    const p = policy([rule({ appliesTo: ['finance', 'executives'] })])
    // Finance 86 + Executives 12
    expect(impactOf(p, 0, groups).audience).toBe(98)
  })

  it('names the rule that inherits the traffic when this one stops matching', () => {
    const p = policy([rule({ appliesTo: ['all'] }), rule({ appliesTo: ['all'], decision: 'deny' })])
    const i = impactOf(p, 0, groups)
    expect(i.fallsTo?.index).toBe(1)
    expect(i.fallsTo?.decision).toBe('deny')
  })

  it('skips disabled rules when working out the fall-through', () => {
    const p = policy([
      rule({ appliesTo: ['all'] }),
      rule({ appliesTo: ['all'], enabled: false }),
      rule({ appliesTo: ['all'], decision: 'deny' }),
    ])
    expect(impactOf(p, 0, groups).fallsTo?.index).toBe(2)
  })

  it('skips rules whose audience does not overlap', () => {
    const p = policy([
      rule({ appliesTo: ['finance'] }),
      rule({ appliesTo: ['engineering'] }),
      rule({ appliesTo: ['finance'], decision: 'deny' }),
    ])
    expect(impactOf(p, 0, groups).fallsTo?.index).toBe(2)
  })

  it('returns null when nothing downstream can take over', () => {
    const p = policy([rule({ appliesTo: ['finance'] })])
    expect(impactOf(p, 0, groups).fallsTo).toBeNull()
  })

  it('never reports a share above 100%, however the estimate was seeded', () => {
    const p = policy([rule({ appliesTo: ['executives'], matchEstimate: 9999 })])
    expect(impactOf(p, 0, groups).share).toBe(100)
  })
})

describe('outcome split', () => {
  it('totals only enabled rules', () => {
    const p = policy([
      rule({ decision: 'deny', matchEstimate: 10 }),
      rule({ decision: '2fa', matchEstimate: 20, enabled: false }),
      rule({ decision: '1fa', matchEstimate: 30 }),
    ])
    const s = outcomeSplit(p)
    expect(s.total).toBe(40)
    expect(s.mfa).toBe(0)
    expect(s.pct(s.deny)).toBe(25)
  })

  it('does not divide by zero on an empty policy', () => {
    expect(outcomeSplit(policy([])).pct(0)).toBe(0)
  })
})

describe('subsumption and duplication', () => {
  it('flags a rule made more specific than one above it', () => {
    const p = policy([
      rule({ conditions: [cond('mdm', 'is', ['Not enrolled'])] }),
      rule({
        conditions: [cond('mdm', 'is', ['Not enrolled']), cond('ml-risk', 'is', ['High'], 'AND')],
      }),
    ])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('subsumed'))
    expect(d).toBeDefined()
    expect(d!.ruleIndex).toBe(1)
  })

  it('stays quiet when the later rule is BROADER, which is reachable', () => {
    const p = policy([
      rule({ conditions: [cond('mdm', 'is', ['Not enrolled']), cond('ml-risk', 'is', ['High'], 'AND')] }),
      rule({ conditions: [cond('mdm', 'is', ['Not enrolled'])] }),
    ])
    expect(ids(p)).not.toContain('subsumed')
  })

  it('stays quiet when a webhook is involved — its result cannot be reasoned about', () => {
    const p = policy([
      rule({ conditions: [cond('webhook', 'returns', ['deny'])] }),
      rule({ conditions: [cond('webhook', 'returns', ['deny']), cond('ml-risk', 'is', ['High'], 'AND')] }),
    ])
    expect(ids(p)).not.toContain('subsumed')
  })

  it('flags an exact duplicate as unreachable', () => {
    const c = () => [cond('user-type', 'is', ['Contractor'])]
    const p = policy([
      rule({ appliesTo: ['contractors'], conditions: c() }),
      rule({ appliesTo: ['contractors'], conditions: c() }),
    ])
    expect(ids(p)).toContain('dupe')
  })

  it('calls out a same-predicate rule with a DIFFERENT outcome as a contradiction', () => {
    const c = () => [cond('user-type', 'is', ['Contractor'])]
    const p = policy([
      rule({ appliesTo: ['contractors'], conditions: c(), decision: '1fa' }),
      rule({ appliesTo: ['contractors'], conditions: c(), decision: '2fa' }),
    ])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('dupe'))
    expect(d!.title).toContain('Contradicts')
    expect(d!.detail).toContain('1 factor')
  })

  it('ignores value ordering when comparing predicates', () => {
    const p = policy([
      rule({ conditions: [cond('device-type', 'is', ['Mobile', 'Tablet'])] }),
      rule({ conditions: [cond('device-type', 'is', ['Tablet', 'Mobile'])] }),
    ])
    expect(ids(p)).toContain('dupe')
  })
})

describe('configuration that contradicts itself', () => {
  it('flags a rule with no value to compare against', () => {
    const p = policy([rule({ conditions: [cond('country', 'is', [])] })])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('blank'))
    expect(d?.severity).toBe('error')
  })

  it('flags 2FA that users are allowed to switch off', () => {
    const p = policy([rule({ decision: '2fa', allowDisable2fa: true })])
    expect(ids(p)).toContain('optout')
  })

  it('flags factor settings on a Deny rule as having no effect', () => {
    const p = policy([rule({ decision: 'deny', rememberMfa: true })])
    expect(ids(p)).toContain('denyfactors')
  })

  it('flags "specific methods" with no methods chosen', () => {
    const p = policy([rule({ decision: '2fa', secondFactor: 'specific', secondFactorMethods: [] })])
    expect(ids(p)).toContain('nomethods')
  })

  it('warns on mixed AND/OR, which has no defined precedence in this model', () => {
    const p = policy([
      rule({
        conditions: [
          cond('zone', 'not in zone', ['office']),
          cond('time', 'between', ['09:00', '17:00'], 'AND'),
          cond('device-type', 'is', ['Mobile'], 'OR'),
        ],
      }),
    ])
    expect(ids(p)).toContain('mixed')
  })
})

describe('the system policy is left alone', () => {
  it('never warns about the global default, which is a deliberate catch-all', () => {
    const sys = policies.find((p) => p.isSystem)!
    expect(diagnose(sys, groups)).toHaveLength(0)
  })
})

describe('impact honesty', () => {
  it('reports an exact count for a conditionless rule — it matches its whole audience', () => {
    const p = policy([rule({ appliesTo: ['finance'], conditions: [], matchEstimate: 3 })])
    const i = impactOf(p, 0, groups)
    expect(i.basis).toBe('exact')
    expect(i.matches).toBe(86)
  })

  it('marks the estimate stale once the conditions have been edited', () => {
    const before = policy([rule({ conditions: [cond('country', 'is', ['India'])], matchEstimate: 108 })])
    const after: Policy = {
      ...before,
      rules: [{ ...before.rules[0], conditions: [] , matchEstimate: 108 }],
    }
    // conditions removed entirely -> exact wins, since it now matches everyone
    expect(impactOf(after, 0, groups, before).basis).toBe('exact')

    const narrowed: Policy = {
      ...before,
      rules: [
        {
          ...before.rules[0],
          conditions: [cond('country', 'is', ['Germany'])],
        },
      ],
    }
    expect(impactOf(narrowed, 0, groups, before).basis).toBe('stale')
  })

  it('is a plain estimate when nothing has been touched', () => {
    const p = policy([rule({ conditions: [cond('country', 'is', ['India'])] })])
    expect(impactOf(p, 0, groups, p).basis).toBe('estimate')
  })
})

describe('shadowedBy — the canvas beam', () => {
  it('names the rules a conditionless rule puts out of reach', () => {
    const p = policy([rule({ conditions: [] }), rule({}), rule({})])
    expect(shadowedBy(p, 0)).toEqual([1, 2])
  })

  it('returns nothing for a rule that has conditions — it may not match', () => {
    const p = policy([rule({ conditions: [cond('country', 'is', ['India'])] }), rule({})])
    expect(shadowedBy(p, 0)).toEqual([])
  })

  it('only dims rules whose audience the shadowing rule actually covers', () => {
    const p = policy([
      rule({ appliesTo: ['finance'], conditions: [] }),
      rule({ appliesTo: ['engineering'] }),
      rule({ appliesTo: ['finance'] }),
    ])
    expect(shadowedBy(p, 0)).toEqual([2])
  })

  it('never dims a disabled rule, which was already not running', () => {
    const p = policy([rule({ conditions: [] }), rule({ enabled: false }), rule({})])
    expect(shadowedBy(p, 0)).toEqual([2])
  })

  it('agrees with the unreachable diagnostic — the beam and the linter cannot disagree', () => {
    const p = policy([rule({ conditions: [] }), rule({}), rule({})])
    const flagged = diagnose(p, groups)
      .filter((d) => d.id.startsWith('unreachable'))
      .map((d) => d.ruleIndex)
    expect(shadowedBy(p, 0)).toEqual(flagged)
  })
})
