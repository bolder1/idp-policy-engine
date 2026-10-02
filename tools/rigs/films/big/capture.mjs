/* -----------------------------------------------------------------------------
   The fragments for the big film — real pieces of the console, photographed
   at 2x for the montage ("the six, answered") and the close.

   Built in a fresh browser profile: the Pune office zone, the Office laptops
   profile, the GitHub-and-Jira policy with its two rules, and one policy made
   only to be photographed — a rule that denies an out-of-date authenticator
   with a message (the shipped seed lets those in on one factor, and the film
   does not replay that). Then the seeded policies' own rule cards.

   Everything is asserted on the card text before it is photographed, because
   a fragment that says the wrong thing is worse than no fragment.
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
const problems = []
const text = async (loc) => ((await loc.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
const shoot = async (name, loc, pad = 0) => {
  const el = loc.first()
  await el.waitFor({ state: 'visible', timeout: 10000 })
  await el.scrollIntoViewIfNeeded()
  /* Centred, so the board's floating toolbar at the foot of the viewport is
     never sitting over the card being photographed. */
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {})
  await wait(350)
  const b = await el.boundingBox()
  const clip = { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, clip })
  manifest[name] = { w: Math.round(clip.width), h: Math.round(clip.height), text: (await text(el)).slice(0, 140) }
  console.log(`${name.padEnd(12)} ${Math.round(clip.width)}×${Math.round(clip.height)}  ${manifest[name].text.slice(0, 70)}`)
}
const expect = (ok, what) => { if (!ok) { problems.push(what); console.log('!! ' + what) } }

const condition = async (what, value, operator) => {
  const plain = page.locator('.bb__ifadd').filter({ hasText: 'Add condition' }).first()
  if (await plain.isVisible().catch(() => false)) await plain.click()
  else {
    await page.locator('.bb__sec').filter({ hasText: /^\s*If/ }).locator('.bx-btn').filter({ hasText: /^Add$/ }).first().click()
    await wait(350)
    await page.getByRole('menuitem', { name: /^Add condition$/ }).first().click()
  }
  await wait(350)
  await page.getByRole('option', { name: what }).first().click(); await wait(400)
  if (operator) {
    /* The value list opens itself after the attribute is chosen; a click on the
       operator field only closes it. Escape first, then open the operator. */
    await page.keyboard.press('Escape'); await wait(250)
    const trig = page.getByRole('button', { name: /Change how .* is compared/ }).last()
    for (let i = 0; i < 3; i++) {
      await trig.click(); await wait(350)
      const o = page.getByRole('option', { name: new RegExp(`^${operator}$`) }).first()
      if (await o.count()) { await o.click(); await wait(350); break }
    }
    expect(new RegExp(`Currently ${operator}`).test((await trig.getAttribute('aria-label')) ?? ''), 'operator not set to ' + operator)
  }
  /* The value list may already be open (it opens itself after the attribute,
     and again after the operator); a click on the field then only closes it. */
  if (!(await page.locator('[role=checkbox]').first().isVisible().catch(() => false))) { await page.locator('.cp__fld').last().click(); await wait(350) }
  await page.locator('[role=checkbox]').filter({ hasText: value }).first().click(); await wait(300)
  await page.keyboard.press('Escape'); await wait(300)
}
const openPolicy = async (name) => {
  await goRail('All Policies')
  const q = page.locator('input[placeholder*="Search policies" i], input[aria-label*="Search policies" i]').first()
  await q.fill(name.slice(0, 24)); await wait(600)
  await page.locator('.btable__link').filter({ hasText: name.slice(0, 24) }).first().click(); await wait(900)
  const close = page.locator('button[aria-label="Close the panel"]').first()
  if (await close.count()) { await close.click(); await wait(300) }
  const ex = btn(/^Expand all$/); if (await ex.count()) { await ex.click(); await wait(600) }
}
const cardMatching = async (re) => {
  const cards = page.locator('.bb__card')
  const n = await cards.count()
  for (let i = 0; i < n; i++) if (re.test(await text(cards.nth(i)))) return cards.nth(i)
  return null
}

