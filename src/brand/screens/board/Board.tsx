import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { LayoutTemplate, Maximize2, Minus, PencilRuler, Plus } from 'lucide-react'

import { fallbackRule, type Policy } from '../../data'
import { useCanvasView } from '../canvas-view'
import type { Diagnostic } from '../diagnostics'
import type { NameLookup } from '../predicate-prose'
import { ruleState } from '../rule-form'
import { DECISION_NAME, type Selection, type Trace } from './model'
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
  expandedOf,
  onToggleExpand,
  onUseTemplate,
  tools,
  aside,
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
  /* Opens the template catalogue. Only the empty board offers it, and the host
     mounts the sheet — applying a template is a write to the draft, and the
     draft has one door.

     `reserveOnOpen` stood here: a width to hold back on the opening Fit, for a
     panel that floated over the stage and would otherwise cover the right-hand
     end of a chain that had just been centred without it. The panel is a column
     now, so the stage's own width already excludes it and there is nothing to
     reserve. */
  onUseTemplate?: () => void
  /* View controls the host contributes INSIDE the centre toolbar, which this
     component owns because the zoom half of it lives here. They arrive before
     the zoom controls and a separator is drawn between the two. */
  tools?: ReactNode
  /* A pill of the host's own, docked to the left of that toolbar — for a
     control that is a MODE rather than a press. See the note at the dock. */
  aside?: ReactNode
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

     Two of those: the world is measured by `offsetWidth` because the chain is
     ordinary flow layout and a bounding rect would return the width at the
     current zoom; and the fit is width-only, because a chain of eight rules
     fitted to the height of a laptop screen is eight unreadable cards.

     A third has gone. Fit used to measure `.bb__insp` out of the DOM and take
     its width off the stage before centring, because the panel floated on top
     of a full-bleed stage. The panel is a grid track beside the stage now, so
     `clientWidth` already excludes it — reserving it a second time would file
     the chain half a panel to the left. */
  const {
    viewRef,
    zoomLabel,
    panning,
    fit,
    glide,
    zoomBy,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  } = useCanvasView(stage, world, {
    bounds: () => ({ w: world.current?.offsetWidth ?? 0, h: world.current?.offsetHeight ?? 0 }),
    axis: 'width',
    /* Only the stage and the world's own padding pan. A card, a button, an
       input — anything interactive — keeps the gesture for itself. */
    isPannableTarget: (t: HTMLElement) => t === stage.current || t === world.current || t.classList.contains('bb__chain'),
    onBackgroundClick: () => onSelect({ kind: 'none' }),
    zMin: ZMIN,
    zMax: ZMAX,
    cssPrefix: 'bb',
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
  const empty = policy.rules.length === 0

  /* An empty policy is one panel, so it is PLACED rather than fitted.

     `fitTo` fits the WIDTH — right for a chain, which is read top to bottom and
     panned down, and wrong for a single 420px card: it would blow the panel up
     to fill the stage and pin it to the top edge, which is the one thing an
     empty state must not do. Centred on both axes instead, at a fixed 90%, so
     it sits where the eye lands and reads as the whole of what is there rather
     than as something zoomed into.

     After the hook's own mount fit, deliberately. Its `useLayoutEffect` is
     registered first because the hook is called above this, so its frame is
     queued first and this one lands on top of it — one paint, no flash of a
     wrongly-fitted panel. */
  useLayoutEffect(() => {
    if (!empty) return
    const id = requestAnimationFrame(() => {
      const s = stage.current
      const w = world.current
      if (!s || !w) return
      /* The PANEL's centre, not the world's. The world carries the padding
         that gives the canvas somewhere to pan into, so centring it put the
         panel a hundred and thirty pixels high — visually off, and measurably
         so. Its offset inside the world is the thing to line up. */
      const el = w.querySelector<HTMLElement>('.bb__blank')
      const cx = el ? el.offsetLeft + el.offsetWidth / 2 : w.offsetWidth / 2
      const cy = el ? el.offsetTop + el.offsetHeight / 2 : w.offsetHeight / 2
      const z = 0.9
      glide({ x: s.clientWidth / 2 - cx * z, y: s.clientHeight / 2 - cy * z, z }, 0)
    })
    return () => cancelAnimationFrame(id)
  }, [empty, glide, stage, world])

  /* …and out of it, which the placement above cannot do.

     The chooser is placed at a fixed 0.9 on a 660px block. Answer it with "use
     a template" and five rules arrive in a 560px chain several times its
     height, at a zoom chosen for something else — so the board's first sight of
     its own rules would be a view framed for the question rather than the
     answer. Fit, animated, so the change reads as the chain arriving rather
     than as the canvas jumping.

     Guarded on the TRANSITION, not on `empty`: refitting whenever the policy is
     non-empty would fight every pan and zoom somebody makes afterwards. */
  /* The flag is cleared by the FIT, not by the effect that schedules it.

     Clearing it on entry looks equivalent and is not: StrictMode mounts every
     effect twice in development — run, clean up, run again — so the second run
     would find the flag already down and schedule nothing. Written this way the
     cleanup cancels the frames and the remount schedules them afresh, which is
     what a cleanup is supposed to mean. */
  const wasEmpty = useRef(empty)
  useEffect(() => {
    if (empty) {
      wasEmpty.current = true
      return
    }
    if (!wasEmpty.current) return
    /* Two frames, and the second one is not padding.

       Answering the chooser does two things at once: the rules arrive, and —
       because applying a template selects rule 1 — the config panel mounts,
       which narrows the stage. The browser runs animation-frame callbacks
       BEFORE it broadcasts resize observations, so a fit scheduled on the first
       frame starts a glide that the stage's own resize compensation then
       cancels a moment later, leaving the view at the zoom the chooser was
       placed at. Measured: 90%, on a chain that wanted 100.

       On the second frame the panel is mounted, the compensation has run, and
       `fitTo` measures the width the chain is actually being fitted into. */
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        wasEmpty.current = false
        fit()
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [empty, fit])
  /* What the empty policy actually does today, named rather than described.
     `terminal` is resolved below for the card; this reads the same rule, so the
     sentence and the card cannot disagree about the outcome. */
  const fallbackName = DECISION_NAME[(policy.fallback ?? fallbackRule()).decision]
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
  /* `nextOf` has gone with the `else` row it fed. Which rule catches what this
     one lets through is the LINE the chain already draws between the two
     cards; computing it again so a card could print it inside itself was the
     same fact told twice. */

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
          {/* A policy with no rules gets a beginning, not a diagram of nothing.

              The chain drew its full apparatus for the empty case — the arrival
              node, a connector, and the locked default — which is three pieces
              of machinery saying "a sign-in arrives and nothing happens to it".
              True, and a poor first thing to meet: the one action available was
              a 12px `+` on the connector between two cards you did not put
              there, and the default's own card is the piece most likely to be
              mistaken for the rule you are supposed to edit.

              So the empty policy says what it does today and offers the two
              moves worth making. The chain comes back the moment there is a
              rule to draw, which is the same view, arrived at rather than sat
              in. */}
          {policy.rules.length === 0 ? (
            <div className="bb__blank">
              <h2>How would you like to start?</h2>
              {/* The consequence, not a definition. Somebody looking at an
                  empty policy needs to know it is not inert — it is already
                  deciding sign-ins, with the default, and that is the thing a
                  blank canvas hides.

                  The decision keeps its capital: "falls through to let in" is
                  a sentence with a verb where a noun belongs, and reads as a
                  typo. "falls through to the default — Let in" names the thing
                  the chain draws at the bottom, in the words the chain uses. */}
              <p>
                This policy is already running. Until you add a rule, every sign-in falls straight through to the
                default — <strong>{fallbackName}</strong>.
              </p>

              {/* Two ways in, side by side, sized the same.

                  This used to be one brand button reading "Add your first
                  rule", and the other way in — a catalogue of ready-made
                  policies — was a PAGE you passed through before the policy
                  existed. That is the wrong order: you were choosing a template
                  for something unnamed, and once you were here the catalogue
                  was gone for good.

                  So both offers stand at the moment the question is actually
                  asked, and neither is dressed as the primary: a template is
                  the faster road and scratch is the honest one, and which is
                  right depends entirely on whether anything in the catalogue
                  fits. Taking a template writes its rules into THIS policy, so
                  it is an edit like any other and ⌘Z puts it back. */}
              <div className="bb__starts">
                {onUseTemplate && (
                  <button type="button" className="bb__start2" onClick={onUseTemplate}>
                    <span className="bb__start2__mark" aria-hidden>
                      <LayoutTemplate size={20} strokeWidth={1.7} />
                    </span>
                    <strong>Use a template</strong>
                    <span>Ready-made rules for the situations most tenants protect first</span>
                  </button>
                )}
                <button type="button" className="bb__start2" onClick={() => onInsert(0)}>
                  <span className="bb__start2__mark" aria-hidden>
                    <PencilRuler size={20} strokeWidth={1.7} />
                  </span>
                  <strong>Start from scratch</strong>
                  <span>Write the first rule yourself — who it covers, and what happens</span>
                </button>
              </div>
            </div>
          ) : (
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
                      /* One prop, not two. `selected` was a boolean the card
                         derived nothing from; `openPart` is null when this card
                         does not own the panel and the part when it does, so
                         the card cannot claim to be selected while naming no
                         part. */
                      openPart={selection.kind === 'rule' && selection.id === r.id ? selection.part : null}
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
                      onOpen={(part) => onSelect({ kind: 'rule', id: r.id, part })}
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
          )}
        </LayoutGroup>
      </div>

      {/* One dock, bottom centre, for everything that changes the VIEW.

          It was four pills in four corners: history top-left, publishing
          top-right, density bottom-left, zoom bottom-right. Four objects to
          learn the position of, three of which did the same kind of thing —
          none of them changes the policy, they all change what you can see of
          it — and a canvas with a control in every corner has no quiet edge
          left to put a rule near.

          Two pills, not one, and the split is a real distinction rather than a
          decoration. Everything in the right-hand pill is a MOMENTARY press —
          undo it, fit it, zoom it, hide the header — and the pill is a row of
          bare glyphs because that is what a row of verbs looks like. The
          left-hand pill is a MODE: two named states, one of them on, and it
          stays on until you say otherwise. A segmented control that lives
          inside a strip of icon buttons reads as two buttons that happen to
          have words; given its own container it reads as the choice it is.

          Publishing is the exception that proves the gathering, and it has
          left the canvas entirely: Check, What changes, Discard and Review &
          publish act on the POLICY, so they are in the top row beside the
          policy's own name. Mixing "undo" and "publish" into one strip is how
          somebody reaches for the first and finds the second — and a `children`
          slot on this component, which is what put them over the stage, is gone
          with them.

          Two slots because there are two pills — a single list could not say
          which control belonged in which. */}
      <div className="bb__dock">
        {aside}
        <div className="bb__float" role="toolbar" aria-label="View">
          {tools}
          {tools && <span className="bb__float__sep" />}
          <button type="button" className="bb__act" aria-label="Fit the chain in view" title="Fit" onClick={fit}>
            <Maximize2 size={14} strokeWidth={2} />
          </button>
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
