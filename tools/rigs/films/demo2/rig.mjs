/* -----------------------------------------------------------------------------
   The camera, for the framed cut.

   Different from the first film's harness in one structural way: the product is
   in an IFRAME on a stage, so there are two documents. The app is driven
   through `frameLocator` and everything drawn — cursor, ring, subtitle, scene —
   belongs to the stage on top. Nothing is injected into the product.

   The cursor is POSITIONED, not observed. A mousemove inside an iframe does not
   reach the parent, so a listener on the stage would lose the pointer the
   moment it crossed into the console. The film moves the real mouse and tells
   the stage where it is, in the same step.

   Coordinates need no translation: `boundingBox()` on a locator inside the
   frame already comes back in top-level page space, scale included.
   -------------------------------------------------------------------------- */
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import * as stage from './stage.mjs'

const VIDEO = decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const U = (p) => `file:///${p.replace(/ /g, '%20')}`
const require = createRequire(`${U(VIDEO)}/package.json`)
const { chromium } = require('playwright')
export const FFMPEG = require('@ffmpeg-installer/ffmpeg').path

export const W = 1920
export const H = 1080

/* The pointer, drawn on the stage. Kept out of stage.mjs so the stage stays a
   description of the SET and this stays the description of the CAMERA. */
const CURSOR = `
  <style>
    #cur { position: fixed; width: 26px; height: 26px; pointer-events: none; z-index: 60;
      filter: drop-shadow(0 3px 5px rgba(16,24,40,.4)); transform: translate(-3px,-2px); }
    .rip { position: fixed; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%;
      border: 3px solid #eb5424; pointer-events: none; z-index: 59; animation: rip .6s ease-out forwards; }
    @keyframes rip { to { width: 62px; height: 62px; margin: -31px 0 0 -31px; opacity: 0; } }
  </style>
  <svg id="cur" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15.1 L18.6 15.1 Z"
    fill="#111827" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>`

export async function open({ out, appUrl, vo, subs, fast = false }) {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: out, size: { width: W, height: H } },
  })
  /* Seeded in every document, so the product inside the frame never opens its
     own walkthrough over the film. */
  await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen', '1') } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setContent(stage.html(appUrl))
  await page.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), CURSOR)
  await page.evaluate(() => {
    window.__cur = (x, y) => { const c = document.getElementById('cur'); c.style.left = x + 'px'; c.style.top = y + 'px' }
    window.__rip = (x, y) => { const r = document.createElement('div'); r.className = 'rip'; r.style.left = x + 'px'; r.style.top = y + 'px'
      document.body.appendChild(r); setTimeout(() => r.remove(), 750) }
    window.__cur(960, 520)
  })
  const rig = new Rig(page, errors, vo, subs, fast)
  return { browser, ctx, page, rig, app: page.frameLocator('#app') }
}

export class Rig {
  constructor(page, errors, vo, subs, fast) {
    this.page = page; this.errors = errors; this.vo = vo; this.subs = subs; this.fast = fast
    this.t0 = Date.now()
    this.voice = []; this.events = []; this.sections = []; this._section = null
    this.missing = []; this.at = { x: 960, y: 520 }
  }
  t() { return (Date.now() - this.t0) / 1000 }
  async hold(ms) { await this.page.waitForTimeout(this.fast ? Math.min(ms, 90) : ms) }

  section(kind) {
    if (this._section) this.sections.push({ ...this._section, end: this.t() })
    this._section = { start: this.t(), kind }
  }
  endSections() { if (this._section) { this.sections.push({ ...this._section, end: this.t() }); this._section = null } }

  /* --- what the stage shows -------------------------------------------- */
  async sub(html) { await this.page.evaluate((h) => window.__stage.sub(h), html ?? '') }
  async scene(html) { await this.page.evaluate((h) => window.__stage.scene(h), html ?? '') }
  async url(p) { await this.page.evaluate((s) => window.__stage.url(s), p) }
  async zoom(s, ox, oy) { await this.page.evaluate(([a, b, c]) => window.__stage.zoom(a, b, c), [s, ox, oy]) }
  async ring(box, label, where) { await this.page.evaluate(([b, l, w]) => window.__stage.point(b, l, w), [box, label, where]) }
  async unring() { await this.ring(null); await this.zoom(1) }

