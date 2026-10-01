import { describe, expect, it } from 'vitest'

import type { Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { boardVersion } from '../board/try-sign-in'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { savedOnPolicy } from './board-views'
import { savedRows, type SavedRow } from './selectors'
import { defaultBoardForm } from './sign-in-form'
import {
  PANEL_DEFAULTS,
  PANEL_KEY,
  PEOPLE_CAP,
  appsPhrase,
  clampPanelWidth,
  dockTabShown,
  dockTabs,
  formatCount,
  landingRuleOf,
  lastRunSummary,
  libraryTabOf,
  pastColumns,
  pastReport,
  pastRowsOf,
  peopleRows,
  personCells,
  policyApps,
  readPanel,
  runFlash,
  runSnapshot,
  sampleWeight,
  savedEmptyTitle,
  writePanel,
} from './test-dock'

/* The test panel's tab rules (V4 §2.4-bis), pinned on the showcase tenant:
   which tabs, how wide, what the viewer's choice survives, who is listed on
   which applications, the card a row lands on, what Run all reports and the
   Past sign-ins report. test-panel-ui.test.tsx draws them. */

const t = showcaseTenant()
const env = envOf(t)
const policy = (id: string) => t.policies.find((p) => p.id === id)!
const people = t.directory.people
const DAY = new Date('2026-09-28T12:00:00Z')
/* The version the board judges by with nothing edited: the stored rules as
   though on for HRMS (Inactive on the showcase), none for a live policy. */
const versionOf = (p: Policy) => boardVersion(p, p)
const panelRows = (p: Policy) => savedOnPolicy(savedRows(t.savedSignIns, t.policies, env, versionOf(p)?.substitute), p, 'policy')

describe('the tabs', () => {
  it('are Saved sign-ins, People and Past sign-ins, with the Break-in test last where it runs', () => {
    expect(dockTabs({ breakIn: false }).map((x) => x.label)).toEqual(['Saved sign-ins', 'People', 'Past sign-ins'])
    expect(dockTabs({ breakIn: true }).map((x) => x.label)).toEqual(['Saved sign-ins', 'People', 'Past sign-ins', 'Break-in test'])
    expect(dockTabs({ breakIn: true }).map((x) => x.value)).toEqual(['saved', 'people', 'past', 'break-in'])
  })

  it('never carry a number', () => {
    for (const x of dockTabs({ breakIn: true })) expect(x.label).not.toMatch(/\d/)
  })

  it('fall back to Saved sign-ins when the Break-in test cannot run', () => {
    expect(dockTabShown('break-in', false)).toBe('saved')
    expect(dockTabShown('break-in', true)).toBe('break-in')
    expect(dockTabShown('people', false)).toBe('people')
  })

  it('open the Sign-in tests page on the same question', () => {
    expect(libraryTabOf('saved')).toBe('saved')
    expect(libraryTabOf('people')).toBe('people')
    expect(libraryTabOf('past')).toBe('runs')
    expect(libraryTabOf('break-in')).toBe('saved')
  })
})

describe('the width', () => {
  it('stays between 400 and 640 px, 460 to start', () => {
    expect(clampPanelWidth(320)).toBe(400)
    expect(clampPanelWidth(460)).toBe(460)
    expect(clampPanelWidth(900)).toBe(640)
    expect(clampPanelWidth(512.6)).toBe(513)
    expect(clampPanelWidth(Number.NaN)).toBe(460)
    expect(clampPanelWidth(Infinity)).toBe(460)
  })
})

describe('what the viewer left it at', () => {
  const memory = () => {
    const m = new Map<string, string>()
    return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }
  }

  it('starts 460 px wide, on Saved sign-ins', () => {
    expect(PANEL_DEFAULTS).toEqual({ tab: 'saved', width: 460 })
    expect(readPanel(null)).toEqual(PANEL_DEFAULTS)
    expect(readPanel(memory().store)).toEqual(PANEL_DEFAULTS)
  })

  it('comes back as it was written, under idp.testPanel, the tab and the width only', () => {
    const { m, store } = memory()
    writePanel({ tab: 'past', width: 512.4 }, store)
    expect(PANEL_KEY).toBe('idp.testPanel')
    expect(JSON.parse(m.get('idp.testPanel')!)).toEqual({ tab: 'past', width: 512 })
    expect(readPanel(store)).toEqual({ tab: 'past', width: 512 })
  })

  it('loses only the value that is wrong', () => {
    const { m, store } = memory()
    m.set(PANEL_KEY, JSON.stringify({ tab: 'people', width: 90 }))
    expect(readPanel(store)).toEqual({ tab: 'people', width: 400 })
    m.set(PANEL_KEY, JSON.stringify({ tab: 'monitor', width: 'wide' }))
    expect(readPanel(store)).toEqual(PANEL_DEFAULTS)
    m.set(PANEL_KEY, '{not json')
    expect(readPanel(store)).toEqual(PANEL_DEFAULTS)
    m.set(PANEL_KEY, 'null')
    expect(readPanel(store)).toEqual(PANEL_DEFAULTS)
  })

  it('never throws where the store does', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
    }
    expect(readPanel(broken)).toEqual(PANEL_DEFAULTS)
    expect(() => writePanel({ tab: 'saved', width: 460 }, broken)).not.toThrow()
    /* No window in this runner: the default store is none, and still no throw. */
    expect(readPanel()).toEqual(PANEL_DEFAULTS)
    expect(() => writePanel(PANEL_DEFAULTS)).not.toThrow()
  })
})

