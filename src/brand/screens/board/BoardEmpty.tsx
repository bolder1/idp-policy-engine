import type { CSSProperties } from 'react'

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

/* --- The two illustrations, and what they do when you point at them -----------

   Three goes at this, and the two that failed are why the third is shaped the
   way it is.

   A tinted circle with a lucide glyph in it came first, one per card. That is
   what an icon does in a MENU — tell two rows apart at a glance — and these are
   not rows: they are the only two things on an empty board, under the first
   question anybody is asked here.

   Then a pair of browser windows with title bars and coloured rule stacks. Too
   literal and far too loud: three feedback hues and a brand-filled `+` on a
   surface whose entire job is to stay quiet until there are rules to look at,
   and a window frame drawn on a screen that is already a window.

   What is left is the smallest true difference between the two answers. A
   template is a STACK — several rules that already exist, in an order somebody
   else decided. Scratch is a SHEET — ruled, empty, one line written. So: a fan
   of cards, and a blank page. Greys throughout, with a single cool accent on
   one line of each so the pair is not flat; no brand, because brand on this
   surface means "press this to publish" and neither of these does.

   Each plays its own sentence on hover, and each sentence is the literal
   consequence of pressing it: the deck fans open, and the page rules itself.
   All of it is CSS on `.bb__start2:hover` — the states are declared, so leaving
   reverses them for free, and one `prefers-reduced-motion` block turns the lot
   off.
   -------------------------------------------------------------------------- */

/* A card in the deck, and the page. One shape, so the two illustrations are
   plainly the same object in two situations. */
function ArtCard({ dashed }: { dashed?: boolean }) {
  return (
    <rect
      className={dashed ? 'bb__art__ants' : undefined}
      x="0.5" y="0.5" width="83" height="57" rx="6"
      fill="var(--surface-raised)"
      stroke={dashed ? 'var(--border-default)' : 'var(--border-subtle)'}
      strokeDasharray={dashed ? '5 4' : undefined}
    />
  )
}

/* A rule, as a line on a card.

   All grey at rest — the whole picture is, deliberately. `lead` marks the first
   line, which is the one that takes the brand when you point at the card: one
   colour, on hover, in the one place that says "this is the rule you get
   first". Set in CSS rather than here, because the rest state and the hover
   state are the same element and only the stylesheet can hold both. */
function ArtLine({ i, w, lead }: { i: number; w: number; lead?: boolean }) {
  return (
    <rect
      className={`bb__art__line ${lead ? 'is-lead' : ''}`}
      style={{ '--i': i } as CSSProperties}
      x="12" y={16 + i * 13} width={w} height="5" rx="2.5"
      fill="var(--border-strong)"
      opacity={lead ? 0.45 : 0.28}
    />
  )
}

function TemplateArt() {
  return (
    <svg className="bb__start2__art" viewBox="0 0 148 100" role="img" aria-label="A ready-made policy, its rules already written">
      {/* A visible staircase at rest, so it reads as a stack before anybody
          points at it, and a fan when they do.

          Positioned by an ATTRIBUTE transform on the outer group and animated
          by a CSS one on the inner. They cannot share an element: a CSS
          `transform` replaces the attribute rather than composing with it, so a
          single group would jump to the origin the moment hover applied. */}
      <g transform="translate(42 28)">
        <g className="bb__art__card" style={{ '--i': 2 } as CSSProperties}>
          <ArtCard />
        </g>
      </g>
      <g transform="translate(37 24)">
        <g className="bb__art__card" style={{ '--i': 1 } as CSSProperties}>
          <ArtCard />
        </g>
      </g>
      <g transform="translate(32 20)">
        <g className="bb__art__card" style={{ '--i': 0 } as CSSProperties}>
          <ArtCard />
          {/* Three rules, because three is what a template card's thumbnail
              caps at, and the widths differ because rule names do. */}
          <ArtLine i={0} w={48} lead />
          <ArtLine i={1} w={36} />
          <ArtLine i={2} w={42} />
        </g>
      </g>
    </svg>
  )
}

function ScratchArt() {
  return (
    <svg className="bb__start2__art" viewBox="0 0 148 100" role="img" aria-label="An empty policy, waiting for its first rule">
      <defs>
        {/* The canvas's own dot grid, at the size it would be inside a card
            this small. The page is blank, not featureless. */}
        <pattern id="bb-art-dots" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.9" fill="var(--border-strong)" opacity="0.28" />
        </pattern>
      </defs>
      <g transform="translate(32 20)">
        <g className="bb__art__page">
          <ArtCard dashed />
          <rect x="6" y="6" width="72" height="46" rx="3" fill="url(#bb-art-dots)" />
          {/* One line written, two still to come — they draw themselves in when
              you point at the card. */}
          <ArtLine i={0} w={48} lead />
          <g className="bb__art__todo">
            <ArtLine i={1} w={36} />
            <ArtLine i={2} w={42} />
          </g>
        </g>
      </g>
    </svg>
  )
}
