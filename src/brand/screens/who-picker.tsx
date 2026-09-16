import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { BookUser, Check, Plus, UserRound, Users, X } from 'lucide-react'

import { Badge, Button } from '../kit'
import { EmptyState, NoMatches } from '../empty'
import type { Audience, Group, RuleWho, User } from '../data'
import { outsideAudience } from '../audience-ops'
import { normaliseWho, type WhoKind } from '../rule-who'
import './who-picker.css'

/* -----------------------------------------------------------------------------
   Who a rule applies to, as one control.

   It writes `Rule.who` and nothing else. The rule's If cards are not touched
   and not read, whatever shape they have — who is ANDed with the whole WHEN,
   so there is no "more than one place to be".

   One field: "Everyone" until something is chosen, then the chosen groups and
   people as removable badges, with a search that lists both. Exceptions are a
   second field of the same kind, closed until somebody asks for one.

   Keyboard: type to search, Up and Down to move, Enter to choose or unchoose,
   Escape to close the list, Backspace on an empty search to remove the last
   choice. Every badge's remove button is a tab stop.
   -------------------------------------------------------------------------- */

interface Item {
  kind: WhoKind
  id: string
  name: string
  meta: string
}

/** How many people the list shows before a search is needed. Groups are always all listed. */
const PEOPLE_SHOWN = 50

const keyOf = (kind: WhoKind, id: string) => `${kind}:${id}`

export function WhoPicker({
  who,
  onChange,
  audience,
  directory,
  groups,
  compact,
}: {
  who?: RuleWho
  /** Called with the normalised who, or `undefined` for everyone. */
  onChange: (who?: RuleWho) => void
  /** The policy's audience, for marking what the policy does not govern. Never written. */
  audience: Audience
  directory: User[]
  groups: Group[]
  compact?: boolean
}) {
  const w = normaliseWho(who)
  const base: RuleWho = w ?? { groupIds: [], userIds: [] }
  const exceptGroupIds = base.exceptGroupIds ?? []
  const exceptUserIds = base.exceptUserIds ?? []
  const hasExcept = exceptGroupIds.length + exceptUserIds.length > 0
  const [exceptOpen, setExceptOpen] = useState(false)
  /* Where "Add exception" will be, for focus after the last exception goes. */
  const addExcept = useRef<HTMLDivElement>(null)

  const write = (next: RuleWho) => onChange(normaliseWho(next))

  const included = new Set([...base.groupIds.map((id) => keyOf('group', id)), ...base.userIds.map((id) => keyOf('user', id))])
  const excepted = new Set([...exceptGroupIds.map((id) => keyOf('group', id)), ...exceptUserIds.map((id) => keyOf('user', id))])

  return (
    <div className={`wp${compact ? ' is-compact' : ''}`}>
      <WhoField
        groupIds={base.groupIds}
        userIds={base.userIds}
        hidden={excepted}
        onChange={(groupIds, userIds) => write({ ...base, groupIds, userIds })}
        audience={audience}
        directory={directory}
        groups={groups}
        compact={compact}
        flagOutside
        emptyText="Everyone"
        placeholder="Add groups or people"
        label="Who this rule applies to"
      />

      {hasExcept || exceptOpen ? (
        <div className="wp__except">
          <span className="wp__exceptlabel">Except</span>
          <WhoField
            groupIds={exceptGroupIds}
            userIds={exceptUserIds}
            hidden={included}
            onChange={(g, u) => {
              write({ ...base, exceptGroupIds: g, exceptUserIds: u })
              /* The last exception removed: the field closes, and its badges and
                 search go with it. Focus goes to "Add exception" rather than
                 falling to the page. */
              if (g.length + u.length === 0 && !exceptOpen) {
                requestAnimationFrame(() => addExcept.current?.querySelector<HTMLElement>('button')?.focus())
              }
            }}
            audience={audience}
            directory={directory}
            groups={groups}
            compact={compact}
            placeholder="Add groups or people to leave out"
            label="Exceptions"
            focusOnMount={exceptOpen && !hasExcept}
          />
        </div>
      ) : (
        <div ref={addExcept}>
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setExceptOpen(true)}>
            Add exception
          </Button>
        </div>
      )}
    </div>
  )
}

/* One list of groups and people, searchable, as a combobox. Used twice: the
   people a rule applies to, and the people it leaves out. */
