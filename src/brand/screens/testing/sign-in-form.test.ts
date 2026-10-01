import { describe, expect, it } from 'vitest'

import type { Zone } from '../../data'
import { showcaseTenantHrmsOn, tenantAt } from '../../fixtures'
import { haversineKm } from '../../places'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { DEVICE_PRESETS } from './device-presets'
import {
  ADDRESS_ERROR,
  CHANGED_BY_WORDS,
  RISK_ERROR,
  changedBy,
  defaultBoardForm,
  defaultForm,
  factsOf,
  formOf,
  formSummary,
  originPatch,
  todayIn,
  typedAddressPatch,
  type SignInForm,
} from './sign-in-form'

/* The form, run through the Phase 0 evaluator on the showcase tenant. The
   decisions pinned here are the ones the testing specs quote, so a form that
   stated a fact differently would show up as a scene that changed. */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const TODAY = '2026-09-28'
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const board = (id: string) => defaultBoardForm(policy(id), t.directory.people, t.apps, TODAY)
const run = (f: SignInForm) => resolveSignIn(t.policies, factsOf(f, t.zones).facts, env)
const hrms = board('sc-hrms-office')

describe('where the board starts', () => {
  it('picks somebody the policy is for, on its first application', () => {
    expect([hrms.personId, hrms.appId]).toEqual(['u-hr-1', 'hrms'])
    expect([board('sc-corporate-devices').personId, board('sc-corporate-devices').appId]).toEqual(['u-sales-1', 'google-workspace'])
    /* Everyone: the first person in the directory. */
    expect([board('sc-device-compliance').personId, board('sc-device-compliance').appId]).toEqual(['priya', 'outlook'])
  })

  it('is the office at half past nine today, on the registered laptop at low risk', () => {
    expect(hrms).toMatchObject({
      origin: 'office',
      address: '203.0.113.24',
      addressSource: 'stated',
      place: { kind: 'from-address' },
      date: TODAY,
      time: '09:30',
      timeZone: 'Asia/Kolkata',
      device: { kind: 'preset', id: 'win11-registered' },
      risk: '12',
      assumeOn: null,
    })
  })

  it('falls back to the first application for a policy with none', () => {
    const f = defaultBoardForm({ ...policy('sc-hrms-office'), appIds: [] }, t.directory.people, t.apps, TODAY)
    expect(f.appId).toBe(t.apps[0].id)
  })
})

describe('where the testing views start', () => {
  it('opens on Kavya Menon on HRMS from the office, with no device or risk stated', () => {
    expect(defaultForm(t.directory.people, t.apps, TODAY)).toMatchObject({
      personId: 'u-hr-1',
      appId: 'hrms',
      address: '203.0.113.24',
      date: TODAY,
      time: '09:30',
      device: { kind: 'none' },
      risk: '',
    })
  })

  it('states nothing it cannot mean on a tenant without her', () => {
    const legacy = tenantAt('medium')
    const f = defaultForm(legacy.directory.people, legacy.apps, TODAY)
    expect([f.personId, f.appId]).toEqual([legacy.directory.people[0].id, legacy.apps[0].id])
    expect([f.address, f.time, f.risk, f.device.kind]).toEqual(['', '', '', 'none'])
  })
})

