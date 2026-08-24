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
import { BrandProvider, useBrand } from './store'

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
            <Screen />
          </Shell>
        </BrandProvider>
      </div>
    </MotionConfig>
  )
}
