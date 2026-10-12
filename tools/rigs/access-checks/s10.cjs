// s10 (7 Oct 2026): the why's group rows (no person row when a group gets her answer), Open rule after Fix,
// and the form's foot with no "Changes not run yet". Maya on AWS Console, then an edit to the form.
const L = require('./lib.cjs')
const O = L.OUT + 's10-'

;(async () => {
  const { browser, page, errors } = await L.open()
  await L.toChecks(page)
  await L.fillAndRun(page, 'Maya Iyer', 'AWS Console')
  await page.getByRole('button', { name: /Review conflict|^Why/ }).first().click()
  await page.waitForTimeout(1200)
  const why = page.locator('.tj-why').first()
  await why.screenshot({ path: O + 'why.png' })
  console.log('rows', JSON.stringify(await why.locator('.tj-why__grow').evaluateAll((els) => els.map((e) => `${e.tagName} ${e.className} | ${e.textContent}`))))
  console.log('open rule', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.tj-find.has-art')].map((c) => {
    const fix = c.querySelector('.tj-fix')?.getBoundingClientRect(), act = c.querySelector('.tj-find__acts > .tj-why__act')?.getBoundingClientRect()
    return { gapAfterFix: fix && act ? Math.round(act.left - fix.right) : null, sameRow: fix && act ? Math.abs(fix.top + fix.height / 2 - (act.top + act.height / 2)) < 2 : null }
  }))))
  // The form, changed and not run: the foot has Reset and Run only.
  await page.getByRole('button', { name: /Close why/ }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  const edit = page.locator('[aria-label*="Edit sign-in"], .tj-engine__edit').first()
  if (await edit.count()) await edit.click()
  await page.waitForTimeout(700)
  const net = page.locator('.sit-panel').getByText('Office network').first()
  if (await net.count()) {
    await net.click()
    await page.waitForTimeout(400)
    await page.getByRole('option').nth(1).click().catch(() => page.keyboard.press('Escape'))
    await page.waitForTimeout(500)
  }
  const foot = page.locator('.sit-panel .bb__inspfoot').first()
  console.log('foot', JSON.stringify(await foot.innerText().catch(() => 'no foot')))
  await foot.screenshot({ path: O + 'foot.png' }).catch(() => {})
  await page.locator('.sit-panel').first().screenshot({ path: O + 'panel.png' }).catch(() => {})
  console.log('errors', JSON.stringify(errors.filter((e) => !/Download the React DevTools/.test(e)).slice(0, 8)))
  await browser.close()
})()
