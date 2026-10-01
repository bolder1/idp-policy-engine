# Xecurify console rebrand — guideline

The rebrand is a new visual language for the IdP console, copied from the live
product at `login.xecurify.com/moas/admin/customer/home` and applied while the
**Rebrand** switch in the top bar is on. It changes how the console looks, never
what it does. The current look stays exactly as it is when the switch is off.

This file is the reference for every rebrand change. When a screen and this file
disagree, fix the screen.

---

## 1. How it is switched

| | |
|---|---|
| Switch | `BrandSwitch` in the top bar (`src/brand/BrandSwitch.tsx`) |
| State | `data-brand="rebrand"` on `<html>`, stored as `idp.brand` in local storage (`src/brand/brand-mode.ts`) |
| Styles | `src/brand/rebrand.css`, imported last in `src/main.tsx` |
| Scope | Every rebrand rule starts with `[data-brand='rebrand']` (tokens use `:root[data-brand='rebrand']`) |

**Rules for changes**

- Visual changes go under the rebrand scope. Do not restyle the current look.
- Copy changes — page one-liners, section one-liners, tooltip text, headings —
  apply to both looks. Words are not a theme.
- Genuine bugs (clipped content, unreachable tooltips, broken focus) are fixed in
  the base files, because they are bugs in both looks.
- No behaviour changes: no new options, no changed defaults, no model changes.

---

## 2. Four rules

1. **The live console's materials.** White page, `#f8f9fa` tiles, `#dee2e6` field
   edges, the Bootstrap grey ramp for text, DM Sans with 14px content.
2. **One blue for state.** `#0d6efd` is the console's blue. It marks links, text
   buttons, labels and every active or selected state: tabs, chips, switches,
   ticks, chosen options, the selected card and focus. Orange is kept for the one
   primary action and the navigation's active edge.
3. **Space and fill separate things, not lines.** No borders on pills, callouts,
   cards, list boxes or dialog heads. A line stays only where content scrolls
   under something (a dialog footer), where a field needs an edge, or where the
   edge itself is the message (a condition with no value).
4. **One answer per component.** One pill, one control height per size, one
   tooltip, one radius per kind of object. Do not add variants or options.

---

## 3. Tokens

### Colour

