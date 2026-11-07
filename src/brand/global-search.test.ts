import { describe, expect, it } from 'vitest'

import { PER_KIND, RECENT_MAX, hitFor, pushRecent, score, search, type Hit } from './global-search'

const hit = (id: string, kind: Hit['kind'], label: string, meta?: string, screen: Hit['screen'] = { name: 'policies' }): Hit => ({
  id,
  kind,
  label,
  meta,
  screen,
})

const INDEX: Hit[] = [
  hit('page:zones', 'page', 'Zones', 'Policies', { name: 'zones' }),
  hit('policy:p1', 'policy', 'HRMS from the offices', 'Active', { name: 'board', policyId: 'p1' }),
  hit('policy:p2', 'policy', 'Dev tools on corporate devices', 'Draft', { name: 'board', policyId: 'p2' }),
  hit('app:hrms', 'app', 'HRMS', undefined, { name: 'application', appId: 'hrms' }),
  hit('user:maya', 'user', 'Maya Rao', 'maya@example.com', { name: 'users' }),
  hit('zone:z1', 'library', 'Bengaluru office', 'Zone', { name: 'zones' }),
]

describe('global search', () => {
  it('ranks a name that starts with the words above a word inside it, above the second line', () => {
    expect(score(INDEX[3], 'hrms')).toBe(3)
    expect(score(INDEX[2], 'corp')).toBe(2)
    expect(score(INDEX[4], 'example')).toBe(1)
    expect(score(INDEX[4], 'nobody')).toBe(0)
  })

  it('needs every word typed, in any order', () => {
    expect(score(INDEX[1], 'offices hrms')).toBeGreaterThan(0)
    expect(score(INDEX[1], 'hrms devices')).toBe(0)
  })

  it('groups results in a fixed order, best first, and lists nothing for an empty query', () => {
    const r = search(INDEX, 'hrms')
    expect(r.map((g) => g.heading)).toEqual(['Policies', 'Apps'])
    expect(search(INDEX, '   ')).toEqual([])
    expect(search(INDEX, 'zone').map((g) => g.heading)).toEqual(['Pages', 'Libraries'])
  })

  it('caps each group', () => {
    const many = Array.from({ length: 9 }, (_, i) => hit(`policy:${i}`, 'policy', `Policy ${i}`))
    expect(search(many, 'policy')[0].hits).toHaveLength(PER_KIND)
  })

  it('finds the place a screen is, a policy’s details counting as the policy', () => {
    expect(hitFor(INDEX, { name: 'policy-details', policyId: 'p2' })?.id).toBe('policy:p2')
    expect(hitFor(INDEX, { name: 'application', appId: 'hrms', tab: 'users' })?.id).toBe('app:hrms')
    expect(hitFor(INDEX, { name: 'zones' })?.id).toBe('page:zones')
  })

  it('keeps Recent short, newest first, each place once', () => {
    let list: string[] = []
    for (const id of ['a', 'b', 'a', 'c', 'd', 'e', 'f', 'g']) list = pushRecent(list, id)
    expect(list).toEqual(['g', 'f', 'e', 'd', 'c', 'a'])
    expect(list).toHaveLength(RECENT_MAX)
  })
})
