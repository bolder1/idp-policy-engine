/* -----------------------------------------------------------------------------
   Post sign-in policies (owner, 13 Oct 2026; spec docs/specs/POST-SIGN-IN-POLICIES.md).

   The second policy type. A sign-in policy decides once, when somebody signs
   in to an application. A post sign-in policy acts afterwards, during the
   session, each time one of an application's EVENTS happens: something done
   inside the app (a report export, a file shared outside), or something the
   IdP sees about the session (the IP changes, risk rises, the session ages).

   The owner's rulings, 13 Oct 2026:
   - Named "Post sign-in policy" on screen; today's type is "Sign-in policy".
     Never "login".
   - Kept apart from sign-in policies: its own list, its own builder, never in
     the sign-in engine, Access checks or an application's sign-in Policies.
   - The policy is INDEPENDENT of applications: its rules and Otherwise only.
     Applications are linked to it from outside — the application's page —
     each with the events of it the policy decides. Many applications can be
     linked; an event of an application is decided by one policy at most.
   - Actions: Allow, Deny, Step up, Terminate session, Block device. Block
     device blocks the device on that application only.
   - Built in THE SAME BUILDER as a sign-in policy (owner, 13 Oct 2026: no
     new builder until needed): the board's rules, Who / If / Then, with the
     five actions as the Then (`Rule.action`) and "Nothing else matched" as
     the last row.
   - It is turned on only when every rule and the last row have an action;
     until then it is a draft and the reason is said in the builder.
   - Statuses: Draft, Active, Inactive. No Monitoring.

   Stored on `Policy` as `type: 'Session'` (the slot the model has always had)
   with `session` holding its links; its rules are `Policy.rules`. `appIds` mirrors the
   linked applications so the Policies table's Applications column keeps
   working; every sign-in surface filters
   `type === 'App Access'`, so these never decide a sign-in.

   Event lists: researched 13 Oct 2026 (docs/research/post-login-13-oct,
   local). Vendor event names are the vendors' own where they were read; the
   rest are marked in the research. FABRICATED as a catalogue: no connector
   reads them yet.
   -------------------------------------------------------------------------- */

import { EVERYONE, fallbackRule, type Policy } from './data'
import { LOGO_SOURCES } from './logos/sources'

// --- Actions -----------------------------------------------------------------------

export type PostAction = 'allow' | 'deny' | 'step-up' | 'terminate' | 'block-device'

export const POST_ACTIONS: { value: PostAction; label: string }[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'deny', label: 'Deny' },
  { value: 'step-up', label: 'Step up' },
  { value: 'terminate', label: 'Terminate session' },
  { value: 'block-device', label: 'Block device' },
]

export const postActionLabel = (a: PostAction): string => POST_ACTIONS.find((x) => x.value === a)?.label ?? a

/* What each action does, for a tip beside the choice. One short sentence
   each; Block device says its scope (owner, 13 Oct 2026: that application only). */
export const POST_ACTION_NOTE: Record<PostAction, string> = {
  allow: 'The event goes ahead.',
  deny: 'The event is refused. The session carries on.',
  'step-up': 'The event waits until the person passes a second factor.',
  terminate: 'The session on this application ends. The next visit is a fresh sign-in.',
  'block-device': 'The device is blocked on this application until an admin unblocks it.',
}

// --- Events --------------------------------------------------------------------------

/* How an event reaches the IdP, which decides what can be done about it:
   - before: the app (or a proxy in front of it) asks first and waits.
   - after:  the app reports it once it has happened; it cannot be refused.
   - session: the IdP sees it itself (IP, device, risk, account, time). */
export type EventArrival = 'before' | 'after' | 'session'

export const ARRIVAL_LABEL: Record<EventArrival, string> = {
  before: 'Checked before',
  after: 'Reported after',
  session: 'Session',
}

/** The conditions an event's own details allow, beyond the session ones. */
export type EventDetail = 'records' | 'label' | 'destination' | 'amount' | 'volume'

export interface SessionEvent {
  id: string
  name: string
  arrival: EventArrival
  /** The vendor's own name for it, shown in details only. */
  vendor?: string
  /** Details the event carries that a condition can read. */
  details?: EventDetail[]
}

