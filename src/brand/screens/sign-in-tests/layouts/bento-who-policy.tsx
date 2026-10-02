import { motion } from 'motion/react'
import { ArrowUpRight, Play, TriangleAlert } from 'lucide-react'

import { Face } from '../../../faces'
import type { Via } from '../conflicts'
import { policyFound, policyPhase, type EngineRun } from '../engine-run'
import { eachGroupRows } from '../journey'
import { stepMs } from '../use-engine-run'
import { Mark, Num, Skel } from './bento-parts'
import { policyWord, type AlsoCover } from './bento-words'

/* -----------------------------------------------------------------------------
   Two of Bento's tiles (BentoLayout.tsx):
     Who     the person and their groups — the group the policy lets them in
             by lights green ("via") the moment the policy is found
     Policy  the application's policies in the engine's order, read top down:
             a sweep over each as it is asked, the first that covers the
             person lit and held open, those after it one quiet word each —
             or amber, when one also covers them
   Each draws normal (the board), open (the detail, in place) and mini (a
   line, while another tile is open).
   -------------------------------------------------------------------------- */

export type Size = 'normal' | 'open' | 'mini'


// --- Who ---------------------------------------------------------------------------------

export interface WhoProps {
  size: Size
  name: string
  asGroup: string | null
  groups: { id: string; name: string }[]
  via: Via | null
  /** The policy has been found: its group lights. */
  routed: boolean
  globalDefault: boolean
  /** A later policy that also covers them, by group id. */
  alsoByGroup: Map<string, AlsoCover>
  first: string
  appName: string
  plan: EngineRun
  animate: boolean
  onAsGroup?: (groupId: string) => void
  onPressPerson: () => void
}

