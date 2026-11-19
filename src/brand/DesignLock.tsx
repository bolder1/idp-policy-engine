import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react'

import { Button } from './kit'
import { DESIGN_LOCK_SET, logAttempt, passphraseMatches } from './lines'
import type { Line } from './lines'
import './design-lock.css'

/* -----------------------------------------------------------------------------
   The Design lock (owner, 19 Nov 2026: "whenever the user wants to switch as a designer, they have to pass that
   security ... give me a good transition").

   One field, one orange button. Every try is logged (lines.ts), so the owner can read who tried from Design.
     wrong     the card shakes, a red scan runs down it, the shackle rattles shut
     right     the shackle lifts, then a ring opens out from the lock and covers the screen before the reload
   Reduced motion: no shake, no scan, a plain fade.
   -------------------------------------------------------------------------- */

type Phase = 'idle' | 'checking' | 'denied' | 'granted'

export function DesignLock({
  email,
  from,
  onClose,
  onUnlocked,
}: {
  email: string
  from: Line | 'sign-in'
  onClose: () => void
  onUnlocked: () => void
}) {
  const reduce = useReducedMotion() === true
  const [phrase, setPhrase] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [tries, setTries] = useState(0)
  const card = useAnimationControls()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'granted') onClose()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose, phase])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!phrase || phase === 'checking' || phase === 'granted') return
    setPhase('checking')
    const passed = await passphraseMatches(phrase)
    logAttempt({ email, from, passed })
    if (passed) {
      setPhase('granted')
      /* The ring takes the screen, then the line changes. */
      window.setTimeout(onUnlocked, reduce ? 250 : 1400)
      return
    }
    setTries((n) => n + 1)
    setPhase('denied')
    setPhrase('')
    if (!reduce) await card.start({ x: [0, -14, 12, -9, 7, -4, 0], transition: { duration: 0.5 } })
    input.current?.focus()
  }

  const denied = phase === 'denied'
  const granted = phase === 'granted'

  return (
    <div className="bdl" role="presentation">
      <motion.div
        className="bdl__scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={() => !granted && onClose()}
      />

      <motion.div
        className={`bdl__card ${denied ? 'is-denied' : ''} ${granted ? 'is-granted' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bdl-title"
        initial={false}
        animate={card}
      >
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22 }}
        >
          <LockMark open={granted} denied={denied} reduce={reduce} tries={tries} />

          <h2 id="bdl-title" className="bdl__title">
            {granted ? 'Design unlocked' : 'Unlock Design'}
          </h2>
          <p className="bdl__sub">{email}</p>

          {!DESIGN_LOCK_SET ? (
            <p className="bdl__msg" role="alert">
              No passphrase is set for this build.
            </p>
          ) : (
            <form className="bdl__form" onSubmit={submit}>
              <label className="bdl__label" htmlFor="bdl-phrase">
                Passphrase
              </label>
              <input
                ref={input}
                id="bdl-phrase"
                className="bdl__input"
                type="password"
                autoComplete="off"
                value={phrase}
                disabled={granted}
                aria-invalid={denied}
                aria-describedby={denied ? 'bdl-msg' : undefined}
                onChange={(e) => {
                  setPhrase(e.target.value)
                  if (denied) setPhase('idle')
                }}
              />
              <AnimatePresence>
                {denied && (
                  <motion.p
                    id="bdl-msg"
                    className="bdl__msg"
                    role="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    Passphrase not recognised. This try is logged.
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="bdl__actions">
                <Button variant="ghost" onClick={onClose} disabled={granted}>
                  Cancel
                </Button>
                <Button variant="brand" type="submit" busy={phase === 'checking'} disabled={!phrase || granted}>
                  Unlock
                </Button>
              </div>
            </form>
          )}
        </motion.div>

        {/* The red scan on a wrong try: one sweep down the card, keyed so each try runs it again. */}
        {denied && !reduce && (
          <motion.span
            key={tries}
            className="bdl__scan"
            aria-hidden
            initial={{ top: '-20%', opacity: 0.9 }}
            animate={{ top: '110%', opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeIn' }}
          />
        )}
      </motion.div>

      {/* The way in: a ring opens from the lock and takes the whole screen. */}
      <AnimatePresence>
        {granted && (
          <motion.div
            className="bdl__reveal"
            aria-hidden
            initial={reduce ? { opacity: 0 } : { clipPath: 'circle(0% at 50% 38%)' }}
            animate={reduce ? { opacity: 1 } : { clipPath: 'circle(150% at 50% 38%)' }}
            transition={{ duration: reduce ? 0.2 : 0.9, delay: reduce ? 0 : 0.45, ease: [0.7, 0, 0.2, 1] }}
          >
            <motion.span
              className="bdl__revealword"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.95, duration: 0.3 }}
            >
              Design
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* The padlock, drawn so the shackle can move on its own: it lifts on the way in and rattles on a wrong try. */
function LockMark({ open, denied, reduce, tries }: { open: boolean; denied: boolean; reduce: boolean; tries: number }) {
  return (
    <div className={`bdl__lock ${denied ? 'is-denied' : ''} ${open ? 'is-open' : ''}`} aria-hidden>
      <svg viewBox="0 0 48 48" width="48" height="48">
        <motion.path
          key={denied ? `d${tries}` : 'shackle'}
          d="M15 22v-6a9 9 0 0 1 18 0v6"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          initial={false}
          animate={
            reduce
              ? {}
              : open
                ? { y: -7, rotate: -18, transition: { duration: 0.35, ease: 'backOut' } }
                : denied
                  ? { y: [0, -3, 0, -2, 0], transition: { duration: 0.4 } }
                  : { y: 0, rotate: 0 }
          }
          style={{ transformOrigin: '33px 22px' }}
        />
        <rect x="10" y="22" width="28" height="20" rx="5" fill="currentColor" />
        <circle cx="24" cy="31" r="2.6" className="bdl__keyhole" />
        <rect x="23" y="32" width="2" height="5" rx="1" className="bdl__keyhole" />
      </svg>
    </div>
  )
}
