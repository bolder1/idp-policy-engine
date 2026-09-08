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

/* A card in the deck, and the card being written. One shape, so the two
   illustrations are plainly the same object in two situations.

   It took a `dashed` variant, for a scratch card drawn as an unmade page with
   marching ants round it. That card is a REAL rule with a cursor in it now — it
   is the thing you are about to make, not a placeholder for it — so there is
   one card again. */
function ArtCard() {
  return (
    <rect
      x="0.5" y="0.5" width="83" height="57" rx="6"
      fill="var(--surface-raised)" stroke="var(--border-subtle)"
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
    <svg className="bb__start2__art" viewBox="0 0 148 100" role="img" aria-label="An empty rule, waiting to be written">
      <g transform="translate(32 20)">
        <g className="bb__art__page">
          <ArtCard />

          {/* A caret on an empty line, and that is the whole idea.

              This card was a dashed page with the canvas's dot grid printed
              inside it and one line already on it — near enough to the deck
              beside it that at 84x58 the pair read as two grey smudges, and it
              claimed a rule was already written, which is the one thing scratch
              means you do not have.

              A cursor says the opposite, and nothing else in the pair has one.
              At rest: an empty rule with the caret at its start. On hover the
              line writes itself out left to right, the caret rides along to the
              end of it, and a second line surfaces underneath — you are the one
              writing these. */}
          <g className="bb__art__ink">
            <rect
              className="bb__art__line is-lead"
              x="12" y="18" width="44" height="5" rx="2.5"
              fill="var(--border-strong)" opacity="0.45"
            />
          </g>
          <rect
            className="bb__art__caret"
            x="12" y="15" width="2" height="11" rx="1"
            fill="var(--border-strong)" opacity="0.55"
          />

          <g className="bb__art__todo">
            <rect
              className="bb__art__line"
              style={{ '--i': 1 } as CSSProperties}
              x="12" y="32" width="34" height="5" rx="2.5"
              fill="var(--border-strong)" opacity="0.28"
            />
          </g>
        </g>
      </g>
    </svg>
  )
}
