# v4 — the next pass

Four instructions, and what the running build actually does about them:

> Reduce the amount of text · hide the rest in a tooltip · make it interactive
> and easy to use · fix the layout — the right side is not being used.

Section 1 is measurement, taken from the running prototype at three window
sizes so the argument is arithmetic rather than taste. Sections 2–6 were the
proposal.

> **Status: built, with two course corrections.** §7 records what shipped and
> where it departs from the plan below. The two departures are the left column
> (v1's flow, not a widened list) and the right column (removed and re-homed as
> summoned cards, not widened) — both on instruction.

---

## 1. What is actually there

Measured on `Zero-Trust Baseline` (5 rules), rule 1 selected, one condition.

### The right side, literally

| Window | Builder occupies | Dead to its right |
|---|---|---|
| 1920 × 1000 | 1560px | **296px** |
| 1512 × 900 | 1385px | 0 |

`shell.css:191` caps every page at `max-width: 1560px` and does not centre it.
That cap is right for the policies list — a table wider than 1560 is unreadable
— and wrong for a three-column workspace, which is the one screen in the
product that should take the whole window. `.bf` overrides `padding` and not
`max-width`, so the builder inherits a reading measure it never wanted. On a
1920 display the workspace pins left and 296px of window sits empty.

### The right side, as a column

`builder-v4.css:51` — `grid-template-columns: 236px minmax(0, 1fr) 268px`.
`builder-v4.css:147` — `.bf__sheet { max-width: 720px; margin: 0 auto }`.

| Window | Spine | Form column | Sheet | **Empty gutter** | Rail |
|---|---|---|---|---|---|
| 1920 | 236 | 1008 | 720 | **288 (19% of the work area)** | 268 |
| 1512 | 236 | 881 | 720 | 161 (12%) | 268 |
| 1280 | 236 | 649 | **634 — under its own target** | 15 | 268 |

So the middle column is centred inside space it refuses to use, and the rail
that answers *what does this rule do* gets 268px and never grows. Add the page
cap and a 1920 window is carrying **584px — 31% of it — that holds nothing**,
while the form scrolls 1,584px and the rail overflows.

### The rail is over capacity, not under-filled

At 1512 × 900 the rail's content is **793px in a 718px column**. It overflows
with five rules. It holds three things that do not fit together:

- the section outline — 190px, permanently, duplicating navigation
- a tab pair — 47px, forcing *Preview* and *Ready to publish* to take turns
- whichever panel won — 518px

The two panels are tabbed **because** the column is too narrow to hold both.
The context selects inside the preview render at 176px. Nothing here is
under-used; it is over-subscribed.

### The form is long because it is narrow

1,534px of sheet for a one-condition rule — **2.14 screens** at 900px tall,
2.66 at 800px.

| § | Section | Height | Controls | Words | Subtitle words |
|---|---|---|---|---|---|
| 1 | Name this rule | 156px | 1 | 15 | 11 |
| 2 | Who it applies to | 242px | 6 | 33 | 14 |
| 3 | When it applies | 247px | 6 | 68 | 24 |
| 4 | What happens | 304px | 3 | 70 | 21 |
| 5 | Checks & impact | 353px | 1 | 77 | 19 |

156px and one text input for a name that is **already** in the sticky header.
353px and one control for a section that is entirely read-out.

### The text

**89 of 263 words in the form are section subtitles** — 34% of the words,
carrying no data and no state. Four of the five are instructions the control
below them already implies. The fifth is not about the product at all:

> "Written back from the same condition array the editor above writes, so the
> sentence and the rule cannot disagree." — `rule-form.tsx:1011`

That is a note from the person who built it to the person reviewing it. Same
class of thing in the rail footnote (`rule-form.tsx:1190`, 24 words) and the
empty-condition note (`rule-form.tsx:375`).

### The interaction

`PolicyBuilderV4.tsx:306` renders a `GripVertical` on every rule in the spine.
There is no `draggable`, `onDragStart` or `onDrop` anywhere in v4 — v2, v3 and
v5 all have drag; the shipping candidate does not. The handle is a promise the
screen does not keep.

The top bar carries **11 controls** in one flat row: back, name, undo, redo,
⌘K, two pips, Test, Decision log, Apps, Save as template, Publish.

---

## 2. The diagnosis, in one sentence

v4 allocates space by document convention — a centred 720px reading measure
inside a capped page — when the thing on screen is a workspace; the dead
gutters, the 2.1-screen form, the strangled rail and the explanatory prose that
grew to fill the margins are all the same decision.

So this is not four fixes. It is one layout decision reversed, and the other
three complaints mostly dissolve.

