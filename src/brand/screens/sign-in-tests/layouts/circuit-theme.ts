import { useCallback, useEffect, useState } from 'react'

/* -----------------------------------------------------------------------------
   The circuit's stage, light or dark — the cinematic layouts' one setting
   (`idp.check-stage`, default light), read and written the way the shared
   stage-theme module does, while that module is away. Kept in step with the
   other layouts by the storage event and the same-tab event they send.
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
