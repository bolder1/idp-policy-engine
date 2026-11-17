import { useMemo } from 'react'
import { useBrand } from '../store'
import { blockedReason, mergeOffers, planMove, type MoveContext } from './plan'

/** What a move would do now: the old policies that can move and the plan for them. */
export function useMovePlan(pick?: string[]) {
  const store = useBrand()
  const { legacy, movedLegacy, moveApps: apps, groups, zones, policies, users, methods, staged, fingerprints } = store
  const ctx = useMemo<MoveContext>(
    () => ({ apps, groups, users, zones, policies, staged, methods: methods.map((m) => m.name), fingerprints }),
    [apps, groups, users, zones, policies, staged, methods, fingerprints],
  )
  const pending = legacy.policies.filter((lp) => !movedLegacy[lp.id])
  const movable = pending.filter((lp) => !blockedReason(lp, ctx))
  const selected = useMemo(() => movable.filter((lp) => !pick || pick.includes(lp.id)), [movable, pick])
  const offers = useMemo(() => mergeOffers(selected, ctx), [selected, ctx])
  const plan = useMemo(() => planMove(selected, legacy, ctx, offers.map((o) => o.key)), [selected, legacy, ctx, offers])
  const count = selected.length
  const newCount = plan.policies.filter((pp) => !pp.into).length
  return { plan, count, newCount }
}
