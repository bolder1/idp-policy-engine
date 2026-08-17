# The builder tour

A guided walkthrough of the builder, on an animated hero card.

> **Status: built**, scoped to the builder and nothing else. `src/brand/tour/` —
> `tour-stops.ts` (the six stops as data), `TourHero.tsx` (the six figures),
> `Tour.tsx` (spotlight, card, keyboard, persistence), `tour.css`, and
> `tour.test.ts`. Auto-runs once on a first arrival that was not opened straight
> into a dialog; re-runnable forever from **Policy ▸ Take the tour**.
>
> Two things changed on the way in. The last stop's primary is **Run the
> gauntlet** rather than *Finish* — it hands over to the check it just described
> instead of congratulating you. And the callbacks that let the tour drive the
> builder are held in refs: passed as inline arrows they changed identity every
> render, which re-fired the drive effect, which re-rendered the builder, which
> re-fired it again — a single Next click advanced four stops before that was
> found.

---

## 1. What a tour of this builder has to be about

The obvious tour points at chrome — *this is the Tools menu, this is undo, this
is Publish*. That teaches the furniture, and the furniture is not what people
get wrong here. Three things are, and all three are properties of the model
rather than of the layout:

| The idea | What goes wrong without it | Where the tour shows it |
|---|---|---|
| A policy is an **ordered list** and the **first match wins** | A relief rule written above a guard rule opens the hole it was meant to close | The flow, with a sign-in falling through and stopping |
| A rule is **audience + conditions + outcome**, in that order of checking | Rules scoped to a group nobody is in, and conditions that can never match | The trail, walked one stop at a time |
| **Consequence is knowable before publish** | Policies shipped on a guess; 5 of 6 seeded catalogue policies leak | The gauntlet and the blast radius, run live |

So the tour is six stops about those three ideas, using the real screen, with
the chrome introduced only where a stop needs it. A tour that can be replaced by
a tooltip should be a tooltip.

---

## 2. The shape

**A hero card anchored to a spotlight.** The page dims, one real element stays
lit, and a card sits beside it. The card is two-thirds illustration: an animated
hero band on top, two lines of text under it, controls at the foot.

```
        ╔══════════════════════════════╗
        ║                              ║   ← hero band, 168px
        ║      [animated figure]       ║     loops, ~3s, no audio
        ║                              ║
        ╠══════════════════════════════╣
        ║  Stop 2 of 6                 ║
        ║  First match wins            ║   ← one heading, one sentence
        ║  A sign-in falls down this   ║
        ║  list and stops at the first ║
        ║  rule that matches it.       ║
        ║                              ║
        ║  ●●○○○○      Skip   Back  Next║
        ╚══════════════════════════════╝
```

Rules the card follows, all of them borrowed from decisions this build already
made:

- **One sentence per stop.** The same rule the form follows — if a stop needs a
  paragraph, it is two stops or it is documentation.
- **Never auto-advance.** A tour that moves on its own is a video, and a video
  cannot be re-read.
- **The tour drives the product.** Arriving at the *When* stop actually switches
  the trail to the When step, so the thing being described is the thing on
  screen. Leaving the tour leaves you where the last stop put you, not back at
  the start.
- **Escape, Skip and the backdrop all exit**, and exiting is never punished —
  the tour is re-runnable from `Policy ▸ Take the tour`, forever.

---

## 3. The six stops

| # | Anchor | Heading | The animated hero |
|---|---|---|---|
| 1 | none — centred | **This is where a policy gets written** | The three decision chips (Deny / MFA / Allow) fall onto a spine and settle. Reuses `.bhero__art`, which already draws exactly this. |
| 2 | the flow rail | **First match wins** | A dot enters at the top, falls past two rules that do not match, lands on the third, and the rules below it dim. Loops. This is the single most important frame in the tour. |
| 3 | the trail | **A rule is four questions** | Five step chips fill left to right — Who, When, Then, Check — and the fifth, Review, lights last. |
| 4 | the When step | **Conditions are composed** | Two condition rows assemble in their category colours; the junction pill flips `AND` → `OR` and the matched set visibly widens. |
| 5 | the panel toggles | **Ask what it would do** | A persona chip switches, and the verdict below it flips Allow → MFA with the trace re-drawing. Opens the real Preview panel behind the card. |
| 6 | the gauntlet pip | **Find out before you publish** | The gauntlet dial fills and lands on a grade; two cards flip to *got through*. Ends with a real number from the policy on screen. |

