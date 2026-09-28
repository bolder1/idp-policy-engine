import type { BrandScreen } from './store'

/* -----------------------------------------------------------------------------
   Is this navigation the rail item for the screen already open, pressed again?

   A revisit reopens the screen at its list: `go` bumps `visit`, and the screen
   remounts under its new key. Only for screens with no policy: a builder asked
   to open a sheet on its own policy must keep its draft.

   Nor for a sub-state named on the same screen: a tab (the page's own tab
   bar). Those are the page's own controls, and remounting under them
   would throw away the search, the filters, the sort and the focus.
   -------------------------------------------------------------------------- */
export function isRevisit(from: BrandScreen, to: BrandScreen): boolean {
  if (from.name !== to.name || 'policyId' in to) return false
  return !('tab' in to)
}
