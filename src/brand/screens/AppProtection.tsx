import { useEffect, useMemo, useState } from 'react'
import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Pencil, ShieldPlus, Unlink } from 'lucide-react'

import { Badge, Button, Callout, Drawer, Modal, RowMenu, StatusPill, TipDot, type MenuItem } from '../kit'
import { EmptyState } from '../empty'
import { Picker } from '../picker'
import { AppLogo } from '../logos/AppLogo'
import { Face } from '../faces'
import { ChangeState } from '../leave-guard'
import { useBrand } from '../store'
import { appsOf, blankPolicy, nameTaken, type Policy } from '../data'
import { DECISION_WORDS } from '../decision-words'
import { ApplicationFixed } from './scope-fields'
import { attachKind, attachTo, attachableTo, detachFrom, rulesLabel } from './app-policies'
import { appStanding, deciderChanges, keyName, rowTip, visibleMoves, whoLabel, type Key, type StandRow } from './app-standing'
import { addToApp, attachNote, existingHint, removeCopy, removeFromApp } from './applications-model'
import { useAppsGuard } from './board/apps-guard'
import { GuardDrawer } from './guard-page'
import { policyOption } from './policy-option'
import { fallbackOf } from './simulate'
import { portalRoot } from './status-options'

/* -----------------------------------------------------------------------------
   What protects one application, and the form for adding to it.

   The brief this was built to: "Do not add an option to attach a policy.
   Instead, provide a form where the user can attach a new policy or an existing
   one." So the form is always open at the foot of this panel, and nothing is
   preselected.

   The panel stays open after every write, so you watch the list you are
   changing. Its numbers and tips are the engine's (app-standing.ts), the same
   ones the application's own page shows.

   Naming a new policy is a page pushed inside this panel, with Back, not a
   centred dialog over it.

   Attaching an existing policy and taking one off run Before saving:
   applications first (board/apps-guard.ts), the same checks the application's
   own page and the builder run — this is a third way to make the same change,
   and a live policy put on or taken off here moves the same sign-ins.
   -------------------------------------------------------------------------- */

