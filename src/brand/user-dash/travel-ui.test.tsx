import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../fixtures'
import { BrandProvider } from '../store'
import { TripCard } from './TravelPage'

/* The Travel page's trip card (plan Task 7): apps grouped by outlook, never a policy, one ask per trip. */

const trip = { id: 't1', placeId: 'sg', start: '2026-12-03', end: '2026-12-10' }
const outlook = [
  { appId: 'hrms', outlook: 'blocked' as const, policyId: 'sc-hrms-office' },
  { appId: 'slack', outlook: 'works' as const, policyId: null },
  { appId: 'zoom', outlook: 'unsure' as const, policyId: null },
]
const draw = (asked: 'no' | 'pending' | 'approved' | 'declined') =>
  renderToStaticMarkup(
    <BrandProvider>
      <TripCard trip={trip} outlook={outlook} asked={asked} onAsk={() => {}} />
    </BrandProvider>,
  )

describe('a trip card', () => {
  it('groups the apps', () => {
    const out = draw('no')
    for (const g of ['Won&#x27;t work there', 'Works there', 'Can&#x27;t tell yet']) expect(out).toContain(g)
  })

  it('never names a policy', () => {
    const out = draw('no')
    for (const p of showcaseTenant().policies) expect(out).not.toContain(p.name)
    expect(out).not.toContain('sc-hrms-office')
  })

  it('asks once per trip', () => {
    expect(draw('no')).toContain('Ask for access while I&#x27;m there')
    const pending = draw('pending')
    expect(pending).toContain('Access asked for')
    expect(pending).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>)[\s\S])*Access asked for/)
  })

  it('asks again after a decline', () => {
    expect(draw('declined')).toContain('Ask again')
  })
})
