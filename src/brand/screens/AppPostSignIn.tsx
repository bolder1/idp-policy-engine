import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Activity, ArrowLeft, ArrowUpRight, Check, Link2, ListChecks, Plus, Unlink } from 'lucide-react'

import { Badge, Button, Callout, Confirm, Drawer, RowMenu, SearchBox, StatusPill, type MenuItem } from '../kit'
import { EmptyState, NoMatches } from '../empty'
import { useBrand } from '../store'
import type { App, Policy } from '../data'
import { ARRIVAL_LABEL, blankPostSignInPolicy, eventsFor, linkApp, linkOf, linkedTo, takenEvents, unlinkApp } from '../post-sign-in'
import { freeName } from '../policy-name'
import { listNames } from '../rule-who'
import { playCue } from '../sound'
import { AppLogo } from '../logos/AppLogo'
import { denyNotice, eventGroups, eventNames, linkChoices, linkIssue, unlinkEvents } from './app-page-model'
import { PageBar } from './page-bar'

/* -----------------------------------------------------------------------------
   An application's Post sign-in tab (spec docs/specs/POST-SIGN-IN-POLICIES.md
   §Screens 3; the model is post-sign-in.ts).

   A post sign-in policy is independent of applications: it holds its rules
   and its "Nothing else matched", and applications are linked to it from
   here, each link with the events of this application the policy decides
   (owner, 13 Oct 2026). So this tab is where the links are made and taken
   off, and the board — the same builder a sign-in policy opens in (owner,
   13 Oct 2026: no new builder until needed) — is where its rules are. Every
   way into the board from here carries this application, so the board's way
   back names it.

   The list is the policies linked here, each with the events it covers here
   and its status; the row menu edits the events, opens the policy, or
   unlinks it (asked first, with Undo after). Link policy opens a slider with
   two pages pushed inside it (slider pages, 17 Sep 2026): Choose policy, then
   this application's events, where one another policy already decides is
   shown with that policy's name and cannot be ticked — an event of an
   application is decided by one policy at most.

   Kept apart from the sign-in Policies tab beside it: nothing here reads the
   sign-in engine, and a post sign-in policy is never offered there.
   -------------------------------------------------------------------------- */

const PAGE_EASE: [number, number, number, number] = [0.2, 0, 0, 1]

/** The name a new policy made from here takes: the Policies page's New policy's, freed. */
const NEW_NAME = 'Untitled post sign-in policy'

/* A linked row's menu: its events here, the policy itself, and the link off.
   No status items: a post sign-in policy is turned on in the board, with its
   rules in view. */
const ROW_MENU: MenuItem[] = [
  { id: 'events', label: 'Edit events', icon: ListChecks },
  { id: 'open', label: 'Open policy', icon: ArrowUpRight },
  { id: 'unlink', label: 'Unlink', icon: Unlink, danger: true, divide: true },
]

