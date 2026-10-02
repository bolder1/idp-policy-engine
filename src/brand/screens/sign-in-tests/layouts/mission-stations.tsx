import { motion } from 'motion/react'
import { Lock } from 'lucide-react'

import type { EnginePolicy, EngineRule } from '../engine-run'
import { checkPhase } from '../engine-run'
import { CALL, policyReadout, ruleReadout, telemetryFact, telemetryNeed, type RuleStationState, type StationState } from './mission-model'
import type { EngineRun } from '../engine-run'
import { Decode } from './mission-type'

/* -----------------------------------------------------------------------------
   The consoles (MissionLayout.tsx): a station per policy, polled in order, and
   under the one that called GO a station per rule, each with its checks as
   telemetry lines. A station is a button: pressed, it is recalled — its call
   replays (the lamp polls again, the log types the call once more) and its
   telemetry opens in the inspector.

   The lamp's colour is the station's call: blue only while it is polled, green
   GO, red NO-GO or a scrub, amber also-GO or a hold, grey off or standing by.
   Lamps glow by box-shadow; the moved pieces (motion) carry no CSS transform or
   transition of their own.
   -------------------------------------------------------------------------- */

const EASE = [0.2, 0, 0, 1] as const

export interface StationEvents {
  onPeek: (id: string, el: HTMLElement | null, pin: boolean) => void
  onUnpeek: (id: string) => void
  onRecall: (id: string) => void
}

function Lamp({ st, recall, play }: { st: string; recall: number; play: boolean }) {
  return (
    <span className={`rl-mission__lamp is-${st}`} aria-hidden>
      {recall > 0 && play && (
        <motion.span
          key={recall}
          className="rl-mission__lamprecall"
          initial={{ opacity: 1 }}
          animate={{ opacity: [1, 0.2, 1, 0.2, 0] }}
          transition={{ duration: 0.9, times: [0, 0.25, 0.5, 0.75, 1] }}
        />
      )}
    </span>
  )
}

export interface PolicyStationProps extends StationEvents {
  p: EnginePolicy
  st: StationState
  plan: EngineRun
  first: string
  play: boolean
  lit: boolean
  conflict: boolean
  recall: number
  i: number
}

export function PolicyStation({ p, st, plan, first, play, lit, conflict, recall, i, onPeek, onUnpeek, onRecall }: PolicyStationProps) {
  const r = policyReadout(p, st, plan, first)
  const label = `Policy ${p.order}, ${p.name}: ${r.call}${r.words ? `, ${r.words}` : ''}. Recall`
  return (
    <motion.div
      className={`rl-mission__station is-${st}${lit ? ' is-lit' : ''}${conflict ? ' is-conflict' : ''}`}
      data-card
      data-mx={p.node}
      initial={play ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: play ? 0.3 : 0, delay: play ? 0.12 + i * 0.06 : 0, ease: EASE }}
    >
      <button
        type="button"
        className="rl-mission__sbtn"
        data-node={p.node}
        aria-label={label}
        onPointerEnter={(e) => onPeek(p.node, e.currentTarget.parentElement, false)}
        onPointerLeave={() => onUnpeek(p.node)}
        onFocus={(e) => onPeek(p.node, e.currentTarget.parentElement, false)}
        onBlur={() => onUnpeek(p.node)}
        onClick={(e) => {
          onRecall(p.node)
          onPeek(p.node, e.currentTarget.parentElement, true)
        }}
      >
        <span className="rl-mission__plate">
          <span className="rl-mission__snum">{p.order}</span>
          <span className="rl-mission__sname" title={p.name}>
            {p.name}
          </span>
        </span>
        <span className="rl-mission__readout">
          <span className="rl-mission__lampill">
            <Lamp st={st} recall={recall} play={play} />
            <span className="rl-mission__call">{st === 'polling' ? <Decode text="Polling" play={play} ms={300} /> : r.call}</span>
          </span>
          {r.words && (
            <span className="rl-mission__rwords" title={r.words}>
              <Decode text={r.words} play={play && st !== 'standby'} ms={320} />
            </span>
          )}
        </span>
      </button>
      {st === 'polling' && play && <motion.span className="rl-mission__sweep" aria-hidden initial={{ left: '-30%' }} animate={{ left: ['-30%', '100%'] }} transition={{ duration: 0.7, ease: 'linear', repeat: Infinity }} />}
    </motion.div>
  )
}

export interface RuleStationProps extends StationEvents {
  r: EngineRule
  st: RuleStationState
  s: number
  play: boolean
  landed: boolean
  lit: boolean
  recall: number
  i: number
  /** Lines the tallest station shows: every station is as tall. */
  rows: number
}

