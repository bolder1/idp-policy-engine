import { LINE, type Line } from './lines'

/* -----------------------------------------------------------------------------
   ROLLOUT: which line sees which change (owner, 19 Nov 2026: "might not need multiple GitHub and Vercel ... based on
   login we can showcase ... push things in a subtle way").

   One repo, one deploy. The sign-in picks the line (lines.ts); this table decides what each line sees. A change ships
   to main with ['design'] only, so it is live but only the owner sees it. When he approves it, add 'handoff' and/or
   'tester' to its entry and push once. Taking a change back is removing a line, nothing else.

   Entries are named for the change, newest last. A change every line has had for a while can leave the table: drop
   the entry and its `shows()` calls.
   -------------------------------------------------------------------------- */

const ALL: readonly Line[] = ['design', 'handoff', 'tester']

export const ROLLOUT = {
  /** Authentication methods → General settings: Users row hidden, Mobile issuer name added (19 Nov). */
  mobileIssuer: ALL,
  /** Rail items with no page are locked (19 Nov). Design keeps every row open. */
  railLock: ['handoff', 'tester'],
  /** The customizable Dashboard and its Classic / New switch (18-19 Nov, dashboard/phase.ts). Design only (owner,
   *  19 Nov: "the dashboard is for design only"). Dev handoff and Tester keep Classic until he has checked it. */
  dashboardV2: ['design'],
  /** All Policies → More filters, its one chip and its button (19 Nov: 25b0bd7, 7c29103, c76c28a). Pushed to every
   *  line before the Design-only rule; taken back to Design on the owner's word ("Move to Design only"). */
  moreFilters: ['design'],
  /** All Policies' bar on one line: its buttons drop to icons as it narrows (19 Nov). Design only. */
  oneLineBar: ['design'],
  /** The top bar's Search, theme switch and sound switch (20 Nov). Tester never had them; the owner took them off
   *  Dev handoff ("Search, dark theme, sound, hide this from dev"). Where they are hidden the page is light and silent. */
  topBarTools: ['design'],
  /** Policies → Risk signal profile and External Hooks in the rail (20 Nov). Tester never had them (tester.ts
   *  TESTER_WITHHELD); the owner took them off Dev handoff ("hide these 2 from dev as well"). */
  riskAndHooks: ['design'],
  /** Apps in the rail is locked, like an item with no page (20 Nov). A lock, so it lists the lines that GET it, as
   *  railLock does: Tester only (owner: "lock this for tester as of now"). Its Dashboard shortcut goes with it. */
  lockApps: ['tester'],
  /** The account menu names the line's role (Designer, Developer, Tester) with the sign-in's email, and shows the
   *  line's own 3D badge (20 Nov, role-avatar.tsx). Every line, on the owner's word ("for all 3"). */
  roleIdentity: ALL,
  /** Templates drawn with a bookmark, and called templates again rather than favorites (20 Nov, owner: "change icon of
   *  templates to bookmark icon, change favorites text to templates"). Every line, on the owner's word ("push all 3
   *  changes to all 3 roles, these are global changes"). */
  templateBookmark: ALL,
  /** Authentication methods → General settings: a Device profile expiry field, a number of days (20 Nov). Every line, as above. */
  deviceProfileExpiry: ALL,
  /** All Policies and Post sign-in tables: every policy name one width, cut with an ellipsis (full name on hover), and
   *  fixed columns so they sit in the same place on every tab (20 Nov). Every line, as above. */
  policyNameFit: ALL,
} as const satisfies Record<string, readonly Line[]>

export type Change = keyof typeof ROLLOUT

/** Whether the line open now shows this change. On the sign-in screen (no line) nothing is shown. */
export function shows(change: Change): boolean {
  return LINE !== null && (ROLLOUT[change] as readonly Line[]).includes(LINE)
}
