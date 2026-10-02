import { motion } from 'motion/react'
import { Ban, Check, CircleHelp, Lock, Minus, Split, X } from 'lucide-react'

import { Spinner } from '../PolicyStack'
import { checkPhase, type EnginePolicy, type EngineRule } from '../engine-run'
import { reasonWords, ruleShort, type GateState, type Tone } from './directions-model'

/* The route map's pieces (directions-map.tsx): a policy's road name, a
   rule's gate (its sign, its barrier, the checks read at it) and the pin
   the route arrives at. Each says one true thing about this run. */

/** A reroute (a what-if) drawn over the map: the policy it takes, the gate it turns in at (on the same street), its answer. */
export interface AltRoute {
  key: string
  /** "From Home broadband", "As Finance only". */
  label: string
  /** Index into the run's policies of the one it takes; -1 when none. */
  decider: number
  /** Index into the run's rules of the gate it turns in at, when it takes the same policy. */
  landing: number | null
  tone: Tone
  /** "Allow with 2FA". */
  words: string
  /** "rule 2", "AWS billing for Finance · rule 1". */
  source: string
  /** "As Finance only": the group the page can run as. */
  groupId?: string
  /** It goes the way the run went: the same policy, rule and answer. */
  same: boolean
}

const MARK = { pass: Check, fail: X, unknown: CircleHelp } as const

export function PolicyLabel(p: {
  pol: EnginePolicy
  y: number
  right: number
  width: number
  started: boolean
  working: boolean
  settled: boolean
  before: boolean
  also: { name: string; conflict: boolean } | undefined
  first: string
  takeWords: string
  selected: boolean
  hot: boolean
  onHot: (node: string | null) => void
  alt: AltRoute | null
  onSelect: (node: string) => void
}) {
  const { pol } = p
  let look = 'faint'
  let reason = ''
  if (!p.started) look = 'skel'
  else if (p.working) {
    look = 'work'
    reason = `Does it cover ${p.first}?`
  } else if (pol.decides && p.settled) {
    look = 'ok'
    reason = p.takeWords || `Policy ${pol.order}`
  } else if (p.before && p.settled) {
    look = 'quiet'
    reason = reasonWords(pol.reason, p.first)
  } else if (p.also) {
    look = p.also.conflict ? 'warn' : 'quiet'
    reason = `Also covers ${p.first} · not used`
  } else if (p.settled) reason = pol.reason || 'Not reached'
  return (
    <button
      type="button"
      className={`rl-directions__pol is-${look}${p.selected ? ' is-selected' : ''}${p.hot ? ' is-hot' : ''}${p.alt ? ' is-alt' : ''}`}
      onMouseEnter={() => p.onHot(pol.node)}
      onMouseLeave={() => p.onHot(null)}
      onFocus={() => p.onHot(pol.node)}
      onBlur={() => p.onHot(null)}
      data-card
      data-node={pol.node}
      style={{ right: p.right, top: p.y, maxWidth: p.width }}
      onClick={() => p.onSelect(pol.node)}
      title={pol.tip || undefined}
    >
      <span className="rl-directions__polname">{pol.name}</span>
      {p.alt ? (
        <span className={`rl-directions__polalt is-${p.alt.tone}`}>
          What if · {p.alt.words}
          {p.alt.source ? ` · ${p.alt.source.split(' · ').pop()}` : ''}
        </span>
      ) : (
        reason && (
          <span className="rl-directions__polwhy">
            {look === 'ok' && <Check size={12} strokeWidth={2.8} aria-hidden />}
            {reason}
          </span>
        )
      )}
    </button>
  )
}

export function GateLabel(p: {
  r: EngineRule
  x: number
  bottom: number
  width: number
  state: GateState
  selected: boolean
  hot: boolean
  onHot: (node: string | null) => void
  onSelect: (node: string) => void
}) {
  const { r, state } = p
  const Icon = state === 'open' ? (r.decision === 'deny' ? Ban : Check) : state === 'closed' ? X : state === 'unknown' ? CircleHelp : state === 'off' ? Minus : null
  return (
    <button
      type="button"
      className={`rl-directions__gate is-${state}${r.decision === 'deny' && state === 'open' ? ' is-deny' : ''}${p.selected ? ' is-selected' : ''}${p.hot ? ' is-hot' : ''}`}
      onMouseEnter={() => p.onHot(r.node)}
      onMouseLeave={() => p.onHot(null)}
      onFocus={() => p.onHot(r.node)}
      onBlur={() => p.onHot(null)}
      data-card
      data-node={r.node}
      style={{ left: p.x, bottom: p.bottom, width: p.width }}
      onClick={() => p.onSelect(r.node)}
    >
      <span className="rl-directions__gatekick">
        {r.index === null && <Lock size={11} strokeWidth={2.4} aria-hidden />}
        {ruleShort(r)}
        {state === 'reading' ? <Spinner small /> : Icon ? <Icon size={12} strokeWidth={2.8} aria-hidden /> : null}
      </span>
      <span className="rl-directions__gatename">{r.name}</span>
    </button>
  )
}

/* The checks read at a gate, beside its road, as they are read. */
export function GateMarks(p: { r: EngineRule; s: number; x: number; top: number; words: boolean; landed: boolean }) {
  const { r } = p
  if (!r.visited || r.state === 'off') return null
  const shown = r.checks.slice(0, r.checked).filter((_, k) => p.landed || checkPhase(r, k, p.s) !== 'hidden')
  if (shown.length === 0) return null
  const max = 4
  return (
    <ul className="rl-directions__marks" style={{ left: p.x + 11, top: p.top }} aria-hidden>
      {shown.slice(0, max).map((c, k) => {
        const working = !p.landed && checkPhase(r, k, p.s) === 'working'
        const Icon = MARK[c.status]
        return (
          <li key={c.key} className={`rl-directions__mark is-${working ? 'work' : c.status}`}>
            {p.words && <span>{c.word}</span>}
            {working ? <Spinner small /> : <Icon size={12} strokeWidth={2.8} />}
          </li>
        )
      })}
      {shown.length > max && <li className="rl-directions__mark is-more">+{shown.length - max}</li>}
    </ul>
  )
}

/* A gate's barrier: down while it is shut or not reached, raised once it is open, half up while it can't be told. */
export function Barrier({ x, y, state, deny, instant }: { x: number; y: number; state: GateState; deny: boolean; instant: boolean }) {
  if (state === 'off') return null
  const rotate = state === 'open' ? -72 : state === 'unknown' ? -30 : 0
  return (
    <g className={`rl-directions__bar is-${state}${deny && state === 'open' ? ' is-deny' : ''}`}>
      <motion.g style={{ originX: 0, originY: 0.5 }} initial={false} animate={{ rotate }} transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 16 }}>
        <rect x={x - 16} y={y - 2.5} width={34} height={5} rx={2.5} />
      </motion.g>
      <circle cx={x - 16} cy={y} r={4.5} />
    </g>
  )
}

export function ArrivalPin({ x, y, tone, instant, hollow = false }: { x: number; y: number; tone: Tone; instant: boolean; hollow?: boolean }) {
  const Icon = tone === 'bad' ? Ban : tone === 'warn' ? Split : Check
  return (
    <motion.div
      className={`rl-directions__pin is-${tone}${hollow ? ' is-hollow' : ''}`}
      style={{ left: x, top: y }}
      initial={instant ? false : { opacity: 0, y: -28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 20, delay: 0.05 }}
      aria-hidden
    >
      <span className="rl-directions__pinhead">
        <Icon size={14} strokeWidth={2.8} />
      </span>
    </motion.div>
  )
}
