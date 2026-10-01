import type { Policy } from '../../data'
import type { BrandScreen } from '../../store'
import { fixOnArrival } from '../break-in-app'
import type { Accepted } from '../break-in-model'
import type { SimEnv } from '../simulate'
import { ruleAt, type Selection } from './model'

/* -----------------------------------------------------------------------------
   The builder's end of "Fix in policy ↗".

   Access checks plays the Break-in test on an application (break-in-app.ts):
   each scripted sign-in goes through the tenant as a normal access check, and
   a row that gets through names the policy that let it. The owner wanted the
   deck there (1 Oct 2026: "can we implement it in the check part? as a
   suggestion inside conflicts or somewhere else" — then "go with your picks,
   start building"). That page has no draft, so it never applies a fix: it
   previews one, and "Fix in policy" opens the deciding policy on its board
   with the fix already in the draft — an ordinary edit, on the undo stack,
   said in a toast with Undo, and not saved until Review & save.

   The route carries only the card and the application (`fix: { card, app }`).
   The board asks `fixOnArrival` again of its OWN draft rather than taking the
   page's answer on trust: a saved draft opens here, the page tested the rules
   in force, and the two can differ. A draft that already holds the card, or
   that no fix fits, is left alone and the toast says why in a line.

   Once per arrival. StrictMode runs a mount's effects twice, and the board
   re-renders on every hover, so the arrival is keyed — policy, card,
   application — and taken once (`firstArrival`). A route with no fix clears
   the key, so the same fix asked for again after leaving lands again.
   -------------------------------------------------------------------------- */

export type ArriveFix = NonNullable<Extract<BrandScreen, { name: 'board' }>['fix']>

/** What one arrival is called: null when the route carries no fix. */
export const arrivalKey = (policyId: string, fix: ArriveFix | undefined): string | null =>
  fix ? `${policyId}|${fix.card}|${fix.app}` : null

/* True the first time a key is seen, and never again for it while it stands.
   A null key — a route with no fix — forgets the last one. */
export function firstArrival(seen: { current: string | null }, key: string | null): boolean {
  if (key === null) {
    seen.current = null
    return false
  }
  if (seen.current === key) return false
  seen.current = key
  return true
}

export type FixLanding =
  /** The draft to commit, the Undo toast's words, and the card to select and show. */
  | { draft: Policy; toast: string; select: Selection; reveal: string }
  /** Nothing applied: a plain toast. */
  | { none: string }

/* The arrival worked out on the draft the board holds: the fix's rules and
   last row on it, as every other ready fix on the board is committed
   (`applyPanelFix`), and the card the fix made or changed — selected on its
   Condition, the part a fix rewrites and the one the route's `rule` opens
   on. */
export function landFix(draft: Policy, fix: ArriveFix, env: SimEnv, opts: { accepted?: Accepted; policies?: readonly Policy[] } = {}): FixLanding {
  const out = fixOnArrival(draft, fix.card, fix.app, env, opts)
  if ('none' in out) return { none: out.none }
  return {
    draft: { ...draft, rules: out.next.rules, fallback: out.next.fallback },
    toast: out.toast,
    select: out.ruleRef === 'fallback' ? { kind: 'fallback' } : ruleAt(out.ruleRef, 'when'),
    reveal: out.ruleRef,
  }
}
