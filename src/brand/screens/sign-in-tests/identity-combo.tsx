import { motion } from 'motion/react'
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, SearchX, UserRound, Users, X } from 'lucide-react'

import { FOCUSABLE, appRoot } from '../../dialog-chrome'
import { EmptyState } from '../../empty'
import { Face } from '../../faces'
import { Button } from '../../kit'
import { FilterTabs } from '../page-bar'
import {
  GROUPS_HEADING,
  MAX_IDENTITIES,
  NO_ONE,
  USERS_HEADING,
  bestIdentity,
  identitiesOfKind,
  identityOf,
  identityRows,
  openingKind,
  otherKind,
  rankedIdentities,
  type IdentityKind,
  type IdentityOption,
  type IdentityValue,
} from './sign-in-card'

/* -----------------------------------------------------------------------------
   The Identity field's combobox — Jira's assignee field, in place (owner,
   3 Oct 2026: "check the Jira assignee part — I like that experience") —
   taking several (owner, 5 Oct 2026: "it can be multiple select"), found one
   kind at a time (owner, 5 Oct 2026: "I want the user to first select a user
   or group, and based on that selection display the list in a single
   dropdown").

   At rest it is the answer: the picks as chips — the face or the group's
   square, the name, an × — two lines at most, then "+N"; or, nothing
   chosen, a grey mark and "Choose users or groups", as Jira says
   Unassigned. One press (Enter, Space, ↓, or just typing) puts a search at
   the end of the chips and drops the list below: on top, held there while
   the list scrolls, the switch — Users | Groups, the kind of the last pick,
   Users with none — and under it that kind's rows alone, faces, names, the
   second line; the picks of that kind ticked at the top as the list opened
   (they stay where they are while it is open, so a row never jumps from
   under the pointer), Clear all on top while anything of either kind is
   picked. A press on a row, or Enter, picks it or puts it back, and the list
   stays open, the search emptied for the next; a switch keeps every pick.
   The search reads the kind shown; matching nothing there but something in
   the other, it offers "Search groups" (or users), the words kept. With
   nothing typed, ← and → flip the switch; its two buttons are Tab stops too.
   Backspace in an empty search takes the last chip off; each chip's × is a
   Tab stop, and Delete or Backspace on it takes that chip. Esc closes the
   list and keeps the picks, as a press outside does. Past five, the rows not
   picked are off ("Up to 5" on hover — the field says nothing more).

   The list is the console's Picker list (picker.css `.bx-picker__pop`),
   portalled to the app root and placed `fixed` as Picker places its own, so
   the panel's scroller never clips it — and, while it is open, the search
   carries `aria-expanded="true"` inside the panel, which is what tells the
   page's Escape to leave the panel open and the dark stage to darken the
   list (panel-stage.css). The switch is the page bar's (`FilterTabs`): a
   group named Identity type, its buttons pressed or not.
   -------------------------------------------------------------------------- */

const GAP = 4
const MARGIN = 8
const MIN_POP = 260
/** The chips' lines: past two, the rest fold into "+N". */
const CHIP_LINES = 2
/** A row past the limit, on hover. */
const FULL = `Up to ${MAX_IDENTITIES}`
/** The switch over the list, Users first. */
const KINDS: { value: IdentityKind; label: string }[] = [
  { value: 'user', label: USERS_HEADING },
  { value: 'group', label: GROUPS_HEADING },
]
/** Each kind's plural, for the search's words: "Search users", "No groups match …". */
const NOUN: Record<IdentityKind, string> = { user: 'users', group: 'groups' }

/* The stops Tab can reach in a layer, in order. */
const tabbables = (root: ParentNode | null | undefined): HTMLElement[] =>
  root ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0) : []

/** A person's face, a group's square — the same in a chip and in the list. */
function Mark({ kind, name }: { kind: IdentityKind; name: string | null }) {
  if (name) return <Face kind={kind} name={name} decorative />
  return (
    <span className={`sit-ident__blank is-${kind}`} aria-hidden>
      {kind === 'group' ? <Users size={13} strokeWidth={1.9} /> : <UserRound size={13} strokeWidth={1.9} />}
    </span>
  )
}

