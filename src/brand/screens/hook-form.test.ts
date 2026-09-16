import { describe, expect, it } from 'vitest'

import type { Policy, PolicyStatus, Rule } from '../data'
import { seedHooks, validateHook, type Hook } from '../hooks'
import { HOOK_FIELD_ORDER, firstInvalidField, hookDirty, hookEditImpact } from './hook-form'

/* Only the fields the usage scan reads. */
const rule = (id: string, hookId: string): Rule =>
  ({
    id,
    name: id,
    enabled: true,
    decision: 'deny',
    when: { cards: [{ id: `${id}-c`, conditions: [{ id: `${id}-k`, typeId: 'webhook', operator: 'in', values: [hookId] }] }] },
  }) as unknown as Rule

const policy = (name: string, status: PolicyStatus, rules: Rule[], draftRules?: Rule[]): Policy =>
  ({
    id: name,
    name,
    status,
    rules,
    pendingDraft: draftRules ? { rules: draftRules, savedAt: '2026-09-15T00:00:00Z' } : undefined,
  }) as unknown as Policy

const fraud = seedHooks.find((h) => h.id === 'hk-fraud')!

describe('hookDirty', () => {
  it('is false for the hook as opened', () => {
    expect(hookDirty(fraud, { ...fraud })).toBe(false)
  })

  it('ignores whitespace and emptied optional fields, which are not stored', () => {
    const noHeader: Hook = { ...fraud, authHeader: undefined }
    expect(hookDirty(noHeader, { ...noHeader, authHeader: '' })).toBe(false)
    expect(hookDirty(fraud, { ...fraud, name: `  ${fraud.name}  ` })).toBe(false)
  })

  it('is true for a real change', () => {
    expect(hookDirty(fraud, { ...fraud, onFailure: 'fail-closed' })).toBe(true)
  })
})

describe('firstInvalidField', () => {
  it('picks the first error in form order and skips warnings', () => {
    const blank: Hook = { ...fraud, id: '', name: '', url: '', responsePath: '', timeoutMs: 900 }
    const issues = validateHook(blank)
    expect(issues.some((i) => i.level === 'warning' && i.field === 'timeoutMs')).toBe(true)
    expect(firstInvalidField(issues)).toBe('name')
    expect(firstInvalidField(issues.filter((i) => i.field !== 'name'))).toBe('url')
  })

  it('is null when only warnings remain', () => {
    expect(firstInvalidField(validateHook({ ...fraud, timeoutMs: 900 }))).toBeNull()
  })

  it('covers every field a hook issue can name', () => {
    expect([...HOOK_FIELD_ORDER].sort()).toEqual(['maxAgeHours', 'name', 'responsePath', 'timeoutMs', 'url'])
  })
})

describe('hookEditImpact', () => {
  const live = policy('Fraud guard', 'active', [rule('r1', fraud.id)])

  it('says nothing for a new hook', () => {
    expect(hookEditImpact(undefined, fraud, [live])).toEqual({ modeError: null, liveChanged: [] })
  })

  it('blocks switching a hook live rules call to attribute sync', () => {
    const out = hookEditImpact(fraud, { ...fraud, mode: 'attribute-sync' }, [live])
    expect(out.modeError).toBe('Live policies call this hook. Remove it from their rules first.')
  })

  it('allows the switch when only drafts or inactive policies use it', () => {
    const others = [policy('Off', 'inactive', [rule('r2', fraud.id)]), policy('Later', 'active', [], [rule('d1', fraud.id)])]
    expect(hookEditImpact(fraud, { ...fraud, mode: 'attribute-sync' }, others)).toEqual({ modeError: null, liveChanged: [] })
  })

  it('names the live policies when behaviour changes', () => {
    expect(hookEditImpact(fraud, { ...fraud, onFailure: 'fail-closed' }, [live]).liveChanged).toEqual(['Fraud guard'])
    expect(hookEditImpact(fraud, { ...fraud, timeoutMs: 400 }, [live]).liveChanged).toEqual(['Fraud guard'])
    expect(hookEditImpact(fraud, { ...fraud, url: 'https://risk.internal/v3' }, [live]).liveChanged).toEqual(['Fraud guard'])
  })

  it('stays quiet for a rename or a new description', () => {
    expect(hookEditImpact(fraud, { ...fraud, name: 'Fraud score', description: 'Risk team' }, [live]).liveChanged).toEqual([])
  })
})
