# Research v6 — how premium SaaS films open and close, and what that means for ours

Task R1 for the sixth cut. Scope: the intro (<= 9 s) and outro (<= 7 s) only. Headline of both is the
product name **Policy Engine**, with the Xecurify wordmark. Light theme; ground = the compositor's
`--ground` `#f2f4f7`; subtitles in the 100 px band under the picture; no mascot, no 3D tilt; every
visual is HTML/CSS/SVG rendered frame by frame.

Date of research: 14 Sep 2026. Everything below is split into **verified** (I fetched the page and
it says so), **secondary** (a third-party page says so; I could not reach the primary), and
**unverified / judgment** (my own design call, labelled as such). Where I could not see a video's
pixels I say so; a text fetch of a page cannot tell me what is on screen in a film's first five
seconds, and I did not pretend otherwise.

---

## 0. What the fifth cut does today (so we know what is being replaced)

Read from `compose/slides-v3.css`, `compose/slides-v3.js`, `storyboard/film-v2.mjs`,
`storyboard/lines.mjs`, `.work/vo/*.wav`.

- **Intro** (`hook`): a dark stage `#0a1120` with three drifting radial "mesh" blobs (orange, blue,
  violet), a perspective floor grid (`rotateX(63deg)`), a vignette, the words **Who. If. Then.** as
  the main line with an orange-to-blue gradient rule, then a graphite "device" slab with a conic
  gradient rim, a blurred orange floor glow, a sheen, and three parts popping out of the screen. The
  Xecurify logo is shown **inverted** (`filter: invert(1) hue-rotate(180deg)`) to sit on the dark.
  Voice: `hk.1` 7.80 s + `hk.2` 3.94 s + `hk.3` 6.19 s = **17.9 s of speech**, plus `lead 4.7`,
  gaps and `tail 1.6`, so the intro runs about **25 s**. The brief asks for <= 9 s.
- **Outro** (`outro`): the same dark stage; Who. If. Then. again with icons, `easeOutBack` pops
  (scale 1.2 -> 1, 60 px rises), a gradient-shimmer title, "Access rules you can read.",
  "idp.xecurify.com · by miniOrange". `dur: 9.0`, voice `out.1` = **8.76 s**. Brief: <= 7 s.
- The compositor's own light tokens (compose.css `:root`): `--ground #f2f4f7`, `--ground-dot
  rgba(33,37,41,.085)`, `--slate #4a5560`, window `#ffffff` with hairline `rgba(33,37,41,.1)` and
  shadow `rgba(22,32,44,.2)`, tag `#ffffff` on `#212529` text. Caption: DM Sans 500 29px/1.3,
  `letter-spacing -0.01em`, white tag, `bottom: 18px` inside `CAP_BAND = 100`.
- Console tokens (src/brand/kit.css + rebrand.css): `--brand #eb5424`, hover `#d64c21`, active
  `#a73c1a`, subtle bg `#fdeee9`, subtle border `#f9cabb`; text `#212529 / #495057 / #646c75`;
  borders `#dee2e6 / #ced4da / #eef0f2`; surfaces `#ffffff / #f8f9fa / #f1f3f5`.
- Fonts the compositor already loads (compose/index.html): **DM Sans** `opsz 9..40, wght 300-700`,
  JetBrains Mono 400/500, Kalam 400/700. Music: 100 BPM (`audio/synth.mjs`, `BPM = 100`), so one
  beat = 0.6 s, one bar = 2.4 s; the `outro` bed has `release: 2.6` (a ritardando feel).
- Logo asset: `public/xecurify-logo.png`, **452 x 121 px**, a full lockup: orange ring-and-key
  mark with a green leaf, black lowercase "xecurify", and a grey "by miniOrange" line. There is
  **no SVG** in the repo. At 1080p this PNG should not be scaled above about 1.25x (565 px wide) or
  it goes soft; and because the lockup already says "by miniOrange", an outro URL line must not
  repeat it.

