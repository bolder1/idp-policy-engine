import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { ArrowUpRight, Layers, TriangleAlert } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { EnginePolicy, EngineRun } from '../engine-run'
import { Spinner } from '../PolicyStack'
import { stepMs } from '../use-engine-run'
import { Mark, Num, OnPlate, Plate } from './explainer-parts'
import { EASE_OUT, MORPH } from './explainer-motion'
import type { VisualCtx } from './explainer-visual'

/* The policies, pictured (explainer-visual.tsx): the application's stack in
   the engine's order, each asked in turn — a sweep over the one being read,
   the ones that don't cover the person settling grey with why — until the
   first that covers them is found. Then it LIFTS OUT of the stack into its
   own card beside it (its plate glides; its place in the stack stays, empty),
   turns green as it applies, and says how it covers them. A later policy that
   also covers them, never used, is flagged in the stack. Press a row for its
   reason. */

type Row = 'skeleton' | 'asking' | 'found' | 'applies' | 'passed' | 'also' | 'not-read'

function rowOf(p: EnginePolicy, s: number, di: number, i: number, also: boolean, final: boolean): Row {
  if (p.foundAt !== null && s >= p.foundAt && s < p.settleAt) return 'found'
  if (p.decides && s >= p.settleAt) return 'applies'
  if (p.scanAt !== null && s >= p.scanAt && s < p.settleAt) return 'asking'
  if (s >= p.settleAt && (di < 0 || i < di)) return 'passed'
  if (di >= 0 && i > di && s >= p.settleAt) return also && final ? 'also' : 'not-read'
  return 'skeleton'
}

const MANY = 8

export function PoliciesView({ c, phase }: { c: VisualCtx; phase: 'read' | 'applies' }) {
  const { props, s, final, first, via, animate, morph } = c
  const plan = props.plan
  const di = plan.policies.findIndex((p) => p.decides)
  const covers = useMemo(() => new Map((plan.conflicts?.policies ?? []).map((p) => [p.policyId, p])), [plan.conflicts])
  const conflictIds = useMemo(() => new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict').map((f) => f.target.policyId)), [plan.conflicts])
  const [open, setOpen] = useState<string | null>(null)
  const lifted = phase === 'applies' && di >= 0
  /* A moment pressed after the run: what was never reached by then reads as not read, not as a skeleton. */
  const rows = plan.policies.map((p, i) => {
    const row = rowOf(p, s, di, i, covers.has(p.policyId), final)
    /* …and nothing is blue once the engine has stopped: the row it was reading shows what it came to. */
    const still: Row = row === 'asking' || row === 'found' ? (p.decides ? 'applies' : 'passed') : row
    return { p, i, row: final ? (still === 'skeleton' ? 'not-read' : still) : row }
  })
  const [seenPhase, setSeenPhase] = useState(phase)
  if (seenPhase !== phase) {
    setSeenPhase(phase)
    setOpen(null)
  }
  /* A long stack keeps its read rows and folds the rest. */
  const quiet = rows.filter((r) => r.row === 'not-read' || r.row === 'skeleton')
  const fold = rows.length > MANY && quiet.length > 2
  const shown = fold ? rows.filter((r) => !(r.row === 'not-read' || r.row === 'skeleton')) : rows
  const working = rows.some((r) => r.row === 'asking' || r.row === 'found')
  const d = di >= 0 ? plan.policies[di] : undefined
  return (
    <div className={`rl-explainer__pol${lifted ? ' is-lifted' : ''}`}>
      <motion.div className="rl-explainer__stack" layout={morph ? 'position' : false} transition={MORPH} data-card data-node="which">
        <header className="rl-explainer__stackhead">
          <span className={`rl-explainer__tile${working ? ' is-working' : d && s >= d.settleAt ? ' is-positive' : ''}`}>
            <Layers size={16} strokeWidth={2} aria-hidden />
          </span>
          <span>
            <span className="rl-explainer__kick">Policies on {plan.appName}</span>
            <span className="rl-explainer__stacksub">Read in order · the first that covers {first} applies</span>
          </span>
        </header>
        <ol className="rl-explainer__plist">
          {shown.map(({ p, row }) => {
            const isLifted = lifted && p.decides
            const note = open === p.policyId
            const cover = covers.get(p.policyId)
            const reason =
              row === 'passed' ? p.reason || 'Not used' : row === 'also' ? `Also covers ${first}${cover?.via.say ? ` ${cover.via.say}` : ''} · not used` : row === 'not-read' ? (p.reason && !/not reached/i.test(p.reason) ? p.reason : final && s < p.settleAt ? 'Not read yet' : 'Not read') : row === 'applies' ? 'Applies' : row === 'found' ? `Covers ${first}` : ''
            const lines = [
              row === 'also' && cover ? cover.notUsed : '',
              row === 'also' && cover?.status === 'decided' && cover.decision ? `On its own: ${DECISION_WORDS[cover.decision]}${cover.ruleNumber !== null ? ` · rule ${cover.ruleNumber}` : ''}` : '',
              row === 'not-read' && plan.decider ? `${plan.decider.name} applies first` : '',
              p.tip,
            ].filter((x, k, a) => x && a.indexOf(x) === k)
            if (isLifted) {
              return (
                <li key={p.policyId} className="rl-explainer__prow is-gap" aria-label={`${p.order}. ${p.name}: applies`}>
                  <Num n={p.order} />
                </li>
              )
            }
            const plateTone = row === 'found' || row === 'asking' ? 'working' : row === 'applies' ? 'positive' : row === 'also' ? (conflictIds.has(p.policyId) ? 'notice' : 'quiet') : row === 'skeleton' ? 'skeleton' : 'quiet'
            return (
              <li key={p.policyId} className={`rl-explainer__prow is-${row}${row === 'also' && conflictIds.has(p.policyId) ? ' is-conflict' : ''}`} data-node={p.decides ? undefined : p.node}>
                <Plate id={p.decides ? 'x-policy' : undefined} tone={plateTone} morph={morph} />
                <button type="button" className="rl-explainer__pbtn" aria-expanded={lines.length > 0 ? note : undefined} disabled={row === 'skeleton'} onClick={() => setOpen((o) => (o === p.policyId ? null : p.policyId))}>
                  {row === 'asking' && animate && (
                    <motion.span key={s} className="rl-explainer__sweep" aria-hidden initial={{ x: '-100%' }} animate={{ x: '320%' }} transition={{ duration: Math.max(0.2, stepMs(plan, s) / 1000), ease: [0.4, 0, 0.6, 1] }} />
                  )}
                  <Num n={p.order} tone={row === 'applies' ? 'positive' : row === 'found' || row === 'asking' ? 'working' : undefined} />
                  {row === 'skeleton' ? <span className="tj-skel is-line" /> : <span className="rl-explainer__pname" title={p.name}>{p.name}</span>}
                  <span className="rl-explainer__pstate">
                    {row === 'also' && conflictIds.has(p.policyId) && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
                    {row === 'asking' ? final ? 'Reading' : <Spinner small /> : reason}
                    {row === 'applies' && <Mark state="pass" pop={animate} />}
                  </span>
                </button>
                {note && lines.length > 0 && (
                  <motion.div className="rl-explainer__pnote" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: EASE_OUT }}>
                    {lines.map((l) => (
                      <p key={l}>{l}</p>
                    ))}
                  </motion.div>
                )}
              </li>
            )
          })}
          {fold && <li className="rl-explainer__prow is-not-read is-fold">{quiet.length} more · not read</li>}
        </ol>
      </motion.div>
      {lifted && d && <Lifted c={c} d={d} plan={plan} via={via?.matches ? via : null} />}
    </div>
  )
}

