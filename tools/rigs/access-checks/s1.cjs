// Scenario 1: Maya Iyer on AWS Console (has a conflict)
const L = require('./lib.cjs')
const O = L.OUT + 's1-'
;(async () => {
  const { browser, page, errors } = await L.open()
  await L.toChecks(page)
  await L.fillAndRun(page, 'Maya Iyer', 'AWS Console')
  await page.screenshot({ path: O + '01-run.png' })
  const strip = page.locator('.tj-hero__strip')
  console.log('strip count', await strip.count(), 'text:', (await strip.allTextContents()).join(' | '))
  console.log('attempts link', await page.locator('.tj-hero__attempts').count())
  const outcome = page.locator('[data-node="outcome"]').first()
  if (await outcome.count()) { await outcome.scrollIntoViewIfNeeded(); await outcome.screenshot({ path: O + '02-outcome.png' }) }
  console.log('chain overlaps', JSON.stringify(await L.overlaps(page, '.tj-chain'), null, 1))
  // open Why from the strip
  await page.locator('button.tj-hero__strip').first().click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: O + '03-why.png' })
  const why = page.locator('.sit-whypanel')
  console.log('why panels', await why.count())
  // scroll the why panel body to bottom
  await page.evaluate(() => { const b = document.querySelector('.sit-whypanel .bb__inspbody') || document.querySelector('.sit-whypanel'); if (b) b.scrollTop = b.scrollHeight })
  await page.waitForTimeout(300)
  await page.screenshot({ path: O + '04-why-bottom.png' })
  const att = page.locator('.sit-whypanel .tj-why__att')
  console.log('why att section', await att.count())
  if (await att.count()) {
    await att.first().screenshot({ path: O + '05-why-att.png' })
    console.log('att text:', (await att.first().innerText()).replace(/\n/g, ' / '))
    console.log('cells', await att.locator('.tj-cell').count())
    // is the att section the last child?
    console.log('att is last child:', await page.evaluate(() => { const a = document.querySelector('.sit-whypanel .tj-why__att'); return a && a === a.parentElement.lastElementChild }))
  }
  console.log('why fonts<12', JSON.stringify(await L.fontsUnder(page, '.sit-whypanel')))
  // Review attempts
  const rev = page.locator('.sit-whypanel').getByRole('button', { name: /Review attempts/ })
  console.log('review btn', await rev.count())
  await rev.first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: O + '06-attempts.png' })
  console.log('focus after swap:', await L.focusDesc(page))
  console.log('back arrow', await page.locator('.sit-attpanel [aria-label="Back to why"]').count())
  console.log('panels in dom', await page.locator('.sit-panel').count())
  console.log('groups', (await page.locator('.sit-att__gh').allTextContents()).join(' | '))
  console.log('held open?', await page.locator('.sit-att__held').evaluate((d) => d.open).catch(() => 'n/a'))
  console.log('panel fonts<12', JSON.stringify(await L.fontsUnder(page, '.sit-attpanel')))
  console.log('panel overlaps', JSON.stringify(await L.overlaps(page, '.sit-attpanel'), null, 1))
  console.log('panel clipped', JSON.stringify(await L.clipped(page, '.sit-attpanel'), null, 1))
  // full panel screenshots by scrolling body
  const body = page.locator('.sit-attpanel .bb__inspbody')
  const sh = await body.evaluate((b) => [b.scrollHeight, b.clientHeight])
  console.log('panel body scroll/client', sh)
  let i = 0
  for (let y = 0; y < sh[0]; y += sh[1] - 40) {
    await body.evaluate((b, y) => { b.scrollTop = y }, y)
    await page.waitForTimeout(200)
    await page.locator('.sit-attpanel').screenshot({ path: O + `07-panel-${i++}.png` })
  }
  // open Held
  await page.locator('.sit-att__heldsum').click()
  await page.waitForTimeout(300)
  await body.evaluate((b) => { b.scrollTop = b.scrollHeight })
  await page.waitForTimeout(200)
  await page.locator('.sit-attpanel').screenshot({ path: O + '08-held-open.png' })
  console.log('held rows', await page.locator('.sit-att__held .sit-att__row').count())
  await page.locator('.sit-att__heldsum').click()
  await page.waitForTimeout(200)
  // rows summary
  const rows = await page.evaluate(() => [...document.querySelectorAll('.sit-attpanel .sit-att__row')].map((r) => ({ cls: r.className, name: r.querySelector('.sit-att__name')?.textContent, by: r.querySelector('.sit-att__by')?.textContent, fix: !!r.querySelector('.sit-att__fix'), fixtext: r.querySelector('.sit-att__fix')?.innerText.replace(/\n/g, ' / ') })))
  console.log(JSON.stringify(rows, null, 1))
  // play first hole row
  await body.evaluate((b) => { b.scrollTop = 0 })
  const first = page.locator('.sit-att__row.is-got-through .sit-att__play').first()
  const nm = await first.locator('.sit-att__name').innerText()
  console.log('playing', nm)
  await first.click()
  await page.waitForTimeout(600)
  console.log('panels after play', await page.locator('.sit-panel').count())
  await page.waitForTimeout(13000)
  await page.screenshot({ path: O + '09-played.png' })
  const out2 = page.locator('[data-node="outcome"]').first()
  if (await out2.count()) { await out2.scrollIntoViewIfNeeded(); await out2.screenshot({ path: O + '10-played-outcome.png' }); console.log('played outcome:', (await out2.innerText()).replace(/\n/g, ' / ')) }
  const sin = page.locator('[data-node="sign-in"]').first()
  if (await sin.count()) { await sin.screenshot({ path: O + '11-played-signin.png' }); console.log('played signin:', (await sin.innerText()).replace(/\n/g, ' / ')) }
  console.log('chain overlaps after play', JSON.stringify(await L.overlaps(page, '.tj-chain'), null, 1))
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
