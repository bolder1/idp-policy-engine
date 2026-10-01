/* Spike: switch the store to the Full edition from outside, create a policy,
   start from scratch, and confirm the Full-only pips render on the board. */
import { openRecorder } from '../lib/recorder.mjs'

const out = process.argv[2]
const rec = await openRecorder({ appUrl: process.env.APP_URL, outDir: out, storage: { 'idp.tour.seen': '1' } })
const { page } = rec
await rec.boot((p) => p.getByRole('button', { name: 'New policy', exact: true }))
console.log('setEdition', await rec.callStore('setEdition', 'full'))
rec.dry = true
rec.beginTake('edition')
await rec.step(10)
await rec.click(page.getByRole('button', { name: 'New policy', exact: true }))
await rec.visible(page.getByRole('dialog', { name: 'Name your policy' }))
await rec.step(12)
await page.locator('#np-name').fill('Finance apps — sign-in policy')
await rec.step(4)
await rec.click(page.getByRole('button', { name: 'Create policy' }))
await rec.visible(page.getByRole('heading', { name: 'How would you like to start?' }), { seconds: 8 })
await rec.step(20)
await rec.click(page.getByRole('button', { name: /Start from scratch/ }))
await rec.visible(page.getByRole('complementary', { name: 'Inspector' }), { seconds: 4 })
await rec.step(20)
const facts = await page.evaluate(() => ({
  acts: document.querySelector('.bbtop__acts')?.innerText.replace(/\s+/g, ' '),
  pips: [...document.querySelectorAll('.bbtop .bb__pip')].map((p) => p.innerText.replace(/\s+/g, ' ')),
  cards: [...document.querySelectorAll('.bb__card')].map((c) => c.getAttribute('aria-label') || c.innerText.slice(0, 40)),
  dock: document.querySelector('[role=toolbar][aria-label="View"]')?.innerText,
}))
console.log(facts)
rec.dry = false
rec.beginTake('edition-still')
await rec.step(2)
await rec.endTake()
console.log(rec.pageErrors.slice(0, 5))
await rec.close()
