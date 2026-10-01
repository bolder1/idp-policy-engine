import { describe, expect, it } from 'vitest'

import { showcaseTenant, showcaseTenantHrmsOn, tenantAt } from './fixtures'
import { LEVEL_LABEL, LEVEL_PICKER_ORDER, SAVED_NAME_MAX, SIGN_IN_LEVELS } from './saved-sign-ins'
import { envOf, resolveSignIn } from './screens/tenant-resolver'

/* The seeded saved sign-ins are the guard's fixture. Fourteen are promises
   about policies that are on, or about the Global Default, and pass today.
   Two are promises about HRMS as it will decide once it is on — Kavya in the
   office gets 2FA, Neha at home is refused — and HRMS opens Inactive (Phase
   4), so today the Global Default decides both and they read Fail until HRMS
   is turned on or assumed on. A failure that is already there never opens
   the guard: only a check that passed and now fails can block, and only a
   Deny that is now let in counts as newly allowed (guard.ts, `checkOf`).
   Turning HRMS on moves both to Pass.

   Sixteen since 28 Sep 2026 (Policy testing V4 §5): the first six, one per
   thing the four policies decide, and ten more so that every policy's Tests
   dock opens on three or four of its own. The list is pinned whole, so a
   sign-in added or dropped is a decision somebody made here.

   Eighteen since 30 Sep 2026: the Global Default got a baseline (operating
   countries; a corporate laptop on a password, any other device adds OTP over
   Email; anywhere else is refused), and James Whitfield in Austin is the
   sign-in that shows its refusal.

   Twenty-seven the same evening: nine troubleshooting cases, one per way a
   person gets an answer they did not expect (two groups meeting two rules or
   two policies, a Deny first, an exception, a name, a group's policy before
   everyone's, a draft that would change nothing, nobody covering them). Each
   expects what the engine decides, so each passes on load too.

   Twenty-nine on 1 Oct 2026, the owner's own example ("Tanmay is in 2 groups
   … Engineering … password as first factor … Design … 2FA"): Tanmay Joshi on
   Box, where Box for engineering is higher in the list and lets him in on a
   password, and Ishita Banerjee, in Design alone, whom Box for design asks
   for 2FA. Both expect what the engine decides. */

const t = showcaseTenant()
const env = envOf(t)
const on = showcaseTenantHrmsOn()
const HRMS_PROMISES = ['ssi-kavya-office', 'ssi-neha-home']

