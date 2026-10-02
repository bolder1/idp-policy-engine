import { motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { useBrand } from '../../../store'
import { policyOpen } from '../engine-run'
import { isQuiet, policyWhy } from '../journey'
import { stepMs } from '../use-engine-run'
import { stepLabel } from '../../testing/screens-of'
import { groupNamesOf } from '../sign-in-card'
import { GatesBooths } from './gates-booths'
import { GatesDoor } from './gates-door'
import { BOOTH_W, WALK, geoOf, isAllow, isLanded, stopAt, stopsTo, type Pt } from './gates-geometry'
import { GatesNoteCtx, type GateCtx, type GatesNotes } from './gates-model'
import { PolicyGates } from './gates-policies'
import { RuleStiles } from './gates-rules'
import { GatesSignIn } from './gates-sign'
import { GatesDock } from './gates-dock'
import { GatesToken, type GatesTone } from './gates-token'
import { RunStage, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './gates.css'

/* -----------------------------------------------------------------------------
   The run as gates (run-layout.ts `gates`): the person walks the checkpoints.

   The token (the person's face) steps out of the sign-in and walks the floor
   left to right. The policy gates stand in lanes, in the order the engine
   asks them: at each the gate is asked (a blue scan), one that does not cover
   the person stays barred and the token sidesteps to the next lane; the first
   that covers opens, and the token walks through. Beyond it the rule
   turnstiles of that policy, in order, their checks as lights on the frame:
   a red light keeps a turnstile locked and the token sidesteps on; the first
   whose lights are all green turns. A booth per extra factor, then the app's
   door: it opens and the token goes in (an allow), or stays shut (a deny).

   Everything is drawn from the step on screen (`s`, or the local walk's step
   when Walk again replays it): where the token stands is computed from the
   plan (gates-geometry.ts), never measured; each move lasts as long as the
   step that makes it (stepMs). No CSS transform or transition sits on what
   motion moves (the token, the bars, the turnstiles' arms, the door).
   -------------------------------------------------------------------------- */

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

export default function GatesLayout(props: RunLayoutProps) {
  const { plan, s, running, reduced, jumped, runKey, form } = props
  const { users, groups } = useBrand()
  const stage = useRef<StageView | null>(null)
  const slotRef = useRef<HTMLDivElement | null>(null)

  /* Walk again, and ‹ ›: the walk replayed (or stepped) here from the settled
     run, on the plan's own steps and pace — the engine is not run again, and
     the clock is never touched. A new run, or one playing, ends it. */
  const [walk, setWalk] = useState<{ v: number; playing: boolean } | null>(null)
  const [walkFor, setWalkFor] = useState(runKey)
  if (walkFor !== runKey) {
    setWalkFor(runKey)
    setWalk(null)
  }
  if (walk && running) setWalk(null)
  const lastStep = Math.max(0, plan.steps.length - 1)
  useEffect(() => {
    if (!walk?.playing) return
    if (walk.v >= lastStep) {
      setWalk(null)
      return
    }
    const id = window.setTimeout(() => setWalk((w) => (w && w.playing ? { v: w.v + 1, playing: true } : w)), Math.max(16, stepMs(plan, walk.v)))
    return () => window.clearTimeout(id)
  }, [walk, lastStep, plan])
  const v = walk ? Math.min(walk.v, lastStep) : s
  const animate = walk ? !reduced : props.animate
  const alsoIds = useMemo(() => new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId)), [plan.conflicts])
  const clashes = useMemo(() => new Map((plan.conflicts?.rules ?? []).map((r) => [r.ruleId, r])), [plan.conflicts])
  const ruleAlso = useMemo(() => new Set(clashes.keys()), [clashes])
  /* One booth per extra factor of the allow: what comes after the first. */
  const boothNames = useMemo(() => {
    const d = plan.outcome.status === 'decided' ? plan.outcome.decision : null
    if (!d || d === 'deny') return []
    const sc = props.screens.find((x) => x.decision === d) ?? props.screens[0]
    return (sc?.steps ?? []).filter((st) => st.kind !== 'deny').slice(1).map(stepLabel)
  }, [plan.outcome, props.screens])
  const geo = useMemo(() => geoOf(plan, boothNames.length, alsoIds, ruleAlso), [plan, boothNames.length, alsoIds, ruleAlso])
  const landed = isLanded(plan, v)
  const tone: GatesTone = plan.outcome.status === 'decided' && plan.outcome.decision ? (plan.outcome.decision === 'deny' ? 'negative' : 'positive') : plan.outcome.status === 'depends' ? 'notice' : 'neutral'
  const holds = useMemo(() => geo.boothX.map((x) => ({ x: x + BOOTH_W / 2, y: geo.outY })), [geo])
  const pt: Pt = stopAt(plan, v, geo)
  const trail = useMemo(() => stopsTo(plan, v, geo), [plan, v, geo])
  const moveMs = animate ? stepMs(plan, v) : 0
  const person = users.find((u) => u.id === form.personId) ?? null
  /* When each booth is reached in the walk to the door (s): the walk's own pace, its holds included. */
  const boothAt = useMemo(() => {
    const x0 = geo.boothX.length ? geo.boothX[0] - WALK / 2 : 0
    const end = isAllow(plan) ? geo.doorIn.x : geo.doorFront.x
    const total = Math.max(1, end - x0 + 70 * holds.length)
    const ms = (stepMs(plan, Math.max(0, plan.at.outcome)) * 0.94) / 1000
    return holds.map((h, i) => ((h.x - x0 + 70 * i + 35) / total) * ms)
  }, [geo, holds, plan])
  const first = props.asGroup ?? (person ? firstName(person.name) : plan.conflicts?.personName ? firstName(plan.conflicts.personName) : 'them')

  /* The one note open, and what opened it; a new run shuts it. */
  const [note, setNote] = useState<string | null>(null)
  const noteFrom = useRef<HTMLElement | null>(null)
  const [noteFor, setNoteFor] = useState(runKey)
  if (noteFor !== runKey) {
    setNoteFor(runKey)
    setNote(null)
  }
  const toggleNote = useCallback((id: string, from: HTMLElement) => {
    noteFrom.current = from
    setNote((n) => (n === id ? null : id))
  }, [])
  const whoIn = props.asGroup ?? (person ? groupNamesOf(person, groups).join(', ') : '')
  const notes = useMemo<GatesNotes>(() => ({ open: note, toggle: toggleNote, whoIn }), [note, toggleNote, whoIn])
  const height = Math.max(geo.bankBottom, geo.doorTop + (note === 'see' ? 760 : note === 'findings' ? 520 : 300), 260) + 8
  useEffect(() => {
    if (!note) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setNote(null)
      noteFrom.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (t?.closest('.rl-gates__note, [aria-expanded="true"]')) return
      setNote(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [note])

  const findings = useMemo(() => (plan.conflicts?.findings ?? []).filter((f) => !isQuiet(f)), [plan.conflicts])
  const gateCtx = useMemo<GateCtx>(() => {
    const dv = plan.conflicts?.policies[0]?.deciderVia
    const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
    const via = dv?.matches ? dv.say : landing?.via?.matches && landing.via.kind !== 'everyone' ? landing.via.say : ''
    return {
      appName: plan.appName,
      first,
      deciderName: plan.decider?.name ?? '',
      deciderVia: via,
      ruleWhy: policyWhy(plan),
      findings,
      covers: new Map((plan.conflicts?.policies ?? []).map((p) => [p.policyId, p])),
      conflictIds: new Set(
        (plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId),
      ),
    }
  }, [plan, first, findings])
  const polShown = v >= Math.max(0, plan.at.which)
  const deciderP = plan.policies.find((p) => p.decides)
  const rulesShown = !!deciderP && policyOpen(deciderP, v) && geo.hasRules

  /* The camera: a new run starts at full size; a settled one is fitted at once. */
  const fittedFor = useRef<number | null>(null)
  useLayoutEffect(() => {
    const st = stage.current
    if (!st) return
    if (running && animate && !landed) {
      fittedFor.current = null
      st.fit({ min: 1, max: 1, jump: true })
    } else {
      fittedFor.current = runKey
      st.fit({ max: 1, jump: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new run, and as the layout mounts
  }, [runKey])
  useEffect(() => {
    if (!running || landed) return
    stage.current?.follow(slotRef.current, { lazy: true, jump: reduced })
  }, [v, running, landed, reduced])
  /* The canvas changed size (the panel opened or shut, the window): a settled run is fitted again. */
  const worldRef = useRef<HTMLDivElement | null>(null)
  const settledNow = useRef(!running)
  useEffect(() => {
    settledNow.current = !running
  })
  useEffect(() => {
    const ground = worldRef.current?.closest('.rstage')
    if (!ground || typeof ResizeObserver === 'undefined') return
    let last = ''
    let frame = 0
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      const size = `${Math.round(r.width)}x${Math.round(r.height)}`
      if (size === last) return
      const firstSize = last === ''
      last = size
      if (firstSize || !settledNow.current) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => stage.current?.fit({ max: 1, jump: true }))
    })
    ro.observe(ground)
    return () => {
      ro.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])
  useEffect(() => {
    if (!landed || fittedFor.current === runKey) return
    fittedFor.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, runKey, reduced, jumped, animate])

  return (
    <RunStage
      ref={stage}
      reduced={reduced}
      /* Sides 40, not 48: a walk with a booth still lands at 12px or more in a 1280 window. */
      pad={{ left: 40, right: 40 }}
      className="rl-gates"
      label={`Sign-in run: ${plan.appName}`}
      dock={
        plan.policies.length > 0 ? (
          <GatesDock
            disabled={running}
            playing={!!walk?.playing}
            atStart={walk !== null && walk.v <= 0}
            onWalk={() => setWalk(reduced ? { v: 0, playing: false } : { v: 0, playing: true })}
            onBack={() => setWalk((w) => ({ v: Math.max(0, (w ? w.v : lastStep) - 1), playing: false }))}
            onNext={() => setWalk((w) => (!w || w.v + 1 >= lastStep ? null : { v: w.v + 1, playing: false }))}
            stepping={walk !== null}
          />
        ) : undefined
      }
    >
      <GatesNoteCtx.Provider value={notes}>
      <div key={runKey} ref={worldRef} className={`rl-gates__world${landed ? ` is-landed is-${tone}` : ''}`} style={{ width: geo.width, height } as CSSProperties}>
        <div ref={slotRef} className="rl-gates__slot" style={{ left: pt.x - 60, top: pt.y - 60 }} aria-hidden />
        <svg className="rl-gates__trail" width={geo.width} height={height} aria-hidden>
          {trail.slice(1).map((b, i) => {
            const a = trail[i]
            return (
              <motion.path
                key={i}
                className={landed ? `is-${tone}` : undefined}
                d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                initial={animate ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: moveMs / 1000, ease: 'linear' }}
              />
            )
          })}
        </svg>
        <GatesSignIn props={props} top={geo.polTops[0] ?? 36} depends={landed && plan.outcome.status === 'depends'} />
        <PolicyGates plan={plan} v={v} geo={geo} landed={landed} shown={polShown} animate={animate} ms={moveMs} ctx={gateCtx} />
        {rulesShown && <RuleStiles plan={plan} v={v} geo={geo} landed={landed} animate={animate} first={first} clashes={clashes} />}
        <GatesBooths names={boothNames} geo={geo} landed={landed} animate={animate} at={boothAt} />
        <GatesDoor props={props} geo={geo} landed={landed} tone={tone} animate={animate} note={note} onNote={toggleNote} findings={findings} />
        <GatesToken pt={pt} runKey={runKey} ms={moveMs} name={person?.name ?? plan.conflicts?.personName ?? ''} tone={landed ? tone : 'neutral'} inside={landed && isAllow(plan)} holds={holds} />
      </div>
      </GatesNoteCtx.Provider>
    </RunStage>
  )
}
