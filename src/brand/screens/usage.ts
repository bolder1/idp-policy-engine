import { evaluates, type Policy, type Rule } from '../data'
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

   Methods are not answered here: a rule names a method by NAME, in
   `secondFactorMethods` and `methodChain`, not by id in a condition — the same
   question with a genuinely different join (`rulesUsingMethod` in auth-panel.ts).
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
  /* True when only the saved, unpublished draft of a published policy names
     the object — its live rules do not. The rules above are then the draft's,
     and a list shows the use as a draft. */
  draft?: boolean
}

/* Does this rule name the object?

   `leaves`, not the top level. This is the only thing between an admin and
   deleting a zone or a hook that live rules still name — the store does not
   unlink on delete — so a scan that missed conditions nested in a second
   alternative would under-state the blast radius silently.

   Groups and people are named in `Rule.who`, not in a card, so for those two
   kinds the who is read as well — exceptions included, because deleting a
   group a rule excepts changes who that rule covers too. */
const names = (r: Rule, typeId: string, valueId: string) =>
  leaves(r.when).some((c) => c.typeId === typeId && c.values.includes(valueId)) ||
  (typeId === 'group' && !!r.who && [...r.who.groupIds, ...(r.who.exceptGroupIds ?? [])].includes(valueId)) ||
  (typeId === 'user' && !!r.who && [...r.who.userIds, ...(r.who.exceptUserIds ?? [])].includes(valueId))

const hasType = (r: Rule, typeId: string) => leaves(r.when).some((c) => c.typeId === typeId)

/* The one scan behind every answer below. The live rules first; a saved draft
   of a published policy only when the live rules do not match — otherwise the
   "Used by" panel said a zone was unused while the delete dialog, which did
   read drafts, listed the draft that uses it. */
function uses(policies: Policy[], match: (r: Rule) => boolean): PolicyUse[] {
  const out: PolicyUse[] = []
  for (const policy of policies) {
    const inLive = policy.rules.filter(match)
    if (inLive.length > 0) {
      out.push({ policy, rules: inLive })
      continue
    }
    const inDraft = policy.pendingDraft ? policy.pendingDraft.rules.filter(match) : []
    if (inDraft.length > 0) out.push({ policy, rules: inDraft, draft: true })
  }
  return out
}

/** Every policy with at least one rule referencing `valueId` — live, or in a saved draft — and which rules. */
export function policiesUsing(typeId: string, valueId: string, policies: Policy[]): PolicyUse[] {
  return uses(policies, (r) => names(r, typeId, valueId))
}

/** Every policy with at least one rule — live, or in a saved draft — that has a
    condition of `typeId`, whatever its value. For conditions that name no
    library object by id, such as `device-risk`, which compares against the risk
    profile in use. */
export function policiesUsingType(typeId: string, policies: Policy[]): PolicyUse[] {
  return uses(policies, (r) => hasType(r, typeId))
}

/** What deleting the object would do, split by whether a policy deciding sign-ins now depends on it. */
export interface DeleteImpact {
  /* Policies that evaluate sign-ins today and whose live rules name it. A delete
     is refused while this is not empty: the rule would silently stop matching. */
  live: PolicyUse[]
  /* Everything else that names it: drafts, switched-off policies, and saved
     drafts of live policies. Allowed, and those rules are flagged until fixed. */
  later: PolicyUse[]
}

export function deleteImpact(typeId: string, valueId: string, policies: Policy[]): DeleteImpact {
  const live: PolicyUse[] = []
  const later: PolicyUse[] = []
  for (const use of policiesUsing(typeId, valueId, policies)) {
    if (!use.draft && evaluates(use.policy)) live.push(use)
    else later.push(use)
  }
  return { live, later }
}