export function WhoBody(p: WhoProps) {
  const viaIds = new Set(p.via?.groups.map((g) => g.id) ?? [])
  if (p.size === 'mini') {
    return (
      <div className="rl-bento__mini">
        <Face kind="user" name={p.name} size="sm" decorative />
        <strong className="rl-bento__ell">{p.name}</strong>
      </div>
    )
  }
  const foot = !p.routed
    ? ''
    : p.globalDefault
      ? `No ${p.appName} policy covers ${p.first}`
      : p.via?.kind === 'person'
        ? 'Named in the policy'
        : p.via?.kind === 'everyone'
          ? 'The policy is for everyone'
          : p.via?.label
            ? `Let in through ${p.via.label}`
            : ''
  const rows = p.size === 'open' ? eachGroupRows(p.plan) : null
  return (
    <>
      <div className="rl-bento__who">
        <Face kind="user" name={p.name} size="md" decorative />
        <span className="rl-bento__whoname">
          <strong className="rl-bento__ell" data-link="who" title={p.name}>{p.name}</strong>
          {p.asGroup && <span>Tested as a member of {p.asGroup}</span>}
        </span>
      </div>
      <ul className="rl-bento__chips" aria-label="Groups">
        {p.groups.map((g) => {
          const on = p.routed && viaIds.has(g.id)
          const also = p.routed ? p.alsoByGroup.get(g.id) : undefined
          return (
            <li key={g.id} className={`rl-bento__chip${on ? ' is-on' : also?.conflict ? ' is-also' : ''}`} title={also ? `${also.name} also covers ${p.first} through ${g.name}` : undefined}>
              {g.name}
              {on && <Mark status="pass" label="Let in through it" pop={p.animate} />}
              {on && <span className="rl-bento__via">via</span>}
              {!on && also?.conflict && <TriangleAlert size={12} strokeWidth={2.4} aria-label="Another policy covers them through it" />}
            </li>
          )
        })}
        {p.routed && p.via?.named && (
          <li className="rl-bento__chip is-on">
            Named
            <Mark status="pass" label="Named in it" />
          </li>
        )}
      </ul>
      {foot && <p className="rl-bento__foot">{foot}</p>}
      {rows && (
        <div className="rl-bento__detail">
          <h4 className="rl-bento__sub">As each group</h4>
          <ul className="rl-bento__list">
            {rows.map((r) => (
              <li key={r.key} className={`rl-bento__grow${r.current ? ' is-current' : ''}`}>
                <span className="rl-bento__growlabel">{r.label}</span>
                <span className={`rl-bento__growword is-${r.status === 'decided' ? (r.decision === 'deny' ? 'negative' : 'positive') : 'notice'}`}>{r.words}</span>
                <span className="rl-bento__growsrc">{r.source}</span>
                {r.groupId && p.onAsGroup && (
                  <button type="button" className="rl-bento__btn" onClick={() => p.onAsGroup!(r.groupId!)}>
                    <Play size={12} strokeWidth={2.4} aria-hidden />
                    Run as {r.label.replace(/^As /, '')} only
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.size === 'open' && (
        <button type="button" className="rl-bento__btn is-quiet" onClick={p.onPressPerson}>
          Change the sign-in
        </button>
      )}
    </>
  )
}

// --- Policy ------------------------------------------------------------------------------

export interface PolicyProps {
  size: Size
  plan: EngineRun
  s: number
  landed: boolean
  first: string
  animate: boolean
  also: Map<string, AlsoCover>
  onOpenPolicy: (id: string) => void
}

const MAX_ROWS = 6


export function PolicyBody(p: PolicyProps) {
  const { plan, s } = p
  const rows = plan.policies
  const di = rows.findIndex((x) => x.decides)
  const decider = di >= 0 ? rows[di] : undefined
  if (p.size === 'mini') {
    const settled = decider && policyPhase(decider, s) === 'settled'
    return (
      <div className="rl-bento__mini">
        {decider && settled ? <Num n={decider.order} tone="positive" /> : <Skel w="18px" h={18} />}
        <span className="rl-bento__ell">{decider && settled ? decider.name : 'Finding the policy'}</span>
        {settled && <Mark status="pass" label="Applies" />}
      </div>
    )
  }
  const open = p.size === 'open'
  const max = open ? 12 : MAX_ROWS
  const start = rows.length <= max ? 0 : Math.min(Math.max(0, di - 2), rows.length - max)
  const shown = rows.slice(start, start + max)
  const below = rows.length - start - shown.length
  const dur = Math.max(0.2, stepMs(plan, s) / 1000)
  return (
    <>
      {start > 0 && <p className="rl-bento__more">{start} above</p>}
      <ol className="rl-bento__rows">
        {shown.map((x) => {
          const phase = policyPhase(x, s)
          const found = policyFound(x, s)
          const scanning = phase === 'working' && !found
          const after = decider !== undefined && x.order > decider.order
          const also = p.also.get(x.policyId)
          const settled = phase === 'settled'
          const blank = phase === 'waiting' && !found
          const word = settled ? policyWord(x, decider, p.landed || !after ? also : undefined, p.first) : ''
          const conflictNow = settled && !!also && p.landed && also.conflict
          const sub = scanning
            ? 'Checking who it covers'
            : found
              ? `Covers ${p.first}`
              : !settled
                ? String.fromCharCode(160)
                : x.decides
                  ? x.isGlobalDefault && rows.length > 1
                    ? `Applies · none above covers ${p.first}`
                    : `Applies · first that covers ${p.first}`
                  : also && p.landed
                    ? `Also covers ${p.first} · not used`
                    : word
          const cls = [
            'rl-bento__row',
            x.decides ? 'is-decider' : '',
            blank ? 'is-waiting' : '',
            scanning || found ? 'is-working' : '',
            settled && x.decides ? 'is-pass' : '',
            settled && !x.decides && (after ? !(also && p.landed) : true) ? 'is-dim' : '',
            settled && also && p.landed ? (also.conflict ? 'is-also is-conflict' : 'is-also') : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <li key={x.policyId} className={cls} data-node={x.node}>
              <Num n={x.order} tone={settled && x.decides ? 'positive' : scanning || found ? 'working' : undefined} />
              <span className="rl-bento__rowtext">
                <span className={`rl-bento__rowname${blank ? ' is-blank' : ''}`} data-link={x.decides ? 'policy' : undefined} title={x.name}>
                  {x.name}
                </span>
                <span className={`rl-bento__rowsub${conflictNow ? ' is-notice' : ''}`}>{sub}</span>
                {open && !x.decides && settled && (also ? <span className="rl-bento__rowsub">{also.via ? `${also.via} · ` : ''}{also.would ? `on its own: ${also.would}` : ''}</span> : x.tip ? <span className="rl-bento__rowsub is-tip">{x.tip}</span> : null)}
              </span>
              {scanning || found ? (
                <Mark status="none" working />
              ) : settled && x.decides ? (
                <Mark status="pass" label="Applies" pop={p.animate} big />
              ) : conflictNow ? (
                <TriangleAlert className="rl-bento__warnmark" size={15} strokeWidth={2.2} aria-label="A conflict" />
              ) : null}
              {open && settled && (
                <button type="button" className="rl-bento__icon" aria-label={`Open ${x.name}`} title="Open policy" onClick={() => p.onOpenPolicy(x.policyId)}>
                  <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
                </button>
              )}
              {scanning && p.animate && (
                <motion.span key={`sweep:${s}`} className="rl-bento__sweep" aria-hidden initial={{ left: '-14%' }} animate={{ left: '100%' }} transition={{ duration: dur, ease: 'linear' }} />
              )}
              {found && p.animate && (
                <svg className="rl-bento__ring" aria-hidden preserveAspectRatio="none">
                  <motion.rect x="1" y="1" rx="8" pathLength={1} strokeDasharray="0.28 0.72" initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: -1 }} transition={{ duration: dur, ease: 'easeInOut' }} />
                </svg>
              )}
            </li>
          )
        })}
      </ol>
      {below > 0 && <p className="rl-bento__more">{below} more</p>}
    </>
  )
}

