/* -----------------------------------------------------------------------------
   The fragments — real pieces of the console, photographed for the explainer.

   Film A never shows the console being used. It shows the console's own parts
   in motion: a rule card, a zone row, the chain. Those are screenshots of the
   live app, taken here at 2x so they stay crisp when the stage scales them,
   and written to fragments/<name>.png with their CSS size beside them.

   Everything the story needs is built in the app first — the Pune office
   zone, the Office laptops profile, the GitHub + Jira policy with its two
   rules — in a fresh browser profile, so the fragments show the story's own
   names and nothing else.
   -------------------------------------------------------------------------- */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const VIDEO = decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const U = (p) => `file:///${p.replace(/ /g, '%20')}`
const require = createRequire(`${U(VIDEO)}/package.json`)
const { chromium } = require('playwright')

const APP = 'http://localhost:4173/'
const OUT = path.join(import.meta.dirname, 'fragments')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen', '1') } catch {} })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

const btn = (re) => page.getByRole('button', { name: re }).first()
const rail = (n) => page.locator('.bshell__item, .bshell__subitem').filter({ hasText: new RegExp(`^${n}$`) }).first()
const goRail = async (n) => {
  const it = rail(n)
  if (!(await it.isVisible().catch(() => false))) { await rail('Policies').click(); await page.waitForTimeout(400) }
  await it.click(); await page.waitForTimeout(600)
}
const wait = (ms) => page.waitForTimeout(ms)
const manifest = {}
const listRow = async (searchPlaceholder, text) => {
  const q = page.locator(`input[placeholder*="${searchPlaceholder}" i], input[aria-label*="${searchPlaceholder}" i]`).first()
  await q.fill(text); await wait(600)
  return page.locator('.blist__open').filter({ hasText: text }).first().locator('xpath=..')
}
const shoot = async (name, loc, pad = 0) => {
  const el = loc.first()
  await el.waitFor({ state: 'visible', timeout: 10000 })
  await el.scrollIntoViewIfNeeded()
  await wait(250)
  const b = await el.boundingBox()
  const clip = { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, clip })
  manifest[name] = { w: Math.round(clip.width), h: Math.round(clip.height) }
  console.log(`${name.padEnd(14)} ${Math.round(clip.width)}×${Math.round(clip.height)}`)
}

await page.goto(APP, { waitUntil: 'networkidle' })
await wait(800)

/* --- build the story's zone -------------------------------------------- */
await goRail('Zones')
await btn(/^New zone$/).click(); await wait(500)
await page.locator('[role=dialog] input').first().fill('Pune office')
await btn(/^Continue$/).click(); await wait(800)
await page.locator('button, [role=tab]').filter({ hasText: /^Locations$/ }).first().click(); await wait(500)
await btn(/^Add location$/).click(); await wait(400)
await page.locator('input[aria-label="Search places"], input[placeholder="Search places"]').first().type('Pune', { delay: 30 })
await wait(700)
await page.locator('.bz7__hit').first().click(); await wait(600)
const km = page.locator('.bz7__rangenum').first()
await km.click(); await page.keyboard.press('Control+a'); await page.keyboard.type('25'); await wait(300)
await shoot('range', page.locator('.bz7__fields .bz7__fieldline').first(), 6)
await btn(/^Review & save$/).click(); await wait(600)
await page.locator('[role=dialog] .bx-btn--brand').last().click(); await wait(900)
await goRail('Zones')
await shoot('zone-row', await listRow('Search zones', 'Pune office'), 0)

/* --- the device profile ------------------------------------------------ */
await goRail('Device profiles')
await btn(/Create new profile/).click(); await wait(700)
await page.locator('input[placeholder="Corporate laptops"]').first().fill('Office laptops')
await page.locator('.bfp2__answer').first().click(); await wait(300)
await btn(/^Next$/).click(); await wait(700)
for (const n of ['Windows', 'Screen lock', 'Device integrity']) {
  await page.locator('.bfp2__pickrow').filter({ hasText: new RegExp(`^${n}`) }).first().click(); await wait(200)
}
/* The floor the film names. The wizard defaults the Windows check to 10; the
   narration says "Windows eleven or newer", and the fragment has to agree. */
await page.getByRole('combobox', { name: /Minimum Windows version/ }).first().click(); await wait(400)
await page.getByRole('option', { name: /Windows 11/ }).first().click(); await wait(300)
await btn(/^Next$/).click(); await wait(700)
await btn(/^Create profile$/).click(); await wait(1000)
/* the three check rows on the profile page */
const rows = page.locator('.bfp2__row, .bfp2__check, [data-check]')
if (await rows.count()) {
  for (let i = 0; i < Math.min(3, await rows.count()); i++) await shoot(`check-${i + 1}`, rows.nth(i), 4)
} else {
  await shoot('checks', page.locator('main section').filter({ hasText: /Checks/ }).first(), 8)
}
await goRail('Device profiles')
await shoot('profile-row', await listRow('Search device profiles', 'Office laptops'), 0)

/* --- the policy ---------------------------------------------------------- */
await goRail('All Policies')
await btn(/^New policy$/).click(); await wait(900)
await page.locator('button[aria-label="Rename"]').first().click(); await wait(300)
await page.locator('.bbtop__rename input').first().fill('Office laptops — GitHub and Jira')
await page.keyboard.press('Enter'); await wait(500)
await btn(/Start from scratch/).click(); await wait(600)
await page.locator('.bb__start').first().click(); await wait(600)
const search = page.locator('input[placeholder*="Search applications" i], input[aria-label*="Search applications" i]').first()
for (const name of ['GitHub', 'Jira']) {
  await search.fill(name); await wait(400)
  await page.locator('.bb__apps__item').filter({ hasText: new RegExp(name) }).first().click(); await wait(250)
}
await btn(/Save applications/).click(); await wait(700)

