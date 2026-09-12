import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'

import { Button } from '../kit'
import { blankRule, type Policy, type Rule } from '../data'
import { ruleAt, type Part, type Selection } from '../screens/board/model'
import { BoardTourHero } from './BoardTourArt'
import { DemoButton } from './DemoButton'
import { measureAnchor, place, type Rect } from './spotlight'
import {
  BOARD_STOPS,
  conditionPatch,
  markBoardTourSeen,
  thenPatch,
  whoPatch,
  type BoardStopId,
  type TaskCtx,
} from './board-tour'

/* -----------------------------------------------------------------------------
   The board's guided demo.

   Five spotlit steps, each with a task the reader performs on their own draft.

   **It opens on step 1.** There was a contents card in front of this — six
   tiles headed "the policy board, in a nutshell", with the walkthrough behind a
   button on it. It went, and the reason is worth keeping: a summary of five
   steps, shown immediately before those five steps, is the same information
   twice, and the first copy is the one nobody can act on. The reader arrives
   wanting to know what this screen is; the fastest honest answer is the first
   card of a thing that shows them, not a page about it.

   What that card did carry is the offer to watch instead of doing, and that
   survives as a control rather than as a screen — see `DemoButton`, which sits
   on every card's illustration and on the board's own top row.

   What makes this different from the trail's tour is that it WATCHES. Each step
   reads the draft every render and reports whether its task has happened, so
   the tick appears when the reader does the thing themselves, and disappears
   again if they undo it. Nothing is remembered; the policy is the record.

   --- The three borrowed decisions ------------------------------------------

   Taken from `Tour.tsx` rather than re-argued, because the reasons do not
   change on a different screen:

   · **The lit element stays interactive.** The scrim dims and does not block.
     The point here is that the reader clicks the real control — a tour that
     covered it would be asking for a task it had made impossible.

   · **It never auto-advances.** Even when a task completes. Finishing the task
     is not the same as finishing reading, and a card that leaves as you succeed
     takes the explanation with it.

   · **Non-modal, and it does not trap focus.** `aria-modal="false"`, a polite
     live region per step, `aria-describedby` on the lit element, and Escape
     bound to the window. The reader has to be able to reach the control the
     card points at; holding focus inside the card would make that a lie.

   --- The one new hazard -----------------------------------------------------

   The host passes its mutators as inline arrows, so their identity changes
   every render. Held in a ref, so the effects that drive the board can depend
   on the STEP alone. Passed directly they would re-fire on every render, which
   drives the board, which re-renders, which re-fires them — the trail's tour
   shipped that bug once and advanced four stops on one click.
   -------------------------------------------------------------------------- */

/* The card's width and where the beak sits. Its HEIGHT is measured rather than
   declared — see `cardH`.

   `lead` keeps the beak in the top third, which is where the anchor usually is
   on a panel that runs the height of the screen. */
const CARD = { w: 384, lead: 168 }
/* A starting guess for the height, used for the single frame before the card
   has been measured. Roughly what a mid-length step comes to: 186 of hero, ~180
   of copy, a task strip and a footer. */
const CARD_H0 = 470
const COPY_ID = 'btb-copy'

/* What the tour is allowed to do to the board.

   Deliberately small, and every member is something a control on the board
   already does — the demo drives the product, it does not have a back door
   into it. `addRule` returns nothing: the board selects what it inserts, and
   the tour reads that selection back, so there is one story about which rule
   is current rather than two. */
export interface BoardTourHost {
  draft: Policy
  selection: Selection
  addRule: (rule: Rule) => void
  patchRuleById: (id: string, patch: Partial<Rule>) => void
  select: (s: Selection) => void
  /* How much of each rule the chain is showing, and the way to change it —
     step five. */
  density: 'outline' | 'detailed'
  setDensity: (d: 'outline' | 'detailed') => void
  /* Whether the review dialog is up, and the way to raise it — step six.

     Raise ONLY. There is no `confirm` here and there must not be: this is
     somebody's real policy, and a walkthrough that published it on their behalf
     would have done the one thing on this screen they cannot undo from here. */
  review: boolean
  openReview: () => void
}

/* Which part each step wants focused in the panel. The panel shows all three
   sections at once — `part` only tints the heading and marks the card — so
   this is emphasis, not navigation.

   Keyed by the step's ID rather than by its index, because the fifth step has
   two variants and an index-keyed table would describe whichever slid into the
   slot. */
