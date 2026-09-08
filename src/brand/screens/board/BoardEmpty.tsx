/* -----------------------------------------------------------------------------
   The empty policy — a screen, not a canvas.

   It was a panel inside `.bb__world`: the pan-and-zoom world the chain is drawn
   in. So the first thing anybody met on a new policy could be dragged off
   screen, zoomed to 50%, and wheel-scrolled by a handler that calls
   `preventDefault` unconditionally — and it needed a hand-placed 0.9 fit of its
   own to sit anywhere sensible, plus a second effect to re-fit the chain when
   it was answered. Two effects and a viewport, to ask a question with two
   answers.

   A canvas is the right surface for a chain of rules and the wrong one for a
   question. `BoardBuilder` renders this in `Board`'s place while the policy has
   no rules, so the canvas — with its dot grid, its zoom dock and its pan — comes
   into existence at the moment there is something on it to look at, and takes
   the whole region when it does.
   -------------------------------------------------------------------------- */

export function BoardEmpty({ onUseTemplate, onScratch }: { onUseTemplate?: () => void; onScratch: () => void }) {
  return (
    <div className="bb__empty">
      <div className="bb__empty__inner">
        <h2>How would you like to start?</h2>

        {/* Two ways in, side by side, sized the same.

            Neither is dressed as the primary. Which one is right depends
            entirely on whether anything in the catalogue fits what you are
            protecting, and that is not something the board knows — so the
            choice is made on the words and the pictures rather than on which
            button looks louder. Taking a template writes its rules into THIS
            policy, so it is an edit like any other and undo puts it back. */}
        <div className="bb__starts">
          {onUseTemplate && (
            <button type="button" className="bb__start2" onClick={onUseTemplate}>
              <TemplateArt />
              <strong>Use a template</strong>
              <span>Ready-made rules, yours to edit</span>
            </button>
          )}
          <button type="button" className="bb__start2" onClick={onScratch}>
            <ScratchArt />
            <strong>Start from scratch</strong>
            <span>Write the first rule yourself</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* --- The two illustrations ------------------------------------------------------

   Back to the reference, and back to simple.

   Five attempts went past it: a glyph in a circle, a deck of cards, a page with
   a cursor, a grid of pixels, and a sign-in falling down an evaluation line. The
   last of those was the most truthful and the least useful — a pulse dropping
   through three nodes while an outcome flashed is a diagram somebody has to
   stop and read, on the one screen where nobody should have to stop.

   So these are what the reference draws: two panels, the way a product shows
   you a screen it is about to give you. One is a stack with rules already in
   it; the other is a single empty panel with a place to put the first one. You
   know which is which before you read either heading, which is the entire job.

   Grey at rest, all of it. Hover brings exactly one colour — the brand, on the
   first rule of the stack and on the empty panel's slot — because that is the
   thing each card is offering. The motion is one lift and one small slide of
   the card behind: enough to answer the pointer, not enough to watch.
   -------------------------------------------------------------------------- */

/** The panel both cards draw: a rounded frame, a title bar, three dots. */
function ArtPanel({ x, y, plain }: { x: number; y: number; plain?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect className="bb__ill__panel" x="0.5" y="0.5" width="99" height="61" rx="6" />
      {!plain && (
        <>
          <path className="bb__ill__bar" d="M0.5 15.5 H99.5" />
          <circle className="bb__ill__dot" cx="9" cy="8" r="1.8" />
          <circle className="bb__ill__dot" cx="15" cy="8" r="1.8" />
          <circle className="bb__ill__dot" cx="21" cy="8" r="1.8" />
        </>
      )}
    </g>
  )
}

function TemplateArt() {
  return (
    <svg className="bb__start2__art" viewBox="0 0 150 100" role="img" aria-label="A ready-made policy, its rules already written">
      {/* The one behind. Outline only, so it reads as depth rather than as a
          second thing to choose — and it is the only part that moves. */}
      <g className="bb__ill__back">
        <ArtPanel x={16} y={12} plain />
      </g>

      <g className="bb__ill__front">
        <ArtPanel x={26} y={22} />
        {/* Its rules, and the panel they open into. */}
        <g transform="translate(26 22)">
          <rect className="bb__ill__line is-lead" x="12" y="26" width="46" height="5" rx="2.5" />
          <rect className="bb__ill__line" x="12" y="36" width="34" height="5" rx="2.5" />
          <rect className="bb__ill__line" x="12" y="46" width="40" height="5" rx="2.5" />
          <path className="bb__ill__split" d="M68 22 V54" />
          <rect className="bb__ill__line is-small" x="76" y="26" width="16" height="4" rx="2" />
          <rect className="bb__ill__line is-small" x="76" y="34" width="12" height="4" rx="2" />
          <rect className="bb__ill__line is-small" x="76" y="42" width="14" height="4" rx="2" />
        </g>
      </g>
    </svg>
  )
}

function ScratchArt() {
  return (
    <svg className="bb__start2__art" viewBox="0 0 150 100" role="img" aria-label="An empty policy, with a place for the first rule">
      <g className="bb__ill__front">
        <ArtPanel x={26} y={22} />
        {/* Where the first rule goes. Dashed, because it is a slot rather than
            a thing — and the one part of either picture that takes the brand on
            its own. */}
        <g transform="translate(26 22)">
          <rect className="bb__ill__slot" x="34" y="26" width="32" height="24" rx="5" />
          <path className="bb__ill__plus" d="M50 32 V44 M44 38 H56" />
        </g>
      </g>
    </svg>
  )
}
