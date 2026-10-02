import { DECISION_WORDS } from '../../../decision-words'
import type { LineStatus } from '../../testing/evidence'
import type { EngineRun } from '../engine-run'
import { traceResult } from '../journey'
import { inputOf, readRows, type InputId, type OutId, type Tone } from './synapse-model'
import { factOf, needOf } from './synapse-parts-utils'

/* What a hovered, focused or pressed neuron says (SynapseLayout.tsx): the
   fact against the requirement, the policy's reason, the rule's failing
   check — composed from the plan, nothing made up. */

export interface PeekLine {
  text: string
  sub?: string
  mark?: LineStatus
  tone?: Tone
  quiet?: boolean
}

export interface PeekContext {
  plan: EngineRun
  first: string
  personName: string
  groupLine: string
  landed: boolean
  s: number
  inputs: readonly { id: InputId; label: string; value: string }[]
  canFlip: (id: InputId) => boolean
}

const OUT_WORDS: Record<OutId, string> = { ...DECISION_WORDS, depends: 'Depends', none: 'No decision' }
const ruleLabel = (index: number | null, name: string) => (index === null ? 'Nothing else matched' : `Rule ${index + 1} · ${name}`)

export function peekLines(id: string, c: PeekContext): PeekLine[] {
  const { plan, first, landed, s } = c
  const decider = plan.policies.find((p) => p.decides)
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const have = new Set(c.inputs.map((x) => x.id))

  if (id === 'sign-in') return [{ text: c.personName }, ...(c.groupLine ? [{ text: c.groupLine, quiet: true }] : []), { text: 'Press to change the sign-in', quiet: true }]

  if (id.startsWith('fact:')) {
    const inp = c.inputs.find((x) => `fact:${x.id}` === id)
    if (!inp) return []
    const lines: PeekLine[] = [{ text: `${inp.label} · ${inp.value}` }]
    plan.rules.forEach((r) =>
      readRows(r).forEach((row) => {
        if (inputOf(row, have) !== inp.id) return
        lines.push({ text: r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}`, sub: row.line || row.say, mark: row.status })
      }),
    )
    if (lines.length === 1) lines.push({ text: landed ? 'No rule read it on this run' : 'Not read yet', quiet: true })
    if (landed && c.canFlip(inp.id)) lines.push({ text: 'Press to try another', quiet: true })
    return lines
  }

  if (id.startsWith('policy:')) {
    const p = plan.policies.find((x) => x.node === id)
    if (!p) return []
    const cover = plan.conflicts?.policies.find((x) => x.policyId === p.policyId)
    const lines: PeekLine[] = [{ text: `${p.order}. ${p.name}` }]
    if (p.decides) {
      lines.push({ text: p.isGlobalDefault ? `No policy above it covers ${first}: the Global Default applies` : `The first policy on ${plan.appName} that covers ${first}`, tone: 'ok' })
      if (landing) lines.push({ text: ruleLabel(landing.index, landing.name), quiet: true })
    } else if (cover && landed) {
      lines.push({ text: `Also covers ${first}${cover.via.say ? ` ${cover.via.say}` : ''} · not used`, tone: 'warn' })
      if (cover.status === 'decided' && cover.decision) lines.push({ text: `On its own: ${DECISION_WORDS[cover.decision]}${cover.ruleNumber !== null ? ` · rule ${cover.ruleNumber}` : ''}`, quiet: true })
      if (cover.why) lines.push({ text: cover.why, quiet: true })
    } else if (p.scanned) lines.push({ text: p.reason || 'Does not cover them' })
    else lines.push({ text: decider ? `Not read: ${decider.name} applies first` : p.reason || 'Not read', quiet: true })
    if (p.tip && !p.decides && !(cover && landed && cover.why)) lines.push({ text: p.tip, quiet: true })
    return lines
  }

  if (id.startsWith('ck:')) {
    const [, ruleId, ks] = id.split(':')
    const r = plan.rules.find((x) => x.id === ruleId)
    const row = r?.checks[Number(ks)]
    if (!r || !row) return []
    const lines: PeekLine[] = [{ text: `${row.word} · ${ruleLabel(r.index, r.name)}` }, { text: factOf(row, r.via), sub: needOf(row), mark: row.status }]
    row.subs.filter(() => row.subs.length > 1).forEach((x) => lines.push({ text: x.label, sub: `${x.actual || 'Not stated'}${x.required ? ` · needs ${x.required}` : ''}`, mark: x.status }))
    if (row.line) lines.push({ text: row.line, quiet: true })
    return lines
  }

  if (id.startsWith('rule:')) {
    const r = plan.rules.find((x) => x.node === id)
    if (!r) return []
    const res = traceResult(r, s, true)
    const lines: PeekLine[] = [{ text: ruleLabel(r.index, r.name) }]
    if (res === 'not-reached' || res === 'waiting') {
      lines.push({ text: res === 'waiting' ? 'Not read yet' : landing && landing.index !== null ? `Not read: rule ${landing.index + 1} matched first` : 'Not read', quiet: true })
      const clash = landed ? plan.conflicts?.rules.find((x) => x.ruleId === r.id) : undefined
      if (clash) lines.push({ text: `${clash.match === 'unknown' ? 'Might apply' : 'Also applies'} to ${first}${clash.via.say ? ` ${clash.via.say}` : ''} · not used`, tone: clash.kind === 'conflict' ? 'warn' : undefined })
    } else if (res === 'off') lines.push({ text: 'Switched off: passed over', quiet: true })
    else readRows(r).forEach((row) => lines.push({ text: `${row.word} · ${factOf(row, r.via)}`, sub: needOf(row), mark: row.status }))
    lines.push({ text: `Then · ${DECISION_WORDS[r.decision]}`, quiet: true })
    return lines
  }

  if (id.startsWith('out:')) {
    const o = id.slice(4) as OutId
    const lines: PeekLine[] = [{ text: OUT_WORDS[o] }]
    if (o === 'depends') lines.push({ text: `It depends on the ${plan.outcome.view.needs.map((n) => n.toLowerCase()).join(' and ') || 'facts not stated'}`, tone: 'warn' })
    else if (o === 'none') lines.push({ text: 'No policy decides', quiet: true })
    else {
      const from = plan.rules.filter((r) => r.decision === o)
      from.forEach((r) => {
        const res = traceResult(r, s, true)
        lines.push({ text: ruleLabel(r.index, r.name), sub: res === 'matched' ? 'Matched first' : res === 'not-reached' ? 'Not reached' : res === 'missed' || res === 'folded' ? 'No match' : res === 'unknown' ? "Can't tell" : res === 'possible' ? 'If not' : '', mark: res === 'matched' ? 'pass' : res === 'missed' || res === 'folded' ? 'fail' : res === 'unknown' ? 'unknown' : undefined })
      })
      if (from.length === 0) lines.push({ text: 'No rule gives it', quiet: true })
    }
    return lines
  }
  return []
}
