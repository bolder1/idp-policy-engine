import { describe, expect, it } from 'vitest'

import type { Zone } from '../data'
import type { FingerprintProfile } from '../fingerprint'
import { riskProfilesAt, showcaseTenant, showcaseTenantHrmsOn } from '../fixtures'
import { groupSections } from '../review-rows'
import { checkOf, type Reading } from './guard'
import {
  LIBRARY_STOP,
  USE_STOP,
  fixWithUndo,
  libraryChecked,
  libraryLines,
  profileGuard,
  riskGuard,
  stopLine,
  switchLines,
  zoneCandidates,
  zoneGuard,
  zoneRestored,
  type FixPage,
  type FixToast,
  type LibraryTenant,
} from './library-guard'
import { envOf } from './tenant-resolver'
import { whatChangesSaid } from './what-changes'

/* -----------------------------------------------------------------------------
   The checks before a zone, a device profile or the risk profile in use is
   saved (final spec D.6, D3) — pinned on the showcase tenant, with the rows
   Review changes files under Also changes.

   A9 moves HRMS, so these run on the tenant once HRMS is turned on; the seed
   opens with it Inactive (Phase 4), and the first scene says what that
   leaves a zone save to check.
   -------------------------------------------------------------------------- */

const t = showcaseTenantHrmsOn()
const env = envOf(t)
const tenant: LibraryTenant = { policies: t.policies, env, apps: t.apps, savedSignIns: t.savedSignIns, adminId: 'jaspreet' }
const OFFICES = t.zones.find((z) => z.id === 'corp-offices')!
const INDIA = t.zones.find((z) => z.id === 'india')!
const COMPLIANT = t.fingerprints.find((p) => p.id === 'fp-compliant')!
const withoutOfficeBlock: Zone = { ...OFFICES, ip: OFFICES.ip.filter((x) => x !== '203.0.113.0/24') }
const NOTHING = { nowAllowed: 0, nowOn1Factor: 0, nowAskedFor2fa: 0, nowDenied: 0 }

