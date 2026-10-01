/* -----------------------------------------------------------------------------
   The demo — the take.

   `node rec/demo2/film.mjs --fast` proves every selector without the pacing.
   -------------------------------------------------------------------------- */
import fs from 'node:fs'
import path from 'node:path'

import { SCRIPT, SCENES, CHAPTERS, SUBS } from './script.mjs'
import { open, newestWebm } from './rig.mjs'

const FAST = process.argv.includes('--fast')
const OUT = path.join(import.meta.dirname, FAST ? 'take-dry' : 'take')
const VOICE = path.join(import.meta.dirname, 'voice')
const APP = 'http://localhost:4173/'

const vo = {}
for (const id of Object.keys(SCRIPT)) {
  const f = path.join(VOICE, `${id}.json`)
  if (!fs.existsSync(f)) throw new Error(`no voice for ${id} — run vo.mjs`)
  vo[id] = { duration: FAST ? 0.05 : JSON.parse(fs.readFileSync(f, 'utf8')).duration }
}

fs.rmSync(OUT, { recursive: true, force: true })
const { browser, ctx, page, rig, app } = await open({ out: OUT, appUrl: APP, vo, subs: SUBS, fast: FAST })

/* --- vocabulary ----------------------------------------------------------- */
const btn = (re) => app.getByRole('button', { name: re }).first()
const rail = (n) => app.locator('.bshell__item, .bshell__subitem').filter({ hasText: new RegExp(`^${n}$`) }).first()
const tab = (n) => app.locator('button, [role=tab]').filter({ hasText: new RegExp(`^${n}$`) }).first()
const opt = (re) => app.getByRole('option', { name: re }).first()
const pick = (re) => app.locator('[role=checkbox]').filter({ hasText: re }).first()

const goRail = async (name) => {
  const item = rail(name)
  if (!(await item.isVisible().catch(() => false))) { await rig.click(rail('Policies')); await rig.hold(420) }
  await rig.click(item)
  await rig.hold(380)
}

/* A chapter card: the scene layer, borrowed for four seconds. */
/* A chapter card floats over the window, which steps back for it; its three
   lines land 120ms apart. Not a cut. */
const chapter = async (key) => {
  const [n, title, sub] = CHAPTERS[key]
  rig.section('banner')
  await rig.sub('')
  await rig.unring()
  await rig.card(`<div class="card"><div class="kick land">${n}</div><h1 class="land d1">${title}</h1><p class="land d2">${sub}</p></div>`)
  await rig.hold(FAST ? 120 : 2500)
  await rig.card('')
  await rig.hold(FAST ? 60 : 620)
  rig.section('demo')
}

/* A line that plays over a full-frame explainer. */
const onScene = async (id, key) => {
  await rig.unring()
  await rig.scene(SCENES[key])
  await rig.hold(FAST ? 40 : 420)
  await rig.say(id)
}
const offScene = async () => { await rig.scene(''); await rig.hold(FAST ? 60 : 460) }

const condition = async (what, value) => {
  const plain = app.locator('.bb__ifadd').filter({ hasText: 'Add condition' }).first()
  if (await plain.isVisible().catch(() => false)) await rig.click(plain)
  else {
    await rig.click(app.locator('.bb__sec').filter({ hasText: /^\s*If/ }).locator('.bx-btn').filter({ hasText: /^Add$/ }).first())
    await rig.hold(380)
    await rig.click(app.getByRole('menuitem', { name: /^Add condition$/ }).first())
  }
  await rig.hold(380)
  await rig.click(opt(what))
  await rig.hold(420)
  await rig.click(app.locator('.cp__fld').last())
  await rig.hold(380)
  await rig.click(pick(value))
  await rig.hold(320)
  await rig.press('Escape')
  await rig.hold(320)
  const got = await app.locator('.cp__fld').last().getAttribute('aria-label')
  if (!got || /Currently nothing/.test(got)) rig.missing.push(`condition empty: ${what}`)
}

