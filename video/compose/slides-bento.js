/* -----------------------------------------------------------------------------
   The builder, part by part — slide `bento` (BEATS-v7 §01, stage and filmstrip).

   THE STRIP. Six cards along the bottom — 01 Who, 02 If, 03 Then, 04 Shortcuts,
   05 Board, 06 Review — rise in at a resting 0.45. A card is lit (full opacity)
   once its part has been named, active while its part is on the stage (the
   frame's one orange, a 2 px outline) and finished after it (a small positive
   check). Every card but Shortcuts carries a framed picture of its part's
   footage: its finished last frame before its turn, the footage while active
   (with the film's cursor, scaled), the frame it stopped on after. Shortcuts carries two
   keycap pairs that press when the board footage presses them.

   THE STAGE. Above the strip, one big card. On bt.1 it rises in on the finished
   rule card (the dock take's first frame, cropped to the card) with thin
   brackets naming its Who, If and Then; from bt.2 it plays each part's footage
   from the unspoken `parts` take, crossfading at each cue. Near the end of Who
   the three chosen chips lift off the footage and fly into the header's From Who
   row, where they stay. On "Review" (a word time in bt.5) it switches to the
   review footage, and 0.4 s after bt.5 has been spoken it shrinks into slot 06.

   FOOTAGE. A segment plays at its natural speed from its cue; if it would outlast
   the time before the next change it plays faster (at most 2x), else it holds its
   last frame. Pictures are drawn on canvases from frames the engine decoded up
   front (def.preload); the cursor and click ripples are not in the pictures and
   are painted from the take's own cursor data, as the overlay would.

   THE DOCK. Then the six strip cards fly onto the builder: the showcase take's
   first frame fades in behind the strip on a tilted plane, the cards lose their
   contents and fly onto the parts of that picture they name (rects from the
   take's one `dock` event), hold there as orange outlines with a label placed on
   the outline's clearest outside edge, let go, and the plane turns flat and
   grows onto the exact rect the compositor draws a take's window in — title bar
   and shadow included — so the fade into the showcase take shows the same pixels
   on both sides.

   Why one un-clipped scene: the cards and the picture share one parent that
   carries the perspective, and a flying card interpolates from no transform to
   the plane's own transform about the same screen point. At the end of its
   flight its transform is the plane's, so it lies flush on the picture. Nothing
   between the scene and a card or the plane may set `overflow: hidden` (it would
   flatten the 3D); only leaves clip (the window, a card's contents, a frame).

   The slide is transparent — the compositor's ground is the only ground. Every
   value is a function of the slide clock `t`: no transitions, no keyframes, no
   timers. Everything borrowed from the engine is guarded: without the parts take
   a part shows a still crop of the dock picture, without a cursor API no cursor,
   and without a dock event or a decoded dock picture the dock is skipped and the
   strip simply stays to the end of the slide.
   -------------------------------------------------------------------------- */
