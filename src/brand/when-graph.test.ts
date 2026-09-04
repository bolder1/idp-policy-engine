import { describe, expect, it } from 'vitest'

import { card, cond, emptyGroup, policies, when, type Predicate } from './data'
import { ckey } from './predicate'
import { branchOfNode, canDrop, layout, nodeCount, toGraph, trunkSays } from './when-graph'

/* -----------------------------------------------------------------------------
   The read projection.

   Two things are worth asserting here and neither is "it renders". The first is
   that the projection is COMPLETE — a canvas that quietly cannot see
   `when.join`, `grouped` or a label would draw a rule that is not the rule. The
   second is that a third level is unreachable through every gesture that could
   reach for one.
   -------------------------------------------------------------------------- */

const A = cond('zone', 'in zone', ['office'])
const B = cond('country', 'is', ['India'])
const C = cond('device-type', 'is', ['Mobile'])

describe('the projection sees everything the model holds', () => {
  it('reads both joiners rather than assuming either', () => {
    /* AND-of-ORs — the shape the old flat model could not express, and the one
       a canvas that assumes "OR between boxes" would draw as a lie. */
    const w: Predicate = { join: 'and', cards: [{ ...card(A, B), join: 'or' }, card(C)] }
    const g = toGraph(w)
    expect(g.join).toBe('and')
    expect(g.branchById[w.cards[0].id].join).toBe('or')
    /* Defaults are resolved, not left undefined, so the pill never guesses. */
    expect(g.branchById[w.cards[1].id].join).toBe('and')
  })

  it('resolves the trunk default of a plain predicate to or', () => {
    expect(toGraph(when(card(A), card(B))).join).toBe('or')
  })

  it('carries the label and the group flag, which only the drawing reads', () => {
    const k = { ...emptyGroup(), label: '  Corp laptops  ', conditions: [A] }
    const b = toGraph(when(k)).branchById[k.id]
    expect(b.label).toBe('Corp laptops')
    expect(b.grouped).toBe(true)
  })

  it('gives every branch its letter, so a name is never required to refer to one', () => {
    const w = when(card(A), card(B), card(C))
    const g = toGraph(w)
    expect(w.cards.map((k) => g.branchById[k.id].letter)).toEqual(['A', 'B', 'C'])
  })

  /* Two ids, one identity. The seeded finance rule names the same group in both
     of its branches; collapsing them by identity would give one node two
     parents, which is a third level by the back door. */
  it('keeps two conditions that mean the same thing as two nodes', () => {
    const twin = cond('zone', 'in zone', ['office'])
    expect(ckey(twin)).toBe(ckey(A))
    const g = toGraph(when(card(A), card(twin)))
    expect(nodeCount(g)).toBe(2)
  })

  it('projects a real seeded rule without losing a condition', () => {
    const seeded = policies.flatMap((p) => p.rules).find((r) => r.when.cards.length > 1)!
    const g = toGraph(seeded.when)
    expect(g.branches).toHaveLength(seeded.when.cards.length)
    expect(nodeCount(g)).toBe(seeded.when.cards.reduce((n, k) => n + k.conditions.length, 0))
  })
})

describe('a third level is unreachable', () => {
  const w = when(card(A, B), card(C))
  const g = toGraph(w)
  const [k0, k1] = w.cards.map((k) => k.id)

  /* The one gesture that could express nesting. It is not rejected with a
     message and a shake — it returns no target, so nothing lights. */
  it('refuses a branch dropped inside a branch', () => {
    const v = canDrop(g, { kind: 'branch', id: k1 }, { kind: 'branch', branchId: k0, at: 0 })
    expect(v.ok).toBe(false)
  })

  /* And the type is the real guarantee: `DropTarget` has no `node` member, so
     "into a node" cannot be constructed to be tested. The absence is the test. */
  it('resolves a branch over another branch header to a merge, not a nest', () => {
    const v = canDrop(g, { kind: 'branch', id: k1 }, { kind: 'branch-head', branchId: k0 })
    expect(v).toMatchObject({ ok: true, verb: 'merge' })
  })

  it('will not merge a branch into itself', () => {
    expect(canDrop(g, { kind: 'branch', id: k0 }, { kind: 'branch-head', branchId: k0 }).ok).toBe(false)
  })
})

describe('the affordance and the writer agree', () => {
  /* The bug in the editor being replaced: "move into its own group" was drawn
     on every row of a multi-condition card, while the writer bailed whenever
     the row was the only one in its card — so the first row of every card had a
     visible, tooltipped control that did nothing. */
  it('does not offer to split a condition that is already alone', () => {
    const g = toGraph(when(card(A)))
    expect(canDrop(g, { kind: 'node', id: A.id }, { kind: 'trunk', at: 1 }).ok).toBe(false)
  })

  it('offers it when the branch holds more than one', () => {
    const g = toGraph(when(card(A, B)))
    expect(canDrop(g, { kind: 'node', id: A.id }, { kind: 'trunk', at: 1 })).toMatchObject({ ok: true, verb: 'split' })
  })

  it('calls a move within one branch a reorder, and names the destination otherwise', () => {
    const w = when(card(A, B), card(C))
    const g = toGraph(w)
    expect(canDrop(g, { kind: 'node', id: A.id }, { kind: 'branch', branchId: w.cards[0].id, at: 1 })).toMatchObject({ verb: 'reorder' })
    const into = canDrop(g, { kind: 'node', id: A.id }, { kind: 'branch', branchId: w.cards[1].id, at: 0 })
    expect(into).toMatchObject({ ok: true, verb: 'move' })
    expect(into.ok && into.preview).toContain('branch B')
  })

  it('prefers the author’s own name for a branch over its letter', () => {
    const named = { ...card(C), label: 'Mobile' }
    const w = when(card(A), named)
    const v = canDrop(toGraph(w), { kind: 'node', id: A.id }, { kind: 'branch', branchId: named.id, at: 0 })
    expect(v.ok && v.preview).toContain('“Mobile”')
  })
})

describe('layout is ordinals, never coordinates', () => {
  it('places every branch and every node by its position in its list', () => {
    const w = when(card(A, B), card(C))
    const placed = layout(toGraph(w))
    expect(placed.map((p) => p.at)).toEqual([0, 1])
    expect(placed[0].nodes.map((n) => n.at)).toEqual([0, 1])
    /* Nothing in the projection carries an x or a y. If one ever appears, a
       drag becomes an edit: it would commit, light the save bar, enable Discard
       and re-run a 1,440-situation sweep for a change that alters nothing about
       what the policy does. */
    expect(JSON.stringify(placed)).not.toMatch(/"[xy]":/)
  })
})

describe('the trunk says what it quantifies over', () => {
  /* "OR" between two boxes does not say whether any branch is enough or every
     branch is required, which is the entire meaning of the setting. */
  it('spells the joiner out in words', () => {
    expect(trunkSays('or', 2)).toBe('Any one of these is enough')
    expect(trunkSays('and', 2)).toBe('Every one of these must match')
  })

  it('says nothing about joining when there is only one branch', () => {
    expect(trunkSays('or', 1)).toBe('One way in')
  })
})

describe('branchOfNode', () => {
  it('finds the branch a node sits in, and nothing for one that is gone', () => {
    const w = when(card(A), card(B))
    const g = toGraph(w)
    expect(branchOfNode(g, B.id)?.id).toBe(w.cards[1].id)
    expect(branchOfNode(g, 'nope')).toBeUndefined()
  })
})
