/* -----------------------------------------------------------------------------
   The compositor — pass two. Turns pictures of the app into a film.

   `renderFrame(i)` draws output frame i of the edit and resolves when every
   pixel of it is final; the renderer screenshots the page after each call. The
   whole page is a pure function of the frame number: no timers, no animation
   that runs on its own. CSS animations on the slides are paused and their
   currentTime set from the edit's clock, so frame 4,000 renders the same
   whether it is the first frame rendered or the last.

   Layers, bottom to top:
     #bg       the ground — themed, a dot grid, a slow drift
     #stage    <canvas> — the product window(s): chrome, shadow, the app picture,
               moved by the camera; two windows during a push
     #ov       everything drawn over the product: cursor, click cues, spotlight,
               callouts — positioned through the camera
     #slides   full-screen scenes and the chapter banners
     #mascot   the orange (compose/mascot.js), in screen space, placed through
               the camera when it stands in the product
     #cloud    its thought cloud — the subtitles, words revealed as spoken
     #kbd      the on-screen keyboard (compose/keyboard.js)
     #hud      the progress rail
   -------------------------------------------------------------------------- */
;(() => {
  const W = 1920
  const H = 1080
  const APP = { w: 1440, h: 900 }

  /* The window at rest: as large as the frame allows with a margin, which
     puts the app at 1.11× its CSS size — readable text at 1080p before any
     zoom. The title bar sits above the app picture. */
  /* A caption band is reserved under the window (CAP_BAND), so a subtitle never
     covers the product: the window is a little smaller than the frame and the
     words live in the ground beneath it. */
  const CAP_BAND = 100
  const WIN = (() => {
    const top = 16
    const bar = 34
    const bottom = CAP_BAND
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
  const easeIn = (t) => t * t * t
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
  /* A CSS cubic-bezier, evaluated for its progress at x — the storyboard names
     its curves this way (DESIGN-v6 §1.4). Newton first, bisection when it wanders. */
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
  const INOUT_B = bezier(0.4, 0, 0, 1) // the shelf
  const DEC = bezier(0.05, 0.7, 0.1, 1) // a heavy object arriving
  const EXIT_C = bezier(0.2, 0, 1, 0.9) // overlays leaving

  const state = {
    edl: null,
    fps: 30,
    theme: 'light',
    colors: {},
    takes: {},
    cams: {},
    mascotKeys: {}, // per take: the mascot events, resolved to app-space keys
    cardTracks: {}, // per card-mode item: the card's rect, mask blend and camera per frame
    images: new Map(),
    order: [],
    pinned: new Map(), // image id → decoded <img>, kept for the whole render (preloadFrames)
    slideEls: {},
    rig: null,
  }

  /* --- theme ------------------------------------------------------------------- */
  function readColors() {
    const cs = getComputedStyle(document.documentElement)
    const v = (n, d) => (cs.getPropertyValue(n) || d).trim()
    state.colors = {
      winBg: v('--win-bg', '#ffffff'),
      barA: v('--win-bar-a', '#fbfcfd'),
      barB: v('--win-bar-b', '#f1f4f7'),
      dot: v('--win-dot', '#e6e9ed'),
      dotStroke: v('--win-dot-stroke', '#d3dae1'),
      pill: v('--win-pill', '#ffffff'),
      pillBorder: v('--win-pill-border', '#e4e8ec'),
      pillText: v('--win-pill-text', '#646e79'),
      lock: v('--win-lock', '#8a949e'),
      hairline: v('--win-hairline', 'rgba(33,37,41,0.10)'),
      shadow: v('--win-shadow', 'rgba(22,32,44,0.20)'),
    }
  }

  /* --- images ------------------------------------------------------------- */
  async function image(id) {
    // a picture a slide preloaded (preloadFrames) is already decoded: no second copy
    const pin = state.pinned.get(id)
    if (pin) return pin
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
    /* vertically the picture must always fill the stage exactly — its top at the
       app area's top, its bottom on the caption band — or the window would grow
       or shrink in height as the camera moves */
    const loY = (O.y - WIN.ay) / s
    const hiY = APP.h - (WIN.ay + WIN.ah - O.y) / s
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
    // keep the subject above the cloud's usual band
    const cy = rect.y + rect.height / 2 + lift / (WIN.s0 * z)
    return clampCam({ cx: rect.x + rect.width / 2, cy, z })
  }

  /* The camera has two sources of keys. Explicit `focus` events from the script
     (dialogs, the card) come first. Then every spotlight the camera is not
     already framing gets its own gentle move: ease onto the region, hold while
     it is lit, ease back — so a highlight is always framed, not just outlined. */
  function cameraTrack(take) {
    const n = take.frames.length
    const fps = take.fps
    const cx = new Float32Array(n)
    const cy = new Float32Array(n)
    const cz = new Float32Array(n)
    const explicit = take.events
      .filter((e) => e.type === 'focus')
      .map((e) => ({
        start: Math.max(0, e.f - Math.round((e.lead ?? 0) * fps)),
        dur: Math.max(1, Math.round((e.dur ?? 1) * fps)),
        target: e.rect ? fit(e.rect, e.zoom, e.pad) : { ...BASE },
      }))
      .sort((a, b) => a.start - b.start)
    // where the explicit track rests at a frame: the last explicit key before it
    const restingAt = (f) => {
      let z = 1
      for (const k of explicit) if (k.start <= f) z = k.target.z
      return z
    }
    const auto = []
    const restingKey = (f) => {
      let k = null
      for (const e of explicit) if (e.start <= f) k = e
      return k
    }
    // where the camera is heading at frame f, given every key placed so far
    const camAt = (f) => {
      let k = null
      for (const e of [...explicit, ...auto]) if (e.start <= f && (!k || e.start >= k.start)) k = e
      return k ? k.target : BASE
    }
    // is the (padded) rect inside the picture the camera shows from `cam`?
    const inView = (cam, rect, pad) => {
      const c = clampCam(cam)
      const s = WIN.s0 * c.z
      const x0 = c.cx - O.x / s
      const x1 = c.cx + (W - O.x) / s
      const y0 = c.cy - (O.y - WIN.ay) / s
      const y1 = c.cy + (WIN.ay + WIN.ah - O.y) / s
      return rect.x - pad >= x0 && rect.x + rect.width + pad <= x1 && rect.y - pad >= y0 && rect.y + rect.height + pad <= y1
    }
    const spots = take.events
      // `cam: false` keeps the camera at rest — under the explainer shelf a zoom would push the picture past the frame
      .filter((e) => e.type === 'spotlight' && e.rect && e.f < n && e.cam !== false)
      .filter((e) => !(e.rect.width > APP.w * 0.6 || e.rect.height > APP.h * 0.6)) // a whole panel: outlining it is enough
      .sort((a, b) => a.f - b.f)
    const firstExplicitAfter = (f) => explicit.find((k) => k.start > f)?.start ?? Infinity
    spots.forEach((e, i) => {
      const hold = e.f + Math.round(((e.dur ?? 2.4) + 0.35) * fps)
      const framed = restingKey(e.f)
      let target, rest
      if (framed && framed.target.z > 1.001) {
        /* the script is already framing something: leave the camera alone — unless
           the spotlight lies outside that picture (a panel that grew under a frame
           taken earlier), in which case pan to it at the same zoom, then come back */
        if (inView(camAt(e.f), e.rect, 24)) return
        target = { cx: e.rect.x + e.rect.width / 2, cy: e.rect.y + e.rect.height / 2, z: framed.target.z }
        rest = framed.target
      } else {
        target = fit(e.rect, 1.28, 90, 0)
        rest = BASE
      }
      auto.push({ start: e.f, dur: Math.round(0.9 * fps), target, auto: true })
      const next = spots[i + 1]
      // return to rest — unless the next spotlight (or a scripted move) takes over first
      if ((next && next.f <= hold + 6) || firstExplicitAfter(e.f) <= hold + 6) return
      auto.push({ start: hold, dur: Math.round(0.9 * fps), target: { ...rest }, auto: true })
    })
    const keys = [...explicit, ...auto].sort((a, b) => a.start - b.start)
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

  /* --- card mode -------------------------------------------------------------
     A take filmed in card mode shows only the rule card: the recorder tracked
     the card's rect frame by frame (`cardRect` events), and `cardMode` events
     switch between the card (masked, enlarged, centred) and the whole window.
     The camera follows the card with a short lag so growth reads as motion, not
     as a jump; the mask itself is exact per frame. Nothing here is clamped to
     the app's edges — the card is the picture. */
  const CARD_W = 1000 // the card's width on screen
  const CARD_MAXH = 850 // and the most height it may take
  const cardCam = (rect) => ({
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2,
    z: clamp(Math.min(CARD_W / (rect.width * WIN.s0), CARD_MAXH / (rect.height * WIN.s0)), 1, 2.6),
  })
  function cardTrack(take) {
    const n = take.frames.length
    const fps = take.fps
    const rects = take.events.filter((e) => e.type === 'cardRect' && e.rect).sort((a, b) => a.f - b.f)
    if (!rects.length) return null
    const modes = take.events.filter((e) => e.type === 'cardMode').sort((a, b) => a.f - b.f)
    const freezes = take.events.filter((e) => e.type === 'cardFreeze').sort((a, b) => a.f - b.f)
    const annos = take.events.filter((e) => e.type === 'cardAnno').sort((a, b) => a.f - b.f)
    const lights = take.events.filter((e) => e.type === 'cardLight').sort((a, b) => a.f - b.f)
    const truths = take.events.filter((e) => e.type === 'truthStep').sort((a, b) => a.f - b.f)
    const partsEv = take.events.filter((e) => e.type === 'cardParts' && e.parts).sort((a, b) => a.f - b.f)
    const out = { rect: new Array(n), blend: new Float32Array(n), cx: new Float32Array(n), cy: new Float32Array(n), cz: new Float32Array(n), eff: new Int32Array(n), mix: new Float32Array(n), annoAnd: new Float32Array(n), annoOr: new Float32Array(n), light: new Array(n), truth: new Array(n), parts: new Array(n), n }
    const ANNO_SHIFT = 210 // screen px the card moves left to make room for the annotation
    const astep = 1 / (fps * 0.5)
    let ai = 0
    let li = 0
    let ti = 0
    let pi = 0
    /* the annotation arrives in two stages: 'and' (outer bracket, label, shift,
       panel) then 'both' (the inner bracket and OR); each is its own eased float */
    let andOn = false
    let orOn = false
    let andK = 0
    let orK = 0
    /* the lit part of the card: which, how far its veil has come (0..1), and the
       part waiting for the veil to clear — a change fades the old light out over
       0.20 s, then the new one in over 0.35 s (§4.3) */
    let litPart = null
    let litK = 0
    let litNext
    let litSince = 0
    const LIGHT_OUT = 1 / (fps * 0.2)
    const LIGHT_IN = 1 / (fps * 0.35)
    /* the truth table's lit rows and when each first lit (take seconds). A take
       with no truthStep events lights every row from the start, as the fifth cut did. */
    let truth = truths.length ? { rows: 0, at: [] } : { rows: 4, at: [-1e9, -1e9, -1e9, -1e9] }
    let parts = null
    const base = { ...BASE }
    const k = 1 - Math.exp(-1 / (fps * 0.22)) // the camera's follow, ~0.22 s
    const bstep = 1 / (fps * 0.9) // mask ↔ window over 0.9 s
    const RELEASE = Math.round(fps * 0.4) // a frozen picture crossfades back to live over 0.4 s
    const liveRect = new Array(n)
    let ri = 0
    let mi = 0
    let fi = 0
    let on = true
    let blend = 1
    let cam = null
    let frozenAt = -1 // the frame whose picture stands in while a dialog covers the card
    let releasedAt = -1
    for (let f = 0; f < n; f++) {
      while (ri + 1 < rects.length && rects[ri + 1].f <= f) ri++
      while (mi < modes.length && modes[mi].f <= f) {
        on = modes[mi].on !== false
        mi++
      }
      while (fi < freezes.length && freezes[fi].f <= f) {
        if (freezes[fi].on !== false) {
          // a fresh freeze holds this frame — also when the last one was still crossfading back
          if (frozenAt < 0 || releasedAt >= 0) frozenAt = f
          releasedAt = -1
        } else if (frozenAt >= 0) {
          releasedAt = f
        }
        fi++
      }
      liveRect[f] = rects[ri].rect
      /* the frame that stands for this one, and how far the live picture has
         come back: frozen → the freeze frame; releasing → a crossfade */
      let eff = f
      let mix = 1
      if (frozenAt >= 0) {
        eff = frozenAt
        if (releasedAt >= 0) {
          mix = clamp((f - releasedAt + 1) / RELEASE, 0, 1)
          if (mix >= 1) {
            frozenAt = -1
            releasedAt = -1
            eff = f
          }
        } else mix = 0
      }
      out.eff[f] = eff
      out.mix[f] = mix
      // the annotation (brackets + truth table) and the card parts it points at
      while (ai < annos.length && annos[ai].f <= f) {
        const e = annos[ai]
        if (e.on !== false) {
          andOn = true
          orOn = (e.stage ?? 'both') === 'both' // an event without a stage means both, as the fifth cut wrote it
        } else {
          andOn = false
          orOn = false
          if (truths.length) truth = { rows: 0, at: [] }
        }
        ai++
      }
      while (pi < partsEv.length && partsEv[pi].f <= f) {
        parts = partsEv[pi].parts
        pi++
      }
      andK = clamp(andK + (andOn ? astep : -astep), 0, 1)
      orK = clamp(orK + (orOn ? astep : -astep), 0, 1)
      out.annoAnd[f] = easeInOut(andK)
      out.annoOr[f] = easeInOut(orK)
      out.parts[f] = parts
      // the card lighting
      while (li < lights.length && lights[li].f <= f) {
        const p = lights[li].part ?? null
        if (litPart === null || litK <= 0) {
          // nothing lit: the new part comes straight in
          litPart = p
          litK = 0
          litNext = undefined
          litSince = f
        } else if (p !== litPart) litNext = p
        else litNext = undefined // asked for the part already lit: keep it
        li++
      }
      if (litNext !== undefined) {
        litK -= LIGHT_OUT
        if (litK <= 0) {
          litK = 0
          litPart = litNext
          litNext = undefined
          litSince = f
        }
      } else if (litPart !== null) litK = Math.min(1, litK + LIGHT_IN)
      out.light[f] = litPart === null ? null : { part: litPart, k: litK, since: (f - litSince) / fps }
      // the truth table's rows
      while (ti < truths.length && truths[ti].f <= f) {
        const rows = clamp(Math.round(truths[ti].rows ?? 0), 0, 4)
        const at = truth.at.slice(0, rows)
        for (let i = truth.rows; i < rows; i++) at[i] = f / fps
        truth = { rows, at }
        ti++
      }
      out.truth[f] = truth
      const rect = mix >= 1 ? liveRect[f] : mix <= 0 ? liveRect[eff] : lerpRect(liveRect[eff], liveRect[f], mix)
      const tgt = cardCam(rect)
      tgt.cx += (out.annoAnd[f] * ANNO_SHIFT) / (WIN.s0 * tgt.z) // slide left while annotated
      if (!cam) cam = { ...tgt }
      else {
        cam.cx += (tgt.cx - cam.cx) * k
        cam.cy += (tgt.cy - cam.cy) * k
        cam.z = Math.exp(Math.log(cam.z) + (Math.log(tgt.z) - Math.log(cam.z)) * k)
      }
      blend = clamp(blend + (on ? bstep : -bstep), 0, 1)
      const e = easeInOut(blend)
      out.rect[f] = rect
      out.blend[f] = e
      out.cx[f] = lerp(base.cx, cam.cx, e)
      out.cy[f] = lerp(base.cy, cam.cy, e)
      out.cz[f] = Math.exp(lerp(Math.log(base.z), Math.log(cam.z), e))
    }
    // the last frame on which the card was still the picture: the intro hands over to it
    const off = modes.filter((m) => m.on === false).pop()
    out.holdFrame = off ? Math.max(0, off.f - 1) : n - 1
    out.live = liveRect // the card's real rect per frame (before any freeze)
    return out
  }
  const cardAt = (ct, f) => {
    const i = clamp(f, 0, ct.n - 1)
    return { rect: ct.rect[i], blend: ct.blend[i], cam: { cx: ct.cx[i], cy: ct.cy[i], z: ct.cz[i] }, annoAnd: ct.annoAnd[i], annoOr: ct.annoOr[i], light: ct.light[i], truth: ct.truth[i], parts: ct.parts[i] }
  }
  const lerpRect = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), width: lerp(a.width, b.width, k), height: lerp(a.height, b.height, k) })
  const lerpCam = (a, b, k) => ({ cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) })
  /* Where a card rect lands on screen in card mode — the intro's device trims down to exactly this. */
  function cardTarget(rect) {
    const m = mapper(cardCam(rect))
    return m.rect(rect)
  }
  /* The card take's hand-over frame: its index, the card's rect and its picture. */
  function cardHold(takeName) {
    const take = state.takes[takeName]
    if (!take) return null
    const ct = Object.entries(state.cardTracks).find(([id]) => state.edl.items.find((it) => it.id === id)?.take === takeName)?.[1] ?? cardTrack(take)
    if (!ct) return null
    const f = ct.holdFrame
    return { f, rect: ct.rect[f], url: `${state.edl.imgBase}/${take.frames[f][0]}.jpg`, target: cardTarget(ct.rect[f]) }
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

  async function drawStages(stages) {
    const cv = $('#stage')
    const ctx = cv.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    for (const st of stages) await drawStage(ctx, st.take, st.f, st.cam, st.xf, st.look)
  }

  async function drawStage(ctx, take, f, cam, xf, look) {
    if (!take) return
    const frame = take.frames[clamp(f, 0, take.frames.length - 1)]
    const img = await image(frame[0])
    const m = mapper(cam, xf)
    const barH = WIN.bar / WIN.s0 // title bar height in app px
    const tl0 = m.pt(0, -barH)
    const br0 = m.pt(APP.w, APP.h)
    /* The box the picture shows through: the whole window, or — in card mode —
       the card's own rect, and anything between while the mask opens or closes. */
    const win = { x: tl0.x, y: tl0.y, width: br0.x - tl0.x, height: br0.y - tl0.y }
    const b = look.card ? look.card.blend : 0
    let box = look.card ? lerpRect(win, m.rect(look.card.rect), b) : win
    if (look.card?.clip) {
      // this picture may only show through its own card's box
      const c = m.rect(look.card.clip)
      const x0 = Math.max(box.x, c.x)
      const y0 = Math.max(box.y, c.y)
      const x1 = Math.min(box.x + box.width, c.x + c.width)
      const y1 = Math.min(box.y + box.height, c.y + c.height)
      box = { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }
    }
    // the window's own corner, or — masked to the card — the card's own 12 app px
    const r = lerp((14 * m.s) / WIN.s0, 12 * m.s, b)
    const a = m.pt(0, 0)
    paintWindow(ctx, {
      x: box.x,
      y: box.y,
      w: box.width,
      h: box.height,
      radius: r,
      barPx: barH * m.s,
      u: m.s / WIN.s0,
      alpha: look.alpha,
      chrome: 1 - b, // the title bar fades as the mask closes on the card
      shadowBlur: (70 - 20 * b) * xf.s,
      shadowY: (26 - 8 * b) * xf.s,
      blur: look.blur,
      img,
      ix: a.x,
      iy: a.y,
      iw: APP.w * m.s,
      ih: APP.h * m.s,
      clipBottom: WIN.ay + WIN.ah + 1,
    })
  }

  /* One product window on a 2D canvas: its shadow and ground, the title bar (the
     three dots, the address pill and its lock), the app picture and the hairline.
     `x, y, w, h` is the whole window box in screen px (title bar included), `u`
     one app px at rest in this drawing's scale, `ix..ih` where the picture goes.
     `clipBottom`: nothing is drawn below it (the stage keeps the caption band
     clear; the shadow under the window is cut there too). */
  function paintWindow(ctx, p) {
    const C = state.colors
    const { x, y, w: ww, h: wh, radius: r, barPx, u, alpha, chrome, img } = p
    ctx.save()
    // whatever the camera does, the picture stops above the caption band
    if (Number.isFinite(p.clipBottom)) {
      ctx.beginPath()
      ctx.rect(-W, -H, W * 3, H + p.clipBottom)
      ctx.clip()
    }
    ctx.globalAlpha = alpha
    if (p.blur > 0.2) ctx.filter = `blur(${p.blur.toFixed(1)}px)`
    // shadow
    ctx.save()
    ctx.shadowColor = C.shadow
    ctx.shadowBlur = p.shadowBlur
    ctx.shadowOffsetY = p.shadowY
    roundRect(ctx, x, y, ww, wh, r)
    ctx.fillStyle = C.winBg
    ctx.fill()
    ctx.restore()
    // title bar
    ctx.save()
    roundRect(ctx, x, y, ww, wh, r)
    ctx.clip()
    if (chrome > 0.01) {
      ctx.globalAlpha = alpha * chrome
      // flat, like everything else in the film (no gradients); the bento's window matches it
      ctx.fillStyle = C.barB
      ctx.fillRect(x, y, ww, barPx)
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(x + (22 + i * 20) * u, y + barPx / 2, 6 * u, 0, Math.PI * 2)
        ctx.fillStyle = C.dot
        ctx.fill()
        ctx.strokeStyle = C.dotStroke
        ctx.lineWidth = 1 * u
        ctx.stroke()
      }
      // address pill
      const pw = 420 * u
      const ph = 22 * u
      const px = x + ww / 2 - pw / 2
      const py = y + barPx / 2 - ph / 2
      roundRect(ctx, px, py, pw, ph, ph / 2)
      ctx.fillStyle = C.pill
      ctx.fill()
      ctx.strokeStyle = C.pillBorder
      ctx.lineWidth = 1 * u
      ctx.stroke()
      ctx.fillStyle = C.pillText
      ctx.font = `500 ${12.5 * u}px "DM Sans", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(state.edl?.url ?? 'idp.xecurify.com/admin/policies', x + ww / 2, py + ph / 2 + 0.5 * u)
      // lock glyph
      ctx.strokeStyle = C.lock
      ctx.lineWidth = 1.3 * u
      const lx = px + 14 * u
      const ly = py + ph / 2
      ctx.strokeRect(lx - 3.5 * u, ly - 1 * u, 7 * u, 5.5 * u)
      ctx.beginPath()
      ctx.arc(lx, ly - 1 * u, 2.6 * u, Math.PI, 0)
      ctx.stroke()
    }
    ctx.globalAlpha = alpha
    // the app
    if (img) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, p.ix, p.iy, p.iw, p.ih)
    }
    ctx.restore()
    // hairline
    roundRect(ctx, x + 0.5, y + 0.5, ww - 1, wh - 1, r)
    ctx.strokeStyle = C.hairline
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  /* --- the window at rest, for slides ------------------------------------------
     A slide that must end on exactly the picture a take starts on (the bento's
     dock) needs the window's geometry and chrome as the stage draws them. All in
     screen px; `x, y, w, h` is the app picture, the title bar sits `bar` px above
     it, the whole window has corner `radius`, and one app px is `s0` screen px. */
  const winGeom = () => ({ x: WIN.ax, y: WIN.ay, w: WIN.aw, h: WIN.ah, bar: WIN.bar, radius: 14, s0: WIN.s0 })
  /* The chrome's colours (the theme's, read at init) and its measures at rest —
     for a slide that builds the window in the DOM rather than on a canvas. */
  const chrome = () => ({
    ...state.colors,
    url: state.edl?.url ?? 'idp.xecurify.com/admin/policies',
    shadowBlur: 70,
    shadowOffsetY: 26,
    dots: { x0: 22, step: 20, r: 6, stroke: 1 },
    addressPill: { w: 420, h: 22, font: '500 12.5px "DM Sans", system-ui, sans-serif', lockX: 14 },
    clipBottom: WIN.ay + WIN.ah + 1,
  })
  /* Paint the window at rest onto a 2D context in frame px (a 1920×1080 canvas
     matches the stage pixel for pixel): `img` a decoded picture of the app, or
     null for the chrome alone. `clip: false` keeps the shadow below the window,
     which the stage itself cuts at the caption band. */
  function paintRestWindow(ctx, img, { alpha = 1, clip = true } = {}) {
    paintWindow(ctx, {
      x: WIN.ax,
      y: WIN.ay - WIN.bar,
      w: WIN.aw,
      h: WIN.ah + WIN.bar,
      radius: 14,
      barPx: WIN.bar,
      u: 1,
      alpha,
      chrome: 1,
      shadowBlur: 70,
      shadowY: 26,
      blur: 0,
      img,
      ix: WIN.ax,
      iy: WIN.ay,
      iw: WIN.aw,
      ih: WIN.ah,
      clipBottom: clip ? WIN.ay + WIN.ah + 1 : Infinity,
    })
  }

  /* --- the cursor and its click ripples, as one definition -------------------
     The take's cursor is not in its pictures; the overlay draws it from the
     recorded position. A slide that plays a take's footage in a frame of its own
     (the bento's stage and filmstrip) draws the identical arrow and the same
     ripples, so both are defined once here and read by drawOverlays and by the
     exports below. The arrow's tip — its hot spot — sits HOT px from the
     sprite's top-left at scale 1; a press shrinks it to PRESS. The drop shadow
     is `.ov-cursor`'s filter in compose.css, repeated for canvas drawing. */
  const CURSOR = {
    size: 34,
    path: 'M7 3.5 L7 25.5 L12.4 20.6 L16 28.6 L20.1 26.8 L16.6 19 L23.8 18.6 Z',
    fill: '#ffffff',
    stroke: '#15191e',
    strokeWidth: 1.7,
    hotX: 7,
    hotY: 3.5,
    press: 0.86,
    shadow: { x: 0, y: 3, blur: 5, color: 'rgba(0, 0, 0, 0.28)' },
  }
  const cursorSvg = () =>
    `<svg viewBox="0 0 32 32" width="${CURSOR.size}" height="${CURSOR.size}">
          <path d="${CURSOR.path}" fill="${CURSOR.fill}" stroke="${CURSOR.stroke}" stroke-width="${CURSOR.strokeWidth}" stroke-linejoin="round"/>
        </svg>`
  /* The cursor's scale at a given magnification of the app (screen px per app
     px): the overlay grows it with the square root of the camera's zoom, so a
     picture shown at the same size in a slide gets the same arrow. */
  const cursorScale = (appScale) => Math.sqrt(Math.max(1e-6, appScale) / WIN.s0)
  let cursorBitmap = null
  /* Paint the arrow on a 2D context: tip at (x, y) in the context's pixels,
     `scale` from cursorScale(), `pressed` for the mouse held down. The arrow is
     rasterised once at 4× and drawn scaled; the shadow scales with it, as the
     CSS filter does under the overlay's transform (it assumes an identity
     transform on the context — canvas shadows ignore the matrix). */
  function paintCursor(ctx, x, y, { scale = 1, pressed = false, alpha = 1 } = {}) {
    if (!cursorBitmap) {
      const R = 4
      cursorBitmap = document.createElement('canvas')
      cursorBitmap.width = cursorBitmap.height = CURSOR.size * R
      const c = cursorBitmap.getContext('2d')
      c.scale((CURSOR.size * R) / 32, (CURSOR.size * R) / 32)
      const p = new Path2D(CURSOR.path)
      c.lineJoin = 'round'
      c.fillStyle = CURSOR.fill
      c.fill(p)
      c.strokeStyle = CURSOR.stroke
      c.lineWidth = CURSOR.strokeWidth
      c.stroke(p)
    }
    const s = scale * (pressed ? CURSOR.press : 1)
    if (!(alpha > 0) || !(s > 0)) return
    ctx.save()
    ctx.globalAlpha *= alpha
    ctx.shadowColor = CURSOR.shadow.color
    ctx.shadowBlur = CURSOR.shadow.blur * s
    ctx.shadowOffsetX = CURSOR.shadow.x * s
    ctx.shadowOffsetY = CURSOR.shadow.y * s
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(cursorBitmap, x - CURSOR.hotX * s, y - CURSOR.hotY * s, CURSOR.size * s, CURSOR.size * s)
    ctx.restore()
  }
  /* A click's ripple: two rings, the second 0.12 s behind, each growing from 14
     to 84 px over 0.55 s while it fades; a click is live for 0.7 s. `ring` 0|1. */
  const RIPPLE = { live: 0.7, life: 0.55, delay: [0, 0.12], alpha: [1, 0.6], from: 14, grow: 70, border: 3, line: 'rgba(235, 84, 36, 0.9)', fill: 'rgba(235, 84, 36, 0.12)' }
  const rippleRing = (dtc, ring) => {
    const p = clamp((dtc - RIPPLE.delay[ring]) / RIPPLE.life, 0, 1)
    return { p, on: p > 0 && p < 1, size: RIPPLE.from + RIPPLE.grow * easeOut(p), alpha: (1 - p) * RIPPLE.alpha[ring] }
  }

  /* --- overlays -------------------------------------------------------------- */
  const OV = {}
  function ovInit() {
    const root = $('#ov')
    root.innerHTML = `
      <svg id="ov-spot" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <path id="ov-spot-dim" class="ov-spot__dim" fill-rule="evenodd"/>
      </svg>
      <div id="ov-ambient" class="ov-ambient"></div>
      <div id="ov-glow" class="ov-glow"></div>
      <div id="ov-spot-label" class="ov-tag"><span class="ov-tag__dot"></span><span class="ov-tag__t"></span></div>
      <div id="ov-hint" class="ov-hint"></div>
      <div id="ov-hint-ring" class="ov-hint-ring"></div>
      <div id="ov-ripples"></div>
      <div id="ov-callouts"></div>
      <div id="ov-keys" class="ov-keys"></div>
      <svg id="ov-card-veil" class="ov-card-veil" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <path id="ov-card-veil-fill" class="ov-card-veil__fill" fill-rule="evenodd"/>
        <path id="ov-card-veil-line" class="ov-card-veil__line" fill="none"/>
      </svg>
      <div id="ov-partlbl-who" class="ov-partlbl">Who</div>
      <div id="ov-partlbl-if" class="ov-partlbl">If</div>
      <div id="ov-partlbl-then" class="ov-partlbl">Then</div>
      <svg id="ov-anno" class="ov-anno" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <path id="ov-anno-all" class="ov-anno__br ov-anno__br--and" fill="none"/>
        <path id="ov-anno-any" class="ov-anno__br ov-anno__br--or" fill="none"/>
      </svg>
      <div id="ov-anno-and" class="ov-anno__lbl ov-anno__lbl--and"><b>AND</b><span>all of these must hold</span></div>
      <div id="ov-anno-or" class="ov-anno__lbl ov-anno__lbl--or"><b>OR</b><span>any one of these</span></div>
      <div id="ov-truth" class="ov-truth">${window.ANNO ? window.ANNO.truthHtml() : ''}</div>
      <div id="ov-explain" class="ov-explain"></div>
      <div id="ov-cursor" class="ov-cursor">${cursorSvg()}</div>`
    for (const id of ['ov-spot', 'ov-spot-dim', 'ov-ambient', 'ov-glow', 'ov-spot-label', 'ov-hint', 'ov-hint-ring', 'ov-ripples', 'ov-callouts', 'ov-keys', 'ov-cursor', 'ov-card-veil', 'ov-card-veil-fill', 'ov-card-veil-line', 'ov-partlbl-who', 'ov-partlbl-if', 'ov-partlbl-then', 'ov-anno', 'ov-anno-all', 'ov-anno-any', 'ov-anno-and', 'ov-anno-or', 'ov-truth', 'ov-explain'])
      OV[id] = document.getElementById(id)
  }

  /* --- the card's annotation: brackets for AND / OR and a small truth table ---
     Drawn only in card mode while a `cardAnno` is on. The take measured the
     card's parts (`cardParts`: the first condition row, the group, the readout
     block); everything is mapped through the card camera every frame. */
  /* a part may be measured as one rect or, for a part drawn as more than one row, a list */
  const oneRect = (r) => (Array.isArray(r) ? r[0] : r)
  const rectList = (r) => (r ? (Array.isArray(r) ? r : [r]) : [])
  const padRect = (r, p) => ({ x: r.x - p, y: r.y - p, width: r.width + p * 2, height: r.height + p * 2 })
  /* a rounded rectangle as path data, clockwise */
  const roundPath = (r, rad) => {
    const rr = Math.min(rad, r.width / 2, r.height / 2)
    const x1 = r.x + r.width
    const y1 = r.y + r.height
    return `M${r.x + rr},${r.y} H${x1 - rr} A${rr},${rr} 0 0 1 ${x1},${r.y + rr} V${y1 - rr} A${rr},${rr} 0 0 1 ${x1 - rr},${y1} H${r.x + rr} A${rr},${rr} 0 0 1 ${r.x},${y1 - rr} V${r.y + rr} A${rr},${rr} 0 0 1 ${r.x + rr},${r.y} Z`
  }

  function drawAnno(m, card, alpha, t) {
    const kA = card?.annoAnd ?? 0
    const kO = card?.annoOr ?? 0
    const p = card?.parts
    const els = ['ov-anno', 'ov-anno-and', 'ov-anno-or', 'ov-truth'].map((id) => OV[id])
    if (kA <= 0.001 || alpha <= 0 || !p || !p.first || !p.group) {
      for (const el of els) el.style.display = 'none'
      return
    }
    for (const el of els) el.style.display = ''
    const cardR = m.rect(card.rect)
    const first = m.rect(oneRect(p.first))
    const group = m.rect(oneRect(p.group))
    const growA = easeOut(kA)
    const growO = easeOut(kO)
    // the outer bracket: left of the card, from the first condition to the group's foot
    const bx = cardR.x - 26
    const by0 = first.y - 4
    const by1 = group.y + group.height + 4
    const hook = 14
    const mid = (by0 + by1) / 2
    const h0 = lerp(mid, by0, growA)
    const h1 = lerp(mid, by1, growA)
    const all = OV['ov-anno-all']
    all.setAttribute('d', `M${bx + hook},${h0} H${bx} V${h1} H${bx + hook}`)
    all.style.opacity = String(kA * alpha)
    // the inner bracket: right of the group, inside the card's padding — the second stage
    const gx = group.x + group.width + 10
    const gmid = group.y + group.height / 2
    const gy0 = lerp(gmid, group.y + 2, growO)
    const gy1 = lerp(gmid, group.y + group.height - 2, growO)
    const any = OV['ov-anno-any']
    any.setAttribute('d', `M${gx - hook},${gy0} H${gx} V${gy1} H${gx - hook}`)
    any.style.opacity = String(kO * alpha)
    any.style.display = kO > 0.001 ? '' : 'none'
    OV['ov-anno'].style.opacity = '1'
    // labels beside their brackets
    const andL = OV['ov-anno-and']
    andL.style.opacity = String(kA * alpha)
    andL.style.transform = `translate(${bx - 22}px, ${mid}px) translate(-100%, -50%) translate(${(1 - growA) * -12}px, 0)`
    const orL = OV['ov-anno-or']
    orL.style.display = kO > 0.001 ? '' : 'none'
    orL.style.opacity = String(kO * alpha)
    orL.style.transform = `translate(${cardR.x + cardR.width + 22}px, ${gmid}px) translate(0, -50%) translate(${(1 - growO) * 12}px, 0)`
    // the truth panel, in the free column to the right of the card
    const tr = OV['ov-truth']
    tr.style.opacity = String(easeInOut(clamp((kA - 0.25) / 0.75, 0, 1)) * alpha)
    tr.style.transform = `translate(${cardR.x + cardR.width + 22}px, ${cardR.y + 6}px) translate(0, ${(1 - growA) * 18}px)`
    /* inside the panel: the OR half of the expression waits for its stage; rows
       light as the narrator reaches them, and the parenthesised group takes a
       lit row's result tint for 0.6 s so expression and table move together */
    const grp = tr.querySelector('.ov-truth__group')
    if (grp) grp.style.opacity = String(lerp(0.45, 1, kO))
    const th = card.truth ?? { rows: 4, at: [] }
    let tint = null
    for (const row of tr.querySelectorAll('tr[data-row]')) {
      const i = Number(row.dataset.row)
      const lit = i <= th.rows
      const at = th.at[i - 1] ?? -1e9
      const k = lit ? OUT_P(clamp((t - at) / 0.3, 0, 1)) : 0
      row.style.opacity = String(lerp(0.28, 1, k))
      row.classList.toggle('is-lit', lit)
      if (lit && t - at < 0.6 && (!tint || at > tint.at)) tint = { at, neg: row.querySelector('td.is-false') !== null }
    }
    if (grp) {
      const e = tint ? envelope(t, tint.at, tint.at + 0.6, 0.08, 0.2) * 0.5 : 0
      grp.style.backgroundColor = e > 0.001 ? (tint.neg ? `rgba(253,240,242,${e.toFixed(3)})` : `rgba(232,247,238,${e.toFixed(3)})`) : 'transparent'
      grp.style.boxShadow = e > 0.001 ? `0 0 0 1px ${tint.neg ? `rgba(245,198,206,${e.toFixed(3)})` : `rgba(182,227,198,${e.toFixed(3)})`}` : 'none'
    }
  }

  /* --- card lighting: a veil over the card with holes for the part being read, and
     the part's label beside it (§4.3). Off while the annotation is up. */
  const PART_LABEL = { who: 'who', cond: 'if', group: 'if', then: 'then' }
  function drawCardLight(m, card, alpha, t) {
    const veil = OV['ov-card-veil']
    const lbls = { who: OV['ov-partlbl-who'], if: OV['ov-partlbl-if'], then: OV['ov-partlbl-then'] }
    const L = card?.light
    const p = card?.parts
    const on = card && card.blend > 0.5 && (card.annoAnd ?? 0) <= 0.05 && L && p && alpha > 0
    if (!on) {
      veil.style.display = 'none'
      for (const el of Object.values(lbls)) el.style.display = 'none'
      return
    }
    const u = m.s / WIN.s0 // one app px at rest, at this zoom
    const k = easeInOut(L.k)
    const screenRects = (name) => rectList(p[name]).map((r) => padRect(m.rect(r), 6 * u))
    const holes = L.part === 'parts' || L.part === null ? [] : screenRects(L.part)
    if (holes.length) {
      const cardR = m.rect(card.rect)
      const holeD = holes.map((h) => roundPath(h, 8 * u)).join(' ')
      OV['ov-card-veil-fill'].setAttribute('d', `${roundPath(cardR, 12 * m.s)} ${holeD}`)
      OV['ov-card-veil-line'].setAttribute('d', holeD)
      veil.style.display = ''
      veil.style.opacity = String(k * alpha)
    } else veil.style.display = 'none'
    // labels: one beside the lit part, or all three beside their rows in 'parts' mode
    let anchors = {}
    if (L.part === 'parts') anchors = { who: screenRects('who')[0], if: screenRects('cond')[0], then: screenRects('then')[0] }
    else if (PART_LABEL[L.part]) anchors = { [PART_LABEL[L.part]]: holes[0] }
    let i = 0
    for (const name of ['who', 'if', 'then']) {
      const el = lbls[name]
      const a = anchors[name]
      if (!a) {
        el.style.display = 'none'
        continue
      }
      const idx = L.part === 'parts' ? i++ : 0
      const kin = OUT_B(clamp((L.since - 0.15 * idx) / 0.3, 0, 1))
      el.style.display = ''
      el.style.opacity = String(Math.min(k, kin) * alpha)
      el.style.transform = `translate(${a.x - 22}px, ${a.y + a.height / 2}px) translate(-100%, -50%) translateY(${(1 - kin) * 10}px)`
    }
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

    // cursor — hidden while the mascot is doing the clicking
    const fr = take.frames[clamp(f, 0, take.frames.length - 1)]
    const cp = m.pt(fr[1], fr[2])
    const cur = OV['ov-cursor']
    const pressed = fr[3] ? 1 : 0
    const cs = Math.sqrt(cam.z) * xf.s * (pressed ? 0.86 : 1)
    let mascotBusy = 0
    for (const e of ev) {
      if (e.type !== 'click' || e.by !== 'mascot') continue
      const dtc = t - e.f / fps
      if (dtc > -0.75 && dtc < 0.6) mascotBusy = 1
    }
    cur.style.transform = `translate(${cp.x - 7 * cs}px, ${cp.y - 3.5 * cs}px) scale(${cs})`
    // in card mode the work happens off the picture: no cursor, no click cues
    const uiHidden = look.card && look.card.blend > 0.5
    drawAnno(m, look.card, alpha, t)
    drawCardLight(m, look.card, alpha, t)
    cur.style.opacity = String(alpha * (take.hideCursor || uiHidden ? 0 : 1) * (mascotBusy ? 0 : 1))

    /* the explainer inset: the latest `explain` live at t, built once per id and
       kept in screen space beside the shelved product (§5.3); the inside is the
       module's own, driven by seconds since the entrance */
    let xp = null
    for (const e of ev) {
      if (e.type !== 'explain') continue
      const a = e.f / fps
      if (t >= a && t <= a + (e.dur ?? 2.5) + 0.24) xp = { e, a, b: a + (e.dur ?? 2.5) }
    }
    const xe = OV['ov-explain']
    const def = xp && window.EXPLAIN ? window.EXPLAIN[xp.e.id] : null
    if (xp && def && alpha > 0) {
      xe.style.display = ''
      if (xe.dataset.id !== xp.e.id) {
        def.build(xe)
        xe.dataset.id = xp.e.id
      }
      const kIn = DEC(clamp((t - xp.a) / 0.36, 0, 1))
      const kOut = EXIT_C(clamp((t - xp.b) / 0.24, 0, 1))
      const kEnv = Math.min(kIn, 1 - kOut)
      const x = xp.e.side === 'right' ? 1395 : 105
      xe.style.transform = `translate(${x}px, ${(409 + (1 - kIn) * 16 + kOut * 8).toFixed(2)}px)`
      xe.style.opacity = String(kEnv * alpha)
      def.update(xe, kEnv, t - xp.a)
    } else {
      if (xp && !def && !xe.dataset.warned) {
        console.warn(`no explainer module for "${xp.e.id}"`)
        xe.dataset.warned = '1'
      }
      xe.style.display = 'none'
    }

    /* click cues: the target outline and a pulse before, ripples after. No
       label pill — the cursor (or the orange) says where, the result says what. */
    let hint = null
    const ripples = []
    for (const e of ev) {
      if (e.type !== 'click') continue
      const dtc = (f - e.f) / fps
      if (e.hint !== false && dtc > -0.55 && dtc < 0.25) hint = { e, dtc }
      if (dtc >= 0 && dtc < RIPPLE.live) ripples.push({ e, dtc })
    }
    if (hint && hint.e.rect && alpha > 0 && !uiHidden) {
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
        display: hint.dtc < 0 && hint.e.by !== 'mascot' ? '' : 'none',
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
      if (!rip || alpha === 0 || uiHidden) return (el.style.display = 'none')
      const ring = rippleRing(rip.dtc, i % 2)
      const pt = m.pt(rip.e.x, rip.e.y)
      const size = ring.size
      Object.assign(el.style, {
        display: ring.on ? '' : 'none',
        left: `${pt.x - size / 2}px`,
        top: `${pt.y - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        opacity: String(ring.alpha * alpha),
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
      OV['ov-spot-dim'].setAttribute('d', `M0,0 H${W} V${WIN.ay + WIN.ah + 1} H0 Z ${hole}`)
      OV['ov-spot'].style.display = ''
      OV['ov-spot'].style.opacity = String(spot.k * alpha)
      // the frame: a 2 px ink hairline around the hole, nothing that turns or glows
      const bw = 2
      Object.assign(OV['ov-glow'].style, {
        display: '',
        left: `${r.x - bw}px`,
        top: `${r.y - bw}px`,
        width: `${r.width + bw * 2}px`,
        height: `${r.height + bw * 2}px`,
        borderRadius: `${rad + bw}px`,
        opacity: String(spot.k * alpha),
      })
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
      OV['ov-glow'].style.display = 'none'
      OV['ov-spot-label'].style.display = 'none'
    }

    /* shortcut keycaps: only chords and named keys, never plain typing */
    const kev = ev.filter((e) => e.type === 'key' && isShortcut(e.key) && t >= e.f / fps - 0.05 && t <= e.f / fps + (e.dur ?? 1.1) + 0.3)
    const kb = OV['ov-keys']
    const k0 = kev[kev.length - 1]
    if (k0 && alpha > 0) {
      const a = k0.f / fps
      const k = envelope(t, a - 0.05, a + (k0.dur ?? 1.1) + 0.3, 0.15, 0.3)
      const html = keyCaps(k0.key, k0.label, clamp((t - a) / 0.18, 0, 1))
      if (kb.dataset.html !== html) {
        kb.innerHTML = html
        kb.dataset.html = html
      }
      kb.style.display = ''
      kb.style.opacity = String(k * alpha)
      kb.style.transform = `translate(-50%, ${(easeOut(k) - 1) * 14}px)`
    } else kb.style.display = 'none'

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
      const L = 44 * easeOut(k)
      const d =
        side === 'top' ? `M60,70 L60,${70 + L}` : side === 'bottom' ? `M60,50 L60,${50 - L}` : side === 'left' ? `M70,60 L${70 + L},60` : `M50,60 L${50 - L},60`
      path.setAttribute('d', d)
    })
  }

  function hideOverlays() {
    show(OV['ov-hint'], false)
    show(OV['ov-hint-ring'], false)
    OV['ov-spot'].style.display = 'none'
    OV['ov-glow'].style.display = 'none'
    OV['ov-spot-label'].style.display = 'none'
    OV['ov-keys'].style.display = 'none'
    for (const id of ['ov-anno', 'ov-anno-and', 'ov-anno-or', 'ov-truth', 'ov-card-veil', 'ov-partlbl-who', 'ov-partlbl-if', 'ov-partlbl-then', 'ov-explain']) OV[id].style.display = 'none'
    OV['ov-cursor'].style.opacity = '0'
    ;[...OV['ov-ripples'].children, ...OV['ov-callouts'].children].forEach((el) => (el.style.display = 'none'))
  }

  const isShortcut = (key) => typeof key === 'string' && (key.includes('+') || key.length > 1 || key === '?')
  function keyCaps(combo, label, press) {
    const nice = { Control: 'Ctrl', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backslash: '\\', Delete: 'Del', Escape: 'Esc', Enter: 'Enter', Shift: 'Shift', Alt: 'Alt', Backspace: '⌫' }
    const parts = combo === '?' ? ['?'] : combo.split('+').map((p) => nice[p] ?? (p.length === 1 ? p.toUpperCase() : p))
    const caps = parts
      .map((p, i) => `${i ? '<span class="ov-keys__plus">+</span>' : ''}<kbd class="${press > 0 && press < 1 ? 'is-down' : ''}">${escapeHtml(p)}</kbd>`)
      .join('')
    return `<div class="ov-keys__caps">${caps}</div>${label ? `<div class="ov-keys__label">${escapeHtml(label)}</div>` : ''}`
  }

  /* --- the mascot ----------------------------------------------------------------

     In a take the mascot's keys come from `mascot` events, anchored to rects in
     app pixels; each frame those anchors are mapped through the current camera,
     so the orange stays glued to the panel it stands beside while the camera
     moves. On a slide the keys come from the slide itself, in screen pixels. */
  const RIG_RATIO = 673 / 1219 // width / height of the art

  function feetFor(k) {
    const a = k.anchor
    const h = k.size
    const w = h * RIG_RATIO
    const cx = a.x + a.width / 2
    switch (k.place) {
      case 'left':
        return { x: a.x - w * 0.62, y: a.y + a.height }
      case 'right':
        return { x: a.x + a.width + w * 0.62, y: a.y + a.height }
      case 'above':
      case 'on':
        return { x: cx, y: a.y }
      case 'below':
        return { x: cx, y: a.y + a.height + h }
      case 'inside-bl':
        return { x: a.x + w * 0.62, y: a.y + a.height - 10 }
      case 'inside-tl':
        return { x: a.x + w * 0.62, y: a.y + h + 10 }
      case 'inside-tr':
        return { x: a.x + a.width - w * 0.62, y: a.y + h + 10 }
      case 'centre':
        return { x: cx, y: a.y + a.height / 2 + h / 2 }
      case 'inside-br':
      default:
        return { x: a.x + a.width - w * 0.62, y: a.y + a.height - 10 }
    }
  }

  function takeMascotKeys(takeId) {
    if (state.mascotKeys[takeId]) return state.mascotKeys[takeId]
    const take = state.takes[takeId]
    const keys = []
    const emotes = []
    const screens = []
    for (const e of take.events) {
      if (e.type === 'mascot') {
        const feet = feetFor(e)
        keys.push({ f: e.f, pose: e.pose, ax: feet.x, ay: feet.y, size: e.size ?? 300, face: e.face ?? null, seconds: e.seconds ?? 0.6, emote: e.emote ?? null, screen: e.screen, toward: e.toward ? { x: e.toward.x + e.toward.width / 2, y: e.toward.y + e.toward.height / 2 } : null })
        if (e.emote) emotes.push({ f: e.f, glyph: e.emote })
        if (e.screen !== undefined) screens.push({ f: e.f, screen: e.screen })
      }
      if (e.type === 'emote') emotes.push({ f: e.f, glyph: e.glyph })
      if (e.type === 'screen') screens.push({ f: e.f, screen: e.screen })
    }
    state.mascotKeys[takeId] = { keys, emotes, screens }
    return state.mascotKeys[takeId]
  }

  /* The keys of the live take, in screen space at this frame. */
  function mascotFromTake(item, take, f, cam, xf) {
    const fps = take.fps
    const src = takeMascotKeys(item.take)
    if (!src.keys.length) return null
    const m = mapper(cam, xf)
    const keys = src.keys.map((k) => {
      const p = m.pt(k.ax, k.ay)
      const tw = k.toward ? m.pt(k.toward.x, k.toward.y) : null
      return { t: item.start + k.f / fps, pose: k.pose, x: p.x, y: p.y, size: k.size * m.s, face: k.face, seconds: k.seconds, toward: tw }
    })
    const emotes = src.emotes.map((e) => ({ t: item.start + e.f / fps, glyph: e.glyph }))
    const screens = src.screens.map((e) => ({ t: item.start + e.f / fps, screen: e.screen }))
    return { keys, emotes, screens }
  }

  function mascotFromSlide(item, tx = 0) {
    const def = slideDef(item)
    if (!def?.mascotKeys) return null
    // the slide's mascot rides the slide: while it is pushed, so is the orange
    const keys = (def.mascotKeys(item.end - item.start, item.params ?? {}) ?? []).map((k) => ({ ...k, t: item.start + k.t, x: k.x + tx, toward: k.toward ? { x: k.toward.x + tx, y: k.toward.y } : k.toward }))
    if (!keys.length) return null
    const emotes = keys.filter((k) => k.emote).map((k) => ({ t: k.t, glyph: k.emote }))
    const screens = keys.filter((k) => k.screen !== undefined).map((k) => ({ t: k.t, screen: k.screen }))
    return { keys, emotes, screens }
  }

  /* The current spoken line, and how open the mouth is right now. */
  function talkAt(t) {
    const cap = liveCaption(t)
    if (!cap || !cap.env) return { cap, open: 0, onsets: [] }
    const i = Math.floor((t - cap.start) * 30)
    const env = cap.env
    const e = (k) => (k >= 0 && k < env.length ? env[k] : 0)
    const open = clamp(Math.max(e(i) * 0.9, e(i - 1) * 0.7, e(i - 2) * 0.45), 0, 1)
    return { cap, open, onsets: cap.words ? cap.words.map((w) => w.t) : [] }
  }

  function liveCaption(t) {
    let cur = null
    for (const c of state.edl.captions) if (t >= c.start && t < c.end) cur = c
    return cur
  }

  /* The orange was cut from the film (12 Sep, evening): the character drew the
     eye from the product. Its plumbing stays so a future cut can bring it
     back, but MASCOT_ON keeps every frame free of it. */
  const MASCOT_ON = false
  let mascotState = null
  function drawMascot(t, source) {
    const el = $('#mascot')
    if (!MASCOT_ON || !source || !window.MASCOT || !state.rig) {
      el.style.display = 'none'
      mascotState = null
      return null
    }
    const first = source.keys[0]
    if (t < first.t - 0.01) {
      el.style.display = 'none'
      mascotState = null
      return null
    }
    const talk = talkAt(t)
    let screen = null
    for (const s of source.screens) if (t >= s.t) screen = s.screen
    let emote = null
    for (const e of source.emotes) if (t >= e.t && t < e.t + 1.3) emote = { glyph: e.glyph, k: (t - e.t) / 1.3 }
    const st = window.MASCOT.stateAt(t, source.keys, { talkOpen: talk.open, wordOnsets: talk.onsets, seed: 7, screen, emote })
    if (!st || st.hidden) {
      el.style.display = 'none'
      mascotState = null
      return null
    }
    el.style.display = ''
    window.MASCOT.render(st)
    mascotState = st
    return st
  }

  /* --- the thought cloud -------------------------------------------------------------- */
  let cloudText = null
  function drawCloud(t, st) {
    const cap = liveCaption(t)
    const cloud = $('#cloud')
    const cap0 = $('#cap')
    if (!cap) {
      cloud.style.opacity = '0'
      cap0.style.opacity = '0'
      return
    }
    // words, revealed as spoken — one page of them at a time (captionPages)
    const pages = capPages(cap)
    let pi = 0
    for (let k = 1; k < pages.length; k++) if (t >= pages[k].t) pi = k
    const page = pages[pi]
    const key = `${cap.id ?? cap.text}#${pi}`
    const target = st ? cloud : cap0
    const other = st ? cap0 : cloud
    other.style.opacity = '0'
    const tEl = target.querySelector('.cloud__t, .cap__t')
    if (target.dataset.key !== key) {
      const toks = cap._toks ? cap._toks.slice(page.from, page.to) : null
      tEl.innerHTML = toks
        ? toks.map((w) => `<span class="w">${escapeHtml(w.text)}</span>`).join(' ')
        : `<span class="w is-on">${escapeHtml(page.text)}</span>`
      target.dataset.key = key
      target._toks = toks
      if (!st) fitCaptionRow(cap0)
    }
    const toks = target._toks
    if (toks) {
      const spans = tEl.children
      toks.forEach((w, i) => {
        const s = spans[i]
        if (!s) return
        const said = t >= w.t
        const now = said && t < w.t + Math.max(0.18, w.dur)
        s.classList.toggle('is-on', said)
        s.classList.toggle('is-now', now)
      })
    }
    const k = envelope(t, cap.start, cap.end, 0.28, 0.22)
    if (!st) {
      // the caption band under the window: the words, nothing else, always centred
      cap0.style.opacity = String(k)
      const dy = (1 - easeOut(clamp((t - cap.start) / 0.3, 0, 1))) * 8
      cap0.style.transform = `translate(-50%, ${dy}px)`
      return
    }
    /* Attach to the head, on the roomier side — but never over the thing being
       explained: a caption may carry an `avoid` rect (app px, mapped through
       the camera) or `avoidScreen` (a slide's own frame px). Candidates are
       tried in order of preference; the first that clears the rect wins. */
    const head = window.MASCOT.headPoint(st)
    const body = cloud.querySelector('.cloud__body')
    const size = st.size ?? 300
    const left = head.x > W * 0.5
    const avoid = cap.avoidScreen ?? (cap.avoid && state.lastMapper ? state.lastMapper.rect(cap.avoid) : null)
    // a narrower cloud fits the free column beside a board or a dialog
    let maxW = 640
    if (avoid) {
      const freeRight = W - 24 - (avoid.x + avoid.width + 16)
      const freeLeft = avoid.x - 16 - 24
      const col = head.x > avoid.x + avoid.width ? freeRight : head.x < avoid.x ? freeLeft : Math.max(freeRight, freeLeft)
      if (col >= 380) maxW = Math.min(640, col - 12)
    }
    if (body.dataset.maxw !== String(maxW)) {
      body.style.maxWidth = `${maxW}px`
      body.dataset.maxw = String(maxW)
    }
    const cw = body.offsetWidth
    const chh = body.offsetHeight
    const inFrame = (c) => ({ x: clamp(c.x, 24, W - cw - 24), y: clamp(c.y, 24, H - chh - 24) })
    const hits = (c) => {
      if (!avoid) return false
      const pad = 16
      return c.x < avoid.x + avoid.width + pad && c.x + cw > avoid.x - pad && c.y < avoid.y + avoid.height + pad && c.y + chh > avoid.y - pad
    }
    const cands = [
      { x: left ? head.x - size * 0.42 - cw : head.x + size * 0.42, y: head.y - size * 0.32 - chh },
      { x: left ? head.x + size * 0.42 : head.x - size * 0.42 - cw, y: head.y - size * 0.32 - chh },
      { x: left ? head.x - size * 0.45 - cw : head.x + size * 0.45, y: head.y - chh / 2 },
      { x: left ? head.x + size * 0.2 - cw : head.x - size * 0.2, y: head.y - size * 0.5 - chh },
      { x: head.x - cw / 2, y: 24 },
      { x: left ? head.x - size * 0.5 - cw : head.x + size * 0.5, y: head.y + size * 0.1 },
    ].map(inFrame)
    let pick = cands.find((c) => !hits(c))
    if (!pick) {
      // nothing clears it: take the candidate that overlaps least
      pick = cands
        .map((c) => {
          const ox = Math.max(0, Math.min(c.x + cw, avoid.x + avoid.width) - Math.max(c.x, avoid.x))
          const oy = Math.max(0, Math.min(c.y + chh, avoid.y + avoid.height) - Math.max(c.y, avoid.y))
          return { c, a: ox * oy }
        })
        .sort((p, q) => p.a - q.a)[0].c
    }
    const x = pick.x
    const y = pick.y
    const pop = easeOutBack(clamp((t - cap.start) / 0.32, 0, 1))
    const shrink = 1 - (1 - clamp((cap.end - t) / 0.22, 0, 1)) * 0.3
    cloud.style.opacity = String(Math.min(1, k * 1.6))
    cloud.style.transform = `translate(${x}px, ${y}px)`
    body.style.transform = `scale(${lerp(0.6, 1, pop) * shrink})`
    body.style.transformOrigin = left ? '100% 100%' : '0% 100%'
    // the trail: two bubbles from the cloud's near-bottom corner toward the head
    const cx = left ? x + cw - 18 : x + 18
    const cy = y + chh - 4
    const b1 = cloud.querySelector('.cloud__b1')
    const b2 = cloud.querySelector('.cloud__b2')
    const ax = head.x + (left ? size * 0.16 : -size * 0.16)
    const ay = head.y - size * 0.16
    const p1 = { x: lerp(cx, ax, 0.38), y: lerp(cy, ay, 0.38) }
    const p2 = { x: lerp(cx, ax, 0.72), y: lerp(cy, ay, 0.72) }
    b1.style.transform = `translate(${p1.x - x - 11}px, ${p1.y - y - 11}px) scale(${pop})`
    b2.style.transform = `translate(${p2.x - x - 6}px, ${p2.y - y - 6}px) scale(${pop})`
  }

  /* --- caption pages -----------------------------------------------------------
     The band holds one row. A line longer than PAGE_MAX characters is shown a
     page at a time: split at every sentence end, then any piece still too long
     at an em dash, a semicolon or a comma (in that order of preference, the one
     nearest the piece's middle that leaves both halves short enough), and as a
     last resort at the space nearest the middle. Each page is on screen from its
     first word until the next page's first word; with no word timings the pages
     share the line's time by their length. The punctuation stays on the page it
     ends, so "first —" closes one page and "it catches" opens the next. */
  const PAGE_MAX = 95
  function captionPages(text, words) {
    const toks = String(text).split(/\s+/).filter(Boolean)
    const len = (a, b) => toks.slice(a, b).join(' ').length
    const cutsWhere = (a, b, test) => {
      const out = []
      for (let c = a + 1; c < b; c++) if (test(toks[c - 1], toks[c])) out.push(c)
      return out
    }
    const split = (a, b) => {
      if (b - a < 2 || len(a, b) <= PAGE_MAX) return [[a, b]]
      const sentences = cutsWhere(a, b, (x) => /[.?!…]$/.test(x))
      if (sentences.length) {
        const out = []
        let from = a
        for (const c of [...sentences, b]) {
          out.push(...split(from, c))
          from = c
        }
        return out
      }
      const whole = len(a, b)
      const nearMiddle = (cs) => cs.map((c) => ({ c, d: Math.abs(len(a, c) - whole / 2) })).sort((p, q) => p.d - q.d)
      const kinds = [(x) => x === '—' || /—$/.test(x), (x) => /;$/.test(x), (x) => /,$/.test(x)]
      // any of the three marks, nearest the middle first, as long as both halves fit one row
      const fit = nearMiddle(cutsWhere(a, b, (x) => kinds.some((k) => k(x)))).find(({ c }) => len(a, c) <= PAGE_MAX && len(c, b) <= PAGE_MAX)
      if (fit) return [[a, fit.c], [fit.c, b]]
      // nothing leaves two short halves: the nearest mark of any kind, else the nearest space
      const any = nearMiddle(cutsWhere(a, b, (x) => kinds.some((k) => k(x))))
      const c = any.length ? any[0].c : nearMiddle(cutsWhere(a, b, () => true))[0].c
      return [...split(a, c), ...split(c, b)]
    }
    const ranges = toks.length ? split(0, toks.length) : [[0, 0]]
    const timed = words && words.length ? alignWords(text, words) : null
    const total = Math.max(1, len(0, toks.length))
    return ranges.map(([from, to]) => ({
      from,
      to,
      text: toks.slice(from, to).join(' '),
      // seconds for word timings; otherwise the share of the line's length before it (0..1)
      t: timed ? timed[from]?.t ?? -Infinity : from === 0 ? 0 : (len(0, from) + 1) / total,
      share: !timed,
    }))
  }
  /* A caption's pages and aligned words, worked out once per caption. */
  function capPages(cap) {
    if (!cap._pages) {
      cap._toks = cap.words ? alignWords(cap.text, cap.words) : null
      const pages = captionPages(cap.text, cap.words)
      const span = Math.max(0.1, cap.end - cap.start - 0.3)
      cap._pages = pages.map((p, i) => ({ ...p, t: i === 0 ? -Infinity : p.share ? cap.start + p.t * span : p.t }))
    }
    return cap._pages
  }
  /* The band's pill stays one row: no wrapping, and a page too wide for the frame
     (none of the film's lines is, at 29 px) is set smaller rather than broken. */
  function fitCaptionRow(el) {
    el.style.whiteSpace = 'nowrap'
    el.style.maxWidth = 'none'
    el.style.fontSize = ''
    const room = W - 96
    const w = el.offsetWidth
    if (w > room) el.style.fontSize = `${((29 * room) / w).toFixed(2)}px`
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  /* The cloud shows the line AS WRITTEN — punctuation and all — timed by the
     service's word boundaries, which arrive stripped of punctuation and may
     merge or split a token. Written tokens are walked against spoken words
     by their letters; a written token swallows as many spoken words as it
     contains, and never fewer than one. */
  const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  function alignWords(text, words) {
    const toks = String(text).split(/\s+/).filter(Boolean)
    if (!words.length) return toks.map((tx) => ({ text: tx, t: -Infinity, dur: 0 }))
    const out = []
    let j = 0
    for (let i = 0; i < toks.length; i++) {
      const target = norm(toks[i])
      const start = Math.min(j, words.length - 1)
      let acc = ''
      let k = start
      // swallow spoken words while the written token still has letters to cover
      while (k < words.length && (acc.length === 0 || (target.startsWith(acc) && acc.length < target.length))) {
        acc += norm(words[k].text)
        k++
        if (acc === target) break
        if (!target.startsWith(acc)) break
      }
      const first = words[start]
      const last = words[Math.max(start, k - 1)]
      out.push({ text: toks[i], t: first.t, dur: Math.max(0.12, last.t + last.dur - first.t) })
      // advance, but leave at least one spoken word for every written token still to come
      const remaining = toks.length - 1 - i
      j = Math.min(Math.max(k, start + 1), Math.max(start + 1, words.length - remaining))
    }
    return out
  }

  /* --- the keyboard ------------------------------------------------------------------- */
  /* The full on-screen keyboard was cut (12 Sep, evening): only shortcut
     keycaps are shown now, drawn in drawOverlays. */
  function drawKeyboard() {}

  /* --- slides ---------------------------------------------------------------- */
  function slideDef(item) {
    const name = item.slide
    return (window.SLIDES3 && window.SLIDES3[name]) || (window.SLIDES2 && window.SLIDES2[name]) || (window.SLIDES && window.SLIDES[name]) || null
  }

  /* Slides may borrow the product's own pictures — the intro shows the real
     console on a device. `frameUrl(take, which)` gives a frame's image URL;
     `takeEvents(take)` the recorded events (for the rects things sat in). */
  function frameUrl(takeName, which = 'last') {
    const take = state.takes[takeName]
    if (!take) return null
    const i = which === 'first' ? 0 : which === 'last' ? take.frames.length - 1 : clamp(Math.round(which), 0, take.frames.length - 1)
    return `${state.edl.imgBase}/${take.frames[i][0]}.jpg`
  }
  const takeEvents = (takeName) => state.takes[takeName]?.events ?? []
  const takeFrames = (takeName) => state.takes[takeName]?.frames.length ?? 0
  /* A take a slide plays as footage (the edl loads every take a slide names in
     `dockTake` / `sourceTake`, played in the film or not). Its fps is the edit's,
     `view` its viewport in app px. */
  const takeInfo = (takeName) => {
    const take = state.takes[takeName]
    return take ? { fps: take.fps, frames: take.frames.length, view: take.view ?? { width: APP.w, height: APP.h }, dsf: take.dsf ?? 1 } : null
  }
  /* The recorded frame that shows at frame `f` of a take: one entry per recorded
     frame (identical pictures share one image file, not one entry), so this is
     `f` itself, floored and held at the ends — the index frameUrl, cursorAt and
     picture take. Null for a take that is not loaded. */
  const frameAt = (takeName, f) => {
    const n = state.takes[takeName]?.frames.length ?? 0
    return n ? clamp(Math.floor(Number(f) || 0), 0, n - 1) : null
  }
  /* Where the take's cursor is at frame `f`, in app px, and whether the mouse is
     held — the numbers the overlay draws its arrow from. Null when the take is
     not loaded or hides its cursor. */
  const cursorAt = (takeName, f) => {
    const take = state.takes[takeName]
    const i = frameAt(takeName, f)
    if (!take || i === null || take.hideCursor) return null
    const fr = take.frames[i]
    return { x: fr[1], y: fr[2], pressed: !!fr[3] }
  }
  /* The clicks whose ripples are live at frame `f`: position in app px and the
     two rings (size in screen px at scale 1, alpha 0..1), as the overlay draws them. */
  function ripplesAt(takeName, f) {
    const take = state.takes[takeName]
    if (!take) return []
    const out = []
    for (const e of take.events) {
      if (e.type !== 'click') continue
      const dtc = (f - e.f) / take.fps
      if (dtc < 0 || dtc >= RIPPLE.live) continue
      out.push({ x: e.x, y: e.y, dtc, rings: [rippleRing(dtc, 0), rippleRing(dtc, 1)].filter((r) => r.on) })
    }
    return out
  }
  /* Paint those ripples on a 2D context: `toCtx(x, y)` maps app px to the
     context's pixels, `scale` sizes the rings (1 = the overlay's), `clip` an
     optional app-px rect a click must fall inside (a cropped picture's own). */
  function paintRipples(ctx, takeName, f, toCtx, { scale = 1, alpha = 1, clip = null } = {}) {
    for (const r of ripplesAt(takeName, f)) {
      if (clip && (r.x < clip.x || r.y < clip.y || r.x > clip.x + clip.width || r.y > clip.y + clip.height)) continue
      const c = toCtx(r.x, r.y)
      for (const ring of r.rings) {
        const rad = (ring.size * scale) / 2
        const bw = RIPPLE.border * scale
        const a = ring.alpha * alpha
        if (!(a > 0) || rad <= 0) continue
        ctx.save()
        ctx.globalAlpha *= a
        ctx.beginPath()
        ctx.arc(c.x, c.y, Math.max(0, rad - bw), 0, Math.PI * 2)
        ctx.fillStyle = RIPPLE.fill
        ctx.fill()
        ctx.beginPath()
        ctx.arc(c.x, c.y, Math.max(0, rad - bw / 2), 0, Math.PI * 2)
        ctx.lineWidth = bw
        ctx.strokeStyle = RIPPLE.line
        ctx.stroke()
        ctx.restore()
      }
    }
  }
  /* The cursor as the overlay builds it, for a slide that draws it in the DOM:
     the markup (give its wrapper the class `.ov-cursor` for the same shadow and
     origin), the sprite's size, hot spot and press scale, and `transform(x, y,
     scale, pressed)` — the overlay's own placement of the tip at (x, y). */
  const cursorSprite = () => ({
    svg: cursorSvg(),
    className: 'ov-cursor',
    size: CURSOR.size,
    hotX: CURSOR.hotX,
    hotY: CURSOR.hotY,
    press: CURSOR.press,
    shadow: { ...CURSOR.shadow },
    transform: (x, y, scale = 1, pressed = false) => {
      const s = scale * (pressed ? CURSOR.press : 1)
      return `translate(${x - CURSOR.hotX * s}px, ${y - CURSOR.hotY * s}px) scale(${s})`
    },
  })

  /* --- pictures a slide keeps decoded for the whole render ---------------------
     A slide that plays footage (the bento's stage and strip) cannot wait for a
     picture mid-frame, so it decodes every picture it will show up front, from
     its `preload(item, edl)`, which init awaits before any frame renders. A take
     films one image per change, not per frame, so a range of hundreds of frames
     is usually far fewer files; they load a few at a time so four render workers
     do not queue hundreds of requests each, and a failed load is retried once
     before it fails the render. `picture(take, f)` is then synchronous. */
  const PRELOAD_AT_ONCE = 6
  function loadPinned(id) {
    const url = `${state.edl.imgBase}/${id}.jpg`
    const once = () => {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      return img.decode().then(() => img)
    }
    return once().catch(() => once()).catch((err) => {
      throw new Error(`could not decode ${url}: ${err}`)
    })
  }
  async function preloadFrames(takeName, from = 0, to = Infinity) {
    const take = state.takes[takeName]
    if (!take || !take.frames.length) return 0
    const a = clamp(Math.floor(from), 0, take.frames.length - 1)
    const b = clamp(Math.floor(to), a, take.frames.length - 1)
    const ids = [...new Set(take.frames.slice(a, b + 1).map((fr) => fr[0]))].filter((id) => !state.pinned.has(id))
    let next = 0
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++]
        state.pinned.set(id, await loadPinned(id))
      }
    }
    await Promise.all(Array.from({ length: Math.min(PRELOAD_AT_ONCE, ids.length) }, worker))
    return ids.length
  }
  /* The decoded picture at frame `f` of a take, or null if it was not preloaded. */
  const picture = (takeName, f) => {
    const i = frameAt(takeName, f)
    return i === null ? null : state.pinned.get(state.takes[takeName].frames[i][0]) ?? null
  }

  function slideEl(item) {
    const key = item.id
    if (state.slideEls[key]) return state.slideEls[key]
    const def = slideDef(item)
    const el = document.createElement('section')
    el.className = `slide slide--${item.slide}`
    el.dataset.slide = key
    el.style.display = 'none'
    $('#slides').appendChild(el)
    /* A slide whose module is not loaded draws nothing — the edit can be
       previewed while a slide is still being written — and says so once. */
    if (def) def.build(el, item.params ?? {}, state.edl)
    else console.warn(`no slide module for "${item.slide}" (${key}); drawn as bare ground`)
    state.slideEls[key] = el
    return el
  }

  function driveSlide(item, el, local) {
    const def = slideDef(item)
    for (const a of el.getAnimations({ subtree: true })) {
      a.pause()
      a.currentTime = Math.max(0, local * 1000)
    }
    // an update may return a promise (a picture it had to wait for); the frame waits with it
    return def?.update?.(el, local, item.end - item.start, item.params ?? {})
  }

  /* --- the explainer shelf ---------------------------------------------------
     While an inset is live the product eases to 0.82 of its size and slides
     across (280 px, away from the inset's side), so the inset sits over bare
     ground beside it (§5.3). The envelope opens 0.25 s before the inset (0.5 s
     in) and closes 0.4 s after the inset's 0.24 s exit has all but finished
     (0.4 s out), INOUT-B — so the window never slides back under a card that
     is still on screen. */
  function shelfAt(take, f) {
    const fps = take.fps
    const t = f / fps
    let k = 0
    let side = 'left'
    for (const e of take.events) {
      if (e.type !== 'explain') continue
      const a = e.f / fps
      const s0 = a - 0.25
      const s1 = a + (e.dur ?? 2.5) + 0.6
      if (t < s0 || t > s1) continue
      const kk = Math.min(INOUT_B(clamp((t - s0) / 0.5, 0, 1)), INOUT_B(clamp((s1 - t) / 0.4, 0, 1)))
      if (kk >= k) {
        k = kk
        side = e.side ?? 'left'
      }
    }
    return { k, side }
  }

  /* --- the frame ------------------------------------------------------------ */
  const activeSlides = new Set()

  async function renderFrame(i) {
    const fps = state.fps
    const t = i / fps
    const items = state.edl.items
    const live = items.filter((it) => t >= it.start && t < it.end)

    const want = new Set()
    const stages = [] // {take, takeId, f, look, xf}
    let mascotSource = null
    let primary = null // the take whose overlays, keyboard and mascot are drawn
    let railK = 0 // the progress rail's strength: on under a take, easing in with a take that fades in

    // takes first: they decide what the stage shows
    for (const it of live) {
      if (it.kind !== 'take') continue
      const local = t - it.start
      const take = state.takes[it.take]
      const n = take.frames.length
      const ct = it.mode === 'card' ? state.cardTracks[it.id] : null
      const pre = ct ? it.prelude ?? 0 : 0
      const xf = { s: 1, dx: 0, dy: 0 }
      let overlay = 1
      if (it.inKind === 'push' && it.tin > 0 && local < it.tin) {
        const p = easeInOut(clamp(local / it.tin, 0, 1))
        xf.dx = (1 - p) * W
        overlay = p < 0.5 ? 0 : 1
      }
      const durI = it.end - it.start
      if (it.outKind === 'push' && it.tout > 0 && local > durI - it.tout) {
        // pushed out by the take after it: leave to the left
        const p = easeInOut(clamp((local - (durI - it.tout)) / it.tout, 0, 1))
        xf.dx = -p * W
        overlay = p < 0.5 ? 1 : 0
      }
      let fade = 1
      if (it.inKind === 'fade' && it.tin > 0 && local < it.tin) {
        /* a slide fades into this take (edl `outInto: 'take'`): over the first half
           of the overlap the window fades in beneath the slide, which still stands
           at full strength; over the second half the slide fades out on top of it.
           The take is never half-there while the slide is, so a slide whose last
           picture is this frame dissolves into it without the ground showing
           through, and a slide of type on bare ground still reads as a dissolve.
           Frames, cursor and overlays run from frame 0 as usual. */
        fade = easeInOut(clamp(local / (it.tin / 2), 0, 1))
        railK = Math.max(railK, fade)
      } else railK = 1
      if (it.outKind === 'fade' && it.tout > 0 && local > durI - it.tout) {
        // the window dissolves to the ground; the slide after it is already underneath
        const p = easeInOut(clamp((local - (durI - it.tout)) / it.tout, 0, 1))
        fade = 1 - p
        if (p > 0.5) overlay = 0
      }
      let f
      const look = { alpha: fade, blur: 0, overlay }
      if (ct && local < pre) {
        /* the prelude: the finished card rises in from bare ground — alpha and a
           16 px lift, eased out; no chrome, no overlay (DESIGN-v6 §2.3) */
        const k = easeOut(clamp(local / pre, 0, 1))
        const first = cardAt(ct, 0)
        f = 0
        look.overlay = 0
        look.alpha *= k
        look.card = { rect: first.rect, blend: 1, cam: first.cam }
        xf.dy += (1 - k) * 16
      } else {
        f = Math.min(n - 1, Math.floor((local - pre) * fps))
        if (ct) {
          look.card = cardAt(ct, f)
          const fe = ct.eff[f]
          const mx = ct.mix[f]
          if (fe !== f) {
            /* a frozen picture stands in (a dialog covered the card). Coming back:
               the live card lies beneath under the growing mask, and the frozen
               card fades out on top, clipped to its own box — so the new rows are
               revealed, never ghosted */
            if (mx <= 0) f = fe
            else {
              stages.push({ take, takeId: it.take, item: it, f, look: { alpha: fade, blur: 0, overlay: 0, card: look.card }, xf })
              f = fe
              look.alpha = fade * (1 - mx)
              look.card = { ...look.card, clip: ct.live[fe] }
            }
          }
        }
      }
      // the explainer shelf, composed with the push above: both act on the one xf
      const sh = shelfAt(take, f)
      if (sh.k > 0) {
        xf.s *= lerp(1, 0.82, sh.k)
        xf.dx += (sh.side === 'right' ? -1 : 1) * lerp(0, 280, sh.k)
      }
      stages.push({ take, takeId: it.take, item: it, f, look, xf })
      primary = { item: it, take, f, xf }
    }

    // slides and banners
    let coveredByBanner = false
    for (const it of live) {
      const local = t - it.start
      if (it.kind !== 'slide' && it.kind !== 'banner') continue
      const el = slideEl(it)
      want.add(it.id)
      el.style.display = ''
      const tin = it.tin ?? 0
      const tout = it.tout ?? 0
      const kin = tin > 0 ? clamp(local / tin, 0, 1) : 1
      const kout = tout > 0 ? clamp((it.end - t) / tout, 0, 1) : 1
      let tx = 0
      let opacity = 1
      let scale = 1
      let blur = 0
      if (it.inKind === 'push') tx += (1 - easeInOut(kin)) * W
      else if (tin > 0) {
        opacity *= easeInOut(kin)
        tx += 0
      }
      if (it.outKind === 'push') tx -= easeInOut(1 - kout) * W
      else if (tout > 0 && it.outKind === 'fade' && it.outInto === 'take') {
        /* fading into a take: full strength over the first half of the overlap
           (the take fades in beneath it), then a plain fade over the second — no
           scale, no blur, so a last picture that matches the take's first frame
           leaves no seam */
        opacity *= 1 - easeInOut(clamp((1 - kout) * 2 - 1, 0, 1))
      } else if (tout > 0 && it.outKind === 'fade') {
        opacity *= easeInOut(kout)
        scale = 1 + (1 - easeInOut(kout)) * 0.02
        blur = (1 - kout) * 8
      }
      const lift = tin > 0 && it.inKind !== 'push' ? (1 - easeOut(kin)) * 26 : 0
      el.style.opacity = String(opacity)
      el.style.transform = `translate(${tx}px, ${lift}px) scale(${scale})`
      el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none'
      el.style.clipPath = 'none'

      if (it.kind === 'banner') {
        /* The band crosses the stage; beneath it the take we are leaving holds its
           last frame until the midpoint, then the next take shows its first. */
        coveredByBanner = true
        const half = (it.end - it.start) / 2
        const prev = it.prevTake ? state.takes[it.prevTake] : null
        const next = it.nextTake ? state.takes[it.nextTake] : null
        const useNext = local >= half ? next ?? prev : prev ?? next
        if (useNext && !stages.length) {
          const isNext = useNext === next && (local >= half || !prev)
          const f = isNext ? 0 : useNext.frames.length - 1
          const id = isNext ? it.nextTake : it.prevTake
          // the band is centred for the middle stretch; depth on the stage while it is
          const cover = envelope(local, 0.25, it.end - it.start - 0.25, 0.35, 0.35)
          stages.push({ take: useNext, takeId: id, item: null, f, look: { alpha: 1, blur: 10 * cover, overlay: 0 }, xf: { s: 1 - 0.04 * cover, dx: 0, dy: 0 } })
          railK = 1
        }
      }
      // the mascot rides the slide when it declares keys
      const ms = mascotFromSlide(it, tx)
      if (ms) {
        const useSlide = it.kind === 'banner' ? true : !(it.outKind === 'push' && kout < 0.5)
        if (useSlide) mascotSource = ms
      }
      const drawn = driveSlide(it, el, local)
      if (drawn && typeof drawn.then === 'function') await drawn
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
    $('#stage').style.display = stages.length ? '' : 'none'
    $('#ov').style.display = stages.length ? '' : 'none'
    for (const st of stages) st.cam = st.look.card ? st.look.card.cam : camAt(st.takeId, st.f)
    await drawStages(stages)
    if (primary) {
      const st = stages.filter((s) => s.item === primary.item).pop()
      state.lastMapper = mapper(st.cam, st.xf)
      if (st.look.overlay > 0) drawOverlays(primary.take, primary.f, st.cam, st.xf, st.look)
      else hideOverlays()
      // the take's mascot, unless a banner or an outgoing slide still owns the frame
      if (!coveredByBanner && !mascotSource) {
        const ms = mascotFromTake(primary.item, primary.take, primary.f, st.cam, st.xf)
        if (ms) mascotSource = ms
      }
    } else if (OV['ov-cursor']) hideOverlays()

    const ms = drawMascot(t, mascotSource)
    drawCloud(t, ms)
    drawKeyboard(t, primary && !coveredByBanner ? primary.item : null, primary && !coveredByBanner ? primary.take : null, ms)

    // ground: drifts slowly for the whole film
    $('#bg').style.backgroundPosition = `${(t * 6) % 26}px ${(t * 3) % 26}px, 0 0, 0 0`

    // no rail during the cold open (intro, bento, tour, concept): it measures the chapters
    drawHud(t, coveredByBanner || t < (state.edl.contentStart ?? 0) ? 0 : railK)
    if (document.fonts && document.fonts.status !== 'loaded') await document.fonts.ready
    await new Promise((r) => requestAnimationFrame(() => r()))
    return true
  }

  function drawHud(t, railK) {
    const rail = $('#hud-rail')
    const total = state.edl.duration
    const first = state.edl.contentStart ?? 0
    const p = clamp((t - first) / (total - first), 0, 1)
    rail.style.opacity = String(clamp(railK, 0, 1))
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

  async function init(edlUrl, { theme = 'light' } = {}) {
    state.theme = theme
    document.documentElement.dataset.theme = theme
    readColors()
    const edl = await getJSON(edlUrl)
    state.edl = edl
    state.fps = edl.fps
    for (const [id, url] of Object.entries(edl.takes)) {
      const take = await getJSON(url)
      state.takes[id] = take
      state.cams[id] = cameraTrack(take)
    }
    for (const it of edl.items) {
      if (it.kind !== 'take' || it.mode !== 'card') continue
      const ct = cardTrack(state.takes[it.take])
      if (ct) state.cardTracks[it.id] = ct
      else console.warn(`take ${it.take} has no cardRect events; shown as a window`)
    }
    ovInit()
    // the mascot and the keyboard (both cut; kept behind the flags)
    if (MASCOT_ON) {
      try {
        state.rig = await getJSON('/assets/mascot/rig.json')
        if (window.MASCOT) window.MASCOT.init($('#mascot'), state.rig, { assetBase: '/assets/mascot/' })
      } catch (err) {
        console.error('mascot rig unavailable:', err)
      }
    }
    if (window.KEYBOARD) window.KEYBOARD.init($('#kbd'))
    /* slides that borrow the product's pictures decode them now, not mid-frame:
       every take the edl lists is loaded above (a slide's dockTake / sourceTake
       too, played or not), and init does not resolve — so the renderer cannot ask
       for a frame — until each slide's preload has; a preload that fails fails init */
    for (const it of edl.items) {
      const def = it.kind === 'slide' || it.kind === 'banner' ? slideDef(it) : null
      if (def?.preload) await def.preload(it, edl)
    }
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

  window.COMPOSE = { init, renderFrame, W, H, WIN, APP, CAP_BAND, easeInOut, easeOut, easeIn, easeOutBack, clamp, lerp, envelope, frameUrl, takeEvents, takeFrames, takeInfo, frameAt, cursorAt, cursorSprite, cursorScale, paintCursor, ripplesAt, paintRipples, preloadFrames, picture, cardTarget, cardHold, winGeom, chrome, paintRestWindow, captionPages, PAGE_MAX }
})()
