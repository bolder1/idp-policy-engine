# DESIGN v6 — the sixth cut, implementation spec

One design. Three agents build from this without asking. Sources: RESEARCH-v6-conventions.md (R1),
RESEARCH-v6-illustrations.md (R2), RESEARCH-v6-constraints.md (R3), and the code as it stands on
14 Sep 2026 (`compose/engine.js`, `lib/recorder.mjs`, `lib/edl.mjs`, `storyboard/takes-v2.mjs`,
`storyboard/lines.mjs`, the fifth-cut takes in `.work/light/capture/`, and the console's
`src/brand/screens/board/*.tsx`). Where this document and a report disagree, this document wins.

Owner's brief, distilled: intro = the product name and one bite-sized sentence, then the AND/OR
showcase; outro = minimal, light, premium, no gradients; small explainer illustrations whenever we
explain a concept rather than the product; the main focus is creating a policy, clear and to the point.

Non-negotiables: 1920×1080, 30 fps, light theme only; every slide is `background: transparent` so
the compositor's own ground (`#bg`) is the only ground on screen; subtitles unchanged in the 100 px
band (y 980–1080); no mascot, no 3D tilt, no device frame, no mesh, no grid plane, no glow, no conic
or linear gradient anywhere, no `easeOutBack`; DM Sans only (already loaded); everything is
HTML/CSS/SVG drawn per frame as a pure function of the frame number.

Film after this cut (expected): intro 8.4–8.8 s · card scene ≈ 35 s · chapters 01–05 as filmed
(≈ 208 s, re-captured for the insets) · board ≈ 68 s · save ≈ 27 s · outro 6.6–6.9 s → ≈ 6 min 00 s.

---

## 0. Vocabulary

- **app px** — the console's 1440×900 viewport (the recorder measures rects in app px).
- **screen px** — the 1920×1080 frame. At rest the app picture is x 216–1704, y 50–980
  (`sx = 216 + 1.0333·ax`, `sy = 50 + 1.0333·ay`); title bar y 16–50; caption band y 980–1080.
- **card mode** — the take shows only the tracked rule card, masked and enlarged (≤ 1000×850,
  centred on (960, 515)); `look.card.blend = 1`.
- **line** — a spoken sentence with an id in `lines.mjs`; `rec.say(id)` starts it, `rec.settle()`
  waits for it. Caption and voice come from the same id.
- **cue** — on a slide, `params.cues[id] = { at, dur }` (seconds from the slide's start;
  `dur = spokenEnd + 0.3`).
- **beat** — 0.6 s (music at 100 BPM).

---

## 1. TOKENS

Everything below is a console value (`console-theme.css` over `tokens.css`, the filmed
`idp.brand='current'`) or the compositor's own `compose.css :root`. Nothing new is invented.

### 1.1 Colour (light)

| role | value | where it comes from |
|---|---|---|
| ground | `#f2f4f7` + dot grid `rgba(33,37,41,.085)` 26 px, drifting `(t·6, t·3) % 26`, slate glow top-left `rgba(74,85,96,.10)`, brand glow bottom-right `rgba(235,84,36,.06)` | compose.css `#bg` — never repainted by a slide |
| surface | `#ffffff` | `--surface-page` |
| sunken / inset | `#f8f9fa` / `#eef1f4` | `--surface-sunken` / `--surface-inset` |
| ink / ink-2 / ink-3 (muted) | `#212529` / `#495057` / `#646e79` | `--text-primary` / `--text-secondary` / `--text-muted` |
| slate (neutral glyph stroke) | `#4a5560` | `--accent` (selection is slate, never orange) |
| hairline / control edge | `#e4e8ec` / `#d3dae1` | `--border-subtle` / `--border-default` |
| brand orange | `#eb5424` | `--brand` — one orange per frame: the mark, a 1.5 px hairline, or the sign-in token |
| brand tint / tint border | `#fdeee9` / `#f9cabb` | `--brand-subtle-bg` / `--brand-subtle-border` — never carries text |
| brand carrying white type | `#c2431c` | `--brand-on-fill` — not used by the film (we never put white type on orange) |
| **AND** (info) | fg `#155e91` · bg `#e9f2fd` · border `#b9d6f5` · stroke `#1189d4` | `--fb-info-*` — exactly what `.bb__ifkw.is-and` prints |
| **OR** (notice) | fg `#7d5800` · bg `#fdf6e0` · border `#f0dfa4` · stroke `#b07a00` | `--fb-notice-*` — exactly what `.bb__ifkw.is-or` prints |
| true / allow (positive) | fg `#14663a` · bg `#e8f7ee` · border `#b6e3c6` · dot `#128f43` | `--fb-positive-*` |
| false / deny (negative) | fg `#a5142b` · bg `#fdf0f2` · border `#f5c6ce` · dot `#d01243` | `--fb-negative-*` |
| veil (card lighting) | `rgba(242,244,247,.72)` | the ground colour, translucent |
| spotlight dim | `rgba(33,37,41,.35)` | replaces `rgba(14,20,28,.5)` — the film is light |
| window shadow | `rgba(22,32,44,.20)` blur 70 offset 26 (card mode: blur 50 offset 18) | engine `drawStage`, unchanged |
| tag / pill shadow | `rgba(10,14,20,.28)` | `--tag-shadow`, unchanged |

Green and red appear only where the colour *is* the meaning (a tick, a cross, true/false, Allow/Deny).
AND is only ever info-blue, OR only ever notice-amber, and both only in the AND/OR beat.

### 1.2 Type — DM Sans, nothing else

| role | size / line-height / weight / tracking | colour |
|---|---|---|
| Display, intro ("Policy Engine") | 128 / 1.0 / 600 / −0.025em | ink |
| Display, outro | 112 / 1.0 / 600 / −0.025em | ink |
| Sub-claim (intro), claim line (outro) | 40 / 1.25 / 400 / −0.005em; outro 36 / 1.25 / 400 | ink-2 |
| URL | 30 / 1.2 / 500 / 0 | ink-3 |
| Part label (card scene pill) | 26 / 1 / 600 / −0.015em | ink |
| AND / OR label (card scene) | 26 / 1 / 700 / +0.06em, uppercase | AND fg / OR fg on their tints |
| AND / OR label caption | 20 / 1.2 / 500 | ink-2 |
| Truth panel title | 24 / 1.1 / 700 / −0.01em | ink |
| Truth panel expression chips | 19 / 1.3 / 500 | ink on inset `#eef1f4`, 1 px `#d3dae1` |
| Truth panel keywords | 14 / 1 / 700 / +0.06em uppercase | AND / OR fg on tint, 1 px tint border |
| Truth table | 18 / 1.2 / 500; header 600 ink-3 | ink; true/false 700 in positive/negative fg |
| Inset title | 18 / 1.1 / 600 / −0.01em | ink |
| Inset label | 17 / 1.15 / 500 | ink-2 |
| Inset small label | 13 / 1.1 / 500 | ink-3 |
| Caption (unchanged) | 29 / 1.3 / 500 / −0.01em | ink on white pill |

Tabular numerals on. No gradient text, no shimmer, no text-shadow.

### 1.3 Radii, elevation

Radii: chip 4 · control 6 · container 8 · card 12 (rule card, inset card, truth panel) · part-label
pill 10 · caption pill 16 (unchanged) · pill 999. The engine's card-mode mask radius becomes the
card's own: `12 · m.s` (see §7 B-4.6).

Shadows: `--el-low 0 1px 2px rgba(33,37,41,.05)` · `--el-mid 0 2px 8px rgba(33,37,41,.07)` ·
`--el-high 0 8px 24px rgba(33,37,41,.12)` · `--el-overlay 0 16px 48px rgba(33,37,41,.22)` ·
inset card `0 12px 32px rgba(10,14,20,.10), 0 1px 2px rgba(10,14,20,.06)`. Only what floats casts a shadow.

### 1.4 Motion