/* Seen by the IdP on every application, connector or not. */
export const SESSION_EVENTS: SessionEvent[] = [
  { id: 'ip-change', name: 'IP or location change', arrival: 'session' },
  { id: 'device-change', name: 'Device change', arrival: 'session' },
  { id: 'device-compliance', name: 'Device compliance change', arrival: 'session', vendor: 'CAEP device-compliance-change' },
  { id: 'risk-change', name: 'Risk level change', arrival: 'session', vendor: 'CAEP risk-level-change' },
  { id: 'account-change', name: 'Account change', arrival: 'session', vendor: 'CAEP credential-change' },
  { id: 'session-age', name: 'Session age', arrival: 'session' },
]

/* In-app events, by the logo registry id the application resolves to. */
export const APP_EVENTS: Record<string, SessionEvent[]> = {
  salesforce: [
    { id: 'sf-report-export', name: 'Report export', arrival: 'before', vendor: 'ReportEvent', details: ['records'] },
    { id: 'sf-api-query', name: 'API query', arrival: 'before', vendor: 'ApiEvent', details: ['records'] },
    { id: 'sf-list-view', name: 'List view', arrival: 'before', vendor: 'ListViewEvent', details: ['records'] },
    { id: 'sf-file-download', name: 'File download', arrival: 'before', vendor: 'FileEvent', details: ['label'] },
    { id: 'sf-permission-change', name: 'Permission set change', arrival: 'before', vendor: 'PermissionSetEventStore' },
  ],
  m365: [
    { id: 'ms-download', name: 'File download', arrival: 'before', vendor: 'Control file download', details: ['label'] },
    { id: 'ms-upload', name: 'File upload', arrival: 'before', vendor: 'Control file upload', details: ['label'] },
    { id: 'ms-print', name: 'Print', arrival: 'before', vendor: 'Activity type: printing' },
    { id: 'ms-share', name: 'Send or share', arrival: 'before', vendor: 'Sent Teams message', details: ['destination'] },
    { id: 'ms-admin-change', name: 'Admin policy change', arrival: 'before', vendor: 'conditionalAccessPolicies/*' },
  ],
  google: [
    { id: 'gw-download', name: 'Drive download, print or copy', arrival: 'before', vendor: 'DLP: Disable download, print, and copy', details: ['label'] },
    { id: 'gw-external-share', name: 'External Drive share', arrival: 'before', details: ['destination'] },
    { id: 'gw-takeout', name: 'Takeout started', arrival: 'after', vendor: 'Customer takeout initiated' },
    { id: 'gw-admin-granted', name: 'Admin role granted', arrival: 'after', vendor: 'User granted Admin privilege' },
    { id: 'gw-leaked-password', name: 'Leaked password', arrival: 'after', vendor: 'Leaked password' },
  ],
  slack: [
    { id: 'sl-download', name: 'File download', arrival: 'after', vendor: 'file_downloaded', details: ['volume'] },
    { id: 'sl-public-link', name: 'Public file link', arrival: 'after', vendor: 'file_public_link_created' },
    { id: 'sl-external-invite', name: 'External invite', arrival: 'after', vendor: 'external_shared_channel_invite_created', details: ['destination'] },
    { id: 'sl-export', name: 'Workspace export', arrival: 'after', vendor: 'manual_export_started' },
    { id: 'sl-anomaly', name: 'Unusual activity', arrival: 'after', vendor: 'anomaly' },
  ],
  github: [
    { id: 'gh-token', name: 'Token or SSH key created', arrival: 'before', vendor: 'personal_access_token.request_created' },
    { id: 'gh-public', name: 'Repository made public', arrival: 'after', vendor: 'repo.access' },
    { id: 'gh-download', name: 'ZIP download or clone', arrival: 'after', vendor: 'repo.download_zip', details: ['volume'] },
    { id: 'gh-admin', name: 'Admin added', arrival: 'after', vendor: 'business.add_admin' },
    { id: 'gh-security-off', name: 'Security setting turned off', arrival: 'after', vendor: 'org.disable_two_factor_requirement' },
  ],
  aws: [
    { id: 'aws-terminate', name: 'Stop or terminate instances', arrival: 'before', vendor: 'TerminateInstances' },
    { id: 'aws-logging', name: 'Audit logging stopped', arrival: 'after', vendor: 'StopLogging' },
    { id: 'aws-public-bucket', name: 'Bucket made public', arrival: 'after', vendor: 'PutBucketPolicy' },
    { id: 'aws-admin-policy', name: 'Admin policy attached', arrival: 'after', vendor: 'AttachUserPolicy' },
    { id: 'aws-access-key', name: 'Access key created', arrival: 'after', vendor: 'CreateAccessKey' },
  ],
  workday: [
    { id: 'wd-bank', name: 'Change bank details', arrival: 'before', details: ['amount'] },
    { id: 'wd-tax', name: 'View tax forms', arrival: 'before' },
    { id: 'wd-compensation', name: 'Change compensation', arrival: 'before', details: ['amount'] },
    { id: 'wd-security-group', name: 'Assign security group', arrival: 'before' },
    { id: 'wd-export', name: 'Export worker data', arrival: 'before', details: ['records'] },
  ],
  box: [
    { id: 'bx-download', name: 'Download', arrival: 'after', vendor: 'DOWNLOAD', details: ['label', 'volume'] },
    { id: 'bx-share', name: 'Shared link', arrival: 'after', vendor: 'SHARE', details: ['destination'] },
    { id: 'bx-collaborator', name: 'External collaborator invited', arrival: 'after', vendor: 'COLLABORATION_INVITE', details: ['destination'] },
    { id: 'bx-delete', name: 'Delete', arrival: 'after', vendor: 'DELETE' },
    { id: 'bx-admin', name: 'Admin role changed', arrival: 'after', vendor: 'CHANGE_ADMIN_ROLE' },
  ],
}