describe('factsOf', () => {
  it('states the office address and leaves the place to be looked up', () => {
    const { facts, issues } = factsOf(hrms, t.zones)
    expect(issues).toEqual([])
    expect(facts.network).toEqual({ address: '203.0.113.24', source: 'stated' })
    expect(facts.location).toBeUndefined()
    expect(facts.when).toEqual({ date: TODAY, time: '09:30', timeZone: 'Asia/Kolkata', source: 'stated' })
    expect(facts.device?.source).toBe('stated')
    expect(facts.risk).toEqual({ score: 12, source: 'stated' })
    const r = run(hrms)
    expect([r.decidedBy?.policyId, r.decision, r.trace?.hitIndex]).toEqual(['sc-hrms-office', '2fa', 0])
  })

  it('says a typed address was typed, and a home address is refused', () => {
    const f = { ...hrms, ...typedAddressPatch('192.0.2.10') }
    expect(factsOf(f, t.zones).facts.network).toEqual({ address: '192.0.2.10', source: 'typed' })
    expect(run(f).decision).toBe('deny')
  })

  it('sends a malformed address anyway, and says what is wrong with it', () => {
    /* Dropping it would answer as though no address was given. The engine
       reads it as undecided, which is Can't tell, never a pass. */
    const f = { ...hrms, ...typedAddressPatch('192.0.2.999') }
    const { facts, issues } = factsOf(f, t.zones)
    expect(facts.network?.address).toBe('192.0.2.999')
    expect(issues).toEqual([{ field: 'address', message: ADDRESS_ERROR }])
    expect(run(f).status).toBe('depends')
  })

  it('refuses a Tor exit: the network half fails whatever the place', () => {
    expect(run({ ...hrms, ...originPatch('tor') }).decision).toBe('deny')
    expect(run({ ...hrms, ...originPatch('branch') }).decision).toBe('2fa')
  })

  const at = (km: number): SignInForm => ({ ...hrms, place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km } })

  it('puts a ruler point due north of the range, named for it', () => {
    const place = factsOf(at(30), t.zones).facts.location
    expect(place).toMatchObject({ country: 'India', state: 'Maharashtra', city: '30 km from Pune', lon: 73.9, source: 'stated' })
    expect(place?.lat).toBeCloseTo(18.5 + 30 / 111.19508, 6)
    expect(run(at(20)).decision).toBe('2fa')
    expect(run(at(30)).decision).toBe('deny')
  })

  it('measures a ruler point back to the distance it was stated at, so the edge is inside', () => {
    /* Placed with one radius and measured with another, "25 km" came back as
       25.000018 and a sign-in exactly at the 25 km edge was denied. */
    const pune = t.zones.find((z) => z.id === 'corp-offices')!.location.ranges[0]
    for (const km of [1, 25, 100, 400]) {
      const p = factsOf(at(km), t.zones).facts.location!
      expect(haversineKm({ lat: p.lat!, lon: p.lon! }, pune)).toBeCloseTo(km, 9)
    }
    expect(run(at(25)).decision).toBe('2fa')
    expect(run(at(26)).decision).toBe('deny')
  })

  it('states a catalogue place in place of the looked-up one', () => {
    const f: SignInForm = { ...hrms, place: { kind: 'stated', placeId: 'in-maharashtra-pune' } }
    expect(factsOf(f, t.zones).facts.location).toMatchObject({ city: 'Pune', source: 'stated' })
  })

  it('reads the risk score as typed, 0 to 100 only', () => {
    const risk = (r: string) => factsOf({ ...hrms, risk: r }, t.zones)
    expect(risk('48').facts.risk).toEqual({ score: 48, source: 'stated' })
    expect(risk(' 0 ').facts.risk).toEqual({ score: 0, source: 'stated' })
    for (const bad of ['101', '-1', '4.5', 'high']) {
      expect(risk(bad).facts.risk).toBeUndefined()
      expect(risk(bad).issues).toEqual([{ field: 'risk', message: RISK_ERROR }])
    }
    expect(risk('').issues).toEqual([])
    expect(risk('').facts.risk).toBeUndefined()
  })

  it('steps up and denies on the corporate-devices bands', () => {
    const f = board('sc-corporate-devices')
    expect(['12', '48', '86'].map((risk) => run({ ...f, risk }).decision)).toEqual(['1fa', '2fa', 'deny'])
  })

  it('states the hour without a day, and nothing at all without an hour', () => {
    expect(factsOf({ ...hrms, date: '' }, t.zones).facts.when).toEqual({ time: '09:30', timeZone: 'Asia/Kolkata', source: 'stated' })
    expect(factsOf({ ...hrms, time: '' }, t.zones).facts.when).toBeUndefined()
  })

  it('states no device and no person it was not given', () => {
    const { facts } = factsOf({ ...hrms, personId: null, device: { kind: 'none' } }, t.zones)
    expect('personId' in facts).toBe(false)
    expect('device' in facts).toBe(false)
    expect(run({ ...hrms, personId: null }).status).toBe('incomplete')
  })
})

