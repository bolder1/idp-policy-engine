import { motion } from 'motion/react'
import { DENIAL_REASONS } from '../phase'
import { DENY_REASON_WORD, denyReasonOf, denyRef } from '../deny-reason'
import { ArrowRight, Ban, ChevronDown, ChevronRight, KeyRound, ShieldCheck, Split, TriangleAlert, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { answerWords } from '../../testing/sign-in-sentence'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { ColumnView } from '../../board/try-sign-in'
import type { EngineRun } from '../engine-run'
import { expectMark } from '../journey'
import type { CiteId, Tone } from './brief-model'
import { Card, Skel, type CardState } from './brief-parts'

/* -----------------------------------------------------------------------------
   The last evidence card (BriefLayout.tsx): the outcome — its word in its
   tone, the factors the person is asked for, one after the other (or the
   message they are refused with, or the answers it could be), and what they
   see, the compact mock, under it.
   -------------------------------------------------------------------------- */

const ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }
const EASE = [0.2, 0, 0, 1] as const

export interface OutcomeProps {
  n: number | undefined
  plan: EngineRun
  landed: boolean
  tone: Tone
  screens: SignInScreens[]
  appId: string | null
  columns: ColumnView[]
  changed: string | null
  expected: AccessDecision | null
  weaker: string | null
  state: CardState
  lit: boolean
  animate: boolean
  runKey: number
  /** What they see, open under the factors. */
  see: boolean
  onSee: () => void
  onHot: (c: CiteId | null) => void
}

export function OutcomeCard(p: OutcomeProps) {
  const reason = denyReasonOf(p.plan)
  const o = p.plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? ICON[decided] : Split
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides'
  const screen = decided ? (p.screens.find((x) => x.decision === decided) ?? p.screens[0]) : undefined
  const steps = screen?.steps ?? []
  const deny = steps.find((x) => x.kind === 'deny')
  const factors = steps.filter((x) => x.kind !== 'deny')
  const mark = expectMark(decided, p.expected, p.weaker)
  const was = p.columns.length > 1 ? p.columns[0] : null
  const now = p.columns.length > 1 ? p.columns[p.columns.length - 1] : null
  const versus = was && now && answerWords(was) !== answerWords(now) ? { was, now } : null
  const item = { out: { opacity: 0 }, in: { opacity: 1, transition: { duration: p.animate ? 0.26 : 0, ease: EASE } } }
  return (
    <Card cite="outcome" n={p.n} node="outcome" state={p.state} lit={p.lit} tone={p.landed ? p.tone : undefined} animate={p.animate} onHot={p.onHot} className={p.see ? 'is-seeing' : ''}>
      {!p.landed ? (
        <div className="rl-brief__outwait">
          <Skel w="60%" />
          <Skel w="40%" />
        </div>
      ) : (
        <motion.div
          key={p.runKey}
          className="rl-brief__out"
          initial={p.animate ? 'out' : false}
          animate="in"
          variants={{ out: {}, in: { transition: p.animate ? { staggerChildren: 0.09 } : {} } }}
        >
          <motion.p className={`rl-brief__verdict is-${p.tone}`} variants={item}>
            <span className="rl-brief__tile" aria-hidden>
              <Icon size={16} strokeWidth={2.2} />
            </span>
            <span className="rl-brief__word">{word}</span>
          </motion.p>
          {mark && (
            <motion.p className="rl-brief__expect" variants={item}>
              <TriangleAlert size={12} strokeWidth={2.4} aria-hidden />
              {mark === 'weaker' ? 'Weaker factor' : `Expected ${p.expected ? DECISION_WORDS[p.expected] : ''}`}
            </motion.p>
          )}
          {factors.length > 0 && !deny && (
            <motion.ol className="rl-brief__factors" variants={item} aria-label="Asked for">
              {factors.map((x, i) => (
                <li key={`${x.kind}:${i}`}>
                  {i > 0 && <ChevronRight size={12} strokeWidth={2.4} aria-hidden />}
                  <span className="rl-brief__factor">{stepLabel(x)}</span>
                </li>
              ))}
            </motion.ol>
          )}
          {deny && deny.kind === 'deny' && (
            <motion.p className="rl-brief__deny" variants={item} title={deny.message}>
              “{deny.message}”
            </motion.p>
          )}
          {DENIAL_REASONS && reason && (
            <motion.p className="rl-brief__reason" variants={item}>
              {DENY_REASON_WORD[reason]} · <span>{denyRef(reason)}</span>
            </motion.p>
          )}
          {o.status === 'depends' && o.view.outcomes.length > 0 && (
            <motion.ul className="rl-brief__ifs" variants={item}>
              {o.view.outcomes.map((x) => (
                <li key={`${x.label}:${x.decision}`}>
                  <span>{x.label}</span>
                  <strong>{DECISION_WORDS[x.decision]}</strong>
                </li>
              ))}
            </motion.ul>
          )}
          {versus && (
            <motion.p className="rl-brief__vsline2" variants={item}>
              {versus.was.label} {answerWords(versus.was)}
              <ArrowRight size={12} strokeWidth={2.2} aria-hidden />
              {versus.now.label} {answerWords(versus.now)}
            </motion.p>
          )}
          {p.changed && (
            <motion.p className="rl-brief__changed" variants={item}>
              Changed by {p.changed}
            </motion.p>
          )}
          {decided && p.screens.length > 0 && p.appId && (
            <motion.div className="rl-brief__see" variants={item}>
              <button type="button" className="rl-brief__seebtn" aria-expanded={p.see} onClick={p.onSee}>
                What they see
                {p.see ? <ChevronDown size={13} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={13} strokeWidth={2.2} aria-hidden />}
              </button>
              {p.see && <WhatTheySee screens={p.screens} appId={p.appId} compact collapsible={false} title="" />}
            </motion.div>
          )}
        </motion.div>
      )}
    </Card>
  )
}
