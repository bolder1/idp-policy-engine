import { FALLBACK_NAME, rule, type AccessDecision, type App, type Policy } from '../data'
import { CANT_TELL, DECISION_WORDS, decisionsOr, factWords } from '../decision-words'
import { withWho } from '../rule-who'
import { LEVEL_LABEL, type SavedSignIn } from '../saved-sign-ins'
import { GROUP_WORDS, acceptanceOptions, groupOf, type Accepted, type CountKey } from './break-in-model'
import { runBreakIn, type BreakInCounts, type BreakInResult } from './gauntlet'
import { sweepTenant } from './impact-arena'
import type { NameLookup } from './predicate-prose'
import { ruleChanges, type RuleChange } from './rule-changes'
import type { FactKey } from './sign-in-facts'
import { personOf, type SimEnv } from './simulate'
import { governingPolicy, resolveSignIn, type PolicyRef } from './tenant-resolver'
import { WHAT_CHANGES, whatChangesLine, type WhatChangesLine } from './what-changes'

/* -----------------------------------------------------------------------------
   The checks before an enforcing policy is saved, turned on, turned off or
   switched to monitoring — the guard pages' model (final spec, D.2–D.5).

   Every path that makes a policy decide real sign-ins differently runs the
   same checks, and each answers one question in one row:

     What you changed                  the rules, rule by rule
     Who it starts (stops) deciding    which audience, on which application
     Saved sign-ins                    the tenant's promises, read before and after
     Your own and protected sign-ins   the same, for the ones that matter most
     What changes                      the modelled grid, looser moves first
     Break-in test                     the scripted deck's four counts

   The checks stop a change only when a Must pass or Protected saved sign-in
   newly fails — and then with a ready fix beside the reason, so a block is
   never a dead end. Everything else informs. A page opens only when there is
   something worth reading (owner, 25 Sep 2026): a block, or somebody newly
   let in. A clean save stays one click.

     newly allowed = What changes says Now allowed above 0
                   | a saved sign-in went from Deny to an allow
                   | the Break-in test's Got through rose

   A policy's own checks (draft-checks.ts) are listed with the saved sign-ins
   but are not one: what Describe it generated opens no page by itself.

   A reading that can't be told is listed, grey, and never opens a page or
   blocks one: a missing fact is a gap in the saved sign-in, not proof the
   edit is wrong. Turning off and switching to monitoring never block at all —
   an admin must be able to switch a policy off in an incident.

   React-free, so every number and sentence the page prints is pinned here.
   -------------------------------------------------------------------------- */

export type GuardKind = 'save' | 'apps' | 'turn-on' | 'turn-off' | 'to-monitor'

export type Verdict = 'pass' | 'fail' | 'cant-tell'

/** One saved sign-in, read across the tenant. */
export interface Reading {
  verdict: Verdict
  decision: AccessDecision | null
  /** The decisions it could reach: one when decided, the distinct ones when it depends. */
  possible: AccessDecision[]
  decidedBy: PolicyRef | null
  /** The deciding policy's rule; null is its last row, undefined when no single rule decided. */
  ruleIndex: number | null | undefined
  ruleName: string
  /** The facts that would settle a reading that can't be told. */
  missing: FactKey[]
}

export interface SignInCheck {
  signIn: SavedSignIn
  before: Reading
  after: Reading
  /** The verdict or the decision moved. */
  changed: boolean
  /** It passed, and now does not. */
  regressed: boolean
  /** A Must pass or Protected sign-in that passed, and now fails. */
  blocks: boolean
  /** The admin's own sign-in. */
  own: boolean
}

export type DecidingKind = 'starts' | 'stops' | 'not'

/** One application, one kind of move, and the audience it happens to. */
export interface DecidingRow {
  appId: string
  appName: string
  kind: DecidingKind
  /** "Human Resources", "Finance": the audience units, each once. */
  units: string[]
  /** The policy it takes over from (starts), hands over to (stops), or why it does not decide (not). */
  other: string
}

