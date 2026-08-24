# Xecurify IDP — Policy tab prototypes

Two versions of the Policies section, switchable in-app.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 295 tests — linter, simulator, gauntlet, sweep, methods, zones
npm run lint
npm run build
```

One prototype, one view: the console's **existing** policy functions, rebuilt on
the published design system. Nothing about how the engine works was changed.

> An earlier pass — the *model concept* — reworked the engine model itself:
> coverage matrix, App × Group binding, weight-resolution explainer. It lived
> here as a second application behind a switcher until it was removed, because
> the question it asks is a different question from this one. It is in the git
> history if that question comes back.

---

## The brand revamp

### Where the design comes from

**The live console is the reference.** `src/brand/console-theme.css` is measured directly off
`test.miniorange.in/moas/admin/customer/home` and loads last, overriding the design-system tokens:

| | Live console | Design system |
|---|---|---|
| Type | **DM Sans**, 14px base | Inter, 13px |
| Sidebar | **`#1e2c38`, 235px** | `#141a22`, 248px |
| Active nav | **`rgba(0,0,0,.4)` + 4.8px `#eb5424` left edge** | tinted row |
| Primary button | **navy `#263746`** | brand orange |
| Page / cards | **white page, `#f8f9fa` tiles** | grey page, white cards |
| Topbar | white, 52px, shadowed | — |

Orange is an **accent** in production — the active-nav edge — not a fill. That is the single
biggest disagreement with `IDP · 2 Core`, and worth settling.

The nav tree, order, icons, section labels, `New` badges and expand-on-select behaviour match the
live rail. Its Policies submenu is *App Login Policy · Password Policy · Adaptive Access Policy*;
this prototype keeps the prototype's own sub-pages there instead, since those are the screens that
exist here.

### Logo system

`npm run logos` resolves every app mark from the web and writes a manifest.

- Registry: `src/brand/logos/sources.ts` — app id, canonical domain, fallback tint + monogram
- Providers tried in order: **Clearbit → DuckDuckGo → Google S2 → the site's own favicon**
- Files land in `public/logos/`, not inlined — the catalogue grows, and inlining would put every
  byte in the bundle whether a screen shows logos or not
- `manifest.generated.ts` records **which provider answered and when**, so a logo that quietly
  changed source is visible
- `<AppLogo>` falls back to a tinted monogram if the fetch failed *or* the image 404s at runtime.
  A broken image in a table of applications reads as a broken product.
- Failures are recorded, never thrown — one unreachable vendor can't fail the build

Current state: **16/16 resolved**, all via DuckDuckGo (Clearbit did not answer). Re-run with
`npm run logos -- --force` to refetch.

Tokens underneath are still the generated design-system file (`packages/tokens/src/tokens.json` →
`tokens.css`), copied verbatim into `src/brand/tokens.css`:

- Brand `#EB5424` — locked
- Shell (nav) is the dark surface: `--shell-bg #141a22`, active item `rgba(235,84,36,0.14)`
- Page `#eef1f4` · raised `#ffffff` · sunken `#f5f7f9` · inset `#eef2f5`
- Danger `#d33a2c`, feedback triads for positive / negative / notice / info / neutral
- Controls 30 / 36 / 42, table row 48, header 40, rail 248, topbar 56
- Full **dark theme** ships in the token set, so the console honours it — toggle in the top bar

Rules taken from `COMPONENTS.md` and enforced here:

- **Destructive triggers are `neutral`, not `danger`.** A red Delete on every row stops meaning danger within a day, so red lives in the confirmation where the decision is made.
- **Status is a dot *and* a label, always.** No dot-only variant exists in the kit.
- **Lifecycle states are neutral, not negative.** "Inactive" is grey, not red.
- **Focus is never suppressed**, and the ring is ink `#1a222b` — a brand-coloured ring disappears against brand-coloured controls.
- **One brand button per view.**

