import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'

import { Badge, Button, Callout, Drawer, Modal, StatusPill } from '../kit'
import { EmptyState } from '../empty'
import { Picker, type PickerOption } from '../picker'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'
import { appsLabel, appsOf, type Policy } from '../data'
import {
  attachKind,
  attachTo,
  attachableTo,
  decidesFor,
  detachFrom,
  orderOf,
  protectionOf,
  whyNotDeciding,
} from './app-policies'

/* -----------------------------------------------------------------------------
   What protects one application, and the form for adding to it.

   The brief this was built to: "Do not add an option to attach a policy.
   Instead, provide a form where the user can attach a new policy or an existing
   one." The distinction is the whole design. An option is a menu item that
   performs an attachment as the consequence of being found; a form is a surface
   where both routes are visible, neither is chosen for you, and what the choice
   costs is stated before it is made.

   So the form is permanently open at the foot of this panel — not behind a
   button, not in a tab, not in a disclosure — and NOTHING IS PRESELECTED, not
   even on an application with no policies at all, which is the commonest state
   on this page and exactly the moment the choice is worth making deliberately.

   The panel stays open after every write. That is the argument for a drawer
   rather than a screen: you watch the list you are changing.
   -------------------------------------------------------------------------- */

export function AppProtection({
  appId,
  justAdded,
  onClose,
  onNew,
}: {
  appId: string | null
  /* A policy the CALLER just created, so it lands with the same tint as one
     attached from inside this panel. Two ways in, one arrival. */
  justAdded?: string | null
  onClose: () => void
  onNew: () => void
}) {
  const store = useBrand()

  const [choice, setChoice] = useState<'new' | 'existing' | null>(null)
  const [pickId, setPickId] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [gone, setGone] = useState(false)
  const [removing, setRemoving] = useState<Policy | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  /* Reset when the subject changes. One drawer serves every row, so a form
     that remembered the last application's answer would offer to attach a
     policy to the app you just left. */
  useEffect(() => {
    setChoice(null)
    setPickId(null)
    setTried(false)
    setGone(false)
    setFlash(null)
  }, [appId])

  /* `apps.find`, never `store.appById` — that resolves an unknown id to
     `apps[0]` with no undefined branch, so a stale id would render this whole
     panel as Salesforce rather than as nothing. */
  const app = appId ? store.apps.find((a) => a.id === appId) : undefined

  const { own, decides, fallback } = protectionOf(app?.id ?? '', store.policies)
  const numbers = orderOf(own)
  const options = app ? attachableTo(app.id, store.policies) : []
  const none = options.length === 0
  const picked = pickId ? (store.policyById(pickId) ?? null) : null
  /* Whether the chosen policy already protects something else. It used to gate
     a warning, because attaching here would have TAKEN it from there. It gates
     nothing now — a policy holds a list, so this application is added to it —
     and what is left is a wording change: `also` rather than `Attach`. */
  const alsoOn = picked && app ? attachKind(picked, app.id) === 'also' : false

  function submit() {
    if (!app) return
    setTried(true)
    if (choice === 'new') {
      onNew()
      return
    }
    if (!pickId) return

    /* Re-read at click time rather than trusting the object the options were
       built from. `savePolicy` replaces the whole record by id, so writing a
       spread of a stale render would silently revert every field edited
       elsewhere since this panel opened. */
    const live = store.policyById(pickId)
    if (!live) {
      setGone(true)
      setPickId(null)
      return
    }

    /* How many it protected BEFORE, so the toast can say "now protects three"
       rather than implying this was the only one. */
    const had = live.appIds.length
    store.savePolicy(attachTo(live, app.id, store.apps))
    store.showToast(
      had > 0
        ? `${live.name} now protects ${app.name} as well — ${had + 1} applications`
        : `${live.name} now protects ${app.name}`,
    )
    setChoice(null)
    setPickId(null)
    setTried(false)
    setFlash(live.id)
  }

  function remove(p: Policy) {
    const live = store.policyById(p.id)
    if (live && app) {
      const next = detachFrom(live, app.id)
      store.savePolicy(next)
      store.showToast(
        next.appIds.length === 0
          ? `${live.name} no longer protects ${app.name} — back to draft`
          : `${live.name} no longer protects ${app.name} — still on ${next.appIds.length}`,
      )
    }
    setRemoving(null)
  }

  if (!app) return null

  const note =
    choice === null
      ? 'Choose new or existing to continue.'
      : choice === 'new'
        ? 'You will name it next. Created switched off — nothing changes for users until you turn it on.'
        : !picked
          ? 'Pick a policy to attach.'
          : gone
            ? ''
            : decidesFor(picked)
              ? `This takes effect on the next sign-in to ${app.name}.`
              : `${picked.name} protects nothing today, and it is switched off — nothing changes for users yet.`

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
        /* Plainly `onClose` again. This used to decline to close while the name
           dialog was up, because `Drawer`'s Escape handler was unconditional
           and one press closed both — taking the half-typed name with it. The
           repair landed in the kit: `Drawer` joins the same innermost-wins
           stack `Modal` uses, so Escape peels the dialog and leaves the panel
           standing, and the panel no longer has to know the dialog exists. */
        onClose={onClose}
        title={`Protection for ${app.name}`}
        width={560}
        resizable
        head={
          <div className="bapr__head">
            <AppLogo appId={app.id} name={app.name} size={28} />
            <div>
              <h2>{app.name}</h2>
              {/* Attachment, which is a fact. Whether it is GOVERNED is a
                  judgement, and it goes in the verdict below where there is
                  room to qualify it. */}
              <p>
                {app.type} · {own.length === 0 ? 'No policy of its own' : `${own.length} polic${own.length === 1 ? 'y' : 'ies'} attached`}
              </p>
            </div>
          </div>
        }
        actions={
          <>
            <p className="bapr__note">{note}</p>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="brand" disabled={choice === null || (choice === 'existing' && !pickId)} onClick={submit}>
              {primary}
            </Button>
          </>
        }
      >
        <Verdict app={app.name} own={own.length} decides={decides.length} />

        <section className="bapr__list">
          <header className="bapr__listhead">
            <h3>Policies on this application</h3>
            {/* The same dialect the policies table's rule peek uses. One
                ordering semantics, one sentence for it. */}
            <p>Checked top to bottom · first match wins</p>
          </header>

          {own.length === 0 ? (
            <EmptyState
              compact
              /* Shield, not ShieldOff. The application is not unprotected —
                 the tenant default catches it — and the icon must not
                 contradict the sentence under it. */
              icon={Shield}
              title="Nothing of its own yet"
              /* NOT the fall-through sentence again. The verdict above already
                 says where sign-ins go, and an empty state that repeats the
                 callout six inches under it reads as two components arguing
                 for the same space. This says the thing neither of them does:
                 which row on this panel is currently doing the deciding. */
              blurb="The row below is what decides a sign-in here today."
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

          {/* Always rendered, including on an empty application, because it is
              what actually decides the sign-in when nothing above does.
              Excluding the tenant default from the PICKER is right; hiding it
              from the reading of what protects this app would answer the
              question except for the part that usually answers it. */}
          {fallback && (
            <div className="bapr__fall">
              <span className="bapr__n bapr__n--fall" aria-hidden>
                ⌄
              </span>
              <div className="bapr__body">
                <strong>{fallback.name}</strong>
                <span>Nothing above matched</span>
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
              type="radio"
              name={`bapr-${app.id}`}
              value="new"
              checked={choice === 'new'}
              onChange={() => setChoice('new')}
            />
            <span className="bapr__choicename">Write a new policy</span>
            <span className="bapr__choicehint">Created for {app.name} and switched off. You name it next.</span>
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
            {/* Disabled WITH a reason. A choice that disappears becomes
                folklore about a broken screen; a disabled one that says why
                does not. Reachable: at the day-one persona depth the tenant
                has ten applications and only the system policy. */}
            <span className="bapr__choicehint">
              {none
                ? 'Every other policy already protects this application.'
                : 'A policy protects one application at a time, so this moves it here.'}
            </span>
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
                placeholder="Choose a policy"
                /* Only after a submit was attempted. A red border on a control
                   nobody has touched is an accusation. */
                invalid={tried && !pickId}
                value={pickId}
                options={options.map((p) => toOption(p, store))}
                onChange={(v) => {
                  setPickId(v)
                  setGone(false)
                }}
              />

              <p className="bapr__nodefault">
                The tenant default is not listed — it already applies wherever nothing else does.
              </p>

              {picked && alsoOn && <AlsoNote picked={picked} />}
            </div>
          )}
        </fieldset>
      </Drawer>

      {/* A sibling of the drawer, for the same reason the name dialog is:
          `Modal` does not portal, and the drawer's transform makes it the
          containing block for anything fixed inside it. */}
      <RemoveDialog
        policy={removing}
        appName={app.name}
        next={nextDecider(removing, own)}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove(removing)}
      />
    </>
  )
}

