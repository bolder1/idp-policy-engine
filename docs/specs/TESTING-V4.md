# Policy testing V4 — refined experience (28 Sep 2026)

> **1 Oct 2026:** the repo, branch and port below, and the Playwright recipe in section 6, are historical. The work is now in `C:/New folder/IDP Policy Engine` on `main`, at http://localhost:5173, with `require('playwright')` from the repo root. See `docs/specs/README.md`.

Owner critique of V3 (commit b67f2fc) and the research that answers it. This spec is the contract for
the build. Repo (since 29 Sep 19:50): `C:/New folder/IDP Policy Engine/.claude/worktrees/keen-goldwasser-ce39db` (branch
claude/pending-takes-backlog-15caea, HEAD b67f2fc + the uncommitted V4 work copied from recursing-mcclintock-42c606, which is
now a stale backup — never edit it). Dev server for THIS tree: http://localhost:5320/ (5173 is the main checkout's — never
use or kill it). All paths below are relative to the repo.

## 0. What the owner said (verbatim intent)

1. "Test sign-in is very confusing and too context heavy… the right form feels overwhelming."
2. "Check a person and Saved sign-ins look weird inside [a policy] — why can I see all the apps for one
   user inside a panel where I only add this policy for specific apps?" Use multiple panels (IDE
   background-tasks / terminal style) if that helps. Global things belong outside the policy, with a
   shortcut from inside.
3. "Describe" opens from the LEFT like Lovable; text is primary, everything else derived from the text —
   progressive disclosure, ask as few questions as possible.
4. The simulator "sucks": too much text; use pills and hierarchy; easy to scan; "mesmerizing, animated,
   interactive". A new kind of canvas is allowed if cards don't work.
5. "Pick one by one and polish end to end." Reports may use dummy data.

## 1. Principles (every surface)

- **Segregate.** Inside a policy show only this policy's applications, audience and saved sign-ins. The
  tenant-wide library and tester live on the new **Sign-in tests** page; the policy gets a shortcut.
- **The canvas answers, the dock explains.** The board IS the trace. Lists and reports live in a docked
  panel under the canvas, one tab per concern. Never a stacked form.
- **A sentence of pills, not a form.** Only the facts the rules on this application read get a token.
- **Colour means verdict.** Green/amber/red only on decisions (DECISION_TONE via `DecisionBadge`) and on a
  failed check. Input tokens are neutral; the token whose popover is open is the accent (blue in the
  rebrand look, `--accent*` tokens). No rainbow pills. No dots on pills, no dashed/dotted pills.
- **One pill family.** Use kit `Badge`/`Chip` geometry and `--pill-*` tokens. 12px floor, sentence case.
- **Motion with purpose.** A run takes ~1.2 s: the marker travels, each reached card's check pills tick in
  (50–60 ms stagger), the matched card rings, the outcome lands. Reduced motion = final state at once.
  Never a CSS `transform`/`transition` on an element motion animates (motion writes `transform` inline);
  animate with motion props or on a non-motion wrapper. Stylesheet tests enforce this for
  `try-sign-in.css`, `testing.css`, `describe.css`, `monitoring-page.css`.
- **Words.** Plain admin copy, sentence case, verbs on buttons, nouns on labels. No "AI", "assistant",
  "login"/"log in", "gauntlet", "blast radius", "rehearse". No Sparkles/Wand icons. Numbers once per view,
  never on tabs. No sentences explaining the UI; caveats go in `TipDot` tooltips. "Can't tell" is grey
  text, never a badge.
- **Tokens only.** No hex, no rgba in stylesheets; `var(--…)` from `src/brand/console-theme.css`.
  Selection/active = `--accent`, `--accent-soft`, `--accent-soft-border`, `--accent-strong`.
  Feedback = `--fb-positive-*`, `--fb-notice-*`, `--fb-negative-*`, `--fb-neutral-*`.
  Surfaces `--surface-raised`, `--surface-sunken`, `--surface-inset`; borders `--border-subtle|default|strong`;
  text `--text-primary|secondary|tertiary`; elevation `--el-low|mid|high`; radius `--radius-sm|md|lg|xl`.

## 2. Step 1 — Try a sign-in inside a policy (the board)

### 2.1 Layout while testing
- Entry and exit unchanged: bar button **Try a sign-in** (pressed = accent), `T`, the command palette, the
  Policies row menu, route `open:'try'|'person'|'saved'|'break-in'`. Esc / × closes.
- The right column is **no longer used for testing**. `.bb.is-testing` stops reserving the 492 px track;
  the canvas takes the full width. Clicking a rule card in test mode still opens the Inspector in the right
  column for editing (existing swap behaviour); closing it returns to the full-width test canvas.
- Three layers on the canvas, none of them a form:
  1. **Sign-in bar** — pinned top-centre over the canvas (not inside the pan/zoom world).
  2. **The trace** — the board's own chain, in test style.
  3. **Tests dock** — docked at the bottom of the canvas column, IDE-style.

### 2.2 Sign-in bar (`SignInSentence`)
A raised card (`--surface-raised`, `--border-subtle`, `--radius-lg`, `--el-mid`), max-width 960 px, centred,
12 px from the top of the stage. Content, one line (wraps to two when narrow):

`[face Arun Patel ▾] signs in to [logo GitHub Enterprise ▾] from [icon Office network ▾] on [mark Windows 11 laptop ▾] at [09:30 ▾] with risk [12 ▾]`

- Connector words ("signs in to", "from", "on", "at", "with risk") are plain `--text-secondary` text.
- Tokens: 30 px high pills, `--ctl-bg` fill, hairline `--border-default`, `--radius-md`, 14 px leading
  mark (Face avatar / AppLogo / lucide icon / PlatformMark), medium-weight value, small chevron. Hover one
  step darker. Open = `--accent-soft` fill + `--accent` border + `--accent-strong` text.
- **Which tokens appear** (progressive disclosure) — computed from `rowsRead(policies, draft, appId, lib)`:
  person, application and "from" always; device only when a rule on this app reads the device; time only
  when a rule reads time; risk only when a rule reads risk; place/distance live inside the "from" popover
  and appear there only when read.
- **Popover per token**, anchored under it, portalled to the app root, fixed-positioned, `--z-popover`
  (copy the Picker placement recipe in `src/brand/picker.tsx`). Search first where the list is long.
  Enter/click commits and closes; Esc closes; Tab moves to the next token.
  - Person: `personOptions(users, groups, draft.audience)` — groups "In this policy" then "Not in this
    policy", Face avatars.
  - Application: **only this policy's apps** (`draft.appIds`); a system/Global Default policy lists every
    app; a draft with no apps lists every app under the heading "As if on".
  - From: the four `ORIGIN_PRESETS` as rows with icons (office, branch, home, anonymiser), then an
    **IP address** field (typed, commits after 300 ms idle / Enter / blur, error beside it), then —
    only when read — Place (picker) and Distance (the existing ruler). Reuse the row components already in
    `testing/SignInFields.tsx` (export them rather than duplicating).
  - Device: `DEVICE_PRESETS` with platform marks; "Edit details" discloses the detail rows in place.
  - Time: date + time + time zone, with the band strip where it exists.
  - Risk: the risk slider with its bands.
- **Right cluster** of the card: the verdict — the right-hand column's decision as a `DecisionBadge`
  (`Depends` / `Can't tell` as grey text) — then icon buttons **Replay** (RotateCcw), **Save sign-in**
  (BookmarkPlus), a hairline separator, **Close Try a sign-in** (X). Back/Next stage buttons are removed.
- When the board differs from what decides today, the verdict is two pills with a quiet arrow:
  `[Allow on 1 factor] → [Deny]`, with the column names ("Live", "Your edits", "Today", "Stored version",
  "Draft" — from `columnView`) in a tooltip on each pill and in the accessible name.
- **One why-line** under the sentence, inside the card, `--text-secondary` 13 px: the rule that decided
  (`Rule 1 · In the office on a compliant device`), or "Decided by Global Default Policy" + the reason
  (not in audience / not on this app), or "Needs: IP address" for Can't tell. Never more than one line.
- **Save sign-in** opens a popover anchored to the bookmark with the existing `SaveSignInForm`
  (Name, Expected, Level; quiet secondary Save). Saved sign-ins are tenant data (the global library).
- The status (aria-live) region stays in BoardBuilder (it must outlive the bar). Keep the run sentences.

### 2.3 The trace (replaces gates + evidence rows + Decision card)
Keep the chain, the marker (`RouteMarker` shared layout `bb-route`) and the run clock
(`try-sign-in-run.ts`). Change what is drawn:
- **Start node**: the start pill shows `[face] Arun Patel → [logo] GitHub Enterprise`. Who (audience) is a
  small pill on it: "In this policy" (neutral, green check glyph) or "Not in this policy" (negative tint).
  The separate Who gate is gone.
- **Which policy**: when THIS policy decides, a tiny neutral pill on the spine: "This policy decides".
  When another policy decides, one gate card: "Decided by {policy}" + reason pill + a disclosure for the
  compact `WhichPolicy` list (keep `WhichGate`, restyled). Every rule card then reads "Not reached".
