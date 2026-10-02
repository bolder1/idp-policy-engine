/* -----------------------------------------------------------------------------
   Explainer insets — five small illustrations, one per concept the film
   explains (DESIGN-v6 §5). Each is one inline SVG in a 420×220 card: Lucide
   glyphs on a 24 grid, one duotone brand highlight per card, and the orange
   sign-in token as the only thing that travels.

   `window.EXPLAIN[id] = { build(el), update(el, kEnv, t) }`. `build` writes the
   SVG once into the engine's #ov-explain container; `update` sets every
   opacity, transform and dash offset from `t` — seconds since the inset's
   entrance — so a frame renders the same whichever order the frames come in.
   The container's own enter and exit belong to the engine (drawOverlays); the
   inside starts moving at 0.36 s, when the card has landed.
   -------------------------------------------------------------------------- */
;(() => {
  const NS = 'http://www.w3.org/2000/svg'
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const lerp = (a, b, t) => a + (b - a) * t
  /* progress 0..1 of a motion that starts at `a` and lasts `d` seconds */
  const seg = (t, a, d) => clamp((t - a) / d, 0, 1)

  /* A CSS cubic-bezier, evaluated for its progress at x — the storyboard names
     its curves this way (§1.4). Newton first, bisection when it wanders. */
  const bezier = (x1, y1, x2, y2) => {
    const cx = 3 * x1
    const bx = 3 * (x2 - x1) - cx
    const ax = 1 - cx - bx
    const cy = 3 * y1
    const by = 3 * (y2 - y1) - cy
    const ay = 1 - cy - by
    const sx = (u) => ((ax * u + bx) * u + cx) * u
    const sy = (u) => ((ay * u + by) * u + cy) * u
    const dx = (u) => (3 * ax * u + 2 * bx) * u + cx
    return (x) => {
      if (x <= 0) return 0
      if (x >= 1) return 1
      let u = x
      for (let i = 0; i < 8; i++) {
        const d = dx(u)
        if (Math.abs(d) < 1e-6) break
        u -= (sx(u) - x) / d
      }
      if (!(u >= 0 && u <= 1) || Math.abs(sx(u) - x) > 1e-4) {
        let lo = 0
        let hi = 1
        for (let i = 0; i < 24; i++) {
          u = (lo + hi) / 2
          if (sx(u) < x) lo = u
          else hi = u
        }
      }
      return sy(u)
    }
  }
  const OUT_B = bezier(0, 0.4, 0, 1) // entrances that move
  const OUT_P = bezier(0.4, 1, 0.6, 1) // fades in
  const INOUT_B = bezier(0.4, 0, 0, 1) // the token's glides

  /* --- SVG helpers ------------------------------------------------------------ */
  const mk = (tag, attrs = {}, ...kids) => {
    const e = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v))
    for (const c of kids) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
    return e
  }
  const text = (x, y, s, cls, anchor) => mk('text', { x, y, class: cls, 'text-anchor': anchor }, s)
  /* an animated wrapper: fade and rise are set on this, the geometry inside stays put */
  const unit = (...kids) => {
    const g = mk('g', {}, ...kids)
    g.style.opacity = '0'
    return g
  }
  /* fade + rise (or slide) in: p is linear progress; OUT-P on the fade, OUT-B on the move */
  const show = (g, p, dy = 8, dx = 0, dim = 1) => {
    g.style.opacity = String(OUT_P(p) * dim)
    const m = 1 - OUT_B(p)
    g.setAttribute('transform', `translate(${(m * dx).toFixed(2)} ${(m * dy).toFixed(2)})`)
  }
  const place = (g, x, y, s = 1, op) => {
    g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(3)})`)
    if (op !== undefined) g.style.opacity = String(op)
  }

  /* Lucide geometry, 24 grid, stroke 1.75, round caps and joins (§5.1). */
  const GLYPHS = {
    user: [['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
    users: [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }], ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }]],
    shield: [['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }]],
    wifi: [['path', { d: 'M12 20h.01' }], ['path', { d: 'M2 8.82a15 15 0 0 1 20 0' }], ['path', { d: 'M5 12.859a10 10 0 0 1 14 0' }], ['path', { d: 'M8.5 16.429a5 5 0 0 1 7 0' }]],
    laptop: [['path', { d: 'M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16' }]],
    'map-pin': [['path', { d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0' }], ['circle', { cx: 12, cy: 10, r: 3 }]],
    check: [['path', { d: 'M20 6 9 17l-5-5' }]],
    x: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
    smartphone: [['rect', { width: 14, height: 20, x: 5, y: 2, rx: 2, ry: 2 }], ['path', { d: 'M12 18h.01' }]],
  }
  /* a glyph centred on (cx, cy), `size` px across; stroke scales with it so a
     40 px glyph keeps Lucide's proportions */
  const glyph = (name, cx, cy, size = 40, cls = '', sw) => {
    const g = mk('g', { class: `xp-glyph ${cls}`.trim(), transform: `translate(${cx - size / 2} ${cy - size / 2}) scale(${(size / 24).toFixed(4)})` })
    if (sw) g.setAttribute('stroke-width', String(sw))
    for (const [tag, attrs] of GLYPHS[name]) g.appendChild(mk(tag, attrs))
    return g
  }

  /* draw-on: a path that reveals from its start as `draw(path, p)` runs 0 → 1 */
  const pathLen = (p) => {
    try {
      const L = p.getTotalLength()
      if (L > 0) return L
    } catch {
      /* fall through */
    }
    return 600
  }
  const drawable = (p) => {
    const L = pathLen(p)
    p._L = L
    p.style.strokeDasharray = `${L} ${L}`
    p.style.strokeDashoffset = String(L)
    return p
  }
  const draw = (p, k) => {
    p.style.strokeDashoffset = String(p._L * (1 - k))
  }
  const line = (x0, y0, x1, y1, cls = 'xp-line') => drawable(mk('path', { d: `M${x0} ${y0} L${x1} ${y1}`, class: cls }))
  /* a 6 px arrowhead whose tip sits on (x, y), pointing along `ang` degrees (0 = right) */
  const arrow = (x, y, ang = 0) => {
    const a = mk('path', { d: `M${x} ${y} l-6 -3.5 v7 z`, class: 'xp-arrow', transform: ang ? `rotate(${ang} ${x} ${y})` : null })
    a.style.opacity = '0'
    return a
  }
  const fade = (node, k) => {
    node.style.opacity = String(k)
  }

  /* the sign-in token: a 14 px brand disc in a 3 px white ring */
  const token = () => {
    const g = mk('g', { class: 'xp-tok' }, mk('circle', { r: 10, class: 'xp-token-ring' }), mk('circle', { r: 7, class: 'xp-token' }))
    g.style.opacity = '0'
    return g
  }

  /* a chip: white, 1 px hairline, radius 8; glyph 24 px at x+12, label at x+44 */
  const chip = (x, y, w, h, icon, label) => {
    const g = unit(mk('rect', { x: x + 0.5, y: y + 0.5, width: w - 1, height: h - 1, rx: 8, class: 'xp-chip' }))
    if (icon === 'avatar') {
      g.appendChild(mk('circle', { cx: x + 24, cy: y + h / 2, r: 12, class: 'xp-avatar' }))
      g.appendChild(text(x + 24, y + h / 2 + 4.5, 'PS', 'xp-avatar-t', 'middle'))
    } else g.appendChild(glyph(icon, x + 24, y + h / 2, 24))
    g.appendChild(text(x + 44, y + h / 2 + 6, label, 'xp-label'))
    return g
  }
  /* a round tile: a 36 px disc in a feedback tint with a 20 px glyph */
  const disc = (cx, cy, fillCls, icon, glyphCls, d = 36) => {
    const g = mk('g', {}, mk('circle', { cx, cy, r: d / 2 - 0.5, class: `xp-disc ${fillCls}` }), glyph(icon, cx, cy, d * 0.56, glyphCls))
    return g
  }
  /* the phone-with-a-check: the second-factor outcome, in brand duotone */
  const phoneCheck = (cx, cy, d = 36) => {
    const g = disc(cx, cy, 'xp-hi-fill', 'smartphone', 'xp-hi', d)
    const bx = cx + d * 0.24
    const by = cy - d * 0.2
    g.appendChild(mk('circle', { cx: bx, cy: by, r: 5.5, class: 'xp-badge' }))
    g.appendChild(glyph('check', bx, by, 7, 'xp-hi', 3))
    return g
  }
  const svgRoot = (title) => {
    const svg = mk('svg', { viewBox: '0 0 420 220', width: 420, height: 220 })
    svg.appendChild(text(24, 36, title, 'xp-title'))
    return svg
  }
  const mount = (el, svg, parts) => {
    el.innerHTML = ''
    el.appendChild(svg)
    el._xp = parts
  }

  /* --- finance-workday ------------------------------------------------------------
     A person, a policy, an app: the token walks the row (c1.1). */
  const financeWorkday = {
    build(el) {
      const svg = svgRoot('Finance signs in to Workday')
      const P = {}
      P.lineA = line(98, 104, 166, 104)
      P.arrowA = arrow(166, 104)
      P.lineB = line(254, 104, 322, 104)
      P.arrowB = arrow(322, 104)
      P.person = unit(glyph('user', 70, 104, 40), mk('rect', { x: 38, y: 132, width: 64, height: 22, rx: 6, class: 'xp-tag' }), text(70, 147.5, 'Finance', 'xp-tag-t', 'middle'))
      P.shield = unit(glyph('shield', 210, 104, 44))
      P.bars = [96, 104, 112].map((y) => {
        const b = mk('path', { d: `M203 ${y} H217`, class: 'xp-bar' })
        b.style.opacity = '0'
        return b
      })
      P.polLbl = unit(text(210, 152, 'The policy', 'xp-label', 'middle'))
      P.tile = unit(mk('rect', { x: 326.5, y: 80.5, width: 47, height: 47, rx: 10, class: 'xp-tile' }), text(350, 112, 'W', 'xp-mono', 'middle'))
      P.appLbl = unit(text(350, 152, 'Workday', 'xp-label', 'middle'))
      P.tok = token()
      for (const n of [P.lineA, P.arrowA, P.lineB, P.arrowB, P.person, P.shield, ...P.bars, P.polLbl, P.tile, P.appLbl, P.tok]) svg.appendChild(n)
      mount(el, svg, P)
    },
    update(el, kEnv, t) {
      const P = el._xp
      show(P.person, seg(t, 0.36, 0.34))
      draw(P.lineA, OUT_B(seg(t, 0.7, 0.35)))
      fade(P.arrowA, seg(t, 1.0, 0.1))
      show(P.shield, seg(t, 0.95, 0.3))
      P.bars.forEach((b, i) => fade(b, seg(t, 1.25 + 0.08 * i, 0.12)))
      show(P.polLbl, seg(t, 1.1, 0.24), 6)
      draw(P.lineB, OUT_B(seg(t, 1.75, 0.35)))
      fade(P.arrowB, seg(t, 2.05, 0.1))
      show(P.tile, seg(t, 2.05, 0.3))
      show(P.appLbl, seg(t, 2.17, 0.24), 6)
      // the token: appears beside the person, rests short of the shield, then rides on to the app
      const g1 = INOUT_B(seg(t, 0.75, 0.45))
      const g2 = INOUT_B(seg(t, 1.8, 0.5))
      const x = t < 1.5 ? lerp(98, 177, g1) : lerp(177, 306, g2)
      place(P.tok, x, 104, 1, seg(t, 0.5, 0.2))
    },
  }

  /* --- who -------------------------------------------------------------------------
     Three chips, a brace, one rule card whose first row is theirs (c3.3). */
  const who = {
    build(el) {
      const svg = svgRoot('Who is it about?')
      const P = {}
      P.chips = [
        chip(24, 52, 196, 40, 'users', 'Finance'),
        chip(24, 104, 196, 40, 'users', 'Executives'),
        chip(24, 156, 196, 40, 'avatar', 'Priya Sharma'),
      ]
      P.brace = drawable(mk('path', { d: 'M244 60 C254 60 254 64 254 74 L254 114 C254 120 256 124 262 124 C256 124 254 128 254 134 L254 174 C254 184 254 188 244 188', class: 'xp-line' }))
      // the mini rule card: three bars, the first one theirs
      P.card = unit(
        mk('rect', { x: 276.5, y: 86.5, width: 127, height: 75, rx: 10, class: 'xp-chip' }),
        mk('path', { d: 'M308 104 H364', class: 'xp-bar-soft' }),
        mk('path', { d: 'M292 124 H348', class: 'xp-bar-soft' }),
        mk('path', { d: 'M292 144 H356', class: 'xp-bar-soft' }),
      )
      P.hi = drawable(mk('path', { d: 'M308 104 H364', class: 'xp-bar-hi' }))
      P.mini = glyph('users', 298, 104, 12, 'xp-hi', 2.5)
      P.mini.style.opacity = '0'
      // centred a touch left of the mini card so the label keeps clear of the inset's edge
      P.lbl = unit(text(334, 188, 'One rule, for them', 'xp-label', 'middle'))
      for (const n of [...P.chips, P.brace, P.card, P.hi, P.mini, P.lbl]) svg.appendChild(n)
      mount(el, svg, P)
    },
    update(el, kEnv, t) {
      const P = el._xp
      P.chips.forEach((c, i) => show(c, seg(t, 0.36 + 0.16 * i, 0.3), 0, -12))
      draw(P.brace, OUT_B(seg(t, 0.84, 0.5)))
      show(P.card, seg(t, 1.4, 0.5))
      draw(P.hi, OUT_B(seg(t, 1.6, 0.2)))
      fade(P.mini, seg(t, 1.6, 0.2))
      show(P.lbl, seg(t, 1.75, 0.3), 6)
    },
  }

  /* --- if ------------------------------------------------------------------------------
     What a sign-in carries, and every check holding (c4.1). */
  const iff = {
    build(el) {
      const svg = svgRoot('If: what the sign-in carries')
      const P = {}
      const ys = [72, 110, 148]
      P.leads = ys.map((y) => line(60, 110, 104, y))
      /* 36 tall at a 38 px pitch: the three chips stay centred on the leaders
         and the checks without touching one another */
      P.chips = [
        chip(104, 54, 220, 36, 'wifi', 'Office Network'),
        chip(104, 92, 220, 36, 'laptop', 'Corporate managed'),
        chip(104, 130, 220, 36, 'map-pin', 'Location'),
      ]
      P.checks = ys.map((y) => {
        const g = unit(mk('circle', { cx: 360, cy: y, r: 10.5, class: 'xp-disc xp-ok-fill' }))
        const tick = glyph('check', 360, y, 13, 'xp-ok')
        g.appendChild(tick)
        g._tick = drawable(tick.firstChild)
        return g
      })
      P.tokLbl = unit(text(52, 136, 'a sign-in', 'xp-small', 'middle'))
      P.cap = unit(text(24, 200, 'Every check must hold', 'xp-small'))
      P.tok = token()
      for (const n of [...P.leads, ...P.chips, ...P.checks, P.tokLbl, P.cap, P.tok]) svg.appendChild(n)
      mount(el, svg, P)
    },
    update(el, kEnv, t) {
      const P = el._xp
      const pop = seg(t, 0.36, 0.24)
      place(P.tok, 52, 110, lerp(0.6, 1, OUT_B(pop)), OUT_P(pop))
      show(P.tokLbl, seg(t, 0.48, 0.24), 6)
      P.leads.forEach((l, i) => draw(l, OUT_B(seg(t, 0.6 + 0.1 * i, 0.3))))
      P.chips.forEach((c, i) => show(c, seg(t, 0.85 + 0.1 * i, 0.3), 0, -8))
      P.checks.forEach((c, i) => {
        const p = seg(t, 1.4 + 0.16 * i, 0.28)
        fade(c, OUT_P(p))
        draw(c._tick, OUT_B(p))
      })
      show(P.cap, seg(t, 2.0, 0.24), 6)
    },
  }

  /* --- then ----------------------------------------------------------------------------
     The decision: three lanes, and the token takes the middle one (c5.1). */
  const then = {
    build(el) {
      const svg = svgRoot('Then: the decision')
      const P = {}
      P.rule = line(112, 60, 112, 176)
      const ends = [66, 118, 170]
      P.lanes = ends.map((y) => line(112, 118, 250, y))
      P.arrows = ends.map((y) => arrow(250, y, (Math.atan2(y - 118, 138) * 180) / Math.PI))
      // tiles: allow, allow with a second factor (the highlight), deny
      P.tileA = unit(disc(274, 66, 'xp-ok-fill', 'check', 'xp-ok'))
      P.tileBIn = phoneCheck(274, 118)
      P.tileB = unit(P.tileBIn)
      P.tileC = unit(disc(274, 170, 'xp-no-fill', 'x', 'xp-no'))
      P.lblA = unit(text(300, 71, 'Allow', 'xp-label'))
      P.lblB = unit(text(300, 114, 'Allow, with a', 'xp-label'), text(300, 133, 'second factor', 'xp-label'))
      P.lblC = unit(text(300, 175, 'Deny', 'xp-label'))
      P.tok = token()
      for (const n of [P.rule, ...P.lanes, ...P.arrows, P.tileA, P.tileB, P.tileC, P.lblA, P.lblB, P.lblC, P.tok]) svg.appendChild(n)
      mount(el, svg, P)
    },
    update(el, kEnv, t) {
      const P = el._xp
      draw(P.rule, OUT_B(seg(t, 0.4, 0.3)))
      P.lanes.forEach((l, i) => draw(l, OUT_B(seg(t, 0.7 + 0.12 * i, 0.3))))
      P.arrows.forEach((a, i) => fade(a, seg(t, 0.95 + 0.12 * i, 0.1)))
      // on arrival the chosen tile breathes once and the other two step back
      const arrive = seg(t, 1.9, 0.3)
      const dim = lerp(1, 0.6, OUT_P(arrive))
      show(P.tileA, seg(t, 0.85, 0.3), 8, 0, dim)
      show(P.tileB, seg(t, 0.97, 0.3))
      show(P.tileC, seg(t, 1.09, 0.3), 8, 0, dim)
      show(P.lblA, seg(t, 0.97, 0.24), 6, 0, dim)
      show(P.lblB, seg(t, 1.09, 0.24), 6)
      show(P.lblC, seg(t, 1.21, 0.24), 6, 0, dim)
      const s = 1 + 0.06 * Math.sin(Math.PI * arrive)
      P.tileBIn.setAttribute('transform', `translate(274 118) scale(${s.toFixed(4)}) translate(-274 -118)`)
      const x = lerp(48, 238, INOUT_B(seg(t, 1.4, 0.5)))
      place(P.tok, x, 118, 1, seg(t, 0.36, 0.24))
    },
  }

  /* --- first-match -----------------------------------------------------------------
     A list read top to bottom; the token stops at the first rule that matches (c6.2). */
  const firstMatch = {
    build(el) {
      const svg = svgRoot('First match decides')
      const P = {}
      const defs = mk('defs', {}, mk('clipPath', { id: 'xp-fm-clip' }, (P.clip = mk('rect', { x: 80, y: 52, width: 16, height: 0 }))))
      P.rail = mk('g', { 'clip-path': 'url(#xp-fm-clip)' }, mk('path', { d: 'M88 52 V190', class: 'xp-rail' }))
      const ys = [52, 100, 148]
      P.rows = ys.map((y, i) => {
        const g = unit(mk('rect', { x: 112.5, y: y + 0.5, width: 175, height: 35, rx: 8, class: 'xp-chip' }))
        if (i < 2) g.appendChild(text(128, y + 23.5, `Rule ${i + 1}`, 'xp-label'))
        else {
          g.appendChild(text(128, y + 16, 'Default', 'xp-label'))
          g.appendChild(text(128, y + 30, 'if nothing matches', 'xp-small'))
        }
        return g
      })
      P.row2Hi = mk('rect', { x: 112.5, y: 100.5, width: 175, height: 35, rx: 8, class: 'xp-chip-hi' })
      P.row2Hi.style.opacity = '0'
      P.inds = ys.map((y) => mk('circle', { cx: 100, cy: y + 18, r: 7, class: 'xp-ind' }))
      P.dash = mk('path', { d: 'M96 70 H104', class: 'xp-dash' })
      P.dash.style.opacity = '0'
      P.hit = mk('g', {}, mk('circle', { cx: 100, cy: 118, r: 7, class: 'xp-ind-hit' }), glyph('check', 100, 118, 8, 'xp-tick-w', 3))
      P.hit.style.opacity = '0'
      P.conn = line(288, 118, 330, 118)
      P.connArrow = arrow(330, 118)
      P.out = unit(phoneCheck(352, 118))
      P.outLbl = unit(text(352, 152, 'Second factor', 'xp-small xp-ink2', 'middle'))
      P.tok = token()
      // the token sits under the hit indicator: when rule 2 takes it, the two become one disc
      for (const n of [defs, P.rail, ...P.rows, P.row2Hi, ...P.inds, P.dash, P.tok, P.hit, P.conn, P.connArrow, P.out, P.outLbl]) svg.appendChild(n)
      mount(el, svg, P)
    },
    update(el, kEnv, t) {
      const P = el._xp
      const dim1 = lerp(1, 0.55, OUT_P(seg(t, 1.15, 0.2)))
      const dim3 = lerp(1, 0.55, OUT_P(seg(t, 1.5, 0.3)))
      P.rows.forEach((r, i) => show(r, seg(t, 0.36 + 0.1 * i, 0.3), 0, 12, i === 0 ? dim1 : i === 2 ? dim3 : 1))
      P.inds[0].style.opacity = String(dim1)
      P.inds[2].style.opacity = String(dim3)
      P.clip.setAttribute('height', (138 * OUT_B(seg(t, 0.4, 0.4))).toFixed(2))
      // the token walks the rail: rule 1 passes it on, rule 2 takes it onto its indicator
      const drop2 = INOUT_B(seg(t, 1.2, 0.3))
      const y = t < 1.2 ? lerp(52, 70, INOUT_B(seg(t, 0.85, 0.3))) : lerp(70, 118, drop2)
      const x = t < 1.2 ? 88 : lerp(88, 100, drop2)
      place(P.tok, x, y, 1, seg(t, 0.8, 0.15))
      fade(P.dash, seg(t, 1.15, 0.2))
      const hit = seg(t, 1.5, 0.2)
      fade(P.hit, hit)
      fade(P.row2Hi, hit)
      draw(P.conn, OUT_B(seg(t, 1.55, 0.3)))
      fade(P.connArrow, seg(t, 1.85, 0.1))
      show(P.out, seg(t, 1.8, 0.3))
      show(P.outLbl, seg(t, 1.92, 0.24), 6)
    },
  }

  window.EXPLAIN = { 'finance-workday': financeWorkday, who, if: iff, then, 'first-match': firstMatch }
})()
