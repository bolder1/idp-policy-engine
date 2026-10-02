/* Video 1's studio: capture the real app, then composite the film around it.

   CAPTURE: the console runs in its own Chrome at APP_W x APP_H (fresh profile,
   so it is a first-time admin's view), recorded in real time. The only thing
   drawn inside the app is the cursor and its click ripple. Everything else the
   film says is logged as timed events: the caption, the use cases in focus with
   what is covered and missing, chapter cards.

   COMPOSE: the events become a "chrome" track of transparent PNG stills
   (checklist panel on the right, caption band below, cards over the app), laid
   over the app video on a 1920x1080 canvas by ffmpeg. Slides that stand alone
   (title, the closing "what is missing" section) are full-frame stills. */
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(new URL('../../../../video/package.json', import.meta.url))
const { chromium } = require('playwright')
export const FFMPEG = require('@ffmpeg-installer/ffmpeg').path

export const FW = 1920, FH = 1080
export const APP_W = 1536, APP_H = 864
export const AX = 16, AY = 16
export const PX = AX + APP_W + 16, PW = FW - PX - 16          // the checklist panel
export const CY = AY + APP_H + 16, CH = FH - CY - 16          // the caption band

const CURSOR = `(() => {
  const css = \`#__rec{position:fixed;inset:0;pointer-events:none;z-index:2147483647}
  #__rec .cur{position:absolute;left:0;top:0;width:24px;height:24px;transform:translate(-3px,-2px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
  #__rec .rip{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2.5px solid #0d6efd;opacity:.9;animation:__rip .55s ease-out forwards}
  @keyframes __rip{to{width:52px;height:52px;margin:-26px 0 0 -26px;opacity:0}}\`
  const mount = () => {
    if (document.getElementById('__rec')) return
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st)
    const root = document.createElement('div'); root.id = '__rec'
    root.innerHTML = '<svg class="cur" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15.1 L18.6 15.1 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.body.appendChild(root)
    const cur = root.querySelector('.cur')
    const p = window.__recPos || { x: ${APP_W / 2}, y: ${APP_H / 2} }
    cur.style.left = p.x + 'px'; cur.style.top = p.y + 'px'
    window.addEventListener('mousemove', (e) => { window.__recPos = { x: e.clientX, y: e.clientY }; cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px' }, true)
    window.addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.className = 'rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; root.appendChild(r); setTimeout(() => r.remove(), 700) }, true)
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount)
})()`

export async function capture({ out, storage = {}, run, vo = {} }) {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: APP_W, height: APP_H }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: APP_W, height: APP_H } } })
  await ctx.addInitScript(CURSOR)
  if (Object.keys(storage).length) await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) { try { localStorage.setItem(k, v) } catch {} } }, storage)
  const page = await ctx.newPage()
  const t0 = Date.now()
  const rec = new Rec(page, t0, vo)
  page.on('pageerror', (e) => rec.problems.push('pageerror: ' + e.message))
  let failed = null
  try { await run(rec, page) } catch (e) { failed = e; await page.screenshot({ path: path.join(out, 'FAILED.png') }).catch(() => {}); console.log('FAILED at', rec.now().toFixed(1) + 's:', String(e.message).split(String.fromCharCode(10))[0]) }
  rec.mark('end')
  const video = page.video()
  await ctx.close(); await browser.close()
  const webm = await video.path()
  fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify({ events: rec.events, problems: rec.problems, webm }, null, 1))
  if (failed) throw failed
  return { webm, events: rec.events, problems: rec.problems }
}

export class Rec {
  constructor(page, t0, vo = {}) { this.page = page; this.t0 = t0; this.vo = vo; this.events = []; this.problems = []; this.sayEnd = 0 }
  now() { return (Date.now() - this.t0) / 1000 }
  mark(type, data = {}) { this.events.push({ t: this.now(), type, ...data }) }
  async hold(ms) { await this.page.waitForTimeout(ms) }
  /* The caption band. */
  async cap(text, ms = 0) { this.mark('cap', { text }); if (ms) await this.hold(ms) }
  /* Start a spoken line with its caption, and let the actions run underneath
     it. `endSay` waits for whatever is left of the sentence. A line with no
     voice-over falls back to a read-it-yourself pause. */
  async startSay(id, html) {
    const line = this.vo[id]
    if (!line) this.problems.push(`no voice-over line for ${id}`)
    this.mark('cap', { text: html })
    this.mark('say', { id })
    this.sayEnd = Date.now() + (line ? line.duration * 1000 : 2200)
  }
  async endSay(pad = 420) {
    const left = this.sayEnd - Date.now()
    if (left > 0) await this.hold(left)
    if (pad) await this.hold(pad)
  }
  /* A spoken line with nothing happening under it. */
  async say(id, html, pad) { await this.startSay(id, html); await this.endSay(pad) }

