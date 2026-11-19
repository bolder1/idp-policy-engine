import { useSyncExternalStore } from 'react'
import type { DenyReason } from '../screens/testing/deny-reason'
import type { Range } from './model'

/* -----------------------------------------------------------------------------
   The Dashboard's own sample data: what the prototype's stores do not model
   (sign-in volume over time, delivery, the license, enrolment, requests,
   syncs, connections, admin activity).

   FABRICATED, the way data.ts names its fixtures: believable numbers for a
   mid-size tenant. Nothing here is copied from a real tenant: no identifiers,
   no names, no counts. People and apps are picked from the prototype's own
   directory at render time, by position.

   Everything that moves with time is a function of the clock hour it belongs
   to, so a number is the same on every visit and the range before it differs
   from this one. Shares (reasons, apps, places, methods) are fixed and split
   the range's own totals, so the widgets on a board agree with each other.
   -------------------------------------------------------------------------- */

/** A fixed pseudo-random number in [0, 1) for a whole number (mulberry32's mix). */
export function noise(n: number, salt = 0): number {
  let t = (Math.trunc(n) + Math.imul(salt + 1, 0x6d2b79f5)) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const HOUR = 3_600_000

/* ---- sign-ins over time ------------------------------------------------------- */

export interface SignInPoint {
  /** When the bucket starts. */
  at: Date
  allowed: number
  mfa: number
  blocked: number
}

export const SERIES_KEYS = ['allowed', 'mfa', 'blocked'] as const
export type SeriesKey = (typeof SERIES_KEYS)[number]
export const SERIES_WORD: Record<SeriesKey, string> = { allowed: 'Allowed', mfa: 'Asked for MFA', blocked: 'Blocked' }

const BUCKETS: Record<Range, { count: number; hours: number }> = {
  '24h': { count: 24, hours: 1 },
  '7d': { count: 84, hours: 2 },
  '30d': { count: 30, hours: 24 },
}

/** The range's length in hours. */
export const spanHours = (range: Range) => BUCKETS[range].count * BUCKETS[range].hours

/** How busy an hour of the week is: a working-day hump, quiet nights, quieter weekends. */
function busy(at: Date): number {
  const h = at.getHours() + at.getMinutes() / 60
  const day = at.getDay()
  const weekend = day === 0 || day === 6 ? 0.32 : 1
  /* Offices in several time zones: the day is one long swell with a second, smaller one after it, and the night never quite empties. */
  const hump = Math.exp(-((h - 10.5) ** 2) / 22) + 0.7 * Math.exp(-((h - 16) ** 2) / 20)
  return weekend * (0.2 + hump * 0.8)
}

/** Sign-ins in one clock hour. */
function hourOf(at: Date): Omit<SignInPoint, 'at'> {
  const n = Math.floor(at.getTime() / HOUR)
  /* A slow swell over weeks, so one range is not a copy of the one before it. */
  const swell = 1 + 0.05 * Math.sin(n / 61) + 0.035 * Math.sin(n / 233 + 1.3)
  const total = Math.round(busy(new Date(at.getTime() + HOUR / 2)) * 420 * swell * (0.9 + noise(n) * 0.2))
  const rate = 0.034 + 0.005 * Math.sin(n / 97 + 0.7) + noise(n, 7) * 0.01
  const blocked = Math.round(total * rate)
  const mfa = Math.round((total - blocked) * (0.3 + noise(n, 13) * 0.1))
  return { allowed: total - blocked - mfa, mfa, blocked }
}

/** Sign-ins in each bucket of the range, ending with the bucket that holds `now`. */
export function signInSeries(range: Range, now = new Date()): SignInPoint[] {
  const { count, hours } = BUCKETS[range]
  const end = new Date(now)
  end.setMinutes(0, 0, 0)
  if (hours === 24) end.setHours(0)
  else end.setHours(end.getHours() - (end.getHours() % hours))
  const out: SignInPoint[] = []
  for (let i = count - 1; i >= 0; i--) {
    const at = new Date(end.getTime() - i * hours * HOUR)
    const p: SignInPoint = { at, allowed: 0, mfa: 0, blocked: 0 }
    for (let k = 0; k < hours; k++) {
      const h = hourOf(new Date(at.getTime() + k * HOUR))
      p.allowed += h.allowed
      p.mfa += h.mfa
      p.blocked += h.blocked
    }
    out.push(p)
  }
  return out
}

/** The same range, one range earlier. */
export const previousSeries = (range: Range, now = new Date()) => signInSeries(range, new Date(now.getTime() - spanHours(range) * HOUR))

export interface Totals {
  allowed: number
  mfa: number
  blocked: number
  /** All three. */
  all: number
}

export function totals(points: readonly SignInPoint[]): Totals {
  const t = points.reduce((s, p) => ({ allowed: s.allowed + p.allowed, mfa: s.mfa + p.mfa, blocked: s.blocked + p.blocked }), { allowed: 0, mfa: 0, blocked: 0 })
  return { ...t, all: t.allowed + t.mfa + t.blocked }
}

/** How far `now` is from `before`, as a fraction of `before` (0.064 = up 6.4%). */
export const change = (now: number, before: number) => (before > 0 ? (now - before) / before : 0)

/** The busiest bucket, said the way the range reads: an hour, a weekday, a date. */
export function busiest(points: readonly SignInPoint[], range: Range): string {
  if (points.length === 0) return ''
  if (range === '7d') {
    const days = new Map<string, number>()
    for (const p of points) {
      const d = p.at.toLocaleDateString('en-GB', { weekday: 'long' })
      days.set(d, (days.get(d) ?? 0) + p.allowed + p.mfa + p.blocked)
    }
    return [...days.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  const top = points.reduce((a, b) => (b.allowed + b.mfa + b.blocked > a.allowed + a.mfa + a.blocked ? b : a))
  return range === '24h' ? top.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : top.at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** A total divided by shares into whole numbers that add up to it (largest remainder). */
export function split(total: number, shares: readonly number[]): number[] {
  const sum = shares.reduce((a, b) => a + b, 0) || 1
  const exact = shares.map((s) => (total * s) / sum)
  const out = exact.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  for (const i of exact.map((v, n) => [v - Math.floor(v), n] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1])) {
    if (left-- <= 0) break
    out[i]++
  }
  return out
}

/* ---- what the sign-ins were ------------------------------------------------------ */

/** Why policies refused sign-ins, as shares of the blocked total. */
export const REASON_SHARES: { reason: DenyReason; share: number }[] = [
  { reason: 'zone', share: 0.34 },
  { reason: 'device', share: 0.22 },
  { reason: 'risk', share: 0.17 },
  { reason: 'time', share: 0.11 },
  { reason: 'default-deny', share: 0.09 },
  { reason: 'group', share: 0.07 },
]

/** Each app's share of sign-ins, by its place in the app list. The rest are spread thin. */
export const APP_SHARES = [0.21, 0.16, 0.13, 0.1, 0.08, 0.07, 0.05, 0.04]

export const PLACES: { place: string; share: number; blocked: number }[] = [
  { place: 'India', share: 0.46, blocked: 0.021 },
  { place: 'United States', share: 0.21, blocked: 0.034 },
  { place: 'United Kingdom', share: 0.11, blocked: 0.029 },
  { place: 'Germany', share: 0.07, blocked: 0.041 },
  { place: 'Singapore', share: 0.05, blocked: 0.052 },
  { place: 'United Arab Emirates', share: 0.04, blocked: 0.088 },
  { place: 'Other places', share: 0.06, blocked: 0.19 },
]

/** Second methods used at sign-in, as shares of the sign-ins that used one. `strong` resists phishing. */
export const METHODS: { name: string; share: number; strong?: true }[] = [
  { name: 'Authenticator app', share: 0.38 },
  { name: 'Push notification', share: 0.24 },
  { name: 'Passkey', share: 0.14, strong: true },
  { name: 'SMS code', share: 0.12 },
  { name: 'Email code', share: 0.08 },
  { name: 'Hardware token', share: 0.04, strong: true },
]

export const PHISHING = {
  share: METHODS.filter((m) => m.strong).reduce((s, m) => s + m.share, 0),
  /** The share at the start of each of the last eight weeks, oldest first. */
  trend: [0.09, 0.1, 0.12, 0.13, 0.14, 0.16, 0.17, 0.18],
  target: 0.5,
}

export const RISK_SIGNALS: { name: string; share: number }[] = [
  { name: 'New device', share: 0.37 },
  { name: 'Unfamiliar place', share: 0.24 },
  { name: 'Anonymous network', share: 0.16 },
  { name: 'Impossible travel', share: 0.12 },
  { name: 'Unusual hours', share: 0.11 },
]

/** From a sign-in started to a person signed in. Each step is what is left after it. */
export function funnel(t: Totals): { label: string; value: number }[] {
  const started = Math.round(t.all * 1.06)
  const failedMfa = Math.round(t.mfa * 0.04)
  return [
    { label: 'Started', value: started },
    { label: 'Password accepted', value: t.all },
    { label: 'Allowed by policy', value: t.all - t.blocked },
    { label: 'Signed in', value: t.all - t.blocked - failedMfa },
  ]
}

/* ---- MFA delivery ----------------------------------------------------------------- */

export const CHANNELS = [
  { id: 'sms', label: 'SMS', share: 0.3, fail: 0.034 },
  { id: 'email', label: 'Email', share: 0.22, fail: 0.012 },
  { id: 'push', label: 'Push', share: 0.48, fail: 0.007 },
] as const
export type ChannelId = (typeof CHANNELS)[number]['id']

export interface DeliveryPoint {
  at: Date
  delivered: number
  failed: number
}

/** Codes and prompts sent in each of at most `bars` stretches of the range, for one channel or all. */
export function delivery(range: Range, channel: ChannelId | 'all', now = new Date(), bars = 14): DeliveryPoint[] {
  const points = signInSeries(range, now)
  const size = Math.ceil(points.length / bars)
  const out: DeliveryPoint[] = []
  for (let i = 0; i < points.length; i += size) {
    const group = points.slice(i, i + size)
    const asked = group.reduce((s, p) => s + p.mfa, 0)
    const n = Math.floor(group[0].at.getTime() / HOUR)
    let delivered = 0
    let failed = 0
    CHANNELS.forEach((c, k) => {
      if (channel !== 'all' && channel !== c.id) return
      const sent = Math.round(asked * c.share)
      const lost = Math.round(sent * c.fail * (0.4 + noise(n, 40 + k) * 1.6))
      delivered += sent - lost
      failed += lost
    })
    out.push({ at: group[0].at, delivered, failed })
  }
  return out
}

/* ---- people ------------------------------------------------------------------------ */

export interface CountPoint {
  at: Date
  count: number
}

/** Users added in each day of the range (each hour, for the last 24). */
export function registrations(range: Range, now = new Date()): CountPoint[] {
  const hourly = range === '24h'
  const count = hourly ? 24 : range === '7d' ? 7 : 30
  const step = hourly ? 1 : 24
  const end = new Date(now)
  end.setMinutes(0, 0, 0)
  if (!hourly) end.setHours(0)
  const out: CountPoint[] = []
  for (let i = count - 1; i >= 0; i--) {
    const at = new Date(end.getTime() - i * step * HOUR)
    const n = Math.floor(at.getTime() / (step * HOUR))
    const weekend = at.getDay() === 0 || at.getDay() === 6
    const base = hourly ? busy(new Date(at.getTime() + HOUR / 2)) * 1.6 : weekend ? 2 : 9
    out.push({ at, count: Math.round(base * (0.45 + noise(n, 31) * 1.2)) })
  }
  return out
}

/** People who have not signed in for a while: positions in the directory, and the days since. */
export const DORMANT: { person: number; days: number }[] = [
  { person: 21, days: 143 },
  { person: 9, days: 118 },
  { person: 30, days: 96 },
  { person: 14, days: 81 },
  { person: 26, days: 74 },
  { person: 3, days: 63 },
]

/** People whose sign-ins were blocked most: positions in the directory, their share of the blocked total, and the main reason. */
export const MOST_BLOCKED: { person: number; share: number; reason: DenyReason }[] = [
  { person: 12, share: 0.031, reason: 'zone' },
  { person: 5, share: 0.024, reason: 'device' },
  { person: 19, share: 0.019, reason: 'risk' },
  { person: 8, share: 0.015, reason: 'zone' },
  { person: 23, share: 0.012, reason: 'time' },
  { person: 2, share: 0.009, reason: 'device' },
]

export interface AccessRequest {
  id: string
  /** Positions in the directory and the app list, resolved at render time. */
  person: number
  app: number
  /** Minutes ago. */
  ago: number
}

export const REQUESTS: AccessRequest[] = [
  { id: 'rq1', person: 4, app: 2, ago: 18 },
  { id: 'rq2', person: 11, app: 0, ago: 64 },
  { id: 'rq3', person: 7, app: 3, ago: 190 },
  { id: 'rq4', person: 15, app: 1, ago: 420 },
  { id: 'rq5', person: 27, app: 5, ago: 1500 },
]

/* What the admin answered this visit. Kept for the visit only: the requests
   are sample data, and a reload brings them back to answer again. */
let answered: Readonly<Record<string, 'approved' | 'rejected'>> = {}
const listeners = new Set<() => void>()
export function answer(id: string, a: 'approved' | 'rejected' | null) {
  const next = { ...answered }
  if (a) next[id] = a
  else delete next[id]
  answered = next
  listeners.forEach((l) => l())
}
export function useAnswered() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => answered,
    () => answered,
  )
}

/* ---- posture ------------------------------------------------------------------------ */

export const MFA = {
  /** Share of users with a second method set up, today. */
  enrolled: 0.78,
  /** The share at the start of each of the last eight weeks, oldest first. */
  trend: [0.69, 0.7, 0.72, 0.72, 0.74, 0.75, 0.77, 0.78],
  target: 0.9,
}

export const LICENSE = {
  plan: 'Enterprise',
  users: { used: 1284, limit: 1500 },
  sms: { left: 4210, limit: 10000 },
  email: { left: 18640, limit: 25000 },
  /** YYYY-MM-DD */
  renews: '2027-03-31',
}

/** What runs out soon. `app` is a position in the app list; `days` is days left. */
export const EXPIRING: { what: string; app?: number; days: number }[] = [
  { what: 'SAML signing certificate', app: 1, days: 9 },
  { what: 'SCIM token', app: 4, days: 21 },
  { what: 'OIDC client secret', app: 2, days: 34 },
  { what: 'SAML signing certificate', app: 6, days: 52 },
  { what: 'Domain verification', days: 75 },
]

/* ---- operations ---------------------------------------------------------------------- */

/** The last sync to each app. `app` is a position in the app list. */
export const SYNCS: { app: number; ago: number; created: number; updated: number; failed: number }[] = [
  { app: 0, ago: 12, created: 4, updated: 37, failed: 0 },
  { app: 2, ago: 26, created: 0, updated: 12, failed: 0 },
  { app: 3, ago: 58, created: 2, updated: 61, failed: 3 },
  { app: 5, ago: 95, created: 1, updated: 8, failed: 0 },
  { app: 1, ago: 240, created: 0, updated: 0, failed: 14 },
  { app: 7, ago: 610, created: 6, updated: 19, failed: 0 },
]

export type DayState = 'ok' | 'slow' | 'down'

/** A connection's last 30 days, oldest first: `.` ran well, `s` ran slow, `x` was down. */
const days = (line: string): DayState[] => [...line].map((c) => (c === 'x' ? 'down' : c === 's' ? 'slow' : 'ok'))

export const CONNECTIONS: { name: string; type: string; days: DayState[] }[] = [
  { name: 'Active Directory', type: 'Identity source', days: days('..............................') },
  { name: 'HR directory', type: 'Identity source', days: days('.........s....................') },
  { name: 'SMS gateway', type: 'Delivery', days: days('.....s.......xx..........s....') },
  { name: 'Email (SMTP)', type: 'Delivery', days: days('..............................') },
  { name: 'SIEM stream', type: 'Logs', days: days('......................s......s') },
  { name: 'External hooks', type: 'Automation', days: days('...x..........................') },
]

/** What admins did in the console. `person` is a position in the directory; `ago` is minutes. */
export const ADMIN_ACTIVITY: { person: number; what: string; ago: number }[] = [
  { person: 0, what: 'Changed the SMS gateway', ago: 22 },
  { person: 6, what: 'Added an application', ago: 75 },
  { person: 0, what: 'Exported the user list', ago: 190 },
  { person: 10, what: 'Reset MFA for a user', ago: 340 },
  { person: 6, what: 'Edited the sign-in page branding', ago: 1260 },
  { person: 10, what: 'Added 12 users from a file', ago: 2900 },
  { person: 0, what: 'Changed an admin role', ago: 4400 },
]

/* ---- when people sign in --------------------------------------------------------------- */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** A typical week: sign-ins in each hour of each weekday, Monday first. */
export function typicalWeek(): number[][] {
  /* 5 Jan 2026 is a Monday. */
  const monday = new Date(2026, 0, 5)
  return WEEKDAYS.map((_, d) =>
    Array.from({ length: 24 }, (_, h) => {
      const at = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d, h, 30)
      return Math.round(busy(at) * 420 * (0.88 + noise(d * 24 + h, 51) * 0.24))
    }),
  )
}

/* ---- words ----------------------------------------------------------------------------- */

/** "18 min ago", "3 h ago", "2 d ago". */
export function agoWord(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`
  return `${Math.round(minutes / 1440)} d ago`
}
