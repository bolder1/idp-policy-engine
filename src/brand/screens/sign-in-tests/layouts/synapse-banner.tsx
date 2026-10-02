import { motion } from 'motion/react'
import { RotateCcw, Repeat2 } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { EngineRun } from '../engine-run'
import { WORLD_W } from './synapse-geometry'
import { routeTone } from './synapse-model'

/* The strip over the network (SynapseLayout.tsx): once landed, the hint that
   a fact can be flipped; on a what-if, what was flipped, what THAT run gives
   (from its own plan), what the sign-in gives, and the way back. */

const answerOf = (plan: EngineRun): string => {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return DECISION_WORDS[o.decision]
  return o.status === 'depends' ? 'Depends' : 'No decision'
}
const whereOf = (plan: EngineRun, base: EngineRun): string => {
  const r = plan.landing !== null ? plan.rules[plan.landing] : undefined
  if (!r || plan.outcome.status !== 'decided') return ''
  const rule = r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1} · ${r.name}`
  return plan.decider && plan.decider.id !== base.decider?.id ? `${plan.decider.name} · ${rule}` : rule
}

export function Banner({ base, whatIf, changes, hint, play, onBack }: { base: EngineRun; whatIf: EngineRun | null; changes: string[]; hint: string; play: boolean; onBack: () => void }) {
  if (!whatIf) {
    if (!hint) return null
    return (
      <motion.p className="rl-synapse__hint" style={{ width: WORLD_W }} initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: play ? 0.4 : 0, delay: play ? 0.8 : 0 }}>
        <Repeat2 size={13} strokeWidth={2} aria-hidden />
        {hint}
      </motion.p>
    )
  }
  const tone = routeTone(whatIf)
  const same = answerOf(whatIf) === answerOf(base) && whereOf(whatIf, base) === whereOf(base, base)
  return (
    <motion.div key="whatif" className="rl-synapse__banner" style={{ maxWidth: WORLD_W }} role="status" initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: play ? 0.2 : 0 }}>
      <span className="rl-synapse__wtag">What if</span>
      <span className="rl-synapse__wfacts">{changes.join(', ')}</span>
      <span className="rl-synapse__warrow" aria-hidden>
        →
      </span>
      <strong className={`rl-synapse__wword is-${tone}`}>{answerOf(whatIf)}</strong>
      {whereOf(whatIf, base) && <span className="rl-synapse__wwhere">· {whereOf(whatIf, base)}</span>}
      <span className="rl-synapse__wwas">{same ? 'The same as the sign-in' : `The sign-in gets ${answerOf(base)}`}</span>
      <button type="button" className="rl-synapse__back" onClick={onBack}>
        <RotateCcw size={13} strokeWidth={2.2} aria-hidden />
        Back to the sign-in
      </button>
    </motion.div>
  )
}
