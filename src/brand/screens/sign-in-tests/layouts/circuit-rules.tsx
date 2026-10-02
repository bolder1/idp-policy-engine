import { ArrowUpRight, Lock, TriangleAlert } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { RuleConflict, Via } from '../conflicts'
import type { CheckRow, EnginePolicy, EngineRule } from '../engine-run'
import { PCARD_W, PCARD_X, ROW_H, type LaneGeo, type PolRow, type SwitchGeo } from './circuit-geometry'
import type { SwitchState, Tone } from './circuit-model'
import { CheckParts, Mark, NoteLines, Poke } from './circuit-note'
import { lowerFirst } from './circuit-note-ctx'

/* -----------------------------------------------------------------------------
   The board's components (CircuitLayout.tsx): a policy on the selector, a
   rule's circuit (its lane) and the label under each of its switches — each
   a button that says why, the switches' on hover too.
   -------------------------------------------------------------------------- */

const reasonWords = (reason: string, first: string): string => (/ is not in (it|this policy)$/.test(reason) ? `Doesn't cover ${first}` : reason)

export interface PolicyNote {
  appName: string
  deciderName: string
  deciderVia: string
  ruleWhy: string
  /** This policy, a later one that also covers the person. */
  cover?: { via: Via; notUsed: string; fix: string; would: string }
  findings: string[]
  fix?: string
}

/* One policy on the selector: its number, its name, and why its switch
   stands as it does — covers (via …), does not cover, not reached. */
