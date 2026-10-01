import { describe, expect, it } from 'vitest'

import { EVERYONE, audienceOf, card, cond, memberGroupIds, rule, when, type Policy, type Rule, type User } from '../../data'
import { showcaseTenant, showcaseTenantHrmsOn, type Tenant } from '../../fixtures'
import { personOf, type SignInFacts } from '../simulate'
import { devicePreset, type DevicePresetId } from '../testing/device-presets'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { TENANT_TZ } from '../sign-in-facts'
import { asEachGroup, audienceViaOf, conflictsOf, personGroupsOf, viaOf, type SignInConflicts } from './conflicts'
import { eachGroupRows, heroFinding, whyItems } from './journey'
import { GROUP_PREFIX, personPick, personPickerOptions } from './sign-in-card'

/* -----------------------------------------------------------------------------
   The troubleshooting model (TESTING-V4 §13, conflicts.ts), on the showcase
   tenant. One describe per row of the troubleshooting matrix — each a saved
   sign-in one click away — pinning three things: what the engine decides, what
   the model reports beside it, and the words the run will say. Then proof that
   every fix it suggests does what it says, the rough cases, and the sweeps that
   keep it honest against the resolver.
   -------------------------------------------------------------------------- */

const MONDAY = { date: '2026-09-28', time: '09:30', timeZone: TENANT_TZ, source: 'stated' } as const
const BRANCH = { address: '198.51.100.20', source: 'stated' } as const
const HOME = { address: '192.0.2.10', source: 'stated' } as const
const LONDON = { address: '192.0.2.200', source: 'stated' } as const

const factsFor = (personId: string, appId: string, network: SignInFacts['network'], device?: DevicePresetId): SignInFacts => ({
  personId,
  appId,
  network,
  when: MONDAY,
  ...(device ? { device: devicePreset(device).facts } : null),
})

function judge(t: Tenant, facts: SignInFacts, substitute?: Policy) {
  const env = envOf(t)
  const res = resolveSignIn(t.policies, facts, env, substitute ? { substitute } : {})
  const c = conflictsOf({ res, policies: t.policies, facts, env, substitute })
  const g = asEachGroup({ policies: t.policies, facts, env, substitute, res })
  return { res, c, g, env }
}

const savedFacts = (t: Tenant, id: string) => t.savedSignIns.find((x) => x.id === id)!.facts
const policyOf = (t: Tenant, id: string) => t.policies.find((p) => p.id === id)!
const withPolicy = (t: Tenant, p: Policy): Tenant => ({ ...t, policies: t.policies.map((x) => (x.id === p.id ? p : x)) })
const withPerson = (t: Tenant, id: string, patch: Partial<User>): Tenant => ({
  ...t,
  directory: { ...t.directory, people: t.directory.people.map((u) => (u.id === id ? { ...u, ...patch } : u)) },
})
/** Rule `from` moved to just above rule `to` (both 0-based), as the board's Move up would leave it. */
const moveAbove = (p: Policy, from: number, to: number): Policy => {
  const rules = [...p.rules]
  const [r] = rules.splice(from, 1)
  rules.splice(to, 0, r)
  return { ...p, rules }
}
const kinds = (c: SignInConflicts) => c.findings.map((f) => [f.kind, f.tone])

// --- The seed ---------------------------------------------------------------------------

describe('the seed: the people, policies and saved sign-ins the cases need', () => {
  const t = showcaseTenant()
  const env = envOf(t)

  /* And Tanmay Joshi in Engineering and Design — the owner's own example (1 Oct 2026). */
  it('Maya Iyer is in Engineering and Finance; Leo Fernandes, a contract engineer, in Engineering and Contractors; Tanmay Joshi in Engineering and Design; nobody else is in two', () => {
    const maya = t.directory.people.find((u) => u.id === 'u-maya')!
    expect(maya).toMatchObject({ name: 'Maya Iyer', email: 'maya.i@mo.com', groupId: 'engineering' })
    expect(memberGroupIds(maya)).toEqual(['engineering', 'finance'])
    expect(personGroupsOf(personOf('u-maya', env), env)).toEqual([
      { id: 'engineering', name: 'Engineering' },
      { id: 'finance', name: 'Finance' },
    ])
    const leo = t.directory.people.find((u) => u.id === 'u-leo')!
    expect(leo).toMatchObject({ name: 'Leo Fernandes', email: 'leo.f@ext.com', userType: 'Contractor' })
    expect(memberGroupIds(leo)).toEqual(['engineering', 'contractors'])
    const tanmay = t.directory.people.find((u) => u.id === 'u-tanmay')!
    expect(tanmay).toMatchObject({ name: 'Tanmay Joshi', email: 'tanmay.j@mo.com', groupId: 'engineering', userType: 'Employee' })
    expect(memberGroupIds(tanmay)).toEqual(['engineering', 'design'])
    expect(t.directory.people.filter((u) => memberGroupIds(u).length > 1).map((u) => u.id)).toEqual(['u-maya', 'u-leo', 'u-tanmay'])
  })

  it('Developer tools: the Engineering password rule comes before the Finance 2FA rule', () => {
    const dev = policyOf(t, 'sc-dev-tools')
    expect(dev.appIds).toContain('github')
    expect(dev.audience.groupIds).toEqual(['engineering', 'devops', 'finance'])
    expect(dev.rules.map((r) => [r.name, r.who?.groupIds, r.decision])).toEqual([
      ['In the office on a compliant device', ['engineering', 'devops'], '1fa'],
      ['Compliant device, working remotely', ['engineering', 'devops'], '2fa'],
      ['Finance, on a compliant device', ['finance'], '2fa'],
    ])
    expect(dev.rules[2]).toMatchObject({ firstFactor: 'Password', secondFactor: 'specific', secondFactorMethods: ['Google Authenticator'] })
  })

  it('AWS: three live policies — Engineering (with DevOps and contractors) first, then Finance, then DevOps', () => {
    const aws = t.policies.filter((p) => p.appIds.includes('aws'))
    expect(aws.map((p) => [p.id, p.name, p.status, p.audience.groupIds])).toEqual([
      ['sc-aws-engineering', 'AWS for engineering teams', 'active', ['engineering', 'devops', 'contractors']],
      ['sc-aws-finance', 'AWS billing for Finance', 'active', ['finance']],
      ['sc-aws-devops', 'AWS production for DevOps', 'active', ['devops']],
    ])
    expect(aws[0].rules.map((r) => [r.name, r.who?.groupIds, r.decision])).toEqual([
      ['Contractors away from the office', ['contractors'], 'deny'],
      ['Engineers on a compliant device', ['engineering', 'devops'], '1fa'],
      ['Contractors in the office', ['contractors'], '2fa'],
    ])
    expect(aws[1].rules.map((r) => [r.name, r.who?.userIds ?? [], r.decision])).toEqual([
      ['Compliant device', [], '2fa'],
      ['Thomas Byrne — access ends Friday', ['u-fin-4'], 'deny'],
    ])
  })

  it('Slack: a policy for everyone first in the list, then one for Engineering and Contractors whose Engineering rule takes Contractors back out', () => {
    const slack = t.policies.filter((p) => p.appIds.includes('slack'))
    expect(slack.map((p) => [p.id, p.audience.everyone, p.audience.groupIds])).toEqual([
      ['sc-slack-everyone', true, []],
      ['sc-slack-engineering', false, ['engineering', 'contractors']],
    ])
    expect(slack[1].rules[0].who).toEqual({ groupIds: ['engineering'], userIds: [], exceptGroupIds: ['contractors'] })
  })

  it('Code review for Finance is a draft for Finance on GitHub, after Developer tools', () => {
    const cr = policyOf(t, 'sc-code-review-finance')
    expect(cr).toMatchObject({ status: 'draft', appIds: ['github'], audience: { everyone: false, groupIds: ['finance'], userIds: [] } })
    expect(t.policies.findIndex((p) => p.id === 'sc-code-review-finance')).toBeGreaterThan(t.policies.findIndex((p) => p.id === 'sc-dev-tools'))
  })

  it('saves one sign-in per case, named for it, each expecting what the engine really decides', () => {
    const cases = [
      ['ssi-maya-github', 'Maya Iyer on GitHub — Engineering and Finance', '1fa'],
      ['ssi-maya-london', 'Maya Iyer on GitHub from London — same answer', '2fa'],
      ['ssi-maya-aws', 'Maya Iyer on AWS — two policies cover her', '1fa'],
      ['ssi-tom-aws', 'Tom Whelan on AWS — two policies for DevOps', '1fa'],
      ['ssi-devon-slack', 'Devon Rao on Slack — a group policy before Everyone', '2fa'],
      ['ssi-leo-slack', 'Leo Fernandes on Slack — left out by an exception', '2fa'],
      ['ssi-leo-aws', 'Leo Fernandes on AWS from London — a Deny comes first', 'deny'],
      ['ssi-thomas-aws', 'Thomas Byrne on AWS — named in a later Deny', '2fa'],
      ['ssi-priya-github', 'Priya Sharma on GitHub — a draft that would not decide', '2fa'],
      ['ssi-ravi-aws', 'Ravi Menon on AWS — no AWS policy covers IT Admins', '1fa'],
    ] as const
    for (const [id, name, expected] of cases) {
      const s = t.savedSignIns.find((x) => x.id === id)!
      expect([s.name, s.expected, s.level], id).toEqual([name, expected, 'note'])
      const { res } = judge(t, s.facts)
      expect(`${res.status} ${res.decision}`, id).toBe(`decided ${expected}`)
    }
  })
})

