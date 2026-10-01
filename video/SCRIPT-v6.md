# Policy Engine — the film, sixth cut

**Product film** · about 6 min · 1920×1080, 30 fps · **light theme only** · voice-over,
subtitles in their own band, music and interface sound.

The product is the presenter. The real console — the **current build**: commit `5221ea1` plus
the run-build worktree (locked vertical board, Collapse/Expand density pill, outcome-first Then,
Who's *Add people*, pending condition groups, the auto-opening board tour that the capture
suppresses) — is filmed frame by frame on a stopped clock; a narrator (Indian English) explains
it; every spoken word is also a subtitle in a band *under* the picture, so nothing on screen is
ever covered. Every line is in `storyboard/lines.mjs`; every beat below is paced to its spoken
line; what each take does on screen, control by control, is in `storyboard/BEATS-v6.md`; the
tokens, positions and motion are pinned in `storyboard/DESIGN-v6.md`.

The story names what it shows. The application is **Workday**; the people are the **Finance**
and **Executives** groups and **Priya Sharma**; the places are the **Office Network**, a device
that is not **Corporate managed**, the **Anonymizers** zone (and, once, **Sanctioned
countries**); the factors are **miniOrange Push** and **TOTP Authenticator**. Whenever one of
them appears on the card or in the panel, the narrator says it.

Earlier cuts: the second added a mascot (withdrawn), the third a device intro, keycaps and
gradient highlights, the fourth replaced the whiteboard with the rule card, the fifth put a dark
stage under the bookends and brackets and a truth table on the card. **This cut** puts the
product's name and one sentence on the film's own light ground, reads a *finished* rule off its
card part by part before the AND / OR showcase, plays five small explainer illustrations beside
the product wherever a concept (not a control) is explained, and gives the board chapter a real
second rule to order.

**Gone since the fifth cut**

- The dark stage — navy ground, mesh, floor grid, vignette — under the intro and the outro.
  Both bookends now sit on the compositor's light ground and nothing else.
- The device shots: the graphite slab, the three captured screens, the pop-outs with gradient
  edges and sheens, the trim-down to the card.
- The *Who. If. Then.* headline, on the beat, in both bookends; the gradient hairline.
- The live rebuild of the card: the wipe back to *New rule*, the title typing itself, the parts
  arriving one line at a time, and `cardFreeze` while dialogs covered it. The card is built dry
  and is finished before the first frame.
- In the board chapter: the empty rule, the duplicate, the leave guard, *clear that extra rule*,
  and the Delete beat. Lines `hk.2`, `hk.3` and `c6.13` are removed; `cs.8`, `c6.11` and `c6.12`
  are new; every `c6.x` and `c7.2` carry new text.

---

## Structure

| | Length | What happens |
|---|---|---|
| **Intro** | ≈ 8.5 s | Bare ground. The Xecurify lockup, then **Policy Engine**, then the one sentence the film unpacks. They leave in reverse order; the slide ends on bare ground and cuts. |
| **The card** | ≈ 35 s | The finished rule card rises in. Three labels — Who · If · Then — then each part is lit in turn behind a veil; the card slides left for the AND bracket, the OR bracket and the truth table, whose rows light on the words; the Then part is lit; the mask opens to the board and pushes into the console. |
| **Demo** | seven chapters | The Lite console. Chapter 01 follows the card scene directly; 02–07 are each opened by a push banner whose kicker carries the names. Five explainer insets play beside the shelved window on the five lines that explain a concept. |
| **Outro** | ≈ 7 s | The last window dissolves to ground; lockup, **Policy Engine**, *Access policy, in plain English.*, the address — and the frame holds still. |

Film order (`storyboard/film-v2.mjs`):

```
hook (slide, 8.4 s min, cut) → card (mode 'card', prelude 0.6, push) → create →
banner 02 → start → banner 03 → who → banner 04 → if → banner 05 → then →
banner 06 → canvas → banner 07 → save (fade) → outro (slide, 6.6 s min, held frame)
```

Lengths are what `lines.mjs`'s voice and the EDL's rules give (`dur` on a slide is a minimum;
the voice stretches it). The card scene's 35 s is the design's budget; the voice as
synthesised runs it nearer 40 s — see the note under the card table.

---

## Intro — ≈ 8.5 s (`hk.1`)

