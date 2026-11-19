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
    () => [...signInActivity(store.policies, env, SAMPLE_DAY, store.apps)].sort((a, b) => b.date.localeCompare(a.date) || b.when.localeCompare(a.when)),
    [store.policies, env, store.apps],
  )
}

/** The person at a position in the directory, wrapping round: sample data names nobody itself. */
export const personAt = (users: readonly User[], n: number): User | undefined => (users.length ? users[n % users.length] : undefined)

/** The item at a position in a list, wrapping round. */
export const pickAt = <T>(list: readonly T[], n: number): T | undefined => (list.length ? list[n % list.length] : undefined)
