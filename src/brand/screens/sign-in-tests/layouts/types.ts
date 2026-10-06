import type { ReactNode } from 'react'

import type { AccessDecision, Policy } from '../../../data'
import type { AppBreakInSummary } from '../../break-in-app'
import type { ColumnView } from '../../board/try-sign-in'
import type { RowsRead } from '../../testing/rows-read'
import type { SignInScreens } from '../../testing/screens-of'
import type { FormField, SignInForm } from '../../testing/sign-in-form'
import type { AttemptsFrom } from '../attempts'
import type { EngineRun } from '../engine-run'
import type { InspectTarget } from '../inspect-model'

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
  /** Any name on the run — a policy, a rule, a zone, a person — opened in the page's right-hand panel, read-only
      (inspect-model.ts). `fresh` starts the panel's way back over at it (the canvas bar's Details). Absent, names
      leave for the builder through the two above. */
  onInspect?: (target: InspectTarget, fresh?: boolean) => void
  /** "As each group": the sign-in runs again as "Anyone in <group>" (the group's id). */
  onAsGroup?: (groupId: string) => void
  /** The why in the page's right-hand panel: open, its body, the way to open it. */
  why?: { open: boolean; slot: HTMLElement | null; onOpen: (open: boolean) => void }
  /* What the why does under a refusal, as the column's why is handed them (EngineJourney.tsx; Focus draws the same why,
     layouts/focus2-why.tsx). Absent, the why has none of them. */
  /** How to get in: a what-if pressed in the why runs that sign-in (get-in.ts) — a press that says it runs. */
  onTryForm?: (form: SignInForm) => void
  /** Let in for a while: the policy that refused, the person, an end date and a reason (temp-access.ts). */
  onGrant?: (policyId: string, person: { id: string; name: string }, until: string, reason: string) => void
  /** The only policy a grant may go to (the builder's own, whose Check access edits its draft). Absent, whichever refused. */
  grantFor?: string
  /** Break-in attempts on the application, once the run is done (the page's). */
  breakIn?: { summary: AppBreakInSummary; open: boolean } | null
  onReviewBreakIn?: (from: AttemptsFrom) => void

  /* The dedicated views' own top (owner, 3 Oct 2026: Focus, Brief and Jarvis "should all have the same things" —
     the sign-in row with the pencil and a basic Replay, no changing run line over them; run-layout.ts `OWN_TOP`): */
  /** Replay: a new run of the same sign-in, as the run line's Replay. */
  onReplay?: () => void
  /** Land the run at once, as the run line's Skip does: the engine's own clock, not the view's. Focus v2 calls it for a run it is not going to tell. */
  onLand?: () => void
  /** A change that is a run of its own — a press that says it runs ("Run with Home broadband", "Run as Finance
      only"): the form takes the change and the run begins at once (the page's `patch(…, now)`). Only Run runs:
      never call it without such a press. */
  onRunWith?: (patch: Partial<SignInForm>, field: FormField) => void
  /** Save this sign-in as a test: the panel opens on Save sign-in. */
  onSave?: () => void
  /** The form has changes the run on screen has not checked ("Not run"); the form's panel is open. */
  unrun?: boolean
  editing?: boolean

  /* Several identities in one Run (owner, 5 Oct 2026: "one run each, switch"): the canvas tells one at a time, and
     the top bar holds a chip per identity to switch. Both absent when only one identity ran. */
  /** Every identity the last Run covered, in pick order, and which one the canvas is telling (5 Oct 2026). Each
      `plan` is that identity's own run, one stable object per pick per run — the active one's is the very plan on
      screen (`plan` above, once it has been taken up). */
  identities?: readonly RunIdentity[]
  /** Switch the canvas to another identity of the same Run (loads its form; never a new Run of the picks). */
  onPickIdentity?: (key: string) => void
}

/** One identity of a Run of several: its pick (`key`, a person's id or `group:<id>`), what it is, and its own plan. */
export interface RunIdentity {
  key: string
  kind: 'user' | 'group'
  name: string
  active: boolean
  plan: EngineRun
}
