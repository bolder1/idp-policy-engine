import type { Audience, Rule, Scenario } from '../../data'
import { hasWho, intersectWho, normaliseWho, withWho, type WhoDirectory } from '../../rule-who'

/* -----------------------------------------------------------------------------
   The rules a template puts on the board.

   A template can declare an `audience`. The board never wrote the audience
   anywhere, so a template narrowed only by it ("Stricter auth for contractors",
   "Regulated data access") landed on a policy for everyone, and its Deny rules
   with it.

   The audience is written into each rule's `who`, not onto the policy. The
   board shows and edits a rule's who; it does not show or edit the policy
   audience. The WHEN cards are never touched — who is ANDed with the whole
   WHEN, whatever shape it has, so there is no card to split and no condition
   to add.

   One principle: the result applies to exactly the people the built rule
   applied to AND who are inside the audience. Never wider.
   -------------------------------------------------------------------------- */

/* A built rule, narrowed to the audience.

   - `everyone` returns the rule untouched.
   - A rule with no who takes the audience as its who.
   - A rule that already has a who keeps the people both name: groups in both,
     people in both, and every exception from either side.
   - When that covers nobody, the answer is `null`. A who cannot store
     "nobody" — empty means everyone — so the caller drops the rule rather
     than widening it. */
export function narrowToAudience(r: Rule, a: Audience, directory?: WhoDirectory): Rule | null {
  if (a.everyone) return r
  const audience = normaliseWho({ groupIds: a.groupIds, userIds: a.userIds })
  /* An audience naming nobody is the policy's own error (PE310), not this
     rule's; there is nothing to narrow to. */
  if (!audience) return r
  if (!hasWho(r.who)) return withWho(r, audience)
  const both = intersectWho(r.who, audience, directory)
  if (both === null) return null
  return withWho(r, both)
}

/** The library items a template can name. Omitted, nothing is checked. */
export interface TemplateLibrary {
  zones: { id: string }[]
  fingerprints: { id: string }[]
}

/** A library kind a template names and the tenant does not have. */
export type TemplateNeed = 'zone' | 'fingerprint'

/* A zone or device profile the tenant does not have, taken out of the rule.

   Shipped templates name `office`, `fp-managed` and others. A tenant without
   them got a rule naming an id that never existed, reported as "no longer
   exists". Cleared, the condition reads "Choose…" and the blank-value check
   says what to do. */
export function withoutMissing(r: Rule, library: TemplateLibrary): { rule: Rule; needs: TemplateNeed[] } {
  const known: Record<TemplateNeed, Set<string>> = {
    zone: new Set(library.zones.map((z) => z.id)),
    fingerprint: new Set(library.fingerprints.map((f) => f.id)),
  }
  const needs: TemplateNeed[] = []
  let changed = false
  const cards = r.when.cards.map((k) => {
    let cardChanged = false
    const conditions = k.conditions.map((c) => {
      const kind = c.typeId === 'zone' || c.typeId === 'fingerprint' ? c.typeId : null
      if (!kind) return c
      const values = c.values.filter((v) => v.trim() === '' || known[kind].has(v))
      if (values.length === c.values.length) return c
      if (!needs.includes(kind)) needs.push(kind)
      cardChanged = true
      return { ...c, values }
    })
    if (!cardChanged) return k
    changed = true
    return { ...k, conditions }
  })
  return { rule: changed ? { ...r, when: { ...r.when, cards } } : r, needs }
}

/** What applying a template builds: the rules kept, and the names of any that would apply to nobody. */
export interface TemplateBuild {
  rules: Rule[]
  /** Rules dropped because their who and the template audience share nobody. */
  dropped: string[]
  /** Library kinds the template names that the tenant lacks. Those values are cleared. */
  needs: TemplateNeed[]
}

/** Every rule of a template, built fresh and narrowed to its audience, with what was dropped. */
export function buildTemplate(t: Scenario, directory?: WhoDirectory, library?: TemplateLibrary): TemplateBuild {
  const rules: Rule[] = []
  const dropped: string[] = []
  const needs: TemplateNeed[] = []
  for (const spec of t.rules) {
    const built = narrowToAudience(spec.build(), t.audience, directory)
    if (!built) {
      dropped.push(spec.name)
      continue
    }
    if (!library) {
      rules.push(built)
      continue
    }
    const checked = withoutMissing(built, library)
    rules.push(checked.rule)
    for (const n of checked.needs) if (!needs.includes(n)) needs.push(n)
  }
  return { rules, dropped, needs }
}

/** What applying a template commits: its rules, built fresh and narrowed to its audience. Rules that would apply to nobody are left out; `buildTemplate` says which. */
export function buildTemplateRules(t: Scenario, directory?: WhoDirectory, library?: TemplateLibrary): Rule[] {
  return buildTemplate(t, directory, library).rules
}

/** Why a template cannot be applied, or null when it can. */
export function templateBlocker(t: Scenario, build: TemplateBuild): string | null {
  if (t.rules.length === 0) return `${t.name} has no rules.`
  if (build.rules.length === 0) return `${t.name} not applied. None of its rules apply to anyone.`
  return null
}
