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
  zones,
  type Audience,
  type Policy,
  type Rule,
  type RuleWho,
} from '../data'
import { seedProfiles } from '../fingerprint'
import { DEPTHS, fingerprintsAt, policiesAt, zonesAt, type Depth } from '../fixtures'
import { seedHooks } from '../hooks'
import { diagnose, shadowedBy } from './diagnostics'

/* -----------------------------------------------------------------------------
   The value of a diagnostics panel is entirely in its precision. A false
   positive on a correct policy teaches admins to ignore the panel, after which
   the true positives are worthless too — so these tests weigh "stays quiet when
   it should" as heavily as "fires when it should".

   Two things moved under this file since it was written, and both show up in
   almost every case below:

   - a rule's WHEN is a disjunction of cards, so "joined by AND" is "in the same
     card" and "joined by OR" is "in two cards";
   - audience is the POLICY's, and narrowing inside a policy is the rule's
     `who` — a field beside the WHEN, which the checks read alongside it.
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

const fin: RuleWho = { groupIds: ['finance'], userIds: [] }
const con: RuleWho = { groupIds: ['contractors'], userIds: [] }

function policy(rules: Rule[], audience: Audience = EVERYONE): Policy {
  return {
    id: 'p',
    name: 'Test',
    type: 'App Access',
    appIds: ['salesforce'],
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
    const p = policy([rule({ when: anySignIn() }), rule({ when: when(card(cond('day', 'is', ['Monday']))) })])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('unreachable'))
    expect(d).toBeDefined()
    expect(d!.ruleIndex).toBe(1)
    expect(d!.relatedIndex).toBe(0)
    expect(d!.severity).toBe('error')
  })

  it('stays quiet when the earlier rule HAS conditions — it might not match', () => {
    // The whole soundness argument: a conditional rule above proves nothing.
    const p = policy([
      rule({ when: when(card(cond('day', 'is', ['Monday']))) }),
      rule({ when: when(card(cond('fingerprint', 'matches', ['fp-corp'])))}),
    ])
    expect(ids(p)).not.toContain('unreachable')
  })

  it('stays quiet when the earlier rule has a who and no conditions — it is not for everyone', () => {
    /* The seeded "CFO anywhere, hardened" shape: a named person, no
       conditions, above a rule for everyone. It blocks nobody the rule below
       applies to, and it is not a catch-all. */
    const p = policy([
      rule({ who: fin, when: anySignIn() }),
      rule({ when: when(card(cond('day', 'is', ['Monday']))) }),
    ])
    expect(ids(p)).not.toContain('unreachable')
    expect(ids(p)).not.toContain('catchall')
  })

  it('flags a rule with a who under a catch-all — narrowing is no excuse', () => {
    const p = policy([rule({ when: anySignIn() }), rule({ who: fin, when: when(card(cond('day', 'is', ['Monday']))) })])
    expect(ids(p)).toContain('unreachable')
  })

  it('flags a rule for the same people under a rule for them with no conditions', () => {
    const p = policy([rule({ who: fin, when: anySignIn() }), rule({ who: fin, when: when(card(cond('day', 'is', ['Monday']))) })])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('unreachable'))
    expect(d?.relatedIndex).toBe(0)
    expect(d?.detail).toContain('applies to everyone this rule applies to')
    expect(diagnose(p, groups).find((x) => x.id.startsWith('catchall'))?.title).toBe('Shadows 1 rule below it')
  })

  it('stays quiet when the rule below is for other people', () => {
    const p = policy([rule({ who: fin, when: anySignIn() }), rule({ who: con, when: when(card(cond('day', 'is', ['Monday']))) })])
    expect(ids(p)).not.toContain('unreachable')
    expect(ids(p)).not.toContain('catchall')
  })

  it('ignores a disabled catch-all — a switched-off rule blocks nothing', () => {
    const p = policy([rule({ enabled: false }), rule({ when: when(card(cond('day', 'is', ['Monday']))) })])
    expect(ids(p)).not.toContain('unreachable')
  })
})

