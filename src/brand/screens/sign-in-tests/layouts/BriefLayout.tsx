import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, PanelRight } from 'lucide-react'

import { stepMs } from '../use-engine-run'
import { AnswerText } from './assistant/AnswerText'
import { ASSISTANT_DOCK_PAD, AssistantDock, DockButton, DockSep } from './assistant/AssistantDock'
import type { Action, Answer, Target } from './assistant/intents'
import { useNarrator } from './assistant/voice'
import { useWhatIfs } from './assistant/what-if'
import { citeOfTarget, evidenceOf, howStepsOf, rowLitOf, spokenOf } from './brief-evidence'
import { alsoCoversOf } from './brief-how'
import { BRIEF_NARROW, briefWidth, useBriefRun } from './brief-input'
import { workingCite, type CiteId } from './brief-model'
import { HowPanel } from './brief-panel'
import { Sentence } from './brief-sentence'
import { useBriefStage } from './brief-stage'
import { textOf } from './brief-text'
import { BriefText0 } from './brief-text-0'
import { TextAnnounce } from './brief-text-parts'
import { BriefStageToggle } from './brief-theme'
import { RunStage, type StageView } from './RunStage'
import { SignInRow } from './shared/SignInRow'
import type { RunLayoutProps } from './types'
import './brief.css'
import './brief-text.css'

/* -----------------------------------------------------------------------------
   The run as a BRIEF (run-layout.ts `brief`): the answer first, as one
   sentence, and nothing else on the canvas (owner, 3 Oct 2026: "remove the
   evidence and add a button only … on the main screen show the text and the
   AI ask thing only"):

     [ Maya Iyer → AWS Console | Office network · Windows 11 laptop | ✎ ↻ Replay ]   the shared sign-in row
       Maya Iyer gets into AWS Console on one factor: AWS for engineering
       teams applies through Engineering, and rule 2 matches because the
       Windows 11 laptop meets Compliant devices.                              the sentence (brief-sentence.tsx)
       ⚠ the conflict line, when there is one
                         ▯ How it was decided                                   one quiet button
     [ Ask about this sign-in…                         ] [− 100% + ⤢ | ‹ › | ☾ 🔊]  the shared dock

   The evidence is in the page's RIGHT-HAND PANEL (brief-panel.tsx), drawn
   into its body (`props.why.slot`) with a portal, as EngineJourney.tsx draws
   the Why there. It opens from the button (pressed again, its X, or Escape
   shuts it), from a cited part of the sentence (on that part's step, lit),
   from the dock's ‹ › and ← →, and from the assistant ("How was it
   decided?", "What will Maya see?", "Show every check"). With no page panel
   (the builder's Check access) it opens under the button instead.

   The sentence's parts blur in as the engine proves each (its `at` step). A
   part and its step light each other (hovered or focused) and pin together
   (pressed). Words are ink; colour is on icons and on what it means.
   -------------------------------------------------------------------------- */

/* The text: the sentence as it is (owner, 3 Oct 2026 — of five more versions tried behind a switch, "the 0 one is the
   best": today's sentence, its underlines quiet until the pointer is over it). */
const Text = BriefText0

