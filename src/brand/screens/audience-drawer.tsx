import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Search, Users, X } from 'lucide-react'

import { EVERYONE, initials, reach, type Audience, type Group, type User } from '../data'
import { Badge, Button, Counter, Toggle } from '../kit'

import './audience-drawer.css'

/* -----------------------------------------------------------------------------
   Who this policy applies to.

   Audience used to be per rule, six group chips inside the rule form, and the
   editor forced a fallback to "All Employees" whenever you deselected the last
   one — so a policy that governed nobody was not expressible and a policy whose
   rules disagreed about their own scope was. Both of those are the wrong way
   round.

   It is one policy-level fact now, over groups AND named individuals, and it
   lives in a drawer rather than a modal because picking people is a browse, not
   a single step.
   -------------------------------------------------------------------------- */

export function AudienceDrawer({
  open,
  audience,
  groups,
  users,
  unlisted,
  onClose,
  onApply,
}: {
  open: boolean
  audience: Audience
  groups: Group[]
  users: User[]
  /** People the tenant has that the fixture does not list. Admitted to, not hidden. */
  unlisted: number
  onClose: () => void
  onApply: (a: Audience) => void
}) {
  const reduce = useReducedMotion()
  const [draft, setDraft] = useState<Audience>(audience)
  const [tab, setTab] = useState<'groups' | 'people'>('groups')
  const [q, setQ] = useState('')

  // Reset whenever it reopens, so a cancelled edit never leaks into the next one.
  const [seen, setSeen] = useState(open)
  if (open !== seen) {
    setSeen(open)
    if (open) {
      setDraft(audience)
      setQ('')
      setTab('groups')
    }
  }

  /* One search over both lists. An admin typing "fin" should not have to know
     whether Finance is a group or a surname, so the group name is searchable
     from the people tab too. */
  const shownGroups = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? groups.filter((g) => g.name.toLowerCase().includes(n)) : groups
  }, [groups, q])

  const shownUsers = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return users
    return users.filter((u) =>
      [u.name, u.email, groups.find((g) => g.id === u.groupId)?.name ?? ''].some((f) =>
        f.toLowerCase().includes(n),
      ),
    )
  }, [users, groups, q])

  const toggleGroup = (id: string) =>
    setDraft((a) => ({
      ...a,
      everyone: false,
      groupIds: a.groupIds.includes(id) ? a.groupIds.filter((x) => x !== id) : [...a.groupIds, id],
    }))

  const toggleUser = (id: string) =>
    setDraft((a) => ({
      ...a,
      everyone: false,
      userIds: a.userIds.includes(id) ? a.userIds.filter((x) => x !== id) : [...a.userIds, id],
    }))

  const total = reach(draft, groups, users)
  const empty = !draft.everyone && draft.groupIds.length === 0 && draft.userIds.length === 0

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="baud__scrim"
            aria-label="Close"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16 }}
          />
          <motion.aside
            className="baud"
            role="dialog"
            aria-label="Who this policy applies to"
            initial={{ x: reduce ? 0 : 440, opacity: reduce ? 0 : 1 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: reduce ? 0 : 440, opacity: reduce ? 0 : 1 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
          >
            <header className="baud__head">
              <h2>Who this policy applies to</h2>
              <button type="button" onClick={onClose} aria-label="Close">
                <X size={15} strokeWidth={2} />
              </button>
            </header>

            <div className="baud__all">
              <Toggle
                checked={draft.everyone}
                onChange={(v) => setDraft((a) => ({ ...a, everyone: v }))}
                label="Everyone in the directory"
              />
              <span>
                <strong>Everyone in the directory</strong>
                <em>Every person the IdP knows about, including anyone added later.</em>
              </span>
            </div>

            {/* Dimmed rather than hidden while `everyone` is on. Seeing what you
                would fall back to is more honest than making it disappear. */}
            <div className={`baud__body ${draft.everyone ? 'is-off' : ''}`} aria-disabled={draft.everyone}>
              <div className="baud__search">
                <Search size={14} strokeWidth={2} aria-hidden />
                <input
                  aria-label="Search groups and people"
                  placeholder="Search groups and people…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  disabled={draft.everyone}
                />
              </div>

              <div className="baud__tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'groups'}
                  className={tab === 'groups' ? 'is-on' : ''}
                  onClick={() => setTab('groups')}
                >
                  Groups {draft.groupIds.length > 0 && <em>{draft.groupIds.length}</em>}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'people'}
                  className={tab === 'people' ? 'is-on' : ''}
                  onClick={() => setTab('people')}
                >
                  People {draft.userIds.length > 0 && <em>{draft.userIds.length}</em>}
                </button>
              </div>

              {tab === 'groups' ? (
                <ul className="baud__list">
                  {shownGroups.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={draft.groupIds.includes(g.id)}
                        className={draft.groupIds.includes(g.id) ? 'is-on' : ''}
                        disabled={draft.everyone}
                        onClick={() => toggleGroup(g.id)}
                      >
                        <span className="baud__box" aria-hidden />
                        <span className="baud__gicon" aria-hidden>
                          <Users size={13} strokeWidth={1.8} />
                        </span>
                        <span className="baud__text">
                          <strong>{g.name}</strong>
                          <em>{g.memberCount.toLocaleString()} members</em>
                        </span>
                        {/* The in-picker preview of a warning the linter would
                            otherwise only raise at review. */}
                        {g.memberCount === 0 && <Badge tone="neutral">Empty</Badge>}
                      </button>
                    </li>
                  ))}
                  {shownGroups.length === 0 && <li className="baud__none">No group matches “{q}”.</li>}
                </ul>
              ) : (
                <ul className="baud__list">
                  {shownUsers.map((u) => {
                    const covered = draft.groupIds.includes(u.groupId)
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={draft.userIds.includes(u.id)}
                          className={draft.userIds.includes(u.id) ? 'is-on' : ''}
                          disabled={draft.everyone}
                          onClick={() => toggleUser(u.id)}
                        >
                          <span className="baud__box" aria-hidden />
                          <span className="baud__avatar" aria-hidden>
                            {initials(u.name)}
                          </span>
                          <span className="baud__text">
                            <strong>{u.name}</strong>
                            <em>{u.email}</em>
                          </span>
                          {/* Naming somebody already inside a chosen group is
                              legal and sometimes deliberate — an exception you
                              want to survive an edit to the group — so this
                              informs rather than blocks. */}
                          {covered && (
                            <Badge tone="info">In {groups.find((g) => g.id === u.groupId)?.name}</Badge>
                          )}
                        </button>
                      </li>
                    )
                  })}
                  {shownUsers.length === 0 && <li className="baud__none">Nobody matches “{q}”.</li>}
                  {unlisted > 0 && (
                    <li className="baud__more">
                      Showing {users.length} of {(users.length + unlisted).toLocaleString()}. Search to find someone.
                    </li>
                  )}
                </ul>
              )}
            </div>

            <footer className="baud__foot">
              <p className="baud__count">
                {empty ? (
                  <b>This policy would apply to nobody.</b>
                ) : (
                  <>
                    About <Counter value={total} /> people. Overlapping groups are counted once each, not deduplicated.
                  </>
                )}
              </p>
              <div className="baud__acts">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={empty}
                  onClick={() => {
                    onApply(draft.everyone ? EVERYONE : draft)
                    onClose()
                  }}
                >
                  Apply
                </Button>
              </div>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

