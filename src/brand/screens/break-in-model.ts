import { FALLBACK_NAME, type AccessDecision, type Policy, type Rule } from '../data'
import { DECISION_WORDS, DEVICE_FACT_WORDS, FACTOR_WORDS, factWords } from '../decision-words'
import { AUTH_METHODS } from '../methods'
import { openForEditing } from '../policy-draft'
import type { FactorStrength } from './factor-strength'
import {
  applyFix,
  proposeAttemptFix,
  proposeFactorFix,
  runBreakIn,
  type AttemptOutcome,
  type AttemptRound,
  type BreakInCounts,
  type BreakInOptions,
  type BreakInResult,
  type Expect,
  type FactorFix,
  type ProposedFix,
} from './gauntlet'
import { sweepTenant } from './impact-arena'
import { ruleIfLine, type NameLookup } from './predicate-prose'
import { TENANT_TZ, type FactSource, type SignInDevice, type SignInFacts } from './sign-in-facts'
import { personOf, type SimEnv } from './simulate'
import { loosens, whatChangesLine, type WhatChangesLine } from './what-changes'
import { placeOfSignIn } from './zone-match'

/* -----------------------------------------------------------------------------
   The Break-in test, as the view reads it: rows, groups, counts, fixes and the
   results an administrator has accepted.

   Counts, never a grade (owner, 25 Sep 2026). A letter is a judgement; what an
   administrator acts on is how many of which, and which ones. Four counts are
   cells — Got through, Weaker factor, Locked out, Extra prompts — and the two
   outcomes that are neither a hole nor a cost are listed under their own
   headings with no cell: Less than asked (an ordinary sign-in let in more
   easily than its card asks, with nobody exploiting it) and Can't tell (a fact
   the card does not state would turn it either way). Held closes the list.

   A fix is offered with what it would do, computed before it is applied: the
   four counts after it, and what changes across the tenant, looser moves
   first. And a fix is never looser. One that would let anybody in more easily
   anywhere on the modelled grid is not offered at all — the same rule Try a
   sign-in keeps for its suggestions — because a repair for one scripted
   sign-in that opens another door is not a repair. A fix whose rule names a
   zone, profile, group or person this tenant does not have is withheld too
   (`proposeAttemptFix`).

   Pure, so every word and number the view prints is pinned without drawing it.
   -------------------------------------------------------------------------- */

// --- Acceptance -------------------------------------------------------------------

/* A result the tenant has agreed with, for one card on one policy: the
   decision it now expects, whether a weaker second factor is accepted too, and
   who said so, when and why. On the store (`breakInAccepted`), reset with the
   tenant. */
export interface BreakInAcceptance {
  want: AccessDecision
  /** The card's weakest factor no longer applies: a weaker factor was accepted. */
  factorOk: boolean
  /** The account's name: "Jaspreet Toor". */
  by: string
  /** ISO 8601. */
  at: string
  /** 1 to 200 characters. */
  reason: string
}

/** One policy's acceptances, by card id. */
export type Accepted = Readonly<Record<string, BreakInAcceptance>>

/** The longest reason an acceptance may give. */
export const REASON_MAX = 200

/** The run options an acceptance makes: its decision as the card's expectation, and its factor waived. */
export function acceptanceOptions(accepted: Accepted | undefined): Pick<BreakInOptions, 'overrides' | 'factorOk'> {
  const entries = Object.entries(accepted ?? {})
  return {
    overrides: Object.fromEntries(entries.map(([id, a]) => [id, a.want])) as Record<string, Expect>,
    factorOk: new Set(entries.filter(([, a]) => a.factorOk).map(([id]) => id)),
  }
}

/* What accepting a round records. Only a definite result can be accepted: a
   held round needs nothing, and one that can't be told has no single result
   to agree with. */
