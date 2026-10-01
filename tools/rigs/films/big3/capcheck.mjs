import path from 'node:path'
import { open } from './rig3.mjs'
import { SUBS } from './script.mjs'
const { browser, page, rig } = await open({ out: path.join(import.meta.dirname, 'take-probe'), appUrl: null, vo: {}, subs: {}, record: false })
let worst = []
for (const [id, t] of Object.entries(SUBS)) {
  await rig.st('cap', t); await page.waitForTimeout(40)
  const b = await page.evaluate(() => { const r = document.getElementById('cap').getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height, sw: document.getElementById('cap').scrollWidth, cw: document.getElementById('cap').clientWidth } })
  if (b.l < 40 || b.r > 1880 || b.sw > b.cw + 1 || b.h > 60) worst.push(id + ' ' + JSON.stringify(b))
}
await rig.st('cap', SUBS.dc3); await page.waitForTimeout(300)
await page.screenshot({ path: path.join(import.meta.dirname, 'capcheck.png'), clip: { x: 0, y: 900, width: 1920, height: 180 } })
console.log(worst.join('\n') || 'all single line, inside the frame')
await browser.close()