await page.goto(APP, { waitUntil: 'networkidle' })
await wait(800)

/* --- the story's zone ------------------------------------------------------ */
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
await btn(/^Review & save$/).click(); await wait(600)
await page.locator('[role=dialog] .bx-btn--brand').last().click(); await wait(900)

/* --- the device profile ---------------------------------------------------- */
await goRail('Device profiles')
await btn(/Create new profile/).click(); await wait(700)
await page.locator('input[placeholder="Corporate laptops"]').first().fill('Office laptops')
await page.locator('.bfp2__answer').first().click(); await wait(300)
await btn(/^Next$/).click(); await wait(700)
for (const n of ['Windows', 'Screen lock', 'Device integrity']) {
  await page.locator('.bfp2__pickrow').filter({ hasText: new RegExp(`^${n}`) }).first().click(); await wait(200)
}
await page.getByRole('combobox', { name: /Minimum Windows version/ }).first().click(); await wait(400)
await page.getByRole('option', { name: /Windows 11/ }).first().click(); await wait(300)
await btn(/^Next$/).click(); await wait(700)
await btn(/^Create profile$/).click(); await wait(1000)

/* --- the policy we write on camera, built here for its two cards ------------ */
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
await page.locator('.bb__link__add').first().click(); await wait(700)
await page.locator('input[aria-label="Rule name"]').first().fill('Office laptop in Pune'); await wait(400)
await condition(/Device profile/, /Office laptops/)
await condition(/Network zone/, /Pune office/)
const card1 = () => page.locator('.bb__card').nth(0)
{
  const allow1 = page.locator('.bb__insp').getByRole('radio', { name: /Allow/ }).first()
  for (let i = 0; i < 3 && !/then Allow/.test(await text(card1())); i++) { await allow1.scrollIntoViewIfNeeded(); await allow1.click(); await wait(500) }
  const c1 = await text(card1())
  expect(/Allow Password/.test(c1) && !/Second factor/.test(c1), 'rule 1 not password-only: ' + c1.slice(0, 100))
}
await page.locator('.bb__link__add').last().click(); await wait(700)
const insp = page.locator('.bb__insp')
for (let i = 0; i < 20 && !/2$/.test(((await insp.locator('.bb__inspnum').textContent().catch(() => '')) ?? '').trim()); i++) await wait(150)
await insp.locator('input[aria-label="Rule name"]').first().fill('Everyone else'); await wait(200)
const allow2 = insp.getByRole('radio', { name: /Allow/ }).first()
const card2 = page.locator('.bb__card').nth(1)
for (let i = 0; i < 3 && !/Allow/.test(await text(card2)); i++) { await allow2.scrollIntoViewIfNeeded(); await allow2.click(); await wait(450) }
const second = insp.locator('.bb__thenfield').filter({ hasText: /Second factor/ }).locator('.bx-picker__trigger').first()
for (let i = 0; i < 3 && (await second.count()) && /None/.test((await second.textContent()) ?? ''); i++) {
  await second.click(); await wait(400)
  const opt = page.getByRole('option').filter({ hasText: /Any enabled method/ }).first()
  if (await opt.count()) await opt.click()
  await wait(400)
}
expect(/Second factor|Any enabled/.test(await text(card2)), 'rule 2 has no second factor: ' + (await text(card2)).slice(0, 100))
await btn(/^Save policy$/).click(); await wait(900)
{
  const close = page.locator('button[aria-label="Close the panel"]').first()
  if (await close.count()) { await close.click(); await wait(500) }
  const ex = btn(/^Expand all$/); if (await ex.count()) { await ex.click(); await wait(700) }
  await shoot('rule1', page.locator('.bb__card').nth(0), 6)   // x6 · Allow · Password
  await shoot('rule2', page.locator('.bb__card').nth(1), 6)   // x5 · Allow · Second factor
  await shoot('chain', page.locator('.bb__chain').first(), 24)
}

