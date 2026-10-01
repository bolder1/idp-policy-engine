# Handoff: start here

For Surajit (the owner) and for the next Claude Code session. State as of **1 Oct 2026**, at `main` d03d761 plus the consolidation.

## What this is

This is a clickable prototype of the **Policies** section of the miniOrange / Xecurify IdP admin console. It is React 19 + Vite + TypeScript, with no backend, and every tenant is seed data in memory. It is presented as a **showcase** of the chosen designs: one flag hides every A/B and preview switch (see [Flags](#flags-what-is-hidden-and-why)).

This folder is now the only place the work lives. Until 30 Sep, work was spread over a dozen `.claude/worktrees/*` trees and several session scratchpads. On 1 Oct everything was brought into this checkout on `main`. The product code is all in d03d761. Rigs, specs, research, the film pipeline and local copies of the claude.ai pages were carried in beside it (the [folder map](#where-things-are) below). Don't copy `src/` from any old worktree: a survey showed d03d761 supersedes all of it.

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
| `docs/specs/` | `TESTING-V4.md` (the Policy testing / Access checks spec) and `section11.md` to `section14.md`. `history/` holds the 26 to 28 Sep testing specs. |
| `docs/research/` | `refs.json`; `policy-testing-24-sep/` (the research doc's sources); `team-deck-28-sep/`; `scenario-sheet-22-sep/` (the manager's 16 use cases, audit, film briefs); `device-compliance/`; `notes/`; `competitors/` (Entra, Okta, Duo docs) |
| `docs/artifacts/` | `README.md` lists every claude.ai artifact with its link and status, plus local copies of the four walkthrough pages. Their videos are `media/*.mp4`, which is gitignored. |
| `docs/archive/` | Superseded docs (old builders, early audits). Its README says what replaced each. |
| `docs/rebrand-guideline.md` | The visual language the showcase uses |
| `docs/v0-policy-flow.md`, `docs/v5-mfa-experience.md` | Captures of the old deployed prototype. Code comments cite them as the Lite scope and the Recovery spec. |
| `tools/rigs/` | Playwright verification drivers and walkthrough / film recording rigs (text only), with a README |
| `video/` | The marketing-film pipeline source (capture, render, storyboard, audio). Run `npm install` inside it first. |
| `scripts/` | `fetch-logos.mjs` (`npm run logos`) and `record-demo.mjs` (`npm run demo:record`) |
| `local-archive/` | Gitignored, on disk only: the final walkthrough MP4s, the last marketing cut (cut 7, light, with .srt) and other big files |

## The product on 1 Oct 2026

**What is built.** The console runs in the live-console rebrand, light theme, Lite edition plus the testing features (`store.tsx` `features`). The rail's Policies section holds:

- **All Policies.** A table filtered All · Active · Draft · Inactive.
  - Statuses are Draft, Active, Inactive and Monitor (report-only), plus Always on for the Global Default.
  - New policy opens an *Untitled policy* draft straight into the builder, with no dialog.
  - The page's **Check access** button opens Access checks.
- **The builder (the board, "version 2").** A centred chain of rule cards (Centred skin) that opens like an accordion, one card at a time.
  - The right panel edits Who / If / Then, with condition dropdowns.
  - The bar has **Save policy** and the panel has **Save rule**. Saving an Active policy runs the checks first ("Before saving").
  - **Check access** in the bar runs the page's experience against the policy's *draft*. Past sign-ins is a bar button.
- **Access checks** (`SignInTests.tsx`). The form follows Entra's What If: Identity (User or Group), Application, then Sign-in conditions.
  - The run is a vertical chain: the sign-in card, then the policies on the application, then the deciding policy (the matched rule plus a rail of rule chips), then the outcome. The outcome includes a playing "What they see" sign-in.
  - **Why** sits in the right panel. It shows conflicts, and "As each group" for a person in several groups.
  - **Break-in attempts** has its own section in Why. It counts the deck run on the application in tenant order. Review attempts groups them by result, and pressing one plays it on the canvas.
  - **Fix in policy** opens the builder with the fix in its draft, with an Undo toast.
- **Libraries:** Templates, Zones (one Add location, a range per city), Device profiles (Device health / Trusted device), Risk signal profile (List version), Authentication methods (gear for one page, chevron for a panel), Display tokens (own page) and External hooks.
- **The showcase tenant** (`showcase-seed.ts`) has four scenario policies: HRMS from the offices, corporate devices, device compliance, dev tools. It adds Box for engineering / Box for design for the multi-group case, plus their zones, profiles and templates. The older estate in `data.ts` / `fixtures.ts` is the test estate only.
- **One evaluator** for every screen that says what a policy would do: `screens/simulate.ts`, `tenant-resolver.ts`, `sign-in-tests/engine-run.ts` and `conflicts.ts`.

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

### Waiting on the owner's pick (2 Oct 2026)

Two switches stay on screen even in the showcase build until he chooses; then pin the choice and delete the switch and the losing styles.

- **Toggle style** — on Authentication methods, page head: Blue (today's), Green, Grayscale, Navy, Outlined, Icons. App-wide via `html[data-toggle-style]`, remembered per viewer (`src/brand/toggle-style.ts`, the blocks in `kit.css`).
- **Note style** — on a zone's page head: Classic (the original card, as at d03d761), Sticky note, Clipboard, Pointer (`screens/zone-notes.tsx`, `zone-notes-model.ts`, `zones-final.css`). He cut Colours, Example rows, Inline tip, Note pile and Index card.
- Small open calls from the last review: Classic's example descriptions measure 3.93:1 (the original styling; `opacity: 0.78` on `.bz7__sidelist em` would pass); the Clipboard's top padding and the Pointer's notch were sized up from the research spec in the browser.

### Pending phases

- **Saved sign-ins:** the panel, saving from the form, and using one. Built and tested, but off.
- **People** inside a policy (`PEOPLE_AND_BREAK_IN`). Built, but off.
- **Accept as expected** for Break-in attempts on the Access checks page. Not built. The page already honours a result accepted in the builder.
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

- `main` is the only line of work. The old worktree branches (`claude/*`, the dated `2026-09-*` branches) are kept as archive backups. Don't merge them.
- Remotes:
  - `origin` = github.com/bolder1/idp-policy-engine. Vercel production (https://idp-policy-engine-zrhl.vercel.app) follows `origin/main`, which is at afd9391 (24 Sep).
  - `creator` = github.com/surajitdutta-creator/idp-policy-engine, at 6b2b67b.
- **Nothing has been pushed since then.** b67f2fc (Policy testing), d03d761 (Access checks), b266be9 (the consolidation) and 23ae818 (the 1–2 Oct review pass: zones, renames, CA chains, toggle styles) are local only, so the public showcase predates all of them.
- The worktrees were retired on 2 Oct 2026: each one's leftover changes were committed on its own branch as an "Archive:" commit first, so nothing was lost, then the folders were removed. Only `.claude/worktrees/keen-goldwasser-ce39db` may still be on disk (the session that did the consolidation ran from it); its branch `claude/pending-takes-backlog-15caea` is fully in `main`. Remove it with `git worktree remove --force .claude/worktrees/keen-goldwasser-ce39db` once nothing runs from it.
- **Both remotes are public** (`gh repo view`, 1 Oct). So the internal material is **local only — on this disk, never in git** (owner's choice, 1 Oct 2026): `docs/memory/`, `docs/research/`, `docs/artifacts/` and `tools/rigs/walkthroughs/` are in `.gitignore`. They hold tenant identifiers (the Okta integrator org and its admin URL, the Entra test user, a miniOrange test address, the Vercel project and team ids) and internal material (the manager's scenario sheet, the audits, the team deck, the memory notes). Everything else in the repo carries none of these; there are no passwords, tokens or cookies anywhere. Back the four folders up yourself if this disk is ever replaced.
- The owner's convention when he does push: push `main`, plus a `YYYY-MM-DD-<topic>` tracking branch for the day's work.

## Known gaps

- No interaction tests for the board or the Access checks canvas. The browser check is the only proof.
- 17 files still import deprecated lucide aliases (AlertTriangle, HelpCircle, MoreHorizontal …). They draw the same glyph, so this is hygiene only.
- The manager's scenario sheet (22 Sep) still has no answer for #10 (admin-dashboard step-up), #13 to #15 (UEM posture, registration quarantine, UEM providers), or #16 (plain-English authoring, built as Describe it but hidden).
- The public Vercel showcase is a week behind `main` (see Git).