/** A ready fix: what it is called, and the policy with it applied. */
export interface ReadyFix {
  label: string
  policy: Policy
  /** What it changes: the rules (the board's draft), or the applications. */
  on: 'rules' | 'apps'
}

export interface BreakInMove {
  cardId: string
  name: string
  was: string
  now: string
}

export interface GuardInput {
  kind: GuardKind
  /* The policy as it decides today, in its own slot: the stored one. Null when
     it decides nothing today — turning on, from Inactive or from Monitoring. */
  before: Policy | null
  /** The policy as it would stand after: saved, turned on, switched off. */
  after: Policy
  /** What "What you changed" compares against; null draws no such row. */
  changedFrom: Pick<Policy, 'rules' | 'fallback'> | null
  /** The tenant as it stands (the store's policies). */
  policies: readonly Policy[]
  env: SimEnv
  apps: readonly App[]
  savedSignIns: readonly SavedSignIn[]
  adminId: string
  /** This policy's accepted Break-in results; null when the edition has no Break-in test. */
  breakIn: Accepted | null
  resolve?: NameLookup
}

export interface GuardResult {
  kind: GuardKind
  subjectId: string
  changes: RuleChange[] | null
  deciding: DecidingRow[]
  saved: SignInCheck[]
  protectedOwn: SignInCheck[]
  /** Whether the tenant has any saved sign-in at all. */
  anySaved: boolean
  whatChanges: WhatChangesLine
  breakIn: { now: BreakInCounts; was: BreakInCounts | null; moved: BreakInMove[] } | null
  blocking: SignInCheck[]
  newlyAllowed: boolean
  interrupt: boolean
  /** The first blocker's fix, or null. */
  fix: ReadyFix | null
}

/** The minutes past midnight the tenant grid is swept at: 09:30. */
export const SWEEP_AT = 570

/* --- Reading one saved sign-in ------------------------------------------------- */

const distinct = <T>(xs: readonly T[]): T[] => [...new Set(xs)]

export function readSignIn(s: SavedSignIn, policies: readonly Policy[], env: SimEnv): Reading {
  const r = resolveSignIn(policies, s.facts, env)
  if (r.status === 'incomplete' || !r.trace) {
    const missing = (r.missing as string[]).filter((k): k is FactKey => k !== 'a global default policy')
    return { verdict: 'cant-tell', decision: null, possible: [], decidedBy: r.decidedBy, ruleIndex: undefined, ruleName: '', missing }
  }
  if (r.status === 'depends' || !r.decision) {
    return {
      verdict: 'cant-tell',
      decision: null,
      possible: distinct(r.possible.map((o) => o.decision)),
      decidedBy: r.decidedBy,
      ruleIndex: undefined,
      ruleName: '',
      missing: distinct(r.trace.unknowns.flatMap((u) => u.missing)),
    }
  }
  const hit = r.trace.hitIndex
  return {
    verdict: r.decision === s.expected ? 'pass' : 'fail',
    decision: r.decision,
    possible: [r.decision],
    decidedBy: r.decidedBy,
    ruleIndex: hit,
    ruleName: hit === null ? FALLBACK_NAME : (r.trace.steps[hit]?.ruleName ?? ''),
    missing: [],
  }
}

const TIGHTER: Record<Verdict, number> = { fail: 0, 'cant-tell': 1, pass: 2 }

/* Whether a change of a policy's status can stop anything. Turning off and
   switching to monitoring never block (final spec, assumption 24). */
const mayBlock = (kind: GuardKind) => kind !== 'turn-off' && kind !== 'to-monitor'

export function checkOf(s: SavedSignIn, before: Reading, after: Reading, kind: GuardKind, adminId: string): SignInCheck {
  const regressed = before.verdict === 'pass' && after.verdict !== 'pass'
  return {
    signIn: s,
    before,
    after,
    changed: before.verdict !== after.verdict || before.decision !== after.decision || before.possible.join() !== after.possible.join(),
    regressed,
    blocks: mayBlock(kind) && regressed && after.verdict === 'fail' && s.level !== 'note',
    own: s.facts.personId === adminId,
  }
}

