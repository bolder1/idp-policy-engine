import { describe, expect, it } from 'vitest'

import { card, cond, emptyGroup, when, type Predicate } from './data'
import { cardJoin, ckey, sig, topJoin } from './predicate'
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
const C = cond('country', 'is', ['India'])

describe('nothing drops the joiners', () => {
  /* The trail wrote `{ cards: next }` on every edit. Every operation in this
     module is checked against that, because the fix is only worth as much as
     its least careful function. */
  it('keeps a trunk joiner through every operation', () => {
    const w: Predicate = { join: 'and', cards: [card(A, B), card(C)] }
    const k0 = w.cards[0].id
    const ops: Predicate[] = [
      addCondition(w, k0, cond('country', 'is', ['Germany'])),
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
    expect(next.cards[0].conditions.map((c) => c.typeId + c.values.join())).toEqual(['zonea', 'zoneb', 'countryIndia'])
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
