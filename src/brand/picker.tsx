import { motion } from 'motion/react'
import { Fragment, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, type LucideIcon } from 'lucide-react'

import './picker.css'

/* -----------------------------------------------------------------------------
   Picker — the replacement for the native `<select>`.

   The selects in the condition editor were not broken by any of the usual
   suspects — not `appearance`, not `pointer-events`, not a stacking context,
   not the animation wrapper. They were **clipped out of existence**. The
   condition row carried `overflow: hidden` to protect a 3px category edge, and
   its fixed columns (150px field + 122px operator + 26px remove + gaps) meant
   the value column computed to zero below about 342px of row width: the select
   rendered at 17.6px, which is its arrow and nothing else, and the remove
   button sat entirely outside the clip box. Above that width they worked, and
   looked like unstyled OS chrome dropped into a design system.

   So the row loses its `overflow` and this loses the `<select>`.

   The popup is portalled to `document.body` and positioned `fixed`, which is
   this codebase's own proven un-clippable pattern — `Tip` was rewritten to it
   for exactly this reason. The placement logic is lifted from it: flip only
   when the preferred side genuinely lacks room AND the other has more, clamp
   horizontally to the viewport, follow scroll with `capture: true` so a nested
   scroller moves it too, and stay hidden until measured so nothing is ever seen
   at 0,0.

   It sits at `--z-dropdown`, deliberately below `--z-popover`, so a `Tip` can
   still explain an option.
   -------------------------------------------------------------------------- */

const GAP = 4
const MARGIN = 8

export interface PickerOption {
  value: string
  label: string
  /** A second line — "12 uses", "Corporate managed". Searched as well as shown. */
  meta?: string
  icon?: LucideIcon
  /** Section heading. Emitted when it changes, so caller order is preserved. */
  group?: string
  disabled?: boolean
}

