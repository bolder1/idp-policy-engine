import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Sunrise } from 'lucide-react'

import { useBrand } from '../../../store'
import { resolveSignIn } from '../../tenant-resolver'
import { useSimEnv } from '../../sim-env'
import { useTestingSession } from '../../testing/session-state'
import { factsOf } from '../../testing/sign-in-form'
import { entryLine, entryName, type EntryAbout } from './aruna-entry-copy'
import { runFilm, type FilmLayers } from './aruna-entry-film'
import { useEntryPlace } from './aruna-entry-place'
import { COPILOT_NAME } from './copilot-name'
import { JARVIS_END_MS, JARVIS_MID_MS, noteJarvisEntry, signalJarvis, type JarvisPhase } from './jarvis-timing'
import './jarvis-mode.css'
import './jarvis-chrome.css'

/* -----------------------------------------------------------------------------
   Aruna's way in (code name Jarvis), on the canvas (owner, 4 Oct 2026: "a
   good button not at the top, somewhere in the canvas … have some more
   attraction to that"; and "maybe a new multiverse-type thing that will be
   opening").

   The porthole: a small disc of Aruna's own world — warm black, an ember
   rim, her reactor mark — standing at the right end of the ask (the shared
   AssistantDock), as the step up from asking to Aruna (aruna-entry-place.ts
   places it). It breathes and one ember orbits while she waits; a reveal
   says what she would do with THIS run (aruna-entry-copy.ts). Never an
   orange fill: Run stays the page's one orange button; the orange here is
   her mark's linework. Inside Aruna it is the way out.

   The opening (aruna-entry-film.ts, beats in jarvis-timing.ts): the view
   lifts off as a sheet, parallel copies fan into depth over her warm
   black, her iris comes through them from the porthole and lands on her
   reactor as her replay begins. Always dark on the way in. The exit is the
   reverse, into the porthole.
   -------------------------------------------------------------------------- */

export { JARVIS_END_MS, JARVIS_MID_MS, type JarvisPhase }

/** Aruna's reactor mark, 48 px: a turning dashed ring, an inner ring, a core in its bloom, one orbiting ember. */
/* Her mark was a drawn thing here — first a reactor of five concentric rings, then a sunrise, then a single lit
   bead. All three were pictures on a 48 px disc, and the owner's answer to the third was to stop drawing: "remove this
   and add a basic text based good button", with an icon if one helps. He is right, and the reason is that this button
   has a job a picture cannot do — it sits beside "Ask about this sign-in…", and what it offers is asking HER. A word
   says that; an orb asks you to learn what the orb means. The icon stays because a sunrise is her name, and at 14 px
   beside a word it reads as a mark rather than as a scene. */
/* The HUD's module, fetched as the pointer reaches the porthole: by the time the film swaps the layout under its
   cover, there is nothing left to load (the host's lazy import shares it). */
let warmed = false
const warm = () => {
  if (warmed) return
  warmed = true
  void import('../layouts/JarvisLayout')
}

/** The run on the canvas, in the reveal's words: whose sign-in, and how it ended (the session's last run). */
function useRunAbout(): EntryAbout | null {
  const { users, policies, zones } = useBrand()
  const { form } = useTestingSession()
  const env = useSimEnv()
  return useMemo(() => {
    const person = users.find((u) => u.id === form.personId)
    if (!person || !form.appId) return null
    const res = resolveSignIn(policies, factsOf(form, zones).facts, env)
    if (res.status === 'incomplete') return null
    const outcome = res.status === 'depends' ? 'conflict' : res.decision === 'deny' ? 'deny' : 'allow'
    return { person: person.name, outcome }
  }, [users, policies, zones, form, env])
}

/** The reveal's dwell: shown after a short hover, at once on keyboard focus, gone on Esc, leave or press. */
function useReveal() {
  const [shown, setShown] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const hide = () => {
    window.clearTimeout(timer.current)
    setShown(false)
  }
  const later = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShown(true), 250)
  }
  const now = () => {
    window.clearTimeout(timer.current)
    setShown(true)
  }
  return { shown, hide, later, now }
}

/** A ring that leaves the porthole once as a run lands ("ask me about this"): needs the host's `landed`. */
function useLandedPing(ref: RefObject<HTMLElement | null>, landed: boolean | undefined) {
  const was = useRef(landed)
  useEffect(() => {
    const before = was.current
    was.current = landed
    const el = ref.current
    if (!el || landed !== true || before !== false) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { transform: 'scale(1)', opacity: 0.7 },
        { transform: 'scale(2.9)', opacity: 0 },
      ],
      { duration: 700, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
    )
  }, [ref, landed])
}

