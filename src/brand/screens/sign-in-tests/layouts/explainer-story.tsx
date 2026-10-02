import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, Info, Play, Plus, TriangleAlert } from 'lucide-react'

import { Spinner } from '../PolicyStack'
import type { FormField } from '../../testing/sign-in-form'
import type { MarkState, Tone } from './explainer-model'
import { Mark } from './explainer-parts'
import { EASE_OUT } from './explainer-motion'
import type { Para, Seg } from './explainer-words'

/* The story column of the Explainer (ExplainerLayout.tsx): the headline on
   top — the sign-in while it plays, the answer once it lands — and under it
   the steps, one short paragraph per moment, a progress rail down their left
   edge. The paragraph the visual shows is the lit one; the rest are quieter.
   Press a paragraph or its node on the rail, or scroll the column (each
   notch a step), and the visual beside it follows. */

export interface StoryStep {
  para: Para
  label: string
  mark: MarkState
}

interface StoryProps {
  steps: StoryStep[]
  focus: number
  /** What the engine is reading now, for the kicker while it plays. */
  doing: string
  headline: Seg[]
  tone: Tone
  /** The clock: segments are written as the engine reaches them. */
  s: number
  running: boolean
  landed: boolean
  held: boolean
  animate: boolean
  reduced: boolean
  onPick: (i: number) => void
  onStep: (d: 1 | -1) => void
  onLive: () => void
  onLink: (to: string) => void
  onAdd: (field: FormField) => void
  onAsGroup?: (groupId: string) => void
}

function Segs({ segs, tone, s, landed, onLink }: { segs: Seg[]; tone: Tone; s: number; landed: boolean; onLink?: (to: string) => void }) {
  return (
    <>
      {segs.map((g, i) => {
        if (!landed && g.at !== undefined && s < g.at) return null
        const key = `${i}:${g.t}`
        if (g.kind === 'link' && g.to && onLink) {
          const to = g.to
          return (
            <button
              key={key}
              type="button"
              className="rl-explainer__seg is-link"
              onClick={(e) => {
                e.stopPropagation()
                onLink(to)
              }}
            >
              {g.t}
            </button>
          )
        }
        if (g.kind === 'answer') return <strong key={key} className={`rl-explainer__seg is-answer is-${landed ? tone : 'neutral'}`}>{g.t}</strong>
        if (g.kind) return <span key={key} className={`rl-explainer__seg is-${g.kind}`}>{g.t}</span>
        return <span key={key}>{g.t}</span>
      })}
    </>
  )
}

