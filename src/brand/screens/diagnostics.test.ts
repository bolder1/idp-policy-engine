import { describe, expect, it } from 'vitest'

import {
  EVERYONE,
  anySignIn,
  audienceOf,
  card,
  cond,
  groups,
  policies,
  when,
  type Audience,
  type Policy,
  type Rule,
} from '../data'
import { sig } from '../predicate'
import { diagnose, impactOf, outcomeSplit, shadowedBy } from './diagnostics'

/* -----------------------------------------------------------------------------
   The value of a diagnostics panel is entirely in its precision. A false
   positive on a correct policy teaches admins to ignore the panel, after which
   the true positives are worthless too — so these tests weigh "stays quiet when
   it should" as heavily as "fires when it should".

   Two things moved under this file since it was written, and both show up in
   almost every case below:

   - a rule's WHEN is a disjunction of cards, so "joined by AND" is "in the same
     card" and "joined by OR" is "in two cards";
   - audience is the POLICY's, so a rule can no longer be excused from a check
     by pointing at a different group. Narrowing inside a policy is a `group`
     condition, which the checks read like any other.
   -------------------------------------------------------------------------- */

let seq = 0
function rule(over: Partial<Rule> = {}): Rule {
  seq += 1
  return {
    id: `t${seq}`,
    name: `Rule ${seq}`,
    enabled: true,
    when: anySignIn(),
    decision: '2fa',
    firstFactor: 'Password',
    secondFactor: 'any',
    rememberMfa: false,
    allowDisable2fa: false,
    matchEstimate: 100,
    ...over,
  }
}

function policy(rules: Rule[], audience: Audience = EVERYONE): Policy {
  return {
    id: 'p',
    name: 'Test',
    type: 'App Access',
    appId: 'salesforce',
    audience,
    status: 'active',
    lastModified: 'now',
    modifiedBy: 'test',
    rules,
  }
}

const ids = (p: Policy) => diagnose(p, groups).map((d) => d.id.split('-')[0])

describe('unreachable rules', () => {
  it('flags a rule sitting under a conditionless rule', () => {
    const p = policy([rule({ when: anySignIn() }), rule({ when: when(card(cond('country', 'is', ['India']))) })])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('unreachable'))
    expect(d).toBeDefined()
    expect(d!.ruleIndex).toBe(1)
    expect(d!.relatedIndex).toBe(0)
    expect(d!.severity).toBe('error')
  })

  it('stays quiet when the earlier rule HAS conditions — it might not match', () => {
    // The whole soundness argument: a conditional rule above proves nothing.
    const p = policy([
      rule({ when: when(card(cond('country', 'is', ['India']))) }),
      rule({ when: when(card(cond('device-type', 'is', ['Mobile'])))}),
    ])
    expect(ids(p)).not.toContain('unreachable')
  })

  it('stays quiet when the earlier rule narrows to a group — a narrowed rule is a conditional rule', () => {
    /* Was "stays quiet when the earlier catch-all targets a narrower audience".
       A rule cannot carry an audience any more; narrowing inside a policy is a
       `group` condition, so the rule above is simply not a catch-all and blocks
       nothing. Same silence, sounder reason. */
    const p = policy([
      rule({ when: when(card(cond('group', 'in', ['finance']))) }),
      rule({ when: when(card(cond('country', 'is', ['India']))) }),
    ])
    expect(ids(p)).not.toContain('unreachable')
  })

  it('flags a rule narrowed to a group under a catch-all — narrowing is no longer an excuse', () => {
    /* Was "flags when the earlier catch-all is broader (all covers finance)".
       With `audienceCovers` deleted this is stricter, not weaker: the catch-all
       above matches everyone the policy governs, and a Finance condition below
       is still out of reach. */
    const p = policy([rule({ when: anySignIn() }), rule({ when: when(card(cond('group', 'in', ['finance']))) })])
    expect(ids(p)).toContain('unreachable')
  })

  it('ignores a disabled catch-all — a switched-off rule blocks nothing', () => {
    const p = policy([rule({ enabled: false }), rule({ when: when(card(cond('country', 'is', ['India']))) })])
    expect(ids(p)).not.toContain('unreachable')
  })
})

