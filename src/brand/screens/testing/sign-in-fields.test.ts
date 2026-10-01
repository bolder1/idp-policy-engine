import { describe, expect, it } from 'vitest'

import { FACT_WORDS } from '../../decision-words'
import { showcaseTenant } from '../../fixtures'
import { devicePreset } from './device-presets'
import { DEVICE_ROWS } from './rows-read'
import {
  DETAIL_OPTIONS,
  FIELD_OF_FACT,
  IN_POLICY,
  NOT_IN_POLICY,
  addressSource,
  deviceFactsOf,
  deviceValue,
  detailValue,
  distanceNow,
  edgesText,
  fieldRowId,
  personOptions,
  placeOfValue,
  placeOptions,
  placeSource,
  placeSummary,
  placeValue,
  riskUnmeasured,
  rulerReading,
  valueText,
  withDetail,
  withDevice,
  withVersion,
} from './sign-in-fields'
import { CHANGED_BY_WORDS, defaultBoardForm, factsOf, originPatch, typedAddressPatch, type SignInForm } from './sign-in-form'

/* What the sign-in rows say, on the showcase tenant (Spec A §A.4, the final
   spec's row table). */

const t = showcaseTenant()
const hrms = t.policies.find((p) => p.id === 'sc-hrms-office')!
const form = (patch: Partial<SignInForm> = {}) => ({ ...defaultBoardForm(hrms, t.directory.people, t.apps, '2026-09-28'), ...patch })
const facts = (f: SignInForm) => factsOf(f, t.zones).facts

describe('finding the row a fact is stated on', () => {
  it('sends every "Needs:" word to the row that change is named by', () => {
    /* "Needs: IP address" goes to the row whose change reads "Changed by IP
       address": every fact on one row has that row's one word, and "Changed
       by" says the same word mid-sentence. */
    const mid = (w: string) => ({ When: 'time', 'Device risk score': 'risk score' })[w] ?? w.toLowerCase()
    const wordOfRow = new Map<string, string>()
    for (const key of Object.keys(FACT_WORDS) as (keyof typeof FACT_WORDS)[]) {
      const row = FIELD_OF_FACT[key]
      expect(`${key} → ${wordOfRow.get(row) ?? FACT_WORDS[key]}`).toBe(`${key} → ${FACT_WORDS[key]}`)
      wordOfRow.set(row, FACT_WORDS[key])
      expect(`${key} → ${CHANGED_BY_WORDS[row].toLowerCase()}`).toBe(`${key} → ${mid(FACT_WORDS[key])}`)
    }
    expect(fieldRowId('page', FIELD_OF_FACT['location.city'])).toBe('page-place')
  })
})

describe('the person picker', () => {
  it('puts the people a policy is for first, under their own heading, each with their group', () => {
    const opts = personOptions(t.directory.people, t.groups, hrms.audience)
    const firstOut = opts.findIndex((o) => o.group === NOT_IN_POLICY)
    expect(opts.slice(0, firstOut).every((o) => o.group === IN_POLICY)).toBe(true)
    expect(opts.slice(firstOut).every((o) => o.group === NOT_IN_POLICY)).toBe(true)
    expect(opts.find((o) => o.value === 'u-hr-1')).toEqual({ value: 'u-hr-1', label: 'Kavya Menon', meta: 'Human Resources', group: IN_POLICY })
    expect(opts.find((o) => o.value === 'u-sales-1')?.group).toBe(NOT_IN_POLICY)
  })

  it('lists the directory as it is when there is no policy to sort by', () => {
    expect(personOptions(t.directory.people, t.groups).map((o) => o.value)).toEqual(t.directory.people.map((u) => u.id))
  })
})

