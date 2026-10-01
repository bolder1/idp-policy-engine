import { describe, expect, it } from 'vitest'

import { FALLBACK_NAME, type Rule } from './data'
import { CATALOGUE, VERSION_OPS, alwaysOn, isRuleValue, profileIssue } from './fingerprint'
import { showcaseTenant } from './fixtures'
import { LOGO_SOURCES } from './logos/sources'
import { AUTH_METHODS } from './methods'
import { POLICY_NAME_MAX, policyNameIssue } from './policy-name'
import { leaves } from './predicate'
import { buildTemplate } from './screens/board/apply-template'
import { diagnose } from './screens/diagnostics'
import { METHODS } from './screens/rule-form'
import { SIM_USERS, decide, rawEnv, type SimContext } from './screens/simulate'
import { ADMIN_ACCOUNT } from './store'
import { validateZone } from './screens/zone-validation'

/* -----------------------------------------------------------------------------
   The showcase tenant (showcase-seed.ts) is what the presentation build opens
   on, and none of the legacy-estate tests read it. So the same promises, made
   here: every reference resolves, the linter has nothing to say, every library
   object passes its own page's validation, and the templates apply cleanly.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const library = { zones: t.zones, fingerprints: t.fingerprints }
const zoneIds = new Set(t.zones.map((z) => z.id))
const profileIds = new Set(t.fingerprints.map((p) => p.id))
const groupIds = new Set(t.groups.map((g) => g.id))
const userIds = new Set(t.directory.people.map((u) => u.id))
const appIds = new Set(t.apps.map((a) => a.id))

const allRules = (rules: Rule[], fallback?: Rule) => (fallback ? [...rules, fallback] : rules)
const authored = t.policies.filter((p) => !p.isSystem)
const templateRules = t.scenarios.flatMap((s) => s.rules.map((spec) => spec.build()))

describe('the showcase policies', () => {
  /* Then the troubleshooting estate (30 Sep 2026): three on AWS, two on
     Slack, a draft on GitHub — after the scenarios, so no scenario moves.
     Then the owner's two-group example (1 Oct 2026: "Tanmay is in 2 groups
     … Engineering … password as first factor … Design … 2FA"): a Box policy
     per group, Engineering's first, last so nothing above them moves. */
  it('are the system default, the four scenarios, the troubleshooting estate and the two Box policies, in that order', () => {
    expect(t.policies.map((p) => p.id)).toEqual([
      'global-default',
      'sc-hrms-office',
      'sc-corporate-devices',
      'sc-device-compliance',
      'sc-dev-tools',
      'sc-aws-engineering',
      'sc-aws-finance',
      'sc-aws-devops',
      'sc-slack-everyone',
      'sc-slack-engineering',
      'sc-code-review-finance',
      'sc-box-engineering',
      'sc-box-design',
    ])
    expect(t.policies.filter((p) => p.isSystem)).toHaveLength(1)
  })

  /* HRMS opens Inactive, so the pitch starts on a policy that is built and not
     yet on (Phase 4): Try reads "Today | Stored version", and Turn on runs
     Before turning on. The other three are live. Code review for Finance is
     a draft: the policy that would change nothing if turned on. */
  it('are live but for HRMS, which opens off, and the Code review draft, each on applications the tenant has', () => {
    expect(t.policies.map((p) => [p.id, p.status])).toEqual([
      ['global-default', 'always-on'],
      ['sc-hrms-office', 'inactive'],
      ['sc-corporate-devices', 'active'],
      ['sc-device-compliance', 'active'],
      ['sc-dev-tools', 'active'],
      ['sc-aws-engineering', 'active'],
      ['sc-aws-finance', 'active'],
      ['sc-aws-devops', 'active'],
      ['sc-slack-everyone', 'active'],
      ['sc-slack-engineering', 'active'],
      ['sc-code-review-finance', 'draft'],
      ['sc-box-engineering', 'active'],
      ['sc-box-design', 'active'],
    ])
    for (const p of authored) {
      expect(p.appIds.length, p.id).toBeGreaterThan(0)
      for (const id of p.appIds) expect(appIds.has(id), `${p.id} → ${id}`).toBe(true)
    }
  })

  it('have names the rename field accepts', () => {
    for (const p of t.policies) {
      expect(p.name.length, p.id).toBeLessThanOrEqual(POLICY_NAME_MAX)
      expect(policyNameIssue(p.name, t.policies, p.id), p.id).toBeNull()
    }
  })

  it('name only zones, device profiles, groups and people the tenant has', () => {
    /* The Global Default too, since its baseline names a zone and a profile. */
    for (const p of t.policies) {
      for (const id of p.audience.groupIds) expect(groupIds.has(id), `${p.id} audience ${id}`).toBe(true)
      for (const id of p.audience.userIds) expect(userIds.has(id), `${p.id} audience ${id}`).toBe(true)
      for (const r of allRules(p.rules, p.fallback)) {
        for (const id of r.who?.groupIds ?? []) expect(groupIds.has(id), `${r.name} who ${id}`).toBe(true)
        for (const id of r.who?.userIds ?? []) expect(userIds.has(id), `${r.name} who ${id}`).toBe(true)
        for (const c of leaves(r.when)) {
          if (c.typeId === 'zone') for (const v of c.values) expect(zoneIds.has(v), `${r.name} zone ${v}`).toBe(true)
          if (c.typeId === 'fingerprint') for (const v of c.values) expect(profileIds.has(v), `${r.name} profile ${v}`).toBe(true)
        }
      }
    }
  })

  it('give the linter nothing to report — no error, warning or note', () => {
    for (const p of t.policies) {
      const found = diagnose(p, t.groups, t.hooks, t.directory.people, library)
      expect(found.map((d) => `${d.code} ${d.title}`), p.id).toEqual([])
    }
  })

  it('end in a Deny with its own message', () => {
    for (const p of authored) {
      expect(p.fallback?.name, p.id).toBe(FALLBACK_NAME)
      expect(p.fallback?.decision, p.id).toBe('deny')
      expect(p.fallback?.denyMessage?.trim().length, p.id).toBeGreaterThan(0)
    }
  })
})

