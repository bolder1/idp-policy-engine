/* Video 1 — where the prototype stands against the scenario sheet, 22 Sep 2026.

   A first-time admin works through today's showcase build (nothing changed for
   the film), creating their own profile, policy and zone. The panel on the
   right tracks the 16 use cases: each turns Covered / Partial / Missing when the
   film reaches it, with what works and what is missing for the step on screen.
   The statuses and notes come from the verified audit and the first-time
   walkthrough (design-decisions.md, sections 1 and 5). The film ends on what is
   missing, why it is needed, and which use cases need it.

   node video1.mjs <outdir> [--fast]     --fast shortens every hold, for a dry run */
import { capture, compose } from './studio.mjs'
import { ensureVO } from './vo.mjs'

const out = process.argv[2]
const FAST = process.argv.includes('--fast')
const K = FAST ? 0.15 : 1
const URL = 'http://localhost:5173'
const VOICE_DIR = import.meta.dirname + '/voice'

export const UCS = [
  { id: 1, short: 'OS version: allow, deny, warn' },
  { id: 2, short: 'Block rooted / jailbroken' },
  { id: 3, short: 'Mobile needs a screen lock' },
  { id: 4, short: 'Minimum app / agent version' },
  { id: 5, short: 'Device health in the risk score' },
  { id: 6, short: 'Monitor / report-only mode' },
  { id: 7, short: 'Step-up on elevated risk' },
  { id: 8, short: 'Agent: Windows, Linux, macOS' },
  { id: 9, short: 'Outdated browsers' },
  { id: 10, short: 'Step-up for admin dashboard' },
  { id: 11, short: 'Templates and copy (save as)' },
  { id: 12, short: 'Setup: policies, zones, profiles' },
  { id: 13, short: 'UEM posture checks' },
  { id: 14, short: 'Registration quarantine' },
  { id: 15, short: 'UEM providers' },
  { id: 16, short: 'Plain-language setup (AI)' },
]
export const TODAY = { 1: 'partial', 2: 'partial', 3: 'partial', 4: 'partial', 5: 'partial', 6: 'missing', 7: 'covered', 8: 'partial', 9: 'partial', 10: 'missing', 11: 'covered', 12: 'partial', 13: 'missing', 14: 'missing', 15: 'missing', 16: 'missing' }

