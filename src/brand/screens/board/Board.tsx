import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Maximize2, Minus, Plus } from 'lucide-react'

import { fallbackRule, type Policy } from '../../data'
import type { Diagnostic } from '../diagnostics'
import type { NameLookup } from '../predicate-prose'
import { ruleState } from '../rule-form'
import type { Selection, Trace } from './model'
import { RuleCard, TerminalCard } from './RuleCard'

/* -----------------------------------------------------------------------------
   The stage, and the chain on it.

   A viewport with one transform. The chain is ordinary flow layout inside the
   world — cards stack, connectors are CSS — so nothing here ever computes a
   coordinate for a rule. Pan moves the world; zoom scales it about the cursor;
   Fit measures the world once and centres it. That is the whole canvas.
   -------------------------------------------------------------------------- */

const ZMIN = 0.5
const ZMAX = 1.4
const STEP = 220 // ms between rule lights in a rehearsal

/* Read once. Every glide checks it, and a canvas that animates when somebody
   has asked it not to is worse than one that never animated. */
const REDUCED =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : ({ matches: false } as MediaQueryList)

interface View {
  x: number
  y: number
  z: number
}

export function Board({
  policy,
  selection,
  diagnostics,
  shadowed,
  trace,
  resolve,
  onSelect,
  onInsert,
  onMove,
  onToggle,
  onDuplicate,
  onDelete,
  onHover,
  children,
}: {
  policy: Policy
  selection: Selection
  diagnostics: Diagnostic[]
  /** Rules dimmed because the hovered rule puts them out of reach. */
  shadowed: number[]
  trace: Trace | null
  resolve: NameLookup
  onSelect: (s: Selection) => void
  onInsert: (at: number) => void
  onMove: (from: number, to: number) => void
  onToggle: (i: number, on: boolean) => void
  onDuplicate: (i: number) => void
  onDelete: (i: number) => void
  onHover: (i: number | null) => void
  /** Floating chrome the host wants over the stage — pips, the save bar. */
  children?: ReactNode
}) {
  const stage = useRef<HTMLDivElement | null>(null)
  const world = useRef<HTMLDivElement | null>(null)
  const cards = useRef<(HTMLDivElement | null)[]>([])

  /* --- The view, in a ref rather than in state --------------------------------

     This is the whole reason the canvas used to judder, and it is worth being
     precise about. `view` was React state, so a pan wrote it on every
     `pointermove` and a wheel wrote it on every tick. Each write re-rendered
     Board, which re-rendered every RuleCard, and every card carries `layout` —
     so Motion measured and re-projected the entire chain, twice a frame, while
     the only thing that had actually changed was one CSS transform on one
     element. At eight rules that is a few hundred layout reads per second to
     move a background.

     Nothing about the view is React's business: no component branches on it,
     and the only readers are one transform, three custom properties the dot
     grid follows, and a percentage. So it lives in a ref and is written
     straight to the DOM, one batched write per animation frame. React
     re-renders on rules, selection and drag slots — the things that really
     change what is on screen — and not on motion.

     The inline styles below still read the ref during render, which keeps this
     self-healing: a re-render for any other reason repaints the current view
     rather than reverting to a stale one. */
  const viewRef = useRef<View>({ x: 80, y: 24, z: 1 })
  const zoomLabel = useRef<HTMLSpanElement | null>(null)
  const frame = useRef(0)
  const glideFrame = useRef(0)
  const [panning, setPanning] = useState(false)
  const pan = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  const clampView = (v: View): View => ({ ...v, z: Math.min(ZMAX, Math.max(ZMIN, v.z)) })

  const paint = useCallback(() => {
    frame.current = 0
    const w = world.current
    const s = stage.current
    if (!w || !s) return
    const v = viewRef.current
    /* translate3d, not translate: it keeps the world on its own compositor
       layer, so a pan is a layer move rather than a repaint of eight cards. */
    w.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.z})`
    s.style.setProperty('--bb-x', `${v.x}px`)
    s.style.setProperty('--bb-y', `${v.y}px`)
    s.style.setProperty('--bb-z', `${v.z}`)
    if (zoomLabel.current) zoomLabel.current.textContent = `${Math.round(v.z * 100)}%`
  }, [])

  const apply = useCallback(
    (next: (v: View) => View) => {
      cancelAnimationFrame(glideFrame.current)
      viewRef.current = clampView(next(viewRef.current))
      if (!frame.current) frame.current = requestAnimationFrame(paint)
    },
    [paint],
  )

  /* Zoom buttons and Fit move the view rather than jumping it.

     A jump from 77% to 100% gives no sense of which way the canvas went, and
     was the other half of what read as jitter — the content simply appeared
     somewhere else. Cubic ease-out, no spring: a spring overshoots, and an
     overshoot on a whole canvas reads as a wobble rather than as life. */
  const glide = useCallback(
    (to: Partial<View>, ms = 240) => {
      cancelAnimationFrame(glideFrame.current)
      const from = { ...viewRef.current }
      const target = clampView({ ...from, ...to })
      if (REDUCED.matches || ms === 0) {
        viewRef.current = target
        paint()
        return
      }
      const t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / ms)
        const e = 1 - Math.pow(1 - p, 3)
        viewRef.current = {
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          z: from.z + (target.z - from.z) * e,
        }
        paint()
        if (p < 1) glideFrame.current = requestAnimationFrame(tick)
      }
      glideFrame.current = requestAnimationFrame(tick)
    },
    [paint],
  )

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      cancelAnimationFrame(glideFrame.current)
    },
    [],
  )

  /* --- Fit ----------------------------------------------------------------- */
  const fitTo = useCallback((ms: number) => {
    const s = stage.current
    const w = world.current
    if (!s || !w) return
    /* Measured from the DOM at the moment Fit runs, not passed in as a prop.

       The panel floats over the stage now, so the usable width is the stage
       minus whatever the panel is covering — and that width changes on every
       frame of a grip drag. A prop would re-render the board and every card
       each of those frames, which is the cost this file spent the day removing.
       Reading it here costs one layout query, once, on a button press. */
    const panel = s.parentElement?.querySelector('.bb__insp') as HTMLElement | null
    const covered = panel && !s.parentElement?.classList.contains('is-insp-closed') ? panel.offsetWidth + 24 : 0
    const sw = s.clientWidth - covered
    /* The world is scaled, so `offsetWidth` is the only honest width — a
       bounding rect here would return the width AT the current zoom and Fit
       would converge on whatever it already was. */
    const ww = w.offsetWidth
    if (!ww) return
    /* Fit the WIDTH, never the height. A chain of eight rules fitted to the
       height of a laptop screen is eight unreadable cards; fitted to the width
       it is readable cards you pan down through, which is what a chain is. */
    const z = Math.min(1, Math.max(ZMIN, (sw - 40) / ww))
    glide({ x: Math.max(0, (sw - ww * z) / 2), y: 0, z }, ms)
  }, [glide])

  const fit = useCallback(() => fitTo(280), [fitTo])

  useLayoutEffect(() => {
    // Once, on mount, and instantly — an opening animation on the first paint
    // is a canvas that arrives late rather than one that arrives.
    const id = requestAnimationFrame(() => fitTo(0))
    return () => cancelAnimationFrame(id)
  }, [fitTo])

  /* --- Pan ----------------------------------------------------------------- */
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    /* Only the stage and the world's own padding pan. A card, a button, an
       input — anything interactive — keeps the gesture for itself. */
    if (t !== stage.current && t !== world.current && !t.classList.contains('bb__chain')) return
    const v = viewRef.current
    pan.current = { px: e.clientX, py: e.clientY, x: v.x, y: v.y }
    setPanning(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPanMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pan.current
    if (!p) return
    apply((v) => ({ ...v, x: p.x + (e.clientX - p.px), y: p.y + (e.clientY - p.py) }))
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pan.current
    if (!p) return
    pan.current = null
    setPanning(false)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    /* A click on the empty stage, not a drag, clears the selection — the
       inspector goes back to the policy. Measured as "did not move". */
    const moved = Math.hypot(e.clientX - p.px, e.clientY - p.py) > 3
    if (!moved) onSelect({ kind: 'none' })
  }

  /* --- Zoom, about the cursor. Non-passive so the page does not scroll. ---- */
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = s.getBoundingClientRect()
        const px = e.clientX - r.left
        const py = e.clientY - r.top
        apply((v) => {
          /* Exponential, and clamped per event.

             It was `1 - deltaY * 0.0018` applied straight. A trackpad pinch
             emits deltas in the hundreds, so one event could ask for a factor
             near zero or a negative scale, and the canvas snapped. `exp` keeps
             zooming in and out symmetrical — the same gesture reversed lands
             back where it started — and the clamp caps any single event at
             ±12%, which is the difference between a smooth ramp and a jump. */
          const k = Math.min(1.12, Math.max(0.89, Math.exp(-e.deltaY * 0.0018)))
          const z = Math.min(ZMAX, Math.max(ZMIN, v.z * k))
          const kk = z / v.z
          return { x: px - (px - v.x) * kk, y: py - (py - v.y) * kk, z }
        })
      } else {
        /* Shift turns a vertical wheel into a horizontal pan, which is what
           every canvas does and what a mouse with one wheel needs. */
        const dx = e.shiftKey ? e.deltaY : e.deltaX
        const dy = e.shiftKey ? 0 : e.deltaY
        apply((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
      }
    }
    s.addEventListener('wheel', onWheel, { passive: false })
    return () => s.removeEventListener('wheel', onWheel)
  }, [apply])

  const zoomBy = (k: number) => {
    const s = stage.current
    if (!s) return
    const px = s.clientWidth / 2
    const py = s.clientHeight / 2
    const v = viewRef.current
    const z = Math.min(ZMAX, Math.max(ZMIN, v.z * k))
    const kk = z / v.z
    glide({ x: px - (px - v.x) * kk, y: py - (py - v.y) * kk, z }, 200)
  }

  /* --- Reorder by dragging the index ------------------------------------------ */
  /* State holds only the SLOT the card would land in — the thing that changes
     what is drawn. The card's own offset is written straight to its element.

     It used to be one `setDrag` per pointermove carrying `dy`, so every frame
     of a drag re-rendered Board and every card in the chain, each of which
     carries `layout` and so re-measured itself. That is the same trap the pan
     was in: sixty renders a second to move one element by a few pixels. The
     slot changes a handful of times in a whole drag; the offset changes every
     frame; so they are now kept in the two places that suit them. */
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)
  const dragRef = useRef<{ from: number; startY: number; mids: number[]; over: number } | null>(null)

  const onGrip = (index: number) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const mids = cards.current.slice(0, policy.rules.length).map((el) => {
      if (!el) return 0
      const r = el.getBoundingClientRect()
      return r.top + r.height / 2
    })
    dragRef.current = { from: index, startY: e.clientY, mids, over: index }
    setDrag({ from: index, over: index })

    const held = cards.current[index]
    if (held) held.style.willChange = 'transform'

    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      /* Divided by the zoom, because the card lives inside a scaled world and
         the pointer does not. At 77% the card used to travel 77% of the way
         the cursor did, so it fell behind the grip you were holding it by —
         the further you dragged, the further it lagged. */
      const dy = (ev.clientY - d.startY) / viewRef.current.z
      const el = cards.current[d.from]
      if (el) el.style.transform = `translate3d(0, ${dy}px, 0)`

      /* The slot the pointer is over, measured against the OTHER cards'
         midpoints as they were when the drag began. Stable while the cards
         shift under the pointer, which is the moment a live measurement lies. */
      let over = 0
      for (let i = 0; i < d.mids.length; i++) {
        if (i === d.from) continue
        if (ev.clientY > d.mids[i]) over = i < d.from ? i + 1 : i
      }
      if (ev.clientY < d.mids[d.from === 0 ? 1 : 0] && d.mids.length > 1 && d.from !== 0) over = 0
      const next = Math.min(Math.max(over, 0), d.mids.length - 1)
      // Only when the answer actually changes. This is the whole saving.
      if (next !== d.over) {
        d.over = next
        setDrag({ from: d.from, over: next })
      }
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const d = dragRef.current
      dragRef.current = null
      const el = d ? cards.current[d.from] : null
      if (el) {
        el.style.transform = ''
        el.style.willChange = ''
      }
      setDrag(null)
      if (d && d.over !== d.from) onMove(d.from, d.over)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /* Render order during a drag: the dragged card is shown at its target slot
     so the others make room; the card itself follows the pointer. */
  const order = policy.rules.map((_, i) => i)
  if (drag && drag.over !== drag.from) {
    order.splice(drag.from, 1)
    order.splice(drag.over, 0, drag.from)
  }

  /* --- The rehearsal cascade ---------------------------------------------------
     The trace is computed at once; the stage reveals it one rule at a time. */
  const [revealed, setRevealed] = useState(-1)
  useEffect(() => {
    if (!trace) {
      setRevealed(-1)
      return
    }
    setRevealed(-1)
    const n = trace.result.steps.length
    const timers: number[] = []
    for (let i = 0; i <= n; i++) timers.push(window.setTimeout(() => setRevealed(i), 260 + i * STEP))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [trace?.runId])

  const hit = trace?.result.hitIndex ?? null
  const inAudience = trace ? !trace.result.outOfAudience : true
  /* `inAudience` in the condition, and it was missing.

     Out of audience means no rule ran at all, and `hitIndex` is null for that
     reason — but null was also the value that means "fell through to the
     default", so the token settled on the default card while the board's own
     message beside it said the policy does not govern this person and nothing
     ran. The animation contradicted the sentence explaining it. */
  const landedOn = trace && inAudience && revealed >= trace.result.steps.length ? (hit === null ? 'terminal' : hit) : null

  const stepKind = (i: number) => {
    if (!trace || !inAudience) return null
    if (revealed < i + 1) return null
    return trace.result.steps[i]?.kind ?? null
  }

  const litLink = (i: number) => {
    // Link i sits above rule i. Lit once the token has passed through it.
    if (!trace || !inAudience) return ''
    if (hit !== null && i > hit) return 'is-dead'
    return revealed >= i ? 'is-lit' : ''
  }

  const diagsFor = (i: number) => diagnostics.filter((d) => d.ruleIndex === i)
  /* Materialised here rather than written into the draft, and that distinction
     is load-bearing. `Policy.fallback` is optional and only `blankPolicy()`
     sets one, so every policy that already existed reached this line with
     `undefined` and the chain simply stopped after the last connector — no
     pinned default to read, none to select, and a rehearsal that matched no
     rule sent its token to a card that was not on the stage.

     Writing one into the draft on open would fix the drawing and break the
     bar: `dirty` compares `saved.fallback` against `draft.fallback`, so every
     policy would come up dirty before anybody had touched it. `patchFallback`
     already does `draft.fallback ?? fallbackRule()`, so the first real edit
     writes it and the bar wakes up then, which is the moment it should. */
  const terminal = policy.fallback ?? fallbackRule()
  /* The `else` of a rule: the next rule that is on. Null means the default. */
  const nextOf = (i: number) => {
    const j = policy.rules.findIndex((r, k) => k > i && r.enabled)
    return j === -1 ? null : { index: j, name: policy.rules[j].name }
  }

  return (
    <div
      ref={stage}
      className={`bb__stage ${panning ? 'is-panning' : ''}`}
      style={{ '--bb-x': `${viewRef.current.x}px`, '--bb-y': `${viewRef.current.y}px`, '--bb-z': viewRef.current.z } as CSSProperties}
      onPointerDown={onDown}
      onPointerMove={onPanMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      tabIndex={-1}
      aria-label="The policy's rules, in the order they are evaluated"
    >
      <div
        ref={world}
        className="bb__world"
        style={{ transform: `translate3d(${viewRef.current.x}px, ${viewRef.current.y}px, 0) scale(${viewRef.current.z})` }}
      >
        <LayoutGroup id="bb-chain">
          <div className="bb__chain">
            <div className="bb__start" aria-label="A sign-in arrives">
              {landedOn === null && trace && inAudience ? (
                <motion.span layoutId="bb-token" className="bb__token" aria-hidden transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
                  ●
                </motion.span>
              ) : (
                <span className="bb__pulse" aria-hidden />
              )}
              <span>
                A sign-in arrives {trace ? <em>— {trace.ctx.user.name}, {trace.ctx.place.toLowerCase()}</em> : <em>— falls through the rules below</em>}
              </span>
            </div>

            {trace && !inAudience && (
              <motion.p className="bb__verdict" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ margin: '12px 0 0' }}>
                <strong>Not governed.</strong> This policy does not cover {trace.ctx.user.name}, so no rule ran.
              </motion.p>
            )}

            {/* `initial={false}`, and it is the whole point of wrapping this.

                Without it every card plays its entrance on first paint, so
                opening a policy of eight rules is eight things flying in — an
                animation that says "something happened" when nothing has. With
                it, the cards that are already there simply are there, and only
                a rule you actually insert animates in. The siblings making room
                for it is `layout` on the cards themselves. */}
            <AnimatePresence initial={false}>
              {order.map((ri, slot) => {
                const r = policy.rules[ri]
                const isDragged = drag?.from === ri
                return (
                  <motion.div
                    key={r.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    /* A spring for the layout move, a tween for the fade. The
                       move wants weight — a card sliding into a slot should
                       settle, not stop dead — and the fade wants to be over
                       before you notice it. */
                    transition={{ layout: { type: 'spring', stiffness: 520, damping: 42 }, opacity: { duration: 0.16 } }}
                  >
                    <Link lit={litLink(slot)} at={slot} onInsert={onInsert} />
                    <RuleCard
                      rule={r}
                      index={ri}
                      next={nextOf(ri)}
                      selected={selection.kind === 'rule' && selection.id === r.id}
                      state={ruleState(diagsFor(ri))}
                      traceKind={stepKind(ri)}
                      traceReason={trace?.result.steps[ri]?.reason ?? null}
                      landed={landedOn === ri}
                      shadowed={shadowed.includes(ri)}
                      dragging={isDragged}
                      resolve={resolve}
                      canUp={ri > 0}
                      canDown={ri < policy.rules.length - 1}
                      onSelect={() => onSelect({ kind: 'rule', id: r.id })}
                      onToggle={(on) => onToggle(ri, on)}
                      onMove={(dir) => onMove(ri, ri + dir)}
                      onDuplicate={() => onDuplicate(ri)}
                      onDelete={() => onDelete(ri)}
                      onGrip={onGrip(ri)}
                      onHover={(on) => onHover(on ? ri : null)}
                      cardRef={(el) => {
                        cards.current[ri] = el
                      }}
                    />
                  </motion.div>
                )
              })}
            </AnimatePresence>

            <Link lit={litLink(policy.rules.length)} at={policy.rules.length} onInsert={onInsert} last />
            <TerminalCard
              rule={terminal}
              resolve={resolve}
              selected={selection.kind === 'fallback'}
              landed={landedOn === 'terminal'}
              reached={trace && inAudience && revealed >= trace.result.steps.length ? hit === null : trace && inAudience ? false : null}
              onSelect={() => onSelect({ kind: 'fallback' })}
              cardRef={() => {}}
            />
          </div>
        </LayoutGroup>
      </div>

      {children}

      <div className="bb__float bb__float--br" role="group" aria-label="Zoom">
        <button type="button" className="bb__act" aria-label="Fit the chain in view" title="Fit" onClick={fit}>
          <Maximize2 size={14} strokeWidth={2} />
        </button>
        <span className="bb__float__sep" />
        <button type="button" className="bb__act" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}>
          <Minus size={14} strokeWidth={2} />
        </button>
        {/* Written by `paint`, not by a render. `aria-live` is deliberately
            absent: the value changes on every frame of a zoom, and a live
            region that announces sixty times a second announces nothing. */}
        <span className="bb__zoom" ref={zoomLabel}>
          {Math.round(viewRef.current.z * 100)}%
        </span>
        <button type="button" className="bb__act" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

/* A connector with an insert point. Zapier's `+` between steps, with one
   difference: it says where the rule will land, because under first-match
   the position IS most of the rule. */
function Link({ lit, at, onInsert, last }: { lit: string; at: number; onInsert: (at: number) => void; last?: boolean }) {
  return (
    <div className={`bb__link ${lit}`}>
      <button
        type="button"
        className="bb__link__add"
        aria-label={last ? 'Add a rule at the end' : `Insert a rule at position ${at + 1}`}
        onClick={(e) => {
          e.stopPropagation()
          onInsert(at)
        }}
      >
        <Plus size={12} strokeWidth={2.4} />
      </button>
      <span className="bb__link__hint">{last ? 'Add a rule here' : `Insert here — becomes rule ${at + 1}`}</span>
    </div>
  )
}
