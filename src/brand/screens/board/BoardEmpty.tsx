import { useState } from 'react'
import { Building2, PenLine, Plus, Undo2 } from 'lucide-react'

import { Button } from '../../kit'
import { BrandMark } from '../../logos/BrandMark'
import { LOCAL_PILLS } from '../../template-phase'
import type { AccessDecision } from '../../data'
import { DECISION_NAME } from './model'
import { StartPicture } from './StartArt'

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

export function BoardEmpty({
  fresh = true,
  fallback,
  onEditDefault,
  onUndo,
  undoLabel = 'Undo',
  onUseTemplate,
  onDescribe,
  onCopyRules,
  onScratch,
}: {
  /** A new draft nobody has written in yet. Otherwise the policy lost its rules, or never had any while live. */
  fresh?: boolean
  /** What the policy's default decides. Every sign-in gets it while there are no rules. */
  fallback?: AccessDecision
  onEditDefault?: () => void
  /** Present when the last edit can be undone — deleting the last rule, say. */
  onUndo?: () => void
  undoLabel?: string
  onUseTemplate?: () => void
  /** Describe it: offered on a new draft only (describe spec, §2). The card renders only when passed. */
  onDescribe?: () => void
  /** Copy rules from another policy. The card renders only when passed: with no policy to copy from, it leads nowhere. */
  onCopyRules?: () => void
  onScratch: () => void
}) {
  const three = !!onUseTemplate && (!!onDescribe || !!onCopyRules)
  /* The card the pointer or the keyboard is on: its picture plays while it is. */
  const [hot, setHot] = useState<Start | null>(null)
  const point = (k: Start) => ({
    onPointerEnter: () => setHot(k),
    onPointerLeave: () => setHot((h) => (h === k ? null : h)),
    onFocus: () => setHot(k),
    onBlur: () => setHot((h) => (h === k ? null : h)),
  })
  return (
    <div className="bb__empty">
      <div className={`bb__empty__inner${three ? ' has-three' : ''}`}>
        {/* The screen every new policy opens on, so it says what a sign-in policy is for (owner, 2 Nov 2026: "more
            contextual … this is the screen the user will see every time he wants to create a policy"). Not the policy's
            name: a name can be anything, and the bar already shows it ("what is this … rethink"). A policy that has lost
            its rules keeps the plain "No rules". */}
        <h2>{fresh ? 'How should this policy start?' : 'No rules'}</h2>
        {fresh && (
          <p className="bb__empty__sub">Each rule lets people in, asks for a second factor, or blocks them.</p>
        )}

        {/* What the policy does right now. The default card and the undo
            control live on the canvas, which is not drawn without rules, so
            this line carries both. */}
        {fallback && (
          <div className="bb__empty__now">
            <p>Every sign-in gets the default: {DECISION_NAME[fallback]}.</p>
            {onEditDefault && (
              <Button variant="ghost" size="sm" onClick={onEditDefault}>
                Edit default
              </Button>
            )}
            {onUndo && (
              <Button variant="ghost" size="sm" icon={Undo2} onClick={onUndo}>
                {undoLabel}
              </Button>
            )}
          </div>
        )}

        {/* Three ways in on a new draft, side by side, sized the same — two
            once the policy has been live, where Describe it is not offered.

            None is dressed as the primary. Which one is right depends
            entirely on whether anything in the catalogue fits what you are
            protecting, and whether you would rather say it than build it, and
            the board knows neither — so the choice is made on the words and
            the pictures rather than on which button looks louder. Taking a
            template, or describing the policy, writes rules into THIS policy,
            so it is an edit like any other and undo puts it back. */}
        <div className={`bb__starts${three ? ' has-three' : ''}`} data-tour="empty-start">
          {onUseTemplate && (
            <button type="button" className="bb__start2 is-template" onClick={onUseTemplate} {...point('template')}>
              {/* Each card says where the rules come from on its pill, what happens in its heading and what you are left
                  with under it (owner, 2 Nov 2026: "very hard to understand what is going to happen … fix the content and
                  the heading"). Copy, not inherit: the rules are copied once and nothing links them back. */}
              {/* A gallery card (owner, same day: "something like this way", the artifact gallery): a tinted stage on top,
                  the picture rising from its bottom edge and the pill in its corner; below, the card's icon on a tile beside
                  its heading and line, left-aligned. On hover the stage washes deeper, slowly ("an animated colour
                  background … not the full card, the part where we add the SVG"). */}
              {/* Whose the rules are, as a tab cut out of the card's top-right corner, in the board's own ground and joined
                  to the card's edges by two inverted curves, so the card looks notched (owner, same day: "move the pills
                  here, at the top edge"; then "the same cut-out as the template card, remove the white part, make it feel
                  part of the canvas"). Its words take the card's colour on hover. Start from scratch has none: its rules
                  come from nowhere ("By you … can remove"). */}
              {LOCAL_PILLS && (
                <span className="bb__start2__tab">
                  <BrandMark brand="miniorange" size={12} />
                  By miniOrange
                </span>
              )}
              <span className="bb__start2__stage">
                <StartPicture kind="template" hot={hot === 'template'} />
              </span>
              <span className="bb__start2__foot">
                <span className="bb__start2__text">
                  <strong>Use a Xecurify template</strong>
                  <span>Ready-made rules for common setups</span>
                </span>
              </span>
            </button>
          )}
          {onDescribe && (
            <button type="button" className="bb__start2" onClick={onDescribe}>
              <span className="bb__start2__stage">
                <DescribeArt />
              </span>
              <span className="bb__start2__foot">
                <span className="bb__start2__icon" aria-hidden>
                  <PenLine size={17} strokeWidth={1.9} />
                </span>
                <span className="bb__start2__text">
                  <strong>Describe it</strong>
                  <span>Type it or answer questions</span>
                </span>
              </span>
            </button>
          )}
          {onCopyRules && (
            <button type="button" className="bb__start2 is-reuse" onClick={onCopyRules} {...point('reuse')}>
              {LOCAL_PILLS && (
                <span className="bb__start2__tab">
                  <Building2 size={12} strokeWidth={2} aria-hidden />
                  Your organization
                </span>
              )}
              <span className="bb__start2__stage">
                <StartPicture kind="reuse" hot={hot === 'reuse'} />
              </span>
              <span className="bb__start2__foot">
                <span className="bb__start2__text">
                  <strong>Inherit from an existing policy</strong>
                  <span>Take the rules of a policy you already run</span>
                </span>
              </span>
            </button>
          )}
          {/* A blank card, as a document app draws its blank document (owner, 3 Nov 2026: "just a blank button with a big icon
              that has a dotted outline, and a subheading; no illustration"): a plus in a dotted outline on a plain stage. */}
          <button type="button" className="bb__start2 is-scratch is-blank" onClick={onScratch} {...point('scratch')}>
            <span className="bb__start2__stage">
              <span className="bb__start2__plus" aria-hidden>
                <Plus size={36} strokeWidth={1.6} />
              </span>
            </span>
            <span className="bb__start2__foot">
              <span className="bb__start2__text">
                <strong>Start from scratch</strong>
                <span>Build your own rules, one by one</span>
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* --- The illustrations ----------------------------------------------------------

   One frame for all three (owner, 2 Nov 2026: "an invisible section, and in that section an SVG for three different
   things … add the animation for each of these and make them a little more beautiful"). The frame is the 264 by 176
   box every picture is drawn in, centred in its stage, so the three line up across the row whatever each one draws.

   On hover only colour changes, and reuse's rules fade in (owner, same day: "subtle and silent"):
   · Use a Xecurify template: a template, drawn as its icon draws one, on a second sheet; its header takes the colour.
   · Reuse an existing policy: the tenant's policy on the left, an arrow, the new one on the right; the rules slide
     into its empty places (owner: "the reuse one is perfect").
   · Start from scratch: an empty policy with a place for its first rule; the place fills and its plus turns solid.

   Motion fades reuse's rules, never a CSS transform; board.css paints them: white sheets over a shadow in the card's wash,
   grey words, and the card's colour on the parts each picture is about. With reduced motion nothing plays, and the
   colour still comes on hover. Describe it keeps the older two-panel drawing at the end of this file.
   -------------------------------------------------------------------------- */

type Start = 'template' | 'reuse' | 'scratch'


/* --- Describe it's drawing --------------------------------------------------------
   The older two-panel picture, kept for the Describe it card: grey at rest, one lift and one small slide of the panel
   behind on hover, and the brand on its caret. */

/** The panel Describe it draws: a rounded frame and a title bar. No window dots. */
function ArtPanel({ x, y, plain }: { x: number; y: number; plain?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect className="bb__ill__panel" x="0.5" y="0.5" width="99" height="61" rx="6" />
      {!plain && <path className="bb__ill__bar" d="M0.5 15.5 H99.5" />}
    </g>
  )
}

/* A sentence being typed, and the answers it fills in: one panel, the line of
   text with its caret, and two short answer rows with a value at their end.
   The caret takes the siblings' one hover colour (`is-lead`), so the three
   cards share it and no new colour arrives. */
function DescribeArt() {
  return (
    <svg className="bb__start2__art" viewBox="0 0 150 100" role="img" aria-label="A policy written from a sentence">
      <g className="bb__ill__front">
        <ArtPanel x={26} y={22} />
        <g transform="translate(26 22)">
          <rect className="bb__ill__line" x="12" y="24" width="58" height="5" rx="2.5" />
          <rect className="bb__ill__line is-lead" x="73" y="21.5" width="1.5" height="10" rx="0.75" />
          <rect className="bb__ill__line is-small" x="12" y="38" width="40" height="4" rx="2" />
          <rect className="bb__ill__line is-small" x="76" y="38" width="12" height="4" rx="2" />
          <rect className="bb__ill__line is-small" x="12" y="47" width="28" height="4" rx="2" />
          <rect className="bb__ill__line is-small" x="76" y="47" width="12" height="4" rx="2" />
        </g>
      </g>
    </svg>
  )
}
