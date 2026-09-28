import { describe, expect, it } from 'vitest'

import { fallbackRule, type Policy } from '../data'
import { showcaseTenantHrmsOn } from '../fixtures'
import { changeOf, monitorRows, monitorSamples, planLine, planOf, type MonitorRow } from './monitor-sample'
import { decidingRuleName, fromCell, ifOnCell, orderRows, showWhyLabel, todayCell, whyOf } from './monitoring-model'
import { envOf, type TenantResolution } from './tenant-resolver'

/* The Monitoring page's table in words (spec C §3.4, final C.5), on the
   showcase tenant with HRMS switched to monitoring: the order the rows run in,
   what each cell says, and what Show why reads out. */

/* These scenes read HRMS deciding, so they run on the tenant once it is
   turned on; the seed opens with HRMS Inactive (Phase 4). */
const t = showcaseTenantHrmsOn()
const env = envOf(t)
const HRMS_ID = 'sc-hrms-office'
const monitoring = t.policies.map((p): Policy => (p.id === HRMS_ID ? { ...p, status: 'monitor' } : p))
const hrms = monitoring.find((p) => p.id === HRMS_ID)!
const MONDAY = new Date(Date.UTC(2026, 8, 28))
const modelled = monitorRows(hrms, monitoring, env, monitorSamples(hrms, env, MONDAY))
const rows = orderRows(modelled)

const at = (address: string, person: string) => rows.find((r) => r.sample.address === address && r.sample.personName === person)!

describe('the order', () => {
  it('runs 2FA, then deny, then unchanged, newest first within each (acceptance 5)', () => {
    expect(rows.map((r) => r.change)).toEqual([...Array(3).fill('to-2fa'), ...Array(5).fill('to-deny'), ...Array(4).fill('unchanged')])
    const moments = (change: string) => rows.filter((r) => r.change === change).map((r) => `${r.sample.facts.when?.date} ${r.sample.time}`)
    for (const change of ['to-2fa', 'to-deny', 'unchanged']) {
      const m = moments(change)
      expect(m).toEqual([...m].sort().reverse())
    }
  })

  it('puts the looser move first and can’t-tell before unchanged', () => {
    const tag = (r: MonitorRow, change: MonitorRow['change']): MonitorRow => ({ ...r, change })
    const [a, b, c, d, e] = modelled
    expect(orderRows([tag(a, 'unchanged'), tag(b, 'cant-tell'), tag(c, 'to-deny'), tag(d, 'to-2fa'), tag(e, 'to-1fa')]).map((r) => r.change)).toEqual([
      'to-1fa',
      'to-2fa',
      'to-deny',
      'cant-tell',
      'unchanged',
    ])
  })

  it('keeps the modelled order for two sign-ins at the same moment', () => {
    const twin = { ...modelled[0], sample: { ...modelled[0].sample, id: 'twin' } }
    expect(orderRows([modelled[0], twin]).map((r) => r.sample.id)).toEqual([modelled[0].sample.id, 'twin'])
  })
})

