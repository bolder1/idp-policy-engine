import { motion } from 'motion/react'
import { ArrowUpRight, Eye, Play, ShieldAlert } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { EngineRun } from '../engine-run'
import { eachGroupRows } from '../journey'
import type { WhatIf } from './brief-whatif'

/* -----------------------------------------------------------------------------
   The follow-ups (BriefLayout.tsx): the questions an admin asks next, each
   answered from the plan — who else covers the person, what would change
   the answer (the engine run again on each one-fact variation), the person
   as each of their groups alone — and the ways out: open the rule, run as
   one group, the break-in attempts. One answer open at a time, under them.
   -------------------------------------------------------------------------- */

export type Ask = 'others' | 'change' | 'groups'

export interface FollowProps {
  plan: EngineRun
  first: string
  appName: string
  open: Ask | null
  onOpen: (a: Ask | null) => void
  whatIfs: WhatIf[]
  onPreview: (w: WhatIf) => void
  /** The facts the rules read include something a what-if can change. */
  canChange: boolean
  onOpenRule: (policyId: string, ruleId: string) => void
  onOpenPolicy: (policyId: string) => void
  onAsGroup?: (groupId: string) => void
  /** The groups the deciding policy covers them through: no "Run as … only" for those. */
  viaGroups: ReadonlySet<string>
  holes: number
  onBreakIn?: () => void
  animate: boolean
}

const EASE = [0.2, 0, 0, 1] as const

export function FollowUps(p: FollowProps) {
  const { plan } = p
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const groups = eachGroupRows(plan)
  const c = plan.conflicts
  const chip = (a: Ask, label: string) => (
    <button key={a} type="button" className={`rl-brief__chip${p.open === a ? ' is-on' : ''}`} data-card aria-expanded={p.open === a} onClick={() => p.onOpen(p.open === a ? null : a)}>
      {label}
    </button>
  )
  return (
    <div className="rl-brief__follow">
      <div className="rl-brief__chips" role="group" aria-label="Follow-up questions">
        {plan.decider && chip('others', `Who else covers ${p.first}?`)}
        {p.canChange && chip('change', 'What would change it?')}
        {groups && chip('groups', 'As each group')}
        {plan.decider && land && land.index !== null && (
          <button type="button" className="rl-brief__chip is-out" data-card onClick={() => p.onOpenRule(plan.decider!.id, land.id)}>
            Open rule {land.index + 1}
            <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
          </button>
        )}
        {plan.decider && (!land || land.index === null) && (
          <button type="button" className="rl-brief__chip is-out" data-card onClick={() => p.onOpenPolicy(plan.decider!.id)}>
            Open {plan.decider.isGlobalDefault ? 'the Global Default' : 'policy'}
            <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
          </button>
        )}
        {p.onAsGroup &&
          groups
            ?.filter((g) => g.groupId && !g.current && !p.viaGroups.has(g.groupId))
            .slice(0, 2)
            .map((g) => (
              <button key={g.key} type="button" className="rl-brief__chip is-out" data-card onClick={() => p.onAsGroup!(g.groupId!)}>
                <Play size={12} strokeWidth={2.4} aria-hidden />
                Run as {g.label.replace(/^As /, '')} only
              </button>
            ))}
        {p.holes > 0 && p.onBreakIn && (
          <button type="button" className="rl-brief__chip is-out" data-card onClick={p.onBreakIn}>
            <ShieldAlert size={13} strokeWidth={2.2} aria-hidden />
            Break-in attempts
          </button>
        )}
      </div>
      {p.open && (
        <motion.div
          key={p.open}
          className="rl-brief__reply"
          data-card
          role="region"
          aria-label="Answer"
          initial={p.animate ? { opacity: 0, y: -4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          {p.open === 'others' && (
            <ul className="rl-brief__list">
              {plan.decider?.isGlobalDefault && (c?.missedBy.length ?? 0) > 0 && (
                <>
                  <li className="rl-brief__lead">No policy on {p.appName} covers {p.first}:</li>
                  {c!.missedBy.map((m) => (
                    <li key={m.policyId}>
                      <strong>{m.policyName}</strong>
                      <span>{m.say}</span>
                    </li>
                  ))}
                </>
              )}
              {(c?.policies ?? []).map((pc) => (
                <li key={pc.policyId}>
                  <strong>{pc.policyName}</strong>
                  <span>
                    {pc.via.say} · {pc.status === 'decided' && pc.decision ? `on its own ${DECISION_WORDS[pc.decision]}` : 'on its own, can’t tell'} · not used
                  </span>
                </li>
              ))}
              {(c?.off ?? []).map((op) => (
                <li key={op.policyId}>
                  <strong>{op.policyName}</strong>
                  <span>{op.say}</span>
                </li>
              ))}
              {!plan.decider?.isGlobalDefault && (c?.policies.length ?? 0) === 0 && (c?.off.length ?? 0) === 0 && (
                <li className="rl-brief__lead">
                  Only {plan.decider?.name} covers {p.first} on {p.appName}.
                </li>
              )}
            </ul>
          )}
          {p.open === 'change' && (
            <ul className="rl-brief__list">
              {p.whatIfs.filter((w) => w.changed).length === 0 && <li className="rl-brief__lead">No single change of network, device or risk score changes the answer.</li>}
              {p.whatIfs
                .filter((w) => w.changed)
                .map((w) => (
                  <li key={w.key} className="is-what">
                    <strong>{w.label}</strong>
                    <span>
                      {w.words}
                      {w.source ? ` · ${w.source}` : ''}
                    </span>
                    <button type="button" className="rl-brief__mini" onClick={() => p.onPreview(w)} aria-label={`Brief it: ${w.label}`}>
                      <Eye size={12} strokeWidth={2.2} aria-hidden />
                      Brief it
                    </button>
                  </li>
                ))}
              {p.whatIfs.some((w) => !w.changed) && (
                <li className="rl-brief__same">
                  Same answer: {p.whatIfs.filter((w) => !w.changed).map((w) => w.label.replace(/^(From|On) /, '')).join(', ')}
                </li>
              )}
            </ul>
          )}
          {p.open === 'groups' && groups && (
            <ul className="rl-brief__list">
              {groups.map((g) => (
                <li key={g.key} className={g.current ? 'is-current' : ''}>
                  <strong>{g.label}</strong>
                  <span>
                    {g.words}
                    {g.source ? ` · ${g.source}` : ''}
                  </span>
                  {g.groupId && p.onAsGroup && (
                    <button type="button" className="rl-brief__mini" onClick={() => p.onAsGroup!(g.groupId!)}>
                      <Play size={11} strokeWidth={2.4} aria-hidden />
                      Run
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      )}
    </div>
  )
}
