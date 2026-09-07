import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Fingerprint, Globe, Layers, MapPin, Network, Search, UserRound, Users, Webhook, X, type LucideIcon } from 'lucide-react'

import { modeLabel } from '../fingerprint'
import type { BrandStore } from '../store'
import type { NameLookup } from './predicate-prose'
import {
  CONDITION_CATALOGUE,
  ZONE_SCOPE_LABEL,
  conditionRank,
  conditionType,
  ipSectionEmpty,
  locationEmpty,
  type Condition,
  type ConditionType,
  type Zone,
  type ZoneScope,
} from '../data'

import './condition-popover.css'

/* -----------------------------------------------------------------------------
   A condition: one pill, three parts, three menus.

   The pill reads as the sentence — `Group Membership · in · Finance` — and each
   of the three parts is its own hit target opening its own menu. Jira's filter
   chip is the reference, and this is the half of it that matters: pressing the
   operator gives you the operators, pressing the values gives you the values,
   and neither makes you walk past the other.

   It was one panel holding all three stacked, which is the version you reach
   for when you think of a condition as a form. It is not a form, it is a
   sentence, and a sentence is edited a word at a time: somebody changing `in`
   to `not in` had to open a panel containing the attribute they did not want to
   change and a list of groups they did not want to change, and find the middle
   row of it.

   Three menus also make the FIRST pass progressive, which one panel could not.
   A new condition has nothing in it, so choosing the attribute opens the
   operators and choosing an operator opens the values — the order they depend
   on each other in, one decision at a time, without the next two sitting there
   waiting on a choice that has not been made.

   Only one is ever open. The three sit on one line and drop into the same space
   below it, so two at once would be two panels fighting over one anchor.

   The positioning is `Picker`'s, deliberately — portalled to `document.body`
   and `position: fixed`, this codebase's proven un-clippable pattern: flip only
   when the near side genuinely lacks room, clamp horizontally, follow scroll
   with `capture: true` so a nested scroller moves it too, cap the height to the
   room there is, and stay hidden until measured so nothing is ever seen at 0,0.
   The inspector body IS a nested scroller, so none of that is theoretical.
   -------------------------------------------------------------------------- */

const GAP = 6
const MARGIN = 8

export interface ValueOption {
  value: string
  label: string
  /** A second line — "1,240 people", "IP networks only", "Corporate managed". */
  meta?: string
  /** A third, quieter line: what this option would actually match on. */
  note?: string
  icon?: LucideIcon
}

/* The two halves of a zone.

   A zone is an AND of a network section and a geographic section, and until
   this existed a rule could only ask about the conjunction. "Both" is first
   because it is what the zone already means — narrowing is the deliberate act,
   so it is the one you have to choose. `undefined` on the model is `both` here;
   see `Condition.scope`. */
const SCOPES: { id: 'both' | ZoneScope; icon: LucideIcon; hint: string }[] = [
  { id: 'both', icon: Layers, hint: 'The zone as written — the address AND the place must both match.' },
  { id: 'ip', icon: Network, hint: 'Only where the request comes from on the network. Ignores the zone’s countries and cities.' },
  { id: 'location', icon: MapPin, hint: 'Only where the request comes from on the map. Ignores the zone’s addresses and ASNs.' },
]

/** Which half or halves a zone actually constrains. Derived, never stored. */
export function zoneShape(z: Zone): string {
  const net = !ipSectionEmpty(z)
  const loc = !locationEmpty(z.location)
  if (net && loc) return 'IP networks and locations'
  if (net) return 'IP networks only'
  if (loc) return 'Locations only'
  return 'Constrains nothing — this zone matches everything'
}

/* What the pill says for its values: one name, or one name and a count.

   Never a run of names. "Finance, Engineering, Contractors" in a 200px segment
   elides to "Finance, Engi…", which reads as a truncated single value rather
   than as three. "Finance +2" is the same information and cannot be misread. */
export function summarise(names: string[], placeholder: string): string {
  if (names.length === 0) return placeholder
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}

/** Which of the three menus is open. Never two: they share one anchor line. */
type Part = 'what' | 'op' | 'val'

