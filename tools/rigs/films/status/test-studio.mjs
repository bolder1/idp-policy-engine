import { capture, compose } from './studio.mjs'
const out = process.argv[2]
const UCS = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, short: ['OS version: allow, deny, warn','Block rooted / jailbroken','Mobile screen lock','Minimum app / agent version','Device health feeds risk','Monitor / report-only','Risk-based step-up','Agents: Windows, Linux, macOS','Outdated browsers','Step-up for admin dashboard','Templates and copy','Setup: policies, zones, profiles','UEM posture','Registration quarantine','UEM providers','AI / plain-language setup'][i] }))
const { webm, events, problems } = await capture({ out, storage: { 'idp.board-tour.seen': '1' }, run: async (rec, page) => {
  await page.goto('http://localhost:5173', { waitUntil: 'load' }); await page.waitForSelector('main')
  await rec.card('<div class="kick">Chapter 1</div><h1>Device health</h1><p>OS versions, integrity, screen lock, app and browser versions.</p><div class="ids"><span>#1</span><span>#2</span><span>#3</span></div>', 2200)
  rec.focus({ ids: [2], title: '#2 Block rooted / jailbroken', covered: ['Device integrity check with three levels', 'Rule: Device profile does not match → Deny'], missing: ['Nothing checks the device in a test', 'The "Block compromised devices" template skips integrity'] })
  await rec.cap('A first-time admin opens <b>Device profiles</b>')
  await rec.click(page.getByRole('button', { name: 'Device profiles', exact: true }))
  await rec.hold(1500)
  await rec.cap('…and starts a new one with <b>Create new profile</b>')
  await rec.hover(page.getByRole('button', { name: /Create new profile/ }))
  await rec.hold(1500)
}})
console.log('problems', problems)
const r = await compose({ out, webm, events, ucs: UCS, statusOf: (id) => 'partial',
  intro: [{ secs: 2.5, html: '<div class="kick">Policy Engine · 22 Sep 2026</div><h1>Where we stand against the brief</h1><p class="lead">Sixteen use cases, walked through by a first-time admin.</p>' }],
  outro: [{ secs: 2.5, html: '<div class="kick">What is missing</div><h2>Test outro</h2>' }], file: 'test.mp4' })
console.log(JSON.stringify(r))
