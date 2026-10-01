/* Renders the rig in a set of poses to .work/test/mascot/*.png, on both grounds.
   node compose/test/render-mascot.mjs */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '../../lib/server.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIDEO = path.resolve(HERE, '..', '..')
const OUT = path.join(VIDEO, '.work', 'test', 'mascot')
await mkdir(OUT, { recursive: true })

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,700&display=block" rel="stylesheet">
<link rel="stylesheet" href="/compose/compose.css"><link rel="stylesheet" href="/compose/mascot.css">
<style>html,body{width:1920px;height:1080px;margin:0;overflow:hidden} #ground{position:absolute;inset:0;background:var(--ground)}
#mascot{position:absolute;inset:0} .bar{position:absolute;left:600px;top:700px;width:400px;height:34px;border-radius:17px;background:#c9d1d9}
.dot{position:absolute;width:14px;height:14px;border-radius:50%;background:#d01243;margin:-7px 0 0 -7px} .x{position:absolute;width:2px;height:40px;background:#0d6efd;margin:-20px 0 0 -1px}
.x::after{content:'';position:absolute;left:-19px;top:19px;width:40px;height:2px;background:#0d6efd}</style></head>
<body><div id="ground"></div><div id="marks"></div><div id="mascot"></div>
<script src="/compose/engine.js"></script><script src="/compose/mascot.js"></script></body></html>`

const server = await serve({ '/compose': path.join(VIDEO, 'compose'), '/assets': path.join(VIDEO, 'assets'), '/app': path.resolve(VIDEO, '..', 'public') }, { '/test.html': PAGE })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(`${server.url}/test.html`, { waitUntil: 'load' })
await page.evaluate(async () => {
  const rig = await (await fetch('/assets/mascot/rig.json')).json()
  window.MASCOT.init(document.getElementById('mascot'), rig, { assetBase: '/assets/mascot/' })
  await document.fonts.ready
  await new Promise((r) => (document.querySelector('.m-img').complete ? r() : document.querySelector('.m-img').addEventListener('load', r)))
})

const stand = (x, y, size, face = 'right', extra = {}) => [{ t: 0, pose: 'stand', x, y, size, face, seconds: 0.01, ...extra }]
const SCENES = [
  ['stand-idle-a', stand(960, 900, 420), 3.2, {}],
  ['stand-idle-b', stand(960, 900, 420), 3.9, {}],
  ['talk-035', stand(960, 900, 420), 3.0, { talkOpen: 0.35 }],
  ['talk-090', stand(960, 900, 420), 3.0, { talkOpen: 0.9 }],
  ['blink-mid', stand(960, 900, 420), 'blink', {}],
  ['point-left', [{ t: 0, pose: 'point', x: 1200, y: 900, size: 420, face: 'left', seconds: 0.01, toward: { x: 300, y: 500 } }], 3.0, {}],
  ['think', [{ t: 0, pose: 'think', x: 960, y: 900, size: 420, face: 'right', seconds: 0.01 }], 3.0, {}],
  ['lie-on-bar', [{ t: 0, pose: 'lie', x: 800, y: 700, size: 260, face: 'left', seconds: 0.01 }], 3.0, { bar: true }],
  ['jump-flight', [{ t: 0, pose: 'stand', x: 400, y: 900, size: 320, face: 'right', seconds: 0.01 }, { t: 1, pose: 'jump', x: 1300, y: 420, size: 320, face: 'right', seconds: 0.6 }], 1.3, { dot: [1300, 420] }],
  ['jump-landing', [{ t: 0, pose: 'stand', x: 400, y: 900, size: 320, face: 'right', seconds: 0.01 }, { t: 1, pose: 'jump', x: 1300, y: 420, size: 320, face: 'right', seconds: 0.6 }], 1.63, { dot: [1300, 420] }],
  ['jump-landed', [{ t: 0, pose: 'stand', x: 400, y: 900, size: 320, face: 'right', seconds: 0.01 }, { t: 1, pose: 'jump', x: 1300, y: 420, size: 320, face: 'right', seconds: 0.6 }], 2.4, { dot: [1300, 420] }],
  ['cheer', [{ t: 0, pose: 'cheer', x: 960, y: 900, size: 420, face: 'right', seconds: 0.01 }], 0.3, {}],
  ['screen-allow', stand(960, 960, 520), 3.0, { screen: 'allow' }],
  ['screen-mfa', stand(960, 960, 520), 3.0, { screen: 'mfa' }],
  ['screen-deny', stand(960, 960, 520), 3.0, { screen: 'deny' }],
  ['emote-bang', stand(960, 900, 420), 3.0, { emote: { glyph: '!', k: 0.3 } }],
  ['emote-check', stand(960, 900, 420, 'left'), 3.0, { emote: { glyph: '✓', k: 0.3 } }],
  ['emote-sparkle', stand(960, 900, 420), 3.0, { emote: { glyph: 'sparkle', k: 0.3 } }],
  ['peek-mid', [{ t: 0, pose: 'peek', x: 960, y: 1060, size: 320, face: 'left', seconds: 0.7 }], 0.35, {}],
]

for (const theme of ['light', 'dark']) {
  await page.evaluate((th) => (document.documentElement.dataset.theme = th), theme)
  for (const [name, keys, t, opts] of SCENES) {
    const info = await page.evaluate(
      ([keys, t, opts]) => {
        const M = window.MASCOT
        let tt = t
        if (t === 'blink') {
          // find a moment mid-blink
          for (let x = 0; x < 30; x += 0.01) {
            const s = M.stateAt(x, keys, { seed: 7 })
            if (s.blink > 0.8) {
              tt = x
              break
            }
          }
        }
        if (opts.toward) keys[0].toward = opts.toward
        const st = M.stateAt(tt, keys, { seed: 7, talkOpen: opts.talkOpen ?? 0, screen: opts.screen ?? null, emote: opts.emote ?? null })
        M.render(st)
        const marks = document.getElementById('marks')
        marks.innerHTML = ''
        if (opts.bar) marks.innerHTML += `<div class="bar" style="left:600px;top:700px"></div>`
        if (opts.dot) marks.innerHTML += `<div class="dot" style="left:${opts.dot[0]}px;top:${opts.dot[1]}px"></div>`
        const hp = M.headPoint(st)
        const fp = M.fingertip(st)
        marks.innerHTML += `<div class="x" style="left:${hp.x}px;top:${hp.y}px"></div><div class="x" style="left:${fp.x}px;top:${fp.y}px;background:#128f43"></div>`
        return { t: tt, x: st.x, y: st.y, rot: st.rot, blink: st.blink, head: hp, finger: fp }
      },
      [keys, t, opts],
    )
    const file = path.join(OUT, `${theme}-${name}.png`)
    await page.screenshot({ path: file })
    console.log(theme, name, JSON.stringify(info))
  }
}
if (errors.length) console.log('page errors:', errors)
await browser.close()
await server.close()
