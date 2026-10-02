/* -----------------------------------------------------------------------------
   The flight director's voice (MissionLayout.tsx; copied from jarvis-voice.ts): the Web Speech API, guarded.

   The voice says a run's few key beats, once a run, and only after the
   person has used the page (the Run press counts). It never builds a queue:
   at most the line being said and ONE line waiting — a newer beat replaces
   the waiting one, so the voice never falls more than a beat behind the run
   and never reads a stale line. Cancelled on a new run, on Skip, on mute and
   on unmount. Every call is wrapped: where speech is missing or refuses,
   nothing throws and the subtitles carry the words.

   Muted or not is remembered in this browser (`idp.check-mission.voice`).
   -------------------------------------------------------------------------- */

export const VOICE_KEY = 'idp.check-mission.voice'

export function readVoiceOn(): boolean {
  try {
    return window.localStorage.getItem(VOICE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function writeVoiceOn(on: boolean): void {
  try {
    window.localStorage.setItem(VOICE_KEY, on ? 'on' : 'off')
  } catch {
    /* Storage refused: the choice holds for this visit. */
  }
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

/* A British English voice where there is one (a male one first, for the
   flight director), else any English, else the default. */
function pickVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  try {
    const vs = s.getVoices()
    if (!vs || vs.length === 0) return null
    const gb = vs.filter((v) => /^en[-_]GB/i.test(v.lang))
    return gb.find((v) => /male|daniel|george|arthur|ryan|oliver/i.test(v.name) && !/female/i.test(v.name)) ?? gb[0] ?? vs.find((v) => /^en/i.test(v.lang)) ?? null
  } catch {
    return null
  }
}

export interface VoiceEvents {
  /** A line has started to be said (or, where speech is missing, is due). */
  onLine?: (line: string) => void
  /** Nothing is being said any more. */
  onIdle?: () => void
}

export interface Voice {
  say: (line: string) => void
  cancel: () => void
  speaking: () => boolean
  /** The line waiting its turn, if any. */
  waiting: () => string | null
}

export function createVoice(events: VoiceEvents = {}): Voice {
  let current: SpeechSynthesisUtterance | null = null
  let waiting: string | null = null
  let watchdog = 0

  const finish = (u: SpeechSynthesisUtterance) => {
    if (current !== u) return
    window.clearTimeout(watchdog)
    current = null
    if (waiting !== null) {
      const next = waiting
      waiting = null
      start(next)
    } else events.onIdle?.()
  }

  function start(line: string) {
    const s = synthOf()
    if (!s || !canSpeak()) {
      events.onLine?.(line)
      return
    }
    try {
      const u = new SpeechSynthesisUtterance(line)
      const v = pickVoice(s)
      if (v) u.voice = v
      u.lang = v?.lang ?? 'en-GB'
      u.rate = 1.05
      u.pitch = 0.95
      u.onend = () => finish(u)
      u.onerror = () => finish(u)
      current = u
      events.onLine?.(line)
      s.speak(u)
      /* Some engines never say they have finished: move on after a generous while. */
      window.clearTimeout(watchdog)
      watchdog = window.setTimeout(() => finish(u), 1500 + line.length * 95)
    } catch {
      current = null
      events.onLine?.(line)
    }
  }

  return {
    say(line) {
      if (current) {
        waiting = line
        return
      }
      start(line)
    },
    cancel() {
      waiting = null
      window.clearTimeout(watchdog)
      const was = current
      current = null
      try {
        if (was) {
          was.onend = null
          was.onerror = null
        }
        synthOf()?.cancel()
      } catch {
        /* Nothing to cancel. */
      }
    },
    speaking: () => current !== null,
    waiting: () => waiting,
  }
}

