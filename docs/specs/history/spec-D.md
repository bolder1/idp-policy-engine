# Spec D: guard pages and the Break-in test

Build-ready. It is written against the Phase 0 evaluator, which sits uncommitted in the worktree.

**Repo root:** `C:\New folder\IDP Policy Engine\.claude\worktrees\kind-heyrovsky-5ec74e`. Every path below is relative to it.

**Where the numbers come from:** every number in §8 was computed on the showcase tenant with the Phase 0 code, using a probe. The probe lives outside the repo, at `C:\Users\surajit.dutta\AppData\Local\Temp\claude\C--New-folder-IDP-Policy-Engine--claude-worktrees-kind-heyrovsky-5ec74e\764e61be-5a0d-42c3-9122-8aaa35fa07d9\scratchpad\specd\probe.test.ts`. No repo file was changed.

---

## 0. Grounding

### Files I read to write this spec

- **Board:**
  - `src/brand/screens/board/BoardBuilder.tsx`: `saveNow` at :639, `publish` at :863, `env` at :346, `ReviewDialog` at :1253.
  - `BoardBar.tsx`: `StatusControl` at :207, the Check pip at :288–307, "Save policy" at :356–381.
  - `CheckTab.tsx`, `AppsPane.tsx`, `Board.tsx` (`useCanvasView`, and the `cards` map keyed by rule id), `RuleCard.tsx` (its root is a `motion.div`).
- **Status:** `src/brand/screens/use-status-change.tsx` (the confirm modal at :129–165), `status-control.tsx`, `status-options.ts`.
- **Review and save:** `src/brand/change-list.tsx`, `src/brand/review-rows.ts`, `src/brand/review-view.ts`, `src/brand/kit.tsx` (`Drawer`, `Modal`, `ReviewChanges`, `SaveBar`, `Button`, `Badge`, `TipDot`, `Field`, `Callout`).
- **Draft and state:** `src/brand/policy-draft.ts`, `src/brand/store.tsx`, `src/brand/edition.ts`, `src/brand/showcase.ts`, `src/brand/showcase-seed.ts`.
- **Library pages:** `src/brand/screens/ZonesFinal.tsx`, `DeviceFingerprintV2.tsx`, `RiskSignals.tsx` (their SaveBar calls), `usage.ts`, `policy-details-review.ts`, `changes.ts`.
- **Legacy test UI:** `gauntlet-dialog.tsx`.

### Phase 0 API this spec uses (names checked in the code)

- **`tenant-resolver.ts`:**
  - `resolveSignIn(policies, facts, env, opts)` returns a `TenantResolution` with `status: 'decided'|'depends'|'incomplete'`, `missing`, `decidedBy: PolicyRef`, `trace`, `decision`, `possible`, `standings: PolicyStanding[]` and `watching: []`.
  - `governingPolicy(...)` returns `{ decider, standings, missing }`.
  - `audienceNames` and `envOf`.
- **`simulate.ts`:**
  - `tracePolicy` returns a `PolicyTrace` with `hitIndex`, `decision`, `settled`, `possible: PossibleOutcome[]` and `unknowns: ConditionResult[]`.
  - `ConditionResult` has `missing: FactKey[]`.
  - Also used: `traceRule`, `personOf`, `decide`, `SimEnv.library`, `SignInFacts`, `FactKey`.
- **`gauntlet.ts`:**
  - `runBreakIn(policy, env, { overrides, deck, match })` returns a `BreakInResult` with `rounds: AttemptRound[]`, `counts: BreakInCounts` and `skipped`.
  - `BreakInCounts` holds `held`, `gotThrough`, `weakerFactor`, `lessThanAsked`, `lockedOut`, `extraPrompts`, `undecided` and `skipped`.
  - `AttemptRound` holds `challenge`, `want`, `trace`, `decision`, `factor`, `outcome` and `outcomes`.
  - Also used: `TypedChallenge.minFactor/fix/why`, `TYPED_DECK` (15 cards), `proposeFix`, `applyFix`, `ruleFromFix`, `ProposedFix`, and the private `namesMissing`.
- **`factor-strength.ts`:** `FACTOR_RANK`, `methodStrength`, `ruleFactor`, `FactorStrength`.
- **`impact-arena.ts`:** `SITUATIONS` (1,440 = 4 people × 5 origins × 6 devices × 4 auth states × 3 risk levels; the auth-state axis changes no result) and `decide`. `sweep`/`compare` are used only by the legacy pip.
- **`sign-in-facts.ts`:** `chipFacts`, `CHIP_DEVICES`.

### Contracts this spec needs from sibling specs

- **Try a sign-in:**
  - The sign-in panel in the board's inspector slot, 480 px wide, with a page stack and a Back crumb. The `.bb` grid cap `min(var(--bb-insp), 46%)` in `board.css:104` must allow 480 at 920 px of content.
  - `src/brand/decision-words.ts`: whichever spec lands first creates it (§5.1).
- **Saved sign-ins / testing page:**
  - `store.savedSignIns: SavedSignIn[]` in the shape given in §5.1.
  - The Saved sign-ins section component, which hosts the Break-in button.
  - The three page variants: A = rail page, B = a slider over the Policies list, C = board only.
- **What changes:** it may replace `whatChangesLine` (§5.4). The guard reads only the `WhatChangesLine` shape.
- **Monitor:** a `'monitor'` status. The guard runs on any change of status into `enforces()`.

---

## 1. Purpose and scope

**Purpose.** Every path that makes a policy decide real sign-ins runs the same checks.

- The checks stop a change only when a Must pass or Protected saved sign-in newly fails, and a ready fix is always shown with the block.
- Saving an Active policy stays one click when nothing is found.
- The Break-in test reports counts only: no letter grade, no Exposure column.

**In scope:**
1. **Before saving: your edits.** Opens on "Save policy", ⌘↵, the palette, "Save rule" and the walkthrough's review, for an enforcing policy (`active` or `always-on`), and only when something interrupts. A variant, **Before saving: applications**, covers "Save applications" in `AppsPane`.
2. **Before turning on.** Opens on Turn on from the status pill or the row menu, and replaces the confirm modal at `use-status-change.tsx:129–165`. It offers a choice of version: "With your edits" or "Stored version".
3. **Also changes rows** in the existing Review changes dialog, for saving a zone, a device profile, or the risk profile in use. A regression blocks the save, with a ready fix.
4. **The Break-in test UI** on `TYPED_DECK`: counts, rows, fixes with a preview, and "Accept this result" with who, when and why.
5. **Retire the grade in Full:**
   - Remove the letter from the board's Check pip.
   - Replace the Break-in section in `CheckTab.tsx`.
   - Remove the Exposure column (`features.exposure` becomes false in FULL).

**Out of scope:**
- The Try a sign-in panel.
- Saved sign-in create and edit.
- The testing-page layouts.
- The What changes page.
- Compare.
- The Monitor status itself.
- Describe it.
- Turn off (see Q8).
- The trail builder's `GauntletDialog`, which the showcase does not show.

---

## 2. Entry points and navigation

| # | Trigger (file) | Condition | Result |
|---|---|---|---|
| E1 | "Save policy" in `BoardBarActions` (`BoardBar.tsx:357`) → `saveNow` | `features.beforeTurningOn && enforces(saved) && toPublish` | Run the checks, then save at once or open **Before saving: your edits** |
| E2 | ⌘↵ / Ctrl+↵ (`BoardBuilder` key handler :491) → `saveNow` | same | same |
| E3 | Palette `publish` (`BoardBuilder.tsx:1150`) → `saveNow` | same | same |
| E4 | Inspector foot "Save rule" (`BoardBuilder.tsx:1106` `onSave={saveNow}`) | same | same |
| E5 | `ReviewDialog onCommit` (`BoardBuilder.tsx:1253`, opened by the walkthrough) | same | Becomes `guardedPublish(intent)`, so it runs the same checks |
| E6 | "Save applications" (`AppsPane.tsx:64`) | `features.beforeTurningOn && enforces(saved) && dirty` | Run the checks, then save or open **Before saving: applications** |
| E7 | Status pill → Turn on (`StatusControl` in `BoardBar.tsx:207`) | Target `'active'`, and `turnOnBlocker` returns null | **Before turning on** always opens. It carries the board's unsaved edits as a version. |
| E8 | Policies row menu → Turn on (`Policies.tsx:278` → `statusChange.request`) | same | **Before turning on** always opens. The saved draft (`pendingDraft`) is the "edits" version. |
| E9 | Zone page SaveBar → Review & save (`ZonesFinal.tsx:815`) | The zone is not new | Review changes gains **Also changes** rows and can be blocked |
| E10 | Device profile SaveBar (`DeviceFingerprintV2.tsx:1159`) | The profile is not new | same |
| E11 | Risk profile SaveBar (`RiskSignals.tsx:879`) | `profile.id === store.activeRiskProfileId` | same |
| E12 | Saved sign-ins header → "Break-in test" (board sign-in panel; testing page variants A and B) | `features.breakInTest` | **Break-in test** page |
| E13 | Break-in row inside a guard page → "Open" | Board host | Closes the drawer and opens the sign-in panel on the Break-in page |
| E14 | `store.go({ name: 'board', policyId, open: 'break-in', rule? })` | From drawer hosts ("Open in board", rule links) | The board opens with the panel on the Break-in page, or with rule `rule` selected |

