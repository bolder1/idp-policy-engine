import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AppWindow,
  ArrowLeft,
  Eye,
  EyeOff,
  ListPlus,
  PanelRight,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Radar,
  ShieldCheck,
  ShieldPlus,
  Sliders,
  Trash2,
  Unlink,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { Badge, Button, IconButton, NameField, SaveBar, Tabs, type MenuItem, type ReviewRow } from '../kit'
import { EmptyState } from '../empty'
import { DocsLink } from '../Shell'
import { AppLogo } from '../logos/AppLogo'
import { ChangeState, useLeaveGuard } from '../leave-guard'
import { useBrand } from '../store'
import { blankPolicy, nameTaken, type App, type Policy } from '../data'
import { freeName } from '../policy-name'
import { playCue } from '../sound'
import { AddExistingPolicy } from './AddExistingPolicy'
import { FallbackRow, PolicyRow, RemoveDialog } from './AppProtection'
import { AppGroupsTab, AppUsersTab } from './app-people-tabs'
import { attachTo, attachableTo, deleteDetail, detachFrom } from './app-policies'
import { appStanding, rowTip, whoLabel, type StandRow } from './app-standing'
import { addToApp, removeFromApp } from './applications-model'
import { useAppsGuard } from './board/apps-guard'
import { arriveFromBoard, sendToBoard, type SentToBoard } from './board-return'
import { ConfirmDelete } from './confirm-delete'
import { SidePanel } from './device-profile-parts'
import { GuardDrawer } from './guard-page'
import { PageBar } from './page-bar'
import { PolicyDetailsDrawer } from './policy-details-drawer'
import { APP_BASIC_NOTE } from './profile-notes'
import { CopyText } from './sign-in-tests/CopyText'
import { portalRoot, statusOptions, type StatusTarget } from './status-options'
import { useStatusChange } from './use-status-change'

/* -----------------------------------------------------------------------------
   One application's own page: the live console's app page (Basic, Policies)
   with the two tabs its Show Associated Entities page holds (Users, Groups).

   The head is a library detail page's (a zone's, a device profile's): the way
   back, the logo and the name with its rename pencil, the app type as a pill.
   A rename saves at once; Basic's Description and App secret go through the
   save footer, which stays up on every tab — a tab is a place on this page,
   not a way off it.

   Policies leads, because it is where policies get attached. Its list is the
   engine's (app-standing.ts): numbered by who each policy actually decides
   for, the shadowed ones said so, the tenant default under them. Users and
   Groups are read from the same model (app-people-tabs.tsx).
   -------------------------------------------------------------------------- */

type Tab = 'basic' | 'policies' | 'users' | 'groups'

const TABS: { value: Tab; label: string; icon: LucideIcon }[] = [
  { value: 'basic', label: 'Basic', icon: Sliders },
  { value: 'policies', label: 'Policies', icon: ShieldCheck },
  { value: 'users', label: 'Users', icon: UserRound },
  { value: 'groups', label: 'Groups', icon: Users },
]

const NAME_MAX = 50
const DESCRIPTION_MAX = 250
/* The count appears once the description is close to its cap, not from the first character. */
const DESCRIPTION_COUNT_FROM = 200

/* The status items' marks, the Policies row menu's own (Policies.tsx). */
const STATUS_ICON: Record<StatusTarget, LucideIcon> = { active: Power, monitor: Radar, inactive: PowerOff }

/* Policies this page sent to the board — New policy, Add a copy — and whether
   the application had a deciding policy when they left. Spent by the next
   arrival at any application's page, and read only when that arrival is the
   board's way back with the policy flashed: the first policy that decides on
   an application gets the celebration rather than silence (board-return.ts).
   Module state, because the page is unmounted while the board is open. */
const sentToBoard: SentToBoard = new Map()

