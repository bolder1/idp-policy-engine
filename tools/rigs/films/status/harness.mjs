/* A real-time screen recorder for the IdP console.

   Drives the running app in its own Chrome (fresh profile, so it sees what a
   first-time admin sees), and draws the film's chrome INSIDE that browser only:
   a cursor, a click ripple, a caption band, chapter cards and end slides. None
   of it touches the product's code or the owner's own browser. */
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(new URL('../../../../video/package.json', import.meta.url))
const { chromium } = require('playwright')
export const FFMPEG = require('@ffmpeg-installer/ffmpeg').path

export const W = 1920
export const H = 1080

/* Runs in the page before the app: the overlay layer and the cursor that
   follows real mouse events. */
const OVERLAY = `(() => {
  const css = \`
  #__rec { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: Inter, 'Segoe UI', system-ui, sans-serif; }
  #__rec .cur { position: absolute; left: 0; top: 0; width: 26px; height: 26px; transform: translate(-3px,-2px); transition: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
  #__rec .rip { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 2.5px solid #0d6efd; opacity: .9; animation: __rip .55s ease-out forwards; }
  @keyframes __rip { to { width: 54px; height: 54px; margin: -27px 0 0 -27px; opacity: 0; } }
  #__rec .cap { position: absolute; left: 50%; bottom: 34px; transform: translateX(-50%); width: max-content; max-width: 1380px;
    padding: 14px 26px; border-radius: 14px; background: rgba(17,24,39,.9); color: #fff; font-size: 25px; line-height: 1.4; font-weight: 500;
    letter-spacing: .1px; box-shadow: 0 10px 30px rgba(0,0,0,.25); opacity: 0; transition: opacity .25s ease; text-align: center; }
  #__rec .cap.on { opacity: 1; }
  #__rec .cap b { color: #ffb38f; font-weight: 600; }
  #__rec .tag { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); padding: 7px 16px; border-radius: 999px; background: rgba(17,24,39,.86);
    color: #fff; font-size: 17px; font-weight: 600; opacity: 0; transition: opacity .25s ease; width: max-content; }
  #__rec .tag.on { opacity: 1; }
  #__rec .tag i { font-style: normal; color: #9ec5fe; margin-right: 8px; }
  #__rec .card { position: absolute; inset: 0; background: #fff; display: flex; flex-direction: column; justify-content: center; padding: 0 180px;
    opacity: 0; transition: opacity .45s ease; color: #111827; }
  #__rec .card.on { opacity: 1; }
  #__rec .card .kick { font-size: 22px; font-weight: 600; color: #eb5424; letter-spacing: .3px; margin-bottom: 18px; }
  #__rec .card h1 { font-size: 64px; line-height: 1.12; margin: 0 0 22px; font-weight: 700; letter-spacing: -1px; max-width: 1400px; }
  #__rec .card p { font-size: 28px; line-height: 1.5; margin: 0; color: #4b5563; max-width: 1350px; }
  #__rec .card .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
  #__rec .card .chips span { padding: 8px 16px; border-radius: 999px; background: #f1f3f5; color: #374151; font-size: 20px; font-weight: 500; }
  #__rec .card .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 18px 40px; margin-top: 34px; }
  #__rec .card .row { border-top: 1px solid #e5e7eb; padding-top: 14px; }
  #__rec .card .row b { display: block; font-size: 25px; margin-bottom: 6px; color: #111827; }
  #__rec .card .row em { font-style: normal; font-size: 20px; color: #4b5563; line-height: 1.45; display: block; }
  #__rec .card .row u { text-decoration: none; font-size: 17px; font-weight: 600; color: #0d6efd; display: block; margin-top: 6px; }
  #__rec .card .st { display: inline-block; font-size: 16px; font-weight: 600; padding: 3px 10px; border-radius: 999px; margin-left: 10px; vertical-align: 4px; }
  #__rec .card .st.c { background: #e7f5ec; color: #146c43; } #__rec .card .st.p { background: #fff4e0; color: #9a5b00; } #__rec .card .st.m { background: #fde8e8; color: #b42318; }
  \`
  const mount = () => {
    if (document.getElementById('__rec')) return
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st)
    const root = document.createElement('div'); root.id = '__rec'
    root.innerHTML = '<div class="card"></div><div class="tag"></div><div class="cap"></div>' +
      '<svg class="cur" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15.1 L18.6 15.1 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.body.appendChild(root)
    const cur = root.querySelector('.cur')
    window.__recPos = { x: 960, y: 540 }
    cur.style.left = '960px'; cur.style.top = '540px'
    window.addEventListener('mousemove', (e) => { window.__recPos = { x: e.clientX, y: e.clientY }; cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px' }, true)
    window.addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.className = 'rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; root.appendChild(r); setTimeout(() => r.remove(), 700) }, true)
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount)
  /* Every one of these re-mounts first. The overlay is injected per document,
     and a navigation -- a dev server deciding to full-reload, most of all --
     replaces the document under it: mount had run on the old one, the guard saw
     no overlay root on the new one but nothing called it again, and the next
     caption threw on a null. Nine and a half minutes of take died on that.
     Mounting is idempotent, so paying for the check on every call costs nothing
     and cannot fail the same way twice.
     (No backticks in here: this whole block is a template literal.) */
  const at = (sel) => { mount(); return document.querySelector(sel) }
  window.__rec = {
    cap(html) { const c = at('#__rec .cap'); if (!c) return; if (!html) { c.classList.remove('on'); return } c.innerHTML = html; c.classList.add('on') },
    tag(html) { const c = at('#__rec .tag'); if (!c) return; if (!html) { c.classList.remove('on'); return } c.innerHTML = html; c.classList.add('on') },
    card(html) { const c = at('#__rec .card'); if (!c) return; if (!html) { c.classList.remove('on'); return } c.innerHTML = html; c.classList.add('on') },
  }
})()`

