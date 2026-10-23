import { setupChanges, setupOf, type AppSetup, type BasicField, type SetupChange, type SetupTab } from '../app-setup'
import type { App, Policy } from '../data'
import {
  SESSION_EVENTS,
  denyCannotStop,
  eventsFor,
  isPostSignIn,
  linkOf,
  setupOf as postSetupOf,
  type SessionEvent,
} from '../post-sign-in'
import { listNames } from '../rule-who'
import type { AppTab } from '../store'
import type { ProfileNote } from './profile-notes'

/* -----------------------------------------------------------------------------
   What the application page decides, apart from drawing it (ApplicationPage.tsx,
   spec docs/specs/APP-CREATE-AND-ACCESS.md §3.2 and §4).

   One page in two modes. `saved` is a stored application: Policies leads, and
   Basic, Advanced, Sign-in options and Attributes edit one draft that the save
   footer reviews. `new` is the application not stored yet, picked from the
   catalogue: the same tabs less Users and Groups — nobody can be reached
   through an application that does not exist — and the live console's own
   footer, Cancel · Back · Next · Save.

   Pure: the page reads its tabs, its draft's changes and the problems Basic
   still has from here, and the tests pin them without drawing anything.
   -------------------------------------------------------------------------- */

export type PageMode = 'saved' | 'new'

/* The live console's words, "Login Options" excepted (house rule: sign-in). */
export const TAB_LABEL: Record<AppTab, string> = {
  basic: 'Basic',
  advanced: 'Advanced',
  'sign-in': 'Sign-in options',
  attributes: 'Attributes',
  policies: 'Policies',
  'post-sign-in': 'Post sign-in',
  users: 'Users',
  groups: 'Groups',
  metadata: 'Metadata',
  endpoints: 'Endpoints',
}

/* The live order, with ours between: Policies after the setup tabs, as the
   live form has it, then the two the live Show Associated Entities page holds,
   and last what the service provider is given — Metadata for a SAML
   application, Endpoints for an OAuth one. Chosen by protocol, not by the
   application's type: Slack and Zoom are typed Desktop and sign in with SAML.

   Post sign-in follows Policies on a stored application only (spec
   POST-SIGN-IN-POLICIES.md §Screens 3): a link names the application by its
   id, and one not stored yet has none to name. */
export function appTabs(protocol: App['protocol'], mode: PageMode): AppTab[] {
  const saved: AppTab[] = mode === 'saved' ? ['post-sign-in', 'users', 'groups'] : []
  return ['basic', 'advanced', 'sign-in', 'attributes', 'policies', ...saved, protocol === 'OIDC' ? 'endpoints' : 'metadata']
}

/** The tab a route lands on: its own when this application has it, else Policies — the page's default. */
export const landingTab = (tab: AppTab | undefined, tabs: readonly AppTab[]): AppTab => (tab && tabs.includes(tab) ? tab : 'policies')

const SETUP_TABS: readonly AppTab[] = ['basic', 'advanced', 'sign-in', 'attributes']
/** A tab that edits the setup, as opposed to one that lists or shows. */
export const isSetupTab = (t: AppTab): t is SetupTab => SETUP_TABS.includes(t)

// --- The draft ---------------------------------------------------------------------------

/* What Basic, Advanced, Sign-in options and Attributes edit: one draft for the
   four, held by the page so it outlives a tab switch. The name is not in it —
   a stored application is renamed in the head, and saved at once. */
export interface AppDraft {
  description: string
  /** The client secret. Always empty on a SAML application, which signs with a certificate. */
  secret: string
  setup: AppSetup
}

/* As stored, through `setupOf`: a seed application has no setup of its own and
   is given a made-up one, so it opens clean against the same values. */
export const draftOf = (app: App): AppDraft => ({ description: app.description ?? '', secret: app.secret ?? '', setup: setupOf(app) })

/** One row of the save footer's review, filed under the tab it was changed on. */
export interface DraftChange {
  label: string
  before: string
  after: string
  group: string
}

/* Basic's fields in the form's order. `setupChanges` knows the setup's own;
   the description and the secret are the application's, and slot in among
   them. */
