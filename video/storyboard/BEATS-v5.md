# Beats, fifth cut — what each take does on the CURRENT build

The takes in `takes-v2.mjs` were written against the old board (commit bf907a1). The
build now filmed is 5221ea1 plus the run-build worktree's changes: a locked vertical
board (no sideways pan, no *Fit the chain*; dock = Collapse cards / Expand cards,
Undo, Redo, Zoom out, zoom %, Zoom in, Reset zoom), a Then panel that is outcome-first
(Allow / Deny cards; First factor as an open list — Password, Any enabled method, A
specific method; a Second factor block "Prove it with" — Any enabled method, Specific
methods, User preference — with *Remove the second factor*, Remember this device, Allow
user opt-out), Who's *Add people* button, a flat attribute list under *Add condition*,
and a six-step **board tour that opens by itself** the first time the board is shown
(with Skip / Next and a "Demo · 1:16" player). The tour must never appear in a filmed
frame — suppress it before boot (its stored flag) or skip it during a dry prep.

Every line id below is in `lines.mjs`; `rec.say(id)` starts it, `rec.settle()` waits
for it. Names are said where they appear on screen, so the takes must show exactly
those names: **Workday**, **Finance**, **Executives**, **Priya Sharma**, **Office
Network**, **Corporate managed**, **Anonymizers**, **Sanctioned countries**,
**miniOrange Push**, **TOTP Authenticator**.

## Conventions (unchanged)

- `rec.say(id)` then act, then `await rec.settle(x)`.
- `rec.focus(target, {zoom})` for dialogs and the card; `rec.spotlight(target, {seconds,
  label?})` for the thing being named — **spotlight returns at once: hold before anything
  navigates away**.
- Close condition popovers with `closePop` (click `#bb-sec-if`), never Escape.
- `rec.press('Control+a', { show: false })` before retyping a field; chords the viewer
  should see (`Alt+ArrowDown`, `Control+z`, `Control+Backslash`, `?`, `Delete`) use
  `rec.press(combo)` so the keycaps draw.
- Every take ends with `rec.until(...)` asserts of its end state.

## Take order and state

`create → start → who → if → then → canvas → save` share one session (the Workday
policy created in `create` is saved in `save`); `card` runs last in a throw-away policy
and is shown second in the film.

## card (shown second) — the rule, taken apart on the card

Prep dry: New policy "Finance — adaptive access (walkthrough)", app **Workday**,
Create, Start from scratch, wait for the Inspector, **Expand cards** (the density radio
that unfolds the card body — was "Detailed"), make sure the tour is not showing, hold
0.9 s, `rec.track('.bb__card:not(.is-terminal)', '.bb__stage')`, `rec.cut()`.

| Beat | Panel action (unseen) | On the card |
|---|---|---|
| hold 0.6 | — | New rule · Nothing set yet |
| `cs.1` | Rule name: Ctrl+A, type **Finance — off the office network** | title types in |
| `cs.2` | `cardFreeze(true)`; **Add people** → dialog *Who is this rule about?* (or its new title): tick **Finance**, **Executives**; People tab; tick **Priya Sharma**; Save; hold 1.7 (hurried); `cardFreeze(false)` | who row: F E P · Finance |
| `cs.3` | `cardFreeze(true)`; Add condition → **Network zone** → **not in zone** → search "office" → **Office Network** → closePop; hold 1.5; `cardFreeze(false)` | if row |
| `cs.4` | `cardFreeze(true)`; Add → **Add condition group** (or *Add group*); in the group Add condition → **Device profile** → **does not match** → **Corporate managed** → closePop; hold 1.5; `cardFreeze(false)`; hold 0.9; `cardFreeze(true)`; Add condition → **Network zone** → **in zone** → "anonym" → **Anonymizers** → closePop; hold 1.5; `cardFreeze(false)`; hold 0.7; group joiner select → **or**; settle 0.5 | Group B with OR, joined by AND |
| `cs.5` | `rec.cardParts({ first: rectOf(card '.bb__ifrow.is-cond' first), group: rectOf(card '.bb__ifgroup'), block: rectOf(card '.bb__if') })`; `rec.cardAnno(true)`; hold ≈ the line + 1.5 s (settle(1.6)); `rec.cardAnno(false)`; hold 0.6 | brackets + truth table beside the card |
| `cs.6` | Outcome **Deny** (hold 1.2) → **Allow** (hold 0.9); if the second factor block is not present click **Add second factor**; Prove it with → **Specific methods**; tick **miniOrange Push**, **TOTP Authenticator**; Remember this device on; days 14 (Ctrl+A, type); click the Then heading to drop focus; `rec.pace = 0.5` for the picker work, back to 1 before settle | then row: Deny · Refused → Second factor · Password → miniOrange Push · or 1 other → Remembered 14 days → Signed in |
| `cs.7` | `rec.cardMode(false)`; hold 1.2; **Reset zoom** (hint false) if it exists; settle 0.6; hold 0.4 | the whole board |