/* The owner, 30 Sep 2026: the Global Default was "allow everything and
   everyone". It keeps its system contract and gets a baseline: the operating
   countries on a corporate laptop are a password, any other device there adds
   OTP over Email, and the last row refuses everything else. */
describe('the Global Default', () => {
  const gd = t.policies.find((p) => p.isSystem)!
  const leafIds = (r: Rule) => leaves(r.when).map((c) => `${c.typeId} ${c.operator} ${c.values.join(',')}`)

  it('is still the one system policy: always on, every application, everyone', () => {
    expect(gd).toMatchObject({ id: 'global-default', status: 'always-on', appIds: [], isSystem: true })
    expect(gd.audience.everyone).toBe(true)
  })

  it('lets a corporate laptop in the operating countries in on a password, and asks any other device there for OTP over Email', () => {
    expect(gd.rules.map((r) => [r.name, r.decision, r.firstFactor, r.secondFactorMethods ?? []])).toEqual([
      ['Corporate device, where we operate', '1fa', 'Password', []],
      ['Any other device, where we operate', '2fa', 'Password', ['OTP over Email']],
    ])
    expect(leafIds(gd.rules[0])).toEqual(['zone in zone operating-countries', 'fingerprint matches fp-corp-devices'])
    expect(leafIds(gd.rules[1])).toEqual(['zone in zone operating-countries'])
    for (const r of gd.rules) expect(r.who, r.name).toBeUndefined()
    /* A method the tenant has switched on. */
    const otp = t.methods.find((m) => m.name === 'OTP over Email')!
    expect([otp.configured, otp.active]).toEqual([true, true])
  })

  it('refuses everything else by its last row, with a plain message', () => {
    expect(gd.fallback?.name).toBe(FALLBACK_NAME)
    expect(gd.fallback?.decision).toBe('deny')
    expect(gd.fallback?.denyMessage).toBe('Sign-ins from outside the countries we work in are blocked. Contact your IT team.')
  })

  it('reads the countries the company works in, where its people sign in from', () => {
    const zone = t.zones.find((z) => z.id === 'operating-countries')!
    expect(zone).toMatchObject({ name: 'Operating countries', kind: 'allowed', ip: [], asn: [] })
    expect(zone.location.countries).toEqual(['India', 'United Kingdom'])
  })
})

