import { describe, expect, it } from 'vitest'

import { RUN_STOPS, RUN_STOP_AWAY, runFoldAll, runFoldOpen, runKeyStop, type RunFoldRest } from './board-run-fold'

/* -----------------------------------------------------------------------------
   CHECK ACCESS V3's FOLD, WITH ITS GROUPS (20 Oct 2026, evening; the owner on
   Maya Iyer → AWS Console: "Whatever is not reached can be collapsed, and the
   outcome can be shown. If the user wants, he can expand it"). The fold's rules
   are pure (board-run-fold.ts), so a press, the dock's Expand all / Collapse
   all and the keys are pinned here without a DOM; board-run-ui.test.tsx pins
   what the folded markup says, and the browser check presses them.
   -------------------------------------------------------------------------- */

const CARDS = ['r1', 'r2', 'r3', 'fallback'] as const
const GROUPS = ['tail', 'stack:0'] as const
const playing: RunFoldRest = { groups: GROUPS, landed: false, on: null, keepOutcome: false }
const landed: RunFoldRest = { groups: GROUPS, landed: true, on: 'outcome', keepOutcome: true }
const openOf = (pressed: Record<string, boolean>, rest: RunFoldRest) => [...CARDS, 'outcome', ...GROUPS].filter((id) => runFoldOpen(pressed, id, rest))

describe('the groups fold until pressed', () => {
  it('start folded, while the run plays and once it lands; no rule card opens on its own', () => {
    expect(openOf({}, playing)).toEqual([])
    expect(openOf({}, landed)).toEqual(['outcome'])
  })
  it('a press opens the rules never reached, and a second folds them back; the cards stay as they were', () => {
    const once = { tail: !runFoldOpen({}, 'tail', landed) }
    expect(openOf(once, landed)).toEqual(['outcome', 'tail'])
    const twice = { ...once, tail: !runFoldOpen(once, 'tail', landed) }
    expect(openOf(twice, landed)).toEqual(['outcome'])
  })
  it('a citation opens the group first, then the card in it', () => {
    expect(openOf({ tail: true, r3: true }, landed)).toEqual(['r3', 'outcome', 'tail'])
  })
})

describe('the dock: Expand all and Collapse all take the groups with the cards', () => {
  it('Collapse all, with anything open, folds every card and every group', () => {
    const all = runFoldAll([...CARDS, 'outcome'], GROUPS, true)
    expect(openOf(all, landed)).toEqual([])
    expect(Object.values(all).every((v) => v === false)).toBe(true)
  })
  it('Expand all, with nothing open, opens every card and every group: the scan picture is one press away', () => {
    const all = runFoldAll([...CARDS, 'outcome'], GROUPS, false)
    expect(openOf(all, landed)).toEqual([...CARDS, 'outcome', ...GROUPS])
  })
})

describe('the keys walk the titles and the labels, skipping what is folded away', () => {
  it('↑ ↓ Home End move by one, to the first and to the last, and stop at the ends', () => {
    expect([runKeyStop('ArrowDown', 1, 4), runKeyStop('ArrowUp', 1, 4), runKeyStop('Home', 2, 4), runKeyStop('End', 0, 4)]).toEqual([2, 0, 0, 3])
    expect([runKeyStop('ArrowDown', 3, 4), runKeyStop('ArrowUp', 0, 4)]).toEqual([3, 0])
  })
  it('takes no other key, and nothing from a stop it does not know', () => {
    expect([runKeyStop('Enter', 1, 4), runKeyStop(' ', 1, 4), runKeyStop('ArrowDown', -1, 4), runKeyStop('ArrowDown', 0, 0)]).toEqual([null, null, null, null])
  })
  it('names the stops (the cards\' titles, the groups\' labels) and what takes one away (a folded body, a hidden stack card)', () => {
    expect(RUN_STOPS).toBe('.bb__card .bb__titlebtn, .bbr__groupbtn')
    expect(RUN_STOP_AWAY).toBe('[inert],[hidden]')
  })
})
