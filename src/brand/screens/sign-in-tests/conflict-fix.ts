import { createContext } from 'react'
import { memberGroupIds, rule, type AccessDecision, type Policy, type Rule, type User } from '../../data'
import type { EngineRun } from './engine-run'
import type { WhyItem } from './journey'
import type { SignInForm } from '../testing/sign-in-form'

/* -----------------------------------------------------------------------------
   A finding's fix, as an edit the builder can make (owner, 6 Oct 2026: "just
   show the problem, a one-liner and a solution, or a direct button with the
   solution written — add an Apply button here directly").

   Two shapes cover every finding whose fix is in a policy's rules
   (conflicts.ts writes the words):

     move   a rule of the deciding policy that also applies, moved above the
            rule that decided ("Move it above rule 1 to ask Finance for 2FA")
     add    a rule above the one that decided, for the person — or the groups
            two policies share — that gives what the other policy would, its
            checks and factors copied from the rule that would have decided
            there ("Add a rule that names Maya Iyer to …, above rule 2");
            and the rule a person is left out of, given back to them by name

   Applied in the builder, to the policy's draft, as "Fix in policy" lands a
   break-in fix (board/arrive-fix.ts): an ordinary edit with Undo, saved only
   through Review & save. The rest — a policy switched off, a fact not stated —
   keep their own action.
   -------------------------------------------------------------------------- */

export type ConflictFix =
  | { kind: 'move'; policyId: string; ruleId: string; above: string }
  | {
      kind: 'add'
      policyId: string
      /** The rule it goes above; null for the end of the list. */
      above: string | null
      /** Who the new rule is for: the person by name, or the groups two policies share. */
      userIds: string[]
      groupIds: string[]
      /** "Maya Iyer", "Finance": the new rule's name and the button's words. */
      label: string
      /** The rule whose checks, decision and factors it copies. */
      copy: { policyId: string; ruleId: string } | null
      decision: AccessDecision
    }

/* Every fix of a run, taken into the builder together (owner, 7 Oct 2026: "can I take this whole fix thing inside the
   builder? so I don't have to back and forth and can do all the fixes together"): each with its card's heading and
   line, for the builder's Fixes panel. One run's fixes are all in the policy that decided. */
export interface FixItem {
  fix: ConflictFix
  title: string
  line: string
}

/* The builder's Check access fixes its own policy in place, never through the route — that would ask to leave the
   draft it is fixing. Its policy, the builder's handler, and the sign-in it ran (for a fix in another policy, as its
   Open rule carries it); null outside it, where the page's sign-in is the session's. */
export const FixHere = createContext<{ policyId: string; onFixes: (list: FixItem[], pressed: number) => void; form: SignInForm } | null>(null)

const isRuleKind = (k: WhyItem['kind']) => k === 'rule-conflict' || k === 'named-later' || k === 'deny-first'

/* The rule of `p` that would decide for this person with `decision`: the first one on, of that decision, whose who
   lets them in (or names nobody). Null when none does — the new rule then asks for nothing but the decision. */
function ruleFor(p: Policy, decision: AccessDecision, person: Pick<User, 'id' | 'groupId' | 'alsoGroupIds'>): Rule | null {
  const mine = memberGroupIds(person)
  return (
    p.rules.find((r) => {
      if (r.enabled === false || r.decision !== decision) return false
      const w = r.who
      if (!w || (w.groupIds.length === 0 && w.userIds.length === 0)) return true
      return w.userIds.includes(person.id) || w.groupIds.some((g) => mine.includes(g))
    }) ?? null
  )
}

/** The fix a finding names, as an edit; null where its fix is not in a policy's rules, or nothing needs doing. */
export function conflictFixOf(it: Pick<WhyItem, 'kind' | 'fix' | 'rule' | 'link' | 'would' | 'action'>, plan: Pick<EngineRun, 'decider' | 'rules' | 'landing' | 'conflicts'>, person: Pick<User, 'id' | 'name' | 'groupId' | 'alsoGroupIds'> | null, policies: readonly Policy[], groupIdOf: (name: string) => string | undefined): ConflictFix | null {
  const decider = plan.decider
  if (!it.fix || !decider) return null
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const landingId = landing && landing.index !== null ? landing.id : null
  if (isRuleKind(it.kind) && it.rule && landingId) return { kind: 'move', policyId: decider.id, ruleId: it.rule.ruleId, above: landingId }
  if (!person) return null
  if (it.kind === 'exception' && it.action?.ruleId) {
    const stored = policies.find((p) => p.id === decider.id)
    const left = stored?.rules.find((r) => r.id === it.action!.ruleId)
    if (!left) return null
    return { kind: 'add', policyId: decider.id, above: left.id, userIds: [person.id], groupIds: [], label: person.name, copy: { policyId: decider.id, ruleId: left.id }, decision: left.decision }
  }
  if ((it.kind === 'policy-conflict' || it.kind === 'same-group-policy') && it.link && it.would?.decision) {
    const other = policies.find((p) => p.id === it.link!.policyId)
    /* The rule that decided there on this sign-in (conflicts.ts), so the copy asks what was tested; its last row
       copies nothing. Only where the model has no walk for it, the first rule of that decision that lets them in. */
    const hit = plan.conflicts?.policies.find((x) => x.policyId === other?.id)
    const src = !other ? null : hit?.status === 'decided' ? (hit.ruleNumber !== null ? (other.rules[hit.ruleNumber - 1] ?? null) : null) : ruleFor(other, it.would.decision, person)
    const copy = other && src ? { policyId: other.id, ruleId: src.id } : null
    /* "Add a rule for Finance to …": the shared groups, by name, from the fix's own words. */
    const forGroups = /^Add a rule for (.+?) to /.exec(it.fix)
    const names = forGroups ? forGroups[1].split(/, | and /) : []
    const groupIds = names.map(groupIdOf).filter((g): g is string => g !== undefined)
    const byGroup = names.length > 0 && groupIds.length === names.length
    return {
      kind: 'add',
      policyId: decider.id,
      above: landingId,
      userIds: byGroup ? [] : [person.id],
      groupIds: byGroup ? groupIds : [],
      label: byGroup ? forGroups![1] : person.name,
      copy,
      decision: it.would.decision,
    }
  }
  return null
}

