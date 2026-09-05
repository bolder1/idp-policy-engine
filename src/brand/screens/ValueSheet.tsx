import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Layers, MapPin, Network, Search, X, type LucideIcon } from 'lucide-react'

import { Modal } from '../kit'
import { ZONE_SCOPE_LABEL, ipSectionEmpty, locationEmpty, type Zone, type ZoneScope } from '../data'

import './value-sheet.css'

/* -----------------------------------------------------------------------------
   The value sheet — one selector, for every value a condition can hold.

   A condition row used to grow its value inline: a chip per choice, plus an
   "+ add" picker, all inside a grid cell. Three groups and the cell wrapped
   onto a second line; a time range took three. So the row that is supposed to
   read as one sentence — this attribute, this operator, these values — stopped
   being a row, and a rule of five conditions had no column to read down.

   The fix is that the value is ALWAYS one control. The row shows a summary and
   nothing else; choosing happens here, in a sheet big enough to choose in.
   Which is also the answer to the second problem the inline version had: at
   22px a chip list is a poor place to pick from a library of forty zones, and
   there was nowhere to put anything a value needs SAID — which half of a zone,
   what a device profile actually matches on, how many people are in a group.

   One component rather than one per kind. A zone, a device profile, a group, a
   person and a fixed list are all "pick some of these", and the differences —
   an icon, a second line, a footer that goes somewhere, the zone's two halves —
   are props. Two implementations of a multi-select is how one of them ends up
   with the keyboard support and the other does not.
   -------------------------------------------------------------------------- */

export interface SheetOption {
  value: string
  label: string
  /** A second line: "1,240 people", "6 uses", "Corporate managed". Searched too. */
  meta?: string
  /** A third, quieter line — what this option would actually match on. */
  note?: string
  icon?: LucideIcon
}

/* The two halves of a zone, as a choice.

   A zone is an AND of a network section and a geographic section, and until now
   a rule could only ask about the conjunction. These are the three questions it
   can ask instead, and "both" is first because it is what the zone already
   means — narrowing is the deliberate act, so it is the one you have to choose.

   `undefined` on the model is `both` here. See `Condition.scope`. */
const SCOPES: { id: 'both' | ZoneScope; icon: LucideIcon; hint: string }[] = [
  { id: 'both', icon: Layers, hint: 'The zone as written — the address AND the place must both match.' },
  { id: 'ip', icon: Network, hint: 'Only where the request comes from on the network. Ignores the zone’s countries and cities.' },
  { id: 'location', icon: MapPin, hint: 'Only where the request comes from on the map. Ignores the zone’s addresses and ASNs.' },
]

