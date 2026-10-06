import { rule, type Policy, type TempAccess } from '../../data'

/* -----------------------------------------------------------------------------
   Temporary access (docs/specs/DENIAL-NEXT.md, P0 item 3): from a refusal, "Let
   this person in until a date" — a rule for that person, first in the policy
   that refused them, which switches itself off after the date (data.ts
   `ruleExpired`). A reason is always asked and the length is capped, so a
   favour cannot quietly become a hole. PURE.
   -------------------------------------------------------------------------- */

/** The longest a grant may run. */
export const TEMP_ACCESS_MAX_DAYS = 30
export const TEMP_ACCESS_REASON_MAX = 200

const DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parse = (iso: string): number => Date.parse(`${iso}T00:00:00Z`)

/** `iso` plus `n` days, as YYYY-MM-DD. */
export function addDays(iso: string, n: number): string {
  return new Date(parse(iso) + n * DAY).toISOString().slice(0, 10)
}

/** "12 Oct 2026". */
export function dateSaid(iso: string): string {
  const d = new Date(parse(iso))
  return Number.isNaN(d.getTime()) ? iso : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** What stops a grant, said under the field it is about; null when it can go. */
export function tempAccessIssue(until: string, today: string, reason: string): { field: 'until' | 'reason'; text: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(parse(until))) return { field: 'until', text: 'Choose an end date' }
  if (until < today) return { field: 'until', text: 'The end date has passed' }
  if (parse(until) - parse(today) > TEMP_ACCESS_MAX_DAYS * DAY) return { field: 'until', text: `Access can last up to ${TEMP_ACCESS_MAX_DAYS} days` }
  if (reason.trim() === '') return { field: 'reason', text: 'Enter a reason' }
  return null
}

/** The policy with a rule first that lets `person` in on 2 factors up to the end date. */
export function grantTempAccess(policy: Policy, person: { id: string; name: string }, access: TempAccess): Policy {
  const granted = rule({
    name: `Temporary access: ${person.name}, until ${dateSaid(access.until)}`,
    who: { groupIds: [], userIds: [person.id] },
    decision: '2fa',
    tempAccess: { ...access, reason: access.reason.trim().slice(0, TEMP_ACCESS_REASON_MAX) },
  })
  return { ...policy, rules: [granted, ...policy.rules] }
}

/** Every grant in a policy, for the list of what will expire. */
export const tempGrantsOf = (policy: Pick<Policy, 'rules'>) => policy.rules.filter((r) => r.tempAccess)

/** How a rule whose grant has run out reads in the run (it is off there, but nobody switched it off), and in the details panel. */
export const GRANT_ENDED = 'Temporary access ended'