// --- The matrix: one case per saved sign-in ------------------------------------------------

describe('(a) one policy, two rules for her two groups — Maya Iyer on GitHub', () => {
  const t = showcaseTenant()
  const { res, c, g } = judge(t, savedFacts(t, 'ssi-maya-github'))
  const dev = policyOf(t, 'sc-dev-tools')

  it('the engine: Developer tools, rule 1, via Engineering, on a password', () => {
    expect(res.decidedBy?.policyId).toBe('sc-dev-tools')
    expect(res.trace?.hitIndex).toBe(0)
    expect(c.policyId).toBe('sc-dev-tools')
    expect(c.landing).toMatchObject({ ruleId: dev.rules[0].id, number: 1, ask: { decision: '1fa', words: 'Allow on 1 factor', first: 'Password', second: null } })
    expect(c.landing?.via).toMatchObject({ matches: true, kind: 'groups', label: 'Engineering', say: 'via Engineering' })
    expect(c.landing?.ask.flow.map((s) => s.label)).toEqual(['Password', 'Signed in'])
  })

  it('exactly one rule conflict: rule 3, via Finance, Allow with 2FA against Allow on 1 factor', () => {
    expect(c.conflicts).toHaveLength(1)
    const [x] = c.conflicts
    expect(x).toMatchObject({
      ruleId: dev.rules[2].id,
      number: 3,
      name: 'Finance, on a compliant device',
      match: 'yes',
      decisionDiffers: true,
      otherRoute: true,
      kind: 'conflict',
      strictness: 'stricter',
      notUsed: 'Not used — rule 1 matched first',
      fix: 'Move it above rule 1 to ask Finance for 2FA',
      caution: '',
    })
    expect(x.via).toMatchObject({ matches: true, kind: 'groups', groups: [{ id: 'finance', name: 'Finance' }], label: 'Finance', say: 'via Finance' })
    expect(x.ask).toMatchObject({ decision: '2fa', words: 'Allow with 2FA', first: 'Password', second: 'Google Authenticator' })
    expect(x.ask.flow.map((s) => s.label)).toEqual(['Password', 'Google Authenticator', 'Signed in'])
  })

  it('rule 2 also matches, for the same Engineering she landed by: quiet, not a conflict', () => {
    expect(c.rules.map((r) => [r.number, r.kind, r.via.label])).toEqual([
      [2, 'also-matches', 'Engineering'],
      [3, 'conflict', 'Finance'],
    ])
    expect(c.rules[0]).toMatchObject({ decisionDiffers: true, otherRoute: false, fix: '' })
  })

  it('says it: who she is, which rule applies first, why, and the fix', () => {
    expect(c.personName).toBe('Maya Iyer')
    expect(c.groups.map((x) => x.name)).toEqual(['Engineering', 'Finance'])
    expect(c.findings[0]).toEqual({
      kind: 'rule-conflict',
      tone: 'conflict',
      title: 'Rule 3 also applies to Maya Iyer · via Finance',
      line: "Maya Iyer is in Engineering and Finance — Engineering's rule applies first",
      why: 'Rule 1 matched first via Engineering, and the first rule that matches decides',
      fix: 'Move it above rule 1 to ask Finance for 2FA',
      caution: '',
      target: { policyId: 'sc-dev-tools', ruleId: dev.rules[2].id },
      fixAt: { policyId: 'sc-dev-tools', ruleId: dev.rules[2].id },
    })
    expect(c.line).toBe("Maya Iyer is in Engineering and Finance — Engineering's rule applies first")
    expect(c.headline).toBe(c.line)
    expect(c.policies).toEqual([])
    expect(c.any).toBe(true)
  })

  it('as each group: Engineering alone gets rule 1, Finance alone rule 3, Maya rule 1', () => {
    expect(g.rows.map((r) => [r.label, r.policyId, r.ruleNumber, r.words, r.same])).toEqual([
      ['As Engineering', 'sc-dev-tools', 1, 'Allow on 1 factor', true],
      ['As Finance', 'sc-dev-tools', 3, 'Allow with 2FA', false],
      ['As Maya (both)', 'sc-dev-tools', 1, 'Allow on 1 factor', true],
    ])
    expect(g.differs).toBe(true)
    expect(g.follows).toEqual([{ id: 'engineering', name: 'Engineering' }])
    expect(g.line).toBe("As Engineering: Allow on 1 factor · As Finance: Allow with 2FA · As Maya (both): Allow on 1 factor — Engineering's rule comes first")
  })

  it('and, quietly last: the Code review draft for Finance would change nothing', () => {
    expect(kinds(c)).toEqual([
      ['rule-conflict', 'conflict'],
      ['off-no-change', 'info'],
    ])
  })
})

describe('(b) two policies, different groups — Maya Iyer on AWS', () => {
  const t = showcaseTenant()
  const { res, c, g } = judge(t, savedFacts(t, 'ssi-maya-aws'))

  it('the engine: AWS for engineering teams decides, higher in the list — both are bound to groups, so the tier ties', () => {
    expect(res.decidedBy?.policyId).toBe('sc-aws-engineering')
    expect(res.trace?.hitIndex).toBe(1)
    expect(res.decision).toBe('1fa')
    expect(res.standings.find((s) => s.policyId === 'sc-aws-finance')?.kind).toBe('same-app-and-group')
    expect(c.rules).toEqual([])
  })

  it('reports AWS billing for Finance: through Finance, while the one deciding covers her through Engineering, and it would ask for 2FA', () => {
    expect(c.policies).toHaveLength(1)
    expect(c.policies[0]).toMatchObject({
      policyId: 'sc-aws-finance',
      standing: 'same-app-and-group',
      tier: 'custom',
      via: { kind: 'groups', label: 'Finance' },
      deciderVia: { kind: 'groups', label: 'Engineering' },
      sameGroup: false,
      status: 'decided',
      decision: '2fa',
      ruleNumber: 1,
      ruleName: 'Compliant device',
      decisionDiffers: true,
      notUsed: 'Not used — AWS for engineering teams comes first',
      why: 'Maya Iyer is in Finance for this one and Engineering for AWS for engineering teams. One policy applies to a person on an application: the one higher in the list',
      fix: 'Add a rule that names Maya Iyer to AWS for engineering teams, above rule 2',
    })
  })

  it('says it', () => {
    expect(c.findings[0]).toMatchObject({
      kind: 'policy-conflict',
      tone: 'conflict',
      title: 'AWS billing for Finance would allow with 2FA · via Finance',
      line: 'Maya Iyer is in Engineering and Finance — AWS for engineering teams applies first',
      target: { policyId: 'sc-aws-finance', ruleId: null },
      /* The fix is made where it says: the policy that decides, at the rule it adds one above. */
      fixAt: { policyId: 'sc-aws-engineering', ruleId: policyOf(t, 'sc-aws-engineering').rules[1].id },
    })
    expect(c.line).toBe('Maya Iyer is in Engineering and Finance — AWS for engineering teams applies first')
    expect(c.any).toBe(true)
  })

  it('as each group: a member of Finance alone gets AWS billing; Maya gets the Engineering policy, higher in the list', () => {
    expect(g.rows.map((r) => [r.label, r.policyName, r.words])).toEqual([
      ['As Engineering', 'AWS for engineering teams', 'Allow on 1 factor'],
      ['As Finance', 'AWS billing for Finance', 'Allow with 2FA'],
      ['As Maya (both)', 'AWS for engineering teams', 'Allow on 1 factor'],
    ])
    expect(g.line).toBe('As Engineering: Allow on 1 factor · As Finance: Allow with 2FA · As Maya (both): Allow on 1 factor — AWS for engineering teams is higher in the list')
  })
})

/* The owner's own example (1 Oct 2026): "think someone called Tanmay is in 2
   groups, one is Engineering group and one is Design group. For Engineering
   there is a different policy like sign in with password as first factor, but
   for the Design group it's sign in with 2FA … how do we fulfil this kind of
   use case?" Seeded as he said it, on Box (there is no Figma in the
   catalogue): a policy per group, Engineering's higher in the list. The case
   is Maya's on AWS with nothing else in the way — no third policy, no rule
   that names anybody — so this pins the answer the page gives him. */
