import { describe, expect, it } from 'vitest'

import type { HardwareToken } from '../hardware-tokens'
import {
  TOKEN_FILTERS,
  actedToast,
  assignChoices,
  assignedToast,
  assignmentsEmpty,
  assignmentsOf,
  filterAssignments,
  filterTokens,
  groupPairs,
  heldLabel,
  importSummary,
  isCsvName,
  leavesNobody,
  namesBrief,
  plural,
  selectionPlan,
  splitCodes,
  toggleAll,
  toggleSelected,
  withSkips,
} from './display-tokens-model'

const tok = (serial: string, over: Partial<HardwareToken> = {}): HardwareToken => ({
  serial,
  type: 'miniorange',
  userId: null,
  addedAt: '1 Sep 2026',
  ...over,
})

const users = [
  { id: 'priya', name: 'Priya Sharma', email: 'priya@mo.com' },
  { id: 'ravi', name: 'Ravi Menon', email: 'ravi.m@mo.com' },
]

const inventory = [
  tok('MO-DT-1001', { userId: 'priya' }),
  tok('MO-DT-1002'),
  tok('FT-C100-004512', { type: 'feitian-c100', counter: 3, userId: 'ravi', syncedAt: '2 Sep 2026' }),
  tok('TOTP-2608-0091', { type: 'totp', userId: 'priya' }),
]

describe('filters', () => {
  it('offers All tokens, Unassigned and Assigned, with no counts in the labels', () => {
    expect(TOKEN_FILTERS.map((f) => f.label)).toEqual(['All tokens', 'Unassigned', 'Assigned'])
    expect(TOKEN_FILTERS.every((f) => !/\d/.test(f.label))).toBe(true)
  })

  it('narrows by assignment state', () => {
    expect(filterTokens(inventory, users, '', 'all')).toHaveLength(4)
    expect(filterTokens(inventory, users, '', 'unassigned').map((t) => t.serial)).toEqual(['MO-DT-1002'])
    expect(filterTokens(inventory, users, '', 'assigned')).toHaveLength(3)
  })

  it('searches the serial in any case, ignoring spaces and hyphens', () => {
    expect(filterTokens(inventory, users, 'ft-c100', 'all').map((t) => t.serial)).toEqual(['FT-C100-004512'])
    expect(filterTokens(inventory, users, 'ft c100 0045', 'all').map((t) => t.serial)).toEqual(['FT-C100-004512'])
  })

  it('searches the type label and the holder by name or email', () => {
    expect(filterTokens(inventory, users, 'totp', 'all').map((t) => t.serial)).toEqual(['TOTP-2608-0091'])
    expect(filterTokens(inventory, users, 'priya', 'all')).toHaveLength(2)
    expect(filterTokens(inventory, users, 'ravi.m@', 'all').map((t) => t.serial)).toEqual(['FT-C100-004512'])
  })

  it('applies the search and the filter together', () => {
    expect(filterTokens(inventory, users, 'mo-dt', 'unassigned').map((t) => t.serial)).toEqual(['MO-DT-1002'])
    expect(filterTokens(inventory, users, 'nobody', 'all')).toEqual([])
  })
})

