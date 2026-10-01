import type { Policy } from '../../data'
import { LEVEL_LABEL } from '../../saved-sign-ins'
import { breakInEligible } from '../break-in-model'
import { answerSaid, type SavedRow } from './selectors'

/* -----------------------------------------------------------------------------
   Policy testing on a policy's board: what the board offers, and the rows of
   its saved sign-ins.

   The board's old form panel went with Policy testing V4 (§2.5): the sign-in
   is a sentence at the top of the test panel now, and the lists are its tabs
   (test-dock.ts). What is left here is what both the panel and the tenant's
   views still read — whether this board offers the Break-in test, which saved
   sign-ins are this policy's, and what a narrow row says in its tooltip.

   Pure, so the rules can be pinned without a browser.
   -------------------------------------------------------------------------- */

/** What this board can show at all: Policy testing's views, and the Break-in test (the edition, and a policy it runs on). */
export interface BoardPagesAllowed {
  views: boolean
  breakIn: boolean
}

/* The views come with Policy testing. The Break-in test comes with them where
   the edition has it and the board's policy is one it runs on — App Access,
   with an application, not the Global Default. A draft that gains its first
   application gains the test. */
export function boardPagesAllowed(views: boolean, breakInTest: boolean, draft: Pick<Policy, 'type' | 'appIds' | 'isSystem'>): BoardPagesAllowed {
  return { views, breakIn: views && breakInTest && breakInEligible(draft) }
}

// --- Saved sign-ins on the board ------------------------------------------------

/* The board asks about one policy, so its Saved sign-ins open on the ones
   that sign in to that policy's applications, with the rest a choice away.
   The Global Default is on every application, so for it the two are one. */
export type SavedShow = 'policy' | 'all'

export const SAVED_SHOW: { value: SavedShow; label: string }[] = [
  { value: 'policy', label: 'This policy’s apps' },
  { value: 'all', label: 'All' },
]

export function savedOnPolicy(rows: readonly SavedRow[], policy: Pick<Policy, 'appIds' | 'isSystem'>, show: SavedShow): SavedRow[] {
  if (show === 'all' || policy.isSystem) return [...rows]
  return rows.filter((r) => r.saved.facts.appId !== undefined && policy.appIds.includes(r.saved.facts.appId))
}

/* At 448 px the table keeps the name, what was expected, and the result; the
   level, what came back and which policy decided it move into the name's
   tooltip, after the sign-in itself (final spec, B.8 via the draft's 448 px
   column). One line, " · " between its parts, as every sign-in tip is. */
export function savedTip(row: SavedRow, summary: string): string {
  return [
    summary,
    `Level: ${LEVEL_LABEL[row.saved.level]}`,
    `Actual: ${answerSaid(row.res)}`,
    row.today ? `Today: ${answerSaid(row.today)}` : null,
    row.res.decidedBy ? `Decided by: ${row.res.decidedBy.policyName}` : null,
  ]
    .filter((s): s is string => s !== null)
    .join(' · ')
}