Stop 6 hands over rather than congratulating: **Run the gauntlet** as the
primary, **Finish** as the secondary. The last thing the tour does is put you in
front of the check it just described.

---

## 4. How the hero animations are built

No new dependency. Each hero is a small inline `<svg>` plus `motion/react`,
which the build already uses everywhere, driven by one looping `animate` with a
`repeat: Infinity` transition. Budget: **≤ 60 lines each**, ~2.5–3.5s per loop,
one shared `<TourHero stop={n} />` with a switch.

- They are **schematic, not screenshots**. A screenshot goes stale the first
  time a padding value changes; a diagram of *first match wins* stays true for
  as long as the engine does.
- They use the **same tokens as the thing they depict** — a Deny chip in the
  hero is `--fb-negative-*`, the same as a Deny chip in the flow. The tour must
  not have its own palette.
- **`useReducedMotion` swaps every loop for its final frame.** The frame is the
  message; the motion is how it gets read. Nobody loses information.

---

## 5. Mechanics

**Spotlight.** One full-screen SVG with a dimming rect and a rounded-rect hole
punched by `mask`, animated between anchors with a spring so the hole travels
rather than jumps. The anchor is found by `data-tour="flow"` attributes added to
the six targets — a data attribute rather than a class, so nobody restyles a
target and silently breaks the tour.

**Positioning.** The card places itself on whichever side of the anchor has more
room, clamped to the viewport, falling back to centred when a target is
off-screen or absent. Anchors are re-measured on resize and on stop change.

**State.** `localStorage['idp.tour.seen']`. First open of any builder with the
key absent starts the tour after a 600ms settle; every later visit does not. A
`Policy ▸ Take the tour` item re-runs it whenever you like.

**Accessibility.** `role="dialog"` with `aria-modal`, focus moved into the card
and trapped, Escape exits, ← → move between stops, and the spotlight SVG is
`aria-hidden` since it carries nothing the copy does not. Each stop sets
`aria-describedby` on its anchor while it is lit.

**What it must not do:** block the product. The lit element stays interactive —
if somebody clicks the real *When* step during stop 3, the tour follows them to
stop 4 rather than fighting them.

---

## 6. Files, and the order to build them

| | |
|---|---|
| `src/brand/tour/tour.ts` | The six stops as data: anchor id, heading, sentence, which step to switch to, which panel to open |
| `src/brand/tour/TourHero.tsx` | The six animated figures |
| `src/brand/tour/Tour.tsx` | Spotlight, card, positioning, keyboard, persistence |
| `src/brand/tour/tour.css` | Prefix `btr` |
| `PolicyBuilderV4.tsx` | Six `data-tour` attributes, the menu item, and the first-run trigger |
| `tour.test.ts` | Every stop's anchor exists in the builder's markup; every stop has exactly one sentence |

Build order: stops-as-data first (so the copy can be argued over before anything
is animated), then the spotlight with plain cards, then the six heroes one at a
time. Stop 2 is the one worth the most effort — if only one animation is ever
built, it is that one.

---

## 7. Focus, settled

**It does not trap focus, and that is the decision rather than an omission.**
The tour's first property is that the page stays usable underneath it — the
spotlit element is clickable, and somebody who ignores the card and clicks the
real *When* step is a person learning the product. Trapping focus would make it
a modal that merely looks permeable, which is worse than either honest option: a
keyboard user held inside a card the pointer is free to leave.

Not trapping has a cost. These four things pay it, and `tour.test.ts` pins each
one so the trade cannot be quietly un-made:

| | |
|---|---|
| `aria-modal="false"` | Assistive technology is told the truth rather than inferring a barrier that is not there |
| A polite live region | Focus can leave and come back, so every stop announces itself instead of relying on the card holding focus |
| `aria-describedby` on the lit element | The explanation reaches somebody who arrives at the control by Tab rather than by reading the card, and is removed the moment the stop moves on |
| Escape bound to the window | Leaving works from anywhere on the page, not only from inside the card |

