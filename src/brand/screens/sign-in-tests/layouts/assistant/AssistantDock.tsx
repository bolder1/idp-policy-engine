import { ArrowUp, ChevronDown, Maximize, MessageSquareText, Mic, Minus, Plus, RotateCcw, Square, ThumbsDown, ThumbsUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'

import { Tip } from '../../../../kit'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, type StageView } from '../RunStage'
import type { RunLayoutProps } from '../types'
import { AnswerText } from './AnswerText'
import { answer as answerFor, chipsFor, runAction, type Action, type Answer, type Chip, type ChipId, type Target } from './intents'
import { canListen, listenOnce, MuteToggle, type Narrator } from './voice'
import './assistant.css'

/* -----------------------------------------------------------------------------
   THE ASSISTANT DOCK — one floating panel at the bottom centre of a run
   layout (Brief, Focus), in place of RunStage's own dock: after AirOps'
   canvas bar (owner, 2 Oct 2026).

     chips      the questions this run has a real answer to, soft pills just
                above the panel, fading in one by one — when the field is
                focused or the run has landed; pressing one asks it
     thread     asking EXPANDS the panel upward into this run's conversation
                (≤ 40% of the canvas, scrolling inside): the question, the
                answer (drawn by the layout: `renderAnswer`), its ACTION as a
                button, Helpful 👍 👎 as icon buttons; the chevron folds it.
                A new run clears it.
     row 1      ASK: "Ask about this sign-in…" with a gradient glow travelling
                along its border (the console blue into a soft cyan; a slow
                drift, brighter and quicker while the engine or the assistant
                works; still under reduced motion); the mic (where the browser
                listens) and send. While the narrator speaks, the row is the
                voice line: a live waveform, the line as a subtitle, Stop.
     row 2      CONTROLS: zoom − % +, fit (the stage's, live), the view's own
                (`controls`), Voice on/off, Read again.

   Use it (a layout):

     const stage = useRef<StageView | null>(null)
     const [zoom, setZoom] = useState(1)
     const narrator = useNarrator({ runKey, running, jumped, reduced })
     <RunStage ref={stage} externalDock onZoom={setZoom}
               pad={{ bottom: ASSISTANT_DOCK_PAD }}
               overlay={<AssistantDock run={props} stage={stage} zoom={zoom} narrator={narrator}
                          controls={<>…<DockButton …/></>}
                          renderAnswer={(a, ctx) => …} onAnswer={(a) => …} theme={theme} />}>
       …
     </RunStage>

   It never covers what the view shows at a glance: the stage keeps
   ASSISTANT_DOCK_PAD of room under the world for it (and its chips); only the
   open thread overlays the lower canvas, while it is open.
   Keyboard: "/" focuses the field; Enter asks (plain Enter never reaches the
   page's Ctrl/⌘+Enter Run); Escape clears the field, then folds the thread.
   -------------------------------------------------------------------------- */

/** The room (px) a layout keeps under its world for the dock and its chips: RunStage's `pad.bottom`. */
export const ASSISTANT_DOCK_PAD = 152

export interface AnswerContext {
  /** The newest answer, arriving now (motion allowed): draw it in. */
  animate: boolean
  /** The newest answer in the thread. */
  latest: boolean
  /** A citation hovered or focused (null when left): pass to the view. */
  onCite: (t: Target | null) => void
}

export interface AssistantDockProps {
  /** The props the layout was handed: the plan, where the run is, the ways out. */
  run: RunLayoutProps
  /** The narrator (voice.ts `useNarrator`): the voice line, Voice on/off, Read again. Absent: no voice. */
  narrator?: Narrator
  /** What Read again says, in order (default: the lines this run said). */
  script?: readonly string[]
  /** The stage's handle (RunStage `ref`) and its zoom (`onZoom`): row 2's zoom and fit. Absent: no zoom group. */
  stage?: RefObject<StageView | null>
  zoom?: number
  /** Row 2: the view's own controls, after fit (Overview, ‹ ›, the stage toggle) — DockButton, DockSep. */
  controls?: ReactNode
  /** An answer, drawn the view's way (Brief: a citation sentence; Focus: a caption). Default: AnswerText. */
  renderAnswer?: (a: Answer, ctx: AnswerContext) => ReactNode
  /** The answer on show (null: the thread folded or cleared) — bring `a.focus` into view. */
  onAnswer?: (a: Answer | null) => void
  /** A citation hovered or focused in the thread (null when left). */
  onCite?: (t: Target | null) => void
  /** An action's button pressed. Default: `runAction(action, run)` — the layout's own callbacks. */
  onAction?: (a: Action) => void
  /** The look: light (default) or the dark stage. */
  theme?: 'light' | 'dark'
  /** Each answer is also said (when the voice is on). Default true. */
  speakAnswers?: boolean
  /** The field's words. */
  placeholder?: string
  className?: string
}

