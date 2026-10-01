import type { App, Policy } from '../../data'
import type { TenantResolution } from '../tenant-resolver'
import type { AudienceStanding } from '../testing/TracePills'
import type { DockTab } from '../testing/test-dock'
import type { SignInForm } from '../testing/sign-in-form'
import type { ColumnView, DecisionView, GateView } from './try-sign-in'

/* -----------------------------------------------------------------------------
   Test mode on the board, the parts that are words and choices rather than
   drawing (Policy testing V4, §2).

   Since 1 Oct 2026 test mode is Check access, the Sign-in tests page's own
   experience inside the policy (owner: "change the try a sign in inside
   policy builder with the current sign in tests we have"; PolicyCheck.tsx):
   which views it offers beside the sign-in, the panel's two widths, and the
   sign-in it starts from. What follows them — the old test panel's
   why-line, its tab for a route, the start node's and the spine's reading of
   the route's gates — is kept for the views and tests that still read it.

   Pure, so the board's joins can be pinned without a browser. BoardBuilder
   and Board draw what these say.
   -------------------------------------------------------------------------- */

/** Where a route asked the board to open: the Policies row menu, a guard page's Open. */
export type BoardOpen = 'try' | 'person' | 'saved' | 'break-in'

/* People and the Break-in test, hidden (owner, 1 Oct 2026: "Hide people and
   break-in test as of now"), as Check access takes the Sign-in tests page's
   form (board/PolicyCheck.tsx). Kept, not deleted: their views (DockPeople,
   BreakInView) are each a panel of Check access, opened from a bar button
   beside Past sign-ins — drawn only while this is on. Off, nothing reaches
   them: a route that names one (`person`, `break-in`) opens Check access on
   the sign-in, and a guard page's Break-in row offers no Open. */
export const PEOPLE_AND_BREAK_IN: boolean = false

/** A view of Check access beside the sign-in, opened from the builder's bar into the right-hand panel. */
export type CheckView = 'past' | 'people' | 'break-in'

/* The views the bar offers, in its order: Past sign-ins (owner, 1 Oct: "past
   sign-ins can be a dedicated button in the top header"), where the edition
   has Policy testing; then, only while they are back, People and — on a
   policy it runs on — the Break-in test. */
export function checkViews(o: { policyTesting: boolean; breakIn: boolean }): CheckView[] {
  if (!o.policyTesting) return []
  if (!PEOPLE_AND_BREAK_IN) return ['past']
  return ['past', 'people', ...(o.breakIn ? (['break-in'] as const) : [])]
}

/** The right-hand panel's two widths in Check access: the rule Inspector's, full and narrow (the page's own). */
export const CHECK_PANEL_WIDE = 560
export const CHECK_PANEL_NARROW = 380

/* The policy's first application, in the catalogue's order (data.ts `appsOf`'s). */
const firstOf = (policy: Pick<Policy, 'appIds'>, apps: readonly App[]): App | undefined => apps.find((a) => policy.appIds.includes(a.id))

/* A sign-in on the policy's own applications. The session keeps a policy's
   sign-in past the builder (`boardForms`), and the applications can change
   under it — on the start node's pane, or while Check access was shut — so
   one naming an application this policy no longer covers is moved onto its
   first (review, 29 Sep 2026: the sentence went on naming Jira beside a
   trace that said "Does not cover Jira"). The Global Default, and a draft
   with no application (tried "as if on" any), keep what was chosen. */
export function onPolicyApps(form: SignInForm, policy: Pick<Policy, 'isSystem' | 'appIds'>, apps: readonly App[]): SignInForm {
  if (policy.isSystem || policy.appIds.length === 0 || (form.appId !== null && policy.appIds.includes(form.appId))) return form
  const first = firstOf(policy, apps)
  return first ? { ...form, appId: first.id } : form
}

/* The application Check access's panel starts on, before anything has run
   on this policy: its first, so the facts its rules read are asked at once
   (the page's panel starts with none — every application is the page's to
   choose from; here the policy has already chosen). None for the Global
   Default and for a draft with none: the admin picks. */
export function firstCheckApp(policy: Pick<Policy, 'isSystem' | 'appIds'>, apps: readonly App[]): string | null {
  if (policy.isSystem) return null
  return firstOf(policy, apps)?.id ?? null
}

const OPEN_TAB: Record<Exclude<BoardOpen, 'try'>, DockTab> = { person: 'people', saved: 'saved', 'break-in': 'break-in' }

/* The test panel's tab for a route (§2.4-bis). `try` is the sign-in alone,
   so the panel opens on whichever tab this viewer was last on; every other
   door names a tab — "Check a person" is the People tab now, and the Break-in
   test is a tab of its own rather than a page pushed over Saved sign-ins. */
export function panelTabForRoute(open: BoardOpen | undefined, last: DockTab): DockTab {
  if (!open || open === 'try') return last
  return OPEN_TAB[open]
}

/* Whether this policy is for the person, as the start node's pill says it.
   The Who gate's own words decide it: "Everyone" is a policy for everybody,
   and a gate with nobody to read ("Choose a person") says nothing at all. */
export function audienceOf(who: GateView): AudienceStanding | null {
  if (who.state === 'unknown') return null
  if (who.word === 'Everyone') return 'everyone'
  return who.state === 'pass' ? 'in' : 'out'
}

/* Why this policy is not the one deciding: outside its audience first — the
   start node already says so — and otherwise the resolver's own reason for
   this policy ("Inactive", "Earlier policy on HRMS decides"). */
export function notDecidingReason(res: Pick<TenantResolution, 'standings'> | null, draftId: string, who: GateView): string | undefined {
  if (who.state === 'fail') return 'Not in this policy'
  const mine = res?.standings.find((s) => s.policyId === draftId)
  return mine?.reason || undefined
}

/* The one line under the verdict (§2.4-bis). Never more than one:

     this policy decided   the rule — "Rule 1 · In a corporate office"
     another one decided   "Decided by Global Default Policy · Not in this policy"
     it depends           "Needs: Device", what would settle it
     can't tell            what is missing — "Choose a person"

   The answer itself is the verdict badge above it, so the line never
   repeats it. */
export function whyLine({
  right,
  decision,
  decides,
  reason,
}: {
  /** The right-hand column: the version the board is judged by. */
  right: Pick<ColumnView, 'status' | 'policyName' | 'line'> | undefined
  decision: Pick<DecisionView, 'status' | 'needs'>
  /** This policy is the one deciding. */
  decides: boolean
  /** Why it is not, when it is not (`notDecidingReason`). */
  reason?: string
}): string {
  if (!right) return ''
  if (decision.status === 'depends') return decision.needs.length > 0 ? `Needs: ${decision.needs.join(', ')}` : right.line
  if (right.status === 'incomplete') return right.line
  if (decides) return right.line
  const by = right.policyName ? `Decided by ${right.policyName}` : ''
  return [by, reason].filter(Boolean).join(' · ')
}
