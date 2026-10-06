import { describe, expect, it } from 'vitest'

import type { AccessDecision, Policy } from '../../data'
import { showcaseTenant } from '../../fixtures'
import type { ColumnView } from '../board/try-sign-in'
import { TENANT_TZ } from '../sign-in-facts'
import { DEVICE_PRESETS, devicePreset } from './device-presets'
import { rowsRead, type RowId, type RowsRead } from './rows-read'
import type { FieldOption } from './sign-in-fields'
import { ADDRESS_ERROR, ORIGIN_PRESETS, RISK_ERROR, typedAddressPatch, type SignInForm } from './sign-in-form'
import {
  AS_IF_HEADING,
  CONNECTOR,
  GLOBAL_SCOPE,
  NO_DEVICE_CHOICE,
  TOKENS,
  UNSET_WORDS,
  answerWords,
  appChoices,
  boardScope,
  deviceChoiceOf,
  deviceChoices,
  deviceOfChoice,
  filterChoices,
  groupChoices,
  nextToken,
  originChoices,
  sentenceTokens,
  sentenceWords,
  tokenDomId,
  tokenIssue,
  tokenName,
  tokenOfField,
  tokenValue,
  verdictLabel,
  verdictParts,
  weekdayOf,
} from './sign-in-sentence'

/* The sign-in sentence's words and rules (sign-in-sentence.ts), on the
   showcase tenant: which pills a sentence has, what each says, which
   applications a policy's sentence may name, and when the verdict is one pill
   or two. The component draws these; sign-in-sentence-ui.test.tsx is the join. */

const t = showcaseTenant()
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const policy = (id: string): Policy => t.policies.find((p) => p.id === id)!
const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones }
const rowsOf = (...ids: RowId[]): RowsRead => ({ rows: new Set(ids), device: new Set() })

/* Arun Patel on GitHub from the office, at 09:30 on Monday 28 Sep, on the
   registered laptop at risk 12: the board's own first sign-in for Developer
   tools, written out so each test changes one fact. */
const BASE: SignInForm = {
  personId: 'arun',
  appId: 'github',
  origin: 'office',
  address: '203.0.113.24',
  addressSource: 'stated',
  place: { kind: 'from-address' },
  date: '2026-09-28',
  time: '09:30',
  timeZone: TENANT_TZ,
  device: { kind: 'preset', id: 'win11-registered' },
  risk: '12',
  assumeOn: null,
}
const form = (patch: Partial<SignInForm> = {}): SignInForm => ({ ...BASE, ...patch })

describe('which tokens a sentence has', () => {
  it('always states who, to what and from where, in that order', () => {
    expect(sentenceTokens(rowsOf())).toEqual(['person', 'app', 'from'])
  })

  it('adds the device, the time and the risk only where a rule reads them, in sentence order', () => {
    expect(sentenceTokens(rowsOf('risk', 'device', 'when'))).toEqual(['person', 'app', 'from', 'device', 'when', 'risk'])
    expect(sentenceTokens(rowsOf('risk'))).toEqual(['person', 'app', 'from', 'risk'])
    expect(sentenceTokens(rowsOf('when'))).toEqual(['person', 'app', 'from', 'when'])
  })

  it('never gives the place, the distance or the time ruler a pill of their own: they live inside From and When', () => {
    expect(sentenceTokens(rowsOf('place', 'distance', 'time-track'))).toEqual(['person', 'app', 'from'])
  })

  /* HRMS never checks the device, but the Global Default on the same
     application does since its baseline (30 Sep 2026), so HRMS's sentence
     has the device pill too; against a Global Default that reads nothing it
     has none. */
  it('reads the showcase: Developer tools checks the device on GitHub, HRMS never does', () => {
    expect(sentenceTokens(rowsRead(t.policies, policy('sc-dev-tools'), 'github', lib))).toEqual(['person', 'app', 'from', 'device'])
    expect(sentenceTokens(rowsRead(t.policies, policy('sc-hrms-office'), 'hrms', lib))).toEqual(['person', 'app', 'from', 'device'])
    const bare = t.policies.map((p) => (p.isSystem ? { ...p, rules: [] } : p))
    expect(sentenceTokens(rowsRead(bare, policy('sc-hrms-office'), 'hrms', lib))).toEqual(['person', 'app', 'from'])
    expect(sentenceTokens(rowsRead(t.policies, policy('sc-corporate-devices'), 'google-workspace', lib))).toEqual(['person', 'app', 'from', 'device', 'risk'])
  })

  it('moves Tab to the next token in THIS sentence, and nowhere after its last', () => {
    const tokens = sentenceTokens(rowsOf('risk'))
    expect(nextToken(tokens, 'person')).toBe('app')
    expect(nextToken(tokens, 'from')).toBe('risk')
    expect(nextToken(tokens, 'risk')).toBeNull()
    expect(nextToken(tokens, 'device')).toBeNull()
  })

  it('joins the pills with plain words, and none before the person', () => {
    expect(TOKENS.map((tk) => CONNECTOR[tk])).toEqual(['', 'signs in to', 'from', 'on', 'at', 'with risk'])
  })
})

