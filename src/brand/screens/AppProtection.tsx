import { useEffect, useState } from 'react'
import { useId, useRef } from 'react'
import { ArrowLeft, ShieldPlus } from 'lucide-react'

import { Badge, Button, Callout, Drawer, Modal, StatusPill, TipDot } from '../kit'
import { EmptyState } from '../empty'
import { Picker, type PickerOption } from '../picker'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'
import { appsLabel, appsOf, blankPolicy, nameTaken, type Policy } from '../data'
import { ApplicationFixed } from './scope-fields'
import { attachKind, attachTo, attachableTo, decidesFor, detachFrom, orderOf, protectionOf, whyNotDeciding } from './app-policies'
import { attachNote, existingHint, remainingApps, removeCopy, removeToast } from './applications-model'

/* -----------------------------------------------------------------------------
   What protects one application, and the form for adding to it.

   The brief this was built to: "Do not add an option to attach a policy.
   Instead, provide a form where the user can attach a new policy or an existing
   one." So the form is always open at the foot of this panel, and nothing is
   preselected.

   The panel stays open after every write, so you watch the list you are
   changing.

   Naming a new policy is a page pushed inside this panel, with Back, not a
   centred dialog over it.
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

  const [choice, setChoice] = useState<'new' | 'existing' | null>(null)
  const [pickId, setPickId] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [gone, setGone] = useState(false)
  const [removing, setRemoving] = useState<Policy | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
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

  const { own, decides, fallback } = protectionOf(app?.id ?? '', store.policies)
  const numbers = orderOf(own)
  const options = app ? attachableTo(app.id, store.policies) : []
  const none = options.length === 0
  const otherPolicies = store.policies.filter((p) => !p.isSystem).length
  const picked = pickId ? (store.policyById(pickId) ?? null) : null
  const alsoOn = picked && app ? attachKind(picked, app.id) === 'also' : false

  function submit() {
    if (!app) return
    setTried(true)
    if (choice === 'new') {
      setNewName('')
      setNaming(true)
      return
    }
    if (!pickId) return

    /* Re-read at click time rather than trusting the object the options were
       built from. `savePolicy` replaces the whole record by id, so writing a
       spread of a stale render would revert fields edited elsewhere. */
    const live = store.policyById(pickId)
    if (!live) {
      setGone(true)
      setPickId(null)
      return
    }

    store.savePolicy(attachTo(live, app.id, store.apps))
    store.showToast(`${live.name} added to ${app.name}.`)
    setChoice(null)
    setPickId(null)
    setTried(false)
    setFlash(live.id)
  }

  function remove(p: Policy) {
    const live = store.policyById(p.id)
    if (live && app) {
      store.savePolicy(detachFrom(live, app.id))
      store.showToast(removeToast(live.name, app.name, remainingApps(live, app.id), live.status === 'draft'))
    }
    setRemoving(null)
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
            : attachNote(picked, app.name)

  const primary =
    choice === 'new'
      ? 'Name and create'
      : alsoOn
        ? `Also protect ${app.name}`
        : picked
          ? `Attach to ${app.name}`
          : 'Attach policy'

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
              <Button variant="brand" disabled={choice === null || (choice === 'existing' && !pickId)} onClick={submit}>
                {primary}
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
              {own.length > 0 && decides.length === 0 && (
                /* Notice, not red: red is kept for destructive actions. */
                <Callout
                  tone="notice"
                  title={own.length === 1 ? `The policy on ${app.name} decides nothing.` : `None of the policies on ${app.name} decides anything.`}
                >
                  {fallback ? `Sign-ins fall through to ${fallback.name}.` : 'Sign-ins fall through to the tenant default.'}
                </Callout>
              )}

              <section className="bapr__list">
                <header className="bapr__listhead">
                  <h3>Policies on this application</h3>
                  <p>Checked top to bottom. The first match decides.</p>
                </header>

                {own.length === 0 ? (
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
                    {own.map((p, i) => (
                      <PolicyRow
                        key={p.id}
                        policy={p}
                        n={numbers[i]}
                        fresh={flash === p.id || justAdded === p.id}
                        onOpen={() => store.go({ name: 'board', policyId: p.id })}
                        onRemove={() => setRemoving(p)}
                      />
                    ))}
                  </ol>
                )}

                {/* Always shown, because it is what decides the sign-in when nothing
                    above does. */}
                {fallback && (
                  <div className="bapr__fall">
                    <span className="bapr__n bapr__n--fall" aria-hidden>
                      ⌄
                    </span>
                    <div className="bapr__body">
                      <span className="bapr__namerow">
                        <strong>{fallback.name}</strong>
                        <TipDot text="Decides when no policy above matches." label={`About ${fallback.name}`} />
                      </span>
                    </div>
                    <Badge tone="system">System</Badge>
                    <StatusPill status={fallback.status} />
                  </div>
                )}
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
                    {gone && (
                      <Callout tone="negative" title="That policy no longer exists.">
                        It may have been deleted since this panel was opened.
                      </Callout>
                    )}

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
                      options={options.map((p) => toOption(p, store))}
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
        own={own}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove(removing)}
      />
    </>
  )
}

