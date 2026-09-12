import type { App } from '../data'

/* -----------------------------------------------------------------------------
   What the Applications cell draws, as arithmetic.

   Kept out of apps-peek.tsx for two reasons. A component module that also
   exports plain functions breaks fast refresh, and the linter says so. And the
   cap is the one number here somebody will want to change, so it should be
   testable as a number rather than found by reading JSX.
   -------------------------------------------------------------------------- */

/* Four, because that is how many marks read as "these" rather than as a
   texture. At five or six overlapping 20px squares nobody is identifying
   anything any more, they are counting, and the "+N" after the stack already
   does the counting. */
export const STACK_MAX = 4

/** The logos the cell shows, and how many it leaves to the count. */
export function stackOf(apps: App[]): { logos: App[]; more: number } {
  return { logos: apps.slice(0, STACK_MAX), more: Math.max(0, apps.length - STACK_MAX) }
}

export const countLabel = (n: number): string => `${n} application${n === 1 ? '' : 's'}`

/* The stack's accessible name: the names the logos stand for, and the count.

   A stack of logos has no text, so without this a screen reader hears "button"
   and nothing else. It says "+N" in the same words the cell prints, so somebody
   using voice control can say what they can see. */
export function stackName(apps: App[]): string {
  const { logos, more } = stackOf(apps)
  const names = logos.map((a) => a.name).join(', ')
  return more > 0 ? `${names}, +${more} more` : names
}
