import { useId, useState } from 'react'
import { Check } from 'lucide-react'

import { TIMEZONES } from '../data'
import { Picker } from '../picker'
import {
  DEFAULT_HOURS,
  SHORT_DAY,
  WEEKDAYS,
  WEEKEND,
  WORK_WEEK,
  minutesOf,
  overnight,
  readSchedule,
  writeSchedule,
  type DayHours,
  type Hours,
  type Weekday,
} from '../schedule'
import { TENANT_TZ } from './sign-in-facts'
import './schedule-picker.css'

/* Sign-in time's picker (schedule.ts; owner, 24 Nov 2026: "check Google Calendar how they add meetings … combine these
   two into one"). It opens from the condition's one-line summary, in the value dropdown of the inspector row and of the
   trail's pill alike, and every change writes through at once, as every other value in that dropdown does.

   Second shape, same day (owner: "can do checkbox … can do better for the layout", "the copy looks unnecessary"). The
   first drew seven rows of switch, name, two times, an All day tick and a copy button, so the common answer — one set of
   hours on the working week — took seven rows to say. Now, label over field:
     Days      the three common answers, then a tick per day on one line;
     Hours     ONE range for every chosen day, with All day beside it; "Per day" opens a row per chosen day, for the
               admin whose Saturday is shorter (Slack's Weekdays / Custom, Apple's Every Day / Customize Days);
     Time zone and the week as a strip, so an overnight window is seen landing on the next morning.
   No copy button: with one range by default there is nothing to copy. */

const PRESETS: { label: string; days: readonly Weekday[] }[] = [
  { label: 'Every day', days: WEEKDAYS },
  { label: 'Weekdays', days: WORK_WEEK },
  { label: 'Weekends', days: WEEKEND },
]

const TENANT_LABEL = `Tenant time zone (${TENANT_TZ})`

const prevDay = (d: Weekday): Weekday => WEEKDAYS[(WEEKDAYS.indexOf(d) + 6) % 7]
const sameHours = (a: Hours | null, b: Hours | null) => (a === null || b === null ? a === b : a.from === b.from && a.to === b.to)

/* Where a day's strip is filled, in minutes: its own hours (to midnight when they run overnight), and the morning the
   day before's overnight hours run into. Both ends count to the minute, so the end is drawn one minute on. */
function filled(on: Map<Weekday, Hours | null>, day: Weekday): [number, number][] {
  const out: [number, number][] = []
  if (on.has(day)) {
    const h = on.get(day) ?? null
    if (!h) out.push([0, 1440])
    else if (overnight(h)) out.push([minutesOf(h.from), 1440])
    else out.push([minutesOf(h.from), minutesOf(h.to) + 1])
  }
  const before = on.get(prevDay(day))
  if (before && overnight(before)) out.push([0, minutesOf(before.to) + 1])
  return out
}

/** A day's hours, or All day: two times and a toggle that stands in for them. */
function HoursLine({ name, hours, onChange }: { name: string; hours: Hours | null; onChange: (h: Hours | null) => void }) {
  return (
    <>
      <span className="sp__times">
        {hours && (
          <>
            <input
              type="time"
              className="sp__time"
              aria-label={`${name} from`}
              value={hours.from}
              onChange={(e) => e.target.value && onChange({ from: e.target.value, to: hours.to })}
            />
            <span className="sp__dash" aria-hidden>
              –
            </span>
            <input
              type="time"
              className="sp__time"
              aria-label={`${name} to`}
              value={hours.to}
              onChange={(e) => e.target.value && onChange({ from: hours.from, to: e.target.value })}
            />
            {overnight(hours) && <span className="sp__next">next day</span>}
          </>
        )}
      </span>
      <button
        type="button"
        className={`sp__allday${hours ? '' : ' is-on'}`}
        aria-pressed={!hours}
        aria-label={`${name}: all day`}
        onClick={() => onChange(hours ? null : DEFAULT_HOURS)}
      >
        All day
      </button>
    </>
  )
}

