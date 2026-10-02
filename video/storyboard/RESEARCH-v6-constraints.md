# Sixth cut — constraints & hooks (R3)

Read from the code, not from memory: `compose/engine.js`, `compose/slides-v3.js` + `.css`,
`compose/compose.css`, `compose/anno.js`, `compose/slides-v2.js` (banner), `compose/index.html`,
`lib/recorder.mjs`, `lib/edl.mjs`, `lib/vo.mjs`, `audio/vo.py`, `audio/synth.mjs`, `render.mjs`,
`capture.mjs`, `storyboard/film-v2.mjs`, `storyboard/lines.mjs`, `storyboard/takes-v2.mjs`, the
fifth-cut takes in `.work/light/capture/take-*.json` (+ their frames), and the console's
`src/brand/tokens.css`, `console-theme.css`, `rebrand.css`, `shell.css`, `screens/board/board.css`.

Numbers below are in **screen px** (the 1920×1080 frame) unless marked **app px** (the console's
1440×900 CSS viewport that the recorder films at 2× = 2880×1800 JPEGs).

---

## (a) Tokens for a light, premium look that matches the console

The capture seeds `idp.brand = 'current'`, so the filmed console is **console-theme.css over
tokens.css** — *not* the blue rebrand (`data-brand="rebrand"`, `rebrand.css`). Every value below
is from that pair, plus the compositor's own `:root` in `compose.css`.

### Surfaces, lines, ink (console-theme.css)
| role | token | hex |
|---|---|---|
| page / card / dialog | `--surface-page` `--surface-raised` `--surface-overlay` | `#ffffff` |
| sunken tile | `--surface-sunken` | `#f8f9fa` |
| inset (group box, pressed) | `--surface-inset` | `#eef1f4` |
| inverse / the rail | `--surface-inverse`, `--shell-bg` | `#1e2c38` |
| board stage behind the cards | `--bb-stage` (board.css) | `#f6f7f9`, dots `#d3dae1` |
| hairline | `--border-subtle` | `#e4e8ec` |
| control edge | `--border-default` | `#d3dae1` |
| strong line | `--border-strong` | `#adb5bd` |
| ink (headings, body) | `--text-primary` `--text-body` | `#212529` |
| secondary | `--text-secondary` | `#495057` |
| tertiary | `--text-tertiary` | `#5a6570` |
| muted (captions, units) | `--text-muted` | `#646e79` |
| link | `--text-link` | `#0f6ba4` |
| selection ("accent" is slate, not orange) | `--accent` / `-hover` / `-strong` / `-soft` / `-soft-border` | `#4a5560` / `#343a40` / `#212529` / `#eef1f4` / `#ccd3da` |

### Brand orange — one budget per frame
| token | hex | use |
|---|---|---|
| `--brand` | `#eb5424` | the accent (rail edge, a dot, a 3 px rule) |
| `--brand-hover` / `--brand-active` | `#d64c21` / `#a73c1a` | |
| `--brand-on-fill` | `#c2431c` | the ONLY orange that carries white type at ≥4.5:1 — the filmed primary buttons ("New policy", "Review & Save") render this orange |
| `--brand-subtle-bg` / `--brand-subtle-border` | `#fdeee9` / `#f9cabb` | a tint, never a fill with text |

(`console-theme.css` declares `--int-brand-bg: #263746` navy, but the filmed build shows orange
CTAs; use `#c2431c` for any button-like fill in the film and sample a frame if an exact match
matters.)

### Feedback ramps — colour only where colour *is* the meaning
| family | bg | border | fg | dot |
|---|---|---|---|---|
| positive (Allow, Active, Ready) | `#e8f7ee` | `#b6e3c6` | `#14663a` | `#128f43` |
| negative (Deny, Refused) | `#fdf0f2` | `#f5c6ce` | `#a5142b` | `#d01243` |
| notice (**OR**, Second factor, Monitor) | `#fdf6e0` | `#f0dfa4` | `#7d5800` | `#b07a00` |
| info (**AND**) | `#e9f2fd` | `#b9d6f5` | `#155e91` | `#1189d4` |
| neutral | `#f8f9fa` | `#e6e9ec` | `#495057` | `#7e8b9a` |

The rule card prints its logic words exactly so (`board.css` 2040–2051):
`.bb__ifkw.is-and { background: --fb-info-bg; color: --fb-info-fg }`,
`.bb__ifkw.is-or { background: --fb-notice-bg; color: --fb-notice-fg }` — an 18 px pill, 11 px /
600 / uppercase / letter-spacing .04em, radius `--radius-pill` 4 px. **The film's AND/OR must
use these two tints.** The current overlay uses `#3b6fd6` (AND) and `#d08a15` (OR) — neither is
a console colour; replace with `#155e91 on #e9f2fd` and `#7d5800 on #fdf6e0` (bracket strokes
`#1189d4` / `#b07a00`).

Other card anatomy the AND/OR scene points at: `.bb__ifgroup` = `--surface-inset #eef1f4`,
radius 6, padding 6/8, no border; `.bb__ifchip` = 22 px tall, 11 px / 500, radius 4, 1 px chip
border; `.bb__card` = white, 1 px `#e4e8ec`, radius 12 (`--radius-xl`), shadow `--el-low`;
card width `--bb-card` 520 app px; inspector `--bb-insp` 560 app px.