export function Story(props: StoryProps) {
  const { steps, focus, doing, headline, tone, s, running, landed, held, animate, reduced, onPick, onStep, onLive, onLink, onAdd, onAsGroup } = props
  const scroller = useRef<HTMLDivElement | null>(null)
  const list = useRef<HTMLOListElement | null>(null)
  const spacer = useRef<HTMLDivElement | null>(null)
  const [fill, setFill] = useState(0)

  /* The rail fills to the lit node; the lit paragraph is kept in view. Measured by offsets. */
  useLayoutEffect(() => {
    const ol = list.current
    const li = ol?.children[focus + 1] as HTMLElement | undefined
    if (!ol || !li) return
    setFill(li.offsetTop + 14)
    const sc = scroller.current
    if (!sc) return
    /* The answer lit, and a paragraph after it (each group alone): both in view. */
    const tail = landed && focus === steps.length - 2 ? (ol.children[focus + 2] as HTMLElement | undefined) : undefined
    const top = ol.offsetTop + li.offsetTop - 12
    const bottom = ol.offsetTop + (tail ? tail.offsetTop + tail.offsetHeight : li.offsetTop + li.offsetHeight) + 12
    let next: number | null = null
    if (top < sc.scrollTop) next = top
    else if (bottom > sc.scrollTop + sc.clientHeight) {
      /* Scrolled to a paragraph's top, never through one: no half-lines cut under the headline. */
      const need = bottom - sc.clientHeight
      let snap = top
      for (let j = 0; j < focus; j++) {
        const at = ol.offsetTop + (ol.children[j + 1] as HTMLElement).offsetTop - 12
        if (at >= need) {
          snap = at
          break
        }
      }
      next = Math.min(top, snap)
    }
    if (next === null) return
    /* Room under the last paragraph, so a paragraph's top can always reach the top of the column. */
    const pad = spacer.current
    if (pad) {
      const max = sc.scrollHeight - pad.offsetHeight - sc.clientHeight
      pad.style.height = `${Math.max(0, Math.ceil(next - max))}px`
    }
    sc.scrollTo({ top: Math.max(0, next), behavior: reduced ? 'auto' : 'smooth' })
  }, [focus, steps.length, reduced, s, landed])

  /* Scrolling the column scrubs: a notch of the wheel is a step, the page never scrolls. */
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let acc = 0
    let quiet = 0
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return
      e.preventDefault()
      const now = performance.now()
      if (now < quiet) return
      acc += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : 0
      if (Math.abs(acc) < 40) return
      onStep(acc > 0 ? 1 : -1)
      acc = 0
      quiet = now + 260
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onStep])

  return (
    <aside className="rl-explainer__story" data-card aria-label="The run, step by step">
      <header className="rl-explainer__dek">
        <span className={`rl-explainer__kicker${running && !landed ? ' is-working' : ''}`}>
          {running && !landed ? <Spinner small /> : null}
          {running && !landed ? doing : 'Access check'}
        </span>
        <h2 className="rl-explainer__headline" aria-live="polite">
          <Segs segs={headline} tone={tone} s={s} landed={landed} />
        </h2>
        {held && (
          <button type="button" className="rl-explainer__live" onClick={onLive}>
            <Play size={12} strokeWidth={2.4} aria-hidden />
            Follow the run
          </button>
        )}
      </header>
      <div ref={scroller} className="rl-explainer__scroll">
        <ol ref={list} className="rl-explainer__steps">
          <span className="rl-explainer__rail" aria-hidden>
            <motion.span className={`rl-explainer__railfill${running && !landed ? ' is-working' : ''}`} initial={false} animate={{ height: fill }} transition={{ duration: reduced ? 0 : 0.42, ease: EASE_OUT }} />
          </span>
          {steps.map((st, i) => {
            const on = i === focus
            const p = st.para
            return (
              <motion.li
                key={p.key}
                className={`rl-explainer__step${on ? ' is-active' : ''}`}
                initial={animate ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: EASE_OUT }}
                onClick={() => onPick(i)}
              >
                <button type="button" className={`rl-explainer__node is-${st.mark}${on ? ' is-on' : ''}`} aria-label={`${st.label}: show it`} aria-current={on ? 'step' : undefined} onClick={(e) => { e.stopPropagation(); onPick(i) }}>
                  {st.mark === 'waiting' || st.mark === 'quiet' ? <span className="rl-explainer__nodeno">{i + 1}</span> : <Mark state={st.mark} pop={animate} />}
                </button>
                <span className="rl-explainer__steplabel">{st.label}</span>
                <p className="rl-explainer__text">
                  <Segs segs={p.segs} tone={tone} s={s} landed={landed} onLink={onLink} />
                </p>
                {p.note && landed && !(on && p.key === 'outcome') && (
                  <p className={`rl-explainer__note is-${p.note.tone}`}>
                    {p.note.tone === 'conflict' ? <TriangleAlert size={13} strokeWidth={2.2} aria-hidden /> : <Info size={13} strokeWidth={2.2} aria-hidden />}
                    <span>{p.note.text}</span>
                  </p>
                )}
                {landed && (p.add || (p.runAs && p.runAs.length > 0 && onAsGroup)) && (
                  <div className="rl-explainer__acts">
                    {p.add && (
                      <button type="button" className="rl-explainer__act" onClick={(e) => { e.stopPropagation(); onAdd(p.add!.field) }}>
                        <Plus size={13} strokeWidth={2.4} aria-hidden />
                        {p.add.label}
                      </button>
                    )}
                    {onAsGroup &&
                      p.runAs?.map((r) => (
                        <button key={r.groupId} type="button" className="rl-explainer__act" onClick={(e) => { e.stopPropagation(); onAsGroup(r.groupId) }}>
                          <ArrowRight size={13} strokeWidth={2.4} aria-hidden />
                          {r.label}
                        </button>
                      ))}
                  </div>
                )}
              </motion.li>
            )
          })}
        </ol>
        <div ref={spacer} aria-hidden className="rl-explainer__spacer" />
      </div>
    </aside>
  )
}