describe('saving a zone', () => {
  it('reads only the policies that are on: with HRMS off, as the seed opens, Developer tools alone, and nothing stops the save', () => {
    const seed = showcaseTenant()
    const g = zoneGuard({ ...tenant, policies: seed.policies, env: envOf(seed) }, OFFICES, withoutOfficeBlock)
    expect(g.policies.map((p) => p.name)).toEqual(['Developer tools — office and device checks'])
    expect(g.whatChanges?.appNames).toEqual(['GitHub Enterprise', 'Jira'])
    expect(g.blocking).toEqual([])
  })

  it('lists the enforcing policies that name it, and one line of what moves where they decide (A9)', () => {
    const g = zoneGuard(tenant, OFFICES, withoutOfficeBlock)
    expect(g.policies.map((p) => p.name)).toEqual(['HRMS access from corporate offices', 'Developer tools — office and device checks'])
    // Each application swept once, each modelled sign-in counted once.
    expect(g.whatChanges?.appNames).toEqual(['HRMS', 'GitHub Enterprise', 'Jira'])
    expect(whatChangesSaid(g.whatChanges!)).toBe('Of 1,080 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 24 · Now denied 18')
  })

  it('stops the save for a Must pass that now fails, with the ready fix (A9)', () => {
    const g = zoneGuard(tenant, OFFICES, withoutOfficeBlock)
    expect(g.checks.map((c) => c.signIn.id)).toEqual(['ssi-kavya-office'])
    expect(g.blocking.map((c) => c.signIn.id)).toEqual(['ssi-kavya-office'])
    expect(stopLine(g)).toBe('Kavya Menon in the office must pass and would get Deny.')
    expect(g.fix?.label).toBe('Keep 203.0.113.0/24')
    // The fix puts the network back where it stood, and the review re-runs clean.
    expect(g.fix?.value.ip).toEqual(OFFICES.ip)
    expect(zoneRestored(OFFICES, g.fix!.value)).toBe(true)
    const again = zoneGuard(tenant, OFFICES, g.fix!.value)
    expect(again.blocking).toEqual([])
    expect(again.checks).toEqual([])
  })

  it('files the rows under Also changes as spec D §3.5 draws them: Active policies, What changes, then the sign-in under Fails', () => {
    const lines = libraryLines(zoneGuard(tenant, OFFICES, withoutOfficeBlock))
    expect(lines).toEqual([
      {
        label: 'Active policies',
        before: '',
        after: 'HRMS access from corporate offices, Developer tools — office and device checks',
        effect: true,
      },
      { label: 'What changes', before: '', after: 'Of 1,080 modelled sign-ins: Now allowed 0 · Now on 1 factor 0 · Now asked for 2FA 24 · Now denied 18', effect: true },
      {
        label: 'Kavya Menon in the office · Must pass',
        before: 'Allow with 2FA',
        // The deciding policy is not said again: Active policies names it.
        after: 'Deny · expected Allow with 2FA',
        effect: true,
        check: 'fail',
        signInId: 'ssi-kavya-office',
      },
    ])
    const [also] = groupSections(lines)
    expect(also.effect).toBe(true)
    expect(also.blocks.map((b) => [b.kind, b.rows.length])).toEqual([
      ['effect', 2],
      ['fail', 1],
    ])
  })

  it('lists a note that moves, and never stops the save for it', () => {
    const g = zoneGuard(tenant, OFFICES, { ...OFFICES, ip: [...OFFICES.ip, '192.0.2.0/24'] })
    expect(g.checks.map((c) => [c.signIn.name, c.after.verdict, c.blocks])).toEqual([['Neha Kapoor at home', 'fail', false]])
    expect(g.blocking).toEqual([])
    expect(g.fix).toBeNull()
    expect(stopLine(g)).toBeNull()
  })

  it('puts the sign-ins that stop the save ahead of the notes that fail beside them', () => {
    /* A note named to sort first: by name alone it would take the Fails
       block's first row, and a long review's trim would keep it over the
       blocker. */
    const early = t.savedSignIns.map((s) => (s.id === 'ssi-neha-home' ? { ...s, name: 'Aarav at home' } : s))
    const g = zoneGuard({ ...tenant, savedSignIns: early }, OFFICES, { ...withoutOfficeBlock, ip: [...withoutOfficeBlock.ip, '192.0.2.0/24'] })
    expect(g.checks.map((c) => [c.signIn.name, c.blocks])).toEqual([
      ['Kavya Menon in the office', true],
      ['Aarav at home', false],
    ])
    expect(libraryLines(g).slice(2).map((l) => l.label)).toEqual(['Kavya Menon in the office · Must pass', 'Aarav at home'])
  })

  it('adds no rows for an edit that moves nothing, and nothing for a zone no enforcing policy names', () => {
    const renamed = zoneGuard(tenant, OFFICES, { ...OFFICES, name: 'Offices' })
    expect(renamed.checks).toEqual([])
    expect(renamed.whatChanges?.counts).toEqual(NOTHING)
    // A rename gains no Also changes section of all-zero lines.
    expect(libraryLines(renamed)).toEqual([])
    expect(zoneGuard(tenant, INDIA, { ...INDIA, location: { ...INDIA.location, countries: [] } })).toEqual({
      policies: [],
      whatChanges: null,
      checks: [],
      blocking: [],
      fix: null,
    })
  })

  it("says Can't tell, in grey, where the modelled sign-ins move nothing and a saved one moves", () => {
    // 192.0.2.0/24 is no modelled origin; Neha's saved sign-in comes from it.
    const g = zoneGuard(tenant, OFFICES, { ...OFFICES, ip: [...OFFICES.ip, '192.0.2.0/24'] })
    expect(g.whatChanges?.counts).toEqual(NOTHING)
    expect(libraryLines(g)[1]).toEqual({ label: 'What changes', before: '', after: "Can't tell", effect: true, unknown: true })
  })

  it('reads the saved sign-ins alone when asked, for the leave dialog', () => {
    const g = zoneGuard(tenant, OFFICES, withoutOfficeBlock, { sweep: false })
    expect(g.whatChanges).toBeNull()
    expect(stopLine(g)).toBe('Kavya Menon in the office must pass and would get Deny.')
  })

  it('tries the fixes in order: keep what went, leave out what came, the type, then the saved zone', () => {
    const draft: Zone = {
      ...OFFICES,
      kind: 'blocked',
      ip: ['198.51.100.0/24', '10.0.0.0/8'],
      location: { ...OFFICES.location, cities: ['Mumbai'], ranges: [] },
    }
    expect(zoneCandidates(OFFICES, draft).map((c) => c.label)).toEqual([
      'Keep 203.0.113.0/24',
      'Keep Bengaluru',
      'Keep within 25 km of Pune',
      'Remove 10.0.0.0/8',
      'Restore the zone type',
      'Restore the saved zone',
    ])
    const keep = zoneCandidates(OFFICES, draft)[1].value
    expect(keep.location.cities).toEqual(['Bengaluru', 'Mumbai'])
    expect(zoneCandidates(OFFICES, draft).at(-1)?.value).toBe(OFFICES)
  })
})

