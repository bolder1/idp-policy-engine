import { describe, expect, it } from 'vitest'

import { card, cond, emptyGroup, when, type Predicate } from './data'
import { cardJoin, ckey, drawsAsBracket, outerJoin, sig, topJoin } from './predicate'
import {
  addBranch,
  addCondition,
  branchOf,
  flipBranchJoin,
  flipTrunkJoin,
  mergeBranches,
  moveBranch,
  moveCondition,
  removeBranch,
  removeCondition,
  renameBranch,
  retypeCondition,
  setGrouped,
  setOuterJoin,
  setScope,
  splitOut,
} from './when-ops'

/* -----------------------------------------------------------------------------
   The one writer, and the two bugs it exists to make unspellable.

   Both were live, and both were silent: an edit through the trail dropped the
   trunk joiner, and an edit through either surface could delete a group the
   author had deliberately made. Neither produced an error, a diff or an undo
   entry naming what was lost — which is why most of what is asserted here is
   about what an operation LEAVES ALONE.
   -------------------------------------------------------------------------- */

const A = cond('zone', 'in zone', ['a'])
const B = cond('zone', 'in zone', ['b'])
const C = cond('day', 'is', ['Monday'])

describe('nothing drops the joiners', () => {
  /* The trail wrote `{ cards: next }` on every edit. Every operation in this
     module is checked against that, because the fix is only worth as much as
     its least careful function. */
  it('keeps a trunk joiner through every operation', () => {
    const w: Predicate = { join: 'and', cards: [card(A, B), card(C)] }
    const k0 = w.cards[0].id
    const ops: Predicate[] = [
      addCondition(w, k0, cond('day', 'is', ['Tuesday'])),
      removeCondition(w, A.id),
      moveCondition(w, C.id, k0, 0),
      splitOut(w, A.id),
      addBranch(w),
      removeBranch(w, w.cards[1].id),
      moveBranch(w, 0, 1),
      mergeBranches(w, w.cards[1].id, k0),
      renameBranch(w, k0, 'Corp'),
      setGrouped(w, k0, true),
      flipBranchJoin(w, k0),
      retypeCondition(w, A.id, 'country', 'is'),
    ]
    for (const next of ops) expect(topJoin(next)).toBe('and')
  })

  it('keeps a branch joiner when a condition is added to it', () => {
    const k = { ...card(A, B), join: 'or' as const }
    const w = when(k)
    expect(cardJoin(addCondition(w, k.id, C).cards[0])).toBe('or')
  })
})

describe('an emptied branch', () => {
  it('goes when nobody made it', () => {
    const w = when(card(A), card(B))
    expect(removeCondition(w, A.id).cards).toHaveLength(1)
  })

  /* A group is a bracket somebody asked for. Clearing it out to refill it must
     not delete it under them — there is no way back but starting again. */
  it('stays, empty, when somebody did', () => {
    const g = { ...emptyGroup(), conditions: [A] }
    const w = when(g, card(B))
    const next = removeCondition(w, A.id)
    expect(next.cards).toHaveLength(2)
    expect(next.cards[0].conditions).toHaveLength(0)
    expect(next.cards[0].grouped).toBe(true)
  })
})

describe('moving a condition', () => {
  it('reads the index as a slot in the resulting branch, not the one you dragged from', () => {
    const k = card(A, B, C)
    const w = when(k)
    /* A to the end. `at` counts in the list as it will be — [B, C] — which is
       the same convention the rule chain's reorder already produces. */
    expect(moveCondition(w, A.id, k.id, 2).cards[0].conditions.map((c) => c.id)).toEqual([B.id, C.id, A.id])
    expect(moveCondition(w, A.id, k.id, 1).cards[0].conditions.map((c) => c.id)).toEqual([B.id, A.id, C.id])
    expect(moveCondition(w, C.id, k.id, 0).cards[0].conditions.map((c) => c.id)).toEqual([C.id, A.id, B.id])
  })

  it('does not strand a condition when its source branch went with it', () => {
    const src = card(A)
    const dst = card(B)
    const w = when(src, dst)
    const next = moveCondition(w, A.id, dst.id, 1)
    expect(next.cards).toHaveLength(1)
    expect(next.cards[0].conditions.map((c) => c.id)).toEqual([B.id, A.id])
  })
})

