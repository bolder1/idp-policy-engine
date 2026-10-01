/* -----------------------------------------------------------------------------
   The compositor — pass two. Turns pictures of the app into a film.

   `renderFrame(i)` draws output frame i of the edit and resolves when every
   pixel of it is final; the renderer screenshots the page after each call. The
   whole page is a pure function of the frame number: no timers, no animation
   that runs on its own. CSS animations on the slides are paused and their
   currentTime set from the edit's clock, so frame 4,000 renders the same
   whether it is the first frame rendered or the last.

   Layers, bottom to top:
     #bg       the ground — soft light, a dot grid, a slow drift
     #stage    <canvas> — the product window: chrome, shadow, the app picture,
               all moved by the camera
     #ov       everything drawn over the product: cursor, click cues, spotlight,
               callouts, keycaps, step banners — positioned through the camera
     #slides   full-screen scenes and chapter cards
     #hud      chapter chip, progress rail, subtitles
   -------------------------------------------------------------------------- */
;(() => {
  const W = 1920
  const H = 1080
  const APP = { w: 1440, h: 900 }

  /* The window at rest: as large as the frame allows with a margin, which
     puts the app at 1.11× its CSS size — readable text at 1080p before any
     zoom. The title bar sits above the app picture. */
  const WIN = (() => {
    const top = 26
    const bar = 34
    const bottom = 24
    const ah = H - top - bar - bottom
    const s0 = ah / APP.h
    const aw = APP.w * s0
    return { top, bar, bottom, ah, aw, s0, ax: (W - aw) / 2, ay: top + bar }
  })()
  const O = { x: WIN.ax + WIN.aw / 2, y: WIN.ay + WIN.ah / 2 }
  const BASE = { cx: APP.w / 2, cy: APP.h / 2, z: 1 }

  const $ = (sel) => document.querySelector(sel)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const easeOut = (t) => 1 - Math.pow(1 - t, 3)
  const easeOutBack = (t) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  }
  /* A window of time with soft edges: 0 outside, 1 inside, eased in and out. */
  const envelope = (t, start, end, fadeIn = 0.25, fadeOut = 0.25) => {
    if (t < start || t > end) return 0
    const a = fadeIn > 0 ? clamp((t - start) / fadeIn, 0, 1) : 1
    const b = fadeOut > 0 ? clamp((end - t) / fadeOut, 0, 1) : 1
    return easeInOut(Math.min(a, b))
  }

  const state = {
    edl: null,
    fps: 30,
    takes: {},
    cams: {},
    images: new Map(),
    order: [],
    slideEls: {},
    lastStageKey: null,
  }

  /* --- images ------------------------------------------------------------- */
  async function image(id) {
    let rec = state.images.get(id)
    if (!rec) {
      const img = new Image()
      img.decoding = 'async'
      img.src = `${state.edl.imgBase}/${id}.jpg`
      rec = { img, ready: img.decode().then(() => img) }
      state.images.set(id, rec)
      state.order.push(id)
      while (state.order.length > 24) {
        const old = state.order.shift()
        if (old !== id) state.images.delete(old)
      }
    }
    return rec.ready
  }

  /* --- camera ---------------------------------------------------------------

     A camera is a point in app pixels that sits at the window's centre, and a
     zoom on top of the window's resting scale. Focus events become keyframes;
     between keyframes the camera eases, and every position is clamped so a
     zoomed view never shows past the edge of the app. */
  function clampCam(c) {
    const s = WIN.s0 * c.z
    const loX = O.x / s
    const hiX = APP.w - (W - O.x) / s
    const loY = O.y / s - (WIN.bar + 6) / WIN.s0
    const hiY = APP.h - (H - O.y) / s + WIN.bottom / WIN.s0
    const cx = loX > hiX ? APP.w / 2 : clamp(c.cx, loX, hiX)
    const cy = loY > hiY ? APP.h / 2 : clamp(c.cy, loY, hiY)
    // at rest the window is centred exactly
    const k = clamp((c.z - 1) / 0.08, 0, 1)
    return { cx: lerp(APP.w / 2, cx, k), cy: lerp(APP.h / 2, cy, k), z: c.z }
  }

  function fit(rect, zoom = 1.45, pad = 40, lift = 60) {
    const zw = (W - 160) / ((rect.width + pad * 2) * WIN.s0)
    const zh = (H - 250) / ((rect.height + pad * 2) * WIN.s0)
    const z = clamp(Math.min(zoom, zw, zh), 1, 2.4)
    // keep the subject above the subtitle band
    const cy = rect.y + rect.height / 2 + lift / (WIN.s0 * z)
    return clampCam({ cx: rect.x + rect.width / 2, cy, z })
  }

  function cameraTrack(take) {
    const n = take.frames.length
    const fps = take.fps
    const cx = new Float32Array(n)
    const cy = new Float32Array(n)
    const cz = new Float32Array(n)
    const keys = take.events
      .filter((e) => e.type === 'focus')
      .map((e) => ({
        start: Math.max(0, e.f - Math.round((e.lead ?? 0) * fps)),
        dur: Math.max(1, Math.round((e.dur ?? 1) * fps)),
        target: e.rect ? fit(e.rect, e.zoom, e.pad) : { ...BASE },
      }))
      .sort((a, b) => a.start - b.start)
    let cur = { ...BASE }
    let from = { ...BASE }
    let active = null
    let k = 0
    for (let f = 0; f < n; f++) {
      while (k < keys.length && keys[k].start <= f) {
        from = { ...cur }
        active = keys[k]
        k++
      }
      if (active) {
        const p = easeInOut(clamp((f - active.start) / active.dur, 0, 1))
        // zoom in log space, so zooming in and out feel the same speed
        const z = Math.exp(lerp(Math.log(from.z), Math.log(active.target.z), p))
        cur = clampCam({ cx: lerp(from.cx, active.target.cx, p), cy: lerp(from.cy, active.target.cy, p), z })
      }
      cx[f] = cur.cx
      cy[f] = cur.cy
      cz[f] = cur.z
    }
    return { cx, cy, cz }
  }

  const camAt = (takeId, f) => {
    const c = state.cams[takeId]
    const i = clamp(f, 0, c.cx.length - 1)
    return { cx: c.cx[i], cy: c.cy[i], z: c.cz[i] }
  }

  /* app pixels → output pixels, through a camera and an extra stage transform */
  function mapper(cam, xf = { s: 1, dx: 0, dy: 0 }) {
    const s = WIN.s0 * cam.z
    return {
      s: s * xf.s,
      pt: (x, y) => {
        const ox = O.x + (x - cam.cx) * s
        const oy = O.y + (y - cam.cy) * s
        return { x: W / 2 + (ox - W / 2) * xf.s + xf.dx, y: H / 2 + (oy - H / 2) * xf.s + xf.dy }
      },
      rect: (r) => {
        const a = O.x + (r.x - cam.cx) * s
        const b = O.y + (r.y - cam.cy) * s
        return {
          x: W / 2 + (a - W / 2) * xf.s + xf.dx,
          y: H / 2 + (b - H / 2) * xf.s + xf.dy,
          width: r.width * s * xf.s,
          height: r.height * s * xf.s,
        }
      },
    }
  }

  /* --- the product window ------------------------------------------------- */
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }

  async function drawStage(take, f, cam, xf, look) {
    const cv = $('#stage')
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    if (!take) return
    const frame = take.frames[clamp(f, 0, take.frames.length - 1)]
    const img = await image(frame[0])
    const m = mapper(cam, xf)
    const barH = (WIN.bar / WIN.s0) // title bar height in app px
    const tl = m.pt(0, -barH)
    const br = m.pt(APP.w, APP.h)
    const ww = br.x - tl.x
    const wh = br.y - tl.y
    const r = 14 * m.s / WIN.s0
    ctx.save()
    ctx.globalAlpha = look.alpha
    if (look.blur > 0.2) ctx.filter = `blur(${look.blur.toFixed(1)}px)`
    // shadow
    ctx.save()
    ctx.shadowColor = 'rgba(22, 32, 44, 0.20)'
    ctx.shadowBlur = 70 * xf.s
    ctx.shadowOffsetY = 26 * xf.s
    roundRect(ctx, tl.x, tl.y, ww, wh, r)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.restore()
    // title bar
    ctx.save()
    roundRect(ctx, tl.x, tl.y, ww, wh, r)
    ctx.clip()
    const barPx = barH * m.s
    const g = ctx.createLinearGradient(0, tl.y, 0, tl.y + barPx)
    g.addColorStop(0, '#fbfcfd')
    g.addColorStop(1, '#f1f4f7')
    ctx.fillStyle = g
    ctx.fillRect(tl.x, tl.y, ww, barPx)
    const u = m.s / WIN.s0
    ;['#e6e9ed', '#e6e9ed', '#e6e9ed'].forEach((c, i) => {
      ctx.beginPath()
      ctx.arc(tl.x + (22 + i * 20) * u, tl.y + barPx / 2, 6 * u, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
      ctx.strokeStyle = '#d3dae1'
      ctx.lineWidth = 1 * u
      ctx.stroke()
    })
    // address pill
    const pw = 420 * u
    const ph = 22 * u
    const px = tl.x + ww / 2 - pw / 2
    const py = tl.y + barPx / 2 - ph / 2
    roundRect(ctx, px, py, pw, ph, ph / 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#e4e8ec'
    ctx.lineWidth = 1 * u
    ctx.stroke()
    ctx.fillStyle = '#646e79'
    ctx.font = `500 ${12.5 * u}px "DM Sans", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(state.edl.url ?? 'idp.xecurify.com/admin/policies', tl.x + ww / 2, py + ph / 2 + 0.5 * u)
    // lock glyph
    ctx.strokeStyle = '#8a949e'
    ctx.lineWidth = 1.3 * u
    const lx = px + 14 * u
    const ly = py + ph / 2
    ctx.strokeRect(lx - 3.5 * u, ly - 1 * u, 7 * u, 5.5 * u)
    ctx.beginPath()
    ctx.arc(lx, ly - 1 * u, 2.6 * u, Math.PI, 0)
    ctx.stroke()
    // the app
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const a = m.pt(0, 0)
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, a.x, a.y, APP.w * m.s, APP.h * m.s)
    ctx.restore()
    // hairline
    roundRect(ctx, tl.x + 0.5, tl.y + 0.5, ww - 1, wh - 1, r)
    ctx.strokeStyle = 'rgba(33, 37, 41, 0.10)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  /* --- overlays -------------------------------------------------------------- */
  const OV = {}
  function ovInit() {
    const root = $('#ov')
    root.innerHTML = `
      <svg id="ov-spot" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <defs>
          <filter id="ov-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
        </defs>
        <path id="ov-spot-dim" fill="rgba(14, 20, 28, 0.58)" fill-rule="evenodd"/>
        <rect id="ov-spot-glow" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2.5"/>
        <rect id="ov-spot-halo" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="10" filter="url(#ov-soft)"/>
      </svg>
      <div id="ov-spot-label" class="ov-tag"><span class="ov-tag__dot"></span><span class="ov-tag__t"></span></div>
      <div id="ov-hint" class="ov-hint"></div>
      <div id="ov-hint-ring" class="ov-hint-ring"></div>
      <div id="ov-ripples"></div>
      <div id="ov-callouts"></div>
      <div id="ov-keys" class="ov-keys"></div>
      <div id="ov-lower" class="ov-lower"><div class="ov-lower__k"></div><div class="ov-lower__t"></div><div class="ov-lower__s"></div></div>
      <div id="ov-cursor" class="ov-cursor">
        <svg viewBox="0 0 32 32" width="34" height="34">
          <path d="M7 3.5 L7 25.5 L12.4 20.6 L16 28.6 L20.1 26.8 L16.6 19 L23.8 18.6 Z" fill="#ffffff" stroke="#15191e" stroke-width="1.7" stroke-linejoin="round"/>
        </svg>
      </div>`
    for (const id of ['ov-spot', 'ov-spot-dim', 'ov-spot-glow', 'ov-spot-halo', 'ov-spot-label', 'ov-hint', 'ov-hint-ring', 'ov-ripples', 'ov-callouts', 'ov-keys', 'ov-lower', 'ov-cursor'])
      OV[id] = document.getElementById(id)
  }

  const show = (el, on) => {
    el.style.display = on ? '' : 'none'
  }

  function drawOverlays(take, f, cam, xf, look) {
    const fps = take.fps
    const t = f / fps
    const m = mapper(cam, xf)
    const ev = take.events
    const alpha = look.alpha * look.overlay

    // cursor
    const fr = take.frames[clamp(f, 0, take.frames.length - 1)]
    const cp = m.pt(fr[1], fr[2])
    const cur = OV['ov-cursor']
    const pressed = fr[3] ? 1 : 0
    const cs = Math.sqrt(cam.z) * xf.s * (pressed ? 0.86 : 1)
    cur.style.transform = `translate(${cp.x - 7 * cs}px, ${cp.y - 3.5 * cs}px) scale(${cs})`
    cur.style.opacity = String(alpha * (take.hideCursor ? 0 : 1))

    /* click cues: the target outline and a pulse before, ripples after. No
       label pill — the cursor says where, the result says what happened. */
    let hint = null
    const ripples = []
    for (const e of ev) {
      if (e.type !== 'click') continue
      const dtc = (f - e.f) / fps
      if (e.hint !== false && dtc > -0.55 && dtc < 0.25) hint = { e, dtc }
      if (dtc >= 0 && dtc < 0.7) ripples.push({ e, dtc })
    }
    if (hint && hint.e.rect && alpha > 0) {
      const r = m.rect(hint.e.rect)
      const k = hint.dtc < 0 ? easeOut(clamp((hint.dtc + 0.55) / 0.3, 0, 1)) : 1 - clamp(hint.dtc / 0.25, 0, 1)
      const pad = 5 * Math.sqrt(cam.z)
      Object.assign(OV['ov-hint'].style, {
        display: '',
        left: `${r.x - pad}px`,
        top: `${r.y - pad}px`,
        width: `${r.width + pad * 2}px`,
        height: `${r.height + pad * 2}px`,
        opacity: String(k * alpha),
      })
      const pulse = ((hint.dtc + 0.55) / 0.55) % 1
      const p = m.pt(hint.e.x, hint.e.y)
      const size = 26 + 26 * easeOut(pulse)
      Object.assign(OV['ov-hint-ring'].style, {
        display: hint.dtc < 0 ? '' : 'none',
        left: `${p.x - size / 2}px`,
        top: `${p.y - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        opacity: String((1 - pulse) * 0.9 * k * alpha),
      })
    } else {
      show(OV['ov-hint'], false)
      show(OV['ov-hint-ring'], false)
    }
    const rp = OV['ov-ripples']
    while (rp.children.length < ripples.length * 2) rp.appendChild(Object.assign(document.createElement('div'), { className: 'ov-ripple' }))
    ;[...rp.children].forEach((el, i) => {
      const rip = ripples[Math.floor(i / 2)]
      if (!rip || alpha === 0) return (el.style.display = 'none')
      const delay = i % 2 === 0 ? 0 : 0.12
      const p = clamp((rip.dtc - delay) / 0.55, 0, 1)
      const pt = m.pt(rip.e.x, rip.e.y)
      const size = 14 + 70 * easeOut(p)
      Object.assign(el.style, {
        display: p > 0 && p < 1 ? '' : 'none',
        left: `${pt.x - size / 2}px`,
        top: `${pt.y - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        opacity: String((1 - p) * alpha * (i % 2 === 0 ? 1 : 0.6)),
      })
    })

    // spotlight: the most recent live one
    let spot = null
    for (const e of ev) {
      if (e.type !== 'spotlight') continue
      const a = e.f / fps
      const b = a + (e.dur ?? 2.4)
      if (t >= a && t <= b + 0.35) spot = { e, k: envelope(t, a, b + 0.35, 0.35, 0.35) }
    }
    if (spot && spot.k > 0 && alpha > 0) {
      const pad = (spot.e.pad ?? 10) * Math.sqrt(cam.z)
      const r0 = m.rect(spot.e.rect)
      const r = { x: r0.x - pad, y: r0.y - pad, width: r0.width + pad * 2, height: r0.height + pad * 2 }
      const rad = (spot.e.radius ?? 12) * Math.sqrt(cam.z)
      const hole = `M${r.x + rad},${r.y} H${r.x + r.width - rad} A${rad},${rad} 0 0 1 ${r.x + r.width},${r.y + rad} V${r.y + r.height - rad} A${rad},${rad} 0 0 1 ${r.x + r.width - rad},${r.y + r.height} H${r.x + rad} A${rad},${rad} 0 0 1 ${r.x},${r.y + r.height - rad} V${r.y + rad} A${rad},${rad} 0 0 1 ${r.x + rad},${r.y} Z`
      OV['ov-spot-dim'].setAttribute('d', `M0,0 H${W} V${H} H0 Z ${hole}`)
      for (const id of ['ov-spot-glow', 'ov-spot-halo']) {
        const el = OV[id]
        el.setAttribute('x', r.x)
        el.setAttribute('y', r.y)
        el.setAttribute('width', r.width)
        el.setAttribute('height', r.height)
        el.setAttribute('rx', rad)
      }
      OV['ov-spot'].style.display = ''
      OV['ov-spot'].style.opacity = String(spot.k * alpha)
      const lab = OV['ov-spot-label']
      if (spot.e.label) {
        lab.querySelector('.ov-tag__t').textContent = spot.e.label
        lab.style.display = ''
        const above = r.y > 110
        const lx = clamp(r.x, 40, W - 520)
        const ly = above ? r.y - 14 : r.y + r.height + 14
        lab.style.transform = `translate(${lx}px, ${ly}px) translate(0, ${above ? '-100%' : '0'}) translateY(${(1 - spot.k) * 10}px)`
        lab.style.opacity = String(spot.k * alpha)
      } else lab.style.display = 'none'
    } else {
      OV['ov-spot'].style.display = 'none'
      OV['ov-spot-label'].style.display = 'none'
    }

    // callouts
    const live = ev.filter((e) => e.type === 'callout' && t >= e.f / fps && t <= e.f / fps + (e.dur ?? 2.2) + 0.3)
    const box = OV['ov-callouts']
    while (box.children.length < live.length) {
      const d = document.createElement('div')
      d.className = 'ov-call'
      d.innerHTML = '<svg class="ov-call__line" width="120" height="120"><path/></svg><div class="ov-call__t"></div>'
      box.appendChild(d)
    }
    ;[...box.children].forEach((el, i) => {
      const e = live[i]
      if (!e || alpha === 0) return (el.style.display = 'none')
      const a = e.f / fps
      const k = envelope(t, a, a + (e.dur ?? 2.2) + 0.3, 0.3, 0.3)
      const r = m.rect(e.rect)
      el.style.display = ''
      el.querySelector('.ov-call__t').textContent = e.text
      const side = e.side ?? 'top'
      const ax = side === 'left' ? r.x : side === 'right' ? r.x + r.width : r.x + r.width / 2
      const ay = side === 'top' ? r.y : side === 'bottom' ? r.y + r.height : r.y + r.height / 2
      const off = 58 + (1 - easeOut(k)) * 18
      const dx = side === 'left' ? -off : side === 'right' ? off : 0
      const dy = side === 'top' ? -off : side === 'bottom' ? off : 0
      el.style.transform = `translate(${ax + dx}px, ${ay + dy}px)`
      el.style.opacity = String(k * alpha)
      el.dataset.side = side
      const path = el.querySelector('path')
      // a short arrow from the label back to the anchor, drawn in the element's own box
      const L = 44 * easeOut(k)
      const d =
        side === 'top' ? `M60,70 L60,${70 + L}` : side === 'bottom' ? `M60,50 L60,${50 - L}` : side === 'left' ? `M70,60 L${70 + L},60` : `M50,60 L${50 - L},60`
      path.setAttribute('d', d)
    })

    // keycaps
    const keys = ev.filter((e) => e.type === 'keys' && t >= e.f / fps - 0.05 && t <= e.f / fps + (e.dur ?? 1.1) + 0.3)
    const kb = OV['ov-keys']
    const k0 = keys[keys.length - 1]
    if (k0 && alpha > 0) {
      const a = k0.f / fps
      const k = envelope(t, a - 0.05, a + (k0.dur ?? 1.1) + 0.3, 0.15, 0.3)
      const html = keyCaps(k0.combo, k0.label, clamp((t - a) / 0.18, 0, 1))
      if (kb.dataset.html !== html) {
        kb.innerHTML = html
        kb.dataset.html = html
      }
      kb.style.display = ''
      kb.style.opacity = String(k * alpha)
      kb.style.transform = `translate(-50%, ${(1 - easeOut(k)) * 14}px)`
    } else kb.style.display = 'none'

    // step banner (lower third, top-left)
    const lows = ev.filter((e) => e.type === 'lower' && t >= e.f / fps && t <= e.f / fps + (e.dur ?? 3.2) + 0.4)
    const lo = lows[lows.length - 1]
    const lel = OV['ov-lower']
    if (lo && alpha > 0) {
      const a = lo.f / fps
      const k = envelope(t, a, a + (lo.dur ?? 3.2) + 0.4, 0.45, 0.4)
      lel.querySelector('.ov-lower__k').textContent = lo.kicker ?? ''
      lel.querySelector('.ov-lower__t').textContent = lo.title ?? ''
      lel.querySelector('.ov-lower__s').textContent = lo.text ?? ''
      lel.style.display = ''
      lel.style.opacity = String(k * alpha)
      lel.style.transform = `translateX(${(1 - easeOut(k)) * -40}px)`
    } else lel.style.display = 'none'
  }

  function keyCaps(combo, label, press) {
    const nice = { Control: 'Ctrl', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backslash: '\\', Delete: 'Del', Escape: 'Esc', Enter: 'Enter', Shift: 'Shift', Alt: 'Alt' }
    const parts = combo === '?' ? ['?'] : combo.split('+').map((p) => nice[p] ?? (p.length === 1 ? p.toUpperCase() : p))
    const caps = parts
      .map((p, i) => `${i ? '<span class="ov-keys__plus">+</span>' : ''}<kbd class="${press > 0 && press < 1 ? 'is-down' : ''}">${p}</kbd>`)
      .join('')
    return `<div class="ov-keys__caps">${caps}</div>${label ? `<div class="ov-keys__label">${label}</div>` : ''}`
  }

  /* --- captions ------------------------------------------------------------- */
  let capText = null
  function drawCaption(t) {
    const caps = state.edl.captions
    let cur = null
    for (const c of caps) if (t >= c.start && t < c.end) cur = c
    const el = $('#cap')
    if (!cur) {
      el.style.opacity = '0'
      return
    }
    const k = envelope(t, cur.start, cur.end, 0.22, 0.22)
    if (capText !== cur.text) {
      el.querySelector('.cap__t').textContent = cur.text
      capText = cur.text
    }
    const left = cur.pos === 'left'
    el.classList.toggle('cap--left', left)
    el.style.opacity = String(k)
    const dy = (1 - easeOut(clamp((t - cur.start) / 0.3, 0, 1))) * 10
    el.style.transform = left ? `translate(0, ${dy}px)` : `translate(-50%, ${dy}px)`
  }

  /* --- slides ---------------------------------------------------------------- */
  function slideEl(item) {
    const key = item.id
    if (state.slideEls[key]) return state.slideEls[key]
    const def = window.SLIDES[item.slide]
    const el = document.createElement('section')
    el.className = `slide slide--${item.slide}`
    el.dataset.slide = key
    el.style.display = 'none'
    $('#slides').appendChild(el)
    def.build(el, item.params ?? {}, state.edl)
    state.slideEls[key] = el
    return el
  }

  function driveSlide(item, el, local) {
    const def = window.SLIDES[item.slide]
    for (const a of el.getAnimations({ subtree: true })) {
      a.pause()
      a.currentTime = Math.max(0, local * 1000)
    }
    def.update?.(el, local, item.dur, item.params ?? {})
  }

  /* --- the frame ------------------------------------------------------------ */
  const activeSlides = new Set()

  async function renderFrame(i) {
    const fps = state.fps
    const t = i / fps
    const items = state.edl.items
    const live = items.filter((it) => t >= it.start && t < it.end)

    const want = new Set()
    let stage = null // {take, f, look, xf}
    let hudChapter = null
    /* The chapter chip announces a chapter and then gets out of the way: it
       sits over the app's own logo, so it stays only for the first seconds of
       each take, and never over a full chapter card that already says it. */
    let hudK = 0
    let fullCard = false

    for (const it of live) {
      const local = t - it.start
      if (it.kind === 'take') {
        const take = state.takes[it.take]
        const f = Math.min(take.frames.length - 1, Math.floor(local * fps))
        stage = { take, takeId: it.take, f, look: { alpha: 1, blur: 0, overlay: 1 }, xf: { s: 1, dx: 0, dy: 0 } }
        hudChapter = it.chapter
        hudK = envelope(local, 0, 4.8, 0.45, 0.7)
      }
    }
    for (const it of live) {
      const local = t - it.start
      if (it.kind === 'slide' || it.kind === 'card') {
        const el = slideEl(it)
        want.add(it.id)
        el.style.display = ''
        const tin = it.tin ?? 0
        const tout = it.tout ?? 0
        const kin = tin > 0 ? clamp(local / tin, 0, 1) : 1
        const kout = tout > 0 ? clamp((it.end - t) / tout, 0, 1) : 1
        if (it.kind === 'slide') {
          const k = easeInOut(Math.min(kin, kout))
          el.style.opacity = String(k)
          const lift = (1 - easeOut(kin)) * 26 - (1 - easeInOut(kout)) * 26
          el.style.transform = `translateY(${lift}px) scale(${1 + (1 - easeInOut(kout)) * 0.02})`
          el.style.filter = kout < 1 ? `blur(${(1 - kout) * 8}px)` : 'none'
        } else {
          // a card covers the stage with an iris, then opens onto the next take
          const open = easeInOut(kin)
          const close = easeInOut(kout)
          const reveal = Math.min(open, close)
          const radius = reveal * 1.15 * Math.hypot(W, H) / 2
          el.style.clipPath = it.params?.compact ? 'none' : `circle(${radius}px at 50% 50%)`
          el.style.opacity = it.params?.compact ? String(reveal) : '1'
          el.style.filter = 'none'
          el.style.transform = it.params?.compact ? `translateY(${(1 - reveal) * 18}px)` : 'none'
          // the stage behind it: the take we are leaving, then the one we are entering
          const half = (it.end - it.start) / 2
          const prev = it.prevTake ? state.takes[it.prevTake] : null
          const next = it.nextTake ? state.takes[it.nextTake] : null
          const useNext = local >= half ? next ?? prev : prev ?? next
          if (useNext && !stage) {
            /* With no take before it (the first chapter card, straight after
               the slides) the card borrows the NEXT take for its whole length —
               picture and camera both, or the camera looks up a take that is not
               there. */
            const isNext = useNext === next && (local >= half || !prev)
            const f = isNext ? 0 : useNext.frames.length - 1
            const id = isNext ? it.nextTake : it.prevTake
            const depth = it.params?.compact ? 0.55 : 1
            stage = {
              take: useNext,
              takeId: id,
              f,
              look: { alpha: 1, blur: 14 * reveal * depth, overlay: 1 - reveal },
              xf: { s: 1 - 0.05 * reveal * depth, dx: 0, dy: 0 },
            }
          }
          hudChapter = it.chapter ?? hudChapter
          if (it.params?.compact) hudK = Math.max(hudK, reveal)
          else fullCard = true
        }
        driveSlide(it, el, local)
      }
    }
    for (const id of activeSlides) {
      if (!want.has(id)) {
        const el = state.slideEls[id]
        if (el) el.style.display = 'none'
        activeSlides.delete(id)
      }
    }
    want.forEach((id) => activeSlides.add(id))

    // stage + overlays
    $('#stage').style.display = stage ? '' : 'none'
    $('#ov').style.display = stage ? '' : 'none'
    if (stage) {
      const cam = camAt(stage.takeId, stage.f)
      await drawStage(stage.take, stage.f, cam, stage.xf, stage.look)
      drawOverlays(stage.take, stage.f, cam, stage.xf, stage.look)
    }

    // ground: drifts slowly for the whole film
    $('#bg').style.backgroundPosition = `${(t * 6) % 26}px ${(t * 3) % 26}px, 0 0, 0 0`

    drawCaption(t)
    drawHud(t, hudChapter, fullCard ? 0 : hudK, !!stage && !fullCard)
    if (document.fonts && document.fonts.status !== 'loaded') await document.fonts.ready
    await new Promise((r) => requestAnimationFrame(() => r()))
    return true
  }

  function drawHud(t, chapter, chipK, railOn) {
    const hud = $('#hud-chip')
    const chapters = state.edl.chapters
    const c = chapters.find((x) => x.id === chapter)
    const k = c ? chipK : 0
    hud.style.opacity = String(k)
    hud.style.transform = `translateY(${(1 - k) * -10}px)`
    const onStage = railOn
    if (c) {
      hud.querySelector('.hud__n').textContent = c.n
      hud.querySelector('.hud__t').textContent = c.title
    }
    const rail = $('#hud-rail')
    const total = state.edl.duration
    const first = state.edl.contentStart ?? 0
    const p = clamp((t - first) / (total - first), 0, 1)
    rail.style.opacity = String(onStage ? 1 : 0)
    rail.querySelector('.hud__fill').style.width = `${p * 100}%`
  }

  /* Four workers start at once against one local server; a load that hiccups
     is retried, and one that keeps failing says which file it was. */
  async function getJSON(url) {
    let last = null
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(url, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return await r.json()
      } catch (err) {
        last = err
        await new Promise((res) => setTimeout(res, 300 * (attempt + 1)))
      }
    }
    throw new Error(`could not load ${url}: ${last}`)
  }

  async function init(edlUrl) {
    const edl = await getJSON(edlUrl)
    state.edl = edl
    state.fps = edl.fps
    for (const [id, url] of Object.entries(edl.takes)) {
      const take = await getJSON(url)
      state.takes[id] = take
      state.cams[id] = cameraTrack(take)
    }
    ovInit()
    // chapter ticks on the rail
    const rail = document.querySelector('#hud-rail .hud__ticks')
    const first = edl.contentStart ?? 0
    rail.innerHTML = edl.chapters
      .filter((c) => c.at !== undefined)
      .map((c) => `<i style="left:${((c.at - first) / (edl.duration - first)) * 100}%"></i>`)
      .join('')
    if (document.fonts) await document.fonts.ready
    return { frames: Math.round(edl.duration * edl.fps), fps: edl.fps, duration: edl.duration }
  }

  window.COMPOSE = { init, renderFrame, W, H, WIN, easeInOut, easeOut, easeOutBack, clamp, lerp, envelope }
})()
