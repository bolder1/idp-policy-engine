import { motion } from 'motion/react'
import { Lock, Repeat2 } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import type { CheckRow, EnginePolicy, EngineRule } from '../engine-run'
import { traceResult } from '../journey'
import type { Box } from './synapse-geometry'
import type { OutId, PolKind, Tone } from './synapse-model'
import { Busy, Mark, Neuron } from './synapse-parts'
import { factOf, needOf } from './synapse-parts-utils'

/* The neurons of each layer (SynapseLayout.tsx): what each one says, in few
   words, and the press it answers. Their tones come from synapse-model.ts. */

export interface CellBase {
  box: Box
  tone: Tone
  play: boolean
  delay?: number
  lit?: boolean
  /** On a re-fire: when the neuron takes its tone (s). */
  settle?: number
  onPeek: (id: string, pin: boolean) => void
  onUnpeek: (id: string) => void
}

export function PersonCell({ name, isGroup, groupLine, appId, appName, onPress, ...b }: CellBase & { name: string; isGroup: boolean; groupLine: string; appId: string | null; appName: string; onPress: () => void }) {
  return (
    <Neuron {...b} kind="input" sy="sign-in" node="sign-in" label={`${name}${groupLine ? `, ${groupLine}` : ''}, signs in to ${appName}. Change the sign-in`} onPress={onPress}>
      <span className="rl-synapse__who">
        <Face kind={isGroup ? "group" : "user"} name={name} size="sm" decorative />
        <span className="rl-synapse__whoname" title={name}>
          {name}
        </span>
      </span>
      {groupLine && (
        <span className="rl-synapse__groups" title={groupLine}>
          {groupLine}
        </span>
      )}
      <span className="rl-synapse__app">
        <span aria-hidden>→</span>
        {appId && <AppLogo appId={appId} name={appName} size={14} />}
        <span className="rl-synapse__appname">{appName}</span>
      </span>
    </Neuron>
  )
}

export function FactCell({ id, label, value, was, mark, canFlip, onFlip, ...b }: CellBase & { id: string; label: string; value: string; was: string | null; mark: string | null; canFlip: boolean; onFlip: () => void }) {
  const said = `${label}: ${value}${was ? `, a what-if (was ${was})` : ''}.${canFlip ? ' Press to try another' : ' Details'}`
  return (
    <Neuron {...b} kind="input" sy={`fact:${id}`} label={said} onPress={canFlip ? onFlip : undefined} className={`${was ? 'is-whatif' : ''}${canFlip ? ' can-flip' : ''}`}>
      <span className="rl-synapse__line">
        <span className="rl-synapse__word">{label}</span>
        {mark === 'fail' && <Mark status="fail" size={11} label="Failed a check" />}
        {mark === 'unknown' && <Mark status="unknown" size={11} label="Can't tell" />}
        {canFlip && <Repeat2 className="rl-synapse__flip" size={13} strokeWidth={2} aria-hidden />}
      </span>
      <motion.span key={value} className="rl-synapse__value" title={value} initial={b.play || was ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        {value}
      </motion.span>
      {was && (
        <span className="rl-synapse__was" title={`Was ${was}`}>
          was {was}
        </span>
      )}
    </Neuron>
  )
}

export function PolicyCell({ p, kind, words, conflict, ...b }: CellBase & { p: EnginePolicy; kind: PolKind; words: string; conflict: boolean }) {
  return (
    <Neuron {...b} kind="policy" sy={p.node} node={p.node} label={`Policy ${p.order}, ${p.name}${words ? `: ${words}` : ''}. Details`} className={`is-k-${kind}${conflict ? ' is-conflict' : ''}`}>
      <span className="rl-synapse__line">
        <span className="rl-synapse__num">{p.order}</span>
        <span className="rl-synapse__name" title={p.name}>
          {p.name}
        </span>
        {(kind === 'scan' || kind === 'found') && <Busy label="Checking" />}
      </span>
      {words && (
        <span className="rl-synapse__state" title={words}>
          {words}
        </span>
      )}
    </Neuron>
  )
}

export function CheckCell({ c, r, k, ...b }: CellBase & { c: CheckRow; r: EngineRule; k: number; ri: number }) {
  const working = b.tone === 'work'
  const fact = factOf(c, r.via)
  const need = needOf(c)
  return (
    <Neuron {...b} kind="check" sy={`ck:${r.id}:${k}`} label={`${c.word}: ${fact}${need ? `, ${need}` : ''}. ${working ? 'Reading' : c.status === 'pass' ? 'Passed' : c.status === 'fail' ? 'Failed' : "Can't tell"}`}>
      <span className="rl-synapse__line">
        <span className="rl-synapse__word">{c.word}</span>
        {working ? <Busy label="Reading" /> : <Mark status={c.status} size={12} label={c.line || undefined} />}
      </span>
      <span className="rl-synapse__value" title={fact}>
        {fact}
      </span>
      {need && (
        <span className="rl-synapse__need" title={need}>
          {need}
        </span>
      )}
    </Neuron>
  )
}

/** A rule's few words, at its standing: what failed it, or where it stands. */
function ruleWords(r: EngineRule, s: number): string {
  const res = traceResult(r, s, true)
  const failing = r.failing !== null ? r.checks[r.failing] : r.checks.find((c) => c.status === 'fail')
  const unknown = r.checks.find((c) => c.status === 'unknown')
  switch (res) {
    case 'reading':
      return 'Reading'
    case 'matched':
      return 'Matches · first match'
    case 'missed':
    case 'folded':
      return failing ? `No match · ${failing.word}` : 'No match'
    case 'unknown':
      return unknown ? `Can't tell · ${unknown.word}` : "Can't tell"
    case 'possible':
      return 'If not'
    case 'off':
      return 'Switched off'
    case 'not-reached':
      return 'Not reached'
    default:
      return ''
  }
}

export function RuleCell({ r, s, ...b }: CellBase & { r: EngineRule; s: number }) {
  const n = r.index === null ? null : r.index + 1
  const words = ruleWords(r, s)
  const name = r.index === null ? 'Nothing else matched' : r.name
  return (
    <Neuron {...b} kind="rule" sy={r.node} node={r.node} label={`${n === null ? 'Nothing else matched' : `Rule ${n}, ${r.name}`}${words ? `: ${words}` : ''}. Then ${DECISION_WORDS[r.decision]}. Details`}>
      <span className="rl-synapse__line">
        <span className="rl-synapse__num">{n === null ? <Lock size={10} strokeWidth={2.4} aria-hidden /> : n}</span>
        <span className="rl-synapse__name" title={name}>
          {name}
        </span>
        {b.tone === 'work' && <Busy label="Reading" />}
      </span>
      {words && (
        <span className="rl-synapse__state" title={words}>
          {words}
        </span>
      )}
    </Neuron>
  )
}

const OUT_WORDS: Record<OutId, string> = { ...DECISION_WORDS, depends: 'Depends', none: 'No decision' }

export function OutputCell({ id, chosen, ...b }: CellBase & { id: OutId; chosen: boolean }) {
  return (
    <Neuron {...b} kind="output" sy={`out:${id}`} node={chosen ? undefined : undefined} axon={chosen} label={`${OUT_WORDS[id]}${chosen ? ': the decision' : ''}. Details`} className={chosen ? 'is-chosen' : ''}>
      <span className="rl-synapse__line">
        <span className="rl-synapse__name">{OUT_WORDS[id]}</span>
        {b.tone === 'work' && <Busy label="Deciding" />}
      </span>
    </Neuron>
  )
}
