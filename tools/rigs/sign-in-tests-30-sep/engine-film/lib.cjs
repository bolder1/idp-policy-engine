const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:5173/'
async function open({ W = 1440, H = 900, reduced = false } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1') } catch {} })
  const p = await ctx.newPage()
  const errs = []
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
  await p.goto(BASE); await p.waitForTimeout(1200)
  await p.getByRole('link', { name: 'Sign-in tests' }).or(p.getByRole('button', { name: 'Sign-in tests' })).first().click()
  await p.waitForTimeout(700)
  return { browser, p, errs }
}
async function pick(p, label, query) {
  await p.locator(`#tj-field-${label === "Person" ? "person" : "app"} .bx-picker__trigger`).first().click()
  await p.waitForTimeout(250)
  const input = p.locator('.bx-picker__pop input').first()
  await input.fill(query)
  await p.waitForTimeout(120)
  await input.press('Enter')
  await p.waitForTimeout(200)
}
async function film(p, dir, prefix = '', every = 150, max = 60) {
  const fs = require('fs'); fs.mkdirSync(dir, { recursive: true })
  let n = 0
  const t0 = Date.now()
  for (; n < max; n++) {
    await p.screenshot({ path: `${dir}/${prefix}${String(n).padStart(2, '0')}.png` })
    const done = await p.locator('.tj-engine.is-done').count()
    if (done && n > 0) break
    const wait = t0 + (n + 1) * every - Date.now()
    if (wait > 0) await p.waitForTimeout(wait)
  }
  return { frames: n + 1, ms: Date.now() - t0 }
}
async function metrics(p) {
  return p.evaluate(() => {
    const main = document.querySelector('.bshell__main')
    const sc = document.querySelector('.tj-scroll')
    const canvas = document.querySelector('.tj-canvas')?.getBoundingClientRect()
    const out = document.querySelector('.tj-out')?.getBoundingClientRect()
    return {
      pageScroll: main ? main.scrollHeight - main.clientHeight : null,
      hScroll: sc ? sc.scrollWidth - sc.clientWidth : null,
      vScroll: sc ? sc.scrollHeight - sc.clientHeight : null,
      canvas: canvas && { l: canvas.left, r: canvas.right, t: canvas.top, b: canvas.bottom },
      outcome: out && { l: out.left, r: out.right, t: out.top, b: out.bottom },
    }
  })
}
async function field(p, f, option) {
  await p.locator(`#tj-field-${f} .bx-picker__trigger`).first().click()
  await p.waitForTimeout(300)
  await p.locator('.bx-apop').getByRole('option', { name: option }).first().click()
  await p.waitForTimeout(250)
}
module.exports = { open, pick, film, metrics, field }
