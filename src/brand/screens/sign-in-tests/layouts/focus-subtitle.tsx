import { motion } from 'motion/react'
import { Fragment, useState } from 'react'
import { Square } from 'lucide-react'

import { EASE_OUT } from './focus-shared'

/* The subtitle under the card in focus (FocusLayout.tsx): that moment's one
   line, in the card's own slot under it, so it travels with its card and
   never lands on it. While the run plays a new line, its words arrive out of
   focus and sharpen into place one after another (Brief's blur, loved); when
   browsing (← →, a press, a drag, Walk through) the whole line crossfades.
   While the voice says this very line, a small live waveform leads it and a
   Stop follows its last word, both inline on the text. */

function Words({ line, typing }: { line: string; typing: boolean }) {
  const words = line.split(/(\s+)/)
  let n = 0
  return (
    <>
      {words.map((w, i) => {
        if (w.trim() === '') return <Fragment key={i}>{w}</Fragment>
        const d = n++ * 0.045
        return typing ? (
          <motion.span key={i} className="rl-focus__subw" initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.36, delay: d, ease: EASE_OUT }}>
            {w}
          </motion.span>
        ) : (
          <Fragment key={i}>{w}</Fragment>
        )
      })}
    </>
  )
}

/* One line, as it first came: typed or crossfaded is settled when it mounts, never changed under it. */
function Line({ line, tone, speaking, typing, fade, onStop }: { line: string; tone: string; speaking: boolean; typing: boolean; fade: boolean; onStop: () => void }) {
  const [typed] = useState(typing)
  return (
    <motion.p className={`rl-focus__subline is-${tone}${speaking ? ' is-speaking' : ''}`} initial={!typed && fade ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.12, ease: EASE_OUT }}>
      {speaking && (
        <span className="rl-focus__wave" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      <Words line={line} typing={typed} />
      {speaking && (
        <button type="button" className="rl-focus__substop" aria-label="Stop the voice" title="Stop the voice" onClick={onStop}>
          <Square size={9} strokeWidth={2.4} fill="currentColor" aria-hidden />
        </button>
      )}
    </motion.p>
  )
}

export function Subtitle({ line, tone, speaking, typing, fade, onStop }: { line: string; tone: string; speaking: boolean; typing: boolean; fade: boolean; onStop: () => void }) {
  return (
    <div className="rl-focus__subtitle" role="status" aria-live="polite">
      {line && <Line key={line} line={line} tone={tone} speaking={speaking} typing={typing} fade={fade} onStop={onStop} />}
    </div>
  )
}
