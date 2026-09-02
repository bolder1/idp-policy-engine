import { AlertTriangle, Check, ChevronUp, ChevronDown, Info, XCircle } from 'lucide-react'

import { DECISION_LABEL, type AccessDecision, type Rule } from '../data'
import { DEC_KEY, ruleState } from './rule-form'
import type { Diagnostic } from './diagnostics'
import { clausesOf, hoistNarrowing, narrowingNames, shortPhrase, type RowTrace } from './ledger-model'
import type { NameLookup } from './predicate-prose'

/* -----------------------------------------------------------------------------
   One rule, one row, 64px — at every breakpoint, selected or not, traced or not.

   That invariant is the whole design. An accordion's mechanic is expansion, and
   expansion is exactly what destroys a column scan and makes an ordered list
   miserable to drag. Here nothing grows: reading a truncated predicate is a
   hover title (free), writing one opens the sheet (costs a surface, not a
   reflow). Anything that would make a row taller either clamps or moves.
   -------------------------------------------------------------------------- */

const VERDICTS: AccessDecision[] = ['deny', '1fa', '2fa']

/* The five factor settings, as lit or unlit micro-slots.

   They are drawn whether or not they are on, because you read this column DOWN
   the page: an omitted slot would make two rules with different settings look
   the same length, and the eye is comparing positions rather than reading
   labels. Vanta's permission matrix does the same thing for the same reason. */
const SLOTS = [
  { id: '1F', title: (r: Rule) => `First factor: ${r.firstFactor === 'Specific' ? (r.firstFactorMethod ?? 'specific') : r.firstFactor}`, lit: () => true },
  { id: '2F', title: (r: Rule) => `Second factor: ${r.secondFactor}`, lit: (r: Rule) => r.decision === '2fa' },
  { id: 'R', title: (r: Rule) => (r.rememberMfa ? `Remembered ${r.rememberDays ?? 30} days` : 'Not remembered'), lit: (r: Rule) => r.rememberMfa },
  { id: 'E', title: (r: Rule) => (r.forceMfaEachLogin ? 'Asked every login' : 'Not asked every login'), lit: (r: Rule) => !!r.forceMfaEachLogin },
  { id: 'D', title: (r: Rule) => (r.allowDisable2fa ? 'Users may switch it off' : 'Users may not switch it off'), lit: (r: Rule) => r.allowDisable2fa },
] as const

