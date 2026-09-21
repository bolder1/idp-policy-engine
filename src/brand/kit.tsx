import type { KeyboardEvent as ReactKeyboardEvent, Ref } from 'react'
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
import { useLayoutEffect } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Info,
  type LucideIcon,
  Minus,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import type { AccessDecision, PolicyStatus } from './data'
import { appRoot, useDialogChrome } from './dialog-chrome'
import { ChangeList, ChangeSection, type ChangeItem } from './change-list'
import { groupSections, reviewItemName, type ReviewKind, type ReviewLine } from './review-rows'
import { useReviewView, type ReviewView } from './review-view'
import { SHOWCASE } from './showcase'

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

export type ButtonVariant = 'primary' | 'secondary' | 'brand' | 'neutral' | 'ghost' | 'danger' | 'link'

const ROLE: Record<ButtonVariant, string> = {
  primary: 'brand',
  brand: 'brand',
  secondary: 'neutral',
  neutral: 'neutral',
  ghost: 'ghost',
  danger: 'danger',
  /* A text button in the link colour — an action that takes you somewhere to do
     something, on a row where a boxed button would outweigh the switches beside
     it. */
  link: 'link',
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

/* The one delete button. The page-header trigger and the confirmation's own
   button are the same control — red outline, trash icon, the word Delete — so
   deleting looks the same wherever it starts and wherever it is confirmed. */
export function DeleteButton({
  onClick,
  size = 'sm',
  disabled,
  title,
  children = 'Delete',
}: {
  onClick?: () => void
  size?: 'sm' | 'md'
  disabled?: boolean
  title?: string
  children?: ReactNode
}) {
  return (
    <Button variant="danger" size={size} icon={Trash2} disabled={disabled} title={title} onClick={onClick}>
      {children}
    </Button>
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
  /* `iconOnly` without an `icon` used to render an EMPTY button — no glyph, no
     label, no chevron — and the risk-profile table shipped one: three rows of
     blank 28px boxes in the Actions column, clickable, opening a real menu that
     nothing on screen suggested was there. `iconOnly` means the icon is the
     whole control, so a missing one is a contradiction the component answers
     rather than draws. The overflow glyph is the same one the three callers
     that DO pass it chose. */
  const Glyph = icon ?? (iconOnly ? MoreHorizontal : undefined)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const pop = useRef<HTMLDivElement | null>(null)
  /* Which item takes focus when the menu opens: ArrowUp on the trigger starts
     at the bottom, everything else at the top. */
  const startAt = useRef<'first' | 'last'>('first')
  const id = useId()

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    /* Escape with focus outside the menu (the menu's own handler takes it when
       focus is inside). Stopped, so a dialog underneath stays open. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  /* Focus goes INTO the menu, so the arrow keys, Enter and Escape reach it.
     It used to stay on the trigger with a painted cursor, and the menu's own
     key handler never heard a key. */
  useEffect(() => {
    if (open) focusMenuItem(pop.current, startAt.current)
  }, [open])

  const pick = (item: MenuItem) => {
    if (item.disabled) return
    close(true)
    onSelect(item.id)
  }

  return (
    <span className="bx-menu" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className={`bx-btn bx-btn--${ROLE[variant]} bx-btn--${size} bx-menu__trigger ${iconOnly ? 'bx-menu__trigger--icon' : ''} ${open ? 'is-open' : ''}`}
        aria-label={iconOnly ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          startAt.current = 'first'
          setOpen((v) => !v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            startAt.current = e.key === 'ArrowUp' ? 'last' : 'first'
            if (open) focusMenuItem(pop.current, startAt.current)
            else setOpen(true)
          }
        }}
      >
        {Glyph && <MenuIcon icon={Glyph} size={size} />}
        {!iconOnly && label}
        {!iconOnly && <ChevronDown size={size === 'sm' ? 12 : 13} strokeWidth={2.2} aria-hidden />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={pop}
            id={id}
            role="menu"
            aria-label={label}
            className={`bx-menu__pop is-${align}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.13, ease: [0.2, 0, 0, 1] }}
            onKeyDown={(e) => menuKeys(e, pop.current, close)}
          >
            <MenuItems items={items} onPick={pick} />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

function MenuIcon({ icon: Icon, size }: { icon: LucideIcon; size: 'sm' | 'md' }) {
  return <Icon size={size === 'sm' ? 13 : 14} strokeWidth={2} aria-hidden />
}

/* --- Shared by MenuButton and RowMenu ------------------------------------------ */

const menuItemsIn = (pop: HTMLElement | null) =>
  Array.from(pop?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])

function focusMenuItem(pop: HTMLElement | null, at: 'first' | 'last') {
  const list = menuItemsIn(pop)
  ;(at === 'last' ? list[list.length - 1] : list[0])?.focus({ preventScroll: true })
}

/* Arrow keys, Home and End move real focus among the enabled items; Escape and
   Tab close and hand focus back to the trigger. Escape is stopped here so the
   dialog underneath a menu does not close with it. */
function menuKeys(e: ReactKeyboardEvent, pop: HTMLElement | null, close: (refocus: boolean) => void) {
  const list = menuItemsIn(pop)
  const at = list.indexOf(document.activeElement as HTMLButtonElement)
  const move = (i: number) => list[(i + list.length) % list.length]?.focus({ preventScroll: true })
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(at + 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      move(at < 0 ? -1 : at - 1)
      break
    case 'Home':
      e.preventDefault()
      move(0)
      break
    case 'End':
      e.preventDefault()
      move(-1)
      break
    case 'Escape':
      e.preventDefault()
      e.stopPropagation()
      close(true)
      break
    case 'Tab':
      e.preventDefault()
      close(true)
      break
  }
}

function MenuItems({ items, onPick }: { items: MenuItem[]; onPick: (item: MenuItem) => void }) {
  return (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          tabIndex={-1}
          disabled={item.disabled}
          className={`bx-menu__item ${item.danger ? 'is-danger' : ''} ${item.divide ? 'is-divided' : ''}`}
          /* Hover moves focus, so the pointer and the keys share one highlight
             rather than painting two. */
          onMouseEnter={(e) => {
            if (!item.disabled) e.currentTarget.focus({ preventScroll: true })
          }}
          onClick={(e) => {
            e.stopPropagation()
            onPick(item)
          }}
        >
          {item.icon && <item.icon size={14} strokeWidth={1.9} aria-hidden />}
          <span>
            <strong>{item.label}</strong>
            {item.hint && <em>{item.hint}</em>}
          </span>
          {item.kbd && <kbd>{item.kbd}</kbd>}
        </button>
      ))}
    </>
  )
}

/* --- Row menu ---------------------------------------------------------------------

   The kebab at the end of a list or table row, and the one menu it opens.

   Policies, Applications, Zones, Device profiles and Risk profiles each drew
   their own: an absolutely placed box inside the row. Inside a table scroller
   that box was clipped — with one to three rows, or on the last rows, the items
   were cut off or unreachable — and each copy handled Escape, outside clicks and
   focus differently or not at all.

   This one portals to the app root at fixed coordinates measured from the
   trigger, so no ancestor can clip it. It opens below the kebab and flips above
   when the viewport has no room below; it closes on an outside press, Escape,
   Tab, a scroll or a resize; the arrow keys, Home and End move through the
   items; and focus returns to the kebab when it closes. A pick focuses the
   kebab before running the action, so a dialog the action opens restores focus
   to it. */

const ROWMENU_GAP = 4
const ROWMENU_MARGIN = 8

export function RowMenu({
  label,
  items,
  onSelect,
  onOpenChange,
  icon: Icon = MoreHorizontal,
  size = 'sm',
  align = 'end',
  disabled,
}: {
  /** The accessible name, naming the row: "Actions for Corporate network". */
  label: string
  items: MenuItem[]
  onSelect: (id: string) => void
  /** Told when the menu opens or closes, for a row that stays highlighted while it is open. */
  onOpenChange?: (open: boolean) => void
  icon?: LucideIcon
  size?: 'sm' | 'md'
  /** Which edge of the kebab the menu lines up with. */
  align?: 'start' | 'end'
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; side: 'top' | 'bottom' } | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const pop = useRef<HTMLDivElement | null>(null)
  const startAt = useRef<'first' | 'last'>('first')
  const id = useId()

  const onOpenChangeRef = useRef(onOpenChange)
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  })

  /* Reported after the fact, from an effect, so a caller's state update never
     runs inside this component's render. */
  const reported = useRef(false)
  useEffect(() => {
    if (reported.current === open) return
    reported.current = open
    onOpenChangeRef.current?.(open)
  }, [open])

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus({ preventScroll: true })
  }, [])

  /* Measured once the menu is in the DOM (rendered hidden at 0,0 first), so its
     real height decides whether it fits below. */
  const place = useCallback(() => {
    const a = trigger.current?.getBoundingClientRect()
    const p = pop.current?.getBoundingClientRect()
    if (!a || !p) return
    const below = window.innerHeight - a.bottom
    const above = a.top
    const side: 'top' | 'bottom' =
      below < p.height + ROWMENU_GAP + ROWMENU_MARGIN && above > below ? 'top' : 'bottom'
    const top =
      side === 'bottom'
        ? Math.min(a.bottom + ROWMENU_GAP, window.innerHeight - p.height - ROWMENU_MARGIN)
        : Math.max(ROWMENU_MARGIN, a.top - p.height - ROWMENU_GAP)
    const want = align === 'end' ? a.right - p.width : a.left
    const left = Math.max(ROWMENU_MARGIN, Math.min(want, window.innerWidth - p.width - ROWMENU_MARGIN))
    setPos((was) => (was && was.top === top && was.left === left && was.side === side ? was : { top, left, side }))
  }, [align])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    place()
  }, [open, place])

  useEffect(() => {
    if (open && pos) focusMenuItem(pop.current, startAt.current)
    // Only when it first lands, not on every re-placement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos !== null])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (trigger.current?.contains(t) || pop.current?.contains(t)) return
      close(false)
    }
    /* A scroll anywhere but inside the menu closes it: a menu left floating
       while its row scrolls away points at the wrong row. */
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && pop.current?.contains(e.target)) return
      close(false)
    }
    const onResize = () => close(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close])

  /* A row that unmounts with its menu open (deleted, filtered out) must not
     leave the page believing a menu is still open. */
  useEffect(
    () => () => {
      if (reported.current) onOpenChangeRef.current?.(false)
    },
    [],
  )

  const pick = (item: MenuItem) => {
    if (item.disabled) return
    close(true)
    onSelect(item.id)
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`bx-rowmenu bx-rowmenu--${size} ${open ? 'is-open' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={(e) => {
          /* Rows are often one big link or button; the kebab is not part of it. */
          e.stopPropagation()
          startAt.current = 'first'
          setOpen(!open)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            e.stopPropagation()
            startAt.current = e.key === 'ArrowUp' ? 'last' : 'first'
            if (open) focusMenuItem(pop.current, startAt.current)
            else setOpen(true)
          }
        }}
      >
        <Icon size={size === 'sm' ? 15 : 16} strokeWidth={2} aria-hidden />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <motion.div
            ref={pop}
            id={id}
            role="menu"
            aria-label={label}
            className={`bx-menu__pop bx-rowmenu__pop is-${pos?.side ?? 'bottom'}`}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
            onKeyDown={(e) => menuKeys(e, pop.current, close)}
            /* The menu lives in a portal but still bubbles through the row in
               React; a click inside it is not a click on the row. */
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItems items={items} onPick={pick} />
          </motion.div>,
          appRoot(),
        )}
    </>
  )
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
  className,
}: {
  children: ReactNode
  className?: string
  tone?: 'neutral' | 'brand' | 'positive' | 'negative' | 'notice' | 'info' | 'accent' | 'lime' | 'magenta' | 'system'
}) {
  /* The label is its own element rather than a bare text node because
     text-overflow does not reach an anonymous flex item — the badge stays a
     flex row so it can hold a mark beside the word, and the word gets the box
     that can be clipped. */
  const [ref, full] = useClipped(children)
  return (
    <span className={`bx-badge bx-badge--${tone}${className ? ` ${className}` : ''}`}>
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
  /* No dot. The chip is already tinted, bordered and named — see the note on
     `.bx-decision` in kit.css for why a fourth signal was removed rather than
     kept. */
  return <span className={`bx-decision bx-decision--${tone} bx-decision--${size}`}>{label}</span>
}

export function StatusPill({ status }: { status: PolicyStatus }) {
  /* Four statuses, no more: Draft, Active, Inactive, and Always on for the
     system policy. Each is a pill with no dot (owner, 14 Sep 2026) — Active and
     Always on the positive tint, Inactive the neutral fill, Draft a solid
     outline, because a draft is a state the policy has not reached yet. */
  if (status === 'always-on') return <span className="bx-status bx-status--always">Always on</span>
  if (status === 'draft')
    return (
      <span className="bx-status bx-status--draft" title="Not published yet.">
        Draft
      </span>
    )
  return (
    <span className={`bx-status bx-status--${status === 'active' ? 'active' : 'inactive'}`}>
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
  removable,
  onRemove,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  /* No count: a filter chip names the filter, and the number belongs in the
     list it filters (owner: no toolbar counts). */
  removable?: boolean
  onRemove?: () => void
}) {
  return (
    <span className={`bx-chip ${active ? 'is-on' : ''} ${onClick ? 'is-clickable' : ''}`}>
      <button type="button" onClick={onClick} disabled={!onClick} className="bx-chip__main">
        {children}
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
  /* No `count`. A tab names a view; the number belongs in the view it opens. */
  options: { value: T; label: string; sub?: ReactNode; icon?: LucideIcon }[]
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

const CALLOUT_ICON = {
  info: Info,
  notice: AlertTriangle,
  negative: AlertOctagon,
  positive: CheckCircle2,
} as const

function CalloutIcon({ tone }: { tone: keyof typeof CALLOUT_ICON }) {
  const Icon = CALLOUT_ICON[tone]
  return <Icon className="bx-callout__mark" size={16} strokeWidth={2} aria-hidden />
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
      {/* An icon, not a coloured dot. The dot repeated what the tint and the
          border already said and carried nothing of its own; a mark that
          differs per tone is the one part of a callout you can read before you
          read the sentence. */}
      <CalloutIcon tone={tone} />
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
  width = 'auto',
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
  /** `fill` is the console's own number field: the box takes the width it is
      given, the value sits left, and the two steps stack as chevrons inside the
      right edge. `auto` is the dense form shape — minus, value, plus — sized to
      its digits. Same control, same keys, same hold-to-repeat. */
  width?: 'auto' | 'fill'
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
  const fill = width === 'fill'

  return (
    <span className={`bx-stepwrap ${fill ? 'bx-stepwrap--field' : ''}`}>
      <span
        className={`bx-step ${fill ? 'bx-step--field' : ''} ${focused ? 'is-focus' : ''} ${
          invalid ? 'is-invalid' : ''
        } ${corrected ? 'is-corrected' : ''}`}
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
          {fill ? (
            <ChevronDown size={14} strokeWidth={2.3} aria-hidden />
          ) : (
            <Minus size={14} strokeWidth={2.3} aria-hidden />
          )}
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
          {fill ? (
            <ChevronUp size={14} strokeWidth={2.3} aria-hidden />
          ) : (
            <Plus size={14} strokeWidth={2.3} aria-hidden />
          )}
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
      {/* The press stops here. The mark lives inside a row-sized button, and on
          a touch screen the tap that opens the tip is also a click — which
          bubbled to the row and ticked or unticked it while you were only asking
          what it was. */}
      <span className="bx-tipdot" aria-hidden onClick={(e) => e.stopPropagation()}>
        ?
      </span>
    </Tip>
  )
}

/* -----------------------------------------------------------------------------
   The search box, once.

   There were five of them. Zones wrapped a bare input in a label with a
   magnifier and sized it 380px; policies, applications and device profiles used
   a plain `<input type="search">` at 260px with no icon; risk signals had its
   own copy of the zones markup under a `.brs__` name. So the one control an
   administrator reaches for on every list screen changed its width, its glyph
   and its affordance depending on which screen they were on — and the zones one
   read as the odd one out because it was the only box on the console with
   something inside it.

   One component, one width, one glyph. The icon is decorative — `aria-label`
   on the input carries the name, and a magnifier announced as "search" beside
   a field announced as "Search zones" says it twice.

   `type="search"` and not `text`: it brings the browser's own clear button,
   which is the affordance that empties a filter without selecting the text
   first. Zones was on `text` and had to offer a "Clear" link in the empty
   state to make up for it.
   -------------------------------------------------------------------------- */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  block,
  inputRef,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  /** The accessible name — "Search zones", not "Search". */
  label: string
  /** The input itself, for a caller that puts focus back here (after Clear filters, say). */
  inputRef?: Ref<HTMLInputElement>
  /* Full width of whatever holds it. A toolbar gives the box a fixed width so
     the row does not reflow as the page does; a dialog or a drawer has already
     decided how wide the column is, and a 300px box inside a 520px panel is a
     box that looks like it failed to load. */
  block?: boolean
}) {
  return (
    <label className={`bx-search ${block ? 'is-block' : ''}`}>
      <Search size={14} strokeWidth={2} aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

/* `InfoDot` stood here — the "something is wrong with this row" mark.

   It went with `Policy.configIssue`, which was its only caller on either side
   of this merge: the policies table and the app-protection panel both rendered
   it for that one field, and the field described a state this product does not
   have. A policy that is not finished is a DRAFT, which the status column says
   in a word.

   Main had just improved it — from an 8px unlabelled dot, which COMPONENTS.md
   rules out, to the notice triangle with the sentence on hover, on focus and in
   the accessible name. That was the right fix for the control and it does not
   survive the removal of the thing the control was for. Worth recording that
   the dot was wrong on its own terms as well, in case anything like it is
   proposed again: a mark you must hover to read is a worse way to say something
   the row can state outright. */

export function Drawer({
  open,
  onClose,
  title,
  caption,
  head,
  actions,
  children,
  width = DIALOG_W.confirm,
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

  const panel = useRef<HTMLElement | null>(null)
  useDialogChrome(open, onClose, panel)

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
            aria-modal="true"
            aria-label={title}
            ref={panel}
            tabIndex={-1}
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
              <DialogClose onClose={onClose} />
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

/* --- How wide a dialog is ------------------------------------------------------

   Fifteen widths were in use across twenty-five surfaces: 460, 480, 520, 540,
   560, 600, 620, 640, 680, 720, 760, 780, 860, 960, 980. Some of that spread is
   real — a confirmation and the gauntlet are not the same object — but most of
   it was two people picking a number forty pixels apart for the same job, and
   the result is that no two dialogs in the console line up when you open them
   one after another.

   Five steps, each with a job:

     confirm  480  one question and two buttons
     form     560  a short form, one column
     wide     680  a form with structure — sections, a list beside a field
     work     780  two panes, or a table that needs its columns
     full     980  a workspace: the gauntlet's cards, a decision log

   Drawers take the same scale. A side panel and a centred dialog are different
   shapes but they answer the same question — how much room does this need —
   and a console where those two vocabularies disagree is a console where the
   app-protection panel and the dialog it opens are 40px out of step.

   Not exported: `kit.tsx` exports components, and a constant leaving it costs
   fast refresh for every component in the file. It lives here, beside the two
   surfaces it sizes, because that is where somebody adding a third one looks.
   Call sites pass the number; this is the list of numbers that exist. */
const DIALOG_W = { confirm: 480, form: 560, wide: 680, work: 780, full: 980 } as const

/* The dialog stack, Escape ownership, the focus trap and focus restoration live
   in dialog-chrome.ts — shared by Modal, Drawer and any sheet a screen draws
   itself, and importable without costing this file fast refresh. */

/** The close control every dialog surface carries. */
function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="bx-dialog__x" onClick={onClose} aria-label="Close">
      <X size={17} strokeWidth={2} aria-hidden />
    </button>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = DIALOG_W.form,
  padded = true,
  head,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: number
  padded?: boolean
  /** Controls beside the title, before the close button. */
  head?: ReactNode
}) {
  const panel = useRef<HTMLDivElement | null>(null)
  useDialogChrome(open, onClose, panel)

  /* Portalled to the app root. Rendered in place, a dialog opened from inside a
     slide-over, a sticky table cell or anything with a transform was positioned
     and stacked by that ancestor: it opened under the slider, and Delete, Save
     and Discard could not be clicked. At the root it always covers the window.
     React events still bubble through the tree it was opened from. */
  if (typeof document === 'undefined') return null
  return createPortal(
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
              {head && <div className="bx-modal__extra">{head}</div>}
              <DialogClose onClose={onClose} />
            </header>
            <div className={`bx-modal__body ${padded ? '' : 'is-flush'}`}>{children}</div>
            {footer && <footer className="bx-modal__foot">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    appRoot(),
  )
}

/* --- The unsaved footer ----------------------------------------------------

   One strip at the bottom of the page column, present only while a draft
   differs from what is stored. (It floated, bottom centre, until 15 Sep 2026.)

   This existed with no callers, built for a policy builder that ended up doing
   its committing elsewhere — the button said "Review & enforce". Three screens
   now edit a named object through a local draft (device profiles, zones, risk
   profiles), and rather than write a second bar beside a dead one, the dead one
   became the shared one. What survived from it is the part worth keeping: it
   NAMES what changed rather than saying "unsaved changes", and it caps the
   naming at two so a long edit does not produce a long strip.

   `changes` rather than a boolean, for that reason. "You have unsaved changes"
   is true of every form ever built; "name · 3 added" is the thing somebody is
   being asked to confirm — and on a tabbed or scrolling page it is what names
   edits made where they cannot currently see them. */
/** One line of a draft's review: what changed, as it was and as it will be saved.
    The optional fields (section, kind, name inside the section, consequence)
    are `ReviewLine`'s — see review-rows.ts. */
export interface ReviewRow extends Omit<ReviewLine, 'before' | 'after'> {
  before: ReactNode
  after: ReactNode
}

/* Review changes: the draft against what is saved, before committing it.

   Settled on 18 Sep 2026, after a carded version (filled green / blue / red
   cells, a coloured disc on every row) read as loud and a kind-first one
   ("Added" once, every section's rows pooled under it) lost which step a change
   belonged to. What it is now:

     - An accordion per page section (`groupSections`), consequences last under
       "Also changes", and inside each one a tinted chip per kind over its rows.
       A change stays in the step it belongs to.
     - A row is a name and its value on one line, close together, and the value
       carries the kind's ink.
     - Two layouts behind a switch in the header, remembered per viewer
       (`review-view.ts`): Before & after, and List — what will be saved and
       nothing else. The body is `ChangeList`, shared with the device profile
       wizard's Review.

   Keep editing goes back to the page with the draft intact. No Discard:
   leaving the page already asks Save, Discard or Keep editing. */
export function ReviewChanges({
  open,
  rows,
  onClose,
  onSave,
  saveLabel = 'Save changes',
  blocked = false,
  blockedReason,
}: {
  open: boolean
  rows: ReviewRow[]
  onClose: () => void
  onSave: () => void
  saveLabel?: string
  blocked?: boolean
  blockedReason?: string
}) {
  /* The showcase build is always the List — the chosen layout — and hides the
     comparison switch (see showcase.ts). */
  const [storedView, setView] = useReviewView()
  const view = SHOWCASE ? 'list' : storedView
  const sections = groupSections(rows)
  /* Sections open, because a review that hides what it is reviewing is not a
     review. Past this many ROWS one section starts open and the rest shut —
     rows, not counted changes, because it is rows that make the dialog long: a
     zone's single "10.0.0.2, 10.0.0.3 and 12 more" row counts fifteen changes
     and takes one line.

     The one left open is the biggest, not the first. The first is General — the
     Name row — on every rename and every create, so "open the first" opened a
     one-row section and shut everything worth reading. */
  const rowsIn = (x: (typeof sections)[number]) => x.blocks.reduce((n, b) => n + b.rows.length, 0)
  const many = sections.reduce((n, x) => n + rowsIn(x), 0) > REVIEW_OPEN_ALL
  const openAt = sections.reduce((best, x, i) => (rowsIn(x) > rowsIn(sections[best]) ? i : best), 0)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review changes"
      /* The before-and-after columns need the width; the list does not, and at
         780 a name and its value sat too far apart (owner, 18 Sep 2026). */
      width={view === 'list' ? DIALOG_W.wide : DIALOG_W.work}
      padded={false}
      head={SHOWCASE ? undefined : <ReviewViewSwitch value={view} onChange={setView} />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep editing
          </Button>
          <Button
            variant="brand"
            disabled={blocked}
            title={blocked ? blockedReason : undefined}
            onClick={() => {
              onSave()
              onClose()
            }}
          >
            {saveLabel}
          </Button>
        </>
      }
    >
      <div className="bx-rv">
        {blocked && blockedReason && <p className="bx-review__blocked">{blockedReason}</p>}
        {rows.length === 0 ? (
          <p className="bx-review__none">Nothing has changed.</p>
        ) : (
          <ChangeList layout={view}>
            {sections.map((section, i) => {
              const title = section.effect ? EFFECT_TITLE : section.title
              return (
                <ChangeSection
                  key={section.effect ? 'effect' : section.title}
                  layout={view}
                  collapsible
                  defaultOpen={!many || i === openAt}
                  title={title}
                  summary={changeCount(section.count)}
                  blocks={section.blocks.map((block) => ({
                    tone: block.kind,
                    label: REVIEW_KIND_WORD[block.kind],
                    mark: REVIEW_MARK[block.kind],
                    items: block.rows.map((r, n) =>
                      reviewItem(r, block.kind, title, `${section.title}-${block.kind}-${n}`),
                    ),
                  }))}
                />
              )
            })}
          </ChangeList>
        )}
      </div>
    </Modal>
  )
}

/* The chip over a block of rows. A consequence is not something the admin did,
   so it says so. */
const REVIEW_KIND_WORD: Record<ReviewKind | 'effect', string> = {
  added: 'Added',
  changed: 'Changed',
  removed: 'Removed',
  effect: 'Happens for you',
}
/* The consequences section, whatever the rows called it. */
const EFFECT_TITLE = 'Also changes'
const REVIEW_OPEN_ALL = 12
const REVIEW_MARK: Record<ReviewKind | 'effect', LucideIcon> = {
  added: Plus,
  changed: PenLine,
  removed: Minus,
  effect: CornerDownRight,
}

/* A row as the list draws it. An added row has nothing before and a removed one
   nothing after, whatever the producer put there.

   A row named after the section it sits in has no name of its own: a zone's
   list rows are "IP networks: added", which under the IP networks section with
   an Added chip over it would say the phrase three times. The value takes the
   line instead. */
function reviewItem(r: ReviewRow, kind: ReviewKind | 'effect', section: string, id: string): ChangeItem {
  const name = reviewItemName(r)
  return {
    id,
    name: name === section ? undefined : name,
    before: kind === 'added' ? null : r.before,
    after: kind === 'removed' ? null : r.after,
    leaving: kind === 'removed',
  }
}

/** "3 changes" — a section's own count, which a row may add several to. */
const changeCount = (n: number): string => `${n} ${n === 1 ? 'change' : 'changes'}`

const REVIEW_VIEWS: { value: ReviewView; label: string }[] = [
  { value: 'compare', label: 'Before & after' },
  { value: 'list', label: 'List' },
]

/* The prototype's comparison switch, in the dialog's header. The page bar's
   segments (`.bseg`), written out here because the kit sits under the screens. */
function ReviewViewSwitch({ value, onChange }: { value: ReviewView; onChange: (v: ReviewView) => void }) {
  return (
    <div className="bseg bx-rv__views" role="group" aria-label="Review layout">
      {REVIEW_VIEWS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={value === o.value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* Where focus goes when the bar leaves with focus inside it — after Save or
   Discard. Back to what was focused before the bar was reached, or else the
   page's heading, never <body>. */
function focusPageHeading(from: Element | null) {
  const scope =
    from?.closest('[role="dialog"]') ??
    document.querySelector('.bshell__main') ??
    document.querySelector('.bus__main') ??
    document.body
  const h = scope.querySelector<HTMLElement>('h1') ?? scope.querySelector<HTMLElement>('h2')
  if (!h) return
  if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1')
  h.focus({ preventScroll: true })
}

/* The page column a save footer pins to: the console's scrolling main, or the
   end-user shell's. Looked up after mount, because the footer is portalled into
   it rather than rendered where the screen happens to call it. */
function footerHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>('.bshell__main') ?? document.querySelector<HTMLElement>('.bus__main')
}

/* The save footer.

   A full-width strip pinned to the bottom of the page column, present only
   while a draft differs from what is stored — so an untouched page opens clean,
   and the footer arrives with the first edit.

   It was a floating card, bottom centre, with Discard, Review changes and Save.
   Three buttons for one decision, and a card that sat over the last row of the
   page. Now:

   - A footer, not a float. It is the last child of the scrolling column and
     `sticky` to its bottom, so on a short page it sits at the bottom of the
     window and on a long one it stays pinned while the page scrolls under it —
     and, being in the flow, it never covers the last control.
   - One button. Given review rows it says "Review & save" and opens Review
     changes, whose primary commits; without rows it saves directly.
   - No Discard. Every way off the page asks first (the leave dialog offers
     Discard), so a red button beside Save was a second, easier way to lose work. */
export function SaveBar({
  open,
  changes,
  onSave,
  saveLabel = 'Save changes',
  /** Blocks the save without hiding the footer — for a draft that is not valid yet. */
  blocked = false,
  blockedReason,
  review,
}: {
  open: boolean
  /** Short names for what changed: "Name", "IP networks". The first two are shown. */
  changes: string[]
  onSave: () => void
  /** The commit's label: on the button when there is nothing to review, in Review changes otherwise. */
  saveLabel?: string
  blocked?: boolean
  /** Why Save is blocked. Shown in the footer in place of the change list, and on the button. */
  blockedReason?: string
  /** The draft against what is saved. Given and not empty, the one button reviews before saving. */
  review?: ReviewRow[]
}) {
  const [reviewing, setReviewing] = useState(false)
  const bar = useRef<HTMLDivElement | null>(null)
  const cameFrom = useRef<HTMLElement | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setHost(footerHost())
  }, [])

  /* A bar that closes also closes its review, so the dialog never reopens by
     itself the next time the page becomes dirty. */
  useEffect(() => {
    if (!open) setReviewing(false)
  }, [open])

  /* Save and Discard remove the bar with focus on one of its buttons, which
     dropped keyboard users to <body>. Runs after the review dialog has put focus
     back on the bar, so it covers both paths. */
  useEffect(() => {
    if (open) return
    const el = bar.current
    const active = document.activeElement
    if (!el || !active || !el.contains(active)) return
    const back = cameFrom.current
    if (back?.isConnected && !el.contains(back)) back.focus({ preventScroll: true })
    else focusPageHeading(el)
  }, [open])

  const parts = changes.filter(Boolean)
  const shown = parts.slice(0, 2).join(' · ') + (parts.length > 2 ? ` · +${parts.length - 2} more` : '')
  const reason = blocked && blockedReason ? blockedReason : null
  const reviews = !!review && review.length > 0

  /* Nothing to review can leave a review open: it closes with the rows. */
  useEffect(() => {
    if (!reviews) setReviewing(false)
  }, [reviews])

  const footer = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={bar}
          className="bx-savebar"
          /* Opacity only. The footer takes its line in the column as it
             arrives, so a slide would move the page twice. */
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
          onFocus={(e) => {
            const from = e.relatedTarget as HTMLElement | null
            /* Not from inside the footer, and not from a dialog that is closing. */
            if (from && !e.currentTarget.contains(from) && !from.closest('.bx-scrim--center')) cameFrom.current = from
          }}
        >
          {/* `status`, not `alert`, and on the words only. It reports a state
              the reader caused; an alert would interrupt a screen reader on
              every keystroke that made a form dirty, and a status region
              around the button would read its label out with it. */}
          {/* No "Unsaved changes" heading (owner, 21 Sep 2026: "not needed"). The
              footer only exists while something is unsaved, and the page head's
              ChangeState pill already says so; what is left is the one line
              worth reading — WHAT changed, or why Save is off. */}
          <span className="bx-savebar__text" role="status">
            {reason ? <span className="is-blocked">{reason}</span> : shown && <span>{shown}</span>}
          </span>
          {/* Blocked, the one button is off and the reason is the footer's
              words: a review that ends on a disabled Save is a dead end. */}
          <Button
            variant="brand"
            icon={Check}
            disabled={blocked}
            title={reason ?? undefined}
            onClick={reviews ? () => setReviewing(true) : onSave}
          >
            {reviews ? 'Review & save' : saveLabel}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {review && (
        <ReviewChanges
          open={reviewing && open && reviews}
          rows={review}
          onClose={() => setReviewing(false)}
          onSave={onSave}
          saveLabel={saveLabel}
          blocked={blocked}
          blockedReason={blockedReason}
        />
      )}
      {host ? createPortal(footer, host) : footer}
    </>
  )
}

/* --- Renaming in place ----------------------------------------------------------

   The chrome around a page heading turned into an input: the field, how many
   characters are left, and a Cancel ✕ and an Apply ✓ under its right edge. The
   console's own inline rename looks like this, and without the two buttons the
   only ways out were keys nobody is told about and a click somewhere else.

   Chrome only, plus when the edit is over. Each page keeps its own commit rules
   — a zone refuses a name in use, a profile falls back to the old name when
   emptied — so the page passes the handlers, and Enter and Escape in the input
   are still the page's to decide.

   A press anywhere in the field except the input keeps focus where it is. The
   pages commit when focus leaves, and a ✕ that blurred the field first would
   have applied the name it was pressed to throw away — and so did a press on
   the count or the gap beside ✕, which are not focusable and blurred the input
   as a click anywhere else would.

   When focus leaves is decided here, once, because three pages each worked it
   out and each got a different part of it right:
   - Leaving is focus going out of the whole field, not the input's blur. ✕ and
     ✓ are in the tab order; Tab from the input to them is still the edit, and
     closing on that blur would unmount the button focus was going to, keep the
     name the user was tabbing over to cancel, and drop focus on the body.
   - Keeping and closing are two calls, `onLeave` then `onClose`. The field is
     taller than the heading it stands in for. Closed on the mousedown that took
     focus away, the header shrinks under the pointer, the mouseup lands on
     something else, and the control pressed never gets its click. So the name
     is kept at once — a Save pressed in that same click must see it — and the
     close waits for pointerup and a task after it, which is where the click
     has already run. A leave by keyboard has no click to wait for and closes
     straight away.
   - Escape on ✕ or ✓ is Cancel. Focus is still in the edit, and the key that
     cancels in the input should not stop working a Tab later.
   Listeners are native and come off in a layout effect's cleanup, which React
   runs before it removes the field: a focusout from the field being taken away
   after Enter or Escape is never heard as a leave, so no page needs a flag to
   stop Escape's revert being undone by a second keep. */
export function NameField({
  value,
  max,
  label,
  placeholder,
  inputRef,
  className = '',
  errorId,
  invalid = false,
  onChange,
  onKeyDown,
  onLeave,
  onClose,
  onApply,
  onCancel,
}: {
  value: string
  max: number
  /** The field's accessible name: "Zone name". */
  label: string
  placeholder?: string
  inputRef?: Ref<HTMLInputElement>
  className?: string
  /** The id of the page's error line, while it shows one. */
  errorId?: string
  invalid?: boolean
  onChange: (v: string) => void
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void
  /** Focus went out of the field. Runs at once: keep the name, don't unmount. */
  onLeave?: () => void
  /** After `onLeave`, end the edit. Runs at once for a key, after the click for a press. */
  onClose?: () => void
  onApply: () => void
  onCancel: () => void
}) {
  const field = useRef<HTMLDivElement>(null)
  /* The listeners are attached once; a deferred close must reach the handlers
     of the render it runs in, not the ones the edit opened with. */
  const latest = useRef({ onLeave, onClose })
  useLayoutEffect(() => {
    latest.current = { onLeave, onClose }
  })

  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    let pressing = false
    let closing = false
    let timer = 0
    const onDown = () => {
      pressing = true
    }
    const onUp = () => {
      pressing = false
      if (!closing) return
      closing = false
      timer = window.setTimeout(() => latest.current.onClose?.())
    }
    const onOut = (e: FocusEvent) => {
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return
      latest.current.onLeave?.()
      if (pressing) closing = true
      else latest.current.onClose?.()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointerup', onUp, true)
    document.addEventListener('pointercancel', onUp, true)
    el.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointerup', onUp, true)
      document.removeEventListener('pointercancel', onUp, true)
      el.removeEventListener('focusout', onOut)
      window.clearTimeout(timer)
    }
  }, [])

  const cancelOnEscape = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    onCancel()
  }

  return (
    <div
      ref={field}
      className={`bx-namefield ${className}`}
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
      }}
    >
      <input
        ref={inputRef}
        type="text"
        className="bx-namefield__input"
        value={value}
        maxLength={max}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={errorId}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="bx-namefield__foot">
        <span className="bx-namefield__count" aria-hidden>
          {value.length}/{max}
        </span>
        <span className="bx-namefield__acts">
          <button
            type="button"
            className="bx-namefield__btn is-cancel"
            aria-label="Cancel"
            title="Cancel"
            onKeyDown={cancelOnEscape}
            onClick={onCancel}
          >
            <X size={16} strokeWidth={2.2} aria-hidden />
          </button>
          <button
            type="button"
            className="bx-namefield__btn is-apply"
            aria-label="Apply name"
            title="Apply"
            onKeyDown={cancelOnEscape}
            onClick={onApply}
          >
            <Check size={16} strokeWidth={2.4} aria-hidden />
          </button>
        </span>
      </div>
    </div>
  )
}
