import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  AppWindow,
  ArrowLeft,
  Check,
  FileCode2,
  KeyRound,
  ListPlus,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  ShieldPlus,
  Sliders,
  Tags,
  UserRound,
  Users,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'

import { Badge, Button, IconButton, NameField, SaveBar, Tabs, type ReviewRow } from '../kit'
import { AppNoPolicyView, AppPolicyView } from './app-policy-view'
import type { StatusMenuId } from './app-policy-model'
import { EmptyState } from '../empty'
import { DocsLink } from '../Shell'
import { AppLogo } from '../logos/AppLogo'
import { ChangeState, useLeaveGuard } from '../leave-guard'
import { useBrand, type AppTab } from '../store'
import { blankPolicy, nameTaken, type App, type Policy } from '../data'
import { APP_NAME_MAX, basicIssues, cleanSetup, randomHex, type AppSetup } from '../app-setup'
import { freeName } from '../policy-name'
import { playCue } from '../sound'
import { AddExistingPolicy } from './AddExistingPolicy'
import { AppPostSignInTab } from './AppPostSignIn'
import { FallbackRow, RemoveDialog } from './AppProtection'
import { appTypeOf, buildApp, catalogEntry, newAppId, newAppName, startingSetup, type CatalogApp } from './app-catalog'
import {
  TAB_LABEL,
  appTabs,
  draftChanges,
  draftOf,
  firstIssue,
  isSetupTab,
  landingTab,
  newDraftChanged,
  shownIssues,
  type AppDraft,
  type NewDraft,
} from './app-page-model'
import { AppGroupsTab, AppUsersTab } from './app-people-tabs'
import { REMOVE_RUNS_CHECKS, REPLACE_MAKES_DRAFT, attachTo, attachableTo, deleteDetail, detachFrom } from './app-policies'
import { SetupTabBody, type SetupPatch } from './app-setup-forms'
import { appStanding, type StandRow } from './app-standing'
import { addToApp, removeFromApp, replaceOnApp } from './applications-model'
import { useAppsGuard } from './board/apps-guard'
import { SENT_TO_BOARD, arriveFromBoard, sendToBoard } from './board-return'
import { ConfirmDelete } from './confirm-delete'
import { GuardDrawer } from './guard-page'
import { WidthSwitch } from './page-bar'
import { SHOWCASE } from '../showcase'
import { portalRoot } from './status-options'
import { useStatusChange } from './use-status-change'
import { footerEdge } from '../footer-edge'

/* -----------------------------------------------------------------------------
   One application's own page: the live console's app page — Basic, Advanced,
   Sign-in options, Attributes, Policies, and Metadata or Endpoints — with the
   two tabs its Show Associated Entities page holds (Users, Groups) before the
   last (spec docs/specs/APP-CREATE-AND-ACCESS.md §4).

   The head is a library detail page's (a zone's, a device profile's): the way
   back, the logo and the name with its rename pencil, the app type as a pill.
   A rename saves at once. Basic, Advanced, Sign-in options and Attributes edit
   one draft through the save footer, which stays up on every tab — a tab is a
   place on this page, not a way off it — and is held while Basic has a
   problem, said under the field it is about.

   Policies leads, because it is where policies get attached. An application
   has one sign-in policy (14 Oct 2026), and the tab is that policy read in the
   page (app-policy-view.tsx, spec APP-POLICY-TAB.md): its chain of rules down
   to the Global Default behind it, the application's sign-ins and the
   policy's changes. With none, the Global Default's own rules. Users and
   Groups are read from the same model (app-people-tabs.tsx).

   `NewApplicationPage` is the same page for an application not stored yet,
   picked from the catalogue (§3.2): one form for create and edit, not a
   wizard beside the page it ends on. Its tabs, its draft's changes and what
   Basic still needs are app-page-model.ts's; its fields are app-setup-forms.tsx's.
   -------------------------------------------------------------------------- */

const TAB_ICON: Record<AppTab, LucideIcon> = {
  basic: Sliders,
  advanced: Settings2,
  'sign-in': KeyRound,
  attributes: Tags,
  policies: ShieldCheck,
  /* A pulse: what goes on in the session after the sign-in, not the gate. */
  'post-sign-in': Activity,
  users: UserRound,
  groups: Users,
  metadata: FileCode2,
  endpoints: Waypoints,
}