---

## 3. The design — v4.1, the working surface

Six moves. v4 stays the shipping candidate; this is v4 with the measure
removed. No model change — the engine, the evaluation order, the condition
grammar and the diagnostics are untouched, per the rule that a visual pass does
not rewrite the engine.

### Move 1 — take the whole window

`.bf` opts out of the page cap (`max-width: none`), and the work grid becomes
fluid:

```
grid-template-columns: clamp(220px, 16vw, 280px)  minmax(0, 1fr)  clamp(320px, 24vw, 420px)
```

The sheet's `max-width: 720px` is deleted, not raised. Width comes back as
**columns inside the sheet**, not as gutters beside it.

### Move 2 — the form becomes a properties sheet, two columns

The pattern already exists in v4 — `.bf__prop` is a `116px / 1fr` label-control
grid — it is just confined to the factor block. Promote it: every section is a
label column and a control column, and sections stack in a two-up grid when the
middle column is wider than ~880px.

- **§1 Name disappears.** The name is already in the sticky header; make that
  input the editable one. −156px, −11 words, −1 duplicated control.
- **§2 Audience collapses to a field.** "6 groups · 1,240 people", opening the
  existing picker in a popover. −~160px.
- **§3 When it applies** keeps the full width. It is the rule.
- **§4 What happens** keeps the three decision cards; the factor properties
  below them sit in the label/control grid at half width.
- **§5 Checks & impact leaves the form** — see move 3.

Target: **≤ 820px of sheet for a one-condition rule** — no scroll at 900px tall,
one short scroll at 800.

### Move 3 — the right side becomes the answer column, and stops taking turns

Widened to `clamp(320px, 24vw, 420px)` and reorganised as one scroll with three
blocks, no tabs:

1. **Live answer** (sticky) — persona chips, the four context selects at full
   width, the verdict, the trace. Unchanged in substance; it just fits now.
2. **This rule** — audience / reach / falls-to, moved out of §5. This is the
   answer to "what does this rule do", which is the rail's whole job.
3. **Ready to publish** — a single status line (`4 of 5 clear`) that expands to
   the five rows on click. Collapsed by default, so it costs ~40px instead of
   competing for the column.

The section outline **moves out of the rail** into the spine (move 4), which is
what makes the arithmetic work: 190 + 47 = 237px recovered, ~80px added by
widening, and the overflow goes away.

### Move 4 — one navigation object, not two

The spine lists rules; when a rule is selected its five sections nest under it
as sub-items with the same scroll-spy and the same counts. Order on the left,
answer on the right, form in the middle — and nothing on the right that is
navigation.

### Move 5 — text, with a rule that decides each string

> **A string on screen states what a control does or what the data says.
> Anything explaining why the design is the way it is belongs in `docs/`.**

Applied:

| String | Verdict |
|---|---|
| §2–§4 subtitles (49 words) | → `Tip` on the heading |
| §1 subtitle (11 words) | deleted with the section |
| §5 subtitle — "written back from the same condition array…" | **deleted.** Build rationale, not product copy |
| Rail footnote — "heuristic, not the engine…" (24 words) | → `Tip` on the *Live preview* label. The caveat must stay reachable — it is the honest part — but it is not a caption |
| Empty-condition note (24 words) | → the empty state itself, shortened to one line |
| Decision-card captions, diagnostics, delta copy | **kept.** These are data and consequence, and `COMPONENTS.md` requires the delta |

Target: **263 → ≤ 120 words** visible in the form by default; **89 → 0** words of
section subtitle.

### Move 6 — make the affordances real

- **Drag to reorder** in the spine, lifting v5's handlers, keeping the keyboard
  ↑ ↓ — the grip stops lying.
- **A real `Tip` primitive in `kit.tsx`.** `InfoDot` (`kit.tsx:310`) already does
  the popover correctly — hover, focus, `role="tooltip"` — but it is a dot-only
  trigger. Generalise it to wrap any element, add `aria-describedby`, Escape to
  dismiss, and tap-to-open for touch. One primitive, used by every string
  demoted in move 5.
- **Inline rule rename** in the sticky header.
- **Top bar: 11 → 4.** Back, name, Test, Publish, and an Actions button. The ⌘K
  bar already exists and already holds the rest; the toolbar is duplicating it.
- **Motion where it carries meaning**, `useReducedMotion` respected as now:
  condition add/remove/reorder as layout transitions, the rail trace row → rule
  jump as a shared element, the readiness block expanding in place.

---

## 4. Sequence

Each step leaves the build runnable, and the numbers in §5 are re-measured after
each.

