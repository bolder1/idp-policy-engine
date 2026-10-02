import type { ReactNode } from 'react'
import { Check, CircleHelp, Lock, TriangleAlert, X, type LucideIcon } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { LineStatus } from '../../testing/evidence'
import type { PolicyConflict, RuleConflict, Via } from '../conflicts'
import { checkPhase, policyPhase, type CheckRow, type EnginePolicy, type EngineRule } from '../engine-run'
import { traceResult } from '../journey'
import { Spinner } from '../PolicyStack'
import { lowerFirst, readChecks, reasonWords, shortCheck, thenWords } from './pulse-words'

/* -----------------------------------------------------------------------------
   Pulse's cards (PulseLayout.tsx): the small card pinned to each beat. Short
   by default — the name and what was found, a mark per check — and, where
   the playhead stands (or pressed), its detail: each check's fact and what
   the rule needs, apart; a policy's reason. The card is a real button: a
   press puts the playhead on it.
   -------------------------------------------------------------------------- */

const MARK: Record<LineStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Passed' },
  fail: { Icon: X, label: 'Failed' },
  unknown: { Icon: CircleHelp, label: "Can't tell" },
}

export function Mark({ status, working = false }: { status: LineStatus; working?: boolean }) {
  if (working) return <Spinner small />
  const { Icon, label } = MARK[status]
  return (
    <span className={`rl-pulse__mark is-${status}`} role="img" aria-label={label}>
      <Icon size={13} strokeWidth={2.6} aria-hidden />
    </span>
  )
}

export function Num({ n }: { n: string | number | null }) {
  return (
    <span className="rl-pulse__num" aria-hidden>
      {n === null || n === '✱' ? <Lock size={11} strokeWidth={2.2} /> : n}
    </span>
  )
}

/* The card shell: a button, its head, its lines, its detail when focused. */
export function Card({
  className,
  node,
  focus,
  label,
  onPick,
  head,
  children,
  detail,
}: {
  className: string
  node?: string
  focus: boolean
  label: string
  onPick: () => void
  head: ReactNode
  children?: ReactNode
  detail?: ReactNode
}) {
  return (
    <button type="button" className={`rl-pulse__card ${className}${focus ? ' is-focus' : ''}`} data-card data-node={node} aria-pressed={focus} aria-label={label} onClick={onPick}>
      <span className="rl-pulse__cardhead">{head}</span>
      {children}
      {focus && detail && <span className="rl-pulse__detail">{detail}</span>}
    </button>
  )
}

/** One fact against what the rule needs, apart; then the mark. */
export function FactRow({ word, fact, by, need, status }: { word: string; fact: string; by?: string; need: string; status: LineStatus }) {
  return (
    <span className={`rl-pulse__fact is-${status}`}>
      <span className="rl-pulse__fword">{word}</span>
      <span className="rl-pulse__ftext">
        <span className="rl-pulse__fval">
          {fact}
          {by && <span className="rl-pulse__fvia"> · {by}</span>}
        </span>
        {need && <span className="rl-pulse__fneed">needs {lowerFirst(need)}</span>}
      </span>
      <Mark status={status} />
    </span>
  )
}

const viaOf = (c: CheckRow, via?: Via): string => (c.category === 'who' && c.status === 'pass' && via?.matches ? via.say : '')

/** A check's detail: the fact and the need; a check of parts (a device profile, a zone's halves), part by part. */
export function CheckDetail({ c, via }: { c: CheckRow; via?: Via }) {
  const parts = c.subs.filter((x) => x.label || x.actual || x.required)
  return (
    <>
      <FactRow word={c.word} fact={c.missing ? 'Not stated' : c.value} by={viaOf(c, via)} need={c.requirement} status={c.status} />
      {parts.length > 1 && (
        <span className="rl-pulse__parts">
          {parts.map((x) => (
            <FactRow key={x.key} word={x.label} fact={x.actual || 'Not stated'} need={x.required} status={x.status} />
          ))}
        </span>
      )}
    </>
  )
}

export function Lines({ lines, fix }: { lines: readonly string[]; fix?: string }) {
  const said = [...new Set(lines.filter((l) => l && l.trim() !== ''))]
  return (
    <>
      {said.map((l, i) => (
        <span key={l} className={`rl-pulse__dline${i === 0 ? ' is-lead' : ''}`}>
          {l}
        </span>
      ))}
      {fix && <span className="rl-pulse__dfix">{fix}</span>}
    </>
  )
}

