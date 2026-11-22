// The empty tenant's pages (20 Nov 2026, docs/EMPTY-STATES.md): opens each rail page, lists the empty state it draws
// (ART = the drawing, ICON = the icon circle) and screenshots it into out/.
// Start the empty server first (npm run dev:empty), then: node tools/rigs/empty-states/explore.cjs
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const BASE = process.env.BASE || 'http://localhost:5191/'
const OUT = path.join(__dirname, 'out') + '/'
fs.mkdirSync(OUT, { recursive: true })

/* [rail group, rail item]. The rail is an accordion, so each item's group is opened first. */
const PAGES = [
  ['Policy', 'All Policies'],
  ['Policy', 'Zones'],
  ['Policy', 'Device profiles'],
  ['Policy', 'Risk signal profile'],
  ['Policy', 'External Hooks'],
  [null, 'Apps'],
  ['Users', 'User List'],
  ['Users', 'User Roles'],
  ['Groups', 'Manage Groups'],
  [null, 'Authentication methods'],
  [null, 'Dashboard'],
]

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('idp.board-tour.seen', '1')
      localStorage.setItem('idp.tour.seen', '1')
      localStorage.setItem('idp.line-email', 'design@prototype.test')
      localStorage.setItem('idp.line', 'design')
    } catch {}
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(BASE)
  await page.waitForTimeout(1500)
  let n = 0
  for (const [group, label] of PAGES) {
    const found = await page.evaluate(
      async ([group, label]) => {
        const wait = (t) => new Promise((r) => setTimeout(r, t))
        const find = (l) => [...document.querySelectorAll('nav button, nav a')].find((b) => b.textContent.trim().replace(/New$/, '') === l)
        const g = group && find(group)
        if (g && g.getAttribute('aria-expanded') === 'false') {
          g.click()
          await wait(350)
        }
        const el = find(label)
        if (!el) return 'not in the rail'
        el.click()
        await wait(1000)
        const states = [...document.querySelectorAll('.bempty')].map(
          (e) => `${e.querySelector('svg.bempty__svg') ? 'ART' : 'ICON'} ${e.querySelector('.bempty__title')?.textContent ?? ''} — ${e.querySelector('.bempty__blurb')?.textContent ?? ''}`,
        )
        return states.join(' || ') || '(no empty state)'
      },
      [group, label],
    )
    const file = String(++n).padStart(2, '0') + '-' + label.replace(/\W+/g, '-').toLowerCase()
    await page.screenshot({ path: OUT + file + '.png' })
    console.log(`${file} | ${found}`)
  }
  console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors')
  await browser.close()
}
main()
