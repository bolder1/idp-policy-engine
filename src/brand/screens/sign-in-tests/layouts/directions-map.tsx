import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { policyFound, policyPhase, type EngineRun } from '../engine-run'
import { mapGeo, routePath } from './directions-geometry'
import { useDrive } from './directions-drive'
import { GateLabel, GateMarks, PolicyLabel, Barrier, ArrivalPin, type AltRoute } from './directions-map-parts'
import { gateState, landedAt, type Tone } from './directions-model'

/* -----------------------------------------------------------------------------
   The route map (DirectionsLayout.tsx): a calm stylised map, not geography.
   The person is the start pin; the avenue runs down past every policy on
   the application, in the engine's order, each a road crossing it named on
   the left; the route turns right at the first that covers the person, onto
   its street, where each rule is a gate; a closed gate is passed, the open
   one turned in at, and the application is where every gate leads.

   The route grows with the clock — blue while the engine works, the
   answer's colour once it arrives — the vehicle at its tip, the camera
   riding close behind it; on arrival the camera pulls back to the whole
   route and the arrival card rises at the pin. The map's ground plan is
   directions-geometry.ts; the drive, directions-drive.ts.
   -------------------------------------------------------------------------- */

export interface MapProps {
  plan: EngineRun
  s: number
  runKey: number
  W: number
  /** A short canvas: the map's plan sits closer. */
  tight: boolean
  animate: boolean
  instant: boolean
  person: { name: string; groups: string; isPerson: boolean }
  appId: string | null
  first: string
  tone: Tone
  /** Later policies that also cover them, by id. */
  also: ReadonlyMap<string, { name: string; conflict: boolean }>
  /** The words beside the policy taken: "via Engineering". */
  takeWords: string
  /** The map element pressed (`policy:<id>`, `rule:<id>`, …), and its point to look at. */
  selected: string | null
  onSelect: (node: string) => void
  /** The element the pointer is on — here or on its step in the list. */
  hot: string | null
  onHot: (node: string | null) => void
  alt: AltRoute | null
  /** Drive it again: a new number replays the vehicle along the settled route. */
  replay: number
  /** The arrival card's content: drawn at the pin once the route arrives. */
  arrival: ReactNode
}

const hoverOf = (node: string, onHot: (n: string | null) => void) => ({
  onMouseEnter: () => onHot(node),
  onMouseLeave: () => onHot(null),
  onFocus: () => onHot(node),
  onBlur: () => onHot(null),
})

