import { useEffect, useLayoutEffect, useRef } from 'react'

import type { EngineRun } from '../engine-run'
import { stepMs } from '../use-engine-run'
import type { Narrator } from './assistant/voice'
import type { Beat } from './focus-voice'

/* Focus's narration (FocusLayout.tsx): each moment's line said as it
   settles on screen, kept in step with the picture —

     · at most ONE line waits: a newly due beat replaces any queued line
       not yet said, so the voice never works through a backlog;
     · a line being said that the carousel has left two or more moments
       behind is cut, and the newest line is said in its few words;
     · the answer lands: whatever is being said is cut, the queue cleared,
       and the answer's line said at once.

   Walk through says every line whole (FocusLayout.tsx). The narrator
   (assistant/voice.ts) decides whether anything is heard at all: only a run
   seen playing, after the Run press, voice on; a new run, Skip, mute or
   leaving the view stops it. Skip (`quiet`) drops what is left. */

/* About how long a line takes to say (a British voice at 1.04): to tell whether it ends before the next line is due. */
const sayMs = (line: string) => 300 + line.length * 62

/* The time (ms) left from step `s` until step `to`, at the clock's pace. */
function msUntil(plan: EngineRun, s: number, to: number): number {
  let ms = 0
  for (let k = Math.max(0, s); k < to && k < plan.steps.length; k++) ms += stepMs(plan, k)
  return ms
}

interface Run {
  key: number
  /** The next beat not yet due. */
  next: number
  /** The one line waiting, and whether to say only its few words. */
  queued: { b: Beat; short: boolean } | null
  /** The beat being said. */
  saying: Beat | null
  busy: boolean
  token: number
  landed: boolean
}

export function useFocusNarration({
  narrator,
  plan,
  beats,
  s,
  landed,
  runKey,
  quiet,
  order,
  focusKey,
}: {
  narrator: Narrator
  plan: EngineRun
  beats: readonly Beat[]
  s: number
  landed: boolean
  runKey: number
  quiet: boolean
  /** The moments' keys in order, and the one in focus: how far behind the picture a line is. */
  order: readonly string[]
  focusKey: string | null
}) {
  const n = useRef(narrator)
  useLayoutEffect(() => {
    n.current = narrator
  })
  const st = useRef<Run>({ key: runKey, next: 0, queued: null, saying: null, busy: false, token: 0, landed: false })
  const now = useRef({ s, landed, beats, plan, order, focusKey })
  useLayoutEffect(() => {
    now.current = { s, landed, beats, plan, order, focusKey }
  })

  useEffect(() => {
    const r = st.current
    if (r.key !== runKey) {
      r.key = runKey
      r.next = 0
      r.queued = null
      r.saying = null
      r.token++
      r.busy = false
      r.landed = false
    }
    if (quiet) {
      r.next = beats.length
      r.queued = null
      r.landed = landed
      return
    }
    /* How many moments the focus has moved past a beat's own. */
    const behind = (b: Beat) => {
      const at = now.current
      const i = at.order.indexOf(b.key)
      const f = at.focusKey ? at.order.indexOf(at.focusKey) : -1
      return i < 0 || f < 0 ? 0 : f - i
    }
    const pump = () => {
      if (r.busy || !r.queued) return
      r.busy = true
      const token = r.token
      void (async () => {
        try {
          while (token === r.token && r.queued) {
            const { b, short } = r.queued
            r.queued = null
            const at = now.current
            const i = at.beats.indexOf(b)
            const next = at.beats[i + 1]
            const room = next && !at.landed ? msUntil(at.plan, at.s, next.at) : Infinity
            /* In step: the whole line, if it ends before the next line is due; else its few words. */
            const said = short || behind(b) >= 1 || sayMs(b.line) > room + 400 ? b.short : b.line
            r.saying = b
            await n.current.say(said)
            if (r.saying === b) r.saying = null
          }
        } catch {
          /* Speech refused: the subtitles carry on. */
        } finally {
          if (token === r.token) r.busy = false
        }
      })()
    }

    /* The answer lands: cut what is being said, clear the queue, say the answer's line now. */
    if (landed && !r.landed) {
      r.landed = true
      r.next = beats.length
      const out = beats.find((b) => b.key === 'outcome') ?? beats[beats.length - 1]
      r.queued = out ? { b: out, short: false } : null
      r.token++
      r.busy = false
      r.saying = null
      n.current.cancel()
      pump()
      return
    }
    let newest: Beat | null = null
    while (r.next < beats.length && (landed || s >= beats[r.next].at)) newest = beats[r.next++]
    /* At most one line waits: the newest due replaces any not yet said. */
    if (newest) r.queued = { b: newest, short: false }
    /* Two or more moments behind the picture: cut it, and say the newest in its few words. */
    if (r.saying && behind(r.saying) >= 2) {
      const latest = newest ?? r.queued?.b ?? null
      r.saying = null
      if (latest) r.queued = { b: latest, short: true }
      n.current.cancel()
    }
    pump()
  }, [beats, s, landed, runKey, quiet, focusKey])
}
