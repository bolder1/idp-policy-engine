import { Suspense, lazy, useState } from 'react'

import { BrandApp } from './brand/BrandApp'

/* -----------------------------------------------------------------------------
   Two versions live side by side.

     brand   — the brand and experience revamp. Same functions the console has
               today, rebuilt on the published design system. This is the
               default.
     concept — the earlier pass that reworked the engine model itself
               (coverage matrix, App x Group binding). Kept for comparison
               rather than deleted, because the question it answers is still
               open — it just isn't this pass's question.

   Only the brand app ships with the entry. The concept is a whole second
   application behind a button almost nobody presses, so it loads when pressed
   — see ConceptApp.tsx, which carries its own stylesheets for the same reason.
   -------------------------------------------------------------------------- */

const ConceptApp = lazy(() => import('./ConceptApp'))

export default function App() {
  const [version, setVersion] = useState<'brand' | 'concept'>('brand')

  return version === 'brand' ? (
    <BrandApp onSwitchVersion={() => setVersion('concept')} />
  ) : (
    /* Styled inline rather than through a class: this renders in the gap
       before the concept's stylesheets have loaded, so any class it named
       would be unstyled at exactly the moment it is on screen. */
    <Suspense
      fallback={
        <p style={{ padding: '48px', font: '14px system-ui, sans-serif', color: '#7a818b' }}>
          Loading the model concept…
        </p>
      }
    >
      <ConceptApp onSwitchVersion={() => setVersion('brand')} />
    </Suspense>
  )
}
