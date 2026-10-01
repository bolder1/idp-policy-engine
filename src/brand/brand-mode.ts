/* -----------------------------------------------------------------------------
   Which look the console is wearing: the current one, or the rebrand.

   The rebrand is copied from the live console at login.xecurify.com — its
   surfaces, its type, its #0d6efd blue on chips and every active state — with
   the lines taken out and one spec per component. It sits beside the current
   look instead of replacing it: the product is stable, and the two are compared
   before anything moves.

   `data-brand="rebrand"` on <html> is the whole switch. rebrand.css is scoped to
   it, loads last, and changes nothing about how any screen behaves.
   -------------------------------------------------------------------------- */

export type BrandMode = 'current' | 'rebrand'

export const BRAND_KEY = 'idp.brand'

/** Only the exact stored value turns the rebrand on; anything else is the current look. */
export function parseBrand(value: unknown): BrandMode {
  return value === 'rebrand' ? 'rebrand' : 'current'
}

export function readBrand(): BrandMode {
  try {
    return parseBrand(window.localStorage.getItem(BRAND_KEY))
  } catch {
    /* No window (tests), a private window, or storage blocked by policy. */
    return 'current'
  }
}

export function applyBrand(mode: BrandMode): void {
  if (typeof document === 'undefined') return
  if (mode === 'rebrand') document.documentElement.setAttribute('data-brand', 'rebrand')
  else document.documentElement.removeAttribute('data-brand')
  try {
    window.localStorage.setItem(BRAND_KEY, mode)
  } catch {
    /* The switch still works for this session; it just will not be remembered. */
  }
}