| Role | Token | Value | Use |
|---|---|---|---|
| Page | `--surface-page` | `#ffffff` | Page ground |
| Tile | `--surface-sunken` | `#f8f9fa` | Cards, table head band, row hover |
| Inset | `--surface-inset` | `#f1f3f5` | Neutral pills, secondary buttons, switch track, segmented tabs |
| Hairline | `--border-subtle` | `#eef0f2` | Row dividers, dialog footer |
| Field edge | `--border-default` | `#dee2e6` | Inputs, pickers, search |
| Strong edge | `--border-strong` | `#ced4da` | Checkbox box, hover on a field |
| Ink | `--text-primary` | `#212529` | Titles, values |
| Secondary | `--text-secondary` | `#495057` | Labels, table head |
| Tertiary | `--text-tertiary` | `#5c636a` | One-liners, captions |
| Muted | `--text-muted` | `#646c75` | Hints, units, empty values (4.5:1 on all three grounds) |
| Blue | `--blue` | `#0d6efd` | Links, active marks, switch on, focus ring |
| Blue strong | `--blue-strong` | `#0a58ca` | Blue text on a blue tint |
| Blue soft | `--blue-soft` | `#e7f1ff` | Blue label pills, selected option, selected card |
| Primary action | `--rb-cta` | `#cc4b1d` | The one primary button per view (the console's orange, deepened for a 4.5:1 label) |
| Danger | `--int-danger-bg` | `#dc3545` | Confirming button inside a destructive dialog only |

Status tints (fill / text), no borders:

| Meaning | Fill | Text |
|---|---|---|
| Positive (active, allowed, configured) | `#e8f5ee` | `#146c43` |
| Notice (monitor, low balance, needs attention) | `#fff6e0` | `#7a5a00` |
| Negative (denied, error, empty balance) | `#fcebec` | `#b02a37` |
| Neutral (draft, system, off) | `#f1f3f5` | `#495057` |
| Label (category, new, default, info) | `#e7f1ff` | `#0a58ca` |

Categories are labels, not states: every category chip is blue.

### Type

One family, DM Sans. One scale:

| Role | Size / weight | Colour |
|---|---|---|
| Page title (H1) | 20 / 700 | ink |
| Section title (H2) | 16 / 600 | ink |
| Group title (H3) | 14 / 600 | ink |
| Body, values, controls | 14 / 400 | ink |
| Field label | 14 / 500 | ink |
| One-liner, caption | 14 page · 13 section / 400 | tertiary |
| Table head, small label | 13 / 500 | secondary |
| Pill | 12 / 500 | by meaning |

No uppercase labels. No letter-spacing on labels. Sentence case everywhere.

### Geometry

| | Value |
|---|---|
| Control height | sm 30 · md 36 · lg 40 |
| Radius | 4 checkbox · 6 controls, pills, tooltips · 8 cards, menus, head bands · 12 modals |
| Table | head 44 · row 52 · cell inset 16 |
| Elevation | none at rest; menus and popovers `--el-high`; dialogs `--el-overlay` |

---

## 4. Components — one spec each

**Button.** Primary (orange, white label), secondary (grey fill, no edge), ghost
(text, grey hover), danger (red, only to confirm a destructive dialog). Height 36,
small 30. 14px / 500, small 13px. One primary per view; everything else is
secondary or ghost. Destructive triggers are secondary, never red.

**Icon button.** Square, transparent, grey hover. Always labelled (the label is the
accessible name and the tooltip). Pressed state: blue soft fill, blue icon.

**Link.** Blue `#0d6efd`, no underline at rest, darker on hover.

**Pill.** One geometry: 12px / 500, padding 2 × 8, radius 6, no border, one line
with ellipsis. Colour by meaning from the tint table above. No dots on a tinted
pill. A pill is never a button; a clickable thing is a chip.

**Filter chip.** Grey fill at rest, blue soft fill and blue text when on, radius 6,
no border. A count sits inside in a white capsule.

**Field** (input, picker, search, stepper). White, 1px `#dee2e6`, radius 6, height
36. Hover edge `#ced4da`. Focus edge `#86b7fe` with a blue halo. Label above, 14 /
500. Hint under, 13px muted. Placeholder `#6c757d`.

**Inline error.** The field edge turns `#dc3545`; one sentence under it in 13px
`#b02a37` that says what is wrong and how to fix it. Never a toast for a field
error, never a banner for one field.

**Switch.** Off: grey track `#dee2e6`, no edge. On: blue. White knob with a small
shadow. A switch always has a visible or accessible label.

**Checkbox tick.** 16px box, `#ced4da` edge, radius 4. Ticked: blue fill.

**Tabs.** Two kinds only. *Line tabs* divide a page into sections: 40px, 14 / 500,
tertiary text, chosen tab blue text with a 2px blue bar on a hairline. *Segmented
tabs* switch a control among controls: grey track, white thumb.

**List and table.** No outer box. A grey head band (`#f8f9fa`, radius 8, 44px,
13 / 500 secondary). Rows 52px, separated by one hairline. No vertical lines. Row
hover `#f8f9fa`. The row menu is the last column.

**Card / tile.** `#f8f9fa` fill, no border, radius 8, padding 16. A card never
holds another card. **Selected card**: blue soft fill and a blue edge — the live
console's selected card.

**Section.** A heading and its content, separated from the next section by space
(24px). No box around a section.

**Dialog and drawer.** No rule under the head. The footer keeps one hairline
because the body scrolls under it. Modal radius 12. A configuration opened from a
drawer is a page pushed inside that drawer, with Back.

**Menu / popover.** White, hairline `#eef0f2`, radius 8, `--el-high`. Hovered item
grey fill; chosen item blue soft fill with blue text.

**Tooltip.** One tooltip: dark `#212529`, white 13px text, padding 8 × 10, radius 6,
max width 280. Opens on hover, focus and touch; closes on Escape. The trigger is
the `?` mark (16px grey circle, blue on hover) or the control itself. Never a
native `title` attribute as the only way to the text. Every tip must be reachable
by keyboard.

**Callout.** Tint by meaning, no border, radius 6, padding 10 × 14, an icon and at
most two sentences. Info callouts are blue.

**Empty state.** An icon, one sentence that says what will appear here, and one
action. No illustration panels, no boxed empty areas.

**Navigation rail.** Stays as the live console draws it: dark ground, orange active
edge and orange current sub-item (with weight 500 so it does not rely on colour
alone). The "New" badge is blue.

---

## 5. Hierarchy

Every page, section and step is built the same way, top to bottom:

1. **Page** — H1 title, then a one-liner, then the primary action on the right.
2. **Section** — H2 title, an optional one-liner, then its content.
3. **Group** — H3 title inside a section, no one-liner.
4. **Steps** — a multi-step flow shows "Step 2 of 4" and the step's title. Number
   things only when the order is real.

Spacing between levels: 24px after the page head, 24px between sections, 12px
between a section title and its content, 8px between a toolbar and its list.

---

## 6. Copy

**One-liners.** At most two lines. Say what the page or section does *for the
admin*, and carry a real number from the data where there is one.

- Good: "12 policies decide every sign-in. The first one that matches wins."
- Good: "3 of 11 methods need setup before they can be switched on."
- Not: "Use this page to manage your policies." (describes the UI, carries nothing)

**Tooltips.** One or two sentences holding the caveat or the reason. The page states
the fact; the tooltip explains it.

**Labels and buttons.** Sentence case. A button says exactly what happens ("Save
zone", "Create policy"); the confirmation says it happened ("Zone saved").

**Errors.** What went wrong and how to fix it. No apologies, no codes on their own.

---

## 7. Don't

- A border on a pill, a callout, a tile or a list box.
- A card inside a card, or a bordered section inside a bordered panel.
- Uppercase or letter-spaced labels.
- A second primary button in one view, or orange on anything but the primary
  action and the rail edge.
- A native `title` as a tooltip, or a tip only a mouse can open.
- A new variant, size or colour that this file does not list.
- A sentence on the page that explains the interface.
