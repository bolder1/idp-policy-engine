/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import storeSrc from './store.tsx?raw'
import appSrc from './BrandApp.tsx?raw'
import shellSrc from './Shell.tsx?raw'

/* Every route in the union has somewhere to go.

   `Screen()` in BrandApp.tsx is a switch over `screen.name` with no `default`
   and no exhaustiveness assertion. Adding a member to `BrandScreen` without
   adding a `case` compiles green — the return type merely widens to include
   `undefined`, which React accepts — and the console renders a blank page with
   the rail still highlighted, which reads as a load that failed rather than as
   a route that was never wired.

   Greps the source rather than rendering, the same technique and for the same
   reason as `edition.test.ts`: the property is about what the file SAYS, and
   mounting the app to discover a missing case would need the whole provider
   tree standing up first.

   A weak check — it would not catch a case that returns the wrong screen — but
   it is exactly the one that a new route is most likely to miss. */

/** Every `{ name: 'x' }` member of the BrandScreen union. */
const ROUTES = [...storeSrc.matchAll(/\|\s*\{\s*name:\s*'([a-z-]+)'/g)].map((m) => m[1])

describe('the route union', () => {
  it('finds some routes to check', () => {
    // A regex that silently matched nothing would make the rest vacuous.
    expect(ROUTES.length).toBeGreaterThan(8)
    expect(ROUTES).toContain('policies')
  })

  it('gives every route a case in the screen switch', () => {
    for (const name of ROUTES) {
      expect(`${name}: ${appSrc.includes(`case '${name}':`)}`).toBe(`${name}: true`)
    }
  })

  it('keeps the admin catalogue and the end-user launcher as two routes', () => {
    /* They are one word apart and mean opposite things: `applications` is the
       admin's Apps page, `apps` is what an end user lands on. `store.apps` is
       the admin's collection, which is why the admin route could not simply
       take the shorter name. */
    expect(ROUTES).toContain('applications')
    expect(ROUTES).toContain('apps')
    expect(appSrc).toContain('<Applications />')
    expect(appSrc).toContain('<UserApps />')
  })

  it('reaches the Applications screen from the rail', () => {
    expect(shellSrc).toContain("screen: { name: 'applications' }")
  })

  /* Display tokens is opened from Authentication methods, and the rail has to
     keep saying so. The console's own "Assign Hardware Token to Users" item
     opens it too, without lighting a second place. */
  it('lights Authentication methods on the Display tokens page', () => {
    expect(ROUTES).toContain('display-tokens')
    expect(shellSrc).toContain("methods: ['display-tokens']")
  })

  it('opens Display tokens from the rail item the live console uses, unlit', () => {
    const line = shellSrc.split('\n').find((l) => l.includes("label: 'Assign Hardware Token to Users'")) ?? ''
    expect(line).toContain("screen: { name: 'display-tokens', tab: 'assignments' }")
    expect(line).toContain('lights: false')
  })

  /* A lazy screen that is not prewarmed shows a blank busy page on its first
     open. Risk signal profile and Policy details were both missing. */
  it('prewarms every lazily loaded screen', () => {
    const lazySpecs = [...appSrc.matchAll(/lazy\(\(\) => import\('([^']+)'\)/g)].map((m) => m[1])
    const warm = appSrc.slice(appSrc.indexOf('const warm = () => {'))
    const warmBody = warm.slice(0, warm.indexOf('\n}'))
    expect(lazySpecs.length).toBeGreaterThan(5)
    for (const spec of lazySpecs) expect(`${spec}: ${warmBody.includes(`import('${spec}')`)}`).toBe(`${spec}: true`)
  })

  it('wraps the screen in an error boundary, inside the provider', () => {
    expect(appSrc).toContain('<ScreenErrorBoundary')
    expect(appSrc.indexOf('<ScreenErrorBoundary')).toBeGreaterThan(appSrc.indexOf('function Chrome()'))
  })
})
