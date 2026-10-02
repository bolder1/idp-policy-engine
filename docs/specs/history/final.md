# Policy testing, Monitor and guards: final specs (25 Sep owner decisions applied)

Read-only pass. Nothing in the worktree was changed. Everything below was checked against the uncommitted Phase 0 tree at `C:\New folder\IDP Policy Engine\.claude\worktrees\kind-heyrovsky-5ec74e`.

**How to read this document**
- Each "final" spec is its draft (A to D, as the workflow supplied them) with every change listed here applied. Where this document and a draft disagree, this document wins.
- A section marked **as drafted** carries over word for word.
- Every cross-check resolution and every rule-violation fix is applied. Owner questions were decided by taking the recommendation, and each one is recorded under Assumptions.

**Code facts checked in this pass (file:line)**
- **Store and shell**
  - `store.tsx:722` is `features: featuresOf(edition),`.
  - Edition is `'lite'` (`store.tsx:632`).
  - `Shell.tsx:221` declares `BUILDER_SCREENS = ['builder','board']`, and `Shell.tsx:323` collapses the rail on them.
  - `PageHead` (`Shell.tsx:659`) takes only title, caption, docs, preview and headRef. There is no `action` prop.
- **Resolver and engine**
  - `WatchedResult` (`tenant-resolver.ts:52`) has only policyId, policyName, decision and possible.
  - `decide` is at `simulate.ts:898`.
  - In `gauntlet.ts`: `proposeFix(round: Round, …)` is at `:575`, `namesMissing` is private at `:557`, `BreakInCounts` is at `:847` and `runBreakIn` is at `:1121`.
- **Types**
  - `ChangeTone` (`change-list.tsx:35`) is `'added'|'changed'|'removed'|'effect'`.
  - `FaceKind` is `'group'|'user'`.
  - Every `CHIP_DEVICES` entry carries `source: 'assumed'`.
- **Presets and people**
  - `Managed (MDM)` is Windows 10.0.22631 with agent 4.3, registered. `Changed fingerprint` is the same device but not registered. `Known > 90 days` is Windows 10. `Known < 90 days` is the iPhone on iOS 17.5. These match Spec A's preset facts exactly.
  - `u-exec-2` is Vikram Nair (`data.ts:1069`, executives).
  - `203.0.113.24` and `.25` both fall in the fixture block `203.0.113.0/24` (Pune, AS64500), so moving the office address to .24 changes no computed result.
- **Tokens**
  - Base: `--text-tertiary` #5A6775, `--text-muted` #93a2b0.
  - Rebrand: #5c636a and #646c75.
  - `--blue` and `--blue-soft` exist only in `rebrand.css:64-67`.
  - `--accent` is #4a5560 in the base theme (`console-theme.css:193`) and #0d6efd in the rebrand.
- **Kit**
  - `DIALOG_W = { confirm 480, form 560, wide 680, work 780, full 980 }`. `Drawer` defaults to `maxWidth 900`.
  - `ButtonVariant` includes `secondary`, which is styled as neutral. `Button` has no `pressed` or `keys` prop.
  - `EmptyState.blurb` is a required string.
  - `PickerOption` has `meta`, `icon`, `art`, `group` and `disabled`.
  - `ConfirmDelete` asks for the typed word only when the policy has live uses.
  - The board grid is `min(var(--bb-insp), 46%)` at `board.css:104`.
- **Remaining references**
  - `GAPS` is read by no `.tsx` file.
  - Every icon named here exists in lucide: LogIn, Radar, UserSearch, BookmarkCheck, BookmarkPlus, StepBack, StepForward, ShieldAlert and FlaskConical.
