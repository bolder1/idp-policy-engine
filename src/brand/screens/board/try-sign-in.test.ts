import { describe, expect, it } from 'vitest'

import { card, cond, rule, when, type Policy } from '../../data'
import { showcaseTenantHrmsOn } from '../../fixtures'
import { envOf } from '../tenant-resolver'
import { LAST_ROW } from '../testing/evidence'
import { defaultBoardForm, factsOf, originPatch, typedAddressPatch, type SignInForm } from '../testing/sign-in-form'
import { whichPolicyRows } from '../testing/which-policy'
import {
  addressInside,
  boardVersion,
  columnView,
  columnsFor,
  decisionSig,
  nextWeekday,
  routeOf,
  ruleStage,
  runColumns,
  runSentence,
  stageSentence,
  standingWatch,
  updateSentence,
  wouldChangeIf,
  type ColumnResult,
} from './try-sign-in'

/* Try a sign-in on the board, as scenes on the showcase tenant (Spec A §8, as
   the final spec corrects it). The engine's answers are the truth here; what
   is pinned is what the board SAYS about them — which columns, which stage the
   marker stops on, the decision line, the chips, the status region's words —
   so a change to any of those reads as a scene that reads differently. */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const TODAY = '2026-09-28'
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const hrms = policy('sc-hrms-office')
const devices = policy('sc-corporate-devices')
const compliance = policy('sc-device-compliance')
const appName = (id: string) => t.apps.find((a) => a.id === id)?.name ?? id

const board = (p: Policy, patch: Partial<SignInForm> = {}): SignInForm => ({ ...defaultBoardForm(p, t.directory.people, t.apps, TODAY), ...patch })
/** HRMS set to Monitoring, and the tenant with it. */
const monitoring = { ...hrms, status: 'monitor' as const }
const withMonitor = t.policies.map((p) => (p.id === monitoring.id ? monitoring : p))

/** The board's run for a form: the columns, and the route down the right-most one. */
function run(saved: Policy, form: SignInForm, draft: Policy = saved, policies: readonly Policy[] = t.policies) {
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns(columnsFor(saved, draft, form.appId), policies, facts, env)
  const right = cols.at(-1)!
  const route = routeOf(right, draft, facts, env, policies)
  const chips = wouldChangeIf({ form, saved, draft, right, policies, env, zones: t.zones, methods: t.methods })
  return { cols, right, route, chips, views: cols.map((c) => columnView(c, draft.id, policies, appName)) }
}

const said = (c: ColumnResult) => {
  const v = columnView(c, hrms.id, t.policies, appName)
  return `${v.label} · ${v.policyName ?? '—'} · ${v.line} · ${v.decision ?? v.status}`
}
const landed = (r: ReturnType<typeof run>) => r.route.stages[r.route.landing]

describe('the version columns', () => {
  it('is one Live column while the board matches the stored policy', () => {
    expect(columnsFor(hrms, hrms, 'hrms').map((c) => c.id)).toEqual(['live'])
  })

  it('adds Your edits once a rule on the board differs', () => {
    const draft = { ...hrms, rules: hrms.rules.map((r) => ({ ...r, enabled: false })) }
    const specs = columnsFor(hrms, draft, 'hrms')
    expect(specs.map((c) => c.label)).toEqual(['Live', 'Your edits'])
    expect(specs[1].substitute).toBe(draft)
  })

  it('puts Today beside the stored version for a policy that is off', () => {
    const off = { ...hrms, status: 'inactive' as const }
    const specs = columnsFor(off, off, 'hrms')
    expect(specs.map((c) => c.label)).toEqual(['Today', 'Stored version'])
    expect(specs[0].tip).toBe('Decides sign-ins now; this policy is off')
    expect(specs[1].substitute).toBe(off)
  })

  it('asks a monitoring policy as though it were on, and says it is monitoring', () => {
    const watching = { ...hrms, status: 'monitor' as const }
    const specs = columnsFor(watching, watching, 'hrms')
    expect(specs.map((c) => c.label)).toEqual(['Today', 'Stored version'])
    expect(specs[0].tip).toBe('Decides sign-ins now; this policy is monitoring')
    expect(specs[1].substitute?.status).toBe('active')
    const edited = { ...watching, rules: [] }
    expect(columnsFor(watching, edited, 'hrms').map((c) => c.label)).toEqual(['Today', 'Your edits'])
  })

  it('runs a draft with no application as though it covered the one tried, and says so', () => {
    const draft = { ...hrms, status: 'draft' as const, appIds: [] }
    const specs = columnsFor(draft, draft, 'hrms')
    expect(specs.map((c) => c.label)).toEqual(['Today', 'Draft'])
    expect(specs[1].substitute?.appIds).toEqual(['hrms'])
    expect(specs[1].asIfApp).toBe('hrms')
    const r = run(draft, board(hrms), draft)
    expect(r.views[1].line).toBe('As if on HRMS · Rule 1 · In a corporate office')
  })
})

