import type { Joiner, Predicate } from './data'
import { cardJoin, cardLetter, topJoin } from './predicate'

/* -----------------------------------------------------------------------------
   The predicate, as something a canvas can draw.

   A read projection. Nothing here writes — `when-ops.ts` is the only writer,
   and it takes and returns a `Predicate` rather than a graph, so this file is
   never on the path of an edit. That separation is deliberate: a graph that
   round-tripped through the model on every keystroke would be one careless
   field away from lighting the save bar on a policy nobody had changed.

   **Two levels, and a third is unspellable rather than forbidden.** `CondNode`
   has no `members`. `Branch.members` holds `NodeId`s that resolve only in
   `nodeById`. There is no recursive `children?: Node[]` anywhere, so there is
   no runtime check to forget at one call site and no shape in which a node can
   hold a node. That is why no off-the-shelf graph type could be used here:
   every one of them is recursive, and a recursive node reopens the door by
   construction.

   The reason the model insists on two levels is in predicate.ts: every
   interesting check in the linter — subsumption, contradiction, duplication —
   is built on "an unbroken run of ANDs", and over an arbitrary tree each of
   them has to bail out silently on the mixed case. The linter would go quiet
   exactly where it is needed.

   **The model is not DNF.** It is two levels with one joiner each, which spans
   four shapes: OR-of-ANDs, AND-of-ORs, a flat OR and a flat AND. Both joiners
   are READ through `cardJoin` and `topJoin` and never assumed, because a canvas
   that assumes the trunk is OR cannot draw a rule the editor produces in one
   click.
   -------------------------------------------------------------------------- */

export type NodeId = string
export type BranchId = string

/** One condition. Nothing else — and in particular, no children. */
export interface CondNode {
  id: NodeId
  typeId: string
  operator: string
  values: string[]
}

/* One branch, drawn as a framed column.

   `join` is resolved rather than optional, so nothing downstream has to know
   the model's default and the pill never has to guess what to print. `grouped`
   and `label` are carried because they are what the drawing needs to say what
   the author meant — neither is read by the evaluator, the linter or the
   simulator. */
export interface Branch {
  id: BranchId
  /** The author's name, or none. The letter is always available separately. */
  label?: string
  letter: string
  join: Joiner
  grouped: boolean
  members: NodeId[]
}

export interface PredGraph {
  join: Joiner
  branches: BranchId[]
  branchById: Record<BranchId, Branch>
  nodeById: Record<NodeId, CondNode>
}

/* Flat records at fixed depth, keyed the way the rest of the product already
   keys these things.

   A node's id is `Condition.id`, which is already this codebase's address for a
   condition: the writers map on it, the diagnostics build `${rule.id}-${c.id}`
   from it, and the trail's readback already emits `data-node-id={cl.id}`.
   Keying by index would reintroduce at the condition level the bug the board's
   `Selection` type documents killing at the rule level — a position is only
   meaningful against one ordering of one list, and both move underneath it.

   Nodes are NOT de-duplicated by identity. The seeded finance rule holds the
   same group membership in both of its branches: two node ids, one `ckey`, and
   both correctly wear the "also in another branch" badge. Collapsing them would
   give one node two parents, which is a third level by the back door and a
   shape the model cannot hold. */
export function toGraph(w: Predicate): PredGraph {
  const branchById: Record<BranchId, Branch> = {}
  const nodeById: Record<NodeId, CondNode> = {}
  const branches: BranchId[] = []

  w.cards.forEach((k, i) => {
    branches.push(k.id)
    branchById[k.id] = {
      id: k.id,
      label: k.label?.trim() || undefined,
      letter: cardLetter(i),
      join: cardJoin(k),
      grouped: k.grouped === true,
      members: k.conditions.map((c) => c.id),
    }
    for (const c of k.conditions) {
      nodeById[c.id] = { id: c.id, typeId: c.typeId, operator: c.operator, values: c.values }
    }
  })

  return { join: topJoin(w), branches, branchById, nodeById }
}

/** Where a node currently lives. */
export const branchOfNode = (g: PredGraph, id: NodeId): Branch | undefined =>
  g.branches.map((b) => g.branchById[b]).find((b) => b.members.includes(id))

/* --- Dropping ------------------------------------------------------------------

   The refusal is an ABSENT drop target, never a rejected drop — and the
   affordance and the handler read the same predicate, which is the half that
   the editor being replaced got wrong. There, "move into its own group" was
   offered on every row of a multi-condition card while the handler bailed
   whenever the row was the only one, so the first row of every card had a
   visible, hoverable, tooltipped button that silently did nothing. A zone that
   lights and then refuses teaches people the editor is broken; a zone that
   never lights teaches them the model has two levels. */

