import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { AppWindow, ChevronRight, Maximize, Plus, ZoomIn, ZoomOut } from 'lucide-react'

import { fallbackRule, type Policy } from '../../data'
import { AppLogo } from '../../logos/AppLogo'
import { useCanvasView } from '../canvas-view'
import type { Diagnostic } from '../diagnostics'
import type { NameLookup } from '../predicate-prose'
import { ruleState } from '../rule-form'
import type { Selection, Trace } from './model'
import { UNREACHABLE_CODES } from './parts'
import { RuleCard, TerminalCard } from './RuleCard'
import { BOARD_SKINS, readBoardSkin, writeBoardSkin, type BoardSkin } from './board-skin'
import { SHOWCASE } from '../../showcase'
import { Tip } from '../../kit'

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
  destinationMore = 0,
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
  /** How many more applications the policy protects beyond the one named. */
  destinationMore?: number
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
  /* Each card's element, by RULE ID — not by index.

     It was an array indexed by the rule's position, filled by a ref callback
     that closed over that position. The card is a `motion.div`, and Motion
     calls an external callback ref only when the element mounts (it memoises
     its merged ref and reads the newest callback only then), so every card
     stayed filed under the index it was MOUNTED at. After one reorder, index 0
     named another rule's card, or none, and the next drag moved the wrong card
     or nothing at all (owner, 22 Sep 2026: "can't drag and drop the card
     properly"). A card's id is fixed for as long as the card exists, so the
     mount-time callback is right forever. */
  const cards = useRef(new Map<string, HTMLDivElement>())
  const cardAt = (i: number) => cards.current.get(policy.rules[i]?.id ?? '') ?? null

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
  /* Which skin the canvas wears — a preview switch, remembered per viewer. */
  /* The showcase build is always Centred — the chosen skin — and hides the
     switch (see showcase.ts). */
  const [skin, setSkinState] = useState<BoardSkin>(() => (SHOWCASE ? 'centred' : readBoardSkin()))

  const {
    viewRef,
    panning,
    apply,
    zoomBy,
    fit,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  } = useCanvasView(stage, world, {
    bounds: () => ({ w: world.current?.offsetWidth ?? 0, h: world.current?.offsetHeight ?? 0 }),
    axis: 'width',
    /* A column, read top to bottom: no sideways pan, and always centred. */
    lockX: true,
    /* The dot ground is drawn on the whole region now, behind the floating
       panel too (22 Sep 2026), so it has to follow the pan from there. */
    varsOnParent: true,
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
  /* Everything a drag measures and holds, in WORLD units — the chain's own
     coordinates, before the view's pan and zoom.

     It was kept in screen pixels: the pointer's start and every card's midpoint
     taken from `getBoundingClientRect` at the grab, and never again. So a wheel
     turn mid-drag moved the world and the card under the pointer while the
     numbers stayed put — the card rode off the cursor by the scroll, a zoom
     made it jump, and a slot that was off screen when you grabbed could not be
     reached at all (found by the drag review, 22 Sep 2026). World units do not
     move with the view, so the same pointer means the same place in the chain
     however far it has been scrolled. */
  const dragRef = useRef<{
    /** The held rule, by id, so a change to the list under the drag is noticed. */
    id: string
    from: number
    over: number
    /** Every card's midpoint, from LAYOUT (not from boxes still springing). */
    mids: number[]
    /** The pointer at the grab, and now. */
    startWorldY: number
    lastClientY: number
    /** Where the held card LOOKED at the grab — mid-settle included. */
    startVisual: number
    /** The offset last written to the card. */
    inner: number
    moved: boolean
    el: HTMLDivElement | null
    frame: number
    cancel: () => void
  } | null>(null)
  /* The latest `onMove`, not the one the pointerdown closed over. */
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  /* Where a card's box sits in the world, before any transform — `offsetTop`
     up to the world, which neither the card's own drag offset nor a layout
     animation on its wrapper moves. */
  const worldTop = (el: HTMLElement) => {
    let t = 0
    let n: HTMLElement | null = el
    while (n && n !== world.current) {
      t += n.offsetTop
      n = n.offsetParent as HTMLElement | null
    }
    return t
  }

  /* A screen y as a world y, through the view AS PAINTED — the three custom
     properties the canvas writes when it paints — so it always agrees with the
     boxes the browser reports. `viewRef` runs a frame ahead of the paint while
     a wheel or an auto-scroll is in flight. */
  const toWorldY = (clientY: number) => {
    const st = stage.current
    if (!st) return clientY
    const y = parseFloat(st.style.getPropertyValue('--bb-y')) || 0
    const z = parseFloat(st.style.getPropertyValue('--bb-z')) || viewRef.current.z || 1
    return (clientY - st.getBoundingClientRect().top - y) / z
  }

  /* The held card, under the pointer — and ONLY under the pointer.

     While it is dragged the card is also re-slotted, so the others open a gap
     where it would land. It used to be offset by the whole pointer distance ON
     TOP of that re-slot, so once its wrapper had moved one slot down the card
     sat one slot below the cursor (owner, 22 Sep 2026: "I can't drag and drop
     the card properly"). Now the offset is solved each time from where the card
     actually is: its box without our offset — the slot, plus whatever its
     wrapper is still springing through — against where the pointer says it
     should be. Its wrapper does not animate while held (`layout` off below). */
  const placeHeld = () => {
    const d = dragRef.current
    const el = d?.el
    if (!d || !el) return
    const target = d.startVisual + (toWorldY(d.lastClientY) - d.startWorldY)
    const base = toWorldY(el.getBoundingClientRect().top) - d.inner
    d.inner = target - base
    el.style.transform = `translate3d(0, ${d.inner}px, 0)`
  }
  /* After the render that re-slotted it, before paint. Through a ref so the
     effect keys on the slot alone, not on helpers remade every render. */
  const placeHeldRef = useRef(placeHeld)
  placeHeldRef.current = placeHeld
  useLayoutEffect(() => placeHeldRef.current(), [drag?.over])

  /* The slot the pointer is over: its world y against the OTHER cards'
     midpoints as they were laid out when the drag began. Stable while the cards
     shift under the pointer, which is the moment a live measurement lies. */
  const reslot = () => {
    const d = dragRef.current
    if (!d) return
    const y = toWorldY(d.lastClientY)
    let over = 0
    for (let i = 0; i < d.mids.length; i++) {
      if (i === d.from) continue
      if (y > d.mids[i]) over = i < d.from ? i + 1 : i
    }
    const next = Math.min(Math.max(over, 0), d.mids.length - 1)
    // Only when the answer actually changes. This is the whole saving.
    if (next !== d.over) {
      d.over = next
      setDrag({ from: d.from, over: next })
    }
  }

  /* A drag whose rule is no longer where it was — deleted, moved by a key, or
     undone while held — is dropped where it started rather than committed
     against a list that has changed under it. */
  useEffect(() => {
    const d = dragRef.current
    if (d && policy.rules[d.from]?.id !== d.id) d.cancel()
  }, [policy.rules])

  const onGrip = (index: number) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    /* The release and the click that follows it belong to the grip, so letting
       go over the card's body does not also open the panel. */
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* A synthetic event has no pointer to capture. */
    }
    const held = cardAt(index)
    const mids = policy.rules.map((_, i) => {
      const el = cardAt(i)
      return el ? worldTop(el) + el.offsetHeight / 2 : 0
    })
    /* Read before the transition is cut, so a card grabbed while it is still
       settling from the last drop starts from where it looked. */
    const startVisual = held ? toWorldY(held.getBoundingClientRect().top) : 0
    if (held) {
      held.style.transition = 'none'
      held.style.willChange = 'transform'
      held.style.transform = ''
    }

    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (Math.abs(ev.clientY - d.lastClientY) > 0) d.moved = true
      d.lastClientY = ev.clientY
      placeHeld()
      reslot()
    }

    /* Held near the top or bottom edge, the canvas scrolls — faster the nearer
       the edge — so a slot off screen can be reached without letting go. Runs
       every frame while held, which also keeps the card on the pointer through
       a wheel turn: the view moves, the pointer does not, and this re-solves
       both. */
    const EDGE = 56
    const tick = () => {
      const d = dragRef.current
      if (!d) return
      placeHeld()
      reslot()
      const st = stage.current
      if (st) {
        const r = st.getBoundingClientRect()
        const upBy = r.top + EDGE - d.lastClientY
        const downBy = d.lastClientY - (r.bottom - EDGE)
        if (upBy > 0 || downBy > 0) {
          const speed = Math.min(16, 2 + Math.max(upBy, downBy) / 3)
          apply((v) => ({ ...v, y: v.y + (upBy > 0 ? speed : -speed) }))
        }
      }
      d.frame = requestAnimationFrame(tick)
    }

    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      const d = dragRef.current
      dragRef.current = null
      if (d) cancelAnimationFrame(d.frame)
      const el = d?.el ?? null
      if (el) {
        /* Settles into its slot rather than snapping from wherever the pointer
           let go of it — the slot it is already in, so the distance is only
           the pointer's offset from it. */
        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        el.style.transition = still ? 'none' : 'transform 160ms ease-out'
        el.style.transform = ''
        el.style.willChange = ''
        /* Cleared only if THIS card is not the one being held again. */
        window.setTimeout(() => {
          if (dragRef.current?.el !== el) el.style.transition = ''
        }, 200)
      }
      /* A drag that went anywhere swallows the click it ends in, so it cannot
         select the card (or clear the selection) under the release. */
      if (d?.moved) {
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation()
          ev.preventDefault()
        }
        window.addEventListener('click', swallow, { capture: true, once: true })
        window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
      }
      setDrag(null)
      if (commit && d && d.over !== d.from) onMoveRef.current(d.from, d.over)
    }
    const up = () => finish(true)
    /* A touch the browser takes over, or a pointer lost to the OS, ends the
       drag where it started instead of leaving the card stuck to nothing. */
    const cancel = () => finish(false)

    dragRef.current = {
      id: policy.rules[index]?.id ?? '',
      from: index,
      over: index,
      mids,
      startWorldY: toWorldY(e.clientY),
      lastClientY: e.clientY,
      startVisual,
      inner: 0,
      moved: false,
      el: held,
      frame: 0,
      cancel,
    }
    setDrag({ from: index, over: index })
    placeHeld()

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    dragRef.current.frame = requestAnimationFrame(tick)
  }

  /* Render order during a drag: the dragged card is shown at its target slot
     so the others make room; the card itself follows the pointer. */
  const order = policy.rules.map((_, i) => i)
  /* Two effects stood here: one that PLACED the empty state at a fixed 0.9 by
     measuring `.bb__blank` inside the world, and one that re-fitted the chain
     when the policy stopped being empty. Both are gone with the empty state
     itself — it is a screen of its own now (BoardEmpty.tsx). This component
     mounts with rules to draw, or — after "Start from scratch" — with none,
     where the chain is the start node, one inviting `+` and the default; either
     way the hook's own mount fit is the right and only fit. */

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
      className={`bb__stage ${panning ? 'is-panning' : ''} ${skin === 'workflow' ? 'is-wf' : skin === 'centred' ? 'is-centre' : ''}`}
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
              something on it. See BoardEmpty.tsx.

              One exception since 21 Sep 2026: after "Start from scratch" this
              mounts with NO rules — the start node, one inviting connector and
              the default — and the first rule is added from that `+`. */}
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
            {/* A button now: it opens the Applications pane, the one place on the
                board the policy's applications are edited. The count of the
                rest lives here too — the bar above no longer carries a mark. */}
            <button
              type="button"
              id="bb-start"
              className={`bb__start ${selection.kind === 'apps' ? 'is-on' : ''}`}
              aria-label={
                destination === null
                  ? 'No applications. Choose applications'
                  : `Edit applications: ${destination}${destinationMore > 0 ? ` and ${destinationMore} more` : ''}`
              }
              aria-controls="bb-insp-body"
              aria-expanded={selection.kind === 'apps'}
              onClick={() => onSelect({ kind: 'apps' })}
            >
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
                  <b className="bb__start__at">No applications</b>
                </span>
              ) : (
                <span>
                  A login arrives at <b className="bb__start__at">{destination}</b>
                  {destinationMore > 0 && (
                    <>
                      {' '}and <b className="bb__start__at">{destinationMore} more</b>
                    </>
                  )}{' '}
                  {trace ? (
                    <em>— {trace.ctx.user.name}, {trace.ctx.place.toLowerCase()}</em>
                  ) : policy.rules.length === 0 ? (
                    /* An empty scratch chain has no rules to fall through. */
                    <em>— the default decides it</em>
                  ) : (
                    <em>— falls through the rules below</em>
                  )}
                </span>
              )}
              <ChevronRight size={14} strokeWidth={2} className="bb__start__go" aria-hidden />
            </button>

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
                    /* Not the held card's: it follows the pointer, see `placeHeld`. */
                    layout={!isDragged}
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
                      /* The pill says what; its tooltip says why, which is the
                         only place Lite says it on the canvas. */
                      stateNote={(
                        /* "Unreachable" is explained by the finding that makes it so. */
                        diagsFor(ri).find((d) => UNREACHABLE_CODES.includes(d.code)) ??
                        diagsFor(ri).find((d) => d.severity === 'error') ??
                        diagsFor(ri).find((d) => d.severity === 'warning')
                      )?.title}
                      unreachable={diagsFor(ri).some((d) => UNREACHABLE_CODES.includes(d.code))}
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
                        if (el) cards.current.set(r.id, el)
                        else cards.current.delete(r.id)
                      }}
                    />
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* With no rules this is the chain's only connector, and it is drawn
                in its hover state — see `invite` on `Link`. */}
            <Link lit={litLink(policy.rules.length)} at={policy.rules.length} onInsert={onInsert} last invite={policy.rules.length === 0} />
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

          Two slots, `aside` and `tools`, because they are two groups — a mode
          and a row of presses. Since 21 Sep 2026 both sit in ONE pill, split by
          a hairline, rather than two pills side by side. */}
      {/* `board-dock` is the lite edition's last tour stop: with Check and
          What changes withheld, this strip IS the board's instrument panel. */}
      <div className="bb__dock" data-tour="board-dock">
        {/* Prototype furniture, not a setting: the two skins of this canvas,
            side by side, the way the library pages carry Width. Its own group
            rather than a button in the view toolbar — it changes how the whole
            board looks, where the controls beside it change what you are
            looking at. */}
        {!SHOWCASE && (
        <div className="bb__float bb__skin" role="group" aria-label="Canvas skin">
          {BOARD_SKINS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={skin === o.value}
              className={skin === o.value ? 'is-on' : ''}
              onClick={() => {
                setSkinState(o.value)
                writeBoardSkin(o.value)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        )}
        {/* ONE pill (owner, 21 Sep 2026: "this takes a lot of space — make it
            minimal, it should not take attention when not in use"). Density,
            history and zoom are three groups in it, split by hairlines. */}
        <div className="bb__float bb__dockbar" role="toolbar" aria-label="View">
          {aside}
          {aside && <span className="bb__float__sep" />}
          {tools}
          {tools && <span className="bb__float__sep" />}
          {/* Three buttons and no level (owner, 22 Sep 2026: "the % value is no
              use — use three options, fit, − and +, simple and to the point").
              It was the level alone at rest, with zoom out, zoom in and Reset
              sliding out of it on hover and the dock nudged 12px to keep the
              level still. Fit is the width fit the canvas opens at, so it is
              also the way back after zooming; there is no separate Reset. */}
          <div className="bb__zoomgrp">
            <Tip text="Fit to width" placement="top">
              <button type="button" className="bb__act" aria-label="Fit to width" onClick={fit}>
                <Maximize size={14} strokeWidth={2} />
              </button>
            </Tip>
            <span className="bb__float__sep" />
            <Tip text="Zoom out" placement="top">
              <button type="button" className="bb__act" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}>
                <ZoomOut size={15} strokeWidth={2} />
              </button>
            </Tip>
            <Tip text="Zoom in" placement="top">
              <button type="button" className="bb__act" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>
                <ZoomIn size={15} strokeWidth={2} />
              </button>
            </Tip>
          </div>
        </div>
      </div>
    </div>
  )
}

