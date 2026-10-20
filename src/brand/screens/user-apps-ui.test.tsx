/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { defaultOidc, defaultSaml, shownOnDashboard } from '../app-setup'
import { showcaseTenant } from '../fixtures'
import { BrandProvider } from '../store'
import src from './UserApps.tsx?raw'
import { UserApps } from './UserApps'

/* -----------------------------------------------------------------------------
   The end user's Apps page leaves out an application whose Sign-in options
   say not to show it on the dashboard (spec APP-CREATE-AND-ACCESS.md §5).

   The store opens on the seed applications, none of which has a setup of its
   own, so the page is drawn once to show they all still list; the filter
   itself is pinned on the source, as the store cannot be seeded with an
   application added this session.
   -------------------------------------------------------------------------- */

const code = src.replace(/\/\*[\s\S]*?\*\//g, '')

describe("the end user's Apps page", () => {
  it('lists every seed application', () => {
    const out = renderToStaticMarkup(
      <BrandProvider>
        <UserApps />
      </BrandProvider>,
    )
    const cards = out.split('class="buapps__card"').length - 1
    expect(cards).toBe(showcaseTenant().apps.length)
  })

  it('reads the dashboard setting before it lists or searches', () => {
    expect(code).toContain('all.filter((a) => shownOnDashboard(a.setup))')
    /* The search and the empty state read the filtered list, never the store's. */
    expect(code).not.toMatch(/\ball\.length\b/)
    expect(code).toContain('apps.filter((a) => a.name.toLowerCase().includes(needle))')
  })

  it("shows a seed application, and hides an OAuth one added with the live form's default", () => {
    expect(shownOnDashboard(undefined)).toBe(true)
    expect(shownOnDashboard(defaultSaml())).toBe(true)
    expect(shownOnDashboard(defaultOidc('c'))).toBe(false)
  })
})