/** Fails, then can't tell, then passes; by name within each. */
export function sortChecks(checks: readonly SignInCheck[]): SignInCheck[] {
  return [...checks].sort((a, b) => TIGHTER[a.after.verdict] - TIGHTER[b.after.verdict] || a.signIn.name.localeCompare(b.signIn.name))
}

/* --- Who it starts deciding for ------------------------------------------------- */

interface Unit {
  name: string
  personId: string
}

/* The audience, one representative each: every named group that has somebody
   in the directory (its first member), every named person, or — for everyone
   — every group with somebody in it. */
function audienceUnits(policies: readonly (Policy | null)[], env: SimEnv): Unit[] {
  const people = env.library?.people ?? []
  const groups = env.library?.groups ?? []
  const out: Unit[] = []
  const add = (u: Unit) => {
    if (!out.some((x) => x.name === u.name)) out.push(u)
  }
  const group = (id: string) => {
    const first = people.find((u) => u.groupId === id)
    if (first) add({ name: groups.find((g) => g.id === id)?.name ?? env.groupName(id), personId: first.id })
  }
  for (const p of policies) {
    if (!p) continue
    if (p.audience.everyone) groups.forEach((g) => group(g.id))
    p.audience.groupIds.forEach(group)
    for (const id of p.audience.userIds) {
      const u = people.find((x) => x.id === id)
      if (u) add({ name: u.name, personId: u.id })
    }
  }
  return out
}

const appsOfBoth = (before: Policy | null, after: Policy): string[] => distinct([...(before?.appIds ?? []), ...after.appIds])

export function decidingRows(input: Pick<GuardInput, 'before' | 'after' | 'policies' | 'env'>, policiesAfter: readonly Policy[]): DecidingRow[] {
  const { before, after, policies, env } = input
  if (after.isSystem) return []
  const units = audienceUnits([after, before], env)
  const rows = new Map<string, DecidingRow>()
  for (const appId of appsOfBoth(before, after)) {
    for (const u of units) {
      const facts = { appId, personId: u.personId }
      const was = governingPolicy(policies, facts, env).decider
      const now = governingPolicy(policiesAfter, facts, env)
      const nowId = now.decider?.id
      let kind: DecidingKind
      let other: string
      if (nowId === after.id && was?.id !== after.id) {
        kind = 'starts'
        other = was?.name ?? 'No policy'
      } else if (was?.id === after.id && nowId !== after.id) {
        kind = 'stops'
        other = now.decider?.name ?? 'No policy'
      } else {
        const stand = now.standings.find((s) => s.policyId === after.id)
        if (!stand || (stand.kind !== 'default-group-yields' && stand.kind !== 'same-app-and-group')) continue
        kind = 'not'
        other = stand.reason
      }
      const key = `${appId}|${kind}|${other}`
      const row = rows.get(key) ?? { appId, appName: env.appName?.(appId) ?? appId, kind, units: [], other }
      if (!row.units.includes(u.name)) row.units.push(u.name)
      rows.set(key, row)
    }
  }
  const ORDER: Record<DecidingKind, number> = { starts: 0, stops: 1, not: 2 }
  return [...rows.values()].sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
}

/* --- The run ------------------------------------------------------------------------ */

/** The tenant with this version of the policy in its place. */
export function withPolicy(policies: readonly Policy[], p: Policy): Policy[] {
  return policies.some((x) => x.id === p.id) ? policies.map((x) => (x.id === p.id ? p : x)) : [...policies, p]
}

/* The applications What changes sweeps: the policy's own, before and after.
   The Global Default covers every application, so it sweeps the first one in
   the catalogue that no enforcing application policy covers — where it is the
   one deciding. */
