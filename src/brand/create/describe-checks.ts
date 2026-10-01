import { EVERYONE, enforces, type AccessDecision, type Condition, type Policy, type Rule, type RuleWho, type User } from '../data'
import { CANT_TELL, DECISION_WORDS, factWords } from '../decision-words'
import { CHECK_KIND_WORDS, CHECK_KINDS, type CheckKind, type DraftCheck } from '../draft-checks'
import { profileMatches } from '../fingerprint'
import { leaves } from '../predicate'
import { incompleteLine, ruleLine } from '../screens/board/try-sign-in'
import { SWEEP_AT, withPolicy } from '../screens/guard'
import { sweepTenant } from '../screens/impact-arena'
import { RISK_SCORE, TENANT_TZ, clock, type FactKey, type SignInFacts } from '../screens/sign-in-facts'
import { tracePolicy, type SimEnv } from '../screens/simulate'
import { resolveSignIn, tierOf, type TenantResolution } from '../screens/tenant-resolver'
import { DEVICE_PRESETS, presetOf, type DevicePresetId } from '../screens/testing/device-presets'
import { ORIGIN_PRESETS, factsOf, originPatch, type OriginPresetId, type SignInForm } from '../screens/testing/sign-in-form'
import { whatChangesLine, whatChangesSaid, type WhatChangesLine } from '../screens/what-changes'
import { DAY_NAMES } from './describe-words'
import { audienceOfAnswers, branchesOf, lastRowOf, type Answer, type DescribeAnswers, type DescribeTenant, type Span } from './describe-model'

/* -----------------------------------------------------------------------------
   Describe it's checks: a handful of sign-ins, built from the answers, and
   what the whole tenant would decide for each with the draft turned on.

   The foot of the panel (describe spec, §3.7 and §5). Each row is ONE sign-in
   and its decision, the same thing Try a sign-in shows — no lint line, no
   count, no grade:

     Should pass   somebody the first allowing rule is for, meeting its conditions
     Should stop   the same sign-in with its first condition turned the other way
     Edge          the same sign-in on the edge of a risk band, a time window, or a
                   zone asked by both halves (office network, London)
     You           the admin at the console, when the draft reaches everyone
     Not named     somebody the Who does not name: another policy's, or the first
                   group left out

   Expected comes from the text, Result from the tenant. Expected is what the
   draft's OWN rules give the sign-in — the rules ARE the text, written out —
   and Result is what the tenant decides once the draft is on, in its real
   place in the list (its stored twin is first: `addPolicy` prepends). The two
   differ only when another policy, the tiering or the rule order steps in,
   which is the point of the row. A Result that depends on a fact the sign-in
   does not state is Can't tell, and never a match.

   Everything is built from the tenant's own objects: an origin the Try a
   sign-in chips use, a device from its presets that the profile itself grades,
   today at 09:30 in the tenant's zone. A row that cannot be built — no preset
   passes the profile, nobody fits the Who — is left out, not shown empty.

   Pure, and React-free. The board computes the rows after every answer and
   keeps them on the draft (`keptChecks`), so "Save policy" stores them and the
   checks before turning it on read them again (draft-checks.ts).
   -------------------------------------------------------------------------- */

export type CheckVerdict = 'match' | 'differs' | 'cant-tell'

export interface CheckRun {
  check: DraftCheck
  result: TenantResolution
  verdict: CheckVerdict
}

/** Everything the checks read besides the answers. */
export interface CheckContext {
  /** The draft as the answers wrote it, with the applications and audience Done will save (`describedPolicy`). */
  draft: Policy
  /** The words each card came from, by rule id. */
  sources: Record<string, string>
  tenant: DescribeTenant
  env: SimEnv
  /** The admin at the console: the You row's person. */
  adminId: string
  /** YYYY-MM-DD, where the tenant is: Try a sign-in's default day. */
  today: string
}

// --- The policy the checks run ---------------------------------------------------

/* The draft as it will stand once the panel closes: the applications the
   answers chose (saved straight to the policy as they change, so the board's
   copy can be a render behind) and the audience Done saves. The checks, and
   the tenant they run through, see the policy the admin is about to have. */