/** The policy that applies, lifted out of the stack: how it covers the person, and the rules it will read. */
function Lifted({ c, d, plan, via }: { c: VisualCtx; d: EnginePolicy; plan: EngineRun; via: VisualCtx['via'] }) {
  const { s, first, animate, morph, props } = c
  const settled = s >= d.settleAt
  const real = plan.rules.filter((r) => r.index !== null)
  const how = d.isGlobalDefault ? `None above covers ${first}: the fallback applies` : via ? `Covers ${first} ${via.say}` : `Covers ${first}`
  return (
    <div className={`rl-explainer__card is-lifted${settled ? ' is-positive' : ' is-working'}`} data-card data-node={d.node}>
      <Plate id="x-policy" tone={settled ? 'positive' : 'working'} morph={morph} />
      <OnPlate animate={animate} delay={0.28}>
        <div className="rl-explainer__lhead">
          <span className="rl-explainer__kick">{d.isGlobalDefault ? 'The fallback' : `Policy ${d.order}`}</span>
          <span className={`rl-explainer__pill is-${settled ? 'positive' : 'working'}`}>
            {settled ? <Mark state="pass" pop={animate} /> : <Spinner small />}
            {settled ? 'Applies' : 'Found'}
          </span>
        </div>
        <h3 className="rl-explainer__title">{d.name}</h3>
        <p className="rl-explainer__how">{how}</p>
        <div className="rl-explainer__lrules">
          <span className="rl-explainer__kick">{real.length === 0 ? 'No rules' : `${real.length} ${real.length === 1 ? 'rule' : 'rules'}, read in order`}</span>
          <ol>
            {plan.rules.map((r) => (
              <li key={r.id}>
                <Num n={r.index === null ? null : r.index + 1} />
                <span>{r.name}</span>
              </li>
            ))}
          </ol>
        </div>
        <button type="button" className="rl-explainer__link" onClick={() => props.onOpenPolicy(d.policyId)}>
          Open policy
          <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
        </button>
      </OnPlate>
    </div>
  )
}
