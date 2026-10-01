/* -----------------------------------------------------------------------------
   The orange — a procedural rig over one picture.

   There is one pose of the mascot on disk (assets/mascot/hero.png, facing right,
   phone raised). Everything it does in the film is done here: it stands, bobs
   and breathes, blinks, talks, leans toward things, lies on a toolbar, jumps
   onto a button, cheers — and its phone shows the verdict. Landmarks come from
   rig.json in the picture's own pixels, so the overlays (eyelids, a mouth, the
   phone screen) are drawn in an SVG that shares the picture's coordinate space.

   Pure function of time: stateAt(t, keys, opts) → state; render(state) paints
   it. No timers, no transitions. The blink schedule is seeded.

     MASCOT.init(rootEl, rig, { assetBase })
     MASCOT.stateAt(t, keys, { talkOpen, wordOnsets, seed, screen, emote })
       keys: [{ t, pose, x, y, size, face, seconds, toward }] — SCREEN px.
             (x, y) is where the feet stand, except: 'lie' → a point on the
             surface the body rests on; 'jump' → where the FINGERTIP lands at
             t + seconds. `size` is the body height. `face` 'left' | 'right'.
     MASCOT.render(state)
     MASCOT.headPoint(state) → {x, y}     the thought cloud attaches here
     MASCOT.fingertip(state) → {x, y}     the raised hand's touch point
   -------------------------------------------------------------------------- */