export function acceptanceFor(round: AttemptRound, by: string, at: string, reason: string): BreakInAcceptance | null {
  if (!round.decision || round.outcome === 'held' || round.outcome === 'undecided') return null
  return { want: round.decision, factorOk: round.outcome === 'weaker-factor', by, at, reason: reason.trim().slice(0, REASON_MAX) }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* "26 Sep 2026, 14:05": 24-hour, short month, in the tenant's time zone. The
   month by table, not Intl — en-GB now says "Sept". */
export function stampSaid(iso: string, timeZone: string = TENANT_TZ): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}, ${parts.hour}:${parts.minute}`
}

/** "Accepted by Jaspreet Toor · 26 Sep 2026, 14:05". */
export const acceptedSaid = (a: Pick<BreakInAcceptance, 'by' | 'at'>, timeZone?: string): string => `Accepted by ${a.by} · ${stampSaid(a.at, timeZone)}`

// --- Groups and counts --------------------------------------------------------------

export type BreakInGroup = 'got-through' | 'weaker-factor' | 'less-than-asked' | 'locked-out' | 'extra-prompts' | 'cant-tell' | 'held'

/** The order the list is read in: the holes, then the costs, then what can't be told, then what held. */
export const GROUP_ORDER: readonly BreakInGroup[] = ['got-through', 'weaker-factor', 'less-than-asked', 'locked-out', 'extra-prompts', 'cant-tell', 'held']

export const GROUP_WORDS: Record<BreakInGroup, string> = {
  'got-through': 'Got through',
  'weaker-factor': 'Weaker factor',
  'less-than-asked': 'Less than asked',
  'locked-out': 'Locked out',
  'extra-prompts': 'Extra prompts',
  'cant-tell': "Can't tell",
  held: 'Held',
}

export const groupOf = (o: AttemptOutcome): BreakInGroup => (o === 'undecided' ? 'cant-tell' : o)

export type CountKey = 'gotThrough' | 'weakerFactor' | 'lockedOut' | 'extraPrompts'

/** The four counts, each a cell that filters the list to its group. One line each for its tooltip. */
export const COUNT_CELLS: readonly { key: CountKey; group: BreakInGroup; word: string; tip: string }[] = [
  { key: 'gotThrough', group: 'got-through', word: 'Got through', tip: 'Hostile sign-ins that got less than expected.' },
  { key: 'weakerFactor', group: 'weaker-factor', word: 'Weaker factor', tip: 'Asked for 2FA with a factor this attack can beat.' },
  { key: 'lockedOut', group: 'locked-out', word: 'Locked out', tip: 'Ordinary sign-ins that were denied.' },
  { key: 'extraPrompts', group: 'extra-prompts', word: 'Extra prompts', tip: 'Ordinary sign-ins asked for 2FA they did not need.' },
]

/** What the counts are and are not, in one line. */
export const BREAK_IN_TIP = 'Scripted sign-ins against these rules; not breach likelihood.'

/** The live region's first sentence: "Break-in test: got through 0, weaker factor 0, locked out 1, extra prompts 0." */
export function countsSpoken(counts: Pick<BreakInCounts, CountKey>): string {
  return `Break-in test: ${COUNT_CELLS.map((c) => `${c.word.toLowerCase()} ${counts[c.key]}`).join(', ')}.`
}

/** The cells whose count moved. */
export function changedCounts(prev: Pick<BreakInCounts, CountKey>, next: Pick<BreakInCounts, CountKey>): CountKey[] {
  return COUNT_CELLS.filter((c) => prev[c.key] !== next[c.key]).map((c) => c.key)
}

/** The live region after a change: "Locked out now 0." — or null when no count moved. */
export function countsMoved(prev: Pick<BreakInCounts, CountKey>, next: Pick<BreakInCounts, CountKey>): string | null {
  const moved = COUNT_CELLS.filter((c) => prev[c.key] !== next[c.key])
  return moved.length === 0 ? null : moved.map((c) => `${c.word} now ${next[c.key]}.`).join(' ')
}

// --- Rows -------------------------------------------------------------------------------

export interface BreakInRow {
  /** The card's id. */
  id: string
  round: AttemptRound
  group: BreakInGroup
  name: string
  expected: AccessDecision
  /** The decision, or null when it can't be told. */
  got: AccessDecision | null
  /** The deciding rule's index; null is the last row. Undefined when it can't be told. */
  ruleIndex: number | null | undefined
  /** "Rule 1", "Last row", or '' when it can't be told. */
  ruleLabel: string
  /** The rule's id, or 'fallback' for the last row, for opening it on the board. */
  ruleRef: string | undefined
  accepted: BreakInAcceptance | null
}

/* One round as a row, its rule read in the policy that decided it. Out of
   `breakInRows` so a run across the tenant (break-in-app.ts), where each card
   can be decided by a different policy, reads each one in its own. A can't
   tell row reads no rule at all. */
export function breakInRow(round: AttemptRound, policy: Pick<Policy, 'rules'>, accepted?: Accepted): BreakInRow {
  const group = groupOf(round.outcome)
  const told = group !== 'cant-tell'
  const index = told ? round.trace.hitIndex : undefined
  return {
    id: round.challenge.id,
    round,
    group,
    name: round.challenge.name,
    expected: round.want,
    got: told ? round.decision : null,
    ruleIndex: index,
    ruleLabel: index === undefined ? '' : index === null ? 'Last row' : `Rule ${index + 1}`,
    ruleRef: index === undefined ? undefined : index === null ? 'fallback' : policy.rules[index]?.id,
    accepted: accepted?.[round.challenge.id] ?? null,
  }
}

/** Every round, in deck order, with its group and the rule that decided it. */
export function breakInRows(result: BreakInResult, policy: Policy, accepted?: Accepted): BreakInRow[] {
  return result.rounds.map((round) => breakInRow(round, policy, accepted))
}

export interface RowGroup {
  group: BreakInGroup
  word: string
  rows: BreakInRow[]
}

/** The rows under their headings, in `GROUP_ORDER`; an empty group is not drawn. `only` keeps one group. */
export function groupRows(rows: readonly BreakInRow[], only: BreakInGroup | null = null): RowGroup[] {
  return GROUP_ORDER.filter((g) => only === null || g === only)
    .map((group) => ({ group, word: GROUP_WORDS[group], rows: rows.filter((r) => r.group === group) }))
    .filter((g) => g.rows.length > 0)
}

/** Accept this result is offered for every result but held and can't tell. */
export const canAccept = (row: Pick<BreakInRow, 'group'>): boolean => row.group !== 'held' && row.group !== 'cant-tell'

/** The rows whose group moved since the last run, by card id. None on a first run. */
export function movedRows(prev: Readonly<Record<string, BreakInGroup>> | null, rows: readonly BreakInRow[]): string[] {
  if (!prev) return []
  return rows.filter((r) => prev[r.id] !== undefined && prev[r.id] !== r.group).map((r) => r.id)
}

export const groupsById = (rows: readonly BreakInRow[]): Record<string, BreakInGroup> => Object.fromEntries(rows.map((r) => [r.id, r.group]))

/* The id framer pairs a row by across renders. Scoped to the policy: the deck
   is the same fifteen cards for every policy, so a row keyed by its card alone
   would slide from where it sat in the last policy's list — and a new policy
   is a first run, which fades and never moves. */
export const rowLayoutId = (base: string, policyId: string, cardId: string): string => `${base}-${policyId}-${cardId}`

/** "Finance working from home. Locked out. Expected Allow with 2FA, got Deny." — the row's toggle, read aloud. */
export function rowSpoken(row: BreakInRow): string {
  const got = row.got ? DECISION_WORDS[row.got] : "Can't tell"
  return `${row.name}. ${GROUP_WORDS[row.group]}. Expected ${DECISION_WORDS[row.expected]}, got ${got}.`
}

// --- The expanded row's lines ------------------------------------------------------------

const SOURCE_WORD: Record<FactSource, string> = { typed: 'typed', 'looked-up': 'looked up', stated: 'stated', assumed: 'assumed' }

const PLATFORM_WORD: Record<NonNullable<SignInDevice['platform']>, string> = {
  windows: 'Windows',
  macos: 'macOS',
  ios: 'iOS',
  android: 'Android',
  linux: 'Linux',
  other: 'Other platform',
}

const yesNo = (b: boolean) => (b ? 'Yes' : 'No')

/* The device, as its detail rows name its facts: "Windows 10.0.22631 laptop,
   Registered to this person: No, Device Agent: No, Devices already
   registered: 1". Only the facts the card states. */
function deviceSaid(d: SignInDevice): string {
  const what = [d.platform ? PLATFORM_WORD[d.platform] : 'Device', d.osVersion, d.formFactor?.toLowerCase()].filter(Boolean).join(' ')
  const detail: string[] = []
  if (d.registeredToPerson !== undefined) detail.push(`${DEVICE_FACT_WORDS['device.registration']}: ${yesNo(d.registeredToPerson)}`)
  if (d.agentInstalled !== undefined) detail.push(`${DEVICE_FACT_WORDS['device.agent']}: ${d.agentInstalled ? (d.agentVersion ?? 'Yes') : 'No'}`)
  if (d.authenticatorVersion !== undefined)
    detail.push(`${DEVICE_FACT_WORDS['device.authenticatorVersion']}: ${d.authenticatorVersion === null ? 'No' : d.authenticatorVersion || 'Yes'}`)
  if (d.registeredCount !== undefined) detail.push(`${DEVICE_FACT_WORDS['device.registeredCount']}: ${d.registeredCount}`)
  return [what, ...detail].join(', ')
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* "Mon 28 Sep 2026 10:40 Asia/Kolkata". The weekday from the date alone — a
   calendar fact, whatever zone it is read in. */
function whenSaid(w: NonNullable<SignInFacts['when']>): string {
  const m = w.date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(w.date) : null
  const day = m ? `${WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()]} ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]} ` : ''
  return `${day}${w.time} ${w.timeZone}`
}

/* The sign-in a card scripts, each fact with where it came from: "Arun Patel ·
   192.0.2.82 (typed) · Frankfurt (looked up) · … (stated) · Risk 12
   (stated)". Unlabelled: it is the card's own facts, read left to right. */
export function factsSaid(round: AttemptRound, env: SimEnv): string {
  const card = round.challenge
  const f = card.facts
  const out: string[] = [personOf(card.personId, env)?.name ?? card.personId]
  if (f.network) out.push(`${f.network.address} (${SOURCE_WORD[f.network.source]})`)
  const place = placeOfSignIn(f)
  if (place === null) out.push('No place')
  else if (place) out.push(`${place.city ?? place.state ?? place.country ?? 'Place'} (${SOURCE_WORD[place.source]})`)
  if (f.device) out.push(`${deviceSaid(f.device)} (${SOURCE_WORD[f.device.source]})`)
  if (f.when) out.push(`${whenSaid(f.when)} (${SOURCE_WORD[f.when.source]})`)
  if (f.risk) out.push(`Risk ${f.risk.score} (${SOURCE_WORD[f.risk.source]})`)
  return out.join(' · ')
}

/* "Rule 1 · In a corporate office", or "Last row · Nothing else matched",
   and the trace's own reason for it. Null when the round can't be told: no
   single rule decided it. */
export function decidedBySaid(row: BreakInRow): { label: string; reason: string } | null {
  if (row.ruleIndex === undefined) return null
  const t = row.round.trace
  if (row.ruleIndex === null) return { label: `Last row · ${FALLBACK_NAME}`, reason: t.lastRow?.reason ?? '' }
  const step = t.steps[row.ruleIndex]
  return { label: `Rule ${row.ruleIndex + 1} · ${step?.ruleName ?? ''}`, reason: step?.reason ?? '' }
}

/* What a rule's second factor offers, in the words the board's rule card
   uses: the named methods, a chain, the person's preferred method, or any. */
export function methodsSaid(rule: Pick<Rule, 'secondFactor' | 'secondFactorMethods' | 'methodChain' | 'preferredFallback'>): string {
  if (rule.secondFactor === 'specific') return (rule.secondFactorMethods ?? []).join(', ') || 'Nothing chosen'
  if (rule.secondFactor === 'chain') return (rule.methodChain ?? []).join(' → ') || 'Empty chain'
  if (rule.secondFactor === 'preferred') return rule.preferredFallback ? `Their preferred method, else ${rule.preferredFallback}` : 'Their preferred method'
  return 'Any enabled method'
}

/* "miniOrange Push · standard · needs phishing-resistant": what the deciding
   rule offers, how strong that is, and what the card asks for. Weaker factor
   rows only. */
export function secondFactorSaid(row: BreakInRow, policy: Policy): string | null {
  const min = row.round.challenge.minFactor
  if (row.group !== 'weaker-factor' || !min || row.ruleIndex === undefined) return null
  const rule = row.ruleIndex === null ? policy.fallback : policy.rules[row.ruleIndex]
  if (!rule) return null
  const tier: FactorStrength = row.round.factor ?? 'below-weak'
  return `${methodsSaid(rule)} · ${FACTOR_WORDS[tier]} · needs ${FACTOR_WORDS[min]}`
}

/** "Allow with 2FA by rule 1, or Deny by the last row" — can't tell rows only. */
export function possibleSaid(row: BreakInRow): string | null {
  if (row.group !== 'cant-tell') return null
  return row.round.trace.possible.map((o) => `${DECISION_WORDS[o.decision]} by ${o.ruleIndex === null ? 'the last row' : `rule ${o.ruleIndex + 1}`}`).join(', or ')
}

/** "IP address, Place" — the facts that would settle a can't tell row, each once. */
export function needsSaid(row: BreakInRow): string | null {
  if (row.group !== 'cant-tell') return null
  const words = factWords(row.round.trace.unknowns.flatMap((u) => u.missing))
  return words.length === 0 ? null : words.join(', ')
}

// --- Fixes ------------------------------------------------------------------------------

export type BreakInFix = { kind: 'rule'; fix: ProposedFix } | { kind: 'factor'; fix: FactorFix }

/* The fix a round's card names, if there is one to offer. Held, can't tell
   and the costs have none. `appId` is the application the round was played
   on, when that is not the policy's first (break-in-app.ts). */
export function fixFor(round: AttemptRound, policy: Policy, env: SimEnv, appId?: string): BreakInFix | null {
  const rule = proposeAttemptFix(round, policy, env, appId ?? policy.appIds[0])
  if (rule) return { kind: 'rule', fix: rule }
  const factor = proposeFactorFix(round, policy, env.library?.methods ?? AUTH_METHODS)
  return factor ? { kind: 'factor', fix: factor } : null
}

/** The policy with the fix applied. */
export function applyBreakInFix(policy: Policy, f: BreakInFix): Policy {
  if (f.kind === 'rule') return { ...policy, rules: applyFix(policy.rules, f.fix) }
  const { ruleIndex, methods } = f.fix
  const stronger = (r: Rule): Rule => ({ ...r, secondFactor: 'specific', secondFactorMethods: [...methods] })
  if (ruleIndex === null) return policy.fallback ? { ...policy, fallback: stronger(policy.fallback) } : policy
  return { ...policy, rules: policy.rules.map((r, i) => (i === ruleIndex ? stronger(r) : r)) }
}

/* A re-aimed rule that keeps its decision only moved: it already said this,
   below the rule that decides first. */
const onlyMoves = (f: ProposedFix, policy: Policy) => f.kind === 'retune' && f.fromIndex !== undefined && policy.rules[f.fromIndex]?.decision === f.rule.decision

/* What the rule becomes:
     insert   "Deny sign-ins from outside India — If not in zone India → Deny · at position 1"
     retune   "Rule 3 · Verify contractors → Allow with 2FA", or "Rule 3 moves above rule 1"
     factor   "Rule 2 · Compliant device, working remotely → FIDO2 / Passkey" */
export function fixLine(f: BreakInFix, policy: Policy, resolve?: NameLookup): string {
  if (f.kind === 'factor') {
    const { ruleIndex, methods } = f.fix
    const where = ruleIndex === null ? 'Last row' : `Rule ${ruleIndex + 1} · ${policy.rules[ruleIndex]?.name ?? ''}`
    return `${where} → ${methods.join(', ')}`
  }
  const fix = f.fix
  if (fix.kind === 'insert') return `${fix.rule.name} — ${ruleIfLine(fix.rule, resolve)} → ${DECISION_WORDS[fix.rule.decision]} · at position ${fix.at + 1}`
  const from = (fix.fromIndex ?? fix.at) + 1
  if (onlyMoves(fix, policy)) return `Rule ${from} moves above rule ${fix.at + 1}`
  return `Rule ${from} · ${fix.rule.name} → ${DECISION_WORDS[fix.rule.decision]}`
}

/** The button that applies it, named for the edit. */
export function fixButton(f: BreakInFix, policy: Policy): string {
  if (f.kind === 'factor') return 'Change second factor'
  const fix = f.fix
  if (fix.kind === 'insert') return 'Add this rule'
  const from = (fix.fromIndex ?? fix.at) + 1
  return onlyMoves(fix, policy) ? `Move rule ${from} up` : `Change rule ${from}`
}

/** What the toast says once it is applied to the board's draft, with Undo. */
export function fixToast(f: BreakInFix, policy: Policy): string {
  if (f.kind === 'factor') return `Second factor changed on ${f.fix.ruleIndex === null ? 'the last row' : `rule ${f.fix.ruleIndex + 1}`}. Not saved yet.`
  const fix = f.fix
  if (fix.kind === 'insert') return 'Rule added. Not saved yet.'
  const from = (fix.fromIndex ?? fix.at) + 1
  return onlyMoves(fix, policy) ? `Rule ${from} moved. Not saved yet.` : `Rule ${from} changed. Not saved yet.`
}

/* The rule to open on the board for this fix: the one it changes, or — for a
   rule it adds — the one it lands above ('fallback' for the last row). */
export function fixRuleRef(f: BreakInFix, policy: Policy): string {
  const index = f.kind === 'factor' ? f.fix.ruleIndex : f.fix.kind === 'retune' ? (f.fix.fromIndex ?? f.fix.at) : f.fix.at
  return index === null || index >= policy.rules.length ? 'fallback' : policy.rules[index].id
}

export interface FixPreview {
  /** The counts with the fix applied, on the same acceptances. */
  counts: BreakInCounts
  /** The cells the fix moves. */
  changed: CountKey[]
  /** What changes across the tenant, this policy's applications, fixed against as tested. */
  line: WhatChangesLine
}

/* What applying the fix would do, before it is applied: the deck run again on
   the fixed policy with the same acceptances — so the number here is the
   number applying it produces — and the tenant swept on each of its
   applications at 09:30 with the policy as tested, then as fixed, each as
   though it were the one in force. */
export function previewFix(
  policy: Policy,
  f: BreakInFix,
  env: SimEnv,
  opts: BreakInOptions,
  policies: readonly Policy[],
  now: BreakInCounts,
  nowMinutes = 570,
): FixPreview {
  const fixed = applyBreakInFix(policy, f)
  const counts = runBreakIn(fixed, env, opts).counts
  const before = policy.appIds.map((a) => sweepTenant(policies, a, env, nowMinutes, { substitute: policy }))
  const after = policy.appIds.map((a) => sweepTenant(policies, a, env, nowMinutes, { substitute: fixed }))
  return { counts, changed: changedCounts(now, counts), line: whatChangesLine(before, after, env) }
}

/* The fix to offer for a round, with its preview — or none. None when the
   card names no fix, when the fix names something the tenant lacks, and when
   the fix would loosen anything: never a looser fix. */
export function offeredFix(
  round: AttemptRound,
  policy: Policy,
  env: SimEnv,
  opts: BreakInOptions,
  policies: readonly Policy[],
  now: BreakInCounts,
): { fix: BreakInFix; preview: FixPreview } | null {
  const fix = fixFor(round, policy, env)
  if (!fix) return null
  const preview = previewFix(policy, fix, env, opts, policies, now)
  return loosens(preview.line) ? null : { fix, preview }
}

// --- Which policy -----------------------------------------------------------------------

/** Whether a Break-in test can run on a policy: App Access, with an application, not the Global Default. */
export const breakInEligible = (p: Pick<Policy, 'type' | 'appIds' | 'isSystem'>): boolean => p.type === 'App Access' && p.appIds.length > 0 && !p.isSystem

/** The policies a Break-in test can run on, in list order. */
export function breakInPolicies(policies: readonly Policy[]): Policy[] {
  return policies.filter(breakInEligible)
}

/* Which one the page opens on (final spec, B.8): the policy Try assumes on,
   else the policy deciding Try's sign-in when it is not the Global Default,
   else the first one there is. */
export function breakInDefault(policies: readonly Policy[], prefer: { assumedId?: string | null; deciderId?: string | null }): string | null {
  const ok = breakInPolicies(policies)
  const has = (id: string | null | undefined) => (id && ok.some((p) => p.id === id) ? id : null)
  return has(prefer.assumedId) ?? has(prefer.deciderId) ?? ok[0]?.id ?? null
}

/** A policy as the Policy to test picker lists it: its status, or that a saved draft is what runs. */
export function statusMeta(p: Policy): string {
  if (p.pendingDraft && p.status !== 'draft') return 'Saved draft'
  return p.status === 'active' ? 'Active' : p.status === 'monitor' ? 'Monitoring' : p.status === 'inactive' ? 'Inactive' : p.status === 'draft' ? 'Draft' : 'Always on'
}

/* Which version of a stored policy's rules the test runs, for the caption on
   the page and the slider: the saved draft, or the stored rules by status.
   The board names its own version as its right-hand column does
   (`boardVersion`), so one panel never calls the same rules two things. */
export function versionWord(p: Policy): string {
  if (p.pendingDraft && p.status !== 'draft') return 'Saved draft'
  return p.status === 'active' || p.status === 'always-on' ? 'Live' : p.status === 'monitor' ? 'Monitoring' : p.status === 'draft' ? 'Draft' : 'Stored version'
}

/** The rules a stored policy is tested on: its saved draft when it has one. */
export const testedVersion = (p: Policy): Policy => openForEditing(p)

/* "10 skipped: outside Human Resources, Finance", or null when nothing was
   skipped. The count leads and the audience is what they were outside of: it
   read "Not in audience: Human Resources, Finance · 10 skipped", which says the
   two groups were outside the audience when they ARE the audience (owner,
   26 Sep 2026). Every card is skipped for the same audience, so one says it.
   A policy with nobody chosen skips every card and has no audience to name —
   "outside nobody chosen" — so it says nothing here, and the empty state
   above it ("No scripted sign-ins for this audience") is the whole story. */
export function skippedSaid(result: BreakInResult): string | null {
  const audience = result.skipped[0]?.audience
  if (!audience) return null
  return `${result.counts.skipped} skipped: outside ${audience}`
}