describe('this policy’s applications', () => {
  it('are its own, in the catalogue’s order', () => {
    expect(policyApps(policy('sc-dev-tools'), t.apps).map((a) => a.id)).toEqual(['github', 'jira'])
    expect(policyApps({ appIds: ['dropbox', 'outlook'], isSystem: false }, t.apps).map((a) => a.id)).toEqual(['outlook', 'dropbox'])
  })

  it('are every application for the Global Default, and none for a draft with none', () => {
    expect(policyApps(policy('global-default'), t.apps)).toHaveLength(t.apps.length)
    expect(policyApps({ appIds: [], isSystem: false }, t.apps)).toEqual([])
  })

  it('name the empty Saved sign-ins tab', () => {
    const apps = (ids: string[]) => t.apps.filter((a) => ids.includes(a.id))
    expect(appsPhrase(apps(['slack']))).toBe('Slack')
    expect(appsPhrase(apps(['github', 'jira']))).toBe('GitHub Enterprise or Jira')
    expect(appsPhrase(apps(['github', 'jira', 'slack']))).toBe('GitHub Enterprise, Jira or Slack')
    expect(appsPhrase(apps(['github', 'jira', 'slack', 'zoom']))).toBe('GitHub Enterprise, Jira or 2 more')
    expect(savedEmptyTitle({ isSystem: false }, apps(['slack']))).toBe('No saved sign-ins on Slack')
    expect(savedEmptyTitle({ isSystem: false }, [])).toBe('No applications on this policy')
    expect(savedEmptyTitle({ isSystem: true }, t.apps)).toBe('No saved sign-ins')
  })
})

describe('People', () => {
  it('lists the audience first, then everybody else, twelve until a search', () => {
    const hrms = peopleRows(policy('sc-hrms-office'), people, t.groups, '')
    expect(hrms).toHaveLength(PEOPLE_CAP)
    /* Finance and Human Resources, in the directory's order, then the first three outside. */
    expect(hrms.filter((r) => r.inPolicy).map((r) => r.person.id)).toEqual(['priya', 'u-fin-2', 'u-fin-3', 'u-fin-4', 'u-fin-5', 'u-cfo', 'u-hr-1', 'u-hr-2', 'u-hr-3'])
    expect(hrms.slice(9).map((r) => [r.person.id, r.inPolicy])).toEqual([
      ['arun', false],
      ['u-eng-2', false],
      ['u-eng-3', false],
    ])
    expect(hrms[6].groupName).toBe('Human Resources')
  })

  it('lists the directory as it is for everyone, and for the Global Default', () => {
    const first = people.slice(0, PEOPLE_CAP).map((u) => u.id)
    expect(peopleRows(policy('sc-device-compliance'), people, t.groups, '').map((r) => r.person.id)).toEqual(first)
    expect(peopleRows(policy('global-default'), people, t.groups, '').every((r) => r.inPolicy)).toBe(true)
  })

  it('searches the whole directory by name, group or email, the audience still first', () => {
    const hrms = policy('sc-hrms-office')
    expect(peopleRows(hrms, people, t.groups, '  KAVYA ').map((r) => r.person.id)).toEqual(['u-hr-1'])
    const eng = peopleRows(hrms, people, t.groups, 'engineering')
    expect(eng.map((r) => r.person.id)).toEqual(['arun', 'u-eng-2', 'u-eng-3', 'u-eng-4', 'u-eng-5'])
    expect(eng.every((r) => !r.inPolicy)).toBe(true)
    expect(peopleRows(hrms, people, t.groups, 'nobody here')).toEqual([])
    /* A search is not capped. */
    expect(peopleRows(hrms, people, t.groups, 'a').length).toBeGreaterThan(PEOPLE_CAP)
  })

  it('asks only this policy’s applications — the fix for “all apps”', () => {
    const hrms = policy('sc-hrms-office')
    const form = defaultBoardForm(hrms, people, t.apps, '2026-09-28')
    const kavya = people.find((u) => u.id === 'u-hr-1')!
    const cells = personCells(t.policies, policyApps(hrms, t.apps), kavya, form, env, t.zones, versionOf(hrms)?.substitute)
    expect(cells.map((c) => c.appId)).toEqual(['hrms'])
    /* From the office, HRMS on asks her for 2FA; today the Global Default lets her in on 1 factor. */
    expect(cells[0].res.decision).toBe('2fa')
    expect(cells[0].today?.decision).toBe('1fa')
  })

  it('answers each cell for the row’s person, with the rest of the sign-in the sentence’s', () => {
    const dev = policy('sc-dev-tools')
    const form = defaultBoardForm(dev, people, t.apps, '2026-09-28')
    const priya = people.find((u) => u.id === 'priya')!
    const cells = personCells(t.policies, policyApps(dev, t.apps), priya, form, env, t.zones)
    expect(cells.map((c) => c.appId)).toEqual(['github', 'jira'])
    /* Finance is outside Developer tools: the Global Default decides, and nothing is "today" without a stand-in. */
    expect(cells.every((c) => c.res.decidedBy?.policyId === 'global-default' && c.today === null)).toBe(true)
  })
})

