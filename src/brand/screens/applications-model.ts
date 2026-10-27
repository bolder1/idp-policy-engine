import { appsOf, lastUpdatedAt, type App, type Group, type Policy, type User } from '../data'
import type { BrandStore } from '../store'
import type { ToastTone } from '../toast-tone'
import { attachTo, detachFrom } from './app-policies'
import { appStanding, deciderChanges, engineDecides, visibleMoves, type RowState } from './app-standing'

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

/* The toast after a swap (24 Oct 2026, review): short, because the confirm has just named both policies and the
   applications with their logos. What decides on the application now, in one clause, and the old policy only when
   something happened to it that the admin should know of — it became a draft. "Still on 1 application" is not
   said: the confirm named those applications, and a count in their place reads as a different fact. Neither name
   is said twice. A policy going on that decides nobody's sign-in here (a draft, off, monitoring, shadowed) does not
   "decide sign-ins", so it is said to be the application's policy, which it is. */
export function replaceToast(newName: string, appName: string, said: { decides: boolean; oldName: string; oldNowDraft: boolean }): string {
  const lead = said.decides ? `${newName} now decides sign-ins on ${appName}.` : `${newName} is now the policy on ${appName}.`
  return said.oldNowDraft ? `${lead} ${said.oldName} is now a draft.` : lead
}

/* One tone for every swap's toast, given outright (store.tsx `showToast`'s `tone`), not read off the words: read off
   them, "is now a draft" came out green and "still on" blue for the same press (toast-tone.ts). The swap was made as
   the confirm said it would be, so it is news of a thing done. */
export const REPLACE_TOAST_TONE: ToastTone = 'success'

/* What a replace is about to do, said BEFORE the write (owner, 22 Oct 2026:
   "just fix the guards and confirms so nothing is silently lost").

   Replace is a removal and an add in one press, and only the add was ever
   announced: `attachNote` spoke for the policy going on, while the one coming
   off was described nowhere until the toast had already written it. Two
   consequences were therefore silent, and both lose something.

   The first is the old policy's RULES. A published policy that loses its last
   application becomes a draft, and the store settles it onto its saved draft's
   rules (fixtures.ts `settled`), so the published rules it was enforcing are
   gone. The remove dialog has said this since it was written; `removeCopy` is
   that sentence, so this reuses it rather than writing a second version that
   can drift from it.

   The second is PROTECTION. Replacing a policy that decides sign-ins with a
   draft, an inactive or a monitoring one leaves the application deciding
   nothing of its own: it falls through to the tenant default. `attachNote`
   says the new policy changes nothing "yet", which is true of the new policy
   and quietly wrong about the application — nothing changing is not what
   happens when the thing that was deciding comes off. */
export interface ReplaceCopy {
  /** What becomes of the policy coming off, in `removeCopy`'s words. */
  policy: string
  /** Only when the application ends up with nothing of its own deciding. */
  protection: string | null
}

export function replaceCopy(
  oldPolicy: Policy,
  newPolicy: Policy,
  app: Pick<App, 'id' | 'name'>,
  fallbackName = 'the tenant default',
): ReplaceCopy {
  return {
    policy: removeCopy(oldPolicy, app).policy,
    protection:
      engineDecides(oldPolicy) && !engineDecides(newPolicy)
        ? `${oldPolicy.name} decides sign-ins to ${app.name} today. ${newPolicy.name} does not, so ${app.name} falls back to ${fallbackName}.`
        : null,
  }
}

