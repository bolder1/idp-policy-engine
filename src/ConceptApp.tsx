import { MotionConfig } from 'motion/react'

import { Shell } from './components/Shell'
import { Builder } from './screens/Builder'
import { Coverage } from './screens/Coverage'
import { NamedObjects } from './screens/NamedObjects'
import { Resolution } from './screens/Resolution'
import { Simulate } from './screens/Simulate'
import { StoreProvider, useStore } from './state/store'

/* -----------------------------------------------------------------------------
   The model-concept version, in its own module so it travels in its own chunk.

   It used to be declared in App.tsx and imported statically, which meant a whole
   second application — five screens, its own store, its own engine, its own
   1,400 lines of CSS — shipped in the entry chunk of a prototype that opens on
   the brand revamp and stays there unless you click the switcher.

   Its stylesheets moved here from main.tsx for the same reason, and because
   keeping them next to the only component that renders them is what makes it
   obvious they are not the brand app's problem. Vite loads a lazy chunk's CSS
   before it executes the module, so switching versions still paints in one go.

   The two apps share nothing — no imports cross between src/brand and this
   subtree in either direction — which is what makes the split this clean.
   -------------------------------------------------------------------------- */

import './theme/concept-tokens.css'
import './components/ui.css'
import './components/Shell.css'
import './screens/Coverage.css'
import './screens/Builder.css'
import './screens/Simulate.css'
import './screens/Resolution.css'
import './screens/NamedObjects.css'
import './version-flag.css'

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

export default function ConceptApp({ onSwitchVersion }: { onSwitchVersion: () => void }) {
  return (
    <MotionConfig reducedMotion="user">
      {/* Every token this version reads is defined on .concept-root, so the
          class is not decoration — nothing below it renders correctly without
          it. */}
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
