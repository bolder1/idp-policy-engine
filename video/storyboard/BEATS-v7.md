# Beats, seventh cut — restructured around the full demo arc

Supersedes BEATS-v6.md. The card-mode scene (`cs.1`–`cs.8`) is retired. The concept is taught
before any deep interaction — intro, the builder broken down (Bento) and assembled into the
product in 3D, a live tour, the policy concept — and the guided demo then builds one Workday
policy with three rules (one unconditional, one conditional with a group and AND/OR, one
absolute deny), reorders them on camera to prove priority, and saves.

Sources, in order of authority: `storyboard/lines.mjs` (every word; ids below are its ids);
the owner's storyboard preview (claude.ai artifact "Policy Engine Storyboard", 14 Sep 2026 —
the bento grid, concept stack, priority boards and bookends are specified there); the owner's
answers of 14 Sep 2026 (opening order, the 3D dock, priority = graphic then live, this file
written from sources); DESIGN-v6.md for every token (colour, type, radii, motion curves) —
nothing new is invented.

Every line id is in `lines.mjs`; `rec.say(id)` starts it, `rec.settle()` waits for it.
Conventions carried forward unchanged from BEATS-v6: the explainer insets (`rec.explain`, the
shelf, `cam: false` on spotlights under a shelf), `chainWheelTo` / `chainTo`, `closePop`,
`scroll()` before clicking a scrolled control, the `rec.press` rules (keycaps only for real
shortcuts, `show: false` for Control+A), `atSlot` after every move, `gone` / `visible`,
`setAvoid`, `noTour`, `density`. Escape is never pressed.

---

## Film order

```
 #  item                         kind    lines          out → next           est. s
 0  hook       Intro             slide   hk.1           cut                    9.5
 1  bento      Builder, by part  slide   bt.1–bt.5      fade (0.8) → take     32.0   (24.5 spoken + 7.5 shrink/dock/3D)
 2  showcase   Live tour         take    sh.1–sh.3      fade (0.8) → slide    13.0
 3  concept    What a policy is  slide   pc.1–pc.3      cut                   12.0
    banner 01  The board                                                      2.3
 4  board      Board tour        take    db.1–db.3      cut                   17.0
    banner 02  A new policy                                                   2.3
 5  create     A new policy      take    cr.1–cr.3      cut                   22.0
    banner 03  Rule one — simple                                              2.3
 6  rule1      Rule one          take    r1.1–r1.4      cut                   26.0
    banner 04  Rule two — complete                                            2.3
 7  rule2      Rule two + three  take    r2.1–r2.9      cut                   95.0
    banner 05  Priority                                                       2.3
 8  priority   Order, before     slide   pr.1–pr.2      cut                   13.0
 9  order      Order, live       take    pr.3–pr.4      cut                   24.0
    banner 06  Save it                                                        2.3
10  save       Review & Save     take    rv.1–rv.3      fade (0.8) → slide    30.0
11  outro      Outro             slide   out.1          held last frame        7.0
                                                                   budget ≈ 5 min 13 s
```

Estimates use 13.5 spoken chars/s (NeerjaExpressive +10 %, measured on the sixth cut) plus
the actions each beat needs. Pacing is whatever the synthesised voice settles to; the render
reports the real length and it is checked against this block (±15 %).

**Capture order is not film order.** One browser session, in this order:
`board → create → rule1 → rule2 → order → save → showcase → parts`. The showcase is filmed after the demo
because it opens on the finished, saved Workday board — and its first frame is the picture
the Bento cells dock onto, so the 3D builder and the live take are the same pixels.

---

## 00 · Intro — slide `hook` (`hk.1`)

The sixth cut's intro (`compose/slides-v4.js`, DESIGN-v6 §2) with one change: the sub-claim
under "Policy Engine" reads **"Who gets in, from where, and what they have to prove."** so the
screen says what the voice says. Lockup: the real Xecurify lockup (`/app/xecurify-logo.png`)
— the storyboard preview's rounded-square mark is a placeholder. `lead 1.2`, exits keyed to the
line's end, bare ground, **cut**.

Asserts (edl): the item exists, `hk.1` cue present, `dur ≥ lead + spoken + 1.4`.

## 01 · The builder, part by part — slide `bento` (`bt.1`–`bt.5`, then the dock)