/* The registry id an application resolves to, its numbered copies and aliases
   included ("salesforce-2", "outlook" → m365, "google-workspace" → google). */
export function eventCatalogKey(appId: string): string {
  const base = appId.replace(/-\d+$/, '')
  return LOGO_SOURCES.find((s) => s.id === base || s.aliases?.includes(base))?.id ?? base
}

/** An application's events: its own in-app events first, then the session events every app has. */
export function eventsFor(appId: string): SessionEvent[] {
  return [...(APP_EVENTS[eventCatalogKey(appId)] ?? []), ...SESSION_EVENTS]
}

export const eventById = (appId: string, eventId: string): SessionEvent | undefined => eventsFor(appId).find((e) => e.id === eventId)

/* The actions an event can take. One reported after it happened cannot be
   refused: Deny is left out of its menu, not shown greyed (research §7). */
export function actionsFor(e: Pick<SessionEvent, 'arrival'>): PostAction[] {
  return POST_ACTIONS.map((a) => a.value).filter((a) => !(a === 'deny' && e.arrival === 'after'))
}

// --- Conditions -------------------------------------------------------------------------

/* The conditions only a post sign-in policy asks, added to the board's own
   catalogue (CONDITION_CATALOGUE, `phase: 'post'`) so its If offers them on
   this type. The ones both types share — Network zone, Device profile,
   External hook, the time and the day, user attributes — are the catalogue's
   own entries, and Who is the board's Who. Ids are the catalogue typeIds. */

export type PostConditionGroup = 'Session' | 'Device' | 'Network' | 'Risk' | 'User' | 'Event' | 'Time'

export interface PostConditionDef {
  id: string
  label: string
  group: PostConditionGroup
  /** How the value is asked. */
  input: 'number' | 'choice' | 'multi' | 'zone' | 'groups' | 'hours' | 'days'
  /** For a number: what it counts. */
  unit?: string
  options?: string[]
  /** Only for events that carry this detail. */
  detail?: EventDetail
}

