import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Command,
  Copy,
  CopyPlus,
  Eye,
  FileDown,
  Grid3x3,
  LayoutList,
  ListChecks,
  ListOrdered,
  Plus,
  Redo2,
  Rocket,
  ScrollText,
  Sparkles,
  Swords,
  Target,
  Trash2,
  GraduationCap,
  Undo2,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react'

import { Button, IconButton, MenuButton, Tip, TipDot, Toggle, type MenuItem } from '../kit'
import { blankRule, type Policy, type Rule } from '../data'
import { useBrand } from '../store'
import { AssignAppsDialog, CopyRuleDialog, ReviewDialog, SaveTemplateDialog } from './builder-dialogs'
import { DecisionLogDialog, TestPolicyDialog } from './builder-test'
import { describeChanges } from './changes'
import { CommandBar, baseCommands } from './command-bar'
import { diagnose, shadowedBy } from './diagnostics'
import { tourSeen, type Stop } from '../tour/tour-stops'

/* Both are mounted only while they are open, and both are the whole reason the
   builder's chunk was carrying the create flow and six animated figures it does
   not need to render a rule. `tour-stops` stays eager — it is a data module, and
   the first-run check has to run before the chunk is worth fetching. */
const Interview = lazy(() => import('../create/Interview').then((m) => ({ default: m.Interview })))
const Tour = lazy(() => import('../tour/Tour').then((m) => ({ default: m.Tour })))
const LearnPanel = lazy(() => import('../tour/LearnPanel').then((m) => ({ default: m.LearnPanel })))
import { FlowRail } from './flow-rail'
import { canRedo, canUndo, commit, historyKey, historyOf, redo, undo, type History } from './history'
import { PolicyOverview } from './overview'
import { Readiness } from './readiness'
import { ReviewStep } from './review-step'
import { applyFix } from './gauntlet'
import { GauntletDialog, GauntletPip } from './gauntlet-dialog'
import { ImpactArenaDialog, ImpactPip } from './impact-arena-dialog'
import {
  AudienceSection,
  ChecksSection,
  DEC_KEY,
  DEFAULT_PREVIEW,
  IfSection,
  PREVIEW_CAVEAT,
  PreviewPanel,
  ThenSection,
  previewContext,
  type PreviewState,
} from './rule-form'
import type { SimEnv } from './simulate'

/* -----------------------------------------------------------------------------
   Policy builder v4 — the trail.

   The previous v4 put a 720px form in the middle of a capped page and pinned a
   268px answer rail beside it. Measured, that spent 31% of a 1920 window on
   nothing while the form scrolled 2.1 screens and the rail overflowed with five
   rules. The rail was not under-used; it was over-subscribed, holding an
   outline, a tab pair and two panels that had to take turns.

   This pass changes three things and leaves the engine alone.

   · **The left side is v1's flow.** A start node, a spine you can insert
     between, decision-coloured tiles, drag to reorder. It draws what a list
     could only assert: a sign-in falls through the sequence until something
     catches it.

   · **The middle is a trail, not a scroll.** Who → When → Then → Check →
     Review, one step at a time, with the whole rule reviewable in one piece
     whenever you want it. Review is a place on the trail rather than a modal
     behind Publish.

   · **The right rail is gone.** What it held is now summoned: the live preview
     and the publish gate open as cards under the step you are on, and close
     when you are done with them. Nothing permanent, nothing taking turns.

   The buttons follow one grammar: one primary per view (Publish, or the step's
   Next), secondary for the rest, icon buttons where the icon is unambiguous,
   and a menu button wherever a group of actions would otherwise become a row of
   them.
   -------------------------------------------------------------------------- */

type StepId = 'who' | 'when' | 'then' | 'check' | 'review'
type StepState = 'ok' | 'warn' | 'error' | 'idle'
type SlideId = 'preview' | 'review' | 'launch'

/* The side panel's three faces. One slider, three things to put in it — the
   answer to "what would this do", the answer to "is it safe to ship", and the
   act of shipping. */
const SLIDES: { id: SlideId; label: string; title: string; icon: LucideIcon }[] = [
  { id: 'preview', label: 'Preview', title: 'Live preview', icon: Eye },
  { id: 'review', label: 'Review', title: 'Ready to publish', icon: ListChecks },
  { id: 'launch', label: 'Launch', title: 'Launch', icon: Rocket },
]

type Step = { id: StepId; label: string; title: string; hint?: string }

const ALL_STEPS: Step[] = [
  { id: 'who', label: 'Who', title: 'Who it applies to' },
  { id: 'when', label: 'When', title: 'When it applies' },
  { id: 'then', label: 'Then', title: 'What happens' },
  { id: 'check', label: 'Check', title: 'Checks & impact' },
  { id: 'review', label: 'Review', title: 'Review & publish' },
]

