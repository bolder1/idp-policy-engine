import { Route } from 'lucide-react'

import { Tip } from '../../kit'
import './canvas-bar.css'

/* The guided tour, to come (owner, 2 Oct 2026: "tour will be a guided tour —
   as of now just add a button with coming soon; we will add a guided tour
   after we select the final view"). A button that says so and does nothing
   else yet; its tip says "Guided tour. Coming soon.", the console's way of
   naming what is not built (kit.tsx `Tip`, ProfileMenu's NOT_BUILT). */
export function GuidedTourSoon() {
  return (
    <Tip text="Guided tour. Coming soon." placement="bottom">
      <button type="button" className="sit-soon" aria-disabled="true" onClick={(e) => e.preventDefault()}>
        <Route size={13} strokeWidth={2} aria-hidden />
        Guided tour
        <span className="sit-soon__tag">Soon</span>
      </button>
    </Tip>
  )
}