export function AppProtection({
  appId,
  justAdded,
  onClose,
  onCreate,
}: {
  appId: string | null
  /* A policy the CALLER just created, so it lands with the same tint as one
     attached from inside this panel. */
  justAdded?: string | null
  onClose: () => void
  /** Hands out the named policy. The caller stores it. */
  onCreate: (p: Policy) => void
}) {
  const store = useBrand()
  const uid = useId()
  const appsGuard = useAppsGuard()

  const [choice, setChoice] = useState<'new' | 'existing' | null>(null)
  const [pickId, setPickId] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [gone, setGone] = useState(false)
  const [removing, setRemoving] = useState<Policy | null>(null)
  /* The row an attach from this form just put on. An object, so attaching the
     same policy again after taking it off is a new flash and moves focus again. */
  const [flash, setFlash] = useState<{ id: string } | null>(null)
  /** The pushed "Name your policy" page is showing. */
  const [naming, setNaming] = useState(false)
  const [newName, setNewName] = useState('')
  const newRadio = useRef<HTMLInputElement | null>(null)
  const nameField = useRef<HTMLInputElement | null>(null)
  const body = useRef<HTMLDivElement | null>(null)

  /* Reset when the subject changes. One drawer serves every row, so a form
     that remembered the last application's answer would offer to attach a
     policy to the app you just left. */
  useEffect(() => {
    setChoice(null)
    setPickId(null)
    setTried(false)
    setGone(false)
    setFlash(null)
    setNaming(false)
    setNewName('')
    /* And the checks' page with it. Its state outlives the panel (this
       component stays mounted, closed), so a page left open would otherwise
       come up over the next application's panel. */
    appsGuard.close()
    // On a change of subject only: `appsGuard` is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId])

  /* And after the caller created a policy from this form: the choice has been
     acted on, so "Name and create" must not stay on offer for a second one.
     Focus goes to the new row, which replaced the page that had it. */
  useEffect(() => {
    if (!justAdded) return
    setChoice(null)
    setPickId(null)
    setTried(false)
    const id = requestAnimationFrame(() =>
      body.current?.querySelector<HTMLElement>(`[data-policy-id="${CSS.escape(justAdded)}"]`)?.focus(),
    )
    return () => cancelAnimationFrame(id)
  }, [justAdded])

  /* The same after an attach from this form, however it was written: at once,
     on a clean check, or from the checks' page. The button that asked is
     disabled by then (nothing is picked), so the checks' page handing focus
     back to it as it closes would leave focus on the page behind. A frame
     later, after that hand-back, focus goes to the new row. */
  useEffect(() => {
    if (!flash) return
    const id = requestAnimationFrame(() =>
      body.current?.querySelector<HTMLElement>(`[data-policy-id="${CSS.escape(flash.id)}"]`)?.focus(),
    )
    return () => cancelAnimationFrame(id)
  }, [flash])

  /* The name field takes focus when its page is pushed. After the drawer's own
     focus, which lands on the panel when it opens. */
  useEffect(() => {
    if (!naming) return
    const id = requestAnimationFrame(() => nameField.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [naming])

  /* `apps.find`, never `store.appById` — that resolves an unknown id to a
     placeholder, so a stale id would render this panel for the wrong app. */
  const app = appId ? store.apps.find((a) => a.id === appId) : undefined

  const standing = useMemo(() => appStanding(app?.id ?? '', store.policies, store.users), [app?.id, store.policies, store.users])
  const { rows, fallback, everyoneElse } = standing
  const options = app ? attachableTo(app.id, store.policies) : []
  const none = options.length === 0
  const otherPolicies = store.policies.filter((p) => !p.isSystem).length
  const picked = pickId ? (store.policyById(pickId) ?? null) : null
  const alsoOn = picked && app ? attachKind(picked, app.id) === 'also' : false

  /* The write itself, once the checks (if any) let it through. Re-read at the
     moment of the write (inside `addToApp`) rather than trusting the object
     the options were built from. */
  const putOn = (policyId: string) => {
    if (!app) return
    if (!addToApp(store, policyId, app, store.apps)) {
      setGone(true)
      setPickId(null)
      return
    }
    setChoice(null)
    setPickId(null)
    setTried(false)
    setFlash({ id: policyId })
  }
  const takeOff = (policyId: string) => {
    if (app) removeFromApp(store, policyId, app)
  }

  function submit() {
    if (!app) return
    setTried(true)
    if (choice === 'new') {
      setNewName('')
      setNaming(true)
      return
    }
    if (!pickId || appsGuard.checking) return

    /* A policy that decides sign-ins runs the checks first, as the app page's
       Add existing does: a clean result writes in the same press, and the page
       opens over this panel only when a Must pass or Protected sign-in newly
       fails, or somebody is newly let in. Keep editing comes back to the pick.
       A draft, or a policy that is off or monitoring, is written at once. */
    const live = store.policyById(pickId)
    if (!live || live.isSystem || !appsGuard.guards(live)) return putOn(pickId)
    appsGuard.check(live, attachTo(live, app.id, store.apps).appIds, () => putOn(pickId))
  }

  /* Taking a policy off: the same checks, on the applications it keeps. */
  const detach = (policyId: string) => {
    if (!app) return
    const live = store.policyById(policyId)
    if (!live || live.isSystem) return
    if (!appsGuard.guards(live)) return takeOff(policyId)
    appsGuard.check(live, detachFrom(live, app.id).appIds, () => takeOff(policyId))
  }

  if (!app) return null

  const taken = nameTaken(newName, store.policies.map((p) => p.name))
  const nameReady = newName.trim().length > 0 && !taken

  /* Back to the list, with focus on the choice that pushed the page. */
  const back = () => {
    setNaming(false)
    requestAnimationFrame(() => newRadio.current?.focus())
  }

  const create = () => {
    if (!nameReady) return
    onCreate(blankPolicy(newName.trim(), [app.id]))
    setNaming(false)
  }

  const note =
    choice === null
      ? 'Choose new or existing to continue.'
      : choice === 'new'
        ? 'Nothing changes for users until it is published.'
        : !picked
          ? 'Pick a policy to attach.'
          : gone
            ? ''
            : /* With the attach applied, so a live policy another one shadows
                 here says it never decides rather than "takes effect". */
              attachNote(picked, app.name, { appId: app.id, policies: store.policies, users: store.users, apps: store.apps })

  const primary =
    choice === 'new'
      ? 'Name and create'
      : alsoOn
        ? `Also protect ${app.name}`
        : picked
          ? `Attach to ${app.name}`
          : 'Attach policy'

  /* The row menu here: the builder, and taking the policy off. Status changes
     and the details slider are the application page's. */
  const menu: MenuItem[] = [
    { id: 'edit', label: 'Edit policy', icon: Pencil },
    { id: 'remove', label: `Remove from ${app.name}`, icon: Unlink, danger: true, divide: true },
  ]
  const onMenu = (p: Policy) => (id: string) => {
    if (id === 'edit') store.go({ name: 'board', policyId: p.id })
    if (id === 'remove') setRemoving(p)
  }

  /* The checks' page names its write by the applications it read: with this
     one, the add, in the words of the button that asked for it; without it,
     the removal. */
  const held = appsGuard.held ? store.policyById(appsGuard.held.policyId) : undefined
  const guardPage = appsGuard.page({
    primaryLabel: appsGuard.held?.appIds.includes(app.id)
      ? held && attachKind(held, app.id) === 'also'
        ? `Also protect ${app.name}`
        : `Attach to ${app.name}`
      : `Remove from ${app.name}`,
    onConfirm: (ids, p) => (ids.includes(app.id) ? putOn(p.id) : takeOff(p.id)),
  })

  return (
    <>
      <Drawer
        open={!!appId}
        onClose={onClose}
        title={naming ? 'Name your policy' : `Protection for ${app.name}`}
        width={560}
        resizable
        head={
          naming ? (
            <div className="bapr__pushed">
              {/* Named for where it goes. */}
              <button type="button" className="bapr__back" onClick={back}>
                <ArrowLeft size={14} strokeWidth={2} aria-hidden />
                {app.name}
              </button>
              <h2>Name your policy</h2>
            </div>
          ) : (
            <div className="bapr__head">
              <AppLogo appId={app.id} name={app.name} size={28} />
              <div>
                <h2>{app.name}</h2>
                <p>{app.type}</p>
              </div>
            </div>
          )
        }
        actions={
          naming ? (
            <>
              {/* Cancel goes where Back goes: closing the panel from here would
                  throw away the list along with the name. */}
              <Button variant="ghost" onClick={back}>
                Cancel
              </Button>
              <Button variant="brand" disabled={!nameReady} onClick={create}>
                Create policy
              </Button>
            </>
          ) : (
            <>
              <p className="bapr__note">{note}</p>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              {/* Busy, not disabled, while the checks run: a disabled button
                  drops focus to the page, and the checks' page hands focus back
                  to this one when Keep editing closes it. A second press
                  meanwhile does nothing (`submit`). */}
              <Button
                variant="brand"
                disabled={choice === null || (choice === 'existing' && !pickId)}
                busy={appsGuard.checking}
                onClick={submit}
              >
                {appsGuard.checking ? 'Checking…' : primary}
              </Button>
            </>
          )
        }
      >
        <div ref={body}>
          {naming ? (
            <div className="bnp bapr__naming">
              <div className="bname2__field">
                <span className="bname2__labelrow">
                  <label htmlFor={`${uid}-name`} className="bname2__label">
                    Policy name <i>*</i>
                  </label>
                  {newName.length > 39 && <span className="bname2__count">{50 - newName.length} left</span>}
                </span>
                <input
                  id={`${uid}-name`}
                  ref={nameField}
                  type="text"
                  value={newName}
                  maxLength={50}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    create()
                  }}
                  aria-invalid={taken || undefined}
                  aria-describedby={taken ? `${uid}-name-error` : undefined}
                  placeholder="Finance Team – High Security"
                />
                {taken && (
                  <p id={`${uid}-name-error`} className="bapr__nameerror" role="alert">
                    A policy with this name already exists.
                  </p>
                )}
              </div>
              <div className="bname2__field">
                <span className="bname2__label">Application</span>
                <ApplicationFixed appId={app.id} />
              </div>
            </div>
          ) : (
            <>
              {/* Only the case the list can't show on its own: policies are attached
                  and none of them decides. */}
              {rows.length > 0 && rows.every((r) => r.n === null) && (
                /* Notice, not red: red is kept for destructive actions. */
                <Callout
                  tone="notice"
                  title={rows.length === 1 ? `The policy on ${app.name} decides nothing.` : `None of the policies on ${app.name} decides anything.`}
                >
                  {everyoneElse ? `Sign-ins fall through to ${everyoneElse.name}.` : 'Sign-ins fall through to the tenant default.'}
                </Callout>
              )}

              <section className="bapr__list">
                <header className="bapr__listhead">
                  <h3>Policies on this application</h3>
                </header>

                {rows.length === 0 ? (
                  <EmptyState
                    compact
                    icon={ShieldPlus}
                    title="No policies on this application"
                    blurb="Sign-ins fall through to the tenant default below."
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => {
                          /* Straight to the name page: the choice is already made. */
                          setChoice('new')
                          setNewName('')
                          setNaming(true)
                        }}
                      >
                        Write a new policy
                      </Button>
                    }
                  />
                ) : (
                  <ol className="bapr__stack">
                    {rows.map((row) => (
                      <PolicyRow
                        key={row.policy.id}
                        row={row}
                        tip={rowTip(row, store.groups, store.users)}
                        who={whoLabel(row.policy, store.groups, store.users)}
                        fresh={flash?.id === row.policy.id || justAdded === row.policy.id}
                        onOpen={() => store.go({ name: 'board', policyId: row.policy.id })}
                        menu={menu}
                        onSelect={onMenu(row.policy)}
                      />
                    ))}
                  </ol>
                )}

                {/* Always shown, because it is what decides the sign-in when nothing
                    above does. */}
                {fallback && <FallbackRow fallback={fallback} everyoneElse={everyoneElse} />}
              </section>

              <fieldset className="bapr__form">
                <legend className="u-label">Add protection</legend>

                <label className={`bapr__choice ${choice === 'new' ? 'is-on' : ''}`}>
                  <input
                    ref={newRadio}
                    type="radio"
                    name={`bapr-${app.id}`}
                    value="new"
                    checked={choice === 'new'}
                    onChange={() => setChoice('new')}
                  />
                  <span className="bapr__choicename">Write a new policy</span>
                  <span className="bapr__choicehint">Created as a draft on {app.name}. You name it next.</span>
                </label>

                <label className={`bapr__choice ${choice === 'existing' ? 'is-on' : ''} ${none ? 'is-disabled' : ''}`}>
                  <input
                    type="radio"
                    name={`bapr-${app.id}`}
                    value="existing"
                    disabled={none}
                    checked={choice === 'existing'}
                    onChange={() => setChoice('existing')}
                  />
                  <span className="bapr__choicename">Use an existing policy</span>
                  {/* Disabled with a reason, and the reason matches the tenant: a
                      day-one tenant has no other policies at all. */}
                  <span className="bapr__choicehint">{existingHint(options.length, otherPolicies)}</span>
                </label>

                {choice === 'existing' && (
                  <div className="bapr__pick">
                    {/* Title only: what happened is the whole of it. */}
                    {gone && <Callout tone="notice" title="That policy no longer exists.">{null}</Callout>}

                    <Picker
                      label="Policy to attach"
                      width="fill"
                      size="md"
                      searchable
                      noun="policies"
                      placeholder="Choose a policy"
                      /* Only after a submit was attempted. */
                      invalid={tried && !pickId}
                      value={pickId}
                      options={options.map((p) => policyOption(p, app, store))}
                      onChange={(v) => {
                        setPickId(v)
                        setGone(false)
                      }}
                    />

                    <p className="bapr__nodefault">The tenant default isn't listed. It already applies to every application.</p>

                    {picked && alsoOn && <AlsoNote picked={picked} />}
                  </div>
                )}
              </fieldset>
            </>
          )}
        </div>
      </Drawer>

      <RemoveDialog
        policy={removing}
        app={app}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) detach(removing.id)
          setRemoving(null)
        }}
      />
      {/* Portalled to the app root, after this panel, so it opens over it. It
          joins the dialog stack last (dialog-chrome.ts): Escape and Keep editing
          close it alone, Tab stays inside it, and focus goes back to the button
          that asked for the change. */}
      {guardPage && createPortal(<GuardDrawer {...guardPage} />, portalRoot())}
    </>
  )
}

