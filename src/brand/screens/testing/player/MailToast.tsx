import { motion } from 'motion/react'
import { Mail } from 'lucide-react'

import { EASE_OUT, PRESS, PRESS_T, isPressing, usePlay } from './play-state'
import type { Toast } from './script'

/* -----------------------------------------------------------------------------
   An email arriving, as the desktop says so: a slim notification dropping
   over the browser's own bar, so it never covers the page it is for — the
   code in it, or the link to press. Motion owns its slide; the stage places
   it.
   -------------------------------------------------------------------------- */

export function MailToast({ toast }: { toast: Toast }) {
  const p = usePlay()
  const pressing = isPressing(p, 'toast')
  return (
    <motion.div
      className="tpt"
      initial={p.reduced ? false : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={p.reduced ? { opacity: 1 } : { opacity: 0, y: -12 }}
      transition={{ duration: p.reduced ? 0 : 0.32, ease: EASE_OUT }}
    >
      <span className="tpt__icon" aria-hidden>
        <Mail size={13} strokeWidth={2.2} />
      </span>
      <span className="tpt__body">
        <span className="tpt__subject">{toast.subject}</span>
        <span className="tpt__text">
          {toast.code && <b className="tpt__code">{toast.code}</b>}
          {toast.code && toast.body && ' · '}
          {toast.body}
        </span>
      </span>
      {toast.action && (
        <motion.span
          key={pressing ? p.key : 'still'}
          className={`tpt__action${toast.pressed || pressing ? ' is-pressed' : ''}`}
          initial={false}
          animate={pressing && !p.reduced ? PRESS : { scale: 1 }}
          transition={PRESS_T}
        >
          {toast.action}
        </motion.span>
      )}
    </motion.div>
  )
}