;(() => {
  const C = window.COMPOSE || {}
  const clamp = C.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)))
  const lerp = C.lerp || ((a, b, t) => a + (b - a) * t)
  const easeInOut = C.easeInOut || ((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2))
  const easeOut = C.easeOut || ((t) => 1 - Math.pow(1 - t, 3))
  const easeIn = C.easeIn || ((t) => t * t * t)
  const easeOutBack =
    C.easeOutBack ||
    ((t) => {
      const c1 = 1.70158
      const c3 = c1 + 1
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
    })

  const IMG = { w: 673, h: 1219 }
  const RATIO = IMG.w / IMG.h
  const FINGER = { x: 135, y: 210 } // the phone's upper corner in the raised hand
  const EMOTE_LIFE = 1.3

  let root = null
  let rig = null
  let el = {}
  let blinks = []
  let lastSeed = null

  /* --- DOM ----------------------------------------------------------------- */
  function init(rootEl, rigData, { assetBase = '/assets/mascot/' } = {}) {
    root = rootEl
    rig = rigData
    const eL = rig.eyes.left
    const eR = rig.eyes.right
    const m = rig.mouth
    const ph = rig.phone
    const [mcx, mcy] = m.center
    root.innerHTML = `
      <div class="m-body">
        <div class="m-squash">
          <div class="m-art">
            <img class="m-img" src="${assetBase}${rig.image}" alt="" draggable="false">
            <svg class="m-face" viewBox="0 0 ${IMG.w} ${IMG.h}" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <clipPath id="m-clip-l"><ellipse cx="${eL.center[0]}" cy="${eL.center[1]}" rx="${eL.w / 2 + 3}" ry="${eL.h / 2 + 3}"/></clipPath>
                <clipPath id="m-clip-r"><ellipse cx="${eR.center[0]}" cy="${eR.center[1]}" rx="${eR.w / 2 + 3}" ry="${eR.h / 2 + 3}"/></clipPath>
                <clipPath id="m-clip-mouth"><ellipse class="m-open-clip" cx="${mcx}" cy="${mcy}" rx="1" ry="1"/></clipPath>
                <filter id="m-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
                <mask id="m-mouth-mask">
                  <ellipse cx="${mcx}" cy="${mcy + 4}" rx="${m.w / 2 + 10}" ry="${m.h / 2 + 14}" fill="#fff" filter="url(#m-soft)"/>
                </mask>
                <radialGradient id="m-skin-grad" cx="45%" cy="35%" r="70%">
                  <stop offset="0" stop-color="${lighten(m.skin, 0.06)}"/>
                  <stop offset="1" stop-color="${m.skin}"/>
                </radialGradient>
              </defs>
              <!-- eyelids: skin-coloured shapes that slide down over each eye -->
              <g clip-path="url(#m-clip-l)"><ellipse class="m-lid m-lid-l" cx="${eL.center[0]}" cy="${eL.center[1]}" rx="${eL.w / 2 + 8}" ry="${eL.h / 2 + 8}" fill="${eL.skin}"/></g>
              <g clip-path="url(#m-clip-r)"><ellipse class="m-lid m-lid-r" cx="${eR.center[0]}" cy="${eR.center[1]}" rx="${eR.w / 2 + 8}" ry="${eR.h / 2 + 8}" fill="${eR.skin}"/></g>
              <!-- mouth: a feathered patch over the painted mouth, then ours -->
              <g class="m-mouth">
                <rect x="${mcx - m.w}" y="${mcy - m.h}" width="${m.w * 2}" height="${m.h * 2}" fill="url(#m-skin-grad)" mask="url(#m-mouth-mask)"/>
                <path class="m-smile" d="" fill="none" stroke="#5a1a12" stroke-width="7" stroke-linecap="round"/>
                <ellipse class="m-open" cx="${mcx}" cy="${mcy}" rx="1" ry="1" fill="#5a1a12"/>
                <g clip-path="url(#m-clip-mouth)">
                  <ellipse class="m-tongue" cx="${mcx}" cy="${mcy}" rx="1" ry="1" fill="#e0524a"/>
                  <rect class="m-teeth" x="${mcx - 40}" y="${mcy}" width="80" height="1" fill="#fff9f2"/>
                </g>
              </g>
              <!-- the phone's screen: a verdict, or the art -->
              <g class="m-screen" transform="translate(${ph.contentCenter[0]} ${ph.contentCenter[1]}) rotate(${ph.rotateDeg})" style="display:none">
                <rect x="${-ph.contentSize[0] / 2}" y="${-ph.contentSize[1] / 2}" width="${ph.contentSize[0]}" height="${ph.contentSize[1]}" rx="12" fill="${ph.glass}"/>
                <g class="m-scr m-scr-allow" style="display:none">
                  <circle cx="0" cy="-22" r="26" fill="#2fb463"/>
                  <path d="M-12 -22 L-4 -14 L13 -32" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
                  <text x="0" y="36" text-anchor="middle" class="m-scr-t">ALLOW</text>
                </g>
                <g class="m-scr m-scr-mfa" style="display:none">
                  <circle cx="0" cy="-24" r="26" fill="#e8ae2b"/>
                  <circle cx="-5" cy="-29" r="7" fill="none" stroke="#fff" stroke-width="4"/>
                  <path d="M0 -25 L14 -11 M8 -17 L13 -22 M11 -14 L16 -19" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
                  <text x="0" y="24" text-anchor="middle" class="m-scr-t m-scr-t2">2ND</text>
                  <text x="0" y="46" text-anchor="middle" class="m-scr-t m-scr-t2">FACTOR</text>
                </g>
                <g class="m-scr m-scr-deny" style="display:none">
                  <circle cx="0" cy="-22" r="26" fill="#f04d78"/>
                  <path d="M-10 -32 L10 -12 M10 -32 L-10 -12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
                  <text x="0" y="36" text-anchor="middle" class="m-scr-t">DENY</text>
                </g>
              </g>
            </svg>
          </div>
        </div>
      </div>
      <div class="m-emote"></div>`
    el = {
      body: root.querySelector('.m-body'),
      squash: root.querySelector('.m-squash'),
      art: root.querySelector('.m-art'),
      lidL: root.querySelector('.m-lid-l'),
      lidR: root.querySelector('.m-lid-r'),
      smile: root.querySelector('.m-smile'),
      open: root.querySelector('.m-open'),
      openClip: root.querySelector('.m-open-clip'),
      tongue: root.querySelector('.m-tongue'),
      teeth: root.querySelector('.m-teeth'),
      screen: root.querySelector('.m-screen'),
      scr: { allow: root.querySelector('.m-scr-allow'), mfa: root.querySelector('.m-scr-mfa'), deny: root.querySelector('.m-scr-deny') },
      emote: root.querySelector('.m-emote'),
    }
    return el.body
  }

  function lighten(hex, k) {
    const n = parseInt(hex.slice(1), 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    const f = (v) => Math.round(v + (255 - v) * k)
    return `rgb(${f(r)},${f(g)},${f(b)})`
  }

  /* --- seeded schedule ------------------------------------------------------ */
  function rng(seed) {
    let a = seed >>> 0
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  function blinkTimes(seed) {
    if (lastSeed === seed && blinks.length) return blinks
    const r = rng(seed * 7919 + 13)
    const out = []
    let t = 1.1 + r() * 2
    while (t < 1200) {
      out.push(t)
      if (r() < 0.1) out.push(t + 0.26)
      t += 3 + r() * 2
    }
    blinks = out
    lastSeed = seed
    return out
  }
  function blinkAt(t, seed, slow = 1) {
    let k = 0
    for (const b of blinkTimes(seed)) {
      const dt = (t - b) / slow
      if (dt < -0.01) break
      if (dt >= 0 && dt < 0.06) k = Math.max(k, dt / 0.06)
      else if (dt >= 0.06 && dt < 0.15) k = Math.max(k, 1 - (dt - 0.06) / 0.09)
    }
    return k
  }

  /* --- poses ------------------------------------------------------------------

     Every pose resolves to a "rest": where the body's centre is, how it is
     rotated, how big it is and which way it faces. Travel between keys eases
     from the previous key's rest to the new one; a jump flies. */
  const widthOf = (size) => size * RATIO

  function restOf(k, prev) {
    const size = k.size ?? prev?.size ?? 300
    const w = widthOf(size)
    const face = k.face ?? prev?.face ?? 'right'
    switch (k.pose) {
      case 'lie': {
        // the underside rests on the surface; head toward -x when facing left
        return { cx: k.x, cy: k.y - w / 2, rot: face === 'left' ? -90 : 90, size, face, lying: true }
      }
      case 'jump': {
        // the fingertip lands on (x, y): offset the body so that it does
        const f = fingerOffset(size, face)
        return { cx: k.x - f.dx, cy: k.y - f.dy - size / 2, rot: 0, size, face, lying: false }
      }
      case 'hide':
        return { cx: k.x, cy: k.y + size * 0.6, rot: 0, size, face, lying: false, hidden: true }
      default:
        return { cx: k.x, cy: k.y - size / 2, rot: 0, size, face, lying: false }
    }
  }

  /* the raised hand's touch point, relative to the FEET, for an upright body */
  function fingerOffset(size, face) {
    const w = widthOf(size)
    const fx = (face === 'left' ? IMG.w - FINGER.x : FINGER.x) / IMG.w
    const feetX = (face === 'left' ? IMG.w - rig.feet[0] : rig.feet[0]) / IMG.w
    return { dx: (fx - feetX) * w, dy: ((FINGER.y - rig.feet[1]) / IMG.h) * size }
  }

  function spring(t, amp = 0.14, freq = 4, decay = 0.18) {
    if (t < 0) return 0
    return amp * Math.exp(-t / decay) * Math.cos(2 * Math.PI * freq * t)
  }

  function stateAt(t, keys, { talkOpen = 0, wordOnsets = [], seed = 1, screen = null, emote = null } = {}) {
    if (!keys || !keys.length) return { hidden: true }
    let i = -1
    for (let n = 0; n < keys.length; n++) if (keys[n].t <= t) i = n
    if (i < 0) return { hidden: true }
    const k = keys[i]
    // the rest we come from: fold the earlier keys
    let prevRest = null
    for (let n = 0; n <= i - 1; n++) prevRest = restOf(keys[n], prevRest)
    const rest = restOf(k, prevRest)
    const from = prevRest ?? { ...rest, cy: rest.cy + rest.size * 0.8, hidden: true }
    const secs = Math.max(0.01, k.seconds ?? 0.6)
    const dt = t - k.t
    const p = clamp(dt / secs, 0, 1)

    let cx
    let cy
    let rot
    let size
    let sx = 1
    let sy = 1
    let alpha = 1
    let squint = 0
    let blinkSlow = 1
    let face = rest.face
    let hidden = false
    let selfEmote = null

    switch (k.pose) {
      case 'jump': {
        // anticipation, a parabola, then a landing that rings down like a spring
        const T = secs
        if (dt < T) {
          const q = easeInOut(p)
          const fx = from.cx
          const fy = from.cy + (from.lying ? widthOf(from.size) / 2 : from.size / 2) // feet of the previous rest
          const tx = rest.cx
          const ty = rest.cy + rest.size / 2
          const apex = Math.abs(fy - ty) / 2 + 120
          const feetX = lerp(fx, tx, q)
          const feetY = lerp(fy, ty, q) - apex * 4 * q * (1 - q)
          size = lerp(from.size, rest.size, q)
          cx = feetX
          cy = feetY - size / 2
          rot = lerp(from.lying ? from.rot : 0, 0, clamp(dt / 0.25, 0, 1))
          if (dt < 0.12) {
            sy = lerp(1, 0.92, easeOut(dt / 0.12))
            sx = 1 + (1 - sy) * 0.6
          } else {
            sy = 1.06
            sx = 0.97
          }
        } else {
          const s = spring(dt - T)
          cx = rest.cx
          cy = rest.cy
          size = rest.size
          rot = 0
          sy = 1 - s
          sx = 1 + s * 0.7
          squint = 0.35 * clamp(1 - (dt - T) / 0.6, 0, 1)
        }
        break
      }
      case 'peek': {
        const q = easeOutBack(p)
        const startY = rest.cy + rest.size * 1.05
        cx = rest.cx
        cy = lerp(startY, rest.cy, q)
        size = rest.size
        rot = 0
        alpha = 1
        break
      }
      case 'hide': {
        const q = easeIn(p)
        cx = from.cx
        cy = from.cy + q * (from.size * 1.2)
        size = from.size
        rot = from.rot
        alpha = 1 - q
        hidden = p >= 1
        break
      }
      default: {
        // stand · point · think · cheer · lie: travel from the previous rest
        const q = easeInOut(p)
        cx = lerp(from.cx, rest.cx, q)
        cy = lerp(from.cy, rest.cy, q)
        size = lerp(from.size, rest.size, q)
        rot = lerp(from.rot, rest.rot, q)
        alpha = from.hidden ? clamp(p * 3, 0, 1) : 1
        // arriving: a soft settle on the feet
        if (p >= 1 && !rest.lying) {
          const s = spring(dt - secs, 0.05, 3.2, 0.16)
          sy = 1 - s
          sx = 1 + s * 0.6
        }
        if (k.pose === 'point') {
          const target = k.toward
          const dir = target ? Math.sign(target.x - rest.cx) || 1 : rest.face === 'left' ? -1 : 1
          rot += 8 * dir * easeOut(p)
          squint = 0.22
        }
        if (k.pose === 'think') {
          rot += -6 * easeOut(p)
          blinkSlow = 1.8
          squint = 0.12
        }
        if (k.pose === 'cheer') {
          const b = clamp(dt / 0.8, 0, 1)
          const hop = Math.abs(Math.sin(Math.PI * 2 * b)) * 42 * (1 - b * 0.6)
          cy -= hop
          const s = Math.sin(Math.PI * 4 * b) * 0.05
          sy = 1 + s
          sx = 1 - s * 0.6
          squint = 0.5
          if (dt < EMOTE_LIFE) selfEmote = { glyph: 'sparkle', k: dt / EMOTE_LIFE }
        }
      }
    }

    // idle life: a slow bob and a breath, on every upright pose
    if (!rest.lying && k.pose !== 'jump' && k.pose !== 'hide') {
      cy += 3 * Math.sin(2 * Math.PI * 0.45 * t)
      sy *= 1 + 0.012 * Math.sin(2 * Math.PI * 0.3 * t)
    }
    if (rest.lying && p >= 1) sx *= 1 + 0.01 * Math.sin(2 * Math.PI * 0.25 * t)

    // talking: the head nods on word onsets
    let nod = 0
    for (const o of wordOnsets) {
      const d = t - o
      if (d >= 0 && d < 0.25) nod += 1.5 * Math.sin(Math.PI * (d / 0.25)) * (1 - d / 0.25)
    }
    rot += (rest.face === 'left' ? -1 : 1) * nod

    const blink = Math.max(blinkAt(t, seed, blinkSlow), squint)

    return {
      hidden: hidden || !!rest.hidden,
      x: cx,
      y: cy + size / 2, // feet, for the integrator (keyboard corner etc.)
      cx,
      cy,
      size,
      w: widthOf(size),
      rot,
      sx,
      sy,
      alpha,
      face,
      lying: rest.lying,
      blink,
      mouthOpen: clamp(talkOpen, 0, 1),
      screen,
      emote: emote ?? selfEmote,
    }
  }

  /* --- geometry ------------------------------------------------------------- */
  /* a point in picture pixels → screen pixels, through flip, squash (about
     the feet), rotation (about the centre) and position */
  function localToScreen(st, px, py) {
    const w = st.w
    const h = st.size
    let lx = ((st.face === 'left' ? IMG.w - px : px) / IMG.w) * w
    let ly = (py / IMG.h) * h
    // squash about the feet (50% 100%)
    lx = w / 2 + (lx - w / 2) * st.sx
    ly = h - (h - ly) * st.sy
    // rotate about the centre
    const rx = lx - w / 2
    const ry = ly - h / 2
    const a = (st.rot * Math.PI) / 180
    const x = st.cx + rx * Math.cos(a) - ry * Math.sin(a)
    const y = st.cy + rx * Math.sin(a) + ry * Math.cos(a)
    return { x, y }
  }
  const headPoint = (st) => (st && !st.hidden && rig ? localToScreen(st, rig.head.center[0], rig.head.center[1]) : { x: 0, y: 0 })
  const fingertip = (st) => (st && !st.hidden && rig ? localToScreen(st, FINGER.x, FINGER.y) : { x: 0, y: 0 })

  /* --- painting ------------------------------------------------------------- */
  const EMOTES = {
    '!': `<span class="m-badge">!</span>`,
    '?': `<span class="m-badge">?</span>`,
    '✓': `<span class="m-badge m-badge--ok"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>`,
    '♪': `<span class="m-badge m-badge--note">♪</span>`,
    sparkle: `<svg class="m-sparkle" viewBox="0 0 120 80" width="120" height="80"><path d="M30 10 l4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 12 -4z" fill="#eb5424"/><path d="M78 6 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3z" fill="#f5c452"/><path d="M62 44 l2.5 7 7 2.5 -7 2.5 -2.5 7 -2.5 -7 -7 -2.5 7 -2.5z" fill="#eb5424"/></svg>`,
    heart: `<span class="m-badge m-badge--heart">♥</span>`,
  }

  let lastEmoteKey = null
  function render(st) {
    if (!root || !el.body) return
    if (!st || st.hidden) {
      root.style.display = 'none'
      return
    }
    root.style.display = ''
    const w = st.w
    const h = st.size
    el.body.style.width = `${w}px`
    el.body.style.height = `${h}px`
    el.body.style.transform = `translate(${st.cx - w / 2}px, ${st.cy - h / 2}px) rotate(${st.rot.toFixed(3)}deg)`
    el.body.style.opacity = String(clamp(st.alpha, 0, 1))
    el.squash.style.transform = `scale(${st.sx.toFixed(4)}, ${st.sy.toFixed(4)})`
    el.art.style.transform = st.face === 'left' ? 'scaleX(-1)' : 'none'

    // eyelids slide down over the eyes
    const L = rig.eyes.left
    const R = rig.eyes.right
    el.lidL.setAttribute('transform', `translate(0 ${(-(L.h + 16) * (1 - st.blink)).toFixed(1)})`)
    el.lidR.setAttribute('transform', `translate(0 ${(-(R.h + 16) * (1 - st.blink)).toFixed(1)})`)

    // the mouth: a closed smile, or open by `mouthOpen`
    const m = rig.mouth
    const [mcx, mcy] = m.center
    const open = st.mouthOpen
    if (open < 0.08) {
      el.smile.setAttribute('d', `M${mcx - 44} ${mcy - 6} Q${mcx} ${mcy + 30} ${mcx + 44} ${mcy - 6}`)
      el.smile.style.display = ''
      el.open.setAttribute('rx', '0.1')
      el.open.setAttribute('ry', '0.1')
      el.openClip.setAttribute('rx', '0.1')
      el.openClip.setAttribute('ry', '0.1')
    } else {
      el.smile.style.display = 'none'
      const rx = (m.w / 2) * (0.55 + 0.45 * open)
      const ry = (m.h / 2) * (0.25 + 0.75 * open)
      for (const e of [el.open, el.openClip]) {
        e.setAttribute('rx', rx.toFixed(1))
        e.setAttribute('ry', ry.toFixed(1))
      }
      el.tongue.setAttribute('cx', mcx)
      el.tongue.setAttribute('cy', (mcy + ry * 0.62).toFixed(1))
      el.tongue.setAttribute('rx', (rx * 0.58).toFixed(1))
      el.tongue.setAttribute('ry', (ry * 0.55).toFixed(1))
      el.teeth.setAttribute('x', (mcx - rx * 0.8).toFixed(1))
      el.teeth.setAttribute('width', (rx * 1.6).toFixed(1))
      el.teeth.setAttribute('y', (mcy - ry).toFixed(1))
      el.teeth.setAttribute('height', (ry * 0.42).toFixed(1))
    }

    // the phone's screen — its content is centred, so un-mirroring it when the
    // body is flipped keeps the words readable
    const scr = st.screen
    el.screen.style.display = scr ? '' : 'none'
    for (const [k, g] of Object.entries(el.scr)) {
      g.style.display = k === scr ? '' : 'none'
      g.setAttribute('transform', st.face === 'left' ? 'scale(-1 1)' : '')
    }

    // an emote above the head
    const em = st.emote
    if (em && em.glyph && EMOTES[em.glyph]) {
      const key = em.glyph
      if (lastEmoteKey !== key) {
        el.emote.innerHTML = EMOTES[key]
        lastEmoteKey = key
      }
      const kk = clamp(em.k, 0, 1)
      const pop = easeOutBack(clamp(kk / 0.25, 0, 1))
      const fade = 1 - clamp((kk - 0.55) / 0.45, 0, 1)
      const head = headPoint(st)
      const top = localToScreen(st, rig.head.center[0], rig.head.leafTop ?? 13)
      const ex = head.x + (st.face === 'left' ? -1 : 1) * st.size * 0.12
      const ey = top.y - 18 - kk * 10
      el.emote.style.display = ''
      el.emote.style.transform = `translate(${ex - 60}px, ${ey - 80}px) scale(${pop.toFixed(3)})`
      el.emote.style.opacity = String(fade)
    } else {
      el.emote.style.display = 'none'
    }
  }

  window.MASCOT = { init, stateAt, render, headPoint, fingertip, localToScreen, IMG }
})()