describe("(b) the owner's case: a policy per group — Tanmay Joshi on Box", () => {
  const t = showcaseTenant()
  const facts = savedFacts(t, 'ssi-tanmay-box')
  const { res, c, g, env } = judge(t, facts)

  it('the seed: Design, two designers in Design alone, and two live Box policies — Engineering a password, Design 2FA, Engineering first', () => {
    expect(t.groups.find((x) => x.id === 'design')).toMatchObject({ name: 'Design' })
    expect(t.directory.people.filter((u) => memberGroupIds(u).includes('design')).map((u) => [u.name, memberGroupIds(u)])).toEqual([
      ['Ishita Banerjee', ['design']],
      ['Marcus Bell', ['design']],
      ['Tanmay Joshi', ['engineering', 'design']],
    ])
    const box = t.policies.filter((p) => p.appIds.includes('box'))
    expect(box.map((p) => [p.id, p.name, p.status, p.audience.groupIds])).toEqual([
      ['sc-box-engineering', 'Box for engineering', 'active', ['engineering']],
      ['sc-box-design', 'Box for design', 'active', ['design']],
    ])
    expect(box.map((p) => p.rules.map((r) => [r.name, r.decision, r.firstFactor, r.secondFactorMethods ?? []]))).toEqual([
      [['Engineers, where we operate', '1fa', 'Password', []]],
      [['Designers, where we operate', '2fa', 'Password', ['miniOrange Push']]],
    ])
    expect(t.savedSignIns.find((s) => s.id === 'ssi-tanmay-box')).toMatchObject({ name: 'Tanmay Joshi on Box — Engineering and Design', expected: '1fa', level: 'note' })
  })

  it('the engine: Box for engineering decides, on a password — both are bound to groups, so the tier ties and the list decides', () => {
    expect([res.status, res.decision, res.decidedBy?.policyId, res.trace?.hitIndex]).toEqual(['decided', '1fa', 'sc-box-engineering', 0])
    expect(res.standings.find((s) => s.policyId === 'sc-box-design')?.kind).toBe('same-app-and-group')
    expect(c.landing).toMatchObject({ number: 1, name: 'Engineers, where we operate', ask: { decision: '1fa', words: 'Allow on 1 factor', first: 'Password', second: null } })
    expect(c.rules).toEqual([])
  })

  it('reports Box for design: it covers him through Design, would ask for 2FA (a push), and is not used', () => {
    expect(c.policies).toHaveLength(1)
    expect(c.policies[0]).toMatchObject({
      policyId: 'sc-box-design',
      standing: 'same-app-and-group',
      tier: 'custom',
      via: { kind: 'groups', label: 'Design', say: 'via Design' },
      deciderVia: { kind: 'groups', label: 'Engineering' },
      sameGroup: false,
      status: 'decided',
      decision: '2fa',
      ruleNumber: 1,
      ruleName: 'Designers, where we operate',
      decisionDiffers: true,
      notUsed: 'Not used — Box for engineering comes first',
      why: 'Tanmay Joshi is in Design for this one and Engineering for Box for engineering. One policy applies to a person on an application: the one higher in the list',
      fix: 'Add a rule that names Tanmay Joshi to Box for engineering, above rule 1',
      caution: '',
    })
  })

  it('says it: one conflict, and the answer’s line names both groups and the policy that applies first', () => {
    expect(kinds(c)).toEqual([['policy-conflict', 'conflict']])
    expect(c.findings[0]).toEqual({
      kind: 'policy-conflict',
      tone: 'conflict',
      title: 'Box for design would allow with 2FA · via Design',
      line: 'Tanmay Joshi is in Engineering and Design — Box for engineering applies first',
      why: 'Tanmay Joshi is in Design for this one and Engineering for Box for engineering. One policy applies to a person on an application: the one higher in the list',
      fix: 'Add a rule that names Tanmay Joshi to Box for engineering, above rule 1',
      caution: '',
      target: { policyId: 'sc-box-design', ruleId: null },
      fixAt: { policyId: 'sc-box-engineering', ruleId: policyOf(t, 'sc-box-engineering').rules[0].id },
    })
    expect(c.headline).toBe('Tanmay Joshi is in Engineering and Design — Box for engineering applies first')
    expect(c.line).toBe(c.headline)
    expect(c.any).toBe(true)
    expect(c.groups).toEqual([
      { id: 'engineering', name: 'Engineering' },
      { id: 'design', name: 'Design' },
    ])
  })

  it('as each group: Engineering alone a password, Design alone 2FA, Tanmay the password — Box for engineering is higher in the list', () => {
    expect(g.rows.map((r) => [r.label, r.policyName, r.ruleNumber, r.words, r.same])).toEqual([
      ['As Engineering', 'Box for engineering', 1, 'Allow on 1 factor', true],
      ['As Design', 'Box for design', 1, 'Allow with 2FA', false],
      ['As Tanmay (both)', 'Box for engineering', 1, 'Allow on 1 factor', true],
    ])
    expect(g.differs).toBe(true)
    expect(g.follows).toEqual([{ id: 'engineering', name: 'Engineering' }])
    expect(g.line).toBe('As Engineering: Allow on 1 factor · As Design: Allow with 2FA · As Tanmay (both): Allow on 1 factor — Box for engineering is higher in the list')
  })

  it('on the page: the answer’s line, the why’s one item, and the As each group rows', () => {
    expect(heroFinding({ conflicts: c })).toEqual({ text: 'Tanmay Joshi is in Engineering and Design — Box for engineering applies first', tone: 'conflict' })
    expect(whyItems({ conflicts: c, rules: [] }).map((w) => [w.kind, w.link?.label, w.head, w.would?.decision, w.detail, w.action?.policyId])).toEqual([
      [
        'policy-conflict',
        'Box for design',
        'also covers Tanmay Joshi · via Design',
        '2fa',
        'Not used: Tanmay Joshi is in Design for this one and Engineering for Box for engineering. One policy applies to a person on an application: the one higher in the list',
        'sc-box-engineering',
      ],
    ])
    expect(eachGroupRows({ asEachGroup: g })?.map((r) => [r.label, r.groupId, r.words, r.source, r.current])).toEqual([
      ['As Engineering', 'engineering', 'Allow on 1 factor', 'Box for engineering · rule 1', false],
      ['As Design', 'design', 'Allow with 2FA', 'Box for design · rule 1', false],
      ['As Tanmay (both)', null, 'Allow on 1 factor', 'Box for engineering is higher in the list', true],
    ])
  })

  it('"Anyone in Design" alone gets 2FA from Box for design, and nothing else applies to them', () => {
    const { personId, asGroup } = personPick(`${GROUP_PREFIX}design`, t.directory.people)
    expect([personId, asGroup]).toEqual(['u-des-1', 'design'])
    const alone = judge(t, { ...facts, personId: personId! })
    expect([alone.res.decision, alone.res.decidedBy?.policyId, alone.res.trace?.hitIndex]).toEqual(['2fa', 'sc-box-design', 0])
    expect(alone.c.findings).toEqual([])
    /* And Anyone in Engineering alone: the password, from Box for engineering. */
    const eng = personPick(`${GROUP_PREFIX}engineering`, t.directory.people).personId!
    expect([judge(t, { ...facts, personId: eng }).res.decision, judge(t, { ...facts, personId: eng }).res.decidedBy?.policyId]).toEqual(['1fa', 'sc-box-engineering'])
  })

  it('the Person picker lists Tanmay with both his groups, and offers Anyone in Design', () => {
    const opts = personPickerOptions(t.directory.people, t.groups)
    expect(opts.find((o) => o.value === 'u-tanmay')).toMatchObject({ label: 'Tanmay Joshi', meta: 'Engineering, Design', group: 'People' })
    expect(opts.find((o) => o.value === `${GROUP_PREFIX}design`)).toMatchObject({ label: 'Anyone in Design', group: 'Groups' })
    expect(personGroupsOf(personOf('u-tanmay', env), env).map((x) => x.name)).toEqual(['Engineering', 'Design'])
  })

  it('the fix does what it says: a rule naming Tanmay in Box for engineering, above rule 1, gives him what Design would — and nobody else changes', () => {
    const eng = policyOf(t, 'sc-box-engineering')
    const design = policyOf(t, 'sc-box-design')
    const named: Rule = { ...design.rules[0], id: 'x-tanmay', name: 'Tanmay Joshi', who: { groupIds: [], userIds: ['u-tanmay'] } }
    const fixed = withPolicy(t, { ...eng, rules: [named, ...eng.rules] })
    const decide = (id: string) => {
      const r = resolveSignIn(fixed.policies, { ...facts, personId: id }, envOf(fixed))
      return [r.decidedBy?.policyId, r.decision]
    }
    expect(decide('u-tanmay')).toEqual(['sc-box-engineering', '2fa'])
    expect(decide('arun')).toEqual(['sc-box-engineering', '1fa'])
    expect(decide('u-des-1')).toEqual(['sc-box-design', '2fa'])
  })
})

describe('(b) two policies, the same group — Tom Whelan (DevOps) on AWS', () => {
  const t = showcaseTenant()
  const { res, c, g } = judge(t, savedFacts(t, 'ssi-tom-aws'))

  it('the engine: AWS for engineering teams, which covers DevOps too, decides on rule 2', () => {
    expect([res.decidedBy?.policyId, res.trace?.hitIndex, res.decision]).toEqual(['sc-aws-engineering', 1, '1fa'])
    expect(c.landing?.via.label).toBe('DevOps')
  })

  it('AWS production for DevOps covers him through the same group, and never decides for DevOps', () => {
    expect(c.policies.map((p) => [p.policyId, p.sameGroup, p.via.label, p.decision])).toEqual([['sc-aws-devops', true, 'DevOps', '2fa']])
    expect(c.findings[0]).toMatchObject({
      kind: 'same-group-policy',
      tone: 'conflict',
      title: 'AWS production for DevOps would allow with 2FA · via DevOps',
      line: 'Two AWS Console policies cover DevOps — AWS for engineering teams applies first',
      why: 'Both cover DevOps on AWS Console. One policy applies per application and group: the one higher in the list',
      /* A rule in the policy that decides — nothing in this build edits who a policy covers. */
      fix: 'Add a rule for DevOps to AWS for engineering teams, above rule 2, that asks for 2FA (miniOrange Push)',
      caution: '',
      fixAt: { policyId: 'sc-aws-engineering', ruleId: policyOf(t, 'sc-aws-engineering').rules[1].id },
    })
  })

  it('one group: nothing to compare', () => {
    expect(g.rows.map((r) => r.label)).toEqual(['As DevOps', 'As Tom Whelan'])
    expect(g.line).toBe('')
  })
})