describe('saving a device profile', () => {
  const lowered = { ...COMPLIANT, config: { ...COMPLIANT.config, 'os-android': { op: 'gte', value: '12' } } }

  it('stops the save when a Must pass would now be let in, and offers the saved profile back', () => {
    const g = profileGuard(tenant, COMPLIANT, lowered)
    expect(g.policies.map((p) => p.name)).toEqual(['Device compliance for Outlook and Dropbox', 'Developer tools — office and device checks'])
    expect(stopLine(g)).toBe('Devon Rao on Android 12 must pass and would get Allow on 1 factor.')
    expect(g.fix).toEqual({ label: 'Restore the saved profile', value: COMPLIANT })
    expect(libraryLines(g).at(-1)?.after).toBe('Allow on 1 factor · expected Deny')
  })

  it('never prints four zeros beside a saved sign-in the edit lets in', () => {
    /* The one modelled Android device (New / unknown, Android 12) fails the
       profile on its other checks both before and after, so the sample moves
       nothing — a true answer for the sample — while Devon, on the same
       Android version, is let in. */
    const g = profileGuard(tenant, COMPLIANT, lowered)
    expect(g.whatChanges?.counts).toEqual(NOTHING)
    const what = libraryLines(g).find((l) => l.label === 'What changes')
    expect(what).toMatchObject({ after: "Can't tell", unknown: true })
  })
})

describe('the risk profile in use', () => {
  const profiles = riskProfilesAt('medium')
  const [shipped, , strict] = profiles
  const quieter = { ...shipped, off: ['tor', 'root', 'emulator', 'vpn', 'proxy'] }

  it('reads every enforcing policy with a Risk score condition', () => {
    const g = riskGuard(tenant, shipped, quieter)
    expect(libraryLines(g).map((l) => [l.label, l.after])).toEqual([
      ['Active policies', 'Access the app through corporate devices only'],
      ['What changes', 'Of 360 modelled sign-ins: Now allowed 5 · Now on 1 factor 5 · Now asked for 2FA 0 · Now denied 0'],
    ])
  })

  it('never stops a save or a Use under this evaluator: a saved sign-in states its own score, so no scale moves it', () => {
    /* Pinned so nobody counts on the stop, the fix or Expect instead firing
       on the risk page or in Use (see riskGuard). */
    for (const from of profiles) {
      for (const to of [...profiles, quieter]) {
        const g = riskGuard(tenant, from, to)
        expect([g.checks, g.blocking, g.fix]).toEqual([[], [], null])
      }
    }
  })

  it('puts another profile in use through the same checks; one that moves nothing adds no rows', () => {
    const g = riskGuard(tenant, shipped, strict)
    expect(strict.id).toBe('rp-strict')
    expect(g.policies.map((p) => p.name)).toEqual(['Access the app through corporate devices only'])
    expect(g.whatChanges?.counts).toEqual(NOTHING)
    expect(libraryLines(g)).toEqual([])
  })

  it("draws Use's own rows: the profile in use, then the bands that move, and nothing signal by signal", () => {
    const lines = switchLines(shipped, quieter)
    expect(lines[0]).toEqual({ label: 'Profile in use', before: 'Shipped priorities', after: 'Shipped priorities', kind: 'changed' })
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.slice(1).every((l) => l.effect && l.group === 'Risk scores')).toBe(true)
    expect(switchLines(shipped, strict)[0]).toMatchObject({ before: 'Shipped priorities', after: strict.name })
  })
})