export function ApplicationPage({
  appId,
  tab,
  group,
  flash,
  from,
}: {
  appId: string
  tab?: Tab
  /** The Users tab's group filter, from a Groups-tab count. */
  group?: string
  /** The policy the board just came back from: lit and focused in the list. */
  flash?: string
  /** The group page this was opened from, which the way back names. */
  from?: { groupId: string }
}) {
  const store = useBrand()
  /* `apps.find`, never `appById`: that resolves an unknown id to the first
     application, so a stale link would open the wrong one. */
  const app = store.apps.find((a) => a.id === appId)
  if (!app) {
    return (
      <div className="bpage">
        <EmptyState
          icon={AppWindow}
          title="Application not found"
          blurb="It may have been deleted."
          action={
            <Button variant="brand" onClick={() => store.go({ name: 'applications' })}>
              Back to applications
            </Button>
          }
        />
      </div>
    )
  }
  return <AppPage app={app} routeTab={tab} group={group} flash={flash} from={from} />
}

interface BasicDraft {
  description: string
  secret: string
}

function AppPage({
  app,
  routeTab,
  group,
  flash,
  from,
}: {
  app: App
  routeTab?: Tab
  group?: string
  flash?: string
  from?: { groupId: string }
}) {
  const store = useBrand()

  /* The route owns the tab (SignInTests.tsx): a link can land on one, and a
     new tab from outside moves the page that is already open. */
  const [tab, setTab] = useState<Tab>(routeTab ?? 'policies')
  const [seen, setSeen] = useState(routeTab)
  if (seen !== routeTab) {
    setSeen(routeTab)
    if (routeTab) setTab(routeTab)
  }

  /* --- Basic's draft, held here so it outlives a tab switch ------------------- */
  const [draft, setDraft] = useState<BasicDraft>({ description: app.description ?? '', secret: app.secret ?? '' })
  const descriptionChanged = draft.description.trim() !== (app.description ?? '')
  const secretChanged = draft.secret !== (app.secret ?? '')
  const dirty = descriptionChanged || secretChanged

  const saveBasic = () => {
    const stored = store.apps.find((a) => a.id === app.id) ?? app
    const description = draft.description.trim()
    store.saveApp({ ...stored, description: description || undefined, secret: draft.secret || undefined })
    setDraft({ description, secret: draft.secret })
    store.showToast(`${stored.name} saved`)
  }

  /* A tab press is a move inside this page, and `go` asks the leave guard
     before it moves — synchronously, so the guard is told it is a tab for
     exactly that call and the draft goes along without a dialog. */
  const tabbing = useRef(false)
  const confirmLeave = useLeaveGuard({
    get dirty() {
      return dirty && !tabbing.current
    },
    save: () => {
      saveBasic()
      return true
    },
    saveLabel: 'Save changes',
  })

  const show = (t: Tab, extra?: { group?: string }) => {
    /* The tab already open, pressed again, keeps its filters. */
    if (t === tab && !extra) return
    setTab(t)
    setSeen(t)
    tabbing.current = true
    try {
      store.go({ name: 'application', appId: app.id, tab: t, ...(from ? { from } : {}), ...extra })
    } finally {
      tabbing.current = false
    }
  }

  /* --- The way back ------------------------------------------------------------ */
  const fromGroup = from ? store.groups.find((g) => g.id === from.groupId) : undefined
  const back = () =>
    store.go(fromGroup ? { name: 'groups', groupId: fromGroup.id, tab: 'applications' } : { name: 'applications' })

  /* The heading takes focus on arrival, and whenever a tab's content took the
     focused control away with it (a count that opened another tab). A row
     the board's way back flashed has focused itself first. */
  const heading = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    const active = document.activeElement
    if (!active || active === document.body) heading.current?.focus({ preventScroll: true })
  }, [tab])

  /* Back from the board with a policy this page's New policy or Add a copy
     sent there: the first policy that decides on this application is
     celebrated. Any arrival spends what the presses noted, on whichever tab it
     lands — a board left through the rail is never celebrated later. */
  useEffect(() => {
    const decides = (id: string) =>
      appStanding(app.id, store.policies, store.users).rows.some((r) => r.policy.id === id && r.state === 'decides')
    if (arriveFromBoard(sentToBoard, flash, decides)) playCue('celebrate')
    // Arrival only: a later flash is an attach, which sounds for itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* --- Renaming in place: saved at once, as every stored detail page's is -------- */
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(app.name)
  const [nameErr, setNameErr] = useState<string | null>(null)
  /* The name last sent to the store, so Enter and the field's own leave save once. */
  const savedName = useRef(app.name)
  const renameSlot = useRef<HTMLSpanElement | null>(null)
  const focusRename = () =>
    window.setTimeout(() => renameSlot.current?.querySelector('button')?.focus({ preventScroll: true }), 0)

  const otherNames = store.apps.filter((a) => a.id !== app.id).map((a) => a.name)
  const nameProblem = !draftName.trim()
    ? 'Enter an application name.'
    : nameTaken(draftName.trim(), otherNames)
      ? 'An application with this name already exists.'
      : null

  /* The name alone, read from the store: Basic's unsaved draft never rides along. */
  const keepName = () => {
    if (nameProblem) {
      setNameErr(nameProblem)
      return false
    }
    const name = draftName.trim()
    setNameErr(null)
    setDraftName(name)
    if (name !== savedName.current) {
      savedName.current = name
      const stored = store.apps.find((a) => a.id === app.id)
      if (stored) {
        store.saveApp({ ...stored, name })
        store.showToast(`${name} saved`)
      }
    }
    return true
  }
  const commitName = () => {
    if (!keepName()) return
    setRenaming(false)
    focusRename()
  }
  const cancelName = () => {
    setDraftName(app.name)
    setNameErr(null)
    setRenaming(false)
    focusRename()
  }

  /* --- What the save footer reviews ------------------------------------------------ */
  const changes = [...(descriptionChanged ? ['Description'] : []), ...(secretChanged ? ['App secret'] : [])]
  /* The secret's value is never printed, here or anywhere: the review says that it changes. */
  const review: ReviewRow[] = [
    ...(descriptionChanged
      ? [{ label: 'Description', before: app.description || 'None', after: draft.description.trim() || 'None', kind: 'changed' as const }]
      : []),
    ...(secretChanged ? [{ label: 'App secret', before: 'Current secret', after: 'New secret', kind: 'changed' as const }] : []),
  ]

  const label = TABS.find((t) => t.value === tab)?.label ?? 'Policies'

  return (
    <div className="bpage bapp">
      <button type="button" className="bz7__back" onClick={back}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        {fromGroup ? fromGroup.name : 'All applications'}
      </button>

      <header className="bz7__pagehead">
        <div className="bz7__namewrap">
          <div className={`bz7__titleline ${renaming ? 'is-renaming' : ''}`}>
            {/* The heading names it; the logo is a mark beside the name. */}
            <span className="bapp__logo" aria-hidden>
              <AppLogo appId={app.id} name={app.name} size={28} />
            </span>
            {renaming ? (
              <NameField
                value={draftName}
                max={NAME_MAX}
                label="Application name"
                errorId={nameErr ? 'bapp-name-err' : undefined}
                invalid={!!nameErr}
                onChange={(v) => {
                  setDraftName(v)
                  setNameErr(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitName()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelName()
                  }
                }}
                onLeave={() => {
                  if (!nameProblem) keepName()
                }}
                onClose={() => {
                  if (nameProblem) setNameErr(nameProblem)
                  else setRenaming(false)
                }}
                onApply={commitName}
                onCancel={cancelName}
              />
            ) : (
              <>
                <h1 ref={heading} tabIndex={-1}>
                  {app.name}
                </h1>
                <span className="bz7__pencil" ref={renameSlot}>
                  <IconButton
                    icon={Pencil}
                    size="sm"
                    tone="ghost"
                    label="Rename"
                    onClick={() => {
                      setDraftName(app.name)
                      setNameErr(null)
                      setRenaming(true)
                    }}
                  />
                </span>
              </>
            )}
            <Badge tone="neutral">{app.type}</Badge>
            <ChangeState unsaved={dirty} />
          </div>
          {nameErr && (
            <p className="bz7__fielderr" id="bapp-name-err" role="alert">
              {nameErr}
            </p>
          )}
        </div>
        {/* No status pill and no action trail: an application is not switched
            on or off, and Delete is on the list's row menu. */}
        <DocsLink />
      </header>

      <Tabs
        className="bx-tabs--line bapp__tabs"
        name="Application sections"
        panelId="bapp-panel"
        value={tab}
        onChange={(t) => show(t)}
        options={TABS}
      />

      <div id="bapp-panel" role="tabpanel" aria-label={label} className="bapp__panel">
        {tab === 'basic' && <BasicTab app={app} draft={draft} onDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))} />}
        {tab === 'policies' && <PoliciesTab app={app} flash={flash} confirmLeave={confirmLeave} saving={dirty} />}
        {tab === 'users' && <AppUsersTab appId={app.id} group={group} />}
        {tab === 'groups' && <AppGroupsTab appId={app.id} onShowUsers={(g) => show('users', g ? { group: g } : undefined)} />}
      </div>

      <SaveBar open={dirty} changes={changes} review={review} saveLabel="Save changes" onSave={saveBasic} />
    </div>
  )
}

