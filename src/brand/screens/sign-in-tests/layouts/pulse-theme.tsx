import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { Moon, Sun } from 'lucide-react'

import { Tip } from '../../../kit'

/* -----------------------------------------------------------------------------
   Pulse's stage, light or dark: the cinematic layouts' ONE setting
   (`idp.check-stage`, default light). The shared module (stage-theme.tsx) is
   used whenever it is there; a glob import finds it without failing when it
   is not (it was away on 2 Oct), and then the same key is read and written
   here — the storage event and the same-tab event the other layouts send
   keep every layout on one stage.
   -------------------------------------------------------------------------- */

export type StageTheme = 'light' | 'dark'

interface SharedTheme {
  useStageTheme: () => [StageTheme, (next: StageTheme) => void]
  StageThemeToggle: ComponentType
}

const found = import.meta.glob('./stage-theme.tsx', { eager: true }) as Record<string, Partial<SharedTheme>>
const shared = Object.values(found).find((m) => typeof m.useStageTheme === 'function' && typeof m.StageThemeToggle === 'function') as SharedTheme | undefined

const KEY = 'idp.check-stage'
const EVENT = 'idp-check-stage'

function read(): StageTheme {
  try {
    return window.localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function useLocalTheme(): [StageTheme, (next: StageTheme) => void] {
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
  const set = useCallback((next: StageTheme) => {
    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      /* Storage refused: the stage holds for this visit. */
    }
    setTheme(next)
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [theme, set]
}

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

/** The stage, light or dark, shared by every cinematic layout. */
export const usePulseStage: () => [StageTheme, (next: StageTheme) => void] = shared?.useStageTheme ?? useLocalTheme

/** The dock's light / dark button. */
export const PulseStageToggle: ComponentType = shared?.StageThemeToggle ?? LocalToggle
