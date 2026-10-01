# Spec B: Policy testing for the whole tenant, in three versions

Everything here was checked against the Phase 0 worktree `C:\New folder\IDP Policy Engine\.claude\worktrees\kind-heyrovsky-5ec74e` (uncommitted, read-only). Every showcase result quoted in §3 and §8 was computed by running the Phase 0 evaluator on `showcaseTenant()`. The probe is `C:\Users\surajit.dutta\AppData\Local\Temp\claude\C--New-folder-IDP-Policy-Engine--claude-worktrees-kind-heyrovsky-5ec74e\764e61be-5a0d-42c3-9122-8aaa35fa07d9\scratchpad\specb\probe.test.ts`. It lives in the scratchpad, not the repo.

---

## 1. Purpose and scope

**Purpose.** An admin types one sign-in and sees three things across the tenant:
- which policy decides it, and why every other policy on that application does not;
- what that policy decides, condition by condition;
- the same answer for one person across every application, and for a library of saved and sample sign-ins.

The surface is built three ways, so the owner can compare them in the running showcase:

| Version | Shape | Where the tenant answer lives |
|---|---|---|
| V1 | Rail page | "Policy testing" under Policies in the rail, with four views |
| V2 | Slider | A 780 px slider opened over the Policies list, with the same four views |
| V3 | Board only | Inside the board's test mode (Spec A). "Which policy" is a route stage. Check a person and Saved sign-ins are panel views. |

**In scope**
- The four views: Try a sign-in, Check a person, Saved sign-ins, Sample sign-ins.
- A Break-in section inside Saved sign-ins. It shows counts only.
- Saved sign-ins as tenant data.
- The version switch and how it is pinned.
- One shared core, so the three versions do not fork logic.

**Out of scope, and who owns it**
- The board playground: test mode, Today and Your edits columns, the chain marker, What they see at full size, Would change if. **Spec A.** V3 depends on it.
- Before saving and Before turning on. **Spec C.** It reads the same `SavedSignIn` store defined here.
- Filling `TenantResolution.watching` with Monitor policies. That needs the `monitor` status, which comes back with owner decision (1) in another spec. This surface only renders `watching`; the rendering is specified in §3.5.
- Compare, What changes, and Describe it.
- Reconciling Coverage (Phase 0 D7). It is hidden in the showcase because `features.coverage` is off in Lite.

**Owner decisions this spec follows (25 Sep)**
- Three versions behind a switch.
- Break-in shows counts only: Got through, Weaker factor, Locked out, Extra prompts. No letter grade and no Exposure column.
- Monitor is in, and rendered from `watching`.

**Owner rules this spec follows**
- Decisions use exactly three words: Allow on 1 factor, Allow with 2FA, Deny. "Can't tell" is grey text and never counts as a pass.
- Sentence case, labels and one-line tooltips only.
- Orange only on the primary button, the rail's active edge and "New". Selection is greyscale. Blue (`--accent`, which the showcase rebrand turns into #0d6efd) is used for chips, active states and the moving marker.
- Each number appears once per view, and tabs never carry counts.
- Layout starts at 1,120 px, with no phone layout.

---

## 2. Entry points, navigation, what each version can do, cost, and the switch

### 2.1 Entry points per version

