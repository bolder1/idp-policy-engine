import { beforeEach, describe, expect, it } from 'vitest'

import { showcaseTenant, showcaseTenantHrmsOn, type Tenant } from '../../fixtures'
import { EMPTY_RISK_PROFILE, riskScale } from '../../risk-signals'
import { simEnvOf } from '../sim-env'
import { personRows, savedRows } from '../testing/selectors'
import { sentenceTokens } from '../testing/sign-in-sentence'
import { defaultForm, formOf } from '../testing/sign-in-form'
import {
  PEOPLE_LEAD,
  PEOPLE_ROW_H,
  PEOPLE_TOKENS,
  SAVED_ROW_H,
  appFilterOptions,
  cellTip,
  decidedByOf,
  defaultPeopleContext,
  directoryRows,
  filterLibrary,
  filtered,
  firstDecidedApp,
  forgetLibraryMemory,
  groupFilterOptions,
  libraryFlash,
  libraryMemory,
  librarySnapshot,
  patchContext,
  peopleContextOf,
  peopleRowsRead,
  peopleTokens,
  personSaid,
  runAllSaid,
  savedRowSaid,
  seedLastRun,
  sentenceLine,
  takeRun,
  type LibraryRow,
} from './library'

/* The Sign-in tests page's library tabs, as words and rows, on the showcase
   tenant. The seed opens with HRMS access Inactive, so the Global Default
   decides HRMS and the two HRMS sign-ins that expect the policy fail: the
   table the demo opens on has something at the top. */

const envOf = (t: Tenant) =>
  simEnvOf({ ...t, users: t.directory.people, riskScale: riskScale(t.riskProfiles.find((p) => p.id === t.activeRiskProfileId) ?? EMPTY_RISK_PROFILE) })

const t = showcaseTenant()
const env = envOf(t)
const people = t.directory.people
const ctx = { people, apps: t.apps, zones: t.zones }
const judged = savedRows(t.savedSignIns, t.policies, env)
const rows: LibraryRow[] = judged.map((row) => ({ row, line: sentenceLine(formOf(row.saved.facts, t.zones), ctx) }))
const byId = (id: string) => rows.find((r) => r.row.saved.id === id)!

describe('the sentence under a saved sign-in', () => {
  it('says who, where to, from where and on what, in the sign-in bar’s words', () => {
    expect(byId('ssi-tom-win10').line).toBe('Tom Whelan · GitHub Enterprise · Branch office · Windows 10 laptop')
    expect(byId('ssi-rahul-medium').line).toBe('Rahul Verma · Google Workspace · Office network · Windows 11 laptop · registered')
  })

  it('leaves the device out when none is stated, and says Anywhere for no origin', () => {
    expect(byId('ssi-kavya-office').line).toBe('Kavya Menon · HRMS · Office network')
    expect(byId('ssi-devon-android').line).toBe('Devon Rao · Microsoft Outlook · Anywhere · Android 12 phone')
  })

  it('says a typed address as the address', () => {
    expect(byId('ssi-sofia-london').line).toMatch(/^Sofia Marchetti · Jira · 192\.0\.2\.200 · iPhone/)
  })
})

