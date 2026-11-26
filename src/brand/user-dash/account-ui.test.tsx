import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandProvider } from '../store'
import type { AccountPage as Page } from '../store'
import { AccountPage } from './AccountPage'

/* My account (plan Task 4): the frame's seven pages, the Overview checkup, and Sign-in methods as today's Setup 2FA. */

const draw = (page: Page) =>
  renderToStaticMarkup(
    <BrandProvider>
      <AccountPage page={page} />
    </BrandProvider>,
  )

describe('My account', () => {
  it('lists seven pages', () => {
    const out = draw('overview')
    for (const name of ['Overview', 'Sign-in methods', 'Recent sign-ins', 'Devices', 'Travel', 'Profile', 'Password']) {
      expect(out).toContain(`>${name}<`)
    }
    expect(out.split('class="bud-acct__link').length - 1).toBe(7)
  })

  it('marks the open page', () => {
    const current = draw('devices').match(/aria-current="page"[^>]*>([\s\S]*?)<\/button>/)
    expect(current?.[1]).toContain('<span>Devices</span>')
  })

  it('overview shows the checkup', () => {
    const out = draw('overview')
    expect(out).toContain('Account checkup')
    for (const label of ['Second method', 'Backup method', 'Passkey', 'Password']) expect(out).toContain(label)
  })

  it('methods page is Setup 2FA', () => {
    expect(draw('methods')).toMatch(/Two-step verification|Authentication methods/)
  })
})
