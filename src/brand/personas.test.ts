import { describe, expect, it } from 'vitest'

import { PERSONAS, TAB_LABEL, TAB_SCREEN, personaById, tabsFor, unmetNeeds, type TabId } from './personas'
import {
  DEPTHS,
  appsAt,
  fingerprintsAt,
  groupsAt,
  hooksAt,
  methodSetsAt,
  policiesAt,
  riskProfilesAt,
  scenariosAt,
  settled,
  usersAt,
  zonesAt,
  type Depth,
} from './fixtures'
import { POLICY_STATUSES, enforces, policies as seedPolicies, type Policy } from './data'
import { leaves } from './predicate'

const DEPTH_ORDER: Depth[] = ['none', 'small', 'medium', 'large']

const tenantAt = (d: Depth) => ({
  policies: policiesAt(d),
  zones: zonesAt(d),
  hooks: hooksAt(d),
  fingerprints: fingerprintsAt(d),
  methodSets: methodSetsAt(d),
  apps: appsAt(d),
  groups: groupsAt(d),
})

/* -----------------------------------------------------------------------------
   Two claims, both of which a meeting will be asked to accept.

   One: every archetype the framework doc names is served by the Policy tab, and
   we can say which tab serves which need. Two: the tenant loaded for each
   persona genuinely differs in depth, so "here it is empty and here it is at
   scale" is a demonstration rather than an assertion.

   The interesting test in the first group is the LAST one — the backlog test.
   It fails when an unmet need is quietly marked met, which is the only way this
   registry can rot: not by going out of date, but by being edited to agree with
   whatever was most recently shipped.
   -------------------------------------------------------------------------- */

describe('persona coverage of the Policy tab', () => {
  it('covers every archetype the doc names', () => {
    // Persona 1/2/3 from §Gaps & Personas, the Integrator and the bulk task
    // mode from §Conclusion, and the first morning none of them is written for.
    expect(PERSONAS.map((p) => p.id)).toEqual([
      'first-run',
      'generalist',
      'manager',
      'architect',
      'integrator',
      'bulk',
    ])
  })

  it('gives every persona a question, a flow, a landing tab and needs', () => {
    for (const p of PERSONAS) {
      expect(p.question, p.id).toMatch(/\?$/)
      expect(p.flow.length, p.id).toBeGreaterThan(30)
      expect(p.needs.length, p.id).toBeGreaterThanOrEqual(4)
      expect(TAB_SCREEN[p.landing], p.id).toBeDefined()
    }
  })

  /* Every need names a tab that exists and that the persona is recorded as
     using. A need pointing at a tab outside `tabsFor` would be a claim the
     switcher never highlights, which is how a registry and a UI drift apart. */
  it('maps every need onto a real tab the persona uses', () => {
    for (const p of PERSONAS) {
      const used = tabsFor(p)
      for (const n of p.needs) {
        expect(TAB_LABEL[n.tab], `${p.id}: ${n.what}`).toBeDefined()
        expect(used, `${p.id}: ${n.what}`).toContain(n.tab)
      }
    }
  })

  /* Every inner tab has to earn its place: a tab no persona needs is either a
     tab nobody uses or a persona we have not written down. Both are worth
     failing a build over. */
  it('leaves no inner tab unclaimed by any persona', () => {
    const claimed = new Set(PERSONAS.flatMap((p) => p.needs.map((n) => n.tab)))
    const all: TabId[] = ['policies', 'templates', 'zones', 'fingerprint', 'methods', 'hooks']
    for (const t of all) expect(claimed.has(t), `${TAB_LABEL[t]} is claimed by no persona`).toBe(true)
  })

  it('lands each persona on a tab they actually use', () => {
    for (const p of PERSONAS) expect(tabsFor(p), p.id).toContain(p.landing)
  })

  it('resolves an unknown id rather than returning undefined', () => {
    expect(personaById('nope' as never).id).toBe('first-run')
  })

  /* The backlog, asserted. If this number moves, either something shipped or
     somebody edited the registry to look better — and the diff says which. */
  it('records exactly the needs still unbuilt', () => {
    const open = unmetNeeds().map(({ persona, need }) => `${persona.id}: ${need.what}`)
    expect(open).toEqual([
      'first-run: Be walked through the first policy',
      'generalist: Find what is protected by nothing',
      'generalist: Try a policy without risking a lockout',
      'manager: Know what a policy lets through before shipping it',
      'architect: Read the estate as a matrix',
      'architect: Export policies for version control and review',
      'architect: Be told when two live policies disagree about the same app and group',
      'architect: Order policies against each other, not just rules within one',
      'integrator: Sync attributes in and write ordinary conditions against them',
      'bulk: Upload a file rather than paste',
      'bulk: Get the rejected rows back in a form they can fix',
    ])
  })

  it('gives every unmet need a note saying what is missing', () => {
    for (const { persona, need } of unmetNeeds()) {
      expect(need.note, `${persona.id}: ${need.what}`).toMatch(/^(Not built|Half built)/)
    }
  })
})

