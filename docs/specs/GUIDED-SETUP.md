# Guided setup (was "Describe it") — v1 spec, 19 Oct 2026

Owner decisions of 19 Oct 2026 (they override older Describe rulings where they differ):

1. **Name.** "Describe it" becomes **Guided setup**: the canvas door says **Start guided setup**, the panel title is **Guided setup**. (Market check: "Describe it" is Microsoft's name for a text-prompt flow; Google pairs Basic/Advanced, Cloudflare Builder/Editor; "templates" already means whole-policy presets here.)
2. **Scope.** It works on **any App Access policy that is not the system policy**, draft or live. Its changes are ordinary board edits: unsaved until **Save policy** runs the checks. Nothing is written straight to the stored policy — not the audience (never written: Who belongs to rules, 14 Oct ruling), and applications go through the same path the start node's Applications pane uses.
3. **Input.** **Picks and forms only.** No free-text box, no sentence reader in the loop. (Text may come back later behind its own flag.)
4. **Placement.** Opens on the **left**; a switch in its header moves it to the **right**, or shows it **beside the rule panel** (Guided setup left + the rule inspector right). The choice is remembered (localStorage, wrapped in try/catch).
5. **Entry.** One compact door on the canvas above the view dock (`DescribeMagic.tsx`, already built): plain at rest, gradient edge on hover/focus/selection; the selected card is named in it and is the context Guided setup opens on. The chooser card stays hidden (`DESCRIBE_CARD = false`).
6. **Two admins.** The basic admin builds a rule in a few clicks and saves; the power admin builds by hand on the canvas and the inspector (unchanged). Guided setup is the basic lane.

## What the panel shows (top to bottom)

- **Header (48 px):** mark + "Guided setup", the side switch (an icon button with a small menu: "On the left", "On the right", "Beside the rule panel"), ×.
- **Context:** what the next action applies to — a chip "New rule" or "Rule 2 · Contractors in India" (the selected card), with × to go back to "New rule". Selecting a card on the canvas while the panel is open sets it.
- **Result (the latest action only):** the fold "Understood" (no step count) then **one plain-English line per decision** it made, each led by a coloured **DecisionMark** (Allow with 2FA = KeyRound on the positive tint, Allow on 1 factor = ShieldCheck on positive, Deny = Ban on negative — `EngineJourney.tsx` mapping), with **AppLogo** before every app name and **Face** before every group/person: e.g. "(k) Everyone signing in to ▣ HRMS now needs a second factor." Undo (ghost, `Undo2`) on the latest line only. Colour appears only here.
- **History:** earlier actions as muted lines (grey marks, no Undo, no controls); after 3, older ones fold into "Earlier changes".
- **Next step card (exactly one, docked, outside the scroller):**
  - Context **New rule** → the **New rule form** (`GuidedRuleForm.tsx`; the approved mock of 19 Oct 2026). **Four section rows**, kept order Applications → What happens → Who → Conditions, each ONE ROW at rest: a 20 px state mark (answered = a grey tick; empty or default = a dashed ring with a plus, its words muted), the label (fixed width), the value with its marks, a chevron. Values: Applications = logo + name, two side by side only when both fit whole, else the first and "+N" (all on hover); What happens = the decision's coloured DecisionMark + its words; Who = a face + the first name, then "and N more" (default "Everyone"); Conditions = Globe / MonitorSmartphone / Gauge + the short name ("India", "Corporate devices", "High risk"), fitted the same way (default "Any place, any device"). A press (Enter, Space) opens a row in place, one at a time (`aria-expanded`); Esc closes it back to its row. Open: Applications and Conditions are chip fields in the Who field's shape (`pick-combo.tsx`: chips inside the field, a portalled searchable list; no chip row outside); What happens is three full-width rows (coloured mark, name, gloss — "Password, then a second factor" / "Password only" / "Refused, with a message"), a radio group, the pick tinted in its own decision tone with a tick; Who is the **Access checks identity combo** (IdentityCombo via `who-combo.tsx`: Users | Groups switch, faces, ranked search, multi-select, no cap, "Everyone" as the empty answer). Conditions offer every zone and profile, hold one zone and one profile at most, keep kind order (zone, profile, risk) with short names in their chips, and stand down for a Deny. Under the rows, the **sentence card**: the rule as one sentence with its marks inline (a face for the first of who, a logo for the first application, "and N more" named on hover, the DecisionMark before the outcome, condition icons; one "only": "only from India, on Corporate devices, and deny at high risk") and the ink **Add rule**, disabled until an application is chosen. The flag-off Describe keeps `DescribeQuick.tsx`.
  - Context **a rule** → **quick actions for that rule**: What happens as the form's choice rows, compact (one line, no gloss; the current one tinted in its own decision tone with a tick; arrows move, Space or Enter writes), "Only from {zone}", "Only on {profile}", "Deny at high risk", Change who (WhoCombo), and **Delete rule** (neutral; red only inside the confirm).
  - Always at the card's foot: **Everyone else** with the same compact choice rows (the policy's last row), and **+ Add a rule** (sets context to New rule).
- **Staged play** (kept): an action plays the "picked" tempo — step lines tick spinner → tick every ~280 ms with logos/faces, the board is written on the canvas beat (hold/commit), then the fold and the plain lines. Stop / Esc finishes at once. Reduced motion lands at once.

## Model (answers first, no reader)

- A form submission builds **DescribeAnswers with origin `picked`** and composes rules with the existing `compose` from `create/describe-model.ts`, through two new opt-in options (callers keep today's defaults):
  - `catchAll: 'card'` — Everyone with no condition is a **rule card named "Everyone"**, placed last among rules (the owner's "Add rule must visibly change the canvas"); the last row then shows "Not reached" where it applies.
  - `only: 'per-rule'` — "Only from X" / "Only on Y" writes the rule **and** its refusal for the same who (negated condition → Deny), so "only" is enforced.
- **Each Add rule is a new rule** (its own who; never pooled, never replaces another rule's who). Quick actions patch the selected rule in place. Deny-at-high-risk is its own Deny rule for the same who.
- **Order:** denies first; named people before Everyone; the Everyone card last; never produce PE103/PE104.
- Every action is **one board history entry** (Undo/Redo in the bar work), and the panel's Undo reverts the latest action.
- The canvas **only ever changes on the canvas beat**; nothing is written before.

## Flags

`GUIDED_SETUP = true` (in `board/describe-stage.ts` beside `DESCRIBE_STAGED`, `DESCRIBE_CARD`, `DESCRIBE_BAR`). Off = today's Describe panel and wording.

## Rules that always hold

Sentence case; buttons verbs, labels nouns; no sentences explaining the UI; never "AI", "assistant", "login"; 12 px type floor (`--fs-xs|sm|md|lg` only in describe css); one orange button per view (Save policy) — Add rule is ink, selection is blue/grey; tokens only; Motion props for animation, never a CSS transform on a motion element; honour reduced motion; one pill family; numbers once per view.
