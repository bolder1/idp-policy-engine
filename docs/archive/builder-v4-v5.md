# Builders v4 and v5, and the two played surfaces

Four things were asked for and four things were built. This is what each one is,
what it is arguing, and where the argument is weak.

---

## 1. v4 — the form is the product

### The problem with v3

v3's argument was that a policy is an ordered list, so the editor should be one
column of numbered steps that expand in place. That is right about the model and
wrong about the form, and the reason is arithmetic.

A rule in this model is not four fields. It is:

| | |
|---|---|
| audience | multi-select over the group directory |
| conditions | unbounded list, each with a field, an operator, one or more values, and a joiner |
| decision | three-way |
| first factor | three-way, one of which opens a method picker |
| second factor | four-way, **three of which open a different configurator** — a multi-select, an ordered chain, or a fallback picker |
| remembered device | a switch, a day count, and an override switch |
| end-user opt-out | a switch with a consequence |

Opened in place, that is roughly 1,400px of form injected into the middle of the
sequence. The sequence — the thing v3 exists to show — is now off screen, and you
are editing a long form inside a layout whose whole argument was that you could
see the order.

Measured in the running prototype: the form is **1,403px** tall for a rule with
one condition.

### What v4 does instead

Three columns, none of which move:

```
┌────────────┬────────────────────────────┬─────────────┐
│ ORDER      │ THE FORM                   │ ANSWER      │
│ 236px      │ 720px measure, own scroll  │ 268px       │
│            │                            │             │
│ 1 Block…   │  ① Name                    │ outline     │
│ 2 Off-net… │  ② Who it applies to       │  · Name     │
│ 3 Exec…    │  ③ When it applies    ←──  │  · Who      │
│ 4 Contr…   │  ④ What happens            │  · When  3  │
│ — default  │  ⑤ Checks & impact         │  · What     │
│            │                            │  · Checks   │
│            │                            │             │
│            │                            │ live preview│
└────────────┴────────────────────────────┴─────────────┘
```

The form scrolls; the layout does not. The rule's identity is sticky at the top
of the form, because the one question you must never scroll up to answer is
*which rule am I editing*. The outline tracks the scroll rather than being a
menu you click.

### The three things v4 has that no other version does

**1. The whole rule is editable.** v2 and v3 edit the decision and stop. Every
field on the `Rule` interface has a control in v4 — including the three
second-factor configurators, which is most of what an administrator opened the
rule to change.

**2. Conditions are composed like design-tool properties.**

```
Match  [ All of these | Any of these ]

┌──────────────────────────────────────────────────────────┐
│ ⬡ Network Zone    [not in zone ▾]  [Office Network ▾]  ✕ │
└──────────────────────────────────────────────────────────┘
                    ╷
                  ( AND )                ← the junction rail
                    ╵
┌──────────────────────────────────────────────────────────┐
│ ⏱ Time            [between ▾]      [09:00] to [17:00]  ✕ │
└──────────────────────────────────────────────────────────┘
```

- The junction lives **in the gutter**, not inside either row, so the rows stay
  scannable as a column of fields.
- **Match all / any writes the joiners** rather than making you set them
  pairwise. Flip one junction by hand and the control reads `Custom` and says,
  inline, that mixed joiners have no grouping in this model. That warning
  already existed in `diagnose()`; v4 is the first builder where the control it
  warns about is reachable.
- **Multi-value is first class.** `Condition.values` has always been `string[]`
  and every previous builder rendered it as a single select. List-kind
  conditions are now toggle chips, so "Device Type is Mobile **or** Tablet" is
  one condition instead of two rules.

**3. The form evaluates itself.** Pick somebody in the right rail and section 3
can be read as a checklist with the answers filled in:

```
All of these must be true                    for Priya Sharma
  ☒ Device Posture not compliant with Corporate Managed
    the device is compliant
```

Change the rail's device to *Non-compliant* and the box ticks, the verdict flips
to "This rule matches Priya Sharma", and the trace below shows rule 1 hitting
and rules 2–4 unreached. Same evaluator as the Test dialog — `simulate.ts` — so
the two can never disagree.

### Where v4 is weak

It is a **one-rule-at-a-time** editor. Comparing rule 2 against rule 3 means
switching, and the spine's one-line summaries are all you get to compare with.
v5's steps mode exists because of this.

---

## 2. v5 — the mega builder

Five versions argued about layout and none won, which is the finding rather than
a failure. They are good at different tasks over the same object:

| Workspace | Inherits | Good for |
|---|---|---|
| **Steps** | v3 | Reading a policy top to bottom, and reordering it |
| **Form** | v4 | Changing one rule properly, all of it |
| **Board** | v2 | Assembling a new policy from a catalogue you can see |

So v5 does not pick. **One draft, one selection, one form component, three
layouts.** Switching costs nothing because nothing is re-entered — the form is
literally the same mounted component (`rule-form.tsx`), which is also why the
factor configuration cannot drift between them.

Steps mode fixes v3's actual bug rather than repeating it: the form still opens
inside the step, but takes **its own scroll at 58vh**, so a long rule never
pushes the sequence a screen and a half down.

### What v5 adds that nothing else has

- **Undo / redo.** Every other version's only way back is Discard, which throws
  away the whole session. Rule order is a semantic edit made with one click; an
  editor whose most dangerous action is also its easiest needs a step backwards.
  Snapshot stack, 60 deep. Deliberately *not* intercepted while a text field has
  focus — stealing the browser's own text undo would break typing to fix a
  problem nobody has.
- **A command bar (⌘K).** Six workspaces' worth of controls do not fit on one
  toolbar. Every action by name, including "go to rule 4".
- **One publish gate.** The linter, the gauntlet and the blast radius each
  answer part of *is this safe to ship*. Read separately they are three screens
  nobody opens. Collected into one readiness panel they are a checklist that
  names its own blockers, each row linking to the screen that fixes it.
- **Shadowing drawn.** v2's `shadowedBy()` proved which rules a broad rule
  silently kills. Hovering one now dims them. First-match-wins is the model's
  sharpest edge and this is the only place it is shown rather than described.

---

## 3. The Gauntlet — the check, played

`gauntlet.ts` (logic, tested) · `gauntlet-dialog.tsx` (surface)

A policy author has one question they cannot answer by reading their own rules:
**what gets through**. The Test dialog answers it one sign-in at a time, which
means you only ever find the holes you already suspected.

The Gauntlet deals a fixed deck of **13 sign-in attempts** — seven hostile, six
entirely ordinary — and scores what came back.

```
        ╭───────╮
        │   F   │   Grade F
        │ 5/13  │   5 hostile attempts were let through with less
        ╰───────╯   than the policy should ask for.

   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
   │  5   │ │  0   │ │  3   │ │  5   │
   │ got  │ │locked│ │ over-│ │ held │
   │through│ │ out  │ │charged│ │      │
   └──────┘ └──────┘ └──────┘ └──────┘
```

Cards deal one at a time into a result list; each expands to the full evaluation
trace and a button that opens the rule which produced the decision.

### Two rules keep this a tool rather than a toy

**The score is derived, never awarded.** Every number is a count of deck cards
whose actual decision differed from the treatment the card declares it should
get. No XP, no points-per-action, nothing that only goes up. A policy that gets
worse scores worse. The grade ladder is written out rather than computed from a
weighted sum, because a weighted score would let three points of friction cancel
a breach and no security team would take that trade:

| | |
|---|---|
| **F** | more than one hostile attempt got through |
| **D** | one did |
| **C** | none did, but an ordinary sign-in was denied outright |
| **B** | none of either, but more than two ordinary sign-ins were over-challenged |
| **A** | everything landed as the deck asks |

**The expectation is the tenant's to disagree with.** Each card states the
treatment it expects *and why*. If an administrator decides a contractor on an
unmanaged device really is fine on one factor, they flip that card and the grade
recomputes. A fixed opinion baked into a score is a vendor telling a customer
their policy is wrong; an editable one is a checklist they own.

Four outcomes, named for what happened rather than for a colour:

| | |
|---|---|
| **Held** | exactly the treatment the card expects |
| **Got through** | weaker than asked — the only direction that is a defect |
| **Locked out** | an ordinary sign-in refused outright |
| **Over-challenged** | stricter than asked; a cost, not a hole |

Run against the seeded *Finance Team – High Security*: **grade F, 5 got
through** — including an executive account from a Tor exit, because rule 1 only
denies devices failing posture and a Tor exit on a compliant device is not that.

---

## 4. The Blast Radius — the impact, made visible

`impact-arena.ts` (logic, tested) · `impact-arena-dialog.tsx` (surface)

### Why not use `impactOf()`

