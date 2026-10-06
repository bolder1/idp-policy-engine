import { ArrowUp, ArrowUpRight, ChevronDown, ChevronUp, Eye, Maximize, MessageCircleQuestion, MessageSquareText, Mic, Minus, Pencil, Play, Plus, ShieldAlert, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject, type ReactNode, type RefObject } from 'react'

import { Tip } from '../../../../kit'
import { useBrand } from '../../../../store'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, type StageView } from '../RunStage'
import type { RunLayoutProps } from '../types'
import { AnswerText } from './AnswerText'
import { answer as answerFor, didLine, iconOf, isRunAction, runAction, suggestionsFor, type Action, type Answer, type AskProps, type ChipId, type Suggestion, type SuggestionIcon, type Target } from './intents'
import { useWhatIfs } from './what-if'
import { canListen, listenOnce, MuteToggle, type Narrator } from './voice'
import './assistant.css'

/* -----------------------------------------------------------------------------
   THE ASSISTANT DOCK — the one bar at the bottom centre of Focus, Brief and
   Jarvis (owner, 2–3 Oct 2026: "all 3 should have the same things"; "for the
   quick questions … something inside the chat section"). After AirOps'
   canvas bar. Nothing floats above it: the questions live INSIDE the chat.

     panel      opens UPWARD (≤ 40% of the canvas, scrolling inside) on the
                field's focus, "/", the chevron in row 1, or an ask; folds on
                the chevron, Esc on an empty field, or a press on the canvas.
                It never opens by itself.
                · empty thread → "Suggestions": up to 4 rows (intents.ts
                  `suggestionsFor`), each a full-width button with its icon —
                  a question asks it, an action is the press (performed at
                  once; the thread says one line: "Running as Finance only.")
                · each answer (the view's `renderAnswer`), then its ACTION
                  buttons (≤ 3; the first primary — an outline, never orange),
                  and under the LATEST answer only, up to 3 follow-ups
                ↑ ↓ move between the rows; Enter presses. A new run clears it
                (Jarvis keeps it: `keepThread`, a divider and a receipt per run).
     row 1      ASK: "Ask about this sign-in…", the mic where the browser
                listens, send, the panel's chevron. While the narrator speaks,
                the row is the voice line (waveform, the line, Stop).
     row 2      CONTROLS: − 100% + and Fit (the stage's), the view's own
                (`controls`), then right: `trailing` (the stage toggle) and
                Voice on/off (one key for all three views: idp.check-voice).

   Words that command act (intents.ts): a typed or spoken "run as Finance
   only" or "open rule 2" performs its first action 350 ms after the answer
   shows; a question only answers and offers the press. Previews ("what if
   she's at home?") are computed here (what-if.ts) once the run has landed and
   never change the page's sign-in.

   API (view builders):

     const stage = useRef<StageView | null>(null)
     const [zoom, setZoom] = useState(1)
     const narrator = useNarrator({ runKey, running, jumped, reduced })
     <RunStage ref={stage} externalDock onZoom={setZoom}
               pad={{ top: 64, bottom: ASSISTANT_DOCK_PAD }}
               overlay={<>
                 <SignInRow run={props} look={look} />
                 <AssistantDock run={props} stage={stage} zoom={zoom} narrator={narrator}
                   theme={look}                       // 'light' | 'dark' | 'jarvis'
                   controls={<>…<DockButton …/></>}   // the view's own, middle of row 2
                   trailing={<StageToggle />}          // right of row 2, before Voice
                   renderAnswer={(a, ctx) => …}       // default: AnswerText
                   onAnswer={(a) => …}                // bring a.focus into view; null = folded
                   onCite={(t) => …}                  // a citation hovered / focused
                   onAction={(a) => a.kind === 'see' ? (showSee(), true) : a.kind === 'checks' ? (openAll(), true) : false}
                   onPresence={(p) => …}               // optional: 'listening' | 'thinking' | null (Jarvis's presence)
                   lead={<Mark />} />                  // optional: row 1's leading mark (default: the chat icon)
               </>}>
       …
     </RunStage>

   `onAction` is asked first for EVERY press (row, button or word): return
   true when the view handled it; otherwise the dock does it through the
   layout's callbacks (intents.ts `runAction`). `see` and `checks` are the
   view's own — a view that ignores them leaves the press doing nothing.
   Keyboard: "/" focuses the field; Enter asks (plain Enter never reaches the
   page's Ctrl/⌘+Enter Run); ↑ from the field goes into the rows; Escape
   clears the field, then folds the panel.
   -------------------------------------------------------------------------- */

