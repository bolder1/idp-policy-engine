/* -----------------------------------------------------------------------------
   Film A — the take.

   Two halves. Before the picture starts, the console builds the story's world
   for itself with the window hidden: the Pune office zone, the Office laptops
   profile, the GitHub-and-Jira policy with its two rules. Then the film plays
   the nineteen shots over that world — the dashboard rising into frame, the
   rule lifting off it and being assembled in front of the camera, the chain
   read top to bottom.

   No cursor. Nothing is clicked on screen. The console just IS, the way the
   reference films show a product.

   `node rec/promo/film.mjs --fast` proves every step without the pacing.
   -------------------------------------------------------------------------- */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

import { SCRIPT, SUBS } from './script.mjs'
import * as stage from './stage.mjs'

const VIDEO = decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const U = (p) => `file:///${p.replace(/ /g, '%20')}`
const require = createRequire(`${U(VIDEO)}/package.json`)
const { chromium } = require('playwright')

const FAST = process.argv.includes('--fast')
const HERE = import.meta.dirname
const OUT = path.join(HERE, FAST ? 'take-dry' : 'take')
const APP = 'http://localhost:4173/'

/* --- what the take is made from ------------------------------------------- */
const vo = {}
for (const id of Object.keys(SCRIPT)) {
  const f = path.join(HERE, 'voice', `${id}.json`)
  if (!fs.existsSync(f)) throw new Error(`no voice for ${id}`)
  vo[id] = FAST ? 0.05 : JSON.parse(fs.readFileSync(f, 'utf8')).duration
}
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'fragments', 'manifest.json'), 'utf8'))
const FR = {}
for (const [name, m] of Object.entries(manifest)) {
  const png = fs.readFileSync(path.join(HERE, 'fragments', `${name}.png`))
  FR[name] = { src: 'data:image/png;base64,' + png.toString('base64'), w: m.w, h: m.h }
}

/* --- the camera ------------------------------------------------------------- */
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } } })
await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen', '1') } catch {} })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.setContent(stage.html(APP))
await page.evaluate((m) => window.__st.frags(m), FR)
const app = page.frameLocator('#app')

const t0 = Date.now()
const t = () => (Date.now() - t0) / 1000
const voice = [], events = [], sections = [], missing = []
let section = null
const sec = (kind) => { if (section) sections.push({ ...section, end: t() }); section = { start: t(), kind } }
const hold = (ms) => page.waitForTimeout(FAST ? Math.min(ms, 80) : ms)
const st = (fn, ...args) => page.evaluate(([f, a]) => window.__st[f](...a), [fn, args])
const box = async (loc) => { const b = await loc.first().boundingBox(); if (!b) missing.push('no box'); return b ?? { x: 0, y: 0, width: 10, height: 10 } }
const sfx = (type, extra = {}) => events.push({ type, t: t(), ...extra })

/* A line, with actions under it, paced to the voice. `at(frac, fn)` runs a
   beat a fraction of the way through the line — the way the assembly keeps
   time with "Then write the rule… on a password… a second factor". */
const say = async (id, fn) => {
  const start = t(), d = vo[id]
  voice.push({ id, t: start, d })
  const at = async (frac, f) => { const w = start + d * frac - t(); if (w > 0) await hold(w * 1000); await f() }
  if (fn) await fn(at)
  const left = start + d - t()
  if (left > 0) await hold(left * 1000)
  await hold(FAST ? 40 : 260)
}