const condition = async (what, value) => {
  const plain = page.locator('.bb__ifadd').filter({ hasText: 'Add condition' }).first()
  if (await plain.isVisible().catch(() => false)) await plain.click()
  else {
    await page.locator('.bb__sec').filter({ hasText: /^\s*If/ }).locator('.bx-btn').filter({ hasText: /^Add$/ }).first().click()
    await wait(350)
    await page.getByRole('menuitem', { name: /^Add condition$/ }).first().click()
  }
  await wait(350)
  await page.getByRole('option', { name: what }).first().click(); await wait(400)
  await page.locator('.cp__fld').last().click(); await wait(350)
  await page.locator('[role=checkbox]').filter({ hasText: value }).first().click(); await wait(300)
  await page.keyboard.press('Escape'); await wait(300)
}

await page.locator('.bb__link__add').first().click(); await wait(700)
await page.locator('input[aria-label="Rule name"]').first().fill('Office laptop in Pune'); await wait(400)
const card1 = () => page.locator('.bb__card').nth(0)
await shoot('rule1-a', card1(), 6)               // named, empty
await condition(/Device profile/, /Office laptops/)
await wait(300); await shoot('rule1-b', card1(), 6) // + the device
await condition(/Network zone/, /Pune office/)
await wait(300); await shoot('rule1-c', card1(), 6) // + the place
{
  const allow1 = page.locator('.bb__insp').getByRole('radio', { name: /Allow/ }).first()
  for (let i = 0; i < 3 && !/then Allow/.test(((await card1().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ')); i++) { await allow1.scrollIntoViewIfNeeded(); await allow1.click(); await wait(500) }
  const c1 = ((await card1().innerText()) ?? '').replace(/\s+/g, ' ')
  if (!/then Allow Password/.test(c1) || /Second factor/.test(c1)) console.log('!! rule 1 not password-only: ' + c1.slice(0, 100))
}
await shoot('rule1-d', card1(), 6)               // + then: allow, password

await page.locator('.bb__link__add').last().click(); await wait(700)
const insp = page.locator('.bb__insp')
for (let i = 0; i < 20 && !/2$/.test(((await insp.locator('.bb__inspnum').textContent().catch(() => '')) ?? '').trim()); i++) await wait(150)
await insp.locator('input[aria-label="Rule name"]').first().fill('Everyone else'); await wait(200)
const allow2 = insp.getByRole('radio', { name: /Allow/ }).first()
const card2 = page.locator('.bb__card').nth(1)
for (let i = 0; i < 3 && !/Allow/.test((await card2.innerText().catch(() => '')) ?? ''); i++) { await allow2.scrollIntoViewIfNeeded(); await allow2.click(); await wait(450) }
if (!/Allow/.test((await card2.innerText().catch(() => '')) ?? '')) console.log('!! rule 2: card never shows Allow')
const second = insp.locator('.bb__thenfield').filter({ hasText: /Second factor/ }).locator('.bx-picker__trigger').first()
for (let i = 0; i < 3 && (await second.count()) && /None/.test((await second.textContent()) ?? ''); i++) {
  await second.click(); await wait(400)
  const opt = page.getByRole('option').filter({ hasText: /Any enabled method/ }).first()
  if (await opt.count()) await opt.click()
  await wait(400)
}
if (!(await second.count()) || /None/.test((await second.textContent()) ?? '')) console.log('!! rule 2: second factor not set')
console.log('card1:', ((await page.locator('.bb__card').nth(0).innerText()) ?? '').replace(/\s+/g, ' ').slice(0, 90))
console.log('card2:', ((await card2.innerText()) ?? '').replace(/\s+/g, ' ').slice(0, 90))
await wait(300); await shoot('rule2-d', page.locator('.bb__card').nth(1), 6)
await btn(/^Save policy$/).click(); await wait(900)

/* close the panel so the chain is clean, expand every card */
const close = page.locator('button[aria-label="Close the panel"]').first()
if (await close.count()) { await close.click(); await wait(500) }
const expand = btn(/^Expand all$/)
if (await expand.count()) { await expand.click(); await wait(700) }

await shoot('start', page.locator('.bb__start').first(), 6)
const cards = page.locator('.bb__card')
await shoot('rule1', cards.nth(0), 6)
await shoot('rule2', cards.nth(1), 6)
await shoot('default', cards.nth(2), 6)
await shoot('chain', page.locator('.bb__chain').first(), 24)
/* the outcome chips inside rule 1 and rule 2 */
await shoot('allow-password', cards.nth(0).locator('.bb__then, .bb__outcome, [class*="then"]').first(), 4).catch(() => {})
await shoot('allow-second', cards.nth(1).locator('.bb__then, .bb__outcome, [class*="then"]').first(), 4).catch(() => {})

/* the policy row in the list, and the expanded rule for the "sentence" shot */
await goRail('All Policies')
await page.locator('input[placeholder*="Search policies" i], input[aria-label*="Search policies" i]').first().fill('Office laptops'); await wait(600)
await shoot('policy-row', page.locator('.btable tbody tr').filter({ hasText: 'Office laptops' }).first(), 0)

/* --- the brand mark, for the last card ---------------------------------- */
await shoot('logo', page.locator('.bshell__logo').first(), 10)

/* --- the methods catalogue ---------------------------------------------- */
await goRail('Authentication methods')
await shoot('method-row', page.locator('.bm8__card').filter({ hasText: /Authenticator App/ }).first(), 0)

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
await browser.close()
console.log(`\n${Object.keys(manifest).length} fragments → ${OUT}`)