describe('scene 2: one rule per risk band, on a corporate device', () => {
  const policy = t.policies.find((p) => p.id === 'sc-corporate-devices')!
  const finance = SIM_USERS.find((u) => u.groupId === 'finance')!
  const ctx = (risk: string, device = 'Managed (MDM)'): SimContext => ({
    user: finance,
    place: 'Office Network',
    device,
    authState: 'Normal returning user',
    risk,
    nowMinutes: 600,
  })

  it('lets low risk in on a password, asks medium for an OTP, and refuses high', () => {
    expect(decide(policy, ctx('Low'), rawEnv)).toMatchObject({ decision: '1fa', hitIndex: 0 })
    expect(decide(policy, ctx('Medium'), rawEnv)).toMatchObject({ decision: '2fa', hitIndex: 1 })
    expect(decide(policy, ctx('High'), rawEnv)).toMatchObject({ decision: 'deny', hitIndex: 2 })
  })

  it('refuses a device it does not recognise, whatever the risk', () => {
    expect(decide(policy, ctx('Low', 'New / unknown'), rawEnv)).toMatchObject({ decision: 'deny', hitIndex: null })
  })
})

describe('the showcase library', () => {
  it('has zones that pass the zone page with no error or warning', () => {
    for (const z of t.zones) {
      const others = t.zones.filter((o) => o.id !== z.id).map((o) => o.name)
      /* Notes are fine: a location-only zone is told it matches any network. */
      expect(validateZone(z, others).filter((i) => i.level !== 'info'), z.id).toEqual([])
    }
  })

  it('has device profiles that save as they are', () => {
    for (const p of t.fingerprints) {
      const others = t.fingerprints.filter((o) => o.id !== p.id).map((o) => o.name)
      expect(profileIssue(p, others), p.id).toBeNull()
    }
  })

  it('has profiles built from their own catalogue, at a reach that can read it', () => {
    for (const p of t.fingerprints) {
      const catalogue = CATALOGUE[p.mode]
      for (const id of p.enabled) {
        const a = catalogue.find((x) => x.id === id)
        expect(a, `${p.id} ${id}`).toBeDefined()
        if (a?.needsAgent) expect(p.reach, `${p.id} ${id} needs the agent`).toBe('agent')
      }
      for (const a of alwaysOn(p.mode)) expect(p.enabled, `${p.id} ${a.id}`).toContain(a.id)
      for (const id of Object.keys(p.config)) expect(p.enabled, `${p.id} config ${id}`).toContain(id)
    }
  })

  it('draws every version floor from the listed releases, and every choice from its options', () => {
    for (const p of t.fingerprints) {
      for (const [id, v] of Object.entries(p.config)) {
        const cfg = CATALOGUE[p.mode].find((a) => a.id === id)?.config
        if (cfg?.kind === 'version' && isRuleValue(v)) {
          expect(VERSION_OPS.map((o) => o.id), `${p.id} ${id}`).toContain(v.op)
          if (cfg.versions) expect(cfg.versions.map((x) => x.value), `${p.id} ${id}`).toContain(v.value)
        }
        if (cfg?.kind === 'choice') expect(cfg.options, `${p.id} ${id}`).toContain(v)
      }
    }
  })

  it('holds the agent-based profile to two devices a person', () => {
    const corp = t.fingerprints.find((p) => p.id === 'fp-corp-devices')!
    expect(corp).toMatchObject({ mode: 'device', reach: 'agent', registration: 'self', maxDevices: 2, restrictionSet: true })
  })

  it('keeps the people who hold the seeded display tokens', () => {
    for (const tok of t.tokens) if (tok.userId) expect(userIds.has(tok.userId), tok.serial).toBe(true)
  })

  it('keeps the board tour’s demo group', () => {
    expect(groupIds.has('finance')).toBe(true)
  })

  /* The admin at the console is a directory person here, so a sign-in as
     "you" resolves (Describe it's You check, and the guard's own sign-ins):
     one IT Admin more, and the last person listed. */
  it('lists the admin at the console, in IT Admins', () => {
    const admin = t.directory.people.find((u) => u.id === ADMIN_ACCOUNT.id)
    expect(admin).toMatchObject({ name: ADMIN_ACCOUNT.name, groupId: 'it-admins' })
    expect(t.directory.people.at(-1)?.id).toBe(ADMIN_ACCOUNT.id)
    expect(t.directory.people.filter((u) => u.groupId === 'it-admins').map((u) => u.name)).toEqual([
      'Ravi Menon',
      'Clara Boucher',
      'Yusuf Demir',
      'Bethany Cole',
      'Omar Haddadi',
      'Jaspreet Toor',
    ])
  })

  it('shows a logo for every scenario app that has one', () => {
    const marked = new Set(LOGO_SOURCES.flatMap((s) => [s.id, ...(s.aliases ?? [])]))
    for (const id of ['outlook', 'dropbox', 'github', 'jira', 'google-workspace']) expect(marked.has(id), id).toBe(true)
  })
})

