/* -----------------------------------------------------------------------------
   The seventh cut's two teaching slides, on the film's own ground.

   CONCEPT (`concept`, BEATS-v7 §03). What a policy is, in three states that
   follow the voice: the application it protects (pc.1), the rules it is made
   of, in order (pc.2), and the three parts of one rule (pc.3). Once pc.3 has
   been spoken everything leaves, so the edit cuts to the first banner from
   bare ground.

   PRIORITY (`priority`, BEATS-v7 §04.5). The same three rules as two boards,
   the order before and the order after. While pr.2 is spoken the broadest
   rule is checked first and matches — "Allowed" — and the rule that should
   have blocked the sign-in is left below it, its description turning red on
   "blocked". Nothing leaves: the edit cuts to the live reorder.

   The sections are transparent: the compositor's #bg is the only ground.
   Every opacity, transform and colour is a function of the slide's clock `t`
   (no CSS transitions or keyframes, no wall clock, no randomness). States are
   keyed to the lines' cues (`params.cues[id] = { at, dur, words }`); the
   word-timed moments in pr.2 read `words` and, where a cue has none, estimate
   the word's time from its position in the sentence.
   -------------------------------------------------------------------------- */
;(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const seg = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1))
  const q = (el, s) => el.querySelector(s)
  const qa = (el, s) => [...el.querySelectorAll(s)]

  /* A CSS cubic-bezier as a function of progress: x(u) is monotonic, so solve
     x(u) = p for u by bisection and read y(u) there. */
  const bezier = (x1, y1, x2, y2) => {
    const at = (a, b, u) => 3 * a * (1 - u) * (1 - u) * u + 3 * b * (1 - u) * u * u + u * u * u
    return (p) => {
      if (p <= 0) return 0
      if (p >= 1) return 1
      let lo = 0
      let hi = 1
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2
        if (at(x1, x2, mid) < p) lo = mid
        else hi = mid
      }
      return at(y1, y2, (lo + hi) / 2)
    }
  }
  // DESIGN-v6 §1.4
  const OUT_B = bezier(0, 0.4, 0, 1) // entrances that move
  const OUT_P = bezier(0.4, 1, 0.6, 1) // fades in
  const INOUT_B = bezier(0.4, 0, 0, 1) // fills, moves
  const IN_P = bezier(0.6, 0, 0.8, 0.6) // exits of type

  /* Colours are the slide's own custom properties (slides-v7.css), read once
     per slide from the computed style, so the stylesheet stays the one place a
     colour is written and a theme block there reaches the per-frame mixing. */
  // the light values from BEATS-v7, for a property that reads empty (a stylesheet not yet applied)
  const LIGHT = { surface: '#ffffff', line: '#e4e8ec', 'line-2': '#d3dae1', brand: '#eb5424', tint: '#fdeee9', 'ink-3': '#646e79', 'neg-fg': '#a5142b' }
  const hex = (s) => {
    const m = String(s).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (!m) return null
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  const palette = (el, names) => {
    const cs = getComputedStyle(el)
    const out = {}
    for (const n of names) out[n] = hex(cs.getPropertyValue(`--v7-${n}`)) ?? hex(LIGHT[n])
    return out
  }
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k))
  const rgb = (c, alpha = 1) => (alpha >= 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha.toFixed(4)})`)

  const px = (v) => `${v.toFixed(2)}px`

  /* A line's cue, or a stand-in laid out the way the edl lays out a slide
     (lead 0.8, 3.5 s per line, gap 0.4) when the slide is shown without one. */
  function cueOf(params, ids, id) {
    const c = params?.cues?.[id]
    if (c) return c
    const k = ids.indexOf(id)
    return { at: 0.8 + k * 3.9, dur: 3.5 }
  }

  /* When a word is spoken, in slide seconds. `words` carry punctuation-stripped
     text and times from the line's start; without them the word's character
     offset in the sentence is spread over the spoken length (dur − 0.3). */
  function wordAt(cue, re, text) {
    const w = cue.words?.find((x) => re.test(x.text))
    if (w) return cue.at + w.t
    const toks = String(text ?? '').split(/\s+/)
    let off = 0
    let found = false
    for (const tok of toks) {
      if (re.test(tok.replace(/^[^\w']+|[^\w']+$/g, ''))) {
        found = true
        break
      }
      off += tok.length + 1
    }
    const spoken = Math.max(0.5, cue.dur - 0.3)
    return cue.at + (found && text.length ? off / text.length : 0.5) * spoken
  }

  /* ============================================================================
     CONCEPT
     ============================================================================ */
  const CONCEPT_LINES = ['pc.1', 'pc.2', 'pc.3']
  const BARS = ['Off the office network', 'Known risk network — block', 'Default — everyone else']

  const concept = {
    build(el) {
      el.innerHTML = `
        <div class="v7 v7c">
          <div class="v7c-col">
            <div class="v7c-app"><i class="v7c-mark"></i><span>Policy · Workday</span></div>
            <div class="v7c-bars">
              ${BARS.map(
                (name, i) => `
              <div class="v7c-bar${i === 0 ? ' is-first' : ''}">
                <b class="v7c-num">${i + 1}</b>
                <span class="v7c-name">${name}</span>
                ${i === 0 ? '<span class="v7c-parts"><i>Who</i><i>If</i><i>Then</i></span>' : ''}
              </div>`,
              ).join('')}
            </div>
          </div>
        </div>`
      el._v7 = { pal: palette(q(el, '.v7'), ['surface', 'tint']) }
    },
    update(el, t, dur, params) {
      if (!q(el, '.v7c')) concept.build(el)
      const { pal } = el._v7
      const c1 = cueOf(params, CONCEPT_LINES, 'pc.1')
      const c2 = cueOf(params, CONCEPT_LINES, 'pc.2')
      const c3 = cueOf(params, CONCEPT_LINES, 'pc.3')

      /* The exit: once pc.3 has ended (E) the bars and then the chip lift away,
         0.6 s in all, leaving bare ground for the cut. Never later than 0.8 s
         before the slide ends, so a short tail still ends bare. */
      const E = c3.at + c3.dur - 0.3 // the spoken end (cue.dur carries a 0.3 s breath)
      const X = Math.max(c3.at + 0.6, Math.min(E, dur - 0.8))

      // pc.1 — the application chip: opacity 0→1, rise 10 px, 0.5 s OUT-B
      const app = q(el, '.v7c-app')
      const ka = OUT_B(seg(t, c1.at, c1.at + 0.5))
      const xa = IN_P(seg(t, X + 0.1, X + 0.6))
      app.style.opacity = (ka * (1 - xa)).toFixed(4)
      app.style.transform = `translate3d(0, ${px((1 - ka) * 10 - xa * 10)}, 0)`

      // pc.2 — the three rule bars: each opacity 0→1, rise 8 px, 0.45 s OUT-B, stagger 0.12 s
      const xb = IN_P(seg(t, X, X + 0.45))
      qa(el, '.v7c-bar').forEach((bar, i) => {
        const a = c2.at + i * 0.12
        const kb = OUT_B(seg(t, a, a + 0.45))
        bar.style.opacity = (kb * (1 - xb)).toFixed(4)
        bar.style.transform = `translate3d(0, ${px((1 - kb) * 8 - xb * 8)}, 0)`
      })

      // pc.3 — bar 1 fills with the brand tint (0.4 s INOUT-B); its parts pills fade in, stagger 0.1 s
      const first = q(el, '.v7c-bar.is-first')
      first.style.backgroundColor = rgb(mix(pal.surface, pal.tint, INOUT_B(seg(t, c3.at, c3.at + 0.4))))
      qa(el, '.v7c-parts i').forEach((pill, i) => {
        const a = c3.at + i * 0.1
        pill.style.opacity = OUT_P(seg(t, a, a + 0.3)).toFixed(4)
      })
    },
  }

  /* ============================================================================
     PRIORITY
     ============================================================================ */
  const PRIORITY_LINES = ['pr.1', 'pr.2']
  // storyboard/lines.mjs 'pr.2', used only to place a word when its cue carries no `words`
  const PR2_TEXT = 'Right now, the broadest rule runs first — it catches every sign-in, including the one that should have been blocked.'
  const RULE_ALL = ['All sign-ins — second factor', 'No conditions · second factor required']
  const RULE_FIN = ['Finance — off the office network', 'Device & network conditions']
  const RULE_RISK = ['Known risk network — block', 'Anonymizers · deny']
  const BOARDS = [
    { cls: 'is-before', label: 'Order — before', rules: [RULE_ALL, RULE_FIN, RULE_RISK] },
    { cls: 'is-after', label: 'Order — after', rules: [RULE_RISK, RULE_FIN, RULE_ALL] },
  ]

  const chip = ([name, desc], i, pill) => `
                <div class="v7p-chip">
                  <b class="v7p-num">${i + 1}</b>
                  <span class="v7p-text"><span class="v7p-name">${name}</span><span class="v7p-desc">${desc}</span></span>
                  ${pill ? '<span class="v7p-pill">Allowed</span>' : ''}
                </div>`

  const priority = {
    build(el, params, edl) {
      const board = (b) => `
            <div class="v7p-board ${b.cls}">
              <div class="v7p-label">${b.label}</div>
              <div class="v7p-chips">${b.rules.map((r, i) => chip(r, i, b.cls === 'is-before' && i === 0)).join('')}
              </div>
            </div>`
      el.innerHTML = `
        <div class="v7 v7p">
          ${board(BOARDS[0])}
          <div class="v7p-arrow">
            <svg width="38" height="14" viewBox="0 0 38 14" aria-hidden="true">
              <path d="M1 7H36M30 1.5L36.5 7L30 12.5" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>reorder</span>
          </div>
          ${board(BOARDS[1])}
        </div>`
      // the caption's own text when the edl has it (it does whenever the line is voiced)
      const cap = edl?.captions?.find((c) => c.id === 'pr.2')
      el._v7 = {
        pal: palette(q(el, '.v7'), ['line', 'line-2', 'brand', 'tint', 'ink-3', 'neg-fg']),
        text: cap?.text ?? PR2_TEXT,
      }
    },
    update(el, t, dur, params) {
      if (!q(el, '.v7p')) priority.build(el, params, null)
      const { pal, text } = el._v7
      const c1 = cueOf(params, PRIORITY_LINES, 'pr.1')
      const c2 = cueOf(params, PRIORITY_LINES, 'pr.2')

      // pr.1 — the boards enter: before 0→1, after 0→.3, rise 12 px, stagger 0.15 s, OUT-B 0.5 s
      const before = q(el, '.v7p-board.is-before')
      const after = q(el, '.v7p-board.is-after')
      const kb = OUT_B(seg(t, c1.at, c1.at + 0.5))
      const ka = OUT_B(seg(t, c1.at + 0.15, c1.at + 0.65))
      before.style.opacity = kb.toFixed(4)
      before.style.transform = `translate3d(0, ${px((1 - kb) * 12)}, 0)`
      after.style.opacity = (0.3 * ka).toFixed(4)
      after.style.transform = `translate3d(0, ${px((1 - ka) * 12)}, 0)`
      // the arrow between them arrives with the board it points to, at full strength
      const arrow = q(el, '.v7p-arrow')
      arrow.style.opacity = ka.toFixed(4)
      arrow.style.transform = `translate3d(0, ${px((1 - ka) * 12)}, 0)`

      /* pr.2 — 0.26 s before "catches" rule 1 is checked (orange edge, a 3 px
         tint ring, 0.35 s); 0.52 s after that it matches (the edge settles to
         the control grey, "Allowed" scales in .9→1 over 0.3 s) and the two rules
         it shadows fall to .4; from "blocked" rule 3's description reads in the
         negative colour. All OUT-P. */
      const tCheck = wordAt(c2, /^catches$/i, text) - 0.26
      const tHit = tCheck + 0.52
      const tBlocked = wordAt(c2, /^blocked$/i, text)
      const kc = OUT_P(seg(t, tCheck, tCheck + 0.35))
      const kh = OUT_P(seg(t, tHit, tHit + 0.3))
      const kx = OUT_P(seg(t, tBlocked, tBlocked + 0.3))

      const chips = qa(before, '.v7p-chip')
      const one = chips[0]
      one.style.borderColor = rgb(mix(mix(pal.line, pal.brand, kc), pal['line-2'], kh))
      one.style.boxShadow = `0 0 0 3px ${rgb(pal.tint, kc * (1 - kh))}, 0 2px 8px rgba(33, 37, 41, 0.05)`
      const pill = q(one, '.v7p-pill')
      pill.style.opacity = kh.toFixed(4)
      pill.style.transform = `scale(${(0.9 + 0.1 * kh).toFixed(4)})`
      chips.slice(1).forEach((c) => (c.style.opacity = (1 - 0.6 * kh).toFixed(4)))
      q(chips[2], '.v7p-desc').style.color = rgb(mix(pal['ink-3'], pal['neg-fg'], kx))
    },
  }

  // add to the registry, never overwrite it: other slide files register into the same object
  window.SLIDES3 = Object.assign(window.SLIDES3 || {}, { concept, priority })
})()