`impactOf()` answers per-rule impact from `matchEstimate`, which is seed data and
is honestly labelled an estimate. That is the right answer next to a rule while
you edit it. It is the wrong answer for *what does publishing this change do*,
because you cannot subtract two estimates and present the difference as a
consequence.

### What it does instead

It enumerates the situation space the simulator can actually model and runs the
real evaluator over all of it, twice — once for the published policy, once for
the draft:

```
4 people × 5 origins × 6 devices × 4 auth states × 3 risk signals = 1,440
```

The difference is then an **exact statement with a stated scope**:

> 180 of 1,440 situations change treatment. 180 tightened, 0 loosened.

Exact about the model, silent about the world. That is a claim that survives
being checked, which "≈ 18% of users affected" is not.

### The field

1,440 dots, one per situation, in a **fixed order** — so the same dot is the same
situation in every view, and the field can be compared rather than just looked
at. Three views: **Now**, **Published**, and **What moved** (which dims the
settled world to 14% and scales the movers, because highlighting 180 dots still
leaves 1,260 competing for the eye).

### The game is a trade you cannot win

Two meters sit against each other — **Guarded** (ends in a second factor or a
denial) and **Unimpeded** (signs in on one factor and is asked nothing further).
Every rule moves both. The arena refuses to pretend pushing one up is free.

Under them: where the movement went as from→to flows, which cohorts moved most,
and **what each rule actually catches** — exact counts over the grid, so a rule
that wins 0 of 1,440 is named as catching nothing rather than left to look fine.

### Badges that can be lost

Five assertions about the field, each checkable by reading the grid, each naming
what broke it:

- *Every rule earns its place* — each enabled rule wins ≥1 situation
- *Anonymised traffic is gated* — no Tor/proxy sign-in gets in on one factor
- *Failing devices are stopped* — no posture failure gets in on one factor
- *No broken rules* — the linter finds nothing that can never run
- *Actually in force* — at least one app attached
- *Nothing quietly loosened* — no situation treated more leniently than before

On the seeded finance policy, *Anonymised traffic is gated* is **not earned** —
a real hole, found by a badge rather than by reading four rules.

---

## 5. Closing a hole, and seeing what that did

Two additions that turn the Gauntlet from a report into a loop.

### The proposed fix

A failed card offers the rule that closes it. Three things make this advice
rather than automation:

**It is authored, not derived.** Each card carries the *signal that makes it
hostile* — the anonymised origin, the missing enrolment, the contract status —
not its own context. Deriving a rule from a card's context is easy and produces
a rule naming one person, one device and one hour: it closes that card and
nothing else, with the authority of a suggestion.

**Position is most of the fix.** First match wins, so a rule inserted below the
one that let the sign-in through never runs. The proposal inserts *above* the
deciding rule and says so:

> Inserted above rule 4 · Contractor baseline, which is what decides this
> sign-in today. Below it, the new rule would never run.

**It re-aims rather than duplicates.** This one was found by its own test. The
first version always inserted, which on the Finance seed produced a broad
"Verify contractors" above the existing, narrower "Contractor baseline" with the
same predicate — making the older rule unreachable, tripping the linter, and
**blocking Publish**. A one-click fix that leaves the policy unpublishable is
not a fix. So when a rule already carries the predicate and its audience covers
the person on the card, the proposal changes *that rule's answer* instead:

> Rule 4 · Contractor baseline already checks this and answers Straight in for
> contractors. A second rule with the same conditions would make one of the two
> unreachable, so this changes the answer instead of adding one.

The result is a one-line diff — *"Contractor baseline" now 2 factors instead of
1 factor* — that closes the card and leaves the policy publishable. Two tests
hold this: every offered fix closes its own card, and applying every fix every
seeded policy offers leaves it free of linter errors.

### The replay

After an edit, the next run compares itself to the one before it:

> **Since your last change: F → F** — 1 improved
> ✓ Contractor at 03:00 — Got through → Held

Cards that got *worse* are listed first and never collapsed. Inserting a rule
changes what every card below it reaches, so a fix that closes one hole and
opens another is the specific failure this strip exists to catch. Showing only
"the card you were looking at is fixed" would be the most misleading true
statement the screen could make.

## 6. The fleet view

The gauntlet answered "what gets through this policy" one policy at a time,
inside a dialog inside a builder — the wrong altitude for the question an
administrator actually has, which is *which of my policies has a hole in it*.