### Radii, elevation, type, controls
- Radii (tokens.css): xs 2 · sm 4 · md 6 · lg 8 · **xl 12** · 2xl 16 · 3xl 24 · full 9999 · pill 4.
  Rule of thumb from the console: chips 4, controls 6, containers 8, cards/dialogs 12.
- Elevation (console-theme.css): `--el-low` `0 1px 2px rgba(33,37,41,.05)` ·
  `--el-mid` `0 2px 8px rgba(33,37,41,.07)` · `--el-high` `0 8px 24px rgba(33,37,41,.12)` ·
  `--el-overlay` `0 16px 48px rgba(33,37,41,.22)`. Only what floats casts a shadow.
- Type: `--font-ui` `'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  `--font-mono` `'JetBrains Mono', ui-monospace, …`. Scale 12/13/14/15/16/18/20/24/28; weights
  400/500/600/700; headings 600 with letter-spacing −0.014em; tabular numerals on.
- Controls: heights 30 / 36 / 42; hairline `--bw-thin` 1 px; focus ring ink with a slate halo
  `rgba(74,85,96,.18)`.

### The compositor's own light tokens (compose.css `:root`) — already console-true
`--ink #212529` · `--ink-2 #495057` · `--ink-3 #646e79` · `--line #e4e8ec` · `--line-2 #d3dae1`
· `--sunken #f8f9fa` · `--inset #eef1f4` · `--shell #1e2c38` · `--brand #eb5424` · `--slate
#4a5560` · `--font` = DM Sans stack · `--mono` = JetBrains Mono stack · `--hand` = Kalam (do not
use). Tags/callouts/caption: white on `--tag-bg`, ink type, `--tag-shadow rgba(10,14,20,.28)`.
The subtitle pill `.cap`: 500 29px/1.3 DM Sans, padding 13/28/14, radius 16, 1 px `--line`,
shadow `0 14px 40px --tag-shadow`, centred, `bottom: 18px`, max-width 1560, words light up from
`--cloud-dim rgba(33,37,41,.3)` to ink as spoken.

### Recommended film palette (what "premium light" means here)
ground `#f2f4f7` · surfaces `#ffffff` · ink `#212529` / `#495057` / `#646e79` · hairline `#e4e8ec`
· ONE orange per frame (`#eb5424` as a mark, `#c2431c` if it carries type) · AND `#e9f2fd/#155e91`
· OR `#fdf6e0/#7d5800` · Allow `#e8f7ee/#14663a` · Deny `#fdf0f2/#a5142b` · shadows from the
`--el-*` ramp · radii 12 (cards) / 16 (the caption pill) / 6 (controls) / 4 (chips) · DM Sans
600–700 at −0.03em for display, 500 for body. **No gradients** beyond the ground's two existing
soft glows.

### Slop to delete (all live in slides-v3.* and compose.css)
`--h3-*` stage (navy `#0a1120`, drifting mesh, floor grid, vignette, sheen), every
`conic-gradient` (`.hk3-pop__bd`, `.hk3-pop__glow`, `.ov-glow` spotlight frame), the borrowed
blue/violet/peach `#5b8cff` `#c58cff` `#ffb36b` `#ffd2bd`, the text-shine on `.ou3-title`, the
blue half of the spotlight halo (`--spot-amb-b rgba(91,140,255,.2)`), the three "Who. If. Then."
word slams. Replace the spotlight frame with a 2 px hairline (`#eb5424` at .9 or ink) — the dim
`rgba(14,20,28,.5)` can stay (or lighten to `rgba(33,37,41,.35)` for the light film).

### Fonts the compositor can render
`compose/index.html` loads, with `display=block`, one Google Fonts link:
`DM Sans` (opsz 9..40, weights 300/400/500/600/700), `JetBrains Mono` 400/500, `Kalam` 400/700.
`COMPOSE.init` and every `renderFrame` await `document.fonts.ready`, so any other Google family
just needs adding to that `<link>` (no other host is reachable). System fonts otherwise. The
console never uses a display serif; DM Sans 700 at −0.03em is the on-brand headline.

---

## (b) The exact ground the compositor paints (so intro/outro cut seamlessly)

**Ground** — `html, body, #bg { background: var(--ground) }` with `--ground: #f2f4f7`, and on `#bg`:
```
background-image:
  radial-gradient(circle at 1px 1px, rgba(33,37,41,0.085) 1.2px, transparent 1.6px),   /* 26×26 dot grid */
  radial-gradient(1200px 800px at 12% 8%,  rgba(74,85,96,0.10),  transparent 60%),      /* slate glow, top-left */
  radial-gradient(900px 700px  at 92% 96%, rgba(235,84,36,0.06), transparent 62%);      /* faint brand glow, bottom-right */
background-size: 26px 26px, 100% 100%, 100% 100%;
```
The dot grid **drifts**: `#bg.style.backgroundPosition = ((t*6)%26)px ((t*3)%26)px` per frame.
The `.slide` base class (slides.css) paints its own copy — same `--ground`, but a *static* grid
and glows at 8% 0% / 100% 100% (different sizes) — so an opaque slide shows a dot-phase and glow
seam at every cut. **Rule: the new intro/outro set `background: transparent` (as `.slide--hook,
.slide--outro` already do) and let `#bg` show through.** Nothing else is on screen on a slide:
`#stage` and `#ov` are `display:none` when no take is live; the HUD rail is hidden (`railOn`
false); only `#cap` (subtitle) sits on top at z 50.