Named curves (verified in R1/R2):

| name | cubic-bezier | use |
|---|---|---|
| `OUT-B` | (0, .4, 0, 1) | entrances that move (rise 8–24 px) |
| `OUT-P` | (.4, 1, .6, 1) | fades in |
| `INOUT-B` | (.4, 0, 0, 1) | moves, masks, the shelf, the camera-like slides |
| `IN-P` | (.6, 0, .8, .6) | exits of type |
| `DEC` | (.05, .7, .1, 1) | a heavy object arriving (inset card, rule card) |
| `EXIT-C` | (.2, 0, 1, .9) | exits of overlays (Carbon exit) |

Durations: display type in 0.7 s, sub 0.6 s, type out 0.45–0.6 s (exits faster than entrances);
inset enter 0.36 s / exit 0.24 s; inside an inset 0.24–0.5 s with 0.10–0.16 s staggers; card light
0.35 s (part change: veil out 0.20 s then in 0.35 s); annotation brackets 0.5 s; truth row 0.3 s;
shelf in 0.5 s / out 0.4 s; the rule card's rise-in 0.6 s. Translate 8–24 px; scale never below
0.93 and never above 1; no overshoot, no bounce, no blur (the engine's push stays as is).

Implementation rule: no CSS keyframes with timers, no `Date.now()`, no `Math.random()`. Every value
is computed from `t` in `update()` / `drawOverlays()`. (`driveSlide` pauses CSS animations, but the
new slides use none.)

---

## 2. INTRO — slide `hook` (8.4 s, may stretch to 8.8 with the voice)

Owner: agent A. Files: `compose/slides-v4.js`, `compose/slides-v4.css`. The slide keeps the name
`hook` and registers as `window.SLIDES3 = { hook, outro }` (slides-v3.* are unlinked and deleted).

### 2.1 What is on screen

Picture 1920×980 (band below). Section `.slide--hook` is `background: transparent`; `#bg` shows through.

| element | spec | position (screen px) |
|---|---|---|
| Lockup `img.v4-lockup` | `/app/xecurify-logo.png`, 452×121 rendered at 0.8× = **362×97**, unaltered (no filter, no recolour) | left 779, top **280** (→ 280–377), centred |
| Name `.v4-name` | "Policy Engine", 128/1.0/600, tracking settles −0.010em → −0.025em | line box top **472**, height 128 (→ 472–600), centred |
| Sub `.v4-sub` | "Who may sign in, on what conditions, and what they must prove." 40/1.25/400 ink-2 | top **660** (→ 660–710), centred, max-width 1600 |

Clear space above the name ≥ the lockup's height (377 → 472 = 95 px). Group 280–710, centre 495 (picture
centre 490). Nothing else. No hairline, no chips, no picture of the product.

### 2.2 Timeline (t = seconds from the slide's start; `cue = params.cues['hk.1']`; `E = cue.at + cue.dur`)