export function RouteMap(p: MapProps) {
  const { plan, s, W } = p
  const landed = landedAt(plan, s)
  const d = plan.policies.findIndex((x) => x.decides)
  /* The most chips a gate hangs: from the plan's shape, so nothing moves as the run plays. */
  const marks = useMemo(() => plan.rules.reduce((m, r) => (r.visited && r.state !== 'off' ? Math.max(m, Math.min(5, r.checked)) : m), 0), [plan.rules])
  const geo = useMemo(() => mapGeo(W, plan.policies.length, d, plan.rules.length, plan.landing, p.tight, marks), [W, plan.policies.length, d, plan.rules.length, plan.landing, p.tight, marks])
  const path = useMemo(() => routePath(geo.route), [geo])
  const routeRef = useRef<SVGPathElement | null>(null)
  const carRef = useRef<SVGGElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  /* The arrival card's height: the map grows to hold it (What they see opened in it). */
  const [card, setCard] = useState<HTMLDivElement | null>(null)
  const [cardH, setCardH] = useState(0)
  useEffect(() => {
    if (!card || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setCardH(card.offsetHeight))
    ro.observe(card)
    return () => ro.disconnect()
  }, [card])

  /* What a press looks at: the element's point on the map. */
  const look = useMemo(() => {
    if (!landed || !p.selected) return null
    const sel = p.selected
    if (sel === 'sign-in') return geo.start
    if (sel === 'which') return { x: geo.avenue.x - 60, y: geo.start.y + 60 }
    if (sel === 'outcome') return { x: geo.card.x + geo.card.w / 2, y: geo.card.y + 40 }
    const pi = plan.policies.findIndex((x) => x.node === sel)
    if (pi >= 0) return { x: geo.avenue.x - 90, y: geo.junctions[pi]?.y ?? geo.start.y }
    const ri = plan.rules.findIndex((x) => x.node === sel)
    if (ri >= 0 && geo.street) return { x: geo.gates[ri] ?? geo.avenue.x, y: geo.street.y + 40 }
    return null
  }, [landed, p.selected, geo, plan.policies, plan.rules])

  const [driving, setDriving] = useState(0)
  const [seenReplay, setSeenReplay] = useState(p.replay)
  if (seenReplay !== p.replay) {
    setSeenReplay(p.replay)
    if (p.replay > 0 && landed && !p.instant) setDriving(p.replay)
  }
  useDrive({ plan, s, runKey: p.runKey, geo, path, animate: p.animate, instant: p.instant, look: driving ? null : look, routeRef, carRef, worldRef, replay: driving, onReplayed: () => setDriving(0) })

  const started = landed || s >= Math.max(0, plan.at.which)
  const routeTone = landed ? p.tone : 'work'
  const altPath = useMemo(() => (p.alt ? routePath(altPoints(p.alt, geo)) : null), [p.alt, geo])
  const st = geo.street

  return (
    <div className={`rl-directions__map${p.alt ? ' is-whatif' : ''}`} style={{ width: geo.W, minHeight: Math.max(geo.H, landed && cardH > 0 ? geo.card.y + cardH + 20 : 0) }} aria-label="Route map">
      <div ref={worldRef} className="rl-directions__mapworld" style={{ width: geo.W, height: geo.H }}>
        <svg className="rl-directions__svg" width={geo.W} height={geo.H} viewBox={`0 0 ${geo.W} ${geo.H}`} aria-hidden>
          {/* The roads: casing, then the road. */}
          <g className="rl-directions__roads">
            {(['edge', 'fill'] as const).map((layer) => (
              <g key={layer} className={`is-${layer}`}>
                <line x1={geo.avenue.x} y1={geo.avenue.y0} x2={geo.avenue.x} y2={geo.avenue.y1} />
                {geo.junctions.map((j, i) => (
                  <line key={i} className={`is-minor${offRoad(plan.policies[i]) ? ' is-off' : ''}`} x1={22} y1={j.y} x2={geo.avenue.x} y2={j.y} />
                ))}
                {st && <line x1={st.x0} y1={st.y} x2={st.x1} y2={st.y} />}
                {st && geo.campus && geo.gates.map((gx, k) => <line key={k} className={plan.rules[k]?.state === 'off' ? 'is-off' : ''} x1={gx} y1={st.y} x2={gx} y2={geo.campus!.y} />)}
              </g>
            ))}
          </g>
          {geo.campus && <rect className="rl-directions__campus" x={geo.campus.x0} y={geo.campus.y} width={geo.campus.x1 - geo.campus.x0} height={geo.campus.h} rx={10} />}

          {/* The route taken, grown with the clock (directions-drive.ts sets its dash). */}
          <path ref={routeRef} className={`rl-directions__route is-${routeTone}${p.alt ? ' is-dim' : ''}`} d={path.d} style={{ visibility: started ? 'visible' : 'hidden' }} />

          {/* A reroute: dashed, drawn on. */}
          {p.alt && altPath && (
            <g key={p.alt.key}>
              <mask id={`dx-alt-${p.alt.key.replace(/[^a-z0-9]/gi, '')}`} maskUnits="userSpaceOnUse">
                <motion.path d={altPath.d} stroke="#fff" strokeWidth={10} fill="none" strokeLinecap="round" initial={{ pathLength: p.instant ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: p.instant ? 0 : 1.1, ease: [0.4, 0, 0.2, 1] }} />
              </mask>
              <path className={`rl-directions__alt is-${p.alt.tone}`} d={altPath.d} mask={`url(#dx-alt-${p.alt.key.replace(/[^a-z0-9]/gi, '')})`} />
            </g>
          )}

          {/* The gates' barriers. */}
          {st &&
            geo.gates.map((gx, k) => {
              const r = plan.rules[k]
              return r ? <Barrier key={r.id} x={gx} y={geo.barrierY} state={started ? gateState(r, s) : 'waiting'} deny={r.decision === 'deny'} instant={p.instant} /> : null
            })}

          {/* The vehicle at the route's tip. */}
          <g ref={carRef} className={`rl-directions__car is-${routeTone}`} style={{ visibility: started && (!landed || driving > 0) ? 'visible' : 'hidden' }}>
            <circle r={13} className="rl-directions__carhalo" />
            <path d="M 0 -9 L 7 7 L 0 3.5 L -7 7 Z" className="rl-directions__carbody" />
          </g>
        </svg>

        {/* The start pin. */}
        <button
          type="button"
          className={`rl-directions__start${p.selected === 'sign-in' ? ' is-selected' : ''}${p.hot === 'sign-in' ? ' is-hot' : ''}`}
          {...hoverOf('sign-in', p.onHot)}
          data-card
          data-node="sign-in"
          style={{ left: geo.start.x, top: geo.start.y }}
          onClick={() => p.onSelect('sign-in')}
        >
          <span className="rl-directions__startpin">{p.person.isPerson ? <Face kind="user" name={p.person.name} size="sm" decorative /> : <span className="rl-directions__startdot" />}</span>
          <span className="rl-directions__startlabel">
            <strong>{p.person.name}</strong>
            {p.person.groups && <span>{p.person.groups}</span>}
          </span>
        </button>

        {/* The sign to the application's policies. */}
        {plan.policies.length > 0 && (
          <button
            type="button"
            className={`rl-directions__sign${p.selected === 'which' ? ' is-selected' : ''}${p.hot === 'which' ? ' is-hot' : ''}`}
            {...hoverOf('which', p.onHot)}
            data-card
            data-node="which"
            style={{ left: geo.avenue.x, top: geo.start.y + 50 }}
            onClick={() => p.onSelect('which')}
          >
            {plan.policies.length === 1 ? '1 policy' : `${plan.policies.length} policies`}
          </button>
        )}

        {/* The policies: a road each, named on the left. */}
        {plan.policies.map((pol, i) => (
          <PolicyLabel
            key={pol.policyId}
            pol={pol}
            y={geo.junctions[i]?.y ?? 0}
            right={geo.W - geo.labelRight}
            width={geo.labelRight - 16}
            started={started}
            working={!landed && (policyPhase(pol, s) === 'working' || policyFound(pol, s))}
            settled={landed || s >= pol.settleAt}
            before={d < 0 || i < d}
            also={landed ? p.also.get(pol.policyId) : undefined}
            first={p.first}
            takeWords={p.takeWords}
            selected={p.selected === pol.node}
            hot={p.hot === pol.node}
            onHot={p.onHot}
            alt={p.alt && p.alt.decider === i && p.alt.decider !== d ? p.alt : null}
            onSelect={p.onSelect}
          />
        ))}


        {/* The gates: a label over each, the checks beside its road. */}
        {st &&
          plan.rules.map((r, k) => (
            <GateLabel key={r.id} r={r} x={geo.gates[k]} bottom={geo.H - st.y + 14} width={Math.max(64, Math.min(geo.spacing - 10, 140))} state={started ? gateState(r, s) : 'waiting'} selected={p.selected === r.node} hot={p.hot === r.node} onHot={p.onHot} onSelect={p.onSelect} />
          ))}
        {st &&
          plan.rules.map((r, k) => (
            <GateMarks key={r.id} r={r} s={s} x={geo.gates[k]} top={geo.marksY} words={geo.spacing >= 84} landed={landed} />
          ))}

        {/* The application: where every gate leads. */}
        {geo.campus && (
          <div className="rl-directions__app" style={{ left: geo.campus.x0 + 14, top: geo.campus.y + geo.campus.h / 2 }}>
            {p.appId && <AppLogo appId={p.appId} name={plan.appName} size={18} />}
            <span>{plan.appName}</span>
          </div>
        )}
        {geo.arrive && landed && !p.alt && <ArrivalPin key={`pin:${p.runKey}`} x={geo.arrive.x} y={geo.arrive.y} tone={p.tone} instant={p.instant} />}
        {p.alt && altArrive(p.alt, geo) && <ArrivalPin key={`alt:${p.alt.key}`} x={altArrive(p.alt, geo)!.x} y={altArrive(p.alt, geo)!.y} tone={p.alt.tone} instant={p.instant} hollow />}

        {/* The arrival card, risen at the pin. */}
        {landed && (
          <motion.div
            key={`card:${p.runKey}:${p.alt?.key ?? ''}`}
            ref={setCard}
            className="rl-directions__arrival"
            data-card
            data-node="outcome"
            style={{ left: geo.card.x, top: geo.card.y, width: geo.card.w }}
            initial={p.instant ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.2, 0, 0, 1], delay: p.instant ? 0 : 0.18 }}
          >
            {p.arrival}
          </motion.div>
        )}
      </div>
    </div>
  )
}