/* `vw`/`vh` are the page's own size, and the capture matches it exactly.

   Shooting a 1440-wide console and UPSCALING to 1080p at encode time makes
   every control a third bigger on screen, which is the difference between a
   demo you can read on a laptop and one you squint at. Left at 1920, the
   console renders at 1920 CSS pixels and its 14px body text lands at 14px.

   The capture size must equal the viewport. Playwright fits a page into a
   recordVideo canvas only when the page is LARGER — a smaller one is pinned to
   the top-left and the rest of the canvas is left black, which is what the
   first dry take came out as. The upscale belongs to ffmpeg (`toMp4`). */
export async function start({ out, storage = {}, vw = W, vh = H }) {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({
    viewport: { width: vw, height: vh },
    deviceScaleFactor: 1,
    recordVideo: { dir: out, size: { width: vw, height: vh } },
  })
  await ctx.addInitScript(OVERLAY)
  if (Object.keys(storage).length) {
    await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) { try { localStorage.setItem(k, v) } catch {} } }, storage)
  }
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const rec = new Rec(page, errors)
  return { browser, ctx, page, rec }
}

export class Rec {
  constructor(page, errors) { this.page = page; this.errors = errors; this.log = [] }
  async hold(ms) { await this.page.waitForTimeout(ms) }
  async cap(html, ms = 0) { await this.page.evaluate((h) => window.__rec.cap(h), html); if (ms) await this.hold(ms) }
  async tag(html) { await this.page.evaluate((h) => window.__rec.tag(h), html) }
  async card(html, ms = 0) { await this.page.evaluate((h) => window.__rec.card(h), html); if (ms) await this.hold(ms) }
  async uncard() { await this.page.evaluate(() => window.__rec.card('')); await this.hold(500) }

  /* Glide the cursor to a point, as a hand would: eased, about 0.5 s. */
  async glide(x, y, ms = 520) {
    const from = await this.page.evaluate(() => window.__recPos || { x: 960, y: 540 })
    const n = Math.max(8, Math.round(ms / 16))
    for (let i = 1; i <= n; i++) {
      const t = i / n, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      await this.page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e)
      await this.page.waitForTimeout(ms / n)
    }
  }

  /* The centre of a locator, scrolled into view, after checking that the
     element under that point IS the target (a clipped or covered control
     would take the click elsewhere, silently). */
  async point(loc, { dx = 0, dy = 0 } = {}) {
    await loc.first().waitFor({ state: 'visible', timeout: 10000 })
    await loc.first().scrollIntoViewIfNeeded()
    await this.page.waitForTimeout(250)
    const box = await loc.first().boundingBox()
    if (!box) throw new Error('no box for ' + loc)
    const x = box.x + box.width / 2 + dx, y = box.y + box.height / 2 + dy
    const ok = await loc.first().evaluate((el, p) => { const hit = document.elementFromPoint(p.x, p.y); return !!hit && (hit === el || el.contains(hit) || hit.closest('label') === el.closest('label')) }, { x, y })
    if (!ok) this.log.push(`hit-test miss on ${loc}`)
    return { x, y }
  }

  async hover(loc, opts) { const p = await this.point(loc, opts); await this.glide(p.x, p.y) }
  async click(loc, opts = {}) {
    const p = await this.point(loc, opts)
    await this.glide(p.x, p.y, opts.ms ?? 520)
    await this.page.waitForTimeout(120)
    await this.page.mouse.down(); await this.page.waitForTimeout(70); await this.page.mouse.up()
    await this.page.waitForTimeout(opts.after ?? 450)
  }
  async type(loc, text, { delay = 55 } = {}) {
    await this.click(loc)
    await this.page.keyboard.type(text, { delay })
    await this.page.waitForTimeout(300)
  }
  async scrollTo(loc) { await loc.first().scrollIntoViewIfNeeded(); await this.page.waitForTimeout(400) }
  async wheel(dy, steps = 6) { for (let i = 0; i < steps; i++) { await this.page.mouse.wheel(0, dy / steps); await this.page.waitForTimeout(40) } await this.page.waitForTimeout(350) }
}

/* webm → mp4 (H.264, yuv420p, faststart), scaled to the film's frame on the
   way, then a full decode to prove it. Lanczos because this is an upscale of
   text and hairlines: bilinear turns a 1px table rule into a grey smear. */
export function toMp4(webm, mp4, { w = W, h = H } = {}) {
  const r = spawnSync(FFMPEG, ['-y', '-v', 'error', '-i', webm, '-vf', `scale=${w}:${h}:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr)
  const d = spawnSync(FFMPEG, ['-v', 'error', '-i', mp4, '-f', 'null', '-'], { encoding: 'utf8' })
  if (d.status !== 0 || d.stderr.trim()) throw new Error('decode check failed: ' + d.stderr)
  return mp4
}

export function newestWebm(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.webm')).map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
}