export function Picker({
  value,
  options,
  onChange,
  label,
  placeholder = 'Choose…',
  searchable,
  multiple = false,
  size = 'sm',
  width = 'content',
  footer,
  onFooter,
  invalid = false,
  autoOpen = false,
}: {
  value: string | string[] | null
  options: PickerOption[]
  onChange: (v: string) => void
  /** Accessible name. Required — a combobox with no name is one nobody can use. */
  label: string
  placeholder?: string
  /** Defaults on once the list is long enough to scroll past. */
  searchable?: boolean
  multiple?: boolean
  size?: 'sm' | 'md'
  width?: 'content' | 'fill'
  /** A trailing action in the popup — "Manage zones →". */
  footer?: ReactNode
  onFooter?: () => void
  invalid?: boolean
  /** Open on mount, for a row inserted with nothing chosen yet. */
  autoOpen?: boolean
}) {
  const [open, setOpen] = useState(autoOpen)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; side: 'top' | 'bottom' } | null>(null)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const pop = useRef<HTMLDivElement | null>(null)
  const id = useId()

  const picked = multiple ? ((value as string[] | null) ?? []) : value ? [value as string] : []
  const canSearch = searchable ?? options.length >= 8

  const shown = q
    ? options.filter((o) => `${o.label} ${o.meta ?? ''} ${o.value}`.toLowerCase().includes(q.toLowerCase()))
    : options
  const usable = shown.filter((o) => !o.disabled)

  const summary =
    picked.length === 0
      ? placeholder
      : picked.length === 1
        ? (options.find((o) => o.value === picked[0])?.label ?? picked[0])
        : `${picked.length} selected`

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect()
    if (!a) return
    const p = pop.current?.getBoundingClientRect()
    const w = Math.max(a.width, p?.width ?? 220)
    const h = p?.height ?? 0

    const below = window.innerHeight - a.bottom
    const above = a.top
    const side: 'top' | 'bottom' = below < h + GAP + MARGIN && above > below ? 'top' : 'bottom'

    setPos({
      top: side === 'bottom' ? a.bottom + GAP : a.top - h - GAP,
      left: Math.max(MARGIN, Math.min(a.left, window.innerWidth - w - MARGIN)),
      width: w,
      side,
    })
  }, [])

  useEffect(() => {
    if (!open) {
      setPos(null)
      setQ('')
      return
    }
    place()
    /* `capture: true` so a scroll inside any container moves it, not just the
       window. That is the half of the fix that keeps it attached to its row. */
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!anchor.current?.contains(t) && !pop.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, place])

  // Re-measure when a search changes the popup's height under it.
  useEffect(() => {
    if (open) place()
  }, [q, open, place])

  const commit = (o: PickerOption) => {
    if (o.disabled) return
    onChange(o.value)
    if (!multiple) setOpen(false)
  }

  const step = (d: number) => {
    if (usable.length === 0) return
    setCursor((c) => (c + d + usable.length) % usable.length)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
      anchor.current?.focus()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      step(1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      step(-1)
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setCursor(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      setCursor(Math.max(0, usable.length - 1))
      return
    }
    if (e.key === 'Enter' || (e.key === ' ' && !canSearch)) {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (usable[cursor]) commit(usable[cursor])
      return
    }
    if (e.key === 'Tab') setOpen(false)
  }

  /* Group headings are emitted when the group CHANGES rather than collected
     into buckets, so the caller controls the order and the picker never
     silently reshuffles a list somebody deliberately sorted. */
  let lastGroup: string | undefined

  return (
    <span className={`bx-picker ${width === 'fill' ? 'is-fill' : ''}`}>
      <button
        ref={anchor}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-activedescendant={open && usable[cursor] ? `${id}-${cursor}` : undefined}
        className={`bx-picker__trigger bx-picker__trigger--${size} ${open ? 'is-open' : ''} ${
          picked.length === 0 ? 'is-empty' : ''
        } ${invalid ? 'is-invalid' : ''}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKey}
      >
        <span className="bx-picker__value">{summary}</span>
        <ChevronDown size={size === 'sm' ? 12 : 13} strokeWidth={2.1} aria-hidden />
      </button>

      {open &&
        createPortal(
          <motion.div
            ref={pop}
            id={id}
            className={`bx-picker__pop is-${pos?.side ?? 'bottom'}`}
            style={
              {
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                minWidth: pos?.width ?? 220,
                // Hidden until measured, so nothing is ever seen at 0,0.
                visibility: pos ? 'visible' : 'hidden',
              } as CSSProperties
            }
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
            onKeyDown={onKey}
          >
            {canSearch && (
              <div className="bx-picker__search">
                <input
                  autoFocus
                  aria-label={`Search ${label}`}
                  aria-autocomplete="list"
                  placeholder="Search…"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value)
                    setCursor(0)
                  }}
                />
              </div>
            )}

            <ul
              role="listbox"
              aria-label={label}
              aria-multiselectable={multiple || undefined}
              className="bx-picker__list"
            >
              {usable.length === 0 && (
                <li className="bx-picker__none">{q ? `No match for “${q}”.` : 'Nothing to choose from yet.'}</li>
              )}
              {shown.map((o) => {
                const i = usable.indexOf(o)
                const on = picked.includes(o.value)
                const heading = o.group && o.group !== lastGroup ? o.group : null
                lastGroup = o.group
                const Ico = o.icon
                return (
                  <Fragment key={o.value}>
                    {heading && (
                      <li className="bx-picker__head u-label" role="presentation">
                        {heading}
                      </li>
                    )}
                    <li
                      id={`${id}-${i}`}
                      role="option"
                      aria-selected={on}
                      aria-disabled={o.disabled || undefined}
                      className={`bx-picker__opt ${on ? 'is-on' : ''} ${i === cursor ? 'is-cursor' : ''} ${
                        o.disabled ? 'is-off' : ''
                      }`}
                      onMouseEnter={() => i >= 0 && setCursor(i)}
                      onClick={() => commit(o)}
                    >
                      <span className="bx-picker__tick" aria-hidden>
                        {on && <Check size={12} strokeWidth={3} />}
                      </span>
                      {Ico && <Ico size={13} strokeWidth={1.8} aria-hidden />}
                      <span className="bx-picker__opttext">
                        <strong>{o.label}</strong>
                        {o.meta && <em>{o.meta}</em>}
                      </span>
                    </li>
                  </Fragment>
                )
              })}
            </ul>

            {footer && (
              <button
                type="button"
                className="bx-picker__footer"
                onClick={() => {
                  setOpen(false)
                  onFooter?.()
                }}
              >
                {footer}
              </button>
            )}
          </motion.div>,
          document.body,
        )}
    </span>
  )
}

/* A block that keeps the geometry of what it replaces.

   The component rules ban spinners and mandate skeletons, and the kit shipped
   neither — so "every state accounted for" could not actually be satisfied for
   any new control until this existed. */
export function Skeleton({
  w,
  h = 14,
  radius = 'var(--radius-sm)',
}: {
  w?: number | string
  h?: number
  radius?: string
}) {
  return <span className="bx-skel" style={{ width: w ?? '100%', height: h, borderRadius: radius }} aria-hidden />
}
