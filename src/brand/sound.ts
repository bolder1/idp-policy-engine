import { useSyncExternalStore } from 'react'

import type { AccessDecision } from './data'
import type { ToastTone } from './toast-tone'

/* -----------------------------------------------------------------------------
   The console's sounds.

   Owner, 10 Oct 2026: "add sounds similar to how Zomato, Rapido, Google and
   Facebook use audio — quick notification sounds with toasts that capture
   attention, say something happened and prompt action; in all important
   steps, and in small fun places."

   This is a security admin console, so every cue is short, soft and pleasant,
   none plays on page load, and one press in the top bar turns them all off.

   · **Synthesised, not recorded.** Sine and triangle oscillators with a fast
     attack (3 to 8 ms) and an exponential fall, on one quiet master gain and a
     gentle low-pass. No audio files: nothing to load, nothing to license, and
     every cue is a few numbers a test can read (`CUES`).
   · **One family.** The pitches sit in one major key around A5, so a success,
     a publish and a celebration sound related; news that went well rises, news
     that went badly falls, and a question is left hanging.
   · **One AudioContext, made on the first cue.** A cue always follows a press,
     and a page that has had no press yet stays silent
     (`navigator.userActivation`). The context sleeps after a few idle seconds
     and wakes for the next cue; a cue that cannot wake it promptly is dropped
     rather than played late, on some later click.
   · **Never twice for one thing.** The same cue within 120 ms plays once. A cue
     played for a press claims the next 450 ms, and a toast that arrives in that
     window stays quiet — the press already said it ("Policy turned on" has its
     publish chime, not a second success under it). Not a warning or an error:
     a refusal is different news from the press, often the opposite of it
     ("Turn on another method first" after a switch was pressed off).
   · **A switch ticks when it moves.** The press asks; the tick plays once the
     switch's value arrives where the press asked (`switchTick`), so a refused
     change is not heard as done.
   -------------------------------------------------------------------------- */

export type Cue =
  | 'success'
  | 'info'
  | 'warning'
  | 'error'
  | 'removed'
  | 'undo'
  | 'toggle-on'
  | 'toggle-off'
  | 'publish'
  | 'attach'
  | 'celebrate'
  | 'run-allow'
  | 'run-mfa'
  | 'run-deny'
  | 'copy'

/* --- The notes ------------------------------------------------------------------ */

export interface Note {
  /** When it starts, in seconds from the cue's start. */
  at: number
  /** Its pitch in Hz, and where it glides to over the note when it moves. */
  f: number
  to?: number
  /** Start to silence, in seconds. */
  dur: number
  /** Its peak, 0 to 1, under the master gain. */
  gain: number
  wave?: 'sine' | 'triangle'
  /** The rise to the peak, in seconds: 5 ms unless a tick wants it sharper. */
  attack?: number
  /** An octave partial at this share of the peak, for a little bell. */
  ring?: number
}

/* The key, by name, so the intervals read as intervals. */
const D5 = 587.33
const E5 = 659.25
const G5 = 783.99
const A5 = 880
const C6 = 1046.5
const E6 = 1318.51
const G6 = 1567.98
const C7 = 2093
const E7 = 2637.02

export const ATTACK = 0.005

