import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw } from 'lucide-react'

import type { SignInScreens } from '../screens-of'
import { HELD, PlayContext, useReveal, type PlayState } from './play-state'
import { OPENING, pageStepOf, sayOf, scriptOf, startOf, stepEnd, stepEntry, stepMs, stepStarts } from './script'
import { Stage } from './Stage'

/* -----------------------------------------------------------------------------
   What they see, in action: the sign-in played through once — the username
   typing in, the code arriving, the press that finishes it, the app's home
   or the deny page — and then held on its end.

   It plays by itself, once, when it first comes into view, a short beat
   after, so the answer above it lands first; and again when the answer
   changes. Not while it is held back (`hold`: the answer is still
   travelling to its place) or sits inside something inert.

   Under it, the steps as chips — "Password · Google Authenticator · Signed
   in" — the one playing marked and filling as it goes; a chip plays from
   there, Replay from the start. Under reduced motion nothing moves: each
   chip draws its step's last page, and the film opens on its end.

   Beside an answer's words (the Sign-in tests page's outcome) the chips and
   Replay stand apart from the stage, under the words (`barIn`, a slot the
   outcome card keeps in its left column), so the stage is the whole of its
   column and the card no taller than the stage (owner, 1 Oct: "it takes a
   lot of space … so much white space").
   -------------------------------------------------------------------------- */

/** The beat between the answer landing and the film starting. */
const START_AFTER = 700

