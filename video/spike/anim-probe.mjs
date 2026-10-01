import { openRecorder } from '../lib/recorder.mjs'
import { chromium } from 'playwright'
const rec = await openRecorder({ appUrl: 'http://localhost:5173', outDir: '.work/spike-ap', storage: { 'idp.tour.seen': '1' } })
const p = rec.page
// instrument Web Animations before the app runs (added after the shim, so it wraps the same prototypes)
await p.context().addInitScript(() => {
  const log = (window.__alog = [])
  let seq = 0
  const tag = (a) => (a.__id ??= ++seq)
  const who = (a) => String(a.effect?.target?.className || '').slice(0, 24)
  const origAnimate = Element.prototype.animate
  Element.prototype.animate = function (kf, opts) {
    const a = origAnimate.call(this, kf, opts)
    log.push(['animate', tag(a), who(a), JSON.stringify(opts).slice(0, 90), JSON.stringify(kf).slice(0, 90)])
    return a
  }
  for (const m of ['pause', 'play', 'cancel', 'finish', 'commitStyles']) {
    const o = Animation.prototype[m]
    Animation.prototype[m] = function (...args) {
      log.push([m, tag(this), who(this), (new Error().stack.split('\n')[2] || '').trim().slice(0, 80)])
      return o.apply(this, args)
    }
  }
  for (const prop of ['currentTime', 'startTime']) {
    const d = Object.getOwnPropertyDescriptor(Animation.prototype, prop)
    Object.defineProperty(Animation.prototype, prop, {
      get() { return d.get.call(this) },
      set(v) {
        const from = (new Error().stack.split('\n')[2] || '').trim().slice(0, 80)
        if (!from.includes('virtual-time') && !from.includes('syncAnimations')) log.push(['set ' + prop, tag(this), who(this), v, from])
        d.set.call(this, v)
      },
    })
  }
})
try {
  await rec.boot((pp) => pp.getByRole('heading', { level: 1, name: 'Policies' }), { settle: 3000 })
  rec.dry = true
  rec.beginTake('x')
  await p.evaluate(() => (window.__alog.length = 0))
  await rec.click(p.getByRole('button', { name: 'New policy', exact: true }))
  await rec.step(20)
  console.log('--- OPEN name dialog: log')
  console.log((await p.evaluate(() => window.__alog.slice(0, 40))).map((r) => r.join(' | ')).join('\n'))
  await p.evaluate(() => (window.__alog.length = 0))
  await rec.click(p.getByRole('dialog', { name: 'Name your policy' }).getByRole('button', { name: 'Cancel' }))
  for (let i = 0; i < 4; i++) await rec.step(8)
  console.log('--- CANCEL: log')
  console.log((await p.evaluate(() => window.__alog.slice(0, 60))).map((r) => r.join(' | ')).join('\n'))
  console.log('dialogs left:', await p.getByRole('dialog').count(), 'scrims:', await p.locator('.bx-scrim').count())
  console.log('anims:', JSON.stringify(await p.evaluate(() => document.getAnimations().map((a) => [a.__id, a.playState, a.currentTime, a.startTime, String(a.effect?.target?.className).slice(0, 20), JSON.stringify(a.effect.getTiming()).slice(0, 80)]))))
} catch (e) { console.log('ERR', String(e).slice(0, 300)) }
await rec.close()