describe('what a token says', () => {
  it('names the person by name, with their face; nobody chosen is a grey instruction', () => {
    expect(tokenValue('person', form(), ctx)).toMatchObject({ label: 'Person', text: 'Arun Patel', unset: false, mark: { kind: 'face', name: 'Arun Patel' } })
    expect(tokenValue('person', form({ personId: null }), ctx)).toMatchObject({ text: 'Choose a person', unset: true, mark: { kind: 'icon', icon: 'person' } })
    /* Somebody no longer in the directory reads as nobody, not as an id. */
    expect(tokenValue('person', form({ personId: 'gone' }), ctx).text).toBe('Choose a person')
  })

  it('names the application with its logo', () => {
    expect(tokenValue('app', form(), ctx)).toMatchObject({ text: 'GitHub Enterprise', unset: false, mark: { kind: 'logo', appId: 'github' } })
    expect(tokenValue('app', form({ appId: null }), ctx)).toMatchObject({ text: 'Choose an application', unset: true })
  })

  it('says where from as the admin chose it: the origin, the typed address, or Anywhere', () => {
    expect(tokenValue('from', form(), ctx)).toMatchObject({ text: 'Office network', mark: { kind: 'icon', icon: 'office' } })
    expect(tokenValue('from', form({ origin: 'tor', address: '192.0.2.66' }), ctx)).toMatchObject({ text: 'Tor exit', mark: { icon: 'tor' } })
    expect(tokenValue('from', form(typedAddressPatch('192.0.2.50')), ctx)).toMatchObject({ text: '192.0.2.50', unset: false, mark: { icon: 'address' } })
    /* Typed but not an address yet: said as typed; the error is the token's name, not its text. */
    expect(tokenValue('from', form(typedAddressPatch('203.0.113')), ctx).text).toBe('203.0.113')
    expect(tokenValue('from', form({ origin: null, address: '' }), ctx)).toMatchObject({ text: UNSET_WORDS.from, unset: true, mark: { icon: 'anywhere' } })
  })

  it('adds a stated place to From only where a rule reads a place', () => {
    const pune = form({ place: { kind: 'stated', placeId: 'in-maharashtra-pune' } })
    expect(tokenValue('from', pune, { ...ctx, rows: rowsOf('place') }).text).toBe('Office network · Pune')
    expect(tokenValue('from', pune, { ...ctx, rows: rowsOf() }).text).toBe('Office network')
    /* A point on the distance ruler is said the ruler's way. */
    const ruler = form({ place: { kind: 'distance', zoneId: 'corp-offices', rangeIndex: 0, km: 30 } })
    expect(tokenValue('from', ruler, { ...ctx, rows: rowsOf('place', 'distance') }).text).toBe('Office network · 30 km from Pune')
    /* Looked up from the address, the place is the address's: nothing more to say. */
    expect(tokenValue('from', form(), { ...ctx, rows: rowsOf('place') }).text).toBe('Office network')
  })

  it('names a device by its preset, with its platform mark', () => {
    expect(tokenValue('device', form(), ctx)).toMatchObject({ text: 'Windows 11 laptop · registered', mark: { kind: 'platform', platform: 'windows' } })
    expect(tokenValue('device', form({ device: { kind: 'preset', id: 'android-12' } }), ctx).mark).toEqual({ kind: 'platform', platform: 'android' })
    expect(tokenValue('device', form({ device: { kind: 'none' } }), ctx)).toMatchObject({ text: 'Any device', unset: true, mark: { kind: 'icon', icon: 'device' } })
  })

  it('names an edited device a custom one, marked by its platform where it has one to show', () => {
    const custom = form({ device: { kind: 'custom', facts: { ...devicePreset('iphone').facts, osVersion: '16.0' } } })
    expect(tokenValue('device', custom, ctx)).toMatchObject({ text: 'Custom device', unset: false, mark: { kind: 'platform', platform: 'ios' } })
    const linux = form({ device: { kind: 'custom', facts: { source: 'stated', platform: 'linux' } } })
    expect(tokenValue('device', linux, ctx).mark).toEqual({ kind: 'icon', icon: 'device' })
  })

  it('says when as the time and the day, and the zone only when it is not the tenant’s', () => {
    expect(weekdayOf('2026-09-28')).toBe('Mon')
    expect(weekdayOf('28/09/2026')).toBeNull()
    expect(tokenValue('when', form(), ctx)).toMatchObject({ text: '09:30 Mon', mark: { kind: 'icon', icon: 'clock' } })
    expect(tokenValue('when', form({ date: '' }), ctx).text).toBe('09:30')
    expect(tokenValue('when', form({ timeZone: 'Europe/London' }), ctx).text).toBe('09:30 Mon · London')
    expect(tokenValue('when', form({ date: '', time: '' }), ctx)).toMatchObject({ text: 'Any time', unset: true })
  })

  /* 6 Oct 2026: a date with the time cleared is stated (factsOf), and a temporary access grant ends on it — the pill
     said "Any time" in grey while that date refused the person. The date alone, no weekday: without the hour it is not read. */
  it('says a date with no time as the date, stated', () => {
    expect(tokenValue('when', form({ time: '' }), ctx)).toMatchObject({ text: '28 Sep 2026', unset: false })
    expect(tokenValue('when', form({ time: '', timeZone: 'Europe/London' }), ctx).text).toBe('28 Sep 2026 · London')
  })

  it('says the risk as the number alone — "with risk" before it says the rest', () => {
    expect(tokenValue('risk', form(), ctx)).toMatchObject({ label: 'Device risk score', text: '12', unset: false })
    expect(tokenValue('risk', form({ risk: '  ' }), ctx)).toMatchObject({ text: 'Not stated', unset: true })
  })

  it('names a token by what it states and its value, and the error after', () => {
    expect(tokenName(tokenValue('person', form(), ctx))).toBe('Person: Arun Patel')
    const bad = form(typedAddressPatch('203.0.113'))
    const issues = [{ field: 'address' as const, message: ADDRESS_ERROR }]
    expect(tokenName(tokenValue('from', bad, ctx), tokenIssue('from', issues))).toBe('From: 203.0.113, Enter an IPv4 or IPv6 address')
  })

  it('files each field’s error under the token that states it', () => {
    const issues = [
      { field: 'risk' as const, message: RISK_ERROR },
      { field: 'address' as const, message: ADDRESS_ERROR },
    ]
    expect(tokenIssue('from', issues)).toBe(ADDRESS_ERROR)
    expect(tokenIssue('risk', issues)).toBe(RISK_ERROR)
    expect(tokenIssue('person', issues)).toBeUndefined()
    expect(tokenOfField('place')).toBe('from')
    expect(tokenOfField('address')).toBe('from')
    expect(tokenOfField('when')).toBe('when')
    expect(tokenOfField('assume-on')).toBeNull()
  })

  it('keeps each token’s id the id its field’s row had, so a "Needs:" link still lands', () => {
    expect(tokenDomId('bb-try', 'from')).toBe('bb-try-address')
    expect(tokenDomId('bb-try', 'person')).toBe('bb-try-person')
    expect(tokenDomId('bb-try', 'risk')).toBe('bb-try-risk')
  })

  it('reads the whole sentence as words', () => {
    expect(sentenceWords(form(), { ...ctx, rows: rowsOf('device', 'when') })).toBe(
      'Arun Patel signs in to GitHub Enterprise from Office network on Windows 11 laptop · registered at 09:30 Mon',
    )
    expect(sentenceWords(form(), { ...ctx, rows: rowsOf() })).toBe('Arun Patel signs in to GitHub Enterprise from Office network')
  })
})