/* The lines a station shows: while polled, those read so far; a NO-GO, the line that failed (the others it read sit folded); a GO, all. */
function linesOf(r: EngineRule, st: RuleStationState, s: number) {
  const read = r.checks.slice(0, Math.max(0, r.checked))
  if (st === 'polling') return read.map((c, k) => ({ c, k, ph: checkPhase(r, k, s) })).filter((x) => x.ph !== 'hidden')
  if (st === 'nogo') {
    const k = r.failing ?? read.findIndex((c) => c.status === 'fail')
    return k >= 0 && r.checks[k] ? [{ c: r.checks[k], k, ph: 'settled' as const }] : []
  }
  if (st === 'go' || st === 'scrub' || st === 'hold') return read.map((c, k) => ({ c, k, ph: 'settled' as const }))
  return []
}

export function RuleStation({ r, st, s, play, landed, lit, recall, i, rows, onPeek, onUnpeek, onRecall }: RuleStationProps) {
  const rd = ruleReadout(r, st)
  const n = r.index === null ? null : r.index + 1
  const lines = linesOf(r, st, s)
  const passedBefore = st === 'nogo' ? Math.max(0, (r.failing ?? 0)) : 0
  const label = `${n === null ? 'Nothing else matched' : `Rule ${n}, ${r.name}`}: ${rd.call}${rd.words ? `, ${rd.words}` : ''}. Recall`
  const catchAll = r.index === null
  return (
    <motion.div
      className={`rl-mission__rstation is-${st}${lit ? ' is-lit' : ''}${catchAll ? ' is-last' : ''}${landed ? ' is-landed' : ''}`}
      data-card
      data-mx={r.node}
      data-node={r.node}
      style={{ minHeight: 52 + rows * 40 }}
      initial={play ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: play ? 0.28 : 0, delay: play ? 0.08 + i * 0.07 : 0, ease: EASE }}
    >
      <button
        type="button"
        className="rl-mission__rhead"
        aria-label={label}
        onPointerEnter={(e) => onPeek(r.node, e.currentTarget.parentElement, false)}
        onPointerLeave={() => onUnpeek(r.node)}
        onFocus={(e) => onPeek(r.node, e.currentTarget.parentElement, false)}
        onBlur={() => onUnpeek(r.node)}
        onClick={(e) => {
          onRecall(r.node)
          onPeek(r.node, e.currentTarget.parentElement, true)
        }}
      >
        <span className="rl-mission__plate">
          <span className="rl-mission__snum">{n === null ? <Lock size={11} strokeWidth={2.2} aria-hidden /> : n}</span>
          <span className="rl-mission__sname" title={r.index === null ? 'Nothing else matched' : r.name}>
            {r.index === null ? 'Nothing else matched' : r.name}
          </span>
        </span>
        <span className="rl-mission__readout">
          <span className="rl-mission__lampill">
            <Lamp st={st} recall={recall} play={play} />
            <span className="rl-mission__call">{st === 'polling' ? <Decode text="Polling" play={play} ms={300} /> : rd.call}</span>
          </span>
          {rd.words && (
            <span className="rl-mission__rwords" title={rd.words}>
              {rd.words}
            </span>
          )}
        </span>
      </button>
      {lines.length > 0 && (
        <ul className="rl-mission__tele" aria-label="Telemetry">
          {passedBefore > 0 && <li className="rl-mission__folded">{passedBefore === 1 ? '1 line GO before it' : `${passedBefore} lines GO before it`}</li>}
          {lines.map(({ c, k, ph }) => {
            const working = ph === 'working'
            const fact = telemetryFact(c, r.via)
            return (
              <motion.li
                key={c.key || k}
                className={`rl-mission__tline${working ? ' is-working' : ` is-${c.status}`}`}
                initial={play ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: play ? 0.14 : 0 }}
              >
                <span className="rl-mission__tword">{c.word}</span>
                <span className="rl-mission__tbody">
                  <span className="rl-mission__tfact" title={fact}>
                    {working ? <Decode text={fact} play={play} ms={220} /> : fact}
                  </span>
                  <span className="rl-mission__tneed" title={telemetryNeed(c)}>
                    {telemetryNeed(c)}
                  </span>
                </span>
                <span className="rl-mission__tlead" aria-hidden>
                  {working && play && <motion.span className="rl-mission__tleadfill" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 0.18, ease: 'linear' }} />}
                </span>
                <span className="rl-mission__tcall">{working ? '···' : CALL[c.status]}</span>
              </motion.li>
            )
          })}
        </ul>
      )}
      {lines.length === 0 && (st === 'unpolled' || st === 'standby' || st === 'also' || st === 'off' || st === 'ifnot') && (
        <p className="rl-mission__sidle">{st === 'also' ? 'Would also be GO' : st === 'ifnot' ? 'If no rule above matches' : catchAll && st !== 'off' ? 'The last station: always matches' : r.checks.length > 0 ? `${r.checks.length} ${r.checks.length === 1 ? 'line' : 'lines'}` : ''}</p>
      )}
      {st === 'polling' && play && <motion.span className="rl-mission__sweep" aria-hidden initial={{ left: '-30%' }} animate={{ left: ['-30%', '100%'] }} transition={{ duration: 0.8, ease: 'linear', repeat: Infinity }} />}
    </motion.div>
  )
}
