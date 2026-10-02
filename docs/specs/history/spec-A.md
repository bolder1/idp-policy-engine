# Spec A: Phase 1, Try a sign-in (board test mode)

Worktree: `C:\New folder\IDP Policy Engine\.claude\worktrees\kind-heyrovsky-5ec74e`, with the Phase 0 work in place but not committed. I read every file named below and changed nothing. I ran a probe from the scratchpad against `showcaseTenant()`. Its outputs are the ones quoted in §8.

---

## 1. Purpose and scope

**Purpose.** An admin enters one sign-in on the policy board: a person, an application, an address, a place, a time, a device and a risk score. They watch the tenant and this policy decide it, one stage at a time, down the rule chain. The run ends on the page that person would see.

The panel shows two versions side by side, following the version table. Every condition reads "actual · required". A missing fact never counts as a pass: the route shows every outcome that fact could produce.

**In scope (Phase 1)**
- A "Try a sign-in" button on the board bar, with shortcut **T**. It takes the old Check pips' place.
- Test mode on the board:
  - The inspector column is fixed at 480 px and becomes the sign-in panel.
  - The chain shows stages with a blue marker.
  - Cards carry per-condition evidence.
- Two version columns, "What they see", "Would change if", printed boundaries on the time, risk and distance controls, origin presets plus a typed IP, and person search.
- An entry in the Policies row menu.
- "Try a login" retired from `CheckTab`, and the pips removed from `BoardBarActions`.
- New edition flag `trySignIn`, on in Lite and Full.

**Out of scope, with the phase that owns it**
- Saved and protected sign-ins, Break-in counts UI, Compare, and the tenant-wide testing page with its 3-variant switch: Phase 2.
- What changes for a group, factor readiness, and the "Before saving" and "Before turning on" guard (owner decision 4): Phase 3.
- Describe it: Phase D.
- Monitor status: later. `TenantResolution.watching` is read and ignored.
- Seeding HRMS as Inactive: Phase 4 (see Q7).

No A/B switch is added, so `SHOWCASE` needs no new pin.

---

## 2. Entry points and navigation

| # | Entry | Where | Behaviour |
|---|---|---|---|
| E1 | **Try a sign-in** button | `BoardBarActions` (`screens/board/BoardBar.tsx`), where `<span className="bbtop__pips">` is today, before `bbtop__sep` and Discard | Toggles test mode. Shown when `features.trySignIn`. Disabled when `draft.type !== 'App Access'`. |
| E2 | Key **T** (unmodified) | `keyHandler` in `BoardBuilder.tsx`, after the `owned` guard, next to the `e` binding | Toggles test mode. It does not fire in a field, inside `.bb__insp`, behind a dialog, or when `draft.type !== 'App Access'`. |
| E3 | Row menu **Try a sign-in** | `policyMenu()` in `screens/Policies.tsx`, directly after "Edit policy" | `store.go({ name: 'board', policyId, open: 'try' })`. Shown when `features.trySignIn && policy.type === 'App Access'`. |
| E4 | ⌘K "Try a sign-in" (kbd T) | `boardCommands` in `BoardBuilder.tsx` | Full only, because Lite has no palette. |

**Routing**
- In `store.tsx`, `BrandScreen` gains `{ name: 'board'; policyId: string; open?: 'gauntlet' | 'impact' | 'try' }`.
- `BoardPage.tsx` passes `openSheet={open === 'gauntlet' ? 'check' : open === 'impact' ? 'impact' : undefined}` and `openTest={open === 'try'}`.
- `BoardBuilder` gains a prop `openTest?: boolean`. It seeds `const [testing, setTesting] = useState(!!openTest)`.
- The first-arrival tour effect skips when `openTest` is set, the same way it skips for `openSheet`.

**Leaving test mode**
- Pressing the button again, pressing T, pressing × in the panel header, or Esc (see §7).
- Focus returns to the Try a sign-in button.
- Opening `BoardSheet` from the Full palette or the route also leaves test mode.
- Navigating away drops test mode. The inputs persist in the store for the session (§5).

**Inside test mode**
- Clicking a card, the start node or the last row selects it. The column swaps to the normal `Inspector`, still 480 px, and the route stays live.
- The Inspector's × reads "Back to Try a sign-in" and clears the selection, which returns the sign-in panel.
- The width toggle is hidden and the grip is not rendered.
- Every draft edit re-runs the test. Edits come from the Inspector, a card toggle, the ⋯ menu, a drag, undo, or a policy chip.

**Empty policy.** If the chooser (`BoardEmpty`) is showing, test mode renders the empty chain: start node, gates, last row, decision. It does not set `scratch`, so the chooser returns on exit.

---

## 3. Layout, states and copy

### 3.1 Pixel budget at a 1,120 px viewport

The shell rail is 200 px (`shell.css`, `@media (max-width: 1120px)`), which leaves a 920 px content column.

```
┌ rail 200 ┬──────────────────────────── content 920 ─────────────────────────────────┐
│          │ bbtop 48: ← Policies › HRMS access fr…✎ [Active▾][Unsaved] ·· [▶ Demo·2:00][🎓][⎆ Try a sign-in] │ [Discard][Save draft][Save policy] │
│          ├──────── chain 428 ────────┬────────────── panel track 492 ─────────────────┤
│          │                            │ ┌──────── sign-in panel 480 ─────────────┐ 12 │
│          │  cards and gates 380 wide  │ │ header 44                               │    │
│          │  zoom 100 % (fit)          │ │ body scrolls, 16 px inner padding       │    │
│          │                            │ └─────────────────────────────────────────┘    │
└──────────┴────────────────────────────┴─────────────────────────────────────────────────┘
```

**CSS rules** (new file `screens/board/try-sign-in.css`, imported by `BoardBuilder.tsx` next to `./board.css`)
- `.bb.is-testing { grid-template-columns: minmax(0, 1fr) 492px; --bb-card: 380px; }`
  - The track is fixed, not `min(var(--bb-insp), 46%)`, because 46 % of 920 is 423 px.
  - `.bb__insp` keeps its existing 12 px top, right and bottom margin, so it measures 480.
- `.bb.is-testing .bb__grip { display: none; }`
- Fit:
  - The chain column is 920 − 492 = 428 px. The card is 380 px, and 380 plus the 40 px fit padding is at most 428, so `fitTo` lands at zoom 1.0.
  - `Board` gains a `fitKey` prop (`'test' | 'edit'`) and calls `fit()` 220 ms after it changes. The delay lets the grid transition (`--dur-normal`, 200 ms) finish.
- Bar:
  - The Try a sign-in button (`size="sm"`) is about 118 px.
  - The title keeps its rule that it gives way first, and ellipsises (`.bbtop__title`). No control wraps.

**Wider viewports.** The chain column grows, cards stay 380 px, and the panel stays 480 px.

### 3.2 The chain in test mode (left column, 380 px items)

```
 ●─ A login arrives at HRMS — Kavya Menon, 203.0.113.24, 09:30        ← stage "Sign-in" (existing start pill)
 │
 ┌ Which policy  This policy                               Decides ┐  ← gate, 380×40, disclosure ▾
 └────────────────────────────────────────────────────────────────┘
 │
 ┌ Who           Kavya Menon · Human Resources         In audience ┐  ← gate
 └────────────────────────────────────────────────────────────────┘
 │
 ●┌ 1  In a corporate office                        [2 factors] ⏻ ⋯ ┐ ← RuleCard, forced folded
  │ Matched                                                         │
  │ Who        Kavya Menon · Human Resources, Finance       Passes  │  ← evidence lines
  │ Network    203.0.113.24 · 203.0.113.0/24, 198.51.100.0/24 Passes│    88 | 1fr | 64
  │ Location   Pune (looked up) · within 25 km of Pune, or …  Passes│
  └─────────────────────────────────────────────────────────────────┘
 │
 ┌ Nothing else matched                              [Deny]   ┐  Not reached (dimmed)
 └────────────────────────────────────────────────────────────┘
 │
 ┌ Decision      [Allow with 2FA]                                  ┐  ← gate
 │               HRMS access from corporate offices · Rule 1       │
 └─────────────────────────────────────────────────────────────────┘
 Modelled result ⓘ
```

