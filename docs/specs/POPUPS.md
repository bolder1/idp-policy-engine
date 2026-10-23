# Popups: the variant set and its edge cases

Owner, 22 Oct 2026, on the agent-switch confirm: *"make it more appealing and beautiful man, add icons, fix the overall experience, what is this very bland. and this is for all the popups."* Then, having seen four options and the survey behind them: **option C, the consequence rows, inheriting the toast's icon and tone language.**

## What was actually wrong

Not the missing icon. The survey found **34 dialogs on one `Modal` shell and 18 panels on one `Drawer`**, and:

- **eleven destructive confirms look identical** regardless of what they destroy — `ConfirmDelete`, the leave guard, four near-identical Discard dialogs, Unlink, Unassign, Switch reach;
- the few severity signals that exist **disagree with each other**: "Turn off" uses the orange brand button in three dialogs and red elsewhere;
- Cancel is ghost in most dialogs and secondary in six;
- the close × is 17px, 18, 16, 15 and 14 in different overlays;
- widths 440, 460 and 760 are off the `DIALOG_W` scale.

So the revamp is mostly a **consistency pass with one new variant**, not a new system per job.

## Two shapes, kept on purpose

**Owner, 22 Oct 2026, after seeing the options: keep BOTH.** "Give me some better options like option A as well … want to keep both for different use case." So the hero is not rejected — it is scoped.

The split is not taste. It is whether the dialog has a list to show:

| Job | Count | Shape |
|---|---|---|
| Discard, leave, turn off | 6 | **hero** — one sentence, no list, the moment is the point |
| A delete with nothing to list | — | **hero** — decided per press, not per call site (below) |
| A delete with a usage list, replace policy, switch reach, bulk remove | 10 | **rows** — the names are the reason to confirm |
| Short forms, pickers, reports | 16 | plain shell — a form has no severity |
| Review changes | 2 | unchanged — already owns the only head slot |

**A delete picks its own shape (23 Oct 2026).** The first version of this table
put every delete on the hero, and the next line said the hero cannot carry rows;
those two statements contradict each other for `ConfirmDelete`, which is the
richest confirm in the product and lists the policies that use the thing. The
code had quietly resolved it by leaving every delete on `rows`, so the hero
served only discard dialogs and no delete ever got the card. It is settled now
by content rather than by call site: `ConfirmDelete` passes `hero` when `live`,
`later` and `stuck` are all empty and `rows` otherwise, so a zone nobody uses
gets the spotlight and a zone four live policies depend on keeps the four names.
Note that `hero` DROPS `sections` and `rows` silently (`kit.tsx`), which is the
trap that makes this a per-press decision and not a prop a caller can set freely.

Centred hero copy caps at about 30 characters a line, so the hero **cannot** carry rows; that is the whole reason the two shapes exist rather than one.

Both ship as **one component with a `shape` prop** (`hero` | `rows`), so no dialog can invent a third look.

### Which hero
The reference's tint is a **glow, not a band**: it fades into the card with no hard edge. Four takes were drawn (band, spotlight, plinth, tone bar); the spotlight is the faithful one and costs ~90px of head rather than ~138px.

### The rules this bends, knowingly
- The concentric rings are decorative, against "no decorative dots". Drawn with a switch to see them off; the owner's call.
- The owner removed section and row icons from the Review dialog on 17 Sep 2026, and no design system surveyed recommends a decorative icon on a plain confirm (Material has an optional icon slot, Apple a caution symbol "used sparingly"). The tone mark here is therefore **not an ornament** — it carries severity, and it is the toast's existing mark, not a new one.
- Our radius scale stops at 8px; the reference reads soft partly because of ~16px corners. Adopting that is a system change, not a dialog one.

## The tone language, inherited not invented

From `toast-tone.ts` and `Shell.tsx:646`, unchanged:

| tone | icon | colour token |
|---|---|---|
| `success` | `CheckCircle2` | `--fb-positive-fg` |
| `removed` | `Trash2` | `--fb-negative-fg` |
| `warning` | `AlertTriangle` | `--fb-notice-fg` |
| `error` | `XCircle` | `--fb-negative-fg` |
| `info` | `Info` | `--fb-info-fg` |

The toast sets one `--toast-tone` variable per tone and colours its mark and timeline from it. Dialogs do the same with `--dlg-tone`. **No new tone, no new icon, no new colour.** `Callout`'s own five tones (`info | neutral | notice | negative | positive`) stay as they are for in-body callouts; the dialog head follows the toast because the toast is the system the owner named.

## The variant set: three, not seven