export function describedPolicy(draft: Policy, a: DescribeAnswers): Policy {
  const apps = a.apps.value ?? []
  return { ...draft, appIds: apps.length > 0 ? [...apps] : draft.appIds, audience: audienceOfAnswers(a) }
}

// --- People ----------------------------------------------------------------------

const EMPTY: RuleWho = { groupIds: [], userIds: [] }
const namesAnyone = (w: RuleWho | undefined): w is RuleWho => !!w && w.groupIds.length + w.userIds.length > 0

/* A rule's who, for one person: nobody named is everyone, less the exceptions. */
function inWho(u: User, w: RuleWho | undefined): boolean {
  if (!w) return true
  if (w.exceptGroupIds?.includes(u.groupId) || w.exceptUserIds?.includes(u.id)) return false
  if (!namesAnyone(w)) return true
  return w.groupIds.includes(u.groupId) || w.userIds.includes(u.id)
}

const governs = (p: Policy, u: User) => p.audience.everyone || p.audience.groupIds.includes(u.groupId) || p.audience.userIds.includes(u.id)

/* The enforcing application policies on this app, other than the draft, in list order. */
const othersOn = (t: DescribeTenant, draftId: string, appId: string) =>
  t.policies.filter((p) => p.id !== draftId && !p.isSystem && p.type === 'App Access' && enforces(p) && p.appIds.includes(appId))

/* Who a rule is tried for (describe spec, §5.2): the first person of each
   group it names, in the Who's order, then the people it names. A rule for
   everyone is tried for the first person no custom-group policy on the app
   takes first — somebody this draft will really decide for. */
function personFor(r: Rule, t: DescribeTenant, draftId: string, appId: string): User | null {
  const w = r.who
  if (namesAnyone(w)) {
    for (const g of w.groupIds) {
      const u = t.users.find((x) => x.groupId === g && inWho(x, w))
      if (u) return u
    }
    return t.users.find((x) => w.userIds.includes(x.id) && inWho(x, w)) ?? null
  }
  const custom = othersOn(t, draftId, appId).filter((p) => tierOf(p) === 'custom')
  return t.users.find((u) => inWho(u, w) && !custom.some((p) => governs(p, u))) ?? null
}

/* Not named: somebody another policy on the app governs whom the Who leaves
   out; else the first person of the first group it leaves out. */
function notNamed(who: RuleWho, t: DescribeTenant, draftId: string, appId: string): User | null {
  const named = (u: User) => who.groupIds.includes(u.groupId) || who.userIds.includes(u.id)
  for (const p of othersOn(t, draftId, appId)) {
    const u = t.users.find((x) => governs(p, x) && !named(x))
    if (u) return u
  }
  for (const g of t.groups) {
    if (who.groupIds.includes(g.id)) continue
    const u = t.users.find((x) => x.groupId === g.id && !named(x))
    if (u) return u
  }
  return null
}

// --- One sign-in, as a form ------------------------------------------------------

const LONDON = 'gb-england-london'

/* Try a sign-in's own starting point: the office at 09:30 today, on the
   registered laptop, at the tenant's low risk. What a check does not need to
   state differently, it states as Try would. */
function baseForm(personId: string, appId: string, ctx: CheckContext): SignInForm {
  return {
    personId,
    appId,
    ...originPatch('office'),
    place: { kind: 'from-address' },
    date: ctx.today,
    time: '09:30',
    timeZone: TENANT_TZ,
    device: { kind: 'preset', id: 'win11-registered' },
    risk: String(lowRisk(ctx.env)),
    assumeOn: null,
  }
}

const lowRisk = (env: SimEnv) => (env.riskScale ?? RISK_SCORE).Low ?? RISK_SCORE.Low
const minutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}
const at = (mins: number) => clock(((mins % 1440) + 1440) % 1440)

const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekdayOf = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? WEEK[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()] : ''
}
/* The first date on or after `from` that falls on `weekday`. */
function onOrAfter(from: string, weekday: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from)
  if (!m) return from
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  for (let i = 0; i < 7; i++) {
    const next = new Date(d.getTime() + i * 86400000)
    if (WEEK[next.getUTCDay()] === weekday) return next.toISOString().slice(0, 10)
  }
  return from
}