/* One policy on an application, as the engine ranks it.

   The number is earned: a row the engine never picks takes "—", and a row
   between two live ones does not push the one below it down. The meta says
   who it is for, how many rules it has, and what its last row does — "Nothing
   else matched" is the console's name for that row — so a policy with no
   rules reads as deciding by that row rather than as broken. */
export function PolicyRow({
  row,
  tip,
  who,
  fresh,
  onOpen,
  menu,
  onSelect,
}: {
  row: StandRow
  /** Why it decides for fewer than it names, or not at all (`rowTip`). Null for none. */
  tip: string | null
  /** Who it is for (`whoLabel`). */
  who: string
  fresh: boolean
  onOpen: () => void
  menu: MenuItem[]
  onSelect: (id: string) => void
}) {
  const p = row.policy
  return (
    <li className={`bapr__row ${row.n === null ? 'is-off' : ''} ${fresh ? 'is-new' : ''}`}>
      <span className="bapr__n" aria-hidden>
        {row.n ?? '—'}
      </span>
      <div className="bapr__body">
        <span className="bapr__namerow">
          <button type="button" className="bapr__name" data-policy-id={p.id} onClick={onOpen}>
            {p.name}
          </button>
          {tip && <TipDot text={tip} label={`About ${p.name}`} />}
          {p.pendingDraft && <ChangeState unsaved={false} draft />}
        </span>
        <span className="bapr__meta">
          <span className="u-muted">
            {who} · {rulesLabel(p)} · Nothing else matched: {DECISION_WORDS[fallbackOf(p)]}
          </span>
          <StatusPill status={p.status} />
        </span>
      </div>
      {/* No "Turn on" here. Publishing belongs to the builder, with the rules
          in view. */}
      <RowMenu label={`Actions for ${p.name}`} items={menu} onSelect={onSelect} />
    </li>
  )
}

