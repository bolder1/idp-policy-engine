import { useCallback, useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

import { Tip } from '../../../kit'

/* -----------------------------------------------------------------------------
   The stream's stage, light or dark — the cinematic layouts' one setting
   (`idp.check-stage`, default light), read and written as the shared
   stage-theme module does, while that module is missing from the folder.
   Kept in step with the other layouts by the storage event and the same-tab
   event they send. Swap the import back to './stage-theme' once it returns.
   -------------------------------------------------------------------------- */

export type StageTheme = 'light' | 'dark'
const KEY = 'idp.check-stage'
const EVENT = 'idp-check-stage'

function read(): StageTheme {
  try {
    return window.localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function useStageTheme(): [StageTheme, (t: StageTheme) => void] {
  const [theme, setTheme] = useState<StageTheme>(() => (typeof window === 'undefined' ? 'light' : read()))
  useEffect(() => {
    const on = () => setTheme(read())
    window.addEventListener('storage', on)
    window.addEventListener(EVENT, on)
    return () => {
      window.removeEventListener('storage', on)
      window.removeEventListener(EVENT, on)
    }
  }, [])
  const set = useCallback((t: StageTheme) => {
    try {
      window.localStorage.setItem(KEY, t)
    } catch {
      /* Storage refused: the stage holds for this visit. */
    }
    setTheme(t)
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [theme, set]
}

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
