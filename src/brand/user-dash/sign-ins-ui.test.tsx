import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import { showcaseTenant } from '../fixtures'
import { DeviceList } from './DevicesPage'
import { SignInTable, SignInsPage } from './SignInsPage'
import { seedUserDash } from './seed'

/* Recent sign-ins and Devices (plan Task 5). The person sees what happened, never which policy decided it. */

const s = seedUserDash()
const wrap = (node: React.ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)

describe('Recent sign-ins', () => {
  it('never names a policy', () => {
    const out = wrap(<SignInTable rows={s.signIns} reported={[]} onReport={() => {}} />)
    for (const p of showcaseTenant().policies) expect(out).not.toContain(p.name)
  })

  it('reported row is marked and loses its action', () => {
    const out = wrap(<SignInTable rows={s.signIns} reported={['s4']} onReport={() => {}} />)
    expect(out.split('>Reported<').length - 1).toBe(1)
    expect(out.split("This wasn&#x27;t me").length - 1).toBe(s.signIns.length - 1)
  })

  it('says the place is approximate', () => {
    expect(wrap(<SignInsPage />)).toContain('Places are approximate')
  })
})

describe('Devices', () => {
  it('current device cannot be signed out', () => {
    const out = wrap(<DeviceList devices={s.devices} onSignOut={() => {}} />)
    expect(out).toContain('This device')
    expect(out.split('>Sign out<').length - 1).toBe(s.devices.length - 1)
  })
})
