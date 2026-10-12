import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppWindow,
  ArrowLeft,
  ArrowUpRight,
  ListPlus,
  PanelRight,
  Pencil,
  Plus,
  Sliders,
  SlidersHorizontal,
  Trash2,
  UserMinus,
  UserRound,
  Users as UsersIcon,
  type LucideIcon,
} from 'lucide-react'

import { Button, Drawer, IconButton, Modal, NameField, RowMenu, SearchBox, Tabs, TipDot, type MenuItem } from '../kit'
import { EmptyState, NoMatches } from '../empty'
import { Face } from '../faces'
import { AppLogo } from '../logos/AppLogo'
import { Picker, type PickerOption } from '../picker'
import { PageHead } from '../Shell'
import { SHOWCASE } from '../showcase'
import { playCue } from '../sound'
import { useBrand } from '../store'
import { listNames } from '../rule-who'
import { nameTaken, type Group } from '../data'
import { appsChangedByMembership, appsNaming } from './app-standing'
import {
  assignLabel,
  filterMembers,
  groupAppRows,
  membersOf,
  membershipAfter,
  notBuilt,
  splitName,
  stampShort,
  unassignLabel,
  whoSaid,
} from './directory-model'
import { ListPager } from './list-pager'
import { PageBar } from './page-bar'
import { usePagedList } from './paged-list'
import { PolicyDetailsDrawer } from './policy-details-drawer'
import { RowCheck, SelectAll, SliderActions } from './select-rows'
import { PEOPLE_ROW_H } from './sign-in-tests/library'

/* -----------------------------------------------------------------------------
   Manage > Groups: the list, and one group's page as the live console has it
   (Basic, Assignment), with the Applications tab the console's Used by would
   have been.

   Members are the directory's people, counted from them — never the stated
   `memberCount`, which is the tenant's size and larger than the people the
   prototype names (it is what the Who picker counts with).

   Assigning and unassigning write the directory at once and say so with Undo.
   Unassign asks first only when it matters: when taking the people out moves
   somebody's deciding policy on some application (the 25 Sep 2026 "interrupt
   only when it matters" ruling). What moves is asked of the engine about the
   directory as it would be (directory-model.ts `membershipAfter`), so the
   question and the write cannot disagree.

   The name is renamed in place with the pencil and saved at once, as every
   stored detail page renames (zones, device and risk profiles).
   -------------------------------------------------------------------------- */

type GroupTab = 'basic' | 'assignment' | 'applications'
type ListSort = { key: 'name' | 'users'; dir: 1 | -1 }

const NAME_MAX = 50
/* The Applications tab's row height, the Apps list's: one line a row. */
const APP_ROW_H = 52

const TABS: { value: GroupTab; label: string; icon: LucideIcon }[] = [
  { value: 'basic', label: 'Basic', icon: Sliders },
  { value: 'assignment', label: 'Assignment', icon: UsersIcon },
  { value: 'applications', label: 'Applications', icon: AppWindow },
]

const GROUP_MENU: MenuItem[] = [
  { id: 'open', label: 'Open group', icon: ArrowUpRight },
  { id: 'apps', label: 'Applications', icon: AppWindow },
  { id: 'delete', label: 'Delete group', icon: Trash2, danger: true, divide: true },
]

/* The live Assignment row menu's two, in its words. */
const MEMBER_MENU: MenuItem[] = [
  { id: 'fields', label: 'Manage membership fields', icon: SlidersHorizontal },
  { id: 'unassign', label: 'Unassign user', icon: UserMinus, danger: true, divide: true },
]

export function GroupsPage({ groupId, tab, from }: { groupId?: string; tab?: GroupTab; from?: { appId: string } }) {
  return groupId ? <GroupPage groupId={groupId} routeTab={tab} from={from} /> : <GroupList />
}

/* --- The list ----------------------------------------------------------------------- */

