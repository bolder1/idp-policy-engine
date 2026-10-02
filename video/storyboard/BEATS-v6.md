# Beats, sixth cut — what each take does, line by line

The takes in `takes-v2.mjs` run against the CURRENT build (5221ea1 + the run-build
worktree: locked vertical board, Collapse/Expand density pill, outcome-first Then,
Who's *Add people*, pending condition groups, the auto-opening board tour that
capture.mjs suppresses through its storage seed). The design they implement is
`DESIGN-v6.md`; where this file and that one disagree, the design wins. BEATS-v5.md
is superseded and lives in git history only.

Every line id below is in `lines.mjs`; `rec.say(id)` starts it, `rec.settle()` waits
for it. Names are said where they appear on screen: **Workday**, **Finance**,
**Executives**, **Priya Sharma**, **Office Network**, **Corporate managed**,
**Anonymizers**, **Sanctioned countries**, **miniOrange Push**, **TOTP Authenticator**.

## Conventions

- `rec.say(id)` then act, then `await rec.settle(x)` — every `say` has a `settle`
  before the next `say`.
- `rec.focus(target, {zoom})` for dialogs and the card; `rec.spotlight(target,
  {seconds, label?, cam?})` for the thing being named — **spotlight returns at once:
  hold before anything navigates away**.
- **Insets** (`rec.explain(id)`) are scheduled straight after `rec.say(...)`, one at a
  time, never across a cut, push, banner or dialog, and finished before the next click
  that changes the product. While an inset is live the whole window shelves right
  (`s .82, dx +280`) and the inset sits at (105, 409). **Every spotlight that overlaps
  a shelf carries `cam: false`** so the camera stays at rest.
- **Card scene**: `cardLight(part)` lights one part behind a veil (`'title' | 'who' |
  'cond' | 'group' | 'then' | 'parts' | null`); `cardAnno(on, 'and' | 'both')` draws the
  brackets and truth panel in two stages; `truthStep(rows)` lights rows 1..n;
  `wordTime(id, re)` is the onset of the first word matching `re`, seconds from the
  line's start. There is no `cardFreeze` any more — nothing is edited on camera.
- **Scrolling the board's chain** goes through `chainWheelTo(rec, p, targetY)` /
  `chainTo(rec, p, card)` in takes-v2.mjs, never a bare `rec.wheel`. Two measured facts
  behind that: Chromium hands the page a dispatched wheel delta **divided by the device
  scale factor** (260 asked → 130 seen at the film's dsf 2, 260 at dsf 1), and wheel
  events land rAF-aligned in real time, outside the virtual clock. The helper asks in
  device pixels and reads `.bb__world`'s y only once it has stood still for ~120 ms real
  time. The recorder's `wheel()` itself does not correct for the dsf (a `lib/recorder.mjs`
  fix; flagged, not made here) — the one bare `rec.wheel` left is c6.12's ctrl-wheel
  zoom, where the halved delta still zooms (a 9 % step against the 12 % per-event cap).
- Close condition popovers with `closePop` (click `#bb-sec-if`), never Escape.
- `rec.press('Control+a', { show: false })` before retyping a field; chords the viewer
  should see (`Alt+ArrowUp`, `Control+z`) use `rec.press(combo)` so the keycaps draw.
- Every take ends with `rec.until(...)` asserts of its end state.

## Film order and take state

```
hook (slide, 8.4 s min) → card (mode 'card', prelude 0.6, out push) → create →
banner 02 → start → banner 03 → who → banner 04 → if → banner 05 → then →
banner 06 → canvas → banner 07 → save (out fade) → outro (slide, 6.6 s min)
```

Capture order: `create → start → who → if → then → canvas → save` share one session
(the Workday policy created in `create` is saved in `save`); `card` runs LAST in a
throw-away policy and is shown second in the film. Slide lines: `hk.1` (intro),
`out.1` (outro).

## card (shown second) — one finished rule, read off its card