/* The tenant default, under every application's list: the ⌄ row, never
   numbered and never a menu — it cannot come off an application it was never
   put on. Its tip says whether anybody reaches it here: a live policy for
   everyone above it decides for everyone no group policy covers. */
export function FallbackRow({ fallback, everyoneElse }: { fallback: Policy; everyoneElse: Policy | null }) {
  const reached = !everyoneElse || everyoneElse.id === fallback.id
  return (
    <div className="bapr__fall">
      <span className="bapr__n bapr__n--fall" aria-hidden>
        ⌄
      </span>
      <div className="bapr__body">
        <span className="bapr__namerow">
          <strong>{fallback.name}</strong>
          <TipDot
            text={reached ? 'Decides for people no policy above covers.' : `Not reached. Everyone uses ${everyoneElse.name}.`}
            label={`About ${fallback.name}`}
          />
        </span>
        <span className="bapr__meta">
          Everyone else · {rulesLabel(fallback)} · Nothing else matched: {DECISION_WORDS[fallbackOf(fallback)]}
        </span>
      </div>
      <Badge tone="system">System</Badge>
      <StatusPill status={fallback.status} />
    </div>
  )
}

/* Attaching adds; the policy keeps its other applications. Info, not a
   warning: nothing is at stake, there is something to know. */