/* Version 3's other views — Check a person, Saved sign-ins — judge by the
   right-hand column, so they never contradict Try beside them. */
describe('the version the panel’s other views judge by', () => {
  it('is the tenant as it stands for a live policy with nothing changed', () => {
    expect(boardVersion(hrms, hrms)).toBeNull()
  })

  it('is Your edits once the board differs, whatever the status', () => {
    const draft = { ...hrms, rules: hrms.rules.map((r) => ({ ...r, enabled: false })) }
    expect(boardVersion(hrms, draft)).toEqual({ substitute: draft, label: 'Your edits', tip: 'The rules on this board, as if saved' })
    const off = { ...hrms, status: 'inactive' as const }
    expect(boardVersion(off, { ...draft, status: 'inactive' })?.label).toBe('Your edits')
  })

  it('is the stored rules as though on for a policy that is off or monitoring', () => {
    const off = { ...hrms, status: 'inactive' as const }
    expect(boardVersion(off, off)?.substitute).toBe(off)
    const watching = { ...hrms, status: 'monitor' as const }
    const v = boardVersion(watching, watching)
    expect([v?.label, v?.substitute?.status]).toEqual(['Stored version', 'active'])
  })

  it('never runs a draft with no application as though it covered one', () => {
    const draft = { ...hrms, status: 'draft' as const, appIds: [] }
    const v = boardVersion(draft, draft)
    expect([v?.label, v?.substitute?.appIds]).toEqual(['Draft', []])
  })
})

describe('the default run on HRMS', () => {
  const r = run(hrms, board(hrms))

  it('is Kavya from the office, one Live column, Allow with 2FA by rule 1', () => {
    expect(r.cols.map(said)).toEqual(['Live · HRMS access from corporate offices · Rule 1 · In a corporate office · 2fa'])
  })

  it('travels Sign-in, Which policy, Who, and lands on rule 1', () => {
    expect(r.route.stages.slice(0, 4)).toEqual(['sign-in', 'policy', 'who', ruleStage(hrms.rules[0].id)])
    expect(landed(r)).toBe(ruleStage(hrms.rules[0].id))
    expect(r.route.landingUnknown).toBe(false)
    /* Only who: the address and the time are in their own rows. */
    expect(r.route.signIn).toBe('Kavya Menon')
    expect(r.route.policy).toMatchObject({ value: 'This policy', word: 'Decides', decides: true })
    expect(r.route.who).toMatchObject({ value: 'Kavya Menon · Human Resources', word: 'In audience' })
  })

  it('matches rule 1 and never reaches the last row', () => {
    expect(r.route.cards[hrms.rules[0].id].word).toBe('Matched')
    expect(r.route.cards[LAST_ROW].word).toBe('Not reached')
  })

  it('says the decision with its policy and rule, and so does the status region', () => {
    expect(r.route.decision).toMatchObject({ status: 'decided', decision: '2fa', line: 'HRMS access from corporate offices · Rule 1 · In a corporate office' })
    expect(runSentence(r.route.decision)).toBe('Allow with 2FA. HRMS access from corporate offices, Rule 1 · In a corporate office.')
  })

  it('has nothing that would change it', () => {
    expect(r.chips).toEqual([])
  })
})

describe('an address typed from home', () => {
  const r = run(hrms, board(hrms, typedAddressPatch('192.0.2.50')))

  it('falls to the last row and denies', () => {
    expect(landed(r)).toBe('last-row')
    expect(r.route.decision).toMatchObject({ decision: 'deny', line: 'HRMS access from corporate offices · Nothing else matched' })
    expect(updateSentence(r.route.decision, 'address')).toBe('Now Deny. Changed by IP address.')
  })

  it('offers the office network, which moves the sign-in and never the person', () => {
    expect(r.chips.map((c) => `${c.kind} | ${c.text} → ${c.decision}`)).toEqual(['sign-in | From Corporate offices network → 2fa'])
    expect(r.chips[0].patch).toEqual({ origin: null, address: '203.0.113.10', addressSource: 'stated' })
    expect(r.chips[0].patch).not.toHaveProperty('personId')
    /* And the chip does what it says. */
    const after = run(hrms, { ...board(hrms, typedAddressPatch('192.0.2.50')), ...r.chips[0].patch })
    expect(after.route.decision.decision).toBe('2fa')
  })
})

