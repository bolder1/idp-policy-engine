import { enforces, type Policy, type PolicyStatus, type PolicyType } from '../data'
import { monitorBlocker, openForEditing } from '../policy-draft'
import { ACCESS_CHECK } from './sign-in-tests/names'

/* What a published policy can be switched to, where its menu and dialog
   portal, and which switches ask first. Plain functions, kept apart from the
   components that use them. */

export type StatusTarget = 'active' | 'inactive' | 'monitor'

/* Portals go to the app root, not <body>: the button, heading and focus resets
   are scoped to `.brand-root`, and outside it the menu items and the dialog's
   buttons render as grey UA buttons in the system font. */
export const portalRoot = (): Element => document.querySelector('.brand-root') ?? document.body

export interface StatusOption {
  target: StatusTarget
  label: string
}

const TURN_ON: StatusOption = { target: 'active', label: 'Turn on' }
const TURN_OFF: StatusOption = { target: 'inactive', label: 'Turn off' }
const MONITOR: StatusOption = { target: 'monitor', label: 'Monitor' }

/* The switches a policy offers, by how much each enforces, with the current
   status left out: Turn on, then Monitor, then Turn off. Empty for drafts,
   always-on and system policies. Monitor is for App Access policies only —
   Session and Account Management policies decide no sign-in to watch — and
   only where the edition has it. */
export function statusOptions(
  policy: Pick<Policy, 'status' | 'isSystem'> & { type?: PolicyType },
  opts: { monitor?: boolean } = {},
): StatusOption[] {
  if (policy.isSystem || policy.status === 'draft' || policy.status === 'always-on') return []
  const monitor = opts.monitor !== false && (policy.type ?? 'App Access') === 'App Access'
  switch (policy.status) {
    case 'active':
      return monitor ? [MONITOR, TURN_OFF] : [TURN_OFF]
    case 'inactive':
      return monitor ? [TURN_ON, MONITOR] : [TURN_ON]
    case 'monitor':
      return [TURN_ON, TURN_OFF]
  }
}

/* Whether a policy's menus offer View monitoring — the row menu after its
   switches, the status control after a rule — and whether the Monitoring page
   may show it: a monitoring policy, where the edition has the status. */
export function offersMonitoringView(policy: Pick<Policy, 'status'>, opts: { monitor?: boolean } = {}): boolean {
  return opts.monitor !== false && policy.status === 'monitor'
}

/* The Monitoring page as the store now stands: which policy, and whether it
   shows. It shows only while its policy is monitoring (`watching`); switched
   on or off — from its own footer, the list, a toast — or deleted, it shuts,
   and a later switch back to monitoring, an Undo among them, leaves it shut
   until it is asked for again. */
export interface MonitoringWatch {
  policyId: string
  open: boolean
}

export function watchAfter(watch: MonitoringWatch | null, watching: boolean): MonitoringWatch | null {
  return watch?.open && !watching ? { ...watch, open: false } : watch
}

/* A policy's row menu, the same in every view (final spec C.3): Edit policy;
   Try a sign-in; the switches, by strength; View monitoring; then the rest —
   Read as text among them, directly before Save as template (describe spec,
   §7.2), for every policy and every edition, because it only reads.
   `monitor`: the edition has the Monitoring status. `trySignIn`: the edition
   has Try a sign-in, which only an app access policy can be tried with.
   `trail`: the older trail builder is offered — not in the showcase build,
   where the board is the one builder. */
export type RowMenuId = 'edit' | 'test' | StatusTarget | 'monitoring' | 'trail' | 'text' | 'template' | 'duplicate' | 'delete'

export function rowMenu(policy: Policy, opts: { monitor: boolean; trySignIn: boolean; trail: boolean }): { id: RowMenuId; label: string }[] {
  const { monitor } = opts
  return [
    { id: 'edit', label: 'Edit policy' },
    ...(opts.trySignIn && policy.type === 'App Access' ? [{ id: 'test' as const, label: ACCESS_CHECK }] : []),
    ...statusOptions(policy, { monitor }).map((s) => ({ id: s.target, label: s.label })),
    /* What a monitoring policy would decide, were it on (spec C §3.4). */
    ...(offersMonitoringView(policy, { monitor }) ? [{ id: 'monitoring' as const, label: 'View monitoring' }] : []),
    ...(opts.trail ? [{ id: 'trail' as const, label: 'Open in trail' }] : []),
    { id: 'text' as const, label: 'Read as text' },
    /* A template of a policy with no rules would apply nothing. */
    ...(openForEditing(policy).rules.length > 0 ? [{ id: 'template' as const, label: 'Save as template' }] : []),
    ...(policy.isSystem
      ? []
      : [
          { id: 'duplicate' as const, label: 'Duplicate' },
          { id: 'delete' as const, label: 'Delete policy' },
        ]),
  ]
}

/* Whether a switch asks before it is made (owner, 25 Sep 2026: interrupt only
   when it matters).

   It matters when somebody's sign-in changes, which is exactly when the switch
   starts or stops enforcement: Turn on, Turn off an Active policy, Active to
   monitoring. Between Inactive and Monitoring nobody's sign-in changes, so the
   switch is made at once with an Undo — except that Monitoring reads the
   stored rules, and when the admin holds edits or a saved draft that are not
   those rules (`heldBack`), they are told before it starts. */
