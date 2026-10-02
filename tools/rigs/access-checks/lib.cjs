// Shared driver for the Break-in attempts review (Access checks on :5320).
const { chromium } = require('playwright')
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true })

async function open() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1') } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()))
  await page.goto((process.env.BASE || 'http://localhost:5173/'), { waitUntil: 'networkidle' })
  return { browser, ctx, page, errors }
}

async function toChecks(page) {
  await page.getByRole('button', { name: 'Check access', exact: true }).first().click()
  await page.waitForSelector('.hiw')
}

async function fillAndRun(page, person, app, { wait = 13000 } = {}) {
  const form = page.locator('.sit-panel')
  if (!(await form.count())) {
    await page.locator('.hiw__act button').first().click()
    await page.waitForTimeout(700)
  }
  await page.locator('.sit-ident .bb__whorow button').first().click()
  await page.waitForTimeout(500)
  await page.getByRole('radio', { name: new RegExp(person) }).first().click()
  await page.waitForTimeout(400)
  const choose = page.getByText('Choose an application', { exact: true })
  if (await choose.count()) await choose.first().click()
  else await page.locator('.sit-panel .bb__whorow button').nth(1).click()
  await page.waitForTimeout(400)
  await page.getByText(app).last().click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.waitForTimeout(wait)
}

async function overlaps(page, rootSel) {
  return page.evaluate((rootSel) => {
    const roots = [...document.querySelectorAll(rootSel)]
    const out = []
    for (const root of roots) {
      const els = [...root.querySelectorAll('svg, img, .bx-face, .bx-badge, .bb__state, .tj-rail__chip, .tj-sin2__group, .bb__ifchip, .bb__idx, .tplay__chip, .sit-att__name, .sit-att__story, .sit-att__result > *, .sit-att__by, .sit-att__accepted, .bx-btn, .tj-cell, .bx-tip')]
        .filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0' })
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j]
        if (a.contains(b) || b.contains(a)) continue
        const r = a.getBoundingClientRect(), q = b.getBoundingClientRect()
        const w = Math.min(r.right, q.right) - Math.max(r.left, q.left)
        const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top)
        if (w > 2 && h > 2) {
          const d = (e) => `${e.tagName.toLowerCase()}.${String(e.getAttribute('class') || '').split(' ').slice(0, 3).join('.')}${e.textContent ? '"' + e.textContent.trim().slice(0, 20) + '"' : ''}`
          out.push(`${d(a)}  x  ${d(b)}  (${Math.round(w)}x${Math.round(h)})`)
        }
      }
    }
    return out.slice(0, 60)
  }, rootSel)
}

async function fontsUnder(page, rootSel, floor = 12) {
  return page.evaluate(({ rootSel, floor }) => {
    const root = document.querySelector(rootSel)
    if (!root) return ['no root ' + rootSel]
    const out = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const seen = new Set()
    while (walker.nextNode()) {
      const t = walker.currentNode
      if (!t.textContent.trim()) continue
      const el = t.parentElement
      if (seen.has(el)) continue
      seen.add(el)
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // skip sr-only
      if (el.closest('.u-sr-only')) continue
      const fs = parseFloat(cs.fontSize)
      if (fs < floor) out.push(`${fs}px ${el.tagName.toLowerCase()}.${el.className} "${t.textContent.trim().slice(0, 30)}"`)
    }
    return out
  }, { rootSel, floor })
}

async function clipped(page, rootSel) {
  return page.evaluate((rootSel) => {
    const root = document.querySelector(rootSel)
    if (!root) return []
    const out = []
    for (const el of root.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (el.closest('.u-sr-only')) continue
      if (el.scrollWidth > el.clientWidth + 1 && (cs.overflowX === 'hidden' || cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && el.clientWidth > 0) {
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} sw=${el.scrollWidth} cw=${el.clientWidth} "${(el.textContent || '').trim().slice(0, 40)}"`)
      }
    }
    // also: descendants overflowing the root horizontally
    const rr = root.getBoundingClientRect()
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width && (r.right > rr.right + 1 || r.left < rr.left - 1)) out.push(`OUTSIDE ${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} [${Math.round(r.left)}..${Math.round(r.right)}] root [${Math.round(rr.left)}..${Math.round(rr.right)}]`)
    }
    return out.slice(0, 40)
  }, rootSel)
}

const focusDesc = (page) => page.evaluate(() => {
  const a = document.activeElement
  if (!a) return 'none'
  return `${a.tagName.toLowerCase()}.${String(a.className).split(' ').slice(0, 3).join('.')} "${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 50)}"`
})

module.exports = { open, toChecks, fillAndRun, overlaps, fontsUnder, clipped, focusDesc, OUT }