export const POST_CONDITIONS: PostConditionDef[] = [
  { id: 'session-age', label: 'Session age', group: 'Session', input: 'number', unit: 'hours' },
  { id: 'idle-time', label: 'Idle time', group: 'Session', input: 'number', unit: 'minutes' },
  { id: 'mfa-age', label: 'Time since last second factor', group: 'Session', input: 'number', unit: 'minutes' },
  { id: 'device-compliance', label: 'Device compliance', group: 'Device', input: 'choice', options: ['Compliant', 'Not compliant'] },
  { id: 'device-managed', label: 'Device', group: 'Device', input: 'choice', options: ['Managed', 'Not managed'] },
  { id: 'device-changed', label: 'Device changed in the session', group: 'Device', input: 'choice', options: ['Yes', 'No'] },
  { id: 'ip-changed', label: 'IP changed in the session', group: 'Network', input: 'choice', options: ['Any new IP', 'New IP outside the zones'] },
  { id: 'impossible-travel', label: 'Impossible travel', group: 'Network', input: 'choice', options: ['Yes', 'No'] },
  { id: 'anonymous', label: 'Anonymous network', group: 'Network', input: 'multi', options: ['Tor', 'VPN', 'Proxy', 'Data centre'] },
  { id: 'user-risk', label: 'User risk', group: 'Risk', input: 'choice', options: ['Low', 'Medium', 'High'] },
  { id: 'risk-detection', label: 'Risk detection', group: 'Risk', input: 'multi', options: ['Breached credential', 'Brute force', 'Suspicious app access'] },
  { id: 'records', label: 'Record count', group: 'Event', input: 'number', unit: 'records', detail: 'records' },
  { id: 'label', label: 'File label', group: 'Event', input: 'multi', options: ['Public', 'Internal', 'Confidential', 'Restricted'], detail: 'label' },
  { id: 'destination', label: 'Destination', group: 'Event', input: 'choice', options: ['External', 'Internal'], detail: 'destination' },
  { id: 'amount', label: 'Amount', group: 'Event', input: 'number', unit: 'USD', detail: 'amount' },
  { id: 'volume', label: 'Volume', group: 'Event', input: 'number', unit: 'in 10 minutes', detail: 'volume' },
]

/** The conditions offered on an event: every condition without a detail, plus the ones its details allow. */
export function conditionsFor(e: Pick<SessionEvent, 'details'>): PostConditionDef[] {
  return POST_CONDITIONS.filter((c) => !c.detail || (e.details ?? []).includes(c.detail))
}

// --- The policy ----------------------------------------------------------------------------

/* An application linked to a policy, and which of its events the policy
   decides. Linked from OUTSIDE the policy — the application's own page — and
   always with its events (owner, 13 Oct 2026: "the policy should be
   independent of the app; only multiple apps can be linked from outside along
   with their events"). Never an empty list: unlinking is removing the link. */
export interface PostLink {
  appId: string
  eventIds: string[]
}

/* What a post sign-in policy holds beyond a sign-in policy's fields: only its
   links. Its RULES are the board's own (owner, 13 Oct 2026: "use the same
   sign-in builder for post sign-in as well") — `Policy.rules`, Who / If /
   Then, with `Rule.action` as the Then — and its "Nothing else matched" row
   is `Policy.fallback`, whose `action` is what happens when no rule matched. */
export interface PostSetup {
  links: PostLink[]
}

export const isPostSignIn = (p: Pick<Policy, 'type'>): boolean => p.type === 'Session'

export const POLICY_TYPE_LABEL = { signIn: 'Sign-in policy', postSignIn: 'Post sign-in policy' } as const

/* A new post sign-in policy: an Untitled draft with no rules, linked to
   whatever the caller links it to (an application page's Create new policy),
   else to nothing (23 Sep 2026: no dialog). Its "Nothing else matched" row has
   no action yet: the admin chooses it. `decision` stays the model's default
   and is never read on this type. */
export function blankPostSignInPolicy(name: string, links: PostLink[] = []): Policy {
  return {
    id: `ps${Date.now()}`,
    name,
    type: 'Session',
    appIds: links.map((l) => l.appId),
    status: 'draft',
    lastModified: 'Just now',
    modifiedBy: 'You',
    audience: EVERYONE,
    fallback: fallbackRule('1fa'),
    rules: [],
    session: { links },
  }
}

export const setupOf = (p: Pick<Policy, 'session'>): PostSetup => ({ links: p.session?.links ?? [] })

// --- Completeness -------------------------------------------------------------------------

