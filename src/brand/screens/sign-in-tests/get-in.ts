import type { AccessDecision } from '../../data'
import type { SignInForm } from '../testing/sign-in-form'
import { denyReasonOf } from './deny-reason'
import type { EngineRun } from './engine-run'

/* -----------------------------------------------------------------------------
   How to get in (docs/specs/DENIAL-REASONS.md, step 5): under a refusal, the
   what-ifs that would have let the person in — From Office network, On a
   Windows 11 laptop — each one the same evaluator run on the same sign-in with
   one fact changed (layouts/directions-reroute.ts `useReroutes`), so the
   advice is always the engine's own and never worded by a guess. PURE: it
   reads the runs it is given and keeps the ones that are not refusals.
   -------------------------------------------------------------------------- */

export interface GetIn {
  key: string
  /** "From Office network". */
  label: string
  decision: AccessDecision
  /** "AWS for engineering teams · rule 2": what would decide it, when that is a different place. */
  source: string
  /** The sign-in with that one fact changed: pressing the option runs it. */
  form: SignInForm
}

/** What a what-if is, as the reroutes give it: its own run, its words, and the form it ran. */
export interface Variant {
  key: string
  label: string
  source: string
  plan: Pick<EngineRun, 'outcome'> | null
  form?: SignInForm
}

/** The what-ifs that let the person in, or null when the run was not a refusal (nothing to get in to). */
export function getInOptions(base: Pick<EngineRun, 'outcome' | 'rules' | 'landing'>, variants: readonly Variant[]): GetIn[] | null {
  if (denyReasonOf(base) === null) return null
  const out: GetIn[] = []
  for (const v of variants) {
    const o = v.plan?.outcome
    if (!o || !v.form || o.status !== 'decided' || !o.decision || o.decision === 'deny') continue
    out.push({ key: v.key, label: v.label, decision: o.decision, source: v.source, form: v.form })
  }
  return out
}
