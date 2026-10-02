// node stops.js "<person>" "<app>" <tag> — each stop as a 2x element screenshot, plus overlap measurements
const { chromium } = require('playwright')
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true })
const [person, app, tag = 's'] = process.argv.slice(2)
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1') } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto((process.env.BASE || 'http://localhost:5173/'), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Check access', exact: true }).first().click()
  await page.waitForSelector('.hiw')
  await page.locator('.hiw__act button').first().click()
  await page.waitForTimeout(600)
  await page.locator('.sit-ident .bb__whorow button').first().click()
  await page.waitForTimeout(500)
  await page.getByRole('radio', { name: new RegExp(person) }).first().click()
  await page.waitForTimeout(400)
  await page.getByText('Choose an application', { exact: true }).first().click()
  await page.waitForTimeout(300)
  await page.getByText(app).last().click()
  await page.waitForTimeout(500)
  await page.locator('.sit-panel').screenshot({ path: `${OUT}${tag}-panel.png` })
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.waitForTimeout(13000)
  for (const [name, sel] of [['signin', '[data-node="sign-in"]'], ['which', '[data-node="which"]'], ['decider', '[data-node="decider"]'], ['outcome', '[data-node="outcome"]']]) {
    const el = page.locator(sel).first()
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded()
      await el.hover()
      await page.waitForTimeout(250)
      await el.screenshot({ path: `${OUT}${tag}-${name}.png` })
    }
  }
  /* Overlaps: any two visible svg/img/face/badge boxes inside the chain that intersect by more than 2px. */
  const overlaps = await page.evaluate(() => {
    const root = document.querySelector('.tj-chain')
    if (!root) return []
    const els = [...root.querySelectorAll('svg, img, .bx-face, .bx-badge, .bb__state, .tj-rail__chip, .tj-sin2__group, .bb__ifchip, .bb__idx, .tplay__chip')]
      .filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0' })
    const out = []
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j]
      if (a.contains(b) || b.contains(a)) continue
      const r = a.getBoundingClientRect(), q = b.getBoundingClientRect()
      const w = Math.min(r.right, q.right) - Math.max(r.left, q.left)
      const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top)
      if (w > 2 && h > 2) {
        const d = (e) => `${e.tagName.toLowerCase()}.${String(e.getAttribute('class') || '').split(' ').slice(0, 3).join('.')}${e.textContent ? '"' + e.textContent.trim().slice(0, 16) + '"' : ''}`
        out.push(`${d(a)}  ×  ${d(b)}  (${Math.round(w)}×${Math.round(h)})`)
      }
    }
    return out.slice(0, 40)
  })
  console.log(tag, 'overlaps', overlaps.length)
  for (const o of overlaps) console.log('  ', o)
  const strip = page.locator('button.tj-hero__strip')
  if (await strip.count()) {
    await strip.click()
    await page.waitForTimeout(800)
    await page.locator('.sit-whypanel').screenshot({ path: `${OUT}${tag}-why.png` })
  }
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
