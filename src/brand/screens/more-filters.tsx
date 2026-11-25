import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AppWindow, Check, ChevronDown, Clock, Signpost, SlidersHorizontal, UserRound, UsersRound, type LucideIcon } from 'lucide-react'

import { Chip, SearchBox } from '../kit'
import type { App, Group, User } from '../data'
import { DECISION_BADGE_TONE, DECISION_ICON } from '../decision-words'
import { Face } from '../faces'
import { AppLogo } from '../logos/AppLogo'
import { shows } from '../rollout'
import {
  CHANGED,
  FILTER_LABEL,
  FILTER_ORDER,
  NO_FILTERS,
  OP_LABEL,
  OP_MARK,
  OUTCOMES,
  anySet,
  filterSummary,
  isSet,
  opOf,
  summaryText,
  withOp,
  type FilterOp,
  type PolicyFilterKey,
  type PolicyFilters,
} from './more-filters-model'
import './more-filters.css'

/* The More filters button, its dropdown, and the applied chips beside it (more-filters-model.ts). Picks apply as they
   are made; the chips are the record of what is applied. */

/* Compact (owner, 23 Nov 2026: "just like Jira … = and ≠ … in a dropdown … make the thing compact and beautiful"):
   each field reads is (=) or is not (≠), the lists carry app logos, faces and outcome marks, and the chip says the
   operator. Design only until the owner has checked it (rollout.ts `moreFiltersCompact`); off, everything is as it
   was. */
const COMPACT: boolean = shows('moreFiltersCompact')
/* No summary chip: the More filters button lights up instead (rollout.ts `filtersOnButton`). */
const FILTERS_ON_BUTTON: boolean = shows('filtersOnButton')

interface Option {
  value: string
  label: string
  sub?: string
  /** A logo, a face or a mark, drawn before the label (compact only). */
  art?: ReactNode
}

type ListKey = Exclude<PolicyFilterKey, 'changed'>

const FIELD_ICON: Record<PolicyFilterKey, LucideIcon> = {
  app: AppWindow,
  person: UserRound,
  group: UsersRound,
  outcome: Signpost,
  changed: Clock,
}

const OUTCOME_OPTIONS: Option[] = OUTCOMES.map((o) => {
  const Icon = DECISION_ICON[o.value]
  return {
    value: o.value,
    label: o.label,
    art: (
      <span className={`bmf__dmark is-${DECISION_BADGE_TONE[o.value]}`}>
        <Icon size={12} strokeWidth={2.2} />
      </span>
    ),
  }
})

