import {
  HEADCOUNT_ALL,
  apps as seedApps,
  groups as seedGroups,
  reidRule,
  scenarios as seedScenarios,
  users as seedUsers,
  methodSets as seedMethodSets,
  policies as seedPolicies,
  zones as seedZones,
  type App,
  type Group,
  type MethodSet,
  type Policy,
  type Rule,
  type Scenario,
  type User,
  type Zone,
} from './data'
import { seedProfiles, type FingerprintProfile } from './fingerprint'
import { type HardwareToken } from './hardware-tokens'
import { seedHooks, type Hook } from './hooks'
import { AUTH_METHODS, type AuthMethod } from './methods'
import { type RiskProfile } from './risk-signals'
import { leaves } from './predicate'
import { withWho } from './rule-who'

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
  // A tenant on its first morning has no directory yet, so no groups.
  if (depth === 'none') return []
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
  // A tenant on its first morning has connected nothing.
  if (depth === 'none') return []
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
    /* A realistic mix: at this size something is always switched off. */
    status: roll > 0.82 ? 'inactive' : 'active',
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

/* Unfinished means draft: a policy with no applications cannot be live.

   Applied to every depth, so no fixture can hand the list an Active policy that
   protects nothing. A saved draft on such a policy becomes its rules, the same
   way `asStored` in policy-draft.ts folds one. */
export function settled(p: Policy): Policy {
  if (p.isSystem || p.appIds.length > 0 || (p.status === 'draft' && !p.pendingDraft)) return p
  const { pendingDraft, ...rest } = p
  return pendingDraft
    ? { ...rest, status: 'draft', rules: pendingDraft.rules, fallback: pendingDraft.fallback }
    : { ...rest, status: 'draft' }
}

/* The small tenant's stand-ins for apps it does not have. Payroll runs on
   Workday there, so the Payroll policy stays live instead of losing its app. */
const SMALL_APP_SWAP: Record<string, string> = { payroll: 'workday' }

/* A rule's who, cut down to the people and groups this tenant lists.

   A rule that named only people the tenant lacks is dropped rather than kept
   with an empty who, because an empty who means everyone: "CFO anywhere,
   hardened" must not widen to the whole company. */
function whoWithin(r: Rule, people: Set<string>, groups: Set<string>): Rule | null {
  if (!r.who) return r
  const keep = (ids: string[] | undefined, known: Set<string>) => (ids ?? []).filter((id) => known.has(id))
  const next = {
    groupIds: keep(r.who.groupIds, groups),
    userIds: keep(r.who.userIds, people),
    exceptGroupIds: keep(r.who.exceptGroupIds, groups),
    exceptUserIds: keep(r.who.exceptUserIds, people),
  }
  const named = r.who.groupIds.length + r.who.userIds.length > 0
  if (named && next.groupIds.length + next.userIds.length === 0) return null
  return withWho(r, next)
}

export function policiesAt(depth: Depth): Policy[] {
  return rawPoliciesAt(depth).map(settled)
}

