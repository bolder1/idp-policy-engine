/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { BrandScreen } from './store'

/* The rail lights one top-level row: where you are (review 10 Oct 2026, #11).
   A group lights for a page among its children, but not through a shortcut
   marked `lights: false` — Display tokens is opened from Configure ›
   Authentication methods › "Assign Hardware Token to Users", and lit that
   group as well as Policies, so the rail said you were in two places.

   The store has no way in for a starting screen, so the shell is drawn with
   `useBrand` answering the screen asked for and everything else as it is. */

/** The rail drawn on `screen`: its lit top-level rows, and its lit sub-items (the Policies submenu is the one open at first), by label. */
async function litOn(screen: BrandScreen): Promise<{ rows: string[]; subs: string[] }> {
  vi.resetModules()
  vi.doMock('./store', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./store')>()
    return { ...actual, useBrand: () => ({ ...actual.useBrand(), screen }) }
  })
  try {
    const { BrandProvider } = await import('./store')
    const { Shell } = await import('./Shell')
    const out = renderToStaticMarkup(
      <BrandProvider>
        <Shell>
          <div />
        </Shell>
      </BrandProvider>,
    )
    const lit = (cls: string) => cls.split(' ').includes('is-active')
    return {
      rows: [...out.matchAll(/class="bshell__item ([^"]*)" data-rail-item="([^"]+)"/g)].filter((m) => lit(m[1])).map((m) => m[2]),
      subs: [...out.matchAll(/class="bshell__subitem ([^"]*)"[^>]*>([^<]+)/g)].filter((m) => lit(m[1])).map((m) => m[2]),
    }
  } finally {
    vi.doUnmock('./store')
    vi.resetModules()
  }
}

/* Each case loads the shell's whole module graph afresh, which can pass five seconds under load. */
describe('the rail’s lit row', { timeout: 30_000 }, () => {
  /* Authentication methods is its own rail item since 7 Oct 2026 (owner:
     "move it outside Policies as a specific tab"), and Display tokens is
     opened from it, so it is the one row lit (`UNDER_ITEM`, routes.test.ts). */
  it('is Authentication methods alone on Display tokens', async () => {
    const lit = await litOn({ name: 'display-tokens' })
    expect(lit.rows).toEqual(['Authentication methods'])
    expect(lit.subs).toEqual([])
  })

  it('is the group a page belongs to: Users, Groups', async () => {
    expect((await litOn({ name: 'users' })).rows).toEqual(['Users'])
    expect((await litOn({ name: 'groups' })).rows).toEqual(['Groups'])
  })

  it('is Apps on an application’s page', async () => {
    expect((await litOn({ name: 'application', appId: 'slack' })).rows).toEqual(['Apps'])
  })
})