**Window mode (any take, `mode: 'window'`)** — geometry from `WIN`:
`top 16 · bar 34 · CAP_BAND 100 · ah 930 · s0 = 930/900 = 1.03333 · aw 1488 · ax 216 · ay 50`;
origin `O = (960, 515)`. At rest (z=1) the app picture occupies **x 216–1704, y 50–980**; the title
bar y 16–50; the caption band y 980–1080 (the `.cap` pill lands at ≈ y 996–1062). Chrome: box
radius `14·z` px; fill `--win-bg #ffffff`; shadow `rgba(22,32,44,0.20)` blur 70·xf.s, offset-y
26·xf.s; hairline `rgba(33,37,41,0.10)`; bar gradient `#fbfcfd → #f1f4f7`; three dots `#e6e9ed`
stroked `#d3dae1`; address pill white / `#e4e8ec`, text `#646e79` 12.5 px DM Sans 500 reading
`idp.xecurify.com/admin/policies` (from `film.url`); lock `#8a949e`. app→screen at rest:
`sx = 216 + 1.03333·ax`, `sy = 50 + 1.03333·ay`.

**Card mode (`mode: 'card'`, blend = 1)** — the box is the card's tracked rect through
`cardCam(rect)`: `z = clamp(min(1000/(w·s0), 850/(h·s0)), 1, 2.6)` (card ≤ 1000 wide, ≤ 850 tall,
centred on `O`), camera follows with a 0.22 s lag; chrome alpha `1 − blend` (the title bar is
gone); shadow blur `70 − 20·b` = 50, offset `26 − 8·b` = 18; radius `14·z`; fill white under the
picture. Everything outside the box is `#bg`. Nit worth fixing for the seam: the app's own card
radius is 12 app px = `12·s0·z` on screen, the mask is `14·z` — at the hand-over 19.4 vs 21.9 px,
so a ~2.5 px sliver of stage grey `#f6f7f9` shows in each corner; set the mask radius to
`12 · m.s` in `drawStage` when `look.card` is set.

**The hand-over the intro must land on** (fifth-cut `take-card.json`):
`holdFrame = 1629` (last `cardMode off` at f 1630); card rect in effect
`{x 208, y 234.5, w 520, h 525.1}` app px (emitted f 1582); `cardCam` → `z 1.5665, s 1.6187`;
**target on screen `{x 539.1, y 90.0, w 841.7, h 850.0}`, radius 21.9, shadow 0 18px 50px
rgba(22,32,44,.2)**, picture `/work/capture/img/<frames[1629][0]>.jpg`. All of it comes from
`COMPOSE.cardHold('card')` → `{ f, rect, url, target }` (and `COMPOSE.cardTarget(rect)`), which
is how slides-v3 trimmed its device down to exactly this box. The card take then opens with
`prelude: 0.9` s: 0–0.2 s the hold picture masked to `target`; 0.2–0.9 s the mask eases to the
empty first card (`{208, 234.5, 520×118}` → screen `{460, 401.5, 1000×226.9}`, z 1.9) and the
picture crossfades to frame 0; a `swoosh` sfx at prelude − 0.45 s. `film-v2.mjs` gives the hook
`out: 'cut'`, so the intro's last frame and the take's first frame are adjacent: **the intro's
final frame = `#bg` + that card box, nothing else** (subtitle off — `tail` must clear the last
line by ≥ 0.3 s).

**The outro after `save`** — edl.mjs overlaps only slide→slide; a slide after a take gets
`tin 0` (`inKind 'fade'` but zero length), so the window vanishes on a hard cut and the outro
must fade itself in over the bare ground. For a soft hand-over add one of: (1) edl.mjs: a take
with `out: 'fade'` sets `item.tout = XFADE (0.8), outKind 'fade'`, the following slide starts at
`prev.end − XFADE` with `tin = XFADE`; engine.js `renderFrame`: for `it.outKind === 'fade'` set
`look.alpha = easeInOut(kout)` (and `overlay = 0` once `kout < 0.5`) — five lines; or (2) the
outro draws the last frame itself via `COMPOSE.frameUrl('save','last')` and fades it (heavier,
duplicates the window chrome).

---

## (c) The slide contract

