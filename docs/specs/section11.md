
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
