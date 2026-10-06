import { useCallback, useEffect, useState } from 'react'

/* -----------------------------------------------------------------------------
   Jarvis's stage, light or dark (owner, 3 Oct 2026: "add the light mode in
   Jarvis as well, based on our brand"): the cinematic layouts' ONE setting,
   `idp.check-stage` (default light), read and written here the same way
   Focus does (focus-stage.ts) — the storage event and the same-tab event keep
   every layout, the page's chrome (canvas-shelf.ts `useCheckStage`) and the
   entrance on one stage.
   -------------------------------------------------------------------------- */

export type JarvisStage = 'light' | 'dark'

const KEY = 'idp.check-stage'
const EVENT = 'idp-check-stage'

function read(): JarvisStage {
  try {
    return window.localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** The stage, and a way to change it for every cinematic layout. */
export function useJarvisStage(): [JarvisStage, (next: JarvisStage) => void] {
  const [stage, setStage] = useState<JarvisStage>(read)
  useEffect(() => {
    const on = () => setStage(read())
    window.addEventListener('storage', on)
    window.addEventListener(EVENT, on)
    return () => {
      window.removeEventListener('storage', on)
      window.removeEventListener(EVENT, on)
    }
  }, [])
  const set = useCallback((next: JarvisStage) => {
    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      /* Storage refused: the stage holds for this visit. */
    }
    setStage(next)
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [stage, set]
}