  /* The use cases this step is about, and what it shows is covered / missing. */
  focus(step) { this.mark('focus', { step }) }
  /* A card over the app area (chapter openers). */
  async card(card, ms = 2600) { this.mark('card', { card }); await this.hold(ms); this.mark('card', { card: null }); await this.hold(350) }

  async glide(x, y, ms = 520) {
    const from = await this.page.evaluate(() => window.__recPos || { x: 768, y: 432 })
    const n = Math.max(8, Math.round(ms / 16))
    for (let i = 1; i <= n; i++) {
      const t = i / n, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      await this.page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e)
      await this.page.waitForTimeout(ms / n)
    }
  }
  /* The centre of a control, after the scroll has actually settled. A box
     measured while a panel is still easing is a click 30px below the target,
     and the app takes it somewhere else without an error. Re-measures until
     the element under the point IS the target. */
  async point(loc, { dx = 0, dy = 0, timeout = 10000 } = {}) {
    const l = loc.first()
    await l.waitFor({ state: 'visible', timeout })
    /* Centre it: scrollIntoViewIfNeeded stops as soon as the element is
       inside the viewport, which leaves a row under the wizard's sticky
       footer, and the press lands on the footer instead. */
    await l.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {})
    let last = null
    for (let i = 0; i < 4; i++) {
      await this.page.waitForTimeout(i === 0 ? 260 : 200)
      const box = await l.boundingBox()
      if (!box) continue
      const x = box.x + box.width / 2 + dx, y = box.y + box.height / 2 + dy
      const ok = await l.evaluate((el, p) => {
        const hit = document.elementFromPoint(p.x, p.y)
        return !!hit && (hit === el || el.contains(hit) || (hit.closest && hit.closest('label') && hit.closest('label') === el.closest('label')))
      }, { x, y })
      last = { x, y }
      if (ok) return last
      await l.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {})
    }
    this.problems.push(`hit-test miss at ${this.now().toFixed(1)}s on ${loc}`)
    return last
  }
  async hover(loc, opts) { const p = await this.point(loc, opts); await this.glide(p.x, p.y) }
  async click(loc, opts = {}) {
    const before = this.problems.length
    const p = await this.point(loc, opts)
    if (this.problems.length > before) {
      /* The point is not the target — let Playwright do the actionability
         work rather than pressing whatever is on top. */
      await loc.first().click({ timeout: 8000 })
      await this.page.waitForTimeout(opts.after ?? 500)
      return
    }
    await this.glide(p.x, p.y, opts.ms ?? 520)
    await this.page.waitForTimeout(110)
    await this.page.mouse.down(); await this.page.waitForTimeout(70); await this.page.mouse.up()
    await this.page.waitForTimeout(opts.after ?? 500)
  }
  async type(loc, text, { delay = 45, clear = false } = {}) {
    await this.click(loc)
    if (clear) { await this.page.keyboard.press('Control+A'); await this.page.keyboard.press('Backspace') }
    await this.page.keyboard.type(text, { delay })
    await this.page.waitForTimeout(300)
  }
  async wheel(dy, steps = 8) { for (let i = 0; i < steps; i++) { await this.page.mouse.wheel(0, dy / steps); await this.page.waitForTimeout(35) } await this.page.waitForTimeout(400) }
  /* Assert a state change right after an action: a landed click proves nothing. */
  async expect(loc, what, timeout = 6000) {
    try { await loc.first().waitFor({ state: 'visible', timeout }) } catch { this.problems.push(`expectation failed at ${this.now().toFixed(1)}s: ${what}`); throw new Error('expectation failed: ' + what) }
  }
}

