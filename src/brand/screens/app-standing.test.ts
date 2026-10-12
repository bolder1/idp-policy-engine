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
  it('numbers the group policy on Slack first, though Everyone is higher in the list', () => {
    /* Slack for everyone is first in the store; the documented tier puts a
       group's policy above it. Devon Rao (Contractors) and Leo Fernandes
       (Engineering and Contractors) are the two the seed sends to Slack to show
       it (showcase-seed.ts, people and saved sign-ins). */
    const { rows } = standing('slack')
    expect(rowOf(rows, 'Slack for engineering and contractors')).toMatchObject({ n: 1, state: 'decides', band: 'groups' })
    expect(rowOf(rows, 'Slack for everyone')).toMatchObject({ n: 2, state: 'decides', band: 'everyone' })
    for (const id of ['devon', 'u-leo']) {
      const person = people.find((u) => u.id === id)!
      expect(deciderForUser(t.policies, 'slack', person)?.name).toBe('Slack for engineering and contractors')
    }
  })

  it('says AWS production for DevOps never decides, and who decides for DevOps', () => {
    const row = rowOf(standing('aws').rows, 'AWS production for DevOps')
    expect(row).toMatchObject({ state: 'never', n: null })
    expect(row.lostTo).toEqual([{ key: { kind: 'group', id: 'devops' }, to: byName('AWS for engineering teams') }])
  })

  it('gives the Finance draft on GitHub no number', () => {
    expect(rowOf(standing('github').rows, 'Code review for Finance')).toMatchObject({ state: 'draft', n: null })
  })

  it('numbers a live Everyone policy with no rules: it decides by its last row', () => {
    const empty: Policy = { ...blankPolicy('Slack, nothing written yet', ['slack']), id: 'p-empty', status: 'active', audience: EVERYONE, rules: [] }
    const { rows } = standing('slack', [empty, ...t.policies])
    expect(rowOf(rows, 'Slack, nothing written yet')).toMatchObject({ state: 'decides', n: 2 })
    expect(rowOf(rows, 'Slack for everyone')).toMatchObject({ state: 'never', n: null })
  })

  it('gives a policy of another type no number', () => {
    const session: Policy = { ...blankPolicy('Slack sessions', ['slack']), id: 'p-session', type: 'Session', status: 'active' }
    expect(rowOf(standing('slack', [...t.policies, session]).rows, 'Slack sessions')).toMatchObject({ state: 'not-app-access', n: null })
  })
})

/* Every move, as "key: from → to", for a whole-list comparison. */
const said = (moves: Move[]) => moves.map((m) => `${keyName(m.key, t.groups, people)}: ${m.from?.name ?? '-'} → ${m.to?.name ?? '-'}`)
const without = (name: string, appId: string) => t.policies.map((p) => (p.name === name ? detachFrom(p, appId) : p))
const removing = (name: string, appId: string) =>
  deciderChanges(appId, t.policies, without(name, appId), people, t.groups).filter((m) => m.from?.id === byName(name).id)

describe('deciderChanges', () => {
  it('moves Engineering on Box to the Global Default, not to Box for design, when Box for engineering goes', () => {
    const moves = removing('Box for engineering', 'box')
    const eng = moves.find((m) => m.key.kind === 'group' && m.key.id === 'engineering')
    expect(eng?.from?.name).toBe('Box for engineering')
    expect(eng?.to?.name).toBe('Global Default Policy')
    /* Design kept its own policy, so it does not move. */
    expect(moves.some((m) => m.key.kind === 'group' && m.key.id === 'design')).toBe(false)
  })

  it('says Tanmay Joshi, in Engineering and Design, goes to Box for design, and nobody in Engineering alone', () => {
    expect(said(removing('Box for engineering', 'box'))).toEqual([
      'Engineering: Box for engineering → Global Default Policy',
      'Tanmay Joshi: Box for engineering → Box for design',
    ])
  })

  it('says Maya Iyer, in Engineering and Finance, goes to AWS billing for Finance when AWS for engineering teams goes', () => {
    const moves = removing('AWS for engineering teams', 'aws')
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
  it('names Box for engineering too when AWS billing for Finance is added to Box', () => {
    /* Finance moves off the Global Default; Maya Iyer, in Engineering and
       Finance, moves off Box for engineering, which no group row says. */
    const finance = byName('AWS billing for Finance')
    const after = t.policies.map((p) => (p.id === finance.id ? attachTo(p, 'box', t.apps) : p))
    const froms = takenFrom(deciderChanges('box', t.policies, after, people, t.groups), finance.id).map((p) => p.name)
    expect(froms).toEqual(expect.arrayContaining(['Global Default Policy', 'Box for engineering']))
  })
})

describe('visibleMoves', () => {
  it('lists Everyone alone when Slack for everyone goes, not each group no Slack policy names', () => {
    const name = 'Slack for everyone'
    const moves = removing(name, 'slack')
    expect(moves.filter((m) => m.key.kind === 'group').length).toBeGreaterThan(1)
    expect(said(visibleMoves(moves, 'slack', t.policies, without(name, 'slack')))).toEqual(['Everyone: Slack for everyone → Global Default Policy'])
  })

  it('keeps a group the app names, and a group whose move is not Everyone’s', () => {
    expect(said(visibleMoves(removing('Box for engineering', 'box'), 'box', t.policies))).toEqual([
      'Engineering: Box for engineering → Global Default Policy',
      'Tanmay Joshi: Box for engineering → Box for design',
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
    /* Arun joins Contractors; "Slack for engineering and contractors" decides
       for him before and after. Its rules name Contractors only where no
       sign-in runs them. */
    const slack = byName('Slack for engineering and contractors')
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
      p.name === 'Slack for engineering and contractors'
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
    expect(whoLabel(byName('Slack for everyone'), t.groups, people)).toBe('Everyone')
    expect(whoLabel({ ...blankPolicy('Nobody', ['slack']), audience: audienceOf([]) }, t.groups, people)).toBe('Nobody chosen')
  })
})
