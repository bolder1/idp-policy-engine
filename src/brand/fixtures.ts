import {
  HEADCOUNT_ALL,
  apps as seedApps,
  groups as seedGroups,
  reidRule,
  users as seedUsers,
  methodSets as seedMethodSets,
  policies as seedPolicies,
  zones as seedZones,
  type App,
  type Group,
  type MethodSet,
  type Policy,
  type User,
  type Zone,
} from './data'
import { seedProfiles, type FingerprintProfile } from './fingerprint'
import { seedHooks, type Hook } from './hooks'
import { AUTH_METHODS, type AuthMethod } from './methods'

/* -----------------------------------------------------------------------------
   How much is in the tenant — derived from who is looking.

   The depth of data is not a second dial. It is a property of the persona: the
   doc gives every archetype a company size, and a 200-person tenant and a
   20,000-person tenant are not the same product experience with different
   numbers in it. They have different problems. The Delegator's three policies
   fit on one screen and their whole difficulty is knowing whether protection is
   on; the Architect's twenty-three do not fit anywhere and their whole
   difficulty is that no two of them agree.

   So picking a persona loads their tenant:

     New admin · hour one   →  none    nothing configured at all
     IT Generalist          →  small   50–500 people, three policies, one zone
     Security IT Manager    →  medium  500–5,000, the seeded catalogue
     Enterprise Architect   →  large   5,000+, twenty-three policies, real drift
     Platform Integrator    →  large   the same estate, plus every hook
     Bulk operator          →  large   the same estate, plus a 700-range zone

   --- Not a mock -------------------------------------------------------------

   This reshapes the store, so every surface in the Policy tab answers from the
   loaded tenant: the list, Coverage, the zones library, the hooks page, the
   gauntlet grades, the linter. A demo screen with invented numbers can show a
   room a big tenant. Only this can show them what the product does when it
   meets one — which is the thing actually in question.

   `large` therefore fabricates nothing. It clones the seeded rule shapes across
   departments and lets the existing machinery draw its own conclusions. The
   gauntlet grades those policies for real; the linter finds real contradictions
   in them; the coverage matrix has real holes.
   -------------------------------------------------------------------------- */

export type Depth = 'none' | 'small' | 'medium' | 'large'

export const DEPTHS: Record<Depth, { label: string; caption: string }> = {
  none: { label: 'Nothing configured', caption: 'A tenant on its first morning.' },
  small: { label: 'Small', caption: '50–500 people. Three policies, one zone, no hooks.' },
  medium: { label: 'Growing', caption: '500–5,000 people. Nine policies, a zone library, the first surprises.' },
  large: { label: 'Enterprise', caption: '5,000+ people. Twenty-three policies, a 700-range zone, real drift.' },
}

/* A seeded LCG. Not for security — for repeatability. Math.random() would give
   the demo a different shape on every reload, which makes a screenshot a lie
   and a test impossible. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// --- People -------------------------------------------------------------------

/* The directory scales with the tenant, because half the numbers an admin reads
   are populations. "154 contractors" and "3,900 contractors" are the same rule
   and completely different decisions, and a rule preview that says 154 on a
   20,000-person estate is the kind of quiet wrongness that makes people stop
   trusting every other number on the page. */
const HEADCOUNT: Record<Depth, number> = { none: 0, small: 1, medium: 1, large: 16 }

export function groupsAt(depth: Depth): Group[] {
  const f = HEADCOUNT[depth]
  if (depth === 'small') {
    // A 50–500 tenant does not have six segments. It has everyone, plus the two
    // distinctions it actually makes decisions about.
    return seedGroups
      .filter((g) => ['all', 'finance', 'contractors'].includes(g.id))
      .map((g) => ({ ...g, memberCount: Math.round(g.memberCount * 0.24) }))
  }
  return seedGroups.map((g) => ({ ...g, memberCount: g.memberCount * f }))
}

/* The directory at this tenant's size.

   FABRICATED, like `users` in data.ts. Twenty-four named people exist; the
   tenant claims far more, so this returns what is listed AND what is not, and
   every picker built on it says "showing 24 of 1,240" rather than implying the
   list is the directory. Generating twenty thousand rows nobody will scroll
   would make the fixture look like data. */
export function usersAt(depth: Depth): { people: User[]; unlisted: number } {
  if (depth === 'none') return { people: [], unlisted: 0 }
  if (depth === 'small') {
    const people = seedUsers.filter((u) => ['finance', 'contractors'].includes(u.groupId))
    return { people, unlisted: Math.max(0, Math.round(HEADCOUNT_ALL * 0.24) - people.length) }
  }
  const total = HEADCOUNT_ALL * HEADCOUNT[depth]
  return { people: seedUsers, unlisted: Math.max(0, total - seedUsers.length) }
}

export function appsAt(depth: Depth): App[] {
  // Small tenants connect a handful of apps; the catalogue is not the tenant.
  if (depth === 'small') return seedApps.slice(0, 4)
  return seedApps
}

// --- Policies -----------------------------------------------------------------

const DEPARTMENTS = [
  'Marketing', 'Support', 'Legal', 'Procurement', 'Payroll', 'Field Sales', 'Data Science',
  'Facilities', 'Quality', 'Clinical', 'Treasury', 'Partner Ops', 'Retail POS', 'Warehouse',
]

/* Cloned rather than invented, so the gauntlet and the linter have real rules to
   chew on — and shifted by one rule on every third clone so the estate contains
   genuine inconsistency. Twenty identical policies have no drift in them and
   would flatter the screen. */