/** The room (px) a layout keeps under its world for the folded dock: RunStage's `pad.bottom` (the dock's 94 + its 16 off the floor + 2). */
export const ASSISTANT_DOCK_PAD = 112

export interface AnswerContext {
  /** The newest answer, arriving now (motion allowed): draw it in. */
  animate: boolean
  /** The newest answer in the thread. */
  latest: boolean
  /** A citation hovered or focused (null when left): pass to the view. */
  onCite: (t: Target | null) => void
}

export type DockTheme = 'light' | 'dark' | 'jarvis' | 'jarvis-light'

export interface AssistantDockProps {
  /** The props the layout was handed: the plan, where the run is, the ways out. */
  run: RunLayoutProps
  /** The narrator (voice.ts `useNarrator`): the voice line, Voice on/off; answers are said as they show. Absent: no voice. */
  narrator?: Narrator
  /** (Unused since Read again went: Replay replays the run and its voice.) */
  script?: readonly string[]
  /** The stage's handle (RunStage `ref`) and its zoom (`onZoom`): row 2's zoom and fit. Absent: no zoom group. */
  stage?: RefObject<StageView | null>
  zoom?: number
  /** Row 2, middle: the view's own controls (‹ ›, Overview, ‹ 2 of 5 ›) — DockButton, DockSep. */
  controls?: ReactNode
  /** Row 2, right, before Voice: the stage's light / dark toggle. */
  trailing?: ReactNode
  /** An answer, drawn the view's way (Brief: citations; Focus: a caption; Jarvis: its card). Default: AnswerText. */
  renderAnswer?: (a: Answer, ctx: AnswerContext) => ReactNode
  /** The answer on show (null: the panel folded or the thread cleared) — bring `a.focus` into view, light `a.previewing`. */
  onAnswer?: (a: Answer | null) => void
  /** A citation hovered or focused in the thread (null when left). */
  onCite?: (t: Target | null) => void
  /** Every press, first: return true when the view did it (always for `see` and `checks`). Otherwise the dock does it. */
  onAction?: (a: Action) => boolean | void
  /** The panel opened or folded. */
  onOpenChange?: (open: boolean) => void
  /** The dock's ears and thought, for a view that draws a presence (Jarvis): listening, reading a question, or neither. */
  onPresence?: (p: 'listening' | 'thinking' | null) => void
  /** The look: light (default), the dark stage, or Jarvis's HUD. */
  theme?: DockTheme
  /** Each answer is also said (when the voice is on). Default true. */
  speakAnswers?: boolean
  /** The field's words. */
  placeholder?: string
  /** Row 1's leading mark (default: the chat icon) — Jarvis's presence at its smallest. */
  lead?: ReactNode
  /** Jarvis (the companion), default false: the thread is the visit's — a new run adds a divider (and, landed, a
      receipt) instead of clearing it; an earlier run's answers stay readable but inert; "This session" and Clear
      head it; a run press says its line too; a spoken ask shows quoted, its words held 350 ms; a long answer
      opens at its top. */
  keepThread?: boolean
  /** With `keepThread`: this run's divider ("Run 4 · Maya Iyer → AWS Console") and, once landed, its receipt. */
  runNote?: { divider: string; receipt: string | null }
  /** Jarvis, default false: while the field's words would run, send reads "Run" (the same parse the dock acts on). */
  showIntent?: boolean
  /** Filled with the dock's own press, for a press the view draws elsewhere (Jarvis's Noticed line): it acts and the thread says what it did. */
  pressRef?: MutableRefObject<((a: Action) => void) | null>
  /** The view shows how it was decided on a press (Brief's panel): the dock offers "How was it decided?" (the `how` action, the view's onAction). */
  how?: boolean
  className?: string
}

