// Walks the Application, Users and Groups pages (10 Oct 2026) at desktop and
// phone width, screenshots each state into out/, counts the sound cues each
// action plays, and lists console errors. Run: node tools/rigs/app-pages/check.cjs
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, 'out') + '/'
fs.mkdirSync(OUT, { recursive: true })

/* Counts oscillator starts, so a cue that plays shows up as a number per
   action without anyone listening. */
function spyAudio() {
  window.__osc = 0
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  const make = AC.prototype.createOscillator
  AC.prototype.createOscillator = function (...a) {
    const o = make.apply(this, a)
    const start = o.start.bind(o)
    o.start = (...s) => { window.__osc++; return start(...s) }
    return o
  }
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(() => { try { localStorage.setItem('idp.board-tour.seen', '1'); localStorage.setItem('idp.tour.seen', '1') } catch {} })
  await ctx.addInitScript(spyAudio)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
  const log = []
  const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: OUT + name + '.png' }) }
  const osc = () => page.evaluate(() => window.__osc)
  const step = async (label, fn) => {
    const a = await osc()
    await fn()
    await page.waitForTimeout(700)
    log.push(`${label}: ${(await osc()) - a} tones`)
  }

  await page.goto(process.env.BASE || 'http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.locator('[data-rail-item="Apps"]').click()
  await shot('01-apps')

  await page.getByRole('button', { name: 'AWS Console', exact: true }).click()
  await shot('02-app-policies')

  await page.getByRole('button', { name: 'Add existing policy' }).click()
  await page.locator('[role=dialog]').getByText('Choose a policy', { exact: true }).click()
  await shot('03-add-existing-open')
  await page.getByRole('option', { name: /^Slack for everyone/ }).click()
  await shot('04-add-existing-preview')
  await step('attach (Add to AWS Console)', () => page.getByRole('button', { name: 'Add to AWS Console' }).click())
  await shot('05-after-attach-toast')
  await step('undo', () => page.locator('.bshell__toastact').click())

  await page.getByRole('button', { name: 'All applications' }).click()
  await page.getByRole('button', { name: 'Box', exact: true }).click()
  await page.locator('.bapr__stack > li').filter({ hasText: 'Box for engineering' }).getByRole('button', { name: /Actions for/ }).click()
  await page.getByRole('menuitem', { name: /Remove from Box/ }).click()
  await shot('06-remove-dialog')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('tab', { name: 'Users' }).click()
  await shot('07-app-users')
  await page.getByRole('tab', { name: 'Groups' }).click()
  await shot('08-app-groups')
  await page.getByRole('tab', { name: 'Basic' }).click()
  await shot('09-app-basic')

  await page.locator('[data-rail-item="Apps"]').click()
  await page.getByRole('button', { name: 'GitHub Enterprise', exact: true }).click()
  await page.getByRole('tab', { name: 'Basic' }).click()
  await shot('10-app-basic-oidc')

  await page.locator('[data-rail-item="Users"]').click()
  await page.getByRole('button', { name: 'User List', exact: true }).click()
  await shot('11-user-list')
  await page.locator('tbody tr').first().locator('button.btable__link').first().click()
  await shot('12-user-drawer')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'User Roles', exact: true }).click()
  await shot('13-user-roles')

  await page.locator('[data-rail-item="Groups"]').click()
  await page.getByRole('button', { name: 'Manage Groups', exact: true }).click()
  await shot('14-groups')
  await page.getByRole('button', { name: 'Design', exact: true }).click()
  await shot('15-group-assignment')
  await page.locator('tbody button[aria-label^="Select "]').first().click()
  await shot('16-group-selected')
  await page.getByRole('button', { name: 'Assign users' }).first().click()
  await page.waitForTimeout(400)
  await shot('17-assign-drawer')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Applications' }).click()
  await shot('18-group-applications')

  // Mute, act, unmute: nothing should sound while muted.
  await step('toggle sound off', () => page.getByRole('button', { name: 'Turn sound off' }).click())
  await step('muted toast (rename none, open drawer)', () => page.getByRole('tab', { name: 'Assignment' }).click())
  await step('toggle sound on', () => page.getByRole('button', { name: 'Turn sound on' }).click())

  // Phone width.
  await page.setViewportSize({ width: 375, height: 812 })
  await page.locator('.bshell__menu, [aria-label="Open navigation"], [aria-label*="menu" i]').first().isVisible().catch(() => false)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot('19-phone-group')
  await page.goto(process.env.BASE || 'http://localhost:5173/', { waitUntil: 'networkidle' })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  log.push('phone policies page horizontal overflow px: ' + overflow)

  fs.writeFileSync(OUT + 'log.txt', log.join('\n') + '\n\nERRORS:\n' + errors.join('\n'))
  console.log(log.join('\n'))
  console.log('errors:', errors.length ? errors.join('\n') : 'none')
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
