import { motion } from 'motion/react'
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, CircleHelp, Info, TriangleAlert } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { answerWords } from '../../testing/sign-in-sentence'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { ColumnView } from '../../board/try-sign-in'
import type { EngineRun } from '../engine-run'
import { expectMark, findingsCount } from '../journey'
import type { Geo } from './circuit-geometry'
import type { LedState, Tone } from './circuit-model'
import { NoteLines } from './circuit-note'

/* -----------------------------------------------------------------------------
   The outcome (CircuitLayout.tsx): an LED panel at the end of the board. It
   is dark while the engine works, charges blue as the current reaches it,
   and lights in the answer's one colour — green an allow (with the factors
   the person is asked for), red a deny (with its message), amber Depends
   (with what each reading gives). Decided by is the way to the rule.
   -------------------------------------------------------------------------- */

const EASE_OUT = [0.2, 0, 0, 1] as const

export function OutcomePanel({
  plan,
  geo,
  led,
  tone,
  play,
  screens,
  appId,
  columns,
  changed,
  expected,
  weaker,
  note,
  onNote,
  onOpenRule,
  onOpenPolicy,
}: {
  plan: EngineRun
  geo: Geo
  led: LedState
  tone: Tone
  play: boolean
  screens: SignInScreens[]
  appId: string | null
  columns: ColumnView[]
  changed: string | null
  expected: AccessDecision | null
  weaker: string | null
  /** Which of its own notes is open: 'see', 'findings', or neither. */
  note: string | null
  onNote: (id: string, from: HTMLElement) => void
  onOpenRule: (policyId: string, ruleId: string) => void
  onOpenPolicy: (policyId: string) => void
}) {
  const g = geo.out
  const o = plan.outcome
  const lit = led === 'lit'
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides'
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const where = landing ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1}`) : ''
  const by = o.policyName ? `${o.policyName}${where && decided ? ` · ${where.replace(/ /g, ' ')}` : ''}` : ''
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
  const mark = expectMark(decided, expected, weaker)
  const was = columns.length > 1 ? columns[0] : null
  const now = columns.length > 1 ? columns[columns.length - 1] : null
  const versus = was && now && answerWords(was) !== answerWords(now) ? { was, now } : null
  const see = screens.length > 0 && appId !== null
  const findings = (plan.conflicts?.findings ?? []).filter((f) => f.kind !== 'off-no-change' && f.kind !== 'also-matches')
  const item = {
    out: { opacity: 0 },
    in: { opacity: 1, transition: { duration: play ? 0.28 : 0, ease: EASE_OUT } },
  }
  const ledTone = lit ? tone : led === 'charging' ? 'work' : 'dark'
  return (
    <div
      className={`rl-circuit__out is-${led}${lit ? ` is-tone-${tone}` : ''}`}
      data-card
      data-node="outcome"
      role="group"
      aria-label={lit ? `Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ''}` : 'Outcome'}
      style={{ left: g.x, top: g.top, width: g.w }}
    >
      <span className="rl-circuit__outpad" style={{ top: g.pad[1] - g.top - 5 }} aria-hidden />
      <div className="rl-circuit__verdict">
        <svg className={`rl-circuit__led is-${ledTone}`} width="40" height="40" viewBox="0 0 40 40" aria-hidden>
          <circle className="rl-circuit__ledring" cx="20" cy="20" r="17" />
          {(lit || led === 'charging') && (
            <motion.circle
              className="rl-circuit__ledhalo"
              cx="20"
              cy="20"
              initial={play ? { r: 11, opacity: 0.6 } : false}
              animate={led === 'charging' && play ? { r: [11, 18, 11], opacity: [0.5, 0.15, 0.5] } : { r: 18, opacity: lit ? 0.22 : 0.3 }}
              transition={led === 'charging' && play ? { duration: 0.8, repeat: Infinity } : { duration: play ? 0.7 : 0, ease: EASE_OUT }}
            />
          )}
          <motion.circle className="rl-circuit__ledcore" cx="20" cy="20" initial={false} animate={{ r: lit ? 9 : 6 }} transition={{ type: 'spring', stiffness: 380, damping: 18, duration: play ? undefined : 0 }} />
        </svg>
        <span className="rl-circuit__verdictword">{lit ? word : led === 'charging' ? 'Reaching the outcome' : 'Outcome'}</span>
      </div>
      {lit && (
        <motion.div className="rl-circuit__outbody" initial={play ? 'out' : false} animate="in" variants={{ out: {}, in: { transition: play ? { staggerChildren: 0.08, delayChildren: 0.12 } : {} } }}>
          {(mark === 'fails' || mark === 'weaker') && (
            <motion.p className="rl-circuit__expect" variants={item}>
              <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
              {mark === 'fails' && expected ? `Expected ${DECISION_WORDS[expected]}` : 'Weaker factor'}
            </motion.p>
          )}
          {by && (
            <motion.p className="rl-circuit__by" variants={item}>
              <span className="rl-circuit__bylabel">{decided ? 'Decided by' : 'Policy'}</span>
              <button type="button" className="rl-circuit__bylink" onClick={open} title={`Open ${where && decided ? `${where} of ` : ''}${o.policyName ?? 'the policy'}`}>
                <span>
                  {o.policyName}
                  <span className="rl-circuit__bytail">
                    {where && decided ? ` · ${where}` : ''}
                    <ArrowUpRight className="rl-circuit__byicon" size={12} strokeWidth={2.2} aria-hidden />
                  </span>
                </span>
              </button>
            </motion.p>
          )}
          {factors.length > 0 && !deny && (
            <motion.ol className="rl-circuit__factors" variants={item} aria-label="Asked for">
              {factors.map((st, i) => (
                <li key={`${st.kind}:${i}`}>
                  {i > 0 && <ChevronRight size={12} strokeWidth={2.2} aria-hidden className="rl-circuit__factorto" />}
                  <span className="rl-circuit__factor">{stepLabel(st)}</span>
                </li>
              ))}
            </motion.ol>
          )}
          {deny && deny.kind === 'deny' && (
            <motion.p className="rl-circuit__deny" variants={item}>
              “{deny.message}”
            </motion.p>
          )}
          {o.status === 'depends' && o.view.outcomes.length > 0 && (
            <motion.ul className="rl-circuit__ifs" variants={item}>
              {o.view.outcomes.map((x) => (
                <li key={`${x.label}:${x.decision}`}>
                  <span>{x.label}</span>
                  <strong className={`is-${x.decision}`}>{DECISION_WORDS[x.decision]}</strong>
                </li>
              ))}
            </motion.ul>
          )}
          {o.status === 'depends' && o.view.needs.length > 0 && (
            <motion.p className="rl-circuit__needs" variants={item}>
              <CircleHelp size={12} strokeWidth={2.2} aria-hidden />
              Needs {o.view.needs.join(', ').toLowerCase()}
            </motion.p>
          )}
          {versus && (
            <motion.p className="rl-circuit__vs" variants={item}>
              {versus.was.label} {answerWords(versus.was)}
              <ArrowRight size={12} strokeWidth={2} aria-hidden />
              {versus.now.label} {answerWords(versus.now)}
            </motion.p>
          )}
          {(changed || count || see) && (
            <motion.div className="rl-circuit__outfoot" variants={item}>
              {count && (
                <button type="button" className={`rl-circuit__finding${count.conflict ? ' is-conflict' : ''}`} aria-expanded={note === 'findings'} onClick={(e) => onNote('findings', e.currentTarget)}>
                  {count.conflict ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
                  {count.text}
                </button>
              )}
              {changed && <span className="rl-circuit__changed">Changed by {changed}</span>}
              {see && (
                <button type="button" className="rl-circuit__seebtn" aria-expanded={note === 'see'} onClick={(e) => onNote('see', e.currentTarget)}>
                  What they see
                  {note === 'see' ? <ChevronDown size={13} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={13} strokeWidth={2.2} aria-hidden />}
                </button>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
      {lit && note === 'findings' && findings.length > 0 && (
        <div className="rl-circuit__note is-below is-wide" role="note" data-card>
          {findings.map((f) => (
            <div key={`${f.kind}:${f.target.policyId}:${f.target.ruleId ?? ''}`} className="rl-circuit__finditem">
              <NoteLines lines={[f.line || f.title, f.why]} fix={f.fix ? `${f.fix}${f.caution ? `. ${f.caution}` : ''}` : undefined} />
            </div>
          ))}
        </div>
      )}
      {lit && note === 'see' && see && (
        <div className="rl-circuit__see" data-card>
          <WhatTheySee screens={screens} appId={appId} compact collapsible={false} />
        </div>
      )}
    </div>
  )
}
