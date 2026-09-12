import { Play } from 'lucide-react'

import { DEMO_VIDEO } from './board-tour'

/* -----------------------------------------------------------------------------
   The way into the recording: a play mark, the word Demo, and a timestamp.

   It read "Watch the 2-minute demo", and every word of that was already carried
   by one of the two things beside it — the play mark means watch, the timestamp
   means how long. What is left is the shape every video thumbnail on the web
   already uses, which is also the shape nobody has to read.

   **In its own file, and that is a build constraint rather than tidiness.**
   `DemoPlayer` is lazy: it exists to fetch a two-minute video and has no
   business in the bundle of somebody who never presses play. But this button is
   on the board's top row on every single visit, so anything importing it
   statically — the bar, and the walkthrough card — would also be importing the
   player statically, and Rollup would fold the whole thing back into the main
   chunk. It said so out loud: INEFFECTIVE_DYNAMIC_IMPORT. Splitting the trigger
   from the thing it triggers is what makes the split real.

   It also must not suspend. A 28px control that flashes in after the bar has
   painted is worse than one that costs a kilobyte.
   -------------------------------------------------------------------------- */

export function DemoButton({ onClick }: { onClick: () => void }) {
  /* No recording, no offer. A button that opens an empty player is worse than
     an offer never made. */
  if (!DEMO_VIDEO.src) return null

  return (
    <button
      type="button"
      className="dpl__open"
      onClick={onClick}
      /* The sentence survives here, where it costs nothing and helps most:
         "Demo · 2:00" read aloud in a list of controls is a fragment. */
      aria-label={`Watch the product demo, ${DEMO_VIDEO.duration}`}
      title="Watch the product demo"
    >
      <Play size={13} strokeWidth={2.2} fill="currentColor" aria-hidden />
      Demo
      <span aria-hidden>·</span>
      {DEMO_VIDEO.duration}
    </button>
  )
}
