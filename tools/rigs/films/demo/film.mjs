/* -----------------------------------------------------------------------------
   The demo film — the take itself.

   Five chapters, the order the manager asked for: a zone, a device profile, a
   policy built from both, policies that go further, and the authentication
   methods every one of those rules ends in.

   Everything here is the real console doing the real thing. Nothing is faked,
   nothing is sped up, and where a step needs a moment the film waits for it.

   `node rec/demo/film.mjs --fast` runs the whole thing with the holds cut to a
   frame, to prove every selector still finds its control before a real take.
   -------------------------------------------------------------------------- */
import fs from 'node:fs'
import path from 'node:path'

import { SCRIPT } from './script.mjs'
import { open } from './studio.mjs'
import { newestWebm } from '../status/harness.mjs'

const FAST = process.argv.includes('--fast')
const OUT = path.join(import.meta.dirname, FAST ? 'take-dry' : 'take')
const VOICE_DIR = path.join(import.meta.dirname, 'voice')

/* Durations come from the voice, so the picture is cut to the narration. In a
   dry run every line is a blink — the point is the selectors, not the pacing. */
const vo = {}
for (const id of Object.keys(SCRIPT)) {
  const f = path.join(VOICE_DIR, `${id}.json`)
  if (!fs.existsSync(f)) throw new Error(`no voice for "${id}" — run rec/demo/vo.mjs first`)
  vo[id] = { duration: FAST ? 0.05 : JSON.parse(fs.readFileSync(f, 'utf8')).duration }
}
const caps = Object.fromEntries(Object.entries(SCRIPT).map(([id, v]) => [id, v.cap ?? '']))

fs.rmSync(OUT, { recursive: true, force: true })
const { browser, ctx, page, st } = await open({ out: OUT, caps, vo, fast: FAST })
const rec = st.rec

/* --- vocabulary ----------------------------------------------------------- */
const btn = (re) => page.getByRole('button', { name: re }).first()
const rail = (name) => page.locator('.bshell__item, .bshell__subitem').filter({ hasText: new RegExp(`^${name}$`) }).first()
const tab = (name) => page.locator('button, [role=tab]').filter({ hasText: new RegExp(`^${name}$`) }).first()
/* The Policies group is already open when the console loads, so clicking its
   parent SHUTS it — which is how the first dry run lost the Zones link. Only
   reach for the parent when the child is not on screen. */
const goRail = async (name) => {
  const item = rail(name)
  if (!(await item.isVisible().catch(() => false))) {
    await st.click(rail('Policies'))
    await st.hold(500)
  }
  await st.click(item)
  await st.hold(400)
}
const opt = (re) => page.getByRole('option', { name: re }).first()
/* The value list on a condition is a list of CHECKBOXES, not options — a zone
   or a profile condition can hold several. Picking one by its role is what the
   first dry run got wrong. */
const pick = (re) => page.locator('[role=checkbox]').filter({ hasText: re }).first()

/* One whole condition: choose what is checked, choose what it is checked
   against, and COMMIT it with Add.

   The escape matters. Picking a value leaves that menu open — it is a
   multi-select, so it waits for a second pick — and the Add button underneath
   is behind it. Without closing it the condition stayed a draft row, the
   "Add condition" button never came back, and the second condition had nothing
   to click. The commit is asserted, because a draft row looks almost exactly
   like a committed one in a wide shot. */
/* Two doors, depending on whether the rule already has a condition. An empty
   If shows "Add condition" and "Add conditional group" as plain buttons; once
   one condition is on the rule those collapse into a single "+ Add" that opens
   a menu holding the same two. The second condition went looking for the first
   door and found nothing. */
const startCondition = async () => {
  const plain = page.locator('.bb__ifadd').filter({ hasText: 'Add condition' }).first()
  if (await plain.isVisible().catch(() => false)) { await st.click(plain); return }
  const more = page.locator('.bb__sec').filter({ hasText: /^\s*If/ }).locator('.bx-btn').filter({ hasText: /^Add$/ }).first()
  await st.click(more)
  await st.hold(450)
  await st.click(page.getByRole('menuitem', { name: /^Add condition$/ }).first())
}

