import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Copy, Pencil, type LucideIcon } from 'lucide-react'

import { AppLogo } from '../logos/AppLogo'
import { Badge, Button, Confirm, Drawer, Modal, SearchBox } from '../kit'
import { appsOf, type App, type Policy } from '../data'
import { useBrand } from '../store'
import { FORK_IN_POPUP } from './app-policies'

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

   AS A POPUP (`FORK_IN_POPUP`, owner, 26 Oct 2026: "we don't need the side nav,
   we can directly showcase them something like a popup, and based on select
   showcase them the context"). The same two choices and the same list, in a
   centred popup instead of a slider: the heading over the list names what the
   pick does ("These change" / "Who gets the copy"), so the context swaps with
   the pick. Two buttons, Cancel and the pick's verb. Off: the slider, as it was.

   ONE BUTTON, ONE CARD (`only`, `HEAD_THREE_BUTTONS`, owner, 26 Oct 2026, twice).
   First: "give me 3 buttons there, not inside the popup, so based on the button
   selected we show a different popup, with context. As minimal as we can." The
   choice moved into the head (Edit policy, Duplicate policy, Replace policy), so
   a popup has nothing to choose between. Then, of the list of applications that
   popup still drew: "it's not scalable — what if we have 100+ apps in one policy?
   … something similar as we did for detach policy." A row per application is a
   dialog that grows with the policy; the Remove dialog (AppProtection.tsx
   `RemoveDialog`) never did, because it names the policy in a sentence and draws
   the applications that keep it as a row of logos with a count. These two are that
   dialog: the kit's hero Confirm, a sentence, and "Also on / Still on" with five
   logos and "+N". No list, no search, no scroll, at any size.
   -------------------------------------------------------------------------- */

/** Past this many applications the list gets a search. */
const SEARCH_FROM = 6

/** How many logos the "also on" row draws before it says "+N", as the Remove dialog's does. */
const LOGOS = 5

type Way = 'edit' | 'duplicate'

/* The applications that keep it, as a row of logos with a count: the Remove dialog's "Still on". */
function KeepsRow({ label, apps }: { label: string; apps: readonly { id: string; name: string }[] }) {
  if (apps.length === 0) return null
  return (
    <p className="bapr__keeps">
      <span>{label}</span>
      {apps.slice(0, LOGOS).map((o) => (
        <AppLogo key={o.id} appId={o.id} name={o.name} size={18} />
      ))}
      {apps.length > LOGOS && <span>+{apps.length - LOGOS}</span>}
    </p>
  )
}

/** The card a single-purpose popup says, drawn on its own so a test can read it (a Confirm renders nothing without a document). */
export function ForkCard({ way, policy, app, others }: { way: Way; policy: Policy; app: Pick<App, 'id' | 'name'>; others: readonly { id: string; name: string }[] }) {
  const here = (
    <span className="bx-confirm__fact">
      <AppLogo appId={app.id} name="" size={16} />
      {app.name}
    </span>
  )
  if (way === 'edit') {
    const n = others.length + 1
    return (
      <div className="bapr__confirm is-card">
        <p>
          Changes to <b>{policy.name}</b> reach {n === 2 ? 'both applications' : `all ${n} applications`}.
        </p>
        <KeepsRow label="Also on" apps={others} />
      </div>
    )
  }
  /* A copy of a policy this application has to itself is a draft with no others to keep the original, so it says what
     the draft is instead. */
  if (others.length === 0) {
    return (
      <div className="bapr__confirm is-card">
        <p>
          A draft copy of <b>{policy.name}</b> for {here}.
        </p>
        <p>It decides nothing until you replace this policy with it.</p>
      </div>
    )
  }
  return (
    <div className="bapr__confirm is-card">
      <p>
        A copy of <b>{policy.name}</b> for {here} only.
      </p>
      <p>The others keep the original.</p>
      <KeepsRow label="Still on" apps={others} />
    </div>
  )
}

export function SharedPolicyFork({
  open,
  policy,
  app,
  onClose,
  onEdit,
  onDuplicate,
  asPopup,
  inline = false,
  only,
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
  /** A popup (true) or the slider (false). Absent: `FORK_IN_POPUP`. A test's way to read either. */
  asPopup?: boolean
  /** Draw the popup in place instead of portalled, so a static render can read it. Tests only. */
  inline?: boolean
  /** One way only (`HEAD_THREE_BUTTONS`): the head's Edit policy or Duplicate policy opened this, so there is nothing to
      choose and no list to scroll. A card, as the Remove dialog is, whatever `FORK_IN_POPUP` says. */
  only?: Way
}) {
  const { apps } = useBrand()
  const single = !!only
  const popup = single || (asPopup ?? FORK_IN_POPUP)
  const [q, setQ] = useState('')
  const [way, setWay] = useState<Way>(only ?? 'edit')
  useEffect(() => {
    if (open) {
      setQ('')
      setWay(only ?? 'edit')
    }
  }, [open, only])

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

  /* The popup opens on the picked card, ready for the arrow keys: the choice is why it was opened. */
  useEffect(() => {
    if (!open || !popup || single) return
    const t = window.setTimeout(() => wayRefs.current[0]?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [open, popup, single])

  const go = () => {
    onClose()
    if (way === 'edit') onEdit()
    else onDuplicate()
  }

  const foot = (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="brand" icon={way === 'edit' ? Pencil : Copy} onClick={go}>
        {way === 'edit' ? 'Edit for all' : 'Duplicate'}
      </Button>
    </>
  )

  /* ONE BUTTON, ONE CARD: the kit's hero confirm, as the Remove dialog is, with the sentence and the logos. */
  if (single && only) {
    const others = on.filter((a) => a.id !== app.id)
    /* A short title naming the job, as Remove's names the application with a question mark. */
    const title = only === 'edit' ? 'Edit shared policy?' : `Duplicate for ${app.name}?`
    const card = <ForkCard way={only} policy={policy} app={app} others={others} />
    if (inline) {
      return open ? (
        <div className="bx-modal" role="dialog" aria-label={title}>
          <header className="bx-modal__head">
            <h2>{title}</h2>
          </header>
          <div className="bx-modal__body">{card}</div>
          <footer className="bx-modal__foot">{foot}</footer>
        </div>
      ) : null
    }
    return (
      <Confirm
        open={open}
        onClose={onClose}
        tone={only === 'edit' ? 'warning' : 'info'}
        shape="hero"
        title={title}
        confirmLabel={only === 'edit' ? 'Edit for all' : 'Duplicate'}
        confirmIcon={only === 'edit' ? Pencil : Copy}
        destructive={false}
        onConfirm={go}
      >
        {card}
      </Confirm>
    )
  }

  const body = (
    <div className={`bfork is-${way}${popup ? ' is-popup' : ''}`}>
      {/* The popup's title is the job; this line is the object, as the slider's caption was. */}
      {popup && <p className="bfork__policy">{policy.name}</p>}
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

      {/* The context: the heading names what the pick does to the list under it, so it swaps with the pick. */}
      <div className="bfork__context" aria-live="polite">
        <h3 className="bfork__said">{!popup ? 'Applications using it' : way === 'edit' ? 'These change' : 'Who gets the copy'}</h3>
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
    </div>
  )

  if (popup && inline) {
    return open ? (
      <div className="bx-modal" role="dialog" aria-label="Edit shared policy">
        <header className="bx-modal__head">
          <h2>Edit shared policy</h2>
        </header>
        <div className="bx-modal__body">{body}</div>
        <footer className="bx-modal__foot">{foot}</footer>
      </div>
    ) : null
  }
  if (popup) {
    return (
      <Modal open={open} onClose={onClose} title="Edit shared policy" width={560} footer={foot}>
        {body}
      </Modal>
    )
  }

  return (
    <Drawer open={open} onClose={onClose} title="Edit shared policy" caption={policy.name} width={480} actions={foot}>
      {body}
    </Drawer>
  )
}
