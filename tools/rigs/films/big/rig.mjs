/* -----------------------------------------------------------------------------
   The camera for the big film.

   The walkthrough rig (demo2) with two things from the explainer rig (promo):
   `say(id, fn)` hands `fn` an `at(frac, beat)` so a drawn scene can advance in
   time with the words, and `st(name, ...args)` calls any stage function. The
   cursor is drawn here, not in the stage, and is hidden whenever type, a scene
   or a chapter card is up.
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

export async function open({ out, appUrl, vo, subs, frags, fast = false }) {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1,
    recordVideo: { dir: out, size: { width: W, height: H } },
  })
  await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen', '1') } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setContent(stage.html(appUrl))
  if (frags) await page.evaluate((m) => window.__st.frags(m), frags)
  await page.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), CURSOR)
  await page.evaluate(() => {
    window.__cur = (x, y) => { const c = document.getElementById('cur'); c.style.left = x + 'px'; c.style.top = y + 'px' }
    window.__rip = (x, y) => { const r = document.createElement('div'); r.className = 'rip'; r.style.left = x + 'px'; r.style.top = y + 'px'
      document.body.appendChild(r); setTimeout(() => r.remove(), 750) }
    window.__cur(1912, 1072)
  })
  const rig = new Rig(page, errors, vo, subs, fast)
  /* THE SYNC MARK. The recording starts when the context is created, which is
     a second or two before this clock does (the stage builds and the console
     loads in between), so every sound and every voice line placed at clock
     time landed EARLY in the picture — the click before the cursor pressed,
     the keystrokes before the letters. An 8px black square at the bottom-left
     corner for 240 ms, drawn the instant the clock starts, lets the mix find
     the offset in the picture itself and shift everything by it. */
  rig.t0 = Date.now()
  await page.evaluate(() => {
    const m = document.createElement('div')
    m.style.cssText = 'position:fixed;left:0;bottom:0;width:8px;height:8px;background:#000;z-index:100'
    document.body.appendChild(m); setTimeout(() => m.remove(), 240)
  })
  return { browser, ctx, page, rig, app: page.frameLocator('#app') }
}

export class Rig {
  constructor(page, errors, vo, subs, fast) {
    this.page = page; this.errors = errors; this.vo = vo; this.subs = subs; this.fast = fast
    this.t0 = Date.now()
    this.voice = []; this.events = []; this.sections = []; this._section = null
    this.missing = []; this.at = { x: 1912, y: 1072 }
  }
  t() { return (Date.now() - this.t0) / 1000 }
  async hold(ms) { await this.page.waitForTimeout(this.fast ? Math.min(ms, 90) : ms) }
  section(kind) { if (this._section) this.sections.push({ ...this._section, end: this.t() }); this._section = { start: this.t(), kind } }
  endSections() { if (this._section) { this.sections.push({ ...this._section, end: this.t() }); this._section = null } }
  sfx(type, extra = {}) { this.events.push({ type, t: this.t(), ...extra }) }

  /* --- the stage --------------------------------------------------------- */
  async st(fn, ...args) { return this.page.evaluate(([f, a]) => window.__st[f](...a), [fn, args]) }
  async sub(html) { await this.st('sub', html ?? '') }
  async url(p) { await this.st('url', p) }
  async zoom(s, ox, oy) { await this.st('zoom', s, ox, oy) }
  async ring(box, label, where) { await this.st('point', box, label, where) }
  /* Releasing a push-in waits for the window to finish zooming back out —
     in real time, whatever the pace — because a box measured mid-transition
     puts the next press somewhere else. */
  async unring() {
    await this.ring(null)
    const zoomed = await this.page.evaluate(() => !!document.getElementById('win').style.transform)
    await this.zoom(1)
    if (zoomed) await this.page.waitForTimeout(520)
  }
  async scene(name, over) { await this.st('scene', name ?? '', over) }
  async step(name, on) { await this.st('step', name, on) }
  async type(html) { await this.st('type', html ?? '') }
  async card(o) { await this.st('card', o ?? null) }
  async win(state) { await this.st('win', state) }
  async dark(on) { await this.st('dark', on) }

