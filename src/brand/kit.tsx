import { AnimatePresence, motion } from 'motion/react'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Minus, Plus, type LucideIcon } from 'lucide-react'

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

/* --- Clipped, and a tooltip only where one is earned ---------------------------
   `title` on every badge would put a hover box on "Session" and "System" too —
   a delay and a grey rectangle to tell you what you can already read, on the
   labels that need it least. So the attribute is set from measurement rather
   than from hope: a label carries one only while its box is narrower than its
   text, which is exactly when the ellipsis is on screen.

   Re-measured on resize, because a column getting narrower is the whole reason
   this exists, and re-run when the label changes, because a longer word in a
   box that did not move is a clip the observer never fires for.

   Reusable on purpose. Anything with a hard width and a label that can outgrow
   it wants this, and the alternative is each of them deciding separately
   whether to always show a tooltip. */
function useClipped(label: ReactNode) {
  const ref = useRef<HTMLSpanElement>(null)
  const [full, setFull] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    /* A pixel of slack. Sub-pixel layout leaves scrollWidth a fraction above
       clientWidth on labels that are not clipped at all, and a tooltip that
       repeats a fully visible label is the thing this is here to avoid. */
    let live = true
    const measure = () => {
      if (live) setFull(el.scrollWidth > el.clientWidth + 1 ? el.textContent : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    /* And again once the real face has loaded. A webfont swapping in widens the
       text inside a box whose own size never changes, so the observer never
       fires for the one event most likely to push a label over its cap. This is
       the one caller that can outlive the effect, hence the flag. */
    void document.fonts?.ready.then(measure)
    return () => {
      live = false
      ro.disconnect()
    }
  }, [label])

  return [ref, full] as const
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'brand' | 'positive' | 'negative' | 'notice' | 'info' | 'accent' | 'lime' | 'magenta' | 'system'
}) {
  /* The label is its own element rather than a bare text node because
     text-overflow does not reach an anonymous flex item — the badge stays a
     flex row so it can hold a mark beside the word, and the word gets the box
     that can be clipped. */
  const [ref, full] = useClipped(children)
  return (
    <span className={`bx-badge bx-badge--${tone}`}>
      <span className="bx-badge__label" ref={ref} title={full ?? undefined}>
        {children}
      </span>
    </span>
  )
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

/* A tablist that is actually one.

   This had `role="tablist"` and `aria-selected` and nothing else — no
   tabIndex, no key handler, no ids, no `aria-controls`, and no panel anywhere
   in the app carrying `role="tabpanel"`. Every tab was a tab stop where the
   pattern allows exactly one, and the arrow keys did nothing. It had zero call
   sites, so none of that had ever been noticed.

   Now: roving tabindex, Arrow/Home/End moving selection and focus together, and
   `aria-controls` pointing at a panel the caller labels back with `panelId`.

   `sub` is a second line under the label — what the tab's own half currently
   says, so the half you are not looking at still reports itself. */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  name,
  panelId,
  className,
}: {
  value: T
  options: { value: T; label: string; count?: number; sub?: ReactNode; icon?: LucideIcon }[]
  onChange: (v: T) => void
  name: string
  /** The `id` of the element this tablist controls, if there is one. */
  panelId?: string
  className?: string
}) {
  const uid = useId()
  const tabId = (v: T) => `${uid}-${v}`
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const step = (dir: 1 | -1 | 'first' | 'last') => {
    const i = options.findIndex((o) => o.value === value)
    const next =
      dir === 'first' ? 0 : dir === 'last' ? options.length - 1 : (i + dir + options.length) % options.length
    const target = options[next]
    if (!target) return
    onChange(target.value)
    /* Selection and focus move together — the automatic-activation flavour of
       the pattern, which is right here because switching panes is free. */
    refs.current[target.value]?.focus()
  }

  return (
    <div className={`bx-tabs ${className ?? ''}`} role="tablist" aria-label={name}>
      {options.map((o) => {
        const on = value === o.value
        const Ico = o.icon
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[o.value] = el
            }}
            id={tabId(o.value)}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            className={`bx-tabs__tab ${on ? 'is-on' : ''}`}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as const
              const d = map[e.key as keyof typeof map]
              if (d) {
                e.preventDefault()
                step(d)
              } else if (e.key === 'Home') {
                e.preventDefault()
                step('first')
              } else if (e.key === 'End') {
                e.preventDefault()
                step('last')
              }
            }}
          >
            {on && <motion.span layoutId={`tabs-${name}`} className="bx-tabs__bg" transition={{ type: 'spring', stiffness: 600, damping: 44 }} />}
            <span className="bx-tabs__label">
              {Ico && <Ico size={13} strokeWidth={1.9} aria-hidden />}
              {o.label}
              {o.count !== undefined && <em>{o.count}</em>}
            </span>
            {o.sub && <span className="bx-tabs__sub">{o.sub}</span>}
          </button>
        )
      })}
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
/* A number that counts to its new value.

   The animation is decoration; the number is not. So this never lets the
   animation be the only path to the truth: a safety timer lands the exact value
   whether or not a single frame ever arrives, and reduced-motion skips straight
   to it.

   That is not hypothetical. `requestAnimationFrame` is suspended in background
   tabs, in some embedded webviews, and in at least one browser pane that still
   reports `visibilityState: 'visible'` — and this component is what prints how
   many people a policy governs. A frozen audience count is not a missing
   flourish, it is a wrong number sitting next to the chips that contradict it. */
