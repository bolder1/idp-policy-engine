import type { AccessDecision } from './data'
import type { SignInFacts } from './screens/sign-in-facts'

/* -----------------------------------------------------------------------------
   Saved sign-ins: a sign-in, and the decision the tenant expects it to get.

   Tenant data, like a zone. The guard reads them before an enforcing policy is
   saved, turned on or turned off, and the Policy testing views list them. A
   saved sign-in is a promise somebody made — "Kavya in the office must keep
   getting 2FA" — and the level says how hard a change may push against it:

     note        checked, and listed if it changes; never blocks
     must-pass   blocks a save that breaks it, and can be overridden from the
                 guard with a new expectation and a reason
     protected   blocks, and can't be overridden from the guard. Still editable
                 here, and deleting one asks for the typed DELETE

   `facts` is the sign-in as the evaluator reads it, not the form that stated
   it: a saved sign-in outlives the form's shape, and the guard evaluates it
   without a form in sight. `appId` and `personId` are always set.
   -------------------------------------------------------------------------- */

export type SignInLevel = 'note' | 'must-pass' | 'protected'

export interface SavedSignIn {
  id: string
  name: string
  facts: SignInFacts
  expected: AccessDecision
  level: SignInLevel
  /** The account's name, as the guard prints it: "Saved by Jaspreet Toor". */
  savedBy: string
  /** ISO 8601. */
  savedAt: string
  /* Set together when a Must pass expectation is changed from the guard, so
     the row can say who moved it, when and why. */
  reason?: string
  changedBy?: string
  changedAt?: string
  /* A policy's own check (draft-checks.ts), not one the tenant saved: listed
     when a guard page opens, and never the reason one opens. */
  generated?: true
}

export const LEVEL_LABEL: Record<SignInLevel, string> = { note: 'Note', 'must-pass': 'Must pass', protected: 'Protected' }

/** One line under each level in its picker. */
export const LEVEL_META: Record<SignInLevel, string> = {
  note: 'Checked, never blocks',
  'must-pass': 'Blocks saving and turning on',
  protected: "Blocks, and can't be overridden",
}

/** Every level, strongest first: the order the Saved sign-ins table sorts by within a result. */
export const SIGN_IN_LEVELS: readonly SignInLevel[] = ['protected', 'must-pass', 'note']

/* The order a picker offers them in, weakest first: the save form's Level
   (which defaults to the first, Note) and the Level filter after All. */
export const LEVEL_PICKER_ORDER: readonly SignInLevel[] = ['note', 'must-pass', 'protected']

/** The longest a saved sign-in's name may be: the save form's Name field stops here. */
export const SAVED_NAME_MAX = 60
