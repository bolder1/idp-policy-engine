import { lastUpdatedAt, type App, type Policy, type User } from '../data'
import type { BrandStore } from '../store'
import { attachTo, detachFrom } from './app-policies'
import { appStanding, engineDecides } from './app-standing'

/* -----------------------------------------------------------------------------
   The Applications screen's sentences and sort, kept out of the components so
   they can be tested without rendering.
   -------------------------------------------------------------------------- */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** Last updated, oldest first; ties by name. Reads the timestamp, never the fixture's order. */
export function compareUpdated(a: App, b: App): number {
  return lastUpdatedAt(a) - lastUpdatedAt(b) || a.name.localeCompare(b.name)
}

/** How many applications the policy keeps after it comes off this one. */
export const remainingApps = (policy: Policy, appId: string) => policy.appIds.filter((id) => id !== appId).length

export interface RemoveCopy {
  /** What happens to the policy itself. */
  policy: string
}

/* The remove confirmation's sentence about the policy. What happens to
   sign-ins is not a sentence any more: the dialog lists who moves to which
   policy, from `deciderChanges` (app-standing.ts).

   A published policy with a saved draft that loses its last application
   becomes a draft, and the store settles it on the saved draft's rules
   (fixtures.ts `settled`) — so the published rules are what goes, and the
   sentence says so rather than "its rules are kept". */
export function removeCopy(policy: Policy, app: Pick<App, 'id' | 'name'>): RemoveCopy {
  const remaining = remainingApps(policy, app.id)
  if (remaining > 0) return { policy: `${policy.name} stays on ${remaining} other ${plural(remaining, 'application', 'applications')}.` }
  if (policy.status === 'draft') return { policy: `${policy.name} is left with no applications. It stays a draft.` }
  if (policy.pendingDraft) return { policy: `${policy.name} becomes a draft. Its saved draft replaces the published rules.` }
  return { policy: `${policy.name} becomes a draft. Its rules are kept.` }
}

/** `wasDraft`: the policy was a draft before, so "now a draft" would report a change that did not happen. */
export function removeToast(policyName: string, appName: string, remaining: number, wasDraft = false): string {
  return remaining === 0
    ? `${policyName} removed from ${appName}. ${wasDraft ? 'It has no applications now.' : 'It is now a draft.'}`
    : `${policyName} removed from ${appName}. Still on ${remaining} ${plural(remaining, 'application', 'applications')}.`
}

/** What the add and remove writes need of the store. */
export type PolicyWriter = Pick<BrandStore, 'policyById' | 'savePolicy' | 'showToast'>

/* Undo puts the policy back only while it is still exactly what the write
   saved. A save in between — a rename, a status change, another application —
   would otherwise be thrown away by an Undo pressed a few seconds later, so it
   says it cannot instead. By identity: the store keeps the object until the
   next save replaces it. */
function undoTo(store: PolicyWriter, before: Policy, saved: Policy | undefined) {
  if (!saved || store.policyById(before.id) !== saved) {
    store.showToast(`Can't undo. ${before.name} has changed since.`)
    return
  }
  store.savePolicy(before)
}

/* Takes the policy off the application, and says so with Undo. Re-read by id
   at the moment of the write, never from a render: `savePolicy` replaces the
   whole record, so writing a stale copy would revert edits made elsewhere.
   False when the policy no longer exists. */
export function removeFromApp(store: PolicyWriter, policyId: string, app: Pick<App, 'id' | 'name'>): boolean {
  const before = store.policyById(policyId)
  if (!before || before.isSystem) return false
  store.savePolicy(detachFrom(before, app.id))
  const saved = store.policyById(policyId)
  store.showToast(removeToast(before.name, app.name, remainingApps(before, app.id), before.status === 'draft'), {
    label: 'Undo',
    run: () => undoTo(store, before, saved),
  })
  return true
}

/* Puts the policy on the application, and says so with Undo. Same re-read and
   the same Undo as `removeFromApp`. `apps` is the catalogue `attachTo`
   checks the id against. */
export function addToApp(store: PolicyWriter, policyId: string, app: Pick<App, 'id' | 'name'>, apps: App[]): boolean {
  const before = store.policyById(policyId)
  if (!before || before.isSystem) return false
  store.savePolicy(attachTo(before, app.id, apps))
  const saved = store.policyById(policyId)
  store.showToast(`${before.name} added to ${app.name}.`, { label: 'Undo', run: () => undoTo(store, before, saved) })
  return true
}

