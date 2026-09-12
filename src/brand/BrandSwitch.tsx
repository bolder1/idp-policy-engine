import { useState } from 'react'

import { applyBrand, readBrand, type BrandMode } from './brand-mode'
import { Tip } from './kit'

/* The rebrand preview switch.

   Prototype furniture, like the persona switch beside it: it changes how the
   console looks and never what it does. `main.tsx` applies the stored mode
   before the first paint, so the state read here and the attribute on <html>
   already agree when this mounts. */
export function BrandSwitch() {
  const [mode, setMode] = useState<BrandMode>(readBrand)
  const on = mode === 'rebrand'

  return (
    <Tip
      text={
        on
          ? 'Showing the rebrand. Switch off to return to the current look.'
          : 'Preview the rebrand: live-console colours, blue active states, fewer lines.'
      }
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`bshell__brand ${on ? 'is-on' : ''}`}
        onClick={() => {
          const next: BrandMode = on ? 'current' : 'rebrand'
          applyBrand(next)
          setMode(next)
        }}
      >
        <span className="bshell__brand-track" aria-hidden>
          <span className="bshell__brand-knob" />
        </span>
        Rebrand
      </button>
    </Tip>
  )
}
