/* -----------------------------------------------------------------------------
   Old sign-in policies → new policies. Pure: Move policies draws what this returns,
   and the store saves it unchanged.

   The mapping (owner's plan, 3 Nov 2026):

   - One new policy per application (one app, one policy, 14 Oct). Applications whose
     old rows are identical can share one, when the admin takes the merge offer.
   - Each group row becomes a rule whose Who is that group. The DEFAULT row becomes the
     last row, Nothing else matched. With no DEFAULT row, the last row denies, because
     the old console gives no access to someone outside the assigned groups.
   - An adaptive block becomes a rule just above its group's rule, catching the
     sign-ins that fail the restrictions: Deny, or ask for MFA.
       IP and Location → a zone (an existing zone with the same entries is reused)
       Time            → Sign-in hours and Sign-in days
       Device          → a Trusted device profile holding the same limit (owner, 4 Nov 2026: a device profile made by
                         the move, to show in Review); its rule asks for it
     AND ("all must pass") fails when any one fails: one card per restriction.
     OR ("one must pass") fails when all fail: one card holding all of them.
   - The old console picks between two groups' rows by weight. The new rules run in
     order, strictest first, so people in two groups get the stricter rows. The plan
     names those people.
   -------------------------------------------------------------------------- */
import {
  EVERYONE,
  FALLBACK_NAME,
  card,
  cond,
  emptyLocation,
  memberGroupIds,
  newId,
  rule,
  when,
  type App,
  type Condition,
  type Group,
  type Policy,
  type Rule,
  type User,
  type Zone,
} from '../data'
import { POLICY_NAME_MAX, freeName } from '../policy-name'
import { blankProfile, type FingerprintProfile } from '../fingerprint'
import { DEFAULT_GROUP, DEFAULT_METHOD, type LegacyAdaptive, type LegacyCheck, type LegacyEstate, type LegacyPolicy } from './legacy'

export interface MoveContext {
  apps: readonly App[]
  groups: readonly Group[]
  users: readonly User[]
  zones: readonly Zone[]
  policies: readonly Policy[]
  /** Moved policies waiting for review (store `staged`): an application with one has its policy on the way. */
  staged?: readonly Policy[]
  /** The tenant's method names. Absent: every old method name is taken as it is. */
  methods?: readonly string[]
  /** The tenant's device profiles, so a made one never takes a taken name. */
  fingerprints?: readonly FingerprintProfile[]
}

/* The old console's method names where the new catalogue says it differently (methods.ts). */
const METHOD_ALIAS: Record<string, string> = {
  'RSA MFA': 'RSA MFA (SecurID)',
  'FIDO2 (Biometric)': 'FIDO2 / Passkey',
}

/** The new catalogue's name for an old method, or null when the tenant has nothing by either name. */
export function newMethodName(old: string, methods?: readonly string[]): string | null {
  if (!methods) return old
  if (methods.includes(old)) return old
  const alias = METHOD_ALIAS[old]
  return alias && methods.includes(alias) ? alias : null
}

/** Which old row, and which part of it, a new rule came from: Play in Review walks this. */
export interface RuleSource {
  source: string
  part: 'pass' | 'fail' | 'last'
}

/** One line of What changes: an old thing and what it becomes. */
export interface MoveLine {
  id: string
  name: string
  before: string
  after: string
}

export interface PlannedPolicy {
  /** The applications' ids joined: stable across renders, so the review can key on it. */
  key: string
  appIds: string[]
  sourceIds: string[]
  /** Ready to save: status Draft (nothing decides until the admin turns it on), rules, last row. The store gives it its id. */
  policy: Policy
  moves: MoveLine[]
  changes: MoveLine[]
  leftOut: MoveLine[]
  /** Rule id ('fallback' for the last row) → the old row it came from. */
  ruleSource: Record<string, RuleSource>
  /* One application, one policy (14 Oct 2026). An application that already has a policy in the new builder — made
     there, or moved earlier — gets no second one: its old rows JOIN that policy as rules after its own, and `policy`
     holds only those rules (its last row is the existing policy's). */
  into?: { id: string; name: string }
}

export interface MovePlan {
  policies: PlannedPolicy[]
  /** Zones the plan creates. Reused zones are not here. */
  zones: Zone[]
  /** Device profiles the plan creates: an old device limit becomes a Trusted device profile with that limit. */
  profiles: FingerprintProfile[]
}

export interface MergeOffer {
  key: string
  appIds: string[]
}

const DENY_OUTSIDE = 'You do not have access to this application. Contact your administrator.'