export function AlsoNote({ picked }: { picked: Policy }) {
  const store = useBrand()
  const on = appsOf(picked, store.apps)
  if (on.length === 0) return null

  return (
    <Callout tone="info" title="Also on other applications">
      <em>{picked.name}</em> stays on <strong>{on.map((a) => a.name).join(', ')}</strong>. Edits to it apply to every
      application it is on.
    </Callout>
  )
}

const keyId = (k: Key) => (k.kind === 'everyone' ? 'everyone' : `${k.kind}:${k.id}`)

/* Taking a policy off an application, when it decides for somebody there.

   What happens to the policy is one sentence (`removeCopy`). What happens to
   sign-ins is a list, read from the engine: each group, person or everyone
   else this policy decides for, and the policy that decides for them once it
   has gone (`deciderChanges`) — "Engineering → Global Default Policy" on Box,
   not "the next policy down", which would be Box for design and wrong.

   A person in two groups is a row of their own when they go somewhere their
   groups' rows do not say (Tanmay Joshi → Box for design), drawn with a
   person's face. A group no policy on the app names moves exactly as everyone
   else does, so its row would repeat Everyone's: `visibleMoves` drops it, and
   the list names the groups the app's Groups tab names. */
export function RemoveDialog({
  policy,
  app,
  onCancel,
  onConfirm,
}: {
  policy: Policy | null
  app: { id: string; name: string }
  onCancel: () => void
  onConfirm: () => void
}) {
  const store = useBrand()
  const moves = useMemo(() => {
    if (!policy) return []
    const after = store.policies.map((p) => (p.id === policy.id && !p.isSystem ? detachFrom(p, app.id) : p))
    const changes = deciderChanges(app.id, store.policies, after, store.users, store.groups)
    return visibleMoves(changes, app.id, store.policies, after).filter((m) => m.from?.id === policy.id)
  }, [policy, app.id, store.policies, store.users, store.groups])
  const copy = policy ? removeCopy(policy, app) : null

  return (
    <Modal
      open={!!policy}
      onClose={onCancel}
      title={`Remove ${policy?.name ?? 'this policy'} from ${app.name}?`}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Remove
          </Button>
        </>
      }
    >
      {copy && (
        <div className="bapr__confirm">
          <p>{copy.policy}</p>
          {moves.length > 0 && (
            <div>
              <span className="u-label">Sign-ins move to</span>
              <dl className="bapp__moves">
                {moves.map((m) => {
                  const name = keyName(m.key, store.groups, store.users)
                  return (
                    <div key={keyId(m.key)}>
                      <dt>
                        {m.key.kind !== 'everyone' && <Face kind={m.key.kind} name={name} size="sm" decorative />}
                        {name}
                      </dt>
                      <dd>{m.to?.name ?? 'No policy'}</dd>
                    </div>
                  )
                })}
              </dl>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