### 1. Confirm — the new variant
Covers **16 dialogs**: the 11 destructive confirms, 3 neutral consequence confirms, 2 blocked notices.

Anatomy: tone mark + title, body sentence, **optional consequence rows**, footer. The rows are the point — named things with a mark each, never a comma run or a bullet list:

```
Manufacturer and model        Removed
MAC address                   Removed
TPM ID                        Removed
and 3 more · 5 policies check fewer signals
```

Row marks reuse the existing pill family. The head tone takes the **worst** consequence in the list.

### 2. Work — a consistency pass, no new look
Covers **16 dialogs**: 7 short forms, 3 pick-then-save, 6 read-only reports. A form has no severity, so it gets **no tone mark**. What it gets is the consistency the survey found missing: one close-× size, Cancel always ghost, widths on the `DIALOG_W` scale.

### 3. Review — left alone
The 2 review dialogs already own the only `head` slot in the shell (the Before & after / List switch). They keep it.

**Drawers** keep their shell. The 10 form sliders follow Work's footer rules; the 6 detail panels and the guard page are unchanged. The guard page is the heaviest overlay in the product and is explicitly out of scope here.

### What collapses
The **five near-identical Discard dialogs** (`leave-guard`, `DeviceFingerprintV2`, `display-token-forms`, `BoardBuilder`, `PolicyBuilderMain`) become one Confirm at `tone="warning"`. That is five fewer things to keep in step.

## Edge cases

Ranked by what actually bites.

1. **No rows.** The confirm has nothing to list. The rows block must collapse entirely, not draw an empty bordered box. Where nothing is affected at all, question whether the confirm should open — `attachNote` already has the "nothing changes for users" case.
2. **One row versus forty.** Cap at **5** then one overflow line (`and 3 more`). A dialog is not a table; forty rows belong in the guard page.
3. **Two tones in one dialog.** Replace both *removes* access for one person and *moves* others. Per-row pills carry the difference; the head takes the worst. This is why the tone is not a single global flag.
4. **Long names.** Policy, rule and signal names are user-typed and unbounded. Rows truncate on the name, never the mark, with the full name reachable — `overflow-wrap: anywhere` is already the house answer in `.apol__nameline h2`.
5. **Unknown facts.** The evaluator answers `unknown` for custom attributes and hooks, and for "no person was given". A row must be able to say *not known* rather than imply a consequence the engine did not compute.
6. **Type-to-confirm still works, and the ladder now has a middle.** `ConfirmDelete` has `requireTyped`; the friction ladder is nothing → **tick** → typed word. BUILT 23 Oct 2026 (owner chose it as "T3"): `Confirm` takes an `ack` sentence, `asksForDeleteTick` decides the rung from `usage.ts`'s own `live`/`later`/`stuck` predicates, and the control is the kit's `.bx-tick` on a `role="checkbox"` button — the same box the device profile's enrolment rows use. One rung at a time: where the word is asked for, the tick is not also shown. The word stays a fixed `DELETE` and never the object's name, per the owner's 21 Sep 2026 ruling ("just type delete"). **Reachability, unresolved:** no seeded object hits the middle rung — every one is live (→ word), stuck (→ refused) or unused (→ nothing) — and the bulk-token trigger wired alongside it needs an unassigned token, which the seed also lacks. The rung is correct and type-clean but currently renders in no dialog; it needs a seed with a library object used only by drafts.
7. **Esc and scrim click equal Cancel.** Never the destructive action. `useDialogChrome` already wires this; the rows must not swallow the key.
8. **Rows are not interactive.** They are facts, not controls, so they stay out of the tab order. Focus goes to the panel, as now.
9. **Narrow widths.** At the 600/720 steps the pill wraps under the name rather than forcing horizontal scroll. The rail already overlays below 900.
10. **Reduced motion.** `Modal` animates with Motion props; honour `useReducedMotion`, and never put a CSS `transform` on a `motion.*` element.
11. **Hidden Browser pane.** `requestAnimationFrame` stops, so motion freezes and a closed dialog stays mounted. Not a product bug — do not chase it.

## Bugs found on the way, not part of this

- **The CommandBar has no stylesheet.** `bm__cmdscrim`, `bm__cmd`, `bm__cmdbar`, `bm__cmdlist` have no rule anywhere in `src`; only `.bm__cmdkbd` exists. Full edition only, so it may be shipping unstyled.
- **`MenuButton`'s popover is `position: absolute` inside its trigger** while `RowMenu`, `Picker`, `Tip` and `ConditionPopover` portal at fixed coordinates — so its menus can be clipped by any overflow container.
- Hard-coded scrim values instead of tokens: `create.css:522-537`, `kit.css:1063`.
