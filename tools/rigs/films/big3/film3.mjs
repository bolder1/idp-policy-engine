/* -----------------------------------------------------------------------------
   The third cut — the take.

   Ideas on a dark stage, told with product-like UI pieces and kinetic type
   (after the WSO2 / LuminBI references); the console on a light stage, with a
   camera that pushes in on what is being used. No ring labels, no "Used by".

     node film3.mjs --fast     proves every selector without the pacing
   -------------------------------------------------------------------------- */
import fs from 'node:fs'
import path from 'node:path'

import { SCRIPT, SUBS } from './script.mjs'
import { open } from './rig3.mjs'

const FAST = process.argv.includes('--fast')
const HERE = import.meta.dirname
const OUT = path.join(HERE, FAST ? 'take-dry' : process.argv.includes('--short') ? 'take-short' : 'take')
const APP = 'http://localhost:4173/'

const vo = {}
for (const id of Object.keys(SCRIPT)) {
  const f = path.join(HERE, 'voice', `${id}.json`)
  if (!fs.existsSync(f)) throw new Error(`no voice for ${id} — run vo.mjs`)
  vo[id] = { duration: FAST ? 0.05 : JSON.parse(fs.readFileSync(f, 'utf8')).duration }
}

fs.rmSync(OUT, { recursive: true, force: true })
const { browser, page, rig, app } = await open({ out: OUT, appUrl: APP, vo, subs: SUBS, fast: FAST, record: !FAST })