/* The trail is built from the edition rather than filtered at every use site.
   Half the file walks STEPS by index — next, back, "step 3 of 5" — and an array
   with holes in it would need every one of those to learn about the holes. */
function stepsFor(f: { checkStep: boolean; reviewStep: boolean }): Step[] {
  return ALL_STEPS.filter((s) => (s.id === 'check' ? f.checkStep : s.id === 'review' ? f.reviewStep : true))
}

/* The flow is wider than a list rail needs to be, because it is a diagram: v1's
   canvas earned that width and this is the same drawing. Draggable from there,
   and never at the trail's expense. */
const FLOW_DEFAULT = 380
const FLOW_MIN = 280
const FLOW_MAX = 620
const TRAIL_MIN = 560
const clampFlow = (want: number, avail: number) =>
  Math.min(FLOW_MAX, Math.max(FLOW_MIN, Math.min(want, Math.max(FLOW_MIN, avail - TRAIL_MIN))))

/* Which step owns which diagnostic. A finding that appears on the step where it
   can be fixed is a finding somebody acts on. */
const STEP_OF: Record<string, StepId> = {
  emptygroup: 'who',
  blank: 'when',
  contradiction: 'when',
  duplicate: 'when',
  catchall: 'when',
  mixed: 'when',
  empty: 'when',
  dupe: 'when',
  subsumed: 'when',
  unreachable: 'when',
  denyfactors: 'then',
  optout: 'then',
  nomethods: 'then',
  disabled: 'check',
  /* A condition naming a hook that no longer exists is fixed where conditions
     are edited. */
  hookgone: 'when',
  /* The other two hook findings are a mismatch between the rule's OUTCOME and
     the hook's failure behaviour, so Then is where one half of the fix lives —
     the other half is on the hook itself, which is why the message names it.

     `hookslow` is deliberately absent: nothing on this rule fixes a slow
     endpoint, so it belongs to Check alone rather than being routed to a step
     that cannot act on it. Check sees every finding regardless of mapping. */
  hookopen: 'then',
  hookclosed: 'then',
}