describe('the origin presets', () => {
  it('lets the branch office in with 2FA', () => {
    expect(run(hrms, board(hrms, originPatch('branch'))).route.decision.decision).toBe('2fa')
  })

  it('denies a Tor exit, settled even though its place cannot be told', () => {
    const r = run(hrms, board(hrms, originPatch('tor')))
    expect(r.route.decision).toMatchObject({ status: 'decided', decision: 'deny' })
    expect(r.route.cards[hrms.rules[0].id].word).toBe('No match')
    expect(landed(r)).toBe('last-row')
  })
})

describe('the distance ruler', () => {
  const at = (km: number) => run(hrms, board(hrms, { place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km } }))

  it('lets 20 km in with 2FA and denies 30 km', () => {
    expect(at(20).route.decision.decision).toBe('2fa')
    expect(at(30).route.decision.decision).toBe('deny')
  })
})

describe('somebody the policy is not for', () => {
  const r = run(hrms, board(hrms, { personId: 'u-sales-1' }))

  it('is decided by the Global Default, and the marker stops at Who', () => {
    expect(r.route.policy).toMatchObject({ value: 'Global Default Policy', word: 'Not deciding', decides: false })
    expect(r.route.who).toMatchObject({ value: 'Aisha Khan · Sales', word: 'Not in audience', state: 'fail' })
    expect(landed(r)).toBe('who')
    expect(r.route.decision).toMatchObject({ decision: '1fa', line: 'Global Default Policy · Corporate device, where we operate' })
  })

  it('reaches none of this policy’s cards', () => {
    expect(Object.values(r.route.cards).map((c) => c.word)).toEqual(['Not reached', 'Not reached'])
  })
})

describe('versions on the board', () => {
  it('puts Live beside Your edits when rule 1 is switched off, and the card says so', () => {
    const draft = { ...hrms, rules: hrms.rules.map((x) => ({ ...x, enabled: false })) }
    const r = run(hrms, board(hrms), draft)
    expect(r.views.map((v) => `${v.label} ${v.decision}`)).toEqual(['Live 2fa', 'Your edits deny'])
    expect(r.views[1].line).toBe('Nothing else matched')
    expect(r.route.cards[hrms.rules[0].id].word).toBe('Switched off')
  })

  it('shows Today and the stored version for HRMS turned off', () => {
    const off = { ...hrms, status: 'inactive' as const }
    const policies = t.policies.map((p) => (p.id === off.id ? off : p))
    const r = run(off, board(off), off, policies)
    expect(r.views.map((v) => `${v.label} · ${v.policyName} · ${v.line} · ${v.decision}`)).toEqual([
      'Today · Global Default Policy · Corporate device, where we operate · 1fa',
      'Stored version · HRMS access from corporate offices · Rule 1 · In a corporate office · 2fa',
    ])
  })

  it('shows Today and the stored version for HRMS monitoring, and Which policy keeps its would-be decision', () => {
    const r = run(monitoring, board(monitoring), monitoring, withMonitor)
    expect(r.views.map((v) => `${v.label} ${v.decision}`)).toEqual(['Today 1fa', 'Stored version 2fa'])
    /* On its own board the monitor is the policy asked as though on, and the
       route runs down that column: it decides, so the status region names no
       monitor beside it. */
    expect(runSentence(r.route.decision)).toBe('Allow with 2FA. HRMS access from corporate offices, Rule 1 · In a corporate office.')
    /* Which policy draws it with its pill and what Today says it would do —
       the stored rules, the same answer as the Decision. */
    const watch = standingWatch(r.cols)
    expect(watch.map((w) => `${w.policyName} ${w.decision}`)).toEqual(['HRMS access from corporate offices 2fa'])
    const row = whichPolicyRows(r.right.resolution, withMonitor, 'hrms', { substitute: r.right.spec.substitute, watching: watch }).on.find((x) => x.policyId === hrms.id)
    expect(row).toMatchObject({ kind: 'decides', monitoring: true, struck: false, watched: { decision: '2fa' } })
  })

  it('drops the monitor’s would-be decision from Which policy once the board edits it', () => {
    /* The stored rules would allow with 2FA; the edits deny. Beside a row that
       decides by the edits, the stored rules' answer would contradict the
       Decision. */
    const edited = { ...monitoring, rules: monitoring.rules.map((x) => ({ ...x, enabled: false })) }
    const r = run(monitoring, board(monitoring), edited, withMonitor)
    expect(r.views.map((v) => `${v.label} ${v.decision}`)).toEqual(['Today 1fa', 'Your edits deny'])
    expect(standingWatch(r.cols)).toEqual([])
    const row = whichPolicyRows(r.right.resolution, withMonitor, 'hrms', { substitute: r.right.spec.substitute, watching: standingWatch(r.cols) }).on.find(
      (x) => x.policyId === hrms.id,
    )
    expect(row).toMatchObject({ kind: 'decides', monitoring: true, watched: null })
  })

  it('gives no would-be decision to a policy that is only off', () => {
    const off = { ...hrms, status: 'inactive' as const }
    const r = run(off, board(off), off, t.policies.map((p) => (p.id === off.id ? off : p)))
    expect(standingWatch(r.cols)).toEqual([])
  })
})

