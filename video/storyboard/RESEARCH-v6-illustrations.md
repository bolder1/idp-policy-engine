# Research v6 — explainer illustrations for the Policy Engine film (task R2)

14 Sep 2026. For the sixth cut. Scope: how identity/security vendors and premium SaaS
illustrate the abstract half of an access policy (a sign-in, a check, an outcome, rule
order), what to copy, what to avoid, and five build-ready briefs for inline-SVG cards
plus the placement rules that keep them off the control being discussed.

Hard constraints honoured throughout: light theme only, ground `#f2f4f7`
(`--ground` in `compose/compose.css`), 100 px caption band under the picture, no
mascot, no 3D tilt, orange brand `#eb5424` with slate text, DM Sans (loaded) or a
Google Font, everything drawable as HTML/CSS/SVG frame by frame.

---

## 1. What the references actually do

### 1.1 Identity / security vendors (docs and product pages)

**Microsoft Entra Conditional Access** — the canonical reference for this exact
concept. The overview page draws one triptych, *signals → decision → enforcement*:
left, a column of signal sources (user & location, device, application, real-time
risk); middle, the decisions (allow access, require MFA, block access); right, apps and
data. Text: "Conditional Access policies at their simplest are if-then statements:
**if** a user wants to access a resource, **then** they must complete an action", and a
policy "is an if-then statement of **Assignments** and **Access controls**". Assignments
= who / what / where (users and groups, target resources, network, conditions); access
controls = block, grant (require MFA, compliant device…), session. Icons are the
Microsoft flat monoline set: one hue (blue), flat fills, no gradients or light sources;
Microsoft's own icon rules say "include the product name somewhere close to the icon",
i.e. every glyph gets a text label. One thing to *not* copy: in Entra, when several
policies apply, *all* must be satisfied (assignments combine with AND). Our engine is
first-match, like Okta and Cloudflare — illustration 5 exists to make that difference
unmissable.

**Okta** — policies contain rules; "the rule at the top of your list is evaluated
first, and if the request doesn't meet that rule, the next rule in line is evaluated,
and so forth". "Every policy includes a system-level Catch-all Rule (priority 99) that
ensures an outcome if no other rules match"; best practice is restrictive rules at the
top and a catch-all that denies in production. Okta's help pages explain this with
prose and the numbered priority list itself — no diagram; the UI (a numbered table
with a greyed catch-all row at the bottom) *is* the illustration.

**Cloudflare Access / Gateway** — "policies are in order of precedence from top to
bottom of the list. Policies begin with precedence 1 and count upward"; "once a user
matches an Allow or Block policy, evaluation stops and no subsequent policies can
override the decision"; recommend "a catch-all Block policy at the lowest precedence".
Their one diagram is a left-to-right flowchart of policy *layers* (DNS → HTTP →
network → egress): rounded boxes, thin arrows, mono line, a single accent.

**Duo** — three pillars everywhere: *Trusted Users*, *Trusted Devices*, *Every
Application*; outcome vocabulary is three words: "Enforce MFA", "Bypass 2FA", "Deny
access". Marketing pages pair one flat icon with a two-to-three-word heading and a
sentence; no complex diagrams.

**JumpCloud** — "verify three key access points: a user's identity, the network
they're on, the device they're using"; outcomes allow / require MFA / revoke. Presented
as screenshots plus icon-and-heading trios.

**Firewalls (pfSense, AlgoSec, etc.)** — the same first-match model, always taught as a
vertical list with a packet "walking" the rules until one matches and an implicit
"deny rest" at the bottom; "specific rules before general".

Take-away for us: the concept diagram of this whole category is **one row, left to
right** (who/what arrives → the check → the outcome) and **one column, top to bottom**
(rule order). Every vendor labels every icon. Nobody uses more than one accent hue in a
concept diagram; feedback colours (green/red) appear only where the colour *is* the
meaning (allow/deny).

