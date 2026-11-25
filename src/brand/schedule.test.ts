import { describe, expect, it } from 'vitest'

import { card, cond, type Condition, type ConditionCard } from './data'
import { showcaseTenant, tenantAt } from './fixtures'
import { allOf, anyOf, cardJoin, ckey, type CondState } from './predicate'
import {
  DEFAULT_SCHEDULE,
  holdsAt,
  holdsAtSomeDay,
  mergeTimeCard,
  readSchedule,
  scheduleGap,
  scheduleSummary,
  writeSchedule,
  type Weekday,
} from './schedule'
import { evalCondition, rawEnv, type SignInFacts } from './screens/simulate'

const at = (weekday: Weekday, hhmm: string) => [weekday, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))] as const

describe('Sign-in time values', () => {
  it('round-trips Monday first, a bare day being the whole day', () => {
    const v = ['Saturday', 'Monday 09:00-18:00', 'Friday 22:00-06:00']
    expect(writeSchedule(readSchedule(v))).toEqual(['Monday 09:00-18:00', 'Friday 22:00-06:00', 'Saturday'])
    expect(readSchedule(['Saturday'])[0]).toEqual({ day: 'Saturday', hours: null })
  })

  it('starts on the working week, 09:00 to 18:00', () => {
    expect(DEFAULT_SCHEDULE).toEqual(['Monday 09:00-18:00', 'Tuesday 09:00-18:00', 'Wednesday 09:00-18:00', 'Thursday 09:00-18:00', 'Friday 09:00-18:00'])
  })

  it('says what stops it being saved', () => {
    expect(scheduleGap([])).toBe('Choose at least one day.')
    expect(scheduleGap(['Monday 09:00-'])).toBe('Choose both times.')
    expect(scheduleGap(['Monday 09:00-09:00'])).toBe('Choose an end time that differs from the start.')
    expect(scheduleGap(DEFAULT_SCHEDULE)).toBeNull()
  })

  it('summarises days that share hours together, with the zone', () => {
    expect(scheduleSummary([...DEFAULT_SCHEDULE, 'Saturday 10:00-14:00'], 'Asia/Kolkata')).toBe('Mon–Fri 09:00–18:00, Sat 10:00–14:00 · Kolkata')
    expect(scheduleSummary(['Friday 22:00-06:00'])).toBe('Fri 22:00–06:00 next day · Tenant time zone')
  })
})

