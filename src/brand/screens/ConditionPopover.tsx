import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeftRight,
  Ban,
  Check,
  ChevronDown,
  CircleCheck,
  Fingerprint,
  Globe,
  Layers,
  MapPin,
  Network,
  Search,
  Trash2,
  UserRound,
  Users,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react'

/* What an operator IS, as a glyph.

   Every operator in the catalogue is one of three things: it asserts, it
   negates, or it spans. Drawing the distinction is worth a mark; drawing nine
   different marks for nine spellings of those three would be decoration.

   Read with `includes('not')`, which is the same substring test the evaluator
   uses — so the glyph and the decision cannot disagree about which operator is
   a negation. */
const operatorIcon = (o: string): LucideIcon =>
  o.includes('not') ? Ban : o === 'between' ? ArrowLeftRight : CircleCheck

import { EmptyState } from '../empty'
import { modeLabel } from '../fingerprint'
import { conditionIcon } from './board/tones'
import type { BrandStore } from '../store'
import type { NameLookup } from './predicate-prose'
import {
  TIMEZONES,
  ZONE_SCOPE_LABEL,
  WHEN_CONDITIONS,
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
  /* Shown, and not choosable.

     Only one thing uses it today — the ML risk row, which is listed so the
     risk section reads as a section that is going to grow. `disabled` on the
     button rather than `aria-disabled`: there is no explanation to announce on
     press and nothing happens if you try, so the control that is dead is dead
     to the keyboard too. */
  disabled?: boolean
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
  onKey,
  onTz,
  onRemove,
  footer,
  onFooter,
  autoOpen,
  stacked,
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
  /** Which attribute — `user-attr` and `custom-attr` only. */
  onKey: (k: string) => void
  /** Which timezone the window is read in — `time` only. `''` is the tenant's. */
  onTz: (tz: string) => void
  onRemove: () => void
  footer?: string
  onFooter?: () => void
  /** A row that was just added: start it at the first UNANSWERED decision. */
  autoOpen?: boolean
  /* One condition as three stacked full-width rows rather than one pill.

     The pill is right where there is room for a sentence: `Device profile ·
     matches · Corporate managed` reads left to right and takes one line. The
     inspector is 400px, and at that width three segments share the space by
     truncating the one that carries the answer — a zone condition naming two
     zones came out as `Office Netw…`, which is the part you were reading.

     Stacked, every control gets the full width and none of them truncate. It
     costs three lines per condition instead of one, and that is the trade: the
     panel scrolls, and nothing in it is unreadable. The trail builder is wide
     and keeps the pill.

     One component either way. The menus, the value sources, the summary and
     every keyboard path are shared — what differs is how the three triggers are
     arranged, which is the only thing that should differ. */
  stacked?: boolean
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

  const valueLabel = `Change what ${t.label} is compared against. Currently ${
    unset ? 'nothing chosen' : names.length > 1 ? `${names[0]} and ${names.length - 1} more` : names[0] || summary
  }.`

  /* Which half of a zone, when it is narrower than the zone as written. Absent
     for "both", because that is what the zone means already. */
  const scopeTag = c.scope ? <i className="cp__scopetag">{c.scope === 'ip' ? 'network' : 'map'}</i> : null

  /* A window and a threshold are TYPED, not chosen from a list, and stacked
     there is room to type them where they belong. The pill has to send them to
     a popover — three segments on one line cannot hold two time inputs — so
     this is the one behaviour the two arrangements do differently, and it is
     the arrangement with room doing less work rather than more. */
  const typedValue =
    t.valueKind === 'time' ? (
      <div className="cp__inline">
        <input
          type="time"
          className="cp__fldinput"
          aria-label={`${t.label} from`}
          value={c.values[0] ?? '09:00'}
          onChange={(e) => onValues([e.target.value, c.values[1] ?? '17:00'])}
        />
        <span className="cp__to">to</span>
        <input
          type="time"
          className="cp__fldinput"
          aria-label={`${t.label} to`}
          value={c.values[1] ?? '17:00'}
          onChange={(e) => onValues([c.values[0] ?? '09:00', e.target.value])}
        />
      </div>
    ) : t.valueKind === 'range' ? (
      <div className="cp__inline">
        <input
          type="number"
          className="cp__fldinput is-num"
          aria-label={t.label}
          placeholder="0"
          value={values[0] ?? ''}
          onChange={(e) => onValues([e.target.value])}
        />
        <span className="cp__unit">score</span>
      </div>
    ) : t.valueKind === 'text' ? (
      <input
        className="cp__fldinput is-text"
        aria-label={`What ${c.key || t.label} is compared against`}
        placeholder="Value…"
        value={values[0] ?? ''}
        onChange={(e) => onValues([e.target.value])}
      />
    ) : null

  /* The subject, when the type does not fix it.

     "User attribute is FTE" is not a question until it says WHICH attribute, so
     the row goes ABOVE the operator — it is the other half of the noun, not a
     setting on the comparison. A known field is a list and cannot be
     misspelled; a tenant's own is typed, because a list cannot hold a key this
     product has never heard of. */
  const keyRow =
    t.valueKind !== 'text' ? null : t.keys?.length ? (
      <select
        className="cp__fldsel"
        aria-label="Which attribute"
        value={c.key ?? ''}
        onChange={(e) => onKey(e.target.value)}
      >
        <option value="">Choose an attribute…</option>
        {t.keys.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    ) : (
      <input
        className="cp__fldinput is-text"
        aria-label="Which attribute"
        placeholder="Attribute name…"
        value={c.key ?? ''}
        onChange={(e) => onKey(e.target.value)}
      />
    )

  /* The zone the window is read in, under the window.

     Below rather than above, because it narrows an answer already given: the
     hours are the decision and the timezone is what they are measured against.
     "Tenant timezone" is the empty value and the default, which is what every
     window meant before this control existed. */
  const tzRow =
    t.valueKind !== 'time' ? null : (
      <select className="cp__fldsel" aria-label="Timezone" value={c.tz ?? ''} onChange={(e) => onTz(e.target.value)}>
        <option value="">Tenant timezone</option>
        {TIMEZONES.map((z) => (
          <option key={z} value={z}>
            {z}
          </option>
        ))}
      </select>
    )

  const triggers = stacked ? (
    /* Three rows, top to bottom, in the order they depend on each other:
       what is checked, how it is compared, what it is compared against. */
    <div className={`cp__stack ${unset ? 'is-unset' : ''}`}>
      <div className="cp__stackhead">
        {!hideAttribute ? (
          <Field
            ref={whatRef}
            kind="what"
            icon={conditionIcon(t.id, t.group)}
            open={open === 'what'}
            label={`Change what is checked. Currently ${t.label}.`}
            onOpen={() => setOpen((o) => (o === 'what' ? null : 'what'))}
          >
            {t.label}
          </Field>
        ) : (
          /* The Who pane owns the attribute, so the row opens on its operator
             and the head is just the label and the way out. */
          <span className="cp__stacklabel">
            <GroupIcon icon={conditionIcon(t.id, t.group)} />
            {t.label}
          </span>
        )}
        <button type="button" className="cp__del" aria-label={`Remove ${t.label}`} title="Remove" onClick={onRemove}>
          <Trash2 size={14} strokeWidth={1.9} />
        </button>
      </div>

      {keyRow}

      <Field
        ref={opRef}
        kind="op"
        open={open === 'op'}
        label={`Change how ${t.label} is compared. Currently ${c.operator}.`}
        onOpen={() => setOpen((o) => (o === 'op' ? null : 'op'))}
      >
        {c.operator}
      </Field>

      {typedValue ?? (
        <Field
          ref={valRef}
          kind="val"
          open={open === 'val'}
          unset={unset}
          label={valueLabel}
          onOpen={() => setOpen((o) => (o === 'val' ? null : 'val'))}
        >
          {summary}
          {scopeTag}
        </Field>
      )}
      {tzRow}
    </div>
  ) : (
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
        label={valueLabel}
        onOpen={() => setOpen((o) => (o === 'val' ? null : 'val'))}
      >
        {summary}
        {scopeTag}
      </Seg>

      <button type="button" className="cp__pill__x" aria-label={`Remove ${t.label}`} title="Remove" onClick={onRemove}>
        <X size={12} strokeWidth={2.4} />
      </button>
    </span>
  )

  return (
    <>
      {triggers}

      {open && !(stacked && open === 'val' && typedValue) && (
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
              /* No search, and the sort is gone with it.

                 Both existed for a twenty-four row list scattered across nine
                 components: you searched because you could not see the row you
                 wanted, and `conditionRank` floated seven rows above the
                 taxonomy because the taxonomy had put them five components
                 apart. Four rows are all on screen. A search field over four
                 rows can only ever hide three of them, and a lead order over
                 four is an order nobody can perceive.

                 `WHEN_CONDITIONS` and not the catalogue: `group` and `user` are
                 in the catalogue for the Who step to resolve its labels
                 through, and retyping a circumstance into an audience here
                 would put the audience in two places. */
              items={WHEN_CONDITIONS
                /* The family's own glyph, the same one the card and the editor
                   draw. Four rows do not need finding, but the mark is what
                   tells you at a glance that two of them are about the same
                   thing. */
                /* No `meta`. It carried the component name — "Time" under
                   "Time of day", "Attributes" under "User attribute" — which is
                   a second line restating the first word of the row above it.
                   Nine rows, nine echoes. The mark already groups them. */
                .map((x) => ({
                  value: x.id,
                  label: x.label,
                  note: x.soon ? 'Coming soon' : undefined,
                  icon: conditionIcon(x.id, x.group),
                  disabled: x.soon,
                }))}
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
              /* Two marks, not nine. An operator list is `in` / `not in`, or
                 `is` / `is not` — a pair whose whole content is whether it is
                 the affirmative or the negation, so that is what the glyph
                 says. `between` is the one worth drawing separately: it is
                 neither, it is a range. */
              items={t.operators.map((o) => ({ value: o, label: o, icon: operatorIcon(o) }))}
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
    const h = p?.height ?? 0
    /* Anchor-derived, never self-derived. Feeding the panel's own measured
       border-box width back as a content-box `minWidth` widened it by its
       border on every placement, and placement runs on every scroll event —
       see the long note in `picker.tsx`, which had the identical bug. The
       measurement is still read below, to keep the right edge on screen. */
    const w = Math.max(a.width, 240)
    const shown = Math.max(w, p?.width ?? 0)
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
      left: Math.max(MARGIN, Math.min(a.left, window.innerWidth - shown - MARGIN)),
      width: w,
      maxH,
    })
  }, [anchor])

  // Before paint, so the panel is never seen at its unplaced position.
  useLayoutEffect(place, [place, watch])

  useEffect(() => {
    // A scroll of the panel's own list does not move the panel.
    const onScroll = (e: Event) => {
      if (pop.current?.contains(e.target as Node)) return
      place()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (anchor.current?.contains(n) || pop.current?.contains(n)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
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

/* One full-width trigger: a mark, a value, a chevron.

   It looks like a select and is not one — the menu behind it is `Pop`, the same
   portalled, flip-and-clamp panel the pill opens, because the choices are
   multi-select lists with search and a footer that navigates. What is borrowed
   from a select is the SHAPE, which is what makes a column of three of them
   read as one form rather than three chips that happen to be stacked. */
function GroupIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon size={14} strokeWidth={1.9} className="cp__fldicon" aria-hidden />
}

function Field({
  ref,
  kind,
  icon,
  open,
  unset,
  label,
  onOpen,
  children,
}: {
  ref: RefObject<HTMLButtonElement | null>
  kind: Part
  icon?: LucideIcon
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
      className={`cp__fld is-${kind} ${open ? 'is-open' : ''} ${unset ? 'is-unset' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={label}
      onClick={onOpen}
    >
      {icon && <GroupIcon icon={icon} />}
      <span className="cp__fldtext">{children}</span>
      <ChevronDown size={13} strokeWidth={2} aria-hidden />
    </button>
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
              className={`cp__opt ${on ? 'is-on' : ''} ${single ? 'is-single' : ''} ${o.disabled ? 'is-soon' : ''}`}
              role={single ? 'option' : 'checkbox'}
              aria-selected={single ? on : undefined}
              aria-checked={single ? undefined : on}
              disabled={o.disabled}
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

  /* An empty list is an empty LIBRARY now, and that changes what belongs here.

     This was a free-text box, and the guard is `options.length === 0` rather
     than `valueKind === 'text'` — which was fine while `ip`, `mac` and
     `user-attr` existed, because those kinds genuinely had no list and a typed
     value was the whole point of them.

     Those kinds are gone. The only way to reach this branch now is a tenant
     with no zones or no device profiles, and the box would let somebody type a
     raw string into a zone condition's `values` — the exact capability the
     catalogue was shrunk to remove, surviving through the back door, and
     producing a condition that names a zone that does not exist and therefore
     never matches.

     It is not hypothetical: the `first-run` persona boots at depth `none`, and
     `zonesAt('none')` returns `[]`.

     So: the empty state, and the way out of it. The footer's "Manage zones →"
     already exists and already navigates — it just never rendered in the one
     case where it is the only useful control on the panel. */
  if (options.length === 0) {
      const lib =
      t.valueKind === 'zone' ? 'zone' : t.valueKind === 'fingerprint' ? 'device profile' : t.valueKind === 'hook' ? 'hook' : null
    return (
      <div className="cp__body">
        <EmptyState
          compact
          icon={t.valueKind === 'fingerprint' ? Fingerprint : Globe}
          title={lib ? `No ${lib}s yet` : 'Nothing to choose'}
          blurb={
            lib === 'zone'
              ? 'A zone is the only way a rule can name a network or a place. Create one, then come back to this condition.'
              : lib === 'device profile'
                ? 'A device profile is the only way a rule can name a device. Create one, then come back to this condition.'
                : 'This attribute has no values to offer.'
          }
          action={
            onFooter ? (
              <button type="button" className="cp__manage" onClick={onFooter}>
                {footer} →
              </button>
            ) : undefined
          }
        />
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
  /* The two library kinds, and they are the only way to say what they say.

     A zone and a device profile are no longer one option among several for
     describing a network or a device — since the inline attributes went, they
     are the ONLY way. Which raises the stakes on the footer: a tenant with no
     zones cannot write a network rule at all, so "Manage zones →" is not a
     convenience link here, it is the route out of a dead end. `EMPTY` below is
     what the list says when it has nothing to offer. */
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
          : /* Sync hooks only. An attribute-sync hook writes values onto the
               user out of band; it has no answer to give a rule that is waiting
               on it, and offering one here would be offering a condition that
               can never resolve. */
            store.hooks
              .filter((h) => h.mode === 'sync')
              .map((h) => ({ value: h.id, label: h.name, meta: `Answers within ${h.timeoutMs}ms`, icon: Webhook }))
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


/* -----------------------------------------------------------------------------
   The catalogue, as a list and nothing else.

   Six rows. That is the whole reason this replaces an 800px two-column dialog
   with a category rail down the left, a search field that spanned every
   component, an arrow-key cursor and a per-category count.

   Each of those existed to solve a problem twenty-four attributes across nine
   components had. You searched because you could not see the row you wanted;
   the rail existed because nine components do not fit above a list; the lead
   order existed because the taxonomy scattered the seven rows people actually
   reached for; the cursor existed because a list you search is a list you
   navigate. None of those problems survive at six rows, and each control that
   outlives its problem is a thing to operate before you can do the thing you
   came to do.

   Inline, not a dialog and not a popover — and there is a scar here worth
   naming, because the trail's own header records it. An inline catalogue was
   tried before and was reverted: "an inline panel inside the only scroller on
   the screen is clipped by it, so the list opened a few rows tall at the bottom
   of a rule and the rest of it could only be reached by scrolling the thing the
   list was pinned to."

   That was true, and it was true of twenty-four rows. Six rows is roughly
   200px; if the bottom of it is below the fold, the thing you scroll to reach
   it is the panel it is already part of, and it does not move under you while
   you do — which is exactly what the portalled version could not promise. So
   the flip-and-clamp machinery in `Pop` above is not used here at all: nothing
   to flip, nothing to clamp, nothing to re-measure on scroll.
   -------------------------------------------------------------------------- */

/* `ConditionSelect` stood here for one commit: the nine as a native `<select>`,
   for the empty state. It was the wrong answer to a real complaint — the list
   there was 250px wide under a wider sentence, which reads as something that
   failed to load. The fix for a width is a width. A select also drops the
   marks, and at nine rows the mark is most of what tells them apart.

   One catalogue, one component. */
export function ConditionList({
  label,
  onPick,
  onCancel,
}: {
  /** What is being added, and to where. The heading, and the group's name. */
  label: string
  onPick: (typeId: string) => void
  onCancel: () => void
}) {
  return (
    <div className="cp__cat" role="group" aria-label={label}>
      <p className="cp__cathead">
        <span>{label}</span>
        <button type="button" className="cp__catx" onClick={onCancel} aria-label="Cancel">
          <X size={13} strokeWidth={2.2} />
        </button>
      </p>

      {WHEN_CONDITIONS.map((t) => {
        const Ico = conditionIcon(t.id, t.group)
        return (
          <button
            key={t.id}
            type="button"
            className={`cp__catrow ${t.soon ? 'is-soon' : ''}`}
            disabled={t.soon}
            onClick={() => onPick(t.id)}
          >
            <Ico size={15} strokeWidth={1.9} aria-hidden />
            <span className="cp__catname">
              {t.label}
              {/* The one placeholder, and it says which. `WhatEditor` deleted a
                  "Coming soon" tile on the argument that a promise is not a
                  control — the difference is that this one is a row in a list
                  rather than a third of the width of the only control on a
                  pane, and the section it is in would otherwise read as
                  finished at one row. */}
              {t.soon && <i className="cp__catsoon">Coming soon</i>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
