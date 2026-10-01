/* -----------------------------------------------------------------------------
   The camera for the third cut.

   What changed from the big film's rig:
   - THE PICTURE. Playwright's recordVideo encodes VP8 at 1 Mbit/s, which is
     why every console shot of the last cut was soft. This rig takes Chrome's
     own screencast (JPEG q92, every frame) with each frame's timestamp, and
     mix3.mjs assembles them at 30 fps with x264. Timestamps share the rig's
     clock, so there is no sync mark to hunt for.
   - THE CAMERA. `look()` moves the console camera (a clamped push-in that
     never shows the window's edge) instead of a ring and a label.
   - `say(id, fn, { cap: false })` for kinetic-type shots whose words are
     already on screen.
   -------------------------------------------------------------------------- */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

import * as stage from './stage3.mjs'

const VIDEO = decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const U = (p) => `file:///${p.replace(/ /g, '%20')}`
const require = createRequire(`${U(VIDEO)}/package.json`)
const { chromium } = require('playwright')
export const FFMPEG = require('@ffmpeg-installer/ffmpeg').path
export const W = 1920, H = 1080

const CURSOR = `
  <style>
    #cur { position: fixed; left: 0; top: 0; width: 34px; height: 34px; pointer-events: none; z-index: 80; margin: -3px 0 0 -4px;
      filter: drop-shadow(0 4px 8px rgba(16,24,40,.35)); transform: translate3d(1960px,1100px,0); will-change: transform;
      transition: opacity .3s, transform var(--gd, 0ms) cubic-bezier(.45,0,.2,1); }
    body.nocur #cur { opacity: 0; }
    .rip { position: fixed; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; background: rgba(235,84,36,.25);
      border: 2px solid rgba(235,84,36,.9); pointer-events: none; z-index: 79; animation: rip .55s ease-out forwards; }
    @keyframes rip { to { width: 64px; height: 64px; margin: -32px 0 0 -32px; opacity: 0; } }
  </style>
  <svg id="cur" viewBox="0 0 26 26"><path d="M4 2.5 L4 21 L9 16.6 L12.3 24 L15.6 22.6 L12.4 15.4 L19.2 15.4 Z"
    fill="#0f1623" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`

