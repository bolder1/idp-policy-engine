// Scenario 1b: Fix in policy from Maya on AWS -> builder with the fix in the draft
const L = require('./lib.cjs')
const O = L.OUT + 's1b-'
;(async () => {
  const { browser, page, errors } = await L.open()
  await L.toChecks(page)
  await L.fillAndRun(page, 'Maya Iyer', 'AWS Console')
  await page.locator('button.tj-hero__strip').first().click()
  await page.waitForTimeout(900)
  await page.locator('.sit-whypanel').getByRole('button', { name: /Review attempts/ }).first().click()
  await page.waitForTimeout(1200)
  const fixBtn = page.locator('.sit-attpanel').getByRole('button', { name: /Fix in policy/ })
  console.log('fix buttons', await fixBtn.count())
  const t0 = Date.now()
  await fixBtn.first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: O + '01-arrive-400ms.png' })
  await page.waitForTimeout(1600)
  console.log('url/route', page.url(), 'elapsed', Date.now() - t0)
  await page.screenshot({ path: O + '02-builder.png' })
  // toast
  const toast = await page.evaluate(() => [...document.querySelectorAll('[role="status"], .bx-toast, [class*="toast"]')].map((e) => `${e.className}: ${e.innerText.replace(/\n/g, ' / ')}`).filter((s) => s.trim().length > 5))
  console.log('toasts', JSON.stringify(toast))
  const undo = page.getByRole('button', { name: /^Undo/ })
  console.log('undo buttons', await undo.count())
  // save bar
  const bar = await page.evaluate(() => [...document.querySelectorAll('[class*="savebar"], [class*="SaveBar"], .bb-save, [class*="save-bar"]')].map((e) => `${e.className}: ${e.innerText.replace(/\n/g, ' / ')}`))
  console.log('savebar', JSON.stringify(bar))
  console.log('review & save btn', await page.getByRole('button', { name: /Review & save/ }).count())
  // selected rule / focus
  console.log('focus', await L.focusDesc(page))
  const sel = await page.evaluate(() => [...document.querySelectorAll('[aria-selected="true"], .is-selected, .is-flash, [data-flash]')].map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ').slice(0, 4).join('.')} "${(e.innerText || '').trim().slice(0, 60).replace(/\n/g, ' / ')}"`))
  console.log('selected', JSON.stringify(sel, null, 1))
  // rules list in chain
  const cards = await page.evaluate(() => [...document.querySelectorAll('.bb__card, [data-rule-id], .rc')].slice(0, 12).map((e) => `${String(e.className).split(' ').slice(0, 3).join('.')} "${(e.innerText || '').trim().slice(0, 80).replace(/\n/g, ' / ')}"`))
  console.log('cards', JSON.stringify(cards, null, 1))
  // Inspector panel
  const insp = page.locator('.bb__insp').first()
  if (await insp.count()) { await insp.screenshot({ path: O + '03-inspector.png' }); console.log('insp:', (await insp.innerText()).slice(0, 400).replace(/\n/g, ' / ')) }
  await page.waitForTimeout(3000)
  await page.screenshot({ path: O + '04-builder-later.png' })
  // try Undo
  if (await undo.count()) {
    await undo.first().click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: O + '05-after-undo.png' })
    console.log('review & save after undo', await page.getByRole('button', { name: /Review & save/ }).count())
  }
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