export function asksFirst(from: PolicyStatus, to: StatusTarget, heldBack: boolean): boolean {
  if (enforces({ status: from }) !== enforces({ status: to })) return true
  return to === 'monitor' && heldBack
}

/* Which guard page a switch opens, or null for the plain path — the Can't
   dialog, the one-line confirm, or the switch made at once (final spec D.2).

     Turn on               Before turning on, always — unless a draft or a
                           policy with no application is refused first, or
                           neither version's rules can turn on.
     Turn off, Monitor     only from Active, and only when somebody is newly
                           let in. Monitor with no application goes to Can't.

   `guarded` is the edition having the checks for this policy. The other two
   run the checks, so they are called only for the switch that needs them:
   `turnsOn` says a version turns on clean, `newlyAllows` that switching lets
   somebody in who was kept out. */
export type GuardedKind = 'turn-on' | 'turn-off' | 'to-monitor'

export function guardFor(
  policy: Pick<Policy, 'status' | 'isSystem' | 'appIds'>,
  target: StatusTarget,
  checks: { guarded: boolean; turnsOn: () => boolean; newlyAllows: () => boolean },
): GuardedKind | null {
  if (!checks.guarded) return null
  if (target === 'active') {
    const hasApps = policy.isSystem === true || policy.appIds.length > 0
    return policy.status !== 'draft' && hasApps && checks.turnsOn() ? 'turn-on' : null
  }
  if (policy.status !== 'active') return null
  if (target === 'monitor' && monitorBlocker(policy) !== null) return null
  return checks.newlyAllows() ? (target === 'inactive' ? 'turn-off' : 'to-monitor') : null
}

/* What Before turning on adds, by where it was asked from: Monitor instead
   from Inactive, where the menu offers Monitor; the While monitoring row from
   Monitoring, where there is something it would have decided. */
export function turnOnExtras(
  policy: Pick<Policy, 'status' | 'isSystem'> & { type?: PolicyType },
  opts: { monitor?: boolean } = {},
): { monitorInstead: boolean; whileMonitoring: boolean } {
  return {
    monitorInstead: policy.status === 'inactive' && statusOptions(policy, opts).some((o) => o.target === 'monitor'),
    whileMonitoring: policy.status === 'monitor',
  }
}

/* The toast after a switch, and the status its Undo goes back to — offered
   only between the two statuses that enforce nothing (Inactive and
   Monitoring). An Undo that restored enforcement would be a Turn on that
   skipped its confirmation. */
export function statusToast(name: string, from: PolicyStatus, to: StatusTarget): { text: string; undo: PolicyStatus | null } {
  const text = to === 'active' ? `${name} is on` : to === 'inactive' ? `${name} is off` : `${name} is monitoring`
  const quiet = (s: PolicyStatus) => s === 'inactive' || s === 'monitor'
  return { text, undo: quiet(from) && quiet(to) ? from : null }
}

/* The confirmation a switch shows when `asksFirst` says it asks (Spec C §3.3).

   `apps` is the policy's applications as words in a sentence, or null when it
   has none. `unsaved` is the builder holding edits nobody has saved.

   - Turn on and Turn off say what starts or stops being decided. Turn on also
     says a saved draft is not what turns on.
   - Active → Monitoring (M1) stops enforcement, and says only that.
   - Inactive → Monitoring (M2) changes nobody's sign-in, so it asks only
     because something is held back from it — the builder's edits, else a saved
     draft — and names which. */
export interface StatusConfirm {
  title: string
  lines: string[]
  verb: string
}

export function statusConfirmCopy(
  policy: Pick<Policy, 'name' | 'status' | 'pendingDraft'>,
  target: StatusTarget,
  unsaved: boolean,
  apps: string | null,
): StatusConfirm {
  const { name } = policy
  const to = apps ? ` to ${apps}` : ''
  if (target === 'active') {
    return {
      title: `Turn on ${name}?`,
      lines: [`It starts deciding sign-ins${to}.`, ...(policy.pendingDraft ? ['Your saved draft is not included.'] : [])],
      verb: 'Turn on',
    }
  }
  if (target === 'inactive') return { title: `Turn off ${name}?`, lines: [`It stops deciding sign-ins${to}.`], verb: 'Turn off' }
  if (policy.status === 'active') {
    return { title: `Switch ${name} to monitoring?`, lines: [`It stops deciding sign-ins${to} and records what it would decide.`], verb: 'Monitor' }
  }
  const heldBack = unsaved ? 'Your unsaved changes are not included.' : policy.pendingDraft ? 'Your saved draft is not included.' : null
  return { title: `Monitor ${name}?`, lines: [`Sign-ins${to} don't change.`, ...(heldBack ? [heldBack] : [])], verb: 'Monitor' }
}

/* Whether the toast after a save offers "Monitor" (owner, 25 Sep 2026: Draft →
   Monitoring goes through Save first). Only on the save that takes a draft out
   of draft and leaves it off, and only where the policy could be switched to
   monitoring from the menu — so the toast never offers what the pill would not. */
export function offersMonitorAfterSave(
  before: Pick<Policy, 'status'>,
  after: Pick<Policy, 'status' | 'isSystem'> & { type?: PolicyType },
  opts: { monitor?: boolean } = {},
): boolean {
  return before.status === 'draft' && after.status === 'inactive' && statusOptions(after, opts).some((o) => o.target === 'monitor')
}
