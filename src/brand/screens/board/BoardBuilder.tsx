import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsDownUp, ChevronsUpDown, Copy, Keyboard, ListOrdered, PanelRightClose, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'

import { Button, Modal, Tip } from '../../kit'
import { appsOf, fallbackRule, reidRule, blankRule, type Policy, type Rule, type Scenario } from '../../data'
import { commitToast, committed, differsFromLive, hasUnsavedChanges, openForEditing, type CommitIntent } from '../../policy-draft'
import { useBrand, useNameLookup } from '../../store'
import { TemplateSheet } from '../../create/TemplateSheet'
import { ReviewDialog } from '../builder-dialogs'
import { CommandBar, type Cmd } from '../command-bar'
import { BoardBar, BoardBarActions } from './BoardBar'
import { BoardEmpty } from './BoardEmpty'
import { BoardSheet } from './BoardSheet'
import { buildTemplate, templateBlocker } from './apply-template'
import { diagnose, shadowedBy } from '../diagnostics'
import { runGauntlet } from '../gauntlet'
import { compare, sweep } from '../impact-arena'
import { canRedo, canUndo, commit, historyKey, historyOf, redo, revertTo, undo, type History } from '../history'
import { walk, type SimEnv } from '../simulate'
import { Board } from './Board'
import { Inspector } from './Inspector'
import { nextPart, patchRule as patchOne, ruleAt, type Part, type Selection, type Tab, type Trace } from './model'
import { copyName } from './parts'
import { boardShortcuts, chord, isMacPlatform } from './shortcuts'

import { boardTourSeen } from '../../tour/board-tour'

import { useLeaveGuard } from '../../leave-guard'
import './board.css'

/* Lazy, the way the trail loads its own.

   The walkthrough carries five animated figures and six thumbnails, and the
   overwhelming majority of arrivals at this screen are somebody who has taken
   it already — `boardTourSeen` short-circuits before any of it is fetched. */
const BoardTour = lazy(() => import('../../tour/BoardTour').then((m) => ({ default: m.BoardTour })))
/* The player is lazy for a stronger reason than the tour is: it exists to load
   a two-minute video, and the code that does it should not be in the bundle of
   somebody who never presses play. `DemoButton` is NOT lazy — it is a 28px
   control on the top row of every visit, and suspending that would flash. */
const DemoPlayer = lazy(() => import('../../tour/DemoPlayer').then((m) => ({ default: m.DemoPlayer })))

/* -----------------------------------------------------------------------------
   The board's host — state, and the two regions it feeds.

   Owns the draft (a history, so undo is one keystroke), the selection, the
   inspector's width and the rehearsal in flight. Everything the stage and the
   inspector do comes back here as a patch to the draft, which is the only way
   either of them changes anything.
   -------------------------------------------------------------------------- */

/* The bindings the sheet lists live in shortcuts.ts, filtered by edition and
   spelt for the platform. If a binding changes in the handler below and not
   there, the sheet lies — and a lying shortcut sheet is worse than none. */
const MAC = isMacPlatform()

/* Focus a control that is about to exist, or already does.

   Several edits here remove the control that had focus — deleting a card,
   closing the panel, the empty board giving way to the chain — and focus fell
   to <body>, where Backspace and the arrow keys act on the board. One frame
   for React to draw the new control, and a second try in case an animation
   or a closing dialog put focus somewhere else first. */
/* `force` retries even when focus is on something else — for a control that
   is still mounted and still focused after it did its job (the `+` that added
   the first rule), where waiting for <body> would wait forever. */
function focusSoon(find: () => HTMLElement | null, force = false) {
  const go = () => {
    const el = find()
    if (el && el.isConnected) el.focus({ preventScroll: false })
  }
  window.requestAnimationFrame(go)
  window.setTimeout(() => {
    const active = document.activeElement
    if (force || !active || active === document.body) go()
  }, 150)
}
const byId = (id: string) => () => document.getElementById(id)

/* Referentially stable "no overrides", so the deck is not re-dealt on every
   render for a tenant that has overruled nothing. */
const NO_OVERRIDES: Record<string, never> = {}

/* Controls that take keys of their own. A rule shortcut never fires from inside
   one — Backspace in a picker is not "delete this rule". */
const OWNS_KEYS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="listbox"], [role="menu"], [role="dialog"]'