/* ---------------------------------------------------------------- compose */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const STATUS = {
  covered: { label: 'Covered', cls: 'c', mark: '✓' },
  partial: { label: 'Partial', cls: 'p', mark: '◐' },
  missing: { label: 'Missing', cls: 'm', mark: '✕' },
}

const BASE_CSS = `
*{box-sizing:border-box} body{margin:0;width:${FW}px;height:${FH}px;font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#111827;-webkit-font-smoothing:antialiased}
.st{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;padding:2px 9px;border-radius:999px;white-space:nowrap}
.st.c{background:#e7f5ec;color:#146c43}.st.p{background:#fff4e0;color:#8a5200}.st.m{background:#fde8e8;color:#b42318}.st.n{background:#f1f3f5;color:#6b7280}
`

function panelHTML(ucs, seen, step) {
  const cur = new Set(step?.ids ?? [])
  const rows = ucs.map((u) => {
    const s = seen.get(u.id)
    const st = s ? STATUS[s] : null
    return `<li class="${cur.has(u.id) ? 'on' : ''}"><span class="n">#${u.id}</span><span class="t">${esc(u.short)}</span>${st ? `<span class="st ${st.cls}">${st.mark} ${st.label}</span>` : `<span class="st n">Not yet</span>`}</li>`
  }).join('')
  const detail = step ? `<div class="det">
      <div class="dh">${esc(step.title ?? '')}</div>
      ${step.covered?.length ? `<div class="k c">What works</div><ul>${step.covered.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${step.missing?.length ? `<div class="k m">What is missing</div><ul>${step.missing.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div>` : ''
  return `<div class="panel"><div class="ph">Use cases from the brief <span>${seen.size}/${ucs.length} shown</span></div><ol>${rows}</ol>${detail}</div>`
}

const CHROME_CSS = `
body{background:transparent}
.hole{position:absolute;left:${AX}px;top:${AY}px;width:${APP_W}px;height:${APP_H}px;border-radius:10px;box-shadow:0 0 0 1px rgba(15,23,42,.10),0 8px 28px rgba(15,23,42,.10)}
.frame{position:absolute;inset:0;background:#eef1f5;-webkit-mask:linear-gradient(#000,#000);}
.panel{position:absolute;left:${PX}px;top:${AY}px;width:${PW}px;height:${APP_H}px;background:#fff;border-radius:10px;box-shadow:0 0 0 1px rgba(15,23,42,.08);padding:14px 14px 12px;display:flex;flex-direction:column;overflow:hidden}
.ph{font-size:15px;font-weight:700;margin-bottom:8px;display:flex;justify-content:space-between;align-items:baseline}.ph span{font-size:12px;font-weight:500;color:#6b7280}
ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
ol li{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;font-size:12.5px;line-height:1.25;color:#374151}
ol li .n{color:#6b7280;font-weight:600;font-variant-numeric:tabular-nums}
ol li .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
ol li .st{font-size:11px;padding:1px 7px}
ol li.on{background:#e8f0fe;color:#0b3d91;font-weight:600;box-shadow:inset 3px 0 0 #0d6efd}
.det{margin-top:10px;border-top:1px solid #e5e7eb;padding-top:10px;flex:1;overflow:hidden}
.dh{font-size:14.5px;font-weight:700;margin-bottom:6px;line-height:1.3}
.k{font-size:12px;font-weight:700;letter-spacing:.2px;margin:8px 0 3px}.k.c{color:#146c43}.k.m{color:#b42318}
.det ul{margin:0;padding-left:16px}.det li{font-size:12.5px;line-height:1.38;color:#374151;margin-bottom:2px}
.cap{position:absolute;left:${AX}px;top:${CY}px;width:${FW - 2 * AX}px;height:${CH}px;display:flex;align-items:center;justify-content:center;padding:0 60px;text-align:center;font-size:27px;line-height:1.35;font-weight:500;color:#111827}
.cap b{color:#c2431c;font-weight:650}
.cardx{position:absolute;left:${AX}px;top:${AY}px;width:${APP_W}px;height:${APP_H}px;border-radius:10px;background:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 120px}
.cardx .kick{font-size:20px;font-weight:650;color:#eb5424;margin-bottom:14px;letter-spacing:.3px}
.cardx h1{font-size:54px;line-height:1.12;margin:0 0 18px;letter-spacing:-.8px}
.cardx p{font-size:25px;line-height:1.5;color:#4b5563;margin:0;max-width:1180px}
.cardx .ids{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}.cardx .ids span{font-size:17px;font-weight:600;padding:6px 14px;border-radius:999px;background:#f1f3f5;color:#374151}
`

function chromeHTML(ucs, state) {
  const seen = state.seen
  return `<!doctype html><html><head><style>${BASE_CSS}${CHROME_CSS}</style></head><body>
  <svg width="${FW}" height="${FH}" style="position:absolute;inset:0"><defs><mask id="m"><rect width="${FW}" height="${FH}" fill="#fff"/><rect x="${AX}" y="${AY}" width="${APP_W}" height="${APP_H}" rx="10" fill="#000"/></mask></defs><rect width="${FW}" height="${FH}" fill="#eef1f5" mask="url(#m)"/></svg>
  <div class="hole"></div>
  ${panelHTML(ucs, seen, state.step)}
  <div class="cap"><span>${state.cap ?? ''}</span></div>
  ${state.card ? `<div class="cardx">${state.card}</div>` : ''}
  </body></html>`
}

function slideHTML(inner) {
  return `<!doctype html><html><head><style>${BASE_CSS}
  body{background:#fff}
  .s{position:absolute;inset:0;padding:90px 130px;display:flex;flex-direction:column}
  .kick{font-size:22px;font-weight:650;color:#eb5424;margin-bottom:16px;letter-spacing:.3px}
  h1{font-size:60px;line-height:1.1;margin:0 0 20px;letter-spacing:-1px}
  h2{font-size:40px;line-height:1.15;margin:0 0 14px;letter-spacing:-.5px}
  p.lead{font-size:27px;line-height:1.5;color:#4b5563;margin:0 0 28px;max-width:1500px}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 56px}
  .it{border-top:1px solid #e5e7eb;padding-top:16px}
  .it b{display:block;font-size:26px;margin-bottom:6px}
  .it em{display:block;font-style:normal;font-size:20px;line-height:1.45;color:#4b5563}
  .it u{display:block;text-decoration:none;font-size:17px;font-weight:650;color:#0d6efd;margin-top:8px}
  table{border-collapse:collapse;width:100%;font-size:19px}
  td,th{text-align:left;padding:9px 12px;border-bottom:1px solid #eef0f3;vertical-align:top}
  th{font-size:15px;color:#6b7280;font-weight:650}
  .foot{margin-top:auto;font-size:17px;color:#9ca3af}
  </style></head><body><div class="s">${inner}</div></body></html>`
}

async function shoot(browser, html, file, transparent) {
  const page = await browser.newPage({ viewport: { width: FW, height: FH } })
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: file, omitBackground: !!transparent })
  await page.close()
}

