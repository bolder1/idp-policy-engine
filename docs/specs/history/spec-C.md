# Spec C: Monitor (report-only)

Build-ready. I checked this against the uncommitted Phase 0 tree in `C:\New folder\IDP Policy Engine\.claude\worktrees\kind-heyrovsky-5ec74e`. I read every interface named here in that tree: `sign-in-facts.ts`, `simulate.ts`, `tenant-resolver.ts`, `zone-match.ts`, `geo-fixture.ts`, `factor-strength.ts`, `gauntlet.ts`, `impact-arena.ts`, `data.ts`, `kit.tsx`, `store.tsx`, the status files, `Policies.tsx` and the board files. All paths are relative to the worktree root. I changed nothing.

---

## 0. The decision: a new status, not a setting at Turn on

**Decision.** Add `PolicyStatus` value `'monitor'`. The pill word is **Monitoring**.

**Why a status:**

1. **The console already has one predicate for this.**
   - `enforces` (`src/brand/data.ts:36`) names the statuses that act. Any status it does not name enforces nothing, with no extra rule.
   - A setting (`reportOnly: true` on an Active policy) would leave `status === 'active'` true on a policy that decides nothing.
   - Every reader of status would then count it as protection until each one learned the flag. That includes `StatusPill`, the list's "Active" filter (which uses `enforces`), `statusOptions`, `app-policies.summarise`, `applications-model.attachNote` and the Policies footer ("N policies deciding sign-ins").
   - This is the trap that the `src/brand/monitor.test.ts` deleted in cb89c91 pinned ("disagrees with the check it replaced, and only on monitor").
2. **The list must show it.** A policy that enforces nothing, under a green Active pill, is the most misleading row the console could draw.
3. **Vendors treat it as a state:**
   - Entra: Report-only is a policy state beside On and Off.
   - JumpCloud: Monitor Mode is the policy status (flask icon), with "Would be denied" outcomes.
   - Google Context-Aware Access: Monitor versus Active is the mode of an assignment.
   - AWS AgentCore: `LOG_ONLY` is an engine mode that logs decision flips.
   - Stripe Radar's 0% allocation is the only setting-style precedent, and Radar rules have no status field to put it in.
4. **History.** Until cb89c91 (16 Sep) the prototype had exactly this:
   - `PolicyStatus` included `'monitor'`, and `evaluates = enforces(p) || p.status === 'monitor'`.
   - A notice-tone "Monitor" pill with the title "Evaluates every sign-in…".
   - A "Monitor" option in the Policies status filter, and "· N in monitor" in the list footer.
   - "Publish in monitor" and "Keep monitoring" in `review-step.tsx`, and "Records what it would have done. Decides nothing." in `app-policies.ts`.
   - `monitor.test.ts`.
   - These were removed by the 14 Sep ruling, which the owner withdrew on 25 Sep. The comment at `data.ts:12-17` and `evaluates = enforces` at `data.ts:39-41` are what is left.

**Rejected: a choice at Turn on ("Turn on / Monitor only").** It still needs somewhere to store the choice, so it is a status in disguise. It also hides the state once the dialog closes.

---

## 1. Purpose and scope

**Purpose.** Manager's scenario #6, word for word from `Scenarios.xlsx`: "Provide Monitor / Report-Only Mode - ability to determine what impact the policy would have had before enforcing it."

**In scope**
- The `'monitor'` status, its pill, the status control and row-menu switches, and every transition with its confirmation.
- Resolver behaviour: a monitored policy never decides. It appears in `standings` and in `watching`.
- A **Monitoring page** per policy (slider page). It shows sample sign-ins, a Today column, an "If turned on" column and one Terraform-style plan line.
- Hooks for Try a sign-in (Phase 1), the three Policy testing page variants (Phase 2) and Before turning on (Phase 3).
- Every status-aware file, and the tests.

**Out of scope**
- Real traffic (needs the backend; pitch slide only).
- History over time.
- Monitoring a single rule.
- Pilot groups.
- Monitor on Session or Account Management policies.
- Monitor on the Global Default.

**Edition.** Add `Features.monitorMode` to `src/brand/edition.ts`, on in Lite and Full. Scenario #6 is the manager's own ask, and Lite is "the product as it was asked for". `SHOWCASE` needs no pin.

**Build order (about 4 days)**

| Step | Work | Days |
|---|---|---|
| M1 | Status, pill, switches, confirmations, all status-aware files | 1.5 |
| M2 | Resolver `watching` | 0.5 |
| M3 | Sample sign-ins and the Monitoring page | 1.5 |
| M4 | Hooks in Try a sign-in, the testing page and the guard, each landing when that surface exists | 0.5 |

M1 to M3 depend only on Phase 0.

---

## 2. Entry points, navigation and transitions

### 2.1 Where Monitor is reached

| Entry | What it offers |
|---|---|
| Policies row menu (`screens/Policies.tsx`, `policyMenu`) | The status switches, plus **View monitoring** when the status is monitor |
| Board bar status control (`screens/status-control.tsx`, mounted at `board/BoardBar.tsx:207`) | The same switches, plus **View monitoring** after a separator |
| Trail bar (`screens/policy-bar.tsx:106`) | Same as the board control. Not in the showcase. |
| Toast after the first **Save policy** of a draft that has apps | "{name} saved. It is off." with the action **Monitor** (the Draft → Monitoring path) |
| Monitoring page footer | **Turn off**, **Turn on** |
| Before turning on guard (Phase 3) | **Monitor instead** (secondary) when the policy is Inactive. A **View monitoring** link when it is monitoring. |
| Read-only | Try a sign-in and the Policy testing page (the standings), and the Applications page (status word) |

