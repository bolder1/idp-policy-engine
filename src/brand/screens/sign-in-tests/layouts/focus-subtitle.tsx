import { AnimatePresence, motion } from 'motion/react'
import { Fragment } from 'react'
import { Square } from 'lucide-react'

import { EASE_OUT } from './focus-shared'

/* The subtitle under the card in focus (FocusLayout.tsx): that moment's one
   line, the words arriving out of focus and sharpening into place, one
   after another (Brief's blur, loved). It is the caption whether the voice
   is on or not; while the voice says this very line, a small live waveform
   leads it and a Stop sits at its end. It sits in its own slot under the
   card — positioned by `left`/`top`, never by a transform. */

export function Subtitle({ line, tone, speaking, animate, left, top, width, onStop }: { line: string; tone: string; speaking: boolean; animate: boolean; left: number; top: number; width: number; onStop: () => void }) {
  const words = line.split(/(\s+)/)
  let n = 0
  return (
    <div className="rl-focus__subtitle" style={{ left, top, width }} role="status" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {line && (
          <motion.p
            key={line}
            className={`rl-focus__subline is-${tone}${speaking ? ' is-speaking' : ''}`}
            initial={animate ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={animate ? { opacity: 0, filter: 'blur(3px)', transition: { duration: 0.14 } } : undefined}
            transition={{ duration: 0.2 }}
          >
            {speaking && (
              <span className="rl-focus__wave" aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </span>
            )}
            <span className="rl-focus__subwords">
              {words.map((w, i) => {
                if (w.trim() === '') return <Fragment key={i}>{w}</Fragment>
                const d = n++ * 0.045
                return animate ? (
                  <motion.span key={i} className="rl-focus__subw" initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.36, delay: d, ease: EASE_OUT }}>
                    {w}
                  </motion.span>
                ) : (
                  <Fragment key={i}>{w}</Fragment>
                )
              })}
            </span>
            {speaking && (
              <button type="button" className="rl-focus__substop" aria-label="Stop the voice" title="Stop the voice" onClick={onStop}>
                <Square size={10} strokeWidth={2.4} fill="currentColor" aria-hidden />
              </button>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
