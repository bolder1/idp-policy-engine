import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/* -----------------------------------------------------------------------------
   The narrator (assistant/, shared by Focus, Brief and Jarvis): the Web Speech API,
   guarded, and the ears (speech input) where the browser has them.

   API (stable):

     const n = useNarrator({ runKey, running, jumped, reduced, persona? })
                                            persona: NARRATOR_PERSONA (default) or
                                            JARVIS_PERSONA — the timbre (one mute for all)
       n.say(line, opts?) → Promise<void>   resolves when the line ends — or at
                                            once when speech is missing, muted,
                                            or not allowed now — so a layout can
                                            chain lines in step with its beats:
                                              await n.say(lines.policy); await n.say(lines.rules)
       n.cancel()                           stop now
       n.muted / n.setMuted(m)              the voice off / on, remembered in this
                                            browser (`idp.check-voice`), default ON
       n.speaking: string | null            the line being said now (subtitles,
                                            karaoke focus); null when quiet
       n.available                          speech can be heard on this page
       n.readAgain(lines?)                  say this run's lines again, in order
                                            (default: the ones the run asked for)
       n.script()                           the lines this run has asked to say

     <MuteToggle muted onChange />          the dock's speaker button (aria-pressed = voice on)
     canListen() / listenOnce({ heard, end }) speech input (null where missing)

   The rules (as Jarvis's voice, which is proven):
   - A run is narrated ONCE: only a run seen playing (`running`) under its own
     `runKey` may speak, each distinct line once — never on a revisit (a
     layout mounted on a settled run) or a re-render.
   - Only after the person has used the page (the Run press counts):
     `navigator.userActivation.hasBeenActive`.
   - Cancelled on a new run, on Skip (`jumped` — the rest of that run stays
     quiet), on mute and on unmount.
   - Never a queue: a new line replaces the one being said (its promise
     resolves); `{ wait: true }` instead waits for the current line to end,
     and replaces any other line waiting.
   - `{ gesture: true }` is a line answering a press — an answer, Read again:
     it may speak outside the run's narration, and again.
   - A British English voice where there is one.
   Every call is wrapped: where speech is missing or refuses, nothing throws.
   -------------------------------------------------------------------------- */

export const VOICE_KEY = 'idp.check-voice'

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(VOICE_KEY) === 'off'
  } catch {
    return false
  }
}
function writeMuted(m: boolean): void {
  try {
    window.localStorage.setItem(VOICE_KEY, m ? 'off' : 'on')
  } catch {
    /* Storage refused: the choice holds for this visit. */
  }
}

/* Every narrator on the page agrees on mute. */
const muteListeners = new Set<(m: boolean) => void>()
let mutedNow: boolean | null = null
function getMuted(): boolean {
  if (mutedNow === null) mutedNow = typeof window === 'undefined' ? false : readMuted()
  return mutedNow
}
function setMutedEverywhere(m: boolean) {
  mutedNow = m
  writeMuted(m)
  for (const f of muteListeners) f(m)
}

function synthOf(): SpeechSynthesis | null {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
    return window.speechSynthesis ?? null
  } catch {
    return null
  }
}

/** Speech can be heard here: the API exists and the page has had a gesture. */
export function canSpeak(): boolean {
  if (!synthOf()) return false
  try {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
    return ua ? ua.hasBeenActive : true
  } catch {
    return true
  }
}

/* A British English voice where there is one, else any English, else the default (or the persona's own pick). */
function pickVoice(s: SpeechSynthesis, persona?: VoicePersona): SpeechSynthesisVoice | null {
  try {
    const vs = s.getVoices()
    if (!vs || vs.length === 0) return null
    if (persona?.pick) return persona.pick(vs)
    const gb = vs.filter((v) => /^en[-_]GB/i.test(v.lang))
    return gb.find((v) => /natural|neural|online/i.test(v.name)) ?? gb[0] ?? vs.find((v) => /^en/i.test(v.lang)) ?? null
  } catch {
    return null
  }
}

/** A voice's timbre: its rate, pitch and which of the browser's voices (Jarvis's: a lower British male). */
export interface VoicePersona {
  rate: number
  pitch: number
  /** The voice, from the browser's; null for the default. */
  pick?: (voices: readonly SpeechSynthesisVoice[]) => SpeechSynthesisVoice | null
}

/** The narrator's own voice (Focus, Brief). */
export const NARRATOR_PERSONA: VoicePersona = { rate: 1.04, pitch: 1 }