/* --- the world, built off camera ------------------------------------------- */
const btn = (re) => app.getByRole('button', { name: re }).first()
const rail = (n) => app.locator('.bshell__item, .bshell__subitem').filter({ hasText: new RegExp(`^${n}$`) }).first()
const go = async (n) => { const it = rail(n); if (!(await it.isVisible().catch(() => false))) { await rail('Policies').click(); await hold(300) } await it.click(); await hold(500) }
const condition = async (what, value) => {
  const plain = app.locator('.bb__ifadd').filter({ hasText: 'Add condition' }).first()
  if (await plain.isVisible().catch(() => false)) await plain.click()
  else { await app.locator('.bb__sec').filter({ hasText: /^\s*If/ }).locator('.bx-btn').filter({ hasText: /^Add$/ }).first().click(); await hold(250); await app.getByRole('menuitem', { name: /^Add condition$/ }).first().click() }
  await hold(250); await app.getByRole('option', { name: what }).first().click(); await hold(300)
  await app.locator('.cp__fld').last().click(); await hold(250)
  await app.locator('[role=checkbox]').filter({ hasText: value }).first().click(); await hold(200)
  await page.keyboard.press('Escape'); await hold(200)
}
const build = async () => {
  await app.locator('.bshell__item').first().waitFor({ state: 'visible', timeout: 20000 })
  await go('Zones')
  await btn(/^New zone$/).click(); await hold(350)
  await app.locator('[role=dialog] input').first().fill('Pune office'); await btn(/^Continue$/).click(); await hold(500)
  await app.locator('button, [role=tab]').filter({ hasText: /^Locations$/ }).first().click(); await hold(300)
  await btn(/^Add location$/).click(); await hold(250)
  await app.locator('input[aria-label="Search places"], input[placeholder="Search places"]').first().fill('Pune'); await hold(500)
  await app.locator('.bz7__hit').first().click(); await hold(350)
  const km = app.locator('.bz7__rangenum').first(); await km.click(); await page.keyboard.press('Control+a'); await page.keyboard.type('25'); await hold(200)
  await btn(/^Review & save$/).click(); await hold(400); await app.locator('[role=dialog] .bx-btn--brand').last().click(); await hold(600)

  await go('Device profiles')
  await btn(/Create new profile/).click(); await hold(450)
  await app.locator('input[placeholder="Corporate laptops"]').first().fill('Office laptops')
  await app.locator('.bfp2__answer').first().click(); await hold(200); await btn(/^Next$/).click(); await hold(450)
  for (const n of ['Windows', 'Screen lock', 'Device integrity']) { await app.locator('.bfp2__pickrow').filter({ hasText: new RegExp(`^${n}`) }).first().click(); await hold(150) }
  await app.getByRole('combobox', { name: /Minimum Windows version/ }).first().click(); await hold(300)
  await app.getByRole('option', { name: /Windows 11/ }).first().click(); await hold(200)
  await btn(/^Next$/).click(); await hold(450); await btn(/^Create profile$/).click(); await hold(700)

  await go('All Policies')
  await btn(/^New policy$/).click(); await hold(600)
  await app.locator('button[aria-label="Rename"]').first().click(); await hold(200)
  await app.locator('.bbtop__rename input').first().fill('Office laptops — GitHub and Jira'); await page.keyboard.press('Enter'); await hold(300)
  await btn(/Start from scratch/).click(); await hold(400)
  await app.locator('.bb__start').first().click(); await hold(400)
  const search = app.locator('input[placeholder*="Search applications" i], input[aria-label*="Search applications" i]').first()
  for (const name of ['GitHub', 'Jira']) { await search.fill(name); await hold(300); await app.locator('.bb__apps__item').filter({ hasText: new RegExp(name) }).first().click(); await hold(150) }
  await btn(/Save applications/).click(); await hold(450)
  await app.locator('.bb__link__add').first().click(); await hold(450)
  await app.locator('input[aria-label="Rule name"]').first().fill('Office laptop in Pune'); await hold(150)
  await condition(/Device profile/, /Office laptops/); await condition(/Network zone/, /Pune office/)
  await app.getByRole('radio', { name: /Allow/ }).first().click(); await hold(300)
  await app.locator('.bb__link__add').last().click(); await hold(450)
  /* The inspector has to be showing RULE 2 before anything below is pressed.
     The first pass asserted the Allow radio was checked and passed anyway —
     the radio it found belonged to rule 1, already Allow, and the second
     factor it then set went onto rule 1 too. So: wait for the panel's own
     number to read 2, press inside the panel, and assert on what the CARD
     says, which is the only thing the film shows. */
  const insp = app.locator('.bb__insp')
  for (let i = 0; i < 20 && (await insp.locator('.bb__inspnum').textContent().catch(() => '')).trim() !== 'Rule 2'.replace('Rule ', '') && !/2$/.test((await insp.locator('.bb__inspnum').textContent().catch(() => '')).trim()); i++) await hold(150)
  await insp.locator('input[aria-label="Rule name"]').first().fill('Everyone else'); await hold(150)
  const allow2 = insp.getByRole('radio', { name: /Allow/ }).first()
  const card2 = app.locator('.bb__card').nth(1)
  for (let i = 0; i < 3 && !/Allow/.test((await card2.innerText().catch(() => '')) ?? ''); i++) { await allow2.scrollIntoViewIfNeeded(); await allow2.click(); await hold(400) }
  if (!/Allow/.test((await card2.innerText().catch(() => '')) ?? '')) missing.push('rule 2: card never shows Allow')
  const second = insp.locator('.bb__thenfield').filter({ hasText: /Second factor/ }).locator('.bx-picker__trigger').first()
  for (let i = 0; i < 3 && (await second.count()) && /None/.test((await second.textContent()) ?? ''); i++) {
    await second.click(); await hold(300)
    const o = app.getByRole('option').filter({ hasText: /Any enabled method/ }).first()
    if (await o.count()) await o.click(); await hold(350)
  }
  if (!(await second.count()) || /None/.test((await second.textContent()) ?? '')) missing.push('rule 2: second factor not set')
  const c1 = (await app.locator('.bb__card').nth(0).innerText().catch(() => '')) ?? ''
  if (!/Password/.test(c1) || /Any enabled/.test(c1)) missing.push('rule 1 was altered: ' + c1.replace(/\s+/g, ' ').slice(0, 80))
  await btn(/^Save policy$/).click(); await hold(600)
  const close = app.locator('button[aria-label="Close the panel"]').first(); if (await close.count()) { await close.click(); await hold(300) }
  const ex = btn(/^Expand all$/); if (await ex.count()) { await ex.click(); await hold(400) }
  const fit = btn(/^Fit to width$/); if (await fit.count()) { await fit.click(); await hold(400) }
  /* The pointer leaves the set. It had been left on the last button it
     pressed, and that button's tooltip — "Fit to width" — was sitting in the
     middle of the dashboard when the picture started. */
  await page.mouse.move(1912, 1072); await hold(450)
}