const PART_FOR_STOP: Partial<Record<BoardStopId, Part>> = { who: 'who', when: 'when', then: 'when' }

export function BoardTour({
  open,
  onClose,
  onWatch,
  host,
}: {
  open: boolean
  onClose: () => void
  /** Hand over to the recording. Owned by the board, so it outlives the tour. */
  onWatch: () => void
  host: BoardTourHost
}) {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [ruleId, setRuleId] = useState<string | null>(null)
  const [decisionAtStart, setDecisionAtStart] = useState<string | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  /* The card's real height, measured.

     It was a constant, and a constant cannot be right: the copy is a different
     length on every step, so the card is a different height on every step. The
     number is what the viewport clamp in `place` subtracts, so being 17px short
     — which it was — puts exactly 17px of the last step off the bottom of the
     screen. Measured, it is right for all six. */
  const [cardH, setCardH] = useState(CARD_H0)
  const card = useRef<HTMLDivElement | null>(null)

  /* The host, in a ref. See the hazard note at the top of this file. */
  const h = useRef(host)
  h.current = host

  /* One list, on every edition. There used to be two — the fifth step pointed
     at readings the shipping edition withholds — and the two steps that
     replaced it are true everywhere. See the note in board-tour.ts. */
  const stops = BOARD_STOPS
  const at = Math.min(i, stops.length - 1)
  const stop = stops[at]
  const last = at === stops.length - 1

  /* The rule the demo is building, resolved fresh from the draft every render.

     From the id rather than from the selection, because the reader is free to
     click another card mid-tour and the step's tick must keep answering for the
     rule the step is about. Resolving each render is also what makes an undo
     un-tick a step: when the rule goes, this goes with it. */
  const rule = useMemo(
    () => (ruleId ? (host.draft.rules.find((r) => r.id === ruleId) ?? null) : null),
    [ruleId, host.draft],
  )

  const ctx: TaskCtx = {
    draft: host.draft,
    rule,
    density: host.density,
    review: host.review,
    decisionAtStart,
  }
  const done = stop.task.done(ctx)

  useEffect(() => {
    if (!open) return
    setI(0)
    setRuleId(null)
    setDecisionAtStart(null)
  }, [open])

  /* Adopt whatever rule the board has selected, once.

     Step 1 can be answered three ways — the empty board's chooser, a `+` on a
     connector, or the card's own button — and all three go through the board's
     `insert`, which selects what it made. Watching the SELECTION rather than
     the rule count is what makes the tour agnostic about which was used, and it
     means a reader who arrives with a rule already selected starts step 2
     pointed at their own work rather than at one the tour made them add. */
  useEffect(() => {
    if (!open || ruleId) return
    if (host.selection.kind === 'rule') {
      setRuleId(host.selection.id)
      return
    }
    /* Past step 1 with nothing selected, adopt the first rule.

       Steps two to four talk about a rule and anchor to the panel that edits
       one, and the panel is unmounted while nothing is selected — so on a
       policy that already has rules, a reader who opens the walkthrough without
       clicking a card first would meet three steps in a row pointing at
       nothing. Rule one is the honest choice: it is the one a sign-in meets
       first. */
    if (i > 0 && host.draft.rules.length > 0) setRuleId(host.draft.rules[0].id)
  }, [open, ruleId, host.selection, i, host.draft])

  /* Drive the board into the state the step is about — the panel open on the
     right rule, with the right section emphasised. Depends on the STEP and the
     rule id, never on the host: see the hazard note. */
  useEffect(() => {
    if (!open) return
    const part = PART_FOR_STOP[stops[Math.min(i, stops.length - 1)].id]
    if (part && ruleId) h.current.select(ruleAt(ruleId, part))
  }, [open, i, ruleId, stops])

  /* What the outcome was when the Then step opened.

     The step asks for a CHANGE, and a change needs a baseline. Captured on
     arrival rather than on mount, so going Back and returning re-baselines
     against what is there now — otherwise stepping away and back would leave
     the step permanently ticked by a change made two steps ago. */
  useEffect(() => {
    if (!open) return
    if (stops[Math.min(i, stops.length - 1)].id !== 'then') return
    setDecisionAtStart(h.current.draft.rules.find((r) => r.id === ruleId)?.decision ?? null)
  }, [open, i, ruleId, stops])

  /* --- Measuring the anchor --------------------------------------------------

     Polled, not measured once, and that is a concession to what this surface
     is. The inspector slides in over 200ms, the stage pans under the pointer,
     the panel can be dragged wider, and every one of those moves the thing the
     spotlight is sitting on. A rect taken once per step would be wrong for most
     of the step.

     Cheap — one `querySelector` and one `getBoundingClientRect` — and it only
     sets state when the box has actually moved, so a still screen re-renders
     nothing. */
  const measure = useCallback(() => {
    /* The card first: its height feeds the clamp that places it, and reading it
       in the same pass as the anchor keeps the two from disagreeing by a frame.
       Guarded on a whole pixel so a sub-pixel reflow cannot start a render
       loop. */
    const el = card.current
    if (el) {
      const h = el.getBoundingClientRect().height
      if (h > 0) setCardH((prev) => (Math.abs(prev - h) > 1 ? h : prev))
    }

    const next = measureAnchor(stop.anchorAlt) ?? measureAnchor(stop.anchor)
    setRect((prev) => {
      if (prev === next) return prev
      if (!prev || !next) return next
      const same =
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.height - next.height) < 0.5
      return same ? prev : next
    })
  }, [stop.anchor, stop.anchorAlt])

  useLayoutEffect(() => {
    if (!open) {
      setRect(null)
      return
    }
    const frame = requestAnimationFrame(measure)
    const poll = window.setInterval(measure, 260)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.clearInterval(poll)
      window.removeEventListener('resize', measure)
    }
  }, [open, measure])

  /* The card explains the lit element, so the element says so itself — for
     anybody who arrives at it by Tab rather than by reading the card. Removed
     the moment the step moves on, so no control is left describing itself with
     a card that has gone. */
  useEffect(() => {
    if (!open) return
    const name =
      stop.anchorAlt && document.querySelector(`[data-tour="${stop.anchorAlt}"]`) ? stop.anchorAlt : stop.anchor
    if (!name) return
    const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
    if (!el) return
    const had = el.getAttribute('aria-describedby')
    el.setAttribute('aria-describedby', COPY_ID)
    return () => {
      if (had) el.setAttribute('aria-describedby', had)
      else el.removeAttribute('aria-describedby')
    }
  }, [open, stop.anchor, stop.anchorAlt])

  /* --- The verbs ------------------------------------------------------------- */

  const leave = useCallback(() => {
    markBoardTourSeen()
    onClose()
  }, [onClose])

  const next = useCallback(() => {
    if (last) return leave()
    setI((n) => n + 1)
  }, [last, leave])

  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), [])

  /* Do the step's task, through the board's own writers.

     Each branch is the same edit the reader would have made by hand, so what
     lands is an ordinary change: it goes on the history, undo puts it back, and
     nothing is saved until publish. */
  const doIt = useCallback(() => {
    const api = h.current
    const id = stops[Math.min(i, stops.length - 1)].id
    if (id === 'rule') return api.addRule(blankRule())

    if (id === 'tools') return api.setDensity('detailed')
    if (id === 'review') return api.openReview()

    const r = api.draft.rules.find((x) => x.id === ruleId)
    if (!r) return
    if (id === 'who') return api.patchRuleById(r.id, whoPatch(r))
    if (id === 'when') return api.patchRuleById(r.id, conditionPatch(r))
    if (id === 'then') return api.patchRuleById(r.id, thenPatch(r))
  }, [i, ruleId, stops])

  /* Bound once per opening rather than once per render, so a keypress cannot
     land on a listener that is about to be replaced. */
  const keys = useRef({ next, back, leave })
  keys.current = { next, back, leave }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      /* The player owns every key while it is up — it is a real modal, and
         arrowing between steps behind it, or closing the whole walkthrough with
         Escape, would both be surprises. It binds in the capture phase, so by
         the time this listener runs it has already had its say; this is the
         belt to that pair of braces. */
      if (document.querySelector('.dpl')) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        keys.current.leave()
      }
      if (e.key === 'ArrowRight') keys.current.next()
      if (e.key === 'ArrowLeft') keys.current.back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) card.current?.focus()
  }, [open, i])

  if (!open) return null

  const pos = place(rect, { w: CARD.w, h: cardH, lead: CARD.lead })

  return (
    <div className="btr btb">
      <p className="u-sr-only" aria-live="polite">
        {`Step ${at + 1} of ${stops.length}. ${stop.heading}. ${stop.body} ${done ? stop.task.didIt : stop.task.ask}`}
      </p>

      {/* The dim, with a hole in it. `pointer-events` is off on the whole layer
          except the card, so the lit control — and everything else — stays
          clickable underneath. That is what makes the task possible. */}
      <svg className="btr__scrim" aria-hidden>
        <defs>
          <mask id="btb-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            {rect && (
              <motion.rect
                initial={false}
                animate={{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
                rx="12"
                fill="#000"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" mask="url(#btb-hole)" />
      </svg>

      {rect && (
        <motion.span
          className="btr__ring"
          aria-hidden
          initial={false}
          animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
        />
      )}

      {/* Keyed, not wrapped in AnimatePresence. `mode="wait"` gates the incoming
          step on the outgoing one finishing its exit, and an exit does not
          finish in a backgrounded tab — which left the trail's tour frozen on a
          step Next had already moved past. React swaps the card; motion
          animates only what arrives. */}
      <div className="btr__cardslot">
        <motion.div
          key={stop.id}
          ref={card}
          tabIndex={-1}
          role="dialog"
          aria-modal="false"
          aria-label={`Board walkthrough, step ${at + 1} of ${stops.length}`}
          className={`btr__card btb__card ${pos.centred ? 'is-centred' : ''} ${pos.side !== 'none' ? `is-${pos.side}` : ''}`}
          /* Always positioned from the numbers, centred or not — see the note
             in `place`. A CSS transform here would be overwritten by motion. */
          style={{ top: pos.top, left: pos.left }}
          initial={{ opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
        >
          {pos.side !== 'none' && <span className="btr__beak" aria-hidden style={{ top: pos.caret }} />}

          <button type="button" className="btr__x" aria-label="Leave the walkthrough" onClick={leave}>
            <X size={14} strokeWidth={2} />
          </button>

          <BoardTourHero id={stop.id} />

          <div className="btr__body" id={COPY_ID}>
            {/* The count and the offer to watch instead, on one line — the two
                halves of "where am I, and how long is this going to take". It
                sat on the illustration and collided with four of the five
                figures, which all have something in their top-left corner. */}
            <div className="btb__countrow">
              <span className="btr__count">
                Step {at + 1} of {stops.length}
              </span>
              <DemoButton onClick={onWatch} />
            </div>
            <h2>{stop.heading}</h2>
            <p>{stop.body}</p>
          </div>

          <TaskStrip
            done={done}
            ask={stop.task.ask}
            didIt={stop.task.didIt}
            doLabel={stop.task.doLabel}
            onDo={doIt}
            reduce={!!reduce}
          />

          <footer className="btr__foot">
            <span className="btr__dots" aria-hidden>
              {stops.map((s, n) => (
                <i key={s.id} className={n === at ? 'is-on' : n < at ? 'is-done' : ''} />
              ))}
            </span>
            <button type="button" className="btr__skip" onClick={leave}>
              Skip
            </button>
            <Button variant="ghost" size="sm" icon={ArrowLeft} disabled={at === 0} onClick={back}>
              Back
            </Button>
            {/* Never disabled, even with the task outstanding. The card reports
                the state of the task; it does not hold the door. */}
            <Button
              variant="primary"
              size="sm"
              iconRight={last ? undefined : ArrowRight}
              icon={last ? Check : undefined}
              onClick={next}
            >
              {last ? 'Done' : 'Next'}
            </Button>
          </footer>
        </motion.div>
      </div>
    </div>
  )
}

/* --- The task strip -----------------------------------------------------------

   The one part of the card that is not a tour. It has two states and the
   difference between them is the whole idea: an open ring and an imperative
   while the task is outstanding, a tick and a consequence once it is done.

   The done copy says what the reader has just CAUSED rather than congratulating
   them — "everyone outside that group now skips this rule" is the lesson, and
   "Nice work" is the thing that gets read once and never again.
   -------------------------------------------------------------------------- */
function TaskStrip({
  done,
  ask,
  didIt,
  doLabel,
  onDo,
  reduce,
}: {
  done: boolean
  ask: string
  didIt: string
  doLabel: string
  onDo: () => void
  reduce: boolean
}) {
  return (
    <div className={`btb__task ${done ? 'is-done' : ''}`}>
      <span className="btb__mark" aria-hidden>
        {done ? (
          <motion.span
            initial={reduce ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
          >
            <Check size={12} strokeWidth={3} />
          </motion.span>
        ) : null}
      </span>
      <p>{done ? didIt : ask}</p>
      {!done && (
        <button type="button" className="btb__doit" onClick={onDo}>
          {doLabel}
        </button>
      )}
    </div>
  )
}
