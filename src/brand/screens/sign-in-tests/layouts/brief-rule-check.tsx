import { Lock, Plus } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import type { FormField } from '../../testing/sign-in-form'
import { checkPhase, type CheckRow, type EngineRule, type EngineRun } from '../engine-run'
import { policyWhy, traceResult } from '../journey'
import type { CiteId } from './brief-model'
import { Card, Mark, Num, Skel, type CardState } from './brief-parts'

/* -----------------------------------------------------------------------------
   Two more evidence cards (BriefLayout.tsx):
     Rule   the deciding policy's rules in order, each with a pip per check
            the engine read — a spinner as it reads, then ✓ ✕ ? — the first
            match lit green, those after it quiet, the locked last row last
     Check  one check, fact against requirement: the one that decided it by
            default; any rule pressed in the Rule card shows its own here,
            its read checks as tabs across the top
   -------------------------------------------------------------------------- */

const MAX_RULES = 7

export interface RuleProps {
  n: number | undefined
  plan: EngineRun
  s: number
  landed: boolean
  /** The rules are known: the policy has opened. */
  open: boolean
  sel: number | null
  onSel: (i: number | null) => void
  state: CardState
  lit: boolean
  litRow: string | null
  tone: string
  animate: boolean
  onHot: (c: CiteId | null) => void
}

function subOf(r: EngineRule, result: string): string {
  if (result === 'matched') return `Then ${DECISION_WORDS[r.decision]}`
  if (result === 'missed' || result === 'folded') {
    const c = r.failing !== null ? r.checks[r.failing] : undefined
    return c ? c.line || c.say : 'No match'
  }
  if (result === 'unknown') {
    const c = r.checks.find((x) => x.status === 'unknown')
    return c ? `Can’t tell: ${c.word.toLowerCase()} not stated` : 'Can’t tell: a fact is not stated'
  }
  if (result === 'possible') return `If not · ${DECISION_WORDS[r.decision]}`
  if (result === 'off') return 'Switched off'
  return ''
}

