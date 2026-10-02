/* -----------------------------------------------------------------------------
   The recorder — drives the real application and films it one frame at a time.

   Pass one of two. This pass produces no video: it produces PICTURES of the app
   (2880×1800, one per frame that changed) and a TIMELINE that says, for every
   frame, which picture to show, where the cursor is and whether it is pressed,
   plus every caption, click, camera move and spotlight the storyboard asked for.
   The compositor (pass two) turns that into the film.

   Why split it: the cursor, the camera, captions, spotlights and every
   transition are drawn in pass two, so they can be restyled, retimed and
   re-rendered in minutes without driving the app again — and the app pictures
   stay clean, with nothing painted over the product that could shift its
   layout or catch a click.

   The clock: see virtual-time.js. Every `step()` moves the app's clock forward
   exactly one frame, so a spring that takes 400ms takes 12 frames at 30fps no
   matter how long the screenshots take.
   -------------------------------------------------------------------------- */
import { chromium } from 'playwright'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const VIEW = { width: 1440, height: 900 }

/** When a voice line's last word ends (seconds from the clip start). */
export const spokenEnd = (m) => {
  const w = m.words && m.words.length ? m.words[m.words.length - 1] : null
  return w ? Math.min(m.duration, w.t + w.dur + 0.05) : m.duration
}

