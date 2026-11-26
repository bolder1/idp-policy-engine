// Dark-mode sweep, past the rail (26 Nov 2026): walks into the builder, the create flow, dialogs, drawers, wizards and
// the other screens a rail click does not reach, audits each stop the way audit.cjs does, and screenshots it.
// BASE=http://localhost:5192/ node tools/rigs/dark-sweep/scenes.cjs [scene name ...]
//
// A scene is a list of steps, each a string:
//   rail:<group>><item> | rail:<item>   open a rail page
//   click:<text>                        click the first visible element whose own text is exactly <text>
//   role:<role>:<name>                  click by accessible role and name (Playwright getByRole)
//   css:<selector>                      click the first match
//   key:<key>                           press a key
//   wait:<ms>
//   shot:<name>                         audit and screenshot
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const { audit } = require('./audit-fn.cjs')

const BASE = process.env.BASE || 'http://localhost:5173/'
const THEME = process.env.THEME || 'dark'
const OUT = path.join(__dirname, 'out', 'scenes') + '/'
fs.mkdirSync(OUT, { recursive: true })

const SCENES = {
  drawer: ['rail:Policy>All Policies', 'click:HRMS access from corporate offices', 'wait:700', 'shot:policy-drawer'],
  builder: ['rail:Policy>All Policies', 'click:HRMS access from corporate offices', 'wait:600', 'click:Open in builder', 'wait:1800', 'shot:builder', 'click:In a corporate office', 'wait:900', 'shot:builder-rule'],
  builderGoogle: ['rail:Policy>All Policies', 'click:Access the app through corporate devices only', 'wait:600', 'click:Open in builder', 'wait:1800', 'shot:builder-google', 'click:Edit policy', 'wait:1000', 'shot:builder-edit'],
  newPolicy: ['rail:Policy>All Policies', 'click:New policy', 'wait:700', 'shot:new-policy-name', 'key:Enter', 'wait:1500', 'shot:new-policy-start'],
  checkAccess: ['rail:Policy>All Policies', 'role:button:Check access', 'wait:1500', 'shot:check-access'],
  activity: ['rail:Policy>All Policies', 'role:button:Sign-in activity', 'wait:1200', 'shot:sign-in-activity'],
  oldPolicies: ['rail:Policy>All Policies', 'role:tab:Old policies', 'wait:1000', 'shot:old-policies'],
  review: ['rail:Policy>All Policies', 'click:Under review', 'wait:900', 'shot:under-review'],
  filters: ['rail:Policy>All Policies', 'click:More filters', 'wait:600', 'shot:more-filters'],
  rowMenu: ['rail:Policy>All Policies', 'css:tbody tr:nth-child(2) td:last-child button', 'wait:500', 'shot:row-menu'],
  zoneNew: ['rail:Policy>Zones', 'role:button:New zone', 'wait:900', 'shot:zone-new'],
  zoneOpen: ['rail:Policy>Zones', 'click:Corporate offices', 'wait:900', 'shot:zone-open'],
  deviceNew: ['rail:Policy>Device profiles', 'role:button:Create new profile', 'wait:900', 'shot:device-new'],
  deviceOpen: ['rail:Policy>Device profiles', 'click:Corporate devices', 'wait:900', 'shot:device-open'],
  riskOpen: ['rail:Policy>Risk signal profile', 'click:Shipped priorities', 'wait:900', 'shot:risk-open'],
  hooks: ['rail:Policy>External Hooks', 'wait:600', 'shot:hooks'],
  appOpen: ['rail:Apps', 'css:tbody tr td button, tbody tr td a', 'wait:1200', 'shot:app-open', 'role:tab:Policies', 'wait:900', 'shot:app-policies', 'role:tab:Users', 'wait:700', 'shot:app-users'],
  appNew: ['rail:Apps', 'role:button:Add application', 'wait:1000', 'shot:app-new'],
  authGeneral: ['rail:Authentication methods', 'role:tab:General settings', 'wait:800', 'shot:auth-general', 'role:tab:Recovery', 'wait:800', 'shot:auth-recovery'],
  authSms: ['rail:Authentication methods', 'click:SMS', 'wait:1000', 'shot:auth-sms'],
  userOpen: ['rail:Users>User List', 'css:tbody tr td button, tbody tr td a', 'wait:1000', 'shot:user-open'],
  groupOpen: ['rail:Groups>Manage Groups', 'css:tbody tr td button, tbody tr td a', 'wait:1000', 'shot:group-open'],
  dashboardNew: ['rail:Dashboard', 'css:.bx-picker__trigger', 'wait:500', 'shot:dashboard-picker', 'click:New', 'wait:1500', 'shot:dashboard-new'],
  profileMenu: ['rail:Dashboard', 'css:.bshell__avatar, [aria-label*="ccount"], .bprofile__trigger', 'wait:600', 'shot:profile-menu'],
  search: ['rail:Dashboard', 'key:Control+k', 'wait:600', 'shot:search'],
  templates: ['rail:Policy>All Policies', 'click:New policy', 'wait:700', 'type:Dark sweep', 'click:Create policy', 'wait:1800', 'shot:start-chooser'],
  dashNew: ['rail:Dashboard', 'css:.bx-picker__trigger', 'wait:500', 'role:option:New', 'wait:1800', 'shot:dashboard-v2', 'click:Customize', 'wait:1200', 'shot:dashboard-customize'],
  seeSteps: ['rail:Dashboard', 'click:See all steps', 'wait:1000', 'shot:see-all-steps'],
  checkClassic: ['rail:Policy>All Policies', 'click:Check access', 'wait:1500', 'click:Classic', 'wait:1200', 'shot:check-classic'],
  checkRun: ['rail:Policy>All Policies', 'click:Check access', 'wait:1500', 'click:Kavya Menon', 'wait:1200', 'click:Run', 'wait:7000', 'shot:check-run', 'click:Why', 'wait:1200', 'shot:check-why'],
  bringBack: ['rail:Dashboard', 'css:.bshell__avatar, [aria-label*="ccount"], .bprofile__trigger', 'wait:500', 'click:Bring back old policies', 'wait:1500', 'shot:bring-back', 'rail:Policy>All Policies', 'wait:1500', 'shot:policies-before-move'],
  tour: ['rail:Authentication methods', 'click:Take the tour', 'wait:1500', 'shot:tour'],
  empty: ['rail:Dashboard', 'css:.bshell__avatar, [aria-label*="ccount"], .bprofile__trigger', 'wait:500', 'click:Show empty states', 'wait:3500', 'shot:empty-landing', 'rail:Policy>Zones', 'wait:900', 'shot:empty-zones', 'rail:Policy>Device profiles', 'wait:900', 'shot:empty-devices', 'rail:Apps', 'wait:900', 'shot:empty-apps', 'rail:Dashboard', 'wait:900', 'shot:empty-dashboard'],
}

