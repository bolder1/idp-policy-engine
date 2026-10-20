import { describe, expect, it } from 'vitest'

import { EVERYONE, audienceOf, blankPolicy, memberGroupIds, type Policy } from '../data'
import { showcaseTenant } from '../fixtures'
import { attachTo, detachFrom } from './app-policies'
import {
  appStanding,
  appsChangedByMembership,
  deciderChanges,
  deciderForGroup,
  deciderForUser,
  groupsNamed,
  keyName,
  takenFrom,
  visibleMoves,
  whoLabel,
  type Move,
  type StandRow,
} from './app-standing'
import { membershipAfter } from './directory-model'
import { deciderFor, envOf, governingPolicy } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   The application page's numbers, read from the engine.

   The first test is the one the rest stand on: `deciderFor` is asked about
   every person on every application of the showcase and must name the policy
   `governingPolicy` names, so a number on the application page and the answer
   in Access checks cannot drift apart. The others pin the showcase's own
   collisions (showcase-seed.ts, "the troubleshooting estate") as the page
   reads them.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const people = t.directory.people
const byName = (name: string) => t.policies.find((p) => p.name === name)!
const rowOf = (rows: StandRow[], name: string) => rows.find((r) => r.policy.name === name)!
/* One application has one policy in the showcase. The cases that need a second
   policy on the same app are built from the merged one, as a copy with another
   id, name and audience. */
const copyOf = (id: string, over: Partial<Policy>): Policy => ({ ...t.policies.find((p) => p.id === id)!, ...over })
const slackGroups = () => copyOf('sc-slack-everyone', { id: 'p-slack-groups', name: 'Slack for engineering and contractors', audience: audienceOf(['engineering', 'contractors']) })
const awsDevops = () => copyOf('sc-aws-engineering', { id: 'p-aws-prod', name: 'AWS production for DevOps', audience: audienceOf(['devops']) })
const awsBilling = () => copyOf('sc-aws-engineering', { id: 'p-aws-billing', name: 'AWS billing for Finance', audience: audienceOf(['finance']) })
const boxDesign = () => copyOf('sc-box-engineering', { id: 'p-box-design', name: 'Box for design', audience: audienceOf(['design']) })
const standing = (appId: string, list: readonly Policy[] = t.policies) => appStanding(appId, list, people)

describe('deciderFor', () => {
  it('names the policy governingPolicy names, for every person on every application', () => {
    const env = envOf(t)
    for (const app of t.apps) {
      for (const person of people) {
        const engine = governingPolicy(t.policies, { appId: app.id, personId: person.id }, env).decider
        expect(`${app.id}:${person.id}:${deciderFor(t.policies, app.id, person)?.id}`).toBe(`${app.id}:${person.id}:${engine?.id}`)
      }
    }
  })
})

describe('appStanding on the showcase', () => {
  it('numbers the one policy on Slack 1: it decides, in the Everyone band', () => {
    const { rows } = standing('slack')
    expect(rows).toHaveLength(1)
    expect(rowOf(rows, 'Slack access')).toMatchObject({ n: 1, state: 'decides', band: 'everyone' })
  })

  it('numbers a group policy on Slack first, though Everyone is higher in the list', () => {
    /* The documented tier puts a group's policy above the Everyone one; the
       second policy is built here. Devon Rao (Contractors) and Leo Fernandes
       (Engineering and Contractors) are the two the seed sends to Slack. */
    const list = [...t.policies, slackGroups()]
    const { rows } = standing('slack', list)
    expect(rowOf(rows, 'Slack for engineering and contractors')).toMatchObject({ n: 1, state: 'decides', band: 'groups' })
    expect(rowOf(rows, 'Slack access')).toMatchObject({ n: 2, state: 'decides', band: 'everyone' })
    for (const id of ['devon', 'u-leo']) {
      const person = people.find((u) => u.id === id)!
      expect(deciderForUser(list, 'slack', person)?.name).toBe('Slack for engineering and contractors')
    }
  })

  it('says a second AWS policy for DevOps never decides, and who decides for DevOps', () => {
    const row = rowOf(standing('aws', [...t.policies, awsDevops()]).rows, 'AWS production for DevOps')
    expect(row).toMatchObject({ state: 'never', n: null })
    expect(row.lostTo).toEqual([{ key: { kind: 'group', id: 'devops' }, to: byName('AWS access') }])
  })

  it('gives a draft on GitHub no number', () => {
    const draft = copyOf('sc-dev-tools', { id: 'p-code-review', name: 'Code review for Finance', status: 'draft', audience: audienceOf(['finance']) })
    expect(rowOf(standing('github', [...t.policies, draft]).rows, 'Code review for Finance')).toMatchObject({ state: 'draft', n: null })
  })

  it('numbers a live Everyone policy with no rules: it decides by its last row', () => {
    const empty: Policy = { ...blankPolicy('Slack, nothing written yet', ['slack']), id: 'p-empty', status: 'active', audience: EVERYONE, rules: [] }
    const { rows } = standing('slack', [empty, ...t.policies])
    expect(rowOf(rows, 'Slack, nothing written yet')).toMatchObject({ state: 'decides', n: 1 })
    expect(rowOf(rows, 'Slack access')).toMatchObject({ state: 'never', n: null })
  })

  /* Account Management, not Session: a Session policy is a post sign-in one
     (post-sign-in.ts), never on an application's Policies tab at all. */
  it('gives a policy of another type no number', () => {
    const other: Policy = { ...blankPolicy('Slack accounts', ['slack']), id: 'p-account', type: 'Account Management', status: 'active' }
    expect(rowOf(standing('slack', [...t.policies, other]).rows, 'Slack accounts')).toMatchObject({ state: 'not-app-access', n: null })
  })
})

