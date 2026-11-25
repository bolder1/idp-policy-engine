import { fallbackRule, EVERYONE, type Policy } from './data'
import { shows } from './rollout'

/* -----------------------------------------------------------------------------
   NO GLOBAL DEFAULT (owner, 25 Nov 2026: "remove global policy, completely not a concept any more", then, asked what a
   sign-in to an application with no policy gets: "Blocked"; "everywhere on Design"). rollout.ts `noGlobalDefault`.

   On Design the store seeds no system policy (store.tsx), so nothing lists or names one. The engine still needs an
   answer for an application no policy covers: `NO_POLICY` stands in as its decider (tenant-resolver.ts
   `governingPolicy`). It is never stored, never listed and never opened; it has no rules and its last row denies, so
   the run is decided, Blocked, and every reader says "No policy" rather than "can't tell".
   -------------------------------------------------------------------------- */

export const NO_GLOBAL_DEFAULT: boolean = shows('noGlobalDefault')

export const NO_POLICY_ID = 'no-policy'
export const NO_POLICY_NAME = 'No policy'
/** The outcome's line for a sign-in no policy covers. */
export const NO_POLICY_LINE = 'No policy · Blocked'

/** The decider of a sign-in no policy covers: no rules, a last row that denies. Never stored or listed. */
export const NO_POLICY: Policy = {
  id: NO_POLICY_ID,
  name: NO_POLICY_NAME,
  type: 'App Access',
  appIds: [],
  status: 'active',
  audience: EVERYONE,
  rules: [],
  fallback: fallbackRule('deny'),
  lastModified: '',
  modifiedBy: '',
}

/** True for the stand-in decider, by id, wherever a resolution names it. */
export const isNoPolicy = (id: string | null | undefined): boolean => id === NO_POLICY_ID