describe('contradictory conditions', () => {
  it('flags is / is not on the same value inside one card', () => {
    const p = policy([
      rule({ when: when(card(cond('day', 'is', ['Monday']), cond('day', 'is not', ['Monday']))) }),
    ])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('contradiction'))
    expect(d).toBeDefined()
    expect(d!.severity).toBe('error')
  })

  it('stays quiet when the pair sits in two cards — either alternative can satisfy it', () => {
    const p = policy([
      rule({
        when: when(card(cond('day', 'is', ['Monday'])), card(cond('day', 'is not', ['Monday']))),
      }),
    ])
    expect(ids(p)).not.toContain('contradiction')
  })

  it('stays quiet when the values do not overlap', () => {
    const p = policy([
      rule({ when: when(card(cond('day', 'is', ['Monday']), cond('day', 'is not', ['Tuesday']))) }),
    ])
    expect(ids(p)).not.toContain('contradiction')
  })

  it('flags zone in / not in as the same class of contradiction', () => {
    const p = policy([
      rule({ when: when(card(cond('zone', 'in zone', ['office']), cond('zone', 'not in zone', ['office']))) }),
    ])
    expect(ids(p)).toContain('contradiction')
  })

  /* --- Multi-valued conditions OR their values ------------------------------

     Which makes an OVERLAP test unsound, and unsound here means a blocking
     error on a rule the author had every right to write, clearable only by
     deleting a condition they meant. `in [office, hq] AND not in [office]`
     is the rule "hq but not office". Reachable through the UI as soon as the
     value pickers became multi-select. */
  it('stays quiet when the negation covers only part of what the affirmative offers', () => {
    const p = policy([
      rule({ when: when(card(cond('zone', 'in zone', ['office', 'eu']), cond('zone', 'not in zone', ['office']))) }),
    ])
    expect(ids(p)).not.toContain('contradiction')
  })

  it('still flags it once the negation covers every value the affirmative offers', () => {
    const p = policy([
      rule({ when: when(card(cond('zone', 'in zone', ['office']), cond('zone', 'not in zone', ['office', 'eu']))) }),
    ])
    expect(ids(p)).toContain('contradiction')
  })

  /* The same unsoundness has always been latent for fixed-list kinds, where
     multiple values were already authorable. Order matters: the loop yields the
     pair as written, so the negated one is `ca` half the time and `every` is
     not symmetric. */
  it('reads the pair in either authoring order', () => {
    const covered = policy([
      rule({ when: when(card(cond('day', 'is not', ['Monday', 'Tuesday']), cond('day', 'is', ['Monday']))) }),
    ])
    const partial = policy([
      rule({ when: when(card(cond('day', 'is not', ['Monday']), cond('day', 'is', ['Monday', 'Tuesday']))) }),
    ])
    expect(ids(covered)).toContain('contradiction')
    expect(ids(partial)).not.toContain('contradiction')
  })

  /* --- A window is an interval, not a set of two values --------------------

     The containment test that made PE111 sound for multi-valued conditions is
     the wrong test for `between`, whose two values are endpoints. Asked
     value-for-value it gets both directions wrong: it misses a window sitting
     wholly inside the window that excludes it, and it flags two windows that
     are complements of each other and agree perfectly. */
  it('flags a window that sits wholly inside the window excluding it', () => {
    const p = policy([
      rule({ when: when(card(cond('time', 'between', ['09:00', '17:00']), cond('time', 'not between', ['09:00', '22:00']))) }),
    ])
    expect(ids(p)).toContain('contradiction')
  })

  it('stays quiet on two windows that are complements — they agree', () => {
    const p = policy([
      rule({ when: when(card(cond('time', 'between', ['09:00', '17:00']), cond('time', 'not between', ['17:00', '09:00']))) }),
    ])
    expect(ids(p)).not.toContain('contradiction')
  })

  it('stays quiet when the two windows merely overlap', () => {
    const p = policy([
      rule({ when: when(card(cond('time', 'between', ['09:00', '17:00']), cond('time', 'not between', ['12:00', '20:00']))) }),
    ])
    expect(ids(p)).not.toContain('contradiction')
  })

  /* Still flags the identical pair, which is the case the old overlap test got
     right and the one authors actually produce. */
  it('flags the same window asserted and denied', () => {
    const p = policy([
      rule({ when: when(card(cond('time', 'between', ['09:00', '17:00']), cond('time', 'not between', ['09:00', '17:00']))) }),
    ])
    expect(ids(p)).toContain('contradiction')
  })

  /* Two halves of one zone are two questions. "In the office network by
     address" and "not in the office network by geography" are both satisfiable
     together — the addresses and the map disagree, which is precisely what a
     scoped rule is written to catch. */
  it('stays quiet on the same zone asked about on two different halves', () => {
    const p = policy([
      rule({
        when: when(card(cond('zone', 'in zone', ['office'], 'ip'), cond('zone', 'not in zone', ['office'], 'location'))),
      }),
    ])
    expect(ids(p)).not.toContain('contradiction')
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
          cards: [{ ...card(cond('day', 'is', ['Monday']), cond('day', 'is not', ['Monday'])), join: 'or' }],
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
        when: when(card(cond('day', 'is', ['Monday', 'Tuesday']), cond('day', 'is', ['Tuesday', 'Monday']))),
      }),
    ])
    expect(ids(p)).toContain('duplicate')
  })

  it('reports an exact repeat as info, not an error — it is redundant, not broken', () => {
    const p = policy([
      rule({ when: when(card(cond('day', 'is', ['Monday']), cond('day', 'is', ['Monday']))) }),
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
    const p = policy([rule({ when: when(card(cond('day', 'is', ['Monday']))) }), rule({ when: anySignIn() })])
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

  /* A test pinning the migration of one seeded rule stood here.

     "Off-network finance access" was `zone AND time OR device-type` with no
     precedence defined, and it migrated to the reading the old evaluator
     actually had — a left fold, `(zone AND time) OR (device-type)`. This test
     pinned that shape so the migration could not silently un-migrate.

     The seed is gone. The ten invented policies were replaced by the
     twenty-eight from `ruleset-usecase-scenarios.md`, and nothing in that
     document has an ambiguous joiner to migrate — the document states its OR
     forms explicitly (multi-value IN, ANY-OF groups, rule splitting) and this
     estate encodes them that way from the start.

     The PROPERTY the test guarded is not lost: that a multi-card predicate
     reads as an OR of AND-runs is `predicatePasses` in `predicate.ts`, pinned
     directly by `when-ops.test.ts`, which does not depend on a fixture
     surviving. */
})

describe('subsumption and duplication', () => {
  it('flags a rule made more specific than one above it', () => {
    const p = policy([
      rule({ when: when(card(cond('zone', 'in zone', ['office']))) }),
      rule({
        when: when(card(cond('zone', 'in zone', ['office']), cond('ml-risk', 'is', ['High']))),
      }),
    ])
    const d = diagnose(p, groups).find((x) => x.id.startsWith('subsumed'))
    expect(d).toBeDefined()
    expect(d!.ruleIndex).toBe(1)
  })

  it('stays quiet when the later rule is BROADER, which is reachable', () => {
    const p = policy([
      rule({ when: when(card(cond('zone', 'in zone', ['office']), cond('ml-risk', 'is', ['High']))) }),
      rule({ when: when(card(cond('zone', 'in zone', ['office']))) }),
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
    const c = () => when(card(cond('zone', 'in zone', ['office'])))
    const p = policy([rule({ who: con, when: c() }), rule({ who: { groupIds: ['contractors'], userIds: [] }, when: c() })], audienceOf(['contractors']))
    expect(ids(p)).toContain('dupe')
  })

  it('does not call two rules duplicates when only their people differ', () => {
    const c = () => when(card(cond('zone', 'in zone', ['office'])))
    const p = policy([rule({ who: fin, when: c(), decision: '1fa' }), rule({ who: con, when: c(), decision: 'deny' })])
    expect(ids(p)).not.toContain('dupe')
    expect(ids(p)).not.toContain('subsumed')
  })

  it('ignores the order people were chosen in when comparing rules', () => {
    const c = () => when(card(cond('zone', 'in zone', ['office'])))
    const p = policy([
      rule({ who: { groupIds: ['finance', 'legal'], userIds: [] }, when: c() }),
      rule({ who: { groupIds: ['legal', 'finance'], userIds: [] }, when: c() }),
    ])
    expect(ids(p)).toContain('dupe')
  })

  it('flags a narrower rule under a broader one only when the broader one covers its people', () => {
    const broad = rule({ who: { groupIds: ['finance', 'contractors'], userIds: [] }, when: when(card(cond('zone', 'in zone', ['office']))) })
    const narrow = (who: RuleWho) => rule({ who, when: when(card(cond('zone', 'in zone', ['office']), cond('day', 'is', ['Monday']))) })
    expect(ids(policy([broad, narrow(con)]))).toContain('subsumed')
    expect(ids(policy([broad, narrow({ groupIds: ['legal'], userIds: [] })]))).not.toContain('subsumed')
  })

  it('calls out a same-predicate rule with a DIFFERENT outcome as a contradiction', () => {
    const c = () => when(card(cond('zone', 'in zone', ['office'])))
    const p = policy(
      [rule({ who: con, when: c(), decision: '1fa' }), rule({ who: con, when: c(), decision: '2fa' })],
      audienceOf(['contractors']),
    )
    const d = diagnose(p, groups).find((x) => x.id.startsWith('dupe'))
    expect(d!.title).toContain('Contradicts')
    expect(d!.detail).toContain('1 factor')
  })

  it('ignores value ordering when comparing predicates', () => {
    const p = policy([
      rule({ when: when(card(cond('fingerprint', 'matches', ['fp-corp', 'fp-byod']))) }),
      rule({ when: when(card(cond('fingerprint', 'matches', ['fp-byod', 'fp-corp']))) }),
    ])
    expect(ids(p)).toContain('dupe')
  })

  it('ignores card ordering too — the same alternatives written the other way round', () => {
    const p = policy([
      rule({
        when: when(card(cond('day', 'is', ['Monday'])), card(cond('fingerprint', 'matches', ['fp-corp']))),
      }),
      rule({
        when: when(card(cond('fingerprint', 'matches', ['fp-corp'])), card(cond('day', 'is', ['Monday']))),
      }),
    ])
    expect(ids(p)).toContain('dupe')
  })
})

describe('configuration that contradicts itself', () => {
  it('flags a rule with no value to compare against', () => {
    const p = policy([rule({ when: when(card(cond('day', 'is', []))) })])
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
          card(cond('fingerprint', 'matches', ['fp-corp'])),
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

describe('zones and device profiles that no longer exist', () => {
  const library = { zones, fingerprints: seedProfiles }
  const withoutZone = (id: string) => ({ ...library, zones: zones.filter((z) => z.id !== id) })
  const withoutProfile = (id: string) => ({ ...library, fingerprints: seedProfiles.filter((p) => p.id !== id) })
  const found = (p: Policy, lib: Parameters<typeof diagnose>[4]) =>
    diagnose(p, groups, seedHooks, undefined, lib).filter((d) => d.code === 'PE134' || d.code === 'PE135')

  it('flags a rule naming a deleted zone as PE134, an error on that rule', () => {
    const p = policy([rule({ when: anySignIn() }), rule({ when: when(card(cond('zone', 'not in zone', ['office']))) })])
    const d = found(p, withoutZone('office'))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ code: 'PE134', severity: 'error', scope: 'rule', ruleIndex: 1 })
    expect(d[0].title).toBe('This rule uses a zone that no longer exists')
  })

  it('flags a rule naming a deleted device profile as PE135', () => {
    const p = policy([rule({ when: when(card(cond('fingerprint', 'matches', ['fp-corp']))) })])
    const d = found(p, withoutProfile('fp-corp'))
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ code: 'PE135', severity: 'error', scope: 'rule', ruleIndex: 0 })
    expect(d[0].title).toBe('This rule uses a device profile that no longer exists')
  })

  it('checks every value, not only the first', () => {
    const p = policy([rule({ when: when(card(cond('zone', 'in zone', ['office', 'eu']))) })])
    expect(found(p, withoutZone('eu')).map((d) => d.code)).toEqual(['PE134'])
  })

  it('flags a switched-off rule too, the way PE130 does', () => {
    const p = policy([rule({ enabled: false, when: when(card(cond('zone', 'in zone', ['office']))) })])
    expect(found(p, withoutZone('office'))).toHaveLength(1)
  })

  it('stays quiet while the zone and the profile exist', () => {
    const p = policy([
      rule({ when: when(card(cond('zone', 'in zone', ['office']), cond('fingerprint', 'matches', ['fp-corp']))) }),
    ])
    expect(found(p, library)).toEqual([])
  })

  it('skips the check when no library is passed', () => {
    const p = policy([
      rule({ when: when(card(cond('zone', 'in zone', ['no-such-zone']), cond('fingerprint', 'matches', ['no-such-profile']))) }),
    ])
    expect(found(p, undefined)).toEqual([])
    expect(found(p, {})).toEqual([])
  })

  it('checks each list on its own — zones passed, profiles omitted', () => {
    const p = policy([
      rule({ when: when(card(cond('zone', 'in zone', ['no-such-zone']), cond('fingerprint', 'matches', ['no-such-profile']))) }),
    ])
    expect(found(p, { zones }).map((d) => d.code)).toEqual(['PE134'])
  })

  it('finds no dangling zone or profile in any tenant fixture', () => {
    for (const depth of Object.keys(DEPTHS) as Depth[]) {
      const lib = { zones: zonesAt(depth), fingerprints: fingerprintsAt(depth) }
      for (const p of policiesAt(depth)) {
        const d = found(p, lib)
        expect(d, `${depth} · ${p.name}: ${JSON.stringify(d.map((x) => x.id))}`).toEqual([])
      }
    }
  })
})

describe('who', () => {
  it('is an error to write people or groups as a condition', () => {
    const p = policy([rule({ when: when(card(cond('group', 'in', ['finance']), cond('day', 'is', ['Monday']))) })])
    const d = diagnose(p, groups).find((x) => x.code === 'PE150')
    expect(d).toMatchObject({ severity: 'error', scope: 'rule', ruleIndex: 0, detail: 'Move people and groups to Who.' })
  })

  it('warns when the who names groups or people the policy does not govern', () => {
    const p = policy([rule({ who: { groupIds: ['contractors'], userIds: ['priya', 'mehak'] }, when: anySignIn() })], audienceOf(['finance']))
    const d = diagnose(p, groups).find((x) => x.code === 'PE151')
    expect(d?.severity).toBe('warning')
    expect(d?.detail).toContain('Contractors and Mehak Garg')
    expect(d?.detail).not.toContain('Priya')
  })

  it('says nothing about a who inside the audience, or a policy for everyone', () => {
    expect(diagnose(policy([rule({ who: fin, when: anySignIn() })], audienceOf(['finance'])), groups).map((d) => d.code)).not.toContain('PE151')
    expect(diagnose(policy([rule({ who: con, when: anySignIn() })]), groups).map((d) => d.code)).not.toContain('PE151')
  })

  it('warns about a group or person no longer in the directory', () => {
    const p = policy([rule({ who: { groupIds: ['gone-group'], userIds: [], exceptUserIds: ['gone-person'] }, when: anySignIn() })])
    expect(diagnose(p, groups).find((x) => x.code === 'PE152')?.title).toBe('2 in Who no longer exist')
  })

  it('is an error when every choice is also an exception', () => {
    const p = policy([rule({ who: { groupIds: ['finance'], userIds: [], exceptGroupIds: ['finance'] }, when: anySignIn() })])
    expect(diagnose(p, groups).find((x) => x.code === 'PE153')?.severity).toBe('error')
  })
})

describe('the system policy is left alone', () => {
  it('never warns about the global default, which is a deliberate catch-all', () => {
    const sys = policies.find((p) => p.isSystem)!
    expect(diagnose(sys, groups)).toHaveLength(0)
  })
})

describe('shadowedBy — the canvas beam', () => {
  it('names the rules a conditionless rule puts out of reach', () => {
    const p = policy([rule({ when: anySignIn() }), rule({}), rule({})])
    expect(shadowedBy(p, 0)).toEqual([1, 2])
  })

  it('returns nothing for a rule that has conditions — it may not match', () => {
    const p = policy([rule({ when: when(card(cond('day', 'is', ['Monday']))) }), rule({})])
    expect(shadowedBy(p, 0)).toEqual([])
  })

  it('dims every enabled rule below a catch-all, whatever they narrow to', () => {
    /* Was "only dims rules whose audience the shadowing rule actually covers".
       `audienceCovers` is deleted and the exemption with it: the rules below
       narrow with a who, and a catch-all above still matches first for every
       one of the people they were narrowing to. Both are dimmed, and that is
       the honest answer. */
    const p = policy([
      rule({ when: anySignIn() }),
      rule({ who: { groupIds: ['engineering'], userIds: [] }, when: anySignIn() }),
      rule({ who: fin, when: when(card(cond('day', 'is', ['Monday']))) }),
    ])
    expect(shadowedBy(p, 0)).toEqual([1, 2])
  })

  it('dims only the rules for the same people below a who with no conditions', () => {
    const p = policy([
      rule({ who: fin, when: anySignIn() }),
      rule({ who: con, when: anySignIn() }),
      rule({ who: fin, when: when(card(cond('day', 'is', ['Monday']))) }),
      rule({}),
    ])
    expect(shadowedBy(p, 0)).toEqual([2])
    const flagged = diagnose(p, groups).filter((d) => d.id.startsWith('unreachable')).map((d) => d.ruleIndex)
    expect(flagged).toEqual([2])
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

describe('rule names and outcome settings', () => {
  const codes = (p: Policy) => diagnose(p, groups, seedHooks).map((d) => d.code)

  it('flags a blank or whitespace-only rule name as PE105, an error', () => {
    const p = policy([rule({ name: '   ', when: when(card(cond('country', 'is', ['IN']))) })])
    const d = diagnose(p, groups).find((x) => x.code === 'PE105')
    expect(d).toMatchObject({ severity: 'error', scope: 'rule', ruleIndex: 0, title: 'Rule name is empty' })
    expect(codes(policy([rule({ name: 'Named', when: when(card(cond('country', 'is', ['IN']))) })]))).not.toContain('PE105')
  })

  it('flags a specific first factor with no method as PE123, and stays quiet once one is chosen', () => {
    const none = rule({ decision: '1fa', firstFactor: 'Specific', firstFactorMethod: undefined })
    expect(diagnose(policy([none]), groups).find((d) => d.code === 'PE123')).toMatchObject({
      severity: 'error',
      title: 'No first factor method chosen',
    })
    expect(codes(policy([{ ...none, firstFactorMethod: 'Email OTP' }]))).not.toContain('PE123')
    expect(codes(policy([{ ...none, decision: 'deny' }]))).not.toContain('PE123')
  })

  it('checks the terminal rule’s outcome too, as a policy-wide finding', () => {
    const p: Policy = {
      ...policy([rule({ when: when(card(cond('country', 'is', ['IN']))) })]),
      fallback: rule({ name: 'Nothing else matched', decision: '2fa', secondFactor: 'specific', secondFactorMethods: [] }),
    }
    const d = diagnose(p, groups).find((x) => x.code === 'PE122')
    expect(d).toMatchObject({ severity: 'error', scope: 'policy', ruleIndex: -1 })
    expect(d?.title).toBe('Nothing else matched: no second factor chosen')
  })

  it('says nothing about a terminal rule whose outcome is sound', () => {
    const p: Policy = { ...policy([rule({ when: when(card(cond('country', 'is', ['IN']))) })]), fallback: rule({ decision: 'deny' }) }
    expect(diagnose(p, groups).filter((d) => d.ruleIndex === -1)).toHaveLength(0)
  })
})

describe('hooks that cannot answer a sign-in', () => {
  it('flags a condition calling an attribute-sync hook as PE136', () => {
    const p = policy([rule({ when: when(card(cond('webhook', 'returns true', ['hk-hrms']))) })])
    const d = diagnose(p, groups, seedHooks).filter((x) => x.code === 'PE136')
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ severity: 'error', ruleIndex: 0 })
  })

  it('stays quiet for a sync hook', () => {
    const p = policy([rule({ when: when(card(cond('webhook', 'returns true', ['hk-fraud']))) })])
    expect(diagnose(p, groups, seedHooks).map((d) => d.code)).not.toContain('PE136')
  })
})
