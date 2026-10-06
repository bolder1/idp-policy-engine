import type { AccessDecision, Zone } from '../../../../data'
import { DECISION_WORDS } from '../../../../decision-words'
import { PLACES } from '../../../../places'
import { TENANT_TZ } from '../../../sign-in-facts'
import { devicePreset } from '../../../testing/device-presets'
import type { RowsRead } from '../../../testing/rows-read'
import { CUSTOM_DEVICE, deviceFactsOf } from '../../../testing/sign-in-fields'
import { distancePlace, ORIGIN_PRESETS, type FormField, type SignInForm } from '../../../testing/sign-in-form'
import { weekdayOf } from '../../../testing/sign-in-sentence'
import type { EngineRun } from '../../engine-run'
import { wordsOfPlan } from '../assistant/what-if'
import type { RunIdentity } from '../types'

/* -----------------------------------------------------------------------------
   The sign-in row's words (SignInRow.tsx), PURE: which facts the row shows,
   in form order, and the one state tag. Apart from the component so the words
   are pinned without drawing them (sign-in-row.test.ts), and the .tsx exports
   components only.

     rowFacts(form, rows, ctx) → RowFact[]
       network, place, when, device, risk, assume-on — each STATED fact with
       its value; each fact the application's rules READ but not stated as an
       Add ("+ Device"); a fact neither stated nor read is left out. The
       network is always read (rows-read.ts: every policy reads where from);
       a place only shows when stated apart from the network.
     rowState(p) → RowState | null
       at most one: "Not run" (the form has changes not run), else "Changed
       by device", else "Expected Allow with 2FA" (met: ✓, missed: ✕, null
       while the run plays).
     identityChips(identities, landed) → IdentityChip[] | null
       a Run of several identities (owner, 5 Oct 2026: "one run each,
       switch"): a chip each, in pick order — its name, the name it folds to,
       and, once the run on screen has landed, that identity's own answer.
       Null for one identity: the row is the Who → App it always was.
   -------------------------------------------------------------------------- */

export type RowFactIcon = 'network' | 'place' | 'time' | 'laptop' | 'phone' | 'risk' | 'assume'

export interface RowFact {
  field: FormField
  /** "Network", "Place", "Time", "Device", "Risk score", "Assumed on": what it is, for "+ Device" and "Change the device". */
  label: string
  /** The value said: "Office network", "Mon 09:30", "Windows 11 laptop · registered", "Risk 55". '' when not stated. */
  value: string
  stated: boolean
  icon: RowFactIcon
}

export interface RowFactsContext {
  zones: readonly Zone[]
  /** The policy Assume on names, by id: "Code review for Finance". */
  policyName?: (id: string) => string | undefined
}

const zoneCity = (tz: string): string => (tz.split('/').pop() ?? tz).replace(/_/g, ' ')

/* A place stated apart from the network (the catalogue's, the ruler's, a carried one); null when it follows the address. */
function statedPlace(form: SignInForm, zones: readonly Zone[]): string | null {
  const p = form.place
  if (p.kind === 'stated') return PLACES.find((x) => x.id === p.placeId)?.name ?? 'Stated place'
  if (p.kind === 'distance') return distancePlace(zones, p.zoneId, p.rangeIndex, p.km)?.city ?? `${p.km} km`
  if (p.kind === 'custom') return p.facts.city ?? p.facts.state ?? p.facts.country ?? 'Stated place'
  return null
}

