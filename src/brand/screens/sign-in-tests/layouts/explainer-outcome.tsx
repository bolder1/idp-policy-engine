import { motion } from 'motion/react'
import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Ban, ChevronDown, ChevronRight, CircleHelp, Info, KeyRound, ShieldCheck, Split, TriangleAlert, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { stepLabel } from '../../testing/screens-of'
import { answerWords } from '../../testing/sign-in-sentence'
import { WhatTheySee } from '../../testing/WhatTheySee'
import { expectMark, findingsCount, heroFinding, isQuiet } from '../journey'
import { Spinner } from '../PolicyStack'
import { landedAt, toneOf } from './explainer-model'
import { OnPlate, Plate } from './explainer-parts'
import { EASE_OUT } from './explainer-motion'
import type { VisualCtx } from './explainer-visual'

/* The answer, pictured (explainer-visual.tsx): the verdict in its colour,
   the policy and rule that decided it — the rule's own card settles into
   this "Decided by" block as the run lands — the factors asked for or the
   message refused with, what is worth knowing, and What they see as the
   small browser beside it. Before it lands, the place it will land, deciding. */

const ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }

export function OutcomeView({ c }: { c: VisualCtx }) {
  const { props, s, animate, morph } = c
  const { plan, screens, form, changed, expected, weaker, columns, onOpenRule, onOpenPolicy, breakIn, onReviewBreakIn } = props
  const [findingsOpen, setFindingsOpen] = useState(false)
  const landed = landedAt(plan, s)
  const tone = toneOf(plan)
  if (!landed) {
    return (
      <div className="rl-explainer__center">
        <div className="rl-explainer__card is-outcome is-ghost is-working" data-card data-node="outcome">
          <Plate id="x-rule" tone="working" morph={morph} />
          <OnPlate animate={animate}>
            <div className="rl-explainer__verdict">
              <span className="rl-explainer__vtile is-working"><Spinner /></span>
              <span className="rl-explainer__vword is-quiet">Deciding</span>
            </div>
            <span className="tj-skel is-line rl-explainer__ghost" />
            <span className="tj-skel is-short rl-explainer__ghost" />
          </OnPlate>
        </div>
      </div>
    )
  }
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? ICON[decided] : Split
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides'
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const where = landing ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1}`) : ''
  const ruleName = decided && landing && landing.index !== null ? landing.name : ''
  const open = () => {
    if (!o.policyId) return
    if (decided && landing && landing.index !== null) onOpenRule(o.policyId, landing.id)
    else onOpenPolicy(o.policyId)
  }
  const screen = decided ? (screens.find((sc) => sc.decision === decided) ?? screens[0]) : undefined
  const steps = screen?.steps ?? []
  const deny = steps.find((st) => st.kind === 'deny')
  const factors = steps.filter((st) => st.kind !== 'deny')
  const count = findingsCount(plan)
  const hero = heroFinding(plan)
  const findings = (plan.conflicts?.findings ?? []).filter((f) => !isQuiet(f))
  const mark = expectMark(decided, expected, weaker)
  const was = columns.length > 1 ? columns[0] : null
  const now = columns.length > 1 ? columns[columns.length - 1] : null
  const versus = was && now && answerWords(was) !== answerWords(now) ? { was, now } : null
  const see = screens.length > 0 && form.appId !== null
  const line = { out: { opacity: 0, y: 4 }, in: { opacity: 1, y: 0, transition: { duration: animate ? 0.26 : 0, ease: EASE_OUT } } }
  return (
    <div className="rl-explainer__center">
      <div className={`rl-explainer__card is-outcome is-${tone}${see ? ' has-see' : ''}`} data-card data-node="outcome" role="group" aria-label={`Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ''}`}>
        <Plate tone={tone} morph={false} />
        <div className="rl-explainer__outgrid">
          <motion.div className="rl-explainer__outin" initial={animate ? 'out' : false} animate="in" variants={{ out: {}, in: { transition: animate ? { staggerChildren: 0.07, delayChildren: 0.18 } : {} } }}>
            <div className="rl-explainer__verdict">
              <motion.span className={`rl-explainer__vtile is-${tone}`} aria-hidden initial={animate ? { scale: 0.4, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={animate ? { type: 'spring', stiffness: 420, damping: 20, mass: 0.7 } : { duration: 0 }}>
                <Icon size={22} strokeWidth={2} />
              </motion.span>
              <span className={`rl-explainer__vword is-${tone}`}>{word}</span>
              {mark === 'fails' && expected && (
                <span className="rl-explainer__expect" title={`This sign-in expects ${DECISION_WORDS[expected]}`}>
                  <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />
                  Expected {DECISION_WORDS[expected]}
                </span>
              )}
              {mark === 'weaker' && (
                <span className="rl-explainer__expect" title={weaker || undefined}>
                  <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />
                  Weaker factor
                </span>
              )}
            </div>
            {o.policyName && (
              <div className="rl-explainer__by">
                <Plate id="x-rule" tone="quiet" morph={morph} />
                <OnPlate animate={animate} delay={0.3}>
                  <span className="rl-explainer__kick">{decided ? 'Decided by' : 'Policy'}</span>
                  <button type="button" className="rl-explainer__bylink" title={`Open ${where && decided ? `${where} of ` : ''}${o.policyName}`} onClick={open}>
                    {/* The arrow stays with the last word, never alone on a line. */}
                    <span>
                      {o.policyName}
                      {where && decided ? (
                        <span className="rl-explainer__nowrap">
                          {` · ${where}`}
                          <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
                        </span>
                      ) : (
                        <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
                      )}
                    </span>
                  </button>
                  {ruleName && <span className="rl-explainer__byrule">{ruleName}</span>}
                </OnPlate>
              </div>
            )}
            {factors.length > 0 && !deny && (
              <motion.div className="rl-explainer__asked" variants={line}>
                <span className="rl-explainer__kick">Asked for</span>
                <ol className="rl-explainer__factors">
                  {factors.map((st, i) => (
                    <li key={`${st.kind}:${i}`}>
                      {i > 0 && <ChevronRight size={13} strokeWidth={2.2} aria-hidden className="rl-explainer__arrow" />}
                      <span className="rl-explainer__factor">{stepLabel(st)}</span>
                    </li>
                  ))}
                </ol>
              </motion.div>
            )}
            {deny && deny.kind === 'deny' && (
              <motion.p className="rl-explainer__deny" variants={line} title={deny.message}>
                “{deny.message}”
              </motion.p>
            )}
            {o.status === 'depends' && o.view.outcomes.length > 0 && (
              <motion.ul className="rl-explainer__ifs" variants={line}>
                {o.view.outcomes.map((x) => (
                  <li key={`${x.label}:${x.decision}`}>
                    <span>{x.label}</span>
                    <strong>{DECISION_WORDS[x.decision]}</strong>
                  </li>
                ))}
              </motion.ul>
            )}
            {o.status === 'depends' && o.view.needs.length > 0 && (
              <motion.p className="rl-explainer__needs" variants={line}>
                <CircleHelp size={13} strokeWidth={2.2} aria-hidden />
                Needs {o.view.needs.join(', ').toLowerCase()}
              </motion.p>
            )}
            {versus && (
              <motion.p className="rl-explainer__vs" variants={line}>
                {versus.was.label} {answerWords(versus.was)}
                <ArrowRight size={13} strokeWidth={2} aria-hidden />
                {versus.now.label} {answerWords(versus.now)}
              </motion.p>
            )}
            {changed && (
              <motion.p className="rl-explainer__changed" variants={line}>
                Changed by {changed}
              </motion.p>
            )}
            {count && (
              <motion.div className={`rl-explainer__finding${count.conflict ? ' is-conflict' : ''}`} variants={line}>
                <button type="button" className="rl-explainer__findbtn" aria-expanded={findingsOpen} onClick={() => setFindingsOpen((v) => !v)}>
                  {count.conflict ? <TriangleAlert size={13} strokeWidth={2.2} aria-hidden /> : <Info size={13} strokeWidth={2.2} aria-hidden />}
                  <span>{hero?.text || count.text}</span>
                  {findingsOpen ? <ChevronDown size={14} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={14} strokeWidth={2.2} aria-hidden />}
                </button>
                {findingsOpen && (
                  <ul className="rl-explainer__flist">
                    {findings.map((f, i) => (
                      <li key={`${f.kind}:${i}`}>
                        <strong>{f.title}</strong>
                        {f.line && f.line !== f.title && f.line !== hero?.text && <span>{f.line}</span>}
                        {f.fix && <span className="rl-explainer__fix">{f.fix}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
            {breakIn && onReviewBreakIn && (
              <motion.p variants={line}>
                <button type="button" className="rl-explainer__quiet" onClick={() => onReviewBreakIn('outcome')}>
                  Break-in attempts
                  <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
                </button>
              </motion.p>
            )}
          </motion.div>
          {see && (
            <motion.div className="rl-explainer__see" initial={animate ? { opacity: 0, x: 12 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: animate ? 0.32 : 0, delay: animate ? 0.36 : 0, ease: EASE_OUT }}>
              <WhatTheySee screens={screens} appId={form.appId} compact collapsible={false} />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