Slide `hook` (`compose/slides-v4.js`), transparent: the compositor's ground — `#f2f4f7` with
its drifting dot grid — is the only ground. Three things, centred, nothing else:

| element | what | where (screen px) |
|---|---|---|
| Lockup | `xecurify-logo.png` at 0.8× (362×97), unaltered | top 280 |
| Name | **Policy Engine** — DM Sans 128 / 600, tracking settling −0.010 → −0.025 em | top 472 |
| Sub | *Who may sign in, on what conditions, and what they must prove.* — 40 / 400, ink-2 | top 660 |

The sub-claim on screen is the spoken line minus the name, so eye and ear agree.

| t | Motion | Says |
|---|---|---|
| 0.0–0.6 | Ground only. | — |
| 0.6–1.3 | Lockup fades in, rising 12 px. | — |
| 1.2–1.9 | Name fades in, rising 20 px; its tracking tightens as it lands. A thump on 1.2. | `hk.1` *Policy Engine. Who may sign in, on what conditions, and what they must prove.* |
| 2.4–3.0 | Sub fades in, rising 12 px. | — |
| 3.0 → X | Hold. Nothing moves. | — |
| X = max(7.0, line end + 0.2) ≈ 7.1 | Sub lifts out (0.45 s); name follows 0.1 s later; lockup fades 0.2 s after that. | — |
| ≈ 7.9 → end | Bare ground for at least 0.6 s, then **cut**. | — |

The slide is `dur: 8.4` minimum, `lead: 1.2`, `tail: 1.5`, so with the line as synthesised
(≈ 5.7 s to its last word + 0.3) it runs ≈ 8.4 s. The exits are keyed to the end of the
spoken line, never to fixed seconds, so a longer voice is never cut off.

**Hand-over.** The intro cuts to ground; the card take then draws the finished rule card
**rising in over 0.6 s** (its `prelude`): alpha eased out, a 16 px lift, no chrome, no overlay,
and a soft thump 0.3 s in as it lands. The shadow, the 12 px radius and the picture are the
engine's own — there is nothing for the slide to reproduce.

---

## The card — ≈ 35 s (`cs.1`–`cs.8`), filmed in card mode

A real take (`card`, filmed **last**, shown second) in a throw-away policy *Finance — adaptive
access (walkthrough)* on Workday. The whole rule — **Finance — off the office network**; Who:
Finance, Executives, Priya Sharma; If: Network zone · not in zone · Office Network, AND a group
of Device profile · does not match · Corporate managed **or** Network zone · in zone ·
Anonymizers; Then: Allow with specific methods (miniOrange Push, TOTP Authenticator) and a
device remembered 14 days — is built **dry**, unfilmed, with the panel open. The settling frames
are cut; the recorder tracks the card's rect; the compositor shows **only the card** — masked
to its own 12 px radius, enlarged to at most 1000×850, centred on (960, 515), on the ground. The
take is holds and compositor events only: nothing is clicked, typed or edited on camera.

The parts are measured once after the cut: the title, the two rows that name Finance,
Executives and Priya Sharma (on a rule that holds a group, Who is drawn as condition rows inside
member A — that is how the product reads it back), the Office Network row, the group, the If
block, and the `then` row with the action row. A part is lit by a veil in the ground colour
(`rgba(242,244,247,.72)`) with a hole per lit rect, each edged in the frame's one orange
(`#eb5424`, 1.5 px), and a white label pill — **Who**, **If** or **Then** — to its left.

