import { MotionConfig } from 'motion/react'

import { Shell } from './Shell'
import { Templates } from './screens/Library'
import { FingerprintPage } from './screens/FingerprintPage'
import { Hooks } from './screens/Hooks'
import { ZonesPage } from './screens/ZonesPage'
import { AuthMethodsPage } from './screens/AuthMethodsPage'
import { CreatePolicy } from './create/CreatePolicy'
import { Policies } from './screens/Policies'
import { BuilderPage } from './screens/BuilderPage'
import { PersonaStrip } from './PersonaBar'
import { BrandProvider, useBrand } from './store'

function Router() {
  const { screen } = useBrand()
  /* The strip goes here rather than into six screens.

     Three of them use PageHead and three carry their own header, so adding it
     per screen would mean six edits and six chances for one tab to end up
     without it — which is the tab somebody screenshots. The builder is
     deliberately excluded: it is a full-screen editing surface with its own
     chrome, and a tenant-identity strip above it would be furniture on top of
     furniture. */
  return (
    <>
      {screen.name !== 'builder' && <PersonaStrip />}
      <Screen />
    </>
  )
}

function Screen() {
  const { screen } = useBrand()
  switch (screen.name) {
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

export function BrandApp({ onSwitchVersion }: { onSwitchVersion: () => void }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="brand-root">
        <BrandProvider>
          <Shell onSwitchVersion={onSwitchVersion}>
            <Router />
          </Shell>
        </BrandProvider>
      </div>
    </MotionConfig>
  )
}
