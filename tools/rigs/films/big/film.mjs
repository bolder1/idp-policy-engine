/* -----------------------------------------------------------------------------
   The big film, second cut — the take.

   Six drawn scenes carry the ideas; between them the console is covered in
   full but fast: labelled push-ins, one line per tour. No chapter cards.

   `node rec/big/film.mjs --fast` proves every selector without the pacing.
   -------------------------------------------------------------------------- */
import fs from 'node:fs'
import path from 'node:path'

import { SCRIPT, SUBS } from './script.mjs'
import { open, newestWebm } from './rig.mjs'

const FAST = process.argv.includes('--fast')
const HERE = import.meta.dirname
const OUT = path.join(HERE, FAST ? 'take-dry' : 'take')
const APP = 'http://localhost:4173/'

const vo = {}
for (const id of Object.keys(SCRIPT)) {
  const f = path.join(HERE, 'voice', `${id}.json`)
  if (!fs.existsSync(f)) throw new Error(`no voice for ${id} — run vo.mjs`)
  vo[id] = { duration: FAST ? 0.05 : JSON.parse(fs.readFileSync(f, 'utf8')).duration }
}

fs.rmSync(OUT, { recursive: true, force: true })
const { browser, ctx, page, rig, app } = await open({ out: OUT, appUrl: APP, vo, subs: SUBS, fast: FAST })

