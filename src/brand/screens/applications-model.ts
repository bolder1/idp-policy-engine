import { lastUpdatedAt, type App, type Policy } from '../data'
import { decidesFor } from './app-policies'

/* -----------------------------------------------------------------------------
   The Applications screen's sentences and sort, kept out of the components so
   they can be tested without rendering.
   -------------------------------------------------------------------------- */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** Last updated, oldest first; ties by name. Reads the timestamp, never the fixture's order. */
export function compareUpdated(a: App, b: App): number {
  return lastUpdatedAt(a) - lastUpdatedAt(b) || a.name.localeCompare(b.name)
}

/** The next policy below this one that decides, for the remove confirmation. */
export function nextDecider(policy: Policy, own: Policy[]): Policy | null {
  const at = own.findIndex((p) => p.id === policy.id)
  if (at < 0) return null
  return own.slice(at + 1).find(decidesFor) ?? null
}

/** How many applications the policy keeps after it comes off this one. */
export const remainingApps = (policy: Policy, appId: string) => policy.appIds.filter((id) => id !== appId).length

export interface RemoveCopy {
  /** What happens to the policy itself. */
  policy: string
  /** What happens to sign-ins on this application. */
  signIns: string
}

/** The two sentences of the remove confirmation. `own` is every policy on the app, in order. */
export function removeCopy(policy: Policy, app: Pick<App, 'id' | 'name'>, own: Policy[]): RemoveCopy {
  const remaining = remainingApps(policy, app.id)
  const policyLine =
    remaining > 0
      ? `${policy.name} stays on ${remaining} other ${plural(remaining, 'application', 'applications')}.`
      : policy.status === 'draft'
        ? `${policy.name} is left with no applications. It stays a draft.`
        : `${policy.name} becomes a draft. Its rules are kept.`

  if (!decidesFor(policy)) {
    return { policy: policyLine, signIns: `It decides nothing on ${app.name} today, so sign-ins don't change.` }
  }
  const next = nextDecider(policy, own)
  if (next) return { policy: policyLine, signIns: `Sign-ins it was deciding fall to ${next.name}.` }

  const others = own.filter((p) => p.id !== policy.id && decidesFor(p)).length
  if (others > 0) {
    return {
      policy: policyLine,
      signIns: `Sign-ins it was deciding fall to the tenant default. ${others} other ${plural(others, 'policy stays', 'policies stay')} on ${app.name}.`,
    }
  }
  return { policy: policyLine, signIns: `${app.name} is left with the tenant default only.` }
}

/** `wasDraft`: the policy was a draft before, so "now a draft" would report a change that did not happen. */
export function removeToast(policyName: string, appName: string, remaining: number, wasDraft = false): string {
  return remaining === 0
    ? `${policyName} removed from ${appName}. ${wasDraft ? 'It has no applications now.' : 'It is now a draft.'}`
    : `${policyName} removed from ${appName}. Still on ${remaining} ${plural(remaining, 'application', 'applications')}.`
}

/** The footer note once an existing policy is picked. */
export function attachNote(picked: Policy, appName: string): string {
  if (decidesFor(picked)) return `Takes effect on the next sign-in to ${appName}.`
  const reason =
    picked.status === 'draft' ? 'is a draft' : picked.status === 'inactive' ? 'is inactive' : 'has no rules turned on'
  return `${picked.name} ${reason}, so nothing changes for users yet.`
}

/** The hint under "Use an existing policy". */
export function existingHint(attachable: number, otherPolicies: number): string {
  if (attachable > 0) return 'Adds this application. The policy keeps its others.'
  return otherPolicies === 0 ? 'No other policies yet.' : 'Every policy is already on this application.'
}
