// s8: fix + save, then back to Access checks: do the counts move (memo invalidation through the real store)?
const L = require('./lib.cjs')
const O = L.OUT + 's8-'
;(async () => {
  const { browser, page, errors } = await L.open()
  await L.toChecks(page)
  await L.fillAndRun(page, 'Arun', 'AWS Console')
  await page.locator('button.tj-hero__strip').first().click()
  await page.waitForTimeout(1100)
  const before = await page.locator('.sit-attpanel .tj-cell').allInnerTexts()
  console.log('before', JSON.stringify(before.map((s) => s.replace(/\n/g, ' '))))
  await page.locator('.sit-attpanel').getByRole('button', { name: /Fix in policy/ }).first().click()
  await page.waitForTimeout(2200)
  await page.getByRole('button', { name: 'Save policy', exact: true }).click()
  await page.waitForTimeout(1200)
  console.log('crumbs', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button, a')].filter((e) => e.textContent.trim() === 'Policies').map((e) => e.className + ' @' + Math.round(e.getBoundingClientRect().x)))))
  await page.locator('.bbtop__crumb').first().click()
  await page.waitForTimeout(1500)
  console.log('dialogs', await page.locator('[role=dialog]').count(), 'url', page.url(), 'h1', await page.locator('h1').first().innerText().catch(() => '?'))
  await page.waitForTimeout(1200)
  await page.screenshot({ path: O + '00-policies.png' })
  await page.getByRole('button', { name: 'Check access', exact: true }).first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: O + '01-back.png' })
  if (await page.locator('.hiw').count()) {
    await L.fillAndRun(page, 'Arun', 'AWS Console')
  } else {
    console.log('no empty canvas; page kept its run')
  }
  const strip = page.locator('button.tj-hero__strip')
  console.log('strip', (await strip.allTextContents()).join(' | '))
  if (await strip.count()) {
    await strip.first().click()
    await page.waitForTimeout(1100)
    const after = await page.locator('.sit-attpanel .tj-cell').allInnerTexts()
    console.log('after', JSON.stringify(after.map((s) => s.replace(/\n/g, ' '))))
    await page.locator('.sit-attpanel').screenshot({ path: O + '02-after.png' })
  }
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
