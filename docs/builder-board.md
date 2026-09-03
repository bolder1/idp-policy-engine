# The board — builder v2

A second builder over the same policy, the same store and the same evaluator.
Nothing about the engine changes. What changes is the shape of the work.

> **Open it** from a policy row's `⋯` menu → *Open in board*, or from the trail's
> toolbar. The board has a *Trail* button to go back. Both edit the same draft
> and publish through the same gate.

---

## What was asked, and what it turned into

| Asked for | Built as |
|---|---|
| Zapier-style workflow, cards only in the centre | **The chain.** A start node, one card per rule, a `+` on every connector, the pinned default at the end. The centre holds nothing else. |
| Inside a card, everything that happens in that rule | Each card reads WHEN as bracketed chips (`and` inside a bracket, `or` between them) and THEN as the sign-in journey it produces — `Password → Push or TOTP → ✓ · remembered 30 days`. |
| Miro-style board | The chain sits on a dot-grid stage you can pan (drag, wheel), zoom (⌘-wheel, `−` `+`, *Fit*) and read at any size. |
| Figma-like properties panel on the right | **The inspector.** Three tabs — *Rule · Check · Impact* — over collapsible sections with a `+` on the header where adding is the point. Nothing selected shows the policy and the **rule library**; a card selected shows that rule. |
| The WHEN made intuitive, using the space | Conditions are rows with the category's mark, a plain-English operator, and the right control for the value — chips for lists, pickers for library objects, a range for numbers, two clocks for time. Alternatives are lettered brackets, joined by *or*. Adding a condition opens the catalogue by component (Network · Location · Time · Device profiles · Risk · People · Groups · Custom · External hooks). |
| The WHAT beautified | The decision is one segmented choice — *Deny · Let in · Let in, then verify* — and everything beneath it is drawn as **the journey**: the steps the person will actually walk. Change a method and the journey redraws. |
| Rename the gauntlet | **Break-in test.** Thirteen sign-in attempts, seven hostile. The grade is a count of what got through. |
| Blast radius I can see, granular, interactive | **What changes.** Before → after over the 1,440 modelled situations: lanes that move, a field of dots you can hover and click to read *why that one moved*, the cohorts that moved, which rule wins what, and the guarantees that can be lost. |
| "Something is trying to fix them" without calling it AI | A failed break-in card offers **the rule that closes it** — derived, never guessed — with a preview of what applying it changes, before it is applied. Same for every linter finding that has a fix. |
| Animation, subtle | Cards keep their place with layout springs when reordered or inserted. *Try a sign-in* sends a token down the chain: each rule lights *missed* or *matched*, and the token lands on the card that decided. Lanes and dots animate between before and after. Everything honours reduced motion. |

---

## The three regions

```
┌ PolicyBar ────────────────────────────────────────────────────────────────┐
├ stage ─────────────────────────────────────────────┬ inspector 400px ─────┤
│ ↶ ↷ · Fit                      Try · Break-in B · What changes 216 · ▶   │ Rule │ Check │ Impact │
│                                                    │                      │
│  · · · · · · · · · · · · · · · · · · · · · · · · · │  ⬡ Block compromised │
│            ┌────────────────────┐                  │  ─ Name & why        │
│            │ ● A sign-in arrives│                  │  ─ When it applies + │
│            └────────┬───────────┘                  │     [A] Zone ∉ Office│
│                     ⊕                              │         and Device…  │
│            ┌────────┴───────────┐                  │     or               │
│            │ 1 Block compromised│ ● Ready          │     [B] Risk is High │
│            │ WHEN [A]…  or [B]… │                  │  ─ What happens      │
│            │ THEN ⛔ Deny       │                  │     ⛔ Deny ▸ Let in… │
│            └────────┬───────────┘                  │  ─ Checks (1)        │
│                     ⊕                              │  ─ Reach             │
│                    …                               │                      │
│            ┌────────┴───────────┐                  │                      │
│            │ ⌂ Nothing else → 1 factor │            │                      │
│            └────────────────────┘                  │                      │
│                                     ⤢  −  100%  +  │                      │
└────────────────────────────────────────────────────┴──────────────────────┘
```

**The stage** is `.bb__stage` — an `overflow:hidden` viewport over `.bb__world`,
which carries one `translate()` + `scale()`. The chain is ordinary flow layout
inside the world, so cards never need coordinates and connectors are CSS.
Reorder is a pointer drag on the index grip, live, with layout springs.

**The inspector** never scrolls the board and the board never scrolls the
inspector. It is 400px because the WHEN editor needs a row to hold a mark, an
operator and a value control side by side; 240 (Figma's width) would stack them.

---

## What is shared, and deliberately not copied

| Module | Used for |
|---|---|
| `history.ts` | undo / redo — same keys, same limit |
| `diagnostics.ts` | `diagnose`, `shadowedBy`, `impactOf` — the linter and reach |
| `simulate.ts` | `walk` for the trace, `decide` for the sweeps |
| `gauntlet.ts` | the deck, grading, `proposeFix` / `applyFix` |
| `impact-arena.ts` | `sweep`, `compare`, `badges`, `SITUATIONS` |
| `predicate-prose.ts` | every sentence a rule is read back as |
| `changes.ts` | the unsaved-changes bar names what changed |
| `builder-dialogs.tsx` | Review & publish |
| `kit.tsx`, `picker.tsx` | buttons, toggles, tabs, pickers |

`rule-form.tsx` is **not** hosted here. The inspector's WHEN and WHAT editors
are new, because their whole reason to exist is a different shape — a 400px
column of property rows rather than a 720px sheet. They write the same
`Rule` fields.

---

## Names, and why

- **Break-in test**, not gauntlet. "Gauntlet" is a metaphor that has to be
  explained; a break-in test says what it does and what the number means.
- **What changes**, not blast radius. The question an administrator asks
  before publishing is *what will this do* — the answer is a before/after, and
  "blast radius" makes a routine edit sound like an incident.
- **Try a sign-in**, not test. Test implies pass/fail; this is a rehearsal you
  watch.
- **Let in / Let in, then verify / Deny** for `1fa / 2fa / deny`. The old
  labels named factor counts; these name what the person experiences.