/* --- Policies ------------------------------------------------------------------- */

function PoliciesTab({
  app,
  flash,
  confirmLeave,
  saving,
}: {
  app: App
  flash?: string
  confirmLeave: (run: () => void) => void
  /** The Basic draft is unsaved, so the save bar holds this view's one orange button. */
  saving: boolean
}) {
  const store = useBrand()
  const { policies, users, groups } = store
  const standing = useMemo(() => appStanding(app.id, policies, users), [app.id, policies, users])
  const { rows, fallback, everyoneElse } = standing
  /* App access only: the drawer shows the rest, greyed with the reason, but a
     button that opens on nothing to pick is a dead end. */
  const attachable = attachableTo(app.id, policies).filter((p) => p.type === 'App Access')

  const [flashed, setFlashed] = useState<string | null>(flash ?? null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Policy | null>(null)
  const [deleting, setDeleting] = useState<{ policy: Policy; open: boolean } | null>(null)
  const [details, setDetails] = useState<{ id: string; open: boolean } | null>(null)
  const statusChange = useStatusChange()
  const appsGuard = useAppsGuard()
  const list = useRef<HTMLOListElement | null>(null)

  const nameButton = (id: string) => list.current?.querySelector<HTMLElement>(`[data-policy-id="${CSS.escape(id)}"]`)
  /* After the drawer has handed focus back to what opened it. */
  const focusRow = (id: string) => window.setTimeout(() => nameButton(id)?.focus(), 0)

  /* Back from the board: the row it was about takes focus. Its celebration,
     when it has one, is the page's (AppPage). */
  useEffect(() => {
    if (flash) nameButton(flash)?.focus()
    // Arrival only: a later flash is an attach, which focuses its own row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasDecider = () => rows.some((r) => r.state === 'decides')

  /* New policy: an Untitled draft on this application, straight into the
     board with no dialog and no toast (Policies.tsx `startDraft`). Inside the
     leave guard, so Keep editing over an unsaved Basic leaves no draft behind. */
  const newPolicy = () =>
    confirmLeave(() => {
      const had = hasDecider()
      const id = store.addPolicy(blankPolicy(freeName('Untitled policy', store.policies.map((p) => p.name)), [app.id]))
      sendToBoard(sentToBoard, id, had)
      store.go({ name: 'board', policyId: id, from: { appId: app.id } })
    })

  /* The one place a policy goes onto this application, and the one place one
     comes off it. A policy that decides sign-ins runs Before saving:
     applications first (board/apps-guard.ts), as ticking the application in
     the builder does: a clean result writes in the same press, and the page
     opens only when a Must pass or Protected sign-in newly fails, or somebody
     is newly let in. A draft, or a policy that is off or monitoring, decides
     nobody's sign-in either way, so it is written at once. */
  const putOn = (policyId: string): boolean => {
    const live = store.policyById(policyId)
    if (!live || live.isSystem) return false
    const after = store.policies.map((p) => (p.id === live.id ? attachTo(live, app.id, store.apps) : p))
    const decidesNow = appStanding(app.id, after, store.users).rows.some((r) => r.policy.id === live.id && r.state === 'decides')
    const had = hasDecider()
    if (!addToApp(store, policyId, app, store.apps)) return false
    /* Before the toast, which then stays quiet under it (sound.ts). */
    playCue(!had && decidesNow ? 'celebrate' : 'attach')
    setFlashed(policyId)
    focusRow(policyId)
    return true
  }
  /* False when the policy no longer exists; 'checking' while the checks run.
     The add drawer waits for them, under the page when one opens — so Keep
     editing goes back to the pick — and is closed from here once the add is made. */
  const attach = (policyId: string): boolean | 'checking' => {
    const live = store.policyById(policyId)
    if (!live || live.isSystem) return false
    if (!appsGuard.guards(live)) return putOn(policyId)
    appsGuard.check(live, attachTo(live, app.id, store.apps).appIds, () => {
      if (putOn(policyId)) setAdding(false)
    })
    return 'checking'
  }
  const takeOff = (policyId: string) => {
    removeFromApp(store, policyId, app)
  }
  const detach = (policyId: string) => {
    const live = store.policyById(policyId)
    if (!live || live.isSystem) return
    if (!appsGuard.guards(live)) return takeOff(policyId)
    appsGuard.check(live, detachFrom(live, app.id).appIds, () => takeOff(policyId))
  }
  /* The page names its write by the applications it read: with this one, the
     add; without it, the removal. */
  const guardPage = appsGuard.page({
    primaryLabel: appsGuard.held?.appIds.includes(app.id) ? `Add to ${app.name}` : `Remove from ${app.name}`,
    onConfirm: (ids, p) => {
      if (!ids.includes(app.id)) return takeOff(p.id)
      if (putOn(p.id)) setAdding(false)
    },
  })

  /* Add a copy: a draft with this application alone, opened in the board. */
  const addCopy = (policyId: string): boolean => {
    if (!store.policyById(policyId)) return false
    confirmLeave(() => {
      const had = hasDecider()
      const id = store.duplicatePolicy(policyId, { appIds: [app.id] })
      if (!id) return
      sendToBoard(sentToBoard, id, had)
      store.showToast(`${store.policyById(id)?.name ?? 'Copy'} created as a draft`)
      store.go({ name: 'board', policyId: id, from: { appId: app.id } })
    })
    return true
  }

  /* A policy that decides for nobody here comes off at once, with Undo. One
     that decides for somebody asks first, and says who moves where. */
  const remove = (row: StandRow) => {
    if (row.state === 'decides') setRemoving(row.policy)
    else detach(row.policy.id)
  }

  /* The abandoned Untitled draft is the one policy deletable from here: a
     draft on this application alone. A live delete stays on Policies. */
  const deletable = (p: Policy) => p.status === 'draft' && p.appIds.length === 1 && p.appIds[0] === app.id

  const menuFor = (p: Policy): MenuItem[] => [
    { id: 'open', label: 'Open policy', icon: PanelRight },
    { id: 'edit', label: 'Edit policy', icon: Pencil },
    /* None for a draft: it goes live from the builder, with its rules in view. */
    ...statusOptions(p, { monitor: store.features.monitorMode }).map((s) => ({ id: s.target, label: s.label, icon: STATUS_ICON[s.target] })),
    { id: 'remove', label: `Remove from ${app.name}`, icon: Unlink, danger: true, divide: true },
    ...(deletable(p) ? [{ id: 'delete', label: 'Delete policy', icon: Trash2, danger: true }] : []),
  ]

  const onMenu = (row: StandRow) => (id: string) => {
    const p = row.policy
    if (id === 'open') setDetails({ id: p.id, open: true })
    else if (id === 'edit') store.go({ name: 'board', policyId: p.id, from: { appId: app.id } })
    else if (id === 'active' || id === 'monitor' || id === 'inactive') statusChange.request(p, id)
    else if (id === 'remove') remove(row)
    else if (id === 'delete') setDeleting({ policy: p, open: true })
  }

  const addExisting =
    attachable.length > 0 ? (
      <Button variant="secondary" icon={ListPlus} onClick={() => setAdding(true)}>
        Add existing policy
      </Button>
    ) : null
  const newButton = (
    <Button variant={saving ? 'secondary' : 'brand'} icon={Plus} onClick={newPolicy}>
      New policy
    </Button>
  )

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldPlus}
          title="No policies on this application"
          action={
            <>
              {newButton}
              {addExisting}
            </>
          }
        />
      ) : (
        <>
          <PageBar
            right={
              <>
                {addExisting}
                {newButton}
              </>
            }
          />
          <ol className="bapr__stack" ref={list}>
            {rows.map((row) => (
              <PolicyRow
                key={row.policy.id}
                row={row}
                tip={rowTip(row, groups, users)}
                who={whoLabel(row.policy, groups, users)}
                fresh={flashed === row.policy.id}
                onOpen={() => setDetails({ id: row.policy.id, open: true })}
                menu={menuFor(row.policy)}
                onSelect={onMenu(row)}
              />
            ))}
          </ol>
        </>
      )}

      {/* Always, empty list or not: it is what decides when nothing above does. */}
      {fallback && <FallbackRow fallback={fallback} everyoneElse={everyoneElse} />}

      <AddExistingPolicy
        open={adding}
        app={app}
        checking={appsGuard.checking}
        onClose={() => setAdding(false)}
        onAdd={attach}
        onCopy={addCopy}
      />
      <RemoveDialog
        policy={removing}
        app={app}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) detach(removing.id)
          setRemoving(null)
        }}
      />
      {deleting && (
        <ConfirmDelete
          open={deleting.open}
          name={deleting.policy.name}
          noun="policy"
          detail={deleteDetail(deleting.policy, store.policies, store.apps, store.users, store.groups) ?? undefined}
          onCancel={() => setDeleting({ ...deleting, open: false })}
          onConfirm={() => {
            setDeleting({ ...deleting, open: false })
            store.deletePolicy(deleting.policy.id)
            store.showToast(`${deleting.policy.name} deleted`)
          }}
        />
      )}
      {statusChange.dialog}
      {/* Portalled, so it opens over the add drawer as well as over the page. */}
      {guardPage && createPortal(<GuardDrawer {...guardPage} />, portalRoot())}
      {details && store.policies.some((p) => p.id === details.id) && (
        <PolicyDetailsDrawer
          open={details.open}
          policyId={details.id}
          onClose={() => setDetails({ ...details, open: false })}
          boardFrom={{ appId: app.id }}
        />
      )}
    </>
  )
}

