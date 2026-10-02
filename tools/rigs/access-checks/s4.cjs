// Scenario 4: Outlook timing + mid-run + Decided by link + Weaker-factor fix arrival on GitHub
const L = require('./lib.cjs')
const O = L.OUT + 's4-'
;(async () => {
  const { browser, page, errors } = await L.open()
  await L.toChecks(page)
  // mid-run: fill, run, screenshot at 3s
  await L.fillAndRun(page, 'Arun', 'Outlook', { wait: 3000 })
  await page.screenshot({ path: O + '01-midrun.png' })
  console.log('mid-run strip', await page.locator('button.tj-hero__strip').count(), 'link', await page.locator('button.tj-hero__whybtn.tj-hero__attempts').count())
  await page.waitForTimeout(11000)
  const strip = page.locator('button.tj-hero__strip')
  console.log('strip', (await strip.allTextContents()).join(' | '))
  // timing of panel open
  const t = await page.evaluate(async () => {
    const b = document.querySelector('button.tj-hero__strip')
    const t0 = performance.now()
    b.click()
    let tPanel = null
    await new Promise((res) => {
      const tick = () => {
        if (!tPanel && document.querySelector('.sit-attpanel')) tPanel = performance.now() - t0
        if (tPanel) return res()
        requestAnimationFrame(tick)
      }
      tick()
    })
    return { mount: Math.round(tPanel) }
  })
  console.log('panel mount ms', JSON.stringify(t))
  await page.waitForTimeout(1000)
  await page.locator('.sit-attpanel').screenshot({ path: O + '02-outlook-panel.png' })
  const rows = await page.evaluate(() => [...document.querySelectorAll('.sit-attpanel .sit-att__row')].map((r) => `${r.className.replace('sit-att__row ', '')} | ${r.querySelector('.sit-att__name')?.textContent.replace('Run: ', '')} | ${r.querySelector('.sit-att__result')?.textContent} | ${r.querySelector('.sit-att__by')?.textContent} | fix=${r.querySelector('.sit-att__fix')?.innerText.replace(/\n/g, ' / ') ?? '-'}`))
  console.log(JSON.stringify(rows, null, 1))
  const body = page.locator('.sit-attpanel .bb__inspbody')
  await body.evaluate((b) => { b.scrollTop = 600 })
  await page.waitForTimeout(200)
  await page.locator('.sit-attpanel').screenshot({ path: O + '03-outlook-panel-2.png' })
  console.log('panel overlaps', JSON.stringify(await L.overlaps(page, '.sit-attpanel')))
  // Decided by on a row -> builder with Check access
  await body.evaluate((b) => { b.scrollTop = 0 })
  const byBtn = page.locator('.sit-attpanel .sit-att__row.is-got-through .sit-att__by').first()
  console.log('clicking', await byBtn.innerText())
  await byBtn.click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: O + '04-decided-by.png' })
  console.log('after decided-by: title', await page.locator('.bb__titlebtn, h1, .bpage__title').first().innerText().catch(() => '?'))
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
