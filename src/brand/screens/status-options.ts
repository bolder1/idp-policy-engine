import { enforces, type Policy, type PolicyStatus, type PolicyType } from '../data'
import { monitorBlocker, openForEditing } from '../policy-draft'
import { ACCESS_CHECK } from './sign-in-tests/names'

/* What a published policy can be switched to, where its menu and dialog
   portal, and which switches ask first. Plain functions, kept apart from the
   components that use them. */

export type StatusTarget = 'active' | 'inactive' | 'monitor'

/* MONITORING IS NOT BUILT FOR THIS PHASE (owner, 22 Oct 2026: "Monitor should go to coming soon ... just add
   coming soon and hide the function"). Off, no screen offers the switch or View monitoring, and the app policy
   head lists Monitoring as Coming soon so the state is announced rather than quietly absent.

   A FLAG, not an edition difference: `features.monitorMode` says whether a CUSTOMER'S tier includes monitoring,
   and both tiers do — turning that off made the full edition stop granting everything, which is a contract its
   own tests hold it to. "Not built yet" is a phase. Everything behind this is kept; flip it and monitoring is a
   live state again. */
export const MONITOR_MODE: boolean = false

/** What a screen passes as `monitor`: the tier's answer and the phase's, so no caller has to remember both. */
export const monitorOffered = (features: { monitorMode: boolean }): boolean => MONITOR_MODE && features.monitorMode

/* Portals go to the app root, not <body>: the button, heading and focus resets
   are scoped to `.brand-root`, and outside it the menu items and the dialog's
   buttons render as grey UA buttons in the system font. */
export const portalRoot = (): Element => document.querySelector('.brand-root') ?? document.body

export interface StatusOption {
  target: StatusTarget
  label: string
}

/* THE SWITCHES ARE NAMED FOR THE STATE THEY PRODUCE (owner, 22 Oct 2026: "call it Active in action, whatever —
   not Turn on, Turn off — and change it globally; I mean the policy engine and in apps, everywhere").

   The pill says Active, Inactive, Draft, Monitoring. The switch beside it said Turn on and Turn off, so the thing
   you pick and the thing you read were two vocabularies for one idea, and an admin had to translate between them
   every time. Now the menu is the list of states and the current one is simply absent from it, which is how a
   state is chosen everywhere else in this console.

   It reads as a noun where the house asks for verbs on buttons, and that is the point: these are not actions on
   the policy, they are what the policy IS. Everything that routes off `target` is untouched. */
const TURN_ON: StatusOption = { target: 'active', label: 'Active' }
const TURN_OFF: StatusOption = { target: 'inactive', label: 'Inactive' }
const MONITOR: StatusOption = { target: 'monitor', label: 'Monitoring' }

/* The switches a policy offers, by how much each enforces, with the current
   status left out: Turn on, then Monitor, then Turn off. Empty for drafts,
   always-on and system policies. Monitor is for App Access policies only —
   Session and Account Management policies decide no sign-in to watch — and
   only where the edition has it.

   But a post sign-in draft offers Turn on (spec POST-SIGN-IN-POLICIES.md,
   Turning on): it is a draft until every rule and "Nothing else matched" have
   an action, and Turn on is how it leaves, refused with what is left until
   then (use-status-change.tsx) — never a switch withheld without a word.
   Linked to no application, it can still be turned on. Never Monitor: its
   statuses are Draft, Active and Inactive (owner, 13 Oct 2026). */
