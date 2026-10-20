/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

import storeSrc from './store.tsx?raw'
import appSrc from './BrandApp.tsx?raw'
import shellSrc from './Shell.tsx?raw'
import applicationsSrc from './screens/Applications.tsx?raw'

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

  /* Add application (spec APP-CREATE-AND-ACCESS.md §3, §5): the Applications
     list's button opens Choose application, a pick opens that entry's unsaved
     application, and the rail stays on Apps throughout. It was a "coming soon"
     toast until 13 Oct 2026. */
  it('opens Add application on the catalogue, then on the entry picked', () => {
    expect(ROUTES).toContain('application-new')
    expect(appSrc).toContain('screen.catalogId ? <NewApplicationPage key={screen.catalogId} catalogId={screen.catalogId} /> : <AppCatalog />')
    expect(applicationsSrc).toContain("store.go({ name: 'application-new' })")
    expect(applicationsSrc).not.toContain('Adding applications is')
    expect(shellSrc).toContain("applications: ['application', 'application-new']")
  })

  /* An application's Policies tab (spec APP-POLICY-TAB.md): "View all" opens
     Sign-in activity on that application, or on the policy's changes with its
     name searched; "{n} people" opens the Users tab filtered by the policy. */
  it('lets Sign-in activity open narrowed, and the Users tab filter by policy', () => {
    expect(storeSrc).toContain("| { name: 'sign-in-activity'; appId?: string; view?: 'sign-ins' | 'changes'; q?: string; from?: { appId: string } }")
    const application = /\|\s*\{\s*name: 'application'\s([\s\S]*?)\n\s*\}/.exec(storeSrc)?.[1] ?? ''
    expect(application).toContain('appId: string')
    expect(application).toContain('group?: string')
    expect(application).toContain('policy?: string')
  })

  it('hands the application page the drawer its route asks to open, and the Users tab its policy filter', () => {
    expect(appSrc).toContain('const { appId, tab, group, policy, flash, from, open } = screen')
    expect(appSrc).toContain('group={group} policy={policy}')
    expect(appSrc).toContain('from={from} open={open} />')
  })

  it('hands Sign-in activity the way it was opened: the application, the view, the search and the way back', () => {
    expect(appSrc).toContain('const { appId, view, q, from } = screen')
    expect(appSrc).toContain('appId={appId} view={view} q={q} from={from} />')
  })

  /* Display tokens is opened from Authentication methods, and the rail has to
     keep saying so. Authentication methods is its own item since 7 Oct 2026
     (owner: "move it outside Policies"), and the console's 2-Factor
     Authentication group — "Assign Hardware Token to Users" with it — is gone:
     the Hardware Token row is the way in. */
  it('lights Authentication methods on the Display tokens page', () => {
    expect(ROUTES).toContain('display-tokens')
    expect(shellSrc).toContain("methods: ['display-tokens']")
    expect(shellSrc).toContain("{ label: 'Authentication methods', icon: KeyRound, screen: { name: 'methods' } },")
    expect(shellSrc).not.toContain("label: 'Assign Hardware Token to Users'")
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

  /* Policy testing lives in the board's test panel only (Version 3, 28 Sep
     2026): no page, no slider, no rail item. */
  it('has no Policy testing page or slider', () => {
    expect(ROUTES).not.toContain('policy-testing')
    expect(appSrc).toContain('<Policies />')
    expect(shellSrc).not.toContain("label: 'Policy testing'")
  })

  it('wraps the screen in an error boundary, inside the provider', () => {
    expect(appSrc).toContain('<ScreenErrorBoundary')
    expect(appSrc.indexOf('<ScreenErrorBoundary')).toBeGreaterThan(appSrc.indexOf('function Chrome()'))
  })
})