1. **Layout** — `shell.css` cap opt-out, fluid grid, sheet measure removed,
   rail widened, tabs removed. `builder-v4.css`, `shell.css`,
   `PolicyBuilderV4.tsx`. *This alone answers "the right side is not being
   used" and most of "fix the layout".*
2. **Composition** — §1 dissolved into the header, §2 collapsed to a field, §5
   moved to the rail, two-up section grid. `rule-form.tsx`,
   `PolicyBuilderV4.tsx`.
3. **Navigation** — outline merged into the spine; readiness collapsed.
   `PolicyBuilderV4.tsx`, `readiness.tsx`.
4. **Text** — `Tip` in `kit.tsx`, then every string in move 5 re-homed or
   deleted. `kit.tsx`, `kit.css`, `rule-form.tsx`.
5. **Interaction** — drag-reorder, inline rename, toolbar reduction, motion.
   `PolicyBuilderV4.tsx`, `builder-v4.css`.

v5 hosts the same `rule-form.tsx`, so steps 2 and 4 land in both. v5's own
layout will need a look after step 2 — it is a comparison exhibit, so it needs
to still render, not to stay beautiful.

---

## 5. What "done" means

Re-measurable in the browser, and worth a test that asserts the first three.

| | Now | Target |
|---|---|---|
| Dead space at 1920 | 584px (31%) | 0 |
| Sheet height, 1-condition rule | 1,534px | ≤ 820px |
| Rail overflow at 5 rules, 900px tall | yes (793 / 718) | no |
| Words visible in the form | 263 | ≤ 120 |
| Section-subtitle words | 89 | 0 |
| Drag handles that do not drag | 1 | 0 |
| Top-bar controls | 11 | 4 + Actions |
| Sheet width at 1280 | 634 (below target) | ≥ 640, and no fixed rail below 1120 |

---

## 6. Open, and worth deciding before step 2

- **Does §5 leaving the form lose anything?** The plain-English IF/THEN sentence
  is the only place the rule is readable as prose. Proposal: the sentence stays
  in the form as a one-line summary under the sticky header; the *numbers*
  (audience, reach, falls-to) go to the rail. Alternative is to move the whole
  block and accept that the sentence lives only in the overview and the review
  dialog.
- **How far does the toolbar reduction go?** Dropping Decision log and Save as
  template into ⌘K makes them keyboard-first. If they are things administrators
  reach for daily, they should stay visible and something else should go.
- **Below 1120px** the three columns cannot all survive. Proposal: rail becomes
  a right-edge drawer, spine becomes a numbered strip. Not built until the
  desktop case is right.
- **The 1560px page cap** is correct for the list screens. Opting the builder
  out is a per-screen exception, not a change to `shell.css`'s default — worth
  agreeing, because the same question will come back for every full-bleed screen
  after this one.

---

## 7. What shipped

Built as v4 itself rather than a seventh version. The engine, the evaluation
order, the condition grammar and the diagnostics are untouched.

### The two course corrections

| Plan said | Instruction | Built |
|---|---|---|
| Widen the order rail, merge the outline into it | *"the left side from v1"* | **v1's flow canvas** — `flow-rail.tsx`. Dot-grid stage, start node, connector with an insert `+` between every pair, decision-coloured tile, index that doubles as the drag grip, pinned default at the end. Dropped from v1: the zoom control and the Branch view, both of which belong to a canvas you navigate rather than a rail you pick from. |
| Widen the rail to `clamp(320px, 24vw, 420px)` | *"remove the right side, add it to inline cards on click"* | **No rail.** The live preview and the publish gate are cards you summon from a chip row and dismiss with an ×. Below 1560px they open under the step; above it they take the space to the right of it — the only time a right column exists, and it exists because you asked for one. |

### The rest

- **The trail.** Who → When → Then → Check → Review, one step at a time, with
  **All together** flipping the whole rule into one editable stack. The step
  chip's dot is derived from the diagnostics that step owns — clear because
  nothing is wrong with it right now, and unclear again the moment something is.
  Nothing accumulates and nothing is awarded.
- **Review is on the trail**, not behind Publish (`review-step.tsx`): a
  `n of 5 checks clear` track, the five gates each linking to the surface that
  can clear it, what publishing changes, and the policy read end to end as
  sentences. The old `ReviewDialog` stays for the archived builders.
- **The gauntlet is one board** (`gauntlet-dialog.tsx`). It was three surfaces —
  a deck before the run, a stage dealing one card, a list repeating all thirteen
  after. Now a tile settles where it already sat, so the card you watched land is
  the card you read; clicking one opens its trace, its fix and its override
  below the board, and filtering dims tiles rather than removing them so the
  same card stays in the same place.