export function statusOptions(
  policy: Pick<Policy, 'status' | 'isSystem'> & { type?: PolicyType },
  opts: { monitor?: boolean } = {},
): StatusOption[] {
  if (policy.status === 'draft' && policy.type === 'Session' && !policy.isSystem) return [TURN_ON]
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
   where the board is the one builder.

   A post sign-in policy (post-sign-in.ts) is built in the board too, so Edit
   policy opens the board for it. It has none of the other sign-in items: no
   trail, no Read as text and no Save as template, which read and reuse a
   sign-in decision it does not have, and no Duplicate, which would copy its
   links and leave an application's event with two policies. */
export type RowMenuId = 'edit' | 'test' | StatusTarget | 'monitoring' | 'trail' | 'text' | 'template' | 'duplicate' | 'delete'

export function rowMenu(policy: Policy, opts: { monitor: boolean; trySignIn: boolean; trail: boolean }): { id: RowMenuId; label: string }[] {
  const { monitor } = opts
  const signIn = policy.type !== 'Session'
  return [
    { id: 'edit', label: 'Edit policy' },
    ...(opts.trySignIn && policy.type === 'App Access' ? [{ id: 'test' as const, label: ACCESS_CHECK }] : []),
    ...statusOptions(policy, { monitor }).map((s) => ({ id: s.target, label: s.label })),
    /* What a monitoring policy would decide, were it on (spec C §3.4). */
    ...(offersMonitoringView(policy, { monitor }) ? [{ id: 'monitoring' as const, label: 'View monitoring' }] : []),
    ...(opts.trail && signIn ? [{ id: 'trail' as const, label: 'Open in trail' }] : []),
    ...(signIn ? [{ id: 'text' as const, label: 'Read as text' }] : []),
    /* A template of a policy with no rules would apply nothing. */
    ...(signIn && openForEditing(policy).rules.length > 0 ? [{ id: 'template' as const, label: 'Save as template' }] : []),
    ...(policy.isSystem
      ? []
      : [...(signIn ? [{ id: 'duplicate' as const, label: 'Duplicate' }] : []), { id: 'delete' as const, label: 'Delete policy' }]),
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
     draft — and names which.
   - A post sign-in policy decides no sign-in at all: Turn on and Turn off
     say it starts or stops acting on events in its applications.

   SHORT TITLES, THE POLICY IN THE BODY (owner, 23 Oct 2026: short titles, never
   a long policy name inside the title; logos beside application names; the
   Remove dialog is the model). "Turn off Device compliance for Outlook and
   Dropbox?" is now "Turn off this policy?", and the first line names the policy
   once, in bold, where these words say "It", with its applications as logos.
   That is why the first line comes in pieces (`statusConfirmParts`): the dialog
   draws them, `statusConfirmCopy` joins the same pieces into words, so what is
   drawn and what a test pins cannot drift. For the same reason Inactive →
   Monitoring now opens with the policy too: "It watches sign-ins to HRMS without
   changing them", where it said "Sign-ins to HRMS don't change". */
export interface StatusConfirm {
  title: string
  lines: string[]
  verb: string
}

/** The first line of a status confirm: "It {does} {where} {applications}{rest}". */
export interface StatusLead {
  /** What the policy starts or stops doing, after its name: "stops deciding sign-ins". */
  does: string
  /** The word before its applications: sign-ins go to them, events happen in them. */
  where: 'to' | 'in'
  /** The rest of the sentence after the applications, full stop included. */
  rest: string
}

export interface StatusConfirmParts {
  title: string
  verb: string
  lead: StatusLead
  /** The lines after it: what is held back. */
  notes: string[]
}

export function statusConfirmParts(
  policy: Pick<Policy, 'status' | 'pendingDraft'> & { type?: PolicyType },
  target: StatusTarget,
  unsaved: boolean,
): StatusConfirmParts {
  if (policy.type === 'Session' && target !== 'monitor') {
    return target === 'active'
      ? { title: 'Turn on this policy?', lead: { does: 'starts acting on events', where: 'in', rest: '.' }, notes: [], verb: 'Turn on' }
      : { title: 'Turn off this policy?', lead: { does: 'stops acting on events', where: 'in', rest: '.' }, notes: [], verb: 'Turn off' }
  }
  if (target === 'active') {
    return {
      title: 'Turn on this policy?',
      lead: { does: 'starts deciding sign-ins', where: 'to', rest: '.' },
      notes: policy.pendingDraft ? ['Your saved draft is not included.'] : [],
      verb: 'Turn on',
    }
  }
  if (target === 'inactive') return { title: 'Turn off this policy?', lead: { does: 'stops deciding sign-ins', where: 'to', rest: '.' }, notes: [], verb: 'Turn off' }
  if (policy.status === 'active') {
    return {
      title: 'Monitor this policy?',
      lead: { does: 'stops deciding sign-ins', where: 'to', rest: ' and records what it would decide.' },
      notes: [],
      verb: 'Monitor',
    }
  }
  const heldBack = unsaved ? 'Your unsaved changes are not included.' : policy.pendingDraft ? 'Your saved draft is not included.' : null
  return {
    title: 'Monitor this policy?',
    lead: { does: 'watches sign-ins', where: 'to', rest: ' without changing them.' },
    notes: heldBack ? [heldBack] : [],
    verb: 'Monitor',
  }
}

export function statusConfirmCopy(
  policy: Pick<Policy, 'name' | 'status' | 'pendingDraft'> & { type?: PolicyType },
  target: StatusTarget,
  unsaved: boolean,
  apps: string | null,
): StatusConfirm {
  const { title, verb, lead, notes } = statusConfirmParts(policy, target, unsaved)
  return { title, verb, lines: [`It ${lead.does}${apps ? ` ${lead.where} ${apps}` : ''}${lead.rest}`, ...notes] }
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
