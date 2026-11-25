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
  /** Every table pages: one footer (pager.tsx) with Rows per page, the range and page numbers, stuck to the bottom of
   *  the window (23 Nov, owner: "add pagination ... globally for all the tabs and tables ... static at the bottom").
   *  The fit-to-window lists take rows per page too. Every line on the owner's word (23 Nov: "pagination for all 3"). */
  pagination: ALL,
  /** Sign-in activity and Check access, every way in: the All Policies bar, the rail and search, Home and Dashboard
   *  shortcuts, the app page's links, the user drawer and the builder (tester.ts `CHECKS_WITHHELD`). Taken off Dev
   *  handoff on the owner's word (23 Nov: "For dev hide sign-in activity and hide check access completely"). Tester
   *  withholds them on its own (TESTER), so this entry only decides Dev handoff. */
  activityAndChecks: ['design', 'tester'],
  /** The default rule ("Nothing else matched") counts as a rule, so a policy whose only change is its default can be
   *  saved, as a draft or a policy (23 Nov, owner: "by default rule is the first rule"). Every line on the owner's word
   *  (23 Nov: "change this to all 3 roles"), as are the six below. */
  defaultRuleSaves: ALL,
  /** Save policy decides the status (23 Nov, owner: "when the user saves a policy it says draft but it should be
   *  active"): a draft saved with an application goes active, after the Before turning on checks; with none it is
   *  stored inactive, not draft. Draft comes only from Save draft. */
  saveMakesActive: ALL,
  /** The Global Default's "Nothing else matched" panel shows Who, read-only: Everyone (23 Nov). */
  globalWho: ALL,
  /** The builder's ⋯ marks and unmarks a template, the way the Policies row does (23 Nov). */
  builderTemplateToggle: ALL,
  /** A new policy is stored only by a save from the builder, never by Create policy (23 Nov, owner). Until then it has
   *  no status pill, Save draft is ready, the pill says Unsaved changes and leaving asks. */
  newPolicyUnsaved: ALL,
  /** Trusted device → Device registration: "Registration MFA method", one dropdown: the user's active MFA or a method
   *  the admin picks, each with its mark (23 Nov, the dev's `registration_mfa_method`). */
  registrationMfa: ALL,
  /** Device profiles: an always-on signal's priority is locked like its tick, and Review does not list the always-on
   *  signals (23 Nov). */
  lockedSignals: ALL,
  /** Six applications no policy protects, on every tenant from the start, so a new policy has one to take
   *  (spare-apps.ts; 23 Nov, owner: "add some more apps which are not used … for all 3 roles"). */
  spareApps: ALL,
  /** The builder bar's status is a plain pill, and Make active / Make inactive / Monitor / View monitoring move into
   *  the bar's ⋯ (23 Nov, owner: "move it to the three dots … a static active and inactive pill only"). Design only
   *  since 24 Nov: it had reached every line without his word for the other two (owner: "Design only, fix wording"). Every line
   *  again on his word (25 Nov: "Groups A and B"), as are activeWords, templateNeedsRules, barOverPager and
   *  zonesHitsOverBar. */
  statusInMenu: ALL,
  /** The builder's Draft model switch, Today / Fix (23 Nov, owner: "only for me … inside the policy builder, I need a
   *  dropdown"; draft-model.ts). Fix: status kept apart from saving, Live / Draft view, a confirm before live changes.
   *  V3: publish, review and versions. Design only. */
  draftModels: ['design'],
  /** Fix's Live / Draft moves off the bar onto the canvas (24 Nov, owner: remove "Unsaved changes", put Live / Draft on
   *  the canvas, and drop the blue Live look). The bar's change pill goes; once the policy differs from live, the
   *  canvas's top-left chip is the switch ("Draft ▾" / "Live ▾", no app name: the start node says it), and Live keeps the board's own ground with
   *  the dots off. Fix only; V3 keeps its bar switch (draft-fix.tsx `CanvasViewPick`). Design only. */
  fixViewOnCanvas: ['design'],
  /** Fix's save is "Save and publish", not "Save policy" (24 Nov, owner: "change the button name to save and publish"):
   *  the bar's orange button, ⌘↵ in the command menu and the shortcuts sheet, the checks page's button and the "Update
   *  live policy?" confirm. Fix only; Today keeps Save policy, V3 its Publish. Design only. */
  saveAndPublish: ['design'],
  /** Fix's bar follows the version on screen (24 Nov, owner: "draft can't be active inactive but published can"; chose
   *  option A). The draft has no status: on it the status pill and Make active / inactive / Monitor leave the bar and
   *  the ⋯, and a never-published policy shows none. Published (the canvas chip's word for Live, with its status beside
   *  it in the menu) is read only: the pill and status rows, no saves, no Copy rules. "Update live policy?" reads
   *  "Publish this draft?" and the toasts say published. A first publish stays inactive; Discard stays out. With
   *  `fixViewOnCanvas`, Fix only. Design only. */
  versionBar: ['design'],
  /** The Draft model switch's fourth choice, "View and edit" (24 Nov, the stakeholders through the owner; artifact
   *  "Policy lifecycle states", round 2). A published policy, or a saved draft, opens view-only and Edit enters draft
   *  mode. Make active / inactive live only outside draft mode: the view, the Policies row and the application's head,
   *  where Make active sits beside Open policy until the policy is active. Applications join the draft. A policy with
   *  no application can only be saved as a draft. A first publish arrives Inactive. Show published policy opens the
   *  live version in a right-hand panel. Removing the only application, or deleting, is refused while active. Built on
   *  Fix (draft-model.ts `useViewEdit`). Design only. */
  viewEdit: ['design'],
  /** A rule with an empty part cannot be saved (board/rule-gaps.ts): Save policy and Save rule refuse and say why under
   *  the field; a new rule's Then starts unanswered. Every line, on the owner's word (23 Nov: "this specific part is for
   *  everywhere, for all three roles … a global change"). */
  ruleGaps: ALL,
  /** Migration makes one policy per application, never one shared by applications whose old settings match: the merge
   *  offer is gone (migrate/plan.ts). The admin adds or removes applications afterwards. Every line, on the owner's word
   *  (23 Nov: "in the migration policy, there cannot be two applications coupled … every policy should be coupled with
   *  only one … a global change for all three roles"). */
  oneAppMoves: ALL,
  /** The status confirms in active / inactive words: "Make this policy active?" / "Make active", "Make this policy
   *  inactive?", "Can't make this policy active", "Before making it active" (status-options.ts `ACTIVE_WORDS`), never Turn on
   *  / Turn off (5 Nov ruling). Design only (24 Nov, owner: "Design only, fix wording"). */
  activeWords: ALL,
  /** All Policies → More filters, compact: = / ≠ (is / is not) per field, app logos, faces and outcome marks in the
   *  lists, and the operator in the chip (23 Nov 2026, owner: "just like Jira … = and ≠ … in a dropdown"). Design only. */
  moreFiltersCompact: ['design'],
  /** All Policies: the one-line bar sits one layer above the table's sticky footer, so the More filters dropdown opens
   *  over the footer rather than under it (24 Nov, screens.css `.is-bar-over`). The Status menu portals out and was never
   *  under it. Design only. */
  barOverPager: ALL,
  /** Sign-in hours and Sign-in days as one condition, Sign-in time (Event time after sign-in): a summary line that opens
   *  a picker with each day's hours and the time zone; an overnight window belongs to the day it starts; seeded pairs
   *  read as one where that is exact (24 Nov, owner: "combine this together as one thing", schedule.ts). Design only. */
  signInTime: ['design'],
  /** The builder bar's preview switches (Draft model and Builder version) hide and come back together, with every pick
   *  kept in force: Hide in the version dropdown, and Ctrl+Shift+P both ways (25 Nov, owner: "add a option to hide we
   *  only have lock … a shortcut for hide and show", "should hide and reveal together"; builder-version.ts). Design only. */
  hideSwitches: ['design'],
  /** View and edit's Show published policy wears the published colour: the Active pill's green drifting between its two
   *  tints, a broadcast mark for the eye, and on hover a light across it and the signal going out (25 Nov, owner: "make it
   *  color animated, should feel like published, add a better icon, give the hover a cool interaction"). Design only. */
  publishedLook: ['design'],
  /** Mark as template only for a policy with something to hand on: no rule yet, or a rule not finished, greys the row in
   *  every ⋯ (builder, Policies row, application's Policies tab) with why in its pill, and the row's star stays away
   *  (25 Nov, owner: "this cannot be a template … maybe disable it … let the user know"). Narrows `draftTemplates` on
   *  Design. Design only. */
  templateNeedsRules: ALL,
  /** View and edit's mode buttons: "Edit policy" in the view, always secondary, and "Exit edit mode" in place of Done
   *  (25 Nov, owner: "don't call it Edit, call it something related to mode … Edit should be secondary in both ways",
   *  then "we can call it Edit Policy"; Make active unchanged). Design only. */
  modeButtons: ['design'],
  /** Show published policy opens on the left, in the board's leading track, and stays open while a rule's editor opens
   *  on the right: read the live version while editing the draft (25 Nov, owner: "this live policy should come from the
   *  left … the user can edit while checking the previous policy"). Design only. */
  publishedLeft: ['design'],
  /** All Policies: a policy's name opens the builder directly, with no Policy details slider, and the details card moves
   *  onto the builder bar's name, shown on hover or focus (25 Nov, owner: "I don't think we need this any more, go
   *  inside directly, and the policy card should move inside with the top bar, where on hover on the name we can see
   *  the card details"; BoardBar.tsx `PolicyCard`). The slider stays for an application's page. Design only. */
  directOpen: ['design'],
  /** "Nothing else matched" turns with the first rule: Allow while a policy has no rules, Deny once it has one, Allow
   *  again when the last is deleted, only while nobody has chosen it by hand. The card's colour changes in place, a ring
   *  runs round it, and a note beside it says what changed and why, with Allow instead (25 Nov, owner: "whenever I add my
   *  first rule … goes to Deny by default … the user should know why it's happening and how the transition works";
   *  board/default-flip.ts). Design only. */
  defaultFlips: ['design'],
  /** View and edit: a policy never published opens in draft mode; Active and the other published policies open in their
   *  view with Edit policy (25 Nov, owner: "Draft policy should open in draft mode. Active policy should open in view only
   *  with edit button"). Migrated drafts keep their review. Design only. */
  draftOpensEditing: ['design'],
  /** Zones → Locations: the Add location results open over the sticky Discard / Review & save bar, not under it
   *  (25 Nov, zones-final.css `.is-over-bar`). Every line, on the owner's word (25 Nov: "Groups A and B"). */
  zonesHitsOverBar: ALL,
  /** Authentication methods → General settings: Mobile issuer name and Device profile expiry wait for a footer's Cancel
   *  and Save; the switches still save as they are flicked (25 Nov, owner: "to store this two value we need a footer
   *  with save and cancel button"). Every line, on his word ("for all designers devs and testers"). */
  generalSave: ALL,
} as const satisfies Record<string, readonly Line[]>

export type Change = keyof typeof ROLLOUT

/** Whether the line open now shows this change. On the sign-in screen (no line) nothing is shown. */
export function shows(change: Change): boolean {
  return LINE !== null && (ROLLOUT[change] as readonly Line[]).includes(LINE)
}