export function rowFacts(form: SignInForm, rows: RowsRead, ctx: RowFactsContext): RowFact[] {
  const out: RowFact[] = []
  const say = (field: FormField, label: string, value: string, icon: RowFactIcon) => out.push({ field, label, value, stated: value !== '', icon })

  /* Where from: always read. */
  const origin = ORIGIN_PRESETS.find((o) => o.id === form.origin)
  say('address', 'Network', origin ? origin.label : form.address.trim(), 'network')

  if (rows.rows.has('place') || rows.rows.has('distance')) {
    const place = statedPlace(form, ctx.zones)
    if (place) say('place', 'Place', place, 'place')
  }

  if (rows.rows.has('when')) {
    const day = form.date ? weekdayOf(form.date) : null
    const tz = form.timeZone && form.timeZone !== TENANT_TZ ? zoneCity(form.timeZone) : null
    say('when', 'Time', form.time ? [[day, form.time].filter(Boolean).join(' '), tz].filter(Boolean).join(' · ') : '', 'time')
  }

  if (rows.rows.has('device')) {
    const d = form.device
    if (d.kind === 'none') say('device', 'Device', '', 'laptop')
    else {
      const platform = d.kind === 'preset' ? devicePreset(d.id).platform : deviceFactsOf(d).platform
      say('device', 'Device', d.kind === 'preset' ? devicePreset(d.id).label : CUSTOM_DEVICE, platform === 'android' || platform === 'ios' ? 'phone' : 'laptop')
    }
  }

  if (rows.rows.has('risk')) say('risk', 'Risk score', form.risk.trim() ? `Risk ${form.risk.trim()}` : '', 'risk')

  if (form.assumeOn) say('assume-on', 'Assumed on', `Assumed on: ${ctx.policyName?.(form.assumeOn) ?? 'a policy'}`, 'assume')

  return out
}

export type RowState = { kind: 'unrun'; words: string } | { kind: 'changed'; words: string } | { kind: 'expected'; words: string; met: boolean | null }

/** The one state tag, or null. */
export function rowState(p: { plan: EngineRun; running: boolean; unrun?: boolean; changed: string | null; expected: AccessDecision | null }): RowState | null {
  if (p.unrun) return { kind: 'unrun', words: 'Not run' }
  if (p.changed) return { kind: 'changed', words: `Changed by ${p.changed}` }
  if (p.expected) {
    const o = p.plan.outcome
    const met = p.running ? null : o.status === 'decided' && o.decision === p.expected
    return { kind: 'expected', words: `Expected ${DECISION_WORDS[p.expected]}`, met }
  }
  return null
}

/** "Edit sign-in: Maya Iyer on AWS Console": the Who → App button's name. */
export const whoLabel = (who: string, app: string): string => `Edit sign-in: ${who}${app ? ` on ${app}` : ''}`

/* --- Several identities: a chip each ------------------------------------------------------ */

/** An identity's answer as its chip marks it: allow ✓, 2FA a key, deny ✕, depends ?, no policy –. */
export type ChipMark = 'allow' | '2fa' | 'deny' | 'depends' | 'none'

export interface IdentityChip {
  /** The pick: a person's id, or `group:<id>`. */
  key: string
  kind: 'user' | 'group'
  /** "Maya Iyer", "Finance": the whole name. */
  name: string
  /** "Maya", "Engineeri…": the name once the row is short of room (the whole one stays in the title). */
  short: string
  /** The identity the canvas is telling. */
  active: boolean
  /** Its own answer, once the run on screen has landed; null before — no result ahead of the story. */
  mark: ChipMark | null
  /** "Maya Iyer, Allow with 2FA" once landed, "Maya Iyer" before: the chip's name. */
  label: string
}

/** How a plan's answer is marked on its chip. */
export function chipMarkOf(plan: EngineRun): ChipMark {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === '1fa' ? 'allow' : o.decision === '2fa' ? '2fa' : 'deny'
  return o.status === 'depends' ? 'depends' : 'none'
}

/** A group's name past this many characters is cut, with an ellipsis, when the row folds. */
const SHORT_GROUP = 10
/** "Maya Iyer" → "Maya"; "Engineering managers" → "Engineeri…". */
export function shortName(kind: 'user' | 'group', name: string): string {
  const n = name.trim()
  if (kind === 'user') return n.split(/\s+/)[0] || n
  return n.length > SHORT_GROUP ? `${n.slice(0, SHORT_GROUP - 1).trimEnd()}…` : n
}

/** The row's chips for a Run of several identities, or null for one (the row is as it always was). */
export function identityChips(identities: readonly RunIdentity[] | undefined, landed: boolean): IdentityChip[] | null {
  if (!identities || identities.length < 2) return null
  return identities.map((i) => {
    const mark = landed && !i.plan.empty ? chipMarkOf(i.plan) : null
    return { key: i.key, kind: i.kind, name: i.name, short: shortName(i.kind, i.name), active: i.active, mark, label: mark ? `${i.name}, ${wordsOfPlan(i.plan)}` : i.name }
  })
}