Prep, dry (unfilmed): New policy "Finance — adaptive access (walkthrough)", app
**Workday**, Create, Start from scratch, wait for the Inspector, let the created toast
go, **Expand cards**, `noTour`; then, still dry, the whole rule — Rule name
**Finance — off the office network**; Who: Add people → **Finance**, **Executives**,
People → **Priya Sharma** → Save 3 selected; If: Add condition → **Network zone** →
**not in zone** → "office" → **Office Network** → closePop; Add → Add condition group →
Choose a condition → **Device profile** → **does not match** → "corporate" →
**Corporate managed** → closePop; group Add condition → **Network zone** → **in zone**
→ "anonym" → **Anonymizers** → closePop; group joiner → **or**; Then: **Allow** (already
2fa) → Prove it with → **Specific methods** → Methods accepted → **miniOrange Push**,
**TOTP Authenticator** → click the Then heading → Remember this device on → Days 14 →
click `.bb__second__head`. Then `rec.dry = wasDry`, `hold(0.9)`,
`rec.track('.bb__card:not(.is-terminal)', '.bb__stage')`, `rec.cut()`.

Parts, measured once after the cut (`row = .bb__ifplain .bb__ifrow.is-cond` filtered by
text — with a group present the who-conditions are rows inside member A):

| part | locator | shape |
|---|---|---|
| `title` | `.bb__cardhead` | Rect |
| `who` | `row(/Finance\|Executives\|Priya/)` | Rect[] — two rows |
| `cond` | `row(/Office Network/)` | Rect |
| `first` | `.bb__ifrow.is-cond` first | Rect — top of the AND bracket |
| `group` | `.bb__ifgroup` first | Rect |
| `block` | `.bb__if` first | Rect |
| `then` | `.bb__ifrow` having `.bb__ifkw` "then", `.or(.bb__ifaction)` | Rect[] — the `then` row + the action row |

| # | line | on the card (events) | ≈ s |
|---|---|---|---|
| 0 | — | compositor prelude 0.6 s: the card rises in. Take: `hold(0.6)` on the still card. | 1.2 |
| 1 | `cs.1` One rule, one card. Who, if, then. | `cardLight('parts')` at say: no veil, three label pills **Who · If · Then**. `settle(0.3)` | 3.5 |
| 2 | `cs.2` Who: Finance, Executives, and Priya Sharma. | `cardLight('who')`: only the two who rows lit; label "Who". `settle(0.3)` | 3.8 |
| 3 | `cs.3` If: the sign-in is not from the Office Network. | `cardLight('cond')`: the Office Network row lit; label "If". `settle(0.3)` | 4.0 |
| 4 | `cs.4` And a group: a device not Corporate managed, or an Anonymizer network. | `cardLight('group')`: the group lit; label "If". `settle(0.3)` | 5.8 |
| 5 | `cs.5` Outside the group, everything must hold. That is AND. Inside it, one is enough. That is OR. | `cardLight(null)`; `cardAnno(true, 'and')` at say (card slides 210 px left, outer bracket + **AND**, truth panel in); `hold(wordTime('cs.5', /^Inside/))`; `cardAnno(true, 'both')` (inner bracket + **OR**). `settle(0.4)` | 8.0 |
| 6 | `cs.6` One of them: true. Both: true. Neither: false. | `truthStep(2)` at say; `hold(wordTime(/^Both/))` → `truthStep(3)`; `hold(wordTime(/^Neither/) − wordTime(/^Both/))` → `truthStep(4)`. `settle(0.5)` | 4.5 |
| 7 | `cs.7` Then: allow, with a second factor. | `cardAnno(false)` at say; `hold(0.5)`; `cardLight('then')`: the `then` row + action row lit; label "Then". `settle(0.4)` | 3.6 |
| 8 | `cs.8` Now, for real, for Workday. | `cardLight(null)`; `hold(0.3)`; `cardMode(false)` (mask opens to the window, whoosh); `hold(1.2)`; **Reset zoom** (hint false) if present; `settle(0.6)`; `hold(0.4)`. The take pushes into chapter 01. | 4.3 |

Total ≈ 35 s (budget 37). If the measured cut runs over, drop `cs.6` (rows then light on
`cardAnno 'both'`); nothing else is negotiable.

