import { describe, expect, it } from 'vitest'

import { blankRule, policies, type Policy, type Rule } from '../../data'
import { describeChanges } from '../changes'
import {
  addedRuleIds,
  alignRules,
  appended,
  fallbackChanged,
  approveBlocker,
  changeItem,
  groupChanges,
  kindOf,
  asPolicy,
  canRollBack,
  draftState,
  liveMoved,
  liveNumber,
  publishedTrack,
  rebaseDraft,
  reconcile,
  seedTrack,
  versionChip,
  whenLabel,
  type Track,
} from './policy-versions'

const YOU = 'Jaspreet Toor'
const live = policies.find((p) => p.status === 'active' && p.rules.length >= 2 && !p.isSystem) as Policy
const named = (name: string, over: Partial<Rule> = {}): Rule => ({ ...blankRule(name), id: name.toLowerCase(), ...over })
const v = (over: Partial<Track['versions'][number]> & { n: number }) => ({ rules: [], appIds: [], by: 'Dev Malhotra', at: 'Nov 1, 2026, 09:00', ...over })

describe('V3 versions: the seeded history', () => {
  it('gives a published policy a short history whose last version is its live rules', () => {
    const t = seedTrack(live, YOU)
    expect(t.versions.map((x) => x.n)).toEqual([1, 2, 3])
    expect(t.versions[2].rules).toBe(live.rules)
    expect(t.versions[2].by).toBe(YOU)
    expect(t.versions[0].note).toBe('First version')
    /* Each step is one edit an admin would recognise. */
    const lines = describeChanges(asPolicy(live, t.versions[1]), asPolicy(live, t.versions[2]))
    expect(lines).toEqual([`Added “${live.rules.at(-1)!.name}”`])
    expect(describeChanges(asPolicy(live, t.versions[0]), asPolicy(live, t.versions[1]))).toHaveLength(1)
  })

  it('reads the same on every load', () => {
    expect(seedTrack(live, YOU)).toEqual(seedTrack(live, YOU))
  })

  it('has nothing for a policy never published', () => {
    expect(seedTrack({ ...live, status: 'draft' }, YOU).versions).toEqual([])
    expect(seedTrack({ ...live, provisional: { rules: [] } }, YOU).versions).toEqual([])
  })
})

describe('V3 versions: live saved from outside V3', () => {
  it('shows as one more version read from the policy', () => {
    const t = seedTrack(live, YOU)
    const moved: Policy = { ...live, rules: live.rules.slice(1), lastModified: 'Just now', modifiedBy: 'You' }
    const r = reconcile(t, moved, YOU)
    expect(liveNumber(r)).toBe(4)
    expect(r.versions[3]).toMatchObject({ n: 4, by: YOU, at: 'Just now', outside: true })
  })

  it('leaves a track alone while its last version is live', () => {
    const t = seedTrack(live, YOU)
    expect(reconcile(t, live, YOU)).toBe(t)
  })
})

describe('V3 versions: publish and roll back never rewrite history', () => {
  const t: Track = { versions: [v({ n: 1 }), v({ n: 2 })], draftBase: 1, review: { kind: 'in-review', by: YOU, at: 'now' } }

  it('numbers the next version after live', () => {
    expect(appended(t, { rules: [], appIds: [], by: YOU, at: 'now' }).versions.map((x) => x.n)).toEqual([1, 2, 3])
  })

  it('ends the draft on a publish and keeps it open on a roll back', () => {
    const pub = publishedTrack(t, { rules: [], appIds: [], by: YOU, at: 'now' })
    expect(pub.draftBase).toBeUndefined()
    expect(pub.review).toBeUndefined()
    const back = appended(t, { rules: [], appIds: [], by: YOU, at: 'now', copies: 1 })
    expect(back.draftBase).toBe(1)
    expect(liveMoved(back)).toBe(true)
  })

  it('rolls back only to the version just before live', () => {
    expect(canRollBack(t, 1)).toBe(true)
    expect(canRollBack(t, 2)).toBe(false)
    expect(canRollBack({ versions: [v({ n: 1 })] }, 0)).toBe(false)
  })
})