type DeviceWant = { profileId: string; want: 'pass' | 'fail' }
const deviceWants = (conds: readonly Condition[]): DeviceWant[] =>
  conds
    .filter((c) => c.typeId === 'fingerprint' && (c.operator === 'matches' || c.operator === 'does not match') && c.values[0])
    .map((c) => ({ profileId: c.values[0], want: c.operator === 'matches' ? 'pass' : 'fail' }))

/* The first preset the profiles themselves grade as wanted. A profile no
   preset can be graded against leaves the device not stated, so the row reads
   Can't tell; one every preset is graded against and none fits cannot be built. */
function deviceFor(wants: readonly DeviceWant[], t: DescribeTenant): SignInForm['device'] | null {
  if (wants.length === 0) return { kind: 'preset', id: 'win11-registered' }
  const graded = (id: string) => t.fingerprints.find((p) => p.id === id)
  const fit = DEVICE_PRESETS.find((d) =>
    wants.every((w) => {
      const p = graded(w.profileId)
      return !!p && profileMatches(p, d.facts).status === w.want
    }),
  )
  if (fit) return { kind: 'preset', id: fit.id }
  const ungraded = wants.some((w) => {
    const p = graded(w.profileId)
    return !p || DEVICE_PRESETS.every((d) => profileMatches(p, d.facts).status === 'unknown')
  })
  return ungraded ? { kind: 'none' } : null
}

/* The risk interval the rule's risk conditions leave open. */
function riskRange(conds: readonly Condition[]): [number, number] {
  let lo = 0
  let hi = 100
  for (const c of conds) {
    if (c.typeId !== 'device-risk') continue
    const n = Number(c.values[0])
    if (!Number.isFinite(n)) continue
    if (c.operator === 'above') lo = Math.max(lo, n + 1)
    if (c.operator === 'below') hi = Math.min(hi, n - 1)
  }
  return [lo, hi]
}

const probe = (r: Rule): Policy => ({
  id: 'describe-probe',
  name: '',
  type: 'App Access',
  appIds: [],
  audience: EVERYONE,
  status: 'active',
  lastModified: '',
  modifiedBy: '',
  rules: [{ ...r, enabled: true }],
})

/* Whether the sign-in can meet the rule: it does, or it depends on a fact it
   does not state. Only a definite "no" rules a form out. */
const canMeet = (r: Rule, facts: SignInFacts, env: SimEnv) => tracePolicy(probe(r), facts, env).steps[0]?.match !== 'no'

/* Where a zone condition wants the sign-in from, preferred first. */
function originsFor(conds: readonly Condition[]): { origin: OriginPresetId; place?: string }[] {
  const zones = conds.filter((c) => c.typeId === 'zone')
  const out = zones.some((c) => c.operator === 'not in zone')
  const inside = zones.some((c) => c.operator === 'in zone')
  if (out && !inside) return [{ origin: 'home' }, { origin: 'home', place: LONDON }, { origin: 'tor' }, { origin: 'office' }]
  return [{ origin: 'office' }, { origin: 'branch' }, { origin: 'home' }, { origin: 'home', place: LONDON }]
}

/* A sign-in for this person that meets the rule's conditions, or null. */
function formMeeting(r: Rule, person: User, appId: string, ctx: CheckContext): SignInForm | null {
  const conds = leaves(r.when)
  const base = baseForm(person.id, appId, ctx)

  const device = deviceFor(deviceWants(conds), ctx.tenant)
  if (!device) return null

  const [lo, hi] = riskRange(conds)
  if (lo > hi) return null
  const low = lowRisk(ctx.env)
  const risk = String(low >= lo && low <= hi ? low : lo)

  let time = base.time
  let timeZone = base.timeZone
  let date = base.date
  const window = conds.find((c) => c.typeId === 'time' && c.operator === 'between' && c.values.length === 2)
  if (window) {
    const from = minutes(window.values[0])
    const to = minutes(window.values[1])
    const span = (to - from + 1440) % 1440
    time = at(from + (span > 30 ? 30 : 0))
    timeZone = window.tz ?? TENANT_TZ
  }
  const days = conds.find((c) => c.typeId === 'day' && c.operator === 'is' && c.values.length > 0)
  if (days) date = onOrAfter(date, days.values[0])

  for (const o of originsFor(conds)) {
    const form: SignInForm = {
      ...base,
      ...originPatch(o.origin),
      place: o.place ? { kind: 'stated', placeId: o.place } : { kind: 'from-address' },
      device,
      risk,
      date,
      time,
      timeZone,
    }
    if (canMeet(r, factsOf(form, ctx.tenant.zones).facts, ctx.env)) return form
  }
  return null
}