Asserts: title = rule name; 1 `.bb__ifplain` + 1 `.bb__ifgroup`; 2 `.bb__ifgroup
.bb__ifrow.is-cond`; group joiner reads "or"; then chip reads "Second factor"; journey
names **miniOrange Push** and **Remembered 14 days**.

## The five insets — where each plays

| take · line | line | call | product under the shelf |
|---|---|---|---|
| create · `c1.1` | Finance signs in to Workday every morning. Let's protect that sign-in. | `say('c1.1'); explain('finance-workday')` | cursor glides to (760,430) 1.0 s, hovers rows 2 and 4 (0.7 s each, `ox .22`), `settle(0.3)`. No dialog, no spotlight. |
| who · `c3.3` | Who starts as everyone this policy governs. Let's narrow it. | `say('c3.3'); explain('who'); spotlight(whoSec, { seconds: 2.6, cam: false }); hold(2.6); settle(0.2)` | Who section dimmed-around, camera at rest |
| if · `c4.1` | If is when the rule applies. Empty means every sign-in that reaches it. | `say('c4.1'); explain('if'); spotlight(ifSec, { seconds: 3.2, cam: false }); hold(3.2); settle(0.3)` | as above |
| then · `c5.1` | Then is the decision. Allow the sign-in, or deny it. | `say('c5.1'); explain('then'); spotlight(decide, { seconds: 3.4, cam: false }); hold(1.2); hover(deny, 1.0); settle(0.3); click(allow); hold(0.4)` | the Allow click lands after the inset has left |
| canvas · `c6.2` | A policy is a list of rules, read top to bottom. The first match decides. | `say('c6.2'); explain('first-match'); hold(3.0); settle(0.3)` | panel already closed (c6.1); nothing moves |

## 01 create — `c1.1`–`c1.5`

`c1.1` (with the inset): glide to (760,430), hover rows 2 and 4 → `c1.2`: hover row 1's
name cell (1.0 s, `ox .3`), glide to (1200, 300) 0.8 s → `c1.3`: **New policy** →
dialog (focus 1.4) → *Policy name*: type **Workday — Finance adaptive access** →
`c1.4`: *Applications this policy protects*: "work", pick **Workday SAML**, close the
picker by its trigger → `c1.5`: **Create policy** → focus back → wait for *How would you
like to start?*; the tour must not appear. Asserts: the bar names the policy; status
pill reads Draft.

## 02 start — `c2.1`–`c2.5` (unchanged)

Hover **Use a template** and **Start from scratch** → Use a template → gallery sheet;
spotlight the *Whose templates* tabs (3.2 s, hold) → filter **Device-based**; preview
**Zero-Trust baseline**; focus + spotlight its rule stack (hold) → hover *Use this
template*, **Close**, **Close the gallery** → **Start from scratch** → Inspector visible;
no tour; **Expand cards**. Asserts: one rule "New rule"; the panel edits rule 1.

## 03 who — `c3.1`–`c3.6`

Spotlight the panel (*The panel*, hold) → Rule name: Ctrl+A, type **Finance — off the
office network**; callout *Renamed as you type* → `c3.3` with the **who** inset and a
`cam:false` spotlight on Who → **Add people** → dialog (focus 1.35): tick **Finance**,
**Executives** → People → "priya" → tick **Priya Sharma** → back to Groups → **Save 3
selected** → hover the summary → spotlight the card (hold). Asserts: summary "3 groups
and people"; the card's who row; the card title.

## 04 if — `c4.1`–`c4.9`

`c4.1` with the **if** inset and a `cam:false` spotlight on If → Add condition →
**Network zone** → **not in zone** → "office" → **Office Network** → closePop → spotlight
the card's if block → focus If → Add → **Add condition group** → pending group → Choose
a condition → **Device profile · does not match · Corporate managed** → group Add
condition → **Network zone · in zone · Anonymizers**; joiner **or**; spotlight the group
→ spotlight the rule joiner; callout *The card reads it back* → `c4.9`: add **Sanctioned
countries**, **Remove Network zone**, **Ungroup** → spotlight the card's if block.
Asserts: no group on the card; both checks loose; joined with "and".

## 05 then — `c5.1`–`c5.6`

