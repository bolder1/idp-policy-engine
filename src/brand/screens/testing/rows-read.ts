import { zoneScopeOf, type Policy, type Rule, type Zone } from '../../data'
import type { FingerprintProfile } from '../../fingerprint'
import { leaves } from '../../predicate'

/* -----------------------------------------------------------------------------
   Which sign-in rows a test needs, from the rules that could read them.

   Person, Application, From and IP address are always asked: every policy
   reads who and where to, and the address is what a place is looked up from.
   The rest are asked only when a rule on this application reads them — a
   Device row on the board of a policy that never checks a device is a control
   that cannot change the answer, and it pushes the one that can off the panel.

     zone                Place, and Distance when the zone draws a range
     country/state/city  Place
     time                When, and the time ruler
     day                 When
     temporary access    When: the date a grant ends on
     device profile      Device, and the detail rows the profile checks
     device risk score   Device risk score

   A temporary access grant (temp-access.ts) has no condition, but it reads
   the sign-in's date: past its end date the rule is off (data.ts
   `ruleExpired`). Without the When row the admin had no way to move the date
   and watch a grant end (6 Oct 2026), so a grant asks for it as a day check
   does — and the time ruler stays away, since a grant draws no window.

   The rules asked are every enabled rule of every app access policy that
   covers the application — the Global Default covers them all — plus the
   policy on the board, which may not cover it yet. Switched-off rules read
   nothing. Policies that are not on still count, on purpose: an inactive
   policy on the application is one Assume on can bring in, and the row it
   needs should already be there when it does.

   Policy testing's page shows every row but Distance (`pageRows`): a ruler
   needs a range to measure from, and only a zone on the application has one.
   -------------------------------------------------------------------------- */

export type RowId = 'place' | 'distance' | 'when' | 'time-track' | 'device' | 'risk'

/** The rows under the Device row's Edit details, in form order. */
export type DeviceRowId =
  | 'platform'
  | 'os-version'
  | 'device-type'
  | 'integrity'
  | 'screen-lock'
  | 'authenticator'
  | 'agent'
  | 'registered'
  | 'registered-count'

export const DEVICE_ROWS: readonly DeviceRowId[] = [
  'platform',
  'os-version',
  'device-type',
  'integrity',
  'screen-lock',
  'authenticator',
  'agent',
  'registered',
  'registered-count',
]

export interface RowsRead {
  rows: ReadonlySet<RowId>
  /** Empty unless `rows` has 'device'. */
  device: ReadonlySet<DeviceRowId>
  /** A rule on this application carries temporary access (temp-access.ts): the When row's date is what ends it, so it is
      said beside the hour (sign-in-sentence.ts). Absent is none. */
  grant?: boolean
}

/** The tenant objects the rows are read against: which zones draw a range, and what each profile checks. */
export interface RowsLibrary {
  zones: readonly Zone[]
  fingerprints: readonly FingerprintProfile[]
}

/* The policies whose rules a sign-in on this application can meet: every app
   access policy that covers it, in list order, with `extra` — the board's
   draft, or a policy assumed on — in place of its stored twin, or at the end
   when it has none or covers no application yet. */
export function policiesOn(policies: readonly Policy[], appId: string | null, extra?: Policy | null): Policy[] {
  const covers = (p: Policy) => p.type === 'App Access' && (p.isSystem === true || (appId !== null && p.appIds.includes(appId)))
  const on = policies.filter((p) => p.id !== extra?.id && covers(p))
  if (!extra || extra.type !== 'App Access') return on
  const at = policies.findIndex((p) => p.id === extra.id)
  if (at < 0) return [...on, extra]
  /* Its stored place in the list, so the order a reader sees is the list's. */
  const before = policies.slice(0, at).filter((p) => p.id !== extra.id && covers(p)).length
  return [...on.slice(0, before), extra, ...on.slice(before)]
}

/** The enabled rules of those policies, last rows included, in list and rule order. */
export function rulesOn(policies: readonly Policy[]): Rule[] {
  return policies.flatMap((p) => [...p.rules, ...(p.fallback ? [p.fallback] : [])]).filter((r) => r.enabled)
}

/* What a device profile's checks need stated. Every check reads the platform
   first — an OS floor constrains the platform it names, and the handset rows
   are not asked of a laptop — so a profile always brings Platform with it. */
function deviceRowsOf(p: FingerprintProfile): DeviceRowId[] {
  if (p.mode === 'device') {
    return [
      'platform',
      ...(p.reach === 'agent' ? (['agent'] as const) : []),
      ...(p.restrictMobile ? (['device-type'] as const) : []),
      'registered',
      ...(p.maxDevices !== null ? (['registered-count'] as const) : []),
    ]
  }
  const rows: DeviceRowId[] = ['platform']
  for (const id of p.enabled) {
    if (id.startsWith('os-')) rows.push('os-version')
    else if (id === 'device-type') rows.push('device-type')
    else if (id === 'integrity') rows.push('integrity')
    else if (id === 'screen-lock') rows.push('screen-lock')
    else if (id === 'mo-authenticator') rows.push('authenticator')
    else if (id === 'mo-agent') rows.push('agent')
  }
  return rows
}

export function rowsRead(policies: readonly Policy[], draft: Policy | null, appId: string | null, lib: RowsLibrary): RowsRead {
  const rows = new Set<RowId>()
  const device = new Set<DeviceRowId>()
  let grant = false
  for (const r of rulesOn(policiesOn(policies, appId, draft))) {
    if (r.tempAccess) {
      rows.add('when')
      grant = true
    }
    for (const c of leaves(r.when)) {
      switch (c.typeId) {
        case 'zone':
          for (const id of c.values) {
            const zone = lib.zones.find((z) => z.id === id)
            /* A zone asked only for its network reads no place. */
            if (!zone || zoneScopeOf(c, id) === 'ip') continue
            const l = zone.location
            if (l.countries.length + l.states.length + l.cities.length + l.ranges.length > 0) rows.add('place')
            if (l.ranges.length > 0) rows.add('distance')
          }
          break
        case 'country':
        case 'state':
        case 'city':
          rows.add('place')
          break
        case 'time':
          rows.add('when').add('time-track')
          break
        case 'day':
          rows.add('when')
          break
        case 'device-risk':
          rows.add('risk')
          break
        case 'fingerprint':
          rows.add('device')
          for (const id of c.values) {
            const p = lib.fingerprints.find((x) => x.id === id)
            for (const row of p ? deviceRowsOf(p) : DEVICE_ROWS) device.add(row)
          }
          break
      }
    }
  }
  return { rows, device: new Set(DEVICE_ROWS.filter((d) => device.has(d))), ...(grant ? { grant } : {}) }
}

/* Policy testing's rows: all of them, and every device detail, but Distance
   only where the board would have one too. The time ruler follows the same
   rule — it prints a window's edges, and with no window it has none. */
export function pageRows(read: RowsRead): RowsRead {
  const rows = new Set<RowId>(['place', 'when', 'device', 'risk'])
  if (read.rows.has('distance')) rows.add('distance')
  if (read.rows.has('time-track')) rows.add('time-track')
  return { rows, device: new Set(DEVICE_ROWS), ...(read.grant ? { grant: true } : {}) }
}
