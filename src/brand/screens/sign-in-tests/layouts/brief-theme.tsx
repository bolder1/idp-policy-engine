import { Moon, Sun } from 'lucide-react'

import { Tip } from '../../../kit'
import type { StageTheme } from './brief-stage'
import { STAGE_FROM_TOP } from '../canvas-shelf'

/** The dock's light / dark button (row 2, right): the same button as Focus's (focus-theme.tsx), so the two docks match. */
export function BriefStageToggle({ theme, onChange }: { theme: StageTheme; onChange: (t: StageTheme) => void }) {
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