/* --- Basic ---------------------------------------------------------------------- */

/* The live console's Basic, less the name (renamed in the head): Description,
   and the App secret where the application has one. A SAML application signs
   with a certificate, so it has no secret, and a question with one answer is
   not asked — nor is its note shown beside a form that does not hold it.

   Both fields are the method forms' (`.bmc__field`): the App secret is the
   Display token form's secret field, and a Description in another field
   grammar would have put two label styles in one form. */
function BasicTab({ app, draft, onDraft }: { app: App; draft: BasicDraft; onDraft: (patch: Partial<BasicDraft>) => void }) {
  const uid = useId()
  const [reveal, setReveal] = useState(false)
  const n = draft.description.length
  const hasSecret = app.protocol === 'OIDC'

  /* 32 hex characters, into the draft: the save footer's review is the confirm. */
  const regenerate = () => {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    onDraft({ secret: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') })
  }

  return (
    <div className="bz7__cols">
      <div className="bz7__work">
        <div className="bmc__fields">
          <div className="bmc__field">
            <div className="bmc__label bdt__labelrow">
              <label htmlFor={`${uid}-description`}>Description</label>
              {n > DESCRIPTION_COUNT_FROM && <span className="bdt__count">{DESCRIPTION_MAX - n} left</span>}
            </div>
            <div className="bmc__control">
              <textarea
                id={`${uid}-description`}
                rows={4}
                maxLength={DESCRIPTION_MAX}
                value={draft.description}
                onChange={(e) => onDraft({ description: e.target.value })}
              />
            </div>
          </div>

          {hasSecret && (
            <div className="bmc__field">
              <div className="bmc__label">
                <label htmlFor={`${uid}-secret`}>
                  App secret
                  <b aria-hidden>*</b>
                </label>
              </div>
              <div className="bmc__control bapp__secret">
                <span className="bmc__secret">
                  <input
                    id={`${uid}-secret`}
                    type={reveal ? 'text' : 'password'}
                    value={draft.secret}
                    readOnly
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="button" onClick={() => setReveal((v) => !v)} aria-label={reveal ? 'Hide app secret' : 'Show app secret'}>
                    {reveal ? <EyeOff size={14} strokeWidth={1.9} /> : <Eye size={14} strokeWidth={1.9} />}
                  </button>
                </span>
                <CopyText text={draft.secret} label="Copy secret" className="bx-btn bx-btn--ghost bx-btn--sm" />
                <Button variant="link" onClick={regenerate}>
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {hasSecret && <SidePanel note={APP_BASIC_NOTE} />}
    </div>
  )
}
