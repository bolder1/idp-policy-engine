import { describe, expect, it } from 'vitest'

import {
  EFFECT_GROUP,
  GENERAL_GROUP,
  groupReview,
  groupSections,
  REVIEW_OPEN_ALL,
  reviewItemName,
  reviewKind,
  reviewSave,
  sectionsOpen,
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
      { label: 'Device restriction type', before: 'Agentless', after: 'Agent-based', group: 'Basic details', kind: 'changed' },
    ]
    const sections = groupSections(rows)
    // The page's order, general first and the consequences last. The general
    // heading is "Basic details" (1 Oct 2026), so the name joins a page's own
    // Basic details section: one section, never two of the same name.
    expect(GENERAL_GROUP).toBe('Basic details')
    expect(sections.map((x) => [x.title, x.count])).toEqual([
      [GENERAL_GROUP, 2],
      ['Signals', 3],
      [EFFECT_GROUP, 1],
    ])
    expect(sections[0].blocks.flatMap((b) => b.rows.map((r) => r.label))).toEqual(['Name', 'Device restriction type'])
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

  it("files a check's findings under their own chips inside the consequences, fails first", () => {
    const rows: ReviewLine[] = [
      { label: 'Aisha Khan on HRMS', before: 'Deny', after: 'Allow on 1 factor', effect: true, check: 'pass' },
      { label: 'HRMS access from corporate offices', before: '', after: 'Now denied 18', effect: true },
      { label: 'Name', before: 'A', after: 'B', kind: 'changed' },
      { label: 'Kavya Menon in the office · Must pass', before: 'Allow with 2FA', after: 'Deny', effect: true, check: 'fail' },
      { label: 'Ravi Menon on HRMS · Protected', before: 'Allow on 1 factor', after: "Can't tell", effect: true, check: 'neutral' },
    ]
    const sections = groupSections(rows)
    expect(sections.map((x) => [x.title, x.effect, x.count])).toEqual([
      [GENERAL_GROUP, false, 1],
      [EFFECT_GROUP, true, 4],
    ])
    expect(sections[1].blocks.map((b) => [b.kind, b.rows.map((r) => r.label)])).toEqual([
      ['effect', ['HRMS access from corporate offices']],
      ['fail', ['Kavya Menon in the office · Must pass']],
      ['neutral', ['Ravi Menon on HRMS · Protected']],
      ['pass', ['Aisha Khan on HRMS']],
    ])
    // Findings alone draw no empty "Happens for you" block.
    expect(groupSections([rows[3]])[0].blocks.map((b) => b.kind)).toEqual(['fail'])
  })

  it('names a row inside its section', () => {
    expect(reviewItemName({ label: 'Signals: added TPM ID', group: 'Signals', item: 'TPM ID' })).toBe('TPM ID')
    // A label that is only its kind is named for its section.
    expect(reviewItemName({ label: 'IP networks: added', group: 'IP networks' })).toBe('IP networks')
    expect(reviewItemName({ label: 'Locations: Removed', group: 'Locations' })).toBe('Locations')
    expect(reviewItemName({ label: 'Signals: tor exit node', group: 'Signals' })).toBe('Tor exit node')
    expect(reviewItemName({ label: 'Allowed device registrations', group: 'Basic details' })).toBe('Allowed device registrations')
    // A consequence keeps its whole label, item or not.
    expect(reviewItemName({ label: 'High risk score', item: 'High', effect: true })).toBe('High risk score')

  })
})

describe('how Review changes opens, and what holds its Save', () => {
  const rows = (n: number, group: string, extra: Partial<ReviewLine> = {}): ReviewLine[] =>
    Array.from({ length: n }, (_, i) => ({ label: `${group} ${i}`, before: 'a', after: 'b', group, ...extra }))

  it('opens every section of a short review', () => {
    expect(sectionsOpen(groupSections([...rows(2, 'Signals'), ...rows(1, 'Name')]))).toEqual([true, true])
  })

  it('opens only the biggest section of a long one, and always one holding a failed check', () => {
    const long = groupSections([
      ...rows(REVIEW_OPEN_ALL, 'Signals'),
      ...rows(1, 'Name'),
      { label: 'Kavya Menon in the office · Must pass', before: 'Allow with 2FA', after: 'Deny · expected Allow with 2FA', effect: true, check: 'fail' },
    ])
    expect(long.map((x) => x.title)).toEqual(['Signals', 'Name', 'Other settings'])
    expect(sectionsOpen(long)).toEqual([true, false, true])
    // A passing finding alone does not hold a section open.
    const passing = groupSections([...rows(REVIEW_OPEN_ALL, 'Signals'), { label: 'Aisha Khan on HRMS', before: 'Deny', after: 'Deny', effect: true, check: 'pass' }])
    expect(sectionsOpen(passing)).toEqual([true, false])
  })

  it("holds Save for the page's own reason, titled with it, or for a check, titled with its short word", () => {
    expect(reviewSave(false, undefined, null)).toEqual({ disabled: false, title: undefined })
    expect(reviewSave(true, 'Enter a zone name.', null)).toEqual({ disabled: true, title: 'Enter a zone name.' })
    expect(reviewSave(false, undefined, "Can't save")).toEqual({ disabled: true, title: "Can't save" })
    // The page's reason leads when both hold it.
    expect(reviewSave(true, 'Enter a zone name.', "Can't save")).toEqual({ disabled: true, title: 'Enter a zone name.' })
  })
})
