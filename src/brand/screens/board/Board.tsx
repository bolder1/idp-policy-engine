import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { AppWindow, Minus, Plus, RotateCcw } from 'lucide-react'

import { fallbackRule, type Policy } from '../../data'
import { AppLogo } from '../../logos/AppLogo'
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
   coordinate for a rule. The column is always centred; a drag or the wheel
   moves it up and down, zoom scales it, and reset returns the zoom. That is the
   whole canvas.
   -------------------------------------------------------------------------- */

const ZMIN = 0.5
const ZMAX = 1.4
const STEP = 220 // ms between rule lights in a rehearsal


export function Board({
  policy,
  destination,
  destinationAppId,
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
  tools,
  aside,
}: {
  policy: Policy
  /* Where a sign-in is arriving, in words — the application this policy
     protects, or `every application` for the tenant default.

     A PROP rather than a `useBrand()` of its own, which is the one thing that
     keeps this component a pure function of what it is given: the stage reads
     policies, not the store, and `resolve` is already threaded the same way
     from the same caller. `NameLookup` could not carry it — its `RefKind` is
     the five things a CONDITION can point at, and an application is not one of
     them.

     `null` is a case, not a gap. A policy that names no application is a set of
     rules no sign-in can ever reach, and the pill says so rather than opening
     the chain with an arrival that never happens. */
  destination: string | null
  /** The first application's id, when there is one, for its mark in the pill. */
  destinationAppId?: string | null
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
  /* `reserveOnOpen` stood here: a width to hold back on the opening Fit, for a
     panel that floated over the stage and would otherwise cover the right-hand
     end of a chain that had just been centred without it. The panel is a column
     now, so the stage's own width already excludes it and there is nothing to
     reserve. */
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
    zoomBy,
    resetZoom,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  } = useCanvasView(stage, world, {
    bounds: () => ({ w: world.current?.offsetWidth ?? 0, h: world.current?.offsetHeight ?? 0 }),
    axis: 'width',
    /* A column, read top to bottom: no sideways pan, and always centred. */
    lockX: true,
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
  /* Two effects stood here: one that PLACED the empty state at a fixed 0.9 by
     measuring `.bb__blank` inside the world, and one that re-fitted the chain
     when the policy stopped being empty. Both are gone with the empty state
     itself — it is a screen of its own now (BoardEmpty.tsx), so this component
     only ever mounts with rules to draw, and the hook's own mount fit is the
     right and only fit. */

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
          {/* The empty policy is not drawn here any more.

              It used to be a `.bb__blank` panel inside `.bb__world` — which
              meant the first thing anybody met on a new policy could be panned
              off screen, zoomed to 50%, and wheel-scrolled by a handler that
              calls preventDefault unconditionally. A canvas is the right
              surface for a chain of rules and the wrong one for a question with
              two answers.

              `BoardBuilder` renders `BoardEmpty` in this component's place
              while there are no rules, so the canvas exists only once there is
              something on it. See BoardEmpty.tsx. */}
          <div className="bb__chain">
            {/* The application, said where the sign-in arrives.

                The pill opened the chain with "a sign-in arrives" and never
                said WHERE. That is the fact which makes every rule under it
                mean something — a policy is written against an application, and
                without one named here the chain is a decision about nothing in
                particular. The bar 48px above carries the application too, as a
                MARK on the policy's own chip: it says which policy you have
                open. This says what is about to be decided, in words, at the
                head of the thing deciding it.

                No mark here, for that reason. Two 16px logos in one vertical
                column 48px apart is the stutter `BoardBar` deleted when it
                merged the application's crumb into the policy's chip, and this
                pill's left slot is spoken for by something that moves — the
                token flies out of it onto a card during a rehearsal.

                THREE CASES, and the third is not a missing value.

                An application named is named. The tenant default covers all of
                them: `any application`, not the list's `Every application`,
                because a sign-in is to one application and "arrives at every
                application" is not a thing that happens. And a policy naming NO
                application is a set of rules no sign-in can ever reach — so the
                pill stops claiming an arrival, drops the pulse that animates
                one, and says what is true instead. The bar says the same in a
                crumb; this says it pointing at the chain the sentence is about,
                which is the half the bar cannot reach. */}
            <div className="bb__start">
              {/* The application's own mark, where a pulsing orange dot used to
                  be.

                  The dot was the arrival — brand-coloured, ringing twice a
                  second, on the argument that a sign-in reaching this chain is
                  the event the canvas is about. It was the only orange on the
                  board at rest, it moved forever, and it said nothing you could
                  not read in the sentence beside it. The logo is in the same
                  slot and answers a question the sentence only names: WHICH
                  application, recognisable before the words are.

                  The travelling token is untouched. That one is orange because
                  it is a single moving thing during a rehearsal, which is
                  exactly what the accent is for. */}
              {landedOn === null && trace && inAudience ? (
                <motion.span layoutId="bb-token" className="bb__token" aria-hidden transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
                  ●
                </motion.span>
              ) : destinationAppId ? (
                <AppLogo appId={destinationAppId} size={18} />
              ) : (
                <span className="bb__startmark" aria-hidden>
                  <AppWindow size={13} strokeWidth={1.8} />
                </span>
              )}
              {destination === null ? (
                <span>
                  <b className="bb__start__at">No application</b> <em>— no sign-in ever reaches these rules</em>
                </span>
              ) : (
                <span>
                  A sign-in arrives at <b className="bb__start__at">{destination}</b>{' '}
                  {trace ? <em>— {trace.ctx.user.name}, {trace.ctx.place.toLowerCase()}</em> : <em>— falls through the rules below</em>}
                </span>
              )}
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
      {/* `board-dock` is the lite edition's last tour stop: with Check and
          What changes withheld, this strip IS the board's instrument panel. */}
      <div className="bb__dock" data-tour="board-dock">
        {aside}
        <div className="bb__float" role="toolbar" aria-label="View">
          {tools}
          {tools && <span className="bb__float__sep" />}
          {/* Zoom out, the level, zoom in, reset — and nothing else.

              Fit stood first. It measured the chain and re-framed it, which on a
              column that is already centred and cannot be panned sideways is a
              reset with a surprise in it: it also scrolled you back to the top.
              Reset keeps your place. */}
          <button type="button" className="bb__act" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.15)}>
            <Minus size={14} strokeWidth={2} />
          </button>
          {/* Written by `paint`, not by a render. `aria-live` is deliberately
              absent: the value changes on every frame of a zoom, and a live
              region that announces sixty times a second announces nothing. */}
          <span className="bb__zoom" ref={zoomLabel}>
            {Math.round(viewRef.current.z * 100)}%
          </span>
          <button type="button" className="bb__act" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.15)}>
            <Plus size={14} strokeWidth={2} />
          </button>
          <button type="button" className="bb__act" aria-label="Reset zoom" title="Reset zoom" onClick={resetZoom}>
            <RotateCcw size={14} strokeWidth={2} />
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
        /* Only the last one is an anchor. The demo's first step says "add a
           rule", and a chain of six would otherwise offer six identical
           targets with the spotlight landing on whichever came first in the
           DOM — which is the top of the chain, the one place a rule you are
           being taught to write should NOT go. */
        data-tour={last ? 'add-rule' : undefined}
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