describe('a monitor watching the board’s sign-in', () => {
  it('is said after the decision, from the column the route runs down', () => {
    /* The Global Default on the board, Kavya on HRMS, HRMS monitoring: the
       Global Default decides, and HRMS would decide differently. */
    const fallback = withMonitor.find((p) => p.isSystem)!
    const form = board(fallback, { personId: board(hrms).personId, appId: 'hrms' })
    const r = run(fallback, form, fallback, withMonitor)
    expect(r.views.map((v) => `${v.label} ${v.decision}`)).toEqual(['Live 1fa'])
    expect(runSentence(r.route.decision)).toBe(
      'Allow on 1 factor. Global Default Policy, Rule 1 · Corporate device, where we operate. Monitoring: HRMS access from corporate offices would allow with 2FA.',
    )
  })
})

describe('devices and risk', () => {
  const at = (risk: string) => run(devices, board(devices, { risk }))

  it('opens on Aisha, Google Workspace, the registered laptop and a risk of 12', () => {
    const f = board(devices)
    expect(f).toMatchObject({ personId: 'u-sales-1', appId: 'google-workspace', device: { kind: 'preset', id: 'win11-registered' }, risk: '12' })
  })

  it('gives 1 factor at 12, 2FA at 48 and deny at 86, one rule each', () => {
    expect([at('12'), at('48'), at('86')].map((r) => `${r.route.decision.decision} ${r.route.decision.line.split(' · ').slice(1, 2)}`)).toEqual([
      '1fa Rule 1',
      '2fa Rule 2',
      'deny Rule 3',
    ])
  })

  it('offers the Android version a compliant device needs', () => {
    const r = run(compliance, board(compliance, { device: { kind: 'preset', id: 'android-12' } }))
    expect(r.route.decision.decision).toBe('deny')
    expect(r.chips.map((c) => `${c.text} → ${c.decision}`)).toEqual(['Android OS version 13 → 1fa'])
  })

  it('stops on a ring where the device cannot be told, and lists both outcomes', () => {
    /* Android 14, then Edit details → Integrity "Not stated". */
    const { integrity: _stated, ...unstated } = androidFacts()
    const r = run(compliance, board(compliance, { device: { kind: 'custom', facts: unstated } }))
    expect(r.route.decision).toMatchObject({
      status: 'depends',
      outcomes: [
        { label: 'If rule 1 matches', decision: '1fa' },
        { label: 'If not', decision: 'deny' },
      ],
      needs: ['Device'],
    })
    expect(landed(r)).toBe(ruleStage(compliance.rules[0].id))
    expect(r.route.landingUnknown).toBe(true)
    expect(r.route.cards[compliance.rules[0].id].word).toBe("Can't tell")
    expect(runSentence(r.route.decision)).toBe('Depends. Allow on 1 factor or Deny.')
  })
})

/* The Android 14 phone's facts, as the preset states them. */
function androidFacts() {
  const f = board(compliance, { device: { kind: 'preset', id: 'android-14' } })
  return factsOf(f, t.zones).facts.device!
}

