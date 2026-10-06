import { FALLBACK_NAME, fallbackRule, type AccessDecision, type Policy, type Rule } from '../../data'
import type { EngineRun, RuleState } from './engine-run'

/* -----------------------------------------------------------------------------
   The inspector's model (docs/specs/CHECK-ACCESS-INSPECTOR.md): what a press on
   a name in the run opens in the right-hand panel, and what that view says about
   THIS sign-in. A policy, or one rule of it (`ruleId` null is "Nothing else
   matched"). Read-only: the one way out is Edit in builder. PURE.
   -------------------------------------------------------------------------- */

/** A library object a rule leans on, peeked at from the rule: a zone, a device profile, a risk profile, a hook. */
export type PeekKind = 'zone' | 'device' | 'risk' | 'hook' | 'person' | 'app'
export type PeekTarget = { kind: PeekKind; id: string }

export type InspectTarget = { kind: 'policy'; policyId: string } | { kind: 'rule'; policyId: string; ruleId: string | null } | PeekTarget

export const isPeek = (t: InspectTarget): t is PeekTarget => t.kind !== 'policy' && t.kind !== 'rule'

export const sameTarget = (a: InspectTarget, b: InspectTarget): boolean => {
  if (isPeek(a) || isPeek(b)) return isPeek(a) && isPeek(b) && a.kind === b.kind && a.id === b.id
  return a.kind === b.kind && a.policyId === b.policyId && (a.kind === 'policy' || (b.kind === 'rule' && a.ruleId === b.ruleId))
}

/** How a rule fared in the run on screen, in the words the list says. */
export type RuleFate = 'decided' | 'not-matched' | 'cant-tell' | 'off' | 'not-reached'

export const FATE_WORDS: Record<RuleFate, string> = {
  decided: 'Decided this sign-in',
  'not-matched': 'Not matched',
  'cant-tell': 'Can’t tell',
  off: 'Switched off',
  'not-reached': 'Not reached',
}

const FATE_OF: Record<RuleState, RuleFate> = { match: 'decided', 'no-match': 'not-matched', unknown: 'cant-tell', possible: 'cant-tell', off: 'off', 'not-reached': 'not-reached' }

/** The run's own rules, when the policy is the one that decided: only then did the engine read its rules. */
const engineRulesOf = (plan: Pick<EngineRun, 'decider' | 'rules'>, policyId: string) => (plan.decider?.id === policyId ? plan.rules : null)

/** How one rule fared; null when this policy's rules were not read at all (it did not decide). */
export function fateOf(plan: Pick<EngineRun, 'decider' | 'rules'>, policyId: string, ruleId: string | null): RuleFate | null {
  const rules = engineRulesOf(plan, policyId)
  if (!rules) return null
  const r = ruleId === null ? rules.find((x) => x.index === null) : rules.find((x) => x.id === ruleId)
  return r ? FATE_OF[r.state] : null
}

/** One row the engine read, as the inspector's "This sign-in" list says it. */
export interface Evidence {
  word: string
  /** The finding in the sign-in's words: "Home broadband is not in Corporate offices". */
  line: string
  status: 'pass' | 'fail' | 'unknown'
}

/** What the engine found on each row of a rule it read, in order; empty for a rule it never read. */
export function evidenceOf(plan: Pick<EngineRun, 'decider' | 'rules'>, policyId: string, ruleId: string | null): Evidence[] {
  const rules = engineRulesOf(plan, policyId)
  const r = rules && (ruleId === null ? rules.find((x) => x.index === null) : rules.find((x) => x.id === ruleId))
  if (!r) return []
  return r.checks.slice(0, r.checked).map((c) => ({ word: c.word, line: c.line, status: c.status }))
}

/** One line of a policy's rule list. */
export interface RuleListRow {
  /** The rule's id; null is the last row. */
  id: string | null
  /** 1-based; null for the last row. */
  n: number | null
  name: string
  decision: AccessDecision
  fate: RuleFate | null
}

/** Every rule of the policy in order, then its last row, each with how it fared in this run. */
export function ruleList(policy: Policy, plan: Pick<EngineRun, 'decider' | 'rules'>): RuleListRow[] {
  const rows: RuleListRow[] = policy.rules.map((r, i) => ({ id: r.id, n: i + 1, name: r.name, decision: r.decision, fate: fateOf(plan, policy.id, r.id) }))
  const last = policy.fallback ?? fallbackRule()
  rows.push({ id: null, n: null, name: FALLBACK_NAME, decision: last.decision, fate: fateOf(plan, policy.id, null) })
  return rows
}

/** The rule a target names, with its last row as the policy's own; null when it is not there (a policy edited away). */
export function ruleOf(policy: Policy, ruleId: string | null): { rule: Rule; n: number | null; terminal: boolean } | null {
  if (ruleId === null) return { rule: policy.fallback ?? fallbackRule(), n: null, terminal: true }
  const i = policy.rules.findIndex((r) => r.id === ruleId)
  return i < 0 ? null : { rule: policy.rules[i], n: i + 1, terminal: false }
}

export const PEEK_FALLBACK: Record<PeekKind, string> = { zone: 'Zone', device: 'Device profile', risk: 'Risk profile', hook: 'Hook', person: 'Person', app: 'Application' }

/** The breadcrumb's label for a target: the policy's name, or "Rule 2 · Name" / "Nothing else matched". */
export function targetLabel(t: InspectTarget, policies: readonly Pick<Policy, 'id' | 'name' | 'rules'>[], names: Partial<Record<PeekKind, (id: string) => string | undefined>> = {}): string {
  if (isPeek(t)) return names[t.kind]?.(t.id) ?? PEEK_FALLBACK[t.kind]
  const p = policies.find((x) => x.id === t.policyId)
  if (!p) return 'Policy'
  if (t.kind === 'policy') return p.name
  if (t.ruleId === null) return FALLBACK_NAME
  const i = p.rules.findIndex((r) => r.id === t.ruleId)
  return i < 0 ? 'Rule' : `Rule ${i + 1} · ${p.rules[i].name}`
}
