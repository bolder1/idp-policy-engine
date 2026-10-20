import { describe, expect, it } from 'vitest'

import { rule, type Policy } from '../data'
import { showcaseTenant } from '../fixtures'
import { appUserRows } from './app-people-tabs-model'
import { appStanding } from './app-standing'
import {
  GLANCE_MIN_ROWS,
  GLANCE_ROWS,
  appCheckForm,
  blockedBy,
  byRule,
  canvasTarget,
  cardOutcome,
  chainKeyOf,
  chainRows,
  checkFormFor,
  coverageOf,
  decidedSaid,
  findPeople,
  glanceRows,
  revealTop,
  ruleChoices,
  ruleNamedIn,
  ruleSummary,
  statusMenu,
  tabNotice,
  trafficByRow,
  whenSaid,
  type ChainLook,
} from './app-policy-model'
import { CANT_TELL } from '../decision-words'
import { appReport, signInActivity } from './sign-in-tests/activity'
import { DENY_REASON_WORD } from './testing/deny-reason'
import { emptyDraft } from './sign-in-tests/sign-in-card'
import { envOf } from './tenant-resolver'
import { nameLookupOf } from './testing/trace-pills'

/* The application page's Policies tab, as data (docs/specs/APP-POLICY-TAB.md
   §8.3): the showcase tenant, the modelled week ending 15 Oct 2026. */
const TODAY = new Date('2026-10-15T10:00:00Z')

const t = showcaseTenant()
const env = envOf(t)
const users = t.directory.people
const groups = t.groups
const byId = (id: string) => t.policies.find((p) => p.id === id)!
const app = (id: string) => t.apps.find((a) => a.id === id)!
const box = byId('sc-box-engineering')
const slack = byId('sc-slack-everyone')
const hrms = byId('sc-hrms-office')
const outlook = byId('sc-device-compliance')
const gd = byId('global-default')
const look: ChainLook = { resolve: nameLookupOf({ zones: t.zones, fingerprints: t.fingerprints, groups, users }), groups, users }
const standing = (appId: string, policies: readonly Policy[] = t.policies) => appStanding(appId, policies, users)
const chainOf = (appId: string, p: Policy | null, policies: readonly Policy[] = t.policies, extra: Partial<ChainLook> = {}) =>
  chainRows(p, gd, standing(appId, policies).everyoneElse, { ...look, ...extra })

