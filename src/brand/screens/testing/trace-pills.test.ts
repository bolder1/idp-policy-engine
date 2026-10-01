import { describe, expect, it } from 'vitest'

import { card, cond, rule, when, type Policy, type Rule } from '../../data'
import { showcaseTenant } from '../../fixtures'
import type { ColumnView } from '../board/try-sign-in'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { LAST_ROW, evidenceOf, type CardEvidence, type EvidenceLine } from './evidence'
import { defaultBoardForm, factsOf, originPatch, type SignInForm } from './sign-in-form'
import {
  answerWord,
  cardTone,
  cardWord,
  checkPills,
  dayText,
  nameLookupOf,
  outcomeOf,
  shortNames,
  versionPair,
  windowText,
  type CheckPill,
} from './trace-pills'

/* The pills a card carries in test mode, on the showcase tenant: Developer
   tools, the policy the spec's walkthrough opens (TESTING-V4 §6), for the
   three sign-ins the owner reads first — Arun in the office, Arun at home, and
   a contractor the policy is not for. What is pinned is the few words each
   pill says and its glyph, because that is what replaced the evidence
   sentences on the card. */

const t = showcaseTenant()
const env = envOf(t)
const TODAY = '2026-09-28'
const names = nameLookupOf({ zones: t.zones, fingerprints: t.fingerprints, groups: t.groups, users: t.directory.people, hooks: t.hooks })
const devTools = t.policies.find((p) => p.id === 'sc-dev-tools')!
const [office, remote] = devTools.rules
const board = (p: Policy, patch: Partial<SignInForm> = {}) => ({ ...defaultBoardForm(p, t.directory.people, t.apps, TODAY), ...patch })

/** The deciding policy's cards for a form, as evidence.ts files them. */
function cards(p: Policy, form: SignInForm): Record<string, CardEvidence> {
  const { facts } = factsOf(form, t.zones)
  const res = resolveSignIn(t.policies, facts, env)
  return evidenceOf(p, res.decidedBy?.policyId === p.id ? res.trace : null, facts, env)
}
const said = (p: CheckPill) => `${p.category} | ${p.text} | ${p.status}`

describe('Arun in the office, the default run on Developer tools', () => {
  const form = board(devTools)
  const ev = cards(devTools, form)

  it('is Arun on GitHub from the office network', () => {
    expect(form.personId).toBe('arun')
    expect(form.appId).toBe('github')
    expect(form.origin).toBe('office')
  })

  it('passes every pill on rule 1, one per evidence line, in the words the rule was written in', () => {
    const pills = checkPills(office, ev[office.id], names)
    expect(pills.map((p) => p.key)).toEqual(ev[office.id].lines.map((l) => l.key))
    expect(pills.map(said)).toEqual([
      'who | Engineering, DevOps | pass',
      'network | Corporate offices · IP | pass',
      'place | Corporate offices · Location | pass',
      'device | Compliant devices | pass',
    ])
    expect(cardTone(ev[office.id].state)).toBe('lit')
    expect(cardWord(ev[office.id].state)).toBeNull()
  })

  it('carries the evidence sentence in the tooltip, never on the pill', () => {
    const [, network] = checkPills(office, ev[office.id], names)
    expect(network.tip.split('\n')[0]).toBe('203.0.113.24 · in 203.0.113.0/24, 198.51.100.0/24')
    expect(network.text).not.toContain('203.0.113')
  })

  it('never reaches rule 2 or the last row: no pills, dimmed, and the word says so', () => {
    expect(checkPills(remote, ev[remote.id], names)).toEqual([])
    expect(cardTone(ev[remote.id].state)).toBe('dim')
    expect(cardWord(ev[remote.id].state)).toBe('Not reached')
    expect(checkPills(null, ev[LAST_ROW], names)).toEqual([])
  })
})

describe('Arun on home broadband', () => {
  const ev = cards(devTools, board(devTools, originPatch('home')))

  it('fails the network pill on rule 1 and passes the place, so rule 1 is missed', () => {
    const pills = checkPills(office, ev[office.id], names)
    const network = pills.find((p) => p.category === 'network')!
    expect(said(network)).toBe('network | Corporate offices · IP | fail')
    expect(network.tip.split('\n')[0]).toBe('192.0.2.10 · in 203.0.113.0/24, 198.51.100.0/24')
    expect(said(pills.find((p) => p.category === 'place')!)).toBe('place | Corporate offices · Location | pass')
    expect(pills.filter((p) => p.status === 'fail')).toHaveLength(1)
    expect(cardTone(ev[office.id].state)).toBe('missed')
    expect(cardWord(ev[office.id].state)).toBe('No match')
  })

  it('lands on rule 2, which passes its own pills', () => {
    expect(checkPills(remote, ev[remote.id], names).map(said)).toEqual(['who | Engineering, DevOps | pass', 'device | Compliant devices | pass'])
    expect(cardTone(ev[remote.id].state)).toBe('lit')
  })
})

