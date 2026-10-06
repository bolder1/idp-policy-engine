import { AnimatePresence, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'

import type { SavedSignIn } from '../saved-sign-ins'
import { Tabs } from '../kit'
import { PageHead } from '../Shell'
import { useBrand } from '../store'
import { BoardBarPlain } from './board/BoardBar'
import { attemptFacts, attemptPlay, breakInOnApp, breakInSummary, type AppBreakInRow, type AppFixOffer } from './break-in-app'
import type { AttemptsFrom } from './sign-in-tests/attempts'
import { dateSaid, grantTempAccess } from './sign-in-tests/temp-access'
import { BlockedPanel } from './sign-in-tests/BlockedDrawer'
import type { BlockedRow } from './sign-in-tests/blocked'
import { BreakInPanel } from './sign-in-tests/BreakInPanel'
import { readersOf, type EngineRun } from './sign-in-tests/engine-run'
import { defaultPeopleContext, peopleContextOf } from './sign-in-tests/library'
import { ACCESS_CHECK, ACCESS_CHECKS } from './sign-in-tests/names'
import { PeopleTable } from './sign-in-tests/PeopleTable'
import { RunsReport } from './sign-in-tests/RunsReport'
import { SavedTable } from './sign-in-tests/SavedTable'
import {
  GROUP_PREFIX,
  PANEL_ID,
  asGroupOf,
  cardIssues,
  forRun,
  initialTryPage,
  issueToken,
  newSignInPage,
  nowIn,
  peopleTryForm,
  personPick,
  picksOf,
  ranPicks,
  runNowOf,
  runOfPicks,
  switchPick,
  tokenTips,
  tryingPage,
  unrunOf,
  withDefaults,
  withIdentities,
  type IdentityValue,
  type TryPage,
} from './sign-in-tests/sign-in-card'
import { TryJourney } from './sign-in-tests/TryJourney'
import { InspectPanel } from './sign-in-tests/InspectPanel'
import { isPeek, sameTarget, type InspectTarget } from './sign-in-tests/inspect-model'
import { openerOf, popupOpen, refocus } from './sign-in-tests/page-keys'
import { SavedPanel, TryPanel, WhyPanel } from './sign-in-tests/TryPanel'
import { useSimEnv } from './sim-env'
import { resolveSignIn } from './tenant-resolver'
import { boundariesOf } from './testing/boundaries'
import { rowsRead } from './testing/rows-read'
import { useTestingSession } from './testing/session-state'
import { factsOf, formOf, todayIn, type FormField, type SignInForm } from './testing/sign-in-form'
import { tokenDomId, tokenOfField, type TokenId } from './testing/sign-in-sentence'
/* The builder's sheet: the page wears its bar, region, dock and panel, and
   may be the first of the two opened in a visit. */
import './board/board.css'
import { BREAK_IN_ATTEMPTS, CANVAS_OPTIONS, DENIAL_REASONS, INSPECTOR, SAVED_SIGN_INS } from './sign-in-tests/phase'
import { CanvasSwitch } from './sign-in-tests/CanvasSwitch'
import { setCheckStage, useCheckStage, useFavourites, useStageFollowsTheme } from './sign-in-tests/canvas-shelf'
import { JARVIS_END_MS, JARVIS_MID_MS, JarvisButton, JarvisTransition, type JarvisPhase } from './sign-in-tests/jarvis-mode/JarvisMode'
import { ARUNA_ENTRY, CANVAS_PICKER, DARK_ONLY, FIRST_LAYOUT, JARVIS, STAGED_LAYOUTS, isJarvis, useRunLayout, type RunLayoutId } from './sign-in-tests/run-layout'
import './sign-in-tests/panel-stage.css'

/* -----------------------------------------------------------------------------
   Sign-in tests: the tenant's page, in the policy builder's layout
   (TESTING-V4 §14 — "it should feel like we are using the same builder for
   tests as well").

     ┌ ← Policies › Access checks ───────────────────────────────────────────┐
     │ · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · │
     │ · ·   how an access check works — [▸ Check access] [▦ Saved   · · · · │
     │ · ·   sign-ins] — or the run, in one vertical column: the     · · · · │
     │ · ·   whole canvas while the panel is shut                    · · · · │
     │ · · · · · · · ·  [ Expand all | ⛶ | − + ]  · · · · · · · · · · · · · · │
     └────────────────────────────────────────────────────────────────────────┘
               opened:                        ┌ Sign-in ────────── >< × ┐
                                              │ Use a saved sign-in     │
                                              │ Who · Application · …   │
                                              │       [Save] [▶ Run]    │
                                              └─────────────────────────┘
                                   or         ┌ Saved sign-ins ──── >< × ┐
                                              │ [Search saved sign-ins] │
                                              │ Maya Iyer on GitHub …   │
                                              └─────────────────────────┘

   The rail shuts to its icons as it does for the builder (Shell.tsx,
   `RAIL_SHUT_SCREENS`) and comes back on the way out. The builder's bar
   (`BoardBarPlain`: the same row, no status, no rename, and no buttons: the
   page's two ways in are the canvas's — owner, 1 Oct: "move these two
   buttons inside the canvas as the two main buttons"); the builder's region
   (`.bb`): the dotted ground, the canvas in the middle track, the floating
   panel in the right one. The canvas is TryJourney.tsx — before the first run
   "How an access check works", centred in it, with Check access and Saved
   sign-ins in its first card; then the run — and the panel is the sign-in
   form (TryPanel.tsx), in the rule Inspector's chrome, or the saved
   sign-ins (`SavedPanel`), in the same chrome.

   The panel is OPEN on a first visit (owner, 1 Oct 2026: "when we come
   inside I don't want the button, so by default open the right side as the
   first-time view" — it was on demand from 30 Sep, behind Check access on
   the empty canvas). A visit that lands on an empty canvas opens with the
   form beside it, already there rather than slid in, and the empty canvas
   draws no button while the form is open: Run in the panel's foot is the
   one orange. A revisit lands on its run, settled, the panel shut and its
   track closed (`.bb.is-insp-closed`), so the canvas has the whole width.
   What opens it on the form again: Check access on the empty canvas, drawn
   only once the panel has been shut — the page's orange then; the sentence
   at the top of a run; Add on a Not stated row; Run with something missing.
   On the saved sign-ins: Saved sign-ins on the empty canvas, and a route to
   them (the board's link). What shuts it: Run, or a saved sign-in picked,
   which hand the focus to the canvas — the run begins once the panel has
   slid out, on the whole canvas (owner, 30 Sep: "after configuration and the
   run it should close and we should focus on the main canvas"); its X;
   Escape.

   No tabs. People, Runs and the Saved sign-ins table are locked off by one
   constant (`TABLES`), their code and tests kept; saved sign-ins are
   templates for the form — the Saved sign-ins panel and the form's Use a
   saved sign-in. A route that named a tab lands here; 'saved' opens that
   panel.

   This file owns the sign-in (`TryPage`): the panel edits it, and the canvas
   plays what the testing session loads.
   - Run (the one orange button while the panel is open, in its foot; never
     disabled; Ctrl/⌘+Enter anywhere on the page) with a person or an
     application missing opens the panel, says why under that row and takes
     the focus there. Otherwise it is a `load`: the run plays at full pace —
     again, if nothing changed.
   - Only Run runs (owner, 2 Oct 2026: "unless I click the run button,
     don't run"). A changed field changes the form; the run on the canvas
     stays as it was, and the panel's foot says the changes are not run yet,
     as Edit sign-in on the run's line does with the panel shut. Run then
     plays them, and the answer says what the change did. Presses that say
     they run — Replay, "Run as Engineering only", a break-in attempt's
     Run this sign-in — still run.
   - Several picks in the Identity field (owner, 5 Oct 2026: "one run
     each, switch"): Run makes one sign-in per pick from the same facts
     (sign-in-card.ts `runOfPicks`) and the canvas tells the first; a pick's
     chip on the canvas's top bar loads that pick's run of the same Run
     (`switchPick`), never a new Run. The picks are the page's, beside the
     one form (`TryPage.identities`); what the last Run covered, and which
     pick the canvas tells, is `TryPage.ran`.
   - A saved sign-in fills the panel and names it; Run takes the focus.
   - The sentence on the canvas, Edit sign-in on the run's line (every
     layout's), and Check access on the empty canvas open the panel on its
     Person picker; Add on a Not stated row opens that fact's row.
   - Open policy, from the journey, is the journey's own (TryJourney.tsx).

   Break-in attempts (owner, 1 Oct 2026: "can we implement it in the check
   part? as a suggestion inside conflicts or somewhere else" — then "go with
   your picks, start building"): the fifteen scripted sign-ins, played on the
   run's application across the tenant (break-in-app.ts), once per
   (policies, application, env, acceptances) — the store's own objects, so
   the run is kept until one of them changes — and only with the edition's
   Break-in test on (phase.ts `BREAK_IN_ATTEMPTS`). The journey says them
   once its run is done: the why's last section, or the answer's strip or
   quiet link. Review attempts opens them in the panel (BreakInPanel.tsx) —
   from the why, in the why's own place, with a way back — and:
   - a row pressed PLAYS it, as a saved sign-in plays: the form filled with
     the attempt on this application, named for it, what it should get the
     answer's "Expected", the panel shut for the run;
   - Decided by opens that rule in the builder, the attempt in its Check access;
   - Fix in policy opens the deciding policy in the builder, the fix in its
     draft (the route's `fix`, break-in-app.ts `fixOnArrival`).
   Any new run shuts the panel — Replay and an "As each group" re-run too,
   the why with it (`shutBeside`); shut, the focus goes back to what opened
   it — the strip, the quiet link, Focus's Break-in attempts — else Replay
   (page-keys.ts). A played attempt is held to what its row says
   (`attemptPlay`): a held one never shows a failure, a Weaker factor one
   says so.
   -------------------------------------------------------------------------- */

export type SignInTestsTab = 'try' | 'saved' | 'people' | 'runs'

/* The tables — Saved sign-ins, People, Runs — as tabs under a page head.
   Locked off (owner, 30 Sep: "lock People and Runs for now; we will work on
   them later"); flip it to bring the tabs back as they were. */
const TABLES: boolean = false

const TABS: { value: SignInTestsTab; label: string }[] = [
  { value: 'try', label: ACCESS_CHECK },
  { value: 'saved', label: 'Saved sign-ins' },
  { value: 'people', label: 'People' },
  { value: 'runs', label: 'Runs' },
]

/** The panel's two widths, the Inspector's own: full, and narrow. */
const PANEL_WIDE = 560
const PANEL_NARROW = 380

/** How long the panel takes to slide in (TryPanel.tsx `SLIDE`): a row in it is opened once it has arrived. */
const ARRIVE_MS = 240
/** How long it takes to slide out: a run from it begins once it has gone. */
const LEAVE_MS = 260

/* What opens the why on the answer: its strip, or the quiet Why? — not the
   attempts' strip or link, which open the attempts. */
const WHY_DOOR = '.sit__stage .tj-hero__whybtn:not(.tj-hero__attempts), .sit__stage button.tj-hero__strip:not(.tj-hero__attempts)'

/** The form's Run, which a loaded saved sign-in hands the focus to. */
const RUN_BUTTON = '.sit-panel__foot .bx-btn--brand'

/** Two sign-ins are the same run when every fact is. */
const same = (a: SignInForm, b: SignInForm) => JSON.stringify(a) === JSON.stringify(b)

export function SignInTests({ tab: routeTab = 'try' }: { tab?: SignInTestsTab }) {
  const { go, persona, policies, zones, fingerprints, savedSignIns, users, features, breakInAccepted, savePolicy, showToast, account } = useBrand()
  const lib = useMemo(() => ({ zones, fingerprints }), [zones, fingerprints])
  const session = useTestingSession()
  const env = useSimEnv()
  const reduced = useReducedMotion() === true
  const panelId = useId()

  const [tab, setTab] = useState<SignInTestsTab>(TABLES ? routeTab : 'try')
  /* The route's tab, as last seen: a new one from outside moves the page. */
  const [seen, setSeen] = useState(routeTab)
  if (seen !== routeTab) {
    setSeen(routeTab)
    if (TABLES) setTab(routeTab)
  }
  /* The form's Use a saved sign-in, its list open under the row. */
  const [savedAt, setSavedAt] = useState<'panel' | null>(null)
  const [tryPage, setTryPage] = useState<TryPage>(() => initialTryPage(session.runId, todayIn(), nowIn(), session.form))
  const onTryPage = useCallback((next: (p: TryPage) => TryPage) => setTryPage(next), [])
  const [submitted, setSubmitted] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  /* The saved sign-in the panel holds — its name for the header, what it
     expects for the answer, the sign-in as it was loaded — until it is
     changed. A break-in attempt's carries its factor too, where that is what
     failed (break-in-app.ts `attemptPlay`). */
  const [loaded, setLoaded] = useState<{ name: string; form: SignInForm; expected: SavedSignIn['expected']; weaker?: string | null } | null>(null)
  const [wide, setWide] = useState(true)
  /* The panel: open on the form when the visit lands on an empty canvas —
     the form is the first thing a check needs (owner, 1 Oct 2026: "when we
     come inside I don't want the button, so by default open the right side
     as the first-time view") — and shut on a revisit, which shows the run
     where it was. Then the sign-in's form, or the saved sign-ins, the why,
     or the break-in attempts. A route to Saved sign-ins (the board's link)
     opens on them. */
  const [panel, setPanel] = useState<'form' | 'saved' | 'blocked' | 'why' | 'break-in' | 'inspect' | null>(() => (tryPage.mode === 'form' ? 'form' : null))
  /* The why's panel body, for the run to draw the why into. */
  const [whySlot, setWhySlot] = useState<HTMLDivElement | null>(null)
  /* Where the attempts were opened from: the why's section gives them a way back to it. */
  const [attemptsFrom, setAttemptsFrom] = useState<AttemptsFrom>('outcome')
  /* The why and the attempts are one panel: the one swapped in for the other is there at once, not slid in. */
  const [swapped, setSwapped] = useState(false)
  /* What opened the panel — a name on a card, Break-in attempts on Focus's bar, the answer's strip, Edit sign-in —
     for the focus to go back to as it shuts (review, 6 Oct 2026: on Focus it went nowhere, the doors `closePanel`
     knew being the older layouts'). Taken as each panel opens; one opened from inside another keeps the first's
     (page-keys.ts `openerOf`). */
  const opener = useRef<HTMLElement | null>(null)
  const noteOpener = () => {
    const a = document.activeElement
    opener.current = openerOf(a instanceof HTMLElement ? a : null, panel !== null ? opener.current : null, document.body)
  }
  const panelOpen = panel === 'form'
  useEffect(() => {
    if (SAVED_SIGN_INS && !TABLES && routeTab === 'saved') setPanel('saved')
  }, [routeTab])
  /* A run from the panel, waiting for it to slide out (`toCanvas`): its timer,
     and whether the panel came back meanwhile. Cleared as the page goes. */
  const leaving = useRef<{ timer: number; keepFocus: boolean } | null>(null)
  useEffect(
    () => () => {
      if (leaving.current) window.clearTimeout(leaving.current.timer)
    },
    [],
  )
  /* A run started from the panel or a picker that has gone: the canvas takes the focus (TryJourney). */
  const [focusRun, setFocusRun] = useState(0)
  /* The canvas's zoom, from the dock: the run's column scaled, the dots with it. */
  const [zoom, setZoom] = useState(1)
  /* The layout the run is drawn in, while the layouts are compared (phase.ts `CANVAS_OPTIONS`) — Focus, whatever was
     stored, while the pickers are off (run-layout.ts `CANVAS_PICKER`). */
  const [layout, setLayout] = useRunLayout()
  /* The owner's shelves (canvas-shelf.ts): his favourites, the rest the archive. */
  const [favourites] = useFavourites()
  /* The Configure panel follows the stage of a layout that has one (owner, 2 Oct
     2026: "all the places we have dark mode, I want to treat the Configure panel
     that way as well") — dark beside a dark stage, as it is light beside a light
     one. Its pickers' lists open outside the page, under the app root, so the
     root carries the stage too (panel-stage.css). */
  const checkStage = useCheckStage()
  const panelStage: 'light' | 'dark' = DARK_ONLY.includes(layout) || (STAGED_LAYOUTS.includes(layout) && checkStage === 'dark') ? 'dark' : 'light'
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.brand-root')
    if (!root) return
    root.dataset.checkStage = panelStage
    return () => {
      delete root.dataset.checkStage
    }
  }, [panelStage])
  /* Jarvis's own way in (jarvis-mode/JarvisMode.tsx): the bar's button plays
     the transition over the stage, the run is redrawn as Jarvis at its middle,
     and pressed again goes back to the layout it came from, the same way out.
     One version (owner, 3 Oct 2026: "v1 is the main view; move v2 inside the archive — no need for v1 / v2"): the
     button enters Aruna; the Reactor (v2) is an archived canvas like any other. */
  const [jarvisPhase, setJarvisPhase] = useState<JarvisPhase | null>(null)
  const onJarvis = isJarvis(layout)
  const beforeJarvis = useRef<RunLayoutId>(onJarvis ? FIRST_LAYOUT : layout)
  /* The stage is the Mode button's at the top (4 Oct 2026); Aruna opens dark whatever it says. */
  const theme = useStageFollowsTheme(onJarvis)
  const [jarvisCover, setJarvisCover] = useState<'light' | 'dark'>('dark')
  const jarvisTimers = useRef<number[]>([])
  useEffect(() => () => jarvisTimers.current.forEach((t) => window.clearTimeout(t)), [])
  const toggleJarvis = () => {
    if (jarvisPhase) return
    const entering = !onJarvis
    const next = entering ? JARVIS : beforeJarvis.current
    if (entering) beforeJarvis.current = layout
    /* Aruna always opens dark (owner, 4 Oct 2026: "by default Aruna should be opening in dark mode no matter what");
       leaving gives the view the Mode button's stage back. Both change under the cover, with the layout; the cover
       keeps the stage it is going to (in) or leaving (out) from start to end. */
    const swap = () => {
      setCheckStage(entering ? 'dark' : theme)
      setLayout(next)
    }
    if (reduced) {
      swap()
      return
    }
    setJarvisCover(entering ? 'dark' : checkStage)
    setJarvisPhase(entering ? 'enter' : 'exit')
    jarvisTimers.current = [
      window.setTimeout(swap, JARVIS_MID_MS),
      window.setTimeout(() => setJarvisPhase(null), JARVIS_END_MS),
    ]
  }

  // --- The panel's sign-in ---

  const draft = tryPage.draft
  const rows = useMemo(() => rowsRead(policies, null, draft.appId, lib), [policies, draft.appId, lib])
  const bounds = useMemo(() => boundariesOf(draft, rows, {}, policies, env, zones), [draft, rows, policies, env, zones])
  const tips = useMemo(() => (draft.appId ? tokenTips(readersOf(policies, draft.appId, lib)) : {}), [policies, draft.appId, lib])
  const found = useMemo(() => cardIssues(draft, rows, zones), [draft, rows, zones])
  /* Said once Run has been pressed, and — once there is a run — as a change makes one. */
  const issues = submitted || tryPage.mode === 'journey' ? found : []

  /* The run on the canvas, for Save sign-in: the pick it tells. */
  const ranForm = session.form
  /* A group the canvas's run stands for (§13.3): its member runs, the node says the group. */
  const asGroup = asGroupOf(tryPage, ranForm, users)
  const ran = useMemo(() => {
    if (tryPage.mode !== 'journey' || !ranForm.personId || !ranForm.appId) return null
    const res = resolveSignIn(policies, factsOf(ranForm, zones).facts, env)
    return { form: ranForm, shown: res.status === 'decided' ? res.decision : null }
  }, [tryPage.mode, ranForm, policies, zones, env])

  /* Break-in attempts on the run's application (break-in-app.ts), with the
     edition's Break-in test on: the store's own policies, env and
     acceptances — the objects themselves, so `breakInOnApp` keeps the run
     until one of them changes, and the strip, the why and the panel read one. */
  const attemptsOn = BREAK_IN_ATTEMPTS && features.breakInTest
  const attemptsApp = attemptsOn && tryPage.mode === 'journey' ? ranForm.appId : null
  const attempts = useMemo(() => {
    if (!attemptsApp) return null
    const result = breakInOnApp(policies, attemptsApp, env, { accepted: breakInAccepted })
    return { result, summary: breakInSummary(result, env) }
  }, [attemptsApp, policies, env, breakInAccepted])
  /* Gone — the Break-in test off, no application — and their panel goes with them. */
  if (panel === 'break-in' && !attempts) setPanel(null)
  const attemptsOpen = panel === 'break-in'
  const breakIn = useMemo(() => (attempts ? { summary: attempts.summary, open: attemptsOpen } : null), [attempts, attemptsOpen])

  /* A row of the panel takes the focus — and, asked to, opens: a Picker's
     list, or a fact's panel. */
  const focusRow = (token: TokenId | null, open = false) => {
    if (!token) return
    window.requestAnimationFrame(() => {
      const row = document.getElementById(tokenDomId(PANEL_ID, token))
      const el = row?.matches('button') ? row : row?.querySelector<HTMLElement>('button')
      el?.focus()
      if (open && el?.getAttribute('aria-expanded') !== 'true') el?.click()
    })
  }

  // --- The panel, on demand ---

  /* Open the panel on the form, then — once it has slid in, so what opens
     under a row stands under it — do `then` (a row's focus, a picker's list). */
  const openPanel = (then?: () => void) => {
    const already = panelOpen
    /* A run waiting for the panel to slide out still begins — but the panel
       is back, so the canvas must not take the focus from it. */
    if (leaving.current) leaving.current.keepFocus = true
    noteOpener()
    setPanel('form')
    if (!then) return
    if (already || reduced) then()
    else window.setTimeout(then, ARRIVE_MS)
  }
  /* The why, in the panel: the answer's Review conflict, the policy's count. */
  const why = useMemo(
    () => ({
      open: panel === 'why',
      slot: whySlot,
      onOpen: (o: boolean) => {
        if (o) {
          noteOpener()
          setSaveOpen(false)
          setSavedAt(null)
          setSwapped(panel === 'break-in')
          setPanel('why')
        } else if (panel === 'why') closePanel(true)
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `closePanel` and `noteOpener` read only `panel` (and a ref)
    [panel, whySlot],
  )
  /* Review attempts — the answer's strip or quiet link, or the why's
     section — opens the attempts; pressed again on the answer, it shuts
     them. From the why, they take its place and keep a way back. */
  const reviewBreakIn = (from: AttemptsFrom) => {
    if (from === 'outcome' && panel === 'break-in') {
      closePanel()
      return
    }
    if (leaving.current) leaving.current.keepFocus = true
    noteOpener()
    setSaveOpen(false)
    setSavedAt(null)
    setAttemptsFrom(from)
    setSwapped(panel === 'why')
    setPanel('break-in')
  }
  /* Back to why: the why takes the attempts' place, and its title the focus once it is drawn in. */
  const backToWhy = () => {
    setSwapped(true)
    setPanel('why')
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.sit-whypanel .tj-why__title')?.focus({ preventScroll: true })))
  }
  /* The week's refused sign-ins, from the empty canvas's Blocked sign-ins (DENIAL_REASONS). */
  const openBlocked = () => {
    noteOpener()
    setPanel('blocked')
  }
  /* Open the panel on the saved sign-ins: their search takes the focus as it arrives (SavedPanel). */
  const openSaved = () => {
    if (leaving.current) leaving.current.keepFocus = true
    noteOpener()
    setSaveOpen(false)
    setSavedAt(null)
    setPanel('saved')
  }
  /* Shut it, and — when the focus was in it, or asked to — hand the focus
     back: to what opened it, while that is still on the page and takes it
     (`noteOpener`, page-keys.ts `refocus`) — a name on a card, Break-in
     attempts on Focus's bar, the strip. Else to the canvas: the empty
     canvas's button for what was open, or the run's Replay, else the
     sentence at its top. The attempts give it to the strip or the quiet
     link, else the strip that opened the why they came from — else Replay.
     Last, Focus's own (review, 6 Oct 2026: the doors above are the older
     layouts', and a panel shut on Focus left the focus on nothing): its
     Break-in attempts for the attempts, its Why link for the why (the door
     focus2-why.tsx takes when the focus is left on nothing — the canvas
     taken first would beat it), the Replay on its sign-in card, the canvas
     itself. */
  const closePanel = (focusBack = false) => {
    const from = panel
    const inPanel = !!(document.activeElement instanceof HTMLElement && document.activeElement.closest('.sit-panel'))
    const opened = opener.current
    opener.current = null
    setPanel(null)
    setSaveOpen(false)
    setSavedAt(null)
    if (!focusBack && !inPanel) return
    window.requestAnimationFrame(() => {
      if (refocus(opened)) return
      const at = (sel: string) => document.querySelector<HTMLElement>(`.sit__stage ${sel}`)
      const onFocus = () => (from === 'break-in' ? at('.f2cb__break') : from === 'why' ? at('.rl-c2__why') : null) ?? at('.rl-c2__replay') ?? at('.tj-canvas')
      if (from === 'break-in') {
        const back = at('.tj-hero__attempts') ?? at('button.tj-hero__strip') ?? at('.tj-engine__replay button') ?? onFocus()
        back?.focus()
        return
      }
      /* The why gives it to what opens it on the answer — its strip, or
         Why? — as the why under the answer does, else Replay (review, 1 Oct
         2026: its X left the focus on nothing). */
      if (from === 'why') {
        const back = document.querySelector<HTMLElement>(WHY_DOOR) ?? at('.tj-engine__replay button') ?? onFocus()
        back?.focus()
        return
      }
      const ways = Array.from(document.querySelectorAll<HTMLElement>('.sit__stage .hiw__act button'))
      const door = (from === 'saved' ? ways[1] : ways[0]) ?? document.querySelector<HTMLElement>('.sit__stage .tj-engine__replay button, .sit__stage .tj-sin2__edit') ?? onFocus()
      door?.focus()
    })
  }
  /* What stands beside a run that is over — the why, the attempts — goes as
     any new run begins: each is about the run it came from (review, 1 Oct
     2026: Replay and an "As each group" re-run left them up over the new
     run, the why an empty card). The form and the saved sign-ins stay: an
     edit in the form is a run of its own. */
  const shutBeside = () => setPanel((p) => (p === 'why' || p === 'break-in' || p === 'inspect' ? null : p))
  /* A run from the panel or a picker: the panel shuts, THEN the run begins
     — on the whole canvas, once the panel has slid out of it, so the slide
     is seen and not lost in the run's first frames — and the canvas takes
     the focus (the run's Skip). At once when the panel was shut already, and
     under reduced motion. */
  const toCanvas = (begin: () => void) => {
    const wasOpen = panel !== null
    setPanel(null)
    setSaveOpen(false)
    setSavedAt(null)
    /* One run waits at a time: a second Run while the first waits takes its place. */
    if (leaving.current) window.clearTimeout(leaving.current.timer)
    leaving.current = null
    const go = (keepFocus: boolean) => {
      begin()
      if (!keepFocus) setFocusRun((n) => n + 1)
    }
    if (wasOpen && !reduced) {
      const wait = { timer: 0, keepFocus: false }
      wait.timer = window.setTimeout(() => {
        if (leaving.current === wait) leaving.current = null
        go(wait.keepFocus)
      }, LEAVE_MS)
      leaving.current = wait
    } else go(false)
  }
  /* Escape shuts the panel — unless a popup is open over it (a picker's
     list, a fact's panel, Save sign-in, a Saved sign-ins picker, the Choose
     a user dialog), which takes that Escape itself. A row opened in the
     panel is no popup: an attempt opened in Break-in attempts held the panel
     up for good while Escape waited for anything expanded (review, 6 Oct
     2026; page-keys.ts `popupOpen`). Taken on the way down: a closed Picker
     still stops the Escape that reaches it. And taken: what listens after
     the page — the Brief's own panel Escape — stands back, so one Escape
     shuts one thing, as in the builder's Check access. */
  const anyPanel = panel !== null
  useEffect(() => {
    if (!anyPanel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (popupOpen()) return
      e.preventDefault()
      closeLatest.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [anyPanel])
  const closeLatest = useRef(() => closePanel())
  useEffect(() => {
    closeLatest.current = () => closePanel()
  })

  // --- Runs ---

  /* Every run is a load: the session's run moves on, and the canvas plays it.
     A run of one sign-in covers no picks of its own (`ran` gone); Run, and a
     press that runs, say which they covered. */
  const start = (f: SignInForm, pace: TryPage['pace'], next: Partial<TryPage> = {}) => {
    setTryPage((p) => ({ ...p, mode: 'journey', intro: 'none', pace, replay: false, prev: null, askSaveFor: null, ran: undefined, ...next }))
    setSubmitted(false)
    setSaveOpen(false)
    shutBeside()
    session.load(f)
  }
  /* Run: the form as it stands, once per pick — the canvas tells the first
     (`runOfPicks`). After a run, the answer says what a change did to it, as
     an edit's re-run did before Run became the only way in. A saved sign-in
     loaded and left as it was runs as it was saved, so the answer can set
     what it expects beside what it got. */
  const run = () => {
    if (found.length > 0) {
      setSubmitted(true)
      openPanel(() => focusRow(issueToken(found)))
      return
    }
    const f = loaded && same(draft, loaded.form) ? loaded.form : forRun(draft, rows)
    const before = tryPage.mode === 'journey' ? { form: session.form, list: ranPicks(tryPage, session.form) } : null
    const { form: first, ran: covered, prev } = runOfPicks(f, tryPage.identities, users, before)
    const askSaveFor = tryPage.askSaveFor
    toCanvas(() => start(first, 'full', { askSaveFor, prev, ran: covered }))
  }
  const runLatest = useRef(run)
  useEffect(() => {
    runLatest.current = run
  })
  /* Ctrl+Enter (⌘ on a Mac) presses Run from anywhere on the page, its
     popovers included. Taken on the way down, before a focused Picker reads
     the Enter as "open the list". */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.defaultPrevented) return
      e.preventDefault()
      e.stopPropagation()
      runLatest.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  /* A field changed. The application brings the facts its rules read, filled
     with defaults where nothing was set by hand. It changes the form and
     nothing else: Run runs it (owner, 2 Oct 2026: "unless I click the run
     button, don't run — now if I make any change it runs automatically").
     `now` is a press that says it runs — the canvas's "Run as Engineering
     only" — and that runs at once, at the edit pace, once the facts are right:
     every pick again, the canvas staying on the pick it tells (`runNowOf`).
     `picks` are the Identity field's, when the change is to them; a person
     set some other way is the one pick. */
  const patch = (p: Partial<SignInForm>, field: FormField, now = false, picks?: readonly IdentityValue[]) => {
    const touched = tryPage.touched.includes(field) ? tryPage.touched : [...tryPage.touched, field]
    let next = { ...tryPage.draft, ...p }
    const nextRows = field === 'app' ? rowsRead(policies, null, next.appId, lib) : rows
    if (field === 'app') next = withDefaults(next, nextRows, touched, todayIn(), nowIn())
    const identities = picks ?? ('personId' in p ? picksOf(next) : tryPage.identities)
    setTryPage((pg) => ({ ...pg, draft: next, touched, identities }))
    setLoaded(null)
    if (!now || tryPage.mode !== 'journey' || cardIssues(next, nextRows, zones).length > 0) return
    const { form: f, ran: covered } = runNowOf(forRun(next, nextRows), identities, tryPage, session.form, users)
    if (same(f, session.form) && covered.list.join() === ranPicks(tryPage, session.form).join()) return
    start(f, 'edit', { prev: session.form, ran: covered })
  }

  /* "Run as Finance only" (§13.3): the picks become that group alone, and its member runs at once. */
  const pickPerson = (value: string, now = false) => patch({ personId: personPick(value, users).personId }, 'person', now, [value])
  /* The Identity field's picks: the panel's, and nothing runs (only Run runs). */
  const pickIdentities = (next: readonly IdentityValue[]) => {
    setTryPage((pg) => withIdentities(pg, next, users))
    setLoaded(null)
  }
  /* A pick's chip on the canvas's top bar: that pick's run of the same Run,
     told from the start — never a new Run of the panel's picks. */
  const showPick = (key: IdentityValue) => {
    const to = switchPick(tryPage, session.form, key, users)
    if (to) start(to.form, 'full', { ran: to.ran })
  }

  /* A saved sign-in fills the form and names it — from the form's Use a
     saved sign-in, or the Saved sign-ins panel, which gives way to the form
     — and waits for Run, which takes the focus. */
  const trySaved = (sv: SavedSignIn) => {
    const f = formOf(sv.facts, zones)
    setLoaded({ name: sv.name, form: f, expected: sv.expected })
    setTryPage((pg) => ({ ...pg, draft: f, touched: [], identities: picksOf(f) }))
    setSubmitted(false)
    setSavedAt(null)
    openPanel(() => window.requestAnimationFrame(() => document.querySelector<HTMLElement>(RUN_BUTTON)?.focus()))
  }
  /* The form has changes the run on the canvas has not checked — in the
     facts the application's rules read: a device on an application no rule
     asks about changes no answer — or in the picks (`unrunOf`). */
  const unrun = unrunOf(tryPage, session.form, rows)
  /* Edit sign-in, on the run's line: the form, on its Person row; pressed again, shut. */
  const editSignIn = () => (panelOpen ? closePanel(true) : openPanel(() => focusRow('person')))

  /* A break-in attempt pressed plays as a saved sign-in does: the form
     filled with it on this application (break-in-app.ts `attemptPlay`, the
     same sign-in the deck asked), named for it, what it should get the
     answer's Expected — the panel shut for the run. */
  const playAttempt = (row: AppBreakInRow) => {
    if (!attempts) return
    const p = attemptPlay(row, attempts.result.appId, policies)
    const f = formOf(p.facts, zones)
    setLoaded({ name: p.name, form: f, expected: p.expected, weaker: p.weaker })
    toCanvas(() => start(f, 'full', { draft: f, touched: [], identities: picksOf(f) }))
  }
  /* A blocked sign-in from the drawer fills the form and waits for Run, which takes the focus — as a saved sign-in does. */
  const fillBlocked = (row: BlockedRow) => {
    const f = formOf(row.facts, zones)
    setLoaded(null)
    setTryPage((pg) => ({ ...pg, draft: f, touched: [], identities: picksOf(f) }))
    setSubmitted(false)
    setSavedAt(null)
    openPanel(() => window.requestAnimationFrame(() => document.querySelector<HTMLElement>(RUN_BUTTON)?.focus()))
  }
  const playForm = (f: SignInForm) => {
    setLoaded(null)
    toCanvas(() => start(f, 'full', { draft: f, touched: [], identities: picksOf(f) }))
  }
  /* Let in for a while, from a refusal's Why: the policy that refused gets a first rule for that person that ends by itself,
     said in a toast with Undo (sign-in-tests/temp-access.ts). */
  const grantAccess = (policyId: string, person: { id: string; name: string }, until: string, reason: string) => {
    const stored = policies.find((p) => p.id === policyId)
    if (!stored) return
    savePolicy(grantTempAccess(stored, person, { until, reason, by: account.name }))
    showToast(`${person.name} can sign in until ${dateSaid(until)}`, { label: 'Undo', run: () => savePolicy(stored) })
  }
  /* Into the builder for an attempt — the rule that decided it, or its
     policy fixed — with the attempt in that policy's Check access, as the
     journey's own Open rule carries the run. */
  const toBoardFor = (row: AppBreakInRow, policyId: string) => {
    if (attempts) session.loadBoard(policyId, formOf(attemptFacts(row.round.challenge, attempts.result.appId), zones))
  }
  /* The inspector: a policy or rule pressed on the run opens in the right-hand panel; Edit in builder is the way out. */
  const [inspect, setInspect] = useState<{ stack: InspectTarget[]; plan: EngineRun } | null>(null)
  /* Pinned this visit: ways back to a thing, and the other side of Compare. */
  const [pins, setPins] = useState<InspectTarget[]>([])
  const togglePin = (t: InspectTarget) => setPins((cur) => (cur.some((p) => sameTarget(p, t)) ? cur.filter((p) => !sameTarget(p, t)) : [...cur, t]))
  const onInspect = (t: InspectTarget, plan: EngineRun, fresh = false) => {
    noteOpener()
    setInspect((cur) => ({ stack: cur && panel === 'inspect' && !fresh ? [...cur.stack.filter((x) => !sameTarget(x, t)), t] : [t], plan }))
    setPanel('inspect')
  }
  const PEEK_SCREEN = { zone: { name: 'zones' }, device: { name: 'fingerprint' }, risk: { name: 'risk-signals' }, hook: { name: 'hooks' }, app: { name: 'applications' } } as const
  const editInBuilder = (t: InspectTarget) => {
    if (isPeek(t)) return t.kind === 'person' ? undefined : go(PEEK_SCREEN[t.kind])
    session.loadBoard(t.policyId, session.form)
    go(t.kind === 'rule' && t.ruleId ? { name: 'board', policyId: t.policyId, open: 'try', rule: t.ruleId } : { name: 'board', policyId: t.policyId, open: 'try' })
  }
  const openAttempt = (row: AppBreakInRow) => {
    if (row.policyId === null) return
    toBoardFor(row, row.policyId)
    go(row.ruleRef ? { name: 'board', policyId: row.policyId, open: 'try', rule: row.ruleRef } : { name: 'board', policyId: row.policyId, open: 'try' })
  }
  /* Fix in policy: this page has no draft, so the builder applies it to the
     policy's, on arrival (break-in-app.ts `fixOnArrival`). */
  const fixAttempt = (row: AppBreakInRow, offer: AppFixOffer) => {
    if (!attempts) return
    toBoardFor(row, offer.policy.id)
    go({ name: 'board', policyId: offer.policy.id, fix: { card: row.id, app: attempts.result.appId } })
  }

  /* The tables' doors (locked off with them): every road in is a load and a run. */
  const show = (t: SignInTestsTab) => {
    setTab(t)
    setSeen(t)
    if (t !== routeTab) go({ name: 'sign-in-tests', tab: t })
  }
  const tryForm = (form: SignInForm) => {
    setTryPage((p) => tryingPage(p, form))
    setLoaded(null)
    session.load(form)
    show('try')
  }

  if (TABLES && tab !== 'try') {
    let body = null
    if (tab === 'saved') {
      body = (
        <SavedTable
          onTry={tryForm}
          onNew={() => {
            setTryPage((p) => newSignInPage(p, session.runId, todayIn(), nowIn()))
            show('try')
          }}
        />
      )
    } else if (tab === 'people') {
      body = (
        <PeopleTable
          onTry={(personId, appId) => {
            const app = appId ?? session.form.appId
            const context = peopleContextOf(persona) ?? defaultPeopleContext(todayIn())
            tryForm(peopleTryForm(context, personId, app, rowsRead(policies, null, app, lib)))
          }}
        />
      )
    } else {
      body = <RunsReport onTry={tryForm} />
    }
    return (
      <div className="bpage">
        <PageHead title={ACCESS_CHECKS} crumb={{ label: 'Policies', onClick: () => go({ name: 'policies' }) }} />
        <Tabs className="bx-tabs--line sit__tabs" name={ACCESS_CHECKS} value={tab} options={TABS} onChange={(t) => show(t)} panelId={panelId} />
        <div id={panelId} role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label} className={`sit__panel is-${tab}`}>
          {body}
        </div>
      </div>
    )
  }

  /* Nothing saved to show — or saved sign-ins not yet in this phase
     (phase.ts) — and the empty canvas leaves Saved sign-ins out. */
  const anySaved = SAVED_SIGN_INS && savedSignIns.some((sv) => !sv.generated)
  return (
    <div className={`sit${onJarvis ? ' is-jarvis' : ''}`} data-stage={panelStage}>
      {/* The builder's bar: where you are, and nothing else — the page's two
          ways in, Check access and Saved sign-ins, are the canvas's (owner,
          1 Oct 2026: "move these two buttons inside the canvas"). Named once
          (names.ts; "something related to access"). */}
      {/* While the run's layouts are compared (phase.ts): the Canvas switch with
          its two shelves, the reasoning behind each layout, the guided tour to
          come, and Jarvis's own button. Hidden with the pickers (owner, 5 Oct
          2026: "we showcase one view — hide the rest: the archive, favourites and
          the canvas type"; run-layout.ts `CANVAS_PICKER`): the bar is where you
          are, and the page is Focus. */}
      <BoardBarPlain
        title={ACCESS_CHECKS}
        actions={
          CANVAS_OPTIONS && CANVAS_PICKER ? (
            <>
              <CanvasSwitch value={layout} onChange={setLayout} favourites={favourites} />
              {/* Focus has no button of its own (owner, 4 Oct 2026: Focus is the main view — the Canvas dropdown leads
                  to it, first on both shelves; v1 is archived, so no version switch); Aruna's way in stands on the
                  canvas, not here. */}
              {/* Reasoning and Guided tour · Soon are hidden for now (owner, 4 Oct 2026: "you can hide this as of
                  now … hide this as well, no need") — CanvasReasoning.tsx and GuidedTourSoon.tsx are kept. */}
            </>
          ) : undefined
        }
      />
      {/* The builder's region: the dotted ground under the canvas and the
          panel alike, the canvas in the middle track, the panel floating in
          the right one — a track closed to nothing while the panel is shut,
          so the canvas has the whole width. */}
      <div
        className={`bb sit__bb${anyPanel ? '' : ' is-insp-closed'}`}
        style={{ '--bb-insp': `${wide ? PANEL_WIDE : PANEL_NARROW}px`, '--bb-z': zoom } as CSSProperties}
      >
        <div className="sit__stage">
          <TryJourney
            page={tryPage}
            onPage={onTryPage}
            asGroup={asGroup}
            zoom={zoom}
            onZoom={setZoom}
            onInspect={INSPECTOR ? onInspect : undefined}
            onNode={() => openPanel(() => focusRow('person', true))}
            onAdd={(f) => openPanel(() => focusRow(tokenOfField(f), true))}
            onAskSave={() => openPanel(() => setSaveOpen(true))}
            onSaved={anySaved ? openSaved : undefined}
            focusRun={focusRun}
            panel={panel === 'form' || panel === 'saved' ? panel : null}
            why={why}
            onAsGroup={(g) => pickPerson(`${GROUP_PREFIX}${g}`, true)}
            onTryForm={playForm}
            onBlocked={DENIAL_REASONS ? openBlocked : undefined}
            onPickBlocked={DENIAL_REASONS ? fillBlocked : undefined}
            onGrant={grantAccess}
            onPickIdentity={showPick}
            loaded={loaded}
            breakIn={breakIn}
            onReviewBreakIn={reviewBreakIn}
            onReplay={shutBeside}
            onEdit={editSignIn}
            editing={panelOpen}
            unrun={unrun}
            onRunWith={(p, field) => patch(p, field, true)}
            layout={layout}
          />
          {/* Aruna's way in, on the canvas rather than the bar (owner, 4 Oct 2026: "remove it from the top bar and place
              it in a better way to have some more attraction"); the entrance opens from wherever it stands. Not drawn
              while the page shows one view (run-layout.ts `ARUNA_ENTRY`, 5 Oct 2026). */}
          {ARUNA_ENTRY && (
            <div className="sit-aruna-entry">
              <JarvisButton on={onJarvis} onPress={toggleJarvis} busy={jarvisPhase !== null} />
            </div>
          )}
        </div>
        <AnimatePresence initial={false}>
          {panelOpen && (
            <TryPanel
              key="panel"
              title={loaded?.name ?? ACCESS_CHECK}
              form={draft}
              rows={rows}
              issues={issues}
              boundaries={bounds}
              tips={tips}
              reduced={reduced}
              identities={tryPage.identities}
              onIdentities={pickIdentities}
              onPatch={patch}
              onRun={run}
              unrun={unrun}
              saved={savedSignIns}
              onUseSaved={trySaved}
              savedOpen={savedAt === 'panel'}
              onSavedOpen={(open) => setSavedAt(open ? 'panel' : null)}
              ran={ran}
              saveOpen={saveOpen}
              onSaveOpen={setSaveOpen}
              wide={wide}
              onToggleWidth={() => setWide((w) => !w)}
              onClose={() => closePanel(true)}
            />
          )}
          {/* The why and the attempts: one panel, keyed the same, its content swapped in place. */}
          {panel === 'why' && <WhyPanel key="side" reduced={reduced} slotRef={setWhySlot} slide={!swapped} />}
          {panel === 'break-in' && attempts && (
            <BreakInPanel
              key="side"
              result={attempts.result}
              appName={attempts.summary.appName}
              reduced={reduced}
              back={attemptsFrom === 'why'}
              slide={!swapped}
              wide={wide}
              onToggleWidth={() => setWide((w) => !w)}
              onClose={() => closePanel(true)}
              onBack={backToWhy}
              onPlay={playAttempt}
              onOpenRule={openAttempt}
              onFix={fixAttempt}
            />
          )}
          {/* The week's refused sign-ins, from the empty canvas's Blocked sign-ins: a panel in the form's slot, as Saved sign-ins is. */}
          {DENIAL_REASONS && panel === 'blocked' && <BlockedPanel key="blocked" reduced={reduced} wide={wide} onToggleWidth={() => setWide((w) => !w)} onClose={() => closePanel(true)} onPick={fillBlocked} />}
          {INSPECTOR && panel === 'inspect' && inspect && (
            <InspectPanel
              key="side"
              stack={inspect.stack}
              plan={inspect.plan}
              reduced={reduced}
              wide={wide}
              onToggleWidth={() => setWide((w) => !w)}
              onClose={() => closePanel(true)}
              onPush={(t) => setInspect((cur) => (cur ? { ...cur, stack: [...cur.stack, t] } : cur))}
              onGoTo={(i) => setInspect((cur) => (cur ? { ...cur, stack: cur.stack.slice(0, i + 1) } : cur))}
              onEdit={editInBuilder}
              pins={pins}
              onPin={togglePin}
              /* A group's check runs as one member who stands for it (sign-in-card.ts `memberOf`): that member is not
                 the person signing in, so Related names no person then — the application alone (review, 6 Oct 2026). */
              signIn={{ personId: asGroup ? null : session.form.personId, appId: session.form.appId }}
            />
          )}
          {panel === 'saved' && (
            <SavedPanel
              key="saved"
              saved={savedSignIns}
              reduced={reduced}
              wide={wide}
              onToggleWidth={() => setWide((w) => !w)}
              onClose={() => closePanel(true)}
              onPick={trySaved}
            />
          )}
        </AnimatePresence>
        {jarvisPhase && <JarvisTransition phase={jarvisPhase} stage={jarvisCover} />}
      </div>
    </div>
  )
}