### 1.2 Premium SaaS (Linear, Stripe, Notion) — framing and restraint

**Linear** — screenshot-first: "the protagonist of every section" is real product UI
"framed in panels with 16px corners"; cards "use 12px corners with 1px hairline
borders"; accent (their lavender) is reserved for the mark, primary CTA, focus rings —
"never decoratively". Shadows are almost entirely absent on their dark ground; on a
light ground the equivalent is a hairline plus a very soft, low-alpha shadow.

**Stripe docs** — near-monochrome diagrams: rounded rectangles, 1 px strokes, thin
arrows, a single indigo used for the one thing being pointed at, labels in the body
typeface. State/lifecycle diagrams are boxes-and-arrows with the words *in* the boxes,
never icons alone.

**Notion** — the outlier: black hand-drawn line characters (Roman Muradov). Charming,
but a hand style; wrong for an enterprise IdP and not compatible with the console's
geometry. Not a reference for us.

**Mobbin pulls (web)** confirming the pattern:
- Basecamp "Two-factor authentication": three white tiles in a row, each a mono line
  glyph with one accent (red/green where it means something), a caption under each
  tile — the cleanest "explain a sign-in in three beats" reference found.
  https://mobbin.com/screens/18c11b8a-d902-455f-8af9-857f95c4a529
- Docusign passkey: a single mono line glyph in one accent above the copy.
  https://mobbin.com/screens/8aab44bc-87a7-4479-bcec-56e819e55ddf
- Mercury passkey: illustration sits in a soft inset panel *beside* the copy, not over
  it. https://mobbin.com/screens/d5566756-d5cd-4e4f-b6ca-76288389dd59
- OKX "Help protect our community": mono line shield glyph + numbered steps in a card.
  https://mobbin.com/screens/a43552a0-0f79-416f-97bd-25d979018ee6
- Twingate Default Policy: a lock glyph + "Default" label; requirement tiles with a
  one-line caption each. https://mobbin.com/screens/ee3532fb-20cc-4cc5-a2bf-02b081066caa
