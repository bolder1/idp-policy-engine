import type { ReactNode } from 'react'

import type { AccessDecision, Policy } from '../../../data'
import type { AppBreakInSummary } from '../../break-in-app'
import type { ColumnView } from '../../board/try-sign-in'
import type { RowsRead } from '../../testing/rows-read'
import type { SignInScreens } from '../../testing/screens-of'
import type { FormField, SignInForm } from '../../testing/sign-in-form'
import type { AttemptsFrom } from '../attempts'
import type { EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   What every layout of the run is handed (run-layout.ts): the run on screen
   and where it is, the sign-in it is of, the pieces the column already draws
   and can lend, and the ways out. The host (TryJourney.tsx) owns the clock,
   the engine line over the canvas (Skip, Replay), the focus, the panel and
   the routes; a layout owns only how the run is laid out and played on the
   ground, inside its own RunStage (pan, zoom, fit, follow).

   A layout draws ANY run the plan can describe — it may be plainer for a case
   it was not designed around, but it never throws and never hides the answer.
   -------------------------------------------------------------------------- */

export interface RunLayoutProps {
  /** The plan on screen (use-engine-run.ts `shown`): the one playing, about to, or settled. */
  plan: EngineRun
  /** The step on screen: `plan.steps[s]`. Settled runs sit at the last step. */
  s: number
  /** A run is playing. */
  running: boolean
  /** A run is playing and motion is allowed: things arrive as they are reached. */
  animate: boolean
  reduced: boolean
  /** Skip landed the run (or a revisit drew it settled): the answer is there at once. */
  jumped: boolean
  /** Changes every time a new run starts playing: a layout resets its view on it. */
  runKey: number

  /** The sign-in the plan is of. */
  form: SignInForm
  /** The facts the application's rules read, for the sign-in's rows. */
  rows: RowsRead
  /** The Person picker chose "Anyone in <group>": the group's name. */
  asGroup: string | null
  /** The policies the rule cards are drawn from (a policy's draft, inside one); absent, the tenant's. */
  policies?: readonly Policy[]

  /* The pieces the column draws, lent whole (memoised by the host): */
  /** The sign-in as a card (SignInCard.tsx `SignInNode`): a press opens the panel on the form. */
  start: ReactNode
  /** The answer, whole (EngineJourney.tsx `Answer`): the decision, Decided by, What they see. */
  answer: ReactNode

  /* What the answer says beside the decision: */
  /** What the person sees, screen by screen (testing/screens-of.ts). */
  screens: SignInScreens[]
  /** The versions in play (inside a policy: live, then your edits); one on the page. */
  columns: ColumnView[]
  /** An edited re-run moved the answer: "Changed by the device", once. */
  changed: string | null
  /** A saved sign-in or a break-in attempt run: what it should get, and a weaker factor that is what failed. */
  expected: AccessDecision | null
  weaker: string | null

  /* The ways out: */
  /** The sign-in pressed: the panel opens on the form. */
  onPressPerson: () => void
  /** Add on a Not stated fact: the panel opens on that field. */
  onAdd: (field: FormField) => void
  onOpenPolicy: (policyId: string) => void
  onOpenRule: (policyId: string, ruleId: string) => void
  /** "As each group": the sign-in runs again as "Anyone in <group>" (the group's id). */
  onAsGroup?: (groupId: string) => void
  /** The why in the page's right-hand panel: open, its body, the way to open it. */
  why?: { open: boolean; slot: HTMLElement | null; onOpen: (open: boolean) => void }
  /** Break-in attempts on the application, once the run is done (the page's). */
  breakIn?: { summary: AppBreakInSummary; open: boolean } | null
  onReviewBreakIn?: (from: AttemptsFrom) => void
}