describe('a device that fails the profile', () => {
  const ev = cards(devTools, board(devTools, { device: { kind: 'preset', id: 'android-12' } }))

  it('fails the profile pill and names the check that sank it in a pill of its own', () => {
    expect(checkPills(office, ev[office.id], names).map(said)).toEqual([
      'who | Engineering, DevOps | pass',
      'network | Corporate offices · IP | pass',
      'place | Corporate offices · Location | pass',
      'device | Compliant devices | fail',
      'device | Android OS version | fail',
    ])
  })
})

describe('somebody the policy is not for', () => {
  it('draws no pills on any card: another policy decides, and nothing here was asked', () => {
    const form = board(devTools, { personId: 'devon' })
    const ev = cards(devTools, form)
    for (const r of devTools.rules) {
      expect(checkPills(r, ev[r.id], names)).toEqual([])
      expect(cardTone(ev[r.id].state)).toBe('dim')
    }
    expect(checkPills(null, ev[LAST_ROW], names)).toEqual([])
  })
})

describe('the short words', () => {
  /* One line per condition, keyed by the condition's id, as evidence.ts files
     everything that is not a zone or a device profile. */
  const line = (key: string, status: EvidenceLine['status'] = 'pass', tip?: string): EvidenceLine => ({
    key,
    label: 'Label',
    actual: 'actual',
    required: 'required',
    status,
    ...(tip ? { tip } : null),
  })
  const pillsOf = (r: Rule, lines: EvidenceLine[]) => checkPills(r, { word: 'No match', state: 'fail', lines }, names).map((p) => `${p.category} | ${p.text}`)

  it('says a window, a weekday run and a risk band the way a timetable would', () => {
    const hours = cond('time', 'between', ['09:00', '18:00'])
    const berlin = cond('time', 'not between', ['22:00', '06:00'], undefined, { tz: 'Europe/Berlin' })
    const weekdays = cond('day', 'is', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    const weekend = cond('day', 'is not', ['Saturday', 'Sunday'])
    const risky = cond('device-risk', 'above', ['70'])
    const r = rule({ name: 'Hours', when: when(card(hours, berlin, weekdays, weekend, risky)), decision: 'deny' })
    expect(pillsOf(r, [hours, berlin, weekdays, weekend, risky].map((c) => line(c.id)))).toEqual([
      'time | 09:00–18:00',
      'time | Outside 22:00–06:00 Berlin',
      'time | Mon–Fri',
      'time | Not Sat, Sun',
      'risk | Risk above 70',
    ])
  })

  it('names a directory field by its label, and a group list by its first two', () => {
    const dept = cond('user-attr', 'is', ['Finance'], undefined, { key: 'years_of_experience' })
    const r = rule({
      name: 'People',
      who: { groupIds: ['engineering', 'devops', 'finance'], userIds: [] },
      when: when(card(dept)),
      decision: '1fa',
    })
    expect(pillsOf(r, [line(`${r.id}:who`), line(dept.id)])).toEqual(['who | Engineering, DevOps +1', 'who | Years of experience is Finance'])
  })

  it('says a negated zone and profile as one pill, and a condition with nothing set by its attribute', () => {
    const outside = cond('zone', 'not in zone', ['corp-offices'])
    const notCompliant = cond('fingerprint', 'does not match', ['fp-compliant'])
    const blank = cond('zone', 'in zone', [])
    const r = rule({ name: 'Negated', when: when(card(outside, notCompliant, blank)), decision: 'deny' })
    expect(pillsOf(r, [line(outside.id), line(notCompliant.id), line(blank.id, 'unknown')])).toEqual([
      'network | Not in Corporate offices',
      'device | Not Compliant devices',
      'network | Network zone',
    ])
  })

  it('files a zone asked on one half under that half, with no half named', () => {
    const byPlace = cond('zone', 'in zone', ['india'], 'location')
    const r = rule({ name: 'India', when: when(card(byPlace)), decision: '1fa' })
    expect(pillsOf(r, [{ ...line(`${byPlace.id}:india:place`), label: 'Place' }])).toEqual(['place | India'])
  })

  it('falls back to the line’s own label for a line no condition owns', () => {
    const r = rule({ name: 'Nothing', decision: '1fa' })
    expect(pillsOf(r, [{ ...line('elsewhere'), label: 'Network' }])).toEqual(['network | Network'])
  })

  it('puts what would settle a line under its sentence in the tooltip', () => {
    const risky = cond('device-risk', 'above', ['70'])
    const r = rule({ name: 'Risk', when: when(card(risky)), decision: 'deny' })
    const [pill] = checkPills(r, { word: "Can't tell", state: 'unknown', lines: [line(risky.id, 'unknown', 'Needs: Device risk score')] }, names)
    expect(pill.tip).toBe('actual · required\nNeeds: Device risk score')
    expect(pill.status).toBe('unknown')
  })

  it('shortens lists, runs of days and windows', () => {
    expect(shortNames(['A'])).toBe('A')
    expect(shortNames(['A', 'B'])).toBe('A, B')
    expect(shortNames(['A', 'B', 'C', 'D'])).toBe('A, B +2')
    expect(dayText(['Friday', 'Monday', 'Wednesday'])).toBe('Mon, Wed, Fri')
    expect(dayText(['Saturday', 'Sunday', 'Monday', 'Tuesday'])).toBe('Mon, Tue, Sat, Sun')
    expect(dayText(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])).toBe('Every day')
    expect(windowText({ values: ['09:00', '17:30'], tz: 'America/New_York' })).toBe('09:00–17:30 New York')
  })

  it('reads names from the tenant, and a deleted zone as deleted rather than as its id', () => {
    expect(names('zone', 'corp-offices')).toBe('Corporate offices')
    expect(names('group', 'devops')).toBe('DevOps')
    expect(names('user', 'arun')).toBe('Arun Patel')
    expect(names('fingerprint', 'fp-compliant')).toBe('Compliant devices')
    const gone = cond('zone', 'not in zone', ['z-gone'])
    const r = rule({ name: 'Gone', when: when(card(gone)), decision: 'deny' })
    expect(pillsOf(r, [line(gone.id, 'unknown')])).toEqual(['network | Not in Deleted zone'])
  })
})