The Monitoring page is page-local state, not a `BrandScreen`. It opens over whatever page opened it, and closing it returns focus to the trigger.

### 2.2 Transitions

| From → To | Offered in | Confirmation | Toast |
|---|---|---|---|
| Draft → Monitoring | Toast action after the first Save policy. The draft pill stays plain (`statusOptions` still `[]` for drafts). | None | "{name} is monitoring", Undo → Inactive |
| Inactive → Monitoring | Pill, row menu, guard **Monitor instead** | None. Modal only if the board has unsaved edits or the policy has `pendingDraft` (§3.3 M2). | "{name} is monitoring", Undo → Inactive |
| Active → Monitoring | Pill, row menu | Modal §3.3 M1 (enforcement stops) | "{name} is monitoring" |
| Monitoring → Active | Pill, row menu, page footer | **Before turning on** guard. Until the guard exists, modal §3.3 M3. The existing `turnOnBlocker` still applies. | "{name} is on" |
| Monitoring → Inactive | Pill, row menu, page footer | None | "{name} is off", Undo → Monitoring |
| Monitoring → Draft | Last app removed (`AssignAppsDialog`, `detachFrom`) | Existing | Existing |
| Global Default, `always-on`, non-App-Access | Never offered | — | — |

- **Blocker.** Monitor needs at least one application. If one is ever missing, show the existing "Can't …" dialog with title "Can't monitor {name}" and body "Assign an application first." Rule errors never block Monitor, because it enforces nothing. This follows the rule "block only where the reason is readable".
- **Saving a monitoring policy** is always one click and is never interrupted. Owner decision 4 (Before saving) applies to Active only.
- **What is monitored** is the stored live rules, never `pendingDraft` or unsaved board edits.

**Menu order.** Options are always listed by how much they enforce, with the current status left out:

| Status | Options |
|---|---|
| Active | Monitor, Turn off |
| Inactive | Turn on, Monitor |
| Monitoring | Turn on, Turn off, then a separator and **View monitoring** |

---

## 3. Layout, states and copy

Shell: 1,120 px, a 200 px rail and about 920 px of page. Light mode only. No phone layout.

### 3.1 Policies list (`screens/Policies.tsx`)

```
| rail 200 | Policies                                                   (page 920)       |
|          | [Search policies…] [≡ Status: All ▾]                      [+ New policy]    |
|          | Policy name                  | Applications | Status 128     | Actions 56  |
|          | Global Default Policy System | Every app…   | Always on      |  ⋯          |
|          | HRMS access from corporate…  | HRMS         | (Monitoring)   |  ⋯          |
|          | 4 policies deciding sign-ins                                                 |
```

- **Status filter** (`STATUS_TABS`, line 83): All, Active, **Monitoring**, Draft, Inactive. No counts. Picker value `'monitor'`, label "Monitoring".
- **Pill:** "Monitoring", blue tint (§4). It fits the 128 px status column.
- **Footer:** unchanged ("N policies deciding sign-ins", which counts `enforces`). No monitoring count is added.
- **Row menu** for a monitoring policy: Edit policy · Turn on (`Power`) · Turn off (`PowerOff`) · View monitoring (`Eye`) · Save as template · Duplicate · Delete policy.
- **Row menu** for Active: Edit policy · Monitor (`Eye`) · Turn off · … For Inactive: Turn on · Monitor · …

### 3.2 Status control (board bar)

```
Policies › HRMS access from corporate offices ✎ [Monitoring ▾] [Draft not published]
                                                ┌───────────────────┐ min 168
                                                │ Turn on           │
                                                │ Turn off          │
                                                │───────────────────│ role=separator
                                                │ View monitoring   │
                                                └───────────────────┘
```

- Trigger title (existing): "Change status".
- Menu `aria-label` (existing): "Status of {name}".

### 3.3 Confirmations

These are the existing kit `Modal` confirms at width 480. They are not slider pages, because they are confirmations, not configuration.

| # | Title | Body | Buttons |
|---|---|---|---|
| M1 Active → Monitoring | Switch {name} to monitoring? | It stops deciding sign-ins to {apps} and records what it would decide. | Cancel (ghost) · Monitor (brand) |
| M2 Inactive → Monitoring, with unsaved edits or a saved draft | Monitor {name}? | Sign-ins to {apps} don't change. Then either "Your unsaved changes are not included." or "Your saved draft is not included." | Cancel · Monitor (brand) |
| M3 Monitoring → Active, until the guard exists | Turn on {name}? | It starts deciding sign-ins to {apps}. Then a second paragraph: `[Sample]` badge + the plan line (§3.4) | Cancel · Turn on (brand) |
| Blocker | Can't monitor {name} | Assign an application first. | Close · Assign applications (brand) |

- `{apps}` uses the existing `appsPhrase` in `use-status-change.tsx`.
- While editing that file, change "logins" to "sign-ins" in the two existing bodies ("It starts/stops deciding logins…"), so the new and old copy match.

### 3.4 Monitoring page (slider)

Kit `Drawer` at width **780** (the `work` step of `DIALOG_W`). Body padding is 20 px, so content is **740 px**. The scrim covers the rail and 140 px of page (200 + 140 + 780 = 1,120).

