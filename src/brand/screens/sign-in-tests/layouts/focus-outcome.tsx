import { motion } from 'motion/react'
import { useContext, useState } from 'react'
import { ArrowRight, ArrowUpRight, Ban, ChevronDown, ChevronRight, CircleHelp, Info, KeyRound, ShieldCheck, Split, TriangleAlert, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { answerWords } from '../../testing/sign-in-sentence'
import { WhatTheySee } from '../../testing/WhatTheySee'
import { expectMark, findingsCount, heroFinding, isQuiet } from '../journey'
import { Spinner } from '../PolicyStack'
import type { RunLayoutProps } from './types'
import type { Tone } from './focus-model'
import { EASE_OUT, LitCtx } from './focus-shared'

/* The last moment of Focus (FocusLayout.tsx): the answer, whole, and read at
   a glance — who signed in to what, the verdict in its colour, the policy
   and rule that decided it (the way into that rule), the factors asked for
   or the message refused with, what is worth knowing, and What they see as
   the small browser, right in the card. Before it is reached it waits at the
   end of the row as the place the run is going. */

const DECISION_ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }

export function OutcomeGhost({ deciding }: { deciding: boolean }) {
  return (
    <div className={`rl-focus__card is-outcome is-ghost${deciding ? ' is-working' : ''}`} data-card data-node="outcome" aria-label="Outcome">
      <header className="rl-focus__head">
        <span className={`rl-focus__tile${deciding ? ' is-working' : ''}`}>{deciding ? <Spinner small /> : <Split size={18} strokeWidth={2} aria-hidden />}</span>
        <span className="rl-focus__heading">
          <span className="rl-focus__kicker">Outcome</span>
          <h3 className="rl-focus__title is-quiet">{deciding ? 'Deciding' : 'Not decided yet'}</h3>
        </span>
      </header>
      <span className="tj-skel is-line rl-focus__ghostline" />
      <span className="tj-skel is-short rl-focus__ghostline" />
    </div>
  )
}

