import { TENANT_TZ } from '../sign-in-facts'
import type { RowsRead } from '../testing/rows-read'
import { factsOf, originPatch, type FormField, type FormIssue, type SignInForm } from '../testing/sign-in-form'
import type { Zone } from '../../data'
import type { AskedField } from './engine-run'

/* -----------------------------------------------------------------------------
   The Sign-in card on the Try tab (TESTING-V4 §8.1–8.2): the page's state, and
   the few rules for what the card asks and starts from. Pure; SignInCard.tsx
   draws the card and TryJourney.tsx the canvas it sits on.

   Stage 0 is the card alone in the empty canvas: Person and Application, and
   nothing else until an application is chosen. Then only the facts some rule
   on that application reads are asked (rows-read.ts), each already filled in
   with an answer that lets Run work at once — the office network, a registered
   corporate Windows 11 laptop, now, a low risk score. A field set to Not stated
   on purpose stays so: the card remembers which fields were touched, and a
   default is only ever put into one that was not.
   -------------------------------------------------------------------------- */

/** Where the Try tab is, kept by the page (SignInTests.tsx) so a tab switch and back finds it as it was. */
export interface TryPage {
  /** 'form': the card alone in the canvas (Stage 0). 'journey': the run, playing or settled. */
  mode: 'form' | 'journey'
  /** The testing session's run the canvas has played (or begun to); a newer one is waiting to play. */
  played: number
  /** How the waiting run begins: the card filled first, the card collapsing, or neither (Replay). */
  intro: 'fill' | 'collapse' | 'none'
  /** A run started by editing the sign-in plays quicker. */
  pace: 'full' | 'edit'
  /** What the card holds while it is open. */
  draft: SignInForm
  /** Fields set by hand: a default never overwrites one. */
  touched: readonly FormField[]
  /** The sign-in the last run was of, for "Changed by …" on an edited re-run. */
  prev: SignInForm | null
  /** New sign-in: open Save sign-in once the run lands. */
  askSave: boolean
}

/** The time now where the tenant is, as a time input writes it: "09:30". */
export function nowIn(timeZone: string = TENANT_TZ, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '09'
  const m = parts.find((p) => p.type === 'minute')?.value ?? '30'
  return `${h}:${m}`
}

/* The card as Stage 0 opens it: nobody and no application, and every other
   fact at its default, so whichever fields the chosen application asks for
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

export function initialTryPage(runId: number, today: string, time: string): TryPage {
  return {
    /* A run already played in this session: the page was left and come back to, and shows where it was. */
    mode: runId > 1 ? 'journey' : 'form',
    played: runId,
    intro: 'collapse',
    pace: 'full',
    draft: emptyDraft(today, time),
    touched: [],
    prev: null,
    askSave: false,
  }
}

/** The fields past Person and Application the card asks, in its order. From is always asked. */
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

/* The sign-in a run is of: the card's, less the facts no rule on the
   application reads. A device on an HRMS sign-in changes nothing, and saved
   with it, the Saved sign-ins table would say it. The time stays: every
   saved sign-in in the showcase states one, and it costs the answer nothing. */
export function forRun(form: SignInForm, rows: RowsRead): SignInForm {
  return {
    ...form,
    device: rows.rows.has('device') ? form.device : { kind: 'none' },
    risk: rows.rows.has('risk') ? form.risk : '',
    place: rows.rows.has('place') || rows.rows.has('distance') ? form.place : { kind: 'from-address' },
    assumeOn: null,
  }
}

export const CHOOSE_PERSON = 'Choose a person'
export const CHOOSE_APP = 'Choose an application'

/* What stops a run, said under its field: a person and an application, and
   anything the facts themselves object to (an address that is not one, a risk
   score out of range) — only the asked fields', since the others are dropped. */
export function cardIssues(form: SignInForm, rows: RowsRead, zones: readonly Zone[]): FormIssue[] {
  const out: FormIssue[] = []
  if (!form.personId) out.push({ field: 'person', message: CHOOSE_PERSON })
  if (!form.appId) out.push({ field: 'app', message: CHOOSE_APP })
  const asked = forRun(form, rows)
  for (const i of factsOf(asked, zones).issues) out.push(i)
  return out
}
