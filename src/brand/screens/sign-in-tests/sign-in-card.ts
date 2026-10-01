import { TENANT_TZ } from '../sign-in-facts'
import type { RowsRead } from '../testing/rows-read'
import { personOptions, type FieldOption } from '../testing/sign-in-fields'
import { factsOf, originPatch, type FormField, type FormIssue, type SignInForm } from '../testing/sign-in-form'
import { sentenceTokens, tokenOfField, type TokenId } from '../testing/sign-in-sentence'
import { memberGroupIds, type Audience, type Group, type User, type Zone } from '../../data'
import type { AskedField } from './engine-run'

/* -----------------------------------------------------------------------------
   The sign-in on the Sign-in tests page (TESTING-V4 §12, §14): the page's
   state, and the few rules for what the panel asks and starts from. Pure;
   TryPanel.tsx draws the panel (the builder's Inspector, holding the form),
   TryJourney.tsx the canvas beside it.

   The panel opens empty: Person and Application, and nothing else until an
   application is chosen. Then only the facts some rule on that application
   reads are asked (rows-read.ts), each already filled in with an answer that
   lets Run work at once — the office network, a registered corporate
   Windows 11 laptop, now, a low risk score. A fact set to Not stated on
   purpose stays so: the page remembers which were touched, and a default is
   only ever put into one that was not.
   -------------------------------------------------------------------------- */

/** The DOM id prefix of the panel's rows: a row's control is `tokenDomId(PANEL_ID, token)`. */
export const PANEL_ID = 'sit-panel'

/** How the page's right-hand panels slide in and out — the form, the saved sign-ins, the why, the break-in attempts (motion's transition). */
export const PANEL_SLIDE = { duration: 0.22, ease: [0.2, 0, 0, 1] as const }

/** The form field each asked field states, for its error and for Add. */
export const ASKED_FORM_FIELD: Record<AskedField, FormField> = { from: 'address', place: 'place', device: 'device', when: 'when', risk: 'risk' }

/** The asked field a form field is stated in, for an error or Add: the other way round. */
export const ASKED_OF: Partial<Record<FormField, AskedField>> = { address: 'from', place: 'place', device: 'device', when: 'when', risk: 'risk' }

/** Where the page is, kept by SignInTests.tsx so the panel and the canvas read one state. */
export interface TryPage {
  /** 'form': nothing run yet in this visit — the canvas explains itself. 'journey': the run, playing or settled. */
  mode: 'form' | 'journey'
  /** The testing session's run the canvas has played (or begun to); a newer one is waiting to play. */
  played: number
  /** How the waiting run begins. The panel is the form, so the page's runs begin with the engine ('none'). */
  intro: 'fill' | 'collapse' | 'none'
  /** A run started by editing the sign-in plays quicker. */
  pace: 'full' | 'edit'
  /** The waiting run is a Replay: said so as it starts. */
  replay: boolean
  /** What the panel holds. */
  draft: SignInForm
  /** Fields set by hand: a default never overwrites one. */
  touched: readonly FormField[]
  /** The sign-in the last run was of, for "Changed by …" on an edited re-run. */
  prev: SignInForm | null
  /** New sign-in: open Save sign-in once THIS run lands — the session's run id it will have — and no other. */
  askSaveFor: number | null
}

/** The time now where the tenant is, as a time input writes it: "09:30". */
export function nowIn(timeZone: string = TENANT_TZ, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '09'
  const m = parts.find((p) => p.type === 'minute')?.value ?? '30'
  return `${h}:${m}`
}

/* The panel as a visit opens it: nobody and no application, and every other
   fact at its default, so whichever tokens the chosen application asks for
   arrive filled. */
export function emptyDraft(today: string, time: string): SignInForm {
  return {
    personId: null,
    appId: null,
    ...originPatch('office'),
    place: { kind: 'from-address' },
    date: today,
    time,
    timeZone: TENANT_TZ,
    device: { kind: 'preset', id: 'win11-registered' },
    risk: '12',
    assumeOn: null,
  }
}