describe('the showcase saved sign-ins', () => {
  it('are twenty-nine, with unique ids and names that fit the save form', () => {
    expect(t.savedSignIns.map((s) => s.id)).toEqual([
      'ssi-kavya-office',
      'ssi-neha-home',
      'ssi-aisha-hrms',
      'ssi-devon-android',
      'ssi-ravi-hrms',
      'ssi-vikram-laptop',
      'ssi-arun-office',
      'ssi-sofia-london',
      'ssi-tom-win10',
      'ssi-contractor-jira',
      'ssi-sanjay-iphone',
      'ssi-priya-mac',
      'ssi-ivy-android',
      'ssi-rahul-medium',
      'ssi-emily-high',
      'ssi-aisha-laptop',
      /* The dual-group troubleshooting case (TESTING-V4 §13). */
      'ssi-maya-github',
      /* The Global Default's refusal: outside the operating countries. */
      'ssi-james-austin',
      /* The troubleshooting cases (conflicts.ts, TESTING-V4 §13). */
      'ssi-maya-london',
      'ssi-maya-aws',
      'ssi-tom-aws',
      'ssi-devon-slack',
      'ssi-leo-slack',
      'ssi-leo-aws',
      'ssi-thomas-aws',
      'ssi-priya-github',
      'ssi-ravi-aws',
      /* The owner's two-group example (1 Oct 2026), on Box. */
      'ssi-tanmay-box',
      'ssi-ishita-box',
    ])
    for (const s of t.savedSignIns) expect(s.name.length).toBeLessThanOrEqual(SAVED_NAME_MAX)
    expect(new Set(t.savedSignIns.map((s) => s.name.toLowerCase())).size).toBe(t.savedSignIns.length)
  })

  /* So no policy's Saved sign-ins tab opens empty in the demo: two to four on every
     scenario policy's applications (V4 §5). More where the troubleshooting
     cases gather (§13): seven on GitHub and Jira (Developer tools, and the
     Code review draft beside it), five on AWS, which three policies share. */
  it('give every policy two or more of its own, and no more than the troubleshooting cases add', () => {
    const MOST: Record<string, number> = { 'sc-dev-tools': 7, 'sc-code-review-finance': 7, 'sc-aws-engineering': 5, 'sc-aws-finance': 5, 'sc-aws-devops': 5 }
    for (const p of t.policies.filter((x) => !x.isSystem)) {
      const own = t.savedSignIns.filter((s) => s.facts.appId !== undefined && p.appIds.includes(s.facts.appId))
      expect(own.length, p.id).toBeGreaterThanOrEqual(2)
      expect(own.length, p.id).toBeLessThanOrEqual(MOST[p.id] ?? 4)
    }
  })

  it('name a person and an application this tenant has', () => {
    for (const s of t.savedSignIns) {
      expect(t.directory.people.some((u) => u.id === s.facts.personId), s.id).toBe(true)
      expect(t.apps.some((a) => a.id === s.facts.appId), s.id).toBe(true)
    }
  })

  it('pass on load but for the two HRMS promises, each settled rather than lucky', () => {
    for (const s of t.savedSignIns) {
      const r = resolveSignIn(t.policies, s.facts, env)
      if (HRMS_PROMISES.includes(s.id)) expect(`${s.id}: ${r.status} ${r.decision}`).toBe(`${s.id}: decided 1fa`)
      else expect(`${s.id}: ${r.status} ${r.decision}`).toBe(`${s.id}: decided ${s.expected}`)
    }
    expect(t.savedSignIns.filter((s) => HRMS_PROMISES.includes(s.id)).map((s) => s.expected)).toEqual(['2fa', 'deny'])
  })

  it('all pass once HRMS is turned on', () => {
    for (const s of on.savedSignIns) {
      const r = resolveSignIn(on.policies, s.facts, envOf(on))
      expect(`${s.id}: ${r.status} ${r.decision}`).toBe(`${s.id}: decided ${s.expected}`)
    }
  })

  it('are decided where the scenarios say, today and once HRMS is on', () => {
    const by = (id: string, tenant = t) => {
      const s = tenant.savedSignIns.find((x) => x.id === id)!
      const r = resolveSignIn(tenant.policies, s.facts, envOf(tenant))
      return [r.decidedBy?.policyId, r.trace?.hitIndex ?? null]
    }
    expect(by('ssi-kavya-office')).toEqual(['global-default', 0])
    expect(by('ssi-neha-home')).toEqual(['global-default', 0])
    expect(by('ssi-kavya-office', on)).toEqual(['sc-hrms-office', 0])
    expect(by('ssi-neha-home', on)).toEqual(['sc-hrms-office', null])
    expect(by('ssi-aisha-hrms')).toEqual(['global-default', 0])
    expect(by('ssi-devon-android')).toEqual(['sc-device-compliance', null])
    expect(by('ssi-ravi-hrms')).toEqual(['global-default', 0])
    expect(by('ssi-vikram-laptop')).toEqual(['sc-corporate-devices', 0])
    /* The ten added for the test panel's tabs: each of Developer tools' answers and a
       contractor outside it, both of Device compliance's, and the other two
       risk bands and a laptop that is not a corporate one. */
    expect(by('ssi-arun-office')).toEqual(['sc-dev-tools', 0])
    expect(by('ssi-sofia-london')).toEqual(['sc-dev-tools', 1])
    expect(by('ssi-tom-win10')).toEqual(['sc-dev-tools', null])
    /* Not a corporate device (no Device Agent), so the Global Default's rule 2. */
    expect(by('ssi-contractor-jira')).toEqual(['global-default', 1])
    expect(by('ssi-sanjay-iphone')).toEqual(['sc-device-compliance', 0])
    expect(by('ssi-priya-mac')).toEqual(['sc-device-compliance', null])
    expect(by('ssi-ivy-android')).toEqual(['sc-device-compliance', 0])
    expect(by('ssi-rahul-medium')).toEqual(['sc-corporate-devices', 1])
    expect(by('ssi-emily-high')).toEqual(['sc-corporate-devices', 2])
    expect(by('ssi-aisha-laptop')).toEqual(['sc-corporate-devices', null])
    /* Austin is outside the operating countries: the Global Default's last row. */
    expect(by('ssi-james-austin')).toEqual(['global-default', null])
    /* The troubleshooting cases: each where conflicts.test.ts explains it. */
    expect(by('ssi-maya-github')).toEqual(['sc-dev-tools', 0])
    expect(by('ssi-maya-london')).toEqual(['sc-dev-tools', 1])
    expect(by('ssi-maya-aws')).toEqual(['sc-aws-engineering', 1])
    expect(by('ssi-tom-aws')).toEqual(['sc-aws-engineering', 1])
    expect(by('ssi-devon-slack')).toEqual(['sc-slack-engineering', 1])
    expect(by('ssi-leo-slack')).toEqual(['sc-slack-engineering', 1])
    expect(by('ssi-leo-aws')).toEqual(['sc-aws-engineering', 0])
    expect(by('ssi-thomas-aws')).toEqual(['sc-aws-finance', 0])
    expect(by('ssi-priya-github')).toEqual(['sc-dev-tools', 2])
    expect(by('ssi-ravi-aws')).toEqual(['global-default', 0])
    /* The owner's case: Engineering's Box policy is higher in the list; Design alone gets Design's. */
    expect(by('ssi-tanmay-box')).toEqual(['sc-box-engineering', 0])
    expect(by('ssi-ishita-box')).toEqual(['sc-box-design', 0])
  })

  it('use every level, and state every fact they give', () => {
    expect(new Set(t.savedSignIns.map((s) => s.level))).toEqual(new Set(SIGN_IN_LEVELS))
    for (const s of t.savedSignIns) {
      for (const source of [s.facts.network?.source, s.facts.when?.source, s.facts.device?.source, s.facts.risk?.source]) {
        if (source !== undefined) expect(source, s.id).toBe('stated')
      }
    }
  })

  it('belong to the showcase only', () => {
    /* The test estate is what the engine tests read; a sign-in seeded there
       would be a fixture nothing asked for. */
    expect(tenantAt('medium').savedSignIns).toEqual([])
  })
})

describe('levels', () => {
  it('are labelled in sentence case, strongest first', () => {
    expect(SIGN_IN_LEVELS.map((l) => LEVEL_LABEL[l])).toEqual(['Protected', 'Must pass', 'Note'])
  })

  it('are offered weakest first, the same three', () => {
    expect(LEVEL_PICKER_ORDER.map((l) => LEVEL_LABEL[l])).toEqual(['Note', 'Must pass', 'Protected'])
    expect(new Set(LEVEL_PICKER_ORDER)).toEqual(new Set(SIGN_IN_LEVELS))
  })
})