describe('the card a row lands on', () => {
  const dev = policy('sc-dev-tools')
  const [inOffice, remote] = dev.rules
  const at = (id: string) => resolveSignIn(t.policies, t.savedSignIns.find((s) => s.id === id)!.facts, env)

  it('is the rule that matched, or the last row', () => {
    expect(landingRuleOf(at('ssi-arun-office'), dev.id)).toBe(inOffice.id)
    expect(landingRuleOf(at('ssi-sofia-london'), dev.id)).toBe(remote.id)
    expect(landingRuleOf(at('ssi-tom-win10'), dev.id)).toBe('fallback')
  })

  it('is nothing on this board when another policy decides', () => {
    expect(landingRuleOf(at('ssi-contractor-jira'), dev.id)).toBeNull()
    expect(landingRuleOf(at('ssi-arun-office'), 'sc-hrms-office')).toBeNull()
  })

  it('is the first rule it could not read, when it cannot be told', () => {
    /* No device stated: the office rule reads one. */
    const res = resolveSignIn(t.policies, { personId: 'arun', appId: 'github', network: { address: '198.51.100.20', source: 'stated' } }, env)
    expect(res.status).toBe('depends')
    expect(landingRuleOf(res, dev.id)).toBe(inOffice.id)
  })

  it('is nothing while the sign-in is incomplete', () => {
    expect(landingRuleOf(resolveSignIn(t.policies, { appId: 'github' }, env), dev.id)).toBeNull()
  })
})

describe('Saved sign-ins in the panel', () => {
  /* The seed's promise (V4 §5): no scenario policy's Saved sign-ins opens
     empty, and on a clean tenant every sign-in in it passes — judged, as the
     panel judges, by the version on the board. One that failed here would stand in the way
     of the first save the guard reads it on. */
  it('opens on two to four of each scenario policy’s own, every one a pass', () => {
    for (const p of t.policies.filter((x) => !x.isSystem)) {
      const rows = panelRows(p)
      expect(rows.length, p.id).toBeGreaterThanOrEqual(2)
      expect(rows.length, p.id).toBeLessThanOrEqual(4)
      expect(rows.map((r) => `${r.saved.id}:${r.result}`).filter((s) => !s.endsWith(':pass')), p.id).toEqual([])
      for (const r of rows) expect(p.appIds, r.saved.id).toContain(r.saved.facts.appId)
    }
  })

  it('reports on Run all what turning HRMS on newly refuses, and nothing for a live policy left alone', () => {
    expect(lastRunSummary(panelRows(policy('sc-hrms-office')))).toEqual({ tone: 'negative', text: '1 newly blocked' })
    for (const id of ['sc-dev-tools', 'sc-device-compliance', 'sc-corporate-devices']) expect(lastRunSummary(panelRows(policy(id))), id).toBeNull()
  })

  it('says a change that refuses nobody in amber', () => {
    const rows = panelRows(policy('sc-hrms-office'))
    const kavya = rows.filter((r) => r.saved.id === 'ssi-kavya-office')
    expect(kavya[0].today?.decision).toBe('1fa')
    expect(lastRunSummary(kavya)).toEqual({ tone: 'notice', text: '1 changed' })
  })

  it('flashes on Run all what the edits change, then what moved since the last run', () => {
    const rows = panelRows(policy('sc-hrms-office'))
    expect([...runFlash(null, rows)].sort()).toEqual(['ssi-kavya-office', 'ssi-neha-home'])
    const snap = runSnapshot(rows)
    const live = panelRows(policy('sc-dev-tools'))
    expect(runFlash(runSnapshot(live), live).size).toBe(0)
    /* A row whose answer moved since the snapshot. */
    const moved = new Map(snap)
    moved.set('ssi-ravi-hrms', 'decided|global-default|deny|')
    expect([...runFlash(moved, rows)].sort()).toEqual(['ssi-kavya-office', 'ssi-neha-home', 'ssi-ravi-hrms'])
  })

  it('stays quiet with nothing to report', () => {
    expect(lastRunSummary([] as SavedRow[])).toBeNull()
  })
})