export function IdentityCombo({
  label,
  choose,
  options,
  value,
  domId,
  invalid,
  onChange,
}: {
  /** "Identity": the field's name. */
  label: string
  /** The empty field: "Choose users or groups". */
  choose: string
  options: readonly IdentityOption[]
  /** The picks, in the order chosen. */
  value: readonly IdentityValue[]
  /** The field's id — the one the canvas and a "Needs" line focus. */
  domId: string
  invalid: boolean
  onChange: (next: readonly IdentityValue[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  /* The list's kind: the switch's pressed side. */
  const [kind, setKind] = useState<IdentityKind>('user')
  /* The row under the cursor, by its value: a pick adds Clear all over the
     list, and the cursor stays on the row it was on. */
  const [cursor, setCursor] = useState<IdentityValue | null>(null)
  /* The picks as the list opened (or switched): they head the list until it closes. */
  const [pinned, setPinned] = useState<readonly IdentityValue[]>([])
  const [height, setHeight] = useState<number | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number; side: 'top' | 'bottom' } | null>(null)
  const field = useRef<HTMLDivElement | null>(null)
  const chipBox = useRef<HTMLDivElement | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const pop = useRef<HTMLDivElement | null>(null)
  /* Whether closing hands the focus back to the field: Esc does; a press
     elsewhere or Tab leaves it where it went. */
  const back = useRef(false)
  /* A chip taken off from the keyboard: the place whose × takes the focus next. */
  const focusAt = useRef<number | null>(null)
  const id = useId()

  const needle = q.trim().toLowerCase()
  const mine = identitiesOfKind(options, kind)
  const rows: readonly IdentityOption[] = needle ? rankedIdentities(mine, needle) : identityRows(mine, pinned, value.length > 0)
  const at = cursor === null ? -1 : rows.findIndex((o) => o.value === cursor)
  const full = value.length >= MAX_IDENTITIES
  const other = otherKind(kind)
  /* Nothing of this kind matches, but the other kind has something: the list offers that kind, the words kept. */
  const elsewhere = needle !== '' && rows.length === 0 && rankedIdentities(identitiesOfKind(options, other), needle).length > 0
  /* The chips: each pick as the list names it — one it does not list (a
     group with nobody in it now) by its value. */
  const chips = value.map((v): IdentityOption => {
    const listed = options.find((o) => o.value === v)
    if (listed) return listed
    const { kind: k, id: name } = identityOf(v)
    return { value: v, kind: k, name, meta: '', heading: '', hay: '' }
  })

  /* Where the cursor stands in a kind's list: typed, on the best match,
     where Enter takes it; else on that kind's first pick — or, opened by ↓
     with nothing of it picked, on the first row, so the first ↓ lands at once. */
  const cursorOf = (k: IdentityKind, typed: string, first = false): IdentityValue | null => {
    const t = typed.trim().toLowerCase()
    const theirs = identitiesOfKind(options, k)
    if (t) return bestIdentity(rankedIdentities(theirs, t), t)?.value ?? null
    return value.find((v) => identityOf(v).kind === k) ?? (first ? (identityRows(theirs, value, false)[0]?.value ?? null) : null)
  }
  /* The list opens on the last pick's kind — Users, nothing picked. */
  const start = (typed: string, first = false) => {
    const k = openingKind(value)
    setHeight(field.current?.offsetHeight ?? null)
    setPinned(value)
    setKind(k)
    setQ(typed)
    setCursor(cursorOf(k, typed, first))
    setOpen(true)
  }
  const close = (focusBack: boolean) => {
    back.current = focusBack
    setOpen(false)
  }
  /* The switch flipped: the other kind's list, the search kept and read
     there, that kind's picks on top. */
  const flip = (k: IdentityKind) => {
    if (k === kind) return
    setKind(k)
    setPinned(value)
    setCursor(cursorOf(k, q))
  }
  /* "Search groups" (or users): the switch flipped, the words kept, and the
     focus in the search — the button goes as that kind's rows come. */
  const searchOther = () => {
    flip(other)
    input.current?.focus()
  }
  /* A row pressed: Clear all empties the field; a pick goes back; anything
     else is picked, while there is room. The list stays open, its search
     emptied, the cursor on the row. */
  const toggle = (o: IdentityOption) => {
    if (o.value === NO_ONE) {
      onChange([])
      setQ('')
      setCursor(null)
      return
    }
    const on = value.includes(o.value)
    if (!on && full) return
    onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])
    setQ('')
    setCursor(o.value)
  }
  /* A chip's ×. Pressed from the keyboard — or Delete or Backspace on it —
     the focus goes on to the next chip's ×, else to the field. */
  const remove = (i: number, keyboard: boolean) => {
    if (keyboard) focusAt.current = i
    onChange(value.filter((_, j) => j !== i))
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

  /* Focus gone from the field and its list both — a press outside, a Tab
     past the end — closes the list; between the two it stays open. */
  const leave = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null
    if (!field.current?.contains(to) && !pop.current?.contains(to)) setOpen(false)
  }
  /* The list is portalled to the app root, so in the page the field's next
     stop is not the switch: Tab is routed by hand, as the applications peek
     routes its own (apps-peek.tsx) — the search on to the switch, the
     switch's first back to the search, the list's last on to whatever
     follows the field in the page. */
  const onward = () => {
    const page = tabbables(document).filter((el) => !pop.current?.contains(el))
    const from = input.current ? page.indexOf(input.current) : -1
    const next = from >= 0 ? page[from + 1] : undefined
    close(!next)
    next?.focus()
  }

  /* Picker's placement: under the field, over it only when there is more
     room there; the list's own height capped to that room; followed through
     any scroll but its own. */
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
  /* Typing, a switch, and a pick that takes the chips onto another line, move the list with the field's foot. */
  useEffect(() => {
    if (open) place()
  }, [q, open, value, kind, place])

  /* The cursor's row stays in sight as ↑↓ walk the list. */
  useEffect(() => {
    if (open && at >= 0) document.getElementById(`${id}-${at}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, at, kind, id])

  /* Two lines of chips at most: as many as fit, then "+N" for the rest.
     Measured from every chip again whenever the picks, the field's state or
     its width change, one chip fewer a time — layout effects, so no frame
     shows a third line. */
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
    /* Typing a name starts the search with it, as in Jira. */
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
    /* Nothing typed, ← and → flip the switch — two sides, so either flips;
       with words in the search they move the caret as ever. */
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !q) {
      e.preventDefault()
      flip(other)
      return
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (rows[at]) toggle(rows[at])
      else if (elsewhere) flip(other)
      return
    }
    /* Tab goes on to the switch, in the list. */
    if (e.key === 'Tab' && !e.shiftKey) {
      const first = tabbables(pop.current)[0]
      if (!first) return
      e.preventDefault()
      first.focus()
      return
    }
    /* Backspace with nothing typed takes the last chip off. */
    if (e.key === 'Backspace' && !q && value.length > 0) {
      e.preventDefault()
      onChange(value.slice(0, -1))
      return
    }
    /* Esc closes the list and keeps the picks, and stops there: the panel,
       and the builder behind it, keep their own Escape for the next one. */
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
  }
  /* Keys on the list's own buttons — the switch, "Search groups": Esc as in
     the search; ← and → on the switch flip it, the focus going with the
     pressed side; ↑↓ back to the search, walking the list; Tab routed. */
  const onPopKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
      return
    }
    const sw = (e.target as HTMLElement).closest('.sit-ident__type')
    if (sw && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      flip(other)
      tabbables(sw)[KINDS.findIndex((k) => k.value === other)]?.focus()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      input.current?.focus()
      step(e.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (e.key !== 'Tab') return
    const stops = tabbables(pop.current)
    const i = stops.indexOf(document.activeElement as HTMLElement)
    if (e.shiftKey && i <= 0) {
      e.preventDefault()
      input.current?.focus()
    } else if (!e.shiftKey && i === stops.length - 1) {
      e.preventDefault()
      onward()
    }
  }

  const listId = `${id}-list`
  const state = `${value.length > 0 ? 'is-set' : 'is-empty'}${invalid ? ' is-invalid' : ''}`
  const search = `Search ${NOUN[kind]}`
  /* A chip's body opens the list, as the field does; its × takes the pick
     off. A press on either takes no focus from where it is: the search,
     open; else whatever had it. The × is a Tab stop of its own. */
  const chipRow = (
    <>
      {shown.map((c, i) => (
        <span key={c.value} className="sit-ident__chip" title={c.name} onClick={() => (open ? input.current?.focus() : start(''))}>
          <Face kind={c.kind} name={c.name} size="sm" decorative />
          <span className="sit-ident__chipname">{c.name}</span>
          <button
            type="button"
            className="sit-ident__chipx"
            aria-label={`Remove ${c.name}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation()
              /* No pointer behind it (`detail` 0): Enter or Space, so the focus goes on. */
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
          title={rest.map((c) => c.name).join(', ')}
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
      <div ref={field} className="sit-ident__fieldwrap">
        {open ? (
          <div
            className={`sit-ident__field is-open ${state}`}
            style={height ? { minHeight: height } : undefined}
            /* A press on the field's own edge or a chip keeps the search, not a blur. */
            onMouseDown={(e) => {
              if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
            }}
            onBlur={leave}
            /* Esc on a chip's × closes the list too; the search stops its own. */
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
                id={domId}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-haspopup="listbox"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={at >= 0 ? `${id}-${at}` : undefined}
                aria-label={search}
                aria-invalid={invalid || undefined}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="sit-ident__search"
                placeholder={value.length > 0 ? undefined : search}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  /* Every keystroke: the best match; cleared again: back on this kind's first pick. */
                  setCursor(cursorOf(kind, e.target.value))
                }}
                onKeyDown={onSearchKey}
              />
            </div>
            <Search className="sit-ident__searchico" size={14} strokeWidth={2} aria-hidden />
          </div>
        ) : (
          <div className={`sit-ident__field ${state}`}>
            {/* The field's own press: under the chips, the whole field — its label names the picks. */}
            <button
              ref={button}
              id={domId}
              type="button"
              className="sit-ident__open"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-label={`${label}: ${chips.length > 0 ? chips.map((c) => c.name).join(', ') : choose}`}
              aria-invalid={invalid || undefined}
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
                  <Mark kind="user" name={null} />
                  <span className="sit-ident__name" aria-hidden>
                    {choose}
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
            className={`bx-picker__pop sit-ident__pop is-${pos?.side ?? 'bottom'}`}
            style={
              {
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                width: pos?.width ?? MIN_POP,
                maxHeight: pos?.maxH,
                visibility: pos ? 'visible' : 'hidden',
              } as CSSProperties
            }
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
            /* The search keeps the focus: a press in the list picks, it never blurs. */
            onMouseDown={(e) => e.preventDefault()}
            onBlur={leave}
            onKeyDown={onPopKey}
          >
            <div className="sit-ident__type">
              <FilterTabs label="Identity type" value={kind} options={KINDS} onChange={flip} />
            </div>
            {rows.length === 0 && (
              <div className="bx-picker__empty">
                <EmptyState
                  compact
                  live
                  icon={SearchX}
                  title={needle ? `No ${NOUN[kind]} match “${q.trim()}”` : `No ${NOUN[kind]}`}
                  blurb={elsewhere ? undefined : 'Try another name.'}
                  action={
                    elsewhere ? (
                      <Button size="sm" onClick={searchOther}>
                        Search {NOUN[other]}
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            )}
            <ul
              key={kind}
              id={listId}
              role="listbox"
              aria-label={KINDS.find((k) => k.value === kind)?.label}
              aria-multiselectable="true"
              className="bx-picker__list sit-picklist"
              hidden={rows.length === 0}
            >
              {rows.map((o, i) => {
                const prev = rows[i - 1]
                /* Inside a policy, its people under In this policy, then Not in this policy. */
                const sub = o.sub && o.sub !== prev?.sub ? o.sub : null
                const clear = o.value === NO_ONE
                const on = !clear && value.includes(o.value)
                const off = !clear && !on && full
                return (
                  <Fragment key={o.value || 'clear'}>
                    {sub && (
                      <li className="bx-picker__head sit-ident__sub" role="presentation">
                        {sub}
                      </li>
                    )}
                    <li
                      id={`${id}-${i}`}
                      role="option"
                      aria-selected={on}
                      aria-disabled={off || undefined}
                      title={off ? FULL : undefined}
                      className={`bx-picker__opt${on ? ' is-on' : ''}${off ? ' is-off' : ''}${i === at ? ' is-cursor' : ''}${clear ? ' sit-ident__clear' : ''}`}
                      /* Move, not enter: a list that shrinks under a still pointer as a search is typed keeps its cursor on the best match. */
                      onMouseMove={() => setCursor(o.value)}
                      onClick={() => toggle(o)}
                    >
                      <span className="bx-picker__tick" aria-hidden>
                        {on && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="bx-picker__art" aria-hidden>
                        {/* Clear all wears the list's own mark: a person's under Users, a group's square under Groups. */}
                        <Mark kind={clear ? kind : o.kind} name={clear ? null : o.name} />
                      </span>
                      <span className="bx-picker__opttext">
                        <strong>{o.name}</strong>
                        {o.meta && <em>{o.meta}</em>}
                      </span>
                    </li>
                    {clear && <li className="sit-ident__rule" role="presentation" />}
                  </Fragment>
                )
              })}
            </ul>
          </motion.div>,
          appRoot(),
        )}
    </>
  )
}