const tabOptions = (tabs: readonly AppTab[]) => tabs.map((t) => ({ value: t, label: TAB_LABEL[t], icon: TAB_ICON[t] }))

/* Policies sent to the board from an application — New policy, Add a copy,
   and the unsaved application's New policy — go through `SENT_TO_BOARD`
   (board-return.ts), with whether the application had a deciding policy when
   they left. Spent by the next arrival at any application's page, and read
   only when that arrival is the board's way back with the policy flashed: the
   first policy that decides on an application gets the celebration rather
   than silence, whichever door sent it. */

export function ApplicationPage({
  appId,
  tab,
  group,
  policy,
  flash,
  from,
  open,
}: {
  appId: string
  tab?: AppTab
  /** The Users tab's group filter, from a Groups-tab count. */
  group?: string
  /** The Users tab's policy filter, from the Policies tab's "{n} people". */
  policy?: string
  /** The policy the board just came back from: lit and focused in the list. */
  flash?: string
  /** The group page this was opened from, which the way back names. */
  from?: { groupId: string }
  /** One-shot: a drawer to open on Policies on arrival (the unsaved application's Add existing policy). */
  open?: 'add-existing'
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
  return <AppPage app={app} routeTab={tab} group={group} policy={policy} flash={flash} from={from} open={open} />
}

function AppPage({
  app,
  routeTab,
  group,
  policy,
  flash,
  from,
  open,
}: {
  app: App
  routeTab?: AppTab
  group?: string
  policy?: string
  flash?: string
  from?: { groupId: string }
  open?: 'add-existing'
}) {
  const store = useBrand()
  const tabs = appTabs(app.protocol, 'saved')

  /* The route owns the tab (SignInTests.tsx): a link can land on one, and a
     new tab from outside moves the page that is already open. A tab this
     application does not have — Endpoints on a SAML one — lands on Policies. */
  const [tab, setTab] = useState<AppTab>(landingTab(routeTab, tabs))
  const [seen, setSeen] = useState(routeTab)
  if (seen !== routeTab) {
    setSeen(routeTab)
    if (routeTab) setTab(landingTab(routeTab, tabs))
  }

  /* The route's drawer, opened once: the unsaved application's Add existing
     policy saved the application and came here to carry on. Spent when
     Policies opens it, so a tab switch and back does not open it again. */
  const [pendingOpen, setPendingOpen] = useState(open)
  const [seenOpen, setSeenOpen] = useState(open)
  if (seenOpen !== open) {
    setSeenOpen(open)
    setPendingOpen(open)
  }

  /* --- The setup's draft, held here so it outlives a tab switch -------------------

     Measured against what is stored, through `setupOf`, so a seed application
     — which has no setup of its own — opens clean. */
  const stored = draftOf(app)
  const [draft, setDraft] = useState<AppDraft>(stored)
  const changes = draftChanges(stored, draft)
  const dirty = changes.length > 0
  /* The name is not Basic's here — it is renamed in the head, which refuses a
     taken one — so only the setup's own problems hold the save. */
  const issues = basicIssues(draft.setup, app.name, [], draft.secret)
  const problem = firstIssue(issues)

  const patchSetup: SetupPatch = (p) => setDraft((d) => ({ ...d, setup: { ...d.setup, ...p } as AppSetup }))
  const patchDraft = (p: Partial<Pick<AppDraft, 'description' | 'secret'>>) => setDraft((d) => ({ ...d, ...p }))

  /* Blank rows dropped and text trimmed (`cleanSetup`), and the draft set to
     what was stored, so the page is clean again with the same values. */
  const saveSetup = (): boolean => {
    if (problem) return false
    const live = store.apps.find((a) => a.id === app.id) ?? app
    const description = draft.description.trim()
    const setup = cleanSetup(draft.setup)
    store.saveApp({ ...live, description: description || undefined, secret: draft.secret || undefined, setup })
    setDraft({ description, secret: draft.secret, setup })
    store.showToast(`${live.name} saved`)
    return true
  }

  /* A tab press is a move inside this page, and `go` asks the leave guard
     before it moves — synchronously, so the guard is told it is a tab for
     exactly that call and the draft goes along without a dialog. */
  const tabbing = useRef(false)
  const confirmLeave = useLeaveGuard({
    get dirty() {
      return dirty && !tabbing.current
    },
    save: saveSetup,
    saveLabel: 'Save changes',
    blocked: problem,
  })

  const show = (t: AppTab, extra?: { group?: string; policy?: string }) => {
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
    if (arriveFromBoard(SENT_TO_BOARD, flash, decides)) playCue('celebrate')
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

  /* --- What the save footer reviews ------------------------------------------------

     One row per changed field, filed under the tab it was changed on. The
     secret's value is never printed, here or anywhere: its row says that it
     changes (`draftChanges`). */
  const review: ReviewRow[] = changes.map((c) => ({ ...c, kind: 'changed' as const }))

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
                max={APP_NAME_MAX}
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
        <div className="bpage__preview">
          {!SHOWCASE && <WidthSwitch />}
          <DocsLink />
        </div>
      </header>

      {/* In a strip of its own, which scrolls sideways when eight tabs are
          wider than the page (900 and 720): the page itself never does. */}
      <div className="bapp__tabbar">
        <Tabs
          className="bx-tabs--line"
          name="Application sections"
          panelId="bapp-panel"
          value={tab}
          onChange={(t) => show(t)}
          options={tabOptions(tabs)}
        />
      </div>

      <div id="bapp-panel" role="tabpanel" aria-label={TAB_LABEL[tab]} className="bapp__panel">
        {(isSetupTab(tab) || tab === 'metadata' || tab === 'endpoints') && (
          <SetupTabBody tab={tab} draft={draft} onPatch={patchSetup} onDraft={patchDraft} issues={shownIssues(issues, draft, true)} appId={app.id} />
        )}
        {tab === 'policies' && (
          <PoliciesTab
            app={app}
            flash={flash}
            confirmLeave={confirmLeave}
            saving={dirty}
            openAdd={pendingOpen === 'add-existing'}
            onOpened={() => setPendingOpen(undefined)}
            onTab={show}
          />
        )}
        {/* `saving`: while the footer is up it holds the view's one orange
            button, so any primary of the tab's own turns secondary. */}
        {tab === 'post-sign-in' && <AppPostSignInTab app={app} saving={dirty} confirmLeave={confirmLeave} flash={flash} />}
        {tab === 'users' && <AppUsersTab appId={app.id} group={group} policy={policy} saving={dirty} />}
        {tab === 'groups' && (
          <AppGroupsTab appId={app.id} saving={dirty} onShowUsers={(g) => show('users', g ? { group: g } : undefined)} />
        )}
      </div>

      {/* Held while Basic has a problem: the reason is the footer's words, and
          the field it is about says it too. */}
      <SaveBar
        open={dirty}
        changes={changes.map((c) => c.label)}
        review={review}
        saveLabel="Save changes"
        onSave={saveSetup}
        blocked={!!problem}
        blockedReason={problem ?? undefined}
      />
    </div>
  )
}

/* --- Policies ------------------------------------------------------------------- */

/* The tab in the setup tabs' own column, with the right half left empty (owner, 22 Oct 2026, holding it against
   the Attributes tab: "I think we can use the same width as we have in other tab like advance or attributes for this,
   no need use the full page, make the right side empty as of now, it's okay like other page").

   This REVERSES "app page full width" of 19 Oct (docs/memory/app-policy-tab-canvas-19-oct.md) — do not put it back
   from that note. One child inside `bz7__cols` is exactly what SetupTabBody draws for Advanced and Attributes
   (app-setup-forms.tsx), so the tabs line up down the page; the empty half is the point, and nothing goes in it.

   ONLY the canvas gets the column, and applications.css decides that from what is actually drawn rather than this
   file guessing at it: a layout of two panels side by side — the application with no policy of its own, or the tab
   with FOCUS off — is a quarter of the page in each panel at this width, so the table loses its columns and the rule
   cards come out 100px wide. Those keep the page until they are redrawn for a column, which is their own piece of
   work. The wrapper is always here; the sheet widens it back where the canvas is absent.

   `bapp__polcols` is what the sheet aims at, and it has to be here: the setup tabs build their own `bz7__cols` straight
   inside #bapp-panel (app-setup-forms.tsx), so a rule written at that level reaches THEM too. One was, for an hour on
   22 Oct, and it put Basic, Advanced and Attributes back to the full page the moment Policies took a column — the
   exact opposite of what was asked. Scope anything about this column to the class, never to the position. */
function WorkColumn({ children }: { children: ReactNode }) {
  return (
    <div className="bz7__cols bapp__polcols">
      <div className="bz7__work">{children}</div>
    </div>
  )
}

function PoliciesTab({
  app,
  flash,
  confirmLeave,
  saving,
  openAdd = false,
  onOpened,
  onTab,
}: {
  app: App
  flash?: string
  confirmLeave: (run: () => void) => void
  /** The page's draft is unsaved, so the save bar holds this view's one orange button. */
  saving: boolean
  /** Open Add existing policy on arrival: the route asked for it (`open: 'add-existing'`). */
  openAdd?: boolean
  /** Told once it is open, so the page spends the route's request. */
  onOpened?: () => void
  /** Another tab of this page — Users filtered to a group or to this policy, Post sign-in — as a place on it, not a way off it. */
  onTab: (tab: AppTab, extra?: { group?: string; policy?: string }) => void
}) {
  const store = useBrand()
  const { policies, users } = store
  const standing = useMemo(() => appStanding(app.id, policies, users), [app.id, policies, users])
  const { rows, fallback, everyoneElse } = standing
  /* One application, one policy (14 Oct 2026): the one that decides here, else
     the first on it. Any other is data the ruling bars, said on the view's
     state line with the way to clean it up. */
  /* A draft never leads. `duplicatePolicy` prepends its copy to the tenant's list (store.tsx), so once a
     replace parks a draft here, `rows[0]` is that draft whenever nothing decides — an inactive or monitoring
     policy would drop into `others` and be read as the stray. The decider leads; failing that, the policy
     that could be one. */
  const shown = rows.find((r) => r.state === 'decides') ?? rows.find((r) => r.policy.status !== 'draft') ?? rows[0]
  const others = rows.filter((r) => r !== shown)
  /* App access only: the drawer shows the rest, greyed with the reason, but a
     button that opens on nothing to pick is a dead end. */
  const attachable = attachableTo(app.id, policies).filter((p) => p.type === 'App Access')

  const [adding, setAdding] = useState(false)
  /* Replace policy: the one the application has now, which the pick takes the place of. */
  const [replacing, setReplacing] = useState<Policy | null>(null)
  const [removing, setRemoving] = useState<Policy | null>(null)
  const [deleting, setDeleting] = useState<{ policy: Policy; open: boolean } | null>(null)
  const statusChange = useStatusChange()
  const appsGuard = useAppsGuard()
  const view = useRef<HTMLDivElement | null>(null)

  /* The policy's heading (app-policy-view.tsx), which carries its id. */
  const nameButton = (id: string) => view.current?.querySelector<HTMLElement>(`[data-policy-id="${CSS.escape(id)}"]`)
  /* After the drawer has handed focus back to what opened it. */
  const focusRow = (id: string) => window.setTimeout(() => nameButton(id)?.focus(), 0)
  /* A policy taken off or deleted takes its status menu with it — the trigger a confirm hands focus back to — so the
     view's heading takes it instead: the next policy's name, or "No policy on {app}". */
  const focusHead = () => window.setTimeout(() => view.current?.querySelector<HTMLElement>('[data-tab-head]')?.focus(), 0)

  /* Back from the board: the policy it was about takes focus. Its celebration,
     when it has one, is the page's (AppPage). */
  useEffect(() => {
    if (flash) nameButton(flash)?.focus()
    // Arrival only: a later flash is an attach, which focuses its own row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* The unsaved application's Add existing policy, carried on here once the
     application is stored: the drawer opens over the list it will add to, and
     the add then runs Before saving: applications as every attach does. */
  useEffect(() => {
    if (!openAdd) return
    setAdding(true)
    onOpened?.()
  }, [openAdd, onOpened])

  const hasDecider = () => rows.some((r) => r.state === 'decides')

  /* New policy: an Untitled draft on this application, straight into the
     board with no dialog and no toast (Policies.tsx `startDraft`). Inside the
     leave guard, so Keep editing over an unsaved Basic leaves no draft behind. */
  const newPolicy = () =>
    confirmLeave(() => {
      const had = hasDecider()
      const id = store.addPolicy(blankPolicy(freeName('Untitled policy', store.policies.map((p) => p.name)), [app.id]))
      sendToBoard(SENT_TO_BOARD, id, had)
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
    /* Replace policy: the one it had comes off as the new one goes on, so it never holds two — one write, one toast,
       one Undo that puts both back (applications-model.ts `replaceOnApp`). */
    const wrote = replacing ? replaceOnApp(store, replacing.id, policyId, app, store.apps) : addToApp(store, policyId, app, store.apps)
    if (!wrote) return false
    if (replacing) setReplacing(null)
    /* Before the toast, which then stays quiet under it (sound.ts). */
    playCue(!had && decidesNow ? 'celebrate' : 'attach')
    focusRow(policyId)
    return true
  }
  /* Replace policy, the draft-copy way (app-policies.ts `REPLACE_MAKES_DRAFT`): the pick is copied onto this
     application alone, as a draft. The application keeps the policy it has and keeps being decided by it, so
     not one sign-in moves — the copy is the admin's to read, change and turn on when they are ready.

     The copy is independent of what it was copied from: `duplicatePolicy` gives it its own id, its own rule
     ids and its own name, so editing it never reaches the applications the original is on. That is the whole
     point of copying rather than attaching the shared policy, and it is why this press needs no checks.

     Undo deletes the copy, and only while it is untouched — the same refusal `undoTo` makes
     (applications-model.ts): an Undo pressed after the admin has opened and edited the draft would throw their
     work away. */
  const draftCopy = (policyId: string): boolean => {
    const from = store.policyById(policyId)
    if (!from || from.isSystem) return false
    const id = store.duplicatePolicy(policyId, { appIds: [app.id] })
    if (!id) return false
    const made = store.policyById(id)
    playCue('attach')
    store.showToast(`${made?.name ?? 'Copy'} added to ${app.name} as a draft. Nothing changes until you turn it on.`, {
      label: 'Undo',
      run: () => {
        if (!made || store.policyById(id) !== made) {
          store.showToast(`Can't undo. ${made?.name ?? 'The draft'} has changed since.`)
          return
        }
        store.deletePolicy(id)
      },
    })
    return true
  }

  /* False when the policy no longer exists; 'checking' while the checks run.
     The add drawer waits for them, under the page when one opens — so Keep
     editing goes back to the pick — and is closed from here once the add is made. */
  /* Replace policy: the old one comes off in the same press, so the checks
     read the tenant as it will actually be, with both changes at once
     (guard.ts `alsoAfter`). Without it a replace is checked as a plain add —
     both policies on the application at once, which is the very state one
     application, one policy (14 Oct 2026) exists to prevent, and the reading
     that makes the policy going on look shadowed when it is about to decide
     alone. Re-read by id: the copy held in `replacing` is a render old. */
  const alsoOff = (): readonly Policy[] | undefined => {
    if (!replacing) return undefined
    const live = store.policyById(replacing.id)
    return live && !live.isSystem ? [detachFrom(live, app.id)] : undefined
  }
  const attach = (policyId: string): boolean | 'checking' => {
    const live = store.policyById(policyId)
    if (!live || live.isSystem) return false
    /* A replace makes a draft copy and writes nothing live, so there is nothing to check first. The guard below
       still runs for a plain add, which does put a live policy on this application. */
    if (replacing && REPLACE_MAKES_DRAFT) return draftCopy(policyId)
    if (!appsGuard.guards(live)) return putOn(policyId)
    appsGuard.check(
      live,
      attachTo(live, app.id, store.apps).appIds,
      () => {
        if (putOn(policyId)) setAdding(false)
      },
      undefined,
      alsoOff(),
    )
    return 'checking'
  }
  const takeOff = (policyId: string) => {
    if (removeFromApp(store, policyId, app)) focusHead()
  }
  /* The confirm is the whole of it now (app-policies.ts `REMOVE_RUNS_CHECKS`): it has already named what
     becomes of the policy and who moves to which policy, so the press writes. */
  const detach = (policyId: string) => {
    const live = store.policyById(policyId)
    if (!live || live.isSystem) return
    if (!REMOVE_RUNS_CHECKS || !appsGuard.guards(live)) return takeOff(policyId)
    appsGuard.check(live, detachFrom(live, app.id).appIds, () => takeOff(policyId))
  }
  /* The page names its write by the applications it read: with this one, the
     add — or the replace, when one is going off in the same press; without
     it, the removal. */
  const guardPage = appsGuard.page({
    primaryLabel: !appsGuard.held?.appIds.includes(app.id)
      ? `Remove from ${app.name}`
      : replacing
        ? `Replace on ${app.name}`
        : `Add to ${app.name}`,
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
      sendToBoard(SENT_TO_BOARD, id, had)
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

  /* The status pill's menu (app-policy-model.ts `statusMenu`) and the state
     line's links: a switch asks first where it should and offers Undo
     (use-status-change.tsx); Remove asks only when the policy decides here;
     Delete draft is the one delete on this page. */
  const onMenu = (row: StandRow) => (id: StatusMenuId) => {
    const p = row.policy
    if (id === 'active' || id === 'monitor' || id === 'inactive') statusChange.request(p, id)
    else if (id === 'view-monitoring') statusChange.viewMonitoring(p.id)
    else if (id === 'remove') remove(row)
    else if (id === 'delete') setDeleting({ policy: p, open: true })
  }

  return (
    <>
      {/* The setup tabs' own column, not the page's full width (owner, 22 Oct 2026, with the Attributes tab beside
          it: "I think we can use the same width as we have in other tab like advance or attributes for this, no need
          use the full page, make the right side empty as of now, it's okay like other page").

          This REVERSES "app page full width" of 19 Oct (docs/memory/app-policy-tab-canvas-19-oct.md) — do not put it
          back from that note. One child inside `bz7__cols` is exactly what SetupTabBody draws for Advanced and
          Attributes (app-setup-forms.tsx), so the tabs line up down the page; the right half stays empty on purpose,
          and nothing is to be moved into it. */}
      <WorkColumn>
        <div ref={view} className="apol__wrap">
          {shown ? (
            /* One application, one policy (owner, 14 Oct 2026): the tab IS the policy, read in the page. Who it
               covers is changed in the policy; two buttons here, the rest on the status pill. */
            <AppPolicyView
              app={app}
              row={shown}
              others={others}
              globalDefault={fallback}
              everyoneElse={everyoneElse}
              saving={saving}
              flash={flash}
              deletable={deletable(shown.policy)}
              onReplace={() => {
                setReplacing(shown.policy)
                setAdding(true)
              }}
              onDuplicate={() => addCopy(shown.policy.id)}
              onMenu={onMenu(shown)}
              onRemoveOther={remove}
              onTab={onTab}
            />
          ) : (
            /* Nothing of its own: the Global Default's rules are what it gets, and the two ways to give it a policy. */
            <AppNoPolicyView
              app={app}
              globalDefault={fallback}
              saving={saving}
              onNew={newPolicy}
              onAdd={attachable.length > 0 ? () => setAdding(true) : undefined}
              onTab={onTab}
            />
          )}
        </div>
      </WorkColumn>

      <AddExistingPolicy
        open={adding}
        app={app}
        checking={appsGuard.checking}
        onClose={() => {
          setAdding(false)
          setReplacing(null)
        }}
        onAdd={attach}
        onCopy={addCopy}
        replacing={replacing}
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
          requireTyped
          detail={deleteDetail(deleting.policy, store.policies, store.apps, store.users, store.groups) ?? undefined}
          onCancel={() => setDeleting({ ...deleting, open: false })}
          onConfirm={() => {
            setDeleting({ ...deleting, open: false })
            store.deletePolicy(deleting.policy.id)
            store.showToast(`${deleting.policy.name} deleted`)
            focusHead()
          }}
        />
      )}
      {statusChange.dialog}
      {/* Portalled, so it opens over the add drawer as well as over the page. */}
      {guardPage && createPortal(<GuardDrawer {...guardPage} />, portalRoot())}
    </>
  )
}

/* `BasicTab` stood here — Description and the App secret, the whole of Basic
   before an application had a setup. Basic is app-setup-forms.tsx's now,
   shared with the unsaved application below, and the secret is the Client
   secret, the live OAuth form's word. */

/* --- The application not stored yet ---------------------------------------------

   Add application's second step (spec §3.2): the application page for the
   catalogue entry just picked, before it exists. The same head, tabs and
   forms, less Users and Groups, with the live console's footer — Cancel ·
   Back · Next · Save — and Save orange on every tab.

   Two things the live console locks until Save are open here, which is the gap
   the spec set out to close: Policies, whose buttons save the application
   first and then carry on, and Metadata or Endpoints, readable for the id the
   application will be stored under.

   Nothing is ever disabled. Save with Basic incomplete opens Basic and says
   each problem under its field; Next is just the next tab. */
export function NewApplicationPage({ catalogId }: { catalogId: string }) {
  const store = useBrand()
  const entry = catalogEntry(catalogId)
  if (!entry) {
    return (
      <div className="bpage">
        <EmptyState
          icon={AppWindow}
          title="Application not found"
          action={
            <Button variant="brand" onClick={() => store.go({ name: 'application-new' })}>
              Choose application
            </Button>
          }
        />
      </div>
    )
  }
  return <NewAppPage entry={entry} />
}

function NewAppPage({ entry }: { entry: CatalogApp }) {
  const store = useBrand()
  const tabs = appTabs(entry.protocol, 'new')
  /* The live form opens on Basic: it is the one tab with questions to answer. */
  const [tab, setTab] = useState<AppTab>('basic')

  /* What the page starts with, kept to measure against: the catalogue name,
     freed when the tenant has it ("Salesforce 2"); the live form's defaults;
     on an OAuth application a client id and secret made for it. */
  const [start] = useState<NewDraft>(() => ({
    name: newAppName(entry, store.apps),
    description: '',
    secret: entry.protocol === 'OIDC' ? randomHex(32) : '',
    setup: startingSetup(entry),
  }))
  const [draft, setDraft] = useState<NewDraft>(start)
  /* Save was pressed with Basic incomplete: from then on a missing answer is
     said under its field, not only a wrong one. */
  const [tried, setTried] = useState(false)
  /* Set the moment the application is stored, before any move off the page,
     so the leave guard never stops the move the save itself makes. */
  const done = useRef(false)

  /* The id it will be stored under: Metadata names it before it exists. */
  const id = newAppId(entry, store.apps)
  const issues = basicIssues(
    draft.setup,
    draft.name,
    store.apps.map((a) => a.name),
    draft.secret,
  )
  const problem = firstIssue(issues)
  const changed = newDraftChanged(start, draft)

  const patchSetup: SetupPatch = (p) => setDraft((d) => ({ ...d, setup: { ...d.setup, ...p } as AppSetup }))
  const patchDraft = (p: Partial<Pick<AppDraft, 'description' | 'secret'>>) => setDraft((d) => ({ ...d, ...p }))

  /* After a refused Save: the first field with a problem takes the focus, on
     Basic, once Basic has drawn. */
  const panel = useRef<HTMLDivElement | null>(null)
  const focusProblem = useRef(false)
  useEffect(() => {
    if (!focusProblem.current) return
    focusProblem.current = false
    panel.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  })

  /* Stores the application and says so, or — with Basic incomplete — opens
     Basic with each problem under its field and stores nothing. Returns the
     stored id. Every door that saves comes through here: Save, the leave
     dialog's Save application, and Policies' two buttons. */
  const create = (): string | null => {
    if (problem) {
      setTried(true)
      /* Already on Basic, nothing re-renders, so the focus moves now. */
      if (tried && tab === 'basic') panel.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      else focusProblem.current = true
      setTab('basic')
      return null
    }
    const stored = store.addApp(buildApp(entry, newAppId(entry, store.apps), { ...draft, setup: cleanSetup(draft.setup) }))
    done.current = true
    store.showToast(`${draft.name.trim()} added.`, undefined, { tone: 'success' })
    return stored
  }

  /* Leaving with anything changed from the start asks first. Its Save is
     offered only while Basic is complete, and it stores the application
     without moving: the admin goes where they were going. */
  useLeaveGuard({
    get dirty() {
      return changed && !done.current
    },
    save: problem ? undefined : () => create() !== null,
    saveLabel: 'Save application',
  })

  /* Save lands on the stored application's Policies, where the Global Default
     row says what decides until a policy is added (the live OAuth Save goes to
     Policies too). */
  const save = () => {
    const appId = create()
    if (appId) store.go({ name: 'application', appId, tab: 'policies' })
  }

  /* New policy: the stored page's own — an Untitled draft for everyone,
     straight into the board (23 Sep 2026) — once the application exists. It
     had no deciding policy a moment ago, so a first one is celebrated on the
     board's way back. */
  const newPolicy = () => {
    const appId = create()
    if (!appId) return
    const pid = store.addPolicy(blankPolicy(freeName('Untitled policy', store.policies.map((p) => p.name)), [appId]))
    sendToBoard(SENT_TO_BOARD, pid, false)
    store.go({ name: 'board', policyId: pid, from: { appId } })
  }

  /* Add existing policy: the stored page's drawer, opened there, so the add
     runs Before saving: applications against an application that exists. */
  const addExisting = () => {
    const appId = create()
    if (appId) store.go({ name: 'application', appId, tab: 'policies', open: 'add-existing' })
  }

  const back = () => store.go({ name: 'application-new' })

  /* A tab is a place on this page, and the column starts at its top. */
  const move = (to: AppTab) => {
    setTab(to)
    document.querySelector('.bshell__main')?.scrollTo({ top: 0 })
  }

  /* The heading takes focus on arrival — the catalogue tile that opened the
     page has gone with the catalogue — and when a tab took the focus away. */
  const heading = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    const active = document.activeElement
    if (!active || active === document.body) heading.current?.focus({ preventScroll: true })
  }, [tab])

  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.bshell__main'))
  }, [])

  const at = tabs.indexOf(tab)
  /* The device profile wizard's footer (buttons only): leaving on the left,
     moving on the right, and Save the one orange button, on every tab. */
  const footer = (
    <div className="bx-savebar bdpw__foot" ref={footerEdge}>
      <Button variant="ghost" onClick={back}>
        Cancel
      </Button>
      <div className="bdpw__acts">
        {at > 0 && (
          <Button variant="ghost" onClick={() => move(tabs[at - 1])}>
            Back
          </Button>
        )}
        {at < tabs.length - 1 && (
          <Button variant="secondary" onClick={() => move(tabs[at + 1])}>
            Next
          </Button>
        )}
        <Button variant="brand" icon={Check} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  )

  return (
    <div className="bpage bapp">
      <button type="button" className="bz7__back" onClick={back}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        Choose application
      </button>

      <header className="bz7__pagehead">
        <div className="bz7__namewrap">
          <div className="bz7__titleline">
            <span className="bapp__logo" aria-hidden>
              <AppLogo appId={entry.logoId} name={entry.name} size={28} />
            </span>
            {/* The Display name as it is typed: the page is named what it will be called. */}
            <h1 ref={heading} tabIndex={-1}>
              {draft.name.trim() || entry.name}
            </h1>
            <Badge tone="neutral">{appTypeOf(entry.protocol)}</Badge>
          </div>
        </div>
        <div className="bpage__preview">
          {!SHOWCASE && <WidthSwitch />}
          <DocsLink />
        </div>
      </header>

      <div className="bapp__tabbar">
        <Tabs
          className="bx-tabs--line"
          name="Application sections"
          panelId="bapp-panel"
          value={tab}
          onChange={move}
          options={tabOptions(tabs)}
        />
      </div>

      <div id="bapp-panel" role="tabpanel" aria-label={TAB_LABEL[tab]} className="bapp__panel" ref={panel}>
        {tab === 'policies' ? (
          <NewAppPolicies appId={id} onNew={newPolicy} onExisting={addExisting} />
        ) : (
          <SetupTabBody
            tab={tab}
            draft={draft}
            onPatch={patchSetup}
            onDraft={patchDraft}
            name={draft.name}
            onName={(name) => setDraft((d) => ({ ...d, name }))}
            issues={shownIssues(issues, draft, tried)}
            appId={id}
          />
        )}
      </div>

      {host ? createPortal(footer, host) : footer}
    </div>
  )
}

/* The stored page's Policies with no policy on it — the same empty state and
   the Global Default row under it — before the application exists. Both
   buttons secondary: Save is this view's one orange button. The fallback is
   read for the id the application will take, which no policy names yet, so
   it is the tenant's own answer for everyone. */
function NewAppPolicies({ appId, onNew, onExisting }: { appId: string; onNew: () => void; onExisting: () => void }) {
  const store = useBrand()
  const { policies, users } = store
  const { fallback, everyoneElse } = useMemo(() => appStanding(appId, policies, users), [appId, policies, users])
  /* As on the stored page: a button that would open on nothing to pick is not drawn. */
  const attachable = attachableTo(appId, policies).some((p) => p.type === 'App Access')
  return (
    <div className="bapr__frame">
      <EmptyState
        icon={ShieldPlus}
        title="No policies on this application"
        action={
          <>
            <Button variant="secondary" icon={Plus} onClick={onNew}>
              Create new policy
            </Button>
            {attachable && (
              <Button variant="secondary" icon={ListPlus} onClick={onExisting}>
                Add existing policy
              </Button>
            )}
          </>
        }
      />
      {fallback && <FallbackRow fallback={fallback} everyoneElse={everyoneElse} />}
    </div>
  )
}
