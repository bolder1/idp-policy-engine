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
  /** The customizable Dashboard and its Classic / New switch (18-19 Nov, dashboard/phase.ts). Design only on
   *  19 Nov ("the dashboard is for design only"); every line after the owner's check on 20 Nov. */
  dashboardV2: ALL,
  /** All Policies → More filters, its one chip and its button (19 Nov: 25b0bd7, 7c29103, c76c28a). Pushed to every
   *  line before the Design-only rule; taken back to Design on the owner's word ("Move to Design only"). */
  moreFilters: ['design'],
  /** All Policies' bar on one line: its buttons drop to icons as it narrows (19 Nov). Every line on the owner's
   *  check (20 Nov). */
  oneLineBar: ALL,
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
  /** The empty tenant, from `npm run dev:empty` or the profile menu's Show / Hide empty states (20 and 23 Nov, empty-tenant.ts): every page's
   *  empty state. A review tool, not product (owner: "will remove it eventually"). Design only. */
  emptyTenant: ['design'],
  /** Every page-level empty state drawn like Zones and Device profiles (20 Nov, empty-art.tsx). Design only. */
  emptyArt: ['design'],
  /** Authentication methods: Make default on all seven methods the live console's default list names (OTP over SMS,
   *  Email, Alternate Email, Display Token, SMS Link, Email Link, OTP over SMS and Email), whatever their SMS balance
   *  (20 Nov, auth-panel.ts `LIVE_DEFAULT_METHODS`). Every line, on the owner's word ("push this directly to all 3"). */
  allDefaults: ALL,
  /** Mark as template on every draft: a never-published policy, an unsaved one on the canvas, even with no rule yet
   *  (20 Nov, owner: "draft policy should also be saved as template"). Migrated drafts in review stay without it.
   *  Every line after the owner's check (20 Nov). */
  draftTemplates: ALL,
  /** "Your templates" is called "My templates" (20 Nov). Every line after the owner's check. */
  myTemplates: ALL,
  /** Leaving a canvas that holds no rule asks first: No rule added, Discard or Continue (20 Nov). Every line after
   *  the owner's check. */
  noRuleAlert: ALL,
  /** The start chooser ("How should this policy start?") has Back and the name in its bar, nothing else; Save draft,
   *  Save policy and the ⋯ menu come once a path is picked (20 Nov). Every line after the owner's check. */
  emptyStartBar: ALL,
  /** Dashboard Customize: a drop previews live (the board makes room before the widget is let go), a refused drop or a
   *  locked bar says why, and the colour themes and a dark board are back (20 Nov). Every line, with the Dashboard. */
  dashboardGrid: ALL,
  /** Dashboard audit fixes (22 Nov): the dark board no longer shifts the page when it turns on, Customize's row tools
   *  stay in reach below 1120px instead of slipping under the rail, and initials on the board meet the 12px floor.
   *  Design only until the owner has checked it. */
  dashboardPolish: ['design'],
  /** Deny in the policy builder carries the live console's email alerts: send to administrators and end users, the
   *  administrator address, and the four events, above the Deny message (23 Nov). Every line, on the owner's word
   *  ("change this globally ... update all 3 roles"). */
  denyAlerts: ALL,
} as const satisfies Record<string, readonly Line[]>

export type Change = keyof typeof ROLLOUT

/** Whether the line open now shows this change. On the sign-in screen (no line) nothing is shown. */
export function shows(change: Change): boolean {
  return LINE !== null && (ROLLOUT[change] as readonly Line[]).includes(LINE)
}