/* What each step shows works, and what it shows is missing. */
const F = {
  1: { ids: [1], title: '#1 OS version: allow, deny, warn', covered: ['A minimum version for Windows, Android, iOS and macOS', 'A rule can allow or deny on it'], missing: ['No "warn" answer: only Allow or Deny', 'No Linux, ChromeOS or iPadOS row; unnamed OSs pass', 'No way to try a sign-in in this build'] },
  2: { ids: [2], title: '#2 Block rooted / jailbroken', covered: ['Device integrity check: not rooted or jailbroken, tampered, emulated', 'A rule can deny a device that fails it'], missing: ['Nothing checks it when a sign-in is tried', 'The "Block compromised devices" template does not use it', 'Needs the miniOrange app to report it (new backend)'] },
  3: { ids: [3], title: '#3 Mobile needs a screen lock', covered: ['Screen lock check: any lock, PIN or password, biometric', 'Combine with Device type to aim it at phones'], missing: ['Device type takes one value, so "phones and tablets" means phones', 'Nothing checks it when a sign-in is tried'] },
  4: { ids: [4], title: '#4 Minimum app / agent version', covered: ['The admin sets a minimum Authenticator and Agent version'], missing: ['Typed, not picked from releases; no grace period', 'No sample policy blocks an old version', 'Nothing checks it when a sign-in is tried'] },
  9: { ids: [9], title: '#9 Outdated browsers', covered: ['Minimum Chrome, Edge, Firefox and Safari versions'], missing: ['Any other browser passes', 'Browser age does not feed the risk score', 'Nothing checks it when a sign-in is tried'] },
  rule: { ids: [1, 2, 3, 4, 9], title: 'The rule: not a company device → Deny', covered: ['If Device profile does not match → Deny', 'A message for the person refused'], missing: ['Only Allow or Deny: no notice or warn', 'No way to try a sign-in against it here', 'The device checks are saved, never evaluated'] },
  5: { ids: [5], title: '#5 Device health in the risk score', covered: ['One profile covers OS, integrity, screen lock, app version', 'A rule can combine health with the Device risk score'], missing: ['Health never adds to the risk score', 'The score comes from mobile SDK signals only', 'No MDM / UEM "general compliance" input'] },
  7: { ids: [7], title: '#7 Step-up on elevated risk', covered: ['If Device risk score above N → Allow + second factor', 'Tiers stack: rules run in order, first match wins', 'Template: Step up on suspicious login'], missing: ['No "phishing-resistant" choice; methods picked by hand', 'The method list does not match Authentication methods', 'No way to try a sign-in in this build'] },
  11: { ids: [11], title: '#11 Templates and copy (save as)', covered: ['12 ready-made templates, incl. Require MFA for all and Block outside the office', 'Duplicate and Save as template on every policy'], missing: ['No "Save as" inside the builder', 'Your own templates cannot be edited or deleted', 'Some templates promise more than they check'] },
  6: { ids: [6], title: '#6 Monitor / report-only mode', covered: ['Draft and Inactive keep a policy from deciding'], missing: ['No report-only mode: nothing records what a policy would have done', 'Try a login and What changes exist, hidden in this build', 'Monitor was ruled out on 14 Sep; needs a decision'] },
  12: { ids: [12], title: '#12 Setup: policies, zones, profiles', covered: ['Zones: IP networks, and countries, states or cities with a range', 'Device health and Trusted device profiles', 'Both are picked straight into a rule'], missing: ['Zones and profiles are built away from the rule', 'One device type per profile; a short list of places', 'No way to see a rule match'] },
  8: { ids: [8], title: '#8 Agent: Windows, Linux, macOS', covered: ['Agent-based trusted devices, with the Windows Device Agent'], missing: ['No macOS or Linux agent', 'No single agent for MFA and adaptive', 'Devices › MFA Agents is "Coming soon"'] },
  10: { ids: [10], title: '#10 Step-up for admin dashboard', covered: [], missing: ['Nothing governs sign-in to the admin dashboard', 'Nothing asks an admin to re-verify before a sensitive change', '"Setup 2FA for Admin" is "Coming soon"'] },
  1315: { ids: [13, 15], title: '#13 UEM posture · #15 UEM providers', covered: ['A generic external hook: a yes or no from your own endpoint'], missing: ['No Intune, Jamf, Sophos or miniOrange UEM connection', 'No disk encryption, firewall, password or EDR / AV check'] },
  14: { ids: [14], title: '#14 Registration quarantine', covered: [], missing: ['No flag or hold on a suspicious new 2FA method', 'No admin review or release, reasons, notices or history'] },
  16: { ids: [16], title: '#16 Plain-language setup (AI)', covered: ['Rules are built by hand on the board'], missing: ['No way to describe a policy in a sentence', 'Needs an AI service behind it'] },
}

const chip = (id) => `<span>#${id} ${UCS.find((u) => u.id === id).short}</span>`
const chapter = (n, title, blurb, ids) => `<div class="kick">Chapter ${n}</div><h1>${title}</h1><p>${blurb}</p><div class="ids">${ids.map(chip).join('')}</div>`

