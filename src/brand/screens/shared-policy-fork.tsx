import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Copy, Pencil, type LucideIcon } from 'lucide-react'

import { AppLogo } from '../logos/AppLogo'
import { Badge, Button, Drawer, SearchBox } from '../kit'
import { appsOf, type App, type Policy } from '../data'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   EDITING A POLICY MORE THAN ONE APPLICATION SHARES — a slider (owner, 23 Oct
   2026: "we can create a better slider because we can have more than 50, 100
   apps, so a lot of scroll … don't add too much content").

   It was a centred dialog with the whole list in it, which is a dialog that grows
   until it is taller than the screen at fifty applications. The question is the
   same ("if I change this, what else moves?"); the container is a drawer, so the
   list scrolls inside it and the buttons stay where they are.

   A CHOICE, THEN WHAT IT CHANGES (owner, the same day, in order: "remove the
   whole hover and add a common note for what both options do", "make the slider
   contextual", then "make it more functional and appealing"). Hover previews
   showed the answer only while the pointer was on a button, so nothing could be
   read before pressing. Now:

     • the head names the policy;
     • two option cards, one picked at a time (Edit for all to start, since Edit
       is what was pressed), each with its glyph and one line;
     • the applications, this one first, each saying what the picked option does
       to it: every one Changes for Edit; for Duplicate this one Gets the copy
       and the rest Keep this policy, faded back;
     • the foot: Cancel, and one button that does the picked option and says so.

   Selection is blue, not orange (one orange button per view: the foot's). A
   search appears once the list is longer than a screenful.
   -------------------------------------------------------------------------- */

/** Past this many applications the list gets a search. */
const SEARCH_FROM = 6

type Way = 'edit' | 'duplicate'

export function SharedPolicyFork({
  open,
  policy,
  app,
  onClose,
  onEdit,
  onDuplicate,
}: {
  open: boolean
  /** The policy the Edit was for. */
  policy: Policy
  /** The application whose tab this is: the one a copy would be for. */
  app: App
  onClose: () => void
  /** Straight to the builder, as Edit always did. */
  onEdit: () => void
  /** A copy of this policy on this application alone, opened as a draft (ApplicationPage `addCopy`). */
  onDuplicate: () => void
}) {
  const { apps } = useBrand()
  const [q, setQ] = useState('')
  const [way, setWay] = useState<Way>('edit')
  useEffect(() => {
    if (open) {
      setQ('')
      setWay('edit')
    }
  }, [open])

  /* This application leads, so the list reads "here, and there" rather than making the admin find themselves in it. */
  const on = useMemo(
    () => appsOf(policy, apps).slice().sort((a, b) => Number(b.id === app.id) - Number(a.id === app.id)),
    [policy, apps, app.id],
  )
  const shown = q.trim() ? on.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())) : on

  const ways: { id: Way; icon: LucideIcon; title: ReactNode; line: string }[] = [
    { id: 'edit', icon: Pencil, title: 'Edit for all', line: on.length === 2 ? 'Your changes reach both applications.' : `Your changes reach all ${on.length} applications.` },
    {
      id: 'duplicate',
      icon: Copy,
      /* The application with its logo, as everywhere this slider names one (owner, 23 Oct 2026). */
      title: (
        <span className="bfork__btnapp">
          Duplicate for <AppLogo appId={app.id} name="" size={16} /> {app.name}
        </span>
      ),
      line: 'A copy for this application only. The others keep this policy.' },
  ]

  /* The two cards are a radio group, so they act as one: a single Tab stop (the picked card) and the arrow keys to
     move, picking as they go, round from the last to the first. Two Tab stops and dead arrows was a group in name only. */
  const wayRefs = useRef<(HTMLButtonElement | null)[]>([])
  const onWaysKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const next = (ways.findIndex((w) => w.id === way) + step + ways.length) % ways.length
    setWay(ways[next].id)
    wayRefs.current[next]?.focus()
  }

  const go = () => {
    onClose()
    if (way === 'edit') onEdit()
    else onDuplicate()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Edit shared policy"
      caption={policy.name}
      width={480}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" icon={way === 'edit' ? Pencil : Copy} onClick={go}>
            {way === 'edit' ? 'Edit for all' : 'Duplicate'}
          </Button>
        </>
      }
    >
      <div className={`bfork is-${way}`}>
        <div className="bfork__ways" role="radiogroup" aria-label="How to change it" onKeyDown={onWaysKey}>
          {ways.map((w, i) => (
            <button
              key={w.id}
              ref={(el) => {
                wayRefs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={way === w.id}
              tabIndex={way === w.id ? 0 : -1}
              className={way === w.id ? 'bfork__way is-on' : 'bfork__way'}
              onClick={() => setWay(w.id)}
            >
              <span className="bfork__wayicon" aria-hidden>
                <w.icon size={16} strokeWidth={1.9} />
              </span>
              <span className="bfork__waytext">
                <strong>{w.title}</strong>
                <em>{w.line}</em>
              </span>
            </button>
          ))}
        </div>

        <h3 className="bfork__said">Applications using it</h3>
        {on.length > SEARCH_FROM && (
          <div className="bfork__search">
            <SearchBox block value={q} onChange={setQ} placeholder="Search applications" label="Search applications" />
          </div>
        )}
        <ul className="bfork__list">
          {shown.map((a) => {
            const here = a.id === app.id
            return (
              <li key={a.id} className={here ? 'is-here' : undefined}>
                <AppLogo appId={a.id} name={a.name} size={20} />
                <b>{a.name}</b>
                {way === 'edit' ? (
                  <Badge tone="notice">Changes</Badge>
                ) : here ? (
                  <Badge tone="info">Gets the copy</Badge>
                ) : (
                  <span className="bfork__keeps">Keeps this policy</span>
                )}
              </li>
            )
          })}
          {shown.length === 0 && <li className="bfork__none">No application matches</li>}
        </ul>
      </div>
    </Drawer>
  )
}
