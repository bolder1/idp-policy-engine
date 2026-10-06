import { conditionType, memberGroupIds, type Policy, type Rule, type User } from '../../data'
import { leaves } from '../../predicate'
import type { PeekKind, PeekTarget } from './inspect-model'

/* -----------------------------------------------------------------------------
   What a rule leans on, for the inspector's peeks (CHECK-ACCESS-INSPECTOR.md):
   the zones, device profiles and hooks its conditions name, and the risk
   profile when it reads the device risk score. PURE.
   -------------------------------------------------------------------------- */

/* The tenant default comes last in a list of the policies on something: it
   covers every application and every person, and is only asked once none of
   the others governs (tenant-resolver.ts `governingPolicy`). The tenant keeps
   it first in its own list, so a plain filter put it at the top. */
const defaultLast = (named: readonly Policy[], policies: readonly Policy[]): Policy[] => [...named, ...policies.filter((p) => p.isSystem)]

/** The policies that cover an application, by name: the ones that name it, then the tenant default. */
export function policiesOnApp(policies: readonly Policy[], appId: string): Policy[] {
  return defaultLast(
    policies.filter((p) => !p.isSystem && p.appIds.includes(appId)),
    policies,
  )
}

const KIND = { zone: 'zone', fingerprint: 'device', hook: 'hook' } as const

/** The library objects one rule's conditions name, once each, in the order they are read. */
export function objectsOfRule(rule: Rule, activeRiskProfileId: string): PeekTarget[] {
  const out: PeekTarget[] = []
  const add = (t: PeekTarget) => {
    if (!out.some((o) => o.kind === t.kind && o.id === t.id)) out.push(t)
  }
  for (const c of leaves(rule.when)) {
    const vk = conditionType(c.typeId).valueKind
    if (vk === 'zone' || vk === 'fingerprint' || vk === 'hook') for (const id of c.values) add({ kind: KIND[vk], id })
    else if (c.typeId === 'device-risk') add({ kind: 'risk', id: activeRiskProfileId })
  }
  return out
}

/** The policies for a person: the ones whose audience names them, one of their groups, or everyone — then the tenant
    default, which covers everybody (6 Oct 2026: the person view said "No policy yet" for someone the Global Default
    covers). Marked Default where it is listed, as on an application (PeekViews.tsx). */
export function policiesForPerson(policies: readonly Policy[], user: Pick<User, 'id' | 'groupId' | 'alsoGroupIds'>): Policy[] {
  const groups = memberGroupIds(user)
  return defaultLast(
    policies.filter((p) => !p.isSystem && (p.audience.everyone || p.audience.userIds.includes(user.id) || groups.some((g) => p.audience.groupIds.includes(g)))),
    policies,
  )
}

/** The policies an object is in: the ones whose rules name it, those on an application, those written for a person. */
export function usedByPolicies(policies: readonly Policy[], target: PeekTarget, activeRiskProfileId: string, users: readonly User[] = []): Policy[] {
  if (target.kind === 'app') return policiesOnApp(policies, target.id)
  if (target.kind === 'person') {
    const u = users.find((x) => x.id === target.id)
    return u ? policiesForPerson(policies, u) : []
  }
  /* The default policy counts when its own rules name the object — last, as everywhere here — the way the library's
     own "Used by" counts it (usage.ts `policiesUsing`): opened from the Global Default's rule, it must list it. */
  const names = (p: Policy) => p.rules.some((r) => objectsOfRule(r, activeRiskProfileId).some((o) => o.kind === target.kind && o.id === target.id))
  return [...policies.filter((p) => !p.isSystem && names(p)), ...policies.filter((p) => p.isSystem && names(p))]
}

type Named = { id: string; name: string }

/** How each kind of peek is named, from the library: what the breadcrumb and a card's Uses line say. */
export function peekNames(lib: { zones: readonly Named[]; fingerprints: readonly Named[]; hooks: readonly Named[]; riskProfiles: readonly Named[]; users: readonly Named[]; apps: readonly Named[] }): Record<PeekKind, (id: string) => string | undefined> {
  const of = (list: readonly Named[]) => (id: string) => list.find((x) => x.id === id)?.name
  return { zone: of(lib.zones), device: of(lib.fingerprints), hook: of(lib.hooks), risk: of(lib.riskProfiles), person: of(lib.users), app: of(lib.apps) }
}

/** Where each kind lives in the console: the panel foot's "Open in …". A person has no page of their own here. */
export const PEEK_LIBRARY: Record<PeekKind, string> = { zone: 'Zones', device: 'Device profiles', risk: 'Risk signal profiles', hook: 'External hooks', person: 'Directory', app: 'Applications' }
