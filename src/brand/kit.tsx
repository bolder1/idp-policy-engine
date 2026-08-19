import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, type LucideIcon } from 'lucide-react'

import type { AccessDecision, PolicyStatus } from './data'

/* -----------------------------------------------------------------------------
   Brand kit — the primitives from IDP · 2 Core.

   Button variants map one-to-one to the library's interactive/* token groups:
   brand, neutral, ghost, danger. The library's usage guidance is enforced by
   how these are used, not by the component: one brand button per group, danger
   only on the actually-destructive action, ghost for cancel.

   `primary` and `secondary` are aliases on top of those roles rather than new
   ones — a screen argues about which control is primary, and the token set
   should not have to be edited to settle it. There is still exactly one primary
   per view.
   -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'brand' | 'neutral' | 'ghost' | 'danger'

const ROLE: Record<ButtonVariant, string> = {
  primary: 'brand',
  brand: 'brand',
  secondary: 'neutral',
  neutral: 'neutral',
  ghost: 'ghost',
  danger: 'danger',
}

export function Button({
  children,
  onClick,
  variant = 'neutral',
  size = 'md',
  disabled,
  block,
  title,
  icon: Icon,
  iconRight: IconRight,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  disabled?: boolean
  block?: boolean
  title?: string
  icon?: LucideIcon
  iconRight?: LucideIcon
  type?: 'button' | 'submit'
}) {
  const px = size === 'sm' ? 13 : 14
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`bx-btn bx-btn--${ROLE[variant]} bx-btn--${size} ${block ? 'is-block' : ''}`}
    >
      {Icon && <Icon size={px} strokeWidth={2} aria-hidden />}
      {children}
      {IconRight && <IconRight size={px} strokeWidth={2} aria-hidden />}
    </button>
  )
}

/* An icon on its own is only usable if it names itself, so the label is
   required and does double duty: the accessible name and the tooltip. */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  size = 'md',
  tone = 'neutral',
  pressed,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  disabled?: boolean
  size?: 'sm' | 'md'
  /* `danger` exists because an icon-only delete with no colour on it is a
     control that gets pressed by accident. The kit already had a danger
     Button; the icon variant was the gap. */
  tone?: 'neutral' | 'ghost' | 'danger'
  pressed?: boolean
}) {
  return (
    <Tip text={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={`bx-iconbtn bx-iconbtn--${size} bx-iconbtn--${tone} ${pressed ? 'is-on' : ''}`}
      >
        <Icon size={size === 'sm' ? 14 : 16} strokeWidth={1.9} aria-hidden />
      </button>
    </Tip>
  )
}

export interface MenuItem {
  id: string
  label: string
  icon?: LucideIcon
  hint?: string
  kbd?: string
  danger?: boolean
  disabled?: boolean
  /** Draws a rule above this item. Groups related actions without a heading. */
  divide?: boolean
}

/* One button that carries a group of related actions.

   The alternative is what this builder's toolbar used to be: eleven flat
   controls competing for the same glance. Grouping them costs one click and
   returns the top bar to the two decisions that matter. */
export function MenuButton({
  label,
  icon,
  items,
  onSelect,
  variant = 'secondary',
  size = 'md',
  align = 'end',
  iconOnly = false,
}: {
  label: string
  icon?: LucideIcon
  items: MenuItem[]
  onSelect: (id: string) => void
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  align?: 'start' | 'end'
  /* A kebab: the icon alone, no text and no chevron, with `label` carrying the
     accessible name. Needed wherever a row offers an overflow rather than a
     named menu — a labelled trigger in a hover cluster is three words competing
     with the three icons beside it. */
  iconOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const wrap = useRef<HTMLSpanElement | null>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const usable = items.filter((i) => !i.disabled)
  const step = (d: number) => {
    if (usable.length === 0) return
    setCursor((c) => (c + d + usable.length) % usable.length)
  }

  const pick = (item: MenuItem) => {
    if (item.disabled) return
    setOpen(false)
    onSelect(item.id)
  }

  return (
    <span className="bx-menu" ref={wrap}>
      <button
        type="button"
        className={`bx-btn bx-btn--${ROLE[variant]} bx-btn--${size} bx-menu__trigger ${iconOnly ? 'bx-menu__trigger--icon' : ''} ${open ? 'is-open' : ''}`}
        aria-label={iconOnly ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setCursor(0)
          setOpen((v) => !v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {icon && <MenuIcon icon={icon} size={size} />}
        {!iconOnly && label}
        {!iconOnly && <ChevronDown size={size === 'sm' ? 12 : 13} strokeWidth={2.2} aria-hidden />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role="menu"
            className={`bx-menu__pop is-${align}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.13, ease: [0.2, 0, 0, 1] }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                step(1)
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                step(-1)
              }
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (usable[cursor]) pick(usable[cursor])
              }
            }}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`bx-menu__item ${item.danger ? 'is-danger' : ''} ${item.divide ? 'is-divided' : ''} ${
                  usable[cursor]?.id === item.id ? 'is-cursor' : ''
                }`}
                onMouseEnter={() => {
                  const n = usable.findIndex((u) => u.id === item.id)
                  if (n >= 0) setCursor(n)
                }}
                onClick={() => pick(item)}
              >
                {item.icon && <item.icon size={14} strokeWidth={1.9} aria-hidden />}
                <span>
                  <strong>{item.label}</strong>
                  {item.hint && <em>{item.hint}</em>}
                </span>
                {item.kbd && <kbd>{item.kbd}</kbd>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

function MenuIcon({ icon: Icon, size }: { icon: LucideIcon; size: 'sm' | 'md' }) {
  return <Icon size={size === 'sm' ? 13 : 14} strokeWidth={2} aria-hidden />
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'brand' | 'positive' | 'negative' | 'notice' | 'info' | 'accent' | 'lime' | 'magenta' | 'system'
}) {
  return <span className={`bx-badge bx-badge--${tone}`}>{children}</span>
}

export function DecisionChip({
  decision,
  size = 'md',
}: {
  decision: AccessDecision
  size?: 'sm' | 'md'
}) {
  const tone = decision === 'deny' ? 'negative' : decision === '2fa' ? 'notice' : 'positive'
  const label = decision === 'deny' ? 'Deny' : decision === '2fa' ? 'MFA' : 'Allow'
  return (
    <span className={`bx-decision bx-decision--${tone} bx-decision--${size}`}>
      <i />
      {label}
    </span>
  )
}

export function StatusPill({ status }: { status: PolicyStatus }) {
  if (status === 'always-on') return <span className="bx-status bx-status--always">Always on</span>
  /* Monitor gets its own pill rather than a variant of Active, because the two
     differ in the only way that matters — one refuses sign-ins and one does
     not. Notice tone, never positive: a monitor policy looking like a live one
     is how a tenant believes they are protected for a fortnight. */
  if (status === 'monitor')
    return (
      <span className="bx-status bx-status--monitor" title="Evaluates every sign-in and records what it would have done. Enforces nothing.">
        <i />
        Monitor
      </span>
    )
  return (
    <span className={`bx-status bx-status--${status}`}>
      <i />
      {status === 'active' ? 'Active' : 'Inactive'}
    </span>
  )
}

export function AppGlyph({ glyph, tint, size = 20 }: { glyph: string; tint: string; size?: number }) {
  return (
    <span
      className="bx-glyph"
      style={{ background: tint, width: size, height: size, fontSize: size * 0.5, borderRadius: size * 0.27 }}
      aria-hidden
    >
      {glyph}
    </span>
  )
}

/** Overlapping app avatars with a count, as the policy table shows them. */
export function AppStack({
  items,
  max = 3,
}: {
  items: { id: string; name: string; glyph: string; tint: string }[]
  max?: number
}) {
  if (items.length === 0) return <span className="bx-appstack__none">No apps</span>
  const shown = items.slice(0, max)
  return (
    <span className="bx-appstack" title={items.map((a) => a.name).join(', ')}>
      <span className="bx-appstack__row">
        {shown.map((a) => (
          <AppGlyph key={a.id} glyph={a.glyph} tint={a.tint} size={18} />
        ))}
      </span>
      <span className="bx-appstack__count">
        {items.length} app{items.length === 1 ? '' : 's'}
      </span>
    </span>
  )
}

/* How far the knob travels, per size: track − knob − (2 × inset). Kept here as
   a number rather than derived from layout, which is the whole point of the
   rewrite below. */
const TOGGLE_TRAVEL = { sm: 14, md: 20, lg: 22 } as const

/* The switch.

   The previous one moved its knob by flipping the track's `justify-content` and
   letting motion's `layout` animate the consequence. That measures the DOM on
   every toggle to discover a distance that was always known, and it fights the
   knob's own shadow: at 2px of inset the shadow spilled past the track and the
   control read as broken — which is exactly what it was reported as.

   This one translates the knob by a fixed distance. No measurement, nothing to
   disagree with, and the inset is big enough that the knob is visibly inside
   the track at both ends. The off state keeps a border so it reads as a control
   rather than a grey blob — Linear, Plain and Pinterest all do the same. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  size = 'md',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`bx-toggle bx-toggle--${size} ${checked ? 'is-on' : ''}`}
    >
      <motion.span
        className="bx-toggle__knob"
        initial={false}
        animate={{ x: checked ? TOGGLE_TRAVEL[size] : 0 }}
        transition={{ type: 'spring', stiffness: 700, damping: 42 }}
      />
    </button>
  )
}

export function Chip({
  children,
  active,
  onClick,
  count,
  removable,
  onRemove,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  count?: number | string
  removable?: boolean
  onRemove?: () => void
}) {
  return (
    <span className={`bx-chip ${active ? 'is-on' : ''} ${onClick ? 'is-clickable' : ''}`}>
      <button type="button" onClick={onClick} disabled={!onClick} className="bx-chip__main">
        {children}
        {count !== undefined && <em>{count}</em>}
      </button>
      {removable && (
        <button type="button" className="bx-chip__x" onClick={onRemove} aria-label="Remove">
          ×
        </button>
      )}
    </span>
  )
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (v: T) => void
  name: string
}) {
  return (
    <div className="bx-tabs" role="tablist" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          className={`bx-tabs__tab ${value === o.value ? 'is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {value === o.value && <motion.span layoutId={`tabs-${name}`} className="bx-tabs__bg" transition={{ type: 'spring', stiffness: 600, damping: 44 }} />}
          <span className="bx-tabs__label">
            {o.label}
            {o.count !== undefined && <em>{o.count}</em>}
          </span>
        </button>
      ))}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
  inline,
}: {
  label: string
  hint?: string
  children: ReactNode
  htmlFor?: string
  inline?: boolean
}) {
  return (
    <div className={`bx-field ${inline ? 'is-inline' : ''}`}>
      <label className="bx-field__label u-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="bx-field__control">{children}</div>
      {hint && <p className="bx-field__hint">{hint}</p>}
    </div>
  )
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'notice' | 'negative' | 'positive'
  title?: string
  children: ReactNode
}) {
  return (
    <div className={`bx-callout bx-callout--${tone}`}>
      <span className="bx-callout__mark" aria-hidden />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  )
}

export function Card({
  title,
  caption,
  actions,
  children,
  flush,
}: {
  title?: string
  caption?: string
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
}) {
  return (
    <section className="bx-card">
      {(title || actions) && (
        <header className="bx-card__head">
          <div>
            {title && <h2>{title}</h2>}
            {caption && <p>{caption}</p>}
          </div>
          {actions && <div className="bx-card__actions">{actions}</div>}
        </header>
      )}
      <div className={`bx-card__body ${flush ? 'is-flush' : ''}`}>{children}</div>
    </section>
  )
}

/** Spring-damped counter for live match estimates. */
export function Counter({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const raf = useRef(0)
  const from = useRef(value)
  const start = useRef(0)

  useEffect(() => {
    if (value === display) return
    from.current = display
    start.current = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start.current) / 420)
      const eased = 1 - Math.pow(1 - t, 5)
      setDisplay(Math.round(from.current + (value - from.current) * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span className={className}>{display.toLocaleString()}</span>
}

/* The screen states what a control does and what the data says. The sentence
   explaining a consequence still has to be reachable — it is often the honest
   part — so it moves here rather than being deleted.

   Hover and focus both open it, Escape closes it, and a tap opens it on touch
   where there is no hover at all. `aria-describedby` means a screen reader gets
   the text without the pointer ever being involved. */
/* -----------------------------------------------------------------------------
   Tooltip.

   Two bugs made this worth rewriting rather than patching.

   It was `position: absolute; left: 50%; translateX(-50%)` on a fixed 262px
   box — centred on its trigger, so a trigger anywhere near an edge put half the
   tooltip off-screen. And absolute positioning is clipped by any ancestor with
   `overflow: hidden`, which by now includes the zones table, the fingerprint
   category panels, the attribute accordion and the entry lists. A tooltip that
   disappears inside a scroll container is worse than no tooltip.

   So it renders in a PORTAL with FIXED coordinates measured from the trigger:
   no ancestor can clip it, and it decides its own placement from the room it
   actually has. Prefer the requested side, flip when that side cannot hold it,
   and clamp horizontally to the viewport so it is always fully visible.
   -------------------------------------------------------------------------- */

const TIP_GAP = 7
const TIP_MARGIN = 8

export function Tip({
  text,
  children,
  placement = 'bottom',
  width,
}: {
  text: ReactNode
  children: ReactNode
  placement?: 'top' | 'bottom'
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; side: 'top' | 'bottom' } | null>(null)
  const anchor = useRef<HTMLSpanElement | null>(null)
  const pop = useRef<HTMLSpanElement | null>(null)
  const id = useId()

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect()
    if (!a) return
    const p = pop.current?.getBoundingClientRect()
    const w = p?.width ?? width ?? 262
    const h = p?.height ?? 0

    /* Flip only when the preferred side genuinely cannot hold it AND the other
       side has more room. Flipping toward an equally cramped side just moves the
       problem. */
    const below = window.innerHeight - a.bottom
    const above = a.top
    let side = placement
    if (placement === 'bottom' && below < h + TIP_GAP + TIP_MARGIN && above > below) side = 'top'
    if (placement === 'top' && above < h + TIP_GAP + TIP_MARGIN && below > above) side = 'bottom'

    const top = side === 'bottom' ? a.bottom + TIP_GAP : a.top - h - TIP_GAP
    /* Centre on the trigger, then clamp — the clamp is the whole fix for the
       edge case, and it is why the tooltip is no longer allowed to know where
       its trigger is horizontally. */
    const centred = a.left + a.width / 2 - w / 2
    const left = Math.max(TIP_MARGIN, Math.min(centred, window.innerWidth - w - TIP_MARGIN))
    setPos({ top, left, side })
  }, [placement, width])

  /* Measured after the pop is in the DOM, so `h` is real rather than guessed —
     the first pass renders it invisible at 0,0 and the second puts it right. */
  useEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    place()
    /* `capture: true` so a scroll inside any container moves it, not just the
       window — this is the half of the fix that keeps it attached. */
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, place])

  return (
    <span
      ref={anchor}
      className="bx-tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      onTouchStart={() => setOpen((v) => !v)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        createPortal(
          <AnimatePresence>
            <motion.span
              ref={pop}
              id={id}
              role="tooltip"
              className={`bx-tip__pop is-${pos?.side ?? placement}`}
              style={{
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                width,
                /* Hidden until measured, so nothing is ever seen at 0,0. */
                visibility: pos ? 'visible' : 'hidden',
              }}
              initial={{ opacity: 0, y: (pos?.side ?? placement) === 'bottom' ? -3 : 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.13 }}
            >
              {text}
            </motion.span>
          </AnimatePresence>,
          document.body,
        )}
    </span>
  )
}