Asserts: title = rule name; 1 `.bb__ifplain` + 1 `.bb__ifgroup`; 2 `.bb__ifgroup
.bb__ifrow.is-cond`; group joiner reads "or"; then chip reads "Second factor".

## 01 create — `c1.1`–`c1.5`

List (hover two rows; rest the cursor on **New policy**) → New policy dialog (focus
1.4) → *Policy name*: type **Workday — Finance adaptive access** → *Applications this
policy protects*: type "work", pick **Workday SAML**, close the picker by its trigger →
**Create policy** → focus back → wait for *How would you like to start?* Hide the
persona pill / rebrand switch in the top bar if they render (recorder `css`).

## 02 start — `c2.1`–`c2.5`

Hover **Use a template** and **Start from scratch** → Use a template → gallery sheet;
spotlight the *Whose templates* tabs (3.2 s, hold) → filter **Device-based**; preview
**Zero-Trust baseline**; focus + spotlight its rule stack (hold) → hover *Use this
template*, **Close**, **Close the gallery** → **Start from scratch** → Inspector visible;
the tour must not appear; **Expand cards**; **Reset zoom** if the chain sits off-centre
(there is no Fit any more).

## 03 who — `c3.1`–`c3.6`

Spotlight the panel (*The panel*, hold) → Rule name: Ctrl+A, type **Finance — off the
office network**; callout on the card title *Renamed as you type* → spotlight Who →
**Add people** → dialog (focus 1.35): tick **Finance**, **Executives** → People tab →
type "priya" → tick **Priya Sharma** → back to Groups → **Save 3 selected** → hover the
summary faces → spotlight the card (hold).

## 04 if — `c4.1`–`c4.9`

Spotlight If's empty state (hold) → Add condition → **Network zone** → **not in zone** →
"office" → **Office Network** → closePop → spotlight the card's if row (hold) → focus If
→ Add → **Add condition group** → in the group: **Device profile · does not match ·
Corporate managed** → second: **Network zone · in zone · Anonymizers**; joiner **OR**;
spotlight the group (hold) → spotlight the top-level AND joiner (hold); focus back;
callout on the card's group tag *The card reads it back* → focus If → re-open the
group's zone value, add **Sanctioned countries**, closePop → hover that row, **Remove
Network zone** → **Ungroup** → focus back → spotlight the card's if block (hold).

## 05 then — `c5.1`–`c5.6` (rebuilt panel)

Scroll to Then; spotlight the Outcome cards (hold); hover **Deny**, then click **Allow**
(`c5.1`) → `c5.2`: make sure a second factor exists (**Add second factor** if the block
is missing) and spotlight the Second factor block (hold) → `c5.3`: Prove it with →
**Specific methods**; if a "No method selected" alert appears, spotlight it (hold) →
`c5.4`: tick **miniOrange Push**, **TOTP Authenticator** (open list rows or the picker,
whichever the build has) → `c5.5`: **Remember this device** on; days **14**; drop focus
→ `c5.6`: focus the card (1.55); spotlight the journey line (hold); focus back.

## 06 canvas → "the board" — `c6.1`–`c6.13` (locked vertical board)

`c6.1` hold on the board → `c6.2` **Close the panel** → `c6.3`: wheel over the stage to
scroll down and back (vertical only; no drag), **Zoom in**, **Zoom out**, **Reset zoom**
→ `c6.4`: **Collapse cards**, hold, **Expand cards** → `c6.5`: spotlight the start pill
(*A sign-in arrives at Workday*, hold), then the default card (hold) → `c6.6`: hover the
connector's **+**, click; *New rule* lands last; close the panel → `c6.7`: hover *New
rule*, **Move up**; the Finance rule shadows → `c6.8`: **Duplicate rule**, **switch it
off** → `c6.9`: Undo, Redo; delete the copy → `c6.10`: select *New rule*; `Alt+ArrowDown`,
`Control+z` (keycaps) → `c6.11`: `Control+Backslash` twice; `?` opens the Keyboard sheet
(focus 1.35), close it (its Close button, not Escape) → `c6.12`: **Back to policies** →
*Leave without publishing?* (focus 1.4) → **Keep editing** → `c6.13`: select *New rule*,
`Delete`; assert one rule left.

## 07 save — `c7.1`–`c7.4`

**Review & Save** → dialog (focus 1.3) → spotlight the Finance rule's prose (hold) →
**Confirm & Save**; success sfx; toast; spotlight the status pill *Draft → Inactive*
(2.4 s) **and hold 2.5 s before leaving** → **Back to policies** → the new row; hover it;
spotlight its name (hold); callout on its status *Saved, switched off until you turn it
on*.
