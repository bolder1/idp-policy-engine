import { useState } from 'react'
import { MotionConfig } from 'motion/react'

import { BrandApp } from './brand/BrandApp'
import { Shell } from './components/Shell'
import { Builder } from './screens/Builder'
import { Coverage } from './screens/Coverage'
import { NamedObjects } from './screens/NamedObjects'
import { Resolution } from './screens/Resolution'
import { Simulate } from './screens/Simulate'
import { StoreProvider, useStore } from './state/store'

/* -----------------------------------------------------------------------------
   Two versions live side by side.

     brand   — the brand and experience revamp. Same functions the console has
               today, rebuilt on the published design system. This is the
               default.
     concept — the earlier pass that reworked the engine model itself
               (coverage matrix, App x Group binding). Kept for comparison
               rather than deleted, because the question it answers is still
               open — it just isn't this pass's question.
   -------------------------------------------------------------------------- */

function ConceptRouter() {
  const { screen } = useStore()
  switch (screen.name) {
    case 'coverage':
      return <Coverage />
    case 'builder':
      return <Builder policyId={screen.policyId} />
    case 'simulate':
      return <Simulate policyId={screen.policyId} />
    case 'resolution':
      return <Resolution userId={screen.userId} appId={screen.appId} />
    case 'objects':
      return <NamedObjects />
  }
}

function ConceptApp({ onSwitchVersion }: { onSwitchVersion: () => void }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="concept-root">
        <StoreProvider>
          <Shell>
            <ConceptRouter />
          </Shell>
          <button type="button" className="version-flag" onClick={onSwitchVersion}>
            Viewing <strong>Model concept</strong> <span>back to brand revamp →</span>
          </button>
        </StoreProvider>
      </div>
    </MotionConfig>
  )
}

export default function App() {
  const [version, setVersion] = useState<'brand' | 'concept'>('brand')

  return version === 'brand' ? (
    <BrandApp onSwitchVersion={() => setVersion('concept')} />
  ) : (
    <ConceptApp onSwitchVersion={() => setVersion('brand')} />
  )
}
