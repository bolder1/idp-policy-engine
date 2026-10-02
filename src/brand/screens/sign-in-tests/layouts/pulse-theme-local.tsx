import { Moon, Sun } from 'lucide-react'

import { Tip } from '../../../kit'
import { useLocalTheme } from './pulse-theme-state'

/* Pulse's own stage button (pulse-theme.tsx), used while the shared
   stage-theme module is away. */

export function LocalToggle() {
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