/* --- shots ---------------------------------------------------------------- */
const ICON = {
  laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
}
const card = (icon, text) => `<div class="card"><div class="ic">${ICON[icon]}</div><b>${text}</b></div>`
const img = (name, w, extra = '') => `<img class="frag" src="${FR[name].src}" style="width:${w}px;${extra}">`

try {
  /* the world, while the frame is still just light */
  sec('hook')
  const built = build()

  /* 1 · HOOK */
  await hold(600)
  /* The opening shot is one real thing, big: the start node reads "A login
     arrives at GitHub Enterprise and 1 more", which is the whole premise. At
     760px it photographed as a pill in an empty frame. */
  await st('type', `<div style="display:flex;justify-content:center">${img('start', 1120, 'border-radius:999px')}</div>`)
  await say('h1')
  await st('type', `<div style="display:flex;justify-content:center;margin-bottom:40px">${img('start', 900, 'border-radius:999px;animation:none;opacity:1;transform:none')}</div>` +
    `<h1 class="h1 land" style="text-align:center">Should they get in<span class="q">?</span></h1>`)
  await say('h2')

  /* 2 · PAIN */
  await st('type', `<div class="kick land">Three sign-ins, this morning</div><div class="cards" style="margin-top:28px"></div>`)
  await say('p1', async () => { await st('add', card('laptop', 'A contractor’s laptop, two updates behind'), '.cards') })
  await say('p2', async () => { await st('add', card('globe', 'A login from a country you’ve never sold to'), '.cards') })
  await say('p3', async () => { await st('add', card('clock', 'Your own admin, on hotel wifi, at 2am'), '.cards') })

  /* 3 · THE BREAK */
  await say('b1', async (at) => {
    await at(0.42, async () => {
      await st('cls', '.cards', 'grey')
      await st('add', `<div class="stamp"><span class="allow">Allow</span><em>Password <b>→</b> Logged in</em></div>`)
      sfx('click', { pan: 0 })
    })
  })
  await say('b2', async (at) => {
    await st('cls', '.stamp', 'fadeout')
    await st('cls', '.cards', 'line')
    await at(0.02, async () => st('add', `<h1 class="h1 land" style="margin-top:40px">One rule for everyone isn’t a policy.</h1>`))
    await at(0.62, async () => st('add', `<h1 class="h1 land"><em>It’s a guess.</em></h1>`))
  })

  /* 4 · THE TURN — the dashboard arrives */
  await built
  await st('out'); await hold(FAST ? 40 : 520)
  await st('type', '')
  sec('board')
  await st('url', '/admin/policies/office-laptops')
  await st('win', 'on')
  await hold(FAST ? 60 : 900)
  await say('t1', async (at) => { await at(0.15, () => st('zoom', 1.06, 50, 40)) })

  /* 5 · CONTRAST — the form that is not this, then the rule lifts out */
  const rule1 = app.locator('.bb__card').nth(0)
  await rule1.scrollIntoViewIfNeeded().catch(() => {})
  await say('c1', async (at) => {
    await st('zoom', 1, 50, 40)
    await st('win', 'dim')
    await st('type', `<div class="form">${Array.from({ length: 11 }, (_, i) => `<i style="--w:${140 + ((i * 97) % 260)}px"></i>`).join('')}</div>`)
    await hold(FAST ? 30 : 60); await st('cls', '.form', 'on')
    await at(0.5, async () => {
      await st('cls', '.form', 'out')
      const from = await box(rule1)
      const k = 1.62
      await st('lift', 'rule1-d', from, { x: 1920 - 180 - FR['rule1-d'].w * k, y: 200, width: FR['rule1-d'].w * k })
    })
  })
  await say('c2', async (at) => {
    await st('type', '')
    await at(0.02, () => st('hl', 0, 0.2))
    await at(0.36, () => st('hl', 0.2, 0.68))
    await at(0.7, () => st('hl', 0.68, 1))
  })
  await say('c3', async () => {
    await st('hl', null)
    await st('drop')
    await hold(FAST ? 40 : 520)
    await st('type', `<h1 class="h1 land" style="text-align:center">Here’s how.</h1>`)
  })

  /* 6 · HOW — the shelf builds, then the rule is assembled */
  sec('demo')
  const shelfX = 200, shelfY = 96
  /* The zone on the shelf is the location control itself — "Pune · City · 25
     km" — not the list row's name line, which photographed as a 21px sliver
     nobody could read. Clipped on the right to lose its trash icon, and shown
     at 1.3x like everything on this shelf: these are the two things the rule
     is about to be built from, and they were reading small. */
  const SH = 1.3
  const RW = 564 * SH, RH = 36 * SH
  await say('w1', async (at) => {
    await st('type', `<div class="shelf"><div class="frag" style="width:${RW * 0.9}px;height:${RH + 24}px;border-radius:12px;overflow:hidden;background:#fff;padding:12px 16px;animation-delay:.05s"><img src="${FR.range.src}" style="width:${RW}px;display:block"></div></div>`)
    await at(0.5, async () => {
      const r = await page.evaluate(() => { const e = document.querySelector('#type .shelf .frag'); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })
      await st('ring', r.x + r.w + 150, r.y + r.h / 2)
    })
    await at(0.82, () => st('add', `<div class="sub land" style="position:absolute;left:${shelfX}px;top:${shelfY + 80}px">Named once. Used by every policy.</div>`))
  })
  await say('w2', async (at) => {
    await st('clearFx')
    await st('cls', '.sub', 'fadeout')
    const W = 563 * SH, clipTop = 82 * SH, clipBottom = 30 * SH, visW = W * 0.93
    await st('add', `<div class="frag" id="checks" style="width:${visW}px;height:${(267 * SH) - clipTop - clipBottom}px;overflow:hidden;background:#fff;border-radius:12px;padding:0 0 0 12px;position:relative"><img src="${FR.checks.src}" style="width:${W}px;display:block;margin-top:-${clipTop}px"></div>`, '.shelf')
    const r = await page.evaluate(() => { const e = document.querySelector('#checks'); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })
    const rows = [0.24, 0.5, 0.76]
    await at(0.4, () => st('tick', 't1', r.x + r.w + 10, r.y + r.h * rows[0]))
    await at(0.62, () => st('tick', 't2', r.x + r.w + 10, r.y + r.h * rows[1]))
    await at(0.84, () => st('tick', 't3', r.x + r.w + 10, r.y + r.h * rows[2]))
  })

  await say('w3', async (at) => {
    const from = await box(rule1)
    const k = 1.5
    const to = { x: 1920 - 150 - FR['rule1-a'].w * k, y: 330, width: FR['rule1-a'].w * k }
    await st('lift', 'rule1-d', from, to)
    await at(0.08, () => { st('swap', 'rule1-a'); sfx('mxblue', { key: 'O' }); sfx('mxblue', { key: 'f' }); sfx('mxblue', { key: 'f' }) })
    /* the shelf feeds the rule: device row, then place row */
    const shelf = await page.evaluate(() => [...document.querySelectorAll('#type .shelf > *')].map((e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } }))
    const L = () => page.evaluate(() => window.__st.liftRect())
    await at(0.26, async () => { await st('swap', 'rule1-b'); await hold(300); const l = await L(); if (shelf[1]) await st('line', 'l1', shelf[1].x + shelf[1].w, shelf[1].y + shelf[1].h / 2, l.x, l.y + l.height * 0.5) })
    await at(0.44, async () => { await st('swap', 'rule1-c'); await hold(300); const l = await L(); if (shelf[0]) await st('line', 'l2', shelf[0].x + shelf[0].w, shelf[0].y + shelf[0].h / 2, l.x, l.y + l.height * 0.62) })
    await at(0.6, async () => { await st('swap', 'rule1-d'); await st('hlz', true) })
    await at(0.72, async () => {
      await st('clearFx'); await st('out'); await st('drop'); await hold(FAST ? 40 : 560); await st('type', ''); await st('win', 'clear')
    })
    await at(0.82, async () => { const r2 = await box(app.locator('.bb__card').nth(1)); await st('warm', 'w2', r2) })
  })

  /* 7 · LIFT — read from the top */
  sec('banner')
  await say('l1', async (at) => {
    await st('clearFx')
    const chain = await box(app.locator('.bb__chain'))
    const start = await box(app.locator('.bb__start'))
    const r1 = await box(rule1)
    await st('zoom', 1.1, 50, 30)
    await at(0.1, () => st('bar', chain.x - 16, start.y - 8, chain.width + 32, start.height + 16))
    await at(0.5, async () => { await st('bar', chain.x - 16, r1.y - 8, chain.width + 32, r1.height + 16) })
    await at(0.82, () => st('warm', 'w1', r1))
  })
  await say('l2', async (at) => {
    const r2 = await box(app.locator('.bb__card').nth(1)), r3 = await box(app.locator('.bb__card').nth(2))
    await at(0.12, async () => { await st('shade', 's2', r2); await st('shade', 's3', r3) })
    await at(0.5, () => st('type', `<div class="h2 land" style="position:absolute;right:170px;top:50%;transform:translateY(-50%);max-width:420px">First match decides.</div>`))
  })

  /* 8 · CLOSE */
  sec('outro')
  await st('clearFx'); await st('zoom', 1, 50, 45)
  await st('type', ''); await st('win', 'off'); await hold(FAST ? 40 : 600)
  await say('e1', async () => { await st('type', `<h1 class="h1 land">Stop writing one rule for everyone.</h1>`) })
  await say('e2', async () => { await st('cls', '.h1', 'grey'); await st('add', `<h1 class="h1 land" style="margin-top:10px"><em>Start deciding sign-in by sign-in.</em></h1>`) })
  await say('e3', async () => {
    /* The mark is a photograph of the shell's own logo, so it comes with a
       white ground and the header's bottom rule. Framed as a card, clipped of
       that rule, and centred, it is an ending; dropped bare at top-left it was
       a sticker. */
    const L = FR.logo, k = 2.3
    await st('type', `<div class="lockup" style="align-items:center;width:100%">
      <div class="land" style="background:#fff;border-radius:22px;padding:34px 52px;box-shadow:0 30px 70px rgba(16,24,40,.14),0 0 0 1px rgba(16,24,40,.05)">
        <div style="width:${(L.w - 16) * k}px;height:${(L.h - 24) * k}px;overflow:hidden"><img src="${L.src}" style="width:${L.w * k}px;display:block;margin:-${8 * k}px 0 0 -${8 * k}px"></div>
      </div>
      <div class="name land d1" style="font-size:38px;margin-top:6px">The policy engine</div>
    </div>`)
  })
  await hold(FAST ? 100 : 2000)
  await st('out'); await hold(FAST ? 60 : 700)
} catch (e) {
  missing.push(`THREW: ${e.message}`); console.error('\n!! ' + e.message)
} finally {
  if (section) sections.push({ ...section, end: t() })
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ duration: t(), voice, events, sections, missing, errors: [...new Set(errors)] }, null, 1))
  const dur = t()
  await ctx.close(); await browser.close()
  const webm = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm')).map((f) => path.join(OUT, f))[0]
  console.log(`\nfilm: ${dur.toFixed(1)}s → ${webm}`)
  if (missing.length) console.log('MISSED:\n  ' + missing.join('\n  '))
  if (errors.length) console.log('PAGE ERRORS:\n  ' + [...new Set(errors)].join('\n  '))
}