- **"login" copy.** The word appears in more places than the cross-check listed:
  - `Board.tsx:609`
  - `predicate-prose.ts:165/274/275`, plus its test at `:85/:87`
  - `WhenEditor.tsx:296`, `overview.tsx:45/49`, `rule-form.tsx:830` and `template-from-policy.ts:57`
  - `data.ts:3741` (a template's `ifText`)
  - `use-status-change.tsx:132-133`
  - `tour/tutorials.ts:153`
  - Changed in M1–M2 beside the new "stops monitoring" notes, recorded here so every rendered-copy change is in one list:
    - `board/AppsPane.tsx:75`, the Applications panel lede: "Sign-ins to these applications are decided by this policy’s rules." (was "Logins to …").
    - `board/AppsPane.tsx:43` and `PolicyDetails.tsx:168`, the system-policy note: "It decides sign-ins no other policy matches." (was "logins").
    - `board/AppsPane.tsx:110`, `PolicyDetails.tsx:178` and `builder-dialogs.tsx:170`, the no-applications note: "… and stops deciding sign-ins." (was "logins").
    - The switch confirmations' words now live in `screens/status-options.ts` (`statusConfirmCopy`), which `ui-copy.test.ts` scans with the rest.
  - Still says "login", not yet in the pass: `builder-test.tsx`, the decision log's empty state "No logins yet" (trail, not showcase).

---

## Assumptions (owner can overturn)

Every item below is reversible. Items 1 to 23 are the owner questions, answered with the recommendation. Items 24 onwards are design-lead calls made while merging the specs.

1. **Monitor vocabulary.**
   - The pill says **Monitoring**. The menu verb is **Monitor**.
   - The secondary button in Before turning on is **Monitor instead**. "Report only" is dropped.
   - A standing row uses the same Monitoring pill.
   - Icons: `Radar` for Monitor, `Eye` only for View monitoring.
2. **Turn off and Active → Monitoring** follow the Save rule. A guard page opens only when someone is newly allowed; otherwise the existing one-line confirm shows. These pages inform and never block (item 24).
3. **Before saving on an Active or Always-on policy** opens only for a blocking check or someone newly allowed. "Newly allowed" means any of:
   - What changes reports Now allowed above 0;
   - a saved sign-in goes from Deny to an allow;
   - Break-in Got through rises.

   Can't-tell items are listed when the page opens for another reason, but never open it.
4. **"Now on 1 factor"** is added to What changes after Now allowed. It is not a trigger.
5. **Break-in rounds outside the four counts** ("Less than asked", "Can't tell") are listed under their own headings, with no count cell.
6. **Must pass versus Protected.**
   - Must pass can be overridden from the guard with "Expect {Decision} instead" plus a reason. Protected never can.
   - Both can be edited or deleted in Saved sign-ins. Deleting a Protected one needs the typed DELETE confirmation.
7. **The Full-only board pips (Check and What changes) are removed.** Full reaches both from ⌘K ("Open Check", "Open What changes") until M4 deletes them.
8. **The HRMS seed state** stays Active through Phases 1 to 3. See Still-open.
9. **One decision vocabulary everywhere, done in one copy pass after the testing version is chosen.**
   - Testing surfaces use the three phrases from day one.
   - The would-forms are "Would allow on 1 factor", "Would allow with 2FA" and "Would deny".
   - `DecisionChip` and `DECISION_LABEL` stay as they are until that pass.
10. **The testing version switch** sits in the Policies head's preview slot, and in the Policy testing page head. It defaults to Version 1, the rail page.
11. **V2** is a modal kit `Drawer` at 780 px with a scrim.
12. **The testing views tabs** are grey pill `Tabs`, with a greyscale selection.
13. **Device risk score** shows when a device-risk condition is read. On Windows and macOS its TipDot reads "Risk signals are collected on Android and iOS only".
14. **Try defaults to today** (Asia/Kolkata, 09:30). Samples and saved sign-ins keep their stated 28 Sep 2026 date.
15. **The distance ruler names a stated place**, for example "30 km from Pune", with the source word "stated".
16. **"Would change if" never suggests loosening.**
17. **A sign-in fact or threshold may appear twice in one view:** once in its control and once in the "actual · required" line. Counts stay strict.
18. **Rule editing in test mode stays at 480 px.**
19. **Before turning on defaults to "With your edits".**
20. **The weaker-factor fix is offered now.** Factor readiness is added to its preview when What changes ships it.
21. **Draft → Monitoring** goes through Save first, then the toast action "Monitor".
22. **Inactive ↔ Monitoring** uses an Undo toast, with no confirm.
23. **"Use" on a risk profile** goes through Review changes, with Also changes rows (D3).
24. **Turn-off and to-monitoring guard pages never block**, even for Must pass or Protected. The primary button is always enabled, so an admin can still switch a policy off during an incident.
25. **`EmptyState.blurb` becomes optional** (kit change in F): the `<p>` renders only when a blurb is given. The testing states use a title only, plus an action where one follows. This is how the "no explanatory sentences" fix is carried out.
26. **Strike-through in Which policy** applies only to enforcing policies that cover the app and lost:
    - `not-in-audience`
    - `default-group-yields`
    - `same-app-and-group`

    Inactive and Draft rows are plain secondary text with their reason. Monitoring rows are never struck through.
27. **One evidence vocabulary** for every surface (board cards, list Rules stage, Monitoring detail rows).
    - Rule words: Matched, No match, Can't tell, Switched off, Not reached.
    - Condition words: Passes, Fails, Can't tell.
    - A zone condition prints two lines, labelled **Network** and **Place**. The draft's "Location" is renamed to match the field label.
28. **One `WhatTheySee` component** (Spec A's `screensOf` and `SignInScreen`) serves the board and V1/V2. In V1/V2 it is a disclosure that starts collapsed.
29. **"Save sign-in" also sits in the board panel header**, in every version. Saved sign-ins drive the guard, which is on in Lite, so the board must be able to save one even when `policyTesting` is off.
30. **V1/V2 show every sign-in field except Distance.** Distance needs a range to measure from, so it renders only when a zone with ranges is read on the chosen app.
31. **The risk control is a number input** (empty means "Not stated"). A range slider with printed boundary ticks and band labels appears once a value is stated. Board test mode starts at 12, so the board shows the slider at once.
32. **Address wording.** The label is "IP address", the placeholder "IPv4 or IPv6 address", and the error "Enter an IPv4 or IPv6 address". The looked-up place shows in the Place row only, not as a second hint under the address.
33. **Break-in is reached through the testing session** (`session.openBreakIn(policyId)`), not a new route field.
34. **V3 stays disabled until B V3 ships**, through a module constant `BOARD_VERSION_READY` in `testing-version.ts`. It is not tied to `features.trySignIn`.
35. **Overriding a Must pass** writes `expected`, `reason`, `changedBy` and `changedAt` onto the saved sign-in.
36. **Protected rows stay editable in Saved sign-ins**, per item 6. The only guard on them is the typed DELETE when deleting.
37. **The `ui-copy` test scans string literals, template literals and JSX text only**, with import specifiers and comments stripped. The route id `'gauntlet'` is allowlisted. A comment-inclusive scan would fail on `import … from './gauntlet'` and on the `LogIn` icon name.
38. **The Monitoring Today column uses `DecisionBadge`.** "Would …" cells use info badges.
39. **`hopMs` is Spec A's timing** everywhere: at most 180 ms a hop and 1.1 s in total. Board and list layouts share it.

---

## Build order (with dependencies)

Estimates are one-developer days.

| Step | Scope | Days | Needs |
|---|---|---|---|
| **F. Foundations** | See the list below | 2 | Phase 0 |
| **M1–M2. Monitor status and `watching`** | Spec C §4.3 and §5.2. `StatusControl` gets its merged API. Monitoring → Active keeps the existing Turn on confirm until D2 | 2 | F |
| **S. Shared testing UI** | `SignInFields` (with a `rows` prop), `WhichPolicy` (`compact`), `WatchingBadge`, `DecisionBadge`/`CantTell`, `RouteMarker` (dot and bar), `evidence.ts`, `WhatTheySee` + `SignInScreen` + `screens-of.ts`, `rows-read.ts`, `boundaries.ts`, `SaveSignInForm` | 2.5 | F, M2 |
| **A. Try a sign-in (board test mode)** | Spec A final | 6.5 | S |
| **B core (V1 and V2)** | Spec B final, without V3 or Break-in | 5.5 | S. Runs in parallel with A |
| **D1. Break-in view** | Spec D final §D1 | 3 | B core (Saved view as host) |
| **D2. Guard** | Before saving (both kinds), Before turning on (with the While monitoring row and Monitor instead), Before turning off, Before switching to monitoring | 5.5 | F (saved sign-ins), D1 (gauntlet refactor, counts), M1 |
| **M3. Monitoring page** | Spec C §3.4. The guard's "View monitoring" link is wired once D2 and M3 are both in | 1.5 | M2 |
| **B V3** | Views tabs in A's panel shell, `WhichPolicy compact` in the Which policy gate, Break-in pushed in the panel | 2 | A, B core, D1 |
| **D3. Library guard** | Also changes rows for zones, device profiles and the risk profile in use, plus risk "Use" | 2 | D2 |
| **M4. Cleanup** | See the list below | 1 | all |

**F. Foundations: what goes in**
- **Shared modules**
  - `src/brand/decision-words.ts`.
  - `src/brand/decision-badge.tsx`.
  - `screens/sim-env.ts`. `BoardBuilder` (env at `:346`) and `gauntlet-dialog.tsx` switch to it.
- **Store and flags**
  - The merged `BrandScreen` union.
  - The five feature flags, with one showcase pin at `store.tsx:722`. `edition.test.ts` is updated once.
- **Kit and change list**
  - `Button` gains `pressed` and `keys`.
  - `EmptyState.blurb` becomes optional.
  - `ConfirmDelete` gains `requireTyped`.
  - `ChangeTone` gains `pass`, `fail` and `neutral`.
- **Copy**
  - `src/brand/ui-copy.test.ts`.
  - The login → sign-in pass over the full list in the code-facts section, with `predicate-prose.test.ts:85/87` updated.
- **Saved sign-ins**
  - `src/brand/saved-sign-ins.ts`, the store slice, and the seed (Spec B §5.4 plus Vikram).
- **Shared form**
  - `screens/testing/sign-in-form.ts`, `device-presets.ts` and `session.tsx` (`TestingSessionProvider`).

**M4. Cleanup: what goes in**
- Remaining C hooks.
- Delete `BoardSheet`, `CheckTab` and `ImpactTab`, and the ⌘K "Open Check" and "Open What changes" commands.
- Set `FULL.exposure = false`.
- Phase 4 reseed, if the Still-open question is decided.

**Paths and totals**
- One developer: about 33.5 days.
- Two developers after S:
  - Critical path: F → M2 → S → B core → D1 → D2 → D3 → M4, about 23.5 days.
  - A runs alongside, and B V3 follows A.

**Verification gate after every step**
- `npx vitest run` is green.
- `npx tsc -b` is clean.
- `npx oxlint` is at or below the branch baseline. Spec A counted 31; re-measure before F.
- `npm run build` is clean.
- A browser pass at 1,120 px, light, rebrand on. Measure the board with the rail both collapsed (64) and reopened (200).
- First confirm which worktree owns localhost:5173.

---

## SPEC A final: Try a sign-in (board test mode)

**Base:** the Spec A draft. **Changes:**

### A.1 Scope

- **In scope:** as drafted, with these changes:
  - Monitor standings render from day one, through `WhichPolicy` and `WatchingBadge`.
  - A "Save sign-in" button in the panel.
  - In V1/V2, a link to Saved sign-ins.
- **Out of scope:** as drafted, with these changes:
  - Saved sign-ins now exist (F). Only their library view is Spec B.
  - Monitor is no longer "read and ignored".
- **Flag:** `features.trySignIn` (Lite true, Full true).

### A.2 Entry points

| # | Entry | Change from draft |
|---|---|---|
| E1 | Bar button **Try a sign-in** (`LogIn`) | As drafted. It replaces `.bbtop__pips` (`BoardBar.tsx:287`) and the `bbtop__sep` after it. `data-tour="try-sign-in"` |
| E2 | Key **T** | As drafted |
| E3 | Row menu **Try a sign-in** (`LogIn`) | One item for every version, placed directly after Edit policy. The destination is `features.policyTesting ? testingVersion : 'board'`. For `'board'` it is `store.go({ name: 'board', policyId, open: 'try' })`. For page and slider, see Spec B §2.3 |
| E4 | ⌘K "Try a sign-in" (kbd T) | Full only. Also "Open Check" and "Open What changes" until M4 |

**Routing** (the single merged union in `store.tsx`, done in F):

```ts
| { name: 'board'; policyId: string; open?: 'gauntlet' | 'impact' | 'try' | 'break-in'; rule?: string }
| { name: 'policies'; testing?: TestingView }
| { name: 'policy-testing'; view?: TestingView }
```

- `BoardPage` passes `openTest={open === 'try' || open === 'break-in'}` and `openPage={open === 'break-in' ? 'break-in' : undefined}`. `open: 'break-in'` is only used in V3.
- `rule` seeds the selection (Spec B §2.2).

Leaving and inside test mode: as drafted.

### A.3 Geometry (corrected)

- **Default board.** The rail auto-collapses to 64 px, so content is 1,056 px.
  - `.bb.is-testing { grid-template-columns: minmax(0,1fr) 492px; --bb-card: 380px; }`
  - The chain column is **564 px** and the panel box is **480 px** (448 inner).
- **Rail reopened by the admin (200 px).** Content is 920 px and the chain is 428 px. 380 + 40 of fit padding is 420, which is at most 428, so zoom stays 1.0 with no horizontal scroll.
- `Board` gains `fitKey` and refits 220 ms after the key changes (as drafted).

### A.4 Panel shell (owns the inspector slot)

The component is `SignInPanel`. Top to bottom:

1. **Header** (44 px, `.bb__inspbar`)
   - h2 "Try a sign-in".
   - IconButtons: `BookmarkPlus` "Save sign-in", `RotateCcw` "Replay", `StepBack` "Back one stage", `StepForward` "Next stage", `X` "Close Try a sign-in".
2. **Optional views `Tabs`** (V3 only, Spec B), `name="Board test"`.
3. **Page stack**
   - The Try page is the root. In V3 the pushed pages are Check a person, Saved sign-ins and Break-in.
   - A pushed page shows a Back crumb with the name of the page below it.
   - The Inspector swap replaces the whole shell. "Back to Try a sign-in" restores the last page.
   - The Save sign-in form opens inline at the top of the Try page body, never as a modal.

**Try page body, in order**

1. `SignInFields rows={rowsRead(...)}`, with the rows as in the table below.
2. **Version columns**, 2 × 220 px (as drafted).
3. **Would change if** (as drafted).
4. **What they see** (the shared `WhatTheySee`, as drafted).
5. **In V1/V2 only, and only when `features.policyTesting`:** one link button, "Saved sign-ins" (`BookmarkCheck`), under the columns. It calls `session.load(boardForm)`, then navigates:
   - V1 goes to `{ name: 'policy-testing', view: 'saved' }`.
   - V2 goes to `{ name: 'policies', testing: 'saved' }`.
   - The draft leave guard applies.

**Rows** (grid 96 | 1fr | auto for the source word). Label strings follow `FACT_WORDS`:

| Label | Control | Source word |
|---|---|---|
| **Person** | As drafted: `Face kind="user"` art, groups "In this policy" and "Not in this policy", sub-label "Sample directory" | — |
| **Application** | As drafted | — |
| **From** | Chips "Office network", "Branch office", "Home broadband", "Tor exit" (`ORIGIN_PRESETS` in `sign-in-form.ts`) | — |
| **IP address** | Text input, placeholder "IPv4 or IPv6 address". Error "Enter an IPv4 or IPv6 address" | "typed" or "stated" |
| **Place** | `Picker`. First option "From IP address", summarised as "From IP address · Pune, India", "… · no place" or "… · not in the sample table". Then catalogue cities. Label TipDot "Sample address table, not geo-IP" | "looked up" or "stated" |
| **Distance** | As drafted. The stated label is "{km} km from {range}" | "stated" |
| **When** | As drafted | "stated" |
| **Device** | `Picker` over `DEVICE_PRESETS` (plus "Not stated"), and "Custom device" as the summary once a detail is edited. Ghost button "Edit details" / "Hide details". Detail rows: Platform, OS version, Device type, Integrity, Screen lock, miniOrange Authenticator, Device Agent, Registered to this person, Devices already registered (`NumberStepper` 0–10). In the board, detail rows follow the attributes of the profiles that are read | "stated" |
| **Device risk score** | Number input plus a range slider with ticks and band labels (Assumption 31). TipDot on Windows and macOS (Assumption 13) | "stated" |

**Defaults.** Stored per policy in `session.boardForms[policyId]`; nothing goes on `BrandStore`.
- **Person:** the first person in the directory from `audience.groupIds[0]`, else `audience.userIds[0]`, else the first person.
- **Application:** the first app of the policy, else the first app in the catalogue.
- **From:** origin `office` (203.0.113.24, source stated).
- **Place:** from address.
- **When:** today in `TENANT_TZ`, 09:30, Asia/Kolkata.
- **Device:** `win11-registered`.
- **Device risk score:** `'12'`.

### A.5 Version columns

`columnsFor` is as drafted, with Monitor rows added:

| `saved.status` | Edited | Left | Right | Call |
|---|---|---|---|---|
| `monitor` | no | **Today** | **Stored version** | Stored: `{ substitute: { ...saved, status: 'active' } }` |
| `monitor` | yes | **Today** | **Your edits** | `{ substitute: draft }` |

Column TipDots for the added rows:
- Today (monitoring): "Decides sign-ins now; this policy is monitoring".
- The other TipDots are as drafted.

"If turned on" is used only as the column header on the Monitoring page.

### A.6 Chain and gates

- **Which policy gate**
  - Value and word: "This policy" / "Decides", or the decider's name / "Not deciding".
  - The disclosure renders `<WhichPolicy compact resolution={…} appId={…} />`, using the strike-through rule in Assumption 26.
  - A monitoring row shows the Monitoring pill plus a `WatchingBadge`. It is never struck through, and the marker never enters it.
  - It is open by default only when this policy does not decide.
- **Who gate:** as drafted.
- **Start pill:** "A sign-in arrives at {app}" (F copy pass).
- **Decision gate**
  - `DecisionBadge`, then "{Policy name} · {rule line}".
  - **Always** "Changed by {field}" after an update that changed the decision. The field is a `FACT_WORDS` label, or "your edits".
  - Then one line per watched result whose `wouldDecide` is true and whose decision differs: "{policy name}" plus an info badge "Would …".
  - The Depends layout is as drafted, with "Needs: {FACT_WORDS, deduplicated}".
- **Card evidence:** produced by `evidence.ts` (Assumption 27).
  - A zone condition gives a **Network** line and a **Place** line.
  - A device profile gives "{profile} · {p} of {m} checks pass", plus one line for each check that fails or can't be told.
- **Grey text:** "Can't tell" and "Depends" use `--text-tertiary`. Nothing in these specs uses `--text-muted`.

**Marker.** `<RouteMarker variant="dot">` shared from S. It is the 12 px dot, blue `--accent` with an `--accent-soft` halo, and a hollow 2 px ring in `--text-tertiary` when the result is unknown. Timing uses `hopMs`.

### A.7 Model

**`screens/board/try-sign-in.ts`** keeps:
- `columnsFor`, `runColumns`, `routeOf`, `wouldChangeIf`, `INPUT_LABEL`.
- `ColumnSpec`, `RouteModel` and the chip types, as drafted, with `SignInInput` replaced by `SignInForm`.

**Moved to shared modules in S:**

| Function | New home |
|---|---|
| `rowsRead` | `screens/testing/rows-read.ts` |
| `boundariesOf(form, rows, opts: ResolveOptions, policies, env, zones)` | `screens/testing/boundaries.ts` |
| `screensOf` | `screens/testing/screens-of.ts` |
| `factsOf`, `changedBy`, `ORIGIN_PRESETS` | `screens/testing/sign-in-form.ts` |
| `hopMs` | `RouteMarker.tsx` |

**Dropped:**
- `DECISION_SAID` (`data.ts`).
- `store.signInTests` and `setSignInTest`.
- The local preset table, replaced by `DEVICE_PRESETS`.

### A.8 Retired and kept

As drafted in §4.3, with these changes:
- `BoardBarActions` removes both pips. There is no "{n} through".
- `BoardSheet` is kept in Full only until M4, reachable from ⌘K.
- `CheckTab` loses "Try a login" in A. D1 then replaces its Break-in section.

### A.9 Motion, accessibility and copy

As drafted, with these changes:
- "Changed by" is always shown.
- Can't tell contrast uses `--text-tertiary` (#5A6775 base, #5c636a rebrand). Both pass AA.
- The live region adds the monitoring clause: "… Monitoring: {policy} would allow with 2FA."
- The banned-word check lives in `src/brand/ui-copy.test.ts`, not in `try-sign-in.test.ts`.

### A.10 Acceptance changes

1. **Layout.**
   - Default measure: rail 64, panel 480, chain about 564, cards 380, zoom 100 %.
   - Reopen the rail: rail 200, chain about 428, zoom 100 %.
   - Neither shows horizontal scroll.
2. **Default run.** "IP address 203.0.113.24 · stated". The Network line reads "203.0.113.24 · in 203.0.113.0/24, 198.51.100.0/24 · Passes". The Place line reads "Pune (looked up) · within 25 km of Pune, or Bengaluru, Mumbai · Passes".
3. **Row menu.** It reads: Edit policy · Try a sign-in · Monitor · Turn off · Save as template · Duplicate · Delete policy.
4. **Monitoring.** Set HRMS to Monitoring and open Try.
   - The columns are "Today [Allow on 1 factor]" and "Stored version [Allow with 2FA]".
   - Which policy shows HRMS with the Monitoring pill and "Would allow with 2FA", not struck through.
5. **Save sign-in.** It opens an inline form at the top of the panel. Saving shows the toast "Sign-in saved".
6. **Unchanged.** Every other check is as drafted, with "Location" read as "Place".

---

## SPEC B final: Policy testing across the tenant (three versions)

**Base:** the Spec B draft. **Changes:**

### B.1 Scope

- **As drafted**, with these changes:
  - Break-in is Spec D's `BreakInView`. `BreakInSection` is deleted from the plan.
  - Monitor rows come from M2's extended `WatchedResult`.

### B.2 Entry points

| | V1 Rail page | V2 Slider | V3 Board only |
|---|---|---|---|
| **Rail** | Policies › Policy testing (second child) | — | — |
| **Policies bar** (PageBar right group, before "New policy") | — | `Button variant="secondary" icon={FlaskConical}` "Policy testing" | — |
| **Row menu** "Try a sign-in" (`LogIn`, after Edit policy) | Page, prefilled (§2.3 as drafted) | Slider, prefilled | Board test mode |
| **Board Which policy gate** (A) | Link "All policies on {app}": `session.load(boardForm)`, then go to the page | The same link, to the slider | The stage expands in place |
| **Samples and Saved "Try"** | Loads Try | Loads Try | Saved "Try" loads the panel Try page |

- **No `PageHead.action`.**
- **Routes:** as in the merged union (Spec A §A.2).
- **`BrandApp`:** lazy `PolicyTesting` added to `warm()`, the `case` added, and `<TestingSessionProvider key={persona}>` inside `Chrome()`.
- **`Shell`:** as drafted (the `only: 'testing-page'` child, `POLICY_SCREENS`).

### B.3 The switch

`screens/testing/testing-version.ts`, as drafted, plus these changes:
- `BOARD_VERSION_READY = false`. Version 3 is `disabled` with meta "Needs the builder's test mode" while it is false. B V3 flips it.
- The comment next to `TESTING_VERSION_CHOSEN`, with a cross-reference comment in `showcase.ts`, states the showcase exception: *this switch renders in the showcase while unchosen, per the owner's 25 Sep compare request. Remove the exception when a version is chosen.*

**Placement.** The `preview` slot of `PageHead` on Policies and on Policy testing. It renders only when `testingSwitchShown && features.policyTesting`.

### B.4 Edition and showcase

- `Features.policyTesting`: Full true, Lite false.
- The showcase pin is the single one at `store.tsx:722`:

```ts
features: SHOWCASE ? { ...featuresOf(edition), policyTesting: true, breakInTest: true } : featuresOf(edition)
```

- No `withShowcasePins`. No `GAPS` entry.

### B.5 Views

| View | Icon |
|---|---|
| Try a sign-in | `LogIn` |
| Check a person | `UserSearch` |
| Saved sign-ins | `BookmarkCheck` |
| Sample sign-ins | `Layers`, V1/V2 only |

- Grey pill `Tabs`, named "Policy testing" on the page and slider and "Board test" in V3.
- **Geometry**
  - V1: content 880, two columns of 432.
  - V2: Drawer `width={780} resizable minWidth={560} maxWidth={980}`, inner 740, two columns of 362. It stacks below 700.
  - V3: panel inner 448.

### B.6 Try a sign-in (V1 and V2)

**Fields.** `SignInFields` from S, showing every row (Assumption 30), plus the **Assume on** row, which is V1/V2 only.
- Assume on TipDot: "Evaluated as if on; nothing changes".
- The label strings and controls are the ones in Spec A §A.4. They replace the draft's field table:
  - "IP address" with placeholder "IPv4 or IPv6 address".
  - The Place picker.
  - Device "Not stated" plus presets, with Edit details.
  - Risk as a number input plus slider.
  - Person uses `Face kind="user"`, with TipDot "Sample directory".

**Default form** (`DEFAULT_FORM`, sample hr-office):
- Kavya Menon, HRMS.
- Origin office 203.0.113.24, place from address.
- Date **today**, 09:30, Asia/Kolkata.
- Device Not stated. Risk empty. Assume on null.

**Result column** (order as drafted):
1. **Head row**
   - IconButtons "Back", "Step" and "Replay".
   - `Button variant="secondary" size="sm"` "Save sign-in" (`BookmarkPlus`), disabled with the title "Choose a person and an application" while incomplete.
2. **Which policy**
   - `WhichPolicy` in full width, with `onAssume` and `onOpen` wired. TipDot: "Custom groups beat the DEFAULT group; list order stands in for weight".
   - Watching rows are rendered in list order with the Monitoring pill and a `WatchingBadge`. There is no separate block and no neutral "Monitor" badge.
3. **Who:** as drafted.
4. **Rules.** TipDot "Ordered rules; first match wins".
   - Rule and condition words follow Assumption 27, with lines from `evidence.ts`.
   - Zone conditions print Network and Place lines. The "Network {w} · Place {w}" summary line is dropped.
5. **Decision** (sticky)
   - `DecisionBadge`.
   - With Assume on: "Today: {decision} · {policy}".
   - Depends: "Can't tell" in `--text-tertiary`, the possible outcomes with "if …", and "Needs:" link buttons labelled with `FACT_WORDS`.
   - The Monitor line: under the decision, "{policy}" plus the info badge "Would …" when a watched result would decide differently.
   - Always "Changed by {field}" after a committed change that moved the decision.
   - `WhatTheySee` (shared) as a disclosure titled "What they see", collapsed, with caption "Approximation of the sign-in page".
6. **Save sign-in form:** `SaveSignInForm` from S (fields as drafted: Name, Expected, Level). Toast "Sign-in saved".

**Marker.** `RouteMarker variant="bar"`, `hopMs` timing.

### B.7 Check a person

As drafted, with these changes:
- The Decision cell uses `DecisionBadge`, or "Can't tell" plus "{a} or {b}".
- Monitor: a muted line "Monitoring: {name} would {DECISION_PHRASE}" when a watched result differs.
- The scenario line and "Edit sign-in" stay.

### B.8 Saved sign-ins

- **Table, sorting and delete:** as drafted.
  - Deleting a Protected row passes `ConfirmDelete requireTyped`.
  - The Actual cell uses `DecisionBadge`.
  - The Result cell is `Badge positive "Pass"`, `Badge negative "Fail"`, or `--text-tertiary` "Can't tell".
- **Break-in button**
  - Bar right: `Button variant="secondary" icon={ShieldAlert}` "Break-in test", gated by `features.breakInTest`.
  - It pushes `BreakInView` (Spec D) as a page inside this view, with the Back crumb "Saved sign-ins". This is the same in V1, V2 and V3.
  - **Default policy:** the assumed policy, else the Try decider when it is not the Global Default, else the first eligible policy.
  - V1/V2 show a `Picker label="Policy to test" prefix="Policy"` at the top of the pushed page. V3 runs on the board draft with no picker.
- **Session:** `TestingSession` gains `breakIn: { policyId: string | null; open: boolean }` and `openBreakIn(policyId)` (Assumption 33).

### B.9 Sample sign-ins

As drafted, with these changes:
- `hr-office` and `sales-hrms` use **203.0.113.24**. Decisions are unchanged (same fixture block).
- Device ids follow `DEVICE_PRESETS`.

### B.10 States and copy

Rule-violation fix: titles only, with no blurbs.

| State | Presentation |
|---|---|
| Incomplete | `EmptyState compact icon={LogIn} title="Choose a person and an application"` |
| No global default | `EmptyState compact icon={ShieldAlert} title="No global default policy"` |
| Saved, empty | `EmptyState icon={BookmarkCheck} title="No saved sign-ins"`, action secondary "Try a sign-in" |
| Samples, empty | `EmptyState icon={Layers} title="No samples for this tenant"` |
| Check a person, no person | `EmptyState compact icon={UserSearch} title="Choose a person"` |
| Break-in, no policy | `EmptyState compact icon={ShieldAlert} title="No policy to test"` |

- **Page head:** title "Policy testing", caption "Which policy decides a sign-in".
- **Field errors:** "Enter an IPv4 or IPv6 address" and "Enter 0 to 100".
- **Other states:** Loading, unknown facts and the rest are as drafted. Grey text uses `--text-tertiary`.

### B.11 Data

**Session** (`screens/testing/session.tsx`):

```ts
interface TestingSession {
  form: SignInForm; boardForms: Record<string, SignInForm>; view: TestingView
  runId: number; lastEdited: FormField | null
  breakIn: { policyId: string | null; open: boolean }
  patch(p: Partial<SignInForm>, field: FormField): void
  patchBoard(policyId: string, p: Partial<SignInForm>, field: FormField): void
  load(form: SignInForm): void; replay(): void; setView(v: TestingView): void
  openBreakIn(policyId: string | null): void; closeBreakIn(): void
}
```

**Form** (`sign-in-form.ts`):

```ts
export type OriginPresetId = 'office' | 'branch' | 'home' | 'tor'
export const ORIGIN_PRESETS = [
  { id: 'office', label: 'Office network', address: '203.0.113.24' },
  { id: 'branch', label: 'Branch office',  address: '198.51.100.20' },
  { id: 'home',   label: 'Home broadband', address: '192.0.2.10' },
  { id: 'tor',    label: 'Tor exit',       address: '192.0.2.66' },
] as const
export interface SignInForm {
  personId: string | null; appId: string | null
  origin: OriginPresetId | null; address: string; addressSource: 'typed' | 'stated'   // '' = not stated
  place: { kind: 'from-address' } | { kind: 'stated'; placeId: string }
       | { kind: 'distance'; zoneId: string; rangeIndex: number; km: number }
  date: string; time: string; timeZone: string                                        // '' = not stated
  device: { kind: 'none' } | { kind: 'preset'; id: DevicePresetId } | { kind: 'custom'; facts: SignInDevice }
  risk: string; assumeOn: string | null
}
export function factsOf(form: SignInForm, zones: readonly Zone[]): { facts: SignInFacts; issues: FormIssue[] }
export function formOf(facts: SignInFacts): SignInForm
export function changedBy(prev: SignInForm, next: SignInForm): FormField | null
export function defaultBoardForm(p: Policy, people: readonly User[], apps: readonly App[], today: string): SignInForm
```

**Mapping to facts**
- **Network:** `network = { address, source: addressSource }` whenever the address is not empty. It is sent even when invalid, and the engine treats it as undecided.
- **Place, distance mode:** the stated label "{km} km from {range label}", placed due north of the range centre (A's math).
- **Everything else:** as drafted.

**`DEVICE_PRESETS`** (`screens/testing/device-presets.ts`). Every preset has `source: 'stated'`. The CHIP-based ones spread the chip device and override the source:

| id | Label | Facts |
|---|---|---|
| `android-12` | Android 12 phone | android `12`, Mobile, chrome 128, integrity all false, lock `pin`, Authenticator `6.5.0`, agent false/null, registered false, count 0 |
| `android-14` | Android 14 phone | as android-12 with OS `14` |
| `iphone` | iPhone · iOS 17.5 | `{ ...CHIP_DEVICES['Known < 90 days'], source: 'stated' }` |
| `win11-registered` | Windows 11 laptop · registered | `{ ...CHIP_DEVICES['Managed (MDM)'], source: 'stated' }` |
| `win11-unregistered` | Windows 11 laptop · not registered | `{ ...CHIP_DEVICES['Changed fingerprint'], source: 'stated' }` |
| `win11-no-agent` | Windows 11 laptop · no Device Agent | windows 10.0.22631, Laptop, edge 128, integrity/lock/Authenticator null, agent false/null, registered false, count 0 |
| `win10` | Windows 10 laptop | `{ ...CHIP_DEVICES['Known > 90 days'], source: 'stated' }` |

**Per-surface device defaults:** board test mode uses `win11-registered` with risk 12. V1/V2 use Not stated.

**Saved sign-ins** (`src/brand/saved-sign-ins.ts`, created in F):

```ts
export type SignInLevel = 'note' | 'must-pass' | 'protected'
export interface SavedSignIn { id: string; name: string; facts: SignInFacts; expected: AccessDecision
  level: SignInLevel; savedBy: string; savedAt: string; reason?: string; changedBy?: string; changedAt?: string }
export const LEVEL_LABEL: Record<SignInLevel, string> = { note: 'Note', 'must-pass': 'Must pass', protected: 'Protected' }
```

**Seed** (`showcaseSavedSignIns`, six rows, all pass on load):

| id | Name | Facts | Expected | Level |
|---|---|---|---|---|
| `ssi-kavya-office` | Kavya Menon in the office | as drafted, address .24 | as drafted | as drafted |
| `ssi-neha-home` | Neha Kapoor at home | as drafted | as drafted | as drafted |
| `ssi-aisha-hrms` | Aisha Khan on HRMS | as drafted, address .24 | as drafted | as drafted |
| `ssi-devon-android` | Devon Rao on Android 12 | as drafted | as drafted | as drafted |
| `ssi-ravi-hrms` | Ravi Menon on HRMS | as drafted, address .24 | as drafted | as drafted |
| `ssi-vikram-laptop` | Vikram Nair on a corporate laptop | `u-exec-2`, google-workspace; windows 10.0.22631, Laptop, registered, agent 4.2, registeredCount 2; risk 12; stated `when` | Allow on 1 factor | Protected |

**Selectors.** `selectors.ts` drops `DECISION_WORDS` and imports from `decision-words.ts`. `FIELD_LABEL` becomes `FACT_WORDS`. `riskThresholds` is dropped, because the slider ticks from `boundaries.ts` replace the hint.

**Environment.** `use-tenant-env.ts` is dropped; use `useSimEnv()` from `screens/sim-env.ts`.

### B.12 Files

As drafted, with these changes:
- **Removed:** `BreakInSection.tsx`, `use-tenant-env.ts`, `DecisionStage.tsx`'s `DecisionPill` (now `DecisionBadge`), and the `PageHead.action` change.
- **Moved to S:** `SignInFields.tsx`, `WhichPolicy.tsx`, `WhatTheySee.tsx`, `RouteList`'s marker (now `RouteMarker`), and `SaveSignInForm`.
- **`kit.css`:** the `input[type='date']` change stays.

### B.13 Motion, accessibility

As drafted, with these changes:
- Marker timing uses `hopMs`.
- "Changed by" is always on the decision, not only under reduced motion.
- The Break-in stagger is owned by Spec D.
- "Can't tell" uses `--text-tertiary`.

### B.14 Acceptance changes

- **Check 3:** V2 shows "Policy testing" as a secondary button left of "New policy", not beside Documentation.
- **Check 7:** the first open shows 203.0.113.24, Place "From IP address · Pune, India", "looked up", and date today.
- **Check 9:** reads "Network · 203.0.113.24 · in … · Passes" and "Place · Pune (looked up) · … · Passes".
- **Check 10:** after typing 192.0.2.10, the Network line Fails and the Place line Passes, with "Changed by IP address".
- **Check 11:** the error reads "Enter an IPv4 or IPv6 address", and "Needs: IP address, Place".
- **Checks 18–19:** there are six seeded rows.
- **Checks 20–22** move to Spec D (A11, A13, A14). The Break-in page opens pushed inside Saved sign-ins.
- **Check 24:** also no orange on "Policy testing".
- **New check 28:** with HRMS Monitoring, Which policy lists HRMS with the Monitoring pill and "Would allow with 2FA", not struck through.

---

## SPEC C final: Monitor (report-only)

**Base:** the Spec C draft. Section 0 ("a new status, not a setting") stands unchanged. **Changes:**

### C.1 Scope and build

- **Steps:**
  - M1 and M2 land right after F.
  - M3 is the Monitoring page.
  - M4 is the hooks, most of which S, A, B and D2 absorb.
- **M3 confirm modal is not built.**
  - Until D2 ships, Monitoring → Active uses the existing Turn on confirm modal: a plain confirm, with the copy "It starts deciding sign-ins to {apps}".
  - D2 replaces it with Before turning on, including the "While monitoring" row.

### C.2 Transitions (merged)

| From → To | Confirmation | Toast |
|---|---|---|
| Draft → Monitoring | Save, then toast action "Monitor" (as drafted) | "{name} is monitoring", Undo → Inactive |
| Inactive → Monitoring | None. The M2 confirm shows only with unsaved board edits or `pendingDraft` | "{name} is monitoring", Undo |
| Active → Monitoring | D2: **Before switching to monitoring** opens when someone is newly allowed; otherwise the M1 confirm. Before D2: the M1 confirm | "{name} is monitoring" |
| Monitoring → Active | D2: **Before turning on**, always. Before D2: the existing Turn on confirm | "{name} is on" |
| Monitoring → Inactive | None | "{name} is off", Undo → Monitoring |
| Others | As drafted | As drafted |

### C.3 Menus

- **Policies row menu**, merged order: Edit policy · Try a sign-in · [status options by strength] · View monitoring (monitoring only) · Save as template · Duplicate · Delete policy.
- **Status options:**
  - Active: Monitor (`Radar`), Turn off (`PowerOff`).
  - Inactive: Turn on (`Power`), Monitor (`Radar`).
  - Monitoring: Turn on, Turn off.
- View monitoring uses `Eye`.
- `RowAction` gains `'test' | 'monitor' | 'monitoring'`.

### C.4 StatusControl API (single)

```ts
<StatusControl policyId={policy.id} edits={boardEdits} />   // edits?: RuleSet
// unsaved = !!edits (M2 body: "Your unsaved changes are not included.";
//   else, when policy.pendingDraft: "Your saved draft is not included.")
```

- `BoardBuilder` computes `boardEdits` as the draft's `{ rules, fallback }` when the board has unsaved changes, else `undefined`, and passes it through `BoardBar` (`:207`).
- `use-status-change.tsx`:
  - M1 adds the monitor paths and changes "logins" to "sign-ins" in the F copy pass.
  - D2 replaces the turn-on modal (`:129-165`) and adds the turn-off and to-monitoring guard kinds.

### C.5 Copy fixes

- **Pill:** "Monitoring", `title` "Checks sign-ins; enforces nothing".
- **Monitoring page**
  - Section h3 **"Modelled sign-ins"**, with TipDot "Modelled on the sample directory, not real traffic".
  - Table caption: "Modelled sign-ins for {name}".
  - Empty state: `EmptyState compact icon={Eye} title="No modelled sign-ins"`, with no blurb.
- **Resolver reasons:** built with `DECISION_PHRASE` from `src/brand/decision-words.ts`.
  - "Monitoring: would allow with 2FA", and so on.
  - "Monitoring: can't tell (deny or allow with 2FA)".
- **Would cells:** `WOULD_WORDS`.
- **Today cells:** `DecisionBadge` (Assumption 38).
- **Can't tell:** `--text-tertiary`.

### C.6 Renames

| Draft name | Final name |
|---|---|
| `SampleSignIn` | `MonitorSample` |
| `SAMPLE_ORIGINS` | `MONITOR_ORIGINS` |
| `SampleRow` | `MonitorRow` |
| `SampleOrigin` | `MonitorOrigin` |
| `sampleSignIns()` | `monitorSamples()` |

- The file stays `screens/monitor-sample.ts`.
- The plan line is unchanged: "If turned on: {a} to allow on 1 factor, …".

### C.7 Files

As drafted in §4.2 and §4.3, with these changes:
- `screens/decision-words.ts` is **not** created.
- `src/brand/monitor.test.ts` is a **new** file. The old one was deleted in cb89c91.
- `WatchingBadge` (`screens/watching-line.tsx`) is built in step S. It is shared by A's gate, B's `WhichPolicy` and D's guard.
- The env comes from `useSimEnv()`.
- `Features.monitorMode`: Lite true, Full true. It needs no showcase pin.
- The new files are added to `src/brand/ui-copy.test.ts`.

### C.8 Resolver

§5.2 as drafted: `StandingKind 'monitoring'`, the extended `WatchedResult { status, trace, wouldDecide, yieldsTo }`, `Governing.watched` and `list`, and the ordering guard before `why.get(p.id)!`.

### C.9 Acceptance changes

- **Check 3**
  - The row menu reads: Edit policy, Try a sign-in, Monitor, Turn off, Save as template, Duplicate, Delete policy.
  - Monitor on HRMS opens **Before switching to monitoring**, not M1, because HRMS newly allows Priya. The primary reads "Monitor". Confirming shows the pill and toast as drafted.
  - For a policy that newly allows nobody (for example Developer tools, if the sweep shows none), the M1 confirm shows instead.
- **Check 4:** the menu reads Edit policy, Try a sign-in, Turn on, Turn off, View monitoring, …
- **Check 5:** reads "Modelled sign-ins". The Today cells are positive badges "Allow on 1 factor".
- **Check 9:** Before turning on shows the "While monitoring" row with the Sample badge, the plan line and "View monitoring". The M3 modal is gone.
- **Check 14:** holds from A onwards.

---

## SPEC D final: guard pages and the Break-in test

**Base:** the Spec D draft. **Changes:**

### D.1 Contracts, now fixed

| Contract | Final form |
|---|---|
| Words | `src/brand/decision-words.ts` (F) supplies `DECISION_WORDS`, `DECISION_PHRASE`, `WOULD_WORDS`, `FACTOR_WORDS`, `FACT_WORDS` (label equals the Needs word; device facts collapse to "Device") and `DEVICE_FACT_WORDS` (only for the Break-in facts line) |
| Saved sign-ins | Spec B's `SavedSignIn` with `expected`, from `src/brand/saved-sign-ins.ts` |
| Environment | `screens/sim-env.ts` (F) |
| Break-in host | Pushed page inside Saved sign-ins, in all three versions (Spec B §B.8) |
| Board panel | Spec A's shell. In the board, Break-in is in-panel only in V3 |

**`FACT_WORDS`:**

| Fact key | Word |
|---|---|
| `app` | Application |
| `person` | Person |
| `address`, `asn` | IP address |
| `location`, `location.city`, `location.coordinates` | Place |
| `date`, `time` | When |
| `risk` | Device risk score |
| every `device.*` | Device |

### D.2 Guard kinds and triggers

```ts
export type GuardKind = 'save' | 'apps' | 'turn-on' | 'turn-off' | 'to-monitor'
```

**`interrupt`** is `blocking.length > 0 || newlyAllowed`, where `newlyAllowed` is:

```ts
whatChanges.counts.nowAllowed > 0
|| savedChecks.some(c => c.before.decision === 'deny' && c.after.verdict !== 'cant-tell' && c.after.decision !== 'deny')
|| (breakIn && breakIn.now.gotThrough > (breakIn.was?.gotThrough ?? 0))
```

- Can't-tell regressions never set `interrupt` (Assumption 3).
- **When each page opens**
  - `turn-on`: always.
  - `turn-off` and `to-monitor`: only when `newlyAllowed`; otherwise the plain confirm.
  - `save` and `apps`: only when `interrupt`.
- **What each kind checks**
  - `turn-off` and `to-monitor` compute `after = { ...saved, status: 'inactive' | 'monitor' }` and never set `blocking` (Assumption 24).
  - Monitoring policies are never guarded on save (Spec C).

### D.3 Guard pages

Kit `Drawer width={680}`, portalled.

| Kind | Title | Rows | Footer |
|---|---|---|---|
| save | Before saving: your edits | What you changed · Who it starts deciding for · Saved sign-ins · Your own and protected sign-ins · What changes · Break-in test | Keep editing (ghost) · Save policy (brand) |
| apps | Before saving: applications | Same | Keep editing · Save applications |
| turn-on | Before turning on | Version Seg (when edits exist) · the six rows · **While monitoring** (only from Monitoring: `Badge neutral "Sample"`, the plan line, a link button "View monitoring") | Cancel · **Monitor instead** (`secondary`, only from Inactive and when `features.monitorMode`) · Turn on (brand) |
| turn-off | Before turning off | Who it stops deciding for · Saved sign-ins · Your own and protected sign-ins · What changes | Cancel · Turn off (brand) |
| to-monitor | Before switching to monitoring | Same as turn-off | Cancel · Monitor (brand) |

**Rows**
- **Motion:** no entrance animation of their own; they appear with the drawer spring. Rows whose summary changed on a re-run cross-fade (opacity 0.4 → 1, 160 ms).
- **What changes summary:** "Now allowed {a} · Now on 1 factor {b} · Now asked for 2FA {c} · Now denied {d}". The Now on 1 factor block sits after Now allowed.
- **Saved sign-ins row:** the draft's " · blocks saving" suffix is **dropped**, because the banner says it.
- **Change blocks:** they use the new `ChangeTone` values `fail` → negative "Fails", `pass` → positive "Passes" and `neutral` → "Can't tell". The existing `added`, `changed` and `removed` stay for What you changed.

**Banner** (`.bgd__block`, `--fb-negative-*` tokens)

| Kind | Heading |
|---|---|
| save, apps | "Can't save" |
| turn-on | "Can't turn on" |

- Line: "{name} must pass and would get {Decision}." or "{name} is protected and would get {Decision}."
- Actions: the ready fix (`neutral` sm), the rule link, and for Must pass a ghost "Expect {Decision} instead".
  - Pressing "Expect … instead" reveals `Field label="Reason"` (max 200) with Save (neutral) and Cancel (ghost). An empty submit shows "Enter a reason".
  - It calls `updateSavedSignIn(id, { expected, reason, changedBy, changedAt })` and re-runs the checks.
- Save or Turn on is disabled with the title "Can't save" or "Can't turn on".

**Live region**
- "Can't save. {line}"
- "Ready to save."
- "Checks done. Now allowed: {up to three names}."
- "Checks could not run."

**Rule reveal flash** is a 2 px `--accent` outline, not `--blue`.

**"Open" on the Break-in row**
- On the board, only in V3: it pushes the panel's Break-in page.
- From the Policies list, in any version: `session.openBreakIn(id)`, then go to the host for that version:
  - V1: `policy-testing` with view `saved`.
  - V2: `policies` with testing `saved`.
  - V3: `board` with `open: 'break-in'`.

### D.4 Break-in view (D1)

- **Component:** `BreakInView`, as drafted in §3.6 and §4.2, including the fix-and-preview model, the `proposeFrom` refactor (required), `proposeAttemptFix`, `proposeFactorFix`, `sweepTenant` in `impact-arena.ts` (`contextOf` and `decideSituation` are private), and `decide` from `simulate.ts`.
- **Host:** a pushed page in Saved sign-ins, with the Back crumb "Saved sign-ins". There is no 560 Drawer.
- **Button:** `secondary`, `ShieldAlert`, "Break-in test". Gated by `features.breakInTest`: Full true, Lite false, pinned true in the showcase.
- **Default policy:** Spec B's rule. V3 uses the board draft.
- **Counts:** four `aria-pressed` cells. Pressed cells use `--accent-soft` fill and an `--accent` border and text.
- **Groups:** "Less than asked" and "Can't tell" are headings with no cell (Assumption 5).
- **Motion**
  - First run: rows fade in order, opacity only (120 ms each, 40 ms apart, 15 cards at most so about 0.72 s). **No `y`.**
  - Re-evaluation: framer `layout` moves (240 ms) and a 2 px `--accent` outline that fades over 1,200 ms.
  - Reduced motion: a static "Changed" label in `--accent`.
- **Expanded row:** "Changed" outlines use `--accent`. The facts line uses `DEVICE_FACT_WORDS` for device details.
- **Accept this result:** as drafted. It is stored in `store.breakInAccepted` (added in D1) and reset on a persona switch.
- **Deleted:** Spec B's `BreakInSection`. `CheckTab` in Full: as drafted, until M4 deletes it.
- **Check pip:** removed by A. D's "{n} through" is dropped.

### D.5 Save flow

As drafted in §2, with these changes:
- `saveNow` guards when `features.beforeTurningOn && enforces(saved)`, so Always-on is included.
- A clean result gives a one-click save.
- `Checking…` sets `aria-busy`. It clears after the checks, about 150 ms on the showcase.

### D.6 Library guard (D3)

As drafted in §3.5 and §5.6. It also adds the risk-profile "Use" action, which goes through `ReviewChanges` with the same Also changes rows (Assumption 23). `blockedReason` wording is as in §D.3.

### D.7 Edition and store

- **Flags:** `beforeTurningOn` (Lite and Full true) and `breakInTest` (Lite false, Full true). Both land in F.
- **Pin:** the single showcase pin (Spec B §B.4). There is no inline pin of D's own.
- **`FULL.exposure = false`** moves to M4.

### D.8 Copy

**Remove:** "Saving is blocked", "Turning on is blocked" and "Report only".

**Add:**
- "Can't save"
- "Can't turn on"
- "Monitor instead"
- "Before turning off"
- "Before switching to monitoring"
- "Who it stops deciding for"
- "While monitoring"
- "View monitoring"
- "Expect {Decision} instead"
- "Ready to save."

**Everything else:** as drafted. `ruleIfLine` now prints "For Human Resources, any sign-in" after the F copy pass.

### D.9 Acceptance changes

**Fixture:** the seeded `showcaseSavedSignIns`, referred to by B's names (for example "Kavya Menon in the office" and "Vikram Nair on a corporate laptop").

- **A1:** unchanged.
- **A2:** unchanged except that Got through also rose, which is a trigger. It still opens and does not block.
- **A3:** banner "Can't save" / "Kavya Menon in the office must pass and would get Deny." / "[Leave Kavya Menon out of rule 1]" plus a ghost "Expect Deny instead". The live region says "Ready to save." after the fix.
- **A3b (new):** repeat A3 and use "Expect Deny instead" with the reason "HR offboarding test". The banner clears, the saved sign-in shows the new expected value, and Save works.
- **A4:** "Vikram Nair on a corporate laptop is protected and would get Deny." There is no "Expect … instead".
- **A6**
  - Turn off HRMS from the row menu. **Before turning off** opens with Now allowed 72, and the Turn off button is enabled. Confirm.
  - Then Turn on. Before turning on shows, as drafted, plus **Monitor instead** in the footer.
  - Pressing Monitor instead sets Monitoring, with the toast "HRMS access from corporate offices is monitoring" and Undo.
- **A6b (new):** from Monitoring, Turn on shows the "While monitoring" row with the Sample badge and the plan line "If turned on: 0 to allow on 1 factor, 3 to allow with 2FA, 5 to deny, 4 unchanged."
- **A11:** in V3 the path is Board → Try a sign-in panel → Saved sign-ins tab → Break-in test. In V1 it is Policy testing → Saved sign-ins → Break-in test, with the Picker on HRMS. Counts and rows are as drafted.
- **A15:** the pressed cell uses the `--accent` tokens (blue in the rebrand, slate outside it).
- **A16:** unchanged.
- **A17:** "Blocked" is checked as an exact label only. "Can't save" and "Can't turn on" pass.
- **A18:** unchanged.
- **A19:** in the 480 px panel (448 inner), the Break-in columns fit. The name column is 140 px at 448 and uses the ≤439 container rule.

---

## Still-open questions

1. **The HRMS seed state for the pitch journey (Phase 4 only, does not block Phases 1 to 3).**
   - The approved p1 journey opens on "Today | Stored version", which needs HRMS seeded **Inactive**.
   - The 24 Sep showcase seed ruling set the four scenario policies (commit `afd9391` tunes HRMS as Active).
   - Changing it touches a standing ruling and the showcase tests, so it needs your yes before Phase 4.
   - My default if you say nothing: reseed HRMS as Inactive at Phase 4 and update `showcase-evaluator.test.ts` in the same step.

Nothing else is blocked. Every other question was defaulted above and can be reversed.