/** The chips in the policy header. Groups carry a count, people carry initials. */
export function AudienceBar({
  audience,
  groups,
  users,
  max = 4,
}: {
  audience: Audience
  groups: Group[]
  users: User[]
  max?: number
}) {
  if (audience.everyone) return <span className="bf__aud is-all">Everyone</span>

  const chips = [
    ...audience.groupIds.map((id) => {
      const g = groups.find((x) => x.id === id)
      return { key: id, label: g?.name ?? id, meta: g ? g.memberCount.toLocaleString() : undefined, person: false }
    }),
    ...audience.userIds.map((id) => {
      const u = users.find((x) => x.id === id)
      return { key: id, label: u?.name ?? id, meta: undefined, person: true, gone: !u }
    }),
  ]

  if (chips.length === 0) return <span className="bf__aud is-none">Nobody</span>

  return (
    <span className="bf__aud">
      {chips.slice(0, max).map((c) => (
        <span key={c.key} className={`bf__audchip ${c.person ? 'is-person' : ''} ${'gone' in c && c.gone ? 'is-gone' : ''}`}>
          {c.person && <i aria-hidden>{initials(c.label)}</i>}
          {c.label}
          {c.meta && <em>{c.meta}</em>}
        </span>
      ))}
      {chips.length > max && <span className="bf__audmore">+{chips.length - max}</span>}
    </span>
  )
}