describe('the tenant loaded for each depth', () => {
  it('gets strictly deeper at every step', () => {
    const sizes = DEPTH_ORDER.map((d) => {
      const t = tenantAt(d)
      return {
        depth: d,
        policies: t.policies.length,
        rules: t.policies.reduce((n, p) => n + p.rules.length, 0),
        zoneEntries: t.zones.reduce((n, z) => n + z.ip.length + z.asn.length, 0),
        people: t.groups.reduce((n, g) => n + g.memberCount, 0),
      }
    })
    for (let i = 1; i < sizes.length; i += 1) {
      const prev = sizes[i - 1]
      const cur = sizes[i]
      expect(cur.policies, `${cur.depth} policies`).toBeGreaterThan(prev.policies)
      expect(cur.rules, `${cur.depth} rules`).toBeGreaterThan(prev.rules)
      expect(cur.people, `${cur.depth} people`).toBeGreaterThan(prev.people)
    }
  })

  it('starts a day-one tenant with nothing the tenant authored', () => {
    const t = tenantAt('none')
    expect(t.policies.every((p) => p.isSystem)).toBe(true)
    expect(t.hooks).toHaveLength(0)
    expect(t.fingerprints).toHaveLength(0)
    expect(t.methodSets).toHaveLength(0)
    /* Zones too, now. The two locked defaults were removed with the
       address-AND-location concept they were named after, so "nothing the
       tenant authored" finally means nothing at all. `every` on an empty array
       is vacuously true, so this asserts the length instead. */
    expect(t.zones).toHaveLength(0)
    // No apps connected and no directory yet.
    expect(t.apps).toHaveLength(0)
    expect(t.groups).toHaveLength(0)
    expect(usersAt('none').people).toHaveLength(0)
  })

  /* The system catch-all survives at every depth. Removing it would misstate
     what a sign-in gets in an unconfigured tenant, which is the single most
     useful thing the day-one view has to say. */
  it('keeps the always-on catch-all at every depth', () => {
    for (const d of DEPTH_ORDER) {
      const system = tenantAt(d).policies.find((p) => p.isSystem)
      expect(system, d).toBeDefined()
      expect(enforces(system!), d).toBe(true)
    }
  })

  it('gives a small tenant fewer apps and segments than a large one', () => {
    expect(tenantAt('small').apps.length).toBeLessThan(tenantAt('large').apps.length)
    expect(tenantAt('small').groups.length).toBeLessThan(tenantAt('large').groups.length)
  })

  /* The bulk case, which the doc says the system must not collapse under. It
     has to actually be in the data or the claim is untested. */
  it('carries a seven-hundred-range zone at enterprise depth', () => {
    const biggest = tenantAt('large').zones.reduce((a, z) => Math.max(a, z.ip.length), 0)
    expect(biggest).toBeGreaterThan(700)
    // And nowhere else — a small tenant with 700 ranges is not a small tenant.
    expect(tenantAt('small').zones.reduce((a, z) => Math.max(a, z.ip.length), 0)).toBeLessThan(50)
  })

  it('only offers hooks where a tenant would plausibly have one', () => {
    expect(tenantAt('none').hooks).toHaveLength(0)
    expect(tenantAt('small').hooks).toHaveLength(0)
    expect(tenantAt('medium').hooks.length).toBeGreaterThan(0)
    expect(tenantAt('large').hooks.length).toBeGreaterThan(tenantAt('medium').hooks.length)
  })

  /* Seeded, so the same demo is the same demo twice and a screenshot is not a
     lie. Math.random() in the generator would break both. */
  it('produces the same tenant twice', () => {
    for (const d of DEPTH_ORDER) {
      expect(policiesAt(d).map((p) => `${p.id}:${p.status}`)).toEqual(policiesAt(d).map((p) => `${p.id}:${p.status}`))
      expect(zonesAt(d).map((z) => z.ip.length)).toEqual(zonesAt(d).map((z) => z.ip.length))
    }
  })

  it('describes every depth in the switcher', () => {
    for (const d of DEPTH_ORDER) {
      expect(DEPTHS[d].label, d).toBeTruthy()
      expect(DEPTHS[d].caption, d).toBeTruthy()
    }
  })
})

