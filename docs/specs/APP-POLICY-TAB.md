# Application page: the Policies tab

Dated 15 Oct 2026. It replaces the bento built the same morning (`app-bento.tsx`). The code is the final word. Later owner changes override this file.

Screen: Applications → an application → **Policies**. Code: `src/brand/screens/ApplicationPage.tsx` (`PoliciesTab`) and the files in the build plan.

---

## 1. Why

The owner said this about the tab on 15 Oct:

- "Use the full space, I don't need cards, I need the preview here in the page itself."
- "Show 2 buttons: one is Edit, which can be the open in builder, and one is Replace policy. Here we show the basic things but you can't control it, so add basic CRUD options that might be needed from the app's point of view."
- What belongs here from the app's point of view: policy changes from the change log, break-in attempts (hidden for now), and the people and groups it covers with the avatar trail.
- "We can make it an accordion or something, just hide it and on click show only."
- "Go through Mobbin and check some detail screens, then redo our app policy tab in a better way. Also rethink the function and data we should show in the app's policy section."

These rulings still bind the tab:

- An application has **at most one** sign-in policy, and the Global Default always sits behind it (14 Oct). The test is `ownerOf()`.
- **No group picking from an application.** Who belongs to rules and is edited in the builder (13 and 14 Oct).
- Post sign-in policies stay on their own tab.
- Break-in attempts stay behind `BREAK_IN_ON_APP = false`.

What was wrong with the bento:

- The rules preview was a frozen picture of the builder, 360px high and mostly empty. It was `inert`, so the keyboard could not reach it.
- The header had five equal buttons.
- Four boxed tiles each held one fact.
- The Global Default card merged two different tiers into one sentence.
- The saved-draft badge was lost.
- Nothing said the policy was shared with other applications.
- "View all" opened every application's blocked sign-ins.
- "Show all 12" presented a sample size as if it were the week's total.

There was also a data defect, checked on 15 Oct by running the model against the showcase tenant. The modelled sign-ins for an application are drawn from one person per group across the whole directory. Every one of Box's 12 sample sign-ins was therefore decided by the Global Default and none by Box's own policy. Any per-rule figure would read zero until the sample is fixed (§7.2).

## 2. Questions the tab answers, in order

1. **What happens when someone signs in to this application?** The rules list (C) reads top to bottom in first-match order. It ends with "Nothing else matched" and then the Global Default.
2. **Who does each rule apply to, and what must they do?** C's Who column, and its Outcome column (decision pill plus factors, for example "Password, miniOrange Push").
3. **What happens to everyone else?** Two tiers in the same list. C3 is people the policy covers whom no rule matched. C5 is people outside the policy, who get the Global Default, with their count.
4. **Does each rule actually do anything?** Each row shows its sign-ins over the last 7 days and when it last matched. A rule that can never be reached says so.
5. **Is this policy deciding now, and is another version waiting?** The status pill, plus a state line (B) that appears only for a draft, inactive, monitoring or an unpublished draft. The unpublished changes are listed in words.
6. **Will editing it change other applications?** "Shared with" in the fact line, and the other applications named on the status menu items.
7. **Why can't this person get in?** Find a person in Sign-in activity (D). The line shows who decides for them and how, with Check access for that person.
8. **Who signed in recently, what did they get, and why was anyone refused?** Sign-in activity (D). Its Rule column links back to the row in C.
9. **What changed, and who changed it?** Changes (E1). A change that quotes a rule links to that rule's row.

## 3. Layout

### 3.1 At 1440px

The content column is about 1100px. The shell rail is on the left. The figures below are examples only.

```
┌─ APP HEAD (unchanged) ─────────────────────────────────────────────────────────────────────────────┐
│ ←  [box] Box ✎   SAML                                                                         Docs │
│ Basic  Advanced  Sign-in options  Attributes  Policies  Post sign-in  Users  Groups  Metadata      │ line tabs, no counts
╞════════════════════════════════════════════════════════════════════════════════════════════════════╡
│ A  POLICY HEAD                                                                                     │
│ A1 Box access  (Active ⌄)                                     A3 [⇄ Replace policy]  [✎ Edit]      │ Edit = the one orange
│ A2 Covers (EN)(DE) Engineering, Design · 10 people    Shared with [o][d]    Changed 2 days ago by … │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ B  STATE LINE  (only when there is something to say)                                               │
│ (i) Draft changes not published                                              Review in builder ↗   │
│     Added    3. For Contractors, any sign-in: deny.                                                │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ C  RULES                                                In order  [Sample]       [Check access ↗]  │
│ C0  #  Rule                            Who                  Outcome                Sign-ins ·      │
│                                                                                    last 7 days     │
│ ─────────────────────────────────────────────────────────────────────────────────────────────────  │
│ C1  1  Engineers, where we operate     (EN) Engineering     (Allow on 1 factor)    2,036         ⌄ │
│        In zone Operating countries                          Password               Last Thu 8 Oct  │
│ ─────────────────────────────────────────────────────────────────────────────────────────────────  │
│ C1  2  Designers, where we operate     (DE) Design          (Allow with 2FA)       412           ⌃ │
│        In zone Operating countries                          Password, miniOrange   Last Wed 14 Oct │
│                                                             Push                                   │
│ C2     Who             (DE) Design  (IB)(MB)(TJ)                                                   │
│        What it checks  IF [◎ Zone] in zone [Operating countries]                                   │
│                        THEN Password → miniOrange Push → Signed in                                 │
│        Uses            [◎ Operating countries · Zone]                                              │
│                                                                                      Edit rule ↗   │
│ ─────────────────────────────────────────────────────────────────────────────────────────────────  │
│ C3  *  Nothing else matched            Anyone not matched   (Deny)                 380           ⌄ │
│                                        above                "Box opens only from…" Last Tue 13 Oct │
│ C4 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ Outside Box access ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ C5  ⤷  Global Default Policy [System]  Everyone else ·      2 rules, then (Deny)   655           ⌄ │
│                                        33 people                                   Last Wed 14 Oct │
├───────────────────────────────────────────────────────────────┬────────────────────────────────────┤
│ D  SIGN-IN ACTIVITY  (8/12)                                   │ E  RAIL (4/12)                     │
│ Sign-in activity            [⌕ Find a person] [Result: All ⌄] │ E1 Changes              View all ↗ │
│                                                   View all ↗  │ (JT) …                  2 days ago │
│ D1 Arun Patel · Box access · Through Engineering [Check access]│   Added "Designers, where we      │
│ Result         When              Person       From      Rule  │   operate"                         │
│ › (Deny)       Thu 8 Oct, 11:20  Arun Patel   Frankfurt Nothing│ ───────────────────────────────── │
│   Network or place is not allowed                       else… │ E2 Post sign-in                    │
│ ⌄ (Allow on 1… Wed 14 Oct, 09:30 Arun Patel   Office    Rule 1│    Data export protection ↗        │
│   D2 Decided by  Box access · Rule 1 · Engineers, where …     │    (only when one is linked)       │
│      Device      Known device · Risk 12                       │ ───────────────────────────────── │
│      [Open in Check access ↗]  [Copy summary]                 │ E3 Break-in attempts               │
│                                                    Show more  │    (BREAK_IN_ON_APP = false)       │
└───────────────────────────────────────────────────────────────┴────────────────────────────────────┘
```

