import { enforces, type Policy } from '../../data'
import type { PolicyStanding, TenantResolution, WatchedResult } from '../tenant-resolver'

/* -----------------------------------------------------------------------------
   Which policy decides this sign-in, and where every other one stands.

   The resolver says where each policy in the tenant stands (tenant-resolver.ts)
   in list order. This sorts those standings into what the Which policy list
   draws: the policies ON the application, each with the reason it did or did
   not decide, and the rest folded away under "Not on {app}".

   How a row reads, and why:

     decides   the one deciding — the blue edge, the name in ink
     lost      an enforcing policy on the application that did not decide.
               Struck through when it lost outright: the person is outside its
               audience, it is a DEFAULT-group policy under a custom one, or an
               earlier policy on the same app and group went first. The Global
               Default under an app policy is not struck — it did not lose,
               it was never needed
     waiting   inactive or a draft, on the application: plain secondary text
               with its reason, and the one kind Assume on is offered for
     watching  monitoring: the Monitoring pill and what it would decide. Never
               struck — it did not lose, it only watches, and a struck-through
               monitor would read as one that had failed

   A policy standing in for its stored twin — the board's draft, or one assumed
   on — counts as enforcing, because the question being asked is "what if it
   were". A monitoring policy standing in keeps its Monitoring pill, and what
   it would decide beside it when the caller has that from the tenant as it
   stands (`watching`): the board's "Stored version" of a monitoring policy
   is the policy as if on, and the pill is what says it is not on yet. The
   board passes it beside the Stored version only (`standingWatch`): beside
   Your edits the row decides by the edits, and the stored rules' answer would
   contradict it.
   -------------------------------------------------------------------------- */

export type WhichRowKind = 'decides' | 'lost' | 'waiting' | 'watching' | 'elsewhere'

export interface WhichRow {
  policyId: string
  name: string
  /** The resolver's reason, verbatim. */
  reason: string
  kind: WhichRowKind
  /** Drawn struck through. */
  struck: boolean
  /** Monitoring, so the Monitoring pill is drawn beside the name. */
  monitoring: boolean
  /** What it would decide, when it is watching this sign-in. */
  watched: WatchedResult | null
  /** Off but on this application: Assume on can bring it in. */
  assumable: boolean
  /** The policy Assume on is evaluating as on. */
  assumed: boolean
  /** "Does not cover HRMS" says nothing under "Not on HRMS", so it is left out there. */
  showReason: boolean
}

export interface WhichPolicyRows {
  /** The application's policies and the Global Default, in list order. */
  on: WhichRow[]
  /** Everything else, folded under "Not on {app}". */
  off: WhichRow[]
}

const LOST: ReadonlySet<PolicyStanding['kind']> = new Set(['not-in-audience', 'default-group-yields', 'same-app-and-group'])

export function whichPolicyRows(
  res: Pick<TenantResolution, 'standings' | 'watching'>,
  policies: readonly Policy[],
  appId: string | null,
  opts: { assumedId?: string | null; substitute?: Policy; watching?: readonly WatchedResult[] } = {},
): WhichPolicyRows {
  const sub = opts.substitute
  const stored = new Map(policies.map((p) => [p.id, p]))
  const byId = new Map(stored)
  if (sub) byId.set(sub.id, sub)
  const on: WhichRow[] = []
  const off: WhichRow[] = []

  for (const s of res.standings) {
    const p = byId.get(s.policyId)
    const covers = p !== undefined && p.type === 'App Access' && (p.isSystem === true || (appId !== null && p.appIds.includes(appId)))
    const standingIn = p !== undefined && p.id === sub?.id
    /* The standing says so for a monitor that is watching; the stored
       policy's status says so for one outside the person's audience, and for
       one standing in as though it were on. */
    const monitoring = s.kind === 'monitoring' || stored.get(s.policyId)?.status === 'monitor'
    const enforcing = p !== undefined && (standingIn || enforces(p))
    const row = (kind: WhichRowKind, extra: Partial<WhichRow> = {}): WhichRow => ({
      policyId: s.policyId,
      name: s.policyName,
      reason: s.reason,
      kind,
      struck: false,
      monitoring,
      watched: null,
      assumable: false,
      assumed: opts.assumedId === s.policyId,
      showReason: true,
      ...(monitoring && standingIn ? { watched: opts.watching?.find((w) => w.policyId === s.policyId) ?? null } : null),
      ...extra,
    })

    switch (s.kind) {
      case 'decides':
        on.push(row('decides'))
        break
      case 'monitoring':
        on.push(row('watching', { watched: res.watching.find((w) => w.policyId === s.policyId) ?? null }))
        break
      case 'not-reached':
        on.push(row('lost'))
        break
      case 'inactive':
      case 'draft':
        if (covers) on.push(row('waiting', { assumable: true }))
        else off.push(row('elsewhere'))
        break
      case 'other-app':
        off.push(row('elsewhere', { showReason: false }))
        break
      case 'not-app-access':
        off.push(row('elsewhere'))
        break
      default:
        /* not-in-audience, DEFAULT-group, same app and group. A monitor out of
           its audience lands here too, and is never struck. With no
           application chosen the resolver reads the audience first, so a
           policy on some other application can stand here; it is not on this
           one, and goes with the rest. */
        if (!covers) off.push(row('elsewhere'))
        else on.push(row('lost', { struck: LOST.has(s.kind) && enforcing && !monitoring }))
    }
  }
  return { on, off }
}
