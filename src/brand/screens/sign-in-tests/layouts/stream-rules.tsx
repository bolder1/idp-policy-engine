import { motion } from 'motion/react'
import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { DECISION_WORDS } from '../../../decision-words'
import type { RuleConflict, Via } from '../conflicts'
import { checkPhase, type CheckRow, type EngineRule } from '../engine-run'
import { traceResult } from '../journey'
import { Spinner } from '../PolicyStack'
import { G, type Slot } from './stream-geometry'
import type { Tone } from './stream-model'
import { FactNeed, Gate, Mark, NoteLines, Num, Peek, Sensor, lowerFirst, type GateState, type SensorState } from './stream-parts'

/* -----------------------------------------------------------------------------
   The RULE gates inside the open channel (StreamLayout.tsx), in order down
   the rules' trunk. Each tests the stream with its checks — the sensors on
   the gate, one per check, lighting as the engine reads them: ✓, or ✕ with a
   red glint. A gate whose check fails stays shut and the stream diverts down
   to the next; the first that opens lets it through to its pool. "Nothing
   else matched" is the last gate, always open. The one the stream passes
   through stands open: what the sign-in showed against what the rule needs.
   -------------------------------------------------------------------------- */

const viaOf = (c: CheckRow, via?: Via): string => (c.category === 'who' && c.status === 'pass' && via?.matches ? via.say : '')

/** What a rule passed over says, in one line: what ended it. */
function missLine(r: EngineRule): { status: 'fail' | 'unknown' | 'off'; text: string } {
  if (r.state === 'off') return { status: 'off', text: 'Switched off' }
  if (r.state === 'unknown' || r.state === 'possible') {
    const c = r.checks.find((x) => x.status === 'unknown')
    return { status: 'unknown', text: c ? `${c.word} · not stated` : "Can't tell" }
  }
  const c = r.failing !== null ? r.checks[r.failing] : undefined
  return { status: 'fail', text: c?.line || r.miss || c?.say || 'No match' }
}

function sensorOf(r: EngineRule, k: number, s: number, settled: boolean): SensorState {
  if (!r.visited) return 'idle'
  const ph = checkPhase(r, k, s)
  if (ph === 'hidden') return settled && k >= r.checked ? 'skipped' : 'idle'
  if (ph === 'working') return 'working'
  return r.checks[k].status
}

