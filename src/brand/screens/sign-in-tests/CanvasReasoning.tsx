import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Copy, Lightbulb, Minus, Star, X } from 'lucide-react'

import { Button, Tip } from '../../kit'
import { REASONING } from './canvas-reasoning'
import { useLayoutNotes } from './canvas-shelf'
import { RUN_LAYOUTS, shelfOf, type RunLayoutId } from './run-layout'
import './canvas-bar.css'

/* -----------------------------------------------------------------------------
   The Reasoning button on the bar and its panel (owner, 2 Oct 2026: "add a
   reasoning button where we can share the thought — the good and bads of
   each view").

     ┌ Reasoning ─────────────────────────────── × ┐
     │ ‹  Focus · Favourites  ★                  › │
     │ One moment of the run in focus at a time …  │
     │ Works            ✓ Calm: one thing at a …   │
     │ Doesn't          – Receded cards are small  │
     │ Your thoughts  [                          ] │
     │                               [Copy all]    │
     └─────────────────────────────────────────────┘

   It opens on the layout on screen; ‹ › step through every layout on the
   switch. The star moves a layout between Favourites and Archive. Your
   thoughts are kept per layout in this browser (canvas-shelf.ts), and Copy
   all puts every layout's reasoning and thoughts on the clipboard as plain
   text — to share. Escape, the ×, or a press outside shuts it.
   -------------------------------------------------------------------------- */

const ORDER = RUN_LAYOUTS.map((l) => l.value)
const nameOf = (id: RunLayoutId) => RUN_LAYOUTS.find((l) => l.value === id)?.label ?? id

export function CanvasReasoning({
  layout,
  favourites,
  onToggleFavourite,
}: {
  layout: RunLayoutId
  favourites: readonly RunLayoutId[]
  onToggleFavourite: (id: RunLayoutId) => void
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<RunLayoutId>(layout)
  const [notes, writeNote] = useLayoutNotes()
  const [copied, setCopied] = useState(false)
  const panel = useRef<HTMLDivElement | null>(null)
  const button = useRef<HTMLSpanElement | null>(null)
  const head = useId()

  const show = () => {
    setAt(layout)
    setCopied(false)
    setOpen(true)
  }
  const shut = (focusBack = true) => {
    setOpen(false)
    if (focusBack) window.requestAnimationFrame(() => button.current?.querySelector('button')?.focus())
  }

  /* Escape, or a press outside the panel and its button, shuts it. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        shut()
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (t && !panel.current?.contains(t) && !button.current?.contains(t)) shut(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    window.requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('h2')?.focus())
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  const step = (by: number) => {
    const i = ORDER.indexOf(at)
    setAt(ORDER[(i + by + ORDER.length) % ORDER.length])
  }

  const copyAll = async () => {
    const lines: string[] = ['Access checks — the run’s layouts', '']
    for (const id of ORDER) {
      const r = REASONING[id]
      const shelf = shelfOf(id, favourites)
      lines.push(`${nameOf(id)} (${shelf === 'favourites' ? 'Favourite' : shelf === 'archive' ? 'Archive' : 'Own button'})`)
      if (r) {
        lines.push(`  ${r.idea}`)
        for (const g of r.good) lines.push(`  + ${g}`)
        for (const b of r.bad) lines.push(`  - ${b}`)
      }
      const mine = notes[id]?.trim()
      if (mine) lines.push(`  My thoughts: ${mine}`)
      lines.push('')
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const r = REASONING[at]
  const shelf = shelfOf(at, favourites)
  const starred = shelf === 'favourites'

  return (
    <>
      <span ref={button} className="sit-reason__btn">
        <Button variant="ghost" size="sm" icon={Lightbulb} pressed={open} onClick={() => (open ? shut() : show())}>
          Reasoning
        </Button>
      </span>
      {open && (
        <div ref={panel} className="sit-reason" role="dialog" aria-labelledby={head}>
          <div className="sit-reason__bar">
            <h2 id={head} className="sit-reason__title" tabIndex={-1}>
              Reasoning
            </h2>
            <button type="button" className="sit-reason__x" aria-label="Close reasoning" onClick={() => shut()}>
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="sit-reason__nav">
            <button type="button" className="sit-reason__step" aria-label="Previous layout" onClick={() => step(-1)}>
              <ChevronLeft size={15} strokeWidth={2} aria-hidden />
            </button>
            <div className="sit-reason__name">
              <strong>{nameOf(at)}</strong>
              <span>{shelf === 'favourites' ? 'Favourites' : shelf === 'archive' ? 'Archive' : 'Its own button'}</span>
            </div>
            {shelf !== null && (
              <Tip text={starred ? 'Move to Archive' : 'Move to Favourites'} placement="bottom">
                <button
                  type="button"
                  className={`sit-reason__star${starred ? ' is-on' : ''}`}
                  aria-label={starred ? `Move ${nameOf(at)} to Archive` : `Move ${nameOf(at)} to Favourites`}
                  aria-pressed={starred}
                  onClick={() => onToggleFavourite(at)}
                >
                  <Star size={15} strokeWidth={2} aria-hidden />
                </button>
              </Tip>
            )}
            <button type="button" className="sit-reason__step" aria-label="Next layout" onClick={() => step(1)}>
              <ChevronRight size={15} strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="sit-reason__body">
            {r ? (
              <>
                <p className="sit-reason__idea">{r.idea}</p>
                {r.early && <p className="sit-reason__early">Still being built: a first look</p>}
                <div className="sit-reason__list">
                  <span className="sit-reason__label">Works</span>
                  <ul>
                    {r.good.map((g) => (
                      <li key={g}>
                        <Check size={13} strokeWidth={2.2} className="is-good" aria-hidden />
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="sit-reason__list">
                  <span className="sit-reason__label">Doesn’t</span>
                  <ul>
                    {r.bad.map((b) => (
                      <li key={b}>
                        <Minus size={13} strokeWidth={2.2} className="is-bad" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="sit-reason__idea">No reasoning written for this layout yet.</p>
            )}
            <label className="sit-reason__mine">
              <span className="sit-reason__label">Your thoughts</span>
              <textarea
                key={at}
                rows={4}
                defaultValue={notes[at] ?? ''}
                placeholder="What works, what doesn’t…"
                onChange={(e) => writeNote(at, e.target.value)}
              />
            </label>
          </div>

          <div className="sit-reason__foot">
            <Button variant="secondary" size="sm" icon={Copy} onClick={() => void copyAll()}>
              {copied ? 'Copied' : 'Copy all'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
