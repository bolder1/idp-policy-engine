import { motion } from 'motion/react'
import { ArrowRight, ArrowUpRight, ChevronRight, CircleHelp, Info, Shield, TriangleAlert } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import type { ColumnView } from '../../board/try-sign-in'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { answerWords } from '../../testing/sign-in-sentence'
import { WhatTheySee } from '../../testing/WhatTheySee'
import { askOf, policyPhase, type EngineRun } from '../engine-run'
import { expectMark, heroFinding, isQuiet } from '../journey'
import { Spinner } from '../PolicyStack'
import type { CheckRef, Tone } from './bento-model'
import { Skel } from './bento-parts'
import { EASE, verdictOf } from './bento-words'
import type { Size } from './bento-who-policy'

/* -----------------------------------------------------------------------------
   The hero tile (BentoLayout.tsx): the verdict, large, in its colour — who
   signed in to what, the policy and rule that decided it (the way into that
   rule), the check that settled it, what they were asked for. Its phrases are
   where the other tiles link to: hovering a tile lights its phrase here.
   And What they see: the compact sign-in page, playing its steps.
   -------------------------------------------------------------------------- */


export interface HeroProps {
  size: Size
  plan: EngineRun
  s: number
  landed: boolean
  working: boolean
  tone: Tone
  animate: boolean
  personName: string
  personId: string | null
  appId: string | null
  appName: string
  facts: { key: string; text: string; unset: boolean; changed?: boolean }[]
  checks: CheckRef[]
  screens: SignInScreens[]
  columns: ColumnView[]
  changed: string | null
  expected: AccessDecision | null
  weaker: string | null
  hasConflictTile: boolean
  /** No who tile on the board (a short canvas): the hero's line is the sign-in node and says how they got in. */
  whoNode?: boolean
  via?: string | null
  onOpenRule: (policyId: string, ruleId: string) => void
  onOpenPolicy: (policyId: string) => void
  onFinding: () => void
}


