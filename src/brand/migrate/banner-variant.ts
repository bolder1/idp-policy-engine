import { useSyncExternalStore } from 'react'
import { MIGRATION_PICKERS } from './phase'

/* -----------------------------------------------------------------------------
   Which migration banner the Policies page shows while drafts wait (owner, 12 Nov 2026: "a version for the current one
   and one for the new one"): the one banner with its stats as it was, or the two cards, Review and Approve. The
   showcase pins the two cards; elsewhere a picker in the page head switches them. Kept in this browser only.
   ----------------------------------------------------------------------------- */

export type BannerVariant = 'cards' | 'current'

export const BANNER_VARIANTS: { value: BannerVariant; label: string }[] = [
  { value: 'cards', label: 'Two cards' },
  { value: 'current', label: 'Current' },
]

const KEY = 'idp.migration-banner'

function read(): BannerVariant {
  try {
    return localStorage.getItem(KEY) === 'current' ? 'current' : 'cards'
  } catch {
    return 'cards'
  }
}

let variant: BannerVariant = read()
const subs = new Set<() => void>()

export function setBannerVariant(next: BannerVariant) {
  variant = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* private window: the choice lasts until the page closes */
  }
  subs.forEach((f) => f())
}

export function useBannerVariant(): BannerVariant {
  const picked = useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => variant,
    () => 'cards' as BannerVariant,
  )
  return MIGRATION_PICKERS ? picked : 'cards'
}