/* What the Replace confirm names (owner, 24 Oct 2026, option A: "pick a policy in a slider, one confirm that
   swaps it live on this app, with Undo. No copy, no draft"; replace-dialog.tsx `ReplaceDialog`).

   The things, not the sentences, so the dialog can draw each application with its logo (owner, 23 Oct 2026:
   "logos beside application names") and name each policy once. `replaceCopy` above says the same two
   consequences as sentences; these are its facts, read from the engine rather than from status alone.

   `off` takes `removeCopy`'s branches in `removeCopy`'s order, because the write is the same `detachFrom`
   (applications-model.test.ts pins the two together): still on other applications; a draft already, left with
   none; or a draft now — and `rulesGo` when the store then settles it onto its saved draft (fixtures.ts
   `settled`), so the published rules it was enforcing are what goes.

   `until` is the engine's answer for the policy going on, with the swap applied: null when it decides
   somebody's sign-in here, otherwise why not and the policy that decides them meanwhile — the Global Default,
   unless something else on the application still stands in front of it. `ahead` says which: true only when a
   policy the engine named stands in front of it for the people it names (`lostTo`). A live policy naming nobody
   the directory has (`keysOf` returns none) is shadowed by nothing — it simply has nobody — so the policy that
   decides is the fall-through, and saying that one "decides first" would be false of the Global Default, which
   never decides first.

   `rest` is the half `until` cannot see (review, 24 Oct 2026): the policy going on decides for SOME of the people
   the old one did — a policy for groups in place of one for everyone — and everybody else it does not name falls
   to the next policy, often the Global Default. Read as the Remove confirm reads its targets (AppProtection.tsx
   `RemoveDialog`: `deciderChanges`, then `visibleMoves`): the moves off the old policy that do not land on the new
   one, by where they land. Empty while `until` is set, which already says where everybody goes. */
export interface ReplaceFacts {
  off: { kind: 'stays'; apps: App[]; count: number } | { kind: 'left' } | { kind: 'draft'; rulesGo: boolean }
  /** The other applications the policy going on is on already. Nothing about them changes. */
  alsoOn: App[]
  until: { state: Exclude<RowState, 'decides'>; next: Policy | null; ahead: boolean } | null
  /** Where the people the old policy decided for and the new one does not go: the policies they land on, once each. */
  rest: Policy[]
  /** One of the two decides a sign-in here, so somebody's next sign-in is decided differently. */
  moves: boolean
  /** The one coming off decides here and the one going on will not: the application loses its own policy's protection. */
  drops: boolean
}

export function replaceFacts(
  oldPolicy: Policy,
  newPolicy: Policy,
  app: Pick<App, 'id' | 'name'>,
  tenant: { policies: readonly Policy[]; apps: App[]; users: readonly User[]; groups: readonly Group[] },
): ReplaceFacts {
  const { policies, apps, users, groups } = tenant
  const remaining = remainingApps(oldPolicy, app.id)
  const off: ReplaceFacts['off'] =
    remaining > 0
      ? { kind: 'stays', apps: appsOf(oldPolicy, apps).filter((a) => a.id !== app.id), count: remaining }
      : oldPolicy.status === 'draft'
        ? { kind: 'left' }
        : { kind: 'draft', rulesGo: !!oldPolicy.pendingDraft }
  /* Both halves at once, as `replaceOnApp` writes them: read with only the add, the one going on would look
     shadowed by the one about to come off. */
  const after = policies.map((p) =>
    p.id === newPolicy.id ? attachTo(p, app.id, apps) : p.id === oldPolicy.id && !p.isSystem ? detachFrom(p, app.id) : p,
  )
  const wasDeciding = appStanding(app.id, policies, users).rows.some((r) => r.policy.id === oldPolicy.id && r.state === 'decides')
  const now = appStanding(app.id, after, users)
  const row = now.rows.find((r) => r.policy.id === newPolicy.id)
  const deciding = row?.state === 'decides'
  const ahead = row?.state === 'never' ? (row.lostTo[0]?.to ?? null) : null
  const until = !row || row.state === 'decides' ? null : { state: row.state, next: ahead ?? now.everyoneElse ?? now.fallback, ahead: !!ahead }
  const rest: Policy[] = []
  if (!until && wasDeciding) {
    const moved = visibleMoves(deciderChanges(app.id, policies, after, users, groups), app.id, policies, after)
    for (const m of moved) {
      if (m.from?.id !== oldPolicy.id || !m.to || m.to.id === newPolicy.id || rest.some((p) => p.id === m.to!.id)) continue
      rest.push(m.to)
    }
  }
  return {
    off,
    alsoOn: appsOf(newPolicy, apps).filter((a) => a.id !== app.id),
    until,
    rest,
    moves: wasDeciding || deciding,
    drops: wasDeciding && !deciding,
  }
}