So the deck runs against every row of the policy list. The column shows the
finding rather than the letter — "5 got through" is actionable where "F" is a
thing to feel bad about — the grade rides alongside it for sorting, and clicking
lands you in the gauntlet **for that policy** rather than merely near it.

Two exclusions, both to stop the column asserting things it cannot know:

- **The system default** is a documented catch-all. The deck would report it as
  nothing but holes and it would head every sort.
- **Session and Account Management policies** are not graded at all. The deck
  asks app-access questions; "was this Tor sign-in blocked" is not a session
  policy's job. Scoring one against these cards produced eleven failures that
  were all category errors — and a column that cries wolf on two thirds of the
  table is a column administrators learn to skip.

The footer names the total: **5 with holes**, as a link that sorts by exposure.

### One seeded policy that passes

Every other seeded policy is realistic, which is to say it leaks. A product
whose best available score is F teaches its user that the score only ever says
"bad", after which nobody reads it. **Zero-Trust Baseline** was written to
survive the deck — refuse what cannot be legitimate, refuse what cannot complete
a challenge, then step up on risk, on unmanaged hardware, and on the two moments
an account is most impersonated — and a test asserts it keeps scoring A. Another
asserts some policy still leaks, because a deck nothing fails proves nothing.

## 7. Two corrections worth recording

Both were found by measuring rather than by reading, and both were mine.

**The form's impact number was still an estimate.** `impactOf().matches` reads
`matchEstimate`, which is seed data that never recomputes — honest enough beside
a rule you are reading, not honest enough beside one you are about to publish.
It now reports the **sweep's** answer: how many of the 1,440 modelled situations
this rule actually wins, first-match and all. The two figures in that row are
deliberately in different units and say so — the audience is *people* and exact,
the reach is *situations* and exact over the model. Presenting situations as
people would have been the same fake precision in a new costume. A rule that
wins nothing now says **"nothing gets this far"** rather than showing a zero.

The archived builders keep the estimate. v0–v3 are frozen comparisons and
changing what they display would destroy what they are for.

**The modal focus trap had a dependency bug.** Adding `aria-modal`, a Tab trap
and focus restoration to `Modal` improved all nine dialogs at once — except that
`onClose` is an inline arrow in every caller, so it has a new identity on every
render of the host. With it in the effect's dependency array the effect tore
down and re-ran continuously, and the "restore focus" cleanup fired on every
keystroke in the builder behind the dialog, throwing focus at whatever had been
active when that render started. Held in a ref, the effect depends only on
`open`. Verified in the browser: focus enters the panel on open, Shift+Tab wraps
inside it rather than escaping to the page, and Escape returns focus to the
control that opened it.

Restoration is also guarded on `isConnected`, because some dialogs are opened by
a trigger that navigates — the policy list's exposure cell opens the gauntlet and
unmounts the whole table doing it — and calling `focus()` on a detached node
silently drops focus to `<body>` instead of leaving it where the new screen put
it.

Two more suppressed focus rings were found and moved rather than deleted: three
search fields had `outline: none` with no replacement, which leaves a keyboard
user unable to see where focus is. The ring now sits on the container via
`:focus-within`, which is what made it look redundant in the first place.

## Shared machinery

| File | Holds |
|---|---|
| `simulate.ts` | **One evaluator.** Lifted out of `builder-test.tsx` so the Test dialog, the Gauntlet and the Blast Radius cannot contradict each other. Three implementations of "would this rule match" is three chances for two screens to disagree in front of an administrator, after which none of them are believed. |
| `rule-form.tsx` | The form and the live preview, hosted by both v4 and v5. |
| `changes.ts` | `describeChanges()` — the save bar names *what* changed ("Contractor baseline now Deny instead of 1 factor"), not how many things did. Moving a rule is a semantic edit indistinguishable from an accidental drag; "3 unsaved changes" cannot tell those apart. |
| `gauntlet.test.ts` | 26 tests. The grade is a function of the counts and breaches dominate; the sweep's headline is exact over its stated space and does not move when the policy does not; every proposed fix closes its own card and leaves the policy publishable. |

## The honest limit, stated everywhere it is surfaced

The map from a context option to a condition value is a **fixed table in this
prototype, not the engine**. What is real is the order of evaluation, the
first-match-wins stop, and the decision that results. Any signal the simulator
cannot derive is reported as **unmet rather than guessed** — claiming a match on
a fact we never had is the one failure mode that would make every trace on every
one of these screens untrustworthy.
