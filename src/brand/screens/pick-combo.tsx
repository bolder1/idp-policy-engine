import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, SearchX, X } from 'lucide-react'

import { appRoot } from '../dialog-chrome'
import { EmptyState } from '../empty'

/* -----------------------------------------------------------------------------
   A chip field of anything with a mark (Guided setup, 19 Oct 2026; owner:
   "Application can be same like Who, so no need extra chips outside").

   The Access checks Identity field's shape (sign-in-tests/identity-combo.tsx,
   who-combo.tsx), without its Users | Groups switch: at rest the picks as
   chips INSIDE the field — each its mark (an application's logo, a
   condition's icon), the name, an × — two lines at most, then "+N" (the rest
   on hover); or, nothing picked, a grey mark and the empty words, as a prompt
   ("Choose applications") or as an answer ("Any place, any device"). One
   press (Enter, Space, ↓, or typing) puts a search after the chips and drops
   the list: the Picker's own list (picker.css), portalled to the app root and
   placed `fixed`, so the panel's scroller never clips it. The picks head it as
   it opened; a press or Enter picks a row or puts it back and the list stays
   open; a row another place holds is off, with why ("In use"). Backspace in an
   empty search takes the last chip off; each chip's × is a Tab stop. Esc closes
   the list and keeps the picks, and stops there; a press outside or a Tab past
   it closes it too.

   The field's classes are the Identity field's (sign-in-tests.css
   `.sit-ident__*`), so the two read as one control.
   -------------------------------------------------------------------------- */

export interface PickOption {
  value: string
  label: string
  /** Its mark, in the chip and in the list: an application's logo, a condition's icon. */
  art: ReactNode
  /** A shorter name for the chip, where the field and the mark already say the rest ("India" for "Only from India"). */
  chip?: string
  /** The list's second line — or, for a row that is off, why ("In use"). */
  meta?: string
  disabled?: boolean
}

const GAP = 4
const MARGIN = 8
const MIN_POP = 260
/** The chips' lines: past two, the rest fold into "+N". */
const CHIP_LINES = 2

