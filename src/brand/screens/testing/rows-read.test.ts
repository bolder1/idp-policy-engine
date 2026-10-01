import { describe, expect, it } from 'vitest'

import { card, cond, rule, when, type Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { DEVICE_ROWS, pageRows, policiesOn, rowsRead } from './rows-read'

/* The rows each showcase policy's board asks for, and the page's.

   Since 30 Sep 2026 the Global Default reads the Operating countries zone (a
   place, no range) and the Corporate devices profile (the trusted-device
   rows) on every application, so every board below asks for a place and a
   device on top of what its own policy reads. */
const TRUSTED = ['platform', 'agent', 'registered', 'registered-count']

const t = showcaseTenant()
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const read = (draft: Policy | null, appId: string | null) => rowsRead(t.policies, draft, appId, lib)
const list = (r: ReturnType<typeof read>) => ({ rows: [...r.rows].sort(), device: [...r.device] })

describe('the rows a board asks for', () => {
  it('asks HRMS for a place and a distance, from the office zone and its range', () => {
    /* The device is the Global Default's: its rule 1 checks a corporate laptop. */
    expect(list(read(policy('sc-hrms-office'), 'hrms'))).toEqual({ rows: ['device', 'distance', 'place'], device: TRUSTED })
  })

  it('asks Google Workspace for a device and a risk score, with the trusted-device rows', () => {
    /* The place is the Global Default's operating countries. */
    expect(list(read(policy('sc-corporate-devices'), 'google-workspace'))).toEqual({
      rows: ['device', 'place', 'risk'],
      device: TRUSTED,
    })
  })

  it('asks Outlook for the health rows Compliant devices checks, in form order', () => {
    /* Then the Global Default's trusted-device rows, and its place. */
    expect(list(read(policy('sc-device-compliance'), 'outlook'))).toEqual({
      rows: ['device', 'place'],
      device: ['platform', 'os-version', 'integrity', 'screen-lock', 'authenticator', 'agent', 'registered', 'registered-count'],
    })
  })

  it('reads every policy on the application, not only the one on the board', () => {
    /* GitHub: the developer tools policy reads the office zone and a device
       profile, and so a board open on the Global Default still asks for both. */
    expect(list(read(policy('global-default'), 'github')).rows).toEqual(['device', 'distance', 'place'])
  })

  /* No application policy covers Salesforce, so what it asks is the Global
     Default's alone: a place and a corporate device. It asked for nothing
     before the baseline. */
  it('asks an application no policy of its own covers for what the Global Default reads', () => {
    expect(list(read(null, 'salesforce'))).toEqual({ rows: ['device', 'place'], device: TRUSTED })
  })
})

describe('what a rule reads', () => {
  /* Each against a tenant whose Global Default reads nothing, so what is
     read is the draft's rule alone and not the baseline's place and device. */
  const bare = t.policies.map((p) => (p.isSystem ? { ...p, rules: [] } : p))
  const read = (draft: Policy | null, appId: string | null) => rowsRead(bare, draft, appId, lib)
  const on = (...conds: ReturnType<typeof cond>[]): Policy => ({
    ...policy('sc-hrms-office'),
    id: 'draft',
    appIds: [],
    rules: [rule({ name: 'Draft', when: when(card(...conds)), decision: 'deny' })],
  })

  it('reads the board draft even before it covers the application', () => {
    expect(list(read(on(cond('device-risk', 'above', ['70'])), 'salesforce')).rows).toEqual(['risk'])
  })

  it('reads the clock for a window, and only the date line for a weekday', () => {
    expect(list(read(on(cond('time', 'between', ['09:00', '17:00'])), 'salesforce')).rows).toEqual(['time-track', 'when'])
    expect(list(read(on(cond('day', 'is', ['Monday'])), 'salesforce')).rows).toEqual(['when'])
  })

  it('reads no place from a zone asked only for its network', () => {
    const c = { ...cond('zone', 'in zone', ['corp-offices']), scopes: { 'corp-offices': 'ip' as const } }
    expect(list(read(on(c), 'salesforce')).rows).toEqual([])
  })

  it('reads a place but no distance from a zone with no range', () => {
    expect(list(read(on(cond('zone', 'in zone', ['india'])), 'salesforce')).rows).toEqual(['place'])
  })

  it('reads nothing from a switched-off rule', () => {
    const off = on(cond('device-risk', 'above', ['70']))
    expect(list(read({ ...off, rules: off.rules.map((r) => ({ ...r, enabled: false })) }, 'salesforce')).rows).toEqual([])
  })
})

describe('the page', () => {
  it('shows every row but Distance, which it shows where the board would', () => {
    expect([...pageRows(read(null, 'outlook')).rows].sort()).toEqual(['device', 'place', 'risk', 'when'])
    expect([...pageRows(read(null, 'hrms')).rows].sort()).toEqual(['device', 'distance', 'place', 'risk', 'when'])
    expect([...pageRows(read(null, 'hrms')).device]).toEqual(DEVICE_ROWS)
  })
})

describe('the policies on an application', () => {
  it('keeps list order, with the draft in its stored place', () => {
    const draft = { ...policy('sc-hrms-office'), name: 'Edited' }
    expect(policiesOn(t.policies, 'hrms', draft).map((p) => p.name)).toEqual(['Global Default Policy', 'Edited'])
  })

  it('adds a draft nobody has stored at the end', () => {
    const fresh: Policy = { ...policy('sc-hrms-office'), id: 'new', appIds: [] }
    expect(policiesOn(t.policies, 'outlook', fresh).map((p) => p.id)).toEqual(['global-default', 'sc-device-compliance', 'new'])
  })
})
