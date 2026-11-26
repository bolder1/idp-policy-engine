import { shows } from '../rollout'

/**
 * The 25 Nov interface-review fixes (rollout.ts dashboardA11y). dashboard.css scopes its rules to `[data-a11y]`, which
 * the page and every popover the board opens carry (popovers render outside the page, so they carry it themselves).
 */
export const A11Y = shows('dashboardA11y')

/** Spread on a root: `<div {...A11Y_ATTR}>`. */
export const A11Y_ATTR: { 'data-a11y'?: '' } = A11Y ? { 'data-a11y': '' } : {}
