import { describe, expect, it } from 'vitest'

import {
  CONDITION_CATALOGUE,
  UNKNOWN_CONDITION,
  WHEN_CONDITIONS,
  conditionType,
  isOfferable,
  policies,
  scenarios,
  zones,
  type Condition,
  type Rule,
} from './data'
import { WHO_TYPES } from './audience-ops'
import { seedProfiles } from './fingerprint'
import { leaves } from './predicate'
import { DECK } from './screens/gauntlet'

/* -----------------------------------------------------------------------------
   The catalogue is a closed set, and nothing here can check that but a test.

   `Condition.typeId` is a `string`. It has to be: `gauntlet.ts` builds
   conditions from hand-written specs, `fixtures.ts` clones policies
   structurally, and narrowing the field to a union costs more than it buys. The
   consequence is that deleting an attribute from `CONDITION_CATALOGUE` is
   INVISIBLE to `tsc` — every `cond('mdm', …)` in the seed keeps compiling and
   starts meaning nothing.

   That is not a hypothetical. When this catalogue was cut from twenty-four
   attributes to six, the fallback in `conditionType` was
   `?? CONDITION_CATALOGUE[0]` and [0] became `zone` — so every orphaned
   condition was resolved as a zone condition, evaluated against the zone pools,
   and returned FAIL with the sentence "this sign-in is in another zone". A
   wrong verdict, with a confident explanation, in the trace and the gauntlet
   grade and the impact sweep. The sentinel below is the fix; this file is what
   would have caught it a step earlier.
   -------------------------------------------------------------------------- */

const rulesOf = (p: { rules: Rule[]; fallback?: Rule }) => [...p.rules, ...(p.fallback ? [p.fallback] : [])]

/** Every condition anywhere in the seeded estate, with somewhere to point at. */
function everyCondition(): { where: string; c: Condition }[] {
  const out: { where: string; c: Condition }[] = []

  for (const p of policies) {
    for (const r of rulesOf(p)) {
      for (const c of leaves(r.when)) out.push({ where: `${p.id} / ${r.name}`, c })
    }
  }

  /* Templates hold their rules behind a `build()` thunk, which is exactly why
     they need checking here: a stale id inside one throws or misfires at the
     moment somebody clicks the template, which a build and a smoke test both
     pass. */
  for (const s of scenarios) {
    for (const r of s.rules) {
      if (!r.build) continue
      for (const c of leaves(r.build().when)) out.push({ where: `template ${s.id} / ${r.name}`, c })
    }
  }

  /* The gauntlet's repairs. A stale id here offers an administrator a one-click
     fix that cannot work, previewed by the same evaluator that cannot decide
     it. */
  for (const card of DECK) {
    if (!card.fix) continue
    for (const c of card.fix.conditions) {
      out.push({ where: `gauntlet ${card.id} fix`, c: { id: card.id, ...c } as Condition })
    }
  }

  return out
}

describe('the condition catalogue', () => {
  it('offers exactly the attributes the When panel is meant to offer', () => {
    expect(WHEN_CONDITIONS.map((c) => c.id)).toEqual([
      'zone',
      'time',
      'day',
      'fingerprint',
      'device-risk',
      'ml-risk',
    ])
    expect(WHEN_CONDITIONS.filter(isOfferable).map((c) => c.id)).toEqual([
      'zone',
      'time',
      'day',
      'fingerprint',
      'device-risk',
    ])
  })

  /* The assertion that would have caught the fallback hazard.

     `group` and `user` have to be IN the catalogue — `conditionType('group')`
     is how every surface that draws an audience gets its label — and they have
     to be OUT of the When list, because who a rule is for is asked once on its
     own step. Two requirements that pull in opposite directions, which is
     precisely the kind of pair that gets half-implemented. */
  it('holds the Who step’s vocabulary without offering it beside the circumstances', () => {
    for (const t of WHO_TYPES) {
      expect(CONDITION_CATALOGUE.some((c) => c.id === t), `${t} must resolve`).toBe(true)
      expect(WHEN_CONDITIONS.some((c) => c.id === t), `${t} must not be offered`).toBe(false)
    }
    // And between them they account for the whole catalogue: nothing is in it
    // for no reason, and nothing has been quietly orphaned.
    const accounted = new Set([...WHEN_CONDITIONS.map((c) => c.id), ...WHO_TYPES])
    expect(CONDITION_CATALOGUE.filter((c) => !accounted.has(c.id))).toEqual([])
  })

  it('resolves an id it does not know to a sentinel, never to the first row', () => {
    expect(conditionType('mdm')).toBe(UNKNOWN_CONDITION)
    expect(conditionType('mdm').id).not.toBe(CONDITION_CATALOGUE[0].id)
    // Nothing can be authored against it, which is what keeps it from looking
    // like a working attribute on any surface that renders operators.
    expect(UNKNOWN_CONDITION.operators).toEqual([])
  })
})

describe('the seeded estate', () => {
  it('names no attribute that has been deleted from the catalogue', () => {
    const stale = everyCondition()
      .filter(({ c }) => !CONDITION_CATALOGUE.some((t) => t.id === c.typeId))
      .map(({ where, c }) => `${where}: ${c.typeId}`)
    expect(stale).toEqual([])
  })

  /* `soon` rows are listed so the shape of the product is visible. A seeded
     policy using one would be a policy nobody can edit — the row it needs is
     disabled in every picker. */
  it('never authors a condition the pickers refuse to offer', () => {
    const unofferable = everyCondition()
      .filter(({ c }) => {
        const t = conditionType(c.typeId)
        // `group` and `user` are legitimate inside a rule — that is what the Who
        // step writes — so only `soon` is the fault here.
        return t.soon
      })
      .map(({ where, c }) => `${where}: ${c.typeId}`)
    expect(unofferable).toEqual([])
  })

  it('uses an operator the attribute actually lists', () => {
    const wrong = everyCondition()
      .filter(({ c }) => {
        const t = conditionType(c.typeId)
        return t.operators.length > 0 && !t.operators.includes(c.operator)
      })
      .map(({ where, c }) => `${where}: ${c.typeId} “${c.operator}”`)
    expect(wrong).toEqual([])
  })

  /* The reference check, and it matters more than it used to.

     A zone is now the ONLY way to say anything about a network or a place, and
     a device profile the only way to say anything about a device — so a rule
     naming one that does not exist has no fallback and no second opinion. It
     simply never matches, and nothing on any screen says why. There was exactly
     one of these in the seed before this check existed (`in zone ['japan']`
     against a zone that had never been written), and it had been there long
     enough to acquire a comment. */
  it('names only zones and device profiles that exist', () => {
    const dangling = everyCondition()
      .flatMap(({ where, c }) => {
        const kind = conditionType(c.typeId).valueKind
        if (kind !== 'zone' && kind !== 'fingerprint') return []
        const library = kind === 'zone' ? zones.map((z) => z.id) : seedProfiles.map((p) => p.id)
        return c.values.filter((v) => !library.includes(v)).map((v) => `${where}: ${kind} “${v}”`)
      })
    expect(dangling).toEqual([])
  })
})
