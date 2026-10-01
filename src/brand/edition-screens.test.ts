/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import { featuresOf } from './edition'
import { SCREEN_FEATURE, screenOffered } from './edition-screens'
import appSrc from './BrandApp.tsx?raw'
import shellSrc from './Shell.tsx?raw'

/* Lite withholds the tenant-wide Sign-in tests page (edition.ts); the rail
   and the route read the same table, so the item cannot show where the page
   will not open (V4 review P11). */

describe('what an edition withholds', () => {
  it('holds Sign-in tests back behind Policy testing, and nothing else', () => {
    expect(SCREEN_FEATURE).toEqual({ 'sign-in-tests': 'policyTesting' })
    expect(screenOffered({ name: 'sign-in-tests' }, featuresOf('lite'))).toBe(false)
    expect(screenOffered({ name: 'sign-in-tests' }, featuresOf('full'))).toBe(true)
    for (const name of ['policies', 'board', 'zones', 'fingerprint', 'methods'] as const) {
      expect(screenOffered({ name }, featuresOf('lite')), name).toBe(true)
    }
    expect(screenOffered(undefined, featuresOf('lite'))).toBe(true)
  })

  it('leaves the rail item out, and sends the route to the policies', () => {
    expect(shellSrc).toContain('item.children.filter((c) => screenOffered(c.screen, features))')
    expect(appSrc).toContain('const withheld = !screenOffered(screen, features)')
    expect(appSrc).toContain("if (withheld) go({ name: 'policies' })")
    expect(appSrc).toContain('if (withheld) return <Policies />')
  })
})