Layout and interaction references pulled from Mobbin: [Supabase roles](https://mobbin.com/screens/aaecbeeb-5370-4ae4-9bd7-30e0c3d06448) (grouped rows, protected badge, toolbar stat), [Vapi monitors](https://mobbin.com/screens/1965682c-0c4e-4146-a0fb-864ad2eabf2d) (sortable heads, stacked cell content), [Cloudflare domains](https://mobbin.com/screens/1ba36f21-a7a5-4f0b-8924-48c0997af10e) (status with reason, row count), [Clerk](https://mobbin.com/screens/bceecfc6-3efc-4ef5-a682-54f7ede1dae5) and [Etsy](https://mobbin.com/screens/e5476550-1c37-4475-8b07-b5d3e9c1e070) (unsaved-changes bar that *names what changed*).

### The builders

Six layouts over one policy, switchable in the builder's header. They share the
model, the store, the diagnostics and the simulator, so a fix in one lands in
all of them. Full write-up in [`docs/builder-v4-v5.md`](docs/builder-v4-v5.md);
**which one should ship, and why**, in
[`docs/builder-recommendation.md`](docs/builder-recommendation.md).

| | What it argues |
|---|---|
| **v4 · recommended** *(default)* | The shipping candidate, rebuilt as **the trail** — see [`docs/v4-next.md`](docs/v4-next.md) for the measurements that forced it. The left column is **v1's flow**: a dot-grid stage, a start node, v1's insert diamond between every pair of rules, decision-coloured tiles, a grip that actually drags, and a corridor you drag to resize it. The middle is a five-stop trail — Who → When → Then → Check → **Review** — one step at a time, with *All together* flipping the whole rule into one editable stack, and one docked footer that turns into the unsaved-changes bar rather than being covered by one. There is **no right rail**: **Preview · Review · Launch** are three faces of a panel that slides in from the right when you ask for it and gives the width back when you close it. Review is a place on the trail rather than a modal behind Publish. Still the only builder where **every** field on `Rule` has a control, where a condition can hold **more than one value**, and where the IF reads as a checklist with the answers filled in for a person you pick; still carries undo/redo, ⌘K, the publish gate and first-match shadowing. |
| **v5 · mega** | The same builder with three switchable workspaces (Steps / Form / Board). Kept for comparison; the recommendation is to ship v4's single layout instead, and the apparatus both use is shared (`history.ts`, `readiness.tsx`, `command-bar.tsx`). |
| **v3 · steps** | The Zap model — one column of numbered steps that expand in place. |
| **v2 · tool layout** | Palette / canvas / inspector, the shape Tines, Airtable and V7 converge on. |
| **v1 · canvas** | Canvas + inspector, Spine and Branch views. |
| **v0 · deployed** | The current prototype, recreated as-is. The control the others are argued against. |

### Two questions, played rather than read

Both sit in the builder toolbar and in the publish gate.

**Policy gauntlet** — deals a fixed deck of 13 sign-in attempts (seven hostile,
six ordinary) at the rules and scores what came back. The score is *derived,
never awarded*: every number is a count of cards whose actual decision differed
from the treatment the card declares it should get. Nothing accumulates, and a
policy that gets worse scores worse. Each card states **why** it expects what it
expects, and the expectation is the tenant's to overrule — a fixed opinion baked
into a score is a vendor telling a customer their policy is wrong. Every failure
names the rule that produced the decision and offers to open it.

**Blast radius** — `impactOf()` estimates from seed data, which is right beside a
rule and wrong for "what does publishing this do", because you cannot subtract
two estimates and call the difference a consequence. So this enumerates the
1,440 situations the simulator can model (4 people × 5 origins × 6 devices × 4
auth states × 3 risk signals) and runs the real evaluator over all of them,
twice. The result is exact over a stated space — *180 of 1,440 situations change
treatment, 180 tightened, 0 loosened* — drawn as a field of 1,440 dots in a fixed
order, so the same dot is the same situation before and after. Two meters pull
against each other (Guarded vs Unimpeded) because no rule improves both, and six
badges assert things about the field that **can be lost**, each naming what broke
it.

A failed card offers **the rule that closes it** — authored from the signal that
makes the card hostile rather than derived from its context, inserted *above* the
rule that let the sign-in through (position is most of the fix under
first-match-wins), and re-aiming an existing rule rather than duplicating its
predicate when one already carries it. That last part was found by its own test:
always inserting produced a broad rule above a narrower one with the same
conditions, which made the older rule unreachable and blocked Publish. After any
edit, a **replay** strip says what the change did to the whole deck — cards that
got worse listed first, because a fix that closes one hole and opens another is
the specific failure it exists to catch.

Both answer from `simulate.ts` — one evaluator, lifted out of the Test dialog so
that no two screens can disagree about what a policy would do.

### Exposure, at the fleet level

The policies list runs the deck against every App Access policy and shows the
finding — *"5 got through"*, with the grade alongside it for sorting. Clicking
lands in the gauntlet **for that policy**. The system default is not graded (it
is a documented catch-all), and Session and Account Management policies are not
graded at all — the deck asks app-access questions, and scoring a session-timeout
policy against them produces failures that are all category errors.

Of the seeded catalogue, **5 of 6** graded policies leak. The one that does not
is **Zero-Trust Baseline**, written to survive the deck so the top of the ladder
is visible in the product and not only in the grading function — a test asserts
it keeps scoring A, and another asserts something still leaks, because a deck
nothing fails proves nothing.

### What did NOT change

The model is the console's own: a policy holds **ordered rules**, they evaluate **top to bottom, first match wins**, a **pinned default rule** catches the rest, and conditions are joined by **per-pair AND/OR**. Zones, Device Posture and Method Sets stay as the reusable objects. Every screen the console has is here — list, scenario picker, name & app, three-column builder, Test policy, Decision log, Assign apps, Review, Templates, Zones, Device Posture, Method Sets.

### What the revamp fixes

Experience problems, not model problems:

- **The plain-English summary contradicted the logic.** A rule joined by `OR` was rendered back in the review dialog as `AND`. Sentences are now generated from the same condition array the editor writes, so the two cannot disagree.
- **Choosing a scenario didn't apply it.** Previewing "Adaptive device trust (90-day)" and clicking through landed you in a builder holding unrelated rules. The scenario's rules are now actually built.
- **The red dot explained nothing.** A bare marker with a `title` of "Configuration issue" now says which problem — no apps attached, or no rules configured.
- **Editing a shared object gave no warning.** Zones said "changes apply immediately to all referencing policies" and named none. It now lists the affected policies, their rule counts and status, before you save.
- **Assigning an app never mentioned conflicts.** It now flags apps already governed by another live policy.
- **Saving showed no delta.** Following the library's own rule — *never save a rule without showing its delta* — the review dialog leads with impact, and the save bar names each change rather than saying "unsaved changes".
- **Rule order could only be changed by dragging.** Keyboard-reachable up/down controls sit on every rule.

---

## Structure

```
src/
  brand/                 ← BRAND REVAMP (default)
    tokens.css           verbatim from the design-system repo
    kit.tsx / kit.css    Button (primary · secondary · ghost · danger, with icons)
                         IconButton · MenuButton · Tip / TipDot · Badge · StatusPill
                         DecisionChip · Toggle · Chip · Tabs · Field · Callout
                         Card · Drawer · Modal · SaveBar
    Shell.tsx            dark rail, topbar, theme toggle
    data.ts              policies, rules, conditions, zones, posture, method sets
    tour/                the builder tour — six stops, a travelling spotlight and
                         six animated figures. Scoped to the builder; see
                         docs/builder-tour.md
    screens/AuthMethodsV6.tsx
                         authentication methods with no tabs — one catalogue
                         (methods, sets and the tenant rules as peers) and an
                         inspector that answers for whatever is selected. The
                         default; the two tabbed versions stay behind the switch
    create/              CreatePolicy · templates
      interview-model.ts the guided build's questions and rule composer — pure,
                         and tested over all 576 answer combinations
      Interview.tsx      say it in a sentence, answer five questions, watch the
                         rules get written, meet the real gauntlet grade
    screens/             Policies · NewPolicy · PolicyBuilder · Library
      flow-rail.tsx      v1's flow, brought forward as v4's left column
      review-step.tsx    Review, as a stop on the trail rather than a modal
      simulate.ts        THE evaluator — one per prototype, shared by every
                         screen that claims to say what a policy would do
      diagnostics.ts     the sound-only linter: diagnose / impactOf / shadowedBy
      rule-form.tsx      the rule form + live preview, hosted by v4 and v5
      changes.ts         describeChanges() — names what changed, not how many
      gauntlet.ts        the deck, the outcome classes, the grade ladder,
                         and the proposed fix for a card that leaks
      impact-arena.ts    the 1,440-situation sweep, movement, badges
      history.ts         undo — a snapshot stack, tested on its own
      readiness.tsx      the publish gate, hosted by v4 and v5
      command-bar.tsx    ⌘K, with the command list supplied by the host
      overview.tsx       the read-only reading surface
```

---

## Note on drift

The Figma libraries (`IDP · 2 Core`, v0.1.1) and the generated token file (v0.1.0) disagree on several values — most consequentially **danger**: Figma publishes `#e61e1e`, the token repo's light theme is `#d33a2c` (`#e61e1e` is its *dark* value). Figma also has text `#0d1218` vs `#12171e`, sunken `#f1f4f8` vs `#f5f7f9`, border `#d2dae3` vs `#d7dee4`, nav `#131922` vs `#141a22`.

This build uses the **token repo**, which declares itself the source of truth and is what the code consumes. Worth reconciling before either is cut to 1.0.
