import { describe, expect, it } from 'vitest'

import { statusOptions } from './status-options'

describe('statusOptions', () => {
  it('offers Turn off for an active policy and Turn on for an inactive one', () => {
    expect(statusOptions({ status: 'active' })).toEqual([{ target: 'inactive', label: 'Turn off' }])
    expect(statusOptions({ status: 'inactive' })).toEqual([{ target: 'active', label: 'Turn on' }])
  })

  it('offers nothing for a draft, the always-on status or the system policy', () => {
    expect(statusOptions({ status: 'draft' })).toEqual([])
    expect(statusOptions({ status: 'always-on' })).toEqual([])
    expect(statusOptions({ status: 'active', isSystem: true })).toEqual([])
  })

  it('never offers a monitor switch', () => {
    for (const status of ['draft', 'active', 'inactive', 'always-on'] as const) {
      expect(JSON.stringify(statusOptions({ status }))).not.toMatch(/monitor/i)
    }
  })
})