describe('formOf', () => {
  const back = (f: SignInForm, zones: readonly Zone[] = t.zones) => formOf(factsOf(f, t.zones).facts, zones)

  it('gives back the form the facts came from', () => {
    for (const p of DEVICE_PRESETS) {
      const f: SignInForm = { ...hrms, device: { kind: 'preset', id: p.id } }
      expect(back(f)).toEqual(f)
    }
  })

  it('calls an edited preset a custom device', () => {
    const vikram = t.savedSignIns.find((s) => s.id === 'ssi-vikram-laptop')!
    const f = formOf(vikram.facts, t.zones)
    expect(f.device.kind).toBe('custom')
    expect([f.risk, f.address, f.origin]).toEqual(['12', '', null])
    expect(run(f).decision).toBe('1fa')
  })

  it('puts a ruler point back on the ruler, so a saved Deny is still Deny', () => {
    /* Kavya 30 km out is refused; looked up from the office address again,
       she would be asked for 2FA, and Try would contradict the saved row. */
    for (const km of [0, 20, 25, 30, 75]) {
      const f: SignInForm = { ...hrms, place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km } }
      expect(back(f)).toEqual(f)
      expect(run(back(f)).decision).toBe(run(f).decision)
    }
    expect(run(back({ ...hrms, place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km: 30 } })).decision).toBe('deny')
  })

  it('carries a ruler point whose range has moved as it was stated', () => {
    const f: SignInForm = { ...hrms, place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km: 30 } }
    const stated = factsOf(f, t.zones).facts
    const moved = t.zones.map((z) =>
      z.id === 'corp-offices' ? { ...z, location: { ...z.location, ranges: z.location.ranges.map((r) => ({ ...r, lat: r.lat + 1 })) } } : z,
    )
    const g = formOf(stated, moved)
    expect(g.place).toEqual({ kind: 'custom', facts: stated.location })
    expect(factsOf(g, moved).facts.location).toEqual(stated.location)
    /* Deny against the zones it was saved under, as the saved row reads. */
    expect(resolveSignIn(t.policies, factsOf(g, moved).facts, env).decision).toBe('deny')
  })

  it('keeps a stated catalogue place', () => {
    const f: SignInForm = { ...hrms, place: { kind: 'stated', placeId: 'in-maharashtra-pune' } }
    expect(back(f).place).toEqual(f.place)
  })

  it('looks the place up again only when none was stated', () => {
    expect(back(hrms).place).toEqual({ kind: 'from-address' })
  })
})

describe('formSummary', () => {
  it('says the testing views’ first sign-in as the spec does', () => {
    expect(formSummary(defaultForm(t.directory.people, t.apps, TODAY), t.zones)).toBe(
      '203.0.113.24 · Pune (looked up) · 28 Sep 2026 09:30 Asia/Kolkata · Device not stated · Risk not stated',
    )
  })

  it('names a preset, a custom device and a stated risk', () => {
    expect(formSummary(hrms, t.zones)).toBe(
      '203.0.113.24 · Pune (looked up) · 28 Sep 2026 09:30 Asia/Kolkata · Windows 11 laptop · registered · Risk 12',
    )
    const vikram = t.savedSignIns.find((s) => s.id === 'ssi-vikram-laptop')!
    expect(formSummary(formOf(vikram.facts, t.zones), t.zones)).toContain(' · Custom device · Risk 12')
  })

  it('says the place the evaluator reads, and why there is none', () => {
    const say = (f: Partial<SignInForm>) => formSummary({ ...hrms, ...f }, t.zones).split(' · ')[1]
    expect(say({ place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km: 30 } })).toBe('30 km from Pune')
    expect(say({ place: { kind: 'stated', placeId: 'in-karnataka-bengaluru' } })).toBe('Bengaluru')
    expect(say(originPatch('tor'))).toBe('No place')
    expect(say(typedAddressPatch('10.0.0.1'))).toBe('Not in the sample table')
    expect(formSummary({ ...hrms, ...typedAddressPatch('') }, t.zones)).toMatch(/^IP address not stated · Place not stated · /)
  })

  it('states the hour without a day, and says when nothing is', () => {
    expect(formSummary({ ...hrms, date: '' }, t.zones).split(' · ')[2]).toBe('09:30 Asia/Kolkata')
    expect(formSummary({ ...hrms, time: '' }, t.zones).split(' · ')[2]).toBe('When not stated')
  })
})

describe('changedBy', () => {
  it('names the first field that moved, in form order', () => {
    expect(changedBy(hrms, hrms)).toBeNull()
    expect(changedBy(hrms, { ...hrms, ...typedAddressPatch('192.0.2.10') })).toBe('address')
    expect(changedBy(hrms, { ...hrms, risk: '48', place: { kind: 'stated', placeId: 'in-maharashtra-pune' } })).toBe('place')
    expect(changedBy(hrms, { ...hrms, device: { kind: 'preset', id: 'win10' } })).toBe('device')
    expect(changedBy(hrms, { ...hrms, assumeOn: 'sc-hrms-office' })).toBe('assume-on')
  })

  it('says each field by the word its fact is said in, mid-sentence', () => {
    expect(CHANGED_BY_WORDS).toEqual({
      person: 'person',
      app: 'application',
      address: 'IP address',
      place: 'place',
      when: 'time',
      device: 'device',
      risk: 'risk score',
      'assume-on': 'turning it on',
      edits: 'your edits',
    })
  })
})

describe('todayIn', () => {
  it('is the date where the tenant is, not where the machine is', () => {
    /* 20:00 UTC on the 25th is 01:30 on the 26th in Pune. */
    expect(todayIn('Asia/Kolkata', new Date('2026-09-25T20:00:00Z'))).toBe('2026-09-26')
    expect(todayIn('UTC', new Date('2026-09-25T20:00:00Z'))).toBe('2026-09-25')
  })
})