```
| rail 200 | page 140 (scrim) | Monitoring                                    [Sample]      [×] |
|          |                  | HRMS access from corporate offices                              |
|          |                  |─────────────────────────────────────────────────────────────────|
|          |                  | Sample sign-ins (i)                                             |
|          |                  | If turned on: 0 to allow on 1 factor, 3 to allow with 2FA,      |
|          |                  | 5 to deny, 4 unchanged.                                         |
|          |                  |┌Time 64┬Person 136──┬App 104┬From 120─────┬Today 124──────┬If turned on 164──────┬28┐
|          |                  |│Mon    │Kavya Menon │HRMS   │Pune, India  │Allow on       │(Would allow with 2FA)│⌄ │
|          |                  |│09:30  │Human Res…  │       │203.0.113.24 │1 factor       │In a corporate office │  │
|          |                  |│       │            │       │             │Global Default…│                      │  │
|          |                  |│Sun    │Priya Sharma│HRMS   │Pune, India  │Allow on…      │(Would deny)          │⌄ │
|          |                  |│19:20  │Finance     │       │192.0.2.10   │Global Default…│Nothing else matched  │  │
|          |                  |│…      │Aisha Khan  │…      │…            │…              │No change             │⌄ │
|          |                  |│       │Sales       │       │             │               │Not in audience       │  │
|          |                  |└───────┴────────────┴───────┴─────────────┴───────────────┴──────────────────────┴──┘
|          |                  | footer                                        [Turn off] [Turn on]|
```

**Head** (the `Drawer` `head` prop)
- h2 "Monitoring"; caption `{policy name}`.
- `Badge tone="neutral"` "Sample" beside the title.
- When `pendingDraft` exists, add `Badge tone="neutral"` "Saved draft not included".
- `Drawer title` (the `aria-label`): "Monitoring: {policy name}".

**Section**
- h3 "Sample sign-ins", then `TipDot` with label "About sample sign-ins" and text "Modelled on the sample directory. Real sign-ins need the backend."