export function SignInPlayer({
  screens,
  appId,
  appName,
  hold = false,
  compact = false,
  barIn,
}: {
  screens: SignInScreens
  appId: string
  appName: string
  hold?: boolean
  /** Beside an answer's words: the stage 16:10 at a narrow width, the browser nearer its edge, a smaller phone (player.css `.tplay.is-compact`). */
  compact?: boolean
  /** Where the chips and Replay are drawn, apart from the stage, once that slot is mounted. Absent, under the stage. */
  barIn?: HTMLElement | null
}) {
  const reduced = useReducedMotion() === true
  const person = screens.person ?? null
  const script = useMemo(() => scriptOf(screens, { appName, person }), [screens, appName, person])
  const starts = useMemo(() => stepStarts(script), [script])
  const sig = `${appId}|${screens.decision}|${screens.ruleName}|${script.chips.join('|')}|${script.total}`

  /* beat -1 is the page before anything happens; `run` counts plays, so the
     same beat played again starts its motion again. */
  const [clock, setClock] = useState({ sig, beat: -1, playing: false, started: false, run: 0 })
  if (clock.sig !== sig) setClock({ sig, beat: -1, playing: false, started: false, run: clock.run + 1 })
  const [picked, setPicked] = useState<{ sig: string; step: number } | null>(null)

  /* In view, and not inside anything inert: then, after a beat, play. */
  const root = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((es) => setSeen(es.some((e) => e.isIntersecting)), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const waiting = !reduced && !hold && seen && !clock.started && clock.sig === sig
  useEffect(() => {
    if (!waiting) return
    let id = 0
    const tryStart = () => {
      if (root.current?.closest('[inert]')) {
        id = window.setTimeout(tryStart, 250)
        return
      }
      setClock((c) => (c.sig === sig && !c.started ? { ...c, beat: 0, playing: true, started: true, run: c.run + 1 } : c))
    }
    id = window.setTimeout(tryStart, START_AFTER)
    return () => window.clearTimeout(id)
  }, [waiting, sig])

  /* Held back again: back to the page before it starts. */
  if (hold && clock.started) setClock({ ...clock, beat: -1, playing: false, started: false })

  const beat = clock.playing || clock.beat >= 0 ? clock.beat : -1
  const current = beat >= 0 ? script.beats[beat] : null
  useEffect(() => {
    if (!clock.playing || !current) return
    const id = window.setTimeout(() => {
      setClock((c) => (c.beat + 1 < script.beats.length ? { ...c, beat: c.beat + 1 } : { ...c, playing: false }))
    }, current.ms)
    return () => window.clearTimeout(id)
  }, [clock.playing, clock.run, beat, current, script.beats.length])

  const key = `${clock.run}:${beat}`
  const typing = clock.playing && current?.action.kind === 'type' ? current.action : null
  const shown = useReveal(typing?.count ?? 0, Math.max(0, (current?.ms ?? 0) - 60), key, typing !== null)

  /* Reduced motion: the chip picked, else the end — each step's last page. */
  const lastStep = script.chips.length - 1
  const staticStep = picked && picked.sig === sig ? picked.step : lastStep
  const shownBeat = reduced ? stepEnd(script, staticStep) : beat
  const scene = shownBeat >= 0 ? script.beats[shownBeat].scene : OPENING
  const step = shownBeat >= 0 ? script.beats[shownBeat].step : 0

  const play: PlayState = reduced || !clock.playing || !current ? { ...HELD, reduced } : { action: current.action, widget: current.widget, shown, key, reduced }

  const jump = (i: number) => {
    if (reduced) {
      setPicked({ sig, step: i })
      return
    }
    setClock((c) => ({ ...c, beat: stepEntry(script, i), playing: true, started: true, run: c.run + 1 }))
  }

  /* The whole film, the same from its first frame to its last. */
  const label = sayOf(script)
  /* A page slides in when it or its step changes — except the page saying a
     method is not available, which the closing chip holds rather than
     brings in again. The beat that clears the step before still shows its
     page, under that step's key, so the page does not come in twice. */
  const pageKey = scene.page.kind === 'unavailable' ? 'unavailable' : `${shownBeat >= 0 ? pageStepOf(script, shownBeat) : 0}:${scene.page.kind}`

  const bar = (
    <div className={`tplay__bar${barIn ? ' is-apart' : ''}`}>
      <div className="tplay__chips" role="group" aria-label="Steps">
        {script.chips.map((chip, i) => {
          /* The step playing, or the one it holds on once it is over. */
          const on = reduced ? i === staticStep : clock.started && i === step
          const past = !reduced && clock.started && i < step
          return (
            <button
              key={chip + i}
              type="button"
              className={`tplay__chip${on ? ' is-on' : ''}${past ? ' is-past' : ''}`}
              aria-current={on ? 'step' : undefined}
              onClick={() => jump(i)}
            >
              {on && clock.playing && current && (
                <motion.span
                  key={`${clock.run}:${i}`}
                  className="tplay__fill"
                  aria-hidden
                  style={{ originX: 0 }}
                  initial={{ scaleX: fraction(script, i, starts[i], beat) }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: remaining(script, i, starts[i], beat) / 1000, ease: 'linear' }}
                />
              )}
              <span className="tplay__chiptext" title={chip}>
                {chip}
              </span>
            </button>
          )
        })}
      </div>
      {/* An icon, named on hover: the engine's own Replay is a word, above, and
          the steps keep this row for themselves. */}
      {!reduced && (
        <button
          type="button"
          className="tplay__replay"
          aria-label="Replay"
          title="Replay"
          onClick={() => setClock((c) => ({ ...c, beat: 0, playing: true, started: true, run: c.run + 1 }))}
        >
          <RotateCcw size={14} strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  )

  return (
    <div className={`tplay${compact ? ' is-compact' : ''}`} ref={root}>
      <PlayContext.Provider value={play}>
        <div className="tplay__stage" role="img" aria-label={label}>
          <Stage appId={appId} appName={appName} person={person} scene={scene} pageKey={pageKey} />
        </div>
      </PlayContext.Provider>
      {barIn === undefined ? bar : barIn && createPortal(bar, barIn)}
    </div>
  )
}

/** How much of a chip has played when its beat starts. */
function fraction(s: ReturnType<typeof scriptOf>, step: number, first: number, beat: number): number {
  const all = stepMs(s, step)
  return all > 0 ? Math.min(1, (startOf(s, beat) - startOf(s, first)) / all) : 1
}

function remaining(s: ReturnType<typeof scriptOf>, step: number, first: number, beat: number): number {
  return Math.max(0, stepMs(s, step) - (startOf(s, beat) - startOf(s, first)))
}
