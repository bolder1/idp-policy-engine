# Describe it: build spec (plain-English and guided policy maker)

Read-only pass. Nothing in the worktree was changed. Checked against the uncommitted tree at `C:\New folder\IDP Policy Engine\.claude\worktrees\kind-heyrovsky-5ec74e` after chunk 4 (baseline 119 test files, 2,050 tests, oxlint 28 warnings, build clean).

**Sources, in order of authority**
1. The owner rules and standing rulings of 23 to 26 Sep (the task brief).
2. `scratchpad/specs/final.md` (testing, Monitor, guard). This spec never contradicts it; where it touches the guard, it adds a source of sign-ins and changes no trigger.
3. `scratchpad/wf2/judgment.json`: one panel, two ways in, the grafts, the kill list, phases 3a, 3b, 3c and 4.
4. `scratchpad/wf2/concepts.json` (concept A body parts, concept B skeleton), `maps.json`, `vendor/*.md`.

**Code facts this spec relies on (file:line, current tree)**
- `BoardEmpty.tsx:77-90` draws two equal cards in `.bb__starts` (`board.css:376`, `grid-template-columns: 1fr 1fr`), inside `.bb__empty__inner` (`width: min(720px, 100%)`, `board.css:344`).
- `BoardBuilder.tsx` mounts `BoardEmpty` when `draft.rules.length === 0 && !scratch && !testOn` (`:1251`). `applyTemplate` (`:1039-1053`) is the pattern for a board write with a "Not saved yet" toast. `offerUndo` (`:933-947`) is the Undo-toast pattern. `commitDraft` (`:924`) is the one door into the history.
- `BoardBuilder.tsx:345-347`: `name`, `appIds` and `audience` are **overlaid from the store** onto the draft. They are direct-saved facts, not part of the undo history. The board neither shows nor edits `audience`.
- `history.ts` exports `historyOf`, `commit`, `revertTo`, `undo`, `redo`. There is no way to amend the present entry.
- `store.addPolicy` prepends (`store.tsx:963-966`). `Policies.tsx:184-188` `startDraft` makes "Untitled policy N" with `blankPolicy`. `newPolicy` (`:193`) still opens the naming dialog when `features.guidedSetup`.
- The old guided build is mounted at `Policies.tsx:59, 147-149, 501-521` and `PolicyBuilderMain.tsx:49, 157, 716-720, 823-835`. `NewPolicyDialog.tsx:38, 49, 135-141` carries `onGuided` and the sheen-animated wand. `main.tsx:69` imports `interview.css`. `ui-copy.test.ts:55` scans `Interview.tsx`. `edition.test.ts:37, 82-83` and `personas.ts:126-130` name `guidedSetup`.
- `edition.ts`: `guidedSetup` is Full-only. The showcase pin is one line at `store.tsx:768`: `features: SHOWCASE ? { ...featuresOf(edition), policyTesting: true, breakInTest: true } : featuresOf(edition)`.
- `tenant-resolver.ts:145-148, 198-282`: a custom-group audience **beats** an Everyone (DEFAULT group) audience; within a tier, list order decides. `resolveSignIn(policies, facts, env, { substitute })` evaluates a draft as though on.
- `guard.ts:107-125`: `GuardInput.savedSignIns` is the only list of promises the guard reads. Its three call sites are `BoardBuilder.tsx:757`, `AppsPane.tsx:121` and `use-status-change.tsx:191`. A `note` check never blocks (`guard.ts:187-199`).
- `store.account.id` is `'jaspreet'` (`store.tsx:180`). **Jaspreet Toor is not in the showcase directory**, so a sign-in as the admin resolves as `incomplete` today.
- `fingerprint.ts:2272` `profileMatches(profile, device)` grades a device against a profile field by field (Phase 0). `DEVICE_PRESETS` (`screens/testing/device-presets.ts`) holds seven stated devices. `formOf(facts, zones)` and `formSummary(form, zones)` are in `sign-in-form.ts:183, 253`.
- `geo-fixture.ts`: 203.0.113.0/24 is the Pune office block, 192.0.2.10 is home broadband in Pune, 192.0.2.130 is residential Austin. `gb-england-london` is a catalogue city.
- `places.ts:159-163`: United States carries aliases `usa`, `us`, `america`.
- `methods.ts`: each method has `active`. OTP over SMS is `active: false` in every tenant (`methods.ts:324-330`).
- `METHODS` (`rule-form.tsx:117-127`) is the nine console method names.
- `Seg` (`board/Section.tsx:73`) requires a value; it cannot show "nothing picked".
- `predicate-prose.ts` already says "sign-in". Remaining gaps: the first factor on a 2FA rule, the deny message, the time zone, the attribute key, "between" wording, and a risk band written as two conditions.
- `ui-copy.test.ts:84` bans "gauntlet", "blast radius", "rehearse" and "try a login"; `:164` bans every form of "login" in UI strings.

---

## Assumptions (owner can overturn)

Each is reversible. Items 1 to 4 are the owner calls the judge listed as open; the rest are design-lead calls made while writing this.

1. **Undo scope.** The toast's Undo covers the rules, the last row, the checks and the audience. Applications and the name stay, because both are visible and edited on the board (21 Sep direct-save ruling). The audience is included because only this panel wrote it and the board cannot show it.
2. **Flags pinned in the showcase.** `describePolicy` and `draftChecks` are on in Lite and Full, and the single showcase pin names them too, so the pin says what the showcase shows.
3. **The test foot is not a "finding"** under the 22 Sep hide-findings ruling. It lists sign-ins and their decisions, the same as Try a sign-in. It shows no lint lines and no counts.
4. **Hand-off is to "Save policy".** The panel never opens Review. There is no "Review & save" step.
5. **Describe it is offered on a draft only** (`saved.status === 'draft'`). On a live policy with no rules the empty board keeps two cards: the panel direct-saves the audience, and a direct write to an enforcing policy would skip the guard.
6. **The admin is added to the showcase directory**: `{ id: 'jaspreet', name: 'Jaspreet Toor', email: 'jaspreet.t@mo.com', groupId: 'it-admins', userType: 'Employee', role: 'Admin' }` in `showcaseUsers`. Without it the You row, and the guard's "Your own and protected sign-ins", can never evaluate. `showcase-seed.test.ts` counts are updated deliberately.
7. **Cross-policy overlap is shown, not rewritten.** A custom-group policy on the same app already beats this draft for its groups (resolver tiers), so "Leave them to that policy" is what happens anyway. "Apply this policy to them too" would need an audience the board cannot show, so v1 does not offer it. The overlap appears as an "Also covers" line, a "Decided elsewhere" line and the Not named check.
8. **Reading happens on Enter, the Read button or an example button, never on a typing pause.** Rows and cards therefore never move while the admin types.
9. **Clicking an answer rewrites the text box** from the renderer (`sentenceOf`), so both ways in stay in sync. The Not added list is kept until the next read.
10. **Risk band words are read against the tenant's own cut-offs**: the first policy in list order, then the first template, that has two `device-risk above` conditions. On the showcase that is `Access the app through corporate devices only` (above 39, above 70), so Medium starts at 40 and High is above 70. With no source, the band is a choice with number fields and nothing filled in.
11. **Generated checks are `note` level.** They never block. They open no page by themselves; they are listed whenever a guard page opens, and "Before turning on" always opens.
12. **Expected comes from the text, Result from the tenant.** A row's Expected is the outcome the text gave the branch it exercises. Its Result is what the tenant decides with this draft turned on. They differ only when another policy, the tiering or rule order intervenes, which is the point of the row.
13. **No check count and no "all passed" state.** The one number on the panel is in the What changes line.
14. **"Read as text" sits in the board bar and the Policies row menu.** The row menu order tested in final spec A.10 #3 gains one item, "Read as text", directly before "Save as template". Its test is updated deliberately.
15. **The old Interview is deleted, not hidden.** One guided build.
16. **Build call, D-a review (28 Sep): two Not added reasons beyond §3.3.** A second zone or place in one rule reads **"One zone per rule"**; a second method in one outcome reads **"One method per rule"**. The §3.3 catch-all ("Not an application, group or person on this tenant") would be untrue for a zone or method the tenant holds.
17. **Build call, D-a review (28 Sep): "admins" is IT Admins.** §4.2's alias table (which lists `admins` and excludes `admin` and `it`) is kept, so scene 10's "Step up admins on the admin dashboard" gives Who **IT Admins** (from the text), not Everyone (Default); "admin dashboard" is still Not added. Dropping `admins` from the table would restore scene 10 as written.
18. **Build call, D-a review (28 Sep): the rendered sentence has no allow verb while Sign-in is not set** ("Everyone signing in to Salesforce."), because §4.3 reads a bare allow verb as Allow on 1 factor; with a decision it agrees in number ("Everyone reaches", "Sales reach").

---

## 1. Purpose

A first policy can be written two ways on one panel: **type what it should do**, or **answer six questions**. Either way the answers write ordinary rule cards onto the open draft, list what could not be used, ask only where the tenant holds more than one fitting object, and try the draft against a handful of generated sign-ins through the whole tenant before anything is saved.

It replaces the hidden five-question Interview and closes scenario #16 on the manager's sheet (plain-English policy setup), without claiming a language model. Phrases are matched against this tenant's own names by fixed code, and every word on screen that describes a rule comes from the same renderer every other surface uses.