**Plan line** (the only counts in the view)
- `If turned on: {a} to allow on 1 factor, {b} to allow with 2FA, {c} to deny, {d} unchanged.`
- When the can't-tell count is above zero, insert `, {e} can't tell` before the full stop. That fragment is grey.
- The "allow on 1 factor" count is always first, even at 0 (mirrors "Now allowed first").

**Table**
- `table.btable.bmon__table`, `table-layout: fixed`, a `<colgroup>` with the widths above, and `<caption class="u-sr-only">Sample sign-ins for {name}</caption>`.
- Headers: "Time", "Person", "Application", "From", "Today", "If turned on", and a sr-only "Details".

| Column | Line 1 (`--fs-sm`) | Line 2 (muted, `--fs-xs`) |
|---|---|---|
| Time | Weekday "Mon" | "09:30" |
| Person (`th scope=row`) | Name | Group name |
| Application | App name, ellipsis, `title` | — |
| From | Looked-up place "Pune, India", or "Place not found" | Address |
| Today | Decision words, plain text | Deciding policy name, ellipsis, `title` |
| If turned on | See below | See below |

"If turned on" cell:
- **Changed:** `Badge tone="info"` with `Would allow on 1 factor`, `Would allow with 2FA` or `Would deny`. Line 2 is the deciding rule name, or "Nothing else matched".
- **Unchanged:** muted "No change". Line 2 is "Not in audience", or "When on: {policy} applies first", or the policy's own `Would …` as text.
- **Can't tell:** grey "Can't tell". Line 2 lists both outcomes, for example "Deny or allow with 2FA".

**Row detail**
- The last column holds `IconButton` `ChevronDown` with label "Show why: {person}, {Mon 09:30}". It toggles a detail row (`td colSpan=7`, `--surface-sunken`) showing:
  - "Decided by" + rule name.
  - For each traced rule up to the one that decided: rule name and "Matched", "Missed" or "Off".
  - Under each rule, one line per condition: `{condition label}` · `{actual} · {required}` · "Passes", "Fails" or grey "Can't tell". These come straight from `ConditionResult.actual`, `.required` and `.status`; zone rows use `.zones[]`. Never reword them.
  - Unknowns add "Needs: {fact names}" from `ConditionResult.missing`.
  - Out-of-audience rows show one line: the standing reason ("Not in audience: Human Resources, Finance").
- **Row order:** changed rows (to 1 factor, then 2FA, then deny), then can't tell, then unchanged. Within each group, newest first.
- **Footer:** `Button variant="secondary"` "Turn off" and `Button variant="brand"` "Turn on". This is the only orange on the page.

**States**
| State | What shows |
|---|---|
| Result | As drawn above |
| Loading | None drawn. Twelve rows × 2 resolutions is synchronous and under 10 ms, so a skeleton would only flash. |
| Empty | Sample has 0 rows: `EmptyState compact` with icon `Eye`, title "No sample sign-ins", blurb "Nobody in the sample directory signs in to {apps}." |
| Unknown facts | Can't-tell cells as above, and the plan line gains ", {e} can't tell". |
| Error | The resolver returns `incomplete` (no Global Default): the Today cell reads grey "No policy decides", and the row buckets by the "If turned on" decision. |
| Status leaves monitoring, or policy deleted | The page closes. |

### 3.5 Try a sign-in (Phase 1)

Built from `TenantResolution.standings` and `.watching`.

**"Which policy" stage.** A `'monitoring'` standing row shows:
- Policy name, the Monitoring `StatusPill`, then `Badge tone="info"` with the `Would …` word, or grey "Can't tell · deny or allow with 2FA".
- When `!wouldDecide`, a muted "When on: {yieldsTo.policyName} applies first".
- It is **not** struck through (it did not lose; it is only recording). The blue marker never enters a monitored row.

**"Decision" stage.** Under the real decision, one line per watched result where `wouldDecide` is true and the decision differs: `{policy name}` + info Badge `Would deny`.

**Version table** (adds rows to p1's table):

| Policy state | Left column | Right column | What goes live |
|---|---|---|---|
| Monitoring, no edits | Today (Global Default decides; this policy under watching) | If turned on (stored, as `substitute` with status active) | Turn on activates the stored version |
| Monitoring, unsaved edits | Today | Your edits | Save keeps monitoring with your edits. Turn on offers "with your edits" or "stored version". |

### 3.6 Policy testing page (Phase 2, all three variants)

- **Policy list per app:** same row anatomy as §3.5.
- **Check a person:** under the Decision cell, a muted line "Monitoring: {name} would deny" when a watched result would decide differently.
- No variant-specific behaviour.

### 3.7 Before turning on (Phase 3 guard)

- **From Monitoring:** a section h3 "While monitoring", with the `[Sample]` badge + plan line + a text button "View monitoring". The button closes the guard and opens the Monitoring page.
- **From Inactive:** the footer gains a secondary "Monitor instead", which calls `setPolicyStatus(id, 'monitor')` and shows the toast with Undo.

### 3.8 Applications page

- `app-policies.summarise` shows the tag "Monitoring" for an app whose only policy is monitoring.
- `whyNotDeciding` returns "Monitoring. It decides no sign-ins."
- `orderOf` gives no precedence number, because `decidesFor` is false.

### 3.9 All new strings (sentence case)

| Where | Strings |
|---|---|
| Pill | "Monitoring"; `title` "Checks sign-ins. Enforces nothing." |
| Filter | "Monitoring" |
| Menus | "Monitor", "View monitoring" |
| Toasts | "{name} is monitoring"; "{name} is off"; action labels "Undo", "Monitor" |
| Monitoring page | "Monitoring", "Sample", "Saved draft not included", "Sample sign-ins", "If turned on", "Would allow on 1 factor", "Would allow with 2FA", "Would deny", "No change", "Not in audience", "When on: {x} applies first", "Can't tell", "Place not found", "No policy decides", "Decided by", "Matched", "Missed", "Off", "Passes", "Fails", "Needs:" |
| Resolver reasons | "Monitoring: would allow on 1 factor"; "Monitoring: would allow with 2FA"; "Monitoring: would deny"; "Monitoring: can't tell (deny or allow with 2FA)" |
| Status reasons | "Monitoring. It decides no sign-ins."; attach note "{name} is monitoring, so nothing changes for users yet."; assign toast suffix "It is monitoring."; app pane and details note "With no applications this policy becomes a draft and stops monitoring." |

None of these use "gauntlet", "blast radius", "rehearse" or "try a login".

---

## 4. Components

### 4.1 Reused (verified in the tree)

- `Drawer` (the slider page), `Modal`, `Button`, `IconButton`, `Badge` (tones `info` and `neutral`), `StatusPill`, `TipDot`, `RowMenu` and `MenuItem` (`divide`): all in `src/brand/kit.tsx`.
- `EmptyState`: `src/brand/empty.tsx`.
- `Picker` (Status filter): `src/brand/picker.tsx`.
- `useStatusChange` (`screens/use-status-change.tsx`), `StatusControl` (`screens/status-control.tsx`), `statusOptions` and `portalRoot` (`screens/status-options.ts`).
- `resolveSignIn`, `governingPolicy`, `audienceNames` and `envOf`: `screens/tenant-resolver.ts`.
- `tracePolicy`, `personOf`, and the `ConditionResult`, `PolicyTrace`, `PossibleOutcome` and `SignInFacts` types: `screens/simulate.ts`, re-exporting `screens/sign-in-facts.ts`.
- `CHIP_DEVICES` and `TENANT_TZ`: `screens/sign-in-facts.ts`.
- `GEO_FIXTURE` and `lookUpAddress`: `screens/geo-fixture.ts`.
- `appsOf`, `enforces`, `FALLBACK_NAME` and the `AccessDecision` type: `data.ts`.
- `DialogClose` focus behaviour comes via `useDialogChrome` in `src/brand/dialog-chrome.ts`.
- Do **not** reuse `DecisionChip` (it prints "Allow", "MFA", "Deny") or `DECISION_LABEL` ("1 factor", "2 factors"). Both break the decision vocabulary.

### 4.2 New files

| File | Contents |
|---|---|
| `src/brand/screens/decision-words.ts` | `DECISION_WORD` (`'1fa'` "Allow on 1 factor", `'2fa'` "Allow with 2FA", deny "Deny"), `DECISION_PHRASE` (the lower-case forms), `WOULD_WORD` ("Would allow on 1 factor", "Would allow with 2FA", "Would deny"). If Spec A has already added `DECISION_WORD`, import it instead. |
| `src/brand/screens/monitor-sample.ts` | Sample generator, row derivation, plan (§5.3) |
| `src/brand/screens/monitor-sample.test.ts` | §5.5 |
| `src/brand/screens/monitoring-page.tsx` | `useMonitoringPage(): { open(policyId: string): void; page: ReactNode }` and the internal `MonitoringPage` |
| `src/brand/screens/monitoring-page.css` | `.bmon__*`. No `transform` on any element framer animates. |
| `src/brand/screens/watching-line.tsx` | `WatchingBadge({ watched })`, the standing badge used by §3.5 and §3.6 |
| `src/brand/monitor.test.ts` | Restores the enforce-versus-evaluate pins (§5.5) |

### 4.3 Every file that must learn the status

| File | Change |
|---|---|
| `data.ts` | `PolicyStatus` gains `'monitor'`. `POLICY_STATUSES = ['draft','active','monitor','inactive','always-on']`. `evaluates = (p) => enforces(p) \|\| p.status === 'monitor'`. Rewrite the comment at lines 12-17. `enforces` is unchanged. |
| `kit.tsx` `StatusPill` (line 690) | `if (status === 'monitor')` returns `<span className="bx-status bx-status--monitor" title="Checks sign-ins. Enforces nothing.">Monitoring</span>` |
| `kit.css` (after line 526) | `.bx-status--monitor` uses the shared pill geometry with `--fb-info-bg`, `--fb-info-fg` and a `--fb-info-border` border |
| `rebrand.css:350-353` | Add `.bx-status--monitor` to the transparent-border list |
| `edition.ts` | `Features.monitorMode`, true in `FULL` and `LITE` |
| `screens/status-options.ts` | `StatusTarget = 'active' \| 'inactive' \| 'monitor'`. `statusOptions(policy: Pick<Policy,'status'\|'isSystem'> & { type?: PolicyType }, opts?: { monitor?: boolean })` returns the order in §2.2. No Monitor for non-App-Access types or when `opts.monitor === false`. Drafts, always-on and system return `[]`. Labels: "Turn on", "Turn off", "Monitor". |
| `screens/use-status-change.tsx` | Accept `'monitor'`. Copy table §3.3. No-modal paths with Undo (§2.2). New option `unsaved?: boolean` for M2. M3 fallback line. Monitor blocker via `monitorBlocker`. "logins" → "sign-ins". |
| `screens/status-control.tsx` | New prop `unsaved?: boolean`, passed to the hook. Options from `statusOptions(policy, { monitor: store.features.monitorMode })`. When monitoring, a separator and "View monitoring" item. Renders `useMonitoringPage().page`. |
| `screens/board/BoardBar.tsx:207` | `<StatusControl policyId={policy.id} unsaved={unsaved} />` |
| `screens/board/BoardBuilder.tsx` `publish` (~line 862) | When `saved.status === 'draft' && next.status === 'inactive'` and `features.monitorMode`: `store.showToast(commitToast(saved, next), { label: 'Monitor', run: () => store.setPolicyStatus(next.id, 'monitor') })` |
| `screens/Policies.tsx` | `StatusFilter` + `'monitor'`; `STATUS_TABS` order §3.1. Filter predicate at line 212 also matches `'monitor'` by equality. `RowAction` + `'monitor' \| 'monitoring'`. `policyMenu` icons: `Eye` for monitor and for View monitoring. `act` routes `'monitor'` to `statusChange.request` and `'monitoring'` to `monitoring.open`. The `AssignAppsDialog` `why` (line 762) gains the monitoring suffix. Mount `monitoring.page`. |
| `screens/tenant-resolver.ts` | §5.2 |
| `screens/app-policies.ts` | `whyNotDeciding` (line 81): monitor line. `summarise` word (line 269): 'Monitoring'. |
| `screens/applications-model.ts` `attachNote` (line 67) | Reason "is monitoring" |
| `screens/AppProtection.tsx:527` | `STATUS_WORD.monitor = 'Monitoring'`. Without it the exhaustive `Record` will not compile. |
| `screens/policy-details-review.ts:34` | `STATUS_WORD.monitor = 'Monitoring'` (same reason) |
| `screens/usage.ts:114` | `evaluates` → `enforces`. A monitored policy naming a deleted zone goes to `later`, not to "moves to draft… stops deciding sign-ins". |
| `screens/builder-dialogs.tsx:169`, `screens/board/AppsPane.tsx:109`, `screens/PolicyDetails.tsx:177` | `evaluates` → `enforces`, plus a monitor branch with the "stops monitoring" copy |
| `store.tsx:402` | Doc comment only ("on, off or to monitoring"). `setPolicyStatus` already refuses a non-draft status without apps and the system policy. |
| `screens/review-step.tsx:46,270` and `screens/PolicyBuilderMain.tsx:666` (trail, not showcase) | `onPublish` accepts `'monitor'`. A monitoring policy shows "Publish, keep monitoring" (secondary) + "Publish and turn on". |
| `policy-draft.ts` | Add `monitorBlocker(p)`: returns 'Assign an application first.' when there are no apps, otherwise null. **`committed()` needs no logic change**: it keeps the saved status of a published policy, so saving a monitoring policy stays monitoring. `commitToast` then gives "{name} saved". Pinned by a test. |
| Checked, no change | `screens/diagnostics.ts` (`diagnose` reads no status), `Coverage.tsx` (uses `enforces`, correct), `simulate.ts`, `gauntlet.ts`, `impact-arena.ts` (the sweep's resolver path excludes monitored policies automatically), `fixtures.ts`, `Shell.tsx` |

---

## 5. Data and state

### 5.1 Store and persistence

- The status lives on `Policy.status` in the store's in-memory `policies`. It lasts for the session and resets on reload or a persona switch, like all store data.
- No new store fields. No localStorage.
- Monitoring page state is local: which rows are expanded, reset on close.
- `SAMPLE_DAY` is a module constant `new Date()` captured once at import, so rows do not move between opens within a session.

### 5.2 Resolver (`screens/tenant-resolver.ts`)

```ts
export type StandingKind = /* existing */ | 'monitoring'

