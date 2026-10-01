/* -----------------------------------------------------------------------------
   Capture the product takes.

     node capture.mjs                  every take, filmed
     node capture.mjs --dry            every take, performed but not filmed —
                                       a fast check that every selector still
                                       resolves before spending minutes filming
     node capture.mjs --only canvas    re-film one take; the takes before it are
                                       performed dry so the app is in the right
                                       state, and the takes after it are skipped

   Needs the dev server: APP_URL=http://localhost:5173 (or --app <url>).
   -------------------------------------------------------------------------- */
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { openRecorder } from './lib/recorder.mjs'
import { TAKES } from './storyboard/takes.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : d
}
/* One work folder per film, so the light and dark captures sit side by side:
     --work .work/dark  →  .work/dark/capture */
const WORK = path.resolve(HERE, opt('work', process.env.WORK_DIR ?? '.work'))
const OUT = path.join(WORK, 'capture')
const APP = opt('app', process.env.APP_URL ?? 'http://localhost:5173')
const only = String(opt('only', '')).split(',').filter(Boolean)
const dryRun = argv.includes('--dry')
const THEME = opt('theme', 'light')
const EDITION = opt('edition', 'full')
// --snaps <dir>: a still at every caption, even in a dry run — a fast audit of a whole theme
const SNAPS = opt('snaps', '')

await mkdir(OUT, { recursive: true })
const rec = await openRecorder({
  appUrl: APP,
  outDir: OUT,
  fps: 30,
  dsf: 2,
  storage: { 'idp.tour.seen': '1' },
  /* The persona pill is prototype furniture ("it would not ship") and sits in
     every frame of the top bar; hidden for the film, nothing else is touched. */
  css: '.bpb{display:none!important}',
})

const t0 = Date.now()
let failed = null
try {
  await rec.boot((p) => p.getByRole('heading', { level: 1, name: 'Policies' }), { settle: 3500 })
  rec.dry = true
  if (EDITION !== 'lite') {
    const ed = await rec.callStore('setEdition', EDITION)
    if (!ed.ok) throw new Error(`could not switch to the ${EDITION} edition: ${ed.why}`)
  }
  if (THEME === 'dark') {
    // the theme lives in Shell state, not storage: flip it once, unfilmed, and check it took
    await rec.click(rec.page.getByRole('button', { name: 'Switch to dark theme' }), { hint: false })
    await rec.step(10)
    const on = await rec.page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    if (on !== 'dark') throw new Error(`the dark theme did not switch on (data-theme=${on})`)
  }
  await rec.step(15)

  let current = 'boot'
  const snaps = []
  if (SNAPS) {
    await mkdir(SNAPS, { recursive: true })
    const say = rec.say
    let n = 0
    rec.say = (text, opts) => {
      say(text, opts)
      if (!text) return
      const slug = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
      const file = path.join(SNAPS, `${String(++n).padStart(3, '0')}-${current}-${slug}.jpg`)
      snaps.push(
        rec.cdp
          .send('Page.captureScreenshot', { format: 'jpeg', quality: 78, clip: { x: 0, y: 0, width: 1440, height: 900, scale: 0.75 } })
          .then(({ data }) => writeFile(file, Buffer.from(data, 'base64')))
          .catch(() => {}),
      )
    }
  }

  const last = only.length ? Math.max(...only.map((n) => TAKES.findIndex((t) => t.name === n))) : TAKES.length - 1
  if (last < 0) throw new Error(`no take named ${only.join(', ')}`)
  for (let i = 0; i <= last; i++) {
    const take = TAKES[i]
    current = take.name
    rec.dry = dryRun || (only.length > 0 && !only.includes(take.name))
    rec.beginTake(take.name)
    try {
      await take.run(rec, rec.page)
    } catch (err) {
      failed = take.name
      await report(take.name, err)
      throw err
    }
    await rec.endTake()
    await Promise.all(snaps.splice(0))
  }
} finally {
  const mins = ((Date.now() - t0) / 60000).toFixed(1)
  console.log(`\n${failed ? 'stopped' : 'done'} in ${mins} min · ${JSON.stringify(rec.stats)}`)
  if (rec.pageErrors.length) console.log('page errors:', rec.pageErrors.slice(0, 8))
  await rec.close()
}

async function report(name, err) {
  console.error(`\n✖ take "${name}" failed: ${String(err).split('\n')[0]}`)
  try {
    const { data } = await rec.cdp.send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(OUT, `debug-${name}.png`)
    await writeFile(file, Buffer.from(data, 'base64'))
    console.error(`  screen: ${file}`)
    const where = await rec.page.evaluate(() => ({
      dialogs: [...document.querySelectorAll('[role=dialog]')].map((d) => d.getAttribute('aria-label') || d.querySelector('h2')?.textContent),
      headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 10).map((h) => h.textContent.trim()),
      buttons: [...document.querySelectorAll('button,[role=radio],[role=tab],[role=option]')]
        .filter((b) => b.getClientRects().length)
        .slice(0, 60)
        .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48)),
    }))
    console.error(JSON.stringify(where, null, 1))
  } catch {
    /* the page is gone */
  }
}