describe('the Saved sign-ins table', () => {
  it('lists every saved sign-in, failing first, then the strongest level, then by name', () => {
    expect(rows).toHaveLength(t.savedSignIns.length)
    expect(rows.slice(0, 2).map((r) => r.row.saved.id)).toEqual(['ssi-kavya-office', 'ssi-neha-home'])
    expect(rows.slice(0, 2).every((r) => r.row.result === 'fail')).toBe(true)
    const passing = rows.filter((r) => r.row.result === 'pass')
    expect(passing[0].row.saved.level).toBe('protected')
    expect(passing[passing.length - 1].row.saved.level).toBe('note')
  })

  it('offers All, then only the applications something is saved on, in catalogue order', () => {
    const opts = appFilterOptions(t.savedSignIns, t.apps)
    expect(opts[0]).toEqual({ value: 'all', label: 'All' })
    expect(opts.map((o) => o.value)).toEqual(['all', 'hrms', 'outlook', 'dropbox', 'github', 'jira', 'google-workspace'])
    expect(opts.map((o) => o.value)).not.toContain('slack')
  })

  it('searches the name and the sentence', () => {
    const all = { appId: 'all', level: 'all' } as const
    expect(filterLibrary(rows, { ...all, query: 'kavya' }).map((r) => r.row.saved.id)).toEqual(['ssi-kavya-office'])
    expect(filterLibrary(rows, { ...all, query: '  WINDOWS 10 ' }).map((r) => r.row.saved.id).sort()).toEqual(['ssi-contractor-jira', 'ssi-tom-win10'])
    expect(filterLibrary(rows, { ...all, query: 'nobody at all' })).toEqual([])
  })

  it('narrows by application and level together, keeping the order', () => {
    const hrms = filterLibrary(rows, { query: '', appId: 'hrms', level: 'all' })
    expect(hrms.map((r) => r.row.saved.id)).toEqual(['ssi-kavya-office', 'ssi-neha-home', 'ssi-ravi-hrms', 'ssi-aisha-hrms'])
    expect(filterLibrary(rows, { query: '', appId: 'hrms', level: 'protected' }).map((r) => r.row.saved.id)).toEqual(['ssi-ravi-hrms'])
    expect(filtered({ appId: 'all', level: 'all' })).toBe(false)
    expect(filtered({ appId: 'hrms', level: 'all' })).toBe(true)
    expect(filtered({ appId: 'all', level: 'note' })).toBe(true)
  })

  it('links each row to the policy that decides it now', () => {
    expect(decidedByOf(byId('ssi-kavya-office').row.res)).toEqual({ policyId: 'global-default', name: 'Global Default Policy' })
    expect(decidedByOf(byId('ssi-tom-win10').row.res)).toEqual({ policyId: 'sc-dev-tools', name: 'Developer tools — office and device checks' })
    expect(decidedByOf({ decidedBy: null })).toBeNull()
  })

  it('reads a row out in one go', () => {
    expect(savedRowSaid(byId('ssi-kavya-office').row)).toBe('Kavya Menon in the office: expected Allow with 2FA, now Allow on 1 factor, Fail')
    expect(savedRowSaid(byId('ssi-tom-win10').row)).toBe('Tom Whelan on Windows 10: expected Deny, now Deny, Pass')
  })

  it('keeps fixed row heights for the pager to divide by', () => {
    expect(SAVED_ROW_H).toBe(60)
    expect(PEOPLE_ROW_H).toBe(56)
  })
})

describe('Run all', () => {
  const opening = librarySnapshot(judged)

  it('flashes nothing when nothing moved since the page opened', () => {
    expect(libraryFlash(opening, judged).size).toBe(0)
    expect(runAllSaid(judged, 0)).toBe('Ran 16 saved sign-ins. 2 not as expected. Nothing moved since the last run.')
  })

  it('flashes exactly the rows a change to the tenant moved', () => {
    /* HRMS turned on: the policy now decides its own people, so Kavya and
       Neha move — and Aisha, outside its audience, does not. */
    const on = showcaseTenantHrmsOn()
    const after = savedRows(on.savedSignIns, on.policies, envOf(on))
    const moved = libraryFlash(opening, after)
    expect([...moved].sort()).toEqual(['ssi-kavya-office', 'ssi-neha-home'])
    expect(after.filter((r) => r.result === 'fail')).toEqual([])
    expect(runAllSaid(after, moved.size)).toBe('Ran 16 saved sign-ins. All as expected or can’t be told. 2 moved since the last run.')
  })

  it('flashes a row saved since the last run, and nothing without a last run', () => {
    const fewer = librarySnapshot(judged.filter((r) => r.saved.id !== 'ssi-ivy-android'))
    expect([...libraryFlash(fewer, judged)]).toEqual(['ssi-ivy-android'])
    expect(libraryFlash(null, judged).size).toBe(0)
  })

  it('says one sign-in in the singular', () => {
    expect(runAllSaid([{ result: 'pass' }], 1)).toBe('Ran 1 saved sign-in. All as expected or can’t be told. 1 moved since the last run.')
  })
})