export function BoardBuilder({
  policyId,
  openSheet,
}: {
  policyId: string
  openSheet?: Tab
}) {
  const store = useBrand()
  /* The edition, which this surface ignored entirely.

     The trail gates eleven things on it; the board gated none, so Lite showed
     the palette, the publish gate and the whole Check/Impact apparatus that
     Lite exists to withhold — a demo of the paid tier, reachable from the Lite
     tenant by pressing one button on the policy bar. */
  const features = store.features
  const saved = store.policyById(policyId)
  const resolve = useNameLookup()

  /* Opens on the saved draft when there is one, not on the live rules. */
  const [hist, setHist] = useState<History>(() => historyOf(saved ? openForEditing(saved) : ({} as Policy)))
  const [selection, setSelection] = useState<Selection>({ kind: 'none' })
  /* "Start from scratch" was pressed on the empty board.

     It used to insert a blank "New rule" and open it, so the first thing a
     scratch policy showed was a rule nobody had written, already Ready (owner,
     21 Sep 2026: "don't add the first rule — let the user add it; show the first
     and last node and make the hover state active so they know how"). It now
     only swaps the chooser for the canvas: the start node, the default card,
     and the one connector between them drawn in its hover state. The first rule
     is added from that `+`, like every rule after it.

     Sticky for the visit, so deleting or undoing back to no rules keeps the
     canvas rather than throwing the chooser back up mid-edit. */
  const [scratch, setScratch] = useState(false)
  /* The last policy handed to the history, and the history as last rendered —
     both for Undo on a removal toast, which acts seconds after the removal. */
  const lastCommitted = useRef<Policy | null>(null)
  const histNow = useRef(hist)
  useEffect(() => {
    histNow.current = hist
  }, [hist])
  /* Whether this builder is still on screen. The toast outlives it by up to six
     seconds, and an Undo pressed from another page has nothing to restore. */
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const [trace, setTrace] = useState<Trace | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [review, setReview] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [cmd, setCmd] = useState(false)
  const [keys, setKeys] = useState(false)
  /* Seeded from the route, not forced by it.

     A caller that knows why you are coming — "this policy has four holes" —
     lands you on the answer. `useState`'s initialiser rather than an effect,
     so it opens with the first paint and closing it does not fight a prop that
     is still set: after that the sheet is yours. */
  const [sheet, setSheet] = useState<Tab | null>(openSheet ?? null)
  /* The template catalogue, offered from the empty board.

     It used to be a page you met BEFORE the policy existed — you browsed
     templates, chose one, and only then were asked what the policy was called.
     Here the policy is already real, so taking a template is an ordinary edit:
     it goes through `commitDraft` like every other one, undo puts it back, and
     nothing is saved until you publish. */
  const [picking, setPicking] = useState(false)
  /* The guided demo — see src/brand/tour/board-tour.ts. */
  const [tour, setTour] = useState(false)
  /* And the recording, which is NOT inside the tour.

     It is reachable from the bar whether or not a walkthrough is running, and
     it has to outlive one — closing the player must put you back on the step
     you were reading, not end the tour. Owning it here is what makes both
     true. */
  const [demo, setDemo] = useState(false)
  const [inspOpen, setInspOpen] = useState(true)
  /* The inspector's width, dragged rather than fixed.

     400px was chosen for the condition rows and it is right for them and wrong
     for everything else — a long rule name, a chain of four methods, a group of
     six conditions all want more, and a stage you are arranging wants less.
     The number was never going to suit both regions at once, so it stops being
     a constant and becomes a handle. */
  /* 560, and the number follows the row rather than the other way round.

     A condition is a joiner, an attribute, an operator, a value and a delete on
     ONE line. Measured, that wants about 510px INSIDE the block — the container
     query is on the content box, so the block's own 12px padding comes off
     first — which makes a 560px panel. At 480 the attribute picker elides to
     "Group M…" and the operator to "not in z…", which is a row nobody can read
     and therefore not a row worth keeping on one line.

     The old 400 was chosen when a condition was a run of chips that wrapped
     anyway, so no width had ever been right. Below the breakpoint the row folds
     to two deliberate lines instead of crushing — that is what the named grid
     areas at the foot of board.css are for. The grip moves it 320 to 720, and
     closing the panel gives the canvas the whole region. */
  const [inspW, setInspW] = useState(560)
  /* How much of itself every card shows, and the per-card exceptions.

     Two pieces of state rather than one, because they answer different
     questions. `density` is the chain-wide default — "show me the order" or
     "show me the rules" — and it is what the toolbar switch sets. `folds` holds
     the cards somebody has since opened or closed by hand, keyed by rule id so
     an override survives a reorder, a rename and an undo.

     Flipping the switch CLEARS the overrides, deliberately. The alternative is
     a chain where "Detailed" leaves three rules folded because of clicks made
     several minutes ago, and no way to say "all of them" except by finding and
     unfolding each one. A chain-wide control that cannot actually reach the
     whole chain is not worth having. */
  /* Outline, not detailed.

     The first question a policy answers is what order it decides in, and the
     chain is the only surface that shows it. Opening every card fully meant a
     four-rule policy did not fit on a screen — so the thing the canvas exists
     to show was the thing you had to scroll to see, and the conditions, which
     the panel edits properly anyway, were what filled the space.

     Unfolding is one click on a card, or one on the toolbar for all of them. */
  const [density, setDensity] = useState<'outline' | 'detailed'>('outline')
  const [folds, setFolds] = useState<Record<string, boolean>>({})
  const expandedOf = (ruleId: string) => folds[ruleId] ?? density === 'detailed'
  const toggleExpand = (ruleId: string) => setFolds((f) => ({ ...f, [ruleId]: !expandedOf(ruleId) }))
  const setChainDensity = (d: 'outline' | 'detailed') => {
    setDensity(d)
    setFolds({})
  }
  /* On only while the grip is held.

     The panel's width is written straight to the DOM during a drag, and the
     three things that offset by it — both right-hand toolbars and the sheet —
     are transitioned so they glide when the panel opens. That transition is
     wrong mid-drag: it makes them trail the edge you are dragging by a quarter
     of a second. The class turns it off for exactly as long as the drag lasts. */
  const [gripping, setGripping] = useState(false)
  const shell = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ x: number; w: number; at: number } | null>(null)

  /* Written to the DOM during the drag, committed to state on release.

     `setInspW` per pointermove re-rendered this component, the board and every
     card on it, sixty times a second, to change one width — the same trap the
     pan was in before it moved to a ref. The custom property is all the layout
     needs, so the drag writes that and React hears about it once, at the end. */
  const setW = useCallback((w: number) => {
    const next = Math.max(320, Math.min(720, w))
    shell.current?.style.setProperty('--bb-insp', `${next}px`)
    return next
  }, [])

  /* The two ends the panel's own button steps between, and the test that says
     which end you are at.

     560 is the width a condition row needs to stay on one line — see the note
     on `inspW`. 380 is under the 430px container query, so the narrow state is
     genuinely a different shape rather than a squeezed one: the rows fold to
     two deliberate lines and the panel becomes a column you can still read
     beside a canvas you are arranging.

     `> NARROW` rather than `=== WIDE`, because the grip can leave the width
     anywhere in 320–720 and the button still has to know which way to go. */
  const NARROW = 380
  const wide = inspW > NARROW

  const onGrab = useCallback(
    (e: React.PointerEvent) => {
      drag.current = { x: e.clientX, w: inspW, at: inspW }
      setGripping(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [inspW],
  )

  const onDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d) return
      /* Dragging left widens: the handle is on the panel's left edge, so the
         panel grows as the pointer moves away from it. Clamped rather than
         free — under 320 the condition rows stack and stop being rows, and over
         720 the stage is no longer the thing you are working on. */
      d.at = setW(d.w + (d.x - e.clientX))
    },
    [setW],
  )

  const onDrop = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setGripping(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (d) setInspW(d.at)
  }, [])

  useEffect(() => {
    if (saved) setHist(historyOf(openForEditing(saved)))
  }, [saved?.id])


  /* The rules come from the draft; the policy's standing facts — its name and
     applications — come from the store. The bar renames in place and the start
     node's pane assigns applications, and both save straight to the policy, so
     the draft's own copies go stale the moment either is used. Overlaid here,
     every reader of `draft` (the bar, the start node, Review, and `committed`
     when it spreads the draft into the store) sees the saved facts, and
     publishing can never write an old name or app list back over a new one. */
  const present = hist.present
  const facts = useMemo(() => (saved ? { name: saved.name, appIds: saved.appIds, audience: saved.audience } : null), [saved])
  const draft = useMemo(() => (facts ? { ...present, ...facts } : present), [present, facts])
  /* "Start from scratch" is a step Undo can take back (review, 21 Sep 2026). It
     commits nothing — the chain is simply empty — so with no history to walk
     the toolbar Undo used to sit disabled and the template catalogue was gone
     for the rest of the visit. The old scratch inserted a rule, and one Undo
     brought the chooser back; this keeps that way home. */
  const backToChooser = scratch && present.rules.length === 0 && !canUndo(hist)
  const undoStep = () => (backToChooser ? setScratch(false) : setHist(undo))

  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      hasZone: (id) => !!store.zoneById(id),
      hasFingerprint: (id) => !!store.fingerprintById(id),
      /* Not `groupById`, which falls back to the first group: a who naming a
         deleted group would be named as the first group in the trace. */
      groupName: (id) => store.groups.find((g) => g.id === id)?.name ?? id,
      userName: (id) => store.userById(id)?.name ?? id,
      riskScale: store.riskScale,
    }),
    [store],
  )

  const diagnostics = useMemo(() => (saved ? diagnose(draft, store.groups, store.hooks, store.users, { zones: store.zones, fingerprints: store.fingerprints }) : []), [draft, store.groups, store.hooks, store.users, store.zones, store.fingerprints, saved])
  const shadowed = useMemo(() => (hover === null ? [] : shadowedBy(draft, hover)), [draft, hover])
  /* Draft mode — see policy-draft.ts.

     `unsaved` is measured against the last save or draft: it drives the leave
     guard, Save draft and the pill. `live` is measured against the rules that
     decide sign-ins: it drives the readings and, with a never-published policy,
     the publish gate. */
  const unsaved = !!saved && hasUnsavedChanges(saved, draft)
  const live = !!saved && differsFromLive(saved, draft)
  const toPublish = live || saved?.status === 'draft'
  const hasDraft = !!saved?.pendingDraft

  const saveDraft = () => {
    if (!saved) return false
    store.saveDraft(saved.id, { rules: draft.rules, fallback: draft.fallback })
    store.showToast('Draft saved')
    return true
  }

  /* First arrival only, and never on top of something else.

     Arriving with a sheet already asked for — "this policy has four holes",
     from the policy list — is somebody who knows what they came for, and
     interrupting them with a walkthrough would be the product talking over a
     question it was just asked. The settle delay is so the spotlight measures a
     laid-out screen rather than a mounting one.

     Its own key, not the trail's: the two teach different surfaces, and
     somebody who took the trail's tour has not been shown this one. */
  useEffect(() => {
    if (openSheet || boardTourSeen()) return
    const t = window.setTimeout(() => setTour(true), 600)
    return () => window.clearTimeout(t)
  }, [openSheet])

  /* The draft lives in this component, so leaving the board would destroy it.
     Every way out asks first, and Save as draft keeps the work without
     publishing it. */
  useLeaveGuard({ dirty: unsaved, save: saveDraft, saveLabel: 'Save as draft' })

  /* A rehearsal shown while you edit would go stale. Re-walked on every draft,
     silently — same run, updated verdicts — so the cards say what the rules
     now do without replaying the cascade. */
  useEffect(() => {
    setTrace((t) => (t ? { ...t, result: walk(draft, t.ctx, env) } : t))
  }, [draft, env])

  /* --- Keys -------------------------------------------------------------------

     The board had two bindings — undo/redo and Escape — and the trail next to
     it had a command palette. Everything else was a round trip to the mouse:
     selecting the next rule, moving one, duplicating, deleting, publishing.

     Every binding here acts on the SELECTED rule, so each one needs the
     selection resolved from its id first; `at` is -1 when nothing is selected
     or the selected rule has gone, and every branch bails on that rather than
     acting on rule 0 by accident.

     Nothing fires while a dialog is open or a field has focus. `typing` covers
     the fields; the dialog check is the same one Escape uses, and it matters
     most for the single-letter bindings — `e` and `?` would otherwise be
     unusable characters anywhere on the board.

     The rule bindings also stand down inside a control that takes keys of its
     own (`OWNS_KEYS`), inside the panel, and when something already handled
     the key. `typing` alone missed selects and pickers: Backspace in one
     deleted the rule being edited. */
  /* The handler in a ref, and one listener for the life of the board.

     The dependency array here was `[trace]` while the handler read two keys'
     worth of state. That was survivable when it did undo/redo and Escape;
     with eleven bindings acting on the selected rule it is not — the closure
     froze `draft`, `selection` and every mutator at the render `trace` last
     changed on, so ⌘D would duplicate against a stale rule list and the
     arrow keys saw a selection that had moved on.

     Listing every dependency would re-register the listener on each render,
     because the mutators are rebuilt each time. A ref rewritten during render
     is the usual way out: the listener is stable, and what it calls is always
     the current closure. */
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandler.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    const modal = !!document.querySelector('[role="dialog"], .bx-scrim')
    const action = historyKey(e)
    /* Not behind a dialog: undo would change the draft where nobody can see it.
       The walkthrough card is a non-modal dialog beside the board, and the
       edits it makes are meant to be undone, so it does not block undo. */
    const blocking = !!document.querySelector('[role="dialog"]:not([aria-modal="false"]), .bx-scrim')
    if (action && !typing && !blocking) {
      e.preventDefault()
      if (action === 'redo') setHist(redo)
      else undoStep()
      return
    }

    if (typing || modal) return

    const inControl = t instanceof Element && !!t.closest(OWNS_KEYS)
    /* Rule bindings only: not in a control, not in the panel, not handled. */
    const owned = e.defaultPrevented || inControl || (t instanceof Element && !!t.closest('.bb__insp'))

    const cmd = e.metaKey || e.ctrlKey
    const rules = draft.rules
    const at = selection.kind === 'rule' ? rules.findIndex((r) => r.id === selection.id) : -1
    /* Arrowing down the chain KEEPS the part: rule 3's Condition steps to rule
       4's Condition. The panel becomes a lens you slide down the chain — "what
       does each of these check?" — which is the reading that makes a
       column-wise arrow model worth having. From nothing selected there is no
       part to keep, and `ruleAt` supplies Who.

       Through `select`, not `setSelection` plus its own `setInspOpen`. That
       was this function open-coding the one door, and it now has a default to
       apply as well — doing that in two places is how the two disagree. */
    const partNow: Part = selection.kind === 'rule' ? selection.part : 'who'
    const pick = (i: number) => {
      const r = rules[i]
      if (r) select(ruleAt(r.id, partNow))
    }

    /* ⌘K — the palette the trail has had all along. */
    if (features.commands && cmd && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      setCmd((v) => !v)
      return
    }
    /* ⌘↵ — straight to the gate, which is where a finished edit is going. */
    if (cmd && e.key === 'Enter') {
      e.preventDefault()
      if (toPublish) setReview(true)
      else store.showToast('No changes to review')
      return
    }
    /* ⌘ — the panel is a lot of the screen, and reading the chain is a
       thing people do between edits.

       Only while something is selected. With nothing selected there is no
       panel, so an unguarded toggle would flip a piece of state nothing on
       screen reflects — and then the NEXT card you clicked would open to a
       collapsed panel for no reason you could trace back to a keystroke. */
    if (cmd && e.key === '\\') {
      e.preventDefault()
      if (at >= 0 || selection.kind === 'fallback' || selection.kind === 'apps') setInspOpen((v) => !v)
      return
    }
    /* Everything below acts on the selected rule, or is a single key. Escape
       still reaches the board from the panel; it has its own test at the end. */
    if (owned && e.key !== 'Escape') return

    if (cmd && e.key.toLowerCase() === 'd') {
      if (at < 0) return
      e.preventDefault()
      duplicate(at)
      return
    }

    /* ⌥↑ / ⌥↓ move the rule; bare ↑ / ↓ move the selection. Same axis, and
       the modifier is the difference between reading the chain and editing
       it — which is the distinction every list editor draws this way. */
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowUp' ? -1 : 1
      if (e.altKey) {
        if (at < 0) return
        e.preventDefault()
        move(at, at + dir)
      } else {
        e.preventDefault()
        /* From nothing, ↓ takes the first rule and ↑ the last, so the
           keyboard has a way in that does not require a click first. */
        pick(at < 0 ? (dir === 1 ? 0 : rules.length - 1) : Math.min(Math.max(at + dir, 0), rules.length - 1))
      }
      return
    }

    /* [ and ] — the previous or next part of the selected rule.

       Not ← / →, and the reason is mechanical rather than aesthetic. Two
       focused controls on this surface already handle the horizontal arrows
       and neither calls `stopPropagation`, so this window listener would fire
       as well: the resize grip below, and — worse — any `Seg` in the panel.
       Pressing ← there would change the segment AND switch the part,
       unmounting the form mid-edit.

       `[` and `]` are the standard previous/next-pane idiom, are unbound here,
       and ⌘[ / ⌘] (browser back and forward) are excluded by `!cmd`. */
    if ((e.key === '[' || e.key === ']') && !cmd && selection.kind === 'rule' && at >= 0) {
      e.preventDefault()
      select({ ...selection, part: nextPart(selection.part, e.key === ']' ? 1 : -1) })
      return
    }

    /* Delete only. Backspace is the key focus lands on by accident after a
       click on the canvas, and it deleted the selected rule silently. */
    if (e.key === 'Delete' && at >= 0) {
      e.preventDefault()
      remove(at)
      return
    }
    /* Unmodified `e`, because it is a toggle you reach for repeatedly while
       narrowing down which rule is doing something. It says what it did,
       because nothing near the keyboard shows it. */
    if (e.key.toLowerCase() === 'e' && at >= 0 && !cmd && !e.altKey) {
      e.preventDefault()
      const on = !rules[at].enabled
      patchRule(at, { enabled: on })
      store.showToast(`Rule ${at + 1} switched ${on ? 'on' : 'off'}`)
      return
    }
    if (e.key === '?') {
      e.preventDefault()
      setKeys((v) => !v)
      return
    }
    /* Not past a dialog.

       This is a window listener, so it saw the Escape that closed the
       condition picker as well — the picker shut AND the rule deselected, so
       backing out of choosing an attribute threw away the whole panel you
       were working in. Anything modal owns Escape while it is open; the
       board only gets it when nothing is over the board. */
    if (e.key === 'Escape' && !typing && !e.defaultPrevented && !inControl && !document.querySelector('[role="dialog"], .bx-scrim')) {
      if (trace) setTrace(null)
      else setSelection({ kind: 'none' })
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* The deck and the before/after sweep, back with the pips they feed.

     Memoised on the draft, so the cost is one deal and two sweeps per edit
     rather than per keystroke — the editor patches a rule on change, not on
     keypress, and `overrides` comes through a stable empty object when the
     tenant has set none.

     The deck is not dealt at a policy with no enabled rules. Every attempt
     falls straight to the default, so the grade measures the default and
     nothing else: a new policy opened with one blank rule was being handed an
     F and told five hostile sign-ins got through, which is true of the empty
     policy and says nothing about the one being written. No rules, no grade. */
  const overrides = store.gauntletOverrides[draft.id] ?? NO_OVERRIDES
  const gradable = draft.rules.some((r) => r.enabled)
  const test = useMemo(() => (gradable ? runGauntlet(draft, env, overrides) : null), [gradable, draft, env, overrides])
  const movement = useMemo(
    () => (live && saved ? compare(sweep(saved, env, 570), sweep(draft, env, 570)) : null),
    [live, saved, draft, env],
  )
  const blockers = diagnostics.filter((d) => d.severity === 'error' && (d.ruleIndex === -1 || draft.rules[d.ruleIndex]?.enabled)).length

  const selAt = selection.kind === 'rule' ? draft.rules.findIndex((r) => r.id === selection.id) : -1
  const selName = selAt >= 0 ? draft.rules[selAt].name : ''

  /* Whether there is anything for the panel to be about.

     Not `selection.kind !== 'none'`, and the difference is a real state rather
     than a nicety: a selection names a rule by id, and the rule it names can
     stop existing while the selection still holds the id — undo shortens the
     list, a delete lands, a discard rolls the draft back. `selAt` is -1 for all
     of those, and the panel has nothing to draw.

     The panel used to answer that case with the rule library, which is why it
     could always be open. The library has moved out, so the honest answer is
     now the empty one: no subject, no panel. */
  const hasSubject = selection.kind === 'fallback' || selection.kind === 'apps' || selAt >= 0

  /* One way in, for both doors.

     Board's own handler has forced the panel open on any selection since the
     day a click behind a collapsed panel selected something nobody could then
     edit. The sheet selects rules too — that is what "Open rule 3" on a finding
     does — and it was handed `setSelection` bare, so the same click through the
     sheet lit the card and opened nothing. Harmless while the panel was always
     up; now that it is not, it is a dead end with nothing on screen to explain
     it. Two callers, one handler. */
  const select = (s: Selection) => {
    setSelection(s)
    if (s.kind !== 'none') setInspOpen(true)
  }
  /* The panel is on screen only when it has something to say AND has not been
     collapsed. One class for both, because the layout must not be able to tell
     them apart: either way the stage has the width back.

     What reads the class has shrunk to one thing — `.bb`'s own
     `grid-template-columns`. It used to be four: two floating toolbars and the
     sheet each subtracting the panel's width by hand, and Fit measuring it out
     of the DOM. The panel is a track now, so collapsing the track is the whole
     of the adjustment and everything drawn inside the stage follows for
     free. */
  const panelShown = hasSubject && inspOpen

  /* The panel outlives its own close by one animation.

     It is UNMOUNTED when it closes, on purpose — an editor for a rule nobody
     is looking at is a form holding state about something that may since have
     been deleted. That is still true, and this does not change it: the panel is
     kept alive for the length of the slide and then dropped.

     Deliberately NOT an `AnimatePresence`. board.css records what happened last
     time: an exit interrupted by a fast click on a second card could strand the
     old panel at 2% opacity and never mount the next one, and that click is the
     common gesture. A timer has no such state — re-opening clears it and
     removes the class, and the worst an interruption can do is cancel a
     240ms animation. */
  const [panelAlive, setPanelAlive] = useState(panelShown)
  useEffect(() => {
    if (panelShown) {
      setPanelAlive(true)
      return
    }
    const t = setTimeout(() => setPanelAlive(false), 200)
    return () => clearTimeout(t)
  }, [panelShown])
  const panelLeaving = panelAlive && !panelShown
  const boardCommands: Cmd[] = [
    { id: 'add', label: 'Add a rule', icon: Plus },
    ...(selAt >= 0
      ? ([
          { id: 'dup', label: `Duplicate rule ${selAt + 1} · ${selName}`, kbd: chord(['mod'], 'D', MAC), icon: Copy },
          { id: 'del', label: `Delete rule ${selAt + 1} · ${selName}`, kbd: 'Del', icon: Trash2, danger: true },
        ] as Cmd[])
      : []),
    ...(toPublish ? ([{ id: 'publish', label: features.publish ? 'Review and publish' : 'Review and save', kbd: chord(['mod'], 'Enter', MAC), icon: Check }] as Cmd[]) : []),
    ...(canUndo(hist) || backToChooser ? ([{ id: 'undo', label: 'Undo', kbd: chord(['mod'], 'Z', MAC), icon: Undo2 }] as Cmd[]) : []),
    ...(canRedo(hist) ? ([{ id: 'redo', label: 'Redo', kbd: chord(['mod', 'shift'], 'Z', MAC), icon: Redo2 }] as Cmd[]) : []),
    ...(hasSubject ? ([{ id: 'panel', label: inspOpen ? 'Hide the panel' : 'Show the panel', kbd: chord(['mod'], '\\', MAC), icon: PanelRightClose }] as Cmd[]) : []),
    { id: 'keys', label: 'Keyboard shortcuts', kbd: '?', icon: Keyboard },
    ...draft.rules.map((r, i) => ({ id: `rule:${i}`, label: `Go to rule ${i + 1} · ${r.name}`, icon: ListOrdered }) as Cmd),
  ]

  if (!saved) return <div className="bpage">This policy no longer exists.</div>

  /* --- Edits -------------------------------------------------------------------- */
  const commitDraft = (next: Policy) => {
    lastCommitted.current = next
    setHist((h) => commit(h, next))
  }
  /* Every removal says what went, with Undo, for six seconds (owner, 21 Sep
     2026). Undo steps back only while the removal is still the latest edit: a
     press after anything else has changed would undo THAT instead, so it says
     where the full history is rather than guessing. Call it straight after the
     commit it describes, in the same event. */
  const offerUndo = (what: string) => {
    const after = lastCommitted.current
    store.showToast(what, {
      label: 'Undo',
      run: () => {
        if (!alive.current) return
        if (after && histNow.current.present === after) {
          setHist(undo)
          store.showToast('Restored')
        } else {
          store.showToast(`Other changes came after it. Use Undo in the toolbar (${chord(['mod'], 'Z', MAC)}).`)
        }
      },
    })
  }
  /* Through `patchRule` in model.ts: a who patch is normalised and never touches
     the WHEN, and a rule taken back to everyone compares as JSON equal to the
     rule that never had a who — with the key kept in place, so removing a group
     and adding it back leaves the save bar dark. */
  const patchRule = (i: number, p: Partial<Rule>) =>
    commitDraft({ ...draft, rules: draft.rules.map((r, j) => (j !== i ? r : patchOne(r, p))) })
  /* By id, for the walkthrough.

     Everything else on this surface holds an index, because it got one from the
     list it was rendering. The tour does not: it follows ONE rule across five
     steps while the reader stays free to reorder, duplicate and delete around
     it, and an index would silently re-point at whatever took the slot. The
     same argument `model.ts` makes for keying the selection by id. */
  const patchRuleById = (id: string, p: Partial<Rule>) => {
    const i = draft.rules.findIndex((r) => r.id === id)
    if (i >= 0) patchRule(i, p)
  }
  const patchFallback = (p: Partial<Rule>) => commitDraft({ ...draft, fallback: { ...(draft.fallback ?? fallbackRule()), ...p } })

  const insert = (rule: Rule, at: number) => {
    const rules = [...draft.rules]
    rules.splice(at, 0, rule)
    commitDraft({ ...draft, rules })
    /* Through `select`, which is the only door — this line has bypassed it
       since it was written, so inserting a rule with the panel collapsed gave
       you a selected card and no panel. */
    select(ruleAt(rule.id))
  }

  /* No selection fix-up. The selection names the rule, so moving the rule
     moves the selection with it — this used to re-point the index at the
     destination slot, which was right for the dragged rule and wrong for
     every other selection the move shifted. */
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.rules.length || from === to) return
    const rules = [...draft.rules]
    const [r] = rules.splice(from, 1)
    rules.splice(to, 0, r)
    commitDraft({ ...draft, rules })
  }

  /* Says what it did and how to get it back, and puts focus on the rule that
     took its place — the delete button went with the card, and focus on <body>
     is where the next Delete would act on the board. */
  const remove = (i: number) => {
    const gone = draft.rules[i]
    if (!gone) return
    const next = draft.rules[i + 1] ?? draft.rules[i - 1]
    commitDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })
    if (selection.kind === 'rule' && selection.id === gone.id) setSelection({ kind: 'none' })
    offerUndo(`Rule ${i + 1} deleted`)
    /* With no rule left, the empty chain's `+` when the canvas stays up (a
       scratch policy), or the chooser's first button when it comes back. */
    focusSoon(
      next
        ? byId(`bb-rule-${next.id}-title`)
        : () => document.querySelector<HTMLElement>('[data-tour="add-rule"]') ?? document.querySelector<HTMLElement>('.bb__empty button'),
    )
  }
  /* One " (copy)" suffix, numbered, never stacked. */
  const duplicate = (i: number) =>
    insert(reidRule({ ...draft.rules[i], name: copyName(draft.rules[i].name, draft.rules.map((r) => r.name)) }), i + 1)

  /* A template, applied to a policy that already exists.

     One `commitDraft`, which is the whole point of routing it through here:
     the rules land on the undo stack, `unsaved` notices, and Review & publish
     wakes up. `setHist(historyOf(next))` would look identical on screen and be
     un-undoable — that call belongs to publish and discard, and undo is the
     only thing standing between a mis-clicked template and lost work.

     Rules ONLY — the policy audience is left as it is. A `Scenario`'s audience
     is written into each built rule's `who` instead (`buildTemplate`), so a
     template for Contractors stays a template for Contractors on a policy that
     governs everyone. Dropping it widened those rules, Deny rules included.
     The policy audience is not the place: `unsaved` compares rules and the
     fallback, and the board neither shows nor edits it.

     A rule whose own who shares nobody with the template's audience would apply
     to nobody, and a who cannot store "nobody", so `buildTemplate` leaves it
     out and names it. The toast says how many. If that is every rule, nothing
     is applied: replacing the policy's rules with an empty list is not what
     anybody pressed the template for.

     The panel lands on rule 1 rather than on nothing, the same courtesy
     `insert` does — five rules arriving with an empty inspector beside them
     reads as a screen that has not finished loading. */
  /* Zones and device profiles the tenant does not have are cleared from the
     built rules (`buildTemplate`), so the condition reads "Choose…" and the
     blank-value check names it, rather than pointing at an id that never
     existed. A template with nothing to apply is refused, whatever the reason. */
  const applyTemplate = (t: Scenario) => {
    const build = buildTemplate(t, store.users, { zones: store.zones, fingerprints: store.fingerprints })
    const blocked = templateBlocker(t, build)
    if (blocked) {
      store.showToast(blocked)
      return
    }
    const { rules: built, dropped } = build
    commitDraft({ ...draft, rules: built })
    select(ruleAt(built[0].id))
    const d = dropped.length
    const left = d > 0 ? ` ${d === 1 ? '1 rule' : `${d} rules`} left out.` : ''
    const needs = build.needs.length > 0 ? ' Choose the missing zone or device profile.' : ''
    store.showToast(`${t.name} applied. Not saved yet.${left}${needs}`)
    focusSoon(byId(`bb-rule-${built[0].id}-title`))
  }

  const publish = (intent: CommitIntent) => {
    /* One commit rule for both builders — see `committed` in policy-draft.ts.
       No applications: a draft. A draft with applications: off, or on if the
       admin chose it. Anything published keeps the status it has in the store,
       which the bar can change while this edit is open, so `saved` rather than
       `draft` supplies it. `committed` also clears a saved draft. */
    const next = committed(saved, draft, intent)
    /* `next`, not `draft`, into both the store and the undo stack, so they
       agree about the record from the moment it is saved. The store stamps
       lastModified only when something besides the stamp changed. */
    store.savePolicy(next)
    setHist(historyOf(next))
    setReview(false)
    store.showToast(commitToast(saved, next))
  }
  /* Back to the live rules, and a saved draft goes too — that case asks first,
     and only that case resets the undo stack. */
  const revert = () => {
    setHist(historyOf({ ...saved, pendingDraft: undefined }))
    setTrace(null)
    if (saved.pendingDraft) store.discardDraft(saved.id)
    setConfirmDiscard(false)
  }
  /* Unsaved edits alone are rolled back as one more step, so undo brings them
     back. Discard sits next to Save draft, and a mis-click cost the session. */
  const discardEdits = () => {
    setHist((h) => revertTo(h, saved))
    setTrace(null)
    store.showToast(`Changes discarded. Press ${chord(['mod'], 'Z', MAC)} to undo.`)
  }
  const discard = () => (saved.pendingDraft ? setConfirmDiscard(true) : discardEdits())

  return (
    <>
      {/* The policy, above the work.

          A sibling of `.bb` rather than a child, so the shell's flex column
          places it and the board below it takes what is left. The verbs in it
          act on the DRAFT, which is why this component renders the bar rather
          than the page above it. */}
      {/* The bar's status control reads the store itself, so the draft's copy of
          the status is never shown. */}
      <BoardBar
        policy={draft}
        unsaved={unsaved}
        draftSaved={hasDraft}
        onLearn={() => setTour(true)}
        onWatchDemo={() => setDemo(true)}
        actions={
          <BoardBarActions
            test={test}
            movement={movement}
            sheet={sheet}
            toPublish={toPublish}
            unsaved={unsaved}
            canDiscard={unsaved || hasDraft}
            blockers={blockers}
            onSheet={setSheet}
            onSaveDraft={saveDraft}
            onDiscard={discard}
            onReview={() => setReview(true)}
          />
        }
      />

    <div
      ref={shell}
      className={`bb ${panelShown ? '' : 'is-insp-closed'} ${gripping ? 'is-gripping' : ''}`}
      style={{ '--bb-insp': `${inspW}px` } as React.CSSProperties}
    >
      {/* The canvas comes into existence when there is something on it.

          A policy with no rules used to draw the chooser INSIDE the pan-and-zoom
          world, which meant the first thing anybody met could be panned off
          screen. `BoardEmpty` is an ordinary screen; `Board` is the canvas; and
          the board only ever mounts one of them. */}
      {draft.rules.length === 0 && !scratch ? (
        <BoardEmpty
          /* "No rules" once the policy is live or had rules; the first-run
             question only for a new draft nobody has written in yet. */
          fresh={saved.status === 'draft' && saved.rules.length === 0 && !canUndo(hist)}
          fallback={(draft.fallback ?? fallbackRule()).decision}
          onEditDefault={() => select({ kind: 'fallback' })}
          onUndo={canUndo(hist) ? () => setHist(undo) : undefined}
          undoLabel={`Undo (${chord(['mod'], 'Z', MAC)})`}
          onUseTemplate={() => setPicking(true)}
          onScratch={() => {
            /* The chooser goes and the empty chain comes up; focus lands on
               the one control on it that adds a rule. */
            setScratch(true)
            focusSoon(() => document.querySelector<HTMLElement>('[data-tour="add-rule"]'))
          }}
        />
      ) : (
      <Board
        policy={draft}
        /* The one lookup the stage would otherwise need a store for.

           `appById` resolves an unknown id to the first application rather than
           to nothing, which is a trap two other call sites already note — so the
           id is checked against the live list here and an application that has
           been deleted out from under the policy reads as no application, which
           is what it now is. */
        destination={
          /* The chain's first node names ONE application, and says how many
             more beside it — the bar no longer carries the applications. */
          draft.appIds.length > 0
            ? (appsOf(draft, store.apps)[0]?.name ?? null)
            : draft.isSystem
              ? 'any application'
              : null
        }
        /* The first application's id, for its logo in the start pill, so the
           logo and the name beside it are the same application. */
        destinationAppId={draft.appIds.length > 0 ? (appsOf(draft, store.apps)[0]?.id ?? null) : null}
        destinationMore={Math.max(appsOf(draft, store.apps).length - 1, 0)}
        selection={selection}
        diagnostics={diagnostics}
        shadowed={shadowed}
        trace={trace}
        resolve={resolve}
        onSelect={select}
        expandedOf={expandedOf}
        onToggleExpand={toggleExpand}
        onInsert={(at) => {
          /* The first rule of a scratch policy: its name is the first thing
             to fill in, as it was when the chooser inserted it. */
          const first = draft.rules.length === 0
          insert(blankRule(), at)
          if (first) focusSoon(() => document.querySelector<HTMLElement>('.bb__insp input[aria-label="Rule name"]'), true)
        }}
        onMove={move}
        onToggle={(i, on) => patchRule(i, { enabled: on })}
        onDuplicate={duplicate}
        onDelete={remove}
        onHover={setHover}
        /* Undo and redo, into the one dock pill `Board` draws. Density comes
           first in that pill (`aside`, below), then this history group, then
           zoom, which lives in `Board` because the zoom state does. */
        tools={
          <>
            {/* A panel toggle stood here, and before that in the publishing
                cluster. It is gone from both.

                The panel has one way out — the × in its own bar, on the thing
                being closed — and three ways back: click a card, arrow to one,
                or ⌘\. A fourth control, on the far side of the canvas from the
                panel it acts on, was a second door for a room that was not
                short of them. */}
            <Tip text={`Undo (${chord(['mod'], 'Z', MAC)})`} placement="top">
              <button type="button" className="bb__act" aria-label="Undo" disabled={!canUndo(hist) && !backToChooser} onClick={undoStep}>
                <Undo2 size={14} strokeWidth={2} />
              </button>
            </Tip>
            <Tip text={`Redo (${chord(['mod', 'shift'], 'Z', MAC)})`} placement="top">
              <button type="button" className="bb__act" aria-label="Redo" disabled={!canRedo(hist)} onClick={() => setHist(redo)}>
                <Redo2 size={14} strokeWidth={2} />
              </button>
            </Tip>
          </>
        }
        aside={
          /* ONE labelled button that says what it will do — "Expand all" while
             the cards are folded, "Collapse all" while they are open (owner,
             21 Sep 2026: the two bare glyphs "are not making sense, need the
             label"). A pair of labelled segments was the widest thing in the
             dock and the reason it was rebuilt; a pair of glyphs was the
             narrowest and read as nothing. One verb with its mark is both short
             and legible. The glyph is the card's own fold mark. */
          <button
            type="button"
            className="bb__densitybtn"
            onClick={() => setChainDensity(density === 'outline' ? 'detailed' : 'outline')}
          >
            {density === 'outline' ? (
              <ChevronsUpDown size={14} strokeWidth={2} aria-hidden />
            ) : (
              <ChevronsDownUp size={14} strokeWidth={2} aria-hidden />
            )}
            {density === 'outline' ? 'Expand all' : 'Collapse all'}
          </button>
        }
      />
      )}


      {panelShown && (
        <div
          className="bb__grip"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the inspector"
          aria-valuenow={inspW}
          aria-valuemin={320}
          aria-valuemax={720}
          tabIndex={0}
          onPointerDown={onGrab}
          onPointerMove={onDrag}
          onPointerUp={onDrop}
          /* Arrow keys move it too. A divider that only responds to a drag is a
             divider somebody navigating by keyboard cannot move at all. */
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setInspW((w) => setW(w + 24))
            else if (e.key === 'ArrowRight') setInspW((w) => setW(w - 24))
            else return
            e.preventDefault()
          }}
        />
      )}

      {/* Mounted only when it has a subject.

          Not hidden with CSS — unmounted, one animation late. The panel holds
          the editors for one rule, and an editor for a rule nobody is looking at
          is a form that keeps its own state about something that may since have
          been deleted; `panelAlive` delays the drop by the length of the slide
          and nothing else. Closing also narrows its grid track, which
          `.bb.is-insp-closed` does by rewriting the template — to zero rather
          than to one column, so the width has something to animate between. */}
      {panelAlive && (
        <Inspector
          leaving={panelLeaving}
          draft={draft}
          selection={selection}
          /* What is wrong with the rule on screen, said where it is edited.
             Lite has no Check sheet, so this is the only place the reason for
             "Needs setup" is written down. */
          diagnostics={selAt >= 0 ? diagnostics.filter((d) => d.ruleIndex === selAt) : []}
          onPatchRule={patchRule}
          onPatchFallback={patchFallback}
          onRemoved={offerUndo}
          onAppsSaved={() => {
            setInspOpen(false)
            setSelection({ kind: 'none' })
            focusSoon(() => document.getElementById('bb-start'))
          }}
          onClose={() => {
            setInspOpen(false)
            /* The close button goes with the panel; focus goes to the card it was editing. */
            focusSoon(
              selection.kind === 'rule'
                ? byId(`bb-rule-${selection.id}-title`)
                : selection.kind === 'apps'
                  ? () => document.getElementById('bb-start')
                  : () =>
                      document.getElementById('bb-terminal-title') ??
                      document.querySelector<HTMLElement>('[data-tour="add-rule"]') ??
                      document.querySelector<HTMLElement>('.bb__empty button'),
            )
          }}
          wide={wide}
          onToggleWidth={() => setInspW(setW(wide ? NARROW : 560))}
        />
      )}

      {/* The palette, over the board's own verbs.

          `CommandBar` is reused; `buildCommands` is not. The trail's list
          offers the gauntlet dialog, the decision log, "Assign applications"
          and "Save as template" — four things this surface does not have, and a
          palette that lists actions the screen cannot perform is worse than no
          palette. Same component, own commands. */}
      {features.commands && cmd && (
        <CommandBar
          commands={boardCommands}
          onClose={() => setCmd(false)}
          onRun={(id) => {
            setCmd(false)
            if (id === 'add') insert(blankRule(), draft.rules.length)
            else if (id === 'undo') undoStep()
            else if (id === 'redo') setHist(redo)
            else if (id === 'publish') setReview(true)
            else if (id === 'panel') setInspOpen((v) => !v)
            else if (id === 'keys') setKeys(true)
            else if (id === 'dup' && selAt >= 0) duplicate(selAt)
            else if (id === 'del' && selAt >= 0) remove(selAt)
            else if (id.startsWith('rule:')) {
              const r = draft.rules[Number(id.slice(5))]
              if (r) select(ruleAt(r.id))
            }
          }}
        />
      )}

      {/* Every binding on one card, opened by the key it documents.

          Discoverability is the whole point: none of these is guessable, and a
          shortcut nobody knows about is a shortcut nobody has. `?` is the
          convention, and it is listed here too so the sheet explains how it
          was reached. */}
      <Modal open={keys} onClose={() => setKeys(false)} title="Keyboard shortcuts" width={480}>
        <dl className="bb__keys">
          {boardShortcuts({ mac: MAC, commands: features.commands, gauntlet: features.gauntlet, publish: features.publish }).map(([k, what]) => (
            <div key={k}>
              <dt>
                {k.split(' ').map((part) => (
                  <kbd key={part}>{part}</kbd>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </Modal>

      <BoardSheet
        tab={sheet}
        onTab={setSheet}
        onClose={() => setSheet(null)}
        draft={draft}
        saved={saved}
        dirty={live}
        env={env}
        diagnostics={diagnostics}
        trace={trace}
        onTrace={setTrace}
        onSelect={select}
        onApplyRules={(rules, note) => {
          commitDraft({ ...draft, rules })
          store.showToast(note)
        }}
      />

      {/* The catalogue, raised from the empty board.

          Mounted here rather than inside `Board` because it writes to the
          draft, and `commitDraft` is the one door. It carries `role="dialog"`
          of its own, which the key handler above reads — without it, browsing
          templates would leave Del, ⌘D and the arrow keys live on the rule
          underneath. */}
      <TemplateSheet
        open={picking}
        onClose={() => setPicking(false)}
        onChoose={applyTemplate}
        fallback={(draft.fallback ?? fallbackRule()).decision}
      />

      {/* The guided demo.

          Everything it can do to the board is something the board already
          exposes to its own controls — insert, patch, select, open a sheet — so
          "Do it for me" lands an ordinary edit that undo puts back, and there is
          no second door into the draft for the tour to be kept in step with. */}
      {tour && (
        <Suspense fallback={null}>
          <BoardTour
            open={tour}
            onClose={() => setTour(false)}
            onWatch={() => setDemo(true)}
            host={{
              draft,
              selection,
              addRule: (r) => insert(r, draft.rules.length),
              patchRuleById,
              select,
              density,
              setDensity: setChainDensity,
              review,
              /* Raise only. The walkthrough shows the door and stops — going
                 through with it on somebody's behalf would be the one action on
                 this screen they cannot take back from here. */
              openReview: () => setReview(true),
            }}
          />
        </Suspense>
      )}

      {/* A sibling of the walkthrough, not a child of it — see `demo` above. */}
      {demo && (
        <Suspense fallback={null}>
          <DemoPlayer open={demo} onClose={() => setDemo(false)} />
        </Suspense>
      )}

      <ReviewDialog open={review} policy={draft} from="board" onClose={() => setReview(false)} onCommit={publish} />

      {/* Only when a saved draft would go. Unsaved edits alone revert as an undoable step. */}
      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard draft?"
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              Keep draft
            </Button>
            <Button variant="danger" onClick={revert}>
              Discard
            </Button>
          </>
        }
      >
        <p className="bx-leave__body">The policy goes back to its live rules.</p>
      </Modal>

    </div>
    </>
  )
}
