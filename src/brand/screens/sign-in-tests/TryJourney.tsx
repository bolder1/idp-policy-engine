import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AppWindow, ArrowUpRight, Check, ChevronDown, Clock, CornerDownRight, Gauge, Globe, ListFilter, MapPin, Minus, MonitorSmartphone, RotateCcw, Users, X, type LucideIcon } from 'lucide-react'

import { Button, StatusPill, Tip } from '../../kit'
import type { SavedSignIn } from '../../saved-sign-ins'
import { useBrand, useNameLookup } from '../../store'
import { columnView, type ColumnView } from '../board/try-sign-in'
import { useSimEnv } from '../sim-env'
import { resolveSignIn } from '../tenant-resolver'
import { boundariesOf } from '../testing/boundaries'
import { CONDITION_WORDS, type LineStatus } from '../testing/evidence'
import { rowsRead } from '../testing/rows-read'
import { screensOf } from '../testing/screens-of'
import { decisionSig, liveSentence } from '../testing/selectors'
import { useTestingSay, useTestingSession } from '../testing/session-state'
import { CHANGED_BY_WORDS, changedBy, factsOf, formOf, todayIn, type FormField, type SignInForm } from '../testing/sign-in-form'
import { OutcomeNode, RuleOutcome } from '../testing/TracePills'
import type { PillCategory } from '../testing/trace-pills'
import { WhatTheySee } from '../testing/WhatTheySee'
import {
  NOT_STATED_WORD,
  checkPhase,
  engineRun,
  policyPhase,
  policyNode,
  readersOf,
  rulePhase,
  suggestionsOf,
  timeline,
  type AskedField,
  type CheckRow,
  type EnginePolicy,
  type EngineRule,
  type EngineRun,
  type NodeId,
  type Timeline,
} from './engine-run'
import { boxesSig, engineWires, outcomePad, type Box, type Boxes } from './journey'
import { SignInCard, SignInNode, Suggestions, cardFieldId } from './SignInCard'
import { cardIssues, forRun, nowIn, withDefaults, type TryPage } from './sign-in-card'

/* -----------------------------------------------------------------------------
   Try a sign-in on the Sign-in tests page: an ENGINE RUN (TESTING-V4 §8).

   Stage 0   the canvas holds one card, the sign-in, and nothing else
   Stage 1   Run: the card collapses into the sign-in node at the left
   Stage 2   the engine runs, and the canvas fills in as it works:

             [engine line: spinner · "Checking rules in Developer tools" · Skip]

     Sign-in ──┬── Which policy ───┬── Rules ───────────────── Outcome
     [Arun]    ├─ [skeleton…]      ├─ [1 In the office ✓✓✓]━━ [Allow on 1 factor]
               └─ [Developer tools]┘   [2 · Not reached]
                                       [↳ Nothing else matched]

   The loading IS the explanation. Each column appears only when the engine
   reaches it, first as shimmering skeletons; a scan steps down the policies
   until the one that decides; each rule opens in turn and its checks are read
   one row at a time, spinner then mark, the first failing row ending the rule;
   the wire draws along the way the sign-in took; the answer lands last. One
   line at the top says what the engine is doing in plain words, and settles
   into a quiet summary with Replay. The plan is engine-run.ts's — this file
   only plays it, and every step it shows is the resolver's answer.

   The run is kept by the page (SignInTests.tsx `TryPage`), so a tab switch and
   back shows where it was, settled, and never plays again; a newer run in the
   testing session (Run, a saved sign-in's Try, Replay) is what plays.

   Motion. Motion owns every element it moves — the card and the node (one
   `layoutId`), a column's fade, a check row sliding open, a mark's pop, the
   answer's spring, a wire's `pathLength` — and journey.css gives none of them
   a transform or a transition. Reduced motion is the settled canvas at once:
   no morph, no shimmer, no drawing.
   -------------------------------------------------------------------------- */

/** The single verdict column: the tenant, as every policy is saved. */
const AS_IT_STANDS = { id: 'live' as const, label: 'As the tenant stands', tip: 'Every policy as saved' }

const CATEGORY_ICON: Record<PillCategory, LucideIcon> = {
  who: Users,
  network: Globe,
  place: MapPin,
  device: MonitorSmartphone,
  time: Clock,
  risk: Gauge,
  app: AppWindow,
  other: ListFilter,
}

/** The asked field a form field is stated in, for an error or Add. */
const ASKED_OF: Partial<Record<FormField, AskedField>> = { address: 'from', place: 'place', device: 'device', when: 'when', risk: 'risk' }

interface Playing {
  id: number
  plan: EngineRun
  tl: Timeline
  replay: boolean
}

