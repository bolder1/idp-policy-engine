import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { DECISION_WORDS } from '../../../decision-words'
import type { Finding, PolicyConflict } from '../conflicts'
import { policyFound, policyPhase, type EnginePolicy } from '../engine-run'
import { Spinner } from '../PolicyStack'
import { G, type Slot } from './stream-geometry'
import type { Tone } from './stream-model'
import { Gate, NoteLines, Num, Peek, type GateState } from './stream-parts'

/* -----------------------------------------------------------------------------
   The POLICY channels (StreamLayout.tsx), one per policy in the engine's
   order, stacked down the trunk. A policy that does not cover the person is
   a channel with its gate SHUT — the stream glances off it, its reason on
   the gate; the first that covers OPENS and the stream pours through it into
   its rules. One after it that also covers the person gets an amber trickle
   that never reaches a pool; the rest were never needed, quiet.
   -------------------------------------------------------------------------- */

export interface ChannelCtx {
  appName: string
  first: string
  deciderName: string
  deciderVia: string
  ruleWhy: string
  findings: readonly Finding[]
}

/* "Ravi Menon is not in it" in a few words: "Doesn't cover Ravi". */
function reasonWords(reason: string, first: string): string {
  if (/ is not in (it|this policy)$/.test(reason)) return `Doesn't cover ${first}`
  return reason
}

export function PolicyChannel({
  p,
  slot,
  s,
  shown,
  landed,
  tone,
  animate,
  after,
  cover,
  conflict,
  ctx,
}: {
  p: EnginePolicy
  slot: Slot
  s: number
  /** The stack has appeared (the engine is finding the policy). */
  shown: boolean
  landed: boolean
  tone: Tone
  animate: boolean
  /** After the one that decides: never read. */
  after: boolean
  /** It also covers the person (once landed). */
  cover?: PolicyConflict
  conflict: boolean
  ctx: ChannelCtx
}) {
  const phase = policyPhase(p, s)
  const working = phase === 'working' || policyFound(p, s)
  const settled = phase === 'settled'
  const opened = p.decides && (settled || (p.foundAt !== null && s > p.foundAt))
  const also = landed && after && cover !== undefined
  const gate: GateState = !shown ? 'idle' : opened ? 'open' : working ? 'working' : also ? 'ajar' : settled && !after ? 'shut' : 'idle'
  const findings = ctx.findings.filter((f) => f.target.policyId === p.policyId && f.target.ruleId === null)
  const fLines = findings.map((f) => f.line || f.title)
  const fFix = findings.find((f) => f.fix)?.fix

  let sub = ''
  let note: ReactNode = null
  let state: string
  if (!shown) {
    state = 'is-waiting'
  } else if (working) {
    state = 'is-working'
    sub = 'Does it cover them?'
  } else if (p.decides && (settled || opened)) {
    state = `is-open${landed ? ` is-${tone}` : ''}`
    sub = p.isGlobalDefault ? `None above covers ${ctx.first}` : `Covers ${ctx.first}${ctx.deciderVia ? ` ${ctx.deciderVia}` : ''}`
    note = (
      <NoteLines
        lines={[
          p.isGlobalDefault ? `No policy above it covers ${ctx.first}: the Global Default applies` : `The first policy on ${ctx.appName} that covers ${ctx.first}${ctx.deciderVia ? `, ${ctx.deciderVia}` : ''}`,
          ctx.ruleWhy,
          p.tip,
          ...fLines,
        ]}
        fix={fFix}
      />
    )
  } else if (after) {
    if (also && cover) {
      state = `is-also${conflict ? ' is-conflict' : ''}`
      sub = `Also covers ${ctx.first} · not used`
      const would =
        cover.status === 'decided' && cover.decision
          ? `On its own: ${DECISION_WORDS[cover.decision]}${cover.ruleNumber !== null ? ` · rule ${cover.ruleNumber}` : ''}`
          : cover.possible.length > 0
            ? `On its own: ${cover.possible.map((d) => DECISION_WORDS[d]).join(' or ')}`
            : ''
      note = <NoteLines lines={[`Covers ${ctx.first} ${cover.via.say}`.trim(), cover.notUsed, would, ...fLines]} fix={cover.fix || fFix} />
    } else {
      state = landed ? 'is-quiet' : 'is-waiting'
      const said = p.reason && !/^not reached$/i.test(p.reason) ? p.reason : ''
      note = <NoteLines lines={[ctx.deciderName ? `Not read: ${ctx.deciderName} applies first` : 'Not read', said, p.tip, ...fLines]} fix={fFix} />
    }
  } else if (settled) {
    state = 'is-shut'
    sub = reasonWords(p.reason, ctx.first) || 'Not used'
    note = <NoteLines lines={[p.reason || 'Not used', p.tip, ...fLines]} fix={fFix} />
  } else {
    state = 'is-waiting'
    note = <NoteLines lines={['Not read yet', p.tip]} />
  }

  const label = `${p.order}. ${p.name}${sub ? `: ${sub}` : ''}`
  return (
    <div className={`rl-stream__chan ${state}`} style={{ left: G.POL_X, top: slot.top, width: G.POL_W, height: slot.h }}>
      <Peek id={p.node} node={p.node} className="rl-stream__card rl-stream__chanbtn" label={label} note={note}>
        <span className="rl-stream__head">
          <Num n={p.order} />
          <span className="rl-stream__name" title={p.name}>
            {p.name}
          </span>
          {working ? <Spinner small /> : null}
        </span>
        <span className="rl-stream__sub">
          {also && conflict && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
          <span className="rl-stream__subtext">{sub}</span>
        </span>
        <span className="rl-stream__groove" aria-hidden />
      </Peek>
      <Gate state={gate} tone={landed ? tone : 'pending'} animate={animate} style={{ top: G.LANE - 11 }} />
    </div>
  )
}
