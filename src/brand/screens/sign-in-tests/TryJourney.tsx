import { animate, motion, useReducedMotion, type AnimationPlaybackControls } from 'motion/react'
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type LazyExoticComponent, type PointerEvent } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Maximize, ZoomIn, ZoomOut } from 'lucide-react'

import type { AccessDecision, Policy } from '../../data'
import { Tip } from '../../kit'
import { useBrand, useNameLookup } from '../../store'
import type { AppBreakInSummary } from '../break-in-app'
import { columnView, columnsFor, runColumns, type ColumnSpec, type ColumnView } from '../board/try-sign-in'
import { useSimEnv } from '../sim-env'
import { evaluatedList } from '../tenant-resolver'
import { rowsRead } from '../testing/rows-read'
import { screensOf } from '../testing/screens-of'
import { decisionSig, liveSentence } from '../testing/selectors'
import { useTestingSay, useTestingSession } from '../testing/session-state'
import { CHANGED_BY_WORDS, changedBy, factsOf, type FormField, type SignInForm } from '../testing/sign-in-form'
import type { AttemptsFrom } from './attempts'
import { engineRun } from './engine-run'
import { Answer, EngineJourney, EngineLine } from './EngineJourney'
import { HowItWorks } from './HowItWorks'
import { heroFinding, type FoldAsk, type FoldMode } from './journey'
import type { RunLayoutProps } from './layouts/types'
import { OWN_EDIT, type RunLayoutId } from './run-layout'
import { SignInNode } from './SignInCard'
import type { TryPage } from './sign-in-card'
import { useEngineRun } from './use-engine-run'

/* The run's other layouts (run-layout.ts), each loaded only once it is
   chosen — so a layout being drawn never holds up the column, nor another. */
const LAYOUTS: Record<Exclude<RunLayoutId, 'column'>, LazyExoticComponent<ComponentType<RunLayoutProps>>> = {
  line: lazy(() => import('./layouts/LineLayout')),
  tree: lazy(() => import('./layouts/TreeLayout')),
  gates: lazy(() => import('./layouts/GatesLayout')),
  marble: lazy(() => import('./layouts/MarbleLayout')),
  chat: lazy(() => import('./layouts/ChatLayout')),
  deck: lazy(() => import('./layouts/DeckLayout')),
  depth: lazy(() => import('./layouts/DepthLayout')),
  jarvis: lazy(() => import('./layouts/JarvisLayout')),
  jarvis2: lazy(() => import('./layouts/Jarvis2Layout')),
  mission: lazy(() => import('./layouts/MissionLayout')),
  synapse: lazy(() => import('./layouts/SynapseLayout')),
  pulse: lazy(() => import('./layouts/PulseLayout')),
  focus: lazy(() => import('./layouts/FocusLayout')),
  brief: lazy(() => import('./layouts/BriefLayout')),
  circuit: lazy(() => import('./layouts/CircuitLayout')),
  stream: lazy(() => import('./layouts/StreamLayout')),
  bento: lazy(() => import('./layouts/BentoLayout')),
  directions: lazy(() => import('./layouts/DirectionsLayout')),
  explainer: lazy(() => import('./layouts/ExplainerLayout')),
  pass: lazy(() => import('./layouts/PassLayout')),
}

