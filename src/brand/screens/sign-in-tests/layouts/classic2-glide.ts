import { createContext, useContext, useMemo } from 'react'
import type { Transition } from 'motion/react'

/* -----------------------------------------------------------------------------
   THE CHAIN'S GLIDE (owner, 5 Oct 2026, of Focus's two views: "on click the
   cards themselves should convert into vertical … just 4 simple cards will be
   enough. Give me a good transition experience"). The same start node and the
   same cards are the column and the row, so a switch between them is Motion's
   own layout animation on those very elements — each glides from its old box to
   its new one, never a fade, a swap or a remount.

     a box     the start node, a card: `layout`, its size and place moved
               together; all set off at once and land ~40 ms apart in the
               chain's order (the start node first) — a box held back to stagger
               would stand a beat in its old place with its words already laid
               out for the new one
     a piece   what is inside a box (a card's head, its body; the start node's
               words): `layout="position"`, so its words travel with the box and
               are never stretched by its size
     a link    the connector between two: it moves as a piece, but is hidden
               while the chain changes shape (the page fades it)

   Only when the page asks (`Glide`, through the context): Classic v2's own
   canvas never changes shape, and Focus's route draws the cards without it.
   They glide only when `key` changes — the chain's shape, or the room a
   headline over it takes — so nothing else on the page (a card arriving, a body
   opening, the stage's zoom) is ever turned into a move.

   THE STAGE'S ZOOM. RunStage zooms its world with CSS `zoom`; Motion works its
   move out in screen px (getBoundingClientRect, already zoomed) and writes a
   translate inside the zoomed world, which the zoom scales a second time. Its
   translate is divided back out here (`transformTemplate`, Motion's own hook on
   the transform it builds), so a card at zoom 0.88 starts exactly where it was.
   -------------------------------------------------------------------------- */

/** What a page hands the chain to make it glide. */
export interface Glide {
  /** Changes whenever the chain should glide to its new place: its shape, the room a headline over it takes. */
  key: string
  /** The stage's zoom now (RunStage's `zoom()`): read every frame of a move. */
  zoom: () => number
  /** The last box has landed (its order is `last`, which the chain fills in): the page draws the connectors again. */
  onLanded?: () => void
  last?: number
}

export const GlideCtx = createContext<Glide | null>(null)

/** One move: the stage's ease, under the half-second (spec: ~450–550 ms with the stagger). */
export const GLIDE_S = 0.42
/** Between one box's landing and the next's, in the chain's order. */
export const GLIDE_STAGGER_S = 0.04
const GLIDE_EASE = [0.2, 0, 0, 1] as const

/** The whole move, the last box's stagger included: when the links may come back. */
export const glideTotal = (boxes: number): number => GLIDE_S + Math.max(0, boxes - 1) * GLIDE_STAGGER_S

/* Motion's translate, taken back out of the stage's zoom. Its transform is `translate3d(x, y, z) …` while it projects
   a move and '' / 'none' at rest; only the first translate is its own, and only that is divided. */
const TRANSLATE = /^translate3d\((-?[\d.e+-]+)px, (-?[\d.e+-]+)px, (-?[\d.e+-]+)px\)/
export function unzoomed(zoom: () => number) {
  return (_: unknown, generated: string): string => {
    const z = zoom()
    if (!generated || z === 1 || !Number.isFinite(z) || z <= 0) return generated
    return generated.replace(TRANSLATE, (_m, x: string, y: string, d: string) => `translate3d(${Number(x) / z}px, ${Number(y) / z}px, ${d}px)`)
  }
}

interface GlideProps {
  layout?: true | 'position'
  layoutId?: string
  layoutDependency?: string
  transition?: Transition
  transformTemplate?: (values: unknown, generated: string) => string
  onLayoutAnimationComplete?: () => void
}

/** The Motion props for one box of the chain (and the pieces inside it), at its place in the order; none without a glide. */
export function useGlide(order: number, id?: string): { box: GlideProps; piece: GlideProps; on: boolean } {
  const g = useContext(GlideCtx)
  return useMemo(() => {
    if (!g) return { box: {}, piece: {}, on: false }
    const transition: Transition = { layout: { duration: GLIDE_S + order * GLIDE_STAGGER_S, ease: GLIDE_EASE } }
    const transformTemplate = unzoomed(g.zoom)
    const landed = g.onLanded && order === g.last ? { onLayoutAnimationComplete: g.onLanded } : null
    return {
      box: { layout: true, layoutId: id, layoutDependency: g.key, transition, transformTemplate, ...landed },
      piece: { layout: 'position', layoutDependency: g.key, transition, transformTemplate },
      on: true,
    }
  }, [g, order, id])
}
