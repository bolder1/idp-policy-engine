import { motion } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'
import { ArrowUpRight, X } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { EngineRun } from '../engine-run'
import { expectMark, heroFinding } from '../journey'
import type { Box } from './synapse-geometry'
import { decisionTone, type Tone } from './synapse-model'
import { EASE } from './synapse-parts'

/* The outcome card (SynapseLayout.tsx): the decision neuron, bloomed — the
   verdict, what they are asked for, Decided by (opens the rule), the one
   finding, and What they see on demand. It opens as a circle growing out of
   the neuron that fired (a clip-path: no transform). */

export function factorsOf(screens: readonly SignInScreens[], d: AccessDecision | null): string[] {
  if (!d) return []
  const sc = screens.find((x) => x.decision === d)
  return (sc?.steps ?? []).filter((st) => st.kind !== 'deny').map(stepLabel)
}
export function denyMessageOf(screens: readonly SignInScreens[]): string {
  const sc = screens.find((x) => x.decision === 'deny')
  const st = sc?.steps.find((x) => x.kind === 'deny')
  return st && st.kind === 'deny' ? st.message : ''
}

export interface CardProps {
  plan: EngineRun
  screens: readonly SignInScreens[]
  appId: string | null
  box: Box
  /** Where the neuron that fired stands, from the card's top-left: the bloom's centre. */
  from: { x: number; y: number }
  tone: Tone
  play: boolean
  see: boolean
  onSee: (open: boolean) => void
  onHeight: (h: number) => void
  onOpenRule: (policyId: string, ruleId: string) => void
  onOpenPolicy: (policyId: string) => void
  expected: AccessDecision | null
  weaker: string | null
  changed: string | null
  /** A what-if: its own words, and no link into the builder's sign-in. */
  whatIf: boolean
  /** The bloom waits this long (s): the re-fire reaching the decision. */
  delay?: number
}

export function OutcomeCard({ plan, screens, appId, box, from, tone, play, see, onSee, onHeight, onOpenRule, onOpenPolicy, expected, weaker, changed, whatIf, delay = 0 }: CardProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => onHeight(Math.ceil(el.offsetHeight))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeight])

  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const kicker = decided ? (decided === 'deny' ? 'Access denied' : 'Access granted') : o.status === 'depends' ? "Can't tell yet" : 'No decision'
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? `Depends on the ${o.view.needs.map((n) => n.toLowerCase()).join(' and ') || 'facts'}` : 'No policy decides'
  const factors = factorsOf(screens, decided)
  const denyMsg = decided === 'deny' ? denyMessageOf(screens) : ''
  const byRule = landing ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1} · ${landing.name}`) : ''
  const finding = whatIf ? null : heroFinding(plan)
  const mark = whatIf ? null : expectMark(decided, expected, weaker)
  const openDecider = () => {
    if (!o.policyId) return
    if (landing && landing.index !== null) onOpenRule(o.policyId, landing.id)
    else onOpenPolicy(o.policyId)
  }
  const bloom = (r: string) => `circle(${r} at ${from.x}px ${from.y}px)`
  return (
    <div ref={ref} className="rl-synapse__cardslot" style={{ left: box.x, top: box.y, width: box.w }}>
      <motion.section
        className={`rl-synapse__card is-${tone}`}
        data-node="outcome"
        data-card
        role="group"
        aria-label={`Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ''}`}
        initial={play ? { clipPath: bloom('0px') } : false}
        animate={{ clipPath: bloom('760px') }}
        transition={{ duration: play ? 0.7 : 0, delay: play ? delay : 0, ease: [0.3, 0, 0.2, 1] }}
      >
        <p className="rl-synapse__ckicker">{kicker}</p>
        <p className="rl-synapse__cword">
          {word}
          {mark === 'fails' && expected && <span className="rl-synapse__expect">Expected {DECISION_WORDS[expected]}</span>}
          {mark === 'weaker' && <span className="rl-synapse__expect">Weaker factor</span>}
        </p>
        {factors.length > 0 && (
          <p className="rl-synapse__factors" aria-label="Asked for">
            {factors.map((f, i) => (
              <span key={`${f}:${i}`}>
                {i > 0 && <span className="rl-synapse__arrow">→</span>}
                {f}
              </span>
            ))}
          </p>
        )}
        {denyMsg && (
          <p className="rl-synapse__deny" title={denyMsg}>
            “{denyMsg}”
          </p>
        )}
        {o.status === 'depends' && o.view.outcomes.length > 0 && (
          <ul className="rl-synapse__ifs">
            {o.view.outcomes.map((x) => (
              <li key={`${x.label}:${x.decision}`}>
                <span>{x.label}</span>
                <span className={`rl-synapse__ifword is-${decisionTone(x.decision)}`}>{DECISION_WORDS[x.decision]}</span>
              </li>
            ))}
          </ul>
        )}
        {o.policyName && (
          <div className="rl-synapse__by">
            <span className="rl-synapse__kicker">{decided ? 'Decided by' : 'Policy'}</span>
            <button type="button" className="rl-synapse__bylink" onClick={openDecider} aria-label={`Open ${o.policyName}${byRule && decided ? `, ${byRule}` : ''} in the builder`}>
              <span className="rl-synapse__bytext">
                <span className="rl-synapse__bypolicy">{o.policyName}</span>
                {byRule && decided && <span className="rl-synapse__byrule">{byRule}</span>}
              </span>
              <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        )}
        {finding && <p className={`rl-synapse__finding is-${finding.tone === 'info' ? 'info' : 'notice'}`}>{finding.text}</p>}
        {(changed || (screens.length > 0 && appId)) && (
          <div className="rl-synapse__cfoot">
            {changed && !whatIf && <span className="rl-synapse__changed">Changed by {changed}</span>}
            {screens.length > 0 && appId && (
              <button type="button" className={`rl-synapse__seebtn${see ? ' is-open' : ''}`} aria-expanded={see} onClick={() => onSee(!see)}>
                What they see
              </button>
            )}
          </div>
        )}
      </motion.section>
      {see && screens.length > 0 && appId && (
        <motion.div
          className="rl-synapse__see"
          data-card
          initial={play ? { opacity: 0, clipPath: 'inset(0% 0% 100% 0%)' } : false}
          animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }}
          transition={{ duration: play ? 0.3 : 0, ease: EASE }}
        >
          <div className="rl-synapse__seehead">
            <span className="rl-synapse__kicker">What they see</span>
            <button type="button" className="rl-synapse__x" aria-label="Close what they see" onClick={() => onSee(false)}>
              <X size={13} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
          <div className="rl-synapse__seeinset">
            <WhatTheySee screens={screens} appId={appId} compact collapsible={false} title="" />
          </div>
        </motion.div>
      )}
    </div>
  )
}