function GroupList() {
  const store = useBrand()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<ListSort>({ key: 'name', dir: 1 })

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return store.groups
      .filter((g) => !s || g.name.toLowerCase().includes(s))
      .map((group) => ({
        group,
        users: membersOf(store.users, group.id).length,
        apps: appsNaming(group.id, store.apps, store.policies).map((a) => a.name),
      }))
      .sort((a, b) =>
        (sort.key === 'users' ? a.users - b.users || a.group.name.localeCompare(b.group.name) : a.group.name.localeCompare(b.group.name)) * sort.dir,
      )
  }, [store.groups, store.users, store.apps, store.policies, q, sort])
  const paged = usePagedList(rows, { rowHeight: PEOPLE_ROW_H, resetKey: [q, sort] })

  /* With a tab, so the move is a page of its own rather than the rail's
     revisit of the list (revisit.ts). */
  const open = (groupId: string, tab: GroupTab = 'assignment') => store.go({ name: 'groups', groupId, tab })
  const addButton = (
    <Button variant="brand" icon={Plus} onClick={() => store.showToast(notBuilt('Adding groups', SHOWCASE))}>
      Add group
    </Button>
  )

  const head = (key: ListSort['key'], label: string) => {
    const on = sort.key === key
    return (
      <th className={on ? 'is-sorted' : ''} scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className={`btable__sort ${on ? 'is-on' : ''}`}
          onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }))}
        >
          {label}
          <span aria-hidden>{on ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
        </button>
      </th>
    )
  }

  return (
    <div className="bpage bgrp">
      <PageHead title="Groups" caption="Collections of users that policies name." />

      {store.groups.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No groups yet" action={addButton} />
      ) : (
        <>
          <PageBar left={<SearchBox value={q} onChange={setQ} placeholder="Search groups…" label="Search groups" />} right={addButton} />

          {rows.length === 0 ? (
            <NoMatches noun="groups" query={q} onClear={() => setQ('')} />
          ) : (
            <div className="btable-wrap">
              <div className="btable__scroll">
                <table className="btable bdir__table">
                  <thead>
                    <tr>
                      {head('name', 'Group name')}
                      {head('users', 'Users')}
                      <th scope="col">Applications</th>
                      <th scope="col" className="btable__actions btable__col-actions">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody ref={paged.listRef}>
                    {paged.pageRows.map(({ group, users, apps }) => (
                      <tr key={group.id}>
                        <td>
                          <div className="btable__primary">
                            <Face kind="group" name={group.name} size="sm" decorative />
                            <button type="button" className="btable__link" onClick={() => open(group.id)}>
                              {group.name}
                            </button>
                          </div>
                        </td>
                        <td className="u-muted">{users.toLocaleString()}</td>
                        <td className="u-muted">{apps.length > 0 ? listNames(apps, 2) : '—'}</td>
                        <td className="btable__actions">
                          <RowMenu
                            label={`Actions for ${group.name}`}
                            items={GROUP_MENU}
                            onSelect={(id) =>
                              id === 'open'
                                ? open(group.id)
                                : id === 'apps'
                                  ? open(group.id, 'applications')
                                  : store.showToast(notBuilt('Deleting groups', SHOWCASE))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {rows.length > 0 && <ListPager {...paged.pager} label="Group pages" />}
        </>
      )}
    </div>
  )
}

/* --- One group ------------------------------------------------------------------------ */

function GroupPage({ groupId, routeTab, from }: { groupId: string; routeTab?: GroupTab; from?: { appId: string } }) {
  const store = useBrand()
  const group = store.groups.find((g) => g.id === groupId)

  /* The route owns the tab, so a link can land on one (an application's Groups
     tab opens Assignment; the list's Applications item opens that). The tab as
     last seen: a new one from outside moves the page, a press here moves both. */
  const [tab, setTab] = useState<GroupTab>(routeTab ?? 'assignment')
  const [seen, setSeen] = useState(routeTab)
  if (seen !== routeTab) {
    setSeen(routeTab)
    if (routeTab) setTab(routeTab)
  }
  const show = (t: GroupTab) => {
    setTab(t)
    setSeen(t)
    store.go({ name: 'groups', groupId, tab: t, ...(from ? { from } : {}) })
  }

  if (!group) {
    return (
      <div className="bpage bgrp">
        <EmptyState
          icon={UsersIcon}
          title="Group not found"
          blurb="It may have been deleted."
          action={
            <Button variant="brand" onClick={() => store.go({ name: 'groups' })}>
              Back to groups
            </Button>
          }
        />
      </div>
    )
  }

  /* Back to the application this was opened from, on its Groups tab, while it
     still exists; otherwise the list. */
  const fromApp = from ? store.apps.find((a) => a.id === from.appId) : undefined
  const label = TABS.find((t) => t.value === tab)?.label

  return (
    <div className="bpage bgrp bgrp--page">
      <button
        type="button"
        className="bz7__back"
        onClick={() => (fromApp ? store.go({ name: 'application', appId: fromApp.id, tab: 'groups' }) : store.go({ name: 'groups' }))}
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        {fromApp ? fromApp.name : 'All groups'}
      </button>

      <GroupHead group={group} />

      <Tabs className="bx-tabs--line bgrp__tabs" name="Group sections" panelId="bgrp-panel" value={tab} onChange={show} options={TABS} />
      <div id="bgrp-panel" role="tabpanel" aria-label={label} className="bgrp__panel">
        {tab === 'basic' && <BasicTab group={group} />}
        {tab === 'assignment' && <AssignmentTab group={group} />}
        {tab === 'applications' && <ApplicationsTab group={group} />}
      </div>
    </div>
  )
}

/* The zone page's head (ZonesFinal.tsx): the face, the name, and the pencil
   that renames it in place. A rename is saved at once, on its own, and says
   so; there is no draft on this page for it to wait for. */
function GroupHead({ group }: { group: Group }) {
  const store = useBrand()
  const [renaming, setRenaming] = useState(false)
  /* The name last sent to the store, so a rename that commits twice — Enter,
     then the field's own leave — saves and says so once. */
  const savedName = useRef(group.name)
  const [draftName, setDraftName] = useState(group.name)
  const [nameErr, setNameErr] = useState<string | null>(null)
  /* The pencil's wrapper, there so focus can return to it: IconButton takes no ref. */
  const renameSlot = useRef<HTMLSpanElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)

  /* Arriving from the list or an application, the control that brought you
     here has gone and focus is on <body>: the heading takes it. */
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) heading.current?.focus({ preventScroll: true })
  }, [])

  const focusRename = () =>
    window.setTimeout(() => renameSlot.current?.querySelector('button')?.focus({ preventScroll: true }), 0)

  const others = store.groups.filter((g) => g.id !== group.id).map((g) => g.name)
  const nameProblem = !draftName.trim()
    ? 'Enter a group name.'
    : nameTaken(draftName.trim(), others)
      ? 'A group with this name already exists.'
      : null

  /* Saves a usable name, or shows why it is not one and leaves the field open.
     Read from the store, so only the name changes. */
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
      const stored = store.groups.find((g) => g.id === group.id)
      if (stored) {
        store.saveGroup({ ...stored, name })
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
    setDraftName(group.name)
    setNameErr(null)
    setRenaming(false)
    focusRename()
  }

  return (
    <header className="bz7__pagehead">
      <div className="bz7__namewrap">
        <div className={`bz7__titleline ${renaming ? 'is-renaming' : ''}`}>
          <Face kind="group" name={group.name} size="md" decorative />
          {renaming ? (
            <NameField
              value={draftName}
              max={NAME_MAX}
              label="Group name"
              errorId={nameErr ? 'bgrp-name-err' : undefined}
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
              /* A bad name says so at close, not on leave — the zone page's
                 reason: an error shown on the mousedown that left pushes the
                 tabs down under the pointer. */
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
                {group.name}
              </h1>
              <span className="bz7__pencil" ref={renameSlot}>
                <IconButton
                  icon={Pencil}
                  size="sm"
                  tone="ghost"
                  label="Rename"
                  onClick={() => {
                    setDraftName(group.name)
                    setNameErr(null)
                    setRenaming(true)
                  }}
                />
              </span>
            </>
          )}
        </div>
        {nameErr && (
          <p className="bz7__fielderr" id="bgrp-name-err" role="alert">
            {nameErr}
          </p>
        )}
      </div>
    </header>
  )
}