export interface WatchedResult {
  policyId: string
  policyName: string
  decision: AccessDecision | null        // set only when settled
  possible: PossibleOutcome[]
  status: 'decided' | 'depends'
  trace: PolicyTrace
  wouldDecide: boolean                   // turned on alone, it would decide this sign-in
  yieldsTo: PolicyRef | null             // who still decides when it is on, if not itself
}

export interface Governing { decider; standings; missing; watched: Policy[]; list: Policy[] }  // + watched, list
```

**`governingPolicy` loop**, with `monitoring = p !== sub && p.status === 'monitor'`:
1. `not-app-access` when the type is not App Access.
2. Otherwise, when `!live && !monitoring`: draft or inactive, as today.
3. Otherwise, `other-app` when it does not cover the app.
4. Otherwise, `not-in-audience` for a custom-tier policy whose audience excludes the person.
5. Otherwise, when `monitoring`, push to `watched` (only once app and person are known).
6. Otherwise, a candidate.

In the `ordered` pass, a watched id gets `{ kind: 'monitoring', reason: 'Monitoring' }`. Handle this before the non-null `why.get(p.id)!`, or it crashes. A monitored policy is never a candidate, so it never decides.

**`resolveSignIn`**
- `watching = g.decider ? g.watched.map(watch) : []`.
- `watch(p)`:
  - `trace = tracePolicy(p, facts, env)`.
  - `on = governingPolicy(g.list, facts, env, { substitute: { ...p, status: 'active' } }).decider`. Using `g.list` keeps any primary `opts.substitute`.
  - `wouldDecide = on?.id === p.id`; `yieldsTo = !wouldDecide && on ? refOf(on) : null`.
- Then rewrite that policy's standing reason:
  - Settled: `Monitoring: would ${DECISION_PHRASE[decision]}`.
  - Otherwise: `Monitoring: can't tell (${distinct decisions as phrases joined ' or '})`.