describe("(b) a group's policy before everyone's — Devon Rao on Slack", () => {
  const t = showcaseTenant()
  const { res, c } = judge(t, savedFacts(t, 'ssi-devon-slack'))

  it('the engine: Slack for everyone is FIRST in the list, and Slack for engineering and contractors decides — the tier, not the order', () => {
    const at = (id: string) => t.policies.findIndex((p) => p.id === id)
    expect(at('sc-slack-everyone')).toBeLessThan(at('sc-slack-engineering'))
    expect([res.decidedBy?.policyId, res.trace?.hitIndex, res.decision]).toEqual(['sc-slack-engineering', 1, '2fa'])
    expect(res.standings.find((s) => s.policyId === 'sc-slack-everyone')?.kind).toBe('default-group-yields')
  })

  it('says why the everyone policy did not apply, in the info tone: this is by design, not a conflict', () => {
    expect(c.policies.map((p) => [p.policyId, p.tier, p.via.kind, p.decision, p.decisionDiffers, p.fix])).toEqual([['sc-slack-everyone', 'default-group', 'everyone', '1fa', true, '']])
    expect(c.findings).toEqual([
      {
        kind: 'group-policy-first',
        tone: 'info',
        title: 'Slack for everyone would allow on 1 factor · for everyone',
        line: 'Slack for everyone does not apply — a policy for Contractors comes first',
        why: 'A policy for Contractors comes before a policy for everyone, wherever it is in the list',
        fix: '',
        caution: '',
        target: { policyId: 'sc-slack-everyone', ruleId: null },
        fixAt: null,
      },
    ])
    expect(c.any).toBe(false)
    expect(c.line).toBe('')
    expect(c.headline).toBe('Slack for everyone does not apply — a policy for Contractors comes first')
  })
})

describe('(c) an exception on a rule her other group matches — Leo Fernandes on Slack', () => {
  const t = showcaseTenant()
  const { res, c, g } = judge(t, savedFacts(t, 'ssi-leo-slack'))
  const slack = policyOf(t, 'sc-slack-engineering')

  it('the engine: rule 1 (Engineering except Contractors) leaves him out, rule 2 (Contractors on a corporate device) decides', () => {
    expect([res.decidedBy?.policyId, res.trace?.hitIndex, res.decision]).toEqual(['sc-slack-engineering', 1, '2fa'])
    expect(res.trace?.steps[0]).toMatchObject({ who: 'out', whoReason: 'Contractors is an exception', match: 'no' })
  })

  it('reports the exception: in rule 1 through Engineering, out through Contractors, and its conditions held', () => {
    expect(c.exceptions).toHaveLength(1)
    expect(c.exceptions[0]).toMatchObject({
      ruleId: slack.rules[0].id,
      number: 1,
      includedBy: { kind: 'groups', label: 'Engineering' },
      exceptGroups: [{ id: 'contractors', name: 'Contractors' }],
      exceptNamed: false,
      exceptLabel: 'Contractors',
      conditions: 'yes',
      wouldHaveDecided: true,
      why: 'Rule 1 is for Engineering except Contractors. Leo Fernandes is in Engineering and in Contractors — an exception always wins.',
      fix: 'Add a rule that names Leo Fernandes above rule 1',
    })
    expect(c.exceptions[0].ask.words).toBe('Allow on 1 factor')
  })

  it('says it first, and the everyone policy after it', () => {
    expect(kinds(c)).toEqual([
      ['exception', 'conflict'],
      ['group-policy-first', 'info'],
    ])
    expect(c.findings[0]).toMatchObject({
      title: 'Rule 1 leaves Leo Fernandes out · Contractors is an exception',
      line: 'Contractors is an exception on rule 1, and Leo Fernandes is in Contractors',
      target: { policyId: 'sc-slack-engineering', ruleId: slack.rules[0].id },
    })
    expect(c.line).toBe('Contractors is an exception on rule 1, and Leo Fernandes is in Contractors')
    /* Not a rule conflict: rule 2 decided, and nothing after it matches. */
    expect(c.conflicts).toEqual([])
  })

  it('as each group: Engineering alone gets rule 1; together, the exception takes him to rule 2', () => {
    expect(g.rows.map((r) => [r.label, r.ruleNumber, r.words])).toEqual([
      ['As Engineering', 1, 'Allow on 1 factor'],
      ['As Contractors', 2, 'Allow with 2FA'],
      ['As Leo (both)', 2, 'Allow with 2FA'],
    ])
    expect(g.line).toBe('As Engineering: Allow on 1 factor · As Contractors: Allow with 2FA · As Leo (both): Allow with 2FA — Contractors is an exception on rule 1')
  })
})

describe('(d) named in a rule and covered through a group — Thomas Byrne on AWS', () => {
  const t = showcaseTenant()
  const { res, c } = judge(t, savedFacts(t, 'ssi-thomas-aws'))
  const fin = policyOf(t, 'sc-aws-finance')

  it('the engine: rule 1 (everyone in Finance) lets him in on a compliant device; the Deny that names him is rule 2', () => {
    expect([res.decidedBy?.policyId, res.trace?.hitIndex, res.decision]).toEqual(['sc-aws-finance', 0, '2fa'])
  })

  it('a conflict though he is in one group: naming somebody singles them out, and the broader rule above won', () => {
    expect(c.conflicts.map((x) => [x.number, x.via.kind, x.via.say, x.ask.decision, x.strictness, x.fix, x.caution])).toEqual([
      [2, 'person', 'by name', 'deny', 'stricter', 'Move it above rule 1 to refuse Thomas Byrne', ''],
    ])
    expect(c.findings[0]).toEqual({
      kind: 'named-later',
      tone: 'conflict',
      title: 'Rule 2 also applies to Thomas Byrne · by name',
      line: 'Thomas Byrne is named in rule 2 — rule 1 applies first',
      why: 'Naming Thomas Byrne does not move a rule up. Rule 1 matched first, and the first rule that matches decides',
      fix: 'Move it above rule 1 to refuse Thomas Byrne',
      caution: '',
      target: { policyId: 'sc-aws-finance', ruleId: fin.rules[1].id },
      fixAt: { policyId: 'sc-aws-finance', ruleId: fin.rules[1].id },
    })
  })

  it('on a device that fails rule 1, the Deny that names him decides, by name, and nothing else applies', () => {
    const off = judge(t, factsFor('u-fin-4', 'aws', BRANCH, 'win10'))
    expect([off.res.trace?.hitIndex, off.res.decision]).toEqual([1, 'deny'])
    expect(off.c.landing?.via).toMatchObject({ kind: 'person', say: 'by name' })
    expect(off.c.findings).toEqual([])
  })
})

describe('(e) a Deny above an allow, both matching — Leo Fernandes on AWS from London', () => {
  const t = showcaseTenant()
  const { res, c, g } = judge(t, savedFacts(t, 'ssi-leo-aws'))

  it('the engine: rule 1 refuses contractors away from the office; rule 2 would let Engineering in', () => {
    expect([res.decidedBy?.policyId, res.trace?.hitIndex, res.decision]).toEqual(['sc-aws-engineering', 0, 'deny'])
    expect(c.landing?.via.label).toBe('Contractors')
  })

  it('a conflict whose fix loosens access, so it says so', () => {
    expect(c.conflicts.map((x) => [x.number, x.via.label, x.ask.decision, x.strictness])).toEqual([[2, 'Engineering', '1fa', 'looser']])
    expect(c.findings[0]).toMatchObject({
      kind: 'deny-first',
      tone: 'conflict',
      title: 'Rule 2 also applies to Leo Fernandes · via Engineering',
      line: "Leo Fernandes is in Engineering and Contractors — Contractors' rule applies first",
      why: 'Rule 1 refuses Contractors first, and the first rule that matches decides',
      fix: 'Move it above rule 1 to let Engineering in on 1 factor',
      caution: 'It would let in people rule 1 refuses today',
    })
  })

  it("as each group: Contractors' Deny comes first", () => {
    expect(g.line).toBe("As Engineering: Allow on 1 factor · As Contractors: Deny · As Leo (both): Deny — Contractors' rule comes first")
  })

  it('in the office, rule 1 does not apply: rule 2 (Engineering) decides and rule 3 (contractors in the office) is the conflict', () => {
    const office = judge(t, factsFor('u-leo', 'aws', BRANCH, 'win11-registered')).c
    expect(office.landing).toMatchObject({ number: 2, via: { label: 'Engineering' } })
    expect(office.conflicts.map((x) => [x.number, x.via.label, x.fix])).toEqual([[3, 'Contractors', 'Move it above rule 2 to ask Contractors for 2FA']])
  })
})