export function sweptApps(input: Pick<GuardInput, 'before' | 'after' | 'apps'>, policiesAfter: readonly Policy[]): string[] {
  const { before, after, apps } = input
  if (!after.isSystem) return appsOfBoth(before, after)
  const covered = new Set(policiesAfter.filter((p) => !p.isSystem && (p.status === 'active' || p.status === 'always-on')).flatMap((p) => p.appIds))
  const first = apps.find((a) => !covered.has(a.id))
  return first ? [first.id] : []
}

function breakInMoves(was: BreakInResult, now: BreakInResult): BreakInMove[] {
  const before = new Map(was.rounds.map((r) => [r.challenge.id, groupOf(r.outcome)]))
  return now.rounds
    .filter((r) => before.has(r.challenge.id) && before.get(r.challenge.id) !== groupOf(r.outcome))
    .map((r) => ({ cardId: r.challenge.id, name: r.challenge.name, was: GROUP_WORDS[before.get(r.challenge.id)!], now: GROUP_WORDS[groupOf(r.outcome)] }))
}

export function runGuard(input: GuardInput): GuardResult {
  const { kind, before, after, policies, env, savedSignIns, adminId } = input
  const policiesAfter = withPolicy(policies, after)
  const apps = new Set(appsOfBoth(before, after))

  /* Saved sign-ins: every one on this policy's applications, and any other
     whose reading moved — a policy can change a sign-in it does not cover by
     no longer taking the one it does. */
  const checks: SignInCheck[] = []
  for (const s of savedSignIns) {
    const b = readSignIn(s, policies, env)
    const a = readSignIn(s, policiesAfter, env)
    const c = checkOf(s, b, a, kind, adminId)
    if (after.isSystem || (s.facts.appId !== undefined && apps.has(s.facts.appId)) || c.changed) checks.push(c)
  }
  const protectedOwn = sortChecks(checks.filter((c) => c.signIn.level === 'protected' || c.own))
  const saved = sortChecks(checks.filter((c) => !(c.signIn.level === 'protected' || c.own)))

  const swept = sweptApps(input, policiesAfter)
  const whatChanges = whatChangesLine(
    swept.map((a) => sweepTenant(policies, a, env, SWEEP_AT)),
    swept.map((a) => sweepTenant(policiesAfter, a, env, SWEEP_AT)),
    env,
  )

  let breakIn: GuardResult['breakIn'] = null
  if (input.breakIn && mayBlock(kind)) {
    const opts = acceptanceOptions(input.breakIn)
    const now = runBreakIn(after, env, opts)
    const was = before ? runBreakIn(before, env, opts) : null
    breakIn = { now: now.counts, was: was?.counts ?? null, moved: was ? breakInMoves(was, now) : [] }
  }

  const all = [...protectedOwn, ...saved]
  const blocking = mayBlock(kind) ? all.filter((c) => c.blocks) : []
  const newlyAllowed =
    whatChanges.counts.nowAllowed > 0 ||
    all.some((c) => !c.signIn.generated && c.before.decision === 'deny' && c.after.verdict !== 'cant-tell' && c.after.decision !== 'deny') ||
    (breakIn !== null && breakIn.now.gotThrough > (breakIn.was?.gotThrough ?? 0))

  const result: GuardResult = {
    kind,
    subjectId: after.id,
    changes: input.changedFrom ? ruleChanges(input.changedFrom, after, input.resolve) : null,
    deciding: decidingRows(input, policiesAfter),
    saved,
    protectedOwn,
    anySaved: savedSignIns.length > 0,
    whatChanges,
    breakIn,
    blocking,
    newlyAllowed,
    interrupt: blocking.length > 0 || newlyAllowed,
    fix: null,
  }
  result.fix = blocking[0] ? readyFix(input, blocking[0], all) : null
  return result
}

/** The run, or 'error' when it threw: the page then says the checks could not run and lets the change through. */
export function tryRunGuard(input: GuardInput): GuardResult | 'error' {
  try {
    return runGuard(input)
  } catch (e) {
    console.error('Checks could not run', e)
    return 'error'
  }
}