Scroll to Then; `c5.1` with the **then** inset and a `cam:false` spotlight on the
Outcome tiles: hold 1.2, hover **Deny** 1.0, settle, click **Allow**, hold 0.4 → `c5.2`:
spotlight the Second factor block → `c5.3`: Prove it with → **Specific methods**; the
alert if it shows → `c5.4`: **miniOrange Push**, **TOTP Authenticator**; close on the
Then heading → `c5.5`: **Remember this device**, days **14**, drop focus → `c5.6`: focus
the card (1.55); spotlight the journey; focus back. Asserts: Allow chosen; remember on;
14; chip "Second factor"; journey names miniOrange Push and Remembered 14 days.

## 06 canvas — `c6.1`–`c6.12` (a second real rule)

Constants: `RULE2 = 'Anonymizers — block'`; `block = group RULE2`; `fin = group RULE`;
`fallback = group 'Nothing else matched'`; `atSlot(rec, loc, n)` waits for
`Reorder rule N — drag, or use the arrow keys` inside `loc`.

| # | line | actions |
|---|---|---|
| 1 | `c6.1` Now, the board. Fold the panel away. | `setAvoid(insp)`; `hold(0.6)`; click **Close the panel**; `gone(inspector)`; `setAvoid(null)`; `settle(0.3)` |
| 2 | `c6.2` A policy is a list of rules, read top to bottom. The first match decides. | `explain('first-match')`; `hold(3.0)`; `settle(0.3)` |
| 3 | `c6.3` Add a second rule: the plus on the connector, below the Finance rule. | `ins = button 'Add a rule at the end'` (hint "Add a rule here"); `hover(ins, 1.0)`; `click(ins)`; `visible(inspector)`; `nr = group 'New rule'`; `atSlot(nr, 2)`; `until(.bb__inspbar > b startsWith 'rule 2')`; `setAvoid(insp)`; `settle(0.3)` |
| 4 | `c6.4` Anonymizers — block. Who stays as everyone. | click textbox **Rule name**; `Control+a` (silent); type RULE2 (16 cps); click `.bb__inspbar > b` (hint false); `hold(0.3)`; `spotlight(whoSec, 2.0)`; `hold(2.0)`; `settle(0.3)` |
| 5 | `c6.5` If: Network zone, in zone, Anonymizers. | `scroll(body, '#bb-sec-if', 20)`; **Add condition** → group 'Add a condition' → **Network zone** → `visible(pop)` → **in zone** → 'Search Network zone' "anonym" → checkbox **Anonymizers** → `closePop`; `settle(0.3)` |
| 6 | `c6.6` Then: Deny. No factor is ever asked for. The card reads it back. | `scroll(body, '#bb-sec-then', 16)`; click radio **Deny**; `hold(0.6)`; `spotlight(block .bb__ifaction, 2.2)`; `hold(2.2)`; **Close the panel** (hint false); `gone(inspector)`; `setAvoid(null)`; `settle(0.3)` |
| 7 | `c6.7` Order matters. The strictest check goes first, so move the block rule up. | `hover(block, 0.8, ox .6, oy .3)`; click **Move up**; `atSlot(block, 1)`; `atSlot(fin, 2)`; `hold(0.8)`; `settle(0.3)` |
| 8 | `c6.8` Anonymizers are refused here. Everything else falls through to Finance, then to the default. | `spotlight(block, 1.4, pad 8, cam false)`; `hold(1.6)`; `spotlight(fin, 1.4, pad 8, cam false)`; `hold(1.6)`; **wheel the chain up** (`chainTo(fallback)`: two expanded rules push the default below the stage's fold, so its box cut to the stage is empty — the wheel brings it clear of the dock, 0.9 s); `spotlight(fallback, 1.8, pad 8, cam false)`; `hold(1.8)`; wheel back to the top (0.9 s); `settle(0.3)` — top to bottom, camera still, the chain scrolls under it |
| 9 | `c6.9` Switch a rule off without deleting it, and back on. | `hover(block, 0.6)`; click switch `/is on$/`; `hold(1.0)`; click switch `/is off$/`; `settle(0.3)` |
| 10 | `c6.10` Every edit has a shortcut. Alt and an arrow moves a rule; Control Z brings it back. | click `fin` title button (selects; the panel opens on Finance); `visible(insp)`; `setAvoid(insp)`; `hold(0.5)`; `press('Alt+ArrowUp')`; `atSlot(fin, 1)`; `hold(1.2)`; `press('Control+z')`; `atSlot(block, 1)`; `hold(0.6)`; **Close the panel** (hint false); `gone(inspector)`; `setAvoid(null)`; `settle(0.3)` |
| 11 | `c6.11` Collapse the cards for the order alone; expand them for the detail. | **Collapse cards**; `hold(1.4)`; **Expand cards**; `until(Expand cards checked)`; `settle(0.3)` |
| 12 | `c6.12` Scroll the chain; zoom in, out, and reset. | ctrl-wheel −100 at the top of the first card (0.9 s) → zoom ≠ 100 %; `hold(0.4)`; `y0 = settledY()` (wheel events land rAF-aligned in real time, so y is read once it stands still); `chainWheelTo(y0 − 260)` over the stage background → `worldY < y0 − 20`; `hold(0.4)`; `chainWheelTo(y0)` → `worldY ≥ y0 − 2`; `hold(0.4)`; **Zoom in**; `hold(0.4)`; **Zoom out**; `hold(0.4)`; **Reset zoom** → 100 %; `settle(0.4)` |

Asserts: 2 `.bb__card:not(.is-terminal)`; titles in order `[RULE2, RULE]`; both switches
read `Rule N is on`; `block` has `.bb__ifchip` "Deny" and its journey contains "Refused";
**Review & Save** is in `.bbtop__acts`. Nothing on the board dims (only a catch-all
shadows what is below it).

## 07 save — `c7.1`–`c7.4`

| # | line | actions |
|---|---|---|
| 1 | `c7.1` Ready? Review and Save reads every rule back in plain English. | **Review & Save** → dialog *Review your policy* → `focus(dlg, 1.3)`; `settle(0.3)` |
| 2 | `c7.2` Rule one: Anonymizers, deny. Rule two: Finance off the office network, then a second factor. | `rules = .bdlg-rev__rules > li:not(.is-default)`; `spotlight(rules[0], 1.8, pad 8)`; `hold(2.0)`; `spotlight(rules[1], 2.2, pad 8)`; `hold(2.2)`; `settle(0.3)`; asserts: 2 rules; rule one names RULE2, "Deny", "Anonymizers", "Access is blocked"; rule two names RULE |
| 3 | `c7.3` Confirm, and the Workday policy is saved. | **Confirm & Save**; success sfx; toast; spotlight the status pill *Draft → Inactive* (2.4 s) and hold 2.5 s |
| 4 | `c7.4` Back on the list it waits, inactive until you switch it on. With its application, and its rules. | **Back to policies** → the new row; hover its name; spotlight it (hold); callout *Saved, switched off until you turn it on* |

Asserts: the row reads Inactive; guards Workday; no dialog left open.

## Line ids per take, in beat order

```
card    cs.1 cs.2 cs.3 cs.4 cs.5 cs.6 cs.7 cs.8
create  c1.1 c1.2 c1.3 c1.4 c1.5
start   c2.1 c2.2 c2.3 c2.4 c2.5
who     c3.1 c3.2 c3.3 c3.4 c3.5 c3.6
if      c4.1 c4.2 c4.3 c4.4 c4.5 c4.6 c4.7 c4.8 c4.9
then    c5.1 c5.2 c5.3 c5.4 c5.5 c5.6
canvas  c6.1 c6.2 c6.3 c6.4 c6.5 c6.6 c6.7 c6.8 c6.9 c6.10 c6.11 c6.12
save    c7.1 c7.2 c7.3 c7.4
slides  hk.1 (hook) · out.1 (outro)
```

Removed since the fifth cut: `hk.2`, `hk.3`, `c6.13`. New: `cs.8`, `c6.11`, `c6.12`
(the c6.x ids all carry new text; the c7.2 text is new; unchanged ids keep their voice).
