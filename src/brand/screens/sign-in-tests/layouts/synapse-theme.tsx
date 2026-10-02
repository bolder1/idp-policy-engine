import { Moon, Sun } from 'lucide-react'

import { Tip } from '../../../kit'
import { useStageTheme } from './synapse-theme-state'

/* Synapse's stage button; the stage itself, light or dark, is
   synapse-theme-state.ts. */

/** The dock's light / dark button: pressed while the stage is dark. */
export function StageThemeToggle() {
  const [theme, set] = useStageTheme()
  const dark = theme === 'dark'
  return (
    <Tip text={dark ? 'Light stage' : 'Dark stage'} placement="top">
      <button type="button" className="bb__act" aria-label="Dark stage" aria-pressed={dark} onClick={() => set(dark ? 'light' : 'dark')}>
        {dark ? <Sun size={14} strokeWidth={2} aria-hidden /> : <Moon size={14} strokeWidth={2} aria-hidden />}
      </button>
    </Tip>
  )
}