const condition = async (what, value) => {
  await startCondition()
  await st.hold(450)
  await st.click(opt(what))
  await st.hold(550)
  await st.click(page.locator('.cp__fld').last())
  await st.hold(450)
  await st.click(pick(value))
  await st.hold(400)
  /* Closing the value list is the whole of "committing" — the condition is
     already on the rule. There IS an "Add" button under the row, and it is not
     this: it opens the and/or menu for a SECOND condition, and pressing it
     here put a popup over the panel that the next step then waited on
     forever. */
  await st.press('Escape')
  await st.hold(400)
  const got = await page.locator('.cp__fld').last().getAttribute('aria-label')
  if (!got || /Currently nothing/.test(got)) st.missing.push(`condition has no value: ${what}`)
}
/* The library pages save through a read-back dialog: press the brand button in
   it and the change lands. Without this the zone stayed dirty, the leave guard
   caught the next rail click, and the film sat on a modal it never answered. */
const confirmDialog = async () => {
  const d = page.locator('[role=dialog]')
  if (!(await d.count())) return false
  const go = d.locator('.bx-btn--brand').last()
  if (await go.count()) { await st.click(go); await st.hold(700); return true }
  return false
}
const card = (title, sub, kick = '') =>
  `<div class="kick">${kick}</div><h1>${title}</h1><p>${sub}</p>`

const chapter = async (n, title, sub, ms = 2600) => {
  st.section('banner')
  await rec.cap('')
  await st.card(card(title, sub, `Chapter ${n}`), FAST ? 150 : ms)
  await st.uncard()
  st.section('demo')
}