- **The button grammar.** `Button` takes `primary`/`secondary` on top of the
  token roles, plus `icon`; `IconButton` requires a label and uses it as both
  the accessible name and the tooltip; `MenuButton` carries a group of actions.
  The top bar went from **11 flat controls to 6** — back, name, the two pips,
  undo/redo, **Tools ▾**, **Actions ▾**, and one primary. There is one primary
  per view: `Review & publish` on a rule step, and on the Review step it stands
  down so the Publish at the end of the checks is the only one.
- **`Tip` and `TipDot` in the kit**, generalised from `InfoDot` — hover, focus,
  touch, Escape, `aria-describedby`. Every demoted sentence lives on one.
- **The grip drags.** `flow-rail.tsx` carries `draggable`/`onDragStart`/`onDrop`
  on the index, and the keyboard ↑ ↓ stayed.

### The second round

Five more instructions, after seeing it run.

- **v1's insert diamond, exactly.** The `+` between two rules is v1's
  `.bspine__add` — a diamond, because that is the flowchart glyph for "a
  decision happens here", counter-rotating so the `+` stays upright, surfacing
  on approach, and breathing quietly at the tail where it doubles as *add a
  rule*. The connector is v1's dashed spine with the `no match` pill on it.
- **The flow got v1's width and v1's drag.** 380px by default, dragged from an
  invisible corridor between the columns with a pill that surfaces on approach,
  double-click to reset, arrow keys to nudge, clamped so the trail always keeps
  560px. One `AbortController` owns the listeners and the body styles, so an
  interrupted drag cannot leave the page stuck in `col-resize`.
- **The right side came back as a slider, not a rail.** Three panels behind one
  column that arrives from the right when asked — **Preview**, **Review**,
  **Launch**. It is a real grid column that the trail gives width to, animated
  through `grid-template-columns`, never an overlay: a panel describing the rule
  you are editing must not be sitting on top of it. Below 1180px it takes the
  flow's place instead of squeezing the step.
- **The floating buttons are gone.** The two chips that floated under the form
  are now the three panel toggles at the top right, on the side the panel comes
  in from. The unsaved-changes bar no longer floats over the step navigation —
  there is one docked footer, and *unsaved* is a state of that bar (it tints,
  names the change, and offers Discard) rather than a second bar on top of it.
  The trail wraps instead of scrolling, so opening the panel never pushes a
  control out of reach.

### The guided build

For somebody who has never met an ordered rule list: say what you want in a
sentence, answer five questions, watch the rules get written.
`create/interview-model.ts` is pure and testable, `create/Interview.tsx` is the
surface, reachable from **New policy** and from the empty state in the builder.

Where it is a game and where it deliberately is not:

- Answering is fast and physical — number keys, arrows, Enter, one question at a
  time, a track that fills. The prompt is keyword-matched to pre-answer what it
  can, and every guess is labelled *picked from your sentence* so a wrong one
  costs a glance.
- The build is **drawn**: rules land on a spine one at a time in evaluation
  order with a plain-English line each, and the order is narrated — the guard is
  first, relief goes underneath, because first-match-wins is the thing this
  model punishes you for not knowing.
- The grade at the end is the **real gauntlet over the real rules**, not a
  reward. A policy this simple usually leaks, and a first-time administrator
  finding that out on the way in is the entire point.

It authors, it never invents: every answer maps to conditions and decisions that
already exist in the model, so everything it produces is editable in the builder
afterwards. `interview.test.ts` composes **all 576 combinations** of the five
answers and asserts the linter can fault none of them, that every audience is
governed by a catch-all rather than falling through, and that the guard always
sits above the relief.

### The third round — checked against Mobbin

- **Guided setup, named and placed.** "Answer a few questions" was a sentence
  where a name belongs. It is **Guided setup**, and it sits on step 2's action
  bar beside *Create policy* rather than in the gallery — the moment somebody
  has decided to write the rules themselves and is looking at an empty form is
  the moment the offer is worth making. Up in the gallery it was a fifth thing
  to choose between; on the bar it is a way out of the one you are stuck on.
  It is the **only animated control in the product**: a slow sheen every 4.2s
  and a wand that lifts on hover, both off under `prefers-reduced-motion`. One
  moving thing on a still bar reads as an invitation; two would read as noise.
