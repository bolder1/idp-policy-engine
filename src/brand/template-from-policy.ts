import { reidRule, type Policy, type Scenario } from './data'
import { openForEditing } from './policy-draft'
import { predicateSentence, whoSentence, type NameLookup } from './screens/predicate-prose'

/* A policy saved as one of this tenant's templates.

   Built from what a builder would open (a saved draft if there is one). Every
   `build()` hands back a fresh copy with new ids, so a policy made from the
   template never shares a rule, card or condition with the source or with
   another policy made from it. */

const CATEGORIES: Scenario['category'][] = ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance', 'Uncategorized']

let seq = 0

export interface TemplateFields {
  name: string
  description: string
  category: string
}

const sentenceCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function scenarioFromPolicy(
  policy: Policy,
  fields: TemplateFields,
  now: number = Date.now(),
  resolve?: NameLookup,
): Scenario {
  seq += 1
  const from = openForEditing(policy)
  const category = CATEGORIES.includes(fields.category as Scenario['category'])
    ? (fields.category as Scenario['category'])
    : 'Uncategorized'

  return {
    id: `s-own-${now.toString(36)}-${seq}`,
    name: fields.name.trim(),
    description: fields.description.trim(),
    category,
    provided: undefined,
    author: 'You',
    when: 'Just now',
    audience: {
      ...policy.audience,
      groupIds: [...policy.audience.groupIds],
      userIds: [...policy.audience.userIds],
    },
    rules: from.rules.map((r) => {
      /* A snapshot taken at save time, so editing the policy later does not
         change the template. */
      const snap = reidRule(r)
      /* Who leads when the rule has one — "For Finance, in zone Office
         Network" — and the conditions never name people. `reidRule` copies the
         who, so every build carries it. */
      const who = whoSentence(r.who, resolve)
      const iff = who && r.when.cards.length === 0 ? 'any login' : predicateSentence(r.when, resolve)
      return {
        name: r.name,
        ifText: who ? `For ${who}, ${iff}` : sentenceCase(iff),
        decision: r.decision,
        build: () => reidRule(snap),
      }
    }),
  }
}
