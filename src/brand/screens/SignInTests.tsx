import { AnimatePresence, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'

import type { SavedSignIn } from '../saved-sign-ins'
import { Tabs } from '../kit'
import { PageHead } from '../Shell'
import { useBrand } from '../store'
import { BoardBarPlain } from './board/BoardBar'
import { attemptFacts, attemptPlay, breakInOnApp, breakInSummary, type AppBreakInRow, type AppFixOffer } from './break-in-app'
import type { AttemptsFrom } from './sign-in-tests/attempts'
import { BreakInPanel } from './sign-in-tests/BreakInPanel'
import { readersOf } from './sign-in-tests/engine-run'
import { defaultPeopleContext, peopleContextOf } from './sign-in-tests/library'
import { ACCESS_CHECK, ACCESS_CHECKS } from './sign-in-tests/names'
import { PeopleTable } from './sign-in-tests/PeopleTable'
import { RunsReport } from './sign-in-tests/RunsReport'
import { SavedTable } from './sign-in-tests/SavedTable'
import {
  GROUP_PREFIX,
  PANEL_ID,
  cardIssues,
  forRun,
  initialTryPage,
  issueToken,
  newSignInPage,
  nowIn,
  peopleTryForm,
  personPick,
  tokenTips,
  tryingPage,
  withDefaults,
  type TryPage,
} from './sign-in-tests/sign-in-card'
import { TryJourney } from './sign-in-tests/TryJourney'
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
import { BREAK_IN_ATTEMPTS, SAVED_SIGN_INS } from './sign-in-tests/phase'

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

   The panel is ON DEMAND (owner, 30 Sep: "when the user comes the first
   time, don't show the configuration on the right side; first the user
   should click on the button, then it appears; and after configuration and
   the run it should close and we should focus on the main canvas"). A visit
   opens on the canvas alone, its track closed (`.bb.is-insp-closed`), so the
   canvas has the whole width. What opens it on the form: Check access on the
   empty canvas — the page's orange while the panel is shut, pressed and
   secondary while it is open, when Run in the panel's foot is the one
   orange; the sentence at the top of a run; Add on a Not stated row; Run
   with something missing. On the saved sign-ins: Saved sign-ins on the empty
   canvas, and a route to them (the board's link). What shuts it: Run, or a
   saved sign-in picked, which hand the focus to the canvas — the run begins
   once the panel has slid out, on the whole canvas; its X; Escape.

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
   - After a run, a changed field IS a run, at the edit pace: Run is not
     needed again. A change the facts object to (an address that is not one)
     waits, marked, until it is right.
   - A saved sign-in fills the panel, names it, and runs, the panel shut.
   - The sentence on the canvas, and Check access on the empty canvas, open
     the panel on its Person picker; Add on a Not stated row opens that
     fact's row.
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
   the why with it (`shutBeside`); shut, the focus goes back to the strip or
   the link that opened it, else Replay. A played attempt is held to what
   its row says (`attemptPlay`): a held one never shows a failure, a Weaker
   factor one says so.
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

/** Two sign-ins are the same run when every fact is. */
const same = (a: SignInForm, b: SignInForm) => JSON.stringify(a) === JSON.stringify(b)

export function SignInTests({ tab: routeTab = 'try' }: { tab?: SignInTestsTab }) {
  const { go, persona, policies, zones, fingerprints, savedSignIns, users, features, breakInAccepted } = useBrand()
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
  /* A group chosen in the Person picker (§13.3): its member runs, the picker
     and the node say the group. */
  const [asGroup, setAsGroup] = useState<string | null>(null)
  /* The saved sign-in the panel holds — its name for the header, what it
     expects for the answer, the sign-in as it was loaded — until it is
     changed. A break-in attempt's carries its factor too, where that is what
     failed (break-in-app.ts `attemptPlay`). */
  const [loaded, setLoaded] = useState<{ name: string; form: SignInForm; expected: SavedSignIn['expected']; weaker?: string | null } | null>(null)
  const [wide, setWide] = useState(true)
  /* The panel: shut on arrival — the canvas alone — until it is asked for;
     then the sign-in's form, or the saved sign-ins, the why, or the
     break-in attempts. A route to Saved sign-ins (the board's link) opens on
     them. */
  const [panel, setPanel] = useState<'form' | 'saved' | 'why' | 'break-in' | null>(null)
  /* The why's panel body, for the run to draw the why into. */
  const [whySlot, setWhySlot] = useState<HTMLDivElement | null>(null)
  /* Where the attempts were opened from: the why's section gives them a way back to it. */
  const [attemptsFrom, setAttemptsFrom] = useState<AttemptsFrom>('outcome')
  /* The why and the attempts are one panel: the one swapped in for the other is there at once, not slid in. */
  const [swapped, setSwapped] = useState(false)
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

  // --- The panel's sign-in ---

  const draft = tryPage.draft
  const rows = useMemo(() => rowsRead(policies, null, draft.appId, lib), [policies, draft.appId, lib])
  const bounds = useMemo(() => boundariesOf(draft, rows, {}, policies, env, zones), [draft, rows, policies, env, zones])
  const tips = useMemo(() => (draft.appId ? tokenTips(readersOf(policies, draft.appId, lib)) : {}), [policies, draft.appId, lib])
  const found = useMemo(() => cardIssues(draft, rows, zones), [draft, rows, zones])
  /* Said once Run has been pressed, and — once there is a run — as a change makes one. */
  const issues = submitted || tryPage.mode === 'journey' ? found : []

  /* The run on the canvas, for Save sign-in. */
  const ranForm = session.form
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
          setSaveOpen(false)
          setSavedAt(null)
          setSwapped(panel === 'break-in')
          setPanel('why')
        } else if (panel === 'why') closePanel(true)
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `closePanel` reads only `panel`
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
  /* Open the panel on the saved sign-ins: their search takes the focus as it arrives (SavedPanel). */
  const openSaved = () => {
    if (leaving.current) leaving.current.keepFocus = true
    setSaveOpen(false)
    setSavedAt(null)
    setPanel('saved')
  }
  /* Shut it, and — when the focus was in it, or asked to — hand the focus
     back to the canvas: the empty canvas's button for what was open, or
     the run's Replay, else the sentence at its top. The attempts give it to
     what opened them — the strip or the quiet link, else the strip that
     opened the why they came from — else Replay. */
  const closePanel = (focusBack = false) => {
    const from = panel
    const inPanel = !!(document.activeElement instanceof HTMLElement && document.activeElement.closest('.sit-panel'))
    setPanel(null)
    setSaveOpen(false)
    setSavedAt(null)
    if (!focusBack && !inPanel) return
    window.requestAnimationFrame(() => {
      const at = (sel: string) => document.querySelector<HTMLElement>(`.sit__stage ${sel}`)
      if (from === 'break-in') {
        const back = at('.tj-hero__attempts') ?? at('button.tj-hero__strip') ?? at('.tj-engine__replay button')
        back?.focus()
        return
      }
      /* The why gives it to what opens it on the answer — its strip, or
         Why? — as the why under the answer does, else Replay (review, 1 Oct
         2026: its X left the focus on nothing). */
      if (from === 'why') {
        const back = document.querySelector<HTMLElement>(WHY_DOOR) ?? at('.tj-engine__replay button')
        back?.focus()
        return
      }
      const ways = Array.from(document.querySelectorAll<HTMLElement>('.sit__stage .hiw__act button'))
      const door = (from === 'saved' ? ways[1] : ways[0]) ?? document.querySelector<HTMLElement>('.sit__stage .tj-engine__replay button, .sit__stage .tj-sin2__edit')
      door?.focus()
    })
  }
  /* What stands beside a run that is over — the why, the attempts — goes as
     any new run begins: each is about the run it came from (review, 1 Oct
     2026: Replay and an "As each group" re-run left them up over the new
     run, the why an empty card). The form and the saved sign-ins stay: an
     edit in the form is a run of its own. */
  const shutBeside = () => setPanel((p) => (p === 'why' || p === 'break-in' ? null : p))
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
  /* Escape shuts the panel — unless something is open over it (a picker's
     list, a fact's panel, Save sign-in, a Saved sign-ins picker), which takes
     that Escape itself. Taken on the way down: a closed Picker still stops
     the Escape that reaches it. */
  const anyPanel = panel !== null
  useEffect(() => {
    if (!anyPanel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('.sit-panel [aria-expanded="true"]')) return
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

  /* Every run is a load: the session's run moves on, and the canvas plays it. */
  const start = (f: SignInForm, pace: TryPage['pace'], next: Partial<TryPage> = {}) => {
    setTryPage((p) => ({ ...p, mode: 'journey', intro: 'none', pace, replay: false, prev: null, askSaveFor: null, ...next }))
    setSubmitted(false)
    setSaveOpen(false)
    shutBeside()
    session.load(f)
  }
  const run = () => {
    if (found.length > 0) {
      setSubmitted(true)
      openPanel(() => focusRow(issueToken(found)))
      return
    }
    const f = forRun(draft, rows)
    const askSaveFor = tryPage.askSaveFor
    toCanvas(() => start(f, 'full', { askSaveFor }))
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
     with defaults where nothing was set by hand. After a run, the change is a
     run of its own, at the edit pace, once the facts are right. */
  const patch = (p: Partial<SignInForm>, field: FormField) => {
    const touched = tryPage.touched.includes(field) ? tryPage.touched : [...tryPage.touched, field]
    let next = { ...tryPage.draft, ...p }
    const nextRows = field === 'app' ? rowsRead(policies, null, next.appId, lib) : rows
    if (field === 'app') next = withDefaults(next, nextRows, touched, todayIn(), nowIn())
    setTryPage((pg) => ({ ...pg, draft: next, touched }))
    setLoaded(null)
    if (tryPage.mode !== 'journey' || cardIssues(next, nextRows, zones).length > 0) return
    const f = forRun(next, nextRows)
    if (same(f, session.form)) return
    start(f, 'edit', { prev: session.form })
  }

  /* The Person picker: a person, or a group — its member runs (§13.3). */
  const pickPerson = (value: string) => {
    const pick = personPick(value, users)
    setAsGroup(pick.asGroup)
    patch({ personId: pick.personId }, 'person')
  }

  /* A saved sign-in fills the panel, names it, and runs, at full pace —
     with the panel shut: the run is what was asked for. */
  const trySaved = (sv: SavedSignIn) => {
    const f = formOf(sv.facts, zones)
    setAsGroup(null)
    setLoaded({ name: sv.name, form: f, expected: sv.expected })
    toCanvas(() => start(f, 'full', { draft: f, touched: [] }))
  }

  /* A break-in attempt pressed plays as a saved sign-in does: the form
     filled with it on this application (break-in-app.ts `attemptPlay`, the
     same sign-in the deck asked), named for it, what it should get the
     answer's Expected — the panel shut for the run. */
  const playAttempt = (row: AppBreakInRow) => {
    if (!attempts) return
    const p = attemptPlay(row, attempts.result.appId, policies)
    const f = formOf(p.facts, zones)
    setAsGroup(null)
    setLoaded({ name: p.name, form: f, expected: p.expected, weaker: p.weaker })
    toCanvas(() => start(f, 'full', { draft: f, touched: [] }))
  }
  /* Into the builder for an attempt — the rule that decided it, or its
     policy fixed — with the attempt in that policy's Check access, as the
     journey's own Open rule carries the run. */
  const toBoardFor = (row: AppBreakInRow, policyId: string) => {
    if (attempts) session.loadBoard(policyId, formOf(attemptFacts(row.round.challenge, attempts.result.appId), zones))
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
    setAsGroup(null)
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
    <div className="sit">
      {/* The builder's bar: where you are, and nothing else — the page's two
          ways in, Check access and Saved sign-ins, are the canvas's (owner,
          1 Oct 2026: "move these two buttons inside the canvas"). Named once
          (names.ts; "something related to access"). */}
      <BoardBarPlain title={ACCESS_CHECKS} />
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
            onNode={() => openPanel(() => focusRow('person'))}
            onAdd={(f) => openPanel(() => focusRow(tokenOfField(f), true))}
            onAskSave={() => openPanel(() => setSaveOpen(true))}
            onSaved={anySaved ? openSaved : undefined}
            focusRun={focusRun}
            panel={panel === 'form' || panel === 'saved' ? panel : null}
            why={why}
            onAsGroup={(g) => pickPerson(`${GROUP_PREFIX}${g}`)}
            loaded={loaded}
            breakIn={breakIn}
            onReviewBreakIn={reviewBreakIn}
            onReplay={shutBeside}
          />
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
              asGroup={asGroup}
              onPerson={pickPerson}
              onPatch={patch}
              onRun={run}
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
      </div>
    </div>
  )
}