- **Colour in the When step, carrying data.** Every condition row is tinted by
  its category — the catalogue already records `group`, so the colour is data,
  not decoration. Network → info, Location → lime, Device → accent, User →
  magenta, Group → positive, Time → notice, the rest neutral. **Never
  `negative`**: red means danger in this kit and a network condition is not a
  danger. A 3px category edge on the row and a tinted tile behind the field icon,
  which is the grammar [Gorgias](https://mobbin.com/screens/cd3cdb31-3a00-4ba6-8451-3153bd86cf50)
  and [Sprout Social](https://mobbin.com/screens/b6df2518-57bd-4e5f-9e43-e4e7bf45aaa6)
  both use to make a long condition list legible before a word is read.
- **Fewer buttons, by scope rather than by deletion.** Two top-bar menus became
  one — **Policy** — holding only what is true of the policy. Rule-scoped
  actions moved onto the rule, as a `⋯` beside its name: *Add a rule below,
  Duplicate, Delete*. "Delete this rule" sitting in a top bar next to "Save as
  template" was a footgun and a category error in the same row, and on the rule
  the labels stop needing "this rule" to be unambiguous. The three panel
  toggles are icon-only now — the panel says its own name in its header. And the
  blast-radius pip only renders **once there is a blast radius**; it used to sit
  there permanently reading "no change", which made the one case that matters
  look like more of the same furniture.

Mobbin references for the create screen, which is where the naming argument
started: [ClickUp](https://mobbin.com/screens/c8931775-29e6-4974-9ecf-bbb9e4f44588),
[Google Analytics](https://mobbin.com/screens/a2355e9f-cbc2-4a99-91d7-22667a786bd1),
[Pitch](https://mobbin.com/screens/f182eb14-b5cd-4498-9bb2-dd7d65ecb329),
[Typeform](https://mobbin.com/screens/a7f10ae8-ea12-4652-80bd-a716b63013e9).
All four make every starting point a peer card in one grid. That pattern was
built and then reverted on instruction — the banner is back, and guided setup
went to the form instead. Worth revisiting if the gallery is ever reworked.

### The fourth round — the things that were left

- **Narrow windows.** Below 1120px the flow becomes a **drawer**: at 1024 it was
  taking a third of the window to be a rail, and the sequence is something you
  consult and pick from rather than something you need in view while filling in
  a field. It slides over on request, closes as soon as it has been used, and
  the trail gets the whole width. Below 880 the step labels drop and the numbers
  carry the trail on their own; the pips keep their grade and drop their detail
  rather than wrapping out of their own pill. Checked at 1024 and 860 — no
  horizontal overflow at either.
  - *Found while building it:* hiding the split handle took it out of the grid,
    and auto-placement slid the whole trail into the 0px column meant for the
    flow. Every column is now placed explicitly.
- **The bundle.** The five archived builders are lazily loaded with their
  stylesheets, and so are the guided setup and the tour. Entry JS **864 → 554 kB**
  (241 → 157 kB gzip); entry CSS **371 → 272 kB** (54 → 41 kB gzip).
  - *Found while doing it:* `.u-sr-only` was defined in `builder-v2.css` and
    `.u-sr` in `builder-canvas.css` — both used well outside those builders.
    Splitting those stylesheets would have rendered screen-reader-only text as
    visible text on the Zones screen and in v4's live region. Both now live in
    `kit.css`, with a test.
- **Dark theme.** A real bug across five files: `--surface-inverse` flips to
  near-white in dark, so every `rgb(255 255 255 / …)` overlay painted on it
  disappeared — the selected step's number, its badge, the SaveBar's ghost
  button, and three builders' eyebrow text. All replaced with
  `color-mix(in srgb, var(--text-inverse) N%, transparent)`, which flips with the
  theme. The tour's close button and the guided sheen were the same class of
  mistake and are fixed too.
- **The tour's focus behaviour.** Settled as non-modal on purpose, with the four
  things a non-modal dialog owes — see `docs/builder-tour.md` §7.
- **The archived builders.** All six versions render, zero console errors.

### Measured after

| | Before | Target | Built |
|---|---|---|---|
| Dead space at 1920 | 584px (31%) | 0 | **0** |
| Rule step scrolls at 900px tall | 2.14 screens | ≤ 1 | **no scroll** |
| Words visible on the step | 263 | ≤ 120 | **26** |
| Section-subtitle words | 89 | 0 | **0** |
| Right rails | 1 (overflowing) | 0 | **0** |
| Drag handles that do not drag | 1 | 0 | **0** |
| Top-bar controls | 11 | 4 + Actions | **6** |
| Bars competing for the bottom strip | 2 | 1 | **1** |
| Floating controls over content | 3 | 0 | **0** |

183 tests pass; `tsc -b` and `oxlint` are clean of new findings.