- Counter-examples (don't): Google Drive / Glassdoor passkey art — multi-colour flat
  clip-art; Zoho CRM — stock "person with giant phone" illustration. Both read as
  generic.

### 1.3 Iconography rules worth adopting verbatim

Lucide's design guide (the most-copied modern line set): 24 px canvas, 2 px centred
stroke, round caps and joins, 2 px corner radius on shapes ≥ 8 px, ≥ 2 px between
distinct strokes, low density, "remove unnecessary details". Phosphor's *duotone*
weight is the two-tone reference (a 20 % tinted fill under a mono outline) — that is
exactly how to mark the one highlighted element without adding a second hue.

### 1.4 Motion and duration (from motion systems, not guesswork)

- Carbon: entrance easing `cubic-bezier(0, 0, 0.38, 0.9)` (productive) /
  `(0, 0, 0.3, 1)` (expressive); exit `(0.2, 0, 1, 0.9)`; durations 150 ms small
  movement, 240 ms expansion/toast, 400 ms large expansion, 700 ms background dimming.
  "Larger changes = longer animations."
- Material 3: emphasized-decelerate `cubic-bezier(0.05, 0.7, 0.1, 1)`; transitions
  300–700 ms, component animations 100–300 ms.
- SVG draw-on (stroke-dashoffset) reads best at 0.6–0.8 s per path; stagger sibling
  elements 80–160 ms.
- Readability: about 2 s is the minimum for a 3–4-word label; an overlay must have
  both an entrance and an exit, and the exit should mirror the entrance (same distance,
  faster).
- Honest limit of this research: vendor *videos* could not be scrubbed frame by frame
  here; the motion numbers above come from published motion systems and SVG practice,
  and the on-screen-duration rule below is derived from the film's own spoken-line
  lengths (each conceptual line runs 3.5–6 s).

---

## 2. The house style for the five cards (one spec, used five times)

**Card.** 420 × 220, radius 16, fill `#ffffff`, 1 px border `--line` `#e4e8ec`,
shadow `0 12px 32px rgba(10,14,20,0.10), 0 1px 2px rgba(10,14,20,0.06)`. No gradient,
no spine, no decorative dot. Inner padding 24. The card is drawn as one inline `<svg
viewBox="0 0 420 220">` inside a positioned `<div>`; text is SVG `<text>` in DM Sans so
it scales with the card.

**Type.** Title: DM Sans 600 18/1.1, `--ink` `#212529`, letter-spacing −0.01em, at
(24, 36) baseline. Labels: DM Sans 500 17/1.15, `--ink-2` `#495057`. Small labels
(tags, "if nothing matches"): 13/1.1, 500, `--ink-3` `#646e79`. Every label ≤ 5 words.

**Glyphs.** Drawn on a 24-unit grid, stroke 1.75, round caps and joins, fill none,
rendered at 40 px (so ≈ 2.9 px on screen); connectors 2 px `--line-2` `#d3dae1`,
round caps; arrowheads 6 px filled `--ink-3`. Stroke colour for neutral glyphs is
`--slate` `#4a5560`. **The highlighted element** (one per card) is duotone: stroke
`--brand` `#eb5424`, fill `--brand-subtle-bg` `#fdeee9`, border `--brand-subtle-border`
`#f9cabb` where it is a chip. Feedback colours only where they *are* the meaning:
allow = `--pos-dot` `#128f43` on `--pos-bg` `#e8f7ee` / `--pos-bd` `#b6e3c6`;
deny = `--neg-dot` `#d01243` on `--neg-bg` `#fdf0f2` / `--neg-bd` `#f5c6ce`.

**The sign-in token.** A 14 px circle filled `--brand` with a 3 px white ring (the
same mark the intro already uses for a sign-in). It is the only thing that *moves* along
a path; everything else appears in place.

**Chips.** 40 px tall, radius 8, fill `#fff`, 1 px `--line`; glyph 24 px at x+12,
label at x+44. A person chip uses a 24 px initials avatar (13/600 on `--inset`
`#eef1f4`) instead of a glyph.

**Motion grammar (all five).**
- Enter: 360 ms, translateY 16 → 0 with opacity 0 → 1, `cubic-bezier(0.05,0.7,0.1,1)`.
- Inside: elements appear left→right / top→bottom; a glyph fades+rises 8 px over
  240 ms; a connector draws (dashoffset) over 300–400 ms; a label follows its glyph by
  120 ms; sibling stagger 100–160 ms. No bounce, no overshoot, no spin.
- Hold: until the spoken line ends; total on screen ≥ 3.5 s.
- Exit: 240 ms, opacity 1 → 0 with translateY 0 → 8, `cubic-bezier(0.2,0,1,0.9)`.
- One card at a time; a card never straddles a cut, a push or a chapter banner; a card
  never animates while the product itself is moving (schedule inside a `rec.settle()`
  hold, not across a dialog opening).
- Sound: reuse `pop` (soft) on the token's arrival only; nothing on labels.

Build note: the compositor already renders per-frame from a timeline, so each card is a
pure function `card(kind, t)` returning SVG with element opacities/offsets computed
from `t` (seconds since the card's start). No CSS animations, no timers.

---

## 3. The five briefs

Coordinates are in the card's 420 × 220 viewBox. `t` is seconds after the card's
entrance begins (the 360 ms rise is `t` 0.00–0.36 in every brief).

### 3.1 "Finance signs in to Workday"

Where it belongs: chapter 01, line `c1.2` ("Finance signs in to Workday every morning.
Let's protect that sign-in.") over the Policies list; also a candidate for the new
bite-size intro's first beat.

Composition: one row, left → right — person → policy shield → app tile — the category's
canonical triptych, in miniature.

Elements:
- Title at (24, 36): **Finance signs in to Workday**.
- Person glyph (Lucide `user`) 40 px, centre (70, 104), slate. Under it a tag pill
  64 × 22 at (38, 132), radius 6, fill `#fdeee9`, border `#f9cabb`, text **Finance**
  13/600 `--brand` — this is the card's duotone highlight.
- Connector A: line (98, 104) → (166, 104), 2 px `--line-2`, arrowhead at 166.
- Policy shield: a `shield` outline 44 px, centre (210, 104), slate, with three
  horizontal 2 px bars inside (the rules), 14 px long at y 96/104/112. Label under at
  (210, 152) centred: **The policy** (17/500 `--ink-2`).
- Connector B: (254, 104) → (322, 104), arrowhead at 322.
- App tile: 48 × 48, radius 10, fill `#fff`, 1 px `--line-2`, centre (350, 104); a
  monogram **W** 22/700 `--ink` (neutral tile, no third-party logo). Label under at
  (350, 152): **Workday**.
- The sign-in token (14 px, brand) travels A then B.

Motion (3 steps):
1. `t` 0.36–0.70: person fades/rises; the Finance tag pops 120 ms later.
2. `t` 0.70–1.75: connector A draws (400 ms) and the token glides along it; the shield
   draws on (500 ms) as the token arrives; the three bars tick in top→bottom (80 ms
   stagger); the token rests at the shield for 0.4 s.
3. `t` 1.75–2.40: connector B draws, the token glides to the tile; the tile and
   **Workday** fade in; a soft `pop`. Hold until the line ends; exit.

### 3.2 "Who"

Where it belongs: chapter 03, line `c3.3` ("Who starts as everyone this policy governs.
Let's narrow it.") while the Who section is spotlighted; also the intro's Who beat.

Composition: three chips stacked on the left, a brace gathering them into a tiny rule
card on the right whose *who* line lights up.

Elements:
- Title at (24, 36): **Who is it about?**
- Chip 1 at (24, 52) 196 × 40: `users` glyph + **Finance**.
- Chip 2 at (24, 104): `users` glyph + **Executives**.
- Chip 3 at (24, 156): initials avatar **PS** + **Priya Sharma**.
- Brace: a 2 px `--line-2` path from (244, 60) curving to a point at (262, 124) and
  back to (244, 188) — a right-hand `}`.
- Mini rule card: rounded rect 128 × 76, radius 10, fill `#fff`, 1 px `--line-2`, at
  (276, 86). Inside, three rows of "text" as 2 px bars: row 1 (who) 72 px long at y 104,
  row 2 (if) 56 px at y 124, row 3 (then) 64 px at y 144, x from 292. Row 1 is the
  duotone highlight: bar `--brand`, with a 12 × 12 `users` mini-glyph in brand at
  (292, 98) — the other two bars stay `--line-2`.
- Label under the mini card at (340, 188) centred: **One rule, for them** (17/500).

Motion:
1. `t` 0.36–0.84: chips slide in from x −12 with fade, stagger 160 ms (Finance,
   Executives, Priya).
2. `t` 0.90–1.40: the brace draws top → bottom (500 ms).
3. `t` 1.40–1.90: the mini card fades/rises; at 1.60 row 1 sweeps to orange left →
   right over 200 ms; the label fades in at 1.75. Hold; exit.

### 3.3 "If"

Where it belongs: chapter 04, line `c4.1` ("If is when the rule applies. Empty means
every sign-in that reaches it.") with If's empty state spotlighted; also `c4.2`.

Composition: the sign-in token on the left, three leaders fanning right to three
context chips (network, device, location), a check at the end of each row.

Elements:
- Title at (24, 36): **If: what the sign-in carries**.
- Token (14 px brand, white ring) at (52, 110); small label **a sign-in** 13/500
  `--ink-3` centred at (52, 136).
- Leaders: three 2 px `--line-2` quadratic curves from (60, 110) to the left edge of
  each chip: (104, 72), (104, 110), (104, 148).
- Chip 1 at (104, 52) 220 × 40: `wifi` glyph + **Office Network**.
- Chip 2 at (104, 90): `laptop` glyph + **Corporate managed**.
- Chip 3 at (104, 128): `map-pin` glyph + **Location**.
- Checks: 22 px circles centred at (360, 72), (360, 110), (360, 148) — fill
  `--pos-bg`, 1 px `--pos-bd`, tick `--pos-dot` 1.75 stroke. (Green is allowed here
  because the tick *means* "this check holds".)
- Caption at (24, 200) baseline, 13/500 `--ink-3`: **Every check must hold**. (True
  of top-level conditions in our engine — they combine with AND; groups are the
  AND/OR card's job, not this one's.)
- No orange except the token: the token *is* the highlight in this card.

Motion:
1. `t` 0.36–0.60: token pops (scale 0.6 → 1, 240 ms, ease-out only) with its label.
2. `t` 0.60–1.40: leaders draw (300 ms each, stagger 100 ms); each chip slides in 8 px
   from the left as its leader arrives.
3. `t` 1.40–2.10: ticks appear top → bottom (scale 0.6 → 1, 200 ms, stagger 160 ms);
   caption fades at 2.0. Hold; exit.

### 3.4 "Then"

Where it belongs: chapter 05, line `c5.1` ("Then is the decision. Allow the sign-in, or
deny it.") with the Outcome cards spotlighted; reprise possible on `c5.2`.

Composition: the token arrives from the left at a vertical hairline (the rule), three
lanes leave it to three outcome tiles; the token takes the middle lane — allow with a
second factor — which is the hero.

Elements:
- Title at (24, 36): **Then: the decision**.
- Token at (48, 118); hairline (the rule) 2 px `--line-2` from (112, 60) to (112, 176).
- Lanes: 2 px `--line-2` curves from (112, 118) to (250, 66), (250, 118), (250, 170);
  arrowheads at the lane ends.
- Tile A at y 66 (centre): 36 px circle fill `--pos-bg` border `--pos-bd`, `check`
  glyph `--pos-dot`; label at (300, 71) baseline: **Allow**.
- Tile B at y 118: 36 px circle fill `#fdeee9` border `#f9cabb`, `smartphone` glyph
  with a small check badge, stroke `--brand`; label: **Allow, with a second factor**
  (5 words) — the duotone highlight.
- Tile C at y 170: 36 px circle fill `--neg-bg` border `--neg-bd`, `x` glyph
  `--neg-dot`; label: **Deny**.
- Lanes A and C and their tiles sit at 60 % opacity once the token has chosen B.

Motion:
1. `t` 0.36–0.70: token and hairline appear (the hairline draws top → bottom, 300 ms).
2. `t` 0.70–1.40: three lanes draw (stagger 120 ms) and the three tiles+labels fade in
   in order A, B, C.
3. `t` 1.40–2.20: the token glides along lane B (500 ms); on arrival tile B's ring
   scales 1 → 1.06 → 1 once (300 ms) with a soft `pop`; A and C ease to 60 % over
   300 ms. Hold; exit.

### 3.5 "First match decides" (top to bottom)

Where it belongs: the card scene's last line `cs.7` ("Rules read top to bottom. The
first match decides…"), and again on the board at `c6.7` ("Order is the policy…").
Okta, Cloudflare and every firewall teach this the same way; only the token's fall is
ours.

Composition: a vertical stack of three rule rows with a guide rail on the left; the
token falls down the rail, passes rule 1 (no match), stops at rule 2 (match) and a
connector carries it right to the outcome; the default row waits underneath.

Elements:
- Title at (24, 36): **First match decides**.
- Rail: dashed 2 px `--line-2` (dash 4/6) from (88, 52) to (88, 190).
- Row 1 at (112, 52) 176 × 36, radius 8, fill `#fff`, 1 px `--line`: label **Rule 1**
  at x 128; a 14 px indicator circle at (100, 70) on the rail (stroke `--line-2`).
- Row 2 at (112, 100): **Rule 2**; indicator at (100, 118).
- Row 3 at (112, 148): **Default** with a 13/500 `--ink-3` sub-label **if nothing
  matches** at (128, 176); indicator at (100, 166).
- Outcome tile: 36 px circle centre (352, 118), duotone brand (`smartphone`+check),
  label under at (352, 152) centred: **Second factor** (13/500 `--ink-2`).
- Connector: 2 px `--line-2` from (288, 118) to (330, 118), arrowhead.

Motion:
1. `t` 0.36–0.80: rows slide in from x +12 with fade, top → bottom, stagger 100 ms;
   the rail draws (400 ms).
2. `t` 0.80–1.50: the token appears at (88, 52) and drops to row 1 (300 ms,
   ease-in-out); row 1's indicator becomes a short 8 px dash `--ink-3` ("no match") and
   the row eases to 55 % opacity; at 1.20 the token drops to row 2 (300 ms).
3. `t` 1.50–2.30: row 2's indicator fills brand with a white tick, row 2's border turns
   `--brand` (200 ms); the connector draws right (300 ms) and the outcome tile+label pop
   with a soft `pop`; row 3 stays at 55 % with its sub-label. Hold; exit.

---

## 4. Where a card may sit over the product

### 4.1 Geometry the rules are built on (from `compose/engine.js`)

Frame 1920 × 1080. `CAP_BAND` 100 → the caption band is y 980–1080. The window at rest:
title bar y 16–50, the app picture y 50–980, x 216–1704 (1440 × 900 app px at
s0 = 930/900 = 1.0333). So the side gutters are 216 px each — **a 420 px card cannot
live in the gutter; it always overlaps the picture**, which is why the rules below
exist. Board geometry (from `INVENTORY-2026-09-14.md`, app px → screen): left rail
80 px (screen 216–299); with the panel open the stage is 792 px (screen 299–1117) and
the Inspector panel 568 px (screen 1117–1704); the chain is centred in the stage, the
520 px card spanning screen ≈ 439–977. With the panel closed the stage is 1360 px and
the card spans ≈ 732–1270, leaving ≈ 433 px free columns on both sides.

### 4.2 The rules

1. **A card appears only on a conceptual line** — the five lines named above (plus at
   most one reprise each). Product lines (anything that names a control the cursor is
   on) get no card.
2. **The forbidden set F** for a card = the spotlight/focus rect padded 32 px ∪ any
   control the line *names* (if the line says "card", the chain card; "panel", the
   panel; "row", the list row) ∪ the caption band ∪ the chapter chip (top-left,
   34,34 → ~340 × 44) ∪ any callout box live at the time. The card must not intersect F.
3. **The card sits on the dimmed side.** A spotlight dims everything but its subject;
   the card goes over the dimmed region, on the side *opposite* the subject, so the
   viewer's eye moves subject → card → subject with nothing lit in between.
4. **Candidate anchors** (card top-left, in priority order; 32 px inset from the
   picture, bottom edge ≤ 948 so 32 px stay clear above the band):
   BR (1252, 728) · BL (248, 728) · right-centre (1252, 415) · left-centre (248, 415) ·
   TR (1252, 82) · TL (248, 82). Take the first that misses F and is farthest from the
   subject's centre. Never top-left when the chapter chip is showing.
5. **Fallbacks, in order:** scale the card 0.9 (378 × 198), then 0.8 (336 × 176; labels
   stay ≥ 13.6 px); if it still collides, use **shelf mode**: the window eases to
   s = 0.86 and slides left to x 24 (the same `xf {s, dx}` transform the push already
   uses), freeing a 616 px right column; the card centres in it at (1304, 415). Shelf
   mode returns over 400 ms when the card exits. Reserve shelf mode for the board with
   the panel closed; it should be rare.
6. **Timing lock.** Enter 0.25 s after the line's first spoken word; exit 0.3 s after
   its last word *or* at the next click, whichever comes first. Never across a cut,
   push or banner. One card at a time. Total per card 3.5–6 s.
7. **Never over live change.** A card is scheduled inside a hold (`rec.settle()`),
   never while a dialog, popover or the panel is opening or scrolling; if the product
   must move, the card exits first.

### 4.3 Anchor per illustration (with the current takes)

| Card | Line | Subject / lit area | Anchor |
|---|---|---|---|
| 1 Finance → Workday | `c1.2` | Policies list rows (top), cursor resting on **New policy** (top-right) | BR (1252, 728) over the empty lower list; the row later spotlighted is above it |
| 2 Who | `c3.3` | Who section in the panel (right) | BL (248, 728) over the dimmed stage; if the chain's default card intersects, left-centre |
| 3 If | `c4.1` | If's empty state in the panel (right) | BL, else left-centre — same column as card 2 for continuity |
| 4 Then | `c5.1` | Outcome cards in the panel (right, after scroll) | BL, else left-centre |
| 5 First match | `cs.7` (card scene) | the masked rule card, ~1000 px wide, centred; it shifts 210 px left for the annotation | right column: x = card right + 48, vertically centred on the card (the truth table's slot, after the table leaves) |
| 5 reprise | `c6.7` (board, panel closed) | the chain (screen ≈ 732–1270) | left column at 0.9×: (326, chain-centre − 99); shelf mode if the zoom is in |

### 4.4 Relationship to the card scene's AND/OR annotation

The AND/OR brackets and truth table (`cardAnno`) stay as they are — the owner called
them "perfect". The five cards use the same white surface, the same slate stroke and
the same single orange highlight, so they read as one family with the truth table; the
only difference is the truth table's blue **AND** / amber **OR** keyword colours, which
the cards never use (their single accent is orange, plus green/red only where a tick or
cross *is* the meaning).

---

## 5. Sources

- Microsoft Entra Conditional Access overview — https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview
- Build Conditional Access policies (Assignments / Access controls, AND across policies) — https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-policies
- Microsoft Entra architecture icons (usage rules) — https://learn.microsoft.com/en-us/entra/architecture/architecture-icons
- Okta: policy and rule prioritization (catch-all priority 99) — https://developer.okta.com/docs/guides/policy-rule-prioritization/main/
- Okta Security: Catch-All's and Canary Rules — https://sec.okta.com/articles/catchallsandcanaryrules/
- Okta policies and rules (OIE) — https://help.okta.com/oie/en-us/content/topics/identity-engine/policies/about-policies.htm
- Cloudflare One: order of enforcement — https://developers.cloudflare.com/cloudflare-one/traffic-policies/order-of-enforcement/
- Cloudflare: designing ZTNA access policies — https://developers.cloudflare.com/reference-architecture/design-guides/designing-ztna-access-policies/
- Duo: what is trusted access — https://duo.com/learn/what-is-trusted-access ; policy & control — https://duo.com/docs/policy
- JumpCloud conditional access — https://jumpcloud.com/platform/conditional-access
- pfSense firewall fundamentals (first match, deny rest) — https://docs.netgate.com/pfsense/en/latest/firewall/fundamentals.html
- Linear design notes (awesome-design-md) — https://github.com/voltagent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md ; Linear on its design refresh — https://linear.app/now/behind-the-latest-design-refresh
- Lucide icon design guide — https://lucide.dev/contribute/icon-design-guide
- Carbon motion — https://v10.carbondesignsystem.com/guidelines/motion/overview/
- Material 3 easing and duration — https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- SVG line animation (stroke-dashoffset) — https://css-tricks.com/svg-line-animation-works/
- Mobbin screens cited inline in §1.2.