describe('(f) a switched-off policy that would change it — Kavya Menon in the office', () => {
  const t = showcaseTenant()
  const { res, c } = judge(t, savedFacts(t, 'ssi-kavya-office'))

  it('the engine: HRMS is off, so the Global Default decides — why her 2FA promise fails today', () => {
    expect([res.decidedBy?.policyId, res.decision]).toEqual(['global-default', '1fa'])
    expect(t.savedSignIns.find((s) => s.id === 'ssi-kavya-office')?.expected).toBe('2fa')
  })

  it('reports what turning it on would do, alone: it would decide, on rule 1, with 2FA', () => {
    expect(c.off).toEqual([
      {
        policyId: 'sc-hrms-office',
        policyName: 'HRMS access from corporate offices',
        status: 'inactive',
        via: expect.objectContaining({ kind: 'groups', label: 'Human Resources' }),
        wouldDecide: true,
        then: { status: 'decided', decision: '2fa', possible: ['2fa'], policyId: 'sc-hrms-office', policyName: 'HRMS access from corporate offices', ruleNumber: 1, ruleName: 'In a corporate office' },
        changes: true,
        say: 'Switched off — on, it would decide Allow with 2FA (rule 1)',
      },
    ])
    expect(c.findings[0]).toMatchObject({
      kind: 'off-would-change',
      tone: 'info',
      line: 'HRMS access from corporate offices is off — on, it would allow with 2FA',
      fix: 'Turn it on to ask Kavya Menon for 2FA',
    })
  })

  it('once HRMS is on, it decides, and there is nothing off to report', () => {
    const on = showcaseTenantHrmsOn()
    const x = judge(on, savedFacts(on, 'ssi-kavya-office'))
    expect([x.res.decidedBy?.policyId, x.res.decision]).toEqual(['sc-hrms-office', '2fa'])
    expect(x.c.off).toEqual([])
  })
})

describe('(f) a draft that would change nothing — Priya Sharma on GitHub', () => {
  const t = showcaseTenant()
  const { res, c } = judge(t, savedFacts(t, 'ssi-priya-github'))

  it('the engine: Developer tools covers Finance and decides on rule 3', () => {
    expect([res.decidedBy?.policyId, res.trace?.hitIndex, res.decision]).toEqual(['sc-dev-tools', 2, '2fa'])
    expect(c.landing?.via.label).toBe('Finance')
  })

  it('the draft covers her, and on it would still not decide', () => {
    expect(c.off.map((o) => [o.policyId, o.status, o.via.label, o.wouldDecide, o.then.policyId, o.changes, o.say])).toEqual([
      ['sc-code-review-finance', 'draft', 'Finance', false, 'sc-dev-tools', false, 'Draft — on, it would change nothing: Developer tools — office and device checks comes first'],
    ])
    expect(c.findings).toEqual([
      expect.objectContaining({ kind: 'off-no-change', tone: 'info', line: 'Code review for Finance is a draft — on, it would change nothing', fix: '' }),
    ])
  })

  it('and it is true: turned on for real, Developer tools still decides every Finance sign-in on GitHub', () => {
    const on = withPolicy(t, { ...policyOf(t, 'sc-code-review-finance'), status: 'active' })
    for (const id of ['priya', 'u-fin-2', 'u-maya']) {
      const x = judge(on, factsFor(id, 'github', BRANCH, 'win11-registered'))
      expect(x.res.decidedBy?.policyId, id).toBe('sc-dev-tools')
    }
    /* Now live, it is a same-group policy conflict for Priya: it would give 1 factor. */
    const x = judge(on, savedFacts(t, 'ssi-priya-github'))
    expect(x.c.policies.map((p) => [p.policyId, p.sameGroup, p.decision])).toEqual([['sc-code-review-finance', true, '1fa']])
  })
})

describe('(g) a fact not stated — Maya Iyer on GitHub with the device taken off', () => {
  const t = showcaseTenant()
  const { device: _device, ...facts } = savedFacts(t, 'ssi-maya-github')
  const { res, c, g } = judge(t, facts)

  it("the engine: every Developer tools rule reads the device, so it can't tell", () => {
    expect(res.status).toBe('depends')
    expect(res.possible.map((o) => [o.decision, o.ruleIndex])).toEqual([
      ['1fa', 0],
      ['2fa', 1],
      ['2fa', 2],
      ['deny', null],
    ])
  })

  it('reports what it depends on and where each answer comes from, and names no conflict it has not earned', () => {
    expect(c.depends).toEqual({
      facts: expect.arrayContaining(['device.platform']),
      factWords: ['Device'],
      outcomes: [
        { decision: '1fa', words: 'Allow on 1 factor', ruleNumber: 1, ruleName: 'In the office on a compliant device' },
        { decision: '2fa', words: 'Allow with 2FA', ruleNumber: 2, ruleName: 'Compliant device, working remotely' },
        { decision: '2fa', words: 'Allow with 2FA', ruleNumber: 3, ruleName: 'Finance, on a compliant device' },
        { decision: 'deny', words: 'Deny', ruleNumber: null, ruleName: 'Nothing else matched' },
      ],
      say: 'Depends on the device: Allow on 1 factor, Allow with 2FA or Deny',
      fix: 'State the device to see which rule decides',
    })
    expect(c.conflicts).toEqual([])
    expect(c.findings[0]).toMatchObject({ kind: 'depends', line: 'Depends on the device — state it to see which rule decides' })
    expect(c.headline).toBe('Depends on the device — state it to see which rule decides')
    expect(c.any).toBe(false)
  })

  it("as each group: Can't tell for each, and why", () => {
    expect(g.rows.map((r) => r.words)).toEqual([
      "Can't tell (Allow on 1 factor, Allow with 2FA or Deny)",
      "Can't tell (Allow with 2FA or Deny)",
      "Can't tell (Allow on 1 factor, Allow with 2FA or Deny)",
    ])
    expect(g.why).toBe('it depends on the device')
  })
})

describe('(h) nobody covers them: the Global Default decides, by its own rules', () => {
  const t = showcaseTenant()

  it('Ravi Menon on AWS: three AWS policies, none for IT Admins', () => {
    const { res, c } = judge(t, savedFacts(t, 'ssi-ravi-aws'))
    expect([res.decidedBy?.policyId, res.trace?.hitIndex, res.decision]).toEqual(['global-default', 0, '1fa'])
    expect(c.missedBy.map((m) => [m.policyId, m.audience, m.say])).toEqual([
      ['sc-aws-engineering', 'Engineering, DevOps, Contractors', 'Covers Engineering, DevOps, Contractors'],
      ['sc-aws-finance', 'Finance', 'Covers Finance'],
      ['sc-aws-devops', 'DevOps', 'Covers DevOps'],
    ])
    /* His groups said once, then each policy by name and who it covers. No
       fix: none can take IT Admins in without changing who it covers, and
       nothing in this build edits that. */
    expect(c.findings).toEqual([
      expect.objectContaining({
        kind: 'not-covered',
        tone: 'info',
        title: '3 AWS Console policies do not cover Ravi Menon',
        line: 'No AWS Console policy covers Ravi Menon — the Global Default decides',
        why: 'Ravi Menon is in IT Admins. AWS for engineering teams covers Engineering, DevOps, Contractors. AWS billing for Finance covers Finance. AWS production for DevOps covers DevOps',
        fix: '',
        fixAt: null,
      }),
    ])
  })

  it('James Whitfield in Austin on Workday: no Workday policy at all, and the Global Default refuses the country', () => {
    const { res, c } = judge(t, savedFacts(t, 'ssi-james-austin'))
    expect([res.decidedBy?.policyId, res.trace?.hitIndex, res.decision]).toEqual(['global-default', null, 'deny'])
    expect(c.findings).toEqual([expect.objectContaining({ kind: 'not-covered', title: 'No policy on Workday', line: 'No Workday policy — the Global Default decides', fix: '' })])
  })

  it('the contractor on Jira: Developer tools covers Jira, not Contractors', () => {
    const { c } = judge(t, savedFacts(t, 'ssi-contractor-jira'))
    expect(c.findings[0]).toMatchObject({ kind: 'not-covered', line: 'No Jira policy covers Sam Okonkwo — the Global Default decides', fix: '' })
  })
})

describe('(i) the same decision, different factors — Maya Iyer on GitHub from London', () => {
  const t = showcaseTenant()
  const { res, c, g } = judge(t, savedFacts(t, 'ssi-maya-london'))

  it('the engine: rule 2 (Engineering, working remotely), a push', () => {
    expect([res.decidedBy?.policyId, res.trace?.hitIndex, res.decision]).toEqual(['sc-dev-tools', 1, '2fa'])
    expect(c.landing).toMatchObject({ number: 2, ask: { second: 'miniOrange Push' } })
  })

  it('rule 3 also applies via Finance: the same decision with another second factor — worth knowing, never a conflict', () => {
    expect(c.rules.map((r) => [r.number, r.kind, r.decisionDiffers, r.factorsDiffer, r.otherRoute, r.via.label])).toEqual([[3, 'also-matches', false, true, true, 'Finance']])
    expect(c.conflicts).toEqual([])
    expect(c.findings[0]).toMatchObject({
      kind: 'also-matches',
      tone: 'info',
      title: 'Rule 3 also applies to Maya Iyer · via Finance',
      line: 'Rule 3 also applies via Finance — the same decision, asking Google Authenticator instead of miniOrange Push',
      fix: '',
    })
    expect(c.line).toBe('')
    expect(c.any).toBe(false)
  })

  it('as each group: the same decision either way', () => {
    expect(g.differs).toBe(false)
    expect(g.rows.map((r) => r.words)).toEqual(['Allow with 2FA', 'Allow with 2FA', 'Allow with 2FA'])
  })
})

// --- The fixes are real --------------------------------------------------------------------