/* --- vocabulary -------------------------------------------------------------- */
const btn = (re) => app.getByRole('button', { name: re }).first()
/* Sub-items first: a top-level rail group is also called 'Authentication methods'. */
const rail = (n) => (n === 'Policies' ? app.locator('.bshell__item') : app.locator('.bshell__subitem')).filter({ hasText: new RegExp(`^${n}$`) }).first()
const tab = (n) => app.locator('button, [role=tab]').filter({ hasText: new RegExp(`^${n}$`) }).first()
const opt = (re) => app.getByRole('option', { name: re }).first()
const pick = (re) => app.locator('[role=checkbox]').filter({ hasText: re }).first()
const combo = (label) => app.getByRole('combobox', { name: label }).first()
const st = (fn, ...a) => rig.st(fn, ...a)
const hold = (ms) => rig.hold(ms)
const step = (s, on) => rig.step(s, on)
const sc = (sel, cls, on) => st('sc', sel, cls, on)
const scss = (sel, p, v) => st('scss', sel, p, v)
const goRail = async (name) => {
  const item = rail(name)
  if (!(await item.isVisible().catch(() => false))) { await rig.click(rail('Policies')); await hold(420) }
  await rig.click(item); await hold(380)
}
/* A push-in on a control with a label, held, then released. */
const has = async (loc, ms = 5000) => { try { await loc.first().waitFor({ state: 'visible', timeout: ms }); return true } catch { return false } }
const look = async (loc, label, where = 'below', ms = 560) => {
  if (!(await has(loc))) { rig.missing.push(`look: nothing for ${label}`); return }
  await rig.focus(loc, label, where); await hold(FAST ? 40 : ms); await rig.unring()
}
const condition = async (what, value) => {
  const plain = app.locator('.bb__ifadd').filter({ hasText: 'Add condition' }).first()
  if (await plain.isVisible().catch(() => false)) await rig.click(plain)
  else {
    await rig.click(app.locator('.bb__iffoot .bx-menu__trigger').filter({ hasText: /^Add$/ }).first()); await hold(380)
    await rig.click(app.getByRole('menuitem', { name: /^Add condition$/ }).first())
  }
  await hold(380)
  await rig.click(opt(what)); await hold(420)
  if (!(await app.locator('[role=checkbox]').first().isVisible().catch(() => false))) { await rig.click(app.locator('.cp__fld').last()); await hold(380) }
  await rig.click(pick(value)); await hold(320)
  await rig.press('Escape'); await hold(320)
  const got = await app.locator('.cp__fld').last().getAttribute('aria-label')
  if (!got || /Currently nothing/.test(got)) rig.missing.push(`condition empty: ${what}`)
}
const cardText = async (i) => ((await app.locator('.bb__card').nth(i).innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ')
const dialogBtn = (re) => app.locator('[role=dialog]').getByRole('button', { name: re }).first()
const escape = async () => { await rig.press('Escape'); await hold(300) }
/* Dialogs here do not all close on Escape (the Who chooser does not); press their own Close or Cancel. */
const closeDialog = async () => {
  const x = app.locator('[role=dialog] button[aria-label="Close"], [role=dialog] .bx-dialog__x').first()
  if (await x.count()) { await rig.click(x); await hold(350); return }
  const c = app.locator('[role=dialog]').getByRole('button', { name: /^(Cancel|Close)$/ }).first()
  if (await c.count()) { await rig.click(c); await hold(350); return }
  await escape()
}

/* the order scene's drop, driven from here so every landing lands on a word */
const dropTo = async (ball, stops) => {
  for (const s of stops) {
    if (s.open) { await sc(s.open, 'open'); await hold(FAST ? 10 : 220) }
    if (s.top) { await scss(ball, 'top', s.top + 'px'); await hold(FAST ? 10 : (s.ms ?? 350)) }
    if (s.close) { await sc(s.close, 'open', false); await hold(FAST ? 10 : 150) }
  }
}

try {
  /* ============================== INTRO ============================== */
  rig.section('board')
  await rig.scene('intro'); await hold(FAST ? 40 : 500)
  await rig.say('i1', async (at) => { await at(0.02, () => step('rail')); await at(0.6, () => step('p1')) })
  await rig.say('i2', async (at) => { await at(0.02, () => step('p2')); await at(0.55, () => step('p3')) })
  await rig.say('i3', async (at) => { await at(0.05, () => step('burst')); await at(0.85, () => step('halt')) })
  await rig.say('i4', async (at) => { await at(0.05, () => step('head')); await at(0.5, () => step('head2')) })
  rig.section('hook')
  await rig.say('i5', async (at) => { await at(0.02, () => step('turn')); await at(0.55, () => step('read')) })
  await rig.say('i6', async (at) => { await at(0.02, () => step('day')); await at(0.3, () => step('brand')) })
  await hold(FAST ? 60 : 1000)
  await step('out'); await hold(FAST ? 40 : 500); await rig.scene(null); await hold(FAST ? 40 : 300)

  /* ============================== ZONE ============================== */
  rig.section('demo')
  await rig.scene('zone2'); await hold(FAST ? 40 : 300); await step('map')
  await rig.say('z1', async (at) => { await at(0.15, () => step('fly')) })
  await rig.say('z2', async (at) => { await at(0.05, () => step('z1')); await at(0.42, () => step('z2')); await at(0.6, () => step('z3')) })
  await rig.say('z3', async (at) => { await at(0.05, () => step('net')) })
  await rig.say('z4', async (at) => { await at(0.05, () => sc('.pin.p1', 'on')); await at(0.3, () => sc('.pin.p2', 'on')); await at(0.55, () => sc('.pin.p3', 'on')); await at(0.8, () => step('rain')) })
  await rig.say('z5', async (at) => { await at(0.02, () => step('tag')); await at(0.3, () => step('rules')); await at(0.55, () => step('link')); await at(0.85, () => step('bloom')) })
  await hold(FAST ? 40 : 500); await step('out'); await hold(FAST ? 40 : 600); await rig.scene(null)

  /* — zones, in the console — */
  await rig.win('on'); await rig.url('/admin/policies/zones'); await hold(FAST ? 60 : 560)
  await goRail('Zones')
  await rig.say('zc1', async () => {
    await look(app.locator('input[aria-label="Search zones"]'), 'Search', 'below', 430)
    const show = combo(/Filter by what a zone is made of/)
    await look(show, 'Networks, locations, or both', 'below', 480)
    await rig.click(show); await hold(400); await rig.click(opt(/^Locations$/)); await hold(FAST ? 40 : 520)
  })
  await rig.say('zc2', async () => {
    await rig.click(btn(/^New zone$/)); await hold(420)
    await rig.typeIn(app.locator('[role=dialog] input').first(), 'Pune office')
    await rig.click(btn(/^Continue$/)); await hold(540)
    await rig.click(tab('Locations')); await hold(420)
    await rig.click(btn(/^Add location$/)); await hold(380)
    await rig.typeIn(app.locator('input[aria-label="Search places"], input[placeholder="Search places"]').first(), 'Pune', { delay: 70 })
    await hold(420); await rig.click(app.locator('.bz7__hit').first()); await hold(420)
    await rig.click(app.locator('.bz7__rangenum').first()); await rig.press('Control+a'); await rig.keys('25', { delay: 90 })
    await look(app.locator('.bz7__rangecol').first(), 'The ground around it', 'below', 550)
    await rig.click(tab('IP networks')); await hold(380)
    const mine = app.locator('button.bz7__quickbtn').first()
    if (await mine.count()) { await rig.click(mine); await hold(380) }
    await look(app.locator('ul.bz7__fields li').first(), 'Or an IP address, a range, an ASN', 'below', 430)
  })
  await rig.say('zc3', async () => {
    await rig.click(btn(/^Review & save$/)); await hold(480)
    await look(app.locator('[role=dialog] .bx-rv').first(), 'What changed, before it is stored', 'above', 600)
    const go = app.locator('[role=dialog] .bx-btn--brand').last()
    if (await go.count()) await rig.click(go)
    await hold(480)
    const back = app.locator('button.bz7__back').first()
    if (await back.count()) { await rig.click(back); await hold(420) } else await goRail('Zones')
    /* the Show filter is still on Locations from the first beat; Office Network is networks-only */
    const show = combo(/Filter by what a zone is made of/)
    await rig.click(show); await hold(360); await rig.click(opt(/^All zones$/)); await hold(360)
    const q = app.locator('input[aria-label="Search zones"]').first()
    await rig.click(q); await rig.keys('Office Network', { delay: 40 }); await hold(380)
    await has(app.locator('.blist__row').filter({ hasText: 'Office Network' }), 6000)
    const menu = app.locator('button[aria-label="Actions for Office Network"]').first()
    if (await has(menu)) {
      await rig.click(menu); await hold(450)
      await rig.click(app.locator('[role=menuitem]').filter({ hasText: /^Used by$/ }).first()); await hold(480)
      await look(app.locator('aside.bdock').first(), 'Every policy that names it', 'above', 750)
      await escape()
    } else rig.missing.push('no row menu for Office Network')
  })
  await rig.park(); await rig.win('off'); await hold(FAST ? 40 : 500)

  /* ============================== DEVICE ============================== */
  await rig.scene('gate'); await hold(FAST ? 40 : 300)
  await rig.say('d1', async (at) => { await at(0.02, () => step('in')) })
  await rig.say('d2', async (at) => { await at(0.05, () => step('scan')); await at(0.55, () => step('tags')) })
  await rig.say('d3', async (at) => { await at(0.02, () => step('floor')); await at(0.38, () => step('c1')); await at(0.56, () => step('c2')); await at(0.74, () => step('c3')) })
  await rig.say('d4', async (at) => { await at(0.02, () => step('pan')); await at(0.22, () => step('lap')); await at(0.6, () => step('sig')) })
  await rig.say('d5', async (at) => { await at(0.02, () => step('ghost')); await at(0.6, () => step('snap')) })
  await rig.say('d6', async (at) => { await at(0.02, () => step('word')); await at(0.38, () => step('match')); await at(0.68, () => step('flip')) })
  await hold(FAST ? 40 : 460); await step('flip', false); await step('lift'); await hold(FAST ? 40 : 460); await step('out'); await hold(FAST ? 40 : 500); await rig.scene(null)

  /* — device profiles, in the console — */
  await rig.win('on'); await rig.url('/admin/policies/device-profiles'); await hold(FAST ? 60 : 560)
  await goRail('Device profiles')
  await rig.say('dc1', async () => {
    const type = combo(/Filter by profile type/)
    await look(type, 'Both kinds', 'below', 430)
    await rig.click(type); await hold(380); await rig.click(opt(/^Trusted device$/)); await hold(FAST ? 40 : 520)
    await rig.click(type); await hold(380); await rig.click(opt(/^All$/)); await hold(300)
  })
  await rig.say('dc2', async () => {
    await rig.click(btn(/Create new profile/)); await hold(480)
    await rig.typeIn(app.locator('input[placeholder="Corporate laptops"]').first(), 'Office laptops')
    await look(app.locator('fieldset.bfp2__choices').first(), 'Health, or trusted', 'below', 550)
    await rig.click(app.locator('button[role=radio]').filter({ hasText: /Device health/ }).first()); await hold(300)
    await rig.click(btn(/^Next$/)); await hold(380)
    for (const name of ['Windows', 'Screen lock', 'Device integrity']) {
      const row = app.locator('.bfp2__pickrow').filter({ hasText: new RegExp(`^${name}`) }).first()
      await rig.click(row, { left: true })
      let ok = false
      for (let i = 0; i < 10 && !ok; i++) { ok = (await row.getAttribute('aria-checked')) === 'true'; if (!ok) await page.waitForTimeout(100) }
      if (!ok) rig.missing.push(`not ticked: ${name}`)
    }
    const floor = combo(/Minimum Windows version/)
    await rig.click(floor); await hold(400); await rig.click(opt(/Windows 11/)); await hold(300)
    await look(floor, 'That version, or newer', 'below', 480)
    await rig.click(btn(/^Next$/)); await hold(380)
    await look(app.locator('.bdpw__review').first(), 'Read back before it exists', 'above', 600)
    const c = btn(/^Create profile$/)
    if (await c.count()) await rig.click(c)
    await hold(540)
  })
  await rig.say('dc3', async () => {
    await goRail('Device profiles')
    const q = app.locator('input[aria-label="Search device profiles"]').first()
    await rig.click(q); await rig.keys('MDM', { delay: 60 }); await hold(380)
    await rig.click(app.locator('.blist__open').filter({ hasText: 'MDM-managed corporate device' }).first()); await hold(620)
    await look(app.locator('section.bfp2__basicsec').first(), 'With an agent, or without', 'below', 650)
    const reg = app.locator('h2').filter({ hasText: /^Device registration$/ }).first()
    await look(reg, 'How it registers', 'below', 550)
    await rig.click(app.getByRole('tab', { name: /^Signals$/ })); await hold(420)
    await look(app.locator('.bx-tierpick').first(), 'A priority for each signal', 'below', 430)
  })
  await rig.park(); await rig.win('off'); await hold(FAST ? 40 : 500)

  /* ============================== OUTCOME ============================== */
  await rig.scene('rail'); await hold(FAST ? 40 : 300); await step('rail'); await hold(FAST ? 40 : 460)
  await rig.say('o1', async (at) => { await at(0.02, () => step('a1')); await at(0.78, () => step('bloom')) })
  await rig.say('o2', async (at) => {
    await at(0.02, async () => { await step('bloom', false); await step('a2') })
    await at(0.22, () => step('run2')); await at(0.48, () => step('code')); await at(0.68, () => step('open')); await at(0.74, () => step('go2')); await at(0.9, () => step('bloom'))
  })
  await rig.say('o3', async (at) => {
    await at(0.02, async () => { await step('bloom', false); await step('deny') })
    await at(0.18, () => step('run3')); await at(0.6, () => step('hit')); await at(0.68, () => step('msg'))
  })
  await hold(FAST ? 40 : 1500); await step('recap'); await hold(FAST ? 40 : 1000); await step('out'); await hold(FAST ? 40 : 500); await rig.scene(null)

  /* ============================== BUILDER ============================== */
  await rig.win('on'); await rig.url('/admin/policies'); await hold(FAST ? 60 : 560)
  await goRail('All Policies')
  await rig.say('p1', async () => {
    await rig.click(btn(/^New policy$/)); await hold(620)
    await look(btn(/Use a template/), 'Ready-made rules', 'above', 550)
    await look(btn(/Start from scratch/), 'Write the first rule yourself', 'above', 480)
    await rig.click(btn(/Start from scratch/)); await hold(420)
  })
  await rig.say('p2', async () => {
    await rig.click(app.locator('button[aria-label="Rename"]').first()); await hold(300)
    await rig.click(app.locator('input[aria-label="Policy name"]').first()); await rig.press('Control+a')
    await rig.keys('Office laptops — GitHub and Jira', { delay: 36 }); await rig.press('Enter'); await hold(400)
    await rig.click(app.locator('.bb__start').first()); await hold(480)
    const search = app.locator('input[placeholder*="Search applications" i], input[aria-label*="Search applications" i]').first()
    for (const name of ['GitHub', 'Jira']) {
      await rig.click(search); await rig.press('Control+a'); await rig.keys(name, { delay: 45 }); await hold(420)
      const row = app.locator('.bb__apps__item').filter({ hasText: new RegExp(name) }).first()
      await rig.click(row)
      if ((await row.getAttribute('aria-checked')) !== 'true') rig.missing.push(`app not ticked: ${name}`)
      await hold(250)
    }
    await rig.click(btn(/Save applications/)); await hold(420)
    if (/No applications/.test((await app.locator('.bb__start').first().textContent()) ?? '')) rig.missing.push('applications not saved')
  })
  await rig.say('p3', async () => {
    await rig.click(app.locator('.bb__link__add').first()); await hold(380)
    await rig.click(app.locator('input[aria-label="Rule name"]').first()); await rig.press('Control+a')
    await rig.keys('Office laptop in Pune', { delay: 36 }); await hold(240)
    const addGroups = app.locator('.bb__whoblank button').filter({ hasText: /Add groups/ }).first()
    if (await has(addGroups)) {
      await rig.click(addGroups); await hold(420)
      await look(app.locator('[role=dialog]').first(), 'Groups, or people by name', 'above', 600)
      await closeDialog()
    } else rig.missing.push('no Add groups')
  })
  await rig.say('p4', async () => {
    await condition(/Device profile/, /Office laptops/)
    await condition(/Network zone/, /Pune office/)
    const add = app.locator('.bb__iffoot .bx-menu__trigger').filter({ hasText: /^Add$/ }).first()
    if (await has(add)) {
      await rig.click(add); await hold(400)
      await look(app.getByRole('menuitem', { name: /Add conditional group/ }), 'Brackets inside the rule', 'below', 550)
      await escape()
    }
  })
  await rig.say('p5', async () => {
    const insp = app.locator('.bb__insp')
    if (!(await has(insp, 2000))) { await rig.click(app.locator('.bb__card').nth(0)); await hold(380) }
    await rig.click(insp.getByRole('radio', { name: /Allow/ }).first()); await hold(450)
    const second = combo(/Second factor/)
    if (await has(second)) { await rig.click(second); await hold(380); await rig.click(opt(/^None/)); await hold(400) } else rig.missing.push('no Second factor picker')
    await look(insp.getByRole('radio', { name: /Deny/ }).first(), 'Or refuse, with a message', 'below', 480)
    const c1 = await cardText(0)
    if (!/Allow/.test(c1)) rig.missing.push('rule 1 card shows no Allow: ' + c1.slice(0, 80))
  })
  await rig.say('p6', async () => {
    await rig.click(app.locator('.bb__inspfoot button').first()); await hold(380)
    await rig.click(app.locator('.bb__link__add').last()); await hold(480)
    const insp = app.locator('.bb__insp')
    for (let i = 0; i < 20 && !/2$/.test(((await insp.locator('.bb__inspnum').textContent().catch(() => '')) ?? '').trim()); i++) await hold(150)
    await rig.click(insp.locator('input[aria-label="Rule name"]').first()); await rig.press('Control+a')
    await rig.keys('Everyone else', { delay: 36 }); await hold(240)
    await rig.click(insp.getByRole('radio', { name: /Allow/ }).first()); await hold(400)
    const second = combo(/Second factor/)
    if (await has(second)) { await rig.click(second); await hold(380); await rig.click(opt(/Any enabled method/)); await hold(400) } else rig.missing.push('rule 2: no Second factor picker')
    await rig.click(app.locator('.bb__inspfoot button').first()); await hold(380)
    const c2 = await cardText(1)
    if (!/Second factor|Any enabled/.test(c2)) rig.missing.push('rule 2 has no second factor: ' + c2.slice(0, 80))
  })

  /* — order, over the sunk console — */
  await rig.park(); await rig.win('sunk'); await rig.scene('drop', true); await hold(FAST ? 40 : 300); await step('set')
  await rig.say('r1', async (at) => { await at(0.12, () => step('read')) })
  await rig.say('r2', async (at) => {
    await at(0.02, async () => { await step('s1'); await sc('.b1', 'on'); await sc('.t1', 'on') })
    await at(0.2, async () => {
      await dropTo('.b1', [{ top: 282 }, { open: '.sh1' }, { top: 442, ms: 300 }, { close: '.sh1' }])
      await sc('.b1', 'land'); await sc('.sh2', 'good'); await sc('.o1', 'on'); await sc('.veil', 'on'); await sc('.dotted', 'on')
    })
  })
  await rig.say('r3', async (at) => {
    await at(0.02, async () => { await step('h2'); for (const [s, c] of [['.b1', 'on'], ['.b1', 'land'], ['.o1', 'on'], ['.veil', 'on'], ['.dotted', 'on'], ['.sh2', 'good']]) await sc(s, c, false) })
    await at(0.3, () => step('swap'))
  })
  await rig.say('r4', async (at) => {
    await at(0.02, async () => { await scss('.b1', 'top', '112px'); await hold(FAST ? 10 : 80); await sc('.b1', 'on') })
    await at(0.2, async () => {
      await dropTo('.b1', [{ top: 282 }, { open: '.sh1' }, { top: 442, ms: 300 }, { close: '.sh1' }])
      await sc('.b1', 'land'); await sc('.sh3', 'warm'); await sc('.o2', 'on'); await sc('.veil', 'on')
    })
  })
  await rig.say('r5', async (at) => {
    await at(0.02, async () => { await step('h3'); for (const [s, c] of [['.b1', 'on'], ['.b1', 'land'], ['.t1', 'on'], ['.o2', 'on'], ['.veil', 'on'], ['.sh3', 'warm']]) await sc(s, c, false) })
    await at(0.12, () => step('x'))
    await at(0.5, async () => { await sc('.sh3', 'gone'); await step('del') })
  })
  await rig.say('r6', async (at) => {
    await at(0.02, async () => { await sc('.t2', 'on'); await sc('.b2', 'on') })
    await at(0.2, async () => {
      await dropTo('.b2', [{ top: 282 }, { open: '.sh1' }, { top: 442, ms: 300 }, { close: '.sh1' }, { open: '.sh2' }, { top: 764, ms: 300 }, { close: '.sh2' }])
      await step('thud'); await sc('.b2', 'land'); await sc('.o3', 'on')
    })
  })
  await hold(FAST ? 40 : 1000); await step('out'); await hold(FAST ? 40 : 600); await rig.scene(null); await rig.win('on'); await hold(FAST ? 40 : 600)

  /* — the canvas — */
  await rig.say('k1', async () => {
    const dens = app.locator('button.bb__densitybtn').first()
    await rig.click(dens); await hold(FAST ? 40 : 460); await rig.click(dens); await hold(400)
    await rig.click(app.locator('button.bb__act[aria-label="Undo"]')); await hold(FAST ? 40 : 600)
    await rig.click(app.locator('button.bb__act[aria-label="Redo"]')); await hold(400)
    await rig.click(app.locator('button.bb__act[aria-label="Zoom in"]')); await hold(300)
    await rig.click(app.locator('button.bb__act[aria-label="Zoom out"]')); await hold(300)
    await rig.click(app.locator('button.bb__act[aria-label="Fit to width"]')); await hold(400)
  })
  await rig.say('k2', async () => {
    /* drag rule 2 above rule 1 by its number, the grip */
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
      await hold(FAST ? 40 : 520)
      await rig.click(app.locator('button.bb__act[aria-label="Undo"]')); await hold(FAST ? 40 : 600)
    } else rig.missing.push('no grip to drag')
    await rig.click(app.locator('.bb__card').nth(1)); await hold(400)
    const sw = app.locator('.bb__inspbar button.bx-toggle').first()
    if (await sw.count()) { await rig.click(sw); await hold(FAST ? 40 : 460); await rig.click(sw); await hold(300) } else rig.missing.push('no rule switch')
    const kebab = app.locator('.bb__inspbar button.bx-rowmenu').first()
    if (await kebab.count()) {
      await rig.click(kebab); await hold(450)
      await look(app.locator('[role=menuitem]').filter({ hasText: /^Duplicate$/ }), 'Duplicate, move, delete', 'below', 430)
      await escape()
    } else rig.missing.push('no rule kebab')
  })
  await rig.say('k3', async () => {
    const draft = btn(/^Save draft$/)
    if (await draft.count() && await draft.isEnabled()) { await rig.click(draft); await hold(FAST ? 40 : 460) }
    await rig.click(btn(/^Save policy$/)); await hold(620)
    const status = app.locator('button[title="Change status"]').first()
    if (await status.count()) {
      await rig.click(status); await hold(400)
      const on = app.locator('.bx-menu__item').filter({ hasText: /^Turn on$/ }).first()
      if (await on.count()) { await rig.click(on); await hold(380); const c = dialogBtn(/^Turn on$/); if (await c.count()) { await rig.click(c); await hold(540) } }
      else { rig.missing.push('no Turn on'); await escape() }
    } else rig.missing.push('no status control')
    await rig.park()
  })

  /* ============================== TEMPLATES ============================== */
  await goRail('Templates'); await rig.url('/admin/policies/templates'); await hold(380)
  await rig.say('t1', async () => {
    await look(app.locator('input[aria-label="Search templates"]'), 'Search', 'below', 380)
    await look(combo(/Filter by category/), 'Filter', 'below', 380)
    await app.locator('.bgal__section').filter({ hasText: /Xecurify templates/ }).first().evaluate((e) => e.scrollIntoView({ block: 'start' })).catch(() => {})
    await hold(400)
    await rig.click(app.locator('button[aria-label="Preview the rules in Zero-Trust baseline"]').first()); await hold(650)
    await rig.click(dialogBtn(/Use this template/)); await hold(480)
    const create = dialogBtn(/^Create policy$/)
    if (await create.count()) { await rig.click(create); await hold(650) } else rig.missing.push('no Create policy after Use')
  })
  await rig.say('t2', async () => {
    const close = app.locator('button[aria-label="Close the panel"]').first()
    if (await close.count()) { await rig.click(close); await hold(300) }
    await app.locator(':focus').first().evaluate((e) => e.blur()).catch(() => {})
    await rig.park(); await hold(FAST ? 40 : 520)
  })

  /* ============================== METHODS ============================== */
  await goRail('Authentication methods'); await rig.url('/admin/policies/authentication-methods'); await hold(380)
  await rig.say('f1', async () => {
    await look(app.locator('.bm8__state').first(), 'How many are on', 'below', 430)
    const fam = app.locator('.bm8__card--family.is-link .bm8__open').first()
    if (await fam.count()) { await rig.click(fam); await hold(FAST ? 40 : 600); await closeDialog() }
    const sw = app.getByRole('switch', { checked: true }).last()
    if (await sw.count()) { await rig.click(sw); await hold(FAST ? 40 : 600) }
    await rig.park()
  })
  await hold(FAST ? 40 : 300)

  /* ============================== CLOSE ============================== */
  rig.section('banner')
  await rig.win('off'); await hold(FAST ? 40 : 500)
  await rig.scene('answers'); await hold(FAST ? 40 : 200); await step('set')
  await rig.say('e1', async (at) => { await at(0.5, () => step('p1')) })
  await rig.say('e2')
  await rig.say('e3', async (at) => { await at(0.02, () => step('p2')); await at(0.5, () => step('code')); await at(0.78, () => step('open')); await at(0.85, () => step('go2')) })
  await rig.say('e4', async (at) => { await at(0.02, () => step('p3')); await at(0.62, () => step('hit')) })
  rig.section('outro')
  await rig.say('e5', async (at) => { await at(0.02, () => step('sweep')); await at(0.3, () => step('brand')) })
  await hold(FAST ? 60 : 2200); await step('out'); await hold(FAST ? 40 : 520)
} catch (e) {
  rig.missing.push(`THREW: ${e.message}`)
  console.error('\n!! ' + e.message)
} finally {
  rig.endSections()
  rig.save(OUT)
  const dur = rig.t()
  await ctx.close(); await browser.close()
  console.log(`\nfilm: ${dur.toFixed(1)}s (${(dur / 60).toFixed(1)} min) → ${newestWebm(OUT)}`)
  if (rig.missing.length) console.log('MISSED:\n  ' + rig.missing.join('\n  '))
  if (rig.errors.length) console.log('PAGE ERRORS:\n  ' + [...new Set(rig.errors)].join('\n  '))
}