/* -----------------------------------------------------------------------------
   The canvas of the Sign-in tests page (TESTING-V4 §14.3): an ENGINE RUN
   (§8.3–8.6, §13), always in one vertical column (§12.3), on the builder's
   dotted ground.

   Before the first run of a visit the canvas explains itself (HowItWorks.tsx),
   centred in the whole canvas — the panel is shut on arrival (owner, 30 Sep:
   "don't show the configuration on the right side the first time") — the
   four stages a run takes, each stage's icon on a spine, the first with the
   page's two ways in (owner, 1 Oct): Check access, which opens the panel on
   the sign-in's form (TryPanel.tsx), and Saved sign-ins, which opens it on
   the saved ones (`onSaved`). Run there, a change to a field after a run, a
   saved sign-in — each is a load in the testing session, and the canvas
   plays the run the moment it is newer than the one it has played:

     the sign-in as one sentence — a press on it opens the panel on the
       sign-in — the policy node holding its rules, the answer

   The plan is engine-run.ts's, the clock use-engine-run.ts's, the chain
   EngineJourney's (vertical). A run started from the panel shuts the panel
   and hands the focus to the canvas (`focusRun`): Skip, then Replay.

   The canvas moves as the builder's does, with no scrollbar of its own
   (owner, 30 Sep: "the scrollbar looks weird"): a drag on the ground pans
   it, the wheel or a trackpad pans it, Ctrl/⌘ with the wheel (a pinch)
   zooms about the pointer. The journey's scroller is kept — the engine keeps
   its step in view by it — with its bars hidden (sign-in-tests.css), and a
   quiet cue at the canvas's right edge says where in the run the view is,
   drawn only when the run is taller than the canvas.

   Under the run, the builder's view dock (`.bb__dock`): Expand all /
   Collapse all (one labelled button, the builder's own, sending `fold` to the
   chain), then Fit and zoom out and in. The zoom scales the run's column (a
   CSS `zoom` on the stage, which motion never animates) and the ground's
   dots with it; a change glides by motion's `animate` on the variable, about
   the canvas's middle (the pointer, for the wheel). As the answer lands the
   view is placed (`onFit`, from the chain as its answer step begins — in
   place of following the engine down to the answer; the page's own measure
   if the chain never says), and placed again once the chain has folded to
   its glance — the person and the policy folded to their heads, the answer the hero
   — which fits the canvas at 1440 × 900 and 1280 × 800 and is shown whole,
   from its start: never zoomed out (the run's words stay at their size, the
   12 px floor), and the run measured to the answer's foot. A run that does
   not fit puts the part that decided just under the engine line — the rule
   that matched, down to the answer, or, where that is too tall, the rule
   that also applies (a conflict) — or the answer's foot at the canvas's.
   One glide of the scroll (and the zoom, for Fit
   to view), never a move and then another. Fit to view is the one press
   that zooms out to fit, as far as the dock's least. Room is kept under the
   run for the dock, outside the zoom, so the dock never covers its end. No
   dock on the empty canvas — the builder's empty policy has none either.

   The run is kept by the page (SignInTests.tsx `TryPage`), so a revisit shows
   where it was, settled, and never plays again; a newer run in the testing
   session (Run, a field changed, a saved sign-in, Replay) is what plays.
   Reduced motion is the settled canvas at once, and every zoom is a jump.

   The same canvas inside a policy (owner, 1 Oct 2026: "change the try a sign
   in inside policy builder with the current sign in tests we have"): the
   builder's Check access (board/PolicyCheck.tsx) hands it the policy as
   stored and the draft on the board (`policy`), and its own sign-in and run
   (`run`) — one per policy, kept by the session's `boardForms`. The run is
   then resolved with the draft standing in, by the board's version table
   (try-sign-in.ts `columnsFor`: the edits, the stored rules as though on for
   a policy that is off, the draft for a draft) — unsaved edits are what is
   tested — and drawn as THIS policy's trace (engine-run.ts `focus`: it and
   the policy that decides, when another does), its rule cards the draft's.
   Where the draft changes the answer the tenant gives today, the answer says
   so once, in the words the page already has for a re-run that moved it:
   "Changed by your edits", or "Changed by turning it on" for a policy that
   is not on; both versions go to the answer as its `columns`. Nothing else
   is drawn differently.

   Break-in attempts on the run's application (owner, 1 Oct 2026) are the
   page's to run and hand down (`breakIn`, SignInTests.tsx): the chain says
   them once the run is done, and Review attempts goes back up to the page,
   which owns the panel. Inside a policy there are none: the builder's Check
   access passes nothing, and its Break-in test stays hidden.
   -------------------------------------------------------------------------- */

/** The single verdict column: the tenant, as every policy is saved. */
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }

/** The dock's zoom: the builder's range and step. */
const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.4
const ZOOM_STEP = 1.15
const clampZoom = (z: number) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100
/** A zoom's glide. */
const GLIDE = { duration: 0.28, ease: [0.2, 0, 0, 1] as const }
/** The view placed as a run lands, or fitted: one glide of the scroll (and the zoom), as the chain's follow glides. */
const VIEW_GLIDE = { duration: 0.6, ease: [0.4, 0, 0.2, 1] as const }
/* Where an element is down the stage, at zoom 1: its layout offsets (never
   a transform — the answer springs in), summed up to the stage. Chrome's
   offsets inside a CSS `zoom` are the unzoomed ones. */
function stageY(el: HTMLElement, stage: HTMLElement): number {
  let y = 0
  let at: HTMLElement | null = el
  while (at && at !== stage) {
    y += at.offsetTop
    at = at.offsetParent as HTMLElement | null
  }
  return y
}
/* How long after a run lands the page fits it itself, should the chain not
   have said its settled height by then. */
const FIT_FALLBACK_MS = 900
/** How long the cards take to open or fold after Expand all / Collapse all, before the chain is fitted again. */
const FOLD_SETTLE_MS = 560
/* What a drag on the canvas never starts on: anything pressed, typed in or
   read — only the ground between and around the cards pans. */
const NO_PAN = 'button, a, input, select, textarea, label, [role="button"], [contenteditable], .bb__card, .bb__start, .tj-out, .tj-why, .tj-engine'

const noop = () => {}