/* Whether a page opens for this result (final spec, D.2). Turning on always
   shows its page; turning off and to monitoring only when somebody is newly
   let in; a save only when something interrupts it. */
export function guardOpens(r: GuardResult): boolean {
  if (r.kind === 'turn-on') return true
  if (r.kind === 'turn-off' || r.kind === 'to-monitor') return r.newlyAllowed
  return r.interrupt
}

/* --- Ready fixes (spec D §5.7) ---------------------------------------------------- */

const personName = (id: string, env: SimEnv) => personOf(id, env)?.name ?? env.userName?.(id) ?? id

/* Whether a candidate clears the blocker without making another: the blocker
   reads as passing with it, and nothing that did not block before blocks now.
   Saved sign-ins only — no sweeps — so trying six candidates stays cheap. */
function fixHolds(input: GuardInput, b: SignInCheck, candidate: Policy, checks: readonly SignInCheck[]): boolean {
  const list = withPolicy(input.policies, candidate)
  const blocked = new Set(checks.filter((c) => c.blocks).map((c) => c.signIn.id))
  for (const c of checks) {
    const after = readSignIn(c.signIn, list, input.env)
    if (c.signIn.id === b.signIn.id) {
      if (after.verdict !== 'pass') return false
      continue
    }
    const next = checkOf(c.signIn, c.before, after, input.kind, input.adminId)
    if (next.blocks && !blocked.has(c.signIn.id)) return false
  }
  return true
}

const catalogueOrder = (ids: readonly string[], apps: readonly App[]) => apps.filter((a) => ids.includes(a.id)).map((a) => a.id)

/* The candidates, in the spec's order, and the first that holds:

     C1  the deciding rule was changed           Restore rule {i}
     C2  the deciding rule only moved            Move rule {i} back to position {j}
     C3  the last row decides, and was changed   Restore the last row
     C4  the last row decides; the rule that
         decided it before was changed           Restore rule {m}
     C5  a rule decides it                       Leave {Person} out of rule {i}
     C6  it names a person                       Add a rule for {Person}

   C1 to C4 restore the stored version, so they need one (not turning on).
   A change of applications is fixed on the applications: keep the one taken
   away, or leave out the one added. */