**Definition** (a plain object; registered on `window.SLIDES3[name]`; lookup order in
`slideDef`: `SLIDES3` → `SLIDES2` → `SLIDES`, so a new `slides-v4.js` loaded last can either
overwrite `window.SLIDES3.hook/outro` or add `SLIDES4` + one line in `slideDef`):
```js
{
  async preload?(item, edl),              // decode borrowed pictures before frame 0 (awaited in init)
  build(el, params, edl),                 // once: el is <section class="slide slide--{name}"> inside #slides
  update(el, tLocal, dur, params),        // every frame; tLocal = t − item.start (s), dur = item.end − item.start
  mascotKeys?(dur, params)                // inert (MASCOT_ON = false)
}
```
`driveSlide` pauses every CSS animation in the section and sets `currentTime = tLocal·1000`
before calling `update`, so keyframe CSS is allowed but must be deterministic; the page is a pure
function of the frame number (no timers, no `Date.now()`, no `Math.random()` per frame).
Helpers exported on `window.COMPOSE`: `W, H, WIN, APP, CAP_BAND, clamp, lerp, easeInOut, easeOut,
easeIn, easeOutBack, envelope, frameUrl(take, 'first'|'last'|n), takeEvents(take), takeFrames(take),
cardTarget(rect), cardHold(takeName)`. Pictures are served from `/work/capture/img/<id>.jpg`,
the wordmark from `/app/xecurify-logo.png` (ink lettering + orange mark, light PNG), other assets
from `/assets/…` (video/assets).

**Sequence item** (film-v2.mjs → edl.mjs):
```js
{ kind: 'slide', slide: 'hook', dur: 'auto' | seconds, lines: ['hk.1', …],
  lead: 0.8, gap: 0.4, tail: 0.6, out: 'cut' | 'push' | 'fade', music: 'hook' | 'board' | 'demo' | 'outro' | 'silent',
  params: {…}, captions: [{ at, dur, text }], capPos, avoid }
```
**Duration** — laid out in `buildEdl`:
```
at = lead
for id of lines: cues[id] = { at, dur: spokenEnd(vo) + 0.3 };  at += cues[id].dur + gap
needed = at − gap + tail
dur = (s.dur === 'auto' || undefined) ? needed : max(s.dur, needed)     // a number is a MINIMUM
```
`spokenEnd` = last word's `t + dur + 0.05`, capped at the clip length (the wav keeps ~0.8 s of
padding; the pace ignores it). Lines with no voice on disk are 3.5 s each.

**Cues** — `item.params.cues[id] = { at, dur }` (seconds from the slide's start, in `lines`
order) is what `update(el, t, dur, params)` reads: slides-v3 does
`ids = Object.keys(params.cues); cue(i) = params.cues[ids[i]]`. Each line is also pushed as a
caption at `item.start + at` with the VO's word timings (`WORD_LEAD` 0.065 s), and its wav is
placed in the mix; captions are trimmed so consecutive ones never overlap (0.05 s gap).

**In / out**
- First item of the film: `tin 1.0`, `inKind 'fade'` (opacity + a 26 px lift) from the bare ground.
- Slide after a slide: `XFADE 0.8` overlap (`prev.tout = 0.8, outKind 'fade'`), or `PUSH 0.8`
  when the previous had `out: 'push'` (both marked `push`, the outgoing translates −W, the
  incoming arrives from +W).
- Slide after a take or banner: `tin 0` — a hard cut (see the outro note above).
- `out: 'cut'` (the default for a slide that is not last): nothing drawn; the next item starts at
  `item.end`. `out: 'push'`: `tout 0.8`, translate −W while the next arrives. `out: 'fade'`: only
  applied when the *next* item is a slide (via `prev.tout = XFADE`) or forced on the **last item
  (`tout 1.2`, fade + scale 1.02 + blur 8 px)** → the film ends on the ground.
- Takes accept only `out: 'push'` (`PUSH 0.8`, with a `whoosh` at +0.3 s); a take after a
  `push` slide/take starts `PUSH` early and slides in from the right.
- Banners: `kind: 'banner'`, fixed `dur`, hard cuts both sides; borrow the previous take's last
  frame / the next take's first frame beneath, blurred and 4 % smaller while the band covers.

**Sound cues per slide are keyed by slide name in edl.mjs** (`s.slide === 'hook'`: three
`thump`s at 0.4 + 0.6·b, a `whoosh` 1.3 s before the first line, `pop` + `sparkle` on every line,
a 1.5 s `riser` ending 0.2 s before the slide ends; `'outro'`: three `thump`s from the first cue −
0.15, a `sparkle` at cue + 2.05). Either keep the names `hook`/`outro` and rewrite those two
blocks, or add a generic `s.sfx: [{ type, at, gain }]` pass-through (recommended: eight lines).
Available sfx names (audio/synth.mjs `SFX`): `mxblue click marker boing land sparkle swoosh
whoosh riser chime success thump pop`. Music kinds: `hook board demo banner outro silent`
(aliases `intro→board`, `title→hook`, `chapter→banner`); BPM 100 (`BEAT` 0.6 s).

**Current fifth-cut timing** (edl.json, 420.0 s): hook 0–23.85 (hk.1 @4.7, hk.2 @12.49, hk.3
@16.42, tail 1.6 = trim 1.1 + hold 0.5) · card 23.85–87.79 (prelude 0.9, push out) · create
86.99–116.82 · banners 2.3 s · start 29.3 s · who 38.7 s · if 73.1 s · then 36.8 s · canvas 76.0 s
· save 25.0 s · outro 409.55–420.01 (`dur: 9.0` stretched to 10.46 by `lead 1.6 + 8.26 + tail 0.6`).