/** Why a row cannot move, or null. */
export function blockedReason(lp: LegacyPolicy, ctx: MoveContext): string | null {
  const app = ctx.apps.find((a) => a.id === lp.appId)
  if (!app) return 'Its application no longer exists'
  if (lp.groupId !== DEFAULT_GROUP && !ctx.groups.some((g) => g.id === lp.groupId)) return 'Its group no longer exists'
  /* One application, one policy: its policy is already made and waiting in Review; approve that first, then this joins it. */
  if (ctx.staged?.some((p) => p.appIds.includes(lp.appId))) return 'Its policy is waiting for review'
  return null
}

/** The sign-in policy an application already has in the new builder, if any: its old rows join it. */
export function existingPolicyFor(appId: string, ctx: Pick<MoveContext, 'policies'>): Policy | undefined {
  return ctx.policies.find((p) => p.type !== 'Session' && !p.isSystem && p.appIds.includes(appId))
}

export const groupName = (id: string, ctx: Pick<MoveContext, 'groups'>) =>
  id === DEFAULT_GROUP ? DEFAULT_GROUP : (ctx.groups.find((g) => g.id === id)?.name ?? id)

/** A row in the old console's own terms, for the Before column. */
export function legacySummary(lp: LegacyPolicy, estate: LegacyEstate): string {
  const parts: string[] = [lp.firstFactor]
  if (lp.mfa) parts.push(lp.mfa.method === DEFAULT_METHOD ? 'Default MFA method' : lp.mfa.method)
  const ad = lp.adaptive && estate.adaptive.find((a) => a.id === lp.adaptive?.policyId)
  if (ad) parts.push(`adaptive: ${ad.name}`)
  return parts.join(' · ')
}

/* Two rows say the same thing when everything but their names, ids and applications matches. */
const rowShape = (lp: LegacyPolicy) => JSON.stringify({ g: lp.groupId, f: lp.firstFactor, m: lp.mfa ?? null, a: lp.adaptive ?? null, x: !!lp.forceMfa })
const appShape = (rows: LegacyPolicy[]) => rows.map(rowShape).sort().join('|')

function byApp(rows: readonly LegacyPolicy[]): Map<string, LegacyPolicy[]> {
  const out = new Map<string, LegacyPolicy[]>()
  for (const r of rows) out.set(r.appId, [...(out.get(r.appId) ?? []), r])
  return out
}

/** Applications among the selected rows whose old settings are identical, and that have no policy yet: an application
    that already has one is joining it, so it is not free to share a new one. */
export function mergeOffers(selected: readonly LegacyPolicy[], ctx?: Pick<MoveContext, 'policies'>): MergeOffer[] {
  const shapes = new Map<string, string[]>()
  for (const [appId, rows] of byApp(selected)) {
    if (ctx && existingPolicyFor(appId, ctx)) continue
    const s = appShape(rows)
    shapes.set(s, [...(shapes.get(s) ?? []), appId])
  }
  return [...shapes.values()].filter((ids) => ids.length > 1).map((appIds) => ({ key: appIds.join('+'), appIds }))
}

/* --- One row's rules --------------------------------------------------------- */

type Alt = Array<() => Condition>

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** The ways ONE restriction can fail, each an AND-run of conditions. Null when it does not carry over. */
function failures(check: LegacyCheck, ad: LegacyAdaptive, zoneId: string | undefined): Alt[] | null {
  if (check === 'ip' && ad.ip?.length && zoneId) return [[() => cond('zone', 'not in zone', [zoneId], 'ip')]]
  if (check === 'location' && ad.location?.countries.length && zoneId) return [[() => cond('zone', 'not in zone', [zoneId], 'location')]]
  if (check === 'time' && ad.time) {
    const t = ad.time
    const off = WEEK.filter((d) => !t.days.includes(d))
    const alts: Alt[] = [[() => cond('time', 'not between', [t.from, t.to], undefined, { tz: t.tz })]]
    if (off.length) alts.push([() => cond('day', 'is', off)])
    return alts
  }
  return null
}

/* AND: any failure fails the row, so the alternatives are pooled. OR: every check has to fail,
   so one alternative from each, in every combination. */
function failCards(using: 'and' | 'or', perCheck: Alt[][]) {
  const alts =
    using === 'and'
      ? perCheck.flat()
      : perCheck.reduce<Alt[]>((acc, opts) => acc.flatMap((a) => opts.map((o) => [...a, ...o])), [[]])
  return alts.map((a) => card(...a.map((make) => make())))
}

