import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_FAVOURITES, RUN_LAYOUTS, type RunLayoutId } from './run-layout'

/* -----------------------------------------------------------------------------
   What the page keeps about the run's layouts while they are compared, each
   remembered in this browser and read through try/catch:

     favourites   the owner's shelf (`idp.check-canvas.favourites`), his seven
                  by default; a star in the Reasoning panel moves a layout
                  between Favourites and Archive
     notes        his own thoughts on each layout (`idp.check-canvas.notes`),
                  typed in the Reasoning panel, copied out to share
     stage        the cinematic layouts' light or dark stage — read here, so
                  the Configure panel can follow it (`idp.check-stage`, written
                  by each layout's own theme file, which also sends the
                  same-tab `idp-check-stage` event)

   One same-tab event per key keeps every reader in step without a provider.
   -------------------------------------------------------------------------- */

const FAV_KEY = 'idp.check-canvas.favourites'
const NOTES_KEY = 'idp.check-canvas.notes'
const STAGE_KEY = 'idp.check-stage'
const STAGE_EVENT = 'idp-check-stage'
const FAV_EVENT = 'idp-check-canvas-favourites'
const NOTES_EVENT = 'idp-check-canvas-notes'

const known = new Set<string>(RUN_LAYOUTS.map((l) => l.value))

function readJson<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    const v: unknown = JSON.parse(raw)
    return valid(v) ? v : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown, event: string) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* Storage refused: the choice holds for this visit. */
  }
  window.dispatchEvent(new Event(event))
}

/* A value read from storage and kept in step with every other reader of it. */
function useStored<T>(read: () => T, event: string): [T, (next: T) => void, (next: T) => void] {
  const [value, setValue] = useState<T>(() => (typeof window === 'undefined' ? read() : read()))
  useEffect(() => {
    const on = () => setValue(read())
    window.addEventListener(event, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(event, on)
      window.removeEventListener('storage', on)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `read` is a module function per hook below
  }, [event])
  return [value, setValue, setValue]
}

const isIds = (v: unknown): v is RunLayoutId[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && known.has(x))
const readFavourites = () => readJson<RunLayoutId[]>(FAV_KEY, [...DEFAULT_FAVOURITES], isIds)

/** The Favourites shelf, and a way to star or unstar a layout. */
export function useFavourites(): [readonly RunLayoutId[], (id: RunLayoutId) => void] {
  const [favourites, setFavourites] = useStored(readFavourites, FAV_EVENT)
  const toggle = useCallback(
    (id: RunLayoutId) => {
      const now = readFavourites()
      const next = now.includes(id) ? now.filter((x) => x !== id) : RUN_LAYOUTS.map((l) => l.value).filter((x) => x === id || now.includes(x))
      setFavourites(next)
      writeJson(FAV_KEY, next, FAV_EVENT)
    },
    [setFavourites],
  )
  return [favourites, toggle]
}

const isNotes = (v: unknown): v is Partial<Record<RunLayoutId, string>> => !!v && typeof v === 'object' && !Array.isArray(v)
const readNotes = () => readJson<Partial<Record<RunLayoutId, string>>>(NOTES_KEY, {}, isNotes)

/** The owner's notes on each layout, and a way to write one. */
export function useLayoutNotes(): [Partial<Record<RunLayoutId, string>>, (id: RunLayoutId, text: string) => void] {
  const [notes, setNotes] = useStored(readNotes, NOTES_EVENT)
  const write = useCallback(
    (id: RunLayoutId, text: string) => {
      const next = { ...readNotes(), [id]: text }
      if (!text.trim()) delete next[id]
      setNotes(next)
      writeJson(NOTES_KEY, next, NOTES_EVENT)
    },
    [setNotes],
  )
  return [notes, write]
}

const readStage = (): 'light' | 'dark' => {
  try {
    return window.localStorage.getItem(STAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** The cinematic layouts' stage, as their theme files leave it. Read only. */
export function useCheckStage(): 'light' | 'dark' {
  return useStored(readStage, STAGE_EVENT)[0]
}