export function PolicyBuilderV4({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  const store = useBrand()
  const reduce = useReducedMotion()
  const saved = store.policyById(policyId)

  const [hist, setHist] = useState<History>(() => historyOf(saved ?? ({} as Policy)))
  const [selected, setSelected] = useState(0)
  const [step, setStep] = useState<StepId>('who')
  const [together, setTogether] = useState(false)
  const [slide, setSlide] = useState<SlideId | null>(null)
  const [ifView, setIfView] = useState<'build' | 'check'>('build')
  const [live, setLive] = useState('')
  const [pv, setPv] = useState<PreviewState>(DEFAULT_PREVIEW)
  const [hoverShadow, setHoverShadow] = useState<number | null>(null)
  const [cmd, setCmd] = useState(false)
  const [overview, setOverview] = useState(false)
  const features = store.features
  /* One array, derived once. Everything downstream indexes into it. */
  const STEPS = useMemo(() => stepsFor(features), [features])
  const [interview, setInterview] = useState(false)
  const [tour, setTour] = useState(false)
  const [learn, setLearn] = useState(false)
  const [dialog, setDialog] = useState<null | 'log' | 'test' | 'apps' | 'template' | 'gauntlet' | 'impact' | 'review' | 'copy'>(
    open ?? null,
  )

  const stage = useRef<HTMLDivElement | null>(null)
  const work = useRef<HTMLDivElement | null>(null)

  /* --- The flow's width, dragged. v1's grammar ---------------------------------
     Clamped against the room that actually exists, so the flow never claims a
     width the window cannot give it, and the trail always keeps TRAIL_MIN. */
  const [flowW, setFlowW] = useState(FLOW_DEFAULT)
  const [avail, setAvail] = useState(1200)

  /* Below this the three columns stop fitting: the flow was taking a third of a
     1024px window to be a rail. It becomes a drawer instead — the sequence is
     something you consult and pick from, not something you need in view while
     filling in a field. */
  const [narrow, setNarrow] = useState(false)
  const [flowOpen, setFlowOpen] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1120px)')
    const sync = () => {
      setNarrow(mq.matches)
      if (!mq.matches) setFlowOpen(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const measure = () => setAvail(work.current?.getBoundingClientRect().width ?? window.innerWidth)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  /* One AbortController owns every listener and the body styles, so a cancelled
     pointer or an unmount tears the whole thing down. Without pointercancel an
     interrupted drag leaves the page stuck in col-resize for the session. */
  const resizing = useRef<AbortController | null>(null)
  const endResize = useCallback(() => {
    resizing.current?.abort()
    resizing.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])
  useEffect(() => () => endResize(), [endResize])

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      endResize()
      const ac = new AbortController()
      resizing.current = ac
      const startX = e.clientX
      const startW = flowW
      /* Measured at pointer-down, not at mount: a ceiling taken on mount goes
         stale the moment the nav collapses or the window resizes, and silently
         caps the drag short of the width being asked for. */
      const room = work.current?.getBoundingClientRect().width ?? avail
      setAvail(room)
      const opts = { signal: ac.signal }
      window.addEventListener('pointermove', (ev: PointerEvent) => setFlowW(clampFlow(startW + (ev.clientX - startX), room)), opts)
      window.addEventListener('pointerup', endResize, opts)
      window.addEventListener('pointercancel', endResize, opts)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [flowW, avail, endResize],
  )

  const effectiveFlowW = clampFlow(flowW, avail)

  useEffect(() => {
    if (open) setDialog(open)
  }, [open])

  /* First arrival only, and never on top of something else. Opening the builder
     straight into the gauntlet from the policy list is a person who already
     knows what they came for. The settle delay is so the tour measures a laid
     out screen rather than a mounting one. */
  useEffect(() => {
    if (open || tourSeen()) return
    const t = window.setTimeout(() => setTour(true), 600)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (saved) setHist(historyOf(saved))
  }, [saved?.id])

  /* Registered above the early return, so the hook count cannot depend on
     whether the policy still exists. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* The shortcut goes with the feature. Leaving it bound would make the
         palette reachable in an edition whose menu says it does not exist. */
      if (features.commands && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmd((v) => !v)
        return
      }
      const action = historyKey(e)
      if (action) {
        e.preventDefault()
        setHist(action === 'redo' ? redo : undo)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Rebound when the edition changes, or the shortcut keeps working in an
    // edition that has taken the palette away.
  }, [features.commands])

  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
    }),
    [store],
  )

  const ctx = useMemo(() => previewContext(pv), [pv])
  const draft = hist.present

  if (!saved || !draft.id) {
    return (
      <div className="bpage bf">
        <p style={{ padding: 24 }}>That policy no longer exists.</p>
      </div>
    )
  }

  const rules = draft.rules
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const changes = dirty ? describeChanges(saved, draft) : []
  const diagnostics = diagnose(draft, store.groups, store.hooks)
  const index = Math.min(selected, Math.max(0, rules.length - 1))
  const rule: Rule | undefined = rules[index]
  const mine = diagnostics.filter((d) => d.ruleIndex === index)

  const patch = (p: Partial<Policy>) => setHist((h) => commit(h, { ...h.present, ...p }))
  const patchRule = (p: Partial<Rule>) => patch({ rules: rules.map((r, n) => (n === index ? { ...r, ...p } : r)) })

  const blockers = diagnostics.filter((d) => d.severity === 'error' && rules[d.ruleIndex]?.enabled !== false).length
  const shadowed = hoverShadow === null ? [] : shadowedBy(draft, hoverShadow)

  /* Derived, never awarded. A step is clear because nothing is wrong with it
     right now, and it goes back to unclear the moment something is. */
  /* Which diagnostics a step is answerable for. Check is the step that reports,
     so it sees all of them; every other step sees only the ones it can fix. */
  const diagsFor = (id: StepId) =>
    id === 'check' ? mine : mine.filter((d) => STEP_OF[d.id.split('-')[0]] === id)

  const stateOf = (id: StepId): StepState => {
    /* Green is only ever earned, and only here: a policy with nothing left to
       fix and nothing waiting to ship. Painting every untouched step green on
       arrival is awarding a state rather than deriving one, and it makes the
       one green that means something impossible to see. */
    if (id === 'review') return blockers > 0 ? 'error' : dirty ? 'warn' : 'ok'
    if (!rule) return 'idle'
    const scoped = diagsFor(id)
    if (scoped.some((d) => d.severity === 'error')) return 'error'
    if (scoped.some((d) => d.severity === 'warning')) return 'warn'
    return 'idle'
  }

  /* A badge and the chip around it must not disagree about how bad something
     is. Both are read from the same diagnostics. */
  const badgeTone = (id: StepId) => {
    const scoped = diagsFor(id)
    if (scoped.some((d) => d.severity === 'error')) return 'is-bad'
    if (scoped.some((d) => d.severity === 'warning')) return 'is-warn'
    return ''
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step)
  const goStep = (id: StepId) => {
    setStep(id)
    setTogether(false)
    stage.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  const addRule = (at = rules.length) => {
    const r = blankRule(`Rule ${rules.length + 1}`)
    patch({ rules: [...rules.slice(0, at), r, ...rules.slice(at)] })
    setSelected(at)
    setStep('who')
    setLive(`Rule added at position ${at + 1}`)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rules.length) return
    const next = [...rules]
    const [r] = next.splice(from, 1)
    next.splice(to, 0, r)
    patch({ rules: next })
    setSelected(to)
    setLive(`${r.name} moved to position ${to + 1}. Evaluation order changed.`)
  }

  const jump = (i: number) => {
    setSelected(i)
    setDialog(null)
    setCmd(false)
    setOverview(false)
    if (step === 'review') setStep(features.checkStep ? 'check' : 'then')
    stage.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  const duplicate = () => {
    if (!rule) return
    const copy = { ...rule, id: `r${Date.now()}`, name: `${rule.name} (copy)` }
    patch({ rules: [...rules.slice(0, index + 1), copy, ...rules.slice(index + 1)] })
    setSelected(index + 1)
    store.showToast(`${rule.name} duplicated`)
  }

  const remove = () => {
    if (!rule) return
    patch({ rules: rules.filter((_, n) => n !== index) })
    setSelected(Math.max(0, index - 1))
    setLive(`${rule.name} deleted`)
  }

  /* One menu in the top bar, and it holds only what is true of the *policy*.

     There were two — Tools and Actions — and Actions carried "Delete this rule"
     next to "Save as template", which is a footgun and a category error in the
     same row: one is scoped to the rule you happen to have selected, the other
     to the whole policy. Rule-scoped actions moved onto the rule (the ⋯ beside
     its name), which is both where they belong and where they stop needing a
     "this rule" in their label to be unambiguous. */
  const policyItems: MenuItem[] = [
    { id: 'test', label: 'Test a sign-in', icon: Sparkles, hint: 'One person, end to end' },
    ...(features.gauntlet
      ? [{ id: 'gauntlet', label: 'Policy gauntlet', icon: Swords, hint: '13 attempts against these rules' }]
      : []),
    ...(features.blastRadius ? [{ id: 'impact', label: 'Blast radius', icon: Target, hint: 'What publishing moves' }] : []),
    { id: 'log', label: 'Decision log', icon: ScrollText, hint: 'What the engine actually did' },
    { id: 'overview', label: 'Read it end to end', icon: BookOpen },
    { id: 'apps', label: `Assign apps (${draft.allApps ? 'all' : draft.appIds.length})`, icon: Grid3x3, divide: true },
    { id: 'template', label: 'Save as template', icon: FileDown },
    /* v0 §8. Restored whenever the Review step is withheld: taking the publish
       gate away must not also take away the only way to read a policy back and
       commit it, which is a v0 requirement rather than one of ours. */
    ...(features.reviewStep
      ? []
      : [{ id: 'review', label: 'Review & Save', icon: ClipboardCheck, hint: 'Read it back, then commit' }]),
    ...(features.commands ? [{ id: 'cmd', label: 'All commands', icon: Command, kbd: '⌘K' }] : []),
    { id: 'learn', label: 'Learn the builder', icon: GraduationCap, hint: 'The tour, and five guides', divide: true },
  ]

  const ruleItems: MenuItem[] = [
    { id: 'add', label: 'Add a rule below', icon: Plus },
    { id: 'duplicate', label: 'Duplicate', icon: Copy, hint: 'Below this one, in this policy' },
    /* Gap 3 in the framework doc. Sits beside Duplicate because they are the
       same gesture aimed at two places, and separating them would make the
       admin who wants the second one go looking for a different menu. */
    { id: 'copy', label: 'Copy to another policy…', icon: CopyPlus, hint: 'An independent copy' },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true },
  ]

  const onAction = (id: string) => {
    if (id === 'add') return addRule(index + 1)
    if (id === 'duplicate') return duplicate()
    if (id === 'copy') return setDialog('copy')
    if (id === 'delete') return remove()
    if (id === 'cmd') return setCmd(true)
    if (id === 'overview') return setOverview(true)
    if (id === 'learn') return setLearn(true)
    if (id === 'review') return setDialog('review')
    setDialog(id as typeof dialog)
  }

  return (
    <div className="bpage bf">
      <p className="u-sr-only" aria-live="polite">
        {live}
      </p>

      {/* --- Top bar. One primary, one group of tools, one group of actions. --- */}
      <header className="bf__bar">
        <IconButton icon={ArrowLeft} label="Back to policies" tone="ghost" onClick={() => store.go({ name: 'policies' })} />
        <input className="bf__name" aria-label="Policy name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />

        <div className="bf__baracts">
          {/* The blast-radius pip only exists once there is a blast radius. It
              used to sit here permanently reading "no change", which is a
              control occupying the bar to report nothing — and it made the one
              case that matters, a draft that moves people, look like more of
              the same furniture. */}
          <span className="bf__pips" data-tour="gauntlet">
            {features.gauntlet && <GauntletPip policy={draft} onOpen={() => setDialog('gauntlet')} />}
            {features.blastRadius && dirty && <ImpactPip draft={draft} saved={saved} onOpen={() => setDialog('impact')} />}
          </span>
          <span className="bf__sep" aria-hidden />
          {/* On the bar, not in a menu. The tour used to be reachable only from
              the Policy menu, which makes "show me that again" a search — and
              everything else explanatory had nowhere to live at all. */}
          <IconButton icon={GraduationCap} label="Learn the builder" size="sm" tone="ghost" onClick={() => setLearn(true)} />
          <IconButton icon={Undo2} label="Undo" size="sm" tone="ghost" disabled={!canUndo(hist)} onClick={() => setHist(undo)} />
          <IconButton icon={Redo2} label="Redo" size="sm" tone="ghost" disabled={!canRedo(hist)} onClick={() => setHist(redo)} />
          <MenuButton label="Policy" items={policyItems} onSelect={onAction} />
          {/* One primary per view. On the Review step the primary is the
              Publish button at the end of the checks, so this one stands down
              rather than competing with it. */}
          {/* The publish gate. In lite there is no Review step to send anyone
              to, and v0 commits from Review & Save in the Policy menu. */}
          {features.publish && step !== 'review' && (
            <Button variant="secondary" disabled={!rule && rules.length === 0} onClick={() => goStep('review')}>
              {blockers > 0 ? `${blockers} to fix` : 'Review & publish'}
            </Button>
          )}
        </div>
      </header>

      <div
        className={`bf__work ${narrow ? 'is-narrow' : ''} ${flowOpen ? 'is-flowopen' : ''}`}
        ref={work}
        style={{ ['--flow-w' as string]: `${effectiveFlowW}px` }}
      >
        {/* The drawer's backdrop. Only rendered while the drawer is, so it can
            never swallow a click on a wide window. */}
        {narrow && flowOpen && <button type="button" className="bf__flowscrim" aria-label="Close the sequence" onClick={() => setFlowOpen(false)} />}

        {/* --- Left: v1's flow ---------------------------------------------- */}
        <FlowRail
          policy={draft}
          selected={index}
          diagnostics={diagnostics}
          shadowed={shadowed}
          onSelect={(i) => {
            jump(i)
            setFlowOpen(false)
          }}
          onInsert={(at) => {
            addRule(at)
            setFlowOpen(false)
          }}
          onMove={move}
          onReorder={move}
          onHover={setHoverShadow}
        />

        {/* --- Drag to adjust. v1's grammar: an invisible corridor, a pill that
            surfaces when the pointer is near, double-click to reset, arrow keys
            for anyone who is not holding a mouse. ------------------------------ */}
        <div
          className="bf__split"
          hidden={narrow}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the flow"
          aria-valuenow={effectiveFlowW}
          aria-valuemin={FLOW_MIN}
          aria-valuemax={FLOW_MAX}
          tabIndex={0}
          onPointerDown={startResize}
          onDoubleClick={() => setFlowW(FLOW_DEFAULT)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setFlowW((w) => Math.min(FLOW_MAX, w + 24))
            if (e.key === 'ArrowLeft') setFlowW((w) => Math.max(FLOW_MIN, w - 24))
          }}
        >
          <span className="bf__splitpill" aria-hidden />
        </div>

        {/* --- Middle: the trail --------------------------------------------- */}
        <main className="bf__main">
          <nav className="bf__trail" aria-label="Steps" data-tour="trail">
            {/* Only where the flow is a drawer. On a wide window the sequence is
                already on screen and a button to reveal it would be a lie. */}
            {narrow && (
              <button
                type="button"
                className="bf__flowbtn"
                aria-expanded={flowOpen}
                onClick={() => setFlowOpen((v) => !v)}
              >
                <ListOrdered size={14} strokeWidth={1.9} aria-hidden />
                <span>{rules.length}</span>
              </button>
            )}

            {STEPS.map((s, i) => {
              const st = stateOf(s.id)
              const locked = s.id === 'review' && rules.length === 0
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`bf__step is-${st} ${step === s.id && !together ? 'is-on' : ''}`}
                  aria-current={step === s.id && !together ? 'step' : undefined}
                  disabled={locked || (!rule && s.id !== 'review')}
                  onClick={() => goStep(s.id)}
                >
                  <span className="bf__stepn">{i + 1}</span>
                  <span className="bf__steplabel">{s.label}</span>
                  {/* The When badge counts conditions, not problems — it is the
                      one badge here that is content rather than severity, so it
                      stays neutral and lets the chip carry the state. */}
                  {s.id === 'when' && rule && rule.conditions.length > 0 && <em>{rule.conditions.length}</em>}
                  {s.id === 'check' && mine.length > 0 && <em className={badgeTone('check')}>{mine.length}</em>}
                  {s.id === 'review' && blockers > 0 && <em className="is-bad">{blockers}</em>}
                </button>
              )
            })}

            <span className="bf__trailend">
              <button
                type="button"
                className={`bf__together ${together ? 'is-on' : ''}`}
                aria-pressed={together}
                onClick={() => setTogether((v) => !v)}
                disabled={!rule}
              >
                <LayoutList size={13} strokeWidth={2} aria-hidden />
                {together ? 'One at a time' : 'All together'}
              </button>

              {/* The three panel toggles live at the top right, on the side the
                  panel comes in from. They used to sit loose under the form,
                  which pointed at nothing. */}
              {/* Icon only. Three labelled buttons here read as three more
                  things to do; the panel they open says its own name in its
                  header, and the tooltip carries it before you click. */}
              <span className="bf__slidetabs" role="group" aria-label="Side panel" data-tour="panels">
                {SLIDES.map((s) => (
                  <Tip key={s.id} text={s.title} placement="bottom">
                    <button
                      type="button"
                      className={slide === s.id ? 'is-on' : ''}
                      aria-pressed={slide === s.id}
                      aria-label={s.title}
                      onClick={() => setSlide(slide === s.id ? null : s.id)}
                    >
                      <s.icon size={14} strokeWidth={1.9} aria-hidden />
                    </button>
                  </Tip>
                ))}
              </span>
            </span>
          </nav>

          <div className="bf__stage" ref={stage} data-tour="stage">
            {!rule ? (
              <div className="bf__blank">
                <Sparkles size={22} strokeWidth={1.6} aria-hidden />
                <h2>This policy has no rules</h2>
                <p>Every sign-in falls through to the engine default until there is one.</p>
                <div className="bf__blankacts">
                  {/* Offered first, because an empty builder is exactly where
                      somebody who has not met an ordered rule list is stuck. */}
                  {features.guidedSetup && (
                    <Button variant="primary" icon={Wand2} onClick={() => setInterview(true)}>
                      Guided setup
                    </Button>
                  )}
                  <Button icon={Plus} onClick={() => addRule()}>
                    Add the first rule
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* The rule's own identity, once, at the top of the stage —
                    where the old form spent 156px and a whole section on it.
                    Review is about the policy, so the rule's name is not its
                    heading. */}
                <div className="bf__rulehead" hidden={step === 'review' && !together}>
                  <span className={`bf__ruleno is-${DEC_KEY[rule.decision]}`}>{index + 1}</span>
                  <input
                    className="bf__ruleName"
                    aria-label="Rule name"
                    value={rule.name}
                    onChange={(e) => patchRule({ name: e.target.value })}
                  />
                  <label className="bf__ruleon">
                    <Toggle checked={rule.enabled} onChange={(v) => patchRule({ enabled: v })} label={`Enable ${rule.name}`} size="sm" />
                    <span>{rule.enabled ? 'On' : 'Off'}</span>
                  </label>
                  {/* Rule-scoped actions, on the rule. In the top bar they had
                      to say "this rule" to be unambiguous, and sat next to
                      policy-wide ones that could not be undone by the same
                      gesture. */}
                  <MenuButton label="⋯" items={ruleItems} onSelect={onAction} size="sm" align="end" />
                </div>

                {/* The rationale, under the name rather than beside it.

                    Borderless until focused, so an empty one is an invitation
                    and a filled one reads as a caption rather than as a form
                    control. That matters more here than anywhere else the field
                    appears: the head above it is one line by design, and giving
                    "why" a boxed input would put it on a level with the rule's
                    own name and cost the row the compactness it was built for. */}
                <textarea
                  className="bf__rulewhy"
                  hidden={step === 'review' && !together}
                  aria-label="Why this rule exists"
                  rows={1}
                  placeholder="Why does this rule exist? The next person will read this before changing it."
                  value={rule.description ?? ''}
                  onChange={(e) => patchRule({ description: e.target.value })}
                />

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={together ? 'all' : step}
                    initial={{ opacity: 0, x: reduce ? 0 : 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: reduce ? 0 : -12 }}
                    transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
                    className="bf__panel"
                  >
                    {together ? (
                      /* Every step at once, still editable. The trail is for
                         doing the work in order; this is for seeing whether the
                         whole rule says what you meant. */
                      <>
                        <AudienceSection rule={rule} onPatch={patchRule} n={1} />
                        <IfWrapper rule={rule} ifView={ifView} setIfView={setIfView} ctx={ctx} env={env} onPatch={patchRule} full />
                        <ThenSection rule={rule} onPatch={patchRule} n={3} />
                        <ChecksSection policy={draft} index={index} env={env} diagnostics={mine} onJump={jump} n={4} />
                      </>
                    ) : step === 'who' ? (
                      <AudienceSection rule={rule} onPatch={patchRule} bare />
                    ) : step === 'when' ? (
                      <IfWrapper rule={rule} ifView={ifView} setIfView={setIfView} ctx={ctx} env={env} onPatch={patchRule} />
                    ) : step === 'then' ? (
                      <ThenSection rule={rule} onPatch={patchRule} bare />
                    ) : step === 'check' ? (
                      <ChecksSection policy={draft} index={index} env={env} diagnostics={mine} onJump={jump} bare />
                    ) : (
                      <ReviewStep
                        draft={draft}
                        saved={saved}
                        env={env}
                        onJump={jump}
                        onOpen={(d) => setDialog(d)}
                        onPublish={(status) => {
                          /* The status is patched into the draft rather than
                             saved alongside it, so the builder's own dirty
                             check and the undo stack see the same policy the
                             store does. */
                          const shipped = { ...draft, status }
                          patch({ status })
                          store.savePolicy(shipped)
                          store.showToast(
                            status === 'monitor'
                              ? `${draft.name} is monitoring — evaluating every sign-in, enforcing nothing`
                              : `${draft.name} published and enforcing`,
                          )
                        }}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>

              </>
            )}
          </div>

          {/* --- The footer. One bar, docked.

              The unsaved-changes bar used to float over this one — two bars
              arguing for the same strip of screen, one of them on top of the
              other. There is one bar now: it carries the step navigation, and
              when there is something unsaved it says what changed and offers to
              throw it away, in the place you were already looking. ---------- */}
          {rule && (
            <footer className={`bf__stepnav ${dirty ? 'is-dirty' : ''}`}>
              {!together && (
                <Button
                  variant="ghost"
                  icon={ArrowLeft}
                  disabled={stepIndex === 0}
                  onClick={() => goStep(STEPS[Math.max(0, stepIndex - 1)].id)}
                >
                  {stepIndex === 0 ? 'Back' : STEPS[stepIndex - 1].label}
                </Button>
              )}

              <span className="bf__stepwhere">
                {dirty ? (
                  <>
                    <b>{changes[0]}</b>
                    {changes.length > 1 && <i>and {changes.length - 1} more</i>}
                  </>
                ) : together ? (
                  'The whole rule, in one piece'
                ) : (
                  `Step ${stepIndex + 1} of ${STEPS.length}`
                )}
              </span>

              {dirty && (
                <Button variant="ghost" onClick={() => setHist(historyOf(saved))}>
                  Discard
                </Button>
              )}

              {together || stepIndex === STEPS.length - 1 ? (
                <Button variant="primary" iconRight={ArrowRight} onClick={() => goStep('review')}>
                  Review &amp; publish
                </Button>
              ) : (
                <Button variant="primary" iconRight={ArrowRight} onClick={() => goStep(STEPS[stepIndex + 1].id)}>
                  {STEPS[stepIndex + 1].label}
                </Button>
              )}
            </footer>
          )}
        </main>

        {/* --- The slider ----------------------------------------------------
            A real column rather than an overlay: it slides in from the right
            and the trail gives up the width, so nothing you are editing is ever
            covered by the panel that is describing it. */}
        <aside className={`bf__slide ${slide ? 'is-open' : ''}`} aria-hidden={!slide}>
          <div className="bf__slideinner">
            <header className="bf__slidehead">
              <strong>{SLIDES.find((s) => s.id === slide)?.title ?? ''}</strong>
              {slide === 'preview' && <TipDot label="How this preview is calculated" text={PREVIEW_CAVEAT} />}
              <IconButton icon={X} label="Close the panel" size="sm" tone="ghost" onClick={() => setSlide(null)} />
            </header>

            <div className="bf__slidebody">
              {slide === 'preview' && rule && (
                <PreviewPanel policy={draft} index={index} pv={pv} onPv={setPv} ctx={ctx} env={env} onJump={jump} hideHeading />
              )}
              {slide === 'review' && (
                <Readiness draft={draft} saved={saved} env={env} blockers={blockers} onOpen={setDialog} onJump={jump} />
              )}
              {slide === 'launch' && (
                <div className="bf__launch">
                  {changes.length > 0 ? (
                    <>
                      <h4 className="u-label">What publishing changes</h4>
                      <ul className="bf__revchanges">
                        {changes.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="bf__launchclean">The draft matches what is live. Nothing to publish.</p>
                  )}

                  <div className="bf__launchacts">
                    <Button variant="secondary" block onClick={() => goStep('review')}>
                      Open the full review
                    </Button>
                    <Button
                      variant="primary"
                      block
                      disabled={!dirty || blockers > 0}
                      onClick={() => {
                        store.savePolicy(draft)
                        store.showToast(`${draft.name} published`)
                        setSlide(null)
                      }}
                    >
                      {blockers > 0 ? `${blockers} error${blockers === 1 ? '' : 's'} to fix` : 'Publish this policy'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {features.commands && cmd && (
          <CommandBar
            commands={baseCommands(rules, { canUndo: canUndo(hist), canRedo: canRedo(hist) })}
            onClose={() => setCmd(false)}
            onRun={(id) => {
              setCmd(false)
              if (id.startsWith('rule:')) return jump(Number(id.slice(5)))
              if (id === 'add') return addRule()
              if (id === 'undo') return setHist(undo)
              if (id === 'redo') return setHist(redo)
              if (id === 'publish') return goStep('review')
              setDialog(id as typeof dialog)
            }}
          />
        )}
      </AnimatePresence>

      <PolicyOverview open={overview} policy={draft} env={env} diagnostics={diagnostics} onClose={() => setOverview(false)} onJump={jump} />

      {/* Scoped to the builder. The create flow already has guided setup; this
          is for the screen you land on afterwards. */}
      {learn && (
        <Suspense fallback={null}>
          <LearnPanel open={learn} onClose={() => setLearn(false)} onStartTour={() => setTour(true)} />
        </Suspense>
      )}

      {tour && (
        <Suspense fallback={null}>
          <Tour
            open={tour}
            onClose={() => setTour(false)}
            onStep={(s) => {
              setStep(s)
              setTogether(false)
            }}
            onPanel={(p: Stop['panel']) => setSlide(p ?? null)}
            onFinish={() => setDialog('gauntlet')}
          />
        </Suspense>
      )}

      <AnimatePresence>
        {interview && (
          <Suspense fallback={null}>
          <Interview
            open={interview}
            onClose={() => setInterview(false)}
            onCreate={(built, builtName) => {
              patch({ rules: built, name: draft.name === 'Untitled policy' ? builtName : draft.name })
              setInterview(false)
              setSelected(0)
              setStep('who')
              store.showToast(`${built.length} rules written — review them before publishing`)
            }}
          />
          </Suspense>
        )}
      </AnimatePresence>

      <DecisionLogDialog open={dialog === 'log'} policy={draft} onClose={() => setDialog(null)} />
      <TestPolicyDialog open={dialog === 'test'} policy={draft} onClose={() => setDialog(null)} />
      <GauntletDialog
        open={features.gauntlet && dialog === 'gauntlet'}
        policy={draft}
        onClose={() => setDialog(null)}
        onJumpToRule={jump}
        onApplyFix={(fix) => {
          patch({ rules: applyFix(rules, fix) })
          setSelected(fix.at)
          const what = fix.kind === 'insert' ? 'inserted as' : 'now'
          setLive(`${fix.rule.name} ${what} rule ${fix.at + 1}`)
          store.showToast(`${fix.rule.name} ${what} rule ${fix.at + 1}`)
        }}
      />
      <ReviewDialog
        open={dialog === 'review'}
        policy={draft}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          store.savePolicy(draft)
          setDialog(null)
          store.showToast(`${draft.name} saved`)
        }}
        onAssignApps={() => setDialog('apps')}
      />

      <ImpactArenaDialog open={features.blastRadius && dialog === 'impact'} draft={draft} saved={saved} onClose={() => setDialog(null)} onJumpToRule={jump} />
      <AssignAppsDialog
        open={dialog === 'apps'}
        policy={draft}
        onClose={() => setDialog(null)}
        onChange={(appIds, allApps) => patch({ appIds, allApps })}
      />
      <CopyRuleDialog open={dialog === 'copy'} rule={rule} from={draft} onClose={() => setDialog(null)} />
      <SaveTemplateDialog
        open={dialog === 'template'}
        policy={draft}
        onClose={() => setDialog(null)}
        onSave={(t) => {
          setDialog(null)
          store.showToast(`${t.name} saved as a template`)
        }}
      />
    </div>
  )
}

/* The condition composer owns a picker that has to close when the step changes,
   so its open state lives with the step rather than with the builder. */
function IfWrapper({
  rule,
  ifView,
  setIfView,
  ctx,
  env,
  onPatch,
  full,
}: {
  rule: Rule
  ifView: 'build' | 'check'
  setIfView: (v: 'build' | 'check') => void
  ctx: ReturnType<typeof previewContext>
  env: SimEnv
  onPatch: (p: Partial<Rule>) => void
  /** All-together mode keeps the numbered section chrome. */
  full?: boolean
}) {
  const [adding, setAdding] = useState(false)
  return (
    <IfSection
      rule={rule}
      view={ifView}
      onView={setIfView}
      adding={adding}
      onAdding={setAdding}
      ctx={ctx}
      env={env}
      onPatch={onPatch}
      bare={!full}
      n={2}
    />
  )
}