const BASIC_ORDER: Record<AppSetup['kind'], string[]> = {
  saml: ['SP entity ID or issuer', 'ACS URL', 'Audience URI', 'Single logout URL'],
  oidc: ['Redirect URL', 'Client ID', 'Client secret', 'Subject', 'Description'],
}
const TAB_ORDER: SetupTab[] = ['basic', 'advanced', 'sign-in', 'attributes']

const said = (s: string) => s.trim() || 'None'

/* Every field the draft changed, one row each, in the order the tabs and their
   forms ask them. The secret's value is never printed, here or anywhere: the
   row says that it changes. */
export function draftChanges(before: AppDraft, after: AppDraft): DraftChange[] {
  const own: SetupChange[] = [
    ...(after.secret !== before.secret ? [{ label: 'Client secret', before: 'Current secret', after: 'New secret', tab: 'basic' as const }] : []),
    ...(after.description.trim() !== before.description.trim()
      ? [{ label: 'Description', before: said(before.description), after: said(after.description), tab: 'basic' as const }]
      : []),
  ]
  const basic = BASIC_ORDER[after.setup.kind]
  const rank = (c: SetupChange) => (c.tab === 'basic' ? basic.indexOf(c.label) : -1)
  return [...setupChanges(before.setup, after.setup), ...own]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => TAB_ORDER.indexOf(a.c.tab) - TAB_ORDER.indexOf(b.c.tab) || rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => ({ label: c.label, before: c.before, after: c.after, group: TAB_LABEL[c.tab] }))
}

/** The application not stored yet: the draft, and the Display name its Basic asks for. */
export interface NewDraft extends AppDraft {
  name: string
}

/* Changed from what the page started with — the freed catalogue name, the
   live defaults, the client id and secret it made — so arriving and leaving
   again asks nothing (a page opens clean). */
export const newDraftChanged = (start: NewDraft, now: NewDraft): boolean =>
  now.name.trim() !== start.name.trim() || draftChanges(start, now).length > 0

// --- What Basic still needs ------------------------------------------------------------------

/* The form's order, so the first problem said is the first field on the page. */
const FIELD_ORDER: BasicField[] = ['name', 'entityId', 'acsUrl', 'audienceUri', 'sloUrl', 'redirectUrls', 'clientId', 'secret']

export type BasicIssues = Partial<Record<BasicField, string>>

/** The first problem in the form's order: what a blocked save footer and the leave dialog say. Null when Basic is complete. */
export function firstIssue(issues: BasicIssues): string | null {
  for (const f of FIELD_ORDER) if (issues[f]) return issues[f]
  return null
}

/* Which problems are said under their fields. A wrong answer as soon as there
   is one — an http ACS URL, a name in use. A missing one only once Save has
   been pressed: an empty required field on a form nobody has submitted yet is
   not an error (method-forms.css), and the asterisk already says it. */
export function shownIssues(issues: BasicIssues, draft: NewDraft | (AppDraft & { name?: string }), tried: boolean): BasicIssues {
  const s = draft.setup
  const filled: Record<BasicField, boolean> = {
    name: (draft.name ?? '').trim() !== '',
    entityId: s.kind === 'saml' && s.entityId.trim() !== '',
    acsUrl: s.kind === 'saml' && s.acsUrl.trim() !== '',
    audienceUri: s.kind === 'saml' && s.audienceUri.trim() !== '',
    sloUrl: s.kind === 'saml' && s.sloUrl.trim() !== '',
    redirectUrls: s.kind === 'oidc' && s.redirectUrls.some((u) => u.trim() !== ''),
    clientId: s.kind === 'oidc' && s.clientId.trim() !== '',
    secret: draft.secret.trim() !== '',
  }
  const out: BasicIssues = {}
  for (const f of FIELD_ORDER) if (issues[f] && (tried || filled[f])) out[f] = issues[f]
  return out
}

// --- Post sign-in (spec POST-SIGN-IN-POLICIES.md §Screens 3) ----------------------------------

/* The tab lists the post sign-in policies linked to this application, and
   Link policy links another: pick the policy, then tick the events of this
   application it decides. The writes are the model's (post-sign-in.ts
   `linkApp`, `unlinkApp`); what the tab and its slider say is here. The
   policy's rules are the board's, never read here but for whether it can Deny. */