| Line | On the card |
|---|---|
| *(prelude 0.6 s + hold 0.6 s)* | The finished card rises in and stands still. |
| `cs.1` *One rule, one card. Who, if, then.* | No veil. Three label pills — **Who · If · Then** — appear beside the who rows, the Office Network row and the then row, 0.15 s apart. |
| `cs.2` *Who: Finance, Executives, and Priya Sharma.* | Veil over the card; only the two who rows lit. Label **Who**. |
| `cs.3` *If: the sign-in is not from the Office Network.* | Only the Network zone · not in zone · Office Network row lit. Label **If**. |
| `cs.4` *And a group: a device not Corporate managed, or an Anonymizer network.* | The group lit — Device profile · does not match · Corporate managed **or** Network zone · in zone · Anonymizers. Label **If**. |
| `cs.5` *Outside the group, everything must hold. That is AND. Inside it, one is enough. That is OR.* | The veil clears. **AND first**: the card slides 210 px left; an info-blue bracket (`#1189d4`) grows down the card's left edge from the first condition to the group's foot, labelled **AND** — *all of these must hold*; the panel *How the rule reads* fades in at the right with the expression `[Finance, Executives or Priya Sharma] AND [not on Office Network] AND ( [unmanaged device] OR [Anonymizer network] )`, the sub-line *Outside the group, every check must hold. Inside it, one is enough.*, and a four-row table at 28 %. **On the word "Inside"** (≈ 4.9 s in): the notice-amber bracket (`#b07a00`) grows beside the group, labelled **OR** — *any one of these*; the OR keyword and the parenthesised pair light in the expression. |
| `cs.6` *One of them: true. Both: true. Neither: false.* | Table header *Unmanaged device · Anonymizer network · The group*. On "One of them" rows 1–2 light together — yes/no → **true**, no/yes → **true**; on "Both" (≈ 2.2 s) row 3 — yes/yes → **true**; on "Neither" (≈ 3.9 s) row 4 — no/no → **false**. Each lit row tints its result green or red and, for 0.6 s, the expression's parenthesis group with it. |
| `cs.7` *Then: allow, with a second factor.* | Brackets and panel leave (0.5 s), the card slides back. Then the `then` row and the action row are lit — **Allow** with a **Second factor** chip; the journey beneath names miniOrange Push and *Remembered 14 days*. Label **Then**. |
| `cs.8` *Now, for real, for Workday.* | The veil clears; the mask opens to the whole window over 0.9 s (a whoosh); zoom is reset if the toolbar offers it; the take pushes into chapter 01. |

Timing, from the voice as synthesised: 1.2 + 4.3 + 3.9 + 3.2 + 5.2 + 8.9 + 6.0 + 3.3 + ≈ 3.8 ≈
**40 s**, against the design's 35 s estimate and 37 s budget. DESIGN-v6's one permitted cut is
`cs.6` — the rows then light with the OR stage — which brings it to ≈ 34 s; nothing else in the
scene is negotiable. AND is only ever info-blue, OR only ever notice-amber, and both appear only
in this beat.

Everything shown is a Lite capability. The model is two levels deep — rule → group →
conditions — so the film shows one group inside the rule. End asserts: the title is the rule
name; one loose member and one group; two conditions in the group; the group joins with *or*;
the then chip reads Second factor; the journey names miniOrange Push and Remembered 14 days.

---

## Demo — seven chapters in Lite (screen actions in `BEATS-v6.md`)

Conventions: the narrator speaks, the words appear in the band as they are said; the cursor
does the work; the camera eases onto dialogs and the card when the script says so and frames
every spotlight on its own (1.28×) unless something is already framed — or the spotlight
carries `cam: false`, which every spotlight under an explainer inset does, so the shelved
picture never overflows the frame. A spotlight dims everything but the thing being named
(`rgba(33,37,41,.35)`) inside a 2 px slate hairline — no turning gradient, no glow. A shortcut
shows **only its keycaps** — white caps with a hairline and a solid side, top centre of the
window; typing shows nothing. Every key clicks MX Blue; every click has its own click. The
board walkthrough never opens (its seen-flag is seeded) and the console is filmed with
`idp.brand = current`. One browser session runs `create → start → who → if → then → canvas →
save`: the Workday policy created in the first take is the one saved in the last.