async function film(rec, page) {
  const W = (ms) => rec.hold(ms * K)
  const nav = page.locator('nav')
  const leaveGuard = async () => {
    const d = page.getByRole('dialog').filter({ hasText: 'Unsaved changes' })
    if (await d.isVisible().catch(() => false)) { await rec.click(d.getByRole('button', { name: 'Discard' })); await W(500) }
  }
  /* A Policies sub-page, opening the rail and its group first when a board has collapsed them. */
  const sub = async (name) => {
    const item = nav.getByRole('button', { name, exact: true })
    if (!(await item.first().isVisible().catch(() => false))) {
      const ex = page.getByRole('button', { name: 'Expand navigation' })
      if (await ex.isVisible().catch(() => false)) { await rec.click(ex); await W(400) }
    }
    if (!(await item.first().isVisible().catch(() => false))) { await rec.click(nav.locator('button.bshell__item', { hasText: 'Policies' })); await W(400) }
    await rec.click(item)
    await leaveGuard()
    await W(500)
  }
  /* Tick a check and prove it: a landed click proves nothing, and a row at the
     list's edge takes the press somewhere else. */
  const tick = async (name) => {
    const row = page.locator('.bdpw__list [role=checkbox]', { hasText: new RegExp('^' + name + '$') }).first()
    for (let i = 0; i < 3; i++) {
      if ((await row.getAttribute('aria-checked')) === 'true') break
      await rec.click(row)
      await W(250)
    }
    if ((await row.getAttribute('aria-checked')) !== 'true') rec.problems.push('did not tick ' + name)
  }
  const insp = page.locator('.bb__insp')
  const ifHead = insp.locator('.bb__sec__head h3', { hasText: /^If$/ })
  const option = (name) => page.locator('.cp__pop .bx-menu__item, .cp__pop [role=option], [role=listbox] [role=option]', { hasText: name })
  /* A chapter opener: the card holds for as long as its line is spoken. */
  const card = async (id, html) => {
    await rec.cap('')
    rec.mark('card', { card: html })
    rec.mark('say', { id })
    rec.sayEnd = Date.now() + (rec.vo[id] ? rec.vo[id].duration : 2) * 1000
    await rec.endSay(700)
    rec.mark('card', { card: null })
    await W(400)
  }

  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForSelector('main')
  await page.waitForTimeout(900)

  /* ---- 0. First look ---- */
  await card('k0', '<div class="kick">A first-time admin</div><h1>Signs in and gets to work</h1><p>Today’s prototype, recorded as it is. The panel on the right tracks the 16 use cases from the brief.</p>')
  await rec.say('c01', 'Signed in for the first time, the admin lands on <b>Policies</b>.')
  await rec.startSay('c02', 'What a rule can use sits under Policies: templates, zones, device profiles and risk signals.')
  await rec.hover(nav.getByRole('button', { name: 'Templates', exact: true })); await W(250)
  await rec.hover(nav.getByRole('button', { name: 'Zones', exact: true })); await W(250)
  await rec.hover(nav.getByRole('button', { name: 'Device profiles', exact: true })); await W(250)
  await rec.hover(nav.getByRole('button', { name: 'Risk signal profile', exact: true }))
  await rec.endSay()

  /* ---- 1. Device health ---- */
  await card('k1', chapter(1, 'Device health', 'Build a Device health profile from scratch, then a policy that uses it.', [1, 2, 3, 4, 9]))
  await rec.startSay('c03', '<b>Device profiles</b>: checks a device must pass, or signals that recognise it.')
  await sub('Device profiles')
  await rec.endSay()
  await rec.startSay('c04', 'A new profile starts with a name.')
  await rec.click(page.getByRole('button', { name: /Create new profile/ }))
  await rec.type(page.locator('main input').first(), 'Company devices')
  await rec.endSay()
  await rec.startSay('c05', 'The type: <b>Device health</b>, checks a device must pass at sign-in.')
  await rec.click(page.locator('main [role=radio]', { hasText: 'Device health' }))
  await rec.endSay()
  await rec.click(page.getByRole('button', { name: 'Next', exact: true })); await W(800)
  await rec.expect(page.locator('.bdpw__list'), 'the checks list')

  rec.focus(F[1])
  await rec.startSay('c06', '<b>#1</b> A minimum OS version per platform — and no “warn” answer: only Allow or Deny.')
  await tick('Windows')
  await rec.click(page.getByRole('combobox', { name: 'Minimum Windows version' }))
  await rec.click(page.getByRole('option', { name: 'Windows 11', exact: true }))
  await tick('Android')
  await rec.endSay()
  rec.focus(F[2])
  await rec.startSay('c07', '<b>#2</b> Device integrity: not rooted, jailbroken or tampered with.')
  await tick('Device integrity')
  await rec.endSay()
  rec.focus(F[3])
  await rec.startSay('c08', '<b>#3</b> A screen lock must be set.')
  await tick('Screen lock')
  await rec.endSay()
  rec.focus(F[4])
  await rec.startSay('c09', '<b>#4</b> The lowest miniOrange Authenticator version allowed.')
  await tick('miniOrange Authenticator')
  await rec.endSay()
  rec.focus(F[9])
  await rec.startSay('c10', '<b>#9</b> And a minimum browser version.')
  await tick('Chrome')
  await rec.endSay()
  await rec.startSay('c11', 'Every version is a minimum; the column heading says so once.')
  await rec.hover(page.locator('.bdpw__colhead .bfp2__colnote').first())
  await rec.endSay()
  await rec.startSay('c12', 'Review, then create.')
  await rec.click(page.getByRole('button', { name: 'Next', exact: true })); await W(900)
  await rec.endSay()
  await rec.startSay('c13', 'Created. Now a policy that uses it.')
  await rec.click(page.getByRole('button', { name: 'Create profile' }))
  await rec.expect(page.getByText('Company devices created'), 'the created toast')
  await rec.endSay()
  await sub('All Policies')
  await rec.startSay('c14', 'Name the policy, and pick the application it protects.')
  await rec.click(page.getByRole('button', { name: /New policy/ }))
  await rec.type(page.locator('#np-name'), 'Company devices only')
  await rec.click(page.getByRole('combobox', { name: 'Applications this policy protects' }))
  await rec.click(page.getByRole('option', { name: /^Salesforce/ }))
  await rec.click(page.getByRole('dialog').locator('h2').first())
  await rec.endSay()
  await rec.startSay('c15', 'A new policy starts empty: a template, or the first rule by hand.')
  await rec.click(page.getByRole('button', { name: 'Create policy' })); await W(1100)
  await rec.endSay()
  await rec.click(page.getByRole('button', { name: /Start from scratch/ })); await W(600)
  await rec.click(page.getByRole('button', { name: 'Add the first rule' })); await W(900)
  await rec.expect(insp, 'the rule panel')
  await rec.startSay('c16', 'If the device <b>does not match</b> Company devices…')
  await rec.type(insp.getByRole('textbox', { name: 'Rule name' }), 'Not a company device', { clear: true })
  await rec.click(insp.getByRole('button', { name: 'Add condition', exact: true }))
  await rec.click(page.locator('.bx-menu__item', { hasText: 'Device profile' }).first()); await W(400)
  await rec.click(option('does not match').first()); await W(400)
  await rec.click(option('Company devices').last()); await W(300)
  await rec.click(ifHead)
  rec.focus(F.rule)
  await rec.endSay()
  await rec.startSay('c17', '…then <b>Deny</b>, with a message. Allow or Deny are the only answers: there is no warn.')
  await rec.click(insp.locator('button', { hasText: /^Deny/ }))
  await rec.type(insp.locator('textarea'), 'Use a company device that meets our health checks.', { delay: 26 })
  await rec.hover(insp.locator('.bb__outcard.is-soon')).catch(() => {})
  await rec.endSay()
  await rec.startSay('c18', 'Review, then turn it on.')
  await rec.click(page.getByRole('button', { name: 'Review & save' })); await W(800)
  await rec.endSay()
  await rec.startSay('c19', 'Saved and on. To see it work a first-timer would try a sign-in, and <b>this build has no way to</b>.')
  await rec.click(page.getByRole('button', { name: 'Save and turn on' })); await W(1200)
  await rec.endSay()

  /* ---- 2. Risk ---- */
  await card('k2', chapter(2, 'Risk', 'Where the Device risk score comes from, and a rule that steps up when it is high.', [5, 7]))
  await sub('Risk signal profile')
  rec.focus(F[5])
  await rec.startSay('c20', '<b>#5</b> Mobile SDK signals, each with one priority, make up the <b>Device risk score</b>.')
  await rec.click(page.getByRole('button', { name: 'Shipped priorities', exact: true })); await W(1100)
  await rec.wheel(420)
  await rec.endSay()
  await rec.say('c21', 'Device health does not feed this score: a health check is only pass or fail.')
  await sub('All Policies')
  await rec.startSay('c22', 'Back in the policy, a second rule for a risky device.')
  await rec.click(page.getByRole('button', { name: 'Company devices only', exact: true })); await W(1300)
  await rec.click(page.getByRole('button', { name: 'Add a rule at the end' })); await W(900)
  await rec.type(insp.getByRole('textbox', { name: 'Rule name' }), 'Risky device', { clear: true })
  await rec.endSay()
  rec.focus(F[7])
  await rec.startSay('c23', '<b>#7</b> If the Device risk score is above 69…')
  await rec.click(insp.getByRole('button', { name: 'Add condition', exact: true }))
  await rec.click(page.locator('.bx-menu__item', { hasText: 'Device risk score' }).first()); await W(400)
  await rec.click(option('above').first()); await W(300)
  await rec.type(insp.getByRole('spinbutton', { name: 'Device risk score' }).or(insp.getByRole('textbox', { name: 'Device risk score' })), '69', { clear: true })
  await rec.click(ifHead)
  await rec.endSay()
  await rec.startSay('c24', '…allow, but ask for a <b>second factor</b>. Rules run top to bottom, and the first match wins.')
  await rec.click(insp.locator('button', { hasText: /^Allow/ })); await W(400)
  await rec.click(insp.getByRole('combobox', { name: 'Second factor' }))
  await rec.click(page.getByRole('option', { name: /^Any enabled method/ }))
  await rec.endSay()
  await rec.startSay('c25', '“A stronger method” is a hand-picked list here: there is no phishing-resistant choice.')
  await rec.click(page.getByRole('button', { name: 'Review & save' })); await W(800)
  await rec.click(page.getByRole('dialog').getByRole('button', { name: /Save changes|Save and turn on/ })); await W(1100)
  await rec.endSay()

  /* ---- 3. Templates, copies, trying first ---- */
  await card('k3', chapter(3, 'Templates, copies, and trying before enforcing', 'Start from a template, copy a policy, and look for a way to see its effect first.', [11, 6]))
  await sub('Templates')
  rec.focus(F[11])
  await rec.startSay('c26', '<b>#11</b> Twelve ready-made templates, including the two in the brief.')
  await rec.hover(page.getByRole('button', { name: 'Use Require MFA for all users' })); await W(900)
  await rec.hover(page.getByRole('button', { name: 'Use Block access outside office network' }))
  await rec.endSay()
  await rec.startSay('c27', 'The template’s rules land on the board, ready to edit.')
  await rec.click(page.getByRole('button', { name: 'Use Require MFA for all users' })); await W(600)
  const dlg = page.getByRole('dialog')
  await rec.type(dlg.locator('input').first(), 'MFA for everyone')
  await rec.click(dlg.getByRole('combobox', { name: 'Applications this policy protects' }))
  await rec.click(page.getByRole('option', { name: /^Slack/ }))
  await rec.click(dlg.locator('h2').first())
  await rec.click(dlg.getByRole('button', { name: 'Create policy' })); await W(1300)
  await rec.endSay()
  await rec.startSay('c28', 'Any policy can be copied from its row menu, or saved as a template.')
  await rec.click(page.getByRole('button', { name: 'Back to policies' })); await leaveGuard(); await W(900)
  await rec.click(page.getByRole('button', { name: 'Actions for Company devices only' })); await W(600)
  await rec.hover(page.getByRole('menuitem', { name: 'Save as template' }))
  await rec.endSay()
  await rec.startSay('c29', '<b>Duplicate</b> opens the copy as a draft. There is no “Save as” inside the builder.')
  await rec.click(page.getByRole('menuitem', { name: 'Duplicate' })); await W(1300)
  await rec.endSay()
  await rec.click(page.getByRole('button', { name: 'Back to policies' })); await leaveGuard(); await W(900)
  rec.focus(F[6])
  await rec.startSay('c30', '<b>#6</b> What a first-timer can’t do: see what a policy <b>would have done</b> before it is on.')
  await rec.hover(page.getByRole('button', { name: 'Draft', exact: true })); await W(700)
  await rec.hover(page.getByRole('button', { name: 'Inactive', exact: true }))
  await rec.endSay()
  await rec.say('c31', 'Draft and Inactive decide nothing and record nothing. There is no report-only mode.')

  /* ---- 4. Zones and trusted devices ---- */
  await card('k4', chapter(4, 'Zones and trusted devices', 'Build a zone, then look at how a device can be recognised.', [12, 8]))
  await sub('Zones')
  rec.focus(F[12])
  await rec.startSay('c32', '<b>#12</b> A zone holds IP networks…')
  await rec.click(page.getByRole('button', { name: /New zone/ }).first()); await W(400)
  await rec.type(page.getByRole('dialog').locator('input').first(), 'Pune office')
  await rec.click(page.getByRole('button', { name: 'Continue' })); await W(800)
  await rec.click(page.getByRole('button', { name: 'Add IP' }).first())
  await rec.type(page.getByRole('textbox', { name: 'IP address, network or ASN' }), '203.0.113.0/24')
  await rec.endSay()
  await rec.startSay('c33', '…and places: a country, a state, or a city with a range around it.')
  await rec.click(page.getByRole('tab', { name: 'Locations' })); await W(400)
  await rec.click(page.getByRole('button', { name: 'Add location' }))
  await page.keyboard.type('Pune', { delay: 70 }); await W(600)
  await rec.click(page.getByRole('option', { name: /Pune/ }).first()); await W(500)
  await rec.type(page.getByRole('spinbutton', { name: 'Range around Pune' }), '25', { clear: true })
  await rec.endSay()
  await rec.startSay('c34', 'Saved, and ready for any rule, but built here, away from the policy that needs it.')
  await rec.click(page.getByRole('button', { name: 'Review & save' })); await W(700)
  await rec.click(page.getByRole('button', { name: 'Create zone' })); await W(1100)
  await rec.endSay()
  await sub('Device profiles')
  await rec.startSay('c35', 'A <b>Trusted device</b> profile recognises machines it has seen before.')
  await rec.click(page.getByRole('button', { name: /Create new profile/ }))
  await rec.type(page.locator('main input').first(), 'Office laptops')
  await rec.click(page.locator('main [role=radio]', { hasText: 'Trusted device' }))
  await rec.endSay()
  rec.focus(F[8])
  await rec.startSay('c36', '<b>#8</b> Agentless reads the browser, network and location; <b>Agent-based</b> adds hardware identifiers…')
  await rec.click(page.getByRole('button', { name: 'Next', exact: true })); await W(900)
  await rec.click(page.locator('main [role=radio]', { hasText: 'Agent-based' }))
  await rec.endSay()
  await rec.say('c37', '…but the Device Agent is Windows only, and there is no one agent for MFA and adaptive.')
  await rec.click(page.getByRole('button', { name: 'All profiles' })); await leaveGuard(); await W(700)
  await rec.startSay('c38', 'Devices › <b>MFA Agents</b> is marked Coming soon.')
  await rec.click(nav.locator('button.bshell__item', { hasText: 'Devices' })); await W(400)
  await rec.hover(nav.getByRole('button', { name: 'MFA Agents', exact: true }))
  await rec.endSay()

  /* ---- 5. Not built yet ---- */
  await card('k5', chapter(5, 'Not built yet', 'The admin dashboard, UEM, registration review and plain-language setup.', [10, 13, 14, 15, 16]))
  rec.focus(F[10])
  await rec.startSay('c39', '<b>#10</b> Step-up for the admin dashboard: <b>Setup 2FA for Admin</b> is Coming soon.')
  await rec.click(nav.locator('button.bshell__item', { hasText: 'Authentication methods' }).first()); await W(400)
  await rec.hover(nav.getByRole('button', { name: 'Setup 2FA for Admin', exact: true }))
  await rec.endSay()
  rec.focus(F[1315])
  await rec.startSay('c40', '<b>#13, #15</b> The only way in for outside systems is a generic external hook: no UEM, no posture checks.')
  await sub('External Hooks')
  await rec.endSay()
  rec.focus(F[14])
  await rec.startSay('c41', '<b>#14</b> A new 2FA method is simply added: nothing flags, holds or reviews a suspicious one.')
  await sub('Authentication methods')
  await rec.endSay()
  rec.focus(F[16])
  await rec.startSay('c42', '<b>#16</b> Every policy is built by hand: there is no way to describe one in a sentence.')
  await sub('All Policies')
  await rec.click(page.getByRole('button', { name: /New policy/ })); await W(800)
  await rec.endSay()
  await rec.click(page.getByRole('dialog').getByRole('button', { name: 'Cancel' })); await W(500)
  await rec.cap(''); await W(500)
}

