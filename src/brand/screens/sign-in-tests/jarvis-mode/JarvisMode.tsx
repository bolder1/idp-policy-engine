import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react'

import { Tip } from '../../../kit'
import { JARVIS, JARVIS2, type RunLayoutId } from '../run-layout'
import { JARVIS_DISSOLVE_MS, JARVIS_END_MS, JARVIS_MID_MS, signalJarvis, type JarvisPhase } from './jarvis-timing'
import './jarvis-mode.css'
import './jarvis-chrome.css'

/* -----------------------------------------------------------------------------
   Jarvis has its own way in (owner, 2 Oct 2026: "one personal favourite,
   Jarvis — add a dedicated Jarvis button with a transition, a good real
   Jarvis-type transition, and the whole experience should be special"). It
   is on neither shelf of the Canvas switch: this button on the page's bar
   takes the page INTO Jarvis — the transition plays over the stage, the run
   is redrawn as Jarvis underneath it at its middle, and the page wears its
   Jarvis chrome (`.sit.is-jarvis`, jarvis-chrome.css) while it is on — and
   pressed again takes it back to the layout it came from, the same way out.

   The transition is the suit's HUD coming online (jarvis-timing.ts has the
   beats): the page dims to deep navy from the button's corner; an arc-reactor
   iris opens at the centre, its rings turning at their own speeds and its
   ticks spinning in; a scan sweeps the region; the ground's grid comes up;
   JARVIS decodes letter by letter over "Access analysis online"; then the
   overlay dissolves outward in rings onto the HUD. The exit is the same film
   backwards: the rings close in as the HUD collapses into the iris,
   "Standing down", and the light returns into the button.

   Only transform, opacity and clip-path move (the letters' glyphs are
   written straight to the DOM, no render per frame); it never takes input;
   under reduced motion there is none at all (the page skips it, the CSS
   hides it).
   -------------------------------------------------------------------------- */

export { JARVIS_END_MS, JARVIS_MID_MS, type JarvisPhase }

/** The arc-reactor mark: two rings and a core. */
function ReactorMark() {
  return (
    <svg className="sit-jx-mark" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <circle className="sit-jx-mark__outer" cx="12" cy="12" r="9.5" />
      <circle className="sit-jx-mark__inner" cx="12" cy="12" r="5.5" />
      <circle className="sit-jx-mark__core" cx="12" cy="12" r="2.4" />
    </svg>
  )
}

/* The HUD's module, fetched as the pointer reaches the button: by the time the transition swaps the
   layout under its cover, there is nothing left to load (the host's lazy import shares it). */
let warmed = false
const warm = () => {
  if (warmed) return
  warmed = true
  void import('../layouts/JarvisLayout')
}

/** The bar's Jarvis button: pressed while Jarvis is on. */
export function JarvisButton({ on, onPress, busy = false }: { on: boolean; onPress: () => void; busy?: boolean }) {
  return (
    <Tip text={on ? 'Leave Jarvis' : 'Enter Jarvis'} placement="bottom">
      <button
        type="button"
        className={`sit-jx-btn${on ? ' is-on' : ''}`}
        aria-pressed={on}
        aria-busy={busy || undefined}
        onPointerEnter={warm}
        onFocus={warm}
        onClick={() => {
          warm()
          onPress()
        }}
      >
        <ReactorMark />
        Jarvis
      </button>
    </Tip>
  )
}

/* Which Jarvis, beside the button while Jarvis is on (owner, 2 Oct 2026: "the older version is more simple and
   better, so revert that and keep the current version as v2"): the first Jarvis, or v2 the Reactor. The console's
   two-way switch (page-bar.tsx `FilterTabs`), in Jarvis's chrome; the version picked is the one the button enters. */
const VERSIONS: readonly { value: RunLayoutId; label: string; tip: string }[] = [
  { value: JARVIS, label: 'v1', tip: 'Jarvis' },
  { value: JARVIS2, label: 'v2', tip: 'Jarvis v2 · the Reactor' },
]
export function JarvisVersion({ value, onChange }: { value: RunLayoutId; onChange: (v: RunLayoutId) => void }) {
  return (
    <div className="bseg sit-jx-ver" role="group" aria-label="Jarvis version">
      {VERSIONS.map((v) => (
        <Tip key={v.value} text={v.tip} placement="bottom">
          <button type="button" aria-pressed={value === v.value} className={value === v.value ? 'is-on' : ''} onClick={() => onChange(v.value)}>
            {v.label}
          </button>
        </Tip>
      ))}
    </div>
  )
}

