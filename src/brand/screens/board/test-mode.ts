import type { TenantResolution } from '../tenant-resolver'
import type { AudienceStanding } from '../testing/TracePills'
import type { DockTab } from '../testing/test-dock'
import type { ColumnView, DecisionView, GateView } from './try-sign-in'

/* -----------------------------------------------------------------------------
   Test mode on the board, the parts that are words and choices rather than
   drawing (Policy testing V4, §2): what the test panel says under its
   sentence, which of its tabs a route opens on, and how the start node and
   the spine read the route's two gates.

   Pure, so the board's joins can be pinned without a browser. BoardBuilder
   and Board draw what these say.
   -------------------------------------------------------------------------- */

/** Where a route asked the board to open: the Policies row menu, a guard page's Open. */
export type BoardOpen = 'try' | 'person' | 'saved' | 'break-in'

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