export function SchedulePicker({
  values,
  tz,
  onValues,
  onTz,
}: {
  values: readonly string[]
  tz?: string
  onValues: (v: string[]) => void
  onTz: (tz: string) => void
}) {
  const days = readSchedule(values)
  const on = new Map(days.map((d) => [d.day, d.hours]))
  /* The hours a day takes when it is ticked, and the one range shown while every day shares it: the first chosen
     day's, else 09:00 to 18:00. */
  const common: Hours | null = days.length ? days[0].hours : DEFAULT_HOURS
  const differ = days.some((d) => !sameHours(d.hours, common))
  /* Per day is open by itself only when the days already differ; ticked, it stays open until it is unticked. */
  const [perDay, setPerDay] = useState(differ)
  const showRows = perDay || differ
  const daysId = useId()

  const write = (next: DayHours[]) => onValues(writeSchedule(next))
  const setDays = (pick: readonly Weekday[]) => write(pick.map((day) => ({ day, hours: on.has(day) ? (on.get(day) ?? null) : common })))
  const toggleDay = (day: Weekday) => setDays(on.has(day) ? days.map((d) => d.day).filter((d) => d !== day) : [...days.map((d) => d.day), day])
  const setAll = (h: Hours | null) => write(days.map((d) => ({ day: d.day, hours: h })))
  const setOne = (day: Weekday, h: Hours | null) => write(days.map((d) => ({ day: d.day, hours: d.day === day ? h : d.hours })))
  const isPicked = (pick: readonly Weekday[]) => pick.length === days.length && pick.every((d) => on.has(d))

  return (
    <div className="sp">
      <div className="sp__field">
        <span className="sp__label" id={daysId}>
          Days
        </span>
        <div className="sp__presets" role="group" aria-label="Quick picks">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className={isPicked(p.days) ? 'is-on' : ''} aria-pressed={isPicked(p.days)} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="sp__days" role="group" aria-labelledby={daysId}>
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              role="checkbox"
              aria-checked={on.has(day)}
              aria-label={day}
              className={`sp__day${on.has(day) ? ' is-on' : ''}`}
              onClick={() => toggleDay(day)}
            >
              <span className="bx-tick" aria-hidden>
                <Check size={11} strokeWidth={3.2} />
              </span>
              {SHORT_DAY[day]}
            </button>
          ))}
        </div>
      </div>

      {days.length > 0 && (
        <div className="sp__field">
          <div className="sp__labelrow">
            <span className="sp__label">Hours</span>
            {days.length > 1 && (
              <button
                type="button"
                role="checkbox"
                aria-checked={showRows}
                className={`sp__perday${showRows ? ' is-on' : ''}`}
                onClick={() => {
                  /* Back to one range: every day takes the first day's hours, which is what one range means. */
                  if (showRows) setAll(common)
                  setPerDay(!showRows)
                }}
              >
                <span className="bx-tick" aria-hidden>
                  <Check size={11} strokeWidth={3.2} />
                </span>
                Per day
              </button>
            )}
          </div>
          {showRows ? (
            days.map((d) => (
              <div key={d.day} className="sp__row">
                <span className="sp__rowday" title={d.day}>
                  {SHORT_DAY[d.day]}
                </span>
                <HoursLine name={d.day} hours={d.hours} onChange={(h) => setOne(d.day, h)} />
              </div>
            ))
          ) : (
            <div className="sp__row is-one">
              <HoursLine name="Hours" hours={common} onChange={setAll} />
            </div>
          )}
        </div>
      )}

      <Picker
        label="Time zone"
        size="sm"
        width="fill"
        prefix="Time zone"
        value={tz ?? ''}
        summary={tz || TENANT_LABEL}
        options={[{ value: '', label: TENANT_LABEL }, ...TIMEZONES.map((z) => ({ value: z, label: z }))]}
        onChange={onTz}
      />

      <div className="sp__week" aria-hidden>
        {WEEKDAYS.map((day) => (
          <div key={day} className="sp__wrow">
            <span className="sp__wday">{SHORT_DAY[day]}</span>
            <span className="sp__bar">
              {filled(on, day).map(([a, b]) => (
                <i key={a} style={{ left: `${(a / 1440) * 100}%`, width: `${((b - a) / 1440) * 100}%` }} />
              ))}
            </span>
          </div>
        ))}
        <div className="sp__ticks">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>
    </div>
  )
}