/** The `?` that carries a demoted sentence. Trigger for {@link Tip}. */
export function TipDot({ text, label = 'Why this matters' }: { text: ReactNode; label?: string }) {
  return (
    <Tip text={text}>
      <button type="button" className="bx-tipdot" aria-label={label}>
        ?
      </button>
    </Tip>
  )
}

/** Small "why" affordance — the current prototype shows bare red dots. */
export function InfoDot({ text, tone = 'notice' }: { text: string; tone?: 'notice' | 'negative' }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="bx-infodot-wrap">
      <button
        type="button"
        className={`bx-infodot bx-infodot--${tone}`}
        aria-label={text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      <AnimatePresence>
        {open && (
          <motion.span
            className="bx-infodot__pop"
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.14 }}
            role="tooltip"
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

export function Drawer({
  open,
  onClose,
  title,
  caption,
  head,
  actions,
  children,
  width = 460,
  resizable,
  minWidth = 380,
  maxWidth = 900,
}: {
  open: boolean
  onClose: () => void
  title: string
  caption?: string
  /** Replaces the default title block. For a panel whose header needs to carry
      more than two lines of text — an icon, a count, a state — composed by the
      caller rather than by adding a prop per thing. `title` is still required
      and still names the panel for assistive tech. */
  head?: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Opening width. A caller that knows what it is about to render should pick
      one that suits it rather than taking the default and hoping. */
  width?: number
  /** Adds a drag handle on the leading edge. Off by default: a panel showing
      three toggles does not need to be resizable, and a handle on it is one more
      thing to notice and never use. */
  resizable?: boolean
  minWidth?: number
  maxWidth?: number
}) {
  /* The caller's width is the opening width, not the width. Once somebody has
     dragged the edge, that is the width — including when the panel is closed and
     reopened on something else, because a panel that resets its size every time
     you switch rows is a panel you have to resize every time. */
  const [dragged, setDragged] = useState<number | null>(null)
  const w = clampWidth(dragged ?? width, minWidth, maxWidth)

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
      const startW = w
      const opts = { signal: ac.signal }
      // Dragging left widens: the panel is anchored to the right edge.
      window.addEventListener(
        'pointermove',
        (ev: PointerEvent) => setDragged(clampWidth(startW + (startX - ev.clientX), minWidth, maxWidth)),
        opts,
      )
      window.addEventListener('pointerup', endResize, opts)
      window.addEventListener('pointercancel', endResize, opts)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [w, minWidth, maxWidth, endResize],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="bx-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="bx-drawer"
            style={{ width: w }}
            initial={{ x: w }}
            animate={{ x: 0 }}
            exit={{ x: w }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            role="dialog"
            aria-label={title}
          >
            {resizable && (
              <div
                className="bx-drawer__grip"
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${title}`}
                aria-valuenow={Math.round(w)}
                aria-valuemin={minWidth}
                aria-valuemax={maxWidth}
                tabIndex={0}
                onPointerDown={startResize}
                onDoubleClick={() => setDragged(null)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') setDragged(clampWidth(w + 32, minWidth, maxWidth))
                  if (e.key === 'ArrowRight') setDragged(clampWidth(w - 32, minWidth, maxWidth))
                }}
              >
                <span aria-hidden />
              </div>
            )}

            <header className="bx-drawer__head">
              {head ?? (
                <div>
                  <h2>{title}</h2>
                  {caption && <p>{caption}</p>}
                </div>
              )}
              <button className="bx-drawer__x" onClick={onClose} aria-label="Close">
                ×
              </button>
            </header>
            <div className="bx-drawer__body">{children}</div>
            {actions && <footer className="bx-drawer__foot">{actions}</footer>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

const clampWidth = (want: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.min(want, typeof window === 'undefined' ? max : window.innerWidth - 120)))

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
  padded = true,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: number
  padded?: boolean
}) {
  const panel = useRef<HTMLDivElement | null>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  /* `onClose` is an inline arrow in every caller, so it has a new identity on
     every render of the host. Putting it in the effect's dependencies made the
     effect tear down and re-run continuously — which meant the "restore focus"
     cleanup fired on every keystroke in the builder behind the dialog, throwing
     focus at whatever had been active when that render started. Held in a ref
     instead, so the effect below depends only on `open`. */
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  /* Escape, a focus trap, and focus restoration.

     Without the trap, Tab walks straight out of an open dialog and into the
     page behind it — which for a keyboard user means the modal is a visual
     effect rather than a mode. Without the restoration, closing a dialog drops
     focus back to <body>, so the next Tab starts from the top of the console
     instead of from the control that opened it.

     The trap is a keydown handler rather than inert/aria-hidden on the rest of
     the page because these dialogs animate in over a live builder, and toggling
     inertness on an animating tree is where that approach starts fighting
     motion for control of the same nodes. */
  useEffect(() => {
    if (!open) return
    returnTo.current = document.activeElement as HTMLElement | null

    // Focus the panel itself rather than its first control: dialogs here open
    // with a heading, and starting on a button skips the sentence that says
    // what the dialog is for.
    const id = window.requestAnimationFrame(() => panel.current?.focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onCloseRef.current()
      if (e.key !== 'Tab' || !panel.current) return
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const on = document.activeElement
      if (e.shiftKey && (on === first || on === panel.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && on === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('keydown', onKey)
      /* Only restore to a control that still exists. Some dialogs are opened by
         a trigger that navigates — the policy list's exposure cell opens the
         gauntlet and unmounts the whole table doing it — and calling focus() on
         a detached node silently drops focus to <body> instead of leaving it
         where the new screen put it. */
      const back = returnTo.current
      if (back?.isConnected) back.focus()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="bx-scrim bx-scrim--center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="bx-modal"
            style={{ width }}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            ref={panel}
            tabIndex={-1}
          >
            <header className="bx-modal__head">
              <h2>{title}</h2>
              <button className="bx-drawer__x" onClick={onClose} aria-label="Close">
                ×
              </button>
            </header>
            <div className={`bx-modal__body ${padded ? '' : 'is-flush'}`}>{children}</div>
            {footer && <footer className="bx-modal__foot">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Unsaved-changes bar. Names what changed rather than saying "unsaved changes",
 * which is the library's "name examples, not only totals" rule applied to the
 * save affordance.
 */
export function SaveBar({
  open,
  changes,
  onDiscard,
  onReview,
}: {
  open: boolean
  changes: string[]
  onDiscard: () => void
  onReview: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="bx-savebar"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        >
          <span className="bx-savebar__text">
            <strong>
              {changes.length} unsaved change{changes.length === 1 ? '' : 's'}
            </strong>
            <span>{changes.slice(0, 2).join(' · ')}{changes.length > 2 ? ` · +${changes.length - 2} more` : ''}</span>
          </span>
          <Button variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
          <Button variant="brand" onClick={onReview}>
            Review &amp; enforce
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