type Item = { key: number; kind: 'answer'; answer: Answer; ready: boolean; run?: number; spoken?: boolean } | { key: number; kind: 'did' | 'divider' | 'receipt'; text: string }

const THINK_MS = 420
const ACT_MS = 350

const ICON: Record<SuggestionIcon, typeof Play> = { question: MessageCircleQuestion, run: Play, open: ArrowUpRight, add: Plus, breakIn: ShieldAlert, show: Eye, edit: Pencil }

/** A dock control: a compact icon button with a tip (row 2). */
export function DockButton({ label, tip, onClick, disabled, pressed, children, className = '' }: { label: string; tip?: string; onClick: () => void; disabled?: boolean; pressed?: boolean; children: ReactNode; className?: string }) {
  return (
    <Tip text={tip ?? label} placement="top">
      <button type="button" className={`ad-btn${pressed ? ' is-on' : ''}${className ? ` ${className}` : ''}`} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
        {children}
      </button>
    </Tip>
  )
}

/** A hairline between groups of row 2. */
export function DockSep() {
  return <span className="ad-sep" aria-hidden />
}

/** One row in the chat: a suggestion (question or action) with its icon. */
function Row({ s, onPress }: { s: Suggestion; onPress: (s: Suggestion) => void }) {
  const Icon = ICON[s.icon]
  return (
    <button type="button" className={`ad__sug is-${s.icon}`} data-sug onClick={() => onPress(s)}>
      <Icon size={14} strokeWidth={2} aria-hidden />
      <span>{s.label}</span>
    </button>
  )
}

/** An answer's press: the first is the primary (an outline). */
function ActionButton({ a, primary, onPress }: { a: Action; primary: boolean; onPress: (a: Action) => void }) {
  const Icon = ICON[iconOf(a)]
  return (
    <button type="button" className={`ad__action${primary ? ' is-primary' : ''}`} onClick={() => onPress(a)}>
      <Icon size={13} strokeWidth={2.2} aria-hidden />
      {a.label}
    </button>
  )
}