const HERE = path.dirname(fileURLToPath(import.meta.url))

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export async function openRecorder({
  appUrl,
  outDir,
  fps = 30,
  dsf = 2,
  quality = 90,
  headless = true,
  storage = {},
  css = '',
  /** Voice-over metadata by line id (lib/vo.mjs loadVO): say(id) paces to it. */
  vo = new Map(),
  log = (...a) => console.log(...a),
}) {
  const shim = await readFile(path.join(HERE, 'virtual-time.js'), 'utf8')
  const browser = await chromium.launch({
    channel: 'chrome',
    headless,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'],
  })
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: dsf,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    locale: 'en-US',
  })
  await ctx.addInitScript({ content: shim })
  await ctx.addInitScript(({ entries, css }) => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v)
    } catch {}
    /* The native caret blinks on a real-time timer nothing here can step, so
       it would flicker at random between frames. Typed text arriving a letter
       at a time says the same thing. */
    const style = () => {
      const s = document.createElement('style')
      s.id = 'rec-style'
      s.textContent = '*,*::before,*::after{caret-color:transparent!important}' + css
      document.documentElement.appendChild(s)
    }
    if (document.documentElement) style()
    else document.addEventListener('DOMContentLoaded', style)
  }, { entries: storage, css })

  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)))
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push('[console] ' + m.text().slice(0, 300))
  })
  const cdp = await ctx.newCDPSession(page)

  const imgDir = path.join(outDir, 'img')
  await mkdir(imgDir, { recursive: true })
  const known = new Set()

  const dt = 1000 / fps
  let take = null
  let cursor = { x: VIEW.width * 0.62, y: VIEW.height * 0.58, down: 0 }
  let inputFrames = 0
  let lastImg = null
  let dry = false
  let pace = 1 // < 1 hurries glides, dwells, holds and typing (used while the card's picture is frozen)
  /** the frame at which the line being spoken ends — settle() waits for it */
  let talkUntil = 0
  /** where the mascot was last put, so a mascot click can hop back */
  let lastMascot = null
  /** the thing being explained right now — the thought cloud keeps off it */
  let avoidRect = null
  /* The element the compositor masks to (the rule card in the card take),
     measured every frame while set: `{ sel, clip }`, and the box last emitted
     so a frame in which it has not moved emits nothing. */
  let tracker = null
  let trackLast = null
  const stats = { shots: 0, reused: 0, skipped: 0, written: 0 }

  async function shoot() {
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality,
      optimizeForSpeed: true,
      clip: { x: 0, y: 0, width: VIEW.width, height: VIEW.height, scale: dsf },
    })
    stats.shots++
    const id = createHash('sha1').update(data).digest('hex').slice(0, 16)
    if (!known.has(id)) {
      known.add(id)
      const file = path.join(imgDir, `${id}.jpg`)
      try {
        await access(file)
      } catch {
        await writeFile(file, Buffer.from(data, 'base64'))
        stats.written++
      }
    }
    return id
  }

  /** Advance the app's clock one frame and record it. */
  async function step(n = 1) {
    for (let k = 0; k < n; k++) {
      const dirty = await page.evaluate(async (ms) => {
        await window.__vt.advance(ms)
        return window.__vt.takeDirty()
      }, dt)
      if (dry) continue
      // before the frame is pushed, so the event's f indexes the frame being recorded
      if (tracker) await trackFrame()
      let id = lastImg
      if (dirty || inputFrames > 0 || !lastImg) {
        id = await shoot()
        if (id === lastImg) stats.reused++
      } else {
        stats.skipped++
      }
      if (inputFrames > 0) inputFrames--
      lastImg = id
      take.frames.push([id, Math.round(cursor.x * 10) / 10, Math.round(cursor.y * 10) / 10, cursor.down])
    }
  }

  const frame = () => (take ? take.frames.length : 0)
  const event = (type, data = {}) => {
    if (!take || dry) return
    take.events.push({ f: frame(), type, ...data })
  }

  /* One bare evaluate — not rectOf, which waits (and steps frames) for
     visibility. The first match's box in app CSS px, cut to the clip element
     (the stage by default) so a card half under the panel is measured as what
     is actually on screen; values to 0.1 px. Emitted only when it moved by more
     than half a pixel in any dimension since the last emission. */
  async function trackFrame() {
    const r = await page.evaluate(
      ([sel, clipSel]) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const b = el.getBoundingClientRect()
        const c = clipSel ? document.querySelector(clipSel) : null
        const k = c ? c.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
        const left = Math.max(b.left, k.left)
        const top = Math.max(b.top, k.top)
        const right = Math.min(b.right, k.right)
        const bottom = Math.min(b.bottom, k.bottom)
        const q = (v) => Math.round(v * 10) / 10
        return { x: q(left), y: q(top), width: q(Math.max(0, right - left)), height: q(Math.max(0, bottom - top)) }
      },
      [tracker.sel, tracker.clip],
    )
    if (!r) return
    const l = trackLast
    const moved = !l || ['x', 'y', 'width', 'height'].some((k) => Math.abs(r[k] - l[k]) > 0.5)
    if (!moved) return
    trackLast = r
    event('cardRect', { rect: r })
  }

  /* --- targets ---------------------------------------------------------------- */
  /* The part of an element somebody can actually see.

     An element's box can run under a clipping ancestor — a card half off the
     board's stage, a template card below a scrolling sheet's fold — and a
     spotlight or a camera move framed on the full box lands on whatever is
     drawn over the hidden half. So the box is cut to every ancestor that clips
     (overflow hidden/clip/auto/scroll) and to the viewport. `raw` returns the
     uncut box, which is what a scroll calculation needs. */
  async function rectOf(target, { raw = false } = {}) {
    if (!target) return null
    if (typeof target === 'object' && 'width' in target && 'x' in target && !('boundingBox' in target)) return target
    const loc = typeof target === 'string' ? page.locator(target) : target
    const first = loc.first()
    // time passes while we wait, as it would for somebody watching the screen
    await until(() => first.isVisible(), { seconds: 6, label: String(target) })
    const r = await first.evaluate((el, uncut) => {
      const b = el.getBoundingClientRect()
      let left = b.left
      let top = b.top
      let right = b.right
      let bottom = b.bottom
      if (!uncut) {
        /* Only ancestors in the containing-block chain clip. A fixed element
           (a dialog, a portalled picker) escapes every overflow above it, and
           an absolutely positioned one escapes non-positioned ancestors until
           its containing block. Without this, the Who dialog — rendered inside
           the Inspector's scroller but position:fixed — measured as clipped to
           nothing. */
        let mode = getComputedStyle(el).position
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (mode === 'fixed') break
          const cs = getComputedStyle(p)
          const containing =
            cs.position !== 'static' || cs.transform !== 'none' || cs.filter !== 'none' || /paint|layout|strict|content/.test(cs.contain)
          if (mode === 'absolute' && !containing) continue
          if (/(hidden|clip|auto|scroll)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
            const c = p.getBoundingClientRect()
            left = Math.max(left, c.left)
            top = Math.max(top, c.top)
            right = Math.min(right, c.right)
            bottom = Math.min(bottom, c.bottom)
          }
          mode = cs.position === 'fixed' || cs.position === 'absolute' ? cs.position : 'static'
        }
        left = Math.max(left, 0)
        top = Math.max(top, 0)
        right = Math.min(right, innerWidth)
        bottom = Math.min(bottom, innerHeight)
      }
      return { x: left, y: top, width: right - left, height: bottom - top }
    }, raw)
    if (!r || r.width < 1 || r.height < 1) throw new Error(`${String(target)} has no visible area`)
    return r
  }
  /* Every match, in DOM order, each measured exactly as rectOf measures one —
     the who rows or the then rows of a card come as a pair, and the card
     lighting cuts one hole per box. Waits, as rectOf does, for the first match
     to be on screen, so a selector that matches nothing fails loudly rather
     than quietly returning []. */
  async function rectsOf(target) {
    if (!target) return []
    const loc = typeof target === 'string' ? page.locator(target) : target
    await until(() => loc.first().isVisible(), { seconds: 6, label: String(target) })
    const n = await loc.count()
    const out = []
    for (let i = 0; i < n; i++) out.push(await rectOf(loc.nth(i)))
    return out
  }
  const round = (r) => r && { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
  const centre = (r, ox = 0.5, oy = 0.5) => ({ x: r.x + r.width * ox, y: r.y + r.height * oy })

  /** Step frames until `test()` is true, or give up after `seconds`. */
  async function until(test, { seconds = 4, label = 'condition' } = {}) {
    const max = Math.ceil(seconds * fps)
    for (let i = 0; i < max; i++) {
      if (await test().catch(() => false)) return true
      await step(1)
    }
    throw new Error(`timed out waiting for ${label}`)
  }
  const visible = (loc, opts = {}) => until(() => loc.first().isVisible(), { label: String(loc), ...opts })

  /* --- the cursor --------------------------------------------------------------

     A gentle arc rather than a straight line, eased at both ends, and a
     duration that grows with distance but not in proportion to it — people
     cover a long way faster per pixel than a short one. */
  async function moveTo(target, { seconds, ox = 0.5, oy = 0.5, arc = 0.08 } = {}) {
    const r = await rectOf(target)
    const to = centre(r, ox, oy)
    if (to.x < 0 || to.y < 0 || to.x > VIEW.width || to.y > VIEW.height)
      throw new Error(`${String(target)} is off screen at (${Math.round(to.x)}, ${Math.round(to.y)})`)
    await glide(to, { seconds, arc })
    return r
  }
  async function glide(to, { seconds, arc = 0.08 } = {}) {
    const from = { x: cursor.x, y: cursor.y }
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    if (dist < 1) return
    const dur = (seconds ?? Math.min(1.15, Math.max(0.38, 0.22 + Math.sqrt(dist) * 0.021))) * pace
    const n = dry ? 1 : Math.max(2, Math.round(dur * fps))
    const nx = -(to.y - from.y) / (dist || 1)
    const ny = (to.x - from.x) / (dist || 1)
    const bend = dist * arc
    for (let i = 1; i <= n; i++) {
      const t = ease(i / n)
      const b = Math.sin(Math.PI * t) * bend
      cursor.x = from.x + (to.x - from.x) * t + nx * b
      cursor.y = from.y + (to.y - from.y) * t + ny * b
      await page.mouse.move(cursor.x, cursor.y)
      inputFrames = Math.max(inputFrames, 2)
      await step(1)
    }
  }

  /* The orange was cut from the film; a click "by the mascot" is an ordinary click. */
  const MASCOT_ON = false
  async function click(target, { hint = true, label, dwell = 0.12, after = 0.35, ox, oy, sfx = true, double = false, by = null } = {}) {
    if (by === 'mascot' && MASCOT_ON) return mascotClick(target, { hint, label, after, ox, oy })
    const r = await moveTo(target, { ox, oy })
    const at = { x: cursor.x, y: cursor.y }
    /* Would this click land on the thing it is aimed at? A card below the fold
       of a scrolling panel still reports a box and still "is visible", so
       without this a click can quietly hit whatever covers that point — and
       the take carries on filming the wrong screen. */
    if (target && typeof target === 'object' && typeof target.first === 'function') {
      const hit = await target.first().evaluate((node, pt) => {
        const el = document.elementFromPoint(pt.x, pt.y)
        const name = el ? String(el.getAttribute('aria-label') || el.className || el.tagName).slice(0, 80) : 'nothing'
        return { ok: !!el && (node === el || node.contains(el)), name }
      }, at)
      if (!hit.ok) throw new Error(`click would miss ${String(target)}: at (${Math.round(at.x)}, ${Math.round(at.y)}) the page has "${hit.name}"`)
    }
    await step(Math.round(dwell * pace * fps))
    for (let c = 0; c < (double ? 2 : 1); c++) {
      event('click', { x: at.x, y: at.y, rect: round(r), hint, label: label ?? null })
      if (sfx) event('sfx', { sfx: 'click', pan: (at.x / VIEW.width - 0.5) * 0.7 })
      cursor.down = 1
      await page.mouse.down()
      inputFrames = 3
      await step(2)
      await page.mouse.up()
      cursor.down = 0
      await step(double ? 2 : 1)
    }
    await step(Math.round(after * pace * fps))
    return r
  }

  /* The mascot presses the control: it jumps from wherever it stands, lands on
     the click frame exactly at the point, the click fires, and it hops back.
     The recorded cursor stays where it was — the compositor hides it while the
     mascot is in the air — but the page still gets a real click. */
  async function mascotClick(target, { hint = true, label, after = 0.35, ox = 0.5, oy = 0.5 } = {}) {
    const r = await rectOf(target)
    const at = centre(r, ox, oy)
    if (target && typeof target === 'object' && typeof target.first === 'function') {
      const hit = await target.first().evaluate((node, pt) => {
        const el = document.elementFromPoint(pt.x, pt.y)
        return !!el && (node === el || node.contains(el))
      }, at)
      if (!hit) throw new Error(`mascot click would miss ${String(target)} at (${Math.round(at.x)}, ${Math.round(at.y)})`)
    }
    const flight = 0.6
    const base = lastMascot ?? { size: 300, face: null }
    event('mascot', { pose: 'jump', anchor: { x: at.x, y: at.y, width: 0, height: 0 }, place: 'on', size: base.size, face: base.face, seconds: flight })
    event('sfx', { sfx: 'boing', gain: 0.8 })
    await step(Math.round(flight * fps))
    event('click', { x: at.x, y: at.y, rect: round(r), hint, label: label ?? null, by: 'mascot' })
    event('sfx', { sfx: 'click', pan: (at.x / VIEW.width - 0.5) * 0.7 })
    event('sfx', { sfx: 'land', gain: 0.9 })
    await page.mouse.click(at.x, at.y)
    inputFrames = 3
    await step(Math.round(0.35 * fps))
    if (lastMascot) {
      event('mascot', { ...lastMascot, emote: null, seconds: 0.55 })
      event('sfx', { sfx: 'boing', gain: 0.5 })
    }
    await step(Math.round(after * pace * fps))
    return r
  }

  async function hover(target, { seconds = 0.8, ox, oy } = {}) {
    const r = await moveTo(target, { ox, oy })
    await hold(seconds)
    return r
  }

  /* A native <select>. Its dropdown is drawn by the operating system and never
     reaches a screenshot, so the click is drawn and the value is set directly —
     what the viewer sees is the pointer choosing and the control changing. */
  async function select(target, value, { after = 0.5, label } = {}) {
    const r = await moveTo(target)
    await step(Math.round(0.12 * fps))
    event('click', { x: cursor.x, y: cursor.y, rect: round(r), hint: true, label: label ?? null })
    event('sfx', { sfx: 'click' })
    cursor.down = 1
    await step(2)
    cursor.down = 0
    await target.first().selectOption(value)
    inputFrames = 3
    await step(Math.round(after * pace * fps))
  }

  /* Wheel a scrolling container until `target` sits `offset` px under its top
     edge — a scroll the viewer can follow, not a jump. */
  async function scrollTo(container, target, { offset = 24, seconds = 0.7 } = {}) {
    const c = await rectOf(container)
    // uncut: the target is often wholly below the fold, which is why we scroll
    const t = await rectOf(target, { raw: true })
    const dy = t.y - (c.y + offset)
    if (Math.abs(dy) < 4) return
    await wheel(dy, { at: { x: c.x + c.width / 2, y: c.y + Math.min(c.height / 2, 260) }, seconds })
    await step(Math.round(0.15 * fps))
  }

  async function drag(from, to, { seconds = 0.9, holdBefore = 0.25, holdAfter = 0.3 } = {}) {
    const a = from.x !== undefined && from.width === undefined ? from : centre(await rectOf(from))
    await glide(a)
    await step(Math.round(0.1 * fps))
    cursor.down = 1
    event('drag', { x: a.x, y: a.y })
    await page.mouse.down()
    inputFrames = 3
    await step(Math.round(holdBefore * fps))
    const b = to.x !== undefined && to.width === undefined ? to : centre(await rectOf(to))
    // a drag is a slow, straight-ish move, in several small pointermoves
    const n = Math.max(6, Math.round(seconds * fps))
    const start = { x: cursor.x, y: cursor.y }
    for (let i = 1; i <= n; i++) {
      const t = ease(i / n)
      cursor.x = start.x + (b.x - start.x) * t
      cursor.y = start.y + (b.y - start.y) * t
      await page.mouse.move(cursor.x, cursor.y)
      inputFrames = 3
      await step(1)
    }
    await step(Math.round(holdAfter * fps))
    await page.mouse.up()
    cursor.down = 0
    event('drop', { x: cursor.x, y: cursor.y })
    await step(Math.round(0.2 * fps))
  }

  /** Typed a character at a time, at a human rate with a little rhythm. */
  async function type(text, { cps = 16 } = {}) {
    const rhythm = [1, 0.8, 1.25, 0.9, 1.1, 0.7, 1.35, 1]
    let i = 0
    for (const ch of text) {
      await page.keyboard.type(ch)
      event('key', { key: ch })
      event('sfx', { sfx: 'mxblue', key: ch })
      inputFrames = 2
      const frames = Math.max(1, Math.round((fps / cps) * rhythm[i++ % rhythm.length] * pace))
      await step(frames)
    }
  }

  /** A key or chord. The on-screen keyboard lights it; `show: false` keeps it silent on screen (housekeeping keys). */
  async function press(combo, { show = true, label, seconds = 1.1 } = {}) {
    if (show) event('key', { key: combo, label: label ?? null, dur: seconds })
    event('sfx', { sfx: 'mxblue', key: combo, gain: 1.1 })
    await page.keyboard.press(combo)
    inputFrames = 3
    await step(2)
  }

  async function wheel(dy, { at, seconds = 0.6, ctrl = false, dx = 0 } = {}) {
    if (at) await glide(at.x !== undefined && at.width === undefined ? at : centre(await rectOf(at)))
    if (ctrl) await page.keyboard.down('Control')
    const n = Math.max(3, Math.round(seconds * fps))
    for (let i = 0; i < n; i++) {
      await page.mouse.wheel(dx / n, dy / n)
      inputFrames = 3
      await step(1)
    }
    if (ctrl) await page.keyboard.up('Control')
  }

  async function hold(seconds) {
    if (dry) return step(Math.min(Math.round(seconds * fps), 6))
    await step(Math.round(seconds * pace * fps))
  }

  /* --- direction: everything pass two draws ------------------------------------ */
  const direct = {
    /** A spoken line by id (paced to its voice-over), or plain text as a fallback. `null` clears. */
    say: (idOrText, { avoid = null, ...rest } = {}) => {
      if (idOrText === null) {
        event('caption', { text: null })
        return 0
      }
      const m = vo.get(idOrText)
      const text = m ? m.text : String(idOrText)
      /* Paced to the last spoken word, not the clip: the service pads every
         clip with ~0.8 s of silence, which across fifty lines is a minute of
         dead air. The wav keeps its tail; only the beat's pace ignores it. */
      const dur = m ? spokenEnd(m) + 0.3 : Math.max(1.2, text.length / 15)
      const av = avoid ?? avoidRect
      event('caption', { id: m ? idOrText : null, text, dur, ...(av ? { avoid: av } : {}), ...rest })
      talkUntil = frame() + Math.round(dur * fps)
      return dur
    },
    /** Keep the cloud off this target (a dialog, the panel) for every line until cleared with null.
        A line already being spoken adopts it too — it usually started a beat before the dialog opened. */
    async setAvoid(target) {
      avoidRect = target ? round(await rectOf(target)) : null
      if (avoidRect && take && !dry && frame() < talkUntil) {
        const caps = take.events.filter((e) => e.type === 'caption' && e.text)
        const last = caps[caps.length - 1]
        if (last && !last.avoid) last.avoid = avoidRect
      }
    },
    /** Step until the line being spoken has ended, plus a breath. */
    async settle(extra = 0.35) {
      const target = talkUntil + Math.round(extra * fps)
      if (dry) return step(Math.min(6, Math.max(1, target - frame())))
      while (frame() < target) await step(1)
    },
    /** Seconds from a line's start to the onset of its first word matching `re`,
        so an event can land on the word that names it. The word texts carry no
        punctuation. 0, with a warning, when the line or the word is unknown —
        the beat then fires at once rather than never. */
    wordTime(id, re) {
      const m = vo.get(id)
      const w = m && m.words ? m.words.find((x) => re.test(x.text)) : undefined
      if (!w) {
        console.warn(`wordTime: ${m ? `no word matching ${re} in` : 'no voice-over for'} "${id}" — using 0`)
        return 0
      }
      return w.t
    },
    /** Put the mascot somewhere: a pose beside/on/inside a target (locator, rect or point). */
    async mascot(pose, { at = null, place = 'inside-br', size = 300, face = null, seconds = 0.6, emote = null, screen, toward = null } = {}) {
      if (!MASCOT_ON) return null
      let anchor
      if (!at) anchor = { x: 0, y: 0, width: VIEW.width, height: VIEW.height }
      else if (typeof at === 'object' && 'x' in at && !('width' in at) && !('boundingBox' in at)) anchor = { x: at.x, y: at.y, width: 0, height: 0 }
      else anchor = round(await rectOf(at))
      const tw = toward ? round(await rectOf(toward)) : null
      const data = { pose, anchor, place, size, face, seconds, emote, toward: tw }
      if (screen !== undefined) data.screen = screen
      event('mascot', data)
      if (pose !== 'jump' && pose !== 'hide') lastMascot = { ...data, emote: null }
      if (pose === 'hide') lastMascot = null
      return anchor
    },
    /** A small glyph pops above the mascot's head: ! ? ✓ ♪ sparkle heart */
    emote: (glyph) => (MASCOT_ON ? event('emote', { glyph }) : undefined),
    /** What the mascot's phone shows: allow | mfa | deny | null */
    screen: (state) => (MASCOT_ON ? event('screen', { screen: state }) : undefined),
    /** Camera: frame a rect (or a locator) at a zoom, or `null` to return to the full window. */
    async focus(target, { zoom = 1.45, seconds = 1.0, pad = 40, lead = 0 } = {}) {
      const rect = target ? round(await rectOf(target)) : null
      event('focus', { rect, zoom, dur: seconds, pad, lead })
    },
    /** Dim everything except one region, with an optional label. `cam: false` keeps
        the camera at rest — under the explainer shelf the camera's auto-zoom would
        push the picture past the frame — and is written into the event only then. */
    async spotlight(target, { label = null, seconds = 2.4, pad = 10, radius = 12, chime = true, cam } = {}) {
      const rect = round(await rectOf(target))
      event('spotlight', { rect, label, dur: seconds, pad, radius, ...(cam === false ? { cam: false } : {}) })
      if (chime) event('sfx', { sfx: 'chime' })
      return rect
    },
    /** A labelled arrow pointing at a region. */
    async callout(target, { text, side = 'top', seconds = 2.2 } = {}) {
      const rect = round(await rectOf(target))
      event('callout', { rect, text, side, dur: seconds })
      event('sfx', { sfx: 'pop' })
      return rect
    },
    /** A floating explainer beside the product, for the line being spoken. `dur`
        defaults to the rest of the current line plus a breath (talkUntil is the
        frame where say() said the line ends) and never under 2.5 s; the
        compositor takes the inset off at that time. */
    async explain(id, { side = 'left', seconds } = {}) {
      const dur = seconds ?? Math.max(2.5, (talkUntil - frame()) / fps + 0.3)
      event('explain', { id, side, dur })
      return dur
    },
    /** A floating explainer card beside the product (the older note overlay). */
    note: (data) => event('note', data),
    sfx: (sfx, opts = {}) => event('sfx', { sfx, ...opts }),
    mark: (type, data = {}) => event(type, data),
  }

  /* --- the store -----------------------------------------------------------------

     The console ships locked to its Lite edition and the Lite/Full switch is
     commented out of the shell, so there is no control to press. The store's
     `setEdition` is still wired, though — it sits on the context value of the
     BrandProvider — so the recorder finds that value by walking React's fiber
     tree from the root and calls it. Nothing in the product changes; this is the
     same thing the hidden switch would do. */
  async function callStore(method, ...args) {
    return page.evaluate(
      ([name, params]) => {
        const root = document.getElementById('root')
        const key = root && Object.keys(root).find((k) => k.startsWith('__reactContainer$'))
        if (!key) return { ok: false, why: 'no react root' }
        /* The container holds the HostRoot fiber as it was at createRoot —
           after the first commit that is usually the stale alternate, with no
           children. The live tree hangs off its FiberRoot. */
        const host = root[key]
        const stack = [host && host.stateNode && host.stateNode.current ? host.stateNode.current : host]
        let seen = 0
        while (stack.length && seen < 500000) {
          const f = stack.pop()
          seen++
          if (!f) continue
          const v = f.memoizedProps && f.memoizedProps.value
          if (v && typeof v === 'object' && typeof v[name] === 'function' && 'features' in v) {
            v[name](...params)
            return { ok: true, edition: v.edition }
          }
          if (f.sibling) stack.push(f.sibling)
          if (f.child) stack.push(f.child)
        }
        return { ok: false, why: `no store method ${name}` }
      },
      [method, args],
    )
  }

  /* --- lifecycle ------------------------------------------------------------------ */
  async function boot(readyLocator, { settle = 900 } = {}) {
    await page.goto(appUrl, { waitUntil: 'load' })
    await page.evaluate(() => window.__vt.freeRun(true))
    await readyLocator(page).first().waitFor({ state: 'visible', timeout: 30000 })
    // lazy screens prefetch on idle; let that finish before anything is filmed
    await page.waitForTimeout(settle)
    await page.evaluate(() => window.__vt.freeRun(false))
    await page.mouse.move(cursor.x, cursor.y)
    // settle whatever the boot left moving
    const was = dry
    dry = true
    await step(20)
    dry = was
  }

  function beginTake(name) {
    take = { name, fps, dsf, view: VIEW, frames: [], events: [], startedAt: Date.now() }
    lastImg = null
    talkUntil = 0
    trackLast = null
    // the mascot carries over between takes: restate where it is at frame 0
    if (lastMascot && !dry) take.events.push({ f: 0, type: 'mascot', ...lastMascot, seconds: 0 })
    log(`\n▶ take ${name}${dry ? ' (dry)' : ''}`)
  }

  async function endTake() {
    if (!take) return null
    const t = take
    take = null
    if (dry) return null
    const file = path.join(outDir, `take-${t.name}.json`)
    const payload = {
      name: t.name,
      fps: t.fps,
      dsf: t.dsf,
      view: t.view,
      cursorEnd: { ...cursor },
      frames: t.frames,
      events: t.events,
    }
    await writeFile(file, JSON.stringify(payload))
    const secs = (t.frames.length / fps).toFixed(1)
    log(`■ take ${t.name}: ${t.frames.length} frames (${secs}s) in ${((Date.now() - t.startedAt) / 1000).toFixed(0)}s · shots ${stats.shots} written ${stats.written} skipped ${stats.skipped}`)
    return payload
  }

  /* --- the card tracker ------------------------------------------------------------

     The card take films the whole window but the compositor shows only the
     rule card, enlarged and masked to its box. The box moves as the card grows
     (a layout spring, a few hundred ms), so it is measured every frame while a
     selector is tracked and written into the take as `cardRect` events. */

  /** Measure the first element matching `selector` (cut to `clip`) every frame; `null` stops. */
  function track(selector, clip = '.bb__stage') {
    tracker = selector ? { sel: String(selector), clip: clip ? String(clip) : null } : null
    trackLast = null
  }

  /** Throw away everything recorded so far in the current take; the next step() starts it afresh. */
  function cut() {
    if (!take) return
    take.frames = []
    take.events = []
    lastImg = null
    trackLast = null
    talkUntil = frame()
  }

  /** Tell the compositor whether it is on the card (masked, enlarged) or the whole window. */
  function cardMode(on) {
    event('cardMode', { on: !!on })
  }
  /** Show the AND / OR brackets and the truth table beside the card (card mode only).
      `stage` 'and' brings the outer bracket, the AND label, the card's shift and the
      panel; 'both' adds the inner bracket and the OR label. Off eases everything down. */
  function cardAnno(on, stage = 'both') {
    event('cardAnno', { on: !!on, stage })
  }
  /** Light one part of the card behind a veil, its label beside it:
      'title' | 'who' | 'cond' | 'group' | 'then'; 'parts' shows the three labels
      alone with no veil; null clears. */
  function cardLight(part) {
    event('cardLight', { part })
  }
  /** Light rows 1..rows of the truth table beside the card (0 clears). */
  function truthStep(rows) {
    event('truthStep', { rows })
  }
  /** Where the card's parts are (app px), keyed by part name — title, who, cond,
      first, group, block, then. A value is a Rect or, for a part drawn as more
      than one row (who, then), a Rect[]; passed through exactly as measured. */
  function cardParts(parts) {
    event('cardParts', { parts })
  }
  /** Hold the card's picture (a dialog or popover is about to cover it); off = crossfade back to live. */
  function cardFreeze(on) {
    event('cardFreeze', { on: !!on })
    // nobody sees the panel while the card is frozen, so the work there can hurry
    pace = on ? 0.3 : 1
  }

  return {
    page,
    cdp,
    fps,
    get dry() {
      return dry
    },
    set dry(v) {
      dry = !!v
    },
    /** Time multiplier for glides, dwells, holds and typing (1 = as written). */
    get pace() {
      return pace
    },
    set pace(v) {
      pace = Math.max(0.1, Number(v) || 1)
    },
    get cursor() {
      return { ...cursor }
    },
    setCursor(p) {
      cursor = { ...cursor, ...p }
    },
    frame,
    stats,
    pageErrors,
    vo,
    callStore,
    boot,
    beginTake,
    endTake,
    track,
    cut,
    cardMode,
    cardFreeze,
    cardAnno,
    cardLight,
    truthStep,
    cardParts,
    step,
    hold,
    until,
    visible,
    rectOf,
    rectsOf,
    moveTo,
    glide,
    click,
    hover,
    select,
    scrollTo,
    drag,
    type,
    press,
    wheel,
    ...direct,
    async close() {
      await browser.close()
    },
  }
}