describe('the cells', () => {
  it('says Today as the Global Default decides it, on every row (acceptance 5)', () => {
    for (const r of rows) expect(todayCell(r.today)).toEqual({ kind: 'decided', decision: '1fa', by: 'Global Default Policy' })
  })

  it('says what the office would get, and which rule gives it', () => {
    const office = at('203.0.113.24', 'Kavya Menon')
    expect(ifOnCell(office, hrms)).toEqual({ kind: 'would', decision: '2fa', word: 'Would allow with 2FA', sub: 'In a corporate office' })
    expect(fromCell(office.sample)).toEqual({ place: 'Pune, India', address: '203.0.113.24' })
    expect(showWhyLabel(office.sample)).toBe('Show why: Kavya Menon, Sun 09:30')
  })

  it('says a sign-in from home would be denied by the last row', () => {
    expect(ifOnCell(at('192.0.2.10', 'Priya Sharma'), hrms)).toEqual({ kind: 'would', decision: 'deny', word: 'Would deny', sub: 'Nothing else matched' })
  })

  it('says No change for somebody outside the audience, and names no place for an anonymiser', () => {
    const outsider = rows.find((r) => r.sample.address === '192.0.2.66')!
    expect(ifOnCell(outsider, hrms)).toEqual({ kind: 'no-change', sub: 'Not in audience' })
    expect(fromCell(outsider.sample).place).toBe('Place not found')
  })

  it('says which policy still applies first when turning it on would not make it decide', () => {
    /* A monitor on the DEFAULT group beside the custom-group HRMS policy, which stays on. */
    const wide: Policy = { ...t.policies.find((p) => p.id === HRMS_ID)!, id: 'mon-wide', name: 'HRMS for everyone', status: 'monitor', audience: { everyone: true, groupIds: [], userIds: [] } }
    const list = [...t.policies, wide]
    const r = monitorRows(wide, list, env, monitorSamples(wide, env, MONDAY)).find((x) => x.sample.personName === 'Kavya Menon')!
    expect(r.change).toBe('unchanged')
    expect(ifOnCell(r, wide)).toEqual({ kind: 'no-change', sub: 'When on: HRMS access from corporate offices applies first' })
  })

  it('says what it would decide, as text, when that is what the tenant decides already', () => {
    const lax: Policy = { ...hrms, id: 'mon-lax', rules: [], fallback: fallbackRule('1fa') }
    const r = monitorRows(lax, [...monitoring, lax], env, monitorSamples(lax, env, MONDAY))[0]
    expect(r.change).toBe('unchanged')
    expect(ifOnCell(r, lax)).toEqual({ kind: 'no-change', sub: 'Would allow on 1 factor' })
  })

  it('says grey Can’t tell, and what it could be, when turned on it could go either way', () => {
    const office = at('203.0.113.24', 'Kavya Menon')
    const depends: TenantResolution = {
      ...office.ifOn,
      status: 'depends',
      decision: null,
      possible: [
        { decision: '2fa', ruleIndex: 0, ruleName: 'In a corporate office', assumes: [] },
        { decision: 'deny', ruleIndex: null, ruleName: 'Nothing else matched', assumes: [] },
      ],
    }
    const row: MonitorRow = { ...office, ifOn: depends, change: changeOf(office.today, depends) }
    expect(row.change).toBe('cant-tell')
    expect(ifOnCell(row, hrms)).toEqual({ kind: 'cant-tell', reach: ['deny', '2fa'], sub: '' })
    expect(decidingRuleName(depends)).toBeNull()
  })

  it('says grey Can’t tell, never a badge, when today can’t be told and turned on it can — as the plan line counts it', () => {
    const home = at('192.0.2.10', 'Priya Sharma')
    const depends: TenantResolution = {
      ...home.today,
      status: 'depends',
      decision: null,
      possible: [
        { decision: '1fa', ruleIndex: null, ruleName: 'Nothing else matched', assumes: [] },
        { decision: 'deny', ruleIndex: 0, ruleName: 'Somewhere else', assumes: [] },
      ],
    }
    const row: MonitorRow = { ...home, today: depends, change: changeOf(depends, home.ifOn) }
    expect(row.change).toBe('cant-tell')
    expect(todayCell(row.today)).toEqual({ kind: 'depends', reach: ['deny', '1fa'], by: 'Global Default Policy' })
    expect(ifOnCell(row, hrms)).toEqual({ kind: 'cant-tell', reach: [], sub: 'Would deny' })
    expect(planLine(planOf([row]))).toBe("If turned on: 0 to allow on 1 factor, 0 to allow with 2FA, 0 to deny, 0 unchanged, 1 can't tell.")
  })

  it('draws a badge for every move the plan line counts, and for nothing else', () => {
    const plan = planOf(rows)
    const badges = rows.filter((r) => ifOnCell(r, hrms).kind === 'would').length
    expect(badges).toBe(plan.to1fa + plan.to2fa + plan.toDeny)
    expect(rows.filter((r) => ifOnCell(r, hrms).kind === 'cant-tell').length).toBe(plan.cantTell)
  })

  it('says No policy decides today when the tenant has no Global Default, and buckets by what it would get', () => {
    const noDefault = monitoring.filter((p) => !p.isSystem)
    const r = orderRows(monitorRows(hrms, noDefault, env, monitorSamples(hrms, env, MONDAY)))
    for (const row of r) expect(todayCell(row.today)).toEqual({ kind: 'none' })
    expect(planLine(planOf(r))).toBe('If turned on: 0 to allow on 1 factor, 3 to allow with 2FA, 5 to deny, 4 unchanged.')
    expect(r.map((row) => row.change)).toEqual([...Array(3).fill('to-2fa'), ...Array(5).fill('to-deny'), ...Array(4).fill('unchanged')])
    /* The four outside the audience: nothing decides them today, nor once it is on. */
    for (const row of r.filter((x) => x.change === 'unchanged')) {
      expect(ifOnCell(row, hrms)).toEqual({ kind: 'no-change', sub: 'Not in audience' })
      expect(whyOf(row, hrms, env)).toEqual({ kind: 'standing', line: 'Not in audience: Human Resources, Finance' })
    }
  })
})

describe('Show why', () => {
  it('reads the rule that decides, and its lines, straight from the trace (acceptance 6)', () => {
    const why = whyOf(at('192.0.2.10', 'Priya Sharma'), hrms, env)
    expect(why.kind).toBe('rules')
    if (why.kind !== 'rules') return
    expect(why.decidedBy).toBe('Nothing else matched')
    expect(why.rules.map((r) => [r.number, r.name, r.word])).toEqual([
      ['1', 'In a corporate office', 'No match'],
      ['', 'Nothing else matched', 'Matched'],
    ])
    expect(why.rules[0].lines.map((l) => [l.label, l.actual, l.status])).toEqual([
      ['Who', 'Priya Sharma', 'pass'],
      ['Network', '192.0.2.10', 'fail'],
      ['Place', 'Pune (looked up)', 'pass'],
    ])
  })

  it('stops at the rule that decides', () => {
    const why = whyOf(at('203.0.113.24', 'Kavya Menon'), hrms, env)
    expect(why.kind === 'rules' && why.rules.map((r) => r.word)).toEqual(['Matched'])
  })

  it('gives one line, the standing, for somebody the policy would still not decide', () => {
    expect(whyOf(rows.find((r) => r.change === 'unchanged')!, hrms, env)).toEqual({ kind: 'standing', line: 'Not in audience: Human Resources, Finance' })
  })
})