  /** Push in on a control, then ring it and name it.

      The push is the thing that reads as "produced": the whole window scales
      toward the control, holds, and eases back on `unring`. The ring is drawn
      AFTER the push has settled and from a fresh measurement — a box measured
      before the transform lands 30px off where the control ends up. */
  async focus(loc, label, where = 'below', scale = 1.22) {
    const b0 = await loc.first().boundingBox().catch(() => null)
    if (!b0) { this.missing.push(`focus: no box for ${label ?? loc}`); return }
    /* 1.22, not 1.35, and the origin kept off the edges: at 1.35 with the
       origin at 92% the window's right edge came into frame as a hard grey
       strip and its foot slid under the subtitle band. A push-in should feel
       like the camera moving closer, never like the window being dragged. */
    const W = { x: 130, y: 26, w: 1660, h: 920 }
    /* Clamped so that at 1.22 BOTH edges of the window leave the frame: the
       right edge clears 1920 only for origins at or below 64%, the left edge
       clears 0 only at or above 36%. At 82% the far edge stayed 60px inside
       the frame and the window read as dragged, not pushed into. */
    const ox = Math.max(36, Math.min(64, ((b0.x + b0.width / 2 - W.x) / W.w) * 100))
    const oy = Math.max(13, Math.min(85, ((b0.y + b0.height / 2 - W.y) / W.h) * 100))
    await this.zoom(scale, ox, oy)
    await this.hold(this.fast ? 30 : 680)
    const b = await loc.first().boundingBox().catch(() => b0)
    await this.ring(b, label, where)
  }
  async card(html) { await this.page.evaluate((h) => window.__stage.card(h), html ?? '') }

  /* --- the spoken line -------------------------------------------------- */
  async say(id, fn) {
    const meta = this.vo[id]
    if (!meta) { this.missing.push(`no voice: ${id}`); return fn ? fn() : undefined }
    const at = this.t()
    this.voice.push({ id, t: at, d: meta.duration })
    await this.sub(this.subs[id] ?? '')
    const done = at + meta.duration
    if (fn) await fn()
    const left = done - this.t()
    if (left > 0) await this.hold(left * 1000)
    /* CLEARED when the line ends, not when the next one starts. Left up, the
       last words of a scene stayed on the band while the film cut back to the
       console and did something else under them — which is the caption sitting
       over the product the band exists to avoid. Subtitles are on while
       somebody is speaking and off in between, the way they are everywhere
       else. */
    await this.sub('')
    await this.hold(this.fast ? 50 : 300)
  }

  /* --- the hand --------------------------------------------------------- */
  async glide(x, y, ms = 500) {
    const from = this.at
    const n = Math.max(6, Math.round(ms / 16))
    for (let i = 1; i <= n; i++) {
      const t = i / n
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const cx = from.x + (x - from.x) * e, cy = from.y + (y - from.y) * e
      await this.page.mouse.move(cx, cy)
      await this.page.evaluate(([a, b]) => window.__cur(a, b), [cx, cy])
      await this.page.waitForTimeout(this.fast ? 1 : ms / n)
    }
    this.at = { x, y }
  }

  async point(loc) {
    await loc.first().waitFor({ state: 'visible', timeout: 12000 })
    await loc.first().scrollIntoViewIfNeeded()
    await this.page.waitForTimeout(220)
    const b = await loc.first().boundingBox()
    if (!b) throw new Error('no box')
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }

  async click(loc, { after = 420 } = {}) {
    const p = await this.point(loc)
    await this.glide(p.x, p.y)
    await this.page.waitForTimeout(90)
    this.events.push({ type: 'click', t: this.t(), pan: Math.max(-0.35, Math.min(0.35, (p.x / W - 0.5) * 0.7)) })
    await this.page.evaluate(([a, b]) => window.__rip(a, b), [p.x, p.y])
    await this.page.mouse.down(); await this.page.waitForTimeout(60); await this.page.mouse.up()
    await this.hold(after)
  }

  async keys(text, { delay = 52 } = {}) {
    const t = this.t()
    await this.page.keyboard.type(text, { delay: this.fast ? 1 : delay })
    const per = (this.t() - t) / Math.max(1, text.length)
    for (let i = 0; i < text.length; i++) this.events.push({ type: 'mxblue', t: t + per * i, key: text[i] })
    await this.hold(200)
  }
  async press(key) { this.events.push({ type: 'mxblue', t: this.t(), key }); await this.page.keyboard.press(key); await this.hold(140) }
  async type(loc, text, opts) { await this.click(loc); await this.keys(text, opts) }
  async wheel(dy, steps = 5) {
    for (let i = 0; i < steps; i++) { await this.page.mouse.wheel(0, dy / steps); await this.page.waitForTimeout(this.fast ? 6 : 45) }
    await this.hold(260)
  }

  save(dir) {
    fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({
      duration: this.t(), voice: this.voice, events: this.events,
      sections: this.sections, missing: this.missing, errors: [...new Set(this.errors)],
    }, null, 1))
  }
}

export function newestWebm(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.webm')).map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
}

export { spawnSync }
