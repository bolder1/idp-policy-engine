import type { App, Group, Policy, User, Zone } from './data'
import type { Hook } from './hooks'
import type { RiskProfile } from './risk-signals'
import type { BrandScreen } from './store'

/* -----------------------------------------------------------------------------
   Global search (3 Nov 2026; owner: "add a global search as well", then
   placement, scope and empty state agreed the same evening).

   · In the top bar, beside the logo, and Ctrl+K (⌘K) from anywhere — Notion's
     key, and the one most admin consoles share.
   · It finds what the prototype has: the console's pages (every rail page,
     including the ones taken out of the sidebar), policies, applications,
     users, groups, and the libraries (zones, device profiles, risk signal
     profiles, external hooks).
   · Before anything is typed it lists the pages opened most recently.

   A library item opens its library: those pages have no route to one item. A
   user opens the user list for the same reason.

   Off = no field in the bar and no key. --------------------------------- */
export const GLOBAL_SEARCH = true

export type HitKind = 'page' | 'policy' | 'app' | 'user' | 'group' | 'library'

export interface Hit {
  id: string
  kind: HitKind
  label: string
  /** A second line: where it lives, or what it is. */
  meta?: string
  screen: BrandScreen
}

/** The result groups, in the order they are listed, with their headings. */
export const KINDS: { kind: HitKind; heading: string }[] = [
  { kind: 'page', heading: 'Pages' },
  { kind: 'policy', heading: 'Policies' },
  { kind: 'app', heading: 'Apps' },
  { kind: 'user', heading: 'Users' },
  { kind: 'group', heading: 'Groups' },
  { kind: 'library', heading: 'Libraries' },
]

/** At most this many hits per group, so one long group cannot push the others off the list. */
export const PER_KIND = 5

export interface SearchSources {
  pages: { label: string; meta?: string; screen: BrandScreen }[]
  policies: Policy[]
  apps: App[]
  users: User[]
  groups: Group[]
  zones: Zone[]
  fingerprints: { id: string; name: string }[]
  riskProfiles: RiskProfile[]
  hooks: Hook[]
}

const STATUS: Record<string, string> = {
  active: 'Active',
  draft: 'Draft',
  inactive: 'Inactive',
  monitor: 'Monitor',
}

export function buildIndex(s: SearchSources): Hit[] {
  return [
    ...s.pages.map((p) => ({ id: `page:${p.screen.name}:${p.label}`, kind: 'page' as const, label: p.label, meta: p.meta, screen: p.screen })),
    ...s.policies.map((p) => ({
      id: `policy:${p.id}`,
      kind: 'policy' as const,
      label: p.name,
      meta: STATUS[p.status] ?? undefined,
      screen: { name: 'board', policyId: p.id } as const,
    })),
    ...s.apps.map((a) => ({ id: `app:${a.id}`, kind: 'app' as const, label: a.name, screen: { name: 'application', appId: a.id } as const })),
    ...s.users.map((u) => ({ id: `user:${u.id}`, kind: 'user' as const, label: u.name, meta: u.email, screen: { name: 'users' } as const })),
    ...s.groups.map((g) => ({ id: `group:${g.id}`, kind: 'group' as const, label: g.name, screen: { name: 'groups', groupId: g.id } as const })),
    ...s.zones.map((z) => ({ id: `zone:${z.id}`, kind: 'library' as const, label: z.name, meta: 'Zone', screen: { name: 'zones' } as const })),
    ...s.fingerprints.map((f) => ({
      id: `device:${f.id}`,
      kind: 'library' as const,
      label: f.name,
      meta: 'Device profile',
      screen: { name: 'fingerprint' } as const,
    })),
    ...s.riskProfiles.map((r) => ({
      id: `risk:${r.id}`,
      kind: 'library' as const,
      label: r.name,
      meta: 'Risk signal profile',
      screen: { name: 'risk-signals' } as const,
    })),
    ...s.hooks.map((h) => ({ id: `hook:${h.id}`, kind: 'library' as const, label: h.name, meta: 'External hook', screen: { name: 'hooks' } as const })),
  ]
}

const fold = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** How well `hit` answers `q`: 3 the name starts with it, 2 a word in the name does, 1 the name or its second line
    holds it, 0 not at all. Every word typed has to be found. */
export function score(hit: Hit, q: string): number {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const name = fold(hit.label)
  const all = `${name} ${fold(hit.meta ?? '')}`
  if (!words.every((w) => all.includes(w))) return 0
  const first = words[0]
  if (name.startsWith(first)) return 3
  if (name.split(/[\s\-–—/(),.]+/).some((w) => w.startsWith(first))) return 2
  return 1
}

/** The hits for `q`, grouped in `KINDS` order, best first in each, `PER_KIND` at most. */
export function search(index: Hit[], q: string): { kind: HitKind; heading: string; hits: Hit[] }[] {
  if (!q.trim()) return []
  return KINDS.map(({ kind, heading }) => ({
    kind,
    heading,
    hits: index
      .filter((h) => h.kind === kind)
      .map((h) => ({ h, s: score(h, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.h.label.localeCompare(b.h.label))
      .slice(0, PER_KIND)
      .map((x) => x.h),
  })).filter((g) => g.hits.length)
}

/* --- Recent ---------------------------------------------------------------------------------------------------- */

/** Whether two screens are the same place: the same route and the same thing on it. */
export function samePlace(a: BrandScreen, b: BrandScreen): boolean {
  if (a.name !== b.name) return false
  const id = (s: BrandScreen) =>
    'policyId' in s ? s.policyId : 'appId' in s && s.name === 'application' ? s.appId : 'groupId' in s ? (s.groupId ?? '') : ''
  return id(a) === id(b)
}

/** The hit a screen is, for the recent list: a policy's builder or details is the policy, the rest by route. */
export function hitFor(index: Hit[], screen: BrandScreen): Hit | undefined {
  const as: BrandScreen = screen.name === 'policy-details' || screen.name === 'builder' ? { name: 'board', policyId: screen.policyId } : screen
  return index.find((h) => h.kind !== 'user' && h.kind !== 'library' && samePlace(h.screen, as))
}

export const RECENT_MAX = 6

/** `id` first, once, with the list cut to `RECENT_MAX`. */
export const pushRecent = (list: string[], id: string) => [id, ...list.filter((x) => x !== id)].slice(0, RECENT_MAX)
