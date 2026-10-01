import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

import { FOCUSABLE, appRoot } from '../../dialog-chrome'

/* -----------------------------------------------------------------------------
   A small panel hung off the control that opened it.

   Policy testing's pieces that open "a little more" in place — a token in the
   sign-in sentence, Save sign-in, What they see — all need the same thing: a
   panel under the control, never a dialog over the canvas, so the sign-in and
   the board stay in view while it is open. The placement is Picker's
   (picker.tsx), which is this codebase's proven un-clippable recipe: portalled
   to the app root, `position: fixed`, flipped only when the preferred side
   lacks room and the other has more, clamped to the main column (never over
   the rail) and then to the window, re-placed on any
   scroll (`capture: true`) and resize, hidden until measured so it is never
   seen at 0,0.

   It is `role="dialog"` without `aria-modal`, which is what the board's window
   key handler and the kit's dialog chrome already treat as a popup layer: keys
   typed in it never reach the chain, and a Tab inside a drawer that holds one
   stays in the drawer.

   Pressing outside closes it — except inside the layers it can itself open: a
   Picker's list, a tooltip, or another of these (a Place picker inside the From
   token's panel is portalled beside it, not inside it). Escape closes it and
   hands focus back to the control, and stops there, so the board does not also
   read it as "leave test mode". Tab past its last control goes on to what
   follows the control in the page, Shift+Tab past its first goes back to the
   control, and either closes it; so does focus leaving it any other way.
   -------------------------------------------------------------------------- */

const GAP = 6
const MARGIN = 8

/** Portalled layers that belong to an open popover: pressing in one is not "outside". */
const OWN_LAYERS = '.bx-picker__pop, .bx-apop, [role="tooltip"], .bx-tip'

export function AnchoredPopover({
  anchor,
  open,
  onClose,
  label,
  children,
  width = 320,
  align = 'start',
  className,
  focusFirst = true,
}: {
  /** The control it hangs from. Focus returns here on Escape. */
  anchor: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  /** Accessible name of the panel: "Person", "Save sign-in". */
  label: string
  children: ReactNode
  /** Panel width in px; clamped to the window. */
  width?: number
  /** Which edge of the anchor the panel lines up with. */
  align?: 'start' | 'end' | 'center'
  className?: string
  /** Move focus to the first control inside on open. */
  focusFirst?: boolean
}) {
  const pop = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number; side: 'top' | 'bottom' } | null>(null)

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect()
    if (!a) return
    const p = pop.current?.getBoundingClientRect()
    const h = p?.height ?? 0
    const w = Math.min(width, window.innerWidth - MARGIN * 2)
    const below = window.innerHeight - a.bottom
    const above = a.top
    const side: 'top' | 'bottom' = below < h + GAP + MARGIN && above > below ? 'top' : 'bottom'
    const room = (side === 'top' ? above : below) - GAP - MARGIN
    const maxH = Math.max(200, Math.min(560, room))
    const wanted = align === 'end' ? a.right - w : align === 'center' ? a.left + a.width / 2 - w / 2 : a.left
    /* Never over the console's rail: a panel hung from something in the main
       column is clamped to that column first — Save sign-in on the Try tab's
       node, aligned to the bookmark's right edge, reached 58 px over the
       rail's links — and then to the window, which wins where the column is
       too narrow to hold it. */
    const main = anchor.current?.closest('.bshell__main')?.getBoundingClientRect()
    const inMain = main ? Math.max(main.left + MARGIN, Math.min(wanted, main.right - w - MARGIN)) : wanted
    setPos({
      top: side === 'bottom' ? a.bottom + GAP : Math.max(MARGIN, a.top - Math.min(h, maxH) - GAP),
      left: Math.max(MARGIN, Math.min(inMain, window.innerWidth - w - MARGIN)),
      maxH,
      side,
    })
  }, [anchor, width, align])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      if (pop.current?.contains(e.target as Node)) return
      place()
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!t) return
      if (anchor.current?.contains(t) || pop.current?.contains(t)) return
      if (t.closest?.(OWN_LAYERS)) return
      onClose()
    }
    /* The panel's own height changes as its content does (Edit details, a
       typed address's error): keep the flip and the cap honest. */
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place())
    if (pop.current && ro) ro.observe(pop.current)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    document.addEventListener('mousedown', onDown)
    return () => {
      ro?.disconnect()
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, place, onClose, anchor])

  /* First control inside, once it is placed — focusing before placement
     scrolls the window to the unplaced panel at the top of the page. */
  const focused = useRef(false)
  useEffect(() => {
    if (!open) {
      focused.current = false
      return
    }
    if (!pos || focused.current || !focusFirst) return
    focused.current = true
    pop.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
  }, [open, pos, focusFirst])

  if (!open) return null

  /* The control focus goes back to: the anchor itself, or — where it is a
     wrapper round one, as Save sign-in's is — the control inside it. */
  const home = () => {
    const a = anchor.current
    if (!a) return null
    return a.matches(FOCUSABLE) ? a : a.querySelector<HTMLElement>(FOCUSABLE)
  }
  /* What Tab reaches after the anchor, in the page's own order: the panel is
     portalled to the app root, so the browser's next stop from its last
     control is the end of the document — and the panel stayed open behind
     the focus that left it (review, 29 Sep 2026). */
  const afterAnchor = () => {
    const a = anchor.current
    if (!a) return null
    const stops = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.tabIndex >= 0 && !pop.current?.contains(el) && !a.contains(el) && el.getClientRects().length > 0,
    )
    return stops.find((el) => a.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ?? null
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      /* A Picker open inside answers its own Escape first (it stops it). */
      e.stopPropagation()
      onClose()
      home()?.focus()
      return
    }
    /* Tab past either end leaves the panel the way it came: forward to what
       follows the control it hangs from, back to that control — and the panel
       closes. A panel that routes its own Tab (a sentence token's, onto the
       next token) says so by preventing it first. */
    if (e.key !== 'Tab' || e.defaultPrevented || !pop.current) return
    const stops = Array.from(pop.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0)
    const at = stops.indexOf(e.target as HTMLElement)
    const last = at === stops.length - 1 || stops.length === 0
    if (!e.shiftKey && last) {
      e.preventDefault()
      const next = afterAnchor() ?? home()
      onClose()
      next?.focus()
    } else if (e.shiftKey && (at === 0 || stops.length === 0)) {
      e.preventDefault()
      const back = home()
      onClose()
      back?.focus()
    }
  }
  /* And whatever else takes focus away — a click on a control elsewhere, a
     shortcut that moves it — closes the panel too, unless focus went into a
     layer the panel opened itself or back to its own control. */
  const onBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Element | null
    if (!next) return
    if (pop.current?.contains(next) || anchor.current?.contains(next) || next.closest(OWN_LAYERS)) return
    onClose()
  }

  return createPortal(
    <div
      ref={pop}
      role="dialog"
      aria-label={label}
      className={`bx-apop is-${pos?.side ?? 'bottom'}${className ? ` ${className}` : ''}`}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: Math.min(width, typeof window === 'undefined' ? width : window.innerWidth - MARGIN * 2),
        maxHeight: pos?.maxH,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {children}
    </div>,
    appRoot(),
  )
}
