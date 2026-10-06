import { motion } from 'motion/react'
import { memo, type MutableRefObject, type ReactNode } from 'react'

import type { EngineRun } from '../engine-run'
import { PoliciesMoment, SignInMoment } from './focus-cards'
import type { Moment, Tone } from './focus-model'
import { OutcomeGhost, OutcomeMoment, type OutcomeV2 } from './focus-outcome'
import { RuleMoment } from './focus-rule'
import { EASE_OUT } from './focus-shared'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   THE CARD AT THE CENTRE, AND THE FOCUS PULL THAT BRINGS IT THERE (Focus v2).

   Two things live here, and nothing else: the rack-focus wrapper, and the
   chooser that picks which card body a beat's card draws.

   THE PULL (owner, 4 Oct 2026, pointing at the Focus track: "add the blur
   effect that we have in the text version, and add it before revealing each
   card", then a minute later "give a more effect"). The text version does
   opacity 0 → 1 with blur 6px → 0 over about a third of a second, phrase by
   phrase, as the engine proves each part (brief-sentence.tsx, focus-
   subtitle.tsx). A card is a bigger thing than a phrase, so the same language
   is made bigger: the card arrives heavily out of focus — blur 18px, opacity
   0.35, scale 0.96 — holds that soft state for 220 ms so the eye sees a shape
   coming, and then racks to sharp over 680 ms. The outcome gets the top of
   the owner's range (20px over 750 ms): it is the payoff.

   WHICH ELEMENT THE FILTER GOES ON is the one thing in here that is easy to
   get wrong. A card's depth blur is already a CSS `filter` on the turn
   element, var-driven by its distance from the centre, and the turn is itself
   a motion element animating `rotateY`. Animating `filter` there as well
   would stamp Motion's value over that variable, and a receded card would
   lose the only cue that says how far away it is. So the pull sits on its own
   wrapper INSIDE the turn, around the card's face, where it composes with the
   depth blur instead of fighting it — and never on the motion slot, which
   carries x, y, scale and opacity for the whole card, and never on the track,
   which would blur every card at once for one card's sake.

   The wrapper also takes `scale`, which is why it is a motion element and not
   a styled div: a CSS transform on a motion element is overwritten (the
   standing ruling), so the scale has to be Motion's own.

   Under reduced motion there is no pull at all: the card is sharp and in
   place, and only the depth veil and blur remain, which are hierarchy rather
   than motion.
   -------------------------------------------------------------------------- */

/* The soft state the card arrives in, and the pull out of it.

   RETUNED (owner, 4 Oct 2026, on the first build: "all the cards transition is bad, the older one is better — try to
   give me something better and related"). The numbers below were the top of the blur spec's range — 18–20 px held for
   220 ms and then racked over 680–750 ms — which is nearly a second of softness laid ON TOP of the slot move the
   carousel was already making. v1's move is the one he likes: a card travels and the row turns, crisply. What v2 added
   was not a focus pull but a long dissolve over it, and with the two faces stacked the eye spent most of that second
   reading a blurred summary of the card it was waiting for.

   So the pull stays — he asked for the blur and it is the right idea — and becomes a CAMERA SNAP rather than a fade:
   about half the blur, a hold short enough to register as a beat rather than a wait, and a rack that is over inside
   the slot's own move so the two read as one gesture. The outcome still gets the stronger pull; it is the payoff.

   Related to v1, not a second language: 420 ms against the slot's own travel, on the same ease-out the stage uses
   everywhere. */
const SOFT_BLUR = 10
const SOFT_BLUR_STRONG = 13
const SOFT_OPACITY = 0.62
const SOFT_SCALE = 0.985
/** How long the shape is held soft before it racks, so the eye sees it coming — a beat, not a pause. */
const HOLD_MS = 90
const RACK_MS = 420
const RACK_MS_STRONG = 480

export interface Focus2RevealProps {
  /** The card is the one open now: it racks into focus. Receded, it is drawn where it stands. */
  open: boolean
  /** The payoff (the outcome): the strongest pull in the owner's range. */
  strong?: boolean
  /** Reduced motion, a Skip, or a press: sharp and in place, nothing held. */
  instant?: boolean
  /** The card read at a distance — kept under the full face, so no frame is ever without an opaque card. */
  far: ReactNode
  /** The card read whole. Only the open card has one. */
  full: ReactNode
}

/** The card's face, racked into focus as it takes the centre. */
export function Focus2Reveal({ open, strong = false, instant = false, far, full }: Focus2RevealProps) {
  const soft = open && !instant
  const blur = strong ? SOFT_BLUR_STRONG : SOFT_BLUR
  const rack = { delay: HOLD_MS / 1000, duration: (strong ? RACK_MS_STRONG : RACK_MS) / 1000, ease: EASE_OUT }
  /* The key is what makes the pull happen on every arrival at the centre rather than once when the card is first
     drawn: a card is put on the path at depth 1 beats before it opens, and the pull belongs to the opening. It also
     carries `instant`, so a Skip part-way through a pull lands sharp in the same frame instead of finishing it. */
  return (
    <motion.div
      key={open ? (instant ? 'sharp' : 'open') : 'far'}
      className={`rl-f2__reveal${open ? ' is-open' : ''}`}
      style={{ originX: 0.5, originY: 0.5 }}
      initial={soft ? { filter: `blur(${blur}px)`, scale: SOFT_SCALE } : false}
      animate={{ filter: 'blur(0px)', scale: 1 }}
      transition={soft ? rack : { duration: 0 }}
    >
      <div className="rl-f2__faces">
        {/* The blur and the scale are on the wrapper, over both faces; only the opacity is the full face's own. Were
            the whole card faded to 0.35 the stage would show through it, and a hand-over would have exactly the
            ghost frames this stacking exists to stop — so what the eye sees coming is the far face, blurred and
            opaque, with the card it is about to read sharpening over it. */}
        <div className="rl-f2__face is-far">{far}</div>
        {full !== null && (
          <motion.div className="rl-f2__face is-full" initial={soft ? { opacity: SOFT_OPACITY } : false} animate={{ opacity: 1 }} transition={soft ? rack : { duration: 0 }}>
            {full}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

// --- Which body a card draws ----------------------------------------------------------------

/** The presses the card at the centre makes, through a ref so a new callback never re-renders it. */
export interface Focus2Calls {
  /** Open a rule of the covering policy in the builder (absent: no policy decides). */
  openRule: ((ruleIndex: number) => void) | null
  /** Bring the rule that came closest to the centre. */
  closest: (ruleIndex: number) => void
}

export interface Focus2FullProps {
  m: Moment
  /** What makes this face look different at the presented step: it re-renders only when this changes. */
  stateKey: string
  /** The props the answer reads beside the decision, as one key: the presented props object itself changes every step. */
  extra: string
  /** The props as the view presents them: `s` is the presented step, not the engine's. */
  props: RunLayoutProps
  plan: EngineRun
  /** The presented step. */
  p: number
  /** The presented run has landed. */
  landed: boolean
  animate: boolean
  focused: boolean
  inert: boolean
  first: string
  tone: Tone
  /** The answer is the one wide card: its words stand beside What they see. */
  wide: boolean
  denyMessage: string
  /** The verdict is being reached from this rule: its Then row says so, once. */
  pulse: boolean
  /** The answer's own first moment: "Deciding" in the box the verdict is then built into. */
  deciding: boolean
  calls: MutableRefObject<Focus2Calls>
  /** What the landed answer adds in v2: the two questions, the group finding, the thumbnail. Stable between presses. */
  v2: OutcomeV2
}

/* Four bodies for six beats, all of them v1's: the sign-in with the Configure panel's own value marks, the policy
   list reading row by row to the one that covers, a rule read check by check, and the answer built in place. The two
   beats with no body of their own are the two that go deeper into a card already open (focus2-story.ts): the covering
   policy is this same list a beat later, and the Then is this same rule's Then row lighting. Both are drawn by the
   step they are handed, so neither needs a component. */
export const Focus2Full = memo(
  function Focus2Full({ m, props, plan, p, landed, animate, focused, inert, first, tone, wide, denyMessage, pulse, deciding, calls, v2 }: Focus2FullProps) {
    if (m.kind === 'sign') return <SignInMoment props={props} landed={landed} />
    if (m.kind === 'policies') return <PoliciesMoment plan={plan} s={p} first={first} landed={landed} animate={animate} focused={focused} />
    if (m.kind === 'rule') {
      const ri = m.rule ?? -1
      const r = plan.rules[ri]
      const open = calls.current.openRule
      return r ? <RuleMoment plan={plan} r={r} s={p} landed={landed} animate={animate} focused={focused} first={first} denyMessage={denyMessage} pulse={pulse} onOpen={open ? () => calls.current.openRule?.(ri) : undefined} /> : null
    }
    /* "Deciding" turns into the verdict in the same box: the ghost is the same card with the same frame, so the box
       the answer is built into is already standing when the build starts. The engine settles its outcome on one step,
       so the half-second of "Deciding" is the presentation's — `deciding`, from the layout's clock — and not a step
       of the run that could be read off the plan. */
    return landed && !deciding ? <OutcomeMoment props={props} tone={tone} animate={animate} inert={inert} onClosest={(i) => calls.current.closest(i)} v2={v2} /> : <OutcomeGhost deciding={deciding || plan.steps[p]?.kind === 'deciding'} wide={wide} />
  },
  (a, b) =>
    a.stateKey === b.stateKey &&
    a.extra === b.extra &&
    a.m === b.m &&
    a.plan === b.plan &&
    a.animate === b.animate &&
    a.focused === b.focused &&
    a.inert === b.inert &&
    a.first === b.first &&
    a.tone === b.tone &&
    a.wide === b.wide &&
    a.denyMessage === b.denyMessage &&
    a.pulse === b.pulse &&
    a.deciding === b.deciding &&
    a.v2 === b.v2,
)