export function ConditionPopover({
  c,
  summary,
  options,
  names,
  single,
  unset,
  onRetype,
  onOperator,
  onValues,
  onScope,
  onRemove,
  footer,
  onFooter,
  autoOpen,
  hideAttribute,
}: {
  c: Condition
  /** The chosen values, summarised for the pill's third segment. */
  summary: string
  /** The pickable values, when the kind has any. Empty for text/time/range. */
  options: ValueOption[]
  /** Resolved names of the chosen values, for the accessible name. */
  names: string[]
  /** Hooks hold exactly one — `diagnostics` reads `values[0]` for them. */
  single?: boolean
  unset: boolean
  onRetype: (typeId: string) => void
  onOperator: (op: string) => void
  onValues: (v: string[]) => void
  onScope: (s: 'both' | ZoneScope) => void
  onRemove: () => void
  footer?: string
  onFooter?: () => void
  /** A row that was just added: start it at the first UNANSWERED decision. */
  autoOpen?: boolean
  /* Drop the attribute segment.

     For the WHO step, where the attribute IS the step: that row is about
     groups, and letting somebody retype it into Day of week would edit the
     question out from under the heading it sits below. Everything else about
     the pill stays, which is the point — choosing a group there and choosing
     one in a condition are the same gesture over the same list, because they
     write the same condition. */
  hideAttribute?: boolean
}) {
  const t = conditionType(c.typeId)
  /* `'op'`, not `'what'`.

     A row is only ever added by choosing an attribute in the catalogue dialog —
     that is the whole content of that dialog — so a fresh condition arrives
     with its attribute already decided. Opening the attribute menu on top of it
     asked the same question twice, and answered by the same dialog the person
     had just closed.

     The first UNANSWERED decision is the operator, so that is where it lands,
     and picking one carries on to the values. Nothing else opens by itself:
     this is the one moment the next step is certain. */
  const [open, setOpen] = useState<Part | null>(autoOpen ? 'op' : null)
  const values = c.values.filter(Boolean)

  const whatRef = useRef<HTMLButtonElement | null>(null)
  const opRef = useRef<HTMLButtonElement | null>(null)
  const valRef = useRef<HTMLButtonElement | null>(null)
  const anchorFor: Record<Part, RefObject<HTMLButtonElement | null>> = { what: whatRef, op: opRef, val: valRef }

  const toggle = (v: string) =>
    onValues(single ? [v] : values.includes(v) ? values.filter((x) => x !== v) : [...values, v])

  const close = useCallback(() => setOpen(null), [])

  return (
    <>
      <span className="cp__pill">
        {!hideAttribute && (
          <Seg
            ref={whatRef}
            kind="what"
            open={open === 'what'}
            label={`Change what is checked. Currently ${t.label}.`}
            onOpen={() => setOpen((o) => (o === 'what' ? null : 'what'))}
          >
            {t.label}
          </Seg>
        )}

        <Seg
          ref={opRef}
          kind="op"
          open={open === 'op'}
          label={`Change how ${t.label} is compared. Currently ${c.operator}.`}
          onOpen={() => setOpen((o) => (o === 'op' ? null : 'op'))}
        >
          {c.operator}
        </Seg>

        <Seg
          ref={valRef}
          kind="val"
          open={open === 'val'}
          unset={unset}
          label={`Change what ${t.label} is compared against. Currently ${
            unset ? 'nothing chosen' : names.length > 1 ? `${names[0]} and ${names.length - 1} more` : names[0] || summary
          }.`}
          onOpen={() => setOpen((o) => (o === 'val' ? null : 'val'))}
        >
          {summary}
          {/* Which half of a zone, when it is narrower than the zone as written.
              Absent for "both", because that is what the zone means already. */}
          {c.scope && <i className="cp__scopetag">{c.scope === 'ip' ? 'network' : 'map'}</i>}
        </Seg>

        <button type="button" className="cp__pill__x" aria-label={`Remove ${t.label}`} title="Remove" onClick={onRemove}>
          <X size={12} strokeWidth={2.4} />
        </button>
      </span>

      {open && (
        <Pop
          anchor={anchorFor[open]}
          onClose={() => {
            setOpen(null)
            anchorFor[open].current?.focus()
          }}
          /* Re-measure whenever what is inside can change size — a retype swaps
             the whole body, an operator change can swap it too. */
          watch={`${open}:${c.typeId}:${c.operator}`}
        >
          {open === 'what' && (
            <OptionList
              searchLabel="Search attributes"
              items={[...CONDITION_CATALOGUE]
                .sort((a, b) => conditionRank(a.id) - conditionRank(b.id))
                .map((x) => ({ value: x.id, label: x.label, meta: x.group, note: x.hint }))}
              picked={[c.typeId]}
              single
              /* Progressive, and only forwards. Choosing an attribute opens the
                 operators; choosing an operator opens the values. It does not
                 run backwards: re-opening the operator menu on a finished
                 condition to change `in` to `not in` should leave you where you
                 were, not drag you into a list of groups you did not ask about. */
              onPick={(id) => {
                onRetype(id)
                setOpen('op')
              }}
            />
          )}

          {open === 'op' && (
            <OptionList
              items={t.operators.map((o) => ({ value: o, label: o }))}
              picked={[c.operator]}
              single
              /* No search over two to four words. */
              onPick={(o) => {
                onOperator(o)
                setOpen('val')
              }}
            />
          )}

          {open === 'val' && (
            <ValueBody
              c={c}
              options={options}
              single={single}
              values={values}
              toggle={toggle}
              onValues={onValues}
              onScope={onScope}
              footer={footer}
              onFooter={onFooter}
              close={close}
            />
          )}
        </Pop>
      )}
    </>
  )
}

