import { motion } from 'motion/react'
import { Lock, TriangleAlert } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { EnginePolicy, EngineRun } from '../engine-run'
import { POL_W, TALL, type GatesGeo } from './gates-geometry'
import { gateState, noteDomId, useGatesNote, type GateCtx, type GateState } from './gates-model'
import { GatesNote, NoteLines } from './gates-note'

/* -----------------------------------------------------------------------------
   The policy gates (GatesLayout.tsx): one lane per policy on the app, in the
   order the engine asks them. Each lane's gate is a slim frame with a bar
   hanging in it; asked, a blue light scans down the frame; one that does not
   cover the person keeps its bar down; the first that covers lifts it, green.
   After it the lanes are quiet, never reached — but one that also covers the
   person glows amber: it would also let them in, and is not used.
   -------------------------------------------------------------------------- */


const EASE = [0.3, 0, 0.2, 1] as const

/** The frame, its bar, and the scan light while it is asked. */
export function GateGlyph({ state, tall, animate, ms }: { state: GateState; tall: boolean; animate: boolean; ms: number }) {
  const h = tall ? 44 : 26
  const open = state === 'open'
  return (
    <span className={`rl-gates__gate is-${state}`} style={{ height: h, top: tall ? 58 - 22 : 9 }} aria-hidden>
      <motion.span
        className="rl-gates__bar"
        style={{ originY: 0 }}
        initial={false}
        animate={{ scaleY: open ? 0 : 1 }}
        transition={{ duration: animate ? 0.46 : 0, ease: EASE }}
      />
      {state === 'asking' && animate && (
        <motion.span
          className="rl-gates__scan"
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: [0, h - 8, 0], opacity: 1 }}
          transition={{ y: { duration: Math.max(0.5, ms / 1000), repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.12 } }}
        />
      )}
      {state === 'asking' && !animate && <span className="rl-gates__scan is-still" />}
    </span>
  )
}

function shortReason(reason: string, first: string): string {
  if (/ is not in (it|this policy)$/.test(reason)) return `${first} is not in it`
  return reason || 'Not used'
}

function GateLane({ p, i, geo, state, animate, ms, ctx }: { p: EnginePolicy; i: number; geo: GatesGeo; state: GateState; animate: boolean; ms: number; ctx: GateCtx }) {
  const id = p.node
  const { isOpen, toggle } = useGatesNote(id)
  const h = geo.polHs[i]
  const tall = h >= TALL
  const { first } = ctx
  const conflict = state === 'also' && ctx.conflictIds.has(p.policyId)
  const own = ctx.findings.filter((f) => f.target.policyId === p.policyId && f.target.ruleId === null)
  const fix = own.find((f) => f.fix)?.fix
  const pc = ctx.covers.get(p.policyId)
  let sub = ''
  let lines: string[] = []
  let noteFix: string | undefined = fix
  switch (state) {
    case 'open':
      sub = p.isGlobalDefault ? `None above covers ${first}` : `First that covers ${first}`
      lines = [
        p.isGlobalDefault ? `No policy above it covers ${first}: the Global Default applies` : `The first policy on ${ctx.appName} that covers ${first}${ctx.deciderVia ? `, ${ctx.deciderVia}` : ''}`,
        ctx.ruleWhy,
        p.tip,
        ...own.map((f) => f.line || f.title),
      ]
      break
    case 'barred':
      sub = shortReason(p.reason, first)
      lines = [p.reason || 'Not used', p.tip, ...own.map((f) => f.line || f.title)]
      break
    case 'also': {
      sub = `Also covers ${first} · not used`
      const would = pc
        ? pc.status === 'decided' && pc.decision
          ? `On its own: ${DECISION_WORDS[pc.decision]}${pc.ruleNumber !== null ? ` · rule ${pc.ruleNumber}` : ''}`
          : pc.possible.length > 0
            ? `On its own: ${pc.possible.map((d) => DECISION_WORDS[d]).join(' or ')}`
            : ''
        : ''
      lines = [pc ? `Covers ${first} ${pc.via.say}`.trim() : `Also covers ${first}`, pc?.notUsed ?? '', would]
      noteFix = pc?.fix || fix
      break
    }
    case 'quiet':
      lines = [ctx.deciderName ? `Not asked: ${ctx.deciderName} applies first` : 'Not asked', p.reason && !/^not reached$/i.test(p.reason) ? p.reason : '', p.tip]
      break
    default:
      lines = [state === 'asking' ? 'Being asked' : 'Not asked yet']
  }
  return (
    <div className={`rl-gates__lane is-${state}${tall ? ' is-tall' : ' is-slim'}${conflict ? ' is-conflict' : ''}${isOpen ? ' is-noted' : ''}`} style={{ top: geo.polTops[i], height: h }} data-node={id}>
      <button
        type="button"
        className="rl-gates__lanebtn"
        data-card
        aria-expanded={isOpen}
        aria-controls={isOpen ? noteDomId(id) : undefined}
        aria-label={`Gate ${p.order}, ${p.name}: ${sub || state}. Why`}
        onClick={(e) => toggle(e.currentTarget)}
      >
        <GateGlyph state={state} tall={tall} animate={animate} ms={ms} />
        <span className="rl-gates__lanetext">
          <span className="rl-gates__lanehead">
            <span className="rl-gates__num">{p.order}</span>
            <span className="rl-gates__name" title={p.name}>
              {p.name}
            </span>
          </span>
          {tall && (
            <span className="rl-gates__lanesub">
              {conflict && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
              {sub}
            </span>
          )}
        </span>
      </button>
      {isOpen && (
        <GatesNote id={id} style={{ left: 44, top: h - 6 }}>
          <NoteLines lines={lines} fix={noteFix} />
        </GatesNote>
      )}
    </div>
  )
}

export function PolicyGates({ plan, v, geo, landed, shown, animate, ms, ctx }: { plan: EngineRun; v: number; geo: GatesGeo; landed: boolean; shown: boolean; animate: boolean; ms: number; ctx: GateCtx }) {
  const height = geo.polTops.length ? geo.polTops[geo.polTops.length - 1] + geo.polHs[geo.polHs.length - 1] : 80
  return (
    <motion.section
      className="rl-gates__bank is-pol"
      data-node="which"
      aria-label={`Policies on ${plan.appName}`}
      style={{ left: geo.polX, width: POL_W, height }}
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: shown ? 1 : 0.4 }}
      transition={{ duration: animate ? 0.3 : 0 }}
    >
      <h3 className="rl-gates__bankhead" title={`Policies on ${plan.appName}`}>
        <span>Policies on {plan.appName}</span>
        <span className="rl-gates__count">{plan.policies.length}</span>
      </h3>
      {plan.policies.map((p, i) => (
        <GateLane key={p.policyId} p={p} i={i} geo={geo} state={gateState(p, v, landed, ctx.covers.has(p.policyId))} animate={animate} ms={ms} ctx={ctx} />
      ))}
      {plan.policies.length === 0 && (
        <p className="rl-gates__empty">
          <Lock size={12} aria-hidden /> No policy on this app
        </p>
      )}
    </motion.section>
  )
}