describe('Past sign-ins', () => {
  const hrms = policy('sc-hrms-office')
  const report = pastReport(hrms, t.policies, env, versionOf(hrms)?.substitute, DAY)

  it('says the week once, deterministically for a day', () => {
    expect(report.headline).toBe('Last 7 days · 1,200 sign-ins')
    expect(report.total).toBe(report.rows.reduce((n, r) => n + r.weight, 0))
    expect(pastReport(hrms, t.policies, env, versionOf(hrms)?.substitute, DAY)).toEqual(report)
  })

  it('models sign-ins only on this policy’s applications', () => {
    expect(new Set(report.rows.map((r) => r.sample.facts.appId))).toEqual(new Set(['hrms']))
    const dev = policy('sc-dev-tools')
    const devReport = pastReport(dev, t.policies, env, undefined, DAY)
    expect(new Set(devReport.rows.map((r) => r.sample.facts.appId))).toEqual(new Set(['github', 'jira']))
    const global = pastReport(policy('global-default'), t.policies, env, undefined, DAY, policyApps(policy('global-default'), t.apps).map((a) => a.id))
    expect(global.rows).toHaveLength(12)
  })

  it('adds the tiles up: Would change and Unchanged are the week, Newly blocked is part of Would change', () => {
    const [change, blocked, same] = report.tiles
    expect(report.tiles.map((x) => x.label)).toEqual(['Would change', 'Newly blocked', 'Unchanged'])
    expect(change.count + same.count).toBe(report.total)
    expect(blocked.count).toBeLessThanOrEqual(change.count)
    expect([change.count, blocked.count, same.count]).toEqual([876, 549, 324])
  })

  it('draws today and the edits as shares of the week, in decision order', () => {
    expect(report.today.map((s) => s.key)).toEqual(['1fa'])
    expect(report.edits.map((s) => [s.key, s.label])).toEqual([
      ['1fa', 'Allow on 1 factor'],
      ['2fa', 'Allow with 2FA'],
      ['deny', 'Deny'],
    ])
    for (const side of [report.today, report.edits]) expect(side.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1)
  })

  it('lists the newly blocked first, then the other changes, then the unchanged, newest first within', () => {
    const kinds = report.rows.map((r) => (r.newlyBlocked ? 'blocked' : r.change === 'unchanged' ? 'same' : 'change'))
    expect(kinds).toEqual([...Array(5).fill('blocked'), ...Array(3).fill('change'), ...Array(4).fill('same')])
    expect(report.rows[0].when).toBe('Sun 08:10')
    expect(report.rows.map((r) => r.from)).toContain('Office network')
    expect(report.rows.map((r) => r.from)).toContain('London, United Kingdom')
  })

  it('filters by the tile pressed', () => {
    expect(pastRowsOf(report.rows, 'blocked').every((r) => r.newlyBlocked)).toBe(true)
    expect(pastRowsOf(report.rows, 'change')).toHaveLength(8)
    expect(pastRowsOf(report.rows, 'same').every((r) => r.change === 'unchanged')).toBe(true)
  })

  it('moves nothing without a stand-in: a live policy left alone', () => {
    const r = pastReport(policy('sc-dev-tools'), t.policies, env, undefined, DAY)
    expect(r.tiles.map((x) => x.count)).toEqual([0, 0, r.total])
    expect(r.today).toEqual(r.edits)
  })

  it('has nothing to model on a draft with no application', () => {
    const r = pastReport({ ...hrms, appIds: [] }, t.policies, env, undefined, DAY)
    expect(r.rows).toEqual([])
    expect(r.total).toBe(0)
  })

  it('names its two sides by the version on the board', () => {
    expect(pastColumns(null)).toEqual({ left: 'Today', right: 'With your edits' })
    expect(pastColumns({ label: 'Your edits' }).right).toBe('With your edits')
    expect(pastColumns({ label: 'Stored version' }).right).toBe('If turned on')
    expect(pastColumns({ label: 'Draft' }).right).toBe('If turned on')
  })

  it('weights a modelled sign-in at 40 to 160, the same every time', () => {
    for (const r of report.rows) {
      expect(r.weight).toBeGreaterThanOrEqual(40)
      expect(r.weight).toBeLessThanOrEqual(160)
      expect(sampleWeight(r.id)).toBe(r.weight)
    }
    expect(formatCount(1284)).toBe('1,284')
    expect(formatCount(0)).toBe('0')
  })
})