describe('contradictory conditions', () => {
  it('flags is / is not on the same value inside one card', () => {
    const p = policy([
      rule({ when: when(card(cond('country', 'is', ['India']), cond('country', 'is not', ['India']))) }),
    ])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('contradiction'))
    expect(d).toBeDefined()
    expect(d!.severity).toBe('error')
  })

  it('stays quiet when the pair sits in two cards — either alternative can satisfy it', () => {
    const p = policy([
      rule({
        when: when(card(cond('country', 'is', ['India'])), card(cond('country', 'is not', ['India']))),
      }),
    ])
    expect(ids(p)).not.toContain('contradiction')
  })

  it('stays quiet when the values do not overlap', () => {
    const p = policy([
      rule({ when: when(card(cond('country', 'is', ['India']), cond('country', 'is not', ['Germany']))) }),
    ])
    expect(ids(p)).not.toContain('contradiction')
  })

  it('flags zone in / not in as the same class of contradiction', () => {
    const p = policy([
      rule({ when: when(card(cond('zone', 'in zone', ['office']), cond('zone', 'not in zone', ['office']))) }),
    ])
    expect(ids(p)).toContain('contradiction')
  })

  /* The check's own comment used to say "inside one card is the whole test",
     and it was right until a card could be an or-run. In one, the pair is not
     a contradiction at all: "is India OR is not India" matches everything,
     which is the opposite of unsatisfiable — so an error here blocked
     publishing a rule the author had every right to write, with no edit that
     would clear it short of deleting a condition they meant. */
  it('stays quiet on an opposed pair inside an or-card — that matches everything, not nothing', () => {
    const p = policy([
      rule({
        when: {
          cards: [{ ...card(cond('country', 'is', ['India']), cond('country', 'is not', ['India'])), join: 'or' }],
        },
      }),
    ])
    expect(ids(p)).not.toContain('contradiction')
  })

  /* Identity by `ckey`, which sorts the values, rather than by stringifying
     them in the order they were typed. Same two countries, other order, same
     condition — and the duplicate went unreported. */
  it('reports a repeat whose values were typed in the other order', () => {
    const p = policy([
      rule({
        when: when(card(cond('country', 'is', ['India', 'Germany']), cond('country', 'is', ['Germany', 'India']))),
      }),
    ])
    expect(ids(p)).toContain('duplicate')
  })

  it('reports an exact repeat as info, not an error — it is redundant, not broken', () => {
    const p = policy([
      rule({ when: when(card(cond('country', 'is', ['India']), cond('country', 'is', ['India']))) }),
    ])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('duplicate'))
    expect(d?.severity).toBe('info')
  })
})

