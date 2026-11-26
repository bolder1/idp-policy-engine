import { shows } from './rollout'

/* Empty states with no Global Default (rollout.ts `emptyNoDefault`; owner, 26 Nov 2026: "update the empty states …
   now we don't have any global default policies"). On Design an application no policy covers BLOCKS its sign-ins
   (no-global-default.ts), so nothing may say they "fall through to the tenant default". The words, said once here. */

export const EMPTY_NO_DEFAULT: boolean = shows('emptyNoDefault')

/** Under "No policies yet" on All Policies. */
export const NO_POLICY_BLURB = 'An application with no policy blocks every sign-in.'
/** The Applications list's Policy cell for an application with none, and its hover line. */
export const NO_POLICY_LABEL = 'No policy'
export const NO_POLICY_TITLE = 'No policy: sign-ins to this application are blocked.'
/** The protection slider's empty list, and its callout when the policies there decide nothing. */
export const BLOCKED_UNTIL_POLICY = 'Sign-ins to it are blocked until a policy decides.'