/* Why it cannot be turned on yet, or null: every rule has an action, and so has
   "Nothing else matched". Said in the builder under the rule it is about,
   never as a disabled button (26 Sep 2026). Being linked to no application
   does not stop it: the policy is independent of them. Disabled rules are not
   asked about: they decide nothing. */
export function turnOnIssue(p: Pick<Policy, 'rules' | 'fallback'>): string | null {
  const open = p.rules.findIndex((r) => r.enabled && !r.action)
  if (open >= 0) return `Choose an action for rule ${open + 1}.`
  if (!p.fallback?.action) return 'Choose an action for Nothing else matched.'
  return null
}

/* The store's two guards (store.tsx), here so they can be tested without it.
   It leaves draft only when complete: switching it on before that is refused,
   nothing changes, and the switch that asked says why (use-status-change.tsx). */
export const postSignInRefuses = (p: Policy, status: Policy['status']): boolean => status !== 'draft' && isPostSignIn(p) && turnOnIssue(p) !== null

/* And saved on with a rule left without an action, it is stored as a draft:
   unfinished means draft, never on and half set. */
export const settledPostSignIn = (p: Policy): Policy => (isPostSignIn(p) && p.status !== 'draft' && turnOnIssue(p) !== null ? { ...p, status: 'draft' } : p)

/** The actions the policy can take, its enabled rules and its last row together. */
export function actionsUsed(p: Pick<Policy, 'rules' | 'fallback'>): PostAction[] {
  const all = [...p.rules.filter((r) => r.enabled).map((r) => r.action), p.fallback?.action]
  return [...new Set(all.filter((a): a is PostAction => !!a))]
}

// --- Links ---------------------------------------------------------------------------------

export const linkOf = (p: Pick<Policy, 'session'>, appId: string): PostLink | undefined => setupOf(p).links.find((l) => l.appId === appId)

/* The policy linked to this application's events, in the catalogue's order —
   or unlinked from it when no event is left. `appIds` mirrors the links, so
   the Policies table's Applications column reads them as it reads a sign-in
   policy's. */
export function linkApp(p: Policy, appId: string, eventIds: readonly string[]): Policy {
  const order = eventsFor(appId).map((e) => e.id)
  const ids = order.filter((id) => eventIds.includes(id))
  const s = setupOf(p)
  const rest = s.links.filter((l) => l.appId !== appId)
  const had = s.links.some((l) => l.appId === appId)
  const links = ids.length === 0 ? rest : had ? s.links.map((l) => (l.appId === appId ? { appId, eventIds: ids } : l)) : [...s.links, { appId, eventIds: ids }]
  return { ...p, session: { links }, appIds: links.map((l) => l.appId) }
}

export const unlinkApp = (p: Policy, appId: string): Policy => linkApp(p, appId, [])

/** Every post sign-in policy linked to this application, with its events, in list order. */
export function linkedTo(appId: string, policies: readonly Policy[]): { policy: Policy; eventIds: string[] }[] {
  return policies.flatMap((policy) => {
    if (!isPostSignIn(policy)) return []
    const link = linkOf(policy, appId)
    return link ? [{ policy, eventIds: link.eventIds }] : []
  })
}

/* An event of an application is decided by one post sign-in policy at most:
   the events another policy already holds there, each with that policy. */
export function takenEvents(appId: string, policies: readonly Policy[], exceptPolicyId?: string): Map<string, Policy> {
  const out = new Map<string, Policy>()
  for (const { policy, eventIds } of linkedTo(appId, policies)) {
    if (policy.id === exceptPolicyId) continue
    for (const id of eventIds) out.set(id, policy)
  }
  return out
}

/* Linked events a policy's Deny cannot stop: ones the application reports
   after they happened. Said where the link is made, so the admin knows those
   events get the rest of the policy and not its Deny. */
export function denyCannotStop(p: Pick<Policy, 'rules' | 'fallback'>, appId: string, eventIds: readonly string[]): SessionEvent[] {
  if (!actionsUsed(p).includes('deny')) return []
  return eventsFor(appId).filter((e) => eventIds.includes(e.id) && e.arrival === 'after')
}