/* A run already played in this session: the page was left and come back to,
   and shows where it was — the run settled, and the panel holding its sign-in. */
export function initialTryPage(runId: number, today: string, time: string, form?: SignInForm): TryPage {
  const back = runId > 1
  return {
    mode: back ? 'journey' : 'form',
    played: runId,
    intro: 'none',
    pace: 'full',
    replay: false,
    draft: back && form ? form : emptyDraft(today, time),
    touched: [],
    prev: null,
    askSaveFor: null,
  }
}

/* Every road into a run from elsewhere — a saved sign-in, a People row, a
   run's row — is a RUN: the panel filled with it, the engine at full pace. The
   page pairs this with the testing session's `load`, which bumps the run the
   canvas then plays. */
export function tryingPage(p: TryPage, form: SignInForm): TryPage {
  return { ...p, mode: 'journey', intro: 'none', pace: 'full', replay: false, draft: form, touched: [], prev: null, askSaveFor: null }
}

/* New sign-in (the Saved table's primary, locked off with the table): the panel
   empty, nothing waiting to play, and Save sign-in opening once its run
   lands — naming it is what was asked for. The ask is for the NEXT run only
   (the session's `load` bumps `runId` by one). */
export function newSignInPage(p: TryPage, runId: number, today: string, time: string): TryPage {
  return { ...p, mode: 'form', played: runId, replay: false, draft: emptyDraft(today, time), touched: [], prev: null, askSaveFor: runId + 1 }
}

/* A People row's Try: the People tab's own sentence — the one every cell on
   that tab was judged by — with that person and application, less the facts
   no rule on the application reads. Not the last Try's sign-in: a cell that
   said Deny on a Windows 10 laptop must not open a run on Windows 11 that
   says Allow. No defaults are put in: a fact the People sentence leaves Not
   stated on purpose is what the cell was judged without. */
export function peopleTryForm(context: SignInForm, personId: string, appId: string | null, rows: RowsRead): SignInForm {
  return forRun({ ...context, personId, appId }, rows)
}

/** The fields past Person and Application the rules read, in the sentence's order. From is always asked. */
export function askedFields(rows: RowsRead): AskedField[] {
  const out: AskedField[] = ['from']
  if (rows.rows.has('place')) out.push('place')
  if (rows.rows.has('device')) out.push('device')
  if (rows.rows.has('when')) out.push('when')
  if (rows.rows.has('risk')) out.push('risk')
  return out
}

/* Defaults, put only into a field that is asked, empty, and was not emptied
   by hand. */
export function withDefaults(form: SignInForm, rows: RowsRead, touched: readonly FormField[], today: string, time: string): SignInForm {
  const next = { ...form }
  const free = (f: FormField) => !touched.includes(f)
  if (!next.address.trim() && free('address')) Object.assign(next, originPatch('office'))
  if (rows.rows.has('device') && next.device.kind === 'none' && free('device')) next.device = { kind: 'preset', id: 'win11-registered' }
  if (rows.rows.has('when') && !next.time && free('when')) Object.assign(next, { date: next.date || today, time })
  if (rows.rows.has('risk') && !next.risk.trim() && free('risk')) next.risk = '12'
  return next
}

/* The sign-in a run is of: the panel's, less the facts no rule on the
   application reads. A device on an HRMS sign-in changes nothing, and saved
   with it, a saved sign-in would say it. The time stays: every saved sign-in
   in the showcase states one, and it costs the answer nothing. */
export function forRun(form: SignInForm, rows: RowsRead): SignInForm {
  return {
    ...form,
    device: rows.rows.has('device') ? form.device : { kind: 'none' },
    risk: rows.rows.has('risk') ? form.risk : '',
    place: rows.rows.has('place') || rows.rows.has('distance') ? form.place : { kind: 'from-address' },
    assumeOn: null,
  }
}

const CHOOSE_PERSON = 'Choose a person'
const CHOOSE_APP = 'Choose an application'

/* What stops a run, said under its row in the panel: a person and an
   application, and anything the facts themselves object to (an address that
   is not one, a risk score out of range) — only the asked fields', since the
   others are dropped. */
