import { useMemo } from 'react'

import type { RuleConflict } from '../conflicts'
import type { EngineRun } from '../engine-run'
import { traceResult } from '../journey'
import type { SignInScreens } from '../../testing/screens-of'
import { BUS_X, HEAD_Y, POL_X, PSW_A, PSW_B, RUL_X, SRC_X, joined, roundedPath, type Geo, type Pt } from './circuit-geometry'
import { checkSwitch, factOf, ledState, policySwitch, segState, type Flow, type Tone } from './circuit-model'
import { OutcomePanel } from './circuit-outcome'
import { Front, SwitchMark } from './circuit-parts'
import { LaneBox, LaneChip, LaneTitle, PolicyCard, SwitchLabel, type LaneState, type PolicyNote } from './circuit-rules'
import { SourceCard, type Fact } from './circuit-source'
import type { InputId } from './circuit-whatif'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   The board itself (CircuitLayout.tsx), in three layers: the lanes' boxes,
   the traces and switches over them (SVG, never pressed), and the pressable
   components on top — the source, the policies, the lanes' titles and the
   labels under their switches, the LED panel.
   -------------------------------------------------------------------------- */

const RULE_SEG = /^(pout|feed|lin|w|coll|out)\b/

function laneStateOf(plan: EngineRun, r: number, s: number): LaneState {
  const rule = plan.rules[r]
  if (!rule) return 'idle'
  switch (traceResult(rule, s)) {
    case 'reading':
      return 'reading'
    case 'matched':
      return 'matched'
    case 'missed':
    case 'folded':
      return 'dead'
    case 'unknown':
      return 'unknown'
    case 'possible':
      return 'possible'
    case 'off':
      return 'off'
    default:
      return 'idle'
  }
}

/** The live path, end to end: the order the current takes it. */
function livePath(plan: EngineRun, geo: Geo): Pt[] {
  const d = plan.policies.findIndex((p) => p.decides)
  if (d < 0) return []
  const ids = ['src']
  for (let b = 1; b <= d; b++) ids.push(`bus:${b}`)
  ids.push(`pin:${d}`, `pthru:${d}`)
  const L = plan.landing
  if (L !== null && plan.rules[L] && geo.rules) {
    ids.push('pout')
    for (let f = 1; f <= L; f++) ids.push(`feed:${f}`)
    if (L > 0) ids.push(`lin:${L}`)
    plan.rules[L].checks.forEach((_, k) => ids.push(`w:${L}:${k}`))
    ids.push(`w:${L}:end`, 'out')
  }
  return joined(ids.map((id) => geo.segs.get(id)))
}

export interface BoardProps {
  props: RunLayoutProps
  plan: EngineRun
  s: number
  geo: Geo
  flow: Flow
  tone: Tone
  landed: boolean
  play: boolean
  /** Motion for a what-if or a pulse: the levers spring, the LED relights. */
  soft: boolean
  ms: number
  rulesShown: boolean
  name: string
  first: string
  groupLine: string
  appId: string | null
  appName: string
  facts: Fact[]
  reading: InputId | null
  hot: InputId | null
  onHot: (id: InputId | null) => void
  onFlip: (id: InputId) => void
  notes: Map<string, PolicyNote>
  conflictIds: Set<string>
  alsoIds: Set<string>
  clashes: Map<string, RuleConflict>
  screens: SignInScreens[]
  outNote: string | null
  onOutNote: (id: string, from: HTMLElement) => void
  pulse: string | null
  pulseMs: number
}

