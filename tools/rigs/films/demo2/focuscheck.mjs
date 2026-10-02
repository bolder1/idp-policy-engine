import { open } from './rig.mjs'
import fs from 'node:fs'
const OUT = 'rec/demo2/focus-check'
fs.rmSync(OUT, { recursive: true, force: true })
const { browser, ctx, page, rig, app } = await open({ out: OUT, appUrl: 'http://localhost:4173/', vo: {}, subs: {}, fast: false })
const rail = (n) => app.locator('.bshell__item, .bshell__subitem').filter({ hasText: new RegExp(`^${n}$`) }).first()
await app.locator('.bshell__item').first().waitFor({ state: 'visible', timeout: 20000 })
await page.evaluate(() => window.__stage.sub('We will make one for the Pune office.'))
await rail('Zones').click(); await page.waitForTimeout(900)
await rig.focus(app.getByRole('button', { name: /^New zone$/ }).first(), 'Start here', 'above')
await page.waitForTimeout(500)
await page.screenshot({ path: 'rec/demo2/focus-zone.png' })
await rig.unring(); await page.waitForTimeout(800)
await rig.card('<div class="card"><div class="kick land">02</div><h1 class="land d1">Device profiles</h1><p class="land d2">A checklist the machine has to pass.</p></div>')
await page.waitForTimeout(1100)
await page.screenshot({ path: 'rec/demo2/focus-card.png' })
await ctx.close(); await browser.close()
fs.rmSync(OUT, { recursive: true, force: true })
console.log('ok')