try {
  /* =======================================================================
     Opening
     ===================================================================== */
  st.section('hook')
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await st.hold(900)
  await st.card(card('The policy engine', 'Who gets in, on what device, from where — decided in plain language.', 'xecurify · by miniOrange'))
  await st.say('t1')
  await st.say('t2')
  await st.uncard()
  await st.hold(500)

  /* =======================================================================
     Chapter 1 · Zones
     ===================================================================== */
  await chapter(1, 'Zones', 'A named place, described once and used everywhere.')
  await st.say('z0')
  await st.say('z1')
  await st.say('z2')

  await goRail('Zones')
  await st.hold(400)
  await st.say('z3', async () => {
    await st.hover(page.locator('.blist__open').first())
    await st.hold(500)
  })

  await st.click(btn(/^New zone$/))
  await st.hold(400)
  await st.type(page.locator('[role=dialog] input').first(), 'Pune office')
  await st.click(btn(/^Continue$/))
  await st.hold(900)

  await st.say('z4', async () => {
    await st.hover(tab('IP networks'))
    await st.hold(400)
  })
  await st.click(tab('Locations'))
  await st.hold(500)
  await st.click(btn(/^Add location$/))
  await st.hold(400)
  await st.say('z5', async () => {
    await st.type(page.locator('input[aria-label="Search places"], input[placeholder="Search places"]').first(), 'Pune', { delay: 130 })
    await st.hold(700)
  })
  await st.click(page.locator('.bz7__hit').first())
  await st.hold(700)

  await st.say('z6', async () => {
    const km = page.locator('.bz7__rangenum').first()
    await st.click(km)
    await st.press('Control+a')
    await st.keys('25', { delay: 170 })
    await st.hold(500)
    await st.hover(page.locator('.bz7__rangecol .bx-picker__trigger').first())
    await st.hold(400)
  })
  await st.say('z7')

  await st.click(btn(/^Review & save$/))
  await st.hold(700)
  await st.say('z8', async () => {
    await confirmDialog()
    await st.hold(600)
  })

  /* =======================================================================
     Chapter 2 · Device profiles
     ===================================================================== */
  await chapter(2, 'Device profiles', 'What the machine has to be before it is let in.')
  await st.say('d0')
  await st.say('d1')

  await goRail('Device profiles')
  await st.hold(600)
  await st.say('d2', async () => {
    await st.hover(page.locator('.blist__open').first())
    await st.hold(400)
  })
  await st.click(btn(/Create new profile/))
  await st.hold(800)

  await st.type(page.locator('input[placeholder="Corporate laptops"], input[aria-label*="Profile name" i]').first(), 'Company laptops')
  await st.say('d3', async () => {
    await st.hover(page.locator('.bfp2__answer').first())
    await st.hold(600)
  })
  await st.click(page.locator('.bfp2__answer').first())
  await st.hold(400)
  await st.click(btn(/^Next$/))
  await st.hold(900)

  /* The checks. Each one is asserted, because a tick that silently never
     happened is the one failure this film cannot survive. */
  const tick = async (name) => {
    const row = page.locator('.bfp2__pickrow').filter({ hasText: new RegExp(`^${name}`) }).first()
    await st.click(row)
    await rec.hold(200)
    const on = await row.getAttribute('aria-checked')
    if (on !== 'true') st.missing.push(`check not ticked: ${name}`)
  }

  await st.say('d4', async () => {
    await tick('Windows')
    await st.hold(500)
    await st.hover(page.locator('.bfp2__pickrow').filter({ hasText: /^Windows/ }).first().locator('..').locator('[role=combobox]').first())
    await st.hold(400)
  })
  await st.say('d5', async () => {
    await tick('Screen lock')
    await st.hold(300)
    await tick('Device integrity')
    await st.hold(500)
  })
  await st.click(btn(/^Next$/))
  await st.hold(900)
  await st.say('d6', async () => {
    await st.wheel(260, 4)
  })
  const create = btn(/^(Create profile|Create)$/)
  if (await create.count()) await st.click(create)
  await st.hold(1000)
  await st.say('d7')

  /* =======================================================================
     Chapter 3 · The policy builder
     ===================================================================== */
  await chapter(3, 'The policy builder', 'Who it covers, what has to be true, and what happens.')
  await st.say('p0')
  await st.say('p1')

  await goRail('All Policies')
  await st.hold(600)
  await st.click(btn(/^New policy$/))
  await st.hold(1200)
  await st.say('p2', async () => {
    await st.hover(page.locator('.bbtop__title').first())
    await st.hold(400)
  })

  await st.click(page.locator('.bbtop__acts .bx-iconbtn, button[aria-label="Rename"]').first())
  await st.hold(400)
  const nameField = page.locator('.bbtop__rename input').first()
  await st.click(nameField)
  await st.press('Control+a')
  await st.keys('Office laptops — full access', { delay: 45 })
  await st.press('Enter')
  await st.hold(700)

  await st.click(btn(/Start from scratch/))
  await st.hold(700)

  /* The applications the policy protects. Asserted at both ends: the tick, and
     the start node afterwards. In the first dry take neither landed and the
     film cheerfully carried on with a policy that protected nothing — the kind
     of failure that only shows up when somebody watches the finished cut. */
  await st.click(page.locator('.bb__start').first())
  await st.hold(900)
  /* SEARCHED for, not scrolled to. Corporate Email is the thirteenth row of a
     scrolling pane; reaching it by `scrollIntoViewIfNeeded` put it under the
     pane's own header and the press landed on nothing — twice, silently, until
     the assertion below caught it. Typing the name is also what a person would
     actually do, and it reads better on camera. */
  await st.type(page.locator('input[placeholder*="Search applications" i], input[aria-label*="Search applications" i]').first(), 'Corporate Email', { delay: 48 })
  await st.hold(600)
  const app = page.locator('.bb__apps__item').filter({ hasText: 'Corporate Email' }).first()
  await st.click(app)
  await st.hold(500)
  if ((await app.getAttribute('aria-checked')) !== 'true') st.missing.push('application not ticked')
  await st.click(btn(/Save applications/))
  await st.hold(900)
  const startText = await page.locator('.bb__start').first().textContent()
  if (/No applications/.test(startText ?? '')) st.missing.push('applications not saved')

  await st.click(page.locator('.bb__link__add').first())
  await st.hold(900)
  await st.say('p3', async () => {
    for (const h of ['Who', 'If', 'Then']) {
      await st.hover(page.locator('.bb__sec').filter({ hasText: new RegExp(`^${h}`) }).first().locator('h3'))
      await st.hold(FAST ? 40 : 700)
    }
  })

  const ruleName = page.locator('input[aria-label="Rule name"]').first()
  await st.click(ruleName)
  await st.press('Control+a')
  await st.keys('Company laptop in the office', { delay: 42 })
  await st.hold(500)

  /* condition one — the device profile */
  await st.say('p4', async () => {
    await condition(/Device profile/, /Company laptops/)
  })

  /* condition two — the zone */
  await st.say('p5', async () => {
    await condition(/Network zone/, /Pune office/)
  })

  await st.say('p6', async () => {
    await st.click(page.getByRole('radio', { name: /Allow/ }).first())
    await st.hold(700)
  })

  /* the second rule */
  await st.say('p7', async () => {
    await st.click(page.locator('.bb__link__add').last())
    await st.hold(800)
    const rn = page.locator('input[aria-label="Rule name"]').first()
    await st.click(rn)
    await st.press('Control+a')
    await st.keys('Everyone else', { delay: 42 })
    await st.hold(300)
  })
  await st.say('p8', async () => {
    await st.click(page.getByRole('radio', { name: /Allow/ }).first())
    await st.hold(600)
    const second = page.locator('[aria-label*="Second factor"], .bb__sec').filter({ hasText: /Second factor/ }).first()
    if (await second.count()) { await st.scrollTo(second); await st.hold(500) }
  })

  await st.say('p9', async () => {
    await st.click(page.locator('.bb__card').filter({ hasText: 'Nothing else matched' }).first())
    await st.hold(800)
  })
  await st.say('p10', async () => {
    await st.click(btn(/^Save policy$/))
    await st.hold(900)
  })

  /* =======================================================================
     Chapter 4 · Policies in practice
     ===================================================================== */
  await chapter(4, 'Policies in practice', 'The same three parts, however long the ladder gets.')
  await st.say('x0')

  await goRail('All Policies')
  await st.hold(700)
  await st.click(page.locator('.btable__link').filter({ hasText: 'Device compliance' }).first())
  await st.hold(1100)
  await st.say('x1', async () => {
    await st.click(btn(/^Expand all$/))
    await st.hold(900)
    await st.wheel(220, 4)
  })
  await st.say('x2', async () => {
    await st.wheel(260, 4)
  })

  await st.click(page.locator('.bbtop__crumb').first())
  await st.hold(800)
  await st.click(page.locator('.btable__link').filter({ hasText: 'Risk-tiered verification' }).first())
  await st.hold(1100)
  await st.say('x3', async () => {
    const ex = btn(/^Expand all$/)
    if (await ex.count()) await st.click(ex)
    await st.hold(800)
    await st.wheel(240, 4)
  })
  await st.say('x4', async () => {
    await st.wheel(240, 4)
  })

  /* =======================================================================
     Chapter 5 · Authentication methods
     ===================================================================== */
  await chapter(5, 'Authentication methods', 'The catalogue every rule draws its factors from.')
  await st.say('m0')

  await st.click(page.locator('.bbtop__crumb').first())
  await st.hold(700)
  await goRail('Authentication methods')
  await st.hold(900)
  await st.say('m1', async () => {
    await st.hover(page.locator('.bm8__card').first())
    await st.hold(600)
  })
  await st.say('m2', async () => {
    await st.hover(page.locator('.bm8__state').first())
    await st.hold(700)
    await st.wheel(180, 3)
  })
  await st.say('m3', async () => {
    await st.click(page.locator('.bm8__card--family.is-link .bm8__open').first())
    await st.hold(1100)
  })
  await st.say('m4', async () => {
    await st.wheel(150, 3)
  })
  await st.say('m5', async () => {
    const x = page.locator('[aria-label="Close"], .bx-dialog__x').first()
    if (await x.count()) await st.click(x)
    await st.hold(700)
  })

  /* =======================================================================
     Close
     ===================================================================== */
  st.section('outro')
  await rec.cap('')
  await st.card(
    '<div class="kick">xecurify · by miniOrange</div><h1>Zones · Device profiles · Policies</h1>' +
      '<p>Describe the pieces once. Use them everywhere. Read the rules from the top.</p>' +
      '<div class="chips"><span>Zones</span><span>Device profiles</span><span>Policy builder</span>' +
      '<span>Authentication methods</span></div>',
  )
  await st.say('c1')
  await st.say('c2')
  await st.hold(1400)
} catch (e) {
  st.missing.push(`THREW: ${e.message}`)
  console.error('\n!! ' + e.message)
} finally {
  st.endSections()
  st.save(OUT)
  const dur = st.t()
  await ctx.close()
  await browser.close()
  const webm = newestWebm(OUT)
  console.log(`\nfilm: ${dur.toFixed(1)}s (${(dur / 60).toFixed(1)} min) → ${webm}`)
  if (st.missing.length) console.log('MISSED:\n  ' + st.missing.join('\n  '))
  if (rec.errors.length) console.log('PAGE ERRORS:\n  ' + [...new Set(rec.errors)].join('\n  '))
  if (rec.log.length) console.log('HIT-TEST:\n  ' + [...new Set(rec.log)].join('\n  '))
}