describe('shadowing is reported on the cause', () => {
  it('counts how many rules a catch-all shadows', () => {
    const p = policy([rule({ when: anySignIn() }), rule({}), rule({})])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('catchall'))
    expect(d).toBeDefined()
    expect(d!.ruleIndex).toBe(0)
    expect(d!.title).toContain('2 rules')
  })

  it('says nothing when the catch-all is last, which is the correct place for one', () => {
    const p = policy([rule({ when: when(card(cond('country', 'is', ['India']))) }), rule({ when: anySignIn() })])
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

  it('reads the Finance seed as two alternatives — the left-fold reading of the old joiners', () => {
    /* Was "catches the one genuine flaw in the seed: Finance mixes AND with OR".
       That check is deleted, because the ambiguity it warned about is now
       expressible: "Off-network finance access" was
       `zone AND time OR device-type` with no precedence defined, and it
       migrated to the reading the old evaluator actually had — a left fold,
       `(zone AND time) OR (device-type)`, two cards. The test that reported the
       warning now pins the migration instead. */
    const finance = policies.find((p) => p.id === 'finance-high')!
    const r = finance.rules.find((x) => x.name === 'Off-network finance access')!

    const leftFold = when(
      card(
        cond('group', 'in', ['finance']),
        cond('zone', 'not in zone', ['office']),
        cond('time', 'between', ['09:00', '17:00']),
      ),
      card(cond('group', 'in', ['finance']), cond('device-type', 'is', ['Mobile', 'Tablet'])),
    )
    // The other reading, had AND been given the tighter binding: zone would
    // have survived into both alternatives. A different rule, catching
    // different sign-ins.
    const precedence = when(
      card(
        cond('group', 'in', ['finance']),
        cond('zone', 'not in zone', ['office']),
        cond('time', 'between', ['09:00', '17:00']),
      ),
      card(
        cond('group', 'in', ['finance']),
        cond('zone', 'not in zone', ['office']),
        cond('device-type', 'is', ['Mobile', 'Tablet']),
      ),
    )

    expect(r.when.cards).toHaveLength(2)
    expect(sig(r.when)).toBe(sig(leftFold))
    expect(sig(r.when)).not.toBe(sig(precedence))

    // And nothing is reported about it any more — grouping is the answer, not
    // the symptom.
    expect(diagnose(finance, groups).filter((d) => d.severity === 'warning')).toEqual([])
  })
})

describe('impact', () => {
  it('sums the audience exactly from group membership', () => {
    // The audience is the policy's now — every rule in it inherits this number.
    const p = policy([rule({})], audienceOf(['finance', 'executives']))
    // Finance 86 + Executives 12
    expect(impactOf(p, 0, groups).audience).toBe(98)
  })

  it('names the rule that inherits the traffic when this one stops matching', () => {
    const p = policy([rule({}), rule({ decision: 'deny' })])
    const i = impactOf(p, 0, groups)
    expect(i.fallsTo?.index).toBe(1)
    expect(i.fallsTo?.decision).toBe('deny')
  })

  it('skips disabled rules when working out the fall-through', () => {
    const p = policy([rule({}), rule({ enabled: false }), rule({ decision: 'deny' })])
    expect(impactOf(p, 0, groups).fallsTo?.index).toBe(2)
  })

  it('falls through to the next enabled rule whatever it narrows to', () => {
    /* Was "skips rules whose audience does not overlap", and that answer is
       gone with per-rule audiences: every rule in a policy governs the same
       people, so the rule that inherits the traffic is structurally the next
       enabled one. A `group` condition on it is a condition, not a second
       audience gate, and the fall-through cannot claim to know whether it
       matches. */
    const p = policy(
      [
        rule({ when: when(card(cond('group', 'in', ['finance']))) }),
        rule({ when: when(card(cond('group', 'in', ['engineering']))) }),
        rule({ when: when(card(cond('group', 'in', ['finance']))), decision: 'deny' }),
      ],
      audienceOf(['finance', 'engineering']),
    )
    expect(impactOf(p, 0, groups).fallsTo?.index).toBe(1)
  })

  it('returns null when nothing downstream can take over', () => {
    const p = policy([rule({})], audienceOf(['finance']))
    expect(impactOf(p, 0, groups).fallsTo).toBeNull()
  })

  it('never reports a share above 100%, however the estimate was seeded', () => {
    const p = policy(
      [rule({ when: when(card(cond('country', 'is', ['India']))), matchEstimate: 9999 })],
      audienceOf(['executives']),
    )
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
      rule({ when: when(card(cond('mdm', 'is', ['Not enrolled']))) }),
      rule({
        when: when(card(cond('mdm', 'is', ['Not enrolled']), cond('ml-risk', 'is', ['High']))),
      }),
    ])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('subsumed'))
    expect(d).toBeDefined()
    expect(d!.ruleIndex).toBe(1)
  })

  it('stays quiet when the later rule is BROADER, which is reachable', () => {
    const p = policy([
      rule({ when: when(card(cond('mdm', 'is', ['Not enrolled']), cond('ml-risk', 'is', ['High']))) }),
      rule({ when: when(card(cond('mdm', 'is', ['Not enrolled']))) }),
    ])
    expect(ids(p)).not.toContain('subsumed')
  })

  it('stays quiet when a webhook is involved — its result cannot be reasoned about', () => {
    const p = policy([
      rule({ when: when(card(cond('webhook', 'returns true', ['hk-fraud']))) }),
      rule({
        when: when(card(cond('webhook', 'returns true', ['hk-fraud']), cond('ml-risk', 'is', ['High']))),
      }),
    ])
    expect(ids(p)).not.toContain('subsumed')
  })

  it('flags an exact duplicate as unreachable', () => {
    const c = () => when(card(cond('user-type', 'is', ['Contractor'])))
    const p = policy([rule({ when: c() }), rule({ when: c() })], audienceOf(['contractors']))
    expect(ids(p)).toContain('dupe')
  })

  it('calls out a same-predicate rule with a DIFFERENT outcome as a contradiction', () => {
    const c = () => when(card(cond('user-type', 'is', ['Contractor'])))
    const p = policy(
      [rule({ when: c(), decision: '1fa' }), rule({ when: c(), decision: '2fa' })],
      audienceOf(['contractors']),
    )
    const d = diagnose(p, groups).find((x) => x.id.startsWith('dupe'))
    expect(d!.title).toContain('Contradicts')
    expect(d!.detail).toContain('1 factor')
  })

  it('ignores value ordering when comparing predicates', () => {
    const p = policy([
      rule({ when: when(card(cond('device-type', 'is', ['Mobile', 'Tablet']))) }),
      rule({ when: when(card(cond('device-type', 'is', ['Tablet', 'Mobile']))) }),
    ])
    expect(ids(p)).toContain('dupe')
  })

  it('ignores card ordering too — the same alternatives written the other way round', () => {
    const p = policy([
      rule({
        when: when(card(cond('country', 'is', ['India'])), card(cond('device-type', 'is', ['Mobile']))),
      }),
      rule({
        when: when(card(cond('device-type', 'is', ['Mobile'])), card(cond('country', 'is', ['India']))),
      }),
    ])
    expect(ids(p)).toContain('dupe')
  })
})