- Two monitored policies are each assessed as if only that one were turned on.
- Replace the comments that say "[] in this phase, by contract".

### 5.3 Sample sign-ins (`screens/monitor-sample.ts`)

```ts
export interface SampleOrigin { address: string; time: string; device: keyof typeof CHIP_DEVICES; risk: number }
export const SAMPLE_ORIGINS: readonly SampleOrigin[] = [
  { address: '203.0.113.24',  time: '09:30', device: 'Managed (MDM)',       risk: 12 },
  { address: '192.0.2.10',    time: '19:20', device: 'Known < 90 days',     risk: 12 },
  { address: '198.51.100.20', time: '10:05', device: 'Known < 90 days',     risk: 12 },
  { address: '192.0.2.200',   time: '14:10', device: 'Known > 90 days',     risk: 12 },
  { address: '192.0.2.130',   time: '23:05', device: 'New / unknown',       risk: 48 },
  { address: '192.0.2.66',    time: '02:40', device: 'New / unknown',       risk: 86 },
  { address: '192.0.2.82',    time: '11:20', device: 'Changed fingerprint', risk: 48 },
  { address: '2001:db8:1::20',time: '08:10', device: 'Known < 90 days',     risk: 12 },
]
export interface SampleSignIn { id: string; facts: SignInFacts; day: string; time: string; personName: string; groupName: string; appName: string; place: string | null; address: string }
export type Change = 'to-1fa' | 'to-2fa' | 'to-deny' | 'unchanged' | 'cant-tell'
export interface SampleRow { sample: SampleSignIn; today: TenantResolution; ifOn: TenantResolution; change: Change; standing: PolicyStanding }
export interface MonitorPlan { to1fa: number; to2fa: number; toDeny: number; unchanged: number; cantTell: number }
export function sampleSignIns(policy: Policy, env: SimEnv, apps: readonly App[], today: Date): SampleSignIn[]
export function monitorRows(policy: Policy, policies: readonly Policy[], env: SimEnv, sample: SampleSignIn[]): SampleRow[]
export function planOf(rows: SampleRow[]): MonitorPlan
export function planLine(plan: MonitorPlan): string
```

Every address is a `GEO_FIXTURE` block (RFC 5737/3849).

**Pool**, from `env.library.people` and `groups`, deterministic:
- Insiders:
  - Audience is everyone: the first member of each group, in tenant group order, up to 4.
  - Otherwise: round-robin over `audience.groupIds` in order, taking the next unused member in directory order, then `audience.userIds`, up to 4.
- Outsiders (only when not everyone): the first member of each of the first 2 tenant groups that are outside the audience and have members.
- Pool = insiders, then outsiders.

**Rows** (12). Row `i` uses:
- Person `pool[i % pool.length]`, origin `SAMPLE_ORIGINS[i % 8]`, app `policy.appIds[i % n]`.
- Date: `today` minus `(i % 7) + 1` days, formatted YYYY-MM-DD.
- Facts:
  - `network = { address, source: 'stated' }`. Location is left unset so it is looked up.
  - `when = { date, time, timeZone: TENANT_TZ, source: 'stated' }`.
  - `device = { ...CHIP_DEVICES[d], source: 'stated' }`.
  - `risk = { score, source: 'stated' }`.
  - `appId`, `personId`.

