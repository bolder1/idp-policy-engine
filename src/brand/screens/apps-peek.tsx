import { motion } from 'motion/react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Pencil } from 'lucide-react'

import { AppLogo } from '../logos/AppLogo'
import { Button } from '../kit'
import { appsLabel, type App } from '../data'
import { countLabel, stackName, stackOf } from './app-stack'

/* -----------------------------------------------------------------------------
   The applications a policy covers: a few marks in the cell, all of them on
   hover.

   The cell used to be one button that went straight into the change-
   applications dialog, with the full list tucked into its `title`. Two things
   were wrong with that once policies started carrying dozens of applications. A
   native title cannot scroll, so past about twenty names it ran off the screen.
   And the one way to see the list was to hover over the control that starts an
   edit, so looking and changing were a single gesture.

   So they are two gestures now. Pointing at the cell, focusing it or tapping it
   opens a panel that lists every application. Edit is inside that panel and
   opens the same dialog as before.

   WHY NOT `Peek`.

   peek.tsx does the look-inside for rule counts and Used-by columns, and it is
   a tooltip. It ignores the pointer, closes on any scroll and has nothing in it
   you can press. This panel has a button, and its list scrolls. A pointer has
   to be able to travel into it, and a keyboard has to be able to reach the
   button, so it needs the grace delay and the focus handling a tooltip is
   right not to have.

   PLACEMENT is Picker's: portalled to `document.body` with fixed coordinates
   measured from the trigger. `.btable__scroll` is an overflow-x container, so
   anything absolutely positioned inside the cell is clipped at the cell edge
   and widens the horizontal scroll.
   -------------------------------------------------------------------------- */

const GAP = 6
const MARGIN = 8
/* The shortest the panel may be squeezed to before it is allowed to overlap
   its trigger. Below this the header and one row stop fitting, and a panel with
   no rows in view is not showing a list. */
const MIN_H = 120
/* Picker waits for nothing because it opens on a click. This opens on hover,
   so it waits briefly. Moving the pointer down the column on the way to the
   kebab should not open a panel on every row it crosses. */
const OPEN_DELAY = 150
/* The time a pointer has to cross the gap from the cell to the panel. Without
   it the panel closes the moment the pointer leaves the trigger, which is
   before it can arrive anywhere else. */
const CLOSE_GRACE = 160

const TABBABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

const tabbables = (root: ParentNode | null | undefined): HTMLElement[] =>
  root ? [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.tabIndex >= 0) : []

/* A click moves focus too, and it must not do what a Tab does. Hover already
   opened the panel for a mouse. If focus opened it as well, focus would keep it
   open after the pointer left, and that is the one thing a pointer user should
   never get. So only keyboard focus opens it. */
function isKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return false
  }
}

type Pos = { side: 'top' | 'bottom'; left: number; maxH: number; top?: number; bottom?: number }