export function OutcomeMoment({ props, tone, animate, inert }: { props: RunLayoutProps; tone: Tone; animate: boolean; inert: boolean }) {
  const { plan, screens, form, changed, expected, weaker, columns, onOpenRule, onOpenPolicy, asGroup, breakIn, onReviewBreakIn } = props
  const { users, apps } = useBrand()
  const [findingsOpen, setFindingsOpen] = useState(false)
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? DECISION_ICON[decided] : Split
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides'
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const where = landing ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1}`) : ''
  const by = o.policyName ? `${o.policyName}${where && decided ? ` · ${where}` : ''}` : ''
  const ruleName = decided && landing && landing.index !== null ? landing.name : ''
  const open = () => {
    if (!o.policyId) return
    if (decided && landing && landing.index !== null) onOpenRule(o.policyId, landing.id)
    else onOpenPolicy(o.policyId)
  }
  const screen: SignInScreens | undefined = decided ? (screens.find((sc) => sc.decision === decided) ?? screens[0]) : undefined
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
  const tab = inert ? -1 : undefined
  const lit = useContext(LitCtx)
  const line = {
    out: { opacity: 0, y: 4 },
    in: { opacity: 1, y: 0, transition: { duration: animate ? 0.26 : 0, ease: EASE_OUT } },
  }
  return (
    <div className={`rl-focus__card is-outcome is-landed is-${tone}${lit === 'outcome' ? ' is-lit' : ''}`} data-card data-node="outcome" role="group" aria-label={`Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ''}`}>
      <div className={see ? 'rl-focus__outgrid' : undefined}>
      <motion.div className="rl-focus__outin" initial={animate ? 'out' : false} animate="in" variants={{ out: {}, in: { transition: animate ? { staggerChildren: 0.07, delayChildren: 0.12 } : {} } }}>
        <p className="rl-focus__who">
          {person && <Face kind="user" name={person.name} size="sm" decorative />}
          <span className="rl-focus__whoname">{person?.name ?? (asGroup ? `Anyone in ${asGroup}` : '')}</span>
          <ArrowRight size={13} strokeWidth={2} aria-hidden className="rl-focus__toarrow" />
          {app && <AppLogo appId={app.id} name={app.name} size={16} />}
          <span className="rl-focus__whoname">{app?.name ?? plan.appName}</span>
        </p>
        <div className="rl-focus__verdict">
          <motion.span
            className={`rl-focus__vtile is-${tone}`}
            aria-hidden
            initial={animate ? { scale: 0.4, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={animate ? { type: 'spring', stiffness: 420, damping: 20, mass: 0.7 } : { duration: 0 }}
          >
            <Icon size={22} strokeWidth={2} />
          </motion.span>
          <span className="rl-focus__vword">{word}</span>
          {mark === 'fails' && expected && (
            <span className="rl-focus__expect" title={`This sign-in expects ${DECISION_WORDS[expected]}`}>
              <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />
              Expected {DECISION_WORDS[expected]}
            </span>
          )}
          {mark === 'weaker' && (
            <span className="rl-focus__expect" title={weaker || undefined}>
              <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />
              Weaker factor
            </span>
          )}
        </div>
        {by && (
          <motion.div className="rl-focus__by" variants={line}>
            <span className="rl-focus__label">{decided ? 'Decided by' : 'Policy'}</span>
            <button type="button" className="rl-focus__bylink" tabIndex={tab} title={`Open ${where && decided ? `${where} of ` : ''}${o.policyName ?? 'the policy'}`} onClick={open}>
              <span>{by}</span>
              <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
            </button>
            {ruleName && <span className="rl-focus__byrule">{ruleName}</span>}
          </motion.div>
        )}
        {factors.length > 0 && !deny && (
          <motion.div className="rl-focus__asked" variants={line}>
            <span className="rl-focus__label">Asked for</span>
            <ol className="rl-focus__factors">
              {factors.map((st, i) => (
                <li key={`${st.kind}:${i}`}>
                  {i > 0 && <ChevronRight className="rl-focus__factorarrow" size={13} strokeWidth={2.2} aria-hidden />}
                  <span className="rl-focus__factor">{stepLabel(st)}</span>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
        {deny && deny.kind === 'deny' && (
          <motion.p className="rl-focus__deny" variants={line} title={deny.message}>
            “{deny.message}”
          </motion.p>
        )}
        {o.status === 'depends' && o.view.outcomes.length > 0 && (
          <motion.ul className="rl-focus__ifs" variants={line}>
            {o.view.outcomes.map((x) => (
              <li key={`${x.label}:${x.decision}`}>
                <span className="rl-focus__if">{x.label}</span>
                <span className="rl-focus__ifword">{DECISION_WORDS[x.decision]}</span>
              </li>
            ))}
          </motion.ul>
        )}
        {o.status === 'depends' && o.view.needs.length > 0 && (
          <motion.p className="rl-focus__needs" variants={line}>
            <CircleHelp size={13} strokeWidth={2.2} aria-hidden />
            Needs {o.view.needs.join(', ').toLowerCase()}
          </motion.p>
        )}
        {versus && (
          <motion.p className="rl-focus__vs" variants={line}>
            {versus.was.label} {answerWords(versus.was)}
            <ArrowRight size={13} strokeWidth={2} aria-hidden />
            {versus.now.label} {answerWords(versus.now)}
          </motion.p>
        )}
        {changed && (
          <motion.p className="rl-focus__changed" variants={line}>
            Changed by {changed}
          </motion.p>
        )}
        {count && (
          <motion.div className={`rl-focus__finding${count.conflict ? ' is-conflict' : ''}`} variants={line}>
            <button type="button" className="rl-focus__findbtn" tabIndex={tab} aria-expanded={findingsOpen} onClick={() => setFindingsOpen((v) => !v)}>
              {count.conflict ? <TriangleAlert size={13} strokeWidth={2.2} aria-hidden /> : <Info size={13} strokeWidth={2.2} aria-hidden />}
              <span className="rl-focus__findtext">{hero?.text || count.text}</span>
              {findingsOpen ? <ChevronDown size={14} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={14} strokeWidth={2.2} aria-hidden />}
            </button>
            {findingsOpen && (
              <ul className="rl-focus__flist">
                {findings.map((f, i) => (
                  <li key={`${f.kind}:${i}`} className={f.tone === 'conflict' ? 'is-conflict' : undefined}>
                    <span className="rl-focus__fhead">{f.title}</span>
                    {f.line && f.line !== f.title && f.line !== hero?.text && <span className="rl-focus__fline">{f.line}</span>}
                    {f.fix && <span className="rl-focus__notefix">{f.fix}</span>}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
        {breakIn && onReviewBreakIn && (
          <motion.p className="rl-focus__attempts" variants={line}>
            <button type="button" className="rl-focus__quietlink" tabIndex={tab} onClick={() => onReviewBreakIn('outcome')}>
              Break-in attempts
              <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
            </button>
          </motion.p>
        )}
      </motion.div>
      {see && (
        <motion.div className={`rl-focus__see${lit === 'screens' ? ' is-lit' : ''}`} data-node-see initial={animate ? { opacity: 0, x: 12 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: animate ? 0.32 : 0, delay: animate ? 0.3 : 0, ease: EASE_OUT }}>
          <WhatTheySee screens={screens} appId={form.appId} compact collapsible={false} />
        </motion.div>
      )}
      </div>
    </div>
  )
}
