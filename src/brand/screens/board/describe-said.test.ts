import { describe, expect, it } from 'vitest'

import { card, cond, fallbackRule, rule, when, type Rule } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { appParts, condParts, lineText, ruleName, saidLines, whoParts, type SaidBoard } from './describe-said'

/* -----------------------------------------------------------------------------
   The plain lines (describe-said.ts): read from the board before and after,
   one per decision, with logos, faces and condition icons as parts. Every
   template from the design's §4 "Result lines".
   -------------------------------------------------------------------------- */

const T = showcaseTenant()
const t = { ...T, users: T.directory.people }
const b = (rules: Rule[], fallback?: Rule, appIds: string[] = ['hrms']): SaidBoard => ({ rules, fallback, appIds })
const say = (before: SaidBoard, after: SaidBoard) => saidLines(before, after, t).map(lineText)
const everyone = (d: Rule['decision'] = '2fa') => rule({ name: 'Everyone', decision: d, ...(d === '1fa' ? { firstFactor: 'Password' as const } : null) })
const zone = (id: string, not = false) => cond('zone', not ? 'not in zone' : 'in zone', [id])

describe('a rule added', () => {
  it('Everyone, no condition: one person, singular', () => {
    expect(say(b([]), b([everyone('2fa')]))).toEqual(['Everyone signing in to HRMS now needs a second factor.'])
    expect(say(b([]), b([everyone('1fa')]))).toEqual(['Everyone signing in to HRMS now uses a password.'])
    expect(say(b([]), b([everyone('deny')]))).toEqual(['Everyone signing in to HRMS is now denied.'])
  })

  it('named people and conditions: sign-ins, plural, the people and the condition after the applications', () => {
    const r = rule({ name: 'x', who: { groupIds: ['contractors'], userIds: [] }, when: when(card(zone('india', true))), decision: 'deny' })
    expect(say(b([]), b([r]))).toEqual(['Sign-ins to HRMS from Contractors outside India are now denied.'])
    const allow = rule({ name: 'y', who: { groupIds: ['contractors', 'finance'], userIds: ['u-maya'] }, when: when(card(zone('india'))), decision: '1fa', firstFactor: 'Password' })
    expect(say(b([]), b([allow]))).toEqual(['Sign-ins to HRMS from Contractors, Finance and Maya Iyer in India now use a password.'])
  })

  it('conditions with no named people', () => {
    const r = rule({ name: 'x', when: when(card(cond('fingerprint', 'matches', ['fp-corp-devices']))), decision: '2fa' })
    expect(say(b([]), b([r]))).toEqual(['Sign-ins to HRMS on Corporate devices now need a second factor.'])
  })

  it('a method by name, when the rule names one', () => {
    const r = rule({ name: 'x', decision: '2fa', secondFactor: 'specific', secondFactorMethods: [T.methods[0].id] })
    expect(say(b([]), b([r]))).toEqual([`Everyone signing in to HRMS now needs ${T.methods[0].name}.`])
  })

  it('no applications yet: " to …" is dropped', () => {
    expect(say(b([], undefined, []), b([everyone()], undefined, []))).toEqual(['Everyone signing in now needs a second factor.'])
  })

  it('past three applications: "A, B and N more"', () => {
    const ids = ['hrms', 'outlook', 'dropbox', T.apps[3].id]
    expect(appParts(ids, t).map((p) => (p.kind === 'text' ? p.text : p.kind === 'app' ? p.name : ''))).toEqual(['HRMS', ', ', 'Microsoft Outlook', ' and 2 more'])
  })
})

