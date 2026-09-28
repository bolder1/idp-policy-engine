import type { AccessDecision, Policy, User } from '../data'
import { strictestFirst } from '../decision-words'
import { lookUpAddress } from './geo-fixture'
import { CHIP_DEVICES, TENANT_TZ, type SignInFacts } from './sign-in-facts'
import type { SimEnv } from './simulate'
import { resolveSignIn, type PolicyStanding, type TenantResolution } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   Modelled sign-ins for a monitoring policy, and the plan line they add up to.

   A monitoring policy checks sign-ins and decides none, and the question an
   admin brings to it is "what would change if I turned it on". Real sign-ins
   need the backend, so this models twelve: people from the sample directory —
   the policy's own audience first, then two from outside it — each signing in
   from one of eight origins, on one of the policy's applications, over the
   last week. Each is resolved twice across the tenant, today and with this
   policy turned on, and the difference is bucketed.

     If turned on: 0 to allow on 1 factor, 3 to allow with 2FA, 5 to deny, 4 unchanged.

   That line is what Before turning on's "While monitoring" row says (spec C
   §3.7, final spec D.3), and the Monitoring page's table lists the rows under
   it (M3). Deterministic for a given day, so a test can pin the line.
   -------------------------------------------------------------------------- */

export interface MonitorOrigin {
  address: string
  time: string
  device: keyof typeof CHIP_DEVICES
  risk: number
}

/* Every address is a GEO_FIXTURE block (RFC 5737 and 3849 documentation
   ranges): the office in Pune twice over, Bengaluru, home broadband in Pune on
   IPv4 and IPv6, London, Austin late at night, a Tor exit and a proxy. */
export const MONITOR_ORIGINS: readonly MonitorOrigin[] = [
  { address: '203.0.113.24', time: '09:30', device: 'Managed (MDM)', risk: 12 },
  { address: '192.0.2.10', time: '19:20', device: 'Known < 90 days', risk: 12 },
  { address: '198.51.100.20', time: '10:05', device: 'Known < 90 days', risk: 12 },
  { address: '192.0.2.200', time: '14:10', device: 'Known > 90 days', risk: 12 },
  { address: '192.0.2.130', time: '23:05', device: 'New / unknown', risk: 48 },
  { address: '192.0.2.66', time: '02:40', device: 'New / unknown', risk: 86 },
  { address: '192.0.2.82', time: '11:20', device: 'Changed fingerprint', risk: 48 },
  { address: '2001:db8:1::20', time: '08:10', device: 'Known < 90 days', risk: 12 },
]

/** How many sign-ins are modelled for a policy. */
export const MONITOR_ROWS = 12

/* The day the modelled week ends on: taken once, when the console loads, so
   the Monitoring page and Before turning on's While monitoring row read the
   same twelve sign-ins, and a row does not move between two opens of the page
   (spec C §5.1). Everything below takes the day as an argument. */
export const SAMPLE_DAY: Date = new Date()

export interface MonitorSample {
  id: string
  facts: SignInFacts
  /** "Mon". */
  day: string
  /** "09:30". */
  time: string
  personName: string
  groupName: string
  appName: string
  /** "Pune, India" as the lookup names it, or null when it names no place. */
  place: string | null
  address: string
}

export type MonitorChange = 'to-1fa' | 'to-2fa' | 'to-deny' | 'unchanged' | 'cant-tell'

export interface MonitorRow {
  sample: MonitorSample
  today: TenantResolution
  ifOn: TenantResolution
  change: MonitorChange
  /** This policy's standing once it is on: why it decides, or why it still does not. */
  standing: PolicyStanding | null
}