describe('splitting out', () => {
  it('carries the source branch joiner to the new one', () => {
    const k = { ...card(A, B), join: 'or' as const }
    const next = splitOut(when(k), A.id)
    expect(next.cards).toHaveLength(2)
    /* Splitting an or-run into two and getting two and-runs is a different
       rule, and nothing on screen would have said so. */
    expect(cardJoin(next.cards[1])).toBe('or')
  })

  /* The shipped counter-example: the old editor offered this on a row that was
     already alone, and the handler silently refused. A gesture that highlights
     and then does nothing teaches people the editor is broken. */
  it('refuses when the condition is already alone, without changing anything', () => {
    const w = when(card(A))
    expect(splitOut(w, A.id)).toBe(w)
  })
})

describe('merging branches', () => {
  it('drops what the destination already requires', () => {
    /* Two ids, one identity — exactly the seeded finance rule, which names the
       same group in both of its branches. */
    const dupe = cond('zone', 'in zone', ['a'])
    const w = when(card(A, B), card(dupe, C))
    const next = mergeBranches(w, w.cards[1].id, w.cards[0].id)
    expect(next.cards).toHaveLength(1)
    expect(next.cards[0].conditions.map((c) => c.typeId + c.values.join())).toEqual(['zonea', 'zoneb', 'dayMonday'])
  })

  it('keeps the joiner of the branch being merged into', () => {
    const dst = { ...card(A), join: 'or' as const }
    const w = when(dst, card(B))
    expect(cardJoin(mergeBranches(w, w.cards[1].id, dst.id).cards[0])).toBe('or')
  })
})

/* -----------------------------------------------------------------------------
   The stringify hazard.

   Every dirty check in this app is a `JSON.stringify` comparison, not a `sig`
   comparison. So a field materialised at its own default MEANS the same, SIGNS
   the same, and STRINGIFIES differently — which lights the save bar on a policy
   nobody changed. Flipping a joiner there and back has to be a round trip.
   -------------------------------------------------------------------------- */
describe('a setting returned to its default leaves no trace', () => {
  it('round-trips the trunk joiner', () => {
    const w = when(card(A), card(B))
    const there = flipTrunkJoin(w)
    expect(topJoin(there)).toBe('and')
    const back = flipTrunkJoin(there)
    expect(JSON.stringify(back)).toBe(JSON.stringify(w))
  })

  it('round-trips a branch joiner', () => {
    const w = when(card(A, B))
    const back = flipBranchJoin(flipBranchJoin(w, w.cards[0].id), w.cards[0].id)
    expect(JSON.stringify(back)).toBe(JSON.stringify(w))
  })

  it('round-trips a label typed and cleared', () => {
    const w = when(card(A))
    const back = renameBranch(renameBranch(w, w.cards[0].id, 'Corp'), w.cards[0].id, '   ')
    expect(JSON.stringify(back)).toBe(JSON.stringify(w))
  })

  it('round-trips grouped', () => {
    const w = when(card(A))
    const back = setGrouped(setGrouped(w, w.cards[0].id, true), w.cards[0].id, false)
    expect(JSON.stringify(back)).toBe(JSON.stringify(w))
  })

  it('round-trips a zone scope narrowed and widened again', () => {
    const z = cond('zone', 'in zone', ['office'])
    const w = when(card(z))
    const back = setScope(setScope(w, z.id, 'ip'), z.id, 'both')
    expect(JSON.stringify(back)).toBe(JSON.stringify(w))
  })
})

describe('a zone condition can name the half of the zone it means', () => {
  it('stores the narrowed half and drops the field for both', () => {
    const z = cond('zone', 'in zone', ['office'])
    const w = when(card(z))
    expect(setScope(w, z.id, 'location').cards[0].conditions[0].scope).toBe('location')
    expect('scope' in setScope(setScope(w, z.id, 'location'), z.id, 'both').cards[0].conditions[0]).toBe(false)
  })

  /* The two are different questions with different answers — on the network, or
     on the map — so every reader that keys through `ckey` has to tell them
     apart: the duplicate-rule blocker, the two merges that DROP what they
     consider a twin, and the change list. */
  it('keys two halves of one zone as two different conditions', () => {
    const w = when(card(cond('zone', 'in zone', ['office'])))
    const id = w.cards[0].conditions[0].id
    const byIp = setScope(w, id, 'ip').cards[0].conditions[0]
    const byPlace = setScope(w, id, 'location').cards[0].conditions[0]
    expect(ckey(byIp)).not.toBe(ckey(byPlace))
    expect(ckey(byIp)).not.toBe(ckey(w.cards[0].conditions[0]))
  })

  /* An unscoped condition has to key to the byte-identical string it keyed to
     before the field existed, or every signature in the seeded estate moves and
     the stale-estimate check reports the whole tenant as edited. */
  it('leaves an unscoped condition keying exactly as it always did', () => {
    expect(ckey(cond('group', 'in', ['b', 'a']))).toBe('group|in|a,b|')
  })
})

