import { Fragment, Suspense, lazy, useEffect, type ComponentProps } from 'react'
import { MotionConfig } from 'motion/react'

import { ScreenErrorBoundary } from './error-boundary'
import { LeaveDialog } from './leave-guard'
import { Shell, Toast } from './Shell'
import { UserShell } from './UserShell'
import { Policies } from './screens/Policies'
import { UserApps } from './screens/UserApps'
import { BrandProvider, useBrand, type BrandScreen } from './store'
import './theme-mode'

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
const RiskSignals = lazy(() => import('./screens/RiskSignals').then((m) => ({ default: m.RiskSignals })))
const Hooks = lazy(() => import('./screens/Hooks').then((m) => ({ default: m.Hooks })))
const ZonesPage = lazy(() => import('./screens/ZonesPage').then((m) => ({ default: m.ZonesPage })))
const AuthMethodsPage = lazy(() => import('./screens/AuthMethodsPage').then((m) => ({ default: m.AuthMethodsPage })))
const DisplayTokensPage = lazy(() => import('./screens/DisplayTokensPage').then((m) => ({ default: m.DisplayTokensPage })))
const BuilderPage = lazy(() => import('./screens/BuilderPage').then((m) => ({ default: m.BuilderPage })))
const BoardPage = lazy(() => import('./screens/board/BoardPage').then((m) => ({ default: m.BoardPage })))
const PolicyDetails = lazy(() => import('./screens/PolicyDetails').then((m) => ({ default: m.PolicyDetails })))
const Applications = lazy(() => import('./screens/Applications').then((m) => ({ default: m.Applications })))

/* Same specifiers as the lazy() calls above — Vite dedupes them to one chunk
   each, so this warms exactly what navigation will ask for and nothing else.
   Every lazy() specifier has to be here; routes.test.ts checks. */
const warm = () => {
  void import('./screens/Library')
  void import('./screens/FingerprintPage')
  void import('./screens/RiskSignals')
  void import('./screens/Hooks')
  void import('./screens/ZonesPage')
  void import('./screens/AuthMethodsPage')
  void import('./screens/DisplayTokensPage')
  void import('./screens/BuilderPage')
  void import('./screens/board/BoardPage')
  void import('./screens/PolicyDetails')
  void import('./screens/Applications')
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
  const { visit } = useBrand()
  return (
    <Fragment key={visit}>
      <ScreenBody />
    </Fragment>
  )
}

function ScreenBody() {
  const { screen } = useBrand()
  switch (screen.name) {
    /* The admin catalogue and the end-user launcher, adjacent so the two
       names cannot be confused by anyone reading this switch. */
    case 'applications':
      return <Applications />
    case 'apps':
      return <UserApps />
    case 'policies':
      return <Policies />
    case 'builder':
      return <BuilderPage policyId={screen.policyId} open={screen.open} />
    case 'board':
      return <BoardPage policyId={screen.policyId} open={screen.open} />
    case 'policy-details':
      /* Cast to the screen's own prop type, so the route can offer a return
         target a moment before the screen handles it. */
      return <PolicyDetails policyId={screen.policyId} from={screen.from as ComponentProps<typeof PolicyDetails>['from']} />
    case 'templates':
      return <Templates />
    case 'zones':
      return <ZonesPage />
    case 'fingerprint':
      return <FingerprintPage />
    case 'risk-signals':
      return <RiskSignals />
    case 'hooks':
      return <Hooks />
    case 'methods':
      return <AuthMethodsPage />
    case 'display-tokens':
      return <DisplayTokensPage tab={screen.tab ?? 'assignments'} />
  }
}

/* What a screen's boundary resets on: which screen, which policy, which visit.
   Not `open`, so a builder opening its own sheet is not a navigation. */
const screenKey = (s: BrandScreen, visit: number) => `${s.name}|${'policyId' in s ? s.policyId : ''}|${visit}`

/* Which chrome, decided inside the provider because the role lives there.

   The two shells are not two skins over one navigation — they are different
   navigations, which is the thing worth showing. An admin gets a rail of
   fourteen destinations; a person gets a top bar with two. */
function Chrome() {
  const { role, screen, visit, go } = useBrand()
  /* Inside whichever shell, so the chrome stays put if a fallback ever does
     render — a navigation that blanks the frame reads as a page load rather
     than a tab change. In practice the prefetch means this is only reachable by
     clicking a nav item within the first second of the app being open. */
  const body = (
    <ScreenErrorBoundary
      resetKey={screenKey(screen, visit)}
      onHome={() => go(role === 'user' ? { name: 'apps' } : { name: 'policies' })}
      homeLabel={role === 'user' ? 'Back to dashboard' : 'Back to policies'}
    >
      <Suspense fallback={<div className="bpage" aria-busy="true" />}>
        <Screen />
      </Suspense>
    </ScreenErrorBoundary>
  )
  /* The toast and the leave dialog belong to both sides, so they sit beside
     the shell rather than inside one of them. The end-user side had neither,
     and every confirmation on Setup 2FA went nowhere. */
  return (
    <>
      {role === 'user' ? <UserShell>{body}</UserShell> : <Shell>{body}</Shell>}
      <Toast />
      <LeaveDialog />
    </>
  )
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