export interface MonitorPlan {
  to1fa: number
  to2fa: number
  toDeny: number
  unchanged: number
  cantTell: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* The people signing in: up to four from the audience — the first member of
   each group when it is everyone, else round-robin over its groups, then its
   named people — and, when the audience is not everyone, the first member of
   each of the first two groups outside it. In directory order throughout. */
export function monitorPool(policy: Pick<Policy, 'audience'>, env: SimEnv): User[] {
  const people = env.library?.people ?? []
  const groups = env.library?.groups ?? []
  const membersOf = (groupId: string) => people.filter((u) => u.groupId === groupId)
  const a = policy.audience
  if (a.everyone) {
    return groups
      .map((g) => membersOf(g.id)[0])
      .filter((u): u is User => u !== undefined)
      .slice(0, 4)
  }
  const inside: User[] = []
  const taken = new Set<string>()
  const queues = a.groupIds.map(membersOf)
  let progressed = true
  while (inside.length < 4 && progressed) {
    progressed = false
    for (const q of queues) {
      const next = q.find((u) => !taken.has(u.id))
      if (!next || inside.length >= 4) continue
      inside.push(next)
      taken.add(next.id)
      progressed = true
    }
  }
  for (const id of a.userIds) {
    if (inside.length >= 4) break
    const u = people.find((p) => p.id === id)
    if (u && !taken.has(u.id)) {
      inside.push(u)
      taken.add(u.id)
    }
  }
  const outside = groups
    .filter((g) => !a.groupIds.includes(g.id))
    .map((g) => membersOf(g.id).find((u) => !taken.has(u.id) && !a.userIds.includes(u.id)))
    .filter((u): u is User => u !== undefined)
    .slice(0, 2)
  return [...inside, ...outside]
}

const isoDay = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

/* Twelve sign-ins: row i is person i, origin i and application i, each taken
   round its list, on the day (i mod 7) + 1 days before `today`. The place is
   left for the lookup, as it would be on a real sign-in. `today` is read as a
   calendar day, in UTC, so the same date gives the same rows anywhere. */
export function monitorSamples(policy: Pick<Policy, 'id' | 'appIds' | 'audience'>, env: SimEnv, today: Date): MonitorSample[] {
  const pool = monitorPool(policy, env)
  if (pool.length === 0 || policy.appIds.length === 0) return []
  const groups = env.library?.groups ?? []
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Array.from({ length: MONITOR_ROWS }, (_, i) => {
    const person = pool[i % pool.length]
    const origin = MONITOR_ORIGINS[i % MONITOR_ORIGINS.length]
    const appId = policy.appIds[i % policy.appIds.length]
    const day = new Date(start - ((i % 7) + 1) * 86_400_000)
    const date = isoDay(day)
    const found = lookUpAddress(origin.address)
    const place = found?.location ? [found.location.city ?? found.location.state, found.location.country].filter(Boolean).join(', ') : null
    return {
      id: `${policy.id}-${i}`,
      facts: {
        appId,
        personId: person.id,
        network: { address: origin.address, source: 'stated' },
        when: { date, time: origin.time, timeZone: TENANT_TZ, source: 'stated' },
        device: { ...CHIP_DEVICES[origin.device], source: 'stated' },
        risk: { score: origin.risk, source: 'stated' },
      },
      day: WEEKDAYS[day.getUTCDay()],
      time: origin.time,
      personName: person.name,
      groupName: groups.find((g) => g.id === person.groupId)?.name ?? env.groupName(person.groupId),
      appName: env.appName?.(appId) ?? appId,
      place,
      address: origin.address,
    }
  })
}

/* The decisions a resolution reaches, strictest first: one when it decided,
   several when it depends, none when nothing decides. */
const reach = (r: TenantResolution): AccessDecision[] =>
  r.status === 'decided' && r.decision ? [r.decision] : strictestFirst(r.possible.map((o) => o.decision))

const TO: Record<AccessDecision, MonitorChange> = { '1fa': 'to-1fa', '2fa': 'to-2fa', deny: 'to-deny' }

/* What turning it on does to one sign-in. When nothing decides today (no
   Global Default), a sign-in it would decide once on goes by what it would
   get; one it still would not — somebody outside its audience — reaches no
   decision either way, and is unchanged. */
export function changeOf(today: TenantResolution, ifOn: TenantResolution): MonitorChange {
  if (today.status === 'incomplete' && ifOn.status === 'decided' && ifOn.decision) return TO[ifOn.decision]
  if (today.status !== 'decided' || ifOn.status !== 'decided') return reach(today).join() === reach(ifOn).join() ? 'unchanged' : 'cant-tell'
  if (today.decision === ifOn.decision || !ifOn.decision) return 'unchanged'
  return TO[ifOn.decision]
}

/** Each sample resolved today and with this policy on, and what moved. */
export function monitorRows(policy: Policy, policies: readonly Policy[], env: SimEnv, samples: readonly MonitorSample[]): MonitorRow[] {
  const on: Policy = { ...policy, status: 'active' }
  return samples.map((sample) => {
    const today = resolveSignIn(policies, sample.facts, env)
    const ifOn = resolveSignIn(policies, sample.facts, env, { substitute: on })
    return { sample, today, ifOn, change: changeOf(today, ifOn), standing: ifOn.standings.find((s) => s.policyId === policy.id) ?? null }
  })
}

export function planOf(rows: readonly MonitorRow[]): MonitorPlan {
  const plan: MonitorPlan = { to1fa: 0, to2fa: 0, toDeny: 0, unchanged: 0, cantTell: 0 }
  for (const r of rows) {
    if (r.change === 'to-1fa') plan.to1fa += 1
    else if (r.change === 'to-2fa') plan.to2fa += 1
    else if (r.change === 'to-deny') plan.toDeny += 1
    else if (r.change === 'unchanged') plan.unchanged += 1
    else plan.cantTell += 1
  }
  return plan
}

/* The line in its two parts, for a surface that greys the can't-tell count:
   the head, and ", 2 can't tell" or null. The full stop follows both. */
export function planParts(plan: MonitorPlan): { head: string; cantTell: string | null } {
  return {
    head: `If turned on: ${plan.to1fa} to allow on 1 factor, ${plan.to2fa} to allow with 2FA, ${plan.toDeny} to deny, ${plan.unchanged} unchanged`,
    cantTell: plan.cantTell > 0 ? `, ${plan.cantTell} can't tell` : null,
  }
}

/** "If turned on: 0 to allow on 1 factor, 3 to allow with 2FA, 5 to deny, 4 unchanged." — the looser move first, even at 0. */
export function planLine(plan: MonitorPlan): string {
  const { head, cantTell } = planParts(plan)
  return `${head}${cantTell ?? ''}.`
}