Regions:

- **A**: policy head. A1 is the name and status menu, A2 the fact line, A3 the actions.
- **B**: state line.
- **C**: rules. C0 column labels, C1 rule row, C2 open body, C3 last row, C4 tier label, C5 Global Default row.
- **D**: sign-in activity. D1 person line, D2 open sign-in.
- **E**: rail. E1 Changes, E2 Post sign-in, E3 Break-in (hidden).

Grid rules:

- A, B and C span the full width. D takes 8 columns and E takes 4, with a gap of `--space-8`.
- Sections are separated by a heading and a `--border-subtle` hairline. There are no tiles, fills or card borders.
- C rows use fixed tracks: `#` 32px · Rule 1fr · Who 220px · Outcome 220px · Sign-ins 140px · chevron 24px. Row ends line up, as on the Authentication methods rows.

### 3.2 At 900px and below

The shell rail overlays the page at this width.

- **A:** A3 wraps under A1, keeping the order Replace policy, then Edit. A2 breaks into stacked label-and-value pairs.
- **C:** C0 is hidden. Each row becomes three lines:
  1. Number and name, with the decision pill at the right.
  2. The If sentence.
  3. Who faces · factors · "2,036 sign-ins · last Thu 8 Oct", all muted.
- **C2:** label above value.
- **D and E:** they stack below 1120px, with E under D. D hides From, which still shows in D2. The table scrolls inside `btable__scroll`, and the page never scrolls sideways.
- Touch targets follow the existing coarse-pointer rule.

## 4. Blocks

### A · Policy head

**Which policy.** `standing = appStanding(app.id, policies, users)`. The shown policy is `standing.rows.find(r => r.state === 'decides')?.policy ?? standing.rows[0].policy`. Any other row is the B "also" case.

#### A1: Name and status menu

The name is an `h2`. Renaming stays in the builder.

The `StatusPill` is the trigger of a kit `MenuButton`, using the new `face` prop, with a 12px chevron. Its accessible name is "Status: Active. Change status". The item list comes from the new pure `statusMenu(...)`:

| State | Items |
|---|---|
| Active | Monitor · Turn off · ─ · Remove from {app} |
| Inactive | Turn on · Monitor · ─ · Remove from {app} |
| Monitoring | Turn on · Turn off · View monitoring · ─ · Remove from {app} |
| Draft | Remove from {app} · Delete draft (only when `deletable(p)`) |
| Always on / system | No menu. The plain pill. |

- Status labels come from `statusOptions(policy, {monitor: features.monitorMode})`.
- "View monitoring" appears when `offersMonitoringView(...)` is true.
- When `policy.appIds.length > 1`, each status item carries a `hint` naming the other applications, for example "With Dropbox", built with `listPhrase`. "Remove from {app}" has no hint, because it only affects this application.
- **No item uses `danger`.** Red appears only inside the confirms.

#### A2: Fact line

One line of label and value pairs. Labels are `--fs-sm` in `--text-tertiary`.

| Label | Value and source | Interaction | Shown |
|---|---|---|---|
| Covers | A `FaceStack` (max 5) of the policy's groups and people, then their names, then "· {n} people". Names come from `policy.audience`. **n is the number of directory people this policy actually decides for**, from the new `coverageOf(...)`. | A group name opens `go({name:'application', appId, tab:'users', group: id})`. "{n} people" opens the Users tab filtered to this policy (new `policy` route param). This is read only, with nothing to pick. | Always. Shows "Everyone · {n} people" when `audience.everyone`. |
| Shared with | `AppLogo` 16px for each entry of `appsOf(policy, apps)` minus this application, opening `AppsPeek` with **no `onEdit`**, because applications change in the builder. | Hover or press opens the peek. | Only when the policy is on more than one application. |
| Changed | `readFoot(policy)` without its status word, for example "2 days ago by {name}". | None | Hidden for the system policy. |

#### A3: Actions

"Replace policy" (secondary, `Replace` icon), then "Edit" (brand, `Pencil` icon). See §5.

### B · State line

**Purpose:** say the one thing that changes how C should be read, with at most one or two inline links.

It is a kit `Callout`, full width, at most three lines. It enters with an opacity fade through Motion. Its tone is `info` for pending changes and monitoring, and `neutral` for draft, inactive and the "also" case. It never uses amber, red or a dot.

It renders only when there is something to say. The new pure `tabNotice(...)` picks the variant in this order: **also > pending > state**.

