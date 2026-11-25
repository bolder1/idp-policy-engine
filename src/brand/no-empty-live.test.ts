import { describe, expect, it, vi } from 'vitest'

import type { Policy, Rule } from './data'
import builder from './screens/board/BoardBuilder.tsx?raw'
import status from './screens/use-status-change.tsx?raw'

/* No empty policy goes live, on the Design line (rollout.ts `noEmptyLive`). The flag is read once at load, so it is
   mocked before the module is imported. */
vi.mock('./rollout', async (original) => ({ ...(await original<typeof import('./rollout')>()), shows: (change: string) => change === 'noEmptyLive' }))

const { isEmptyPolicy, refusesEmpty, turnOnBlocker, NO_RULES_REASON } = await import('./policy-draft')

const rule = (over: Partial<Rule> = {}): Rule => ({ id: 'r1', name: 'Engineers', decision: '1fa', ...over }) as Rule
const base = { isSystem: false, appIds: ['slack'], status: 'inactive' as const, pendingDraft: undefined }

describe('noEmptyLive: a policy with no rule of its own never goes live (Design)', () => {
  it('counts a policy whose only row is the untouched last row as empty', () => {
    expect(isEmptyPolicy({ rules: [], fallback: rule({ id: 'fallback' }), isSystem: false })).toBe(true)
    expect(isEmptyPolicy({ rules: [], fallback: undefined, isSystem: false })).toBe(true)
    /* The product's own flip to Deny is not the admin's choice either. */
    expect(isEmptyPolicy({ rules: [], fallback: rule({ id: 'fallback', decision: 'deny', setBy: 'auto' }), isSystem: false })).toBe(true)
  })

  it('keeps the 23 Nov ruling: an admin-edited last row is a rule', () => {
    expect(isEmptyPolicy({ rules: [], fallback: rule({ id: 'fallback', decision: 'deny', setBy: 'admin' }), isSystem: false })).toBe(false)
  })

  it('never counts the Global Default, or a policy with a rule, as empty', () => {
    expect(isEmptyPolicy({ rules: [], fallback: rule({ id: 'fallback' }), isSystem: true })).toBe(false)
    expect(isEmptyPolicy({ rules: [rule()], fallback: rule({ id: 'fallback' }), isSystem: false })).toBe(false)
  })

  it('refuses Make active on an empty policy with "Add a rule first."', () => {
    expect(refusesEmpty({ rules: [], fallback: rule({ id: 'fallback' }), isSystem: false })).toBe(true)
    expect(turnOnBlocker({ ...base, rules: [], fallback: rule({ id: 'fallback' }) } as Pick<Policy, 'appIds' | 'isSystem' | 'status' | 'pendingDraft' | 'rules' | 'fallback'>, 0)).toBe(`${NO_RULES_REASON}.`)
    expect(turnOnBlocker({ ...base, rules: [rule()], fallback: rule({ id: 'fallback' }) } as Pick<Policy, 'appIds' | 'isSystem' | 'status' | 'pendingDraft' | 'rules' | 'fallback'>, 0)).toBeNull()
  })

  it('is checked at every door that puts a policy live, and not on Save draft', () => {
    /* A function's body: from its first line to the first closing brace at its own indent (the files are CRLF). */
    const body = (src: string, start: string) => {
      const from = src.indexOf(start)
      const end = src.slice(from).search(/\r?\n {2}\}\r?\n/)
      return src.slice(from, from + end)
    }
    expect(body(builder, 'const commitSave = (')).toMatch(/if \(emptyRefused\)/)
    expect(body(builder, 'const publish = (')).toMatch(/if \(emptyRefused\)/)
    expect(body(builder, 'const saveDraft = (')).not.toMatch(/emptyRefused/)
    expect(status).toMatch(/refusesEmpty\(\{ rules: live\.rules/)
  })
})