/** "Replaced Box access with Box contractors on Box." and what became of the one taken off, as `removeToast` says it. */
export function replaceToast(oldName: string, newName: string, appName: string, remaining: number, wasDraft = false): string {
  const after = remaining === 0 ? `${oldName} ${wasDraft ? 'has no applications now' : 'is now a draft'}.` : `${oldName} is still on ${remaining} ${plural(remaining, 'application', 'applications')}.`
  return `Replaced ${oldName} with ${newName} on ${appName}. ${after}`
}

/* Replace policy (APP-POLICY-TAB.md §5): the new policy goes on and the old
   one comes off in the same press, so the application never holds two (one
   application, one sign-in policy, 14 Oct 2026) — and ONE toast says so, with
   one Undo that puts both back. Two toasts, one per write, left only the
   second in the store's one slot, and its Undo put the old policy back beside
   the new one. Same re-read and the same stale-write refusal as `addToApp`.
   False when the new policy no longer exists. */
export function replaceOnApp(store: PolicyWriter, oldId: string, newId: string, app: Pick<App, 'id' | 'name'>, apps: App[]): boolean {
  const beforeNew = store.policyById(newId)
  if (!beforeNew || beforeNew.isSystem) return false
  const beforeOld = store.policyById(oldId)
  store.savePolicy(attachTo(beforeNew, app.id, apps))
  const savedNew = store.policyById(newId)
  if (!beforeOld || beforeOld.isSystem) {
    store.showToast(`${beforeNew.name} added to ${app.name}.`, { label: 'Undo', run: () => undoTo(store, beforeNew, savedNew) })
    return true
  }
  store.savePolicy(detachFrom(beforeOld, app.id))
  const savedOld = store.policyById(oldId)
  store.showToast(replaceToast(beforeOld.name, beforeNew.name, app.name, remainingApps(beforeOld, app.id), beforeOld.status === 'draft'), {
    label: 'Undo',
    run: () => {
      /* Both or neither: half an Undo would leave two policies on the application, or none. */
      if (!savedNew || !savedOld || store.policyById(newId) !== savedNew || store.policyById(oldId) !== savedOld) {
        store.showToast(`Can't undo. ${beforeNew.name} or ${beforeOld.name} has changed since.`)
        return
      }
      store.savePolicy(beforeOld)
      store.savePolicy(beforeNew)
    },
  })
  return true
}

/** The application a pick would land on, and the lists `attachNote` asks the engine with. */
export interface AttachOn {
  appId: string
  policies: readonly Policy[]
  users: readonly User[]
  apps: App[]
}

/* The footer note once an existing policy is picked. A live policy with no
   rules takes effect too — it decides by its last row — so the reasons are its
   status, its type, and, given `on`, its row on the app with the attach
   applied (`appStanding`), the answer Add existing gives on the app page: a
   live policy another policy shadows for everyone it names never decides
   there. "AWS production for DevOps" on GitHub Enterprise is one — DevOps
   uses "Developer tools — office and device checks". */
export function attachNote(picked: Policy, appName: string, on?: AttachOn): string {
  if (engineDecides(picked)) {
    if (on && neverDecides(picked, on)) return `${picked.name} never decides on ${appName}, so nothing changes for users.`
    return `Takes effect on the next sign-in to ${appName}.`
  }
  /* Not "yet": no status change makes it decide. */
  if (picked.type !== 'App Access') return `${picked.name} is not an app access policy, so nothing changes for users.`
  const reason = picked.status === 'draft' ? 'is a draft' : picked.status === 'inactive' ? 'is inactive' : 'is monitoring'
  return `${picked.name} ${reason}, so nothing changes for users yet.`
}

function neverDecides(picked: Policy, { appId, policies, users, apps }: AttachOn): boolean {
  const after = policies.map((p) => (p.id === picked.id ? attachTo(p, appId, apps) : p))
  return appStanding(appId, after, users).rows.find((r) => r.policy.id === picked.id)?.state === 'never'
}

/** The hint under "Use an existing policy". */
export function existingHint(attachable: number, otherPolicies: number): string {
  if (attachable > 0) return 'Adds this application. The policy keeps its others.'
  return otherPolicies === 0 ? 'No other policies yet.' : 'Every policy is already on this application.'
}