---

## (d) The overlay layer — where an "explainer inset" plugs in

**Elements** are created once in `ovInit()` (engine.js ~537) as the innerHTML of `#ov`, each
looked up into `OV[id]`: `ov-spot` (SVG, evenodd dim path `ov-spot-dim`), `ov-ambient`,
`ov-glow`, `ov-spot-label` (`.ov-tag`), `ov-hint`, `ov-hint-ring`, `ov-ripples`, `ov-callouts`,
`ov-keys`, `ov-anno` (SVG brackets `ov-anno-all`/`ov-anno-any`), `ov-anno-and`, `ov-anno-or`,
`ov-truth` (filled from `window.ANNO.truthHtml()`), `ov-cursor`. Z-order is CSS: spot 8 ·
ambient 9 · glow 10 · tag 11 · hint 12/13 · ripple 14 · callout 16 · anno/truth 17 · keys 18 ·
cursor 30; `#cap` is 50. **Add a new element here** (e.g. `<div id="ov-inset" class="ov-inset">`)
and its id to the `for … of [...]` list; give it a z between 17 and 30 (say 19).

**Drawing** — `drawOverlays(take, f, cam, xf, look)` runs once per frame for the *primary* take
only, and only when `look.overlay > 0` (it is 0 during the second half of a push and during a
card prelude); otherwise `hideOverlays()` runs — **every new element must be hidden there too**.
Inside: `t = f/fps`, `m = mapper(cam, xf)` (app→screen: `m.pt(x,y)`, `m.rect(r)`, scale `m.s`),
`alpha = look.alpha · look.overlay`, `uiHidden = look.card && look.card.blend > 0.5` (card mode:
no cursor, hints or ripples). Each overlay kind is a filter over `take.events` by `type` and a
time window (`e.f/fps … + e.dur`), faded with `envelope(t, a, b, fadeIn, fadeOut)`. `#ov` is
`display:none` whenever no take is live, so insets on **slides** are drawn by the slide itself.

**Event flow for a new recorder event**
1. recorder (`lib/recorder.mjs`, inside `openRecorder`): a method in `direct` (spread onto the
   returned `rec`) that measures with `rectOf(target)` (visible box, cut to clipping ancestors,
   app px) and calls `event(type, data)` → pushes `{ f: take.frames.length, type, ...data }`.
   `f` is the index of the *next* frame recorded, i.e. the first frame showing the new state.
   Nothing is emitted while `dry`. **`rec.mark(type, data)` already exists** as a generic
   escape hatch — `rec.mark('inset', { kind: 'condition', dur: 4.5, side: 'left' })` works today
   with no recorder change; a real method adds the sfx and the rect.
2. take JSON (`.work/<theme>/capture/take-<name>.json`): `{ name, fps, dsf, view, cursorEnd,
   frames: [[imgId, cx, cy, down], …], events: [...] }`.
3. edl.mjs: touches an event only if it needs a cue (`caption` → subtitles/voice; `sfx`,
   `focus` → `thump`, `cardMode off` → `whoosh`). An `inset` would add e.g. `{ type: 'pop', t:
   at, gain: .6 }` — three lines in the `for (const e of take.events)` loop.
4. engine.js `drawOverlays`: filter `ev` for `type === 'inset'` live at `t`, build/update the
   element, fade with `envelope`.

**Proposed inset event** `{ type: 'inset', kind, dur, side: 'left'|'right', anchor?: rect(app),
shelf?: true, cam?: false }` and a `compose/insets.js` module (`window.INSETS = { [kind]: {
html(), update(el, k, t) } }`, like `anno.js`) holding the four illustrations as inline SVG/HTML
in the palette above, 420×220, radius 12, white, 1 px `#e4e8ec`, `--el-overlay` shadow.

