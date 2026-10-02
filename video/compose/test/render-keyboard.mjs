/* -----------------------------------------------------------------------------
   Stills of the on-screen keyboard, one per state it can be in.

     node compose/test/render-keyboard.mjs        → .work/test/keyboard/*.png

   For every scenario three files: `<name>.png` is the full 1920×1080 frame,
   `<name>@1x.png` the plate alone at film scale (the legibility check — what
   a viewer at 1080p actually gets), and `<name>@2x.png` the same at twice
   the size, for inspecting alignment. `report.json` carries what the page
   said each still contains — presence and which caps were down — so a
   picture can be checked against the numbers.

   Before the browser opens, the envelope is checked in node with the
   module's own functions: the board must be fully up at the instant of a
   key (a lone shortcut is the case that once failed — its cap had released
   before the board had faded in). After the stills, every scenario is
   rendered a second time in a different order and each file compared byte
   for byte: the board must be a pure function of t. Either check failing
   is exit code 1, as is any error the page logs.
   -------------------------------------------------------------------------- */
import { chromium } from 'playwright'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '../../lib/server.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIDEO = path.resolve(HERE, '..', '..')
const OUT = path.join(VIDEO, '.work', 'test', 'keyboard')

/* One typing burst, then the shortcuts the film uses. The board arrives
   0.25 s ahead of the first key and, with nothing after 3.9, is gone by 5.25. */
const EVENTS = [
  ...'policy'.split('').map((ch, i) => ({ t: i * 0.08, key: ch })),
  { t: 0.9, key: 'w' },
  { t: 1.4, key: ' ' },
  { t: 1.9, key: 'Control+z' },
  { t: 2.4, key: 'Alt+ArrowDown' },
  { t: 2.9, key: 'Shift+?' },
  { t: 3.3, key: 'W' },
  { t: 3.6, key: '—' },
  { t: 3.9, key: 'Backspace', label: 'Delete', dur: 1.1 },
]
/* A shortcut on its own, the way the film's press() beats arrive — nothing
   before it to have brought the board up. */
const SOLO = [{ t: 1.5, key: 'Control+z' }]

const SCENARIOS = [
  { name: '01-hidden', t: -0.5, note: 'before the pre-roll: nothing on screen' },
  { name: '02-fade-in', t: -0.125, note: 'mid slide-up/fade-in, 125 ms before the first key' },
  { name: '03-strike', t: 0, note: 'the first key (p) at its instant: board fully up, P orange' },
  { name: '04-typing-w', t: 0.93, note: 'w down: orange, sunk 3px' },
  { name: '05-w-release', t: 1.05, note: 'w easing back (dt 150ms)' },
  { name: '06-ctrl-z', t: 1.93, note: 'Control+z: Ctrl and Z down' },
  { name: '07-alt-down', t: 2.43, note: 'Alt+ArrowDown: Alt and ↓ down' },
  { name: '08-space', t: 1.43, note: 'Space down' },
  { name: '09-shift-slash', t: 2.93, note: 'Shift+?: Shift and / down' },
  { name: '10-upper-W', t: 3.33, note: "'W' typed: Shift and W down" },
  { name: '11-no-cap', t: 3.63, note: "'—' has no cap: plate up, nothing lit" },
  { name: '12-backspace', t: 3.93, note: 'Backspace down (its label and dur ignored)' },
  { name: '13-corner-bl', t: 0.93, corner: 'bl', note: 'bottom-left corner' },
  { name: '14-fade-out', t: 5.1, note: 'leaving: 1.2s after the last key' },
  { name: '15-gone', t: 5.3, note: 'after the fade-out: nothing on screen' },
  { name: '16-solo-preroll', t: 1.375, events: SOLO, note: 'a lone Control+z, 125 ms ahead: board arriving, nothing down' },
  { name: '17-solo-strike', t: 1.545, events: SOLO, note: 'a lone Control+z, 45 ms in: board fully up, Ctrl and Z orange' },
  { name: '18-over-window-light', t: 0.7, window: true, note: 'at rest over the product window, light' },
  { name: '19-over-window-dark', t: 0.7, window: true, theme: 'dark', note: 'at rest over the product window, dark' },
  { name: '20-dark-ground', t: 0.7, theme: 'dark', note: 'at rest over the dark ground alone' },
]

