import { motion } from 'motion/react'
import { TriangleAlert } from 'lucide-react'

import { Face } from '../../../faces'
import type { Via } from '../conflicts'
import { policyFound, policyPhase, type EnginePolicy, type EngineRun } from '../engine-run'
import { stepMs } from '../use-engine-run'
import { viaWords, type CiteId } from './brief-model'
import { Card, Mark, Num, type CardState } from './brief-parts'

/* -----------------------------------------------------------------------------
   Two evidence cards (BriefLayout.tsx):
     Who     the person and their groups; the group the policy covers them
             through lights green as the policy is found — a group another
             policy also covers them by, amber
     Policy  the application's policies in the engine's order: each one a
             sweep passes over as it is asked, the first that covers the
             person locked and lit; those after it quiet (or amber, a
             conflict). A row pressed says why, in the line under the card.
   -------------------------------------------------------------------------- */

export interface WhoProps {
  n: number | undefined
  name: string
  groups: { id: string; name: string }[]
  asGroup: string | null
  via: Via | null
  /** A later policy that also covers them, by group id: its name (a conflict when `conflict`). */
  also: Map<string, { name: string; conflict: boolean }>
  globalDefault: boolean
  appName: string
  first: string
  /** The policy has been found: the route lights. */
  routed: boolean
  state: CardState
  lit: boolean
  animate: boolean
  onHot: (c: CiteId | null) => void
}

export function WhoCard(p: WhoProps) {
  const viaIds = new Set(p.via?.groups.map((g) => g.id) ?? [])
  const foot = !p.routed
    ? ''
    : p.globalDefault
      ? `No policy on ${p.appName} covers ${p.first}`
      : viaWords(p.via)
        ? `Covered ${viaWords(p.via)}`
        : ''
  return (
    <Card cite="who" n={p.n} state={p.state} lit={p.lit} animate={p.animate} onHot={p.onHot} foot={foot || undefined}>
      <div className="rl-brief__who">
        <Face kind="user" name={p.name} size="md" decorative />
        <span className="rl-brief__whoname">
          <strong title={p.name}>{p.name}</strong>
          {p.asGroup && <span>A member of {p.asGroup}</span>}
        </span>
      </div>
      <ul className="rl-brief__groups" aria-label="Groups">
        {p.groups.map((g) => {
          const on = p.routed && viaIds.has(g.id)
          const also = p.routed ? p.also.get(g.id) : undefined
          return (
            <li key={g.id} className={`rl-brief__group${on ? ' is-on' : also?.conflict ? ' is-also' : ''}`}>
              <span className="rl-brief__groupname">
                {g.name}
                {!on && also && (
                  <span className="rl-brief__groupalso" title={`${also.name} also covers ${p.first} through ${g.name}`}>
                    {also.conflict && <TriangleAlert size={11} strokeWidth={2.4} aria-hidden />}
                    Also {also.name}
                  </span>
                )}
              </span>
              {on && <Mark status="pass" label="Covered through it" pop={p.animate} />}
            </li>
          )
        })}
        {p.routed && p.via?.named && (
          <li className="rl-brief__group is-on">
            <span className="rl-brief__groupname">Named</span>
            <Mark status="pass" label="Named in it" />
          </li>
        )}
        {p.routed && p.via?.kind === 'everyone' && (
          <li className="rl-brief__group is-on">
            <span className="rl-brief__groupname">Everyone</span>
            <Mark status="pass" label="For everyone" />
          </li>
        )}
      </ul>
    </Card>
  )
}

// --- Policy ------------------------------------------------------------------------------

const MAX_ROWS = 6

export interface PolicyProps {
  n: number | undefined
  plan: EngineRun
  s: number
  landed: boolean
  first: string
  /** Later policies that also cover the person: policy id → a conflict. */
  also: Map<string, boolean>
  sel: string | null
  onSel: (node: string | null) => void
  state: CardState
  lit: boolean
  /** The row a "Why not" line points at. */
  litRow: string | null
  animate: boolean
  onHot: (c: CiteId | null) => void
}

function reasonOf(p: EnginePolicy, first: string): string {
  if (/ is not in (it|this policy)$/.test(p.reason)) return `Doesn’t cover ${first}`
  return p.reason || 'Not read'
}

