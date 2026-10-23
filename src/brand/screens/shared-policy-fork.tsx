import { useEffect, useMemo, useState } from 'react'
import { Copy, Pencil } from 'lucide-react'

import { AppLogo } from '../logos/AppLogo'
import { Badge, Button, Drawer, SearchBox } from '../kit'
import { appsOf, type App, type Policy } from '../data'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   EDITING A POLICY MORE THAN ONE APPLICATION SHARES — redone as a slider (owner,
   23 Oct 2026: "we can create a better slider because we can have more than 50,
   100 apps, so a lot of scroll … don't add too much content, and the best button:
   two basic secondary buttons").

   It was a centred dialog with the whole list in it, which is a dialog that grows
   until it is taller than the screen at fifty applications. The question is the
   same ("if I change this, what else moves?"); the container is now a drawer, so
   the list scrolls inside it and the buttons stay where they are:

     • a heading, "Application list" (owner, 23 Oct 2026: "make it one liner and to the point … we can just call
       it application list"), and no counts;
     • the applications, this one first and marked; a search once there are more than a screenful;
     • two secondary buttons in the foot. Not an orange one: neither answer is the
       right one for everybody, and the foot is not a Save. Edit for all goes
       straight to the builder, where the canvas carries its own note about what
       a save reaches (board/PolicyNotice.tsx). Duplicate takes a copy on this
       application alone and opens it there, marked as a copy, so nothing is
       decided in this slider that the builder cannot show.

   What is gone from the dialog: the two cards with their sentences and tags, the
   Recommended badge, the hover preview that marked the list Reached. The
   builder's note says it better, in the place the work happens.
   -------------------------------------------------------------------------- */

/** Past this many applications the list gets a search. */
const SEARCH_FROM = 6

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
  /* Which button is under the pointer or focus, so the list can show what it would touch (owner, 23 Oct 2026: "for
     duplicate only active and highlight the current app; in edit all show a note, one line"; "Current" shows only
     while Duplicate is pointed at). Cleared when the slider opens. */
  const [preview, setPreview] = useState<'edit' | 'duplicate' | null>(null)
  useEffect(() => {
    if (open) {
      setQ('')
      setPreview(null)
    }
  }, [open])

  /* This application leads, so the list reads "here, and there" rather than making the admin find themselves in it. */
  const on = useMemo(
    () => appsOf(policy, apps).slice().sort((a, b) => Number(b.id === app.id) - Number(a.id === app.id)),
    [policy, apps, app.id],
  )
  const shown = q.trim() ? on.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())) : on

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Edit shared policy"
      width={480}
      actions={
        <>
          <span className="bfork__btnwrap" onMouseEnter={() => setPreview('duplicate')} onMouseLeave={() => setPreview(null)} onFocusCapture={() => setPreview('duplicate')} onBlurCapture={() => setPreview(null)}>
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
              onDuplicate()
            }}
          >
            <Copy size={14} strokeWidth={2} aria-hidden />
            <span className="bfork__btnapp">
              Duplicate for <AppLogo appId={app.id} name="" size={16} /> {app.name}
            </span>
          </Button>
          </span>
          <span className="bfork__btnwrap" onMouseEnter={() => setPreview('edit')} onMouseLeave={() => setPreview(null)} onFocusCapture={() => setPreview('edit')} onBlurCapture={() => setPreview(null)}>
          <Button
            variant="secondary"
            icon={Pencil}
            onClick={() => {
              onClose()
              onEdit()
            }}
          >
            Edit for all
          </Button>
          </span>
        </>
      }
    >
      <div className={preview ? `bfork is-${preview}` : 'bfork'}>
        <p className="bfork__said">
          Application list
        </p>
        {on.length > SEARCH_FROM && (
          <div className="bfork__search">
            <SearchBox block value={q} onChange={setQ} placeholder="Search applications" label="Search applications" />
          </div>
        )}
        <ul className="bfork__list">
          {shown.map((a) => (
            <li key={a.id} className={a.id === app.id ? 'is-here' : undefined}>
              <AppLogo appId={a.id} name={a.name} size={20} />
              <b>{a.name}</b>
              <span className="bfork__mark">{a.id === app.id && <Badge tone="info">Current</Badge>}</span>
            </li>
          ))}
          {shown.length === 0 && <li className="bfork__none">No application matches</li>}
        </ul>
        <p className="bfork__note" aria-live="polite">
          {preview === 'edit' ? 'Every application above changes with it.' : ''}
        </p>
      </div>
    </Drawer>
  )
}