/** A linked policy's events here, by name, in the catalogue's order. An id the catalogue no longer has is left out. */
export const eventNames = (appId: string, eventIds: readonly string[]): string[] =>
  eventsFor(appId)
    .filter((e) => eventIds.includes(e.id))
    .map((e) => e.name)

/* A policy Link policy's first page offers: a post sign-in policy not linked
   here yet — a linked one has its events edited from its own row — with where
   else it applies, said once. */
export interface LinkChoice {
  policy: Policy
  /** "Linked to 2 applications", or "Not linked". */
  meta: string
}

export function linkChoices(appId: string, policies: readonly Policy[]): LinkChoice[] {
  return policies
    .filter((p) => isPostSignIn(p) && !linkOf(p, appId))
    .map((policy) => {
      const n = postSetupOf(policy).links.length
      return { policy, meta: n === 0 ? 'Not linked' : `Linked to ${n} ${n === 1 ? 'application' : 'applications'}` }
    })
}

/* This application's events as the second page lists them: its own first,
   under its name, then the session events every application has. One the
   catalogue has no events of its own for gets the second group alone. */
export interface EventGroup {
  title: string
  events: SessionEvent[]
}

export function eventGroups(appId: string, appName: string): EventGroup[] {
  const session = new Set(SESSION_EVENTS.map((e) => e.id))
  const all = eventsFor(appId)
  const own = all.filter((e) => !session.has(e.id))
  return [...(own.length > 0 ? [{ title: `${appName} events`, events: own }] : []), { title: 'Session events', events: all.filter((e) => session.has(e.id)) }]
}

/* Why Link cannot go ahead: said under the list once it was pressed, never as
   a disabled button (26 Sep 2026). Unlinking is the row menu's Unlink, not
   Link with nothing ticked. */
export const linkIssue = (ticked: readonly string[]): string | null => (ticked.length === 0 ? 'Choose at least one event.' : null)

/* The one line said where the link is made when the policy can Deny — one of
   its enabled rules, or its "Nothing else matched", has Deny as its Then — and
   an event ticked here is reported after it happened (post-sign-in.ts
   `denyCannotStop`). Null when there is nothing to say. */
export function denyNotice(policy: Pick<Policy, 'rules' | 'fallback'>, appId: string, ticked: readonly string[]): string | null {
  const names = denyCannotStop(policy, appId, ticked).map((e) => e.name)
  return names.length > 0 ? `Deny can't stop events reported after: ${listNames(names, Infinity)}.` : null
}

/* The unlink confirmation's one line: what the policy stops deciding here.
   What happens to the policy itself is the store's, and the toast after the
   write says it when its status moved. */
export const unlinkCopy = (policyName: string, appId: string, appName: string, eventIds: readonly string[]): string =>
  `${policyName} stops deciding ${unlinkEvents(appId, eventIds)} on ${appName}.`

/* The events in that line, alone: the dialog draws the policy in bold and the application with its logo around them
   (AppPostSignIn.tsx, 23 Oct 2026), and says them in these words. */
export const unlinkEvents = (appId: string, eventIds: readonly string[]): string => listNames(eventNames(appId, eventIds), 2) || 'its events'

// --- The side panel ----------------------------------------------------------------------

/* Beside an OAuth application's Basic, the one form whose fields need a word
   about what they are: the pair the application signs in with. Fixed copy, in
   profile-notes.ts's shape (side panels never read the draft), and the same in
   both modes. A SAML application signs with a certificate and its Basic has
   nothing to explain, so it gets no panel; neither do the other tabs. It
   replaces profile-notes.ts's APP_BASIC_NOTE, which named the secret "App
   secret". Engineering to confirm the wording. */
export const CLIENT_NOTE: ProfileNote = {
  title: 'Client ID and secret',
  terms: [
    { term: 'Client ID', note: 'Names this application to the identity provider. Paste it into the application.' },
    {
      term: 'Client secret',
      note: 'Proves the request comes from this application. A regenerated secret replaces the old one when you save.',
    },
  ],
}
