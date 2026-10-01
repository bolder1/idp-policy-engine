import { describe, expect, it } from 'vitest'

import { blankPolicy, type Policy } from './data'
import { CHECK_KIND_WORDS, checksAsSignIns, guardSignIns, type DraftCheck } from './draft-checks'
import { showcaseTenantHrmsOn } from './fixtures'
import type { SavedSignIn } from './saved-sign-ins'
import { checkName, guardOpens, runGuard, type GuardKind } from './screens/guard'
import { envOf } from './screens/tenant-resolver'
import { devicePreset } from './screens/testing/device-presets'
import { factsOf, originPatch } from './screens/testing/sign-in-form'

/* -----------------------------------------------------------------------------
   A policy's own checks, as the guard reads them (describe spec, §8.3): notes
   named for their row, listed when a page opens, and never a reason to stop.
   -------------------------------------------------------------------------- */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const T = showcaseTenantHrmsOn()
const people = T.directory.people

/* Outlook on a compliant device, as Describe it writes it for the example. */
const at = (personId: string, device: 'android-14' | 'android-12') => ({
  personId,
  appId: 'outlook',
  network: { address: '203.0.113.24', source: 'stated' as const },
  when: { date: '2026-09-28', time: '09:30', timeZone: 'Asia/Kolkata', source: 'stated' as const },
  device: devicePreset(device).facts,
  risk: { score: 12, source: 'stated' as const },
})
const CHECKS: DraftCheck[] = [
  { id: 'pass', kind: 'pass', facts: at('priya', 'android-14'), expected: '1fa', phrase: 'a compliant device' },
  { id: 'stop', kind: 'stop', facts: at('priya', 'android-12'), expected: 'deny', phrase: 'a compliant device' },
  { id: 'you', kind: 'you', facts: at('jaspreet', 'android-14'), expected: '1fa' },
]

/* The Compliant devices example, saved: off, with its checks, first in the list. */
const compliance = T.policies.find((p) => p.id === 'sc-device-compliance')!
const stored: Policy = {
  ...blankPolicy('Microsoft Outlook and Dropbox on Compliant devices', ['outlook', 'dropbox']),
  id: 'p-described',
  status: 'inactive',
  rules: compliance.rules,
  fallback: compliance.fallback,
  modifiedBy: 'You',
  checks: CHECKS,
}
const policies = [stored, ...T.policies]
const env = envOf({ ...T, policies })

describe('checks as saved sign-ins', () => {
  it('are notes, named for their row and keyed under the policy', () => {
    const s = checksAsSignIns(stored, people, T.apps)
    expect(s.map((x) => [x.id, x.name, x.level, x.expected])).toEqual([
      ['p-described:pass', 'Priya Sharma on Microsoft Outlook · Should pass', 'note', '1fa'],
      ['p-described:stop', 'Priya Sharma on Microsoft Outlook · Should stop', 'note', 'deny'],
      ['p-described:you', 'Jaspreet Toor on Microsoft Outlook · You', 'note', '1fa'],
    ])
    expect(s.every((x) => x.savedBy === 'You' && x.savedAt === '' && x.generated === true)).toBe(true)
    expect(CHECK_KIND_WORDS['not-named']).toBe('Not named')
  })

  it('join the tenant’s own only with the flag on, and only for a policy that has some', () => {
    const saved = T.savedSignIns
    expect(guardSignIns(saved, stored, people, T.apps, false)).toBe(saved)
    expect(guardSignIns(saved, { ...stored, checks: undefined }, people, T.apps, true)).toBe(saved)
    expect(guardSignIns(saved, null, people, T.apps, true)).toBe(saved)
    const both = guardSignIns(saved, stored, people, T.apps, true)
    expect(both.slice(0, saved.length)).toEqual(saved)
    expect(both.slice(saved.length).map((x) => x.id)).toEqual(['p-described:pass', 'p-described:stop', 'p-described:you'])
  })
})