function clonePolicy(src: Policy, i: number, dept: string, scale: number): Policy {
  const r = rng(900 + i)
  const short = src.name.replace('Finance Team – ', '').replace('Executive ', '')
  const roll = r()
  return {
    ...src,
    id: `syn-${i}-${src.id}`,
    name: `${dept} — ${short}`,
    /* A realistic mix, monitor included: at this size something is always
       mid-rollout, and an estate where everything is either on or off does not
       look like anywhere real. */
    status: roll > 0.82 ? 'inactive' : roll > 0.72 ? 'monitor' : 'active',
    isSystem: false,
    lastModified: `${1 + Math.floor(r() * 40)} days ago`,
    modifiedBy: ['Mehak Garg', 'Jaspreet T.', 'Rohit K.', 'System'][Math.floor(r() * 4)],
    /* `reidRule` rather than a spread: the clone must not share Condition or
       ConditionCard objects with the policy it was cloned from, because the
       linter and the composer both address those by id. */
    rules: (i % 3 === 0 ? src.rules.slice(1) : src.rules).map((rule) => ({
      ...reidRule(rule),
      matchEstimate: rule.matchEstimate * scale,
    })),
  }
}

export function policiesAt(depth: Depth): Policy[] {
  const system = seedPolicies.filter((p) => p.isSystem)

  /* Day one keeps the system catch-all, because a real tenant always has one and
     hiding it would misstate what a first sign-in gets. Everything a tenant
     authored is gone. */
  if (depth === 'none') return system

  if (depth === 'small') {
    /* Three policies, and specifically the three a Delegator ends up with:
       one broad MFA baseline, one for the segment they worry about, and one
       they started and never finished. The last is not padding — an unfinished
       policy is the single most common thing in a small tenant, and the config
       -issue marker exists for it. */
    const keep = ['finance-high', 'default-workforce', 'partner-portal']
    return [
      ...system,
      ...seedPolicies
        .filter((p) => keep.includes(p.id))
        .map((p) => ({
          ...p,
          appIds: p.appIds.filter((id) => appsAt('small').some((a) => a.id === id)),
          rules: p.rules
            // A Delegator does not write four-rule policies. They take the
            // first two the template gave them and leave.
            .slice(0, 2)
            .map((r) => ({ ...reidRule(r), matchEstimate: Math.round(r.matchEstimate * 0.24) })),
        })),
    ]
  }

  if (depth === 'medium') return seedPolicies

  const base = seedPolicies.filter((p) => !p.isSystem && p.rules.length > 0)
  return [
    ...seedPolicies.map((p) => ({
      ...p,
      rules: p.rules.map((r) => ({ ...reidRule(r), matchEstimate: r.matchEstimate * HEADCOUNT.large })),
    })),
    ...DEPARTMENTS.map((d, i) => clonePolicy(base[i % base.length], i, d, HEADCOUNT.large)),
  ]
}

// --- Library objects ----------------------------------------------------------

export function zonesAt(depth: Depth): Zone[] {
  // Nothing ships by default any more, so a day-one tenant gets the empty state.
  if (depth === 'none') return []
  // One office network is what a small tenant has. The ASN zone, the geo zone
  // and the anonymiser list are things somebody had to know to want.
  if (depth === 'small') return seedZones.filter((z) => z.id === 'office')
  if (depth === 'medium') return seedZones

  /* The bulk case made literal. The doc calls seven hundred ranges a task mode
     rather than a persona and says the system has to not collapse under it —
     which is only demonstrable if the weight is actually there. */
  const r = rng(4242)
  const many: string[] = []
  for (let i = 0; i < 712; i += 1) {
    many.push(`${10 + (i % 40)}.${Math.floor(r() * 250)}.${Math.floor(r() * 250)}.0/24`)
  }
  return [
    ...seedZones,
    {
      id: 'branch-net',
      name: 'Branch networks (imported)',
      kind: 'allowed',
      ip: many,
      asn: [],
      location: { countries: ['India'], states: [], cities: [] },
      usedIn: 0,
    },
    {
      id: 'partner-egress',
      name: 'Partner egress',
      kind: 'custom',
      ip: ['203.0.113.0/24', '198.51.100.0/24', '192.0.2.0/24'],
      asn: ['AS15169', 'AS16509'],
      location: { countries: [], states: [], cities: [] },
      usedIn: 0,
    },
  ]
}

export function hooksAt(depth: Depth): Hook[] {
  // A small tenant has no systems to call out to, and would not know to want
  // one. The Integrator's whole estate is the reason hooks exist.
  if (depth === 'none' || depth === 'small') return []
  if (depth === 'medium') return seedHooks.slice(0, 1)
  return seedHooks
}

export function fingerprintsAt(depth: Depth): FingerprintProfile[] {
  if (depth === 'none') return []
  if (depth === 'small') return seedProfiles.slice(0, 1)
  return seedProfiles
}

export function methodSetsAt(depth: Depth): MethodSet[] {
  if (depth === 'none' || depth === 'small') return []
  return seedMethodSets
}

/* Enrolment counts, scaled.

   The method catalogue itself is a product fact — eleven ways to prove an
   identity, the same eleven for every tenant — so the list does not change with
   depth. The number of people who have enrolled in each one very much does, and
   the catalogue ships with those hard-coded.

   Left alone, a tenant on its first morning reads "612 enrolled" against Email
   before a single user exists, which is the kind of detail that costs a demo
   its credibility in one glance. Scaled off the same headcount multiplier as
   the group directory, so the two agree. */
export function methodsAt(depth: Depth): AuthMethod[] {
  const f = depth === 'small' ? 0.24 : HEADCOUNT[depth]
  return AUTH_METHODS.map((m) =>
    m.enrolled === undefined ? m : { ...m, enrolled: Math.round(m.enrolled * f) },
  )
}