describe('changing what a condition checks', () => {
  /* Carrying the old operator over produces a condition naming an operator its
     type does not have — which the linter cannot describe and the evaluator
     reads as never matching. */
  it('resets the operator and the values with the type', () => {
    const w = when(card(A))
    const next = retypeCondition(w, A.id, 'country', 'is')
    /* `toEqual`, not `toMatchObject`. A subset assertion passes on a condition
       carrying a field the new type has no idea what to do with, which is
       exactly the bug below — so the assertion that was meant to catch it
       could not. */
    expect(next.cards[0].conditions[0]).toEqual({ id: A.id, typeId: 'country', operator: 'is', values: [] })
  })

  /* `scope` belongs to a zone and nothing else. Left behind on a retyped
     condition it is invisible on screen and still reaches `ckey`, which can
     split two identical Country conditions into two different rules for the
     linter. */
  it('drops a zone scope when the condition becomes something else', () => {
    const z = cond('zone', 'in zone', ['office'])
    const w = setScope(when(card(z)), z.id, 'ip')
    expect('scope' in retypeCondition(w, z.id, 'country', 'is').cards[0].conditions[0]).toBe(false)
  })
})

describe('branchOf', () => {
  it('finds the branch holding a condition, and nothing for one that is gone', () => {
    const w = when(card(A), card(B))
    expect(branchOf(w, B.id)?.id).toBe(w.cards[1].id)
    expect(branchOf(w, 'nope')).toBeUndefined()
  })
})

describe('the meaning survives a regrouping that changes the shape', () => {
  /* `sig` is the audit primitive, and a split genuinely changes the rule — the
     leaves are the same but the grouping is not. It must say so, or the change
     list cannot name what happened. */
  it('signs a split differently from what it split', () => {
    const w = when(card(A, B))
    expect(sig(splitOut(w, A.id))).not.toBe(sig(w))
  })
})

/* -----------------------------------------------------------------------------
   One bracket, one operator.

   A rule reads as a single bracket — `A · B · C · (group) · D` — with one
   and/or over every member of it and a group carrying its own operator inside.
   The model spends two fields saying that, and the entire risk in this design is
   that the two come apart: the trunk saying OR while the run beside it says AND
   means the pane draws one operator and the evaluator applies another.

   These pin the read (`outerJoin`), the write (`setOuterJoin`) and the one case
   where the flat drawing would be a lie (`drawsAsBracket`).
   -------------------------------------------------------------------------- */

const D = cond('fingerprint', 'matches', ['fp-corp'])

describe('outerJoin — the operator a person actually sees', () => {
  it("is the run's own joiner while the run is all there is", () => {
    expect(outerJoin(when(card(A, B)))).toBe('and')
    expect(outerJoin({ cards: [{ ...card(A, B), join: 'or' }] })).toBe('or')
  })

  /* The trunk takes over the moment there is more than one card, because that
     is the field that joins them. The run's joiner is then the operator INSIDE
     one member, which is a different question. */
  it('is the trunk once a group is beside the run', () => {
    const w: Predicate = { join: 'and', cards: [card(A, B), { ...emptyGroup(), conditions: [C] }] }
    expect(outerJoin(w)).toBe('and')
    expect(cardJoin(w.cards[1])).toBe('and')
  })
})