export function readyFix(input: GuardInput, b: SignInCheck, checks: readonly SignInCheck[]): ReadyFix | null {
  const { before, after, env } = input
  const out: ReadyFix[] = []
  const appId = b.signIn.facts.appId
  const pid = b.signIn.facts.personId

  if (input.kind === 'apps') {
    if (appId && before) {
      const app = env.appName?.(appId) ?? appId
      /* With no application left a policy is a draft; with one back it keeps its status. */
      const withApps = (ids: string[]): Policy => ({ ...after, appIds: ids, status: ids.length === 0 && !after.isSystem ? 'draft' : before.status })
      if (before.appIds.includes(appId) && !after.appIds.includes(appId))
        out.push({ label: `Keep ${app}`, policy: withApps(catalogueOrder([...after.appIds, appId], input.apps)), on: 'apps' })
      if (!before.appIds.includes(appId) && after.appIds.includes(appId))
        out.push({ label: `Leave out ${app}`, policy: withApps(after.appIds.filter((x) => x !== appId)), on: 'apps' })
    }
  } else if (b.after.decidedBy?.policyId === after.id) {
    const i = b.after.ruleIndex
    const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y)
    if (before && i !== null && i !== undefined) {
      const r = after.rules[i]
      const j = before.rules.findIndex((x) => x.id === r?.id)
      if (j >= 0 && !same(before.rules[j], r)) {
        out.push({ label: `Restore rule ${i + 1}`, policy: { ...after, rules: after.rules.map((x, k) => (k === i ? before.rules[j] : x)) }, on: 'rules' })
      } else if (j >= 0 && j !== i) {
        const rules = [...after.rules]
        const [moved] = rules.splice(i, 1)
        rules.splice(Math.min(j, rules.length), 0, moved)
        out.push({ label: `Move rule ${i + 1} back to position ${j + 1}`, policy: { ...after, rules }, on: 'rules' })
      }
    }
    if (before && i === null) {
      if (!same(before.fallback, after.fallback)) out.push({ label: 'Restore the last row', policy: { ...after, fallback: before.fallback }, on: 'rules' })
      const m0 = b.before.decidedBy?.policyId === after.id ? b.before.ruleIndex : undefined
      const was = m0 !== null && m0 !== undefined ? before.rules[m0] : undefined
      const m = was ? after.rules.findIndex((x) => x.id === was.id) : -1
      if (was && m >= 0 && !same(was, after.rules[m]))
        out.push({ label: `Restore rule ${m + 1}`, policy: { ...after, rules: after.rules.map((x, k) => (k === m ? was : x)) }, on: 'rules' })
    }
    if (i !== null && i !== undefined && pid && after.rules[i]) {
      const r = after.rules[i]
      const who = r.who ?? { groupIds: [], userIds: [] }
      const left = withWho(r, { ...who, exceptUserIds: [...(who.exceptUserIds ?? []), pid] })
      out.push({ label: `Leave ${personName(pid, env)} out of rule ${i + 1}`, policy: { ...after, rules: after.rules.map((x, k) => (k === i ? left : x)) }, on: 'rules' })
    }
    if (pid) {
      const name = personName(pid, env)
      const keep = rule({ name: `Keep access for ${name}`, who: { groupIds: [], userIds: [pid] }, decision: b.signIn.expected, secondFactor: 'any' })
      out.push({ label: `Add a rule for ${name}`, policy: { ...after, rules: [keep, ...after.rules] }, on: 'rules' })
    }
  }
  return out.find((c) => fixHolds(input, b, c.policy, checks)) ?? null
}

/* --- Words ---------------------------------------------------------------------------- */

/** "Kavya Menon in the office · Must pass"; a note says only its name. */
export const checkName = (c: SignInCheck): string => (c.signIn.level === 'note' ? c.signIn.name : `${c.signIn.name} · ${LEVEL_LABEL[c.signIn.level]}`)

/** A row's summary: "All pass", "1 failing", "2 failing · 1 can't tell", or none there. */
export function checksSummary(checks: readonly SignInCheck[], anySaved: boolean): string {
  if (!anySaved) return 'None saved'
  if (checks.length === 0) return 'None for this policy'
  const fails = checks.filter((c) => c.after.verdict === 'fail').length
  const unknown = checks.filter((c) => c.after.verdict === 'cant-tell').length
  if (fails === 0 && unknown === 0) return 'All pass'
  return [fails > 0 ? `${fails} failing` : null, unknown > 0 ? `${unknown} can't tell` : null].filter(Boolean).join(' · ')
}

export interface CheckValue {
  /** Grey throughout: the reading can't be told. */
  unknown: boolean
  /** "Deny · expected Allow with 2FA", "Allow with 2FA · was Allow on 1 factor", "Can't tell · Allow with 2FA or Deny · needs IP address". */
  text: string
  /** The rule of this policy that decided — a link on the board — or null. */
  rule: { label: string; index: number | null } | null
  /** The deciding policy, when it is another one. */
  other: string | null
  /** " · failing on live too": grey, and never a block. */
  note: string | null
}

/* What one check says after its name (spec D §3.2). A failing sign-in that
   already failed says so in grey — it is not this change's doing. */