// --- The draft's own answer --------------------------------------------------------

/* What the draft's own rules give a sign-in, and where: "per the answers".
   The definite reading, as the board's chain reads it; null when the draft
   does not govern the person. */
function ownOutcome(draft: Policy, facts: SignInFacts, env: SimEnv): { decision: AccessDecision; hit: number | null } | null {
  const t = tracePolicy(draft, facts, env)
  return t.decision ? { decision: t.decision, hit: t.hitIndex } : null
}

// --- The rows ------------------------------------------------------------------------

const spansSaid = (xs: readonly Span[]) => xs.map((s) => s.phrase).join(' · ')
const said = <T,>(x: Answer<T>) => (x.origin === 'text' ? spansSaid(x.spans) : '')

/* The first condition of the rule, turned the other way — zone, device, risk,
   time, day, the order every card here is written in — as the forms it could
   become, each tried until one lands somewhere else. */
function flips(r: Rule, pass: SignInForm, a: DescribeAnswers, ctx: CheckContext): { form: SignInForm; phrase: string }[] {
  const out: { form: SignInForm; phrase: string }[] = []
  for (const c of leaves(r.when)) {
    if (c.typeId === 'zone') {
      const origin: OriginPresetId = c.operator === 'in zone' ? 'home' : 'office'
      out.push({ form: { ...pass, ...originPatch(origin), place: { kind: 'from-address' } }, phrase: said(a.where) })
    } else if (c.typeId === 'fingerprint' && c.values[0]) {
      const device = deviceFor([{ profileId: c.values[0], want: c.operator === 'matches' ? 'fail' : 'pass' }], ctx.tenant)
      if (device && device.kind === 'preset') out.push({ form: { ...pass, device }, phrase: said(a.devices) })
    } else if (c.typeId === 'device-risk') {
      /* The High band's first value; else just past the rule's own range. */
      const bands = a.risk.value?.mode === 'bands' ? a.risk.value : null
      const [lo, hi] = riskRange(leaves(r.when))
      const high = bands ? bands.highAbove + 1 : hi < 100 ? hi + 1 : lo - 1
      if (high >= 0 && high <= 100) out.push({ form: { ...pass, risk: String(high) }, phrase: said(a.risk) })
    } else if (c.typeId === 'time' && c.operator === 'between' && c.values.length === 2) {
      out.push({ form: { ...pass, time: at(minutes(c.values[1]) + 1) }, phrase: said(a.when) })
    } else if (c.typeId === 'day' && c.operator === 'is') {
      const other = DAY_NAMES.find((d) => !c.values.includes(d))
      if (other) out.push({ form: { ...pass, date: onOrAfter(ctx.today, other) }, phrase: said(a.when) })
    }
  }
  return out
}

/* The one change the Edge row makes, first that applies: the first value of
   the next risk band, a minute past a time window, or a zone asked by both
   halves met on its network alone (the office network, placed in London). */
function edgeOf(r: Rule, rules: readonly Rule[], pass: SignInForm, a: DescribeAnswers): { form: SignInForm; phrase: string } | null {
  const cuts = rules.flatMap((x) =>
    leaves(x.when)
      .filter((c) => c.typeId === 'device-risk' && Number.isFinite(Number(c.values[0])))
      .map((c) => (c.operator === 'above' ? Number(c.values[0]) + 1 : Number(c.values[0]))),
  )
  if (cuts.length > 0) {
    const r0 = Number(pass.risk)
    const above = cuts.filter((b) => b > r0)
    const next = above.length > 0 ? Math.min(...above) : Math.max(...cuts) - 1
    return { form: { ...pass, risk: String(next) }, phrase: said(a.risk) }
  }
  const conds = leaves(r.when)
  const window = conds.find((c) => c.typeId === 'time' && c.operator === 'between' && c.values.length === 2)
  if (window) return { form: { ...pass, time: at(minutes(window.values[1]) + 1) }, phrase: said(a.when) }
  const zone = conds.find((c) => c.typeId === 'zone' && c.operator === 'in zone' && c.values.every((z) => (c.scopes?.[z] ?? 'both') === 'both'))
  if (zone) return { form: { ...pass, ...originPatch('office'), place: { kind: 'stated', placeId: LONDON } }, phrase: said(a.where) }
  return null
}

