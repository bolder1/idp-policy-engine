# Policy builder v2 — "real tool" layout

Research + design for a second builder version, to sit beside the current one
behind a switch (same pattern as `ZonesPage` and `AuthMethodsPage`).

## What the references actually agree on

Read off Mobbin: **Tines Storyboard**, **Intercom Series**, **Customer.io
Journeys**, **Airtable Automations**, **V7 Workflows**. Different products,
same three zones — this is the convention, not a style choice:

| Zone | Width | Holds |
|---|---|---|
| **1 · Palette** | 200–260px, or a 56px icon rail that expands | The library of things you can *add*. Grouped and searchable. |
| **2 · Canvas** | flex | The flow. Dotted surface, zoom control pinned bottom-left. |
| **3 · Inspector** | 300–360px | Properties of the current selection, and nothing else. |

Specifics worth copying:

- **Tines** groups the palette by action type (Webhook, HTTP request, Send
  email, AI Agent, Condition, Send to story) and the inspector shows
  Status / Name / Description / Tags / Credentials — flat labelled fields, no
  tabs.
- **Tines** gives the inspector an explicit empty state: *"Select an action to
  inspect."* Ours currently has no such state.
- **Customer.io** makes the palette an accordion — Messages / Data / Delays /
  Flow control — so a long library stays one screen.
- **Intercom** and **Customer.io** both print live population on the node
  itself (`418 people in total`, `♟ 821`), not in a side panel.
- **Airtable** titles the right panel plainly: `Properties`.

## What is wrong with v1 today

- **No palette.** Conditions are added from inside the inspector, so the thing
  you build *with* lives inside the thing you build. Every reference separates
  them.
- **The inspector is 760px** — wider than the canvas it describes. The
  references sit at 300–360px because an inspector is a form, not a workspace.
- **Reusable objects are exiled** to a strip at the far right edge. They are
  palette content and belong in zone 1.
- **No empty state**: with nothing selected the right side is blank rather than
  telling you what to do.

## v2 layout

```
┌────────────┬──────────────────────────────┬──────────────────┐
│ PALETTE    │  CANVAS                      │  INSPECTOR       │
│ 240px      │  flex, dotted, zoom ↙        │  330px           │
│            │                              │                  │
│ Search     │   ● A user attempts sign-in  │  Rule 3          │
│            │        │                     │  ───────────     │
│ Conditions │   ┌────┴─────┐               │  Applies to      │
│  Network   │   │ 1 First… │──match──▶     │  Conditions      │
│  Device    │   └────┬─────┘               │  Outcome         │
│  Identity  │        │ no match            │  Checks (3)      │
│  Risk      │   ┌────┴─────┐               │                  │
│            │   │ 2 Rule 2 │──match──▶     │  (empty state:   │
│ Outcomes   │   └────┬─────┘               │   "Select a rule │
│  Allow     │        ⊕                     │    to inspect")  │
│  MFA       │   ┌────┴─────┐               │                  │
│  Deny      │   │ Default  │               │                  │
│            │   └──────────┘               │                  │
│ Reusable   │                              │                  │
│  Zones     │                              │                  │
│  Postures  │                              │                  │
│  Method…   │                              │                  │
└────────────┴──────────────────────────────┴──────────────────┘
```

- Palette items **drag onto the canvas** and also **click-to-append**, because
  drag alone is not keyboard-reachable.
- Inspector sections are flat and labelled (Tines), not tabbed.
- Impact and Checks stay, but move under the inspector's own scroll rather than
  occupying a fourth column.
- Zoom and "first match wins" legend pin to the canvas floor.

## Build notes

- New file `src/brand/screens/PolicyBuilderV2.tsx` + `builder-v2.css`; wrap both
  in `BuilderPage.tsx` with the `bzver` / `bviewswitch` switcher already used by
  Zones and Auth methods.
- Reuse unchanged: `diagnose()` / `impactOf()` / `outcomeSplit()` from
  `screens/diagnostics.ts`, the rule model in `data.ts`, and `MethodIcon` from
  `AuthMethodsV5.tsx` for method rows in the palette.
- Drag-to-reorder on the canvas is a semantic edit (rule order *is* the policy),
  so it keeps the existing "N unsaved" treatment.
- The 760px inspector width is set inline as `--inspect-w` on `.bbuilder__work`;
  v2 should not inherit that.

## Not yet decided

Whether v2 keeps the Spine/Branch toggle. Both exist because neither shape won
outright; the palette may make Branch redundant, but that is a call to make with
the layout in front of you rather than in advance.
