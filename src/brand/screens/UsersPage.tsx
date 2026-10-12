import { useMemo, useState } from 'react'
import { ListFilter, LogIn, PanelRight, Pencil, Plus, Trash2, UserRound, Users as UsersIcon } from 'lucide-react'

import { Badge, Button, RowMenu, SearchBox, type MenuItem } from '../kit'
import { EmptyState, NoMatches } from '../empty'
import { Face, FaceStack } from '../faces'
import { Picker } from '../picker'
import { PageHead } from '../Shell'
import { SHOWCASE } from '../showcase'
import { useBrand } from '../store'
import type { User } from '../data'
import { groupNamesOf, notBuilt, rolesOf } from './directory-model'
import { ListPager } from './list-pager'
import { PageBar } from './page-bar'
import { usePagedList } from './paged-list'
import { PEOPLE_ROW_H, directoryRows, groupFilterOptions, type GroupFilter } from './sign-in-tests/library'
import { ACCESS_CHECK } from './sign-in-tests/names'
import { useTestingSession } from './testing/session-state'
import { formOf } from './testing/sign-in-form'
import { UserDrawer } from './UserDrawer'

/* -----------------------------------------------------------------------------
   Manage > Users: the User list and User roles, the two the console's rail
   opens first.

   The User list is the directory as the console files it — by email, the name
   under it — with every group a person is in, their type and their role. The
   email opens the person's details (UserDrawer.tsx): the applications they
   sign in to and the policy deciding for them on each, read from the engine.
   Check access opens Access checks with the person loaded and checked — the
   testing session's `load`, as Sign-in activity's way there does; the press
   says Check access, so it is the run.

   User roles lists each role with the faces of the people who hold it; a role
   opens the User list filtered to it. Adding, editing and deleting users and
   roles are not built, and their buttons say so.
   -------------------------------------------------------------------------- */

type UserSort = 'user' | 'type' | 'role'
type RoleSort = 'role' | 'users'
type Sort<K> = { key: K; dir: 1 | -1 }

/* The roles table's row height, the Apps list's: one line a row. */
const ROLE_ROW_H = 52

const USER_MENU: MenuItem[] = [
  { id: 'details', label: 'View details', icon: PanelRight },
  { id: 'check', label: ACCESS_CHECK, icon: LogIn },
  { id: 'edit', label: 'Edit user', icon: Pencil },
  { id: 'delete', label: 'Delete user', icon: Trash2, danger: true, divide: true },
]

const ROLE_MENU: MenuItem[] = [
  { id: 'show', label: 'Show users', icon: UsersIcon },
  { id: 'edit', label: 'Edit role', icon: Pencil },
]

/* A sortable column head, the Apps list's (Applications.tsx): the whole cell
   presses it, and the arrow says which way. */
function SortHead<K extends string>({ k, label, sort, onSort }: { k: K; label: string; sort: Sort<K>; onSort: (next: Sort<K>) => void }) {
  const on = sort.key === k
  return (
    <th className={on ? 'is-sorted' : ''} scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`btable__sort ${on ? 'is-on' : ''}`}
        onClick={() => onSort({ key: k, dir: on && sort.dir === 1 ? -1 : 1 })}
      >
        {label}
        <span aria-hidden>{on ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  )
}

/* --- User list ------------------------------------------------------------------- */