function factors(lp: LegacyPolicy, methods?: readonly string[]): Pick<Rule, 'firstFactor' | 'secondFactor' | 'secondFactorMethods' | 'rememberMfa' | 'rememberDays' | 'forceMfaEachLogin' | 'allowDisable2fa'> {
  const old = lp.mfa?.method
  const method = old && old !== DEFAULT_METHOD ? (newMethodName(old, methods) ?? DEFAULT_METHOD) : old
  return {
    firstFactor: lp.firstFactor === 'Password' ? 'Password' : 'Any',
    secondFactor: method && method !== DEFAULT_METHOD ? 'specific' : 'any',
    ...(method && method !== DEFAULT_METHOD ? { secondFactorMethods: [method] } : null),
    rememberMfa: !!lp.mfa?.rememberDays,
    ...(lp.mfa?.rememberDays ? { rememberDays: lp.mfa.rememberDays } : null),
    ...(lp.forceMfa ? { forceMfaEachLogin: true } : null),
    allowDisable2fa: !!lp.mfa?.userCanTurnOff,
  }
}

const strictness = (lp: LegacyPolicy, estate: LegacyEstate) => {
  const ad = lp.adaptive && estate.adaptive.find((a) => a.id === lp.adaptive?.policyId)
  if (ad?.onFail === 'deny') return 3
  return lp.mfa || ad ? 2 : 1
}

/* --- The plan ---------------------------------------------------------------- */