describe('every fix the model suggests does what it says, and no more', () => {
  const t = showcaseTenant()
  const decided = (x: Tenant, facts: SignInFacts) => {
    const r = resolveSignIn(x.policies, facts, envOf(x))
    return [r.decidedBy?.policyId, r.decision]
  }

  it('(a) moving the Finance rule above rule 1 asks Maya for 2FA, and leaves Arun and Priya as they were', () => {
    const moved = withPolicy(t, moveAbove(policyOf(t, 'sc-dev-tools'), 2, 0))
    expect(decided(moved, savedFacts(t, 'ssi-maya-github'))).toEqual(['sc-dev-tools', '2fa'])
    expect(decided(moved, savedFacts(t, 'ssi-arun-office'))).toEqual(['sc-dev-tools', '1fa'])
    expect(decided(moved, savedFacts(t, 'ssi-priya-github'))).toEqual(['sc-dev-tools', '2fa'])
  })

  it('(b) a rule that names Maya in AWS for engineering teams, above rule 2, gives her what Finance would', () => {
    const eng = policyOf(t, 'sc-aws-engineering')
    const fin = policyOf(t, 'sc-aws-finance')
    const named: Rule = { ...fin.rules[0], id: 'x-maya', name: 'Maya Iyer', who: { groupIds: [], userIds: ['u-maya'] } }
    const fixed = withPolicy(t, { ...eng, rules: [eng.rules[0], named, ...eng.rules.slice(1)] })
    expect(decided(fixed, savedFacts(t, 'ssi-maya-aws'))).toEqual(['sc-aws-engineering', '2fa'])
    expect(decided(fixed, factsFor('arun', 'aws', BRANCH, 'win11-registered'))).toEqual(['sc-aws-engineering', '1fa'])
  })

  it('(b) a rule for DevOps in AWS for engineering teams, above rule 2, that asks for 2FA with a push, gives Tom what the DevOps policy would — and nobody else changes', () => {
    /* What the board allows: a new rule, its who DevOps, its then 2FA (miniOrange Push), placed above rule 2. */
    const eng = policyOf(t, 'sc-aws-engineering')
    const dev = policyOf(t, 'sc-aws-devops')
    const forDevOps: Rule = { ...dev.rules[0], id: 'x-devops', name: 'DevOps', who: { groupIds: ['devops'], userIds: [] }, when: when() }
    const fixed = withPolicy(t, { ...eng, rules: [eng.rules[0], forDevOps, ...eng.rules.slice(1)] })
    const tom = resolveSignIn(fixed.policies, savedFacts(t, 'ssi-tom-aws'), envOf(fixed))
    expect([tom.decidedBy?.policyId, tom.decision, tom.trace?.hitIndex]).toEqual(['sc-aws-engineering', '2fa', 1])
    expect(fixed.policies.find((p) => p.id === 'sc-aws-engineering')!.rules[1].secondFactorMethods).toEqual(['miniOrange Push'])
    expect(decided(fixed, factsFor('arun', 'aws', BRANCH, 'win11-registered'))).toEqual(['sc-aws-engineering', '1fa'])
    expect(decided(fixed, savedFacts(t, 'ssi-maya-aws'))).toEqual(['sc-aws-engineering', '1fa'])
    /* And what the hint no longer says could not be done: the audience is not the board's to edit. */
    expect(judge(t, savedFacts(t, 'ssi-tom-aws')).c.findings[0].fix).not.toMatch(/out of|audience/)
  })

  it('(c) a rule that names Leo above rule 1 lets him in as Engineering; other contractors still meet rule 2', () => {
    const slack = policyOf(t, 'sc-slack-engineering')
    const named: Rule = { ...slack.rules[0], id: 'x-leo', name: 'Leo Fernandes', who: { groupIds: [], userIds: ['u-leo'] } }
    const fixed = withPolicy(t, { ...slack, rules: [named, ...slack.rules] })
    expect(decided(fixed, savedFacts(t, 'ssi-leo-slack'))).toEqual(['sc-slack-engineering', '1fa'])
    expect(decided(fixed, savedFacts(t, 'ssi-devon-slack'))).toEqual(['sc-slack-engineering', '2fa'])
  })

  it('(d) moving the Deny that names Thomas above rule 1 refuses him, and only him', () => {
    const fixed = withPolicy(t, moveAbove(policyOf(t, 'sc-aws-finance'), 1, 0))
    expect(decided(fixed, savedFacts(t, 'ssi-thomas-aws'))).toEqual(['sc-aws-finance', 'deny'])
    expect(decided(fixed, factsFor('priya', 'aws', BRANCH, 'win11-registered'))).toEqual(['sc-aws-finance', '2fa'])
  })

  it('(e) the fix with a caution: moving rule 2 above rule 1 lets Leo in from London — and it does loosen, for people in both groups only', () => {
    const fixed = withPolicy(t, moveAbove(policyOf(t, 'sc-aws-engineering'), 1, 0))
    expect(decided(fixed, savedFacts(t, 'ssi-leo-aws'))).toEqual(['sc-aws-engineering', '1fa'])
    expect(decided(fixed, factsFor('devon', 'aws', LONDON, 'win11-registered'))).toEqual(['sc-aws-engineering', 'deny'])
  })

  it('(f) turning HRMS on gives Kavya the 2FA she was promised', () => {
    const on = withPolicy(t, { ...policyOf(t, 'sc-hrms-office'), status: 'active' })
    expect(decided(on, savedFacts(t, 'ssi-kavya-office'))).toEqual(['sc-hrms-office', '2fa'])
  })

  it('(h) nothing is offered for Ravi: a rule for IT Admins in any AWS policy changes nothing, because no AWS policy covers IT Admins', () => {
    /* The only thing the board could do — a rule whose who is IT Admins — is below the audience, so it never applies to him. */
    for (const id of ['sc-aws-engineering', 'sc-aws-finance', 'sc-aws-devops']) {
      const p = policyOf(t, id)
      const forAdmins: Rule = { ...p.rules[0], id: `x-admins-${id}`, name: 'IT Admins', who: { groupIds: ['it-admins'], userIds: [] }, when: when(), decision: '2fa' }
      expect(decided(withPolicy(t, { ...p, rules: [forAdmins, ...p.rules] }), savedFacts(t, 'ssi-ravi-aws')), id).toEqual(['global-default', '1fa'])
    }
    const { c } = judge(t, savedFacts(t, 'ssi-ravi-aws'))
    expect(c.findings.map((f) => [f.kind, f.fix, f.fixAt])).toEqual([['not-covered', '', null]])
  })

  it('(rough) a Finance policy that denies, after the one deciding: the fix is a rule in Developer tools that refuses Finance — and it says who that refuses', () => {
    const financeGit: Policy = {
      id: 'x-finance-git',
      name: 'GitHub for Finance',
      type: 'App Access',
      appIds: ['github'],
      audience: audienceOf(['finance']),
      status: 'active',
      lastModified: 'now',
      modifiedBy: 'Test',
      rules: [rule({ name: 'Finance always', decision: 'deny', matchEstimate: 1 })],
    }
    const both: Tenant = { ...t, policies: [...t.policies, financeGit] }
    const dev = policyOf(t, 'sc-dev-tools')
    const { c } = judge(both, savedFacts(t, 'ssi-maya-github'))
    expect(c.findings[1]).toMatchObject({
      kind: 'same-group-policy',
      fix: 'Add a rule for Finance to Developer tools — office and device checks, above rule 1, that refuses them',
      caution: 'It would refuse everyone in Finance who gets in today',
      fixAt: { policyId: 'sc-dev-tools', ruleId: dev.rules[0].id },
    })
    /* Applied as the board would: Maya and Priya refused, as the Finance policy would; Arun as he was. The caution is true. */
    const refuse: Rule = { ...financeGit.rules[0], id: 'x-refuse-finance', name: 'Finance', who: { groupIds: ['finance'], userIds: [] } }
    const fixed: Tenant = { ...both, policies: both.policies.map((p) => (p.id === 'sc-dev-tools' ? { ...dev, rules: [refuse, ...dev.rules] } : p)) }
    expect(decided(fixed, savedFacts(t, 'ssi-maya-github'))).toEqual(['sc-dev-tools', 'deny'])
    expect(decided(both, savedFacts(t, 'ssi-priya-github'))).toEqual(['sc-dev-tools', '2fa'])
    expect(decided(fixed, savedFacts(t, 'ssi-priya-github'))).toEqual(['sc-dev-tools', 'deny'])
    expect(decided(fixed, savedFacts(t, 'ssi-arun-office'))).toEqual(['sc-dev-tools', '1fa'])
  })
})

// --- Rough cases ------------------------------------------------------------------------------

