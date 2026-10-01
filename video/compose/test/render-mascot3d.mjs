/* Renders the 3D rig in a set of poses to .work/test/mascot3d/*.png on both grounds.
   node compose/test/render-mascot3d.mjs */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '../../lib/server.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIDEO = path.resolve(HERE, '..', '..')
const OUT = path.join(VIDEO, '.work', 'test', 'mascot3d')
await mkdir(OUT, { recursive: true })

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,700&display=block" rel="stylesheet">
<link rel="stylesheet" href="/compose/compose.css"><link rel="stylesheet" href="/compose/mascot.css">
<style>html,body{width:1920px;height:1080px;margin:0;overflow:hidden} #ground{position:absolute;inset:0;background:var(--ground)}
#mascot{position:absolute;inset:0} .bar{position:absolute;left:600px;top:700px;width:400px;height:34px;border-radius:17px;background:#c9d1d9}
.dot{position:absolute;width:14px;height:14px;border-radius:50%;background:#d01243;margin:-7px 0 0 -7px}
.x{position:absolute;width:2px;height:40px;background:#0d6efd;margin:-20px 0 0 -1px} .x::after{content:'';position:absolute;left:-19px;top:19px;width:40px;height:2px;background:#0d6efd}</style></head>
<body><div id="ground"></div><div id="marks"></div><div id="mascot"></div>
<script src="/compose/engine.js"></script><script type="module" src="/compose/mascot3d.js"></script></body></html>`

const server = await serve(
  { '/compose': path.join(VIDEO, 'compose'), '/assets': path.join(VIDEO, 'assets'), '/vendor/three': path.join(VIDEO, 'node_modules', 'three'), '/app': path.resolve(VIDEO, '..', 'public') },
  { '/test.html': PAGE },
)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(`${server.url}/test.html`, { waitUntil: 'load' })
const glInfo = await page.evaluate(async () => {
  if (!window.MASCOT3D) await new Promise((r) => window.addEventListener('mascot3d-ready', r, { once: true }))
  const c = window.MASCOT3D.init(document.getElementById('mascot'), null, { seed: 7 })
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  await document.fonts.ready
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'no debug info'
})
console.log('gl:', glInfo)

const stand = (x, y, size, face = 'right', extra = {}) => [{ t: 0, pose: 'stand', x, y, size, face, seconds: 0.01, ...extra }]
const SCENES = [
  ['stand-a', stand(960, 940, 520), 3.2, {}],
  ['stand-left', stand(960, 940, 520, 'left'), 3.9, {}],
  ['talk-035', stand(960, 940, 520), 3.0, { talkOpen: 0.35 }],
  ['talk-090', stand(960, 940, 520), 3.0, { talkOpen: 0.9 }],
  ['blink-mid', stand(960, 940, 520), 'blink', {}],
  ['point-left', [{ t: 0, pose: 'point', x: 1200, y: 940, size: 520, face: 'left', seconds: 0.01, toward: { x: 300, y: 500 } }], 3.0, {}],
  ['point-right', [{ t: 0, pose: 'point', x: 700, y: 940, size: 520, face: 'right', seconds: 0.01, toward: { x: 1600, y: 400 } }], 3.0, {}],
  ['think', [{ t: 0, pose: 'think', x: 960, y: 940, size: 520, face: 'right', seconds: 0.01 }], 3.0, {}],
  ['cheer', [{ t: 0, pose: 'cheer', x: 960, y: 940, size: 520, face: 'right', seconds: 0.01 }], 0.3, { screen: 'allow' }],
  ['lie-on-bar', [{ t: 0, pose: 'lie', x: 800, y: 700, size: 260, face: 'left', seconds: 0.01 }], 3.0, { bar: true }],
  ['jump-flight', [{ t: 0, pose: 'stand', x: 400, y: 900, size: 320, face: 'right', seconds: 0.01 }, { t: 1, pose: 'jump', x: 1300, y: 420, size: 320, face: 'right', seconds: 0.6 }], 1.3, { dot: [1300, 420] }],
  ['jump-landed', [{ t: 0, pose: 'stand', x: 400, y: 900, size: 320, face: 'right', seconds: 0.01 }, { t: 1, pose: 'jump', x: 1300, y: 420, size: 320, face: 'right', seconds: 0.6 }], 2.4, { dot: [1300, 420] }],
  ['screen-mfa', stand(960, 940, 420), 3.0, { screen: 'mfa' }],
  ['emote-bang', stand(960, 940, 420), 3.0, { emote: { glyph: '!', k: 0.3 } }],
  ['small-270', stand(1600, 1000, 270, 'left'), 3.0, {}],
]

for (const theme of ['light', 'dark']) {
  await page.evaluate((th) => (document.documentElement.dataset.theme = th), theme)
  for (const [name, keys, t, opts] of SCENES) {
    const t0 = Date.now()
    const info = await page.evaluate(
      ([keys, t, opts]) => {
        const M = window.MASCOT3D
        let tt = t
        if (t === 'blink') {
          for (let x = 0; x < 30; x += 0.01) {
            const s = M.stateAt(x, keys, { seed: 7 })
            if (s.blink > 0.8) {
              tt = x
              break
            }
          }
        }
        const st = M.stateAt(tt, keys, { seed: 7, talkOpen: opts.talkOpen ?? 0, screen: opts.screen ?? null, emote: opts.emote ?? null })
        M.render(st)
        const marks = document.getElementById('marks')
        marks.innerHTML = ''
        if (opts.bar) marks.innerHTML += `<div class="bar"></div>`
        if (opts.dot) marks.innerHTML += `<div class="dot" style="left:${opts.dot[0]}px;top:${opts.dot[1]}px"></div>`
        const hp = M.headPoint(st)
        const fp = M.fingertip(st)
        marks.innerHTML += `<div class="x" style="left:${hp.x}px;top:${hp.y}px"></div><div class="x" style="left:${fp.x}px;top:${fp.y}px;background:#128f43"></div>`
        return { t: tt, x: Math.round(st.x), y: Math.round(st.y), rot: st.rot, blink: +st.blink.toFixed(2), head: [Math.round(hp.x), Math.round(hp.y)], finger: [Math.round(fp.x), Math.round(fp.y)] }
      },
      [keys, t, opts],
    )
    await page.screenshot({ path: path.join(OUT, `${theme}-${name}.png`) })
    console.log(theme, name, JSON.stringify(info), `${Date.now() - t0}ms`)
  }
}
if (errors.length) console.log('page errors:', errors.slice(0, 5))
await browser.close()
await server.close()