/* A rule's checks as the note says them: each the fact against what it needs. */
function ChecksNote({ r, upTo, then }: { r: EngineRule; upTo: number; then: string }) {
  const read = r.checks.slice(0, upTo)
  return (
    <>
      {read.length > 0 ? (
        <ul className="rl-stream__parts">
          {read.map((c, k) => (
            <li key={c.key || k}>
              <FactNeed word={c.word} fact={c.missing ? 'Not stated' : c.value} via={viaOf(c, r.via)} need={c.requirement} status={c.status} />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="rl-stream__notethen">
        <span className="rl-stream__fnword">Then</span>
        <span>{then}</span>
      </p>
    </>
  )
}

/* One check of the rule the stream passed through: a press says how each of its parts was read. */
function CheckLine({ c, via, id, working }: { c: CheckRow; via?: Via; id: string; working: boolean }) {
  const parts = c.subs.filter((x) => x.label || x.actual || x.required)
  const note: ReactNode =
    parts.length <= 1 ? (
      <NoteLines lines={[c.line || c.say || c.tip]} />
    ) : (
      <ul className="rl-stream__parts">
        {parts.map((x) => (
          <li key={x.key}>
            <FactNeed word={x.label} fact={x.actual || 'Not stated'} need={x.required} status={x.status} />
          </li>
        ))}
      </ul>
    )
  const body = (
    <>
      <span className="rl-stream__cword">{c.word}</span>
      <span className="rl-stream__ctext">
        <span className="rl-stream__cfact" title={c.missing ? 'Not stated' : c.value}>
          {c.missing ? 'Not stated' : c.value}
          {viaOf(c, via) && !working && <span className="rl-stream__fnvia"> · {viaOf(c, via)}</span>}
        </span>
        {c.requirement && (
          <span className="rl-stream__cneed" title={c.requirement}>
            <span className="rl-stream__fnjoin">needs </span>
            {lowerFirst(c.requirement)}
          </span>
        )}
      </span>
      <Mark status={c.status} working={working} label={working ? undefined : c.line || undefined} />
    </>
  )
  if (working) return <li className="rl-stream__check is-working">{body}</li>
  return (
    <li className={`rl-stream__check is-${c.status}`}>
      <Peek id={id} className="rl-stream__crow" label={`${c.word}: how it was read`} note={note} side="right">
        {body}
      </Peek>
    </li>
  )
}

export function RuleGate({
  r,
  slot,
  s,
  open,
  shown,
  landed,
  tone,
  animate,
  first,
  matchedFirst,
  clash,
}: {
  r: EngineRule
  slot: Slot
  s: number
  /** The rule the walk stops at: it stands open. */
  open: boolean
  shown: boolean
  landed: boolean
  tone: Tone
  animate: boolean
  first: string
  matchedFirst: string
  clash?: RuleConflict
}) {
  const n = r.index === null ? null : r.index + 1
  const result = traceResult(r, s)
  const reading = result === 'reading'
  const settledRule = result !== 'waiting' && result !== 'reading'
  const then = r.index === null && r.state === 'possible' ? `If not · ${DECISION_WORDS[r.decision]}` : DECISION_WORDS[r.decision]
  const passes = open && (result === 'matched' || result === 'possible' || (r.index === null && settledRule))
  const also = landed && clash !== undefined && !open
  const gate: GateState = !shown
    ? 'idle'
    : passes
      ? 'open'
      : reading
        ? 'working'
        : also || result === 'unknown'
          ? 'ajar'
          : settledRule && result !== 'not-reached'
            ? 'shut'
            : 'idle'
  const markAt = (k: number) => r.markAt[k]
  const sensors = r.checks.map((c, k) => ({ c, k, st: sensorOf(r, k, s, settledRule) }))
  const current = reading ? sensors.filter((x) => x.st !== 'idle').at(-1) : undefined

  let state: string
  let sub: ReactNode
  let note: ReactNode
  if (!shown || result === 'waiting') {
    state = 'is-waiting'
    sub = <span className="rl-stream__subtext is-quiet">{r.index === null ? 'Always open' : ''}</span>
    note = <NoteLines lines={[r.index === null ? 'The last gate: whatever no rule above lets through' : 'Not read yet', `Then ${then}`]} />
  } else if (reading) {
    state = 'is-working'
    sub = current ? <span className="rl-stream__subtext">{`${current.c.word} · ${current.c.missing ? 'Not stated' : current.c.value}`}</span> : <span className="rl-stream__subtext">Reading</span>
    note = null
  } else if (passes) {
    state = `is-open${landed ? ` is-${tone}` : ''}${r.index === null ? ' is-last' : ''}`
    sub = <span className="rl-stream__subtext">{r.index === null ? (r.state === 'possible' ? 'If none above matches' : 'No rule above matched') : 'Matches'}</span>
    note = <ChecksNote r={r} upTo={r.checked} then={then} />
  } else if (also && clash) {
    const conflict = clash.kind === 'conflict'
    state = `is-also${conflict ? ' is-conflict' : ''}`
    sub = (
      <>
        {conflict && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
        <span className="rl-stream__subtext">{`${clash.match === 'unknown' ? 'Might apply' : 'Also applies'} to ${first} · not used`}</span>
      </>
    )
    note = <NoteLines lines={[`Also applies to ${first} ${clash.via.say}`.trim(), clash.notUsed, `Then ${then}`]} fix={clash.fix ? `${clash.fix}${clash.caution ? `. ${clash.caution}` : ''}` : undefined} />
  } else if (result === 'not-reached' || (landed && !r.visited)) {
    state = 'is-quiet'
    sub = <span className="rl-stream__subtext">{r.state === 'off' ? 'Switched off' : ''}</span>
    note = <NoteLines lines={[r.state === 'off' ? 'Switched off' : `Not read: ${matchedFirst}`, `Then ${then}`]} />
  } else {
    const m = missLine(r)
    state = `is-shut is-${m.status}`
    sub = <span className="rl-stream__subtext">{m.text}</span>
    note = m.status === 'off' ? <NoteLines lines={['Switched off: passed over, nothing asked']} /> : <ChecksNote r={r} upTo={Math.max(r.checked, r.failing !== null ? r.failing + 1 : 0)} then={`${then} · not used`} />
  }

  const head: ReactNode = reading ? (
    current?.st === 'working' ? null : <Spinner small />
  ) : passes && landed && r.state !== 'possible' ? (
    <Mark status="pass" label="Opens" />
  ) : state.startsWith('is-shut is-fail') ? (
    <Mark status="fail" label="Stays shut" />
  ) : result === 'unknown' ? (
    <Mark status="unknown" />
  ) : null

  const showChecks = open && r.checks.length > 0 && shown
  const rows = showChecks ? r.checks.map((c, k) => ({ c, k, ph: checkPhase(r, k, s) })).filter((x) => x.k < r.checked && (landed || x.ph !== 'hidden')) : []

  return (
    <motion.div
      className={`rl-stream__rule ${state}`}
      style={{ left: G.RULE_X, width: G.RULE_W }}
      initial={false}
      animate={{ top: slot.top, height: slot.h }}
      transition={{ duration: animate ? 0.42 : 0, ease: [0.4, 0, 0.2, 1] }}
    >
      <Peek
        id={r.node}
        node={r.node}
        className="rl-stream__card rl-stream__rulebtn"
        label={`${n === null ? 'Last gate' : `Rule ${n}`} ${r.name}. Its checks`}
        note={note}
        side={open ? 'right' : 'below'}
      >
        <span className="rl-stream__head">
          <Num n={n} />
          <span className="rl-stream__name" title={r.name}>
            {r.name}
          </span>
          {head}
        </span>
        <span className="rl-stream__sub">
          {sensors.length > 0 && r.index !== null && (
            <span className="rl-stream__sensors">
              {sensors.map(({ c, k, st }) => (
                <Sensor key={`${c.key || k}:${st === 'fail' ? markAt(k) : ''}`} category={c.category} word={c.word} state={st} />
              ))}
            </span>
          )}
          {sub}
          {(state === 'is-waiting' || state === 'is-quiet') && (
            <span className="rl-stream__leads" title={`Then ${then}`}>
              → {DECISION_WORDS[r.decision]}
            </span>
          )}
        </span>
        <span className="rl-stream__groove" aria-hidden />
      </Peek>
      <Gate state={gate} tone={landed ? tone : 'pending'} animate={animate} style={{ top: G.LANE - 11 }} />
      {open && slot.h > G.CARD_H && (
        <div className="rl-stream__open" style={{ top: G.CARD_H }}>
          {rows.length > 0 && (
            <ul className="rl-stream__checks">
              {rows.map(({ c, k, ph }) => (
                <CheckLine key={c.key || k} c={c} via={r.via} id={`${r.node}:${c.key || k}`} working={!landed && ph === 'working'} />
              ))}
            </ul>
          )}
          {passes && (
            <p className="rl-stream__then">
              <span className="rl-stream__cword">Then</span>
              <span className="rl-stream__thenword">{then}</span>
            </p>
          )}
        </div>
      )}
    </motion.div>
  )
}