describe('setOuterJoin — both levels, or the two come apart', () => {
  it('writes the run and the trunk together', () => {
    const w = setOuterJoin(when(card(A, B), { ...emptyGroup(), conditions: [C] }), 'and')
    expect(topJoin(w)).toBe('and')
    expect(cardJoin(w.cards[0])).toBe('and')
    expect(outerJoin(w)).toBe('and')

    const or = setOuterJoin(w, 'or')
    expect(topJoin(or)).toBe('or')
    expect(cardJoin(or.cards[0])).toBe('or')
    expect(outerJoin(or)).toBe('or')
  })

  /* The reason every other joiner writer in this file deletes at the default:
     each dirty check in the app is a `JSON.stringify` comparison, so a field
     materialised at its own default lights the save bar on a rule that means
     exactly what it did before. */
  it('round-trips to the identical object on a lone run', () => {
    const w = when(card(A, B))
    expect(setOuterJoin(setOuterJoin(w, 'or'), 'and')).toEqual(w)
  })

  it('round-trips to the identical object with a group beside the run', () => {
    /* From a predicate already in lockstep, which is every predicate this
       editor authors. `when(card(A, B), group)` raw is NOT one — the trunk
       defaults to OR while the run beside it defaults to AND — so the first
       write there normalises rather than round-trips, which the next test is
       about. */
    const w = setOuterJoin(when(card(A, B), { ...emptyGroup(), conditions: [C] }), 'and')
    expect(setOuterJoin(setOuterJoin(w, 'or'), 'and')).toEqual(w)
  })

  /* A shape from before the editor drew one bracket: `(A ∧ B) ∨ (group)`, where
     the two levels genuinely disagree. Setting the outer operator writes the
     trunk and leaves the run alone, because a run whose joiner disagrees is
     drawn as its own bracket and the outer control does not reach into a
     bracket. The rule keeps meaning what it meant. */
  it('leaves a disagreeing run alone and writes only the trunk', () => {
    const w = when(card(A, B), { ...emptyGroup(), conditions: [C] })
    const next = setOuterJoin(w, 'and')
    expect(next.cards[0].join).toBeUndefined()
    expect(cardJoin(next.cards[0])).toBe('and')
    expect(topJoin(next)).toBe('and')
  })

  /* A run of one has no gap to join, and a lone card's operator is already the
     one on screen. Writing either would be a second copy of a setting that has
     one place to live. */
  it('leaves a joiner off a run with nothing to join', () => {
    const w = setOuterJoin(when(card(A), { ...emptyGroup(), conditions: [C] }), 'or')
    expect(w.cards[0].join).toBeUndefined()
  })

  it('leaves the trunk off a predicate with one card', () => {
    expect(setOuterJoin(when(card(A, B)), 'and').join).toBeUndefined()
  })

  /* A group is ONE member of the outer bracket however many conditions are in
     it. The outer operator says how the members join; what happens inside the
     frame is the group's own business, and flipping the outer one must not
     reach in and rewrite it. */
  it("does not touch a group's own operator", () => {
    const group = { ...emptyGroup(), join: 'or' as const, conditions: [C, D] }
    const w = setOuterJoin(when(card(A, B), group), 'and')
    expect(cardJoin(w.cards[1])).toBe('or')
  })

  it('is what keeps the operator on screen when a group arrives beside a run', () => {
    /* `A and B`, then "Add group". The trunk defaults to OR, so without the
       lockstep the AND a person was looking at becomes an OR they did not
       choose — which is the bug this whole pairing exists to prevent. */
    const before = when(card(A, B))
    const after = setOuterJoin(addBranch(before), outerJoin(before))
    expect(outerJoin(after)).toBe('and')
    expect(topJoin(after)).toBe('and')
  })
})

describe('drawsAsBracket — when a flat drawing would be a lie', () => {
  it('brackets a group, and nothing else the editor authors', () => {
    const w = setOuterJoin(when(card(A, B), { ...emptyGroup(), conditions: [C] }), 'and')
    expect(drawsAsBracket(w, w.cards[0])).toBe(false)
    expect(drawsAsBracket(w, w.cards[1])).toBe(true)
  })

  /* Two ungrouped runs of ANDs under an OR trunk is what "alternatives" meant
     before the editor said `grouped` out loud, and rules were authored that way
     — `(A ∧ B) ∨ (C ∧ D)` cannot be drawn as one flat bracket without changing
     what it says, so each run keeps a frame of its own. */
  it('brackets a legacy run whose joiner disagrees with the trunk', () => {
    const w = when(card(A, B), card(C, D))
    expect(outerJoin(w)).toBe('or')
    expect(drawsAsBracket(w, w.cards[0])).toBe(true)
    expect(drawsAsBracket(w, w.cards[1])).toBe(true)
  })

  it('draws a run of one flat whatever the trunk says', () => {
    const w = when(card(A), card(B))
    expect(drawsAsBracket(w, w.cards[0])).toBe(false)
  })
})
