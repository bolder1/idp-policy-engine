import { useState } from 'react'

import { useBrand } from '../../store'

import { PolicyBar } from '../policy-bar'
import { BoardBuilder } from './BoardBuilder'

/* -----------------------------------------------------------------------------
   Builder v2 — the board.

   The same thin split as BuilderPage — the policy's standing facts above, the
   work below — except that here the bar FLOATS over the work rather than taking
   a band out of it. The bar is shared with the trail on purpose: whichever
   builder you are in, the policy is described the same way, in the same place.

   Why the board differs. The trail is a scrolling column, so a bar above it
   costs one band of a page that scrolls anyway. The board is a canvas, and a
   canvas has no natural height — every pixel the chrome takes is a rule you
   cannot see without panning. Floating it gives the canvas the whole region and
   costs the top strip only while the bar is on screen; focus mode takes even
   that back.

   Every canvas tool this was checked against converges on the same shape:
   Runway, Plain, Langdock, Framer and Magnific all keep one thin strip at the
   top and float everything else over the work, and none of them lets the
   chrome eat a band of the canvas.
   -------------------------------------------------------------------------- */

export function BoardPage({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const policy = store.policyById(policyId)
  /* Focus lives here rather than in `BoardBuilder`, because it governs both
     halves: the bar has to go away and the canvas has to stop leaving room for
     it. The toggle is drawn by the builder's own toolbar — that is where every
     other view control on this screen already is — so the state is passed down
     and the handler comes back up. Not stored: it is about this visit. */
  const [focus, setFocus] = useState(false)

  return (
    <>
      {policy && <PolicyBar policy={policy} floating away={focus} />}
      {/* `gauntlet` is the route's word and `check` is the sheet's. Translated
          here rather than renaming either: the route matches the trail's
          spelling so one caller can hand off to whichever builder is primary
          without knowing which it got, and the sheet keeps the name its own
          tab strip prints. */}
      <BoardBuilder
        policyId={policyId}
        openSheet={open === 'gauntlet' ? 'check' : open}
        focus={focus}
        onToggleFocus={() => setFocus((v) => !v)}
      />
    </>
  )
}