async function step(page, s) {
  const [kind, ...rest] = s.split(':')
  const arg = rest.join(':')
  if (kind === 'rail') {
    const [group, item] = arg.includes('>') ? arg.split('>') : [null, arg]
    return page.evaluate(
      async ([group, item]) => {
        const wait = (t) => new Promise((r) => setTimeout(r, t))
        const find = (l) => [...document.querySelectorAll('nav button, nav a')].find((b) => b.textContent.trim().replace(/New$/, '').trim() === l)
        const g = group && find(group)
        if (g && g.getAttribute('aria-expanded') === 'false') {
          g.click()
          await wait(350)
        }
        const el = find(item)
        if (!el) throw new Error('rail item not found: ' + item)
        el.click()
        await wait(1200)
      },
      [group, item],
    )
  }
  if (kind === 'click') {
    const ok = await page.evaluate((text) => {
      const all = [...document.querySelectorAll('body *')].filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === text)
      })
      const el = all[0]
      if (!el) return false
      ;(el.closest('button, a, [role="button"], [role="tab"], tr, li') || el).click()
      return true
    }, arg)
    if (!ok) throw new Error('no element with text: ' + arg)
    return
  }
  if (kind === 'role') {
    const [role, ...name] = arg.split(':')
    return page.getByRole(role, { name: name.join(':'), exact: false }).first().click({ timeout: 4000 })
  }
  if (kind === 'css') return page.locator(arg).first().click({ timeout: 4000 })
  if (kind === 'key') return page.keyboard.press(arg)
  if (kind === 'type') return page.keyboard.type(arg)
  if (kind === 'wait') return page.waitForTimeout(Number(arg))
  throw new Error('unknown step ' + s)
}

async function main() {
  const names = process.argv.slice(2)
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript((theme) => {
    try {
      localStorage.setItem('idp.board-tour.seen', '1')
      localStorage.setItem('idp.tour.seen', '1')
      localStorage.setItem('idp.line-email', 'design@prototype.test')
      localStorage.setItem('idp.line', 'design')
      localStorage.setItem('idp.theme', theme)
    } catch {}
  }, THEME)
  const errors = []
  const report = []
  for (const [name, steps] of Object.entries(SCENES)) {
    if (names.length && !names.includes(name)) continue
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(name + ': ' + String(e)))
    await page.goto(BASE)
    await page.waitForTimeout(1500)
    for (const s of steps) {
      if (s.startsWith('shot:')) {
        const file = s.slice(5)
        await page.screenshot({ path: OUT + file + '.png' })
        const found = await page.evaluate(audit)
        report.push({ scene: name, file, found })
        console.log(`\n== ${file} (${found.length})`)
        for (const f of found.slice(0, 25)) console.log(`  ${f.kind.padEnd(14)} ${String(f.n).padStart(3)}  ${f.key}  ${f.detail}  "${f.text}"`)
        continue
      }
      try {
        await step(page, s)
      } catch (e) {
        console.log(`\n!! ${name}: step "${s}" failed: ${String(e.message || e).split('\n')[0]}`)
        break
      }
    }
    await page.close()
  }
  fs.writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 2))
  console.log(errors.length ? '\nERRORS ' + errors.join('\n') : '\nno page errors')
  await browser.close()
}
main()
