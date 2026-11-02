import { appsOf, reidRule, type App, type Group, type Policy, type Rule, type Scenario, type User, type Zone } from '../../data'
import type { FingerprintProfile } from '../../fingerprint'
import type { Hook } from '../../hooks'
import { lastSaved } from '../../policy-draft'
import { TEMPLATES_MANAGED } from '../../template-phase'
import type { WhoDirectory } from '../../rule-who'
import { diagnose } from '../diagnostics'
import { buildTemplate, type TemplateLibrary } from './apply-template'
import { copyName } from './parts'

/* -----------------------------------------------------------------------------
   Copy rules from a policy (owner, 2 Nov 2026). The team cannot give Save as template and asked for "inherit from
   another policy": rules, or a group of rules, reused between policies. Whether a later change to the source should
   reach the copy is still open with them; a copy is the part every answer needs, because a linked rule would be
   detached into exactly this.

   So this is a copy and says so. The rules land on the canvas as an ordinary edit, new ids all the way down, and
   nothing links them to the source afterwards. Same type only, as the older "Copy to another policy" (CopyRuleDialog in
   builder-dialogs.tsx): a post sign-in rule answers a different question. The source is what its builder would open.

   At the end of the list, under the rules already there, and above Nothing else matched. Appending is the one place
   that changes nothing already working, and under first match wins it is also where a rule can go to die, so the
   dialog says when one would (`copyNotes`).
   -------------------------------------------------------------------------- */

/** A source's rules that can be copied: none born blank and never touched, and no temporary access, which is one
    person's grant with its own reason and end date, not a rule to reuse. */
export function copyableRules(source: Policy): Rule[] {
  return lastSaved(source).rules.filter((r) => !r.pristine && !r.tempAccess)
}

/** The policies a rule can be copied from into this one: the same type, itself left out, with something to copy. */
export function copySources(policies: readonly Policy[], target: Pick<Policy, 'id' | 'type'>): Policy[] {
  const from = policies.filter((p) => p.id !== target.id && p.type === target.type && copyableRules(p).length > 0)
  /* The Global Default last: the picker opens on the first, and it is rarely the one to copy. */
  return [...from.filter((p) => !p.isSystem), ...from.filter((p) => p.isSystem)]
}

/** The copies themselves, in the order given: fresh ids, and a name of their own where the policy already has it. */
export function copiedRules(picked: readonly Rule[], existing: readonly Pick<Rule, 'name'>[]): Rule[] {
  const taken = existing.map((r) => r.name.trim())
  return picked.map((r) => {
    const name = taken.includes(r.name.trim()) ? copyName(r.name, taken) : r.name
    taken.push(name.trim())
    return reidRule({ ...r, name })
  })
}

/** "1 rule" or "3 rules". */
export const rulesSaid = (n: number): string => (n === 1 ? '1 rule' : `${n} rules`)

/* --- What the picker offers -----------------------------------------------------

   A policy or a template, taken whole (owner, 2 Nov 2026: "the user can only select a policy, not dedicated rules from
   the policy"). Copy from a policy and Use a template are the same picker (owner, same day: "make the copy from policy
   and start from template same"): a list to choose from, and the chosen one's rules to read before taking them. */
export interface PickSource {
  id: string
  name: string
  /** The line under the name: a policy's applications, a template's category. */
  sub: string
  /** What the details side says under the name, where it differs from `sub`: a template's description. */
  detail?: string
  /** A heading the list files it under, for templates: yours, then Xecurify's. */
  group?: string
  /** A policy's status, shown beside its name. */
  status?: Policy['status']
  /** What it would put on the policy, in order. */
  rules: Rule[]
  policy?: Policy
  scenario?: Scenario
}

/** The policies to copy from, as the picker lists them. */
export function policySources(policies: readonly Policy[], target: Pick<Policy, 'id' | 'type'>, apps: readonly App[]): PickSource[] {
  return copySources(policies, target).map((p) => {
    const names = appsOf(p, [...apps]).map((a) => a.name)
    return {
      id: p.id,
      name: p.name,
      sub: names.length > 0 ? names.join(', ') : p.isSystem ? 'Every application' : 'No applications',
      status: p.status,
      rules: copyableRules(p),
      policy: p,
    }
  })
}

/** The templates to start from, built as Use builds them: yours first, then Xecurify's. A template that would put no
    rule on the policy is left out, since it leads nowhere. */
export function templateSources(scenarios: readonly Scenario[], directory: WhoDirectory, library: TemplateLibrary): PickSource[] {
  const usable = scenarios
    .map((s) => ({ s, rules: buildTemplate(s, directory, library).rules }))
    .filter((x) => x.rules.length > 0)
  const as = (group: string) => (x: { s: Scenario; rules: Rule[] }): PickSource => ({ id: x.s.id, name: x.s.name, sub: x.s.category, detail: x.s.description || undefined, group, rules: x.rules, scenario: x.s })
  /* Your templates only while the tenant manages templates (template-phase.ts). */
  const yours = TEMPLATES_MANAGED ? usable.filter((x) => !x.s.provided).map(as('Your templates')) : []
  return [...yours, ...usable.filter((x) => x.s.provided).map(as('Xecurify templates'))]
}

/** What the checks need to read a rule where it would land. */
export interface CopyTenant {
  groups: Group[]
  hooks: Hook[]
  users: User[]
  zones: Zone[]
  fingerprints: FingerprintProfile[]
}

/* What copying these would cause, by source rule id: the first thing each rule should be warned of.

   Read by building the policy as it would be and running the real checks over it, so this list cannot promise what the
   builder then contradicts. What is wrong with a rule wherever it goes travels with it and is on its own policy
   already, so only what the landing causes is said, and who is outside this policy is always the landing's. */
export function copyNotes(target: Policy, picked: readonly Rule[], tenant: CopyTenant): Map<string, string> {
  const { groups, hooks, users, zones, fingerprints } = tenant
  const library = { zones, fingerprints }
  const notes = new Map<string, string>()
  const start = target.rules.length
  const probes = picked.map((r, i) => ({ ...r, id: `copy-probe-${i}` }))
  const found = diagnose({ ...target, rules: [...target.rules, ...probes] }, groups, hooks, users, library)
  probes.forEach((probe, i) => {
    const intrinsic = new Set(diagnose({ ...target, isSystem: false, rules: [probe] }, groups, hooks, users, library).map((d) => d.title))
    const own = found.filter((d) => d.ruleIndex === start + i).filter((d) => d.code === 'PE151' || !intrinsic.has(d.title))
    const first = own.find((d) => d.severity === 'error') ?? own.find((d) => d.code === 'PE151') ?? own[0]
    if (first) notes.set(picked[i].id, first.title)
  })
  return notes
}