Replaces the text bento, which the owner rejected on 14 Sep 2026 ("segregate the parts of the builder
as specific boxes … Who, where hovering 2–3 groups get selected, then those go to the next card, the
If part with attributes, then Then, the shortcuts, the board and Review"). Owner's choices of 15 Sep
2026: layout **stage and filmstrip** (mock `out/cut7-preview/bento-v3.png`), **real product footage**
inside every card, and the **Shortcuts card plays with the board line** (no new words).

### What is on screen

- **Filmstrip** — six cards in order **01 Who · 02 If · 03 Then · 04 Shortcuts · 05 Board · 06 Review**,
  256 wide, 38 px gaps, x 97–1823, y 726–908. One anatomy for all: step chip, part name, one short line,
  framed picture (radius 8, 1 px `#e4e8ec`, 8 px padding); card `#fff`, radius 12, 1 px `#e4e8ec`,
  shadow `0 8px 24px rgba(33,37,41,.12)`. Resting .45; active full opacity with the frame's one orange
  (2 px `#eb5424` outline); finished full opacity with a small positive check.
- **Stage** — 1138×574 at x 391, y 92; 1 px `#d3dae1` edge, shadow `0 16px 48px rgba(33,37,41,.22)`;
  header = step chip + part name + one line, and once Who is done a **From Who** chip row
  (Finance · Executives · Priya Sharma); body = the active part's footage cropped to its rect, fitted,
  never above 2× app scale, letterboxed on the ground colour.
- **Footage** — take `parts` (unspoken, filmed last, never sequenced): five segments on a throwaway
  policy, each marked `part` start/end with a fixed crop rect — **who** (hover down the groups, tick
  Finance and Executives, People → Priya Sharma), **if** (attribute list → Network zone → not in zone →
  Office Network; group: Device profile does not match Corporate managed OR Network zone in zone
  Anonymizers), **then** (Allow → second factor → Specific methods → miniOrange Push, TOTP), **board**
  (collapsed chain; Alt + ↓ moves a rule; Ctrl + Z puts it back), **review** (Review your policy opens).
  The cursor and click ripples are drawn by the compositor from the take's cursor data.

### Timeline

| cue | stage | strip |
|---|---|---|
| slide start | empty | cards rise in to .45 (12 px, stagger .06, OUT-B .5 s) |
| `bt.1` | rises in with the finished Finance rule card (showcase frame 0), thin brackets Who · If · Then on its parts | 01–03 to full |
| `bt.2` | crossfades to **who** footage; before `bt.3` the three chips lift off and fly into the header's From Who row (DEC .6 s) | 01 active, then checked |
| `bt.3` | **if** footage | 02 active |
| `bt.4` | **then** footage | 03 active |
| `bt.5` | **board** footage; at `Review` (word time) crossfades to **review** footage | 04 + 05 active together — the Shortcuts keycaps press on each key event in the board footage; then 06 active |
| `bt.5` end + 0.4 | shrinks into strip slot 06 and fades | — |

A segment plays at natural speed from its cue, faster (≤ 2×) if it would outlast its window, else holds
its last frame.

### The dock (unchanged in kind)

The six strip cards fly onto the builder in 3D exactly as before (the plane, flush landing, drift,
rotate flat, chrome, 0.8 s fade into the showcase take), now with targets **who, if, then, shortcuts
(the board's View toolbar), board, review**, and each label placed on its outline's clearest outside
edge so it never covers product text (owner's choice, 14 Sep 2026).

Asserts (take `parts`): five start and five end marks in order, every rect non-empty and inside the
viewport; after Alt + ↓ the rule is one slot lower, after Ctrl + Z it is back. (Take `showcase`): the
dock event carries seven rects — card, who, if, then, shortcuts, board, review.

---

## 02 · Live tour — take `showcase` (`sh.1`–`sh.3`), filmed last

Prep (dry): from the end of `save` — the Workday board, status Inactive. Click bare stage to
clear the selection and close the panel; `density 'Expand cards'`; Reset zoom; wheel the chain
until the Finance card clears the dock; `hold(0.9)`; `rec.cut()`; then measure and emit
`rec.mark('dock', { rects: { card, who, if, then, shortcuts, board, review } })` (shortcuts = the board's View toolbar) at frame 0, and `hold(1.2)`
before `sh.1` so the seam finishes and the builder rests before the voice.

| line | actions |
|---|---|
| `sh.1` This is Policy Engine, inside your admin console. | `hold` on the board; the cursor rests off the cards. `settle(0.3)` |
| `sh.2` Every application, and every policy protecting it, in one place. | click **Back to policies** (saved — no leave guard); `visible(tbody tr)`; `spotlight(row 'Workday — Finance adaptive access', { seconds: 2.6, pad: 6 })` — the storyboard's focused row; `hold(2.6)`; `settle(0.3)` |
| `sh.3` Let's open one. | hover the **Trading Platform — full posture ladder** row's name cell (0.8 s); click it; `visible` the board; `noTour`; `hold(0.8)` |

`out: 'fade'` (0.8 s) into the concept slide.

Asserts: after `sh.2` the list holds the Workday row reading **Inactive** with application
**Workday**; at the end the board bar names **Trading Platform — full posture ladder**; no
dialog open.

## 03 · What a policy is — slide `concept` (`pc.1`–`pc.3`)

Storyboard preview, verbatim: a centred column, gap 22.

- App chip: surface, 1 px `#e4e8ec`, radius 12, pad 16/26, shadow `0 10px 28px rgba(22,32,44,.08)`,
  22/600 ink; a 26 px `#eb5424` square radius 7, then **Policy · Workday**.
- Three rule bars, 520×52, radius 9, surface, 1 px `#e4e8ec`, 16/500 ink-2, gap 10; a 22 px
  number circle (`#eef1f4`, 12/700 ink-3): **1 Off the office network** (border `#f9cabb`),
  **2 Known risk network — block**, **3 Default — everyone else**.
- Parts pills on bar 1: **Who · If · Then** (12/600, pad 3/9, `#fff`, 1 px `#d3dae1`), right-aligned.

| line | state | motion |
|---|---|---|
| `pc.1` | the app chip | opacity 0→1, rise 10 px, 0.5 s OUT-B at the cue |
| `pc.2` | + the three bars | each opacity 0→1, rise 8 px, 0.45 s OUT-B, stagger 0.12 s |
| `pc.3` | bar 1 fills `#fdeee9`, its parts pills appear | fill 0.4 s INOUT-B; pills fade 0.3 s, stagger 0.1 s |

Bare ground after `pc.3` ends + 0.6 s, **cut** to banner 01.

---

## 04.1 · The board — take `board` (`db.1`–`db.3`), filmed first

Prep (dry, then `rec.cut()` on a still): Policies list → click **Trading Platform — full posture
ladder** → board → `noTour` → let the toast/spring settle. The policy is a seeded fixture
(`src/brand/data.ts` `sc8-trading-posture`, five rules, severity ladder); nothing in this take
edits it.

| line | actions |
|---|---|
| `db.1` Here's a board with more than one rule already. | click `density 'Collapse cards'` so all five rules and the default fit; `hold(1.2)`; `settle(0.3)` |
| `db.2` Top to bottom. Each sign-in is checked against rule one first. | `spotlight(rule 1 card, { seconds: 2.6, pad: 8 })`; `hold(2.6)`; `settle(0.3)` |
| `db.3` If it matches, that rule decides — allow, deny, or a factor. If not, it's checked against the next rule. | `explain('first-match')`; `spotlight(rule 1, { seconds: 2.0, pad: 8, cam: false })`; `hold(wordTime('db.3', /^not$/))`; `spotlight(rule 2, { seconds: 2.0, pad: 8, cam: false })`; `hold(2.0)`; `settle(0.3)` |

Asserts: bar names **Trading Platform — full posture ladder**; five non-terminal cards in the
fixture's order, rule 1 titled **Tampered device — nothing else matters** with a **Deny**
chip; after the take the policy is unchanged (no Discard / unsaved marker in the bar).

## 04.2 · A new policy — take `create` (`cr.1`–`cr.3`)

| line | actions |
|---|---|
| `cr.1` Let's build one from scratch. | click **Back to policies**; assert **no** `dialog 'Leave without publishing?'` within 1 s (the tour changed nothing); `visible` the list; hover **New policy** (0.8 s); `settle(0.3)` |
| `cr.2` A policy needs a name and the application it protects. We'll use Workday as our example. | click **New policy** → `dialog 'Name your policy'` → `focus(dlg, 1.4)` → click `Policy name *` → type **Workday — Finance adaptive access** (cps 17) → combobox **Applications this policy protects** → search "work" → option **Workday SAML** → close by its own trigger; `settle(0.3)` |
| `cr.3` Create it as a draft — nothing changes until you activate it. | click **Create policy**; `focus(null)`; `visible` "How would you like to start?"; click **Start from scratch**; `visible` Inspector; `gone` the created toast; `density 'Expand cards'`; `noTour`; `spotlight(.bbtop .bx-status, { label: 'Draft', seconds: 2.2 })`; `hold(2.2)`; `settle(0.3)` |

Asserts: board bar names **Workday — Finance adaptive access**; status pill **Draft**; one
non-terminal card **New rule**; Inspector open on **RULE 1**.

## 04.3 · Rule one — simple — take `rule1` (`r1.1`–`r1.4`)

`RULE1 = 'All sign-ins — second factor'` (the storyboard's priority chip reads "All sign-ins").

| line | actions |
|---|---|
| `r1.1` Rule one is simple: everyone, every time, a second factor. No conditions needed. | click textbox **Rule name**; `press('Control+a', { show: false })`; type `RULE1` (cps 16); click `.bb__inspbar > b` (hint false); `settle(0.3)` |
| `r1.2` We leave Who and If empty — that means everyone, always. | `spotlight(region 'Who', { seconds: 2.2 })`; `hold(2.2)`; `spotlight(region 'If', { seconds: 2.2 })`; `hold(2.2)`; `settle(0.3)` |
| `r1.3` Then: allow, but require a second factor — a push notification, or an authenticator app. | `explain('then', { seconds: 3.0 })`; `hold(3.0)`; `scroll` to `#bb-sec-then`; click radio `/^Allow\b/` if not checked; **Add second factor** if absent; radio **Specific methods**; combobox **Methods accepted** → **miniOrange Push**, **TOTP Authenticator**; click the Then heading (hint false); `settle(0.3)` |
| `r1.4` One rule, no conditions, still exact. | `spotlight(region 'Then' in the panel, { seconds: 2.6 })`; `hold(2.6)`; `settle(0.3)` — a rule with no who and no conditions draws only "Nothing set yet" on its card in this build, so the panel's Then (Allow, the second factor, the two methods) is what shows it is exact |

Asserts: card title `RULE1`; the card has **no** `.bb__ifrow.is-cond`; the rule's data (read from
the store, since the card shows no Then for an unconditional rule) is decision **2fa**, second
factor **specific**, methods **miniOrange Push** and **TOTP Authenticator**.

## 04.4 · Rule two — complete, and rule three — take `rule2` (`r2.1`–`r2.9`)

`RULE2 = 'Finance — off the office network'`, `RULE3 = 'Known risk network — block'`.

| line | actions |
|---|---|
| `r2.1` Rule two is more complete — it uses every part of the builder. | click **Add a rule at the end** (connector below rule 1); `atSlot(New rule, 2)`; Inspector on **RULE 2**; Rule name ← `RULE2`; `settle(0.3)` |
| `r2.2` Who: specific groups, plus one named person alongside them. | `explain('who', { seconds: 2.8 })`; `hold(2.8)`; **Add people** → checkboxes **Finance**, **Executives** → radio **People** → **Priya Sharma** → **Save 3 selected**; `gone` the dialog; `settle(0.3)` |
| `r2.3` If: start with one condition — flag any sign-in from outside the usual network. | `explain('if', { seconds: 2.8 })`; `hold(2.8)`; `scroll` to `#bb-sec-if`; **Add condition** → **Network zone** → **not in zone** → search "office" → **Office Network** → `closePop`; `settle(0.3)` |
| `r2.4` Now a condition group of its own: a device that isn't company-managed... | `focus(ifSec, 1.3)`; **Add** → **Add condition group** → pending group → **Choose a condition** → **Device profile** → **does not match** → "corporate" → **Corporate managed** → `closePop`; `settle(0.2)` |
| `r2.5` ...or a network known for anonymizing traffic. Inside the group, either is enough — that's OR. | group **Add condition** → **Network zone** → **in zone** → "anonym" → **Anonymizers** → `closePop`; group joiner select → `or`; `spotlight(the group, { seconds: 2.4, pad: 6 })`; `hold(2.4)`; `settle(0.3)` |
| `r2.6` The group combines with the first condition using AND — both must hold. | `spotlight(the run joiner between Office Network and the group, { seconds: 2.4, pad: 8 })`; `hold(2.4)`; `focus(null)`; `settle(0.3)` |
| `r2.7` Then: allow, but only with a second factor, and remember a verified device for a set number of days. | `scroll` Then; Allow; second factor → **Specific methods** → **miniOrange Push**, **TOTP Authenticator**; **Remember this device** on; **Days to remember** ← 14; click `.bb__second__head` (hint false); `settle(0.3)` |
| `r2.8` And a third rule, on its own: deny outright for a known risk network. No conditions to weigh, no factor to offer. | **Add a rule at the end**; `atSlot(New rule, 3)`; Rule name ← `RULE3` (cps 22); If: **Add condition** → **Network zone** → **in zone** → "anonym" → **Anonymizers** → `closePop`; Then: radio `/^Deny\b/`; `settle(0.3)` |
| `r2.9` Three rules — one plain, one conditional, one absolute. | **Close the panel**; `gone` Inspector; `density 'Collapse cards'`; three chained spotlights top→bottom on the three cards (1.2 s each, pad 8); `settle(0.3)` |

Rule three carries one condition — **Network zone · in zone · Anonymizers**, the fixture's
*blocked* network zone. "No conditions to weigh" in `r2.8` means nothing to combine: a deny
with no condition at all would refuse every sign-in once it is moved to the top.

Asserts: three non-terminal cards titled `[RULE1, RULE2, RULE3]` top to bottom; `RULE2` has 1
`.bb__ifplain` + 1 `.bb__ifgroup`, 2 group rows, group joiner **or**, then chip **Second
factor**, journey **Remembered 14 days**; `RULE3` has 1 condition row, a **Deny** chip,
journey **Refused**; `RULE1` still has no condition rows; cards collapsed; Inspector closed.

## 04.5 · Priority — slide `priority` (`pr.1`–`pr.2`), then take `order` (`pr.3`–`pr.4`)

### The graphic (storyboard preview; labels matched to the live rules)

Two boards 640 wide side by side, gap 56, a 38 px arrow between them labelled **reorder**
(13/600 ink-3). Board label 14/700/+.06em uppercase ink-3: **Order — before**, **Order — after**.
Chip 78 tall, radius 12, surface, 1.5 px `#e4e8ec`, pad 0/20, shadow `0 2px 8px rgba(33,37,41,.05)`;
28 px number circle; name 16.5/600 ink; description 13.5/500 ink-3; status pill on the right.

| before (lit) | after (at .3 opacity) |
|---|---|
| 1 **All sign-ins — second factor** · No conditions · second factor required | 1 **Known risk network — block** · Anonymizers · deny |
| 2 **Finance — off the office network** · Device & network conditions | 2 **Finance — off the office network** · Device & network conditions |
| 3 **Known risk network — block** · Anonymizers · deny | 3 **All sign-ins — second factor** · No conditions · second factor required |

| line | state | motion |
|---|---|---|
| `pr.1` Three rules. Order decides which one actually applies. | boards enter: before opacity 0→1, after 0→.3, rise 12 px, stagger 0.15 s | OUT-B 0.5 s |
| `pr.2` Right now, the broadest rule runs first — it catches every sign-in, including the one that should have been blocked. | at `wordTime(/^catches$/)` − 0.26 s: before-chip 1 **checks** (border `#eb5424`, 3 px `#fdeee9` ring, 0.35 s); +0.52 s it **hits** (border `#d3dae1`, status pill **Allowed** in positive tints scales .9→1 over 0.3 s) and chips 2–3 fall to .4; at `wordTime(/^blocked$/)` chip 3's description tints negative fg for the rest of the line | OUT-P |

**Cut** to the `order` take (the board as `rule2` left it: collapsed, three rules, panel closed).

### The live reorder — take `order`

| line | actions |
|---|---|
| `pr.3` Move the strictest rule to the top, and the broadest to the bottom, so specific checks run before the default. | hover `RULE3` (0.8 s); click its **Move up**; `atSlot(RULE3, 2)`; `hold(0.5)`; click **Move up** again; `atSlot(RULE3, 1)`; `hold(0.5)`; click `RULE1`'s title (selects it); `press('Alt+ArrowDown')` (keycaps Alt + ↓); `atSlot(RULE1, 3)`; **Close the panel** if it opened; `settle(0.3)` |
| `pr.4` Same three rules, reordered. Now a risky sign-in is caught immediately, instead of slipping through as the default. | at `wordTime(/^Now$/)`: `spotlight(RULE3, { seconds: 2.4, pad: 8 })`; `hold(2.4)`; at `wordTime(/^default$/)`: `spotlight(RULE1, { seconds: 2.0, pad: 8 })`; `hold(2.0)`; `settle(0.4)` |

**Asserts — the one that must not ship wrong.** After `pr.3` and again at the end of the take:
the non-terminal card titles, read top to bottom from
`.bb__card:not(.is-terminal) .bb__titlebtn`, equal exactly
**`['Known risk network — block', 'Finance — off the office network', 'All sign-ins — second factor']`**
— i.e. `[deny, rule2, rule1]`; each card's reorder handle names its slot
(`Reorder rule 1` on `RULE3`, `2` on `RULE2`, `3` on `RULE1`); `RULE3` still carries **Deny**;
`RULE1` no longer carries the "Shadows N rules below it" warning; three cards, no more.
Each move is asserted by slot before the next action (a move that changes nothing writes no
history, and a later undo would then reverse the wrong edit).

## 04.6 · Save it — take `save` (`rv.1`–`rv.3`)

| line | actions |
|---|---|
| `rv.1` Before saving, Review and Save reads every rule back in plain English. | click **Review & Save** (`.bbtop__acts`); `visible(dialog 'Review your policy')`; `focus(dlg, 1.3)`; `settle(0.3)` |
| `rv.2` Rule one blocks the known risk outright. Rule two adds … Rule three is the default — everyone else still needs a second factor. | `rules = dlg '.bdlg-rev__rules > li:not(.is-default)'`; `spotlight(rules[0], 2.2)`; `hold(wordTime(/^two$/))`; `spotlight(rules[1], 2.6)`; `hold(wordTime(/^three$/))`; `spotlight(rules[2], 2.6)`; `hold(2.6)`; `settle(0.3)` |
| `rv.3` Confirm, and it's saved — inactive until you switch it on. | click **Confirm & Save**; `sfx('success')`; `gone` the dialog; `focus(null)`; `visible` the toast; `hold(1.0)`; `spotlight(.bbtop .bx-status, { label: 'Draft → Inactive', seconds: 2.4 })`; `hold(2.5)`; `settle(0.4)` |

`out: 'fade'` (0.8 s) into the outro.

Asserts: the review lists exactly three non-default rules, `rules[0]` contains `RULE3` and
**Deny**, `rules[1]` contains `RULE2`, `rules[2]` contains `RULE1`; after confirming, the status
pill reads **Inactive**.

## 05 · Outro — slide `outro` (`out.1`)

The sixth cut's outro unchanged (DESIGN-v6 §3): lockup, "Policy Engine", "Access policy, in
plain English.", idp.xecurify.com; held last frame.

---

## Cross-cutting

- **Captions longer than one row.** `hk.1`, `bt.5`, `db.3`, `r2.8`, `pr.2`, `pr.3`, `pr.4`, `rv.2`
  run past ~95 characters. The words are not changed: the caption band pages such a line at its
  sentence (or em-dash) boundaries — each page shows while its words are spoken, words lighting
  as before — so the band never grows past one row.
- **Explainer insets** (existing modules, placement only): `first-match` on `db.3`, `then` on
  `r1.3`, `who` on `r2.2`, `if` on `r2.3`. `finance-workday` is not used this cut.
- **Progress rail.** It measures the guided demo only: off through the cold open, from banner 01.
- **Bento sound.** A pop for each of the six cells as it lands, 0.18 s apart.
- **Seams.** New: a slide may end `out: 'fade'` into a take (the bento → showcase seam); the take
  starts `tin` = the fade, the slide's picture dissolving over the take's first frame.
- **Removed:** the card scene and its take, `cardLight` / `cardAnno` / `truthStep` / `cardParts`
  call sites, the template chapter (`start`), the old `who` / `if` / `then` / `canvas` takes, the
  zoom / scroll / keyboard-sheet / leave-guard / duplicate beats. The compositor keeps its
  card-mode code dormant (no take uses it).

## Calls made in this file that the owner should confirm

1. The standalone deny rule has **one** condition (Network zone in zone Anonymizers); a rule with
   none would block everyone after the reorder. Its name is **Known risk network — block**.
2. Rule one is named **All sign-ins — second factor**; rule two keeps **Finance — off the office network**.
3. The priority graphic's chip texts match those live names, and rule three's description reads
   **Anonymizers · deny** instead of the preview's "No conditions · deny".
4. The intro's sub-claim follows the new `hk.1`: **Who gets in, from where, and what they have to prove.**
5. The showcase opens on the saved Workday board (a preview of what the demo then builds), and the
   board tour uses the seeded **Trading Platform — full posture ladder** policy.
6. Product gap, not fixable in the film: a rule with no who and no conditions shows only "Nothing set
   yet" on its card, so `r1.4` spotlights the panel's Then section instead of the card.
7. Before the reorder, rule one's card reads **Check** and rules two and three read **Needs setup**
   (rule one catches everything above them); all read **Ready** after it. This is the product's own
   warning and it supports the priority story.
