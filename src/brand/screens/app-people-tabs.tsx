import { useMemo, useState } from 'react'
import { ListFilter, LogIn, PanelRight, UserRound, Users } from 'lucide-react'

import type { Policy } from '../data'
import { EmptyState, NoMatches } from '../empty'
import { Face } from '../faces'
import { Badge, RowMenu, SearchBox, TipDot, type MenuItem } from '../kit'
import { Picker } from '../picker'
import { useBrand } from '../store'
import {
  alsoTip,
  appGroupRows,
  appUserRows,
  filterUserRows,
  policyFilterOptions,
  searchGroupRows,
  sortGroupRows,
  sortUserRows,
  withGroupOption,
  type GroupSortKey,
  type PolicyFilter,
  type Sort,
  type UserSortKey,
} from './app-people-tabs-model'
import { appStanding } from './app-standing'
import { checkAccessFrom } from './guarded-moves'
import { ListPager } from './list-pager'
import { PageBar } from './page-bar'
import { usePagedList } from './paged-list'
import { PolicyDetailsDrawer } from './policy-details-drawer'
import { PEOPLE_ROW_H, groupFilterOptions, type GroupFilter } from './sign-in-tests/library'
import { ACCESS_CHECK } from './sign-in-tests/names'
import { useTestingSession } from './testing/session-state'
import { formOf } from './testing/sign-in-form'
import { UserDrawer } from './UserDrawer'

/* -----------------------------------------------------------------------------
   An application's Users and Groups tabs (spec 10 Oct 2026, §4): the live
   console's Associated Users / Associated Groups, with the one column it never
   had — the policy that decides for each.

   Every person in the directory is on Users, not only the ones a policy here
   names: somebody no policy names still signs in, under the tenant default,
   and the tab says so rather than leaving them out. Groups lists Everyone —
   the DEFAULT group — first, then every group the app's policies name, in
   their audiences or their rules.

   "Deciding policy" is the engine's own pick (app-standing.ts), asked of the
   person, or of a stand-in for the group, so this table and Access checks
   cannot disagree. Its tip names the app's other policies that name them,
   with each one's status: the shadowed policy and the draft are what an admin
   comes here to find. The name opens the policy's details slider; the board
   it opens from there comes back to this application.

   Counts are the directory's members, never a group's stated `memberCount`,
   which is the Who picker's (owner question G3).
   -------------------------------------------------------------------------- */

const USER_ACTIONS: MenuItem[] = [
  { id: 'view', label: 'View details', icon: PanelRight },
  { id: 'check', label: ACCESS_CHECK, icon: LogIn },
]

/* A sortable column head, Applications.tsx's `head`, for either tab. */
function SortHead<K extends string>({ sort, onSort, k, label }: { sort: Sort<K>; onSort: (s: Sort<K>) => void; k: K; label: string }) {
  const on = sort.key === k
  return (
    <th className={on ? 'is-sorted' : ''} scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`btable__sort ${on ? 'is-on' : ''}`} onClick={() => onSort({ key: k, dir: on && sort.dir === 1 ? -1 : 1 })}>
        {label}
        <span aria-hidden>{on ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  )
}

/* The Deciding policy cell: the policy's name, opening its details, and the
   tip naming the others when there are any. "—" when nothing decides, which
   only a tenant without a default policy can show. */
function DeciderCell({ policy, also, who, onOpen }: { policy: Policy | null; also: Policy[]; who: string; onOpen: (id: string) => void }) {
  const tip = alsoTip(also)
  return (
    <span className="btable__marks">
      {policy ? (
        <button type="button" className="btable__link" onClick={() => onOpen(policy.id)}>
          {policy.name}
        </button>
      ) : (
        <span className="u-muted">—</span>
      )}
      {tip && <TipDot text={tip} label={`Other policies naming ${who}`} />}
    </span>
  )
}

/* The policy details slider, as the Policies list keeps it: open and closed
   are one state, so it slides out still holding the policy. Its board comes
   back to this application (policy-details-drawer.tsx `boardFrom`). */
function useDetails(appId: string) {
  const store = useBrand()
  const [details, setDetails] = useState<{ id: string; open: boolean } | null>(null)
  const drawer =
    details && store.policies.some((p) => p.id === details.id) ? (
      <PolicyDetailsDrawer open={details.open} policyId={details.id} onClose={() => setDetails({ ...details, open: false })} boardFrom={{ appId }} />
    ) : null
  return { open: (id: string) => setDetails({ id, open: true }), drawer }
}