**The shelf (making room)** — `mapper(cam, xf)` already applies a stage transform
`xf = { s, dx, dy }` about the frame centre to BOTH the picture (`drawStage`) and every overlay,
and `renderFrame` builds it per take (today only for push in/out and the banner's 4 % shrink).
Ease it during a live `inset` with `shelf: true`:
`SHELF_LEFT = { s: 0.82, dx: +280 }` → window x **630–1850**, y 121–892 (title bar included), the
left gutter is 630 px → inset at **x 105–525, y 409–629** (centred on the window's vertical
centre 519). `SHELF_RIGHT = { s: 0.82, dx: −280 }` → window x 70–1290, inset at **1395–1815**.
The picture's bottom clip (`ctx.rect(… H + WIN.ay + WIN.ah + 1)`) and the caption band are
untouched. Caveat: a spotlight's auto-zoom (z 1.28 → picture 1905 px wide) would overflow the
frame under the shelf; give those spotlights `cam: false` (one `filter` in `cameraTrack`:
`.filter(e => e.cam !== false)`) or use `s: 0.76`.

**Placement without the shelf**: draw in screen px from `m.rect(anchor)` (like callouts), clamp
to `x ∈ [24, 1896]`, `y ∈ [24, 960]` (never below 980 — the subtitle band), and prefer the corner
away from `cap.avoid` (the panel rect the recorder attached to the line).

---

## (e) The card-mode contract, and lighting one part of the card

**Events** (recorder → `take.events`): `cardRect {rect}` — the tracked element's visible box,
measured every frame while `rec.track(sel, clip='.bb__stage')` is on, emitted only when it moved
> 0.5 px (43 in the fifth-cut card take; growth bursts at f 260–267, 486–494, 609–618, 740–748,
1576–1582, 1692–1693). `cardMode {on}` — masked card vs whole window, blend eases over 0.9 s.
`cardFreeze {on}` — hold the picture (a dialog/popover covers the card); release crossfades
back over 0.4 s (`eff[f]`, `mix[f]`), and the recorder hurries to `pace 0.3` while frozen.
`cardAnno {on}` — brackets + truth panel, eased over 0.5 s. `cardParts {parts}` — `{ first,
group, block }` rects (app px, 0.1 px) that the annotation points at; **the latest emission ≤ f
wins**, so it may be re-emitted any time.

**Track** (`cardTrack(take)` → `state.cardTracks[item.id]`): per frame `rect, blend, cx, cy, cz,
eff, mix, anno (eased), parts`; `holdFrame` (frame before the last `cardMode off`); `live[]` (the
un-frozen rect). `cardAt(ct, f)` → `{ rect, blend, cam, anno, parts }`, passed as `look.card`.
Camera: `cardCam(rect)` (see (b)) lagged by `k = 1 − e^(−1/(fps·0.22))`; **while annotated the
camera slides the card left by `ANNO_SHIFT` 210 screen px** (`tgt.cx += anno·210/(s0·z)`).

**`drawAnno(m, card, alpha)`** (engine.js ~571): needs `parts.first` and `parts.group`, else
hides. `cardR = m.rect(card.rect)`; outer bracket at `x = cardR.x − 26`, from `first.y − 4` to
`group.bottom + 4` (hook 14 px, grows from the middle with `easeOut(k)`); inner bracket at
`group.right + 10`; AND label right-aligned at `(bx − 22, mid)`; OR label at `(cardR.right + 22,
group.centreY)`; truth panel at `(cardR.right + 22, cardR.y + 6)`, 560 wide, fades in from
k 0.25. At cs.5 the card was `{208, 234.5, 520×488.5}` → z 1.684, ≈ 905×850 on screen at x ≈
298–1203 after the shift, so the right column **x 1225–1896 (671 px)** holds the panel. The
panel's copy is static in `anno.js` (`truthHtml()`), hard-wired to this rule — make it take the
rule's chips as data if the second real rule is to get one.

**"Light one part, dim the rest" — proposed**
- recorder: `cardLight(part)` → `event('cardLight', { part })` (`null` clears); parts measured
  right before with `cardParts({ title, who, first, group, block, then, journey })` from
  `.bb__head`/`.bb__titlebtn`, `.bb__ifwho`, `.bb__ifrow.is-cond` (first), `.bb__ifgroup`,
  `.bb__if`, `.bb__ifaction`, `[aria-label="The sign-in journey this produces"]`. Measure only
  while **not frozen** (a frozen picture is older than the live layout) and after the spring
  settles (≈ 0.3 s after the last `cardRect` burst).
- engine `cardTrack`: collect `light[f] = { part, k }` with `k` eased over 0.35 s like `anno`.
- engine draw (after `drawAnno`, while `uiHidden`): one SVG path, `fill-rule: evenodd`,
  `d = cardBox − roundRect(m.rect(parts[part]) padded 6·z, radius 8·z)`, fill a **light veil**
  `rgba(242,244,247,0.72)` (the ground colour — keeps the frame light; never the dark
  `--spot-dim`) plus a 1.5 px hairline around the lit part in `#eb5424` at .9 (the one orange of
  that frame) or ink. Elements `#ov-card-veil` (SVG) + `#ov-card-veil-path`; hide in
  `hideOverlays`. The box is `m.rect(look.card.rect)` — the blended rect, so it is right during
  freezes too.

---

## (f) Free space for a 420×220 inset at c1.1, c4.1, c5.1, c6.2 (fifth-cut captures)

Mapping at rest: `sx = 216 + 1.0333·ax`, `sy = 50 + 1.0333·ay`. When a spotlight smaller than
864×540 app px fires with no explicit `focus` resting, `cameraTrack` auto-zooms to **z 1.28**
(`fit(rect, 1.28, 90, 0)`), eases 0.9 s in, holds until `e.f + (dur + 0.35)`, eases 0.9 s back;
at z 1.28 `s = 1.3227`, `cx` is forced to 720 (picture 1905 px > frame) and `cy = clamp(spot.cy,
351.5, 548.5)` — so the picture shows app y `cy ± 351.5`, mapped `sx = 960 + (ax − 720)·1.3227`,
`sy = 515 + (ay − cy)·1.3227`. An inset of 420×220 screen px = **406.5×212.9 app px** at rest.

| line | take · take-time · film-time | camera during the line | what is on screen (app px → screen px) | free rectangles ≥ 420×220 | verdict |
|---|---|---|---|---|---|
| **c1.1** "Every policy lives here…" | create · 0.40–5.88 s · 87.39 s | rest, z 1; no spotlight/focus; cursor glides to (760,430) then hovers rows 2 and 4 at x≈519 (screen ≈752, y 461 / 556) | rail x 0–235 (→216–459); header y 0–52; "Policies" title x 266–730, y 85–140 (→491–970, 138–195); **New policy** x 1308–1408, y 84–119 (→1568–1671, 137–173); search x 266–566, y 180–215; filters x 987–1330; table header y 245–280 (→303–339); rows from y 284, 46 px each to the fold | **none inside the picture** — the gap between the title and the button is 550×90 app; the Status/Actions column strip is 236 px wide | (1) **SHELF-LEFT** (inset at 105–525 × 409–629); or (2) rest on the right gutter: **[1476, 700, 420×220]** covers Status/Actions of rows 9–13 (app x 1220–1408, y 630–840, background rows, not the hovered ones) plus 192 px of ground |
| **c4.1** "If is when the rule applies…" | if · 1.77–6.79 s · 193.49 s | spotlight f 53 on the If section **[873,150,558×257]** → auto-zoom z 1.28, cy 351.5, hold to f≈160, back by f≈187; visible app y 0–703 | panel (avoid) [872,108,560×784] → x 1161–1901; spotlight hole → **[1162, 249, 738×340]** (+11 px pad); Start pill [290,157,570×34] → 391–1145 × 257–302; rule card [208,234.5,520×208] → **283–971 × 360–636**; default rule [209,490,520×165] → 283–968 × 698–916 (dimmed); dock off-picture | **none** — left column 81–283 (202 px); under the card 636–698 (62 px) | (1) **SHELF-LEFT + `cam:false`** on the spotlight (recommended; the If section stays the subject at z 1, the inset explains "a condition" on the left); or (2) over the dimmed default rule **[290, 700, 420×220]** — dimmed, not the subject, but product is under it |
| **c5.1** "Then is the decision…" | then · 1.93–6.22 s · 269.05 s | spotlight f 58 on the Outcome tiles **[914,231,496×122]** → z 1.28, cy 351.5, hold to f≈170 | panel as above; hole → **[1217, 356, 656×161]**; rule card [209,234.5,520×392] → **283–971 × 360–878**; default rule from app y 673 → 940+ (30 px visible) | **none** — left column 202 px; under the card 878–980 (102 px) | **SHELF-LEFT + `cam:false`** (the only clean option; the card's who/if rows at [290, 380] are the wrong thing to cover) |
| **c6.2** "Fold the panel away…" | canvas · 2.53–4.84 s · 308.75 s | rest, z 1; click **Close the panel** at f 118 (t 3.93) on [1403,113,24×24] (→1666, 167); panel gone ≈ f 125, chain re-centred ≈ f 135 | before f 118: panel → 1117–1696 × 162–972; rule card [209,234.5,520×428] → 432–969 × 292–734; default rule from y 709 (→783); stage x 72–864 (→290–1109). **After f≈135**: stage x 72–1424 (→290–1687); card [492,234.5,520×428] → **724–1262 × 292–734**; side columns app 72–485 / 1019–1424 = **413 / 405 app px → 427 / 418 screen px** | before: none (left column 142 px). after: the two side columns, y 205–770 — a 420 fits only edge-to-edge (≤ 4 px margins) | put the board inset **after the close** (t ≥ 4.3 s in the take) at **380×200**: left **[312, 330]** or right **[1290, 330]**; or SHELF during c6.1; better: move the board explainer to the top of c6.3 (panel already closed, line is 5.9 s) |

Also useful: during every spotlight the whole picture except the hole is dimmed `rgba(14,20,28,.5)`
(`ov-spot-dim`, evenodd path over y ≤ 980) — an inset over dimmed content reads as the second lit
thing, which is acceptable only when what it covers is not being talked about.

---

## (g) Files that must change, per deliverable (+ what re-captures)

**Re-capture rule.** Take pacing is baked into frames, so a changed line spoken *in a take*, a
new recorder event, or a changed action needs `node capture.mjs --only <a,b>` (takes before the
first named run dry to rebuild state; unnamed ones between run dry; ones after the last named are
skipped; `card` is last in `TAKES`, so `--only card` dry-runs the seven before it). A changed line
spoken *on a slide* (hk.*, out.*) needs no capture — `node render.mjs edl` re-lays it out.

**VO regeneration is automatic by hash**: `capture.mjs` calls `ensureVO` (writes
`.work/vo/lines.json`, runs `audio/vo.py`), which skips any id whose `.json` carries the same
`sha1(text|voice|rate|pitch)` and re-synthesises the rest (`en-IN-NeerjaExpressiveNeural`,
`+10%`). `render.mjs` only *loads* `.work/vo` — so after editing `lines.mjs` run
`node capture.mjs --dry` (or any capture) once before `render.mjs edl`. A line whose text changes
must keep its id only if the take that says it is re-captured; otherwise give it a new id.

1. **New intro and outro (light, premium)**
   - `compose/slides-v4.js` + `compose/slides-v4.css` (new; or rewrite `slides-v3.*`): `hook` and
     `outro` defs per (c); `background: transparent`; the hook's last frame = `#bg` + the card box
     from `COMPOSE.cardHold('card')` (target `{539.1, 90, 841.7×850}`, radius `12·m.s` ≈ 19.4 → or
     the mask's 21.9 until the nit in (b) is fixed), shadow `0 18px 50px rgba(22,32,44,.2)`.
   - `compose/index.html`: link the new css/js after `slides-v3.*` (or replace them).
   - `compose/engine.js`: nothing, unless `SLIDES4` is added to `slideDef` (1 line); optional
     `look.alpha` fade for `outKind 'fade'` takes (5 lines) for the save→outro seam.
   - `storyboard/film-v2.mjs`: the hook item (`lines`, `lead/gap/tail`, `music`, `out: 'cut'`),
     the outro item (`dur`, `lines`, `lead`); the `save` take gets `out: 'fade'` if the seam fix
     lands.
   - `storyboard/lines.mjs`: `hk.*`, `out.*` (VO auto).
   - `lib/edl.mjs`: the two sfx blocks keyed `s.slide === 'hook'|'outro'` (or a generic `s.sfx`).
   - `audio/synth.mjs`: only if a new music `LEVELS` kind is wanted.
   - No capture.

2. **Explainer insets (c1.1, c4.1, c5.1, c6.x)**
   - `compose/insets.js` (new): the four illustrations (Finance→Workday sign-in; a condition =
     what/how/against what; If→Then; the board = ordered chain), `window.INSETS`.
   - `compose/engine.js`: `ovInit` (+`#ov-inset`), `drawOverlays` (+inset block),
     `hideOverlays`, `cameraTrack` (`cam:false` filter), `renderFrame` (shelf `xf` easing).
   - `compose/compose.css`: `.ov-inset*` styles; while there, de-slop `.ov-glow`/`.ov-ambient`.
   - `lib/recorder.mjs`: `inset()` in `direct`; `spotlight({ cam })` passes `cam` through
     (`rec.mark` works for a prototype without this).
   - `lib/edl.mjs`: optional `pop` for `inset` events.
   - `storyboard/takes-v2.mjs`: calls in `create()`, `iff()`, `then()`, `canvas()`.
   - `compose/index.html`: `<script src="insets.js">` before `engine.js` (like `anno.js`).
   - Capture: `--only create,if,then,canvas` (who/start dry; save/card skipped — but see 4).

3. **Card scene — light one part, better AND/OR**
   - `lib/recorder.mjs`: `cardLight(part)`; `cardParts` accepts the wider part set.
   - `storyboard/takes-v2.mjs` `cardScene()`: measure + light per beat (cs.1 title, cs.2 who,
     cs.3 first row, cs.4/5 group, cs.6 then/journey), re-measure after each growth burst.
   - `compose/engine.js`: `cardTrack` (+`light`), a `drawCardLight` after `drawAnno`, `ovInit`
     (+`#ov-card-veil`), `hideOverlays`; recolour/reshape `drawAnno` geometry if the panel moves.
   - `compose/anno.js`: `truthHtml(rule)` data-driven; copy in plain admin English.
   - `compose/compose.css`: `.ov-anno__*`, `.ov-truth*` to the info/notice tints; `.ov-card-veil`.
   - `storyboard/lines.mjs`: `cs.*` (VO auto).
   - Capture: `--only card`.

4. **Board chapter rewritten with a second real rule**
   - `storyboard/lines.mjs`: `c6.*` (and `CHAPTERS[canvas].kicker`); `c7.*` if the review now
     reads two rules.
   - `storyboard/takes-v2.mjs` `canvas()`: build rule 2 through the connector plus + panel
     (name, Who, If, Then Deny), order it, keep it; update the end asserts (`.bb__card:not
     (.is-terminal)` count 2, both titles) and `save()`'s (`.bdlg-rev__rules > li` count 2,
     spotlight the second `li`); `storyboard/film-v2.mjs` unchanged unless a banner changes.
   - `storyboard/BEATS-v5.md` → `BEATS-v6.md` (the beat table), `INVENTORY-2026-09-14.md` for
     any new selector (Deny tile, the second rule's Who dialog).
   - Capture: `--only canvas,save` (state carries; then card is skipped → run `--only card` if
     3 also changed, or one `--only canvas,save,card`).

5. **Line changes only**: `storyboard/lines.mjs` → `node capture.mjs --dry` (VO by hash) →
   for slide lines `node render.mjs edl`; for take lines `--only <take>`. Keep lines under ~100
   characters (one subtitle row at 29 px in a 1560 px pill).

6. **Always after any of the above**: `node render.mjs edl && node render.mjs preview --at …`
   (stills in `.work/light/preview/`), then `video`, `audio`, `mux` → `out/policy-engine-demo-light.mp4`.