| | V1 Rail page | V2 Slider | V3 Board only |
|---|---|---|---|
| Rail | Policies › **Policy testing** (second child, after All Policies) | none | none |
| Policies page head | none | A **Policy testing** button (FlaskConical icon) at the right edge, before Documentation. Opens the slider on the last view used. | none |
| Policies row menu **Try a sign-in** (FlaskConical, placed after Edit policy) | Opens the page on Try a sign-in, prefilled from the policy (§2.3) | Opens the slider, prefilled the same way | Opens the board in test mode on that policy (Spec A's route parameter) |
| Board "Which policy" stage (Spec A) | One-line stage plus a link "All policies on {app}", which opens the page with the same sign-in | Same link, which opens the Policies list with the slider open | The stage expands in place to the full list (§3.4). No link. |
| Saved sign-ins / Sample sign-ins "Try" | Loads the sign-in into the Try view | Same | Samples become the preset picker inside Spec A's Try panel |

There is exactly one testing item in the row menu. Its destination depends on the version. If Spec A also adds a row-menu entry, it is this same item.

### 2.2 Route changes (`src/brand/store.tsx`, `BrandScreen`)

```ts
| { name: 'policies'; testing?: TestingView }       // V2: land on the list with the slider open
| { name: 'policy-testing'; view?: TestingView }    // V1 route
| { name: 'board'; policyId: string; open?: 'gauntlet' | 'impact'; rule?: string /* rule id or 'fallback' */ }  // + Spec A's test-mode param
export type TestingView = 'try' | 'person' | 'saved' | 'samples'
```

- **`BrandApp.tsx`**
  - Add a lazy `PolicyTesting` import (`./screens/PolicyTesting`).
  - Add it to `warm()`. `routes.test.ts` fails if a lazy import is missing from `warm()`.
  - Add `case 'policy-testing': return <PolicyTesting view={screen.view} />`.
  - Change `case 'policies'` to `<Policies testing={screen.testing} />`.
- **`Shell.tsx`**
  - Add `'policy-testing'` to `POLICY_SCREENS`, so the parent row lights.
  - Add the child `{ label: 'Policy testing', screen: { name: 'policy-testing' }, only: 'testing-page' }` to the Policies children.
  - Filter it at render: show it only when `version === 'page' && features.policyTesting`. The child type gains `only?: 'testing-page'`.
- **Stale route.** If `PolicyTesting` renders while the version is not `'page'`, it redirects in an effect:
  - V2 goes to `{ name: 'policies', testing: session.view }`.
  - V3 goes to `{ name: 'policies' }`.
- **`BoardBuilder.tsx`**
  - `rule` seeds the selection: `useState<Selection>(() => rule === 'fallback' ? { kind: 'fallback' } : rule ? { kind: 'rule', id: rule, part: 'when' } : { kind: 'none' })`.
  - `BoardPage.tsx` passes it through.

### 2.3 Prefill from a policy row: `formForPolicy(policy, lib, current)`

- **Application:** `policy.appIds[0]`. For the Global Default, keep `current.appId`.
- **Person:** the first directory person whose `groupId` is in `policy.audience.groupIds`. If there is none, `audience.userIds[0]`. For an Everyone audience, keep `current.personId`.
- **Assume on:** set to `policy.id` when the policy does not enforce (Inactive or Draft). Otherwise leave it unchanged.
- **Everything else:** the address, place, time, device and risk stay as they are in the session.
- After prefilling: view becomes `'try'` and `runId` is bumped, so the marker plays.

### 2.4 What the admin can and cannot do, and build cost

| | V1 Rail page | V2 Slider | V3 Board only |
|---|---|---|---|
| **Can** | All four views at 880 px in two columns. Break-in on any policy. "Assume on" for any Inactive, Draft or saved-draft policy. Reachable with no policy open. Stays open while other screens are visited, because the session persists. | Everything V1 can, over the list it came from. The row menu lands in context. Closing returns to the same row. | Test unsaved edits against the whole tenant in one place: Check a person and Saved sign-ins evaluate Your edits. Test and edit without switching screens. |
| **Cannot** | Evaluate unsaved board edits (it reads stored policies; unsaved edits are tested in the board). Adds one item to the measured console rail. | Keep the list usable while open (modal, with a scrim). No Documentation or preview switch reachable while open. At 560 px it drops to one column. | Test without opening a policy. No Sample sign-ins view (samples are the Try presets). The panel is 448 px wide, so table details move into tooltips. Break-in only for the open policy. Discoverable only from the builder. |
| **Marginal cost** (one developer) | 1.5 days: route, rail item, page shell | 1 day: Drawer wrapper, head action, row-menu branch | 2 days after Spec A lands: panel tabs, panel layouts, expanded stage |

- **Shared core:** 6 days (§4.2).
- **Switch and pin:** 0.5 day.
- **Tests and browser verification** across three versions with reduced motion: 1.5 days.
- **Total:** about 12.5 days. The p4 plan gave Phase 2 about 9 days, including Compare. V3 cannot ship before Spec A.

### 2.5 The switch

**Module: `src/brand/screens/testing/testing-version.ts`.** It copies two existing patterns:
- `page-width.ts`: a module-level value, `useSyncExternalStore` so the rail, Policies and the page all agree live, and the showcase pin applied inside the module.
- `device-profile-version.ts`: options that carry `label`, `name` and `tip`.

```ts
export type TestingVersion = 'page' | 'slider' | 'board'
export const TESTING_VERSIONS = [
  { id: 'page',   label: 'Version 1', name: 'Rail page',  tip: 'A page under Policies in the rail' },
  { id: 'slider', label: 'Version 2', name: 'Slider',     tip: 'A slider over the policy list' },
  { id: 'board',  label: 'Version 3', name: 'Board only', tip: "Inside the builder's test mode" },
] as const
export const TESTING_VERSION_KEY = 'idp.policyTesting'
export function parseTestingVersion(v: unknown): TestingVersion        // any unknown value → 'page'
export function readTestingVersion(): TestingVersion                   // try/catch → 'page'
/** The owner's pick, or null while the three are compared. */
export const TESTING_VERSION_CHOSEN: TestingVersion | null = null
export function initialTestingVersion(showcase: boolean, chosen: TestingVersion | null, stored: TestingVersion): TestingVersion
  // showcase && chosen ? chosen : stored
export const testingSwitchShown: boolean   // !SHOWCASE || TESTING_VERSION_CHOSEN === null
export function applyTestingVersion(v: TestingVersion): void   // write storage (try/catch), notify listeners
export function useTestingVersion(): [TestingVersion, (v: TestingVersion) => void]
```

**Control: `TestingVersionSwitch.tsx`**
- The existing `Picker` (`src/brand/picker.tsx`), `size="md"`, `label="Policy testing version"`, `prefix="Testing"`.
- `summary` shows the version name, for example "Rail page".
- Each option is labelled `` `${label} · ${name}` `` with the tip as `meta`.
- Version 3 is `disabled`, with the meta "Needs the builder's test mode", until Spec A exports its ready flag (read as `store.features.trySignIn`).
- It renders `null` when `testingSwitchShown` is false.

**Placement**
- In the `preview` slot of `PageHead` on the Policies page. That is where the owner already compared Flow and Width (`DeviceFingerprintV2.tsx:560–584`, `page-bar.tsx` `WidthSwitch`).
- In the same slot on the Policy testing page, so it can be flipped from there too.
- Not in the account menu. `ProfileMenu.tsx` is measured off the live console, and a prototype item there would read as a product feature in a demo.
- Not on the board.

**This is an exception to the showcase rule.** Every other preview switch renders only when `!SHOWCASE`. This one renders while `TESTING_VERSION_CHOSEN === null`, because the owner asked to compare the versions inside the showcase.

**Pinning once the owner chooses.** Set `TESTING_VERSION_CHOSEN = 'page' | 'slider' | 'board'`. After that:
- The switch disappears in the showcase.
- Every call site reads the pinned value, whatever localStorage holds (the same guarantee `page-width.ts:39` gives).
- Non-showcase builds keep the switch and the stored value.
- Nothing is deleted.

**What a flip does.** The session (form and view) carries across every flip.

| Flip | On the Policies list | On the Policy testing page |
|---|---|---|
| → V1 | The rail item appears; the head button goes | — |
| → V2 | The head button appears; the rail item goes | Goes to `{ name: 'policies', testing: view }`, so the slider opens on the same view |
| → V3 | Both entries go; the row menu now opens the board | Goes to `{ name: 'policies' }` |

The slider's scrim covers the head, so the switch cannot be flipped while V2 is open.

**Edition gate (`src/brand/edition.ts`)**
- Add `policyTesting: boolean`: Full `true`, Lite `false`.
- Add `withShowcasePins(f) = SHOWCASE ? { ...f, policyTesting: true } : f` and use it where `store.tsx` builds `features: featuresOf(edition)` (around line 722).
- Add a `GAPS` entry with title "Policy testing" and the question "Which policy decides this person on this app, and why?"
- Update `edition.test.ts` so its withheld list includes `'policyTesting'`.

---

## 3. Layout, states and copy

### 3.1 Shared anatomy

**The views control.** The kit's `Tabs` in the default pill flavour (`.bx-tabs`, a greyscale selection), named `"Policy testing"` on the page and slider and `"Board test"` in the board. The names must differ because `layoutId` is `tabs-${name}`. The four options, with icons:

| View | Icon |
|---|---|
| Try a sign-in | `LogIn` |
| Check a person | `UserSearch` |
| Saved sign-ins | `BookmarkCheck` |
| Sample sign-ins | `Layers` (not shown in V3) |

The panel under the tabs is `role="tabpanel"`. Its content comes from `TestingWorkbench` (V1, V2) or `BoardTestViews` (V3).

**Columns.** The container `.tst` uses `container-type: inline-size`.
- At 700 px or more of inline width, `.tst__cols` is `minmax(0,1fr) minmax(0,1fr)` with a 16 px gap: fields on one half, result on the other. This follows the 50/50 page rule.
- Below 700 px, fields stack above the result.

### 3.2 V1 at 1,120 px

Rail 200, main 920, `.bpage` padding 20 on each side (the ≤1120 rule, `console-theme.css:359`), content 880.

```
┌ rail 200 ──┬ main 920 ─ pad 20 ┬──────────── content 880 ───────────────────────────┬ 20 ┐
│ Policies ▾ │ Policy testing                         [Testing  Rail page ▾] [Documentation]
│  All Pol…  │ See which policy decides a sign-in, and why.                             │
│ ▌Policy    │ [Try a sign-in|Check a person|Saved sign-ins|Sample sign-ins]  pill, 34 h │
│  testing   │ ┌ fields 432 ─────────────────┐ 16 ┌ result 432 ────────────────────────┐ │
│  Templates │ │ Person ⓘ                    │    │                [↑][↓][↻] [Save sign-in]│
│  Zones     │ │ [KM Kavya Menon          ▾] │    │ Which policy ⓘ                      │ │
│  …         │ │ Application                 │    │▌HRMS access from corporate offices │ │
│            │ │ [▤ HRMS                  ▾] │    │   Decides this sign-in             │ │
│            │ │ IP address ⓘ                │    │  Global Default Policy             │ │
│            │ │ [203.0.113.25             ] │    │   An app policy applies            │ │
│            │ │ Looked up: Pune, India·AS64500   │  › Not on HRMS                     │ │
│            │ │ Place                       │    │ Who                                │ │
│            │ │ [From IP address · Pune  ▾] │    │  Human Resources · in audience     │ │
│            │ │ When                        │    │ Rules ⓘ                            │ │
│            │ │ [2026-09-28][09:30][Asia/K▾]│    │  1 In a corporate office   Matched │ │
│            │ │ Device                      │    │    203.0.113.25, Pune (looked up) ·│ │
│            │ │ [Not stated              ▾] │    │    in zone Corporate offices     ✓ │ │
│            │ │ Device risk score           │    │    Network matches · Place matches ⓘ│
│            │ │ [Not stated               ] │    │  Nothing else matched  Not reached │ │
│            │ │ Assume on ⓘ                 │    ├ Decision (sticky bottom) ──────────┤ │
│            │ │ [Nothing                 ▾] │    │ [Allow with 2FA]                   │ │
│            │ └─────────────────────────────┘    │ HRMS access from corporate offices │ │
│            │                                    │ · In a corporate office            │ │
│            │                                    │ › What they see ⓘ                  │ │
└────────────┴────────────────────────────────────┴────────────────────────────────────┴───┘
```

The Decision block is `position: sticky; bottom: 0` inside the result column, with the surface colour and a top hairline, so the answer stays on screen while a long route scrolls.

### 3.3 V2 at 1,120 px

The kit `Drawer`: `width={780} resizable minWidth={560} maxWidth={980}`, `title="Policy testing"`, no footer. The tabs sit at the top of the body with `position: sticky; top: 0`. Body padding is 20, so the inner width is 740.

```
┌ rail 200 ┬ list 140 ┊ scrim ┬───────────── slider 780 ─────────────────────────────┐
│          │ Policies ┊       │ Policy testing                                   [×] │ head 60
│          │ …        ┊       │ [Try a sign-in|Check a person|Saved…|Sample…]        │ sticky
│          │          ┊       │ ┌ fields 362 ─────────────┐16┌ result 362 ──────────┐ │
│          │          ┊       │ │ (same fields as V1)     │  │ (same route as V1)   │ │
```

At 560 px (inner 520), fields and result stack. Tables switch to their narrow columns (§3.6–3.8).

### 3.4 V3 (Spec A's board, 1,120 px)

The rail auto-collapses to 64 px on the board (`Shell.tsx`, `BUILDER_SCREENS`). The board is 1,056 px wide. The test panel is 480 px with a 12 px inset, so the canvas is 552 px and the panel's inner width is 448.

```
┌64┬ ← Policies › HRMS access from corporate offices [Active]   [Try a sign-in] [Save policy]┐ 48
│  │ canvas 552: chain, blue marker          ┊ panel 480                                     │
│  │                                         ┊ [Try a sign-in|Check a person|Saved sign-ins] │
│  │  Which policy stage (expanded):          ┊  Try: Spec A's panel; presets = SAMPLE_SIGN_INS│
│  │   ▌HRMS access… Decides this sign-in     ┊  Check a person: PersonView surface="panel"   │
│  │    Global Default Policy · An app policy ┊  Saved: SavedView surface="panel"             │
```

- **The views control** appears only when `features.policyTesting && version === 'board'`. Otherwise Spec A's panel shows its Try content alone.
- **The Which policy stage** renders `WhichPolicy compact` in place of Spec A's one-line stage.
- **Check a person and Saved sign-ins** evaluate with `substitute = draft`, meaning Your edits, whenever the board has unsaved or unpublished changes.

### 3.5 Try a sign-in

Every question is a label over a full-width control. "When" is one question with three controls in a row: date 140, time 96, time zone the rest.

| Label | Control | Values and copy |
|---|---|---|
| **Person**, TipDot "People from the sample directory." | `Picker` searchable, `noun="people"`, placeholder "Choose a person" | Option: name. Meta: group name. `art`: `<Face kind="person" name size="sm" decorative />` |
| **Application** | `Picker` searchable, `noun="applications"`, placeholder "Choose an application" | Option: app name. `art`: `<AppLogo appId size={16} />` |
| **IP address**, TipDot "Looked up in a test address list, not live geo-IP." | `<input type="text">`, placeholder "203.0.113.25" | Hints under the field: "Looked up: {city}, {country} · {asn}" when a fixture row holds the address; "Not in the test address list" when the address is valid but no row holds it; `role="alert"` "Not an IP address" when `!isAddress(v)` |
| **Place** | `Picker` searchable | First option "From IP address", summarised as "From IP address · Pune", or "From IP address · none" when no row places it. Then every `PLACES` city, with meta `placeContext(p)` |
| **When** | `<input type="date">` (aria "Date"), `<input type="time">` (aria "Time"), `Picker` (aria "Time zone") over `TIMEZONES` (`data.ts`) | An empty time means the whole `when` is not stated. An empty date gives the evaluator's standard-time caveat. |
| **Device** | `Picker` | "Not stated", then the presets (§5.3), then "Custom". Choosing Custom keeps the Picker reading "Custom" and adds fields under it (the rule that a custom value adds a control, never swaps one out). Editing any field of a preset turns the Picker to Custom with the values kept. |
| (Custom) **Platform** | `Picker` | Not stated · Windows · macOS · iOS · Android · Linux |
| (Custom) **OS version** | text | Empty means not stated |
| (Custom) **Form factor** | `Picker` | Not stated · Mobile · Tablet · Laptop |
| (Custom) **Integrity** | `Picker` | Not stated · Intact · Rooted or jailbroken · Tampered · Emulator · Not reported (`null`) |
| (Custom) **Screen lock** | `Picker` | Not stated · None · Pattern · PIN or passcode · Biometric · Not reported (`null`) |
| (Custom) **miniOrange Authenticator** | `Picker`, plus a text "Version" when Installed | Not stated · Installed · Not installed (`null`) |
| (Custom) **Device Agent** | `Picker`, plus a text "Version" when Installed | Not stated · Installed · Not installed |
| (Custom) **Registered to this person** | `Picker` | Not stated · Yes · No |
| (Custom) **Devices already registered** | `NumberStepper` 0–10 | — |
| **Device risk score** | `<input type="number" min=0 max=100>`, placeholder "Not stated" | Hint "Rules on {app}: below 40 · above 39 · above 70", built by `riskThresholds` from enforcing policies on the app and shown only when they have any. Error "Enter 0 to 100". |
| **Assume on**, TipDot "Evaluated as if it were on. Nothing is changed." | `Picker` | "Nothing", then App Access policies that cover the app and are Inactive, Draft or hold a `pendingDraft`. Meta: "Inactive", "Draft" or "Saved draft". The field renders only when there is at least one option. Changing the app resets it if the policy no longer covers the app. |

**Result column**, top to bottom. This is the order the marker travels.

1. **Head row.** Three `IconButton`s, `tone="ghost"`, `size="sm"`: "Back" (ChevronUp), "Step" (ChevronDown), "Replay" (RotateCcw). Then `Button variant="secondary" size="sm"` "Save sign-in" (BookmarkPlus). It is disabled while incomplete, with the title "Choose a person and an application".
2. **Which policy**, TipDot "Custom groups beat the DEFAULT group; list order stands in for weight."
   - **Rows** come from `resolution.standings`, in list order and grouped by `groupStandings`.
   - **"On {app}" rows are shown**: the system policy plus policies whose `appIds` include the app. Each row is the policy name as a link button (opens `{ name: 'board', policyId }`) with the engine's reason under it, verbatim.
   - **The deciding row** has a 3 px `--accent` left edge, the name in ink, and the reason "Decides this sign-in".
   - **`not-in-audience` rows** show the name struck through.
   - **Inactive or Draft rows that cover the app** carry a link button "Assume on", which sets `form.assumeOn`.
   - **The assumed policy** carries a neutral `Badge` "Assumed on".
   - **Other policies** fold under a disclosure button "Not on {app}", collapsed by default and with no count. Inside it, the reason is shown only when it is not "Does not cover {app}".
   - **`watching` rows (Monitor)** show the name, a neutral `Badge` "Monitor" and the `DecisionPill`, with TipDot "Recorded, not enforced." This block is absent while `watching` is empty.
3. **Who.** "{person's group} · in audience". For an Everyone audience: "Everyone".
4. **Rules**, TipDot "Prototype model: ordered rules, first match wins."
   - **Per rule:** an index tile, the name, and a state word right-aligned:
     - "Matched": ink, with a `CheckCircle2` icon in `--fb-positive-fg`.
     - "Not matched": `--text-secondary`, with an `X` icon.
     - "Can't tell": `--text-secondary`, text only.
     - "Off" and "Not reached": `--text-tertiary`.
     - "Not for this person": when `who === 'out'`, with TipDot `whoReason`.
   - **Expanded by default:** the matched rule, every "Can't tell" rule, and the stage under the marker. Every other rule has a chevron to expand it.
   - **Each condition line** reads `` `${actual} · ${required}` `` with a pass (✓), fail (✗) or grey "Can't tell" mark. TipDot = `detail`, plus `caveat` on a new line when one is set.
   - **Zone conditions** add a tertiary line "Network {w} · Place {w}", where `w` is "matches", "doesn't match", "can't tell" or "any". A half that was not asked is omitted.
   - **Device profile conditions** list each `ProfileCheck` whose status is not `not applicable` as `` `${label}: ${actual} · needs ${required}` ``. Not-applicable checks are omitted.
   - **Last row:** "Nothing else matched" with its `DecisionPill`.
5. **Decision** (sticky).
   - `DecisionPill` md, then a second line: the policy name as a link (to the board), " · ", the rule name as a link (to the board with `rule`, or `'fallback'` for the last row).
   - **When Assume on is set and the decision differs:** a tertiary line "Today: {decision} · {today's policy}".
   - **When the resolution depends:**
     - "Can't tell" in `--text-secondary` at `--fs-lg`.
     - One line per possible outcome: `DecisionPill` sm plus "if “{rule}” matches". For the last row: "if no rule matches".
     - A "Needs:" line of link buttons, one per fact (`FIELD_LABEL`). Each focuses its field.
   - **`WhatTheySee`** as a disclosure titled "What they see", TipDot "Approximation of the sign-in page.", collapsed by default:
     - Deny: the deny message verbatim (`rule.denyMessage ?? DEFAULT_DENY_MESSAGE`).
     - Allow with 2FA: "Password, then {first second-factor method or 'any enabled method'}".
     - Allow on 1 factor: "Password".
     - Spec A's richer component replaces this with the same props.
6. **Save sign-in form.** Opened by the head button; appears under the head, inside the column. It is never a modal.
   - **Name:** text, max 60, default `freeName('{person} on {app}', savedNames)`.
   - **Expected:** `Picker` with the three decision words. Defaults to the shown decision. For Can't tell there is no default and Save stays off.
   - **Level:** `Picker`, default "Note":
     - Note, meta "Checked, never blocks"
     - Must pass, meta "Blocks saving and turning on"
     - Protected, meta "Blocks, and can't be overridden"
   - **Buttons:** "Cancel" (neutral) and "Save" (`variant="brand"`, the one orange control on the page). Toast: "Sign-in saved".

### 3.6 Check a person

- **Controls row**
  - Person `Picker`. It is the same `form.personId` as Try, so the two views share one person.
  - A tertiary scenario line from `formSummary`, for example "203.0.113.25 · Pune (looked up) · 28 Sep 2026 09:30 Asia/Kolkata · Device not stated · Risk not stated", followed by the link button "Edit sign-in", which switches to Try.
  - When Assume on is set: an active `Chip` "Assuming {policy} on", removable to clear it.
- **Table.** One row per application in `store.apps` order. No pager and no count. The header is sticky.

| Column | 880 px | 740 px | 448 px (V3) |
|---|---|---|---|
| Application: logo and name | 220 | 25% | 150 |
| Policy: the deciding policy name | 280 | 32% | 150, with TipDot "Rule: {rule}" |
| Rule: rule name, or for a depends row the first undecided rule's name | 200 | 23% | (in the tooltip) |
| Decision: `DecisionPill`, or "Can't tell" plus "{decision} or {decision}" | 180 | 20% | 148 |

- **Rows are buttons.** A click switches to Try with that app.
- **When a substitute applies** (Assume on, or Your edits in V3) and a row's decision differs from Today, the Decision cell adds the tertiary line "Today: {decision}".

### 3.7 Saved sign-ins, with Break-in

- **Bar**
  - Left: `SearchBox` with placeholder "Search saved sign-ins…" and label "Search saved sign-ins".
  - Then a `Picker` with `icon={ListFilter}`, `prefix="Level"`: All · Note · Must pass · Protected.
  - In V3 only, add a `Picker` with `prefix="Show"`: "This policy's apps" (default) · "All".
  - Right: `Button variant="secondary"` "Break-in test" (ShieldAlert), which toggles the Break-in section.
  - The assumption chip, as in §3.6.
- **Table**, sorted by `savedRows`: Fail, then Can't tell, then Pass; within each, Protected, Must pass, Note; then by name.

| Column | 880 px | 448 px (V3) |
|---|---|---|
| Sign-in: name, TipDot = `formSummary` | 212 | 180 |
| Level: inline `Picker` sm, commits at once, toast "Saved"; Protected shows a `Lock` icon | 128 | (in the tooltip) |
| Expected: inline `Picker` sm, toast "Saved" | 160 | 130 |
| Actual: `DecisionPill`, or "Can't tell" | 132 | (in the tooltip) |
| Result: a positive `Badge` "Pass", a negative `Badge` "Fail", or `--text-secondary` "Can't tell" | 84 | 98 |
| Decided by: policy name, truncated with `title` | 124 | (in the tooltip) |
| `RowMenu`, label "Actions for {name}", items: "Try" (LogIn), "Delete" (Trash2, danger, divide) | 40 | 40 |

- **Delete** uses `ConfirmDelete` with `noun="saved sign-in"`, then the toast "{name} deleted" with Undo, which restores the row with the same id.
- **Break-in section** (the owner's counts-only ruling):
  - Heading "Break-in test". When cards were skipped, a TipDot shows "Not run for people outside the audience: {names}" (the text is `skipped[0].reason` minus its "Not in audience: " prefix).
  - A `Picker` (`label="Policy to test"`, `prefix="Policy"`) over App Access policies with at least one app, excluding the system policy. Meta: "Active", "Inactive", "Draft" or "Saved draft". Default: the assumed policy, else the Try decider if it is not the Global Default, else the first such policy. The run uses `openForEditing(policy)`. V3 has no Picker and runs on the board's draft.
  - `Button variant="secondary"` "Run".
  - **Four tiles** in a row, 208 px each at 880, with numbers at `--fs-2xl`/600:
    - Got through (`--fb-negative-fg` when above 0)
    - Weaker factor (`--fb-notice-fg` when above 0)
    - Locked out (`--fb-notice-fg` when above 0)
    - Extra prompts (ink)
  - **Rows table:** Attempt 300 · Person 160 · Asked 140 · Got 140 · Result 140. Only rounds whose outcome is not `held` are listed, with the result words "Got through", "Weaker factor", "Locked out", "Extra prompts", "Less than asked" and "Can't tell". A disclosure button "Show held attempts" / "Hide held attempts" reveals the rest ("Held").

### 3.8 Sample sign-ins (`SAMPLE_SIGN_INS`, not shown in V3)

All samples use a stated `when` of 2026-09-28, 09:30, Asia/Kolkata. Decisions are computed live; the right-hand column below is what the evaluator currently returns on the showcase.

| id | Sample | Person | Application | Other facts | Decision · policy · rule |
|---|---|---|---|---|---|
| hr-office | HR in the office | Kavya Menon `u-hr-1` | HRMS | 203.0.113.25 | Allow with 2FA · HRMS access from corporate offices · In a corporate office |
| hr-home | HR at home | Neha Kapoor `u-hr-2` | HRMS | 192.0.2.10 | Deny · same policy · Nothing else matched |
| sales-hrms | Sales on HRMS | Aisha Khan `u-sales-1` | HRMS | 203.0.113.25 | Allow on 1 factor · Global Default Policy · Baseline access |
| no-address | No address given | Kavya Menon | HRMS | — | Can't tell: Allow with 2FA or Deny |
| android-12 | Contractor on Android 12 | Devon Rao `devon` | Microsoft Outlook | device `android-12` | Deny · Device compliance for Outlook and Dropbox · Nothing else matched |
| personal-laptop | Personal laptop | Rahul Verma `u-sales-2` | Google Workspace | `win11-no-agent`, risk 12 | Deny · Access the app through corporate devices only · Nothing else matched |
| third-device | Third device | Emily Carter `u-sales-3` | Google Workspace | `win11-unregistered` with `registeredCount: 2`, risk 12 | Deny · same policy · Nothing else matched |
| medium-risk | Registered laptop, medium risk | Emily Carter | Google Workspace | `win11-registered`, risk 48 | Allow with 2FA · same policy · Medium risk — password and OTP |
| dev-office | Developer in the office | Arun Patel `arun` | GitHub Enterprise | 203.0.113.10, `win11-registered` | Allow on 1 factor · Developer tools — office and device checks · In the office on a compliant device |

- **Table:** Sample 236 · Person 180 · Application 180 · Decision 244 · an `IconButton` "Save sign-in" (BookmarkPlus) 40.
- **Rows are buttons.** A click loads the sample into Try: `session.load`, the view becomes Try, and the marker plays.
- **Save sign-in** opens the §3.5 save form inside Try, prefilled from the sample.
- **Samples whose person or application id is missing from the tenant are hidden.**

### 3.9 States

| State | What shows |
|---|---|
| **Empty (first open)** | The form holds `DEFAULT_FORM` (sample hr-office). The result shows at once, and the marker plays once. If the tenant lacks those ids, the first person and first app are used with the other fields not stated. |
| **Loading** | The route chunk: the existing `Suspense` fallback `<div class="bpage" aria-busy="true">`. The slider chunk: `<div class="tst__loading" aria-busy="true">`, blank, with no spinner. Evaluation is synchronous. The result reads `useDeferredValue(form)`, and while the deferred value lags, the result column is at `opacity: .6` with `aria-busy="true"`. |
| **Result** | As in §3.5–3.8. |
| **Unknown facts** | "Can't tell", the outcomes with "if …", and "Needs:" links (the Decision stage). In tables: "Can't tell" plus "{a} or {b}". Never a pass. A saved sign-in whose result is unknown is "Can't tell", never "Pass". |
| **Error: typed input** | Field errors with `role="alert"`: "Not an IP address", "Enter 0 to 100". The evaluator still receives the address. `zone-match.ts` treats it as undecided, so the result shows Can't tell with "Needs: IP address, Place". |
| **Error: incomplete** | Missing person or app: `EmptyState` compact, icon LogIn, "Choose a person and an application", blurb "Every policy on the application is checked." Missing Global Default: icon ShieldAlert, "No global default policy", blurb "Sign-ins no policy decides can't be tested." |
| **Saved: empty** | `EmptyState` icon BookmarkCheck, "No saved sign-ins", blurb "Save one from Try a sign-in.", action secondary "Try a sign-in" |
| **Saved: no matches** | `NoMatches noun="saved sign-ins"` with Clear |
| **Samples: empty** | `EmptyState` icon Layers, "No samples for this tenant", blurb "Samples use the showcase people and apps." |
| **Check a person: no person** | `EmptyState` compact, icon UserSearch, "Choose a person", blurb "Each application's decision for one person." |
| **Break-in: no policy** | `EmptyState` compact, icon ShieldAlert, "No policy to test", blurb "Break-in runs on a policy with an application." |

**Page and entry copy**
- Page head title: "Policy testing". Caption: "See which policy decides a sign-in, and why."
- V2 head button: "Policy testing".
- Row menu item: "Try a sign-in".
- Rail item: "Policy testing".

---

## 4. Components

### 4.1 Reused (paths and names confirmed in the worktree)

**Page chrome**
- `src/brand/Shell.tsx`: `PageHead` (gains an `action?: ReactNode` prop rendered before Documentation with the `.bpage__docs` look), `NAV`, `POLICY_SCREENS`, `Toast`.
- `src/brand/screens/page-bar.tsx`: `PageBar`.

**Kit controls (`src/brand/kit.tsx`)**
- `Drawer`, `Tabs`, `Toggle`, `TipDot`, `TipMark`, `Tip`, `Button`, `IconButton`, `RowMenu` / `MenuItem`, `Badge`, `Chip`, `SearchBox`, `NumberStepper`, `Field`.
- `src/brand/picker.tsx`: `Picker` / `PickerOption`, using `art`, `meta`, `prefix`, `icon`, `summary`, `disabled` options.
- `src/brand/empty.tsx`: `EmptyState`, `NoMatches`.
- `src/brand/faces.tsx`: `Face`. `src/brand/logos/AppLogo.tsx`: `AppLogo`.
- `src/brand/screens/confirm-delete.tsx`: `ConfirmDelete`.

**Store and domain**
- `src/brand/store.tsx`: `useBrand`, `BrandScreen`, `BrandStore`.
- `src/brand/policy-draft.ts`: `openForEditing`. `src/brand/policy-name.ts`: `freeName`.
- `src/brand/data.ts`: `TIMEZONES`, `FALLBACK_NAME`, `DEFAULT_DENY_MESSAGE`, `enforces`, `AccessDecision`, `newId`.
- `src/brand/places.ts`: `PLACES`, `placeContext`.

**Evaluator (Phase 0)**
- `screens/simulate.ts`: `SignInFacts`, `SignInDevice`, `ConditionResult`, `ZonePart`, `ProfileCheck`, `RuleTrace`, `PolicyTrace`, `PossibleOutcome`, `FactKey`, `EvalLibrary`, `SimEnv`, `CHIP_DEVICES`, `TENANT_TZ`.
- `screens/tenant-resolver.ts`: `resolveSignIn`, `TenantResolution`, `PolicyStanding`, `ResolveOptions` (`substitute`), `WatchedResult`, `audienceNames`.
- `screens/geo-fixture.ts`: `lookUpAddress`. `screens/zone-validation.ts`: `isAddress`. `screens/zone-match.ts`: `placeOfSignIn`.
- `screens/gauntlet.ts`: `runBreakIn`, `TYPED_DECK`, `BreakInCounts`, `AttemptOutcome`, `BreakInResult`.

**Motion**
- `MotionConfig reducedMotion="user"`, already in `BrandApp.tsx`. `useReducedMotion` from `motion/react`.
- For styling, follow the existing `.bx-decision--positive / --notice / --negative` classes (`DecisionChip`). The pill here is new because `DecisionChip` prints "Allow / MFA / Deny".

### 4.2 New files (the shared core, `src/brand/screens/testing/`)

| File | Exports | Used by |
|---|---|---|
| `testing-version.ts` | §2.5 | Shell, Policies, PolicyTesting, BoardBuilder |
| `TestingVersionSwitch.tsx` | `TestingVersionSwitch` | Policies head, PolicyTesting head |
| `session.tsx` | `TestingSessionProvider`, `useTestingSession`, `TestingView`, `FormField` | Every version, and Spec A's panel |
| `sign-in-form.ts` | `SignInForm`, `DEFAULT_FORM`, `factsOf`, `formOf`, `formSummary`, `FormIssue` | Every version, and Spec A |
| `device-presets.ts` | `DevicePresetId`, `DEVICE_PRESETS` | Form, samples |
| `samples.ts` | `SampleSignIn`, `SAMPLE_SIGN_INS` | Samples view; Spec A's presets |
| `use-tenant-env.ts` | `useTenantEnv(): SimEnv` (store version of `envOf`, with `appName`, `userName`, `library`, `riskScale`, `hasZone`, `hasFingerprint`) | Every version |
| `selectors.ts` | `DECISION_WORDS`, `tryResult`, `assumeOptions`, `groupStandings`, `personRows`, `savedRows`, `riskThresholds`, `outcomeWords`, `FACT_FIELD`, `FIELD_LABEL`, `stageKeys` | Every view |
| `SignInFields.tsx` | `SignInFields` | Try (V1, V2); Spec A's panel |
| `WhichPolicy.tsx` | `WhichPolicy({ resolution, policies, appId, assumedId, compact })` | Try; V3's stage |
| `RouteList.tsx` | `RouteList`: marker, Back, Step, Replay | Try (V1, V2) |
| `DecisionStage.tsx` | `DecisionPill`, `CantTell`, `DecisionStage`, `SaveSignInForm` | Try; tables |
| `WhatTheySee.tsx` | `WhatTheySee({ decision, rule })` | Try; Spec A replaces it with the same props |
| `PersonView.tsx` | `PersonView({ surface, substitute? })` | Every version |
| `SavedView.tsx` | `SavedView({ surface, substitute?, policyId? })` | Every version |
| `BreakInSection.tsx` | `BreakInSection({ policy?, policies, env })` | Saved view |
| `SamplesView.tsx` | `SamplesView` | V1, V2 |
| `TestingWorkbench.tsx` | `TestingWorkbench({ surface: 'page' \| 'slider' })` | V1, V2 |
| `PolicyTestingSlider.tsx` | `PolicyTestingSlider({ open, onClose })` | V2 |
| `BoardTestViews.tsx` | `BoardTestViews({ draft, saved, dirty, env, children })`; children are Spec A's Try panel | V3 |
| `testing.css` | `.tst__*` | All of the above |
| `src/brand/screens/PolicyTesting.tsx` | `PolicyTesting({ view })`: the V1 route | V1 |
| `src/brand/saved-sign-ins.ts` | `SavedSignIn`, `SignInLevel`, `LEVEL_LABEL` | Store, Spec C |

**New tests**
- `screens/testing/testing-version.test.ts`
- `screens/testing/sign-in-form.test.ts`
- `screens/testing/selectors.test.ts` (showcase)
- `screens/testing/samples.test.ts`: every id exists in `showcaseTenant()`, and every decision matches §3.8.
- `src/brand/ui-copy.test.ts`: fails if any file under `screens/testing/` or `PolicyTesting.tsx` contains "gauntlet", "blast radius", "rehearse" or "try a login", case-insensitive, comments included.

### 4.3 Modified files

- **`store.tsx`**
  - Route union (§2.2).
  - `savedSignIns`, `addSavedSignIn`, `updateSavedSignIn`, `removeSavedSignIn`.
  - Reset in `setPersona` beside `setScenarios`.
  - Add to the memo dependency list (about line 983).
  - `withShowcasePins`.
- **`BrandApp.tsx`**
  - Lazy route, `warm`, `case`.
  - `<TestingSessionProvider key={persona}>` wrapping the shell inside `Chrome()`.
- **`Shell.tsx`:** rail child plus filter, `POLICY_SCREENS`, `PageHead.action`.
- **`screens/Policies.tsx`**
  - `preview={<TestingVersionSwitch />}`.
  - V2 `action` button.
  - `policyMenu` item `{ id: 'test', label: 'Try a sign-in', icon: FlaskConical }` after Edit. `RowAction` gains `'test'`.
  - Slider state `testingOpen: TestingView | null`, initialised from the `testing` prop.
- **`edition.ts` and `edition.test.ts`** (§2.5).
- **`fixtures.ts`:** `Tenant.savedSignIns`. `tenantAt` returns `[]`; `showcaseTenant` returns `showcaseSavedSignIns`.
- **`showcase-seed.ts`:** `showcaseSavedSignIns` (§5.4).
- **`kit.css`:** add `input[type='date']` to the two `:where(...)` input selectors at lines 730 and 745.
- **`screens/board/BoardPage.tsx` and `BoardBuilder.tsx`:** the `rule` parameter, and the V3 `BoardTestViews` mount in Spec A's panel.

---

## 5. Data and state

### 5.1 Session: `session.tsx`, a React context above `Screen`

The session is **not** kept on `BrandStore`. Putting a keystroke-rate value there changes the store's identity, which re-renders every `useBrand()` consumer. `store.tsx:444–455` documents that problem for the toast.

```ts
export interface TestingSession {
  form: SignInForm
  view: TestingView
  runId: number                 // bumped by load(), replay(), first mount; never by patch()
  lastEdited: FormField | null  // drives "Changed by …" under reduced motion
  patch(p: Partial<SignInForm>, field: FormField): void
  load(form: SignInForm): void  // bumps runId, clears lastEdited
  replay(): void
  setView(v: TestingView): void
}
```

- **Text fields** (IP address, OS version, the version boxes, risk) keep a local value and call `patch` only after 300 ms idle, on blur, or on Enter. Pickers call `patch` at once.
- **Lifetime.** The session lasts until reload, survives navigation and version flips, and resets on a persona switch (`key={persona}`).

### 5.2 The form (`sign-in-form.ts`)

```ts
export interface SignInForm {
  personId: string | null
  appId: string | null
  address: string                                   // '' = not stated
  place: { kind: 'from-address' } | { kind: 'stated'; placeId: string }
  date: string; time: string; timeZone: string      // '' = not stated; timeZone ∈ TIMEZONES
  device: { kind: 'none' } | { kind: 'preset'; id: DevicePresetId } | { kind: 'custom'; facts: SignInDevice }
  risk: string                                      // '' = not stated
  assumeOn: string | null
}
export function factsOf(form: SignInForm): { facts: SignInFacts; issues: FormIssue[] }
```

**Mapping to facts**
- `network`: `{ address, source: 'typed' }` whenever the address is not empty, even when invalid.
- `location`: for `stated`, taken from `placeOf(placeId, 'stated')` in `geo-fixture.ts`. For `from-address` it is left `undefined`, so the evaluator looks it up.
- `when`: omitted when `time` is empty. `date` is included only when set. `source: 'stated'`.
- `device`: taken from the preset or custom facts with `source: 'stated'`.
- `risk`: `{ score, source: 'stated' }` when 0–100.
- `formOf(facts)` is the inverse, used by samples and saved sign-ins. A device that does not equal any preset becomes `custom`.

### 5.3 `DEVICE_PRESETS`

All presets have `source: 'stated'`.

| id | Label | Facts |
|---|---|---|
| android-12 | Android 12 phone | android, 12, Mobile, integrity all false, screenLock `pin`, Authenticator `6.5` |
| android-14 | Android 14 phone | Same, OS 14 |
| iphone | iPhone, iOS 17.5 | `CHIP_DEVICES['Known < 90 days']` |
| win11-registered | Windows 11 laptop, registered | `CHIP_DEVICES['Managed (MDM)']` |
| win11-unregistered | Windows 11 laptop, not registered | `CHIP_DEVICES['Changed fingerprint']` |
| win11-no-agent | Windows 11 laptop, no Device Agent | windows 10.0.22631, Laptop, integrity, screenLock and Authenticator all `null`, agent `false`, agentVersion `null`, registered `false`, count 0 |
| win10 | Windows 10 laptop | `CHIP_DEVICES['Known > 90 days']` |

### 5.4 Saved sign-ins (store: tenant data, seeded, reset per persona)

```ts
export type SignInLevel = 'note' | 'must-pass' | 'protected'
export interface SavedSignIn {
  id: string; name: string; facts: SignInFacts /* appId and personId required */
  expected: AccessDecision; level: SignInLevel; savedBy: string; savedAt: string
}
```

`addSavedSignIn` returns `newId('ssi', taken, name)`, following the store's `add*` contract.

**`showcaseSavedSignIns`** (all five pass on load):

| id | Name | Facts | Expected | Level |
|---|---|---|---|---|
| ssi-kavya-office | Kavya Menon in the office | sample hr-office | Allow with 2FA | Must pass |
| ssi-neha-home | Neha Kapoor at home | sample hr-home | Deny | Note |
| ssi-aisha-hrms | Aisha Khan on HRMS | sample sales-hrms | Allow on 1 factor | Note |
| ssi-devon-android | Devon Rao on Android 12 | sample android-12 | Deny | Must pass |
| ssi-ravi-hrms | Ravi Menon on HRMS | `u-it-1`, HRMS, 203.0.113.25, same `when` | Allow on 1 factor | Protected |

### 5.5 Derived values (pure functions in `selectors.ts`, memoised per component)

- **`DECISION_WORDS`** = `{ '1fa': 'Allow on 1 factor', '2fa': 'Allow with 2FA', deny: 'Deny' }`. The testing surfaces use only this map.
- **`tryResult(policies, form, env)`** returns `{ facts, issues, today, assumed, shown }`.
  - `today` = `resolveSignIn(policies, facts, env)`.
  - `assumed` is the same call with `{ substitute: openForEditing(policy) }` when Assume on is set.
  - `shown` = `assumed ?? today`.
- **`personRows(policies, apps, form, env, substitute?)`** returns one row per app, overriding `appId`.
- **`savedRows(saved, policies, env, substitute?)`** gives each row a result: `'pass'` when `status === 'decided' && decision === expected`; `'fail'` when decided and different; `'unknown'` for `depends` or `incomplete`. Sorted as in §3.7.
- **`riskThresholds(policies, appId)`** lists `device-risk` conditions on enforcing policies covering the app, as "below N" or "above N", deduped, in rule order.
- **`FACT_FIELD`** maps each missing fact to a field:
  - `person` → Person; `app` → Application
  - `address`, `asn` → IP address
  - `location*` → Place
  - `date`, `time` → When
  - `risk` → Device risk score
  - `device.*` → Device (and opens the custom fields)
- **`stageKeys(resolution)`** gives, per stage, a key plus a content hash (decision, match, statuses). It drives the marker's stops and the cross-fades.

Memo inputs are `store.policies`, `zones`, `fingerprints`, `users`, `groups`, `methods`, `apps`, `riskScale` and the committed form. Nothing re-evaluates on each keystroke, because text fields commit on idle (§5.1).

### 5.6 What persists

| Where | What |
|---|---|
| localStorage `idp.policyTesting` | The version only (pinned by `TESTING_VERSION_CHOSEN` in the showcase once chosen) |
| Session memory | Form, view, runId, lastEdited |
| Store | Saved sign-ins |
| Component state (resets on leaving the view) | Search, Level and Show filters, Break-in policy and result, disclosure states |

---

## 6. Motion

Every animation below explains something, runs under 1.6 s, and never plays while a key is being pressed (text fields commit on idle).

| What | Explains | Spec |
|---|---|---|
| **Route marker** | The evaluation order | `motion.span.tst__marker`: 3 px wide, `--accent`, absolutely positioned at the left of `RouteList`. Keyframes on `y` and `height` through the stops Which policy → Who → each reached rule → the deciding rule or last row → Decision. Unreached rules are skipped. Each step lasts `min(160, 1200 / stops)` ms with ease `[0.2, 0, 0, 1]`, so the total is at most 1.2 s. Triggered only by `runId`: first mount, loading a sample or a row-menu prefill, Replay. It stays on the final stop, which becomes the active edge. Back and Step move it one stop in 160 ms. |
| **Changed stages** | What a committed edit changed | A stage whose hash changed animates opacity 0.35 → 1 over 160 ms. |
| **Check a person cells** | Which applications changed | The same 160 ms opacity fade on changed Decision cells only. |
| **Saved reorder** | Failing rows move up | `layout="position"` on `motion.tr` rows, 200 ms. |
| **Break-in rows** | Attempts run in order | First run: each row fades in over 120 ms, 40 ms apart (15 cards at most, so 0.72 s or less). Later runs: only rows whose outcome changed fade. Tiles appear without counting up. |
| **Slider, tabs** | Existing | The kit `Drawer` spring on `x` and the kit `Tabs` `layoutId` spring. Nothing is added. |

**The transform trap.** `.tst__marker` and `motion.tr` must carry no `transform`, `translate`, `scale` or `rotate` in any CSS rule or state, hover included. Motion owns the transform, and placement uses `top` and `left`.

**Reduced motion** (`useReducedMotion()`)
- The marker is placed on its final stop with no travel.
- Every opacity fade and the stagger have a duration of 0. `MotionConfig` already turns off layout and transform animation.
- A stage that changed on the last commit shows a tertiary label "Changed by {FIELD_LABEL[lastEdited]}", for example "Changed by IP address", until the next commit.

---

## 7. Accessibility

**Focus order, V1 Try**
1. `h1`, Version picker, Documentation.
2. The tablist (one tab stop; the kit gives it roving tabindex and arrow, Home and End keys).
3. The fields: Person, Application, IP address, Place, Date, Time, Time zone, Device, then the custom fields when open, Device risk score, Assume on.
4. The result: Back, Step, Replay, Save sign-in, the Which policy links, the "Not on {app}" disclosure, the rule disclosures and TipDots, the Decision links, the "Needs:" buttons, What they see.

**V2.** The `Drawer` (via `useDialogChrome`) traps focus. On open, focus moves to the active tab. Escape closes the slider and returns focus to its opener: the row-menu trigger or the head button.

**V3.** Focus follows Spec A's panel order, with the views tablist first.

**Live region.** Each surface has one hidden `role="status" aria-live="polite"` region in the result column. It speaks:
- on a `runId` change, and
- on a committed edit that changes the decision or the deciding policy.

It says "{decision}. {policy}, {rule}." or "Can't tell. Needs {fields}." and does not repeat an unchanged answer. Choosing a sample moves focus to the Decision heading (`tabIndex={-1}`).

**Keyboard.** The page has no single-key shortcuts. Back, Step and Replay are buttons. Table rows are `<button>` elements (Enter or Space), with accessible names such as "HRMS, HRMS access from corporate offices, Allow with 2FA, try this sign-in".

**Not colour alone.** Every status carries a word. "Can't tell" uses `--text-secondary` for contrast. The marker is `aria-hidden`; the stage under it gets `aria-current="step"`.

**Errors.** Field errors are `role="alert"` and linked with `aria-describedby`. "Needs:" buttons move focus to their field.

---

## 8. Acceptance checks (showcase tenant, light mode, 1,120 px)

Run these in your own browser tab. Also repeat them with reduced motion.

**Switch**
- [ ] 1. The Policies head shows "Testing  Rail page" at the right edge. No other preview switch is visible.
- [ ] 2. Choosing Version 1 shows "Policy testing" as the second rail child under Policies. It opens the page; the Policies parent and the child are active.
- [ ] 3. Choosing Version 2 removes the rail item and shows "Policy testing" beside Documentation. It opens a 780 px slider over the list, leaving 340 px of window behind the scrim.
- [ ] 4. Choosing Version 3 removes both entries. The row menu "Try a sign-in" opens the board in test mode with the panel tabs Try a sign-in, Check a person, Saved sign-ins. Before Spec A lands, Version 3 is disabled with "Needs the builder's test mode".
- [ ] 5. After a reload the choice persists. Flipping from the V1 page to V2 lands on Policies with the slider on the same view and form.
- [ ] 6. With `TESTING_VERSION_CHOSEN = 'slider'` set, the switch is gone and V2 is active even when storage says `page`.

**Try a sign-in (V1 and V2)**
- [ ] 7. The first open shows Kavya Menon, HRMS, 203.0.113.25, "Looked up: Pune, India · AS64500". The result is Allow with 2FA by "HRMS access from corporate offices · In a corporate office". The marker travels once, in 1.2 s or less.
- [ ] 8. Which policy shows HRMS access from corporate offices ("Decides this sign-in") and Global Default Policy ("An app policy applies"). "Not on HRMS" is collapsed and has no number.
- [ ] 9. The rule line reads "203.0.113.25, Pune (looked up) · in zone Corporate offices" ✓ and "Network matches · Place matches".
- [ ] 10. Typing 192.0.2.10: no marker travel. After the pause, the decision is Deny by "Nothing else matched", and the line reads "Network doesn't match · Place matches". What they see shows "HRMS opens only from a corporate office. Contact IT if you need access from elsewhere."
- [ ] 11. Typing 203.0.113: "Not an IP address" appears. The decision is "Can't tell" in grey, with "Allow with 2FA if “In a corporate office” matches" and "Deny if no rule matches", and "Needs: IP address, Place". Clicking IP address focuses the field.
- [ ] 12. Person Aisha Khan: the Global Default Policy decides, Allow on 1 factor. The HRMS row is struck through with "Not in audience: Human Resources, Finance".
- [ ] 13. Devon Rao, Microsoft Outlook, "Android 12 phone": Deny by "Device compliance for Outlook and Dropbox · Nothing else matched", with "Android OS version: 12 · needs ≥ 13" ✗. Checks for Windows, iOS and macOS are not listed.
- [ ] 14. Turn off "HRMS access from corporate offices" from its row menu. Back in Try with Kavya: Allow on 1 factor by the Global Default. Setting Assume on to that policy (meta "Inactive") gives Allow with 2FA and "Today: Allow on 1 factor · Global Default Policy".
- [ ] 15. Save sign-in opens an inline form with "Kavya Menon on HRMS", Expected "Allow with 2FA" and Level "Note". Save shows "Sign-in saved", and the row appears in Saved sign-ins.

**Check a person**
- [ ] 16. With Kavya, 203.0.113.25 and device Not stated, there is one row per application:
  - HRMS: Allow with 2FA, HRMS access from corporate offices, In a corporate office.
  - Microsoft Outlook and Dropbox: "Can't tell: Allow on 1 factor or Deny".
  - Every other application: Allow on 1 factor, Global Default Policy, Baseline access.
- [ ] 17. Setting Device to "Android 14 phone" in Try, then returning: only the Outlook and Dropbox cells fade, to Allow on 1 factor, Compliant device.

**Saved sign-ins and Break-in**
- [ ] 18. The five seeded rows all show Pass. There are no counts in the tabs or the bar.
- [ ] 19. With the HRMS policy turned off: "Kavya Menon in the office" (Must pass) and "Neha Kapoor at home" (Note) show Fail at the top, in that order. Rows move over 200 ms, or instantly under reduced motion.
- [ ] 20. Break-in on "HRMS access from corporate offices": Got through 0, Weaker factor 0, Locked out 1, Extra prompts 0. The one row is "Finance working from home · Priya Sharma · Allow with 2FA · Deny · Locked out". The heading TipDot says "Not run for people outside the audience: Human Resources, Finance".
- [ ] 21. Break-in on "Device compliance for Outlook and Dropbox": Got through 5, Weaker factor 0, Locked out 2, Extra prompts 0. Two "Less than asked" rows are listed with no tile.
- [ ] 22. Break-in on "Developer tools — office and device checks": Weaker factor 1, the row "Sign-in relayed through a phishing proxy".

**Samples**
- [ ] 23. There are nine rows with the §3.8 decisions. "No address given" shows Can't tell. Clicking "Registered laptop, medium risk" loads Try with Emily Carter, risk 48, Allow with 2FA by "Medium risk — password and OTP", and the marker plays.

**Rules, all versions**
- [ ] 24. Orange appears only on the inline Save, "New policy" and the rail's active edge. The tabs are grey pills. The deciding row and the marker are blue.
- [ ] 25. No UI string contains gauntlet, blast radius, rehearse or "try a login" (`ui-copy.test.ts` passes). All copy is sentence case.
- [ ] 26. Under reduced motion: no marker travel, no fades, and "Changed by IP address" appears on changed stages.
- [ ] 27. `npm test`, `npx oxlint` (warnings at or below the branch baseline) and `npm run build` are all clean.

---

## 9. Open questions for the owner

1. **Tabs colour.** The four views are sections of the page. By the kit's own note that is the underline tabs' job, and the owner made underline tabs orange on 15 Sep. That conflicts with "orange only on the primary button, rail edge, New".
   - *Recommendation:* use the grey pill `Tabs` on all three versions, and keep underline tabs on object pages such as Device profiles.
2. **Decision words elsewhere.** The testing surfaces say "Allow on 1 factor / Allow with 2FA / Deny". Elsewhere the board's `DecisionChip` says "Allow / MFA / Deny" and `DECISION_LABEL` says "1 factor / 2 factors / Deny".
   - *Recommendation:* move `DECISION_LABEL` and `DecisionChip` to the three phrases in one copy pass after a version is chosen, not in this build.
3. **Break-in outcomes without a tile.** "Less than asked" and "Can't tell" rounds fall outside the four counts. On the showcase, Device compliance has two "Less than asked" rounds.
   - *Recommendation:* list them in the rows, with no tile and no count.
4. **Where the switch lives.** Option A is the Policies page head (and the testing page head). Option B is the top bar, which would make it reachable from the board.
   - *Recommendation:* A. It is where Flow and Width were compared, and V3 is reached from the list anyway.
5. **V2 modality.** Option A is a modal `Drawer` at 780 px. Option B is a docked `DockPanel` beside a narrowed list, which keeps the list usable.
   - *Recommendation:* A, as briefed. B leaves about 480 px for the testing views at 1,120 px, which forces one column.
6. **Protected sign-ins on this surface.** Can they be deleted or have their expectation changed here?
   - *Recommendation:* yes, with the typed DELETE confirmation. "Protected" changes only what the guard allows (Spec C).
7. **Default version before a pick.** What should show when nothing is stored?
   - *Recommendation:* Version 1, the rail page, matching the doc's recommendation. It is the only version fully demonstrable before Spec A lands.