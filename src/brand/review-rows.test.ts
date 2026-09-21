import { describe, expect, it } from 'vitest'

import {
  EFFECT_GROUP,
  GENERAL_GROUP,
  groupReview,
  groupSections,
  reviewItemName,
  reviewKind,
  type ReviewLine,
} from './review-rows'

describe('review rows', () => {
  it('reads added, removed and changed from the values unless told', () => {
    expect(reviewKind({ before: '', after: 'x' })).toBe('added')
    expect(reviewKind({ before: 'x', after: '' })).toBe('removed')
    expect(reviewKind({ before: 'x', after: 'y' })).toBe('changed')
    // A setting that had no value is still a change to that setting.
    expect(reviewKind({ before: '', after: '3', kind: 'changed' })).toBe('changed')
  })

  it('groups by section in first-seen order, general first and consequences last', () => {
    const rows: ReviewLine[] = [
      { label: 'Low risk score', before: '13', after: '12', effect: true },
      { label: 'Priority: VPN on iOS', before: 'Low', after: 'High', group: 'Priorities' },
      { label: 'Signal: VPN', before: 'Off', after: 'On', group: 'Signals' },
      { label: 'Name', before: 'A', after: 'B' },
      { label: 'Priority: Tor on iOS', before: 'Low', after: 'High', group: 'Priorities' },
    ]
    const groups = groupReview(rows)
    expect(groups.map((g) => g.title)).toEqual([GENERAL_GROUP, 'Priorities', 'Signals', EFFECT_GROUP])
    // Consequences that share a section are titled by it.
    const scored = groupReview([
      { label: 'Low risk score', before: '13', after: '12', effect: true, group: 'Risk scores' },
      { label: 'High risk score', before: '90', after: '80', effect: true, group: 'Risk scores' },
    ])
    expect(scored.map((g) => [g.title, g.effect])).toEqual([['Risk scores', true]])
    expect(groups[1].rows.map((r) => r.label)).toEqual(['Priority: VPN on iOS', 'Priority: Tor on iOS'])
    expect(groups.at(-1)?.effect).toBe(true)
    expect(groups.flatMap((g) => g.rows)).toHaveLength(rows.length)
    expect(groupReview([])).toEqual([])
  })

  it('groups by section, and by kind inside each one', () => {
    const rows: ReviewLine[] = [
      { label: 'Status', before: 'Active', after: 'Draft', kind: 'changed', effect: true },
      { label: 'MAC address priority', before: 'High', after: 'Low', group: 'Signals', kind: 'changed', item: 'MAC address priority' },
      { label: 'Signals: removed Machine SID', before: 'High', after: '', group: 'Signals', kind: 'removed', item: 'Machine SID' },
      { label: 'Name', before: 'A', after: 'B', kind: 'changed' },
      { label: 'Signals: added TPM ID', before: '', after: 'High', group: 'Signals', kind: 'added', item: 'TPM ID' },
      { label: 'What it can read', before: 'Agentless', after: 'Agent-based', group: 'Basic details', kind: 'changed' },
    ]
    const sections = groupSections(rows)
    // The page's order, general first and the consequences last.
    expect(sections.map((x) => [x.title, x.count])).toEqual([
      [GENERAL_GROUP, 1],
      ['Signals', 3],
      ['Basic details', 1],
      [EFFECT_GROUP, 1],
    ])
    // Added leads inside a section, and an empty kind draws no block.
    expect(sections[1].blocks.map((b) => [b.kind, b.rows.length])).toEqual([
      ['added', 1],
      ['changed', 1],
      ['removed', 1],
    ])
    expect(sections[0].blocks.map((b) => b.kind)).toEqual(['changed'])
    // A consequence section is one block of its own, however its rows read.
    expect(sections.at(-1)?.effect).toBe(true)
    expect(sections.at(-1)?.blocks.map((b) => b.kind)).toEqual(['effect'])
    expect(sections.flatMap((x) => x.blocks.flatMap((b) => b.rows))).toHaveLength(rows.length)
    // A row that lists several changes counts each of them.
    const listed = groupSections([{ label: 'IP networks: added', before: '', after: 'a, b, c', group: 'IP networks', count: 3 }])
    expect(listed[0].count).toBe(3)
    expect(groupSections([])).toEqual([])
  })

  it('names a row inside its section', () => {
    expect(reviewItemName({ label: 'Signals: added TPM ID', group: 'Signals', item: 'TPM ID' })).toBe('TPM ID')
    // A label that is only its kind is named for its section.
    expect(reviewItemName({ label: 'IP networks: added', group: 'IP networks' })).toBe('IP networks')
    expect(reviewItemName({ label: 'Locations: Removed', group: 'Locations' })).toBe('Locations')
    expect(reviewItemName({ label: 'Signals: tor exit node', group: 'Signals' })).toBe('Tor exit node')
    expect(reviewItemName({ label: 'Devices per person', group: 'Basic details' })).toBe('Devices per person')
    // A consequence keeps its whole label, item or not.
    expect(reviewItemName({ label: 'High risk score', item: 'High', effect: true })).toBe('High risk score')

  })
})
