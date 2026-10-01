/* Spike: can the real app be stepped one frame at a time?

   Opens the New policy dialog under virtual time, steps 30fps for a second and
   reports, per frame, the dialog's computed opacity/transform (it should ramp,
   not jump), how long each step and each screenshot took, and whether the
   change detector agreed that something moved. */
import { chromium } from 'playwright'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const APP = process.env.APP_URL ?? 'http://localhost:58399'
const OUT = process.argv[2] ?? path.resolve('spike-out')
const DSF = Number(process.env.DSF ?? 2)

const shim = await readFile(new URL('../lib/virtual-time.js', import.meta.url), 'utf8')
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF })
await ctx.addInitScript({ content: shim })
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('idp.tour.seen', '1')
  } catch {}
  const hideCaret = () => {
    const s = document.createElement('style')
    s.textContent = '*{caret-color:transparent!important}'
    document.documentElement.appendChild(s)
  }
  if (document.documentElement) hideCaret()
  else document.addEventListener('DOMContentLoaded', hideCaret)
})
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200))
})
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)))
const cdp = await ctx.newCDPSession(page)

const tBoot = performance.now()
await page.goto(APP, { waitUntil: 'load' })
await page.evaluate(() => window.__vt.freeRun(true))
await page.getByRole('button', { name: 'New policy', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
await page.waitForTimeout(800)
await page.evaluate(() => window.__vt.freeRun(false))
console.log(`boot ${Math.round(performance.now() - tBoot)}ms`, await page.evaluate(() => window.__vt.stats()))

const btn = page.getByRole('button', { name: 'New policy', exact: true })
const box = await btn.boundingBox()
console.log('button box', box)
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.up()

const rows = []
for (let i = 0; i < 30; i++) {
  const t0 = performance.now()
  await page.evaluate((ms) => window.__vt.advance(ms), 1000 / 30)
  const t1 = performance.now()
  const dirty = await page.evaluate(() => window.__vt.takeDirty())
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 90,
    optimizeForSpeed: true,
    clip: { x: 0, y: 0, width: 1440, height: 900, scale: DSF },
  })
  const t2 = performance.now()
  if (i === 12) {
    // hover a table row: its background is a CSS transition, which only the
    // animation-clock half of the shim can step
    const row = page.getByRole('button', { name: 'Global Default Policy', exact: true })
    const b = await row.boundingBox().catch(() => null)
    if (b) await page.mouse.move(b.x + 20, b.y + b.height / 2)
  }
  const info = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    const pick = (el) => {
      if (!el) return null
      const cs = getComputedStyle(el)
      return { op: Number(cs.opacity).toFixed(3), tf: cs.transform.slice(0, 40) }
    }
    return { dialog: pick(d), panel: pick(d?.parentElement ?? null), anims: document.getAnimations().length, stats: window.__vt.stats() }
  })
  const file = path.join(OUT, `f${String(i).padStart(3, '0')}.jpg`)
  await writeFile(file, Buffer.from(data, 'base64'))
  rows.push({ i, adv: Math.round(t1 - t0), shot: Math.round(t2 - t1), kb: Math.round((data.length * 3) / 4 / 1024), dirty, ...info.dialog, anims: info.anims, live: info.stats.live, raf: info.stats.raf, timers: info.stats.timers })
}
console.table(rows)
console.log('errors', (await page.evaluate(() => window.__vt.stats())).errors)
await browser.close()
