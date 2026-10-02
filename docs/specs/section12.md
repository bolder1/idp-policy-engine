
## 12. 30 Sep OWNER CHANGE — Sign-in tests page V5: a sentence bar on top, the canvas explains itself, vertical only, templates

Owner, verbatim intent (selecting the in-canvas form card, the vertical journey, and the board panel's sentence line
"Kavya Menon signs in to HRMS from Office network"): "Exclude this form part and put a horizontal bar at the top, not inside
the canvas. The canvas should hold an empty state with context on how sign-in tests works. Then the animations: first a good
FINDING animation — this is too quick; more intuitive; you can use a scanner loader with a gradient, like Google AI search or
Lovable, or take inspiration from others. Instead of the horizontal approach I like the vertical — it feels like a flow into
one thing. Lock People and Runs for now (hide them), we will work on them later. Focus on Try a sign-in and Saved sign-ins;
both should be a part of one thing: saved sign-ins are treated like TEMPLATES, and Try a sign-in is the canvas. Then the inner
cards look very bad — especially the Outcome and the Which policy part: do better in animation and readability. First we
focus on the main thing — testing sign-ins in a better way; then saved sign-ins. Next (later) the same inside the policy
builder." Also: no videos; he reviews in the browser; work faster. §12 supersedes §8.1–§8.2 (the in-canvas form) and the
page's tabs. §8.3–§8.6 (engine run, hierarchy, compaction) still hold unless §12 says otherwise. The in-policy builder is NOT
in scope now (its trace and panel stay as they are until the page is approved).

### 12.1 One surface, no tabs
- Page = head (← Policies crumb, "Sign-in tests", caption) + the SENTENCE BAR + the CANVAS. No tab bar. People and Runs are
  hidden (keep their code and tests; one constant/flag locks them off — not deleted). The Saved sign-ins TABLE tab is hidden
  too: saved sign-ins now live in the surface as templates (§12.5). Routes/params that opened a tab land on the surface
  ('saved' opens the templates picker).
- The page never scrolls; the canvas takes the free height and scrolls inside.

### 12.2 The sentence bar (above the canvas, full width, not inside it)
- A raised bar (surface-raised, border-subtle, radius-lg, el-low) holding ONE sentence of tokens, reusing
  testing/SignInSentence (a new additive `layout="bar"`): "[Person ▾] signs in to [Application ▾] from [Office network ▾]
  on [Windows 11 laptop · registered ▾] …". Empty tokens read "Choose a person" / "Choose an application". After the
  application is chosen, ONLY the facts that application's rules read appear as further tokens (slide in, 60 ms stagger),
  prefilled with sensible defaults; each extra token's popover carries a TipDot naming what reads it. Tokens wrap to a
  second line rather than scroll.
- Right end of the bar: "Saved sign-ins" (opens the templates picker, §12.5), Save sign-in (bookmark, after a run), and the
  orange **Run** (Play icon; the page's only orange; never disabled; Ctrl/⌘+Enter anywhere on the page). Run with a token
  missing: that token turns to the error state and says why in its popover/under the bar — no disabled button.
- Changing a token after a run re-runs at the edit pace (60 %) — Run is not needed again, but Run replays.

### 12.3 The canvas — vertical only
- Always the vertical journey (one centred column): sign-in → Which policy → the deciding policy with nested rules →
  Outcome. No horizontal layout on the page (drop laneFit/use-lane-fit from the page; keep the orientation support in the
  shared renderer — the policy builder may use it later).
- EMPTY STATE (before the first run of the visit): the canvas explains how a sign-in test works, as the same vertical flow
  drawn as ghost nodes on the dotted spine, each with ONE short line: "Sign-in — who, which application, from where, on
  what" → "Finds the policy — the policies on the application, in order; the first that covers the person decides" →
  "Checks its rules — top to bottom; the first rule that matches wins" → "Outcome — what the person gets". A soft light
  travels down the spine every few seconds (reduced motion: static). Under it: "Start from a saved sign-in" — template
  cards (§12.5). No other sentences.
- The sign-in node at the top of the journey is compact (face + name + group, app, fact chips) — the form is the bar, so the
  node has no pencil (clicking the node focuses the bar's first token); Save sign-in lives in the bar.

### 12.4 Motion and the inner cards
- FINDING (stage 1) is slower and reads as a search: ≈ 1.6–2.2 s for the finding stage alone (the whole run may grow to
  ≈ 5–6 s; Skip is always there; edit re-runs 60 %; reduced motion = settled at once). A SCANNER: the candidate policies
  appear as skeleton rows; a soft gradient sweep (accent-toned linear-gradient shimmer — the Google AI Overviews /
  Lovable feel; tokens via color-mix of --accent / --accent-soft / --brand, no hex/rgba) passes over each row as the engine
  checks it; the engine line's words carry a moving gradient text fill while working; each row resolves to its reason in
  plain words; the decider gets a gradient border light that travels once around it, then settles to the accent ring and
  "Decides". Only then does it open into its rules.
- WHICH POLICY, redesigned for readability: a clear card titled with the application ("Policies on HRMS"), rows in engine
  order with the order number, the policy name at 14 px, and the result in plain words right-aligned ("Switched off",
  "Kavya Menon is not in it", "Checked after …", "Decides"); losing rows quiet (colour tokens, ≥ 4.5:1); the decider row
  becomes the container of its rules (§8.6). No boxes inside boxes beyond the one container.
- RULES: keep §8.6 (compact one-liners naming the failing check, matched rule open with ✓ rows, Show all checks), with the
  same readability pass (row rhythm, one mark column, right edges aligned).
- OUTCOME, redesigned as the hero of the flow: the decision large (icon + words, e.g. "Allowed with 2FA", in DECISION_TONE
  via tokens), one line of what the person is asked for ("Asked for Google Authenticator" / "Blocked with 'Your device…'"),
  then "Decided by <policy> · Rule 2 — <rule name>" in secondary text, and "What they see" as a small preview of the
  screen the person gets (reuse testing/WhatTheySee / screens-of) collapsed by default. It lands with a spring and ONE soft
  gradient ring pulse; its lines fade in 60 ms apart. Every animation: motion props only (no CSS transform/transition on
  motion elements), reduced motion = final state.

### 12.5 Saved sign-ins as templates (after 12.1–12.4 are right)
- A saved sign-in is a TEMPLATE for a test: name, the sentence (person, app, facts), the expected result and its level.
- Where: (1) the empty canvas's "Start from a saved sign-in" row of template cards (the most useful 3–6: different
  outcomes and applications) with "All saved sign-ins"; (2) the bar's "Saved sign-ins" button opens a picker (popover or
  side sheet, 480–560 px) with search and cards grouped by application: name, person · app · facts, expected badge; a card
  click fills the bar and runs. Cards reuse the policy Templates look (TemplateCard family) where it fits.
- Saving: after a run, the bar's bookmark saves the current sentence as a template (name, expected result prefilled from
  the result). A card's ⋯: Rename, Change expected result, Delete (with Undo toast).
- A template's last result vs expected shows as the small Pass / Fail mark on its card (the result of its last run in this
  visit, or Not run yet).
