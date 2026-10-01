import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { ChevronsLeftRight, ChevronsRightLeft, History, ShieldAlert, Users, X, type LucideIcon } from 'lucide-react'

import type { AccessDecision, Policy } from '../../data'
import type { SavedSignIn } from '../../saved-sign-ins'
import { useBrand } from '../../store'
import { BreakInView, type BreakInKept } from '../break-in-view'
import { readersOf } from '../sign-in-tests/engine-run'
import { ACCESS_CHECK } from '../sign-in-tests/names'
import {
  GROUP_PREFIX,
  PANEL_ID,
  cardIssues,
  forRun,
  initialTryPage,
  issueToken,
  nowIn,
  personPick,
  tokenTips,
  tryingPage,
  withDefaults,
  type TryPage,
} from '../sign-in-tests/sign-in-card'
import { TryJourney } from '../sign-in-tests/TryJourney'
import { SavedPanel, TryPanel, WhyPanel } from '../sign-in-tests/TryPanel'
import { useSimEnv } from '../sim-env'
import { boundariesOf } from '../testing/boundaries'
import { DockPast } from '../testing/DockPast'
import { DockPeople } from '../testing/DockPeople'
import { rowsRead } from '../testing/rows-read'
import { useTestingSession } from '../testing/session-state'
import { factsOf, formOf, todayIn, type FormField, type SignInForm } from '../testing/sign-in-form'
import { boardScope, tokenDomId, tokenOfField, type TokenId } from '../testing/sign-in-sentence'
import { DOCK_TAB_LABEL, policyApps } from '../testing/test-dock'
import { PEOPLE_AND_BREAK_IN, firstCheckApp, onPolicyApps, type CheckView } from './test-mode'
import { boardVersion, columnsFor, runColumns } from './try-sign-in'
import './check-access.css'
import { SAVED_SIGN_INS } from '../sign-in-tests/phase'

/* -----------------------------------------------------------------------------
   Check access inside a policy: the builder's test mode, as the Sign-in tests
   page now has it (owner, 1 Oct 2026: "Now change the try a sign in inside
   policy builder with the current sign in tests we have" — then "Hide people
   and break-in test as of now. And past sign-ins can be a dedicated button in
   the top header").

     ┌ ← Policies › HRMS access …   [Past sign-ins] [Check access✓] [Save …] ┐
     │ · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · │
     │ · ·   the run of this policy's draft, in one column — or, before  · · │
     │ · ·   the first, how a test works — the whole canvas while the    · · │
     │ · ·   panel is shut                                               · · │
     │ · · · · · · · ·  [ Expand all | ⛶ | − + ]  · · · · · · · · · · · · · · │
     └────────────────────────────────────────────────────────────────────────┘
               opened:                        ┌ Check access ───── >< × ┐
                                              │ Use a saved sign-in     │
                                              │ Who · Application · …   │
                                              │       [Save] [▶ Run]    │
                                              └─────────────────────────┘

   The page's pieces, not a second look: the canvas is TryJourney (the
   engine line, the chain with this policy's cards, the answer and its why),
   the panel is TryPanel, and this file is the host the page is for them
   (SignInTests.tsx), its rules the page's — the panel shut on arrival and
   asked for, Run shutting it and handing the focus to the canvas, a changed
   field after a run a run of its own at the edit pace, Ctrl/⌘+Enter for Run,
   Escape shutting the panel. Kept apart from the page's because the page owns
   its tables and the builder owns its draft.

   What a policy changes:
     the run      resolved with the DRAFT standing in — unsaved edits are the
                  point of testing in the builder — and drawn as this policy's
                  trace (TryJourney `policy`); where the draft answers another
                  way than the tenant today, the answer says so once
     the sign-in  the policy's own, kept by the session (`boardForms`) past
                  the builder: the page's Open policy, a Describe it check and
                  an earlier visit all leave one, and it plays as Check access
                  opens; with none, nobody yet, on the policy's first
                  application. Its runs are counted here, not by the session
     the panel    scoped to the policy (`boardScope`): its applications, its
                  people first, its saved sign-ins
     the views    Past sign-ins, from its own button on the bar
                  (`CheckBarViews`), in the panel's place: a row fills the
                  sign-in and runs it, the panel shut. People and the Break-in
                  test are views of the same kind, hidden
                  (test-mode.ts `PEOPLE_AND_BREAK_IN`)
     Open policy  on this policy, back to its builder — on the rule, for Open
                  rule; another policy's builder, in Check access, as on the
                  page

   The builder (BoardBuilder.tsx) holds which panel is open and its width —
   its region's right-hand track follows them — and the board under the
   canvas, hidden, exactly as it was: closing Check access gives back the
   chain, the selection and the zoom. What a visit would lose as Check access
   shuts and opens again — the run, the panel's sign-in, the zoom — is kept
   by the builder too (`kept`, `BreakInKept`'s pattern).
   -------------------------------------------------------------------------- */

