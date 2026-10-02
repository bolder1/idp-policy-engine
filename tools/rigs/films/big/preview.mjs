/* -----------------------------------------------------------------------------
   Stills of the six drawn scenes, at real pace, no recording.

   A fast run of the film cannot show what a scene looks like — every step of
   a shot lands in the same tenth of a second. This walks the same steps with
   real holds and photographs each one into frames-preview/.
     node rec/big/preview.mjs [intro|zone|device|outcome|order|close]
   -------------------------------------------------------------------------- */
import fs from 'node:fs'
import path from 'node:path'
import { open } from './rig.mjs'

const HERE = import.meta.dirname
const OUT = path.join(HERE, 'frames-preview')
const only = process.argv.slice(2)
const want = (k) => !only.length || only.includes(k)
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const { browser, ctx, page, rig } = await open({ out: path.join(HERE, 'take-preview'), appUrl: 'http://localhost:4173/', vo: {}, subs: {}, fast: false })
const st = (fn, ...a) => rig.st(fn, ...a)
const hold = (ms) => page.waitForTimeout(ms)
let n = 0
const shot = async (name, ms = 900) => { await hold(ms); await page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`), scale: 'css' }); console.log(name) }
const step = (s, on) => rig.step(s, on)
const sc = (sel, cls, on) => st('sc', sel, cls, on)
const scss = (sel, p, v) => st('scss', sel, p, v)

if (want('intro')) {
  await rig.scene('intro'); await hold(400)
  await step('rail'); await shot('i-rail', 900)
  await step('p1'); await shot('i-p1', 1100)
  await step('p2'); await hold(900); await step('p3'); await shot('i-p3', 1000)
  await step('burst'); await shot('i-burst', 1400)
  await step('halt'); await shot('i-halt', 900)
  await step('head'); await hold(600); await step('head2'); await shot('i-head', 900)
  await step('turn'); await shot('i-turn', 1000)
  await step('read'); await shot('i-read', 1700)
  await step('day'); await shot('i-day', 1000)
  await step('brand'); await shot('i-brand', 900)
  await rig.scene(null); await hold(500)
}

if (want('zone')) {
  await rig.scene('zone2'); await hold(400)
  await step('map'); await hold(800); await step('fly'); await shot('z-fly', 1400)
  await shot('z-fly2', 900)
  await step('z1'); await shot('z-india', 1400)
  await step('z2'); await hold(500); await step('z3'); await shot('z-ring', 1800)
  await shot('z-km', 900)
  await step('net'); await shot('z-net', 900)
  await sc('.pin.p1', 'on'); await hold(400); await sc('.pin.p2', 'on'); await hold(400); await sc('.pin.p3', 'on'); await shot('z-pins', 1300)
  await step('rain'); await shot('z-rain', 1600)
  await step('tag'); await shot('z-tag', 700)
  await step('rules'); await shot('z-rules', 1300)
  await step('link'); await shot('z-link', 900)
  await step('bloom'); await hold(700); await step('out'); await hold(700)
  await rig.scene(null); await hold(500)
}

if (want('device')) {
  await rig.scene('gate'); await hold(400)
  await step('in'); await shot('d-in', 1400)
  await step('scan'); await shot('d-scan', 700); await shot('d-scan2', 700)
  await step('tags'); await shot('d-tags', 1100)
  await step('floor'); await shot('d-floor', 1300)
  await step('c1'); await hold(800); await step('c2'); await hold(700); await step('c3'); await shot('d-cols', 1000)
  await step('pan'); await hold(300); await step('lap'); await shot('d-pan', 1300)
  await step('sig'); await shot('d-sig', 1300)
  await step('ghost'); await shot('d-ghost', 1000)
  await step('snap'); await shot('d-snap', 900)
  await step('word'); await shot('d-word', 1300)
  await step('match'); await shot('d-match', 1000)
  await step('flip'); await shot('d-flip', 1100)
  await step('flip', false); await step('lift'); await shot('d-unflip', 900)
  await rig.scene(null); await hold(500)
}

if (want('outcome')) {
  await rig.scene('rail'); await hold(400)
  await step('rail'); await shot('o-rail', 900)
  await step('a1'); await shot('o-a1', 900); await shot('o-a1b', 900)
  await step('bloom'); await shot('o-bloom', 700)
  await step('bloom', false); await step('a2'); await shot('o-a2', 800)
  await step('run2'); await shot('o-run2', 1300)
  await step('code'); await shot('o-code', 900)
  await step('open'); await hold(300); await step('go2'); await hold(800); await step('bloom'); await shot('o-bloom2', 600)
  await step('bloom', false); await step('deny'); await shot('o-deny', 700)
  await step('run3'); await hold(1200); await step('hit'); await shot('o-hit', 400)
  await step('msg'); await shot('o-msg', 1800)
  await step('recap'); await shot('o-recap', 1000)
  await rig.scene(null); await hold(500)
}

if (want('order')) {
  await rig.win('on'); await hold(800)
  await rig.win('sunk'); await rig.scene('drop', true); await hold(300)
  await step('set'); await shot('r-set', 1400)
  await step('read'); await shot('r-read', 1100)
  await step('s1'); await sc('.b1', 'on'); await sc('.t1', 'on'); await shot('r-ball', 500)
  await scss('.b1', 'top', '282px'); await hold(350); await sc('.sh1', 'open'); await hold(220); await scss('.b1', 'top', '442px'); await hold(200); await sc('.sh1', 'open', false); await hold(150)
  await sc('.b1', 'land'); await sc('.sh2', 'good'); await sc('.o1', 'on'); await sc('.veil', 'on'); await sc('.dotted', 'on'); await shot('r-hit1', 900)
  await step('h2'); await sc('.b1', 'on', false); await sc('.o1', 'on', false); await sc('.veil', 'on', false); await sc('.dotted', 'on', false); await sc('.sh2', 'good', false); await sc('.b1', 'land', false)
  await hold(300); await step('swap'); await shot('r-swap', 900)
  await scss('.b1', 'top', '112px'); await hold(100); await sc('.b1', 'on'); await hold(400)
  await scss('.b1', 'top', '282px'); await hold(350); await sc('.sh1', 'open'); await hold(220); await scss('.b1', 'top', '442px'); await hold(200); await sc('.sh1', 'open', false); await hold(150)
  await sc('.b1', 'land'); await sc('.sh3', 'warm'); await sc('.o2', 'on'); await sc('.veil', 'on'); await shot('r-hit2', 900)
  await step('h3'); await sc('.b1', 'on', false); await sc('.t1', 'on', false); await sc('.o2', 'on', false); await sc('.veil', 'on', false); await sc('.sh3', 'warm', false)
  await step('x'); await shot('r-x', 700)
  await sc('.sh3', 'gone'); await step('del'); await shot('r-del', 900)
  await sc('.t2', 'on'); await sc('.b2', 'on'); await hold(400)
  await scss('.b2', 'top', '282px'); await hold(350); await sc('.sh1', 'open'); await hold(220); await scss('.b2', 'top', '442px'); await hold(200); await sc('.sh1', 'open', false); await sc('.sh2', 'open'); await hold(220); await scss('.b2', 'top', '764px'); await hold(250); await sc('.sh2', 'open', false)
  await step('thud'); await sc('.b2', 'land'); await sc('.o3', 'on'); await shot('r-thud', 900)
  await rig.scene(null); await rig.win('off'); await hold(600)
}

if (want('close')) {
  await rig.scene('answers'); await hold(400)
  await step('set'); await shot('c-set', 800)
  await step('p1'); await shot('c-p1', 2100)
  await step('p2'); await shot('c-p2', 1400)
  await step('code'); await shot('c-code', 800)
  await step('open'); await hold(300); await step('go2'); await shot('c-go2', 1100)
  await step('p3'); await hold(1400); await step('hit'); await shot('c-hit', 500)
  await step('sweep'); await hold(600); await step('brand'); await shot('c-brand', 900)
  await rig.scene(null)
}

await ctx.close(); await browser.close()
fs.rmSync(path.join(HERE, 'take-preview'), { recursive: true, force: true })
console.log(`${n} stills → ${OUT}`)