/* What is true of this application right now, in one sentence.

   The third case is the loudest thing in the panel deliberately: a list of
   attached-but-dormant policies looks exactly like protection on every other
   surface in the product, and this is the only place that says otherwise. */
function Verdict({ app, own, decides }: { app: string; own: number; decides: number }) {
  if (decides > 0) {
    return (
      <Callout tone="positive">
        Sign-ins are checked against the policies below, top to bottom. The first match decides.
      </Callout>
    )
  }
  if (own === 0) {
    return (
      <Callout tone="notice" title="No policy of its own.">
        Sign-ins to {app} fall through to the tenant default, which asks for a password and nothing else.
      </Callout>
    )
  }
  return (
    <Callout tone="negative" title={`${own} polic${own === 1 ? 'y' : 'ies'} name${own === 1 ? 's' : ''} ${app} and none of them decides anything.`}>
      Sign-ins fall through to the tenant default, which asks for a password and nothing else.
    </Callout>
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
  const why = whyNotDeciding(policy)
  const empty = policy.rules.length === 0

  return (
    <li className={`bapr__row ${n === null ? 'is-off' : ''} ${fresh ? 'is-new' : ''}`}>
      {/* Earned, not positional. Numbering a switched-off policy 3 asserts a
          place in a race it never enters, and puts this panel in direct
          contradiction with the coverage grid, which draws no cell for it. */}
      <span className="bapr__n" aria-hidden>
        {n ?? '—'}
      </span>
      <div className="bapr__body">
        <span className="bapr__namerow">
          <button type="button" className="bapr__name" onClick={onOpen}>
            {policy.name}
          </button>
        </span>
        <span className="bapr__meta">
          <Badge tone="info">{policy.type}</Badge>
          {!empty && (
            <span className="u-muted">
              {policy.rules.length} rule{policy.rules.length === 1 ? '' : 's'}
            </span>
          )}
          <StatusPill status={policy.status} />
        </span>
        {/* The state a policy created from this panel lands in. It must not be
            silent about what that means. */}
        {empty ? (
          <span className="bapr__why">
            No rules yet — everyone gets in with a password.
            <Button size="sm" variant="brand" onClick={onOpen}>
              Add rules →
            </Button>
          </span>
        ) : (
          why && <span className="bapr__why">{why}</span>
        )}
      </div>
      {/* No "Turn on" here. Flipping a policy live begins refusing real
          sign-ins, and doing that from a side panel with the rules off screen
          is an enforcement change made blind. The builder's own bar owns it. */}
      <Button size="sm" variant="ghost" onClick={onRemove}>
        Remove
      </Button>
    </li>
  )
}

/* `MoveWarning` stood here, and its removal is the point of the whole change.

   It said: "Moving, not copying. X protects Salesforce today. A policy protects
   one application, so attaching it here takes it off Salesforce" — and then
   counted what Salesforce would be left with, because the answer could be
   nothing and a sign-in falling through to the tenant default is worth a
   warning.

   None of that is true any more. Attaching adds; Salesforce keeps what it had.
   A warning about a consequence that no longer happens is worse than no
   warning, so what replaces it states the fact plainly and in the `info` ramp:
   nothing is at stake, there is something to know. */
function AlsoNote({ picked }: { picked: Policy }) {
  const store = useBrand()
  const on = appsOf(picked, store.apps)
  if (on.length === 0) return null

  return (
    <Callout tone="info" title="Adding, not moving.">
      <em>{picked.name}</em> already protects <strong>{on.map((a) => a.name).join(', ')}</strong>, and keeps
      {on.length === 1 ? ' it' : ' them'}. One policy can protect several applications, so the same rules
      apply here too — and editing it later changes every one of them at once.
    </Callout>
  )
}

function RemoveDialog({
  policy,
  appName,
  next,
  onCancel,
  onConfirm,
}: {
  policy: Policy | null
  appName: string
  next: Policy | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={!!policy}
      onClose={onCancel}
      title={`Remove this policy from ${appName}?`}
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
      {policy && (
        <div className="bapr__confirm">
          <p>
            <em>{policy.name}</em> goes back to a draft. Its rules stay exactly as they are, but a policy with no
            application is not finished, so it stops deciding sign-ins until you attach it somewhere and publish it
            again.
          </p>
          {/* The consequence a generic confirmation cannot state: what catches
              the sign-ins this policy was deciding. */}
          <p>
            {next
              ? `Sign-ins it was deciding will fall to ${next.name}.`
              : `${appName} will be left with the tenant default only.`}
          </p>
        </div>
      )}
    </Modal>
  )
}

/** The next policy below this one that actually decides, for the remove confirmation. */
function nextDecider(policy: Policy | null, own: Policy[]): Policy | null {
  if (!policy) return null
  const at = own.findIndex((p) => p.id === policy.id)
  if (at < 0) return null
  return own.slice(at + 1).find(decidesFor) ?? null
}

/* The words the pills use, not the enum. A picker row reading "active" in
   lower case beside a table of "Active" pills is the same fact in two
   dialects, and the raw value is the one nobody outside the model says. */
const STATUS_WORD: Record<Policy['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  inactive: 'Inactive',
  monitor: 'Monitor',
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
    /* The application's NAME, resolved. A neighbouring surface prints the raw
       id here while its own comment says it means the name; that bug is not
       worth propagating into a second place. */
    meta: on ? `Protects ${appsLabel(named)} · ${rules} · ${status}` : `${p.type} · ${rules} · ${status}`,
    /* The first application's mark, so a row says what this policy is already
       doing before anybody clicks. Nothing on the unassigned group — there is
       nothing to show. */
    art: on ? <AppLogo appId={on.id} name={on.name} size={16} /> : undefined,
    group: on ? 'Already protecting something else' : 'Protecting nothing yet',
  }
}