export function ValueSheet({
  open,
  title,
  caption,
  options,
  picked,
  onToggle,
  onClose,
  single,
  scope,
  onScope,
  footer,
  onFooter,
  empty,
}: {
  open: boolean
  title: string
  caption?: string
  options: SheetOption[]
  picked: string[]
  onToggle: (value: string) => void
  onClose: () => void
  /** Webhooks hold exactly one — `diagnostics` reads `values[0]` for them. */
  single?: boolean
  /** Present only for a zone condition. Absent hides the whole half-picker. */
  scope?: 'both' | ZoneScope
  onScope?: (s: 'both' | ZoneScope) => void
  footer?: string
  onFooter?: () => void
  /** What to say when the library is empty — never a blank pane. */
  empty?: ReactNode
}) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const listEl = useRef<HTMLDivElement | null>(null)

  /* Reset on open. A sheet that reopens on last week's search is keeping state
     nobody asked it to keep — the same rule `ConditionPicker` follows. */
  useEffect(() => {
    if (!open) return
    setQ('')
    setCursor(0)
  }, [open])

  /* Focus, through a CALLBACK REF — and this sheet owns BOTH ends of it.

     `autoFocus` and a plain effect both left focus on the trigger BEHIND the
     sheet, measured in the running app: a keyboard user got a dialog they were
     not in, Tab walking the page underneath and the modal's focus trap never
     engaging. A callback ref fires exactly when the node attaches, which is the
     one moment it is certain to be there.

     That fix broke the other end, and the order is why. Refs attach during the
     commit; effects run after it. `Modal` records where to return focus in an
     effect — so by the time it looked, focus was already in the search field,
     and closing the sheet handed focus back to an input that no longer existed.
     Which is worse than not moving focus at all: it drops to <body>, so the
     next Tab starts from the top of the console rather than from the row you
     were editing.

     So the return target is captured during RENDER, which is before the commit
     and therefore before anything here has moved focus. `armed` does double
     duty: it keeps the field from stealing focus back on every later re-attach
     — a search box that grabs focus mid-interaction is worse than one that
     never had it — and it makes the capture happen once per opening. */
  const armed = useRef(false)
  const returnTo = useRef<HTMLElement | null>(null)
  if (open && !armed.current) returnTo.current = document.activeElement as HTMLElement | null

  useEffect(() => {
    if (open) return
    armed.current = false
    /* Only to a control that still exists. Modal's own restore runs first and
       aims at the search field, which is mid-exit-animation and still connected
       — so it lands, and then this corrects it. */
    const back = returnTo.current
    if (back?.isConnected) back.focus()
  }, [open])

  const field = (el: HTMLInputElement | null) => {
    if (!el || !open || armed.current) return
    armed.current = true
    el.focus()
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => `${o.label} ${o.meta ?? ''} ${o.note ?? ''}`.toLowerCase().includes(needle))
  }, [options, q])

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, shown.length - 1)))
  }, [shown.length])

  /* Arrows and Enter from the search field, so the whole sheet is reachable
     without leaving the box you are typing in. */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const d = e.key === 'ArrowDown' ? 1 : -1
      setCursor((c) => {
        const next = Math.max(0, Math.min(shown.length - 1, c + d))
        listEl.current?.querySelectorAll('[data-opt]')[next]?.scrollIntoView({ block: 'nearest' })
        return next
      })
    } else if (e.key === 'Enter' && shown[cursor]) {
      e.preventDefault()
      onToggle(shown[cursor].value)
      if (single) onClose()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} width={620} padded={false}>
      <div className="vp">
        <div className="vp__bar">
          <Search size={16} strokeWidth={2} aria-hidden />
          <input
            ref={field}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Search ${title.toLowerCase()}…`}
            aria-label={`Search ${title}`}
          />
          {q && (
            <button type="button" className="vp__clear" aria-label="Clear the search" onClick={() => setQ('')}>
              <X size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>

        {caption && <p className="vp__caption">{caption}</p>}

        {/* The zone's two halves, above the list rather than beside it.

            It is a property of the whole condition, not of any one zone, and
            putting it on each row would have asked the same question once per
            zone with no way to answer it once. Above the list it reads as what
            it is: the question this condition asks, and then which zones to ask
            it about. */}
        {scope && onScope && (
          <div className="vp__scope" role="radiogroup" aria-label="Which half of the zone to match on">
            {SCOPES.map((s) => {
              const on = s.id === scope
              const Ico = s.icon
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  className={on ? 'is-on' : ''}
                  title={s.hint}
                  onClick={() => onScope(s.id)}
                  onKeyDown={(e) => {
                    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key as 'ArrowRight']
                    if (!d) return
                    e.preventDefault()
                    const i = SCOPES.findIndex((x) => x.id === scope)
                    onScope(SCOPES[(i + d + SCOPES.length) % SCOPES.length].id)
                  }}
                >
                  <Ico size={14} strokeWidth={2} aria-hidden />
                  {ZONE_SCOPE_LABEL[s.id]}
                </button>
              )
            })}
            <p className="vp__scopehint">{SCOPES.find((s) => s.id === scope)?.hint}</p>
          </div>
        )}

        <div className="vp__list" ref={listEl} role="listbox" aria-multiselectable={!single} aria-label={title}>
          {shown.length === 0 ? (
            <p className="vp__none">{options.length === 0 ? (empty ?? 'Nothing here yet.') : `Nothing matches “${q}”.`}</p>
          ) : (
            shown.map((o, i) => {
              const on = picked.includes(o.value)
              const Ico = o.icon
              return (
                <button
                  key={o.value}
                  type="button"
                  data-opt
                  role="option"
                  aria-selected={on}
                  className={`vp__opt ${on ? 'is-on' : ''} ${i === cursor ? 'is-cursor' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => {
                    onToggle(o.value)
                    if (single) onClose()
                  }}
                >
                  <span className="vp__tick" aria-hidden>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  {Ico && (
                    <i className="vp__icon" aria-hidden>
                      <Ico size={15} strokeWidth={2} />
                    </i>
                  )}
                  <span className="vp__text">
                    <strong>{o.label}</strong>
                    {o.meta && <em>{o.meta}</em>}
                    {o.note && <small>{o.note}</small>}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="vp__foot">
          <span className="vp__count">
            {picked.length === 0 ? 'Nothing chosen yet' : `${picked.length} chosen`}
          </span>
          {/* A footer without a handler is a LABEL, not nothing.

              This was `footer && onFooter &&`, so the one caller that passes a
              footer with nowhere to go — "1,240 more in the directory", which
              is the fixture's own statement that this list is a sample rather
              than the whole company — computed the string and dropped it. That
              sentence is the difference between "these are the people" and
              "these are some of the people", and the console has no directory
              screen to link it to, so requiring a destination is requiring
              something that does not exist. `Picker` has always rendered its
              footer unconditionally and called `onFooter?.()`. */}
          {footer &&
            (onFooter ? (
              <button type="button" className="vp__manage" onClick={onFooter}>
                {footer}
                <ArrowRight size={12} strokeWidth={2.2} aria-hidden />
              </button>
            ) : (
              <span className="vp__hint">{footer}</span>
            ))}
          <button type="button" className="vp__done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* Which half or halves a zone actually constrains.

   Derived, never stored — the same derivation the zones screen makes, and for
   the same reason it makes it there: a stored kind sitting beside a derived
   shape is exactly the drift the derivation exists to avoid. It earns its place
   on this sheet because the half-picker above the list offers a narrowing some
   zones cannot satisfy: "Locations only" against a zone that is nothing but
   addresses is a condition that can never match, and the only place to say so is
   beside the zone it would happen to. */
export function zoneShape(z: Zone): string {
  const net = !ipSectionEmpty(z)
  const loc = !locationEmpty(z.location)
  if (net && loc) return 'IP networks and locations'
  if (net) return 'IP networks only'
  if (loc) return 'Locations only'
  return 'Constrains nothing — this zone matches everything'
}
