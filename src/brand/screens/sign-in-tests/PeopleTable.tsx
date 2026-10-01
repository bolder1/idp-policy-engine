import { motion, useReducedMotion } from 'motion/react'
import { useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ListFilter, Users } from 'lucide-react'

import { EmptyState, NoMatches } from '../../empty'
import { Face } from '../../faces'
import { SearchBox, Tip, TipDot } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import { Picker } from '../../picker'
import { useBrand } from '../../store'
import type { Boundaries } from '../testing/boundaries'
import { ListPager } from '../list-pager'
import { PageBar } from '../page-bar'
import { usePagedList } from '../paged-list'
import { useSimEnv } from '../sim-env'
import { personRows } from '../testing/selectors'
import { TestingSessionContext } from '../testing/session-state'
import { SignInSentence } from '../testing/SignInSentence'
import { GLOBAL_SCOPE } from '../testing/sign-in-sentence'
import { factsOf, todayIn, type FormField, type SignInForm } from '../testing/sign-in-form'
import {
  LIBRARY_MIN_ROWS,
  PEOPLE_LEAD,
  PEOPLE_ROW_H,
  PEOPLE_TOKENS,
  cellSaid,
  cellTip,
  defaultPeopleContext,
  directoryRows,
  firstDecidedApp,
  groupFilterOptions,
  libraryMemory,
  patchContext,
  peopleRowsRead,
  personSaid,
  useKeptPage,
  type GroupFilter,
} from './library'
import { ResolutionAnswer } from './SavedTable'
import './library.css'

/* -----------------------------------------------------------------------------
   Sign-in tests → People: the directory across every application (V4 §3.1).

   The tenant's view, so every application is a column here — the reverse of
   a policy's board, whose People tab lists only that policy's applications
   (DockPeople.tsx). Each cell is what that person would get on that
   application, judged as the tenant stands; a cell's tooltip names the
   policy and rule behind it.

   The rest of the sign-in is this tab's own (V4 §7 F2), said once above the
   grid as a sentence of the same tokens Try uses:

     Everyone signs in from [Office network ▾] on [Windows 11 laptop ·
     registered ▾] at [09:30 Tue ▾] with risk [12 ▾]

   Only the tokens some application's rules read (library.ts,
   `peopleRowsRead`); never who or where to, which are the row and the column.
   It starts on a registered corporate laptop, so the grid answers rather than
   saying Can't tell down every column that reads a device. Changing a token
   re-judges the grid: the cells fade back in row by row, 30 ms apart (at once
   under reduced motion). Kept in the library's memory with the search, the
   group and the page, so a Try from a row and back finds it as it was.

   Thirteen applications do not fit beside a name, so the table scrolls
   sideways inside its own card while the person column stays put (sticky),
   and the page itself never scrolls: rows are paged to the window like every
   library list.

   Only the rows on the page are resolved — a person × every application is
   thirteen resolutions, and the directory has dozens of people.

   Every cell is a way into Try: that person on that application, on this
   tab's sentence (the page builds the sign-in from the memory's context,
   SignInTests.tsx), so Try answers what the cell said. A cell is a button
   of its own, pressed anywhere in the cell, named "Try Priya Sharma on
   Microsoft Outlook: Deny", its tip (the policy and rule) its description.
   The rest of the row — the name, the space around it — opens the person
   on the first application a policy of the tenant's own decides for them.
   -------------------------------------------------------------------------- */

/* The rulers' bands are one application's answers along a scale; this
   sentence speaks for every application at once, so its rulers print none. */
const NO_BANDS: Boundaries = {}

