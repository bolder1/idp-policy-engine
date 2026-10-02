// s9: re-check of the review fixes on :5320 (no server touched).
// A Maya on AWS: panel words (Can't tell, Needs, now-only move, non-zero tenant line), Back to why -> X focus, Fix in policy card.
// B Arun on AWS: Replay shuts the panel; fold/unfold no re-pulse; narrow pairs; held stricter played = no failure mark.
// C Arun on GitHub: weaker-factor note; played = "Weaker factor" mark.
const L = require('./lib.cjs')
const O = L.OUT + 'v2-'
const which = process.argv[2] || 'all'

const rowsDump = (page) => page.evaluate(() => [...document.querySelectorAll('.sit-attpanel .sit-att__row')].map((r) => ({
  g: r.className.replace('sit-att__row is-', ''),
  name: r.querySelector('.sit-att__name')?.textContent.replace('Run: ', ''),
  result: r.querySelector('.sit-att__result')?.textContent,
  spoken: r.querySelector('.sit-att__text > .u-sr-only')?.textContent,
  note: r.querySelector('.sit-att__note')?.textContent ?? null,
  moved: r.querySelector('.sit-att__moved')?.textContent ?? null,
  tenant: r.querySelector('.sit-att__tenant')?.textContent ?? null,
})))

async function A() {
  const { browser, page, errors } = await L.open()
  await L.toChecks(page)
  await L.fillAndRun(page, 'Maya Iyer', 'AWS Console')
  await page.locator('button.tj-hero__strip').first().click()
  await page.waitForTimeout(900)
  await page.locator('.sit-whypanel').getByRole('button', { name: /Review attempts/ }).first().click()
  await page.waitForTimeout(1200)
  await page.locator('.sit-attpanel').screenshot({ path: O + 'A1-panel.png' })
  const body = page.locator('.sit-attpanel .bb__inspbody')
  await body.evaluate((b) => { b.scrollTop = 520 })
  await page.waitForTimeout(200)
  await page.locator('.sit-attpanel').screenshot({ path: O + 'A2-panel-scrolled.png' })
  await body.evaluate((b) => { b.scrollTop = 0 })
  console.log('A rows', JSON.stringify(await rowsDump(page), null, 1))
  console.log('A panel overlaps', JSON.stringify(await L.overlaps(page, '.sit-attpanel')))
  console.log('A panel fonts<12', JSON.stringify((await L.fontsUnder(page, '.sit-attpanel')).filter((s) => !s.includes('bx-face'))))
  // Back to why, then the why's X: where does the focus go?
  await page.locator('.sit-attpanel [aria-label="Back to why"]').click()
  await page.waitForTimeout(600)
  console.log('A focus after back', await L.focusDesc(page))
  const x = page.locator('.sit-whypanel').getByRole('button', { name: /Close/ }).first()
  console.log('A why X count', await x.count())
  await x.click()
  await page.waitForTimeout(700)
  console.log('A panels after why X', await page.locator('.sit-panel').count(), 'focus', await L.focusDesc(page))
  // Fix in policy -> the builder's new card
  await page.locator('button.tj-hero__strip').first().click()
  await page.waitForTimeout(900)
  await page.locator('.sit-whypanel').getByRole('button', { name: /Review attempts/ }).first().click()
  await page.waitForTimeout(1200)
  await page.locator('.sit-attpanel').getByRole('button', { name: /Fix in policy/ }).first().click()
  await page.waitForTimeout(2200)
  await page.screenshot({ path: O + 'A3-builder.png' })
  console.log('A not-chosen hits', await page.getByText(/not chosen yet/i).count())
  console.log('A toasts', JSON.stringify(await page.locator('.bshell__toasttext').allTextContents()))
  const card = page.locator('.bb__card').first()
  console.log('A first card', (await card.innerText()).replace(/\n/g, ' / ').slice(0, 200))
  await page.getByRole('button', { name: 'Save policy', exact: true }).click().catch(() => {})
  await page.waitForTimeout(1200)
  console.log('A not-chosen after save', await page.getByText(/not chosen yet/i).count())
  await page.screenshot({ path: O + 'A4-after-save.png' })
  console.log(errors.length ? 'A ERRORS ' + errors.join(' | ') : 'A no errors')
  await browser.close()
}

