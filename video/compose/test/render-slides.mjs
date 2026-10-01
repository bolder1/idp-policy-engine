/* -----------------------------------------------------------------------------
   Stills of the v2 slides (hook, whiteboard, banner, outro) in both themes.

     node compose/test/render-slides.mjs                → .work/test/slides/<theme>/<slide>-<t>.png
     node compose/test/render-slides.mjs hook,banner    → only those slides
     node compose/test/render-slides.mjs --theme dark   → only that theme
     node compose/test/render-slides.mjs --no-ghost     → without the mascot ghost box

   The page (slides.html) builds each slide fresh, pauses its keyframe
   animations at t and calls update(t) — the same three steps the engine's
   driveSlide takes. The mascot's stand is drawn as a dashed ghost so the
   column a scene leaves for it can be checked. Any page error is exit 1.
   -------------------------------------------------------------------------- */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '../../lib/server.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIDEO = path.resolve(HERE, '..', '..')
const OUT = path.join(VIDEO, '.work', 'test', 'slides')

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}
const onlySlides = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--theme')?.split(',')
const onlyTheme = flag('--theme')
const ghost = !argv.includes('--no-ghost')
const extraT = flag('--at')?.split(',').map(Number)

/* the default cue layout: lead 0.9, 4 s a line, 0.45 s between */
const cues = (ids, lead = 0.9, per = 4, gap = 0.45) => {
  const out = {}
  let at = lead
  for (const id of ids) {
    out[id] = { at, dur: per }
    at += per + gap
  }
  return out
}
const WB = cues(['wb.1', 'wb.2', 'wb.3', 'wb.4', 'wb.5', 'wb.6'])
const wbDur = WB['wb.6'].at + 4 + 0.5
const wbTimes = Object.values(WB).flatMap((c) => [c.at + c.dur / 2, c.at + c.dur])

const SCENES = {
  hook: { dur: 6.5, times: [0.3, 1.0, 1.9, 2.5, 3.1, 4.2, 5.2, 6.2], params: {} },
  whiteboard: { dur: wbDur, times: wbTimes, params: { cues: WB } },
  banner: { dur: 2.3, times: [0.2, 0.45, 1.2, 2.0], params: { n: '04', title: 'If', kicker: 'Conditions, groups, AND and OR.' }, win: true },
  outro: { dur: 7.5, times: [1.0, 2.5, 5.0], params: { cues: { 'out.1': { at: 1.4, dur: 3.6 } } } },
}

const server = await serve({
  '/compose': path.join(VIDEO, 'compose'),
  '/app': path.resolve(VIDEO, '..', 'public'),
  '/assets': path.join(VIDEO, 'assets'),
})
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'],
})
const errors = []
let count = 0
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${server.url}/compose/test/slides.html`, { waitUntil: 'load' })
  const fonts = await page.evaluate(async () => {
    const want = ['700 40px "DM Sans"', '400 40px "Kalam"', '700 40px "Kalam"', '600 40px "JetBrains Mono"']
    for (const f of want) {
      try {
        await document.fonts.load(f)
      } catch {}
    }
    await document.fonts.ready
    return want.map((f) => `${f.split('"')[1]}${f.startsWith('700') ? ' 700' : ''}: ${document.fonts.check(f) ? 'ok' : 'MISSING'}`)
  })
  console.log(fonts.join(' · '))
  // the wordmark: a still taken before the image arrives would show a hole
  await page.evaluate(
    () =>
      new Promise((res) => {
        const img = new Image()
        img.onload = img.onerror = res
        img.src = '/app/xecurify-logo.png'
      }),
  )

  const themes = onlyTheme ? [onlyTheme] : ['light', 'dark']
  const report = {}
  for (const theme of themes) {
    await mkdir(path.join(OUT, theme), { recursive: true })
    for (const [slide, sc] of Object.entries(SCENES)) {
      if (onlySlides && !onlySlides.includes(slide)) continue
      const times = extraT ?? sc.times
      for (const t of times) {
        const info = await page.evaluate((s) => window.TEST.render(s), { theme, slide, t, dur: sc.dur, params: sc.params, ghost, win: !!sc.win })
        const file = path.join(OUT, theme, `${slide}-${t.toFixed(2)}.png`)
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1920, height: 1080 } })
        report[`${theme}/${slide}`] = info.keys
        count++
      }
    }
  }
  await writeFile(path.join(OUT, 'mascot-keys.json'), JSON.stringify(report, null, 2))

  // determinism: a still rendered again, after everything else, must match byte for byte
  const { readFile } = await import('node:fs/promises')
  for (const [slide, t] of [['hook', 3.1], ['whiteboard', 18.25], ['banner', 1.2], ['outro', 5.0]]) {
    if (onlySlides && !onlySlides.includes(slide)) continue
    const theme = themes[0]
    const sc = SCENES[slide]
    if (extraT && !extraT.includes(t)) continue
    await page.evaluate((s) => window.TEST.render(s), { theme, slide, t, dur: sc.dur, params: sc.params, ghost, win: !!sc.win })
    const again = await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1080 } })
    const first = await readFile(path.join(OUT, theme, `${slide}-${t.toFixed(2)}.png`))
    const same = Buffer.compare(again, first) === 0
    console.log(`${same ? 'ok  ' : 'FAIL'} deterministic: ${theme}/${slide} @ ${t}`)
    if (!same) errors.push(`${slide} @ ${t} rendered differently the second time`)
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(`${count} stills → ${OUT}`)
if (errors.length) {
  console.error('page errors:\n  ' + errors.join('\n  '))
  process.exit(1)
}