export function AppPostSignInTab({
  app,
  saving,
  confirmLeave,
  flash,
}: {
  app: App
  /** The page's draft is unsaved, so the save bar holds this view's one orange button. */
  saving: boolean
  /** The page's leave guard: Create new policy leaves for the board only once an unsaved setup is settled. */
  confirmLeave: (run: () => void) => void
  /** The policy the board just came back from: lit and focused in the list, as on Policies. */
  flash?: string
}) {
  const store = useBrand()
  const rows = useMemo(() => linkedTo(app.id, store.policies), [app.id, store.policies])

  /* The slider: Link policy from its first page, or Edit events on one linked
     policy, straight onto its events with nothing under them. Kept mounted, so
     it closes with its own motion. */
  const [slider, setSlider] = useState<{ open: boolean; editId: string | null }>({ open: false, editId: null })
  const [unlinking, setUnlinking] = useState<{ policy: Policy; open: boolean } | null>(null)
  const [flashed, setFlashed] = useState<string | null>(flash ?? null)
  const list = useRef<HTMLUListElement | null>(null)

  const nameButton = (id: string) => list.current?.querySelector<HTMLElement>(`[data-policy-id="${CSS.escape(id)}"]`)
  /* After the slider has handed focus back to what opened it. */
  const focusRow = (id: string) => window.setTimeout(() => nameButton(id)?.focus(), 0)

  /* Back from the board: the row it was about takes focus, before the page's
     heading would. */
  useEffect(() => {
    if (flash) nameButton(flash)?.focus()
    // Arrival only: a later flash is a link, which focuses its own row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* The board, the one builder both types open in, with this application as
     the way back. */
  const toBoard = (policyId: string) => store.go({ name: 'board', policyId, from: { appId: app.id } })

  /* Undo puts the policy back only while it is still exactly what the write
     saved (applications-model.ts `undoTo`): a save in between would be thrown
     away by an Undo pressed a few seconds later. */
  const undoTo = (before: Policy, saved: Policy | undefined) => {
    if (!saved || store.policyById(before.id) !== saved) {
      store.showToast(`Can't undo. ${before.name} has changed since.`)
      return
    }
    store.savePolicy(before)
  }

  /* The one write that links: the policy re-read by id at the moment of the
     write, never from a render, since `savePolicy` replaces the whole record.
     No Before saving checks: they read sign-ins, and a post sign-in policy
     decides none. Ticks that change nothing write nothing and say nothing.
     False when the policy no longer exists. */
  const link = (policyId: string, ticked: string[]): boolean => {
    const before = store.policyById(policyId)
    if (!before) return false
    const had = linkOf(before, app.id)
    if (had && had.eventIds.length === ticked.length && ticked.every((id) => had.eventIds.includes(id))) return true
    store.savePolicy(linkApp(before, app.id, ticked))
    const saved = store.policyById(policyId)
    /* Before the toast, which then stays quiet under it (sound.ts). */
    if (!had) playCue('attach')
    store.showToast(
      had ? `${before.name} saved` : `${before.name} linked to ${app.name}`,
      { label: 'Undo', run: () => undoTo(before, saved) },
      { tone: 'success' },
    )
    setFlashed(policyId)
    focusRow(policyId)
    return true
  }

  /* Create new policy: an Untitled draft already linked to the ticked events,
     straight into the board with no dialog (Policies.tsx's New policy), where
     its rules are written. Inside the leave guard, so Keep editing over an
     unsaved Basic leaves no draft behind, and the slider stays open with its
     ticks. */
  const create = (ticked: string[]) =>
    confirmLeave(() => {
      setSlider((s) => ({ ...s, open: false }))
      const name = freeName(NEW_NAME, store.policies.map((p) => p.name))
      toBoard(store.addPolicy(blankPostSignInPolicy(name, [{ appId: app.id, eventIds: ticked }])))
    })

  /* Unlink, asked first. The policy keeps its rules, its status and its other
     links: being linked to nothing does not stop it being on (post-sign-in.ts
     `turnOnIssue`), it just decides nothing here any more. */
  const unlink = (policyId: string) => {
    const before = store.policyById(policyId)
    if (!before || !linkOf(before, app.id)) return
    store.savePolicy(unlinkApp(before, app.id))
    const saved = store.policyById(policyId)
    store.showToast(`${before.name} unlinked from ${app.name}`, { label: 'Undo', run: () => undoTo(before, saved) }, { tone: 'removed' })
  }

  const onMenu = (p: Policy) => (id: string) => {
    if (id === 'events') setSlider({ open: true, editId: p.id })
    else if (id === 'open') toBoard(p.id)
    else if (id === 'unlink') setUnlinking({ policy: p, open: true })
  }

  const linkButton = (
    <Button variant={saving ? 'secondary' : 'brand'} icon={Link2} onClick={() => setSlider({ open: true, editId: null })}>
      Link policy
    </Button>
  )

  return (
    <>
      {rows.length === 0 ? (
        /* The sign-in tab's frame, filling the page: nothing linked yet. */
        <div className="bapr__frame">
          <EmptyState icon={Activity} title="No post sign-in policies on this application" action={linkButton} />
        </div>
      ) : (
        <>
          <PageBar right={linkButton} />
          {/* Not numbered: post sign-in policies are not ranked, each decides
              the events it holds here and no other policy can hold them. */}
          <ul className="bapr__stack" ref={list}>
            {rows.map(({ policy: p, eventIds }) => (
              <li key={p.id} className={`bapr__row bapsi__row ${flashed === p.id ? 'is-new' : ''}`}>
                <div className="bapr__body">
                  <span className="bapr__namerow">
                    <button type="button" className="bapr__name" data-policy-id={p.id} onClick={() => toBoard(p.id)}>
                      {p.name}
                    </button>
                  </span>
                  <span className="bapr__meta">
                    <span className="u-muted">Events: {listNames(eventNames(app.id, eventIds), 2)}</span>
                    <StatusPill status={p.status} />
                  </span>
                </div>
                <RowMenu label={`Actions for ${p.name}`} items={ROW_MENU} onSelect={onMenu(p)} />
              </li>
            ))}
          </ul>
        </>
      )}

      <LinkPolicyDrawer
        open={slider.open}
        app={app}
        policies={store.policies}
        editId={slider.editId}
        onClose={() => setSlider((s) => ({ ...s, open: false }))}
        onLink={link}
        onCreate={create}
      />

      {/* A small confirm with the policy and the application named. Red only
          here: the row menu's Unlink is the trigger, this is the act. The
          Remove dialog's card (owner, 23 Oct 2026: short titles, logos beside
          application names): the title names the application, and the sentence
          names the policy once, in `unlinkCopy`'s words (`unlinkEvents`). */}
      <Confirm
        open={!!unlinking?.open}
        onClose={() => unlinking && setUnlinking({ ...unlinking, open: false })}
        tone="removed"
        shape="hero"
        title={`Unlink from ${app.name}?`}
        confirmLabel="Unlink"
        confirmIcon={Unlink}
        onConfirm={() => {
          if (!unlinking) return
          setUnlinking({ ...unlinking, open: false })
          unlink(unlinking.policy.id)
        }}
      >
        {unlinking && (
          <div className="bapr__confirm is-card">
            <p>
              <b>{unlinking.policy.name}</b> stops deciding {unlinkEvents(app.id, linkOf(unlinking.policy, app.id)?.eventIds ?? [])} on{' '}
              <span className="bx-confirm__fact">
                <AppLogo appId={app.id} name="" size={16} />
                {app.name}
              </span>
              .
            </p>
          </div>
        )}
      </Confirm>
    </>
  )
}

/* --- The slider ------------------------------------------------------------------

   Two pages pushed inside one slider, never a centred dialog over it (slider
   pages, 17 Sep 2026): Choose policy, then the events. Back on the second
   page names the page under it, and Cancel there goes where Back goes —
   closing from there would throw the pick away with the ticks.

   Pure on its props, so the tests draw it on a tenant they make: the policies
   it reads, and the two writes, which are the tab's (`onLink`, `onCreate`). */

type Page = { kind: 'policy' } | { kind: 'events'; pick: string | 'new' }

export function LinkPolicyDrawer({
  open,
  app,
  policies,
  editId = null,
  onClose,
  onLink,
  onCreate,
}: {
  open: boolean
  app: App
  policies: readonly Policy[]
  /** Edit events: the linked policy whose events here are edited, on the events page with nothing under it. Null: Link policy, from Choose policy. */
  editId?: string | null
  onClose: () => void
  /** Links the policy to the ticked events here: the tab's one write. False when the policy no longer exists. */
  onLink: (policyId: string, ticked: string[]) => boolean
  /** Makes an Untitled draft linked to the ticked events, and opens it in the board. */
  onCreate: (ticked: string[]) => void
}) {
  const reduce = useReducedMotion()
  const startPage = (): Page => (editId ? { kind: 'events', pick: editId } : { kind: 'policy' })
  const startTicks = () => {
    const p = editId ? policies.find((x) => x.id === editId) : undefined
    return p ? (linkOf(p, app.id)?.eventIds ?? []) : []
  }
  /* From the props on the first draw, so a static render opens where it is
     asked; and again on each opening, so a pick from last time is not still picked. */
  const [page, setPage] = useState<Page>(startPage)
  const [ticked, setTicked] = useState<string[]>(startTicks)
  const [tried, setTried] = useState(false)
  const [gone, setGone] = useState(false)
  const [q, setQ] = useState('')
  /* Which way the pages move: forward onto the events, back onto the pick. */
  const [dir, setDir] = useState(1)

  useEffect(() => {
    if (!open) return
    setPage(startPage())
    setTicked(startTicks())
    setTried(false)
    setGone(false)
    setQ('')
    setDir(1)
    // Each opening only: a policy saved meanwhile does not reset the ticks under the admin's hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId])

  const choices = useMemo(() => linkChoices(app.id, policies), [app.id, policies])
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? choices.filter((c) => c.policy.name.toLowerCase().includes(k)) : choices
  }, [choices, q])

  const pick = page.kind === 'events' ? page.pick : null
  const picked = pick && pick !== 'new' ? policies.find((p) => p.id === pick) : undefined
  /* Deleted since it was picked, or found gone when Link re-read it. */
  const lost = gone || (pick !== null && pick !== 'new' && !picked)
  const pushed = page.kind === 'events' && !editId

  const order = useMemo(() => eventsFor(app.id).map((e) => e.id), [app.id])
  const groups = useMemo(() => eventGroups(app.id, app.name), [app.id, app.name])
  const taken = useMemo(() => takenEvents(app.id, policies, picked?.id), [app.id, policies, picked?.id])
  const issue = linkIssue(ticked)
  const notice = picked ? denyNotice(picked, app.id, ticked) : null

  const choose = (to: string | 'new') => {
    setDir(1)
    setPage({ kind: 'events', pick: to })
    setTicked([])
    setTried(false)
    setGone(false)
  }
  const back = () => {
    setDir(-1)
    setPage({ kind: 'policy' })
    setTried(false)
  }
  /* In the catalogue's order, whatever order they were ticked in. */
  const toggle = (id: string) => setTicked((t) => order.filter((x) => (x === id ? !t.includes(id) : t.includes(x))))

  const submit = () => {
    setTried(true)
    if (issue || !pick) return
    if (pick === 'new') return onCreate(ticked)
    if (!onLink(pick, ticked)) {
      setGone(true)
      return
    }
    onClose()
  }

  const slide = {
    initial: { opacity: 0, x: reduce ? 0 : 24 * dir },
    animate: { opacity: 1, x: 0 },
    transition: { duration: reduce ? 0 : 0.2, ease: PAGE_EASE },
  }

  /* The events page is headed by the policy it links: its name and status,
     the would-be name for a new one, which is a draft until it is turned on
     in the board. */
  const headName = pick === 'new' ? freeName(NEW_NAME, policies.map((p) => p.name)) : (picked?.name ?? 'Link policy')
  const head =
    page.kind === 'events' ? (
      <motion.div key={`events-${pick}`} className="bapr__pushed" {...slide}>
        {/* Named for where it goes. */}
        {pushed && (
          <button type="button" className="bapr__back" onClick={back}>
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            Choose policy
          </button>
        )}
        <div>
          <div className="bapsi__headline">
            <h2>{headName}</h2>
            {pick === 'new' ? <StatusPill status="draft" /> : picked && <StatusPill status={picked.status} />}
          </div>
          <p>{app.name}</p>
        </div>
      </motion.div>
    ) : (
      <motion.div key="policy" {...slide}>
        <h2>Link policy</h2>
        <p>{app.name}</p>
      </motion.div>
    )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editId ? 'Edit events' : 'Link policy'}
      width={560}
      head={head}
      actions={
        page.kind === 'events' ? (
          <>
            {/* Cancel goes where Back goes, on a pushed page. */}
            <Button variant="ghost" onClick={pushed ? back : onClose}>
              Cancel
            </Button>
            {/* Never disabled: with nothing ticked it says why under the list.
                Not drawn once the policy is gone: there is nothing to link. */}
            {!lost && (
              <Button variant="brand" icon={editId ? Check : Link2} onClick={submit}>
                {editId ? 'Save' : 'Link'}
              </Button>
            )}
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )
      }
    >
      <motion.div key={page.kind === 'events' ? `events-${pick}` : 'policy'} className="bapsi__page" {...slide}>
        {/* Title only: what happened is the whole of it. */}
        {lost && (
          <Callout tone="notice" title="That policy no longer exists.">
            {null}
          </Callout>
        )}

        {page.kind === 'policy' ? (
          <div className="bapp__pick">
            <SearchBox block value={q} onChange={setQ} placeholder="Search policies" label="Search policies" />
            {/* The way to a policy that does not exist yet, first. */}
            <button type="button" className="bapp__pickrow bapsi__create" onClick={() => choose('new')}>
              <span className="bapp__pickart bapsi__createart" aria-hidden>
                <Plus size={16} strokeWidth={2} />
              </span>
              <span className="bapp__picktext">
                <b>Create new policy</b>
              </span>
            </button>
            {shown.length === 0 && q.trim() !== '' && <NoMatches compact noun="policies" query={q} onClear={() => setQ('')} />}
            {shown.map(({ policy: p, meta }) => (
              <button key={p.id} type="button" className="bapp__pickrow" onClick={() => choose(p.id)}>
                <span className="bapp__picktext">
                  <b>{p.name}</b>
                  <em>{meta}</em>
                </span>
                <span className="bapsi__pickstatus">
                  <StatusPill status={p.status} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          !lost && (
            <div className="bapsi__events">
              {groups.map((g) => (
                <div key={g.title} className="bapsi__group" role="group" aria-label={g.title}>
                  <h3 className="bapp__pickgroup">{g.title}</h3>
                  {g.events.map((e) => {
                    const holder = taken.get(e.id)
                    const on = !holder && ticked.includes(e.id)
                    return (
                      <button
                        key={e.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={!!holder}
                        className={`bapsi__event${on ? ' is-on' : ''}`}
                        onClick={() => toggle(e.id)}
                      >
                        <span className="bx-tick" aria-hidden>
                          {on && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="bapsi__eventtext">
                          <b>{e.name}</b>
                          {/* The one policy that already decides it here. */}
                          {holder && <em>Linked to {holder.name}</em>}
                        </span>
                        {/* How it reaches the IdP, on the application's own
                            events: Checked before can be refused, Reported
                            after cannot. The session events' heading says
                            theirs, so they carry none. */}
                        {e.arrival !== 'session' && <Badge tone="neutral">{ARRIVAL_LABEL[e.arrival]}</Badge>}
                      </button>
                    )
                  })}
                </div>
              ))}
              {notice && (
                <Callout tone="notice" title={notice}>
                  {null}
                </Callout>
              )}
              {tried && issue && (
                <p className="bz7__fielderr" role="alert">
                  {issue}
                </p>
              )}
            </div>
          )
        )}
      </motion.div>
    </Drawer>
  )
}