// --- Users ---------------------------------------------------------------------------

export function AppUsersTab({ appId, group }: { appId: string; group?: string }) {
  const store = useBrand()
  const session = useTestingSession()
  const [query, setQuery] = useState('')
  /* The route's group, as last seen: a Groups-tab count that lands here with
     another group moves the filter; picking one here is the page's own. */
  const [groupF, setGroupF] = useState<GroupFilter>(group ?? 'all')
  const [seenGroup, setSeenGroup] = useState(group)
  if (seenGroup !== group) {
    setSeenGroup(group)
    setGroupF(group ?? 'all')
  }
  const [policyPick, setPolicyPick] = useState<PolicyFilter>('all')
  const [sort, setSort] = useState<Sort<UserSortKey>>({ key: 'user', dir: 1 })
  const [person, setPerson] = useState<string | null>(null)
  const details = useDetails(appId)

  const standing = useMemo(() => appStanding(appId, store.policies, store.users), [appId, store.policies, store.users])
  const all = useMemo(() => appUserRows(appId, store.policies, store.users, store.groups), [appId, store.policies, store.users, store.groups])
  const policyOptions = useMemo(() => policyFilterOptions(standing, all), [standing, all])
  /* A policy picked here that has since stopped deciding for anybody (removed
     from the app, turned off) is no longer a choice: the filter reads All. */
  const policy = policyOptions.some((o) => o.value === policyPick) ? policyPick : 'all'
  const groupOptions = useMemo(() => withGroupOption(groupFilterOptions(store.groups, store.users), groupF, store.groups), [store.groups, store.users, groupF])
  const rows = useMemo(
    () => sortUserRows(filterUserRows(all, store.groups, { query, group: groupF, policy }), sort),
    [all, store.groups, query, groupF, policy, sort],
  )
  const paged = usePagedList(rows, { rowHeight: PEOPLE_ROW_H, resetKey: [query, groupF, policy, sort] })

  /* The person on this application, in Access checks' form — loaded only once
     the leave guard lets the move go ahead (guarded-moves.ts), so Keep
     editing over an unsaved Basic leaves Access checks as it was. */
  const check = (personId: string) => checkAccessFrom(store, () => session.load(formOf({ appId, personId }, store.zones)))

  if (store.users.length === 0) return <EmptyState icon={UserRound} title="No users yet" />

  const filtered = groupF !== 'all' || policy !== 'all'
  return (
    <>
      <PageBar
        left={
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search users…" label="Search users" />
            <span className={`btoolbar__filter bbar__filter ${groupF !== 'all' ? 'is-set' : ''}`}>
              <Picker label="Filter by group" size="md" icon={ListFilter} prefix="Group" value={groupF} options={groupOptions} onChange={(v) => setGroupF(v)} />
            </span>
            <span className={`btoolbar__filter bbar__filter ${policy !== 'all' ? 'is-set' : ''}`}>
              <Picker label="Filter by policy" size="md" icon={ListFilter} prefix="Policy" value={policy} options={policyOptions} onChange={(v) => setPolicyPick(v)} />
            </span>
          </>
        }
      />

      {rows.length === 0 ? (
        <NoMatches
          noun="users"
          query={query}
          filtered={filtered}
          onClear={() => {
            setQuery('')
            setGroupF('all')
            setPolicyPick('all')
          }}
        />
      ) : (
        <div className="btable-wrap">
          <div className="btable__scroll">
            <table className="btable">
              <thead>
                <tr>
                  <SortHead sort={sort} onSort={setSort} k="user" label="User" />
                  <SortHead sort={sort} onSort={setSort} k="groups" label="Groups" />
                  <SortHead sort={sort} onSort={setSort} k="policy" label="Deciding policy" />
                  <th scope="col" className="btable__actions btable__col-actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody ref={paged.listRef}>
                {paged.pageRows.map(({ user, groups, decider, also }) => (
                  <tr key={user.id}>
                    <td>
                      <div className="btable__primary">
                        <Face kind="user" name={user.name} size="sm" decorative />
                        {/* The email over the name: the email is what the live
                            console lists people by, and it opens the person. */}
                        <span className="busr__who">
                          <button type="button" className="btable__link" onClick={() => setPerson(user.id)}>
                            {user.email}
                          </button>
                          <span className="busr__sub">{user.name}</span>
                        </span>
                      </div>
                    </td>
                    <td className="u-muted">{groups}</td>
                    <td>
                      <DeciderCell policy={decider} also={also} who={user.name} onOpen={details.open} />
                    </td>
                    <td className="btable__actions">
                      <RowMenu
                        label={`Actions for ${user.name}`}
                        items={USER_ACTIONS}
                        onSelect={(id) => (id === 'view' ? setPerson(user.id) : check(user.id))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {rows.length > 0 && <ListPager {...paged.pager} label="User pages" />}

      {/* Open on this application's Users tab, so its link to this application stays here. */}
      <UserDrawer userId={person} onClose={() => setPerson(null)} appOpen={appId} />
      {details.drawer}
    </>
  )
}

// --- Groups ----------------------------------------------------------------------------

export function AppGroupsTab({ appId, onShowUsers }: { appId: string; onShowUsers: (groupId: string | null) => void }) {
  const store = useBrand()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort<GroupSortKey>>({ key: 'group', dir: 1 })
  const details = useDetails(appId)

  const all = useMemo(() => appGroupRows(appId, store.policies, store.users, store.groups), [appId, store.policies, store.users, store.groups])
  const rows = useMemo(() => sortGroupRows(searchGroupRows(all, query), sort), [all, query, sort])
  const paged = usePagedList(rows, { rowHeight: PEOPLE_ROW_H, resetKey: [query, sort] })

  const openGroup = (groupId: string) => store.go({ name: 'groups', groupId, tab: 'assignment', from: { appId } })

  return (
    <>
      <PageBar left={<SearchBox value={query} onChange={setQuery} placeholder="Search groups…" label="Search groups" />} />

      {rows.length === 0 ? (
        <NoMatches noun="groups" query={query} onClear={() => setQuery('')} />
      ) : (
        <div className="btable-wrap">
          <div className="btable__scroll">
            <table className="btable">
              <thead>
                <tr>
                  <SortHead sort={sort} onSort={setSort} k="group" label="Group" />
                  <SortHead sort={sort} onSort={setSort} k="users" label="Users" />
                  <th scope="col">Deciding policy</th>
                  <th scope="col" className="btable__actions btable__col-actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody ref={paged.listRef}>
                {paged.pageRows.map((r) => {
                  const items: MenuItem[] = [
                    ...(r.id !== null && r.known ? [{ id: 'group', label: 'Open group', icon: Users }] : []),
                    { id: 'policy', label: 'Open policy', icon: PanelRight, disabled: !r.decider },
                  ]
                  return (
                    <tr key={r.id ?? 'everyone'}>
                      <td>
                        <div className="btable__primary">
                          <Face kind="group" name={r.name} size="sm" decorative />
                          {r.id === null ? (
                            /* The live DEFAULT group: every person is in it,
                               so it has no page of members to open. */
                            <>
                              <span>{r.name}</span>
                              <Badge tone="system">Default group</Badge>
                            </>
                          ) : r.known ? (
                            <button type="button" className="btable__link" onClick={() => openGroup(r.id!)}>
                              {r.name}
                            </button>
                          ) : (
                            <span className="u-muted">{r.name}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {/* The count opens Users on this group — Everyone's on
                            nobody's. Nobody in it is nothing to open. */}
                        {r.users > 0 ? (
                          <button
                            type="button"
                            className="btable__link"
                            aria-label={`${r.users.toLocaleString()} ${r.users === 1 ? 'user' : 'users'}${r.id === null ? '' : ` in ${r.name}`}`}
                            onClick={() => onShowUsers(r.id)}
                          >
                            {r.users.toLocaleString()}
                          </button>
                        ) : (
                          <span className="u-muted">0</span>
                        )}
                      </td>
                      <td>
                        <DeciderCell policy={r.decider} also={r.also} who={r.name} onOpen={details.open} />
                      </td>
                      <td className="btable__actions">
                        <RowMenu
                          label={`Actions for ${r.name}`}
                          items={items}
                          onSelect={(id) => {
                            if (id === 'group' && r.id) openGroup(r.id)
                            else if (id === 'policy' && r.decider) details.open(r.decider.id)
                          }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {rows.length > 0 && <ListPager {...paged.pager} label="Group pages" />}

      {details.drawer}
    </>
  )
}
