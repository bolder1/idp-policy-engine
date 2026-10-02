/* -----------------------------------------------------------------------------
   The v2 scenes that are not the product: the hook, the whiteboard, the push
   banner between chapters, and the outro.

   Contract (engine.js → slideEl / driveSlide / mascotFromSlide):
     window.SLIDES2 = { hook, whiteboard, banner, outro }
     each: { build(el, params, edl), update(el, t, dur, params), mascotKeys(dur, params) }

   Every visual is a pure function of the slide's own clock `t` (seconds): no
   timers, no rAF, no CSS transitions. The only CSS keyframes are the paused
   `.a` vocabulary from slides.css, which the engine steps with currentTime;
   everything else is computed here in update(). Colours come from the
   compositor's tokens (compose.css) and the slide-specific ones in
   slides-v2.css, both defined for light and dark.

   The whiteboard's strokes are timed from `params.cues[lineId] = { at, dur }`
   (slide-local seconds from the real voice takes): every stroke of a line
   starts 0.15 s after its `at` and the last one finishes by `at + dur·0.8`.
   -------------------------------------------------------------------------- */
;(() => {
  const { clamp, lerp, easeInOut, easeOut, easeIn, easeOutBack } = window.COMPOSE
  const seg = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1))
  const q = (el, s) => el.querySelector(s)
  const qa = (el, s) => [...el.querySelectorAll(s)]
  const LOGO = '/app/xecurify-logo.png'
  const W = 1920
  const H = 1080
  const BEAT = 0.6

  /* A tiny deterministic PRNG: the hand's wobble is seeded, so a stroke lands
     on the same pixels every render. */
  function rng(seed) {
    let s = (seed * 2654435761) >>> 0
    return () => {
      s = (s + 0x6d2b79f5) >>> 0
      let x = s
      x = Math.imul(x ^ (x >>> 15), x | 1)
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }
  }

  /* --- hand-drawn geometry ------------------------------------------------------
     A polyline gets subdivided, each sub-point nudged sideways, then smoothed
     with quadratic curves through the midpoints: a marker held by a hand. The
     polyline's own length is kept — dasharray needs a number that is at
     least the drawn length, and the smoothed curve is never longer. */
  function wobble(pts, seed, amp = 1.7, step = 16) {
    const r = rng(seed)
    const out = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const d = Math.hypot(dx, dy) || 1
      const n = Math.max(1, Math.round(d / step))
      const nx = -dy / d
      const ny = dx / d
      const bow = (r() * 2 - 1) * amp * 1.4
      for (let k = 1; k <= n; k++) {
        const u = k / n
        const j = k === n && i === pts.length - 2 ? 0 : (r() * 2 - 1) * amp + bow * Math.sin(Math.PI * u)
        out.push([a[0] + dx * u + nx * j, a[1] + dy * u + ny * j])
      }
    }
    let len = 0
    for (let i = 1; i < out.length; i++) len += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1])
    let d = `M${out[0][0].toFixed(1)} ${out[0][1].toFixed(1)}`
    for (let i = 1; i < out.length - 1; i++) {
      const mx = (out[i][0] + out[i + 1][0]) / 2
      const my = (out[i][1] + out[i + 1][1]) / 2
      d += ` Q${out[i][0].toFixed(1)} ${out[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
    }
    const last = out[out.length - 1]
    d += ` L${last[0].toFixed(1)} ${last[1].toFixed(1)}`
    return { d, len, pts: out }
  }
  const arcPts = (cx, cy, rx, ry, a0, a1, n = 28) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
  })
  /* A hand-drawn loop: starts at 8 o'clock, overshoots a little past the join. */
  const loopPts = (cx, cy, rx, ry, seed) => {
    const r = rng(seed)
    const a0 = Math.PI * 0.75 + (r() - 0.5) * 0.3
    return arcPts(cx, cy, rx, ry, a0, a0 + Math.PI * 2.18, 40)
  }
  const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y - 2]]
  const roundRectPts = (x, y, w, h, r) => {
    const c = (cx, cy, a0, a1) => arcPts(cx, cy, r, r, a0, a1, 6)
    return [
      [x + r, y],
      [x + w - r, y],
      ...c(x + w - r, y + r, -Math.PI / 2, 0).slice(1),
      [x + w, y + h - r],
      ...c(x + w - r, y + h - r, 0, Math.PI / 2).slice(1),
      [x + r, y + h],
      ...c(x + r, y + h - r, Math.PI / 2, Math.PI).slice(1),
      [x, y + r],
      ...c(x + r, y + r, Math.PI, Math.PI * 1.5).slice(1),
      [x + r + 3, y],
    ]
  }
  const arrowPts = (x1, y1, x2, y2, head = 14) => {
    const a = Math.atan2(y2 - y1, x2 - x1)
    const h = (da) => [x2 - head * Math.cos(a + da), y2 - head * Math.sin(a + da)]
    // shaft, then lift and draw the head as a second stroke of the same path
    return { shaft: [[x1, y1], [x2, y2]], head: [h(-0.55), [x2, y2], h(0.55)] }
  }
  function pointAlong(pts, dist) {
    let acc = 0
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      if (acc + d >= dist) {
        const u = d ? (dist - acc) / d : 0
        return { x: lerp(pts[i - 1][0], pts[i][0], u), y: lerp(pts[i - 1][1], pts[i][1], u) }
      }
      acc += d
    }
    const l = pts[pts.length - 1]
    return { x: l[0], y: l[1] }
  }
  const SVG = 'http://www.w3.org/2000/svg'
  const mk = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(SVG, tag)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
    if (parent) parent.appendChild(n)
    return n
  }

  /* --- the marker board: strokes as steps on a cue's clock ------------------------
     Each cue gets an ordered list of steps weighted by how long they take to
     draw (a path by its length, a word by its width). The cue's window is
     [at + 0.15, at + dur·0.8]; the steps share it in proportion. */
  function makeBoard(svgGroup, defs) {
    let clipN = 0
    const api = {
      steps: [],
      /* a stroke: `parts` is one polyline or several (an arrow is shaft + head) */
      stroke(parts, { seed = 1, color = 'var(--wb-ink)', width = 6, amp = 1.7, cls = '' } = {}) {
        const polys = Array.isArray(parts[0][0]) ? parts : [parts]
        let d = ''
        let len = 0
        const all = []
        polys.forEach((p, i) => {
          const w = wobble(p, seed * 7 + i, amp)
          d += (d ? ' ' : '') + w.d
          len += w.len
          all.push(w.pts)
        })
        const dash = len * 1.03 + 2
        const path = mk('path', { d, class: `wb-p ${cls}`, 'stroke-dasharray': dash, 'stroke-dashoffset': dash, style: `stroke:${color};stroke-width:${width}` }, svgGroup)
        const step = {
          w: len,
          el: path,
          run(p) {
            path.style.strokeDashoffset = String(dash * (1 - p))
          },
          at(p) {
            // where the marker tip is: walk the sub-polylines
            let target = len * p
            for (const pts of all) {
              let l = 0
              for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
              if (target <= l) return pointAlong(pts, target)
              target -= l
            }
            return pointAlong(all[all.length - 1], Infinity)
          },
        }
        return step
      },
      /* handwriting: revealed left to right under a clip */
      text(x, y, str, { size = 34, weight = 400, anchor = 'start', color = 'var(--wb-ink)', ls = 0, cls = '', w = null } = {}) {
        const est = w ?? str.length * size * 0.6 + ls * str.length
        const x0 = anchor === 'middle' ? x - est * 0.6 : anchor === 'end' ? x - est * 1.1 : x - 6
        const full = est * 1.25
        const id = `wb-clip-${++clipN}`
        const cp = mk('clipPath', { id }, defs)
        const rect = mk('rect', { x: x0, y: y - size * 1.1, width: 0, height: size * 1.5 }, cp)
        const g = mk('g', { 'clip-path': `url(#${id})` }, svgGroup)
        const tx = mk('text', { x, y, class: `wb-t ${cls}`, 'text-anchor': anchor, style: `font-size:${size}px;font-weight:${weight};fill:${color};letter-spacing:${ls}px` }, g)
        tx.textContent = str
        return {
          w: est * 1.1,
          el: tx,
          run(p) {
            rect.setAttribute('width', String(full * p))
          },
          at(p) {
            return { x: x0 + 6 + est * clamp(p * 1.05, 0, 1), y: y - size * 0.25 }
          },
        }
      },
      /* anything else that happens on the cue's clock (a token sliding, a pulse) */
      custom(w, run, at = null) {
        return { w, run, at: at ? at : () => null, silent: !at }
      },
      cue(cue, steps, { lead = 0.15, tail = 0.8 } = {}) {
        const T0 = cue.at + lead
        const T1 = cue.at + cue.dur * tail
        const sum = steps.reduce((s, x) => s + x.w, 0) || 1
        let a = T0
        for (const s of steps) {
          const d = ((T1 - T0) * s.w) / sum
          s.t0 = a
          s.t1 = a + d
          a += d
          api.steps.push(s)
        }
      },
      drive(t) {
        let live = null
        for (const s of api.steps) {
          const p = seg(t, s.t0, s.t1)
          s.run(p, t)
          if (p > 0 && p < 1 && !s.silent) live = { s, p }
        }
        return live
      },
    }
    return api
  }

  /* Default cue layout when the edit supplies none: lead 0.9 s, 4 s a line,
     0.45 s between lines. */
  function cuesFor(params, ids, { lead = 0.9, per = 4, gap = 0.45 } = {}) {
    const out = {}
    let at = lead
    for (const id of ids) {
      const c = params?.cues?.[id]
      out[id] = c ? { at: c.at ?? at, dur: c.dur ?? per } : { at, dur: per }
      at = out[id].at + out[id].dur + gap
    }
    return out
  }

  /* Small hand-drawn glyphs as static SVG strokes (the sticky notes, the
     column heads). `strokes` are polylines in a 160×90 box. */
  function glyphSVG(strokes, { vb = '0 0 160 90', width = 4, seed = 3, extra = '' } = {}) {
    const paths = strokes
      .map((s, i) => {
        const color = s.color ?? 'var(--wb-ink)'
        const dashed = s.dashed ? ' stroke-dasharray="7 6"' : ''
        const w = wobble(s.pts, seed + i * 13, s.amp ?? 1.1, 10)
        return `<path d="${w.d}" fill="none" stroke="${color}" stroke-width="${s.width ?? width}" stroke-linecap="round" stroke-linejoin="round"${dashed}/>`
      })
      .join('')
    return `<svg viewBox="${vb}" class="wb-glyph">${extra}${paths}</svg>`
  }

  /* ============================================================================
     HOOK — 6.5 s at 100 BPM, mirror-symmetric about x = 960
     ============================================================================ */
  const HK = {
    cx: 960,
    cardW: 600,
    cardH: 84,
    cardY: [362, 470, 578], // centres
    tokRing: 200,
    idxX: 960 - 300 + 20 + 19, // the index slot of a card
    tileY: 750,
    tileW: 300,
    tileH: 100,
    tileX: [630, 960, 1290], // centres
  }
  const hookTiles = [
    { tone: 'allow', label: 'Allow', ic: '<path d="M20 6 9 17l-5-5"/>' },
    { tone: 'mfa', label: 'Second factor', ic: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5"/>' },
    { tone: 'deny', label: 'Deny', ic: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' },
  ]
  const hook = {
    build(el) {
      const tok = Array.from({ length: 8 }, (_, j) => `<div class="hk-tok" data-j="${j}"></div>`).join('')
      const cards = [0, 1, 2]
        .map(
          (i) => `<div class="mc hk-card" data-i="${i}">
              <div class="mc__head"><span class="mc__idx"></span><span class="hk-bar hk-bar--name" style="width:${[300, 250, 330][i]}px"></span><span class="hk-bar hk-bar--chip"></span></div>
            </div>`,
        )
        .join('')
      const hairs = [0, 1, 2].map((i) => `<div class="hk-hair" data-i="${i}" data-side="l"></div><div class="hk-hair" data-i="${i}" data-side="r"></div>`).join('')
      const tiles = hookTiles
        .map(
          (tl, i) => `<div class="hk-tile is-${tl.tone}" data-i="${i}"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${tl.ic}</svg><span>${tl.label}</span></div>`,
        )
        .join('')
      el.innerHTML = `
        <div class="hk">
          <div class="hk-big">IF</div>
          <div class="hk-spine"></div>
          ${hairs}
          ${cards}
          <div class="hk-word hk-who">WHO</div>
          <div class="hk-word hk-then">THEN</div>
          ${tiles}
          <div class="hk-ring"></div>
          ${tok}
        </div>
        <div class="hk-mark">
          <img class="hk-logo" src="${LOGO}" alt="">
          <div class="hk-title">Policy Engine</div>
        </div>`
    },
    update(el, t) {
      const { cx, cardW, cardH, cardY, tokRing, idxX, tileY, tileW, tileH, tileX } = HK
      const root = q(el, '.hk')

      // a thump on the word beats: the whole scene drops 6 px and springs back
      let thump = 0
      for (const b of [1.8, 2.4, 3.0, 3.6]) {
        const dt = t - b
        if (dt >= 0 && dt < 0.35) thump += 7 * Math.sin(Math.PI * (dt / 0.35)) * (1 - dt / 0.35)
      }
      // beat 9 (4.8): everything contracts into the centre and hands over to the wordmark
      const kc = easeIn(seg(t, 4.8, 5.25))
      root.style.transform = `translate(0px, ${thump}px) scale(${lerp(1, 0.12, kc)})`
      root.style.opacity = String(1 - seg(t, 4.95, 5.2))
      root.style.transformOrigin = `${cx}px 500px`

      // beat 1: one token, a pulse ring
      const ring = q(el, '.hk-ring')
      const kr = seg(t, 0.02, 0.7)
      ring.style.opacity = String((1 - easeOut(kr)) * 0.9)
      ring.style.transform = `translate(${cx}px, ${cardY[1]}px) scale(${lerp(0.3, 4.6, easeOut(kr))})`

      // beats 2–3: eight tokens burst into a ring, hold, collapse into a line of three
      const burst = easeOutBack(seg(t, 0.6, 0.95))
      const collapse = easeInOut(seg(t, 1.2, 1.5))
      const toSlot = easeInOut(seg(t, 1.55, 1.85))
      qa(el, '.hk-tok').forEach((tk, j) => {
        const a = -Math.PI / 2 + (j * Math.PI * 2) / 8
        const slot = j % 3
        const ringX = cx + tokRing * Math.cos(a) * burst
        const ringY = cardY[1] + tokRing * Math.sin(a) * burst
        const lineY = cardY[slot]
        let x = lerp(ringX, cx, collapse)
        let y = lerp(ringY, lineY, collapse)
        let o = j === 0 ? 1 : clamp(burst * 2, 0, 1)
        let s = 1
        if (j >= 3) {
          // the five extras merge into the three that stay
          o *= 1 - seg(t, 1.35, 1.5)
        } else {
          x = lerp(x, idxX, toSlot)
          // beats 7–8: each token drops from its card into an outcome tile
          const d0 = 3.72 + slot * 0.3
          const drop = seg(t, d0, d0 + 0.32)
          if (drop > 0) {
            x = lerp(idxX, tileX[slot] - tileW / 2 + 48, easeInOut(drop))
            y = lerp(cardY[slot], tileY, drop * drop) - 50 * Math.sin(Math.PI * drop) * (slot === 1 ? 0.4 : 1)
            s = 1 - 0.25 * drop
            o *= 1 - seg(t, d0 + 0.34, d0 + 0.5)
          }
        }
        if (t < 0.6 && j > 0) o = 0
        tk.style.opacity = String(o)
        tk.style.transform = `translate(${x}px, ${y}px) scale(${s})`
      })

      // beats 3–5: three rule-card skeletons, top → bottom, a spine and mirrored hairlines
      qa(el, '.hk-card').forEach((c, i) => {
        const k = easeOutBack(seg(t, 1.2 + i * 0.2, 1.2 + i * 0.2 + 0.45))
        c.style.opacity = String(clamp(k * 1.5, 0, 1))
        c.style.transform = `translate(${cx - cardW / 2}px, ${cardY[i] - cardH / 2 + (1 - k) * 40}px) scale(${lerp(0.9, 1, k)})`
      })
      const spine = q(el, '.hk-spine')
      const ks = easeInOut(seg(t, 1.45, 1.95))
      spine.style.transform = `translate(${cx - 1}px, ${cardY[0]}px) scaleY(${ks})`
      spine.style.height = `${cardY[2] - cardY[0]}px`
      spine.style.opacity = String(seg(t, 1.45, 1.6))
      qa(el, '.hk-hair').forEach((h) => {
        const i = Number(h.dataset.i)
        const left = h.dataset.side === 'l'
        const k = easeOut(seg(t, 1.55 + i * 0.12, 2.0 + i * 0.12))
        const x0 = left ? cx - cardW / 2 - 130 : cx + cardW / 2
        h.style.transform = `translate(${x0}px, ${cardY[i]}px) scaleX(${k})`
        h.style.transformOrigin = left ? '100% 50%' : '0 50%'
        h.style.width = '130px'
      })

      // beats 4–6: WHO · IF · THEN slam in, one per beat
      const slam = (node, at, x, y) => {
        const k = seg(t, at, at + 0.28)
        const e = easeOutBack(k)
        node.style.opacity = String(seg(t, at, at + 0.1))
        node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${lerp(1.6, 1, e)})`
      }
      slam(q(el, '.hk-who'), 1.8, 330, cardY[1])
      slam(q(el, '.hk-then'), 3.0, 1590, cardY[1])
      // IF is the watermark the cards sit on: huge, faint, behind them
      const big = q(el, '.hk-big')
      const kb = easeOutBack(seg(t, 2.4, 2.75))
      big.style.opacity = String(seg(t, 2.4, 2.55))
      big.style.transform = `translate(${cx}px, ${cardY[1] + 60}px) translate(-50%, -50%) scale(${lerp(1.35, 1, kb)})`

      // beats 7–8: three outcome tiles slam into a row, and light as their token lands
      qa(el, '.hk-tile').forEach((tl, i) => {
        const at = 3.6 + i * 0.08
        const k = easeOutBack(seg(t, at, at + 0.38))
        const landAt = 3.72 + i * 0.3 + 0.32
        const bump = Math.sin(Math.PI * seg(t, landAt, landAt + 0.3)) * (1 - seg(t, landAt, landAt + 0.3) * 0.5)
        tl.style.opacity = String(clamp(k * 1.5, 0, 1))
        tl.style.transform = `translate(${tileX[i] - tileW / 2}px, ${tileY - tileH / 2 + (1 - k) * 90}px) scale(${lerp(1.15, 1, k) + 0.06 * bump})`
        tl.classList.toggle('is-lit', t >= landAt)
      })

      // beats 9–10: the wordmark, and a light sweep across the type
      const mark = q(el, '.hk-mark')
      const km = easeOutBack(seg(t, 4.95, 5.5))
      mark.style.opacity = String(seg(t, 4.95, 5.15))
      mark.style.transform = `translate(-50%, -50%) scale(${lerp(0.55, 1, km)})`
      const title = q(el, '.hk-title')
      const sweep = seg(t, 5.5, 6.2)
      title.style.backgroundPosition = `${lerp(110, -10, sweep)}% 0`
      const logo = q(el, '.hk-logo')
      logo.style.transform = `translateY(${(1 - km) * 16}px)`
    },
    mascotKeys() {
      return [
        { t: 5.6, pose: 'peek', x: 960, y: 1080, size: 320, face: 'right' },
        { t: 5.7, pose: 'stand', x: 960, y: 1040, size: 320, face: 'right', emote: '!' },
      ]
    },
  }

  /* ============================================================================
     WHITEBOARD — one scene, six lines
     ============================================================================ */
  const WB = {
    // centred now that nothing stands beside it; the caption band sits below
    x: 360,
    y: 60,
    w: 1200,
    h: 860,
    // the drawing is laid out in a 935×420 design box; before the notes it is
    // centred on the board, then it shrinks to the left half
    pre: { x: 21, y: 24, s: 1.2 },
    post: { x: 24, y: 187, s: 0.68 },
    noteCols: [700, 948],
    noteRows: [178, 446],
    noteW: 224,
    noteH: 244,
  }
  const WB_IDS = ['wb.1', 'wb.2', 'wb.3', 'wb.4', 'wb.5', 'wb.6']
  const NOTES = [
    {
      t: 'Rules you can read',
      s: 'who · if · then',
      rot: -2,
      g: glyphSVG([
        { pts: loopPts(20, 20, 9, 9, 1), amp: 0.6 },
        { pts: [[38, 20], [140, 20]] },
        { pts: loopPts(20, 46, 9, 9, 2), amp: 0.6 },
        { pts: [[38, 46], [124, 46]] },
        { pts: loopPts(20, 72, 9, 9, 3), amp: 0.6 },
        { pts: [[38, 72], [132, 72]] },
      ]),
    },
    {
      t: 'Conditions that combine',
      s: 'AND / OR / groups',
      rot: 2,
      g: glyphSVG(
        [
          { pts: rectPts(6, 8, 46, 24) },
          { pts: rectPts(108, 8, 46, 24) },
          { pts: roundRectPts(6, 46, 148, 38, 8), dashed: true, width: 3 },
          { pts: rectPts(16, 56, 40, 18), width: 3 },
          { pts: rectPts(104, 56, 40, 18), width: 3 },
        ],
        { extra: '<text x="80" y="27" class="wb-gt" text-anchor="middle">AND</text><text x="80" y="71" class="wb-gt" text-anchor="middle">OR</text>' },
      ),
    },
    {
      t: 'A canvas, not a form',
      s: 'drag, zoom, reorder',
      rot: 1.5,
      g: glyphSVG(
        [
          { pts: rectPts(52, 6, 60, 16) },
          { pts: [[82, 22], [82, 34]], width: 3 },
          { pts: rectPts(52, 34, 60, 16) },
          { pts: [[82, 50], [82, 62]], width: 3 },
          { pts: rectPts(52, 62, 60, 16) },
        ],
        {
          extra: Array.from({ length: 6 }, (_, r) => Array.from({ length: 10 }, (_, c) => `<circle cx="${8 + c * 16}" cy="${8 + r * 15}" r="1.6" class="wb-gd"/>`).join('')).join(''),
        },
      ),
    },
    {
      t: 'Draft → review → save',
      s: 'nothing changes until you confirm',
      rot: -1.5,
      g: glyphSVG([
        { pts: loopPts(26, 45, 18, 18, 4), amp: 0.7 },
        { pts: [[19, 52], [33, 38]], width: 3 },
        { pts: [[48, 45], [58, 45]], width: 3 },
        { pts: [[54, 40], [59, 45], [54, 50]], width: 3 },
        { pts: loopPts(80, 45, 18, 18, 5), amp: 0.7 },
        { pts: arcPts(80, 45, 11, 6, 0, Math.PI * 2, 16), width: 3 },
        { pts: loopPts(80, 45, 3, 3, 6), width: 3, amp: 0.3 },
        { pts: [[102, 45], [112, 45]], width: 3 },
        { pts: [[108, 40], [113, 45], [108, 50]], width: 3 },
        { pts: loopPts(134, 45, 18, 18, 7), amp: 0.7 },
        { pts: [[125, 45], [131, 52], [144, 38]], width: 3.5 },
      ]),
    },
  ]
  const whiteboard = {
    build(el, params) {
      const cues = cuesFor(params, WB_IDS)
      el.innerHTML = `
        <div class="wb-board">
          <svg class="wb-svg" viewBox="0 0 ${WB.w} ${WB.h}" width="${WB.w}" height="${WB.h}">
            <defs></defs>
            <g class="wb-draw"></g>
            <g class="wb-marker"><rect x="-8" y="-66" width="16" height="54" rx="5"/><rect class="wb-marker__cap" x="-8" y="-66" width="16" height="12" rx="4"/><path d="M-5 -12 L0 0 L5 -12 Z"/></g>
          </svg>
          <div class="wb-notes">
            ${NOTES.map(
              (n, i) => `<div class="wb-note" data-i="${i}" style="left:${WB.noteCols[i % 2]}px;top:${WB.noteRows[i >> 1]}px;width:${WB.noteW}px;height:${WB.noteH}px">
                <i class="wb-tape"></i>${n.g}<div class="wb-note__t">${n.t}</div><div class="wb-note__s">${n.s}</div></div>`,
            ).join('')}
          </div>
        </div>`
      const svg = q(el, '.wb-svg')
      const draw = q(svg, '.wb-draw')
      const defs = q(svg, 'defs')
      const B = makeBoard(draw, defs)
      const INK = 'var(--wb-ink)'

      /* wb.1 — the person, the arrow, the question ------------------------------- */
      const head = B.stroke(loopPts(70, 322, 30, 30, 11), { seed: 11 })
      const shoulders = B.stroke([[14, 446], ...arcPts(70, 428, 54, 42, Math.PI, Math.PI * 2, 20), [126, 446]], { seed: 12 })
      const laptop = B.stroke([[118, 400], [178, 400], [178, 440], [118, 440], [118, 398]], { seed: 13 })
      const laptopBase = B.stroke([[104, 445], [192, 445]], { seed: 14 })
      const ar1 = arrowPts(214, 400, 266, 400)
      const arrow1 = B.stroke([ar1.shaft, ar1.head], { seed: 15 })
      const qmark = B.text(306, 428, '?', { size: 104, weight: 700, anchor: 'middle', w: 60 })
      const pulse = B.custom(80, () => {})
      B.cue(cues['wb.1'], [head, shoulders, laptop, laptopBase, arrow1, qmark, pulse])

      /* wb.2 — the policy box, three rows, the token, the first-match circle ------- */
      const box = B.stroke(roundRectPts(360, 150, 360, 410, 22), { seed: 21, amp: 1.4 })
      const label = B.text(540, 202, 'POLICY', { size: 32, weight: 700, anchor: 'middle', ls: 5 })
      const rows = []
      const ROW_Y = [340, 420, 500]
      const COL_X = [495, 585, 675]
      ROW_Y.forEach((y, i) => {
        rows.push(B.stroke(loopPts(388, y, 16, 16, 30 + i), { seed: 30 + i, amp: 0.8 }))
        rows.push(B.text(388, y + 11, String(i + 1), { size: 28, weight: 700, anchor: 'middle', w: 18 }))
        COL_X.forEach((x, c) => rows.push(B.stroke([[x - 31, y], [x + 31, y]], { seed: 40 + i * 3 + c, amp: 1.2, width: 5 })))
      })
      // the orange token slides down the rows and stops on row 2
      const token = mk('circle', { class: 'wb-token', cx: 425, cy: 300, r: 12, opacity: 0 }, draw)
      const slide = B.custom(
        140,
        (p) => {
          const o = seg(p, 0, 0.15)
          const k = easeInOut(seg(p, 0.15, 0.7))
          const settle = easeOutBack(seg(p, 0.7, 1))
          token.setAttribute('opacity', String(o))
          token.setAttribute('cy', String(lerp(300, 420, k)))
          token.setAttribute('r', String(12 + 3 * Math.sin(Math.PI * settle) * (p > 0.7 ? 1 : 0)))
        },
      )
      const circle2 = B.stroke(loopPts(540, 420, 180, 36, 23), { seed: 23, color: 'var(--brand)', amp: 2.2, width: 6 })
      B.cue(cues['wb.2'], [box, label, ...rows, slide, circle2])

      /* wb.3 — who · if · then, with tiny glyphs --------------------------------- */
      const heads = []
      const HEADS = ['who', 'if', 'then']
      HEADS.forEach((h, i) => {
        const x = COL_X[i]
        const gy = 236
        if (i === 0) {
          heads.push(B.stroke(loopPts(x - 7, gy - 6, 6, 6, 51), { seed: 51, width: 3.5, amp: 0.5 }))
          heads.push(B.stroke(arcPts(x - 7, gy + 10, 11, 9, Math.PI, Math.PI * 2, 10), { seed: 52, width: 3.5, amp: 0.5 }))
          heads.push(B.stroke(loopPts(x + 9, gy - 4, 5, 5, 53), { seed: 53, width: 3.5, amp: 0.5 }))
          heads.push(B.stroke(arcPts(x + 9, gy + 10, 9, 8, Math.PI * 1.15, Math.PI * 2, 8), { seed: 54, width: 3.5, amp: 0.5 }))
        } else if (i === 1) {
          heads.push(B.stroke([[x, gy + 12], [x, gy], [x - 10, gy - 12]], { seed: 55, width: 3.5, amp: 0.5 }))
          heads.push(B.stroke([[x, gy], [x + 10, gy - 12]], { seed: 56, width: 3.5, amp: 0.5 }))
        } else {
          const a = arrowPts(x - 14, gy, x + 14, gy, 9)
          heads.push(B.stroke([a.shaft, a.head], { seed: 57, width: 3.5, amp: 0.5 }))
        }
        heads.push(B.text(x, 280, h, { size: 30, weight: 700, anchor: 'middle' }))
      })
      B.cue(cues['wb.3'], heads)

      /* wb.4 — three arrows out, three answers --------------------------------- */
      const outs = []
      const OUT_Y = [300, 420, 540]
      const tones = [
        { stroke: 'var(--pos-dot)', fill: 'var(--pos-fg)' },
        { stroke: 'var(--note-dot)', fill: 'var(--note-fg)' },
        { stroke: 'var(--neg-dot)', fill: 'var(--neg-fg)' },
      ]
      OUT_Y.forEach((y, i) => {
        const a = arrowPts(732, 420 + (y - 420) * 0.12, 774, y, 13)
        outs.push(B.stroke([a.shaft, a.head], { seed: 60 + i, amp: 1.2 }))
      })
      // ✓ Allow
      outs.push(B.stroke([[797, 302], [808, 314], [830, 286]], { seed: 71, color: tones[0].stroke, width: 6.5, amp: 0.8 }))
      outs.push(B.text(846, 313, 'Allow', { size: 34, weight: 700, color: tones[0].fill }))
      // key · Second factor
      outs.push(B.stroke(loopPts(806, 411, 9, 9, 72), { seed: 72, color: tones[1].stroke, width: 5, amp: 0.5 }))
      outs.push(B.stroke([[812, 418], [834, 440]], { seed: 73, color: tones[1].stroke, width: 5, amp: 0.5 }))
      outs.push(B.stroke([[826, 432], [832, 426]], { seed: 74, color: tones[1].stroke, width: 5, amp: 0.4 }))
      outs.push(B.stroke([[832, 438], [838, 432]], { seed: 75, color: tones[1].stroke, width: 5, amp: 0.4 }))
      outs.push(B.text(846, 416, 'Second', { size: 30, weight: 700, color: tones[1].fill }))
      outs.push(B.text(846, 448, 'factor', { size: 30, weight: 700, color: tones[1].fill }))
      // ✗ Deny
      outs.push(B.stroke([[800, 527], [826, 553]], { seed: 76, color: tones[2].stroke, width: 6.5, amp: 0.7 }))
      outs.push(B.stroke([[826, 527], [800, 553]], { seed: 77, color: tones[2].stroke, width: 6.5, amp: 0.7 }))
      outs.push(B.text(846, 553, 'Deny', { size: 34, weight: 700, color: tones[2].fill }))
      B.cue(cues['wb.4'], outs)

      el.__wb = { B, cues, qmark }
    },
    update(el, t, dur, params) {
      if (!el.__wb) whiteboard.build(el, params)
      const { B, cues, qmark } = el.__wb
      const live = B.drive(t)

      // the question pulses once it is written, until the board makes room for the notes
      const c1 = cues['wb.1']
      const c5 = cues['wb.5']
      const written = c1.at + c1.dur * 0.8
      const pulseK = seg(t, written - 0.2, written + 0.4) * (1 - seg(t, c5.at, c5.at + 0.6))
      const ph = 1 + 0.07 * Math.sin((t - written) * Math.PI * 2 * 1.1) * pulseK
      qmark.el.setAttribute('transform', `translate(306 386) scale(${ph}) translate(-306 -386)`)

      // wb.5: the drawing shrinks to the left half
      const ks = easeInOut(seg(t, c5.at + 0.15, c5.at + 1.0))
      const gx = lerp(WB.pre.x, WB.post.x, ks)
      const gy = lerp(WB.pre.y, WB.post.y, ks)
      const gs = lerp(WB.pre.s, WB.post.s, ks)
      q(el, '.wb-draw').setAttribute('transform', `translate(${gx} ${gy}) scale(${gs})`)

      // the marker follows the stroke being drawn
      const marker = q(el, '.wb-marker')
      const pt = live ? live.s.at(live.p) : null
      if (pt) {
        marker.style.opacity = '1'
        marker.setAttribute('transform', `translate(${gx + pt.x * gs} ${gy + pt.y * gs}) rotate(28)`)
      } else marker.style.opacity = '0'

      // the four notes slap on, 2 × 2, in step with the pops in the edit
      qa(el, '.wb-note').forEach((n, i) => {
        const at = c5.at + 1.2 + i * 0.28
        const k = seg(t, at, at + 0.42)
        const e = easeOutBack(k)
        const rot = NOTES[i].rot
        n.style.opacity = String(seg(t, at, at + 0.08))
        n.style.transform = `rotate(${lerp(rot * 4, rot, e)}deg) scale(${lerp(1.55, 1, e)})`
        n.style.boxShadow = `0 ${lerp(40, 10, e)}px ${lerp(60, 26, e)}px var(--wb-note-shadow)`
      })
    },
    mascotKeys(dur, params) {
      const cues = cuesFor(params, WB_IDS)
      const S = (x, y) => ({ x: WB.x + WB.pre.x + x * WB.pre.s, y: WB.y + WB.pre.y + y * WB.pre.s })
      const toward = {
        'wb.1': S(306, 390),
        'wb.2': S(540, 355),
        'wb.3': S(585, 262),
        'wb.4': S(840, 420),
        'wb.5': { x: WB.x + 935, y: WB.y + 430 },
      }
      const keys = [{ t: 0, pose: 'stand', x: 1560, y: 1000, size: 520, face: 'left' }]
      for (const id of WB_IDS.slice(0, 5)) keys.push({ t: cues[id].at, pose: 'point', x: 1560, y: 1000, size: 520, face: 'left', toward: toward[id] })
      keys.push({ t: cues['wb.6'].at, pose: 'stand', x: 1560, y: 1000, size: 520, face: 'left', emote: '✓' })
      return keys
    },
  }

  /* ============================================================================
     BANNER — a push band between chapters
     ============================================================================ */
  const BN = { top: 390, h: 300, inDur: 0.45, outDur: 0.45 }
  const banner = {
    build(el, p) {
      el.innerHTML = `
        <div class="bn-band">
          <div class="bn-n">${p.n ?? ''}</div>
          <div class="bn-text">
            <div class="bn-title">${p.title ?? ''}</div>
            <div class="bn-kicker">${p.kicker ?? ''}</div>
          </div>
        </div>`
    },
    update(el, t, dur) {
      const kin = easeOut(seg(t, 0, BN.inDur))
      const kout = easeIn(seg(t, dur - BN.outDur, dur))
      const x = (1 - kin) * W - kout * W
      const band = q(el, '.bn-band')
      band.style.transform = `translate(${x}px, 0)`
      // the type arrives a touch after the band, and leaves a touch before it
      const kt = easeOut(seg(t, 0.12, 0.55))
      const ko = easeIn(seg(t, dur - BN.outDur - 0.05, dur - 0.1))
      q(el, '.bn-title').style.transform = `translate(${(1 - kt) * 90 - ko * 120}px, 0)`
      q(el, '.bn-title').style.opacity = String(Math.min(kt * 1.6, 1 - ko))
      const kk = easeOut(seg(t, 0.22, 0.65))
      q(el, '.bn-kicker').style.transform = `translate(${(1 - kk) * 70 - ko * 100}px, 0)`
      q(el, '.bn-kicker').style.opacity = String(Math.min(kk * 1.6, 1 - ko))
      const kn = easeOut(seg(t, 0.05, 0.6))
      q(el, '.bn-n').style.transform = `translate(${(1 - kn) * -60}px, 0)`
    },
    mascotKeys(dur = 2.3) {
      // rides the band: arrives with it from the right, leaves with it to the left
      const y = BN.top + BN.h
      return [
        { t: 0, pose: 'stand', x: 1700 + 1920, y, size: 230, face: 'left', seconds: 0.01 },
        { t: 0.02, pose: 'stand', x: 1700, y, size: 230, face: 'left', seconds: 0.43 },
        { t: 0.55, pose: 'cheer', x: 1700, y, size: 230, face: 'left', seconds: 0.01 },
        { t: Math.max(0.9, dur - 0.45), pose: 'stand', x: 1700 - 1920, y, size: 230, face: 'left', seconds: 0.45 },
      ]
    },
  }

  /* ============================================================================
     OUTRO — 7.5 s
     ============================================================================ */
  const outro = {
    build(el) {
      el.innerHTML = `
        <div class="ou2">
          <div class="ou2-words">${['Who.', 'If.', 'Then.'].map((w, i) => `<span class="ou2-w" data-i="${i}">${w}</span>`).join('')}</div>
          <div class="ou2-mark"><img class="ou2-logo" src="${LOGO}" alt=""><span class="ou2-title">Policy Engine</span></div>
          <div class="ou2-line">Xecurify Policy Engine · by miniOrange</div>
        </div>`
    },
    update(el, t) {
      // one word per beat, on the thumps the edit places at 0.4, 1.0, 1.6
      qa(el, '.ou2-w').forEach((w, i) => {
        const at = 0.4 + i * BEAT
        const k = easeOutBack(seg(t, at, at + 0.5))
        w.style.opacity = String(seg(t, at, at + 0.12))
        w.style.transform = `translateY(${(1 - k) * 70}px)`
      })
      const mark = q(el, '.ou2-mark')
      const km = easeOutBack(seg(t, 2.3, 2.9))
      mark.style.opacity = String(seg(t, 2.3, 2.5))
      mark.style.transform = `translateY(${(1 - km) * 40}px)`
      const line = q(el, '.ou2-line')
      const kl = easeOut(seg(t, 3.0, 3.5))
      line.style.opacity = String(kl)
      line.style.transform = `translateY(${(1 - kl) * 16}px)`
    },
    mascotKeys() {
      return [
        { t: 0, pose: 'stand', x: 1400, y: 980, size: 420, face: 'left' },
        { t: 1.2, pose: 'cheer', x: 1400, y: 980, size: 420, face: 'left', screen: 'allow' },
      ]
    },
  }

  window.SLIDES2 = { hook, whiteboard, banner, outro }
})()