| Variant | Data | Copy | Inline links |
|---|---|---|---|
| Another policy on this application (data allows it; the ruling bars it) | `standing.rows` other than the shown one | "Also on {app}: {name} · {Status word}" | "Edit" → board for that policy; "Remove from {app}" → `remove(row)` |
| Unpublished changes on a live policy | `useDraftDiff(storedVersions(policy))` (`board/use-lines.ts`, `board/read-as-text.ts`) returns `{added, removed}` | Title "Draft changes not published". Up to 3 lines, each "Added" or "Removed" plus the sentence (the inspector's `insp__diff` grammar). If there are more, "Show all" opens the rest in place. | "Review in builder ↗" → `go({name:'board', policyId, from:{appId}})` |
| Draft | `whyNotDeciding(p)` | "Draft. It decides no sign-ins." | None. Edit is the way on. |
| Inactive | `whyNotDeciding(p)` | "Inactive. It decides no sign-ins." | "Turn on" → `statusChange.request(p, 'active')` |
| Monitoring | `whyNotDeciding(p)` + `planLine(planOf(monitorRows(p, policies, env, monitorSamples(p, env, SAMPLE_DAY))))` | "Monitoring. It decides no sign-ins." then the plan line ("If turned on: …") | "View monitoring" → `statusChange.viewMonitoring(p.id)` |

When the policy is a draft, inactive or monitoring, C's own policy rows are dimmed (`--text-tertiary`) and their Sign-ins cell is empty. The Global Default row stays at full strength, because it is the one deciding.

### C · Rules (the preview in the page)

**Purpose:** the whole decision chain, readable without opening anything. Rows open in place, one at a time.

**Head:** heading "Rules", then a muted aside "In order", then `Badge tone="neutral"` "Sample", which marks the sign-in figures as modelled. At the right is a ghost "Check access ↗".

**Data:** the new pure `chainRows(policy, globalDefault, everyoneElse, look)` and `trafficByRow(...)` (§7.3).

**C0 · Column labels:** "#", "Rule", "Who", "Outcome", "Sign-ins · last 7 days". `--fs-sm`, `--text-tertiary`.

**C1 · Rule row.** The whole row is one `<button aria-expanded aria-controls>`, with no separate settings control.

| Cell | Content | Source |
|---|---|---|
| # | `1`, `2` … in `--accent` (slate) | index + 1, numbered as the builder numbers them |
| Rule | The name (`--fw-medium`). Sub-line: the If sentence, or "Any sign-in" when the rule has no cards. A rule that is turned off gets an "Off" tag (`FATE_SAID.off`); an ended grant reads `GRANT_ENDED`. A shadowed rule's sub-line reads "Never reached · rule {n} matches first". | `predicateSentence(rule.when, resolve)`; `blockedBy(policy, i)` |
| Who | `FaceStack` (max 3) and names. An empty Who reads "Everyone covered". Exceptions read "Everyone covered except Contractors". | `rule.who` via `whoSentence` |
| Outcome | `DecisionBadge`, plus a muted factor line ("Password", "Password, miniOrange Push"). For Deny, the deny message in quotes, cut to one line. In a draft, a rule with no outcome yet reads "Outcome not chosen yet". | `askOfRule(rule).first/.second`, `rule.denyMessage`, `outcomePhrase` |
| Sign-ins · last 7 days | `formatCount(weight)`, with a muted "Last {whenSaid}" under it. The cell is empty when the row decided nothing or the policy does not decide. | `trafficByRow` |
| Chevron | A `motion.span` rotating from 0 to 180 degrees | — |

**C2 · Open body.** It opens in place with no frame and hairline-separated parts. It reuses the inspector's `RuleBody` (`sign-in-tests/InspectPanel.tsx`), exported and called with `plan = null`. That gives:

- "What it checks" (the board's read-only `IfBlock`)
- "Uses" (zone and device chips, opening their facts in place, with "Open in Zones ↗")
- "What the person is told"

This tab adds two parts:

- **"Who"** at the top: full names and exceptions (`whoSentence`). For a group, the faces of up to 5 directory members, then `+N`, with no count text.
- **"Edit rule ↗"** (link) at the foot: `go({name:'board', policyId, rule: rule.id, from:{appId}})`.

**C3 · Last row.** It uses the same grid.

- `#` shows `*`. Rule is "Nothing else matched" (`FALLBACK_NAME`).
- Who is "Anyone not matched above".
- Outcome comes from `policy.fallback`.
- The body is `RuleBody` with `ruleId = null`. "Edit rule" goes to `rule: 'fallback'`.

**C4 · Tier label.** A centred `--fs-sm` label on a dashed `--border-subtle` line: "Outside {policy name}". It shows whenever C5 does.

**C5 · Global Default row.**

- `#` shows a corner-arrow glyph. Rule is "Global Default Policy" with `Badge tone="system"` "System".
- Who reads "Everyone else · {n} people", where n is `coverageOf(...).everyoneElse`. This is the only place that number appears.
- Outcome reads "{n} rules, then" plus the `DecisionBadge` of its last row (`rulesLabel(gd)`, `fallbackOf(gd)`). This is the only place that rule count appears.
- Sign-ins counts the rows the Global Default decided.
- The body is the Global Default's numbered lines from `policySentences(gd, resolve, appName)`, without its "Applies to" line, each followed by its `DecisionBadge`. Its foot link is "Open Global Default ↗", which goes to `go({name:'board', policyId: gd.id, from:{appId}})`.
- There is no "Edit rule" on the Global Default's lines.

**C states:**

| State | What C shows |
|---|---|
| Active | As drawn. |
| The policy covers everyone | C4 and C5 still render, so the order stays visible. C5 is dimmed: Who reads "Nobody outside it", Outcome reads "Not reached", there is no figure, and the row does not open. |
| Draft, inactive or monitoring | The policy's rows are dimmed with no figures. C5 is lit and carries all the traffic, with Who reading "Everyone on {app} · {n} people". |
| No rules | C3, C4 and C5 only. |
| Unpublished changes | C shows the **live** rules, because those decide now. B carries the difference. |
| Shared | C is unchanged, and the figures are this application's only. A2 and the status menu say it is shared. |
| Application added this session (`addedAt`) | "Sign-ins · last 7 days", "Sample" and every figure are hidden. |

**Interaction:**

- Pressing a row toggles it. Only one row is open at a time, following the board's accordion ruling.
- A D Rule link or an E1 rule link opens and scrolls to the row with `scrollIntoView({block:'nearest'})`. It is smooth, or instant under reduced motion.
- Returning from the board with `flash` and a `rule` reopens that row.

### D · Sign-in activity

**Purpose:** what actually happened on this application, tied to the rules above, and where to find the person on a ticket.

**Data:**

- `signInActivity(policies, env, SAMPLE_DAY, apps).filter(r => r.appId === app.id)`, newest first. It uses the fixed sample (§7.2).
- The filter is `filterActivity(rows, {...NO_FILTER, appId, result, q})`.

**Head:**

- Heading "Sign-in activity".
- `SearchBox` with placeholder "Find a person" and aria-label "Find a person in {app} sign-ins".
- `Picker` "Result" with the options "All results", "Allowed" and "Blocked". These are the words the full page uses.
- A ghost "View all ↗".

**D1 · Person line.** It shows while the search matches at least one directory person, using the new `findPeople(q, appUserRows(...), 3)`. Each line reads "{name} · {decider name} · {reach}", where reach comes from `reachOf` ("Through Engineering", "By name", "For everyone"). It has a secondary sm "Check access" that loads `checkFormFor(app.id, policy, …, personId)` and goes to `sign-in-tests`. Typing runs nothing.

**Columns:**

| Column | Content |
|---|---|
| Result | `DecisionBadge` or `CantTell`. On a Deny, a muted line under it with `DENY_REASON_WORD[reason]`. |
| When | `whenSaid(date, time)`, for example "Thu 8 Oct, 11:20" |
| Person | The person's name |
| From | Where the sign-in came from |
| Rule | A link button: "Rule 1", "Nothing else matched" or "Global Default Policy". It opens that row in C (`chainKeyOf`). |

**Rows:** there are 5 rows, then "Show more" / "Show fewer". Neither carries a count, because the sample is not the week's total. There is no per-row actions column.

**D2 · Open sign-in.** The When cell carries the chevron. This is the expandable row from `SignInActivity.tsx`, extracted to a shared component. It shows:

- "Decided by": `{policyName} · {ruleLine}`
- "Reason": `{word} · Ref: {denyRef}`, on a Deny only (this is an admin surface)
- "Device": `facts.device` · "Risk {score}"
- Buttons: secondary sm "Open in Check access ↗", which runs `session.load(formOf(r.facts, zones))` then `go({name:'sign-in-tests'})`, which is today's press; and "Copy summary" (`activitySummaryOf`).

**View all:** `go({name:'sign-in-activity', appId: app.id})`. The page opens filtered to this application with Result set to "All results".

**States:**

- Application added this session: `EmptyState compact` with the History icon and "No sign-ins yet".
- A filter or search with no matching rows: "No sign-ins match".
- Draft, inactive or monitoring: no change. The Rule column says "Global Default Policy", which is what happened.

### E · Rail

**E1 · Changes.**

- **Data:** `changeLog.filter(c => c.policyId === policy.id)`, newest first.
- **Layout:**
  - Show 3 entries, then "Show all" / "Show fewer" in place, up to 10.
  - Each entry is a `Face kind="user"`, the name and `relativeTime(c.at, now)` at the right, with `c.lines` underneath, one per line.
  - When a line quotes a rule name (new `ruleNamedIn`), that name becomes a link that opens the row in C.
- **Markup:** an `<ol>` of `<li>`. No `dt`/`dd` inside list items, and no inline style.
- **Head:** "Changes" with a ghost "View all ↗", which goes to `go({name:'sign-in-activity', view:'changes', q: policy.name})`.
- **Empty:** one quiet line, "No changes yet."
- **Seed:** add a Box entry to `seedChangeLog`, 2 days ago, so it agrees with A2's "Changed 2 days ago". Its two lines use `describeChanges`' own wording for "Designers, where we operate" being added and its second factor changed.

**E2 · Post sign-in.**

- Shown only when `linkedTo(app.id, policies)` is non-empty.
- Heading "Post sign-in", then one link per policy name, each going to `go({name:'application', appId, tab:'post-sign-in'})`.
- No events, status or rules, so the sibling tab is not duplicated.

**E3 · Break-in attempts.** The existing `AppBreakIn`, behind `BREAK_IN_ON_APP = false`. The constant and its comment move to the new view file, and both are kept.

## 5. Actions

The view has exactly one brand (orange) button:

- "Edit" when the application has a policy.
- "Create new policy" when it has none.
- Either drops to secondary while the page's Basic or Advanced SaveBar is up (`saving`).

| Action | Where | Weight | Confirm | Hook |
|---|---|---|---|---|
| **Edit** | A3 | Brand (secondary while `saving`) | Leave guard (`confirmLeave`) | `go({name:'board', policyId, from:{appId}})`. The board opens the saved draft when there is one. |
| Replace policy | A3, left of Edit | Secondary | The existing `AddExistingPolicy` slider in replace mode is the confirm. The apps guard (`GuardDrawer`) opens when needed. Undo toast. | `setReplacing(policy); setAdding(true)` → `attach` → `putOn` (the old policy comes off in the same write, so `ownerOf` holds) |
| Turn on / Monitor / Turn off | A1 menu | Menu item, neutral | `statusChange` dialog (`asksFirst`, `statusConfirmCopy`), Undo toast. Acts on the whole policy, so the hint names the other applications. | `statusChange.request(policy, target)` |
| View monitoring | A1 menu; B link | Menu item / link | None | `statusChange.viewMonitoring(policy.id)` |
| Remove from {app} | A1 menu; B link (also case) | Menu item, neutral | `RemoveDialog` when the row decides (red only inside it). Otherwise it detaches at once with an Undo toast. | `remove(row)` → `detach` (apps guard) |
| Delete draft | A1 menu, only when `deletable(p)` | Menu item, neutral | `ConfirmDelete` with `deleteDetail(...)` | the existing `deleting` state |
| Turn on (inactive) | B link | Link | As the menu | `statusChange.request(p, 'active')` |
| Review in builder | B link | Link | None | board route with `from:{appId}` |
| Check access | C head | Ghost | None. It fills in the application and runs nothing until Run. | `session.patch({appId: app.id}, 'app')` → `go({name:'sign-in-tests'})` |
| Open or close a row | C1, C3, C5 | Whole-row button | None | local state, one row open |
| Edit rule | C2 foot | Link | Leave guard | `go({name:'board', policyId, rule: id \| 'fallback', from:{appId}})` |
| Open in Zones / profile | C2 Uses | Link | None | the existing `UseFacts` |
| Open Global Default | C5 body foot; no-policy head | Link | Leave guard | `go({name:'board', policyId: gd.id, from:{appId}})` |
| Group name, "{n} people" | A2 | Text links | None | `go({name:'application', appId, tab:'users', group})`, or `policy: policy.id` (new) |
| Shared with | A2 | Peek | None | `AppsPeek`, no edit |
| Find a person, Result | D head | Search, picker | None | local state |
| Check access (person) | D1 | Secondary sm | None. It fills in the person and application; nothing runs until Run. | `session.load(checkFormFor(...))` → `sign-in-tests` |
| Rule link | D, E1 | Link | None | open the row in C |
| Open in Check access | D2 | Secondary sm | None | `session.load(formOf(facts, zones))` → `sign-in-tests` |
| Copy summary | D2 | `CopyText` | None | `activitySummaryOf(row)` |
| View all (activity) | D head | Ghost | None | `go({name:'sign-in-activity', appId})` (new param) |
| View all (changes) | E1 head | Ghost | None | `go({name:'sign-in-activity', view:'changes', q})` (new params) |
| Post sign-in policy | E2 | Link | None | app route `tab:'post-sign-in'` |
| Create new policy | No-policy head | Brand | Leave guard | the existing `newPolicy` (Untitled draft → board) |
| Add existing policy | No-policy head, only when `attachable.length > 0` | Secondary | Slider, apps guard | `setAdding(true)` |

The head shows exactly two buttons, with no three dots. Status, Remove and Delete draft sit behind the labelled status pill, as on Okta's application page.

## 6. No-policy state (only the Global Default decides)

The page keeps its shape and shows what the application actually gets now. Today's centred empty card and pinned `FallbackRow` go.

```
A0  No policy on Box                                      [Add existing policy] [+ Create new policy]
    Global Default Policy [System]                                       Open Global Default ↗
C   Rules                                              In order [Sample]          [Check access ↗]
    #  Rule                                 Who          Outcome               Sign-ins · last 7 days
    1  Corporate device, where we operate   Everyone     (Allow on 1 factor)   1,210
    2  Any other device, where we operate   Everyone     (Allow with 2FA)      388
    *  Nothing else matched                 Anyone not…  (Deny)                140
D   Sign-in activity (full width unless E2 has a link)
```

- **A0:**
  - Heading "No policy on {app}", singular because of the one-application-one-policy ruling.
  - "Create new policy" is the brand button, and "Add existing policy" is secondary (only when there is something to attach). Both keep their hooks.
  - The fact line is "Global Default Policy" plus `Badge` "System", with "Open Global Default ↗".
  - No status menu, because the system policy is always on and cannot be removed.
- **C:**
  - `chainRows(null, gd, …)` lays out the Global Default's own rules as C1 rows and its last row as C3.
  - No C4 or C5, because nothing sits behind it.
  - Rows open to a read-only `RuleBody` with **no "Edit rule"**. The way to change this application's outcome is to create or add a policy.
- **D:** shown in full. Every Rule cell names a Global Default rule.
- **E1:** hidden, because the application has no policy history of its own.
- **E2:** shown if a post sign-in policy is linked. Otherwise D spans the full width.
- **Application added this session:** C hides its figures, and D shows "No sign-ins yet".

## 7. Kept, moved and removed against today

| Today | Verdict | Why |
|---|---|---|
| Frozen 360px canvas picture inside a tile (`PolicyPage canvas frozen`) | **Remove** | Fixed height, empty space, `inert`. No detail screen in the references embeds a canvas. C replaces it. |
| "Show in builder" | **Remove** | Edit and Edit rule cover it. |
| Five header buttons | **Move** | Two remain: Edit (brand) and Replace policy. Status, Remove and Delete draft move into the status pill menu. |
| "Who it covers" tile | **Move** | Into A2 (avatar trail, the actual count) and C's per-rule Who column. "Change in policy" goes. |
| Global Default tile | **Move** | Into C5, the last row of the same list under "Outside {policy}". C3 is the policy's own last row, so the two tiers are no longer merged. |
| "Not reached: everyone uses X" | **Keep, reworded** | C5's "Not reached" state. |
| Policy changes tile | **Move and fix** | Into E1: faces, rule links, a filtered View all, valid markup, and the Box seed. |
| Sign-in activity | **Keep and change** | 5 rows newest first; Result first; Rule column linked to C; reason under Deny; detail on expand; Find a person; no count on Show more; View all filtered to this application; dated When. |
| The saved-draft badge (lost in the bento) | **Restore** | B, with the changes in words. |
| Nothing said the policy was shared | **Add** | "Shared with" in A2, and hints on the status items. |
| No sign of whether a rule does anything | **Add** | Per-row figures, "Last …", "Never reached". |
| Draft, inactive or monitoring shown only as a pill | **Add** | B, the plan line, View monitoring. |
| Empty card plus a pinned `FallbackRow` | **Replace** | The no-policy view (§6). |
| More than one row reverting to the old `PolicyRow` list | **Replace** | B "Also on {app}". |
| `menuFor`, `onMenu`, `details`, `PolicyDetailsDrawer` on this tab | **Remove from this tab** | Dead on the single-policy path. The drawer stays where Policies uses it. `FallbackRow` stays for the unsaved application page. |
| `BREAK_IN_ON_APP`, `AppBreakIn` | **Keep** | In E3, still false. |
| A "copy for this application only" fork of a shared policy | **Not added** | It would put two policies on one application until a publish-time swap exists. Left for the owner. |

### 7.1 Two data fixes that ship with the tab

1. **The sample pool (activity.ts).** It is drawn from the application's own policy:
   - `pastReport({ id: app.id, appIds: [app.id], audience: ownerOf(app.id, policies)?.audience ?? EVERYONE }, …)`
   - This is the same audience handling `pastReport` already has, including people from outside it.
   - Both the tab and the Sign-in activity page use the one shared `appReport(...)`, so they agree.
   - Today every Box sample is decided by the Global Default.
2. **Dates on sign-ins.** `ActivityRow` gains `date`, so `whenSaid` can tell two Thursdays apart.

### 7.2 The other `ActivityRow` fields

`ActivityRow` gains these fields, all already computed inside `signInActivity`, and none removed:

- `policyId: string | null`
- `ruleKey: string | 'fallback' | null`
- `weight: number`
- `date: string`

## 8. Build plan

### 8.1 Files

| File | Change |
|---|---|
| `src/brand/screens/app-policy-model.ts` | **New**, pure: the functions in §8.2. |
| `src/brand/screens/app-policy-model.test.ts` | **New**: §8.3. |
| `src/brand/screens/app-policy-view.tsx` | **New**: `AppPolicyView` (A–E), `PolicyChain` (C, also used by the no-policy view), `StatusMenu`, `CoversLine`. Holds `BREAK_IN_ON_APP` and imports `AppBreakIn`. |
| `src/brand/screens/app-bento.tsx` | Deleted once nothing imports it. It is not behind a flag. Git keeps it. |
| `src/brand/screens/ApplicationPage.tsx` | `PoliciesTab` renders `AppPolicyView` when there are one or more rows, and the no-policy view when there are none. Removes the five-button `actions` slot and the multi-row list path (`menuFor`, `onMenu`, `details`, `PolicyDetailsDrawer`, `PolicyRow`/`FallbackRow` use on this tab), with their unused imports. Keeps `remove`, `detach`, `putOn`, `attach`, `addCopy`, `newPolicy`, `deletable`, `RemoveDialog`, `ConfirmDelete`, `GuardDrawer` and `statusChange.dialog`. The Users tab reads the new `policy` route param into its existing Policy filter. |
| `src/brand/screens/app-activity.tsx` | `AppActivity` and `AppChanges` are rewritten as D and E1. `AppCovers` is removed (replaced by `CoversLine`). `AppBreakIn` is untouched. |
| `src/brand/screens/sign-in-tests/activity-row.tsx` | **New**: the expandable row and detail extracted from `SignInActivity.tsx`, used by both pages. |
| `src/brand/screens/sign-in-tests/activity.ts` | Adds `appReport(...)` (§7.1) and the fields in §7.2. |
| `src/brand/screens/sign-in-tests/InspectPanel.tsx` | `export` `RuleBody`. No behaviour change. |
| `src/brand/screens/SignInActivity.tsx` | Reads the initial `view`, `filter.appId`, `filter.q` and `result` from the route. `result` is `'all'` when `appId` is given and `'blocked'` otherwise, as today. |
| `src/brand/store.tsx` | Route `{ name: 'sign-in-activity'; appId?: string; view?: 'sign-ins' \| 'changes'; q?: string }`, and `policy?: string` on `application`. |
| `src/brand/kit.tsx` | `MenuButton` gains an optional `face?: ReactNode`, drawn in place of the label text, while `label` stays the accessible name. `MenuItem` gains an optional `hint` if it does not already have one. |
| `src/brand/change-log.ts` | The Box seed entry. |
| `src/brand/screens/applications.css` | Removes `.bento*` and the unused `.bapr__frame` rules. Adds an `.apol__*` block. |
| `src/brand/routes.test.ts`, `change-log.test.ts`, `application-page-ui.test.tsx`, `sign-in-tests/activity.test.ts` | Updated or extended (§8.3). |
| `docs/HANDOFF.md` and a memory note | After the owner reviews. |

### 8.2 New pure functions (`app-policy-model.ts` unless noted)

```ts
export type ChainKey = string /* rule id */ | 'last' | 'default'
export interface ChainRow {
  key: ChainKey
  kind: 'rule' | 'last' | 'default'
  n: number | null
  name: string
  whoFaces: FaceItem[]          // [] = everyone covered
  whoSaid: string               // "Engineering" · "Everyone covered" · "Anyone not matched above" · "Everyone else"
  ifSaid: string                // "In zone Operating countries" · "Any sign-in"
  decision: AccessDecision | null
  factorSaid: string | null     // "Password" · "Password, miniOrange Push" · quoted deny message
  rulesBefore: number | null    // 'default' only
  enabled: boolean
  blockedBy: number | null      // 1-based rule that matches every sign-in first
  reached: boolean
}
export function chainRows(policy: Policy | null, globalDefault: Policy | null, everyoneElse: Policy | null,
  look: { resolve: NameLookup; groups: readonly Group[]; users: readonly User[] }): ChainRow[]

export interface RowTraffic { weight: number; last: { date: string; time: string } | null }
export function trafficByRow(appId: string, policy: Policy | null, globalDefault: Policy | null,
  policies: readonly Policy[], env: SimEnv, today: Date,
  apps: readonly Pick<App, 'id' | 'name' | 'addedAt'>[]): Map<ChainKey, RowTraffic>   // via appReport; empty when addedAt

export function blockedBy(policy: Policy, index: number): number | null              // via shadowedBy
export function coverageOf(appId: string, policy: Policy | null, policies: readonly Policy[],
  users: readonly User[], groups: readonly Group[]): { covered: number; everyoneElse: number }  // via appUserRows deciders

export type TabNotice =
  | { kind: 'also'; others: Policy[] }
  | { kind: 'pending'; added: string[]; removed: string[] }
  | { kind: 'draft' | 'inactive' | 'monitor'; said: string; plan: string | null }
export function tabNotice(row: StandRow, others: readonly StandRow[],
  diff: { added: string[]; removed: string[] } | null, plan: string | null): TabNotice | null

export function statusMenu(policy: Policy, app: Pick<App, 'id' | 'name'>, apps: readonly App[],
  opts: { monitor: boolean; deletable: boolean }): MenuItem[]   // ids: active|monitor|inactive|view-monitoring|remove|delete

export function ruleNamedIn(line: string, policy: Pick<Policy, 'rules'>): string | null
export function chainKeyOf(row: Pick<ActivityRow, 'policyId' | 'ruleKey'>, policy: Policy | null, globalDefault: Policy | null): ChainKey | null
export function whenSaid(date: string, time: string): string            // "Thu 8 Oct, 11:20"
export function findPeople(q: string, rows: readonly AppUserRow[], max?: number): AppUserRow[]
export function checkFormFor(appId: string, policy: Policy | null, people: readonly User[],
  apps: readonly App[], today: string, personId?: string): SignInForm

// sign-in-tests/activity.ts
export function appReport(app: Pick<App, 'id' | 'name'>, policies: readonly Policy[], env: SimEnv, today: Date): PastReport
```

### 8.3 Tests

All tests run on the showcase tenant with today fixed at `2026-10-15T10:00:00Z`.

**`app-policy-model.test.ts`**

`chainRows`:
- Box gives the keys `[r1, r2, 'last', 'default']`. The default row's `whoSaid` is "Everyone else", its `rulesBefore` is 2, and its `decision` is `'deny'`.
- Slack (everyone) gives the default row `reached: false`.
- `chainRows(null, gd)` gives the Global Default's rules plus `'last'`, and no `'default'` row.

`blockedBy`:
- On a fixture whose rule 1 always matches, rule 2 reports `blockedBy` 1.

`trafficByRow`:
- Box's weights sum to `appReport(...).total`.
- **Box has weight on at least one of its own rules** (the pool fix).
- Every key is a chain key.
- An application with `addedAt` returns an empty map.
- For the inactive HRMS policy, all weight is on `'default'`.

`coverageOf`:
- Box: `covered` equals the number of `appUserRows` whose decider is Box's policy.
- Box: `covered + everyoneElse` equals the directory size.
- Slack: `everyoneElse` is 0.

`tabNotice`:
- Returns each variant.
- Also takes precedence over pending, and pending over state.

`statusMenu`:
- Active gives monitor, inactive and remove.
- Monitoring includes view-monitoring.
- A draft gives remove, plus delete only when deletable.
- Items on a shared policy carry a hint naming the other application.
- **No item has `danger`.**

Small helpers:
- `ruleNamedIn` finds "Designers, where we operate".
- `chainKeyOf` maps a fallback row to `'last'` and a Global Default row to `'default'`.
- `whenSaid('2026-10-08', '11:20')` returns "Thu 8 Oct, 11:20".
- `findPeople` on the first name of a Box engineer gives Box's policy with "Through Engineering".

**`sign-in-tests/activity.test.ts`**
- "draws an application's sample from its own policy's people": Box has rows decided by Box's policy and rows decided by the Global Default.
- The new fields are present.
- The existing resolver-agreement test stays green.

**`application-page-ui.test.tsx`** (static markup)
- With a policy, the head has exactly two buttons, "Replace policy" and "Edit", and exactly one brand-class button.
- No "Show in builder", and no visible "Turn off", "Monitor" or "Remove" buttons.
- "Nothing else matched", "Outside Box access" and "Global Default Policy" are present.
- No `.insp__frozen`.
- The no-policy view shows "No policy on {app}", the Global Default's rule names, and "Create new policy" as the only brand button.
- An inactive policy shows "Inactive. It decides no sign-ins."
- The tab labels contain no digits.

**Other test files**
- `routes.test.ts`: the new route fields.
- `ui-copy.test.ts`, `app-standing.test.ts`, `app-policies.test.ts` and the `app-people-tabs-*` tests stay green.
- `app-protection.test.ts` still finds `<RemoveDialog` in ApplicationPage.

### 8.4 Components reused

- **Kit:** `Button`, `Badge` (system, neutral "Sample"), `StatusPill`, `MenuButton` (with `face`), `Callout`, `SearchBox`, `Picker`, `EmptyState`, `CopyText`.
- **Decisions and identity:** `DecisionBadge`, `CantTell`, `Face`, `FaceStack`, `AppLogo`, `AppsPeek`.
- **Rule body:** `RuleBody` → `IfBlock`, `UseFacts`.
- **Existing flows:** `AddExistingPolicy`, `RemoveDialog`, `ConfirmDelete`, `GuardDrawer`, `useStatusChange`, `useAppsGuard`.
- **Draft diff:** `useDraftDiff`, `storedVersions`.

### 8.5 CSS (tokens only, in `applications.css`)

- `.apol` is a column flex with `gap: var(--space-8)`.
- `.apol__facts`: labels `--fs-sm` / `--text-tertiary`, values `--text-body`.
- `.apol__chain` row:
  - `display: grid` with the fixed tracks in §3.1.
  - `border-top: var(--bw-thin) solid var(--border-subtle)`, padding `var(--space-5) 0`.
  - Hover `--int-ghost-bg-hover`.
  - The open row uses `background: var(--surface-sunken)`. This is greyscale selection, never orange.
  - The rule number uses `--accent`. Dimmed rows use `--text-tertiary`.
- `.apol__tier`: a centred `--fs-sm` label on a dashed `--border-subtle` line.
- `.apol__band`: `grid-template-columns: minmax(0, 8fr) minmax(0, 4fr)`, one column at 1120px and below. At 900px and below, the three-line row rules from §3.2 apply.
- Nothing below `--fs-sm` (12px). No restated values, no `--brand` outside the Edit button, no `--accent` used as a highlight, and no dots.

### 8.6 Motion

- C2 and D2 open through `AnimatePresence initial={false}` with a `motion.div` animating `height: 0 → 'auto'` and `opacity` over about 0.18s.
- The chevron is a `motion.span` with `animate={{ rotate }}`.
- B enters with opacity only.
- `useReducedMotion()` sets every duration to 0, and scrolling uses `behavior: 'auto'`.
- There is no CSS `transform` on any `motion.*` element.
- No new sounds are added. Status changes keep their existing cues.

## 9. Acceptance checks

### 9.1 Gate

1. `npx tsc -p tsconfig.app.json --noEmit` reports 0 errors.
2. `npx oxlint` reports 27 warnings or fewer. Count them.
3. `npx vitest run` passes, including the new tests in §8.3.
4. `npm run build` succeeds.

### 9.2 Browser check

Do these on http://localhost:5173 in a tab you open, and restore any shared localStorage you change.

5. **Box:** the head shows the name, an "Active" pill with a chevron, and exactly two buttons, of which only Edit is orange.
6. **Box:** A2 shows the Engineering and Design faces with "· {n} people". Pressing "Engineering" opens the Users tab filtered to Engineering.
7. **Box:** C lists rule 1, rule 2, "Nothing else matched", the "Outside Box access" label and "Global Default Policy". At least one of Box's own rules shows a figure.
8. **Box:** pressing rule 2 opens it in place and closes any other open row. "Edit rule" opens the builder on rule 2, and the builder's back link returns to Box's Policies tab.
9. **Box:** the keyboard can reach every row. Tab to a row and press Enter to open it.
10. **Box:** pressing a Rule link in Sign-in activity opens and scrolls to that row in C.
11. **Box:** typing a covered person's name shows D1 with "Through Engineering". Check access opens Access checks with the person and Box filled in, and nothing has run.
12. **Box:** "View all" in Sign-in activity opens the page filtered to Box with All results.
13. **Box:** E1 shows the seeded change. "View all" opens the Policy changes view with Box's policy searched.
14. **Box, status menu → Monitor:** the confirm opens. After confirming, B shows the monitoring line and "View monitoring", C dims the policy's rows and C5 carries the figures. Undo or Turn on restores it.
15. **Slack:** C5 is dimmed and reads "Not reached", and the Global Default row does not open.
16. **Outlook:** A2 shows "Shared with" and the Dropbox logo. The status menu items carry "With Dropbox".
17. **HRMS (inactive):** B reads "Inactive. It decides no sign-ins." with a "Turn on" link. The Rule column in Sign-in activity names the Global Default.
18. **A live policy after "Save draft" in the builder:** B lists the draft's changes, and "Review in builder" opens the draft.
19. **An application without a policy:** "No policy on {app}", the Global Default's rules, read only with no Edit rule, Sign-in activity, and "Create new policy" as the only orange button.
20. **An application added this session:** no figures in C, and "No sign-ins yet" in D.
21. **Status menu → Remove from Box:** `RemoveDialog` opens, and red appears only inside it.
22. **At 900px and at phone width:** A3 wraps, C rows become three lines, D and E stack, and nothing scrolls sideways.
23. **Reduced motion on:** rows open and close with no animation.

## 10. Rule check

| Rule or ruling | How the tab meets it |
|---|---|
| One orange button per view | Edit, or Create new policy when there is no policy. Both are secondary while the SaveBar holds orange. |
| Selection greyscale or blue | Open rows use `--surface-sunken`. Links use `--text-link`. Rule numbers use slate `--accent`. |
| Destructive triggers neutral, red only inside the confirm | Remove and Delete draft are plain menu items. Red appears only in `RemoveDialog`, `ConfirmDelete` and the status confirm. |
| Numbers once per view | Per-row sign-ins appear in C only, with no totals or shares anywhere. Covered people appear in A2 only. "Everyone else" people appear in C5 only. The Global Default's rule count appears in C5 only. Plan figures appear in B only. Show more and Show all carry no count. Rule numbers are identifiers. |
| Tabs never carry counts | No tab is added or changed. The picker has no counts. |
| 12px floor, one pill family, no decorative dots | `--fs-sm` minimum. `StatusPill`, `DecisionBadge` and `Badge` only. Faces are content. No TipDot. |
| Light mode only, tokens only | No theme work. Every value is a token. |
| Copy | Buttons are verbs: Edit, Replace policy, Check access, Edit rule, View all, Show more, Turn on, View monitoring, Review in builder, Remove from {app}, Delete draft, Open Global Default, Open in Check access, Copy summary. Labels are nouns: Rules, Rule, Who, Outcome, Sign-ins · last 7 days, Covers, Shared with, Changed, Changes, Post sign-in, Decided by, Reason. The only sentences state facts (`whyNotDeciding`, the plan line) or quote the policy's own words. No banned words. "Check access" comes from `names.ts`. |
| Sliders over centred modals; config edits in the builder | Replace uses the existing slider. Every config change goes through Edit, Edit rule or Review in builder into the board. The only dialogs are the existing confirms. |
| Nothing disabled without a reason | Nothing is rendered disabled. Options that do not apply are left out, and B states why a policy decides nothing. |
| One application, one sign-in policy (14 Oct) | Replace swaps in one write. Add existing appears only when there is no policy. A data-only second policy becomes a B line to clean up. No fork is added. |
| No group picking from an application; Who belongs to rules (13–14 Oct) | Covers is read only, and its links filter the Users tab. Per-rule Who comes from `rule.who`. The covered count comes from who the policy actually decides for, so it stays right whichever builder surface edits the audience. |
| Global Default always behind it | It is always C5. When the policy covers everyone, C5 shows "Not reached". With no policy, the Global Default is the whole list. |
| Unfinished means draft | There is no fault banner. B covers status and unpublished changes only. |
| Only Run runs | Check access and Find a person fill in the form and run nothing. Open in Check access loads a past sign-in, as it does today. |
| Denial reason admin only | Reason and Ref appear on this admin tab only. |
| Check access inspector grammar | C2 reuses `RuleBody`. Names lead to the builder. |
| Post sign-in kept apart | Never in C. E2 is a pointer only. |
| Flags kept | `BREAK_IN_ON_APP` stays false, and its component is kept in E3. No new A/B control is added, so `SHOWCASE` is untouched. |
| Motion | Motion props only, no transform on `motion.*`, reduced motion honoured. |

### Open for the owner

These are not blockers:

1. **Audience editing.** The 14 Oct note says the builder's start node no longer edits the policy audience, but `board/AppsPane.tsx` still edits it. This tab only reads the audience, so it does not depend on either answer.
2. **Copy for this application only.** There is no way to make a copy of a shared policy for one application only. This is left out on purpose (§7).
