import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { BookmarkCheck, Check, ListFilter, LogIn, Play, Plus, Trash2 } from 'lucide-react'

import { CantTell, DecisionBadge } from '../../decision-badge'
import { EmptyState, NoMatches } from '../../empty'
import { Badge, Button, RowMenu, SearchBox, Tip } from '../../kit'
import { Picker } from '../../picker'
import { LEVEL_LABEL, type SavedSignIn } from '../../saved-sign-ins'
import { useBrand } from '../../store'
import { ConfirmDelete } from '../confirm-delete'
import { ListPager } from '../list-pager'
import { PageBar } from '../page-bar'
import { usePagedList } from '../paged-list'
import { useSimEnv } from '../sim-env'
import type { TenantResolution } from '../tenant-resolver'
import { LEVEL_FILTER, savedRows, type LevelFilter, type SavedRow } from '../testing/selectors'
import { formOf, formSummary, type SignInForm } from '../testing/sign-in-form'
import {
  LIBRARY_MIN_ROWS,
  SAVED_ROW_H,
  appFilterOptions,
  decidedByOf,
  filterLibrary,
  filtered,
  libraryMemory,
  runAllSaid,
  savedRowSaid,
  seedLastRun,
  sentenceLine,
  takeRun,
  useKeptPage,
  type AppFilter,
  type LibraryRow,
} from './library'
import './library.css'

/* -----------------------------------------------------------------------------
   Sign-in tests → Saved sign-ins: the tenant's whole library (V4 §3.1).

   Every saved sign-in, whatever application it is on, judged as the tenant
   stands. A policy's board shows only the ones on its own applications; this
   is where all of them are kept, filtered and deleted.

     Sign-in      the name, and the sentence under it in grey — who, where
                  to, from where, on what
     Expected     what somebody promised it gets
     Now          what it gets, and whether that is the promise: a Fail is
                  the red badge, a pass a quiet check, and a sign-in that
                  can't be told grey words, never a pass. The answer has a
                  track of its own, as wide as the widest badge, so Pass and
                  Fail start at one edge down the column
     Level        how hard a change may push against it, as a neutral pill
     Decided by   the policy that answers it now, a link to its board —
                  the kit's link button, like every link-style button

   The sign-in's line is cut to the column; its tip (the whole sign-in, in
   the sign-in bar's words) opens on the name as well as the line, so a
   keyboard reaches it: focused, the name is described by the line and the
   tip.

   Sorted the way `savedRows` sorts — failing first, then Can't tell, then
   passing; the strongest level first within each; then by name — so the row
   that needs looking at is the top one. Paged to the window like every
   library list (paged-list.ts).

   Run all re-judges every row. The rows are live — an edit anywhere in the
   tenant re-judges them already — so what Run all adds is the telling: the
   rows re-settle one after another (30 ms apart) and each one that moved
   since the last run (or since this tab first drew in the session) flashes an
   accent edge. The status region says the same in words, every run — its
   words are keyed by the run, so the same sentence twice is heard twice.
   Under reduced motion the rows settle at once and nothing flashes; the words
   are still said.

   The last run, the search, the filters and the page are the library's
   memory (library.ts), not this component's: a Try from a row switches to the
   Try tab and unmounts this one, and coming back finds the table as it was
   left, and a Run all after editing a policy elsewhere flashes what the edit
   moved.

   Delete keeps the library's rules (SavedView.tsx): a hard delete through
   ConfirmDelete, and a Protected sign-in asks for the typed DELETE first.
   -------------------------------------------------------------------------- */

