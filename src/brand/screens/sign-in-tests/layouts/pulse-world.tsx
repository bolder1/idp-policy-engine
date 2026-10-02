import { motion } from 'motion/react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Check, CircleHelp, TriangleAlert, X } from 'lucide-react'

import type { Finding } from '../conflicts'
import type { EngineRun } from '../engine-run'
import { stepMs } from '../use-engine-run'
import type { RunLayoutProps } from './types'
import { SIGN_W, tipOf, type Placed } from './pulse-geometry'
import { CARD_W, type Stop, type Track } from './pulse-model'
import { ABOVE, BELOW, OUT_UP, RAIL_H, RAIL_TOP, type Rows } from './pulse-size'
import type { Tone } from './pulse-words'
import { PolicyCard, RuleCard } from './pulse-cards'
import { OutcomeEnd, SignInEnd } from './pulse-ends'
import { OutcomeExtras } from './pulse-extras'

/* -----------------------------------------------------------------------------
   Pulse's world (PulseLayout.tsx): everything pinned to the trace — the
   sign-in it leaves from, a card on a hairline from each beat, the beat's
   mark at its tip, the captions of what was never read, the answer at the
   end — each arriving as the line reaches it.
   -------------------------------------------------------------------------- */

const EASE_OUT = [0.2, 0, 0, 1] as const

/** When a stop first shows: a policy as it is asked, a rule as it opens, the rest as the line reaches them. */
function showAt(plan: EngineRun, st: Stop, segStep: readonly number[]): number {
  const drawn = segStep[st.seg] ?? 0
  if (st.kind === 'policy' && st.policy !== undefined && !st.also) {
    const p = plan.policies[st.policy]
    return p?.scanAt ?? drawn
  }
  if (st.kind === 'rule' && st.rule !== undefined && !st.also) {
    const r = plan.rules[st.rule]
    return r && r.startAt >= 0 ? Math.min(r.startAt, drawn) : drawn
  }
  return drawn
}

export interface WorldProps {
  props: RunLayoutProps
  track: Track
  placed: Placed
  rows: Rows
  s: number
  landed: boolean
  tone: Tone
  first: string
  focusId: string | null
  onPick: (id: string) => void
  segStep: readonly number[]
  deciderVia: string
  findings: readonly Finding[]
  ruleWhy: string
}