| # | Chapter — banner kicker | Lines | The story |
|---|---|---|---|
| 01 | **A new policy** — *Workday — Finance adaptive access.* (no banner: the card scene pushes straight in) | `c1.1`–`c1.5` | Finance signs in to Workday every morning — the **finance-workday** inset plays while the cursor rests on rows of the Policies list. Every policy lives here, one row each. New policy: the name **Workday — Finance adaptive access**, the application **Workday SAML** (one policy can cover several), Create. A draft — nothing changes for anyone yet. |
| 02 | **Template or scratch** — *A ready-made policy, or a blank rule.* | `c2.1`–`c2.5` | Two ways to begin. Use a template: the gallery, *Whose templates* (miniOrange's or your own), a look inside **Zero-Trust baseline** — read every rule before you take it; one click would make it yours. Today, Start from scratch: a blank rule on the board, open in the panel on the right; Expand cards so the rule reads on the card from here on. |
| 03 | **Who** — *Finance, Executives — and Priya Sharma.* | `c3.1`–`c3.6` | The panel edits one rule in the order a rule is written — Who, If, Then. Name it **Finance — off the office network**; the card follows as you type. Who starts as everyone — the **who** inset. Add people: the Finance and Executives groups, then Priya Sharma by name. Save 3 selected; the rule is about exactly them, and the card reads them back. |
| 04 | **If** — *Off the Office Network, on a risky device.* | `c4.1`–`c4.9` | If is when the rule applies — the **if** inset. A condition is three choices: Network zone · not in zone · Office Network; zones are your own library; the card reads it back the moment it is set. The real world: a group of Device profile · does not match · Corporate managed, then Network zone · in zone · Anonymizers — OR inside the group, AND to the office check. Changed your mind? Add Sanctioned countries, remove a check, ungroup; the card keeps up. |
| 05 | **Then** — *Allow with a second factor — or deny.* | `c5.1`–`c5.6` | Then is the decision — the **then** inset; a hover on Deny, then Allow. Allow, but only with a second factor. Prove it with specific methods — the product refuses to leave the rule impossible to pass — miniOrange Push and TOTP Authenticator. Remember a verified device for fourteen days. One card tells the whole story: the journey the sign-in walks. |
| 06 | **The board** — *Two rules, top to bottom.* | `c6.1`–`c6.12` | Fold the panel away. A policy is a list of rules, read top to bottom; the first match decides — the **first-match** inset, the board still under it. Add a second rule from the plus on the connector below Finance: **Anonymizers — block**. Who stays as everyone; If: Network zone · in zone · Anonymizers; Then: **Deny** — no factor is ever asked for; the card reads it back (Deny, Refused). Order matters: the strictest check goes first, so Move up puts the block rule above Finance. A walk down the chain with the camera still — Anonymizers refused here, everything else falls through to Finance, then to the default. Switch a rule off without deleting it, and back on. Alt + ↑ moves a rule, Ctrl + Z brings it back (keycaps). Collapse the cards for the order alone, expand them for the detail. Scroll the chain; zoom in, out, reset. Nothing on the board dims: only a catch-all rule shadows what sits below it, and a zone check is not one. |
| 07 | **Save it** — *Both rules, read back in plain English.* | `c7.1`–`c7.4` | Review & Save reads every rule back in plain English: rule one, Anonymizers, deny (*Access is blocked. No alternative path.*); rule two, Finance off the office network, then a second factor. Confirm & Save — the status pill goes Draft → Inactive. Back on the list the Workday row waits, inactive until you switch it on, with its application and its rules. |

Chapter 06 is the chapter that teaches how a policy is evaluated: **read top to bottom, the
first match decides, otherwise fall through** — to the next rule, and at the end to the default.

### Explainer insets

Five small illustrations (`compose/explain.js`), each 420×220 on a white card with a 12 px
radius, Lucide glyphs in slate, one brand-orange highlight, and the orange **sign-in token** as
the only thing that travels. Each plays **once**, on the one line that explains its concept,
never on a line that names a control, and never across a cut, push, banner or dialog. While an
inset is live the whole window **shelves right** — eased to 0.82 of its size and 280 px across
(0.5 s in, 0.4 s out) — and the inset sits in the freed column at (105, 409), vertically
centred on the window, over bare ground, covering nothing. It lands with a soft pop 0.3 s in
and stays for the rest of the line plus a breath (never under 2.5 s); the caption band and the
ground do not move.

| Inset — title | Plays on | What it draws | Under the shelf |
|---|---|---|---|
| **finance-workday** — *Finance signs in to Workday* | `c1.1` | A person tagged Finance → a shield with three rule bars (*The policy*) → a **W** app tile (*Workday*); the token walks the row. | The cursor glides and rests on two rows of the list. No dialog, no spotlight. |
| **who** — *Who is it about?* | `c3.3` | Chips Finance, Executives, Priya Sharma (PS avatar); a brace gathers them into a mini rule card whose first row lights orange — *One rule, for them*. | The Who section spotlit, camera at rest. |
| **if** — *If: what the sign-in carries* | `c4.1` | The token (*a sign-in*) with leaders to Office Network, Corporate managed, Location; a green tick lands on each — *Every check must hold*. | The If section spotlit, camera at rest. |
| **then** — *Then: the decision* | `c5.1` | A rule line and three lanes: Allow, **Allow, with a second factor** (highlighted), Deny; the token takes the middle lane and the other two step back. | The Outcome tiles spotlit; the Allow click lands after the inset has left. |
| **first-match** — *First match decides* | `c6.2` | A dashed rail past Rule 1, Rule 2, Default (*if nothing matches*); the token drops past rule 1 and stops at rule 2, which leads to a **Second factor** tile. | The panel already closed; nothing moves. |

---

## Outro — ≈ 7 s (`out.1`)

Slide `outro`, transparent, mirroring the intro so the bookends rhyme. It starts 0.8 s before
the `save` take ends: the last window **dissolves to ground** while the outro begins beneath it.

| element | what | where (screen px) |
|---|---|---|
| Lockup | 0.8× (362×97), unaltered | top 250 |
| Name | **Policy Engine** — 112 / 600 / −0.025 em | top 442 |
| Line | *Access policy, in plain English.* — 36 / 400, ink-2 | top 614 |
| URL | `idp.xecurify.com` — 30 / 500, ink-3 | top 710 |

| t | Motion | Says |
|---|---|---|
| 0.0–0.8 | The save take's window fades out; the slide shows nothing yet. | — |
| 0.6–1.3 | Lockup fades in, rising 12 px. | — |
| 1.0–1.7 | Name fades in, rising 16 px, tracking tightening. A thump on 1.0. | `out.1` *Access policy, in plain English. Policy Engine, by Xecurify.* |
| 2.2–2.8 | Line fades in, rising 10 px. | — |
| 3.4–4.0 | URL fades in, rising 8 px. | — |
| 4.0 → end | **Hold.** Nothing moves, nothing fades; the music's long release rings under it. The last frame is held — no forced fade, no blur. | — |

`dur: 6.6` minimum, `lead: 1.0`, `tail: 0.6`; with the line as synthesised (≈ 5.7 s incl. its
0.3 s) it runs ≈ 7.3 s. No "by miniOrange" — the lockup already says it; no button, no chips.

---

## Sound

- **Voice:** `en-IN-NeerjaExpressiveNeural`, +10 % rate — a warm, quick Indian-English narrator.
  57 lines; a line's synthesis is keyed by a hash of its text, so unchanged ids keep their voice.
- **Music:** one bed, 100 BPM, D major with a lift to B minor. `board` (pad and a soft pluck,
  no kick) under the intro **and** the card scene; the `demo` groove under every take; `banner`
  (fill and hit) on each chapter banner; `outro` open, with a 2.6× release so it rings under the
  held last frame. It ducks 7 dB under every spoken line. The synth's fuller `hook` level is no
  longer called for by the film.
- **Interface and cues** (`lib/edl.mjs`): a thump at 1.2 s in the intro as the name lands, and
  at 1.0 s in the outro; a soft thump 0.3 s into the card take as the card lands from its
  rise-in; a whoosh as the card's mask opens to the window and another as it pushes into the
  console; a soft **pop** 0.3 s after each explainer inset lands; a thump on every camera
  focus; a chime on every spotlight; a dry mouse click on every click, panned by cursor x;
  Cherry MX Blue on every key; swoosh — thump — swoosh on every banner; a small arpeggio when
  the policy saves. The save → outro dissolve is silent. Gone with the fifth cut's stage: the
  intro's whoosh and riser, the pop and sparkle per pop-out, and the swoosh of the card's wipe.

## Producing it

```bash
cd video
node capture.mjs --theme light --app http://localhost:64343      # voice first (.work/vo), then all eight takes → .work/light/capture
node render.mjs all --theme light                                 # edl → video → audio → mux → out/policy-engine-demo-light.mp4 (+ .srt)
```

`node capture.mjs --theme light --app <url> --dry --no-vo` performs every take without filming —
the selector check (~1 min); with voice on, `--dry` also re-synthesises every changed line.
`--only card` re-films just the card scene (the seven takes before it run dry to reach the app
state); `--only create,who,if,then,canvas,save,card` is the sixth cut's re-capture list (`start`
is unchanged and runs dry). `node render.mjs preview --theme light --at 3,40,120` renders stills
of the edit to `.work/light/preview/`. Accept a film only after `ffmpeg -v error -i out/x.mp4 -f
null -` prints nothing. **The app URL must serve the current build** — in the served page,
`/src/brand/tour/BoardTour.tsx` must exist. The sixth cut is light only: `--theme dark` remains
in the tooling, but nothing in this cut was designed or checked for it.