interface Item {
  key: number
  answer: Answer
  ready: boolean
  vote: 'up' | 'down' | null
}

const THINK_MS = 420

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

export function AssistantDock({
  run,
  narrator,
  script,
  stage,
  zoom = 1,
  controls,
  renderAnswer,
  onAnswer,
  onCite,
  onAction,
  theme = 'light',
  speakAnswers = true,
  placeholder = 'Ask about this sign-in…',
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
  const [open, setOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [ears, setEars] = useState(false)
  const stopEars = useRef<(() => void) | null>(null)
  const seq = useRef(0)
  const timers = useRef<number[]>([])

  /* The callbacks, read late: a layout's inline arrows do not re-run anything. */
  const cb = useRef({ onAnswer, onCite, onAction, run, narrator, speakAnswers })
  useLayoutEffect(() => {
    cb.current = { onAnswer, onCite, onAction, run, narrator, speakAnswers }
  })

  /* The mic only where the browser listens (after mount: the static render has none). */
  useEffect(() => setEars(canListen()), [])

  /* The canvas's height, for the thread's 40%. */
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

  /* A new run: the thread is this run's, so it goes. */
  const lastKey = useRef(runKey)
  useEffect(() => {
    if (lastKey.current === runKey) return
    lastKey.current = runKey
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
    setItems([])
    setOpen(false)
    setText('')
    cb.current.onAnswer?.(null)
  }, [runKey])
  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t)
      stopEars.current?.()
    },
    [],
  )

  const chips = useMemo<Chip[]>(() => chipsFor(plan, run), [plan, run])
  const asked = useMemo(() => new Set(items.map((i) => i.answer.id)), [items])
  const shownChips = chips.filter((c) => !asked.has(answerFor(c.id, plan, run, c.label).id))
  const chipsOn = shownChips.length > 0 && (focused || landed) && !plan.empty && !open

  const ask = useCallback(
    (q: string | ChipId, label?: string) => {
      const query = q.trim()
      if (!query) return
      const a = answerFor(query, cb.current.run.plan, cb.current.run, label)
      const key = ++seq.current
      setItems((xs) => [...xs, { key, answer: a, ready: !motionOk, vote: null }])
      setOpen(true)
      setText('')
      const land = () => {
        setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ready: true } : x)))
        cb.current.onAnswer?.(a)
        const n = cb.current.narrator
        if (n && cb.current.speakAnswers && !n.muted) void n.say(a.say, { gesture: true })
      }
      if (!motionOk) land()
      else timers.current.push(window.setTimeout(land, THINK_MS))
    },
    [motionOk],
  )

  /* Newest at the bottom, in view. */
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => window.cancelAnimationFrame(id)
  }, [items, open])

  const collapse = useCallback(() => {
    setOpen(false)
    cb.current.onAnswer?.(null)
  }, [])

  /* "/" anywhere on the page (not while typing) brings the field. */
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

  /* The field, now: the voice stops so it is there (the voice line stands in its place while speaking). */
  const askNow = useRef(() => {})
  useLayoutEffect(() => {
    askNow.current = () => {
      if (cb.current.narrator?.speaking) cb.current.narrator.cancel()
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  })

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      ask(text)
      return
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (text) setText('')
      else if (open) collapse()
      else inputRef.current?.blur()
    }
  }

  const toggleEars = () => {
    if (listening) {
      stopEars.current?.()
      return
    }
    const stop = listenOnce({
      heard: (t, final) => {
        setText(t)
        if (final && t) {
          stopEars.current?.()
          ask(t)
        }
      },
      end: () => {
        stopEars.current = null
        setListening(false)
      },
    })
    if (stop) {
      stopEars.current = stop
      setListening(true)
      inputRef.current?.focus()
    }
  }

  const act = (a: Action) => {
    const f = cb.current.onAction
    if (f) f(a)
    else runAction(a, cb.current.run)
  }
  const vote = (key: number, v: 'up' | 'down') => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, vote: x.vote === v ? null : v } : x)))

  const thinking = items.some((i) => !i.ready)
  const speaking = narrator?.speaking ?? null
  const busy = running || thinking || listening
  const pct = `${Math.round(zoom * 100)}%`
  const draw = renderAnswer ?? ((a: Answer, ctx: AnswerContext) => <AnswerText answer={a} animate={ctx.animate} onCite={ctx.onCite} />)
  const citeTo = (t: Target | null) => cb.current.onCite?.(t)
  const lastReady = [...items].reverse().find((i) => i.ready)?.key

  return (
    <div
      ref={rootRef}
      className={`ad${busy ? ' is-busy' : ''}${open ? ' is-open' : ''}${reduced ? ' is-reduced' : ''}${className ? ` ${className}` : ''}`}
      data-stage={theme}
      data-card
      style={{ ['--ad-room' as string]: `${room.h}px`, ['--ad-roomw' as string]: `${room.w}px` }}
    >
      {/* The chips: what this run can answer. */}
      <AnimatePresence initial={false}>
        {chipsOn && (
          <motion.div key="chips" className="ad__chips" role="list" aria-label="Suggested questions" initial={motionOk ? { opacity: 0 } : false} animate={{ opacity: 1 }} exit={motionOk ? { opacity: 0, transition: { duration: 0.15 } } : undefined}>
            {shownChips.map((c, i) => (
              <motion.button
                key={c.id}
                type="button"
                role="listitem"
                className="ad__chip"
                initial={motionOk ? { opacity: 0, y: 6, filter: 'blur(4px)' } : false}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.32, delay: motionOk ? 0.08 + i * 0.07 : 0, ease: [0.2, 0, 0, 1] }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ask(c.id, c.label)}
              >
                {c.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ad__panel" role="region" aria-label="Assistant">
        {/* The thread: this run's questions and answers. */}
        <AnimatePresence initial={false}>
          {open && items.length > 0 && (
            <motion.div
              key="thread"
              className="ad__threadwrap"
              initial={motionOk ? { height: 0, opacity: 0 } : false}
              animate={{ height: 'auto', opacity: 1 }}
              exit={motionOk ? { height: 0, opacity: 0 } : undefined}
              transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
            >
              <div className="ad__threadhead">
                <span className="ad__threadtitle">
                  <MessageSquareText size={13} strokeWidth={2} aria-hidden /> About this sign-in
                </span>
                <Tip text="Fold the answers" placement="top">
                  <button type="button" className="ad-btn" aria-label="Fold the answers" aria-expanded onClick={collapse}>
                    <ChevronDown size={15} strokeWidth={2} />
                  </button>
                </Tip>
              </div>
              <div ref={threadRef} className="ad__thread" role="log" aria-live="polite" aria-label="Answers">
                {items.map((it) => (
                  <div key={it.key} className="ad__item">
                    <p className="ad__q">{it.answer.ask}</p>
                    {!it.ready ? (
                      <div className="ad__thinking" aria-label="Reading the run">
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : (
                      <>
                        {draw(it.answer, { animate: motionOk && it.key === lastReady, latest: it.key === lastReady, onCite: citeTo })}
                        <div className="ad__itemfoot">
                          {it.answer.action && (
                            <button type="button" className="ad__action" onClick={() => it.answer.action && act(it.answer.action)}>
                              {it.answer.action.label}
                            </button>
                          )}
                          {!it.answer.known && (
                            <span className="ad__hint">Try a suggestion above.</span>
                          )}
                          <span className="ad__spacer" />
                          {it.answer.known && (
                            <span className="ad__votes" role="group" aria-label="Helpful?">
                              <span className="ad__voteslabel">Helpful?</span>
                              <Tip text="Helpful" placement="top">
                                <button type="button" className={`ad-btn is-sm${it.vote === 'up' ? ' is-on' : ''}`} aria-label="Helpful" aria-pressed={it.vote === 'up'} onClick={() => vote(it.key, 'up')}>
                                  <ThumbsUp size={13} strokeWidth={2} />
                                </button>
                              </Tip>
                              <Tip text="Not helpful" placement="top">
                                <button type="button" className={`ad-btn is-sm${it.vote === 'down' ? ' is-on' : ''}`} aria-label="Not helpful" aria-pressed={it.vote === 'down'} onClick={() => vote(it.key, 'down')}>
                                  <ThumbsDown size={13} strokeWidth={2} />
                                </button>
                              </Tip>
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {lastReady !== undefined && !thinking && shownChips.length > 0 && (
                  <div className="ad__chips is-next" role="list" aria-label="Ask next">
                    {shownChips.slice(0, 4).map((c, i) => (
                      <motion.button
                        key={c.id}
                        type="button"
                        role="listitem"
                        className="ad__chip"
                        initial={motionOk ? { opacity: 0, filter: 'blur(4px)' } : false}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        transition={{ duration: 0.3, delay: motionOk ? 0.5 + i * 0.07 : 0 }}
                        onClick={() => ask(c.id, c.label)}
                      >
                        {c.label}
                      </motion.button>
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
                <Tip text="Stop" placement="top">
                  <button type="button" className="ad-btn" aria-label="Stop the voice" onClick={() => narrator?.cancel()}>
                    <Square size={12} strokeWidth={2.4} fill="currentColor" />
                  </button>
                </Tip>
              </div>
            ) : (
              <>
                <MessageSquareText className="ad__lead" size={15} strokeWidth={2} aria-hidden />
                <input
                  ref={inputRef}
                  className="ad__input"
                  type="text"
                  value={text}
                  placeholder={listening ? 'Listening…' : placeholder}
                  aria-label="Ask about this sign-in"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={plan.empty}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKeyDown}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                />
                {!focused && !text && !listening && <kbd className="ad__kbd" aria-hidden>/</kbd>}
                {ears && (
                  <Tip text={listening ? 'Stop listening' : 'Ask by voice'} placement="top">
                    <button type="button" className={`ad-btn${listening ? ' is-listening' : ''}`} aria-label={listening ? 'Stop listening' : 'Ask by voice'} aria-pressed={listening} disabled={plan.empty} onClick={toggleEars}>
                      <Mic size={15} strokeWidth={2} />
                    </button>
                  </Tip>
                )}
                <Tip text="Ask" placement="top">
                  <button type="button" className="ad-send" aria-label="Ask" disabled={!text.trim()} onClick={() => ask(text)}>
                    <ArrowUp size={15} strokeWidth={2.2} />
                  </button>
                </Tip>
              </>
            )}
          </div>
        </div>

        {/* Row 2: every control of the view. */}
        <div className="ad__controls" role="toolbar" aria-label="View">
          {stage && (
            <>
              <span className="ad__zoom">
                <DockButton label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => stage.current?.zoomBy(1 / ZOOM_STEP)}>
                  <Minus size={14} strokeWidth={2} />
                </DockButton>
                <Tip text="Back to 100%" placement="top">
                  <button type="button" className="ad__pct" aria-label={`Zoom ${pct}, back to 100%`} onClick={() => stage.current?.zoomTo(1)}>
                    {pct}
                  </button>
                </Tip>
                <DockButton label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => stage.current?.zoomBy(ZOOM_STEP)}>
                  <Plus size={14} strokeWidth={2} />
                </DockButton>
              </span>
              <DockButton label="Fit to view" onClick={() => stage.current?.fit({ max: 1 })}>
                <Maximize size={14} strokeWidth={2} />
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
          {narrator && (
            <>
              <DockButton label="Read again" tip={narrator.muted ? 'Read again · the voice is off' : 'Read again'} disabled={narrator.muted || plan.empty} onClick={() => void narrator.readAgain(script)}>
                <RotateCcw size={14} strokeWidth={2} />
              </DockButton>
              <MuteToggle muted={narrator.muted} onChange={narrator.setMuted} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
