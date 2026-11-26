// Dark-mode sweep (26 Nov 2026): opens every rail page with the console in dark, lists what still draws light
// (an opaque light fill, a light gradient, a light drawing) or reads too faint (words under 3:1 on the ground they sit
// on), grouped by class (audit-fn.cjs), and screenshots each page into out/. scenes.cjs goes past the rail.
// Start a dev server from this checkout first, then: BASE=http://localhost:5192/ node tools/rigs/dark-sweep/audit.cjs
// Optional: ONLY="Zones,Apps" to audit a few rail items; THEME=light to compare.
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const { audit } = require('./audit-fn.cjs')

const BASE = process.env.BASE || 'http://localhost:5173/'
const THEME = process.env.THEME || 'dark'
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean)
const OUT = path.join(__dirname, 'out') + '/'
fs.mkdirSync(OUT, { recursive: true })

/* [rail group, rail item]: the pages with a screen behind them (the rail's inert rows have none). The rail is an
   accordion, so each item's group is opened first. */
const RAIL = [
  [null, 'Dashboard'],
  [null, 'Apps'],
  ['Policy', 'All Policies'],
  ['Policy', 'Zones'],
  ['Policy', 'Device profiles'],
  ['Policy', 'Risk signal profile'],
  ['Policy', 'External Hooks'],
  [null, 'Authentication methods'],
  ['Users', 'User List'],
  ['Users', 'User Roles'],
  ['Groups', 'Manage Groups'],
]

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript((theme) => {
    try {
      localStorage.setItem('idp.board-tour.seen', '1')
      localStorage.setItem('idp.tour.seen', '1')
      localStorage.setItem('idp.line-email', 'design@prototype.test')
      localStorage.setItem('idp.line', 'design')
      localStorage.setItem('idp.theme', theme)
    } catch {}
  }, THEME)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(BASE)
  await page.waitForTimeout(1800)

  const pages = ONLY.length ? RAIL.filter(([, l]) => ONLY.includes(l)) : RAIL
  console.log(`auditing ${pages.length} rail pages`)
  const report = []
  let n = 0
  for (const [group, item] of pages) {
    const ok = await page.evaluate(
      async ([group, item]) => {
        const wait = (t) => new Promise((r) => setTimeout(r, t))
        const find = (l) => [...document.querySelectorAll('nav button, nav a')].find((b) => b.textContent.trim().replace(/New$/, '').trim() === l)
        const g = group && find(group)
        if (g && g.getAttribute('aria-expanded') === 'false') {
          g.click()
          await wait(350)
        }
        const el = find(item)
        if (!el) return false
        el.click()
        await wait(1200)
        return true
      },
      [group, item],
    )
    const file = String(++n).padStart(2, '0') + '-' + item.replace(/\W+/g, '-').toLowerCase()
    if (!ok) {
      console.log(`${file} | not found`)
      continue
    }
    await page.screenshot({ path: OUT + file + '.png' })
    const found = await page.evaluate(audit)
    report.push({ page: item, file, found })
    console.log(`\n== ${file} (${found.length})`)
    for (const f of found.slice(0, 30)) console.log(`  ${f.kind.padEnd(14)} ${String(f.n).padStart(3)}  ${f.key}  ${f.detail}  "${f.text}"`)
  }
  fs.writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 2))
  console.log(errors.length ? '\nERRORS ' + errors.join('\n') : '\nno page errors')
  await browser.close()
}
main()