/* --- One segment of the pill --------------------------------------------------

   A button, not a span. Each of the three is its own access point, and what
   makes that legible is that each highlights on hover and each carries its own
   caret; `aria-haspopup="dialog"` and `aria-expanded` say the rest. */
function Seg({
  ref,
  kind,
  open,
  unset,
  label,
  onOpen,
  children,
}: {
  ref: RefObject<HTMLButtonElement | null>
  kind: Part
  open: boolean
  unset?: boolean
  label: string
  onOpen: () => void
  children: ReactNode
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={`cp__seg is-${kind} ${open ? 'is-open' : ''} ${unset ? 'is-unset' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      /* The whole state of this part, because `aria-label` REPLACES a button's
         text — naming it after the field alone would announce the control and
         hide the value it is showing. */
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' && !open) {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <span className="cp__seg__text">{children}</span>
      <ChevronDown size={11} strokeWidth={2.2} aria-hidden />
    </button>
  )
}

/* --- The anchored panel -------------------------------------------------------
   One implementation, used by all three menus. */
function Pop({
  anchor,
  onClose,
  watch,
  children,
}: {
  anchor: RefObject<HTMLButtonElement | null>
  onClose: () => void
  /** Anything that changes the panel's size, so it re-measures. */
  watch: string
  children: ReactNode
}) {
  const pop = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null)

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect()
    if (!a) return
    const p = pop.current?.getBoundingClientRect()
    const w = Math.max(a.width, p?.width ?? 240)
    const h = p?.height ?? 0
    const below = window.innerHeight - a.bottom
    const above = a.top
    /* Flip only when below genuinely lacks room AND above has more — the rule
       that stops a panel jumping sides as its own list is filtered. */
    const up = below < h + GAP + MARGIN && above > below
    /* Cap to the room on the side it opened and let the LIST scroll. Without
       this a tall panel from a segment low in the inspector had nowhere to fit
       and clamped to the viewport edge, covering the console header to show six
       options. */
    const room = (up ? above : below) - GAP - MARGIN
    const maxH = Math.max(200, room)
    setPos({
      top: up ? Math.max(MARGIN, a.top - Math.min(h, maxH) - GAP) : a.bottom + GAP,
      left: Math.max(MARGIN, Math.min(a.left, window.innerWidth - w - MARGIN)),
      width: w,
      maxH,
    })
  }, [anchor])

  // Before paint, so the panel is never seen at its unplaced position.
  useLayoutEffect(place, [place, watch])

  useEffect(() => {
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (anchor.current?.contains(n) || pop.current?.contains(n)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', onDown)
    }
  }, [place, anchor, onClose])

  return createPortal(
    <div
      ref={pop}
      className="cp__pop"
      role="dialog"
      style={pos ? { top: pos.top, left: pos.left, minWidth: pos.width, maxHeight: pos.maxH } : { opacity: 0, pointerEvents: 'none' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

/* --- A list of options ---------------------------------------------------------
   The attribute menu and the operator menu are the same shape; only the
   attribute menu is long enough to want a search field. */
function OptionList({
  items,
  picked,
  single,
  searchLabel,
  onPick,
}: {
  items: ValueOption[]
  picked: string[]
  single?: boolean
  /** Present when the list is long enough to want searching. */
  searchLabel?: string
  onPick: (v: string) => void
}) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return items
    return items.filter((o) => `${o.label} ${o.meta ?? ''} ${o.note ?? ''}`.toLowerCase().includes(n))
  }, [items, q])

  return (
    <>
      {searchLabel && <SearchField value={q} onChange={setQ} label={searchLabel} />}
      <List items={shown} picked={picked} single={single} onPick={onPick} q={q} />
      {searchLabel && (
        <div className="cp__foot">
          <span className="cp__count">
            {shown.length} of {items.length}
          </span>
        </div>
      )}
    </>
  )
}

/* The search field, focused through a callback ref rather than `autoFocus` or
   an effect: the panel is portalled and mounts in the same commit the state
   flips, so the ref callback is the one moment the node is certainly in the
   document. `armed` stops it grabbing focus back on every later re-render,
   which mid-typing is worse than never having taken it. */
function SearchField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const armed = useRef(false)
  return (
    <div className="cp__search">
      <Search size={14} strokeWidth={2} aria-hidden />
      <input
        ref={(el) => {
          if (!el || armed.current) return
          armed.current = true
          el.focus()
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </div>
  )
}

function List({
  items,
  picked,
  single,
  onPick,
  q,
}: {
  items: ValueOption[]
  picked: string[]
  single?: boolean
  onPick: (v: string) => void
  q: string
}) {
  return (
    <div className="cp__list" role={single ? 'listbox' : 'group'}>
      {items.length === 0 ? (
        <p className="cp__none">Nothing matches “{q}”.</p>
      ) : (
        items.map((o) => {
          const on = picked.includes(o.value)
          const Ico = o.icon
          return (
            <button
              key={o.value}
              type="button"
              className={`cp__opt ${on ? 'is-on' : ''} ${single ? 'is-single' : ''}`}
              role={single ? 'option' : 'checkbox'}
              aria-selected={single ? on : undefined}
              aria-checked={single ? undefined : on}
              onClick={() => onPick(o.value)}
            >
              {/* A tick box for a multi-select, a bare check for a single one.
                  The shape is what says whether choosing this unchooses the
                  last — which is the difference between picking an operator and
                  picking a fourth group. */}
              {single ? (
                <span className="cp__pickmark" aria-hidden>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
              ) : (
                <span className="cp__tick" aria-hidden>
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
              )}
              {Ico && (
                <i className="cp__icon" aria-hidden>
                  <Ico size={13} strokeWidth={2} />
                </i>
              )}
              <span className="cp__text">
                <b>{o.label}</b>
                {o.meta && <em>{o.meta}</em>}
                {o.note && <small>{o.note}</small>}
              </span>
            </button>
          )
        })
      )}
    </div>
  )
}

/* --- The value menu -------------------------------------------------------------
   Everything that can hold more than one thing is a searchable checkbox list;
   the three that are genuinely one control — a time window, a number with a
   unit, a line of text — are that control. */
function ValueBody({
  c,
  options,
  single,
  values,
  toggle,
  onValues,
  onScope,
  footer,
  onFooter,
  close,
}: {
  c: Condition
  options: ValueOption[]
  single?: boolean
  values: string[]
  toggle: (v: string) => void
  onValues: (v: string[]) => void
  onScope: (s: 'both' | ZoneScope) => void
  footer?: string
  onFooter?: () => void
  close: () => void
}) {
  const t = conditionType(c.typeId)
  const [q, setQ] = useState('')
  const armed = useRef(false)
  const take = (el: HTMLInputElement | null) => {
    if (!el || armed.current) return
    armed.current = true
    el.focus()
  }

  if (t.valueKind === 'time') {
    return (
      <div className="cp__body cp__body--inline">
        <input ref={take} type="time" className="cp__input" aria-label="From" value={c.values[0] ?? '09:00'} onChange={(e) => onValues([e.target.value, c.values[1] ?? '17:00'])} />
        <span className="cp__to">to</span>
        <input type="time" className="cp__input" aria-label="To" value={c.values[1] ?? '17:00'} onChange={(e) => onValues([c.values[0] ?? '09:00', e.target.value])} />
      </div>
    )
  }

  if (t.valueKind === 'range') {
    return (
      <div className="cp__body cp__body--inline">
        <input ref={take} type="number" className="cp__input is-num" aria-label={t.label} value={values[0] ?? ''} placeholder="0" onChange={(e) => onValues([e.target.value])} />
        <span className="cp__to">{t.id === 'trust-age' ? 'days' : t.id === 'coords' ? 'km' : 'score'}</span>
      </div>
    )
  }

  if (options.length === 0) {
    return (
      <div className="cp__body cp__body--inline">
        <input ref={take} className="cp__input is-text" aria-label={t.label} placeholder="Type a value…" value={values[0] ?? ''} onChange={(e) => onValues([e.target.value])} />
      </div>
    )
  }

  const shown = q.trim()
    ? options.filter((o) => `${o.label} ${o.meta ?? ''} ${o.note ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    : options

  return (
    <>
      {/* A zone's two halves. A property of the CONDITION, not of any one zone,
          so it is asked once above the list rather than once per row with no way
          to answer it once. */}
      {t.valueKind === 'zone' && (
        <div className="cp__scope" role="radiogroup" aria-label="Which half of the zone to match on">
          {SCOPES.map((s, i) => {
            const on = s.id === (c.scope ?? 'both')
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
                  onScope(SCOPES[(i + d + SCOPES.length) % SCOPES.length].id)
                }}
              >
                <Ico size={13} strokeWidth={2} aria-hidden />
                {ZONE_SCOPE_LABEL[s.id]}
              </button>
            )
          })}
        </div>
      )}

      <SearchField value={q} onChange={setQ} label={`Search ${t.label}`} />
      <List
        items={shown}
        picked={values}
        single={single}
        q={q}
        onPick={(v) => {
          toggle(v)
          /* A single-value kind is finished the moment it is chosen; a
             multi-value one is not, and closing under somebody about to tick a
             second group is the whole reason a multi-select stays open. */
          if (single) close()
        }}
      />

      <div className="cp__foot">
        <span className="cp__count">
          {shown.length} of {options.length}
        </span>
        {footer &&
          (onFooter ? (
            <button type="button" className="cp__manage" onClick={onFooter}>
              {footer} →
            </button>
          ) : (
            <span className="cp__hint">{footer}</span>
          ))}
      </div>
    </>
  )
}
export function condSummary(t: ConditionType, c: Condition, names: string[]): string {
  const values = c.values.filter(Boolean)
  if (t.valueKind === 'time') return `${c.values[0] ?? '09:00'} – ${c.values[1] ?? '17:00'}`
  if (t.valueKind === 'range')
    return values[0] ? `${values[0]} ${t.id === 'trust-age' ? 'days' : t.id === 'coords' ? 'km' : ''}`.trim() : 'Choose…'
  return summarise(names.length ? names : values, 'Choose…')
}

