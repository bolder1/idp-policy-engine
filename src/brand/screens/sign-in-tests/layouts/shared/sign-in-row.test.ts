import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../../fixtures'
import { rowsRead } from '../../../testing/rows-read'
import { originPatch, type SignInForm } from '../../../testing/sign-in-form'
import type { EngineRun } from '../../engine-run'
import { emptyDraft, forRun, withDefaults } from '../../sign-in-card'
import type { RunIdentity } from '../types'
import { chipMarkOf, identityChips, rowFacts, rowState, shortName, whoLabel } from './sign-in-row'

/* The sign-in row's words over the showcase tenant: the facts in form order,
   stated ones with their value, read-but-unstated ones as Adds, the rest left
   out; and the one state tag. */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const lib = { zones: t.zones, fingerprints: t.fingerprints }

function formOf(personName: string, appName: string, patch: Partial<SignInForm> = {}) {
  const person = t.directory.people.find((p) => p.name === personName)!
  const app = t.apps.find((a) => a.name === appName)!
  const rows = rowsRead(t.policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...originPatch('office'), personId: person.id, appId: app.id }
  return { form: { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...patch } as SignInForm, rows }
}
const said = (f: ReturnType<typeof rowFacts>) => f.map((x) => (x.stated ? `${x.icon} ${x.value}` : `+ ${x.label}`))

describe('rowFacts', () => {
  it('only the facts the rules read, in form order, each with its value', () => {
    const { form, rows } = formOf('Aisha Khan', 'Google Workspace')
    expect(said(rowFacts(form, rows, { zones: t.zones }))).toEqual(['network Office network', 'laptop Windows 11 laptop · registered', 'risk Risk 12'])
  })

  it('a fact read but not stated is an Add; a phone is a phone', () => {
    const { form, rows } = formOf('Arun Patel', 'GitHub Enterprise', { device: { kind: 'none' } })
    expect(said(rowFacts(form, rows, { zones: t.zones }))).toEqual(['network Office network', '+ Device'])
    const phone = formOf('Arun Patel', 'GitHub Enterprise', { device: { kind: 'preset', id: 'android-12' } })
    expect(rowFacts(phone.form, phone.rows, { zones: t.zones })[1]).toMatchObject({ icon: 'phone', value: 'Android 12 phone' })
  })

  it('the network is always read: unstated, it is "+ Network"; a policy assumed on is said by name', () => {
    const { form, rows } = formOf('Maya Iyer', 'AWS Console', { origin: null, address: '', assumeOn: 'sc-hrms-office' })
    const f = rowFacts(form, rows, { zones: t.zones, policyName: (id) => t.policies.find((p) => p.id === id)?.name })
    expect(f[0]).toMatchObject({ field: 'address', stated: false, label: 'Network' })
    expect(f[f.length - 1]).toMatchObject({ field: 'assume-on', value: 'Assumed on: HRMS access from corporate offices', icon: 'assume' })
  })
})

describe('rowState', () => {
  const plan = { outcome: { status: 'decided', decision: '2fa' } } as unknown as EngineRun
  it('Not run first, then Changed by, then Expected with its mark (none while running)', () => {
    expect(rowState({ plan, running: false, unrun: true, changed: 'device', expected: '2fa' })).toEqual({ kind: 'unrun', words: 'Not run' })
    expect(rowState({ plan, running: false, changed: 'device', expected: '2fa' })).toEqual({ kind: 'changed', words: 'Changed by device' })
    expect(rowState({ plan, running: false, changed: null, expected: '2fa' })).toEqual({ kind: 'expected', words: 'Expected Allow with 2FA', met: true })
    expect(rowState({ plan, running: false, changed: null, expected: 'deny' })).toMatchObject({ met: false })
    expect(rowState({ plan, running: true, changed: null, expected: 'deny' })).toMatchObject({ met: null })
    expect(rowState({ plan, running: false, changed: null, expected: null })).toBeNull()
  })
  it('the Who → App button is named for the whole sign-in', () => {
    expect(whoLabel('Maya Iyer', 'AWS Console')).toBe('Edit sign-in: Maya Iyer on AWS Console')
  })
})

/* Several identities in one Run (owner, 5 Oct 2026: "one run each, switch"): a chip each, in pick order; the answer
   marked only once the run on screen has landed; one identity draws no chips at all. */
describe('identityChips', () => {
  const planOf = (status: string, decision: string | null, empty = false) => ({ empty, outcome: { status, decision } }) as unknown as EngineRun
  const ids: RunIdentity[] = [
    { key: 'u-maya', kind: 'user', name: 'Maya Iyer', active: true, plan: planOf('decided', '1fa') },
    { key: 'group:finance', kind: 'group', name: 'Finance', active: false, plan: planOf('decided', '2fa') },
    { key: 'u-it-1', kind: 'user', name: 'Ravi Menon', active: false, plan: planOf('decided', 'deny') },
    { key: 'group:eng-managers', kind: 'group', name: 'Engineering managers', active: false, plan: planOf('depends', null) },
    { key: 'u-x', kind: 'user', name: 'Aisha Khan', active: false, plan: planOf('incomplete', null) },
  ]

  it('none for one identity, or none at all: the row is the Who → App it always was', () => {
    expect(identityChips(undefined, true)).toBeNull()
    expect(identityChips(ids.slice(0, 1), true)).toBeNull()
  })

  it('a chip each, in pick order, the one on the canvas active', () => {
    const chips = identityChips(ids, true)!
    expect(chips.map((c) => c.key)).toEqual(ids.map((i) => i.key))
    expect(chips.filter((c) => c.active).map((c) => c.name)).toEqual(['Maya Iyer'])
  })

  it('marks each answer once landed — allow, 2FA, deny, depends, none — and named with its words', () => {
    const chips = identityChips(ids, true)!
    expect(chips.map((c) => c.mark)).toEqual(['allow', '2fa', 'deny', 'depends', 'none'])
    expect(chips.map((c) => c.label)).toEqual(['Maya Iyer, Allow on 1 factor', 'Finance, Allow with 2FA', 'Ravi Menon, Deny', 'Engineering managers, Depends', 'Aisha Khan, No policy decides'])
  })

  it('marks nothing before the run on screen has landed: no result ahead of the story', () => {
    const chips = identityChips(ids, false)!
    expect(chips.every((c) => c.mark === null)).toBe(true)
    expect(chips.map((c) => c.label)).toEqual(ids.map((i) => i.name))
    expect(identityChips([{ ...ids[0], plan: planOf('decided', '1fa', true) }, ids[1]], true)![0].mark).toBeNull()
  })

  it('folds a person to the first name and cuts a long group name', () => {
    expect(shortName('user', 'Maya Iyer')).toBe('Maya')
    expect(shortName('group', 'Finance')).toBe('Finance')
    expect(shortName('group', 'Engineering managers')).toBe('Engineeri…')
    expect([...shortName('group', 'Engineering managers')].length).toBeLessThanOrEqual(10)
    expect(chipMarkOf(planOf('decided', '2fa'))).toBe('2fa')
  })
})
