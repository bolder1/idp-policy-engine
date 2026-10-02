import { useCallback, useEffect, useState } from 'react'

/* -----------------------------------------------------------------------------
   The brief's stage, light or dark — the cinematic layouts' one setting
   (`idp.check-stage`, default light), read and written here the same way the
   shared stage-theme module does, so the brief keeps working while that
   module is away. Read on mount and on every change from any layout (the
   storage event, and a same-tab event the toggle sends).
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

export function useBriefStage(): [StageTheme, (t: StageTheme) => void] {
  const [theme, setTheme] = useState<StageTheme>(read)
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