// --- A policy --------------------------------------------------------------------------------------

export function PolicyCard({
  p,
  s,
  role,
  first,
  appName,
  via,
  cover,
  ruleWhy,
  findings,
  focus,
  onPick,
  landedTone,
}: {
  p: EnginePolicy
  s: number
  role: 'decider' | 'passed' | 'also'
  first: string
  appName: string
  /** How the deciding policy covers the person: "via Engineering". */
  via: string
  cover?: PolicyConflict
  ruleWhy: string
  findings: { lines: string[]; fix?: string }
  focus: boolean
  onPick: () => void
  landedTone: string | null
}) {
  const working = policyPhase(p, s) === 'working' || (p.foundAt !== null && s >= p.foundAt && s < p.settleAt)
  const name = (
    <span className="rl-pulse__name" title={p.name}>
      {p.name}
    </span>
  )
  if (role === 'decider') {
    const sub = working ? 'Checking who it covers' : p.isGlobalDefault ? `No policy above covers ${first}` : `Covers ${first}${via ? ` ${via}` : ''}`
    return (
      <Card
        className={`is-policy is-decider${working ? ' is-working' : landedTone ? ` is-path is-${landedTone}` : ' is-path'}`}
        node={p.node}
        focus={focus}
        label={`Policy ${p.order}, ${p.name}: ${sub}`}
        onPick={onPick}
        head={
          <>
            <Num n={p.order} />
            {name}
            {working ? <Spinner small /> : <Mark status="pass" />}
          </>
        }
        detail={<Lines lines={[p.isGlobalDefault ? `No policy above it covers ${first}: the Global Default applies` : `The first policy on ${appName} that covers ${first}`, ruleWhy, p.tip, ...findings.lines]} fix={findings.fix} />}
      >
        <span className={`rl-pulse__sub${working ? '' : ' is-pass'}`}>{sub}</span>
      </Card>
    )
  }
  if (role === 'also') {
    const pc = cover
    const would = pc
      ? pc.status === 'decided' && pc.decision
        ? `On its own: ${DECISION_WORDS[pc.decision]}${pc.ruleNumber !== null ? ` · rule ${pc.ruleNumber}` : ''}`
        : pc.possible.length > 0
          ? `On its own: ${pc.possible.map((d) => DECISION_WORDS[d]).join(' or ')}`
          : ''
      : ''
    const conflict = !!pc && pc.decisionDiffers
    return (
      <Card
        className={`is-policy is-also${conflict ? ' is-conflict' : ''}`}
        node={p.node}
        focus={focus}
        label={`Policy ${p.order}, ${p.name}: also covers ${first}, not used`}
        onPick={onPick}
        head={
          <>
            <Num n={p.order} />
            {name}
          </>
        }
        detail={<Lines lines={[pc ? `Covers ${first} ${pc.via.say}`.trim() : `Also covers ${first}`, pc?.notUsed ?? '', would]} fix={pc?.fix || findings.fix} />}
      >
        <span className="rl-pulse__sub is-tag">
          {conflict && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
          Also covers {first} · not used
        </span>
      </Card>
    )
  }
  return (
    <Card
      className={`is-policy is-passed${working ? ' is-working' : ''}`}
      node={p.node}
      focus={focus}
      label={`Policy ${p.order}, ${p.name}: ${p.reason || 'not used'}`}
      onPick={onPick}
      head={
        <>
          <Num n={p.order} />
          {name}
          {working && <Spinner small />}
        </>
      }
      detail={<Lines lines={[p.reason || 'Not used', p.tip, ...findings.lines]} fix={findings.fix} />}
    >
      <span className="rl-pulse__sub">{working ? 'Checking who it covers' : reasonWords(p.reason, first)}</span>
    </Card>
  )
}

// --- A rule ----------------------------------------------------------------------------------------

export function RuleCard({
  r,
  s,
  first,
  clash,
  focus,
  onPick,
  landedTone,
  matchedFirst,
}: {
  r: EngineRule
  s: number
  first: string
  clash?: RuleConflict
  focus: boolean
  onPick: () => void
  landedTone: string | null
  matchedFirst: string
}) {
  const n = r.index === null ? null : r.index + 1
  const name = (
    <span className="rl-pulse__name" title={r.name}>
      {r.name}
    </span>
  )
  const head = (mark: ReactNode) => (
    <>
      <Num n={n} />
      {name}
      {mark}
    </>
  )
  if (clash) {
    const conflict = clash.kind === 'conflict'
    return (
      <Card
        className={`is-rule is-also${conflict ? ' is-conflict' : ''}`}
        node={r.node}
        focus={focus}
        label={`Rule ${n ?? ''} ${r.name}: also applies to ${first}, not used`}
        onPick={onPick}
        head={head(null)}
        detail={<Lines lines={[`Also applies to ${first} ${clash.via.say}`.trim(), clash.notUsed, `Then ${thenWords(r)}`]} fix={clash.fix ? `${clash.fix}${clash.caution ? `. ${clash.caution}` : ''}` : undefined} />}
      >
        <span className="rl-pulse__sub is-tag">
          {conflict && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
          {clash.match === 'unknown' ? 'Might apply' : 'Also applies'} {clash.via.say} · not used
        </span>
      </Card>
    )
  }
  if (r.state === 'off') {
    return (
      <Card className="is-rule is-passed is-off" node={r.node} focus={focus} label={`Rule ${n ?? ''} ${r.name}: switched off`} onPick={onPick} head={head(null)} detail={<Lines lines={['Switched off: passed over, nothing asked', `Then ${thenWords(r)}`]} />}>
        <span className="rl-pulse__sub">Switched off</span>
      </Card>
    )
  }
  const result = traceResult(r, s)
  const shown = readChecks(r)
    .map((c, k) => ({ c, k, phase: checkPhase(r, k, s) }))
    .filter((x) => x.phase !== 'hidden')
  const rowWorking = shown.some((x) => x.phase === 'working')
  const working = result === 'reading' || result === 'waiting'
  const matched = result === 'matched'
  const mark =
    working ? (rowWorking ? null : <Spinner small />) : matched ? <Mark status="pass" /> : result === 'missed' || result === 'folded' ? <Mark status="fail" /> : result === 'unknown' || result === 'possible' ? <Mark status="unknown" /> : null
  const ring = working ? ' is-working' : matched ? ` is-path${landedTone ? ` is-${landedTone}` : ''}` : result === 'possible' || result === 'unknown' ? ' is-unknown' : ' is-missed'
  const said = matched ? 'matches' : result === 'missed' || result === 'folded' ? 'no match' : result === 'unknown' ? "can't tell" : result === 'possible' ? 'if not' : 'reading'
  const lastRow = r.index === null
  return (
    <Card
      className={`is-rule${ring}`}
      node={r.node}
      focus={focus}
      label={`Rule ${n ?? 'last'} ${r.name}: ${said}`}
      onPick={onPick}
      head={head(mark)}
      detail={
        <>
          {shown.length > 0 ? (
            shown.filter((x) => x.phase === 'settled').map(({ c, k }) => <CheckDetail key={c.key || k} c={c} via={r.via} />)
          ) : (
            <Lines lines={[lastRow ? (matched ? `No rule above matched: ${matchedFirst}` : 'Reached only if no rule above matches') : 'Nothing asked']} />
          )}
          <span className="rl-pulse__dthen">
            <span className="rl-pulse__fword">Then</span>
            <span>{thenWords(r)}</span>
            {!matched && <span className="rl-pulse__dquiet">{result === 'unknown' ? "· can't tell, read on" : '· not used'}</span>}
          </span>
        </>
      }
    >
      {shown.length > 0 ? (
        <span className="rl-pulse__checks">
          {shown.map(({ c, k, phase }) => (
            <span key={c.key || k} className={`rl-pulse__check is-${phase === 'working' ? 'working' : c.status}`}>
              <Mark status={c.status} working={phase === 'working'} />
              <span className="rl-pulse__ctext">{phase === 'working' ? `Checking ${c.word.toLowerCase()}` : shortCheck(c, r.via)}</span>
            </span>
          ))}
        </span>
      ) : lastRow && !working ? (
        <span className={`rl-pulse__sub${matched ? ' is-pass' : ''}`}>{matched ? 'No rule above matched' : 'If no rule above matches'}</span>
      ) : null}
    </Card>
  )
}