export function checkValue(c: SignInCheck, subjectId: string, kind: GuardKind): CheckValue {
  const a = c.after
  if (a.verdict === 'cant-tell') {
    const needs = factWords(a.missing)
    const parts = [CANT_TELL, a.possible.length > 0 ? decisionsOr(a.possible) : null, needs.length > 0 ? `needs ${needs.join(', ')}` : null]
    return { unknown: true, text: parts.filter(Boolean).join(' · '), rule: null, other: null, note: null }
  }
  const word = DECISION_WORDS[a.decision!]
  const text =
    a.verdict === 'fail'
      ? `${word} · expected ${DECISION_WORDS[c.signIn.expected]}`
      : c.before.decision && c.before.decision !== a.decision
        ? `${word} · was ${DECISION_WORDS[c.before.decision]}`
        : word
  const mine = a.decidedBy?.policyId === subjectId
  const rule = mine && a.ruleIndex !== undefined ? { label: a.ruleIndex === null ? 'Last row' : `Rule ${a.ruleIndex + 1}`, index: a.ruleIndex } : null
  const already = a.verdict === 'fail' && c.before.verdict === 'fail'
  return {
    unknown: false,
    text,
    rule,
    other: mine ? null : (a.decidedBy?.policyName ?? null),
    note: already ? (kind === 'turn-on' ? ' · failing today too' : ' · failing on live too') : null,
  }
}

/** The value as one line, for a test or a screen reader. */
export const checkSaid = (v: CheckValue): string => `${[v.text, v.rule?.label ?? v.other].filter(Boolean).join(' · ')}${v.note ?? ''}`

/** "{name} must pass and would get {Decision}." — the banner's line, and the live region's. */
export function blockLine(c: SignInCheck): string {
  const got = c.after.decision ? DECISION_WORDS[c.after.decision] : CANT_TELL
  return c.signIn.level === 'protected' ? `${c.signIn.name} is protected and would get ${got}.` : `${c.signIn.name} must pass and would get ${got}.`
}

/** "Expect Deny instead": only a Must pass, and only once it reads a decision. */
export const overridable = (c: SignInCheck): boolean => c.signIn.level === 'must-pass' && c.after.decision !== null

/** What overriding a Must pass writes onto the saved sign-in (assumption 35). */
export function overridePatch(c: SignInCheck, reason: string, by: string, at: string): Pick<SavedSignIn, 'expected' | 'reason' | 'changedBy' | 'changedAt'> | null {
  if (!overridable(c) || !reason.trim()) return null
  return { expected: c.after.decision!, reason: reason.trim().slice(0, 200), changedBy: by, changedAt: at }
}

/** The saved sign-ins with a patch applied, for re-running the checks before the store has caught up. */
export const patchSignIns = (all: readonly SavedSignIn[], id: string, patch: Partial<SavedSignIn>): SavedSignIn[] =>
  all.map((s) => (s.id === id ? { ...s, ...patch, id } : s))

/** The Who row's value: "Human Resources, Finance · was Global Default Policy". */
export function decidingValue(r: DecidingRow): string {
  const who = r.units.join(', ')
  if (r.kind === 'starts') return `${who} · was ${r.other}`
  if (r.kind === 'stops') return `${who} · now ${r.other}`
  return `${who} · ${r.other}`
}

export const DECIDING_WORDS: Record<DecidingKind, string> = { starts: 'Starts deciding', stops: 'Stops deciding', not: 'Does not decide' }

/** The Who row's summary: the applications where the deciding moved, or No change. */
export function decidingSummary(rows: readonly DecidingRow[]): string {
  const moved = distinct(rows.filter((r) => r.kind !== 'not').map((r) => r.appName))
  return moved.length === 0 ? 'No change' : moved.join(', ')
}

/** "Got through 2 (was 0) · Weaker factor 0 · Locked out 0 (was 1) · Extra prompts 0" — a count that moved says what it was. */
export function breakInSummary(b: NonNullable<GuardResult['breakIn']>): string {
  const cells: { key: CountKey; word: string }[] = [
    { key: 'gotThrough', word: 'Got through' },
    { key: 'weakerFactor', word: 'Weaker factor' },
    { key: 'lockedOut', word: 'Locked out' },
    { key: 'extraPrompts', word: 'Extra prompts' },
  ]
  return cells.map((c) => `${c.word} ${b.now[c.key]}${b.was && b.was[c.key] !== b.now[c.key] ? ` (was ${b.was[c.key]})` : ''}`).join(' · ')
}