/* Typed words: a name that starts with them first, then one with a word that does, then any that holds them. */
function ranked(options: readonly PickOption[], needle: string): PickOption[] {
  const rank = (o: PickOption) => {
    const l = o.label.toLowerCase()
    if (l.startsWith(needle)) return 0
    if (l.split(/[\s-]+/).some((w) => w.startsWith(needle))) return 1
    return l.includes(needle) ? 2 : 3
  }
  return options
    .map((o, i) => ({ o, i, r: rank(o) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.o)
}

export function PickCombo({
  label,
  options,
  value,
  onToggle,
  empty,
  emptyArt,
  answer = false,
  noun,
  domId,
}: {
  /** The field's name: "Applications". */
  label: string
  options: readonly PickOption[]
  /** The picks, in the order chosen. */
  value: readonly string[]
  /** A row or a chip's ×: picks it, or puts it back. */
  onToggle: (value: string) => void
  /** Nothing picked: "Choose applications", or an answer — "Any place, any device". */
  empty: string
  /** The grey mark beside the empty words. */
  emptyArt: ReactNode
  /** Nothing picked is itself an answer, said in the answer's colour, not as a prompt. */
  answer?: boolean
  /** The plural the search names: "applications". */
  noun: string
  domId?: string
}) {
  /* Under reduced motion the list is there at once: no fade, no drop. */
  const reduced = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  /* The picks as the list opened: they head the list until it closes, so a row never jumps from under the pointer. */
  const [pinned, setPinned] = useState<readonly string[]>([])
  const [height, setHeight] = useState<number | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number; side: 'top' | 'bottom' } | null>(null)
  const field = useRef<HTMLDivElement | null>(null)
  const chipBox = useRef<HTMLDivElement | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const pop = useRef<HTMLDivElement | null>(null)
  /* Whether closing hands the focus back to the field: Esc does; a press elsewhere or Tab leaves it where it went. */
  const back = useRef(false)
  /* A chip taken off from the keyboard: the place whose × takes the focus next. */
  const focusAt = useRef<number | null>(null)
  const id = useId()
  const ownId = useId()
  const fieldId = domId ?? ownId

  const needle = q.trim().toLowerCase()
  const rows: readonly PickOption[] = needle
    ? ranked(options, needle)
    : [...pinned.map((v) => options.find((o) => o.value === v)).filter((o): o is PickOption => !!o), ...options.filter((o) => !pinned.includes(o.value))]
  const at = cursor === null ? -1 : rows.findIndex((o) => o.value === cursor)
  const chips = value.map((v) => options.find((o) => o.value === v) ?? { value: v, label: v, art: null })

  const start = (typed: string, first = false) => {
    setHeight(field.current?.offsetHeight ?? null)
    setPinned(value)
    setQ(typed)
    const t = typed.trim().toLowerCase()
    setCursor(t ? (ranked(options, t)[0]?.value ?? null) : (value[0] ?? (first ? (options[0]?.value ?? null) : null)))
    setOpen(true)
  }
  const close = (focusBack: boolean) => {
    back.current = focusBack
    setOpen(false)
  }
  const pick = (o: PickOption) => {
    if (o.disabled && !value.includes(o.value)) return
    onToggle(o.value)
    setQ('')
    setCursor(o.value)
  }
  /* A chip's ×. Pressed from the keyboard — or Delete or Backspace on it — the focus goes on to the next chip's ×, else
     to the field. */
  const remove = (i: number, keyboard: boolean) => {
    if (keyboard) focusAt.current = i
    onToggle(value[i])
  }
  useLayoutEffect(() => {
    const i = focusAt.current
    if (i === null) return
    focusAt.current = null
    const to = chipBox.current?.querySelectorAll<HTMLElement>('.sit-ident__chipx')[i] ?? (open ? input.current : button.current)
    to?.focus({ preventScroll: true })
  }, [value, open])

  useLayoutEffect(() => {
    if (open) return
    setPos(null)
    setQ('')
    if (back.current) {
      back.current = false
      button.current?.focus({ preventScroll: true })
    }
  }, [open])

  /* Focus gone from the field and its list both closes the list; between the two it stays open. */
  const leave = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null
    if (!field.current?.contains(to) && !pop.current?.contains(to)) setOpen(false)
  }

  /* Picker's placement: under the field, over it only when there is more room there; followed through any scroll but
     its own. */
  const place = useCallback(() => {
    const a = field.current?.getBoundingClientRect()
    if (!a) return
    const h = pop.current?.getBoundingClientRect().height ?? 0
    const w = Math.max(a.width, MIN_POP)
    const below = window.innerHeight - a.bottom
    const above = a.top
    const side: 'top' | 'bottom' = below < h + GAP + MARGIN && above > below ? 'top' : 'bottom'
    const maxH = Math.min(360, Math.max(180, (side === 'top' ? above : below) - GAP - MARGIN))
    setPos({
      top: side === 'bottom' ? a.bottom + GAP : Math.max(MARGIN, a.top - Math.min(h, maxH) - GAP),
      left: Math.max(MARGIN, Math.min(a.left, window.innerWidth - w - MARGIN)),
      width: w,
      maxH,
      side,
    })
  }, [])
  useEffect(() => {
    if (!open) return
    place()
    const onScroll = (e: Event) => {
      if (pop.current?.contains(e.target as Node)) return
      place()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])
  useEffect(() => {
    if (open) place()
  }, [q, open, value, place])
  useEffect(() => {
    if (open && at >= 0) document.getElementById(`${id}-${at}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, at, id])

  /* Two lines of chips at most: as many as fit, then "+N" — measured again whenever the picks, the state or the width
     change, one chip fewer a time, in layout effects so no frame shows a third line. */
  const [fit, setFit] = useState(value.length)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = field.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const fitKey = `${value.join('\n')}|${open}|${width}`
  const fitFor = useRef('')
  useLayoutEffect(() => {
    if (fitFor.current !== fitKey) {
      fitFor.current = fitKey
      if (fit !== value.length) {
        setFit(value.length)
        return
      }
    }
    const box = chipBox.current
    if (!box || fit <= 0) return
    const lines: number[] = []
    for (const el of Array.from(box.children) as HTMLElement[]) if (!lines.some((top) => Math.abs(top - el.offsetTop) < 6)) lines.push(el.offsetTop)
    if (lines.length > CHIP_LINES) setFit(fit - 1)
  }, [fitKey, fit, value.length])
  const shown = chips.slice(0, Math.min(fit, chips.length))
  const rest = chips.slice(shown.length)

  const onRestKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      start('', e.key === 'ArrowDown')
      return
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      start(e.key)
    }
  }
  const step = (d: 1 | -1) => {
    const n = rows.length
    if (n > 0) setCursor(rows[at < 0 ? (d > 0 ? 0 : n - 1) : (at + d + n) % n].value)
  }
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      return step(e.key === 'ArrowDown' ? 1 : -1)
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (rows[at]) pick(rows[at])
      return
    }
    if (e.key === 'Backspace' && !q && value.length > 0) {
      e.preventDefault()
      onToggle(value[value.length - 1])
      return
    }
    /* Esc closes the list and keeps the picks, and stops there: the section, the panel and the builder behind it keep
       their own Escape for the next one. */
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
  }

  const listId = `${id}-list`
  const search = `Search ${noun}`
  const state = `${value.length > 0 ? 'is-set' : 'is-empty'}${answer && value.length === 0 ? ' is-answer' : ''}`
  const chipRow = (
    <>
      {shown.map((c, i) => (
        <span key={c.value} className="sit-ident__chip pkc__chip" title={c.label} onClick={() => (open ? input.current?.focus() : start(''))}>
          <span className="pkc__art" aria-hidden>
            {c.art}
          </span>
          <span className="sit-ident__chipname">{c.chip ?? c.label}</span>
          <button
            type="button"
            className="sit-ident__chipx"
            aria-label={`Remove ${c.label}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation()
              remove(i, e.detail === 0)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Delete' && e.key !== 'Backspace') return
              e.preventDefault()
              e.stopPropagation()
              remove(i, true)
            }}
          >
            <X size={12} strokeWidth={2.2} aria-hidden />
          </button>
        </span>
      ))}
      {rest.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          className="sit-ident__chip is-more"
          title={rest.map((c) => c.label).join(', ')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? input.current?.focus() : start(''))}
        >
          +{rest.length}
        </button>
      )}
    </>
  )

  return (
    <>
      <div ref={field} className="sit-ident__fieldwrap pkc">
        {open ? (
          <div
            className={`sit-ident__field is-open ${state}`}
            style={height ? { minHeight: height } : undefined}
            onMouseDown={(e) => {
              if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
            }}
            onBlur={leave}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              e.preventDefault()
              e.stopPropagation()
              close(true)
            }}
          >
            <div ref={chipBox} className="sit-ident__chips">
              {chipRow}
              <input
                ref={input}
                id={fieldId}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-haspopup="listbox"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={at >= 0 ? `${id}-${at}` : undefined}
                aria-label={search}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="sit-ident__search"
                placeholder={value.length > 0 ? undefined : search}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  const t = e.target.value.trim().toLowerCase()
                  setCursor(t ? (ranked(options, t)[0]?.value ?? null) : (value[0] ?? null))
                }}
                onKeyDown={onSearchKey}
              />
            </div>
            <Search className="sit-ident__searchico" size={14} strokeWidth={2} aria-hidden />
          </div>
        ) : (
          <div className={`sit-ident__field ${state}`}>
            <button
              ref={button}
              id={fieldId}
              type="button"
              className="sit-ident__open"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-label={`${label}: ${chips.length > 0 ? chips.map((c) => c.label).join(', ') : empty}`}
              onClick={() => start('')}
              onKeyDown={onRestKey}
            >
              <ChevronDown className="sit-ident__chev" size={14} strokeWidth={2} aria-hidden />
            </button>
            <div ref={chipBox} className="sit-ident__chips">
              {chips.length > 0 ? (
                chipRow
              ) : (
                <>
                  <span className="sit-ident__blank pkc__blank" aria-hidden>
                    {emptyArt}
                  </span>
                  <span className="sit-ident__name" aria-hidden>
                    {empty}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {open &&
        createPortal(
          <motion.div
            ref={pop}
            className={`bx-picker__pop sit-ident__pop pkc__pop is-${pos?.side ?? 'bottom'}`}
            style={
              {
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                width: pos?.width ?? MIN_POP,
                maxHeight: pos?.maxH,
                visibility: pos ? 'visible' : 'hidden',
              } as CSSProperties
            }
            initial={reduced ? false : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.12, ease: [0.2, 0, 0, 1] }}
            onMouseDown={(e) => e.preventDefault()}
            onBlur={leave}
          >
            {rows.length === 0 && (
              <div className="bx-picker__empty">
                <EmptyState compact live icon={SearchX} title={`No ${noun} match “${q.trim()}”`} blurb="Try another name." />
              </div>
            )}
            <ul id={listId} role="listbox" aria-label={label} aria-multiselectable="true" className="bx-picker__list sit-picklist" hidden={rows.length === 0}>
              {rows.map((o, i) => {
                const on = value.includes(o.value)
                const off = !!o.disabled && !on
                return (
                  <li
                    key={o.value}
                    id={`${id}-${i}`}
                    role="option"
                    aria-selected={on}
                    aria-disabled={off || undefined}
                    title={off ? o.meta : undefined}
                    className={`bx-picker__opt${on ? ' is-on' : ''}${off ? ' is-off' : ''}${i === at ? ' is-cursor' : ''}`}
                    onMouseMove={() => setCursor(o.value)}
                    onClick={() => pick(o)}
                  >
                    <span className="bx-picker__tick" aria-hidden>
                      {on && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="bx-picker__art pkc__art" aria-hidden>
                      {o.art}
                    </span>
                    <span className="bx-picker__opttext">
                      <strong>{o.label}</strong>
                      {o.meta && <em>{o.meta}</em>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </motion.div>,
          appRoot(),
        )}
    </>
  )
}
