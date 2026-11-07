/* -----------------------------------------------------------------------------
   The old console's sign-in policies, as a tenant moving to the new builder has them.

   Two objects, as the live console keeps them (docs/research/live-console-apps-users-groups-10-oct.md,
   read 10 Oct 2026):

   - A sign-in policy row is ONE group on ONE application: First Factor, an optional
     2-Factor block (method, Remember MFA, "Allow end users to enable/disable"), Force
     MFA, and an optional adaptive block that names an adaptive policy, ticks which of its
     four restrictions apply and joins them with AND / OR.
   - An adaptive policy holds the restriction values: IP, Device, Location, Time.

   What a failed restriction does (Deny or ask for MFA) is held once on the adaptive
   policy here. The handbook describes it per restriction; that page has not been read
   on screen, so this is the simplest shape that agrees with both until it is.

   FABRICATED, like every name in data.ts: four applications in the showcase tenant
   that have no policy in the new builder yet (Salesforce, ServiceNow, Workday, Zoom),
   plus two rows for applications that already do, so Select has something it refuses.
   -------------------------------------------------------------------------- */

/** The live console's own word for the group every user is in. */
export const DEFAULT_GROUP = 'DEFAULT'

/** The live console's first entry in Select MFA Method. */
export const DEFAULT_METHOD = 'Use Default MFA Method'

export type LegacyCheck = 'ip' | 'device' | 'location' | 'time'

export interface LegacyAdaptive {
  id: string
  name: string
  ip?: string[]
  location?: { countries: string[] }
  time?: { days: string[]; from: string; to: string; tz: string }
  device?: { max: number }
  /** What a sign-in that fails the restrictions gets. */
  onFail: 'deny' | 'challenge'
}

export interface LegacyPolicy {
  id: string
  name: string
  /** A group id, or DEFAULT_GROUP. */
  groupId: string
  appId: string
  firstFactor: 'Password' | 'Password-less'
  mfa?: {
    method: string
    rememberDays?: number
    /** "Allow end users to enable/disable 2-Factor Authentication (MFA)". */
    userCanTurnOff?: boolean
  }
  adaptive?: { policyId: string; using: 'and' | 'or'; checks: LegacyCheck[] }
  forceMfa?: boolean
}

export interface LegacyEstate {
  policies: LegacyPolicy[]
  adaptive: LegacyAdaptive[]
}

export const showcaseLegacy: LegacyEstate = {
  adaptive: [
    {
      id: 'ad-sales-hours',
      name: 'Sales working hours',
      time: { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], from: '08:00', to: '20:00', tz: 'Asia/Kolkata' },
      onFail: 'challenge',
    },
    { id: 'ad-india', name: 'India only', location: { countries: ['India'] }, onFail: 'deny' },
    { id: 'ad-contractor', name: 'Contractor network', ip: ['203.0.113.0/24'], device: { max: 2 }, onFail: 'deny' },
  ],
  policies: [
    {
      id: 'lp-sf-sales',
      name: 'Salesforce Sales',
      groupId: 'sales',
      appId: 'salesforce',
      firstFactor: 'Password',
      adaptive: { policyId: 'ad-sales-hours', using: 'and', checks: ['time'] },
    },
    {
      id: 'lp-sf-finance',
      name: 'Salesforce Finance',
      groupId: 'finance',
      appId: 'salesforce',
      firstFactor: 'Password',
      mfa: { method: 'OTP over Email', rememberDays: 7 },
      adaptive: { policyId: 'ad-india', using: 'and', checks: ['location'] },
    },
    { id: 'lp-sf-default', name: 'Salesforce Default', groupId: DEFAULT_GROUP, appId: 'salesforce', firstFactor: 'Password' },
    {
      id: 'lp-sn-eng',
      name: 'ServiceNow Engineering',
      groupId: 'engineering',
      appId: 'servicenow',
      firstFactor: 'Password',
      mfa: { method: 'Google Authenticator' },
    },
    {
      id: 'lp-sn-contractors',
      name: 'ServiceNow Contractors',
      groupId: 'contractors',
      appId: 'servicenow',
      firstFactor: 'Password',
      mfa: { method: 'OTP over SMS' },
      forceMfa: true,
      adaptive: { policyId: 'ad-contractor', using: 'and', checks: ['ip', 'device'] },
    },
    {
      id: 'lp-workday',
      name: 'Workday Default',
      groupId: DEFAULT_GROUP,
      appId: 'workday',
      firstFactor: 'Password',
      mfa: { method: DEFAULT_METHOD, rememberDays: 30, userCanTurnOff: true },
    },
    {
      id: 'lp-zoom',
      name: 'Zoom Default',
      groupId: DEFAULT_GROUP,
      appId: 'zoom',
      firstFactor: 'Password',
      mfa: { method: DEFAULT_METHOD, rememberDays: 30, userCanTurnOff: true },
    },
    { id: 'lp-slack', name: 'Slack Default', groupId: DEFAULT_GROUP, appId: 'slack', firstFactor: 'Password', mfa: { method: DEFAULT_METHOD } },
    { id: 'lp-aws-eng', name: 'AWS Engineering', groupId: 'engineering', appId: 'aws', firstFactor: 'Password-less' },
  ],
}

