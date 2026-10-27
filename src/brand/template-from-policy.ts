import { reidRule, type Policy, type Scenario } from './data'
import { openForEditing } from './policy-draft'
import { predicateSentence, whoSentence, type NameLookup } from './screens/predicate-prose'

/* A policy saved as one of this tenant's templates.

   WHAT IS SAVED, and what is not (27 Oct 2026, the template audit):
     · the policy's RULES, each as it stands — name, who, the conditions, and the decision (Allow, MFA or Deny) with
       everything that goes with it — and the policy's audience, which narrows every rule when the template is used;
     · NOT the applications (a template is made for the next application, not this one), NOT the status, and NOT the
       policy's own "Nothing else matched": that decision belongs to whichever policy the template is used on, and the
       template's card says so by showing that policy's own default under the rules.

   WHICH VERSION: what a builder would open — a saved draft if there is one, else the live rules (`openForEditing`).
   A caller that holds edits not yet saved (the board's) passes a policy whose rules ARE those edits and no saved
   draft, so the template is what the admin sees.

   Every `build()` hands back a fresh copy with new ids, so a policy made from the template never shares a rule, card
   or condition with the source or with another policy made from it. */

const CATEGORIES: Scenario['category'][] = ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance', 'Uncategorized']

let seq = 0

export interface TemplateFields {
  name: string
  description: string
  category: string
}

const sentenceCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/* The day it was saved, as a date: "27 Oct 2026". It was the text "Just now", stored once, so a template saved on
   Monday said "You · Just now" for ever (it is the line under a tenant template's name, `scenarioCard`). */
export const savedOn = (now: number): string => new Date(now).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

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
    when: savedOn(now),
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
      const iff = who && r.when.cards.length === 0 ? 'any sign-in' : predicateSentence(r.when, resolve)
      return {
        name: r.name,
        ifText: who ? `For ${who}, ${iff}` : sentenceCase(iff),
        decision: r.decision,
        build: () => reidRule(snap),
      }
    }),
  }
}