describe('V3 versions: the chip on the name', () => {
  const t: Track = { versions: [v({ n: 1 }), v({ n: 2 }), v({ n: 3 })] }

  it('says the live version, or the next one and what it is doing', () => {
    expect(versionChip(t, draftState(t, false), true).label).toBe('v3 · Live')
    expect(versionChip(t, draftState(t, false), false).label).toBe('v3 · Published')
    expect(versionChip(t, draftState(t, true), true).label).toBe('v4 · Draft')
    const sent: Track = { ...t, review: { kind: 'in-review', by: YOU, at: 'now' } }
    expect(versionChip(sent, draftState(sent, true), true).label).toBe('v4 · In review')
    const back: Track = { ...t, review: { kind: 'rejected', by: 'Meera Iyer', at: 'now', reason: 'Too wide' } }
    expect(versionChip(back, draftState(back, true), true).label).toBe('v4 · Rejected')
  })

  it('starts a policy never published at v1, as a draft', () => {
    expect(versionChip({ versions: [] }, draftState({ versions: [] }, false), false).label).toBe('v1 · Draft')
  })

  it('never colours the live version', () => {
    expect(versionChip(t, 'live', true).tone).toBe('neutral')
  })
})

describe('V3 versions: approval', () => {
  const review = { kind: 'in-review' as const, by: YOU, at: 'now' }
  it('refuses an admin their own request', () => {
    expect(approveBlocker(review, YOU)).toBe('Another admin must approve')
    expect(approveBlocker(review, 'Meera Iyer')).toBeNull()
    expect(approveBlocker(undefined, 'Meera Iyer')).not.toBeNull()
  })
})

describe('V3 versions: Update draft carries the draft onto the new live rules', () => {
  const a = named('A')
  const b = named('B')
  const c = named('C')
  const base = { rules: [a, b, c] }

  it('keeps the draft edit and the rule live added', () => {
    const d = named('D')
    const mine = { rules: [{ ...a, enabled: false }, b, c] }
    const liveNow = { rules: [a, b, c, d] }
    expect(rebaseDraft(base, liveNow, mine).rules.map((r) => [r.id, r.enabled])).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
      ['d', true],
    ])
  })

  it('keeps a rule the draft removed out, and drops one live removed', () => {
    const mine = { rules: [a, c] }
    const liveNow = { rules: [a, b] }
    expect(rebaseDraft(base, liveNow, mine).rules.map((r) => r.id)).toEqual(['a'])
  })

  it('puts a rule the draft added after the rule it followed', () => {
    const x = named('X')
    const mine = { rules: [a, x, b, c] }
    const liveNow = { rules: [c, a, b] }
    expect(rebaseDraft(base, liveNow, mine).rules.map((r) => r.id)).toEqual(['c', 'a', 'x', 'b'])
  })

  it('keeps a rule the draft edited even where live removed it', () => {
    const mine = { rules: [a, { ...b, name: 'B renamed' }, c] }
    const liveNow = { rules: [a, c] }
    expect(rebaseDraft(base, liveNow, mine).rules.map((r) => r.name)).toEqual(['A', 'B renamed', 'C'])
  })

  it('takes the last row from the draft only when the draft changed it', () => {
    const fb = named('Nothing else matched', { decision: 'deny' })
    const liveFb = { ...fb, decision: '2fa' as const }
    expect(rebaseDraft({ rules: [], fallback: fb }, { rules: [], fallback: liveFb }, { rules: [], fallback: fb }).fallback).toBe(liveFb)
    const mineFb = { ...fb, decision: '1fa' as const }
    expect(rebaseDraft({ rules: [], fallback: fb }, { rules: [], fallback: liveFb }, { rules: [], fallback: mineFb }).fallback).toBe(mineFb)
  })
})