const someoneForEveryone = (rules: readonly Rule[], p: Policy) => p.audience.everyone || rules.some((r) => !namesAnyone(r.who))

/** The sign-ins the answers are checked with, in row order (describe spec, §5.2). */
export function checksFor(a: DescribeAnswers, ctx: CheckContext): DraftCheck[] {
  const { draft, tenant: t, env } = ctx
  const appId = t.apps.find((x) => (a.apps.value ?? []).includes(x.id))?.id
  if (!appId) return []
  const rules = draft.rules.filter((r) => r.enabled)
  const facts = (f: SignInForm) => factsOf(f, t.zones).facts
  const out: DraftCheck[] = []

  /* Should pass: the first rule that lets anyone in, once the text has said
     what happens. With no rule at all and one outcome for everyone, which the
     last row holds (`merged` in compose), the last row. No rule for any other
     reason — a choice still open writes none (§3.6, §4.7) — leaves the last
     row as it was before the panel opened, which is nothing the text said, so
     there is no Should pass until the choice is picked. */
  const outcome = branchesOf(a).some((b) => a.signIn[b]?.value) || a.more.some((m) => m.outcome.value)
  const target = outcome ? (rules.find((r) => r.decision !== 'deny') ?? null) : null
  let pass: SignInForm | null = null
  if (target) {
    const person = personFor(target, t, draft.id, appId)
    pass = person ? formMeeting(target, person, appId, ctx) : null
    if (pass) out.push({ id: 'pass', kind: 'pass', facts: facts(pass), expected: target.decision, phrase: ctx.sources[target.id] || undefined })
  } else if (outcome && rules.length === 0 && draft.fallback && draft.fallback.decision !== 'deny' && lastRowOf(a, t) === 'merged') {
    const person = personFor(draft.fallback, t, draft.id, appId)
    pass = person ? baseForm(person.id, appId, ctx) : null
    if (pass) out.push({ id: 'pass', kind: 'pass', facts: facts(pass), expected: draft.fallback.decision, phrase: spansSaid(a.signIn.match?.spans ?? []) || undefined })
  }

  /* Should stop: when the text says what happens to the rest, or refuses
     somebody. The Should pass sign-in with its first condition turned over,
     until it lands on a refusal or the last row; with none that does, a
     sign-in the refusing rule meets. The draft's own rules say what it gets. */
  const denies = rules.find((r) => r.decision === 'deny') ?? null
  if (a.fallback.value !== null || denies) {
    const stops = (hit: number | null) => hit === null || draft.rules[hit]?.decision === 'deny'
    /* `refusal`: the sign-in was built to meet the refusing rule, so what the
       text meant for it is that rule's Deny — whatever the draft gives it. A
       refusal another rule shadows then says Expected Deny, not a pass. */
    let stop: { form: SignInForm; phrase: string; refusal?: AccessDecision } | null = null
    if (pass && target) {
      for (const f of flips(target, pass, a, ctx)) {
        const own = ownOutcome(draft, facts(f.form), env)
        if (own && stops(own.hit)) {
          stop = f
          break
        }
      }
    }
    if (!stop && denies) {
      const person = personFor(denies, t, draft.id, appId)
      const form = person ? formMeeting(denies, person, appId, ctx) : null
      if (form) stop = { form, phrase: ctx.sources[denies.id] ?? '', refusal: denies.decision }
    }
    const own = stop ? ownOutcome(draft, facts(stop.form), env) : null
    if (stop && own) {
      /* The words it came from: the condition turned over, else what the text
         said for the rest, else the refusing rule's own. */
      const phrase = stop.phrase || (own.hit === null ? said(a.fallback) || a.only?.phrase || '' : (ctx.sources[draft.rules[own.hit]?.id ?? ''] ?? ''))
      out.push({ id: 'stop', kind: 'stop', facts: facts(stop.form), expected: stop.refusal ?? own.decision, phrase: phrase || undefined })
    }
  }

  /* Edge: one change on the Should pass sign-in, and what the answers give it. */
  if (pass && target) {
    const edge = edgeOf(target, rules, pass, a)
    const own = edge ? ownOutcome(draft, facts(edge.form), env) : null
    if (edge && own) out.push({ id: 'edge', kind: 'edge', facts: facts(edge.form), expected: own.decision, phrase: edge.phrase || undefined })
  }

  /* You: the admin, when the draft reaches everyone. What the tenant gives
     them is the expectation — the row says whether the admin keeps getting in. */
  const admin = t.users.find((u) => u.id === ctx.adminId)
  if (admin && someoneForEveryone(rules, draft)) {
    const f = { ...(pass ?? baseForm(admin.id, appId, ctx)), personId: admin.id }
    const r = resolveOn(draft, facts(f), t.policies, env)
    const expected = r.decision ?? strictestPossible(r)
    if (expected) out.push({ id: 'you', kind: 'you', facts: facts(f), expected })
  }

  /* Not named: somebody the Who leaves out, and what they get today. */
  const who = a.who.value && a.who.value !== 'everyone' && a.who.origin !== 'unset' ? a.who.value : null
  if (namesAnyone(who ?? EMPTY)) {
    const u = notNamed(who as RuleWho, t, draft.id, appId)
    if (u) {
      const f = { ...(pass ?? baseForm(u.id, appId, ctx)), personId: u.id }
      const today = resolveSignIn(t.policies, facts(f), env)
      if (today.status === 'decided' && today.decision) out.push({ id: 'not-named', kind: 'not-named', facts: facts(f), expected: today.decision })
    }
  }

  return CHECK_KINDS.flatMap((k) => out.filter((c) => c.kind === k))
}

