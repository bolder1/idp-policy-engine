import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { AppsHome } from './AppsHome'
import { homeEmpty, homeSections } from './home'
import { seedUserDash } from './seed'

/* The proposed Apps home (plan Task 3): things to do, favourites, recently used, all apps, hidden apps, request an app. */

const draw = () =>
  renderToStaticMarkup(
    <BrandProvider>
      <AppsHome />
    </BrandProvider>,
  )

const apps = [
  { id: 'slack', name: 'Slack' },
  { id: 'hrms', name: 'HRMS' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'jira', name: 'Jira' },
]

describe('the proposed Apps home', () => {
  it('no protocol names', () => {
    expect(draw()).not.toMatch(/\b(SAML|OIDC|OAuth)\b/)
  })

  it('favourites first', () => {
    const out = draw()
    expect(out.indexOf('Favourites')).toBeGreaterThan(-1)
    expect(out.indexOf('Favourites')).toBeLessThan(out.indexOf('All apps'))
  })

  it('one orange button', () => {
    expect(draw().split('bx-btn--brand').length - 1).toBeLessThanOrEqual(1)
  })

  it('shows things to do when the checkup has open items', () => {
    const out = draw()
    expect(out).toContain('Things to do')
    /* Said as the thing to do, not as the checkup's noun. */
    expect(out).toContain('Change your password')
  })

  it('all hidden', () => {
    const s = { ...seedUserDash(), hidden: apps.map((a) => a.id) }
    const out = homeSections(apps, s, '', false)
    expect(out.all).toEqual([])
    expect(out.favourites).toEqual([])
    expect(homeSections(apps, s, '', true).all).toHaveLength(4)
  })

  it('says which empty it is', () => {
    expect(homeEmpty(0, 0, '')).toBe('none')
    expect(homeEmpty(4, 0, '')).toBe('hidden')
    expect(homeEmpty(4, 0, 'zz')).toBe('search')
    expect(homeEmpty(4, 2, '')).toBeNull()
  })

  it('search narrows every section', () => {
    const out = homeSections(apps, seedUserDash(), 'sl', false)
    expect(out.favourites.map((a) => a.id)).toEqual(['slack'])
    expect(out.all.map((a) => a.id)).toEqual(['slack'])
  })
})