export function cardIssues(form: SignInForm, rows: RowsRead, zones: readonly Zone[]): FormIssue[] {
  const out: FormIssue[] = []
  if (!form.personId) out.push({ field: 'person', message: CHOOSE_PERSON })
  if (!form.appId) out.push({ field: 'app', message: CHOOSE_APP })
  const asked = forRun(form, rows)
  for (const i of factsOf(asked, zones).issues) out.push(i)
  return out
}

/** The row an issue sits on: where Run with something missing takes the focus. */
export function issueToken(issues: readonly FormIssue[]): TokenId | null {
  for (const i of issues) {
    const t = tokenOfField(i.field)
    if (t) return t
  }
  return null
}

/* "Where and on what" (§14.2): nothing until an application is chosen; then
   only the facts its rules read, in the sentence's order — From always, the
   device, the time and the risk score where a rule reads them. */
export function factTokens(form: Pick<SignInForm, 'appId'>, rows: RowsRead): TokenId[] {
  if (!form.appId) return []
  return sentenceTokens(rows).filter((t) => t !== 'person' && t !== 'app')
}

// --- The Person picker (§13.3) -------------------------------------------------------

/** A group's option value in the Person picker: "group:finance". */
export const GROUP_PREFIX = 'group:'

export const PEOPLE_HEADING = 'People'
export const GROUPS_HEADING = 'Groups'

/** Every group a person is in, by name, in their order: "Engineering, Finance". */
export function groupNamesOf(u: Pick<User, 'groupId' | 'alsoGroupIds'>, groups: readonly Pick<Group, 'id' | 'name'>[]): string[] {
  return memberGroupIds(u).map((id) => groups.find((g) => g.id === id)?.name ?? id)
}

/* The member a group stands for: someone in just that group, so a test of
   "Anyone in Finance" is a test of Finance alone and never picks up a rule
   through a second group; else its first member; null for an empty group. */
export function memberOf(users: readonly User[], groupId: string): User | null {
  const members = users.filter((u) => memberGroupIds(u).includes(groupId))
  return members.find((u) => memberGroupIds(u).length === 1) ?? members[0] ?? null
}

/* The Person picker's options: real people with every group they are in on
   the second line ("Maya Iyer · Engineering, Finance"), then the groups that
   have somebody in them ("Anyone in Finance").

   Inside a policy (the builder's Check access) the people come in two
   headings, the policy's own first — In this policy, then Not in this
   policy — as the board's sentence listed them (sign-in-fields.ts
   `personOptions`). */
export function personPickerOptions(users: readonly User[], groups: readonly Group[], audience: Audience | null = null): FieldOption[] {
  const people = audience ? personOptions(users, groups, audience) : users.map((u) => ({ value: u.id, label: u.name, meta: groupNamesOf(u, groups).join(', '), group: PEOPLE_HEADING }))
  const withMembers = groups.filter((g) => memberOf(users, g.id))
  return [...people, ...withMembers.map((g) => ({ value: `${GROUP_PREFIX}${g.id}`, label: `Anyone in ${g.name}`, group: GROUPS_HEADING }))]
}

/** What a pick in the Person picker states: that person, or the member a group stands for, and the group. */
export function personPick(value: string, users: readonly User[]): { personId: string | null; asGroup: string | null } {
  if (!value.startsWith(GROUP_PREFIX)) return { personId: value, asGroup: null }
  const groupId = value.slice(GROUP_PREFIX.length)
  return { personId: memberOf(users, groupId)?.id ?? null, asGroup: groupId }
}

/* What each fact row's TipDot says reads it (engine-run.ts `readersOf`):
   From holds the place too, so it names the network's readers, else the
   place's. Person and Application have none — every policy reads them. */
export function tokenTips(readers: Record<AskedField, string>): Partial<Record<TokenId, string>> {
  const out: Partial<Record<TokenId, string>> = {}
  const from = readers.from || readers.place
  if (from) out.from = from
  if (readers.device) out.device = readers.device
  if (readers.when) out.when = readers.when
  if (readers.risk) out.risk = readers.risk
  return out
}