/** The button's words: the fix, said short. "Move rule 3 above rule 1", "Add a rule for Maya Iyer above rule 2". */
export function fixButtonSaid(fix: ConflictFix, plan: { rules: readonly { id: string; index: number | null }[] }): string {
  const n = (id: string | null) => {
    const r = id ? plan.rules.find((x) => x.id === id) : undefined
    return r && r.index !== null ? r.index + 1 : null
  }
  const above = n(fix.above)
  if (fix.kind === 'move') {
    const it = n(fix.ruleId)
    return it && above ? `Move rule ${it} above rule ${above}` : 'Move the rule up'
  }
  return above ? `Add a rule for ${fix.label} above rule ${above}` : `Add a rule for ${fix.label}`
}

/** The same words, numbered as the rules stand in this policy (the builder's draft, after other fixes moved them). */
export const fixSaidOn = (fix: ConflictFix, policy: Policy): string => fixButtonSaid(fix, { rules: policy.rules.map((r, i) => ({ id: r.id, index: i })) })

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x))

/* The fix is already in this policy: the rule moved above the one it goes above, or a rule on for the same people,
   with the same decision, above it. Asked of the draft as it stands, so Undo makes it open again. */
export function fixDone(policy: Policy, fix: ConflictFix): boolean {
  const to = fix.above === null ? policy.rules.length : policy.rules.findIndex((r) => r.id === fix.above)
  if (to < 0) return false
  if (fix.kind === 'move') {
    const from = policy.rules.findIndex((r) => r.id === fix.ruleId)
    return from >= 0 && from < to
  }
  return policy.rules
    .slice(0, to)
    .some((r) => r.enabled !== false && r.decision === fix.decision && !!r.who && sameIds(r.who.userIds, fix.userIds) && sameIds(r.who.groupIds, fix.groupIds))
}

/** Every fix not yet in the policy, applied in order: the next policy, the rules they added, and how many applied. */
export function applyConflictFixes(policy: Policy, fixes: readonly ConflictFix[], policies: readonly Policy[]): { next: Policy; added: string[]; count: number } {
  let next = policy
  const added: string[] = []
  let count = 0
  for (const fix of fixes) {
    if (fixDone(next, fix)) continue
    const done = applyConflictFix(next, fix, policies)
    if (!done) continue
    if (!next.rules.some((r) => r.id === done.ruleId)) added.push(done.ruleId)
    next = done.next
    count += 1
  }
  return { next, added, count }
}

/** The edit on a policy (its draft): the next policy, the rule to select, and the Undo toast's words. Null when it no longer fits. */
export function applyConflictFix(policy: Policy, fix: ConflictFix, policies: readonly Policy[]): { next: Policy; ruleId: string; toast: string } | null {
  const at = (id: string | null) => (id === null ? policy.rules.length : policy.rules.findIndex((r) => r.id === id))
  if (fix.kind === 'move') {
    const from = policy.rules.findIndex((r) => r.id === fix.ruleId)
    const to = at(fix.above)
    if (from < 0 || to < 0 || from <= to) return null
    const moved = policy.rules[from]
    const rest = policy.rules.filter((_, i) => i !== from)
    rest.splice(to, 0, moved)
    return { next: { ...policy, rules: rest }, ruleId: moved.id, toast: `Rule ${from + 1} moved above rule ${to + 1}` }
  }
  const to = at(fix.above)
  if (to < 0) return null
  const src = fix.copy ? policies.find((p) => p.id === fix.copy!.policyId)?.rules.find((r) => r.id === fix.copy!.ruleId) : undefined
  /* The rule it copies, whole — its checks, its factors and their methods, what a refusal says — but never its id, its
     name, who it is for, or a grant's end date. */
  const body: Partial<Rule> = {}
  if (src) {
    const { id: _id, name: _name, who: _who, enabled: _on, tempAccess: _grant, ...rest } = src
    Object.assign(body, rest)
  }
  const added = rule({
    ...body,
    name: `For ${fix.label}`,
    who: { groupIds: fix.groupIds, userIds: fix.userIds },
    decision: fix.decision,
  })
  const rules = [...policy.rules]
  rules.splice(to, 0, added)
  return { next: { ...policy, rules }, ruleId: added.id, toast: `Rule added for ${fix.label} as rule ${to + 1}` }
}