describe('chainRows', () => {
  it('lays Box out as its two rules, its last row, then the Global Default behind it', () => {
    const rows = chainOf('box', box)
    expect(rows.map((r) => r.key)).toEqual([box.rules[0].id, box.rules[1].id, 'last', 'default'])
    expect(rows.map((r) => r.n)).toEqual([1, 2, null, null])
    const d = rows.at(-1)!
    expect(d).toMatchObject({ kind: 'default', name: 'Global Default Policy', whoSaid: 'Everyone else', rulesBefore: 2, decision: 'deny', reached: true })
  })

  it('says each row’s who, if and outcome in the row’s words', () => {
    const [r1, r2, last] = chainOf('box', box)
    expect(r1).toMatchObject({ name: 'Engineers, where we operate', whoSaid: 'Engineering', ifSaid: 'In zone Operating countries', decision: '1fa', factorSaid: 'Password', reached: true, blockedBy: null })
    expect(r1.whoFaces).toEqual([{ kind: 'group', key: 'g:engineering', name: 'Engineering' }])
    expect(r2).toMatchObject({ whoSaid: 'Design', decision: '2fa', factorSaid: 'Password, miniOrange Push' })
    expect(last).toMatchObject({ name: 'Nothing else matched', whoSaid: 'Anyone not matched above', ifSaid: '', decision: 'deny', factorSaid: '“Box opens only from the countries we work in.”', reached: true })
  })

  it('reads a Who of exceptions only as everyone covered, less them', () => {
    const rows = chainOf('slack', slack)
    expect(rows[2].whoSaid).toBe('Everyone covered except Contractors')
    expect(rows[2].whoFaces).toEqual([])
  })

  it('leaves the Global Default unreached behind a policy for everyone (Slack)', () => {
    const d = chainOf('slack', slack).at(-1)!
    expect(d).toMatchObject({ key: 'default', reached: false, whoSaid: 'Nobody outside it' })
  })

  it('with no policy, is the Global Default’s own rules and last row, and nothing behind them', () => {
    const rows = chainRows(null, gd, gd, look)
    expect(rows.map((r) => r.key)).toEqual([gd.rules[0].id, gd.rules[1].id, 'last'])
    expect(rows.every((r) => r.reached)).toBe(true)
    expect(rows[0].whoSaid).toBe('Everyone')
  })

  it('dims a policy that decides nothing, and the Global Default carries everybody on the application', () => {
    const rows = chainOf('hrms', hrms, t.policies, { appName: 'HRMS' })
    expect(rows.filter((r) => r.kind !== 'default').every((r) => !r.reached)).toBe(true)
    expect(rows.at(-1)).toMatchObject({ key: 'default', reached: true, whoSaid: 'Everyone on HRMS' })
  })

  it('says a draft rule with no outcome yet as none chosen', () => {
    const blank = { ...box.rules[1], pristine: true as const }
    const rows = chainOf('box', { ...box, status: 'draft', rules: [box.rules[0], blank] })
    expect(rows[1]).toMatchObject({ decision: null, factorSaid: null })
  })
})

describe('blockedBy', () => {
  const all = rule({ name: 'Every sign-in', decision: '1fa' })
  const shadowed: Policy = { ...box, rules: [all, ...box.rules] }

  it('names the rule above that takes every sign-in first', () => {
    expect(blockedBy(shadowed, 0)).toBeNull()
    expect(blockedBy(shadowed, 1)).toBe(1)
    expect(blockedBy(shadowed, 2)).toBe(1)
    /* The last row, asked by the rule count. */
    expect(blockedBy(shadowed, 3)).toBe(1)
    expect(blockedBy(box, 1)).toBeNull()
    expect(blockedBy(box, 2)).toBeNull()
  })

  it('marks the rows it shadows as never reached', () => {
    const rows = chainOf('box', shadowed, t.policies.map((p) => (p.id === box.id ? shadowed : p)))
    expect(rows.map((r) => [r.blockedBy, r.reached])).toEqual([
      [null, true],
      [1, false],
      [1, false],
      [1, false],
      [null, true],
    ])
  })
})