describe('configuration that contradicts itself', () => {
  it('flags a rule with no value to compare against', () => {
    const p = policy([rule({ when: when(card(cond('country', 'is', []))) })])
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

  it('says nothing about a rule with alternatives — the cards ARE the brackets', () => {
    /* Was "warns on mixed AND/OR, which has no defined precedence in this
       model". There is no mixed case left to warn about: the same predicate is
       two cards, its reading is fixed by the structure, and a warning about it
       would be a warning about correct work. */
    const p = policy([
      rule({
        when: when(
          card(cond('zone', 'not in zone', ['office']), cond('time', 'between', ['09:00', '17:00'])),
          card(cond('device-type', 'is', ['Mobile'])),
        ),
      }),
    ])
    expect(diagnose(p, groups)).toEqual([])
  })
})

describe('the policy audience is checked too', () => {
  it('flags a policy that governs nobody — no groups, no people', () => {
    const p = policy([rule({})], audienceOf([]))
    const d = diagnose(p, groups).find((x) => x.id === 'emptyaudience')
    expect(d?.severity).toBe('error')
    expect(d?.scope).toBe('policy')
    expect(d?.ruleIndex).toBe(-1)
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
    const p = policy([rule({ when: anySignIn(), matchEstimate: 3 })], audienceOf(['finance']))
    const i = impactOf(p, 0, groups)
    expect(i.basis).toBe('exact')
    expect(i.matches).toBe(86)
  })

  it('marks the estimate stale once the conditions have been edited', () => {
    const before = policy([
      rule({ when: when(card(cond('country', 'is', ['India']))), matchEstimate: 108 }),
    ])
    const after: Policy = {
      ...before,
      rules: [{ ...before.rules[0], when: anySignIn(), matchEstimate: 108 }],
    }
    // conditions removed entirely -> exact wins, since it now matches everyone
    expect(impactOf(after, 0, groups, before).basis).toBe('exact')

    const narrowed: Policy = {
      ...before,
      rules: [{ ...before.rules[0], when: when(card(cond('country', 'is', ['Germany']))) }],
    }
    expect(impactOf(narrowed, 0, groups, before).basis).toBe('stale')
  })

  it('marks the estimate stale on a pure regrouping, which catches different people', () => {
    /* New, and only expressible in this model: the same three conditions moved
       between alternatives. `a AND b AND c` and `(a AND b) OR c` share every
       leaf, so a flat comparison would call this untouched and go on reporting
       an estimate calculated for a different rule. */
    const before = policy([
      rule({
        when: when(
          card(
            cond('mdm', 'is', ['Not enrolled']),
            cond('ml-risk', 'is', ['High']),
            cond('country', 'is', ['India']),
          ),
        ),
        matchEstimate: 108,
      }),
    ])
    const regrouped: Policy = {
      ...before,
      rules: [
        {
          ...before.rules[0],
          when: when(
            card(cond('mdm', 'is', ['Not enrolled']), cond('ml-risk', 'is', ['High'])),
            card(cond('country', 'is', ['India'])),
          ),
        },
      ],
    }
    expect(impactOf(regrouped, 0, groups, before).basis).toBe('stale')
  })

  it('is a plain estimate when nothing has been touched', () => {
    const p = policy([rule({ when: when(card(cond('country', 'is', ['India']))) })])
    expect(impactOf(p, 0, groups, p).basis).toBe('estimate')
  })
})

describe('shadowedBy — the canvas beam', () => {
  it('names the rules a conditionless rule puts out of reach', () => {
    const p = policy([rule({ when: anySignIn() }), rule({}), rule({})])
    expect(shadowedBy(p, 0)).toEqual([1, 2])
  })

  it('returns nothing for a rule that has conditions — it may not match', () => {
    const p = policy([rule({ when: when(card(cond('country', 'is', ['India']))) }), rule({})])
    expect(shadowedBy(p, 0)).toEqual([])
  })

  it('dims every enabled rule below a catch-all, whatever they narrow to', () => {
    /* Was "only dims rules whose audience the shadowing rule actually covers".
       `audienceCovers` is deleted and the exemption with it: the rules below
       narrow with a `group` condition, and a catch-all above still matches
       first for every one of the people they were narrowing out of. Both are
       dimmed, and that is the honest answer. */
    const p = policy([
      rule({ when: anySignIn() }),
      rule({ when: when(card(cond('group', 'in', ['engineering']))) }),
      rule({ when: when(card(cond('group', 'in', ['finance']))) }),
    ])
    expect(shadowedBy(p, 0)).toEqual([1, 2])
  })

  it('never dims a disabled rule, which was already not running', () => {
    const p = policy([rule({ when: anySignIn() }), rule({ enabled: false }), rule({})])
    expect(shadowedBy(p, 0)).toEqual([2])
  })

  it('agrees with the unreachable diagnostic — the beam and the linter cannot disagree', () => {
    const p = policy([rule({ when: anySignIn() }), rule({}), rule({})])
    const flagged = diagnose(p, groups)
      .filter((d) => d.id.startsWith('unreachable'))
      .map((d) => d.ruleIndex)
    expect(shadowedBy(p, 0)).toEqual(flagged)
  })
})