## 8. What is worth deciding first

- **Does it run on first visit, or only on request?** Auto-running is how a tour
  gets seen; it is also how a tour gets dismissed unread. Proposal: auto-run
  once, and make stop 1 an offer — *Take the tour* / *Not now* — so the
  interruption costs one click to refuse.
- **Should the guided setup and the tour be the same thing?** They answer
  different questions — *build one for me* versus *teach me the surface* — and
  a first-time user probably wants the first. Proposal: keep them separate, and
  have the guided build's final screen offer the tour.
- **Six stops or four?** Stops 3 and 5 are the softest. If the tour tests long,
  they are the two to cut.

## 9. Learn the builder — the panel the tour now lives in

The tour used to be a menu item that ran once. That made "show me that again" a
search, and left everything the tour was too short to explain with nowhere to
live at all. Both are now behind one control on the builder bar.

**The button.** A `GraduationCap` on the top bar, beside undo and redo. On the
bar rather than in a menu, because the person who needs it is the person least
likely to know which menu it is in. The Policy menu keeps an entry pointing at
the same panel.

**The panel.** Two levels in one drawer, taken from Xero's setup guide rather
than from a help centre:

1. **The tour**, offered the way HubSpot offers one — what it is, how long it
   takes, and a button that reads *Take it again* once it has been taken.
2. **Five guides**, with a meter that reads *n of 5 read*. The denominator is
   the point: a countable list gets finished, a list of forty gets closed.

Selecting a guide pushes; a crumb pops back; finishing one offers the next
rather than returning to the list, because a reader who finished one guide is
the likeliest person in the product to read another.

**What earns a guide.** Only a mistake that produces a policy which looks right
and behaves wrong. Where to click is not a guide. Why the relief rule has to sit
under the guard rule is, because that one ships.

| Guide | The mistake it prevents |
|---|---|
| Write your first rule | Treating the audience as a subject rather than a filter |
| Get the order right | Relief above a guard — a hole with a friendly name |
| Read the checks | Publishing over a warning without reading it |
| Test before you publish | Reading the grade instead of the breach |
| Ship it safely | Believing a rollback is an undo |

**Copy rule, relaxed exactly once.** A tour stop gets one sentence because it is
read standing up, beside the thing it describes. A guide step is read sitting
down, so it gets a short paragraph and a `tip` — the sentence somebody will
quote back later.

## 10. The figures

Five new ones, for the guides, and they are doing a different job from the
tour's heroes. A hero sits beside a sentence and sets a mood. These sit above a
guide somebody opened on purpose and have to carry the argument alone, because
a reader who understood the picture will skim the paragraph — and that is a win.

Three rules came out of drawing them:

- **Show the mistake, not only the right answer.** `order` runs the wrong order
  first and lets a sign-in through, then swaps the rules and catches it. A
  drawing of the correct arrangement teaches you to recognise the correct
  arrangement; a drawing of the failure teaches you what to look for.
- **Draw the cursor when the lesson is an action.** An arrow between two boxes
  says *these are related*; a cursor dragging one says *you do this*.
- **Same tokens as the product.** A Deny chip in a figure is the same
  `--fb-negative-*` as a Deny chip in the flow, and a test asserts no raw colour
  gets in. A tour with its own palette is a tour about a different product.

## 11. Two bugs the rewrite surfaced

**The card could deadlock.** Both the tour and the panel used
`AnimatePresence mode="wait"`, which gates the incoming view on the outgoing
one finishing its exit — and an exit does not finish in a backgrounded tab.
Switching away mid-tour and coming back left it frozen on a stop that Next had
already moved past. Both are now keyed swaps: React replaces the view, motion
animates only what arrives. The cost is 200ms of cross-fade; the alternative was
a walkthrough that can deadlock.

**The card never pointed at anything.** A floating card near a lit box is two
things near each other until something connects them, and every anchored coach
mark worth copying has a beak. `place()` now reports which edge the anchor is
on and how far down it sits, so the beak lands level with the anchor's middle —
which is not the card's middle, once the viewport clamp has moved the card.