/** Which panel Check access has open beside the canvas: the sign-in, the saved sign-ins (the empty canvas's Saved sign-ins), or a view. */
export type CheckPanel = 'form' | 'saved' | 'why' | CheckView

/** What Check access keeps while it is shut, for the life of the builder. */
export interface CheckKept {
  page: TryPage
  runId: number
  asGroup: string | null
  loaded: Loaded | null
  zoom: number
}

/** The saved sign-in the panel holds, until it is changed: its name, what it expects, the sign-in as loaded. */
interface Loaded {
  name: string
  form: SignInForm
  expected: AccessDecision
}

/** How long the panel takes to slide in (TryPanel.tsx `SLIDE`): a row in it is opened once it has arrived. */
const ARRIVE_MS = 240
/** How long it takes to slide out: a run from it begins once it has gone. */
const LEAVE_MS = 260

/** The panel's slide, TryPanel's. */
const SLIDE = { duration: 0.22, ease: [0.2, 0, 0, 1] as const }

/** Two sign-ins are the same run when every fact is. */
const same = (a: SignInForm, b: SignInForm) => JSON.stringify(a) === JSON.stringify(b)

/** Each view's mark on its bar button. */
const VIEW_ICON: Record<CheckView, LucideIcon> = { past: History, people: Users, 'break-in': ShieldAlert }

/** A view's panel id, for its bar button's aria-controls. */
const viewId = (v: CheckView) => `bbchk-${v}`

export interface PolicyCheckProps {
  /** The policy as stored, and the builder's draft (its name, applications and audience the store's). */
  saved: Policy
  draft: Policy
  panel: CheckPanel | null
  onPanel: (panel: CheckPanel | null) => void
  wide: boolean
  onToggleWidth: () => void
  kept: MutableRefObject<CheckKept | null>
  /** Back to the builder, from Open policy on this policy — on a rule ('fallback' for the last row), for Open rule. */
  onBack: (rule?: string) => void
  /** A Break-in fix, onto the draft with Undo (the Break-in test, hidden). */
  onApplyFix: (next: Policy, toast: string) => void
  /** Where the focus goes as the sign-in's panel shuts with nothing on the canvas to take it: the bar's Check access. */
  focusBar: () => void
}