export function LedgerRow({
  rule,
  index,
  total,
  selected,
  picked,
  shadowed,
  reach,
  reachShare,
  diagnostics,
  trace,
  resolve,
  onOpen,
  onPick,
  onPatch,
  onMove,
  onBadge,
}: {
  rule: Rule
  index: number
  total: number
  selected: boolean
  picked: boolean
  shadowed: boolean
  reach: number
  reachShare: number
  diagnostics: Diagnostic[]
  trace?: RowTrace
  resolve: NameLookup
  onOpen: () => void
  onPick: (additive: boolean) => void
  onPatch: (p: Partial<Rule>) => void
  onMove: (to: number) => void
  onBadge: () => void
}) {
  const st = ruleState(diagnostics)
  const worst = diagnostics.some((d) => d.severity === 'error')
    ? 'error'
    : diagnostics.some((d) => d.severity === 'warning')
      ? 'warning'
      : diagnostics.length > 0
        ? 'info'
        : null

  const { narrowing, rest } = hoistNarrowing(rule.when)
  const names = narrowingNames(narrowing, (kind, id) => resolve(kind, id))
  const { shown, overflow } = clausesOf(rest, (c) => shortPhrase(c, (kind, id) => resolve(kind as never, id)))

  return (
    <div
      className={`bf3__row ${selected ? 'is-selected' : ''} ${picked ? 'is-picked' : ''} ${
        shadowed ? 'is-shadowed' : ''
      } ${rule.enabled ? '' : 'is-off'}`}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-decision={DEC_KEY[rule.decision]}
      data-state={st}
      data-trace={trace ?? 'off'}
      tabIndex={selected ? 0 : -1}
      onClick={(e) => onPick(e.metaKey || e.ctrlKey || e.shiftKey)}
      onDoubleClick={onOpen}
    >
      {/* The ordinal doubles as the move control. Same footprint either way, so
          selecting a row can never reflow the grid — and reordering has a
          keyboard path, which drag alone never did. */}
      <span className="bf3__c bf3__c--n" role="gridcell">
        <span className="bf3__ord">{index + 1}</span>
        <span className="bf3__nudge">
          <button
            type="button"
            aria-label={`Move ${rule.name} up`}
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation()
              onMove(index - 1)
            }}
          >
            <ChevronUp size={11} strokeWidth={2.4} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Move ${rule.name} down`}
            disabled={index === total - 1}
            onClick={(e) => {
              e.stopPropagation()
              onMove(index + 1)
            }}
          >
            <ChevronDown size={11} strokeWidth={2.4} aria-hidden />
          </button>
        </span>
      </span>

      <span className="bf3__c bf3__c--rule" role="gridcell">
        <button
          type="button"
          className="bf3__rulename"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
        >
          {rule.name}
        </button>
        {!rule.enabled && <span className="bf3__off">Off</span>}
        {rule.description && <em className="bf3__ruledesc">{rule.description}</em>}
      </span>

      {/* Who this rule is about, lifted out of the predicate.

          After the audience hoist a rule narrows within its policy by carrying
          a `group` or `user` condition, and reading a column of predicates that
          each open "group in finance and…" is reading the same six words nine
          times. Lifted only when every alternative carries the same ones — see
          `hoistNarrowing`, which refuses rather than lie. */}
      <span className="bf3__c bf3__c--narrow" role="gridcell">
        {names.length === 0 ? (
          <em className="bf3__none">everyone in the policy</em>
        ) : (
          names.map((n) => (
            <span key={n} className="bf3__chip">
              {n}
            </span>
          ))
        )}
      </span>

      <span className="bf3__c bf3__c--when" role="gridcell">
        <span className="bf3__when">
          {shown.length === 0 ? (
            <em className="bf3__when--any">every sign-in that reaches it</em>
          ) : (
            shown.map((cl, i) => (
              <span key={cl.id} className="bf3__clause">
                {i > 0 && (cl.startsAlternative ? <b className="bf3__or">or</b> : <b className="bf3__and">and</b>)}
                {cl.text}
              </span>
            ))
          )}
        </span>
        {overflow > 0 && (
          <button
            type="button"
            className="bf3__more"
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
          >
            +{overflow}
          </button>
        )}
      </span>

      <span className="bf3__c bf3__c--then" role="gridcell">
        <span className="bf3__verdict" role="radiogroup" aria-label={`Outcome for ${rule.name}`}>
          {VERDICTS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={rule.decision === d}
              data-d={DEC_KEY[d]}
              className="bf3__seg"
              title={DECISION_LABEL[d]}
              onClick={(e) => {
                e.stopPropagation()
                onPatch({ decision: d })
              }}
            >
              {d === 'deny' ? 'Deny' : d === '1fa' ? '1F' : '2F'}
            </button>
          ))}
        </span>
        <span className="bf3__slots">
          {SLOTS.map((s) => (
            <span key={s.id} className="bf3__slot" data-lit={s.lit(rule) ? '1' : '0'} title={s.title(rule)}>
              {s.id}
            </span>
          ))}
        </span>
      </span>

      {/* Swept, not estimated. `matchEstimate` is seed data that never
          recomputes; this is how many of the modelled situations this rule
          actually wins, first-match and all. A rule at zero is a dead rule and
          says so before the linter opens its mouth. */}
      <span className="bf3__c bf3__c--reach" role="gridcell">
        <span className="bf3__num">{reach}</span>
        <span className="bf3__bar" style={{ ['--w' as string]: `${reachShare}%` }} aria-hidden />
      </span>

      <span className="bf3__c bf3__c--state" role="gridcell">
        {worst ? (
          <button
            type="button"
            className="bf3__badge"
            data-sev={worst}
            aria-label={`${diagnostics.length} ${diagnostics.length === 1 ? 'finding' : 'findings'} on ${rule.name}`}
            onClick={(e) => {
              e.stopPropagation()
              onBadge()
            }}
          >
            {worst === 'error' ? (
              <XCircle size={12} strokeWidth={2.2} aria-hidden />
            ) : worst === 'warning' ? (
              <AlertTriangle size={12} strokeWidth={2.2} aria-hidden />
            ) : (
              <Info size={12} strokeWidth={2.2} aria-hidden />
            )}
            {diagnostics.length}
          </button>
        ) : (
          <span className="bf3__badge is-clear" aria-label="Nothing to fix">
            <Check size={12} strokeWidth={2.4} aria-hidden />
          </span>
        )}
      </span>
    </div>
  )
}

/* The terminal.

   Not a rule and never numbered, but it carries the same verdict control every
   other row has — because what happens to a sign-in that matched nothing is a
   decision, and it was the one decision in the product nobody could make. It is
   sticky at the bottom so it is on screen at one rule and at twenty. */
export function TerminalRow({
  fallback,
  residual,
  residualShare,
  onFallback,
}: {
  fallback: AccessDecision
  residual: number
  residualShare: number
  onFallback: (d: AccessDecision) => void
}) {
  /* Amber when nothing is left to catch a sign-in but a permissive default —
     the shape of a policy that looks like protection and is not. */
  const hole = fallback === '1fa' && residual > 0

  return (
    <div className={`bf3__terminal ${hole ? 'is-hole' : ''}`} role="row">
      <span className="bf3__c bf3__c--n" role="gridcell" />
      <span className="bf3__c bf3__c--span" role="gridcell">
        <span className="u-label">In all other cases</span>
      </span>
      <span className="bf3__c bf3__c--then" role="gridcell">
        <span className="bf3__verdict" role="radiogroup" aria-label="What an unmatched sign-in gets">
          {VERDICTS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={fallback === d}
              data-d={DEC_KEY[d]}
              className="bf3__seg"
              title={DECISION_LABEL[d]}
              onClick={() => onFallback(d)}
            >
              {d === 'deny' ? 'Deny' : d === '1fa' ? '1F' : '2F'}
            </button>
          ))}
        </span>
      </span>
      <span className="bf3__c bf3__c--reach" role="gridcell">
        <span className="bf3__num">{residual}</span>
        <span className="bf3__bar" style={{ ['--w' as string]: `${residualShare}%` }} aria-hidden />
      </span>
      <span className="bf3__c bf3__c--state" role="gridcell">
        {hole && (
          <span className="bf3__badge" data-sev="warning" title="Everything unmatched signs in on one factor">
            <AlertTriangle size={12} strokeWidth={2.2} aria-hidden />
          </span>
        )}
      </span>
    </div>
  )
}