export async function open({ out, appUrl, vo, subs, fast = false, record = true }) {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--force-color-profile=srgb'] })
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen', '1') } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setContent(stage.html(appUrl))
  await page.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), CURSOR)
  await page.evaluate(() => {
    window.__cur = (x, y, ms = 0) => { const c = document.getElementById('cur'); c.style.setProperty('--gd', ms + 'ms'); c.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)' }
    window.__rip = (x, y) => { const r = document.createElement('div'); r.className = 'rip'; r.style.left = x + 'px'; r.style.top = y + 'px'
      document.body.appendChild(r); setTimeout(() => r.remove(), 700) }
  })
  if (appUrl) await page.frameLocator('#app').locator('body').waitFor({ timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(800)

  const rig = new Rig(page, errors, vo, subs, fast)
  if (record) {
    const dir = path.join(out, 'frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir)
    const cdp = await ctx.newCDPSession(page)
    let n = 0
    cdp.on('Page.screencastFrame', (f) => {
      const file = path.join(dir, String(n++).padStart(6, '0') + '.jpg')
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
      rig.frames.push([path.basename(file), f.metadata.timestamp ?? Date.now() / 1000])
      rig.writes.push(fs.promises.writeFile(file, Buffer.from(f.data, 'base64')))
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
    rig.cdp = cdp
    await page.waitForTimeout(300)
  }
  rig.t0 = Date.now()
  rig.segs = [{ real: rig.t0 / 1000, film: 0, slow: 1 }]
  return { browser, ctx, page, rig, app: page.frameLocator('#app') }
}

export class Rig {
  constructor(page, errors, vo, subs, fast) {
    this.page = page; this.errors = errors; this.vo = vo; this.subs = subs; this.fast = fast
    this.t0 = Date.now(); this.frames = []; this.writes = []; this.slow = 1; this.segs = [{ real: this.t0 / 1000, film: 0, slow: 1 }]
    this.voice = []; this.events = []; this.sections = []; this._section = null
    this.missing = []; this.at = { x: 1960, y: 1100 }
  }
  /* FILM time. The stage runs slowed (Chrome's animation clock at 1/slow and
     every wait stretched by slow) so the ~21 fps screencast holds 42-63 frames
     per film second; mix3 maps each frame's real timestamp back through segs. */
  t() { const s = this.segs[this.segs.length - 1]; return s.film + (Date.now() / 1000 - s.real) / s.slow }
  async setSlow(k) {
    if (this.fast) return
    const film = this.t()
    this.slow = k; this.segs.push({ real: Date.now() / 1000, film, slow: k })
    /* Only the stage's own animations slow down. CDP Animation.setPlaybackRate
       reached the console iframe too, and Motion then never finished an exit
       animation: the New zone dialog stayed open after Continue. */
    await this.page.evaluate((v) => window.__setSlow(v), k)
  }
  async hold(ms) { await this.page.waitForTimeout(this.fast ? Math.min(ms, 80) : ms * this.slow) }
  async wait(ms) { await this.page.waitForTimeout(ms * (this.fast ? 1 : this.slow)) }
  section(kind) { if (this._section) this.sections.push({ ...this._section, end: this.t() }); this._section = { start: this.t(), kind } }
  endSections() { if (this._section) { this.sections.push({ ...this._section, end: this.t() }); this._section = null } }

  async st(fn, ...args) { return this.page.evaluate(([f, a]) => window.__st[f](...a), [fn, args]) }
  scene(n) { return this.st('scene', n ?? '') }
  shot(k) { return this.st('shot', k) }
  step(n, on) { return this.st('step', n, on) }
  sc(sel, cls, on) { return this.st('sc', sel, cls, on) }
  url(p) { return this.st('url', p) }
  async cursor(on) { await this.page.evaluate((v) => document.body.classList.toggle('nocur', !v), on) }

  /** The console camera: push in on a control (scale s), wait for it to land. */
  async look(loc, s = 1.6, ms = 700) {
    const b = await loc.first().boundingBox().catch(() => null)
    if (!b) { this.missing.push('look: no box'); return }
    await this.st('camTo', b, s)
    await this.wait(900)
    await this.hold(ms)
  }
  async wide() {
    const zoomed = await this.page.evaluate(() => window.__st.cam.s !== 1)
    await this.st('camTo', null, 1)
    if (zoomed) await this.wait(900)
  }
  /** Push in and stay there (the next presses happen inside the close-up). */
  async closeOn(loc, s = 1.6, what = '') {
    const b = await loc.first().boundingBox().catch(() => null)
    if (!b) { this.missing.push('closeOn: no box ' + what); return }
    await this.st('camTo', b, s); await this.wait(900)
  }

  /* --- the spoken line, with beats inside it ------------------------------ */
  async say(id, fn, { cap = true } = {}) {
    const meta = this.vo[id]
    if (!meta) { this.missing.push(`no voice: ${id}`); return fn ? fn(async (f, g) => g && g()) : undefined }
    const start = this.t(), d = meta.duration
    this.voice.push({ id, t: start, d })
    if (cap) await this.st('cap', this.subs[id] ?? '')
    const at = async (frac, f) => { const w = start + d * frac - this.t(); if (w > 0) await this.hold(w * 1000); await f() }
    if (fn) await fn(at)
    const left = start + d - this.t()
    if (left > 0) await this.hold(left * 1000)
    await this.st('cap', '')
    await this.hold(160)
  }

  /* --- the hand ------------------------------------------------------------ */
  async glide(x, y, ms = 380) {
    const d = Math.hypot(x - this.at.x, y - this.at.y)
    const dur = Math.round(Math.min(ms * 1.4, Math.max(220, ms * (0.55 + d / 1400))))
    await this.page.evaluate(([a, b, m]) => window.__cur(a, b, m), [x, y, dur])
    await this.hold(dur + 30)
    await this.page.mouse.move(x, y)
    this.at = { x, y }
  }
  async park() { await this.glide(1960, 1100, 300) }
  /* When the camera is pushed in and the next target is out of the frame,
     pan to it at the same scale (or go wide if it will not fit). */
  async frame(loc) {
    const s = await this.page.evaluate(() => window.__st.cam.s)
    if (s === 1) return
    const b = await loc.first().boundingBox().catch(() => null)
    if (!b) return
    const inside = b.x > 30 && b.y > 30 && b.x + b.width < 1890 && b.y + b.height < 985
    if (inside) return
    if (b.width > 1500 || b.height > 800) await this.wide()
    else { await this.st('camTo', b, s); await this.wait(900) }
  }
  async pointAt(loc, left = false) {
    await loc.first().waitFor({ state: 'visible', timeout: 12000 })
    /* Centre a control that sits near the top or bottom of the app: sticky
       headers and the wizard's footer cover those bands and eat the press. */
    await loc.first().evaluate((e) => {
      const r = e.getBoundingClientRect(), h = innerHeight
      if (r.bottom > h * 0.8 || r.top < h * 0.1) e.scrollIntoView({ block: 'center', inline: 'nearest' })
    }).catch(() => {})
    await this.frame(loc)
    let b = await loc.first().boundingBox()
    for (let i = 0; i < 8; i++) {
      await this.page.waitForTimeout(80 * (this.fast ? 1 : this.slow))
      const c = await loc.first().boundingBox()
      if (b && c && Math.abs(b.x - c.x) < 1 && Math.abs(b.y - c.y) < 1) { b = c; break }
      b = c
    }
    if (!b) throw new Error('no box')
    return { x: left ? b.x + Math.min(36, b.width / 4) : b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  async click(loc, { after = 260, left = false } = {}) {
    const p = await this.pointAt(loc, left)
    await this.glide(p.x, p.y)
    const b = await loc.first().boundingBox().catch(() => null)
    if (b) {
      const q = { x: left ? b.x + Math.min(36, b.width / 4) : b.x + b.width / 2, y: b.y + b.height / 2 }
      if (Math.abs(q.x - p.x) > 2 || Math.abs(q.y - p.y) > 2) { await this.page.mouse.move(q.x, q.y); await this.page.evaluate(([a, c]) => window.__cur(a, c, 120), [q.x, q.y]); await this.hold(130); this.at = q; p.x = q.x; p.y = q.y }
    }
    await this.hold(70)
    this.events.push({ type: 'click', t: this.t(), pan: Math.max(-0.35, Math.min(0.35, (p.x / W - 0.5) * 0.7)) })
    await this.page.evaluate(([a, b]) => window.__rip(a, b), [p.x, p.y])
    await this.page.mouse.down(); await this.page.waitForTimeout(60 * (this.fast ? 1 : this.slow)); await this.page.mouse.up()
    await this.hold(after)
  }
  async keys(text, { delay = 55 } = {}) {
    const t = this.t()
    await this.page.keyboard.type(text, { delay: this.fast ? 1 : delay * this.slow })
    const per = (this.t() - t) / Math.max(1, text.length)
    for (let i = 0; i < text.length; i++) this.events.push({ type: 'mxblue', t: t + per * i, key: text[i] })
    await this.hold(180)
  }
  async press(key) { this.events.push({ type: 'mxblue', t: this.t(), key }); await this.page.keyboard.press(key); await this.hold(140) }
  async typeIn(loc, text, opts) { await this.click(loc); await this.keys(text, opts) }

  async stop(dir) {
    const duration = this.t()
    if (this.cdp) { await this.cdp.send('Page.stopScreencast').catch(() => {}); await this.page.waitForTimeout(300) }
    await Promise.all(this.writes)
    fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({
      t0: this.t0 / 1000, segs: this.segs, duration, voice: this.voice, events: this.events, sections: this.sections, frames: this.frames,
      missing: this.missing, errors: [...new Set(this.errors)],
    }))
  }
}