/** Jarvis's voice, as jarvis-voice.ts has it: a British male where there is one, a touch quicker and lower. */
export const JARVIS_PERSONA: VoicePersona = {
  rate: 1.05,
  pitch: 0.95,
  pick: (vs) => {
    const gb = vs.filter((v) => /^en[-_]GB/i.test(v.lang))
    return gb.find((v) => /male|daniel|george|arthur|ryan|oliver/i.test(v.name) && !/female/i.test(v.name)) ?? gb[0] ?? vs.find((v) => /^en/i.test(v.lang)) ?? null
  },
}

export interface NarratorInput {
  runKey: number
  running: boolean
  jumped: boolean
  reduced: boolean
  /** The voice's timbre (default NARRATOR_PERSONA). Mute is shared whatever the persona. */
  persona?: VoicePersona
}

export interface SayOptions {
  /** A line answering a press (an answer, Read again): may speak outside the run's narration, and again. */
  gesture?: boolean
  /** Wait for the line being said to end, instead of replacing it. */
  wait?: boolean
}

export interface Narrator {
  say: (line: string, opts?: SayOptions) => Promise<void>
  cancel: () => void
  muted: boolean
  setMuted: (m: boolean) => void
  speaking: string | null
  available: boolean
  readAgain: (lines?: readonly string[]) => Promise<void>
  script: () => readonly string[]
}

interface Current {
  line: string
  u: SpeechSynthesisUtterance | null
  done: () => void
  timer: number
}

export function useNarrator({ runKey, running, jumped, persona = NARRATOR_PERSONA }: NarratorInput): Narrator {
  const personaRef = useRef(persona)
  useLayoutEffect(() => {
    personaRef.current = persona
  }, [persona])
  const [muted, setMutedState] = useState<boolean>(() => getMuted())
  const [speaking, setSpeaking] = useState<string | null>(null)
  const mutedRef = useRef(muted)
  useLayoutEffect(() => {
    mutedRef.current = muted
  }, [muted])

  /* Which run may speak: the one seen playing, until Skip or the next run. */
  const keyRef = useRef(runKey)
  const liveKey = useRef<number | null>(null)
  const quietKey = useRef<number | null>(null)
  const saidRef = useRef<{ key: number; lines: string[] }>({ key: runKey, lines: [] })
  const current = useRef<Current | null>(null)
  const waiting = useRef<{ line: string; resolve: () => void } | null>(null)
  const readToken = useRef(0)

  const finish = useCallback((c: Current | null) => {
    if (!c || current.current !== c) return
    window.clearTimeout(c.timer)
    current.current = null
    c.done()
    const next = waiting.current
    waiting.current = null
    if (next) startRef.current(next.line, next.resolve)
    else setSpeaking(null)
  }, [])

  const stopAll = useCallback(() => {
    readToken.current++
    const w = waiting.current
    waiting.current = null
    w?.resolve()
    const c = current.current
    current.current = null
    if (c) {
      window.clearTimeout(c.timer)
      if (c.u) {
        c.u.onend = null
        c.u.onerror = null
      }
      c.done()
    }
    try {
      synthOf()?.cancel()
    } catch {
      /* Nothing to cancel. */
    }
    setSpeaking(null)
  }, [])

  const start = useCallback(
    (line: string, resolve: () => void) => {
      const s = synthOf()
      if (!s || !canSpeak() || mutedRef.current) {
        resolve()
        return
      }
      try {
        const u = new SpeechSynthesisUtterance(line)
        const p = personaRef.current
        const v = pickVoice(s, p)
        if (v) u.voice = v
        u.lang = v?.lang ?? 'en-GB'
        u.rate = p.rate
        u.pitch = p.pitch
        const c: Current = { line, u, done: resolve, timer: 0 }
        u.onend = () => finish(c)
        u.onerror = () => finish(c)
        current.current = c
        setSpeaking(line)
        /* Some engines drop a line spoken in the same tick as a cancel. */
        const wasBusy = s.speaking || s.pending
        if (wasBusy) s.cancel()
        if (wasBusy) window.setTimeout(() => current.current === c && s.speak(u), 40)
        else s.speak(u)
        /* Some engines never say they have finished: move on after a generous while. */
        c.timer = window.setTimeout(() => finish(c), 1800 + line.length * 90)
      } catch {
        current.current = null
        setSpeaking(null)
        resolve()
      }
    },
    [finish],
  )
  const startRef = useRef(start)
  useLayoutEffect(() => {
    startRef.current = start
  }, [start])

  /* The props, read by `say` without re-creating it; a run seen playing becomes the live one. */
  useLayoutEffect(() => {
    keyRef.current = runKey
    if (saidRef.current.key !== runKey) saidRef.current = { key: runKey, lines: [] }
    if (running && !jumped && quietKey.current !== runKey) liveKey.current = runKey
  }, [runKey, running, jumped])

  /* A new run, Skip: quiet now. Skip keeps that run quiet. */
  const lastKey = useRef(runKey)
  useEffect(() => {
    if (lastKey.current !== runKey) {
      lastKey.current = runKey
      stopAll()
    }
  }, [runKey, stopAll])
  useEffect(() => {
    if (!jumped) return
    quietKey.current = keyRef.current
    if (liveKey.current === keyRef.current) liveKey.current = null
    stopAll()
  }, [jumped, stopAll])

  /* Mute, everywhere at once. */
  useEffect(() => {
    const on = (m: boolean) => setMutedState(m)
    muteListeners.add(on)
    return () => {
      muteListeners.delete(on)
    }
  }, [])
  useEffect(() => {
    if (muted) stopAll()
  }, [muted, stopAll])

  /* Voices load late in some browsers: ask once, so the first line has its voice. */
  useEffect(() => {
    try {
      synthOf()?.getVoices()
    } catch {
      /* No voices. */
    }
  }, [])

  /* Unmount (not React's dev double-mount): quiet. */
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      window.setTimeout(() => {
        if (!mounted.current) stopAll()
      }, 0)
    }
  }, [stopAll])

  const say = useCallback(
    (line: string, opts: SayOptions = {}): Promise<void> => {
      const text = (line ?? '').trim()
      if (!text) return Promise.resolve()
      const key = keyRef.current
      const book = saidRef.current.key === key ? saidRef.current : (saidRef.current = { key, lines: [] })
      const fresh = !book.lines.includes(text)
      if (fresh && !opts.gesture) book.lines.push(text)
      const allowed = opts.gesture || (liveKey.current === key && quietKey.current !== key && fresh)
      if (!allowed || mutedRef.current || !synthOf()) return Promise.resolve()
      return new Promise<void>((resolve) => {
        if (current.current && opts.wait) {
          waiting.current?.resolve()
          waiting.current = { line: text, resolve }
          return
        }
        if (current.current) {
          const c = current.current
          current.current = null
          window.clearTimeout(c.timer)
          if (c.u) {
            c.u.onend = null
            c.u.onerror = null
          }
          c.done()
        }
        waiting.current?.resolve()
        waiting.current = null
        startRef.current(text, resolve)
      })
    },
    [],
  )

  const readAgain = useCallback(
    async (lines?: readonly string[]) => {
      const list = (lines && lines.length > 0 ? lines : saidRef.current.lines).filter(Boolean)
      stopAll()
      const token = ++readToken.current
      for (const l of list) {
        if (token !== readToken.current) return
        await say(l, { gesture: true })
      }
    },
    [say, stopAll],
  )

  const setMuted = useCallback((m: boolean) => setMutedEverywhere(m), [])
  const script = useCallback(() => saidRef.current.lines.slice(), [])

  return useMemo(
    () => ({ say, cancel: stopAll, muted, setMuted, speaking, available: synthOf() !== null, readAgain, script }),
    [say, stopAll, muted, setMuted, speaking, readAgain, script],
  )
}

