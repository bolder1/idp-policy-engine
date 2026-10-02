import type { FormField } from '../../testing/sign-in-form'
import type { SignInScreens } from '../../testing/screens-of'
import type { TokenId } from '../../testing/sign-in-sentence'
import type { EnginePolicy, EngineRun } from '../engine-run'
import type { Edge, Status, Tone } from './pass-model'
import type { MarkStatus } from './pass-parts'

/* -----------------------------------------------------------------------------
   What every piece of the pass is drawn from (PassLayout.tsx builds it once a
   step): the plan at the step on screen, and the sign-in's words.
   -------------------------------------------------------------------------- */

export type FieldKey = 'policy' | 'rule' | 'factors' | 'conditions' | 'see'

export interface PassFact {
  token: TokenId
  label: string
  text: string
  unset: boolean
  /** Its mark from the rule that decided (or failed it), once that row is read; null when no rule read it. */
  mark: MarkStatus | null
  /** The step that mark lands at. */
  markAt: number | null
  /** What the rule asked of it: "Corporate offices". */
  requirement: string
  /** Not stated, and it matters: the form field Add opens. */
  missing: FormField | null
}

export interface PassGroup {
  id: string
  name: string
  /** The issuing policy covers the person through it. */
  via: boolean
  /** Another policy also covers them through it (a conflict when `conflict`). */
  also: string
  conflict: boolean
}

export interface PassCtx {
  plan: EngineRun
  /** The step drawn (the clock's, or a moment stepped to). */
  s: number
  /** The answer has landed at `s`. */
  landed: boolean
  /** The run is playing at `s` (blue is allowed). */
  live: boolean
  /** Things arriving animate. */
  animate: boolean
  durOf: (at: number) => number
  personName: string
  first: string
  groups: PassGroup[]
  asGroup: string | null
  appId: string | null
  appName: string
  decider: EnginePolicy | undefined
  /** "via Engineering", "by name", "for everyone", or ''. */
  via: string
  facts: PassFact[]
  status: Status
  tone: Tone
  code: string
  /** The factors asked, in order: "Password", "miniOrange Push". */
  factors: string[]
  deny: string | null
  screens: SignInScreens[]
  edges: Edge[]
  /** The one line worth reading beside the answer (a conflict, amber; else a quiet finding). */
  finding: { text: string; tone: 'notice' | 'quiet'; policyId: string | null } | null
}