describe('trafficByRow', () => {
  const keys = (p: Policy | null, appId: string) => new Set(chainRows(p, gd, standing(appId).everyoneElse, look).map((r) => r.key))
  const boxTraffic = trafficByRow('box', box, gd, t.policies, env, TODAY, t.apps)
  const sum = (m: Map<string, { weight: number }>) => [...m.values()].reduce((n, r) => n + r.weight, 0)

  it('puts every decided sign-in of Box’s week on exactly one row; one nothing could decide yet is on none', () => {
    const report = appReport(app('box'), t.policies, env, TODAY)
    const undecided = report.rows.filter((r) => r.today.status !== 'decided').reduce((n, r) => n + r.weight, 0)
    expect(sum(boxTraffic) + undecided).toBe(report.total)
    expect(sum(boxTraffic)).toBe(report.rows.filter((r) => r.today.status === 'decided').reduce((n, r) => n + r.weight, 0))
  })

  it('has weight on Box’s own rules now the sample is drawn from Box’s policy', () => {
    expect(boxTraffic.get(box.rules[0].id)?.weight ?? 0).toBeGreaterThan(0)
    expect(boxTraffic.get(box.rules[1].id)?.weight ?? 0).toBeGreaterThan(0)
    expect(boxTraffic.get('default')?.weight ?? 0).toBeGreaterThan(0)
  })

  it('keys only chain rows, each with the day and time it last decided one', () => {
    const chain = keys(box, 'box')
    for (const k of boxTraffic.keys()) expect(chain.has(k), k).toBe(true)
    expect(boxTraffic.get(box.rules[0].id)?.last).toEqual({ date: '2026-10-14', time: '09:30' })
  })

  it('is empty for an application added this session', () => {
    const added = t.apps.map((a) => (a.id === 'box' ? { ...a, addedAt: Date.UTC(2026, 9, 15) } : a))
    expect(trafficByRow('box', box, gd, t.policies, env, TODAY, added).size).toBe(0)
  })

  it('puts all of the inactive HRMS policy’s weight on the Global Default', () => {
    const m = trafficByRow('hrms', hrms, gd, t.policies, env, TODAY, t.apps)
    expect([...m.keys()]).toEqual(['default'])
  })

  it('with no policy, lays the week on the Global Default’s own rows', () => {
    const m = trafficByRow('workday', null, gd, t.policies, env, TODAY, t.apps)
    const chain = keys(null, 'workday')
    expect(m.size).toBeGreaterThan(0)
    for (const k of m.keys()) expect(chain.has(k), k).toBe(true)
    expect(m.has('default')).toBe(false)
  })
})

describe('coverageOf', () => {
  it('counts the people Box’s policy decides for, as the Users tab does, and everyone else', () => {
    const c = coverageOf('box', box, t.policies, users, groups)
    const rows = appUserRows('box', t.policies, users, groups)
    expect(c.covered).toBe(rows.filter((r) => r.decider?.id === box.id).length)
    expect(c.covered).toBeGreaterThan(0)
    expect(c.covered + c.everyoneElse).toBe(users.length)
  })

  it('leaves nobody else behind a policy for everyone, and counts nobody for a policy that is off', () => {
    expect(coverageOf('slack', slack, t.policies, users, groups).everyoneElse).toBe(0)
    expect(coverageOf('hrms', hrms, t.policies, users, groups)).toEqual({ covered: 0, everyoneElse: users.length })
    expect(coverageOf('workday', null, t.policies, users, groups)).toEqual({ covered: 0, everyoneElse: users.length })
  })
})

describe('tabNotice', () => {
  const rowOf = (appId: string, policies: readonly Policy[] = t.policies) => standing(appId, policies).rows[0]
  const diff = { added: ['3. For Contractors, any sign-in: deny.'], removed: [] }

  it('says nothing for a live policy with nothing waiting', () => {
    expect(tabNotice(rowOf('box'), [], null, null)).toBeNull()
    expect(tabNotice(rowOf('box'), [], { added: [], removed: [] }, null)).toBeNull()
  })

  it('says each state, with the plan line for monitoring only', () => {
    expect(tabNotice(rowOf('hrms'), [], null, 'ignored')).toEqual({ kind: 'inactive', said: 'Inactive. It decides no sign-ins.', plan: null })
    const monitoring = t.policies.map((p) => (p.id === box.id ? { ...p, status: 'monitor' as const } : p))
    expect(tabNotice(rowOf('box', monitoring), [], null, 'If turned on: …')).toEqual({ kind: 'monitor', said: 'Monitoring. It decides no sign-ins.', plan: 'If turned on: …' })
    const draft = t.policies.map((p) => (p.id === box.id ? { ...p, status: 'draft' as const } : p))
    expect(tabNotice(rowOf('box', draft), [], null, null)).toEqual({ kind: 'draft', said: 'Draft. It decides no sign-ins.', plan: null })
  })

  it('says unpublished changes before the state, and another policy on the application before both', () => {
    expect(tabNotice(rowOf('box'), [], diff, null)).toEqual({ kind: 'pending', ...diff })
    expect(tabNotice(rowOf('hrms'), [], diff, null)?.kind).toBe('pending')
    const other = rowOf('hrms')
    expect(tabNotice(rowOf('box'), [other], diff, null)).toEqual({ kind: 'also', others: [hrms] })
  })
})

