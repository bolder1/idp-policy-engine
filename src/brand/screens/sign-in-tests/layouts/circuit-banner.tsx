import { motion } from 'motion/react'
import { Moon, Repeat2, RotateCcw, Sun, Zap } from 'lucide-react'

import { Tip } from '../../../kit'
import { BANNER_H } from './circuit-geometry'
import type { Tone } from './circuit-model'
import type { StageTheme } from './circuit-theme'
import { STAGE_FROM_TOP } from '../canvas-shelf'

/* -----------------------------------------------------------------------------
   Over the board (CircuitLayout.tsx): once landed, the hint that a fact can
   be flipped; on a what-if, what was flipped, the route that run takes and
   its answer, what the sign-in itself gets, and the way back. And the dock's
   own controls: the stage, light or dark, and the current sent round the
   live path again.
   -------------------------------------------------------------------------- */

export function Banner({
  landed,
  whatIf,
  changes,
  answer,
  where,
  tone,
  base,
  same,
  hint,
  play,
  onBack,
}: {
  landed: boolean
  whatIf: boolean
  changes: string[]
  answer: string
  where: string
  tone: Tone
  base: string
  same: boolean
  hint: string
  play: boolean
  onBack: () => void
}) {
  if (!landed) return null
  if (!whatIf) {
    if (!hint) return null
    return (
      <motion.p className="rl-circuit__hint" style={{ height: BANNER_H - 12 }} initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: play ? 0.4 : 0, delay: play ? 0.9 : 0 }}>
        <Repeat2 size={13} strokeWidth={2} aria-hidden />
        {hint}
      </motion.p>
    )
  }
  return (
    <motion.div className="rl-circuit__banner" role="status" data-card initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: play ? 0.2 : 0 }}>
      <span className="rl-circuit__wtag">What if</span>
      <span className="rl-circuit__wfacts">{changes.join(', ') || 'the sign-in'}</span>
      <span className="rl-circuit__warrow" aria-hidden>
        →
      </span>
      {where && <span className="rl-circuit__wwhere">{where} →</span>}
      <strong className={`rl-circuit__wword is-${tone}`}>{answer}</strong>
      <span className="rl-circuit__wwas">{same ? 'Same as the sign-in' : `The sign-in gets ${base}`}</span>
      <button type="button" className="rl-circuit__back" onClick={onBack}>
        <RotateCcw size={13} strokeWidth={2.2} aria-hidden />
        Back to the sign-in
      </button>
    </motion.div>
  )
}

export function StageDock({ theme, onTheme, landed, onPulse }: { theme: StageTheme; onTheme: (t: StageTheme) => void; landed: boolean; onPulse: () => void }) {
  return (
    <>
      <StageThemeToggle theme={theme} onChange={onTheme} />
      <Tip text="Run the current again" placement="top">
        <button type="button" className="bb__act" aria-label="Run the current again" disabled={!landed} onClick={onPulse}>
          <Zap size={14} strokeWidth={2} aria-hidden />
        </button>
      </Tip>
    </>
  )
}

/** The dock's light / dark button: pressed while the stage is dark. */
function StageThemeToggle({ theme, onChange }: { theme: StageTheme; onChange: (t: StageTheme) => void }) {
  /* The stage is the Mode button's at the top (canvas-shelf.ts `STAGE_FROM_TOP`, 4 Oct 2026). */
  if (STAGE_FROM_TOP) return null
  const dark = theme === 'dark'
  return (
    <Tip text={dark ? 'Light stage' : 'Dark stage'} placement="top">
      <button type="button" className="bb__act" aria-label="Dark stage" aria-pressed={dark} onClick={() => onChange(dark ? 'light' : 'dark')}>
        {dark ? <Sun size={14} strokeWidth={2} aria-hidden /> : <Moon size={14} strokeWidth={2} aria-hidden />}
      </button>
    </Tip>
  )
}
