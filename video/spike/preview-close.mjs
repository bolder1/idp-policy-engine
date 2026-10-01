import { openRecorder } from '../lib/recorder.mjs'
const rec = await openRecorder({ appUrl: 'http://localhost:5173', outDir: '.work/spike-pc', storage: { 'idp.tour.seen': '1' } })
const p = rec.page
const state = (tag) => p.evaluate((tag) => ({
  tag,
  scrims: document.querySelectorAll('.bx-scrim').length,
  previewDialogs: [...document.querySelectorAll('[role=dialog]')].map((d) => d.getAttribute('aria-label')),
  anims: document.getAnimations().map((a) => ({ n: a.animationName || a.transitionProperty || a.id || a.constructor.name, s: a.playState, ct: a.currentTime && Math.round(a.currentTime), tgt: String(a.effect?.target?.className || a.effect?.target?.tagName || '').slice(0, 40) })).slice(0, 8),
  vt: window.__vt.stats(),
}), tag)
try {
  await rec.boot((pp) => pp.getByRole('heading', { level: 1, name: 'Policies' }), { settle: 3000 })
  await rec.callStore('setEdition', 'full')
  rec.dry = true
  rec.beginTake('x')
  await rec.click(p.getByRole('button', { name: 'New policy', exact: true }))
  await rec.visible(p.getByRole('dialog', { name: 'Name your policy' }))
  await rec.step(12)
  await p.locator('#np-name').fill('Probe')
  await rec.step(3)
  await rec.click(p.getByRole('dialog', { name: 'Name your policy' }).getByRole('button', { name: 'Create policy' }))
  await rec.visible(p.getByRole('heading', { name: 'How would you like to start?' }), { seconds: 8 })
  await rec.click(p.getByRole('button', { name: /Use a template/ }))
  const sheet = p.getByRole('dialog', { name: 'Start from a template' })
  await rec.visible(sheet)
  await rec.step(20)
  await rec.click(sheet.getByRole('button', { name: 'Preview the rules in Require MFA for all users' }))
  const prev = p.getByRole('dialog', { name: 'Require MFA for all users' })
  await rec.visible(prev)
  await rec.step(20)
  console.log(JSON.stringify(await state('open')))
  const close = prev.locator('.bx-modal__foot').getByRole('button', { name: 'Close' })
  console.log('footer close count', await close.count())
  await rec.click(close)
  for (let i = 0; i < 6; i++) {
    console.log(JSON.stringify(await state('after-close+' + (i * 5 + 3))))
    await rec.step(5)
  }
  console.log('--- try Escape')
  await p.keyboard.press('Escape')
  for (let i = 0; i < 4; i++) {
    await rec.step(6)
    console.log(JSON.stringify(await state('after-esc+' + (i * 6 + 6))))
  }
} catch (e) { console.log('ERR', String(e).slice(0, 300)) }
await rec.close()