export function PulseWorld({ props, track, placed, rows, s, landed, tone, first, focusId, onPick, segStep, deciderVia, findings, ruleWhy }: WorldProps) {
  const { plan, animate } = props
  const { base, height } = rows
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null)
  const [open, setOpen] = useState<'see' | 'findings' | null>(null)
  const landedTone = landed ? tone : null
  const stepX0 = (si: number): number => {
    for (let k = si - 1; k >= 0; k--) {
      const [a, b] = track.span[k] ?? [0, 0]
      if (b > a) return placed.x1[b - 1]
    }
    return SIGN_W
  }
  const stepX1 = (si: number): number => {
    const [a, b] = track.span[si] ?? [0, 0]
    return b > a ? placed.x1[b - 1] : stepX0(si)
  }
  /* A mark lands as the tip reaches it: its share of the step that draws it. */
  const delayFor = (x: number, si: number): number => {
    if (!animate || s !== si) return 0
    const a = stepX0(si)
    const b = stepX1(si)
    return b > a ? (Math.max(0, Math.min(1, (x - a) / (b - a))) * stepMs(plan, si)) / 1000 : 0
  }
  const enter = (shown: boolean, delay = 0) => ({
    initial: animate ? { opacity: 0, y: 4 } : false,
    animate: { opacity: shown ? 1 : 0, y: 0 },
    transition: { duration: animate ? 0.26 : 0, ease: EASE_OUT, delay },
  })
  const policyFindings = (policyId: string) => {
    const fs = findings.filter((f) => f.target.policyId === policyId && f.target.ruleId === null)
    return { lines: fs.map((f) => f.line || f.title), fix: fs.find((f) => f.fix)?.fix }
  }
  const covers = new Map((plan.conflicts?.policies ?? []).map((p) => [p.policyId, p]))
  const clashes = new Map((plan.conflicts?.rules ?? []).map((r) => [r.ruleId, r]))
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const matchedFirst = landing && landing.index !== null ? `rule ${landing.index + 1} matched first` : 'none of them matched'

  const nodes: ReactNode[] = []
  for (const st of track.stops) {
    if (placed.gone[st.seg]) continue
    const g = track.segs[st.seg]
    const c = placed.card[st.id]
    if (!g || !c) continue
    const shownAt = showAt(plan, st, segStep)
    const shown = s >= shownAt
    const drawnAt = segStep[st.seg] ?? 0
    const drawn = s >= drawnAt
    const w = placed.x1[st.seg] - placed.x0[st.seg]
    const tipPt = tipOf(g.shape, placed.x0[st.seg], w)
    const tipY = base + tipPt[1]
    const focus = focusId === st.id
    const markDelay = delayFor(c.pin, drawnAt)
    if (st.kind === 'outcome') continue

    /* The beat's mark at its tip, and the pin from it to the card. */
    const markTone = g.tone === 'path' ? (landedTone ? landedTone : tone === 'positive' ? 'pass' : 'ink') : g.tone
    const Icon = g.tone === 'fail' ? X : g.tone === 'notice' ? (st.also ? TriangleAlert : CircleHelp) : Check
    if (st.kind !== 'unread' && g.shape !== 'flat') {
      nodes.push(
        <motion.span key={`m:${st.id}`} className={`rl-pulse__beatmark is-${markTone}`} style={{ left: c.pin - 9, top: tipY - 9 }} {...enter(drawn, markDelay)} aria-hidden>
          <Icon size={11} strokeWidth={3} />
        </motion.span>,
      )
    }
    if (st.kind === 'unread') {
      const list = st.unread ?? []
      const x0 = placed.x0[st.seg]
      list.forEach((u, k) => {
        nodes.push(
          <motion.button
            key={`n:${u.node}`}
            type="button"
            tabIndex={-1}
            className={`rl-pulse__node${focus ? ' is-focus' : ''}`}
            data-card
            data-node={u.node}
            aria-label={`${u.label}: ${u.reason || 'not read'}`}
            style={{ left: x0 + 6 + k * 22 + 4, top: base - 7 }}
            {...enter(drawn, delayFor(x0 + 6 + k * 22 + 11, drawnAt))}
            onClick={() => onPick(st.id)}
            onMouseEnter={() => setHover({ x: x0 + 6 + k * 22 + 11, y: base - 18, text: `${u.label} · ${u.reason || 'not read'}` })}
            onMouseLeave={() => setHover(null)}
          />,
        )
      })
      nodes.push(
        <motion.span key={`cap:${st.id}`} className="rl-pulse__caption" style={{ left: x0 + 2, top: base + 12 }} {...enter(drawn)}>
          Not read
        </motion.span>,
      )
      if (focus) {
        nodes.push(
          <motion.div key={`ul:${st.id}`} className="rl-pulse__card rl-pulse__unread is-focus" data-card role="note" style={{ left: x0 - 8, top: base + BELOW }} initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            {list.map((u) => (
              <span key={u.node} className="rl-pulse__uline">
                <span className="rl-pulse__uname">{u.label}</span>
                <span className="rl-pulse__ureason">{u.reason === 'Not reached' ? 'Not read' : u.reason || 'Not read'}</span>
              </span>
            ))}
          </motion.div>,
        )
      }
      continue
    }
    const above = st.side === 'above'
    /* The pin: from the card to the beat's mark; below the trace it crosses the rail at the stop's tick, clear of the section names. */
    const pins: [number, number][] = above
      ? [[base - ABOVE, tipY - 9]]
      : [
          [tipY + (g.shape === 'dip' || g.tone === 'notice' ? 9 : 2), base + RAIL_TOP + 4],
          [base + RAIL_TOP + RAIL_H - 4, base + BELOW],
        ]
    pins.forEach(([a, b], k) => {
      if (b > a) nodes.push(<motion.span key={`p:${st.id}:${k}`} className={`rl-pulse__pin${focus ? ' is-focus' : ''}`} style={{ left: c.pin, top: a, height: b - a }} {...enter(shown)} aria-hidden />)
    })
    const pos: CSSProperties = above ? { left: c.left, bottom: height - (base - ABOVE), width: st.cardW } : { left: c.left, top: base + BELOW, width: st.cardW }
    let card: ReactNode = null
    if (st.kind === 'policy' && st.policy !== undefined) {
      const p = plan.policies[st.policy]
      if (p) {
        const role = st.also ? 'also' : p.decides ? 'decider' : 'passed'
        card = (
          <PolicyCard p={p} s={s} role={role} first={first} appName={plan.appName} via={deciderVia} cover={covers.get(p.policyId)} ruleWhy={ruleWhy} findings={policyFindings(p.policyId)} focus={focus} onPick={() => onPick(st.id)} landedTone={landedTone} />
        )
      }
    } else if (st.kind === 'rule' && st.rule !== undefined) {
      const r = plan.rules[st.rule]
      if (r) card = <RuleCard r={r} s={s} first={first} clash={st.also ? clashes.get(r.id) : undefined} focus={focus} onPick={() => onPick(st.id)} landedTone={landedTone} matchedFirst={matchedFirst} />
    }
    if (card) {
      nodes.push(
        <motion.div key={`c:${st.id}`} className={`rl-pulse__slot is-${st.side}${focus ? ' is-focus' : ''}`} style={pos} {...enter(shown)}>
          {card}
        </motion.div>,
      )
    }
  }

  /* Hover on a beat: its one line. A press puts the playhead there. */
  const hits: ReactNode[] = []
  track.segs.forEach((g, i) => {
    if (!g.stop || !g.hint || placed.gone[i] || g.shape === 'flat' || g.shape === 'gap' || g.shape === 'nodes') return
    if (s < (segStep[i] ?? 0)) return
    const x0 = placed.x0[i]
    const x1 = placed.x1[i]
    const stopId = g.stop
    hits.push(
      <button
        key={`h:${g.key}`}
        type="button"
        tabIndex={-1}
        className="rl-pulse__hit"
        data-card
        aria-label={g.hint}
        style={{ left: x0, top: base - 84, width: x1 - x0, height: 132 }}
        onMouseEnter={() => setHover({ x: (x0 + x1) / 2, y: base + tipOf(g.shape, x0, x1 - x0)[1] - 14, text: g.hint })}
        onMouseLeave={() => setHover(null)}
        onClick={() => landed && onPick(stopId)}
      />,
    )
  })

  const outLeft = placed.outLeft
  const outShown = landed
  return (
    <>
      <div className="rl-pulse__signslot" style={{ left: 0, top: base, width: SIGN_W }}>
        <SignInEnd props={props} landed={landed} />
      </div>
      {hits}
      {nodes}
      <div className="rl-pulse__outslot" style={{ left: outLeft, top: base - OUT_UP, width: CARD_W.outcome }}>
        {outShown ? (
          <>
            <OutcomeEnd props={props} tone={tone} animate={animate} delay={s === plan.at.outcome && animate ? (stepMs(plan, s) * 0.7) / 1000 : 0} open={open} onOpen={(w) => setOpen((o) => (o === w ? null : w))} focus={focusId === 'outcome'} onPick={() => onPick('outcome')} />
            <OutcomeExtras props={props} open={open} findings={findings} />
          </>
        ) : (
          <div className={`rl-pulse__card rl-pulse__ghost${s >= plan.at.outcome - 1 && plan.at.outcome > 0 ? ' is-working' : ''}`} data-card data-node="outcome" aria-label="Outcome" />
        )}
      </div>
      {hover && (
        <span className="rl-pulse__tip" role="tooltip" style={{ left: hover.x, top: hover.y }}>
          {hover.text}
        </span>
      )}
    </>
  )
}