export const CUES: Record<Cue, readonly Note[]> = {
  /* A fourth up: done. */
  success: [
    { at: 0, f: E5, dur: 0.12, gain: 0.7, ring: 0.12 },
    { at: 0.075, f: A5, dur: 0.24, gain: 0.7, ring: 0.12 },
  ],
  /* One soft blip. */
  info: [{ at: 0, f: A5, dur: 0.16, gain: 0.55, ring: 0.1 }],
  /* The same note twice, evenly: look. */
  warning: [
    { at: 0, f: D5, dur: 0.11, gain: 0.55, wave: 'triangle' },
    { at: 0.14, f: D5, dur: 0.13, gain: 0.55, wave: 'triangle' },
  ],
  /* A major third down, low: it did not happen. */
  error: [
    { at: 0, f: 440, dur: 0.13, gain: 0.6, wave: 'triangle' },
    { at: 0.12, f: 349.23, dur: 0.24, gain: 0.6, wave: 'triangle' },
  ],
  /* A soft pop that drops away. */
  removed: [{ at: 0, f: 620, to: 300, dur: 0.14, gain: 0.6 }],
  /* The pop played backwards: a quick swoop up. */
  undo: [{ at: 0, f: 440, to: 880, dur: 0.16, gain: 0.5, ring: 0.1 }],
  /* Ticks, 40 ms: up for on, down for off. */
  'toggle-on': [{ at: 0, f: 1100, to: 1500, dur: 0.04, gain: 0.35, attack: 0.003 }],
  'toggle-off': [{ at: 0, f: 1300, to: 900, dur: 0.04, gain: 0.3, attack: 0.003 }],
  /* A policy goes live: the major triad, bright. */
  publish: [
    { at: 0, f: G5, dur: 0.2, gain: 0.55, ring: 0.15 },
    { at: 0.07, f: C6, dur: 0.2, gain: 0.55, ring: 0.15 },
    { at: 0.14, f: E6, dur: 0.3, gain: 0.6, ring: 0.15 },
  ],
  /* A snap and the note it lands on: a policy on an application, a person in a group. */
  attach: [
    { at: 0, f: 1800, to: 700, dur: 0.035, gain: 0.5, attack: 0.003 },
    { at: 0.03, f: A5, dur: 0.13, gain: 0.45, ring: 0.12 },
  ],
  /* The triad up an octave, and a spark over it: the first policy on an application, a tour finished. */
  celebrate: [
    { at: 0, f: C6, dur: 0.22, gain: 0.4, ring: 0.12 },
    { at: 0.065, f: E6, dur: 0.22, gain: 0.4, ring: 0.12 },
    { at: 0.13, f: G6, dur: 0.22, gain: 0.4, ring: 0.12 },
    { at: 0.195, f: C7, dur: 0.4, gain: 0.38, ring: 0.1 },
    { at: 0.29, f: E7, dur: 0.3, gain: 0.16 },
  ],
  /* Check access lands. Allowed: a fifth up, sure of itself. */
  'run-allow': [
    { at: 0, f: D5, dur: 0.13, gain: 0.65, ring: 0.12 },
    { at: 0.09, f: A5, dur: 0.28, gain: 0.65, ring: 0.12 },
  ],
  /* A second factor asked: a step up, held — a question. */
  'run-mfa': [
    { at: 0, f: D5, dur: 0.12, gain: 0.6, ring: 0.1 },
    { at: 0.1, f: E5, dur: 0.33, gain: 0.6, ring: 0.1 },
  ],
  /* Denied: a low, muted thud. The triangle's overtones keep it audible on a laptop's speakers. */
  'run-deny': [
    { at: 0, f: 247, to: 147, dur: 0.2, gain: 0.7, wave: 'triangle' },
    { at: 0, f: 123, to: 82, dur: 0.22, gain: 0.6 },
  ],
  /* The smallest tick. */
  copy: [{ at: 0, f: G6, dur: 0.035, gain: 0.3, attack: 0.003 }],
}

/** How long a cue sounds, start to silence, in seconds. */
export const cueLength = (cue: Cue): number => Math.max(...CUES[cue].map((n) => n.at + n.dur))

/* --- What each piece of news sounds like ------------------------------------------- */

const TONE_CUE: Record<ToastTone, Cue> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  error: 'error',
  removed: 'removed',
}

/** A toast's cue, from its kind of news (toast-tone.ts). */
export function cueForTone(tone: ToastTone): Cue {
  return TONE_CUE[tone]
}

/** Check access's answer as a cue: allowed, allowed with a second factor, denied; none while it depends or is missing a fact. */
export function cueForDecision(decision: AccessDecision | null): Cue | null {
  if (decision === '1fa') return 'run-allow'
  if (decision === '2fa') return 'run-mfa'
  if (decision === 'deny') return 'run-deny'
  return null
}

/* --- Once, and in turn ------------------------------------------------------------- */

/** The same cue again within this long plays once. */
export const THROTTLE_MS = 120
/** A cue played for a press holds this long, and a toast inside it is quiet. */
export const PRIORITY_MS = 450

/** Where a cue comes from: a press (`playCue`), or the toast that followed one (`playToastCue`). */
export type CueFrom = 'explicit' | 'toast'

export interface CueClock {
  /** When each cue last played (ms). */
  last: Partial<Record<Cue, number>>
  /** Until when a toast's cue stays quiet (ms). */
  claimedUntil: number
}

export const QUIET_CLOCK: CueClock = { last: {}, claimedUntil: -Infinity }

/* The toasts a press's window never quiets: news the press did not say. */
const NEVER_QUIET: ReadonlySet<Cue> = new Set<Cue>(['warning', 'error'])

/** Whether `cue` plays at `now`: not inside its own throttle, and a toast's not inside a press's window unless it is a warning or an error. */
export function shouldPlay(now: number, cue: Cue, from: CueFrom, clock: CueClock): boolean {
  if (from === 'toast' && now < clock.claimedUntil && !NEVER_QUIET.has(cue)) return false
  const last = clock.last[cue]
  return last === undefined || now - last >= THROTTLE_MS
}

/** A switch's tick once its press is answered: up when the press `asked` for on and `checked` is now on, down for off; nothing when no press asked (something else moved it) or the change was refused. */
export function switchTick(asked: boolean | null, checked: boolean): Cue | null {
  if (asked === null || asked !== checked) return null
  return checked ? 'toggle-on' : 'toggle-off'
}

/** The clock after a cue was asked for: its time if it played, and a press's window whether it played or not. */
export function afterCue(now: number, cue: Cue, from: CueFrom, clock: CueClock, played: boolean): CueClock {
  return {
    last: played ? { ...clock.last, [cue]: now } : clock.last,
    claimedUntil: from === 'explicit' ? Math.max(clock.claimedUntil, now + PRIORITY_MS) : clock.claimedUntil,
  }
}

