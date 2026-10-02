import { useEffect, useLayoutEffect, useRef } from 'react'

import type { EngineRun } from '../engine-run'
import { stepMs } from '../use-engine-run'
import type { Narrator } from './assistant/voice'
import type { Beat } from './focus-voice'

/* Focus's narration (FocusLayout.tsx): each moment's line said as it
   settles on screen, in order, one after another — a chain of `say`, each
   awaited, so a line is never cut off by the next. The voice follows the
   clock and never holds it: when a line would still be going as the next
   is due, or the run has moved on, it is swapped for its few-word form so it
   catches up, and a line the run has left well behind is let go (a rule
   that matched once the answer is in; never a failing rule, never the
   answer — Walk through and Read again say every line whole).
   The narrator (assistant/voice.ts) decides whether anything is
   heard at all: only a run seen playing, after the Run press, voice on; a
   new run, Skip, mute or leaving the view stops it. Skip (`quiet`) drops
   what is left. */

/* About how long a line takes to say (a British voice at 1.04): to tell whether it ends before the next line is due. */
const sayMs = (line: string) => 300 + line.length * 62

/* The time (ms) left from step `s` until step `to`, at the clock's pace. */
function msUntil(plan: EngineRun, s: number, to: number): number {
  let ms = 0
  for (let k = Math.max(0, s); k < to && k < plan.steps.length; k++) ms += stepMs(plan, k)
  return ms
}

export function useFocusNarration({ narrator, plan, beats, s, landed, runKey, quiet }: { narrator: Narrator; plan: EngineRun; beats: readonly Beat[]; s: number; landed: boolean; runKey: number; quiet: boolean }) {
  const n = useRef(narrator)
  useLayoutEffect(() => {
    n.current = narrator
  })
  const st = useRef({ key: runKey, next: 0, queue: [] as Beat[], busy: false, token: 0, carry: '' })
  const now = useRef({ s, landed, beats, plan })
  useLayoutEffect(() => {
    now.current = { s, landed, beats, plan }
  })

  useEffect(() => {
    const r = st.current
    if (r.key !== runKey) {
      r.key = runKey
      r.next = 0
      r.queue = []
      r.token++
      r.busy = false
      r.carry = ''
    }
    if (quiet) {
      r.next = beats.length
      r.queue = []
      r.carry = ''
      return
    }
    while (r.next < beats.length && (landed || s >= beats[r.next].at)) r.queue.push(beats[r.next++])
    if (r.busy || r.queue.length === 0) return
    r.busy = true
    const token = r.token
    void (async () => {
      try {
        /* A line let go leads the next one said — kept on the run's state, so it survives the queue running dry in between. */
        while (token === r.token && r.queue.length > 0) {
          const b = r.queue.shift()
          if (!b) break
          /* How far the carousel has moved past this line's moment: 0 in step, 1 a moment on, 2+ well past. */
          const at = now.current
          const i = at.beats.indexOf(b)
          const ahead = i < 0 ? 0 : at.beats.slice(i + 1).filter((x) => at.landed || at.s >= x.from).length
          if (b.dropAt !== undefined && ahead >= b.dropAt) {
            if (b.carry) r.carry = b.short
            continue
          }
          /* In step: the whole line, if it ends before the next line is due; else its few words. */
          const next = at.beats[i + 1]
          const room = next && !at.landed ? msUntil(at.plan, at.s, next.at) : Infinity
          const said = ahead >= 1 || sayMs(b.line) > room + 400 ? b.short : b.line
          const lead = r.carry
          r.carry = ''
          await n.current.say(lead ? `${lead} ${said}` : said)
        }
      } catch {
        /* Speech refused: the subtitles carry on. */
      } finally {
        if (token === r.token) r.busy = false
      }
    })()
  }, [beats, s, landed, runKey, quiet])
}