export function UsersPage({ role: routeRole }: { role?: string }) {
  const store = useBrand()
  const session = useTestingSession()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<GroupFilter>('all')
  /* The route's role, as last seen: a role opened from User roles lands here
     filtered to it, and a later one from outside moves the filter again. */
  const [role, setRole] = useState(routeRole ?? 'all')
  const [seenRole, setSeenRole] = useState(routeRole)
  if (seenRole !== routeRole) {
    setSeenRole(routeRole)
    setRole(routeRole ?? 'all')
  }
  const [sort, setSort] = useState<Sort<UserSort>>({ key: 'user', dir: 1 })
  /** Whose details are open. Null is closed. */
  const [open, setOpen] = useState<string | null>(null)

  const groupOptions = useMemo(() => groupFilterOptions(store.groups, store.users), [store.groups, store.users])
  const roleOptions = useMemo(
    () => [{ value: 'all', label: 'All' }, ...rolesOf(store.users).map((r) => ({ value: r.role, label: r.role }))],
    [store.users],
  )

  const rows = useMemo(() => {
    const kept = directoryRows(store.users, store.groups, q, group)
      .map((r) => r.person)
      .filter((u) => role === 'all' || u.role === role)
    const byEmail = (a: User, b: User) => a.email.localeCompare(b.email)
    const cmp: Record<UserSort, (a: User, b: User) => number> = {
      user: byEmail,
      type: (a, b) => a.userType.localeCompare(b.userType) || byEmail(a, b),
      role: (a, b) => a.role.localeCompare(b.role) || byEmail(a, b),
    }
    return kept.sort((a, b) => cmp[sort.key](a, b) * sort.dir)
  }, [store.users, store.groups, q, group, role, sort])

  const paged = usePagedList(rows, { rowHeight: PEOPLE_ROW_H, resetKey: [q, group, role, sort] })
  const filtered = group !== 'all' || role !== 'all'

  const addUser = () => store.showToast(notBuilt('Adding users', SHOWCASE))
  const addButton = (
    <Button variant="brand" icon={Plus} onClick={addUser}>
      Add user
    </Button>
  )

  const onMenu = (u: User) => (id: string) => {
    if (id === 'details') setOpen(u.id)
    else if (id === 'check') {
      /* The person alone: Access checks asks for the application next. */
      session.load(formOf({ personId: u.id }, store.zones))
      store.go({ name: 'sign-in-tests' })
    } else store.showToast(notBuilt(id === 'edit' ? 'Editing users' : 'Deleting users', SHOWCASE))
  }

  return (
    <div className="bpage busr">
      <PageHead title="User list" caption="People in this tenant's directory." />

      {store.users.length === 0 ? (
        <EmptyState icon={UserRound} title="No users yet" action={addButton} />
      ) : (
        <>
          <PageBar
            left={
              <>
                <SearchBox value={q} onChange={setQ} placeholder="Search users…" label="Search users" />
                <span className={`btoolbar__filter bbar__filter ${group !== 'all' ? 'is-set' : ''}`}>
                  <Picker label="Filter by group" size="md" icon={ListFilter} prefix="Group" value={group} options={groupOptions} onChange={setGroup} />
                </span>
                <span className={`btoolbar__filter bbar__filter ${role !== 'all' ? 'is-set' : ''}`}>
                  <Picker label="Filter by role" size="md" icon={ListFilter} prefix="Role" value={role} options={roleOptions} onChange={setRole} />
                </span>
              </>
            }
            right={addButton}
          />

          {rows.length === 0 ? (
            <NoMatches
              noun="users"
              query={q}
              filtered={filtered}
              onClear={() => {
                setQ('')
                setGroup('all')
                setRole('all')
              }}
            />
          ) : (
            <div className="btable-wrap">
              <div className="btable__scroll">
                <table className="btable">
                  <thead>
                    <tr>
                      <SortHead k="user" label="User" sort={sort} onSort={setSort} />
                      <th scope="col">Groups</th>
                      <SortHead k="type" label="Type" sort={sort} onSort={setSort} />
                      <SortHead k="role" label="Role" sort={sort} onSort={setSort} />
                      <th scope="col" className="btable__actions btable__col-actions">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody ref={paged.listRef}>
                    {paged.pageRows.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <UserCell user={u} onOpen={() => setOpen(u.id)} />
                        </td>
                        <td className="u-muted">{groupNamesOf(u, store.groups) || '—'}</td>
                        <td className="u-muted">{u.userType}</td>
                        <td>
                          <Badge tone="neutral">{u.role}</Badge>
                        </td>
                        <td className="btable__actions">
                          <RowMenu label={`Actions for ${u.name}`} items={USER_MENU} onSelect={onMenu(u)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {rows.length > 0 && <ListPager {...paged.pager} label="User pages" />}
        </>
      )}

      <UserDrawer userId={open} onClose={() => setOpen(null)} />
    </div>
  )
}

/* A person in a row: their face, then the email — which opens their details —
   over their name. */
function UserCell({ user, onOpen }: { user: User; onOpen: () => void }) {
  return (
    <div className="btable__primary">
      <Face kind="user" name={user.name} size="sm" decorative />
      <span className="busr__who">
        <button type="button" className="btable__link" onClick={onOpen}>
          {user.email}
        </button>
        <span className="busr__sub">{user.name}</span>
      </span>
    </div>
  )
}

/* --- User roles ---------------------------------------------------------------------- */

export function UserRolesPage() {
  const store = useBrand()
  const [sort, setSort] = useState<Sort<RoleSort>>({ key: 'role', dir: 1 })

  const roles = useMemo(() => {
    const all = rolesOf(store.users)
    const cmp: Record<RoleSort, (a: (typeof all)[number], b: (typeof all)[number]) => number> = {
      role: (a, b) => a.role.localeCompare(b.role),
      users: (a, b) => a.users.length - b.users.length || a.role.localeCompare(b.role),
    }
    return all.sort((a, b) => cmp[sort.key](a, b) * sort.dir)
  }, [store.users, sort])
  const paged = usePagedList(roles, { rowHeight: ROLE_ROW_H, resetKey: sort })

  const show = (role: string) => store.go({ name: 'users', role })
  const addButton = (
    <Button variant="brand" icon={Plus} onClick={() => store.showToast(notBuilt('Adding roles', SHOWCASE))}>
      Add role
    </Button>
  )

  return (
    <div className="bpage busr">
      {/* No caption: the one it had described permissions this page does not show. */}
      <PageHead title="User roles" />

      {roles.length === 0 ? (
        <EmptyState icon={UserRound} title="No roles yet" action={addButton} />
      ) : (
        <>
          <PageBar right={addButton} />
          <div className="btable-wrap">
            <div className="btable__scroll">
              <table className="btable">
                <thead>
                  <tr>
                    <SortHead k="role" label="Role" sort={sort} onSort={setSort} />
                    <SortHead k="users" label="Users" sort={sort} onSort={setSort} />
                    <th scope="col" className="btable__actions btable__col-actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody ref={paged.listRef}>
                  {paged.pageRows.map(({ role, users }) => (
                    <tr key={role}>
                      <td>
                        <button type="button" className="btable__link" onClick={() => show(role)}>
                          {role}
                        </button>
                      </td>
                      {/* The faces, each name on hover; past five, the rest as one
                          mark. No count beside them — the stack says it. */}
                      <td>
                        <FaceStack faces={users.map((u) => ({ kind: 'user', name: u.name, key: u.id }))} max={5} />
                      </td>
                      <td className="btable__actions">
                        <RowMenu
                          label={`Actions for ${role}`}
                          items={ROLE_MENU}
                          onSelect={(id) => (id === 'show' ? show(role) : store.showToast(notBuilt('Editing roles', SHOWCASE)))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ListPager {...paged.pager} label="Role pages" />
        </>
      )}
    </div>
  )
}