describe('each persona lands in a tenant that shows their problem', () => {
  /* The point of tying depth to persona. A persona whose tenant does not
     contain the thing they came to solve is a demo that argues against itself. */
  it('gives the Architect an estate too big to hold in the head', () => {
    const t = tenantAt(personaById('architect').depth)
    expect(t.policies.filter((p) => !p.isSystem).length).toBeGreaterThan(15)
  })

  it('gives the Integrator hooks to look at', () => {
    expect(tenantAt(personaById('integrator').depth).hooks.length).toBeGreaterThan(1)
  })

  it('gives the bulk operator the range list that breaks pickers', () => {
    const t = tenantAt(personaById('bulk').depth)
    expect(t.zones.some((z) => z.ip.length > 700)).toBe(true)
  })

  it('gives the Delegator something small enough to read in one screen', () => {
    const t = tenantAt(personaById('generalist').depth)
    expect(t.policies.filter((p) => !p.isSystem).length).toBeLessThanOrEqual(4)
  })

  it('gives the new admin nothing at all to read', () => {
    expect(tenantAt(personaById('first-run').depth).policies.filter((p) => !p.isSystem)).toHaveLength(0)
  })
})

/* -----------------------------------------------------------------------------
   The loaded tenant has to be one the product could have produced.

   Two owner rules make that checkable: Monitor is gone, so the only statuses are
   Draft, Active, Inactive and Always on; and unfinished means draft, so a
   policy with no applications is never live. And nothing a policy names may be
   missing from that tenant's own libraries: a dangling reference renders as a
   broken rule in a demo nobody broke.
   -------------------------------------------------------------------------- */

const ruleSets = (p: Policy) => [p, ...(p.pendingDraft ? [p.pendingDraft] : [])]
const rulesOf = (p: Policy) => ruleSets(p).flatMap((s) => [...s.rules, ...(s.fallback ? [s.fallback] : [])])
const named = (p: Policy, typeId: string) =>
  rulesOf(p).flatMap((r) => leaves(r.when).filter((c) => c.typeId === typeId).flatMap((c) => c.values))

