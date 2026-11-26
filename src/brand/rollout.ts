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
  /** An application's Policies tab with no policy and no Global Default to show draws the page empty state (drawing,
   *  "No policy on <app>", Create new policy orange + Add existing policy), not a heading over a blank page (26 Nov,
   *  app-policy-view.tsx `AppNoPolicyView`). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  appPoliciesEmpty: ALL,
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
  /** The widget picked up in Customize stays dark on the night board (26 Nov, owner: "when I pick any widget it turns
   *  into white in dark mode"). The lifted copy and its name chip open outside the page, so they take the night tokens
   *  from the document mark. Design only until the owner has checked it. */
  dashboardNightLift: ['design'],
  /** Dashboard interface review, the four HIGH findings (25 Nov): a visible focus ring on every board control, the
   *  full text of a cut-off row or label on hover and to screen readers, words beside colour-only states, and the
   *  row menu and remove button kept when the board stacks at narrow widths. Then the MEDIUM ones: Add widgets is
   *  neutral (Done is the dock's one orange), warning amber and sky/teal series 3:1 on white, Cancel offers Undo, the
   *  widget and layout popups hold focus, Customize tags' reasons reach screen readers, the row-layout picker is
   *  pressed buttons, and the two sentences explaining Customize are gone. Design only until the owner checks. */
  dashboardA11y: ['design'],
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
   *  Fix (draft-model.ts `useViewEdit`). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  viewEdit: ALL,
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
   *  color animated, should feel like published, add a better icon, give the hover a cool interaction"). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  publishedLook: ALL,
  /** Mark as template only for a policy with something to hand on: no rule yet, or a rule not finished, greys the row in
   *  every ⋯ (builder, Policies row, application's Policies tab) with why in its pill, and the row's star stays away
   *  (25 Nov, owner: "this cannot be a template … maybe disable it … let the user know"). Narrows `draftTemplates` on
   *  Design. Design only. */
  templateNeedsRules: ALL,
  /** View and edit's mode buttons: "Edit policy" in the view, always secondary, and "Exit edit mode" in place of Done
   *  (25 Nov, owner: "don't call it Edit, call it something related to mode … Edit should be secondary in both ways",
   *  then "we can call it Edit Policy"; Make active unchanged). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  modeButtons: ALL,
  /** Show published policy opens on the left, in the board's leading track, and stays open while a rule's editor opens
   *  on the right: read the live version while editing the draft (25 Nov, owner: "this live policy should come from the
   *  left … the user can edit while checking the previous policy"). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  publishedLeft: ALL,
  /** All Policies: a policy's name opens the builder directly, with no Policy details slider, and the details card moves
   *  onto the builder bar's name, shown on hover or focus (25 Nov, owner: "I don't think we need this any more, go
   *  inside directly, and the policy card should move inside with the top bar, where on hover on the name we can see
   *  the card details"; BoardBar.tsx `PolicyCard`). The slider stays for an application's page. Every line on the owner's word (26 Nov, "update all 3 roles"). */
  directOpen: ALL,
  /** "Nothing else matched" turns with the first rule: Allow while a policy has no rules, Deny once it has one, Allow
   *  again when the last is deleted, only while nobody has chosen it by hand. The card's colour changes in place, a ring
   *  runs round it, and a note beside it says what changed and why, with Allow instead (25 Nov, owner: "whenever I add my
   *  first rule … goes to Deny by default … the user should know why it's happening and how the transition works";
   *  board/default-flip.ts). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  defaultFlips: ALL,
  /** View and edit: a policy never published opens in draft mode; Active and the other published policies open in their
   *  view with Edit policy (25 Nov, owner: "Draft policy should open in draft mode. Active policy should open in view only
   *  with edit button"). Migrated drafts keep their review. Every line on the owner's word (26 Nov, "update all 3 roles"). */
  draftOpensEditing: ALL,
  /** Zones → Locations: the Add location results open over the sticky Discard / Review & save bar, not under it
   *  (25 Nov, zones-final.css `.is-over-bar`). Every line, on the owner's word (25 Nov: "Groups A and B"). */
  zonesHitsOverBar: ALL,
  /** Authentication methods → General settings: Mobile issuer name and Device profile expiry wait for a footer's Cancel
   *  and Save; the switches still save as they are flicked (25 Nov, owner: "to store this two value we need a footer
   *  with save and cancel button"). Every line, on his word ("for all designers devs and testers"). */
  generalSave: ALL,
  /** Device profiles → Download agent opens a centred pop-up with three large cards, Windows, macOS and Linux, and no
   *  mobile agents (25 Nov, owner: "We only have three options, so give it a big pop-up", "Remove the mobile part";
   *  agent-download.tsx). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  agentDownloadDialog: ALL,
  /** Device profile wizard, step 4 Review: the always-on signals (Device type and the rest) are listed with the chosen
   *  ones; the live preview beside the other steps still leaves them out (25 Nov, owner: "This should also showcase in
   *  review. the disabled one as well. not every time but here only in step 4"). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  reviewAlwaysOn: ALL,
  /** Zones → IP addresses → What you can add: IPv4 and IPv6 each get their own row and example, for an address and for
   *  a network, rather than one "IPv4 or IPv6" row (25 Nov, owner: "IPv4 and IPv6 can have their own examples, don't
   *  merge"; zone-notes-model.ts). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  zoneIpExamples: ALL,
  /** Zones → Locations: a city's Range is 1 or more, never 0, and a city added without one reads 1; a city range also
   *  matches a sign-in from that city by name, so 1 km never matches less than the city did (25 Nov, owner: "This
   *  should be one by default. can't have zero. for cities"; zone-entries.ts `CITY_RANGE_ONE`). Supersedes the 22 Sep
   *  "set to zero by default". Every line on the owner's word (26 Nov, "update all 3 roles"). */
  cityRangeOne: ALL,
  /** Zones: the page head's Note style switch (Note / Sticky note) is gone, and the Note is the one drawn (25 Nov,
   *  owner: "Hide this completely, this is not the part of the build"; zone-notes-model.ts). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  hideNoteStyle: ALL,
  /** Every free-text field (names, descriptions, messages, reasons) has a character limit and shows its count under
   *  it, "12/50" (25 Nov, owner: "Add character limit to all of the needed places"; char-limits.ts, CharCount.tsx).
   *  Every line on the owner's word (26 Nov, "update all 3 roles"). */
  charCounts: ALL,
  /** Trusted device signals: every attribute in the product's risk parameter list (42, from the dev's payload) is in
   *  the catalogue; the ones it lacked are added with the payload's category, priority and description, off until
   *  picked. Existing signals keep their values (25 Nov, owner: "don't need to change any values. Just check the name
   *  and add all of this"; fingerprint.ts). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  allRiskParameters: ALL,
  /** The toast after a status switch says "… is active" / "… is inactive", never "is on" / "is off", in the words of
   *  `activeWords`' confirms (25 Nov, owner: yes to fixing "… is off" after Make inactive; status-options.ts
   *  `statusToast`). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  activeToasts: ALL,
  /** Builder: saving the policy saves its rules too, so a rule card's "Unsaved" tag goes with Save policy / Save and
   *  publish, and with Save draft for every rule that has no empty part (25 Nov, noticed in the morning's builder
   *  review: the tag stayed after Save and publish; BoardBuilder.tsx `markRulesSaved`). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  rulesSaveWithPolicy: ALL,
  /** The Draft model switch's fifth choice, "Simple" (25 Nov evening, owner: "the goal is to make things short and
   *  simple"; draft-model.ts `useSimpleDraft`). View and edit with two saves only: Save draft keeps a draft and changes
   *  nothing live; Save policy makes the policy active, an Inactive one too, through Before making it active. With no
   *  application Save policy stores it inactive (reverses the 24 Nov "draft only" for Simple). Show live version, the
   *  green button, is in every edit state, greyed while nothing is live. No "publish" on its buttons or toasts. Later the
   *  same evening (owner): no Edit policy / Exit edit mode, the builder always edits; no Make active / Make inactive
   *  anywhere ("save means active"; Inactive is only a policy saved with no application), so removing the last
   *  application makes it inactive and delete needs no step first; Show live version waits for a change as the saves
   *  do; no Draft chip on the canvas. Every line on the owner's word (26 Nov, "update all 3 roles"). */
  simpleDraft: ALL,
  /** Policies: a policy's name opens the Policy details drawer again, with the status in its head (not again on its
   *  card) and Open in builder as its one button, no ⋯ (25 Nov evening, owner: "Bring back the drawer … include a
   *  dedicated status and button", then "3 dot can be removed"). Reverses `directOpen`'s row for the list; the builder
   *  bar's name card stays. Every line on the owner's word (26 Nov, "update all 3 roles"). */
  policyDrawer: ALL,
  /** Builder: the rule panel's Save rule in the solid accent (blue in the rebrand look, slate in the console look),
   *  where the light grey read as disabled (25 Nov evening, owner: "looks disabled … add another type of button here,
   *  not active because Save policy is"). Filled (23 Sep), never a second orange (board.css `.bb__inspfoot.is-slate`).
   *  Every line on the owner's word (26 Nov, "update all 3 roles"). */
  saveRuleLook: ALL,
  /** Builder: one filled button at a time. While the rule panel is open on a rule (or "Nothing else matched") with
   *  unsaved changes, the bar's primary (Activate policy in Simple) drops to secondary and its solid Save rule leads;
   *  the orange returns once the rule is saved. Save rule then closes the panel and focus goes back to the card
   *  (26 Nov 2026, owner: "two different types of active buttons … Both try to draw attention", chose "Bar quiets while
   *  editing"; then "after saving the rule, the right side panel should be automatically closed"). BoardBuilder.tsx
   *  `RULE_SAVE_FOCUS`. Same day, owner: with the bar muted, Save rule is the view's one orange while it has something to
   *  save (Inspector.tsx `saveLeads`; quiet grey when there is nothing), and in Simple a Save rule stores the policy's
   *  draft without leaving, so the head reads Active + Draft ("after saving rule I can't see any draft state").
   *  Every line on the owner's word (26 Nov, "update all 3 roles"). */
  ruleSaveFocus: ALL,
  /** More filters: no summary chip beside the button; the button itself lights in the active chip's colours while a
   *  filter is applied, and its title names them (25 Nov evening, owner: "can remove, and just make the More filters
   *  button active somehow with color"; more-filters.tsx). Clearing stays in the dropdown. Design only. */
  filtersOnButton: ['design'],
  /** Builder: "Nothing else matched"'s Save rule saves that row only, as every rule's does, never the whole policy
   *  (25 Nov evening, owner: changing it and pressing Save rule opened the make-active popup). A policy save marks it
   *  saved with the rules (`rulesSaveWithPolicy`). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  fallbackSavesRule: ALL,
  /** Builder, a rule's Who: a "Default" group stands for everyone the policy covers, in place of the "Applies to everyone
   *  by default" empty state. It starts ticked; ticking another group unticks it and the rule covers just those;
   *  unticking every group brings it back (25 Nov evening, owner: "Default, or pick groups"; WhoEditor.tsx). Stored as
   *  it always was: no groups named means everyone. Every line on the owner's word (26 Nov, "update all 3 roles"). */
  whoDefaultGroup: ALL,
  /** A big action ends on its list, with its toast: the builder's Save draft and main save go back to where the board
   *  was opened from (Policies, or the application's page); library pages' create and save close back to their list
   *  (25 Nov evening, owner: "don't let the user stay in the details page, they should be redirected to its main page
   *  with a toast"). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  backAfterSave: ALL,
  /** The Global Default Policy is no longer a concept: not seeded, not listed, not named; a sign-in to an application
   *  no policy covers is Blocked, said "No policy · Blocked" (25 Nov evening, owner: "remove global policy, completely
   *  not a concept any more", then "Blocked", "everywhere on Design"). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  noGlobalDefault: ALL,
  /** Policy details drawer: a policy with a saved draft gets a Draft / Live switch on its Rules, Draft picked first, and
   *  a Draft tag in the head while Draft shows (25 Nov night, owner: the drawer showed only the live rules of an active
   *  policy with a draft; kit Tabs, rules only, the card keeps the live applications and audience). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  drawerDraftRules: ALL,
  /** Simple's Activate policy says what it does after the press too: the confirm reads "Activate this policy?" (was "Save
   *  this policy?" above an Activate policy button) and the toast "<name> is active" (was "<name> saved"). Found in the
   *  26 Nov capture run; owner: "fix both". Every line on the owner's word (26 Nov, "update all 3 roles"). */
  simpleActivateWords: ALL,
  /** No policy goes live, or is saved as a policy, with no rule of its own: a policy whose only row is "Nothing else
   *  matched" as the product left it is refused with "Add a rule first" by the builder's main save (Save policy,
   *  Activate policy, Save and publish, Publish) and by every Make active. Save draft still works. An admin-edited last
   *  row still counts as a rule (23 Nov ruling). Found in the 26 Nov Tester run: Save policy put a policy with no rules
   *  live, "Now allowed 288" of 360 sign-ins. Owner: "Yes, block it". Every line on the owner's word (26 Nov, "update all 3 roles"). */
  noEmptyLive: ALL,
  /** A saved draft is no longer a pill beside Active (26 Nov, owner: "active and draft feels confusing", on the builder
   *  bar, the Policy details drawer and the Policies row). The status pill is the only pill: the builder's disabled Save
   *  draft reads "Draft saved" with a check, the row's Last activity reads "Draft saved <when>", and the drawer's head
   *  drops it (its Rules Draft / Live switch and Continue editing already say so). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  draftOffPill: ALL,
  /** Simple is the Draft model from now on: a first landing finds Simple picked in the Draft model dropdown (the pick is
   *  kept under a new key, so an older pick doesn't hold it), and a locked builder is Simple rather than Today (26 Nov,
   *  owner: "the simple will be the version that we are going for now on", and Simple while locked too). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  simpleFirst: ALL,
  /** A saved draft has its own tag again, "Has draft" with a pencil, beside the status pill rather than in its place:
   *  the status says what is live, the tag says a draft waits (26 Nov, owner: "I cannot see the draft part anywhere …
   *  active but also have draft"). On the Policies and Post sign-in tables, wherever PolicyStatus draws (application
   *  page, dialogs, Used by), the Policy details drawer's head and the builder's bar. Every line on the owner's word (26 Nov, "update all 3 roles"). */
  draftTag: ALL,
  /** Simple's Save rule saves the rule on the board only, never a draft: Save draft is the one way to store a draft, and
   *  leaving with rules saved this way asks Keep editing / Discard (26 Nov, owner: "when I click Save rule you save as
   *  draft automatically, that shouldn't happen … just save the rule and then let it be"). Reverses that part of
   *  `ruleSaveFocus`. Every line on the owner's word (26 Nov, "update all 3 roles"). */
  ruleSaveOnly: ALL,
  /** Sign-in time's picker opens on Per day: a row per day, Monday to Sunday, each with its tick, its own hours and All
   *  day, under the Every day / Weekdays / Weekends picks. The week strip is gone and the picker scrolls inside its
   *  popover when the screen is short (26 Nov, owner: "Monday … Sunday should have their own time-based hours … by
   *  default activate the per day … the widget cannot be scrolled … simplify"). Design only. */
  perDayFirst: ['design'],
  /** Simple's builder says by its look which version is on the board (26 Nov, owner: "Active … and Show live version
   *  both serve the same purpose … whatever you can see is in draft mode … distinguish it by the top bar"). Draft mode
   *  (a saved draft, edits not saved, or a policy never active): the canvas takes a cool tint (owner, the same day:
   *  "instead of changing the color of the top header … change the color of the canvas"), the bar's status pill gives
   *  way to a Draft tag, and "Show live version" is "Show active version". The active version with nothing changed: the
   *  plain canvas, the status pill and no version button. Every line on the owner's word (26 Nov, "update all 3 roles"). */
  draftLook: ALL,
  /** An application's Policies tab with no policy draws the application's own logo, a broken link and the outline of a
   *  policy, titled "No policy attached to <app>" (26 Nov, owner: "something related to the logo … the logo is not
   *  attached to any policy … think in a creative way"). Replaces `appPoliciesEmpty`'s generic drawing. Every line on the owner's word (26 Nov, "update all 3 roles"). */
  appEmptyLogo: ALL,
  /** All Policies rows: no Read as text in the row's ⋯ (26 Nov, owner: "No need"). The drawer it opened stays in the
   *  code for the other lines. Design only. */
  noRowReadText: ['design'],
  /** Add existing policy lists Active and Inactive sign-in policies only, as cards: the applications' logos (or the
   *  unlinked mark), the name and status, and "where · rules · who" (26 Nov, owner: "only showcase the Active and
   *  Inactive part … headless policies with no application and the policies which have some applications … redo the
   *  card layout and the content"). Drafts and Monitoring are not offered. Replace keeps its list. Every line on the owner's word (26 Nov, "update all 3 roles"). */
  addExistingCards: ALL,
  /** The "Nothing else matched is now Deny" note, in colour: a band in the new outcome's tint with the old outcome struck
   *  and the new one arriving with its shield and a ping, the word coloured in the title, and one primary — Keep Deny in
   *  the solid accent — over Allow instead (26 Nov, owner: "add some colors … focus on the allow and deny part … both
   *  have the same hierarchy"). Every line on the owner's word (26 Nov, "update all 3 roles"). */
  flipNoteLook: ALL,
  /** The canvas's sticky notes as pinned cards, coloured by purpose (26 Nov, owner: "the note should have some purpose
   *  … distinguished by color based on need … some of them have shared policies, and some of them have some issues", with
   *  pinned-card references): a white card with a glossy pin and a tinted panel. Shared policy peach, a copy lavender, an
   *  issue rose — a new note, "No application yet", with Add application — and the template preview's note blue.
   *  Design only. */
  stickyKinds: ['design'],
  /** Who, as counts: the panel's Groups and People rows say "1 group", "3 people" in link blue, and a press on the count
   *  opens the chosen list (the review) — the eye goes, the pencil stays; a rule card's who reads the same counts
   *  (26 Nov, owner: "just showcase the number … in blue text. On click, they showcase the review … the same goes
   *  inside the card … for both user and group"). Design only. */
  whoCount: ['design'],
  /** The Unsaved changes ask has a subheading, as the no-application ask does: "Your changes here are not saved yet.
   *  Save as draft to keep them, or discard them." (the save's own label in it). 26 Nov, owner: "add the subheading as
   *  we have for when we have no application and try to activate". Every screen that asks; Every line on the owner's word (26 Nov, "update all 3 roles"). */
  leaveSubhead: ALL,
  /** All Policies → Live policies: the selection bar offers Mark as template and Delete for the ticked rows, where it
   *  offered the review tab's Approve and Publish, greyed (26 Nov, owner: "we don't have any bulk option in live policy …
   *  they can bulk mark as template, and they can bulk delete"). One toast with Undo for the marks; one typed-DELETE
   *  dialog naming the policies for the delete. Under review keeps Approve and Publish. Design only. */
  bulkLive: ['design'],
  /** Five more seed policies for the edge cases (26 Nov, owner: "some should be inactive with no application, and some
   *  should be in draft"): two Inactive with no application, a never-active Draft on Workday, one with no application,
   *  and an Active policy on Salesforce with a saved draft (showcase-seed.ts `varietyPolicies`). Design only. */
  seedVariety: ['design'],
  /** The Policies table's checkboxes, drawn: an 18px rounded box, a blue fill with a white tick that scales in, a dash for
   *  a partial select-all, a hover halo and a focus ring; still the native input underneath (26 Nov, owner: "change the
   *  experience for the check box component, give me a better new one which looks pretty"). Design only. */
  checkLook: ['design'],
  /** Device profile reads "is" (no operator to pick) and carries one risk level, Any / Low / Medium / High, picked in its
   *  value menu: "Device profile is Corporate devices · High risk". The engine ANDs the profile with the device's risk
   *  score band (Low < 40, Medium 40–69, High ≥ 70). Device risk score leaves the attribute menu; conditions already
   *  written with it still read and run (26 Nov, owner: "device profile … =", "high, medium, low … together", "One level
   *  only", "is"). Design only. */
  profileRisk: ['design'],
  /** Then: Deny keeps the rule's factors and asks them before it denies — First factor, Second factor and its methods,
   *  then the deny message and email alerts — and switching Allow ↔ Deny clears nothing, so each side comes back as it
   *  was left. A Deny's step count is `Rule.denyAfter` (26 Nov, owner: "the allow configuration should be as it is and
   *  switch to deny … the same configuration for first factor and second factor in deny as well", then "Sign in, then
   *  deny"). Remember MFA stays with Allow. Design only. */
  denyFactors: ['design'],
  /** Card peeks: a rule card's who, each condition's values and its outcome open a small read-only peek on the canvas —
   *  the groups with their sizes and the people with their emails; a zone's entries, a device profile's checks and risk
   *  level, the days and hours; the steps in order and a Deny's message and alerts. Hover previews after a beat, a click
   *  pins it until Esc or a click elsewhere, Enter pins from the keyboard, one at a time (26 Nov, owner: "a small widget
   *  will open in the canvas and showcase what's inside", "Hover previews, click pins"). Design only. */
  cardPeeks: ['design'],
  /** The Dashboard's own Dark board / Light board button goes: the top bar's theme switch is the one dark-mode control
   *  (26 Nov, owner: "no need this any more, one dark mode button is enough"). Design only. */
  noDashDarkButton: ['design'],
  /** The checks before a save or an activation ("Save your edits?") take the hero shape of the Discard and "No
   *  application chosen" asks: rings and badge, a title, one line, two buttons. A failed check no longer stops it: the
   *  title says "Some checks did not pass", the line says which, and the admin picks Keep editing or "<Activate policy>
   *  anyway" (26 Nov, owner: "make this similar like we did for discard and application popups … let the user know
   *  something might go wrong … if he wants he can go, up to user"). Show details and the fixes wait for a later round.
   *  Every line on the owner's word (26 Nov, "update all 3 roles"). */
  guardHero: ALL,
  /** Manage columns on the list tables: a Columns button on the bar opens a tick per column — the name always there,
   *  the defaults on, and extras to add (Policies: Who, Rules, Modified by) — kept per table in the browser, with Reset
   *  to default (26 Nov, owner: "for every table … add Manage columns so the user can select what the user wanted to
   *  showcase in the table"; columns.ts, manage-columns.tsx). Design only. */
  manageColumns: ['design'],
  /** Empty states and their lines for a console with no Global Default (`noGlobalDefault`): no policy means sign-ins
   *  are blocked, never "fall through to the tenant default". All Policies' "No policies yet", the Applications list's
   *  "No policy" (was "Default only"), the protection slider's empty list and its callout, and the replace flow's
   *  meanwhile line say so; the slider's "tenant default isn't listed" note goes. Post sign-in gets the full page empty
   *  state with its drawing, as every policy page has (26 Nov, owner: "update the empty states … now we don't have any
   *  global default policies … all policies can have their own empty state"). Every line on the owner's word the same
   *  day ("Yes, all lines"), to match `noGlobalDefault`, which reached every line in cbbfaab. */
  emptyNoDefault: ALL,
  /** The whole console in dark, the Dashboard night board's way (26 Nov, owner: "go through the whole product and fix
   *  the dark mode, just like we did for the dashboard"). dark-theme.css says every token again in the `--night-*`
   *  palette, over the light-only rebrand, plus the screens that hard-code a light colour. Dark is reachable only where
   *  this and `topBarTools` both show (theme-mode.ts); everywhere else the page is light. Design only. */
  darkSweep: ['design'],
  /** The proposed User Dashboard (26 Nov, owner's demo for his manager; spec 2026-11-26-user-dashboard-design.md): a
   *  Today / Proposed switch on the end-user site, Apps + My account, Travel notice, and the admin's Requests. */
  userDashboard: ['design'],
} as const satisfies Record<string, readonly Line[]>

export type Change = keyof typeof ROLLOUT

/** Whether the line open now shows this change. On the sign-in screen (no line) nothing is shown. */
export function shows(change: Change): boolean {
  return LINE !== null && (ROLLOUT[change] as readonly Line[]).includes(LINE)
}
