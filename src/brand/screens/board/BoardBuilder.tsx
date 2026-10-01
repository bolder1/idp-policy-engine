import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsDownUp, ChevronsUpDown, CopyPlus, Keyboard, ListOrdered, LogIn, PanelRightClose, PenLine, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'

import { Button, Modal, Tip } from '../../kit'
import { appsOf, enforces, fallbackRule, reidRule, blankRule, type Policy, type Rule, type Scenario } from '../../data'
import { dictionaryOf, type AnswerKey, type DescribeTenant, type RuleIds } from '../../create/describe-model'
import { checksView, withChecks, type CheckContext } from '../../create/describe-checks'
import { guardSignIns } from '../../draft-checks'
import { commitToast, committed, differsFromLive, hasUnsavedChanges, openForEditing, type CommitIntent, type RuleSet } from '../../policy-draft'
import { useBrand, useNameLookup } from '../../store'
import { TemplateSheet } from '../../create/TemplateSheet'
import { ReviewDialog } from '../builder-dialogs'
import { CommandBar, type Cmd } from '../command-bar'
import { BoardBar, BoardBarActions } from './BoardBar'
import { SHOWCASE } from '../../showcase'
import { BoardEmpty } from './BoardEmpty'
import { buildTemplate, templateBlocker } from './apply-template'
import { diagnose, shadowedBy } from '../diagnostics'
import { afterPaint, guardOpens, isStale, overridePatch, patchSignIns, tryRunGuard, type GuardInput, type GuardResult, type GuardStamp, type ReadyFix, type SignInCheck } from '../guard'
import { GuardDrawer } from '../guard-page'
import { offersMonitorAfterSave, portalRoot, statusToast } from '../status-options'
import { canRedo, canUndo, commit, historyKey, historyOf, redo, revertTo, undo, type History } from '../history'
import { useSimEnv } from '../sim-env'
import { BreakInView, type BreakInKept } from '../break-in-view'
import { WhichPolicy } from '../testing/WhichPolicy'
import { WhatTheySee } from '../testing/WhatTheySee'
import { TestPanel } from '../testing/TestPanel'
import { boardPagesAllowed } from '../testing/board-views'
import { useTestingSession } from '../testing/session-state'
import { formOf, todayIn } from '../testing/sign-in-form'
import { boardScope } from '../testing/sign-in-sentence'
import { PANEL_MAX_W, PANEL_MIN_W, clampPanelWidth, readPanel, writePanel, type DockTab } from '../testing/test-dock'
import type { SignInFacts } from '../sign-in-facts'
import { Board, type TestChain } from './Board'
import { createCardHighlight } from './card-highlight'
import { DescribePanel } from './DescribePanel'
import {
  RULES_ADDED,
  bodyOf,
  changedCards,
  describeOffered,
  describeSession,
  describedDraft,
  doneFacts,
  emptyDescribe,
  revertDescribed,
  sendTurn,
  undoDescribed,
  undoTurn,
  withDraftApps,
  writeDescribed,
  type DescribeSession,
  type DescribeState,
} from './describe-session'
import { Inspector } from './Inspector'
import { ReadAsTextPanel } from './ReadAsTextPanel'
import { audienceOf, notDecidingReason, panelTabForRoute, whyLine, type BoardOpen } from './test-mode'
import { boardVersion } from './try-sign-in'
import { useTrySignIn } from './use-try-sign-in'
import { nextPart, patchRule as patchOne, ruleAt, type Part, type Selection } from './model'
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

/* Every card folded, while Try a sign-in reads the chain: the check pills
   under each head are what is being read, and a card open at its full height
   is a rule's editor standing in the route. Module-level, so it is one function. */
const FOLDED = () => false

/* The sentence's ids: a token's is its field's row id under this prefix
   (sign-in-sentence.ts, `tokenDomId`), so a "Needs:" line can find one. */
const TRY_PREFIX = 'bb-try'

/* Controls that take keys of their own. A rule shortcut never fires from inside
   one — Backspace in a picker is not "delete this rule". */
const OWNS_KEYS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="listbox"], [role="menu"], [role="dialog"]'
/* Surfaces that are not the chain: the inspector, test mode's panel (which
   wears the inspector's chrome and holds the sentence and the tests), and the
   sentence's popovers (portalled, so not inside it). A rule shortcut pressed
   in any of them acts on a rule nobody there is looking at. */
const TEST_SURFACES = '.bb__insp, .tpanel, .bx-apop'
/* Describe it's thread (V4 §4.1): its own track on the left, not the
   inspector's, and a surface a rule shortcut never reaches either. */
const DESCRIBE_SURFACE = '.bdsc'

/* Before saving, as it last ran: what the checks said, what they read, and
   the rules they read — by reference, so an Undo pressed behind the page is
   noticed ("Changed since you opened this"). `turn-on` is a draft turned on
   from the walkthrough's review: Before turning on, on the board's draft. */
interface SaveGuard {
  kind: 'save' | 'turn-on'
  result: GuardResult | 'error'
  stamp: GuardStamp
  run: number
  intent: CommitIntent
  rules: Rule[]
  fallback: Rule | undefined
}