describe('V3 versions: what a version changed, by kind', () => {
  it('reads each change line as added, changed or removed', () => {
    expect(kindOf('Added “Contractors”')).toBe('added')
    expect(kindOf('Now protects Slack, Zoom')).toBe('added')
    expect(kindOf('Finance added to Who on “Contractors”')).toBe('added')
    expect(kindOf('Removed “Contractors”')).toBe('removed')
    expect(kindOf('No longer protects Slack')).toBe('removed')
    expect(kindOf('Finance removed from Who on “Contractors”')).toBe('removed')
    expect(kindOf('“Contractors” renamed to “Vendors”')).toBe('changed')
    expect(kindOf('Now applies to everyone in the directory')).toBe('changed')
  })

  it('says Added, Changed and Removed in that order, and only the kinds there are', () => {
    const g = groupChanges(['Removed “A”', '“B” switched on', 'Added “C”', 'Added “D”'])
    expect(g.map((x) => x.kind)).toEqual(['added', 'changed', 'removed'])
    expect(g[0].lines).toEqual(['Added “C”', 'Added “D”'])
    expect(groupChanges(['“B” switched off']).map((x) => x.kind)).toEqual(['changed'])
  })

  it('splits a line into the rule and what happened to it', () => {
    expect(changeItem('Added “New rule”')).toEqual({ name: 'New rule', what: 'New rule' })
    expect(changeItem('Removed “Contractors”')).toEqual({ name: 'Contractors', what: 'Rule removed' })
    expect(changeItem('“Low risk — password” moved to position 2 — evaluation order changed')).toEqual({ name: 'Low risk — password', what: 'Moved to position 2' })
    expect(changeItem('Conditions edited on “Contractors”')).toEqual({ name: 'Contractors', what: 'Conditions edited' })
    expect(changeItem('2 conditions added to “Contractors”')).toEqual({ name: 'Contractors', what: '2 conditions added' })
    expect(changeItem('“Contractors” switched off')).toEqual({ name: 'Contractors', what: 'Switched off' })
    expect(changeItem('“Contractors” switched on')).toEqual({ name: 'Contractors', what: 'Switched on' })
    expect(changeItem('Now protects Slack')).toEqual({ what: 'Now protects Slack' })
  })

  it('finds the rules a version brought in', () => {
    const a = named('A')
    const b = named('B')
    expect(addedRuleIds({ rules: [a] }, { rules: [a, b] })).toEqual(['b'])
    expect(addedRuleIds(undefined, { rules: [a] })).toEqual([])
  })

  it('gives the chip its number and word apart', () => {
    const t: Track = { versions: [v({ n: 1 }), v({ n: 2 })] }
    expect(versionChip(t, 'draft', true)).toMatchObject({ n: 3, word: 'Draft' })
    expect(versionChip(t, 'live', true)).toMatchObject({ n: 2, word: 'Live' })
  })
})

describe('V3 versions: two versions side by side', () => {
  const a = named('A')
  const b = named('B')
  const c = named('C')

  it('lines up the same rule on one row, and says what became of it', () => {
    const rows = alignRules([a, b, c], [a, { ...b, enabled: false }, c])
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      ['a', 'same'],
      ['b', 'changed'],
      ['c', 'same'],
    ])
  })

  it('puts an added rule on the right only, and a removed one on the left where it was', () => {
    const x = named('X')
    const rows = alignRules([a, b, c], [a, x, c])
    /* A rule swapped for another reads as a diff does: the one that went, then the one that came. */
    expect(rows.map((r) => [r.id, r.kind, !!r.a, !!r.b])).toEqual([
      ['a', 'same', true, true],
      ['b', 'removed', true, false],
      ['x', 'added', false, true],
      ['c', 'same', true, true],
    ])
  })

  it('marks a rule that moved, with its number on each side', () => {
    const rows = alignRules([a, b], [b, a])
    expect(rows[0]).toMatchObject({ id: 'b', moved: true, a: { n: 2 }, b: { n: 1 } })
  })

  it('says when the last row differs', () => {
    expect(fallbackChanged({ fallback: named('F') }, { fallback: named('F', { decision: 'deny' }) })).toBe(true)
    expect(fallbackChanged({ fallback: named('F') }, { fallback: named('F') })).toBe(false)
  })
})

describe('V3 versions: times', () => {
  it('writes the console time', () => {
    expect(whenLabel(new Date(2026, 10, 3, 9, 5))).toBe('Nov 3, 2026, 09:05')
  })
})
