import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

/* The compact More filters is on the Design line only; these tests draw it whatever line the test run resolves to. */
vi.mock('../rollout', async (importOriginal) => {
  const real = await importOriginal<typeof import('../rollout')>()
  return { ...real, shows: (c: Parameters<typeof real.shows>[0]) => c === 'moreFiltersCompact' || real.shows(c) }
})

import { apps, groups, policies, users, type Policy } from '../data'
import { ROLLOUT } from '../rollout'
import { FilterPane, MoreFilters } from './more-filters'
import {
  FILTER_ORDER,
  NO_FILTERS,
  filterSummary,
  opOf,
  policyMatches,
  summaryText,
  withOp,
  type PolicyFilterKey,
  type PolicyFilters,
} from './more-filters-model'
import css from './more-filters.css?raw'

/* More filters, compact (owner, 23 Nov 2026: "just like Jira … = and ≠ … in a dropdown"). Static markup only: the
   clicks and keys are checked in the browser. */

const NOW = Date.parse('2026-11-23T12:00:00Z')
const DAY = 86_400_000
/* A fixed history: every third policy never changed, the rest one more week back each. */
const ctx = {
  users,
  now: NOW,
  lastChanged: (p: Policy) => {
    const i = policies.indexOf(p)
    return i % 3 === 0 ? undefined : NOW - i * 7 * DAY
  },
}
const matching = (f: PolicyFilters) => policies.filter((p) => policyMatches(p, f, ctx))

const appId = policies.find((p) => !p.isSystem && p.appIds.length > 0)!.appIds[0]
const one: Record<PolicyFilterKey, PolicyFilters> = {
  app: { ...NO_FILTERS, app: [appId] },
  person: { ...NO_FILTERS, person: [users[0].id] },
  group: { ...NO_FILTERS, group: [groups[0].id] },
  outcome: { ...NO_FILTERS, outcome: ['deny'] },
  changed: { ...NO_FILTERS, changed: '30' },
}

describe('is not (≠)', () => {
  it.each(FILTER_ORDER)('%s: = and ≠ on the same values split the list in two', (k) => {
    const is = matching(one[k])
    const not = matching(withOp(one[k], k, 'not'))
    expect(is.length + not.length).toBe(policies.length)
    expect(is.filter((p) => not.includes(p))).toEqual([])
  })

  it('Application ≠ keeps no policy on that application', () => {
    const kept = matching(withOp(one.app, 'app', 'not'))
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.some((p) => p.appIds.includes(appId))).toBe(false)
  })

  it('Rule outcome ≠ Deny keeps no policy with a deny rule in force', () => {
    const kept = matching(withOp(one.outcome, 'outcome', 'not'))
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.some((p) => p.rules.some((r) => r.enabled && r.decision === 'deny'))).toBe(false)
  })

  it('mixes with = across attributes: every attribute must hold', () => {
    const f = withOp({ ...NO_FILTERS, app: [appId], outcome: ['deny'] }, 'app', 'not')
    for (const p of matching(f)) {
      expect(p.appIds.includes(appId)).toBe(false)
      expect(p.rules.some((r) => r.enabled && r.decision === 'deny')).toBe(true)
    }
  })

  it('an operator alone filters nothing, and setting it back to = leaves no trace', () => {
    const bare = withOp(NO_FILTERS, 'group', 'not')
    expect(opOf(bare, 'group')).toBe('not')
    expect(opOf(bare, 'app')).toBe('is')
    expect(matching(bare)).toHaveLength(policies.length)
    expect(withOp(bare, 'group', 'is').not).toBeUndefined()
  })
})

describe('the chip', () => {
  const nameOf = (k: PolicyFilterKey, v: string) =>
    k === 'app' ? (apps.find((a) => a.id === v)?.name ?? v) : k === 'outcome' ? ({ deny: 'Deny' } as Record<string, string>)[v] : v

  it('says each attribute with its operator, two names each, then how many more', () => {
    const [a, b, c] = apps
    const f = withOp({ ...NO_FILTERS, app: [a.id, b.id, c.id], outcome: ['deny'] }, 'app', 'not')
    expect(summaryText(filterSummary(f, nameOf))).toBe(`Application ≠ ${a.name}, ${b.name} +1 more and Rule outcome = Deny`)
  })

  it('draws the operator in the applied chip', () => {
    const slack = apps.find((x) => x.id === 'slack')!
    const html = renderToStaticMarkup(
      <MoreFilters value={withOp({ ...NO_FILTERS, app: [slack.id] }, 'app', 'not')} onChange={() => {}} apps={apps} users={users} groups={groups} />,
    )
    expect(html).toContain(`title="Application ≠ ${slack.name}"`)
    expect(html).toContain('<span class="bmf__summark">≠</span>')
  })
})

describe('one field’s pane', () => {
  const pane = (field: PolicyFilterKey, value: PolicyFilters = NO_FILTERS, options = [] as Parameters<typeof FilterPane>[0]['options']) =>
    renderToStaticMarkup(<FilterPane field={field} value={value} onChange={() => {}} options={options} />)

  it('opens on = is, with the operator before the search', () => {
    const html = pane('app', NO_FILTERS, apps.map((a) => ({ value: a.id, label: a.name })))
    expect(html).toContain('aria-label="Application is"')
    expect(html.indexOf('bmf__op')).toBeLessThan(html.indexOf('bx-search'))
    expect(html).toContain('placeholder="Search applications"')
  })

  it('reads ≠ is not once the field is set to it', () => {
    const html = pane('group', withOp({ ...NO_FILTERS, group: [groups[0].id] }, 'group', 'not'), [{ value: groups[0].id, label: groups[0].name }])
    expect(html).toContain('aria-label="Group is not"')
    expect(html).toContain('>≠</span>')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('Clear group')
  })

  it('rule outcomes carry their marks and need no search', () => {
    const html = renderToStaticMarkup(
      <MoreFilters value={{ ...NO_FILTERS, outcome: ['deny'] }} onChange={() => {}} apps={apps} users={users} groups={groups} />,
    )
    expect(html).not.toContain('bmf__pop')
    const outcomes = pane('outcome', { ...NO_FILTERS, outcome: ['deny'] }, [{ value: 'deny', label: 'Deny', art: <span className="bmf__dmark is-negative" /> }])
    expect(outcomes).toContain('bmf__dmark is-negative')
    expect(outcomes).not.toContain('bx-search')
  })

  it('last changed is one choice', () => {
    const html = pane('changed', { ...NO_FILTERS, changed: '7' })
    expect(html).toContain('role="radiogroup"')
    expect(html.match(/role="radio"/g)).toHaveLength(4)
    expect(html).toContain('aria-checked="true"')
  })
})

describe('rollout and sheet', () => {
  it('ships to Design only', () => {
    expect(ROLLOUT.moreFiltersCompact).toEqual(['design'])
  })

  const compact = css.slice(css.indexOf('--- Compact'))
  it('the compact rules use tokens, keep the 12px floor and put no transform on anything', () => {
    expect(compact.length).toBeGreaterThan(0)
    expect(compact).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(compact).not.toMatch(/rgba?\(/)
    expect(compact).not.toContain('--fs-xs')
    expect(compact).not.toContain('transform')
  })
})