export const EMPTY_LEGACY: LegacyEstate = { policies: [], adaptive: [] }

/* The old console at scale (scale-seed.ts): about a hundred rows and the forty-seven applications they protect,
   for the stress cases (owner, 3 Nov 2026). Off = the nine showcase rows above, and the showcase's own applications. */
export const MIGRATE_SCALE = true

/* The new builder as a tenant first meets it (owner, 3 Nov 2026: "think of it as a fresh builder with no policy"): no
   sign-in policies of its own, the move from the old builder waiting on an empty page. All Policies' Empty / With
   policies switch flips it while the app runs; false opens on the seeded showcase policies. */
export const FRESH_BUILDER = true

/** The day the old builder closes, YYYY-MM-DD (owner, 3 Nov 2026: "we can give till August"). Whatever has not been
    moved by then is merged into the new builder for the tenant. */
export const OLD_CLOSES = '2027-08-31'

/* The moments the banner is designed at (owner, 4 Nov 2026): today, when no time is shown, and from three months out
   the five points the countdown is seen at. */
export type DeadlineView = 'now' | '3m' | '45' | '30' | '15' | '7'
export const DEADLINE_VIEWS: { value: DeadlineView; label: string }[] = [
  { value: 'now', label: 'Today' },
  { value: '3m', label: '3 months left' },
  { value: '45', label: '45 days left' },
  { value: '30', label: '30 days left' },
  { value: '15', label: '15 days left' },
  { value: '7', label: '7 days left' },
]

/** The countdown shows from three months out (owner, 4 Nov 2026); before that the banner says the date only. */
export const SHOW_TIME_DAYS = 92

/* When this page was loaded: a previewed moment starts there and runs on with the real clock. */
const LOADED = Date.now()

/** The clock the banner reads: today's, or the closing day less three months or that many days, at midnight, running
    on from the page's load so the hours and minutes tick down as they would. */
export function deadlineNow(view: DeadlineView, today = new Date(), closes = OLD_CLOSES, loaded = LOADED): Date {
  if (view === 'now') return today
  const [y, m, d] = closes.split('-').map(Number)
  const at = new Date(y, m - 1, d)
  if (view === '3m') at.setMonth(at.getMonth() - 3)
  else at.setDate(at.getDate() - Number(view))
  return new Date(at.getTime() + Math.max(0, today.getTime() - loaded))
}

/** Whole days, hours and minutes to the start of the closing day: the widget's three tiles. */
export function timeLeft(now: Date, closes = OLD_CLOSES): { days: number; hours: number; minutes: number } {
  const [y, m, d] = closes.split('-').map(Number)
  const ms = Math.max(0, new Date(y, m - 1, d).getTime() - now.getTime())
  return { days: Math.floor(ms / 86_400_000), hours: Math.floor((ms % 86_400_000) / 3_600_000), minutes: Math.floor((ms % 3_600_000) / 60_000) }
}

/** The day the move opened: the new builder's release, the start of the window the banner's bar measures. */
export const OLD_OPENS = '2026-11-03'

/** How much of the window from opening to closing has gone, 0 to 1. */
export function windowGone(now: Date, opens = OLD_OPENS, closes = OLD_CLOSES): number {
  const at = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  return Math.min(1, Math.max(0, (now.getTime() - at(opens)) / (at(closes) - at(opens))))
}

/** Months, days, hours and minutes from `now` to the start of the closing day, by the calendar; zeros on and after it. */
export function countdown(now: Date, closes = OLD_CLOSES): { months: number; days: number; hours: number; minutes: number } {
  const [y, m, d] = closes.split('-').map(Number)
  const end = new Date(y, m - 1, d)
  if (now >= end) return { months: 0, days: 0, hours: 0, minutes: 0 }
  let months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
  const shifted = (n: number) => {
    const s = new Date(now)
    s.setMonth(s.getMonth() + n)
    return s
  }
  if (shifted(months) > end) months -= 1
  const from = shifted(months)
  const ms = end.getTime() - from.getTime()
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return { months, days, hours, minutes }
}

/** Whole days from `now` until the old builder closes; 0 on and after the day. */
export function daysLeft(now: Date, closes = OLD_CLOSES): number {
  const [y, m, d] = closes.split('-').map(Number)
  const end = new Date(y, m - 1, d).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.max(0, Math.round((end - today) / 86_400_000))
}

/** Which stage the time left is at: the banner's colour, one per stage, warming as the days go (owner, 4 Nov 2026:
    white until two months out, then blue, yellow, orange, and a light red in the last week). */
export function stageOf(days: number): 0 | 1 | 2 | 3 | 4 {
  return days > 60 ? 0 : days > 30 ? 1 : days > 15 ? 2 : days > 7 ? 3 : 4
}

/** The banner's colour as the day nears: blue, then amber from 60 days, red in the last 14 (owner's pick, 3 Nov 2026). */
export function urgencyOf(days: number): 'info' | 'notice' | 'negative' {
  return days > 60 ? 'info' : days > 14 ? 'notice' : 'negative'
}
