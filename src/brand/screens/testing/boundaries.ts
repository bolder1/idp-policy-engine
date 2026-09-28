import { zoneScopeOf, type AccessDecision, type Condition, type Policy, type Zone, type ZoneRange } from '../../data'
import { rangeKm, withinRange } from '../../places'
import { leaves } from '../../predicate'
import { TENANT_TZ, clock, minutesIn, type SimEnv } from '../simulate'
import { resolveSignIn, type ResolveOptions } from '../tenant-resolver'
import { policiesOn, rulesOn, type RowsRead } from './rows-read'
import { bandAt, distanceNow } from './sign-in-fields'
import { distancePlace, factsOf, type SignInForm } from './sign-in-form'

/* -----------------------------------------------------------------------------
   Where a sign-in's answer changes, printed on the control that states it.

   A risk score of 48 gets 2FA. What a tester wants to know next is how far 48
   is from the next answer, and a slider with nothing on it makes them find out
   by dragging. So the risk, time and distance controls print their edges —
   40 and 71, 25 km — and under each band the decision the tenant gives there.

   The edges come from the rules: every enabled rule of every policy on the
   application (rows-read.ts), the one being tested included. The decisions do
   not. Each band is the whole sign-in run again with only that one fact moved
   to the band's lower bound, through the same resolver every other answer on
   the page comes from — so a band never says what a rule "would" do, it says
   what this sign-in gets there. Two neighbouring bands can say the same thing:
   a threshold on another person's rule is still an edge, and the band beside
   it is where it does not apply to this one.

     risk      "below 40" is an edge at 40, "above 70" one at 71: the evaluator
               compares strictly, so 0–39, 40–70 and 71 up are the bands
     time      a window's start, and the minute after its end, moved onto the
               sign-in's own clock when the window names another zone
     distance  the range's own edge, on a ruler out to four times its radius:
               inside up to it, outside from the kilometre after. The edge is
               asked, not assumed — the last whole kilometre whose ruler point
               the range holds, by the evaluator's own inclusive test

   A band's decision is null where the sign-in cannot be told there — grey on
   the control, never a pass.
   -------------------------------------------------------------------------- */

export interface Band {
  /** Inclusive, in the control's own unit: a score, minutes of the day, km. */
  from: number
  to: number
  /** What this sign-in gets at `from`; null when it cannot be told. */
  decision: AccessDecision | null
}

export interface Boundaries {
  risk?: { edges: number[]; bands: Band[] }
  /** Minutes of the day on the sign-in's own clock, in `timeZone`. */
  time?: { edges: number[]; timeZone: string; bands: Band[] }
  /** The ruler: kilometres due north of a zone's range centre. */
  distance?: Ruler
}

export interface Ruler {
  zoneId: string
  rangeIndex: number
  centre: string
  /** The last whole kilometre inside the range. */
  edge: number
  max: number
  bands: Band[]
  /** Where the sign-in stands, in whole km from the centre — past `max` too — or null when its place has no point to measure from. */
  now: number | null
  /* Whether the band under `now` gives what the sign-in gets. It does not where
     the zone takes the place by name: Bengaluru, 728 km out, is on the zone's
     city list, and the ruler measures distance and nothing else. */
  agrees: boolean
}

const RISK_MAX = 100
const DAY_END = 1439

/* The bands between edges: from 0, each edge opening the next, the last one
   running to `max`. */
function bandsOf(edges: readonly number[], max: number, at: (n: number) => AccessDecision | null): Band[] {
  const starts = [0, ...edges]
  return starts.map((from, i) => ({ from, to: (starts[i + 1] ?? max + 1) - 1, decision: at(from) }))
}

const sorted = (ns: Iterable<number>) => [...new Set(ns)].sort((a, b) => a - b)

