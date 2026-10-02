import { motion } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'
import { Ban, Check, CircleHelp, KeyRound, Layers, Lock, Pause, Play, Radio, ShieldCheck, Split, UserRound, X, type LucideIcon } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { EngineRun } from '../engine-run'
import { Spinner } from '../PolicyStack'
import { policiesState, ruleState, type Moment, type MomentState, type Tone } from './focus-model'

/* The whole run under the carousel (FocusLayout.tsx): one chip per moment,
   in order, each in its meaning colour — blue while the engine works on it,
   green ✓, red ✕, amber only a can't-tell, grey what was passed over — the
   one in focus raised. A press brings that moment into focus. Chips arrive
   as the engine reaches them; the outcome waits at the end. */

interface Chip {
  key: string
  label: string
  state: MomentState
  Icon: LucideIcon | null
}

function chipOf(m: Moment, plan: EngineRun, s: number, reached: boolean, landed: boolean, tone: Tone): Chip {
  if (m.kind === 'sign') return { key: m.key, label: 'Sign-in', state: 'quiet', Icon: UserRound }
  if (m.kind === 'policies') {
    const st = reached ? policiesState(plan, s) : 'waiting'
    const d = plan.policies.find((p) => p.decides)
    const label = st === 'pass' && d ? (d.isGlobalDefault ? 'Global Default applies' : `Policy ${d.order} applies`) : 'Policies'
    return { key: m.key, label, state: st, Icon: Layers }
  }
  if (m.kind === 'rule') {
    const r = plan.rules[m.rule ?? -1]
    if (!r) return { key: m.key, label: 'Rule', state: 'quiet', Icon: null }
    return { key: m.key, label: r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}`, state: reached ? ruleState(r, s) : 'waiting', Icon: r.index === null ? Lock : null }
  }
  const o = plan.outcome
  if (!landed) return { key: m.key, label: 'Outcome', state: reached ? 'working' : 'waiting', Icon: Split }
  const word = o.status === 'decided' && o.decision ? DECISION_WORDS[o.decision] : o.status === 'depends' ? 'Depends' : 'No policy decides'
  const Icon = o.status === 'decided' && o.decision ? (o.decision === 'deny' ? Ban : o.decision === '2fa' ? KeyRound : ShieldCheck) : Split
  return { key: m.key, label: word, state: tone, Icon }
}

const STATE_ICON: Partial<Record<MomentState, LucideIcon>> = { pass: Check, fail: X, unknown: CircleHelp }

export function Ribbon({
  moments,
  plan,
  s,
  focus,
  landed,
  tone,
  held,
  animate,
  walking,
  onPick,
  onLive,
  onWalk,
  top,
}: {
  /** Where it sits down the world: under the cards. */
  top: number
  moments: readonly Moment[]
  plan: EngineRun
  s: number
  focus: number
  landed: boolean
  tone: Tone
  /** The admin has taken the focus while the run plays: the way back to it. */
  held: boolean
  animate: boolean
  walking: boolean
  onPick: (i: number) => void
  onLive: () => void
  onWalk: () => void
}) {
  const track = useRef<HTMLOListElement | null>(null)
  /* The chip in focus kept in view on a long run: the track's own scroll, never the page's. */
  useLayoutEffect(() => {
    const t = track.current
    const el = t?.querySelector<HTMLElement>('.rl-focus__chip.is-focus')
    if (!t || !el) return
    const left = el.offsetLeft - t.clientWidth / 2 + el.offsetWidth / 2
    t.scrollTo({ left: Math.max(0, left), behavior: animate ? 'smooth' : 'auto' })
  }, [focus, moments.length, animate])
  return (
    <nav className="rl-focus__ribbon" style={{ top }} aria-label="The run, moment by moment" data-card>
      {landed && (
        <button type="button" className={`rl-focus__walk${walking ? ' is-on' : ''}`} aria-pressed={walking} onClick={onWalk} title={walking ? 'Stop' : 'Walk through the run'}>
          {walking ? <Pause size={14} strokeWidth={2.2} aria-hidden /> : <Play size={14} strokeWidth={2.2} aria-hidden />}
          <span>{walking ? 'Stop' : 'Walk through'}</span>
        </button>
      )}
      <ol ref={track} className="rl-focus__chips">
        {moments.map((m, i) => {
          const reached = landed || s >= m.at
          if (!reached && m.kind !== 'outcome') return null
          const c = chipOf(m, plan, s, reached, landed, tone)
          const Mark = STATE_ICON[c.state]
          const isFocus = i === focus
          return (
            <motion.li
              key={c.key}
              className="rl-focus__chipwrap"
              initial={animate ? { opacity: 0, scale: 0.85 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={animate ? { type: 'spring', stiffness: 460, damping: 30 } : { duration: 0 }}
            >
              {i > 0 && <span className={`rl-focus__link${reached ? (landed ? ` is-${tone}` : ' is-reached') : ''}`} aria-hidden />}
              <button
                type="button"
                className={`rl-focus__chip is-${c.state}${isFocus ? ' is-focus' : ''}${!reached ? ' is-ahead' : ''}`}
                aria-current={isFocus ? 'step' : undefined}
                disabled={!reached}
                onClick={() => onPick(i)}
              >
                {c.state === 'working' ? <Spinner small /> : c.Icon ? <c.Icon size={14} strokeWidth={2} aria-hidden /> : null}
                <span className="rl-focus__chiplabel">{c.label}</span>
                {Mark && <Mark className="rl-focus__chipmark" size={14} strokeWidth={2.6} aria-label={c.state === 'pass' ? 'passed' : c.state === 'fail' ? 'failed' : "can't tell"} />}
              </button>
            </motion.li>
          )
        })}
      </ol>
      {held && !landed && (
        <button type="button" className="rl-focus__live" onClick={onLive} title="Follow the engine again">
          <Radio size={14} strokeWidth={2.2} aria-hidden />
          <span>Follow the run</span>
        </button>
      )}
    </nav>
  )
}