describe('the address and the place', () => {
  it('says a chip is stated and typing is typed', () => {
    expect(addressSource(form())).toBe('stated')
    expect(addressSource(form(typedAddressPatch('192.0.2.50')))).toBe('typed')
    expect(addressSource(form(typedAddressPatch('')))).toBeNull()
  })

  it('says what the sample table gave for the address, or why it gave nothing', () => {
    const says = (f: SignInForm) => [placeSummary(f, facts(f)), placeSource(f, facts(f))]
    expect(says(form())).toEqual(['From IP address · Pune, India', 'looked up'])
    expect(says(form(originPatch('tor')))).toEqual(['From IP address · no place', null])
    expect(says(form(typedAddressPatch('10.1.2.3')))).toEqual(['From IP address · not in the sample table', null])
    expect(says(form(typedAddressPatch('')))).toEqual(['From IP address', null])
  })

  it('names a stated place and a ruler point, both stated', () => {
    const pune = form({ place: { kind: 'stated', placeId: 'in-maharashtra-pune' } })
    expect([placeSummary(pune, facts(pune)), placeSource(pune, facts(pune))]).toEqual(['Pune, India', 'stated'])
    const ruler = form({ place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km: 30 } })
    expect([placeSummary(ruler, facts(ruler)), placeSource(ruler, facts(ruler))]).toEqual(['30 km from Pune', 'stated'])
  })

  it('offers the address first, then cities, and reads its own values back', () => {
    const opts = placeOptions()
    expect(opts[0]).toEqual({ value: 'from-address', label: 'From IP address' })
    const pune = opts.find((o) => o.label === 'Pune, India')!
    expect(pune.meta).toBe('City · Maharashtra, India')
    expect(placeOfValue(pune.value)).toEqual({ kind: 'stated', placeId: 'in-maharashtra-pune' })
    expect(placeValue(placeOfValue(pune.value))).toBe(pune.value)
    expect(placeOfValue('from-address')).toEqual({ kind: 'from-address' })
  })

  it('stands the ruler where the sign-in is, or where it was put', () => {
    expect(distanceNow(form(), facts(form()), t.zones, 'corp-offices', 0)).toBe(0)
    const branch = form(originPatch('branch'))
    expect(distanceNow(branch, facts(branch), t.zones, 'corp-offices', 0)).toBeGreaterThan(600)
    const ruler = form({ place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km: 30 } })
    expect(distanceNow(ruler, facts(ruler), t.zones, 'corp-offices', 0)).toBe(30)
    expect(distanceNow(form(originPatch('tor')), facts(form(originPatch('tor'))), t.zones, 'corp-offices', 0)).toBeNull()
  })
})

