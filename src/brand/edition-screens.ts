import type { Features } from './edition'
import type { BrandScreen } from './store'

/* -----------------------------------------------------------------------------
   Pages an edition can withhold, and the flag that holds each back.

   Lite keeps the tenant-wide Sign-in tests page off (edition.ts,
   `policyTesting`). Two places read this, so they can never disagree: the
   rail leaves the item out (Shell.tsx), and a route that still names the page
   — a stale link, a board's "Open Sign-in tests" from before an edition
   switch — lands on the policies instead (BrandApp.tsx). Keyed by screen, so
   the rail's tree stays the console's own.
   -------------------------------------------------------------------------- */

export const SCREEN_FEATURE: Partial<Record<BrandScreen['name'], keyof Features>> = {
  'sign-in-tests': 'policyTesting',
}

/** Whether this edition offers the screen. A screen no flag holds back always is. */
export function screenOffered(screen: Pick<BrandScreen, 'name'> | undefined, features: Features): boolean {
  const flag = screen ? SCREEN_FEATURE[screen.name] : undefined
  return !flag || features[flag]
}