/* Every move, as "key: from → to", for a whole-list comparison. */
const said = (moves: Move[]) => moves.map((m) => `${keyName(m.key, t.groups, people)}: ${m.from?.name ?? '-'} → ${m.to?.name ?? '-'}`)
const named = (list: readonly Policy[], name: string) => list.find((p) => p.name === name)!
const without = (name: string, appId: string, list: readonly Policy[] = t.policies) => list.map((p) => (p.name === name ? detachFrom(p, appId) : p))
const removing = (name: string, appId: string, list: readonly Policy[] = t.policies) =>
  deciderChanges(appId, list, without(name, appId, list), people, t.groups).filter((m) => m.from?.id === named(list, name).id)
/* The merged policies cut back to one team's audience, so that a second policy for another team can sit beside them. */
const narrowed = (id: string, groupIds: string[]) => t.policies.map((p) => (p.id === id ? { ...p, audience: audienceOf(groupIds) } : p))
/* Box: access for Engineering, then a policy for Design; Tanmay Joshi is in both. */
const twoBox = [...narrowed('sc-box-engineering', ['engineering']), boxDesign()]
/* AWS: access for Engineering, then billing for Finance; Maya Iyer is in both. */
const engAndBilling = [...narrowed('sc-aws-engineering', ['engineering']), awsBilling()]

describe('deciderChanges', () => {
  it('moves Engineering on Box to the Global Default, not to Box for design, when Box access goes', () => {
    const moves = removing('Box access', 'box', twoBox)
    const eng = moves.find((m) => m.key.kind === 'group' && m.key.id === 'engineering')
    expect(eng?.from?.name).toBe('Box access')
    expect(eng?.to?.name).toBe('Global Default Policy')
    /* Design kept its own policy, so it does not move. */
    expect(moves.some((m) => m.key.kind === 'group' && m.key.id === 'design')).toBe(false)
  })

  it('says Tanmay Joshi, in Engineering and Design, goes to Box for design, and nobody in Engineering alone', () => {
    expect(said(removing('Box access', 'box', twoBox))).toEqual([
      'Engineering: Box access → Global Default Policy',
      'Tanmay Joshi: Box access → Box for design',
    ])
  })

  it('says Maya Iyer, in Engineering and Finance, goes to AWS billing for Finance when AWS access goes', () => {
    const moves = removing('AWS access', 'aws', engAndBilling)
    const maya = moves.find((m) => m.key.kind === 'user' && m.key.id === 'u-maya')
    expect(maya?.to?.name).toBe('AWS billing for Finance')
    /* Every person listed moves somewhere their groups' rows do not say. */
    for (const m of moves) {
      if (m.key.kind !== 'user') continue
      const id = m.key.id
      const person = people.find((u) => u.id === id)!
      const rows = moves.filter((x) => x.key.kind === 'group' && memberGroupIds(person).includes(x.key.id))
      expect(rows.some((r) => r.to?.id === m.to?.id)).toBe(false)
    }
  })
})

describe('takenFrom', () => {
  it('names Box access too when AWS billing for Finance is added to Box', () => {
    /* Finance moves off the Global Default; Maya Iyer, in Engineering and
       Finance, moves off Box access, which no group row says. */
    const list = [awsBilling(), ...narrowed('sc-box-engineering', ['engineering'])]
    const finance = named(list, 'AWS billing for Finance')
    const after = list.map((p) => (p.id === finance.id ? attachTo(p, 'box', t.apps) : p))
    const froms = takenFrom(deciderChanges('box', list, after, people, t.groups), finance.id).map((p) => p.name)
    expect(froms).toEqual(expect.arrayContaining(['Global Default Policy', 'Box access']))
  })
})

