import type { Policy } from '../data'

/* -----------------------------------------------------------------------------
   What depends on this object.

   Zones, device-fingerprint profiles and external hooks are all library objects:
   defined once, referenced from any number of policy rules by id. Each of their
   screens has to answer the same question before anyone edits or deletes one —
   what breaks if I change this — and each of them had its own copy of the answer,
   identical character for character apart from the condition's `typeId`.

   Three copies is three chances for the phrasing of that answer to drift, and an
   admin who learns what "used by" means on the zones page and finds it counted
   differently on the hooks page has been taught something false. One
   implementation, three call sites.

   Not shared with `rulesUsing` in AuthMethods.tsx, which looks deliberately
   different: a rule names a method by NAME, in `secondFactorMethods` and
   `methodChain`, not by id in a condition. Same question, genuinely different
   join, and collapsing them would only hide that.
   -------------------------------------------------------------------------- */

/** Every policy with at least one rule referencing `valueId`, and which rules. */
export function policiesUsing(typeId: string, valueId: string, policies: Policy[]) {
  return policies
    .map((policy) => ({
      policy,
      rules: policy.rules
        .filter((r) => r.conditions.some((c) => c.typeId === typeId && c.values.includes(valueId)))
        .map((r) => r.name),
    }))
    .filter((x) => x.rules.length > 0)
}

/** How many rules reference it, across every policy. Derived from the list above
    so the count and the list can never disagree — they used to be two separate
    reductions over the same predicate. */
export function rulesUsing(typeId: string, valueId: string, policies: Policy[]): number {
  return policiesUsing(typeId, valueId, policies).reduce((n, x) => n + x.rules.length, 0)
}