export default function BriefLayout(props: RunLayoutProps) {
  const { plan, s, running, reduced, jumped, runKey, rows, form, screens, animate } = props
  const [theme, setTheme] = useBriefStage()
  const stage = useRef<StageView | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const howBtn = useRef<HTMLButtonElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const narrator = useNarrator({ runKey, running, jumped, reduced })

  /* What is lit: hovered here, hovered in the dock's answer, pinned, the answer on show — all let go on a new run. */
  const [hot, setHot] = useState<CiteId | null>(null)
  const [dockHot, setDockHot] = useState<CiteId | null>(null)
  const [pinned, setPinned] = useState<CiteId | null>(null)
  const [seeAt, setSeeAt] = useState(0)
  const [answerOn, setAnswerOn] = useState<Answer | null>(null)
  /* How it was decided, with no page panel: open under the button. */
  const [inlineOpen, setInlineOpen] = useState(false)
  const [seen, setSeen] = useState(runKey)
  if (seen !== runKey) {
    setSeen(runKey)
    setHot(null)
    setDockHot(null)
    setPinned(null)
    setSeeAt(0)
    setAnswerOn(null)
    setInlineOpen(false)
  }
  const lit: CiteId | null = hot ?? dockHot ?? pinned ?? citeOfTarget(answerOn?.focus ?? null)
  /* The panel opening narrows the canvas and the sentence wraps again under a still pointer: the part it lands on is
     not hovered by the admin, so for a moment after a press opens the panel a hover is not taken (the press is). */
  const holdHot = useRef(0)
  const onHot = useCallback((c: CiteId | null) => {
    if (c !== null && performance.now() < holdHot.current) return
    setHot(c)
  }, [])

  /* Who signed in to what, how the deciding policy covers them, and the sentence: brief-input.ts, which Focus reads
     too for its brief (Focus2Layout.tsx, focus2-brief.tsx), so the two never say different things. */
  const { person, app, appName, groupName, personName, first, memberGroups, via, facts, briefIn, model } = useBriefRun(props)
  /* The plainer sentence, for versions 1–5. */
  const text = useMemo(() => textOf(plan, briefIn, model), [plan, briefIn, model])

  const last = s >= plan.steps.length - 1
  const landed = last || (plan.at.outcome >= 0 && s >= plan.at.outcome)
  const working = landed ? null : workingCite(plan, s, model.decisive)
  const durOf = useCallback((at: number) => stepMs(plan, at), [plan])

  /* The evidence (brief-evidence.ts), and its steps for the panel. */
  const ev = useMemo(
    () => evidenceOf(plan, model, { first, asGroup: groupName, name: groupName ? '' : (person?.name ?? ''), groups: memberGroups, via, appName, screens }),
    [plan, model, first, groupName, person, memberGroups, via, appName, screens],
  )
  const steps = useMemo(() => howStepsOf(ev), [ev])

  // --- How it was decided: the page's right-hand panel (else under the button) ---
  const why = props.why ?? null
  const open = landed && (why ? why.open : inlineOpen)
  const panelId = useId()
  /* Read at the press: the page's panel, as it stands. */
  const whyRef = useRef(why)
  useLayoutEffect(() => {
    whyRef.current = why
  })
  const setOpen = useCallback((o: boolean) => {
    const w = whyRef.current
    if (w) w.onOpen(o)
    else setInlineOpen(o)
    if (!o) setPinned(null)
  }, [])
  /* Shut from the panel (its X, Escape): the pin goes, and the focus comes back to the button when it was left on nothing. */
  const wasOpen = useRef(open)
  useEffect(() => {
    const was = wasOpen.current
    wasOpen.current = open
    if (!was || open) return
    setPinned(null)
    const id = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const a = document.activeElement
        const lost = !a || a === document.body || !a.isConnected
        if (lost && !document.querySelector('.sit-panel:not(.sit-whypanel)')) howBtn.current?.focus({ preventScroll: true })
      }),
    )
    return () => window.cancelAnimationFrame(id)
  }, [open])

  /* A cited part pressed: once landed it opens the panel on its step (pressed again, open, lets go); before, it only pins. */
  const onPress = useCallback(
    (c: CiteId) => {
      if (!landed) {
        setPinned((p) => (p === c ? null : c))
        return
      }
      if (open && pinned === c) {
        setPinned(null)
        return
      }
      setPinned(c)
      if (!open) {
        holdHot.current = performance.now() + 700
        setHot(null)
        setOpen(true)
      }
    },
    [landed, open, pinned, setOpen],
  )
  /* A version's own press: the panel open on a part's step, pinned (before the landing, it only pins). */
  const onOpenStep = useCallback(
    (c: CiteId) => {
      setPinned(c)
      if (!landed || open) return
      holdHot.current = performance.now() + 700
      setHot(null)
      setOpen(true)
    },
    [landed, open, setOpen],
  )

  // --- The camera: the brief fits at 100%; a new run, a landing or a new width fits it again ---
  const fitted = useRef<number | null>(null)
  useLayoutEffect(() => {
    fitted.current = landed ? runKey : null
    stage.current?.fit({ max: 1, jump: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new run, and on mount
  }, [runKey])
  useEffect(() => {
    if (!landed || fitted.current === runKey) return
    fitted.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, runKey, reduced, jumped, animate])

  /* The canvas's width: the world's, and the sentence's floor size when it is narrow. */
  const [canvas, setCanvas] = useState(1240)
  useEffect(() => {
    const ground = worldRef.current?.closest('.rstage')
    if (!ground || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((es) => {
      const w = es[0]?.contentRect.width ?? 0
      if (w > 0) setCanvas((cur) => (Math.abs(cur - w) >= 8 ? Math.round(w) : cur))
    })
    ro.observe(ground)
    return () => ro.disconnect()
  }, [])
  const width = briefWidth(canvas)
  const narrow = canvas < BRIEF_NARROW
  /* A new width (the panel opening or shutting), or the evidence opening under the button: fitted again. */
  const inlineShown = !why && open
  useEffect(() => {
    const id = window.requestAnimationFrame(() => stage.current?.fit({ max: 1, jump: true }))
    return () => window.cancelAnimationFrame(id)
  }, [width, narrow, inlineShown])

  /* Step through the parts (the dock's ‹ ›, or ← → on the canvas), one at a time, each on its step in the panel; Escape lets go. */
  const cites = model.cites
  const stepCite = useCallback(
    (d: 1 | -1) => {
      const at = pinned ? cites.indexOf(pinned) : -1
      const n = at < 0 ? (d > 0 ? 0 : cites.length - 1) : at + d
      const next = n < 0 || n >= cites.length ? null : cites[n]
      setPinned(next)
      if (next && !open) setOpen(true)
    },
    [cites, pinned, open, setOpen],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], .sit-panel') || e.altKey || e.ctrlKey || e.metaKey)) return
      if (e.key === 'Escape') {
        setPinned(null)
        if (!whyRef.current) setInlineOpen(false)
      } else if (landed && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        if (t?.closest('[role="toolbar"]:not(.ad__controls), [role="menu"], [role="listbox"], [role="tablist"]')) return
        e.preventDefault()
        stepCite(e.key === 'ArrowRight' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [landed, stepCite])

  /* The text, said once as it lands (a run seen playing; the narrator keeps it to once). */
  const spoken = spokenOf(model)
  const spokenRef = useRef(spoken)
  useLayoutEffect(() => {
    spokenRef.current = spoken
  })
  useEffect(() => {
    if (landed && spokenRef.current) void narrator.say(spokenRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once a landing; `say` keeps each line to once a run
  }, [landed, runKey])

  /* The dock: its citations light ours; an answer lights what it is about; this view's three presses open the panel. */
  const onCite = useCallback((t: Target | null) => setDockHot(citeOfTarget(t)), [])
  const onAnswer = useCallback((a: Answer | null) => setAnswerOn(a), [])
  const onAction = useCallback(
    (a: Action): boolean => {
      if (a.kind === 'see') {
        setSeeAt((n) => n + 1)
        setPinned('outcome')
        setOpen(true)
        return true
      }
      if (a.kind === 'checks') {
        setPinned(cites.includes('check') ? 'check' : 'rule')
        setOpen(true)
        return true
      }
      if (a.kind === 'how') {
        setOpen(true)
        return true
      }
      return false
    },
    [cites, setOpen],
  )
  const { onOpenPolicy, onOpenRule, onAdd, onReviewBreakIn, breakIn } = props
  const outcomeDecided = plan.outcome.status === 'decided' || plan.outcome.status === 'depends'
  /* What would change it: the previews, run here only once the panel is open (never the page's sign-in). */
  const whatIfs = useWhatIfs(form, rows, plan, open, props.policies)
  const changes = useMemo(() => whatIfs.list.filter((w) => w.changed).slice(0, 3), [whatIfs.list])
  const also = useMemo(() => alsoCoversOf(plan, ev), [plan, ev])
  const factWords = useMemo(() => facts.filter((f) => !f.unset).map((f) => f.text), [facts])
  const pinNo = pinned ? cites.indexOf(pinned) + 1 : 0

  const panel = open ? (
    <HowPanel
      ev={ev}
      steps={steps}
      first={first}
      appName={appName}
      appId={app?.id ?? null}
      who={groupName ? `Anyone in ${groupName}` : personName}
      asGroup={!!groupName}
      facts={factWords}
      tone={model.tone}
      lit={lit}
      pinned={pinned}
      onHot={onHot}
      onPin={(c) => setPinned((p) => (p === c ? null : c))}
      onClose={() => setOpen(false)}
      id={panelId}
      screens={outcomeDecided ? screens : []}
      seeAt={seeAt}
      reduced={reduced}
      also={also}
      whatIfs={changes}
      expected={props.expected}
      weaker={props.weaker}
      breakIn={breakIn && onReviewBreakIn ? { counts: breakIn.summary.counts, onReview: () => onReviewBreakIn(why ? 'why' : 'outcome') } : null}
      onOpenPolicy={onOpenPolicy}
      onOpenRule={onOpenRule}
      onAdd={onAdd}
      onAsGroup={props.onAsGroup}
      onRunWith={props.onRunWith}
      inline={!why}
    />
  ) : null

  return (
    <RunStage
      ref={stage}
      reduced={reduced}
      className={`rl-brief-stage is-${theme}`}
      label="Sign-in run, as a brief"
      externalDock
      onZoom={setZoom}
      pad={{ top: 64, bottom: ASSISTANT_DOCK_PAD, left: 32, right: 32 }}
      overlay={
        <>
          <SignInRow run={props} look={theme} lit={rowLitOf(lit, plan, model.decisive)} previewing={answerOn?.previewing ?? null} />
          <AssistantDock
            run={props}
            stage={stage}
            zoom={zoom}
            narrator={narrator}
            theme={theme}
            how
            onAnswer={onAnswer}
            onCite={onCite}
            onAction={onAction}
            renderAnswer={(a, ctx) => <AnswerText answer={a} animate={ctx.animate} onCite={ctx.onCite} numbers={false} />}
            controls={
              <>
                <DockButton label="Previous part" disabled={!landed} onClick={() => stepCite(-1)}>
                  <ChevronLeft size={15} strokeWidth={2} aria-hidden />
                </DockButton>
                <span className="rl-brief__stepno" aria-live="polite">
                  {pinNo > 0 ? `${pinNo} of ${cites.length}` : `${cites.length} parts`}
                </span>
                <DockButton label="Next part" disabled={!landed} onClick={() => stepCite(1)}>
                  <ChevronRight size={15} strokeWidth={2} aria-hidden />
                </DockButton>
                <DockSep />
              </>
            }
            trailing={<BriefStageToggle theme={theme} onChange={setTheme} />}
          />
        </>
      }
    >
      <div ref={worldRef} className={`rl-brief${narrow ? ' is-narrow' : ''}`} data-stage={theme} style={{ width }}>
        <div className="rl-brief__answer" aria-live="off">
          <Text
            text={text}
            brief={model}
            s={s}
            landed={landed}
            animate={animate}
            reduced={reduced}
            jumped={jumped}
            runKey={runKey}
            working={working}
            lit={lit}
            pinned={pinned}
            tone={model.tone}
            durOf={durOf}
            onHot={onHot}
            onPin={onPress}
            onOpen={onOpenStep}
            narrator={narrator}
            narrow={narrow}
          />
          {model.after.length > 0 && (
            <Sentence className="is-after" parts={model.after} num={model.num} s={s} landed={landed} animate={animate} working={null} lit={lit} pinned={pinned} tone={model.tone} durOf={durOf} onHot={onHot} onPin={onPress} numbers={false} />
          )}
        </div>
        <TextAnnounce text={spoken} landed={landed} />

        {/* The one press on the canvas: the evidence, in the panel. Held in its place from the start, shown once the answer is out. */}
        <button
          ref={howBtn}
          type="button"
          className={`rl-brief__how${open ? ' is-on' : ''}${landed ? '' : ' is-waiting'}`}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          disabled={!landed}
          onClick={() => setOpen(!open)}
        >
          <PanelRight size={14} strokeWidth={2} aria-hidden />
          How it was decided
        </button>

        {why ? why.slot && panel && createPortal(panel, why.slot) : panel}
      </div>
    </RunStage>
  )
}