describe('visibleMoves', () => {
  it('lists Everyone alone when Slack for everyone goes, not each group no Slack policy names', () => {
    /* Slack access names Engineering and Contractors in its rules, so a copy without rules is used. */
    const name = 'Slack for everyone'
    const bare = copyOf('sc-slack-everyone', { id: 'p-slack-bare', name, rules: [] })
    const all = [...t.policies.filter((p) => p.id !== 'sc-slack-everyone'), bare]
    const moves = removing(name, 'slack', all)
    expect(moves.filter((m) => m.key.kind === 'group').length).toBeGreaterThan(1)
    expect(said(visibleMoves(moves, 'slack', all, without(name, 'slack', all)))).toEqual(['Everyone: Slack for everyone → Global Default Policy'])
  })

  it('keeps a group the app names, and a group whose move is not Everyone’s', () => {
    expect(said(visibleMoves(removing('Box access', 'box', twoBox), 'box', twoBox))).toEqual([
      'Engineering: Box access → Global Default Policy',
      'Tanmay Joshi: Box access → Box for design',
    ])
  })
})

describe('appsChangedByMembership', () => {
  it('flags Slack and AWS when Leo Fernandes leaves Contractors, though the same policies still decide for him', () => {
    /* "Engineers, where we operate" excepts Contractors: out of the group, the
       rule takes him, and a device check and an OTP become a password. */
    const after = membershipAfter(people, ['u-leo'], 'contractors', false)
    const leo = people.find((u) => u.id === 'u-leo')!
    expect(deciderFor(t.policies, 'slack', after.find((u) => u.id === 'u-leo')!)?.id).toBe(deciderFor(t.policies, 'slack', leo)?.id)
    expect(appsChangedByMembership(t.apps, t.policies, people, after).map((a) => a.id)).toEqual(expect.arrayContaining(['slack', 'aws']))
  })

  it('flags Slack when Arun Patel, in Engineering alone, joins Contractors', () => {
    const after = membershipAfter(people, ['arun'], 'contractors', true)
    expect(appsChangedByMembership(t.apps, t.policies, people, after).map((a) => a.id)).toContain('slack')
  })

  it('does not flag an app whose deciding policy names the group only in a saved draft, or in rules turned off', () => {
    /* Arun joins Contractors; "Slack access" decides for him before and
       after. Its rules name Contractors only where no sign-in runs them. */
    const slack = byName('Slack access')
    const off: Policy = { ...slack, rules: slack.rules.map((r) => ({ ...r, enabled: false })) }
    const drafted: Policy = {
      ...slack,
      rules: slack.rules.map((r) => ({ ...r, who: undefined })),
      pendingDraft: { rules: slack.rules, savedAt: 'Today', savedBy: 'Jaspreet Toor' },
    }
    const after = membershipAfter(people, ['arun'], 'contractors', true)
    for (const variant of [off, drafted]) {
      const list = t.policies.map((p) => (p.id === slack.id ? variant : p))
      expect(appsChangedByMembership(t.apps, list, people, after).map((a) => a.id)).not.toContain('slack')
    }
  })
})

describe('groupsNamed', () => {
  it('lists a group a rule names only as an exception', () => {
    /* On the seed, Slack's one exception (Contractors) is in the policy's
       audience as well, so the case is made here: IT Admins excepted from the
       Engineering rule and named nowhere else. */
    const list = t.policies.map((p) =>
      p.name === 'Slack access'
        ? { ...p, rules: p.rules.map((r, i) => (i === 0 ? { ...r, who: { groupIds: ['engineering'], userIds: [], exceptGroupIds: ['contractors', 'it-admins'] } } : r)) }
        : p,
    )
    expect(groupsNamed('slack', t.policies)).not.toContain('it-admins')
    expect(groupsNamed('slack', list)).toContain('it-admins')
  })
})

describe('a person in two groups', () => {
  it('resolves through the group that is not their first', () => {
    /* Maya Iyer is in Engineering first and Finance besides. On Google
       Workspace only Finance is named (Access the app through corporate
       devices only), so Engineering alone falls to the Global Default and
       she does not. */
    const maya = people.find((u) => u.id === 'u-maya')!
    expect(deciderForGroup(t.policies, 'google-workspace', 'engineering')?.name).toBe('Global Default Policy')
    expect(deciderForUser(t.policies, 'google-workspace', maya)?.name).toBe('Access the app through corporate devices only')
  })
})

describe('whoLabel', () => {
  it('says "(deleted)" for a group the directory no longer has', () => {
    const p: Policy = { ...blankPolicy('Gone', ['slack']), audience: audienceOf(['finance', 'g-gone']) }
    expect(whoLabel(p, t.groups, people)).toBe('Finance and (deleted)')
  })

  it('says Everyone, and Nobody chosen for an empty audience', () => {
    expect(whoLabel(byName('Slack access'), t.groups, people)).toBe('Everyone')
    expect(whoLabel({ ...blankPolicy('Nobody', ['slack']), audience: audienceOf([]) }, t.groups, people)).toBe('Nobody chosen')
  })
})
