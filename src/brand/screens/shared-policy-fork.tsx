import { useEffect, useMemo, useState } from 'react'
import { Copy, Pencil, type LucideIcon } from 'lucide-react'

import { AppLogo } from '../logos/AppLogo'
import { Badge, Button, Modal } from '../kit'
import { appsOf, type App, type Policy } from '../data'
import { coverageOf } from './app-policy-model'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   EDITING A POLICY MORE THAN ONE APPLICATION SHARES (owner, 22 Oct 2026).

   A policy holds a list of applications (policies-hold-many-apps), so the policy an admin opens from Dropbox's
   Policies tab may be the one deciding sign-ins for Outlook as well. Pressing Edit took them straight to the
   builder, where nothing says so: the canvas names the policy, not its reach. The first they learn of it is
   Outlook behaving differently on Monday. One application and the press goes straight through, as it always did
   (owner: "if that policy attaches to that application only, fine").

   THE QUESTION IN THE ADMIN'S HEAD is "if I change this, what else moves?", so the dialog answers it with the
   tenant's own facts rather than a caution. Each application is named, with its logo and with the number of
   people it decides for there (`coverageOf`) — 18 people on Outlook is a different decision from nobody. The one
   they are standing on leads and is marked in blue, so the list reads "here, and there".

   TWO WAYS, AS A COLUMN (owner, 22 Oct 2026: "Replace it on Google Workspace — remove, outside is enough
   here; we can have two options", then, of the footer trail that followed: "move it back to how it was, in a
   column").

   There were three ways as a list of cards. Replace is gone from here: it is on the tab already, in the policy's
   own menu, and an admin who wants a different policy altogether was not asking the question this dialog asks.
   What is left is the one real fork — change the shared policy, or take a copy — and it stays a column of two
   rows, each with its glyph, what it does and the scope it does it on. A footer trail was tried and put back:
   these are not Save and Cancel, they are two answers to the question in the title, and a row of same-weight
   buttons in the corner reads as a form being submitted rather than a choice being made. The column gives each
   one room for the sentence that tells them apart, which the buttons could not carry. Cancel stays in the
   footer, where leaving belongs.

   THE LIST IS THE PREVIEW (owner, 22 Oct 2026: "we might don't need 2 step — so on hover we can show on the
   top list, so on edit show the reached tag in a better way, and in duplication show the current this
   application").

   Edit first got a confirm step of its own: a second screen that marked every application the save would
   reach. It answered the right question and charged a press for it, and the press came BEFORE the admin had
   decided anything — a confirm for a choice not yet made. Pointing at the list that is already on screen says
   the same thing for nothing. Hovering or focusing a row marks, in that list, exactly what the row would
   touch: Edit marks all of them Reached, the copy leaves this application marked and lets the rest fall back,
   so the difference between "all three" and "this one" is seen rather than read. Both rows then act on the
   press, and Cancel is the footer's only button.

   It is a preview, not a control, so it is driven by focus as well as hover and nothing about the dialog
   depends on it: with no pointer and no focus the list is what it always was.

   THE COPY IS RECOMMENDED, AND THAT IS NOT THE SAME AS BEING PUSHED (owner, 22 Oct 2026: "add recommended
   here"). Both are right answers — a team that wants one policy across four applications should edit it, a team
   that wants Google Workspace to differ should take a copy. What separates them is the cost of being wrong: a
   copy is undone by deleting it, an edit to a shared policy is already live on the others by the time anybody
   notices. A tag saying so is advice the admin can read and ignore, in the row's own words; an orange button
   would have been the dialog deciding for them.

   What is NOT level is the cost of being wrong. A copy is undoable by deleting it; an edit to a shared policy
   is already live on three other applications by the time anybody notices. So Edit does not go straight
   through: it turns this dialog into its own confirm, where every application the save will reach is marked on
   the list the admin has just read, in that list, rather than described again in a sentence. The orange button
   appears only there, on the one press that is then unambiguous.

   A GLYPH PER ACTION, NOT A STACK OF LOGOS (owner, 22 Oct 2026, superseding the logos he asked for earlier the
   same day: "we can remove logos here and add icons … you can add the logo beside the app name or remove and add
   icon to scale. same for header").

   The logos were on the rows to show the axis the three options differ on — all applications for Edit, this one
   for the other two. But the list directly above already names every application WITH its logo, and the row that
   is "this one" is marked in blue there, so the stacks repeated what had just been read and did it in the one
   form that does not scale: a policy on ten applications gave Edit four logos and a +6, which is a count, not a
   scope. The glyph now says the ACTION — pencil, copy, swap — which is the thing a row's own words cannot show
   at a glance, and it is one fixed size however many applications there are. The head drops its stack for the
   same reason: the title already says how many others there are, and the list says which.
   -------------------------------------------------------------------------- */

/** The other applications, said the way the lines need them: one by name, several as a group. */
function others(on: App[], appId: string): { list: App[]; label: string; keep: string } {
  const list = on.filter((a) => a.id !== appId)
  if (list.length === 1) return { list, label: list[0].name, keep: 'keeps' }
  return { list, label: 'the others', keep: 'keep' }
}

/** The two ways out, and what the list above previews when one is under the pointer. */
type Way = 'edit' | 'duplicate'

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`)
/** "the others" opens a sentence of its own below, and a lower-case start reads as a typo. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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
  /** The application whose tab this is: the one a copy or a replacement would be for. */
  app: App
  onClose: () => void
  /** Straight to the builder, as Edit always did. */
  onEdit: () => void
  /** A copy of this policy on this application alone, opened as a draft (ApplicationPage `addCopy`). */
  onDuplicate: () => void
}) {
  const { apps, policies, users, groups } = useBrand()
  /* This application leads, so the list reads "here, and there" rather than making the admin find themselves in it. */
  const on = useMemo(
    () => appsOf(policy, apps).slice().sort((a, b) => Number(b.id === app.id) - Number(a.id === app.id)),
    [policy, apps, app.id],
  )
  /* What is riding on each one: the people this policy decides for there. */
  const covers = useMemo(
    () => new Map(on.map((a) => [a.id, coverageOf(a.id, policy, policies, users, groups).covered])),
    [on, policy, policies, users, groups],
  )
  const { list: rest, label, keep } = others(on, app.id)
  /* Which way the pointer or the keyboard is on, so the list above can show what it would touch. Cleared
     whenever the dialog opens: a pointer that left while it was closed never fires its own leave. */
  const [preview, setPreview] = useState<Way | null>(null)
  useEffect(() => {
    if (open) setPreview(null)
  }, [open])

  const title = rest.length === 1 ? `Editing this changes ${rest[0].name} too` : `Editing this changes ${rest.length} other applications too`

  const ways: { id: Way; icon: LucideIcon; title: string; tag: { text: string; tone: 'neutral' | 'positive' }; said: string; run: () => void }[] = [
    {
      id: 'edit',
      icon: Pencil,
      title: 'Edit it',
      tag: { text: 'All applications', tone: 'neutral' },
      said: `Your changes reach ${label} as well.`,
      run: () => {
        onClose()
        onEdit()
      },
    },
    {
      id: 'duplicate',
      icon: Copy,
      title: `Duplicate it for ${app.name}`,
      tag: { text: 'Recommended', tone: 'positive' },
      said: `${app.name} gets a copy you can change. ${cap(label)} ${keep} this one.`,
      run: () => {
        onClose()
        onDuplicate()
      },
    },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={560}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="bapp__fork">
        <p className="bapp__forksaid">
          <em>{policy.name}</em> decides sign-ins for these applications. Anything you save reaches all of them.
        </p>
        <ul className={preview ? `bapp__forkapps is-${preview}` : 'bapp__forkapps'}>
          {on.map((a) => {
            const here = a.id === app.id
            return (
              <li key={a.id} className={[here ? 'is-here' : '', preview === 'duplicate' && !here ? 'is-aside' : ''].filter(Boolean).join(' ')}>
                <AppLogo appId={a.id} name={a.name} size={20} />
                <b>{a.name}</b>
                {/* One mark per row: what this row is to the way being previewed, or, with nothing previewed,
                    which one the admin is standing on. The cell is ALWAYS here, empty or not — a mark that
                    appears on hover used to add a fourth child to a four-track grid, so rows without one
                    re-laid out and the list shuffled under the pointer that was previewing it. */}
                <span className="bapp__forkmark">
                  {preview === 'edit' ? <Badge tone="notice">Reached</Badge> : here ? <Badge tone="info">This application</Badge> : null}
                </span>
                <span>{people(covers.get(a.id) ?? 0)}</span>
              </li>
            )
          })}
        </ul>

        {/* The choice itself, under the list it previews on. */}
        <div className="bapp__forkways">
          {ways.map((w) => (
            <button
              key={w.id}
              type="button"
              className="bapp__forkway"
              onClick={w.run}
              onMouseEnter={() => setPreview(w.id)}
              onMouseLeave={() => setPreview(null)}
              onFocus={() => setPreview(w.id)}
              onBlur={() => setPreview(null)}
            >
              <span className="bapp__forkicon" aria-hidden>
                <w.icon size={17} strokeWidth={1.9} />
              </span>
              <span className="bapp__forktext">
                <strong>{w.title}</strong>
                <em>{w.said}</em>
              </span>
              <Badge tone={w.tag.tone}>{w.tag.text}</Badge>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
