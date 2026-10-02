import { Moon, Sun } from 'lucide-react'

import { Tip } from '../../../kit'
import { shared, useLocalTheme } from './focus-stage'

/* Focus's light / dark button for the dock (the stage itself: focus-stage.ts). */

function LocalToggle() {
  const [theme, set] = useLocalTheme()
  const dark = theme === 'dark'
  return (
    <Tip text={dark ? 'Light stage' : 'Dark stage'} placement="top">
      <button type="button" className="bb__act" aria-label="Dark stage" aria-pressed={dark} onClick={() => set(dark ? 'light' : 'dark')}>
        {dark ? <Sun size={14} strokeWidth={2} aria-hidden /> : <Moon size={14} strokeWidth={2} aria-hidden />}
      </button>
    </Tip>
  )
}

/** The dock's light / dark button. */
export function FocusStageToggle() {
  const Shared = shared?.StageThemeToggle
  return Shared ? <Shared /> : <LocalToggle />
}