function WhoField({
  groupIds,
  userIds,
  hidden,
  onChange,
  audience,
  directory,
  groups,
  compact,
  flagOutside = false,
  emptyText,
  placeholder,
  label,
  focusOnMount = false,
}: {
  groupIds: string[]
  userIds: string[]
  /** Items chosen in the other field, which this one does not offer. */
  hidden: Set<string>
  onChange: (groupIds: string[], userIds: string[]) => void
  audience: Audience
  directory: User[]
  groups: Group[]
  compact?: boolean
  flagOutside?: boolean
  emptyText?: string
  placeholder: string
  label: string
  focusOnMount?: boolean
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus()
  }, [focusOnMount])

  const isOutside = (kind: WhoKind, id: string) => {
    if (!flagOutside) return false
    const o = outsideAudience(audience, kind === 'group' ? [id] : [], kind === 'user' ? [id] : [], directory)
    return o.groups.length + o.users.length > 0
  }

  const chosen: Item[] = [
    ...groupIds.map((id) => ({ kind: 'group' as const, id, name: groups.find((g) => g.id === id)?.name ?? id, meta: '' })),
    ...userIds.map((id) => ({ kind: 'user' as const, id, name: directory.find((u) => u.id === id)?.name ?? id, meta: '' })),
  ]
  const isChosen = (it: Item) => (it.kind === 'group' ? groupIds.includes(it.id) : userIds.includes(it.id))

  const query = q.trim().toLowerCase()
  const groupRows: Item[] = groups
    .filter((g) => !hidden.has(keyOf('group', g.id)) && (!query || g.name.toLowerCase().includes(query)))
    .map((g) => ({ kind: 'group', id: g.id, name: g.name, meta: `${g.memberCount.toLocaleString()} members` }))
  const people = directory.filter(
    (u) =>
      !hidden.has(keyOf('user', u.id)) &&
      (!query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)),
  )
  const peopleRows: Item[] = people.slice(0, PEOPLE_SHOWN).map((u) => ({ kind: 'user', id: u.id, name: u.name, meta: u.email }))
  const options = [...groupRows, ...peopleRows]
  const at = Math.min(active, Math.max(0, options.length - 1))

  const toggle = (it: Item) => {
    const on = isChosen(it)
    if (it.kind === 'group') onChange(on ? groupIds.filter((x) => x !== it.id) : [...groupIds, it.id], userIds)
    else onChange(groupIds, on ? userIds.filter((x) => x !== it.id) : [...userIds, it.id])
    setQ('')
    inputRef.current?.focus()
  }

  /* A badge's remove button goes with the badge, and focus fell to <body> —
     where Backspace deletes the selected rule on the board. Focus moves to the
     next badge's remove button, the previous one when it was the last, or the
     search when none are left. */
  const remove = (it: Item, refocus = false) => {
    const at = chosen.findIndex((c) => c.kind === it.kind && c.id === it.id)
    if (it.kind === 'group') onChange(groupIds.filter((x) => x !== it.id), userIds)
    else onChange(groupIds, userIds.filter((x) => x !== it.id))
    if (!refocus) return
    const rest = chosen.filter((_, i) => i !== at)
    const target = rest[Math.min(at, rest.length - 1)]
    requestAnimationFrame(() => {
      const next = target
        ? chipsRef.current?.querySelector<HTMLElement>(`[data-chip="${keyOf(target.kind, target.id)}"] button`)
        : null
      ;(next ?? inputRef.current)?.focus()
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      else setActive(Math.max(0, Math.min(at + 1, options.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive(Math.max(at - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && options[at]) {
        e.preventDefault()
        toggle(options[at])
      }
    } else if (e.key === 'Escape') {
      if (open) {
        /* Closes the list and nothing else: a drawer or dialog around this
           must not close on the same key. */
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    } else if (e.key === 'Backspace' && q === '' && chosen.length > 0) {
      remove(chosen[chosen.length - 1])
    }
  }

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
  }

  const outsideChosen = chosen.filter((it) => isOutside(it.kind, it.id))

  return (
    <div className="wp__wrap" onBlur={onBlur}>
      <div className="wp__anchor">
        <div className="wp__field" ref={chipsRef} onClick={() => inputRef.current?.focus()}>
          {chosen.length === 0 && emptyText && <span className="wp__all">{emptyText}</span>}
          {chosen.map((it) => {
            const out = isOutside(it.kind, it.id)
            return (
              <span key={keyOf(it.kind, it.id)} data-chip={keyOf(it.kind, it.id)} className="wp__chip" title={out ? 'Outside this policy' : undefined}>
                <Badge tone={out ? 'notice' : 'info'}>{it.name}</Badge>
                {out && <span className="u-sr-only">Outside this policy</span>}
                <button
                  type="button"
                  className="wp__chipx"
                  aria-label={`Remove ${it.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(it, true)
                  }}
                >
                  <X size={12} strokeWidth={2.2} aria-hidden />
                </button>
              </span>
            )
          })}
          <input
            ref={inputRef}
            className="wp__input"
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options[at] ? `${listId}-${at}` : undefined}
            value={q}
            placeholder={placeholder}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        </div>

        {open && (
          <ul className="wp__list" id={listId} role="listbox" aria-label={label} aria-multiselectable="true">
            {/* A full empty state in both cases: a directory with nobody in it,
                and a search that found nobody. */}
            {options.length === 0 && (
              <li role="presentation" className="wp__empty">
                {query ? (
                  <NoMatches
                    compact
                    noun="groups or people"
                    query={q}
                    onClear={() => {
                      setQ('')
                      inputRef.current?.focus()
                    }}
                  />
                ) : (
                  <EmptyState
                    compact
                    icon={BookUser}
                    title="No groups or people"
                    blurb="Add users and groups to the directory first."
                  />
                )}
              </li>
            )}
            {options.map((it, i) => {
              const on = isChosen(it)
              const Ico = it.kind === 'group' ? Users : UserRound
              return (
                <li
                  key={keyOf(it.kind, it.id)}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={on}
                  className={`wp__opt${on ? ' is-on' : ''}${i === at ? ' is-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => toggle(it)}
                >
                  <span className="bx-tick" aria-hidden>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <Ico size={14} strokeWidth={1.9} aria-hidden />
                  <b>{it.name}</b>
                  {!compact && <em>{it.meta}</em>}
                  {isOutside(it.kind, it.id) && <Badge tone="notice">Outside this policy</Badge>}
                </li>
              )
            })}
            {people.length > PEOPLE_SHOWN && (
              <li role="presentation" className="wp__note">
                More people in the directory. Search to find them.
              </li>
            )}
          </ul>
        )}
      </div>

      {outsideChosen.length > 0 && (
        <p className="wp__hint">
          {outsideChosen.length === 1 ? `${outsideChosen[0].name} is` : `${outsideChosen.length} choices are`} outside this
          policy. This rule never applies to them.
        </p>
      )}
    </div>
  )
}