async function B() {
  const { browser, page, errors } = await L.open()
  await L.toChecks(page)
  await L.fillAndRun(page, 'Arun', 'AWS Console')
  const strip = page.locator('button.tj-hero__strip')
  console.log('B strip', (await strip.allTextContents()).join(' | '))
  // fold and unfold: the strip is simply there, no second pulse
  console.log('B pulse before fold (settled)', await page.locator('.tj-hero__spulse').count())
  await page.locator('[data-node="outcome"] [aria-label="Fold the outcome"]').evaluate((b) => b.click())
  await page.waitForTimeout(400)
  await page.locator('[data-node="outcome"] [aria-label="Show the outcome"]').evaluate((b) => b.click())
  await page.waitForTimeout(40)
  const after = await page.evaluate(() => {
    const w = document.querySelector('.tj-hero__attempts')?.closest('.tj-hero__stripwrap')
    return { pulse: document.querySelectorAll('.tj-hero__spulse').length, opacity: w ? getComputedStyle(w).opacity : 'none', transform: w ? getComputedStyle(w).transform : 'none' }
  })
  console.log('B after unfold (40ms)', JSON.stringify(after))
  await page.locator('[data-node="outcome"]').first().screenshot({ path: O + 'B1-unfolded.png' })
  // Replay with the attempts panel open
  await strip.first().click()
  await page.waitForTimeout(1100)
  console.log('B panel open', await page.locator('.sit-attpanel').count())
  await page.locator('.tj-engine__replay button').first().click()
  await page.waitForTimeout(500)
  console.log('B after Replay (500ms): attpanel', await page.locator('.sit-attpanel').count(), 'panels', await page.locator('.sit-panel').count(), 'focus', await L.focusDesc(page))
  await page.screenshot({ path: O + 'B2-replaying.png' })
  await page.waitForTimeout(13000)
  // once landed, the strip arrives again for this new run (one pulse)
  console.log('B landed again: strip', await strip.count())
  // narrow panel: pairs on one line each
  await strip.first().click()
  await page.waitForTimeout(1100)
  await page.locator('.sit-attpanel [aria-label="Narrow the panel"]').click()
  await page.waitForTimeout(600)
  await page.locator('.sit-attpanel').screenshot({ path: O + 'B3-narrow.png' })
  const pairs = await page.evaluate(() => [...document.querySelectorAll('.sit-attpanel .sit-att__pair')].map((p) => Math.round(p.getBoundingClientRect().height)))
  console.log('B narrow pair heights (max)', Math.max(...pairs), 'count', pairs.length)
  console.log('B narrow overlaps', JSON.stringify(await L.overlaps(page, '.sit-attpanel')))
  console.log('B narrow clipped', JSON.stringify((await L.clipped(page, '.sit-attpanel')).filter((s) => !s.includes('u-sr-only'))))
  await page.locator('.sit-attpanel [aria-label="Widen the panel"]').click()
  await page.waitForTimeout(400)
  // a held row that got a stricter answer, played
  await page.locator('.sit-att__heldsum').click()
  await page.waitForTimeout(300)
  const held = await page.evaluate(() => [...document.querySelectorAll('.sit-att__held .sit-att__row')].map((r) => r.querySelector('.sit-att__name')?.textContent.replace('Run: ', '') + ' :: ' + r.querySelector('.sit-att__result')?.textContent))
  console.log('B held', JSON.stringify(held, null, 1))
  await page.locator('.sit-att__held .sit-att__row').filter({ hasText: 'Contractor on an unmanaged device' }).locator('.sit-att__play').click()
  await page.waitForTimeout(14000)
  const out = page.locator('[data-node="outcome"]').first()
  await out.scrollIntoViewIfNeeded()
  await out.screenshot({ path: O + 'B4-held-played.png' })
  console.log('B held played:', (await out.innerText()).replace(/\n/g, ' / ').slice(0, 200), '| expect marks', await page.locator('.tj-hero__expect').count())
  console.log(errors.length ? 'B ERRORS ' + errors.join(' | ') : 'B no errors')
  await browser.close()
}

async function C() {
  const { browser, page, errors } = await L.open()
  await L.toChecks(page)
  await L.fillAndRun(page, 'Arun', 'GitHub Enterprise')
  await page.locator('button.tj-hero__strip').first().click()
  await page.waitForTimeout(1100)
  const rows = await rowsDump(page)
  console.log('C weaker rows', JSON.stringify(rows.filter((r) => r.g === 'weaker-factor'), null, 1))
  const relay = page.locator('.sit-attpanel .sit-att__row.is-weaker-factor').first()
  await relay.scrollIntoViewIfNeeded()
  await relay.screenshot({ path: O + 'C1-weaker-row.png' })
  await relay.locator('.sit-att__play').click()
  await page.waitForTimeout(14000)
  const out = page.locator('[data-node="outcome"]').first()
  await out.scrollIntoViewIfNeeded()
  await out.screenshot({ path: O + 'C2-weaker-played.png' })
  const mark = page.locator('.tj-hero__expect')
  console.log('C weaker played:', (await out.innerText()).replace(/\n/g, ' / ').slice(0, 200), '| mark', await mark.count(), (await mark.allTextContents()).join(' | '), 'title', await mark.first().getAttribute('title').catch(() => null))
  console.log('C chain fonts<12', JSON.stringify((await L.fontsUnder(page, '.tj-chain')).filter((s) => !s.includes('bx-face'))))
  console.log(errors.length ? 'C ERRORS ' + errors.join(' | ') : 'C no errors')
  await browser.close()
}

;(async () => {
  if (which === 'all' || which === 'A') await A()
  if (which === 'all' || which === 'B') await B()
  if (which === 'all' || which === 'C') await C()
})().catch((e) => { console.error(e); process.exit(1) })
