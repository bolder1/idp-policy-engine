import { Moon, Sun } from 'lucide-react'

import { Tip } from '../../../kit'
import type { StageTheme } from './brief-stage'

/** The dock's light / dark button: pressed while the stage is dark. */
export function BriefStageToggle({ theme, onChange }: { theme: StageTheme; onChange: (t: StageTheme) => void }) {
  const dark = theme === 'dark'
  return (
    <Tip text={dark ? 'Light stage' : 'Dark stage'} placement="top">
      <button type="button" className="bb__act" aria-label="Dark stage" aria-pressed={dark} onClick={() => onChange(dark ? 'light' : 'dark')}>
        {dark ? <Sun size={14} strokeWidth={2} aria-hidden /> : <Moon size={14} strokeWidth={2} aria-hidden />}
      </button>
    </Tip>
  )
}
