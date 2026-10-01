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
    const dur = seconds ?? Math.min(1.15, Math.max(0.38, 0.22 + Math.sqrt(dist) * 0.021))
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

  async function click(target, { hint = true, label, dwell = 0.12, after = 0.35, ox, oy, sfx = true, double = false } = {}) {
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
    await step(Math.round(dwell * fps))
    for (let c = 0; c < (double ? 2 : 1); c++) {
      event('click', { x: at.x, y: at.y, rect: round(r), hint, label: label ?? null })
      if (sfx) event('sfx', { sfx: 'click' })
      cursor.down = 1
      await page.mouse.down()
      inputFrames = 3
      await step(2)
      await page.mouse.up()
      cursor.down = 0
      await step(double ? 2 : 1)
    }
    await step(Math.round(after * fps))
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
    await step(Math.round(after * fps))
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
      event('sfx', { sfx: 'key' })
      inputFrames = 2
      const frames = Math.max(1, Math.round((fps / cps) * rhythm[i++ % rhythm.length]))
      await step(frames)
    }
  }

  /** A key or chord, shown on screen as keycaps. */
  async function press(combo, { show = true, label, seconds = 1.1 } = {}) {
    if (show) event('keys', { combo, label: label ?? null, dur: seconds })
    event('sfx', { sfx: 'key', gain: 1.3 })
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
    await step(Math.round(seconds * fps))
  }

  /* --- direction: everything pass two draws ------------------------------------ */
  const direct = {
    /** A subtitle. `null` clears. */
    say: (text, opts = {}) => event('caption', { text, ...opts }),
    /** Camera: frame a rect (or a locator) at a zoom, or `null` to return to the full window. */
    async focus(target, { zoom = 1.45, seconds = 1.0, pad = 40, lead = 0 } = {}) {
      const rect = target ? round(await rectOf(target)) : null
      event('focus', { rect, zoom, dur: seconds, pad, lead })
    },
    /** Dim everything except one region, with an optional label. */
    async spotlight(target, { label = null, seconds = 2.4, pad = 10, radius = 12, chime = true } = {}) {
      const rect = round(await rectOf(target))
      event('spotlight', { rect, label, dur: seconds, pad, radius })
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
    /** A floating explainer card beside the product. */
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
    get cursor() {
      return { ...cursor }
    },
    setCursor(p) {
      cursor = { ...cursor, ...p }
    },
    frame,
    stats,
    pageErrors,
    callStore,
    boot,
    beginTake,
    endTake,
    step,
    hold,
    until,
    visible,
    rectOf,
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
