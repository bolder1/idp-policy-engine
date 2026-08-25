import { Suspense, lazy, useEffect } from 'react'
import { MotionConfig } from 'motion/react'

import { Shell } from './Shell'
import { UserShell } from './UserShell'
import { Policies } from './screens/Policies'
import { UserApps } from './screens/UserApps'
import { BrandProvider, useBrand } from './store'

/* -----------------------------------------------------------------------------
   Screens, split by route — and then prefetched so the split cannot be felt.

   Policies is the landing screen, so it ships with the entry. The other seven
   are a click away and were costing everyone their weight on first paint:
   roughly 5,700 lines of screen code for the one screen you happen to open.

   The usual objection to route splitting is the stall on first navigation, and
   in a prototype that gets demoed live that objection is the whole argument —
   nobody wants a spinner in the middle of a walkthrough. So the split is paired
   with `warm()` below: once the browser is idle after first paint, every screen
   chunk is fetched in the background. By the time a nav item is clicked the
   module is already in memory and the Suspense fallback never renders.

   The result is a smaller critical path with the same instant navigation, which
   is the only version of this trade worth making here.
   -------------------------------------------------------------------------- */

const Templates = lazy(() => import('./screens/Library').then((m) => ({ default: m.Templates })))
const FingerprintPage = lazy(() => import('./screens/FingerprintPage').then((m) => ({ default: m.FingerprintPage })))
const Hooks = lazy(() => import('./screens/Hooks').then((m) => ({ default: m.Hooks })))
const ZonesPage = lazy(() => import('./screens/ZonesPage').then((m) => ({ default: m.ZonesPage })))
const AuthMethodsPage = lazy(() => import('./screens/AuthMethodsPage').then((m) => ({ default: m.AuthMethodsPage })))
const CreatePolicy = lazy(() => import('./create/CreatePolicy').then((m) => ({ default: m.CreatePolicy })))
const BuilderPage = lazy(() => import('./screens/BuilderPage').then((m) => ({ default: m.BuilderPage })))

/* Same specifiers as the lazy() calls above — Vite dedupes them to one chunk
   each, so this warms exactly what navigation will ask for and nothing else. */
const warm = () => {
  void import('./screens/Library')
  void import('./screens/FingerprintPage')
  void import('./screens/Hooks')
  void import('./screens/ZonesPage')
  void import('./screens/AuthMethodsPage')
  void import('./create/CreatePolicy')
  void import('./screens/BuilderPage')
}

function usePrefetchScreens() {
  useEffect(() => {
    /* requestIdleCallback where it exists, a timeout where it does not (Safari).
       Either way this is after first paint, which is the point — prefetching
       during the initial render would put back exactly what the split took out. */
    const ric = window.requestIdleCallback
    if (ric) {
      const id = ric(warm, { timeout: 3000 })
      return () => window.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(warm, 1200)
    return () => window.clearTimeout(id)
  }, [])
}

function Screen() {
  const { screen } = useBrand()
  switch (screen.name) {
    case 'apps':
      return <UserApps />
    case 'policies':
      return <Policies />
    case 'builder':
      return <BuilderPage policyId={screen.policyId} open={screen.open} />
    case 'templates':
      return <Templates />
    case 'zones':
      return <ZonesPage />
    case 'fingerprint':
      return <FingerprintPage />
    case 'hooks':
      return <Hooks />
    case 'methods':
      return <AuthMethodsPage />
    case 'create':
      return <CreatePolicy />
  }
}

/* Which chrome, decided inside the provider because the role lives there.

   The two shells are not two skins over one navigation — they are different
   navigations, which is the thing worth showing. An admin gets a rail of
   fourteen destinations; a person gets a top bar with two. */
function Chrome() {
  const { role } = useBrand()
  /* Inside whichever shell, so the chrome stays put if a fallback ever does
     render — a navigation that blanks the frame reads as a page load rather
     than a tab change. In practice the prefetch means this is only reachable by
     clicking a nav item within the first second of the app being open. */
  const body = (
    <Suspense fallback={<div className="bpage" aria-busy="true" />}>
      <Screen />
    </Suspense>
  )
  return role === 'user' ? <UserShell>{body}</UserShell> : <Shell>{body}</Shell>
}

export function BrandApp() {
  usePrefetchScreens()

  return (
    <MotionConfig reducedMotion="user">
      <div className="brand-root">
        <BrandProvider>
          <Chrome />
        </BrandProvider>
      </div>
    </MotionConfig>
  )
}