function PolicyRow({
  policy,
  n,
  fresh,
  onOpen,
  onRemove,
}: {
  policy: Policy
  /** Null when this policy decides nothing — an em dash, not a number. */
  n: number | null
  fresh: boolean
  onOpen: () => void
  onRemove: () => void
}) {
  const empty = policy.rules.length === 0
  /* Why it has no number, in a tip beside the name. The status pill already
     says Draft or Inactive; the tip says what that means here. */
  const why = empty ? 'No rules yet. Open it to add rules.' : decidesFor(policy) ? null : whyNotDeciding(policy)

  return (
    <li className={`bapr__row ${n === null ? 'is-off' : ''} ${fresh ? 'is-new' : ''}`}>
      {/* Earned, not positional: a policy that decides nothing takes no number. */}
      <span className="bapr__n" aria-hidden>
        {n ?? '—'}
      </span>
      <div className="bapr__body">
        <span className="bapr__namerow">
          <button type="button" className="bapr__name" data-policy-id={policy.id} onClick={onOpen}>
            {policy.name}
          </button>
          {why && <TipDot text={why} label={`Why ${policy.name} decides nothing`} />}
        </span>
        <span className="bapr__meta">
          <Badge tone="info">{policy.type}</Badge>
          <span className="u-muted">{empty ? 'No rules' : `${policy.rules.length} rule${policy.rules.length === 1 ? '' : 's'}`}</span>
          <StatusPill status={policy.status} />
        </span>
      </div>
      {/* No "Turn on" here. Publishing belongs to the builder, with the rules
          in view. */}
      <Button size="sm" variant="ghost" onClick={onRemove}>
        Remove
      </Button>
    </li>
  )
}

/* Attaching adds; the policy keeps its other applications. Info, not a
   warning: nothing is at stake, there is something to know. */
function AlsoNote({ picked }: { picked: Policy }) {
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

function RemoveDialog({
  policy,
  app,
  own,
  onCancel,
  onConfirm,
}: {
  policy: Policy | null
  app: { id: string; name: string }
  own: Policy[]
  onCancel: () => void
  onConfirm: () => void
}) {
  const copy = policy ? removeCopy(policy, app, own) : null
  return (
    <Modal
      open={!!policy}
      onClose={onCancel}
      title={`Remove this policy from ${app.name}?`}
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
          <p>{copy.signIns}</p>
        </div>
      )}
    </Modal>
  )
}

/* The words the pills use, not the enum. */
const STATUS_WORD: Record<Policy['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  inactive: 'Inactive',
  'always-on': 'Always on',
}

function toOption(p: Policy, store: ReturnType<typeof useBrand>): PickerOption {
  const named = appsOf(p, store.apps)
  const on = named[0] ?? null
  const rules = `${p.rules.length} rule${p.rules.length === 1 ? '' : 's'}`
  const status = STATUS_WORD[p.status]
  return {
    value: p.id,
    label: p.name,
    meta: on ? `${appsLabel(named)}, ${rules}, ${status}` : `${p.type}, ${rules}, ${status}`,
    art: on ? <AppLogo appId={on.id} name={on.name} size={16} /> : undefined,
    group: on ? 'On other applications' : 'No applications yet',
  }
}