/* A connector with an insert point. Zapier's `+` between steps, with one
   difference: it says where the rule will land, because under first-match
   the position IS most of the rule. */
function Link({
  lit,
  at,
  onInsert,
  last,
  invite,
}: {
  lit: string
  at: number
  onInsert: (at: number) => void
  last?: boolean
  /* The empty chain's one connector (a scratch policy): drawn as if hovered —
     the `+` coloured, the line lit, the words showing — so the way to add the
     first rule is on screen without anybody having to find it (owner, 21 Sep
     2026), ripple included — it keeps going until the first rule exists. */
  invite?: boolean
}) {
  return (
    <div className={`bb__link ${lit} ${invite ? 'is-invite' : ''}`}>
      <button
        type="button"
        className="bb__link__add"
        /* Only the last one is an anchor. The demo's first step says "add a
           rule", and a chain of six would otherwise offer six identical
           targets with the spotlight landing on whichever came first in the
           DOM — which is the top of the chain, the one place a rule you are
           being taught to write should NOT go. */
        data-tour={last ? 'add-rule' : undefined}
        aria-label={invite ? 'Add the first rule' : last ? 'Add a rule at the end' : `Insert a rule at position ${at + 1}`}
        onClick={(e) => {
          e.stopPropagation()
          onInsert(at)
        }}
      >
        <Plus size={12} strokeWidth={2.4} />
      </button>
      {/* On the invite the words are the call to action, so they press the same
          `+` — and are hidden from assistive tech, which already hears them as
          the button's name. */}
      <span
        className="bb__link__hint"
        aria-hidden={invite || undefined}
        onClick={
          invite
            ? (e) => {
                e.stopPropagation()
                onInsert(at)
              }
            : undefined
        }
      >
        {invite ? 'Add the first rule' : last ? 'Add a rule here' : `Insert here — becomes rule ${at + 1}`}
      </span>
    </div>
  )
}
