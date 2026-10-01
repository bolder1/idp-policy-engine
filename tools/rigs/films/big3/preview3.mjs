/* Stills of every drawn beat at real pace, no recording, no console.
     node preview3.mjs [intro zone device outcome order close] */
import fs from 'node:fs'
import path from 'node:path'
import { open } from './rig3.mjs'

const HERE = import.meta.dirname
const OUT = path.join(HERE, 'frames-preview')
const only = process.argv.slice(2)
const want = (k) => !only.length || only.includes(k)
if (!only.length) fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const { browser, page, rig } = await open({ out: path.join(HERE, 'take-preview'), appUrl: null, vo: {}, subs: {}, record: false })
const hold = (ms) => page.waitForTimeout(ms)
let n = 0
const shot = async (name, ms = 900) => { await hold(ms); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); n++; console.log(name) }
const st = (...a) => rig.st(...a)

if (want('intro')) {
  await rig.scene('intro'); await rig.shot('a'); await hold(100); await rig.sc('.ka', 'on'); await shot('i1-a', 1400)
  await rig.shot('b'); await rig.step('card'); await shot('i1-b', 1300)
  await rig.step('type'); await hold(900); await rig.step('ok'); await shot('i2', 700)
  await rig.shot('c'); await rig.step('log'); await shot('i3a', 900); await shot('i3b', 1800)
  await rig.shot('d'); await rig.sc('.kd1', 'on'); await hold(1500); await rig.sc('.kd2', 'on'); await shot('i4', 1400)
  await rig.shot('e'); await rig.step('three'); await shot('i5', 1600)
  await rig.shot('f'); await rig.step('flute'); await rig.step('brand'); await shot('i6', 1800)
}
if (want('zone')) {
  await rig.scene('zone'); await rig.shot('a'); await rig.step('hero'); await hold(500)
  for (const p of ['a1', 'a2', 'a3']) { await rig.sc('.ping.' + p, 'on'); await hold(300) }
  await shot('z1', 900)
  await rig.sc('.ping.a1,.ping.a2,.ping.a3', 'on', false); await rig.step('card'); await hold(500)
  await rig.sc('.ur.r1', 'on'); await hold(700); await rig.sc('.ur.r2', 'on'); await rig.step('state'); await st('mapcam', 'state'); await shot('z2-state', 2300)
  await rig.sc('.ur.r3', 'on'); await rig.step('city'); await st('mapcam', 'city'); await hold(2300); await rig.step('ring'); await rig.step('fine'); await shot('z2-city', 1600)
  await rig.sc('.office', 'on'); await rig.sc('.ur.r4', 'on'); await hold(900); await rig.step('both'); await rig.sc('.ur.r3,.ur.r4', 'hl'); await shot('z3', 900)
  for (const p of ['c1', 'c2', 'c3']) { await rig.sc('.ping.' + p, 'on'); await hold(350) }
  await rig.sc('.ping.c1,.ping.c2', 'in'); await rig.sc('.ping.c3', 'out'); await shot('z4', 900)
  await rig.shot('b'); await hold(200); await rig.sc('.named', 'on'); await hold(700); await st('wireflow'); await shot('z5', 2000)
}
if (want('device')) {
  await rig.scene('device'); await rig.shot('a'); await rig.step('kinds'); await shot('d1', 1600)
  await rig.shot('b'); await rig.step('health'); await hold(900)
  for (const c of ['c1', 'c2', 'c3']) { await rig.sc('.chk.' + c, 'on'); await hold(500) }
  await shot('d2', 400)
  await rig.sc('.chk.c1', 'floor'); await hold(800); await rig.sc('.dev.v1', 'on'); await hold(500); await rig.sc('.dev.v2', 'on'); await hold(900); await rig.sc('.dev.v3', 'on'); await rig.sc('.dev.v3', 'stop'); await shot('d3', 1400)
  await rig.shot('c'); await rig.step('trust'); await shot('d4', 1500)
  await rig.step('same'); await hold(700); await rig.sc('.rr.r1', 'hit'); await rig.sc('.same', 'on'); await shot('d5', 1000)
  await rig.shot('d'); await rig.sc('.k1', 'on'); await hold(1200); await rig.sc('.k2', 'on'); await hold(1100); await rig.sc('.k3', 'on'); await shot('d6', 1300)
}
if (want('outcome')) {
  await rig.scene('outcome'); await rig.shot('a'); await rig.step('outs'); await hold(200); await rig.sc('.oc.c1', 'on'); await shot('o1', 1500)
  await rig.sc('.oc.c1', 'on', false); await rig.sc('.oc.c2', 'on'); await shot('o2', 1300)
  await rig.sc('.oc.c2', 'on', false); await rig.sc('.oc.c3', 'on'); await st('typeInto', '.typed', 'Use a company device to sign in.'); await shot('o3', 2200)
  await rig.sc('.oc', 'on'); await shot('o-all', 1000)
}
if (want('order')) {
  await rig.scene('order'); await rig.shot('a'); await rig.step('set'); await hold(300); await rig.step('read'); await shot('r1', 1500)
  await st('run', 't1', [{ id: 'r1' }, { id: 'r2', hit: true }], 'Allow', '#4ade80'); await shot('r2', 2600)
  await st('clearRun'); await hold(300); await st('swap', 'r2', 'r3'); await shot('r3', 1200)
  await st('run', 't1', [{ id: 'r1' }, { id: 'r3', hit: true }], 'Second factor', '#fbbf24'); await shot('r4', 2600)
  await st('clearRun'); await hold(200); await st('del', 'r3'); await hold(900); await rig.step('lock'); await shot('r5', 900)
  await st('run', 't2', [{ id: 'r1' }, { id: 'r2' }, { id: 'rd', hit: true }], 'Deny', '#f87171'); await shot('r6', 3200)
}
if (want('close')) {
  await rig.scene('close'); await rig.shot('a'); await rig.step('log'); await shot('e1', 1400)
  for (const a of ['a1', 'a2', 'a3']) { await rig.sc('.' + a, 'on'); await hold(600) }
  await shot('e4', 500)
  await rig.shot('b'); await rig.step('flute'); await rig.step('brand'); await hold(600); await rig.step('sub'); await shot('e5', 1800)
}
await browser.close()
console.log(`${n} stills → ${OUT}`)