**Derivation**
- `today = resolveSignIn(policies, facts, env)`.
- `ifOn = resolveSignIn(policies, facts, env, { substitute: { ...policy, status: 'active' } })`.
- `change`:
  - `cant-tell` when either side is not decided and the two sets of possible decisions differ.
  - `unchanged` when the decisions are equal.
  - Otherwise, by `ifOn.decision`.
- `standing` is this policy's standing in `ifOn`.
- Memoise on `[policy, store.policies, env]`.
- Build `env` the way `board/BoardBuilder.tsx` (~345-360) does, including `library`. If Spec A or B has added a shared env hook, use it.

**`planLine`**: `If turned on: ${to1fa} to allow on 1 factor, ${to2fa} to allow with 2FA, ${toDeny} to deny, ${unchanged} unchanged${cantTell ? `, ${cantTell} can't tell` : ''}.`

**Expected on the showcase** for `sc-hrms-office` while monitoring:
- Pool: Kavya, Priya, Neha, Rohan, then 2 outsiders.
- Plan line: `If turned on: 0 to allow on 1 factor, 3 to allow with 2FA, 5 to deny, 4 unchanged.`
- Today is "Allow on 1 factor · Global Default Policy" on all 12 rows.
- The office rows (203.0.113.24 twice, 198.51.100.20) are 2FA. Home Pune IPv4 and IPv6, London and the proxy are Deny.

### 5.4 Selectors

- Policies filter: `p.status === 'monitor'`.
- Page open condition: `policy?.status === 'monitor'`, otherwise close.

### 5.5 Tests

| Test file | What it pins |
|---|---|
| `monitor.test.ts` | `enforces(monitor) === false`; `evaluates(monitor) === true`; for every other status `evaluates === enforces`; `POLICY_STATUSES` order |
| `ids.test.ts:33` | Update to allow the monitor difference |
| `status-options.test.ts` | Replace "never offers a monitor switch" (lines 17-21) with the §2.2 order table. No Monitor for Session, for `opts.monitor === false`, for draft, for always-on, or for system. |
| `tenant-resolver.test.ts` | Rename "always watches nothing" (line 146) to "watches nothing when no policy is monitoring". Add: HRMS monitoring gives Kavya office → `decidedBy` global-default, `'1fa'`; standing `{kind:'monitoring', reason:'Monitoring: would allow with 2FA'}`; `watching[0]` `{decision:'2fa', wouldDecide:true}`. Aisha → HRMS `not-in-audience`, `watching` `[]`. A monitored DEFAULT-group HRMS policy beside the active custom one → `wouldDecide:false`, `yieldsTo` `sc-hrms-office`. `substitute` of the monitored policy → it decides and `watching` is `[]`. Incomplete → `watching` `[]`. Standings still in list order. |
| `showcase-evaluator.test.ts:75` | Unchanged (the seed has no monitoring policy) |
| `monitor-sample.test.ts` | Pool order; 12 rows; every address inside `GEO_FIXTURE`; deterministic for a fixed `today`; the HRMS plan line exactly; can't-tell bucket from a policy with a date-free day rule |
| `app-policies.test.ts` | `whyNotDeciding` monitor; `decidesFor(monitor)` false; `summarise` tag |
| `applications-model.test.ts` | `attachNote` monitor |
| `usage.test.ts` | A monitored policy goes to `later` |
| `policy-draft.test.ts` | `committed(monitorSaved, draft)` keeps `'monitor'`; `monitorBlocker` |

Also add the new files to the Phase 2 `ui-copy.test.ts` if it exists.

---

## 6. Motion

All motion uses opacity or height only. Monitoring elements get no CSS `transform`, because framer animates them (the known trap). Every duration is under 1.6 s. No monitoring motion runs while typing: the Monitoring page has no inputs, and Try a sign-in recomputes without motion while typing.

| Element | Motion | Why | Reduced motion (`useReducedMotion`; `MotionConfig reducedMotion="user"` in `BrandApp.tsx:162` only stops transforms) |
|---|---|---|---|
| Status pill after a change (Policies row, `StatusControl`) | Pill keyed by status, opacity cross-fade 160 ms, ease [0.2,0,0,1] | Shows the state changed in place | Instant |
| Monitoring page open | Kit `Drawer` spring, as-is | Existing | Kit behaviour |
| "If turned on" pills | Opacity 0→1, 200 ms, 160 ms delay, once per open | Today reads first, then the change | Shown at once |
| Row detail | Height 0→auto + opacity, 180 ms | Links the reason to its row | Instant |
| Try a sign-in monitoring line and badges | Opacity 120 ms, after the marker settles on Decision. The marker never visits a monitored row. | Reads as a note after the real decision | Shown with the final state |

---

## 7. Accessibility

**Status control and row menu.** Use the existing menubutton pattern (arrows, Home, End, Escape, Tab). The separator before "View monitoring" is `role="separator"`. After a change, focus returns to the trigger. The toast announces the result, and the Undo action is reachable by keyboard (existing toast).