export interface TryJourneyProps {
  page: TryPage
  onPage: (next: (p: TryPage) => TryPage) => void
  /** A group was chosen in the Person picker: its name, and the nodes say "A member of …". */
  asGroup?: string | null
  /** The dock's zoom, kept by the page so the ground's dots follow it. */
  zoom?: number
  onZoom?: (z: number) => void
  /** The person node was pressed: the panel opens on the sign-in. */
  onNode?: () => void
  /** Add on a Not stated row: the panel opens, and its row for that fact takes the focus and opens. */
  onAdd?: (field: FormField) => void
  /** Saved sign-ins on the empty canvas: the panel opens on the saved ones. Absent, there are none to show and the button is left out. */
  onSaved?: () => void
  /** A run that asked to be saved (New sign-in) has landed: Save sign-in opens. */
  onAskSave?: () => void
  /** Changes when a run was started from the panel or a picker that has gone: the canvas takes the focus. */
  focusRun?: number
  /** What the panel beside the canvas holds, if it is open: the empty canvas's button for it is pressed. */
  panel?: 'form' | 'saved' | null
  /** A row of the why's "As each group" pressed: the sign-in runs again as "Anyone in <group>". */
  onAsGroup?: (groupId: string) => void
  /* The saved sign-in the run was loaded from, as it was loaded: what it
     expects, said beside the answer when the answer is not it — while the
     sign-in on the canvas is still that one. A break-in attempt's carries
     its factor where that is what failed (break-in-app.ts `attemptPlay`). */
  loaded?: { form: SignInForm; expected: AccessDecision; weaker?: string | null } | null
  /* Inside a policy (the builder's Check access): the policy as stored and
     the draft on the board. The run is resolved with the draft standing in
     and drawn as this policy's trace. Absent, the tenant as it stands. */
  policy?: { saved: Policy; draft: Policy } | null
  /* The sign-in that runs and its run, where they are not the testing
     session's: the builder keeps one sign-in per policy and counts its own
     runs, and Replay is its own. Absent, the session's. */
  run?: { form: SignInForm; runId: number; replay: () => void } | null
  /** Open policy and Open rule, from the answer, the cards and the why. Absent, the page's: that policy's builder, in Check access. */
  onOpenPolicy?: (policyId: string) => void
  onOpenRule?: (policyId: string, ruleId: string) => void
  /* The why in the page's right-hand panel (EngineJourney.tsx `why`): open,
     the panel's body, and the way to open or shut it. Absent, under the answer. */
  why?: { open: boolean; slot: HTMLElement | null; onOpen: (open: boolean) => void }
  /* Break-in attempts on the run's application, the page's run of them, and
     whether their panel is open; Review attempts asks the page to open it
     (EngineJourney.tsx `breakIn`). Absent — the builder's Check access — none. */
  breakIn?: { summary: AppBreakInSummary; open: boolean } | null
  onReviewBreakIn?: (from: AttemptsFrom) => void
  /* Replay pressed: a new run of the same sign-in. The page shuts what
     stands beside a run that is over — the why, the attempts — as every
     other run does (SignInTests.tsx `start`). */
  onReplay?: () => void
  /* Edit sign-in on the run's line, in every layout (owner, 2 Oct 2026:
     "I can't see an option to find the edit in some canvases"): the form's
     panel, and whether it is open; `unrun`, the form has changes Run has not
     checked yet. Absent, no button. */
  onEdit?: () => void
  editing?: boolean
  unrun?: boolean
  /** Which layout the run is drawn in (run-layout.ts). Absent, the column. */
  layout?: RunLayoutId
}

