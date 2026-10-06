import { AnimatePresence, motion } from 'motion/react'
import { useContext, useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, Ban, ChevronDown, ChevronRight, CircleHelp, Info, KeyRound, ShieldCheck, Split, TriangleAlert, Users, X, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { answerWords } from '../../testing/sign-in-sentence'
import { WhatTheySee } from '../../testing/WhatTheySee'
import { expectMark, findingsCount, heroFinding, isQuiet } from '../journey'
import { Spinner } from '../PolicyStack'
import type { RunLayoutProps } from './types'
import { closestMiss, type Tone } from './focus-model'
import { EASE_OUT, LitCtx } from './focus-shared'
import { DENIAL_REASONS } from '../phase'
import { DENY_REASON_WORD, denyReasonOf, denyRef } from '../deny-reason'
import { VerdictStroke } from './focus2-draw'
import { SHAKE, SHAKE_T } from './focus2-draw-model'
import { Focus2See } from './focus2-see'

/* The last moment of Focus (FocusLayout.tsx): the answer, whole, and read at
   a glance — the verdict first and largest, in its colour; "Decided by" its
   caption (the way into that rule); on a Deny no rule matched, the rule that
   came closest; then the factors asked for or the message refused with, what
   is worth knowing, and What they see as the small browser beside it. Red
   stays on the mark, the word, the message and the card's edge — never a
   fill. Before it is reached the run is deciding: the ghost already stands
   at the answer's own size, What they see's place kept, so the verdict lands
   in the same box (one layout, about 700 ms). */

const DECISION_ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }

/** What they see's place, before it is drawn: the same box, its parts as skeletons. */
function SeeSkeleton() {
  return (
    <div className="rl-focus__seeskel" aria-hidden>
      <span className="tj-skel is-short" />
      <span className="rl-focus__seeskel-frame" />
      <span className="tj-skel is-line" />
    </div>
  )
}

export function OutcomeGhost({ deciding, wide }: { deciding: boolean; wide: boolean }) {
  return (
    <div className={`rl-focus__card is-outcome is-ghost${wide ? ' is-wide' : ''}${deciding ? ' is-working' : ''}`} data-card data-node="outcome" aria-label="Outcome">
      <div className={wide ? 'rl-focus__outgrid' : undefined}>
        <div className="rl-focus__outin">
          <header className="rl-focus__head">
            <span className={`rl-focus__tile is-verdict${deciding ? ' is-working' : ''}`}>{deciding ? <Spinner small /> : <Split size={20} strokeWidth={2} aria-hidden />}</span>
            <span className="rl-focus__heading">
              <span className="rl-focus__kicker">Outcome</span>
              <h3 className="rl-focus__title is-quiet">{deciding ? 'Deciding' : 'Not decided yet'}</h3>
            </span>
          </header>
          <span className="tj-skel is-line rl-focus__ghostline" />
          <span className="tj-skel is-short rl-focus__ghostline" />
        </div>
        {wide && (
          <div className="rl-focus__see">
            <SeeSkeleton />
          </div>
        )}
      </div>
    </div>
  )
}

/** What Focus v2 adds to the landed card; Focus v1 passes none and draws exactly what it always did. Every block but
 *  `land` is optional: a v2 carrying only `land` draws the wide v1 card and keeps the verdict stroke and the Deny shake. */
export interface OutcomeV2 {
  /** The two questions under the verdict: pressing one asks it, as the panel does. */
  questions?: readonly { id: string; label: string }[]
  onAsk?: (id: string) => void
  /** A person in more than one group: one plain sentence and the button that opens "each group". Null for everyone else. */
  group?: { text: string; label: string; conflict: boolean; onSee: () => void } | null
  /** What they see, as a thumbnail that opens in a popover. */
  see?: { open: boolean; reduced: boolean; portal: HTMLElement | null; onOpen: () => void; onClose: () => void }
  /** This is the presented landing, seen for the first time: the verdict's mark draws itself (a Deny shakes once). */
  land?: boolean
}