describe('which applications a sentence may name', () => {
  const names = (s: Parameters<typeof appChoices>[0]) => appChoices(s, t.apps).options.map((o) => o.label)

  it('lists only a policy’s own applications, in the catalogue’s order', () => {
    expect(appChoices(boardScope(policy('sc-dev-tools')), t.apps)).toEqual({
      options: [
        { value: 'github', label: 'GitHub Enterprise' },
        { value: 'jira', label: 'Jira' },
      ],
    })
    expect(names({ appIds: ['dropbox', 'hrms'] })).toEqual(['HRMS', 'Dropbox'])
  })

  it('lists every application for the Global Default and on Sign-in tests, with no heading', () => {
    expect(boardScope(policy('global-default')).appIds).toBe('all')
    expect(appChoices(boardScope(policy('global-default')), t.apps)).toEqual({ options: t.apps.map((a) => ({ value: a.id, label: a.name })) })
    expect(appChoices(GLOBAL_SCOPE, t.apps).heading).toBeUndefined()
    expect(names(GLOBAL_SCOPE)).toHaveLength(t.apps.length)
  })

  it('lists every application "As if on" for a draft that has none yet', () => {
    const draft = { ...policy('sc-dev-tools'), appIds: [] }
    expect(boardScope(draft)).toMatchObject({ appIds: [], asIf: true })
    const { options, heading } = appChoices(boardScope(draft), t.apps)
    expect(heading).toBe(AS_IF_HEADING)
    expect(options).toHaveLength(t.apps.length)
    /* An empty list is read as a draft with none, never as nothing to choose. */
    expect(appChoices({ appIds: [] }, t.apps).heading).toBe('As if on')
  })

  it('carries the policy’s audience, so its people are listed first', () => {
    expect(boardScope(policy('sc-dev-tools')).audience).toEqual(policy('sc-dev-tools').audience)
    expect(GLOBAL_SCOPE.audience).toBeUndefined()
  })
})