export function AssistantDock({
  run,
  narrator,
  stage,
  zoom = 1,
  controls,
  trailing,
  renderAnswer,
  onAnswer,
  onCite,
  onAction,
  onOpenChange,
  onPresence,
  theme = 'light',
  speakAnswers = true,
  placeholder = 'Ask about this sign-in…',
  lead,
  keepThread = false,
  runNote,
  showIntent = false,
  pressRef,
  how = false,
  className = '',
}: AssistantDockProps) {
  const { plan, s, running, reduced, runKey } = run
  const landed = !running && !plan.empty && s >= plan.at.done
  const motionOk = !reduced

  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set())
  const [open, setOpenState] = useState(false)
  const [listening, setListening] = useState(false)
  const [ears, setEars] = useState(false)
  const stopEars = useRef<(() => void) | null>(null)
  const seq = useRef(0)
  const timers = useRef<number[]>([])

  /* The previews (never the page's sign-in) and the tenant's names, for the words. */
  const brand = useBrand()
  const whatIfs = useWhatIfs(run.form, run.rows, plan, landed, run.policies)
  const dict = useMemo(() => ({ people: brand.users, groups: brand.groups, apps: brand.apps }), [brand.users, brand.groups, brand.apps])
  const { asGroup, screens, form, rows, breakIn, onAsGroup, onAdd, onOpenRule, onOpenPolicy, onRunWith, onReplay, onPressPerson, onReviewBreakIn, onSave } = run
  const askProps = useMemo<AskProps>(
    () => ({ asGroup, screens, form, rows, breakIn, onAsGroup, onAdd, onOpenRule, onOpenPolicy, onRunWith, onReplay, onPressPerson, onReviewBreakIn, onSave, whatIfs: landed ? whatIfs.list : undefined, preview: landed ? whatIfs.preview : undefined, dict, ...(how ? { how } : {}) }),
    [asGroup, screens, form, rows, breakIn, onAsGroup, onAdd, onOpenRule, onOpenPolicy, onRunWith, onReplay, onPressPerson, onReviewBreakIn, onSave, whatIfs, landed, dict, how],
  )

  /* The callbacks, read late: a layout's inline arrows do not re-run anything. */
  const cb = useRef({ onAnswer, onCite, onAction, onOpenChange, askProps, plan, narrator, speakAnswers, runNote })
  useLayoutEffect(() => {
    cb.current = { onAnswer, onCite, onAction, onOpenChange, askProps, plan, narrator, speakAnswers, runNote }
  })
  /* Kept (Jarvis): an ask made while the run plays waits in the field, and is answered when the run lands. */
  const landedNow = useRef(landed)
  useLayoutEffect(() => {
    landedNow.current = landed
  })
  const held = useRef<{ q: string; label?: string; sugId?: string; spoken: boolean } | null>(null)

  const setOpen = useCallback((o: boolean) => {
    setOpenState((was) => {
      if (was !== o) window.setTimeout(() => cb.current.onOpenChange?.(o), 0)
      return o
    })
  }, [])

  /* The mic only where the browser listens (after mount: the static render has none). */
  useEffect(() => setEars(canListen()), [])

  /* The canvas's size, for the panel's 40%. */
  const [room, setRoom] = useState({ w: 1200, h: 800 })
  useEffect(() => {
    const host = rootRef.current?.parentElement
    if (!host) return
    const measure = () => setRoom({ w: host.clientWidth || 1200, h: host.clientHeight || 800 })
    measure()
    let ro: ResizeObserver | null = null
    try {
      ro = new ResizeObserver(measure)
      ro.observe(host)
    } catch {
      /* No observer: the first measure holds. */
    }
    return () => ro?.disconnect()
  }, [])

  /* A new run: the thread is this run's, so it goes — or, kept (Jarvis), a divider names the new run. */
  const lastKey = useRef(runKey)
  useEffect(() => {
    if (lastKey.current === runKey) return
    lastKey.current = runKey
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
    const divider = cb.current.runNote?.divider
    held.current = null
    if (!keepThread) setItems([])
    else if (divider) setItems((xs) => (xs.length > 0 ? [...xs, { key: ++seq.current, kind: 'divider', text: divider }] : xs))
    setAsked(new Set())
    setOpen(false)
    setText('')
    cb.current.onAnswer?.(null)
  }, [runKey, setOpen, keepThread])
  /* Kept: once the new run lands, one receipt line under its divider (its answer; the last different one on this app). */
  const receiptFor = useRef<number | null>(null)
  useEffect(() => {
    const receipt = cb.current.runNote?.receipt
    if (!keepThread || !landed || !receipt || receiptFor.current === runKey) return
    receiptFor.current = runKey
    setItems((xs) => (xs.length > 0 && xs[xs.length - 1].kind === 'divider' ? [...xs, { key: ++seq.current, kind: 'receipt', text: receipt }] : xs))
  }, [keepThread, landed, runKey])
  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t)
      stopEars.current?.()
    },
    [],
  )

  const note = useCallback((ids: readonly string[]) => setAsked((was) => new Set([...was, ...ids])), [])

  /* A press — a row, an answer's button, or words that command it: the view first, then the layout's callbacks; the thread says what it did. */
  const perform = useCallback(
    (a: Action) => {
      const handled = cb.current.onAction?.(a) === true
      const done = handled || runAction(a, cb.current.askProps)
      if (!done) return
      const key = ++seq.current
      if (keepThread || !isRunAction(a)) setItems((xs) => [...xs, { key, kind: 'did', text: didLine(a) }])
      /* The companion says what it does ("Opening rule 2 in the builder."); a run's line opens the run's own beats (the view's). */
      const n = cb.current.narrator
      if (keepThread && n && !n.muted && !isRunAction(a)) void n.say(didLine(a), { gesture: true })
    },
    [keepThread],
  )

  useLayoutEffect(() => {
    if (!pressRef) return
    pressRef.current = perform
    return () => {
      pressRef.current = null
    }
  }, [pressRef, perform])

  const itemsRef = useRef(items)
  useLayoutEffect(() => {
    itemsRef.current = items
  }, [items])

  const ask = useCallback(
    (q: string | ChipId, label?: string, sugId?: string, spoken = false) => {
      const query = q.trim()
      if (!query) return
      if (keepThread && !landedNow.current) {
        held.current = { q: query, label, sugId, spoken }
        return
      }
      const last = [...itemsRef.current].reverse().find((i): i is Extract<Item, { kind: 'answer' }> => i.kind === 'answer')?.answer ?? null
      const a = answerFor(query, cb.current.plan, cb.current.askProps, label, last)
      const key = ++seq.current
      setItems((xs) => [...xs, { key, kind: 'answer', answer: a, ready: !motionOk, run: lastKey.current, spoken }])
      note(sugId ? [a.id, sugId] : [a.id])
      setOpen(true)
      setText('')
      const land = () => {
        setItems((xs) => xs.map((x) => (x.key === key && x.kind === 'answer' ? { ...x, ready: true } : x)))
        cb.current.onAnswer?.(a)
        const n = cb.current.narrator
        if (n && cb.current.speakAnswers && !n.muted) void n.say(a.say, { gesture: true })
        if (a.acts && a.actions[0]) {
          const first = a.actions[0]
          timers.current.push(window.setTimeout(() => perform(first), ACT_MS))
        }
      }
      if (!motionOk) land()
      else timers.current.push(window.setTimeout(land, THINK_MS))
    },
    [motionOk, note, perform, setOpen, keepThread],
  )
  useEffect(() => {
    const h = held.current
    if (!landed || !h) return
    held.current = null
    ask(h.q, h.label, h.sugId, h.spoken)
  }, [landed, ask])

  const pressSuggestion = useCallback(
    (sg: Suggestion) => {
      /* The row goes once pressed: the field keeps the keyboard's place. */
      if (rootRef.current?.contains(document.activeElement)) inputRef.current?.focus({ preventScroll: true })
      if (sg.ask) ask(sg.ask, sg.label, sg.id)
      else if (sg.action) {
        note([sg.id])
        perform(sg.action)
      }
    },
    [ask, note, perform],
  )

  /* Newest at the bottom, in view — kept (Jarvis), an answer taller than the panel opens at its top. */
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      const items = el.querySelectorAll<HTMLElement>('.ad__item')
      const lastAnswer = keepThread ? items[items.length - 1] : undefined
      if (!lastAnswer || itemsRef.current[itemsRef.current.length - 1]?.kind !== 'answer') return
      const top = lastAnswer.getBoundingClientRect().top - el.getBoundingClientRect().top
      if (top < 0) el.scrollTop += top - 6
    })
    return () => window.cancelAnimationFrame(id)
  }, [items, open, keepThread])

  const collapse = useCallback(() => {
    setOpen(false)
    cb.current.onAnswer?.(null)
  }, [setOpen])

  /* A press on the canvas (not the dock) folds the panel. */
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const root = rootRef.current
      const host = root?.parentElement
      const t = e.target as Node | null
      if (!root || !host || !t || root.contains(t) || !host.contains(t)) return
      collapse()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, collapse])

  /* "/" anywhere on the page (not while typing) brings the field — and the panel. */
  const askNow = useRef(() => {})
  useLayoutEffect(() => {
    askNow.current = () => {
      if (cb.current.narrator?.speaking) cb.current.narrator.cancel()
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  })
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') || t.isContentEditable)) return
      if (!rootRef.current || !rootRef.current.isConnected) return
      e.preventDefault()
      askNow.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ↑ ↓ between the rows (and back to the field); Enter presses (a button's own). */
  const rowsOf = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[data-sug]') ?? [])
  const onRowsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      inputRef.current?.focus({ preventScroll: true })
      collapse()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const list = rowsOf()
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault()
    if (e.key === 'Home') list[0]?.focus()
    else if (e.key === 'End') list[list.length - 1]?.focus()
    else if (e.key === 'ArrowUp') list[Math.max(0, at - 1)]?.focus()
    else if (at === list.length - 1) inputRef.current?.focus()
    else list[at + 1]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      ask(text)
      return
    }
    if (e.key === 'ArrowUp' && open) {
      const list = rowsOf()
      if (list.length > 0) {
        e.preventDefault()
        list[list.length - 1].focus()
      }
      return
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (text) setText('')
      else if (open) collapse()
      else inputRef.current?.blur()
    }
  }

  const [missed, setMissed] = useState(false)
  const toggleEars = () => {
    if (listening) {
      stopEars.current?.()
      return
    }
    /* Kept (Jarvis): the mic stops the voice first, then listens. */
    if (keepThread && cb.current.narrator?.speaking) cb.current.narrator.cancel()
    setMissed(false)
    let got = false
    const stop = listenOnce({
      heard: (t, final) => {
        setText(t)
        if (final && t) {
          got = true
          stopEars.current?.()
          /* Kept (Jarvis): the words stay in the field a moment ("heard"), then it asks — quoted in the thread. */
          if (keepThread) timers.current.push(window.setTimeout(() => ask(t, undefined, undefined, true), ACT_MS))
          else ask(t)
        }
      },
      end: () => {
        stopEars.current = null
        setListening(false)
        if (!got && keepThread) setMissed(true)
      },
    })
    if (stop) {
      stopEars.current = stop
      setListening(true)
      setOpen(true)
      /* Pressed on the voice line (Kept): the field comes back next frame — the focus follows it. */
      if (inputRef.current) inputRef.current.focus()
      else window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const answers = items.filter((i): i is Extract<Item, { kind: 'answer' }> => i.kind === 'answer')
  const thinking = answers.some((i) => !i.ready)
  /* Kept: an answer about an earlier run stays readable but inert (no presses, no follow-ups, its citations dark). */
  const past = (it: Extract<Item, { kind: 'answer' }>) => keepThread && it.run !== undefined && it.run !== runKey
  const lastReady = [...answers].reverse().find((i) => i.ready && !past(i))
  const fresh = items.length === 0 || (keepThread && !answers.some((i) => !past(i)))
  const opening = useMemo(() => (landed && fresh ? suggestionsFor(plan, askProps, asked) : []), [landed, fresh, plan, askProps, asked])
  const follow = useMemo(() => (landed && lastReady && !thinking ? suggestionsFor(plan, askProps, asked, lastReady.answer) : []), [landed, lastReady, thinking, plan, askProps, asked])
  /* Intent on send (Jarvis): the words would run → "Run"; else the arrow. The same parse the dock acts on. */
  const typed = useDeferredValue(text)
  const wouldRun = useMemo(() => {
    if (!showIntent || !landed || !typed.trim()) return false
    try {
      const a = answerFor(typed, plan, askProps, undefined, lastReady?.answer ?? null)
      return a.acts && a.actions[0] !== undefined && isRunAction(a.actions[0])
    } catch {
      return false
    }
  }, [showIntent, landed, typed, plan, askProps, lastReady])
  const clearThread = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
    setItems([])
    setAsked(new Set())
    cb.current.onAnswer?.(null)
    inputRef.current?.focus({ preventScroll: true })
  }
  const speaking = narrator?.speaking ?? null
  const busy = running || thinking || listening
  const presence = listening ? 'listening' : thinking ? 'thinking' : null
  const presenceTo = useRef(onPresence)
  useLayoutEffect(() => {
    presenceTo.current = onPresence
  })
  useEffect(() => presenceTo.current?.(presence), [presence])
  const pct = `${Math.round(zoom * 100)}%`
  const draw = renderAnswer ?? ((a: Answer, ctx: AnswerContext) => <AnswerText answer={a} animate={ctx.animate} onCite={ctx.onCite} />)
  const citeTo = (t: Target | null) => cb.current.onCite?.(t)
  const lastItem = items[items.length - 1]

  return (
    <div
      ref={rootRef}
      className={`ad${busy ? ' is-busy' : ''}${open ? ' is-open' : ''}${reduced ? ' is-reduced' : ''}${className ? ` ${className}` : ''}`}
      data-stage={theme}
      data-card
      style={{ ['--ad-room' as string]: `${room.h}px`, ['--ad-roomw' as string]: `${room.w}px` }}
    >
      <div className="ad__panel" role="region" aria-label="Assistant">
        {/* The chat: suggestions while it is empty, then this run's questions and answers. */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="thread"
              className="ad__threadwrap"
              initial={motionOk ? { height: 0, opacity: 0 } : false}
              animate={{ height: 'auto', opacity: 1 }}
              exit={motionOk ? { height: 0, opacity: 0 } : undefined}
              transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
            >
              {/* Kept (Jarvis): the visit's thread, headed, and cleared on a press. */}
              {keepThread && items.length > 0 && (
                <div className="ad__threadhead">
                  <span>This session</span>
                  <button type="button" className="ad__clear" onClick={clearThread}>
                    Clear
                  </button>
                </div>
              )}
              <div ref={threadRef} className="ad__thread" role="log" aria-live="polite" aria-label="Answers" onKeyDown={onRowsKey}>
                {items.length === 0 && (
                  <div className="ad__sugs" role="group" aria-label="Suggestions">
                    <p className="ad__sughead">{landed ? 'Suggestions' : plan.empty ? 'Run a sign-in to ask about it' : 'Suggestions come once the run lands'}</p>
                    {opening.map((sg) => (
                      <Row key={sg.id} s={sg} onPress={pressSuggestion} />
                    ))}
                  </div>
                )}
                {items.map((it) =>
                  it.kind === 'divider' ? (
                    <p key={it.key} className="ad__divider" role="separator">
                      <span>{it.text}</span>
                    </p>
                  ) : it.kind !== 'answer' ? (
                    <p key={it.key} className={it.kind === 'receipt' ? 'ad__did ad__receipt' : 'ad__did'}>
                      {it.text}
                    </p>
                  ) : (
                    <div key={it.key} className={`ad__item${past(it) ? ' is-past' : ''}`}>
                      <p className="ad__q">{it.spoken ? `“${it.answer.ask}”` : it.answer.ask}</p>
                      {!it.ready ? (
                        <div className="ad__thinking" aria-label="Reading the run">
                          <span />
                          <span />
                          <span />
                        </div>
                      ) : (
                        <>
                          {draw(it.answer, { animate: motionOk && it === lastReady, latest: it === lastReady, onCite: past(it) ? () => {} : citeTo })}
                          {it.answer.actions.length > 0 && !past(it) && (
                            <div className="ad__itemfoot">
                              {it.answer.actions.map((a, i) => (
                                <ActionButton key={`${a.kind}:${a.label}`} a={a} primary={i === 0} onPress={perform} />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ),
                )}
                {keepThread && items.length > 0 && fresh && opening.length > 0 && (
                  <div className="ad__sugs is-next" role="group" aria-label="Suggestions">
                    <p className="ad__sughead">Suggestions</p>
                    {opening.map((sg) => (
                      <Row key={sg.id} s={sg} onPress={pressSuggestion} />
                    ))}
                  </div>
                )}
                {follow.length > 0 && lastItem && (
                  <div className="ad__sugs is-next" role="group" aria-label="Ask next">
                    {follow.map((sg) => (
                      <Row key={sg.id} s={sg} onPress={pressSuggestion} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Row 1: ask — or, while the narrator speaks, the voice line. */}
        <div className={`ad__ask${speaking ? ' is-speaking' : ''}${focused ? ' is-focused' : ''}`}>
          <div className="ad__field">
            {speaking ? (
              <div className="ad__voice" role="status" aria-live="off">
                <span className="ad__wave" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.button type="button" key={speaking} className="ad__subtitle" aria-label={`Saying: ${speaking} — stop and ask`} onClick={() => askNow.current()} initial={motionOk ? { opacity: 0, filter: 'blur(5px)' } : false} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={motionOk ? { opacity: 0, filter: 'blur(3px)', transition: { duration: 0.12 } } : undefined} transition={{ duration: 0.3 }}>
                    {speaking}
                  </motion.button>
                </AnimatePresence>
                {/* Kept (Jarvis): the mic stays while it speaks — a press stops the voice, then listens. */}
                {keepThread && ears && (
                  <Tip text="Ask by voice" placement="top">
                    <button type="button" className="ad-btn" aria-label="Ask by voice" disabled={plan.empty} onClick={toggleEars}>
                      <Mic size={15} strokeWidth={2} aria-hidden />
                    </button>
                  </Tip>
                )}
                <Tip text="Stop" placement="top">
                  <button type="button" className="ad-btn" aria-label="Stop the voice" onClick={() => narrator?.cancel()}>
                    <Square size={12} strokeWidth={2.4} fill="currentColor" aria-hidden />
                  </button>
                </Tip>
              </div>
            ) : (
              <>
                {lead ?? <MessageSquareText className="ad__lead" size={15} strokeWidth={2} aria-hidden />}
                <input
                  ref={inputRef}
                  className="ad__input"
                  type="text"
                  value={text}
                  placeholder={listening ? 'Listening…' : missed ? "I didn't catch that." : placeholder}
                  aria-label="Ask about this sign-in"
                  aria-expanded={open}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={plan.empty}
                  onChange={(e) => {
                    setText(e.target.value)
                    setMissed(false)
                  }}
                  onKeyDown={onKeyDown}
                  onFocus={() => {
                    setFocused(true)
                    setOpen(true)
                  }}
                  onBlur={() => setFocused(false)}
                />
                {!focused && !text && !listening && <kbd className="ad__kbd" aria-hidden>/</kbd>}
                {ears && (
                  <Tip text={listening ? 'Stop listening' : 'Ask by voice'} placement="top">
                    <button type="button" className={`ad-btn${listening ? ' is-listening' : ''}`} aria-label={listening ? 'Stop listening' : 'Ask by voice'} aria-pressed={listening} disabled={plan.empty} onClick={toggleEars}>
                      <Mic size={15} strokeWidth={2} aria-hidden />
                    </button>
                  </Tip>
                )}
                <Tip text={wouldRun ? 'Enter runs it' : 'Ask'} placement="top">
                  <button type="button" className={`ad-send${wouldRun ? ' is-run' : ''}`} aria-label={wouldRun ? 'Run' : 'Ask'} disabled={!text.trim()} onClick={() => ask(text)}>
                    {wouldRun ? (
                      <>
                        <Play size={12} strokeWidth={2.4} aria-hidden />
                        Run
                      </>
                    ) : (
                      <ArrowUp size={15} strokeWidth={2.2} aria-hidden />
                    )}
                  </button>
                </Tip>
              </>
            )}
            <Tip text={open ? 'Fold the chat' : 'Open the chat'} placement="top">
              <button type="button" className="ad-btn" data-ad-fold aria-label={open ? 'Fold the chat' : 'Open the chat'} aria-expanded={open} disabled={plan.empty} onClick={() => (open ? collapse() : setOpen(true))}>
                {open ? <ChevronDown size={15} strokeWidth={2} aria-hidden /> : <ChevronUp size={15} strokeWidth={2} aria-hidden />}
              </button>
            </Tip>
          </div>
        </div>

        {/* Row 2: every control of the view. */}
        <div className="ad__controls" role="toolbar" aria-label="View">
          {stage && (
            <>
              <span className="ad__zoom">
                <DockButton label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => stage.current?.zoomBy(1 / ZOOM_STEP)}>
                  <Minus size={14} strokeWidth={2} aria-hidden />
                </DockButton>
                <Tip text="Back to 100%" placement="top">
                  <button type="button" className="ad__pct" aria-label={`Zoom ${pct}, back to 100%`} onClick={() => stage.current?.zoomTo(1)}>
                    {pct}
                  </button>
                </Tip>
                <DockButton label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => stage.current?.zoomBy(ZOOM_STEP)}>
                  <Plus size={14} strokeWidth={2} aria-hidden />
                </DockButton>
              </span>
              <DockButton label="Fit to view" onClick={() => stage.current?.fit({ max: 1 })}>
                <Maximize size={14} strokeWidth={2} aria-hidden />
              </DockButton>
            </>
          )}
          {controls && (
            <>
              {stage && <DockSep />}
              {controls}
            </>
          )}
          <span className="ad__spacer" />
          {trailing}
          {narrator && <MuteToggle muted={narrator.muted} onChange={narrator.setMuted} />}
        </div>
      </div>
    </div>
  )
}