Diagnosis in the owner's words: the "AI slop" is the mesh gradients, conic rims, blur glows,
perspective grid, sheens, back-eased pops and the inverted logo. None of that appears in any of the
verified references below.

---

## 1. Reference by reference

Legend: **V** verified from the page fetched · **S** secondary source · **U** could not verify.

### Linear
- **V** `linear.app/changelog`: entries embed **videos** (with 0.25-2x speed controls); product UI is
  shown as a **bare window with rounded corners and a shadow, no device frame**, on a neutral
  ground; headlines are feature names in plain case ("Priority inbox", "Team initiatives").
- **V** `linear.app/now/product-launches` and `linear.app/now/introducing-loops`: launch posts use
  the **feature name as the headline** ("Introducing Loops"), hero media on a light ground, bare
  window, rounded corners + shadow, no device frame; no video on those two pages.
- **V** `linear.app/brand`: wordmark used "in all references where space permits", **monochrome
  preferred**, "plenty of space around" assets; Mercury White `#F4F5F8`, Nordic Gray `#222326`; the
  brand blue is for backgrounds, not the wordmark.
- **V** `linear.app/` hero: "The product development system for teams and agents", light theme,
  animated product UI rather than a film.
- **S** LogRocket, "Linear design": the copied "Linear look" is dark + gradients + glass + glow, and
  the article itself names **light mode as the unmet opportunity**. (This is exactly the look the
  owner is asking us to drop.)
- **U** I could not watch any Linear launch film, so I cannot state their first five seconds or
  their end card.

### Stripe
- **V** `stripe.com/newsroom/brand-assets`: wordmark is **"slate and blurple" on light**, white on
  dark, "Do not use any other colour for the wordmark." (Hex not on the page; the secondary page I
  reached lists an outdated cyan, so I am not quoting a Stripe hex.)
- **V** `stripe.com/blog/top-product-updates-sessions-2025`: light theme, product images on
  **clean minimal backgrounds without bezels or window frames**, bold sans headlines; no embedded
  video.
- **V** `stripe.com/sessions/2025/product-keynote`: white ground + purple accent; demo segments live
  inside the keynote, not as separate product films.
- **S** Superside on the Sessions keynote: "perfect chapter cuts", high energy; a stage film, not
  a product film. **U** first five seconds and end cards of Stripe product films.

### Vercel
- **V** `vercel.com/geist/introduction`: Geist Sans + Geist Mono, "a high contrast, accessible
  color system". **V** `vercel.com/geist/brands`: clear space around the logo "defined by the
  height of our symbol"; separate light/dark logotype variants; the triangle symbol alone only
  where space is limited. **V** Geist is on Google Fonts, weights 100-900 (served as static faces).
- **V** `vercel.com/ship`: "Ship what's next", light/dark logo variants, no embedded keynote on
  the page. **U** the Ship keynote film itself.

### Notion
- **V** `notion.com/releases/2025-09-18` ("Notion 3.0: Agents") and `/releases/2025-04-15`
  (Notion Mail): **light theme**, UI shown as **bare windows with subtle shadows, no device
  frames**, animated GIFs/WEBPs rather than films, headings instead of lower-thirds.
- **U** the launch films (Make with Notion keynote exists on YouTube; not watched).

### Figma
- **V** `figma.com/blog/how-we-shaped-the-visual-identity-for-config-2025`: **Figma Sans
  (condensed) for display**; light theme for SF, dark for London; motion designed from day one;
  "**the expressive type takes a bit more time to animate on** ... the functional type is quicker";
  the opening film deliberately ran at **15 fps** for a handmade feel. Glyphs used sparingly as
  "moments", not wallpaper. Lower-thirds not discussed.
- **S** Superside on "All the launches at Config 2025" (video verified to exist via YouTube
  oEmbed: title + author Figma): **no voice-over**, clean screen recordings, fast cuts, upbeat
  music, "the interface does the talking". **U** its title card and end card.