  /** Push in on a control, then ring it and name it. */
  async focus(loc, label, where = 'below', scale = 1.22) {
    const b0 = await loc.first().boundingBox().catch(() => null)
    if (!b0) { this.missing.push(`focus: no box for ${label ?? loc}`); return }
    const Wn = stage.WIN
    const ox = Math.max(36, Math.min(64, ((b0.x + b0.width / 2 - Wn.x) / Wn.w) * 100))
    const oy = Math.max(13, Math.min(85, ((b0.y + b0.height / 2 - Wn.y) / Wn.h) * 100))
    await this.zoom(scale, ox, oy)
    await this.hold(this.fast ? 30 : 520)
    const b = await loc.first().boundingBox().catch(() => b0)
    await this.ring(b, label, where)
  }

  /* --- the spoken line, with beats inside it ------------------------------ */
  async say(id, fn) {
    const meta = this.vo[id]
    if (!meta) { this.missing.push(`no voice: ${id}`); return fn ? fn(async () => {}) : undefined }
    const start = this.t(), d = meta.duration
    this.voice.push({ id, t: start, d })
    await this.sub(this.subs[id] ?? '')
    const at = async (frac, f) => { const w = start + d * frac - this.t(); if (w > 0) await this.hold(w * 1000); await f() }
    if (fn) await fn(at)
    const left = start + d - this.t()
    if (left > 0) await this.hold(left * 1000)
    await this.sub('')
    await this.hold(this.fast ? 50 : 200)
  }

  /* --- the hand ------------------------------------------------------------ */
  async glide(x, y, ms = 340) {
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
  async park() { await this.glide(1912, 1072, 300) }
  async pointAt(loc, left = false) {
    await loc.first().waitFor({ state: 'visible', timeout: 12000 })
    await loc.first().scrollIntoViewIfNeeded()
    /* Wait for the box to stop moving: panels here scroll smoothly, and a box
       measured mid-scroll put the press on whatever slid into that spot. */
    let b = await loc.first().boundingBox()
    for (let i = 0; i < 8; i++) {
      await this.page.waitForTimeout(80)
      const c = await loc.first().boundingBox()
      if (b && c && Math.abs(b.x - c.x) < 1 && Math.abs(b.y - c.y) < 1) { b = c; break }
      b = c
    }
    if (!b) throw new Error('no box')
    /* `left`: press near the row's left edge — a wide row whose centre is a
       disabled control swallows a press in the middle. */
    return { x: left ? b.x + Math.min(36, b.width / 4) : b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  async click(loc, { after = 240, left = false } = {}) {
    const p = await this.pointAt(loc, left)
    await this.glide(p.x, p.y)
    /* and once more after the glide, in case the target moved while the hand travelled */
    const b = await loc.first().boundingBox().catch(() => null)
    if (b) {
      const q = { x: left ? b.x + Math.min(36, b.width / 4) : b.x + b.width / 2, y: b.y + b.height / 2 }
      if (Math.abs(q.x - p.x) > 2 || Math.abs(q.y - p.y) > 2) { await this.page.mouse.move(q.x, q.y); await this.page.evaluate(([a, c]) => window.__cur(a, c), [q.x, q.y]); this.at = q; p.x = q.x; p.y = q.y }
    }
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
  async typeIn(loc, text, opts) { await this.click(loc); await this.keys(text, opts) }
  async wheel(dy, steps = 5) {
    for (let i = 0; i < steps; i++) { await this.page.mouse.wheel(0, dy / steps); await this.page.waitForTimeout(this.fast ? 6 : 45) }
    await this.hold(260)
  }
  async box(loc) { const b = await loc.first().boundingBox().catch(() => null); if (!b) this.missing.push('no box'); return b ?? { x: 0, y: 0, width: 10, height: 10 } }

  save(dir) {
    fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({
      duration: this.t(), voice: this.voice, events: this.events, sections: this.sections, missing: this.missing, errors: [...new Set(this.errors)],
    }, null, 1))
  }
}

export function newestWebm(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.webm')).map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
}
export { spawnSync }
