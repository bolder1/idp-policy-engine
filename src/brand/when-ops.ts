import { cond, emptyGroup, type Condition, type ConditionCard, type Predicate } from './data'
import { cardJoin, ckey, topJoin } from './predicate'

/* -----------------------------------------------------------------------------
   Every edit a person can make to a rule's WHEN, in one place.

   Two editors write this model — the trail's inline form and the canvas — and
   until now each carried its own copy of these operations. They had already
   drifted, in the way that costs data rather than tidiness:

   - The trail wrote `onPatch({ when: { cards: next } })`, which drops
     `when.join`, so a predicate whose branches were ANDed silently reverted to
     OR the moment anybody touched a condition there. The board carried the
     identical line with the fix and a note explaining it; the trail did not.
   - The trail deleted any branch that lost its last condition. The board kept a
     `grouped` one, because a group is a bracket somebody asked for — so a group
     made on one surface vanished on the first edit made on the other.

   Both are fixed at the source now, and the shape of this module is what stops
   them coming back: **every function takes a `Predicate` and returns a
   `Predicate`.** Never a `ConditionCard[]`. The dropped joiner was possible
   only because the unit of exchange was the array, which cannot carry the
   trunk's own setting — so the type makes the bug unspellable rather than
   asking the next writer to remember it.

   Nothing here is aware of a canvas, a form, a selection or a draft. They are
   pure, which is why they can be tested without a DOM in a project whose only
   dev dependency is vitest.
   -------------------------------------------------------------------------- */

export type BranchId = string

/* The one place a predicate is rebuilt.

   `...w` rather than `{ cards }`, every time, so a field added to `Predicate`
   later survives every operation in this file without each one being revisited.
   That is exactly the failure this module exists to prevent, so it does not get
   to happen here. */
const withCards = (w: Predicate, cards: ConditionCard[]): Predicate => ({ ...w, cards })

const mapBranch = (w: Predicate, id: BranchId, f: (k: ConditionCard) => ConditionCard): Predicate =>
  withCards(
    w,
    w.cards.map((k) => (k.id === id ? f(k) : k)),
  )

/** The branch holding a condition, or undefined when it holds none. */
export const branchOf = (w: Predicate, conditionId: string) =>
  w.cards.find((k) => k.conditions.some((c) => c.id === conditionId))

/* --- Conditions --------------------------------------------------------------- */

/* Add a condition. `'new'` starts a branch for it.

   Appended by default, because the only position a caller has not expressed an
   opinion about is the end — and inside a branch every position means the same
   thing anyway, since a branch is one joiner applied to all of its members. */
export function addCondition(w: Predicate, target: BranchId | 'new', c: Condition, at?: number): Predicate {
  if (target === 'new') return withCards(w, [...w.cards, { ...emptyGroup(), grouped: false, conditions: [c] }])
  return mapBranch(w, target, (k) => {
    const next = [...k.conditions]
    next.splice(at ?? next.length, 0, c)
    return { ...k, conditions: next }
  })
}

/* Remove a condition, and decide what happens to a branch it empties.

   The three-way rule, carried over verbatim from the editor that got it right:
   a branch that still holds something stays; an empty branch somebody MADE
   stays and says it is empty; an empty branch nobody made goes.

   The middle case is the one that reads like a bug and is not. A group is a
   bracket an author asked for, so clearing it out to refill it must not delete
   it under them — there would be no way back except starting again. A loose run
   is not something anybody made; it is where ungrouped conditions live, so an
   empty one has nothing left to represent. */
export function removeCondition(w: Predicate, conditionId: string): Predicate {
  return withCards(
    w,
    w.cards.flatMap((k) => {
      if (!k.conditions.some((c) => c.id === conditionId)) return [k]
      const conditions = k.conditions.filter((c) => c.id !== conditionId)
      if (conditions.length > 0) return [{ ...k, conditions }]
      return k.grouped ? [{ ...k, conditions }] : []
    }),
  )
}

export function patchCondition(w: Predicate, conditionId: string, next: Partial<Condition>): Predicate {
  return withCards(
    w,
    w.cards.map((k) => ({
      ...k,
      conditions: k.conditions.map((c) => (c.id === conditionId ? { ...c, ...next } : c)),
    })),
  )
}

/* Change what a condition CHECKS, which is not the same as patching it.

   A new attribute brings its own operators and its own kind of value, so
   carrying the old ones over produces a condition that names an operator its
   type does not have — which the linter cannot describe and the evaluator reads
   as never matching. The operator resets to the type's first and the values are
   dropped, which lands the row in the unset state the catalogue already treats
   as first-class and diagnosable. */
export function retypeCondition(w: Predicate, conditionId: string, typeId: string, firstOperator: string): Predicate {
  return patchCondition(w, conditionId, { typeId, operator: firstOperator, values: [] })
}

/* Move a condition into a branch at an index.

   Removing first and inserting second, through the two functions above, so the
   branch-emptying rule applies to the source exactly as it would if the
   condition had simply been deleted — including a loose source branch
   disappearing when its last member leaves. Doing it in one pass is how a move
   quietly grows a second, subtly different copy of that rule. */
export function moveCondition(w: Predicate, conditionId: string, toBranch: BranchId, at: number): Predicate {
  const c = w.cards.flatMap((k) => k.conditions).find((x) => x.id === conditionId)
  if (!c) return w
  /* `at` is the index in the branch AS IT WILL BE — the destination slot in the
     resulting list, not a position in the list you were looking at when you
     let go. That is the convention the chain's own reorder already uses: it
     measures against the other cards' midpoints and skips the dragged one, so
     what it produces is a final index. Two conventions for "where it goes"
     inside one codebase is how a drag ends up one slot short of the gap it was
     dropped into, and only when moving downwards. */
  const without = removeCondition(w, conditionId)
  const target = at
  /* The source may have gone with its last condition. Landing in a branch that
     no longer exists would silently drop the condition, so it starts a new one. */
  return without.cards.some((k) => k.id === toBranch)
    ? addCondition(without, toBranch, c, target)
    : addCondition(without, 'new', c)
}