### Okta
- **S** Athletics case page (`athleticsnyc.com/work/okta`): typeface refinement with Dalton Maag;
  motion is central: "the Aura's fluid, frictionless nature when animated dramatizes the process
  of seamless verification"; the mark's facets double as UI icons; warm portraiture. **S**
  Aeonik Pro as the brand face (Fonts In Use / The Brand Identity).
- **V** `okta.com/blog/.../launch-week-oktane-edition-september25`: no embedded video; it links out
  to a "release overview video". **U** what that video shows.

### Atlassian
- **V** `atlassian.design/foundations/motion`: durations **interactions 50-150 ms, transitions
  150-400 ms**; "**exit motion faster than entrances**"; four curves:
  `ease-out bold cubic-bezier(0, 0.4, 0, 1)` (arrive fast, settle; panels entering),
  `ease-in-out bold cubic-bezier(0.4, 0, 0, 1)` (scaling / repositioning),
  `ease-in practical cubic-bezier(0.6, 0, 0.8, 0.6)` (exits),
  `ease-out practical cubic-bezier(0.4, 1, 0.6, 1)` (subtle everyday entrance, fades).
- **V** `atlassian.design/foundations/typography`: heading xxlarge 32/36 bold down to xxsmall
  12/16; body 16/24, 14/20, 12/16; a UI scale (useful only as ratios).
- **S** Brand type is Charlie Display / Charlie Text (OH no Type Co.), in-app is Atlassian Sans.
  **U** Atlassian product films.

### Rippling
- **S** Design Ahoy / A+ Type / Dan Schwer: in-house rebrand; brand adjectives **"premium,
  powerful, and playful"**; **Rippling Sans**, a variable wide sans with contrast; 3D ripple
  assets in plum/yellow/tan; marketing leans on illustration and OOH more than UI screenshots.
  The Rippling blog post itself returned 403. **U** films.

### Ramp
- **S** shadcn.io/design/ramp, Refero, Fonts In Use: near-black ink `#1C1B17` and a lime accent
  (`#E5FE54` on one page, `#ffe74c` on another; the two secondary sources disagree, so treat the
  hex as unverified); **TWK Lausanne at a single weight (400)** carrying the whole heading
  hierarchy by size alone; **the accent appears "only where money moves": CTAs, live counters,
  active states**. Fonts In Use confirms Lausanne + Burgess, lowercase wordmark (Feb 2021 entry).

### 1Password
- **V** `1password.com/blog/1password-brand-refresh` (20 Apr 2023): bespoke **Agile Sans**
  ("friendly and trustworthy ... a dash of charm"); palette Bits Blue, Intrepid Blue, Biscuit; the
  core blue **desaturated "so it feels more tactile"**; the lock **moved out of the wordmark** to
  lead the logo; the brand animation is the lock opening with rings bursting out, i.e. **the mark
  animates in a way that means something**; live-action photography for the human side.

### Cloudflare
- **S** logotyp.us / DesignPieces: orange `#F38020` ("Tango"), grey `#404041`, Inter in use;
  Cloudflare's own `/logo/` now redirects straight to a ZIP so the primary page could not be read.
  **U** films.

### Descript
- **V** `descript.com/underlord`: light theme, "Your all-in-one video agent", static images, no
  embedded film. **S** Arcade / TapVid describe the Underlord launch film as personality-led
  narration matching a playful brand, the opposite register from ours. **U** its cards.

### Loom
- **S** Brand New (24 Nov 2020, paywalled index): blue, radial/circular, lowercase sans wordmark.
  I could not reach a primary or a reliable hex. **U** everything else.

