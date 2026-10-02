// Scenario 3 (+ weaker factor): person/app -> strip or quiet link; open; list rows; optionally play a group's first row
const L = require('./lib.cjs')
const [person, app, tag, playGroup] = process.argv.slice(2)
const O = L.OUT + tag + '-'
;(async () => {
  const { browser, page, errors } = await L.open()
  await L.toChecks(page)
  await L.fillAndRun(page, person, app)
  const outcome = page.locator('[data-node="outcome"]').first()
  await outcome.scrollIntoViewIfNeeded()
  await outcome.screenshot({ path: O + '01-outcome.png' })
  const strip = page.locator('button.tj-hero__strip')
  const link = page.locator('button.tj-hero__whybtn.tj-hero__attempts')
  const why = page.locator('button.tj-hero__whybtn:not(.tj-hero__attempts)')
  console.log('strip', await strip.count(), (await strip.allTextContents()).join(' | '))
  console.log('quiet link', await link.count(), (await link.allTextContents()).join(' | '), 'why?', await why.count())
  const by = page.locator('.tj-hero__by').first()
  if (await by.count()) { await by.screenshot({ path: O + '02-byline.png' }); console.log('byline box', JSON.stringify(await by.boundingBox())) }
  if (await link.count()) {
    const lb = await link.first().evaluate((e) => { const cs = getComputedStyle(e); return { fs: cs.fontSize, color: cs.color, h: e.getBoundingClientRect().height } })
    console.log('quiet link style', JSON.stringify(lb))
  }
  console.log('chain overlaps', JSON.stringify(await L.overlaps(page, '.tj-chain')))
  const opener = (await strip.count()) ? strip.first() : link.first()
  await opener.click()
  await page.waitForTimeout(1100)
  await page.screenshot({ path: O + '03-opened.png' })
  console.log('attpanel', await page.locator('.sit-attpanel').count(), 'whypanel', await page.locator('.sit-whypanel').count(), 'back', await page.locator('.sit-attpanel [aria-label="Back to why"]').count())
  const rows = await page.evaluate(() => [...document.querySelectorAll('.sit-attpanel .sit-att__row')].map((r) => `${r.className.replace('sit-att__row ', '')} | ${r.querySelector('.sit-att__name')?.textContent.replace('Run: ', '')} | ${r.querySelector('.sit-att__result')?.textContent} | ${r.querySelector('.sit-att__by')?.textContent} | fix=${!!r.querySelector('.sit-att__fix')}`))
  console.log(JSON.stringify(rows, null, 1))
  console.log('panel overlaps', JSON.stringify(await L.overlaps(page, '.sit-attpanel')))
  console.log('panel fonts<12', JSON.stringify((await L.fontsUnder(page, '.sit-attpanel')).filter((s) => !s.includes('bx-face'))))
  await page.locator('.sit-attpanel').screenshot({ path: O + '04-panel.png' })
  if (playGroup) {
    const r = page.locator(`.sit-attpanel .sit-att__row.is-${playGroup}`).first()
    if (await r.count()) {
      await r.screenshot({ path: O + '05-row.png' })
      console.log('playing', (await r.locator('.sit-att__name').innerText()).replace(/\n/g, ' '))
      await r.locator('.sit-att__play').click()
      await page.waitForTimeout(14000)
      const out2 = page.locator('[data-node="outcome"]').first()
      await out2.scrollIntoViewIfNeeded()
      await out2.screenshot({ path: O + '06-played.png' })
      console.log('played outcome:', (await out2.innerText()).replace(/\n/g, ' / ').slice(0, 260))
    } else console.log('no row in group', playGroup)
  }
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
