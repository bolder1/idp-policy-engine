import { motion, useReducedMotion } from 'motion/react'

import { MARKER_EASE, barTravel, hopMs, type Stop } from './route-marker'
import './testing.css'

/* -----------------------------------------------------------------------------
   The route marker: where a sign-in is on its way through the tenant.

   Two shapes, one clock (route-marker.ts):

     dot  the board's chain. A 12 px dot in the blue of an active state, drawn
          INSIDE whichever stage it has reached and moved between stages by
          motion's shared layout, so the chain — not this component — decides
          where the stages are. A hollow ring where the route cannot go on:
          the facts given do not say which way.
     bar  Policy testing's route list. A 3 px bar down the list's left edge,
          sized to the stage it stands beside, travelling through the stops
          the list measured for it.

   Motion owns this element's position outright. Its class carries no
   transform and no transition in any state — a CSS transform on something
   motion animates is overwritten mid-flight and the marker jumps — and it is
   placed with `top`, `left` and margins only. The reduced-motion answer is
   the end state at once, which `MotionConfig reducedMotion="user"` already
   gives layout animations and which the bar's own transition says here.
   -------------------------------------------------------------------------- */

type DotProps = {
  variant: 'dot'
  /** The route stops here because it cannot be told which way it goes. */
  unknown?: boolean
  /** Shared by every stage the dot can be drawn in; one per chain. */
  layoutId?: string
  /** How long the move to this stage takes: `hopMs` while travelling, 0 for an update. */
  ms?: number
  /** Fade in where it lands, for an update that moved it without travel. */
  fadeIn?: boolean
  /* The stage it is drawn in, as its layout dependency: the dot measures its
     place only when it changes stage. A pan or a refit of the world, or a
     re-render for a hover, is not a move of the dot — without this each one
     was measured as a layout change and the dot slid after the chain. */
  stage?: number
}

type BarProps = {
  variant: 'bar'
  stops: readonly Stop[]
  /** The stop it stands beside. */
  at: number
  /** Where it travels from; `at` itself (the default) is a jump. */
  from?: number
  /** A new value starts a fresh run from `from`, even to where it already is — Replay. */
  run?: number
  unknown?: boolean
}

export function RouteMarker(props: DotProps | BarProps) {
  const reduced = useReducedMotion() === true
  if (props.variant === 'dot') {
    const seconds = reduced ? 0 : (props.ms ?? hopMs(1)) / 1000
    return (
      <motion.span
        aria-hidden
        className={`tmarker tmarker--dot${props.unknown ? ' is-unknown' : ''}`}
        layoutId={props.layoutId ?? 'route-marker'}
        layoutDependency={props.stage}
        initial={props.fadeIn && !reduced ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ layout: { type: 'tween', duration: seconds, ease: MARKER_EASE }, opacity: { duration: reduced ? 0 : 0.12 } }}
      />
    )
  }

  const travel = barTravel(props.stops, props.from ?? props.at, props.at)
  const duration = reduced ? 0 : travel.duration
  return (
    <motion.span
      key={props.run}
      aria-hidden
      className={`tmarker tmarker--bar${props.unknown ? ' is-unknown' : ''}`}
      initial={{ top: travel.top[0], height: travel.height[0] }}
      animate={{ top: travel.top, height: travel.height }}
      transition={{ duration, times: travel.times, ease: MARKER_EASE }}
    />
  )
}