A policy that is `draft` or `inactive` saves exactly as it does today, with no checks. So does any policy when `features.beforeTurningOn` is off.

**Save flow:**

```
saveNow():
  if (!toPublish || saveBlocked) return
  if (!features.beforeTurningOn || !enforces(saved)) return publish('keep-off')   // today's path
  setChecking(true)                                  // button reads "Checking…"
  requestAnimationFrame(() => {                     // let the label paint first
    const r = tryRunGuard(saveInput())               // §5.3; a thrown error gives 'error'
    setChecking(false)
    if (r !== 'error' && !r.interrupt) return publish('keep-off')   // clean: one click
    openGuard({ kind: 'save', result: r })
  })
```

**Navigation inside a guard page:**
- A rule link reveals the rule on the board: it pans the chain and flashes the card (§6). Focus stays in the drawer.
- "Open" on the What changes row (only when that surface exists) or the Break-in row closes the drawer, which counts as Keep editing, and opens that surface.
- Escape, ×, "Keep editing" and "Cancel" close the drawer and change nothing. Focus returns to the control that opened it.

---

## 3. Layout, states and copy

### 3.1 Geometry

The shell is 1,120 px: a 200 px rail and a 920 px content column. There is no phone layout.

- **Guard pages:** kit `Drawer` at `width={680}` (the "wide" step), portalled with `createPortal(…, portalRoot())`, as `use-status-change.tsx` already does. At 1,120 px it spans x = 440 to 1,120, with a 24 px body padding, which leaves 632 px of content.
- **Break-in test:**
  - On the board, a page pushed inside the 480 px sign-in panel (448 px inner).
  - Testing page variant A: a kit `Drawer` at `width={560}` (512 px inner).
  - Variant B: a page pushed inside that slider.
  - The same `BreakInView` renders in every host.
- No new element uses CSS `transform`. The trap: any `motion.*` element has its stylesheet transform overwritten.

### 3.2 Before saving: your edits

```
0        200                  440                                                   1120
┌────────┬────────────────────┬──────────────────────────────────────────────────────┐
│ rail   │ board under scrim  │ Before saving: your edits                         [×] │ head 64
│        │ 240                │ HRMS access from corporate offices                    │ caption 13
│        │                    ├──────────────────────────────────────────────────────┤
│        │                    │ ┌ Saving is blocked ───────────────────────────────┐ │ banner, when blocked
│        │                    │ │ Kavya in the Pune office must pass and would get │ │ (negative tint)
│        │                    │ │ Deny.                                            │ │
│        │                    │ │ [Leave Kavya Menon out of rule 1]   Rule 1       │ │
│        │                    │ └──────────────────────────────────────────────────┘ │
│        │                    │ ⌄ What you changed  1 change                         │ ChangeSection ×6
│        │                    │   [+ Added]  Rule 1 · Deny Human Resources           │ list layout
│        │                    │              For Human Resources, any login → Deny   │
│        │                    │ › Who it starts deciding for  No change              │
│        │                    │ ⌄ Saved sign-ins  1 failing · blocks saving          │
│        │                    │   [Fails]  Kavya in the Pune office · Must pass      │
│        │                    │            Deny · expected Allow with 2FA · Rule 1   │
│        │                    │   [Passes] Aisha on HRMS   Allow on 1 factor ·       │
│        │                    │            Global Default Policy                     │
│        │                    │ › Your own and protected sign-ins  All pass          │
│        │                    │ › What changes  Now allowed 0 · Now asked for 2FA 0 · │
│        │                    │   Now denied 0                               (i) Open │
│        │                    │ › Break-in test  Got through 0 · Weaker factor 0 ·    │
│        │                    │   Locked out 1 · Extra prompts 0             (i) Open │
│        │                    ├──────────────────────────────────────────────────────┤
│        │                    │                          [Keep editing] [Save policy] │ foot 64
└────────┴────────────────────┴──────────────────────────────────────────────────────┘
```

**Body.**
- The body is one `ChangeList layout="list"` containing six `ChangeSection`s, all with `collapsible`. The heading is the toggle, the summary sits inline after the title, and TipDot and "Open" go in the `action` slot.
- `defaultOpen` is true for:
  - a row with a failing or can't-tell item;
  - What changes, when Now allowed > 0;
  - What you changed, always.
- Every other row starts closed.

**The six rows:**

| Row | Summary (inline) | Blocks (chip → items) |
|---|---|---|
| What you changed | `1 change` / `N changes` | **Added**, **Changed** and **Removed** chips (the existing Review words), fed from `ruleChanges` (§5.5). |
| Who it starts deciding for | `No change` or app names (`HRMS`) | **Starts deciding**: name = app, value `Human Resources, Finance · was Global Default Policy`.<br>**Stops deciding**: `… · now Global Default Policy`.<br>**Does not decide**: `Finance · {PolicyStanding.reason}`.<br>Empty text: `No change`. |
| Saved sign-ins | `All pass` / `1 failing` / `2 failing · 1 can't tell` / `None for this policy`; the row that blocks adds ` · blocks saving` | **Fails** (negative) → **Can't tell** (neutral) → **Passes** (positive). Name = `{sign-in name}` plus ` · Must pass` when it applies (a note gets no suffix). Value formats are below. |
| Your own and protected sign-ins | same words | Same blocks. Items are Protected sign-ins, plus any sign-in whose `facts.personId === store.account.id`. |
| What changes | `Now allowed {a} · Now asked for 2FA {c} · Now denied {d}` (with ` · Now on 1 factor {b}` after Now allowed if Q3 says yes) | One block per category, in this order: **Now allowed** (always present; the item is `None` when empty), then **Now on 1 factor**, **Now asked for 2FA**, **Now denied**. Item: name `Priya Sharma (Finance)`, value = origins in `PLACES` order, e.g. `Any location, Outside all zones, Tor exit node, Known proxy`. |
| Break-in test | `Got through {a} · Weaker factor {b} · Locked out {c} · Extra prompts {d}`. A count that moved gets ` (was {n})` after it. | One **Changed** block: name = card name, value `Got through, was Held`. Empty text: `No change`. |

**Saved sign-in values.** The rule ref is a link button on the board host. Elsewhere it is plain text, and it names the deciding policy when that is another one.