export function HeroBody(p: HeroProps) {
  const { plan, s, landed } = p
  const o = plan.outcome
  const { decided, word, Icon } = verdictOf(plan)
  const decider = plan.policies.find((x) => x.decides)
  const policyOn = landed || (decider ? policyPhase(decider, s) === 'settled' : false)
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const ruleOn = landed || (landing ? landing.endAt >= 0 && s > landing.endAt : false)
  /* A run that can't be told has no deciding rule: only the policy is named. */
  const where = landing && o.status === 'decided' ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1}`) : ''
  const ruleName = landing && landing.index !== null ? landing.name : ''
  const open = () => {
    if (!o.policyId) return
    if (landing && landing.index !== null) p.onOpenRule(o.policyId, landing.id)
    else p.onOpenPolicy(o.policyId)
  }
  const screen = decided ? (p.screens.find((x) => x.decision === decided) ?? p.screens[0]) : undefined
  const steps = screen?.steps ?? []
  const deny = steps.find((x) => x.kind === 'deny')
  const factors = steps.filter((x) => x.kind !== 'deny')
  /* The answer's one strip; a Depends says what it needs in its own line, with Add in the checks. */
  const hero0 = landed ? heroFinding(plan) : null
  const hero = hero0 && !(hero0.tone === 'depends' && o.status === 'depends') ? hero0 : null
  const mark = landed ? expectMark(decided, p.expected, p.weaker) : null
  const was = p.columns.length > 1 ? p.columns[0] : null
  const now = p.columns.length > 1 ? p.columns[p.columns.length - 1] : null
  const versus = landed && was && now && answerWords(was) !== answerWords(now) ? { was, now } : null
  /* The check that settled it, in the sign-in's words. */
  /* Where nothing matched, the failure that mattered: a condition a rule's groups let them reach, before a group that left them out. */
  const dc = p.checks.length === 0 ? null : landing && landing.index === null ? (p.checks.find((c) => plan.rules[c.rule]?.checks[c.check]?.category !== 'who') ?? p.checks[0]) : p.checks[p.checks.length - 1]
  const dRow = dc ? plan.rules[dc.rule]?.checks[dc.check] : undefined
  const because = landed && dRow && o.status === 'decided' ? dRow.line || dRow.say : ''
  const item = { out: { opacity: 0, y: 6 }, in: { opacity: 1, y: 0, transition: { duration: p.animate ? 0.3 : 0, ease: EASE } } }

  if (p.size === 'mini') {
    return (
      <div className="rl-bento__mini is-hero">
        <span className={`rl-bento__vtile is-small is-${landed ? p.tone : 'neutral'}`} aria-hidden>
          {landed ? <Icon size={15} strokeWidth={2.2} /> : <Spinner small />}
        </span>
        <span className="rl-bento__minitext">
          <strong className={`rl-bento__minivword is-${landed ? p.tone : 'neutral'}`}>{landed ? word : 'Deciding'}</strong>
          {landed && o.policyName && <span className="rl-bento__ell">{o.policyName}{where ? ` · ${where}` : ''}</span>}
        </span>
      </div>
    )
  }

  return (
    <div className="rl-bento__hero">
      <p className="rl-bento__journey" data-node={p.whoNode ? 'sign-in' : undefined}>
        {p.personId && <Face kind="user" name={p.personName} size="sm" decorative />}
        <span className="rl-bento__ell" data-link="who">{p.personName}</span>
        <ArrowRight size={14} strokeWidth={2} aria-hidden className="rl-bento__arrow" />
        {p.appId && <AppLogo appId={p.appId} name={p.appName} size={16} />}
        <span className="rl-bento__ell">{p.appName}</span>
        {p.via && <span className="rl-bento__fact-chip is-via">via {p.via}</span>}
        {p.facts.length > 0 && (
          <span className="rl-bento__facts" data-link="change">
            {p.facts.map((f) => (
              <span key={f.key} className={`rl-bento__fact-chip${f.unset ? ' is-unset' : ''}${f.changed ? ' is-changed' : ''}`}>{f.text}</span>
            ))}
          </span>
        )}
      </p>

      <div className="rl-bento__verdict">
        {landed ? (
          <motion.span
            key="landed"
            className={`rl-bento__vtile is-${p.tone}`}
            aria-hidden
            initial={p.animate ? { scale: 0.4, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={p.animate ? { type: 'spring', stiffness: 380, damping: 19, mass: 0.8, delay: 0.08 } : { duration: 0 }}
          >
            <Icon size={26} strokeWidth={2} />
          </motion.span>
        ) : (
          <span className={`rl-bento__vtile is-wait${p.working ? ' is-working' : ''}`} aria-hidden>
            {p.working ? <Spinner /> : <Shield size={22} strokeWidth={1.8} />}
          </span>
        )}
        {landed ? (
          <motion.span
            key={`w:${word}`}
            className={`rl-bento__vword is-${p.tone}`}
            data-link="hero"
            initial={p.animate ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: p.animate ? 0.4 : 0, ease: EASE, delay: p.animate ? 0.12 : 0 }}
          >
            {word}
          </motion.span>
        ) : (
          <span className="rl-bento__vwait">
            <span className={`rl-bento__vhint${p.working ? ' is-working' : ''}`}>{p.working ? 'Deciding' : 'The answer lands here'}</span>
            <Skel w="58%" h={22} />
          </span>
        )}
        {mark && (
          <span className="rl-bento__expect" title={mark === 'weaker' ? p.weaker || undefined : undefined}>
            <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />
            {mark === 'weaker' ? 'Weaker factor' : `Expected ${p.expected ? DECISION_WORDS[p.expected] : ''}`}
          </span>
        )}
      </div>

      <div className="rl-bento__by">
        <span className="rl-bento__klabel">{decided || o.status !== 'depends' ? 'Decided by' : 'Policy'}</span>
        {policyOn && o.policyName ? (
          <button type="button" className="rl-bento__bylink" title={`Open ${where && ruleOn ? `${where.toLowerCase()} of ` : ''}${o.policyName}`} onClick={open}>
            <span data-link="policy">{o.policyName}</span>
            {ruleOn && where && (
              <>
                <span className="rl-bento__dot" aria-hidden>·</span>
                <span data-link="rule">{where}</span>
              </>
            )}
            <ArrowUpRight size={14} strokeWidth={2.2} aria-hidden />
          </button>
        ) : (
          <Skel w="64%" h={14} />
        )}
        {ruleOn && ruleName && decided && <span className="rl-bento__byrule">{ruleName}</span>}
      </div>

      {landed && (
        <motion.div className="rl-bento__heroafter" initial={p.animate ? 'out' : false} animate="in" variants={{ out: {}, in: { transition: p.animate ? { staggerChildren: 0.08, delayChildren: 0.28 } : {} } }}>
          {because && (
            <motion.p className="rl-bento__because" variants={item} data-link="checks">
              <span className="rl-bento__klabel">Because</span>
              {because}
            </motion.p>
          )}
          {factors.length > 0 && !deny && (
            <motion.div className="rl-bento__asked" variants={item} data-link="see">
              <span className="rl-bento__klabel">Asked for</span>
              <ol className="rl-bento__factors">
                {factors.map((x, i) => (
                  <li key={`${x.kind}:${i}`}>
                    {i > 0 && <ChevronRight size={13} strokeWidth={2.2} aria-hidden className="rl-bento__arrow" />}
                    <span className="rl-bento__factor">{stepLabel(x)}</span>
                  </li>
                ))}
              </ol>
            </motion.div>
          )}
          {deny && deny.kind === 'deny' && (
            <motion.p className="rl-bento__deny" variants={item} data-link="see" title={deny.message}>
              “{deny.message}”
            </motion.p>
          )}
          {o.status === 'depends' && (
            <motion.div className="rl-bento__ifs" variants={item}>
              {o.view.needs.length > 0 && (
                <p className="rl-bento__needsline">
                  <CircleHelp size={13} strokeWidth={2.2} aria-hidden />
                  Needs the {o.view.needs.join(' and the ').toLowerCase()}
                </p>
              )}
              <ul>
                {o.view.outcomes.map((x) => (
                  <li key={`${x.label}:${x.decision}`}>
                    <span>{x.label}</span>
                    <strong className={`is-${x.decision === 'deny' ? 'negative' : 'positive'}`}>{DECISION_WORDS[x.decision]}</strong>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
          {versus && (
            <motion.p className="rl-bento__versus" variants={item}>
              {versus.was.label} {answerWords(versus.was)}
              <ArrowRight size={13} strokeWidth={2} aria-hidden />
              {versus.now.label} {answerWords(versus.now)}
            </motion.p>
          )}
          {p.changed && (
            <motion.p className="rl-bento__versus" variants={item}>
              Changed by {p.changed}
            </motion.p>
          )}
          {hero && (
            <motion.div variants={item}>
              <button type="button" className={`rl-bento__finding is-${hero.tone}`} data-link="conflict" onClick={p.onFinding} disabled={!p.hasConflictTile && hero.tone !== 'depends'}>
                {hero.tone === 'info' ? <Info size={13} strokeWidth={2.2} aria-hidden /> : <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />}
                <span>{hero.text}</span>
              </button>
            </motion.div>
          )}
          {p.size === 'open' && <Findings plan={plan} />}
        </motion.div>
      )}
    </div>
  )
}

function Findings({ plan }: { plan: EngineRun }) {
  const all = plan.conflicts?.findings ?? []
  if (all.length === 0) return null
  const loud = all.filter((f) => !isQuiet(f))
  const quiet = all.filter((f) => isQuiet(f))
  return (
    <div className="rl-bento__detail">
      <h4 className="rl-bento__sub">Worth knowing</h4>
      <ul className="rl-bento__list">
        {[...loud, ...quiet].map((f, i) => (
          <li key={`${f.kind}:${i}`} className={`rl-bento__note${f.tone === 'conflict' ? ' is-conflict' : ''}`}>
            <strong>{f.title}</strong>
            {f.why && <span>{f.why}</span>}
            {f.fix && <span className="rl-bento__fix">{f.fix}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// --- What they see -----------------------------------------------------------------------

export function SeeBody({ size, landed, screens, appId, plan, wide }: { size: Size; landed: boolean; screens: SignInScreens[]; appId: string | null; plan: EngineRun; wide: boolean }) {
  const o = plan.outcome
  const decided = o.status === 'decided' ? o.decision : null
  if (size === 'mini') {
    return (
      <div className="rl-bento__mini">
        <span className="rl-bento__ell">{landed ? askOf(screens, decided) || 'The sign-in page' : 'Waiting for the answer'}</span>
      </div>
    )
  }
  if (!landed || !appId || screens.length === 0) {
    return (
      <div className="rl-bento__seewait" aria-hidden>
        <span className="rl-bento__seebar">
          <i />
          <i />
          <i />
        </span>
        <Skel w="46%" />
        <Skel w="70%" h={28} />
        <Skel w="70%" h={28} />
      </div>
    )
  }
  return (
    <div className={`rl-bento__see${wide ? ' is-wide' : ''}${size === 'open' ? ' is-open' : ''}`} data-link="see">
      <WhatTheySee screens={screens} appId={appId} compact={size !== 'open'} collapsible={false} title="" />
    </div>
  )
}