/**
 * Aruna's porthole on the canvas: pressed while Aruna is on. `about` (optional) is the run on the canvas — else it
 * is read from the session's last run; `landed` (optional) is false while a run plays and true once it lands.
 */
export function JarvisButton({
  on,
  onPress,
  busy = false,
  about,
  landed,
}: {
  on: boolean
  onPress: () => void
  busy?: boolean
  about?: EntryAbout | null
  landed?: boolean
}) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const pingRef = useRef<HTMLSpanElement | null>(null)
  const [docked, setDocked] = useState(false)
  useEntryPlace(ref, setDocked)
  useLandedPing(pingRef, landed)
  const read = useRunAbout()
  const reveal = useReveal()
  const lineId = useId()
  const name = entryName(on)
  const line = entryLine(on, about === undefined ? read : about, docked)
  const state = [on ? 'is-on' : '', busy ? 'is-busy' : '', landed === false ? 'is-running' : '', reveal.shown ? 'is-revealed' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <span ref={ref} className={`sit-ae ${state}`}>
      <span className="sit-ae__link" aria-hidden />
      <span ref={pingRef} className="sit-ae__ping" aria-hidden />
      <button
        type="button"
        className={`sit-jx-btn${on ? ' is-on' : ''}`}
        aria-label={name}
        aria-pressed={on}
        aria-busy={busy || undefined}
        aria-describedby={line ? lineId : undefined}
        onPointerEnter={() => {
          warm()
          reveal.later()
        }}
        onPointerLeave={reveal.hide}
        onFocus={(e) => {
          warm()
          if (e.currentTarget.matches(':focus-visible')) reveal.now()
        }}
        onBlur={reveal.hide}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && reveal.shown) {
            e.stopPropagation()
            reveal.hide()
          }
        }}
        onClick={() => {
          warm()
          reveal.hide()
          if (busy) return
          if (!on) noteJarvisEntry()
          onPress()
        }}
      >
        <Sunrise className="sit-ae__ico" size={14} strokeWidth={2} aria-hidden />
        <span className="sit-ae__word">{name}</span>
      </button>
      {/* The name is on the button now, so the reveal carries only the invitation — it used to repeat the name in bold
          over a button that did not say it. */}
      {line && (
        <span className="sit-ae__tip" role="tooltip" aria-hidden={!reveal.shown}>
          <span id={lineId}>{line}</span>
        </span>
      )}
    </span>
  )
}

/* The rings the ground dissolves in, centre outward (from her reactor). */
const BANDS = 7
/* The wordmark, and the glyphs it decodes through. */
const WORD = COPILOT_NAME.toUpperCase()
const GLYPHS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ0123456789/<>'
/* The iris's tick ring: a mark every 6°, a long one every 30°. */
const TICKS = Array.from({ length: 60 }, (_, i) => i * 6)

/** Aruna's iris: rings that turn at their own speeds round a bright core. */
function Iris({ irisRef }: { irisRef: RefObject<HTMLDivElement | null> }) {
  const c = 150
  const at = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) }
  }
  return (
    <div ref={irisRef} className="sit-jx__iris">
      <div className="sit-jx__irisin">
        <svg className="sit-jx__r is-r1" viewBox="0 0 300 300" aria-hidden>
          <circle cx={c} cy={c} r={142} strokeDasharray="1.5 7.5" />
        </svg>
        <svg className="sit-jx__r is-r2" viewBox="0 0 300 300" aria-hidden>
          <circle cx={c} cy={c} r={126} strokeDasharray="150 34 60 34 120 34 70 34" />
        </svg>
        <span className="sit-jx__tickspin">
          <svg className="sit-jx__r is-r3" viewBox="0 0 300 300" aria-hidden>
            {TICKS.map((deg) => {
              const long = deg % 30 === 0
              const p0 = at(deg, long ? 98 : 103)
              const p1 = at(deg, 110)
              return <line key={deg} className={long ? 'is-long' : undefined} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} />
            })}
          </svg>
        </span>
        <svg className="sit-jx__r is-r4" viewBox="0 0 300 300" aria-hidden>
          <circle cx={c} cy={c} r={82} className="is-track" />
          <circle cx={c} cy={c} r={82} strokeDasharray="56 210 40 209" className="is-lit" />
        </svg>
        <svg className="sit-jx__r is-r5" viewBox="0 0 300 300" aria-hidden>
          <circle cx={c} cy={c} r={58} strokeDasharray="22 8.4" />
        </svg>
        <span className="sit-jx__core" />
      </div>
    </div>
  )
}

/**
 * The wordmark, decoding: each letter lands in turn, the ones still to come cycling through glyphs. Written straight
 * to the letters' text, from the film's own clock — nothing renders per frame.
 */