describe('the showcase templates', () => {
  it('are all shipped, and cover every category the template sheet offers', () => {
    expect(t.scenarios.every((s) => s.provided)).toBe(true)
    const cats = new Set(t.scenarios.map((s) => s.category))
    for (const c of ['Quick Protection', 'Device-based', 'Risk-based', 'Compliance']) expect(cats.has(c as never), c).toBe(true)
    expect(new Set(t.scenarios.map((s) => s.id)).size).toBe(t.scenarios.length)
  })

  it('fit the card', () => {
    for (const s of t.scenarios) {
      expect(s.name.length, s.id).toBeLessThanOrEqual(42)
      expect(s.description.length, s.id).toBeLessThanOrEqual(132)
      for (const spec of s.rules) {
        expect(spec.name.length, spec.name).toBeLessThanOrEqual(42)
        expect(spec.ifText.length, spec.name).toBeLessThanOrEqual(64)
      }
    }
  })

  it('say on the card what they build', () => {
    for (const s of t.scenarios) {
      for (const spec of s.rules) {
        const built = spec.build()
        expect(built.name, s.id).toBe(spec.name)
        expect(built.decision, s.id).toBe(spec.decision)
      }
    }
  })

  it('apply with nothing left out and nothing missing', () => {
    for (const s of t.scenarios) {
      const { rules, dropped, needs } = buildTemplate(s, t.directory.people, library)
      expect(rules, s.id).toHaveLength(s.rules.length)
      expect(dropped, s.id).toEqual([])
      expect(needs, s.id).toEqual([])
    }
  })
})

describe('the rule methods', () => {
  it('are the Authentication methods page’s own names', () => {
    const names = new Set(AUTH_METHODS.map((m) => m.name))
    for (const m of METHODS) expect(names.has(m), m).toBe(true)
  })

  it('cover every method a showcase rule or template names, so the picker ticks it', () => {
    for (const r of [...t.policies.flatMap((p) => allRules(p.rules, p.fallback)), ...templateRules]) {
      for (const m of r.secondFactorMethods ?? []) expect(METHODS, r.name).toContain(m)
      if (r.firstFactorMethod) expect(METHODS, r.name).toContain(r.firstFactorMethod)
    }
  })
})