export function AppsPeek({
  apps,
  policyName,
  onEdit,
}: {
  /** The policy's applications, already resolved. Never empty. The empty cell is the caller's. */
  apps: App[]
  policyName: string
  /** The change-applications flow. The panel's Edit button calls this, and the cell never does. */
  onEdit: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const [scrolls, setScrolls] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const pop = useRef<HTMLDivElement | null>(null)
  const list = useRef<HTMLUListElement | null>(null)
  const timer = useRef(0)
  const natural = useRef(0)
  /* Two reasons to stay open, tracked apart. A pointer is inside, or the keyboard
     brought focus here. Leaving with the pointer must not close a panel that
     somebody is tabbing through. */
  const hovering = useRef(false)
  const byKeyboard = useRef(false)
  /* Set just before focus is moved back to the trigger from code, so that
     returning focus does not reopen what was just closed. */
  const quiet = useRef(false)
  const id = useId()

  const { logos, more } = stackOf(apps)

  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    hovering.current = false
    byKeyboard.current = false
    setOpen(false)
  }, [])

  const show = (delay: number) => {
    window.clearTimeout(timer.current)
    if (delay === 0) setOpen(true)
    else timer.current = window.setTimeout(() => setOpen(true), delay)
  }

  const hideSoon = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), CLOSE_GRACE)
  }

  /* The panel's height is measured once, when it opens.

     Placement caps `max-height` to the room on whichever side it opens. Measure
     the box AFTER that cap is applied and you measure the cap: a panel squeezed
     into 150px near the bottom of the window would still think it was 150px
     tall after a scroll gave it 400px, and would sit in the wrong place. The
     first pass has no inline cap yet, only the stylesheet's, so its height is
     the true one.

     The top side is anchored with `bottom` rather than `top` for the same
     reason. Its bottom edge belongs to the trigger, and the height can change
     under it without moving that edge. */
  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect()
    const p = pop.current?.getBoundingClientRect()
    if (!a || !p) return
    const vh = window.innerHeight

    /* Scrolled right out of view. Picker follows its trigger everywhere, but it
       is open because somebody clicked it. This was opened by passing over it,
       and a list pinned to the edge of the window for a row nobody can see
       any more is left over from a hover, not a thing anyone asked for. */
    if (a.bottom < 0 || a.top > vh) {
      window.clearTimeout(timer.current)
      setOpen(false)
      return
    }

    const below = vh - a.bottom - GAP - MARGIN
    const above = a.top - GAP - MARGIN
    // Flip only when below genuinely cannot hold it AND above has more room.
    const side: Pos['side'] = below < natural.current && above > below ? 'top' : 'bottom'
    const maxH = Math.max(MIN_H, Math.min(side === 'top' ? above : below, vh - 2 * MARGIN))
    const shown = Math.min(natural.current, maxH)
    const left = Math.max(MARGIN, Math.min(a.left, window.innerWidth - p.width - MARGIN))

    /* Clamped so the whole panel is on screen, even when MIN_H is more than
       the room there is. Overlapping the row is better than a panel whose Edit
       button is off the edge of the window. */
    const edge = vh - MARGIN - shown
    setPos(
      side === 'bottom'
        ? { side, left, maxH, top: Math.max(MARGIN, Math.min(a.bottom + GAP, edge)) }
        : { side, left, maxH, bottom: Math.max(MARGIN, Math.min(vh - a.top + GAP, edge)) },
    )
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    natural.current = pop.current?.getBoundingClientRect().height ?? 0
    place()
  }, [open, place])

  /* The list becomes a tab stop only when it actually scrolls.

     A scroll region that the keyboard cannot focus cannot be scrolled from the
     keyboard, so a keyboard user could never read past row eleven of a hundred.
     Every list that does NOT scroll would be a stop with nothing to do there,
     though, so this is measured rather than always on. */
  useLayoutEffect(() => {
    const el = list.current
    setScrolls(el ? el.scrollHeight > el.clientHeight + 1 : false)
  }, [pos, apps.length])

  useEffect(() => {
    if (!open) return
    /* `capture: true` so a scroll in any container moves it, the table's own
       horizontal scroll included. The panel's list scrolling is skipped,
       because the panel does not move when its own list does. */
    const onScroll = (e: Event) => {
      if (pop.current?.contains(e.target as Node)) return
      place()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!anchor.current?.contains(t) && !pop.current?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      /* Focus goes back to where it came from, if it was inside. Otherwise the
         panel unmounts with focus in it and the next Tab starts from the top
         of the page. */
      if (pop.current?.contains(document.activeElement)) {
        quiet.current = true
        anchor.current?.focus()
      }
      close()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, place, close])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  /* Touch is ignored for enter and leave. A finger fires `pointerleave` the
     moment it lifts, which would close the panel the tap had just opened. A
     tap opens it through `onClick`, and a tap anywhere else closes it. */
  const onEnter = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    hovering.current = true
    show(open ? 0 : OPEN_DELAY)
  }
  const onLeave = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    hovering.current = false
    if (!byKeyboard.current) hideSoon()
  }

  const onTriggerFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    if (quiet.current) {
      quiet.current = false
      return
    }
    if (!isKeyboardFocus(e.currentTarget)) return
    byKeyboard.current = true
    show(0)
  }

  // Focus left both the cell and the panel. A pointer still inside decides alone.
  const onBlurAny = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null
    if (next && (anchor.current?.contains(next) || pop.current?.contains(next))) return
    byKeyboard.current = false
    if (!hovering.current) {
      window.clearTimeout(timer.current)
      setOpen(false)
    }
  }

  /* The panel is portalled to the end of the body, so in DOM order the element
     after the trigger is whatever follows the table, not the panel. Tab is
     routed by hand: from the trigger into the panel, and from the panel's last
     stop to whatever follows the trigger in the page. */
  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        byKeyboard.current = true
        show(0)
      }
      return
    }
    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowDown') {
      const first = tabbables(pop.current)[0]
      if (!first) return
      e.preventDefault()
      byKeyboard.current = true
      first.focus()
    }
  }

  const onPopKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const stops = tabbables(pop.current)
    const at = stops.indexOf(document.activeElement as HTMLElement)
    if (e.shiftKey && at <= 0) {
      e.preventDefault()
      anchor.current?.focus()
      return
    }
    if (!e.shiftKey && at === stops.length - 1) {
      e.preventDefault()
      const page = tabbables(document).filter((el) => !pop.current?.contains(el) && el.getClientRects().length > 0)
      const from = anchor.current ? page.indexOf(anchor.current) : -1
      const next = from >= 0 ? page[from + 1] : undefined
      close()
      if (next) next.focus()
      else {
        quiet.current = true
        anchor.current?.focus()
      }
    }
  }

  /* Focus goes back to the trigger BEFORE the dialog opens. The dialog records
     whatever is focused when it opens and returns focus there when it closes.
     Focus on the Edit button would mean returning it to a button that no longer
     exists, once the panel is gone. */
  const edit = () => {
    if (pop.current?.contains(document.activeElement)) {
      quiet.current = true
      anchor.current?.focus()
    }
    close()
    onEdit()
  }

  const count = countLabel(apps.length)

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`btable__app btable__app--peek ${open ? 'is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        /* One application reads as its name, which is already the button's
           text. A stack has no text, so it is named. */
        aria-label={apps.length === 1 ? undefined : `${count}: ${stackName(apps)}`}
        onClick={() => show(0)}
        onFocus={onTriggerFocus}
        onBlur={onBlurAny}
        onKeyDown={onTriggerKey}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
      >
        {apps.length === 1 ? (
          /* A single application keeps its name. A lone logo with nothing
             beside it is a square to identify, and most of this tenant's
             applications are internal systems whose mark is the generic one. */
          <>
            <AppLogo appId={apps[0].id} name={apps[0].name} size={20} />
            {appsLabel(apps)}
          </>
        ) : (
          <>
            <span className="btable__logos" aria-hidden>
              {logos.map((a) => (
                <AppLogo key={a.id} appId={a.id} name={a.name} size={20} />
              ))}
            </span>
            {more > 0 && (
              <span className="btable__more" aria-hidden>
                +{more}
              </span>
            )}
          </>
        )}
      </button>

      {open &&
        createPortal(
          <motion.div
            ref={pop}
            id={id}
            /* A non-modal dialog rather than a tooltip, because it holds a
               control. A tooltip's content cannot be operated. */
            role="dialog"
            aria-label={`Applications for ${policyName}`}
            className={`bapk is-${pos?.side ?? 'bottom'}`}
            style={
              {
                top: pos?.side === 'top' ? 'auto' : (pos?.top ?? 0),
                bottom: pos?.side === 'top' ? pos.bottom : 'auto',
                left: pos?.left ?? 0,
                // Unset until measured, so the first pass reads the natural height.
                maxHeight: pos?.maxH,
                // Hidden until measured, so nothing is ever seen at 0,0.
                visibility: pos ? 'visible' : 'hidden',
              } as CSSProperties
            }
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
            onPointerEnter={onEnter}
            onPointerLeave={onLeave}
            onBlur={onBlurAny}
            onKeyDown={onPopKey}
          >
            {/* Edit sits in the header, not below the list. A hundred rows down
                is a long way to scroll to reach the one action here. */}
            <div className="bapk__head">
              <span className="bapk__count">{count}</span>
              <Button size="sm" icon={Pencil} onClick={edit}>
                Edit
                <span className="u-sr-only"> applications for {policyName}</span>
              </Button>
            </div>
            <ul
              ref={list}
              className="bapk__list"
              aria-label={count}
              tabIndex={scrolls ? 0 : undefined}
            >
              {apps.map((a) => (
                <li key={a.id} className="bapk__row">
                  <AppLogo appId={a.id} name={a.name} size={20} />
                  <span className="bapk__name">{a.name}</span>
                </li>
              ))}
            </ul>
          </motion.div>,
          document.body,
        )}
    </>
  )
}