export function BoardBuilder({
  policyId,
  openTest,
  openPage,
  rule,
}: {
  policyId: string
  /** Arrive in Try a sign-in's test mode: the Policies row menu's Try a sign-in. */
  openTest?: boolean
  /* Which tab the test panel opens on (V4 §2.4-bis): the last one this viewer
     was on (`try`), or People, Saved sign-ins or the Break-in test, where the
     edition has Policy testing. */
  openPage?: BoardOpen
  /** Arrive with this rule selected, or the last row ('fallback'). */
  rule?: string
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
  const [selection, setSelection] = useState<Selection>(() =>
    rule === 'fallback' ? { kind: 'fallback' } : rule ? { kind: 'rule', id: rule, part: 'when' } : { kind: 'none' },
  )
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
  /* Describe it (describe spec, §3): the panel is open in the inspector's
     slot. What it holds — the box, the reading, the answers and the choices —
     lives here for the visit, so the Describe it card reopens on them after
     an Undo takes the draft back to no rules. `session` is one opening of the
     panel: its writes are one history entry (describe-session.ts). The card
     ids are kept by what wrote them, so recomposing after an answer keeps each
     card and the board does not remount it. */
  const [describing, setDescribing] = useState(false)
  const [describeState, setDescribeState] = useState<DescribeState>(emptyDescribe)
  const describeIds = useRef<RuleIds>(new Map())
  const session = useRef<DescribeSession | null>(null)
  /* The thread as this opening found it: what the toast's Undo gives back
     with the board, so the two never disagree about what was written. */
  const openedWith = useRef<DescribeState | null>(null)
  /* The cards the panel's last write added or changed, edged for 2 s (V4 §4.1). */
  const [fresh, setFresh] = useState<{ ids: string[]; n: number } | null>(null)
  useEffect(() => {
    if (!fresh) return
    const t = window.setTimeout(() => setFresh(null), 2000)
    return () => window.clearTimeout(t)
  }, [fresh])
  /* The words each card was written from, by rule id, until the next save. */
  const [sources, setSources] = useState<Record<string, string>>({})
  /* Read as text (describe spec, §7.2): open in the inspector's slot, and the
     rule whose sentence is under the pointer, ringed on the chain. */
  const [reading, setReading] = useState(false)
  const [readHover, setReadHover] = useState<string | null>(null)
  const readButton = useRef<HTMLSpanElement | null>(null)
  /* A card clicked while the panel is open, and the answer under the pointer. */
  const [describeFocus, setDescribeFocus] = useState<{ key: AnswerKey; n: number } | null>(null)
  const [tracing, setTracing] = useState<AnswerKey | null>(null)
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
  /* Try a sign-in's test mode (try-sign-in.ts has the model, use-try-sign-in.ts
     the run). Seeded from the route: the row menu's Try a sign-in lands here
     with it on. */
  const [testing, setTesting] = useState(!!openTest)
  const testButton = useRef<HTMLSpanElement | null>(null)
  /* The test panel's heading: focus lands on it when test mode opens and
     when the rule editor hands the column back. */
  const testHeading = useRef<HTMLHeadingElement | null>(null)
  /* Whether the column's current occupant took the other's place — the rule
     editor opened from the chain, or the test panel back from it — so it
     fades in where it stands rather than sliding in as a new panel. */
  const [swapped, setSwapped] = useState(false)
  /* The test panel's tab (V4 §2.4-bis), held here rather than in the panel:
     a card clicked on the chain swaps the rule editor in, and its × must
     bring the panel back on the tab it left. Seeded once from this viewer's
     last tab and the route that opened test mode; the tab is what is kept
     per viewer (`writePanel`, below), with the panel's width. */
  const [testTab, setTestTab] = useState<DockTab>(() => panelTabForRoute(openTest ? openPage : undefined, readPanel().tab))
  /* The card a row in a tab lands on, ringed while the pointer is on the row.
     Not state: a store the cards read themselves (card-highlight.ts), so a
     hover re-renders the card it leaves and the card it lands on, not this. */
  const [highlight] = useState(createCardHighlight)
  /* Save sign-in's popover, held here so Saved sign-ins' "Save this sign-in"
     can open it on the header's bookmark. */
  const [saveOpen, setSaveOpen] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  /* The last row under the pointer — Describe it bolds its answer, as a rule card's. */
  const [hoverLast, setHoverLast] = useState(false)
  const [review, setReview] = useState(false)
  /* The checks before saving (guard.ts): running, and the page they opened. */
  const [checking, setChecking] = useState(false)
  const [guard, setGuard] = useState<SaveGuard | null>(null)
  const [guardOpen, setGuardOpen] = useState(false)
  /* A rule shown on the chain from that page, behind it. */
  const [flash, setFlash] = useState<{ id: string; key: number } | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [cmd, setCmd] = useState(false)
  const [keys, setKeys] = useState(false)
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
  /* The test panel's width: the same column and the same grip, its own range
     (400 to 640, 460 to start) and remembered per viewer, as an IDE keeps a
     side panel's width. The rule editor swapped in from the chain takes this
     width too — the column does not jump when its occupant changes. */
  const [testW, setTestW] = useState(() => readPanel().width)
  useEffect(() => {
    writePanel({ tab: testTab, width: testW })
  }, [testTab, testW])
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
  /* `openOnly` and `toggleExpand` are below, where `draft` exists: closing the
     others means naming them. */
  const setChainDensity = (d: 'outline' | 'detailed') => {
    setDensity(d)
    setFolds({})
  }
  /* On only while the grip is held.

     The panel's width is written straight to the DOM during a drag, and the
     things that offset by it — both right-hand toolbars — are transitioned so they glide when the panel opens. That transition is
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
  /* Test mode's column has its own range (`clampPanelWidth`). `testMode` is
     passed rather than read, so this stays one stable callback. */
  const setW = useCallback((w: number, testMode = false) => {
    const next = testMode ? clampPanelWidth(w) : Math.max(320, Math.min(720, w))
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

  /* In test mode the grip moves the test panel's width; otherwise the
     inspector's. `testing` and `testW` are read through a ref: the drag's
     handlers are memoised on the width they started from. */
  const colMode = useRef({ testing: false, testW })
  const onGrab = useCallback(
    (e: React.PointerEvent) => {
      const w = colMode.current.testing ? colMode.current.testW : inspW
      drag.current = { x: e.clientX, w, at: w }
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
      d.at = setW(d.w + (d.x - e.clientX), colMode.current.testing)
    },
    [setW],
  )

  const onDrop = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setGripping(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (d) (colMode.current.testing ? setTestW : setInspW)(d.at)
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
  /* ONE CARD OPEN AT A TIME, and selecting a card opens it (owner, 23 Sep 2026:
     "when I select any rule card it should expand, and one card can expand at a
     time — so if I want to expand another card, the current expanded one should
     collapse. Expand all and collapse all is perfect, no need to change
     anything").

     Two things follow from the chain being a chain. Reading a policy is reading
     an ORDER, and a card open at its full height is most of a screen — three of
     them open at once and the order is something you scroll for. And the card
     you are editing is the one the panel is already showing, so a second card
     standing open is a rule nobody is looking at taking the room.

     `openOnly` writes an explicit entry for EVERY card, not just the one it
     opens, because `expandedOf` falls back to the chain-wide density — after
     "Expand all" an absent entry still means open, so the others have to be
     told. Which is also why "Expand all" and "Collapse all" are untouched: they
     set the density and clear the overrides, so they still reach the whole
     chain in one press. The accordion is what a card's OWN click does.

     The fallback at the foot of the chain is a card like any other here. */
  const cardIds = () => [...draft.rules.map((r) => r.id), 'fallback']
  /* `[id]: true` LAST, and outside the sweep. A rule that was just inserted is
     selected in the same tick it is committed (see `insert`), so `draft` here
     is still the list without it: sweeping `cardIds()` alone would close every
     card and never open the new one, which is how a rule you had just added
     arrived folded (owner, 23 Sep 2026: "when I add a new rule, or add my
     first, the card is still collapsed — fix that"). Written this way the id
     asked for is opened whether or not the chain has caught up with it. */
  const openOnly = (id: string) =>
    setFolds({ ...Object.fromEntries(cardIds().map((k) => [k, false])), [id]: true })
  /* Closing is only ever about the card you pressed; opening closes the rest. */
  const toggleExpand = (ruleId: string) =>
    expandedOf(ruleId) ? setFolds((f) => ({ ...f, [ruleId]: false })) : openOnly(ruleId)
  /* "Start from scratch" is a step Undo can take back (review, 21 Sep 2026). It
     commits nothing — the chain is simply empty — so with no history to walk
     the toolbar Undo used to sit disabled and the template catalogue was gone
     for the rest of the visit. The old scratch inserted a rule, and one Undo
     brought the chooser back; this keeps that way home. */
  const backToChooser = scratch && present.rules.length === 0 && !canUndo(hist)
  const undoStep = () => (backToChooser ? setScratch(false) : setHist(undo))

  /* The store's one env (sim-env.ts), shared with every other surface that
     evaluates, so the board and the gauntlet name things the same way. */
  const env = useSimEnv()

  /* Only an app access policy decides sign-ins, so only one can be tried. */
  const canTest = features.trySignIn && draft.type === 'App Access'
  const testOn = testing && canTest && !!saved
  /* The commit that opens or closes test mode switches the grid's columns
     without their transition (`.bb.is-snap`), so Board's refit in that same
     commit measures the column the chain ends in, and the chain moves once
     (review, 29 Sep 2026: three moves and a sliding marker). Dropped two
     frames later, when nothing is changing width any more. */
  /* Describe it's left track switches the same way (V4 §4.1): the panel's
     own slide-in is the motion, and the canvas refits once beside it. */
  const describeOpen = describing && !testOn
  const layout = testOn ? 'test' : describeOpen ? 'describe' : 'edit'
  const [snapFor, setSnapFor] = useState(layout)
  const snapping = snapFor !== layout
  useEffect(() => {
    if (!snapping) return
    let second = 0
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setSnapFor(layout))
    })
    return () => {
      window.cancelAnimationFrame(first)
      window.cancelAnimationFrame(second)
    }
  }, [snapping, layout])
  /* The right-hand column's width: the test panel's while test mode is on
     (the rule editor swapped in takes it too), the inspector's otherwise. */
  const colW = testOn ? testW : inspW
  colMode.current = { testing: testOn, testW }
  /* Try a sign-in takes the board first: `T` closes the panel as × does (`describeOpen`, above). */
  /* Read as text gives the column up to either of them. */
  const readOpen = reading && !testOn && !describeOpen
  /* What the reader matches against: this tenant's own names. */
  const describeTenant = useMemo<DescribeTenant>(
    () => ({ apps: store.apps, groups: store.groups, users: store.users, zones: store.zones, fingerprints: store.fingerprints, methods: store.methods, policies: store.policies, scenarios: store.scenarios }),
    [store.apps, store.groups, store.users, store.zones, store.fingerprints, store.methods, store.policies, store.scenarios],
  )
  /* The checks under the answers (describe-checks.ts): a handful of sign-ins
     built from them, tried through the whole tenant with the draft on. On
     today's date where the tenant is, as Try a sign-in starts. */
  const today = useMemo(() => todayIn(), [])
  const checkCtx: Omit<CheckContext, 'draft' | 'sources'> = { tenant: describeTenant, env, adminId: store.account.id, today }
  const describeReading = describeState.reading
  const describeChecks = useMemo(
    () =>
      describeOpen && features.draftChecks
        ? checksView(describeReading.answers, { draft, sources, tenant: describeTenant, env, adminId: store.account.id, today })
        : undefined,
    /* Not the box: typing leaves the reading as it was, so nothing here runs while the admin types. */
    [describeOpen, features.draftChecks, describeReading, draft, sources, describeTenant, env, store.account.id, today],
  )
  /* The board as it stands, for the latest turn's change line. */
  const describeBoard = useMemo(() => ({ rules: draft.rules, fallback: draft.fallback, checks: draft.checks }), [draft.rules, draft.fallback, draft.checks])
  const trying = useTrySignIn({ on: testOn, saved: saved ?? draft, draft, env })
  /* The pieces of the trace a run's clock does not touch — Which policy's
     list, What they see — as elements that keep their identity from hop to
     hop, so React skips them while the marker travels (review, 29 Sep 2026:
     every hop rebuilt the whole builder). */
  const tryAppId = trying?.form.appId ?? null
  const tryRight = trying?.right
  const tryWatching = trying?.watching
  const tryScreens = trying?.screens
  const seenLabel = trying?.columns.at(-1)?.label ?? 'Live'
  const whichList = useMemo(
    () =>
      tryAppId && tryRight && tryWatching ? (
        <WhichPolicy compact resolution={tryRight.resolution} appId={tryAppId} substitute={tryRight.spec.substitute} watching={tryWatching} />
      ) : null,
    [tryAppId, tryRight, tryWatching],
  )
  /* The pages the person would see for the answer on the board, in the
     outcome node's popover — open on its pages, since the popover is the
     disclosure. */
  const whatTheySee = useMemo(
    () =>
      tryScreens ? (
        <div className="bb__tsee">
          <WhatTheySee key={draft.id} screens={tryScreens} appId={tryAppId} title={`What they see · ${seenLabel}`} defaultOpen />
        </div>
      ) : null,
    [tryScreens, tryAppId, seenLabel, draft.id],
  )
  /* The version every tab of the test panel judges by: Your edits while the
     board differs from live, the Stored version of a policy that is off. */
  const version = useMemo(() => (saved ? boardVersion(saved, draft) : null), [saved, draft])

  const testingSession = useTestingSession()

  /* Policy testing's lists — this policy's saved sign-ins, its people, last
     week, the Break-in test — are the test panel's tabs (V4 §2.4-bis), where
     the edition has Policy testing; without it the panel is the sign-in alone.
     The Break-in test is a tab only on a policy it runs on. What its view
     would lose when another tab or the rule editor takes its place — the
     last run, the pressed count, the open row — is kept here for the life of
     test mode. */
  const views = features.policyTesting
  const pagesAllowed = boardPagesAllowed(views, features.breakInTest, draft)
  const breakInKept = useRef<BreakInKept | null>(null)
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
  /* The edits themselves, for the bar's status control; undefined when there
     are none. Kept by identity so the bar does not see new edits on every render. */
  const boardEdits = useMemo<RuleSet | undefined>(
    () => (unsaved ? { rules: draft.rules, fallback: draft.fallback } : undefined),
    [unsaved, draft.rules, draft.fallback],
  )

  const saveDraft = () => {
    if (!saved) return false
    store.saveDraft(saved.id, { rules: draft.rules, fallback: draft.fallback, checks: draft.checks })
    store.showToast('Draft saved')
    return true
  }

  /* First arrival only, and never on top of something else.

     Arriving in test mode — the row menu's Try a sign-in, or a guard page's
     Break-in "Open" — is somebody who knows what they came for, and
     interrupting them with a walkthrough would be the product talking over a
     question it was just asked. The settle delay is so the spotlight measures a
     laid-out screen rather than a mounting one.

     Its own key, not the trail's: the two teach different surfaces, and
     somebody who took the trail's tour has not been shown this one. */
  useEffect(() => {
    if (openTest || boardTourSeen()) return
    const t = window.setTimeout(() => setTour(true), 600)
    return () => window.clearTimeout(t)
  }, [openTest])
  /* And the test panel's heading takes focus, as it does when the bar's
     button opens test mode: the panel is announced by its name, and the
     sentence's first token is the next Tab. */
  useEffect(() => {
    if (openTest) focusSoon(() => testHeading.current)
  }, [openTest])

  /* The draft lives in this component, so leaving the board would destroy it.
     Every way out asks first, and Save as draft keeps the work without
     publishing it. */
  useLeaveGuard({ dirty: unsaved, save: saveDraft, saveLabel: 'Save as draft' })

  /* The rehearsal that was re-walked here on every draft is Try a sign-in's run
     now, which reads the draft directly (use-try-sign-in.ts): an edit is an
     update, and the route follows it without replaying. */

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
    /* An empty search box in the test panel lets Escape through: the first
       Escape in one with text clears it (the panel stops that one), and the
       next closes test mode, as it would anywhere else in the panel. Every
       other key there is still typing. */
    const emptySearch = e.key === 'Escape' && t instanceof HTMLInputElement && t.type === 'search' && t.value === '' && !!t.closest('.tpanel')
    const typing = !emptySearch && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
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

    const inControl = !emptySearch && t instanceof Element && !!t.closest(OWNS_KEYS)
    /* Rule bindings only: not in a control, not in the panel, not handled. */
    const owned = e.defaultPrevented || inControl || (t instanceof Element && (!!t.closest(TEST_SURFACES) || !!t.closest(DESCRIBE_SURFACE)))

    /* Unmodified T, beside E and for the same reason: a toggle reached for
       again and again while a rule is being worked out. Not in a field or a
       control, not behind a dialog — the guards above — not in the rule
       editor, and not on a policy that decides no sign-in. Tested before the
       rule bindings stand down in the test panel: T is test mode's own
       toggle, so it closes it from the panel it opened, where focus lands. */
    if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.defaultPrevented && !inControl) {
      if (!canTest || (t instanceof Element && !!t.closest(`.bb__insp:not(.tpanel), ${DESCRIBE_SURFACE}`))) return
      e.preventDefault()
      toggleTest()
      return
    }

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
    /* ⌘↵ — saves, the same as the button it stands in for. */
    if (cmd && e.key === 'Enter') {
      e.preventDefault()
      if (!toPublish) store.showToast('Nothing to save')
      else if (saveBlocked) store.showToast(`${blockers} error${blockers === 1 ? '' : 's'} to fix first`)
      else saveNow()
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
      /* Not in test mode: the column always holds something there — the test
         panel, or the rule editor in its place — and neither reads this flag,
         so the flip would only surface once test mode closed. */
      if (testOn) return
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
      /* In test mode, a rule open in the column goes back to the sign-in
         first; then test mode closes. Outside it, the selection clears. */
      if (testOn) {
        if (selection.kind !== 'none') backToTest()
        else closeTest()
      } else setSelection({ kind: 'none' })
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* The deck and the before/after sweep stood here, dealt on every edit to feed
     the bar's Check and What changes pips. The pips went with Try a sign-in
     (final spec, A.8) and the sheets they opened with M4: the Break-in test
     counts in Saved sign-ins, and What changes is a row of the checks before
     saving (guard.ts), each computed where it is read. */
  const blockers = diagnostics.filter((d) => d.severity === 'error' && (d.ruleIndex === -1 || draft.rules[d.ruleIndex]?.enabled)).length
  /* The gate the review dialog's footer used to hold, now that the bar saves
     without it. A policy with no applications saves as a draft whatever else is
     true (`committed`), and an unfinished draft is allowed its errors.

     NOT IN THE SHOWCASE. The dialog could block on an error because the dialog
     LISTED the errors — you could read what was wrong and go and fix it. This
     build shows them nowhere: the panel's findings banner is behind `!SHOWCASE`
     (owner, 22 Sep 2026: "remove all the missing or broken or conflict
     messages") and the Check sheet is gone from every edition, so a blocked
     button here was a dead end — "1 error to fix first" on a screen with no
     errors on it (owner, 23 Sep 2026: "why is this save always disabled?").
     It happens easily: take the one condition off a rule and the rule can
     never run.

     A gate whose fault cannot be seen is worse than no gate, so the rule is
     "block only where the reason is readable". Put the findings back and this
     goes back with them. */
  const saveBlocked = !SHOWCASE && blockers > 0 && (draft.appIds.length > 0 || draft.isSystem === true)
  /* Straight to the store. The read-back dialog is still mounted below and is
     still what the walkthrough opens; the bar no longer goes through it.
     `keep-off` because turning a draft on was the dialog's other button, and
     that lives on the status pill beside the name. */
  const saveNow = () => {
    if (toPublish && !saveBlocked) checkThenPublish('keep-off')
  }

  /* --- Before saving (final spec, D.5) ------------------------------------------

     An enforcing policy — Active, or the Always-on system policy — runs the
     checks first, whichever door the save came through: the bar, ⌘↵, the
     palette, the panel's Save rule, the walkthrough's review. A clean result
     saves in the same press; the page opens only when a Must pass or
     Protected sign-in newly fails, or somebody is newly let in. A draft, an
     inactive or a monitoring policy saves as it always did: it decides
     nobody's sign-in, so there is nothing to check before it.

     Except when the save turns it on. A draft leaves draft only by being
     saved, so the walkthrough's review offers "Save and turn on" — and that is
     a turn on like the pill's (final spec D §1: every path that makes a policy
     decide real sign-ins runs the same checks). It opens Before turning on,
     always, on the draft as the board holds it. */
  const guardsSave = features.beforeTurningOn && !!saved && enforces(saved) && saved.type === 'App Access'
  const guardsTurnOn = features.beforeTurningOn && !!saved && saved.status === 'draft' && saved.type === 'App Access' && !saved.isSystem
  const stampNow = (): GuardStamp => ({ policies: store.policies, zones: store.zones, fingerprints: store.fingerprints, riskScale: store.riskScale })
  /* The policy's own checks join the saved sign-ins (describe spec, §5.5):
     those of the version being saved, which are the stored ones unless
     Describe it wrote this draft's on this visit — a described draft turned on
     from the walkthrough's review has not been stored yet. */
  const guardInput = (kind: SaveGuard['kind'], d: Policy, signIns = store.savedSignIns): GuardInput => {
    const after = committed(saved ?? d, d, kind === 'save' ? 'keep-off' : 'turn-on')
    return {
      kind,
      before: kind === 'save' ? (saved ?? null) : null,
      after,
      changedFrom: saved ?? null,
      policies: store.policies,
      env,
      apps: store.apps,
      savedSignIns: guardSignIns(signIns, after, store.users, store.apps, features.draftChecks),
      adminId: store.account.id,
      breakIn: features.breakInTest ? (store.breakInAccepted[d.id] ?? {}) : null,
      resolve,
    }
  }
  const holdGuard = (kind: SaveGuard['kind'], d: Policy, result: GuardResult | 'error', run: number, intent: CommitIntent) =>
    setGuard({ kind, result, stamp: stampNow(), run, intent, rules: d.rules, fallback: d.fallback })
  const checkThenPublish = (intent: CommitIntent) => {
    const turnsOn = intent === 'turn-on' && guardsTurnOn && !!saved && committed(saved, draft, 'turn-on').status === 'active'
    const kind: SaveGuard['kind'] | null = guardsSave ? 'save' : turnsOn ? 'turn-on' : null
    if (!kind) return publish(intent)
    if (checking) return
    setChecking(true)
    const d = draft
    afterPaint(() => {
      const result = tryRunGuard(guardInput(kind, d))
      setChecking(false)
      /* Turning on always opens its page (`guardOpens`); a save only when something interrupts. */
      if (result !== 'error' && !guardOpens(result)) return publish(intent)
      setReview(false)
      holdGuard(kind, d, result, 0, intent)
      setGuardOpen(true)
    })
  }
  /* The walkthrough's review, as an element that keeps its identity until
     it opens or the draft changes: closed, it still read the whole policy's
     findings on every render — every hop of a run's marker among them. */
  const commitRef = useRef(checkThenPublish)
  commitRef.current = checkThenPublish
  const onReviewCommit = useCallback((intent: CommitIntent) => commitRef.current(intent), [])
  const closeReview = useCallback(() => setReview(false), [])
  const reviewDialog = useMemo(
    () => <ReviewDialog open={review} policy={draft} from="board" onClose={closeReview} onCommit={onReviewCommit} />,
    [review, draft, closeReview, onReviewCommit],
  )

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
     edit. The palette and the tour select rules too — "Go to rule 3" — and a
     caller handed `setSelection` bare would light the card and open nothing.
     Harmless while the panel was always up; now that it is not, it is a dead
     end with nothing on screen to explain it. Every caller, one handler. */
  const select = (s: Selection) => {
    /* While Describe it is open a card opens the answer it came from, not the
       rule editor: the panel is what writes the cards (describe spec, §3.8). */
    if (describeOpen) {
      const key: AnswerKey | null = s.kind === 'rule' ? 'signIn' : s.kind === 'fallback' ? 'fallback' : s.kind === 'apps' ? 'apps' : null
      if (key) setDescribeFocus({ key, n: Date.now() })
      return
    }
    /* A card chosen on the chain — clicked, arrowed to, named in the palette —
       is a card to edit, so Read as text gives the column to its editor. A
       click on the background chose nothing, and the text stays. Its own
       sentences select without closing it (`pickFromText`). */
    if (readOpen && s.kind !== 'none') {
      setReading(false)
      setReadHover(null)
    }
    setSelection(s)
    if (s.kind !== 'none') setInspOpen(true)
    /* In test mode the rule opens in the test panel's column, in its place,
       and the chain stays folded — its check pills are what is being read. */
    if (testOn) {
      /* Only when the column's occupant actually changes: a click on the
         background with the panel already showing swaps nothing. */
      if ((s.kind !== 'none') !== hasSubject) setSwapped(true)
      return
    }
    /* Selecting a card unfolds it, and folds whatever was unfolded. The start
       node and a click on the background select no card, so they leave the
       chain as it is — nothing was chosen over the open card. */
    if (s.kind === 'rule') openOnly(s.id)
    else if (s.kind === 'fallback') openOnly('fallback')
  }
  /* The panel is on screen only when it has something to say AND has not been
     collapsed. One class for both, because the layout must not be able to tell
     them apart: either way the stage has the width back.

     What reads the class has shrunk to one thing — `.bb`'s own
     `grid-template-columns`. It used to be four: two floating toolbars and a
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

  /* --- Test mode ------------------------------------------------------------------

     Opening it clears the selection, so the right-hand column is the test
     panel; focus goes to its heading. Closing it hands focus back to the bar
     button it was opened from. */
  /* Every door into test mode does the same housekeeping: Describe it and
     Read as text give the column up (closed, not left latent behind the
     panel to come back when it closes), the selection clears, nothing is
     ringed from a row hovered last time, and the Break-in test starts
     afresh. A rule editor that held the column hands it over with the fade,
     not the slide. `force` for a door that another surface hands focus back
     through — the guard drawer, which restores its opener as it shuts. */
  const enterTest = (force = false) => {
    if (describing) finishDescribe()
    setReading(false)
    setReadHover(null)
    setTesting(true)
    setSwapped(panelShown)
    setSelection({ kind: 'none' })
    highlight.set(null)
    breakInKept.current = null
    focusSoon(() => testHeading.current, force)
  }
  const startTest = () => enterTest()
  /* The Break-in test, from a guard page's "Open": test mode opens on its
     tab, or the panel moves to it. */
  const openBreakInPage =
    pagesAllowed.breakIn && canTest
      ? () => {
          if (!testOn) enterTest(true)
          else {
            if (hasSubject) setSwapped(true)
            setSelection({ kind: 'none' })
            focusSoon(() => testHeading.current, true)
          }
          setTestTab('break-in')
        }
      : undefined
  /* Leaving test mode, by any door: Save sign-in's popover goes with it, and
     so does a ring from a row that was hovered as it closed — that row never
     sends its mouseleave. */
  const leaveTest = () => {
    setTesting(false)
    setSaveOpen(false)
    highlight.set(null)
  }
  const closeTest = () => {
    leaveTest()
    focusSoon(() => testButton.current?.querySelector<HTMLElement>('button') ?? null)
  }
  const toggleTest = () => (testOn ? closeTest() : startTest())
  /* Read as text (describe spec, §7.2). It takes the column from whatever
     holds it — the rule editor, Describe it (closed as Done closes it), or
     Try a sign-in — and gives it back on close: a card that is selected gets
     its editor again. Focus returns to the bar's button. */
  const closeRead = () => {
    setReading(false)
    setReadHover(null)
    focusSoon(() => readButton.current?.querySelector<HTMLElement>('button') ?? null)
  }
  const openRead = () => {
    if (describing) finishDescribe()
    if (testOn) leaveTest()
    setReading(true)
  }
  const toggleRead = () => (readOpen ? closeRead() : openRead())
  /* A sentence pressed: its card is selected, unfolded and brought into view,
     and the text stays open beside it. A rule only the live version still
     has is not on the board to select. */
  const pickFromText = (id: string) => {
    if (id !== 'fallback' && !draft.rules.some((r) => r.id === id)) return
    setSelection(id === 'fallback' ? { kind: 'fallback' } : ruleAt(id))
    openOnly(id)
    setFlash({ id, key: Date.now() })
  }
  /* The rule editor's ×, in test mode: the test panel comes back into the
     column on the tab it left (the tab is held here), and focus to its
     heading. */
  const backToTest = () => {
    setSwapped(true)
    setSelection({ kind: 'none' })
    focusSoon(() => testHeading.current)
  }
  /* The test panel's props, held still across a run, so the panel — a
     memoised component — sits out the marker's hops: the doors it calls
     through a ref kept current below, the rest memoised on what they read. */
  const panelCalls = useRef<{ close: () => void; fix: (next: Policy, toast: string) => void; openRule: (rule?: string) => void }>({
    close: () => {},
    fix: () => {},
    openRule: () => {},
  })
  const panelClose = useCallback(() => panelCalls.current.close(), [])
  const panelFix = useCallback((next: Policy, toast: string) => panelCalls.current.fix(next, toast), [])
  const panelOpenRule = useCallback((rule?: string) => panelCalls.current.openRule(rule), [])
  const go = store.go
  const openLibrary = useCallback((tab: 'saved' | 'people' | 'runs') => go({ name: 'sign-in-tests', tab }), [go])
  const panelScope = useMemo(() => boardScope(draft), [draft])
  const versionLabel = version?.label ?? 'Live'
  const breakInTab = pagesAllowed.breakIn
  const breakInView = useMemo(
    () =>
      breakInTab ? (
        <div className="tpanel__breakin">
          <BreakInView
            policy={draft}
            policies={store.policies}
            env={env}
            caption={`${draft.name} · ${versionLabel}`}
            onApplyFix={panelFix}
            onOpenInBoard={panelOpenRule}
            kept={breakInKept}
            layout="panel"
          />
        </div>
      ) : null,
    [breakInTab, draft, store.policies, env, versionLabel, panelFix, panelOpenRule],
  )

  /* Describe it's thread, reopened from the palette as from the door on the canvas. */
  const describeDoorCmd = !!saved && describeOffered(features.describePolicy, saved) && describeState.turns.length > 0 && !describeOpen && !testOn
  const boardCommands: Cmd[] = [
    { id: 'add', label: 'Add a rule', icon: Plus },
    ...(selAt >= 0
      ? ([
          { id: 'dup', label: `Duplicate rule ${selAt + 1} · ${selName}`, kbd: chord(['mod'], 'D', MAC), icon: CopyPlus },
          { id: 'del', label: `Delete rule ${selAt + 1} · ${selName}`, kbd: 'Del', icon: Trash2, danger: true },
        ] as Cmd[])
      : []),
    ...(toPublish ? ([{ id: 'publish', label: features.publish ? 'Review and publish' : 'Review and save', kbd: chord(['mod'], 'Enter', MAC), icon: Check }] as Cmd[]) : []),
    ...(canUndo(hist) || backToChooser ? ([{ id: 'undo', label: 'Undo', kbd: chord(['mod'], 'Z', MAC), icon: Undo2 }] as Cmd[]) : []),
    ...(canRedo(hist) ? ([{ id: 'redo', label: 'Redo', kbd: chord(['mod', 'shift'], 'Z', MAC), icon: Redo2 }] as Cmd[]) : []),
    /* Not in test mode, where the column is never hidden (the ⌘\ handler says why). */
    ...(hasSubject && !testOn ? ([{ id: 'panel', label: inspOpen ? 'Hide the panel' : 'Show the panel', kbd: chord(['mod'], '\\', MAC), icon: PanelRightClose }] as Cmd[]) : []),
    { id: 'keys', label: 'Keyboard shortcuts', kbd: '?', icon: Keyboard },
    ...(canTest ? ([{ id: 'try', label: testOn ? 'Close Try a sign-in' : 'Try a sign-in', kbd: 'T', icon: LogIn }] as Cmd[]) : []),
    ...(describeDoorCmd ? ([{ id: 'describe', label: 'Describe it', icon: PenLine }] as Cmd[]) : []),
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

  /* --- Describe it ------------------------------------------------------------

     The panel hands over its reading; the board composes it (describe-model.ts)
     and writes the rules and the last row as ONE history entry per opening of
     the panel. Applications are saved to the policy as the answer changes, as
     the start node's pane saves them; the name and the audience once, at ×.

     The thread (V4 §4.1) lives here for the visit, with the reading: closing
     keeps it, and the door on the canvas reopens it as it was. Opening closes
     Try a sign-in and Read as text; Try a sign-in closes it (`enterTest`). */
  const openDescribe = () => {
    if (testOn) leaveTest()
    session.current = describeSession(saved.audience, present.fallback)
    /* A thread goes on keeping its cards' ids from opening to opening, so a
       follow-up changes a card rather than replacing it. A new one starts afresh. */
    if (describeState.turns.length === 0) describeIds.current = new Map()
    openedWith.current = describeState
    setSelection({ kind: 'none' })
    setDescribeState((st) => withDraftApps(st, saved.appIds))
    setReading(false)
    setReadHover(null)
    setDescribing(true)
  }
  /* A composed draft from the answers: the last row the thread found when it
     began, where the answers give none. */
  const composeDescribed = (st: DescribeState, base: Policy) =>
    describedDraft(base, st.reading.answers, describeTenant, describeIds.current, st.origin ? st.origin.fallback : session.current?.fallbackBefore)
  const writeDescribe = (next: DescribeState, write: boolean) => {
    const answers = next.reading.answers
    /* Applications the text did not name are the policy's own, shown as they are. */
    const shown = answers.apps.origin === 'text' || answers.apps.origin === 'picked' ? next : withDraftApps(next, saved.appIds)
    setDescribeState(shown)
    if (!write || !session.current) return
    const { policy: composed, sources: from } = composeDescribed(shown, draft)
    /* The checks go in the same entry as the rules they were tried on, so
       Save policy stores them and Undo takes them back with the rules. */
    const policy = features.draftChecks ? withChecks(composed, shown.reading.answers, { ...checkCtx, sources: from }) : composed
    const before = bodyOf(histNow.current.present)
    const { hist: h, session: s } = writeDescribed(histNow.current, policy, session.current)
    session.current = s
    if (h !== histNow.current) {
      lastCommitted.current = h.present
      histNow.current = h
      setHist(h)
      const ids = changedCards(before, bodyOf(h.present))
      if (ids.length > 0) setFresh((f) => ({ ids, n: (f?.n ?? 0) + 1 }))
    }
    setSources(from)
    const apps = answers.apps
    if (apps.origin === 'text' || apps.origin === 'picked') {
      const latest = store.policyById(saved.id)
      const ids = apps.value ?? []
      if (latest && JSON.stringify(latest.appIds) !== JSON.stringify(ids)) store.savePolicy({ ...latest, appIds: ids })
    }
  }
  /* A message sent from the composer, an example or a follow-up chip. */
  const sendDescribe = (message: string) => {
    if (!session.current) return
    const audience = store.policyById(saved.id)?.audience ?? saved.audience
    const next = sendTurn(describeState, message, { dict: dictionaryOf(describeTenant), tenant: describeTenant, board: bodyOf(histNow.current.present), audience })
    if (next !== describeState) writeDescribe(next, true)
  }
  /* The latest turn's Undo: the board, the text and the reading as they were
     before it — in the history as this opening's one entry (describe-session.ts).
     The first turn's goes back to the chooser, as the toast's Undo does. */
  const undoDescribeTurn = () => {
    const out = undoTurn(describeState)
    if (!out || !session.current) return
    const now = histNow.current.present
    const to: Policy = { ...now, rules: out.board.rules, fallback: out.board.fallback, checks: out.board.checks }
    const { hist: h, session: s } = revertDescribed(histNow.current, to, session.current)
    session.current = s
    if (h !== histNow.current) {
      lastCommitted.current = h.present
      histNow.current = h
      setHist(h)
    }
    if (!out.first) {
      const shown = withDraftApps(out.state, saved.appIds)
      setDescribeState(shown)
      setSources(composeDescribed(shown, h.present).sources)
      const ids = changedCards(bodyOf(now), out.board)
      if (ids.length > 0) setFresh((f) => ({ ids, n: (f?.n ?? 0) + 1 }))
      return
    }
    const origin = describeState.origin
    setDescribeState(out.state)
    setDescribing(false)
    setTracing(null)
    setHoverLast(false)
    setSources({})
    setFresh(null)
    session.current = null
    openedWith.current = null
    const p = store.policyById(saved.id)
    if (p && origin && JSON.stringify(p.audience) !== JSON.stringify(origin.audience)) store.savePolicy({ ...p, audience: origin.audience })
    if (h.present.rules.length === 0) setScratch(false)
    focusSoon(() => document.querySelector<HTMLElement>('.bb__empty button') ?? document.getElementById('bb-start'))
  }
  /* The close button, Esc — and Try a sign-in, which takes the board. Keeps
     everything. */
  const finishDescribe = () => {
    if (!describing) return
    setDescribing(false)
    setTracing(null)
    setHoverLast(false)
    setFresh(null)
    const s = session.current
    session.current = null
    const opened = openedWith.current
    openedWith.current = null
    if (!s?.wrote) {
      focusSoon(() => document.querySelector<HTMLElement>('.bdsc-door') ?? document.getElementById('bb-start') ?? document.querySelector<HTMLElement>('.bb__empty button'))
      return
    }
    const latest = store.policyById(saved.id) ?? saved
    const taken = store.policies.filter((p) => p.id !== latest.id).map((p) => p.name)
    store.savePolicy({ ...latest, ...doneFacts(latest, describeState.reading.answers, describeTenant, taken) })
    /* The canvas stays up, as it does after "Start from scratch". */
    setScratch(true)
    const after = histNow.current.present
    store.showToast(RULES_ADDED, {
      label: 'Undo',
      run: () => {
        if (!alive.current) return
        const back = undoDescribed(histNow.current, after, s)
        if (!back) {
          store.showToast(`Other changes came after it. Use Undo in the toolbar (${chord(['mod'], 'Z', MAC)}).`)
          return
        }
        histNow.current = back.hist
        setHist(back.hist)
        const now = store.policyById(policyId)
        if (now) store.savePolicy({ ...now, audience: back.audience })
        /* The thread as this opening found it, so it says what the board now holds. */
        if (opened) setDescribeState(opened)
        /* No rules left: the chooser comes back. */
        if (back.chooser) setScratch(false)
        store.showToast('Restored')
      },
    })
    const first = after.rules[0]
    focusSoon(first ? byId(`bb-rule-${first.id}-title`) : () => document.getElementById('bb-start'))
  }
  /* A check pressed (describe spec, §5.4): the panel closes as Done closes it,
     toast and all, and Try a sign-in opens on this draft with the check's
     sign-in in its fields — Today beside Draft, and the marker's first run. */
  const tryCheck = (facts: SignInFacts) => {
    if (!canTest) return
    testingSession.loadBoard(saved.id, formOf(facts, store.zones))
    startTest()
  }
  const goFromDescribe = (to: 'create-zone' | 'device-profiles' | 'auth-methods') =>
    store.go(to === 'create-zone' ? { name: 'zones' } : to === 'device-profiles' ? { name: 'fingerprint' } : { name: 'methods' })
  /* The cards the answer under the pointer wrote: every card of this opening,
     for the answers that shape them, and the last row for its own. */
  const traced = !describeOpen || !tracing || tracing === 'apps'
    ? undefined
    : tracing === 'fallback'
      ? ['fallback']
      : [...describeIds.current.values()].filter((id) => draft.rules.some((r) => r.id === id))
  /* Read as text rings the card of the sentence under the pointer; while
     Describe it has just written, the cards it added or changed are named
     instead, and `.bb.is-fresh` draws them as an accent edge for 2 s. */
  const freshOn = describeOpen && !!fresh
  const ringed = readOpen && readHover ? [readHover] : freshOn && fresh ? fresh.ids : traced
  /* Describe it can be reopened on its thread while the policy is still a
     draft it may write to: the door on the canvas, and the palette. */
  const canDescribe = describeOffered(features.describePolicy, saved)
  const describeDoor = canDescribe && describeState.turns.length > 0 && !describeOpen && !testOn && !readOpen

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
    /* "From your text" stays on a card until the policy is saved. */
    setSources({})
    /* Draft → Monitoring goes through Save first (owner, 25 Sep 2026): a draft
       leaves draft only by being saved, so what is monitored is what was just
       on screen. The first save leaves it off, and the toast offers the one
       step on. */
    const canMonitor = offersMonitorAfterSave(saved, next, { monitor: store.features.monitorMode })
    store.showToast(
      commitToast(saved, next),
      canMonitor
        ? {
            label: 'Monitor',
            run: () => {
              store.setPolicyStatus(next.id, 'monitor')
              const { text, undo } = statusToast(next.name, 'inactive', 'monitor')
              store.showToast(text, undo ? { label: 'Undo', run: () => store.setPolicyStatus(next.id, undo) } : undefined)
            },
          }
        : undefined,
    )
  }
  /* Before saving's actions. A ready fix is an ordinary edit to the draft —
     on the undo stack, said in a toast with Undo, not saved — and the checks
     run again on the draft it leaves. A fix that leaves nothing to save closes
     the page; a draft turning on still has its turning on to do. */
  const recheckGuard = (d: Policy, signIns = store.savedSignIns) => {
    const kind = guard?.kind ?? 'save'
    holdGuard(kind, d, tryRunGuard(guardInput(kind, d, signIns)), (guard?.run ?? 0) + 1, guard?.intent ?? 'keep-off')
  }
  const applyGuardFix = (f: ReadyFix) => {
    const next = { ...draft, rules: f.policy.rules, fallback: f.policy.fallback }
    commitDraft(next)
    if (guard?.kind !== 'turn-on' && !differsFromLive(saved, next)) {
      setGuardOpen(false)
      store.showToast('Nothing left to save')
      return
    }
    offerUndo(`${f.label}. Not saved yet.`)
    recheckGuard(next)
  }
  /* "Expect Deny instead": the saved sign-in takes the new expectation, with
     who, when and why, and the checks run again on it at once — the store's
     copy arrives a render later. */
  const expectInstead = (c: SignInCheck, reason: string) => {
    const patch = overridePatch(c, reason, store.account.name, new Date().toISOString())
    if (!patch) return
    store.updateSavedSignIn(c.signIn.id, patch)
    recheckGuard(draft, patchSignIns(store.savedSignIns, c.signIn.id, patch))
  }
  const rerunGuard = () => recheckGuard(draft)
  const revealRule = (index: number | null) =>
    setFlash({ id: index === null ? 'fallback' : (draft.rules[index]?.id ?? 'fallback'), key: Date.now() })

  /* Back to the live rules, and a saved draft goes too — that case asks first,
     and only that case resets the undo stack. */
  const revert = () => {
    setHist(historyOf({ ...saved, pendingDraft: undefined }))
    if (saved.pendingDraft) store.discardDraft(saved.id)
    setConfirmDiscard(false)
  }
  /* Unsaved edits alone are rolled back as one more step, so undo brings them
     back. Discard sits next to Save draft, and a mis-click cost the session. */
  const discardEdits = () => {
    setHist((h) => revertTo(h, saved))
    store.showToast(`Changes discarded. Press ${chord(['mod'], 'Z', MAC)} to undo.`)
  }
  const discard = () => (saved.pendingDraft ? setConfirmDiscard(true) : discardEdits())

  /* A Break-in fix, from the test panel: an ordinary edit to the draft, on the undo
     stack and said in a toast with Undo — not saved (final spec, D §3.7). */
  const applyPanelFix = (next: Policy, toast: string) => {
    commitDraft({ ...draft, rules: next.rules, fallback: next.fallback })
    offerUndo(toast)
  }
  /* A rule named on the Break-in test: opened on the chain, in the right-hand
     column in the test panel's place, and shown there. Its × comes back to
     the Break-in test's tab. */
  const openRuleFromPanel = (rule?: string) => {
    if (!rule) return
    const r = rule === 'fallback' ? null : draft.rules.find((x) => x.id === rule)
    if (rule !== 'fallback' && !r) return
    select(r ? ruleAt(r.id) : { kind: 'fallback' })
    setFlash({ id: rule, key: Date.now() })
  }
  panelCalls.current = { close: closeTest, fix: applyPanelFix, openRule: openRuleFromPanel }
  const testApp = trying?.form.appId ? (store.apps.find((a) => a.id === trying.form.appId) ?? null) : null
  const testPerson = trying?.form.personId ? (store.users.find((u) => u.id === trying.form.personId) ?? null) : null
  /* Why this policy is not the one deciding, when it is not: on the spine's
     gate and in the panel's why-line, in the same words. */
  const whichReason = trying && !trying.route.policy.decides ? notDecidingReason(trying.right.resolution, draft.id, trying.route.who) : undefined
  const testChain: TestChain | null = trying
    ? {
        route: trying.route,
        at: trying.at,
        ms: trying.ms,
        fadeIn: trying.fadeIn,
        reached: trying.reached,
        fade: trying.fade,
        changed: trying.changed,
        appName: testApp?.name ?? 'this application',
        appId: testApp?.id ?? null,
        person: testPerson,
        audience: audienceOf(trying.route.who),
        /* Not "Not in this policy" on the gate: the start node right above it
           already says so in the same words. */
        whichReason: trying.route.who.state === 'fail' ? undefined : whichReason,
        which: whichList,
        columns: trying.columns,
        whatTheySee,
      }
    : null
  /* The one line under the verdict: the rule that decided, who decided
     instead and why, or what is missing (test-mode.ts). */
  const why = trying
    ? whyLine({ right: trying.columns.at(-1), decision: trying.route.decision, decides: trying.route.policy.decides, reason: whichReason })
    : ''

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
        edits={boardEdits}
        onEditsFix={(next, toast) => {
          /* Before turning on's ready fix: an edit like any other, undoable. */
          commitDraft({ ...draft, rules: next.rules, fallback: next.fallback })
          offerUndo(toast)
        }}
        onRevealRule={revealRule}
        onOpenBreakIn={openBreakInPage}
        onLearn={() => setTour(true)}
        onWatchDemo={() => setDemo(true)}
        actions={
          <BoardBarActions
            reading={readOpen}
            onRead={toggleRead}
            readRef={readButton}
            testing={testOn}
            canTest={canTest}
            onTest={toggleTest}
            testRef={testButton}
            toPublish={toPublish}
            unsaved={unsaved}
            canDiscard={unsaved || hasDraft}
            blockers={blockers}
            onSaveDraft={saveDraft}
            onDiscard={discard}
            saveBlocked={saveBlocked}
            checking={checking}
            onSave={saveNow}
          />
        }
      />

    <div
      ref={shell}
      /* Test mode keeps the ordinary two tracks: the right-hand one always
         holds something while it is on — the test panel, or the rule editor
         in its place — so it is never closed. */
      /* Describe it opens its own leading track and keeps the right one
         closed (V4 §4.1): the inspector never stands beside it. */
      className={`bb ${testOn ? 'is-testing' : ''} ${describeOpen ? 'is-left-open' : ''} ${testOn || panelShown || readOpen ? '' : 'is-insp-closed'} ${freshOn && fresh ? `is-fresh is-fresh${fresh.n % 2}` : ''} ${gripping ? 'is-gripping' : ''} ${snapping ? 'is-snap' : ''}`}
      style={{ '--bb-insp': `${colW}px` } as React.CSSProperties}
    >
      {/* The canvas comes into existence when there is something on it.

          A policy with no rules used to draw the chooser INSIDE the pan-and-zoom
          world, which meant the first thing anybody met could be panned off
          screen. `BoardEmpty` is an ordinary screen; `Board` is the canvas; and
          the board only ever mounts one of them.

          Test mode draws the empty chain in the chooser's place — the start
          node, the gates, the last row and the Decision — because the route
          still runs down it. It does not set `scratch`, so the chooser is back
          when test mode closes. Read as text does the same: its sentences
          are about the start node and the last row, so those are what sit
          beside it, and the chooser was too wide to share the width. */}
      {draft.rules.length === 0 && !scratch && !testOn && !describing && !readOpen ? (
        <BoardEmpty
          /* "No rules" once the policy is live or had rules; the first-run
             question only for a new draft nobody has written in yet. */
          fresh={saved.status === 'draft' && saved.rules.length === 0 && !canUndo(hist)}
          fallback={(draft.fallback ?? fallbackRule()).decision}
          onEditDefault={() => select({ kind: 'fallback' })}
          onUndo={canUndo(hist) ? () => setHist(undo) : undefined}
          undoLabel={`Undo (${chord(['mod'], 'Z', MAC)})`}
          onUseTemplate={() => setPicking(true)}
          /* Describe it on a new draft only: it saves the audience straight to
             the policy, and a direct write to one that decides sign-ins would
             skip the checks before saving (describe spec, §2). */
          onDescribe={describeOffered(features.describePolicy, saved) ? openDescribe : undefined}
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
          /* In test mode, the application the sign-in being tried arrives at.
             Otherwise the chain's first node names ONE application, and says
             how many more beside it — the bar no longer carries them. */
          testApp
            ? testApp.name
            : draft.appIds.length > 0
              ? (appsOf(draft, store.apps)[0]?.name ?? null)
              : draft.isSystem
                ? 'any application'
                : null
        }
        /* The first application's id, for its logo in the start pill, so the
           logo and the name beside it are the same application. */
        destinationAppId={testApp ? testApp.id : draft.appIds.length > 0 ? (appsOf(draft, store.apps)[0]?.id ?? null) : null}
        destinationMore={testApp ? 0 : Math.max(appsOf(draft, store.apps).length - 1, 0)}
        selection={selection}
        diagnostics={diagnostics}
        shadowed={shadowed}
        test={testChain}
        fitKey={layout}
        flash={flash}
        resolve={resolve}
        onSelect={select}
        expandedOf={testOn ? FOLDED : expandedOf}
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
        onHoverLast={describeOpen ? setHoverLast : undefined}
        sources={sources}
        /* In test mode, the card a row in the test panel lands on: read by
           each card from the store, so a hover re-renders two cards. */
        traced={testOn ? undefined : ringed}
        highlight={testOn ? highlight : undefined}
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
          /* Not in test mode: every card stays folded there, so Expand all
             would promise what the route will not do. */
          testOn ? undefined : (
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
          )
        }
      />
      )}


      {(testOn || panelShown || readOpen) && (
        <div
          className="bb__grip"
          role="separator"
          aria-orientation="vertical"
          aria-label={testOn ? 'Resize Try a sign-in' : 'Resize the inspector'}
          aria-valuenow={colW}
          aria-valuemin={testOn ? PANEL_MIN_W : 320}
          aria-valuemax={testOn ? PANEL_MAX_W : 720}
          tabIndex={0}
          onPointerDown={onGrab}
          onPointerMove={onDrag}
          onPointerUp={onDrop}
          /* Arrow keys move it too. A divider that only responds to a drag is a
             divider somebody navigating by keyboard cannot move at all. */
          onKeyDown={(e) => {
            const set = testOn ? setTestW : setInspW
            if (e.key === 'ArrowLeft') set((w) => setW(w + 24, testOn))
            else if (e.key === 'ArrowRight') set((w) => setW(w - 24, testOn))
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
      {/* Try a sign-in's test panel (V4 §2.4-bis), in the right-hand column:
          the sentence, what it gets and why, then the tests as tabs. A card
          clicked on the chain puts the rule editor in its place (below), and
          the editor's × brings it back on the same tab. */}
      {testOn && trying && !hasSubject && (
        <TestPanel
          draft={draft}
          version={version}
          form={trying.form}
          onPatch={trying.patch}
          onLoad={trying.load}
          rows={trying.rows}
          issues={trying.issues}
          boundaries={trying.boundaries}
          scope={panelScope}
          idPrefix={TRY_PREFIX}
          columns={trying.columns}
          why={why}
          shown={trying.right.resolution.status === 'decided' ? trying.right.resolution.decision : null}
          onReplay={trying.replay}
          onClose={panelClose}
          saveOpen={saveOpen}
          onSaveOpenChange={setSaveOpen}
          views={views}
          tab={testTab}
          onTab={setTestTab}
          breakIn={breakInView}
          onHighlight={highlight.set}
          onOpenLibrary={openLibrary}
          headingRef={testHeading}
          swap={swapped}
        />
      )}

      {/* Try a sign-in's status region (Spec A §7): the decision once per run,
          an update that moved it, a step's stage.

          Here rather than in the panel, and mounted whether or not test mode
          is on. The rule editor takes the panel's column in test mode, and an
          edit made there moves the answer — "Now Deny. Changed by your
          edits." — with the panel unmounted. A region mounted with its text
          already in it is not reliably read either, so it is always here and
          only its words come and go. */}
      <p role="status" className="u-sr-only">
        {testOn && trying ? trying.said : ''}
      </p>

      {/* Describe it, on the left in its own track (V4 §4.1). The selection
          is cleared while it is open, so the rule editor is never beside it. */}
      {describeOpen && (
        <DescribePanel
          tenant={describeTenant}
          policyId={saved.id}
          state={describeState}
          board={describeBoard}
          onState={writeDescribe}
          onSend={sendDescribe}
          onUndoTurn={undoDescribeTurn}
          onDone={finishDescribe}
          onGo={goFromDescribe}
          focus={describeFocus}
          bold={hover !== null ? 'signIn' : hoverLast ? 'fallback' : null}
          onTrace={setTracing}
          checks={describeChecks}
          onTryCheck={canTest ? tryCheck : undefined}
        />
      )}
      {/* And the way back to it while it is closed: its thread is kept. */}
      {describeDoor && (draft.rules.length > 0 || scratch) && (
        <button type="button" className="bdsc-door" onClick={openDescribe}>
          <PenLine size={14} strokeWidth={2} aria-hidden />
          Describe it
        </button>
      )}

      {/* Read as text, in the inspector's slot. A sentence pressed selects its
          card and the text stays; the rule's editor waits until it closes. */}
      {readOpen && <ReadAsTextPanel saved={saved} draft={draft} onClose={closeRead} onHover={setReadHover} onPick={pickFromText} />}

      {!describeOpen && !readOpen && (testOn ? hasSubject : panelAlive) && (
        <Inspector
          leaving={!testOn && panelLeaving}
          testing={testOn}
          swap={testOn && swapped}
          draft={draft}
          selection={selection}
          /* What is wrong with the rule on screen, said where it is edited.
             No edition has a Check sheet, so this is the only place the
             reason for "Needs setup" is written down. */
          diagnostics={selAt >= 0 ? diagnostics.filter((d) => d.ruleIndex === selAt) : []}
          onPatchRule={patchRule}
          onPatchFallback={patchFallback}
          onRemoved={offerUndo}
          /* The panel's own save — the bar's act, at the foot of the form,
             in the bar's other words and a quieter weight. */
          canSave={toPublish && !saveBlocked}
          saveLabel="Save rule"
          saveTitle={
            !toPublish
              ? 'Nothing to save'
              : saveBlocked
                ? `${blockers} error${blockers === 1 ? '' : 's'} to fix first`
                : undefined
          }
          onSave={saveNow}
          onAppsSaved={() => {
            if (testOn) return backToTest()
            setInspOpen(false)
            setSelection({ kind: 'none' })
            focusSoon(() => document.getElementById('bb-start'))
          }}
          onClose={() => {
            if (testOn) return backToTest()
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
          onMoveRule={move}
          onDuplicateRule={duplicate}
          onDeleteRule={remove}
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
            else if (id === 'publish') saveNow()
            else if (id === 'panel') setInspOpen((v) => !v)
            else if (id === 'keys') setKeys(true)
            else if (id === 'try') toggleTest()
            else if (id === 'describe') openDescribe()
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
          {keys && boardShortcuts({ mac: MAC, commands: features.commands, testing: features.trySignIn, publish: features.publish }).map(([k, what]) => (
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
          exposes to its own controls — insert, patch, select — so
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

      {/* The walkthrough's review saves through the same checks as the bar. */}
      {reviewDialog}

      {/* Before saving: your edits — or, for a draft the review turns on,
          Before turning on. Portalled, so the bar's stacking cannot trap its scrim. */}
      {guard &&
        createPortal(
          <GuardDrawer
            open={guardOpen}
            kind={guard.kind}
            policyName={saved.name}
            result={guard.result}
            run={guard.run}
            primaryLabel={guard.kind === 'turn-on' ? 'Turn on' : features.publish ? 'Publish policy' : 'Save policy'}
            onConfirm={() => {
              setGuardOpen(false)
              publish(guard.intent)
            }}
            onClose={() => setGuardOpen(false)}
            stale={guardOpen && (isStale(guard.stamp, stampNow()) || guard.rules !== draft.rules || guard.fallback !== draft.fallback)}
            onRerun={rerunGuard}
            onApplyFix={applyGuardFix}
            onOverride={expectInstead}
            onRevealRule={revealRule}
            /* The Break-in row's Open pushes the panel's Break-in
               test. The drawer shuts in the same commit, so the test's Back
               takes focus after the drawer hands it back. */
            onOpenBreakIn={
              openBreakInPage &&
              (() => {
                setGuardOpen(false)
                openBreakInPage()
              })
            }
          />,
          portalRoot(),
        )}

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
