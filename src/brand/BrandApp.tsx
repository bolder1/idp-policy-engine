import { MotionConfig } from 'motion/react'

import { Shell } from './Shell'
import {DevicePosturePage, Templates} from './screens/Library'
import { ZonesPage } from './screens/ZonesPage'
import { AuthMethodsPage } from './screens/AuthMethodsPage'
import { CreatePolicy } from './create/CreatePolicy'
import { Policies } from './screens/Policies'
import { BuilderPage } from './screens/BuilderPage'
import { BrandProvider, useBrand } from './store'

function Router() {
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
    case 'posture':
      return <DevicePosturePage />
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