/* The rings the overlay dissolves in (enter) and closes in (exit), centre outward. */
const BANDS = 7
/* The wordmark, and the glyphs it decodes through. */
const WORD = 'JARVIS'
const GLYPHS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ0123456789/<>'
/* The iris's tick ring: a mark every 6°, a long one every 30°. */
const TICKS = Array.from({ length: 60 }, (_, i) => i * 6)

/** The arc reactor at the centre: rings that turn at their own speeds round a bright core. */
function Iris() {
  const c = 150
  const at = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) }
  }
  return (
    <div className="sit-jx__iris">
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
 * The wordmark, decoding: each letter lands in turn, the ones still to come
 * cycling through glyphs. Written straight to the letters' text, from the
 * transition's own clock — nothing renders per frame.
 */
function useDecode(spans: RefObject<(HTMLSpanElement | null)[]>, from: number, each: number, phase: JarvisPhase) {
  useLayoutEffect(() => {
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
        /* In: the letter resolves at from + i·each, cycling glyphs just before. Out (the exit): it scrambles away again late on. */
        const lands = from + i * each
        const leaves = phase === 'exit' ? 1040 + (WORD.length - 1 - i) * 28 : Infinity
        let text = ' '
        if (t >= lands && t < leaves) text = ch
        else if (t >= lands - 240 && t < leaves + 160) text = swap ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : (el.textContent ?? text)
        if (el.textContent !== text) el.textContent = text
      })
      if (t < JARVIS_END_MS) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [spans, from, each, phase])
}

/** The way in and out, over the stage. */
export function JarvisTransition({ phase }: { phase: JarvisPhase; stage?: 'light' | 'dark' }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const letters = useRef<(HTMLSpanElement | null)[]>([])
  useDecode(letters, phase === 'enter' ? 470 : 330, 52, phase)

  /* Where the light leaves from and returns to (the Jarvis button), and how far the rings reach — by offsets
     against the region; nothing here is transformed. */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    signalJarvis(phase)
    const box = el.getBoundingClientRect()
    const btn = document.querySelector('.sit-jx-btn')?.getBoundingClientRect()
    const ox = btn ? btn.left + btn.width / 2 - box.left : box.width
    const oy = btn ? btn.top + btn.height / 2 - box.top : 0
    const reach = Math.hypot(Math.max(ox, box.width - ox), Math.max(oy, box.height - oy)) + 8
    /* The rings' centre is the iris's (50%, 46%): far enough to reach the region's farthest corner. */
    const ring = Math.hypot(box.width / 2, box.height * 0.54) + 8
    el.style.setProperty('--jx-ox', `${ox}px`)
    el.style.setProperty('--jx-oy', `${oy}px`)
    el.style.setProperty('--jx-reach', `${reach}px`)
    el.style.setProperty('--jx-ring', `${ring}px`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the transition starts
  }, [])

  const step = 1 / BANDS
  return (
    <div
      ref={ref}
      className={`sit-jx is-${phase}`}
      style={{ '--jx-dissolve': `${JARVIS_DISSOLVE_MS}ms` } as CSSProperties}
      aria-hidden
    >
      <div className="sit-jx__cover">
        {Array.from({ length: BANDS }, (_, i) => (
          <span
            key={i}
            className={`sit-jx__band${i === 0 ? ' is-core' : ''}`}
            style={
              {
                '--b-out': (i + 1) * step,
                '--b-in': i * step,
                '--b-i': i,
                '--b-ri': BANDS - 1 - i,
              } as CSSProperties
            }
          />
        ))}
        <div className="sit-jx__grid" />
      </div>
      <div className="sit-jx__scan" />
      {[0, 1, 2].map((k) => (
        <span key={k} className="sit-jx__shock" style={{ '--k': k } as CSSProperties} />
      ))}
      <Iris />
      <div className="sit-jx__brand">
        <div className="sit-jx__word">
          {WORD.split('').map((_, i) => (
            <span
              key={i}
              ref={(el) => {
                letters.current[i] = el
              }}
              className="sit-jx__letter"
              style={{ '--i': i } as CSSProperties}
            >
              {' '}
            </span>
          ))}
        </div>
        <span className="sit-jx__rule" />
        <p className="sit-jx__status">{phase === 'enter' ? 'Access analysis online' : 'Standing down'}</p>
      </div>
    </div>
  )
}