/* ---- the closing section ---- */
const ROWS = {
  1: 'No warn; no test; four platforms', 2: 'Not evaluated; template skips it', 3: 'Phones only; not evaluated', 4: 'No sample blocks it; not evaluated',
  5: 'Health never feeds the score', 6: 'No report-only; test tools hidden', 7: 'No phishing-resistant choice', 8: 'Windows only; no MFA agent',
  9: 'Other browsers pass; not evaluated', 10: 'Nothing for the admin dashboard', 11: 'No Save as in the builder', 12: 'Built away from the rule; no test',
  13: 'No UEM checks', 14: 'No review of new methods', 15: 'No Intune, Jamf, Sophos', 16: 'No plain-language setup',
}
const LBL = { covered: '✓ Covered', partial: '◐ Partial', missing: '✕ Missing' }
const CLS = { covered: 'c', partial: 'p', missing: 'm' }
const scoreboard = `<div class="kick">Where we stand</div><h2>2 covered · 8 partial · 6 missing</h2>
<table><tr><th>#</th><th>Use case</th><th>Today</th><th>What is missing</th></tr>${UCS.map((u) => `<tr><td>${u.id}</td><td>${u.short}</td><td><span class="st ${CLS[TODAY[u.id]]}">${LBL[TODAY[u.id]]}</span></td><td>${ROWS[u.id]}</td></tr>`).join('')}</table>`