/* --- The setting ---------------------------------------------------------------------
   On unless turned off, remembered the way the theme is (theme-mode.ts): one
   value for the page, read synchronously by every cue. */

export const SOUND_KEY = 'brand-sound'

/** Only the exact stored "off" turns the sounds off. */
export function parseSound(value: unknown): boolean {
  return value !== 'off'
}

/** The stored setting, through `get` — on when nothing can be read (no window, a private window, storage blocked). */
export function readSound(get: () => string | null = () => window.localStorage.getItem(SOUND_KEY)): boolean {
  try {
    return parseSound(get())
  } catch {
    return true
  }
}

/** Stores the setting through `set`; false when it could not be (it still holds for this visit). */
export function writeSound(on: boolean, set: (value: string) => void = (v) => window.localStorage.setItem(SOUND_KEY, v)): boolean {
  try {
    set(on ? 'on' : 'off')
    return true
  } catch {
    return false
  }
}

let soundOn = readSound()
const listeners = new Set<() => void>()

/** Sounds on or off for the page, remembered, and told to every control showing it. */
export function setSound(on: boolean): void {
  soundOn = on
  writeSound(on)
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Whether sounds are on, and the setter the top bar's button uses. */
export function useSoundSetting(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    subscribe,
    () => soundOn,
    () => true,
  )
  return [on, setSound]
}

/* --- Playing --------------------------------------------------------------------------- */

const MASTER = 0.1
/* The context sleeps after this long without a cue, and a cue that cannot wake it within the next is dropped. */
const IDLE_MS = 4000
const WAKE_MS = 200

let clock: CueClock = QUIET_CLOCK
let audio: { ctx: AudioContext; out: GainNode } | null = null
let idle = 0

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/* The context, made on the first cue: the master gain into a gentle low-pass. Null where there is no Web Audio. */
function context(): { ctx: AudioContext; out: GainNode } | null {
  if (audio) return audio
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  try {
    const ctx = new AC()
    const soften = ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 7000
    const out = ctx.createGain()
    out.gain.value = MASTER
    out.connect(soften)
    soften.connect(ctx.destination)
    audio = { ctx, out }
    return audio
  } catch {
    return null
  }
}

/* One oscillator through its own envelope: silent, up to the peak in `attack`,
   then an exponential fall to silence at `dur`. */
function voice(ctx: AudioContext, out: AudioNode, start: number, n: Note, mult: number, peak: number, fall: number) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = n.wave ?? 'sine'
  osc.frequency.setValueAtTime(n.f * mult, start)
  if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to * mult, start + n.dur)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(peak, start + (n.attack ?? ATTACK))
  env.gain.exponentialRampToValueAtTime(0.0001, start + fall)
  osc.connect(env)
  env.connect(out)
  osc.start(start)
  osc.stop(start + fall + 0.02)
  osc.onended = () => {
    osc.disconnect()
    env.disconnect()
  }
}

function schedule(ctx: AudioContext, out: AudioNode, cue: Cue) {
  const t0 = ctx.currentTime + 0.005
  for (const n of CUES[cue]) {
    const start = t0 + n.at
    voice(ctx, out, start, n, 1, n.gain, n.dur)
    if (n.ring) voice(ctx, out, start, n, 2, n.gain * n.ring, n.dur * 0.6)
  }
  window.clearTimeout(idle)
  idle = window.setTimeout(() => {
    if (ctx.state === 'running') void ctx.suspend().catch(() => {})
  }, IDLE_MS)
}

/* A page nobody has pressed yet stays silent, whatever asks. Where the browser
   cannot say, a cue is taken to follow a press, which every caller's does. */
function pressedYet(): boolean {
  if (typeof navigator === 'undefined') return true
  const ua = (navigator as { userActivation?: UserActivation }).userActivation
  return !ua || ua.hasBeenActive
}

function sound(cue: Cue, from: CueFrom) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!soundOn || document.hidden || !pressedYet()) return
  const t = now()
  const play = shouldPlay(t, cue, from, clock)
  clock = afterCue(t, cue, from, clock, play)
  if (!play) return
  const a = context()
  if (!a) return
  const { ctx, out } = a
  if (ctx.state === 'running') {
    schedule(ctx, out, cue)
    return
  }
  /* Asleep, or never woken: wake it, and play only if that was prompt — a
     cue heard a click later would belong to the wrong click. */
  void ctx
    .resume()
    .then(() => {
      if (now() - t <= WAKE_MS) schedule(ctx, out, cue)
    })
    .catch(() => {})
}

/** Plays a cue for something the admin just did. Safe anywhere: silent without Web Audio, when sounds are off, or when the tab is hidden. */
export function playCue(cue: Cue): void {
  sound(cue, 'explicit')
}

/** The toast's cue, from its kind of news — quiet when the press that caused it already made its own sound, unless it is a warning or an error. */
export function playToastCue(tone: ToastTone): void {
  sound(cueForTone(tone), 'toast')
}