- **Rule card in test mode** (folded, as today) — head row: index, name, and on the right the rule's
  outcome pill (the rule's THEN as `DecisionBadge`), full tone only on the matched card, muted
  (`--fb-neutral-*`) elsewhere. Under the head, **one row of check pills**, one per evidence line
  (`CardEvidence.lines`): `[category icon] short requirement [✓ | ✕ | ?]`.
  - Pill text = the short requirement the rule checks — zone name, device profile name, group names
    (first two + "+N"), "Mon–Fri 09:00–18:00", "Risk above 70", person names — derived from the rule's
    condition and the tenant (NOT the long `actual · required` sentence).
  - Status glyph: pass = green check (lucide Check in `--fb-positive-fg`) on a neutral pill; fail = the
    whole pill in the negative tint with ✕; can't tell = neutral pill with `?` in `--text-tertiary`.
  - Tooltip (kit `Tip`) on every pill: the evidence `actual · required` line, plus the line's own tip.
- **Card states** — matched: 2 px `--accent` ring, `--el-mid` shadow, full opacity; no match: card text
  steps down to `--text-tertiary`, border `--border-subtle`, failing pill stays vivid; not reached / switched
  off: 45 % opacity, no pills, a small "Not reached" / "Switched off" word. The last row ("Nothing else
  matched") follows the same rules.
- **Spine**: connectors on the lit path (sign-in → landing) draw in `--accent` as the marker passes; the
  rest stay `--border-default`.
- **Outcome end node** (replaces `RouteDecision`): centred under the last row, 2 px accent spine into it.
  Big `DecisionBadge` (Depends: the possible outcomes as mini rows "If rule 1 matches → [badge]",
  "If not → [badge]", then "Needs: …"). Under it the rule line, then — when versions differ —
  "Live [badge] → Your edits [badge]". A "Changed by IP address" chip appears after an update that moved
  the answer, and fades after ~2.5 s. A quiet "What they see" button opens a popover with `WhatTheySee`.
  Keep the "Modelled result" TipDot note.
- **Motion**: marker ≤180 ms per hop, ≤1.1 s total (unchanged). As the marker reaches a card its pills
  appear left→right with a 50 ms stagger (opacity + a small scale on the glyph, via motion props). The
  matched card's ring pulses once (box-shadow keyframe on a NON-motion wrapper, or motion `animate`).
  The outcome node scales in (motion, 180 ms). Reduced motion: final state, no travel.
- **Clicking** a pill or card opens that rule in the Inspector (existing). Hovering a row in the dock
  highlights the card it lands on.

### 2.4 Tests dock (`TestDock`) — bottom of the canvas column
IDE bottom panel. It spans the canvas column only (never under the Inspector).
- **Collapsed**: a 40 px bar: tabs as quiet text buttons — **Saved sign-ins · People · Past sign-ins ·
  Break-in test** (Break-in only when `features.breakInTest && breakInEligible(draft)`) — no counts; on the
  right one status pill for the last run when it matters (e.g. amber "2 changed" or red "1 newly
  blocked", said once) and a link **Open Sign-in tests** (ArrowUpRight) to the global page.
- **Expanded**: default 300 px, drag the top edge to resize (200 px … 60 % of the stage), double-click the
  handle toggles, a chevron collapses, Esc (focus inside the dock) collapses. Line tabs (orange underline,
  the product's line-tab rule). The board's zoom/undo dock and the fit logic sit above the tests dock
  (expose its height as a CSS variable, e.g. `--bb-tests-h`, and include it in the reveal maths).
- Remember open/closed + height per viewer in localStorage (`idp.testsDock`), wrapped in try/catch.
- **Saved sign-ins** tab (this policy only — `savedOnPolicy(rows, draft, 'policy')`, judged by
  `boardVersion(saved, draft)`): toolbar = search + **Run all** (re-judges every row; rows re-settle with a
  30 ms stagger, changed rows flash an accent left edge) + link "Manage in Sign-in tests". Rows (one line):
  name · sentence pills (person, app, from, device) · Expected `[badge]` → Now `[badge]` · Pass/Fail mark ·
  row menu (Try, Delete). Row click = load into the sign-in bar and replay. Hover = highlight the card it
  lands on. Empty: "No saved sign-ins on {apps}" + **Save this sign-in** (opens the bookmark popover).
- **People** tab: people in this policy's audience (everyone → the directory's first 12 + search), ×
  **only this policy's applications** as columns (1–4 apps; more scroll horizontally). Cells = decision
  badge by the board version, with "Today: X" under a cell the edits changed. Row click loads the person
  (and first app) into the sign-in bar. Search people. This replaces "Check a person".
- **Past sign-ins** tab (report, dummy but deterministic): the last 7 days of modelled sign-ins on this
  policy's apps (`monitorSamples`/`monitorRows` from `monitor-sample.ts`, scaled up with a deterministic
  multiplier for headline totals): headline "Last 7 days · N sign-ins" once; one distribution bar Today vs
  With your edits (Allow / 2FA / Deny segments in the decision tones); three selectable tiles that ARE the
  filter — **Would change**, **Newly blocked**, **Unchanged**; the list below: time · person · app · from ·
  Today [badge] → With your edits [badge]; row click loads it into the sign-in bar. A "Sample" badge says it
  is modelled.
- **Break-in test** tab: the existing `BreakInView` (counts only), unchanged in behaviour.

### 2.4-bis OWNER CHANGE (28 Sep, after seeing 2.2 + 2.4 built): one right-side test panel

The owner looked at the floating sentence bar and the bottom Tests dock and said: "fix this so this is good in
the right side panel … the rest looks fine" — he selected the sentence bar, the dock's tab bar and the People
table. So the sentence and the tests move into ONE panel in the board's right column; the canvas keeps only the
trace (start node, check pills, lit spine, outcome node), which he accepted as it is. The bottom dock and the
floating bar are removed.

Test panel (`TestPanel`), the right grid column while testing:
- Width: the board's right track, default 460 px, resizable with the existing leading-edge grip (400…640),
  remembered per viewer (localStorage, try/catch). Same floating-card chrome as `.bb__insp` (inset margins,
  radius, `--el-mid`), and inside the key handler's "owned" test.
- **Header** (`.bb__inspbar is-test`): h2 **Try a sign-in** (tabIndex −1, focused on open and when the rule
  editor hands back) + IconButtons **Replay**, **Save sign-in** (opens `SaveSignInPopover` anchored to it,
  align end), **Open Sign-in tests** (ArrowUpRight → store.go sign-in-tests), hairline separator, **Close Try a
  sign-in**. Keep these accessible names.
- **Sign-in block** (not scrolling): `SignInSentence` in a `layout="panel"` variant — no card chrome of its
  own, tokens wrap naturally inside ~420 px ("[Priya Sharma] signs in to [HRMS] from [2001:db8:1::20]").
  Under it the **verdict**: single → the decision badge at a larger size with the column name as a small
  tertiary caption above ("Live"); two versions → two mini columns `Today [badge]  →  Your edits [badge]`,
  captions above each, a quiet arrow between. Then the one-line why (13 px, `--text-secondary`).
- A hairline, then **line tabs** (orange underline, the product rule): Saved sign-ins · People · Past sign-ins
  · Break-in test (Break-in only when eligible). Tabs stay fixed; only the tab body scrolls.
- **Tab bodies, narrow layouts** (reuse DockSaved / DockPeople / DockPast logic; add a `panel` density):
  - Saved: search + Run all (+ "Manage" link). Each row two lines — name (medium) with the Now badge right-
    aligned and a small pass/fail glyph; second line tertiary "Priya Sharma · Office network · Windows
    laptop" and, only when it fails, "Expected Allow on 1 factor". Row menu ⋯ (Try, Delete). Row click = load
    + replay. Hover = highlight the landing card.
  - People: one row per person — face, name, group; right side the decision per policy app (1 app: one
    badge; 2–4 apps: small app logo + badge pairs stacked); "Today: …" under a changed badge; search.
  - Past: "Sample" badge + headline once, the distribution bar, the three filter tiles in a 3-column grid,
    rows two lines (time · person · app / Today [badge] → With your edits [badge]).
  - Break-in: the existing BreakInView (it was built for a 448 px panel).
- Clicking a card still swaps the Inspector into this column for editing; its × returns to the test panel on
  the same tab. The aria-live status region stays mounted in BoardBuilder.
- The zoom/undo dock goes back to the bottom centre of the canvas; drop the tests-dock height offsets.
- Route `open`: 'try' → last tab, 'person' → People, 'saved' → Saved, 'break-in' → Break-in.

### 2.5 Removed
The right-panel `SignInPanel` (form, version columns, "Would change if" chips, inline What they see) and
its three pill tabs; `BoardTestViews`' panel versions of Check a person / Saved sign-ins. Keep pure helpers
that other code or tests still use; delete dead UI and update the tests that pinned the old markup
deliberately (try-sign-in-ui, board-views-ui, testing-ui, ui-copy where relevant). "Would change if"
chips are dropped from the default view (they may return later as the "why" popover).

## 3. Step 2 — Sign-in tests (global page, Policies → Sign-in tests)

Route `{ name: 'sign-in-tests', tab?: 'try' | 'saved' | 'people' | 'runs' }`; rail child **Sign-in tests**
right after **All Policies**; in `POLICY_SCREENS`. (`routes.test.ts` forbids a 'policy-testing' route and a
'Policy testing' rail label — keep that; this page is named Sign-in tests.) Page head: title
**Sign-in tests**, caption "Checked before any policy is saved or turned on." Line tabs: **Try a sign-in ·
Saved sign-ins · People · Runs**.
- **Try a sign-in** — the tenant-wide simulator, a new horizontal **journey canvas**:
  the same `SignInSentence` (global scope: every person, every app) → then a stage, left to right:
  Sign-in node (face + app logo) → **Which policy** column (every policy on this app as a stacked pill
  list; the deciding one lit with accent, losers dimmed with their reason on hover) → **Rules** column (the
  deciding policy's rules as compact cards with the same check pills, matched lit, others dimmed) →
  **Outcome** node (big decision badge + rule line) → **What they see** (the mini screens from
  `screensOf`, drawn small). A marker travels the whole path (~1.4 s), columns reveal as it arrives. A
  **Open policy** button takes the sign-in to that policy's board (seeds `boardForms[policyId]`).
- **Saved sign-ins** — the whole library table: Sign-in (name + sentence pills) · Expected · Now ·
  Level · Decided by (policy chip) · row menu (Try, Delete). Toolbar: search, Application filter, Level
  filter; right: **Run all** and primary **New sign-in** (goes to Try). Judged as the tenant stands.
- **People** — directory people as rows × every application as columns (this is the tenant view, so all
  apps are right here), cells = decision badges; row click → Try with that person.
- **Runs** — report, dummy history: a narrow list of past runs (newest first: "Saving HRMS access from
  corporate offices · Jaspreet Toor · 2 h ago", tiny changed/unchanged bar) and the selected run's detail:
  tiles Changed / Newly blocked / Unchanged (the filter), then rows name · Before [badge] → After [badge].
  The newest run is live-computed from the store (run all saved sign-ins now); the older ones are fixtures.

Inside a policy, the dock's **Open Sign-in tests** and "Manage in Sign-in tests" go here (behind the leave
guard), carrying the tab.

### 3.1 Step 2 build detail (the page)

**Page chrome.** `bpage` + `PageHead` (title "Sign-in tests", caption "Checked before any policy is saved or
turned on."). Under it the line tabs (orange, the product rule): Try a sign-in · Saved sign-ins · People · Runs —
no counts. Tab state from the route's `tab`, switched locally.

**Try a sign-in — the journey canvas (the tenant-wide simulator; the page's showpiece).**
- Input: `SignInSentence` (its default card layout — do NOT add a panel layout, another agent owns that file)
  with scope `{ appIds: 'all' }` and no audience grouping, state = the testing session's page `form` / `patch`
  (session-state.ts; default `defaultForm`). Verdict = `SentenceVerdict` with the single "As the tenant stands"
  column; actions = Replay + Save sign-in (`SaveSignInPopover`); why-line "Decided by {policy} · Rule 2 · {rule}".
  Rows read = `rowsRead(policies, null, appId, lib)` (every policy on the app).
- Resolution: `resolveSignIn(policies, factsOf(form, zones).facts, env)` once per change (memoised).
- The canvas: a wide dotted surface (the board's dot ground look, `--surface-sunken` + the board's dot token if one
  exists, else a subtle radial-gradient dot from tokens) holding a left→right journey with SVG connectors between
  node anchors (measured with refs + ResizeObserver; recompute on resize):
  1. **Sign-in** node — Face + name + group, app logo + name, and small neutral fact chips (From, Device, Time,
     Risk when stated).
  2. **Which policy** column — every policy that could govern this app, from `whichPolicyRows(res, policies,
     appId, {...})` (decides / lost / waiting / watching / elsewhere): each row = kit `StatusPill` + name + one
     tertiary reason ("Not in this policy", "Checked after Developer tools", "Switched off"). The deciding row gets
     the accent ring and a small "Decides" word; others dim. Global Default last.
  3. **Rules** column — the deciding policy's rules from `res.trace`, drawn with the SAME pieces the board uses:
     `checkPills` + `CheckPills`, `RuleOutcome`, `CardWord`, card states lit / missed / dim, last row "Nothing
     else matched".
  4. **Outcome** node — large `DecisionBadge` (Depends / Can't tell as on the board), the policy name and rule
     line, and a secondary **Open policy** button that puts this sign-in on that policy's board
     (`session.loadBoard` or equivalent) and `go({ name: 'board', policyId, open: 'try' })`.
  5. **What they see** — the existing `WhatTheySee` under the outcome (or a 5th column when there is room).
  Connectors on the taken path draw in `--accent` (motion `pathLength` 0→1 on the SVG path), others
  `--border-default`. A marker (accent dot + soft halo) travels Sign-in → the deciding policy row → the matched
  rule → Outcome in ≈1.4 s on open, on Replay and on loading a saved sign-in; columns fade/rise in as it arrives
  (motion props on wrappers, never CSS transforms on motion elements). Token edits update in place without travel;
  the answer that changed cross-fades and a "Changed by IP address" chip shows on the outcome for ~2.5 s.
  Reduced motion: final state at once. At 1440×900 the whole journey fits without horizontal scroll; below
  ~1280 px What they see drops under the outcome; the canvas scrolls horizontally only as a last resort.
- Empty state (no person/app chosen): the journey's first node only, with "Choose a person" / "Choose an
  application" as its content.

**Saved sign-ins.** Toolbar row: SearchBox + Application filter (Picker, funnel icon) + Level filter on the left;
right: **Run all** (secondary; re-judges every row; rows re-settle with a 30 ms stagger; changed rows flash an
accent left edge) and the primary **New sign-in** (switches to Try with a fresh form and opens Save). Table in
the console's table recipe (`--table-*` tokens, fixed row height, `usePagedList` + `ListPager` so rows fit the
window): Sign-in (name + tertiary "Kavya Menon · HRMS · Office network · Windows laptop") · Expected (badge) ·
Now (badge + Pass/Fail) · Level (neutral pill) · Decided by (policy name, a link to its board) · RowMenu (Try →
Try tab loaded and replayed; Delete via the existing ConfirmDelete rules: protected needs typed DELETE). Judged as
the tenant stands. Sort: failing first, then level strongest first, then name. Empty/no-match states via kit
EmptyState / NoMatches.

**People.** Directory people (store `users`) as rows × every application as columns (this is the tenant view, so
all apps belong here): sticky first column (face, name, group), decision badges in cells (`personRows`), horizontal
scroll inside the table container, SearchBox + Group filter, pager. Row click → Try with that person (and the first
app they are decided on).

**Runs (report; dummy history + one live run).** Two panes: a narrow run list (newest first) and the selected run.
- The newest run is live: "Now · All saved sign-ins" = judge every saved sign-in as the tenant stands vs its
  Expected.
- Older runs are a fixture (runs-fixture.ts) — 6–8 plausible runs across the last week that reference REAL saved
  sign-in ids with before/after decisions: "Saving HRMS access from corporate offices · Jaspreet Toor · 2 h ago",
  "Turning on Developer tools — office and device checks · Anika Rao · yesterday", "Editing zone Corporate offices
  · …", "Turning on Device compliance for Outlook and Dropbox · …", "Nightly check · System · 3 days ago", etc.
  Each list item: title, who · when, a tiny two-segment bar (changed / unchanged) — no number repeated. A small
  "Sample" badge on the older runs' detail header says they are modelled.
- Selected run: header (what triggered it, who, when, "Sample" when fixture), three selectable tiles that ARE the
  filter — Changed (default), Newly blocked, Unchanged — each number said only on its tile, then rows: sign-in name
  + tertiary sentence · Before [badge] → After [badge] · level pill; row click → Try with it loaded.

## 4. Step 3 — Describe from the left, text first

- Opens as a LEFT panel (a new leading grid track on `.bb`, 400 px, `is-left-open`), slides in from the
  left (opacity + `translate` on the non-motion aside; describe.css may not contain `transform:`), the board
  re-centres to its right. It is not `.bb__insp` — add its class to the key handler's "owned" test.
- Thread layout, composer pinned at the bottom (Lovable/Linear style), no guided sections up front:
  - Empty: "What should this policy do?" + the four EXAMPLES as chips + a TipDot "How phrases are read".
  - The admin's text shows as a message bubble (edit pencil reloads it into the composer).
  - The reply block (no avatar, no "AI"): **Understood** — rows of chips only for what the text said:
    Applications · Who · Where and when · Devices · Then (outcome badges) · Everyone else. Clicking a chip
    opens that answer's existing controls in a popover. Defaults are not listed.
  - **One question at a time** for open choices (`openChoices`) with quick-reply chips; answering shows
    the choice as a small reply and continues.
  - "Not added" words as grey chips with the reason in a tooltip and the fix link.
  - A change line: "Added 2 rules · Nothing else matched → Deny" + **Undo**.
  - Follow-ups typed into the composer extend the text and re-read; the reply is a change line.
  - Checks collapse to one row ("Checks" with pass/differs pills) that expands in place.
- Board while describing: new/changed cards get a 2 s accent left edge.

### 4.1 Step 3 build detail (Describe on the left)

References the owner named or we checked: Lovable (thread left, per-turn version card with Undo, follow-up chips
above the composer), Figma Make (empty state = one question + example chips + composer at the bottom), Airtable
Omni (left panel beside the live artifact; the reply ends with Undo; the canvas is framed while building), Pin
("what I understood" as category rows of editable chips), Bolt (ask only when blocked, as one inline action).

**Placement.** A LEFT column on `.bb`: a new leading grid track `var(--bb-left, 0px)` that becomes 400 px when
`is-left-open`; every explicit grid placement shifts by one (see the pitfalls in the code map: board.css
`.bb__stage`, `.bb__empty`, `.bb__insp`, `.bb__grip`, `.is-insp-closed`, the testing grid, the <900 px rows).
Floating-card chrome mirrored (inset on the left, radius, `--el-mid`); entrance = opacity + the `translate`
property from −16 px on the plain aside (no `transform:` in describe.css — a test forbids it); reduced motion
none. The board re-centres (the stage ResizeObserver). The aside's class joins the key handler's "owned" test and
the focus selectors. Describe and Try a sign-in stay exclusive (opening one closes the other, as today); the
right Inspector stays closed while describing; clicking a card flashes the reply row it came from.

**Panel anatomy (top → bottom).**
- Header: "Describe the policy" + TipDot "How phrases are read" + × (close = Done, keeps everything).
- **Thread** (the only scroller):
  - Empty: a quiet glyph (lucide PenLine — never Sparkles/Wand), "What should this policy do?", then the four
    `EXAMPLES` as full-width quiet suggestion buttons showing their text on one or two lines. A click reads it
    at once (fills the composer as the first message).
  - **A turn** = the admin's message + the reply.
    - Message: right-aligned bubble (`--surface-sunken`, `--radius-lg`, 14 px), max 85 % width; a pencil on
      hover/focus puts the text back in the composer to rewrite (replacing, not appending).
    - Reply (left, no avatar, no "AI" words): a tertiary 12 px label **Understood**, then rows ONLY for what the
      text said or what a question settled — Applications · Who · Leave out · Where and when · Devices · Then ·
      Everyone else. Row = 96 px label column + chips. Chips are neutral buttons with the category icon; Then
      shows each branch as "In Corporate offices → [Allow on 1 factor]", "Elsewhere → [Deny]" using
      DecisionBadge. A chip opens an AnchoredPopover (width 360) holding that answer's existing controls (the
      current DescribePanel `body(key)`), so a correction is two clicks. Defaults are never listed.
    - **One question at a time**: the first `openChoices` item as an inline card — its question in one line,
      quick-reply chips for its options (≤ 4 visible; "More…" opens a Picker), and "Don't add". Answering
      re-composes and the card becomes a one-line settled row. Only then the next question shows.
    - **Not added**: grey chips of the phrases, the reason in a Tip, and the fix link (Create zone / Device
      profiles / Authentication methods) inside the tip or beside the row.
    - **Change line**: what this turn did to the board — "Added 2 rules · Nothing else matched → Deny", or
      "Changed rule 2", "No change" — with **Undo** that reverts THIS turn (and, on the first turn, returns the
      board to the chooser as today's toast Undo does).
    - **Checks** (when on): one collapsed row "Checks" with its pass / differs pills; expands in place to the
      existing check rows (a row still opens Try a sign-in with that sign-in).
  - Follow-up suggestion chips above the composer, derived from gaps in the answers ("Add a device check",
    "Only in office hours", "Block Tor exits") — max three, hidden while a question is open.
- **Composer** pinned at the bottom: textarea 1–6 lines (field-sizing), placeholder "Who, which applications,
  where or when, what happens" on the first turn and "Add or change something" after; Enter sends, Shift+Enter
  new line; a round send IconButton (ArrowUp) filled with `--text-primary` when there is text (never orange —
  Save policy is the board's only orange). A follow-up EXTENDS the text (previous text + ". " + new) and re-reads
  the whole; a rewrite (pencil) replaces it. The status region still announces "Read. Not added … Choose …".
- **Board while describing**: cards a turn added or changed carry a 2 s accent left edge; the chooser is hidden;
  the right column closed.
- **State**: the thread (turns) lives in BoardBuilder with the describe state for the visit, so closing and
  reopening restores it; each turn keeps {text, reading, change line}. Writes still go through
  `writeDescribed` (one history entry per opening) so the board's own Undo and the toast keep working.
- Keep every reader/model contract (describe-model tests, EXAMPLES reading to their seeded policies); update
  describe-ui.test.tsx deliberately for the new markup.

## 5. Dummy data (no backend)
- Seed saved sign-ins on every showcase policy's applications (GitHub, Jira, Outlook, Dropbox, Google
  Workspace, HRMS…) so no dock is empty in the demo.
- A runs history fixture (6–8 runs across the last week, by named admins).

## 6. Verification (every step)
`npm test`, `npx oxlint` (count warnings vs baseline), `npm run build`, then a real browser check with
Playwright headless Chrome (the Browser pane freezes animations when hidden):
```
node "<scratchpad>/shoot2.cjs" "<scratchpad>/shots"
```
Recipe: `require('C:/New folder/IDP Policy Engine/.claude/worktrees/pensive-easley-bc1d1e/node_modules/playwright')`,
`chromium.launch({ channel: 'chrome', headless: true })`, viewport 1440×900, `addInitScript` setting
`localStorage idp.board-tour.seen=1` and `idp.tour.seen=1`; dev server at http://localhost:5173/ (serves THIS
worktree — checked 29 Sep). Open "Developer tools — office and device checks", press Try a sign-in.

## 7. 29 Sep finishing pass — state and the owner-eye findings

State on 29 Sep (credit ran out 28 Sep 19:15 mid-run): Step 1 + the §2.4-bis right panel are built; Step 2's page is
built and wired (route, rail, CSS imports, four tabs); gate on the copied tree: 2463 tests pass, oxlint 27 warnings
(= baseline, no new ones allowed), build passes. The review and fix passes for both NEVER ran. Step 3 (Describe on the
left) is NOT started. Tour screenshots of the current state: `<scratchpad>/tour/*.png` (1440×900).

Findings from looking at the screens (fix these on top of whatever the reviews find):
- F1 (board, Break-in tab in the 460 px panel): the table is cramped — names clip ("Sign-in relayed th…",
  "Straight after an…"), "Allow on 1 factor" wraps to two lines, the Rule links crowd the edge. Re-lay it as the Saved
  tab's two-line rows: name (medium, full, wraps to 2 lines max) + the Got badge right-aligned and a ✕/✓ glyph; second
  line tertiary "Expected Allow with 2FA · Rule 2" (Rule N a link that opens that rule). Group headings stay. The four
  count tiles stay but must fit one row at 428 px inner width without wrapping labels.
- F2 (page, People tab): a wall of "Can't tell" — the page form states no device, so every device-reading app is
  unknown. Replace the grey context line ("Office network · Any device · 09:30 Tue" + TipDot) with an editable
  mini-sentence of the SAME tokens the Try tab uses: "Everyone signs in from [Office network ▾] on [Windows 11 laptop ·
  registered ▾] at [09:30 ▾]" (only the tokens some app's rules read; person/app tokens hidden), defaulting the device
  to a registered corporate laptop preset so the grid shows real answers. Changing a token re-judges the grid (cells
  cross-fade, 30 ms stagger by row). "Can't tell" then only appears when truly unknown.
- F3 (page, Try tab): the default sign-in (Kavya Menon → HRMS) lands on Global Default because the showcase HRMS policy is
  Inactive — the first thing the admin sees is the dullest path. Default the page's Try form to a sign-in decided by an
  active policy with 2+ rules and pills that tick (e.g. Arun Patel → GitHub Enterprise from Office network on a registered
  Windows 11 laptop → Developer tools rule 1). Keep the in-policy board default unchanged.
- F4 (page, Try tab): the journey canvas is taller than its content (big empty dotted area) and "What they see" is
  open by default so the page scrolls at 1440×900. Canvas height hugs the journey (padding 24 px); "What they see" starts
  collapsed (a quiet disclosure under the outcome); the whole tab fits 1440×900 with no page scroll.
- F5 (page, Try tab): make the journey feel alive, not static: on hover of a Which-policy row or a rule card, its wire
  brightens and the rest dim (150 ms); the marker leaves a short fading accent trail along the lit wire during travel; the
  outcome badge lands with a small spring (motion props, reduced motion = none). No new colours, tokens only.

## 8. 29 Sep OWNER CHANGE — the Try tab becomes an engine run (supersedes §3.1 "Try a sign-in" and §7 F3–F5)

The owner looked at the page's Try tab (sentence card above a journey that is already drawn) and said it "feels too
overwhelming". His direction, verbatim intent: no dedicated form above the canvas; an EMPTY STATE INSIDE THE CANVAS with
a form; once filled, the form COLLAPSES INTO THE SIGN-IN CARD and only then the rest is shown; progressive disclosure
at every stop with a real-time loading experience, so it feels like THE ENGINE IS RUNNING — it finds the policy, then
checks the rules, then checks each parameter, then shows the outcome; the user may be asked extra attributes based on
the selection; "Can't tell" is everywhere in the cards with no hierarchy — fix it; "for the loading put extra effort:
contextual, animated, intuitive".

References checked on Mobbin (29 Sep): Langdock and Deel (an empty dotted canvas holding ONE starter card, the run
control on it), Twenty and Attio workflow runs (nodes the run reached are solid with a result mark, unreached nodes are
ghosted; branch labels on the path), Relevance AI (the node being worked shows "Running" with a spinner), Rox / AirOps /
Ferndesk (an engine checklist: done = check, current = spinner + a live line, next = greyed), Turo / Airwallex (per-row
"Verifying" → result states).

### 8.1 Stage 0 — the canvas empty state is the form
- The Try tab body is ONLY the dotted canvas (no SignInSentence card above it; the tabs sit directly on it). The canvas
  fills the free height of the page (no page scroll at 1440×900 and 1280×800).
- Centred in it: the **Sign-in card** (~420 px wide, `--surface-raised`, `--radius-lg`, `--el-mid`), a small canvas label
  above it ("Sign-in", 12 px tertiary, like Deel's "When this happens:"). Fields stacked, label over field (house rule):
  1. **Person** — Picker with Face avatars and search (the directory).
  2. **Application** — Picker with app logos (every application).
  Only these two show at first. The Run button is NOT disabled (house rule: never disable the primary; pressing it with a
  field missing puts the error under that field).
- **Asked because of the selection.** As soon as the application is chosen, work out which facts the policies on that
  application read (`rowsRead(policies, null, appId, lib)`) and ONLY those fields slide in under the two, one by one
  (height + opacity, 60 ms stagger): From (network presets + IP address), Place / Distance (only when read), Device
  (presets with platform marks; "Edit details" discloses detail rows), Time (only when read), Risk (only when read). Each
  extra field's label carries a TipDot naming what reads it ("Read by HRMS access from corporate offices · Rule 1"). Each
  field is PREFILLED with a sensible default (Office network, a registered corporate Windows 11 laptop, now, low risk) so
  Run works at once; a field can be set to "Not stated" deliberately. Changing the application re-asks (fields no longer
  read slide out). Reuse the existing field rows in `testing/SignInFields.tsx` and the popover pieces from
  `SignInSentence` where they fit — do not fork their logic.
- Under the fields: primary **Run** (Play icon; the tab's only orange button; Ctrl/⌘+Enter) and a quiet "Use a saved
  sign-in" link that opens a Picker of saved sign-ins (choosing one fills the card and runs).
- Under the card, three quiet suggestion chips from real saved sign-ins that take different paths (one allowed on 1
  factor, one step-up, one deny) — a click fills and runs. No explanatory sentence anywhere.

### 8.2 Stage 1 — the form collapses into the sign-in card
- On Run the card MORPHS (motion shared layout, `layoutId`, ~320 ms, ease-out) from the centre into the compact Sign-in
  node at the left of the journey: face + name + group, app logo + name, then the stated facts as small neutral chips
  (From, Device, Time, Risk — only those asked). A pencil ("Edit sign-in") on the node expands it back into the form in
  place (the rest of the journey dims while editing); Run again re-runs from Stage 2.
- The transform trap applies: the morphing element may not have a CSS transform/transition.

### 8.3 Stage 2 — the engine runs (the loading IS the explanation)
One **engine line** pinned at the top-centre of the canvas (a small raised pill: spinner + one short live sentence,
aria-live polite, announcing STAGE changes only, not every check). Stages reveal left → right; a stage's column appears
only when the engine reaches it, first as skeleton rows that shimmer (tokens only; reduced motion = static), then each row
resolves in order:
1. **Finding the policy** — engine line "Finding the policy for HRMS". The Which-policy column appears with one skeleton
   row per policy on the application, in evaluation order. A scan highlight steps down the rows (~220 ms each); each row
   resolves: dimmed with its short reason ("Switched off", "Not in this policy", "Checked after Developer tools") or lit
   with the accent ring and "Decides". The engine line follows the scan ("Checking HRMS access from corporate offices" →
   "Global Default Policy decides"). A wire draws from the sign-in to the deciding row (pathLength).
2. **Checking the rules** — engine line "Checking rules in Global Default Policy". The Rules column appears; rule cards
   appear in order as skeletons; the current rule gets a scanning ring; its checks appear ONE ROW AT A TIME (~180 ms
   each): spinner → result mark, with the engine line naming the check in plain words ("Network · Office network is in
   Corporate offices"). First-match-wins shown literally: the FIRST failing check ends that rule — the card settles to
   "No match" with the failing row still visible and a quiet "2 not checked" — and the engine moves to the next rule. A
   rule whose checks all pass is "Match": the card rings and the wire continues through it.
3. **The outcome** — engine line "Deciding", then it settles into a quiet summary ("Checked 2 policies · 1 rule ·
   4 checks") with Replay (RotateCcw). The Outcome node lands (small spring, motion props): the big decision badge, the
   policy + rule line, **Open policy**, and "What they see" as a collapsed disclosure.
- Pace: first run ≈ 2.5–4 s depending on how many rows there are (cap 4.5 s: shrink per-row time when there are many);
  a **Skip** control on the engine line jumps to the settled state; runs started by editing the sign-in play at ~60 %
  duration; reduced motion = settled state at once, no shimmer, no travel. The settled state is also what a revisit of
  the tab shows (no replay on revisit).
- The engine's step plan is a PURE function (e.g. `engineRun(res, policies, appId, facts, …) → steps[]` with kind, target
  node, text, start/duration) with unit tests; the UI only plays it. It must agree with `resolveSignIn` (same decider,
  same landing rule, same Depends) — test that parity on the showcase tenant.

### 8.4 Checks with hierarchy (fixes the wall of "Can't tell")
- Inside a rule card, checks are grouped by CATEGORY (Who · Network · Place · Device · Time · Risk), one row per category
  in the rule's order: category icon + 12 px tertiary category word, the requirement in 13 px primary ("Corporate
  offices", "Compliant devices", "Mon–Fri 09:00–18:00"), the sign-in's own value in secondary ("Office network",
  "Windows 11 · registered"), and the result mark right-aligned (✓ positive; ✕ with a negative tint on the row; grey
  "Not stated"). Rows' right edges line up.
- A category with several sub-checks (a device profile's OS version, encryption, …) is ONE row; a small chevron expands
  its sub-checks in place. Never more than one row per category by default.
- Unknowns: because Stage 0 asks for every fact the rules read, "Not stated" only appears when the admin chose it; it is
  grey text (never a badge, never a "?" pill), and the row offers "Add", which reopens the sign-in card on that field.
- Hierarchy in the column: the matched card is full strength; a no-match card shows only its failing row (+ the quiet
  "N not checked"); not-reached rules are ghosted titles only ("Not reached"); "Nothing else matched" stays last.

### 8.5 Carry-overs that still apply
- Hover a Which-policy row or a rule card → its wire brightens, the rest dim (150 ms). Rule click → that rule on its board
  in test mode (existing). Save sign-in (bookmark) sits on the collapsed Sign-in node.
- Saved sign-ins / People / Runs rows that "Try" a sign-in fill the card, collapse it and run the engine (full pace).
- Fit: 1440×900 and 1280×800 with no horizontal scroll and no cut-off Outcome; the Rules column scrolls inside the canvas
  only if it must. Keyboard: every node focusable with a visible focus ring after the run; Esc closes an open field
  popover, then the editing card. Dimmed text keeps ≥ 4.5:1 (dim with colour tokens, not opacity on text).
- Known bugs of the old journey the new one must not repeat (verified 29 Sep): the marker/route travelling to where a card
  USED to be because cards grew mid-run (measure after each reveal); the wires SVG only ever growing; the Outcome cut off
  at 1280; no visible focus after landing; dimmed rows failing contrast; Replay never announced.

### 8.6 29 Sep, later — OWNER REFINEMENT of the run's shape (wins over §8.3 where they differ)

The owner described the run he wants, verbatim intent: "first the user adds the form, then the rules [policies] that are
applied should appear. Then you can expand the policy and showcase the rules, and after that the user checks what is
inside the rule and what matches and what not. What does not match can be compacted, or the user has an option to show
all, or a one-liner. And then the outcome, in an animated way. Utilise the space properly. The page itself has a scroll —
I don't want that; the user can scroll inside the canvas horizontally or vertically, but not the main page."

So the run is a HIERARCHY that opens level by level, not four equal columns drawn at once:
1. **Form → the policies that apply.** After Run (the form folds into the sign-in node), the policies that could govern
   this application appear as a stack of policy cards (scan as in §8.3 step 1: each resolves to its short reason; the
   deciding one lights).
2. **The deciding policy EXPANDS.** Its card grows (motion layout, ~280 ms) and its rules appear INSIDE / directly under
   it, nested, in evaluation order — the policy is the container of its rules. Losing policies stay as one-line rows
   (name + reason), quietly dimmed; they never expand by themselves (a click expands one to see its rules, read-only).
3. **Inside each rule: what matched and what did not.** Rules are checked one after another (§8.3/§8.4 check rows, one
   per category, spinner → mark). A rule that does NOT match COMPACTS to a ONE-LINER when the engine leaves it:
   "Rule 1 · In the office on a compliant device — No match · Network: Tor exit is not in Corporate offices" (the
   failing check named in the line, ✕ mark). The matched rule stays OPEN with all its check rows ✓.
4. **"Show all"** — one quiet toggle on the expanded policy ("Show all checks") re-opens every compacted rule with its
   rows (failing row ✕, the rest "Not checked" in grey), and back ("Show less"). Default = compact.
5. **Then the outcome**, animated (lands last, small spring), beside or under the matched rule — wherever the space is.

Space and scroll:
- The page NEVER scrolls on the Try tab (1440×900, 1280×800, and any taller/shorter window): the canvas takes exactly the
  free height under the tabs (`min-height: 0` flex chain; no fixed heights that overflow) and ITSELF scrolls
  (overflow: auto both ways) when the content is larger. Check `document.scrollingElement.scrollHeight <=
  clientHeight` and the same for width, at every stage of the run.
- Use the width: sign-in node on the left, the policy stack in the middle taking the room it needs (expanded policy ~
  440–520 px wide), outcome to its right; nothing crammed into narrow fixed columns; no big empty areas while there is
  something clipped. Re-fit (scroll the canvas so the active step is in view, smoothly) as levels open.
- The other tabs (Saved sign-ins, People, Runs) must not page-scroll either: the table body / pager fits the window;
  anything longer scrolls inside its own container.

## 9. 29 Sep evening — state when this session took over (fresh session, keen-goldwasser-ce39db)

The 29 Sep afternoon run hit the session limit at 17:09 with the three builds partly done. Copied here byte-for-byte.
- **Tables (Saved / People / Runs): DONE** — every "tables" finding, F2 (People's own sentence), P11 gating, MAP-6 Tip.
  Never reviewed.
- **Try tab engine run (§8.1–8.5): BUILT, working end to end** in the four-column shape (Sign-in · Which policy · Rules ·
  Outcome) — engine-run.ts (pure plan + parity tests), SignInCard.tsx / sign-in-card.ts (Stage 0 form, fields asked by
  rowsRead, suggestions, Use a saved sign-in), TryJourney.tsx (stages, engine line with Skip/Replay, skeleton shimmer,
  wires), journey.ts (geometry), journey.css. Page scroll 0 at 1440×900. §8.6 (the hierarchy) NOT applied yet. The
  builder's last note: "wider Rules column, shorter reason for policies the scan never reached, a progress hairline on the
  engine line" — may be half done. sign-in-tests-ui.test.tsx has 4 stale assertions (old sentence ids, 'no orange on Try'
  — now Run IS the tab's one orange button, 'session.load(defaultForm(', "show('try', { save: true })").
  SignInCard.tsx adds 2 only-export-components lint warnings (move the non-component exports to sign-in-card.ts).
- **Describe on the left (§4, §4.1): BUILT and browser-checked** (thread, Understood rows, one question, Not added + fix
  link, change line + Undo, Checks row, follow-up chips, composer, exclusivity with Try, reopen restores, 1280 holds).
  NOT done: describe-session.test.ts (only its imports exist — 26 unused-import lint warnings), describe-ui.test.tsx
  (8 stale tests against the old markup), a react-hooks(exhaustive-deps) warning at DescribePanel.tsx ~323 (useEffect with
  no deps calling setState).
- Gate on the copy: tsc fails only in describe-session.test.ts / describe-ui.test.tsx; vitest 2491 pass / 12 fail (those
  two files); oxlint 56 lines with 'warning' = the 27 baseline + the 29 above. Target: 27.

## 10. 30 Sep — finished, reviewed, fixed, polished (keen-goldwasser-ce39db, uncommitted)

Gate: tsc 0 errors · oxlint 27 warning lines (baseline) · vitest 140 files / 2624 tests pass · `npm run build` passes.
Review: 5 reviewers + a skeptic each → 54 confirmed findings (journey 20, describe 15, tables 9 … incl. dupes), all fixed.
Decisions taken on the way (owner can overrule):
- Engine line names each FINDING in the sign-in's words ("Home broadband is not in Corporate offices"), hugs its words
  (eased width, cross-fade); a passing finding is said once per run; no visible "Deciding"; no outcome skeleton.
- A "Depends" run shows the last row as "If not" (unlit), never as a Match.
- Tooltips on policy names only when they add something; hover/tooltips wake only after a real pointer move.
- While Describe is open the board is read-only; history entries carry the thread, so Undo/Redo/Discard move both.
- Picker hands focus back to its trigger after a pick (app-wide fix in picker.tsx).
- AnchoredPopover stays inside `.bshell__main` (the Save sign-in popover no longer covers the rail).
- People: every cell is a button that tries that person on that app with the People sentence's facts.
Still open (not fixed, owner's call): toasts sit over the right column's header (shell.css); the Describe thread lives
only for the visit; while a Describe question is open the rule is written without that condition (pinned by
describe-model tests — saving then would deny the whole group); People cells are 13 tab stops a row (no roving grid);
the edit-card fold uses the layoutId morph, not the ghost fold; dev server motion is steppier than the production build.

## 11. 30 Sep OWNER CHANGE — in-policy Try a sign-in V5 matches the page; Sign-in tests leaves the rail

Owner, verbatim intent (selecting the board in test mode on HRMS access from corporate offices): "Try a sign-in inside
the policy builder: for the right side I want the same experience as we have in Sign-in tests; only keep Past sign-ins;
Saved sign-ins is a part of the form; for the canvas I want 2 versions, one vertical and one horizontal; People and
Break-in test I don't want; I want the experience as good as Sign-in tests. The cards are very confusing — fix that;
also the animation and the other things — make it intuitive." And: "Move Sign-in tests inside the All Policies tab — as a
button; on click I go inside Sign-in tests." Supersedes §2 / §2.4-bis for the in-policy panel and trace.
Maps (read them): `maps/board-test.md` (current test mode, doors, tests that pin it, what makes the cards confusing),
`maps/journey-reuse.md` (the shared-renderer API), `maps/research.md` (Mobbin: Okta journey/list, Databricks Graph|List,
Adaline, n8n executions, Airtable "Select test data", Zapier test step, Postman history, Customer.io skipped steps).

### 11.1 One run, one renderer (page + policy)
- Extract `EngineJourney` (+ `useEngineRun`, `EngineLine`, `Answer`) from TryJourney.tsx into
  `sign-in-tests/EngineJourney.tsx` VERBATIM first; the page must look and behave exactly as today (source-grep tests
  read the concatenated sources).
- `engine-run.ts` additive inputs: `substitute?: Policy` (the draft, evaluated — use the evaluated list EVERYWHERE the plan
  looks policies up: decider, byId, order, lines, check rows; `whichPolicyRows` still gets the stored list + {substitute})
  and `focus?: string | null` (rows = the focus policy + the decider only). `readersOf(…, extra?)` draft-aware.
  Parity tests: every showcase policy as focus; every policy as an unchanged substitute; an edited Developer tools;
  HRMS inactive as substitute — same decider/landing/states as `resolveSignIn(…, {substitute})`.
- `Orientation = 'horizontal' | 'vertical'`. Vertical = one centred column (max ≈ 560 px): start on top → the policy
  container(s) with nested rules → the outcome under them; wires run down the spine; the active ring sits on the node,
  never a detached dot. `engineWires(…, orient)` gets a vertical branch (unit-tested). Switching orientation animates node
  positions with motion `layout` (~240 ms; instant under reduced motion), re-measures after, and NEVER replays the run.
- The PAGE has no toggle: it goes vertical by itself when its canvas is narrower than the three lanes need (936 px,
  `laneFit` with ~16 px hysteresis, measured on `.tj-canvas`), so the Outcome is never cut off behind a sideways scroll.

### 11.2 In-policy canvas (board test mode)
- While testing, the board chain is replaced by `EngineJourney` in the `.bb__stage` cell: `focus` = this draft,
  `substitute` = the draft, `intro` = none (no cross-panel fold), `start` = a compact start pill ("[face] Kavya Menon →
  [logo] HRMS"). The old trace goes: TestChain / CardRoute / CheckPills / RuleOutcome / CardWord / StartSignIn /
  DecidesPill / WhichGate / OutcomeNode / the RouteMarker dot — delete what nothing else uses.
- Scope: this policy is THE container, expanded, rules nested (§8.6 states: matched open ✓; a no-match rule folds to one
  line naming the failing check; not reached = ghosted title; "Nothing else matched" last; "Show all checks").
  When another policy decides (not in audience, app not covered, an earlier policy), that policy shows as ONE line with
  "Decides" and its reason, placed where the engine meets it, and this policy shows its own one-line reason ("Kavya Menon is
  not in this policy") — expandable read-only.
- Outcome: the big decision badge + "policy · rule" line + "What they see" (collapsed). A comparison line ONLY when the live
  result differs: "Live now [badge]" → right side labelled "With your edits" (the draft differs from the saved policy) or
  "When turned on" (saved but off/draft, no edits). NEVER "Stored version" or "Today". No "Open policy" (we are in it).
- Clicking one of this policy's rule rows → `select(rule)` → the Inspector swaps into the right column (existing); edits
  re-run at edit pace (60 %); closing returns to the test panel. The engine line (Skip / Replay / summary) is pinned
  top-centre of the stage.
- Idle (opened, not yet run in this visit): the journey unevaluated — a "Sign-in" start placeholder and this policy's
  container with quiet rule titles; nothing animates. Arriving WITH a sign-in (the page's rule click, a Past sign-in row,
  Use a saved sign-in, a suggestion) runs at once.
- Layout switch: a two-icon segmented control (lucide GitCommitVertical "Vertical", GitCommitHorizontal "Horizontal"),
  aria-label "Trace layout", at the end of the board's bottom dock after a hairline. In test mode the dock keeps undo/redo
  and hides fit/zoom. Remembered per viewer (localStorage, try/catch). Default VERTICAL. It is a product control and stays
  visible under SHOWCASE (decision recorded — the owner may overrule). Horizontal in the builder uses narrower lanes (start
  ≈ 160, policy 420–480, outcome ≈ 240) and scrolls INSIDE the canvas when it must; the page never scrolls.

### 11.3 In-policy right panel
- Same `aside.bb__insp.tpanel` chrome (keys, grip, focus, the Inspector swap depend on it). Header unchanged: "Try a sign-in"
  · Replay · Save sign-in · Open Sign-in tests · ×.
- (a) The FORM = `SignInCard` with `layout='panel'` and `scope` = this policy: Person = this policy's audience first, then a
  "Not in this policy" group; Application = this policy's apps (every app for Global Default or a draft with none); its FIRST
  row "Use a saved sign-in" listing only this policy's saved sign-ins (each: name, person · app, expected badge) — this is how
  Saved sign-ins becomes part of the form; fields asked by the DRAFT's rules; Run = the panel's only orange, never disabled,
  Ctrl/⌘+Enter; three suggestion chips from this policy's saved sign-ins wrap within the column. Ids keep the board's
  `bb-try-*` prefix (Needs: links and tests rely on it).
- (b) On Run the form folds WITHIN the panel (layoutId, ~320 ms) into the summary card: face + name + group, app, fact chips,
  pencil "Edit sign-in" (expands back in place; the canvas dims). A provenance chip when loaded from a Past sign-in ("Past
  sign-in · Tue 09:30 ×" returns to the form's own sign-in).
- (c) Under a hairline, ONE section "Past sign-ins", no tabs: DockPast at panel density (headline said once, Sample badge,
  day groups, one-line rows time · person · app with the outcome badge right-aligned; the three tiles as the filter ONLY when
  versions differ). A row click loads it, folds the form and runs at edit pace; hover highlights its landing rule.
- The verdict is said ONCE — on the canvas outcome — never also in the panel.
- Removed inside a policy: the Saved sign-ins tab, People, Break-in test. Move `Answer` out of DockSaved before deleting it.
  Route `open`: 'person' | 'saved' → 'try' ('saved' opens the form's saved picker); 'break-in' → the doors below.
- Break-in doors: the Break-in check stays where it is part of going live (the save-guard pages show it as today). Doors that
  only existed to open the removed tab (BoardBar onOpenBreakIn, GuardDrawer "Open", use-status-change open:'break-in',
  Policies.tsx exposure pill) are removed or pointed at the guard page's own content; record each (owner decision flagged).
- The board's status region stays the single aria-live region in test mode.

### 11.4 Sign-in tests entry
- Remove the rail item (Shell.tsx NAV); `UNDER_ITEM.policies` gains 'sign-in-tests' so All Policies lights on that page.
- Policies page bar, right cluster: [view switch if present] [secondary "Sign-in tests" button, a plain lucide icon] [orange
  New policy]; gated exactly like the route (`screenOffered` / features.policyTesting).
- The Sign-in tests page head gets a "← Policies" back crumb (a new optional crumb slot on PageHead, styled like the board's).

### 11.5 Verification
Page scroll 0 (document + .bshell__main, height and width) at 1440×900, 1280×800, 1440×760 on every Sign-in tests tab and in
board test mode, at every stage of a run, in BOTH orientations. Filmstrips (every 120 ms, Run → settled) in the policy,
vertical and horizontal: HRMS (inactive → "When turned on"), Developer tools from Home broadband (rule 1 folds, rule 2
matches), a person outside the audience (another policy decides), an edit in the Inspector re-running; switching layout when
settled (no replay); a Past sign-in row; Use a saved sign-in; the page at a 1040 px window going vertical by itself.

## 12. 30 Sep OWNER CHANGE — Sign-in tests page V5: a sentence bar on top, the canvas explains itself, vertical only, templates

Owner, verbatim intent (selecting the in-canvas form card, the vertical journey, and the board panel's sentence line
"Kavya Menon signs in to HRMS from Office network"): "Exclude this form part and put a horizontal bar at the top, not inside
the canvas. The canvas should hold an empty state with context on how sign-in tests works. Then the animations: first a good
FINDING animation — this is too quick; more intuitive; you can use a scanner loader with a gradient, like Google AI search or
Lovable, or take inspiration from others. Instead of the horizontal approach I like the vertical — it feels like a flow into
one thing. Lock People and Runs for now (hide them), we will work on them later. Focus on Try a sign-in and Saved sign-ins;
both should be a part of one thing: saved sign-ins are treated like TEMPLATES, and Try a sign-in is the canvas. Then the inner
cards look very bad — especially the Outcome and the Which policy part: do better in animation and readability. First we
focus on the main thing — testing sign-ins in a better way; then saved sign-ins. Next (later) the same inside the policy
builder." Also: no videos; he reviews in the browser; work faster. §12 supersedes §8.1–§8.2 (the in-canvas form) and the
page's tabs. §8.3–§8.6 (engine run, hierarchy, compaction) still hold unless §12 says otherwise. The in-policy builder is NOT
in scope now (its trace and panel stay as they are until the page is approved).

### 12.1 One surface, no tabs
- Page = head (← Policies crumb, "Sign-in tests", caption) + the SENTENCE BAR + the CANVAS. No tab bar. People and Runs are
  hidden (keep their code and tests; one constant/flag locks them off — not deleted). The Saved sign-ins TABLE tab is hidden
  too: saved sign-ins now live in the surface as templates (§12.5). Routes/params that opened a tab land on the surface
  ('saved' opens the templates picker).
- The page never scrolls; the canvas takes the free height and scrolls inside.

### 12.2 The sentence bar (above the canvas, full width, not inside it)
- A raised bar (surface-raised, border-subtle, radius-lg, el-low) holding ONE sentence of tokens, reusing
  testing/SignInSentence (a new additive `layout="bar"`): "[Person ▾] signs in to [Application ▾] from [Office network ▾]
  on [Windows 11 laptop · registered ▾] …". Empty tokens read "Choose a person" / "Choose an application". After the
  application is chosen, ONLY the facts that application's rules read appear as further tokens (slide in, 60 ms stagger),
  prefilled with sensible defaults; each extra token's popover carries a TipDot naming what reads it. Tokens wrap to a
  second line rather than scroll.
- Right end of the bar: "Saved sign-ins" (opens the templates picker, §12.5), Save sign-in (bookmark, after a run), and the
  orange **Run** (Play icon; the page's only orange; never disabled; Ctrl/⌘+Enter anywhere on the page). Run with a token
  missing: that token turns to the error state and says why in its popover/under the bar — no disabled button.
- Changing a token after a run re-runs at the edit pace (60 %) — Run is not needed again, but Run replays.

### 12.3 The canvas — vertical only
- Always the vertical journey (one centred column): sign-in → Which policy → the deciding policy with nested rules →
  Outcome. No horizontal layout on the page (drop laneFit/use-lane-fit from the page; keep the orientation support in the
  shared renderer — the policy builder may use it later).
- EMPTY STATE (before the first run of the visit): the canvas explains how a sign-in test works, as the same vertical flow
  drawn as ghost nodes on the dotted spine, each with ONE short line: "Sign-in — who, which application, from where, on
  what" → "Finds the policy — the policies on the application, in order; the first that covers the person decides" →
  "Checks its rules — top to bottom; the first rule that matches wins" → "Outcome — what the person gets". A soft light
  travels down the spine every few seconds (reduced motion: static). Under it: "Start from a saved sign-in" — template
  cards (§12.5). No other sentences.
- The sign-in node at the top of the journey is compact (face + name + group, app, fact chips) — the form is the bar, so the
  node has no pencil (clicking the node focuses the bar's first token); Save sign-in lives in the bar.

### 12.4 Motion and the inner cards
- FINDING (stage 1) is slower and reads as a search: ≈ 1.6–2.2 s for the finding stage alone (the whole run may grow to
  ≈ 5–6 s; Skip is always there; edit re-runs 60 %; reduced motion = settled at once). A SCANNER: the candidate policies
  appear as skeleton rows; a soft gradient sweep (accent-toned linear-gradient shimmer — the Google AI Overviews /
  Lovable feel; tokens via color-mix of --accent / --accent-soft / --brand, no hex/rgba) passes over each row as the engine
  checks it; the engine line's words carry a moving gradient text fill while working; each row resolves to its reason in
  plain words; the decider gets a gradient border light that travels once around it, then settles to the accent ring and
  "Decides". Only then does it open into its rules.
- WHICH POLICY, redesigned for readability: a clear card titled with the application ("Policies on HRMS"), rows in engine
  order with the order number, the policy name at 14 px, and the result in plain words right-aligned ("Switched off",
  "Kavya Menon is not in it", "Checked after …", "Decides"); losing rows quiet (colour tokens, ≥ 4.5:1); the decider row
  becomes the container of its rules (§8.6). No boxes inside boxes beyond the one container.
- RULES: keep §8.6 (compact one-liners naming the failing check, matched rule open with ✓ rows, Show all checks), with the
  same readability pass (row rhythm, one mark column, right edges aligned).
- OUTCOME, redesigned as the hero of the flow: the decision large (icon + words, e.g. "Allowed with 2FA", in DECISION_TONE
  via tokens), one line of what the person is asked for ("Asked for Google Authenticator" / "Blocked with 'Your device…'"),
  then "Decided by <policy> · Rule 2 — <rule name>" in secondary text, and "What they see" as a small preview of the
  screen the person gets (reuse testing/WhatTheySee / screens-of) collapsed by default. It lands with a spring and ONE soft
  gradient ring pulse; its lines fade in 60 ms apart. Every animation: motion props only (no CSS transform/transition on
  motion elements), reduced motion = final state.

### 12.5 Saved sign-ins as templates (after 12.1–12.4 are right)
- A saved sign-in is a TEMPLATE for a test: name, the sentence (person, app, facts), the expected result and its level.
- Where: (1) the empty canvas's "Start from a saved sign-in" row of template cards (the most useful 3–6: different
  outcomes and applications) with "All saved sign-ins"; (2) the bar's "Saved sign-ins" button opens a picker (popover or
  side sheet, 480–560 px) with search and cards grouped by application: name, person · app · facts, expected badge; a card
  click fills the bar and runs. Cards reuse the policy Templates look (TemplateCard family) where it fits.
- Saving: after a run, the bar's bookmark saves the current sentence as a template (name, expected result prefilled from
  the result). A card's ⋯: Rename, Change expected result, Delete (with Undo toast).
- A template's last result vs expected shows as the small Pass / Fail mark on its card (the result of its last run in this
  visit, or Not run yet).

## 13. 30 Sep OWNER CHANGE — troubleshooting (a person in two groups, conflicts) and a THREE-node run with the board's cards

Owner, verbatim intent (selecting a policy-builder rule card: "1 In a corporate office · Ready · who [HR][FI] · if
Network zone in zone Corporate offices · then Second factor Password → Google Authenticator → Signed in"):
"The troubleshooting use case is not resolved yet — maybe the person is the problem, you can figure it out. Use case: one
person is in both groups, Engineering and Finance. On GitHub, for Engineering it can be one factor with password, but for
the Finance team it can be 2FA, and the person we chose is in both groups — how do we showcase this and how can the user
troubleshoot it? So we can add real people and groups in the person. Then, if we have a conflict, how do we show it? And
the experience takes the user too long to go through. What I want: one node for the PERSON with all the attributes, one
for the POLICY selection, and one for the OUTCOME. And this node looks very different from the one we use in the policy
builder — reuse those cards, because that one is very easy to scan and read."

### 13.1 The model (pure, tested)
- For a sign-in, besides the decider and its landing rule, work out what ELSE would apply to this person:
  - RULE conflicts — rules of the deciding policy AFTER the landing rule whose who + conditions also match this sign-in
    (evaluated on their own), with the decision each would give and the group(s) through which the person matches them
    ("via Finance"). Only those whose decision DIFFERS from the landing rule's are a conflict; same-decision ones are
    "also matches" (quiet).
  - POLICY conflicts — policies on the application AFTER the decider (engine order) that also cover the person and are on,
    with what they would decide.
  - For every rule's who-line: WHICH of the person's groups (or the named person) made it match ("Maya Iyer · via
    Engineering").
- Tests: the dual-group case gives exactly one rule conflict with the right via-group and decision; no conflicts on
  single-group sign-ins; parity with resolveSignIn is unchanged.
- SEED (showcase tenant, keep every scenario contract its tests pin): a real person in BOTH Engineering and Finance, and
  GitHub rules that give Engineering 1 factor (password) and Finance 2FA, in an order where the Engineering rule comes
  first — so the conflict is live in the demo. Also make sure a person picker can offer groups (see 13.3).

### 13.2 The run = three nodes on the vertical spine (supersedes the stage list in §8.6/§12.4, keeps its motion ideas)
1. PERSON node — "Who is signing in": face, name, email; EVERY group they are in (chips, names not initials); then the
   sign-in's attributes in the board card's row grammar (icon + label + value chips): application, network (and the zone it
   falls in), place, device (and the device profile it meets or not), time, risk — only the ones stated/read.
2. POLICY node — "Which policy decides": the deciding policy name and one line why ("First policy on GitHub Enterprise
   that covers Maya Iyer"), the other policies on the app as ONE compact line ("2 others: 1 switched off, 1 does not cover
   her" — expands). Inside: the policy's rules as the POLICY BUILDER'S RULE CARDS (reuse RuleCard's look/grammar: number,
   title, who / if / then rows with the same chips, faces, zone chips and the then-flow "Password → Google Authenticator →
   Signed in"), read-only, each with its result: matched (accent ring, ✓ on the rows that held), didn't match (compact to one
   line naming the failing row), not reached (quiet title). A CONFLICTING rule is NOT compacted: it shows in full with a
   notice chip "Also applies to Maya · via Finance" and "Not used — rule 2 matched first", its own then-flow, and a fix hint
   in one line ("Move it above rule 2 to ask Finance for 2FA") with "Open rule" (the board). Policy conflicts show as one
   line under the other-policies line with the same "Not used — <decider> comes first".
3. OUTCOME node — the decision, what the person is asked for, "Decided by <policy> · Rule N", and What they see (the
   player). When there is a conflict, one quiet line: "Maya Iyer is in Engineering and Finance — Engineering's rule applies
   first" linking to the conflicting card.
- Motion: the run still plays (finding inside the policy node, rules one by one, outcome last) but SHORTER to read and
  watch: ≈ 3–4 s total; Skip; reduced motion = settled.

### 13.3 The Person token
- The bar's Person picker lists REAL people with their groups on the option's second line ("Maya Iyer · Engineering,
  Finance") and, in a second group of options, GROUPS ("Anyone in Finance") — choosing a group tests a member of just that
  group. The person node then says "A member of Finance".

## 14. 30 Sep OWNER CHANGE — Sign-in tests uses the POLICY BUILDER'S layout

Owner, verbatim intent (screenshots of the builder: collapsed icon rail, the builder bar "← Policies › HRMS access from
corporate offices · Inactive … Try a sign-in · Discard · Save draft · Save policy", the dotted full canvas with the chain
"A sign-in arrives at HRMS → 1 In a corporate office (who / if / then) → Nothing else matched", and the right Inspector panel
"1 In a corporate office · Who (Groups, People) · If (Network zone in zone Corporate offices, + Add) · Then (Allow / Deny,
First factor, Second factor …) · Save rule"): "Can we use the same layout we use in the policy builder — full canvas, the
left side collapsed, the same header, then the full canvas and the form inside the canvas as we have there. It should feel
like we are using the same builder for tests as well. No need to do much on the front-end side — just fix the content
according to whatever we have in Sign-in tests." Supersedes §12.1–§12.2's page chrome and sentence bar; §12.3's empty
state content (approved), §12.4 motion, §13 (three nodes, board cards, conflicts) all hold inside this layout.

### 14.1 Chrome
- The rail COLLAPSES to icons exactly as it does when the builder opens (reuse the builder's mechanism; restore on leave).
- The builder's TOP BAR (the same component/classes as BoardBar/.bbtop): "← Policies › Sign-in tests" on the left (no
  status pill, no rename pencil); on the right a secondary "Saved sign-ins" (the picker) and nothing orange (Run lives in
  the panel foot, like Save rule). Page head/caption and the crumb row go (the bar carries them).
- The rest of the page is the builder's full dotted CANVAS (same stage, background and bottom dock: fit + zoom; no
  undo/redo, no Expand all unless it is meaningful) with the builder's right PANEL floating inside it.

### 14.2 The right panel = the sign-in form (the Inspector's chrome and grammar)
- Same floating panel as the rule Inspector (header row, scrolling body, sticky foot, the ><  collapse and grip if they
  come for free). Header: "Sign-in" (or the saved sign-in's name when one is loaded).
- Body sections in the Inspector's section grammar (icon + section title, then rows):
  - Who — the Person row (a picker: real people with their groups on the second line; groups too — §13.3).
  - Application — the application picker (logos).
  - Where and on what — ONLY the facts the chosen application's rules read, each a row in the Inspector's condition-row
    look (attribute · value picker): Network (preset or IP), Place, Device (preset + details), Time, Risk; prefilled with
    sensible defaults; a TipDot names what reads it. Rows slide in when the application is chosen.
  - "Use a saved sign-in" as a quiet row/link at the top of the body (opens the Saved sign-ins picker; loading one fills
    the form and runs).
- Foot: the orange "Run" (never disabled; a missing person/application shows its error under that row; Ctrl/⌘+Enter)
  and, after a run, "Save sign-in" (secondary) beside it.

### 14.3 The canvas
- Before the first run: the approved "How a sign-in test works" empty state, centred in the canvas beside the panel; its
  "Choose a person" button opens the panel's Person picker.
- A run draws a vertical chain in the builder's visual language: the builder's START pill ("A sign-in arrives at GitHub
  Enterprise") → the PERSON node → the POLICY node → the OUTCOME node, joined by the builder's spine (§13.2 for what each
  node holds). The policy node's rules are the builder's RuleCards (read-only trace variant). The chain animates in as the
  engine runs (finding → rules → outcome, ≈ 3–4 s, Skip, reduced motion = settled) and the canvas keeps the active node in
  view. Clicking a rule card opens that rule in its policy's builder (existing route) — never edits here.

## 15. 30 Sep OWNER CHANGE — the settled run reads at a glance (outcome first)

Owner (selecting the settled chain for Devon Rao → Microsoft Outlook): "at the first glance the user should see the OUTCOME
— WHICH POLICY it passes, and the outcome; the rest is secondary. And the content is also too much."
- The run plays as before. A beat after it is done (~1.2 s after the answer lands; at once on Skip, a revisit, reduced
  motion) the PERSON folds to one line ("Devon Rao · Contractors · ✕ Android 12 phone" — ✕ red on a fact that failed a
  check the engine read; a risk score says "Risk 55") and the POLICY to its head: "<name> [Decides]" with why UNDER the
  name, as the builder's card says its description ("Rule 1 didn't match: Device", "Rule 2 matched: Compliant device,
  working remotely") — its own line, so a long policy name never cuts it (it was cut on 19 of 27 saved sign-ins when it
  shared the name's line). A press on either (or Expand all) opens it; Collapse all folds everything, the answer too.
- The OUTCOME is the hero, 880 wide on 640 stops, two halves: left, at the card's top (level with the player's label, the
  decision the first thing under the policy's line) — the decision in its tone at 24 px with the caveat's TipDot beside
  it, ONE line of what they are asked for (NOT a Deny's message: that is What they see's last page, whole, beside it),
  the conflict line, Open policy; right, What they see compact (368×230, 16:10). ≤ 900 px canvas: the player under the
  words. "Decided by" is the policy's line, said once.
- A conflict is said ONCE, by the answer: its line is `conflicts.ts` `line` — any top finding in the conflict tone (a rule
  that also applies, a later policy that would answer otherwise, an exception, a Deny first), never what is by design (a
  group's policy before Everyone's). Pressed, the policy opens on the rule it is about (the rule that also applies, or
  the finding's rule), focused; a policy conflict brings the policy's own line into view. Folded (Collapse all), the
  answer's one line counts it ("⚠ 1 conflict", the line on hover, a button to the same place). The policy's head never
  counts it (`conflictCount` = conflict-toned findings).
- Fits with no canvas scroll at zoom 1 at 1440×900 and 1280×800 for every saved sign-in; the page never scrolls.