const strictestPossible = (r: TenantResolution): AccessDecision | null =>
  r.possible.some((o) => o.decision === 'deny') ? 'deny' : r.possible.some((o) => o.decision === '2fa') ? '2fa' : (r.possible[0]?.decision ?? null)

// --- Running them ---------------------------------------------------------------------

/* The draft as though on, in its real list position. With no application of
   its own yet, as though it covered the one being tried. */
function resolveOn(draft: Policy, facts: SignInFacts, policies: readonly Policy[], env: SimEnv): TenantResolution {
  const appIds = draft.appIds.length > 0 ? draft.appIds : facts.appId ? [facts.appId] : []
  return resolveSignIn(policies, facts, env, { substitute: { ...draft, status: 'active', appIds } })
}

/** Each check through the whole tenant with the draft on (describe spec, §5.3). */
export function runChecks(checks: readonly DraftCheck[], draft: Policy, policies: readonly Policy[], env: SimEnv): CheckRun[] {
  return checks.map((check) => {
    const result = resolveOn(draft, check.facts, policies, env)
    const verdict: CheckVerdict = result.status !== 'decided' || !result.decision ? 'cant-tell' : result.decision === check.expected ? 'match' : 'differs'
    return { check, result, verdict }
  })
}

/* What the policy keeps: every row, and the You row only while it lets the
   admin in — a promise worth checking again before the policy is turned on. */
export function keptChecks(runs: readonly CheckRun[]): DraftCheck[] {
  return runs
    .filter((r) => r.check.kind !== 'you' || (r.verdict === 'match' && r.result.decision !== null && r.result.decision !== 'deny'))
    .map((r) => r.check)
}

/* What changes, as the checks before turning on will say it: every modelled
   sign-in on the draft's applications, before and with it on. The guard's own
   inputs (guard.ts), so the two lines can never disagree. */
export function whatChangesFor(draft: Policy, policies: readonly Policy[], env: SimEnv): WhatChangesLine {
  const after = withPolicy(policies, { ...draft, status: 'active' })
  return whatChangesLine(
    draft.appIds.map((a) => sweepTenant(policies, a, env, SWEEP_AT)),
    draft.appIds.map((a) => sweepTenant(after, a, env, SWEEP_AT)),
    env,
  )
}

// --- Words ------------------------------------------------------------------------------