try {
  /* ===================== Cold open ===================== */
  rig.section('hook')
  await rig.hold(900)
  await rig.scene(SCENES.open)
  await rig.hold(FAST ? 60 : 700)
  await rig.say('o1')
  await rig.say('o2')
  await offScene()

  /* ===================== 1 · Zones ===================== */
  await chapter('zones')
  await onScene('z1', 'where')
  await rig.say('z2')
  await offScene()

  await goRail('Zones')
  await rig.url('/admin/policies/zones')
  await rig.say('z3', async () => {
    await rig.focus(btn(/^New zone$/), 'Start here', 'above')
    await rig.hold(FAST ? 40 : 900)
  })
  await rig.unring()
  await rig.click(btn(/^New zone$/))
  await rig.hold(420)
  await rig.type(app.locator('[role=dialog] input').first(), 'Pune office')
  await rig.click(btn(/^Continue$/))
  await rig.hold(800)

  await rig.click(tab('Locations'))
  await rig.hold(460)
  await rig.click(btn(/^Add location$/))
  await rig.hold(380)
  await rig.type(app.locator('input[aria-label="Search places"], input[placeholder="Search places"]').first(), 'Pune', { delay: 120 })
  await rig.hold(600)
  await rig.click(app.locator('.bz7__hit').first())
  await rig.hold(620)

  await rig.say('z4', async () => {
    const km = app.locator('.bz7__rangenum').first()
    await rig.click(km)
    await rig.press('Control+a')
    await rig.keys('25', { delay: 150 })
    await rig.focus(app.locator('.bz7__rangecol').first(), 'Kilometres or miles')
    await rig.hold(FAST ? 40 : 700)
  })
  await rig.say('z5')
  await rig.unring()

  await rig.click(btn(/^Review & save$/))
  await rig.hold(620)
  await rig.say('z6', async () => {
    const go = app.locator('[role=dialog] .bx-btn--brand').last()
    if (await go.count()) await rig.click(go)
    await rig.hold(500)
  })

  /* ===================== 2 · Device profiles ===================== */
  await chapter('device')
  await onScene('d1', 'device')
  await offScene()

  await goRail('Device profiles')
  await rig.url('/admin/policies/device-profiles')
  await rig.say('d2', async () => {
    await rig.focus(btn(/Create new profile/), 'A new profile', 'above')
    await rig.hold(FAST ? 40 : 800)
  })
  await rig.unring()
  await rig.click(btn(/Create new profile/))
  await rig.hold(700)
  await rig.type(app.locator('input[placeholder="Corporate laptops"]').first(), 'Office laptops')
  await rig.click(app.locator('.bfp2__answer').first())
  await rig.hold(380)
  await rig.click(btn(/^Next$/))
  await rig.hold(760)

  const tick = async (name) => {
    const row = app.locator('.bfp2__pickrow').filter({ hasText: new RegExp(`^${name}`) }).first()
    await rig.click(row)
    await rig.hold(180)
    if ((await row.getAttribute('aria-checked')) !== 'true') rig.missing.push(`not ticked: ${name}`)
  }
  await rig.say('d3', async () => {
    await tick('Windows')
    await tick('Screen lock')
    await tick('Device integrity')
    await rig.hold(FAST ? 40 : 400)
  })
  await rig.say('d4', async () => {
    await rig.focus(app.locator('.bfp2__pickrow').filter({ hasText: /^Windows/ }).first(), 'That version or newer')
    await rig.hold(FAST ? 40 : 700)
  })
  await rig.unring()
  await rig.click(btn(/^Next$/))
  await rig.hold(760)
  await rig.say('d5', async () => {
    await rig.hold(FAST ? 40 : 700)
    const c = btn(/^Create profile$/)
    if (await c.count()) await rig.click(c)
    await rig.hold(700)
  })

  /* ===================== 3 · The policy ===================== */
  await chapter('policy')
  await onScene('p1', 'story')
  await offScene()
  await onScene('p2', 'order')
  await offScene()

  await goRail('All Policies')
  await rig.url('/admin/policies')
  await rig.click(btn(/^New policy$/))
  await rig.hold(1000)
  await rig.say('p3', async () => {
    await rig.click(app.locator('button[aria-label="Rename"]').first())
    await rig.hold(320)
    await rig.click(app.locator('.bbtop__rename input').first())
    await rig.press('Control+a')
    await rig.keys('Office laptops — GitHub and Jira', { delay: 40 })
    await rig.press('Enter')
    await rig.hold(FAST ? 40 : 500)
  })

  await rig.click(btn(/Start from scratch/))
  await rig.hold(600)
  await rig.say('p4', async () => {
    await rig.click(app.locator('.bb__start').first())
    await rig.hold(700)
    const search = app.locator('input[placeholder*="Search applications" i], input[aria-label*="Search applications" i]').first()
    for (const name of ['GitHub', 'Jira']) {
      await rig.click(search)
      await rig.press('Control+a')
      await rig.keys(name, { delay: 45 })
      await rig.hold(460)
      const row = app.locator('.bb__apps__item').filter({ hasText: new RegExp(name) }).first()
      await rig.click(row)
      if ((await row.getAttribute('aria-checked')) !== 'true') rig.missing.push(`app not ticked: ${name}`)
      await rig.hold(300)
    }
    await rig.click(btn(/Save applications/))
    await rig.hold(600)
    const start = await app.locator('.bb__start').first().textContent()
    if (/No applications/.test(start ?? '')) rig.missing.push('applications not saved')
  })

  await rig.click(app.locator('.bb__link__add').first())
  await rig.hold(760)
  await rig.say('p5', async () => {
    await rig.click(app.locator('input[aria-label="Rule name"]').first())
    await rig.press('Control+a')
    await rig.keys('Office laptop in Pune', { delay: 40 })
    await rig.hold(260)
    await condition(/Device profile/, /Office laptops/)
    await condition(/Network zone/, /Pune office/)
  })
  await rig.say('p6', async () => {
    await rig.click(app.getByRole('radio', { name: /Allow/ }).first())
    await rig.hold(FAST ? 40 : 620)
  })

  await rig.say('p7', async () => {
    await rig.click(app.locator('.bb__link__add').last())
    await rig.hold(700)
    await rig.click(app.locator('input[aria-label="Rule name"]').first())
    await rig.press('Control+a')
    await rig.keys('Everyone else', { delay: 40 })
    await rig.hold(240)
    await rig.click(app.getByRole('radio', { name: /Allow/ }).first())
    await rig.hold(FAST ? 40 : 400)
  })
  await rig.say('p8', async () => {
    await rig.click(app.locator('.bb__card').filter({ hasText: 'Nothing else matched' }).first())
    await rig.hold(FAST ? 40 : 700)
  })
  await rig.say('p9', async () => {
    await rig.focus(btn(/^Save policy$/), 'Stores the policy', 'below')
    await rig.hold(FAST ? 40 : 700)
    await rig.unring()
    await rig.click(btn(/^Save policy$/))
    await rig.hold(700)
  })

  /* ===================== 4 · In practice ===================== */
  await chapter('practice')
  await goRail('All Policies')
  await rig.url('/admin/policies')
  await rig.say('x1', async () => { await rig.hold(FAST ? 40 : 500) })
  await rig.click(app.locator('.btable__link').filter({ hasText: 'Device compliance' }).first())
  await rig.hold(900)
  await rig.say('x2', async () => {
    const ex = btn(/^Expand all$/)
    if (await ex.count()) await rig.click(ex)
    await rig.hold(700)
    await rig.wheel(260, 5)
  })
  await rig.click(app.locator('.bbtop__crumb').first())
  await rig.hold(700)
  await rig.click(app.locator('.btable__link').filter({ hasText: 'Risk-tiered verification' }).first())
  await rig.hold(900)
  await rig.say('x3', async () => {
    const ex = btn(/^Expand all$/)
    if (await ex.count()) await rig.click(ex)
    await rig.hold(600)
    await rig.wheel(240, 5)
  })
  await onScene('x4', 'order')
  await offScene()

  /* ===================== 5 · Authentication methods ===================== */
  await chapter('methods')
  await rig.url('/admin/policies/authentication-methods')
  await rig.click(app.locator('.bbtop__crumb').first())
  await rig.hold(620)
  await goRail('Authentication methods')
  await rig.hold(700)
  await rig.say('m1', async () => { await rig.hold(FAST ? 40 : 600) })
  await rig.say('m2', async () => {
    await rig.focus(app.locator('.bm8__state').first(), 'How many are on')
    await rig.hold(FAST ? 40 : 900)
    await rig.unring()
    await rig.click(app.locator('.bm8__card--family.is-link .bm8__open').first())
    await rig.hold(900)
  })
  await rig.say('m3', async () => {
    await rig.hold(FAST ? 40 : 600)
    const x = app.locator('[aria-label="Close"], .bx-dialog__x').first()
    if (await x.count()) await rig.click(x)
    await rig.hold(500)
  })

  /* ===================== Close ===================== */
  rig.section('outro')
  await rig.unring()
  await rig.scene(SCENES.close)
  await rig.hold(FAST ? 60 : 520)
  await rig.say('c1')
  await rig.say('c2')
  await rig.hold(FAST ? 100 : 1500)
  await rig.sub('')
  await rig.hold(FAST ? 60 : 700)
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