// --- The speaker button -----------------------------------------------------------------

/** The dock's speaker button (MuteToggle.tsx): the narrator on or off, aria-pressed = the voice is on. */
export { MuteToggle, type MuteToggleProps } from './MuteToggle'

// --- The ears ---------------------------------------------------------------------------

/* The browser's speech recognition, where it has one (Chrome's is prefixed).
   Typed loosely: the DOM library does not carry it. */
interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  try {
    if (typeof window === 'undefined') return null
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
  } catch {
    return null
  }
}

/** The browser can listen (the mic button shows only then). */
export function canListen(): boolean {
  return recognitionCtor() !== null
}

/** Listen once: the words heard (interim as they come, then final), then the end. Returns a stop, or null where it cannot listen. */
export function listenOnce(on: { heard: (text: string, final: boolean) => void; end: () => void }): (() => void) | null {
  const Ctor = recognitionCtor()
  if (!Ctor) return null
  try {
    const r = new Ctor()
    r.lang = 'en-GB'
    r.interimResults = true
    r.maxAlternatives = 1
    r.continuous = false
    let ended = false
    const end = () => {
      if (ended) return
      ended = true
      on.end()
    }
    r.onresult = (e) => {
      try {
        let text = ''
        let final = false
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i]
          text += res[0]?.transcript ?? ''
          if (res.isFinal) final = true
        }
        on.heard(text.trim(), final)
      } catch {
        /* A result the page could not read: ignored. */
      }
    }
    r.onerror = () => end()
    r.onend = () => end()
    r.start()
    return () => {
      try {
        r.abort()
      } catch {
        /* Already stopped. */
      }
      end()
    }
  } catch {
    return null
  }
}