describe('a rule changed, removed, and the rest', () => {
  it('a decision changed in place says what it was', () => {
    const r = everyone('2fa')
    expect(say(b([r]), b([{ ...r, decision: 'deny' }]))).toEqual(['Everyone signing in to HRMS is now denied (was allow with 2FA).'])
  })

  it('a rule taken away', () => {
    const r = rule({ name: 'x', who: { groupIds: ['contractors'], userIds: [] }, when: when(card(zone('india'))), decision: '1fa' })
    expect(say(b([r]), b([]))).toEqual(['Removed the rule for Contractors in India.'])
    expect(say(b([everyone()]), b([]))).toEqual(['Removed the rule for everyone.'])
  })

  it('the last row, singular', () => {
    expect(say(b([], fallbackRule('deny')), b([], fallbackRule('1fa')))).toEqual(['Any other sign-in to HRMS now uses a password (was deny).'])
  })

  it('the applications, when they change — and not when only their order does', () => {
    expect(say(b([], undefined, ['hrms']), b([], undefined, ['hrms', 'outlook']))).toEqual(['This policy now covers HRMS and Microsoft Outlook.'])
    expect(say(b([], undefined, ['hrms', 'outlook']), b([], undefined, ['outlook', 'hrms']))).toEqual(['No change'])
  })

  it('the last row while a rule above decides every sign-in: what it would do, and why it does not', () => {
    const all = everyone()
    expect(say(b([all], fallbackRule('1fa')), b([all], fallbackRule('deny')))).toEqual([
      'Any other sign-in to HRMS would now be denied (was allow on 1 factor), but a rule above decides every sign-in first.',
    ])
    expect(say(b([all], fallbackRule('deny')), b([all], fallbackRule('1fa')))).toEqual([
      'Any other sign-in to HRMS would now use a password (was deny), but a rule above decides every sign-in first.',
    ])
  })

  it('nothing: No change', () => {
    const r = everyone()
    expect(say(b([r]), b([r]))).toEqual(['No change'])
  })

  it('lines follow the canvas, denies first, and the parts carry logos, faces and condition icons', () => {
    const allow = rule({ name: 'a', who: { groupIds: ['contractors'], userIds: [] }, when: when(card(zone('india'))), decision: '1fa' })
    const deny = rule({ name: 'd', who: { groupIds: ['contractors'], userIds: [] }, when: when(card(zone('india', true))), decision: 'deny' })
    const lines = saidLines(b([]), b([deny, allow]), t)
    expect(lines.map((l) => l.decision)).toEqual(['deny', '1fa'])
    expect(lines[0].parts.filter((p) => p.kind !== 'text').map((p) => p.kind)).toEqual(['app', 'who', 'cond'])
    expect(lines[0].parts.find((p) => p.kind === 'cond')).toEqual({ kind: 'cond', type: 'zone', words: 'outside India' })
    expect(lines[0].parts.find((p) => p.kind === 'who')).toEqual({ kind: 'who', who: 'group', id: 'contractors', name: 'Contractors' })
  })
})

describe('what a line reaches', () => {
  const contractors = { groupIds: ['contractors'], userIds: [] }
  const audience = { everyone: false, groupIds: ['engineering', 'design'], userIds: [] }

  it('a policy narrowed to some people says them for Everyone', () => {
    const after = { ...b([everyone()]), audience }
    expect(say(b([]), after)).toEqual(['Everyone in Engineering and Design signing in to HRMS now needs a second factor.'])
    const r = rule({ name: 'x', when: when(card(zone('india'))), decision: 'deny' })
    expect(say(b([]), { ...b([r]), audience })).toEqual(['Sign-ins to HRMS from Engineering and Design in India are now denied.'])
    expect(say(b([]), { ...b([everyone()]), audience: { everyone: true, groupIds: [], userIds: [] } })).toEqual(['Everyone signing in to HRMS now needs a second factor.'])
  })

  it('says when a rule above may decide some of these sign-ins first', () => {
    const first = rule({ name: 'c', who: contractors, decision: '2fa' })
    const all = everyone('1fa')
    expect(say(b([first]), b([first, all]))).toEqual(['Everyone signing in to HRMS now uses a password, unless a rule above decides first.'])
    /* A rule above for other sign-ins altogether — outside India, above one in India — is no qualifier. */
    const out = rule({ name: 'o', who: contractors, when: when(card(zone('india', true))), decision: 'deny' })
    const inside = rule({ name: 'i', who: contractors, when: when(card(zone('india'))), decision: '1fa' })
    expect(say(b([out]), b([out, inside]))).toEqual(['Sign-ins to HRMS from Contractors in India now use a password.'])
    /* Nor one for other people. */
    const fin = rule({ name: 'f', who: { groupIds: ['finance'], userIds: [] }, decision: 'deny' })
    expect(say(b([fin]), b([fin, { ...inside }]))).toEqual(['Sign-ins to HRMS from Contractors in India now use a password.'])
  })
})

describe('words', () => {
  it('say conditions plainly', () => {
    const words = (c: ReturnType<typeof cond>) => condParts(when(card(c)), t).map((p) => (p.kind === 'cond' ? p.words : ''))
    expect(words(cond('device-risk', 'above', ['70']))).toEqual(['at risk above 70'])
    expect(words(cond('fingerprint', 'does not match', ['fp-corp-devices']))).toEqual(['not on Corporate devices'])
    expect(words(cond('time', 'between', ['09:00', '18:00']))).toEqual(['between 09:00 and 18:00'])
    expect(words(cond('day', 'is', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']))).toEqual(['on weekdays'])
    expect(words(cond('day', 'is', ['Saturday']))).toEqual(['on Saturday'])
  })

  it('name a rule by its people and its conditions', () => {
    expect(ruleName(everyone(), t)).toBe('Everyone')
    expect(ruleName(rule({ name: '', who: { groupIds: ['finance'], userIds: [] }, when: when(card(zone('india'))) }), t)).toBe('Finance in India')
    expect(whoParts({ groupIds: [], userIds: [], exceptGroupIds: ['contractors'] }, t).map((p) => (p.kind === 'text' ? p.text : p.kind === 'who' ? p.name : ''))).toEqual(['Everyone', ' except ', 'Contractors'])
  })
})