/** What Changes' blocks: Now allowed always, the other three only when someone moved. */
export function whatChangesBlocks(line: WhatChangesLine): { key: (typeof WHAT_CHANGES)[number]['key']; word: string; items: { name: string; value: string }[] }[] {
  return WHAT_CHANGES.map((m) => ({ key: m.key, word: m.word, items: line[m.key].map((n) => ({ name: n.label, value: n.origins.join(', ') })) })).filter(
    (b) => b.key === 'nowAllowed' || b.items.length > 0,
  )
}

/* --- The live region ---------------------------------------------------------------- */

/** One sentence per run: blocked, ready, done with who is newly let in, or could not run.
    `blockedReason` is a turn-on the chosen version's own rules stop ("Fix the error in its rules first."): the page says Can't turn on, so the live region does too. */
export function guardSpoken(r: GuardResult | 'error', kind: GuardKind, blockedReason?: string | null): string {
  if (r === 'error') return 'Checks could not run.'
  const first = r.blocking[0]
  const cant = kind === 'turn-on' ? "Can't turn on" : "Can't save"
  if (first) return `${cant}. ${blockLine(first)}`
  if (blockedReason) return `${cant}. ${blockedReason}`
  const names = r.whatChanges.nowAllowed.slice(0, 3).map((n) => n.label.replace(/ \(.*\)$/, ''))
  if (names.length > 0) return `Checks done. Now allowed: ${names.join(', ')}.`
  return kind === 'save' || kind === 'apps' ? 'Ready to save.' : 'Checks done.'
}

/* --- Before turning on's versions ------------------------------------------------------- */

/** Where Before turning on's "With your edits" version started: the board's unsaved edits, a saved draft, or the stored rules a ready fix was made on. */
export type EditsFrom = 'board' | 'draft' | 'stored'

/** The hover title on "With your edits": where the version started, and the ready fixes made on the page since. */
export function editsTip(from: EditsFrom, fixes: number, draft?: { savedAt: string; savedBy: string }): string {
  const made = fixes > 0 ? ` and ${fixes} fix${fixes === 1 ? '' : 'es'}` : ''
  if (from === 'board') return `Unsaved edits on this board${made}`
  if (from === 'draft') return fixes > 0 || !draft ? `Saved draft${made}` : `Saved draft · ${draft.savedAt.charAt(0).toLowerCase()}${draft.savedAt.slice(1)} by ${draft.savedBy}`
  return `Stored version${made}`
}

/* --- Running them ----------------------------------------------------------------------- */

/* Runs `run` once the button's "Checking…" has had a frame to paint: the
   checks are synchronous (about 150 ms on the showcase), so the label is all
   there is to show while they run. A tab that paints no frames — hidden, or
   in the background — still runs them, a tenth of a second later, rather
   than leaving the save saying "Checking…" until somebody looks. */
export function afterPaint(run: () => void): void {
  let done = false
  const go = () => {
    if (done) return
    done = true
    run()
  }
  window.requestAnimationFrame(() => window.setTimeout(go, 0))
  window.setTimeout(go, 100)
}

/* --- Stale review ----------------------------------------------------------------------- */

/* What the checks read, by reference: when any of it is replaced while the page
   is open — the stored policy, another policy, a zone, a device profile, the
   risk scale — the result on screen was read from something that no longer
   exists, and the page asks for the checks to be run again before it lets the
   change through ("Changed since you opened this"). */
export interface GuardStamp {
  policies: readonly Policy[]
  zones: unknown
  fingerprints: unknown
  riskScale: unknown
}

export const isStale = (then: GuardStamp, now: GuardStamp): boolean =>
  then.policies !== now.policies || then.zones !== now.zones || then.fingerprints !== now.fingerprints || then.riskScale !== now.riskScale
