import { ArrowUpRight, Lock, RotateCcw } from 'lucide-react'

import type { CheckRow, EngineRule } from '../engine-run'
import type { PassCtx } from './pass-ctx'
import { sourceRuleIx } from './pass-facts'
import { ruleField, ruleNo, said, stopRow } from './pass-model'
import { Mark, type MarkStatus } from './pass-parts'

/* -----------------------------------------------------------------------------
   The pass's back (PassLayout.tsx): the terms it was issued on — every check
   of the rule that decided, the person's fact beside what the rule asks
   (never one put into the other), then the rules tried before it, each with
   the check it failed on, and the rules never read. Open rule goes to it.
   -------------------------------------------------------------------------- */

const markOf = (s: CheckRow['status']): MarkStatus => (s === 'pass' ? 'pass' : s === 'fail' ? 'fail' : 'unknown')

function factOf(row: CheckRow, r: EngineRule): string {
  if (row.missing) return 'Not stated'
  if (row.category === 'who' && r.via?.say && row.status === 'pass') return `${row.value} · ${r.via.say}`
  return row.value
}

function CheckLine({ row, r, read }: { row: CheckRow; r: EngineRule; read: boolean }) {
  return (
    <li className={`rl-pass__chk is-${read ? row.status : 'unread'}`}>
      <span className="rl-pass__chkword">{row.word}</span>
      <span className="rl-pass__chkfact">
        <span title={factOf(row, r)}>{factOf(row, r)}</span>
        <span className="rl-pass__chkreq" title={row.requirement}>
          needs {row.requirement}
        </span>
        {read && row.subs.length > 1 && (
          <span className="rl-pass__subs">
            {row.subs.slice(0, 4).map((x) => (
              <span key={x.key} className="rl-pass__sub" title={`${x.actual} · ${x.required}`}>
                <Mark status={markOf(x.status)} />
                {x.label}
              </span>
            ))}
          </span>
        )}
      </span>
      {read ? <Mark status={markOf(row.status)} /> : <Mark status="none" label="Not read" />}
    </li>
  )
}

export function PassBack({ c, onFlip, onOpenRule }: { c: PassCtx; onFlip: () => void; onOpenRule: (policyId: string, ruleId: string) => void }) {
  const { plan } = c
  const f = ruleField(plan, c.s, c.landed)
  /* A Depends: the rule that could not tell is the one to read, not the last row. */
  const mainIx = c.landed && plan.outcome.status === 'depends' ? (sourceRuleIx(plan) ?? f.current) : f.current
  const r = mainIx !== null ? plan.rules[mainIx] : undefined
  const tried = c.landed ? [...f.tried, ...(f.current !== null && f.current !== mainIx && plan.rules[f.current]?.index !== null ? [f.current] : [])].filter((i) => i !== mainIx) : f.tried
  const after = mainIx !== null && tried.some((i) => i > mainIx)
  const unread = c.landed ? plan.rules.filter((x, i) => !x.visited && x.state !== 'off' && i !== plan.landing) : []
  const canOpen = r && r.index !== null && c.decider && !c.decider.isGlobalDefault
  return (
    <div className="rl-pass__face is-back">
      <header className="rl-pass__backhead">
        <span className="rl-pass__lbl">Checks</span>
        <strong className="rl-pass__backtitle" title={r?.name}>
          {!r ? 'No rule read yet' : r.index === null ? 'Nothing else matched' : `Rule ${ruleNo(r)} · ${r.name}`}
        </strong>
        <span className="rl-pass__backacts">
          {canOpen && (
            <button type="button" className="rl-pass__link" onClick={() => onOpenRule(c.decider!.policyId, r!.id)}>
              Open rule {ruleNo(r!)}
              <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden />
            </button>
          )}
          <button type="button" className="rl-pass__flipbtn" onClick={onFlip} aria-label="Flip the pass back">
            <RotateCcw size={13} strokeWidth={2.4} aria-hidden />
            Front
          </button>
        </span>
      </header>
      <div className="rl-pass__backbody">
        <section className="rl-pass__backcol">
          {!r ? null : r.index === null ? (
            <p className="rl-pass__backnote">
              <Lock size={12} strokeWidth={2.4} aria-hidden /> No checks: it decides when no rule above it matches.
            </p>
          ) : (
            <ul className="rl-pass__chks">
              {r.checks.map((row, i) => (
                <CheckLine key={row.key} row={row} r={r} read={i < Math.max(r.checked, 0) || c.landed} />
              ))}
            </ul>
          )}
        </section>
        <section className="rl-pass__backcol is-tried">
          <span className="rl-pass__lbl">{after ? 'Other rules read' : tried.length > 0 ? 'Tried before' : 'Before it'}</span>
          {tried.length === 0 ? (
            <p className="rl-pass__backnote">It is the first rule</p>
          ) : (
            <ul className="rl-pass__tries">
              {tried.map((i) => {
                const t = plan.rules[i]
                const row = stopRow(t)
                return (
                  <li key={t.node} className="rl-pass__try">
                    <span className="rl-pass__rno">{ruleNo(t)}</span>
                    <span className="rl-pass__trytext">
                      <span className="rl-pass__tryname" title={t.name}>
                        {t.name}
                      </span>
                      <span className="rl-pass__trywhy">{t.state === 'off' ? 'Switched off' : row ? said(row) : t.miss || 'No match'}</span>
                    </span>
                    <Mark status={t.state === 'no-match' ? 'fail' : t.state === 'unknown' ? 'unknown' : 'none'} />
                  </li>
                )
              })}
            </ul>
          )}
          {unread.length > 0 && (
            <p className="rl-pass__unread">
              Not read: {unread.map((x) => (x.index === null ? 'Nothing else matched' : `rule ${x.index + 1}`)).join(', ')}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