export function PeopleTable({ onTry }: { onTry: (personId: string, appId: string | null) => void }) {
  const { users, groups, apps, zones, policies, fingerprints, persona } = useBrand()
  const env = useSimEnv()
  const reduced = useReducedMotion() === true
  const mem = libraryMemory(persona)
  /* Only to mark the person Try has now. Read without the hook's throw, so
     the table still draws wherever no session is mounted. */
  const session = useContext(TestingSessionContext)

  const [context, setContext] = useState<SignInForm>(() => mem.people.context ?? defaultPeopleContext(todayIn()))
  /* Bumped by a change to the sentence, never by paging or a search: what the
     cells re-settle for. Zero draws them at once. Counted while rendering, the
     way React adjusts state to a changed input, so the cells fade in the same
     frame their answers change. */
  const [judged, setJudged] = useState(0)
  const [judgedOn, setJudgedOn] = useState(context)
  if (judgedOn !== context) {
    setJudgedOn(context)
    setJudged((n) => n + 1)
  }
  const [query, setQuery] = useState(mem.people.query)
  const q = useDeferredValue(query)
  const [group, setGroup] = useState<GroupFilter>(mem.people.group)
  useEffect(() => {
    Object.assign(mem.people, { query, group, context })
  }, [mem, query, group, context])

  const read = useMemo(() => peopleRowsRead(policies, apps, { zones, fingerprints }), [policies, apps, zones, fingerprints])
  const issues = useMemo(() => factsOf(context, zones).issues, [context, zones])
  /* A patch that changes nothing — the origin already on, picked again —
     keeps the same sentence, and so re-judges nothing. */
  const patch = (p: Partial<SignInForm>, field: FormField) =>
    setContext((c) => {
      const next = patchContext(c, p, field)
      return JSON.stringify(next) === JSON.stringify(c) ? c : next
    })

  const groupOptions = useMemo(() => groupFilterOptions(groups, users), [groups, users])
  const people = useMemo(() => directoryRows(users, groups, q, group), [users, groups, q, group])
  const paged = usePagedList(people, { rowHeight: PEOPLE_ROW_H, resetKey: [q, group], minRows: LIBRARY_MIN_ROWS })
  useKeptPage(paged, people, (r) => r.person.id, mem.people)
  const rows = useMemo(
    () => paged.pageRows.map((r) => ({ ...r, cells: personRows(policies, apps, { ...context, personId: r.person.id }, env, zones) })),
    [paged.pageRows, policies, apps, context, env, zones],
  )

  /* Which way the grid can still scroll: the card fades at an edge with more
     behind it, and the person column casts its edge once something has gone
     under it. Read on scroll and on resize; the scroller exists only while
     there are rows. */
  const scroller = useRef<HTMLDivElement | null>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const hasRows = people.length > 0
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const read = () => {
      const left = el.scrollLeft > 1
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }))
    }
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', read)
      ro?.disconnect()
    }
  }, [hasRows])

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
      />

      {/* What every cell assumes, said once, and changed right here. */}
      <div className="sitl-context">
        <SignInSentence
          form={context}
          onPatch={patch}
          rows={read}
          issues={issues}
          boundaries={NO_BANDS}
          scope={GLOBAL_SCOPE}
          idPrefix="sit-people"
          layout="line"
          only={PEOPLE_TOKENS}
          lead={PEOPLE_LEAD}
          label="Sign-in every cell assumes"
        />
        <TipDot text="Each cell is this sign-in for that person on that application, judged by the policies as they stand." label="About these answers" />
      </div>

      <div className="sitl-body">
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
          <div className={`btable-wrap sitl-wrap sitl-xwrap${more.left ? ' has-more-left' : ''}${more.right ? ' has-more-right' : ''}`}>
            <div ref={scroller} className="sitl-scroll sitl-xscroll">
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
                  {rows.map((r, i) => {
                    const open = () => onTry(r.person.id, firstDecidedApp(r.cells))
                    return (
                      <tr key={r.person.id} className={`sitl-row sitl-prow${session?.form.personId === r.person.id ? ' is-current' : ''}`} onClick={open}>
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
                          <td key={c.appId} className="sitl-pcell">
                            <Tip text={cellTip(c)} placement="bottom">
                              {/* The whole cell presses it (its ::after), and
                                  only this application is tried. */}
                              <button
                                type="button"
                                className="sitl-cellbtn"
                                aria-label={cellSaid(r.person, c)}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onTry(r.person.id, c.appId)
                                }}
                              >
                                {/* Keyed by the sentence's change, so a new answer
                                    fades in, a row after the row above. Opacity
                                    only, on motion: nothing in the stylesheet
                                    moves this span. */}
                                <motion.span
                                  key={judged}
                                  className="sitl-cell"
                                  initial={judged === 0 || reduced ? false : { opacity: 0.15 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ duration: 0.22, delay: reduced ? 0 : i * 0.03 }}
                                >
                                  <ResolutionAnswer res={c.res} />
                                </motion.span>
                              </button>
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
      </div>
      {people.length > 0 && <ListPager {...paged.pager} label="People pages" />}
    </div>
  )
}