function run(args) {
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 1 << 26 })
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr.slice(-3000))
  return r
}

/* events → intervals of one chrome state each */
function states(events, ucs, statusOf) {
  const out = []
  let st = { cap: '', step: null, card: null, seen: new Map() }
  let t = 0
  const push = (until) => { if (until - t > 0.04) out.push({ from: t, to: until, state: { ...st, seen: new Map(st.seen) } }); t = until }
  for (const e of events) {
    if (e.type === 'end') { push(e.t); break }
    if (!['cap', 'focus', 'card'].includes(e.type)) continue
    push(e.t)
    if (e.type === 'cap') st.cap = e.text
    if (e.type === 'card') st.card = e.card
    if (e.type === 'focus') { st.step = e.step; for (const id of e.step?.ids ?? []) st.seen.set(id, statusOf(id, e.step)) }
  }
  return out
}

export async function compose({ out, webm, events, ucs, statusOf, intro = [], outro = [], vo = {}, file = 'video-1.mp4' }) {
  const dir = path.join(out, 'compose'); fs.mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const segs = states(events, ucs, statusOf)
  // chrome stills, deduplicated by content
  const cache = new Map(); const list = []
  for (const [i, s] of segs.entries()) {
    const html = chromeHTML(ucs, s.state)
    let f = cache.get(html)
    if (!f) { f = path.join(dir, `chrome-${String(cache.size).padStart(3, '0')}.png`); await shoot(browser, html, f, true); cache.set(html, f) }
    list.push({ f, d: s.to - s.from })
  }
  const ffc = ['ffconcat version 1.0', ...list.flatMap((x) => [`file '${x.f.replace(/\\/g, '/')}'`, `duration ${x.d.toFixed(3)}`]), `file '${list.at(-1).f.replace(/\\/g, '/')}'`].join('\n')
  fs.writeFileSync(path.join(dir, 'chrome.ffconcat'), ffc)
  const total = segs.at(-1).to
  // the walkthrough: canvas + app video + chrome
  const main = path.join(dir, 'main.mp4')
  run(['-y', '-v', 'error',
    '-f', 'lavfi', '-i', `color=c=0xeef1f5:s=${FW}x${FH}:r=30:d=${total.toFixed(3)}`,
    '-i', webm,
    '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'chrome.ffconcat'),
    '-filter_complex', `[1:v]fps=30,setpts=PTS-STARTPTS[app];[0:v][app]overlay=${AX}:${AY}:shortest=0[b];[2:v]fps=30,format=rgba[ch];[b][ch]overlay=0:0:shortest=0,format=yuv420p[v]`,
    '-map', '[v]', '-t', total.toFixed(3), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', '30', main])
  // stand-alone slides
  const parts = []
  const still = async (html, secs, name) => {
    const png = path.join(dir, name + '.png'); await shoot(browser, slideHTML(html), png, false)
    const mp4 = path.join(dir, name + '.mp4')
    run(['-y', '-v', 'error', '-loop', '1', '-t', String(secs), '-i', png, '-vf', `fps=30,format=yuv420p,fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0, secs - 0.35)}:d=0.35`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', '30', mp4])
    return mp4
  }
  /* Each part's start, so a slide's line and every spoken line in the
     walkthrough can be placed on one timeline. */
  const audio = []
  let at = 0
  const slide = async (s, name) => {
    const secs = s.voId && vo[s.voId] ? Math.max(s.secs ?? 0, vo[s.voId].duration + 1.6) : s.secs
    parts.push(await still(s.html, secs, name))
    if (s.voId && vo[s.voId]) audio.push({ file: vo[s.voId].wav, at: at + 0.6 })
    at += secs
  }
  for (const [i, s] of intro.entries()) await slide(s, `intro-${i}`)
  for (const e of events) if (e.type === 'say' && vo[e.id]) audio.push({ file: vo[e.id].wav, at: at + e.t })
  parts.push(main); at += total
  for (const [i, s] of outro.entries()) await slide(s, `outro-${i}`)
  await browser.close()
  const lst = path.join(dir, 'parts.txt')
  fs.writeFileSync(lst, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'))
  const final = path.join(out, file)
  const silent = path.join(dir, 'silent.mp4')
  run(['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', silent])
  if (audio.length) {
    /* One track, each line laid at its own second, mixed without the level
       squashing amix does by default. */
    const ins = audio.flatMap((a) => ['-i', a.file])
    const chains = audio.map((a, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${Math.round(a.at * 1000)}[v${i}]`).join(';')
    const mix = audio.map((_, i) => `[v${i}]`).join('')
    run(['-y', '-v', 'error', '-i', silent, ...ins,
      '-filter_complex', `${chains};${mix}amix=inputs=${audio.length}:dropout_transition=0,volume=${audio.length},loudnorm=I=-16:TP=-1.5:LRA=11[a]`,
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', final])
  } else {
    run(['-y', '-v', 'error', '-i', silent, '-c', 'copy', '-movflags', '+faststart', final])
  }
  const d = spawnSync(FFMPEG, ['-v', 'error', '-i', final, '-f', 'null', '-'], { encoding: 'utf8' })
  if (d.status !== 0 || d.stderr.trim()) throw new Error('decode check failed: ' + d.stderr.slice(0, 2000))
  return { final, seconds: at, walkthrough: total, stills: cache.size, lines: audio.length }
}
