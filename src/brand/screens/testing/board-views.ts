import type { Policy } from '../../data'
import { LEVEL_LABEL } from '../../saved-sign-ins'
import type { TestingView } from '../../store'
import { breakInEligible } from '../break-in-model'
import type { BreakInKept } from '../break-in-view'
import type { SavedKept } from './SavedView'
import { answerSaid, type SavedRow } from './selectors'

/* -----------------------------------------------------------------------------
   Policy testing inside the board's test panel: Version 3 (final spec, B V3).

   The panel keeps its Try a sign-in as the first view, and gains the two
   tenant views beside it as grey pill tabs — Check a person and Saved
   sign-ins — with the Break-in test pushed over Saved sign-ins, the way the
   page and the slider push it. There is no Sample sign-ins view here: on the
   board the samples are Try's own presets.

   Which page is open belongs to the board, not the testing session. The
   session's view is the page's and the slider's, carried across a version
   flip; the board's page is the board's, kept while a rule opened from the
   chain takes the panel's column, so the editor's × comes back to it.

   Pure, so the rules of which page shows can be pinned without a browser.
   -------------------------------------------------------------------------- */

/** What the panel can show: a tab's view, or the Break-in test pushed over Saved sign-ins. */
export type BoardTestPage = 'try' | 'person' | 'saved' | 'break-in'
export type BoardTestTab = Extract<TestingView, 'try' | 'person' | 'saved'>

/** What this board can show at all: the views (Version 3), and the Break-in test (the edition, and a policy it runs on). */
export interface BoardPagesAllowed {
  views: boolean
  breakIn: boolean
}

/* The views come with Version 3. The Break-in test comes with them where the
   edition has it and the board's policy is one it runs on — App Access, with
   an application, not the Global Default — the same policies the page's and
   the slider's Policy to test offers, so the three versions test the same
   ones. A draft that gains its first application gains the test. */
export function boardPagesAllowed(views: boolean, breakInTest: boolean, draft: Pick<Policy, 'type' | 'appIds' | 'isSystem'>): BoardPagesAllowed {
  return { views, breakIn: views && breakInTest && breakInEligible(draft) }
}

/** The tab a page sits under: the Break-in test is pushed over Saved sign-ins. */
export const tabOf = (page: BoardTestPage): BoardTestTab => (page === 'break-in' ? 'saved' : page)

/* The page drawn for the page asked for. Without the views the panel is Try a
   sign-in alone, whatever was asked; without the Break-in test, Saved
   sign-ins is as close as it gets. */
export function pageShown(page: BoardTestPage, can: BoardPagesAllowed): BoardTestPage {
  if (!can.views) return 'try'
  if (page === 'break-in' && !can.breakIn) return 'saved'
  return page
}

/* The page the panel opens on: Try a sign-in, unless the route names another
   — a guard's "Open" or the Policies list's grade (`open: 'break-in'`). */
export function firstBoardPage(open: BoardTestPage | undefined, can: BoardPagesAllowed): BoardTestPage {
  return open ? pageShown(open, can) : 'try'
}

/* What the pages would lose while a rule opened from the panel has its
   column — the swap unmounts them — held by the board for the life of its
   test mode, and new each time test mode starts: Saved sign-ins' search and
   filters, and the Break-in test's last run, pressed count and open row. */
export interface BoardViewsKept {
  saved: { current: SavedKept | null }
  breakIn: { current: BreakInKept | null }
}

export const boardViewsKept = (): BoardViewsKept => ({ saved: { current: null }, breakIn: { current: null } })

/* Save sign-in saves the sign-in Try holds. On Try it opens and shuts its
   form; from any other page it goes to Try with the form open. */
export function saveSignInPressed(page: BoardTestPage, saving: boolean): { page: BoardTestPage; saving: boolean } {
  return page === 'try' ? { page, saving: !saving } : { page: 'try', saving: true }
}

// --- Saved sign-ins in the panel ------------------------------------------------

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