| t | what | curve |
|---|---|---|
| 0.0–0.6 | ground only (the edl's `tin 1.0` fade is invisible on a transparent slide) | — |
| 0.6–1.3 | lockup: opacity 0→1, translateY 12→0 | OUT-P / OUT-B |
| 1.2–1.9 | name: opacity 0→1, translateY 20→0, letter-spacing −0.010em→−0.025em | OUT-P / OUT-B / OUT-B |
| **1.2** | VO `hk.1` starts (caption in the band as usual) | `lead: 1.2` |
| 2.4–3.0 | sub: opacity 0→1, translateY 12→0 | OUT-P / OUT-B |
| 3.0 → X | hold. Nothing moves. | — |
| X = max(7.0, E + 0.2) | sub exits: opacity 1→0, translateY 0→−10, 0.45 s | IN-P |
| X+0.10 → X+0.60 | name exits, same move | IN-P |
| X+0.20 → X+0.70 | lockup exits, fade only, 0.5 s | IN-P |
| X+0.70 → end | bare ground (≥ 0.6 s), then **cut** | `out: 'cut'` |

Sequence item (agent C writes it, agent A's slide reads it):
```js
{ kind: 'slide', slide: 'hook', dur: 8.4, lines: ['hk.1'], lead: 1.2, tail: 1.4, music: 'board', out: 'cut',
  sfx: [{ type: 'thump', at: 1.2, gain: 0.45 }] }
```
`dur` is a minimum: `dur = max(8.4, 1.2 + cue.dur + 1.4)`. With `hk.1` ≈ 5.7 s spoken this is ≈ 8.6 s.
`update()` must key the exits to `E` (not to fixed seconds) so a longer voice never gets cut off.

### 2.3 Hand-over to the card scene

The intro ends on bare ground and cuts. The card take (`mode: 'card'`, `prelude: 0.6`) then draws the
finished rule card **rising in over 0.6 s** — the engine does this in `renderFrame`'s prelude branch
(§7 B-4.7): alpha `easeOut(k)`, translateY `(1−k)·16`, no overlay, frame 0. So the shadow, radius and
picture are the engine's own and there is nothing for the slide to reproduce. The intro no longer
uses `COMPOSE.cardHold`. Sound: `edl.mjs` replaces the prelude `swoosh` with
`{ type: 'thump', t: item.start + 0.30, gain: 0.35 }`.

### 2.4 Spoken line

`hk.1` — **"Policy Engine. Who may sign in, on what conditions, and what they must prove."** (77 chars,
two full stops, ≈ 5.7 s at the measured 13.5 chars/s). The sub-claim on screen is the same sentence
minus the name, so eye and ear agree.

---

## 3. OUTRO — slide `outro` (6.6 s, may stretch to 6.9 with the voice)

Owner: agent A (slide), A (edl seam), B (engine alpha, §7 B-4.8). Follows the `save` take, which gets
`out: 'fade'`: the window dissolves to ground over 0.8 s while the outro starts underneath (`tin 0.8`).

### 3.1 What is on screen (mirrors the intro so the bookends rhyme)

| element | spec | position |
|---|---|---|
| Lockup `.v4-lockup` | 0.8× = 362×97, unaltered | left 779, top **250** (→ 250–347) |
| Name `.v4-name--outro` | "Policy Engine" 112/1.0/600/−0.025em | top **442** (→ 442–554), centred |
| Line `.v4-line` | "Access policy, in plain English." 36/1.25/400 ink-2 | top **614** (→ 614–659), centred |
| URL `.v4-url` | "idp.xecurify.com" 30/1.2/500 ink-3 | top **710** (→ 710–746), centred |

No "· by miniOrange" (the lockup already says it). No button, no rule, no chips, no icons.

### 3.2 Timeline (t from the slide's start)

| t | what | curve |
|---|---|---|
| 0.0–0.8 | the save take's window fades out (engine, `look.alpha = 1 − easeInOut(p)`); the slide shows nothing yet | INOUT |
| 0.6–1.3 | lockup: opacity 0→1, translateY 12→0 | OUT-P / OUT-B |
| **1.0** | VO `out.1` | `lead: 1.0` |
| 1.0–1.7 | name: opacity 0→1, translateY 16→0, tracking −0.010 → −0.025em | OUT-P / OUT-B |
| 2.2–2.8 | line: opacity 0→1, translateY 10→0 | OUT-P / OUT-B |
| 3.4–4.0 | URL: opacity 0→1, translateY 8→0 | OUT-P / OUT-B |
| 4.0 → end | **hold. Nothing moves, nothing fades.** The music's `release 2.6` rings under it. Last frame held. | — |

Sequence item:
```js
{ kind: 'slide', slide: 'outro', dur: 6.6, lines: ['out.1'], lead: 1.0, tail: 0.6, music: 'outro',
  sfx: [{ type: 'thump', at: 1.0, gain: 0.4 }] }
```
`dur = max(6.6, 1.0 + cue.dur + 0.6)` ≈ 6.9 s. The edl's forced last-item fade (tout 1.2, scale, blur)
is **removed**: the last item ends on a held frame (`tout 0`, `outKind 'cut'`).

### 3.3 Spoken line

`out.1` — **"Access policy, in plain English. Policy Engine, by Xecurify."** (60 chars, ≈ 5.0 s).

---

## 4. CARD SCENE — take `card` (≈ 35 s; budget 37)

Owner: agent C (take, lines), agent B (engine/recorder events), agent A (edl sfx already generic).
Filmed in card mode on the **finished** rule "Finance — off the office network". Nothing is edited
on camera: the rule is built dry in the prep, the take is holds and events only.

### 4.1 Prep (dry, unfilmed) — `cardScene()`

As today (New policy `WALK_POLICY` → Workday SAML → Create → Start from scratch → wait for the
Inspector → let the toast go → **Expand cards** → `noTour`), then, still dry, the whole rule:
Rule name `RULE`; Who: Add people → Finance, Executives, People → Priya Sharma → Save 3 selected;
If: Add condition → Network zone → not in zone → "office" → Office Network → closePop; Add → Add
condition group → Choose a condition → Device profile → does not match → "corporate" → Corporate
managed → closePop; group Add condition → Network zone → in zone → "anonym" → Anonymizers →
closePop; group joiner → `or`; Then: Allow (it is already 2fa) → Prove it with → Specific methods →
Methods accepted → miniOrange Push, TOTP Authenticator → click the Then heading → Remember this
device on → Days 14 → click `.bb__second__head`. Then `rec.dry = wasDry`, `hold(0.9)`,
`rec.track('.bb__card:not(.is-terminal)', '.bb__stage')`, `rec.cut()`.

Measure the parts once, after the cut (the card is static from here):
```js
const row = (re) => c.locator('.bb__ifplain .bb__ifrow.is-cond').filter({ hasText: re })
rec.cardParts({
  title: await rec.rectOf(c.locator('.bb__cardhead')),
  who:   await rec.rectsOf(row(/Finance|Executives|Priya/)),            // Rect[] — two rows
  cond:  await rec.rectOf(row(/Office Network/)),
  first: await rec.rectOf(c.locator('.bb__ifrow.is-cond').first()),   // top of the AND bracket
  group: await rec.rectOf(c.locator('.bb__ifgroup').first()),
  block: await rec.rectOf(c.locator('.bb__if').first()),
  then:  await rec.rectsOf(c.locator('.bb__ifrow').filter({ has: c.locator('.bb__ifkw', { hasText: /^then$/ }) })
                     .or(c.locator('.bb__ifaction'))),                   // Rect[] — the `then` row + the action row
})
```
(On a rule that holds a group, `whoEditable` is false, so the who-conditions are drawn as
`.bb__ifrow.is-cond` rows inside member A's `.bb__ifplain` — that is where "Who" lives on this card.)

### 4.2 Beats

Lines are ≤ 100 chars; estimates use 12.5 chars/s for stop-heavy lines. `wordTime(id, re)` is the
recorder helper (§7 B-1) returning the onset of the first word matching `re`, in seconds from the
line's start.

| # | line id → text | on the card (events) | ≈ s |
|---|---|---|---|
| 0 | — | compositor prelude 0.6 s: the card rises in. Take: `hold(0.6)` on the still card. | 1.2 |
| 1 | `cs.1` **"One rule, one card. Who, if, then."** | `cardLight('parts')` at say: no veil; three label pills **Who · If · Then** appear beside the who rows, the cond row and the then row, stagger 0.15 s. `settle(0.3)`. | 3.5 |
| 2 | `cs.2` **"Who: Finance, Executives, and Priya Sharma."** | `cardLight('who')`: veil over the card except the two who rows; label "Who". `settle(0.3)`. | 3.8 |
| 3 | `cs.3` **"If: the sign-in is not from the Office Network."** | `cardLight('cond')`: only the Office Network row lit; label "If". `settle(0.3)`. | 4.0 |
| 4 | `cs.4` **"And a group: a device not Corporate managed, or an Anonymizer network."** | `cardLight('group')`: the group lit; label "If". `settle(0.3)`. | 5.8 |
| 5 | `cs.5` **"Outside the group, everything must hold. That is AND. Inside it, one is enough. That is OR."** | `cardLight(null)`; `cardAnno(true, 'and')` at say → card slides 210 px left, the outer bracket + **AND** label grow, the truth panel fades in (expression + headers, rows at 28 %). At `hold(wordTime('cs.5', /^Inside/))` → `cardAnno(true, 'both')`: the inner bracket + **OR** label grow; the OR keyword in the expression lights. `settle(0.4)`. | 8.0 |
| 6 | `cs.6` **"One of them: true. Both: true. Neither: false."** | `truthStep(2)` at say (rows 1–2 light together: yes/no, no/yes → true); `hold(wordTime('cs.6', /^Both/))` → `truthStep(3)`; `hold(…/^Neither/)` → `truthStep(4)` (no/no → false). Each lit row tints the expression's parenthesis group positive/negative for 0.6 s. `settle(0.5)`. | 4.5 |
| 7 | `cs.7` **"Then: allow, with a second factor."** | `cardAnno(false)` at say (brackets and panel leave 0.5 s, the card slides back); `hold(0.5)`; `cardLight('then')`: the `then` row + action row lit; label "Then". `settle(0.4)`. | 3.6 |
| 8 | `cs.8` **"Now, for real, for Workday."** | `cardLight(null)` at say; `hold(0.3)`; `cardMode(false)` (mask opens to the whole window over 0.9 s, whoosh); `hold(1.2)`; Reset zoom (hint false) if present; `settle(0.6)`; `hold(0.4)`. Then the take pushes into chapter 01. | 4.3 |

Total ≈ 35 s. If the measured cut runs over 37 s, drop `cs.6` (rows then light on `cardAnno 'both'`
at 0.35 s stagger); nothing else is negotiable.

End asserts (unchanged in spirit): title = `RULE`; 1 `.bb__ifplain` + 1 `.bb__ifgroup`;
2 `.bb__ifgroup .bb__ifrow.is-cond`; group joiner reads `or`; then chip reads "Second factor";
journey names miniOrange Push and "Remembered 14 days".

### 4.3 Card lighting — how it draws (engine, §7 B-4)

- Element `#ov-card-veil` (SVG, z 17, before `#ov-anno`): one `<path fill-rule="evenodd">` filled
  `rgba(242,244,247,.72)`: outer = the card box `m.rect(look.card.rect)` rounded `12·m.s`; one hole
  per lit rect, padded `6·z`, rounded `8·z`. A second `<path fill="none">` strokes each hole in
  `#eb5424` at 0.9 opacity, 1.5 px — the frame's one orange.
- Part → holes: `title→[title]`, `who→who[]`, `cond→[cond]`, `group→[group]`, `then→then[]`,
  `parts→[]` (no veil, labels only), `null→[]`.
- Labels: three fixed elements `#ov-partlbl-who / -if / -then` (`.ov-partlbl`: white, 1 px `#e4e8ec`,
  radius 10, padding 9px 14px, 26/1/600 ink, `--el-high` shadow, no dot). Visible when their part is
  lit (`cond` and `group` both use the "If" label) or in `parts` mode. Position: right edge at
  `hole.x − 22`, vertically centred on the (first) hole; enter fade + rise 10 px 0.3 s OUT-B, exit 0.2 s.
- Easing: `light[f] = { part, k }`; on a part change k runs 1→0 over 0.20 s (old part), then 0→1 over
  0.35 s (new part). Drawn only while `look.card && look.card.blend > 0.5` and `anno < 0.05`.

### 4.4 The AND/OR annotation — better, and honest to the product

Keep the geometry (`drawAnno`: outer bracket left of the card from `first` to the group's foot;
inner bracket right of the group; labels beside; truth panel in the right column, 560 wide, at
`cardR.right + 22`). Change:

1. **Colours** → the card's own tints: brackets stroke `#1189d4` (AND) / `#b07a00` (OR), width 2.5;
   `.ov-anno__lbl b` = fg on tint with 1 px tint border (`#155e91` on `#e9f2fd`/`#b9d6f5`; `#7d5800`
   on `#fdf6e0`/`#f0dfa4`), 26/700/+0.06em; caption under each label 20/500 ink-2 ("all of these
   must hold" / "any one of these").
2. **Two stages**: `cardAnno { on, stage: 'and' | 'both' }`. `cardTrack` keeps two eased floats
   `annoAnd`, `annoOr` (0.5 s each). Stage `'and'` drives the outer bracket, the AND label, the card's
   210 px shift and the panel; `'both'` adds the inner bracket and the OR label. `on:false` eases both
   down. An event without `stage` means `'both'` (backwards compatible).
3. **Truth panel** (`anno.js` `truthHtml(rule)`, data-driven with this rule as the default):
   - title "How the rule reads"
   - expression: `[Finance, Executives or Priya Sharma] AND [not on Office Network] AND ( [unmanaged device] OR [Anonymizer network] )`
     — chips 19/500 on inset, keywords as tinted pills. While `annoOr < 1` the OR keyword and the
     parenthesised pair sit at `lerp(.45, 1, annoOr)` opacity.
   - sub-line: "Outside the group, every check must hold. Inside it, one is enough."
   - table: header **Unmanaged device · Anonymizer network · The group**; rows `yes/no → true`,
     `no/yes → true`, `yes/yes → true`, `no/no → false`. Unlit rows at 0.28 opacity, no tint. A lit
     row: opacity 1 (0.3 s OUT-P) and its result cell tinted (`#e8f7ee`/`#14663a` or `#fdf0f2`/`#a5142b`).
   - `truthStep { rows: n }`: rows 1..n are lit; the row's lighting time is the first event with
     `rows ≥ i`. For 0.6 s after a row lights, the expression's parenthesis group takes the row's
     result tint at 0.5 opacity, so the expression and the table move together.
4. Panel surface: white, 1 px `#e4e8ec`, radius 12, `--el-overlay` shadow, padding 22/24/20.

Nothing else in the annotation changes: it stays "perfect" in shape, corrected in colour, and it
now arrives in the order the narrator says it.

---

## 5. EXPLAINER INSETS

Owner: agent B (`compose/explain.js`, `compose/explain.css`, engine hooks, recorder call), agent C
(the calls in the takes). Five illustrations; each appears once, on the one line that explains the
concept, never on a line that names a control.

### 5.1 The inset card (one spec, used five times)

420×220 screen px. `#fff`, 1 px `#e4e8ec`, radius **12**, shadow
`0 12px 32px rgba(10,14,20,.10), 0 1px 2px rgba(10,14,20,.06)`, padding 24. One inline
`<svg viewBox="0 0 420 220">` per card; text as SVG `<text>` in DM Sans so it scales with the card.
Title 18/600 ink at baseline (24, 36). Labels 17/500 ink-2; small 13/500 ink-3; every label ≤ 5 words.
Glyphs: Lucide geometry on a 24 grid, stroke 1.75, round caps/joins, no fill, drawn at 40 px, stroke
slate `#4a5560`. Connectors 2 px `#d3dae1`, round caps, arrowheads 6 px filled ink-3. **One** duotone
highlight per card: stroke `#eb5424` on fill `#fdeee9` (border `#f9cabb` where it is a chip). Green
only for a tick that means "holds/allow", red only for "deny". The **sign-in token** — a 14 px circle
filled `#eb5424` with a 3 px white ring — is the only thing that travels; everything else appears in place.
Chips: 40 tall, radius 8, `#fff`, 1 px `#e4e8ec`, glyph 24 px at x+12, label at x+44; a person chip
uses a 24 px initials avatar (13/600 ink on `#eef1f4`).

Motion grammar (per card): enter 0.36 s translateY 16→0 + opacity, DEC; inside: glyph fade + rise 8 px
0.24 s, connector draw-on (dashoffset) 0.30–0.40 s, label 0.12 s after its glyph, siblings 0.10–0.16 s
apart; token glide 0.4–0.5 s INOUT-B; hold until the line ends; exit 0.24 s opacity 1→0, translateY
0→8, EXIT-C. No bounce, no overshoot, no spin. One soft `pop` (gain 0.5) at entrance + 0.30 s, nothing else.

### 5.2 The five compositions (coordinates in the 420×220 viewBox; `t` = seconds since entrance)

**`finance-workday`** — title **Finance signs in to Workday**. Row, left→right: `user` glyph centre
(70,104) slate; under it a tag 64×22 at (38,132) radius 6, `#fdeee9`/`#f9cabb`, text **Finance** 13/600
`#eb5424` (the highlight). Connector A (98,104)→(166,104) with arrowhead. Shield 44 px centre (210,104)
with three 2 px bars 14 long at y 96/104/112 ("the rules"); label **The policy** centred at (210,152).
Connector B (254,104)→(322,104). App tile 48×48 radius 10 `#fff`/1 px `#d3dae1` centre (350,104) with
monogram **W** 22/700 ink; label **Workday** at (350,152). Motion: 0.36–0.70 person + tag; 0.70–1.75
A draws, token glides, shield draws, bars tick top→bottom (80 ms), token rests 0.4 s; 1.75–2.40 B
draws, token glides to the tile, tile + label fade in (pop). Hold; exit.

**`who`** — title **Who is it about?** Chips at (24,52) `users` **Finance**, (24,104) `users`
**Executives**, (24,156) avatar **PS** **Priya Sharma**, each 196×40. A right brace `}` 2 px `#d3dae1`
from (244,60) to a point at (262,124) back to (244,188). Mini rule card 128×76 radius 10 at (276,86)
with three 2 px bars from x 292: row 1 (who) 72 long at y 104, row 2 56 at y 124, row 3 64 at y 144;
row 1 is the highlight (bar `#eb5424`, 12 px `users` mini-glyph in brand at (292,98)). Label **One
rule, for them** centred at (340,188). Motion: chips slide in from x −12, stagger 0.16 s (0.36–0.84);
brace draws top→bottom 0.5 s; mini card fades/rises 1.40–1.90; row 1 sweeps orange left→right 0.2 s at
1.60; label at 1.75.

**`if`** — title **If: what the sign-in carries**. Token at (52,110), small label **a sign-in** at
(52,136). Three 2 px leaders from (60,110) to the left edge of chips at (104,52) `wifi` **Office
Network**, (104,90) `laptop` **Corporate managed**, (104,128) `map-pin` **Location** (220×40 each).
Checks: 22 px circles at (360,72/110/148), `#e8f7ee`/1 px `#b6e3c6`, tick `#128f43` 1.75. Caption
**Every check must hold** 13/500 ink-3 at (24,200). The token is this card's only orange. Motion:
token pops (scale 0.6→1, 0.24 s) with its label; leaders draw 0.3 s each, stagger 0.1 s, each chip
slides in 8 px as its leader lands (0.60–1.40); ticks top→bottom 0.2 s, stagger 0.16 s (1.40–2.10);
caption at 2.0.

**`then`** — title **Then: the decision**. Token at (48,118); a vertical hairline (the rule) 2 px
`#d3dae1` from (112,60) to (112,176). Three 2 px lanes from (112,118) to (250,66), (250,118), (250,170)
with arrowheads. Tile A at y 66: 36 px circle `#e8f7ee`/`#b6e3c6`, `check` glyph `#128f43`; label
**Allow** at baseline (300,71). Tile B at y 118: `#fdeee9`/`#f9cabb`, `smartphone` glyph with a small
check badge, stroke `#eb5424`; label **Allow, with a second factor** (the highlight). Tile C at y 170:
`#fdf0f2`/`#f5c6ce`, `x` glyph `#d01243`; label **Deny**. Motion: token + hairline (0.36–0.70, the
hairline draws top→bottom 0.3 s); lanes draw, stagger 0.12 s, tiles + labels A, B, C (0.70–1.40);
token glides along lane B 0.5 s; on arrival tile B's ring scales 1→1.06→1 once (0.3 s, pop) and A and
C ease to 60 % (1.40–2.20).

**`first-match`** — title **First match decides**. Rail: dashed 2 px `#d3dae1` (dash 4/6) from
(88,52) to (88,190). Rows 176×36 radius 8 `#fff`/1 px `#e4e8ec` at (112,52) **Rule 1**, (112,100)
**Rule 2**, (112,148) **Default** with sub-label **if nothing matches** 13/500 ink-3 at (128,176);
14 px indicator circles on the rail at (100,70/118/166), stroke `#d3dae1`. Outcome tile 36 px circle
centre (352,118) duotone brand (`smartphone` + check), label **Second factor** 13/500 ink-2 at (352,152);
connector (288,118)→(330,118) with arrowhead. Motion: rows slide in from x +12 top→bottom, stagger
0.10 s; rail draws 0.4 s (0.36–0.80); token appears at (88,52), drops to row 1 (0.3 s INOUT-B) — row
1's indicator becomes an 8 px dash ink-3 and the row eases to 55 %; at 1.20 the token drops to row 2
(0.3 s); row 2's indicator fills brand with a white tick and its border turns `#eb5424` (0.2 s); the
connector draws right 0.3 s and the outcome tile + label appear (pop); row 3 stays at 55 % (1.50–2.30).

### 5.3 Placement — one rule: the shelf

Every inset uses **SHELF-LEFT**. While an inset is live the whole product picture (and every overlay,
through `mapper`) eases to `xf = { s: 0.82, dx: +280, dy: 0 }`: the window sits at x 630–1850,
y 121–892 (title bar included); the inset sits in the freed column at **(105, 409)** — vertically
centred on the window's centre 519 — over bare ground, covering nothing. `side: 'right'` mirrors it
(`dx −280`, inset at x 1395) and exists for completeness; this film uses `left` only.

- Shelf easing: k = envelope over `[a − 0.25, a + dur + 0.10]` with 0.5 s in / 0.4 s out (INOUT-B),
  where `a = e.f / fps`. `xf.s *= lerp(1, .82, k)`; `xf.dx += lerp(0, 280, k)` (sign by side). The push
  transform adds to it; the caption band and `#bg` are untouched.
- The inset's own enter/exit: enter at `a` (0.36 s DEC), exit at `a + dur` (0.24 s EXIT-C).
- **Every spotlight that overlaps a shelf carries `cam: false`** (else `cameraTrack`'s auto-zoom to
  z 1.28 makes the picture 1905 px wide and it overflows the frame). The spotlight still dims and cuts
  its hole; only the camera stays at rest. The spotlight dim is now `rgba(33,37,41,.35)`.
- One inset at a time; never across a cut, push, banner or dialog; scheduled straight after
  `rec.say(...)` and finished before the next click that changes the product.

### 5.4 The recorder call and the event

```js
/** A floating explainer beside the product, for the line being spoken. */
async explain(id, { side = 'left', seconds } = {}) {
  const dur = seconds ?? Math.max(2.5, (talkUntil - frame()) / fps + 0.3)   // the rest of the line + a breath
  event('explain', { id, side, dur })
  return dur
}
```
Event shape (take JSON): `{ f, type: 'explain', id, side: 'left'|'right', dur }` — `id` ∈
`'finance-workday' | 'who' | 'if' | 'then' | 'first-match'`. `rec.mark('explain', {...})` produces the
identical event and is the fallback if the method has not landed yet. The edl adds
`{ type: 'pop', t: at + 0.30, gain: 0.5 }` per event.

### 5.5 Where each inset plays (and the take code around it)

| take · line | line text | call | product behaviour under the shelf |
|---|---|---|---|
| create · **c1.1** | "Finance signs in to Workday every morning. Let's protect that sign-in." | `rec.say('c1.1'); rec.explain('finance-workday')` | cursor glides to (760,430) 1.0 s, hovers rows 2 and 4 (0.7 s each, `ox .22`), `settle(0.3)`. No dialog, no spotlight. |
| who · **c3.3** | "Who starts as everyone this policy governs. Let's narrow it." | `rec.say('c3.3'); rec.explain('who'); await rec.spotlight(whoSec, { seconds: 2.6, cam: false }); hold(2.6); settle(0.2)` | Who section dimmed-around, camera at rest. |
| if · **c4.1** | "If is when the rule applies. Empty means every sign-in that reaches it." | `rec.say('c4.1'); rec.explain('if'); await rec.spotlight(ifSec, { seconds: 3.2, cam: false }); hold(3.2); settle(0.3)` | as above |
| then · **c5.1** | "Then is the decision. Allow the sign-in, or deny it." | `rec.say('c5.1'); rec.explain('then'); await rec.spotlight(decide, { seconds: 3.4, cam: false }); hold(1.2); hover(deny, 1.0); settle(0.3); click(allow); hold(0.4)` | the Allow click lands after the inset has left |
| canvas · **c6.2** | "A policy is a list of rules, read top to bottom. The first match decides." | `rec.say('c6.2'); rec.explain('first-match'); hold(…); settle(0.3)` | panel already closed (c6.1); nothing moves |

---

## 6. BOARD CHAPTER — take `canvas` (≈ 68 s) and chapter 07

Owner: agent C. The chapter adds a second **real** rule, orders it, and shows the board's controls
briefly. No empty rule, no leave-guard beat, no "clear that extra rule" beat, nothing shadowed.
(Only a catch-all rule shadows what is below it — `shadowedBy` in `diagnostics.ts` — and a Deny on
"Network zone in Anonymizers" is not a catch-all, so with it above Finance nothing dims.)

Constants: `RULE2 = 'Anonymizers — block'`; `block = p.getByRole('group', { name: RULE2, exact: true })`;
`fin = p.getByRole('group', { name: RULE, exact: true })`; `fallback = p.getByRole('group', { name: 'Nothing else matched' })`;
`atSlot(loc, n)` as today (`Reorder rule N — drag, or use the arrow keys`).

| # | line id → text | actions |
|---|---|---|
| 1 | `c6.1` **"Now, the board. Fold the panel away."** | `setAvoid(insp)`; `hold(0.6)`; click **Close the panel**; `gone(inspector)`; `setAvoid(null)`; `settle(0.3)` |
| 2 | `c6.2` **"A policy is a list of rules, read top to bottom. The first match decides."** | `explain('first-match')`; `hold(3.0)`; `settle(0.3)` |
| 3 | `c6.3` **"Add a second rule: the plus on the connector, below the Finance rule."** | `ins = getByRole('button', { name: 'Add a rule at the end', exact: true })` (the link between the Finance card and the default; its hover hint reads "Add a rule here"); `hover(ins, 1.0)`; `click(ins)`; `visible(inspector)`; `nr = group 'New rule'`; `atSlot(nr, 2)`; `until(.bb__inspbar > b startsWith 'rule 2')`; `setAvoid(insp)`; `settle(0.3)` |
| 4 | `c6.4` **"Anonymizers — block. Who stays as everyone."** | click textbox **Rule name**; `press('Control+a', { show: false })`; `type(RULE2, { cps: 16 })`; click `.bb__inspbar > b` (hint false); `hold(0.3)`; `spotlight(whoSec, { seconds: 2.0 })`; `hold(2.0)`; `settle(0.3)` |
| 5 | `c6.5` **"If: Network zone, in zone, Anonymizers."** | `scroll(body, '#bb-sec-if', { offset: 20 })`; click **Add condition** (exact) → group 'Add a condition' → **Network zone** → `visible(pop)` → option **in zone** → textbox 'Search Network zone' type "anonym" → checkbox `/^Anonymizers/` → `closePop`; `settle(0.3)` |
| 6 | `c6.6` **"Then: Deny. No factor is ever asked for. The card reads it back."** | `scroll(body, '#bb-sec-then', { offset: 16 })`; click `decide.getByRole('radio', { name: /^Deny\b/ })`; `hold(0.6)`; `spotlight(block.locator('.bb__ifaction'), { seconds: 2.2 })`; `hold(2.2)`; click **Close the panel** (hint false); `gone(inspector)`; `setAvoid(null)`; `settle(0.3)` |
| 7 | `c6.7` **"Order matters. The strictest check goes first, so move the block rule up."** | `hover(block, { seconds: 0.8, ox: .6, oy: .3 })`; click `block.getByRole('button', { name: 'Move up' })`; `atSlot(block, 1)`; `atSlot(fin, 2)`; `hold(0.8)`; `settle(0.3)` |
| 8 | `c6.8` **"Anonymizers are refused here. Everything else falls through to Finance, then to the default."** | `spotlight(block, { seconds: 1.4, pad: 8, cam: false })`; `hold(1.6)`; `spotlight(fin, { seconds: 1.4, pad: 8, cam: false })`; `hold(1.6)`; `spotlight(fallback, { seconds: 1.8, pad: 8, cam: false })`; `hold(1.8)`; `settle(0.3)` — a top-to-bottom walk with the camera still |
| 9 | `c6.9` **"Switch a rule off without deleting it, and back on."** | `hover(block, …)`; click `block.getByRole('switch', { name: /is on$/ })`; `hold(1.0)` (card at .62); click `block.getByRole('switch', { name: /is off$/ })`; `settle(0.3)` |
| 10 | `c6.10` **"Every edit has a shortcut. Alt and an arrow moves a rule; Control Z brings it back."** | click `fin.getByRole('button', { name: RULE, exact: true })` (selects; the panel opens on Finance — `setAvoid(insp)`); `hold(0.5)`; `press('Alt+ArrowUp')` (keycaps); `atSlot(fin, 1)`; `hold(1.2)`; `press('Control+z')`; `atSlot(block, 1)`; `hold(0.6)`; click **Close the panel** (hint false); `gone(inspector)`; `setAvoid(null)`; `settle(0.3)` |
| 11 | `c6.11` **"Collapse the cards for the order alone; expand them for the detail."** | click density **Collapse cards**; `hold(1.4)`; click **Expand cards**; `settle(0.3)` |
| 12 | `c6.12` **"Scroll the chain; zoom in, out, and reset."** | ctrl-wheel −100 at the top of the first card (0.9 s) → zoom ≠ 100 %; wheel +260 over the stage background, `until(worldY < y0 − 20)`; `hold(0.4)`; wheel −260 back; **Zoom in**; `hold(0.4)`; **Zoom out**; `hold(0.4)`; **Reset zoom** → 100 %; `settle(0.4)` |

End asserts: `.bb__card:not(.is-terminal)` count 2; titles in order `[RULE2, RULE]`
(`p.locator('.bb__card:not(.is-terminal) .bb__titlebtn')` innerTexts); both switches read
`Rule N is on`; `block` has `.bb__ifchip` "Deny" and its journey contains "Refused"; **Review & Save**
is in `.bbtop__acts`.

Chapter banner: `CHAPTERS[canvas].kicker = 'Two rules, top to bottom.'`.

### Chapter 07 — take `save` reads back both rules

| # | line | actions |
|---|---|---|
| 1 | `c7.1` "Ready? Review and Save reads every rule back in plain English." (unchanged) | as today (Review & Save → dialog → `focus(dlg, 1.3)`) |
| 2 | `c7.2` **"Rule one: Anonymizers, deny. Rule two: Finance off the office network, then a second factor."** | `rules = dlg.locator('.bdlg-rev__rules > li:not(.is-default)')`; `spotlight(rules.nth(0), { seconds: 1.8, pad: 8 })`; `hold(2.0)`; `spotlight(rules.nth(1), { seconds: 2.2, pad: 8 })`; `hold(2.2)`; `settle(0.3)` |
| 3–4 | `c7.3`, `c7.4` unchanged | as today |

Asserts added: `rules` count 2; `rules.nth(0)` text includes `RULE2` and "Deny" (its `IF:` prose
names Anonymizers, its `THEN:` reads "Access is blocked. No alternative path."); `rules.nth(1)`
includes `RULE`. `CHAPTERS[save].kicker = 'Both rules, read back in plain English.'`.

Chapter 01 (take `create`): `c1.1` and `c1.2` swap order (the Finance→Workday line comes first,
with the inset; "Every policy lives here…" second). Actions: c1.1 as in §5.5; c1.2 hovers row 1's name
cell (1.0 s, `ox .3`), glides to (1200, 300) 0.8 s, `settle(0.3)`. Chapters 02–05 keep their lines and
actions except the three `explain` calls and `cam:false` flags in §5.5.

---

## 7. FILES, AGENTS, CONTRACTS, ORDER

Three agents on disjoint files. Shared shapes are pinned here; nobody changes them without editing
this section.

### Agent A — bookends and the edit (`compose/slides-v4.js`, `compose/slides-v4.css`, `compose/index.html`, `lib/edl.mjs`)

- **A-1** `slides-v4.js`: `hook` and `outro` defs per §2/§3 — `{ build(el, params, edl), update(el, t, dur, params) }`,
  no `preload`, no pictures, no `easeOutBack`; register `window.SLIDES3 = { hook, outro }`. Read
  `params.cues[ids[0]]` for `E`. Helpers: `seg(t,a,b)`, `COMPOSE.lerp/clamp`, and the curves of §1.4 as
  small functions (a cubic-bezier evaluator, ~20 lines, is fine).
- **A-2** `slides-v4.css`: `.slide--hook, .slide--outro { background: transparent }`; classes
  `.v4`, `.v4-lockup`, `.v4-name`, `.v4-name--outro`, `.v4-sub`, `.v4-line`, `.v4-url` with the §1.2
  type, absolute positions of §2.1/§3.1, `will-change: transform, opacity`. No gradients, no filters.
- **A-3** `index.html`: replace the `slides-v3.css` / `slides-v3.js` links with `slides-v4.css` /
  `slides-v4.js`; add `<link rel="stylesheet" href="explain.css">` after `compose.css` and
  `<script src="explain.js"></script>` right after `anno.js` (before `engine.js`). Delete
  `slides-v3.js` and `slides-v3.css` from the repo. (Agent B may add the two explain lines locally
  to test; they are identical, so the merge is clean.)
- **A-4** `edl.mjs`:
  1. generic sfx pass-through on slides: `for (const c of s.sfx ?? []) sfx.push({ type: c.type, t: item.start + c.at, gain: c.gain ?? 1, dur: c.dur })`;
     delete the `s.slide === 'hook'`, `'whiteboard'` and `'outro'` blocks.
  2. a take with `s.out === 'fade'`: `item.tout = XFADE; item.outKind = 'fade'`; and the slide after a
     take whose `outKind === 'fade'`: `start = prev.end − XFADE; tin = XFADE; inKind = 'fade'`
     (today a slide after a take gets `tin 0`; keep that for `cut`/`push`).
  3. the last item: no forced fade — `item.tout = 0; item.outKind = 'cut'` unless `s.out` says otherwise.
  4. take events: `if (e.type === 'explain') sfx.push({ type: 'pop', t: at + 0.30, gain: 0.5 })`;
     replace the prelude `swoosh` with `{ type: 'thump', t: item.start + 0.30, gain: 0.35 }`.
     Keep `cardMode off → whoosh`, `focus → thump`, `sfx` events as they are.
- Verify: `node render.mjs edl && node render.mjs preview --at 0.3,1.0,1.6,2.7,5,7.4,8.3,8.7` and,
  for the outro, `--at <save.end-0.6>,<+0.4>,<+1.5>,<+2.9>,<+4.2>,<end-0.1>` (read `save.end` from
  `.work/light/edl.json`). Stills land in `.work/light/preview/`.

### Agent B — compositor overlays, card lighting, recorder events (`compose/explain.js`, `compose/explain.css`, `compose/engine.js`, `compose/compose.css`, `compose/anno.js`, `lib/recorder.mjs`)

- **B-1** `recorder.mjs` (land this first — agent C's dry run needs it):
  - `explain(id, { side, seconds })` per §5.4;
  - `cardLight(part)` → `event('cardLight', { part })`;
  - `cardAnno(on, stage = 'both')` → `event('cardAnno', { on: !!on, stage })`;
  - `truthStep(rows)` → `event('truthStep', { rows })`;
  - `cardParts(parts)` unchanged (values may now be `Rect | Rect[]`); add `rectsOf(locator)` → `Rect[]`
    (one `rectOf` per matched element, in DOM order);
  - `wordTime(id, re)` → `vo.get(id)?.words.find(w => re.test(w.text))?.t ?? 0` (seconds from the line's start);
  - `spotlight(target, { …, cam })` passes `cam` into the event when it is `false`.
- **B-2** `explain.js`: `window.EXPLAIN = { [id]: { build(el), update(el, kEnv, t) } }` for the five ids
  of §5.2; `build` writes the inline SVG once; `update` sets per-element opacity/transform/dashoffset
  from `t` (seconds since entrance) and leaves the container's enter/exit to the engine.
- **B-3** `explain.css`: `.ov-explain` (position absolute, z 19, width 420, height 220, the card
  surface of §5.1), `.ov-explain svg` (block, 420×220), text classes `.xp-title`, `.xp-label`,
  `.xp-small`, glyph class `.xp-glyph` (stroke slate 1.75, round caps/joins, fill none), `.xp-hi`
  (brand duotone), `.xp-ok`, `.xp-no`.
- **B-4** `engine.js`:
  1. `ovInit`: add `<svg id="ov-card-veil" class="ov-card-veil">` with paths `#ov-card-veil-fill`
     (evenodd) and `#ov-card-veil-line`; three `.ov-partlbl` divs `#ov-partlbl-who/-if/-then`; a
     `<div id="ov-explain" class="ov-explain">`; register all in `OV[...]`.
  2. `cardTrack`: replace `anno: Float32Array` with `annoAnd`, `annoOr` (each eased 0.5 s from the
     `cardAnno` events by `stage`); add `light[f] = { part, k }` (§4.3 easing) from `cardLight`
     events; add `truth[f] = { rows, at: [t1..t4] }` from `truthStep` events (`at[i]` = time the
     i-th row first lit); `cardAt()` returns them; `ANNO_SHIFT` follows `annoAnd`.
  3. `drawAnno(m, card, alpha)`: outer bracket, AND label, shift and panel from `annoAnd`; inner
     bracket and OR label from `annoOr`; panel rows/opacity/tints from `truth` (§4.4). Colours via
     CSS classes only.
  4. new `drawCardLight(m, card, alpha, t)` after `drawAnno`: §4.3. Hidden when `card.blend ≤ 0.5`
     or `annoAnd > 0.05`.
  5. `drawOverlays`: the explain block — latest `explain` event live at `t` (`a ≤ t ≤ a + dur + 0.24`);
     build the card once per id (cache on `el.dataset.id`), position at `(105, 409)` / `(1395, 409)`,
     `kEnv = envelope(t, a, a + dur, 0.36, 0.24)`, transform `translateY((1−kIn)·16 + kOut·8)`,
     opacity `kEnv·alpha`; call `EXPLAIN[id].update(el, kEnv, t − a)`. `hideOverlays` hides
     `#ov-explain`, `#ov-card-veil`, the three part labels.
  6. `drawStage`: mask radius `r = lerp((14·m.s)/WIN.s0, 12·m.s, b)` (the card's own 12 app px in card
     mode — closes the 2.5 px stage-grey sliver in each corner).
  7. `renderFrame`, take loop, prelude branch (a card-mode take with `prelude > 0`): replace the
     hold-then-wipe with the rise-in —
     `k = easeOut(clamp(local/pre,0,1)); first = cardAt(ct,0); f = 0; look.overlay = 0; look.alpha = k; look.card = { rect: first.rect, blend: 1, cam: first.cam }; xf.dy += (1−k)·16`.
  8. `renderFrame`, take loop, fade-out: `if (it.outKind === 'fade' && it.tout > 0 && local > durI − it.tout) { p = easeInOut(...); look.alpha *= 1 − p; if (p > 0.5) look.overlay = 0 }`.
  9. `renderFrame`, take loop, the shelf: `k = shelfAt(take, f)` (§5.3 envelope over `explain`
     events); `xf.s *= lerp(1, .82, k); xf.dx += (side === 'right' ? −1 : 1)·lerp(0, 280, k)`; applied
     before push so both compose.
  10. `cameraTrack`: `spots = take.events.filter(e => e.type === 'spotlight' && e.rect && e.f < n && e.cam !== false)`.
- **B-5** `compose.css`: `--spot-dim: rgba(33,37,41,.35)`; `.ov-glow` becomes a 2 px hairline
  `rgba(33,37,41,.35)` with no conic gradient and no rotation (`--a` unused); `.ov-ambient` → `display:none`
  for good; delete `--spot-amb-b` and the borrowed `#5b8cff #c58cff #ffb36b #ffd2bd`; `.ov-anno__br--and/--or`
  strokes `#1189d4`/`#b07a00` width 2.5; `.ov-anno__lbl b` and `.ov-truth__kw.is-and/.is-or` as tinted
  pills (§1.2, §4.4); `.ov-truth` radius 12, 1 px `#e4e8ec`, `--el-overlay`; `.ov-truth__table tr`
  opacity via inline style, `td.is-true`/`td.is-false` tints; new `.ov-card-veil`, `.ov-partlbl`.
  Remove the `invert(1) hue-rotate(180deg)` rule on the logo (line ~629).
- **B-6** `anno.js`: `truthHtml(rule = DEFAULT_RULE)` with `rule = { who, cond, groupA, groupB }`
  strings; rows carry `data-row="1..4"`; keywords `.ov-truth__kw.is-and/.is-or`; the parenthesised
  group wrapped in `<span class="ov-truth__group">` so it can be tinted.
- Verify: with the fifth-cut takes still on disk, `node render.mjs edl && node render.mjs preview --at 30,33,60`
  renders (the old `cardAnno` without `stage` must still draw both brackets). After agent C's capture,
  preview the card scene at its `cs.2`, `cs.5 + 3`, `cs.6 + 2`, `cs.7 + 1` cue times and the five inset
  moments.

### Agent C — storyboard (`storyboard/lines.mjs`, `storyboard/takes-v2.mjs`, `storyboard/film-v2.mjs`, `storyboard/BEATS-v6.md`)

- **C-1** `lines.mjs`: the id → text list in §8 (remove `hk.2`, `hk.3`, `c6.13`; add `cs.8`,
  `c6.11`, `c6.12`). Update the two `CHAPTERS` kickers (§6). Keep the file's header comment honest
  (Indian-English voice, names said where they appear).
- **C-2** `film-v2.mjs`: the sequence —
  ```js
  { kind: 'slide', slide: 'hook', dur: 8.4, lines: ['hk.1'], lead: 1.2, tail: 1.4, music: 'board', out: 'cut', sfx: [{ type: 'thump', at: 1.2, gain: 0.45 }] },
  take('card', null, { mode: 'card', prelude: 0.6, out: 'push', music: 'board', placeholder: 40 }),
  take('create', 'create'), banner('start'), take('start', 'start'), banner('who'), take('who', 'who'),
  banner('if'), take('if', 'if'), banner('then'), take('then', 'then'), banner('canvas'), take('canvas', 'canvas'),
  banner('save'), take('save', 'save', { out: 'fade' }),
  { kind: 'slide', slide: 'outro', dur: 6.6, lines: ['out.1'], lead: 1.0, tail: 0.6, music: 'outro', sfx: [{ type: 'thump', at: 1.0, gain: 0.4 }] },
  ```
- **C-3** `takes-v2.mjs`: `create()` (c1.1/c1.2 swap + `explain`), `who()` (`explain('who')`,
  `cam:false`), `iff()` (`explain('if')`, `cam:false`), `then()` (`explain('then')`, `cam:false`, click
  Allow after the inset), `canvas()` rewritten per §6, `save()` per §6 (two spotlights, asserts),
  `cardScene()` per §4 (full dry prep, `cardParts` with arrays, the eight beats, no `cardFreeze`).
  Keep `closePop`, `noTour`, `density`, `scroll`, `gone`, `atSlot` helpers.
- **C-4** `BEATS-v6.md`: the beat tables of §4.2, §5.5, §6 and this cut's take order, replacing
  BEATS-v5.md (keep v5 in git history only). Add the new selectors to INVENTORY-2026-09-14.md's
  "canvas" section: `Insert a rule at position N`, group `'Anonymizers — block'`, switch `Rule N is off`.
- Capture and render (after B-1 has landed):
  `node capture.mjs --dry` (regenerates VO by hash for every changed line; slide lines need nothing else) →
  `node capture.mjs --only create,who,if,then,canvas,save,card` (start runs dry; card is last) →
  `node render.mjs edl && node render.mjs preview --at …` → `node render.mjs video && node render.mjs audio && node render.mjs mux`
  → `out/policy-engine-demo-light.mp4`. Capture only after B-1; everything else in C can be written first.

### Shared contracts (pinned)

Recorder events in a take's `events[]` (app px rects `{ x, y, width, height }`; `f` = first frame showing the new state):

```jsonc
{ "f": 120, "type": "explain",   "id": "finance-workday", "side": "left", "dur": 4.9 }
{ "f": 20,  "type": "cardLight", "part": "who" }                 // 'title'|'who'|'cond'|'group'|'then'|'parts'|null
{ "f": 18,  "type": "cardParts", "parts": { "title": R, "who": [R, R], "cond": R, "first": R, "group": R, "block": R, "then": [R, R] } }
{ "f": 400, "type": "cardAnno",  "on": true, "stage": "and" }   // stage 'and'|'both'; absent = 'both'
{ "f": 540, "type": "truthStep", "rows": 2 }                     // 0..4 rows lit
{ "f": 53,  "type": "spotlight", "rect": R, "label": null, "dur": 3.2, "pad": 10, "radius": 12, "cam": false }
```

Film sequence ↔ edl: slide items carry `sfx: [{ type, at, gain, dur? }]` (seconds from the slide's
start); `dur` on a slide is a minimum; a take may say `out: 'fade'`; a card take's `prelude` is the
rise-in duration. Engine ↔ slides: unchanged (`window.SLIDES3[name]`, `build/update`, `params.cues`).

### Order of work

1. **Hour 0** — B lands B-1 (recorder) and pushes. A starts A-1..A-4. C starts C-1, C-2, then C-3.
2. **In parallel** — B does B-4..B-6 (engine/css/anno) and B-2/B-3 (explain module); A previews the
   bookends against the fifth-cut edl (the seam fix needs B-4.8 to show, A's half can land alone).
3. **When B-1 is in** — C runs `node capture.mjs --dry` (VO + a dry pass that validates every selector),
   fixes what the dry run reports, then the `--only` capture (≈ 25 min).
4. **Integration** — one person runs `render.mjs edl → preview` at the checkpoints listed under each
   agent, then `video/audio/mux`. Sanity checklist: intro ≤ 8.8 s; the card rises on a light ground
   with no stage-grey corner; three part labels then who/cond/group/then lit in turn; AND arrives
   before OR; rows light on "One of them / Both / Neither"; five insets on the left column, window
   shelved, no overflow; two rules on the board, block above Finance, nothing at 40 % opacity; the
   review dialog lists both; the outro holds still to the end.

### Delete (the slop)

`compose/slides-v3.js`, `compose/slides-v3.css` (whole files: `--h3-*` stage, meshes, floor grid,
vignette, slab, sheens, conic rims, inverted logo, word slams, `easeOutBack` pops, gradient rules and
shimmer). In `compose.css`: `.ov-glow` conic gradient and `--a` rotation, `.ov-ambient` halo,
`--spot-amb-b`, the four borrowed hues, the logo `invert(1)` filter, `#3b6fd6` and `#d08a15`. In
`edl.mjs`: the `hook`/`whiteboard`/`outro` sfx blocks, the last-item blur fade, the prelude `swoosh`.
In `lines.mjs`: `hk.2`, `hk.3`, `c6.13`. In `takes-v2.mjs`: the empty-rule, duplicate, leave-guard and
`Delete` beats of the old `canvas()`; `cardFreeze` in `cardScene()`. Nothing referring to a mascot is
touched (it is already inert).

---

## 8. Every spoken line of the sixth cut (id → text)

Unchanged ids keep their VO (the hash matches); changed or new ids are synthesised by
`node capture.mjs --dry`. Takes that say a changed line are in the `--only` list above.

```
hk.1   Policy Engine. Who may sign in, on what conditions, and what they must prove.

cs.1   One rule, one card. Who, if, then.
cs.2   Who: Finance, Executives, and Priya Sharma.
cs.3   If: the sign-in is not from the Office Network.
cs.4   And a group: a device not Corporate managed, or an Anonymizer network.
cs.5   Outside the group, everything must hold. That is AND. Inside it, one is enough. That is OR.
cs.6   One of them: true. Both: true. Neither: false.
cs.7   Then: allow, with a second factor.
cs.8   Now, for real, for Workday.

c1.1   Finance signs in to Workday every morning. Let's protect that sign-in.
c1.2   Every policy lives here. One row each, guarding its own applications.
c1.3   A policy needs two things. A name: Workday, Finance adaptive access.               (unchanged)
c1.4   And the application it protects: Workday. One policy can cover several.            (unchanged)
c1.5   Create it. It starts as a draft, so nothing changes for anyone yet.                (unchanged)

c2.1 – c2.5   unchanged
c3.1 – c3.6   unchanged   (c3.3 gains the `who` inset)
c4.1 – c4.9   unchanged   (c4.1 gains the `if` inset)
c5.1 – c5.6   unchanged   (c5.1 gains the `then` inset)

c6.1   Now, the board. Fold the panel away.
c6.2   A policy is a list of rules, read top to bottom. The first match decides.
c6.3   Add a second rule: the plus on the connector, below the Finance rule.
c6.4   Anonymizers — block. Who stays as everyone.
c6.5   If: Network zone, in zone, Anonymizers.
c6.6   Then: Deny. No factor is ever asked for. The card reads it back.
c6.7   Order matters. The strictest check goes first, so move the block rule up.
c6.8   Anonymizers are refused here. Everything else falls through to Finance, then to the default.
c6.9   Switch a rule off without deleting it, and back on.
c6.10  Every edit has a shortcut. Alt and an arrow moves a rule; Control Z brings it back.
c6.11  Collapse the cards for the order alone; expand them for the detail.
c6.12  Scroll the chain; zoom in, out, and reset.

c7.1   Ready? Review and Save reads every rule back in plain English.                     (unchanged)
c7.2   Rule one: Anonymizers, deny. Rule two: Finance off the office network, then a second factor.
c7.3   Confirm, and the Workday policy is saved.                                          (unchanged)
c7.4   Back on the list it waits, inactive until you switch it on. With its application, and its rules.   (unchanged)

out.1  Access policy, in plain English. Policy Engine, by Xecurify.
```

Removed: `hk.2`, `hk.3`, `c6.13`. Chapter kickers: canvas → "Two rules, top to bottom."; save →
"Both rules, read back in plain English."; the other five unchanged.