describe('every tenant is one the product could have produced', () => {
  it('uses only Draft, Active, Inactive and Always on, at every depth', () => {
    for (const d of DEPTH_ORDER) {
      for (const p of policiesAt(d)) expect(POLICY_STATUSES, `${d}: ${p.id} is ${p.status}`).toContain(p.status)
    }
    for (const p of seedPolicies) expect(POLICY_STATUSES, `seed ${p.id}`).toContain(p.status)
    expect(JSON.stringify(DEPTH_ORDER.map(policiesAt))).not.toMatch(/"status":"monitor"/)
  })

  it('never has a live policy with no applications, at any depth', () => {
    for (const d of DEPTH_ORDER) {
      for (const p of policiesAt(d)) {
        if (p.isSystem) continue
        if (p.appIds.length === 0) expect(p.status, `${d}: ${p.name}`).toBe('draft')
        if (p.status === 'draft') expect(p.pendingDraft, `${d}: ${p.name}`).toBeUndefined()
      }
    }
  })

  it('keeps the small tenant Payroll policy live on an app the tenant has', () => {
    const payroll = policiesAt('small').find((p) => p.id === 's9-finance')!
    expect(payroll.appIds.length).toBeGreaterThan(0)
    expect(payroll.status).toBe('active')
  })

  it('names only apps, zones, device profiles and hooks the tenant has', () => {
    for (const d of DEPTH_ORDER) {
      const apps = new Set(appsAt(d).map((a) => a.id))
      const zones = new Set(zonesAt(d).map((z) => z.id))
      const profiles = new Set(fingerprintsAt(d).map((f) => f.id))
      const hooks = new Set(hooksAt(d).map((h) => h.id))
      for (const p of policiesAt(d)) {
        for (const id of p.appIds) expect(apps.has(id), `${d}: ${p.name} app ${id}`).toBe(true)
        for (const id of named(p, 'zone')) expect(zones.has(id), `${d}: ${p.name} zone ${id}`).toBe(true)
        for (const id of named(p, 'fingerprint')) expect(profiles.has(id), `${d}: ${p.name} profile ${id}`).toBe(true)
        for (const id of named(p, 'webhook')) expect(hooks.has(id), `${d}: ${p.name} hook ${id}`).toBe(true)
      }
    }
  })

  it('names only people and groups the tenant lists in a rule who and an audience', () => {
    for (const d of DEPTH_ORDER) {
      const groups = new Set(groupsAt(d).map((g) => g.id))
      const people = new Set(usersAt(d).people.map((u) => u.id))
      for (const p of policiesAt(d)) {
        for (const id of p.audience.groupIds) expect(groups.has(id), `${d}: ${p.name} audience group ${id}`).toBe(true)
        for (const id of p.audience.userIds) expect(people.has(id), `${d}: ${p.name} audience user ${id}`).toBe(true)
        for (const r of rulesOf(p)) {
          const who = r.who
          if (!who) continue
          for (const id of [...who.groupIds, ...(who.exceptGroupIds ?? [])]) expect(groups.has(id), `${d}: ${r.name} group ${id}`).toBe(true)
          for (const id of [...who.userIds, ...(who.exceptUserIds ?? [])]) expect(people.has(id), `${d}: ${r.name} user ${id}`).toBe(true)
        }
      }
    }
  })

  it('offers a day-one tenant only the templates Xecurify ships', () => {
    expect(scenariosAt('none').length).toBeGreaterThan(0)
    expect(scenariosAt('none').every((s) => s.provided)).toBe(true)
    expect(scenariosAt('medium').some((s) => !s.provided)).toBe(true)
  })

  it('gives every tenant a risk profile to grade with', () => {
    for (const d of DEPTH_ORDER) expect(riskProfilesAt(d).some((p) => p.id === 'rp-shipped'), d).toBe(true)
  })

  it('makes a policy with no applications a draft, folding a saved draft into its rules', () => {
    const live = seedPolicies.find((p) => !p.isSystem && p.status === 'active' && p.rules.length > 0)!
    const orphan: Policy = {
      ...live,
      appIds: [],
      pendingDraft: { rules: [], savedAt: 'Just now', savedBy: 'You' },
    }
    const out = settled(orphan)
    expect(out.status).toBe('draft')
    expect(out.rules).toEqual([])
    expect(out.pendingDraft).toBeUndefined()
    expect(settled(live)).toBe(live)
    const system = seedPolicies.find((p) => p.isSystem)!
    expect(settled(system)).toBe(system)
  })
})
