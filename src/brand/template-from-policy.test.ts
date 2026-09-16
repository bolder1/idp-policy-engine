import { describe, expect, it } from 'vitest'

import { blankRule, card, cond, fallbackRule, when, type Policy } from './data'
import { scenarioFromPolicy } from './template-from-policy'

const source = (over: Partial<Policy> = {}): Policy => ({
  id: 'p1',
  name: 'Finance',
  type: 'App Access',
  appIds: ['a1'],
  audience: { everyone: false, groupIds: ['executives'], userIds: ['u1'] },
  rules: [
    { ...blankRule('Outside office'), when: when(card(cond('zone', 'not in zone', ['office']))), decision: 'deny' },
    blankRule('Everyone else steps up'),
  ],
  fallback: fallbackRule('1fa'),
  status: 'active',
  lastModified: 'Yesterday',
  modifiedBy: 'Admin',
  ...over,
})

const fields = { name: 'Finance baseline', description: 'For finance apps', category: 'Compliance' }

describe('scenarioFromPolicy', () => {
  it('re-ids rules, cards and conditions on every build', () => {
    const p = source()
    const s = scenarioFromPolicy(p, fields)
    const a = s.rules[0].build()
    const b = s.rules[0].build()

    const srcIds = [p.rules[0].id, p.rules[0].when.cards[0].id, p.rules[0].when.cards[0].conditions[0].id]
    const aIds = [a.id, a.when.cards[0].id, a.when.cards[0].conditions[0].id]
    const bIds = [b.id, b.when.cards[0].id, b.when.cards[0].conditions[0].id]

    for (const id of aIds) expect(srcIds).not.toContain(id)
    for (const id of bIds) expect(srcIds).not.toContain(id)
    aIds.forEach((id, i) => expect(id).not.toBe(bIds[i]))

    expect(a.when.cards[0].conditions[0].values).not.toBe(p.rules[0].when.cards[0].conditions[0].values)
    expect(a.name).toBe('Outside office')
    expect(a.decision).toBe('deny')
  })

  it('carries the audience, as a copy', () => {
    const p = source()
    const s = scenarioFromPolicy(p, fields)
    expect(s.audience).toEqual(p.audience)
    expect(s.audience.groupIds).not.toBe(p.audience.groupIds)
  })

  it('carries the category, Uncategorized included', () => {
    expect(scenarioFromPolicy(source(), fields).category).toBe('Compliance')
    expect(scenarioFromPolicy(source(), { ...fields, category: 'Uncategorized' }).category).toBe('Uncategorized')
    expect(scenarioFromPolicy(source(), { ...fields, category: 'Something else' }).category).toBe('Uncategorized')
  })

  it("is the tenant's own, with a unique id and readable rule text", () => {
    const p = source()
    const a = scenarioFromPolicy(p, fields, 1000)
    const b = scenarioFromPolicy(p, fields, 1000)
    expect(a.id).not.toBe(b.id)
    expect(a.provided).toBeUndefined()
    expect(a.author).toBe('You')
    expect(a.name).toBe('Finance baseline')
    expect(a.rules.map((r) => r.decision)).toEqual(['deny', '2fa'])
    expect(a.rules[0].ifText).toMatch(/^[A-Z]/)
    expect(a.rules[0].ifText.length).toBeGreaterThan(0)
  })

  it('carries each rule who into every build, and leads the IF text with it', () => {
    const p = source({
      rules: [{ ...blankRule('Finance off-network'), who: { groupIds: ['finance'], userIds: [] }, when: when(card(cond('zone', 'not in zone', ['office']))) }],
    })
    const s = scenarioFromPolicy(p, fields)
    const built = s.rules[0].build()
    expect(built.who).toEqual({ groupIds: ['finance'], userIds: [] })
    expect(built.who!.groupIds).not.toBe(p.rules[0].who!.groupIds)
    expect(s.rules[0].ifText).toBe('For Finance, not in zone Office Network')
  })

  it('builds from a saved draft when there is one', () => {
    const drafted = source({ pendingDraft: { rules: [blankRule('Draft rule')], fallback: fallbackRule('1fa'), savedAt: 'Just now', savedBy: 'You' } })
    const s = scenarioFromPolicy(drafted, fields)
    expect(s.rules.map((r) => r.name)).toEqual(['Draft rule'])
  })

  it('trims the name and description', () => {
    const s = scenarioFromPolicy(source(), { ...fields, name: '  Finance baseline ', description: ' For finance apps  ' })
    expect(s.name).toBe('Finance baseline')
    expect(s.description).toBe('For finance apps')
  })
})

