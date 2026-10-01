// node shot.js "<person>" "<app>" <tag> [width] [height]
const { chromium } = require('playwright')
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true })
const [person, app, tag = 'x', W = '1440', H = '900'] = process.argv.slice(2)

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: Number(W), height: Number(H) } })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('idp.board-tour.seen', '1')
      localStorage.setItem('idp.tour.seen', '1')
    } catch {}
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto((process.env.BASE || 'http://localhost:5173/'), { waitUntil: 'networkidle' })
  const open = page.getByRole('button', { name: /^(Sign-in tests|Check access)$/ }).first()
  await open.click()
  await page.waitForSelector('.hiw')
  await page.locator('.hiw__act button').first().click()
  await page.waitForTimeout(500)
  // the person is picked from the sign-in card's Who row (as in stops.cjs; changed 1 Oct)
  await page.locator('.sit-ident .bb__whorow button').first().click()
  await page.waitForTimeout(500)
  await page.getByRole('radio', { name: new RegExp(person) }).first().click()
  await page.waitForTimeout(300)
  await page.getByText('Choose an application', { exact: true }).first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}${tag}-apps.png` })
  await page.getByText(app).last().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.waitForTimeout(13000)
  await page.screenshot({ path: `${OUT}${tag}-page.png` })
  const hero = page.locator('.tj-hero').first()
  if (await hero.count()) await hero.screenshot({ path: `${OUT}${tag}-hero.png` })
  const top = page.locator('.tj-chain').first()
  const m = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)?.getBoundingClientRect()
    return { hero: q('.tj-hero')?.height, main: q('.tj-hero__main')?.height, see: q('.tj-hero__see')?.height, side: q('.tj-hero__side')?.height }
  })
  console.log(tag, JSON.stringify(m), errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors')
  if (process.env.PRESS) {
    await page.locator('button.tj-sent').click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}${tag}-pressed.png` })
    const p2 = await page.evaluate(() => ({ panel: !!document.querySelector('.sit-panel, .tpanel, [class*="sit-panel"]'), active: document.activeElement?.className, hero: document.querySelector('.tj-hero')?.getBoundingClientRect().height }))
    console.log(tag, 'pressed', JSON.stringify(p2))
  }
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