export function PolicyCard(p: PolicyProps) {
  const { plan, s } = p
  const rows = plan.policies
  const di = rows.findIndex((x) => x.decides)
  const start = rows.length <= MAX_ROWS ? 0 : Math.min(Math.max(0, di - 2), rows.length - MAX_ROWS)
  const shown = rows.slice(start, start + MAX_ROWS)
  const below = rows.length - start - shown.length
  const decider = di >= 0 ? rows[di] : undefined
  const sel = p.sel ? rows.find((x) => x.node === p.sel) : undefined
  const footOf = (x: EnginePolicy | undefined): string => {
    if (!x) return ''
    if (x.decides) return x.isGlobalDefault ? `None above covers ${p.first}` : `First that covers ${p.first}`
    if (p.also.has(x.policyId)) return `Also covers ${p.first} · not used`
    if (decider && x.order > decider.order) return x.reason && !/^not reached$/i.test(x.reason) ? x.reason : `Not read: ${decider.name} applies first`
    return reasonOf(x, p.first)
  }
  const foot = sel && policyPhase(sel, s) === 'settled' ? footOf(sel) : decider && policyPhase(decider, s) === 'settled' ? footOf(decider) : ''
  return (
    <Card
      cite="policy"
      n={p.n}
      node="which"
      title={`Policies on ${plan.appName}`}
      state={p.state}
      lit={p.lit}
      animate={p.animate}
      onHot={p.onHot}
      foot={foot || undefined}
    >
      {start > 0 && <p className="rl-brief__more">{start} above</p>}
      <ol className="rl-brief__rows">
        {shown.map((x) => {
          const phase = policyPhase(x, s)
          const found = policyFound(x, s)
          const scanning = phase === 'working' && !found
          const after = decider !== undefined && x.order > decider.order
          const also = p.also.get(x.policyId)
          const cls = [
            'rl-brief__row',
            phase === 'waiting' && !found ? 'is-waiting' : '',
            scanning || found ? 'is-working' : '',
            phase === 'settled' && x.decides ? 'is-pass' : '',
            phase === 'settled' && !x.decides && !after ? 'is-passed' : '',
            phase === 'settled' && after ? (also !== undefined && p.landed ? (also ? 'is-also is-conflict' : 'is-also') : 'is-dim') : '',
            p.sel === x.node ? 'is-sel' : '',
            p.litRow === x.node ? 'is-litrow' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const dur = Math.max(0.2, stepMs(plan, s) / 1000)
          return (
            <li key={x.policyId} className={cls}>
              <button
                type="button"
                className="rl-brief__rowbtn"
                data-node={x.node}
                aria-pressed={p.sel === x.node}
                disabled={phase !== 'settled'}
                onClick={() => p.onSel(p.sel === x.node ? null : x.node)}
                title={x.name}
              >
                <Num n={x.order} />
                <span className={`rl-brief__rowname${phase === 'waiting' && !found ? ' is-blank' : ''}`}>{x.name}</span>
                {scanning || found ? (
                  <Mark status="none" working />
                ) : phase === 'settled' && x.decides ? (
                  <Mark status="pass" label="Applies" pop={p.animate} />
                ) : phase === 'settled' && !x.decides && !after ? (
                  <Mark status="none" label={reasonOf(x, p.first)} />
                ) : phase === 'settled' && after && also !== undefined && p.landed ? (
                  <span className="rl-brief__tag">{also && <TriangleAlert size={11} strokeWidth={2.4} aria-hidden />}Also</span>
                ) : null}
              </button>
              {scanning && p.animate && (
                <motion.span key={`sweep:${s}`} className="rl-brief__sweep" aria-hidden initial={{ left: '-12%' }} animate={{ left: '100%' }} transition={{ duration: dur, ease: 'linear' }} />
              )}
              {found && p.animate && (
                <svg className="rl-brief__ring" aria-hidden preserveAspectRatio="none">
                  <motion.rect
                    x="1"
                    y="1"
                    rx="7"
                    pathLength={1}
                    strokeDasharray="0.3 0.7"
                    initial={{ strokeDashoffset: 0 }}
                    animate={{ strokeDashoffset: -1 }}
                    transition={{ duration: dur, ease: 'easeInOut' }}
                  />
                </svg>
              )}
            </li>
          )
        })}
      </ol>
      {below > 0 && <p className="rl-brief__more">{below} more</p>}
    </Card>
  )
}
