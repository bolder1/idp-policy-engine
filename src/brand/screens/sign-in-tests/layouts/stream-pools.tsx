import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, Ban, ChevronRight, CircleHelp, Info, KeyRound, Plus, ShieldCheck, Split, TriangleAlert, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { answerWords } from '../../testing/sign-in-sentence'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { EngineRun } from '../engine-run'
import { expectMark, findingsCount, isQuiet } from '../journey'
import { Spinner } from '../PolicyStack'
import type { RunLayoutProps } from './types'
import { G, type PoolSlot } from './stream-geometry'
import type { Tone } from './stream-model'
import { FactNeed, NoteLines, Peek } from './stream-parts'
import { EASE_OUT } from './stream-parts-utils'

/* -----------------------------------------------------------------------------
   The POOLS (StreamLayout.tsx): the three outcomes a sign-in can get. The
   one the stream reaches FILLS — the answer, whole: the verdict, who decided
   it, what the person is asked for (or refused with), What they see. The
   others stay empty and quiet; a press on one says what it would take to
   land there. A Depends stands its own card on the line, the pools it could
   fill under it.
   -------------------------------------------------------------------------- */

const ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }

/* What it would take to land in a pool: the rules of the policy that lead there, each with what it needs. */
function wouldNote(plan: EngineRun, d: AccessDecision): ReactNode {
  const leads = plan.rules.filter((r) => r.decision === d)
  if (!plan.decider) return <NoteLines lines={['No policy decides']} />
  if (leads.length === 0) return <NoteLines lines={[`No rule in ${plan.decider.name} leads here`]} />
  return (
    <div className="rl-stream__would">
      {leads.slice(0, 4).map((r) => {
        const n = r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}`
        const failing = r.failing !== null ? r.checks[r.failing] : undefined
        const why = r.state === 'match' ? 'Matched' : r.state === 'not-reached' ? 'Not read: a rule above matched' : r.state === 'off' ? 'Switched off' : failing ? failing.line || failing.say : r.state === 'unknown' ? "Can't tell" : ''
        return (
          <div key={r.id} className="rl-stream__wouldrule">
            <p className="rl-stream__notep is-lead">
              {n}
              {r.index !== null && ` · ${r.name}`}
            </p>
            {r.index === null ? (
              <p className="rl-stream__notep">When no rule above lets the sign-in through</p>
            ) : (
              <ul className="rl-stream__parts">
                {r.checks.map((c, k) => (
                  <li key={c.key || k}>
                    <FactNeed word={c.word} fact={c.missing ? 'Not stated' : c.value} need={c.requirement} status={r.visited && k < r.checked ? c.status : undefined} />
                  </li>
                ))}
              </ul>
            )}
            {why && <p className="rl-stream__notequiet">{why}</p>}
          </div>
        )
      })}
    </div>
  )
}

export function Pool({
  slot,
  plan,
  props,
  screens,
  appId,
  landed,
  working,
  tone,
  animate,
}: {
  slot: PoolSlot
  plan: EngineRun
  props: RunLayoutProps
  screens: SignInScreens[]
  appId: string | null
  landed: boolean
  working: boolean
  tone: Tone
  animate: boolean
}) {
  const o = plan.outcome
  const style = { left: G.POOL_X, width: G.POOL_W }
  const place = { initial: false, animate: { top: slot.top, height: slot.h }, transition: { duration: animate ? 0.45 : 0, ease: [0.4, 0, 0.2, 1] } } as const
  const inlet = <span className="rl-stream__inlet" style={{ top: G.POOL_LANE - 5 }} aria-hidden />

  /* A pool off the line: empty, quiet, and what it would take. */
  if (slot.kind !== 'depends' && (!slot.chosen || !landed)) {
    const d = slot.kind as AccessDecision
    const Icon = ICON[d]
    const possible = o.status === 'depends' && o.view.outcomes.filter((x) => x.decision === d)
    const leads = plan.rules.filter((r) => r.decision === d && r.index !== null).map((r) => (r.index ?? 0) + 1)
    const sub = possible && possible.length > 0 ? possible.map((x) => x.label).join(' · ') : leads.length > 0 ? `${leads.length === 1 ? 'Rule' : 'Rules'} ${leads.join(', ')} lead${leads.length === 1 ? 's' : ''} here` : plan.rules.some((r) => r.decision === d) ? 'Nothing else matched leads here' : 'No rule leads here'
    return (
      <motion.div
        className={`rl-stream__pool is-empty${possible && possible.length > 0 ? ' is-possible' : ''}${slot.chosen && working ? ' is-working' : ''}`}
        style={style}
        {...place}
        data-node={slot.chosen ? 'outcome' : undefined}
      >
        <Peek id={`pool:${d}`} className="rl-stream__card rl-stream__poolbtn" label={`${DECISION_WORDS[d]}: what it would take`} note={landed ? wouldNote(plan, d) : null} side="left">
          <span className="rl-stream__head">
            <span className="rl-stream__tile" aria-hidden>
              {slot.chosen && working ? <Spinner small /> : <Icon size={15} strokeWidth={2} />}
            </span>
            <span className="rl-stream__name">{DECISION_WORDS[d]}</span>
          </span>
          <span className="rl-stream__sub is-pool">
            <span className="rl-stream__subtext">{landed ? sub : ''}</span>
          </span>
        </Peek>
        {inlet}
      </motion.div>
    )
  }

  /* The pool on the line: the answer. */
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? ICON[decided] : o.status === 'depends' ? Split : CircleHelp
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides'
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const where = landing ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1}`) : ''
  const by = o.policyName ?? ''
  const open = () => {
    if (!o.policyId) return
    if (decided && landing && landing.index !== null) props.onOpenRule(o.policyId, landing.id)
    else props.onOpenPolicy(o.policyId)
  }
  const screen = decided ? (screens.find((sc) => sc.decision === decided) ?? screens[0]) : undefined
  const steps = screen?.steps ?? []
  const deny = steps.find((st) => st.kind === 'deny')
  const factors = steps.filter((st) => st.kind !== 'deny')
  const count = findingsCount(plan)
  const findings = (plan.conflicts?.findings ?? []).filter((f) => !isQuiet(f))
  const mark = expectMark(decided, props.expected, props.weaker)
  const cols = props.columns
  const versus = cols.length > 1 && answerWords(cols[0]) !== answerWords(cols[cols.length - 1]) ? { was: cols[0], now: cols[cols.length - 1] } : null
  const missing = o.status === 'depends' ? plan.rules.flatMap((r) => r.checks).find((c) => c.missing)?.missing ?? null : null
  const fillTo = slot.h - G.POOL_LANE - 6
  const reveal = { initial: animate ? { opacity: 0 } : false, animate: { opacity: 1 }, transition: { duration: animate ? 0.3 : 0, delay: animate ? 0.35 : 0, ease: EASE_OUT } } as const

  if (!landed) {
    return (
      <motion.div className={`rl-stream__pool is-chosen is-pending${working ? ' is-working' : ''}`} style={style} {...place} data-node="outcome" aria-label="Outcome">
        <div className="rl-stream__card rl-stream__poolcard">
          <span className="rl-stream__head">
            <span className="rl-stream__tile" aria-hidden>
              {working ? <Spinner small /> : <Icon size={15} strokeWidth={2} />}
            </span>
            <span className="rl-stream__name is-quiet">Outcome</span>
          </span>
        </div>
        {inlet}
      </motion.div>
    )
  }

  return (
    <motion.div className={`rl-stream__pool is-chosen is-landed is-${tone}`} style={style} {...place} data-node="outcome" role="group" aria-label={`Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ''}`}>
      <div className="rl-stream__card rl-stream__poolcard" data-card>
        <motion.span
          className="rl-stream__fill"
          initial={animate ? { height: 0 } : false}
          animate={{ height: o.status === 'depends' ? fillTo * 0.45 : fillTo }}
          transition={{ duration: animate ? 1 : 0, ease: [0.3, 0, 0.2, 1] }}
          aria-hidden
        />
        <span className="rl-stream__head is-verdict">
          <span className="rl-stream__tile" aria-hidden>
            <Icon size={17} strokeWidth={2} />
          </span>
          <span className="rl-stream__word">{word}</span>
          {mark === 'fails' && props.expected && (
            <span className="rl-stream__expect" title={`This sign-in expects ${DECISION_WORDS[props.expected]}`}>
              <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
              Expected {DECISION_WORDS[props.expected]}
            </span>
          )}
          {mark === 'weaker' && (
            <span className="rl-stream__expect" title={props.weaker || undefined}>
              <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
              Weaker factor
            </span>
          )}
        </span>
        <motion.div className="rl-stream__poolbody" {...reveal}>
          {by && (
            <p className="rl-stream__by">
              <span className="rl-stream__bylabel">{decided ? 'Decided by' : 'Policy'}</span>
              <button type="button" className="rl-stream__bylink" title={`Open ${where && decided ? `${where} of ` : ''}${o.policyName ?? 'the policy'}`} onClick={open}>
                <span>{o.policyName}</span>
                <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
              </button>
              {decided && landing && (
                <span className="rl-stream__byrule" title={landing.index === null ? landing.name : `${where} · ${landing.name}`}>
                  {landing.index === null ? landing.name : `${where} · ${landing.name}`}
                </span>
              )}
            </p>
          )}
          {factors.length > 0 && !deny && (
            <ol className="rl-stream__factors" aria-label="Asked for">
              {factors.map((st, i) => (
                <li key={`${st.kind}:${i}`}>
                  {i > 0 && <ChevronRight size={12} strokeWidth={2.2} aria-hidden />}
                  <span className="rl-stream__factor">{stepLabel(st)}</span>
                </li>
              ))}
            </ol>
          )}
          {deny && deny.kind === 'deny' && (
            <p className="rl-stream__deny" title={deny.message}>
              “{deny.message}”
            </p>
          )}
          {o.status === 'depends' && <p className="rl-stream__dependsline">Each outcome it could reach is marked below</p>}
          {versus && (
            <p className="rl-stream__vs">
              {versus.was.label} {answerWords(versus.was)}
              <ArrowRight size={12} strokeWidth={2} aria-hidden />
              {versus.now.label} {answerWords(versus.now)}
            </p>
          )}
          <p className="rl-stream__foot">
            {o.status === 'depends' && o.view.needs.length > 0 && (
              missing ? (
                <button type="button" className="rl-stream__add" onClick={() => props.onAdd(missing)}>
                  <Plus size={12} strokeWidth={2.4} aria-hidden />
                  Add {o.view.needs.join(', ').toLowerCase()}
                </button>
              ) : (
                <span className="rl-stream__needs">Needs {o.view.needs.join(', ').toLowerCase()}</span>
              )
            )}
            {count && (
              <span className="rl-stream__footpeek">
                <Peek
                  id="findings"
                  hover={false}
                  className={`rl-stream__finding${count.conflict ? ' is-conflict' : ''}`}
                  label={count.text}
                  side="below-end"
                  noteClass="is-wide"
                  note={
                    <ul className="rl-stream__flist">
                      {findings.map((f, i) => (
                        <li key={`${f.kind}:${i}`} className={f.tone === 'conflict' ? 'is-conflict' : undefined}>
                          <span className="rl-stream__fhead">
                            {f.tone === 'conflict' ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
                            {f.title}
                          </span>
                          {f.line && f.line !== f.title && <span className="rl-stream__fline">{f.line}</span>}
                          {f.fix && <span className="rl-stream__notefix">{f.fix}</span>}
                        </li>
                      ))}
                    </ul>
                  }
                >
                  {count.conflict ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
                  {count.text}
                </Peek>
              </span>
            )}
            {props.changed && <span className="rl-stream__changed">Changed by {props.changed}</span>}
            {screens.length > 0 && appId && (
              <span className="rl-stream__footpeek is-end">
                <Peek id="see" hover={false} className="rl-stream__seebtn" label="What they see" side="below-end" noteClass="is-see" note={<WhatTheySee screens={screens} appId={appId} compact collapsible={false} />}>
                  What they see
                  <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
                </Peek>
              </span>
            )}
          </p>
        </motion.div>
      </div>
      {inlet}
    </motion.div>
  )
}