describe('rough cases', () => {
  const base = showcaseTenant()

  it('a person in three groups: every policy that covers her, and a row per group', () => {
    const t = withPerson(base, 'u-maya', { alsoGroupIds: ['finance', 'devops'] })
    const { res, c, g } = judge(t, savedFacts(t, 'ssi-maya-aws'))
    expect([res.decidedBy?.policyId, res.decision]).toEqual(['sc-aws-engineering', '1fa'])
    expect(c.groups.map((x) => x.name)).toEqual(['Engineering', 'Finance', 'DevOps'])
    expect(c.landing?.via.label).toBe('Engineering and DevOps')
    expect(c.policies.map((p) => [p.policyId, p.sameGroup, p.via.label])).toEqual([
      ['sc-aws-finance', false, 'Finance'],
      ['sc-aws-devops', true, 'DevOps'],
    ])
    expect(kinds(c)).toEqual([
      ['policy-conflict', 'conflict'],
      ['same-group-policy', 'conflict'],
    ])
    expect(g.rows.map((r) => [r.label, r.policyId, r.words])).toEqual([
      ['As Engineering', 'sc-aws-engineering', 'Allow on 1 factor'],
      ['As Finance', 'sc-aws-finance', 'Allow with 2FA'],
      ['As DevOps', 'sc-aws-engineering', 'Allow on 1 factor'],
      ['As Maya (all 3)', 'sc-aws-engineering', 'Allow on 1 factor'],
    ])
    expect(g.follows.map((x) => x.name)).toEqual(['Engineering', 'DevOps'])
    expect(g.why).toBe('AWS for engineering teams is higher in the list')
  })

  it('a person in three groups on GitHub: the line on the answer and her row in As each group give the same reason, from the rule that decided', () => {
    const t = withPerson(base, 'u-maya', { alsoGroupIds: ['finance', 'devops'] })
    const { c, g } = judge(t, savedFacts(t, 'ssi-maya-github'))
    expect(c.landing?.via.label).toBe('Engineering and DevOps')
    /* A pair never takes a possessive: "the rule for Engineering and DevOps". */
    expect(c.headline).toBe('Maya Iyer is in Engineering, Finance and DevOps — the rule for Engineering and DevOps applies first')
    expect(g.why).toBe('the rule for Engineering and DevOps comes first')
    expect(g.rows.at(-1)?.label).toBe('As Maya (all 3)')
  })

  it('two policies AND a rule conflict at once: the rule conflict first, the policy after, both conflicts', () => {
    const financeGit: Policy = {
      id: 'x-finance-git',
      name: 'GitHub for Finance',
      type: 'App Access',
      appIds: ['github'],
      audience: audienceOf(['finance']),
      status: 'active',
      lastModified: 'now',
      modifiedBy: 'Test',
      rules: [rule({ name: 'Finance always', decision: 'deny', matchEstimate: 1 })],
    }
    const t: Tenant = { ...base, policies: [...base.policies, financeGit] }
    const { c } = judge(t, savedFacts(t, 'ssi-maya-github'))
    expect(kinds(c)).toEqual([
      ['rule-conflict', 'conflict'],
      ['same-group-policy', 'conflict'],
      ['off-no-change', 'info'],
    ])
    expect(c.findings[1]).toMatchObject({ title: 'GitHub for Finance would deny · via Finance', line: 'Two GitHub Enterprise policies cover Finance — Developer tools — office and device checks applies first' })
    expect(c.headline).toBe("Maya Iyer is in Engineering and Finance — Engineering's rule applies first")
  })

  it('an unknown fact inside a conflicting rule: rule 1 decides, the Finance rule only might — never a conflict until the fact is stated', () => {
    const dev = policyOf(base, 'sc-dev-tools')
    const draft: Policy = { ...dev, rules: [{ ...dev.rules[0], when: when(card(cond('zone', 'in zone', ['corp-offices']))) }, { ...dev.rules[2] }] }
    const unstated = judge(base, factsFor('u-maya', 'github', BRANCH), draft)
    expect(unstated.res.decision).toBe('1fa')
    expect(unstated.c.rules.map((r) => [r.number, r.match, r.kind, r.decisionDiffers, r.via.label])).toEqual([[2, 'unknown', 'also-matches', true, 'Finance']])
    expect(unstated.c.conflicts).toEqual([])
    expect(unstated.c.findings.filter((f) => f.tone === 'conflict')).toEqual([])
    const stated = judge(base, factsFor('u-maya', 'github', BRANCH, 'win11-registered'), draft)
    expect(stated.c.conflicts.map((r) => [r.number, r.via.label, r.fix])).toEqual([[2, 'Finance', 'Move it above rule 1 to ask Finance for 2FA']])
  })

  it('a policy switched off mid-way: with AWS for engineering teams off, Finance decides for Maya, and the off policy says what it would do', () => {
    const t = withPolicy(base, { ...policyOf(base, 'sc-aws-engineering'), status: 'inactive' })
    const { res, c, g } = judge(t, savedFacts(t, 'ssi-maya-aws'))
    expect([res.decidedBy?.policyId, res.decision]).toEqual(['sc-aws-finance', '2fa'])
    expect(c.policies).toEqual([])
    expect(c.off.map((o) => [o.policyId, o.wouldDecide, o.then.decision, o.changes])).toEqual([['sc-aws-engineering', true, '1fa', true]])
    expect(c.findings[0]).toMatchObject({ kind: 'off-would-change', line: 'AWS for engineering teams is off — on, it would allow on 1 factor' })
    /* A member of Engineering alone is covered by no live AWS policy now. */
    expect(g.rows.map((r) => [r.label, r.policyId])).toEqual([
      ['As Engineering', 'global-default'],
      ['As Finance', 'sc-aws-finance'],
      ['As Maya (both)', 'sc-aws-finance'],
    ])
    expect(g.why).toBe('AWS billing for Finance covers Finance')
  })

  it('a rule switched off mid-way: with rule 1 off, rule 2 decides and the Finance rule is only an also-match', () => {
    const dev = policyOf(base, 'sc-dev-tools')
    const off: Policy = { ...dev, rules: dev.rules.map((r, i) => (i === 0 ? { ...r, enabled: false } : r)) }
    const { res, c } = judge(base, savedFacts(base, 'ssi-maya-github'), off)
    expect([res.trace?.hitIndex, res.decision]).toEqual([1, '2fa'])
    expect(c.rules.map((r) => [r.number, r.kind, r.factorsDiffer])).toEqual([[3, 'also-matches', true]])
    expect(c.conflicts).toEqual([])
    /* And a later rule switched off does not apply at all. */
    const third: Policy = { ...dev, rules: dev.rules.map((r, i) => (i === 2 ? { ...r, enabled: false } : r)) }
    expect(judge(base, savedFacts(base, 'ssi-maya-github'), third).c.rules.map((r) => r.number)).toEqual([2])
  })

  it('a group taken away from the person: Maya without Finance has no conflict anywhere, and nothing to compare', () => {
    const t = withPerson(base, 'u-maya', { alsoGroupIds: undefined })
    const gh = judge(t, savedFacts(t, 'ssi-maya-github'))
    expect(gh.c.groups.map((x) => x.name)).toEqual(['Engineering'])
    expect(gh.c.conflicts).toEqual([])
    expect(gh.c.rules.map((r) => [r.number, r.kind, r.otherRoute])).toEqual([[2, 'also-matches', false]])
    expect(gh.g.rows.map((r) => r.label)).toEqual(['As Engineering', 'As Maya Iyer'])
    expect(gh.g.line).toBe('')
    const aws = judge(t, savedFacts(t, 'ssi-maya-aws'))
    expect(aws.c.policies).toEqual([])
    expect(aws.c.any).toBe(false)
  })

  it('Leo taken out of Contractors: an engineer like any other, let in on Slack by rule 1', () => {
    const t = withPerson(base, 'u-leo', { alsoGroupIds: undefined })
    const { res, c } = judge(t, savedFacts(t, 'ssi-leo-slack'))
    expect([res.trace?.hitIndex, res.decision]).toEqual([0, '1fa'])
    expect(c.exceptions).toEqual([])
  })

  it('an exception whose conditions do not hold is reported, quietly: it did not cost him anything', () => {
    /* From Austin, outside the countries rule 1 reads: rule 1 would not have decided anyway. */
    const { c } = judge(base, factsFor('u-leo', 'slack', { address: '192.0.2.140', source: 'stated' }, 'win11-registered'))
    expect(c.exceptions.map((x) => [x.number, x.conditions, x.wouldHaveDecided, x.fix])).toEqual([[1, 'no', false, '']])
    expect(c.findings.some((f) => f.kind === 'exception')).toBe(false)
  })

  it('an incomplete sign-in has nothing to compare, and says so by being empty', () => {
    const { c, g } = judge(base, { appId: 'github' })
    expect(c).toMatchObject({ personId: null, policyId: null, landing: null, rules: [], conflicts: [], exceptions: [], policies: [], off: [], depends: null, missedBy: [], findings: [], headline: '', line: '', any: false })
    expect(g.rows).toEqual([])
  })
})

// --- Constructed policy conflicts ---------------------------------------------------------------

