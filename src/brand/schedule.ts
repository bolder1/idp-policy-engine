import type { Condition, ConditionCard, Policy } from './data'
import { shows } from './rollout'

/* Sign-in time: the days, the hours and the time zone of a sign-in, as ONE condition (owner, 24 Nov 2026: "combine
   this together as one thing … check Google Calendar … the user can do all together in a better experience").

   Sign-in hours and Sign-in days were two conditions, and the split cost more than it saved: the time zone lived on the
   hours, so a day borrowed it from an hours row in the same card, the canvas never showed it, and "not between 09–18"
   beside "day is Mon–Fri" did not mean "outside office hours". Describe (`WhenAnswer`) and the old console's own model
   (migrate/legacy.ts) were already one shape. His rulings, from four questions:
     · the row shows a one-line summary, and a picker opens from it;
     · each day has its own hours;
     · an overnight window belongs to the day it STARTS on — Fri 22:00–06:00 covers Saturday 02:00;
     · on Design, a seeded Sign-in days + Sign-in hours pair reads as one Sign-in time.

   Design only (rollout.ts `signInTime`). `time` and `day` stay in the catalogue: the other lines still author them, and
   seeds, migration and the tests name them. */
export const SIGN_IN_TIME: boolean = shows('signInTime')

export const SCHEDULE = 'schedule'

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const SHORT_DAY: Record<Weekday, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
}

export interface Hours {
  from: string
  to: string
}