export function PolicyCheck({ saved, draft, panel, onPanel, wide, onToggleWidth, kept, onBack, onApplyFix, focusBar }: PolicyCheckProps) {
  const { go, policies, zones, fingerprints, savedSignIns, users, apps } = useBrand()
  const lib = useMemo(() => ({ zones, fingerprints }), [zones, fingerprints])
  const session = useTestingSession()
  const env = useSimEnv()
  const reduced = useReducedMotion() === true
  const stage = useRef<HTMLDivElement | null>(null)

  /* Where the visit starts: as it was left — or the policy's sign-in, played
     as Check access opens — or nobody yet, on the policy's first application. */
  const [start] = useState<CheckKept>(() => {
    if (kept.current) return kept.current
    const today = todayIn()
    const time = nowIn()
    const base = initialTryPage(1, today, time)
    const stored = session.boardForms[saved.id]
    if (stored) return { page: { ...tryingPage(base, onPolicyApps(stored, draft, apps)), played: 0 }, runId: 1, asGroup: null, loaded: null, zoom: 1 }
    const blank = { ...base.draft, appId: firstCheckApp(draft, apps) }
    return { page: { ...base, draft: withDefaults(blank, rowsRead(policies, draft, blank.appId, lib), [], today, time) }, runId: 1, asGroup: null, loaded: null, zoom: 1 }
  })
  const [page, setPage] = useState<TryPage>(start.page)
  const onPage = useCallback((next: (p: TryPage) => TryPage) => setPage(next), [])
  const [runId, setRunId] = useState(start.runId)
  const [asGroup, setAsGroup] = useState<string | null>(start.asGroup)
  const [loaded, setLoaded] = useState<Loaded | null>(start.loaded)
  const [zoom, setZoom] = useState(start.zoom)
  const [submitted, setSubmitted] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  /* The why's panel body, for the run to draw the why into. */
  const [whySlot, setWhySlot] = useState<HTMLDivElement | null>(null)
  const [focusRun, setFocusRun] = useState(0)
  useEffect(() => {
    kept.current = { page, runId, asGroup, loaded, zoom }
  })
  /* The Break-in test's own state, while another view takes the panel (hidden with it). */
  const breakInKept = useRef<BreakInKept | null>(null)

  // --- The sign-in that runs, and the panel's ---

  /* The policy's sign-in as the session keeps it — on the policy's own
     applications — or, before the first run, the panel's. */
  const stored = session.boardForms[saved.id]
  const ran = useMemo(() => onPolicyApps(stored ?? page.draft, draft, apps), [stored, page.draft, draft, apps])
  /* And the session keeps a move onto the policy's applications, so the old
     one does not come back from under a later run. */
  const { loadBoard } = session
  useEffect(() => {
    if (stored && stored.appId !== ran.appId) loadBoard(saved.id, ran)
  }, [stored, ran, saved.id, loadBoard])
  const replay = useCallback(() => setRunId((n) => n + 1), [])
  const run = useMemo(() => ({ form: ran, runId, replay }), [ran, runId, replay])
  const pair = useMemo(() => ({ saved, draft }), [saved, draft])

  const form = page.draft
  const scope = useMemo(() => boardScope(draft), [draft])
  const rows = useMemo(() => rowsRead(policies, draft, form.appId, lib), [policies, draft, form.appId, lib])
  /* The version the panel's rulers judge by: the one the canvas draws. */
  const substituteFor = useCallback((appId: string | null) => columnsFor(saved, draft, appId).at(-1)?.substitute, [saved, draft])
  const bounds = useMemo(() => {
    const substitute = substituteFor(form.appId)
    return boundariesOf(form, rows, substitute ? { substitute } : {}, policies, env, zones)
  }, [substituteFor, form, rows, policies, env, zones])
  const tips = useMemo(() => (form.appId ? tokenTips(readersOf(policies, form.appId, lib, draft)) : {}), [policies, form.appId, lib, draft])
  const found = useMemo(() => cardIssues(form, rows, zones), [form, rows, zones])
  const issues = submitted || page.mode === 'journey' ? found : []
  /* This policy's saved sign-ins: those on its applications — every one for the Global Default, and for a draft with none. */
  const mySaved = useMemo(
    () => (draft.isSystem || draft.appIds.length === 0 ? savedSignIns : savedSignIns.filter((s) => s.facts.appId !== undefined && draft.appIds.includes(s.facts.appId))),
    [savedSignIns, draft.isSystem, draft.appIds],
  )
  /* The run on the canvas, for Save sign-in: what it was, and what the draft decided. */
  const ranSave = useMemo(() => {
    if (page.mode !== 'journey' || !ran.personId || !ran.appId) return null
    const res = runColumns(columnsFor(saved, draft, ran.appId).slice(-1), policies, factsOf(ran, zones).facts, env)[0].resolution
    return { form: ran, shown: res.status === 'decided' ? res.decision : null }
  }, [page.mode, ran, saved, draft, policies, zones, env])

  /* A row of the panel takes the focus — and, asked to, opens: a Picker's list, or a fact's panel. */
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

  /* A run from the panel waiting for it to slide out, and whether the panel came back meanwhile. */
  const leaving = useRef<{ timer: number; keepFocus: boolean } | null>(null)
  useEffect(
    () => () => {
      if (leaving.current) window.clearTimeout(leaving.current.timer)
    },
    [],
  )
  /* Where the focus goes as a panel shuts: a view's own bar button; for the
     sign-in, the canvas — Replay, or Choose a person — else the bar's Check access. */
  const focusBack = (from: CheckPanel | null) =>
    window.requestAnimationFrame(() => {
      if (from && from !== 'form' && from !== 'saved') {
        document.querySelector<HTMLElement>(`.bbtop [data-check-view="${from}"]`)?.focus()
        return
      }
      const ways = Array.from(stage.current?.querySelectorAll<HTMLElement>('.hiw__act button') ?? [])
      const door = (from === 'saved' ? ways[1] : ways[0]) ?? stage.current?.querySelector<HTMLElement>('.tj-engine__replay button, .tj-sin2__edit')
      if (door) door.focus()
      else focusBar()
    })
  /* Open the sign-in's panel, then — once it has slid in — do `then`. */
  const openForm = (then?: () => void) => {
    const already = panel === 'form'
    if (leaving.current) leaving.current.keepFocus = true
    onPanel('form')
    if (!then) return
    if (already || reduced) then()
    else window.setTimeout(then, ARRIVE_MS)
  }
  const closePanel = (focus = false) => {
    const from = panel
    const inPanel = !!(document.activeElement instanceof HTMLElement && document.activeElement.closest('.sit-panel'))
    onPanel(null)
    setSaveOpen(false)
    setSavedOpen(false)
    if (focus || inPanel) focusBack(from)
  }
  /* A run from the panel or a view: the panel shuts, THEN the run begins, on
     the whole canvas, which takes the focus. At once when nothing was open,
     and under reduced motion. */
  const toCanvas = (begin: () => void) => {
    const wasOpen = panel !== null
    onPanel(null)
    setSaveOpen(false)
    setSavedOpen(false)
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
  /* Escape shuts the panel — unless something is open over it, which takes
     that Escape itself — and stops there: the builder's own Escape, which
     shuts Check access, is the next one. */
  const closeLatest = useRef(() => closePanel())
  useLayoutEffect(() => {
    closeLatest.current = () => closePanel(true)
  })
  useEffect(() => {
    if (panel === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('.sit-panel [aria-expanded="true"], .bbtop [aria-expanded="true"]:not([data-check-view])')) return
      e.preventDefault()
      closeLatest.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [panel])

  // --- Runs ---

  /* Every run is the policy's sign-in, stored, and a run counted here. */
  const begin = (f: SignInForm, pace: TryPage['pace'], next: Partial<TryPage> = {}) => {
    setPage((p) => ({ ...p, mode: 'journey', intro: 'none', pace, replay: false, prev: null, askSaveFor: null, ...next }))
    setSubmitted(false)
    setSaveOpen(false)
    loadBoard(saved.id, f)
    setRunId((n) => n + 1)
  }
  const runNow = () => {
    if (found.length > 0) {
      setSubmitted(true)
      openForm(() => focusRow(issueToken(found)))
      return
    }
    const f = forRun(form, rows)
    toCanvas(() => begin(f, 'full'))
  }
  /* Ctrl+Enter (⌘ on a Mac) presses Run from anywhere in Check access, before
     the builder reads it as Save: taken on the way down, and stopped. */
  const runLatest = useRef(runNow)
  useLayoutEffect(() => {
    runLatest.current = runNow
  })
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

  /* A field changed: the application brings the facts its rules read; after
     a run, the change is a run of its own, at the edit pace. */
  const patch = (p: Partial<SignInForm>, field: FormField) => {
    const touched = page.touched.includes(field) ? page.touched : [...page.touched, field]
    let next = { ...page.draft, ...p }
    const nextRows = field === 'app' ? rowsRead(policies, draft, next.appId, lib) : rows
    if (field === 'app') next = withDefaults(next, nextRows, touched, todayIn(), nowIn())
    setPage((pg) => ({ ...pg, draft: next, touched }))
    setLoaded(null)
    if (page.mode !== 'journey' || cardIssues(next, nextRows, zones).length > 0) return
    const f = forRun(next, nextRows)
    if (same(f, ran)) return
    begin(f, 'edit', { prev: ran })
  }
  const pickPerson = (value: string) => {
    const pick = personPick(value, users)
    setAsGroup(pick.asGroup)
    patch({ personId: pick.personId }, 'person')
  }
  /* A whole sign-in from elsewhere — a saved one, a past one — fills the panel and runs, the panel shut. */
  const tryWhole = (f: SignInForm, from: Loaded | null) => {
    setAsGroup(null)
    setLoaded(from)
    toCanvas(() => begin(f, 'full', { draft: f, touched: [] }))
  }
  const trySaved = (sv: SavedSignIn) => {
    const f = formOf(sv.facts, zones)
    tryWhole(f, { name: sv.name, form: f, expected: sv.expected })
  }

  // --- Open policy, Open rule ---

  /* This policy: back to its builder (on the rule). Another: its builder, in Check access, with this sign-in — the page's road. */
  const doors = useRef({ ran, onBack })
  useLayoutEffect(() => {
    doors.current = { ran, onBack }
  })
  const openPolicy = useCallback(
    (policyId: string) => {
      if (policyId === saved.id) return doors.current.onBack()
      loadBoard(policyId, doors.current.ran)
      go({ name: 'board', policyId, open: 'try' })
    },
    [saved.id, loadBoard, go],
  )
  const openRule = useCallback(
    (policyId: string, ruleId: string) => {
      if (policyId === saved.id) return doors.current.onBack(ruleId)
      loadBoard(policyId, doors.current.ran)
      go({ name: 'board', policyId, open: 'try', rule: ruleId })
    },
    [saved.id, loadBoard, go],
  )

  const version = useMemo(() => boardVersion(saved, draft), [saved, draft])
  const mine = useMemo(() => policyApps(draft, apps), [draft, apps])
  const closeView = () => closePanel(true)
  /* The why, in the panel: the answer's Review conflict, the policy's count. */
  const why = useMemo(() => ({ open: panel === 'why', slot: whySlot, onOpen: (o: boolean) => onPanel(o ? 'why' : null) }), [panel, whySlot, onPanel])

  return (
    <>
      <div ref={stage} className="sit__stage bbchk">
        <TryJourney
          page={page}
          onPage={onPage}
          asGroup={asGroup}
          zoom={zoom}
          onZoom={setZoom}
          onNode={() => openForm(() => focusRow('person'))}
          onAdd={(f) => openForm(() => focusRow(tokenOfField(f), true))}
          onAskSave={() => openForm(() => setSaveOpen(true))}
          onSaved={SAVED_SIGN_INS && mySaved.some((s) => !s.generated) ? () => onPanel('saved') : undefined}
          focusRun={focusRun}
          panel={panel === 'form' || panel === 'saved' ? panel : null}
          why={why}
          onAsGroup={(g) => pickPerson(`${GROUP_PREFIX}${g}`)}
          loaded={loaded}
          policy={pair}
          run={run}
          onOpenPolicy={openPolicy}
          onOpenRule={openRule}
        />
      </div>
      <AnimatePresence initial={false}>
        {panel === 'form' && (
          <TryPanel
            key="form"
            title={loaded?.name ?? ACCESS_CHECK}
            form={form}
            rows={rows}
            issues={issues}
            boundaries={bounds}
            tips={tips}
            reduced={reduced}
            asGroup={asGroup}
            onPerson={pickPerson}
            onPatch={patch}
            onRun={runNow}
            saved={mySaved}
            onUseSaved={trySaved}
            savedOpen={savedOpen}
            onSavedOpen={setSavedOpen}
            ran={ranSave}
            saveOpen={saveOpen}
            onSaveOpen={setSaveOpen}
            wide={wide}
            onToggleWidth={onToggleWidth}
            onClose={() => closePanel(true)}
            scope={scope}
          />
        )}
        {panel === 'why' && <WhyPanel key="why" reduced={reduced} slotRef={setWhySlot} />}
        {panel === 'saved' && (
          <SavedPanel key="saved" saved={mySaved} reduced={reduced} wide={wide} onToggleWidth={onToggleWidth} onClose={closeView} onPick={trySaved} />
        )}
        {panel === 'past' && (
          <ViewPanel key="past" view="past" reduced={reduced} wide={wide} onToggleWidth={onToggleWidth} onClose={closeView}>
            <DockPast draft={draft} apps={mine} version={version} onLoad={(f) => tryWhole(f, null)} />
          </ViewPanel>
        )}
        {PEOPLE_AND_BREAK_IN && panel === 'people' && (
          <ViewPanel key="people" view="people" reduced={reduced} wide={wide} onToggleWidth={onToggleWidth} onClose={closeView}>
            <DockPeople draft={draft} apps={mine} form={ran} version={version} onPatch={patch} />
          </ViewPanel>
        )}
        {PEOPLE_AND_BREAK_IN && panel === 'break-in' && (
          <ViewPanel key="break-in" view="break-in" reduced={reduced} wide={wide} onToggleWidth={onToggleWidth} onClose={closeView}>
            <div className="tpanel__breakin">
              <BreakInView
                policy={draft}
                policies={policies}
                env={env}
                caption={`${draft.name} · ${version?.label ?? 'Live'}`}
                onApplyFix={onApplyFix}
                onOpenInBoard={(rule) => onBack(rule)}
                kept={breakInKept}
                layout="panel"
              />
            </div>
          </ViewPanel>
        )}
      </AnimatePresence>
    </>
  )
}

/* A view beside the canvas, in the sign-in panel's place and chrome: the
   Inspector's floating card, its name in the head row with the width and the
   X, the view under it. It slides as TryPanel slides (motion props; there,
   and gone, under reduced motion), and is inert on its way out. */
function ViewPanel({
  view,
  reduced,
  wide,
  onToggleWidth,
  onClose,
  children,
}: {
  view: CheckView
  reduced: boolean
  wide: boolean
  onToggleWidth: () => void
  onClose: () => void
  children: ReactNode
}) {
  const present = useIsPresent()
  const heading = useId()
  return (
    <motion.aside
      id={viewId(view)}
      className="bb__insp sit-panel bbchk-view"
      aria-labelledby={heading}
      inert={!present || undefined}
      initial={reduced ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 24 }}
      transition={SLIDE}
    >
      <div className="bb__inspbar is-rule">
        <h2 id={heading} className="sit-panel__title">
          {DOCK_TAB_LABEL[view]}
        </h2>
        <button type="button" className="bb__act" aria-label={wide ? 'Narrow the panel' : 'Widen the panel'} title={wide ? 'Narrow' : 'Widen'} onClick={onToggleWidth}>
          {wide ? <ChevronsRightLeft size={14} strokeWidth={2} /> : <ChevronsLeftRight size={14} strokeWidth={2} />}
        </button>
        <button type="button" className="bb__act" aria-label="Close the panel" title="Close" onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>
      <div className="bbchk-view__body">{children}</div>
    </motion.aside>
  )
}

/* The views' buttons on the builder's bar, while Check access is on: Past
   sign-ins (and, while they are back, People and the Break-in test) — the
   page's Saved sign-ins button, secondary, pressed while its panel is open.
   A press opens its view in the right-hand panel, or shuts it. */
export function CheckBarViews({ views, panel, onToggle }: { views: readonly CheckView[]; panel: CheckPanel | null; onToggle: (view: CheckView) => void }) {
  return (
    <>
      {views.map((v) => {
        const Icon = VIEW_ICON[v]
        const on = panel === v
        return (
          <button
            key={v}
            type="button"
            data-check-view={v}
            className={`bx-btn bx-btn--neutral bx-btn--sm sit__savedbtn${on ? ' is-on' : ''}`}
            aria-expanded={on}
            aria-controls={on ? viewId(v) : undefined}
            onClick={() => onToggle(v)}
          >
            <Icon size={13} strokeWidth={2} aria-hidden />
            {DOCK_TAB_LABEL[v]}
          </button>
        )
      })}
    </>
  )
}