describe('Before turning on, with the policy’s checks', () => {
  const run = (checks: DraftCheck[], base: Policy = stored, level?: 'must-pass') => {
    const p = { ...base, checks }
    const list = base === stored ? policies : [p, ...T.policies]
    const signIns = guardSignIns(T.savedSignIns, p, people, T.apps, true)
    return runGuard({
      kind: 'turn-on',
      before: null,
      after: { ...p, status: 'active' },
      changedFrom: p,
      policies: list,
      env: base === stored ? env : envOf({ ...T, policies: list }),
      apps: T.apps,
      savedSignIns: level ? signIns.map((s) => (s.id.startsWith(`${p.id}:`) ? { ...s, level } : s)) : signIns,
      adminId: 'jaspreet',
      breakIn: null,
    })
  }

  it('lists them by name under Saved sign-ins, the admin’s under their own, and blocks on none', () => {
    const r = run(CHECKS)
    expect(r.saved.map(checkName)).toEqual(expect.arrayContaining(['Priya Sharma on Microsoft Outlook · Should pass', 'Priya Sharma on Microsoft Outlook · Should stop']))
    expect(r.protectedOwn.map(checkName)).toContain('Jaspreet Toor on Microsoft Outlook · You')
    expect(r.blocking).toEqual([])
  })

  /* Salesforce, which only the Global Default decides today: turning on a
     policy that refuses a device that is not compliant fails a check expecting
     today's answer — it passed, and now does not. The same sign-in at Must
     pass blocks, so it is the level alone that lets this one through. Today's
     answer is Allow with 2FA since the Global Default's baseline (30 Sep
     2026): an Android phone in India is not a corporate device, so OTP over
     Email; it was Allow on 1 factor before. */
  it('never blocks on one it newly fails, because a check is a note', () => {
    const salesforce: Policy = { ...stored, id: 'p-salesforce', appIds: ['salesforce'] }
    const wrong: DraftCheck = { ...CHECKS[1], id: 'not-named', kind: 'not-named', facts: { ...CHECKS[1].facts, appId: 'salesforce' }, expected: '2fa' }
    const r = run([wrong], salesforce)
    const c = r.saved.find((x) => x.signIn.id === 'p-salesforce:not-named')!
    expect([c.before.verdict, c.after.verdict, c.after.decision, c.regressed]).toEqual(['pass', 'fail', 'deny', true])
    expect(c.blocks).toBe(false)
    expect(r.blocking).toEqual([])
    const held = run([wrong], salesforce, 'must-pass')
    expect(held.blocking.map((x) => x.signIn.id)).toEqual(['p-salesforce:not-named'])
  })
})

describe('a save, with the policy’s checks', () => {
  /* HRMS from corporate offices, its zone loosened to the office network
     alone. Its Edge check — the office network, placed in London — goes from
     Deny to Allow with 2FA, and the modelled grid never places the office
     network in London, so nothing else says anybody is newly let in. */
  const hrms = T.policies.find((p) => p.id === 'sc-hrms-office')!
  const inLondon = factsOf(
    {
      personId: 'u-hr-1',
      appId: 'hrms',
      ...originPatch('office'),
      place: { kind: 'stated', placeId: 'gb-england-london' },
      date: '2026-09-28',
      time: '09:30',
      timeZone: 'Asia/Kolkata',
      device: { kind: 'preset', id: 'win11-registered' },
      risk: '12',
      assumeOn: null,
    },
    T.zones,
  ).facts
  const edge: DraftCheck = { id: 'edge', kind: 'edge', facts: inLondon, expected: 'deny', phrase: 'only from a corporate office' }
  const before: Policy = { ...hrms, checks: [edge] }
  const [first] = hrms.rules
  const zone = first.when.cards[0].conditions[0]
  const loosened: Policy = {
    ...before,
    rules: [{ ...first, when: { ...first.when, cards: [{ ...first.when.cards[0], conditions: [{ ...zone, scopes: { 'corp-offices': 'ip' } }] }] } }],
  }
  const list = T.policies.map((p) => (p.id === hrms.id ? before : p))
  const guard = (kind: GuardKind, savedSignIns: SavedSignIn[]) =>
    runGuard({ kind, before, after: loosened, changedFrom: before, policies: list, env: envOf({ ...T, policies: list }), apps: T.apps, savedSignIns, adminId: 'jaspreet', breakIn: null })

  it('lists a check newly let in, and opens no page for it', () => {
    const r = guard('save', [...guardSignIns([], before, people, T.apps, true)])
    const c = r.saved.find((x) => x.signIn.id === 'sc-hrms-office:edge')!
    expect([c.before.decision, c.after.decision]).toEqual(['deny', '2fa'])
    expect(r.whatChanges.counts.nowAllowed).toBe(0)
    expect([r.newlyAllowed, r.interrupt, guardOpens(r)]).toEqual([false, false, false])
  })

  it('opens one for the same sign-in when the tenant saved it', () => {
    const [own] = checksAsSignIns(before, people, T.apps)
    const { generated: _g, ...saved } = own
    const r = guard('save', [{ ...saved, id: 'ss-kavya-london' }])
    expect([r.newlyAllowed, r.interrupt, guardOpens(r)]).toEqual([true, true, true])
  })
})
