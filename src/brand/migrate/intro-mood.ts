import { createContext, useContext, useEffect } from 'react'

/* The intro stage's light (owner, 5 Nov 2026: "ambient light ... deny goes red, 2FA yellow"): each story says what its
   moment feels like, and the stage's mesh behind it takes that colour. */
export type Mood = 'calm' | 'old' | 'allow' | 'warn' | 'deny' | 'multi'

export const MoodContext = createContext<(m: Mood) => void>(() => {})

/** A story reports its moment's mood; the stage behind it changes colour. */
export function useMood(m: Mood) {
  const set = useContext(MoodContext)
  useEffect(() => set(m), [m, set])
}

/** The one curve every intro scene and slide moves on. */
export const EASE_SCENE = [0.22, 1, 0.36, 1] as const

/** Autoplay: the carousel hears when a slide's story has played through once, and moves to the next. */
export const StoryDoneContext = createContext<(() => void) | undefined>(undefined)

/** True while the carousel moves on by itself, so a piece can travel from one slide's story into the next. */
export const HandoffContext = createContext(true)

/** The story's clock, shared with the carousel (owner, 5 Nov 2026: watchers, readers, the hurried): a story tells how
    long it plays so its chapter bar can fill; `paused` holds every story still while someone reads. */
export const StoryClockContext = createContext<{ begin: (ms: number) => void; paused: boolean }>({ begin: () => {}, paused: false })
