# Authentication methods — v6

One catalogue, one inspector, no tabs. The default on the page; the two earlier
versions stay behind the switch.

---

## 1. The complaint, which was right

Both earlier versions file this subject into tabs:

| | Tabs |
|---|---|
| **V5 · MFA experience** | Methods · **Method Sets** · Enrollment · Recovery · Hardware Tokens |
| **Current · with method sets** | Methods · Method sets · Enrolment · Recovery · Hardware tokens |

> V5 shipped with four tabs because the deployed screen has four, which left it
> missing Method Sets — the surface the nav item on the left is named after.
> Being faithful to a screen is not a reason to be missing a page, so it has
> five now. The fifth renders `MethodSetsTab`, the same component the Current
> version renders: one implementation of set editing, because two would drift,
> and set membership is referenced by name from every rule that asks for one.
> It brings its own look with it, which is the honest trade — a copy in V5's
> idiom would be two editors.
>
> Static code generation, the console's fifth page, is folded into Recovery in
> both versions. Method Sets was the only genuine gap.
>
> **V5 also gained a way into configuration.** All 21 methods already had a
> schema in `method-config.ts`; V5 had no door to any of them, so its "Needs
> setup" pill named a state the screen could not change. Clicking a method's
> name now opens a **drawer** — description, live toggle, the configuration form
> rendered from that method's own schema, and its per-method settings — over the
> list rather than instead of it, so closing it puts you back on the row you
> were reading.
>
> It is the kit's `Drawer`, not a second one: scrim, spring, Escape-to-close,
> header and footer all come with it, and a drawer that behaves differently from
> every other drawer in the product is a bug with a nice animation. Saving an
> incomplete form is allowed and does not mark the method configured, because
> the credentials usually have to be fetched from somewhere the panel cannot
> reach.
>
> **The form was relaid out, and the panel sizes to it.**
>
> The fields were a 220px label column beside the control — the right shape on a
> wide settings page, the wrong one in a drawer, where the label wraps to three
> lines while its input sits in half the panel. They stack now: label and help
> above, control at full width below. Every narrow-panel form worth copying does
> this — [Maze](https://mobbin.com/screens/9b5c3b54-3596-4dfe-a578-0a11d7f49ed1),
> [Tines](https://mobbin.com/screens/f005a2ce-756a-4083-a4eb-1284cda9e758) and
> [Google AI Studio](https://mobbin.com/screens/6d84b12a-e059-4dbd-b5c7-af2fab29ce47)
> all stack, and Maze is the closest analogue to this exact surface. Toggles keep
> the row form: a switch is small enough to sit beside its label, and stacking
> one wastes a line saying nothing. The change lands in all three hosts of this
> form, because there is only one of it.
>
> **The drawer opens at a width the schema warrants** rather than one width for
> all twenty-one — 720 for FIDO2 (six fields, a list and a radio), 610 for OTP
> over Email, 590 for Security Questions. Counted from the schema, not
> hand-assigned: kinds that need room ask for it, and a merely long form asks for
> a little. `Drawer` gained an optional drag handle for when that guess is wrong
> — the same grammar as the builder's column split, with double-click to reset
> and arrow keys to nudge — and a dragged width survives switching between
> methods, because a panel that resets its size every time you change rows is a
> panel you resize every time.
>
> Removed from V5's Methods tab on the same pass: the *Enrolments* figure and
> the *Where enrolments sit* chart.
>
> **V5's Enrollment tab lost its right-hand rail**, and the three things in it
> were re-homed rather than deleted:
>
> | Was in the rail | Now |
> |---|---|
> | Rollout KPIs | A figure strip across the top, the same idiom the Methods tab uses — plus a fourth, *offered in the portal*, which the tab was computing and not showing |
> | The enforcement warning | Inside the Enforcement group, under the grace-period field. Three columns from the toggle and the number it describes is how a warning ends up read as decoration |
> | *Most enrolled* | A full-width band. Its bars went from 56px to 544px, which is the difference between a ranked bar chart and six bars that all look the same length |
>
> The four settings groups are **one list**, not a grid of cards. Every setting
> on the tab is the same shape — a name, a sentence, one control — so they read
> as rows with section labels between them; the sections keep their label and
> their current value and lose the border, radius and filled header that made
> each look like a separate object. Scoped to this tab: Recovery and Hardware
> Tokens still use the card form of `.bv5__group2`, which is a consistency
> question worth settling deliberately rather than by a selector written for a
> different screen.
>
> **"Offered in the portal" is a transfer**, not a checkbox grid — everything on
> the left, what is offered on the right.
>
> Nineteen checkboxes answer *"is Authy ticked?"* and not the question an
> administrator actually has: *what do my users see?* That answer was spread
> across nineteen rows in reading order, with the six that matter interleaved
> among the thirteen that are off. The right-hand panel **is** the answer, in the
> order it will be offered, and it is never longer than the thing it describes.
>
> - Methods switched off in the Methods tab stay visible on the left, dimmed and
>   labelled *Off in Methods*, because "why can I not offer Authy" is a question
>   this panel should answer rather than hide.
> - `layout` on the rows means a method visibly crosses from one side to the
>   other — the reason a transfer reads better than a checkbox is that the thing
>   you clicked went somewhere and you can see where.
> - A group offers **Offer all *n*** only when it has more than one addable
>   method, so the bulk action appears where it saves work and nowhere else.
> - The offered panel carries the brand tint, so a glance tells you which side
>   you are reading without reading either heading.
>
> **V5 uses the full window.** It was capped at `max-width: 1180px` and not
> centred, so it pinned left and left the rest empty on the right — 97px at
> 1512, ~390px at 1920, and growing. Same bug as `.bpage`'s 1560 cap in the
> builder, in a different file.
>
> What replaces the cap is a measure on the text that would otherwise stretch:
> descriptions hold at 96–104ch rather than running the width of a 1670px table.
> **Space goes to the table, not to the sentences inside it.** The figure strip
> switched from `auto-fit` to `auto-fill` for the same reason — with three
> figures on a wide page auto-fit stretched each tile to 540px, which is a stat
> tile pretending to be a panel; they hold at 260 now and the remainder stays
> empty, which is the honest shape for three numbers.

> "I don't think the methods, enrolment and other things come together in one tab."

They don't, and they shouldn't have to — because they are **not five topics**.
They are one lifecycle seen from five angles:

> a user **enrols** in a method, **uses** it, and **recovers** when it fails —
> and a hardware method needs a physical thing before any of that.

A tab bar makes each angle look like a separate screen. It also defeats the
question the original consolidation was built to answer — *why can't this user
pick Google Authenticator?* — which under tabs takes four of them and a guess.

## 2. The move

**The method is the object, and everything else hangs off it.**

```
┌───────────────────────────────────────────────────────────────────────┐
│  Authentication methods                              [ Save changes ] │
│  ┌──────────┬──────────┬──────────────────┬───────────────────┐       │
│  │ AVAILABLE│ ENROLMENTS│ PHISHING-RESIST.│ NEVER CONFIGURED  │ ← also│
│  │ 7 of 21  │ 6,282     │ 19%             │ 9                 │  filters
│  └──────────┴──────────┴──────────────────┴───────────────────┘       │
├──────────────────────────┬────────────────────────────────────────────┤
│ CATALOGUE                │ INSPECTOR                                   │
│  [search]                │                                             │
│  ▸ Phishing-resistant  2 │  ▨ FIDO2 / Passkey                          │
│    ● FIDO2 / Passkey     │     Phishing-resistant · Biometric           │
│    ○ CAC Card            │                                             │
│  ▸ App-based           8 │  READINESS                                   │
│    ● miniOrange Push     │   ✓ Configured        [ Edit ]               │
│    …                     │   ✓ Switched on       [ on ]                 │
│  ── METHOD SETS      2 ──│   ✓ Offered to users  [ on ]                 │
│    Phishing-resistant o. │                                              │
│    Standard workforce    │  SETTINGS                                    │
│  ── TENANT RULES ────────│                                              │
│    Enrolment             │  WHERE THIS REACHES                          │
│    Recovery              │   1,203  people have enrolled                │
│    Hardware tokens       │       1  method set carries it → …           │
└──────────────────────────┴────────────────────────────────────────────┘
```

Three decisions:

- **The left is one catalogue.** Methods grouped by assurance, then the sets
  that reference them, then the three tenant-wide surfaces **as peers in the
  same list** rather than as tabs above it. One place to point at.
- **The right answers for whatever is selected** — a method, a set, or one of
  the tenant rules. Same frame every time.
- **The figures are filters.** *9 never configured* is not a statistic to read
  and forget; clicking it shows the nine. *Enrolments* counts people rather than
  methods, so it has nothing to filter to — it renders as a figure and does not
  pretend to be a button.

## 3. What is new, rather than rearranged

**The readiness ladder.** A method has four states and they depend on each
other; the earlier screens showed four toggles in a row, which says nothing
about the order. Here they are a sequence: cleared steps go green, the next one
goes brand and carries the control that clears it, and everything below it is
dimmed and disabled. On CAC Card that reads *① Configured [Set up]* with the two
below greyed and the blocker named underneath. **The order you have to fix them
in is now the layout.**

**Reach — the answer the tabs hid.** Every method now shows everything that
changes if you switch it off: how many people have enrolled, which method sets
carry it (each a link), whether recovery leans on it, what balance it draws
down, and — when it is blocked — which live alternatives exist in the same tier.
That is the *"why can't this user pick X"* question, on one surface.

**Cross-surface links that work.** Recovery's blocked option now reads *"Not
configured yet — open OTP over Alternate Email"* and takes you to the method.
Under tabs that sentence could only describe the problem; it could not reach it.

## 4. What was carried, and from where

**V5's aesthetics:** the figure strip, the enrolment split bar with its clickable
legend, the tier blurbs, the dismissible banner, the tone-per-assurance colour.

**The current screen's depth, all of it:** four states per method,
`methodBlocker`'s dependency chain, per-method settings (toggle and select),
`ConfigureMethodDialog` for methods with a real config form, method sets with
their member health, enrolment enforcement with the grace-period lockout
warning, the recovery ladder with dependency blocking, and the hardware token
inventory.

Nothing was dropped to make the layout work. Colour follows assurance —
positive, info, notice, neutral — and **never `negative`**: a delivery-based
factor is weaker than a passkey, not a danger.

## 5. Open

- **The tier tones put two blues next to each other** in the split bar when
  app-based methods lead. Opacity staggers them and the legend swatches match,
  but a genuine four-hue ramp would be better if this bar ever carries more than
  five segments.
- **The catalogue is one flat scroll** at 21 methods. It is fine now; if the
  catalogue doubles, the tier groups should collapse.
- **Below 1080px the panes stack** rather than one becoming a drawer — this page
  is read far more often than it is edited, so the catalogue keeps its place at
  the top. Worth revisiting if that assumption turns out wrong.