describe('the People table', () => {
  it('lists the whole directory, in its order, with each person’s group', () => {
    const all = directoryRows(people, t.groups, '', 'all')
    expect(all).toHaveLength(people.length)
    expect(all.map((r) => r.person.id)).toEqual(people.map((p) => p.id))
    expect(all.find((r) => r.person.id === 'u-hr-1')?.groupName).toBe('Human Resources')
  })

  it('searches name, group and email, and narrows by group', () => {
    expect(directoryRows(people, t.groups, 'kavya', 'all').map((r) => r.person.id)).toEqual(['u-hr-1'])
    expect(directoryRows(people, t.groups, 'human resources', 'all').every((r) => r.person.groupId === 'hr')).toBe(true)
    expect(directoryRows(people, t.groups, 'rahul.v@', 'all').map((r) => r.person.id)).toEqual(['u-sales-2'])
    const hr = directoryRows(people, t.groups, '', 'hr')
    expect(hr.length).toBeGreaterThan(0)
    expect(hr.every((r) => r.person.groupId === 'hr')).toBe(true)
    expect(directoryRows(people, t.groups, 'kavya', 'sales')).toEqual([])
  })

  it('offers All, then only groups somebody is in', () => {
    const opts = groupFilterOptions(t.groups, people)
    expect(opts[0]).toEqual({ value: 'all', label: 'All' })
    expect(opts.map((o) => o.value)).toContain('hr')
    expect(groupFilterOptions(t.groups, [{ groupId: 'hr' }]).map((o) => o.value)).toEqual(['all', 'hr'])
  })

  const form = defaultForm(people, t.apps, '2026-09-28')
  const cellsOf = (personId: string) => personRows(t.policies, t.apps, { ...form, personId }, env, t.zones)

  it('has a cell for every application, in catalogue order', () => {
    const cells = cellsOf('u-hr-1')
    expect(cells.map((c) => c.appId)).toEqual(t.apps.map((a) => a.id))
  })

  it('opens Try on the first application a tenant policy answers, else the first decided', () => {
    /* Arun is in Engineering. The Global Default decides HRMS; Outlook is the
       first application in the catalogue a policy of the tenant's own answers
       for him — Can't tell until a device is stated, which Try asks for. */
    const arun = cellsOf('arun')
    expect(arun[0].res.decidedBy?.isGlobalDefault).toBe(true)
    expect(firstDecidedApp(arun)).toBe('outlook')
    expect(arun.find((c) => c.appId === 'outlook')?.res.decidedBy?.policyId).toBe('sc-device-compliance')

    const onlyDefault = arun.map((c) => ({ ...c, res: { ...c.res, decidedBy: c.res.decidedBy && { ...c.res.decidedBy, isGlobalDefault: true } } }))
    expect(firstDecidedApp(onlyDefault)).toBe(onlyDefault.find((c) => c.res.status === 'decided')?.appId)
    expect(firstDecidedApp([])).toBeNull()
  })

  it('names the policy and rule behind a cell, and reads a row out', () => {
    expect(cellTip({ policyName: 'Global Default Policy', ruleName: 'Baseline access' })).toBe('Global Default Policy · Baseline access')
    expect(cellTip({ policyName: 'No policy decides', ruleName: '' })).toBe('No policy decides')
    const kavya = directoryRows(people, t.groups, 'kavya', 'all')[0]
    const said = personSaid(kavya, cellsOf('u-hr-1').slice(0, 1))
    expect(said).toBe('Kavya Menon, Human Resources. HRMS Allow on 1 factor')
    expect(personSaid(kavya, [])).toBe('Kavya Menon, Human Resources')
  })
})

