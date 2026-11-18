import { useSyncExternalStore } from 'react'
import { MIGRATION_PICKERS } from './phase'
import type { Policy } from '../data'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   Which migration experience the prototype plays (owner, 16 Nov 2026: "a dropdown where we can change the experience
   based on need, so we can go through all the personas"). Three variations of what happens after the loader:

     Today        the flow as built (A), unchanged
     Assisted     what the stakeholders asked for (B): approve or reject, no editing in review, rejections go to
                  miniOrange; Make active; Roll back for the months old and new run side by side
     Self-serve   what the owner asked for (C): edit in review or from the app, ready-made checks in one click,
                  Approve, Make active, Roll back

   Kept in this browser only. The static render (tests) is always Today, so the default markup does not change.
   Beside it, the review facts the store does not keep: a rejection and its reason, a fix from miniOrange, a roll back.
   ----------------------------------------------------------------------------- */

export type MigrationExperience = 'yesterday' | 'today' | 'assisted' | 'self'

export const EXPERIENCES: { value: MigrationExperience; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'today', label: 'Today' },
  { value: 'assisted', label: 'Assisted' },
  { value: 'self', label: 'Self-serve' },
]

/** Until when an app can roll back to its old policy: the old pages stay for 6 to 8 months. An example date. */
export const ROLL_BACK_UNTIL = '15 Jun 2027'

const KEY = 'idp.migration-experience'

function read(): MigrationExperience {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'assisted' || v === 'self' || v === 'yesterday' ? v : 'today'
  } catch {
    return 'today'
  }
}

let current: MigrationExperience = typeof window === 'undefined' ? 'today' : read()
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

/** Yesterday (16 Nov 2026) is kept as it was, for comparison (owner, 17 Nov 2026); Today adds Reject, review status,
 *  Roll back and Contact support. Both are the built flow, not the Assisted or Self-serve proposals. */
export const isBuilt = (e: MigrationExperience) => e === 'today' || e === 'yesterday'

export function setExperience(next: MigrationExperience) {
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* private window: the choice lasts until the page closes */
  }
  emit()
}

export function useExperience(): MigrationExperience {
  const picked = useSyncExternalStore(subscribe, () => current, () => 'today' as MigrationExperience)
  return MIGRATION_PICKERS ? picked : 'today'
}

/* --- Review facts the store does not keep ------------------------------------------------ */

export interface ReviewFact {
  /** Assisted: rejected with a reason, waiting on miniOrange. */
  rejected?: { reason: string; ref: string }
  /** Assisted: miniOrange fixed it and sent it back to To review. */
  updated?: string
  /** Made active, then rolled back: the old policy decides again. */
  rolledBack?: true
  /** The ready-made checks ran. */
  checked?: true
}

let facts: Record<string, ReviewFact> = {}
let nextRef = 4821
const setFact = (id: string, patch: (f: ReviewFact) => ReviewFact) => {
  facts = { ...facts, [id]: patch(facts[id] ?? {}) }
  emit()
}

/** Assisted: a rejection, with the reason miniOrange works from. Returns the request number. */
export function rejectMoved(id: string, reason: string) {
  const ref = `MO-${nextRef++}`
  setFact(id, (f) => ({ ...f, updated: undefined, rejected: { reason, ref } }))
  return ref
}

/** Today: taking a rejection back, by approving after all. */
export function clearRejected(id: string) {
  setFact(id, (f) => ({ ...f, rejected: undefined }))
}

/** The prototype stands in for miniOrange: the rejected draft comes back, fixed, to To review. */
export function fixByMiniOrange(id: string) {
  setFact(id, (f) => ({ ...f, rejected: undefined, updated: f.rejected ? `Fixed as asked: ${f.rejected.reason}` : 'Updated by miniOrange' }))
}

export function markRolledBack(id: string, on: boolean) {
  setFact(id, (f) => ({ ...f, rolledBack: on ? true : undefined }))
}

export function markChecked(ids: readonly string[]) {
  facts = { ...facts, ...Object.fromEntries(ids.map((id) => [id, { ...(facts[id] ?? {}), checked: true as const }])) }
  emit()
}

const EMPTY: Record<string, ReviewFact> = {}
export function useReviewFacts(): Record<string, ReviewFact> {
  return useSyncExternalStore(subscribe, () => facts, () => EMPTY)
}

/* --- A migrated policy's state, for its status everywhere (moved-status.tsx, 18 Nov 2026) --------------------- */

export type MovedReview = 'review' | 'approved' | 'rejected'

export function useMovedState(policy: Policy | undefined) {
  const { moved } = useBrand()
  const facts = useReviewFacts()
  const old = useExperience() === 'yesterday'
  if (!policy || old || !policy.movedFrom?.length) return { migrated: false, review: null as MovedReview | null, rolledBack: false }
  const review: MovedReview | null =
    policy.status !== 'draft' ? null : facts[policy.id]?.rejected ? 'rejected' : moved[policy.id]?.reviewed ? 'approved' : 'review'
  return { migrated: true, review, rolledBack: policy.status === 'inactive' && !!facts[policy.id]?.rolledBack }
}