export function Counter({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const raf = useRef(0)
  const timer = useRef(0)
  const from = useRef(value)
  const start = useRef(0)

  useEffect(() => {
    if (value === display) return

    const still =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (still) {
      setDisplay(value)
      return
    }

    from.current = display
    start.current = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start.current) / 420)
      const eased = 1 - Math.pow(1 - t, 5)
      setDisplay(Math.round(from.current + (value - from.current) * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    // Longer than the animation, so it only ever fires when the frames did not.
    timer.current = window.setTimeout(() => setDisplay(value), 520)

    return () => {
      cancelAnimationFrame(raf.current)
      window.clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span className={className}>{display.toLocaleString()}</span>
}

/* -----------------------------------------------------------------------------
   Number stepper.

   Replaces the bare `input type="number"` that every bounded setting used to
   render: a 96px box, the unit floating loose beside it, and the permitted
   range printed in a chip that wrapped to two lines — "5-" over "30" — as soon
   as the unit was longer than a word.

   The wrap is the least of it. The old field CLAMPED ON EVERY KEYSTROKE, which
   made most of its own range untypable: in a 5-30 field, typing "12" clamps the
   "1" up to 5, leaving "52", which clamps back down to 30. You could not type
   twelve. Keystrokes go into a draft string here and the clamp happens on blur
   or Enter — the only moment a typed number is finished.

   The bounds are then enforced by the buttons rather than announced by a label:
   minus dies at the floor, plus at the ceiling. So the range only has to appear
   while the field is being edited. And a clamped correction flashes, because
   silently rewriting what somebody typed is how they end up holding a value
   they did not choose and did not see arrive.

   The shape is the one dense settings forms converge on — steppers inside the
   field, unit as an inline suffix. Contra, Tailscale and Wellfound all land
   there. Airbnb's big centred plus/minus is right for a booking flow showing
   one number and far too heavy for a form of twenty-six fields. */

const DIGITS = /^[0-9]*$/

export function NumberStepper({
  id,
  value,
  min,
  max,
  step = 1,
  unit,
  label,
  invalid,
  onChange,
}: {
  id?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  label?: string
  invalid?: boolean
  onChange: (n: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [corrected, setCorrected] = useState(false)
  const latest = useRef(value)
  const hold = useRef(0)
  const flash = useRef(0)

  /* The hold-to-repeat timer chain outlives the render that started it, so it
     reads the current value through a ref rather than closing over a stale one. */
  useEffect(() => {
    latest.current = value
  })
  useEffect(
    () => () => {
      window.clearTimeout(hold.current)
      window.clearTimeout(flash.current)
    },
    [],
  )

  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  const say = () => {
    setCorrected(true)
    window.clearTimeout(flash.current)
    flash.current = window.setTimeout(() => setCorrected(false), 520)
  }

  const nudge = (delta: number) => {
    const typed = draft !== null && draft.trim() !== '' ? Number(draft) : NaN
    const from = Number.isFinite(typed) ? typed : latest.current
    const next = clamp(from + delta)
    setDraft(null)
    if (next !== latest.current) onChange(next)
  }

  /* Press and hold accelerates. Attempt Timeout runs 5-120; walking there one
     click at a time is a hundred and fifteen clicks. */
  const startHold = (delta: number) => {
    nudge(delta)
    let wait = 380
    const tick = () => {
      nudge(delta)
      wait = Math.max(45, wait * 0.7)
      hold.current = window.setTimeout(tick, wait)
    }
    hold.current = window.setTimeout(tick, wait)
  }
  const endHold = () => window.clearTimeout(hold.current)

  const commit = (raw: string) => {
    setDraft(null)
    if (raw.trim() === '') return
    const next = clamp(Number(raw))
    if (next !== Number(raw)) say()
    if (next !== value) onChange(next)
  }

  const atMin = value <= min
  const atMax = value >= max
  const shown = draft ?? String(value)

  return (
    <span className="bx-stepwrap">
      <span
        className={`bx-step ${focused ? 'is-focus' : ''} ${invalid ? 'is-invalid' : ''} ${
          corrected ? 'is-corrected' : ''
        }`}
      >
        <button
          type="button"
          className="bx-step__btn"
          disabled={atMin}
          aria-label={`Decrease${label ? ` ${label}` : ''}`}
          tabIndex={-1}
          onPointerDown={(e) => {
            e.preventDefault()
            startHold(-step)
          }}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          /* Keyboard activation only — a pointer press has already stepped, and
             a detail of 0 is how a synthetic click says it came from a key. */
          onClick={(e) => e.detail === 0 && nudge(-step)}
        >
          <Minus size={14} strokeWidth={2.3} aria-hidden />
        </button>

        <span className="bx-step__val">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            role="spinbutton"
            aria-label={label}
            aria-valuenow={value}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuetext={unit ? `${value} ${unit}` : undefined}
            aria-invalid={invalid}
            value={shown}
            style={{ '--bx-digits': String(max).length } as CSSProperties}
            onChange={(e) => DIGITS.test(e.target.value) && setDraft(e.target.value)}
            onFocus={(e) => {
              setFocused(true)
              e.target.select()
            }}
            onBlur={(e) => {
              setFocused(false)
              commit(e.target.value)
            }}
            onKeyDown={(e) => {
              const by = e.shiftKey ? step * 10 : step
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                nudge(by)
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                nudge(-by)
              } else if (e.key === 'Home') {
                e.preventDefault()
                setDraft(null)
                onChange(min)
              } else if (e.key === 'End') {
                e.preventDefault()
                setDraft(null)
                onChange(max)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                commit(e.currentTarget.value)
              } else if (e.key === 'Escape') {
                setDraft(null)
              }
            }}
          />
          {unit && <em>{unit}</em>}
        </span>

        <button
          type="button"
          className="bx-step__btn"
          disabled={atMax}
          aria-label={`Increase${label ? ` ${label}` : ''}`}
          tabIndex={-1}
          onPointerDown={(e) => {
            e.preventDefault()
            startHold(step)
          }}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          onClick={(e) => e.detail === 0 && nudge(step)}
        >
          <Plus size={14} strokeWidth={2.3} aria-hidden />
        </button>
      </span>

      {/* The range, while it is being edited. Printed permanently it is the chip
          that wrapped; removed altogether it is a rule you find by breaking it.
          Always rendered and faded, so nothing below it moves. */}
      <span className="bx-step__hint" data-on={focused || corrected} aria-hidden>
        {corrected ? `Must be ${min}-${max}` : `${min}-${max}${unit ? ` ${unit}` : ''}`}
      </span>
    </span>
  )
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

/* The same dot, on a span rather than a button.

   `TipDot` is a button, so it cannot go inside one — nested buttons are invalid
   HTML and React refuses to hydrate them. Rows that are themselves one big
   button still want a "why" beside a name, which is the case this exists for.

   The trigger is aria-hidden and not focusable, so it is a mouse affordance
   only. Anything placed behind it must therefore also reach a keyboard: put the
   same words in the enclosing control's accessible name (`.u-sr-only`), rather
   than treating the hover as the only way to the sentence. */
export function TipMark({ text }: { text: ReactNode }) {
  return (
    <Tip text={text}>
      <span className="bx-tipdot" aria-hidden>
        ?
      </span>
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

/* Every dialog currently open, innermost last.

   Module-level rather than a context because it is answering a window-level
   question — "who owns Escape right now" — and the dialogs that stack are not
   always in one another's React tree: a picker portalled to the body sits
   inside a dialog visually and beside it in the DOM. */
const openDialogs: symbol[] = []

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

    /* This dialog's place in the stack.

       Every open Modal used to listen for Escape on the window and close
       itself, so two of them open at once meant one Escape closed both — back
       out of a picker opened from inside a dialog and the dialog went with it,
       losing whatever was being edited. Pushing an identity here and answering
       only when this dialog is the innermost one makes Escape peel one layer,
       which is what it means everywhere else in the product. */
    const me = Symbol('dialog')
    openDialogs.push(me)

    // Focus the panel itself rather than its first control: dialogs here open
    // with a heading, and starting on a button skips the sentence that says
    // what the dialog is for.
    const id = window.requestAnimationFrame(() => panel.current?.focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openDialogs[openDialogs.length - 1] !== me) return
        return onCloseRef.current()
      }
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
      const at = openDialogs.indexOf(me)
      if (at !== -1) openDialogs.splice(at, 1)
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