export function SavedTable({ onTry, onNew }: { onTry: (form: SignInForm) => void; onNew: () => void }) {
  const { savedSignIns, policies, zones, users, apps, removeSavedSignIn, showToast, go, persona } = useBrand()
  const env = useSimEnv()
  const reduced = useReducedMotion() === true
  const mem = libraryMemory(persona)

  const [query, setQuery] = useState(mem.saved.query)
  const [appId, setAppId] = useState<AppFilter>(mem.saved.appId)
  const [level, setLevel] = useState<LevelFilter>(mem.saved.level)
  useEffect(() => {
    Object.assign(mem.saved, { query, appId, level })
  }, [mem, query, appId, level])

  const judged = useMemo(() => savedRows(savedSignIns, policies, env), [savedSignIns, policies, env])
  const ctx = useMemo(() => ({ people: users, apps, zones }), [users, apps, zones])
  const all = useMemo<LibraryRow[]>(() => judged.map((row) => ({ row, line: sentenceLine(formOf(row.saved.facts, zones), ctx) })), [judged, zones, ctx])
  const shown = useMemo(() => filterLibrary(all, { query, appId, level }), [all, query, appId, level])
  const appOptions = useMemo(() => appFilterOptions(savedSignIns, apps), [savedSignIns, apps])
  /* A filter on an application nothing is saved on any more reads as All. */
  const appShown = appOptions.some((o) => o.value === appId) ? appId : 'all'
  useEffect(() => {
    if (appShown !== appId) setAppId(appShown)
  }, [appShown, appId])

  const paged = usePagedList(shown, { rowHeight: SAVED_ROW_H, resetKey: [query, appId, level], minRows: LIBRARY_MIN_ROWS })
  useKeptPage(paged, shown, (r) => r.row.saved.id, mem.saved)

  /* The last run is the memory's: what every row said at the last Run all, or
     — before the first — when this tab first drew in the session. Here, which
     rows the latest run flashed, and how many runs this visit, so each run
     remounts the flash, replays the settle and is said again. */
  useState(() => {
    seedLastRun(mem, judged)
    return null
  })
  const [run, setRun] = useState(0)
  const [flash, setFlash] = useState<ReadonlySet<string>>(() => new Set())
  const [said, setSaid] = useState('')
  const runAll = () => {
    const moved = takeRun(mem, judged)
    setFlash(moved)
    setRun((n) => n + 1)
    setSaid(runAllSaid(judged, moved.size))
  }

  const [deleting, setDeleting] = useState<SavedSignIn | null>(null)
  const [confirming, setConfirming] = useState(false)
  const remove = (s: SavedSignIn) => {
    removeSavedSignIn(s.id)
    setConfirming(false)
    showToast(`${s.name} deleted`)
  }

  const tryIt = (s: SavedSignIn) => onTry(formOf(s.facts, zones))
  const uid = useId()
  const clear = () => {
    setQuery('')
    setAppId('all')
    setLevel('all')
  }

  if (savedSignIns.length === 0) {
    return (
      <div className="sitl">
        <EmptyState
          icon={BookmarkCheck}
          title="No saved sign-ins"
          action={
            <Button variant="brand" icon={Plus} onClick={onNew}>
              New sign-in
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="sitl">
      <PageBar
        left={
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search saved sign-ins…" label="Search saved sign-ins" />
            <span className={`btoolbar__filter bbar__filter ${appShown !== 'all' ? 'is-set' : ''}`}>
              <Picker label="Filter by application" size="md" icon={ListFilter} prefix="Application" value={appShown} options={appOptions} onChange={(v) => setAppId(v)} />
            </span>
            <span className={`btoolbar__filter bbar__filter ${level !== 'all' ? 'is-set' : ''}`}>
              <Picker label="Filter by level" size="md" icon={ListFilter} prefix="Level" value={level} options={LEVEL_FILTER} onChange={(v) => setLevel(v as LevelFilter)} />
            </span>
          </>
        }
        right={
          <>
            <Button variant="secondary" icon={Play} onClick={runAll}>
              Run all
            </Button>
            <Button variant="brand" icon={Plus} onClick={onNew}>
              New sign-in
            </Button>
          </>
        }
      />
      <span className="u-sr-only" role="status">
        <span key={run}>{said}</span>
      </span>

      {/* The rows' own box grows into the free height, so the pager after it
          sits on the window's bottom edge — with no auto margin, which the
          paged-list hook would count as space the pager takes. */}
      <div className="sitl-body">
        {shown.length === 0 ? (
          <NoMatches noun="saved sign-ins" query={query} filtered={filtered({ appId: appShown, level })} onClear={clear} />
        ) : (
          <div className="btable-wrap sitl-wrap">
            <div className="sitl-scroll">
              <table className="sitl-table sitl-saved">
                <caption className="u-sr-only">Saved sign-ins</caption>
                <colgroup>
                  <col />
                  <col className="sitl-c-decision" />
                  <col className="sitl-c-now" />
                  <col className="sitl-c-level" />
                  <col className="sitl-c-by" />
                  <col className="sitl-c-menu" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Sign-in</th>
                    <th scope="col">Expected</th>
                    <th scope="col">Now</th>
                    <th scope="col">Level</th>
                    <th scope="col">Decided by</th>
                    <th scope="col" className="sitl-menu">
                      <span className="u-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody ref={paged.listRef}>
                  {paged.pageRows.map(({ row: r, line }, i) => {
                    const by = decidedByOf(r.res)
                    /* Each cell's content re-settles on a run, 30 ms after the
                       row above: a wrapper keyed by the run, never the motion
                       row, whose transform is its layout's. */
                    const settle = (content: ReactNode) => (
                      <Settle run={run} index={i} reduced={reduced}>
                        {content}
                      </Settle>
                    )
                    return (
                      <motion.tr key={r.saved.id} layout="position" transition={{ duration: reduced ? 0 : 0.2 }} className={`sitl-row is-${r.result}`}>
                        <td className="sitl-first">
                          {flash.has(r.saved.id) && !reduced && <span key={`flash-${run}`} className="sitl-flash" aria-hidden />}
                          {settle(
                            <Tip text={formSummary(formOf(r.saved.facts, zones), zones)} placement="bottom">
                              <span className="sitl-signin">
                                <button
                                  type="button"
                                  className="sitl-name"
                                  aria-label={`${savedRowSaid(r)}. Try this sign-in`}
                                  aria-describedby={`${uid}-${r.saved.id}`}
                                  onClick={() => tryIt(r.saved)}
                                >
                                  {r.saved.name}
                                </button>
                                <span id={`${uid}-${r.saved.id}`} className="sitl-line">
                                  {line}
                                </span>
                              </span>
                            </Tip>,
                          )}
                        </td>
                        <td>{settle(<DecisionBadge decision={r.saved.expected} />)}</td>
                        <td>
                          {settle(
                            <span className="sitl-now">
                              <ResolutionAnswer res={r.res} />
                              <Result row={r} />
                            </span>,
                          )}
                        </td>
                        <td>{settle(<Badge tone="neutral">{LEVEL_LABEL[r.saved.level]}</Badge>)}</td>
                        <td>
                          {settle(
                            by ? (
                              <span className="sitl-by">
                                <Button variant="link" title={by.name} onClick={() => go({ name: 'board', policyId: by.policyId })}>
                                  {by.name}
                                </Button>
                              </span>
                            ) : (
                              <span className="sitl-muted">No policy decides</span>
                            ),
                          )}
                        </td>
                        <td className="sitl-menu">
                          <RowMenu
                            label={`Actions for ${r.saved.name}`}
                            items={[
                              { id: 'try', label: 'Try', icon: LogIn },
                              { id: 'delete', label: 'Delete', icon: Trash2, danger: true, divide: true },
                            ]}
                            onSelect={(id) => {
                              if (id === 'try') tryIt(r.saved)
                              else {
                                setDeleting(r.saved)
                                setConfirming(true)
                              }
                            }}
                          />
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {shown.length > 0 && <ListPager {...paged.pager} label="Saved sign-in pages" />}

      <ConfirmDelete
        open={confirming}
        name={deleting?.name ?? ''}
        noun="saved sign-in"
        requireTyped={deleting?.level === 'protected'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => deleting && remove(deleting)}
      />
    </div>
  )
}

/* One cell's content, faded back in on a run, `index` rows after the first.
   Nothing plays on the first draw or under reduced motion. */
function Settle({ run, index, reduced, children }: { run: number; index: number; reduced: boolean; children: ReactNode }) {
  return (
    <motion.span
      key={run}
      className="sitl-settle"
      initial={run === 0 || reduced ? false : { opacity: 0.25 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, delay: reduced ? 0 : index * 0.03 }}
    >
      {children}
    </motion.span>
  )
}

/* Fail as the kit's red badge — a failed check is one of the two places
   colour is allowed — and a pass as a quiet check and the word. A sign-in
   that can't be told has its grey words from `ResolutionAnswer` already, and is never
   a pass. */
function Result({ row }: { row: Pick<SavedRow, 'result'> }) {
  if (row.result === 'fail') return <Badge tone="negative">Fail</Badge>
  if (row.result === 'pass')
    return (
      <span className="sitl-pass">
        <Check size={13} strokeWidth={2.4} aria-hidden />
        Pass
      </span>
    )
  return null
}

/** A resolution's answer: its decision as the badge, or grey Can't tell — never a badge. Shared by the library's tables. */
export function ResolutionAnswer({ res }: { res: Pick<TenantResolution, 'status' | 'decision'> }) {
  return res.status === 'decided' && res.decision ? <DecisionBadge decision={res.decision} /> : <CantTell />
}
