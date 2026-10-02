import { motion } from 'motion/react'
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, CircleHelp, Info, TriangleAlert } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import { AppLogo } from '../../../logos/AppLogo'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { answerWords } from '../../testing/sign-in-sentence'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { Finding } from '../conflicts'
import { expectMark, findingsCount } from '../journey'
import { DOOR_W, type GatesGeo } from './gates-geometry'
import type { GatesTone } from './gates-token'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   The app's door (GatesLayout.tsx): the app's logo on its leaf. It waits shut
   while the engine works; once the answer lands it swings open and the token
   goes in (an allow, on any number of factors), stays shut with the message
   (a deny, red), or stands ajar (Depends, amber: a fact not stated). The card
   says the verdict, Decided by, the factors asked for, and What they see on
   demand.
   -------------------------------------------------------------------------- */

const EASE = [0.2, 0, 0, 1] as const

export function GatesDoor({
  props,
  geo,
  landed,
  tone,
  animate,
  note,
  onNote,
  findings,
}: {
  props: RunLayoutProps
  geo: GatesGeo
  landed: boolean
  tone: GatesTone
  animate: boolean
  note: string | null
  onNote: (id: string, from: HTMLElement) => void
  findings: readonly Finding[]
}) {
  const { plan, screens, form, changed, expected, weaker, columns, onOpenRule, onOpenPolicy, reduced } = props
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view?.line || 'No policy decides'
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const where = landing ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1}`) : ''
  const by = o.policyName ?? ''
  const byWhere = where && decided ? where : ''
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
  const mark = expectMark(decided, expected, weaker)
  const was = columns.length > 1 ? columns[0] : null
  const now = columns.length > 1 ? columns[columns.length - 1] : null
  const versus = was && now && answerWords(was) !== answerWords(now) ? { was, now } : null
  const see = landed && screens.length > 0 && form.appId !== null
  const seeOpen = note === 'see'
  const findingsOpen = note === 'findings'
  /* The leaf: shut while the engine works and on a deny; open on an allow; ajar on a Depends. */
  const swing = !landed ? 0 : tone === 'positive' ? -68 : tone === 'notice' ? -24 : 0
  /* The verdict fades in on its own; the lines under it come with the body as it grows (one motion, no empty box). */
  const enter = (i: number) => ({
    initial: animate && i === 0 ? { opacity: 0 } : (false as const),
    animate: { opacity: 1 },
    transition: { duration: animate && i === 0 ? 0.24 : 0, delay: animate && i === 0 ? 0.08 : 0, ease: EASE },
  })
  return (
    <div className="rl-gates__doorwrap" style={{ left: geo.doorX, top: geo.doorTop, width: DOOR_W }}>
      <div
        className={`rl-gates__card rl-gates__door${landed ? ` is-landed is-${tone}` : ' is-waiting'}`}
        data-card
        data-node="outcome"
        role="group"
        aria-label={landed ? `Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ''}` : 'Outcome'}
      >
        <div className="rl-gates__doorhead">
          <span className="rl-gates__doorframe" aria-hidden>
            <motion.span
              className="rl-gates__leaf"
              style={{ originX: 0, transformPerspective: 220 }}
              initial={false}
              animate={{ rotateY: swing }}
              transition={{ duration: animate ? 0.7 : 0, delay: animate && landed ? 0.05 : 0, ease: EASE }}
            >
              {form.appId && <AppLogo appId={form.appId} name={plan.appName} size={20} />}
            </motion.span>
          </span>
          <span className="rl-gates__doorwords">
            <span className="rl-gates__doorapp">
              {form.appId && <AppLogo appId={form.appId} name={plan.appName} size={14} />}
              <span>{plan.appName}</span>
            </span>
            {landed ? (
              <motion.span className="rl-gates__word" {...enter(0)}>
                {word}
              </motion.span>
            ) : (
              <span className="rl-gates__doorwait">Waiting for the engine</span>
            )}
            {landed && mark && (
              <span className="rl-gates__expect" title={mark === 'weaker' ? weaker || undefined : expected ? `This sign-in expects ${DECISION_WORDS[expected]}` : undefined}>
                <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
                {mark === 'weaker' ? 'Weaker factor' : expected ? `Expected ${DECISION_WORDS[expected]}` : ''}
              </span>
            )}
          </span>
        </div>
        {landed && (
          /* The card opens down as the door opens: it grows to its lines, never an empty box first. */
          <motion.div
            className="rl-gates__doorbody"
            initial={animate ? { height: 0, opacity: 0, overflow: 'hidden' } : false}
            animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
            transition={{ duration: animate ? 0.42 : 0, ease: EASE }}
          >
            {by && (
              <motion.p className="rl-gates__by" {...enter(1)}>
                <span className="rl-gates__bylabel">{decided ? 'Decided by' : 'Policy'}</span>
                <button type="button" className="rl-gates__bylink" title={`Open ${where && decided ? `${where} of ` : ''}${o.policyName ?? 'the policy'}`} onClick={open}>
                  <span>{by}</span>
                  {/* The rule and the arrow stay together: never an arrow alone on a line. */}
                  <span className="rl-gates__bywhere">
                    {byWhere && <span>{` · ${byWhere}`}</span>}
                    <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                  </span>
                </button>
              </motion.p>
            )}
            {factors.length > 0 && !deny && (
              <motion.ol className="rl-gates__factors" aria-label="Asked for" {...enter(2)}>
                {factors.map((st, i) => (
                  <li key={`${st.kind}:${i}`}>
                    <span className="rl-gates__factor">{stepLabel(st)}</span>
                    {/* The arrow ends the line it is on: a wrapped list never starts with one. */}
                    {i < factors.length - 1 && <ChevronRight size={12} strokeWidth={2.2} aria-hidden />}
                  </li>
                ))}
              </motion.ol>
            )}
            {deny && deny.kind === 'deny' && (
              <motion.p className="rl-gates__deny" title={deny.message} {...enter(2)}>
                “{deny.message}”
              </motion.p>
            )}
            {o.status === 'depends' && o.view.outcomes.length > 0 && (
              <motion.ul className="rl-gates__ifs" {...enter(2)}>
                {o.view.outcomes.map((x) => (
                  <li key={`${x.label}:${x.decision}`}>
                    <span className="rl-gates__if">{x.label}</span>
                    <span className="rl-gates__ifword">{DECISION_WORDS[x.decision]}</span>
                  </li>
                ))}
              </motion.ul>
            )}
            {o.status === 'depends' && o.view.needs.length > 0 && (
              <motion.p className="rl-gates__needs" {...enter(3)}>
                <CircleHelp size={12} strokeWidth={2.2} aria-hidden />
                Needs {o.view.needs.join(', ').toLowerCase()}
              </motion.p>
            )}
            {versus && (
              <p className="rl-gates__vs">
                {versus.was.label} {answerWords(versus.was)}
                <ArrowRight size={12} strokeWidth={2} aria-hidden />
                {versus.now.label} {answerWords(versus.now)}
              </p>
            )}
            {(changed || count || see) && (
              <motion.p className="rl-gates__foot" {...enter(3)}>
                {count && (
                  <button
                    type="button"
                    className={`rl-gates__finding${count.conflict ? ' is-conflict' : ''}${findingsOpen ? ' is-open' : ''}`}
                    aria-expanded={findingsOpen}
                    onClick={(e) => onNote('findings', e.currentTarget)}
                  >
                    {count.conflict ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
                    {count.text}
                  </button>
                )}
                {changed && <span className="rl-gates__changed">Changed by {changed}</span>}
                {see && (
                  <button type="button" className={`rl-gates__seebtn${seeOpen ? ' is-open' : ''}`} aria-expanded={seeOpen} onClick={(e) => onNote('see', e.currentTarget)}>
                    What they see
                    {seeOpen ? <ChevronDown size={13} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={13} strokeWidth={2.2} aria-hidden />}
                  </button>
                )}
              </motion.p>
            )}
          </motion.div>
        )}
      </div>
      {landed && findingsOpen && findings.length > 0 && (
        <div className="rl-gates__card rl-gates__below rl-gates__note-findings" data-card role="note">
          <ul className="rl-gates__flist">
            {findings.map((f, i) => (
              <li key={`${f.kind}:${i}`} className={f.tone === 'conflict' ? 'is-conflict' : undefined}>
                <span className="rl-gates__fhead">
                  {f.tone === 'conflict' ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
                  {f.title}
                </span>
                {f.line && f.line !== f.title && <span className="rl-gates__fline">{f.line}</span>}
                {f.fix && <span className="rl-gates__notefix">{f.fix}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {see && seeOpen && form.appId && (
        <motion.div className="rl-gates__card rl-gates__below rl-gates__see" data-card initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.2 }}>
          <WhatTheySee screens={screens} appId={form.appId} compact collapsible={false} />
        </motion.div>
      )}
    </div>
  )
}
