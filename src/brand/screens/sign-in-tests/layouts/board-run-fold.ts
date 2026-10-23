import { useState } from 'react'

/* -----------------------------------------------------------------------------
   CHECK ACCESS V3's FOLD (20 Oct 2026), kept out of board-run.tsx so that file
   exports its component only. Which of the policy's own cards are open: none of
   the rule cards while the run plays (board-run-model.ts `runFoldOn`: the walk
   is read on each card's second line), every card folded once it lands but the
   outcome when it has a body to read; what the admin opened or folded by hand
   stands until the next run (`key`). The contract of classic2-run.ts
   `useChainFold`, over the policy's own cards, so Focus's dock, its brief cue
   and an answer's citation drive it as they drive the chain's.

   THE GROUPS (owner, 20 Oct 2026, evening: "Whatever is not reached can be
   collapsed … If the user wants, he can expand it"): the rules never reached
   and each stack of walked misses (board-run-model.ts `runGroups`) fold here
   too, by their own ids ('tail', `stack:{from}`). A group starts folded, the
   dock's Expand all opens them with every card and Collapse all closes them;
   the brief's cue (`anyRuleOpen`) waits on the cards alone. The rules are
   pure (`runFoldOpen`, `runFoldAll`, `runKeyStop`), so they are pinned without
   a DOM (board-run-fold.test.ts); the hook only keeps the presses.
   -------------------------------------------------------------------------- */

export interface RunFold {
  open: (id: string) => boolean
  anyOpen: boolean
  /** The cards it folds: the rules by id, 'fallback', and 'outcome' where the outcome has a body. */
  ids: readonly string[]
  /** The groups it folds: 'tail' and each `stack:{from}`. */
  groups: readonly string[]
  fold: (id: string) => void
  set: (id: string, open: boolean) => void
  foldAll: () => void
  /** What was pressed or set, by id: v3's policy head is open unless its own entry says false. */
  hand: Readonly<Record<string, boolean>>
  /** The head's fold, pressed: open unless pressed shut. */
  toggleHead: () => void
  /** A rule card (not the outcome, not a group) is open. */
  anyRuleOpen: boolean
}

export interface RunFoldRest {
  /** The groups' ids: folded until pressed. */
  groups: readonly string[]
  landed: boolean
  /** The card the run holds open on its own while it plays (`runFoldOn`). */
  on: string | null
  /** Landed, the outcome stays open (it has a body to read). */
  keepOutcome: boolean
}

/** Whether `id` is open: what a press said, else a group folded, else the run's own fold (the outcome once landed). */
export function runFoldOpen(pressed: Readonly<Record<string, boolean>>, id: string, rest: RunFoldRest): boolean {
  const hand = pressed[id]
  if (hand !== undefined) return hand
  if (rest.groups.includes(id)) return false
  return rest.landed ? id === 'outcome' && rest.keepOutcome : id === rest.on
}

/** The dock's one button: anything open folds everything, cards and groups; nothing open opens them all. */
export function runFoldAll(ids: readonly string[], groups: readonly string[], anyOpen: boolean): Record<string, boolean> {
  return Object.fromEntries([...ids, ...groups].map((id) => [id, !anyOpen]))
}

/** What ↑ ↓ Home End walk: the cards' titles and the groups' labels, in the page's order. */
export const RUN_STOPS = '.bb__card .bb__titlebtn, .bbr__groupbtn'
/** A stop folded away (inside a group's folded body, or a stack card drawn as its label) is skipped. */
export const RUN_STOP_AWAY = '[inert],[hidden]'

/** Where a key takes focus among `n` stops from stop `at`; null for a key it does not take. */
export function runKeyStop(key: string, at: number, n: number): number | null {
  if (at < 0 || n === 0) return null
  const to = key === 'ArrowDown' ? at + 1 : key === 'ArrowUp' ? at - 1 : key === 'Home' ? 0 : key === 'End' ? n - 1 : null
  return to === null ? null : Math.max(0, Math.min(n - 1, to))
}

/** v3's policy head (board-run.tsx), folded by hand or by the dock's button. */
const HEAD = 'policy-head'

const NO_GROUPS: readonly string[] = []

export function useBoardRunFold(key: string, ids: readonly string[], landed: boolean, on: string | null, keepOutcome: boolean, groups: readonly string[] = NO_GROUPS): RunFold {
  const [hand, setHand] = useState<{ key: string; open: Readonly<Record<string, boolean>> }>({ key, open: {} })
  const pressed = hand.key === key ? hand.open : {}
  const rest: RunFoldRest = { groups, landed, on, keepOutcome }
  const isOpen = (id: string): boolean => runFoldOpen(pressed, id, rest)
  const anyOpen = ids.some(isOpen) || groups.some(isOpen)
  const set = (id: string, open: boolean) => setHand((h) => ({ key, open: { ...(h.key === key ? h.open : {}), [id]: open } }))
  return {
    open: isOpen,
    anyOpen,
    ids,
    groups,
    fold: (id) => set(id, !isOpen(id)),
    set,
    foldAll: () => setHand({ key, open: { ...runFoldAll(ids, groups, anyOpen), [HEAD]: !anyOpen } }),
    hand: pressed,
    toggleHead: () => set(HEAD, pressed[HEAD] === false),
    anyRuleOpen: ids.some((id) => id !== 'outcome' && isOpen(id)),
  }
}

/** Before every id the run's cards draw: the builder keeps its own edit board mounted under Check access. */
export const RUN_ID_PREFIX = 'run-'
