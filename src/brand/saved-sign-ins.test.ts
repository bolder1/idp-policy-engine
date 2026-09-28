import { describe, expect, it } from 'vitest'

import { showcaseTenant, showcaseTenantHrmsOn, tenantAt } from './fixtures'
import { LEVEL_LABEL, LEVEL_PICKER_ORDER, SAVED_NAME_MAX, SIGN_IN_LEVELS } from './saved-sign-ins'
import { envOf, resolveSignIn } from './screens/tenant-resolver'

/* The seeded saved sign-ins are the guard's fixture. Four are promises about
   policies that are on, and pass today. Two are promises about HRMS as it
   will decide once it is on — Kavya in the office gets 2FA, Neha at home is
   refused — and HRMS opens Inactive (Phase 4), so today the Global Default
   decides both and they read Fail until HRMS is turned on or assumed on. A
   failure that is already there never opens the guard: only a check that
   passed and now fails can block, and only a Deny that is now let in counts
   as newly allowed (guard.ts, `checkOf`). Turning HRMS on moves both to Pass. */

const t = showcaseTenant()
const env = envOf(t)
const on = showcaseTenantHrmsOn()
const HRMS_PROMISES = ['ssi-kavya-office', 'ssi-neha-home']

describe('the showcase saved sign-ins', () => {
  it('are six, with unique ids and names that fit the save form', () => {
    expect(t.savedSignIns.map((s) => s.id)).toEqual([
      'ssi-kavya-office',
      'ssi-neha-home',
      'ssi-aisha-hrms',
      'ssi-devon-android',
      'ssi-ravi-hrms',
      'ssi-vikram-laptop',
    ])
    for (const s of t.savedSignIns) expect(s.name.length).toBeLessThanOrEqual(SAVED_NAME_MAX)
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