const GAPS = [
  ['Try a sign-in in this build', 'Prove a policy decides what you meant before it goes live.', '#1–#7, #9, #12'],
  ['Device checks that really run', 'Today the checks are saved, and nothing reads them when a sign-in is tried.', '#1–#5, #9, #12, #13'],
  ['A notice on Allow (warn)', 'Let an outdated device in with a heads-up before it is blocked.', '#1, #4, #9'],
  ['Report-only mode', 'See what a policy would have done on real sign-ins before enforcing it.', '#6'],
  ['Phishing-resistant step-up', '“A stronger method” as a class of methods, not a hand-picked list that drifts.', '#7, #5'],
  ['Health beside risk', 'A failed health check should raise the bar next to the Device risk score.', '#5'],
  ['Phones, tablets, every platform', 'Device type is one value today, and an unnamed OS or browser passes.', '#1, #3, #9'],
  ['Step-up for the admin dashboard', 'A sensitive admin change needs a fresh check of who is making it.', '#10'],
  ['One agent for Windows, macOS, Linux', 'MFA and device signals from one install, on every desktop.', '#8'],
  ['Zones and profiles from the rule', 'A first-timer should not leave the policy to build what it needs.', '#12'],
  ['Save as, and your own templates', 'Copy a live policy safely, and manage the templates you saved.', '#11'],
  ['UEM posture and providers', 'Encryption, firewall, password and EDR / AV, from Intune, Jamf, Sophos or miniOrange UEM.', '#13, #15'],
  ['Review of new 2FA methods', 'Flag or hold a suspicious registration, with reasons, notices and history.', '#14'],
  ['Describe it in plain language', 'Turn a sentence into rules to review, instead of building by hand.', '#16'],
  ['Sample content that says what it does', 'Some templates and sample policies promise more than they check.', '#2, #4, #7, #10, #11'],
]
const gapSlide = (items, part) => `<div class="kick">What is missing · ${part}</div><h2>Why it is needed, and for which use cases</h2><div class="grid">${items.map(([t, why, ids]) => `<div class="it"><b>${t}</b><em>${why}</em><u>Use cases ${ids}</u></div>`).join('')}</div>`