describe('the device', () => {
  it('reads a preset, nothing, and a custom device', () => {
    expect(deviceValue({ kind: 'none' })).toBe('none')
    expect(deviceValue({ kind: 'preset', id: 'iphone' })).toBe('iphone')
    expect(deviceValue({ kind: 'custom', facts: { source: 'stated' } })).toBeNull()
    expect(deviceFactsOf({ kind: 'none' })).toEqual({ source: 'stated' })
  })

  it('becomes custom when a detail is edited, and a preset again when it lands on one', () => {
    const laptop = devicePreset('win11-registered').facts
    const moved = withDevice(withDetail(laptop, 'registered', 'no'))
    expect(moved).toEqual({ kind: 'preset', id: 'win11-unregistered' })
    const custom = withDevice(withDetail(laptop, 'os-version', '10.0.26100'))
    expect(custom.kind).toBe('custom')
  })

  it('reads every detail back as it was set, for every choice offered', () => {
    const base = devicePreset('android-12').facts
    for (const row of DEVICE_ROWS) {
      for (const o of DETAIL_OPTIONS[row] ?? []) expect(`${row}=${detailValue(withDetail(base, row, o.value), row)}`).toBe(`${row}=${o.value}`)
    }
  })

  it('keeps not stated apart from reports none', () => {
    const base = devicePreset('android-12').facts
    expect(withDetail(base, 'screen-lock', '').screenLock).toBeUndefined()
    expect(withDetail(base, 'screen-lock', 'unreported').screenLock).toBeNull()
    expect(withDetail(base, 'authenticator', 'absent').authenticatorVersion).toBeNull()
    expect('authenticatorVersion' in withDetail(base, 'authenticator', '')).toBe(false)
  })

  it('fills in a version for Installed, and takes a typed one', () => {
    const none = devicePreset('win11-no-agent').facts
    expect(withDetail(none, 'agent', 'installed')).toMatchObject({ agentInstalled: true, agentVersion: '4.3' })
    expect(withVersion(withDetail(none, 'agent', 'installed'), 'agent', '4.1')).toMatchObject({ agentInstalled: true, agentVersion: '4.1' })
    expect(withDetail(none, 'registered-count', '12').registeredCount).toBe(10)
  })

  it('keeps a component installed when its version is cleared, on both rows', () => {
    /* The version box shows only while the row reads Installed, so a blank
       that turned the row to Not stated took the box away mid-edit. */
    for (const row of ['authenticator', 'agent'] as const) {
      const cleared = withVersion(withDetail({ source: 'stated' }, row, 'installed'), row, '  ')
      expect(`${row}=${detailValue(cleared, row)}`).toBe(`${row}=installed`)
    }
    expect(withVersion({ source: 'stated' }, 'authenticator', '').authenticatorVersion).toBe('')
    expect(withVersion({ source: 'stated' }, 'agent', '')).toEqual({ source: 'stated', agentInstalled: true })
  })

  it('says a risk score on a laptop was not measured', () => {
    expect(riskUnmeasured({ kind: 'preset', id: 'win11-registered' })).toBe(true)
    expect(riskUnmeasured({ kind: 'preset', id: 'android-12' })).toBe(false)
    expect(riskUnmeasured({ kind: 'none' })).toBe(false)
  })
})

describe('the distance ruler', () => {
  const ruler = {
    centre: 'Pune',
    max: 100,
    bands: [
      { from: 0, to: 25, decision: '2fa' as const },
      { from: 26, to: 100, decision: 'deny' as const },
    ],
  }

  it('says the distance and the band where the band is the sign-in’s answer', () => {
    expect(rulerReading({ ...ruler, now: 0, agrees: true })).toEqual({ at: 0, value: '0 km from Pune', valueText: '0 km from Pune, Allow with 2FA', placed: true })
    expect(rulerReading({ ...ruler, now: 25, agrees: true }).valueText).toBe('25 km from Pune, Allow with 2FA')
  })

  it("says Can't tell, and announces no band, when the place has no point to measure", () => {
    expect(rulerReading({ ...ruler, now: null, agrees: false })).toEqual({ at: 0, value: "Can't tell", valueText: "Can't tell", placed: false })
  })

  it('says the real distance past the end, with the thumb held there', () => {
    expect(rulerReading({ ...ruler, now: 1180, agrees: true })).toEqual({ at: 100, value: '1180 km from Pune', valueText: '1180 km from Pune, Deny', placed: true })
  })

  it('announces no band where the zone takes the place by name', () => {
    /* Bengaluru: 728 km out and in the zone's city list, so 2FA where the band says Deny. */
    expect(rulerReading({ ...ruler, now: 728, agrees: false })).toEqual({ at: 100, value: '728 km from Pune', valueText: '728 km from Pune', placed: false })
  })
})

describe('what a slider announces', () => {
  const bands = [
    { from: 0, to: 39, decision: '1fa' as const },
    { from: 40, to: 70, decision: '2fa' as const },
    { from: 71, to: 100, decision: null },
  ]

  it('says the value and the decision there', () => {
    expect(valueText(48, bands)).toBe('48, Allow with 2FA')
    expect(valueText(86, bands)).toBe("86, Can't tell")
    expect(valueText(30, bands, ' km')).toBe('30 km, Allow on 1 factor')
    expect(valueText(5, undefined)).toBe('5')
  })

  it('names the printed edges', () => {
    expect(edgesText([40, 71])).toBe('Boundaries 40 and 71')
    expect(edgesText(['25 km'])).toBe('Boundary 25 km')
    expect(edgesText([])).toBe('')
  })
})