describe('what a panel lists', () => {
  it('offers the four origins with their addresses', () => {
    expect(originChoices()).toEqual(ORIGIN_PRESETS.map((o) => ({ value: o.id, label: o.label, meta: o.address })))
    expect(originChoices().map((o) => o.label)).toEqual(['Office network', 'Branch office', 'Home broadband', 'Tor exit'])
  })

  it('offers Any device first, then every preset with its platform, phones first', () => {
    const rows = deviceChoices()
    expect(rows[0]).toEqual({ value: NO_DEVICE_CHOICE, label: 'Any device', meta: 'Not stated' })
    expect(rows.slice(1)).toEqual(DEVICE_PRESETS.map((p) => ({ value: p.id, label: p.label, platform: p.platform })))
  })

  it('turns a device row into the device it states, and back', () => {
    expect(deviceOfChoice('iphone')).toEqual({ kind: 'preset', id: 'iphone' })
    expect(deviceOfChoice(NO_DEVICE_CHOICE)).toEqual({ kind: 'none' })
    expect(deviceOfChoice('no-such-device')).toEqual({ kind: 'none' })
    expect(deviceChoiceOf({ kind: 'preset', id: 'win10' })).toBe('win10')
    expect(deviceChoiceOf({ kind: 'none' })).toBe(NO_DEVICE_CHOICE)
    /* A custom device has no row: the token names it. */
    expect(deviceChoiceOf({ kind: 'custom', facts: { source: 'stated' } })).toBeNull()
  })

  it('searches the label and the line under it, trimmed and in any case', () => {
    const rows = originChoices()
    expect(filterChoices(rows, '  HOME ').map((r) => r.value)).toEqual(['home'])
    expect(filterChoices(rows, '198.51').map((r) => r.value)).toEqual(['branch'])
    expect(filterChoices(rows, ' ')).toEqual(rows)
    expect(filterChoices(rows, ' ')).not.toBe(rows)
    expect(filterChoices(rows, 'nowhere')).toEqual([])
  })

  it('puts a heading where the group changes, in the order given', () => {
    const rows = [
      { value: 'a', label: 'A', group: 'In this policy' },
      { value: 'b', label: 'B', group: 'In this policy' },
      { value: 'c', label: 'C', group: 'Not in this policy' },
    ]
    expect(groupChoices(rows).map((g) => [g.heading, g.items.map((i) => i.value)])).toEqual([
      ['In this policy', ['a', 'b']],
      ['Not in this policy', ['c']],
    ])
    const lone: FieldOption[] = [{ value: 'x', label: 'X' }]
    expect(groupChoices(lone)).toEqual([{ heading: undefined, items: lone }])
  })
})