export function MoreFilters({
  value,
  onChange,
  apps,
  users,
  groups,
}: {
  value: PolicyFilters
  onChange: (f: PolicyFilters) => void
  apps: readonly App[]
  users: readonly User[]
  groups: readonly Group[]
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PolicyFilterKey>('app')
  /* Compact: a field picked with the mouse puts the cursor in its search; one reached with the arrow keys leaves focus
     on the field list, so the arrows keep working. */
  const [focusSearch, setFocusSearch] = useState(true)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const keys = useRef<HTMLUListElement>(null)
  const uid = useId()
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      if (COMPACT) trigger.current?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  /* Compact: a field with no search (Rule outcome, Last changed) still takes focus on open, on its own tab. */
  useEffect(() => {
    if (!COMPACT || !open) return
    if (box.current?.querySelector('.bmf__pop')?.contains(document.activeElement)) return
    keys.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
  }, [open])

  const options: Record<'app' | 'person' | 'group', Option[]> = useMemo(
    () => ({
      app: apps.map((a) => ({
        value: a.id,
        label: a.name,
        art: COMPACT ? <AppLogo appId={a.id} name={a.name} size={20} /> : undefined,
      })),
      person: users.map((u) => ({
        value: u.id,
        label: u.name,
        sub: u.email,
        art: COMPACT ? <Face kind="user" name={u.name} size="sm" decorative /> : undefined,
      })),
      group: groups.map((g) => ({
        value: g.id,
        label: g.name,
        art: COMPACT ? <Face kind="group" name={g.name} size="sm" decorative /> : undefined,
      })),
    }),
    [apps, users, groups],
  )

  const nameOf = (k: PolicyFilterKey, v: string) =>
    k === 'outcome'
      ? (OUTCOMES.find((o) => o.value === v)?.label ?? v)
      : k === 'changed'
        ? (CHANGED.find((o) => o.value === v)?.label ?? v)
        : (options[k].find((o) => o.value === v)?.label ?? '(deleted)')

  /* Every applied value, attribute by attribute, in one line: the first three, then how many more. */
  const chipText = () => {
    const names = FILTER_ORDER.filter((k) => isSet(value, k)).flatMap((k) =>
      (k === 'changed' ? [value.changed] : (value[k] as string[])).map((v) => nameOf(k, v)),
    )
    const shown = names.slice(0, 3).join(', ')
    return names.length > 3 ? `${shown} +${names.length - 3} more` : shown
  }

  const openAt = (k: PolicyFilterKey) => {
    setTab(k)
    setFocusSearch(true)
    setOpen(true)
  }

  /* Compact: the field list is one tab stop, and the arrows move through it (selection follows focus). */
  const onKeysKey = (e: ReactKeyboardEvent) => {
    if (!COMPACT || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const n = FILTER_ORDER.length
    const i = FILTER_ORDER.indexOf(tab)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n
    setFocusSearch(false)
    setTab(FILTER_ORDER[next])
    keys.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  const summary = COMPACT ? filterSummary(value, nameOf) : []

  return (
    <div className="bmf" ref={box}>
      <button
        ref={trigger}
        type="button"
        className={`bmf__trigger ${anySet(value) ? 'is-set' : ''}${FILTERS_ON_BUTTON ? ' is-lit' : ''}`}
        /* With the chip gone, the button names what is applied on hover (`filtersOnButton`). */
        aria-haspopup="dialog"
        aria-expanded={open}
        title={FILTERS_ON_BUTTON && anySet(value) ? (COMPACT ? summaryText(summary) : chipText()) : 'More filters'}
        onClick={() => {
          setFocusSearch(true)
          setOpen((o) => !o)
        }}
      >
        <SlidersHorizontal size={14} strokeWidth={2} aria-hidden />
        <span className="bmf__label">More filters</span>
      </button>

      {/* One chip for everything applied (owner, 19 Nov 2026: "merge all into one"): its × clears them all, a click
          reopens the dropdown on the first applied attribute. */}
      {anySet(value) && !FILTERS_ON_BUTTON && (
        <Chip active onClick={() => openAt(FILTER_ORDER.find((k) => isSet(value, k)) ?? 'app')} removable onRemove={() => onChange(NO_FILTERS)}>
          {/* The chip cuts off with an ellipsis when the bar is short of room; the title keeps the whole list. */}
          {COMPACT ? (
            <b title={summaryText(summary)}>
              {summary.map((p, i) => (
                <Fragment key={p.key}>
                  {i > 0 && ' and '}
                  <span className="bmf__sumkey">{p.label}</span> <span className="bmf__summark">{p.mark}</span> {p.names}
                </Fragment>
              ))}
            </b>
          ) : (
            <b title={chipText()}>{chipText()}</b>
          )}
        </Chip>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            className={`bmf__pop${COMPACT ? ' is-compact' : ''}`}
            role="dialog"
            aria-label="More filters"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
          >
            <ul className="bmf__keys" role="tablist" aria-orientation="vertical" ref={keys} onKeyDown={onKeysKey}>
              {FILTER_ORDER.map((k) => {
                const Icon = FIELD_ICON[k]
                return (
                  <li key={k} role={COMPACT ? 'presentation' : undefined}>
                    <button
                      type="button"
                      role="tab"
                      id={COMPACT ? `${uid}-tab-${k}` : undefined}
                      aria-controls={COMPACT && tab === k ? `${uid}-panel` : undefined}
                      tabIndex={COMPACT ? (tab === k ? 0 : -1) : undefined}
                      aria-selected={tab === k}
                      className={`bmf__key ${tab === k ? 'is-on' : ''}`}
                      onClick={() => {
                        setFocusSearch(true)
                        setTab(k)
                      }}
                    >
                      {COMPACT && <Icon className="bmf__keyicon" size={14} strokeWidth={2} aria-hidden />}
                      {COMPACT ? <span className="bmf__keyname">{FILTER_LABEL[k]}</span> : FILTER_LABEL[k]}
                      {isSet(value, k) && <Check size={14} strokeWidth={2.2} aria-label="Applied" />}
                    </button>
                  </li>
                )
              })}
            </ul>
            {COMPACT ? (
              <FilterPane
                key={tab}
                field={tab}
                value={value}
                onChange={onChange}
                options={tab === 'outcome' ? OUTCOME_OPTIONS : tab === 'changed' ? [] : options[tab]}
                autoFocus={focusSearch}
                panelId={`${uid}-panel`}
                tabId={`${uid}-tab-${tab}`}
              />
            ) : (
              <div className="bmf__pane" role="tabpanel">
                {tab === 'outcome' ? (
                  <Checks
                    options={OUTCOMES}
                    picked={value.outcome}
                    onChange={(v) => onChange({ ...value, outcome: v as PolicyFilters['outcome'] })}
                  />
                ) : tab === 'changed' ? (
                  <div className="bmf__list" role="radiogroup" aria-label={FILTER_LABEL.changed}>
                    {CHANGED.map((o) => (
                      <label key={o.value || 'any'} className="bmf__opt">
                        <input
                          type="radio"
                          name="bmf-changed"
                          checked={value.changed === o.value}
                          onChange={() => onChange({ ...value, changed: o.value })}
                        />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <Searchable
                    key={tab}
                    label={FILTER_LABEL[tab]}
                    placeholder={tab === 'person' ? 'Search by name or email' : `Search ${FILTER_LABEL[tab].toLowerCase()}s`}
                    options={options[tab]}
                    picked={value[tab]}
                    onChange={(v) => onChange({ ...value, [tab]: v })}
                  />
                )}
                {isSet(value, tab) && (
                  <button type="button" className="bmf__reset" onClick={() => onChange({ ...value, [tab]: NO_FILTERS[tab] })}>
                    Clear {FILTER_LABEL[tab].toLowerCase()}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Checks({ options, picked, onChange }: { options: Option[]; picked: readonly string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="bmf__list">
      {options.map((o) => (
        <label key={o.value} className="bmf__opt">
          <input
            type="checkbox"
            checked={picked.includes(o.value)}
            onChange={(e) => onChange(e.target.checked ? [...picked, o.value] : picked.filter((v) => v !== o.value))}
          />
          <span>
            {o.label}
            {o.sub && <small>{o.sub}</small>}
          </span>
        </label>
      ))}
    </div>
  )
}

function Searchable({
  label,
  placeholder,
  options,
  picked,
  onChange,
}: {
  label: string
  placeholder: string
  options: Option[]
  picked: readonly string[]
  onChange: (v: string[]) => void
}) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  /* Picked first, so what is applied never scrolls out of sight. */
  const shown = options
    .filter((o) => !needle || o.label.toLowerCase().includes(needle) || o.sub?.toLowerCase().includes(needle))
    .sort((a, b) => Number(picked.includes(b.value)) - Number(picked.includes(a.value)))
  return (
    <>
      <input
        className="bmf__search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={`Search ${label.toLowerCase()}`}
        autoFocus
      />
      {shown.length ? <Checks options={shown} picked={picked} onChange={onChange} /> : <p className="bmf__none">No matches</p>}
    </>
  )
}

/* --- Compact (moreFiltersCompact) ----------------------------------------------------------------------------------- */

const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End']

/** Moves focus through the buttons under `root` for an arrow, Home or End key. */
function moveFocus(root: HTMLElement | null, key: string) {
  const items = Array.from(root?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
  if (!items.length) return
  const at = items.indexOf(document.activeElement as HTMLButtonElement)
  const next =
    key === 'Home' ? 0 : key === 'End' ? items.length - 1 : key === 'ArrowDown' ? Math.min(at + 1, items.length - 1) : Math.max(at - 1, 0)
  items[next]?.focus()
}

/** One field's half of the compact dropdown: = / ≠, the search where the list is long, and the list. Exported for its
    static-markup test; More filters is its only caller. */
export function FilterPane({
  field,
  value,
  onChange,
  options,
  autoFocus = false,
  panelId,
  tabId,
}: {
  field: PolicyFilterKey
  value: PolicyFilters
  onChange: (f: PolicyFilters) => void
  /** The field's choices; Last changed brings its own. */
  options: Option[]
  autoFocus?: boolean
  panelId?: string
  tabId?: string
}) {
  const label = FILTER_LABEL[field]
  const searchable = field === 'app' || field === 'person' || field === 'group'
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const rows = useRef<HTMLDivElement>(null)
  const picked = field === 'changed' ? [] : (value[field] as readonly string[])
  /* What was applied when the field opened comes first, so it never scrolls out of sight; a tick made now stays where
     it was clicked rather than jumping to the top under the pointer. */
  const [first] = useState(() => new Set(picked))

  /* As the field opens, or when its name is clicked again after the arrows reached it; a pick never moves the cursor. */
  useEffect(() => {
    if (autoFocus) input.current?.focus()
  }, [autoFocus])

  const needle = q.trim().toLowerCase()
  const shown = searchable
    ? options
        .filter((o) => !needle || o.label.toLowerCase().includes(needle) || o.sub?.toLowerCase().includes(needle))
        .sort((a, b) => Number(first.has(b.value)) - Number(first.has(a.value)))
    : options

  const setPicked = (v: string[]) => onChange({ ...value, [field as ListKey]: v } as PolicyFilters)

  /* Down from the search goes into the list; up from the list's first row comes back to it. */
  const onRowsKey = (e: ReactKeyboardEvent) => {
    if (!NAV_KEYS.includes(e.key)) return
    e.preventDefault()
    const firstRow = rows.current?.querySelector('button')
    if (e.key === 'ArrowUp' && searchable && document.activeElement === firstRow) input.current?.focus()
    else moveFocus(rows.current, e.key)
  }

  return (
    <div className="bmf__pane" role="tabpanel" id={panelId} aria-labelledby={tabId}>
      <div className="bmf__head">
        <OpMenu field={label} op={opOf(value, field)} onChange={(op) => onChange(withOp(value, field, op))} />
        {searchable && (
          // A wrapper for the Down key: the kit's box takes no key handler of its own.
          <div
            className="bmf__find"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown') return
              e.preventDefault()
              rows.current?.querySelector('button')?.focus()
            }}
          >
            <SearchBox
              block
              value={q}
              onChange={setQ}
              inputRef={input}
              label={`Search ${label.toLowerCase()}`}
              placeholder={field === 'person' ? 'Search by name or email' : `Search ${label.toLowerCase()}s`}
            />
          </div>
        )}
      </div>

      {field === 'changed' ? (
        <div className="bmf__rows" role="radiogroup" aria-label={label} ref={rows} onKeyDown={onRowsKey}>
          {CHANGED.map((o) => {
            const on = value.changed === o.value
            return (
              <button
                key={o.value || 'any'}
                type="button"
                role="radio"
                aria-checked={on}
                className={`bmf__row${on ? ' is-on' : ''}`}
                onClick={() => onChange({ ...value, changed: o.value })}
              >
                <span className="bmf__radio" aria-hidden />
                <span className="bmf__text">
                  <b>{o.label}</b>
                </span>
              </button>
            )
          })}
        </div>
      ) : shown.length ? (
        <div className="bmf__rows" role="group" aria-label={label} ref={rows} onKeyDown={onRowsKey}>
          {shown.map((o) => {
            const on = picked.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`bmf__row${on ? ' is-on' : ''}`}
                onClick={() => setPicked(on ? picked.filter((v) => v !== o.value) : [...picked, o.value])}
              >
                <span className="bx-tick" aria-hidden>
                  <Check size={11} strokeWidth={3.2} />
                </span>
                {o.art && (
                  <span className="bmf__art" aria-hidden>
                    {o.art}
                  </span>
                )}
                <span className="bmf__text">
                  <b>{o.label}</b>
                  {o.sub && <small>{o.sub}</small>}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="bmf__none">No matches</p>
      )}

      {isSet(value, field) && (
        <button
          type="button"
          className="bmf__reset"
          onClick={() => onChange(withOp({ ...value, [field]: NO_FILTERS[field] } as PolicyFilters, field, 'is'))}
        >
          Clear {label.toLowerCase()}
        </button>
      )}
    </div>
  )
}

/** = is / ≠ is not, for one field: a small menu inside the dropdown, so a pick never closes More filters. */
function OpMenu({ field, op, onChange }: { field: string; op: FilterOp; onChange: (op: FilterOp) => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const shut = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div className="bmf__opwrap" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className={`bmf__op${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${field} ${OP_LABEL[op]}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
          e.preventDefault()
          setOpen(true)
        }}
      >
        <span className="bmf__mark" aria-hidden>
          {OP_MARK[op]}
        </span>
        <span>{OP_LABEL[op]}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <motion.ul
          ref={list}
          id={id}
          className="bmf__opmenu"
          role="listbox"
          aria-label={`${field}: is or is not`}
          initial={reduce ? false : { opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              /* Only this menu closes; More filters stays open. */
              e.stopPropagation()
              shut()
            } else if (e.key === 'Tab') setOpen(false)
            else if (NAV_KEYS.includes(e.key)) {
              e.preventDefault()
              moveFocus(list.current, e.key)
            }
          }}
        >
          {(['is', 'not'] as const).map((o) => (
            <li key={o} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={o === op}
                className={o === op ? 'is-on' : ''}
                onClick={() => {
                  onChange(o)
                  shut()
                }}
              >
                <span className="bmf__mark" aria-hidden>
                  {OP_MARK[o]}
                </span>
                <span>{OP_LABEL[o]}</span>
                {o === op && <Check size={14} strokeWidth={2.4} aria-hidden />}
              </button>
            </li>
          ))}
        </motion.ul>
      )}
    </div>
  )
}