export interface CheckRowView {
  id: string
  kind: CheckKind
  /** The sign-in, for Try a sign-in when the row is pressed. */
  facts: SignInFacts
  /** "Should pass". */
  word: string
  /** "Kavya Menon · HRMS · Office network · Windows 11 laptop · registered". */
  line: string
  /* The whole sign-in, where `line` says only part of it (`RowTrim`): the
     line's tooltip. */
  full?: string
  /** "Expected Deny · HRMS access from corporate offices · In a corporate office". */
  detail: string
  decision: AccessDecision | null
  /** The facts that would settle a Can't tell, in their field words. */
  needs: string[]
  /** "From your text: “only from a corporate office”". */
  title?: string
  /** The row's accessible name: "Should pass, Kavya Menon · HRMS · …, Allow with 2FA". */
  label: string
}

const readsOf = (rules: readonly Rule[]) => {
  const all = rules.flatMap((r) => leaves(r.when))
  return { risk: all.some((c) => c.typeId === 'device-risk'), time: all.some((c) => c.typeId === 'time' || c.typeId === 'day') }
}

type PartKey = 'person' | 'app' | 'origin' | 'place' | 'device' | 'risk' | 'when'

/* The sign-in's parts: who, where to, from where, on what — and the risk
   and the day only where the draft reads them. */
function partsOf(f: SignInFacts, t: DescribeTenant, reads: { risk: boolean; time: boolean }): [PartKey, string][] {
  const person = t.users.find((u) => u.id === f.personId)?.name ?? f.personId ?? 'Person not stated'
  const app = t.apps.find((a) => a.id === f.appId)?.name ?? f.appId ?? 'Application not stated'
  const address = f.network?.address
  const origin = address ? (ORIGIN_PRESETS.find((o) => o.address === address)?.label ?? address) : 'IP address not stated'
  const place = f.location && f.location.source === 'stated' ? (f.location.city ?? f.location.state ?? f.location.country ?? null) : null
  const preset: DevicePresetId | null = f.device ? presetOf(f.device) : null
  const device = !f.device ? 'Device not stated' : preset ? (DEVICE_PRESETS.find((d) => d.id === preset)?.label ?? 'Custom device') : 'Custom device'
  const risk = reads.risk && f.risk ? `Risk ${f.risk.score}` : null
  const when = reads.time && f.when ? `${f.when.date ? weekdayOf(f.when.date) : ''} ${f.when.time}`.trim() : null
  const all: [PartKey, string | null][] = [
    ['person', person],
    ['app', app],
    ['origin', origin],
    ['place', place],
    ['device', device],
    ['risk', risk],
    ['when', when],
  ]
  return all.filter((x): x is [PartKey, string] => !!x[1])
}

/* The sign-in in one line — less what the list says once (`RowTrim`). */
function lineOf(f: SignInFacts, t: DescribeTenant, reads: { risk: boolean; time: boolean }, trim: RowTrim = {}): string {
  const base = trim.against ? new Map(partsOf(trim.against, t, reads)) : null
  const parts = partsOf(f, t, reads).filter(([k]) => !(trim.person && k === 'person') && !(trim.app && k === 'app'))
  const differs = base ? parts.filter(([k, v]) => base.get(k) !== v) : parts
  return (differs.length > 0 ? differs : parts).map(([, v]) => v).join(' · ')
}

/* What a list of rows says once, above them, rather than on every row: the
   person and the application every row shares, and the draft's own name.
   `against`: the Should pass sign-in, which every other row is made from by
   one change — so such a row names only what it changed (Home broadband,
   London, another person), the fact a narrow row must not cut off. */
export interface RowTrim {
  person?: boolean
  app?: boolean
  ownName?: boolean
  against?: SignInFacts
}

const distinct = <T,>(xs: readonly T[]): T[] => [...new Set(xs)]

function needsOf(r: TenantResolution): string[] {
  if (r.status === 'incomplete') return factWords((r.missing as string[]).filter((k): k is FactKey => k !== 'a global default policy'))
  if (r.status === 'depends') return factWords(distinct((r.trace?.unknowns ?? []).flatMap((u) => u.missing)))
  return []
}

