import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { SignInScreens } from '../../testing/screens-of'
import { WhatTheySee } from '../../testing/WhatTheySee'
import './focus2-see.css'

/* -----------------------------------------------------------------------------
   WHAT THEY SEE, AS A THUMBNAIL (Focus v2's outcome card; owner, 5 Oct 2026).

   The wide answer card used to carry the whole sign-in preview in a column of
   its own. It is a small picture now: the real content, scaled down, with its
   label. A press opens the full view in a popover that grows out of the
   thumbnail and closes on Esc (the view's own capture handler, so one Escape
   does one thing), on a press outside, or on its close button.

   The popover is portalled into the view's root: the cards stand inside a
   perspective and a filter, which would otherwise make `position: fixed`
   relative to a card rather than to the screen. The root carries the stage's
   colour variables, so the popover reads the same tokens as the cards.
   -------------------------------------------------------------------------- */

const POP_W = 520
const POP_H = 440
const EDGE = 16

interface Spot {
  left: number
  top: number
  width: number
  /** Where the thumbnail's centre is inside the popover's own box: what it grows from. */
  ox: number
  oy: number
}

export interface Focus2SeeProps {
  screens: readonly SignInScreens[]
  appId: string | null
  open: boolean
  reduced: boolean
  /** The view's root, which carries the stage's variables; the popover is drawn into it. Null until mounted (a static render draws none). */
  portal: HTMLElement | null
  onOpen: () => void
  onClose: () => void
  /** The card is receded and its buttons are out of the tab order. */
  inert?: boolean
}

export function Focus2See({ screens, appId, open, reduced, portal, onOpen, onClose, inert = false }: Focus2SeeProps) {
  const thumb = useRef<HTMLDivElement | null>(null)
  const [spot, setSpot] = useState<Spot | null>(null)
  useLayoutEffect(() => {
    if (!open) {
      setSpot(null)
      return
    }
    const el = thumb.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(POP_W, vw - 2 * EDGE)
    const left = Math.max(EDGE, Math.min(r.left, vw - width - EDGE))
    /* Over the thumbnail, as far up as it needs to stand whole: the picture grows from where it is. */
    const top = Math.max(EDGE, Math.min(r.bottom - POP_H, vh - POP_H - EDGE))
    setSpot({ left, top, width, ox: r.left + r.width / 2 - left, oy: r.top + r.height / 2 - top })
  }, [open])

  if (screens.length === 0 || !appId) return null
  const dur = reduced ? 0 : 0.22
  const pop = (
    <AnimatePresence>
      {open && spot && (
        <>
          <div key="scrim" className="rl-f2see__scrim" onPointerDown={onClose} aria-hidden />
          <motion.div
            key="pop"
            className="rl-f2see__pop"
            role="dialog"
            aria-label="What they see"
            style={{ left: spot.left, top: spot.top, width: spot.width, originX: `${spot.ox}px`, originY: `${spot.oy}px` }}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
            transition={{ duration: dur, ease: [0.2, 0, 0, 1] }}
          >
            <button type="button" className="rl-f2see__close" aria-label="Close" title="Close" onClick={onClose}>
              <X size={14} strokeWidth={2.2} aria-hidden />
            </button>
            <WhatTheySee screens={screens} appId={appId} compact collapsible={false} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
  return (
    <div className="rl-f2see">
      {/* The scaled page holds buttons of its own, so the press is a button laid over it, not the thumbnail itself. */}
      <div ref={thumb} className={`rl-f2see__thumb${open ? ' is-open' : ''}`}>
        <span className="rl-f2see__frame">
          {/* Real content, scaled down: not a picture of it. Inert and hidden from the tree. */}
          <span className="rl-f2see__scale" aria-hidden inert>
            <WhatTheySee screens={screens} appId={appId} compact collapsible={false} />
          </span>
        </span>
        <span className="rl-f2see__label">What they see</span>
        <button type="button" className="rl-f2see__hit" tabIndex={inert ? -1 : undefined} aria-haspopup="dialog" aria-expanded={open} aria-label="What they see: open the full view" onClick={onOpen} />
      </div>
      {portal && createPortal(pop, portal)}
    </div>
  )
}