| Case | Value |
|---|---|
| Fails, regression | `Deny · expected Allow with 2FA · Rule 1` |
| Fails, already failing | `… · failing on live too` (`… · failing today too` on Turn on). Grey suffix. Never blocks. |
| Passes, changed | `Allow with 2FA · was Allow on 1 factor · Rule 1` |
| Passes, unchanged | `Allow with 2FA · Rule 1` |
| Can't tell | grey `Can't tell · Allow with 2FA or Deny · needs Address` |

**Blocked banner.**
- `.bgd__block`, with `--fb-negative-bg/-border/-fg`, radius 6, padding 12 16, sitting above the list.
- Heading (14/600): `Saving is blocked`.
- Line: `{name} must pass and would get {Decision}.` or `{name} is protected and would get {Decision}.`
- Actions: the ready-fix `Button variant="neutral" size="sm"`, then a link to the rule. With Q2 = yes, a Must pass block also shows a ghost `Expect {Decision} instead`.
- One blocker at a time. After a fix the checks re-run, and the next blocker, if any, takes its place.

**Footer.**
- `Button variant="ghost"` "Keep editing", then `Button variant="brand"` "Save policy".
- When blocked, Save is disabled with the tooltip `Saving is blocked`.
- The brand button is the only orange on the page.

**States:**

| State | Presentation |
|---|---|
| Loading | The drawer never opens empty on Save. The bar's Save button reads `Checking…`, disabled and with `aria-busy`, until the result arrives. |
| Result, clean | No drawer. Toast from `commitToast`, e.g. `HRMS access from corporate offices saved`. |
| Result, interrupt | The drawer, with `Save policy` enabled. |
| Result, blocked | The banner, with `Save policy` disabled. |
| Unknown facts | Items go under **Can't tell**, in grey, never counted as passing. They open the drawer but do not block (Q1). |
| Error | One `Callout tone="notice"` reading `Checks could not run.` Save stays enabled, and the error is logged to the console. |
| A fix leaves nothing to save | The drawer closes, with the toast `Nothing left to save`. |
| Empty saved sign-ins | Row summary `None saved`. The row cannot be expanded. |

### 3.3 Before saving: applications

This is the same component with `kind='apps'`.

- Title: `Before saving: applications`.
- What you changed takes its rows from `detailsChanges(saved, { name, appIds: picked }, appName).rows` (the Applications group, plus the Status/Rules effect rows).
- Primary button: `Save applications`.
- When the last app is removed, Who it starts deciding for shows **Stops deciding**.

### 3.4 Before turning on

```
0        200                  440                                                   1120
┌────────┬────────────────────┬──────────────────────────────────────────────────────┐
│ rail   │ Policies, scrim    │ Before turning on                                 [×] │
│        │                    │ HRMS access from corporate offices                    │
│        │                    ├──────────────────────────────────────────────────────┤
│        │                    │ Version   [ With your edits | Stored version ]        │ Seg, only when edits exist
│        │                    │ ⌄ What you changed  1 change                          │
│        │                    │ ⌄ Who it starts deciding for  HRMS                    │
│        │                    │   [Starts deciding] HRMS  Human Resources, Finance ·  │
│        │                    │                           was Global Default Policy   │
│        │                    │ › Saved sign-ins  All pass                            │
│        │                    │ › Your own and protected sign-ins  All pass           │
│        │                    │ › What changes  Now allowed 0 · Now asked for 2FA 18 · │
│        │                    │   Now denied 72                                  (i)  │
│        │                    │ › Break-in test  Got through 0 · Weaker factor 0 ·     │
│        │                    │   Locked out 1 · Extra prompts 0                 (i)  │
│        │                    ├──────────────────────────────────────────────────────┤
│        │                    │                                   [Cancel] [Turn on]  │
└────────┴────────────────────┴──────────────────────────────────────────────────────┘
```

**Version choice.**
- Uses `Seg` from `board/Section.tsx:71` (radiogroup, arrow keys), with the label `Version`.
- Options: `With your edits` and `Stored version`.
- Shown only when an edits version exists: the board's unsaved draft (E7), or `pendingDraft` (E7/E8).
- Default: `With your edits` (Q4).
- Hover titles on the options:
  - "With your edits": `Unsaved edits on this board`, `Saved draft · {savedAt} by {savedBy}`, or `Stored version and 1 fix`.
  - "Stored version": `Saved {lastModified in lower case} by {modifiedBy}`.
- Switching re-runs the checks (§5.3). Only the rows whose summary changed cross-fade.

**What you changed** for Stored version: summary `Stored version`, empty text `Saved 2 hours ago by Jaspreet Toor`.

**Break-in row:** shows the counts of the chosen version, with no "was".

**Blocked:** the banner heading reads `Turning on is blocked`. A ready fix switches the version to "With your edits":
- On the board it commits to the board's draft, undoably.
- From the list it holds the edits in drawer state until Turn on.

**Footer:**
- `Cancel` (ghost), then `Turn on` (brand).
- When the Monitor status exists, `Report only` (neutral) sits left of Turn on (Q7).
- Turn on is disabled with its title when:
  - the checks block;
  - `turnOnBlocker(chosen, errors)` returns a reason. Errors are counted on the chosen version, so the reason reads, for example, `Fix the error in its rules first.`

**Commit:**
- **Stored:** `store.setPolicyStatus(id, 'active')`, toast `{name} is on`, which is today's copy.
- **With your edits:** `store.savePolicy({ ...published({ ...stored, rules, fallback }), status: 'active' })`, toast from `commitToast(stored, next)`, which gives `{name} saved and turned on`.
- **Blocked by `turnOnBlocker` before any checks** (draft, no apps): the existing "Can't turn on {name}" modal is unchanged.

### 3.5 Also changes in Review changes (zones, device profiles, risk profile)

There is no new surface. `ReviewChanges` (`kit.tsx:1780`) already files `effect: true` rows under the title `Also changes` with the chip `Happens for you`. The library guard (§5.6) appends these rows:

| label | after (list layout shows `after`) |
|---|---|
| `Active policies` | `HRMS access from corporate offices, Developer tools — office and device checks` |
| `What changes` | `Now allowed 0 · Now asked for 2FA 0 · Now denied 12` |
| `{sign-in name} · Must pass` (one row per changed saved sign-in, failing first) | `Deny · expected Allow with 2FA` (fails), `Allow with 2FA · was Deny` (passes), or `Can't tell · … · needs Address` |

**Blocked.**
- `ReviewChanges` gets `blocked` and a `blockedReason` equal to the banner line, e.g. `Kavya in the Pune office must pass and would get Deny.`
- It also gets a new `blockedAction` button beside the reason, labelled with the fix: `Keep 203.0.113.0/24`, `Remove {entry}`, `Restore the saved zone` or `Restore the saved profile`.
- The page's own validity block (`SaveBar blocked`) is unchanged, and the footer button stays enabled so the review can open.

### 3.6 The Break-in test

**Page at 448 px inner width (board panel):**

```
┌ ‹ Saved sign-ins ───────────────────────────────────── × ┐ panel bar 44
│ Break-in test                                        (i)  │ 16/600
│ HRMS access from corporate offices · Live                 │ 13 secondary
│ ┌────────────┬────────────┬────────────┬────────────┐     │ counts: 4 × 106, h 56
│ │ 0          │ 0          │ 1          │ 0          │     │ 20/600 tabular
│ │ Got through│Weaker factor│ Locked out │Extra prompts│    │ 12
│ └────────────┴────────────┴────────────┴────────────┘     │
│ Sign-in               Expected         Got         Rule   │ 12/500, h 32, sticky
│ Locked out                                                │ h3 12/600, h 28
│ ✕ Finance working     Allow with 2FA   Deny        Last row│ row ≥ 40
│   from home                                               │
│ Held                                                      │
│ ✓ Finance account     Deny             Deny        Last row│
│   behind a known proxy                                    │
│ ✓ High risk signal…   Allow with 2FA   Allow with 2FA Rule 1│
│ …                                                         │
│ Not in audience: Human Resources, Finance · 10 skipped    │ 12 muted
└───────────────────────────────────────────────────────────┘
```

**Row grid:**
- `16px minmax(0,1fr) 104px 104px 52px` with an 8 px gap, which leaves 140 px for the name at 448.
- Under `@container (max-width: 439px)` it becomes `16px 1fr 92px 92px 48px`.
- Name is 13/500. Expected and Got are 12/400, holding the exact decision words. Rule is 12 in link colour.

**Marks** (icons, not dots; all ink colours are tokens):

| Group | Mark | Colour |
|---|---|---|
| Got through, Weaker factor, Less than asked | ✕ | `--fb-negative-fg` |
| Locked out, Extra prompts | ✕ | `--fb-notice-fg` |
| Can't tell | – | `--text-tertiary` |
| Held | ✓ | `--fb-positive-fg` |

**Groups** go in this order, each under its h3, with no counts: Got through, Weaker factor, Less than asked, Locked out, Extra prompts, Can't tell, Held.

- An empty group is not drawn.
- An accepted row sits in Held with `Badge tone="neutral"` reading `Accepted`.

**Count cells.**
- The four cells are `aria-pressed` toggle buttons that filter the list to one group; pressing again clears the filter.
- Pressed style: `--blue-soft` background, `--blue` border and text.
- Each count appears once in this view.
- `lessThanAsked` and `undecided` have no cell (Q5).

**Expanded row.** Rows are an accordion, one open at a time, indented 24 px under the name:

```
│ ✕ Sign-in relayed through a phishing proxy  Allow with 2FA  Allow with 2FA  Rule 2 │
│   Arun Patel · 192.0.2.82 · Frankfurt, looked up · windows 10.0.22631, not registered │
│   · 10:40 IST, Mon 28 Sep · Risk 12                                                  │
│   Second factor   miniOrange Push · standard · needs phishing-resistant             │
│   Fix             Rule 2 · Compliant device, working remotely → FIDO2 / Passkey     │
│   After this fix  Got through 0 · Weaker factor 0 · Locked out 1 · Extra prompts 0  │ changed cell outlined
│                   Now allowed 0 · Now asked for 2FA 0 · Now denied 0                │
│   [Change second factor]  [Accept this result]                                      │
```

