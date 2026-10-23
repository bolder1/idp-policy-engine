import { ListChecks, MessageSquareText } from 'lucide-react'

import { GUIDED_SETUP } from './describe-stage'

/* -----------------------------------------------------------------------------
   Describe it, always within reach (owner, 19 Oct 2026). The road here, the same
   day: "something any user can access from any time in any rule … in the canvas
   a permanent space"; then "when I select a card, that card is added as a context
   … so we don't have to add two buttons"; then "not a full-sized bar — that can
   be done later; the left-side panel works best, because we might not give text
   to do things, we only provide selection or form quick actions".

   So the door is a compact pill on the canvas, above the view dock. At rest it is
   plain; under the pointer, with focus, or while a card is selected it lights the
   edge the owner picked (a thin border running blue through the colours down its
   left side, fading out to the right, with a soft glow inside — board.css). With
   a card selected it names that card, the context it opens on. Pressing it opens
   Describe it in the left panel.
   -------------------------------------------------------------------------- */

export interface DescribeContext {
  /** The selected card: "Rule 1 · Corporate devices", "Nothing else matched". */
  label: string
}

/* Guided setup (GUIDED_SETUP, 19 Oct 2026): the same door, opening the panel on the selected card. Off, it is
   Describe it as before.

   "Guide me", not "Start guided setup" (owner, 22 Oct 2026: "rethink the Start guided setup button, change the
   name and the button style"). Three words of label on a pill that floats over the canvas is a sentence asking
   for attention; two is an offer. The verb is the user's, not the product's — they are asking to be guided.

   THE SELECTED-CARD CHIP IS GONE (same day: "I don't think the Claude-style selection inside the button — we can
   remove that completely from the product, no use as of now"). The button named the card it would open on, which
   made it grow and shrink as the selection changed and put a second, competing label inside one control. The
   CONTEXT itself is kept: `context` still arrives, the panel still opens on that card, and the accessible name
   still says which — only the chip is gone. */
export function DescribeDoor({ context, onOpen }: { context?: DescribeContext | null; onOpen: () => void }) {
  const Mark = GUIDED_SETUP ? ListChecks : MessageSquareText
  const word = GUIDED_SETUP ? 'Guide me' : 'Describe it'
  const named = context ? (GUIDED_SETUP ? `Guide me through ${context.label}` : `Describe a change to ${context.label}`) : word
  return (
    <button
      type="button"
      className={`bb__magic${context ? ' has-context' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onOpen}
      aria-label={named}
    >
      <Mark size={16} strokeWidth={2} className="bb__magic__mark" aria-hidden />
      <span className="bb__magic__word">{word}</span>
    </button>
  )
}
