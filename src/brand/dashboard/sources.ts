import { useMemo } from 'react'
import { enforces, type Policy, type User } from '../data'
import { useBrand } from '../store'
import { SAMPLE_DAY } from '../screens/monitor-sample'
import { useSimEnv } from '../screens/sim-env'
import { signInActivity, type ActivityRow } from '../screens/sign-in-tests/activity'
import { bucketLabel, tickLabel } from './format'
import type { Range } from './model'
import { previousSeries, signInSeries, totals, type SignInPoint, type Totals } from './seed'

/* Where the widgets get their data: the prototype's own stores where they model the thing (policies, apps, people,
   groups, the change log, the engine's modelled sign-ins), and the Dashboard's seed where they do not. */

/** One clock for the whole visit, so every widget on a board reads the same moment. */
export const NOW = new Date()

/** Sign-ins across the range, their totals, and the totals of the range before. */
export function useSignIns(range: Range): { points: SignInPoint[]; t: Totals; before: Totals } {
  return useMemo(() => {
    const points = signInSeries(range, NOW)
    return { points, t: totals(points), before: totals(previousSeries(range, NOW)) }
  }, [range])
}

/** What a time chart calls each point, and what its axis prints: every day on a week, every few hours on a day. */
export function timeAxis(points: readonly { at: Date }[], range: Range): { labels: string[]; ticks: string[] } {
  return {
    labels: points.map((p) => bucketLabel(p.at, range)),
    ticks: points.map((p) => {
      if (range === '7d' && points.length > 7) return p.at.getHours() === 0 ? tickLabel(p.at, range) : ''
      if (range === '24h') return p.at.getHours() % 3 === 0 ? tickLabel(p.at, range) : ''
      return tickLabel(p.at, range)
    }),
  }
}

/** The tenant's own sign-in policies: not the system default, not one still being named. */
export const signInPolicies = (policies: readonly Policy[]) => policies.filter((p) => p.type === 'App Access' && !p.isSystem && !p.provisional)

export function usePolicyFacts() {
  const store = useBrand()
  return useMemo(() => {
    const mine = signInPolicies(store.policies)
    const live = mine.filter(enforces)
    const covered = new Set(live.flatMap((p) => p.appIds))
    const pending = new Set(mine.filter((p) => !enforces(p)).flatMap((p) => p.appIds))
    return {
      mine,
      live,
      drafts: mine.filter((p) => p.status === 'draft'),
      inactive: mine.filter((p) => p.status === 'inactive'),
      watching: mine.filter((p) => p.status === 'monitor'),
      covered,
      /** Apps with a policy, none of it active yet. */
      waiting: store.apps.filter((a) => !covered.has(a.id) && pending.has(a.id)),
      /** Apps with no policy of their own at all. */
      bare: store.apps.filter((a) => !covered.has(a.id) && !pending.has(a.id)),
    }
  }, [store.policies, store.apps])
}

/** The engine's modelled sign-ins: who, to what, and what decided it. Newest first. */
export function useActivity(): ActivityRow[] {
  const store = useBrand()
  const env = useSimEnv()
  return useMemo(
    () => [...signInActivity(store.policies, env, SAMPLE_DAY, store.apps)].sort(newestFirst),
    [store.policies, env, store.apps],
  )
}

/**
 * Recent sign-ins as the dashboard shows them (dashboardPolish): a varied handful from the newest-first week.
 *
 * `rows` is newest first. In the seed every application shares the same twelve time slots, so the newest slot
 * alone is 13 rows, mostly Sanjay Bhatt and Arun Patel, all Allowed. Return the rows in the order the table should
 * show them; the table shows only as many from the top as fit (4 to 8), so the first few matter most. Pure.
 */
export function recentMix(rows: readonly ActivityRow[]): ActivityRow[] {
  /* Each person's newest sign-in, newest people first: nobody repeats until everyone has had a row. */
  const seen = new Set<string>()
  const spread = rows.filter((r) => !seen.has(r.who) && !!seen.add(r.who))
  const head = spread.slice(0, MIX_HEAD)
  /* A refusal in the top rows when the week has one: it takes its own person's place, or the last place. */
  const blocked = rows.find((r) => r.result === 'blocked')
  if (blocked && !head.some((r) => r.result === 'blocked')) {
    const own = head.findIndex((r) => r.who === blocked.who)
    head.splice(own >= 0 ? own : head.length - 1, 1, blocked)
  }
  head.sort(newestFirst)
  /* Then the other people, from where the top rows end, so When keeps reading down in time; then everything else. */
  const last = head.at(-1)
  const people = new Set(head.map((r) => r.who))
  const next = last ? rows.filter((r) => newestFirst(last, r) <= 0 && !head.includes(r) && !people.has(r.who) && !!people.add(r.who)) : []
  const used = new Set([...head, ...next].map((r) => r.id))
  return [...head, ...next, ...rows.filter((r) => !used.has(r.id))]
}

/** How many rows `recentMix` arranges: the fewest a Recent sign-ins tile shows at its smallest. */
const MIX_HEAD = 4

const newestFirst = (a: ActivityRow, b: ActivityRow) => b.date.localeCompare(a.date) || b.when.localeCompare(a.when)

/** The person at a position in the directory, wrapping round: sample data names nobody itself. */
export const personAt = (users: readonly User[], n: number): User | undefined => (users.length ? users[n % users.length] : undefined)

/** The item at a position in a list, wrapping round. */
export const pickAt = <T>(list: readonly T[], n: number): T | undefined => (list.length ? list[n % list.length] : undefined)
