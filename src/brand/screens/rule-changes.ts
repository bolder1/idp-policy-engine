import { FALLBACK_NAME, fallbackRule, type Policy, type Rule } from '../data'
import { DECISION_WORDS } from '../decision-words'
import { sig } from '../predicate'
import { whoKey } from '../rule-who'
import { predicateSentence, ruleIfLine, ruleLabel, whoSentence, type NameLookup } from './predicate-prose'

/* -----------------------------------------------------------------------------
   What you changed, rule by rule: the guard pages' first row (spec D §5.5).

   `describeChanges` (changes.ts) says an edit as one sentence per thing, for
   the save bar. The guard lists it the way Review changes does — a chip per
   kind over rows of a name and a value — so each rule is one row, and the
   value says every way that rule changed, in a fixed order:

     Renamed from {old} · Moved to position {n} · Decision: {Decision} ·
     Who: {who} · Conditions: {if} · Second factor: {methods} ·
     Switched on / Switched off · Deny message

   Rules are paired by id, as `describeChanges` pairs them. A rule counts as
   moved only when its place among the rules that are in both versions moved:
   a rule added above rule 1 pushes it to position 2 without anybody moving it,
   and "1 change" is what the admin made.

   The last row is a rule like any other here, named "Last row".
   -------------------------------------------------------------------------- */

export type RuleChangeKind = 'added' | 'changed' | 'removed'

export interface RuleChange {
  kind: RuleChangeKind
  /** "Rule 1 · In a corporate office", "Last row", or a removed rule's own name. */
  name: string
  /** What it is now; for a removed rule, what it was (drawn struck through). */
  value: string
}

type RuleSetLike = Pick<Policy, 'rules' | 'fallback'>

/** "For Human Resources, any sign-in → Deny". */
const ruleLine = (r: Rule, resolve?: NameLookup) => `${ruleIfLine(r, resolve)} → ${DECISION_WORDS[r.decision]}`

/* The second factor, as the guard's value says it: the named methods, a chain,
   the person's own, or Any. Only a rule that asks for two factors has one. */
function secondFactorSaid(r: Rule): string {
  if (r.secondFactor === 'specific') return (r.secondFactorMethods ?? []).join(', ') || 'None chosen'
  if (r.secondFactor === 'chain') return (r.methodChain ?? []).join(' → ') || 'None chosen'
  if (r.secondFactor === 'preferred') return r.preferredFallback ? `Their preferred method, else ${r.preferredFallback}` : 'Their preferred method'
  return 'Any'
}

const secondFactorKey = (r: Rule) =>
  r.decision !== '2fa' ? '' : [r.secondFactor, (r.secondFactorMethods ?? []).join(','), (r.methodChain ?? []).join(','), r.preferredFallback ?? ''].join('|')

/* The ways one rule changed, in the order the value says them. `moved` is
   decided by the caller, which knows what else moved around it. */
function aspects(before: Rule, after: Rule, movedTo: number | null, resolve?: NameLookup): string[] {
  const out: string[] = []
  if (before.name !== after.name) out.push(`Renamed from ${ruleLabel(before)}`)
  if (movedTo !== null) out.push(`Moved to position ${movedTo + 1}`)
  if (before.decision !== after.decision) out.push(`Decision: ${DECISION_WORDS[after.decision]}`)
  if (whoKey(before.who) !== whoKey(after.who)) out.push(`Who: ${whoSentence(after.who, resolve) ?? 'Everyone'}`)
  /* The conditions alone: Who has its own aspect, and ruleIfLine would say it twice. */
  if (sig(before.when) !== sig(after.when))
    out.push(`Conditions: ${after.when.cards.length === 0 ? 'Any sign-in' : `If ${predicateSentence(after.when, resolve)}`}`)
  if (after.decision === '2fa' && secondFactorKey(before) !== secondFactorKey(after)) out.push(`Second factor: ${secondFactorSaid(after)}`)
  if (before.enabled !== after.enabled) out.push(after.enabled ? 'Switched on' : 'Switched off')
  if ((before.denyMessage ?? '') !== (after.denyMessage ?? '')) out.push('Deny message')
  return out
}

export function ruleChanges(live: RuleSetLike, after: RuleSetLike, resolve?: NameLookup): RuleChange[] {
  const liveById = new Map(live.rules.map((r) => [r.id, r]))
  const afterIds = new Set(after.rules.map((r) => r.id))
  /* Order among the rules both versions have: moving is judged here, so an
     insertion or a deletion elsewhere moves nobody. */
  const keptBefore = live.rules.filter((r) => afterIds.has(r.id)).map((r) => r.id)
  const keptAfter = after.rules.filter((r) => liveById.has(r.id)).map((r) => r.id)

  const out: RuleChange[] = []
  after.rules.forEach((r, i) => {
    const was = liveById.get(r.id)
    const name = `Rule ${i + 1} · ${ruleLabel(r)}`
    if (!was) {
      out.push({ kind: 'added', name, value: ruleLine(r, resolve) })
      return
    }
    const moved = keptBefore.indexOf(r.id) !== keptAfter.indexOf(r.id) ? i : null
    const said = aspects(was, r, moved, resolve)
    if (said.length > 0) out.push({ kind: 'changed', name, value: said.join(' · ') })
  })
  for (const r of live.rules) if (!afterIds.has(r.id)) out.push({ kind: 'removed', name: ruleLabel(r), value: ruleLine(r, resolve) })

  const fbBefore = live.fallback ?? fallbackRule()
  const fbAfter = after.fallback ?? fallbackRule()
  /* The last row's name is fixed, and its who and conditions are always empty. */
  const last = aspects({ ...fbBefore, name: FALLBACK_NAME }, { ...fbAfter, name: FALLBACK_NAME }, null, resolve)
  if (last.length > 0) out.push({ kind: 'changed', name: 'Last row', value: last.join(' · ') })
  return out
}

/** "1 change", "3 changes". */
export const changeCount = (changes: readonly RuleChange[]): string => `${changes.length} change${changes.length === 1 ? '' : 's'}`