describe('conflictsOf — policy conflicts, constructed', () => {
  const base = showcaseTenant()
  /* Two more live policies on GitHub, after Developer tools: one for Finance
     (the same app and group — the earlier policy applies) and one for
     everyone (the DEFAULT group — a custom-group policy applies). */
  const financeGit: Policy = {
    id: 'x-finance-git',
    name: 'GitHub for Finance',
    type: 'App Access',
    appIds: ['github'],
    audience: audienceOf(['finance']),
    status: 'active',
    lastModified: 'now',
    modifiedBy: 'Test',
    rules: [rule({ name: 'Finance always', who: { groupIds: ['finance'], userIds: [] }, decision: 'deny', matchEstimate: 1 })],
  }
  const everyoneGit: Policy = {
    ...financeGit,
    id: 'x-everyone-git',
    name: 'GitHub for everyone',
    audience: EVERYONE,
    rules: [rule({ name: 'Anyone', decision: '1fa', matchEstimate: 1 })],
  }
  const t: Tenant = { ...base, policies: [...base.policies.slice(0, 1), everyoneGit, ...base.policies.slice(1), financeGit] }

  it('lists the live policies after the decider that cover her, in engine order, with what each would decide', () => {
    const { res, c } = judge(t, factsFor('u-maya', 'github', BRANCH, 'win11-registered'))
    expect(res.decidedBy?.policyId).toBe('sc-dev-tools')
    expect(c.policies.map((p) => [p.policyId, p.standing, p.tier, p.decision, p.ruleNumber, p.decisionDiffers, p.via.label, p.sameGroup])).toEqual([
      ['x-finance-git', 'same-app-and-group', 'custom', 'deny', 1, true, 'Finance', true],
      ['x-everyone-git', 'default-group-yields', 'default-group', '1fa', 1, false, 'Everyone', false],
    ])
    expect(c.policies[0].notUsed).toBe('Not used — Developer tools — office and device checks comes first')
    /* The Global Default covers everyone too; it is the tenant's fallback, never a conflict. */
    expect(c.policies.some((p) => p.policyId === 'global-default')).toBe(false)
    expect(c.any).toBe(true)
  })

  it('a policy that is not on, or does not cover the person, is not one', () => {
    const quiet: Tenant = { ...t, policies: t.policies.map((p) => (p.id === 'x-finance-git' ? { ...p, status: 'inactive' as const } : p)) }
    expect(judge(quiet, factsFor('u-maya', 'github', BRANCH, 'win11-registered')).c.policies.map((p) => p.policyId)).toEqual(['x-everyone-git'])
    /* Arun is not in Finance. */
    expect(judge(t, factsFor('arun', 'github', BRANCH, 'win11-registered')).c.policies.map((p) => p.policyId)).toEqual(['x-everyone-git'])
  })

  it('the showcase has none on GitHub', () => {
    expect(judge(base, factsFor('u-maya', 'github', BRANCH, 'win11-registered')).c.policies).toEqual([])
  })
})

// --- Sweeps --------------------------------------------------------------------------------------

describe('the sweeps: nobody in one group and named nowhere has a rule conflict, and every answer is the resolver’s', () => {
  const t = showcaseTenant()
  const env = envOf(t)
  const devices: (DevicePresetId | undefined)[] = ['win11-registered', 'iphone', 'win10', undefined]
  const networks = [BRANCH, HOME, LONDON]
  const named = new Set(t.policies.flatMap((p) => [...p.audience.userIds, ...[...p.rules, ...(p.fallback ? [p.fallback] : [])].flatMap((r) => [...(r.who?.userIds ?? []), ...(r.who?.exceptUserIds ?? [])])]))
  const plain = (id: string) => {
    const u = t.directory.people.find((x) => x.id === id)!
    return memberGroupIds(u).length === 1 && !named.has(id)
  }
  const sweep: SignInFacts[] = [
    ...t.savedSignIns.map((s) => s.facts),
    ...t.directory.people.flatMap((u) => t.apps.flatMap((a) => networks.flatMap((n) => devices.map((d) => factsFor(u.id, a.id, n, d))))),
  ]

  it(`on ${sweep.length} sign-ins`, () => {
    let also = 0
    let findings = 0
    for (const f of sweep) {
      const res = resolveSignIn(t.policies, f, env)
      const c = conflictsOf({ res, policies: t.policies, facts: f, env })
      const label = `${f.personId} on ${f.appId}`
      /* Parity: the conflicts are measured from the resolver's own answer. */
      expect(c.policyId, label).toBe(res.decidedBy?.policyId ?? null)
      expect(c.landing?.index ?? null, label).toBe(res.trace?.hitIndex ?? null)
      if (plain(f.personId!)) {
        expect(c.conflicts, label).toEqual([])
        expect(c.exceptions, label).toEqual([])
        /* A policy conflict can still reach one-group people: the same group in two policies (Tom on AWS). */
        for (const p of c.policies.filter((x) => x.standing === 'same-app-and-group')) expect(p.sameGroup, label).toBe(true)
      }
      also += c.rules.length
      findings += c.findings.length
    }
    /* Arun in the office: rule 2 (remote, a push) also matches him — layered on purpose, for the same people. */
    expect(also).toBeGreaterThan(0)
    expect(findings).toBeGreaterThan(0)
  }, 60_000)

  it('as each group: the person row is resolveSignIn, and every group row is resolveSignIn for a member of that group alone', () => {
    const lib = env.library!
    for (const id of ['u-maya', 'u-leo', 'u-tanmay']) {
      const u = t.directory.people.find((x) => x.id === id)!
      for (const a of t.apps) {
        for (const d of ['win11-registered', 'win10'] as const) {
          const facts = factsFor(id, a.id, BRANCH, d)
          const res = resolveSignIn(t.policies, facts, env)
          const g = asEachGroup({ policies: t.policies, facts, env })
          const label = `${id} on ${a.id} ${d}`
          const person = g.rows.at(-1)!
          expect([person.policyId, person.status, person.decision], label).toEqual([res.decidedBy?.policyId ?? null, res.status, res.decision])
          for (const [i, gid] of memberGroupIds(u).entries()) {
            const probe: User = { ...u, id: `probe-${gid}`, name: 'Probe', groupId: gid, alsoGroupIds: undefined }
            const env2 = { ...env, library: { ...lib, people: [...lib.people, probe] } }
            const r = resolveSignIn(t.policies, { ...facts, personId: probe.id }, env2)
            expect([g.rows[i].policyId, g.rows[i].status, g.rows[i].decision, g.rows[i].ruleNumber], `${label} as ${gid}`).toEqual([
              r.decidedBy?.policyId ?? null,
              r.status,
              r.decision,
              r.trace?.hitIndex !== null && r.trace?.hitIndex !== undefined ? r.trace.hitIndex + 1 : null,
            ])
          }
        }
      }
    }
  }, 30_000)
})

// --- Via --------------------------------------------------------------------------------------------

describe('viaOf and audienceViaOf', () => {
  const t = showcaseTenant()
  const env = envOf(t)
  const who = (id: string) => personOf(id, env)
  const dev = t.policies.find((p) => p.id === 'sc-dev-tools')!
  const corp = t.policies.find((p) => p.id === 'sc-corporate-devices')!
  const compliance = t.policies.find((p) => p.id === 'sc-device-compliance')!

  it('a group: the one of the person’s groups the rule names', () => {
    expect(viaOf(dev.rules[0], who('arun'), env)).toMatchObject({ matches: true, kind: 'groups', groups: [{ id: 'engineering', name: 'Engineering' }], named: false, label: 'Engineering', say: 'via Engineering' })
    expect(viaOf(dev.rules[0], who('u-maya'), env)).toMatchObject({ kind: 'groups', label: 'Engineering' })
    expect(viaOf(dev.rules[2], who('u-maya'), env)).toMatchObject({ kind: 'groups', label: 'Finance' })
    /* A rule naming both of her groups names both. */
    expect(viaOf({ who: { groupIds: ['finance', 'engineering'], userIds: [] } }, who('u-maya'), env)).toMatchObject({ label: 'Engineering and Finance', say: 'via Engineering and Finance' })
  })

  it('a named person: by name, and the name wins over a group also named', () => {
    expect(viaOf(corp.rules[0], who('u-exec-2'), env)).toMatchObject({ matches: true, kind: 'person', named: true, groups: [], label: 'Vikram Nair', say: 'by name' })
    expect(viaOf({ who: { groupIds: ['finance'], userIds: ['u-maya'] } }, who('u-maya'), env)).toMatchObject({ kind: 'person', named: true, groups: [{ id: 'finance', name: 'Finance' }], label: 'Maya Iyer' })
  })

  it('everyone: no who, or only exceptions the person is not in', () => {
    expect(viaOf(compliance.rules[0], who('arun'), env)).toMatchObject({ matches: true, kind: 'everyone', label: 'Everyone', say: 'for everyone' })
    expect(viaOf({ who: { groupIds: [], userIds: [], exceptGroupIds: ['sales'] } }, who('u-maya'), env)).toMatchObject({ matches: true, kind: 'everyone' })
  })

  it('none: outside the who, left out by any of their groups, or nobody', () => {
    expect(viaOf(dev.rules[0], who('u-con-5'), env)).toMatchObject({ matches: false, kind: 'none', label: '', say: '' })
    expect(viaOf({ who: { groupIds: ['engineering'], userIds: [], exceptGroupIds: ['finance'] } }, who('u-maya'), env)).toMatchObject({ matches: false })
    expect(viaOf(dev.rules[0], null, env).matches).toBe(false)
  })

  it('an audience: through the groups it names; everyone; nobody named is nobody', () => {
    expect(audienceViaOf(dev, who('u-maya'), env)).toMatchObject({ kind: 'groups', label: 'Engineering and Finance' })
    expect(audienceViaOf(corp, who('u-exec-2'), env)).toMatchObject({ kind: 'person', label: 'Vikram Nair' })
    expect(audienceViaOf(compliance, who('u-maya'), env)).toMatchObject({ kind: 'everyone' })
    expect(audienceViaOf({ audience: audienceOf([]) }, who('u-maya'), env).matches).toBe(false)
    expect(audienceViaOf(dev, who('u-sales-1'), env).matches).toBe(false)
  })
})