export function CircuitBoard(b: BoardProps) {
  const { props, plan, s, geo, flow, tone, landed, play, soft, ms, rulesShown, first } = b
  const spring = play || soft
  const d = plan.policies.findIndex((p) => p.decides)
  const L = plan.landing
  const rules = rulesShown ? geo.rules : null
  const front = play ? flow.byStep.get(s) : undefined
  const frontPts = front ? joined(front.filter((id) => rulesShown || !RULE_SEG.test(id)).map((id) => geo.segs.get(id))) : []
  const live = useMemo(() => livePath(plan, geo), [plan, geo])
  const lit = landed ? tone : null
  const matchedFirst = L !== null && plan.rules[L]?.index !== null && plan.rules[L] ? `rule ${(plan.rules[L].index ?? 0) + 1} matched first` : 'the walk stopped before it'
  const ruleHead = rules && plan.decider ? `Rules in ${plan.decider.name}` : 'Rules'

  return (
    <>
      <p className="rl-circuit__colhead" style={{ left: SRC_X, top: HEAD_Y }}>
        Sign-in
      </p>
      <p className="rl-circuit__colhead" style={{ left: POL_X, top: HEAD_Y }}>
        Policies on {plan.appName}
      </p>
      <p className="rl-circuit__colhead" style={{ left: RUL_X, top: HEAD_Y, maxWidth: (geo.rules?.w ?? 420) - 8 }} title={ruleHead}>
        {ruleHead}
      </p>
      <p className="rl-circuit__colhead" style={{ left: geo.out.x, top: HEAD_Y }}>
        Outcome
      </p>

      {rules?.lanes.map((lane) => (
        <LaneBox key={lane.r} lane={lane} laneX={rules.laneX} laneW={rules.laneW} state={laneStateOf(plan, lane.r, s)} tone={tone} landed={landed} />
      ))}

      <svg className="rl-circuit__svg" width={geo.W} height={geo.H} viewBox={`0 0 ${geo.W} ${geo.H}`} aria-hidden>
        {[...geo.segs.entries()].map(([id, pts]) => {
          if (!rulesShown && RULE_SEG.test(id)) return null
          const st = id === 'coll' ? 'idle' : segState(id, plan, flow, s, landed)
          return <path key={id} d={roundedPath(pts)} className={`rl-circuit__trace is-${st}${st === 'live' ? ` is-${tone}` : ''}`} />
        })}
        {geo.rows.map((row) => {
          const st = segState(`pin:${row.i}`, plan, flow, s, landed)
          return <circle key={`v:${row.i}`} className={`rl-circuit__via-dot is-${st}${st === 'live' ? ` is-${tone}` : ''}`} cx={BUS_X} cy={row.mid} r={3.2} />
        })}
        {rules?.lanes.map((lane) => {
          const inId = lane.r === 0 ? 'pout' : `lin:${lane.r}`
          const a = segState(inId, plan, flow, s, landed)
          const z = segState(`w:${lane.r}:end`, plan, flow, s, landed)
          return (
            <g key={`v:l${lane.r}`}>
              <circle className={`rl-circuit__via-dot is-${a}${a === 'live' ? ` is-${tone}` : ''}`} cx={rules.feedX} cy={lane.trace} r={3.2} />
              <circle className={`rl-circuit__via-dot is-${z}${z === 'live' ? ` is-${tone}` : ''}`} cx={rules.collX} cy={lane.trace} r={3.2} />
            </g>
          )
        })}
        {geo.rows.map((row) => {
          const p = plan.policies[row.i]
          const sw = policySwitch(p, s, landed, b.alsoIds.has(p.policyId))
          return (
            <g key={p.policyId} className={`rl-circuit__psw${landed && b.conflictIds.has(p.policyId) ? ' is-conflict' : ''}`}>
              <SwitchMark xa={PSW_A} xb={PSW_B} y={row.mid} state={sw} live={row.i === d ? lit : null} play={spring} spark={false} />
            </g>
          )
        })}
        {rules?.lanes.map((lane) =>
          lane.switches.map((g) => {
            const rule = plan.rules[lane.r]
            const st = checkSwitch(plan, lane.r, g.k, s)
            const spark = play && st === 'open' && rule.markAt[g.k] === s
            return <SwitchMark key={`${lane.r}:${g.k}`} xa={g.xa} xb={g.xb} y={g.y} state={st} live={lane.r === L && st === 'closed' ? lit : null} play={spring} spark={spark} />
          }),
        )}
        {frontPts.length > 1 && <Front key={`front:${props.runKey}:${s}`} pts={frontPts} ms={ms * 0.92} />}
        {b.pulse && live.length > 1 && <Front key={b.pulse} pts={live} ms={b.pulseMs} className={`is-tone is-${tone}`} />}
      </svg>

      <SourceCard
        geo={geo}
        name={b.name}
        groups={b.groupLine}
        appId={b.appId}
        appName={b.appName}
        facts={b.facts}
        reading={b.reading}
        hot={b.hot}
        powered={s >= Math.max(0, plan.at.which)}
        onPerson={props.onPressPerson}
        onFlip={b.onFlip}
        onHot={b.onHot}
      />

      <div className="rl-circuit__sel" data-node="which" aria-label={`Policies on ${plan.appName}`}>
        {geo.rows.map((row) => {
          const p = plan.policies[row.i]
          const note = b.notes.get(p.policyId)
          if (!note) return null
          return (
            <PolicyCard
              key={p.policyId}
              p={p}
              row={row}
              sw={policySwitch(p, s, landed, b.alsoIds.has(p.policyId))}
              first={first}
              tone={tone}
              landed={landed}
              conflict={landed && b.conflictIds.has(p.policyId)}
              note={note}
            />
          )
        })}
      </div>

      {rules?.lanes.map((lane) => {
        const r = plan.rules[lane.r]
        const state = laneStateOf(plan, lane.r, s)
        const pid = plan.decider?.id ?? null
        return (
          <div key={r.id} className="rl-circuit__lanetop">
            <LaneTitle
              r={r}
              lane={lane}
              laneX={rules.laneX}
              laneW={rules.laneW}
              state={state}
              first={first}
              matchedFirst={matchedFirst}
              clash={landed ? b.clashes.get(r.id) : undefined}
              onOpen={() => {
                if (!pid) return
                if (r.index === null) props.onOpenPolicy(pid)
                else props.onOpenRule(pid, r.id)
              }}
            />
            {lane.switches.length === 0 && <LaneChip r={r} lane={lane} laneX={rules.laneX} laneW={rules.laneW} state={state} />}
            {lane.switches.map((g) => {
              const c = r.checks[g.k]
              return <SwitchLabel key={c.key || g.k} c={c} sw={`${r.node}:${c.key || g.k}`} g={g} state={checkSwitch(plan, lane.r, g.k, s)} read={lane.read} via={r.via} hot={b.hot !== null && b.hot === factOf(c)} />
            })}
          </div>
        )
      })}

      <OutcomePanel
        plan={plan}
        geo={geo}
        led={ledState(plan, s, landed)}
        tone={tone}
        play={spring}
        screens={b.screens}
        appId={b.appId}
        columns={props.columns}
        changed={props.changed}
        expected={props.expected}
        weaker={props.weaker}
        note={b.outNote}
        onNote={b.onOutNote}
        onOpenRule={props.onOpenRule}
        onOpenPolicy={props.onOpenPolicy}
      />
    </>
  )
}