describe('statusMenu', () => {
  const ids = (p: Policy, deletable = false, appId = 'box') => statusMenu(p, app(appId), t.apps, { monitor: true, deletable }).map((i) => i.id)

  it('offers an active policy Monitor and Turn off, then Remove from the application below a rule', () => {
    const items = statusMenu(box, app('box'), t.apps, { monitor: true, deletable: false })
    expect(items.map((i) => [i.id, i.label])).toEqual([
      ['monitor', 'Monitor'],
      ['inactive', 'Turn off'],
      ['remove', 'Remove from Box'],
    ])
    expect(items[2].divide).toBe(true)
    expect(ids(box).length).toBe(3)
    expect(statusMenu(box, app('box'), t.apps, { monitor: false, deletable: false }).map((i) => i.id)).toEqual(['inactive', 'remove'])
  })

  it('offers an inactive one Turn on and Monitor, and a monitoring one View monitoring', () => {
    expect(ids(hrms, false, 'hrms')).toEqual(['active', 'monitor', 'remove'])
    expect(ids({ ...box, status: 'monitor' })).toEqual(['active', 'inactive', 'view-monitoring', 'remove'])
  })

  it('offers a draft Remove, and Delete draft only when it may be deleted', () => {
    expect(ids({ ...box, status: 'draft' })).toEqual(['remove'])
    expect(ids({ ...box, status: 'draft' }, true)).toEqual(['remove', 'delete'])
    expect(statusMenu({ ...box, status: 'draft' }, app('box'), t.apps, { monitor: true, deletable: false })[0].divide).toBeUndefined()
  })

  it('names the other applications on every switch of a shared policy, and never on Remove', () => {
    const items = statusMenu(outlook, app('outlook'), t.apps, { monitor: true, deletable: false })
    for (const i of items.filter((x) => x.id !== 'remove')) expect(i.hint, i.id).toBe('With Dropbox')
    const remove = items.find((i) => i.id === 'remove')!
    expect(remove.label).toBe('Remove from Microsoft Outlook')
    expect(remove.hint).toBeUndefined()
    expect(statusMenu(box, app('box'), t.apps, { monitor: true, deletable: false }).every((i) => i.hint === undefined)).toBe(true)
  })

  it('has no menu for the system policy, and no item is ever danger', () => {
    expect(statusMenu(gd, app('box'), t.apps, { monitor: true, deletable: true })).toEqual([])
    for (const p of [box, hrms, outlook, { ...box, status: 'monitor' as const }, { ...box, status: 'draft' as const }]) {
      for (const i of statusMenu(p, app('box'), t.apps, { monitor: true, deletable: true })) expect(i.danger, `${p.id} ${i.id}`).toBeUndefined()
    }
  })
})