/** The confirm's title: the application only, never the policy names, which can run to fifty characters each. */
export const replaceTitle = (app: Pick<App, 'name'>) => `Replace on ${app.name}?`

/* The confirm's tone, by the status confirm's rule (use-status-change.tsx): a press that stops a live policy
   deciding is the red one, so a swap that leaves the application with nothing of its own deciding has the red
   Replace, as Turn off does; one that changes who is let in warns; one that moves nobody is information. Red
   ONLY then: a swap onto a policy that decides is the admin's routine change, and the old policy's fate is
   said in the card and undone by Undo. */
export function replaceTone(f: Pick<ReplaceFacts, 'moves' | 'drops'>): { tone: ToastTone; destructive: boolean } {
  if (f.drops) return { tone: 'warning', destructive: true }
  return { tone: f.moves ? 'warning' : 'info', destructive: false }
}

/* Replace policy (APP-POLICY-TAB.md §5): the new policy goes on and the old
   one comes off in the same press, so the application never holds two (one
   application, one sign-in policy, 14 Oct 2026) — and ONE toast says so, with
   one Undo that puts both back. Two toasts, one per write, left only the
   second in the store's one slot, and its Undo put the old policy back beside
   the new one. Same re-read and the same stale-write refusal as `addToApp`.

   THE TRUTH AT THE PRESS (review, 24 Oct 2026). Both policies are re-read here, and the swap is refused — false,
   nothing written, no toast — unless the one coming off is STILL on this application and the one going on still
   exists and is not the tenant default. Before this, nothing checked the first half: replace AWS access with Slack
   access on Box, open Replace again, press the first toast's Undo while that confirm is up, and the confirm's press
   detached Slack access (already off Box) and attached the pick — Box ended with AWS access AND the pick, two
   policies on one application. The same refusal makes a second press of a confirm that is closing a no-op rather
   than a second swap whose toast replaced the first one's Undo.

   A pick that is on the application already — the draft copy Duplicate for {app} parks there — is the natural way
   to put that copy in charge: attaching it is a no-op, and only the old policy comes off.

   `decides` is what the toast says of the one going on (the caller asked the engine with both halves applied, as
   the confirm did); absent, whether it can decide at all. `afterUndo` runs once an Undo has put both back, so the
   page can hand focus to the restored policy's heading rather than leave it on <body> where the toast was. */
export function replaceOnApp(
  store: PolicyWriter,
  oldId: string,
  newId: string,
  app: Pick<App, 'id' | 'name'>,
  apps: App[],
  opts: { decides?: boolean; afterUndo?: () => void } = {},
): boolean {
  if (oldId === newId) return false
  const beforeNew = store.policyById(newId)
  if (!beforeNew || beforeNew.isSystem) return false
  const beforeOld = store.policyById(oldId)
  if (!beforeOld || beforeOld.isSystem || !beforeOld.appIds.includes(app.id)) return false
  if (!beforeNew.appIds.includes(app.id)) store.savePolicy(attachTo(beforeNew, app.id, apps))
  const savedNew = store.policyById(newId)
  store.savePolicy(detachFrom(beforeOld, app.id))
  const savedOld = store.policyById(oldId)
  const said = {
    decides: opts.decides ?? engineDecides(beforeNew),
    oldName: beforeOld.name,
    oldNowDraft: remainingApps(beforeOld, app.id) === 0 && beforeOld.status !== 'draft',
  }
  store.showToast(replaceToast(beforeNew.name, app.name, said), {
    label: 'Undo',
    run: () => {
      /* Both or neither: half an Undo would leave two policies on the application, or none. */
      if (!savedNew || !savedOld || store.policyById(newId) !== savedNew || store.policyById(oldId) !== savedOld) {
        store.showToast(`Can't undo. ${beforeNew.name} or ${beforeOld.name} has changed since.`)
        return
      }
      store.savePolicy(beforeOld)
      store.savePolicy(beforeNew)
      opts.afterUndo?.()
    },
  }, { tone: REPLACE_TOAST_TONE })
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