/* --- a rule that denies an old authenticator, with a message (x4) ------------ */
await goRail('All Policies')
await btn(/^New policy$/).click(); await wait(900)
await page.locator('button[aria-label="Rename"]').first().click(); await wait(300)
await page.locator('.bbtop__rename input').first().fill('Current authenticator app')
await page.keyboard.press('Enter'); await wait(500)
await btn(/Start from scratch/).click(); await wait(600)
await page.locator('.bb__start').first().click(); await wait(600)
await search.fill('Monitoring'); await wait(400)
{
  const hit = page.locator('.bb__apps__item').first()
  if (await hit.count()) await hit.click()
  else { await search.fill('Grafana'); await wait(400); await page.locator('.bb__apps__item').first().click() }
  await wait(250)
}
await btn(/Save applications/).click(); await wait(700)
await page.locator('.bb__link__add').first().click(); await wait(700)
await page.locator('input[aria-label="Rule name"]').first().fill('Authenticator out of date'); await wait(300)
await condition(/Device profile/, /Current miniOrange client/, 'does not match')
{
  const deny = page.locator('.bb__insp').getByRole('radio', { name: /Deny/ }).first()
  await deny.scrollIntoViewIfNeeded(); await deny.click(); await wait(500)
  const msg = page.locator('.bb__insp textarea').first()
  if (await msg.count()) { await msg.fill('Update the miniOrange app, then sign in again.'); await wait(300) }
  else problems.push('no deny message field')
  const c = await text(card1())
  expect(/does not match/.test(c) && /Deny/.test(c), 'authenticator rule wrong: ' + c.slice(0, 120))
}
await btn(/^Save policy$/).click(); await wait(900)
{
  const close = page.locator('button[aria-label="Close the panel"]').first()
  if (await close.count()) { await close.click(); await wait(500) }
  const ex = btn(/^Expand all$/); if (await ex.count()) { await ex.click(); await wait(600) }
  await shoot('x4', page.locator('.bb__card').nth(0), 6)
}

/* --- the seeded policies' cards ------------------------------------------------ */
await openPolicy('Untrusted device — rooted, jailbroken or tampered')
{ const c = await cardMatching(/Integrity check failed/); expect(!!c && /Deny/.test(await text(c)), 'x1 card'); if (c) await shoot('x1', c, 6) }

await openPolicy('Mobile access requires a screen lock')
{ const c = await cardMatching(/Handset with no passcode/); expect(!!c && /Deny/.test(await text(c)), 'x2 card'); if (c) await shoot('x2', c, 6) }

await openPolicy('Device OS Compliance — allow or deny')
/* The default card carries the policy's own name for it only in the data; on the board it reads "Nothing else matched · Deny", which is the whole point. */
{ const c = await cardMatching(/Nothing else matched/); expect(!!c && /Deny/.test(await text(c)), 'x3 card'); if (c) await shoot('x3', c, 6) }
/* and the floor itself, from the profile it reads */
await goRail('Device profiles')
{
  const q = page.locator('input[placeholder*="Search device profiles" i], input[aria-label*="Search device profiles" i]').first()
  await q.fill('Current OS'); await wait(600)
  await page.locator('.blist__open').filter({ hasText: 'Current OS builds' }).first().click(); await wait(900)
  const row = page.locator('.bfp2__chosenbox').filter({ hasText: /Windows/ }).first()
  if (await row.count()) await shoot('x3floor', row, 4)
  else { const any = page.locator('main').getByText(/Windows 11/).first(); if (await any.count()) await shoot('x3floor', any.locator('xpath=..'), 8); else problems.push('no OS floor row') }
}

/* --- the brand mark ------------------------------------------------------------ */
await goRail('All Policies')
await shoot('logo', page.locator('.bshell__logo').first(), 10)

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
await browser.close()
console.log(`\n${Object.keys(manifest).length} fragments → ${OUT}`)
if (problems.length) { console.log('PROBLEMS:\n  ' + problems.join('\n  ')); process.exitCode = 1 }