describe('assignments', () => {
  const directory = [...users, { id: 'anna', name: 'Anna Iyer', email: 'anna@mo.com' }]

  it('is one row per assigned token, by person then serial, with unknown holders last', () => {
    const rows = assignmentsOf([...inventory, tok('ZZ-9', { userId: 'gone' }), tok('AA-1', { userId: 'priya' })], directory)
    expect(rows.map((r) => r.token.serial)).toEqual(['AA-1', 'MO-DT-1001', 'TOTP-2608-0091', 'FT-C100-004512', 'ZZ-9'])
    expect(rows[0].person?.name).toBe('Priya Sharma')
    expect(rows[rows.length - 1].person).toBeNull()
  })

  it('leaves out tokens nobody holds', () => {
    expect(assignmentsOf(inventory, directory).some((r) => r.token.serial === 'MO-DT-1002')).toBe(false)
  })

  it('searches the person by name or email, and the serial and type', () => {
    const rows = assignmentsOf(inventory, directory)
    expect(filterAssignments(rows, 'priya').map((r) => r.token.serial)).toEqual(['MO-DT-1001', 'TOTP-2608-0091'])
    expect(filterAssignments(rows, 'ravi.m@').map((r) => r.token.serial)).toEqual(['FT-C100-004512'])
    expect(filterAssignments(rows, 'ft c100').map((r) => r.token.serial)).toEqual(['FT-C100-004512'])
    expect(filterAssignments(rows, 'totp').map((r) => r.token.serial)).toEqual(['TOTP-2608-0091'])
    expect(filterAssignments(rows, '  ')).toHaveLength(3)
    expect(filterAssignments(rows, 'nobody')).toEqual([])
  })

  it('sends an empty page with no tokens at all to Manage tokens, and one with tokens waiting to assigning', () => {
    expect(assignmentsEmpty([])).toBe('no-tokens')
    expect(assignmentsEmpty([tok('A-1')])).toBe('none-assigned')
  })
})

describe('selection', () => {
  it('splits what Unassign and Delete would each act on', () => {
    const plan = selectionPlan(inventory, ['mo-dt-1001', 'MO-DT-1002', 'GONE-1'])
    expect(plan.picked.map((t) => t.serial)).toEqual(['MO-DT-1001', 'MO-DT-1002'])
    expect(plan.assigned.map((t) => t.serial)).toEqual(['MO-DT-1001'])
    expect(plan.deletable.map((t) => t.serial)).toEqual(['MO-DT-1002'])
  })

  it('leaves nothing to do when the selection is empty', () => {
    expect(selectionPlan(inventory, [])).toEqual({ picked: [], assigned: [], deletable: [] })
  })

  it('toggles one serial in and out, case-insensitively', () => {
    expect(toggleSelected([], 'MO-DT-1002')).toEqual(['MO-DT-1002'])
    expect(toggleSelected(['MO-DT-1002'], 'mo-dt-1002')).toEqual([])
  })

  it('selects every row a search leaves, and clears them when all are selected', () => {
    expect(toggleAll(['X-1'], ['A-1', 'A-2'])).toEqual(['X-1', 'A-1', 'A-2'])
    expect(toggleAll(['X-1', 'a-1'], ['A-1', 'A-2'])).toEqual(['X-1', 'A-1', 'A-2'])
    expect(toggleAll(['X-1', 'a-1', 'A-2'], ['A-1', 'A-2'])).toEqual(['X-1'])
    expect(toggleAll(['X-1'], [])).toEqual(['X-1'])
  })
})

describe('leavesNobody', () => {
  it('is true only when every assigned token is in the batch', () => {
    expect(leavesNobody(inventory, ['MO-DT-1001', 'FT-C100-004512', 'TOTP-2608-0091'])).toBe(true)
    expect(leavesNobody(inventory, ['MO-DT-1001', 'FT-C100-004512'])).toBe(false)
  })

  it('is false when nothing is assigned to begin with', () => {
    expect(leavesNobody([tok('A-1'), tok('A-2')], ['A-1', 'A-2'])).toBe(false)
  })
})

describe('the assign slider', () => {
  it('lists unassigned tokens, and the ones the chosen person already holds', () => {
    const { free, held } = assignChoices(inventory, 'priya')
    expect(free.map((t) => t.serial)).toEqual(['MO-DT-1002'])
    expect(held.map((t) => t.serial)).toEqual(['MO-DT-1001', 'TOTP-2608-0091'])
    expect(assignChoices(inventory, null).held).toEqual([])
  })

  it('says how many tokens a person holds, and nothing for none', () => {
    expect(heldLabel(0)).toBeNull()
    expect(heldLabel(1)).toBe('Has 1 token')
    expect(heldLabel(2)).toBe('Has 2 tokens')
  })
})

