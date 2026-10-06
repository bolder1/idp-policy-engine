import type { App, Policy } from '../../data'
import type { SignInFacts, SimEnv } from '../simulate'
import { NO_FILTER, filterActivity, signInActivity } from './activity'

/* -----------------------------------------------------------------------------
   Blocked sign-ins, for the help desk (docs/specs/DENIAL-REASONS.md, step 4):
   find that person's refused sign-in, press it, and the page plays it with its
   Why. The refused rows of the week's sign-in activity (activity.ts). PURE.
   -------------------------------------------------------------------------- */

export interface BlockedRow {
  id: string
  /** "Mon 09:30". */
  when: string
  who: string
  app: string
  /** "Office network", "London, United Kingdom", or the address. */
  from: string
  facts: SignInFacts
}

/** The most the list shows: a help desk narrows by name, it does not page. */
export const BLOCKED_MAX = 30

/** The week's refused sign-ins on `apps`, matching `query` against the person, the application and where from. */
export function blockedSignIns(policies: readonly Policy[], env: SimEnv, today: Date, apps: readonly Pick<App, 'id' | 'name'>[], query = ''): BlockedRow[] {
  return filterActivity(signInActivity(policies, env, today, apps), { ...NO_FILTER, result: 'blocked', q: query })
    .slice(0, BLOCKED_MAX)
    .map((r) => ({ id: r.id, when: r.when, who: r.who, app: r.app, from: r.from, facts: r.facts }))
}
