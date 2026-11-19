import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, SlidersHorizontal } from 'lucide-react'

import { Chip } from '../kit'
import type { App, Group, User } from '../data'
import {
  CHANGED,
  FILTER_LABEL,
  FILTER_ORDER,
  NO_FILTERS,
  OUTCOMES,
  anySet,
  isSet,
  type PolicyFilterKey,
  type PolicyFilters,
} from './more-filters-model'
import './more-filters.css'

/* The More filters button, its dropdown, and the applied chips beside it (more-filters-model.ts). Picks apply as they
   are made; the chips are the record of what is applied. */

interface Option {
  value: string
  label: string
  sub?: string
}

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
  const box = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const options: Record<'app' | 'person' | 'group', Option[]> = useMemo(
    () => ({
      app: apps.map((a) => ({ value: a.id, label: a.name })),
      person: users.map((u) => ({ value: u.id, label: u.name, sub: u.email })),
      group: groups.map((g) => ({ value: g.id, label: g.name })),
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
    setOpen(true)
  }

  return (
    <div className="bmf" ref={box}>
      <button
        type="button"
        className={`bmf__trigger ${anySet(value) ? 'is-set' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal size={14} strokeWidth={2} aria-hidden />
        More filters
      </button>

      {/* One chip for everything applied (owner, 19 Nov 2026: "merge all into one"): its × clears them all, a click
          reopens the dropdown on the first applied attribute. */}
      {anySet(value) && (
        <Chip active onClick={() => openAt(FILTER_ORDER.find((k) => isSet(value, k)) ?? 'app')} removable onRemove={() => onChange(NO_FILTERS)}>
          <b>{chipText()}</b>
        </Chip>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            className="bmf__pop"
            role="dialog"
            aria-label="More filters"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
          >
            <ul className="bmf__keys" role="tablist" aria-orientation="vertical">
              {FILTER_ORDER.map((k) => (
                <li key={k}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    className={`bmf__key ${tab === k ? 'is-on' : ''}`}
                    onClick={() => setTab(k)}
                  >
                    {FILTER_LABEL[k]}
                    {isSet(value, k) && <Check size={14} strokeWidth={2.2} aria-label="Applied" />}
                  </button>
                </li>
              ))}
            </ul>
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