/* Where a condition's choices come from, by kind — one place, so the pill's
   summary and the panel's list can never be built from different lists.

   The three kinds that have no list (a time window, a number, a line of text)
   return none, and the panel renders the control they need instead. */
export function valueSource(
  t: ConditionType,
  values: string[],
  store: BrandStore,
  resolve: NameLookup,
): { options: ValueOption[]; names: string[]; single?: boolean; footer?: string; onFooter?: () => void } {
  if (t.valueKind === 'zone' || t.valueKind === 'fingerprint' || t.valueKind === 'hook') {
    const kind = t.valueKind
    const options: ValueOption[] =
      kind === 'zone'
        ? store.zones.map((z) => ({
            value: z.id,
            label: z.name,
            meta: zoneShape(z),
            note: z.usedIn ? `Used by ${z.usedIn} rule${z.usedIn === 1 ? '' : 's'}` : undefined,
            icon: Globe,
          }))
        : kind === 'fingerprint'
          ? store.fingerprints.map((p) => ({ value: p.id, label: p.name, meta: modeLabel(p), icon: Fingerprint }))
          : store.hooks.filter((h) => h.mode === 'sync').map((h) => ({ value: h.id, label: h.name, meta: `Answers within ${h.timeoutMs}ms`, icon: Webhook }))
    return {
      options,
      names: values.map((id) => resolve(kind, id) ?? `deleted · ${id}`),
      /* A hook holds one. `diagnostics` reads `values[0]` to check the endpoint
         still exists, and a rule consulting two services would have to say what
         happens when they disagree. */
      single: kind === 'hook',
      footer: kind === 'zone' ? 'Manage zones' : kind === 'fingerprint' ? 'Manage device profiles' : 'Manage hooks',
      onFooter: () => store.go({ name: kind === 'zone' ? 'zones' : kind === 'fingerprint' ? 'fingerprint' : 'hooks' } as never),
    }
  }

  if (t.valueKind === 'group' || t.valueKind === 'user') {
    const kind = t.valueKind
    const options: ValueOption[] =
      kind === 'group'
        ? store.groups.map((g) => ({ value: g.id, label: g.name, meta: `${g.memberCount.toLocaleString()} people`, icon: Users }))
        : store.users.map((u) => ({ value: u.id, label: u.name, meta: u.email, icon: UserRound }))
    return {
      options,
      names: values.map((id) => resolve(kind, id) ?? `deleted · ${id}`),
      footer: kind === 'user' && store.unlistedUsers > 0 ? `${store.unlistedUsers.toLocaleString()} more in the directory` : undefined,
    }
  }

  if (t.options?.length) return { options: t.options.map((o) => ({ value: o, label: o })), names: values }

  return { options: [], names: values }
}