/* --- Basic ------------------------------------------------------------------------------ */

function BasicTab({ group }: { group: Group }) {
  const store = useBrand()
  /* Each only when the fixture dated it. */
  const facts: [string, string][] = []
  if (group.created) facts.push(['Created', group.created])
  if (group.lastModified) facts.push(['Last modified', group.lastModified])

  return (
    <>
      {facts.length > 0 && (
        <dl className="bgrp__facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd title={v}>{stampShort(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <section className="bgrp__section" aria-label="Group custom fields">
        <span className="u-label">Group custom fields</span>
        <EmptyState
          compact
          icon={ListPlus}
          title="No group custom fields"
          action={
            <Button variant="link" icon={Plus} onClick={() => store.showToast(notBuilt('Group custom fields', SHOWCASE, true))}>
              Add group custom field
            </Button>
          }
        />
      </section>
    </>
  )
}

/* --- Assignment -------------------------------------------------------------------------- */

/* Where focus goes when the control that had it is gone — an unassigned row's
   menu, the last row of a page. Select all, the search, the empty state's
   button, then the heading; never <body>. After a tick, so a closing dialog's
   own restore runs first. One selector at a time, in that order (the Display
   tokens page's `landFocus`). */
const LANDING = ['.bdt__check--all', '.bx-search input', '.bempty__action button', 'h1']
function landFocus() {
  window.setTimeout(() => {
    const active = document.activeElement
    const lost = !active || active === document.body || !active.isConnected || !!active.closest('.bx-modal')
    if (!lost) return
    const root = document.querySelector('.bgrp--page')
    for (const sel of LANDING) {
      const el = root?.querySelector<HTMLElement>(sel)
      if (el) {
        el.focus({ preventScroll: true })
        return
      }
    }
  }, 0)
}

/** An unassign waiting on its confirm: who, and the applications whose sign-ins it changes. */
interface PendingUnassign {
  ids: string[]
  who: string
  apps: string[]
}

function AssignmentTab({ group }: { group: Group }) {
  const store = useBrand()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  /* Taken when the dialog opens and kept while it animates out — by then the
     people are out of the group, and a dialog read live would retitle itself. */
  const [pending, setPending] = useState<PendingUnassign | null>(null)
  const [asking, setAsking] = useState(false)

  const members = useMemo(() => membersOf(store.users, group.id), [store.users, group.id])
  const shown = useMemo(() => filterMembers(members, q), [members, q])
  const paged = usePagedList(shown, { rowHeight: PEOPLE_ROW_H, resetKey: q })
  /* A selection acts only on rows the search leaves: a hidden tick must not be
     unassigned by a button that no longer shows it. */
  const picked = shown.filter((u) => selected.includes(u.id)).map((u) => u.id)

  const names = (ids: readonly string[]) => ids.map((id) => store.users.find((u) => u.id === id)?.name ?? id)

  /* The write, and its Undo. Undo puts back the records as they were. */
  const write = (ids: string[]) => {
    const who = whoSaid(names(ids))
    const prev = store.setMembership(ids, group.id, false)
    setSelected((cur) => cur.filter((id) => !ids.includes(id)))
    if (prev.length === 0) return
    store.showToast(`${who} unassigned from ${group.name}.`, { label: 'Undo', run: () => store.restoreUsers(prev) }, { tone: 'removed' })
  }

  /* At once with Undo when nobody's deciding policy moves; otherwise the
     confirm names the applications where sign-ins change. */
  const unassign = (ids: string[]) => {
    const moved = appsChangedByMembership(store.apps, store.policies, store.users, membershipAfter(store.users, ids, group.id, false))
    if (moved.length === 0) {
      write(ids)
      landFocus()
      return
    }
    setPending({ ids, who: whoSaid(names(ids)), apps: moved.map((a) => a.name) })
    setAsking(true)
  }

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const assignButton = (
    <Button variant="brand" icon={Plus} onClick={() => setAssigning(true)}>
      Assign users
    </Button>
  )

  return (
    <>
      {members.length === 0 ? (
        <EmptyState icon={UserRound} title="No users in this group" action={assignButton} />
      ) : (
        <>
          {/* The live words: "Filter data by text or value". */}
          <PageBar left={<SearchBox value={q} onChange={setQ} placeholder="Filter data by text or value" label="Filter users" />} right={assignButton} />

          {shown.length === 0 ? (
            <NoMatches noun="users" query={q} onClear={() => setQ('')} />
          ) : (
            <>
              {/* The count is on the button only — the live "0 Items Selected"
                  is the number, said once. Neutral: red is the confirm's. */}
              <SelectAll shown={shown.map((u) => u.id)} selected={selected} onSelected={setSelected}>
                {picked.length > 0 && (
                  <Button variant="secondary" size="sm" icon={UserMinus} onClick={() => unassign(picked)}>
                    {unassignLabel(picked.length)}
                  </Button>
                )}
              </SelectAll>
              <div className="btable-wrap">
                <div className="btable__scroll">
                  <table className="btable bdir__table bgrp__members">
                    <thead>
                      <tr>
                        <th scope="col" className="bgrp__colcheck">
                          <span className="u-sr-only">Select</span>
                        </th>
                        <th scope="col">Email</th>
                        <th scope="col">First name</th>
                        <th scope="col">Last name</th>
                        <th scope="col" className="btable__actions btable__col-actions">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody ref={paged.listRef}>
                      {paged.pageRows.map((u) => {
                        const on = selected.includes(u.id)
                        const { first, last } = splitName(u.name)
                        return (
                          <tr key={u.id} className={on ? 'is-selected' : ''}>
                            <td className="bgrp__check">
                              <RowCheck label={`Select ${u.name}`} on={on} onToggle={() => toggle(u.id)} />
                            </td>
                            <td>
                              <div className="btable__primary">
                                <Face kind="user" name={u.name} size="sm" decorative />
                                <span>{u.email}</span>
                              </div>
                            </td>
                            <td>{first}</td>
                            <td>{last || '—'}</td>
                            <td className="btable__actions">
                              <RowMenu
                                label={`Actions for ${u.name}`}
                                items={MEMBER_MENU}
                                onSelect={(id) =>
                                  id === 'unassign' ? unassign([u.id]) : store.showToast(notBuilt('Membership fields', SHOWCASE, true))
                                }
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <ListPager {...paged.pager} label="Member pages" />
            </>
          )}
        </>
      )}

      <AssignDrawer open={assigning} group={group} onClose={() => setAssigning(false)} />

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title={pending ? `Unassign ${pending.who} from ${group.name}?` : 'Unassign users'}
        width={480}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (asking && pending) write(pending.ids)
                setAsking(false)
                landFocus()
              }}
            >
              Unassign
            </Button>
          </>
        }
      >
        {pending && (
          <div className="bgrp__effect">
            <span className="u-label">Sign-ins change on</span>
            <p>{listNames(pending.apps, 3)}</p>
          </div>
        )}
      </Modal>
    </>
  )
}

/* The live "+ Assign Users": people from the directory, several at once.
   Members are listed too, under their own heading and not pickable, so the
   list answers "is she in it already" without a second search. Under the
   picker, the applications where the pick changes who decides — said only
   when there are some. */
function AssignDrawer({ open, group, onClose }: { open: boolean; group: Group; onClose: () => void }) {
  const store = useBrand()
  const [picks, setPicks] = useState<string[]>([])
  const control = useRef<HTMLDivElement | null>(null)

  /* Fresh each time it opens, with the picker focused. */
  useEffect(() => {
    if (!open) return
    setPicks([])
    const id = window.setTimeout(() => control.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }), 0)
    return () => window.clearTimeout(id)
  }, [open])

  const memberIds = useMemo(() => new Set(membersOf(store.users, group.id).map((u) => u.id)), [store.users, group.id])
  /* A pick somebody else has since put in the group, or who has left the
     directory, drops out rather than being assigned twice. */
  const live = useMemo(() => picks.filter((id) => !memberIds.has(id) && store.users.some((u) => u.id === id)), [picks, memberIds, store.users])
  const options = useMemo<PickerOption[]>(() => {
    const byName = [...store.users].sort((a, b) => a.name.localeCompare(b.name))
    const option = (u: (typeof byName)[number], member: boolean): PickerOption => ({
      value: u.id,
      label: u.name,
      meta: member ? 'Member' : u.email,
      art: <Face kind="user" name={u.name} size="sm" decorative />,
      ...(member ? { group: 'Members', disabled: true } : {}),
    })
    return [...byName.filter((u) => !memberIds.has(u.id)).map((u) => option(u, false)), ...byName.filter((u) => memberIds.has(u.id)).map((u) => option(u, true))]
  }, [store.users, memberIds])

  const pickedNames = live.map((id) => store.users.find((u) => u.id === id)?.name ?? id)
  const moved = useMemo(
    () =>
      live.length === 0
        ? []
        : appsChangedByMembership(store.apps, store.policies, store.users, membershipAfter(store.users, live, group.id, true)).map((a) => a.name),
    [live, store.apps, store.policies, store.users, group.id],
  )

  const assign = () => {
    if (live.length === 0) return
    const prev = store.setMembership(live, group.id, true)
    onClose()
    if (prev.length === 0) return
    /* The snap of a person landing in a group; the toast's own sound is then
       quiet (sound.ts, the press's window). */
    playCue('attach')
    store.showToast(`${whoSaid(pickedNames)} assigned to ${group.name}.`, { label: 'Undo', run: () => store.restoreUsers(prev) }, { tone: 'success' })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Assign users"
      caption={group.name}
      width={560}
      actions={<SliderActions onCancel={onClose} primary={{ label: assignLabel(live.length), run: assign, disabled: live.length === 0 }} another={null} />}
    >
      <div className="bmc__fields">
        <div className="bmc__field">
          <div className="bmc__label">
            <span className="bdt__label">Users</span>
          </div>
          <div className="bmc__control" ref={control}>
            <Picker
              label="Users"
              multiple
              searchable
              width="fill"
              size="md"
              noun="users"
              placeholder="Choose users"
              /* The names, not "3 selected": the trigger says who, and the
                 footer's button is where the pick is counted. All of them,
                 clipped by the trigger, so no second number is printed. */
              summary={live.length > 0 ? listNames(pickedNames, Infinity) : undefined}
              value={live}
              options={options}
              onChange={(id) => setPicks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
            />
          </div>
        </div>
        {moved.length > 0 && (
          <div className="bgrp__effect">
            <span className="u-label">Sign-ins change on</span>
            <p>{listNames(moved, 3)}</p>
          </div>
        )}
      </div>
    </Drawer>
  )
}

/* --- Applications ---------------------------------------------------------------------- */

/* Every application whose policies name the group — in an audience, a rule's
   Who or its exceptions, or a Group condition — and the policy deciding for
   the group's members there, which is the engine's pick and not always the
   one that names it. A tip says which others name it, with their status. */
function ApplicationsTab({ group }: { group: Group }) {
  const store = useBrand()
  const [details, setDetails] = useState<{ id: string; open: boolean } | null>(null)
  const rows = useMemo(
    () => groupAppRows(group.id, appsNaming(group.id, store.apps, store.policies), store.policies),
    [group.id, store.apps, store.policies],
  )
  const paged = usePagedList(rows, { rowHeight: APP_ROW_H })

  const openApp = (appId: string) => store.go({ name: 'application', appId, tab: 'groups', from: { groupId: group.id } })
  const openPolicy = (id: string) => setDetails({ id, open: true })

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState compact icon={AppWindow} title="No applications" />
      ) : (
        <>
          <div className="btable-wrap">
            <div className="btable__scroll">
              <table className="btable">
                <thead>
                  <tr>
                    <th scope="col">Application</th>
                    <th scope="col">Deciding policy</th>
                    <th scope="col" className="btable__actions btable__col-actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody ref={paged.listRef}>
                  {paged.pageRows.map(({ app, decider, tip }) => (
                    <tr key={app.id}>
                      <td>
                        <div className="btable__primary">
                          <span className="btable__app">
                            <AppLogo appId={app.id} name={app.name} size={20} />
                            <button type="button" className="btable__link" onClick={() => openApp(app.id)}>
                              {app.name}
                            </button>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="bgrp__decider">
                          {decider ? (
                            <button type="button" className="btable__link" onClick={() => openPolicy(decider.id)}>
                              {decider.name}
                            </button>
                          ) : (
                            <span className="u-muted">—</span>
                          )}
                          {tip && <TipDot text={tip} label={`Other policies naming ${group.name} on ${app.name}`} />}
                        </span>
                      </td>
                      <td className="btable__actions">
                        <RowMenu
                          label={`Actions for ${app.name}`}
                          items={[
                            { id: 'app', label: 'Open application', icon: AppWindow },
                            { id: 'policy', label: 'Open policy', icon: PanelRight, disabled: !decider },
                          ]}
                          onSelect={(id) => (id === 'app' ? openApp(app.id) : decider && openPolicy(decider.id))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ListPager {...paged.pager} label="Application pages" />
        </>
      )}

      {details && <PolicyDetailsDrawer open={details.open} policyId={details.id} onClose={() => setDetails({ ...details, open: false })} />}
    </>
  )
}