export function TryJourney({ page, onPage }: { page: TryPage; onPage: (next: (p: TryPage) => TryPage) => void }) {
  const store = useBrand()
  const { users, apps, zones, fingerprints, policies, methods, defaultMethodId, savedSignIns } = store
  const session = useTestingSession()
  const say = useTestingSay()
  const env = useSimEnv()
  const names = useNameLookup()
  const reduced = useReducedMotion() === true
  const lib = useMemo(() => ({ zones, fingerprints }), [zones, fingerprints])

  // --- The sign-in that runs, and its answer ---

  const form = session.form
  const rows = useMemo(() => rowsRead(policies, null, form.appId, lib), [policies, form.appId, lib])
  const facts = useMemo(() => factsOf(form, zones).facts, [form, zones])
  const res = useMemo(() => resolveSignIn(policies, facts, env), [policies, facts, env])
  const ctx = useMemo(() => ({ people: users, apps, zones, rows }), [users, apps, zones, rows])
  const plan = (intro: TryPage['intro']) => engineRun({ res, policies, form, facts, env, ctx, names, intro })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `plan` reads exactly these
  const live = useMemo(() => plan('none'), [res, policies, form, facts, env, ctx, names])
  const column: ColumnView = useMemo(
    () => columnView({ spec: AS_IT_STANDS, resolution: res }, '', policies, (id) => apps.find((a) => a.id === id)?.name ?? id),
    [res, policies, apps],
  )
  const screens = useMemo(
    () => screensOf(res, { policies, methods, defaultMethodId, person: users.find((u) => u.id === form.personId) ?? null }),
    [res, policies, methods, defaultMethodId, users, form.personId],
  )
  const picks = useMemo(() => suggestionsOf(savedSignIns, (s) => resolveSignIn(policies, s.facts, env)), [savedSignIns, policies, env])

  // --- The card's sign-in (Stage 0, and while editing) ---

  const [editing, setEditing] = useState<{ field: AskedField | null } | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const draft = page.draft
  const draftRows = useMemo(() => rowsRead(policies, null, draft.appId, lib), [policies, draft.appId, lib])
  const draftBounds = useMemo(() => boundariesOf(draft, draftRows, {}, policies, env, zones), [draft, draftRows, policies, env, zones])
  const readers = useMemo(() => readersOf(policies, draft.appId, lib), [policies, draft.appId, lib])
  const issues = useMemo(() => (submitted ? cardIssues(draft, draftRows, zones) : []), [submitted, draft, draftRows, zones])

  const patchDraft = (p: Partial<SignInForm>, field: FormField) =>
    onPage((pg) => {
      const touched = pg.touched.includes(field) ? pg.touched : [...pg.touched, field]
      let next = { ...pg.draft, ...p }
      if (field === 'app') next = withDefaults(next, rowsRead(policies, null, next.appId, lib), touched, todayIn(), nowIn())
      return { ...pg, draft: next, touched }
    })

  // --- The run: waiting, playing, settled ---

  const pending = page.mode === 'journey' && session.runId > page.played && !live.empty
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the waiting run's plan, from what it starts with
  const pendingPlan = useMemo(() => (pending ? plan(page.intro) : null), [pending, page.intro, res, form])
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [step, setStep] = useState(0)
  const shown = playing?.plan ?? pendingPlan ?? live
  const s = playing ? step : pendingPlan ? 0 : shown.at.done
  const running = playing !== null || pendingPlan !== null
  const kind = shown.steps[s]?.kind

  const [changed, setChanged] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const skipRef = useRef<HTMLButtonElement | null>(null)
  const replayRef = useRef<HTMLSpanElement | null>(null)
  const editRef = useRef<HTMLButtonElement | null>(null)

  /* A newer run in the session: play it (or, under reduced motion, settle at once). */
  useEffect(() => {
    if (!pending || !pendingPlan) return
    const id = session.runId
    onPage((p) => ({ ...p, played: id }))
    setChanged(null)
    if (reduced) {
      say(liveSentence(res, policies))
      return
    }
    setPlaying({ id, plan: pendingPlan, tl: timeline(pendingPlan.steps, page.pace === 'edit' ? 'edit' : 'full'), replay: page.intro === 'none' })
    setStep(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a waiting run, once
  }, [pending, pendingPlan])

  /* The clock: each step holds for its time, then the next. A stage is said
     aloud as it starts; the answer once, at the end. */
  useEffect(() => {
    if (!playing) return
    const steps = playing.plan.steps
    const at = steps[step]
    if (at?.stage) say(playing.replay && steps.findIndex((x) => x.stage) === step ? `Replay. ${at.stage}` : at.stage)
    if (step >= steps.length - 1) {
      say(liveSentence(res, policies))
      setPlaying(null)
      return
    }
    const t = window.setTimeout(() => setStep(step + 1), playing.tl.dur[step])
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the run and its step, and only those, move the clock
  }, [playing, step])

  /* Landed: what an edited re-run changed, once, and Save when New sign-in asked for it. */
  const wasRunning = useRef(running)
  useEffect(() => {
    const landed = wasRunning.current && !running
    wasRunning.current = running
    if (!landed) return
    if (page.prev) {
      const before = resolveSignIn(policies, factsOf(page.prev, zones).facts, env)
      const field = decisionSig(before) !== decisionSig(res) ? changedBy(page.prev, form) : null
      setChanged(field ? CHANGED_BY_WORDS[field] : null)
    }
    if (page.askSave) setSaveOpen(true)
    if (page.prev || page.askSave) onPage((p) => ({ ...p, prev: null, askSave: false }))
    /* Skip had the focus and has gone: Replay takes its place. */
    const active = document.activeElement
    if (!active || active === document.body || active === skipRef.current) replayRef.current?.querySelector<HTMLElement>('button')?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs as a run lands
  }, [running])

  // --- Actions ---

  const startFrom = (f: SignInForm, intro: TryPage['intro'], pace: TryPage['pace'], prev: SignInForm | null) => {
    onPage((p) => ({ ...p, mode: 'journey', intro, pace, prev, draft: intro === 'fill' ? f : p.draft }))
    setEditing(null)
    setSubmitted(false)
    setSaveOpen(false)
    session.load(f)
  }
  const runCard = () => {
    const found = cardIssues(draft, draftRows, zones)
    if (found.length > 0) {
      setSubmitted(true)
      const f = found[0].field
      const id = f === 'person' || f === 'app' ? cardFieldId(f) : cardFieldId(ASKED_OF[f] ?? 'from')
      window.requestAnimationFrame(() => document.getElementById(id)?.querySelector<HTMLElement>('button')?.focus())
      return
    }
    const wasEditing = editing !== null
    startFrom(forRun(draft, draftRows), 'collapse', wasEditing ? 'edit' : 'full', wasEditing ? form : null)
    window.requestAnimationFrame(() => skipRef.current?.focus())
  }
  const trySaved = (sv: SavedSignIn) => {
    startFrom(formOf(sv.facts, zones), 'fill', 'full', null)
    window.requestAnimationFrame(() => skipRef.current?.focus())
  }
  const replay = () => {
    onPage((p) => ({ ...p, intro: 'none', pace: 'full', prev: null }))
    session.replay()
    window.requestAnimationFrame(() => skipRef.current?.focus())
  }
  const skip = () => {
    if (playing) setStep(playing.plan.steps.length - 1)
  }
  const edit = (field: AskedField | null = null) => {
    if (playing) setStep(playing.plan.steps.length - 1)
    onPage((p) => ({ ...p, draft: form, touched: [] }))
    setSubmitted(false)
    setSaveOpen(false)
    setEditing({ field })
  }
  const cancelEdit = () => {
    setEditing(null)
    setSubmitted(false)
    window.requestAnimationFrame(() => editRef.current?.focus())
  }
  const openPolicy = (policyId: string) => {
    session.loadBoard(policyId, form)
    store.go({ name: 'board', policyId, open: 'try' })
  }
  const openRule = (policyId: string, ruleId: string) => {
    session.loadBoard(policyId, form)
    store.go({ name: 'board', policyId, open: 'try', rule: ruleId })
  }

  // --- Stage 0 ---

  const card = (mode: 'new' | 'edit' | 'fill', f: SignInForm) => (
    <SignInCard
      mode={mode}
      form={f}
      rows={mode === 'fill' ? rows : draftRows}
      readers={mode === 'fill' ? readersOf(policies, f.appId, lib) : readers}
      issues={mode === 'fill' ? [] : issues}
      boundaries={draftBounds}
      onPatch={patchDraft}
      onRun={runCard}
      onCancel={mode === 'edit' ? cancelEdit : undefined}
      saved={savedSignIns}
      onUseSaved={trySaved}
      openField={mode === 'edit' ? (editing?.field ?? null) : null}
      reduced={reduced}
    />
  )

  const stage0 = page.mode === 'form' || live.empty
  if (stage0 || kind === 'fill') {
    return (
      <div className="tj">
        <div className="tj-canvas">
          <div className="tj-scroll">
            <div className="tj-start">
              <div className="tj-start__col">
                <p className="tj-start__label" aria-hidden>
                  Sign-in
                </p>
                {stage0 ? card('new', draft) : card('fill', form)}
                {stage0 && <Suggestions picks={picks} onPick={trySaved} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- The journey ---

  const at = shown.at
  const show = { which: s >= at.which, rules: at.rules >= 0 && s >= at.rules, deciding: s >= at.outcome - 1, outcome: s >= at.outcome }
  const animate = playing !== null && !reduced
  const text = s >= at.done ? shown.summary : (shown.steps[s]?.text ?? '')
  const decided = res.status === 'decided' ? res.decision : null

  return (
    <div className="tj">
      <div className={`tj-canvas${editing ? ' is-editing' : ''}`}>
        <EngineLine text={text} running={running} animate={animate} onSkip={skip} onReplay={replay} skipRef={skipRef} replayRef={replayRef} />
        <Journey
          plan={shown}
          s={s}
          show={show}
          animate={animate}
          reduced={reduced}
          editing={editing !== null}
          node={
            <SignInNode
              form={form}
              rows={rows}
              onEdit={() => edit(null)}
              editRef={editRef}
              saveOpen={saveOpen}
              onSaveOpen={setSaveOpen}
              shown={decided}
              reduced={reduced}
              hidden={editing !== null}
            />
          }
          editCard={editing ? card('edit', draft) : null}
          outcome={
            <OutcomeNode
              view={shown.outcome.view}
              columns={[column]}
              changed={running ? null : changed}
              hidden={false}
              fade={!reduced}
              reduced={reduced}
              whatTheySee={screens.length > 0 && form.appId ? <WhatTheySee screens={screens} appId={form.appId} defaultOpen /> : undefined}
            />
          }
          onOpenPolicy={openPolicy}
          onOpenRule={openRule}
          onAdd={(f) => edit(ASKED_OF[f] ?? null)}
        />
      </div>
    </div>
  )
}

// --- The engine line -------------------------------------------------------------------------

/* One raised pill at the top of the canvas: what the engine is doing, in
   plain words, with a spinner and Skip while it works; the quiet summary and
   Replay once it is done. The words change with every step; the status region
   says only the stages (the clock above), so a screen reader hears "Checking
   rules in …" once and not every check. */
function EngineLine({
  text,
  running,
  animate,
  onSkip,
  onReplay,
  skipRef,
  replayRef,
}: {
  text: string
  running: boolean
  animate: boolean
  onSkip: () => void
  onReplay: () => void
  skipRef: RefObject<HTMLButtonElement | null>
  replayRef: RefObject<HTMLSpanElement | null>
}) {
  return (
    <div className={`tj-engine${running ? ' is-running' : ' is-done'}`}>
      {running ? <Spinner /> : <Check className="tj-engine__done" size={14} strokeWidth={2.4} aria-hidden />}
      <motion.span
        key={text}
        className="tj-engine__text"
        initial={animate ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14 }}
        title={text}
      >
        {text}
      </motion.span>
      {running ? (
        <button ref={skipRef} type="button" className="bx-btn bx-btn--ghost bx-btn--sm tj-engine__skip" onClick={onSkip}>
          Skip
        </button>
      ) : (
        <span ref={replayRef} className="tj-engine__replay">
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onReplay}>
            Replay
          </Button>
        </span>
      )}
    </div>
  )
}

/** The engine working on something: an arc that turns (a static arc under reduced motion). */
function Spinner({ small = false }: { small?: boolean }) {
  return <span className={`tj-spin${small ? ' is-small' : ''}`} aria-hidden />
}

// --- The journey ---------------------------------------------------------------------------------

interface Show {
  which: boolean
  rules: boolean
  deciding: boolean
  outcome: boolean
}

function Journey({
  plan,
  s,
  show,
  animate,
  reduced,
  editing,
  node,
  editCard,
  outcome,
  onOpenPolicy,
  onOpenRule,
  onAdd,
}: {
  plan: EngineRun
  s: number
  show: Show
  animate: boolean
  reduced: boolean
  editing: boolean
  node: ReactNode
  editCard: ReactNode
  outcome: ReactNode
  onOpenPolicy: (policyId: string) => void
  onOpenRule: (policyId: string, ruleId: string) => void
  onAdd: (field: FormField) => void
}) {
  const stage = useRef<HTMLDivElement | null>(null)
  const [hot, setHot] = useState<NodeId | null>(null)
  const [pad, setPad] = useState(0)
  const decider = plan.decider
  const hover = (n: NodeId | null) => setHot(n)
  const fade = (on: boolean) => ({
    initial: animate ? { opacity: 0 } : false,
    animate: { opacity: on ? 1 : 0 },
    transition: { duration: animate ? 0.24 : 0 },
  })

  return (
    <div className="tj-scroll">
      <section ref={stage} className={`tj-stage${editing ? ' is-editing' : ''}`} aria-label="Sign-in journey">
        <JourneyWires stage={stage} plan={plan} s={s} show={show} hot={hot} animate={animate} onPad={setPad} />

        <div className="tj-col is-signin" data-col="sign-in">
          <p className="tj-col__head">Sign-in</p>
          <div className="tj-col__body">
            {node}
            {editCard && <div className="tj-editcard">{editCard}</div>}
          </div>
        </div>

        <motion.div className="tj-col is-which" data-col="which" {...fade(show.which)} aria-hidden={show.which ? undefined : true} inert={editing || !show.which}>
          <p className="tj-col__head">Which policy</p>
          {show.which && (
            <ol className="tj-col__body tj-which" aria-label="Which policy">
              {plan.policies.map((p) => (
                <PolicyRow key={p.policyId} p={p} s={s} hot={hot === p.node} onHover={hover} onOpen={() => onOpenPolicy(p.policyId)} />
              ))}
            </ol>
          )}
        </motion.div>

        <motion.div className="tj-col is-rules" data-col="rules" {...fade(show.rules)} aria-hidden={show.rules ? undefined : true} inert={editing || !show.rules}>
          <p className="tj-col__head">Rules</p>
          {show.rules && decider && (
            <ol className="tj-col__body tj-rules" aria-label={`Rules in ${decider.name}`}>
              {plan.rules.map((r) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  s={s}
                  animate={animate}
                  reduced={reduced}
                  onHover={hover}
                  onOpen={() => onOpenRule(decider.id, r.id)}
                  onAdd={onAdd}
                />
              ))}
            </ol>
          )}
        </motion.div>

        <motion.div className="tj-col is-outcome" data-col="outcome" {...fade(show.deciding)} aria-hidden={show.deciding ? undefined : true} inert={editing || !show.outcome}>
          <p className="tj-col__head">Outcome</p>
          <div className="tj-col__body" style={{ paddingTop: pad }}>
            {show.outcome ? (
              <motion.div
                className="tj-out"
                data-node="outcome"
                initial={animate ? { opacity: 0, scale: 0.9 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={animate ? { type: 'spring', stiffness: 420, damping: 26 } : { duration: 0 }}
              >
                {outcome}
                {decider && (
                  <Button variant="secondary" size="sm" iconRight={ArrowUpRight} onClick={() => onOpenPolicy(decider.id)}>
                    Open policy
                  </Button>
                )}
              </motion.div>
            ) : show.deciding ? (
              <div className="tj-out is-waiting" data-node="outcome" aria-hidden>
                <span className="tj-skel is-badge" />
                <span className="tj-skel is-line" />
                <span className="tj-skel is-short" />
              </div>
            ) : null}
          </div>
        </motion.div>
      </section>
    </div>
  )
}

// --- 2. A policy -------------------------------------------------------------------------------

/* One row of the Which policy column: a shimmering skeleton until the scan
   reaches it; being checked (its name, a spinner, the soft ring); then settled
   — the one that decides lit with the accent ring and "Decides", the rest
   stepped back with their reason. Pressing it opens the policy with this
   sign-in on its board. */
function PolicyRow({ p, s, hot, onHover, onOpen }: { p: EnginePolicy; s: number; hot: boolean; onHover: (n: NodeId | null) => void; onOpen: () => void }) {
  const phase = policyPhase(p, s)
  const state = phase !== 'settled' ? '' : p.decides ? ' is-decides' : ' is-dim'
  if (phase === 'waiting') {
    return (
      <li className="tj-prow is-waiting" data-node={p.node} aria-hidden>
        <span className="tj-prow__box">
          <span className="tj-skel is-line" />
          <span className="tj-skel is-short" />
        </span>
      </li>
    )
  }
  return (
    <li className={`tj-prow is-${phase}${state}${hot ? ' is-hot' : ''}`} data-node={p.node} onMouseEnter={() => onHover(p.node)} onMouseLeave={() => onHover(null)}>
      <Tip text={p.tip} placement="bottom">
        <button
          type="button"
          className="tj-prow__box"
          onClick={onOpen}
          onFocus={() => onHover(p.node)}
          onBlur={() => onHover(null)}
          tabIndex={phase === 'settled' ? 0 : -1}
        >
          <span className="tj-prow__top">
            <span className="tj-prow__name">{p.name}</span>
            {phase === 'working' ? <Spinner small /> : p.decides ? <span className="tj-prow__word">Decides</span> : null}
          </span>
          <span className="tj-prow__meta">
            <StatusPill status={p.status} />
            {phase === 'settled' && p.reason && <span className="tj-prow__reason">{p.reason}</span>}
          </span>
        </button>
      </Tip>
    </li>
  )
}

// --- 3. A rule ------------------------------------------------------------------------------------

const WORD: Record<EngineRule['state'], string> = { match: 'Match', 'no-match': 'No match', unknown: "Can't tell", off: 'Switched off', 'not-reached': 'Not reached' }

/* A rule card. A skeleton until the engine opens it; then its head and its
   checks arriving one row at a time under the scanning ring; then settled:

     match        the accent ring, every row, its THEN in full tone
     no-match     only the row that ended it, and "2 not checked"
     can't tell   the rows that could not be told, each with Add
     not reached  its title, ghosted
     off          its title, ghosted, "Switched off"

   The head is the button (it opens the rule on its board, in test mode); the
   rows are not in it, so a row's own controls — its sub-checks, Add — are not
   buttons inside a button. */
function RuleCard({
  rule,
  s,
  animate,
  reduced,
  onHover,
  onOpen,
  onAdd,
}: {
  rule: EngineRule
  s: number
  animate: boolean
  reduced: boolean
  onHover: (n: NodeId | null) => void
  onOpen: () => void
  onAdd: (field: FormField) => void
}) {
  const phase = rulePhase(rule, s)
  const ghost = rule.state === 'not-reached' || rule.state === 'off'
  const idx = rule.index !== null ? <span className="tj-rcard__idx">{rule.index + 1}</span> : (
    <span className="tj-rcard__idx is-last" aria-hidden>
      <CornerDownRight size={12} strokeWidth={2} />
    </span>
  )

  if (phase === 'waiting') {
    return (
      <li className="tj-rule">
        <div className="tj-rcard is-waiting" data-node={rule.node} aria-hidden>
          <div className="tj-rcard__head" data-port>
            <span className="tj-skel is-idx" />
            <span className="tj-skel is-line" />
          </div>
        </div>
      </li>
    )
  }

  const settled = phase === 'settled'
  const tone = !settled ? 'is-working' : ghost ? 'is-ghost' : rule.state === 'match' ? 'is-lit' : 'is-missed'
  /* The rows on the card: the ones read so far while it works; settled, all of
     a match, only the failing one of a no-match, the untold ones of a can't-tell. */
  const visible = rule.checks
    .map((row, k) => ({ row, k }))
    .filter(({ row, k }) => {
      if (checkPhase(rule, k, s) === 'hidden') return false
      if (!settled) return true
      if (rule.state === 'no-match') return k === rule.failing
      if (rule.state === 'unknown') return row.status !== 'pass'
      return true
    })
  const rest = rule.checks.length - rule.checked
  const end = !settled ? (
    <RuleOutcome decision={rule.decision} lit={false} />
  ) : rule.state === 'match' ? (
    <RuleOutcome decision={rule.decision} lit />
  ) : (
    <span className={`tj-rcard__word is-${rule.state}`}>{WORD[rule.state]}</span>
  )

  return (
    <li className="tj-rule">
      <div className={`tj-rcard ${tone}`} data-node={rule.node} onMouseEnter={() => onHover(rule.node)} onMouseLeave={() => onHover(null)}>
        <button
          type="button"
          className="tj-rcard__head"
          data-port
          onClick={onOpen}
          onFocus={() => onHover(rule.node)}
          onBlur={() => onHover(null)}
          tabIndex={settled ? 0 : -1}
        >
          {idx}
          <span className="tj-rcard__name">
            {rule.index !== null && <span className="u-sr-only">Rule {rule.index + 1}: </span>}
            {rule.name}
          </span>
          {end}
          {settled && rule.state === 'match' && <span className="u-sr-only">, {WORD.match}</span>}
        </button>
        {!ghost && (
          <ul className="tj-checks" aria-label={`Checks in ${rule.name}`}>
            <AnimatePresence initial={false}>
              {visible.map(({ row, k }) => (
                <CheckRowView key={row.key} row={row} working={checkPhase(rule, k, s) === 'working' && !settled} animate={animate} reduced={reduced} settled={settled} onAdd={onAdd} />
              ))}
            </AnimatePresence>
          </ul>
        )}
        {settled && rule.state === 'no-match' && rest > 0 && <p className="tj-rcard__rest">{rest} not checked</p>}
      </div>
    </li>
  )
}

/* One category of checks. Its word, what the rule asks, what this sign-in
   showed, and the mark on the right — a spinner while it is being read. A
   category with checks of its own (a device profile, a zone's two halves)
   opens them in place under a small chevron; they are never shown unasked.
   Not stated is grey words and Add, which opens the sign-in on that field. */
function CheckRowView({
  row,
  working,
  animate,
  reduced,
  settled,
  onAdd,
}: {
  row: CheckRow
  working: boolean
  animate: boolean
  reduced: boolean
  settled: boolean
  onAdd: (field: FormField) => void
}) {
  const [open, setOpen] = useState(false)
  const Icon = CATEGORY_ICON[row.category]
  const status = working ? 'working' : row.status
  const notStated = !working && row.value === NOT_STATED_WORD
  return (
    <motion.li
      className="tj-crowwrap"
      initial={animate ? { height: 0, opacity: 0 } : false}
      animate={{ height: 'auto', opacity: 1 }}
      exit={reduced ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
    >
      <div className={`tj-crow is-${status}`}>
        <Icon className="tj-crow__icon" size={14} strokeWidth={2} aria-hidden />
        <span className="tj-crow__word">{row.word}</span>
        <Tip text={<span className="tj-crow__tip">{row.tip}</span>} placement="bottom">
          <span className="tj-crow__text">
            <span className="tj-crow__req">{row.requirement}</span>
            <span className={`tj-crow__val${notStated ? ' is-unset' : ''}`}>{row.value}</span>
          </span>
        </Tip>
        {notStated && settled && row.missing ? (
          <button type="button" className="tj-crow__add" onClick={() => onAdd(row.missing!)} aria-label={`Add ${row.word.toLowerCase()}`}>
            Add
          </button>
        ) : row.subs.length > 0 && !working ? (
          <button
            type="button"
            className="tj-crow__more"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${row.word.toLowerCase()} checks`}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown size={13} strokeWidth={2} aria-hidden className={open ? 'is-open' : undefined} />
          </button>
        ) : (
          <span className="tj-crow__slot" aria-hidden />
        )}
        <span className="tj-crow__mark">
          {working ? <Spinner small /> : <Mark status={row.status} pop={animate} />}
          <span className="u-sr-only">{working ? 'Checking' : notStated ? NOT_STATED_WORD : CONDITION_WORDS[row.status]}</span>
        </span>
      </div>
      {open && (
        <ul className="tj-subs" aria-label={`${row.word} checks`}>
          {row.subs.map((sub) => (
            <li key={sub.key} className={`tj-sub is-${sub.status}`}>
              <span className="tj-sub__label">{sub.label}</span>
              <span className="tj-sub__val">
                {sub.actual}
                {sub.required && <span className="tj-sub__req"> · {sub.required}</span>}
              </span>
              <span className="tj-crow__mark">
                <Mark status={sub.status} pop={false} />
                <span className="u-sr-only">{CONDITION_WORDS[sub.status]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </motion.li>
  )
}

function Mark({ status, pop }: { status: LineStatus; pop: boolean }) {
  const glyph = status === 'pass' ? <Check size={13} strokeWidth={2.6} /> : status === 'fail' ? <X size={13} strokeWidth={2.6} /> : <Minus size={13} strokeWidth={2.4} />
  return (
    <motion.span
      className={`tj-mark is-${status}`}
      aria-hidden
      initial={pop ? { scale: 0.4, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { type: 'spring', stiffness: 560, damping: 24 } : { duration: 0 }}
    >
      {glyph}
    </motion.span>
  )
}

// --- The wires --------------------------------------------------------------------------------------

/* Where every measured box is, against the stage, by offsets — not by
   `getBoundingClientRect`: the node arrives by a layout animation and the
   answer by a spring, and a wire that followed a transform would wobble as they
   land. A port is the `data-port` element's middle, by offsets too. */
/* Where a wire meets a node, when not in its middle: the element marked
   `data-port` in it (a card's head, the sign-in's person), or the answer's
   first line in the board's outcome node. */
const PORT = '[data-port], .bb-outcome__in > :first-child'

function measure(stage: HTMLElement): { boxes: Boxes; cols: Record<string, Box> } {
  const off = (el: HTMLElement): { x: number; y: number } | null => {
    let x = 0
    let y = 0
    let at: HTMLElement | null = el
    while (at && at !== stage) {
      x += at.offsetLeft
      y += at.offsetTop
      at = at.offsetParent as HTMLElement | null
    }
    return at === stage ? { x, y } : null
  }
  const boxes: Boxes = {}
  stage.querySelectorAll<HTMLElement>('[data-node]').forEach((el) => {
    const o = off(el)
    if (!o) return
    const box: Box = { x: o.x, y: o.y, w: el.offsetWidth, h: el.offsetHeight }
    const portEl = el.querySelector<HTMLElement>(PORT)
    const p = portEl ? off(portEl) : null
    if (portEl && p) box.port = Math.round(p.y - o.y + portEl.offsetHeight / 2)
    boxes[el.dataset.node as NodeId] = box
  })
  const cols: Record<string, Box> = {}
  stage.querySelectorAll<HTMLElement>('[data-col]').forEach((el) => {
    const body = el.querySelector<HTMLElement>('.tj-col__body') ?? el
    const o = off(body)
    if (o) cols[el.dataset.col!] = { x: o.x, y: o.y, w: body.offsetWidth, h: body.offsetHeight }
  })
  return { boxes, cols }
}

interface Geo {
  w: number
  h: number
  boxes: Boxes
  cols: Record<string, Box>
  sig: string
}

/* The wires, drawn under the nodes in one SVG the size of the stage — its
   client size, so it can shrink as well as grow and never props the stage
   open. Measured after every step and whenever a column changes size (a row
   sliding open moves every card under it), so no wire aims at a stale box.

     neutral   the sign-in to every policy; the spine and its stubs into
               every rule card
     lit       the sign-in to the policy that decides; from it down the spine
               into the card being read — drawn on as the engine moves down,
               from where the last one ended — and from the card it stopped
               at out to the answer

   Hovering a policy or a card brightens its wire and steps the rest back. */
function JourneyWires({
  stage,
  plan,
  s,
  show,
  hot,
  animate,
  onPad,
}: {
  stage: RefObject<HTMLDivElement | null>
  plan: EngineRun
  s: number
  show: Show
  hot: NodeId | null
  animate: boolean
  onPad: (pad: number) => void
}) {
  const [geo, setGeo] = useState<Geo | null>(null)
  const ro = useRef<ResizeObserver | null>(null)

  const remeasure = useCallback(() => {
    const st = stage.current
    if (!st) return
    const { boxes, cols } = measure(st)
    const sig = `${st.clientWidth}x${st.clientHeight}|${boxesSig(boxes)}|${Object.entries(cols).map(([k, c]) => `${k}:${Math.round(c.y)},${Math.round(c.h)}`).join(';')}`
    setGeo((g) => (g?.sig === sig ? g : { w: st.clientWidth, h: st.clientHeight, boxes, cols, sig }))
  }, [stage])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => remeasure())
    ro.current = observer
    return () => observer.disconnect()
  }, [remeasure])

  /* After every render: measure, and watch every column body that is there now. */
  useLayoutEffect(() => {
    const st = stage.current
    if (st && ro.current) {
      ro.current.observe(st)
      st.querySelectorAll<HTMLElement>('.tj-col__body, .tj-rcard').forEach((el) => ro.current?.observe(el))
    }
    remeasure()
  })

  const landingNode = plan.landing !== null ? plan.rules[plan.landing].node : null
  const pad = geo ? outcomePad(geo.boxes, landingNode, geo.cols.outcome?.y ?? 0, (geo.cols.rules?.y ?? 0) + (geo.cols.rules?.h ?? 0)) : 0
  useEffect(() => onPad(pad), [pad, onPad])

  /* The card the lit wire runs into: the last the engine has opened. The
     wire into the next one is drawn on from where this one ended — its
     length, as a share of the new one's — so the line grows down the spine
     rather than starting over. */
  let lit: EngineRule | null = null
  for (const r of plan.rules) if (r.visited && r.startAt >= 0 && r.startAt <= s) lit = r
  const litWorking = lit !== null && rulePhase(lit, s) === 'working'
  const wires = geo ? engineWires(geo.boxes, { policies: plan.policies, rules: plan.rules, landing: landingNode }) : null
  const toLit = wires && lit && show.rules ? wires.toRule[lit.id] : undefined
  const last = useRef<{ id: string; length: number } | null>(null)
  const from = last.current && lit && toLit && last.current.id !== lit.id ? Math.min(1, last.current.length / Math.max(1, toLit.length)) : 0
  useEffect(() => {
    last.current = lit && toLit ? { id: lit.id, length: toLit.length } : null
  })

  if (!geo || !wires) return null
  const decidesShown = s >= plan.at.decides && wires.toDecider !== null
  const hotPolicy = hot?.startsWith('policy:') ? hot : null
  const hotRule = hot?.startsWith('rule:') ? hot : null
  const draw = (initialLength: number) => ({
    initial: animate ? { pathLength: initialLength } : false,
    animate: { pathLength: 1 },
    transition: { duration: animate ? 0.3 : 0, ease: [0.4, 0, 0.2, 1] as const },
  })

  return (
    <svg className={`tj-wires${hot ? ' has-hot' : ''}`} width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden focusable="false">
      {show.which &&
        wires.fan.map((f) => <path key={`fan-${f.policyId}`} className={`tj-wire${hotPolicy === policyNode(f.policyId) ? ' is-hot' : ''}`} d={f.d} />)}
      {show.rules && wires.trunk && <path className="tj-wire" d={wires.trunk} />}
      {show.rules &&
        wires.stubs.map((st) => {
          const node = `rule:${st.ruleId}` as NodeId
          return <path key={`stub-${st.ruleId}`} className={`tj-wire${hotRule === node ? ' is-hot' : ''}${litWorking && lit?.id === st.ruleId ? ' is-live' : ''}`} d={st.d} />
        })}
      {decidesShown && wires.toDecider && (
        <g className={`tj-lit${hotPolicy && !plan.policies.some((p) => p.decides && p.node === hotPolicy) ? ' is-back' : ''}`}>
          <motion.path key="to-decider" className="tj-route" d={wires.toDecider.d} {...draw(0)} />
        </g>
      )}
      {toLit && lit && (
        <g className={`tj-lit${hotRule && hotRule !== lit.node ? ' is-back' : ''}`}>
          <motion.path key={`to-${lit.id}`} className="tj-route" d={toLit.d} {...draw(from)} />
        </g>
      )}
      {show.outcome && wires.out && (
        <g className={`tj-lit${hotRule && hotRule !== landingNode ? ' is-back' : ''}`}>
          <motion.path key="out" className="tj-route" d={wires.out.d} {...draw(0)} />
        </g>
      )}
    </svg>
  )
}