export function PolicyCard({ p, row, sw, first, tone, landed, conflict, note }: { p: EnginePolicy; row: PolRow; sw: SwitchState; first: string; tone: Tone; landed: boolean; conflict: boolean; note: PolicyNote }) {
  const decides = p.decides && (sw === 'closed' || sw === 'closing')
  const sub =
    sw === 'testing'
      ? 'Checking who it covers'
      : decides
        ? p.isGlobalDefault
          ? `None above covers ${first}`
          : note.deciderVia
            ? `Covers ${first} ${note.deciderVia}`
            : `First that covers ${first}`
        : sw === 'also'
          ? `Also covers ${first} · not used`
          : sw === 'idle'
            ? landed
              ? p.reason && !/^not reached$/i.test(p.reason)
                ? p.reason
                : 'Not reached'
              : ''
            : reasonWords(p.reason, first) || 'Not used'
  const lines = decides
    ? [p.isGlobalDefault ? `No policy above it covers ${first}: the Global Default applies` : `The first policy on ${note.appName} that covers ${first}${note.deciderVia ? `, ${note.deciderVia}` : ''}`, note.ruleWhy, p.tip, ...note.findings]
    : sw === 'also' && note.cover
      ? [`Covers ${first} ${note.cover.via.say}`.trim(), note.cover.notUsed, note.cover.would]
      : sw === 'idle'
        ? [landed ? `Not read: ${note.deciderName || 'an earlier policy'} applies first` : 'Not read yet', p.reason, p.tip]
        : [p.reason || 'Not used', p.tip, ...note.findings]
  const cls = `rl-circuit__pol is-${sw}${decides && landed ? ` is-tone-${tone}` : ''}${conflict ? ' is-conflict' : ''}`
  return (
    <Poke
      id={p.node}
      node={p.node}
      className={cls}
      style={{ left: PCARD_X, top: row.top, width: PCARD_W, height: ROW_H }}
      label={`${p.order}. ${p.name}: ${sub || 'not read yet'}. Why`}
      note={<NoteLines lines={lines} fix={sw === 'also' ? note.cover?.fix : note.fix} />}
    >
      <span className="rl-circuit__num" aria-hidden>
        {p.order}
      </span>
      <span className="rl-circuit__poltext">
        <span className="rl-circuit__polname" title={p.name}>
          {p.name}
        </span>
        {sub && (
          <span className="rl-circuit__polsub">
            {sw === 'also' && conflict && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
            {sub}
          </span>
        )}
      </span>
    </Poke>
  )
}

export type LaneState = 'idle' | 'reading' | 'matched' | 'dead' | 'unknown' | 'off' | 'possible'

/** The box a rule's circuit sits on: drawn under the traces. */
export function LaneBox({ lane, laneX, laneW, state, tone, landed }: { lane: LaneGeo; laneX: number; laneW: number; state: LaneState; tone: Tone; landed: boolean }) {
  const live = landed && (state === 'matched' || state === 'possible')
  return <div className={`rl-circuit__lane is-${state}${live ? ` is-tone-${tone}` : ''}`} style={{ left: laneX, top: lane.top, width: laneW, height: lane.h }} aria-hidden />
}

/* A rule's title row: its number (the last row's lock), its name, and what
   the circuit lights when it closes. A press says how it was read. */
export function LaneTitle({
  r,
  lane,
  laneX,
  laneW,
  state,
  first,
  matchedFirst,
  clash,
  onOpen,
}: {
  r: EngineRule
  lane: LaneGeo
  laneX: number
  laneW: number
  state: LaneState
  first: string
  matchedFirst: string
  clash?: RuleConflict
  onOpen: () => void
}) {
  const n = r.index === null ? null : r.index + 1
  const then = r.index === null && r.state === 'possible' ? `If not · ${DECISION_WORDS[r.decision]}` : DECISION_WORDS[r.decision]
  const failing = r.failing !== null ? r.checks[r.failing] : undefined
  const lead =
    state === 'matched'
      ? r.index === null
        ? 'Nothing above matched: this row decides'
        : `Every check closes: rule ${n} decides`
      : state === 'dead'
        ? r.miss || failing?.say || 'A check stays open'
        : state === 'unknown'
          ? "Can't tell: a fact is not stated, the walk reads on"
          : state === 'off'
            ? 'Switched off: passed, nothing asked'
            : state === 'possible'
              ? 'Reached only if no rule above matches'
              : clash
                ? `${clash.match === 'unknown' ? 'Might also apply' : 'Also applies'} to ${first} ${clash.via.say} · not used`
                : `Not read: ${matchedFirst}`
  return (
    <Poke
      id={r.node}
      node={r.node}
      className={`rl-circuit__lanehead is-${state}${clash ? ` is-also${clash.kind === 'conflict' ? ' is-conflict' : ''}` : ''}`}
      style={{ left: laneX + 6, top: lane.top + 4, width: laneW - 12 }}
      label={`${n ? `Rule ${n}` : 'Last row'} ${r.name}: ${lead}`}
      note={
        <>
          <NoteLines lines={[lead, clash?.notUsed, `Then ${then}`]} fix={clash?.fix ? `${clash.fix}${clash.caution ? `. ${clash.caution}` : ''}` : undefined} />
          <button type="button" className="rl-circuit__noteact" onClick={onOpen}>
            {r.index === null ? 'Open the policy' : `Open rule ${n}`}
            <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
          </button>
        </>
      }
    >
      <span className="rl-circuit__num" aria-hidden>
        {n === null ? <Lock size={11} strokeWidth={2.2} /> : n}
      </span>
      <span className="rl-circuit__lanename" title={r.name}>
        {r.name}
      </span>
      {clash && state === 'idle' && (
        <span className="rl-circuit__lanealso">
          {clash.kind === 'conflict' && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
          Also applies
        </span>
      )}
      <span className={`rl-circuit__then is-${r.decision}`}>{then}</span>
    </Poke>
  )
}

const viaOf = (c: CheckRow, via?: Via): string => (c.category === 'who' && c.status === 'pass' && via?.matches ? via.say : '')

/* The label under a switch: what it checks; once read, the sign-in's fact
   and, under it, what the rule needs — never run together into one claim. */
export function SwitchLabel({ c, sw, g, state, read, via, hot }: { c: CheckRow; sw: string; g: SwitchGeo; state: SwitchState; read: boolean; via?: Via; hot: boolean }) {
  const shown = state === 'closed' || state === 'open' || state === 'unknown' || state === 'testing'
  const fact = c.missing ? 'Not stated' : c.value
  const by = state !== 'testing' ? viaOf(c, via) : ''
  const mark = state === 'closed' ? 'pass' : state === 'open' ? 'fail' : state === 'unknown' ? 'unknown' : state === 'skipped' ? 'skip' : null
  const label = shown ? `${c.word}: ${fact}${by ? ` ${by}` : ''}, needs ${lowerFirst(c.requirement)}` : `${c.word}: ${state === 'skipped' ? 'not checked' : 'not read'}`
  return (
    <Poke
      id={sw}
      hover
      className={`rl-circuit__swlabel is-${state}${hot ? ' is-hot' : ''}`}
      style={{ left: g.slotX, top: g.y - 16, width: g.slotW }}
      label={label}
      note={
        shown && state !== 'testing' ? (
          <CheckParts c={c} via={by} />
        ) : (
          <NoteLines lines={[`${c.word} · needs ${lowerFirst(c.requirement)}`, state === 'skipped' ? 'Not checked: an earlier check stayed open' : 'Not read']} />
        )
      }
    >
      <span className="rl-circuit__swhit" aria-hidden />
      <span className="rl-circuit__swword">
        {c.word}
        {mark && <Mark status={mark} />}
      </span>
      {read && shown && (
        <span className="rl-circuit__swfact">
          {by ? <span className="rl-circuit__via">{by}</span> : fact}
        </span>
      )}
      {read && shown && c.requirement && (
        <span className="rl-circuit__swneed">
          needs {lowerFirst(c.requirement)}
        </span>
      )}
      {read && state === 'skipped' && <span className="rl-circuit__swneed">Not checked</span>}
    </Poke>
  )
}

/* A lane with no switches on the board: the last row, closed for good — or a
   rule the walk never reached, whose checks were never read. */
export function LaneChip({ r, lane, laneX, laneW, state }: { r: EngineRule; lane: LaneGeo; laneX: number; laneW: number; state: LaneState }) {
  const last = r.index === null
  const text = last ? 'Always closes' : state === 'off' ? 'Switched off' : 'Not read'
  return (
    <span className={`rl-circuit__chip is-${state}${last ? ' is-last' : ''}`} style={{ left: laneX + laneW / 2, top: lane.trace - 12 }} aria-hidden>
      {last && <Lock size={11} strokeWidth={2.2} aria-hidden />}
      {text}
    </span>
  )
}
