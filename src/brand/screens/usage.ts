import type { Policy, Rule } from '../data'
import { leaves } from '../predicate'

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

/** A policy and the rules of it that name the object. */
export interface PolicyUse {
  policy: Policy
  /* The rules themselves, not their names.

     Names were enough while the answer was printed as a line of text. It is a
     card now, and what makes the card worth reading is the decision each rule
     lands on — which the name cannot carry, and which is the difference between
     "editing this is awkward" and "editing this stops people signing in". */
  rules: Rule[]
}

/** Every policy with at least one rule referencing `valueId`, and which rules. */
export function policiesUsing(typeId: string, valueId: string, policies: Policy[]): PolicyUse[] {
  return policies
    .map((policy) => ({
      policy,
      /* `leaves`, not the top level. This is the only thing between an admin
         and deleting a zone or a hook that live rules still name — the store
         does not unlink on delete — so a scan that missed conditions nested in
         a second alternative would under-state the blast radius silently. */
      rules: policy.rules.filter((r) =>
        leaves(r.when).some((c) => c.typeId === typeId && c.values.includes(valueId)),
      ),
    }))
    .filter((x) => x.rules.length > 0)
}

/** How many rules reference it, across every policy. Derived from the list above
    so the count and the list can never disagree — they used to be two separate
    reductions over the same predicate. */
export function rulesUsing(typeId: string, valueId: string, policies: Policy[]): number {
  return policiesUsing(typeId, valueId, policies).reduce((n, x) => n + x.rules.length, 0)
}
