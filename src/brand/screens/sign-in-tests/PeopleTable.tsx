import { useContext, useDeferredValue, useMemo, useState } from 'react'
import { ListFilter, Users } from 'lucide-react'

import { EmptyState, NoMatches } from '../../empty'
import { Face } from '../../faces'
import { SearchBox, Tip, TipDot } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { Picker } from '../../picker'
import { useBrand } from '../../store'
import { ListPager } from '../list-pager'
import { PageBar } from '../page-bar'
import { usePagedList } from '../paged-list'
import { useSimEnv } from '../sim-env'
import { personRows } from '../testing/selectors'
import { TestingSessionContext } from '../testing/session-state'
import { defaultForm, todayIn } from '../testing/sign-in-form'
import { PEOPLE_ROW_H, cellTip, directoryRows, firstDecidedApp, groupFilterOptions, personSaid, restLine, type GroupFilter } from './library'
import { ResolutionAnswer } from './SavedTable'
import './library.css'

/* -----------------------------------------------------------------------------
   Sign-in tests → People: the directory across every application (V4 §3.1).

   The tenant's view, so every application is a column here — the reverse of
   a policy's board, whose People tab lists only that policy's applications
   (DockPeople.tsx). Each cell is what that person would get on that
   application with the rest of the sign-in as Try states it (the testing
   session's form: from where, when, on what), judged as the tenant stands; a
   cell's tooltip names the policy and rule behind it.

   Thirteen applications do not fit beside a name, so the table scrolls
   sideways inside its own card while the person column stays put (sticky),
   and the page itself never scrolls: rows are paged to the window like every
   library list.

   Only the rows on the page are resolved — a person × every application is
   thirteen resolutions, and the directory has dozens of people.

   A row is the way into Try: it opens with that person, on the first
   application a policy of the tenant's own decides for them.
   -------------------------------------------------------------------------- */

export function PeopleTable({ onTry }: { onTry: (personId: string, appId: string | null) => void }) {
  const { users, groups, apps, zones, policies } = useBrand()
  const env = useSimEnv()
  /* The rest of the sign-in is Try's. Read without the hook's throw, so the
     table still draws (on its own defaults) wherever no session is mounted. */
  const session = useContext(TestingSessionContext)
  const [fallback] = useState(() => defaultForm(users, apps, todayIn()))
  const form = session?.form ?? fallback

  const [query, setQuery] = useState('')
  const q = useDeferredValue(query)
  const [group, setGroup] = useState<GroupFilter>('all')
  const groupOptions = useMemo(() => groupFilterOptions(groups, users), [groups, users])
  const people = useMemo(() => directoryRows(users, groups, q, group), [users, groups, q, group])
  const paged = usePagedList(people, { rowHeight: PEOPLE_ROW_H, resetKey: [q, group] })
  const rows = useMemo(
    () => paged.pageRows.map((r) => ({ ...r, cells: personRows(policies, apps, { ...form, personId: r.person.id }, env, zones) })),
    [paged.pageRows, policies, apps, form, env, zones],
  )

  if (users.length === 0) {
    return (
      <div className="sitl">
        <EmptyState icon={Users} title="No people in the directory" />
      </div>
    )
  }

  return (
    <div className="sitl">
      <PageBar
        left={
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search people…" label="Search people" />
            <span className={`btoolbar__filter bbar__filter ${group !== 'all' ? 'is-set' : ''}`}>
              <Picker label="Filter by group" size="md" icon={ListFilter} prefix="Group" value={group} options={groupOptions} onChange={(v) => setGroup(v)} />
            </span>
          </>
        }
        right={
          /* What the cells assume, said once: the rest of Try's sign-in. */
          <span className="sitl-rest">
            <span className="sitl-clip">{restLine(form, { people: users, apps, zones })}</span>
            <TipDot text="Each cell is this sign-in, for that person on that application, as the tenant stands. Change it in Try a sign-in." label="About these answers" />
          </span>
        }
      />

      {people.length === 0 ? (
        <NoMatches
          noun="people"
          query={query}
          filtered={group !== 'all'}
          onClear={() => {
            setQuery('')
            setGroup('all')
          }}
        />
      ) : (
        <div className="btable-wrap sitl-wrap">
          <div className="sitl-scroll sitl-xscroll">
            <table className="sitl-table sitl-people">
              <caption className="u-sr-only">People on every application</caption>
              <thead>
                <tr>
                  <th scope="col" className="sitl-sticky">
                    Person
                  </th>
                  {apps.map((a) => (
                    <th key={a.id} scope="col" className="sitl-apphead">
                      <span className="sitl-app">
                        <AppLogo appId={a.id} name={a.name} size={16} />
                        <span className="sitl-clip">{a.name}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody ref={paged.listRef}>
                {rows.map((r) => {
                  const open = () => onTry(r.person.id, firstDecidedApp(r.cells))
                  return (
                    <tr key={r.person.id} className={`sitl-row sitl-prow${form.personId === r.person.id ? ' is-current' : ''}`} onClick={open}>
                      <th scope="row" className="sitl-sticky">
                        <button
                          type="button"
                          className="sitl-person"
                          aria-label={`${personSaid(r, r.cells)}. Try this person`}
                          onClick={(e) => {
                            e.stopPropagation()
                            open()
                          }}
                        >
                          <Face kind="user" name={r.person.name} size="sm" decorative />
                          <span className="sitl-person__text">
                            <span className="sitl-clip sitl-person__name">{r.person.name}</span>
                            <span className="sitl-clip sitl-sub">{r.groupName}</span>
                          </span>
                        </button>
                      </th>
                      {r.cells.map((c) => (
                        <td key={c.appId}>
                          <Tip text={cellTip(c)} placement="bottom">
                            <span className="sitl-cell">
                              <ResolutionAnswer res={c.res} />
                            </span>
                          </Tip>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {people.length > 0 && <ListPager {...paged.pager} label="People pages" />}
    </div>
  )
}