export function OutcomeMoment({
  props,
  tone,
  animate,
  inert,
  onClosest,
  v2,
}: {
  props: RunLayoutProps
  tone: Tone
  animate: boolean
  inert: boolean
  /** Bring the closest rule into focus. */
  onClosest?: (ruleIndex: number) => void
  v2?: OutcomeV2
}) {
  const { plan, screens, form, changed, expected, weaker, columns, onOpenRule, onOpenPolicy, breakIn, onReviewBreakIn } = props
  const [findingsOpen, setFindingsOpen] = useState(false)
  /* Latched the first render `v2.land` is true, and never released. The card mounts during "Deciding", while `land` is
     still false (it turns true a beat later, for one render or two), so deciding this at mount would never fly. A card
     opened again by a browse never sees `land` true, so it is drawn plainly. */
  const [fly, setFly] = useState(() => !!v2?.land && animate)
  if (!fly && v2?.land && animate) setFly(true)
  /* What they see follows the verdict (+300 ms): its place is kept, then it fills. */
  const [seeOn, setSeeOn] = useState(!animate)
  useEffect(() => {
    if (seeOn) return
    const t = window.setTimeout(() => setSeeOn(true), 300)
    return () => window.clearTimeout(t)
  }, [seeOn])
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
  const reason = denyReasonOf(plan)
  const hero = heroFinding(plan)
  const findings = (plan.conflicts?.findings ?? []).filter((f) => !isQuiet(f))
  const mark = expectMark(decided, expected, weaker)
  const was = columns.length > 1 ? columns[0] : null
  const now = columns.length > 1 ? columns[columns.length - 1] : null
  const versus = was && now && answerWords(was) !== answerWords(now) ? { was, now } : null
  const closest = closestMiss(plan)
  const closestAt = closest ? plan.rules.indexOf(closest.rule) : -1
  const see = screens.length > 0 && form.appId !== null
  /* v1 sets What they see beside the words; v2's thumbnail (v2.see) puts it under them instead. */
  const wide = see && !v2?.see
  const tab = inert ? -1 : undefined
  const lit = useContext(LitCtx)
  const line = {
    out: { opacity: 0, y: 4 },
    in: { opacity: 1, y: 0, transition: { duration: animate ? 0.24 : 0, ease: EASE_OUT } },
  }
  /* "AWS for engineering teams · Nothing else matched ↗": the arrow kept with the last word, so a wrap never strands it. */
  const byWords = by.split(' ')
  const byLast = byWords.pop() ?? ''
  return (
    <div className={`rl-focus__card is-outcome is-landed is-${tone}${wide ? ' is-wide' : ''}${lit === 'outcome' ? ' is-lit' : ''}`} data-card data-node="outcome" role="group" aria-label={`Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ''}`}>
      <div className={wide ? 'rl-focus__outgrid' : undefined}>
        <motion.div className="rl-focus__outin" initial={animate ? 'out' : false} animate="in" variants={{ out: {}, in: { transition: animate ? { staggerChildren: 0.06, delayChildren: 0.06 } : {} } }}>
          <div className="rl-focus__verdict">
            {fly && decided ? (
              <motion.span
                className={`rl-focus__vtile is-${tone}`}
                aria-hidden
                initial={{ opacity: 0 }}
                animate={decided === 'deny' ? { opacity: 1, ...SHAKE } : { opacity: 1 }}
                transition={{ opacity: { duration: 0.15, ease: EASE_OUT }, x: SHAKE_T }}
              >
                <VerdictStroke decision={decided} />
              </motion.span>
            ) : (
              <motion.span
                className={`rl-focus__vtile is-${tone}`}
                aria-hidden
                initial={animate ? { scale: 0.4, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={animate ? { type: 'spring', stiffness: 420, damping: 20, mass: 0.7 } : { duration: 0 }}
              >
                <Icon size={24} strokeWidth={2} />
              </motion.span>
            )}
            <motion.span className="rl-focus__vword" variants={line}>
              {word}
            </motion.span>
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
          {v2?.questions && v2.questions.length > 0 && v2.onAsk && (
            <motion.div className="rl-f2__qs" variants={line}>
              {v2.questions.map((q) => (
                <button key={q.id} type="button" className="rl-f2__q" tabIndex={tab} onClick={() => v2.onAsk?.(q.id)}>
                  {q.label}
                </button>
              ))}
            </motion.div>
          )}
          {by && (
            <motion.div className="rl-focus__by" variants={line}>
              <span className="rl-focus__label">{decided ? 'Decided by' : 'Policy'}</span>
              <button type="button" className="rl-focus__bylink" tabIndex={tab} title={`Open ${where && decided ? `${where} of ` : ''}${o.policyName ?? 'the policy'}`} onClick={open}>
                {byWords.length > 0 && `${byWords.join(' ')} `}
                <span className="rl-focus__nowrap">
                  {byLast}
                  <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
                </span>
              </button>
              {ruleName && <span className="rl-focus__byrule">{ruleName}</span>}
            </motion.div>
          )}
          {closest && onClosest && closestAt >= 0 && (
            <motion.div className="rl-focus__closest" variants={line}>
              <button type="button" className="rl-focus__closebtn" tabIndex={tab} onClick={() => onClosest(closestAt)}>
                <X size={14} strokeWidth={2.6} aria-hidden className="rl-focus__closemark" />
                <span className="rl-focus__closetext">
                  <span className="rl-focus__closesays">{closest.says}</span>
                  <span className="rl-focus__closeline">{closest.line}</span>
                </span>
              </button>
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
          {DENIAL_REASONS && reason && (
            <motion.p className="rl-focus__reason" variants={line}>
              {DENY_REASON_WORD[reason]} · <span>{denyRef(reason)}</span>
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
          {v2?.group && (
            <motion.div className={`rl-f2__gfind${v2.group.conflict ? ' is-conflict' : ''}`} variants={line}>
              <Users size={13} strokeWidth={2.2} aria-hidden />
              <span className="rl-f2__gtext">{v2.group.text}</span>
              <button type="button" className="rl-f2__q" tabIndex={tab} onClick={v2.group.onSee}>
                {v2.group.label}
              </button>
            </motion.div>
          )}
          {count && !(v2?.group && findings.length <= 1) && (
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
          {v2?.see && see && (
            <motion.div className={`rl-focus__see rl-f2__seerow${lit === 'screens' ? ' is-lit' : ''}`} variants={line} data-node-see>
              <Focus2See screens={screens} appId={form.appId} open={v2.see.open} reduced={v2.see.reduced} portal={v2.see.portal} inert={inert} onOpen={v2.see.onOpen} onClose={v2.see.onClose} />
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
        {wide && (
          <div className={`rl-focus__see${lit === 'screens' ? ' is-lit' : ''}`} data-node-see>
            <AnimatePresence initial={false}>
              {!seeOn && (
                <motion.div key="skel" className="rl-focus__seeghost" exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
                  <SeeSkeleton />
                </motion.div>
              )}
            </AnimatePresence>
            {seeOn && (
              <motion.div initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
                <WhatTheySee screens={screens} appId={form.appId} compact collapsible={false} />
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