;(() => {
  const C = window.COMPOSE
  const { clamp, lerp } = C
  const seg = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1))
  const call = (name, ...args) => {
    const fn = C[name]
    if (typeof fn !== 'function') return undefined
    try {
      return fn(...args)
    } catch (err) {
      return undefined
    }
  }

  /* A CSS cubic-bezier as a function of progress: x(u) is monotonic, so solve
     x(u) = p by bisection and read y(u) there (same evaluator as slides-v4). */
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
  const OUT_B = bezier(0, 0.4, 0, 1)
  const OUT_P = bezier(0.4, 1, 0.6, 1)
  const IN_P = bezier(0.6, 0, 0.8, 0.6)
  const INOUT_B = bezier(0.4, 0, 0, 1)
  const DEC = bezier(0.05, 0.7, 0.1, 1)
  const EXIT_C = bezier(0.2, 0, 1, 0.9)

  const DEFAULT_URL = 'idp.xecurify.com/admin/policies'
  const LINES = ['bt.1', 'bt.2', 'bt.3', 'bt.4', 'bt.5']
  const TAIL = 0.3 // the edl's cue.dur is the spoken end plus this
  const XFADE = 0.35 // stage crossfade between parts
  const SHRINK = 0.5 // the stage into slot 06; the dock starts when it lands
  const FLY = 0.6 // the From Who chips
  const FLY_LEAD = 0.95 // the chips leave at the latest this long before bt.3, so they have landed (0.72 s) before it starts
  const MAX_SCALE = 2 // footage is never drawn above 2 screen px per app px
  const MAX_RATE = 2 // nor played faster than 2x
  /* Footage is framed for reading, not fitted whole: a part's crop rect is the
     union of everything its segment shows (a tall panel plus its popovers), and
     fitted into the wide stage that puts 13 px product text at 8 px. The stage
     draws the rect's width across the whole picture instead (at most 2x, product
     text near 26 px, as the approved mock reads) and pans down it; a strip card
     draws at 0.9x. */
  const LEGIBLE = 2
  const THUMB_SCALE = 0.9
  const WHOLE_MIN = 1.1 // a crop that fits the stage at this scale or more is shown whole, not panned
  const CAM_HOLD = 1.2 // the camera follows the cursor averaged over this long either side, in screen seconds
  const CAM_BIAS = 0.1 // and keeps it this far above the window's middle, since menus open below a click
  const REVIEW_AT = 0.56 // "Review" sits 56 % of the way into bt.5, for a cue without words

  /* --- geometry, frame px (mock-v3) ---------------------------------------------
     Six slots of 256 with 38 between, x 97–1823, y 726–908; the stage spans slots
     02–05, 1138 × 574 at (391, 92). Stage-local values are from its padding box:
     a 92 px header, then a frame (1 px hairline, 8 px padding) with 16 px margins,
     whose picture is 1086 × 446. A strip card's picture is 216 × 100. */
  const SLOT = { x: 97, y: 726, w: 256, h: 182, gap: 38 }
  const slotRect = (i) => ({ x: SLOT.x + i * (SLOT.w + SLOT.gap), y: SLOT.y, w: SLOT.w, h: SLOT.h })
  const STAGE = { x: 391, y: 92, w: 1138, h: 574 }
  const BODY = { x: 25, y: 101, w: 1086, h: 446 }
  const THUMB = { w: 216, h: 100 }

  const PARTS = [
    { id: 'who', step: '01', name: 'Who', line: 'People or groups it covers' },
    { id: 'if', step: '02', name: 'If', line: 'Conditions joined by AND / OR' },
    { id: 'then', step: '03', name: 'Then', line: 'Allow, deny, or second factor' },
    { id: 'shortcuts', step: '04', name: 'Shortcuts', line: 'Keys for every move', keys: true },
    { id: 'board', step: '05', name: 'Board', line: 'Top to bottom, order wins' },
    { id: 'review', step: '06', name: 'Review', line: 'Read back before saving' },
  ]
  // what the stage shows, in order; the first is the finished rule card from the dock picture
  const STAGE_VIEWS = [
    { id: 'card', step: '', name: 'Rule card', line: 'One card, three parts' },
    { id: 'who', part: 0 },
    { id: 'if', part: 1 },
    { id: 'then', part: 2 },
    { id: 'board', part: 4 },
    { id: 'review', part: 5 },
  ]

  const ICON_GROUP = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 13.5c.6-2.4 2.3-3.6 4.5-3.6s3.9 1.2 4.5 3.6"/><path d="M10.5 3.2a2.4 2.4 0 0 1 0 4.6M12.2 9.9c1.2.5 2 1.7 2.3 3.6"/></svg>'
  const ICON_PERSON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.3" r="2.7"/><path d="M3 14c.6-2.6 2.5-4 5-4s4.4 1.4 5 4"/></svg>'
  const CHIPS = [
    { name: 'Finance', icon: ICON_GROUP },
    { name: 'Executives', icon: ICON_GROUP },
    { name: 'Priya Sharma', icon: ICON_PERSON },
  ]
  const TICK = '<span class="bt-done"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.2 5.2 L4.2 7.1 L7.9 3.1"/></svg></span>'
  const KEYS = `<div class="bt-keys">
      <div class="bt-keys__row" data-row="move"><kbd data-cap="alt">Alt</kbd><span class="bt-keys__plus">+</span><kbd class="is-sym" data-cap="down">↓</kbd><span class="bt-keys__does">Move a rule</span></div>
      <div class="bt-keys__row" data-row="undo"><kbd data-cap="ctrl">Ctrl</kbd><span class="bt-keys__plus">+</span><kbd data-cap="z">Z</kbd><span class="bt-keys__does">Undo</span></div>
    </div>`

  /* A recorded key names the pair it presses: Alt + ↓ / ↑ moves a rule, Ctrl + Z
     undoes. Typing and every other key presses nothing here. */
  const keyCaps = (key) => {
    const k = String(key ?? '')
    const m = k.match(/^Alt\+Arrow(Up|Down)$/i)
    if (m) return { row: 'move', caps: ['alt', m[1].toLowerCase()] }
    if (/^(Control|Ctrl|Meta)\+z$/i.test(k)) return { row: 'undo', caps: ['ctrl', 'z'] }
    return null
  }

  /* --- the window, as the compositor draws a take at rest ------------------------
     COMPOSE.winGeom() when the engine exports it; otherwise the same numbers from
     WIN (picture top-left, size, title bar, the 14 px corner at rest). */
  const geom = () => {
    if (typeof C.winGeom === 'function') return C.winGeom()
    const W = C.WIN
    return { x: W.ax, y: W.ay, w: W.aw, h: W.ah, bar: W.bar, radius: 14, s0: W.s0 }
  }
  const viewOf = (take) => call('takeInfo', take)?.view ?? { width: 1440, height: 900 }
  const fpsOf = (take) => call('takeInfo', take)?.fps ?? 30

  /* --- pictures -----------------------------------------------------------------
     Footage is decoded before the first frame: the engine's preloadFrames pins
     every image a segment uses, and picture() hands one back synchronously. The
     dock picture is also kept as an <img> of our own, because the plane puts the
     decoded element itself in the DOM. Without preloadFrames the same images are
     loaded here, a few at a time, and a failed one is simply not drawn. */
  const PICS = new Map() // url → { img, ok, ready, ink }
  function loadPic(url) {
    if (!url) return Promise.resolve(null)
    if (!PICS.has(url)) {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      const rec = { img, ok: false, ink: null }
      rec.ready = img.decode().then(
        () => ((rec.ok = true), rec),
        () => null,
      )
      PICS.set(url, rec)
    }
    return PICS.get(url).ready
  }
  async function loadRange(take, f0, f1) {
    const urls = []
    const seen = new Set()
    for (let f = f0; f <= f1; f++) {
      const u = call('frameUrl', take, f)
      if (u && !seen.has(u)) {
        seen.add(u)
        urls.push(u)
      }
    }
    let next = 0
    const worker = async () => {
      while (next < urls.length) await loadPic(urls[next++])
    }
    await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker))
  }
  const pictureOf = (take, f) => {
    let img = call('picture', take, f)
    if (!img) {
      const rec = PICS.get(call('frameUrl', take, f))
      if (rec?.ok) img = rec.img
    }
    return img && img.naturalWidth > 0 ? img : null
  }

  /* Where text and controls are in the dock picture: a pixel darker than 60 %
     luma is ink (text, icons, the dark navigation, the orange button); hairlines,
     tints and the board's dot grid are lighter. Kept as a summed-area table in app
     px, so the ink under any label position is four lookups. */
  const INK_LUMA = 0.6 * 255
  function inkMap(img, vw, vh) {
    try {
      const cv = document.createElement('canvas')
      cv.width = vw
      cv.height = vh
      const cx = cv.getContext('2d', { willReadFrequently: true })
      cx.imageSmoothingEnabled = true
      cx.drawImage(img, 0, 0, vw, vh)
      const d = cx.getImageData(0, 0, vw, vh).data
      const W1 = vw + 1
      const sum = new Uint32Array(W1 * (vh + 1))
      for (let y = 0; y < vh; y++) {
        let row = 0
        for (let x = 0; x < vw; x++) {
          const i = (y * vw + x) * 4
          if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < INK_LUMA) row++
          sum[(y + 1) * W1 + x + 1] = sum[y * W1 + x + 1] + row
        }
      }
      return { w: vw, h: vh, sum }
    } catch (err) {
      return null // a tainted or failed read: labels are placed by free space alone
    }
  }
  const inkIn = (ink, x, y, w, h) => {
    if (!ink) return 0
    const x0 = clamp(Math.floor(x), 0, ink.w)
    const y0 = clamp(Math.floor(y), 0, ink.h)
    const x1 = clamp(Math.ceil(x + w), 0, ink.w)
    const y1 = clamp(Math.ceil(y + h), 0, ink.h)
    const area = (x1 - x0) * (y1 - y0)
    if (area <= 0) return 0
    const W1 = ink.w + 1
    const s = ink.sum
    return (s[y1 * W1 + x1] - s[y0 * W1 + x1] - s[y1 * W1 + x0] + s[y0 * W1 + x0]) / area
  }

  /* --- the takes ------------------------------------------------------------------ */
  const dockRects = (take) => {
    const ev = (call('takeEvents', take) ?? []).find((e) => e.type === 'dock')
    return ev?.rects ?? null
  }
  const realRect = (r) => !!r && r.width > 0 && r.height > 0

  /* The parts take's segments (contract C1): a `part` start mark with the crop
     rect on the segment's first kept frame, and an end mark on its last kept
     frame (the take steps once more after writing it, so the next segment starts
     one past it). */
  function segmentsOf(take) {
    const out = {}
    if (!take) return out
    const n = call('takeFrames', take) ?? 0
    if (!n) return out
    const fps = fpsOf(take)
    const open = {}
    for (const e of call('takeEvents', take) ?? []) {
      if (e.type !== 'part' || !e.id) continue
      if (e.phase === 'start' && realRect(e.rect)) open[e.id] = e
      else if (e.phase === 'end' && open[e.id]) {
        const a = open[e.id]
        const f0 = clamp(Math.floor(a.f), 0, n - 1)
        const lastF = clamp(Math.floor(e.f), f0, n - 1)
        out[e.id] = { kind: 'seg', take, fps, f0, f1: lastF + 1, lastF, len: (lastF - f0 + 1) / fps, rect: a.rect }
        delete open[e.id]
      }
    }
    return out
  }

  /* --- footage on a canvas ----------------------------------------------------------
     A play is a view (a segment, or a still crop) with the slide time it starts at,
     the time it has, and the rate that fits one into the other. */
  const play = (v, from, until) => ({
    v,
    from,
    until,
    rate: v?.kind === 'seg' ? clamp(v.len / Math.max(0.05, until - from), 1, MAX_RATE) : 1,
  })
  function frameOf(p, t) {
    const v = p?.v
    if (!v) return null
    if (v.kind !== 'seg') return { f: v.f, fv: v.f }
    const fv = v.f0 + Math.max(0, t - p.from) * v.fps * p.rate
    return { f: Math.min(v.lastF, Math.floor(fv + 1e-6)), fv }
  }

  /* engine.js RIPPLE's border; the ring sizes and alphas come from COMPOSE.ripplesAt.
     The colour is the slate, not the overlay's orange: on this slide the active
     card's outline is the frame's one orange. */
  const RIPPLE = { border: 3, line: 0.7, fill: 0.08 }
  /* A click's ripple, only for clicks inside the playing segment: holding a
     segment's last frame lets its last ripple finish instead of freezing, and a
     click that belongs to the next segment never shows early. */
  function paintClicks(S, ctx, p, fv, toCtx, scale) {
    const v = p.v
    const list = call('ripplesAt', v.take, fv) ?? []
    for (const r of list) {
      const ef = fv - r.dtc * v.fps
      if (ef < v.f0 - 0.01 || ef >= v.f1 - 0.01) continue
      const c = toCtx(r.x, r.y)
      for (const ring of r.rings ?? []) {
        const rad = (ring.size * scale) / 2
        const bw = RIPPLE.border * scale
        if (!(ring.alpha > 0) || rad <= 0) continue
        ctx.save()
        ctx.globalAlpha *= ring.alpha
        ctx.beginPath()
        ctx.arc(c.x, c.y, Math.max(0, rad - bw), 0, Math.PI * 2)
        ctx.fillStyle = rgba([...S.colors.ripple, RIPPLE.fill])
        ctx.fill()
        ctx.beginPath()
        ctx.arc(c.x, c.y, Math.max(0, rad - bw / 2), 0, Math.PI * 2)
        ctx.lineWidth = bw
        ctx.strokeStyle = rgba([...S.colors.ripple, RIPPLE.line])
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  /* The cursor's running sums over a segment, clamped into its crop rect (a
     segment whose take hides the cursor averages to the rect's centre), so the
     camera's mean over any span of frames is two lookups. Built once per view. */
  function cursorSums(v) {
    if (v.sums) return v.sums
    const r = v.rect
    const n = v.lastF - v.f0 + 1
    const sx = new Float64Array(n + 1)
    const sy = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) {
      const c = call('cursorAt', v.take, v.f0 + i)
      sx[i + 1] = sx[i] + (c ? clamp(c.x, r.x, r.x + r.width) : r.x + r.width / 2)
      sy[i + 1] = sy[i] + (c ? clamp(c.y, r.y, r.y + r.height) : r.y + r.height / 2)
    }
    v.sums = { sx, sy, n }
    return v.sums
  }

  /* Where a view is looked at in a W × H picture: the scale, and the window's
     centre in app px. A still is fitted whole (the stage's rule card, whose
     brackets are drawn to that fit) or, in a strip card, covers it from its
     top-left. A segment is drawn at `target` (capped by the rect's width and by
     2x, never below the whole-rect fit), centred across the rect when its width
     fits and otherwise panned, following the cursor's mean over CAM_HOLD either
     side of the frame (interpolated between frames, so the pan is continuous). */
  function camera(v, fv, rate, W, H, target, cover) {
    const r = v.rect
    const fit = Math.min(W / r.width, H / r.height)
    if (v.kind !== 'seg') {
      if (!cover) return { s: Math.min(fit, MAX_SCALE), cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
      const s = Math.min(Math.max(W / r.width, H / r.height), MAX_SCALE)
      return { s, cx: r.x + Math.min(W / s, r.width) / 2, cy: r.y + Math.min(H / s, r.height) / 2 }
    }
    /* A crop short enough to show whole at reading size (the board's chain, at
       about 1.3x) is shown whole on the stage: "top to bottom" needs every rule in
       view. Only tall crops (a dialog, a panel with its popovers) pan. */
    const whole = !cover && fit >= WHOLE_MIN
    const s = whole ? Math.min(fit, MAX_SCALE) : Math.min(MAX_SCALE, Math.max(fit, Math.min(target, W / r.width)))
    const ww = W / s
    const wh = H / s
    const { sx, sy, n } = cursorSums(v)
    const half = Math.max(1, Math.round(CAM_HOLD * v.fps * rate))
    const meanAt = (i) => {
      const a = clamp(i - half, 0, n - 1)
      const b = clamp(i + half, 0, n - 1)
      const k = b - a + 1
      return [(sx[b + 1] - sx[a]) / k, (sy[b + 1] - sy[a]) / k]
    }
    const i = clamp(fv - v.f0, 0, n - 1)
    const i0 = Math.floor(i)
    const m0 = meanAt(i0)
    const m1 = meanAt(Math.min(i0 + 1, n - 1))
    const mx = lerp(m0[0], m1[0], i - i0)
    const my = lerp(m0[1], m1[1], i - i0)
    return {
      s,
      cx: ww >= r.width ? r.x + r.width / 2 : clamp(mx, r.x + ww / 2, r.x + r.width - ww / 2),
      cy: wh >= r.height ? r.y + r.height / 2 : clamp(my + CAM_BIAS * wh, r.y + wh / 2, r.y + r.height - wh / 2),
    }
  }

  /* Paint a play at slide time `t` over the whole canvas at `alpha`: the ground,
     then the part of the crop rect the camera sees. `thumb` frames it for a strip
     card. `live` adds the cursor and the ripples. */
  function paintPlay(S, ctx, W, H, p, t, { thumb = false, alpha = 1, live = false } = {}) {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = S.colors.ground
    ctx.fillRect(0, 0, W, H)
    const fr = frameOf(p, t)
    if (!fr) return ctx.restore()
    const v = p.v
    const r = v.rect
    const cam = camera(v, fr.fv, p.rate, W, H, thumb ? THUMB_SCALE : LEGIBLE, thumb)
    const s = cam.s
    const toCtx = (x, y) => ({ x: W / 2 + (x - cam.cx) * s, y: H / 2 + (y - cam.cy) * s })
    // what is drawn: the camera's window, inside the crop rect
    const x0 = Math.max(r.x, cam.cx - W / s / 2)
    const y0 = Math.max(r.y, cam.cy - H / s / 2)
    const x1 = Math.min(r.x + r.width, cam.cx + W / s / 2)
    const y1 = Math.min(r.y + r.height, cam.cy + H / s / 2)
    const d0 = toCtx(x0, y0)
    const dw = (x1 - x0) * s
    const dh = (y1 - y0) * s
    const img = pictureOf(v.take, fr.f)
    if (img && dw > 0 && dh > 0) {
      const view = viewOf(v.take)
      const k = img.naturalWidth / view.width
      const sx = clamp(x0 * k, 0, img.naturalWidth - 1)
      const sy = clamp(y0 * k, 0, img.naturalHeight - 1)
      const sw = Math.min((x1 - x0) * k, img.naturalWidth - sx)
      const sh = Math.min((y1 - y0) * k, img.naturalHeight - sy)
      if (sw > 0 && sh > 0) {
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, sx, sy, sw, sh, d0.x, d0.y, (sw / k) * s, (sh / k) * s)
      }
    }
    if (live && v.kind === 'seg' && dw > 0 && dh > 0) {
      ctx.beginPath()
      ctx.rect(d0.x, d0.y, dw, dh)
      ctx.clip()
      const cs = call('cursorScale', s) ?? Math.sqrt(s / S.g.s0)
      paintClicks(S, ctx, p, fr.fv, toCtx, cs)
      const cp = call('cursorAt', v.take, fr.f)
      if (cp && typeof C.paintCursor === 'function') {
        const at = toCtx(cp.x, cp.y)
        C.paintCursor(ctx, at.x, at.y, { scale: cs, pressed: !!cp.pressed })
      }
    }
    ctx.restore()
  }

  /* --- the title bar the engine paints (drawStage), as SVG in screen px at rest:
     three dots, the address pill with its lock, the URL. The engine fills the
     bar with a two-stop gradient; here it is the flat end colour. */
  function barSvg(w, bar, url) {
    const cy = bar / 2
    const px = w / 2 - 210
    const py = cy - 11
    const lx = px + 14
    const ly = py + 11
    /* SVG's central baseline does not sit where the canvas's 'middle' + 0.5 does for
       this face (measured against paintRestWindow); ly + 0.2 lands on the same row */
    const dots = [0, 1, 2].map((i) => `<circle cx="${22 + i * 20}" cy="${cy}" r="6" class="bt-bar__dot"/>`).join('')
    const esc = String(url).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    return `<svg class="bt-bar" width="${w}" height="${bar}" viewBox="0 0 ${w} ${bar}" aria-hidden="true">
        <rect x="0" y="0" width="${w}" height="${bar}" class="bt-bar__fill"/>
        ${dots}
        <rect x="${px}" y="${py}" width="420" height="22" rx="11" class="bt-bar__pill"/>
        <text x="${w / 2}" y="${ly + 0.2}" class="bt-bar__url" text-anchor="middle" dominant-baseline="central">${esc}</text>
        <rect x="${lx - 3.5}" y="${ly - 1}" width="7" height="5.5" class="bt-bar__lock"/>
        <path d="M${lx - 2.6} ${ly - 1} A2.6 2.6 0 0 1 ${lx + 2.6} ${ly - 1}" class="bt-bar__lock"/>
      </svg>`
  }

  /* The rule card's brackets on bt.1: one per part, beside the card in the
     letterbox (left when there is room, else right), so they name the rows
     without covering them. Stage-picture px. */
  function bracketsFor(rects) {
    const r = rects?.card
    if (!realRect(r)) return []
    const s = Math.min(BODY.w / r.width, BODY.h / r.height, MAX_SCALE)
    const dw = r.width * s
    const dh = r.height * s
    const dx = (BODY.w - dw) / 2
    const dy = (BODY.h - dh) / 2
    const left = dx >= 90
    return [
      ['who', 'Who'],
      ['if', 'If'],
      ['then', 'Then'],
    ]
      .map(([id, label]) => {
        const q = rects[id]
        if (!realRect(q)) return null
        const y1 = clamp(dy + (q.y - r.y) * s + 3, 4, BODY.h - 4)
        const y2 = clamp(dy + (q.y + q.height - r.y) * s - 3, y1 + 6, BODY.h - 4)
        const x = left ? dx - 14 : dx + dw + 14
        const tick = left ? 6 : -6
        return {
          label,
          d: `M ${x + tick} ${y1} H ${x} V ${y2} H ${x + tick}`,
          len: 12 + (y2 - y1),
          tx: left ? x - 10 : x + 10,
          ty: (y1 + y2) / 2,
          anchor: left ? 'end' : 'start',
        }
      })
      .filter(Boolean)
  }

  /* --- small helpers ---------------------------------------------------------------- */
  // light values, for a custom property that reads empty; the stylesheet's tokens win
  const HAIR = [228, 232, 236] // #e4e8ec
  const ORANGE = [235, 84, 36] // #eb5424
  const WHITE = [255, 255, 255]
  const SLATE = [74, 85, 96] // #4a5560
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k))
  const rgba = (c) => `rgba(${c[0].toFixed(1)},${c[1].toFixed(1)},${c[2].toFixed(1)},${c[3].toFixed(3)})`
  const px = (v) => `${v.toFixed(2)}px`
  const op = (v) => v.toFixed(4)
  const showIf = (node, o) => {
    node.style.opacity = op(o)
    node.style.visibility = o > 0.001 ? 'visible' : 'hidden'
  }
  const parseColor = (s, fallback) => {
    const v = String(s ?? '').trim()
    let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (m) {
      const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
    }
    m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
    return m ? [+m[1], +m[2], +m[3]] : fallback
  }
  // a node's offset inside an ancestor, through offsetParent — untouched by transforms
  const offsetIn = (node, root) => {
    let x = 0
    let y = 0
    for (let n = node; n && n !== root; n = n.offsetParent) {
      x += n.offsetLeft
      y += n.offsetTop
    }
    return { x, y }
  }
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const contains = (a, b) => a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.w >= b.x + b.w - 1 && a.y + a.h >= b.y + b.h - 1

  /* --- labels on the docked outlines -----------------------------------------------
     Owner's rule: a label sits outside its outline on the clearest edge and never
     over product text. Every position along each of the four outside edges (top,
     bottom, left, right; nine steps along the edge) is scored: product ink under
     the label rules a position out if any position is clean; then overlap with a
     label already placed, crossing another outline and landing on another part;
     then the edge with the most free space inside the picture wins, and along an
     edge its start. Placed in dock order, so earlier labels push later ones. All
     in frame px at rest (the plane's own coordinates once it lies flush). */
  const LABEL_GAP = 8
  const LABEL_MARGIN = 6
  const LABEL_STEPS = 9
  function placeLabels(S) {
    const { g } = S
    const docked = S.cards.filter((c) => c.dock)
    if (docked.some((c) => !(c.pill.offsetWidth > 0))) return false
    const rec = PICS.get(S.url)
    if (rec?.ok && !rec.ink) {
      const view = viewOf(S.dockTake)
      rec.ink = inkMap(rec.img, Math.round(view.width), Math.round(view.height))
    }
    const ink = rec?.ink ?? null
    const inkAt = (b) => inkIn(ink, (b.x - 2 - g.x) / g.s0, (b.y - 2 - g.y) / g.s0, (b.w + 4) / g.s0, (b.h + 4) / g.s0)
    const placed = []
    for (const c of docked) {
      const T = c.dock
      const W = c.pill.offsetWidth
      const H = c.pill.offsetHeight
      let best = null
      for (const side of ['top', 'bottom', 'left', 'right']) {
        const vertical = side === 'top' || side === 'bottom'
        const free = side === 'top' ? T.y - g.y : side === 'bottom' ? g.y + g.h - (T.y + T.h) : side === 'left' ? T.x - g.x : g.x + g.w - (T.x + T.w)
        if (free < (vertical ? H : W) + LABEL_GAP + LABEL_MARGIN) continue
        for (let k = 0; k < LABEL_STEPS; k++) {
          const u = k / (LABEL_STEPS - 1)
          let x
          let y
          if (vertical) {
            x = lerp(T.x - 2, T.x + T.w - W + 2, u)
            y = side === 'top' ? T.y - LABEL_GAP - H : T.y + T.h + LABEL_GAP
          } else {
            x = side === 'left' ? T.x - LABEL_GAP - W : T.x + T.w + LABEL_GAP
            y = lerp(T.y, T.y + T.h - H, u)
          }
          x = clamp(x, g.x + LABEL_MARGIN, g.x + g.w - LABEL_MARGIN - W)
          y = clamp(y, g.y + LABEL_MARGIN, g.y + g.h - LABEL_MARGIN - H)
          const box = { x, y, w: W, h: H }
          const area = W * H
          const inkF = inkAt(box)
          let score = (inkF > 0.004 ? 50 : 0) + inkF * 400
          score += (80 * overlap(box, T)) / area
          for (const q of placed) score += (60 * overlap({ x: box.x - 6, y: box.y - 6, w: W + 12, h: H + 12 }, q)) / area
          for (const o of docked) {
            if (o === c) continue
            const R = o.dock
            const hit = overlap(box, R)
            if (hit > 0 && !contains(R, box)) score += 8 // across another outline
            if (!contains(R, T) && !contains(T, R)) score += (30 * hit) / area
          }
          score -= (3 * Math.min(free, 480)) / 480
          score += 0.25 * u
          if (!best || score < best.score - 1e-9) best = { score, side, x, y }
        }
      }
      if (!best) best = { side: 'top', x: T.x - 2, y: T.y - LABEL_GAP - H }
      c.label = best
      placed.push({ x: best.x, y: best.y, w: W, h: H })
    }
    return true
  }

  /* --- the timeline, from the cues ----------------------------------------------------
     A[k] is when bt.(k+1) starts; bt.5's spoken end + dockDelay starts the shrink
     (S0), and the dock starts when it lands (D). R is the word "Review". Without
     cues (no voice laid out) the lines are spread evenly so the slide still reads. */
  function timeline(S, dur, params) {
    const cues = params.cues ?? {}
    const step = Math.max(1.2, (dur - 6.5) / 5)
    const cue = LINES.map((id, k) => cues[id] ?? { at: 1.0 + k * step, dur: Math.max(1, step - 0.35) + TAIL })
    const A = cue.map((c) => c.at)
    const last = cue[4]
    const S0 = cues['bt.5'] ? last.at + last.dur - TAIL + (params.dockDelay ?? 0.4) : dur - 4.9 - SHRINK
    const D = S0 + SHRINK
    const w = last.words?.find((x) => /^Review$/i.test(x.text))
    const R = clamp(w ? last.at + w.t : last.at + REVIEW_AT * Math.max(0.5, last.dur - TAIL), A[4] + 0.5, Math.max(A[4] + 0.5, S0 - 0.2))

    const V = S.views
    const who = play(V.who, A[1], A[2] - FLY_LEAD)
    /* the chips leave when Who's footage has played out (plus a beat), and at the
       latest FLY_LEAD before bt.3; over a still they leave at the latest */
    const F = V.who?.kind === 'seg' ? Math.min(Math.max(A[1] + V.who.len / who.rate + 0.15, A[1] + 0.8), A[2] - FLY_LEAD) : A[2] - FLY_LEAD
    const stage = [play(V.card, A[0], A[1]), who, play(V.if, A[2], A[3]), play(V.then, A[3], A[4]), play(V.board, A[4], R), play(V.review, R, S0)]
    const landed = F + FLY + 0.06 * (CHIPS.length - 1)
    // per strip card: lit (full opacity), on / off (active), done (the check), and its footage
    const cards = [
      { lit: A[0], on: A[1], off: A[2], done: landed, p: stage[1] },
      { lit: A[0], on: A[2], off: A[3], done: A[3], p: stage[2] },
      { lit: A[0], on: A[3], off: A[4], done: A[4], p: stage[3] },
      // lit and pressing with the board, never outlined: the frame keeps one orange (Board's)
      { lit: A[4], on: R, off: R, done: R, p: null },
      { lit: A[4], on: A[4], off: R, done: R, p: stage[4] },
      // the stage shrinks into Review's slot: its outline goes and its check comes as the stage arrives
      { lit: R, on: R, off: S0 + SHRINK, done: S0 + 0.3, p: stage[5] },
    ]
    // the board footage's key presses, in slide time; none after the stage has left the board
    const board = stage[4]
    const keys = []
    if (board.v?.kind === 'seg') {
      for (const e of S.keyEvents) {
        const tk = board.from + (e.f - board.v.f0) / board.v.fps / board.rate
        if (tk >= board.from && tk < board.until) keys.push({ t: tk, ...e.caps })
      }
    }
    return { A, S0, D, R, F, stage, cards, keys }
  }

  const bento = {
    async preload(item) {
      const p = item?.params ?? {}
      const dock = p.dockTake ?? 'showcase'
      const jobs = []
      const url = call('frameUrl', dock, 0)
      const view = viewOf(dock)
      jobs.push(
        loadPic(url).then((rec) => {
          if (rec && !rec.ink) rec.ink = inkMap(rec.img, Math.round(view.width), Math.round(view.height))
          return rec
        }),
      )
      const pre = typeof C.preloadFrames === 'function'
      if (pre) jobs.push(C.preloadFrames(dock, 0, 0))
      const segs = segmentsOf(p.sourceTake)
      for (const s of Object.values(segs)) jobs.push(pre ? C.preloadFrames(s.take, s.f0, s.lastF) : loadRange(s.take, s.f0, s.lastF))
      await Promise.all(jobs)
      return null
    },

    build(el, params = {}, edl = null) {
      const g = geom()
      const dockTake = params.dockTake ?? 'showcase'
      const srcTake = params.sourceTake ?? null
      const url = call('frameUrl', dockTake, 0) ?? null
      const rects = url ? dockRects(dockTake) : null
      const segs = segmentsOf(srcTake)

      const brackets = bracketsFor(rects)
      const chip = (c, cls) => `<span class="bt-chip ${cls}">${c.icon}<span>${c.name}</span></span>`
      el.innerHTML = `
        <div class="bt">
          <div class="bt-scene">
            <div class="bt-plane">
              <div class="bt-win">
                ${barSvg(g.w, g.bar, edl?.url ?? DEFAULT_URL)}
                <div class="bt-pic"></div>
                <div class="bt-hair"></div>
              </div>
            </div>
            <svg class="bt-flow" width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">
              <defs>
                <marker id="bt-ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M1 1.2 L9 5 L1 8.8 Z" class="bt-flow__head"/>
                </marker>
              </defs>
              ${PARTS.slice(0, -1)
                .map((_, i) => {
                  const a = slotRect(i)
                  const b = slotRect(i + 1)
                  return `<path class="bt-flow__line" data-arrow="${i}" marker-end="url(#bt-ah)" d="M ${a.x + a.w + 7} ${a.y + 21} H ${b.x - 6}"/>`
                })
                .join('')}
              ${PARTS.map((_, i) => {
                const a = slotRect(i)
                const cx = a.x + a.w / 2
                const hy = STAGE.y + 36
                if (i === 0) return `<path class="bt-flow__line" data-tether="0" marker-end="url(#bt-ah)" d="M ${cx} ${a.y - 8} V ${hy + 10} Q ${cx} ${hy} ${cx + 10} ${hy} H ${STAGE.x - 7}"/>`
                if (i === PARTS.length - 1) return `<path class="bt-flow__line" data-tether="${i}" marker-end="url(#bt-ah)" d="M ${cx} ${a.y - 8} V ${hy + 10} Q ${cx} ${hy} ${cx - 10} ${hy} H ${STAGE.x + STAGE.w + 7}"/>`
                return `<path class="bt-flow__line" data-tether="${i}" d="M ${cx} ${a.y - 8} V ${STAGE.y + STAGE.h + 8}"/>`
              }).join('')}
            </svg>
            <article class="bt-stage">
              <header class="bt-stage__head">
                <div class="bt-stage__row">
                  <div class="bt-step bt-stage__step"></div>
                  <div class="bt-stage__name"></div>
                  <div class="bt-from"><span class="bt-from__label">From Who</span>${CHIPS.map((c) => chip(c, 'bt-chip--ph')).join('')}</div>
                </div>
                <div class="bt-stage__line"></div>
              </header>
              <div class="bt-stage__frame">
                <div class="bt-stage__in">
                  <canvas class="bt-stage__cv" width="${BODY.w}" height="${BODY.h}"></canvas>
                  <svg class="bt-brackets" width="${BODY.w}" height="${BODY.h}" viewBox="0 0 ${BODY.w} ${BODY.h}" aria-hidden="true">
                    ${brackets.map((b, j) => `<path class="bt-brackets__line" data-br="${j}" d="${b.d}"/><text class="bt-brackets__label" data-brl="${j}" x="${b.tx}" y="${b.ty}" text-anchor="${b.anchor}" dominant-baseline="central">${b.label}</text>`).join('')}
                  </svg>
                </div>
              </div>
              ${CHIPS.map((c) => chip(c, 'bt-chip--fly')).join('')}
            </article>
            ${PARTS.map(
              (p) => `
              <div class="bt-card bt-card--${p.id}" data-card="${p.id}">
                <div class="bt-in">
                  <header class="bt-card__head">
                    <div class="bt-card__row"><div class="bt-step">${p.step}</div><div class="bt-card__name">${p.name}${TICK}</div></div>
                    <div class="bt-card__line">${p.line}</div>
                    ${p.id === 'who' ? `<div class="bt-minichips">${CHIPS.map((c) => `<span class="bt-minichip">${c.name}</span>`).join('')}</div>` : ''}
                  </header>
                  <div class="bt-frame"><div class="bt-frame__in">${p.keys ? KEYS : `<canvas class="bt-frame__cv" width="${THUMB.w}" height="${THUMB.h}"></canvas>`}</div></div>
                </div>
                <div class="bt-ring"></div>
                <div class="bt-pill">${p.name}</div>
              </div>`,
            ).join('')}
          </div>
        </div>`

      const root = el.querySelector('.bt')
      const plane = el.querySelector('.bt-plane')
      const win = el.querySelector('.bt-win')
      const bar = el.querySelector('.bt-bar')
      const picSlot = el.querySelector('.bt-pic')

      // the plane is the whole window: title bar above the picture
      Object.assign(plane.style, { left: px(g.x), top: px(g.y - g.bar), width: px(g.w), height: px(g.h + g.bar) })
      plane.style.transformOrigin = `${px(g.w / 2)} ${px(g.bar + g.h / 2)}`
      win.style.borderRadius = px(g.radius)
      el.querySelector('.bt-hair').style.borderRadius = px(g.radius)
      el.querySelector('.bt-scene').style.perspectiveOrigin = `${px(g.x + g.w / 2)} ${px(g.y + g.h / 2)}`
      root.style.clipPath = 'none'

      let pic = null
      if (url) {
        const rec = PICS.get(url)
        if (rec && rec.ok) pic = rec.img.parentNode ? rec.img.cloneNode(false) : rec.img
        else {
          // not preloaded: load now, and keep the dock off until it has decoded
          pic = new Image()
          pic.decoding = 'async'
          pic.src = url
        }
        pic.alt = ''
        pic.className = 'bt-pic__img'
        pic.width = Math.round(g.w)
        pic.height = Math.round(g.h)
        Object.assign(pic.style, { width: px(g.w), height: px(g.h) })
        picSlot.appendChild(pic)
      }
      Object.assign(picSlot.style, { width: px(g.w), height: px(g.h) })
      bar.style.display = 'block'

      // a part's footage, or a still crop of the dock picture when the parts take has no such segment
      const still = (id) => (url && realRect(rects?.[id]) ? { kind: 'still', take: dockTake, f: 0, rect: rects[id] } : null)
      const views = { card: still('card') }
      for (const id of ['who', 'if', 'then', 'board', 'review']) views[id] = segs[id] ?? still(id)

      const keyEvents = []
      if (segs.board) {
        for (const e of call('takeEvents', srcTake) ?? []) {
          if (e.type !== 'key' || e.f < segs.board.f0 || e.f >= segs.board.f1) continue
          const caps = keyCaps(e.key)
          if (caps) keyEvents.push({ f: e.f, caps })
        }
      }

      const stage = el.querySelector('.bt-stage')
      const cards = PARTS.map((p, i) => {
        const node = el.querySelector(`[data-card="${p.id}"]`)
        const r = rects?.[p.id]
        // app px → screen px through the window at rest
        const dock = realRect(r) && url ? { x: g.x + r.x * g.s0, y: g.y + r.y * g.s0, w: r.width * g.s0, h: r.height * g.s0 } : null
        const cv = node.querySelector('.bt-frame__cv')
        return {
          p,
          i,
          node,
          slot: slotRect(i),
          dock,
          label: null,
          inner: node.querySelector('.bt-in'),
          ring: node.querySelector('.bt-ring'),
          pill: node.querySelector('.bt-pill'),
          tick: node.querySelector('.bt-done'),
          line: node.querySelector('.bt-card__line'),
          mini: node.querySelector('.bt-minichips'),
          ctx: cv ? cv.getContext('2d') : null,
          rows: Object.fromEntries([...node.querySelectorAll('.bt-keys__row')].map((n) => [n.dataset.row, n])),
          caps: Object.fromEntries([...node.querySelectorAll('kbd')].map((n) => [n.dataset.cap, n])),
        }
      })

      const css = getComputedStyle(root)
      const colors = {
        ground: css.getPropertyValue('--bt-ground').trim() || '#f2f4f7',
        surface: parseColor(css.getPropertyValue('--bt-surface'), WHITE),
        // the card's edge at rest, and the landed outline (the brand at 0.9), as numbers to mix per frame
        edge: [...parseColor(css.getPropertyValue('--bt-hair'), HAIR), 1],
        brand: [...parseColor(css.getPropertyValue('--bt-brand'), ORANGE), 0.9],
        ripple: parseColor(css.getPropertyValue('--bt-ripple'), SLATE),
      }

      el._bt = {
        g,
        url,
        dockTake,
        root,
        plane,
        win,
        bar,
        picSlot,
        pic,
        cards,
        views,
        keyEvents,
        colors,
        docked: cards.some((c) => c.dock),
        stage,
        stageCtx: stage.querySelector('.bt-stage__cv').getContext('2d'),
        head: {
          step: stage.querySelector('.bt-stage__step'),
          name: stage.querySelector('.bt-stage__name'),
          line: stage.querySelector('.bt-stage__line'),
          key: null,
        },
        fromLabel: stage.querySelector('.bt-from__label'),
        chipPh: [...stage.querySelectorAll('.bt-chip--ph')],
        chipFly: [...stage.querySelectorAll('.bt-chip--fly')],
        chipLay: null,
        brackets: brackets.map((b, j) => ({ ...b, line: stage.querySelector(`[data-br="${j}"]`), text: stage.querySelector(`[data-brl="${j}"]`) })),
        arrows: [...el.querySelectorAll('[data-arrow]')],
        tethers: [...el.querySelectorAll('[data-tether]')],
        labelsPlaced: false,
      }
    },

    update(el, t, dur, params = {}) {
      if (!el._bt) bento.build(el, params, null)
      const S = el._bt
      const { g } = S
      const TL = timeline(S, dur, params)
      const { A, S0, D, F } = TL
      const picReady = !!S.pic && S.pic.complete && S.pic.naturalWidth > 0
      const docking = S.docked && picReady
      const tau = t - D

      /* --- the plane (the dock, unchanged in kind) ---------------------------------- */
      const cx = g.x + g.w / 2
      const cy = g.y + g.h / 2
      const drift = INOUT_B(seg(tau, 1.6, 2.8))
      const flat = INOUT_B(seg(tau, 2.8, 4.0))
      const P = {
        rx: 10 * (1 - flat),
        ry: lerp(-16, -13, drift) * (1 - flat),
        s: lerp(0.86, 1, flat),
        ty: -6 * drift * (1 - flat),
      }
      if (docking && tau >= 0) {
        S.plane.style.display = 'block'
        S.plane.style.opacity = op(OUT_P(seg(tau, 0, 0.7)))
        // flat and full size at the end: no transform at all, so the picture is drawn 1:1
        S.plane.style.transform =
          flat >= 1 ? 'none' : `translate3d(0, ${P.ty.toFixed(3)}px, 0) rotateX(${P.rx.toFixed(3)}deg) rotateY(${P.ry.toFixed(3)}deg) scale(${P.s.toFixed(5)})`
        /* The chrome grows in as the plane turns flat: the window's clip opens
           upward over the title bar while the bar fades in, and the tilted
           shadow becomes the take's own. */
        const clipTop = g.bar * (1 - flat)
        S.win.style.top = px(clipTop)
        S.win.style.height = px(g.h + g.bar - clipTop)
        S.bar.style.top = px(-clipTop)
        S.bar.style.opacity = op(flat)
        S.picSlot.style.top = px(g.bar - clipTop)
        /* The stage cuts everything a take draws (its shadow too) one px below the
           window, above the caption band. The slide comes down to the same line as
           the plane lands, so its last frame has the take's shadow and not a longer
           one; while tilted, the shadow runs free (a fixed cut would show as a
           line through it). The clip sits on the root, outside the perspective
           scene, so it flattens nothing. */
        S.root.style.clipPath = flat > 0 ? `inset(0 0 ${px((C.H - (g.y + g.h + 1)) * flat)} 0)` : 'none'
        const sy = lerp(40, 26, flat)
        const sb = lerp(90, 70, flat)
        /* Over the first half of the fade into the take, the take's own window (and
           its shadow) is already fading in underneath: this shadow leaves at the same
           rate, so the two never stack into a darker edge mid-seam. */
        const sa = lerp(0.18, 0.2, flat) * (1 - seg(t, dur - 0.8, dur - 0.4))
        S.win.style.boxShadow = `0 ${sy.toFixed(2)}px ${sb.toFixed(2)}px rgba(22,32,44,${sa.toFixed(4)})`
      } else {
        S.plane.style.display = 'none'
        S.root.style.clipPath = 'none'
      }

      /* --- the stage ----------------------------------------------------------------
         Rises in on bt.1 (DEC 0.6 s, 16 px); from S0 shrinks into slot 06 with its
         centre, one uniform scale, fading over the second part of the move. */
      const stIn = OUT_P(seg(t, A[0], A[0] + 0.5))
      const rise = 16 * (1 - DEC(seg(t, A[0], A[0] + 0.6)))
      const sh = INOUT_B(seg(t, S0, S0 + SHRINK))
      const stOpacity = stIn * (1 - IN_P(seg(t, S0 + 0.1, S0 + SHRINK)))
      const s6 = slotRect(5)
      const dxS = (s6.x + s6.w / 2 - (STAGE.x + STAGE.w / 2)) * sh
      const dyS = (s6.y + s6.h / 2 - (STAGE.y + STAGE.h / 2)) * sh + rise
      const scS = lerp(1, s6.w / STAGE.w, sh)
      showIf(S.stage, stOpacity)
      // shrinking, it passes over cards 05 and 06 into its slot, not under them
      S.stage.style.zIndex = sh > 0 ? '2' : ''
      S.stage.style.transform = sh > 0 || rise > 0.001 ? `translate(${dxS.toFixed(3)}px, ${dyS.toFixed(3)}px) scale(${scS.toFixed(5)})` : 'none'

      if (stOpacity > 0.001) {
        // the view on stage, and the one it is crossfading from
        let vi = 0
        for (let k = 1; k < TL.stage.length; k++) if (t >= TL.stage[k].from) vi = k
        const k = vi > 0 ? seg(t, TL.stage[vi].from, TL.stage[vi].from + XFADE) : 1
        const ctx = S.stageCtx
        if (vi > 0 && k < 1) paintPlay(S, ctx, BODY.w, BODY.h, TL.stage[vi - 1], t, { live: true })
        paintPlay(S, ctx, BODY.w, BODY.h, TL.stage[vi], t, { alpha: vi > 0 ? INOUT_B(k) : 1, live: true })

        /* the header: its step, name and line swap at the middle of the crossfade,
           out with IN-P and in with OUT-P; the From Who row stays put */
        const hv = k < 0.5 && vi > 0 ? vi - 1 : vi
        const def = STAGE_VIEWS[hv]
        const part = def.part !== undefined ? PARTS[def.part] : def
        if (S.head.key !== def.id) {
          S.head.key = def.id
          S.head.step.textContent = part.step
          S.head.step.style.display = part.step ? '' : 'none'
          S.head.name.textContent = part.name
          S.head.line.textContent = part.line
        }
        const ha = vi === 0 ? 1 : k < 0.5 ? 1 - IN_P(k * 2) : OUT_P(k * 2 - 1)
        for (const n of [S.head.step, S.head.name, S.head.line]) n.style.opacity = op(ha)

        // the rule card's brackets: drawn in after the stage lands, gone with the card
        const cardK = vi === 0 ? 1 : vi === 1 ? 1 - INOUT_B(k) : 0
        S.brackets.forEach((b, j) => {
          const a = A[0] + 0.45 + j * 0.12
          const draw = INOUT_B(seg(t, a, a + 0.5))
          b.line.style.strokeDasharray = `${b.len.toFixed(2)}`
          b.line.style.strokeDashoffset = (b.len * (1 - draw)).toFixed(2)
          b.line.style.opacity = op(cardK * (draw > 0 ? 1 : 0))
          b.text.style.opacity = op(cardK * OUT_P(seg(t, a + 0.15, a + 0.45)))
        })

        /* From Who: the three chips lift off the footage (0.3 s), fly into the
           header (DEC 0.6 s, 0.06 s apart) and stay there as its chips. Their
           landing spots are the header's own (invisible) chips, measured once. */
        if (!S.chipLay && S.chipPh[0].offsetWidth > 0) {
          const to = S.chipPh.map((n) => ({ ...offsetIn(n, S.stage), w: n.offsetWidth, h: n.offsetHeight }))
          const total = to.reduce((a, c) => a + c.w, 0) + 10 * (to.length - 1)
          let x = BODY.x + (BODY.w - total) / 2
          const y = BODY.y + BODY.h * 0.55 - to[0].h / 2
          const from = to.map((c) => {
            const r = { x, y }
            x += c.w + 10
            return r
          })
          S.chipLay = { to, from }
        }
        S.chipFly.forEach((n, j) => {
          const L = S.chipLay
          const a = F - 0.3 + j * 0.05
          const o = L ? OUT_P(seg(t, a, a + 0.25)) : 0
          showIf(n, o)
          if (!L || o <= 0.001) return
          const lift = OUT_B(seg(t, a, a + 0.3))
          const fly = DEC(seg(t, F + j * 0.06, F + j * 0.06 + FLY))
          const x = lerp(L.from[j].x, L.to[j].x, fly)
          const y = lerp(L.from[j].y + 10 * (1 - lift), L.to[j].y, fly)
          n.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`
          n.style.boxShadow = `0 8px 24px rgba(33,37,41,${(0.12 * lift * (1 - fly)).toFixed(4)})`
        })
        S.fromLabel.style.opacity = op(OUT_P(seg(t, F + 0.35, F + 0.7)))
      }

      /* --- the strip, and the flight onto the builder ----------------------------------- */
      if (docking && tau >= 0 && !S.labelsPlaced) S.labelsPlaced = placeLabels(S)
      const contentsOut = docking ? IN_P(seg(tau, 0, 0.3)) : 0
      const kins = []

      S.cards.forEach((c, i) => {
        const T = TL.cards[i]
        const n = c.node
        const kin = OUT_B(seg(t, 0.2 + i * 0.06, 0.7 + i * 0.06))
        kins.push(kin)
        const lit = INOUT_B(seg(t, T.lit, T.lit + 0.35))
        const on = T.off > T.on ? OUT_P(seg(t, T.on, T.on + 0.2)) * (1 - IN_P(seg(t, T.off - 0.15, T.off))) : 0
        const done = OUT_P(seg(t, T.done, T.done + 0.3))

        let rect = c.slot
        let opacity = kin * lerp(0.45, 1, lit)
        let radius = 12
        let edge = S.colors.edge
        let edgeW = 1
        let fill = 1
        let shadow = 1
        let pill = 0
        let transform = `translate(0px, ${((1 - kin) * 12).toFixed(3)}px)`
        let origin = '50% 50%'

        if (docking && tau >= 0) {
          if (c.dock) {
            const u = seg(tau, 0.5 + i * 0.09, 1.4 + i * 0.09)
            const k = DEC(u)
            if (u > 0) {
              const a = c.slot
              const b = c.dock
              rect = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) }
              radius = lerp(12, 8, k)
              // from no transform to the plane's own, about the same screen point
              transform = `translate3d(0, ${(k * P.ty).toFixed(3)}px, 0) rotateX(${(k * P.rx).toFixed(3)}deg) rotateY(${(k * P.ry).toFixed(3)}deg) scale(${lerp(1, P.s, k).toFixed(5)})`
              origin = `${px(cx - rect.x)} ${px(cy - rect.y)}`
              // landing: the white card becomes a 2 px orange outline over nothing
              const m = INOUT_B(seg(u, 0.6, 1))
              fill = 1 - m
              shadow = 1 - m
              edge = mix(S.colors.edge, S.colors.brand, m)
              edgeW = lerp(1, 2, m)
              pill = c.label ? OUT_P(seg(u, 0.8, 1)) : 0
            }
            // let go: outline and label leave, who first, review last
            const e = EXIT_C(seg(tau, 2.4 + i * 0.05, 2.64 + i * 0.05))
            opacity *= 1 - e
            pill *= 1 - e
          } else {
            // a part the dock picture has no rect for leaves with the contents
            opacity *= 1 - EXIT_C(seg(tau, 0.3, 0.6))
          }
        }

        n.style.visibility = opacity > 0.001 ? 'visible' : 'hidden'
        n.style.opacity = op(opacity)
        n.style.left = px(rect.x)
        n.style.top = px(rect.y)
        n.style.width = px(rect.w)
        n.style.height = px(rect.h)
        n.style.transform = transform
        n.style.transformOrigin = origin
        n.style.borderRadius = px(radius)
        n.style.borderWidth = px(edgeW)
        n.style.borderColor = rgba(edge)
        const sf = S.colors.surface
        n.style.backgroundColor = `rgba(${sf[0]},${sf[1]},${sf[2]},${fill.toFixed(4)})`
        n.style.boxShadow = `0 8px 24px rgba(33,37,41,${(0.12 * shadow).toFixed(4)})`
        c.inner.style.opacity = op(1 - contentsOut)
        showIf(c.ring, on * (1 - contentsOut))
        showIf(c.pill, pill)
        if (c.label && pill > 0.001) {
          c.pill.style.left = px(c.label.x - rect.x - edgeW)
          c.pill.style.top = px(c.label.y - rect.y - edgeW)
        }
        if (opacity <= 0.001 || contentsOut >= 1) return

        // the finished check, and Who's chosen chips in place of its line
        c.tick.style.opacity = op(done)
        c.tick.style.transform = `scale(${lerp(0.93, 1, done).toFixed(4)})`
        if (c.mini) {
          const mk = OUT_P(seg(t, T.done - 0.1, T.done + 0.25))
          c.line.style.opacity = op(1 - mk)
          c.mini.style.opacity = op(mk)
        }

        /* the picture: before its turn the segment's last frame (the part finished,
           which says more at a glance than its empty start), the footage while
           active, then the frame it stopped on */
        if (c.ctx) {
          const pl = T.p
          const tt = !pl ? t : t < pl.from ? pl.from + 1e4 : Math.min(t, T.off)
          paintPlay(S, c.ctx, THUMB.w, THUMB.h, pl, tt, { thumb: true, live: on > 0.5 && t >= pl?.from })
        }

        // Shortcuts: a pair presses (3 px, 0.12 s) and its row brightens on each key in the board footage
        if (c.p.keys) {
          const press = {}
          const glow = { move: 0, undo: 0 }
          for (const e of TL.keys) {
            const down = INOUT_B(seg(t, e.t, e.t + 0.12)) * (1 - INOUT_B(seg(t, e.t + 0.34, e.t + 0.46)))
            for (const cap of e.caps) press[cap] = Math.max(press[cap] ?? 0, down)
            glow[e.row] = Math.max(glow[e.row], OUT_P(seg(t, e.t, e.t + 0.12)) * (1 - IN_P(seg(t, e.t + 0.7, e.t + 1.0))))
          }
          for (const [cap, node] of Object.entries(c.caps)) {
            const d = press[cap] ?? 0
            node.style.transform = `translateY(${(3 * d).toFixed(3)}px)`
            // down, the cap loses its 3 px side and takes a slate tint, so the press reads at strip size
            node.style.boxShadow = `0 ${(3 * (1 - d)).toFixed(3)}px 0 var(--bt-edge), inset 0 0 0 40px ${rgba([...S.colors.ripple, 0.12 * d])}`
          }
          for (const [row, node] of Object.entries(c.rows)) node.style.opacity = op(lerp(0.78, 1, glow[row] ?? 0))
        }
      })

      /* --- the connectors: strip order, and each active card to the stage ------------- */
      const flowOut = 1 - IN_P(seg(t, S0, S0 + 0.3))
      S.arrows.forEach((a, i) => (a.style.opacity = op(Math.min(kins[i], kins[i + 1]) * (1 - contentsOut))))
      S.tethers.forEach((a, i) => {
        const T = TL.cards[i]
        let o = T.off > T.on ? OUT_P(seg(t, T.on, T.on + 0.2)) * (1 - IN_P(seg(t, T.off - 0.15, T.off))) : 0
        // Who's line stays once its chips are in the header: the rule is about them from here on
        if (i === 0) o = OUT_P(seg(t, T.on, T.on + 0.2))
        a.style.opacity = op(o * flowOut * stIn)
      })
    },
  }

  window.SLIDES3 = Object.assign(window.SLIDES3 || {}, { bento })
})()