describe('the verdict', () => {
  const col = (id: ColumnView['id'], label: string, status: ColumnView['status'], decision: AccessDecision | null = null): ColumnView => ({
    id,
    label,
    tip: '',
    status,
    policyName: null,
    line: '',
    decision,
    possible: [],
  })
  const live = col('live', 'Live', 'decided', '1fa')
  const editsDeny = col('edits', 'Your edits', 'decided', 'deny')

  it('is the one answer when there is one column', () => {
    expect(verdictParts([live])).toEqual({ single: live })
    expect(verdictLabel([live])).toBe('Allow on 1 factor')
  })

  it('is the right-hand answer alone when both columns say the same', () => {
    const edits1fa = col('edits', 'Your edits', 'decided', '1fa')
    expect(verdictParts([live, edits1fa])).toEqual({ single: edits1fa })
  })

  it('is two pills, left then right, when the answers differ, named as one', () => {
    expect(verdictParts([live, editsDeny])).toEqual({ from: live, to: editsDeny })
    expect(verdictLabel([live, editsDeny])).toBe('Live Allow on 1 factor, Your edits Deny')
    const today = col('today', 'Today', 'decided', '2fa')
    const draft = col('draft', 'Draft', 'depends')
    expect(verdictLabel([today, draft])).toBe('Today Allow with 2FA, Draft Depends')
  })

  it('counts two Depends, or two Can’t tells, as the same answer', () => {
    const a = col('today', 'Today', 'depends')
    const b = col('stored', 'Stored version', 'depends')
    expect(verdictParts([a, b])).toEqual({ single: b })
    const c = col('live', 'Live', 'incomplete')
    const d = col('edits', 'Your edits', 'incomplete')
    expect(verdictParts([c, d])).toEqual({ single: d })
    expect(verdictLabel([c, d])).toBe("Can't tell")
  })

  it('says nothing with no columns', () => {
    expect(verdictParts([])).toEqual({})
    expect(verdictLabel([])).toBe('')
  })

  it('words an answer as a decision, Depends, or Can’t tell', () => {
    expect(answerWords(editsDeny)).toBe('Deny')
    expect(answerWords(col('draft', 'Draft', 'depends'))).toBe('Depends')
    expect(answerWords(col('draft', 'Draft', 'incomplete'))).toBe("Can't tell")
  })
})