describe('the small helpers', () => {
  it('finds the rule a change line quotes', () => {
    expect(ruleNamedIn('Added “Designers, where we operate”', box)).toBe('Designers, where we operate')
    expect(ruleNamedIn('“Old name” renamed to “Engineers, where we operate”', box)).toBe('Engineers, where we operate')
    expect(ruleNamedIn('Switched on', box)).toBeNull()
    expect(ruleNamedIn('Added “Contractors away from the office”', box)).toBeNull()
  })

  it('maps a sign-in to its chain row', () => {
    expect(chainKeyOf({ policyId: box.id, ruleKey: 'fallback' }, box, gd)).toBe('last')
    expect(chainKeyOf({ policyId: box.id, ruleKey: box.rules[1].id }, box, gd)).toBe(box.rules[1].id)
    expect(chainKeyOf({ policyId: gd.id, ruleKey: gd.rules[0].id }, box, gd)).toBe('default')
    expect(chainKeyOf({ policyId: gd.id, ruleKey: 'fallback' }, box, gd)).toBe('default')
    expect(chainKeyOf({ policyId: gd.id, ruleKey: 'fallback' }, null, gd)).toBe('last')
    expect(chainKeyOf({ policyId: gd.id, ruleKey: gd.rules[1].id }, null, gd)).toBe(gd.rules[1].id)
    expect(chainKeyOf({ policyId: gd.id, ruleKey: null }, box, gd)).toBeNull()
    expect(chainKeyOf({ policyId: slack.id, ruleKey: 'fallback' }, box, gd)).toBeNull()
  })

  it('says when with the day, so two Thursdays differ', () => {
    expect(whenSaid('2026-10-08', '11:20')).toBe('Thu 8 Oct, 11:20')
    expect(whenSaid('2026-10-15', '11:20')).toBe('Thu 15 Oct, 11:20')
    expect(whenSaid('', '11:20')).toBe('11:20')
  })

  it('finds a Box engineer by first name, decided by Box’s policy through Engineering', () => {
    const rows = appUserRows('box', t.policies, users, groups)
    const engineer = users.find((u) => u.groupId === 'engineering' && !u.alsoGroupIds)!
    const found = findPeople(engineer.name.split(' ')[0], rows)
    expect(found[0].user.id).toBe(engineer.id)
    expect(found[0].decider?.id).toBe(box.id)
    expect(found[0].reach).toBe('Through Engineering')
    expect(findPeople('', rows)).toEqual([])
    expect(findPeople('e', rows).length).toBe(3)
    expect(findPeople('zzz-nobody', rows)).toEqual([])
  })

  it('fills Check access with the application and the person, and runs nothing', () => {
    const engineer = users.find((u) => u.groupId === 'engineering')!
    const form = checkFormFor('box', box, users, t.apps, '2026-10-15', engineer.id)
    expect(form).toMatchObject({ appId: 'box', personId: engineer.id, date: '2026-10-15', time: '09:30', assumeOn: null })
    const picked = checkFormFor('box', box, users, t.apps, '2026-10-15')
    expect(users.find((u) => u.id === picked.personId)?.groupId).toBe('engineering')
    expect(checkFormFor('workday', null, users, t.apps, '2026-10-15').personId).toBe(users[0].id)
  })

  /* The Rules head's Check access fills in the application and nothing else: on a first visit Access checks' empty
     form, after a run that run's sign-in, and over a form filled in already, that one. */
  it('fills the Rules head’s Check access with the application alone, on the form Access checks would open on', () => {
    const empty = emptyDraft('2026-10-15', '10:00')
    const ran = checkFormFor('slack', slack, users, t.apps, '2026-10-15')
    const fresh = appCheckForm('box', { prefilled: null, runId: 1, form: ran }, t.policies, '2026-10-15', '10:00')
    expect(fresh).toEqual({ ...empty, appId: 'box' })
    expect(appCheckForm('box', { prefilled: null, runId: 3, form: ran }, t.policies, '2026-10-15', '10:00')).toEqual({ ...ran, appId: 'box' })
    const waiting = { ...ran, risk: '48' }
    expect(appCheckForm('box', { prefilled: waiting, runId: 3, form: ran }, t.policies, '2026-10-15', '10:00')).toEqual({ ...waiting, appId: 'box' })
    /* A policy assumed on that is not on Box ends with the move, as Try's own application change ends it. */
    const assumed = { ...ran, assumeOn: hrms.id }
    expect(appCheckForm('box', { prefilled: null, runId: 3, form: assumed }, t.policies, '2026-10-15', '10:00').assumeOn).toBeNull()
  })
})

/* The tab at a glance (app-policy-view.tsx `APP_POLICY_GLANCE`, 20 Oct 2026): the page size both panels' height is
   drawn from, the Rule filter, the sign-in → card map the canvas traces with, and the scroll that brings a card or a
   row into its panel without moving the page. AWS Console: six rules, the most of the showcase's policies. */
