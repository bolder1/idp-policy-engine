
## 14. 30 Sep OWNER CHANGE — Sign-in tests uses the POLICY BUILDER'S layout

Owner, verbatim intent (screenshots of the builder: collapsed icon rail, the builder bar "← Policies › HRMS access from
corporate offices · Inactive … Try a sign-in · Discard · Save draft · Save policy", the dotted full canvas with the chain
"A sign-in arrives at HRMS → 1 In a corporate office (who / if / then) → Nothing else matched", and the right Inspector panel
"1 In a corporate office · Who (Groups, People) · If (Network zone in zone Corporate offices, + Add) · Then (Allow / Deny,
First factor, Second factor …) · Save rule"): "Can we use the same layout we use in the policy builder — full canvas, the
left side collapsed, the same header, then the full canvas and the form inside the canvas as we have there. It should feel
like we are using the same builder for tests as well. No need to do much on the front-end side — just fix the content
according to whatever we have in Sign-in tests." Supersedes §12.1–§12.2's page chrome and sentence bar; §12.3's empty
state content (approved), §12.4 motion, §13 (three nodes, board cards, conflicts) all hold inside this layout.

### 14.1 Chrome
- The rail COLLAPSES to icons exactly as it does when the builder opens (reuse the builder's mechanism; restore on leave).
- The builder's TOP BAR (the same component/classes as BoardBar/.bbtop): "← Policies › Sign-in tests" on the left (no
  status pill, no rename pencil); on the right a secondary "Saved sign-ins" (the picker) and nothing orange (Run lives in
  the panel foot, like Save rule). Page head/caption and the crumb row go (the bar carries them).
- The rest of the page is the builder's full dotted CANVAS (same stage, background and bottom dock: fit + zoom; no
  undo/redo, no Expand all unless it is meaningful) with the builder's right PANEL floating inside it.

### 14.2 The right panel = the sign-in form (the Inspector's chrome and grammar)
- Same floating panel as the rule Inspector (header row, scrolling body, sticky foot, the ><  collapse and grip if they
  come for free). Header: "Sign-in" (or the saved sign-in's name when one is loaded).
- Body sections in the Inspector's section grammar (icon + section title, then rows):
  - Who — the Person row (a picker: real people with their groups on the second line; groups too — §13.3).
  - Application — the application picker (logos).
  - Where and on what — ONLY the facts the chosen application's rules read, each a row in the Inspector's condition-row
    look (attribute · value picker): Network (preset or IP), Place, Device (preset + details), Time, Risk; prefilled with
    sensible defaults; a TipDot names what reads it. Rows slide in when the application is chosen.
  - "Use a saved sign-in" as a quiet row/link at the top of the body (opens the Saved sign-ins picker; loading one fills
    the form and runs).
- Foot: the orange "Run" (never disabled; a missing person/application shows its error under that row; Ctrl/⌘+Enter)
  and, after a run, "Save sign-in" (secondary) beside it.

### 14.3 The canvas
- Before the first run: the approved "How a sign-in test works" empty state, centred in the canvas beside the panel; its
  "Choose a person" button opens the panel's Person picker.
- A run draws a vertical chain in the builder's visual language: the builder's START pill ("A sign-in arrives at GitHub
  Enterprise") → the PERSON node → the POLICY node → the OUTCOME node, joined by the builder's spine (§13.2 for what each
  node holds). The policy node's rules are the builder's RuleCards (read-only trace variant). The chain animates in as the
  engine runs (finding → rules → outcome, ≈ 3–4 s, Skip, reduced motion = settled) and the canvas keeps the active node in
  view. Clicking a rule card opens that rule in its policy's builder (existing route) — never edits here.