function useDecode(spans: RefObject<(HTMLSpanElement | null)[]>, from: number, each: number, on: boolean) {
  useLayoutEffect(() => {
    if (!on) return
    const els = spans.current ?? []
    const t0 = performance.now()
    let frame = 0
    let lastSwap = 0
    const tick = (now: number) => {
      const t = now - t0
      const swap = now - lastSwap > 45
      if (swap) lastSwap = now
      WORD.split('').forEach((ch, i) => {
        const el = els[i]
        if (!el) return
        const lands = from + i * each
        let text = ' '
        if (t >= lands) text = ch
        else if (t >= lands - 200) text = swap ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : (el.textContent ?? text)
        if (el.textContent !== text) el.textContent = text
        el.classList.toggle('is-glyph', text !== ch && text.trim() !== '')
      })
      if (t < from + WORD.length * each + 40) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [spans, from, each, on])
}

/** The way in and out, over the builder's region: the multiverse, always on Aruna's warm black. `stage` is kept for
    the host's call; the ground is dark whatever it says (owner, 4 Oct 2026: Aruna opens dark "no matter what"). */
export function JarvisTransition({ phase }: { phase: JarvisPhase; stage?: 'light' | 'dark' }) {
  const root = useRef<HTMLDivElement | null>(null)
  const ground = useRef<HTMLDivElement | null>(null)
  const grid = useRef<HTMLDivElement | null>(null)
  const sheet = useRef<HTMLDivElement | null>(null)
  const rim = useRef<HTMLSpanElement | null>(null)
  const ping = useRef<HTMLSpanElement | null>(null)
  const flare = useRef<HTMLSpanElement | null>(null)
  const iris = useRef<HTMLDivElement | null>(null)
  const brand = useRef<HTMLDivElement | null>(null)
  const bands = useRef<(HTMLSpanElement | null)[]>([])
  const echoes = useRef<(HTMLDivElement | null)[]>([])
  const letters = useRef<(HTMLSpanElement | null)[]>([])
  useDecode(letters, JARVIS_MID_MS, 45, phase === 'enter')

  useLayoutEffect(() => {
    signalJarvis(phase)
    const parts = [root, ground, grid, sheet, rim, ping, flare, iris, brand].map((r) => r.current)
    if (parts.some((p) => !p)) return
    const layers: FilmLayers = {
      root: root.current!,
      ground: ground.current!,
      bands: bands.current.filter((b): b is HTMLSpanElement => !!b),
      grid: grid.current!,
      echoes: echoes.current.filter((e): e is HTMLDivElement => !!e),
      sheet: sheet.current!,
      rim: rim.current!,
      ping: ping.current!,
      flare: flare.current!,
      iris: iris.current!,
      brand: brand.current!,
    }
    return runFilm(phase, layers)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the film starts
  }, [])

  const step = 1 / BANDS
  return (
    <div ref={root} className={`sit-jx sit-mv is-${phase}`} data-stage="dark" aria-hidden>
      <div ref={ground} className="sit-mv__ground">
        {Array.from({ length: BANDS }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              bands.current[i] = el
            }}
            className={`sit-mv__band${i === 0 ? ' is-core' : ''}`}
            style={{ '--b-out': (i + 1) * step, '--b-in': i * step } as CSSProperties}
          />
        ))}
        <div ref={grid} className="sit-mv__grid" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          ref={(el) => {
            echoes.current[i] = el
          }}
          className={`sit-mv__echo${i < 2 ? ' is-far' : ' is-near'}`}
        >
          {i < 2 && (
            <>
              <i className="is-a" />
              <i className="is-b" />
              <i className="is-c" />
            </>
          )}
          <span className="sit-mv__rim" />
        </div>
      ))}
      <div ref={sheet} className="sit-mv__sheet">
        <span ref={rim} className="sit-mv__rim is-main" />
      </div>
      <span ref={ping} className="sit-mv__ping" />
      <span ref={flare} className="sit-mv__flare" />
      <Iris irisRef={iris} />
      {phase === 'enter' && (
        <div ref={brand} className="sit-jx__brand">
          <div className="sit-jx__word">
            {WORD.split('').map((_, i) => (
              <span
                key={i}
                ref={(el) => {
                  letters.current[i] = el
                }}
                className="sit-jx__letter"
              >
                {' '}
              </span>
            ))}
          </div>
          <span className="sit-jx__rule" />
          <p className="sit-jx__status">Access checks</p>
        </div>
      )}
      {phase === 'exit' && <div ref={brand} className="sit-jx__brand" />}
    </div>
  )
}