/* --- the envelope, in numbers ----------------------------------------------- */
globalThis.window = globalThis
await import('../keyboard.js')
const K = window.KEYBOARD
const { IN, LINGER, OUT: FADE, HOLD } = K.TIMING
const near = (a, b) => Math.abs(a - b) < 1e-9
const checks = []
const check = (label, ok, got) => {
  checks.push(ok)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${got !== undefined ? `  (${got})` : ''}`)
}
{
  const e = SOLO[0]
  const k = (t) => K.presence(t, SOLO)
  check(`presence 0 at key−${IN}`, near(k(e.t - IN), 0), k(e.t - IN).toFixed(3))
  check(`presence 0.5 at key−${IN / 2}`, near(k(e.t - IN / 2), 0.5), k(e.t - IN / 2).toFixed(3))
  check('presence 1 at the key', near(k(e.t), 1), k(e.t).toFixed(3))
  check(`presence 1 at key+${LINGER}`, near(k(e.t + LINGER), 1), k(e.t + LINGER).toFixed(3))
  check(`presence 0.5 at key+${LINGER + FADE / 2}`, near(k(e.t + LINGER + FADE / 2), 0.5), k(e.t + LINGER + FADE / 2).toFixed(3))
  check(`presence 0 at key+${LINGER + FADE}`, near(k(e.t + LINGER + FADE), 0), k(e.t + LINGER + FADE).toFixed(3))
  // what a viewer sees of the cap: presence × depth, through the whole hold
  let seen = 1
  for (let dt = 0; dt <= HOLD; dt += 0.005) seen = Math.min(seen, k(e.t + dt) * (K.presses(e.t + dt, SOLO).KeyZ ?? 0))
  check('a lone shortcut is seen at full orange through its hold', near(seen, 1), seen.toFixed(3))
  const two = [e, { t: e.t + 8, key: 'a' }]
  check('a burst 8 s later brings the board back', near(K.presence(e.t + 8 - IN / 2, two), 0.5), K.presence(e.t + 8 - IN / 2, two).toFixed(3))
  check("capsFor('Shift+?') → ShiftLeft, Slash", K.capsFor('Shift+?').join(',') === 'ShiftLeft,Slash', K.capsFor('Shift+?').join(','))
  check("capsFor('Shift++') → ShiftLeft, Equal", K.capsFor('Shift++').join(',') === 'ShiftLeft,Equal', K.capsFor('Shift++').join(','))
}
const numbersOk = checks.every(Boolean)

/* --- the stills ---------------------------------------------------------------- */
await rm(OUT, { recursive: true, force: true }) // so the folder holds exactly this run's stills
await mkdir(OUT, { recursive: true })
const server = await serve({ '/compose': path.join(VIDEO, 'compose') })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'],
})
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${server.url}/compose/test/keyboard.html`, { waitUntil: 'load' })
  // the legends are DM Sans; a still taken before the face arrives would be in the fallback
  const font = await page.evaluate(async () => {
    try {
      await document.fonts.load('500 16px "DM Sans"')
    } catch {}
    await document.fonts.ready
    return document.fonts.check('500 16px "DM Sans"')
  })
  console.log(`DM Sans ${font ? 'loaded' : 'NOT loaded — legends are in the fallback face'}`)
  const cdp = await ctx.newCDPSession(page)

  // the plate and its shadow (plus the 14px it slides through), at a scale
  const plate = async (r, scale) => {
    const m = 28
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: r.x - m, y: r.y - m - 14, width: r.width + m * 2, height: r.height + m * 2 + 14, scale },
    })
    return Buffer.from(data, 'base64')
  }
  const still = async (s) => {
    const { events = EVENTS, ...rest } = s
    const res = await page.evaluate((s) => window.TEST.render(s), { ...rest, events })
    const png = await page.screenshot()
    return { res, png, x1: await plate(res.rect, 1), x2: await plate(res.rect, 2) }
  }

  const report = []
  const first = new Map()
  for (const s of SCENARIOS) {
    const { res, png, x1, x2 } = await still(s)
    await writeFile(path.join(OUT, `${s.name}.png`), png)
    await writeFile(path.join(OUT, `${s.name}@1x.png`), x1)
    await writeFile(path.join(OUT, `${s.name}@2x.png`), x2)
    first.set(s.name, { png, x1, x2 })
    const down = Object.entries(res.down)
      .map(([id, v]) => `${id}:${v.toFixed(2)}`)
      .join(' ')
    report.push({ ...s, events: s.events === SOLO ? 'solo' : 'burst', k: res.k, down: res.down })
    console.log(`${s.name.padEnd(22)} t=${String(s.t).padEnd(6)} k=${res.k.toFixed(2)}  ${down || '-'}   ${s.note}`)
  }
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ events: { burst: EVENTS, solo: SOLO }, stills: report }, null, 2))

  // same t, different history → same pixels: every still again, in reverse
  const diffs = []
  for (const s of [...SCENARIOS].reverse()) {
    const again = await still(s)
    const was = first.get(s.name)
    for (const [k, suffix] of [['png', ''], ['x1', '@1x'], ['x2', '@2x']]) if (Buffer.compare(was[k], again[k]) !== 0) diffs.push(`${s.name}${suffix}.png`)
  }
  console.log(`determinism: ${SCENARIOS.length * 3} files rendered again in reverse order — ${diffs.length ? `DIFFERENT: ${diffs.join(', ')}` : 'all byte-identical'}`)
  if (errors.length) console.log('page errors:', errors)
  if (!numbersOk) console.log('envelope: a numeric check FAILED (see above)')
  console.log(`→ ${OUT}`)
  if (diffs.length || errors.length || !numbersOk) process.exitCode = 1
} finally {
  await browser.close()
  await server.close()
}