describe('what a card decides, and how it is drawn', () => {
  it('is the rule’s THEN, or the last row’s for the last row', () => {
    expect(outcomeOf(office, devTools)).toBe('1fa')
    expect(outcomeOf(remote, devTools)).toBe('2fa')
    expect(outcomeOf(null, devTools)).toBe('deny')
    /* A policy that never stored a last row lets everyone else in on one factor. */
    expect(outcomeOf(null, { fallback: undefined })).toBe('1fa')
  })

  it('lights only a match, steps a miss or a Can’t tell down, and dims what was never asked', () => {
    expect(cardTone('pass')).toBe('lit')
    expect(cardTone('fail')).toBe('missed')
    expect(cardTone('unknown')).toBe('missed')
    expect(cardTone('off')).toBe('dim')
    expect(cardTone('not-reached')).toBe('dim')
    expect(cardWord('off')).toBe('Switched off')
    expect(cardWord('unknown')).toBe("Can't tell")
  })
})

describe('the outcome node’s words', () => {
  const col = (over: Partial<ColumnView>): ColumnView => ({
    id: 'live',
    label: 'Live',
    tip: 'Decides sign-ins now',
    status: 'decided',
    policyName: 'Developer tools — office and device checks',
    line: 'Rule 1 · In the office on a compliant device',
    decision: '1fa',
    possible: ['1fa'],
    ...over,
  })

  it('says the answer as a word', () => {
    expect(answerWord({ status: 'decided', decision: '2fa' })).toBe('Allow with 2FA')
    expect(answerWord({ status: 'depends', decision: null })).toBe('Depends')
    expect(answerWord({ status: 'incomplete', decision: null })).toBe("Can't tell")
  })

  it('sets two versions side by side only when they answer differently', () => {
    const live = col({})
    expect(versionPair([live])).toBeNull()
    expect(versionPair([live, col({ id: 'edits', label: 'Your edits' })])).toBeNull()
    const edits = col({ id: 'edits', label: 'Your edits', decision: 'deny', possible: ['deny'] })
    expect(versionPair([live, edits])?.map((c) => c.label)).toEqual(['Live', 'Your edits'])
    expect(versionPair([live, col({ id: 'edits', label: 'Your edits', status: 'depends', decision: null, possible: ['1fa', 'deny'] })])).not.toBeNull()
  })
})