export type DropTarget =
  /** Into a branch, at an index in the list as it will be. */
  | { kind: 'branch'; branchId: BranchId; at: number }
  /** A new branch at this position on the trunk. */
  | { kind: 'trunk'; at: number }
  /** Onto another branch's header: fold this branch's conditions into it. */
  | { kind: 'branch-head'; branchId: BranchId }

export type Dragged = { kind: 'node'; id: NodeId } | { kind: 'branch'; id: BranchId }

export type DropVerdict =
  | { ok: true; verb: 'move' | 'reorder' | 'split' | 'merge'; preview: string }
  | { ok: false; why: string }

/* Note what is missing from `DropTarget`: there is no `{ kind: 'node' }`. A
   branch can never be dropped onto a node, and a node can never be dropped
   *into* another node, because the type offers nowhere to put it. The one
   gesture that could reach for nesting — dragging a branch over another
   branch's body — resolves to the operation nesting was reaching for, which is
   a merge. */
export function canDrop(g: PredGraph, d: Dragged, t: DropTarget): DropVerdict {
  if (d.kind === 'node') {
    const node = g.nodeById[d.id]
    if (!node) return { ok: false, why: 'That condition is gone.' }
    const home = branchOfNode(g, d.id)

    if (t.kind === 'branch') {
      const to = g.branchById[t.branchId]
      if (!to) return { ok: false, why: 'That branch is gone.' }
      if (home?.id === t.branchId) return { ok: true, verb: 'reorder', preview: 'Reorder' }
      return { ok: true, verb: 'move', preview: `Into ${nameOf(to)}` }
    }

    if (t.kind === 'trunk') {
      /* Splitting a lone condition out of its branch produces the same
         predicate with a different branch id — an edit that changes nothing,
         which the writer also refuses. Both halves agree, so the zone does not
         light and the drop is not offered. */
      if (home && home.members.length < 2) return { ok: false, why: 'It is already the only condition in its branch.' }
      return { ok: true, verb: 'split', preview: 'Into a branch of its own' }
    }

    /* A node onto a branch header is not a merge — a merge is between branches
       — and it is not obviously a move either, so it is not offered. */
    return { ok: false, why: 'Drop a condition inside a branch, not on its header.' }
  }

  // --- a branch is being dragged ---
  const from = g.branchById[d.id]
  if (!from) return { ok: false, why: 'That branch is gone.' }

  if (t.kind === 'trunk') return { ok: true, verb: 'reorder', preview: 'Reorder' }

  if (t.kind === 'branch-head') {
    if (t.branchId === d.id) return { ok: false, why: 'A branch cannot merge into itself.' }
    const into = g.branchById[t.branchId]
    if (!into) return { ok: false, why: 'That branch is gone.' }
    return { ok: true, verb: 'merge', preview: `Merge into ${nameOf(into)}` }
  }

  /* The whole refusal, in one line. A branch dropped INTO a branch is the only
     way to express nesting, and it is the case that returns nothing. */
  return { ok: false, why: 'A branch cannot go inside another branch — a rule is two levels deep.' }
}

const nameOf = (b: Branch) => (b.label ? `“${b.label}”` : `branch ${b.letter}`)

/* --- Layout --------------------------------------------------------------------

   Ordinals, never coordinates.

   `layout` returns the position of each thing in its list and CSS does the
   rest: the deck is a flex row of fixed-width columns, and the fan connecting
   them is drawn with borders. Nothing computes an x or a y, which is what keeps
   a drag from being an edit — putting coordinates on a `Condition` would make
   every nudge a commit, light the save bar, enable Discard, trip the leave
   guard and re-run a 1,440-situation before/after sweep for a change that
   alters nothing about what the policy does. */
export interface Placed {
  branch: Branch
  at: number
  nodes: { node: CondNode; at: number }[]
}

export function layout(g: PredGraph): Placed[] {
  return g.branches.map((id, at) => {
    const branch = g.branchById[id]
    return { branch, at, nodes: branch.members.map((n, j) => ({ node: g.nodeById[n], at: j })) }
  })
}

/** How many conditions the whole predicate holds. */
export const nodeCount = (g: PredGraph) => Object.keys(g.nodeById).length

/* What the trunk marker says, in words rather than as a bare conjunction.

   "OR" between two boxes is ambiguous about what it is quantifying over —
   somebody reading quickly cannot tell whether any branch is enough or every
   branch is required, which is the entire meaning of the setting. */
export const trunkSays = (join: Joiner, branches: number) =>
  branches < 2
    ? 'One way in'
    : join === 'or'
      ? 'Any one of these is enough'
      : 'Every one of these must match'

export const branchSays = (join: Joiner, members: number) =>
  members < 2 ? 'One condition' : join === 'and' ? 'All of these must be true' : 'Any one of these is enough'