export function RuleCard(p: RuleProps) {
  const { plan, s } = p
  const rules = plan.rules
  const land = plan.landing ?? rules.length - 1
  const start = rules.length <= MAX_RULES ? 0 : Math.min(Math.max(0, land - 3), rules.length - MAX_RULES)
  const shown = rules.slice(start, start + MAX_RULES)
  const below = rules.length - start - shown.length
  const name = plan.decider?.name ?? ''
  const selRule = p.sel !== null ? rules[p.sel] : undefined
  const foot = !p.landed && !selRule ? '' : selRule ? `Rule ${selRule.index === null ? '·' : selRule.index + 1}: ${selRule.name}` : policyWhy(plan)
  return (
    <Card cite="rule" n={p.n} title={p.open && name ? `Rules in ${name}` : 'Rules'} state={p.state} lit={p.lit} animate={p.animate} onHot={p.onHot} foot={foot || undefined}>
      {start > 0 && <p className="rl-brief__more">{start} above</p>}
      <ol className="rl-brief__rows">
        {shown.map((r, j) => {
          const i = start + j
          const result = traceResult(r, s)
          const n = r.index === null ? null : r.index + 1
          const reading = result === 'reading'
          const lastRow = r.index === null
          const landedHere = p.landed && i === plan.landing && (result === 'matched' || lastRow)
          const cls = [
            'rl-brief__row is-rule',
            !p.open ? 'is-waiting' : '',
            reading ? 'is-working' : '',
            result === 'matched' || (landedHere && lastRow) ? `is-pass${p.landed ? ` is-${p.tone}` : ''}` : '',
            result === 'missed' || result === 'folded' ? 'is-passed is-miss' : '',
            result === 'unknown' ? 'is-passed is-unknown' : '',
            result === 'not-reached' || result === 'off' || (p.open && result === 'waiting' && p.landed) ? 'is-dim' : '',
            p.sel === i ? 'is-sel' : '',
            p.litRow === r.node ? 'is-litrow' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const pips = r.checks.slice(0, r.checked).map((c, k) => ({ c, k, ph: checkPhase(r, k, s) })).filter((x) => x.ph !== 'hidden')
          const sub = p.open ? subOf(r, result) : ''
          /* What the row will say once settled, held blank until then: the card never grows as the run plays. */
          const later = sub ? '' : subOf(r, traceResult(r, plan.steps.length - 1))
          return (
            <li key={r.id} className={cls}>
              <button
                type="button"
                className="rl-brief__rowbtn"
                data-node={r.node}
                aria-pressed={p.sel === i}
                disabled={!p.open || reading || (result === 'waiting' && !p.landed)}
                onClick={() => p.onSel(p.sel === i ? null : i)}
                title={r.name}
              >
                <Num n={n} />
                <span className="rl-brief__rowtext">
                  <span className={`rl-brief__rowname${p.open ? '' : ' is-blank'}`}>{r.name}</span>
                  {sub && <span className="rl-brief__rowsub">{sub}</span>}
                  {!sub && later && (
                    <span className="rl-brief__rowsub is-later" aria-hidden>
                      {later}
                    </span>
                  )}
                </span>
                <span className="rl-brief__pips">
                  {pips.map(({ c, k, ph }) => (
                    <Mark key={c.key || k} status={c.status} working={ph === 'working'} label={`${c.word}: ${c.line || c.status}`} pop={p.animate} />
                  ))}
                  {lastRow && landedHere && <Lock size={12} strokeWidth={2.4} aria-label="Nothing else matched decides" />}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {below > 0 && <p className="rl-brief__more">{below} more</p>}
    </Card>
  )
}

// --- Check -------------------------------------------------------------------------------

export interface CheckProps {
  n: number | undefined
  plan: EngineRun
  s: number
  rule: number
  check: number
  /** The decided check is the one shown (no other rule pressed). */
  decisive: boolean
  onCheck: (k: number) => void
  onBack: () => void
  onAdd: (f: FormField) => void
  state: CardState
  lit: boolean
  animate: boolean
  onHot: (c: CiteId | null) => void
}

const STATUS_WORD: Record<CheckRow['status'], string> = { pass: 'Passes', fail: 'Fails', unknown: 'Can’t tell' }

export function CheckCard(p: CheckProps) {
  const r = p.plan.rules[p.rule]
  const read = r ? r.checks.slice(0, Math.max(r.checked, 0)) : []
  const c = r?.checks[p.check]
  const ph = r && c ? checkPhase(r, p.check, p.s) : 'hidden'
  const ruleNo = r ? (r.index === null ? 'Last row' : `Rule ${r.index + 1}`) : ''
  const viaSay = c && c.category === 'who' && c.status === 'pass' && r?.via?.matches ? r.via.say : ''
  const subs = c ? c.subs.filter((x) => x.label || x.actual || x.required).slice(0, 3) : []
  const foot = !c || ph !== 'settled' || p.decisive ? undefined : (
    <button type="button" className="rl-brief__linkbtn" onClick={p.onBack}>
      Back to the check that decided it
    </button>
  )
  return (
    <Card cite="check" n={p.n} title={c ? `${c.word} · ${ruleNo.toLowerCase()}` : 'Check'} state={p.state} lit={p.lit} animate={p.animate} onHot={p.onHot} foot={foot}>
      {read.length > 1 && (
        <div className="rl-brief__tabs" role="group" aria-label={`${ruleNo} checks`}>
          {read.map((x, k) => {
            const xp = r ? checkPhase(r, k, p.s) : 'hidden'
            if (xp === 'hidden') return null
            return (
              <button key={x.key || k} type="button" className={`rl-brief__tab${k === p.check ? ' is-on' : ''}`} aria-pressed={k === p.check} onClick={() => p.onCheck(k)}>
                {x.word}
                <Mark status={x.status} working={xp === 'working'} />
              </button>
            )
          })}
        </div>
      )}
      {!c || ph === 'hidden' ? (
        <div className="rl-brief__vs is-waiting">
          <Skel w="40%" />
          <Skel w="80%" />
          <Skel w="55%" />
        </div>
      ) : (
        <div className={`rl-brief__vs is-${ph === 'working' ? 'working' : c.status}`}>
          <span className="rl-brief__vslabel">Sign-in shows</span>
          <span className="rl-brief__vsval">
            {c.missing ? 'Not stated' : c.value}
            {viaSay && <span className="rl-brief__vsvia"> · {viaSay}</span>}
            {c.missing && ph === 'settled' && (
              <button type="button" className="rl-brief__add" onClick={() => p.onAdd(c.missing!)}>
                <Plus size={12} strokeWidth={2.4} aria-hidden />
                Add
              </button>
            )}
          </span>
          <span className="rl-brief__vsrel">
            <span className="rl-brief__vsline" aria-hidden />
            <Mark key={`${p.rule}:${p.check}:${ph}`} status={c.status} working={ph === 'working'} pop={p.animate} />
            <span className="rl-brief__vsword">{ph === 'working' ? 'Reading' : STATUS_WORD[c.status]}</span>
            <span className="rl-brief__vsline" aria-hidden />
          </span>
          <span className="rl-brief__vslabel">Rule needs</span>
          <span className="rl-brief__vsval">{c.requirement}</span>
          {ph === 'settled' && subs.length > 1 && (
            <ul className="rl-brief__subs">
              {subs.map((x) => (
                <li key={x.key} className={`is-${x.status}`}>
                  <span className="rl-brief__sublabel">{x.label}</span>
                  <span className="rl-brief__subval" title={`${x.actual || 'Not stated'} · needs ${x.required}`}>
                    {x.actual || 'Not stated'}
                  </span>
                  <Mark status={x.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
