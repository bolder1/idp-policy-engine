// node builder.js "<policy name>" "<person>" <tag>
const { chromium } = require('playwright')
const OUT = require('path').join(__dirname, 'out') + '/'; require('fs').mkdirSync(OUT, { recursive: true })
const [policyName, person, tag = 'b', W = '1440', H = '900'] = process.argv.slice(2)
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: Number(W), height: Number(H) } })
  await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1') } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto((process.env.BASE || 'http://localhost:5173/'), { waitUntil: 'networkidle' })
  await page.getByText(policyName, { exact: true }).first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}${tag}-0-builder.png` })
  const bar0 = await page.evaluate(() => [...document.querySelectorAll('.bbtop button')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean))
  console.log('bar before', JSON.stringify(bar0))
  await page.getByRole('button', { name: 'Check access', exact: true }).first().click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}${tag}-1-open.png` })
  const bar1 = await page.evaluate(() => [...document.querySelectorAll('.bbtop button')].map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim()).filter(Boolean))
  console.log('bar open', JSON.stringify(bar1))
  console.log('empty', JSON.stringify(await page.evaluate(() => ({ ways: [...document.querySelectorAll('.hiw__act button')].map((b) => `${b.textContent.trim()} ${b.className}`), oranges: [...document.querySelectorAll('.bx-btn--brand')].map((b) => b.textContent.trim()) }))))
  await page.locator('.hiw__act button').first().click()
  await page.waitForTimeout(600)
  await page.locator('.sit-ident .bb__whorow button').first().click()
  await page.waitForTimeout(500)
  await page.getByRole('radio', { name: new RegExp(person) }).first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}${tag}-2-form.png` })
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.waitForTimeout(13000)
  await page.screenshot({ path: `${OUT}${tag}-3-run.png` })
  const m = await page.evaluate(() => ({
    sent: document.querySelector('.tj-sent')?.getAttribute('aria-label'),
    vs: document.querySelector('.tj-hero__vs')?.textContent,
    changed: document.querySelector('.tj-hero__changed')?.textContent ?? null,
    hero: document.querySelector('.tj-hero')?.getBoundingClientRect().height,
    oranges: document.querySelectorAll('.bx-btn--brand').length,
  }))
  console.log(tag, JSON.stringify(m))
  await page.getByRole('button', { name: 'Past sign-ins' }).first().click().catch((e) => console.log('no past btn', String(e).slice(0, 80)))
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}${tag}-4-past.png` })
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