describe('whether a save is checked at all', () => {
  it('checks a zone or device profile once it is saved, never a new one', () => {
    expect(libraryChecked({ kind: 'zone', isNew: false })).toBe(true)
    expect(libraryChecked({ kind: 'zone', isNew: true })).toBe(false)
    expect(libraryChecked({ kind: 'device-profile', isNew: false })).toBe(true)
    expect(libraryChecked({ kind: 'device-profile', isNew: true })).toBe(false)
  })

  it('checks a risk profile only while it is in use (A10)', () => {
    expect(libraryChecked({ kind: 'risk-profile', inUse: true })).toBe(true)
    expect(libraryChecked({ kind: 'risk-profile', inUse: false })).toBe(false)
  })
})

describe('pressing a ready fix', () => {
  /* A page as a fix sees it: its draft, its setter, and the toasts said. */
  function page<T>(draft: T, restored?: (v: T) => boolean) {
    const toasts: { message: string; action?: { label: string; run: () => void } }[] = []
    const state: FixPage<T> = { draft, restored }
    state.onFix = (v) => {
      state.draft = v
    }
    const toast: FixToast = (message, action) => {
      toasts.push({ message, action })
    }
    return { state, toasts, toast, read: () => state }
  }

  it('says the fix is not saved yet, with an Undo that puts the edits back', () => {
    const fix = zoneGuard(tenant, OFFICES, withoutOfficeBlock).fix!
    const edited: Zone = { ...withoutOfficeBlock, name: 'Offices' }
    const p = page<Zone>(edited, (z) => zoneRestored(OFFICES, z))
    fixWithUndo(p.read, p.toast, { ...fix.value, name: 'Offices' }, fix.label)
    expect(p.toasts[0].message).toBe('Keep 203.0.113.0/24. Not saved yet.')
    p.toasts[0].action!.run()
    expect(p.state.draft).toBe(edited)
    expect(p.toasts.at(-1)?.message).toBe('Restored')
  })

  it('keeps Undo when the fix restores the saved object: the toast is the only way back to the edits', () => {
    const lowered: FingerprintProfile = { ...COMPLIANT, config: { ...COMPLIANT.config, 'os-android': { op: 'gte', value: '12' } } }
    const p = page(lowered, (v) => v === COMPLIANT)
    fixWithUndo(p.read, p.toast, COMPLIANT, 'Restore the saved profile')
    expect(p.state.draft).toBe(COMPLIANT)
    expect(p.toasts[0].message).toBe('Nothing left to save')
    expect(p.toasts[0].action?.label).toBe('Undo')
    p.toasts[0].action!.run()
    expect(p.state.draft).toBe(lowered)
    expect(p.toasts.at(-1)?.message).toBe('Restored')
  })

  it('leaves later changes alone when undone after them', () => {
    const p = page(withoutOfficeBlock, (z) => zoneRestored(OFFICES, z))
    fixWithUndo(p.read, p.toast, OFFICES, 'Restore the saved zone')
    const later = { ...OFFICES, name: 'Offices' }
    p.state.draft = later
    p.toasts[0].action!.run()
    expect(p.state.draft).toBe(later)
    expect(p.toasts.at(-1)?.message).toBe('Other changes came after it.')
  })
})

describe('the rows', () => {
  it("files a reading that can't be told under Can't tell, and never stops the save for it", () => {
    const kavya = t.savedSignIns.find((s) => s.id === 'ssi-kavya-office')!
    const pass: Reading = { verdict: 'pass', decision: '2fa', possible: ['2fa'], decidedBy: null, ruleIndex: 0, ruleName: 'In a corporate office', missing: [] }
    const unknown: Reading = { verdict: 'cant-tell', decision: null, possible: ['2fa', 'deny'], decidedBy: null, ruleIndex: undefined, ruleName: '', missing: ['address'] }
    const c = checkOf(kavya, pass, unknown, 'save', 'jaspreet')
    expect(c.blocks).toBe(false)
    expect(libraryLines({ policies: [], whatChanges: null, checks: [c] })).toEqual([
      {
        label: 'Kavya Menon in the office · Must pass',
        before: 'Allow with 2FA',
        after: "Can't tell · Allow with 2FA or Deny · needs IP address",
        effect: true,
        check: 'neutral',
        signInId: 'ssi-kavya-office',
      },
    ])
  })

  it('holds the review with one short word, and Use with its own', () => {
    expect(LIBRARY_STOP).toBe("Can't save")
    expect(USE_STOP).toBe("Can't use this profile")
  })
})
