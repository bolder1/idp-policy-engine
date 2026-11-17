import { useSyncExternalStore } from 'react'

/* -----------------------------------------------------------------------------
   Published during this review (owner, 10 Nov 2026: "don't remove the policy while reviewing; if the user goes back and
   comes back, then move it"). A moved draft that is published stays in the review walk, read-only and marked Published,
   so Back and Next still reach it. Once the admin leaves the builder it is cleared, and the policy is only in New policies.
   ----------------------------------------------------------------------------- */

let ids: ReadonlySet<string> = new Set()
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function markWalkPublished(add: readonly string[]) {
  ids = new Set([...ids, ...add])
  emit()
}

export function clearWalkPublished() {
  if (!ids.size) return
  ids = new Set()
  emit()
}

/** The ids published since the review opened. */
export function useWalkPublished(): ReadonlySet<string> {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => ids,
    () => ids,
  )
}