/** One row as the panel prints it (describe spec, §3.7). `draft` is the policy the checks ran. */
export function checkRowView(run: CheckRun, draft: Policy, t: DescribeTenant, policies: readonly Policy[], trim: RowTrim = {}): CheckRowView {
  const { check, result } = run
  const reads = readsOf(draft.rules)
  const line = lineOf(check.facts, t, reads, trim)
  const decided = result.status === 'decided' && result.decision !== null
  const own = trim.ownName && result.decidedBy?.policyId === draft.id
  const where =
    result.status === 'incomplete' || !result.decidedBy
      ? incompleteLine(result)
      : [own ? '' : result.decidedBy.policyName, decided ? ruleLine(result, draft.id, policies, draft) : ''].filter(Boolean).join(' · ')
  const expected = check.kind !== 'you' && run.verdict !== 'match' ? `Expected ${DECISION_WORDS[check.expected]}` : ''
  const needs = decided ? [] : needsOf(result)
  const word = CHECK_KIND_WORDS[check.kind]
  const answer = decided ? DECISION_WORDS[result.decision!] : [CANT_TELL, needs.length > 0 ? `needs ${needs.join(', ')}` : ''].filter(Boolean).join(', ')
  const whole = lineOf(check.facts, t, reads)
  return {
    id: check.id,
    kind: check.kind,
    facts: check.facts,
    word,
    line,
    ...(line !== whole ? { full: whole } : null),
    detail: [expected, where].filter(Boolean).join(' · '),
    decision: decided ? result.decision : null,
    needs,
    title: check.phrase ? `From your text: “${check.phrase}”` : undefined,
    /* The whole sign-in, whatever the line leaves to the list's heading. */
    label: `${word}, ${whole}, ${answer}`,
  }
}

// --- For the board --------------------------------------------------------------------

/** What the panel's foot shows: the rows, and the What changes line. */
export interface ChecksView {
  rows: CheckRowView[]
  /* What every row shares and so no row repeats — "Kavya Menon on HRMS",
     "On HRMS" — said once, in the tip on the heading. Absent when every
     row differs in both. */
  shared?: string
  /** "Of 360 modelled sign-ins: Now allowed 0 · …" — the one number on the panel. */
  whatChanges: string
}

/* The foot, for the answers as the board holds them, or null while no
   application is chosen ("Choose an application"). `ctx.draft` is the board's
   draft; the checks run it as the panel will leave it (`describedPolicy`). */
export function checksView(a: DescribeAnswers, ctx: CheckContext): ChecksView | null {
  const draft = describedPolicy(ctx.draft, a)
  if (!ctx.tenant.apps.some((x) => (a.apps.value ?? []).includes(x.id))) return null
  const policies = ctx.tenant.policies
  const runs = runChecks(checksFor(a, { ...ctx, draft }), draft, policies, ctx.env)
  /* Every row the same person, or the same application: said once, so each
     row has room for the fact it differs by (Home broadband, London). */
  const one = <T,>(xs: T[]) => (xs.length > 1 && xs.every((x) => x === xs[0]) ? xs[0] : null)
  const person = one(runs.map((r) => r.check.facts.personId ?? null))
  const app = one(runs.map((r) => r.check.facts.appId ?? null))
  const trim: RowTrim = { person: !!person, app: !!app, ownName: true }
  const pass = runs.find((r) => r.check.kind === 'pass')?.check.facts
  const who = person ? ctx.tenant.users.find((u) => u.id === person)?.name : undefined
  const where = app ? ctx.tenant.apps.find((x) => x.id === app)?.name : undefined
  const shared = who && where ? `${who} on ${where}` : where ? `On ${where}` : who ? `As ${who}` : ''
  return {
    rows: runs.map((r) => checkRowView(r, draft, ctx.tenant, policies, r.check.kind === 'pass' || !pass ? trim : { ...trim, against: pass })),
    ...(shared ? { shared } : null),
    whatChanges: whatChangesSaid(whatChangesFor(draft, policies, ctx.env)),
  }
}

/* A write's draft, with the checks it keeps (describe spec, §5.3): every row
   but a You row that does not let the admin in. None is no `checks` at all,
   so a policy nobody described and one described with no application read
   the same. */
export function withChecks(policy: Policy, a: DescribeAnswers, ctx: Omit<CheckContext, 'draft'>): Policy {
  const draft = describedPolicy(policy, a)
  const kept = keptChecks(runChecks(checksFor(a, { ...ctx, draft }), draft, ctx.tenant.policies, ctx.env))
  return { ...policy, checks: kept.length > 0 ? kept : undefined }
}
