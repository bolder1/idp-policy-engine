import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Fingerprint, Globe, Layers, MapPin, Network, Search, UserRound, Users, Webhook, X, type LucideIcon } from 'lucide-react'

import { Picker } from '../picker'
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
   A condition, as ONE control.

   It was three: an attribute picker, an operator picker and a value trigger,
   side by side in a grid. Three controls is three decisions laid out as though
   they were independent, and they are not — the operators a condition can take
   come from the attribute, and the values come from the operator. Reading a
   row meant assembling one sentence out of three boxes, and changing a
   condition meant visiting them in order.

   So the row is a pill that reads as the sentence — `Network Zone · not in
   zone · Office Network +1` — and pressing it opens one panel holding all
   three, in the order they depend on each other. Jira's filter bar is the
   reference and it is right for a reason worth stating: a filter there is one
   chip you press, and everything about that filter is inside what opens. The
   chip is what you read; the panel is where you decide.

   Anchored, not centred. A dialog in the middle of the screen for "which
   zones" makes the panel the subject and the rule the background, when the
   whole point is that you are editing one row of a rule you can still see. The
   panel opens under the pill it belongs to and the rest of the form stays put.

   The positioning is `Picker`'s, deliberately — portalled to `document.body`
   and `position: fixed`, which is this codebase's proven un-clippable pattern,
   with the same flip-only-when-there-is-no-room rule, the same horizontal
   clamp, the same `capture: true` scroll listener so a nested scroller moves it
   too, and the same "stay hidden until measured" so nothing is ever seen at
   0,0. The inspector body IS a nested scroller, so that last part is not
   theoretical.
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

/* What the pill says on its right: one name, or one name and a count.

   Never a run of names. "Finance, Engineering, Contractors" in a 200px pill
   elides to "Finance, Engi…", which reads as a truncated single value rather
   than as three. "Finance +2" is the same information and cannot be misread. */