describe('Sign-in time matching', () => {
  const week = readSchedule(DEFAULT_SCHEDULE)
  const nights = readSchedule(['Friday 22:00-06:00'])

  it('holds inside a day’s hours, both ends to the minute', () => {
    expect(holdsAt(week, ...at('Monday', '09:00'))).toBe(true)
    expect(holdsAt(week, ...at('Monday', '18:00'))).toBe(true)
    expect(holdsAt(week, ...at('Monday', '18:01'))).toBe(false)
    expect(holdsAt(week, ...at('Saturday', '12:00'))).toBe(false)
  })

  it('gives an overnight window to the day it starts on', () => {
    expect(holdsAt(nights, ...at('Friday', '23:30'))).toBe(true)
    expect(holdsAt(nights, ...at('Saturday', '02:00'))).toBe(true)
    expect(holdsAt(nights, ...at('Saturday', '06:01'))).toBe(false)
    // Friday's own early hours belong to Thursday, which has none.
    expect(holdsAt(nights, ...at('Friday', '02:00'))).toBe(false)
  })

  it('answers without a day only when the day cannot change the answer', () => {
    expect(holdsAtSomeDay(week, 3 * 60)).toBe('fail')
    expect(holdsAtSomeDay(week, 10 * 60)).toBe('unknown')
    expect(holdsAtSomeDay(readSchedule(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']), 3 * 60)).toBe('pass')
  })

  it('reads the day and hour on the condition’s own clock', () => {
    const c = cond('schedule', 'within', DEFAULT_SCHEDULE, undefined, { tz: 'Europe/Berlin' })
    // Monday 13:00 in Kolkata is Monday 08:30 in Berlin (winter): before the hours.
    const facts: SignInFacts = { when: { date: '2026-11-23', time: '13:00', timeZone: 'Asia/Kolkata', source: 'stated' } }
    expect(evalCondition(c, facts, rawEnv).status).toBe('fail')
    const later: SignInFacts = { when: { date: '2026-11-23', time: '14:00', timeZone: 'Asia/Kolkata', source: 'stated' } }
    expect(evalCondition(c, later, rawEnv).status).toBe('pass')
    expect(evalCondition({ ...c, operator: 'outside' }, later, rawEnv).status).toBe('fail')
  })

  it('asks for the date only when the hour cannot settle it', () => {
    const c = cond('schedule', 'within', DEFAULT_SCHEDULE)
    const night: SignInFacts = { when: { time: '03:00', timeZone: 'Asia/Kolkata', source: 'stated' } }
    const noon: SignInFacts = { when: { time: '12:00', timeZone: 'Asia/Kolkata', source: 'stated' } }
    expect(evalCondition(c, night, rawEnv).status).toBe('fail')
    expect(evalCondition(c, noon, rawEnv)).toMatchObject({ status: 'unknown', missing: ['date'] })
  })

  it('keys a schedule by its zone, and nothing else by one', () => {
    const k = cond('schedule', 'within', DEFAULT_SCHEDULE, undefined, { tz: 'Asia/Kolkata' })
    const b = cond('schedule', 'within', DEFAULT_SCHEDULE, undefined, { tz: 'Europe/Berlin' })
    expect(ckey(k)).not.toBe(ckey(b))
    const t = cond('time', 'between', ['09:00', '18:00'], undefined, { tz: 'Asia/Kolkata' })
    expect(ckey(t)).toBe('time|between|09:00,18:00|')
  })
})

/* The conversion must move no verdict: every card it changes in the seeds is asked at every half hour of a week, from
   two zones, before and after. */
describe('Seeded pairs read as one', () => {
  const stateOf = (k: ConditionCard, facts: SignInFacts): CondState => {
    const each = k.conditions.map((c) => evalCondition(c, facts, rawEnv, k).status)
    return cardJoin(k) === 'or' ? anyOf(each) : allOf(each)
  }
  const dates = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']
  const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)
  const zones = ['Asia/Kolkata', 'America/New_York']

  const cards = [...tenantAt('medium').policies, ...showcaseTenant().policies].flatMap((p) => p.rules.flatMap((r) => r.when.cards))
  const changed = cards.map((k) => [k, mergeTimeCard(k)] as const).filter(([a, b]) => a !== b)

  it('converts the seeded office-hours pairs', () => {
    expect(changed.length).toBeGreaterThan(0)
    for (const [, b] of changed) {
      expect(b.conditions.some((c) => c.typeId === 'schedule')).toBe(true)
    }
  })

  /* Under a second alone, and several thousand time-zone reads: a busy full run can pass the default 5 s. */
  it('gives every converted card the verdicts it had', () => {
    for (const [a, b] of changed)
      for (const date of dates)
        for (const time of times)
          for (const timeZone of zones) {
            const facts: SignInFacts = { when: { date, time, timeZone, source: 'stated' } }
            expect(stateOf(b, facts), `${date} ${time} ${timeZone}`).toBe(stateOf(a, facts))
          }
  }, 30_000)

  it('leaves what one schedule cannot say', () => {
    const outsideHoursOnWeekdays = card(cond('day', 'is', ['Monday']), cond('time', 'not between', ['09:00', '18:00']))
    expect(mergeTimeCard(outsideHoursOnWeekdays)).toBe(outsideHoursOnWeekdays)
    const nightShift = card(cond('day', 'is', ['Friday']), cond('time', 'between', ['22:00', '06:00']))
    expect(mergeTimeCard(nightShift)).toBe(nightShift)
  })

  it('keeps the hours’ id and zone', () => {
    const t: Condition = cond('time', 'between', ['09:00', '18:00'], undefined, { tz: 'Europe/Berlin' })
    const merged = mergeTimeCard(card(cond('day', 'is', ['Monday', 'Tuesday']), t))
    expect(merged.conditions).toEqual([{ id: t.id, typeId: 'schedule', operator: 'within', values: ['Monday 09:00-18:00', 'Tuesday 09:00-18:00'], tz: 'Europe/Berlin' }])
  })
})
