import { useRef, useState } from 'react'
import { MIGRATION_FIRST } from './phase'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { PartyPopper } from 'lucide-react'

/* -----------------------------------------------------------------------------
   Open new builder, as an occasion (owner, 4 Nov 2026: "a good animated button with a
   different colour ... we want to celebrate that ... a transition, to showcase the new
   builder in a more curious way").

   The button has a colour of its own, not the page's orange: a bright blue,
   a shine that sweeps across it now and then, and a party popper (never sparkles: they read as AI). Pressing it opens the new
   builder through a door: a circle of the same colour grows out of the button until it
   fills the window, the words "The new policy builder" and the popper rise in it, and
   the builder is there when it clears. Reduced motion skips the door and goes straight in.
   -------------------------------------------------------------------------- */

const EASE = [0.22, 1, 0.36, 1] as const

export function NewBuilderButton({ onOpen, label, door: withDoor = !MIGRATION_FIRST }: { onOpen: () => void; /** The words; the banner's own by default. */ label?: string; /** False: no door, the press opens straight away. With migration first the banner opens the intro without one (owner, 6 Nov 2026). */ door?: boolean }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLButtonElement>(null)
  const [door, setDoor] = useState<{ x: number; y: number } | null>(null)

  const press = () => {
    if (reduce || !withDoor || !ref.current) return onOpen()
    const r = ref.current.getBoundingClientRect()
    setDoor({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    /* The door clears once what it opens is up: the intro opens over this same page (owner, 6 Nov 2026). */
    window.setTimeout(() => {
      onOpen()
      setDoor(null)
    }, 1150)
  }

  return (
    <>
      <button ref={ref} type="button" className="bnbb" onClick={press}>
        {!reduce && (
          <motion.span
            className="bnbb__shine"
            aria-hidden
            initial={false}
            animate={{ x: ['-120%', '220%'] }}
            transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
          />
        )}
        <motion.span
          className="bnbb__icon"
          aria-hidden
          initial={false}
          animate={reduce ? undefined : { rotate: [0, 14, -8, 0], scale: [1, 1.18, 1] }}
          transition={reduce ? undefined : { duration: 1.2, repeat: Infinity, repeatDelay: 2.4 }}
        >
          <PartyPopper size={15} strokeWidth={2.2} />
        </motion.span>
        {label ?? (MIGRATION_FIRST ? 'See what’s new' : 'Open new builder')}
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {door && (
              <motion.div
                className="bnbb__door"
                aria-hidden
                initial={{ clipPath: `circle(0px at ${door.x}px ${door.y}px)` }}
                animate={{ clipPath: `circle(150vmax at ${door.x}px ${door.y}px)` }}
                exit={{ opacity: 0, transition: { duration: 0.3 } }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                <motion.div
                  className="bnbb__welcome"
                  initial={{ opacity: 0, y: 18, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.35, duration: 0.45, ease: EASE }}
                >
                  <motion.span initial={{ rotate: -30, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 14 }}>
                    <PartyPopper size={44} strokeWidth={1.8} />
                  </motion.span>
                  <span className="bnbb__welcometitle">The new policy builder</span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
