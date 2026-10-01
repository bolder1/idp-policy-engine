/* Smoke test for the recorder: one short take against the running dev server. */
import { openRecorder } from '../lib/recorder.mjs'

const out = process.argv[2]
const rec = await openRecorder({
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  outDir: out,
  fps: 30,
  dsf: 2,
  storage: { 'idp.tour.seen': '1' },
})
const t0 = Date.now()
await rec.boot((p) => p.getByRole('button', { name: 'New policy', exact: true }))
const { page } = rec

rec.beginTake('smoke')
rec.say('Every sign-in is checked against a policy.')
await rec.hold(0.6)
await rec.click(page.getByRole('button', { name: 'New policy', exact: true }), { label: 'New policy' })
await rec.visible(page.getByRole('dialog', { name: 'Name your policy' }))
await rec.hold(0.4)
await rec.click(page.locator('#np-name'))
await rec.type('Finance — high-risk sign-ins')
await rec.hold(0.4)
await rec.focus(page.getByRole('dialog', { name: 'Name your policy' }), { zoom: 1.4 })
await rec.click(page.getByRole('combobox', { name: 'Applications this policy protects' }))
await rec.hold(1.0)
await rec.endTake()
console.log(rec.stats, `total ${((Date.now() - t0) / 1000).toFixed(1)}s`, rec.pageErrors.slice(0, 5))
await rec.close()