export function summarise(names: string[], placeholder: string): string {
  if (names.length === 0) return placeholder
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}

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
}: {
  c: Condition
  /** The chosen values, summarised for the pill. */
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
  /** Open on mount — a row that was just added has nothing in it yet. */
  autoOpen?: boolean
}) {
  const t = conditionType(c.typeId)
  const [open, setOpen] = useState(!!autoOpen)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const pop = useRef<HTMLDivElement | null>(null)
  const values = c.values.filter(Boolean)

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect()
    if (!a) return
    const p = pop.current?.getBoundingClientRect()
    const w = Math.max(a.width, p?.width ?? 300)
    const h = p?.height ?? 0
    const below = window.innerHeight - a.bottom
    const above = a.top
    /* Flip only when below genuinely lacks room AND above has more, which is
       the rule that stops a panel jumping sides as its own list is filtered. */
    const up = below < h + GAP + MARGIN && above > below
    /* Cap the height to the room on the side it opened, and let the LIST
       scroll inside it.

       Without this a tall panel opening from a pill low in the inspector had
       nowhere to fit: below was short, above was short, and the clamp to
       `MARGIN` pushed it up over the console header — a dropdown covering the
       whole screen to show six zones. The floor is 220 so it never collapses
       to a sliver on a very short window; below that, overlapping a little is
       better than being unusable. */
    const room = (up ? above : below) - GAP - MARGIN
    setPos({
      top: up ? Math.max(MARGIN, a.top - Math.min(h, Math.max(220, room)) - GAP) : a.bottom + GAP,
      left: Math.max(MARGIN, Math.min(a.left, window.innerWidth - w - MARGIN)),
      width: w,
      maxH: Math.max(220, room),
    })
  }, [])

  useEffect(() => {
    if (!open) {
      setPos(null)
      setQ('')
      return
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      /* Not `pop.current.contains` alone: the attribute and operator selects
         inside this panel are `Picker`s, which portal their own popup to the
         body — so a click on one of their options is outside BOTH refs and used
         to close this panel out from under the choice being made. */
      if (anchor.current?.contains(n) || pop.current?.contains(n)) return
      if ((n as HTMLElement).closest?.('.bx-picker__pop')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, place])

  // The list shrinks as you search, so the panel has to be re-placed under it.
  useEffect(() => {
    if (open) place()
  }, [q, open, place, c.typeId, c.operator])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => `${o.label} ${o.meta ?? ''} ${o.note ?? ''}`.toLowerCase().includes(needle))
  }, [options, q])

  const toggle = (v: string) =>
    onValues(single ? [v] : values.includes(v) ? values.filter((x) => x !== v) : [...values, v])

  const close = () => {
    setOpen(false)
    anchor.current?.focus()
  }

  return (
    <>
      <span className="cp__pill">
        <button
          ref={anchor}
          type="button"
          className={`cp__pill__main ${unset ? 'is-unset' : ''} ${open ? 'is-open' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          /* The whole sentence. `aria-label` REPLACES a button's text, so
             naming it after the attribute alone would announce the control and
             hide everything it is showing. */
          aria-label={[t.label, c.operator, unset ? 'nothing chosen' : names.length > 1 ? `${names[0]} and ${names.length - 1} more` : names[0] || summary, c.scope ? ZONE_SCOPE_LABEL[c.scope] : '']
            .filter(Boolean)
            .join(', ')}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault()
              setOpen(true)
            }
          }}
        >
          <b>{t.label}</b>
          <em>{c.operator}</em>
          <span className="cp__pill__val">{summary}</span>
          {c.scope && <i className="cp__pill__scope">{c.scope === 'ip' ? 'network' : 'map'}</i>}
          <ChevronDown size={12} strokeWidth={2.2} aria-hidden />
        </button>
        <button type="button" className="cp__pill__x" aria-label={`Remove ${t.label}`} title="Remove" onClick={onRemove}>
          <X size={12} strokeWidth={2.4} />
        </button>
      </span>

      {open &&
        createPortal(
          <div
            ref={pop}
            className="cp__pop"
            role="dialog"
            aria-label={`${t.label} condition`}
            /* Hidden until measured. Rendering at 0,0 for one frame is a panel
               seen in the corner of the screen on every open. */
            style={pos ? { top: pos.top, left: pos.left, minWidth: pos.width, maxHeight: pos.maxH } : { opacity: 0, pointerEvents: 'none' }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                close()
              }
            }}
          >
            {/* The three decisions, in the order they depend on each other:
                what is being checked, how, and against what. The attribute is
                first because changing it resets the other two. */}
            <div className="cp__head">
              <Picker
                label="What to check"
                width="fill"
                searchable
                value={c.typeId}
                options={[...CONDITION_CATALOGUE]
                  .sort((a, b) => conditionRank(a.id) - conditionRank(b.id))
                  .map((x) => ({ value: x.id, label: x.label, meta: x.group }))}
                onChange={onRetype}
              />
              <Picker
                label={`${t.label} operator`}
                width="fill"
                value={c.operator}
                options={t.operators.map((o) => ({ value: o, label: o }))}
                onChange={onOperator}
              />
            </div>

            {/* A zone's two halves. It is a property of the CONDITION, not of
                any one zone, so it is asked once above the list rather than
                once per row with no way to answer it once. */}
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

            <ValueBody
              c={c}
              options={options}
              shown={shown}
              q={q}
              setQ={setQ}
              single={single}
              values={values}
              toggle={toggle}
              onValues={onValues}
            />

            {(options.length > 0 || footer) && (
              <div className="cp__foot">
                {options.length > 0 && (
                  <span className="cp__count">
                    {shown.length === options.length ? `${options.length} of ${options.length}` : `${shown.length} of ${options.length}`}
                  </span>
                )}
                {footer &&
                  (onFooter ? (
                    <button type="button" className="cp__manage" onClick={onFooter}>
                      {footer} →
                    </button>
                  ) : (
                    <span className="cp__hint">{footer}</span>
                  ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

/* The value, by kind. Everything that can hold more than one thing is a
   searchable checkbox list; the three that are genuinely one control — a time
   window, a number with a unit, a line of text — are that control. */
function ValueBody({
  c,
  options,
  shown,
  q,
  setQ,
  single,
  values,
  toggle,
  onValues,
}: {
  c: Condition
  options: ValueOption[]
  shown: ValueOption[]
  q: string
  setQ: (v: string) => void
  single?: boolean
  values: string[]
  toggle: (v: string) => void
  onValues: (v: string[]) => void
}) {
  const t = conditionType(c.typeId)
  const field = useRef<HTMLInputElement | null>(null)
  const armed = useRef(false)

  /* Focus lands in the panel, through a callback ref rather than `autoFocus` or
     an effect. The panel is portalled and mounts in the same commit the state
     flips, so a ref callback is the one moment the node is certainly there —
     and `armed` stops the field grabbing focus back on every later re-render,
     which mid-typing is worse than never having taken it. */
  const take = (el: HTMLInputElement | null) => {
    if (!el || armed.current) return
    armed.current = true
    field.current = el
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

  return (
    <>
      <div className="cp__search">
        <Search size={14} strokeWidth={2} aria-hidden />
        <input ref={take} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${t.label}`} aria-label={`Search ${t.label}`} />
      </div>
      <div className="cp__list" role={single ? 'listbox' : 'group'} aria-label={t.label}>
        {shown.length === 0 ? (
          <p className="cp__none">Nothing matches “{q}”.</p>
        ) : (
          shown.map((o) => {
            const on = values.includes(o.value)
            const Ico = o.icon
            return (
              <button
                key={o.value}
                type="button"
                className={`cp__opt ${on ? 'is-on' : ''}`}
                role={single ? 'option' : 'checkbox'}
                aria-selected={single ? on : undefined}
                aria-checked={single ? undefined : on}
                onClick={() => toggle(o.value)}
              >
                <span className="cp__tick" aria-hidden>
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
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
    </>
  )
}

/** A row's leading keyword or joiner, kept out of the pill. */
export function condPlaceholder(): ReactNode {
  return null
}

/* The pill's right-hand text, by kind. Shared so the two builders cannot
   describe one condition two ways. */
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