/** `merged`: the merge offers the admin took, by key. */
export function planMove(selected: readonly LegacyPolicy[], estate: LegacyEstate, ctx: MoveContext, merged: readonly string[] = []): MovePlan {
  const apps = byApp(selected)
  const zones: Zone[] = []
  const zoneFor = new Map<string, { id: string; reused?: Zone }>()
  const profiles: FingerprintProfile[] = []
  const profileFor = new Map<string, string>()
  /* One Trusted device profile per old device limit, named for the adaptive policy it came from. */
  const profileOf = (ad: LegacyAdaptive): string => {
    const hit = profileFor.get(ad.id)
    if (hit) return hit
    const taken = [...(ctx.fingerprints ?? []), ...profiles]
    const name = freeName(`${ad.name} devices`, taken.map((p) => p.name))
    const p: FingerprintProfile = {
      ...blankProfile(name, 'device'),
      id: newId('fp', taken.map((x) => x.id), name),
      maxDevices: ad.device?.max ?? null,
      restrictionSet: true,
      usedIn: 1,
      fromOld: 'waiting',
    }
    profiles.push(p)
    profileFor.set(ad.id, p.id)
    return p.id
  }
  const zoneIds = () => [...ctx.zones, ...zones].map((z) => z.id)
  const zoneNames = () => [...ctx.zones, ...zones].map((z) => z.name)
  const policyNames: string[] = ctx.policies.map((p) => p.name)

  /* One zone per adaptive policy, holding both its halves; each condition asks the half it needs. */
  const zoneOf = (ad: LegacyAdaptive): { id: string; reused?: Zone } | undefined => {
    if (!ad.ip?.length && !ad.location?.countries.length) return undefined
    const hit = zoneFor.get(ad.id)
    if (hit) return hit
    const ip = [...(ad.ip ?? [])].sort().join(',')
    const countries = [...(ad.location?.countries ?? [])].sort().join(',')
    const same = ctx.zones.find(
      (z) =>
        [...z.ip].sort().join(',') === ip &&
        z.asn.length === 0 &&
        [...z.location.countries].sort().join(',') === countries &&
        z.location.states.length + z.location.cities.length + z.location.ranges.length === 0,
    )
    const made = same
      ? { id: same.id, reused: same }
      : (() => {
          const name = freeName(ad.name, zoneNames())
          const z: Zone = {
            id: newId('z', zoneIds(), name),
            name,
            kind: 'allowed',
            ip: [...(ad.ip ?? [])],
            asn: [],
            location: { ...emptyLocation(), countries: [...(ad.location?.countries ?? [])] },
            usedIn: 1,
            fromOld: 'waiting',
          }
          zones.push(z)
          return { id: z.id }
        })()
    zoneFor.set(ad.id, made)
    return made
  }

  /* An application that already has a policy joins it: one unit per existing policy, holding every selected row on
     any of its applications. The rest move as before — shared where an offer was taken, one each otherwise. */
  const taken = new Set<string>()
  const units: { appIds: string[]; into?: Policy }[] = []
  const joins = new Map<string, { into: Policy; appIds: string[] }>()
  for (const id of apps.keys()) {
    const into = existingPolicyFor(id, ctx)
    if (!into) continue
    const j = joins.get(into.id) ?? { into, appIds: [] }
    j.appIds.push(id)
    joins.set(into.id, j)
    taken.add(id)
  }
  units.push(...[...joins.values()].map((j) => ({ appIds: j.appIds, into: j.into })))
  for (const key of merged) {
    const ids = key.split('+')
    if (ids.every((id) => apps.has(id) && !taken.has(id))) {
      units.push({ appIds: ids })
      ids.forEach((id) => taken.add(id))
    }
  }
  for (const id of apps.keys()) if (!taken.has(id)) units.push({ appIds: [id] })

  const policies = units.map(({ appIds, into }): PlannedPolicy => {
    const sources = appIds.flatMap((id) => apps.get(id) ?? [])
    const appNames = appIds.map((id) => ctx.apps.find((a) => a.id === id)?.name ?? id)
    const moves: MoveLine[] = []
    const changes: MoveLine[] = []
    const leftOut: MoveLine[] = []
    const ruleSource: Record<string, RuleSource> = {}
    /* The same group twice on one application: the old console let it happen and decided between them by weight.
       The first is kept; the second is named, so nobody wonders where it went. A shared policy reads its first
       application's rows (the rest are identical); a joined one reads every row on its applications. */
    const rows: LegacyPolicy[] = []
    for (const r of into ? sources : (apps.get(appIds[0]) ?? [])) {
      const first = rows.find((x) => x.groupId === r.groupId)
      if (first) leftOut.push({ id: `${r.id}-dup`, name: r.name, before: `Same group as ${first.name}`, after: `${first.name} kept` })
      /* Joining: the policy already has a last row, and it keeps it. */ else if (into && r.groupId === DEFAULT_GROUP)
        leftOut.push({ id: `${r.id}-last`, name: r.name, before: 'DEFAULT row', after: `${into.name}'s own last row decides` })
      else rows.push(r)
    }
    if (into) {
      changes.push({
        id: `${into.id}-joined`,
        name: into.name,
        before: appNames.length === 1 ? `${appNames[0]} already has this policy` : `${appNames.join(', ')} already have this policy`,
        after: 'New rules added after its own',
      })
    }

    const ordered = rows
      .filter((r) => r.groupId !== DEFAULT_GROUP)
      .map((r, i) => ({ r, i }))
      .sort((a, b) => strictness(b.r, estate) - strictness(a.r, estate) || a.i - b.i)
      .map(({ r }) => r)
    const fallbackRow = rows.find((r) => r.groupId === DEFAULT_GROUP)

    const rules: Rule[] = []
    let fallback: Rule | undefined
    for (const lp of [...ordered, ...(fallbackRow ? [fallbackRow] : [])]) {
      const isDefault = lp.groupId === DEFAULT_GROUP
      const who = isDefault ? undefined : { groupIds: [lp.groupId], userIds: [] }
      const label = isDefault ? 'Everyone' : groupName(lp.groupId, ctx)
      const size = isDefault ? 0 : (ctx.groups.find((g) => g.id === lp.groupId)?.memberCount ?? 0)
      const base = factors(lp, ctx.methods)
      const made: string[] = []
      const old = lp.mfa?.method
      if (old && old !== DEFAULT_METHOD) {
        const now = newMethodName(old, ctx.methods)
        if (now === null) changes.push({ id: `${lp.id}-gone`, name: lp.name, before: old, after: 'Any enabled method' })
        else if (now !== old) changes.push({ id: `${lp.id}-renamed`, name: lp.name, before: old, after: now })
      }

      const ad = lp.adaptive && estate.adaptive.find((a) => a.id === lp.adaptive?.policyId)
      if (lp.adaptive && ad) {
        const zone = zoneOf(ad)
        if (zone) {
          moves.push({
            id: `${lp.id}-zone`,
            name: ad.name,
            before: 'Adaptive policy',
            after: zone.reused ? `Uses your ${zone.reused.name} zone` : `New zone ${zones.find((z) => z.id === zone.id)?.name ?? ad.name}`,
          })
        }
        const perCheck: Alt[][] = []
        for (const check of lp.adaptive.checks) {
          const f = failures(check, ad, zone?.id)
          if (f) perCheck.push(f)
          else if (check === 'device' && ad.device) {
            const fp = profileOf(ad)
            perCheck.push([[() => cond('fingerprint', 'does not match', [fp])]])
            moves.push({
              id: `${lp.id}-device`,
              name: `${ad.name} · Device restriction`,
              before: `At most ${ad.device.max} devices per user`,
              after: `New device profile ${profiles.find((p) => p.id === fp)?.name ?? ''}`,
            })
          }
        }
        if (perCheck.length) {
          const failName = `${label}, ${ad.name} not met`
          const failRule = rule({
            name: failName,
            ...(who ? { who } : null),
            when: when(...failCards(lp.adaptive.using, perCheck)),
            ...base,
            decision: ad.onFail === 'deny' ? 'deny' : '2fa',
            matchEstimate: Math.round(size / 5),
          })
          rules.push(failRule)
          ruleSource[failRule.id] = { source: lp.id, part: 'fail' }
          made.push(`"${failName}"`)
        }
      }

      const decision = lp.mfa ? '2fa' : '1fa'
      if (isDefault) {
        fallback = rule({ name: FALLBACK_NAME, ...base, decision, matchEstimate: 0 })
        ruleSource.fallback = { source: lp.id, part: 'last' }
        made.push('the last row')
      } else {
        const pass = rule({ name: label, ...(who ? { who } : null), ...base, decision, matchEstimate: size })
        rules.push(pass)
        ruleSource[pass.id] = { source: lp.id, part: 'pass' }
        made.push(`"${label}"`)
      }
      moves.push({ id: lp.id, name: lp.name, before: legacySummary(lp, estate), after: made.length > 1 ? `Rules ${made.join(' and ')}` : made[0] === 'the last row' ? 'The last row' : `Rule ${made[0]}` })
      if (lp.mfa?.method === DEFAULT_METHOD)
        changes.push({ id: `${lp.id}-method`, name: lp.name, before: 'Default MFA method', after: 'Any enabled method' })
    }

    if (!fallback && !into) {
      fallback = rule({ name: FALLBACK_NAME, decision: 'deny', denyMessage: DENY_OUTSIDE, matchEstimate: 0 })
      moves.push({ id: `${appIds.join('+')}-outside`, name: 'People outside these groups', before: 'No access', after: 'The last row denies' })
    }

    /* Weight became order: whoever is in two of these groups now gets the earlier group's rows. */
    for (let i = 0; i < ordered.length; i += 1)
      for (let j = i + 1; j < ordered.length; j += 1) {
        const [a, b] = [ordered[i], ordered[j]]
        if (rowShape({ ...a, groupId: '' }) === rowShape({ ...b, groupId: '' })) continue
        const both = ctx.users.filter((u) => {
          const gs = memberGroupIds(u)
          return gs.includes(a.groupId) && gs.includes(b.groupId)
        })
        if (both.length === 0) continue
        changes.push({
          id: `${a.id}-${b.id}`,
          /* Three names and the rest as a count: in a big directory this is hundreds of people. */
          name: both.length > 3 ? `${both.slice(0, 3).map((u) => u.name).join(', ')} and ${both.length - 3} more` : both.map((u) => u.name).join(', '),
          before: `In ${groupName(a.groupId, ctx)} and ${groupName(b.groupId, ctx)}: picked by policy weight`,
          after: `${groupName(a.groupId, ctx)} decides, checked first`,
        })
      }

    const base = appNames.length === 1 ? appNames[0] : appNames.length === 2 ? `${appNames[0]} and ${appNames[1]}` : `${appNames[0]} and ${appNames.length - 1} more`
    /* A name holds 50: past that, the application's own name cut at a word, without " sign-in". Joining keeps the
       existing policy's name. */
    const full = `${base} sign-in`
    const name = into ? into.name : freeName(full.length <= POLICY_NAME_MAX ? full : cutAtWord(base, POLICY_NAME_MAX - 3), policyNames)
    if (!into) policyNames.push(name)
    const key = into ? `into:${into.id}` : appIds.join('+')
    if (into) delete ruleSource.fallback
    return {
      key,
      appIds: into ? into.appIds : appIds,
      sourceIds: sources.map((s) => s.id),
      policy: {
        id: into ? into.id : `mv-${key}`,
        name,
        type: 'App Access',
        appIds: into ? into.appIds : appIds,
        audience: EVERYONE,
        status: 'draft',
        lastModified: 'Just now',
        modifiedBy: 'You',
        rules,
        ...(fallback ? { fallback } : null),
        movedFrom: sources.map((s) => s.name),
      },
      moves,
      changes,
      leftOut,
      ruleSource,
      ...(into ? { into: { id: into.id, name: into.name } } : null),
    }
  })

  return { policies, zones, profiles }
}

function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${(at > 10 ? cut.slice(0, at) : cut).replace(/[\s—–-]+$/, '')}…`
}