**Monitoring page**
- `Drawer` gives `role="dialog"`, `aria-modal`, a focus trap, Escape to close and focus return (through `useDialogChrome`). `aria-label` is "Monitoring: {name}".
- Focus order: panel → Sample `TipDot` → Close → each row's "Show why" button in row order → Turn off → Turn on.
- Table: `<caption>`, `th scope="col"`, the Person cell `th scope="row"`.
- The disclosure has `aria-expanded` and `aria-controls` pointing at the detail row id, and toggles with Enter or Space.
- Meaning never rests on colour alone: every pill carries its words, and "Can't tell" is words in grey.
- The plan line is static text with no `aria-live`, because it does not change while open.

**Try a sign-in.** The single per-run announcement is extended, for example: "Decision: Allow on 1 factor, by Global Default Policy. Monitoring: HRMS access from corporate offices would allow with 2FA."

**Contrast.** `--fb-info-fg` on `--fb-info-bg` (rebrand #0a58ca on #e7f1ff) meets AA for 12 px / 500.

---

## 8. Acceptance checks (showcase tenant, light, 1,120 px)

1. Policies → Status filter lists All, Active, Monitoring, Draft, Inactive, with no counts.
2. The Global Default row menu has no Monitor. The pill of a new "Untitled policy" draft is plain, with no menu.
3. HRMS access from corporate offices (Active) → the row menu reads Edit policy, Monitor, Turn off, Save as template, Duplicate, Delete policy.
   - Monitor opens "Switch HRMS access from corporate offices to monitoring?" with Cancel and an orange Monitor.
   - Confirming makes the pill a blue "Monitoring" and shows the toast "HRMS access from corporate offices is monitoring".
   - The footer drops by one ("4 policies deciding sign-ins").
4. Filter Monitoring → only HRMS. The row menu reads Edit policy, Turn on, Turn off, View monitoring, …
5. View monitoring → a 780 px slider from the right edge.
   - Title "Monitoring", caption the policy name, "Sample" badge.
   - "Sample sign-ins" with an info tip.
   - Plan line exactly `If turned on: 0 to allow on 1 factor, 3 to allow with 2FA, 5 to deny, 4 unchanged.`
   - 12 rows: 3 blue "Would allow with 2FA", then 5 blue "Would deny", then 4 "No change" (2 read "Not in audience").
   - Every Today cell reads "Allow on 1 factor" over "Global Default Policy".
6. Expand the 192.0.2.10 row → "Decided by Nothing else matched", the Corporate offices zone line showing the network half failing for 192.0.2.10 and the location passing ("Pune (looked up)"), and "Fails". The wording comes from the evaluator.
7. The only orange in the slider is Turn on. The pills are blue. The expanded row is grey. There are no dots and no counts outside the plan line.
8. Turn off in the slider → no modal. The slider closes and the toast "… is off" has Undo. Undo → back to Monitoring.
9. Turn on (row menu) → Before turning on with "While monitoring" and the same plan line. If the guard is not built yet, the M3 modal appears with the Sample badge and plan line. Confirming makes it Active and shows "… is on".
10. Board: open HRMS while monitoring → the status menu reads Turn on, Turn off, a separator, View monitoring. View monitoring opens the same slider over the board.
11. Board: make an unsaved edit on an Inactive policy → Monitor from the pill shows modal M2 with "Your unsaved changes are not included."
12. New policy → assign HRMS → Save policy → toast "Untitled policy saved. It is off." with a Monitor action → click it → the pill reads "Monitoring".
13. Applications page → HRMS shows "Monitoring", and its tip reads "Monitoring. It decides no sign-ins."
14. Try a sign-in (when Phase 1 lands): Kavya, HRMS, 203.0.113.24 with HRMS monitoring → Decision "Allow on 1 factor" by Global Default. HRMS is listed with the Monitoring pill and "Would allow with 2FA", not struck through, and the marker skips it.
15. Reduced motion on → identical content with no fades. Keyboard only: open the row menu, Enter on View monitoring, focus lands in the slider, Escape closes it, and focus returns to the kebab.
16. `npm test`, `npx oxlint` at or under the branch baseline, and `npm run build` are all clean. Confirm which worktree owns localhost:5173 before the browser pass.

---

## 9. Open questions for the owner

1. **Pill word: Monitoring, Monitor or Report-only?**
   - Recommend **Monitoring**. Status pills are state words (Active, Inactive), and JumpCloud and Google say "Monitor mode".
2. **Decision words in the Monitoring view.** The brief says "Would ask for 2FA", but the owner's vocabulary is "Allow with 2FA".
   - Recommend **"Would allow on 1 factor / Would allow with 2FA / Would deny"**, so the console keeps one vocabulary.
3. **Draft → Monitoring directly from the draft pill,** or Save first with the toast action?
   - Recommend **Save first**. A draft leaves draft only through Save, and it guarantees the monitored version is the one on screen.
4. **Status changes with no user impact (Inactive ↔ Monitoring):** Undo toast or confirm modal? Today Turn on and Turn off always confirm.
   - Recommend **an Undo toast**, which matches "interrupt only when it matters".
5. **Active → Monitoring is effectively Turn off.** For HRMS it newly allows 5 of the sample sign-ins on 1 factor. Should it get the guard's "Now allowed" rows?
   - Recommend **a plain confirm now**, matching Turn off, and deciding both together in the guard spec.
6. **Seed a policy already in Monitoring** in `showcase-seed.ts`, or show the switch live on HRMS?
   - Recommend **no seed change**. The switch is the demo beat, and the four-policy seed stays as the owner set it on 24 Sep.