What it never does:
- enforce anything (the draft is saved by "Save policy" and turned on through the status pill and its guard);
- guess an object id (ambiguity is a choice with nothing picked);
- invent a rule the text did not ask for (no catch-all; the last row is the policy's own `fallback`);
- use the word "AI", a Sparkles or Wand icon, a persona, a chat, a grade or a celebration.

---

## 2. The door: a third equal card on the empty draft

**Where:** `BoardEmpty.tsx`, in `.bb__starts`, between the two existing cards.

| Order | Title | Line | Art |
|---|---|---|---|
| 1 | Use a template | Ready-made rules, yours to edit | `TemplateArt` (unchanged) |
| 2 | **Describe it** | **Type it or answer questions** | **`DescribeArt`** (new) |
| 3 | Start from scratch | Write the first rule yourself | `ScratchArt` (unchanged) |

- **Shown when** `features.describePolicy && saved.status === 'draft' && saved.type === 'App Access' && !saved.isSystem` (Assumption 5). Otherwise the chooser keeps two cards.
- **Equal weight.** Same `bb__start2` button, same size. The comment at `BoardEmpty.tsx:65-72` ("Neither is dressed as the primary") is updated to say three ways in.
- **Layout.** `.bb__empty__inner { width: min(880px, 100%) }` and `.bb__starts { grid-template-columns: repeat(3, minmax(0, 1fr)) }`. At the builder's 1,056 px content width (rail collapsed to 64) each card is about 277 px; the 180 px art fits inside the card padding. The existing single-column media rule at `board.css:451` stays.
- **`DescribeArt`.** One `ArtPanel` (no back panel). Inside: one text line 58 px wide at the top with a 1.5 px caret after it, then two short answer lines (40 and 28 px) with a 12 px value stub at their right. Grey at rest. On hover the caret takes the same class the siblings use for their one coloured part (`is-lead`), so the three cards share one hover colour and no new colour is introduced. `role="img"`, `aria-label="A policy written from a sentence"`.
- **Props.** `BoardEmpty` gains `onDescribe?: () => void`. The card renders only when it is passed.
- **Click (or Enter on focus).** `BoardBuilder` sets `describing = true`. The chooser gives way to the canvas (start node, the one connector, the last row), exactly as "Start from scratch" does, and the panel opens in the inspector slot with focus in the text box. No data changes on the click.

---

## 3. The panel

**Component:** `screens/board/DescribePanel.tsx`, styles in `screens/board/describe.css` (prefix `bdsc__`), imported in `main.tsx` where `interview.css` was.

**Slot.** The inspector's grid track, at the inspector's width (`--bb-insp`, 560 by default, grip still resizes it). It is an `aside.bb__insp` with the same floating card, margin, radius, `--el-mid` shadow and `bb-insp-in` entrance as the rule inspector. `BoardBuilder` renders it when `describing && !testOn`, in place of `Inspector`; while it is open the selection is `none`, `T` (Try a sign-in) first closes it the same way Done does.

**Geometry at the 1,120 px shell.** Rail 64, content 1,056, panel box 560 (536 inner after the 12 px padding), canvas about 496 px. No horizontal scroll. With the rail reopened (200 px) the canvas is about 360 px and the chain fits at its existing zoom rules.

**Structure, top to bottom**

```
┌ header 44px (.bb__inspbar) ──────────────────────────────────────┐
│ Describe the policy  (i)                                    [×]  │
├ body (scrolls) ──────────────────────────────────────────────────┤
│ Your text                                                         │
│ ┌──────────────────────────────────────────────────────────┐     │
│ │ textarea, 2–6 lines, 500 characters max              [↵] │     │
│ └──────────────────────────────────────────────────────────┘     │
│ Examples  [HRMS from the office] [Corporate devices by risk]      │
│           [Compliant devices] [Developer tools]                   │
│                                                                   │
│ Not added            (only when the list is not empty)            │
│  “the US”  No zone for United States          Create zone        │
│                                                                   │
│ ▸ Applications    HRMS                                            │
│                   From your text: “HRMS”                          │
│ ▸ Who             Human Resources and Finance                     │
│ ▸ Leave out       Nobody            (only when §3.5 applies)      │
│ ▾ Where and when  Only from Corporate offices · Any time          │
│     [open controls]                                               │
│ ▸ Devices         Any device                         Default     │
│ ▸ Sign-in         Allow with 2FA · Google Authenticator           │
│ ▸ Nothing else matched   Deny                                     │
│                                                                   │
│ Checks  (i)                                                       │
│  Should pass  Kavya Menon · HRMS · Office network · …  [badge]   │
│  …                                                                │
│ What changes   Of 360 modelled sign-ins: Now allowed 0 · …        │
├ foot 56px ───────────────────────────────────────────────────────┤
│                                                          [Done]  │
└───────────────────────────────────────────────────────────────────┘
```

### 3.1 Header

- h2 **"Describe the policy"**, `tabIndex={-1}`, focused on open only if the text box is not.
- `TipDot`, `label="How phrases are read"`, text: **"Prototype: phrases are matched against this tenant's apps, groups, zones and profiles. The product would use a backend model with the same checks."** This is the honesty label. It is the only place the panel says how reading works.
- `IconButton icon={X} size="sm" tone="ghost" label="Close Describe the policy"`. Same effect as Done (§3.9).

### 3.2 Your text

- Visible label **"Your text"** above a `textarea` (`id="bdsc-text"`). Auto-grows from 2 to 6 lines, then scrolls. `maxLength={500}`. Placeholder **"Who, which applications, where or when, what happens"**.
- **Read** is `IconButton icon={CornerDownLeft} size="sm" tone="ghost" label="Read (Enter)"`, pinned inside the box at its bottom right.
- **Enter** reads. **Shift+Enter** inserts a line break. Reading replaces every answer that came from text; answers the admin picked by hand since the last read are replaced too, because the text is now the source (the box is the record).
- **Examples.** A label **"Examples"** and four `Button variant="ghost" size="sm"`, not pills:

| Button | Sentence it puts in the box, then reads |
|---|---|
| HRMS from the office | HR and Finance reach HRMS only from a corporate office, with Google Authenticator. |
| Corporate devices by risk | Sales, Finance and Vikram Nair use Google Workspace only on a corporate device: password at low risk, OTP over Email at medium risk, deny at high risk. |
| Compliant devices | Outlook and Dropbox need a compliant device and a password. Block anything else with “Your device does not meet the security requirements. Update it, or contact IT.” |
| Developer tools | Engineering and DevOps reach GitHub and Jira on a compliant device: password in the office, miniOrange Push elsewhere. Block other devices. |

  Each sentence reads to exactly its seeded policy (§4.9). They live in `EXAMPLES` in `describe-model.ts`, so the round-trip test and the buttons cannot drift apart.
- **Sync from clicks** (Assumption 9). When the admin changes an answer by clicking, the box is replaced by `sentenceOf(answers)` with no animation. The Not added list stays until the next read.

### 3.3 Not added

- Rendered only when the reading left something out. Heading **"Not added"** (h3, 13 px, `--text-secondary`).
- One row per phrase: the phrase in curly quotes, then its reason in `--text-tertiary`, then at most one action (`Button variant="link" size="sm"`).
- Reasons and actions, word for word:

| Case | Reason | Action |
|---|---|---|
| A country or city the catalogue knows, with no zone holding it | No zone for {Place} | Create zone → `store.go({ name: 'zones' })` (leave guard applies) |
| A device-type word (laptop, phone, mobile, tablet, desktop, Windows, Mac, iPhone, Android) not inside a matched phrase | Device type is set in a device profile | Device profiles → `store.go({ name: 'fingerprint' })` |
| A method the tenant has switched off | {Method} is off in Authentication methods | Authentication methods → its route |
| A choice answered "Don't add" | the choice's own reason (see §4.6) | none |
| A clause the order answer made unreachable | Never reached: {rule name} decides first | none |
| A second split in one text (inside/outside and risk bands together) | One split per description | none |
| "office hours", "working hours", "business hours" | Hours need a start and an end | none |
| Any other run of unread words | Not an application, group or person on this tenant | none |

- A Not added row never becomes a condition. Hovering a row does nothing on the board (it wrote nothing).

### 3.4 The six answers (plus Leave out)

An accordion. **One answer open at a time.** Each answer is a `button` header (`aria-expanded`, `aria-controls`) and a region.

**Header row:** 40 px minimum, grid `120px 1fr auto`: label, summary, then a grey **"Default"** tag (11 px, `--text-tertiary`) when the value was not in the text and not picked, or **"Not set"** in `--text-tertiary` when a required answer is missing. A 16 px `ChevronDown` sits at the far right and rotates 180° when open (plain CSS on a non-motion element).

**Trace line** under the summary, one line, `--text-tertiary`, 12 px: **From your text: “{phrase}”**, several phrases joined with " · ". Only for values that came from the text. Hovering it underlines nothing (no mirror layer); it lights the cards the answer wrote (§3.8).

**Open by default:** the first answer that holds an unanswered choice; else the first "Not set" answer; else none. Picking an answer's last missing value closes it and opens the next answer that needs something.

| # | Label | Summary format (collapsed) | Controls (open) |
|---|---|---|---|
| 1 | **Applications** | `listPhrase(names)` from `app-policies.ts`, e.g. "GitHub Enterprise and Jira" | `Picker multiple label="Applications" placeholder="Choose applications" searchable` over `store.apps`, with `AppLogo` art. Under it, one `--text-tertiary` line per app that another enforcing policy covers: **Also covers {App}: {Policy name}** |
| 2 | **Who** | `whoSummary(who)`, e.g. "Sales, Finance and Vikram Nair"; "Everyone" | `WhoPicker` (who-picker.tsx), groups and people, with an **Everyone** option first |
| 2b | **Leave out** | `whoSummary(except)`, or **Nobody** | `WhoPicker label="Leave out"`. Shown only per §3.5 |
| 3 | **Where and when** | "{where} · {when}" (formats below) | Where: `Seg label="Where"` **Anywhere · Only from · Inside and outside · Not from**; then `Picker label="Zone"` over `store.zones`; then `Seg label="Match on"` **Both · IP · Location** (the condition editor's own words). When: `Seg label="When"` **Any time · Between**; then two time inputs **From** and **To**, `Picker multiple label="Days"`, `Picker label="Time zone"` over `TIMEZONES` |
| 4 | **Devices** | "{device}" or "{device} · {risk}" | `Seg label="Devices"` **Any device · Only · Not**; `Picker label="Device profile"` over `store.fingerprints`. `Seg label="Device risk score"` **Any · Bands · Above**; Bands shows `NumberStepper` **Medium from** and **High above**; Above shows `NumberStepper` **Above**. The **Bands** option is not offered while Where is Inside and outside (one split per policy, §4.4) |
| 5 | **Sign-in** | One branch: "{Decision} · {factor}". Several: "{Branch}: {Decision} · …", truncated with an ellipsis and the full text in `title` | One row per branch (§4.4), grid `140px 1fr`: the branch label, then `Picker label="Decision"` **Allow on 1 factor · Allow with 2FA · Deny**, then for 2FA `Picker label="Method"` **Any enabled method** plus the active `METHODS`, and for Deny `Field label="Message"` (max 200, optional) |
| 6 | **Nothing else matched** | "{Decision}" plus " · {factor}" or " · Custom message"; **Not reached** when no sign-in can reach it (§4.5); "Not set" when the text gave none | The same Decision, Method and Message controls. Under them, one `--text-tertiary` line when a custom-group policy on the same apps takes some groups first: **Decided elsewhere: {groups} ({policy name})** |

**Where and when summary:** where = **Anywhere** | **Only from {zone}** | **{zone}, inside and outside** | **Not from {zone}**, plus " (IP)" or " (Location)" when Match on is not Both; when = **Any time** | "{from}–{to}, {days}, {time zone}" with days as "Monday to Friday" for a run, else names joined.

**Devices summary:** device = **Any device** | **Only {profile}** | **Not {profile}**; risk = **Medium from {a}, high above {b}** | **Risk above {n}**.

**Keys.** Inside an open answer and outside a text field: **1–9** pick the Nth option of the answer's first unanswered choice, else of its first `Seg`. **Enter** on a header toggles it; **Enter** after a pick moves to the next answer that needs something. **Esc** anywhere in the panel is Done.

### 3.5 Leave out

Shown only when a composed rule **denies** and its Who is **Everyone** (the Entra "who is left out" question). It writes `exceptGroupIds` / `exceptUserIds` on every composed rule through `withWho` (rule-who.ts). It never writes the audience. Default **Nobody**, tagged Default.

### 3.6 Choice rows

A choice appears inside the answer its phrase feeds, above that answer's controls, with **nothing picked**.

- Line 1: the phrase in curly quotes, 13 px `--text-primary`.
- Line 2: the options as a `Seg` with `value={null}` (§6.3 extends `Seg`), or a `Picker` with `placeholder="Choose…"` when there are more than three options. Each option's meta (one line) is its `title` tooltip.
- A one-answer question is never rendered. If only one option exists, the reader resolves it and shows the trace instead.
- Until a choice is picked, the part of the draft it feeds is left out of the composed rules and its answer reads "Not set". The cards on the board therefore never hold a guessed id.
- The order question (§4.7) is a choice row in **Sign-in**, with `TipDot label="About order" text="Proposed model: first match wins"`.

### 3.7 Checks (the test foot)

Rendered when `features.draftChecks`. Heading **"Checks"** (h3) with `TipDot label="About checks" text="Through every policy on these applications"`.

- **No application yet:** `EmptyState compact icon={LogIn} title="Choose an application"`. No blurb.
- **Rows** (§5.2 defines them), in this order and only when they apply: **Should pass**, **Should stop**, **Edge**, **You**, **Not named**.
- Each row is one `button` (whole-row click), grid `88px 1fr auto`, minimum 44 px, two lines:
  - column 1: the kind word, 12 px `--text-secondary`;
  - column 2, line 1: `formSummary(formOf(facts))`, e.g. "Kavya Menon · HRMS · Office network · Windows 11 laptop · registered", ellipsis with full `title`; line 2 (`--text-tertiary`): "{deciding policy} · {rule line}" from `ruleLine` (try-sign-in.ts), and, when Expected differs from Result, prefixed **Expected {DECISION_WORDS[expected]} ·**;
  - column 3: `DecisionBadge`, or `CantTell` (grey text, never a badge) with a `TipDot` reading **Needs: {factWords(...)}**.
- The row's `title` is the phrase it came from: **From your text: “…”** (Should pass, Should stop, Edge only).
- **Click:** opens Try a sign-in on this draft with the row's sign-in (§5.4).
- **What changes** line under the rows: a label **"What changes"** (12 px `--text-secondary`) then `whatChangesSaid(line)` in 13 px `--text-primary`. This is the only number on the panel. Hidden with the rows when there is no application.

### 3.8 The board beside the panel

- The chain on the left is the real draft. Answers write real cards (§4.8). Nothing is a preview.
- **Card trace.** A card written from text shows one muted line under its title, **From your text: “{phrase}”**, until the next "Save policy" (`publish` clears it). `RuleCard` gains `source?: string`; `BoardBuilder` holds `sources: Record<ruleId, string>` and passes it through `Board`.
- **Hover in both directions.** Hovering an answer header sets `hover` to the indices of the cards it wrote (a 1 px `--border-strong` ring). Hovering or clicking a card while the panel is open bolds its answer's summary and scrolls it into view; a card click does **not** open the rule editor while the panel is open.
- **Clicking the last row** while the panel is open opens the Nothing else matched answer.

### 3.9 Foot, Done and the toast

- Foot bar, 56 px, sticky, right-aligned: `Button variant="secondary"` **"Done"**. Buttons only; no sentence ever sits in the foot (26 Sep ruling 2). Done is never disabled.
- **Done, ×, or Esc** close the panel and keep everything. Then, in one event:
  1. If the policy name still matches `/^Untitled policy( \d+)?$/`, rename it to `nameOf(answers)` through `freeName(base, names, POLICY_NAME_MAX)`.
  2. Direct-save the composed audience with that name: `store.savePolicy({ ...saved, name, audience })`.
  3. If this panel session wrote anything, show the toast **"Rules added. Not saved yet."** with **Undo** (the `offerUndo` pattern). Undo steps the history back over the session's single entry (§4.8) and restores the audience saved before the session; the chooser returns if no rules remain. After another edit, Undo says what `offerUndo` already says.
  4. Focus goes to the first composed card's title, else to the start node.
- If the session wrote nothing, Done closes with no toast and no writes.
- **Reopening.** The text, the answers and the choices live in `BoardBuilder` state for the visit (`describeState`). If Undo takes the draft back to no rules, the Describe it card reopens the panel on them. Once rules exist the panel is not offered again in v1 ("Describe more rules" is parked).

### 3.10 Motion

All under 1.6 s. No framer-motion on this panel; plain CSS only, so there is no transform-fill trap.

| What | Motion | Reduced motion |
|---|---|---|
| Panel enters | the inspector's existing `bb-insp-in` | as the inspector |
| Answer opens and closes | `grid-template-rows: 0fr → 1fr`, 160 ms `--ease-standard` | instant |
| A summary value changes | opacity 0.4 → 1, 120 ms | instant |
| A check result changes | the badge cell cross-fades, 150 ms | instant |
| Cards appear, move or go | the board's existing card motion | as the board |

Nothing moves while the admin types: reading happens only on Enter, Read or an example (Assumption 8).

### 3.11 Accessibility

- The panel is `aside` labelled by its heading. The text box has its visible label. Examples are a `role="group"` labelled "Examples".
- Every choice row is a radiogroup (the extended `Seg`) or a combobox (`Picker`), labelled by its phrase.
- A polite status region in the panel says, after each read, **"Read."**, then, when present, **"Not added: {phrases}."** and **"Choose: {phrases}."** It says no count.
- Check rows are buttons whose accessible name is "{kind}, {summary}, {decision or Can't tell}".
- Contrast: every grey string uses `--text-tertiary` (#5A6775 base, #5c636a rebrand); nothing uses `--text-muted`.

---

## 4. The reader and the composer

**Files**
- `src/brand/create/describe-words.ts`: the fixed word tables. Input vocabulary, not UI copy, so it is **not** added to the `ui-copy` scan (it must hold "login", "logins" as words to read past).
- `src/brand/create/describe-model.ts`: `dictionaryOf`, `readText`, `applyChoice`, `branchesOf`, `compose`, `sentenceOf`, `nameOf`, `summaryOf`, `EXAMPLES`. Pure, React-free.
- Tests beside each (§8).

Header comment in the voice of the old `interview-model.ts`: it authors, it does not invent; parsing is matching against this tenant's names, not a model; it asks only where the tenant holds more than one fitting object.

### 4.1 Types

```ts
import type { AccessDecision, Audience, Rule, RuleWho } from '../data'

export type SlotId = 'apps' | 'who' | 'leaveOut' | 'where' | 'when' | 'devices' | 'risk' | 'signIn' | 'fallback'
export type Origin = 'text' | 'picked' | 'default' | 'unset'
export interface Span { start: number; end: number; phrase: string }       // in the text as read
export interface Answer<T> { value: T | null; origin: Origin; spans: Span[] }

export interface Outcome {
  decision: AccessDecision
  /** 2FA: null = any enabled method. 1 factor: null = password. Unused for deny. */
  method: string | null
  /** Deny only. null = the product's default message. */
  message: string | null
}
export type ZoneScope = 'both' | 'ip' | 'location'
export type WhereAnswer = { mode: 'anywhere' } | { mode: 'only' | 'split' | 'not'; zoneId: string; scope: ZoneScope }
export type WhenAnswer = { mode: 'any' } | { mode: 'between'; from: string; to: string; days: string[]; timeZone: string }
export type DeviceAnswer = { mode: 'any' } | { mode: 'only' | 'not'; profileId: string }
export type RiskAnswer = { mode: 'any' } | { mode: 'bands'; mediumFrom: number; highAbove: number } | { mode: 'above'; score: number }
export type BranchId = 'match' | 'inside' | 'outside' | 'low' | 'medium' | 'high'

export interface DescribeAnswers {
  apps: Answer<string[]>
  who: Answer<RuleWho | 'everyone'>
  leaveOut: Answer<RuleWho>
  where: Answer<WhereAnswer>
  when: Answer<WhenAnswer>
  devices: Answer<DeviceAnswer>
  risk: Answer<RiskAnswer>
  signIn: Partial<Record<BranchId, Answer<Outcome>>>
  fallback: Answer<Outcome>
  /** "only" was said: the people named are refused outside the conditions. */
  only: Span | null
  /** "everyone else" (or a synonym) was said: the policy stays for Everyone. */
  everyoneElse: Span | null
  /** Two overlapping clauses: the index (in `Reading.clauses`) of the one that decides the overlap. Null when none overlap. */
  order: Answer<number> | null
}

export interface ChoiceOption { value: string; label: string; meta?: string }
export interface Choice { id: string; slot: SlotId | 'order'; span: Span; options: ChoiceOption[]; picked: string | null; notAddedReason?: string }
export interface NotAdded { span: Span; reason: string; action?: 'create-zone' | 'device-profiles' | 'auth-methods' }
export interface Reading { text: string; answers: DescribeAnswers; choices: Choice[]; notAdded: NotAdded[]; clauses: Clause[] }

/** What the reader needs from the store. `scenarios` are the tenant's templates. */
export type DescribeTenant = Pick<BrandStore, 'apps' | 'groups' | 'users' | 'zones' | 'fingerprints' | 'methods' | 'policies' | 'scenarios'>

export function dictionaryOf(t: DescribeTenant): Dictionary
export function readText(text: string, dict: Dictionary): Reading
export function applyChoice(r: Reading, choiceId: string, value: string, dict: Dictionary): Reading
export function branchesOf(a: DescribeAnswers): BranchId[]
export function compose(a: DescribeAnswers, t: DescribeTenant, ids?: RuleIds): Composed
export interface Composed { rules: Rule[]; fallback: Rule | undefined; audience: Audience; sources: Record<string, string> }
export function sentenceOf(a: DescribeAnswers, t: DescribeTenant): string
export function nameOf(a: DescribeAnswers, t: DescribeTenant): string
export function summaryOf(slot: SlotId, a: DescribeAnswers, t: DescribeTenant): string
export const EXAMPLES: readonly { label: string; text: string; policyId: string }[]
```

`RuleIds` is a `Map<BranchId | 'only', string>` held by the panel, so recomposing after an answer keeps each card's id and the board does not remount it. Tests pass a counter-based factory.

### 4.2 The dictionary

`dictionaryOf` builds an entry list `{ tokens: string[]; kind; id?; value?; alias: boolean }` from the store every time the panel reads. Matching is on **lower-cased word tokens** (letters, digits, `/`, `-` and `.` inside a word; punctuation splits). There is no substring matching, so "board" inside "dashboard" can never match.

| Kind | Entries, all built from the tenant unless marked fixed |
|---|---|
| **app** | Each app's full name. Plus its name without a leading vendor word (`microsoft`, `google`, `amazon`) and without a trailing edition word (`enterprise`, `console`, `cloud`), when that shorter name is unique among the tenant's apps: Outlook, Workspace, GitHub, AWS |
| **app category** (fixed table, filtered to apps the tenant has) | `crm` → Salesforce; `email`, `mail` → Microsoft Outlook, Google Workspace; `file sharing`, `files` → Dropbox, Box; `hr system`, `hris` → HRMS, Workday; `ticketing` → ServiceNow, Jira; `chat` → Slack; `meetings`, `video calls` → Zoom. **Always a choice** (§4.6), never a silent resolution |
| **group** | Each group's name, and its singular when the name is one word ending in "s" and is not `Sales` or `DevOps` (Contractor, Executive, Employee). Plus the fixed aliases below, each added only when its target group exists by name |
| **group alias** (fixed) | `hr`, `hr team` → Human Resources; `sales team`, `salespeople`, `sales people` → Sales; `finance team` → Finance; `engineers`, `engineering team`, `developers`, `devs` → Engineering; `devops team` → DevOps; `execs`, `leadership` → Executives; `it admins`, `it team`, `admins` → IT Admins. **Not** `admin` (singular) and **not** `it` alone |
| **person** | Each directory person's full name. Two people with one name make a choice (§4.6) |
| **everyone** (fixed) | `everyone`, `all users`, `everybody`, `all staff` |
| **zone** | Each zone's name and its singular. Every zone whose name contains the word "office" also takes `office`, `offices`, `the office`, `an office`, `a corporate office`, `corporate office`, `office network`. A zone whose location is exactly one country takes that country's name and its `PLACES` aliases (India, Bharat) |
| **place** | Every `PLACES` country and city name and alias. A place a zone holds (a listed city or a range label) makes a choice; a place no zone holds becomes Not added "No zone for {Place}". Aliases of two letters (`us`, `uk`) match only where the text wrote them in capitals, so "let us" is never a country |
| **profile** | Each profile's name and its singular (Corporate device, Compliant device), and its first word alone when unique (`corporate`, `compliant`) |
| **device ambiguity** (fixed) | `company laptop`, `company device`, `work laptop`, `work device`, `managed device`, `managed devices` → choice among all profiles; `unmanaged`, `unmanaged device(s)`, `personal device(s)`, `byod` → choice (§4.6) |
| **method** | The nine `METHODS` names, plus fixed aliases: `google auth` → Google Authenticator; `microsoft auth` → Microsoft Authenticator; `push`, `mo push`, `push notification` → miniOrange Push; `passkey`, `passkeys`, `fido2`, `fido`, `security key`, `security keys` → FIDO2 / Passkey; `yubikey` → Yubikey Token; `email otp`, `otp by email`, `email code` → OTP over Email; `sms`, `sms otp`, `text message` → OTP over SMS; `authenticator app` → choice among Google Authenticator, Microsoft Authenticator, miniOrange OTP |
| **factor** (fixed) | 2FA, any method: `mfa`, `2fa`, `two-factor`, `two factor`, `2-step`, `second factor`, `multi-factor`, `multifactor`, `step up`. 1 factor, password: `password`, `a password`, `password only`, `just a password`, `one factor`, `single factor` |
| **deny** (fixed) | `block`, `blocks`, `blocked`, `deny`, `denied`, `refuse`, `reject`, `stop`, `no access` |
| **allow verb** (fixed) | `reach`, `access`, `accessing`, `use`, `open`, `sign in to`, `log in to`, `allow`, `let` |
| **requirement verb** (fixed) | `need`, `needs`, `require`, `requires`, `must use`, `with`, `add`, `ask for` |
| **structure** (fixed) | only: `only`; complement: `everyone else`, `anyone else`, `everybody else`, `all other users`, `other users`; rest: `anything else`, `everything else`, `otherwise`, `the rest`, `other devices`, `any other device`; branch: `elsewhere`, `outside`, `in`, `from`, `at`, `on`, `not on`, `not from` |
| **risk** (fixed) | `low risk`, `medium risk`, `high risk`, `at low risk`, `at medium risk`, `at high risk`, `risk is high/medium/low`, `risky`, `risk profile is high`, `risk above N`, `risk score above N`, `risk over N`, `risk below N` |
| **time** (fixed patterns) | `between H[:MM][ am|pm] and H[:MM][ am|pm]`; `weekdays`, `monday to friday`, `mon-fri`, `mon–fri` → Monday to Friday; `weekends` → Saturday, Sunday; day names; `ist` → Asia/Kolkata, and each `TIMEZONES` name |
| **stop words** (fixed) | a, an, the, and, or, to, of, for, is, are, be, should, must, can, will, any, every, each, all, that, who, which, if, when, they, them, their, it, this, these, those, members, team members, users, people, staff when not "all staff", sign-ins, sign-in, logins, login, access (as a noun after "no") |

**Longest match wins.** At each token the longest dictionary entry that matches is taken and its tokens are consumed. Ties between kinds go app, zone, profile, group, person, method, then the fixed kinds.

**Quoted text.** Anything between straight or curly double quotes is taken out before matching and never read as words. It becomes a deny message (§4.3).

### 4.3 Clauses and slots

The text is cut into **clauses** at `.`, `;` and `:`, and at `,` when both sides hold an outcome word (deny, factor, method or requirement verb). Each clause gets one role:

| Role | Test | What it fills |
|---|---|---|
| **Lead** | Holds who, apps or conditions and no outcome, or is the part before a colon | Who, Applications, and conditions shared by every branch |
| **Branch** | Holds an outcome plus a branch word (`in {zone}`, `elsewhere`, `outside`, `at {band} risk`) | One Sign-in branch |
| **Plain** | Holds an outcome and no branch word | The single `match` branch, with its own conditions |
| **Rest** | Holds a rest or complement word | Nothing else matched |

Slot rules:
- **Applications:** every app matched anywhere, in catalogue order.
- **Who:** every group and person in the lead (or the only clause), in text order. None → Everyone, origin `default`.
- **Where:** `from|in|at {zone}` → `only` when "only" is in the same clause, else a condition on its clause; `outside|not from {zone}` → `not`; a branch pair `in {zone}` + `elsewhere` → `split`. Match on: `office network`, `on the network`, `from the office IP` → `ip`; `located in`, `physically in` → `location`; otherwise `both`, origin `default`.
- **When:** the time pattern and day words, time zone `Asia/Kolkata` by default (origin `default`).
- **Devices:** `on {profile}` → `only` with "only", else a condition; `not on {profile}` → `not`.
- **Risk:** all three band words in one text → `bands` with the tenant cut-offs (Assumption 10), origin `text`, spans on each band phrase. One or two band words, or `risky`, or `risk profile is high` → a choice (§4.6). `risk above|over N` → `above N`.
- **Outcome of a clause:** a deny word → Deny; a method → 2FA with that method (1 factor if the clause also says "only" before a password word, e.g. "password only"); a factor word → as the table; an allow verb with nothing else → **Allow on 1 factor, password, origin `default`**.
- **Deny message:** a quoted string attaches to the nearest deny in its clause, else to the Rest clause's deny.
- **only:** recorded as `answers.only`. It sets Nothing else matched to Deny (origin `text`, span "only") unless a Rest clause says otherwise, in which case "only" writes a Who-scoped deny rule instead (§4.5).
- **everyone else:** recorded as `answers.everyoneElse`; its clause's outcome is Nothing else matched.
- **A method that is off** (`!store.methods.find(m => m.name === name)?.active`) becomes Not added, and its branch outcome falls back to Allow with 2FA, any enabled method, origin `default`.
- **Unread words:** each maximal run of tokens that is neither consumed nor a stop word becomes a Not added row with the reason from §3.3 (place, device word, hours, or "Not an application, group or person on this tenant").

### 4.4 Branches

`branchesOf(answers)`:
- Where is `split` → `inside`, `outside`, labelled **In {zone}** and **Elsewhere**.
- Risk is `bands` → `low`, `medium`, `high`, labelled **Low risk**, **Medium risk**, **High risk**.
- Otherwise → `match`, labelled **When it matches**.
- Split and bands together are refused by the reader (the second becomes Not added "One split per description") and by the UI (§3.4 row 4).

### 4.5 The composer

`compose(answers, tenant, ids)` builds only with the `data.ts` builders (`rule`, `cond`, `card`, `when`, `fallbackRule`), so every card is an ordinary card.

1. **Shared conditions**, in this order in one card: zone (`only` → `in zone`, `not` → `not in zone`, with the scope as the per-zone Match on), device (`only` → `matches`, `not` → `does not match`), risk `above` (`device-risk above N`), time (`between`), day (`is`).
2. **One rule per branch**, in branch order:
   - `match`: the shared card → the outcome.
   - `inside`: `in zone {zone}` first, then the shared card's other conditions → the inside outcome. `outside`: the shared conditions without the zone → the outside outcome; when there are none, `not in zone {zone}`, so the rule is never a condition-less catch-all.
   - `low`: shared + `device-risk below {mediumFrom}`; `medium`: shared + `device-risk above {mediumFrom − 1}` + `device-risk below {highAbove + 1}`; `high`: shared + `device-risk above {highAbove}`.
   - A branch whose outcome is "Not set" is left out until it is answered.
3. **Every rule's Who** is the Who answer through `normaliseWho`, less Leave out as except lists. Everyone writes no `who`.
4. **Outcomes:** 1 factor → `decision '1fa', firstFactor 'Password'` (or `'Specific'` with the method when a method was given for 1 factor). 2FA → `decision '2fa', firstFactor 'Password', secondFactor method ? 'specific' : 'any', secondFactorMethods`. Deny → `decision 'deny'` plus `denyMessage` when quoted.
5. **"only" with a Rest clause** (e.g. "Contractors … only from the office …; everyone else needs Google Authenticator"): after the branch rules, one rule with the same Who and no conditions → Deny, named **{Who} elsewhere**. It is Who-scoped, and it comes from "only", so it is not an invented catch-all.
6. **The last row** is `fallbackRule(decision)` with method and message from the Nothing else matched answer. When that answer is "Not set", the draft's current last row is left exactly as it is.
7. **Audience** (direct-saved at Done, §3.9): when Who is not Everyone and the text named no complement, the audience mirrors the Who (`audienceOf(groupIds, userIds)`), exactly as the showcase seed does. Otherwise Everyone.
8. **Rule names:** `match` → the shared conditions in words ("In Corporate offices", "Compliant devices", "Corporate devices, risk above 70", "Any sign-in" never occurs), else the Who ("Sales"); `inside` → "In {zone}"; `outside` → "Elsewhere"; bands → "Low risk", "Medium risk", "High risk"; the only-rule → "{Who} elsewhere". Names are editable and are ignored by the round-trip test.
9. **Nothing else matched is "Not reached"** when every person the audience governs meets a condition-less rule (Who mirrors the audience and some rule has no conditions). Its summary says so and it asks nothing.
10. **Order** (§4.7): the clause picked to decide the overlap goes first, the other second. When the second rule's conditions include all of the first's (it could never be reached, PE102), it is dropped and its phrase goes to Not added "Never reached: {first rule name} decides first", so the composed chain never trips PE102.

`nameOf(answers)`: "{apps} from {zone}" (Where only or split), else "{apps} on {profile}" (Devices only), else "{apps} for {who}" (Who not Everyone), else "{apps}". `apps` is `listPhrase` of the app names. Over 50 characters: drop the qualifier; still over: "{first app} and {n} more". Passed through `freeName`.

### 4.6 Choices

Every case where the tenant holds more than one fitting object, with its options. Nothing is picked. "Don't add" moves the phrase to Not added with the reason shown.

| Phrase | Options (label · meta) | Don't-add reason |
|---|---|---|
| `company laptop`, `managed device`, `work laptop` … | one per profile: **Corporate devices** · Trusted device; **Compliant devices** · Device health | — |
| `unmanaged`, `personal device`, `byod` | **Not Corporate devices** · Device does not match Corporate devices; **Don't add** · No MDM condition | No MDM condition |
| An app category (`the CRM`, `email` …) | one per tenant app in the category, then **Another application** (opens the Applications `Picker`) | — |
| `authenticator app` | **Google Authenticator**, **Microsoft Authenticator**, **miniOrange OTP** | — |
| A band word alone (`risk is high`, `high risk`, `risky`, `risk profile is high`) | **Above 70** · High in this tenant's bands; **Above 39** · Medium and high (values from Assumption 10) | — |
| `low risk` alone | **Below 40** · Low in this tenant's bands; **Below 71** · Low and medium | — |
| A place a zone holds (`Pune`, `Mumbai`) | **{zone}** · {the zone's cities}; **Don't add** | No zone for {Place} (with Create zone) |
| `office` when several zones contain "office" | one per zone | — |
| A person name held by two people (`Nadia Haddad`) | **Nadia Haddad** · Contractors; **Nadia Haddad** · DevOps | — |
| `employees`, `staff` | **Employees** · Group; **Everyone** · Every user | — |
| Overlapping clauses | §4.7 | — |

`applyChoice` returns a new `Reading` with the choice picked and the slot filled (origin `picked`, span kept for the trace line).

### 4.7 Order, asked as one sign-in

Arises only when two Plain clauses both carry different outcomes, their conditions can hold at once (neither names a condition the other negates), and no branch word separates them (for example "… on a compliant device with miniOrange Push; in the office, password only": a compliant device in the office meets both).

- Row line 1: the later clause's phrase in quotes.
- Row line 2: one concrete sign-in that meets both clauses, built as in §5.2 (person, app, place, device), e.g. **Arun Patel · GitHub Enterprise · Office network · {the first preset that passes Compliant devices}**.
- Options: each clause's outcome, e.g. **Allow on 1 factor · Password** and **Allow with 2FA · miniOrange Push**. Nothing picked.
- `TipDot`: "Proposed model: first match wins" (the real engine's weighting is unverified; the deck labels this as the prototype's model).
- The picked clause decides the overlap and its rule goes first (§4.5 step 10). Until it is picked, neither clause's rule is written.

### 4.8 Writing to the board

- **One history entry per panel session.** `history.ts` gains:

  ```ts
  /** Replaces the present without a new undo step: the second and later writes of one grouped edit. */
  export function amend(h: History, next: Policy): History {
    if (JSON.stringify(h.present) === JSON.stringify(next)) return h
    return { ...h, present: next, future: [] }
  }
  ```

  The panel's first write in a session goes through `commitDraft`; every later write in the same session calls `setHist(h => amend(h, next))`. One Undo therefore returns to the draft as it was before the panel wrote anything.
- **What goes in the entry:** `rules`, `fallback` and `checks` (§5.3). Not name, apps or audience.
- **Applications** are direct-saved as the answer changes (`store.savePolicy({ ...saved, appIds })`), as the start node's pane does, so the start node shows them at once.
- **Name and audience** are direct-saved once, at Done (§3.9).
- **After each answer:** recompose with the kept `RuleIds`, write, update `sources`, recompute checks.
- The unsaved state, the leave guard and "Save policy" all work unchanged, because the rules are ordinary draft rules.

### 4.9 The four example sentences, read

| Example | Applications | Who, audience | Where, Devices, Risk | Branch rules | Nothing else matched | Choices |
|---|---|---|---|---|---|---|
| HRMS from the office | HRMS | Human Resources, Finance; audience mirrored | Only from Corporate offices, Match on Both (Default) | `match`: in zone Corporate offices → Allow with 2FA, password then Google Authenticator | Deny (from "only") | none |
| Corporate devices by risk | Google Workspace | Sales, Finance, Vikram Nair; mirrored | Only Corporate devices; bands 40 / 70 | low → 1 factor password; medium → 2FA OTP over Email; high → Deny | Deny (from "only") | none |
| Compliant devices | Microsoft Outlook, Dropbox | Everyone (Default); audience Everyone | Only Compliant devices | `match`: matches Compliant devices → 1 factor password | Deny with the quoted message | none |
| Developer tools | GitHub Enterprise, Jira | Engineering, DevOps; mirrored | Split on Corporate offices; Compliant devices on every branch | inside: in zone Corporate offices and matches Compliant devices → 1 factor password; outside: matches Compliant devices → 2FA miniOrange Push | Deny (from "Block other devices") | none |

Each composes to its seeded policy (`sc-hrms-office`, `sc-corporate-devices`, `sc-device-compliance`, `sc-dev-tools`) under the comparison in §8.1.

---

## 5. Checks

**Files**
- `src/brand/create/describe-checks.ts`: `checksFor`, `runChecks`, `whatChangesFor`. Pure.
- `src/brand/draft-checks.ts`: the persisted shape and its bridge to the guard.

### 5.1 Types

```ts
// draft-checks.ts
import type { AccessDecision } from './data'
import type { SavedSignIn } from './saved-sign-ins'
import type { SignInFacts } from './screens/sign-in-facts'

export type CheckKind = 'pass' | 'stop' | 'edge' | 'you' | 'not-named'
export const CHECK_KIND_WORDS: Record<CheckKind, string> = {
  pass: 'Should pass', stop: 'Should stop', edge: 'Edge', you: 'You', 'not-named': 'Not named',
}
export interface DraftCheck {
  id: string
  kind: CheckKind
  facts: SignInFacts
  /** From the text for pass, stop and edge; today's decision for not-named; the draft's result for you. */
  expected: AccessDecision
  /** The words it came from, for pass, stop and edge. */
  phrase?: string
}
/** A policy's checks as note-level saved sign-ins, for the guard. */
export function checksAsSignIns(p: Pick<Policy, 'id' | 'checks' | 'modifiedBy'>, people: readonly User[], apps: readonly App[]): SavedSignIn[]
```

`data.ts` `Policy` gains `checks?: DraftCheck[]` (type-only import, as `saved-sign-ins.ts` already does). `committed` spreads it through unchanged; `same` in `policy-draft.ts` keeps comparing rules and the last row only.

### 5.2 Which sign-ins are generated

`checksFor(answers, composed, tenant, today)`. Deterministic. The **app** is the first answered application in catalogue order. Every sign-in is stated for **today, 09:30, Asia/Kolkata** (`todayIn()`, the Try default).

| Kind | When | Person | Facts | Expected |
|---|---|---|---|---|
| **Should pass** | A branch outcome exists | The first person governed by the first allowing rule's Who (groups in Who order, then named people). Who Everyone: the first directory person no custom-group enforcing policy on the app governs | Meets the target rule's conditions: in zone → Office network (203.0.113.24); not in zone → Home broadband (192.0.2.10); matches a profile → the first `DEVICE_PRESETS` entry that `profileMatches` passes; does not match → the first it fails; risk → the tenant's `riskScale` Low value (12) when inside the band, else the band's first value; time → start + 30 minutes on the first listed day | The target branch's outcome |
| **Should stop** | Nothing else matched has an outcome from the text, or a Deny branch exists | As Should pass | Should pass with the first "only" condition flipped (zone → Home broadband; device → the first failing preset; risk → the High band's first value) | Nothing else matched, or the Deny branch it lands on |
| **Edge** | One of these, first that applies: a risk cut → the first value of the next band; a time window → the end + 1 minute; a zone with Match on Both → Office network with the place stated as London | As Should pass | Should pass with the one edge change | The outcome of the branch the edge lands in, per the answers |
| **You** | Any composed rule, or the audience, is Everyone | `store.account.id` (Assumption 6) | Should pass facts | The draft's own result (informational; persisted only when it allows) |
| **Not named** | Who is not Everyone | A person governed by another enforcing policy on the app and not named in Who; else the first person of the first group not in Who | Should pass facts | Today's decision: `resolveSignIn(policies, facts, env)` without the draft |

A row that cannot be built (no preset passes the profile, no person fits) is left out, not shown empty. A profile no preset can be graded against leaves the device "Not stated", and the row reads Can't tell.

### 5.3 Running them

`runChecks(checks, draft, policies, env)` → per check `{ result: TenantResolution; verdict: 'match' | 'differs' | 'cant-tell' }`.

- The draft runs **as though on**, in its real list position: `resolveSignIn(policies, c.facts, env, { substitute: { ...draft, status: 'active', appIds: draft.appIds.length ? draft.appIds : [appId] } })`. The draft's stored twin is at the top of the list (`addPolicy` prepends), so tiering and list order decide exactly as they will after turning on.
- `cant-tell` when the resolution is `depends` or `incomplete`. It is never shown as a match.
- `whatChangesFor(draft, policies, env)` = `whatChangesLine(apps.map(a => sweepTenant(policies, a, env, SWEEP_AT)), apps.map(a => sweepTenant(withPolicy(policies, { ...draft, status: 'active' }), a, env, SWEEP_AT)), env)`, the guard's own inputs.
- Recomputed synchronously after each answer, never while typing.

**Persisting.** Every write (§4.8) puts `checks` on the draft: Should pass, Should stop, Edge and Not named, plus You when its result allows. "Save policy" stores them with the policy.

### 5.4 Opening Try a sign-in from a row

On click:
1. Close the panel exactly as Done does (§3.9, toast included).
2. `session.loadBoard(draft.id, formOf(check.facts, zones))`.
3. `startTest()`. The panel shows **Today** and **Draft** (`columnsFor` for a draft), with the row's sign-in in the fields and the marker's first run.

### 5.5 The guard reruns them (Phase 4)

- At the three guard call sites (`BoardBuilder.tsx:757`, `AppsPane.tsx:121`, `use-status-change.tsx:191`), when `features.draftChecks`:

  ```ts
  savedSignIns: [...store.savedSignIns, ...checksAsSignIns(policy, store.users, store.apps)]
  ```

  where `policy` is the guarded policy as stored.
- `checksAsSignIns` maps each check to `{ id: \`${p.id}:${c.id}\`, name: \`${person} on ${app} · ${CHECK_KIND_WORDS[c.kind]}\`, facts, expected, level: 'note', savedBy: p.modifiedBy, savedAt: '' }`.
- Triggers are unchanged (final spec D.2). "Before turning on" always opens, so the checks are always read there. A You check lands in "Your own and protected sign-ins" through the existing `own` test. A note never blocks.
- The checks never appear in the tenant's Saved sign-ins library, and Try's "Save sign-in" is how an admin promotes one.

---

## 6. Changes to existing modules

### 6.1 Edition and flags

- `Features` gains, with doc comments in the file's voice:
  - `describePolicy: boolean` ("Builder: Describe it, the plain-English and guided start on an empty draft."). Lite true, Full true.
  - `draftChecks: boolean` ("Builder: the sign-ins a described draft is checked with, kept on the policy and rerun by the guard."). Lite true, Full true.
- `guidedSetup` is removed from `Features`, `FULL`, `LITE` and `GAPS` (the entry at `edition.ts:190-197`). The LITE comment gains one sentence naming Describe it as the manager's scenario #16.
- The showcase pin at `store.tsx:768` becomes:

  ```ts
  features: SHOWCASE
    ? { ...featuresOf(edition), policyTesting: true, breakInTest: true, describePolicy: true, draftChecks: true }
    : featuresOf(edition),
  ```

- `edition.test.ts` is updated once: the flag list, and the `guidedSetup` assertions at `:82-83` are replaced by `describePolicy` assertions against `BoardEmpty.tsx` / `BoardBuilder.tsx`.

### 6.2 Retiring the Interview

- **Delete:** `create/Interview.tsx`, `create/interview-model.ts`, `create/interview.css`, `create/interview.test.ts`.
- `main.tsx:69`: the import becomes `./brand/screens/board/describe.css`.
- `Policies.tsx`: remove the lazy import, `interview`, `guidedApps` and the `AnimatePresence` block. `newPolicy` becomes `startDraft` everywhere. The naming dialog stays mounted only for callers that pass it (Applications, Templates). Update the comment at `:189-192`.
- `NewPolicyDialog.tsx`: remove `onGuided`, the `bguided` button and its CSS.
- `PolicyBuilderMain.tsx`: remove the lazy import, `interview`, the "Answer five questions" button and the mount (trail only, not in the showcase).
- `ui-copy.test.ts`: drop `interviewSrc`; add `DescribePanel.tsx`, `describe-model.ts`, `describe-checks.ts`, `draft-checks.ts` and `BoardEmpty.tsx` (already there). `describe-words.ts` is deliberately not scanned (§4).
- `personas.ts:126-130`: "Be walked through the first policy" becomes met, with the note "Describe it on the empty draft." `personas.test.ts` updated.
- Any remaining "Guided setup" string or `Wand2`/`Sparkles` import under `src/brand` is removed; a test asserts none remain (§8.4).

### 6.3 `Seg` accepts no value

`Seg<T>` in `board/Section.tsx` takes `value: T | null`. With `null`, no option is `aria-checked`, the first option takes `tabIndex={0}`, and arrow keys move focus without choosing (Enter or Space chooses). Existing callers are unchanged.

### 6.4 `BoardBuilder`

- State: `describing: boolean`, `describeState` (text, reading, answers, choices), `describeIds: RuleIds`, `describeWrote: boolean` (the session has written), `describeAudienceBefore: Audience`, `sources: Record<string, string>`.
- `BoardEmpty` gets `onDescribe` when §2's condition holds.
- The canvas condition becomes `draft.rules.length === 0 && !scratch && !testOn && !describing`.
- The inspector slot renders `DescribePanel` when `describing && !testOn`.
- `publish` clears `sources`.
- The key handler ignores Del, ⌘D and arrows while focus is in the panel (it carries `role="complementary"` and the handler already skips text fields).

### 6.5 `RuleCard` and `Board`

`RuleCard` gains `source?: string` and renders `<p className="bb__card__from">From your text: “{source}”</p>` under the title, 12 px `--text-tertiary`, one line with ellipsis. `Board` passes `sources[rule.id]`.

### 6.6 Showcase seed

`showcaseUsers` gains the admin (Assumption 6). `showcase-seed.test.ts` and any test that counts the showcase directory are updated in the same step.

---

## 7. Read as text (Phase 3c)

### 7.1 Renderer fixes (`predicate-prose.ts`)

- `decisionSentence` names the first factor on 2FA: "After the password, the user completes a second factor — Google Authenticator — before access is granted." (and "After {method}, …" for a specific first factor).
- `decisionSentence` says a deny message: "Access is blocked with the message “{message}”."
- Time: `Time of day between 09:00 and 18:00 (Asia/Kolkata)`; the zone clause is added whenever `tz` is set.
- Attribute key: `User attribute {key} is {value}` (and `Custom attribute {key} …`).
- Risk band: a card holding `device-risk above a` and `device-risk below b` reads **Device risk score {a+1} to {b−1}** in `cardSentence`.
- `predicate-prose.test.ts` is updated deliberately for each.

New, beside them:

```ts
/** "allow with 2FA, password then Google Authenticator" — DECISION_PHRASE plus the factors. */
export function outcomePhrase(r: Rule): string
/** The whole policy as numbered sentences. */
export function policySentences(p: Policy, resolve: NameLookup, appName: (id: string) => string): { key: string; ruleId: string | 'fallback' | null; text: string }[]
```

`outcomePhrase`: deny → "deny", plus `, “{message}”`; 1 factor → "allow on 1 factor, password" | "…, {method}" | "…, any enabled factor"; 2FA → "allow with 2FA, password then {method}" | "…, password then any enabled method" | "…, password then {a} then {b}" (chain) | "…, password then their preferred method"; then ", device remembered for {n} days" or ", 2FA every sign-in" when set.

`policySentences(p)`:
1. "Applies to {apps}." (`listPhrase`; the system policy: "Applies to every application.")
2. "For {audience names}." only when the audience is not Everyone.
3. One per rule: "{n}. {ruleIfLine}: {outcomePhrase}." Disabled rules: "{n}. Switched off. {ruleIfLine}: …".
4. "Nothing else matched: {outcomePhrase(fallback)}."

### 7.2 Where it shows

- **Board bar:** `IconButton icon={AlignLeft} size="sm" tone="ghost" label="Read as text"` in `bbtop__acts`, before Try a sign-in. It opens a panel in the inspector slot (same shell as Describe, `ReadAsTextPanel.tsx`):
  - header **"Read as text"**, `IconButton icon={Copy} label="Copy text"` (toast **"Text copied"**), `IconButton icon={X} label="Close Read as text"`;
  - when the board holds edits or a saved draft that differ from the live rules: `Seg label="Version"` **Draft · Live**, Draft first and chosen;
  - an ordered list of the sentences, 14 px `--text-primary`, the number in a 24 px tabular column;
  - under it, `--text-tertiary`: "{status word} · Changed {lastModified} by {modifiedBy}";
  - hovering a sentence rings its card; clicking selects its card (the panel stays).
- **Policies row menu:** "Read as text" (`AlignLeft`), directly before "Save as template", in every version. It opens a kit `Drawer width={560}` titled with the policy name, with the same body and Copy. `rowMenu` gains `'text'`; `ROW_ICON` gains it; the row-menu test is updated (Assumption 14).
- Not gated by a flag: it is read-only and on in both editions.

---

## 8. Tests

All vitest, beside their modules. React-free where the module is.

### 8.1 `describe-model.test.ts`

- **Round trip (acceptance 1).** For each of `EXAMPLES`, `compose(readText(text, dictionaryOf(showcaseTenant())).answers, tenant)` deep-equals the seeded policy's `rules`, `fallback.decision` and `audience`, after stripping: every `id`, `matchEstimate`, rule `name`, `enabled`, `pristine`, and `denyMessage` unless the sentence quotes one (Compliant devices keeps it).
- **No choices, no Not added** for the four examples.
- **Renderer inverse.** For the answers of each example and for every combination in 8.1's lint enumeration, `readText(sentenceOf(a)).answers` equals `a` (origins aside).
- **Lint (acceptance 2).** Every combination of the structural answers (Who ∈ {Everyone, Human Resources, Sales + Finance + Vikram Nair} × Leave out ∈ {none, IT Admins} × Where ∈ {anywhere, only Corporate offices, split Corporate offices, not India} × When ∈ {any, 09:00–18:00 Monday to Friday} × Devices ∈ {any, only Compliant devices, not Corporate devices} × Risk ∈ {any, bands 40/70, above 70}, less split × bands), with branch outcomes cycling Allow on 1 factor, Allow with 2FA (Google Authenticator), Deny by index and the last row ∈ {Deny, Allow with 2FA any, Not set}, composes to a policy on HRMS for which `diagnose()` against `showcaseTenant()` reports **no errors**. The combination count is asserted as a literal, as `interview.test.ts` did.
- **No missing ids (acceptance 5).** Across the same enumeration, every zone, profile, group, person and app id in a composed policy exists in the tenant.
- **No catch-all.** No composed rule has zero conditions and no Who, in any combination.
- **Word boundaries (acceptance 3).** "Step up admins on the admin dashboard" matches no group ("admin dashboard" is Not added); "Block contractors signing in from outside the office" gives Where `not` Corporate offices and **no** rule with `in zone`.
- **Manager's sentences (acceptance 4).** See §9, scenes 8 and 9; asserted as data.
- **Duplicate names.** "Nadia Haddad needs a passkey on Jira" gives a person choice with two options and no Who until picked.
- **Off method.** "Sales use Salesforce with OTP over SMS" gives Not added "OTP over SMS is off in Authentication methods" and the branch outcome Allow with 2FA, any enabled method, origin `default`.
- **Order.** The two-clause dev-tools variant (scene 12) yields an order choice and writes neither clause until it is picked; both answers compose lint-clean with no PE102. A variant whose second clause is shadowed ("Engineering use Jira with miniOrange Push; in the office on a compliant device, password only", picking the first) drops the shadowed clause to Not added "Never reached: …".

### 8.2 `describe-checks.test.ts`

- For each example: the kinds generated, their people and facts (as data), and that every Should pass, Should stop and Edge row resolves to its Expected on `showcaseTenant()` with the draft added through `addPolicy`'s position (prepended).
- Contractors (scene 7): the Not named row is decided by **Developer tools — office and device checks**.
- A row whose facts lack what a condition reads is `cant-tell`, never `match`.
- `whatChangesFor` equals the guard's own `whatChanges` for the same draft (`runGuard` with kind `turn-on`).

### 8.3 `draft-checks.test.ts` and guard

- `checksAsSignIns` names, ids, `level: 'note'`.
- `runGuard` with a policy carrying checks lists them under Saved sign-ins, puts a You check under "Your own and protected sign-ins", and never adds one to `blocking`.

### 8.4 UI tests (`describe-ui.test.tsx`, jsdom)

- The empty draft shows three `bb__start2` buttons in the order of §2; a live policy with no rules shows two.
- Clicking an example fills the box, reads, and writes three cards for Corporate devices by risk.
- Done shows "Rules added. Not saved yet."; Undo returns to the chooser in one step and restores the audience.
- The footer holds only buttons (no text node outside a button).
- No string under the panel's files matches `/\bAI\b/`, "assistant", "gauntlet", "rehearse" or any "login" form; no file under `src/brand` imports `Sparkles` or `Wand2`.
- Reduced motion: no transition durations on `.bdsc__*`.

### 8.5 History

`history.test.ts`: `amend` keeps `past`, clears `future`, and is a no-op for an equal policy; commit, amend, amend, undo returns the pre-commit present.

---

## 9. Acceptance scenes (browser, showcase tab, 1,120 px, light, rebrand on)

First confirm which worktree owns localhost:5173. Open Policies › New policy each time unless a scene says otherwise.

1. **Door.** "Untitled policy N" opens on three equal cards: Use a template · Describe it · Start from scratch. Measure: equal widths, no card louder than the others, no orange except the hovered art part the siblings already use. Open HRMS access from corporate offices, delete its rule in the board, and the chooser shows two cards.
2. **HRMS example.** Describe it › HRMS from the office. Applications "HRMS" with the line "Also covers HRMS: HRMS access from corporate offices"; Who "Human Resources and Finance"; Where "Only from Corporate offices · Any time" with Default on Match on; Sign-in "Allow with 2FA · Google Authenticator"; Nothing else matched "Deny". No choices, no Not added. One card on the chain with "From your text: “only from a corporate office”". Checks: Should pass Kavya Menon · HRMS · Office network → Allow with 2FA; Should stop Kavya Menon · Home broadband → Deny; Edge Kavya Menon · Office network, London → Deny; Not named Sanjay Bhatt (Employees, the first group not in Who) · HRMS → Allow on 1 factor, Global Default Policy. No You row. What changes: all four counts 0.
3. **Workday demo.** Type "HR and Finance reach Workday only from a corporate office, with Google Authenticator." and press Enter. Same answers on Workday, no "Also covers" line. What changes shows Now asked for 2FA and Now denied above 0, Now allowed 0.
4. **Corporate devices by risk.** Devices "Only Corporate devices · Medium from 40, high above 70" with the trace on the three band phrases. Three cards in order Low risk, Medium risk, High risk. Edge row at risk 40 → Allow with 2FA.
5. **Compliant devices.** Who "Everyone" tagged Default. Nothing else matched "Deny · Custom message". A You row for Jaspreet Toor. No Leave out row (the rule allows).
6. **Developer tools.** Where "Corporate offices, inside and outside"; Sign-in "In Corporate offices: Allow on 1 factor · Elsewhere: Allow with 2FA". Two cards, the office one first. Edge row (office network, London) → Allow with 2FA, miniOrange Push, rule 2.
7. **Contractors.** Type "Contractors reach GitHub and Jira only from the office on a company laptop; everyone else needs Google Authenticator." Devices shows the choice “company laptop” with Corporate devices · Compliant devices, nothing picked, and the chain holds no device condition. Pick Corporate devices. Chain: Contractors in Corporate offices on Corporate devices → Allow on 1 factor (Default password); Contractors elsewhere → Deny; Nothing else matched → Allow with 2FA · Google Authenticator. Nothing else matched shows "Decided elsewhere: Engineering, DevOps (Developer tools — office and device checks)". The Not named row names Arun Patel and is decided by Developer tools — office and device checks. The You row shows Jaspreet Toor → Allow with 2FA.
8. **Manager sentence 1.** Type "MFA for all sales team members accessing the CRM from outside the US". Not added: “outside the US” · No zone for United States · Create zone. Applications choice “the CRM”: Salesforce · Another application, nothing picked; Applications "Not set"; Checks show "Choose an application". Who "Sales" from "sales team". Sign-in "Allow with 2FA · Any enabled method" from "MFA". Pick Salesforce: one card, Sales → Allow with 2FA; Nothing else matched "Not reached". Create zone opens Zones behind the leave guard.
9. **Manager sentence 2.** Type "block logins from unmanaged devices when the risk profile is high". Devices choices: “unmanaged devices”: Not Corporate devices · Don't add; “risk profile is high”: Above 70 · Above 39. Nothing picked, no card yet. Applications "Not set". Pick Not Corporate devices and Above 70: one card, Device does not match Corporate devices and Device risk score above 70 → Deny. Who Everyone, so Leave out appears (Nobody, Default) and the You row appears once an application is chosen. Pick Don't add instead: Not added gains “unmanaged devices” · No MDM condition.
10. **Word boundaries.** "Step up admins on the admin dashboard" → Not added “admin dashboard”; Who stays Everyone (Default). "Block contractors signing in from outside the office" → one card, Contractors, not in zone Corporate offices → Deny.
11. **Duplicate person.** "Nadia Haddad needs a passkey on Jira" → a Who choice between Nadia Haddad · Contractors and Nadia Haddad · DevOps.
12. **Order.** "Engineering and DevOps reach GitHub and Jira on a compliant device with miniOrange Push; in the office, password only." Sign-in shows the sign-in "Arun Patel · GitHub Enterprise · Office network · {compliant preset}" with Allow on 1 factor · Password and Allow with 2FA · miniOrange Push, nothing picked, and the TipDot; no card is written for either clause yet. Pick Allow on 1 factor: the office card sits first. Pick Allow with 2FA: the compliant-device card sits first and the office card second (still reached, by an office sign-in on a device that fails the checks). Neither choice raises PE102.
13. **Clicks only.** Describe it with an empty box. Applications › Microsoft Outlook and Dropbox, Who › Everyone, Devices › Only › Compliant devices, Sign-in › Allow on 1 factor, Nothing else matched › Deny. The box now reads the rendered sentence. The chain equals scene 5 less the message.
14. **Undo.** After scene 4 press Done: toast "Rules added. Not saved yet." with Undo; the name is "Google Workspace on Corporate devices". Undo: the chooser returns, the name stays, the audience is back to Everyone.
15. **Try hand-off.** In scene 6 click the Edge row: the panel closes with the toast, Try a sign-in opens with columns Today and Draft and the London place in the fields.
16. **Save and guard.** After scene 2 on Workday, Save policy: the policy is Inactive and carries four checks. Turn on from the status pill: Before turning on lists the checks by name under Saved sign-ins, none blocking.
17. **Read as text.** On each of the four seeded policies, the bar's Read as text shows numbered sentences with no raw id, no legacy name, the first factor on every 2FA rule, and the deny message on the last row. The row menu's Read as text opens the same in a 560 px drawer.
18. **Honesty.** The panel heading's TipDot reads the label in §3.1 word for word. No "AI" anywhere on the panel, the card or the toast.
19. **Motion.** Typing in the box moves nothing on the panel or the board. With reduced motion, answers open and close instantly.
20. **Layout.** Panel 560 px, canvas about 496 px with the rail collapsed; no horizontal page scroll with the rail reopened.

---

## 10. Build order

| Step | Scope | Days | Needs | Accept when |
|---|---|---|---|---|
| **3a. Rows and composer** | `describe-words.ts`, `describe-model.ts` + tests; `DescribePanel` without the Checks block; `BoardEmpty` card and `DescribeArt`; `BoardBuilder` mount, `amend`, `sources`; `RuleCard.source`; `Seg` null; flags and the pin; retire the Interview (§6.2); seed the admin | 3.5 | Phase 0 | §8.1, §8.4 (less checks), §8.5 green; scenes 1, 2 (answers only), 4–14 less their check rows, 18–20 |
| **3b. Checks and hand-off** | `describe-checks.ts`, `draft-checks.ts`, `Policy.checks`; the Checks block and What changes line; §5.4 hand-off | 1.5 | 3a, Try a sign-in (A) | §8.2 green; scenes 2, 3, 7, 15 in full |
| **3c. Read as text** | §7 renderer fixes and `policySentences`; `ReadAsTextPanel`; row menu item | 1 | none (parallel with 3a) | predicate-prose tests updated; scene 17 |
| **4. Guard reruns checks** | §5.5 at the three call sites | 0.5 | 3b, D2 | §8.3 green; scene 16 |

**Verification gate after every step** (from the worktree root): `npx vitest run` green; `npx tsc -b` clean; `npx oxlint` at or below 28 warnings; `npm run build` clean; the browser pass above. Do not commit, branch or push.

---

## 11. Kill list (what this does not build)

- The Interview's full-screen takeover, timed build screen, Break-in grade ring, "What worries you most" and "Running the gauntlet" copy, the sheen wand button, and the Sparkles and Wand2 icons.
- `compose()`'s "Everyone else in this audience" catch-all, the legacy `office` / `fp-corp` ids, the hard-coded group list with counts, and the risk-30 cut-off.
- A full-width "Describe the policy" field above the cards.
- Phrase underlines in the text box, a proposed-card state, an "Add rules" commit, an Expected dropdown, "Your call", `proposeFix` on this panel, and a findings block.
- Risk boundary rows beyond the one Edge row; any count of checks; any grade or all-passed state.
- For v2: "Describe more rules" on a policy with rules, "Start a draft" from Applications or Coverage, a Create zone page pushed inside the panel, and "Apply this policy to them too" (needs an audience the board can show).
- Invented demo facts ("124 people", "Tor exit node = no country") in scripts or decks.

## 12. For the deck, not the screen

Label as backend work: model-based parsing constrained to these six answers and the tenant's own ids, keeping the source text for audit, and data handling. Label as the prototype's proposed model: first-match-wins order, the order question, and cross-policy precedence by list order within a tier. The real engine's weighting was not verified.
