import { motion } from 'motion/react'
import { ArrowRight, ArrowUpRight, Ban, ChevronDown, ChevronRight, CircleHelp, Info, KeyRound, ShieldCheck, Split, TriangleAlert, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { answerWords, sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../../testing/sign-in-sentence'
import { expectMark, findingsCount } from '../journey'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import type { RunLayoutProps } from './types'
import type { Tone } from './pulse-words'

/* -----------------------------------------------------------------------------
   Pulse's two ends (PulseLayout.tsx): the sign-in the trace leaves from, and
   the answer it runs into — the biggest card on the line: the verdict, who
   decided (the way to that rule), the factors asked for or the message they
   are refused with, and What they see on demand.
   -------------------------------------------------------------------------- */

const SHORT: Partial<Record<TokenId, string>> = { from: 'From', device: 'Device', when: 'When', risk: 'Risk' }

export function SignInEnd({ props, landed }: { props: RunLayoutProps; landed: boolean }) {
  const { form, rows, asGroup, onPressPerson } = props
  const { users, groups, apps, zones } = useBrand()
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const groupLine = asGroup ? `A member of ${asGroup}` : person ? groupNamesOf(person, groups).join(', ') : ''
  const ctx: SentenceContext = { people: users, apps, zones, rows }
  const facts = sentenceTokens(rows)
    .filter((t) => t !== 'person' && t !== 'app')
    .map((t) => tokenValue(t, form, ctx))
  const depends = props.plan.outcome.status === 'depends' && landed
  return (
    <button type="button" className="rl-pulse__card rl-pulse__sign" data-card data-node="sign-in" onClick={onPressPerson} title="Change the sign-in">
      <span className="rl-pulse__signhead">
        {person && <Face kind="user" name={person.name} size="md" decorative />}
        <span className="rl-pulse__signwho">
          <strong>{person?.name ?? 'Choose a person'}</strong>
          {groupLine && <span>{groupLine}</span>}
        </span>
      </span>
      <span className="rl-pulse__signapp">
        <ArrowRight className="rl-pulse__signto" size={13} strokeWidth={2} aria-hidden />
        {app && <AppLogo appId={app.id} name={app.name} size={16} />}
        <span>{app?.name ?? 'Choose an application'}</span>
      </span>
      {facts.length > 0 && (
        <span className="rl-pulse__facts">
          {facts.map((v) => (
            <span key={v.token} className={`rl-pulse__sfact${v.unset ? ` is-unset${depends ? ' is-needed' : ''}` : ''}`}>
              <span className="rl-pulse__sflabel">{SHORT[v.token] ?? v.label}</span>
              <span className="rl-pulse__sfmark" aria-hidden>
                <ValueMark v={v} size={12} />
              </span>
              <span className="rl-pulse__sftext">{v.unset ? 'Not stated' : v.text}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

const DECISION_ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }
const EASE_OUT = [0.2, 0, 0, 1] as const

export function OutcomeEnd({
  props,
  tone,
  animate,
  open,
  onOpen,
  focus,
  onPick,
  delay = 0,
}: {
  props: RunLayoutProps
  tone: Tone
  animate: boolean
  /** It lands as the line reaches it (s). */
  delay?: number
  /** Which of its parts is open: What they see, or the findings. */
  open: 'see' | 'findings' | null
  onOpen: (what: 'see' | 'findings') => void
  focus: boolean
  onPick: () => void
}) {
  const { plan, screens, form, changed, expected, weaker, columns, onOpenRule, onOpenPolicy } = props
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? DECISION_ICON[decided] : Split
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides'
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const where = landing ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1}`) : ''
  const by = o.policyName ? `${o.policyName}${where && decided ? ` · ${where}` : ''}` : ''
  const openRule = () => {
    if (!o.policyId) return
    if (decided && landing && landing.index !== null) onOpenRule(o.policyId, landing.id)
    else onOpenPolicy(o.policyId)
  }
  const screen: SignInScreens | undefined = decided ? (screens.find((sc) => sc.decision === decided) ?? screens[0]) : undefined
  const steps = screen?.steps ?? []
  const deny = steps.find((st) => st.kind === 'deny')
  const factors = steps.filter((st) => st.kind !== 'deny')
  const count = findingsCount(plan)
  const mark = expectMark(decided, expected, weaker)
  const was = columns.length > 1 ? columns[0] : null
  const now = columns.length > 1 ? columns[columns.length - 1] : null
  const versus = was && now && answerWords(was) !== answerWords(now) ? { was, now } : null
  const see = screens.length > 0 && form.appId !== null
  const line = { out: { opacity: 0 }, in: { opacity: 1, transition: { duration: animate ? 0.24 : 0, ease: EASE_OUT } } }
  return (
    <motion.div
      className={`rl-pulse__card rl-pulse__out is-${tone}${focus ? ' is-focus' : ''}`}
      data-card
      data-node="outcome"
      role="group"
      aria-label={`Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ''}`}
      onClick={onPick}
      initial={animate ? { opacity: 0, x: -14 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={animate ? { type: 'spring', stiffness: 420, damping: 34, mass: 0.8, delay } : { duration: 0 }}
    >
      <motion.div className="rl-pulse__outin" initial={animate ? 'out' : false} animate="in" variants={{ out: {}, in: { transition: animate ? { staggerChildren: 0.07, delayChildren: 0.1 + delay } : {} } }}>
        <span className="rl-pulse__verdict">
          <span className="rl-pulse__tile" aria-hidden>
            <Icon size={18} strokeWidth={2} />
          </span>
          <span className="rl-pulse__word">{word}</span>
          {mark === 'fails' && expected && (
            <span className="rl-pulse__expect" title={`This sign-in expects ${DECISION_WORDS[expected]}`}>
              <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
              Expected {DECISION_WORDS[expected]}
            </span>
          )}
          {mark === 'weaker' && (
            <span className="rl-pulse__expect" title={weaker || undefined}>
              <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
              Weaker factor
            </span>
          )}
        </span>
        {by && (
          <motion.p className="rl-pulse__by" variants={line}>
            <span className="rl-pulse__bylabel">{decided ? 'Decided by' : 'Policy'}</span>
            <button type="button" className="rl-pulse__bylink" title={`Open ${where && decided ? `${where} of ` : ''}${o.policyName ?? 'the policy'}`} onClick={openRule}>
              <span>{by}</span>
              <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
            </button>
          </motion.p>
        )}
        {factors.length > 0 && !deny && (
          <motion.ol className="rl-pulse__factors" variants={line} aria-label="Asked for">
            {factors.map((st, i) => (
              <li key={`${st.kind}:${i}`}>
                {i > 0 && <ChevronRight className="rl-pulse__farrow" size={12} strokeWidth={2.2} aria-hidden />}
                <span className="rl-pulse__factor">{stepLabel(st)}</span>
              </li>
            ))}
          </motion.ol>
        )}
        {deny && deny.kind === 'deny' && (
          <motion.p className="rl-pulse__deny" variants={line} title={deny.message}>
            “{deny.message}”
          </motion.p>
        )}
        {o.status === 'depends' && o.view.outcomes.length > 0 && (
          <motion.ul className="rl-pulse__ifs" variants={line}>
            {o.view.outcomes.map((x) => (
              <li key={`${x.label}:${x.decision}`}>
                <span className="rl-pulse__if">{x.label}</span>
                <span className="rl-pulse__ifword">{DECISION_WORDS[x.decision]}</span>
              </li>
            ))}
          </motion.ul>
        )}
        {o.status === 'depends' && o.view.needs.length > 0 && (
          <motion.p className="rl-pulse__needs" variants={line}>
            <CircleHelp size={12} strokeWidth={2.2} aria-hidden />
            Needs {o.view.needs.join(', ').toLowerCase()}
          </motion.p>
        )}
        {versus && (
          <motion.p className="rl-pulse__vs" variants={line}>
            {versus.was.label} {answerWords(versus.was)}
            <ArrowRight size={12} strokeWidth={2} aria-hidden />
            {versus.now.label} {answerWords(versus.now)}
          </motion.p>
        )}
        {(changed || count || see) && (
          <motion.p className="rl-pulse__foot" variants={line}>
            {count && (
              <button type="button" className={`rl-pulse__finding${count.conflict ? ' is-conflict' : ''}${open === 'findings' ? ' is-open' : ''}`} aria-expanded={open === 'findings'} onClick={() => onOpen('findings')}>
                {count.conflict ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
                {count.text}
              </button>
            )}
            {changed && <span className="rl-pulse__changed">Changed by {changed}</span>}
            {see && (
              <button type="button" className={`rl-pulse__seebtn${open === 'see' ? ' is-open' : ''}`} aria-expanded={open === 'see'} onClick={() => onOpen('see')}>
                What they see
                {open === 'see' ? <ChevronDown size={13} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={13} strokeWidth={2.2} aria-hidden />}
              </button>
            )}
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  )
}