/** Move a condition out into a branch of its own, at the end of the trunk. */
export function splitOut(w: Predicate, conditionId: string): Predicate {
  const from = branchOf(w, conditionId)
  const c = from?.conditions.find((x) => x.id === conditionId)
  if (!from || !c) return w
  /* Nothing to split when it is already alone: the result would be the same
     predicate with a different branch id, which reads as an edit and is not
     one. The canvas never offers the gesture in this case, and this is the
     second half of that — the affordance and the handler agreeing. */
  if (from.conditions.length < 2) return w
  const without = removeCondition(w, conditionId)
  /* The source branch's joiner travels to the new one. Splitting an OR-run into
     two produced two AND-runs without it, which is a different rule. */
  return withCards(without, [...without.cards, { ...emptyGroup(), grouped: from.grouped, join: from.join, conditions: [c] }])
}

/* --- Branches ----------------------------------------------------------------- */

/* An empty frame, and nothing else.

   "Add group" used to open the attribute picker and build the branch around
   whatever was chosen, which made it the same gesture as "Add condition" with a
   different label — and it dropped you into choosing an attribute when what you
   asked for was a bracket. The bracket appears; the next move is yours. */
export function addBranch(w: Predicate, at?: number): Predicate {
  const cards = [...w.cards]
  cards.splice(at ?? cards.length, 0, emptyGroup())
  return withCards(w, cards)
}

export function removeBranch(w: Predicate, branchId: BranchId): Predicate {
  return withCards(w, w.cards.filter((k) => k.id !== branchId))
}

export function moveBranch(w: Predicate, from: number, to: number): Predicate {
  if (from === to || from < 0 || from >= w.cards.length || to < 0 || to >= w.cards.length) return w
  const cards = [...w.cards]
  const [k] = cards.splice(from, 1)
  cards.splice(to, 0, k)
  return withCards(w, cards)
}

/* Fold one branch's conditions into another, and drop the ones already there.

   De-duplicated on `ckey` rather than on id, because the same check written
   twice in two branches is two ids and one condition — the seeded finance rule
   holds `group in finance` in both of its branches — and merging them should
   leave one, not a branch that requires the same thing of somebody twice.

   The absorbing branch's joiner is the one that survives. Two runs being merged
   cannot both keep theirs, and the one being merged INTO is the one whose shape
   the author is choosing to keep. */
export function mergeBranches(w: Predicate, from: BranchId, into: BranchId): Predicate {
  if (from === into) return w
  const src = w.cards.find((k) => k.id === from)
  const dst = w.cards.find((k) => k.id === into)
  if (!src || !dst) return w
  const have = new Set(dst.conditions.map(ckey))
  const add = src.conditions.filter((c) => !have.has(ckey(c)))
  return withCards(
    w,
    w.cards.flatMap((k) => {
      if (k.id === from) return []
      if (k.id === into) return [{ ...k, conditions: [...k.conditions, ...add] }]
      return [k]
    }),
  )
}

/* A name the author gave this branch, or none.

   Written as absent rather than as an empty string. `cardName` falls back to
   the letter when the label is missing OR blank, but a stored `''` still
   stringifies differently from no field at all — and every dirty check in this
   app is a `JSON.stringify` comparison, so an empty label typed and deleted
   would leave the save bar lit on a predicate that means exactly what it did. */
export function renameBranch(w: Predicate, branchId: BranchId, label: string): Predicate {
  const trimmed = label.trim()
  return mapBranch(w, branchId, (k) => {
    const next = { ...k }
    if (trimmed) next.label = trimmed
    else delete next.label
    return next
  })
}

/* Whether the branch draws as a bracket. Presentation only — nothing in the
   evaluator, the linter or the simulator reads it — but it decides whether an
   emptied branch survives, which is why it is written the same careful way as
   the label rather than materialised as `false`. */
export function setGrouped(w: Predicate, branchId: BranchId, grouped: boolean): Predicate {
  return mapBranch(w, branchId, (k) => {
    const next = { ...k }
    if (grouped) next.grouped = true
    else delete next.grouped
    return next
  })
}

/* --- Joiners ------------------------------------------------------------------

   One joiner per level, and flipping it flips the level. Not one per gap: a
   level holds ONE joiner, so mixed precedence inside a run cannot be expressed
   and nobody has to work out whether `A and B or C` binds the and or the or
   first.

   Both are written only when they differ from the model's default, for the
   stringify reason above: materialising `join: 'and'` on a branch that never
   had one means the same, signs the same, and stringifies differently — which
   would light the save bar on every untouched policy in the estate merely by
   opening a rule and flipping something back. */
export function flipBranchJoin(w: Predicate, branchId: BranchId): Predicate {
  return mapBranch(w, branchId, (k) => {
    const next = { ...k }
    if (cardJoin(k) === 'and') next.join = 'or'
    else delete next.join
    return next
  })
}

export function flipTrunkJoin(w: Predicate): Predicate {
  const next = { ...w }
  if (topJoin(w) === 'or') next.join = 'and'
  else delete next.join
  return next
}

/** A fresh, unset condition of a type — what every "add" route inserts. */
export const freshCondition = (typeId: string, firstOperator: string) => cond(typeId, firstOperator, [])