/** One day of a schedule. `hours: null` is the whole day. */
export interface DayHours {
  day: Weekday
  hours: Hours | null
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
export const isClock = (s: string): boolean => CLOCK.test(s)
export const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** An end earlier than the start: the window runs past midnight into the next day. */
export const overnight = (h: Hours): boolean => isClock(h.from) && isClock(h.to) && minutesOf(h.to) < minutesOf(h.from)

const isWeekday = (s: string): s is Weekday => (WEEKDAYS as readonly string[]).includes(s)
/* An end left out still reads as that day's hours, so the row can say "Choose both times." rather than lose the day. */
const VALUE = /^(\S+)(?:\s+(\S*)-(\S*))?$/

/* Stored one day per value, Monday first: "Monday 09:00-18:00", or the day's name alone for the whole day.

   Strings rather than a new field, so the condition keeps the shape every reader already handles: `values` sorts into
   `ckey`, compares in the JSON dirty checks, and empties into the unset state the catalogue already diagnoses. A day
   with no time is the whole day, which is what "Saturday" means said aloud. */
export function readSchedule(values: readonly string[]): DayHours[] {
  const byDay = new Map<Weekday, Hours | null>()
  for (const v of values) {
    const m = VALUE.exec(v.trim())
    if (!m || !isWeekday(m[1])) continue
    byDay.set(m[1], m[2] !== undefined ? { from: m[2], to: m[3] } : null)
  }
  return WEEKDAYS.filter((d) => byDay.has(d)).map((day) => ({ day, hours: byDay.get(day) ?? null }))
}

export function writeSchedule(days: readonly DayHours[]): string[] {
  const byDay = new Map(days.map((d) => [d.day, d.hours]))
  return WEEKDAYS.filter((d) => byDay.has(d)).map((day) => {
    const h = byDay.get(day)
    return h ? `${day} ${h.from}-${h.to}` : day
  })
}

export const DEFAULT_HOURS: Hours = { from: '09:00', to: '18:00' }
export const WORK_WEEK: readonly Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
export const WEEKEND: readonly Weekday[] = ['Saturday', 'Sunday']

/** What a new Sign-in time holds: the working week, 09:00 to 18:00 — the hours Describe already proposes. */
export const DEFAULT_SCHEDULE: string[] = writeSchedule(WORK_WEEK.map((day) => ({ day, hours: DEFAULT_HOURS })))

const prevDay = (d: Weekday): Weekday => WEEKDAYS[(WEEKDAYS.indexOf(d) + 6) % 7]

/* Whether the schedule holds on a weekday at a minute of the day, read on the condition's own clock.

   A day's own hours, or the day before's overnight hours running into this one: the start day owns an overnight
   window (owner, 24 Nov 2026), so Friday 22:00–06:00 covers Saturday 02:00 and Monday 02:00 belongs to Sunday's
   hours, if Sunday has any. Both ends count to the minute, as Sign-in hours always has — 09:00–18:00 holds at 18:00. */
export function holdsAt(days: readonly DayHours[], weekday: Weekday, minute: number): boolean {
  const today = days.find((d) => d.day === weekday)
  if (today) {
    if (!today.hours) return true
    const from = minutesOf(today.hours.from)
    const to = minutesOf(today.hours.to)
    if (from <= to ? minute >= from && minute <= to : minute >= from) return true
  }
  const before = days.find((d) => d.day === prevDay(weekday))
  return !!before?.hours && overnight(before.hours) && minute <= minutesOf(before.hours.to)
}

/* With no weekday to read — a rehearsal with no date — the schedule still answers when the day cannot change the
   answer: it holds when every day holds at this minute, and fails when none does. Only a minute some days hold and
   others do not is undecided. So a sign-in at 03:00 against Mon–Fri 09:00–18:00 still fails, as Sign-in hours did. */
export function holdsAtSomeDay(days: readonly DayHours[], minute: number): 'pass' | 'fail' | 'unknown' {
  const each = WEEKDAYS.map((d) => holdsAt(days, d, minute))
  return each.every(Boolean) ? 'pass' : each.some(Boolean) ? 'unknown' : 'fail'
}

/** What stops a schedule from being saved, said under the row; null when nothing does. */
export function scheduleGap(values: readonly string[]): string | null {
  const days = readSchedule(values)
  if (days.length === 0) return 'Choose at least one day.'
  if (days.some((d) => d.hours && (!isClock(d.hours.from) || !isClock(d.hours.to)))) return 'Choose both times.'
  if (days.some((d) => d.hours && d.hours.from === d.hours.to)) return 'Choose an end time that differs from the start.'
  return null
}

// --- Words ----------------------------------------------------------------------------------------------------------

/** A time zone as the summary says it: its city, or the tenant's own. */
export const zoneWords = (tz?: string): string => (tz ? (tz.split('/').pop() ?? tz).replace(/_/g, ' ') : 'Tenant time zone')

/** One day's hours, said after the days: "09:00–18:00", "22:00–06:00 next day", or "all day". */
export const hoursWords = (h: Hours | null): string => (h ? `${h.from}–${h.to}${overnight(h) ? ' next day' : ''}` : 'all day')

/* A set of days, as the summary and the canvas chip name it.

   The days arrive Monday first and never empty. */
export function daysWords(days: readonly Weekday[]): string {
  // TODO(human): name a set of days for the summary line.
  const idx = days.map((d) => WEEKDAYS.indexOf(d))
  const runs: number[][] = []
  for (const i of idx) {
    const last = runs[runs.length - 1]
    if (last && last[last.length - 1] === i - 1) last.push(i)
    else runs.push([i])
  }
  return runs
    .map((r) => (r.length >= 3 ? `${SHORT_DAY[WEEKDAYS[r[0]]]}–${SHORT_DAY[WEEKDAYS[r[r.length - 1]]]}` : r.map((i) => SHORT_DAY[WEEKDAYS[i]]).join(', ')))
    .join(', ')
}

/* The days that share hours, each with those hours: Mon–Fri 09:00–18:00 and Sat 10:00–14:00 are two groups, Mon, Wed,
   Fri 09:00–18:00 is one. In the order each set of hours first appears, which is Monday first. */
export function scheduleGroups(values: readonly string[]): { days: Weekday[]; hours: Hours | null }[] {
  const groups: { key: string; days: Weekday[]; hours: Hours | null }[] = []
  for (const d of readSchedule(values)) {
    const key = d.hours ? `${d.hours.from}-${d.hours.to}` : 'all'
    const g = groups.find((x) => x.key === key)
    if (g) g.days.push(d.day)
    else groups.push({ key, days: [d.day], hours: d.hours })
  }
  return groups.map(({ days, hours }) => ({ days, hours }))
}

/** The schedule's days and hours on one line: "Mon–Fri 09:00–18:00, Sat 10:00–14:00". */
export const scheduleWords = (values: readonly string[]): string =>
  scheduleGroups(values)
    .map((g) => `${daysWords(g.days)} ${hoursWords(g.hours)}`)
    .join(', ')

/** The whole summary, with the time zone: "Mon–Fri 09:00–18:00 · Kolkata". */
export const scheduleSummary = (values: readonly string[], tz?: string): string => {
  const said = scheduleWords(values)
  return said ? `${said} · ${zoneWords(tz)}` : 'Choose days'
}

// --- Seeded pairs, read as one (Design) -----------------------------------------------------------------------------

const allWeek = (hours: Hours | null): DayHours[] => WEEKDAYS.map((day) => ({ day, hours }))

const asSchedule = (id: string, operator: 'within' | 'outside', days: DayHours[], tz?: string): Condition => ({
  id,
  typeId: SCHEDULE,
  operator,
  values: writeSchedule(days),
  ...(tz ? { tz } : null),
})

const windowOf = (c: Condition): Hours | null => {
  const [from, to] = c.values
  return from && to && isClock(from) && isClock(to) && from !== to ? { from, to } : null
}

const daysOf = (c: Condition): Weekday[] => WEEKDAYS.filter((d) => c.values.includes(d))

/* The Sign-in time that means EXACTLY what one card's Sign-in hours and Sign-in days mean, or null where none does —
   so converting a seed moves no verdict anywhere: not a trace, not a sweep, not a test.

   Exact, case by case:
     · hours alone: the same hours on every day, `between` → within, `not between` → outside. Overnight is exact too,
       because every day is on, so the night always has the day before it.
     · days alone: those days all day, `is` → within, `is not` → outside.
     · both, in an AND card, the hours not overnight: `day is D` → within D at those hours, `day is not D` → within the
       other days. An overnight pair is left alone: the old engine read the weekday at the sign-in, the new one at the
       window's start, and on a Friday night those disagree.
     · `not between` beside a day is "on these days, outside these hours", which one schedule cannot say. Left alone.
   The time zone comes with the hours. A day with a zone of its own that differs from the hours' is left alone. */
function scheduleFor(time: Condition | undefined, day: Condition | undefined, andCard: boolean): Condition | null {
  if (time && !day) {
    const h = windowOf(time)
    if (!h || (time.operator !== 'between' && time.operator !== 'not between')) return null
    return asSchedule(time.id, time.operator === 'between' ? 'within' : 'outside', allWeek(h), time.tz)
  }
  if (day && !time) {
    const d = daysOf(day)
    if (d.length === 0 || (day.operator !== 'is' && day.operator !== 'is not')) return null
    return asSchedule(day.id, day.operator === 'is' ? 'within' : 'outside', d.map((x) => ({ day: x, hours: null })), day.tz)
  }
  if (!time || !day || !andCard || time.operator !== 'between') return null
  if (day.tz && day.tz !== time.tz) return null
  const h = windowOf(time)
  if (!h || overnight(h)) return null
  const named = daysOf(day)
  const on = day.operator === 'is' ? named : day.operator === 'is not' ? WEEKDAYS.filter((d) => !named.includes(d)) : []
  if (named.length === 0 || on.length === 0) return null
  return asSchedule(time.id, 'within', on.map((x) => ({ day: x, hours: h })), time.tz)
}

/** One card with its Sign-in hours and Sign-in days read as one Sign-in time, where that is exact. */
export function mergeTimeCard(card: ConditionCard): ConditionCard {
  const times = card.conditions.filter((c) => c.typeId === 'time')
  const days = card.conditions.filter((c) => c.typeId === 'day')
  if (times.length > 1 || days.length > 1 || times.length + days.length === 0) return card
  const merged = scheduleFor(times[0], days[0], (card.join ?? 'and') === 'and')
  if (!merged) return card
  const gone = new Set([times[0]?.id, days[0]?.id])
  const conditions: Condition[] = []
  for (const c of card.conditions) {
    if (!gone.has(c.id)) conditions.push(c)
    else if (c.id === merged.id) conditions.push(merged)
  }
  return { ...card, conditions }
}

/** A policy whose rules read seeded time pairs as Sign-in time (Design only; the store calls it on the seed). */
export function withSignInTime(p: Policy): Policy {
  return {
    ...p,
    rules: p.rules.map((r) => ({ ...r, when: { ...r.when, cards: r.when.cards.map(mergeTimeCard) } })),
  }
}