describe('the tab at a glance', () => {
  const aws = byId('sc-aws-engineering')
  const awsRows = signInActivity(t.policies, env, TODAY, [app('aws')])

  it('pages seven sign-ins, which keeps both frames above a 1440 × 900 fold', () => {
    expect(GLANCE_ROWS).toBe(7)
  })

  it('pages fewer on a shorter window, whole rows between four and seven, and seven when nothing could be measured', () => {
    /* Browser review, 20 Oct 2026: on a 1536 × 730 laptop the fixed seven ran 157px under the fold. */
    expect(GLANCE_MIN_ROWS).toBe(4)
    expect(glanceRows(7 * 52, 52)).toBe(7)
    expect(glanceRows(7 * 52 - 1, 52)).toBe(6)
    expect(glanceRows(5 * 52 + 51, 52)).toBe(5)
    expect(glanceRows(20 * 52, 52)).toBe(GLANCE_ROWS)
    expect(glanceRows(52, 52)).toBe(GLANCE_MIN_ROWS)
    expect(glanceRows(-300, 52)).toBe(GLANCE_MIN_ROWS)
    expect(glanceRows(Number.NaN, 52)).toBe(GLANCE_ROWS)
    expect(glanceRows(400, 0)).toBe(GLANCE_ROWS)
  })

  it('gives each card its outcome where its state pill was, and none where the card keeps its own word', () => {
    /* An enabled rule says its decision; the last row says the policy's fallback. */
    expect(cardOutcome(aws, aws.rules[0].id)).toBe(aws.rules[0].decision)
    expect(cardOutcome(aws, 'fallback')).toBe(aws.fallback?.decision ?? '1fa')
    /* Off, not set up yet, or not on the policy: no badge — the card says Off or Not set up itself. */
    const edited: Policy = {
      ...aws,
      rules: aws.rules.map((r, i) => (i === 0 ? { ...r, enabled: false } : i === 1 ? { ...r, pristine: true as const } : r)),
      fallback: aws.fallback ? { ...aws.fallback, pristine: true as const } : undefined,
    }
    expect(cardOutcome(edited, aws.rules[0].id)).toBeNull()
    expect(cardOutcome(edited, aws.rules[1].id)).toBeNull()
    expect(cardOutcome(edited, aws.rules[2].id)).toBe(aws.rules[2].decision)
    expect(cardOutcome(edited, 'fallback')).toBeNull()
    expect(cardOutcome(aws, 'no-such-rule')).toBeNull()
  })

  it('maps a chain row to its card: a rule as itself, the last row as the board’s fallback, the Global Default to none', () => {
    expect(canvasTarget(null)).toBeNull()
    expect(canvasTarget('default')).toBeNull()
    expect(canvasTarget('last')).toBe('fallback')
    expect(canvasTarget(aws.rules[2].id)).toBe(aws.rules[2].id)
  })

  it('offers the Rule filter in the chain’s order: every rule by number with its name, the last row, then the Global Default', () => {
    const o = ruleChoices(aws, gd)
    expect(o.map((x) => x.label)).toEqual(['All rules', ...aws.rules.map((_, i) => `Rule ${i + 1}`), 'Nothing else matched', 'Global Default Policy'])
    expect(o.slice(1, -2).map((x) => x.meta)).toEqual(aws.rules.map((r) => r.name))
    expect(o.map((x) => x.value)).toEqual(['all', ...aws.rules.map((r) => r.id), 'last', 'default'])
  })

  it('offers an application with no policy the Global Default’s own rules, and nothing behind them', () => {
    const o = ruleChoices(null, gd)
    expect(o.map((x) => x.value)).toEqual(['all', ...gd.rules.map((r) => r.id), 'last'])
  })

  it('says the closed Rule filter as the rule’s number after its prefix', () => {
    expect(ruleSummary('all', aws, gd)).toBe('All rules')
    expect(ruleSummary(aws.rules[1].id, aws, gd)).toBe('2')
    expect(ruleSummary('last', aws, gd)).toBe('Nothing else matched')
    expect(ruleSummary('default', aws, gd)).toBe('Global Default Policy')
    expect(ruleSummary('no-such-rule', aws, gd)).toBe('All rules')
  })

  it('narrows the sign-ins to exactly the ones that landed on a row, tallied from the sample itself', () => {
    /* Counted against chainKeyOf over AWS's own week, never a hard-coded number, so a reseeded sample still holds. */
    expect(byRule(awsRows, 'all', aws, gd)).toHaveLength(awsRows.length)
    const tally = new Map<string, number>()
    for (const r of awsRows) {
      const k = chainKeyOf(r, aws, gd)
      if (k) tally.set(k, (tally.get(k) ?? 0) + 1)
    }
    expect(tally.size).toBeGreaterThan(1)
    for (const [k, n] of tally) {
      const got = byRule(awsRows, k, aws, gd)
      expect(got, k).toHaveLength(n)
      for (const r of got) expect(chainKeyOf(r, aws, gd)).toBe(k)
    }
  })

  it('traces every AWS sign-in to a card of its policy, or to none exactly when the Global Default or nothing decided it', () => {
    const cards = new Set([...aws.rules.map((r) => r.id), 'fallback'])
    for (const r of awsRows) {
      const k = chainKeyOf(r, aws, gd)
      const target = canvasTarget(k)
      if (k === null || k === 'default') expect(target, r.id).toBeNull()
      else expect(cards.has(target ?? ''), r.id).toBe(true)
    }
  })

  it('brings an item into a scroll box only as far as it must, and never below zero', () => {
    const box = { scrollTop: 100, height: 300 }
    /* Inside, its padding clear: nothing. */
    expect(revealTop({ top: 150, height: 50 }, box, 12)).toBeNull()
    /* Above: its top, less the padding. */
    expect(revealTop({ top: 40, height: 50 }, box, 12)).toBe(28)
    /* Below: its bottom, plus the padding, on the box's bottom edge. */
    expect(revealTop({ top: 380, height: 60 }, box, 12)).toBe(380 + 60 + 12 - 300)
    /* Taller than the box: its top. */
    expect(revealTop({ top: 500, height: 400 }, box, 12)).toBe(488)
    /* Never negative, and no move to where it already is. */
    expect(revealTop({ top: 4, height: 20 }, { scrollTop: 50, height: 300 }, 12)).toBe(0)
    expect(revealTop({ top: 4, height: 20 }, { scrollTop: 0, height: 300 }, 12)).toBeNull()
    /* A separate bottom pad: a sticky head above, nothing below. */
    expect(revealTop({ top: 380, height: 60 }, box, 44, 0)).toBe(380 + 60 - 300)
  })

  it('says what decided a picked sign-in, the reason on a refusal, and Can’t tell for one nothing decided', () => {
    const decided = awsRows.find((r) => r.decision && !r.reason)!
    expect(decidedSaid(decided)).toBe(`Decided by ${decided.policyName} · ${decided.ruleLine}`)
    const refused = awsRows.find((r) => r.reason)
    if (refused) expect(decidedSaid(refused)).toBe(`Decided by ${refused.policyName} · ${refused.ruleLine} · ${DENY_REASON_WORD[refused.reason!]}`)
    expect(decidedSaid({ decision: null, policyName: 'AWS access', ruleLine: '', reason: null })).toBe(CANT_TELL)
    expect(decidedSaid({ decision: 'deny', policyName: 'AWS access', ruleLine: 'Nothing else matched', reason: 'default-deny' })).toBe(
      `Decided by AWS access · Nothing else matched · ${DENY_REASON_WORD['default-deny']}`,
    )
  })
})