const INTRO = [
  { voId: 'i1', secs: 5, html: '<div class="kick">Policy Engine · status film · 22 Sep 2026</div><h1>Where we stand against the brief</h1><p class="lead">The 16 use cases from the scenario sheet, tried by a first-time admin on today’s prototype. Nothing was changed for this recording.</p>' },
  { voId: 'i2', secs: 6, html: '<div class="kick">How to read it</div><h2>Every step says what it covers</h2><p class="lead">The panel on the right lists the 16 use cases. Each turns <span class="st c">✓ Covered</span> <span class="st p">◐ Partial</span> or <span class="st m">✕ Missing</span> when the film reaches it, with what works and what is missing for the step on screen.</p><p class="lead">The verdicts come from a code audit, checked a second time, and a first-time walkthrough.</p>' },
]
const OUTRO = [
  { voId: 'o1', secs: 10, html: scoreboard },
  { voId: 'o2', secs: 12, html: gapSlide(GAPS.slice(0, 6), '1 of 3') },
  { voId: 'o3', secs: 12, html: gapSlide(GAPS.slice(6, 11), '2 of 3') },
  { voId: 'o4', secs: 12, html: gapSlide(GAPS.slice(11), '3 of 3') },
  { voId: 'o5', secs: 12, html: `<div class="kick">Decisions first</div><h2>Four to settle before building</h2><div class="grid">
    <div class="it"><b>Warn as a notice on Allow</b><em>Allow and Deny stay the only answers; an Allow can show a notice.</em><u>Use cases #1, #4, #9</u></div>
    <div class="it"><b>A report-only status</b><em>Reverses the 14 Sep “No Monitor” ruling, as a labelled proposal.</em><u>Use case #6</u></div>
    <div class="it"><b>Try a login in the showcase</b><em>The one way to show any device use case working.</em><u>Use cases #1–#7, #9</u></div>
    <div class="it"><b>When to build the proposals</b><em>After the manager agrees each direction.</em><u>Use cases #8, #13–#16</u></div>
    </div><p class="lead" style="margin-top:26px">All 22 decisions, with peer sources, are in the design-decisions document.</p>` },
  { voId: 'o6', secs: 8, html: '<div class="kick">Next</div><h1>Decide, build, film again</h1><p class="lead">1. Settle the decisions. 2. Build the fixes and the missing pieces. 3. Video 2: every use case, covered. 4. Video 3: what we have, and the future scope.</p>' },
]

const voice = ensureVO(VOICE_DIR)
console.log('voice lines', Object.keys(voice).length)
const r = await capture({ out, storage: { 'idp.board-tour.seen': '1' }, run: film, vo: voice })
console.log('problems', JSON.stringify(r.problems, null, 1))
const c = await compose({ out, webm: r.webm, events: r.events, ucs: UCS, statusOf: (id) => TODAY[id], intro: INTRO, outro: OUTRO, vo: voice, file: FAST ? 'video-1-dry.mp4' : 'video-1-where-we-stand.mp4' })
console.log(JSON.stringify(c))