describe('assignment uploads', () => {
  it('groups pairs by person in first-seen order, keeping file order within each', () => {
    expect(
      groupPairs([
        { userId: 'ravi', serial: 'B' },
        { userId: 'priya', serial: 'A' },
        { userId: 'ravi', serial: 'C' },
      ]),
    ).toEqual([
      { userId: 'ravi', serials: ['B', 'C'] },
      { userId: 'priya', serials: ['A'] },
    ])
    expect(groupPairs([])).toEqual([])
  })

  it('accepts only .csv file names', () => {
    expect(isCsvName('tokens.CSV')).toBe(true)
    expect(isCsvName('tokens.xlsx')).toBe(false)
  })
})

describe('sync codes', () => {
  it('splits a pasted run of eighteen digits into three codes', () => {
    expect(splitCodes('123456654321111222')).toEqual(['123456', '654321', '111222'])
    expect(splitCodes('123456 654321\n111-222')).toEqual(['123456', '654321', '111222'])
  })

  it('refuses anything that is not exactly three codes', () => {
    expect(splitCodes('123456')).toBeNull()
    expect(splitCodes('12345665432111122a')).toBeNull()
    expect(splitCodes('1234566543211112223')).toBeNull()
  })
})

describe('copy', () => {
  it('counts in words', () => {
    expect(plural(1, 'token')).toBe('1 token')
    expect(plural(3, 'token')).toBe('3 tokens')
    expect(plural(2, 'person', 'people')).toBe('2 people')
  })

  it('names one serial and counts more', () => {
    expect(actedToast(['MO-DT-1002'], 'unassigned')).toBe('MO-DT-1002 unassigned')
    expect(actedToast(['A', 'B', 'C'], 'deleted')).toBe('3 tokens deleted')
    expect(assignedToast(['A', 'B'], 'Priya Sharma')).toBe('2 tokens assigned to Priya Sharma')
    expect(assignedToast(['MO-DT-1002'], 'Priya Sharma')).toBe('MO-DT-1002 assigned to Priya Sharma')
  })

  it('summarises an import, with skips only when there are any', () => {
    expect(importSummary(12, 0, 'imported')).toBe('12 tokens imported')
    expect(importSummary(12, 2, 'imported')).toBe('12 tokens imported, 2 skipped')
    expect(importSummary(1, 1, 'assigned')).toBe('1 token assigned, 1 skipped')
  })

  it('names one skipped token with its reason and counts more', () => {
    const one = [{ serial: 'FT-1', reason: 'Already assigned to another user.' }]
    expect(withSkips('2 tokens assigned to Priya Sharma', [])).toBe('2 tokens assigned to Priya Sharma')
    expect(withSkips('2 tokens assigned to Priya Sharma', one)).toBe(
      '2 tokens assigned to Priya Sharma. FT-1 skipped: already assigned to another user.',
    )
    expect(withSkips(null, [...one, { serial: 'FT-2', reason: 'x' }])).toBe('2 skipped')
  })

  it('never changes the case of a skipped serial', () => {
    const lower = [{ serial: 'ft-c100-9', reason: 'Already assigned to another user.' }]
    expect(withSkips(null, lower)).toBe('ft-c100-9 skipped: already assigned to another user.')
    expect(withSkips('MO-1 assigned to Priya Sharma', lower)).toBe(
      'MO-1 assigned to Priya Sharma. ft-c100-9 skipped: already assigned to another user.',
    )
  })

  it('lists two names, then a remainder, each person once', () => {
    expect(namesBrief(['Priya Sharma'])).toBe('Priya Sharma')
    expect(namesBrief(['Priya Sharma', 'Priya Sharma', 'Ravi Menon'])).toBe('Priya Sharma and Ravi Menon')
    expect(namesBrief(['A', 'B', 'C', 'D'])).toBe('A, B and 2 more')
  })
})