describe('the People tab’s own sentence', () => {
  const read = peopleRowsRead(t.policies, t.apps, { zones: t.zones, fingerprints: t.fingerprints })
  const context = defaultPeopleContext('2026-09-28')

  it('is everyone, from the office, on a registered corporate laptop, at half past nine, at low risk', () => {
    expect(context).toMatchObject({
      personId: null,
      appId: null,
      origin: 'office',
      date: '2026-09-28',
      time: '09:30',
      device: { kind: 'preset', id: 'win11-registered' },
      risk: '12',
      assumeOn: null,
    })
    expect(PEOPLE_LEAD).toBe('Everyone signs in')
  })

  it('reads what SOME application’s rules read: the union over the catalogue', () => {
    /* The showcase checks devices (Developer tools, Device compliance, the
       corporate-devices policy) and a risk score (the corporate-devices
       policy's bands), so both are asked here though HRMS reads neither. */
    expect(read.rows.has('device')).toBe(true)
    expect(read.rows.has('risk')).toBe(true)
    for (const a of t.apps) {
      const one = sentenceTokens(peopleRowsRead(t.policies, [a], { zones: t.zones, fingerprints: t.fingerprints }))
      for (const tok of one) if (tok !== 'person' && tok !== 'app') expect(peopleTokens(read), `${a.id}: ${tok}`).toContain(tok)
    }
  })

  it('never names a person or an application, whatever a panel sends', () => {
    expect(peopleTokens(read)[0]).toBe('from')
    expect(peopleTokens(read)).not.toContain('person')
    expect(peopleTokens(read)).not.toContain('app')
    expect(PEOPLE_TOKENS).toEqual(['from', 'device', 'when', 'risk'])
    expect(patchContext(context, { personId: 'arun' }, 'person')).toBe(context)
    expect(patchContext(context, { appId: 'github' }, 'app')).toBe(context)
    const tor = patchContext(context, { origin: 'tor', address: '192.0.2.66', personId: 'arun' }, 'address')
    expect(tor).toMatchObject({ origin: 'tor', address: '192.0.2.66', personId: null, appId: null })
  })

  it('answers where Try’s sign-in could not: no column says Can’t tell for everyone', () => {
    const tryForm = defaultForm(people, t.apps, '2026-09-28')
    const cells = (f: typeof tryForm) => people.map((p) => personRows(t.policies, t.apps, { ...f, personId: p.id }, env, t.zones))
    const unknownColumns = (grid: ReturnType<typeof cells>) =>
      t.apps.filter((_, i) => grid.every((row) => row[i].res.status !== 'decided')).map((a) => a.id)
    /* On Try's sign-in (no device stated) whole columns cannot be told … */
    expect(unknownColumns(cells(tryForm)).length).toBeGreaterThan(0)
    /* … on the People tab's own, none. */
    expect(unknownColumns(cells(context))).toEqual([])
  })
})

describe('what the tabs keep between visits', () => {
  beforeEach(() => forgetLibraryMemory())

  it('starts empty, keeps what a tab writes, and starts again for another tenant', () => {
    const m = libraryMemory('acme')
    expect(m.saved).toEqual({ query: '', appId: 'all', level: 'all', first: null })
    expect(m.people).toEqual({ query: '', group: 'all', first: null, context: null })
    expect(m.lastRun).toBeNull()
    Object.assign(m.saved, { query: 'hrms', level: 'protected', first: 'ssi-ravi-hrms' })
    m.people.context = defaultPeopleContext('2026-09-28')
    expect(libraryMemory('acme').saved).toMatchObject({ query: 'hrms', level: 'protected', first: 'ssi-ravi-hrms' })
    expect(peopleContextOf('acme')?.device).toEqual({ kind: 'preset', id: 'win11-registered' })
    expect(peopleContextOf('globex')).toBeNull()
    expect(libraryMemory('globex').saved.query).toBe('')
    expect(libraryMemory('acme').saved.query).toBe('')
  })

  /* V4 review P5: the baseline lived in the Saved tab and was taken again on
     every mount, so a Run all after editing a policy elsewhere never
     flashed. It is the memory's now, taken once. */
  it('keeps the Run all baseline across visits, so a run after an edit elsewhere flashes what moved', () => {
    const m = libraryMemory('acme')
    seedLastRun(m, judged)
    /* The admin leaves, turns HRMS on, comes back: the tab draws again. */
    const on = showcaseTenantHrmsOn()
    const after = savedRows(on.savedSignIns, on.policies, envOf(on))
    seedLastRun(m, after)
    expect([...takeRun(m, after)].sort()).toEqual(['ssi-kavya-office', 'ssi-neha-home'])
    /* The next run compares with that one: nothing moved since. */
    expect(takeRun(m, after).size).toBe(0)
  })
})