const toMinutes = (hhmm: string): number | null => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function boundariesOf(
  form: SignInForm,
  read: RowsRead,
  opts: ResolveOptions,
  policies: readonly Policy[],
  env: SimEnv,
  zones: readonly Zone[],
): Boundaries {
  const decisionAt = (patch: Partial<SignInForm>): AccessDecision | null => {
    const r = resolveSignIn(policies, factsOf({ ...form, ...patch }, zones).facts, env, opts)
    return r.status === 'decided' ? r.decision : null
  }
  const conditions = rulesOn(policiesOn(policies, form.appId, opts.substitute)).flatMap((r) => leaves(r.when))
  const out: Boundaries = {}

  if (read.rows.has('risk')) {
    const edges = sorted(
      conditions.flatMap((c) => {
        if (c.typeId !== 'device-risk') return []
        const v = Number(c.values[0])
        if (!Number.isFinite(v)) return []
        const edge = c.operator === 'above' ? Math.floor(v) + 1 : Math.ceil(v)
        return edge > 0 && edge <= RISK_MAX ? [edge] : []
      }),
    )
    if (edges.length > 0) out.risk = { edges, bands: bandsOf(edges, RISK_MAX, (n) => decisionAt({ risk: String(n) })) }
  }

  if (read.rows.has('time-track')) {
    const timeZone = form.timeZone || TENANT_TZ
    const edges = sorted(
      conditions.flatMap((c) => {
        if (c.typeId !== 'time') return []
        const from = toMinutes(c.values[0] ?? '00:00')
        const to = toMinutes(c.values[1] ?? '23:59')
        if (from === null || to === null) return []
        /* How far the window's clock is from the sign-in's, on the sign-in's
           date: read at midday, clear of any change of clocks. */
        const noon = minutesIn({ ...(form.date ? { date: form.date } : null), time: '12:00', timeZone }, c.tz ?? TENANT_TZ)
        if (noon === null) return []
        const shift = noon - 720
        return [from, to + 1].filter((m) => m <= DAY_END).map((m) => (((m - shift) % 1440) + 1440) % 1440)
      }),
    ).filter((m) => m > 0)
    if (edges.length > 0) out.time = { edges, timeZone, bands: bandsOf(edges, DAY_END, (m) => decisionAt({ time: clock(m) })) }
  }

  if (read.rows.has('distance')) {
    const ruler = rulerOf(form, conditions, zones)
    if (ruler) {
      const { zoneId, rangeIndex, range, centre } = ruler
      const km = rangeKm(range)
      const edge = lastInside(zones, zoneId, rangeIndex, range)
      const max = Math.max(100, Math.ceil(4 * km))
      const bands = bandsOf([edge + 1], max, (n) => decisionAt({ place: { kind: 'distance', zoneId, rangeIndex, km: n } }))
      const now = distanceNow(form, factsOf(form, zones).facts, zones, zoneId, rangeIndex)
      const under = now === null ? undefined : bandAt(bands, Math.min(max, now))
      out.distance = { zoneId, rangeIndex, centre, edge, max, bands, now, agrees: under !== undefined && under.decision === decisionAt({}) }
    }
  }

  return out
}

/* The range the ruler measures from: the one the form already stands on, else
   the first range of the first zone a rule on the application asks about by
   place. */
function rulerOf(
  form: SignInForm,
  conditions: readonly Condition[],
  zones: readonly Zone[],
): { zoneId: string; rangeIndex: number; range: ZoneRange; centre: string } | null {
  const at = (zoneId: string, rangeIndex: number) => {
    const r = zones.find((z) => z.id === zoneId)?.location.ranges[rangeIndex]
    return r ? { zoneId, rangeIndex, range: r, centre: r.label } : null
  }
  if (form.place.kind === 'distance') {
    const stood = at(form.place.zoneId, form.place.rangeIndex)
    if (stood) return stood
  }
  for (const c of conditions) {
    if (c.typeId !== 'zone') continue
    for (const id of c.values) {
      if (zoneScopeOf(c, id) === 'ip') continue
      const found = at(id, 0)
      if (found) return found
    }
  }
  return null
}

/* The last whole kilometre the range holds, asked of the point the ruler
   states there with the evaluator's own test (`withinRange`) rather than read
   off the radius. Read off it, a point that measured back a hair past 25
   printed "inside to 25 km" over a thumb that got Deny at 25. */
function lastInside(zones: readonly Zone[], zoneId: string, rangeIndex: number, range: ZoneRange): number {
  const inside = (k: number) => {
    const p = distancePlace(zones, zoneId, rangeIndex, k)
    return p !== undefined && p.lat !== null && p.lon !== null && withinRange({ lat: p.lat, lon: p.lon }, range)
  }
  let k = Math.floor(rangeKm(range)) + 1
  while (k > 0 && !inside(k)) k--
  return k
}
