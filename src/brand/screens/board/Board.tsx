import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Maximize2, Minus, Plus } from 'lucide-react'

import { fallbackRule, type Policy } from '../../data'
import { useCanvasView } from '../canvas-view'
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
  reserveOnOpen,
  expandedOf,
  onToggleExpand,
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
  /** Whether this rule's body is unfolded. Held by the host so it survives reorder. */
  expandedOf: (ruleId: string) => boolean
  onToggleExpand: (ruleId: string) => void
  /* Width to hold back on the OPENING Fit, for a panel that is not there yet.

     The board opens with nothing selected, so there is no panel at first paint
     and a measured Fit centres the chain across the whole stage. The first
     thing anybody does is click a card — which mounts 400px of panel over the
     right-hand end of the chain that was just centred without it, and leaves it
     there until somebody finds the Fit button. Every board, every policy.

     So the opening Fit reserves the width the panel is about to take. The Fit
     BUTTON never does: it fits what is actually on screen, which is the right
     answer for a deliberate press. */
  reserveOnOpen: number
  /** Floating chrome the host wants over the stage — pips, the save bar. */
  children?: ReactNode
}) {
  const stage = useRef<HTMLDivElement | null>(null)
  const world = useRef<HTMLDivElement | null>(null)
  const cards = useRef<(HTMLDivElement | null)[]>([])

  /* The viewport, which is no longer this file's business.

     Every rule that used to live here — the view in a ref rather than state,
     the single batched paint, the cubic-ease glide, the per-event wheel clamp,
     the mount fit that never animates — moved to `useCanvasView` when the
     condition canvas needed the same viewport. The comments explaining WHY
     each is the way it is went with the code; what stays here is the part that
     is about a CHAIN rather than about a canvas.

     Three of those: the world is measured by `offsetWidth` because the chain is
     ordinary flow layout and a bounding rect would return the width at the
     current zoom; the panel is measured from the DOM at the moment Fit runs,
     because a prop would re-render every card on each frame of a grip drag;
     and the fit is width-only, because a chain of eight rules fitted to the
     height of a laptop screen is eight unreadable cards. */
  const {
    viewRef,
    zoomLabel,
    panning,
    fit,
    zoomBy,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  } = useCanvasView(stage, world, {
    bounds: () => ({ w: world.current?.offsetWidth ?? 0, h: world.current?.offsetHeight ?? 0 }),
    reserve: () => {
      const s = stage.current
      const panel = s?.parentElement?.querySelector('.bb__insp') as HTMLElement | null
      const open = panel && !s?.parentElement?.classList.contains('is-insp-closed')
      return { right: open ? panel!.offsetWidth + 24 : 0, bottom: 0 }
    },
    axis: 'width',
    /* Only the stage and the world's own padding pan. A card, a button, an
       input — anything interactive — keeps the gesture for itself. */
    isPannableTarget: (t: HTMLElement) => t === stage.current || t === world.current || t.classList.contains('bb__chain'),
    onBackgroundClick: () => onSelect({ kind: 'none' }),
    zMin: ZMIN,
    zMax: ZMAX,
    cssPrefix: 'bb',
    reserveOnOpen,
  })

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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
                      expanded={expandedOf(r.id)}
                      onToggleExpand={() => onToggleExpand(r.id)}
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
              /* Keyed on the literal, not on the rule's id.

                 `terminal` falls back to `fallbackRule()` when the policy has
                 never stored one, and that call mints a fresh id on every
                 render — a fold remembered against it would be forgotten each
                 frame. 'fallback' is what the selection already calls this
                 card, so the two agree. */
              expanded={expandedOf('fallback')}
              onToggleExpand={() => onToggleExpand('fallback')}
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