/* --- vocabulary -------------------------------------------------------------- */
const btn = (re) => app.getByRole('button', { name: re }).first()
const rail = (n) => (n === 'Policies' ? app.locator('.bshell__item') : app.locator('.bshell__subitem')).filter({ hasText: new RegExp(`^${n}$`) }).first()
const tab = (n) => app.locator('button, [role=tab]').filter({ hasText: new RegExp(`^${n}$`) }).first()
const opt = (re) => app.getByRole('option', { name: re }).first()
const pick = (re) => app.locator('[role=checkbox]').filter({ hasText: re }).first()
const combo = (label) => app.getByRole('combobox', { name: label }).first()
const st = (fn, ...a) => rig.st(fn, ...a)
const hold = (ms) => rig.hold(ms)
const step = (s, on) => rig.step(s, on)
const sc = (sel, cls, on) => rig.sc(sel, cls, on)
const has = async (loc, ms = 5000) => { try { await loc.first().waitFor({ state: 'visible', timeout: ms }); return true } catch { return false } }
const goRail = async (name) => {
  const item = rail(name)
  if (!(await item.isVisible().catch(() => false))) { await rig.click(rail('Policies')); await hold(380) }
  await rig.click(item); await hold(360)
}
const look = async (loc, s = 1.5, ms = 600) => { if (!(await has(loc))) { rig.missing.push('look: nothing'); return } await rig.look(loc, s, ms) }
const escape = async () => { await rig.press('Escape'); await hold(280) }
const closeDialog = async () => {
  const x = app.locator('[role=dialog] button[aria-label="Close"], [role=dialog] .bx-dialog__x').first()
  if (await x.count()) { await rig.click(x); await hold(320); return }
  const c = app.locator('[role=dialog]').getByRole('button', { name: /^(Cancel|Close)$/ }).first()
  if (await c.count()) { await rig.click(c); await hold(320); return }
  await escape()
}
const condition = async (what, value) => {
  const plain = app.locator('.bb__ifadd').filter({ hasText: 'Add condition' }).first()
  if (await plain.isVisible().catch(() => false)) await rig.click(plain)
  else {
    await rig.click(app.locator('.bb__iffoot .bx-menu__trigger').filter({ hasText: /^Add$/ }).first()); await hold(360)
    await rig.click(app.getByRole('menuitem', { name: /^Add condition$/ }).first())
  }
  await hold(360)
  await rig.click(opt(what)); await hold(400)
  if (!(await app.locator('[role=checkbox]').first().isVisible().catch(() => false))) { await rig.click(app.locator('.cp__fld').last()); await hold(360) }
  await rig.click(pick(value)); await hold(300)
  await rig.press('Escape'); await hold(300)
  const got = await app.locator('.cp__fld').last().getAttribute('aria-label')
  if (!got || /Currently nothing/.test(got)) rig.missing.push(`condition empty: ${what}`)
}
const cardText = async (i) => ((await app.locator('.bb__card').nth(i).innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ')
const dialogBtn = (re) => app.locator('[role=dialog]').getByRole('button', { name: re }).first()

/* dark stage ↔ light console */
const DRAWN = 3, CONSOLE = 2
const toConsole = async (url) => {
  await rig.scene(null); await hold(FAST ? 40 : 350)
  await rig.setSlow(CONSOLE)
  await st('lit', true); await rig.url(url); await hold(FAST ? 40 : 300)
  await st('hold', 'on'); await hold(FAST ? 40 : 1150)
  await rig.cursor(true)
}
const toStage = async (name, tone = 'warm') => {
  await rig.cursor(false); await rig.wide(); await rig.park()
  await rig.setSlow(DRAWN)
  await st('hold', 'off'); await hold(FAST ? 40 : 500); await st('lit', false); await st('tone', tone); await hold(FAST ? 40 : 600)
  await rig.scene(name)
}

try {
  await rig.cursor(false)
  await rig.setSlow(DRAWN)
  /* ============================== INTRO ============================== */
  rig.section('board')
  await rig.scene('intro'); await hold(FAST ? 40 : 500)
  await rig.say('i1', async (at) => {
    await at(0.0, async () => { await rig.shot('a'); await hold(340); await sc('.ka', 'on') })
    await at(0.74, async () => { await rig.shot('b'); await step('card') })
  }, { cap: false })
  await rig.say('i2', async (at) => { await at(0.02, () => step('type')); await at(0.66, () => step('ok')) })
  await rig.say('i3', async (at) => { await at(0.0, async () => { await rig.shot('c'); await step('log') }) })
  await rig.say('i4', async (at) => {
    await at(0.0, async () => { await rig.shot('d'); await hold(340); await sc('.kd1', 'on') })
    await at(0.52, () => sc('.kd2', 'on'))
  }, { cap: false })
  rig.section('hook')
  await rig.say('i5', async (at) => { await at(0.0, async () => { await rig.shot('e'); await step('three') }) })
  await rig.say('i6', async (at) => { await at(0.0, async () => { await rig.shot('f'); await step('flute'); await step('brand') }) }, { cap: false })
  await hold(FAST ? 60 : 1300)

  /* ============================== ZONE ============================== */
  rig.section('demo')
  await st('tone', 'cool'); await rig.scene('zone'); await hold(FAST ? 40 : 300); await rig.shot('a'); await step('hero')
  await rig.say('z1', async (at) => {
    await at(0.18, () => sc('.ping.a1', 'on')); await at(0.36, () => sc('.ping.a2', 'on')); await at(0.54, () => sc('.ping.a3', 'on'))
  })
  await rig.say('z2', async (at) => {
    await at(0.0, async () => { await sc('.ping.a1,.ping.a2,.ping.a3', 'on', false); await step('card') })
    await at(0.3, () => sc('.ur.r1', 'on'))
    await at(0.46, async () => { await sc('.ur.r2', 'on'); await step('state'); await st('mapcam', 'state') })
    await at(0.66, async () => { await sc('.ur.r3', 'on'); await step('city'); await st('mapcam', 'city') })
  })
  await rig.say('z3', async (at) => {
    await at(0.0, async () => { await step('ring'); await step('fine') })
    await at(0.2, async () => { await sc('.office', 'on'); await sc('.ur.r4', 'on') })
    await at(0.68, async () => { await step('both'); await sc('.ur.r3,.ur.r4', 'hl') })
  })
  await rig.say('z4', async (at) => {
    await at(0.05, () => sc('.ping.c1', 'on')); await at(0.22, () => sc('.ping.c2', 'on')); await at(0.39, () => sc('.ping.c3', 'on'))
    await at(0.62, async () => { await sc('.ping.c1,.ping.c2', 'in'); await sc('.ping.c3', 'out') })
  })
  await rig.say('z5', async (at) => {
    await at(0.0, async () => { await rig.shot('b'); await hold(120); await sc('.named', 'on') })
    await at(0.36, () => st('wireflow'))
  })
  await hold(FAST ? 40 : 500)

  /* — zones, in the console — */
  await toConsole('/admin/policies/zones')
  await goRail('Zones')
  if (process.argv.includes('--short')) throw new Error('short take ends here')
  await rig.say('zc1', async () => {
    await look(app.locator('input[aria-label="Search zones"]'), 1.45, 700)
    const show = combo(/Filter by what a zone is made of/)
    await rig.click(show); await hold(380); await rig.click(opt(/^Locations$/)); await hold(FAST ? 40 : 700)
    await rig.wide()
  })
  await rig.say('zc2', async () => {
    await rig.click(btn(/^New zone$/)); await hold(420)
    const name = app.locator('[role=dialog] input').first()
    await rig.closeOn(name, 1.7)
    await rig.typeIn(name, 'Pune office')
    await rig.click(btn(/^Continue$/)); await hold(520)
    await rig.wide()
    await rig.click(tab('Locations')); await hold(380)
    await rig.click(btn(/^Add location$/)); await hold(360)
    const where = app.locator('input[aria-label="Search places"], input[placeholder="Search places"]').first()
    await rig.closeOn(where, 1.6)
    await rig.typeIn(where, 'Pune', { delay: 70 })
    await hold(400); await rig.click(app.locator('.bz7__hit').first()); await hold(400)
    await rig.click(app.locator('.bz7__rangenum').first()); await rig.press('Control+a'); await rig.keys('25', { delay: 90 }); await hold(FAST ? 40 : 500)
    await rig.wide()
    await rig.click(tab('IP networks')); await hold(360)
    const mine = app.locator('button.bz7__quickbtn').first()
    if (await mine.count()) { await rig.click(mine); await hold(360) }
    await look(app.locator('ul.bz7__fields li').first(), 1.6, 500)
  })
  await rig.say('zc3', async () => {
    await rig.wide()
    await rig.click(btn(/^Review & save$/)); await hold(460)
    await look(app.locator('[role=dialog] .bx-rv').first(), 1.3, 500)
    const go = app.locator('[role=dialog] .bx-btn--brand').last()
    if (await go.count()) await rig.click(go)
    await hold(500)
  })

  /* ============================== DEVICE ============================== */
  await toStage('device', 'warm'); await hold(FAST ? 40 : 200)
  await rig.say('d1', async (at) => { await at(0.0, async () => { await rig.shot('a'); await step('kinds') }) })
  await rig.say('d2', async (at) => {
    await at(0.0, async () => { await rig.shot('b'); await step('health') })
    await at(0.3, () => sc('.chk.c1', 'on')); await at(0.5, () => sc('.chk.c2', 'on')); await at(0.7, () => sc('.chk.c3', 'on'))
  })
  await rig.say('d3', async (at) => {
    await at(0.04, () => sc('.chk.c1', 'floor'))
    await at(0.28, () => sc('.dev.v1', 'on')); await at(0.42, () => sc('.dev.v2', 'on'))
    await at(0.66, async () => { await sc('.dev.v3', 'on'); await sc('.dev.v3', 'stop') })
  })
  await rig.say('d4', async (at) => { await at(0.0, async () => { await rig.shot('c'); await step('trust') }) })
  await rig.say('d5', async (at) => { await at(0.08, () => step('same')); await at(0.5, async () => { await sc('.rr.r1', 'hit'); await sc('.same', 'on') }) })
  await rig.say('d6', async (at) => {
    await at(0.0, async () => { await rig.shot('d'); await hold(340); await sc('.k1', 'on') })
    await at(0.4, () => sc('.k2', 'on')); await at(0.66, () => sc('.k3', 'on'))
  }, { cap: false })
  await hold(FAST ? 40 : 400)

  /* — device profiles, in the console — */
  await toConsole('/admin/policies/device-profiles')
  await goRail('Device profiles')
  await rig.say('dc1', async () => {
    const type = combo(/Filter by profile type/)
    await rig.closeOn(type, 1.5)
    await rig.click(type); await hold(360); await rig.click(opt(/^Trusted device$/)); await hold(FAST ? 40 : 500)
    await rig.click(type); await hold(360); await rig.click(opt(/^All$/)); await hold(260)
    await rig.wide()
  })
  await rig.say('dc2', async () => {
    await rig.click(btn(/Create new profile/)); await hold(460)
    const nm = app.locator('input[placeholder="Corporate laptops"]').first()
    await rig.closeOn(nm, 1.5)
    await rig.typeIn(nm, 'Office laptops')
    await rig.click(app.locator('button[role=radio]').filter({ hasText: /Device health/ }).first()); await hold(280)
    await rig.wide()
    await rig.click(btn(/^Next$/)); await hold(380)
    await rig.closeOn(app.locator('.bfp2__pickrow').first(), 1.4)
    for (const name of ['Windows', 'Screen lock', 'Device integrity']) {
      const row = app.locator('.bfp2__pickrow').filter({ hasText: new RegExp(`^${name}`) }).first()
      await rig.click(row, { left: true })
      let ok = false
      for (let i = 0; i < 10 && !ok; i++) { ok = (await row.getAttribute('aria-checked')) === 'true'; if (!ok) await page.waitForTimeout(100) }
      if (!ok) rig.missing.push(`not ticked: ${name}`)
    }
    const floor = combo(/Minimum Windows version/)
    await rig.click(floor); await hold(380); await rig.click(opt(/Windows 11/)); await hold(FAST ? 40 : 500)
    await rig.wide()
    await rig.click(btn(/^Next$/)); await hold(380)
    const c = btn(/^Create profile$/)
    if (await c.count()) await rig.click(c)
    await hold(500)
  })
  await rig.say('dc3', async () => {
    await goRail('Device profiles')
    const q = app.locator('input[aria-label="Search device profiles"]').first()
    await rig.click(q); await rig.keys('MDM', { delay: 60 }); await hold(360)
    await rig.click(app.locator('.blist__open').filter({ hasText: 'MDM-managed corporate device' }).first()); await hold(600)
    await look(app.locator('section.bfp2__basicsec').first(), 1.35, 900)
    await rig.wide()
    await rig.click(app.getByRole('tab', { name: /^Signals$/ })); await hold(400)
    await look(app.locator('.bx-tierpick').first(), 1.6, 700)
  })

  /* ============================== OUTCOME ============================== */
  await toStage('outcome', 'warm'); await hold(FAST ? 40 : 200); await rig.shot('a'); await step('outs'); await hold(FAST ? 40 : 400)
  await rig.say('o1', async (at) => { await at(0.0, () => sc('.oc.c1', 'on')) })
  await rig.say('o2', async (at) => { await at(0.0, async () => { await sc('.oc.c1', 'on', false); await sc('.oc.c2', 'on') }) })
  await rig.say('o3', async (at) => {
    await at(0.0, async () => { await sc('.oc.c2', 'on', false); await sc('.oc.c3', 'on') })
    await at(0.35, () => st('typeInto', '.typed', 'Use a company device to sign in.'))
  })
  await hold(FAST ? 40 : 700); await sc('.oc', 'on'); await hold(FAST ? 40 : 1200)

  /* ============================== BUILDER ============================== */
  await toConsole('/admin/policies')
  await goRail('All Policies')
  await rig.say('p1', async () => {
    await rig.click(btn(/^New policy$/)); await hold(600)
    await look(btn(/Start from scratch/), 1.35, 700)
    await rig.click(btn(/Start from scratch/)); await hold(420)
    await rig.wide()
  })
  await rig.say('p2', async () => {
    await rig.click(app.locator('button[aria-label="Rename"]').first()); await hold(280)
    const nm = app.locator('input[aria-label="Policy name"]').first()
    await rig.closeOn(nm, 1.7)
    await rig.click(nm); await rig.press('Control+a')
    await rig.keys('Office laptops — GitHub and Jira', { delay: 34 }); await rig.press('Enter'); await hold(360)
    await rig.wide()
    await rig.click(app.locator('.bb__start').first()); await hold(460)
    const search = app.locator('input[placeholder*="Search applications" i], input[aria-label*="Search applications" i]').first()
    await rig.closeOn(search, 1.45)
    for (const name of ['GitHub', 'Jira']) {
      await rig.click(search); await rig.press('Control+a'); await rig.keys(name, { delay: 45 }); await hold(400)
      const row = app.locator('.bb__apps__item').filter({ hasText: new RegExp(name) }).first()
      await rig.click(row)
      if ((await row.getAttribute('aria-checked')) !== 'true') rig.missing.push(`app not ticked: ${name}`)
      await hold(220)
    }
    await rig.click(btn(/Save applications/)); await hold(400)
    await rig.wide()
    if (/No applications/.test((await app.locator('.bb__start').first().textContent()) ?? '')) rig.missing.push('applications not saved')
  })
  await rig.say('p3', async () => {
    await rig.click(app.locator('.bb__link__add').first()); await hold(380)
    const nm = app.locator('input[aria-label="Rule name"]').first()
    await rig.closeOn(nm, 1.5)
    await rig.click(nm); await rig.press('Control+a')
    await rig.keys('Office laptop in Pune', { delay: 36 }); await hold(220)
    const addGroups = app.locator('.bb__whoblank button').filter({ hasText: /Add groups/ }).first()
    if (await has(addGroups)) {
      await rig.click(addGroups); await hold(420)
      await rig.wide()
      await hold(FAST ? 40 : 900)
      await closeDialog()
    } else rig.missing.push('no Add groups')
  })
  await rig.say('p4', async () => {
    await rig.closeOn(app.locator('.bb__insp').first(), 1.35)
    await condition(/Device profile/, /Office laptops/)
    await condition(/Network zone/, /Pune office/)
  })
  await rig.say('p5', async () => {
    const insp = app.locator('.bb__insp')
    if (!(await has(insp, 2000))) { await rig.click(app.locator('.bb__card').nth(0)); await hold(360) }
    await rig.click(insp.getByRole('radio', { name: /Allow/ }).first()); await hold(420)
    const second = combo(/Second factor/)
    if (await has(second)) { await rig.click(second); await hold(360); await rig.click(opt(/^None/)); await hold(380) } else rig.missing.push('no Second factor picker')
    const deny = insp.getByRole('radio', { name: /Deny/ }).first()
    await rig.frame(deny); await hold(FAST ? 40 : 500)
    const c1 = await cardText(0)
    if (!/Allow/.test(c1)) rig.missing.push('rule 1 card shows no Allow: ' + c1.slice(0, 80))
  })
  await rig.say('p6', async () => {
    await rig.click(app.locator('.bb__inspfoot button').first()); await hold(360)
    await rig.wide()
    await rig.click(app.locator('.bb__link__add').last()); await hold(460)
    const insp = app.locator('.bb__insp')
    for (let i = 0; i < 20 && !/2$/.test(((await insp.locator('.bb__inspnum').textContent().catch(() => '')) ?? '').trim()); i++) await hold(150)
    const nm = insp.locator('input[aria-label="Rule name"]').first()
    await rig.closeOn(insp.first(), 1.35)
    await rig.click(nm); await rig.press('Control+a')
    await rig.keys('Everyone else', { delay: 36 }); await hold(220)
    await rig.click(insp.getByRole('radio', { name: /Allow/ }).first()); await hold(380)
    const second = combo(/Second factor/)
    if (await has(second)) { await rig.click(second); await hold(360); await rig.click(opt(/Any enabled method/)); await hold(380) } else rig.missing.push('rule 2: no Second factor picker')
    await rig.click(app.locator('.bb__inspfoot button').first()); await hold(360)
    await rig.wide()
    const c2 = await cardText(1)
    if (!/Second factor|Any enabled/.test(c2)) rig.missing.push('rule 2 has no second factor: ' + c2.slice(0, 80))
  })

  /* ============================== ORDER ============================== */
  await toStage('order', 'cool'); await hold(FAST ? 40 : 200); await rig.shot('a'); await step('set')
  await rig.say('r1', async (at) => { await at(0.15, () => step('read')) })
  await rig.say('r2', async (at) => { await at(0.02, () => st('run', 't1', [{ id: 'r1' }, { id: 'r2', hit: true }], 'Allow', '#4ade80')) })
  await rig.say('r3', async (at) => { await at(0.0, () => st('clearRun')); await at(0.3, () => st('swap', 'r2', 'r3')) })
  await rig.say('r4', async (at) => { await at(0.02, () => st('run', 't1', [{ id: 'r1' }, { id: 'r3', hit: true }], 'Second factor', '#fbbf24')) })
  await rig.say('r5', async (at) => { await at(0.0, () => st('clearRun')); await at(0.12, () => st('del', 'r3')); await at(0.5, () => step('lock')) })
  await rig.say('r6', async (at) => { await at(0.02, () => st('run', 't2', [{ id: 'r1' }, { id: 'r2' }, { id: 'rd', hit: true }], 'Deny', '#f87171')) })
  await hold(FAST ? 40 : 900)

  /* — the canvas — */
  await toConsole('/admin/policies')
  await rig.say('k1', async () => {
    const dens = app.locator('button.bb__densitybtn').first()
    await rig.closeOn(dens, 1.5, 'density')
    await rig.click(dens); await hold(FAST ? 40 : 440); await rig.click(dens); await hold(380)
    await rig.click(app.locator('button.bb__act[aria-label="Undo"]')); await hold(FAST ? 40 : 520)
    await rig.click(app.locator('button.bb__act[aria-label="Redo"]')); await hold(380)
    await rig.click(app.locator('button.bb__act[aria-label="Zoom in"]')); await hold(280)
    await rig.click(app.locator('button.bb__act[aria-label="Zoom out"]')); await hold(280)
    await rig.click(app.locator('button.bb__act[aria-label="Fit to width"]')); await hold(380)
    await rig.wide()
  })
  await rig.say('k2', async () => {
    const grip = app.locator('.bb__card').nth(1).locator('button.bb__idx').first()
    const c1 = await app.locator('.bb__card').nth(0).boundingBox().catch(() => null)
    const g = await grip.boundingBox().catch(() => null)
    if (g && c1) {
      await rig.glide(g.x + g.width / 2, g.y + g.height / 2)
      await page.mouse.down(); rig.events.push({ type: 'click', t: rig.t(), pan: 0 })
      const steps = FAST ? 3 : 14
      for (let i = 1; i <= steps; i++) {
        const y = g.y + g.height / 2 + ((c1.y - 30) - (g.y + g.height / 2)) * (i / steps)
        await page.mouse.move(g.x + g.width / 2, y); await page.evaluate(([a, b]) => window.__cur(a, b), [g.x + g.width / 2, y]); await hold(FAST ? 1 : 40)
      }
      await page.mouse.up(); rig.at = { x: g.x + g.width / 2, y: c1.y - 30 }
      await hold(FAST ? 40 : 500)
      await rig.click(app.locator('button.bb__act[aria-label="Undo"]')); await hold(FAST ? 40 : 520)
    } else rig.missing.push('no grip to drag')
    await rig.click(app.locator('.bb__card').nth(1)); await hold(380)
    const sw = app.locator('.bb__inspbar button.bx-toggle').first()
    if (await sw.count()) { await rig.closeOn(sw, 1.6); await rig.click(sw); await hold(FAST ? 40 : 440); await rig.click(sw); await hold(280) } else rig.missing.push('no rule switch')
    const kebab = app.locator('.bb__inspbar button.bx-rowmenu').first()
    if (await kebab.count()) {
      await rig.click(kebab); await hold(420)
      await hold(FAST ? 40 : 700)
      await escape()
    } else rig.missing.push('no rule kebab')
    await rig.wide()
  })
  await rig.say('k3', async () => {
    const draft = btn(/^Save draft$/)
    await rig.closeOn(btn(/^Save policy$/), 1.5)
    if (await draft.count() && await draft.isEnabled()) { await rig.click(draft); await hold(FAST ? 40 : 440) }
    await rig.click(btn(/^Save policy$/)); await hold(600)
    const status = app.locator('button[title="Change status"]').first()
    if (await status.count()) {
      await rig.click(status); await hold(380)
      const on = app.locator('.bx-menu__item').filter({ hasText: /^Turn on$/ }).first()
      if (await on.count()) { await rig.click(on); await hold(360); const c = dialogBtn(/^Turn on$/); if (await c.count()) { await rig.click(c); await hold(520) } }
      else { rig.missing.push('no Turn on'); await escape() }
    } else rig.missing.push('no status control')
    await rig.wide(); await rig.park()
  })

  /* ============================== TEMPLATES ============================== */
  await goRail('Templates'); await rig.url('/admin/policies/templates'); await hold(360)
  await rig.say('t1', async () => {
    await look(app.locator('input[aria-label="Search templates"]'), 1.45, 500)
    await rig.wide()
    await app.locator('.bgal__section').filter({ hasText: /Xecurify templates/ }).first().evaluate((e) => e.scrollIntoView({ block: 'start' })).catch(() => {})
    await hold(380)
    await rig.click(app.locator('button[aria-label="Preview the rules in Zero-Trust baseline"]').first()); await hold(620)
    await rig.click(dialogBtn(/Use this template/)); await hold(460)
    const create = dialogBtn(/^Create policy$/)
    if (await create.count()) { await rig.click(create); await hold(620) } else rig.missing.push('no Create policy after Use')
  })
  await rig.say('t2', async () => {
    const close = app.locator('button[aria-label="Close the panel"]').first()
    if (await close.count()) { await rig.click(close); await hold(280) }
    await app.locator(':focus').first().evaluate((e) => e.blur()).catch(() => {})
    await rig.park(); await hold(FAST ? 40 : 500)
  })

  /* ============================== METHODS ============================== */
  await goRail('Authentication methods'); await rig.url('/admin/policies/authentication-methods'); await hold(360)
  await rig.say('f1', async () => {
    await look(app.locator('.bm8__state').first(), 1.5, 600)
    await rig.wide()
    const sw = app.getByRole('switch', { checked: true }).last()
    if (await sw.count()) { await rig.closeOn(sw, 1.6); await rig.click(sw); await hold(FAST ? 40 : 600) }
    await rig.wide(); await rig.park()
  })
  await hold(FAST ? 40 : 300)

  /* ============================== CLOSE ============================== */
  rig.section('banner')
  await toStage('close', 'warm'); await hold(FAST ? 40 : 200)
  await rig.say('e1', async (at) => { await at(0.0, async () => { await rig.shot('a'); await step('log') }) })
  await rig.say('e2', async (at) => { await at(0.05, () => sc('.a1', 'on')) })
  await rig.say('e3', async (at) => { await at(0.05, () => sc('.a2', 'on')) })
  await rig.say('e4', async (at) => { await at(0.05, () => sc('.a3', 'on')) })
  rig.section('outro')
  await rig.say('e5', async (at) => { await at(0.0, async () => { await rig.shot('b'); await step('flute'); await step('brand') }); await at(0.4, () => step('sub')) }, { cap: false })
  await hold(FAST ? 60 : 2600)
  await rig.scene(null); await hold(FAST ? 40 : 700)
} catch (e) {
  rig.missing.push(`THREW: ${e.message}`)
  console.error('\n!! ' + e.message)
  if (FAST) await page.screenshot({ path: path.join(HERE, 'threw.png') }).catch(() => {})
} finally {
  rig.endSections()
  await rig.stop(OUT)
  const dur = rig.t()
  await browser.close()
  console.log(`\nfilm: ${dur.toFixed(1)}s (${(dur / 60).toFixed(1)} min), ${rig.frames.length} frames`)
  if (rig.missing.length) console.log('MISSED:\n  ' + rig.missing.join('\n  '))
  if (rig.errors.length) console.log('PAGE ERRORS:\n  ' + [...new Set(rig.errors)].join('\n  '))
}
