import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { NO_FILTER, activityCsv, activitySummaryOf, changesCsv, csvField, filterActivity, reasonCounts, reasonsIn, signInActivity } from './activity'

const TODAY = new Date('2026-09-28T09:30:00Z')

describe('signInActivity', () => {
  const t = showcaseTenant()
  const env = envOf(t)
  const rows = signInActivity(t.policies, env, TODAY, t.apps)

  it('covers every application, with a result and, only on a refusal, a reason', () => {
    expect(rows.length).toBeGreaterThan(t.apps.length)
    for (const r of rows) {
      expect(r.reason !== null, r.id).toBe(r.result === 'blocked')
      if (r.result === 'blocked') expect(r.decision).toBe('deny')
    }
    expect(new Set(rows.map((r) => r.result)).has('allowed')).toBe(true)
    expect(new Set(rows.map((r) => r.result)).has('blocked')).toBe(true)
  })

  it('agrees with the resolver on every row, and says what decided it', () => {
    for (const r of rows.slice(0, 40)) {
      const res = resolveSignIn(t.policies, r.facts, env)
      expect(r.decision, r.id).toBe(res.status === 'decided' ? res.decision : null)
      if (r.result !== 'unclear') expect(r.policyName).toBe(res.decidedBy?.policyName ?? null)
    }
  })

  it('has unique ids', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it('filters by result, reason, application and text, all together', () => {
    const blocked = filterActivity(rows, { ...NO_FILTER, result: 'blocked' })
    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked.every((r) => r.result === 'blocked')).toBe(true)
    const reason = reasonsIn(rows)[0]
    expect(filterActivity(rows, { ...NO_FILTER, reason }).every((r) => r.reason === reason)).toBe(true)
    const one = blocked[0]
    const narrowed = filterActivity(rows, { q: one.who.toUpperCase(), result: 'blocked', reason: 'all', appId: one.appId })
    expect(narrowed.map((r) => r.id)).toContain(one.id)
    expect(filterActivity(rows, { ...NO_FILTER, q: 'zzz-nobody' })).toEqual([])
  })

  it('reports why the refusals were refused: each reason once, most first, adding up to the blocked rows', () => {
    const counts = reasonCounts(rows)
    expect(counts.map((c) => c.reason)).toEqual(reasonsIn(rows))
    expect(counts.map((c) => c.count)).toEqual([...counts.map((c) => c.count)].sort((a, b) => b - a))
    expect(counts.reduce((n, c) => n + c.count, 0)).toBe(rows.filter((r) => r.result === 'blocked').length)
  })

  it('exports a CSV: a header, one line per row, fields quoted when they hold a comma or a quote', () => {
    expect(csvField('a')).toBe('a')
    expect(csvField('Pune, India')).toBe('"Pune, India"')
    expect(csvField('a"b')).toBe(String.raw`"a""b"`)
    const lines = activityCsv(rows).split('\r\n')
    expect(lines[0]).toBe('When,Person,Application,From,Result,Reason,Policy,Rule')
    expect(lines).toHaveLength(rows.length + 1)
    expect(lines.some((l) => l.includes(',Deny,'))).toBe(true)
    expect(changesCsv([{ at: '2026-10-03T10:00:00.000Z', policyName: 'AWS, engineering', by: 'A', lines: ['Added “X”', 'Moved it'] }])).toBe(
      'When,Policy,By,What changed\r\n2026-10-03T10:00:00.000Z,"AWS, engineering",A,Added “X” · Moved it',
    )
  })

  it('says one sign-in as plain text for a ticket, with the reason only when refused', () => {
    const refused = rows.find((r) => r.result === 'blocked')!
    const text = activitySummaryOf(refused).split('\n')
    expect(text[0]).toBe(`Sign-in: ${refused.who} → ${refused.app} · ${refused.when} · from ${refused.from}`)
    expect(text[1]).toBe('Answer: Deny')
    expect(text.at(-1)).toMatch(/^Reason: /)
    const allowed = rows.find((r) => r.result === 'allowed')!
    expect(activitySummaryOf(allowed)).not.toContain('Reason:')
  })
})
