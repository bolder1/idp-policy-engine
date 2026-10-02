# The board — review backlog

A six-lens adversarial review of `src/brand/screens/board/` (4,193 lines) plus the five
files its integration touches. 51 raw findings, deduped to 39. Eight were sent to a
skeptic told to refute them; six survived and **have been fixed**. The rest are below,
unverified — they were filed with exact repro steps but no second opinion, so treat each
as a lead rather than a confirmed defect.

## Fixed already

- **The pinned default card never renders — no seeded policy has `Policy.fallback`** — `Board.tsx:330`
- **WhatEditor shows method defaults it never writes, so the journey beside it contradicts the controls** — `WhatEditor.tsx:28`
- **The Reach bar's fill is always invisible — the inline `var(--tone-dot)` is undefined outside a card** — `Inspector.tsx:193`
- **The '·2 / also in another way in' marker can never fire — condition ids are compared against ckeys** — `WhenEditor.tsx:136`
- **The rule-number badge and the library badges lose their colour — `var(--tone-bg)`/`var(--tone-fg)` are undefined outside `.bb__card`** — `Inspector.tsx:130`
- **'At a glance' reads '1 rules, all on' and '0 rules, all on'** — `Library.tsx:53`

## Refuted by the skeptic, no action

- **The 'Reads as' sentence drops the brackets between alternatives, so it states a different rule** — `WhenEditor.tsx:201`

  The code does render what the claim describes (WhenEditor.tsx:190-197 joins each card's clauses with " and " and puts a bold `or` between cards, with no parentheses), but the stated consequence — "it states a different rule" — is false, and what remains is cosmetic.

1. The sentence denotes the SAME predicate. "A and B and C or D and E" is a disjunction of conjunctions under the ordinary precedenc…

- **'Ready to publish' prints '1 rule never win' / 'decide no modelled situation'** — `CheckTab.tsx:251`

  The text is literally as described — I confirmed the state is reachable and the numbers exact. A temporary vitest run of `sweep(policy, rawEnv, 570)` over every seeded policy gives exec-stepup `reach=[144,0,72,120,8,8]` (dead = rule 2 "External risk verdict") and contractor-session `reach=[360,0]` (dead = rule 2 "Re-auth after idle"), so `dead.length === 1` is real, and CheckTab.tsx:251 does rende…


## Outstanding, unverified (30)

Ordered by the filer's own confidence. Two are duplicates of fixes already applied
(`Board.tsx:252`, `WhatEditor.tsx:109`) and can be struck off.

### `src/brand/Shell.tsx`

**Nothing in the nav rail is highlighted while you are on the board** — line 163 · _high_

`POLICY_SCREENS` lists 'builder' but not 'board'. Two things key off it. (a) `isActive` (line 166) returns false for the 'Policies' parent, so on the board the top-level nav item loses `is-active` and `aria-current="page"`. (b) The auto-open effect (line 194) does not reopen the Policies submenu when you land on the board, though it does for the trail. Separately, the sub-item highlight at line 326-327 special-cases only `c.screen.name === 'policies' && screen.name === 'builder'`, so 'All Policies' also loses its active state on the board. The net effect: on the board the rail shows no current location at all — and because of the rail-expansion bug above, the rail is expanded and fully visible while it does so.

*Repro.* 1. Policies → click a policy name (trail): 'Policies' and 'All Policies' are highlighted in the rail. 2. Click 'Board' on the policy bar. The rail expands, and neither 'Policies' nor 'All Policies' is highlighted any more. 3. For the submenu case: on the board, click 'User Management' in the rail (this closes the Policies group). Click 'Trail' — the Policies group reopens. Click 'Board' — it does not.

*Suggested fix.* Add 'board' to POLICY_SCREENS, and extend the subitem test at line 327 to `(c.screen.name === 'policies' && (screen.name === 'builder' || screen.name === 'board'))`.

**Switching Trail → Board expands the nav rail and steals ~171px from the stage** — line 202 · _high_

The rail's auto-collapse effect tests `screen.name === 'builder'` only. Arriving on the trail collapses the rail to 64px and sets `autoCollapsed.current = true`. Navigating to the board falls into the `else if (autoCollapsed.current)` branch, which treats the board as 'left the builder': it clears the flag and calls `setCollapsed(false)`, expanding the rail back to 235px. The board is the screen with the least room to give — a pan/zoom stage plus a fixed 400px inspector (`board.css: --bb-insp: 400px`) — and it is the one screen that gets the rail at full width. Going back to Trail re-collapses it, so the rail visibly slides in and out on every click of the toggle. Board.tsx also runs its one-shot `fit()` in a rAF from a layout effect (lines 94-99), which measures `stage.clientWidth` while that expansion is under way, so the initial zoom/centring is computed against a width the stage is about to lose.

*Repro.* 1. Policies → click a policy name. The rail collapses to icons (64px). 2. Click 'Board' in the policy bar's Trail|Board switch. The rail expands to 235px and the board's stage narrows by ~171px. 3. Click 'Trail'. It collapses again. Repeat — it flips on every toggle.

*Suggested fix.* Change the condition to `screen.name === 'builder' || screen.name === 'board'`.


### `src/brand/screens/PolicyDetails.tsx`

**"Edit details" is a one-way door: you leave the board and come back to the trail** — line 52 · _high_

`const back = () => store.go({ name: 'builder', policyId })` hardcodes the trail, and so does the Save handler at line 131. PolicyDetails has no idea which builder sent it. The policy bar's 'Edit details' button (policy-bar.tsx, the `.bpbar__edit` button) is rendered identically on both builders, so from the board all three exits — the breadcrumb's policy-name crumb (line 60), the 'Back to the rules' button (line 118) and 'Save details' (line 131) — dump you on the trail. There is no way back to the board from there except the Trail|Board toggle or returning to Policies and using the ⋯ menu. Combined with the draft-loss issue above, taking this round trip from the board also destroys whatever was unsaved on the board.

*Repro.* 1. Policies → ⋯ → 'Open in board'. 2. Click 'Edit details' in the policy bar. 3. Click 'Back to the rules' (or the policy name in the breadcrumb, or change the name and click 'Save details'). 4. You land on the trail builder, not the board you came from.

*Suggested fix.* Give PolicyDetails a `from: 'builder' | 'board'` on its screen state (or read the previous screen from the store) and return there.


### `src/brand/screens/board/Board.tsx`

**The pinned default card never renders — every seeded policy has `fallback === undefined`** — line 252 · _high_

`const terminal = policy.fallback` is used raw at line 252 and gated at line 330 (`{terminal && <TerminalCard .../>}`). No policy in the running app has a `fallback`: `policiesAt('medium')` returns `seedPolicies` unchanged, and grep of data.ts shows `fallback` appears only in the `Policy` type (306), `fallbackRule()` (1197) and `blankPolicy()` (1214) — none of the nine seeded policy literals sets it. v1 does not have this problem: PolicyBuilderMain.tsx:256 reads `const terminal = draft.fallback ?? fallbackRule()`. Three consequences, all user-visible: (1) the chain has no 'Nothing else matched' card at its end, contradicting docs/builder-board.md, whose diagram ends with `⌂ Nothing else → 1 factor` and whose model note says three things about it stay fixed — 'its name, its place, and the fact that it exists'; (2) the default is uneditable from the board — Inspector.tsx:84 gates FallbackPane on `draft.fallback` and Library.tsx:416 gates the 'When nothing matches' section on `policy.fallback`, so `BoardBuilder.patchFallback` (which itself already writes `draft.fallback ?? fallbackRule()`) is unreachable dead code; (3) every last rule's `else` row says 'Nothing else matched · the default' pointing at a card that is not on the board. The `?? fallbackRule()` the author wrote in patchFallback but not in the render path is the tell that this is an oversight rather than a design choice.

*Repro.* Policies list → ⋯ on 'Finance Team – High Security' → 'Open in board'. The chain ends with the last rule and the '+ Add a rule here' connector; there is no default card. Switch to Trail on the policy bar and the 'Nothing else matched' node is there. Worse on 'Partner Portal Access' (rules: []): the stage shows only the start node and one '+' connector. Then open the Check tab → 'Rehearse it' with any person: the trace falls through (hitIndex null), Board.tsx:235 sets `landedOn = 'terminal'`, the start node stops rendering the token because `landedOn !== null`, and nothing renders it instead — the sign-in token animates off the start node and vanishes into empty stage. Create a new policy via Create policy (blankPolicy sets `fallback: fallbackRule('1fa')`) and open THAT in the board and the card appears, which confirms the cause.

*Suggested fix.* Mirror v1: `const terminal = policy.fallback ?? fallbackRule()` in Board.tsx, and drop the `&& draft.fallback` / `{policy.fallback && ...}` gates in Inspector.tsx:84 and Library.tsx:416 (both already have `patchFallback` doing the `?? fallbackRule()` normalisation on write).

**Tabbing to a card below the fold scrolls the overflow:hidden stage, carrying all three floating toolbars out of view with no way to bring them back** — line 260 · _high_

`.bb__stage` is `overflow: hidden` (board.css:39) and the chain is offset by a transform on `.bb__world`, which contributes to the stage's scrollable overflow. When focus moves to a card that is below the visible area the browser scrolls the stage's own scroll offset — but `view.x/y` is React state that knows nothing about it, and the three `.bb__float` toolbars are `position: absolute` inside the stage (board.css:317), so they scroll away with the content. Nothing can undo it: the wheel handler calls `e.preventDefault()` unconditionally (Board.tsx:138) so the stage can never be wheel-scrolled back, drag-pan only changes `view`, and `fit()` (Board.tsx:81-92) sets `view` and never touches `scrollTop`. Verified live on a 6-rule policy: focusing the last card moved `stage.scrollTop` from 0 to 66.4, and the Undo/Redo toolbar went from 12px below the stage's top edge to −54.4px (off the top). Clicking Fit afterwards left `scrollTop` at 66.4 and the toolbar at −54.4. The dot grid, which is a background on the stage itself, does not move, so the chain also visibly detaches from its grid. On a longer chain the offset is larger and Undo, Redo, Try a sign-in, Break-in test, What changes, Discard, Review & publish, and the whole zoom group are all gone. Separately: the stage is `tabIndex={-1}` and has no key handlers, so there is no keyboard way to pan at all — `.bb__stage:focus-visible` (board.css:50) styles a focus state Tab can never reach.

*Repro.* Open "Executive Step-up Authentication" in the board at 100% zoom. Click once on the empty stage, then press Tab repeatedly until focus reaches the last card ("Nothing else matched"). The Undo/Redo group in the top-left and the pips/publish group in the top-right slide up out of the stage. Press nothing else — click "Fit" (if you can still reach it with a mouse) and they do not come back; the wheel does not scroll them back either.

*Suggested fix.* Give the stage `overflow: clip` (which is not scrollable) or add an `onScroll`/`focusin` handler that folds `scrollTop`/`scrollLeft` back into `view` and resets them to 0. Either way the floats should sit outside the scrollable box, and the stage needs arrow-key panning since it is currently pointer-only.

**An out-of-audience rehearsal lands the sign-in token on the default card while the board says no rule ran** — line 235 · _medium_

When `walk()` finds the context out of audience it returns `{ steps: [], hitIndex: null, outOfAudience: true }` (simulate.ts:319). Board.tsx:235 computes `landedOn` as `trace && revealed >= trace.result.steps.length ? (hit === null ? 'terminal' : hit) : null`. With `steps.length === 0`, the reveal loop at line 230 schedules `revealed = 0` after 260ms, so `0 >= 0` is immediately true and `landedOn` becomes `'terminal'`.

`inAudience` is false, so the start node keeps its pulse (line 275) and no rule card lights — but `TerminalCard` is still handed `landed={landedOn === 'terminal'}` (line 335), which renders the travelling `●` token inside the default card's action row. The board therefore shows the token resting on "Nothing else matched" at the same moment as the paragraph directly above it (line 289) says "**Not governed.** This policy does not cover X, so no rule ran." — and the Check tab says the same thing. `reached` is correctly `null`, so the card is not styled as hit, which makes the stray token read as a rendering glitch rather than a decision.

The `landedOn` guard needs the same `inAudience` gate that `stepKind` (line 239) and `litLink` (line 246) already have.

*Repro.* Open a policy whose audience is a single group — e.g. the seeded contractor-scoped policy at data.ts:834 (`audience: audienceOf(['contractors'])`) — in the board. Inspector → Check tab → "Try a sign-in" → under **Who** pick Priya (Finance, i.e. outside the audience) → press "Rehearse it". After ~260ms the orange ● token appears on the pinned "Nothing else matched" card, while "Not governed … so no rule ran" is rendered at the top of the chain and in the Check tab result.

*Suggested fix.* Gate line 235 on audience: `const landedOn = trace && inAudience && revealed >= trace.result.steps.length ? (hit === null ? 'terminal' : hit) : null` (move the `inAudience` const above it), so an ungoverned rehearsal shows the pulse and the "Not governed" note and nothing else.


### `src/brand/screens/board/BoardBuilder.tsx`

**The board ignores store.features, so the Lite edition still shows everything Lite withholds** — line 184 · _high_

BoardBuilder never reads `store.features` — it imports neither `featuresOf` nor `store.features`. The trail gates each of these capabilities (PolicyBuilderMain.tsx:385 gauntlet, :386 blastRadius, :420 publish, :697 gauntlet dialog, :720 impact dialog, :1019 checkStep). The board renders all of them unconditionally: the 'Break-in test' pip with its grade and breach count (lines 184-203 = features.gauntlet), the 'What changes' pip (lines 204-222 = features.blastRadius), 'Review & publish' → ReviewDialog (lines 229, 260 = features.reviewStep/publish), and the Check tab's linter panel (Inspector.tsx:70 = features.checkStep). The contradiction is on screen at the same time: the EditionBar sits in the Shell footer (Shell.tsx:261) on the board screen, and its gaps panel — `gapsFor(LITE)` — lists 'The gauntlet', 'Blast radius', 'The checks' and 'The publish gate' as capabilities this edition does not have, while the board's toolbar three inches away is showing all four.

*Repro.* 1. In the Shell footer's Edition switch, click 'Lite'. The Policies list loses its Coverage tab and its Exposure column, confirming the gate took effect. 2. Open any policy's ⋯ menu → 'Open in board'. 3. The stage's top-right toolbar still shows 'Break-in test <grade>', 'What changes', and 'Review & publish'; the inspector still has a Check tab with diagnostics. 4. Open the EditionBar's gaps panel: it simultaneously claims those four are unavailable in this edition.

*Suggested fix.* Read `const { features } = useBrand()` in BoardBuilder and gate the same four surfaces the trail gates, including the Check/Impact inspector tabs.

**Undo can leave the selection past the end of the rule list — the tab says 'Rule' and the panel shows the policy library** — line 82 · _medium_

`insert`, `move` and `remove` all repair `selection` after they change the rule list, but the undo/redo path (`setHist(action === 'redo' ? redo : undo)` on line 82, and the toolbar buttons on lines 164/167) replaces `hist.present` without touching `selection`. When the undone edit was an insert at the end, `selection.index` is now `draft.rules.length`. `Inspector` then falls through `selection.kind === 'rule' && draft.rules[selection.index]` (line 82) to `<Library>`, while the tab label at line 69 still reads 'Rule' because it only checks `selection.kind === 'none'`. When the undone edit was a delete or a move, the index silently points at a different rule than the one the user had open.

*Repro.* Open any policy in the board → click the ⋯-free 'Duplicate rule' icon on the LAST card (or add a rule from the library, which lands at the end and selects itself) → press Ctrl+Z. The new card disappears from the chain, the inspector's first tab still reads 'Rule', and the panel under it shows the policy header with 'Nothing selected — choose a card on the board, or add a rule below.'

*Suggested fix.* Clamp on commit: after any `setHist`, if `selection.kind === 'rule' && selection.index >= hist.present.rules.length` reset to `{ kind: 'none' }` — an effect on `draft.rules.length` is enough, or wrap undo/redo in a helper that does it.

**The break-in test grades a policy that has no rules** — line 96 · _medium_

`const test = useMemo(() => (saved ? runGauntlet(draft, env, overrides) : null), …)` is guarded only on the policy existing, never on it having rules, and the pip that renders it (lines 184-203) has no emptiness guard either. The trail deliberately refuses to do this — PolicyBuilderMain.tsx:262-270 hides the whole pip row behind `!empty` with the comment 'the gauntlet was doing worse than nothing, dealing thirteen sign-ins at an empty policy and reporting an F, which is a grade for a race nobody entered'. On the board that exact behaviour is back: with no rules every attempt falls through to `fallbackOf(policy)` (simulate.ts:227, which returns '1fa' when there is no fallback), so all seven hostile cards get in and the pip reports a failing grade and a breach count for a policy that has not been written yet. On top of that, the board's empty state is a start node and a single '+' connector with nothing else on the stage (see the missing-terminal finding), so the failing grade is the loudest thing on the screen.

*Repro.* 1. Policies → ⋯ → 'Open in board' on any policy. 2. Delete every rule using each card's ⋯ → Delete. 3. The 'Break-in test' pip in the top-right still renders, now with a failing grade and 'N through', for a policy with zero rules. Switch to the trail on the same draft state and the whole pip row is gone.

*Suggested fix.* Mirror the trail: compute `const empty = draft.rules.length === 0` and suppress the break-in pip, the 'What changes' pip and Review & publish while it is true.

**Reordering rules moves the inspector onto a different rule than the one that was selected** — line 120 · _medium_

`move` only repairs the selection when the moved rule *is* the selected one: `if (selection.kind === 'rule' && selection.index === from) setSelection({ kind: 'rule', index: to })`. Selection is stored as a positional index, so any reorder that crosses the selected position leaves that index pointing at a different rule — the card highlight jumps and the inspector silently changes subject, and the next edit lands on a rule the author did not choose. The two other index-shifting paths handle it: `remove` (line 126) decrements correctly, and the shipping builder always follows the moved rule (`setSelected(to)`, PolicyBuilderMain.tsx:299). The same gap exists at line 254, `onApplyRules`: applying a break-in fix of `kind: 'insert'` splices a rule in at `fix.at` without touching the selection, where PolicyBuilderMain.tsx:703 does `setSelected(fix.at)`.

*Repro.* 1. Open a policy with at least 6 rules in the board (e.g. 'Zero-Trust baseline' after adding rules, or any 6-rule policy). 2. Click rule 4's card — the inspector header shows '4' and rule 4's name. 3. Press and drag rule 2's number grip down past the last card and release. 4. The rules are now 1,3,4,5,6,2. The inspector header still reads '4' but is now showing what used to be rule 5, and the highlighted card on the board has moved with it. Rule 4 (the one selected) is now at position 3 and is no longer selected. Typing in the name field renames rule 5.

*Suggested fix.* Track the selection by rule id rather than index, or repair it in `move` the way `remove` does: `if (selection.kind === 'rule') { const i = selection.index; const next = i === from ? to : i > from && i <= to ? i - 1 : i < from && i >= to ? i + 1 : i; setSelection({ kind: 'rule', index: next }) }`. Add `setSelection({ kind: 'rule', index: fix.at })` to `onApplyRules` for the insert case.


### `src/brand/screens/board/ImpactTab.tsx`

**The "No broken rules" guarantee counts errors on rules that are switched off** — line 63 · _high_

`const errorCount = diagnostics.filter((d) => d.severity === 'error').length` does not filter by `rule.enabled`, and it is fed straight to `badges(…, errorCount)`, whose `no-errors` guarantee (impact-arena.ts:266) is `earned: errorCount === 0`. Every other consumer in the codebase filters: CheckTab.tsx:81 uses `d.ruleIndex === -1 || draft.rules[d.ruleIndex]?.enabled`, BoardBuilder.tsx:98 does the same for `blockers`, ReviewDialog (builder-dialogs.tsx:80) uses `policy.rules[d.ruleIndex]?.enabled !== false`, and the shipping equivalent impact-arena-dialog.tsx:82 uses `draft.rules[d.ruleIndex]?.enabled !== false`. diagnostics.ts leaves `blank`, `nomethods` and `unreachable` unguarded by `enabled` — the ReviewDialog comment says so explicitly — so a deliberately-disabled rule with an unset condition value makes the Impact tab report a guarantee as lost that the Check tab, the publish gate and the review dialog all say is fine.

*Repro.* 1. Open a policy in the board, select a rule. 2. 'When it applies' → add a Network Zone condition and leave the value unchosen (it shows 'choose…' in red). That raises a `blank` error. 3. Toggle the rule off with the switch in the inspector header. 4. Check tab → 'Ready to publish' → first row reads '✓ No broken rules · Nothing the linter can prove wrong', and Review & publish is not blocked. 5. Impact tab → 'Guarantees' → 'No broken rules' is drawn as **lost** with '1 error still open in Checks.' Two panels of the same board contradict each other about the same policy.

*Suggested fix.* Match impact-arena-dialog.tsx:82 — `diagnostics.filter((d) => d.severity === 'error' && (d.ruleIndex === -1 || draft.rules[d.ruleIndex]?.enabled !== false)).length`, i.e. reuse the same predicate CheckTab.tsx:81 already computes.

**The situation field is 1,440 tab stops, and the filters do not shrink it** — line 194 · _high_

Every one of the 1,440 modelled situations is rendered as a focusable `<button>`. Verified live: 1,440 focusable dots. The "Focus on" filters only add `is-dim` (board.css:785, `opacity: 0.18`) — after filtering to one person, 1,080 dots are dimmed to near-invisibility and all 1,080 are still focusable and still carry their full aria-label. So a keyboard user who tabs into "Every situation" must press Tab 1,440 times to reach "Who moved", and 1,080 of those stops are on dots the user has explicitly filtered out and cannot see. There is no skip link and no way out short of clicking elsewhere with a mouse.

*Repro.* Open the board, go to the Impact tab, scroll to "Every situation". Click a person chip (e.g. "Priya") to filter. Now Tab from the last filter chip: focus lands on dot 1 of 1,440, and keeps going through every dimmed dot. Shift+Tab out is the only escape; forward-tabbing to the "Who moved" section takes 1,440 presses.

*Suggested fix.* Set `tabIndex={-1}` (or `disabled`) on dots that fail `visible(s)`, and make the field a single composite widget — one tab stop with arrow-key navigation across the grid and `aria-activedescendant` — rather than 1,440 stops.


### `src/brand/screens/board/Inspector.tsx`

**The inspector's tabs have no panel — no aria-controls, and the body is not a tabpanel** — line 64 · _high_

`Tabs` accepts a `panelId` prop specifically so it can emit `aria-controls` (kit.tsx:487-488, 522), and the Inspector never passes one. `.bb__inspbody` (line 74) has no `id` and no `role="tabpanel"`, and neither does the `motion.div` inside it. Verified live: all three tabs report `aria-controls: null` and the body reports `role: null`. So the tab strip announces correctly (`role=tab`, `aria-selected`, roving tabindex and arrow keys all work) but points at nothing — a screen reader user arrowing between Rule / Check / Impact is told the selected tab changed with no way to jump to the content it selected, and the content itself is announced as an unlabelled generic region rather than the panel for the tab they just chose.

*Repro.* Open the board with a screen reader. Focus the inspector tab strip and press ArrowRight from "Rule" to "Check". The tab change is announced; there is no associated panel to navigate to, and pressing the "move to controlled element" command does nothing.

*Suggested fix.* Give `.bb__inspbody` a stable `id` plus `role="tabpanel"`, `tabIndex={0}` and `aria-labelledby` the active tab, and pass that id to `<Tabs panelId={...}>`.


### `src/brand/screens/board/RuleCard.tsx`

**The card's Enter/Space handler cancels every button inside it — Delete, Duplicate, Move up/down and the on/off switch are dead to the keyboard** — line 113 · _high_

The card wrapper is `role="button" tabIndex={0}` with `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}`. That handler is on an ancestor of six native controls (Move up, Move down, Duplicate, Delete, the `bb__idx` grip, and the `role=switch` Toggle), so it also fires for keydowns that originate on those buttons and calls `preventDefault()` on them. A native button's activation behaviour runs after keydown dispatch completes, so cancelling the keydown suppresses the synthetic click for BOTH Enter and Space. The buttons are focusable, are announced, look focused (`.bb__card:focus-within .bb__acts` reveals them) — and do nothing. Only a mouse click works. Verified live on the board: dispatching keydown for ' ' and 'Enter' from the Delete button and from the enable/disable switch returned `defaultPrevented: true` for all four combinations, and the rule count and `aria-checked` were unchanged. The card is selected instead, which is the wrong action entirely for someone trying to delete a rule.

*Repro.* Open a policy in the board (policy row ⋯ → Open in board). Tab to a rule card, then Tab again three times to reach "Delete rule". Press Enter, then press Space. The rule is not deleted; the card just becomes selected. Same for "Duplicate rule", "Move up", "Move down", and the rule's on/off switch. Clicking any of them with the mouse works.

*Suggested fix.* Guard the handler on the event's origin: `if (e.target !== e.currentTarget) return` before the Enter/Space branch. (TerminalCard at line 233 has the same handler but no interactive descendants, so it is unaffected.)

**A dragged card lags the pointer at any zoom other than 100%** — line 107 · _medium_

`dragOffset` is measured in viewport pixels (`Board.tsx:184-195` computes `dy = ev.clientY - d.startY` and compares `ev.clientY` against `getBoundingClientRect()` midpoints, both viewport space) but applied as `transform: translateY(${dragOffset}px)` on a card that lives inside `.bb__world`, which carries `scale(view.z)` with `transform-origin: 0 0` (board.css:52-58). The translation is therefore scaled by `z`, so the card moves `z · dy` on screen while the pointer moves `dy`. The drop target is still computed correctly from `ev.clientY`, so the card visibly detaches from the cursor and lands somewhere the ghost was not.

*Repro.* Open a policy with several rules in the board (e.g. 'Executive Step-up Authentication', six rules) → press the `−` zoom button twice (100% → 76%) → press and drag the number grip on card 1 downward by roughly two card heights. The card trails about a quarter of the way behind the pointer, and the further you drag the wider the gap; at Fit on a long chain (z can go to 0.5) it moves half as far as the cursor.

*Suggested fix.* Divide by the current zoom before applying — pass `view.z` into `RuleCard` and use `translateY(${dragOffset / z}px)`, or record the drag in world coordinates.

**role="button" on the card makes its six inner controls presentational to assistive tech** — line 108 · _medium_

The card is a `motion.div` with `role="button"`. The ARIA `button` role is defined as Children Presentational: true, so conforming assistive technology removes every descendant from the accessibility tree. Inside this card sit a nested `role="button"` grip (line 128), four `<button>`s (Move up, Move down, Duplicate, Delete, lines 158-169) and a `role="switch"` Toggle (line 171). To VoiceOver and NVDA in browse mode the card is one control named "Rule 1: Block compromised, button" and those six controls do not exist — there is no other route to Delete, Duplicate or the enable/disable switch, since the board deliberately has no kebab menu (board.css:196, "never a hidden menu"). A nested `role="button"` inside a `role="button"` is also invalid on its own. The grip additionally advertises `aria-label="Drag to reorder rule 1, or use the arrows"` while having no Enter/Space activation at all.

*Repro.* Open the board with VoiceOver (or NVDA browse mode) and navigate by control. The rule cards are announced as single buttons; the delete, duplicate, reorder and on/off controls inside them are never reached by the rotor/element list. Tab still lands on them (they are focusable), where they are announced with no useful role context.

*Suggested fix.* Drop `role="button"`/`aria-pressed` from the card container and make selection an explicit control (e.g. the title as a button, or select-on-focus), leaving the card a plain grouping element so its contents stay in the tree.


### `src/brand/screens/board/WhatEditor.tsx`

**The Deny / Let in / Let in-then-verify choice claims to be a radiogroup but arrow keys do nothing** — line 43 · _high_

`.bb__decide` is `role="radiogroup"` with three `role="radio"` buttons carrying `aria-checked`, but there is no keydown handler anywhere in WhatEditor and no roving tabindex — verified live: all three tiles report `tabIndex: 0`. Screen readers announce "radio button, 1 of 3" and users press Left/Right or Up/Down to change the selection, which is the defined interaction for the role. Here the arrow keys do nothing at all (or scroll the inspector), and instead of the expected single tab stop the group eats three. The decision — the single most consequential control on a rule — is the one place the promised keyboard model is absent.

*Repro.* Open the board, select a rule, focus the "What happens" tiles. Focus "Let in" and press ArrowRight or ArrowDown: the selection does not move to "Let in, then verify". Tab three times to get past a control that should be one stop.

*Suggested fix.* Add roving tabindex (`tabIndex={on ? 0 : -1}`) and an `onKeyDown` that moves selection+focus on ArrowLeft/Right/Up/Down and Home/End — the same shape `Tabs` in kit.tsx:495-505 already implements.

**First-factor method picker shows a method the rule does not have; the journey beside it says "A chosen method"** — line 109 · _high_

Same class as the chain defect, in the same panel. Line 109 renders `value={rule.firstFactorMethod ?? METHODS[0]}` — a read-time default that is never patched into the rule. `journeyOf` (model.ts:56) reads the model: `rule.firstFactor === 'Specific' ? (rule.firstFactorMethod ?? 'A chosen method') : …`. So selecting First step = 'Specific' on a rule with no `firstFactorMethod` (no seeded rule has one — data.ts references it only at the type declaration, line 212) makes the picker read 'miniOrange Push' (METHODS[0], rule-form.tsx:129) while the journey step rendered a few lines above it, and the THEN line on the rule's card on the stage, both read 'A chosen method'. The rule is published with `firstFactorMethod` still undefined. Line 177 has the same shape for `preferredFallback`: picking Second step = 'Their preferred method' shows METHODS[0] in the 'If they set no preference' picker while `journeyOf` (model.ts:80) omits the `else …` sub-line entirely, because it tests `rule.preferredFallback ?` on the unset model value.

*Repro.* Open any policy in the board, select any rule, and in 'What happens' set 'First step' to 'Specific'. The 'Which method' picker under it shows 'miniOrange Push'; the journey list immediately above shows step 1 as 'A chosen method', and so does the rule's card on the stage. Nothing you do to the picker other than actively re-selecting a method reconciles the two.

*Suggested fix.* Patch the default at the point of the transition: in the First step Seg's onChange (line 104), when `firstFactor === 'Specific'` write `{ firstFactor, firstFactorMethod: rule.firstFactorMethod ?? METHODS[0] }`; likewise write `preferredFallback` when the second-factor picker switches to 'preferred'.


### `src/brand/screens/board/WhenEditor.tsx`

**The condition catalogue drops focus onto <body> when it closes** — line 448 · _high_

The catalogue is portalled to `document.body` and unmounted outright (`if (!open) return null`, line 473). Nothing captures the element that opened it and nothing restores focus on close — not on Escape (line 448-450), not on outside-click (line 451-453), not after picking an attribute (`add()` at line 83-91 calls `setAdding(null)`). Verified live: open the catalogue from "When it applies" `+`, press Escape, and `document.activeElement` is `BODY`. The next Tab restarts from the top of the document — past the whole left nav, the policy bar and the entire chain — to get back to where you were. This is a deviation from the codebase's own pattern: `picker.tsx:164-167` explicitly does `anchor.current?.focus()` on Escape.

*Repro.* Open the board, select a rule, Tab to the `+` on the "When it applies" section header and press Enter. The catalogue opens. Press Escape. Press Tab — focus is on the first control of the page, not back on the `+` you came from.

*Suggested fix.* Store the opening element (the `Section` action button already hands its `currentTarget` to `onAction`) and call `.focus()` on it in the close path, the same way `Picker` does.

**The catalogue declares tablist/listbox/option roles it does not implement — the arrow-key cursor is announced to nobody** — line 510 · _high_

Three separate ARIA claims are made and none is honoured. (1) `.bb__catgroups` is `role="tablist"` but its children are plain `<button>`s with no `role="tab"`, no `aria-selected` and no arrow-key handling — verified live: all three sampled children were `BUTTON`, `role: null`, `aria-selected: null`, `tabIndex: 0`. A screen reader announces a tab list containing no tabs. (2) `.bb__catlist` is `role="listbox"` but its 26 options are `<button role="option">` elements that are each a tab stop (`tabIndex: 0`) — a listbox is a single composite widget, not 26. (3) The search input at line 490 owns the ArrowUp/ArrowDown/Enter cursor (`setCursor`), but it has no `role="combobox"`, no `aria-controls`, no `aria-expanded` and no `aria-activedescendant`, and the options have no `id` at all (verified live: `(no id)`), so there is nothing to point at. Pressing ArrowDown moves a purely visual highlight; a screen-reader user hears nothing change and then Enter picks an attribute they were never told about. `picker.tsx` in the same codebase does this correctly (`aria-activedescendant` at line 222, ids on options at line 293).

*Repro.* Open the board, select a rule, press `+` on "When it applies", type "country" in the search box, then press ArrowDown twice and Enter with a screen reader running. Nothing is announced between the keystrokes; a condition you were never told the name of is added to the rule.

*Suggested fix.* Give the options ids and set `aria-activedescendant` on the input (mirroring `Picker`), give the options `tabIndex={-1}`, and either give the group chips `role="tab"` + `aria-selected` + arrow-key roving focus or drop the `role="tablist"` and let them be a plain filter group.

**Value-removal chips are named after the value, so the button announces "Engineering" and silently deletes it** — line 348 · _medium_

In `ValueControl`, picked groups/users (line 347-352) and picked options (line 373-378) are rendered as `<IfChip onClick={...} title="Remove">{name}<X aria-hidden/></IfChip>`. `IfChip` renders a `<button>` whose accessible name comes from its contents (IfBlock.tsx:259-265), and the `X` icon is `aria-hidden`; `title` is ignored for the accessible name whenever content is present. So the destructive control is announced as just "Engineering, button" — identical to how a read-only value chip would read — and pressing Enter on it removes a condition value with no indication that is what the button does and no undo affordance in reach.

*Repro.* Open the board, select a rule with a group or user condition (or add one), then Tab along the condition row. You land on a button announced as the group's name. Press Enter — the value is removed from the rule.

*Suggested fix.* Give the chip an explicit `aria-label={`Remove ${name}`}` (the same way the row's own remove button at line 285 does with `aria-label={`Remove ${t.label}`}`).


### `src/brand/screens/board/board.css`

**`.bb__idx svg { display: none }` permanently hides the glyph in every non-card index badge** — line 176 · _high_

`.bb__idx svg { display: none; }` (board.css:176) is unconditional; the only rules that re-show the svg are `.bb__card:hover .bb__idx svg` and `.bb__idx:focus-visible svg` (line 178). Two `.bb__idx` badges live outside a `.bb__card` and are non-focusable spans, so their icon is never displayed.

1. The pinned default card (RuleCard.tsx:241-245) renders `<span class="bb__idx is-home"><span><Home/></span></span>`. Off-hover, line 176 hides the Home glyph. On hover, line 183 `.bb__card:hover .bb__idx.is-home svg { display: none; }` deliberately hides it again. There is no state in which the ⌂ mark renders — the docs' `⌂ Nothing else → 1 factor` badge is an empty 30x30 tinted square, forever.
2. The library's "Blank rule" entry (Library.tsx:65-67) renders `<span class="bb__idx"><Plus/></span>` inside a `<button class="bb__libitem is-blank">`. There is no `.bb__card` ancestor and the span never takes focus, so the `+` is always `display:none`. Combined with the undefined `--tone-bg` there (see the badge-tint finding), that first grid column renders as 30px of nothing.

*Repro.* Open any policy → ⋯ → "Open in board". (1) Look at the pinned "Nothing else matched" card at the bottom of the chain: its index badge is an empty tinted square. Hover it — still empty. (2) Click empty stage so nothing is selected; the inspector shows the Library. The "Blank rule" row's leading 30px slot is blank where a `+` should be; every other library row shows its letter because that content is a text node, not an svg.

*Suggested fix.* Scope the hide to the numbered case only — e.g. `.bb__idx > svg` used as the grip, keyed off the card, rather than a blanket `.bb__idx svg { display:none }`. Concretely: replace line 176 with `.bb__card .bb__idx > svg { display: none; }`, and drop line 183 so `.is-home` keeps its Home mark. Library.tsx:65's `+` then renders because it is not under `.bb__card`.

**The catalogue's search input suppresses its focus ring and puts nothing in its place** — line 591 · _high_

`.bb__catbar input:focus-visible { outline: none; }` — and there is no compensating rule anywhere: the input has `border: none`, `background: none` (line 590) and no `:focus-within` styling on `.bb__catbar` or `.bb__cat`. Verified live with the catalogue open and the input focused: computed `outline-style: none`, `box-shadow: none`, `border-style: none`, `background-color: rgba(0,0,0,0)`. The field that is the entry point to the whole attribute catalogue has literally zero visible focus indicator. This is the one place in board.css where `outline: none` is not paired with a `box-shadow` ring, and it breaks the project's "focus is NEVER suppressed" rule outright.

*Repro.* Open the board, select a rule, press the `+` on "When it applies". Tab forward into the group chips, then Shift+Tab back to the search field. Nothing on screen indicates where focus is.

*Suggested fix.* Either drop the `outline: none` or move the ring to the container: `.bb__catbar:focus-within { box-shadow: inset 0 0 0 2px var(--focus-ring); }`.

**Below 900px, hiding the inspector leaves a 46vh empty band instead of giving the stage the space** — line 24 · _medium_

`.bb.is-insp-closed { grid-template-columns: minmax(0, 1fr) 0; }` (line 24) has specificity (0,2,0). The narrow-viewport rule at line 835, `@media (max-width: 900px) { .bb { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 46vh; } }`, targets `.bb` at (0,1,0) — media queries do not add specificity, so the closed-state columns win while the two-row template still applies. The grid ends up 2 columns (`1fr` and `0`) × 2 rows (`1fr` and `46vh`): auto-placement puts the stage at row 1 / column 1 and the inspector at row 1 / column 2 with zero width, and the 46vh second row has nothing in it. The inspector does collapse, but the space it freed is not returned to the stage — the bottom 46% of the viewport becomes blank `--surface-raised`.

*Repro.* Resize the browser window narrower than 900px, open any policy in the board (⋯ → Open in board), then press the panel-collapse button at the right end of the top-right toolbar ('Hide the inspector', BoardBuilder.tsx:233). The inspector disappears but the chain stays confined to the top ~54% of the window and an empty band fills the rest. Press it again and the inspector returns into that band.

*Suggested fix.* Give the closed state a matching row override inside the same breakpoint, e.g. add `.bb.is-insp-closed { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }` inside the `@media (max-width: 900px)` block at line 834.

**The connector `+` buttons share one style for hover and focus, and the ring is brand rather than ink** — line 118 · _medium_

`.bb__link__add:hover, .bb__link__add:focus-visible` is a single rule producing an identical result for both states: scale, brand colour, and `box-shadow: 0 0 0 4px rgba(235, 84, 36, 0.14)` — a 14%-opacity brand halo — plus `outline: none`. Two things break: keyboard focus is visually indistinguishable from mouse hover, so with the pointer resting anywhere near the chain a keyboard user cannot tell which `+` is focused; and the ring is brand, not ink, while `--focus-ring` is `#1a222b` (tokens.css:146) and every other focusable thing in board.css uses `box-shadow: 0 0 0 2px var(--focus-ring)`. A 14%-alpha brand tint is also far weaker than the 2px ink ring used everywhere else.

*Repro.* Open the board, rest the mouse over one connector `+` while tabbing focus onto a different connector `+`. Both render identically — the same scale, the same brand halo. Nothing on screen says which one Enter will press.

*Suggested fix.* Split the selectors: keep the scale/brand treatment for `:hover`, and give `:focus-visible` the standard `box-shadow: 0 0 0 2px var(--focus-ring)` used by `.bb__act`, `.bb__chip`, `.bb__dot` and the rest of the file.


### `src/brand/screens/policy-bar.tsx`

**The Trail/Board switch silently throws away the unsaved draft** — line 168 · _high_

The new `.bpbar__view` switch calls `store.go({ name: 'builder' | 'board', policyId })`, which unmounts the current builder. Both builders hold their draft entirely in local component state — `BoardBuilder.tsx:36` and `PolicyBuilderMain.tsx:136` each do `useState<History>(() => historyOf(saved))` — and nothing is written back to the store until Review & publish calls `store.savePolicy`. There is no beforeunload guard, no confirm, and no unsaved-changes prompt anywhere in src/brand. So a single click on the other layout's segment discards every unedited change plus the whole undo stack, with no warning and no way back. This directly contradicts docs/builder-board.md, which says of the two builders 'Both edit the same draft and publish through the same gate' — they do not share a draft, and the switch is placed on the one bar both screens show, right beside 'Edit details', which reads as a view toggle rather than a navigation that destroys work.

*Repro.* 1. Policies → ⋯ → 'Open in board' on any policy. 2. Select rule 1 and change its decision to Deny; the 'Discard' button and the enabled 'Review & publish' confirm the draft is dirty. 3. In the policy bar at the top, click 'Trail'. 4. The trail builder opens showing the published rules — the Deny is gone, undo is empty, and no dialog appeared. The same happens in reverse (edit in the trail, click 'Board').

*Suggested fix.* Either lift the draft/History into the store keyed by policyId so both builders genuinely share it (which is what the doc promises), or make the switch confirm when the current builder is dirty. A minimal version: have the switch dispatch through a callback the builder registers, which shows the existing ReviewDialog/confirm before `store.go`.

**The Trail/Board toggle silently throws away an unsaved draft** — line 173 · _high_

Each builder owns its draft in local component state — `useState<History>(() => historyOf(saved))` at BoardBuilder.tsx:36 and PolicyBuilderMain.tsx:136. Nothing about the draft lives in the store. The toggle calls `store.go({name:'builder'|'board', policyId})`, which swaps which component BrandApp renders, unmounting one host and mounting the other. The mounting host seeds itself from `saved`, so every uncommitted edit — and the entire undo stack behind it — is gone. Neither builder guards the transition: there is no beforeunload, no confirm, no toast, and the unsaved-changes bar that is visible at the moment of the click gives no hint that the button beside it is destructive. docs/builder-board.md states the opposite in the paragraph that introduces this very control: 'Both edit the same draft and publish through the same gate.' They publish through the same gate; they do not share the draft.

*Repro.* 1. Policies → click a policy name to open the trail. 2. Change a rule's decision (e.g. Let in → Deny). The unsaved-changes bar appears with Discard / Review & publish. 3. Without publishing, click 'Board' in the policy bar's Trail|Board switch. 4. The board opens showing the published rules — the edit is gone, the pips read 'Nothing unsaved to compare', and ⌘Z does nothing because the new host started with a fresh history. The same happens in reverse (edit on the board, click Trail).

*Suggested fix.* Either hoist the draft history into the store keyed by policy id so both hosts genuinely share it (what the doc promises), or make the toggle confirm when `dirty` is true and offer to publish or discard first.


### `src/brand/screens/board/CheckTab.tsx`

**Two brand buttons are on screen at once whenever the Check tab is open** — line 132 · _medium_

The project's rule is one brand button per view. The stage toolbar always renders `<Button variant="brand">Review & publish</Button>` (BoardBuilder.tsx:229), and the Check tab renders `<Button variant="brand" icon={Play}>Rehearse it</Button>` right beside it in the inspector. Verified live on the Check tab: `document.querySelectorAll('.bb .bx-btn--brand')` returns both "Review & publish" and "Rehearse it" simultaneously visible. Expanding a break-in round that has a proposed fix adds a third (`variant="brand"`, "Add this rule" / "Change that rule", line 393). The single most consequential action on the board — publishing — is given exactly the same visual weight as running a rehearsal and as accepting a suggested rule change.

*Repro.* Open the board, click the "Try a sign-in" pip. The stage toolbar's brand-filled "Review & publish" and the inspector's brand-filled "Rehearse it" are both on screen. Expand a break-in round with a proposed fix for a third.

*Suggested fix.* Demote "Rehearse it" and the fix-apply buttons to `variant="neutral"`, leaving "Review & publish" as the view's single brand action.

**The trace reason is lowercased wholesale, so an alternative is reported as 'card a' while the editor calls it 'way A'** — line 163 · _medium_

`{r.steps[r.hitIndex!].reason.toLowerCase()}` (and the same call at ImpactTab.tsx:247) lowercases a string that is not free prose. For a rule with more than one alternative `evalRule` builds it from `cardName(card, index)` (simulate.ts:269), which returns `card ${cardLetter(i)}` — a proper label — or the author's own `ConditionCard.label` when one is set. The letter is deliberately capital (predicate.ts:128: 'cards are lettered because they have no evaluation order'), and WhenEditor labels the very same alternative 'way A' (WhenEditor.tsx:150). The result panel names it 'card a'. Any card the author names is mangled the same way.

*Repro.* Policies → 'Finance Team – High Security' → ⋯ → Open in board → Check tab → set Who = Priya, From = Off-network, Device = Known < 90d, State = Normal returning user, Risk = Low, Time = 09:30 Working hours → Rehearse. The result reads 'Let in, then verify — Decided by rule 2, Off-network finance access — matched card a.' Open the same rule in the Rule tab: the alternative it matched is labelled 'way A'.

*Suggested fix.* Have `evalRule` return a reason that is already sentence-cased for embedding (or return the pieces), and stop calling `.toLowerCase()` on it in CheckTab.tsx:163 and ImpactTab.tsx:247. At minimum, agree on one noun — 'way' or 'card' — across simulate.ts and WhenEditor.

**The proposed-fix preview recomputes the break-in grade without the tenant's overrides** — line 331 · _medium_

`const g = runGauntlet(fixed, env)` omits the third argument. Every other call in the codebase passes the tenant's accepted-outcome overrides — CheckTab.tsx:75 itself does (`runGauntlet(draft, env, overrides)`), as do BoardBuilder.tsx:96, Policies.tsx:141, readiness.tsx:54, review-step.tsx:48 and gauntlet-dialog.tsx:654. `runGauntlet` defaults `overrides` to `{}` (gauntlet.ts:513) and applies them at line 526 as `overrides[c.id] ?? c.want`, so the preview scores every round against the deck's original expectation. The 'Break-in test → <grade>, <n> through' line the fix card promises therefore counts rounds the author has already accepted, and does not match the grade the header shows before or after applying — which defeats the point of the preview, which docs/builder-board.md describes as 'a preview of what applying it changes, before it is applied'.

*Repro.* 1. Open a policy in the board whose break-in test has two or more breaches (grade F). 2. Check tab → Break-in test → expand one breach round → 'Accept this outcome instead'. The header grade improves to D, '1 got through'. 3. Expand the remaining breach round. Its 'What applying this would change' block reads 'Break-in test → F, 2 through' — it has silently re-counted the round you just accepted as a breach. 4. Click 'Add this rule'. The header now shows a grade better than the preview promised.

*Suggested fix.* Pass the overrides already in scope: `runGauntlet(fixed, env, overrides)` — and add `overrides` to the `useMemo` dependency list on line 333.


## Low confidence (1)

- **Escape inside the condition catalogue also deselects the rule you were adding to** — `BoardBuilder.tsx:85`. The catalogue registers `document.addEventListener('keydown', …)` and calls `onClose()` on Escape (WhenEditor.tsx:449) without stopping propagation. BoardBuilder registers a `window` keydown listener that, on Escape, clears the trace or the selection. Its only guard is `typing` — true only while foc