**Marker**
- A 12 px circle at `left: -20px`, vertically centred on the gate or card head row.
- It travels down the left edge of the column.
- Blue fill `var(--accent)` (#0d6efd in the rebrand) with a halo `0 0 0 4px var(--accent-soft)`.
- At an undecided rule it becomes a hollow ring: 2 px `var(--text-muted)`, no fill.

**Gates**
- Class `.bb__gate`: `grid-template-columns: 88px minmax(0,1fr) auto`, min-height 40 px, 12 px side padding, `--surface-raised`, 1 px `--border-subtle`, `--radius-md`.
- The stage the marker sits on gets `border-color: var(--accent)`, the blue active state.

**Connectors.** The `Link` component in `Board.tsx` gains `bare?: boolean`. In test mode every link is bare: the `+` is not rendered and the lit line stays. So no orange `is-invite` appears in test mode.

**Cards**
- In test mode, `expandedOf` returns `false` for every card without touching `folds` or `density`.
- The dock's "Expand all" button is hidden.
- `RouteEvidence` replaces the `bb__verdict` paragraph.

### 3.3 The sign-in panel (right column, 480 px)

```
┌ Try a sign-in                         [↺][◀][▶]   [×] ┐ 44 px, .bb__inspbar
├───────────────────────────────────────────────────────┤ body padding 16 → 448 px content
│ Person       [(KM) Kavya Menon   Human Resources ▾]    │ rows: 96 | 1fr | auto(source word)
│              Sample directory                          │
│ Application  [HRMS ▾]                                  │
│ From         (Office network)(Branch office)            │ preset chips, wrap
│              (Home broadband)(Tor exit)                │
│ Address      [203.0.113.24                ]   stated   │
│ Place        Pune, India ⓘ        looked up [Other place ▾] │
│ Distance     0 ──●────┃25 km──────────── 100    0 km from Pune │  only if a range is read
│ When         [2026-09-26][09:30][Asia/Kolkata ▾] stated │  only if time/day is read
│ Device       [(⊞) Windows 11 laptop · registered ▾] [Edit details] stated │ only if read
│ Device risk  ├──●──┃40──────┃71──────┤  [12]    stated │  only if read
│   score        Allow on 1 factor | Allow with 2FA | Deny │  band labels (printed)
├───────────────────────────────────────────────────────┤
│ Live ⓘ                   │ Your edits ⓘ               │ 2 × 220, gap 8
│ HRMS access from corp…   │ HRMS access from corp…     │
│ Rule 1 · In a corporate… │ Nothing else matched       │
│ [Allow with 2FA]         │ [Deny]                     │
├───────────────────────────────────────────────────────┤
│ ▾ Would change if                                      │ board Section, hidden when empty
│   Sign-in  (From Corporate offices network → Allow with 2FA) │
│   Policy   (Turn on rule 2 → Deny)                     │
├───────────────────────────────────────────────────────┤
│ ▾ What they see · Your edits                           │ board Section, collapsible
│   [ Password | Google Authenticator ]  (Seg, 2FA only) │
│   ┌──────────── 320 ────────────┐                      │
│   │ (logo) Sign in to HRMS       │                     │
│   │ Enter the code from          │                     │
│   │ Google Authenticator         │                     │
│   │ [□□□□□□]                     │                     │
│   │ [ Verify ]  (ink, not orange)│                     │
│   └──────────────────────────────┘                     │
│   Approximation of the sign-in page                    │
└───────────────────────────────────────────────────────┘
```

**Rows**
- Row class `.bb__trow`: `grid-template-columns: 96px minmax(0,1fr) auto`, gap 8, min-height 36 px.
- Labels are 12 px `--text-secondary`. Source words are 12 px `--text-muted`.
- Only the rows the relevant policies read are rendered (§5.3). Person, Application, From and Address always show.

**Columns**
- `.bb__tcols`: 2 × 220 px. When there is one column, it spans 448 px.
- Each column reads, top to bottom:
  - version label and TipDot
  - policy name (one line, ellipsis, full name in `title`)
  - rule line
  - decision

**Decisions** are always a kit `Badge`:
- `positive`: Allow on 1 factor
- `notice`: Allow with 2FA
- `negative`: Deny

"Depends" and "Can't tell" are grey text (`--text-muted`), never a Badge.

### 3.4 Version columns (the version table, in code)

`columnsFor(saved, draft, appId)` in `try-sign-in.ts`. Here `edited = differsFromLive(saved, draft)` from `policy-draft.ts`, which includes a saved `pendingDraft`.

| `saved.status` | edited | Left column | Right column | Resolution call (`resolveSignIn(store.policies, facts, env, opts)`) |
|---|---|---|---|---|
| `active` / `always-on` | no | **Live** | — | Live: no `opts` |
| `active` / `always-on` | yes | **Live** | **Your edits** | Your edits: `{ substitute: draft }` |
| `inactive` | no | **Today** | **Stored version** | Today: no `opts`. Stored: `{ substitute: saved }` |
| `inactive` | yes | **Today** | **Your edits** | `{ substitute: draft }` |
| `draft` | any | **Today** | **Draft** | `{ substitute: draft.appIds.length \|\| draft.isSystem ? draft : { ...draft, appIds: [appId] } }` |

- `draft` here is BoardBuilder's `draft`. Name, apps and audience are already overlaid from `saved`.
- A substitute counts as enforcing (`ResolveOptions` in `tenant-resolver.ts`).
- The chain and "What they see" always show the right-most column.
- When a draft has no applications, the right column's rule line is preceded by "As if on {App}".

### 3.5 States

| State | When | Panel | Chain |
|---|---|---|---|
| Empty | `personId` or `appId` is null (cleared, or empty directory). The resolver returns `status 'incomplete'` | Field placeholder "Choose a person" or "Choose an application". Columns show "Can’t tell" (grey) and "Choose a person". No chips. What they see hidden | Who gate: value "Choose a person", word "Can’t tell". Marker ring stops on Who. Cards neutral. Decision gate: "Can’t tell" |
| Loading | None. Evaluation is synchronous (well under 5 ms per resolve). While a typed field debounces (300 ms), the previous result stays on screen, not dimmed, with no spinner | — | — |
| Result | `status 'decided'` | As sketched | As sketched. Cards after the landing card read "Not reached" and are dimmed (existing `is-unreached`) |
| Unknown facts | `status 'depends'` | Column shows "Depends" (grey) and "Allow on 1 factor or Deny" (the distinct `possible` decisions in rule order). What they see gets a Seg with one segment per possible decision, labelled with the decision words | The first rule with `match 'unknown'` reads "Can’t tell". Its unknown lines are grey with a TipDot "Needs: {fact words}". The marker ring stops there. Cards below are neutral, not dimmed. Decision gate lists outcomes (§3.6) |
| Error: bad address | Address text fails `isAddress` (`zone-validation.ts`) | Inline under the field: "Enter an IPv4 or IPv6 address" (`--fb-negative-fg`, `aria-invalid`). The run omits `network` | Zone lines read "Can’t tell", Needs: Address |
| Error: no global default | `missing: ['a global default policy']` | Column: "No policy decides" | Which policy gate: "No Global Default Policy", word "Can’t tell" |
| Not app access | `draft.type !== 'App Access'` | Button disabled, `title` "Only app access policies decide sign-ins" | — |

### 3.6 Copy, word for word (sentence case, labels and one-line tooltips only)

**Decision words.** Add `DECISION_SAID` to `data.ts`: `{ '1fa': 'Allow on 1 factor', '2fa': 'Allow with 2FA', deny: 'Deny' }`. Every testing surface uses it. `DECISION_LABEL` stays as it is for existing screens.

**Bar**
- Button "Try a sign-in", icon `LogIn`, `title` "Try a sign-in (T)".
- Disabled `title`: "Only app access policies decide sign-ins".

**Panel header**
- h2 "Try a sign-in".
- IconButtons: `RotateCcw` "Replay", `StepBack` "Back one stage", `StepForward` "Next stage".
- × "Close Try a sign-in". The kit `Tip` shows the label.

**Rows**

| Row | Label | Control and exact strings | Source word |
|---|---|---|---|
| Person | "Person" | `Picker` searchable, placeholder "Choose a person". Groups "In this policy" and "Not in this policy". Option `meta` = group name; `art` = `<Face kind="user" name size="sm" decorative/>`. Sub-label "Sample directory" | — |
| Application | "Application" | `Picker`, placeholder "Choose an application" | — |
| From | "From" | Preset chips "Office network", "Branch office", "Home broadband", "Tor exit" | — |
| Address | "Address" | Text input, placeholder "IPv4 or IPv6 address", `aria-label` "Address" | "typed" or "stated" (preset) |
| Place | "Place" | Value "{City}, {Country}", "No place" (anonymiser) or "Not in the sample address table". TipDot "Sample address table, not geo-IP". `Picker` searchable, summary "Other place", footer "Use looked-up place" | "looked up" or "stated" |
| Distance | "Distance" | `<input type="range">` 0 to max(100, 4 × range) km, step 1. Left label "From {range label}". Value "{n} km". Printed boundary tick "{km} km" | "stated" |
| When | "When" | Date input "Date", time input "Time", `Picker` "Time zone" over `TIMEZONES` (`data.ts`). TipDot on the label, only when a `time` condition is read: "Buffer time not modelled" | "stated" |
| Device | "Device" | `Picker` of presets (§5.4), with `PlatformMark` as `art`. Ghost `Button` "Edit details" / "Hide details". Detail rows: "Platform", "OS version", "Device type", "Integrity", "Screen lock", "miniOrange Authenticator", "Device Agent", "Registered to this person", "Other registered devices". Every Picker offers "Not stated" | "stated" |
| Risk | "Device risk score" | Range 0–100 plus a number input (`aria-label` "Device risk score"). Printed boundary ticks. Band labels under the track. TipDot on the label when the platform is Windows or macOS: "Risk signals are collected on Android and iOS only" | "stated" |

**Column labels and TipDots**
- "Live": "Decides sign-ins now"
- "Your edits": "The rules on this board, as if saved"
- "Today": "Decides sign-ins now; this policy is off"
- "Stored version": "This policy’s saved rules, as if turned on"
- "Draft": "This draft, as if turned on"

**Column rule line**
- "Rule {n} · {rule name}"
- "Nothing else matched" (`FALLBACK_NAME`)
- Another policy's rule: "{rule name}"

**Gates**
- Which policy:
  - Value "This policy" (word "Decides") or "{decider name}" (word "Not deciding").
  - The disclosure (button `aria-label` "Which policy: every policy on {App}") lists each policy covering the app, and the system policy, as "{policy name}" plus `PolicyStanding.reason` verbatim.
  - Losing names are struck through (`text-decoration: line-through`, `--text-secondary`). The decider reads "Decides this sign-in".
  - Open by default only when this policy does not decide.
- Who: value "{Person} · {Group}". Word "In audience", "Not in audience", "Everyone" or "Can’t tell".
- Decision:
  - Badge, then "{Policy name} · {rule line}".
  - After an update that changed the decision: "Changed by {input}", where input is one of Person, Application, Address, Place, Distance, When, Device, Device risk score, your edits.
  - Depends: "Depends", then one line per outcome, "If rule {n} matches → [Badge]", then "If not → [Badge]", then "Needs: {fact words}".
  - Incomplete: "Can’t tell".
- Model note under the Decision gate: "Modelled result", with TipDot "This tenant’s policies, zones and devices; addresses from a sample table".

**Card evidence**
- Header word: "Matched", "No match", "Can’t tell", "Switched off" or "Not reached".
- Status words: "Passes" (`--fb-positive-fg`), "Fails" (`--fb-negative-fg`), "Can’t tell" (`--text-muted`).
- Line label: `conditionType(typeId).label`, or "Who", "Network", "Location", or the check label from `ProfileCheck.label`.
- Device profile summary line: "{profile name} · {p} of {m} checks pass". Rows marked `not applicable` are left out of m.

**Would change if**
- Section title "Would change if". Group labels "Sign-in" and "Policy".
- Chip text: "{change} → {decision}".
- Policy chip `title`: "Edits the board; not saved".
- Toast after a policy chip: "{what}. Not saved yet.", with Undo (existing `offerUndo`).

**What they see**
- Section title "What they see · {column label}". Caption "Approximation of the sign-in page".
- Mock page strings:
  - Header: "Sign in to {App}".
  - Password step: "Username" (value: person email), "Password" (•••••••••), button "Sign in".
  - Second step: title "Verify it’s you", then by `enrolShapeFor(method.id).kind` (`user-methods.ts`):

    | kind | Text |
    |---|---|
    | authenticator | "Enter the code from {method}" and six boxes |
    | push-app | "Approve the request in {method}" |
    | email | "Enter the code sent to {masked email}" |
    | alt-email | "Enter the code sent to your alternate email" |
    | phone | "Enter the code sent to your phone" |
    | phone-and-email | "Enter the code sent to your phone and {masked email}" |
    | passkey | "Use your passkey" |
    | questions | "Answer your security questions" |
    | token / assigned | "Enter the code from your token" |
    | none | "{method}" |

  - Button "Verify".
  - If `rememberMfa && !forceMfaEachLogin`: "Remember this device for {rememberDays ?? 30} days".
  - Deny step: title "Access denied", then `rule.denyMessage ?? DEFAULT_DENY_MESSAGE` verbatim, then link-styled "Back to sign in".
  - Specific first factor: "Passkeys" → "Use your passkey"; "Magic link" → "Send me a sign-in link".
  - No available second method: "{method} is not available" in grey.
- The mock's buttons are ink (`--surface-inverse`), never orange.

**Screen reader only (`u-sr-only`, `role="status"`)**
- "{Decision}. {Policy}, {rule line}."
- Depends: "Depends. {A} or {B}."
- Updates: "Now {Decision}. Changed by {input}."

**Banned in all new strings:** "gauntlet", "blast radius", "rehearse", "try a login". A test enforces this (§4.4).

---

## 4. Components

### 4.1 Reused, verified in code

| What | Path | Use |
|---|---|---|
| `BoardBuilder` | `src/brand/screens/board/BoardBuilder.tsx` | Host: `testing` state, env, keys, palette, column swap |
| `BoardBar`, `BoardBarActions` | `src/brand/screens/board/BoardBar.tsx` | Button replaces `.bbtop__pips` |
| `BoardPage` | `src/brand/screens/board/BoardPage.tsx` | `open: 'try'` |
| `Board`, `Link` (internal) | `src/brand/screens/board/Board.tsx` | Gates, marker, evidence; `bare` links; `fitKey` |
| `RuleCard`, `TerminalCard` | `src/brand/screens/board/RuleCard.tsx` | `evidence` and `marker` props |
| `Inspector` | `src/brand/screens/board/Inspector.tsx` | Rule editing while testing: new props `testing` (hide width toggle, × label) and `swap` |
| `Section`, `Seg` | `src/brand/screens/board/Section.tsx` | Collapsible panel sections; What they see switch |
| `patchRule`, `ruleAt`, `TONE`, `Selection` | `src/brand/screens/board/model.ts` | Policy chips; tones |
| `boardShortcuts` | `src/brand/screens/board/shortcuts.ts` | Add T |
| `Button`, `IconButton`, `Badge`, `Toggle`, `TipDot`, `Tip`, `NumberStepper` | `src/brand/kit.tsx` | `Button` gains `pressed?: boolean` (renders `aria-pressed`) and `keys?: string` (renders `aria-keyshortcuts`). Nothing else changes |
| `Picker` | `src/brand/picker.tsx` | Person (searchable, `group`, `meta`, `art`), App, Place, Time zone, Device, detail pickers |
| `Face` | `src/brand/faces.tsx` | Person option art |
| `PlatformMark` | `src/brand/logos/PlatformMark.tsx` (Platform = android, ios, windows, macos) | Device preset art |
| `AppLogo` | `src/brand/logos/AppLogo.tsx` | Mock page header |
| `resolveSignIn`, `TenantResolution`, `PolicyStanding`, `audienceNames` | `src/brand/screens/tenant-resolver.ts` | Every column |
| `ConditionResult`, `RuleTrace`, `PolicyTrace`, `PossibleOutcome`, `SimEnv`, `personOf` | `src/brand/screens/simulate.ts` | Evidence |
| `SignInFacts`, `SignInDevice`, `SignInPlace`, `FactKey`, `TENANT_TZ`, `CHIP_DEVICES` | `src/brand/screens/sign-in-facts.ts` | Facts |
| `lookUpAddress`, `placeOf` | `src/brand/screens/geo-fixture.ts` | Place row, chips |
| `placeOfSignIn` | `src/brand/screens/zone-match.ts` | Place row |
| `isAddress`, `classifyIp`, `ipv4Number`, `parseIpv6` | `src/brand/screens/zone-validation.ts` | Address validation; representative address for chips |
| `searchPlaces`, `haversineKm`, `rangeKm`, `KM_PER_MILE` | `src/brand/places.ts` | Place picker, distance ruler |
| `ProfileCheck` | `src/brand/fingerprint.ts` | Device evidence |
| `FACTOR_RANK`, `ruleFactor` | `src/brand/screens/factor-strength.ts` | Chip strictness |
| `methodBlocker`, `DEFAULT_METHOD_ID`, `AuthMethod` | `src/brand/methods.ts` | What they see |
| `enrolShapeFor` | `src/brand/user-methods.ts` | Prompt kind |
| `enforces`, `appsOf`, `rangeText`, `conditionType`, `TIMEZONES`, `FALLBACK_NAME`, `DEFAULT_DENY_MESSAGE` | `src/brand/data.ts` | Throughout |
| `differsFromLive` | `src/brand/policy-draft.ts` | Columns |

**Not used:** `DockPanel` (`screens/dock-panel.tsx`) is a list-page slider. On the board, the inspector track already is the slider column.

### 4.2 New files

| File | Contents |
|---|---|
| `src/brand/screens/board/try-sign-in.ts` | Pure model (§5.2): presets, `defaultInput`, `rowsRead`, `factsOf`, `columnsFor`, `runColumns`, `routeOf`, `boundariesOf`, `wouldChangeIf`, `screensOf`, `hopMs`, `changedBy`, `INPUT_LABEL` |
| `src/brand/screens/board/try-sign-in.test.ts` | §8 scenes as unit tests, plus the banned-word test over `SignInPanel.tsx?raw`, `SignInScreen.tsx?raw`, `RouteGate.tsx?raw` and `try-sign-in.ts?raw` |
| `src/brand/screens/board/SignInPanel.tsx` | `<aside className="bb__insp is-test" aria-labelledby>` with header, rows, columns, chips, What they see, and the status region |
| `src/brand/screens/board/SignInScreen.tsx` | The 320 px mock, from `ScreenStep[]` |
| `src/brand/screens/board/RouteGate.tsx` | `RouteGate`, `RouteEvidence`, `RouteMarker` |
| `src/brand/screens/board/try-sign-in.css` | Every class above: `.bb.is-testing`, `.bb__gate`, `.bb__marker`, `.bb__evidence`, `.bb__trow`, `.bb__tcols`, `.bb__tband`, `.bb__screen`, `.bb__insp.is-swap` |

**Preset chips.** They use kit `Chip` markup classes (`bx-chip`, `bx-chip__main`, `is-on`, which is blue in the rebrand) inside `role="radiogroup"`, with each main button `role="radio"`. The kit `Chip` component itself is not changed.

### 4.3 Retired and kept

- **`CheckTab.tsx`: retire "Try a login".**
  - Delete the `<Section title="Try a login">` block and its state (`who`, `place`, `device`, `auth`, `risk`, `clock`, `ctx`, `rehearse`, `r`, `hitRule`, and the result `motion.div`).
  - Delete the local `Row` and `Chip` helpers.
  - Delete the `trace` and `onTrace` props.
  - Delete the now-unused imports: `AUTH_STATES`, `DEVICE_OPTIONS`, `PLACES`, `RISKS`, `SIM_USERS`, `walk`, `SimContext`, `CLOCKS`, `DECISION_NAME`, `shortAuth`, `uncapitalise`, `Trace`, and `Play`/`X` if unused.
  - Rewrite the header comment so it names two questions, Break-in test and Ready to publish.
  - Keep "Break-in test" (legacy `DECK`, Full only) and "Ready to publish" until Phase 2.
- **`BoardSheet.tsx`: keep** as the Full-only host of Check and What changes. Remove the `trace` and `onTrace` props. In Full it opens only by route (`open: 'gauntlet' | 'impact'`, from the Policies exposure link) or from the palette: "Open Check" and "Open What changes".
  - Phase 2 moves Break-in into Saved sign-ins. Phase 3 moves What changes into the panel ("Test a group instead"). After that, `BoardSheet`, `CheckTab` and `ImpactTab` are deleted.
- **`BoardBarActions`: remove both pips** and the `bbtop__sep` that followed them. Q1 covers the What changes pip in Full.
  - Remove the props `test`, `movement`, `sheet` and `onSheet`.
  - Add `testing: boolean`, `canTest: boolean` and `onTest: () => void`.
  - `data-tour="board-tools"` moves to the button wrapper as `data-tour="try-sign-in"`. No test or tour stop references `board-tools`; `board-tour.test.ts` checks `board-dock` and `review`.
- **`BoardBuilder.tsx`: delete** the `test` (`runGauntlet`) and `movement` (`compare(sweep…)`) memos, which the pips were their only readers of. Delete the `trace` state, the re-walk effect, the `walk` import, and `setTrace(null)` in `revert` and `discardEdits`.
  - Add `appName: (id) => store.apps.find((a) => a.id === id)?.name ?? id` to `env`. Without it the resolver prints "Does not cover hrms".
- **`model.ts`:** delete `interface Trace` and its `SimContext`/`TraceResult` import. Keep `CLOCKS`, `shortAuth` and `uncapitalise`, which `ImpactTab` still uses.
- **`Board.tsx`:** delete the `trace` prop, the `revealed`/`STEP` cascade and the `bb-token` `layoutId`, replacing them with §5 and §6.
  - `RuleCard`'s `traceKind`, `traceReason` and `landed` props, and `TerminalCard`'s `landed` and `reached` props, become `evidence` and `marker`.
  - `IfBlock` is left unchanged; its `token` prop is simply no longer passed.
  - Remove the orange `rgba(235, 84, 36, 0.18)` shadow on `.bb__token` in `board.css`.
- **`shortcuts.ts`:** `ShortcutOptions.gauntlet` becomes `testing`.
  - Add `['T', 'Try a sign-in']` when `testing` is true.
  - Esc reads "Close Try a sign-in, then clear the selection" when testing, else "Clear the selection".
  - Update `board-helpers.test.ts` to pass `testing`, and assert that T is listed in Lite.
- **`edition.ts`:** add `trySignIn: boolean` to `Features`, true in both `FULL` and `LITE`. `GAPS` is unchanged.

### 4.4 Build order (about 8 days, per p4)

1. `data.ts` (`DECISION_SAID`), `edition.ts`, `store.tsx` (screen union, `signInTests`), kit `Button` props.
2. `try-sign-in.ts` and its tests. This is the whole model and runs without UI.
3. `RouteGate.tsx`, then `Board.tsx`, `RuleCard.tsx` and CSS for the chain in test mode.
4. `SignInPanel.tsx` and `SignInScreen.tsx`.
5. `BoardBuilder.tsx` wiring, `BoardBar.tsx`, `Inspector.tsx` props, the `Policies.tsx` menu.
6. Retirements (§4.3) and `shortcuts.ts`.
7. Gate:
   - `npx vitest run` is green.
   - `npx tsc -b` is clean.
   - `npx oxlint` shows at most 31 warnings, none new.
   - `npm run build` is clean.
   - The browser check in §8 passes. Confirm which worktree owns localhost:5173 first.

---

## 5. Data and state

### 5.1 Store (`store.tsx`, session only, never localStorage)

```ts
signInTests: Record<string, SignInInput>            // last input per policy id
setSignInTest: (policyId: string, input: SignInInput) => void
```

- Written on every input change.
- Read when test mode opens. A missing entry falls back to `defaultInput`.
- Cleared on reload. Test mode on/off is not stored.

### 5.2 Model (`try-sign-in.ts`)

```ts
export type OriginPresetId = 'office' | 'branch' | 'home' | 'tor'
export const ORIGIN_PRESETS = [
  { id: 'office', label: 'Office network', address: '203.0.113.24' },   // fixture: Pune office, AS64500
  { id: 'branch', label: 'Branch office',  address: '198.51.100.20' },  // Bengaluru office, AS64501
  { id: 'home',   label: 'Home broadband', address: '192.0.2.10' },     // Pune home, AS64502
  { id: 'tor',    label: 'Tor exit',       address: '192.0.2.66' },     // anonymiser, no place
] as const

export type InputKey = 'person' | 'app' | 'address' | 'place' | 'distance' | 'when' | 'device' | 'risk' | 'edits'
export interface SignInInput {
  personId: string | null
  appId: string | null
  origin: { preset: OriginPresetId | null; address: string; source: 'typed' | 'stated' }
  place: { mode: 'looked-up' } | { mode: 'catalogue'; placeId: string } | { mode: 'distance'; zoneId: string; rangeIndex: number; km: number }
  when: { date: string; time: string; timeZone: string }          // date YYYY-MM-DD
  device: { preset: DevicePresetId | null; facts: SignInDevice }  // source 'stated'
  risk: number
}

export type RowId = 'place' | 'distance' | 'when' | 'time-track' | 'device' | 'risk'
export function rowsRead(policies: readonly Policy[], draft: Policy, appId: string | null, zones: readonly Zone[]): Set<RowId>
export function defaultInput(p: Policy, people: readonly User[], apps: readonly App[], today: string): SignInInput
export function factsOf(input: SignInInput, rows: Set<RowId>, zones: readonly Zone[]): SignInFacts

export type ColumnId = 'live' | 'edits' | 'today' | 'stored' | 'draft'
export interface ColumnSpec { id: ColumnId; label: string; tip: string; substitute?: Policy; asIfApp?: string }
export function columnsFor(saved: Policy, draft: Policy, appId: string | null): ColumnSpec[]
export interface ColumnResult { spec: ColumnSpec; resolution: TenantResolution }
export function runColumns(specs: ColumnSpec[], policies: readonly Policy[], facts: SignInFacts, env: SimEnv): ColumnResult[]

export type StageId = 'sign-in' | 'policy' | 'who' | `rule:${string}` | 'last-row' | 'decision'
export type StageState = 'pass' | 'fail' | 'unknown' | 'off' | 'not-reached' | 'pending'
export interface EvidenceLine { key: string; label: string; actual: string; required: string; status: 'pass' | 'fail' | 'unknown'; tip?: string }
export interface CardEvidence { word: 'Matched' | 'No match' | 'Can’t tell' | 'Switched off' | 'Not reached'; lines: EvidenceLine[] }
export interface GateView { value: string; word: string; state: StageState; standings?: { name: string; reason: string; decides: boolean }[] }
export interface DecisionView { decision: AccessDecision | null; line: string; possible: { decision: AccessDecision; ruleIndex: number | null }[]; needs: string[]; changedBy: InputKey | null }
export interface RouteModel {
  stages: StageId[]                    // travel order, sign-in → landing, off rules included
  landing: number                      // index into stages
  landingUnknown: boolean              // ring marker
  gates: { signIn: string; policy: GateView; who: GateView; decision: DecisionView }
  cards: Record<string, CardEvidence>  // rule id, or 'fallback'
  sig: Record<string, string>          // per-stage content signature, for cross-fades
}
export function routeOf(col: ColumnResult, draft: Policy, env: SimEnv, zones: readonly Zone[], prev?: RouteModel): RouteModel

export interface Band { from: number; to: number; decision: AccessDecision | null }   // null = Can’t tell
export interface Boundaries {
  risk?: { edges: number[]; bands: Band[] }
  time?: { edges: string[]; tz: string; bands: Band[] }       // minutes of day
  distance?: { centre: string; zoneId: string; rangeIndex: number; km: number; unit: 'km' | 'mi'; max: number; bands: Band[] }
}
export function boundariesOf(input: SignInInput, rows: Set<RowId>, right: ColumnSpec, policies: readonly Policy[], env: SimEnv, zones: readonly Zone[]): Boundaries

export interface ChangeChip { kind: 'sign-in' | 'policy'; text: string; decision: AccessDecision; input?: Partial<SignInInput>; changed?: InputKey; rules?: Rule[]; toast?: string }
export function wouldChangeIf(input: SignInInput, right: ColumnResult, draft: Policy, policies: readonly Policy[], env: SimEnv, zones: readonly Zone[], methods: readonly AuthMethod[]): ChangeChip[]

export type ScreenStep =
  | { kind: 'password'; username: string }
  | { kind: 'first-method'; method: string }
  | { kind: 'second'; method: AuthMethod | null; name: string; prompt: EnrolKind; masked: string; rememberDays: number | null }
  | { kind: 'deny'; message: string }
export function screensOf(res: TenantResolution, policies: readonly Policy[], draft: Policy, methods: readonly AuthMethod[], defaultMethodId: string | null | undefined, person: User | null): { decision: AccessDecision; steps: ScreenStep[] }[]

export const hopMs = (hops: number) => Math.min(180, Math.floor(1100 / Math.max(1, hops)))
export function changedBy(prev: SignInInput, next: SignInInput): InputKey | null
```

**`defaultInput`**
- `personId`:
  - First directory person whose group is `audience.groupIds[0]`.
  - Else `audience.userIds[0]`.
  - Else the first person in the directory.
  - On the showcase this gives HRMS → Kavya Menon, Google Workspace → Aisha Khan, Outlook → Priya Sharma.
- `appId`: the first of `appsOf(policy, apps)`. With no apps, the first catalogue app.
- Origin: the `office` preset.
- Place: `looked-up`.
- When: today in `TENANT_TZ` (via `Intl.DateTimeFormat('en-CA', { timeZone })`), `09:30`, `Asia/Kolkata`.
- Device: preset `win11-registered`.
- Risk: 12.

**`rowsRead`**
- Scope:
  - Every `App Access` policy that covers `appId` (`isSystem` or `appIds.includes`).
  - Plus `draft`.
  - Enabled rules only.
- Mapping from condition type to row:
  - `zone` → `place`, and also `distance` when any named zone has `location.ranges`.
  - `country` / `state` / `city` → `place`.
  - `time` → `when` and `time-track`.
  - `day` → `when`.
  - `fingerprint` → `device`.
  - `device-risk` → `risk`.
- The detail rows under "Edit details" follow the enabled attributes of the named profiles, plus the `agent`, `registration` and `limit` rows when those profiles use them.

**`factsOf`**
- Always sets:
  - `personId`, `appId`.
  - `network = { address, source: origin.source }`, only when `isAddress(address)`.
- Place:
  - Looked up: nothing is set, and the engine looks it up.
  - Catalogue: `placeOf(id, 'stated')`.
  - Distance:
    - `{ country, state }` of the range centre's catalogue place.
    - `city: \`${km} km from ${range.label}\``.
    - `lat`/`lon` due north: `lat = r.lat + km / 111.195`, `lon = r.lon`.
    - `source: 'stated'`.
    - The city is a stated label on purpose. With `city: null` the engine returns "Can’t tell" beyond the range (probe below, and Q2).
- `when`: only if `when ∈ rows`.
- `device`: only if `device ∈ rows`.
- `risk: { score, source: 'stated' }`: only if `risk ∈ rows`.

**`routeOf`** (right column)
- The `policy` gate:
  - `decidedBy.policyId === draft.id` → "This policy", Decides.
  - Otherwise the decider's name and "Not deciding", with standings filtered to policies that cover the app or are the system policy.
- The `who` gate reads this policy's standing: `not-in-audience` → fail.
- Landing:
  - If this policy decides and the result is settled: the hit rule, else `last-row`.
  - If this policy decides and the result depends: the first rule with `match === 'unknown'`, with `landingUnknown = true`.
  - If it does not decide: `who` when not in audience, else `policy`.
  - If incomplete: `who` (no person) or `policy` (no app).
- Evidence per condition:
  - `zone` with `in zone` becomes two lines per `ZonePart`, skipping any half that is `'any'` or `'not asked'`:
    - Network: actual is the address; required is "in " plus the zone's `ip` and `asn` entries. More than two entries read "{first}, {second} and {n} more", and the full list goes in `tip`.
    - Location: actual is the `placeOfSignIn` words plus " (looked up)" when looked up; required joins `rangeText(r)` lower-cased with "or {cities, states, countries}".
  - `not in zone` is one line with the condition's own status.
  - `fingerprint` with `matches`:
    - A summary line "{profile} · {p} of {m} checks pass".
    - One line per `ProfileCheck` whose status is `fail` or `unknown`, as `label · actual · required`.
  - Every other type is one line: `conditionType(typeId).label`, `actual`, `required`, `status`, `tip = caveat`.
  - A rule with a Who adds a "Who" line first.
  - Unknown lines add `tip: "Needs: " + missing words`. The word map is: address "Address", location "Place", date "Date", time "Time", risk "Device risk score", `device.*` "Device", person "Person".

**`boundariesOf`**
- Risk:
  - Edges come from `device-risk` conditions in scope: `above v` gives v + 1, `below v` gives v. They are deduplicated and sorted.
  - Each band's decision is the right column evaluated at the band's lower bound, with the other facts unchanged.
  - Showcase check: 0–39, 40–70, 71–100 give 1fa, 2fa, deny.
- Time: edges come from `time` windows, and each band is evaluated at its start.
- Distance:
  - Uses the first range of the first zone that the first enabled rule names.
  - Edge at `rangeKm`; max = max(100, 4 × km).
  - Two bands, each evaluated at its lower bound. The upper band uses km + 1.
- A band narrower than its label shows only its tone strip. The label moves to the tick's `title`.

**`wouldChangeIf`**
- At most 3 chips. Up to 2 sign-in chips come first, and policy chips fill the rest.
- Every candidate is re-run through `resolveSignIn`. A chip is kept only if the right column's decision differs.
- Sign-in chips:
  - They come from failed or unknown conditions on enabled rules at or above the landing, whose Who is `in` or `none`.
  - A chip only ever moves this person's sign-in toward what the condition asks. It never changes the person or the app, never takes a negated condition's side, and never raises risk.
  - Candidates:
    - `in zone`, network half: an address inside the first IP entry. For a CIDR that is the network plus 10, e.g. `203.0.113.10`. For a single IP, the IP itself. For a range, its start. For IPv6, the prefix plus `::a`. Text: "From {zone} network".
    - `in zone`, location half: `placeOf(range.placeId)`, or the first listed city via `searchPlaces(name, 1, 'city')`. Text: "From {place}".
    - `country` / `state` / `city` with `is`: that place.
    - `time between`: the window start. Text: "At {HH:MM}".
    - `day is`: the next date with that weekday. Text: "On {Weekday}".
    - `device-risk below v`: v − 1. Text: "Device risk score {v−1}".
    - `fingerprint matches`:
      - One failing check becomes "{label} {required value}", e.g. "Android OS version 13".
      - Several checks become "Device meets {profile}", with every failing check set to what it requires.
- Policy chips:
  - Candidates:
    - A switched-off rule above the landing: "Turn on rule {n}".
    - A rule above the landing that fails only on its Who: "Add {group} to rule {n}", using `patchRule`.
  - A chip is kept only if the new decision is stricter (`deny` > `2fa` > `1fa`), or the same decision with a higher `FACTOR_RANK` for `ruleFactor`.
  - So a policy chip never loosens the policy (Q3).

**`screensOf`**
- The deciding rule is `decidedBy`'s policy rule at `ruleIndex`, or its `fallback` (`fallbackRule` when absent).
- The draft stands in for this policy's id when it is substituted.
- The second method:
  - `specific`: the first named method, found in `methods` with `methodBlocker(m) === null`.
  - `any`: `defaultMethodId ?? DEFAULT_METHOD_ID` if it is available, else the first available method with `use === 'second'`.
  - `chain`: the first step.
  - `preferred`: `preferredFallback`, else the default, labelled with its method name.
- Masked email: the first character, "••••", then "@domain".
- One entry per distinct possible decision.

### 5.3 BoardBuilder state

```ts
const [testing, setTesting] = useState(!!openTest)
const [run, setRun] = useState<{ id: number; travel: boolean }>({ id: 0, travel: true })
const [stepAt, setStepAt] = useState<number | null>(null)   // null = follow the run
const [changed, setChanged] = useState<InputKey | null>(null)
const input = store.signInTests[draft.id] ?? defaultInput(saved, store.users, store.apps, today)
const rows = useMemo(() => rowsRead(store.policies, draft, input.appId, store.zones), [...])
const facts = useMemo(() => factsOf(input, rows, store.zones), [input, rows, store.zones])
const specs = useMemo(() => columnsFor(saved, draft, input.appId), [saved, draft, input.appId])
const cols = useMemo(() => runColumns(specs, store.policies, facts, env), [specs, store.policies, facts, env])
const route = useMemo(() => (testing ? routeOf(cols.at(-1)!, draft, env, store.zones) : null), [...])
```

- `boundariesOf`, `wouldChangeIf` and `screensOf` are memoised inside `SignInPanel` on the same inputs.
- Cost per update is at most about 25 resolves, each well under 1 ms. No web worker is needed.

**Travel triggers.** Each sets `run = { id: id + 1, travel: !reduced }` and `stepAt = null`:
- entering test mode
- choosing a preset chip
- Replay

**Everything else** sets `travel: false` and keeps the `id`:
- typing (debounced 300 ms; Enter applies at once)
- the Person, App or Place pickers
- sliders (live while dragging, announced on release)
- device edits
- draft edits
- chips

On each of these, `changed = changedBy(prev, next)`, or `'edits'` when the draft changed.

### 5.4 Device presets (source `'stated'`)

Each preset fails at most one thing on the showcase.

| id | label | facts |
|---|---|---|
| `win11-registered` | "Windows 11 laptop · registered" | windows `10.0.22631`, Laptop, edge 128, integrity/lock/Authenticator `null`, agent `true`/`4.3`, registered `true`, count 1 |
| `win11-unregistered` | "Windows 11 laptop · not registered" | as above, registered `false`, count 1 |
| `win10` | "Windows 10 laptop" | windows `10.0.19045`, agent `false`/`null`, registered `true`, count 1 |
| `iphone` | "iPhone · iOS 17.5" | ios `17.5`, Mobile, integrity all false, lock `pin`, Authenticator `6.5.0`, agent `false`, registered `true`, count 1 |
| `android14` | "Android 14 phone" | android `14`, Mobile, integrity all false, lock `pin`, Authenticator `6.5.0`, agent `false`, registered `false`, count 0 |
| `android12` | "Android 12 phone" | as `android14` with OS `12` |

Editing any detail sets `preset: null`, and the Picker summary reads "Custom device".

---

## 6. Motion

| Event | What moves | Duration and easing | Reduced motion |
|---|---|---|---|
| Enter test mode | Grid track, existing `transition: grid-template-columns var(--dur-normal)` (200 ms). Panel, existing `bb-insp-in` (200 ms). Chain refit `fit()` glide (280 ms) at 220 ms. Travel starts at 240 ms | ends by t = 1,580 ms | Tokens already set durations to 0ms (`tokens.css:443`). Final state at once |
| Marker travel | `RouteMarker`, a `motion.span layoutId="bb-marker"` rendered in the current stage | `hopMs(hops)` each (at most 180 ms, total at most 1,100 ms), `type: 'tween', ease: [0.2, 0, 0, 1]` | None. Placed at the landing |
| Stage reveal | That stage's evidence and word, opacity 0→1, as the marker arrives | 120 ms | Instant |
| Decision gate | Opacity 0→1 at landing | 160 ms | Instant |
| What they see | Opacity 0→1, 80 ms after landing | 160 ms | Instant |
| Update (no travel) | Only stages whose `sig` changed. Content keyed by `sig`, opacity 0→1. The marker repositions with `layout` duration 0 and fades in | 160 ms, marker 120 ms | Instant, plus "Changed by {input}" |
| Step / Back | Marker, one hop | 180 ms | Instant |
| Panel ↔ Inspector swap in test mode | `.bb__insp.is-swap`, opacity only | 120 ms | Instant |

**Travel budget.** 1,100 ms of travel plus 240 ms of fades is under 1.6 s. Entry adds 240 ms before travel starts, so entry lands at 1.58 s.

**Rules**
- Motion only on the three travel triggers. Never while typing: fields debounce and use the update path, and sliders update with no fades while the pointer is down.
- Nothing loops or pulses.
- `.bb__marker` positions with `left`/`top`/`margin` only. No CSS `transform` or `transition` on it, and none on `.bb__card` or on the `motion.div` wrappers in `Board.tsx`, because motion owns their transforms (known trap).
- Evidence and panel content animate opacity only, never `x`/`y`. `.bb__insp` already carries a CSS transform keyframe.
- Timers read `useReducedMotion()` from `motion/react`. The app root already sets `<MotionConfig reducedMotion="user">` (`BrandApp.tsx:162`).
- Fit happens at zoom 1.0 at 1,120 px, so the marker's layout animation is not distorted by scale.

---

## 7. Accessibility

- **Button:**
  - `aria-pressed={testing}` and `aria-keyshortcuts="T"` through the new `Button` `pressed`/`keys` props.
  - Disabled with a reason in `title`.
- **Focus order:**
  - On open, focus moves to the panel h2 (`tabIndex={-1}`), the way `DockPanel` does it.
  - Panel tab order: Replay → Back → Next stage → Close → Person → Application → From (one tab stop, arrow keys move within the radiogroup) → Address → Other place → Distance → Date → Time → Time zone → Device → Edit details (then detail rows) → Device risk score (range, then number) → column TipDots → Would change if chips → What they see (section toggle → Seg).
  - On close, focus goes to the bar button.
  - On Inspector "Back to Try a sign-in", focus goes to the panel h2.
- **Keys:**
  - T toggles test mode (board level only, see E2).
  - Esc:
    - A picker or menu handles it first.
    - Then, if a rule is selected in test mode, it returns to the panel.
    - Then it closes test mode.
    - Esc inside a text field does nothing, by the existing `typing` guard.
  - Enter in Address applies at once.
  - Step and Back are real buttons. Next stage is disabled at the landing, Back at Sign-in.
- **Live region:**
  - One `<p role="status" className="u-sr-only">` in the panel.
  - It announces the decision once per run, after travel or at once when reduced.
  - On updates it announces only when the decision changed, e.g. "Now Deny. Changed by Address."
  - Step and Back announce the stage: "{Stage label}: {value}, {word}", followed by the evidence lines for a card.
- **Chain:**
  - In test mode the stage `aria-label` reads "Route of this sign-in".
  - Gates are `role="group"` with `aria-label` "{label}: {value}, {word}".
  - The Which policy disclosure is a button with `aria-expanded`.
  - Evidence is real text. The marker is `aria-hidden`.
- **Sliders:**
  - `aria-valuetext` "{n}, {decision words}", e.g. "48, Allow with 2FA".
  - The printed edges are also in `aria-describedby` text: "Boundaries 40 and 71".
- **Invalid address:** `aria-invalid` and `aria-describedby` point at the error line.
- **Contrast:**
  - "Can’t tell" uses `--text-muted` (#646c75, 4.5:1 on white).
  - Status words use `--fb-*-fg`.
  - The marker is #0d6efd on the white stage.
- Nothing is conveyed by colour alone. Every state has a word.

---

## 8. Acceptance checks (showcase tenant, light, 1,120 px wide, rebrand on)

The engine outputs quoted below were measured by the probe on 2026-09-28, 09:30 Asia/Kolkata. The UI renders whatever the engine returns.

**Entry and layout**
- [ ] Policies → ⋯ on "HRMS access from corporate offices" shows "Try a sign-in" directly under "Edit policy". It opens the board with the panel open, and the first-run tour does not start.
- [ ] Bar order: Demo, Learn, Try a sign-in (pressed and blue), then Discard, Save draft, Save policy. No Check or What changes pips. The policy name ellipsises and nothing wraps.
- [ ] Measured with DevTools: the rail is 200 px, the panel box is 480 px, the chain column is about 428 px, cards are 380 px, zoom is 100 %, and there is no horizontal scroll.
- [ ] Orange appears only on "Save policy" and the rail's active edge. Chips, the pressed button, the active gate and the marker are blue. There are no dots besides the marker.

**Default run (HRMS is Active and has no edits)**
- [ ] A single column "Live". Person Kavya Menon, Application HRMS, Office network chip on, Address 203.0.113.24 "stated", Place "Pune, India" "looked up". The Distance row shows because Corporate offices has a range. No When, Device or Risk rows.
- [ ] The marker travels Sign-in → Which policy ("This policy · Decides") → Who ("Kavya Menon · Human Resources · In audience") → Rule 1. Stopwatch: all motion ends within 1.6 s of the click.
- [ ] Rule 1 reads "Matched", with:
  - Who "Kavya Menon · Human Resources, Finance" Passes
  - Network "203.0.113.24 · in 203.0.113.0/24, 198.51.100.0/24" Passes
  - Location "Pune (looked up) · within 25 km of Pune, or Bengaluru, Mumbai" Passes

  "Nothing else matched" is dimmed and reads "Not reached". The Decision gate shows [Allow with 2FA] and "HRMS access from corporate offices · Rule 1 · In a corporate office".
- [ ] What they see: the Seg reads "Password | Google Authenticator". It shows "Enter the code from Google Authenticator" and "Approximation of the sign-in page".

**Typed address**
- [ ] Type `192.0.2.50` one character at a time. No marker travel happens while typing.
- [ ] After a pause:
  - Network "192.0.2.50 · in 203.0.113.0/24, 198.51.100.0/24" Fails.
  - Location Passes.
  - Decision [Deny] with "Changed by Address".
  - What they see shows "HRMS opens only from a corporate office. Contact IT if you need access from elsewhere." exactly.
  - Only the changed stages fade.
- [ ] Type `192.0.2.999`. The error "Enter an IPv4 or IPv6 address" appears, and the zone lines read "Can’t tell" in grey with a Needs: Address tip.
- [ ] Would change if shows the Sign-in chip "From Corporate offices network → Allow with 2FA". Clicking it sets Address 203.0.113.10 and the decision returns to Allow with 2FA. No chip ever names another person.

**Presets and distance**
- [ ] Branch office: the marker travels again, and Location reads "Bengaluru (looked up) · … Bengaluru …" Passes. Result: Allow with 2FA.
- [ ] Tor exit: Network Fails, Location "Can’t tell" (grey), rule "No match", Deny. The decision is settled even with the unknown, because the network half fails.
- [ ] Office network, then Distance: the track prints "25 km". 20 km gives Allow with 2FA. 30 km gives Deny, and the Location line reads "30 km from Pune · … Fails".

**Other person**
- [ ] Person "Aisha Khan" (under "Not in this policy"):
  - Which policy is expanded, reading "Global Default Policy · Not deciding".
  - "HRMS access from corporate offices" is struck through with "Not in audience: Human Resources, Finance".
  - Who reads "Aisha Khan · Sales · Not in audience", and the marker stops there.
  - Rule cards read "Not reached".
  - Decision [Allow on 1 factor], "Global Default Policy · Baseline access". What they see is the password only.

**Versions**
- [ ] Switch Rule 1 off on its card. Columns become "Live [Allow with 2FA]" and "Your edits [Deny] · Nothing else matched". No travel. Rule 1's evidence reads "Switched off". ⌘Z restores one column.
- [ ] Status pill → Inactive. Columns become "Today · Global Default Policy · Baseline access · [Allow on 1 factor]" and "Stored version · [Allow with 2FA]". Set it back to Active afterwards.
- [ ] Click the Rule 1 card in test mode. The Inspector opens in the same 480 column with × "Back to Try a sign-in". Edit the zone and the route updates. × returns to the panel.

**Devices and risk**
- [ ] Open "Access the app through corporate devices only". Aisha Khan, Google Workspace, Device "Windows 11 laptop · registered", Device risk score 12.
  - The track prints 40 and 71 with bands "Allow on 1 factor | Allow with 2FA | Deny".
  - Values 12, 48 and 86 give 1fa at rule 1, 2fa at rule 2, and deny at rule 3.
  - A TipDot on the label reads "Risk signals are collected on Android and iOS only".
- [ ] Open "Device compliance for Outlook and Dropbox" (Priya Sharma), Device "Android 12 phone".
  - The card line reads "Compliant devices · 3 of 4 checks pass", and "Android OS version · 12 · ≥ 13" Fails.
  - Result: Deny with "Your device does not meet the security requirements. Update it, or contact IT."
  - Chip: "Android OS version 13 → Allow on 1 factor".
- [ ] Choose "Android 14 phone", then Edit details → Integrity "Not stated".
  - The rule reads "Can’t tell" with a ring marker.
  - The Decision gate shows "Depends", "If rule 1 matches → [Allow on 1 factor]", "If not → [Deny]", "Needs: Device".
  - The column shows "Depends · Allow on 1 factor or Deny".
  - What they see has a Seg "Allow on 1 factor | Deny".

**Keyboard, motion and copy**
- [ ] With focus on the board, T opens test mode and T again closes it. Tab order follows §7. Next stage and Back move the marker, and a screen reader (NVDA or VoiceOver) announces each stage. The decision is announced once per run.
- [ ] With reduced motion emulated in DevTools: Replay shows the final state with no travel, and a changed address shows "Changed by Address" with no fade.
- [ ] DOM text search finds none of "gauntlet", "blast radius", "rehearse", "Try a login". `CheckTab.tsx` has no "Try a login".
- [ ] `npx vitest run` is green, including `try-sign-in.test.ts`, which pins every expected result above as unit scenes. `npx tsc -b` is clean. `npx oxlint` shows at most 31 warnings. `npm run build` is clean.

---

## 9. Open questions for the owner

1. **Full edition pips.** Should Check and What changes both leave the bar? Lite and the showcase never showed them. **Recommend:** yes. Keep both reachable in Full from ⌘K ("Open Check", "Open What changes") until Phases 2 and 3 fold them into this panel.
2. **The distance ruler's stated place.** Should a point on the ruler be named "30 km from Pune" (stated)? That name decides the zone's city list correctly: 30 km gives Deny. The alternative is `city: null`, which the engine answers "Can’t tell" beyond 25 km (probed as depends, 2fa or deny). **Recommend:** the stated label, with the source word "stated".
3. **"Never a weaker route".** Is this reading right?
   - Sign-in chips only move a fact toward what a rule asks: into a zone, a compliant device, lower risk. They never change the person or the app.
   - Policy chips only make this sign-in's decision stricter, or the same decision with a stronger second factor.

   **Recommend:** yes. Loosening advice stays out of the tester.
4. **Numbers once per view.** A fact or threshold (48, 25 km, 40/71) appears in its input or control tick and again in the card's "actual · required" line. **Recommend:** allow it for sign-in facts and thresholds, since they are what is being tested. Keep the rule strict for counts.
5. **Editing while testing.** The rule editor opens at 480 px in test mode instead of its usual 560 px, so long attribute names ellipsise. **Recommend:** keep 480, so the route and the chain never jump widths mid-test.
6. **Default date.** It is "today" in Asia/Kolkata, so a weekday rule changes day to day. **Recommend:** keep today. The film rig sets its own date.
7. **HRMS seeded Active.** Phase 1 shows it as "Live" and a single column. The pitch journey expects "Today | Stored version", which Phase 4's Inactive seed gives. **Recommend:** keep the seed as it is until Phase 4, so the showcase tests stay stable. Demo the Inactive columns with the status pill (check in §8).