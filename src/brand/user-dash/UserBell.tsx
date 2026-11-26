import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'

import { Button, Tip, Toggle } from '../kit'
import { useBrand } from '../store'
import type { UserNote } from './state'

/* -----------------------------------------------------------------------------
   The end user's bell (spec goal 3, live parity): Notifications, an Only show unread switch and Mark all read, as on
   the live end-user site. A dot says something is unread; the icon carries no number.
   -------------------------------------------------------------------------- */

export function BellPanel({ notes, onlyUnread, onOnlyUnread, onReadAll }: { notes: readonly UserNote[]; onlyUnread: boolean; onOnlyUnread: (on: boolean) => void; onReadAll: () => void }) {
  const shown = onlyUnread ? notes.filter((n) => !n.read) : notes
  return (
    <div className="bud-bell__panel" role="dialog" aria-label="Notifications">
      <header className="bud-bell__head">
        <h2>Notifications</h2>
        <label className="bud-bell__switch">
          Only show unread
          <Toggle checked={onlyUnread} onChange={onOnlyUnread} label="Only show unread" />
        </label>
        <Button size="sm" variant="link" onClick={onReadAll} disabled={!notes.some((n) => !n.read)}>
          Mark all read
        </Button>
      </header>
      {shown.length === 0 ? (
        <p className="bud-bell__empty">You&apos;re all caught up</p>
      ) : (
        <ul className="bud-bell__list">
          {shown.map((n) => (
            <li key={n.id} className={n.read ? '' : 'is-unread'}>
              <span>{n.text}</span>
              <span className="bud-quiet">{n.at}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function UserBell() {
  const { userDash, actUserDash } = useBrand()
  const [open, setOpen] = useState(false)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const unread = userDash.notes.some((n) => !n.read)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="bud bud-bell" ref={box}>
      <Tip text="Notifications">
        <button type="button" className="bshell__icon bud-bell__btn" aria-label={unread ? 'Notifications, unread' : 'Notifications'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Bell size={20} strokeWidth={1.7} />
          {unread && <span className="bud-bell__dot" aria-hidden />}
        </button>
      </Tip>
      {open && <BellPanel notes={userDash.notes} onlyUnread={onlyUnread} onOnlyUnread={setOnlyUnread} onReadAll={() => actUserDash({ type: 'read-all' })} />}
    </div>
  )
}