function rawPoliciesAt(depth: Depth): Policy[] {
  const system = seedPolicies.filter((p) => p.isSystem)

  /* Day one keeps the system catch-all, because a real tenant always has one and
     hiding it would misstate what a first sign-in gets. Everything a tenant
     authored is gone. */
  if (depth === 'none') return system

  if (depth === 'small') {
    /* Three policies, and specifically the three a Delegator ends up with:
       one broad MFA baseline (the country allowlist every tenant writes first),
       one for the segment they worry about (Payroll), and one they started and
       never finished — S5's application baseline, which is a Default Rule and
       no rules at all. The last is not padding: an unfinished policy is the
       single most common thing in a small tenant, and the config-issue marker
       exists for it.

       These three are named from the use-case document's own scenarios rather
       than invented, so a Delegator's tenant is a subset of the estate the rest
       of the console is reasoned about with. */
    const keep = ['uc3-country-allowlist', 's9-finance', 's5-baseline']
    const owned = new Set(appsAt('small').map((a) => a.id))
    const people = new Set(usersAt('small').people.map((u) => u.id))
    const segments = new Set(groupsAt('small').map((g) => g.id))
    return [
      ...system,
      ...seedPolicies
        .filter((p) => keep.includes(p.id))
        .map((p) => ({
          ...p,
          /* Narrowed to the apps this tenant actually has, rather than dropped
             wholesale. A policy that owns none of them ends up with no apps,
             and `settled` then makes it a draft: S5's baseline is exactly the
             policy a small tenant started and never finished. */
          appIds: [...new Set(p.appIds.map((id) => SMALL_APP_SWAP[id] ?? id))].filter((id) => owned.has(id)),
          rules: p.rules
            // A Delegator does not write four-rule policies. They take the
            // first two the template gave them and leave.
            .slice(0, 2)
            .map((r) => whoWithin(r, people, segments))
            .filter((r): r is Rule => r !== null)
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
  /* Derived from what the small tenant's own policies name, not listed.

     It was `z.id === 'office'`, on the reasoning that one office network is
     what a small tenant has and the ASN zone, the geo zone and the anonymiser
     list are things somebody had to know to want. That reasoning was sound and
     the list stopped being true the moment a zone became the ONLY way to say
     anything about a network: `uc3-country-allowlist` names `home-countries`
     and `s9-finance` names `office-cidr`, so a Delegator's tenant held two
     policies pointing at zones their tenant did not have — dangling references,
     which fail silently by never matching.

     Derived so it cannot drift again. Add a policy to `keep` above and its
     zones come with it. */
  if (depth === 'small') {
    const named = new Set(
      policiesAt('small').flatMap((p) =>
        [...p.rules, p.fallback].flatMap((r) =>
          r ? leaves(r.when).filter((c) => c.typeId === 'zone').flatMap((c) => c.values) : [],
        ),
      ),
    )
    named.add('office')
    return seedZones.filter((z) => named.has(z.id))
  }
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
      location: { countries: ['India'], states: [], cities: [], ranges: [] },
      usedIn: 0,
    },
    {
      id: 'partner-egress',
      name: 'Partner egress',
      kind: 'custom',
      ip: ['203.0.113.0/24', '198.51.100.0/24', '192.0.2.0/24'],
      asn: ['AS15169', 'AS16509'],
      location: { countries: [], states: [], cities: [], ranges: [] },
      usedIn: 0,
    },
  ]
}

export function hooksAt(depth: Depth): Hook[] {
  // A small tenant has no systems to call out to, and would not know to want
  // one. The Integrator's whole estate is the reason hooks exist.
  if (depth === 'none' || depth === 'small') return []
  /* Derived, like `zonesAt('small')`: every hook the medium tenant's policies
     call, plus the fraud lookup. A sliced list left live policies calling hooks
     the library did not have. */
  if (depth === 'medium') {
    const named = new Set(
      policiesAt('medium').flatMap((p) =>
        [...p.rules, p.fallback].flatMap((r) =>
          r ? leaves(r.when).filter((c) => c.typeId === 'webhook').flatMap((c) => c.values) : [],
        ),
      ),
    )
    named.add('hk-fraud')
    return seedHooks.filter((h) => named.has(h.id))
  }
  return seedHooks
}

export function fingerprintsAt(depth: Depth): FingerprintProfile[] {
  if (depth === 'none') return []
  /* Named, not sliced. `seedProfiles.slice(0, 1)` was positional, so appending
     five profiles to the seed was safe and inserting one before `fp-corp` would
     silently have changed which profile a small tenant gets — a fixture that
     depends on the order of a list nobody thinks of as ordered. */
  if (depth === 'small') return seedProfiles.filter((p) => p.id === 'fp-corp')
  return seedProfiles
}

/* --- Risk signal profiles --------------------------------------------------

   `rp-shipped` is the one every tenant starts on and it is deliberately empty:
   nothing off, nothing retuned, so `riskScale` reproduces the `RISK_SCORE`
   constant it replaced exactly. A tenant who never opens this screen must grade
   as they did before it existed, which is the property `risk-signals.test.ts`
   asserts in its first case — seeding the default with an opinion would break
   it and re-grade every seeded policy.

   The other two are what a library is FOR: alternatives somebody drafted
   without switching the tenant onto them. Both are the two real shapes of this
   decision — one that listens to less, one that listens to the same things and
   pushes harder — rather than two arbitrary tunings. */
const seedRiskProfiles: RiskProfile[] = [
  { id: 'rp-shipped', name: 'Shipped priorities', off: [], tiers: {} },
  {
    /* Network origin off. The tenant's workforce is remote and half of them are
       on a corporate VPN, so `vpn` and `datacenter` fire on people doing exactly
       what they were told to do — the classic reason a tenant turns a family of
       signals down rather than up. */
    id: 'rp-remote',
    name: 'Remote workforce — quieter network signals',
    off: ['vpn', 'datacenter', 'residential-proxy'],
    tiers: {},
  },
  {
    /* Everything on, and the signals that ship BELOW High raised to it.

       Deliberately not `rooted` and `jailbroken`, which was the first draft of
       this fixture and was a no-op: both already ship at High, so writing High
       over them produced a profile numerically identical to the shipped one —
       a row claiming to be stricter that scored exactly the same. These four
       are the ones that actually ship lower. A cloned app and a device in
       developer mode are tie-breakers by default; for this tenant they are the
       answer. */
    id: 'rp-strict',
    name: 'High assurance — a tampered device is decisive',
    off: [],
    /* Keyed by signal, since 18 Sep 2026: a weight is the signal's, not the
       signal's on a platform. */
    tiers: {
      cloned: 'High',
      'dev-mode': 'High',
      'high-activity': 'High',
    },
  },
]

export function riskProfilesAt(depth: Depth): RiskProfile[] {
  /* Never empty, at any depth. Every other library here can be empty because
     nothing breaks without it; this one produces `riskScale`, so a tenant with
     no risk profile is a tenant with no risk scale — and the `device-risk`
     condition would have nothing to compare against. `none` gets the shipped
     weighting alone, which is the same thing as having no opinion. */
  if (depth === 'none' || depth === 'small') return seedRiskProfiles.slice(0, 1)
  return seedRiskProfiles
}

/* Templates the gallery offers.

   A day-one tenant has only what Xecurify ships: nobody there has saved one
   yet. Every other tenant also has the ones its own team wrote. */
export function scenariosAt(depth: Depth): Scenario[] {
  if (depth === 'none') return seedScenarios.filter((s) => s.provided)
  return seedScenarios
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

/* --- Display tokens ----------------------------------------------------------

   The fobs in the tenant's drawer, and who holds them. Every type appears, so
   the inventory shows what each one looks like: a C100 that has been synced
   (the only kind that ever is), a person holding two tokens, and fobs still
   unassigned. Half assigned, because a drawer that is empty or fully issued
   hides one of the two jobs the page exists for.

   Hardware is not headcount. A 20,000-person estate does not issue fobs to
   20,000 people — they go to the few who cannot use a phone — so `large` holds
   the same drawer as `medium` rather than a multiplied one. */
const seedTokens: HardwareToken[] = [
  { serial: 'MO-DT-1001', type: 'miniorange', userId: 'priya', addedAt: '12 Aug 2026', assignedAt: '12 Aug 2026' },
  { serial: 'MO-DT-1002', type: 'miniorange', userId: null, addedAt: '12 Aug 2026' },
  { serial: 'MO-DT-1003', type: 'miniorange', userId: null, addedAt: '12 Aug 2026' },
  {
    serial: 'FT-C100-004512',
    type: 'feitian-c100',
    counter: 37,
    userId: 'u-it-1',
    addedAt: '18 Aug 2026',
    assignedAt: '18 Aug 2026',
    syncedAt: '2 Sep 2026',
  },
  { serial: 'FT-C100-004513', type: 'feitian-c100', counter: 0, userId: null, addedAt: '18 Aug 2026' },
  { serial: 'FT-C200-118203', type: 'feitian-c200', userId: 'u-fin-2', addedAt: '25 Aug 2026', assignedAt: '26 Aug 2026' },
  { serial: 'FT-C200-118204', type: 'feitian-c200', userId: null, addedAt: '25 Aug 2026' },
  { serial: 'TOTP-2608-0091', type: 'totp', userId: 'priya', addedAt: '29 Aug 2026', assignedAt: '1 Sep 2026' },
]

export function tokensAt(depth: Depth): HardwareToken[] {
  if (depth === 'none') return []
  if (depth === 'small') {
    /* Three fobs, one issued. Assignments are kept only for people the small
       directory lists, so the fixture cannot name a holder the tenant lacks —
       the same dangling-reference trap `zonesAt('small')` is derived to avoid. */
    const listed = new Set(usersAt('small').people.map((u) => u.id))
    return seedTokens
      .filter((t) => ['MO-DT-1001', 'MO-DT-1003', 'FT-C200-118204'].includes(t.serial))
      .map((t) => (t.userId && !listed.has(t.userId) ? { ...t, userId: null, assignedAt: undefined } : t))
  }
  return seedTokens
}
