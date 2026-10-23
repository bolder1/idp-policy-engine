# Handoff: start here

For Surajit (the owner) and for the next Claude Code session. State as of **20 Oct 2026**. Everything to 20 Oct is committed: `main` = `origin/main` = the day branch `2026-10-20-app-glance-guided-setup-check-access` (see [16-20 Oct](#16-20-oct-2026-full-view-canvases-guided-setup-the-apps-policies-tab-at-a-glance-and-check-access-for-one-policy-per-app); the 13-15 Oct sections below are in the same commit). No worktree holds work that `main` lacks (see [Git](#git)).

## What this is

This is a clickable prototype of the **Policies** section of the miniOrange / Xecurify IdP admin console. It is React 19 + Vite + TypeScript, with no backend, and every tenant is seed data in memory. It is presented as a **showcase** of the chosen designs: one flag hides every A/B and preview switch (see [Flags](#flags-what-is-hidden-and-why)).

This folder is the home of the work. Until 30 Sep, work was spread over a dozen `.claude/worktrees/*` trees and several session scratchpads. On 1 Oct everything was brought into this checkout on `main`. Since then, the Access checks work has again been built in one worktree (`okta-device-policy-walkthrough-cea5b7`, :5181) and brought to `main` by fast-forward; see [Git](#git). Rigs, specs, research, the film pipeline and local copies of the claude.ai pages were carried in beside it (the [folder map](#where-things-are) below). Don't copy `src/` from any old worktree: a survey showed d03d761 supersedes all of it.

## Run it

```
npm install
npm run dev        # http://localhost:5173  (.claude/launch.json: "policy-prototype")
npm test           # vitest run, ~4400 tests in ~151 files
npm run build      # tsc -b && vite build
npm run preview    # serve the build; record films against this, never the dev server
```

Vite listens on `::1` only, so use `localhost:5173`, not `127.0.0.1`. The dev server is the owner's. Don't kill or restart it while he is using it.

## Verify a change

There is no CI. Run all four commands from the repo root before calling anything done:

| Command | Pass |
|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` | 0 errors |
| `npx oxlint` | warning count no higher than **27**. It exits 0 on warnings, so count them. |
| `npx vitest run` | all pass. Under load, five files can time out with no assertion failing: ui-copy, engine-run, impact-arena, board-views-ui and player-ui. Rerun them alone before you call a failure. player-ui "never an orange button" can run past its own 30 s cap even alone on a busy machine; it is synchronous, so its checks did pass. |
| `npm run build` | green |

**Then open it in the browser. This step is mandatory.** The UI tests render static markup only (`renderToStaticMarkup`, no jsdom), so nothing in the suite clicks, drags or animates. The board and the Access checks canvas are proven only by looking at them. Playwright 1.63 is in the repo's `node_modules`, and the drivers in [`tools/rigs/`](../tools/rigs/) can script a check.

Two traps:
- While the Browser pane is hidden, `requestAnimationFrame` delivers no frames. Motion animations then freeze, and closed dialogs stay mounted. That is not a product bug.
- Test in a tab you open yourself. The owner's tabs share localStorage (view, skin and theme keys).

## Where things are

| Path | What |
|---|---|
| `src/brand/` | The product: the console shell, store, seed data and every screen |
| `src/brand/screens/board/` | The policy builder (the board) |
| `src/brand/screens/SignInTests.tsx`, `screens/sign-in-tests/` | The Access checks page |
| `src/brand/showcase.ts`, `showcase-seed.ts` | The showcase flag and the presentation tenant |
| `CLAUDE.md` | Working rules for Claude Code sessions here |
| `docs/HANDOFF.md` | This file |
| `docs/memory/` | Snapshot of Claude's memory notes: the owner's rulings, one per note. The live copy is in `~/.claude/projects/C--New-folder-IDP-Policy-Engine/memory`. |
| `docs/specs/` | `TESTING-V4.md` (the Policy testing / Access checks spec), `section11.md` to `section14.md`, and the 5 to 6 Oct specs `DENIAL-REASONS.md`, `DENIAL-NEXT.md`, `CHECK-ACCESS-INSPECTOR.md`. `history/` holds the 26 to 28 Sep testing specs. |
| `docs/research/` | `refs.json`; `policy-testing-24-sep/` (the research doc's sources); `team-deck-28-sep/`; `scenario-sheet-22-sep/` (the manager's 16 use cases, audit, film briefs); `device-compliance/`; `notes/`; `competitors/` (Entra, Okta, Duo docs) |
| `docs/artifacts/` | `README.md` lists every claude.ai artifact with its link and status, plus local copies of the four walkthrough pages. Their videos are `media/*.mp4`, which is gitignored. |
| `docs/archive/` | Superseded docs (old builders, early audits). Its README says what replaced each. |
| `docs/rebrand-guideline.md` | The visual language the showcase uses |
| `docs/v0-policy-flow.md`, `docs/v5-mfa-experience.md` | Captures of the old deployed prototype. Code comments cite them as the Lite scope and the Recovery spec. |
| `tools/rigs/` | Playwright verification drivers and walkthrough / film recording rigs (text only), with a README |
| `video/` | The marketing-film pipeline source (capture, render, storyboard, audio). Run `npm install` inside it first. |
| `scripts/` | `fetch-logos.mjs` (`npm run logos`) and `record-demo.mjs` (`npm run demo:record`) |
| `local-archive/` | Gitignored, on disk only: the final walkthrough MP4s, the last marketing cut (cut 7, light, with .srt) and other big files |

## The product on 6 Oct 2026

**What is built.** The console runs in the live-console rebrand, light theme, Lite edition plus the testing features (`store.tsx` `features`). The rail's Policies section holds:

- **All Policies.** A table filtered All · Active · Draft · Inactive.
  - Statuses are Draft, Active, Inactive and Monitor (report-only), plus Always on for the Global Default.
  - New policy opens an *Untitled policy* draft straight into the builder, with no dialog.
  - The page's **Check access** button opens Access checks, and **Sign-in activity** beside it opens the week's sign-ins (owner, 5 Oct: "move the sign-in activities in the main policy screen").
- **The builder (the board, "version 2").** A centred chain of rule cards (Centred skin) that opens like an accordion, one card at a time.
  - The right panel edits Who / If / Then, with condition dropdowns.
  - The bar has **Save policy** and the panel has **Save rule**. Saving an Active policy runs the checks first ("Before saving").
  - **Check access** in the bar runs the page's experience against the policy's *draft* (it draws the column layout, with the Why panel, but not the inspector or Focus). Past sign-ins is a bar button.
- **Access checks** (`SignInTests.tsx`): see the next section. The form follows Entra's What If: Identity (a user or a group), Application, then Sign-in conditions.
- **Libraries:** Templates, Zones (one Add location, a range per city), Device profiles (Device health / Trusted device), Risk signal profile (List version), Authentication methods (gear for one page, chevron for a panel), Display tokens (own page) and External hooks.
- **The showcase tenant** (`showcase-seed.ts`) has four scenario policies: HRMS from the offices, corporate devices, device compliance, dev tools. It adds Box for engineering / Box for design for the multi-group case, plus their zones, profiles and templates. The older estate in `data.ts` / `fixtures.ts` is the test estate only.
- **One evaluator** for every screen that says what a policy would do: `screens/simulate.ts`, `tenant-resolver.ts`, `sign-in-tests/engine-run.ts` and `conflicts.ts`.

### Access checks, 3 to 6 Oct 2026

Committed in 5575ce7 and 306f64e (3 to 6 Oct), plus the uncommitted 6 Oct fixes marked below. Specs: `docs/specs/DENIAL-REASONS.md`, `DENIAL-NEXT.md`, `CHECK-ACCESS-INSPECTOR.md`.

- **The presented view is Focus** (`MAIN_VIEW = 'focus2'`). One view, no pickers: the Canvas switch, the Show shelves and the floating Ask Aruna are hidden behind flags (`CANVAS_PICKER`, `ARUNA_ENTRY`). The other layouts (Line, Tree, Gates, Marble, Chat, Deck, Depth, Aruna, Mission, Synapse and the rest) stay in the code.
  - Focus draws its run as **Classic v2**: four cards in the policy builder's own style (sign-in, policy selection, rules, outcome), Vertical by default and Horizontal as the second arrangement (owner, 5 Oct).
  - The **Brief** is on after every run and **Questions** is a panel; both sit in the canvas's foot bar. The walkthrough bar is off (`TRAIL_BAR`).
  - The sign-in row holds the form (Who, Application, conditions, Replay). Identity is **one user or one group** (`MULTI_IDENTITY = false`, owner 5 Oct); the several-at-once field is kept.
- **Denial reasons, admin only** (`DENIAL_REASONS`). The cause of a refusal is said in plain words in the outcome, Why and the blocked list. The Ref code and the reason never reach the end user's deny page, which shows the rule's message, next step and contact (owner, 5 Oct). A Deny rule's editor suggests a next step per reason; one press fills it, never automatically.
- **How to get in** (inside Why): the what-if chips that flip a refusal, run by the same evaluator.
- **Temporary access** (`TEMP_ACCESS`): Let in for a while, from a refusal's Why. It puts a first rule on the refusing policy that switches itself off after an end date (up to 30 days, with a reason). Not offered when the Global Default decided. Fixed 6 Oct (uncommitted): the date now counts on its own, so a grant that has ended no longer lets the person in when the time is cleared. A grant brings up the When row, and a date-only sign-in is shown as the date.
- **Sign-in activity** (`SignInActivity.tsx`, route `sign-in-activity`): the week's sign-ins across every application, with result, reason, deciding policy and rule. Filters (search, result, reason, application), the reasons report, Export CSV, and the **Policy changes** tab (who changed which policy). A row opens in place with Open in Access checks and Copy summary. It is a modelled sample and says so.
- **The change log** (`change-log.ts`, `store.changeLog`): every save and status change of a policy, with who and when. It feeds **What changed** in Why and the Policy changes tab. The showcase tenant starts with four seeded entries (dummy data).
- **Accept as expected** on a break-in attempt (`ACCEPT_ATTEMPTS`): a reason, who and when are recorded; Restore undoes it.
- **The details panel (the inspector)** (`INSPECTOR`; `InspectPanel.tsx`, `PeekViews.tsx`, `inspect-model.ts`, `peek-model.ts`, `inspect-facts.ts`, `inspect.css`). A read-only view of a policy, rule, zone, device profile, risk profile, hook, person or application, as it was at this sign-in, with **Edit in builder** as the one way out. Rulings: it opens **only from names inside the cards**, with no button in the canvas bar (`DETAILS_IN_BAR = false`) and no icon on a card's head; the policy view is its details only, with no Read as text tab (`READ_AS_TEXT_TAB = false`); Pin, Compare, Copy, Draft changes and Related are in. Fixed 6 Oct (uncommitted): on a Depends run the policy and rule views now say Depends, the rule it waits on, and "If not" for the rule the definite reading walks on to; the person's and the application's policy lists end with the Global Default, marked Default; a group check no longer shows the stand-in member as the person.
- **Why in Focus** (`WHY_IN_FOCUS`, 6 Oct, uncommitted; `layouts/focus2-why.tsx`). The outcome card ends in one quiet link ("Why, and how to get in", "Review conflict" or "Why") that opens the Why panel on the right, as the column's answer does. It is offered by the same rule as the column (a title plus a finding or a refusal reason) and only once the run has landed. The Why and the details panel are never open together. The builder's Check access and Classic v2 on its own are unchanged.
- **Page keys and focus** (`page-keys.ts`, 6 Oct, uncommitted). Escape closes the latest panel even after an attempt row is open (a plain disclosure does not hold Escape; a popup trigger does); when a panel closes, focus returns to the name or button that opened it.
- **Blocked sign-ins panel** (`BlockedDrawer.tsx`, a right-hand panel): find a person's refusal and open it in Why. It reads the same activity model as Sign-in activity.
- **Break-in panel** (`BreakInPanel.tsx`): the fifteen scripted sign-ins on the run's application, grouped by result, and pressing one plays it on the canvas. Fix in policy opens the builder with the fix in its draft, with an Undo toast.
- **Zone notes:** the zone page's Note style now has a **Blue** option beside Classic, Sticky note, Clipboard and Pointer (`zone-notes-model.ts`).

### Flags: what is hidden and why

Hidden means kept, not deleted. Flip the flag and the door comes back with everything behind it.

| Flag | File | Value | Effect | Why |
|---|---|---|---|---|
| `SHOWCASE` | `src/brand/showcase.ts` | `true` | Hides every A/B, preview and prototype control and pins the chosen value: rebrand on, light theme, compact width, Centred skin, Review list view, risk page List, persona Security IT Manager, no trail builder | Owner, 21 Sep: "only showcase the selected and final things" |
| `SAVED_SIGN_INS` | `screens/sign-in-tests/phase.ts` | `false` | Hides the Saved sign-ins panel, "Use a saved sign-in" and "Save sign-in" | Owner, 1 Oct: focus on Check access; saved sign-ins are a later phase |
| `BREAK_IN_ATTEMPTS` | `screens/sign-in-tests/phase.ts` | `true` | Break-in attempts on Access checks (also needs `features.breakInTest`) | Owner, 1 Oct: the test belongs in the access check, not the builder |
| `PEOPLE_AND_BREAK_IN` | `screens/board/test-mode.ts` | `false` | Hides People and the Break-in test inside the builder's Check access | Owner, 1 Oct: "hide people and break-in test as of now" |
| `BAR_DEMO`, `BAR_TOUR`, `BAR_READ` | `screens/board/bar-tools.ts` | `false` | Hides the builder bar's Demo · 1:16, Learn the board (and the first-visit walkthrough), and Read as text | Owner, 1 Oct: "hide this 3 as of now" |
| `ACCESS_CHECK`, `ACCESS_CHECKS` | `screens/sign-in-tests/names.ts` | `'Check access'`, `'Access checks'` | The names of the button and the page. The code still says sign-in-tests. | Owner, 1 Oct: "something related to access" |
| `features` | `src/brand/store.tsx` | lite + `policyTesting`, `breakInTest`, `draftChecks`; `describePolicy: false` | Describe it (the plain-English builder) is hidden | Owner, 30 Sep: "hide this, not needed as of now" |
| `CANVAS_OPTIONS` | `screens/sign-in-tests/phase.ts` | `true` | Master switch for the run's layouts. On, the page draws `shownLayout()`: Focus. Off, the original column. Not a product control; it reads its own flag, not `SHOWCASE`. | Owner, 1 Oct: "give me a fresh approach"; it now selects Focus |
| `DENIAL_REASONS` | `phase.ts` | `true` | The cause of a refusal in plain words, admin only (outcome, Why, blocked list, Sign-in activity) | Owner, 5 Oct: the reason is admin only |
| `TEMP_ACCESS` | `phase.ts` | `true` | Let in for a while in Why; a first rule that ends by itself | Overnight build, 5 to 6 Oct |
| `ACCEPT_ATTEMPTS` | `phase.ts` | `true` | Accept this result and Restore on a break-in attempt | Overnight build, 5 to 6 Oct |
| `MULTI_IDENTITY` | `phase.ts` | `false` | The several-at-once Identity field (`IdentityField.tsx`). Off: one user or one group (`IdentityFieldSingle.tsx`) | Owner, 5 Oct |
| `INSPECTOR` | `phase.ts` | `true` | The details panel: names in the cards open a read-only view | Owner, 6 Oct |
| `READ_AS_TEXT_TAB` | `phase.ts` | `false` | A Read as text tab in the policy's details | Owner, 6 Oct: "only the details view, no tabs" |
| `DETAILS_IN_BAR` | `phase.ts` | `false` | A Details button in the canvas bar | Owner, 6 Oct: "remove this button" |
| `WHY_IN_FOCUS` | `phase.ts` | `true` | The Why link at the end of Focus's outcome card, and the Why panel from it | Owner, 6 Oct; Focus is the one view he presents |
| `CANVAS_PICKER` | `screens/sign-in-tests/run-layout.ts` | `false` | The Show (Favourites / Archive) and Canvas pickers in the page head | Owner, 5 Oct: one view, hide the rest |
| `ARUNA_ENTRY` | `run-layout.ts` | `false` | The floating Ask Aruna on the canvas and her entrance | Owner, 5 Oct: one view, nothing else to choose |
| `MAIN_VIEW` | `run-layout.ts` | `'focus2'` | The layout drawn when the pickers are off | Owner, 5 Oct: Focus (Classic v2 cards) |
| `TRAIL_BAR`, `OUTCOME_EXTRAS` | `layouts/Focus2Layout.tsx` (file-local) | `false` | Focus's walkthrough bar; the v2 outcome extras (question links, group box, thumbnail) | Owner, 5 Oct: remove the bar; "the older version is good for this card" |
| `VERIFICATION_RULES_DRAWER` | `screens/auth-general.ts` | `false` | The Verification rules button beside the Authentication methods heading, and the slide-over it opens. Off, the General settings tab is the only way in | Owner, 21 Oct: "hide this for now" |
| `MORE_GENERAL_SETTINGS` | `screens/auth-general.ts` | `false` | On General settings, everything but who two-step verification is required of: the Sign-in section, the Changes to methods section, and the Me row. Gated inside `GeneralSettings`, so the slide-over loses them too | Owner, 22 Oct: "Hide this two", then "hide this as well … The me" |
| `HEAD_READS` | `screens/app-policy-view.tsx` | `false` | Whether Sign-in activity and Check access open from the app Policies head's ⋯ menu. Off, neither is on the menu (since 23 Oct it lists only what can be done; on 22 Oct both were listed, disabled, with "Coming soon"); `check()` and the activity panel stay wired | Owner, 22 Oct: "for the rest we can tell coming soon, will work on this two later"; 23 Oct: "remove this sub heading … show only Inactive" |
| `REPLACE_MAKES_DRAFT` | `screens/app-policies.ts` | `true` | Replace policy copies the pick onto this application as a draft instead of swapping the live policy in one press. On, the drawer's primary reads "Add as a draft", no checks run on the pick, and the tab shows a "Draft waiting" note. Off, the 22 Oct live swap returns: `replaceOnApp`, the apps guard and its `alsoAfter` wiring, all still in place | Owner, 22 Oct: "the pick becomes a draft copy on this app alone, nothing changes until I activate it" |
| `REMOVE_RUNS_CHECKS` | `screens/app-policies.ts` | `false` | Whether taking a policy off an application runs "Before saving: applications" first. Off, the remove confirm is the whole of it — it already names what becomes of the policy and, from the engine, every group and person who moves and to which policy. Gates the Policies tab and the protection panel; the builder's own Applications pane is a different gesture and still runs the checks | Owner, 23 Oct: "take the Before saving page off Remove as well, so the two paths are consistent" |
| `MONITOR_MODE` | `screens/status-options.ts` | `false` | Whether Monitoring is a real status switch. Off, no screen offers the switch or View monitoring. `statusMenu` (`app-policy-model.ts`) still announces it as a disabled Monitoring row with "Coming soon", but the app Policies tab's ⋯ menu drops disabled rows since 23 Oct, so it is not drawn there | Owner, 22 Oct: "Monitor should go to coming soon … just add coming soon and hide the function", then "move it down with the other coming soon items"; 23 Oct: the ⋯ menu shows only what can be done |
| `RULE_ON_OFF` | `screens/board/bar-tools.ts` | `false` | The rule on/off switch on the rule card and in the panel's rule head, the E key that switched the selected rule, and E's row in the ? sheet. The card still reads `rule.enabled` | Owner, 23 Oct: "Hide the toggle and remove this active inactive rule function as of now" |
| `PANEL_WIDTH_BUTTON` | `screens/board/bar-tools.ts` | `false` | The rule panel's Narrow / Widen button. The panel is 600 wide to start and at most, and the grip drags it between 480 and 600; back on, the button steps between those two (`NARROW` in `BoardBuilder.tsx`) | Owner, 23 Oct: "Remove this function as well, hide it … a better, bigger, single-stack form size" |
| `CONFIRM_LISTS` | `src/brand/kit.tsx` (file-local) | `false` | Whether a kit `Confirm` draws its lists of rows. Off, every confirm is the hero card: the sentence, then each section's heading, short caption and `more` with up to three of its names as pills (a name that opens its thing stays a button) | Owner, 23 Oct: "discard this style of popup where we showcase the full list — keep it but hide, and replace with … simple card with context" |
| `MOVES_LIST` | `screens/AppProtection.tsx` (file-local) | `false` | The per-group and per-person "Sign-ins move to" list in the Remove dialog (`RemoveDialog`). Off, the card says where the sign-ins go in one line and shows the applications that keep the policy as logos | Owner, 23 Oct: "make it more readable … add logos and icons … simple card with context" |
| Builder versions (`SINCE`, `useShows`) | `screens/board/builder-version.ts` | V0, locked | Which build of the builder is on screen, V0 to Full, behind a lock. See [Builder versions](#builder-versions) | Owner, 23 Oct: "a switch from V0 to Vn with the current build, so I can give the developer a good walkthrough of what to build when" |

### Waiting on the owner's pick (2 Oct 2026, updated 6 Oct)

One switch stays on screen even in the showcase build until he chooses; then pin the choice and delete the switch and the losing styles.

- **Toggle style — DECIDED 5 Oct 2026: Blue.** The switch and the five other styles are deleted; Blue is the plain `.bx-toggle` rules in `kit.css` (off = white with a dark edge and knob, disabled off = the grey pill), pinned by `src/brand/toggle.test.tsx`.
- **Note style** — on a zone's page head: Classic (the original card, as at d03d761), **Blue**, Sticky note, Clipboard, Pointer (`screens/zone-notes.tsx`, `zone-notes-model.ts`, `zones-final.css`). He cut Colours, Example rows, Inline tip, Note pile and Index card.
- Small open calls from the last review: Classic's example descriptions measure 3.93:1 (the original styling; `opacity: 0.78` on `.bz7__sidelist em` would pass); the Clipboard's top padding and the Pointer's notch were sized up from the research spec in the browser.

### Pending phases

- **Saved sign-ins:** the panel, saving from the form, and using one. Built and tested, but off.
- **People** inside a policy (`PEOPLE_AND_BREAK_IN`). Built, but off.
- **Accept as expected** for Break-in attempts is built (`ACCEPT_ATTEMPTS`, on). The builder's own Break-in test stays hidden.
- Also parked: Describe it; the review dialog on the bar (the bar saves directly); the device-profile Live builder (component exists, not wired); the trail builder.

## 7 to 9 Oct 2026: Access checks, Authentication methods, the condition menu (in `main`)

**Where it lives now.** This was built uncommitted in the `keen-goldwasser-ce39db` worktree (7 to 9 Oct), while `main` held an older partial copy. On 10 Oct, on the owner's word ("combine all the changes into this localhost"), it was merged into the main checkout and committed with the 10 Oct work: worktree-only files copied, files where `main` held an older copy took the worktree's, and the seven files both sides had changed were three-way merged against `main` as it stood before 10 Oct. The 9 Oct condition attribute menu was built on `main` directly. The worktree still has its own uncommitted copy; `main` supersedes it, so don't copy from it.

- **Authentication methods** is its own rail item (owner, 7 Oct: "move it outside Policies as a specific tab"), with the collapsed "What's new" card and the hands-on tour (`tour/MethodsTour.tsx`, `methods-tour.ts`). Display tokens lights it (`UNDER_ITEM`).
- **Fixes in the builder.** A Why finding's Fix opens the builder with the run's whole list in a Fixes panel (`board/FixesPanel.tsx`); the board route's `fix` is `{ conflicts, pressed }`.
- **Condition attribute menu (9 Oct).** See `docs/memory/condition-attribute-menu-9-oct.md`.

### Access checks

- **Why panel, group rows.** "As each group" no longer draws the person's own row ("As Maya (both)") when a group alone already gets her answer. That group's row is highlighted instead (`follows` on `GroupRowView`, `journey.ts`; `WhyCard.tsx`). The person's row stays only when no single group matches (the "Can't tell" case, a person whose groups together decide otherwise).
- **Open rule** sits right after Fix on a finding card, not pushed to the card's edge (`journey.css`, `.tj-find:is(.tj-why__att, .has-art)`).
- **Check access form footer.** "Changes not run yet" is gone (`TryPanel.tsx`); "Not run" on the sign-in card stays.
- **Policy details slider** (from Policies, `policy-details-drawer.tsx`): Rules is the builder's own chain, read only, at its own size, no pan, zoom or dock; a card unfolds to read its rule (`ReadOnlyCanvas` in `InspectPanel.tsx`, CSS at the end of `board/board.css`). The board's wheel handler is stopped so the slider scrolls. Applications and Audience: one value shows its name; several show the Policies table's logo stack and list under the pointer (`apps-peek.tsx`). **Past sign-ins is hidden** behind `PAST_IN_DETAILS = false` (kept, not deleted).
- **Tried and reverted:** (1) the canvas in the Access checks details panel. The accordion carries the run's per-rule states (Depends, "If not", "Not matched"), which a canvas cannot show, and 7 tests pin them. The panel keeps its accordion. (2) A single "Fix policy" button that steps through the fixes in the builder. Reverted on the owner's word; each finding keeps its own Fix and the builder's Fixes panel is still the list with Apply all. `tools/rigs/access-checks/s11.cjs` drives that old idea and is stale.

### Authentication methods (admin)

- The "All methods" filter menu is **admin only** (restored after it was removed for both sides). `USES` is a plain const again.

### Authentication methods (user dashboard: "Setup 2FA")

- No filter on the user side.
- **Row controls.** A family with one method is named for the method and carries its own controls on the row (`FamilyListRow`, `me` prop): not set up = blue **Configure** link; set up = gear (edit) + toggle (use). "Configured" sits beside the name, not at the row's end. Configure opens the slider with that method's form already open.
- **Security Questions and the other single-method sliders** are the method's own page: no card around the form, each question and each answer on its own row, **Cancel and Save in the slider footer** (`soloOpen`, `EnrolForm bare`, `.bmu__form--bare`).
- **SMS, call and email are not configured in the methods.** They send to the person's profile, which is not built, so there is dummy data: `PROFILE` in `user-methods.ts` (phone, email, **no alternate email**, so OTP over Alternate Email shows "Not on your profile"). The panel gets a read-only "From your profile" card (`ProfileFacts`); the cards have a toggle only; a single-method row shows the value as its line. `readyFor` and `configuredIds` treat these as ready when the profile holds what they send to.
- **Setup flows recreated from the live end-user page** (read 7 Oct 2026, nothing saved or switched on there):
  - Google, Microsoft, Authy Authenticator: 1 install (Android, iOS), 2 scan the QR or use the secret, 3 enter the passcode, Save or Cancel.
  - miniOrange OTP, Push, QR Verify: banner "update to 4.0.0 or higher", 1 install (Android, iOS, Windows), 2 scan the QR. No passcode, so the prototype has a **Confirm registration** button (the live page detects the scan itself). Modelled with `EnrolShape.setup: 'scan'` so the sign-in side keeps its kinds.
  - Microsoft Push: "MFA configuration not provided by the administrator…" (`setup: 'unavailable'`).
  - Yubikey: three text steps and an OTP field. RSA: three steps and a test link. Passkey: Platform vs Cross-platform authenticators, pick one, **Add device**. Security Questions use the live list of ten questions (`SECURITY_QUESTIONS`).
  - The Android/iOS/Windows buttons only show a toast (no store links found). The secret is a fixed dummy.

### Not verified in the browser

Yubikey, RSA, passkey and Security Questions forms, Save on any user form, the gear and toggle on a row, the Why-panel group rows after the last edit, and the 560px read-only canvas at phone width. Unit and render tests cover the markup, not the clicks.

### Open questions for the owner

- The "Fix policy" stepper idea was dropped, not decided against for good: say if you want it back.
- Does the Call family (voice code) also come from the profile? It does now, because it shares the phone shape.
- A profile page does not exist; `PROFILE` is a constant. Where should "change it in your profile" lead?

## 10 Oct 2026: Applications, Users, Groups and sounds

Product owners say most admins add policies from the application, right after creating it, so the app got a page of its own. Built from a design-panel spec, the live console's own pages (read in the owner's Chrome) and Mobbin research; the spec and the live-console notes are local only in `docs/research/` (`app-users-groups-spec-10-oct.md`, `live-console-apps-users-groups-10-oct.md`).

- **Application page** (`screens/ApplicationPage.tsx`, route `application`): the name in Apps opens it. Zone head with the rename pencil; line tabs Basic, Policies (default), Users, Groups. The Protection cell on Apps still opens the AppProtection drawer as the quick add.
  - **Policies:** earned-number rows (`PolicyRow`) and the ⌄ fallback row. **New policy** = an Untitled draft straight into the board; the board's back link returns to the app and the row flashes. **Add existing policy** (`AddExistingPolicy.tsx`) previews where it lands ("Position 3 · takes over from …", "Never decides"), flags a policy shared with other apps and one that names another app, and offers Add a copy. **Remove** says who moves where ("Sign-ins move to"), people in two groups included. Attaching or removing a live policy runs the board's Before saving checks (`board/apps-guard.ts`).
  - **Users / Groups** (`app-people-tabs.tsx`, `UserDrawer.tsx`): everyone in the directory with the policy that decides for them on this app.
  - **Basic:** Description; App secret (reveal, copy, Regenerate) on OIDC apps, saved through the SaveBar.
- **The model** (`screens/app-standing.ts`): `deciderFor` (in `tenant-resolver.ts`) is pinned by test to the engine's `governingPolicy` for every person on every app; row states, the remove prediction, membership effects, the Policies delete confirm and the Apps-list notes all read it.
- **Users** (`UsersPage.tsx`): User list (search, Group and Role filters, user drawer) and User roles. **Groups** (`GroupsPage.tsx`): the list and a group page with Basic, Assignment (live words: "Filter data by text or value", Assign users, Unassign user) and Applications. Unassign asks first only when someone's sign-in would change; every write has Undo.
- **Sounds** (`sound.ts`): synthesised Web Audio cues, no audio files. Every toast sounds by its tone; attach, publish, a Check access outcome, the first deciding policy on an app and a toggle have their own cues; a press never silences a warning or error. Speaker button in the top bar, `localStorage` `brand-sound`, on by default.
- **Fixed in shared code:** Escape now closes a drawer when focus is on a closed picker (`picker.tsx`); a bold word in a callout body no longer breaks onto its own line (`kit.css`); a toast's action runs once (`toast-action.ts`).
- **Gate on 10 Oct:** tsc 0, oxlint 27, vitest 5114 pass (`ui-copy` and `player-ui` pass alone), build ok. Browser-checked in the owner's :5173 and with `tools/rigs/app-pages/check.cjs` (screens, sound counts, phone width).
- **Open questions for the owner:** (1) the live console's add-from-app flow is group-first ("Assign Group": groups, then First factor / MFA / Adaptive); ours keeps the audience on the policy. Ask for groups when adding from an app? (2) Should a template set the policy's audience? (3) These pages count directory members while the Who picker uses each group's stated size: keep both? (4) What should a group's "Make Default" change?
- **Not built (toasts say so):** add, edit or delete users, roles and groups; group and membership custom fields; deleting an app; App Access Configuration; reordering policies from the app page.

## 21-23 Oct 2026: builder versions, the shared-policy slider, and two-button popups

Committed on 23 Oct as bb57bd8, f8bc83b and 3248a84, on `main` and the day branch `2026-10-23-popups-check-versions-auth-general`. The review fixes made after 3248a84 the same evening are uncommitted. The owner's rulings for the day are the memory note `rulings-23-oct-versions-popups-savebar.md`. The new flags are in the [table above](#flags-what-is-hidden-and-why).

### Builder versions

The builder is drawn as one of five builds, each the one before plus a named piece, so the developer can be walked through what to build first (`screens/board/builder-version.ts`).

| Version | Adds |
|---|---|
| V0 | Build a policy: the name and status, Save draft and Save policy, the start node, rules and the places to insert one, folding a card and Expand all, the panel's Who, If and Then with Duplicate and Delete. A deny has its message only. |
| V1 | Arrange it: reorder (the grip, Move up and Move down), undo and redo, fit and zoom, Copy who, and who the policy is narrowed to in the start node's sentence |
| V2 | A deny's Next step and Contact, and Discard in the bar |
| V3 | Check access and Past sign-ins |
| Full | Guide me on the canvas |

- `SINCE` names the first version of each piece, and `useShows(feature)` reads it where the piece's door is. Nothing is removed from the code: a higher version brings the piece back as it was.
- **Locked, it is V0.** Whatever was stored, a locked builder is V0 and the switch is not drawn, so nothing on screen says there are versions (owner: "don't let the developer know what the current version is").
- **Ctrl+P** asks for a password. Once it is right, a Builder version dropdown sits in the bar (`BuilderVersionSwitch.tsx`, mounted in `BoardBar.tsx`). Its last row, **Lock again**, goes back to V0 and hides the switch, and Ctrl+P does the same.
- Only the password's SHA-256 is in the repository, which is public. Never write the password into a tracked file. It is a door for a walkthrough, not security.
- The choice and the lock are kept in localStorage (`idp.builder.version`, `idp.builder.unlocked`). Restore both after a browser check.
- **The server render is Full, unlocked**, so the tests (static markup) see the whole builder and the switch.

### Screens and popups

- **Shared-policy slider** (`shared-policy-fork.tsx`). On an application's Policies tab, Edit policy on a policy more than one application uses opens a right slider, "Edit shared policy", with the policy named under the title.
  - Two option cards, one picked, in blue: **Edit for all** (picked first) and **Duplicate for** the application, with its logo.
  - Under them, the applications using it, this one first. Each says what the pick does to it: Changes, or Gets the copy and Keeps this policy. A search appears past six.
  - Foot: Cancel and one brand button named for the pick. The earlier fork dialog's hover previews were removed ("remove the whole hover").
- **The builder's sticky note** (`board/PolicyNotice.tsx`). A sticky note on the canvas, left of the rules beside the start node, with the applications as logos.
  - "Shared policy": a save reaches every application the policy is on, and everyone it covers there.
  - "A copy of …", on a draft copy: only the application it was copied for is on it, and the original keeps its other applications. A rename takes the note away.
  - Not drawn for post sign-in policies.
- **Turn off a shared policy** (`status-scope-dialog.tsx`). The app tab's ⋯ menu has one Inactive row. On a shared policy it asks "Turn off this policy?", with the applications as logos and two answers of equal width: **Only** the application (with its logo), which is Remove, and **Everywhere**, which makes the policy Inactive on all of them. The × is the way out. The answer is the confirmation, so no second confirm follows; Everywhere still runs the Before turning off checks when somebody would be newly let in, and Only here has Remove's Undo.
- **Popups have two buttons at most**, of equal width on the hero card. A kit `Confirm` given `alt` drops its Cancel. Titles are short and never hold a long policy name; applications carry their logos (`app-facts.tsx`). The Remove dialog (`AppProtection.tsx` `RemoveDialog`) is the model.
- **The save bar has no words**: Discard and the save, nothing else. A blocked save's reason is under its field.

## 16-20 Oct 2026: full-view canvases, Guided setup, the app's Policies tab at a glance, and Check access for one policy per app

Committed and pushed on 20 Oct, on the owner's word, as the day branch `2026-10-20-app-glance-guided-setup-check-access`; `main` was moved to it. The 13 to 19 Oct work is in the same commit: it was never committed day by day, and multi-day uncommitted work can't be split into commits that build (the 6 Oct finding, in [Git](#git)).

- **16 Oct: one Note for every note.** The kit `Note` is the What's new card. A zone's note can be shown as a Note or a Sticky.
- **19 Oct: canvases in full view** (`CANVAS_FULL_VIEW`, `Shell.tsx`). The builder and Access checks open without the rail or the top bar, with an open animation and Back in the screen's bar.
- **19 Oct: the app's Policies tab** shows the rules as the builder's read-only canvas (`RULES_CANVAS`). Changes is gone, and the app page is full width.
- **19 Oct: Guided setup**, which was Describe it (`GUIDED_SETUP`; spec `docs/specs/GUIDED-SETUP.md`).
  - It works with picks and forms only, on any draft or edit, from one door on the canvas.
  - The New rule form has four section rows: Applications, What happens, Who, Conditions.
  - A guided rule lands in the safest place automatically.
- **19 Oct: builder fixes.**
  - There is no Check access on an empty policy, and Past sign-ins is a separate control.
  - Save rule is a grey slate button.
  - Rule states read Complete (blue), Incomplete, a named warning (magenta) and Not set up.
  - Who's empty state reads "Applies to everyone by default".
- **20 Oct: the app's Policies tab at a glance** (`APP_POLICY_GLANCE`, `app-policy-view.tsx` + `app-activity.tsx` `GlanceActivity`).
  - Two panels share one fixed height, with their heads and feet aligned. The canvas scrolls inside its panel, and the Global Default sits in the rules panel's foot.
  - Sign-in activity has Find a person, Result and Rule filters and the console pager. Each row ends in a ⋯ menu (Open in Check access, Copy details). The columns read When · Person · From · Result · Rule.
  - A picked row rings the rule that decided it.
  - Who it covers shows one chip per group, a face beside its name.
- **20 Oct: Check access for one policy per app** (`ONE_POLICY_CARD`, `sign-in-tests/phase.ts`).
  - The run is the sign-in pill, then one Policy card, then the Outcome.
  - The Policy card lists its rules, each with an outcome badge. The Global Default is its foot, or a "why" line when it decides. The policy's Details button sits on the card's head; rows carry none.
  - The Outcome head says what the person goes through.
- **20 Oct: past and blocked sign-ins open at once** (`OPEN_AT_ONCE`). The run plays with no form showcase. This overrides "Only Run runs" for those entry points only.
- **20 Oct: Edit in builder** from the details panel now opens the policy builder, not its Check access.
- **In progress, not in this commit:** the run's motion, always animated (`RUN_MOTION`), the mega card (`MEGA_CARD`), and a Classic / Modern switch for Check access.
- **Gate, 20 Oct:** tsc 0, oxlint 27, vitest 5,555 pass in 225 files (`player-ui` and `focus2-layout` timed out under load and pass alone), build ok.

## 13 Oct 2026: Add application, the app's setup tabs, and Who at the start node

Owner, 13 Oct: "go through the app part, check how an app is created and try to mimic that with our use case, and fix the policy attachment and groups and users in that part." Spec: `docs/specs/APP-CREATE-AND-ACCESS.md` (v2, after an adversarial review on the rulings, the engine and admin UX). The live create flow was read in the owner's Chrome, read only and with nothing saved: local note `docs/research/live-console-app-create-13-oct.md`.

- **What the live console does.** Choose Application (a catalogue) leads to one tabbed form (Basic · Advanced · Login Options · Attributes · Policies · Provisioning/Metadata or Endpoints) with Cancel · Back · Next · Save. Policies, Metadata and Endpoints stay **locked until the app is saved**. Assign Group then makes one App Login Policy per group.
- **Choose application** (`screens/AppCatalog.tsx`, `app-catalog.ts`, route `application-new`):
  - search, a Type filter (All apps · SAML/WS-FED · OAuth/OpenID) and a Show filter (All apps · Custom apps)
  - "Submit new app request" (a toast)
  - Featured apps (AWS, Google Apps, Office 365, Salesforce), shown only while nothing narrows the page
  - All apps as button tiles: logo, name and protocol only (the "Added" pill was removed, owner 13 Oct)
- **The unsaved application** (`NewApplicationPage` in `ApplicationPage.tsx`) is the application page in a "new" mode, so create and edit are one form.
  - Tabs: Basic · Advanced · Sign-in options · Attributes · Policies · Metadata or Endpoints, with the live fields and defaults (`app-setup.ts`, `app-setup-forms.tsx`).
  - Footer: Cancel · Back · Next · Save, with Save on every tab and nothing disabled. A refused Save opens Basic with each problem under its field.
  - The Policies tab is usable before saving: New policy and Add existing policy save the app first, then carry on (Untitled draft into the board; or the app's page with the Add existing drawer open, `open: 'add-existing'`).
  - Metadata and Endpoints are readable before saving.
- **The saved application page** has the same tabs plus Users and Groups. Basic, Advanced, Sign-in options and Attributes share one draft and the SaveBar, blocked while Basic has a problem. "App secret" is now **Client secret**. Seed apps get made-up setup values (`setupOf`).
- **G1 answered (owner, 13 Oct): no group picking from an application.** No Assign groups door. Instead, **a policy's groups are seen and changed at the builder's start node**.
  - The sentence reads "A sign-in from **Finance** arrives at **Confluence**".
  - Its pane is "Who and applications": a Who section (Groups and People rows, the rule Who dialog worded for a policy) above Applications.
  - One Save stores both. A live policy runs Before saving through the apps guard, which now carries the audience (`apps-guard.ts`, `policy-details-review.ts` Who row).
- **Users tab:** the Deciding policy cell says how it reaches the person ("Through Finance", "By name", "For everyone"; nothing for the Global Default) (`reachOf`).
- **Elsewhere:**
  - The Protection drawer's Edit opens the board with `from`.
  - The end user's Apps page hides an app whose "Show on end user dashboard" is off.
  - Sign-in activity, Blocked and Past sign-ins leave out an app added this session (`App.addedAt`).
  - Change-log lines name applications rather than ids.
  - `SENT_TO_BOARD` (board-return.ts) is shared, so a first deciding policy is celebrated whichever door sent it.
- **Gate, 13 Oct:**
  - tsc 0 errors, oxlint 27 warnings, build ok.
  - vitest 5214 pass. Nine tests timed out under load and passed alone: ui-copy, engine-run, impact-arena, board-views-ui, player-ui, sign-in-tests-ui, focus2-ask, focus2-layout.
  - Browser-checked in my own tab: the catalogue, a refused Save, New policy from the unsaved app into the board, Who at the start node, the Users line, and Slack's Advanced tab.
- **Not built:**
  - deleting an application (needs ConfirmDelete's refuse-while-live, saved sign-ins and retired ids)
  - Provisioning, Import SP metadata, Upload app logo, Primary identity provider, SSO flows, WS-Fed and other app types
  - unassigning from the app page
- **Open for the owner:**
  1. A New policy still starts empty (last row Allow on 1 factor), so turning it on can loosen an app compared with the Global Default. The turn-on checks catch it. Should a new policy start from the Global Default's rules?
  2. Featured apps swap the live BigCommerce (JWT) and Cisco-ASA VPN (RADIUS) for types the prototype can create.

- **Later the same day (owner's picks):**
  - **Add existing policy** (`AddExistingPolicy.tsx`, 680 wide): a searchable list of policies instead of a dropdown. After a pick it shows "Selected policy" with Change policy, the line that says where it lands (logo, name, position pill), the two callouts (also on other apps, names another app), then the policy's own details page (`PolicyPage`, the same component as Policy details). Footer: **Duplicate and add** · **Add this policy**.
  - **The app's Policies tab** fills the height (`.bapr__frame`) with the Global Default pinned at the foot. Its buttons read **Create new policy** and Add existing policy.
  - **Risk signals:** each row has a Toggle ("Collected") instead of a checkbox.

## 14-15 Oct 2026: one policy per app, the app's Policies tab, and footers

All uncommitted on `main`. The gate on 15 Oct is in the last bullet.

- **One sign-in policy per application (owner, 14 Oct).**
  - `ownerOf()` in `app-policies.ts` is the test, and pickers show an app held by another policy as "In use".
  - Who belongs to rules only. A sign-in policy's start-node pane is "Applications", and each rule's Who has "Copy from another rule".
  - The application picker has three drawings behind `APP_PICKER_COMPARE` (`app-picker-view.ts`): Two lists, One list and Chips. The owner has not picked one yet.
  - Memory: `one-app-one-policy-14-oct.md`.
- **The app's Policies tab, rebuilt on 15 Oct.** Spec: `docs/specs/APP-POLICY-TAB.md`, from Mobbin research (local: `docs/research/app-policy-tab-15-oct.md`). It replaces the morning's bento, which is archived in `local-archive/2026-10-15-app-bento/`.
  - **Head:** two buttons, Replace policy and Edit (the one orange button). Status, Remove from {app} and Delete draft sit in the status pill's menu.
  - **Fact line:** "Who it covers" (faces and the number of people the policy decides for). "Other applications" appears only when the policy is shared.
  - **State line:** only for a draft, inactive, monitoring (with the plan line) or unpublished draft changes.
  - **Rules:** the policy's rules in place, at full width, one row open at a time. The rows end with "Nothing else matched", then "Outside {policy}", then the Global Default. Each row has its sign-ins over the last 7 days.
  - **Sign-in activity:** Find a person, a Rule link back to the row, and View all filtered to the app. Changes sit in a rail beside it.
  - **No policy:** the Global Default's own rules, read only.
  - **Code:** `app-policy-view.tsx`, `app-policy-model.ts` (pure, tested), `app-activity.tsx` and `sign-in-tests/activity-row.tsx` (shared with the Sign-in activity page).
  - **Data fix:** an app's sample sign-ins are drawn from its own policy's people (`appReport`). Before, Box's own rules decided none of them.
  - **Access checks:** `session.prefill` fills Access checks without running.
  - **Replace:** `replaceOnApp` makes Replace one write with one Undo.
  - Break-in stays behind `BREAK_IN_ON_APP = false`.
- **Footers end with the form (owner, 15 Oct).** Every `.bx-savebar` puts its words and buttons inside the form column (since 23 Oct it has no words, only Discard and the save; see [21-23 Oct](#21-23-oct-2026-builder-versions-the-shared-policy-slider-and-two-button-popups)). `footer-edge.ts` measures `.bz7__cols > :first-child`, else a `data-footer-edge` element, else `.bpage` inside its padding. The device profile wizard's progress bar is the form's width above 1120px. This supersedes the 16 Sep full-width stepper.
- **Open for the owner:**
  1. The picker drawing.
  2. The kit's face overlap clips two-letter initials such as "MB" (a kit-wide −5px).
  3. Active → Monitor has no Undo by design.
- **Gate, 15 Oct (evening):** tsc 0 errors, oxlint 27 warnings, vitest 5,380 pass in 216 files, build ok. Browser-checked in a headless rig (acceptance checks 5-23 in the spec) and in my own tab (Box, Salesforce, the wizard and four save footers at 1686, 1000 and 375px).

## 13 Oct 2026: Post sign-in policies

Owner's brief, 13 Oct: a second policy type that acts after sign-in, during the session. Spec: `docs/specs/POST-SIGN-IN-POLICIES.md`. Model: `src/brand/post-sign-in.ts`. MoM: https://claude.ai/artifact/9ymzcs2Ndd9y8CyQbXAYhu (private). Research (local): `docs/research/post-login-13-oct/`.

- **Rulings:**
  - The names are "Sign-in policy" and "Post sign-in policy" ("login" never appears).
  - The two types are kept apart, with no Monitoring.
  - Actions: Allow · Deny · Step up · Terminate session · Block device. Block device applies to that app only.
  - **The policy is independent of applications.** Apps are linked from the app's page, each link carrying that app's events. An event belongs to one policy at most.
  - **It uses the same board as sign-in policies**, with no new builder "until needed".
- **Model:**
  - `type: 'Session'`, `session: { links: [{ appId, eventIds }] }`, `appIds` mirrors the links.
  - Rules are `Policy.rules` with `Rule.action`. "Nothing else matched" is `fallback.action`.
  - `turnOnIssue` names the first rule, or the last row, with no action. The store's guards (`refusesStatus`, `settled`) keep an incomplete one a draft.
- **Policies page:**
  - Line tabs Sign-in · Post sign-in. The chosen tab is remembered in `brand-policies-type`.
  - New policy on Post sign-in opens an Untitled draft in the board.
  - The row menu has Edit, the status switch and Delete only.
- **The board** (`board/post-board.ts`, `PostThen.tsx`):
  - The start node reads "An event in Slack and 1 more". Its pane is Who plus the linked apps, read only, with their events.
  - The If menu has the 16 post conditions and drops the risk scores. Number conditions carry a unit, and Sign-in hours and days read Event hours and days.
  - Then has five action cards, and "Not set" until one is chosen. A refused save or Turn on marks the card and says why under its Then.
  - Left out for this type: Check access, Past sign-ins, Read as text, Describe it, the template chooser and the deny message.
- **App page:**
  - A Post sign-in tab (saved apps only) lists the linked policies with their events.
  - **Link policy** is a two-step slider: first the policy or Create new policy, then the events. Events another policy holds are disabled and named, and "Reported after" events are tagged. With nothing ticked, the reason appears under the list.
  - Each row has Edit events and Unlink (with Undo). Back from the board returns to this tab.
- **Seed:** "Data export protection" (Active, Salesforce + Microsoft 365) and "Collaboration tools" (Draft, Slack + GitHub Enterprise; its last row has no action).
- **Fence:** `post-sign-in-fence.test.tsx` keeps them out of the sign-in engine, `deciderFor`, app standing, Add existing, Protection, Access checks and Sign-in activity. Count tests count sign-in policies only.
- **Gate, 13 Oct (evening):**
  - tsc 0 errors, oxlint 27 warnings, build ok.
  - vitest 5316 pass. ui-copy and player-ui timed out under load and passed alone.
  - Browser-checked in my own tab: both tabs on Policies; a refused Turn on (toast, then the card marked on the board); the If menu; a number condition; the five actions; the start pane; save to Inactive; Back to the right tab; Salesforce's Post sign-in tab with Link policy (refusal, link, Undo toast, Back from the board); the sign-in tab leaving them out; the catalogue; a sign-in board unchanged.
- **Open for the owner:**
  1. Deny has no message for an event yet, because the sign-in default talks about signing in.
  2. Check access for events.
  3. Step up method and duration.
  4. Post sign-in on an unsaved application.
  5. Hide the Advanced, Sign-in options, Attributes and Metadata tabs behind a flag? (Asked 13 Oct: "don't need all forms.")

## House rules

These are the owner's rulings, and the details are in `docs/memory/`.

- **Tokens only.** Colours, spaces and radii come from `tokens.css` / `console-theme.css` / `rebrand.css` variables. Never restate a value in a screen sheet. `--accent` is slate and `--brand` is orange.
- **One orange (brand) button per view.** Selection is never orange. Destructive triggers are neutral, and red appears only inside the confirm.
- **Numbers once.** Tabs never carry counts, and each number appears in one useful place per view.
- **12px type floor**, one pill family, no decorative dots, light mode only.
- **Copy:** sentence case everywhere, and plain IdP admin language (buttons are verbs, labels are nouns, no storytelling). Never say AI, assistant, login / log in (say sign-in / sign in), gauntlet, blast radius or rehearse. `ui-copy.test.ts` enforces part of this.
- **Motion:** animate with Motion props only. Never set a CSS `transform` on a `motion.*` element, because Motion overwrites it. Honour reduced motion.
- **Product parity** means the live console's fields, words and order, never its control types.
- **Hide, don't delete.** New A/B or preview controls are gated on `SHOWCASE`. Later phases go behind a named flag.

## How the owner works

- **Research first.** Validate against primary sources and say what is verified and what is assumed. For docs, write the content only after the research is done.
- **Build my best, then he iterates.** At a fork, pick the recommended option, note it, and keep going. Ask only when a choice is irreversible or contradicts a ruling.
- **He reviews in the browser himself.** No videos, filmstrips or contact sheets as deliverables. Tell him the URL. (Competitor walkthrough films were the exception, because he asked for them.)
- **Fewer stages, faster.** Build, then one review-and-fix pass. Commit or push only when he asks.

## Artifacts

`docs/artifacts/README.md` lists every claude.ai artifact made for this work, with its link and status: the four policy walkthroughs (Entra, Okta, Duo, ours), the policy-testing research doc, the team deck and others. The artifacts belong to the old Claude account. **Six docs and the four walkthrough pages need re-sharing** with the new account (the pages link to each other by their claude.ai URLs); the README lists them. The walkthrough pages have local copies in `docs/artifacts/*-walkthrough/`. Each plays `media/<slug>.mp4` beside it (gitignored), and `local-archive/media/walkthroughs/` holds the same films under their recording names.

Test objects were left in the vendor tenants (Entra, Okta, Duo), all named "Claude test …". The owner chose to keep them, so don't delete them without asking. See `docs/memory/competitor-policy-walkthroughs.md`.

## Git

- `main` is the line of work. The old worktree branches (`claude/*`, the dated `2026-09-*` branches) are kept as archive backups. Don't merge them.
- **6 Oct 2026.** `main` was fast-forwarded to **306f64e** ("Specs: denial reasons, the troubleshooting plan, the Check access details panel"), on top of **5575ce7** ("Access checks, 3-6 Oct 2026: Focus and Classic v2, denial troubleshooting, the details panel") and 38dfd7e (2 Oct). The day's branch is `2026-10-06-check-access-troubleshooting`, at the same commit. Both were pushed to `origin` the same day with his OK (bolder1, then switched back), and Vercel production built 306f64e. The Why panel in Focus, the five Check access fixes and this handoff follow as the next commit on the same day branch.
- **Saved on a branch, not lost.** The main checkout's old reason-line draft was archived on `archive/2026-10-06-main-reason-line-draft` (00b4fff) and cleared. It is a backup, not a line of work.
- **12 Oct 2026.** One commit on the day branch `2026-10-12-applications-users-groups` carries the 7 to 9 Oct work (brought in from `keen-goldwasser-ce39db`), the 9 Oct condition menu and the 10 Oct Applications, Users, Groups and sounds build, with this handoff. `main` was fast-forwarded to it and both were pushed to `origin` on the owner's word. It is one commit, not one per day, because the days were never committed separately and their snapshots do not build on their own. Local backups of `src/` from before the 10 Oct build and before the merge are in `local-archive/snapshots/`.
- The `okta-device-policy-walkthrough-cea5b7` tree's 6 Oct fixes are in `main` (ebb547f and later); it differs only by its local `.claude/launch.json` :5181 config.
- Remotes:
  - `origin` = github.com/bolder1/idp-policy-engine. Vercel production (https://idp-policy-engine-zrhl.vercel.app) follows `origin/main`. Last pushed 12 Oct (`main` and `2026-10-12-applications-users-groups`). Pushing needs the `bolder1` account; check `gh auth status` for which account is active before a push.
  - `origin` (bolder1) is the only repo to manage (owner, 6 Oct 2026). The `creator` remote is not kept up to date and is not pushed to.
- Worktrees on disk (`git worktree list`): `okta-device-policy-walkthrough-cea5b7` (above), `sweet-blackwell-b5bb79` (at 306f64e on `claude/created-videos-list-eefb36`), `classic-mode-v2-551abb` (38dfd7e), `charming-banach-5e7569` and `unruffled-haslett-aca2da` (both e76b901), and `keen-goldwasser-ce39db` (at 90828b2 on `claude/background-tasks-account-switch-3e5f28`, with its own uncommitted copy of the 7 to 9 Oct work, which `main` supersedes). Before removing ANY worktree: `git -C <tree> status`, and check that no session or dev server is working in it. A clean status at an earlier survey is not enough.
- **Both remotes are public** (`gh repo view`, 1 Oct). So the internal material is **local only — on this disk, never in git** (owner's choice, 1 Oct 2026): `docs/memory/`, `docs/research/`, `docs/artifacts/` and `tools/rigs/walkthroughs/` are in `.gitignore`. They hold tenant identifiers (the Okta integrator org and its admin URL, the Entra test user, a miniOrange test address, the Vercel project and team ids) and internal material (the manager's scenario sheet, the audits, the team deck, the memory notes). Everything else in the repo carries none of these; there are no passwords, tokens or cookies anywhere. Back the four folders up yourself if this disk is ever replaced.
- The owner's convention when he does push: push `main`, plus a `YYYY-MM-DD-<topic>` tracking branch for the day's work.

## Known gaps

- No interaction tests for the board or the Access checks canvas. The browser check is the only proof.
- 17 files still import deprecated lucide aliases (AlertTriangle, HelpCircle, MoreHorizontal …). They draw the same glyph, so this is hygiene only.
- The manager's scenario sheet (22 Sep) still has no answer for #10 (admin-dashboard step-up), #13 to #15 (UEM posture, registration quarantine, UEM providers), or #16 (plain-English authoring, built as Describe it but hidden).
- Access checks, as of 6 Oct 2026:
  - The zone, device, risk and hook views in the details panel do not read the sign-in: they show the object, not which entry matched or failed.
  - Nothing says why each *other* policy on the application did not apply, only that it did not decide.
  - Rows in Sign-in activity cannot open the details panel; they open in place and into Access checks.
  - The builder's Check access has no details panel and no Why in Focus (it draws the column).
  - There is no showcase hook, so a hook condition cannot be tested in the showcase tenant.
  - The change log records policies only: not zones, device profiles, risk profiles or hooks, and not full snapshots, so there is no "in place on a date" evidence view.
  - Not built: alerts when refusals jump after a change; more reasons (no method enrolled, account off) because the evaluator does not read that state; a tenant default-contact setting (`TENANT_DENY_CONTACT` in `data.ts` is one constant); real remediation links.
  - Sign-in activity is a modelled sample, not a log.
  - The 6 Oct fixes are proven by tests and, for Why in Focus, a browser check in the owner's :5181 tab; the rest of the 6 Oct fixes have not had a full browser pass.
- The public Vercel showcase builds `origin/main`, so it shows whatever was last pushed (see Git).
