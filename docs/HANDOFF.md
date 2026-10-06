# Handoff: start here

For Surajit (the owner) and for the next Claude Code session. State as of **6 Oct 2026**. `main` and the day branch `2026-10-06-check-access-troubleshooting` are at **306f64e**. The 6 Oct fixes described under [Access checks, 3 to 6 Oct](#access-checks-3-to-6-oct-2026) are **uncommitted** in the `okta-device-policy-walkthrough-cea5b7` worktree (served on :5181) until the owner asks for a commit.

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
- **Uncommitted, in the `okta-device-policy-walkthrough-cea5b7` worktree** (branch `2026-10-06-check-access-troubleshooting`, :5181): the 6 Oct fixes (Why in Focus, the details-panel fixes, page keys and focus, the temporary-access date) and the `.claude/launch.json` :5181 config, which stays local. Commit them there when the owner asks, then fast-forward `main`.
- Remotes:
  - `origin` = github.com/bolder1/idp-policy-engine. Vercel production (https://idp-policy-engine-zrhl.vercel.app) follows `origin/main`. Last pushed 6 Oct (306f64e and the day branch). Pushing needs the `bolder1` account: the active `gh` account is read-only there, so switch with his OK and switch back.
  - `creator` = github.com/surajitdutta-creator/idp-policy-engine, last known at 6b2b67b (1 Oct).
- Worktrees on disk (`git worktree list`): `okta-device-policy-walkthrough-cea5b7` (live, above), `sweet-blackwell-b5bb79` (at 306f64e on `claude/created-videos-list-eefb36`), `classic-mode-v2-551abb` (38dfd7e), `charming-banach-5e7569` and `unruffled-haslett-aca2da` (both e76b901), and `keen-goldwasser-ce39db` (detached at eb8310d, fully in `main`). Before removing ANY worktree: `git -C <tree> status`, and check that no session or dev server is working in it. A clean status at an earlier survey is not enough.
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
- The public Vercel showcase predates the 3 to 6 Oct work unless `origin/main` has moved (see Git).
