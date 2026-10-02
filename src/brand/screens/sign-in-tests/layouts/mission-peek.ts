import type { LineStatus } from '../../testing/evidence'
import { DECISION_WORDS } from '../../../decision-words'
import type { EngineRun } from '../engine-run'
import { traceResult } from '../journey'
import { deciderVia, landingOf, type Tone } from './mission-intents'
import { CALL, policyReadout, ruleReadout, telemetryFact, telemetryNeed, type RuleStationState, type StationState } from './mission-model'
import type { PadFact } from './mission-display'

/* -----------------------------------------------------------------------------
   The inspector (MissionLayout.tsx): what a hovered, focused or pressed piece
   of the room says — a station's call and why, a rule's telemetry whole (the
   fact beside what the rule needs, and the sub-checks under a device or a
   zone), a fact on the launch pad and which rules read it. All from the plan.
   -------------------------------------------------------------------------- */

export interface PeekLine {
  text: string
  sub?: string
  mark?: LineStatus
  call?: string
  tone?: Tone
  quiet?: boolean
  indent?: boolean
}

export interface PeekContext {
  plan: EngineRun
  s: number
  landed: boolean
  first: string
  person: string
  groupLine: string
  facts: readonly PadFact[]
  pStates: readonly StationState[]
  rStates: readonly RuleStationState[]
}

const CATS: Record<string, readonly string[]> = { address: ['network', 'place'], place: ['place'], device: ['device'], when: ['time'], risk: ['risk'] }

export function peekLines(id: string, c: PeekContext): PeekLine[] {
  const { plan, s, landed, first } = c
  const decider = plan.policies.find((p) => p.decides)
  const landing = landingOf(plan)
  if (id === 'sign-in') return [{ text: c.person }, ...(c.groupLine ? [{ text: c.groupLine, quiet: true }] : []), { text: 'Press to change the sign-in', quiet: true }]
  if (id.startsWith('fact:')) {
    const key = id.slice(5)
    const f = c.facts.find((x) => x.key === key)
    if (!f) return []
    const cats = CATS[key] ?? []
    const readBy = plan.rules.filter((r) => r.visited && r.checks.slice(0, r.checked).some((x) => cats.includes(x.category)))
    return [
      { text: `${f.label} · ${f.value}` },
      ...readBy.map((r) => {
        const x = r.checks.slice(0, r.checked).find((y) => cats.includes(y.category))
        return { text: r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}`, sub: x ? telemetryNeed(x) : '', mark: x?.status, call: x ? CALL[x.status] : undefined }
      }),
      ...(readBy.length === 0 ? [{ text: landed ? 'No rule read it on this run' : 'Not read yet', quiet: true }] : []),
    ]
  }
  if (id.startsWith('policy:')) {
    const i = plan.policies.findIndex((p) => p.node === id)
    const p = plan.policies[i]
    if (!p) return []
    const st = c.pStates[i]
    const rd = policyReadout(p, st, plan, first)
    const lines: PeekLine[] = [{ text: `Policy ${p.order} · ${p.name}`, call: rd.call, tone: toneOf(st) }]
    const cover = plan.conflicts?.policies.find((x) => x.policyId === p.policyId)
    if (p.decides) {
      const via = deciderVia(plan)
      lines.push({ text: p.isGlobalDefault ? `No policy above it is GO for ${first}: the Global Default takes the flight` : `The first policy on ${plan.appName} that covers ${first}${via?.say ? `, ${via.say}` : ''}`, tone: 'positive' })
      if (landing && landed) lines.push({ text: landing.index === null ? 'Nothing else matched decides' : `Rule ${landing.index + 1} · ${landing.name} decides`, quiet: true })
    } else if (st === 'also' && cover) {
      lines.push({ text: `Also covers ${first}${cover.via.say ? ` ${cover.via.say}` : ''} · not used`, tone: 'notice' })
      if (cover.status === 'decided' && cover.decision) lines.push({ text: `On its own: ${DECISION_WORDS[cover.decision]}${cover.ruleNumber !== null ? ` · rule ${cover.ruleNumber}` : ''}`, quiet: true })
      if (cover.fix) lines.push({ text: cover.fix, quiet: true })
    } else if (st === 'nogo') lines.push({ text: p.reason || `${first} is not in it` })
    else if (st === 'unpolled') lines.push({ text: decider ? `Not polled: ${decider.name} is GO first` : 'Not polled', quiet: true })
    else if (st === 'standby') lines.push({ text: 'Waiting its turn', quiet: true })
    else if (st === 'off') lines.push({ text: p.reason || 'Not on', quiet: true })
    if (p.tip && !p.decides) lines.push({ text: p.tip, quiet: true })
    return lines
  }
  if (id.startsWith('rule:')) {
    const i = plan.rules.findIndex((x) => x.node === id)
    const r = plan.rules[i]
    if (!r) return []
    const st = c.rStates[i]
    const rd = ruleReadout(r, st)
    const res = traceResult(r, s)
    const lines: PeekLine[] = [{ text: r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1} · ${r.name}`, call: rd.call, tone: toneOfRule(st) }]
    if (res === 'waiting' || res === 'not-reached') {
      const clash = plan.conflicts?.rules.find((x) => x.ruleId === r.id)
      lines.push({ text: res === 'waiting' ? 'Not polled yet' : landing && landing.index !== null ? `Not polled: rule ${landing.index + 1} was GO first` : 'Not polled', quiet: true })
      if (clash && landed) lines.push({ text: `${clash.match === 'unknown' ? 'Might also be GO' : 'Would also be GO'} for ${first}${clash.via.say ? ` ${clash.via.say}` : ''} · not used`, sub: clash.fix || undefined, tone: clash.kind === 'conflict' ? 'notice' : 'neutral' })
    } else if (res === 'off') lines.push({ text: 'Switched off: passed over, nothing polled', quiet: true })
    else {
      const read = r.checks.slice(0, Math.max(r.checked, r.failing !== null ? r.failing + 1 : 0))
      for (const x of read) {
        lines.push({ text: `${x.word} · ${telemetryFact(x, r.via)}`, sub: telemetryNeed(x), mark: x.status, call: CALL[x.status] })
        if (x.subs.length > 1) for (const y of x.subs) lines.push({ text: `${y.label} · ${y.actual || 'Not stated'}`, sub: y.required ? `needs ${y.required}` : undefined, mark: y.status, indent: true })
      }
      const unread = r.checks.slice(read.length)
      if (unread.length > 0) lines.push({ text: `Not read after the NO-GO: ${unread.map((x) => x.word).join(', ')}`, quiet: true })
      if (r.index === null) lines.push({ text: 'The last station: it matches whatever reaches it', quiet: true })
    }
    lines.push({ text: `Then · ${DECISION_WORDS[r.decision]}`, quiet: true })
    return lines
  }
  return []
}

const toneOf = (st: StationState): Tone => (st === 'go' ? 'positive' : st === 'nogo' ? 'negative' : st === 'also' ? 'notice' : 'neutral')
const toneOfRule = (st: RuleStationState): Tone => (st === 'go' ? 'positive' : st === 'nogo' || st === 'scrub' ? 'negative' : st === 'hold' || st === 'ifnot' || st === 'also' ? 'notice' : 'neutral')