export function TryJourney({
  page,
  onPage,
  asGroup = null,
  zoom = 1,
  onZoom = noop,
  onNode = noop,
  onAdd = noop,
  onAskSave = noop,
  focusRun = 0,
  onSaved,
  panel = null,
  onAsGroup,
  loaded = null,
  policy = null,
  run = null,
  onOpenPolicy,
  onOpenRule,
  why,
  breakIn = null,
  onReviewBreakIn,
  onReplay,
  onEdit,
  editing = false,
  unrun = false,
  layout = 'column',
}: TryJourneyProps) {
  const store = useBrand()
  const { users, groups, apps, zones, fingerprints, policies, methods, defaultMethodId } = store
  const session = useTestingSession()
  const say = useTestingSay()
  const env = useSimEnv()
  const names = useNameLookup()
  const reduced = useReducedMotion() === true
  const lib = useMemo(() => ({ zones, fingerprints }), [zones, fingerprints])
  /* The group chosen in the Person picker, by name, for the person node. */
  const asGroupName = asGroup ? (groups.find((g) => g.id === asGroup)?.name ?? null) : null

  // --- The sign-in that runs, and its answer ---

  const form = run?.form ?? session.form
  const runId = run?.runId ?? session.runId
  const saved = policy?.saved ?? null
  const draft = policy?.draft ?? null
  /* The facts the rules on the application read — inside a policy, its
     draft's rules in place of the stored ones. */
  const rows = useMemo(() => rowsRead(policies, draft, form.appId, lib), [policies, draft, form.appId, lib])
  const facts = useMemo(() => factsOf(form, zones).facts, [form, zones])
  /* The versions in play, the last the one drawn: the tenant as it stands —
     or, inside a policy, today and then the draft as it would decide. */
  const specsFor = useCallback((appId: string | null): ColumnSpec[] => (saved && draft ? columnsFor(saved, draft, appId) : [AS_IT_STANDS]), [saved, draft])
  const cols = useMemo(() => runColumns(specsFor(form.appId), policies, facts, env), [specsFor, form.appId, policies, facts, env])
  const right = cols[cols.length - 1]
  const res = right.resolution
  const substitute = right.spec.substitute
  const focus = draft?.id ?? null
  const ctx = useMemo(() => ({ people: users, apps, zones, rows }), [users, apps, zones, rows])
  /* The panel is the form: every run on the page begins with the engine. */
  const live = useMemo(
    () => engineRun({ res, policies, form, facts, env, ctx, names, intro: 'none', substitute, focus }),
    [res, policies, form, facts, env, ctx, names, substitute, focus],
  )
  const columns: ColumnView[] = useMemo(
    () => cols.map((c) => columnView(c, focus ?? '', policies, (id) => apps.find((a) => a.id === id)?.name ?? id)),
    [cols, focus, policies, apps],
  )
  /* The rule cards in the policy node: the draft's, where it stood in. */
  const cardPolicies = useMemo(() => (substitute ? evaluatedList(policies, substitute) : undefined), [policies, substitute])
  const screens = useMemo(
    () => screensOf(res, { policies, substitute, methods, defaultMethodId, person: users.find((u) => u.id === form.personId) ?? null }),
    [res, policies, substitute, methods, defaultMethodId, users, form.personId],
  )
  /* Inside a policy, the draft giving another answer than the tenant does
     today is the answer's to say, from both `columns`: "Live [Allow on 1
     factor] → Your edits [Allow with 2FA]" (EngineJourney.tsx `Answer`). */
  /* A sign-in as the version drawn resolves it: the sign-in before an edited re-run. */
  const resolveDrawn = (f: SignInForm) => runColumns(specsFor(f.appId).slice(-1), policies, factsOf(f, zones).facts, env)[0].resolution

  // --- The run: waiting, playing, settled ---

  const pending = page.mode === 'journey' && runId > page.played && !live.empty
  /* The waiting run's plan is the settled one: it begins with the engine. */
  const pendingPlan = pending ? live : null
  const [changed, setChanged] = useState<string | null>(null)
  /* Expand all / Collapse all, from the dock; a new run folds as the chain folds it ('auto'). */
  const [fold, setFold] = useState<FoldAsk>({ mode: 'auto', seq: 0 })
  /* The landed run has been fitted to the canvas (by the chain's `onFit`, or the page's own measure). */
  const fitted = useRef(false)
  const clock = useEngineRun({
    live,
    pending: pendingPlan,
    runId,
    replay: page.replay,
    pace: page.pace,
    reduced,
    say,
    /* The answer, and the findings' one line when there is one: "… Maya Iyer is in Engineering and Finance — Engineering's rule applies first". */
    sentence: () => {
      const said = liveSentence(res, policies, substitute)
      const also = heroFinding(live)?.text ?? ''
      return also ? `${said} ${also}.` : said
    },
    onStart: (id) => {
      onPage((p) => ({ ...p, played: id, askSaveFor: p.askSaveFor === id ? id : null }))
      setChanged(null)
      setFold((f) => (f.mode === 'auto' ? f : { mode: 'auto', seq: f.seq + 1 }))
      fitted.current = false
    },
  })
  const { shown, s, running, jumped } = clock
  const skipRef = useRef<HTMLButtonElement | null>(null)
  const replayRef = useRef<HTMLSpanElement | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const journey = !(page.mode === 'form' || live.empty)

  /* Landed: what an edited re-run changed, once, and Save when New sign-in
     asked for it — for this run. */
  const wasRunning = useRef(running)
  useEffect(() => {
    const landed = wasRunning.current && !running
    wasRunning.current = running
    if (!landed) return
    if (page.prev) {
      const before = resolveDrawn(page.prev)
      const field = decisionSig(before) !== decisionSig(res) ? changedBy(page.prev, form) : null
      setChanged(field ? CHANGED_BY_WORDS[field] : null)
    }
    if (page.askSaveFor !== null && page.askSaveFor === page.played) onAskSave()
    if (page.prev || page.askSaveFor !== null) onPage((p) => ({ ...p, prev: null, askSaveFor: null }))
    /* Skip had the focus and has gone: Replay takes its place. */
    const active = document.activeElement
    if (!active || active === document.body || active === skipRef.current || active === canvasRef.current) replayRef.current?.querySelector<HTMLElement>('button')?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs as a run lands
  }, [running])

  /* A run started by something that has gone from the screen — a saved
     sign-in's picker — leaves the focus on nothing: Skip takes it, so the
     keyboard can stop the run and then Replay it. A field changed in the
     open panel keeps its focus. */
  useEffect(() => {
    if (!running) return
    const a = document.activeElement
    if (a && a !== document.body && a.isConnected) return
    skipRef.current?.focus({ preventScroll: true })
  }, [running])

  /* Run in the panel, or a saved sign-in: the panel shuts and the canvas
     takes the focus — Skip while the run plays, Replay once it has landed
     (at once, under reduced motion). Two frames on, so the run has begun. */
  useEffect(() => {
    if (!focusRun) return
    let b = 0
    const a = window.requestAnimationFrame(() => {
      b = window.requestAnimationFrame(() => {
        const to = skipRef.current ?? replayRef.current?.querySelector<HTMLElement>('button') ?? canvasRef.current
        to?.focus({ preventScroll: true })
      })
    })
    return () => {
      window.cancelAnimationFrame(a)
      window.cancelAnimationFrame(b)
    }
  }, [focusRun])

  // --- Actions ---

  const replay = () => {
    onReplay?.()
    onPage((p) => ({ ...p, intro: 'none', pace: 'full', replay: true, prev: null, askSaveFor: null }))
    if (run) run.replay()
    else session.replay()
    window.requestAnimationFrame(() => skipRef.current?.focus())
  }
  /* Skip lands the run where it is (the clock's `land`). */
  const skip = () => clock.land()
  const { loadBoard } = session
  const { go } = store
  const toPolicy = useCallback(
    (policyId: string) => {
      loadBoard(policyId, form)
      go({ name: 'board', policyId, open: 'try' })
    },
    [loadBoard, go, form],
  )
  const toRule = useCallback(
    (policyId: string, ruleId: string) => {
      loadBoard(policyId, form)
      go({ name: 'board', policyId, open: 'try', rule: ruleId })
    },
    [loadBoard, go, form],
  )
  const openPolicy = onOpenPolicy ?? toPolicy
  const openRule = onOpenRule ?? toRule
  /* The node and Add, steady across the run's steps (the node and the rules
     are memoised): they call the latest callbacks. */
  const latest = useRef({ onNode, onAdd, onSaved })
  useLayoutEffect(() => {
    latest.current = { onNode, onAdd, onSaved }
  })
  /* The sentence node, and Check access on the empty canvas: the panel opens on the sign-in. */
  const onPressNode = useCallback(() => latest.current.onNode(), [])
  const onAddField = useCallback((f: FormField) => latest.current.onAdd(f), [])
  const onSavedNow = useCallback(() => latest.current.onSaved?.(), [])

  // --- The view: zoom, fit, pan, and where the view is ---

  const cue = useRef<HTMLSpanElement | null>(null)
  const scrollerOf = () => root.current?.querySelector<HTMLElement>('.tj-scroll') ?? null

  /* The zoom on screen: the page's, or a glide's frame on its way there. */
  const zoomNow = useRef(zoom)
  const glide = useRef<AnimationPlaybackControls | null>(null)
  useLayoutEffect(() => {
    if (!glide.current) zoomNow.current = zoom
  }, [zoom])
  useEffect(() => () => glide.current?.stop(), [])

  /* One frame of a zoom about a point of the canvas (client px): the column
     scaled, the dots with it, and the scroll moved so the point stays put.
     The scroller's own padding — the room over and under the run — is not
     zoomed, so it is taken off first. */
  const applyZoom = useCallback((z: number, at: { x: number; y: number } | null) => {
    const z0 = zoomNow.current
    zoomNow.current = z
    const el = canvasRef.current
    el?.style.setProperty('--sit-z', String(z))
    el?.closest<HTMLElement>('.bb')?.style.setProperty('--bb-z', String(z))
    const sc = root.current?.querySelector<HTMLElement>('.tj-scroll')
    if (!sc || !at || z0 === z) return
    const r = sc.getBoundingClientRect()
    const padT = parseFloat(getComputedStyle(sc).paddingTop) || 0
    const px = at.x - r.left
    const py = at.y - r.top
    const k = z / z0
    sc.scrollTop = Math.max(0, (sc.scrollTop + py - padT) * k + padT - py)
    sc.scrollLeft = Math.max(0, (sc.scrollLeft + px) * k - px)
  }, [])
  const middle = () => {
    const r = scrollerOf()?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }
  /* To a zoom, gliding (a jump under reduced motion, or when asked to); the
     page is told once it is there. */
  const zoomTo = (target: number, at: { x: number; y: number } | null, jump = false) => {
    const z1 = clampZoom(target)
    glide.current?.stop()
    glide.current = null
    const z0 = zoomNow.current
    if (jump || reduced || Math.abs(z1 - z0) < 0.005) {
      applyZoom(z1, at)
      onZoom(z1)
      return
    }
    glide.current = animate(z0, z1, {
      ...GLIDE,
      onUpdate: (v) => applyZoom(v, at),
      onComplete: () => {
        glide.current = null
        onZoom(z1)
      },
    })
  }

  /* The view, placed: the zoom and the scroll in ONE glide (a jump under
     reduced motion) — so a run lands with one move, never a zoom and then a
     scroll. A press or the wheel on the canvas stops it. */
  const glideView = (z1: number, top1: number) => {
    const sc = scrollerOf()
    if (!sc) return
    glide.current?.stop()
    glide.current = null
    const z0 = zoomNow.current
    const t0 = sc.scrollTop
    const to = Math.max(0, Math.round(top1))
    if (reduced || (Math.abs(z1 - z0) < 0.005 && Math.abs(to - t0) < 2)) {
      applyZoom(z1, null)
      sc.scrollTop = to
      onZoom(z1)
      return
    }
    glide.current = animate(0, 1, {
      ...VIEW_GLIDE,
      onUpdate: (k) => {
        applyZoom(z0 + (z1 - z0) * k, null)
        sc.scrollTop = t0 + (to - t0) * k
      },
      onComplete: () => {
        glide.current = null
        onZoom(z1)
      },
    })
  }
  const stopView = () => {
    if (!glide.current) return
    glide.current.stop()
    glide.current = null
    onZoom(clampZoom(zoomNow.current))
  }

  /* FIT (TESTING-V4 §12.3). The run is measured at zoom 1 from the stage's
     top to the answer's foot — What they see stands beside its words, so the
     whole answer is short enough to be in view. Then:
       land   as the answer lands (the chain's `onFit`): never zoomed out —
              the words keep their size — and, when the run fits, shown from
              its start; else the part that decided just under the engine
              line: the rule that matched, down to the answer's head; where
              that is too tall and a later rule also applies (a conflict),
              that rule's card; else the answer's head at the foot.
       fold   after Expand all / Collapse all: the zoom kept; from the start
              when it now fits, else where it is.
       view   Fit to view: zoomed out as far as the dock's least so it fits,
              from the start; a run too tall even then, back at zoom 1 and
              placed as it lands. */
  const fitRun = (_natural?: number, after: 'land' | 'fold' | 'view' = 'land') => {
    const sc = scrollerOf()
    const stage = sc?.querySelector<HTMLElement>('.tj-stage') ?? null
    const chain = stage?.querySelector<HTMLElement>('.tj-chain') ?? null
    if (!sc || !stage || !chain) return
    fitted.current = true
    const cs = getComputedStyle(sc)
    const room = sc.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
    const at = (sel: string) => stage.querySelector<HTMLElement>(sel)
    const hero = at('.tj-hero')
    const end = hero ? stageY(hero, stage) + hero.offsetHeight : stageY(chain, stage) + chain.offsetHeight
    if (end <= 0 || room <= 0) return
    const z0 = zoomNow.current || 1
    if (after === 'fold') {
      if (z0 * end <= room + 1) glideView(z0, 0)
      return
    }
    if (after === 'view') {
      const z = clampZoom(Math.min(1, Math.floor((room / end) * 100) / 100))
      if (z * end <= room + 1) {
        glideView(z, 0)
        return
      }
    }
    const z = after === 'view' ? 1 : Math.min(1, z0)
    if (z * end <= room + 1) {
      glideView(z, 0)
      return
    }
    /* The part that decided: the rule the walk stopped at (else the policy,
       else the answer), and a rule that also applies. */
    const landing = shown.landing !== null ? shown.rules[shown.landing] : null
    const lead = (landing ? at(`[data-node="${landing.node}"]`) : null) ?? at('[data-node="which"]') ?? hero
    const clashId = shown.conflicts?.conflicts[0]?.ruleId ?? null
    const clash = clashId !== null ? at(`[data-node="rule:${clashId}"]`) : null
    const a = lead ? stageY(lead, stage) : 0
    const c = clash ? stageY(clash, stage) : null
    const top = (end - a) * z <= room ? a * z : c !== null && (end - c) * z > room ? c * z : end * z - room
    glideView(z, top)
  }
  const fitLatest = useRef(fitRun)
  useLayoutEffect(() => {
    fitLatest.current = fitRun
  })
  /* The chain's word that it has settled, with its height. */
  const onFit = useCallback((height: number) => fitLatest.current(height), [])
  /* Expand all or Collapse all: fitted again once the cards have opened or folded. */
  useEffect(() => {
    if (fold.mode === 'auto' || !journey) return
    const t = window.setTimeout(() => fitLatest.current(undefined, 'fold'), reduced ? 0 : FOLD_SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [fold, journey, reduced])
  /* Landed, and the chain has not said so: the page fits it itself. */
  useEffect(() => {
    if (running || !journey) return
    const t = window.setTimeout(() => {
      if (!fitted.current) fitLatest.current()
    }, reduced ? 0 : FIT_FALLBACK_MS)
    return () => window.clearTimeout(t)
  }, [running, journey, reduced])

  /* The cue: where in the run the view is, as a thumb on the canvas's right
     edge, only while the run is taller than the canvas. Written straight
     onto the thumb, no render; `over` renders only as it flips. */
  const [over, setOver] = useState(false)
  const measureCue = useCallback(() => {
    const sc = root.current?.querySelector<HTMLElement>('.tj-scroll')
    if (!sc) return
    const span = sc.scrollHeight - sc.clientHeight
    const isOver = span > 1
    setOver((o) => (o === isOver ? o : isOver))
    const thumb = cue.current
    const track = thumb?.parentElement?.clientHeight ?? 0
    if (!thumb || !isOver || track <= 0) return
    const h = Math.max(24, (track * sc.clientHeight) / sc.scrollHeight)
    thumb.style.height = `${Math.round(h)}px`
    thumb.style.top = `${Math.round(((track - h) * sc.scrollTop) / span)}px`
  }, [])
  useLayoutEffect(() => {
    measureCue()
  })

  /* The ground's dots follow the scroll, as the builder's follow its pan:
     written straight onto the region (`--bb-y`), no render — and the cue with them. */
  useEffect(() => {
    const el = root.current
    const region = el?.closest<HTMLElement>('.bb')
    if (!el || !region) return
    const onScroll = (e: Event) => {
      const t = e.target
      if (!(t instanceof HTMLElement) || !t.classList.contains('tj-scroll')) return
      region.style.setProperty('--bb-y', `${-t.scrollTop}px`)
      measureCue()
    }
    el.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll, { capture: true })
      region.style.removeProperty('--bb-y')
    }
  }, [measureCue])
  /* A card growing or folding, the canvas resizing: the cue measures again. */
  useEffect(() => {
    const sc = root.current?.querySelector<HTMLElement>('.tj-scroll')
    if (!sc || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measureCue())
    ro.observe(sc)
    const stage = sc.firstElementChild
    if (stage) ro.observe(stage)
    return () => ro.disconnect()
  }, [journey, measureCue])

  /* Ctrl/⌘ with the wheel — a trackpad's pinch — zooms about the pointer;
     the wheel alone pans, as the scroller does. Not passive: the browser's
     own page zoom is what it stops. */
  const zoomLatest = useRef((z: number, at: { x: number; y: number }) => zoomTo(z, at, true))
  const stopLatest = useRef(stopView)
  useLayoutEffect(() => {
    zoomLatest.current = (z, at) => zoomTo(z, at, true)
    stopLatest.current = stopView
  })
  /* Another layout has its own ground (layouts/RunStage.tsx), which zooms itself. */
  const asColumn = layout === 'column'
  useEffect(() => {
    const el = canvasRef.current
    if (!el || !journey || !asColumn) return
    const onWheel = (e: WheelEvent) => {
      stopLatest.current()
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      zoomLatest.current(zoomNow.current * Math.exp(-e.deltaY * 0.0025), { x: e.clientX, y: e.clientY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [journey, asColumn])

  /* A drag on the ground pans the canvas, as the builder's does: a mouse's,
     from anywhere that is not a card or a control. Touch scrolls natively. */
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    stopView()
    if (e.button !== 0 || e.pointerType !== 'mouse') return
    const sc = scrollerOf()
    const t = e.target
    if (!sc || !(t instanceof Element) || !sc.contains(t) || t.closest(NO_PAN)) return
    e.preventDefault()
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop }
    e.currentTarget.setPointerCapture(e.pointerId)
    setPanning(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const sc = scrollerOf()
    if (!d || d.id !== e.pointerId || !sc) return
    sc.scrollLeft = d.left - (e.clientX - d.x)
    sc.scrollTop = d.top - (e.clientY - d.y)
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setPanning(false)
  }

  const moving = running && !reduced
  /* What the saved sign-in on the canvas expects: only for the run of it, once it has landed. */
  const asLoaded = !running && loaded && JSON.stringify(loaded.form) === JSON.stringify(form) ? loaded : null
  const expected = asLoaded?.expected ?? null
  const weaker = asLoaded?.weaker ?? null

  // --- Before the first run: the canvas explains itself ---

  if (!journey) {
    return (
      <div ref={root} className="tj">
        <div ref={canvasRef} className="tj-canvas">
          <div className="tj-scroll">
            <div className="tj-empty">
              <HowItWorks reduced={reduced} onCheck={onPressNode} onSaved={onSaved ? onSavedNow : undefined} open={panel} primary={!policy} doorWhileOpen={!!policy} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- The journey ---

  const startNode = <SignInNode form={form} rows={rows} asGroup={asGroup} onPress={onPressNode} />
  const answerNode = (
    <Answer view={shown.outcome.view} columns={columns} changed={running ? null : changed} reduced={reduced} screens={screens} appId={form.appId} expected={expected} weaker={weaker} />
  )
  const engineLine = (
    <EngineLine
      text={clock.text}
      running={running}
      notice={running && shown.steps[s]?.notice === true}
      arrive={moving}
      smooth={!reduced && !jumped}
      progress={clock.progress}
      inert={false}
      onSkip={skip}
      onReplay={replay}
      skipRef={skipRef}
      replayRef={replayRef}
      edit={onEdit ? { onPress: OWN_EDIT.includes(layout) ? undefined : onEdit, open: editing, unrun } : undefined}
    />
  )

  /* Another layout of the same run (run-layout.ts): the engine line over it,
     as over the column; the layout lays the run out on its own ground. */
  if (!asColumn) {
    const Layout = LAYOUTS[layout as Exclude<RunLayoutId, 'column'>]
    return (
      <div ref={root} className="tj">
        <div ref={canvasRef} className={`tj-canvas is-layout is-${layout}`} tabIndex={-1} aria-label="Sign-in run">
          {engineLine}
          <Suspense fallback={null}>
            <Layout
              plan={shown}
              s={s}
              running={running}
              animate={moving}
              reduced={reduced}
              jumped={jumped}
              runKey={page.played}
              form={form}
              rows={rows}
              asGroup={asGroupName}
              policies={cardPolicies}
              start={startNode}
              answer={answerNode}
              screens={screens}
              columns={columns}
              changed={running ? null : changed}
              expected={expected}
              weaker={weaker}
              onPressPerson={onPressNode}
              onAdd={onAddField}
              onOpenPolicy={openPolicy}
              onOpenRule={openRule}
              onAsGroup={onAsGroup}
              why={why}
              breakIn={breakIn}
              onReviewBreakIn={onReviewBreakIn}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  /* One labelled button, the builder's: it says what it will do. */
  const foldNext: FoldMode = fold.mode === 'expand' ? 'collapse' : 'expand'
  return (
    <div ref={root} className="tj">
      <div
        ref={canvasRef}
        className={`tj-canvas${over ? ' can-pan' : ''}${panning ? ' is-panning' : ''}`}
        style={{ '--sit-z': zoom } as CSSProperties}
        tabIndex={-1}
        aria-label="Sign-in run"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {engineLine}
        <EngineJourney
          plan={shown}
          s={s}
          animate={moving}
          reduced={reduced}
          running={running}
          editing={false}
          toggled={clock.toggled}
          onToggle={clock.onToggle}
          showAll={clock.showAll}
          onShowAll={clock.onShowAll}
          jumped={jumped}
          orientation="vertical"
          start={startNode}
          editCard={null}
          outcome={answerNode}
          onOpenPolicy={openPolicy}
          onOpenRule={openRule}
          onAdd={onAddField}
          form={form}
          policies={cardPolicies}
          onPressPerson={onPressNode}
          asGroup={asGroupName}
          fold={fold}
          onFit={onFit}
          onAsGroup={onAsGroup}
          why={why}
          breakIn={breakIn}
          onReviewBreakIn={onReviewBreakIn}
        />
        {/* Where the view is in a run taller than the canvas: a quiet thumb,
            not a scrollbar — it takes no press. */}
        <motion.span className="sit-cue" aria-hidden initial={false} animate={{ opacity: over ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.2 }}>
          <span ref={cue} className="sit-cue__thumb" />
        </motion.span>
      </div>
      {/* The builder's view dock (Board.tsx): the fold, then fit and zoom. */}
      <div className="bb__dock sit__dock">
        <div className="bb__float bb__dockbar" role="toolbar" aria-label="View">
          <button type="button" className="bb__densitybtn" onClick={() => setFold((f) => ({ mode: foldNext, seq: f.seq + 1 }))}>
            {foldNext === 'expand' ? <ChevronsUpDown size={14} strokeWidth={2} aria-hidden /> : <ChevronsDownUp size={14} strokeWidth={2} aria-hidden />}
            {foldNext === 'expand' ? 'Expand all' : 'Collapse all'}
          </button>
          <span className="bb__float__sep" />
          <div className="bb__zoomgrp">
            <Tip text="Fit to view" placement="top">
              <button type="button" className="bb__act" aria-label="Fit to view" onClick={() => fitRun(undefined, 'view')}>
                <Maximize size={14} strokeWidth={2} />
              </button>
            </Tip>
            <span className="bb__float__sep" />
            <Tip text="Zoom out" placement="top">
              <button type="button" className="bb__act" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => zoomTo(zoomNow.current / ZOOM_STEP, middle())}>
                <ZoomOut size={15} strokeWidth={2} />
              </button>
            </Tip>
            <Tip text="Zoom in" placement="top">
              <button type="button" className="bb__act" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => zoomTo(zoomNow.current * ZOOM_STEP, middle())}>
                <ZoomIn size={15} strokeWidth={2} />
              </button>
            </Tip>
          </div>
        </div>
      </div>
    </div>
  )
}