**Lines in the expanded row, in order** (each shown only when it applies):

1. **Facts line.** Not labelled. Assembled from `SignInFacts`, each fact with its source word (`typed`, `looked up`, `stated`, `assumed`).
2. **`Decided by`**: `Rule 1 · In a corporate office`, or `Last row · Nothing else matched`, then the `RuleTrace.reason` sentence in grey. Always shown.
3. **`Second factor`** (weaker factor only): `{methods} · {tier} · needs {tier}`.
4. **`Possible`** and **`Needs`** (can't tell only): `Allow with 2FA by rule 1, or Deny by the last row` and `Address`.
5. **`Fix`**: what the rule becomes, when a fix exists (§5.7).
   - Insert: `{rule name} — {ruleIfLine} → {Decision} · at position {n}`.
   - Retune: `Rule {n} · {name} → {Decision}` or `Rule {n} moves above rule {m}`.
   - Factor: `Rule {n} · {name} → {methods}`.
6. **`After this fix`**: the counts line and the What changes line of the fixed policy. Changed cells get a `--blue` outline.
7. **Fix button**, `variant="neutral"`: `Add this rule`, `Change rule {n}`, `Move rule {n} up` or `Change second factor`. In drawer hosts it is `Open in board` instead.
8. **`Accept this result`** (ghost). Offered for every outcome except held and can't tell.
   - Pressing it reveals `Field label="Reason"`, a text input (max 200), with `Accept` (neutral) and `Cancel` (ghost).
   - An empty submit shows `Enter a reason` (`role="alert"`).
9. **Once accepted:** `Accepted by Jaspreet Toor · 26 Sep 2026, 14:05`, then `Reason: HRMS is office-only`, then `Restore expectation` (ghost).

**States:**

| State | Presentation |
|---|---|
| Loading | None. `runBreakIn` is synchronous (15 cards). |
| Empty | Every card skipped: `EmptyState compact icon={Users}` with title `No scripted sign-ins for this audience` and blurb `Not in audience: DevOps`. |
| Unknown facts | The **Can't tell** group, with Got = `Can't tell` in grey. Never counted and never accepted. |
| Error | `Callout tone="notice"`: `Break-in test could not run.` |
| After an edit, a fix or an accept | Rows whose group changed move and are outlined (§6). |

**Hosts:**
- **Board (all variants):** Try a sign-in panel → Saved sign-ins header → `Break-in test` (`Button variant="neutral" size="sm" icon={Shield}`) → a pushed page with the Back crumb `Saved sign-ins`. The policy tested is the board draft.
- **Variant A:** the Saved sign-ins library header → the same button → a Drawer at 560. At the top is `Picker label="Policy"`, defaulting to the first Active policy in list order.
- **Variant B:** a page pushed in the testing slider, with Back crumb `Policy testing` and the same Picker.

**Caption version word:**
- `Your edits` when the board draft differs from live.
- Otherwise by status: active → `Live`, inactive → `Stored version`, draft → `Draft`.

### 3.7 Copy (exact, sentence case)

**Titles:**
- `Before saving: your edits`, `Before saving: applications`, `Before turning on`, `Break-in test`.
- Captions are the policy name. The Break-in caption adds ` · {Your edits|Live|Stored version|Draft}`.

**Row titles:** `What you changed`, `Who it starts deciding for`, `Saved sign-ins`, `Your own and protected sign-ins`, `What changes`, `Break-in test`.

**Tooltips (one line each):**

| Target | Text |
|---|---|
| What changes TipDot | `Modelled sign-ins on {App} at 09:30, not real traffic.` |
| Break-in TipDot (both places; label `About the break-in test`) | `Scripted sign-ins against these rules; not breach likelihood.` |
| Got through | `Hostile sign-ins that got less than expected.` |
| Weaker factor | `Asked for 2FA with a factor this attack can beat.` |
| Locked out | `Ordinary sign-ins that were denied.` |
| Extra prompts | `Ordinary sign-ins asked for 2FA they did not need.` |

**Decisions:** exactly `Allow on 1 factor`, `Allow with 2FA` and `Deny`, from `DECISION_WORDS`.

**Factor tiers:** `phishing-resistant`, `standard`, `weak`, `below weak`.

**Ready fixes:**
- `Restore rule {n}`
- `Move rule {n} back to position {m}`
- `Restore the last row`
- `Leave {Person} out of rule {n}`
- `Add a rule for {Person}`, which inserts a rule named `Keep access for {Person}`

**Toasts:**
- After a fix: `{fix label}. Not saved yet.` with `Undo` (the board's `offerUndo`).
- `Rule added. Not saved yet.`
- `Rule {n} changed. Not saved yet.`
- `Rule {n} moved. Not saved yet.`
- `Second factor changed on rule {n}. Not saved yet.`
- `Nothing left to save`

**Footers:** `Keep editing`, `Save policy`, `Save applications`, `Cancel`, `Turn on`, `Report only`.

**Other strings:** `Checking…`, `Checks could not run.`, `Break-in test could not run.`, `Saving is blocked`, `Turning on is blocked`.

**No banned words:** nothing new says `gauntlet`, `blast radius`, `rehearse` or `try a login`.

---

## 4. Components

### 4.1 Reused, as they are

- `Drawer`, `Button`, `Badge`, `TipDot`, `Field`, `Callout` from `src/brand/kit.tsx`.
- `ChangeList`, `ChangeSection`, `ChangeBlock`, `ChangeItem` from `src/brand/change-list.tsx`.
- `groupSections` from `src/brand/review-rows.ts`.
- `Seg` from `src/brand/screens/board/Section.tsx`.
- `Picker` from `src/brand/picker.tsx`.
- `EmptyState` from `src/brand/empty.tsx`.
- `ruleIfLine` from `src/brand/screens/predicate-prose.ts`.
- `useNameLookup` from `src/brand/store.tsx`.
- `portalRoot` from `src/brand/screens/status-options.ts`.
- `committed`, `published`, `turnOnBlocker`, `commitToast`, `differsFromLive` from `src/brand/policy-draft.ts`.
- `detailsChanges` from `src/brand/screens/policy-details-review.ts`.
- `policiesUsing`, `policiesUsingType` from `src/brand/screens/usage.ts`.
- `riskScale` from `src/brand/risk-signals.ts`.
- `enforces` from `src/brand/data.ts`.
- `normaliseWho` from `src/brand/rule-who.ts`.
- `methodBlocker` from `src/brand/methods.ts`.

### 4.2 New files

| File | Contents |
|---|---|
| `src/brand/decision-words.ts` | `DECISION_WORDS`, `FACTOR_WORDS`, `FACT_WORDS` (§5.1). Shared with Try a sign-in. |
| `src/brand/screens/sim-env.ts` | `useSimEnv()`: BoardBuilder's env literal at :346, plus `appName`. Also `envWith(env, { zones?, fingerprints?, riskScale? })`. BoardBuilder and `gauntlet-dialog.tsx` switch to it. |
| `src/brand/screens/rule-changes.ts` (+ `.test.ts`) | `ruleChanges(live, after, resolve)` (§5.5). |
| `src/brand/screens/guard.ts` (+ `.test.ts`) | Pure logic: `runGuard`, `readSignIn`, `whatChangesLine`, `decidingRows`, `readyFix`. |
| `src/brand/screens/library-guard.ts` (+ `.test.ts`) | `libraryGuard(...)` and the zone fix candidates. |
| `src/brand/screens/guard-page.tsx`, `guard.css` | The `GuardDrawer` component and the `useGuard()` hook. Classes use the prefix `.bgd`. |
| `src/brand/screens/break-in-model.ts` (+ `.test.ts`) | Rows, groups, `fixFor`, `applyBreakInFix`, `previewFix`, `acceptanceOptions`. |
| `src/brand/screens/break-in-view.tsx`, `break-in.css` | `BreakInView`, `AcceptForm`. Classes use the prefix `.bbi`. |
| `src/brand/screens/ui-copy.test.ts` | Extend it if it exists: banned words across every string in §3.7, and a sentence-case check. |

**Component contracts:**

```tsx
// guard-page.tsx
export type GuardKind = 'save' | 'apps' | 'turn-on'
export function GuardDrawer(p: {
  open: boolean; kind: GuardKind; policyName: string
  result: GuardResult | 'checking' | 'error'
  versions?: { value: 'edits' | 'stored'; tip: string }[]; version?: 'edits' | 'stored'; onVersion?: (v: 'edits' | 'stored') => void
  onApplyFix: (fix: ReadyFix) => void
  onRevealRule?: (index: number | null) => void      // board host only
  onOpenBreakIn?: () => void; onOpenWhatChanges?: () => void
  onConfirm: () => void; onReportOnly?: () => void; onClose: () => void
}): ReactNode

// break-in-view.tsx
export function BreakInView(p: {
  policy: Policy; versionWord: 'Your edits' | 'Live' | 'Stored version' | 'Draft'; env: SimEnv
  onRevealRule?: (index: number | null) => void
  onApplyFix?: (next: Policy, toast: string) => void   // board only; absent → "Open in board"
  onOpenInBoard?: (ruleId?: string) => void
}): ReactNode
```

### 4.3 Changed files

- **`gauntlet.ts`:**
  - Add `proposeAttemptFix` and `proposeFactorFix` (§5.7).
  - `BreakInOptions.factorOk?: ReadonlySet<string>`. In `runBreakIn`, classify with `factorOk?.has(card.id) ? { ...card, minFactor: undefined } : card`.
  - Refactor the body of `proposeFix` into a private `proposeFrom(spec, want, hitIndex, user, policy, env, closes)` that both callers share.
- **`impact-arena.ts`:** add `sweepTenant` (§5.4). Existing exports are unchanged.
- **`edition.ts`:**
  - `Features` gains `beforeTurningOn` (LITE true, FULL true) and `breakInTest` (LITE false, FULL true).
  - `FULL.exposure` becomes false.
- **`store.tsx`:**
  - `features: SHOWCASE ? { ...featuresOf(edition), breakInTest: true } : featuresOf(edition)` at :722, pinned at the call site as the SHOWCASE convention requires.
  - `breakInAccepted` and `acceptBreakIn`, reset on persona switch with `gauntletOverrides`.
  - `BrandScreen` board variant: `open?: 'gauntlet' | 'impact' | 'break-in'` and `rule?: string`.
- **`use-status-change.tsx`:**
  - `request(policy, target, opts?: { edits?: RuleSet })`.
  - In the `target === 'active' && !blocker && features.beforeTurningOn` branch, open `GuardDrawer kind='turn-on'` in place of the modal at :129–165.
  - Turn off and the Can't turn on modal are unchanged.
- **`status-control.tsx`:** a prop `edits?: RuleSet`, passed to `request`.
- **`board/BoardBar.tsx`:**
  - Pass `edits={live ? { rules: policy.rules, fallback: policy.fallback } : undefined}` to `StatusControl`. This needs a new `live` prop from BoardBuilder.
  - `BoardBarActions`: a new `checking` prop. The Save label becomes `Checking…`.
  - Check pip: remove `bb__grade`. Show `{n} through` only when `runBreakIn(...).counts.gotThrough > 0` (Full only).
- **`board/BoardBuilder.tsx`:**
  - `saveNow` becomes guarded (§2), and `ReviewDialog onCommit={guardedPublish}`.
  - Hold `useGuard()` state.
  - A `revealRule(index)` that sets `flash` on `Board`.
  - Read `screen.rule`/`open: 'break-in'` for the first selection and the panel page.
- **`board/Board.tsx`:** a prop `flash: { id: string | 'fallback'; key: number } | null`. It pans with the `useCanvasView` handle so the card sits 96 px below the stage top (`lockX` kept), then adds the class `is-flash` to the card.
- **`board/RuleCard.tsx`:** the `is-flash` class. CSS outline only.
- **`board/AppsPane.tsx`:** `save` becomes guarded (E6).
- **`board/CheckTab.tsx`** (Full only):
  - Delete the "Break-in test" section and `RoundRow`.
  - `ReadyRow` title: `Break-in test: nothing got through` or `Break-in test: {n} got through`.
  - `ReadyRow` detail is the counts line, with the action `Open Break-in test`.
- **`kit.tsx`:**
  - `ReviewChanges` gains `blockedAction?: { label: string; run: () => void }`, rendered as `Button variant="neutral" size="sm"` after `.bx-review__blocked`.
  - `SaveBar` gains `guard?: () => { rows: ReviewRow[]; blockedReason: string | null; action: { label: string; run: () => void } | null }`. It is called when Review & save is pressed and re-called whenever `review` changes while open. It passes `rows` appended to the review, and `blocked = blocked || !!g.blockedReason`, `blockedReason` and `blockedAction` to `ReviewChanges`. The footer button is still disabled only by the page's own `blocked`.
- **`change-list.tsx`:** `ChangeTone` gains `'neutral'`, and `BADGE_TONE.neutral = 'neutral'`.
- **`ZonesFinal.tsx`, `DeviceFingerprintV2.tsx`, `RiskSignals.tsx`:** pass `guard={() => libraryGuardView(...)}` when the object is not new, and for risk only when the profile is the one in use.
- **Saved sign-ins section** (the sibling spec's component): the `Break-in test` button in the header, behind `features.breakInTest`.

---

## 5. Data and state

### 5.1 Types

```ts
// decision-words.ts
export const DECISION_WORDS: Record<AccessDecision, string> = { '1fa': 'Allow on 1 factor', '2fa': 'Allow with 2FA', deny: 'Deny' }
export const FACTOR_WORDS: Record<FactorStrength, string> = { 'phishing-resistant': 'phishing-resistant', standard: 'standard', weak: 'weak', 'below-weak': 'below weak' }
export const FACT_WORDS: Record<FactKey, string> = { app: 'App', person: 'Person', address: 'Address', asn: 'Network', location: 'Place', 'location.city': 'City', 'location.coordinates': 'Coordinates', date: 'Date', time: 'Time', risk: 'Risk score', 'device.platform': 'Device platform', 'device.osVersion': 'OS version', 'device.formFactor': 'Device type', 'device.browser': 'Browser', 'device.integrity': 'Device integrity', 'device.screenLock': 'Screen lock', 'device.authenticatorVersion': 'Authenticator version', 'device.agent': 'Device Agent', 'device.registration': 'Registration', 'device.registeredCount': 'Registered devices' }

// contract with the saved sign-ins spec (store.savedSignIns)
export type SignInLevel = 'note' | 'must-pass' | 'protected'
export interface SavedSignIn { id: string; name: string; facts: SignInFacts /* appId + personId set */; expect: AccessDecision; level: SignInLevel }

// store.tsx (new)
export interface BreakInAcceptance { want: AccessDecision; factorOk: boolean; by: string /* store.account.name */; at: string /* ISO 8601 */; reason: string /* 1–200 */ }
breakInAccepted: Record<string /*policyId*/, Record<string /*cardId*/, BreakInAcceptance>>
acceptBreakIn: (policyId: string, cardId: string, a: BreakInAcceptance | null) => void
```

**What persists:**
- For the session only, in store React state, reset on persona switch: `breakInAccepted` and (from the sibling spec) `savedSignIns`.
- Guard results, the drawer's version choice, Break-in filters, the open row and draft reasons are component state, gone on close.
- Nothing is written to localStorage.

### 5.2 Reading one saved sign-in

`readSignIn(s, policies, env)` calls `resolveSignIn(policies, s.facts, env)` and returns a `Reading`:

```ts
{ verdict, decision, possible, decidedBy, ruleIndex, ruleName, missing }
```

| Resolution | Verdict |
|---|---|
| `status === 'decided'` | `decision === s.expect` gives `'pass'`, otherwise `'fail'` |
| `'depends'` | `'cant-tell'`; `possible` = the distinct `possible[].decision`; `missing` = the union of `trace.unknowns[].missing` |
| `'incomplete'` | `'cant-tell'`; `missing` = `resolution.missing` |

- `ruleIndex` = `trace.hitIndex`, where null means the last row.
- `ruleName` = the step's `ruleName`, or `'Nothing else matched'`.

**The check:**
- `regressed = before.verdict === 'pass' && after.verdict !== 'pass'`.
- `blocks = regressed && after.verdict === 'fail' && s.level !== 'note'`.
- `own = s.facts.personId === adminId`.
- A sign-in is **relevant** when `facts.appId` is one of the subject's apps (every app for the system policy) **or** its reading changed.

### 5.3 `runGuard` (guard.ts, React-free)

```ts
export interface GuardInput {
  kind: GuardKind
  subjectId: string
  before: Policy | null                 // save/apps: live saved policy; turn-on: null (it decides nothing today)
  after: Policy                         // save: committed(saved, draft, 'keep-off'); apps: { ...saved, appIds, status: becomesDraft ? 'draft' : saved.status }
                                        // turn-on: { ...stored or published(edits), status: 'active' }
  policiesBefore: readonly Policy[]     // store.policies
  env: SimEnv; apps: readonly App[]
  savedSignIns: readonly SavedSignIn[]; adminId: string
  breakIn: { overrides: Record<string, Expect>; factorOk: ReadonlySet<string> } | null   // null when !features.breakInTest
}
export interface GuardResult {
  kind: GuardKind; changes: RuleChange[]; deciding: DecidingRow[]
  saved: SignInCheck[]; protectedOwn: SignInCheck[]
  whatChanges: WhatChangesLine
  breakIn: { now: BreakInCounts; was: BreakInCounts | null } | null
  blocking: SignInCheck[]; interrupt: boolean; fix: ReadyFix | null
}
```

**Steps:**

1. `policiesAfter` = `policiesBefore` with the policy of id `subjectId` replaced by `after`. The resolver's own `enforces()` then decides whether it is live; `substitute` is not used.
2. **Checks:** `readSignIn` against `policiesBefore` and `policiesAfter` for every relevant sign-in. Split them into:
   - `protectedOwn`: level `protected`, or `own`.
   - `saved`: the rest.
   - Sort each: fails, then can't tell, then passes; name order within each.
3. **`deciding`:**
   - For each app in the union of `before?.appIds` and `after.appIds`, and for each audience unit (each named group, each named person, or every group that has directory people when the audience is everyone), take one representative person.
   - Compare `governingPolicy(policiesBefore, {appId, personId}).decider?.id` with the same call on `policiesAfter`.
   - Classify as **starts**, **stops**, or **not** (after, the subject's standing is `default-group-yields` or `same-app-and-group`; the reason is `standing.reason`).
   - Group by (app, kind, other policy or reason) and join the unit names.
   - For the system policy the result is empty (`No change`).
4. **`whatChanges`** = `whatChangesLine(appsToSweep.map(a => sweepTenant(policiesBefore, a, env, 570)), appsToSweep.map(a => sweepTenant(policiesAfter, a, env, 570)))`.
   - `appsToSweep` is the subject's app union.
   - For the system policy it is the first app in catalogue order that no enforcing non-system policy covers. The TipDot names that app.
5. **`breakIn`:** `now = runBreakIn(after, env, opts).counts` and `was = before ? runBreakIn(before, env, opts).counts : null`.
6. **Interrupt and fix:**
   - `blocking = [...saved, ...protectedOwn].filter(c => c.blocks)`.
   - `interrupt = blocking.length > 0 || whatChanges.counts.nowAllowed > 0 || regressions to can't-tell on must-pass or protected (Q1)`. With Q2-bis = yes, add `|| breakIn.now.gotThrough > (breakIn.was?.gotThrough ?? 0)`.
   - `fix = blocking[0] ? readyFix(input, blocking[0]) : null`.
7. The `turn-on` kind always opens, whatever `interrupt` says.

**Cost:** measured on the showcase at about 150 ms for one policy on one app (two tenant sweeps, two `runBreakIn` runs, and N resolves). Hence the `Checking…` label.

### 5.4 `sweepTenant` and `whatChangesLine`

```ts
// impact-arena.ts
export interface TenantSweep { appId: string; decisions: (AccessDecision | null)[]; factors: (FactorStrength | null)[]; deciders: (string | null)[] }
export function sweepTenant(policies: readonly Policy[], appId: string, env: SimEnv, nowMinutes: number): TenantSweep
```

- Per situation: build the chip context (`contextOf`), then find the decider with `governingPolicy(policies, { ...chipFacts(ctx, env), appId, personId: user.id }, env).decider`, cached per person as `decideSituation` does.
- Then `decide(decider, ctx, env)`, with the factor from `ruleFactor(hitRule ?? decider.fallback, methods)` when the decision is 2FA.
- With no decider the decision is null, and that situation is skipped when comparing.

```ts
// guard.ts
export interface Named { personId: string; label: string /* "Priya Sharma (Finance)" */; origins: string[] }
export interface WhatChangesLine { total: number; appNames: string[]; nowAllowed: Named[]; nowOn1Factor: Named[]; nowAskedFor2fa: Named[]; nowDenied: Named[];
  counts: { nowAllowed: number; nowOn1Factor: number; nowAskedFor2fa: number; nowDenied: number } }
```

**Counting:**
- The key is `app|user|place|device|risk`. The auth-state axis changes no result, so it is dropped.
- `total` = 360 × apps.

**Categories** (b = decision before, a = decision after):

| Category | Condition |
|---|---|
| nowAllowed | `b === 'deny' && a !== 'deny'` |
| nowOn1Factor | `b === '2fa' && a === '1fa'` |
| nowAskedFor2fa | `b === '1fa' && a === '2fa'` |
| nowDenied | `b !== 'deny' && a === 'deny'` |

Counts are distinct keys. `Named` groups keys by person, with origins in `PLACES` order.

### 5.5 `ruleChanges(live, after, resolve)` (rule-changes.ts)

It returns `{ kind: 'added' | 'changed' | 'removed'; name: string; value: string }[]`, matching rules by id (the same pairing as `describeChanges` in `changes.ts`).

- **Added:** `Rule {i+1} · {name}` / `{ruleIfLine} → {Decision}`.
- **Removed:** `{name}` / the same kind of line, struck through.
- **Changed:** `Rule {i+1} · {name}` / the changed aspects joined with ` · `, in this order:
  1. `Renamed from {old}`
  2. `Moved to position {n}`
  3. `Decision: {Decision}`
  4. `Who: {who sentence}`
  5. `Conditions: {ruleIfLine}`
  6. `Second factor: {methods or Any}`
  7. `Switched on` / `Switched off`
  8. `Deny message`
- **The last row:** name `Last row`, with the same aspects.
- **Count:** `changeCount` = the number of items.

### 5.6 `libraryGuard` (library-guard.ts)

**Input:** `{ kind: 'zone' | 'device-profile' | 'risk-profile'; saved; draft; policies; env; apps; savedSignIns; adminId }`.

**Env after the edit:**
- Zone: `library.zones` with the draft in place.
- Device profile: `library.fingerprints` with the draft in place.
- Risk profile: `riskScale = riskScale(draft)`.

**Rows** (`effect: true`), as in §3.5:
- Active policies, found with `policiesUsing('zone' | 'fingerprint', id)` or `policiesUsingType('device-risk')`, then filtered with `enforces`.
- What changes, over those policies' apps.
- One row per relevant saved sign-in whose reading changed, compared across `env` and `envAfter`.

**`blockedReason`:** the first blocking check's line (§3.2).

**Fix candidates,** in order. The first one that clears every blocker is used:
- **Zone:**
  - For each entry the draft removed (`ip`, `asn`, `location.countries/states/cities`, `ranges`): `Keep {entry}`.
  - For each entry it added: `Remove {entry}`.
  - If the zone's `kind` changed: `Restore the zone type`.
  - Finally: `Restore the saved zone`.
- **Device profile and risk profile:** `Restore the saved profile` only.
- **`run`** sets the page draft to the candidate (`setDraft`). The review re-evaluates `guard()`.

### 5.7 Fixes

**`readyFix(input, b)`** (policy kinds). Try candidates in this order and return the first where re-reading the saved sign-ins alone (no sweeps) leaves `b` passing and adds no new blocker. Here `i` is `b.after.ruleIndex`.

| # | Condition | Fix |
|---|---|---|
| C1 | `i !== null`, and a rule with the same id exists in `before` with different JSON | `Restore rule {i+1}` (replace it with the live copy) |
| C2 | Same id, same content, different index | `Move rule {i+1} back to position {j+1}` |
| C3 | `i === null`, and `before.fallback` differs | `Restore the last row` |
| C4 | `i === null`, and the rule that decided `b` on live exists in `after` with changes | `Restore rule {m+1}` |
| C5 | `i !== null` and `b.signIn.facts.personId` is set | `Leave {Person} out of rule {i+1}`: add the person to `who.exceptUserIds` through `normaliseWho` |
| C6 | The sign-in names a person | `Add a rule for {Person}`: insert at index 0 a rule named `Keep access for {Person}`, who = `{ groupIds: [], userIds: [pid] }`, when = any sign-in, decision = `b.signIn.expect` (2FA uses `secondFactor: 'any'`) |

- C1 to C4 are skipped when `before === null` (turn-on).
- Result: `{ label, policy }`.
- The board host commits `policy.rules`/`fallback` through `commitDraft` and `offerUndo`. The list host keeps it as the edits version.

**`proposeAttemptFix(round, policy, env): ProposedFix | null`** (gauntlet.ts)
- Only for `outcome` of `'got-through'` or `'less-than-asked'`, with `round.challenge.fix` set and `namesMissing` false.
- `at = round.trace.hitIndex ?? policy.rules.length`.
- `closes = r => traceRule(r, at, { ...facts, appId, personId }, personOf(personId, env), env).match === 'yes'`.
- The twin, insert and off-by-one rules are identical to `proposeFix`, through the shared `proposeFrom`.

**`proposeFactorFix(round, policy, methods): { ruleIndex: number | null; methods: string[] } | null`**
- Only for `'weaker-factor'` with `minFactor` set.
- Takes every second-factor method with `methodBlocker(m) === null && FACTOR_RANK[methodStrength(m)] >= FACTOR_RANK[minFactor]`, in catalogue order. Returns null when there is none.
- Applying it sets `secondFactor: 'specific'` and `secondFactorMethods: methods` on the deciding rule, or on the fallback when `ruleIndex` is null.

**`break-in-model.ts`:**
- `fixFor(round, policy, env)` returns a `BreakInFix`, either `{ kind: 'rule'; fix }` or `{ kind: 'factor'; ruleIndex; methods }`, or null.
- `applyBreakInFix(policy, fix): Policy` uses `applyFix` for rule fixes.
- `previewFix(policy, fix, env, opts, apps)` returns `{ counts: runBreakIn(fixed).counts; line: whatChangesLine(...) }`, memoised on the expanded card only.
- `acceptanceOptions(accepted)` returns `{ overrides: want by card, factorOk: ids where factorOk }`.
- `breakInRows(result, accepted)` returns `BreakInRow[]`, with the `group` taken from `outcome` (`'undecided'` becomes can't tell).

**Accept this result:**
- `acceptBreakIn(policyId, cardId, { want: round.decision, factorOk: round.outcome === 'weaker-factor', by: store.account.name, at: new Date().toISOString(), reason })`.
- `Restore expectation` sends `null`.
- The date shows as `d MMM yyyy, HH:mm` with 24-hour time and short month names, e.g. `26 Sep 2026, 14:05`.

---

## 6. Motion

Every animation below explains a change, stays under 1.6 s, and never plays while focus is in an `input`, `textarea` or `[contenteditable]`. Reduced motion is honoured through `MotionConfig reducedMotion="user"` (`BrandApp.tsx:162`) plus explicit `useReducedMotion()` checks.

| What | Trigger | Motion | Reduced motion |
|---|---|---|---|
| Guard drawer | Opens | The existing kit `Drawer` spring. Rows fade in once: opacity 0→1 over 120 ms, 30 ms apart (the last ends at 270 ms). | Opacity only, no stagger (duration 0) |
| Version switch or re-run after a fix | Checks re-run | Only rows whose summary changed cross-fade, opacity 0.4→1 over 160 ms | Instant |
| Blocked banner | Cleared by a fix | Height to 0 and opacity to 0 over 200 ms (height, not transform) | Instant; the live region says so |
| Break-in first render | Page opens | Rows settle: opacity plus framer `y` 4→0 over 160 ms, 40 ms apart (15 rows finish at 760 ms). Counts appear at once, with no count-up. | Final state at once |
| Break-in re-evaluation | Draft edit, fix, accept | A row whose group changed moves with framer `layout` (240 ms, ease `[0.2,0,0,1]`). That row and any changed count cell get a 2 px `--blue` outline that fades over 1,200 ms (a CSS keyframe on `outline-color`). | No move animation. A static `Changed` label (12 px, `--blue`) stays until the next change. |
| Rule reveal on the board | Rule link | Pans with the `useCanvasView` glide, then `is-flash`: 2 px `--blue` outline at 2 px offset, fading over 1,200 ms | Jump; a static outline removed after 1,200 ms |

**The transform trap:** `.bbi__row` is a `motion.li` with `layout`. No stylesheet sets `transform` on it or on anything framer animates. The chevron rotates a plain `svg` child. The flash and change outlines are outline changes only.

---

## 7. Accessibility

**Guard drawer:**
- Kit `Drawer` gives `role="dialog"`, `aria-modal` and `aria-label={title}`, with the focus trap and return from `useDialogChrome`. Focus returns to Save policy, the status pill or the row-menu trigger.
- **Tab order:** × → ready-fix button → rule link → `Version` Seg (turn-on) → each row's toggle (`aria-expanded`), with any open row's links after its toggle → Keep editing / Cancel → Save policy / Turn on.
- ⌘/Ctrl+↵ inside the drawer triggers the primary when it is enabled.
- **Live region:** one `<p className="u-sr-only" aria-live="polite">` per drawer, set once per run:
  - `Saving is blocked. Kavya in the Pune office must pass and would get Deny.`
  - `Checks done. Now allowed: Priya Sharma.` (up to three names)
  - `Saving is no longer blocked.`
  - `Checks could not run.`
- `Checking…` sets `aria-busy="true"` on the Save button.

**Break-in view:**
- Wrapped in `<section aria-labelledby>`. The counts are a `role="group" aria-label="Counts"` of four buttons with `aria-pressed`, named for example `Locked out, 1`.
- Group labels are `<h3>`. The list is a `<ul>`.
- Each `<li>` holds:
  - a toggle button (`aria-expanded`, `aria-controls`) named `Finance working from home. Locked out. Expected Allow with 2FA, got Deny.`;
  - a sibling rule button, not nested in the toggle, labelled `Show rule 1, In a corporate office, on the board`.
- **Live region:** `Break-in test: got through 0, weaker factor 0, locked out 1, extra prompts 0.` on first render, then `Locked out now 0.` on a change.
- **Reason field:** a `<label>` via `Field`, `required`, `aria-invalid` on an empty submit, with the error in `role="alert"`.
- **Focus after actions:** after Accept or Restore, focus goes to the row toggle. After a fix, the fix button unmounts and focus goes to the row toggle.
- Colour is never the only signal: every mark has an sr-only group word, and every group has a visible heading.

---

## 8. Acceptance checks (showcase tenant, browser, 1,120 px, light)

**Fixture.** Saved sign-ins, seeded by the saved sign-ins spec or Phase 4, or saved through Try a sign-in. Times are Mon 28 Sep 2026 in Asia/Kolkata.

| Id | Name | Person, app, facts | Expect | Level |
|---|---|---|---|---|
| S1 | Kavya in the Pune office | u-hr-1, hrms, 203.0.113.25, 09:30 | Allow with 2FA | Must pass |
| S2 | Aisha on HRMS | u-sales-1, hrms, 203.0.113.25 | Allow on 1 factor | Note |
| S3 | Vikram on a corporate laptop | u-exec-2, google-workspace, Windows 10.0.22631, registered, agent 4.2, registeredCount 2, risk 12 | Allow on 1 factor | Protected |
| S4 | Ravi on HRMS | u-it-1, hrms, 203.0.113.25 | Allow on 1 factor | Protected |

**Guard: saving**
- [ ] **A1 · Clean save stays one click.** In `Device compliance for Outlook and Dropbox`, rename rule 1. Save policy shows `Checking…` briefly. No drawer opens. Toast: `Device compliance for Outlook and Dropbox saved`.
- [ ] **A2 · Newly allowed opens the page but does not block.** In `HRMS access from corporate offices`, set the last row to Allow on 1 factor and save. The drawer `Before saving: your edits` opens.
  - What changes is open: `Now allowed 72 · Now asked for 2FA 0 · Now denied 0`. Item: `Priya Sharma (Finance)`, `Any location, Outside all zones, Tor exit node, Known proxy`.
  - Break-in: `Got through 2 (was 0) · Weaker factor 0 · Locked out 0 (was 1) · Extra prompts 0`.
  - S1, S2 and S4 pass. `Save policy` is enabled. Saving closes the drawer with the toast `… saved`.
- [ ] **A3 · A Must pass blocks, with a ready fix.** Add a rule at the top: Who Human Resources, no conditions, Deny. Save.
  - Banner: `Saving is blocked` / `Kavya in the Pune office must pass and would get Deny.` / `[Leave Kavya Menon out of rule 1]`. `Save policy` is disabled.
  - Press the fix. The banner collapses. The live region says `Saving is no longer blocked.` The toast `Leave Kavya Menon out of rule 1. Not saved yet.` has Undo.
  - S1 moves to Passes (`Allow with 2FA · Rule 2`). Save policy works.
- [ ] **A4 · Protected blocks.** In `Access the app through corporate devices only`, set rule 1 to Deny and rename rule 3. Save.
  - Banner: `Vikram on a corporate laptop is protected and would get Deny.` / `[Restore rule 1]`. There is no `Expect … instead`.
  - What changes shows `Now denied 5`.
  - After the fix, only the rename is left, and Save policy is enabled.
- [ ] **A5 · "Rule 1" link.** In the banner (A3), it pans the chain to rule 1 and flashes a blue outline for about 1.2 s. Focus stays in the drawer.

**Guard: turning on**
- [ ] **A6 · Before turning on.** Turn off the HRMS policy from the row menu; the old confirm is still used for that. Then Turn on. A drawer opens, not a centred modal.
  - Who it starts deciding for: `HRMS · Human Resources, Finance · was Global Default Policy`.
  - What changes: `Now allowed 0 · Now asked for 2FA 18 · Now denied 72`.
  - Break-in: `Got through 0 · Weaker factor 0 · Locked out 1 · Extra prompts 0`.
  - S1 passes, with the value `Allow with 2FA · was Allow on 1 factor`.
  - Turn on gives the toast `HRMS access from corporate offices is on`, and the pill reads Active.
- [ ] **A7 · Version choice.** With HRMS Inactive, open the board, set rule 1's second factor to OTP over Email, press Save draft, then Turn on from the Policies row menu.
  - The Seg shows `With your edits` selected. What you changed: `Rule 1 · In a corporate office` / `Second factor: OTP over Email`.
  - Switch to `Stored version`: the summary becomes `Stored version`, and only the changed rows cross-fade.
  - Switch back and Turn on: toast `… saved and turned on`. Rule 1 is live with OTP over Email, and the saved draft is gone.
- [ ] **A8 · Unsaved edits from the pill.** Turn on from the board's status pill with unsaved edits: `With your edits` means the board draft. After Turn on, the bar shows no Unsaved changes pill.

**Also changes in Review changes**
- [ ] **A9 · Zone block.** In `Corporate offices`, remove `203.0.113.0/24`, then Review & save.
  - **Also changes** lists `Active policies`, `What changes`, and `Kavya in the Pune office · Must pass` → `Deny · expected Allow with 2FA`.
  - The primary is disabled, with the reason and `[Keep 203.0.113.0/24]`. Pressing it restores the entry, and the review re-runs clean.
- [ ] **A10 · Risk profiles.** Editing a risk profile that is not in use adds no Also changes rows.

**Break-in test**
- [ ] **A11 · HRMS.** Open the HRMS board, then Try a sign-in, Saved sign-ins, `Break-in test`.
  - Counts: `0 · 0 · 1 · 0`.
  - Locked out: `Finance working from home` / `Allow with 2FA` / `Deny` / `Last row`. Held has 4 rows.
  - Foot: `Not in audience: Human Resources, Finance · 10 skipped`.
  - No letter grade appears anywhere.
- [ ] **A12 · Accept.** Expand `Finance working from home`, press `Accept this result`, type the reason `HRMS is office-only`, press Accept.
  - Locked out goes to 0, with a blue outline. The row moves to Held with `Accepted`.
  - The row shows `Accepted by Jaspreet Toor · {date}` and `Reason: HRMS is office-only`.
  - `Restore expectation` reverts it. An empty reason shows `Enter a reason`.
- [ ] **A13 · Weaker factor fix.** On `Developer tools — office and device checks`, the counts are `0 · 1 · 1 · 0`.
  - The row `Sign-in relayed through a phishing proxy` shows `Second factor  miniOrange Push · standard · needs phishing-resistant`.
  - Fix: `Rule 2 · Compliant device, working remotely → FIDO2 / Passkey`. After this fix: Weaker factor 0.
  - `Change second factor` gives the toast `Second factor changed on rule 2. Not saved yet.` with Undo. The row moves to Held.
- [ ] **A14 · Got-through fix preview.** On `Device compliance for Outlook and Dropbox`, Got through is 5.
  - Expand `Finance account behind a known proxy`. Fix: `Deny sign-ins from outside India — If not in zone India → Deny · at position 1`. After this fix: `Got through 1`.
  - The fix button is neutral, not orange.
- [ ] **A15 · Filters.** A count cell filters the list. The pressed cell is blue, and pressing again clears it.

**Rules**
- [ ] **A16 · Orange.** The only orange on any new surface is the drawer's primary button (plus the rail edge and "New").
- [ ] **A17 · Words and counts.** No `gauntlet`, `blast radius`, `rehearse`, `Verified`, `Straight in` or `Blocked` appear in new UI. Decisions read exactly `Allow on 1 factor`, `Allow with 2FA` and `Deny`. `Can't tell` is grey. No counts appear in tabs.
- [ ] **A18 · Reduced motion.** Emulate reduced motion. There is no stagger, slide or fade on outlines. Changed rows show a static `Changed` label. Every live region still announces.
- [ ] **A19 · Width.** At 1,120 px nothing overflows horizontally. In a 423 px panel, Break-in columns wrap within the row.
- [ ] **A20 · Keyboard.** Tab reaches every control in the order in §7. Escape closes the drawer and focus returns to its opener.
- [ ] **A21 · Verification gate.**
  - `npm test` is green, including `guard.test.ts`, `rule-changes.test.ts`, `library-guard.test.ts`, `break-in-model.test.ts`, the extended `break-in.test.ts`, and `ui-copy.test.ts`.
  - The `npx oxlint` warning count is at or below the branch baseline.
  - `npm run build` is clean.
  - Confirm which worktree owns localhost:5173 before running the browser checks.

**Unit tests that must exist** (in `guard.test.ts` and `break-in.test.ts`):
- A2 to A4 and A6 at the model level, with the exact numbers above.
- `readyFix` returns C5 for A3 and C1 for A4.
- Every `TYPED_DECK` card with a fix: `proposeAttemptFix` on an open policy closes it.
- `proposeFactorFix` on the dev-tools relay returns `['FIDO2 / Passkey']`.
- A `factorOk` acceptance turns `weaker-factor` into `held`.

---

## 9. Open questions for the owner

1. **"Can't tell" on a Must pass or Protected sign-in after an edit.** Should it block?
   - *Recommendation:* no. It opens the page, lists the sign-in in grey with `needs {fact}`, and never blocks. A missing fact is a gap in the saved sign-in, not proof the edit is wrong.
2. **Overriding a Must pass from the page.** Should a Must pass block offer `Expect {Decision} instead`, with the same Reason field? Protected never would.
   - *Recommendation:* yes. It is the only thing that makes the two levels differ in practice.
3. **Two triggers you did not name** (they are one question).
   - *(a) Break-in "Got through" rising.* A hostile sign-in newly getting less (for example 2FA to 1 factor) is not "newly allowed". Should a rise also open Before saving?
     - *Recommendation:* yes, as a third trigger. It is the case the Break-in test exists for.
   - *(b) A "Now on 1 factor" category.* 2FA down to 1 factor loosens, but it is missing from Now allowed / Now asked for 2FA / Now denied. Should it be added?
     - *Recommendation:* add it as a category after Now allowed, but do not make it a trigger.
4. **Default version in Before turning on,** when both versions exist.
   - *Recommendation:* `With your edits`. The admin just made them, and the Seg makes the choice visible. Today's modal activates the stored version silently.
5. **"Less than asked"** (ordinary sign-ins weaker than expected). Is it a fifth count, or folded into Got through?
   - *Recommendation:* keep your four counts, and show these rows under their own `Less than asked` group with no count cell.
6. **Weaker factor fix.** It swaps the rule's second factor to only phishing-resistant methods (FIDO2 / Passkey in the showcase), which some people may not have enrolled. Should it be offered?
   - *Recommendation:* offer it, and show factor readiness in the preview once What changes ships it.
7. **Report only in Before turning on.**
   - *Recommendation:* once Monitor ships, add a neutral `Report only` beside Turn on. It sets Monitor without blocking, because it enforces nothing.
8. **Turn off.** Turning off HRMS makes Priya newly allowed in 72 modelled sign-ins. Should Turn off get the same page?
   - *Recommendation:* yes, under the Save rule: open only when someone is newly allowed, otherwise keep today's one-line confirm.
9. **"Use" on a risk profile.** It changes every device-risk condition at once.
   - *Recommendation:* route it through Review changes with the same Also changes rows.