### Arc / The Browser Company
- **V** Hacker News thread on the Arc Max film: a **livestream** ("content starts at 7:24, runs to
  13:36"), theatrical "shopping-channel" pastiche, deliberately informal; commenters split between
  "parody" and "their brand". **V** MacStories: founder-presented demos, straightforward. A
  personality play we should not copy for an IdP admin product.

### Cross-industry motion specs (for exact numbers)
- **V** IBM Carbon (v10 guidelines): productive `standard (0.2,0,0.38,0.9)`, `entrance
  (0,0,0.38,0.9)`, `exit (0.2,0,1,0.9)`; expressive `standard (0.4,0.14,0.3,1)`, `entrance
  (0,0,0.3,1)`, `exit (0.4,0.14,1,1)`; durations fast-01 70 ms, fast-02 110, moderate-01 150,
  moderate-02 240, slow-01 400, slow-02 700. Expressive is "for occasional, important moments"
  such as opening a new page.
- **V** Material 3 tokens (material-web `_md-sys-motion.scss`): `emphasized (0.2,0,0,1)`,
  `emphasized-decelerate (0.05,0.7,0.1,1)`, `emphasized-accelerate (0.3,0,0.8,0.15)`, `standard
  (0.2,0,0,1)`, `standard-decelerate (0,0,0,1)`, `standard-accelerate (0.3,0,1,1)`; durations
  50 ms to 1000 ms in 50 ms steps.
- **V** Emil Kowalski, "7 practical animation tips": **ease-out for anything entering or leaving**;
  never scale from 0, start at **0.93+**; UI under 300 ms; blur only as a last resort (2 px).
- **V** EBU R 95 (publication page): **action-safe 3.5 %, graphics-safe 5 % per edge**, so on
  1920 x 1080 keep type inside x in [96, 1824], y in [54, 1026]; our picture is 1920 x 980 above
  the band, so the type zone is y in [54, 926].
- **V** Netflix Timed Text general requirements: a subtitle event **>= 5/6 s and <= 7 s**, **<= 2
  lines**, centre-justified. (Our band already does this; the 29 px caption is fine.)
- **S** Superside "16+ B2B SaaS video examples": Slack opens on the pain then cuts to **real app
  footage**; Airtable "tight UI demos"; Figma reel "interface does the talking". Demosmith / moonb
  (marketing blogs, unverified stats): the whole library should share **one intro, outro, type and
  pacing**; retention "statistics" on those pages are unsourced and I do not rely on them.

---

## 2. Principles distilled (minimal, light, premium)

1. **The name is the headline; the wordmark is the signature.** Linear, Notion and Stripe headline
   the feature name in plain case; the logo sits with clear space, unaltered, in its own colours
   (Linear: monochrome preferred, "plenty of space"; Stripe: "no other colour for the wordmark";
   Vercel: clear space = one symbol height). So: "Policy Engine" large; the Xecurify lockup small,
   un-inverted, never recoloured, >= 121 px of clear space.
2. **One ground, no stage.** Every verified light reference puts UI on a flat neutral ground with a
   soft shadow: no mesh, no glow, no floor. The intro and outro must be **transparent slides on
   the compositor's `#f2f4f7` + dot grid**, so the cut into the console is invisible.
3. **Bare window, never a device.** Linear changelog, Notion releases, Stripe updates: rounded
   window, hairline, shadow, no bezel. Drop the graphite slab; if the console appears in the
   intro it is the compositor's own window chrome.
4. **One accent, used where the action is.** Ramp's lime appears "only where money moves";
   Stripe's blurple is a single accent on white. Orange lives in the mark and in at most one
   product highlight (the AND/OR moment), never in gradients or text decoration.
5. **Type does the work, one family, few weights.** Ramp carries a whole hierarchy at weight 400 by
   size alone; Figma reserves slow "expressive" motion for display type. DM Sans (already loaded,
   its `opsz` axis gives proper display cuts), weights 400/500/600 only, tight negative tracking on
   the headline, no gradient-fill text, no shimmer.
6. **Motion vocabulary: fade + small rise, ease-out in, faster ease-in out.** Atlassian and
   Kowalski agree: ease-out entrances, exits faster than entrances, translate 12-24 px not 60,
   scale from 0.93+ not 1.2 -> 1 with overshoot. Film beats may run 0.5-0.9 s (longer than UI's
   300 ms because the viewer is watching, not waiting; **judgment**, supported by Figma's
   "expressive type takes more time").
7. **Meaningful motion only.** 1Password's lock opens; Okta's Aura "dramatizes verification".
   If anything in our bookends moves beyond a fade, it should *mean* something (e.g. a hairline
   that becomes the board's connector). No sheens, no spinning rims.
8. **Beat-locked, short.** 100 BPM -> 0.6 s beats. Intro 9.0 s = 15 beats; outro 6.6 s = 11 beats.
   A single spoken sentence per bookend: at this voice's measured 13-16 chars/s, **<= 75
   characters, one full stop** fits 5-6 s.
9. **Consistency across the library.** Same type, same band, same ground for intro, chapters,
   outro (secondary sources, but uncontroversial). The caption band stays on and unchanged.
10. **Ending: rest, don't flourish.** Nothing verified shows a CTA button in a product film's
    last frame; brand pages emphasise the mark with space. End held on name + wordmark + URL,
    no fade to black (the ground *is* the brand's paper), music resolves under it.

### Type sizes for 1920 x 1080 (judgment, derived from the safe zone and the 29 px captions)
| Role | Size / weight / tracking / line-height | Colour |
|---|---|---|
| Headline "Policy Engine", intro | **128 px** DM Sans 600, `-0.025em`, 1.0 | `#212529` |
| Headline, outro | **112 px** DM Sans 600, `-0.025em`, 1.0 | `#212529` |
| Kicker "Xecurify Identity Provider" | 30 px DM Sans 500, `+0.01em` (sentence case, no caps) | `#646c75` |
| Sub-claim (one line) | 40 px DM Sans 400, `-0.005em`, 1.25 | `#495057` |
| URL "idp.xecurify.com" | 30 px DM Sans 500, `0` | `#646c75` |
| Secondary chips (Who / If / Then, if used) | 32 px DM Sans 500 in 1 px `#dee2e6` pills, `#ffffff` fill, radius 999 | `#495057` |
| Hairline | 1-2 px `#dee2e6` (or `rgba(33,37,41,.1)` to match the window) | - |
| Lockup | PNG at 1.0x = 452 x 121 (max 1.25x); clear space >= 121 px | as supplied |

Contrast on `#f2f4f7`: `#212529` about 14.6:1, `#495057` about 8.0:1, `#646c75` about 5.2:1 (all
pass AA at these sizes).

Easing names used below (all verified curves):
`OUT-B = cubic-bezier(0, 0.4, 0, 1)` (Atlassian ease-out bold) · `OUT-P = cubic-bezier(0.4, 1, 0.6, 1)`
(ease-out practical, for fades) · `INOUT-B = cubic-bezier(0.4, 0, 0, 1)` (moves, masks) ·
`IN-P = cubic-bezier(0.6, 0, 0.8, 0.6)` (exits) · `M3-DEC = cubic-bezier(0.05, 0.7, 0.1, 1)`
(a heavy object arriving, e.g. the window).

Frame: picture 1920 x 980 (band y 980-1080). Vertical centre of the picture = 490. Beat grid:
b1 0.0, b2 0.6, b3 1.2, b4 1.8, b5 2.4, b6 3.0, b7 3.6, b8 4.2, b9 4.8, b10 5.4, b11 6.0, b12 6.6,
b13 7.2, b14 7.8, b15 8.4, end 9.0.

---

## 3. Intro storyboards (<= 9.0 s), best first

### Intro A: "Name, then hand over" (recommended)
Ground only, name, one sentence, then it clears for the AND/OR showcase. Nothing else on screen.

| t (s) | What happens | Spec |
|---|---|---|
| 0.0-0.6 | Ground `#f2f4f7` with the compositor's dot grid; caption band empty. Music pad on b1. | slide background transparent |
| 0.6-1.3 | Xecurify lockup fades in, top-centred: 452 x 121 at (734, 300). | opacity 0 -> 1 0.7 s OUT-P; rise 12 px OUT-B |
| 1.2-1.9 | "Policy" then "Engine" (stagger 0.1 s) fade + rise into one line centred at y = 500. 128 px / 600. Tracking settles `-0.01em -> -0.025em` over the same 0.7 s. | opacity OUT-P, translateY 20 -> 0 OUT-B |
| 1.2 | VO starts. Suggested line (<= 75 chars, writer to finalise): *"Policy Engine. Who may sign in, on what conditions, and what they must prove."* | caption in the band as usual |
| 2.4-3.0 | Sub-claim fades + rises under the name at y = 600, 40 px / 400: **"Who may sign in, on what conditions, and what they must prove."** (mirrors the VO so eye and ear agree) | opacity OUT-P 0.6 s, translateY 12 -> 0 OUT-B |
| 3.0-7.2 | Hold. Nothing moves. (Premium is confidence: 4.2 s of stillness while the sentence is spoken.) | - |
| 7.2-7.9 | Sub-claim exits: fade + rise 10 px. | IN-P 0.45 s (exit faster than entrance) |
| 7.4-8.1 | Name exits the same way; lockup fades 7.6-8.2. | IN-P 0.45-0.6 s |
| 8.2-9.0 | Ground alone for 0.8 s (24 frames). **Cut** at 9.0 to the card scene, whose first frame sits on the identical ground. | `out: 'cut'` |

Notes: type on screen never exceeds three lines; the only colour is the mark. If the VO runs past
7.6 s, shorten the line; do not stretch the slide.

### Intro B: "Signature, divider, name; the three words as a footnote"
The wordmark leads; a hairline divides; the name reveals through a mask; Who / If / Then appear as
small chips (secondary, because the owner ruled them out as the main line).

| t (s) | What happens | Spec |
|---|---|---|
| 0.0-0.4 | Ground. | - |
| 0.4-1.0 | Lockup fades in, left of centre at (560, 430) (452 x 121). | OUT-P 0.6 s, no move |
| 0.9-1.4 | Vertical hairline 1 px `#dee2e6`, 121 px tall, at x = 1064 grows from its centre. | scaleY 0 -> 1 INOUT-B 0.5 s |
| 1.2-2.0 | "Policy Engine" 112 px / 600 wipes in to the right of the line, from x = 1104, vertically centred on the lockup. | `clip-path: inset(0 100% 0 0)` -> `inset(0 0 0 0)` INOUT-B 0.8 s |
| 1.2 | VO: *"Policy Engine. One card per rule: who, when, and what they must prove."* | - |
| 2.4 / 3.0 / 3.6 | Chips **Who** · **If** · **Then** appear on the beat, centred as a row at y = 640, 32 px / 500, pills `#ffffff` with 1 px `#dee2e6`, 14 px gaps. | each: opacity OUT-P 0.4 s, translateY 10 -> 0 OUT-B |
| 3.6-7.6 | Hold. | - |
| 7.6-8.4 | Everything fades together (chips at 7.6, name 7.7, lockup 7.8), 8-10 px rise. | IN-P 0.5 s |
| 8.4-9.0 | Ground; cut at 9.0. | - |

Why second: the chips are a fourth element and the horizontal lockup + name is wide (about
1,300 px); it is still calm, but A says the same with less.

### Intro C: "The name becomes the console"
The name sits on the ground; the window grows under it and the name shrinks into the kicker.
More motion, still flat. Third because it is the most to get right.

| t (s) | What happens | Spec |
|---|---|---|
| 0.0-0.5 | Ground. | - |
| 0.5-1.2 | "Policy Engine" 128 px / 600 fades + rises to centre (y = 470). Lockup fades in below at y = 600 (452 x 121). | OUT-P / OUT-B, 0.7 s |
| 1.0 | VO: *"Policy Engine. Every sign-in rule, written so anyone can read it."* | - |
| 1.2-4.6 | Hold. | - |
| 4.6-5.5 | A 2 px hairline `rgba(33,37,41,.1)` draws at y = 560, 240 px wide, centred. | scaleX 0 -> 1 INOUT-B 0.9 s |
| 5.5-6.6 | The hairline becomes the top edge of a white surface (`#ffffff`, radius 14, hairline border, shadow 0 14px 40px `rgba(22,32,44,.2)` fading in) that grows to the compositor's window rect (the engine's WIN layout for the 1440 x 900 app). The name scales 128 -> 30 px (transform scale 0.234) and moves to the kicker position above the window; the lockup fades out 5.5-6.0. | INOUT-B 1.1 s; shadow opacity 0 -> 1 over the last 0.5 s |
| 6.6-8.4 | The window fills with the first frame of the card scene (engine draws it). Hold. | - |
| 8.4-9.0 | Kicker fades (IN-P 0.4 s); cut at 9.0 with the window already at rest. | - |

Risk: the engine draws the window on the canvas; this slide must reproduce its exact rect,
radius and shadow or the cut will pop. Do it only if A and B are rejected.

---

## 4. Outro storyboards (<= 7.0 s), best first

Outro budget: use **6.6 s (11 beats)**; the `outro` music bed's `release: 2.6` lets the last chord
ring under the held frame. Voice: one short line <= 45 chars, e.g. *"Policy Engine, by Xecurify."*
(about 2.5 s). The current `out.1` (8.76 s) cannot be kept.

### Outro A: "Rest" (recommended)
| t (s) | What happens | Spec |
|---|---|---|
| 0.0-0.6 | The last take fades to ground (the engine's usual dissolve). | OUT-P 0.6 s |
| 0.6-1.3 | "Policy Engine" 112 px / 600 fades + rises to y = 470. | OUT-P; translateY 16 -> 0 OUT-B |
| 1.0 | VO: *"Policy Engine, by Xecurify."* | - |
| 1.5-2.1 | Lockup fades in below, 452 x 121 at (734, 560) (clear space 121 px from the name). | OUT-P 0.6 s, no move |
| 2.4-3.0 | URL "idp.xecurify.com" 30 px / 500 `#646c75` fades in at y = 740. | OUT-P 0.6 s, translateY 8 -> 0 |
| 3.0-6.6 | **Hold, nothing moves.** Music resolves. Last frame held; no fade-out (the ground is the paper). | - |

### Outro B: "Three become one"
| t (s) | What happens | Spec |
|---|---|---|
| 0.0-0.6 | Dissolve to ground. | OUT-P |
| 0.6 / 1.0 / 1.4 | Chips **Who** · **If** · **Then** (32 px / 500, hairline pills) appear in a row at y = 420 with 14 px gaps. | OUT-P 0.4 s each, translateY 10 -> 0 |
| 1.8-2.5 | The three chips slide together and fade as the name "Policy Engine" 112 px / 600 fades in at y = 500 (the words collapse into the product name: the film's argument in one move). | chips: translateX toward centre 24 px + fade IN-P 0.5 s; name OUT-P / OUT-B 0.7 s |
| 2.8-3.4 | Lockup below at y = 610. | OUT-P |
| 3.6-4.2 | URL at y = 760. | OUT-P |
| 4.2-6.6 | Hold. | - |

### Outro C: "One line"
| t (s) | What happens | Spec |
|---|---|---|
| 0.0-0.6 | Dissolve to ground. | - |
| 0.6-1.3 | Lockup (left) and "Policy Engine" 96 px / 600 (right) share one line centred at y = 490, separated by a 1 px x 121 px hairline that draws 0.9-1.4. | OUT-P; hairline scaleY INOUT-B |
| 2.4-3.0 | URL 30 px / 500 centred at y = 640. | OUT-P |
| 3.0-6.6 | Hold. | - |

Why A first: it is the only one where nothing "does" anything after 3.0 s, and stillness reads as
premium on a light ground. B earns its one move by restating the argument; C is a lockup, not a
close.

---

## 5. What to remove from the compositor for v6 (checklist)

- `slides-v3.css`: `--h3-*` dark tokens, `.hk3-bg` radial meshes, `.hk3-grid` perspective plane,
  `.hk3-vig`, `.hk3-floor` blur, `.hk3-slab` gradient, `.hk3-shine` and sheens, `.hk3-pop__glow`
  conic, the `invert(1) hue-rotate(180deg)` on the logo, the gradient rules (lines 115, 375), the
  gradient-shimmer title (line 362).
- `slides-v3.js`: `easeOutBack` pops (scale 1.2 -> 1, 60 px rises); replace with OUT-B and
  12-20 px.
- `film-v2.mjs`: hook `lead 4.7 / tail 1.6 / three lines` -> one line, `dur 9.0`; outro
  `dur 9.0` -> `6.6`, one short line.
- `lines.mjs`: replace `hk.1-3` and `out.1` with one <= 75-char intro line and one <= 45-char
  outro line; resynthesise and re-measure (`.work/vo/*.wav`, byteRate 96000).
- Ask brand for an SVG of the lockup; until then render the PNG at 1.0x.

---

## 6. What I could not verify (honest list)

- **No film was watched.** WebFetch returns page text, not frames. Every "first five seconds" and
  "end card" claim for Linear, Stripe, Vercel, Notion, Figma, Okta, Atlassian, Rippling, Ramp,
  1Password, Cloudflare, Descript, Loom and Arc films is therefore **not verified**; what I did
  verify is how those companies frame UI on their launch and changelog pages, their published
  motion and type rules, and their logo-use rules, which is what the storyboards are built on.
- Stripe's hex values (the one secondary page I reached lists an obsolete cyan); Ramp's exact
  lime (two secondary sources disagree); Loom's identity beyond the Brand New teaser; Cloudflare's
  own logo page (redirects to a ZIP); Rippling's own blog post (403); Okta's own brand post
  (the URL resolved to the blog hub); Vercel Geist type scale and grey hex values (interactive
  page, values not in the HTML); Material's docs page (SPA; values taken from the material-web
  token file instead); BBC subtitle guidelines (host blocked; Netflix used instead).
- Advids / Pepsales / Demosmith "retention" percentages are marketing copy with no cited study; I
  used none of them as a basis for a decision.
- Type sizes, the 0.5-0.9 s film-beat durations, and the 13-16 chars/s speech rate are my own
  derivations (the last from the measured `.work/vo` files), not published rules.

## Sources (fetched)
linear.app/changelog · linear.app/now/product-launches · linear.app/now/introducing-loops ·
linear.app/brand · linear.app · stripe.com/newsroom/brand-assets ·
stripe.com/blog/top-product-updates-sessions-2025 · stripe.com/sessions/2025/product-keynote ·
vercel.com/geist/introduction · vercel.com/geist/brands · vercel.com/ship ·
fonts.googleapis.com (Geist / Inter / Instrument Sans weights) · notion.com/releases/2025-09-18 ·
notion.com/releases/2025-04-15 · figma.com/blog/how-we-shaped-the-visual-identity-for-config-2025 ·
youtube.com/oembed (NHodnYFUT_I) · athleticsnyc.com/work/okta ·
okta.com/blog/product-innovation/launch-week-oktane-edition-september25 ·
atlassian.design/foundations/motion · atlassian.design/foundations/typography ·
designahoy.com/work/rippling-brand · shadcn.io/design/ramp (via search) ·
fontsinuse.com/uses/38468/ramp-identity · 1password.com/blog/1password-brand-refresh ·
logotyp.us (Cloudflare, via search) · descript.com/underlord · news.ycombinator.com/item?id=37753840 ·
macstories.net (Arc Act II) · v10.carbondesignsystem.com/guidelines/motion/overview ·
github.com/material-components/material-web tokens/versions/v0_192/_md-sys-motion.scss ·
emilkowal.ski/ui/7-practical-animation-tips · tech.ebu.ch/publications/r095 ·
partnerhelp.netflixstudios.com (Timed Text general requirements) ·
superside.com/blog/saas-video-examples · blog.logrocket.com/ux-design/linear-design ·
underconsideration.com (Loom, index only).