/* A policy switched off, or a draft: its road dotted. */
const offRoad = (pol: EngineRun['policies'][number] | undefined) => !!pol && !pol.decides && (pol.status === 'inactive' || pol.status === 'draft')

/* A reroute's route: down the avenue to the policy it takes, then onto its street to its gate — or, another policy, along that one's road. */
function altPoints(alt: AltRoute, geo: ReturnType<typeof mapGeo>) {
  const top = { x: geo.avenue.x, y: geo.start.y }
  const j = geo.junctions[alt.decider]
  if (!j) return [top, { x: geo.avenue.x, y: geo.avenue.y1 }]
  const decider = geo.street && geo.street.y === j.y
  if (decider && alt.landing !== null && geo.gates[alt.landing] !== undefined && geo.campus) {
    const gx = geo.gates[alt.landing]
    return [top, { x: geo.avenue.x, y: j.y }, { x: gx, y: j.y }, { x: gx, y: geo.campus.y }]
  }
  return [top, { x: geo.avenue.x, y: j.y }, { x: 40, y: j.y }]
}

function altArrive(alt: AltRoute, geo: ReturnType<typeof mapGeo>) {
  const pts = altPoints(alt, geo)
  const last = pts[pts.length - 1]
  return pts.length === 4 ? last : null
}
