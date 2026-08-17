# Which builder should ship

**Recommendation: v4's layout, v5's surrounding apparatus, shipped as one
builder with no version switch.**

> **Status: implemented.** v4 is now the default builder and carries all four
> carry-forwards below, with the Steps view kept as a read-only reading surface.
> The apparatus lives in shared modules (`history.ts`, `readiness.tsx`,
> `command-bar.tsx`, `overview.tsx`) so v5 still demonstrates the three-workspace
> comparison without a second copy of any of it. The version switch stays in the
> prototype because comparison is what the prototype is for; it is what would be
> dropped on the way to production.

Six versions exist to answer one question. This is the answer, the evidence
behind it, and the things it would be wrong to carry forward.

---

## The short version

| | |
|---|---|
| **Ship** | v4's three-column layout — order rail, permanent form, live answer rail |
| **Plus** | v5's undo, command bar, readiness gate, and shadow highlighting |
| **Drop** | the workspace switcher, the Board mode, the version switch itself |
| **Keep as a tool, not a mode** | the Steps view, as a read-only overview |

v5 is the better *prototype* and v4 is the better *product*. Those are not in
tension: v5's job was to find out which parts of five layouts were load-bearing,
and it answered that. Shipping the answer does not mean shipping the apparatus
that found it.

---

## The evidence

### 1. The form is the object, and it is big

The measurement that settles the layout argument, taken from the running
prototype:

> **A rule with one condition renders 1,403px of form.**

That is not a styling problem to be tightened away. It is what the `Rule`
interface contains:

| Field | Control |
|---|---|
| `appliesTo` | multi-select over the group directory |
| `conditions[]` | unbounded; each has a field, operator, one or more values, a joiner |
| `decision` | three-way |
| `firstFactor` | three-way, one branch opens a method picker |
| `secondFactor` | four-way, **three branches open a different configurator** |
| `rememberMfa` / `rememberDays` / `forceMfaEachLogin` | switch, number, nested switch |
| `allowDisable2fa` | switch with a stated consequence |

Any layout that opens this *inside* the sequence pushes the sequence off screen.
That is the whole of v3's problem and it is arithmetic, not taste.

### 2. Most versions never edited most of the model

Counting references to the factor fields:

| Version | Factor-field references | Reads as |
|---|---|---|
| v1 | 29 | the only early version that edited the whole rule |
| v0 | 1 | the deployed prototype, faithfully limited |
| v2 | 0 | decision only |
| v3 | 0 | decision only |
| v4 / v5 | 19 (via `rule-form.tsx`) | whole model, one implementation |

v2 and v3 are arguments about layout that quietly dropped most of what an
administrator opens a rule to change. They are not candidates.

### 3. The surfaces matter more than the canvas

| Version | Test | Log | Assign | Template | Review | Gauntlet | Impact |
|---|---|---|---|---|---|---|---|
| v0 | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| v1 | — | — | — | — | ✓ | — | — |
| v2 | — | — | — | — | — | — | — |
| v3 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| v4 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| v5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

v1 and v2 are the most visually distinctive and the least complete. That
correlation is worth sitting with: the versions that spent their budget on the
canvas had none left for the screens that answer *what does this do*.

### 4. What the checks found about the model, not the layout

Running the gauntlet across the seeded catalogue:

- **5 of 6** graded App Access policies leak. The one that does not is the
  Zero-Trust Baseline seed, written specifically to survive the deck.
- Executive Step-up scores **F with 10 got through** — every one of its five
  rules is scoped to Executives, so nobody else is governed by it at all.
- The blast radius shows Finance's rule 1 winning **720 of 1,440** modelled
  situations while rule 3 wins **36**.

None of that is a layout finding. It is what a policy tool is *for*, and no
version of the canvas would have surfaced it. This is the strongest argument for
where the remaining effort should go.

---

## Why not v5

v5 is the right answer to "which layout is best for which task" and the wrong
thing to ship, for three reasons.

**A mode switcher is a question asked of every user on every visit.** Steps,
Form and Board are not preferences — they are the same object at three
altitudes. Most administrators will pick one in week one and never look again,
having paid the cost of the choice every session in between.

**Board never earned its column.** It is the layout with the palette, and the
palette solves a discovery problem — *what can I check?* — that v4's condition
picker already solves inside the form, at the moment you are actually choosing.
A permanent 200px catalogue to save a click is a bad trade at 1440px.

**Three layouts is three times the surface to keep correct.** The refactor that
pulled the form into `rule-form.tsx` proved the point: the moment two hosts
existed, the factor configuration had two places to drift. One host removes that
class of bug rather than managing it.

## Why not v0, v1, v2, v3

- **v0** is the control. It exists so the others can be argued against it, and
  its own header says anything that improves it destroys the only thing it is
  for. Keep it in the repo, never ship it.
- **v1** owns the Branch view and the original whole-model inspector, but at
  2,750 lines with a 760px inspector wider than the canvas it describes.
  Its inspector work is already carried forward — `rule-form.tsx` is its
  descendant.
- **v2** is the Tines/Airtable shape applied to something that is not a graph. A
  policy is an ordered list; a canvas that can express arbitrary topology is a
  canvas that can express states the engine cannot evaluate.
- **v3** is right that the sequence matters and wrong that the form fits inside
  it. Its numbered steps and sentence summaries survive — as v4's order rail and
  as v5's read-only Steps view.

---

## What to carry forward from v5

Four things, none of which require the mode switcher:

1. **Undo.** Rule order is a semantic edit made with one click. The only route
   back in every other version is Discard, which throws away the session.
2. **The command bar.** Cheap, discoverable, and the only affordance that scales
   as the toolbar fills up.
3. **The readiness gate.** The linter, the gauntlet and the blast radius each
   answer part of *is this safe to ship*. Separately they are three screens
   nobody opens; together they are a checklist that names its own blockers.
4. **Shadow highlighting.** First-match-wins is the model's sharpest edge and
   hovering-to-dim is the only place in six versions where it is *shown* rather
   than described.

And one thing to carry forward from the Steps view: keep it, but as a
**read-only overview** reachable from the order rail rather than as a mode. It
is genuinely better than the rail for reading a policy end to end, and it has no
business being an editing surface given point 1 above.

---

## What is still open

Stated plainly, because a recommendation that pretends to close everything is
not worth reading.

- **The deck is thirteen opinions.** Every expectation is arguable and every one
  is overridable, but the grade is only as good as the cards. A real deployment
  would want the deck to be tenant-editable, not just tenant-overridable.
- **The simulator is a fixed table, not the engine.** Order, first-match and the
  resulting decision are real; the mapping from a context option to a condition
  value is authored. Every surface says so, and every surface would need
  re-validating against the real engine before any of these numbers are quoted
  to a customer.
- ~~**`matchEstimate` is still seed data.**~~ **Closed.** The form now reports
  swept reach — exact over the 1,440-situation space — instead of the seeded
  estimate. The archived builders keep the estimate, because changing what a
  frozen comparison displays destroys what it is for.
- **The 1,440-situation space is not the world.** It is exact about the model and
  silent about the tenant. The right next step is to run the same sweep against
  real decision-log traffic, at which point the claim becomes exact about the
  tenant too.