describe('an incomplete sign-in', () => {
  it('stops on Who with a ring when nobody is chosen', () => {
    const r = run(hrms, board(hrms, { personId: null }))
    expect(landed(r)).toBe('who')
    expect(r.route.landingUnknown).toBe(true)
    expect(r.route.who).toMatchObject({ value: 'Choose a person', word: "Can't tell" })
    expect(r.route.decision).toMatchObject({ status: 'incomplete', line: 'Choose a person' })
    expect(r.views[0]).toMatchObject({ status: 'incomplete', line: 'Choose a person', decision: null })
    expect(runSentence(r.route.decision)).toBe("Can't tell. Choose a person.")
    expect(r.chips).toEqual([])
  })

  it('stops on Which policy when no application is chosen', () => {
    const r = run(hrms, board(hrms, { appId: null }))
    expect(landed(r)).toBe('policy')
    expect(r.route.policy.value).toBe('Choose an application')
  })
})

describe('policy chips', () => {
  it('never offers an edit that lets the sign-in in more easily', () => {
    /* Rule 1 off: the board denies, and turning it back on would allow with
       2FA — looser, so it is not offered. */
    const draft = { ...hrms, rules: hrms.rules.map((x) => ({ ...x, enabled: false })) }
    const r = run(hrms, board(hrms), draft)
    expect(r.chips.filter((c) => c.kind === 'policy')).toEqual([])
  })

  it('offers switching on a stricter rule above the one that decided', () => {
    const block = rule({ name: 'Block everyone', enabled: false, decision: 'deny' })
    const draft = { ...hrms, rules: [block, ...hrms.rules] }
    const r = run(hrms, board(hrms), draft)
    const chip = r.chips.find((c) => c.kind === 'policy')
    expect(chip).toMatchObject({ text: 'Turn on rule 1', decision: 'deny', toast: 'Rule 1 switched on. Not saved yet.' })
    expect(chip?.rules?.[0].enabled).toBe(true)
  })

  it('offers adding the person’s group to a stricter rule that missed only on its Who', () => {
    const financeOnly = rule({
      name: 'Finance from the office',
      who: { groupIds: ['finance'], userIds: [] },
      when: when(card(cond('zone', 'in zone', ['corp-offices']))),
      decision: 'deny',
    })
    const draft = { ...hrms, rules: [financeOnly, ...hrms.rules] }
    const r = run(hrms, board(hrms), draft)
    expect(r.route.decision.decision).toBe('2fa')
    expect(r.chips.map((c) => `${c.kind} | ${c.text} → ${c.decision}`)).toEqual(['policy | Add Human Resources to rule 1 → deny'])
  })
})

describe('what the status region says on a step', () => {
  const r = run(hrms, board(hrms))

  it('names the stage, its value and its word, and a card’s lines', () => {
    expect(stageSentence(r.route, 1, hrms)).toBe('Which policy: This policy, Decides')
    expect(stageSentence(r.route, 2, hrms)).toBe('Who: Kavya Menon · Human Resources, In audience')
    expect(stageSentence(r.route, 3, hrms)).toMatch(/^Rule 1: Matched\. Who, Kavya Menon · Human Resources, Finance, Passes\. Network, 203\.0\.113\.24 · in/)
  })
})

describe('what a change is measured against', () => {
  it('moves when the answer moves, and not when only the route text does', () => {
    const office = run(hrms, board(hrms)).route
    const branch = run(hrms, board(hrms, originPatch('branch'))).route
    const home = run(hrms, board(hrms, originPatch('home'))).route
    expect(decisionSig(office.decision)).toBe(decisionSig(branch.decision))
    expect(decisionSig(office.decision)).not.toBe(decisionSig(home.decision))
  })
})

describe('the helpers behind the chips', () => {
  it('finds an address inside each kind of IP entry', () => {
    expect(addressInside('203.0.113.0/24')).toBe('203.0.113.10')
    expect(addressInside('198.51.100.20')).toBe('198.51.100.20')
    expect(addressInside('10.0.0.5-10.0.0.9')).toBe('10.0.0.5')
    expect(addressInside('192.0.2.4/31')).toBe('192.0.2.5')
    expect(addressInside('2001:db8::/32')).toBe('2001:db8::a')
    expect(addressInside('not an address')).toBeNull()
  })

  it('finds the next date on a weekday', () => {
    expect(nextWeekday('2026-09-28', 'Friday')).toBe('2026-10-02')
    expect(nextWeekday('2026-09-28', 'Monday')).toBe('2026-10-05')
    expect(nextWeekday('', 'Monday')).toBeNull()
  })
})
