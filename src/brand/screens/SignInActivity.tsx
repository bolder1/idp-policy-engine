import { Download, History, ListChecks, ListFilter, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CantTell, DecisionBadge } from '../decision-badge'
import { EmptyState } from '../empty'
import { Badge, Button, SearchBox, Tabs, TipDot } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { Picker, type PickerOption } from '../picker'
import { PageHead } from '../Shell'
import { useBrand } from '../store'
import { SAMPLE_DAY } from './monitor-sample'
import { PageBar } from './page-bar'
import { useSimEnv } from './sim-env'
import { NO_FILTER, activityCsv, changesCsv, filterActivity, reasonCounts, signInActivity, type ActivityFilter, type ActivityRow } from './sign-in-tests/activity'
import { SignInRow } from './sign-in-tests/activity-row'
import { relativeTime } from './sign-in-tests/runs'
import { DENY_REASON_WORD } from './testing/deny-reason'
import { useTestingSession } from './testing/session-state'
import { formOf } from './testing/sign-in-form'
import './sign-in-tests/sign-in-activity.css'

/* -----------------------------------------------------------------------------
   Sign-in activity: the week's sign-ins across every application, and why any
   were refused (the design repo's "investigate a failed sign-in", Journey 4).

     HEAD   the title, a way back to Policies.
     BAR    search, Result, Reason, Application.
     TABLE  when, person, application, from, result, reason, decided by.
     DETAIL a row opens in place: what decided it, the reason with its
            reference, Open in Access checks (the same sign-in in the form,
            for Run to play) and Copy summary for a ticket.

   A sample, and it says so: the sign-ins are modelled (test-dock.ts), not read
   from a log this prototype does not have. The reason is admin and help desk
   only (owner, 5 Oct 2026) — this page is theirs.
   -------------------------------------------------------------------------- */

const RESULTS: PickerOption[] = [
  { value: 'all', label: 'All results' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'allowed', label: 'Allowed' },
]

/** Save text as a file: a link to a blob, pressed and let go. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

type View = 'sign-ins' | 'changes'
const VIEWS: { value: View; label: string; icon: LucideIcon }[] = [
  { value: 'sign-ins', label: 'Sign-ins', icon: ListChecks },
  { value: 'changes', label: 'Policy changes', icon: History },
]

/* The route's way in (spec APP-POLICY-TAB.md §8.1): an application's Policies tab opens it narrowed to that
   application with every result, or on Policy changes searched for its policy. Read once, on arrival; from there
   the filters are the page's own. Opened anywhere else, it starts on the blocked sign-ins, as it always has. */
export function SignInActivity({ appId, view: startView, q, from }: { appId?: string; view?: View; q?: string; from?: { appId: string } } = {}) {
  const { policies, apps, zones, go, changeLog } = useBrand()
  /* Opened from an application's Policies tab: the crumb goes back there while the application exists, else to Policies. */
  const fromApp = from ? apps.find((a) => a.id === from.appId) : undefined
  const crumb = fromApp
    ? { label: fromApp.name, onClick: () => go({ name: 'application', appId: fromApp.id, tab: 'policies' }) }
    : { label: 'Policies', onClick: () => go({ name: 'policies' }) }
  const [view, setView] = useState<View>(startView ?? 'sign-ins')
  const env = useSimEnv()
  const session = useTestingSession()
  const rows = useMemo(() => signInActivity(policies, env, SAMPLE_DAY, apps), [policies, env, apps])
  const [filter, setFilter] = useState<ActivityFilter>({ ...NO_FILTER, q: q ?? '', appId: appId ?? 'all', result: appId ? 'all' : 'blocked' })
  const [open, setOpen] = useState<string | null>(null)
  const shown = useMemo(() => filterActivity(rows, filter), [rows, filter])
  /* Counted over the sign-ins the application and the search leave — the rows a chip narrows — so a page opened on one
     application says that application's reasons, not the tenant's. */
  const why = useMemo(() => reasonCounts(filterActivity(rows, { ...NO_FILTER, appId: filter.appId, q: filter.q })), [rows, filter.appId, filter.q])
  const changes = useMemo(() => {
    const needle = filter.q.trim().toLowerCase()
    return changeLog.filter((c) => !needle || `${c.policyName} ${c.by} ${c.lines.join(' ')}`.toLowerCase().includes(needle))
  }, [changeLog, filter.q])
  const set = (p: Partial<ActivityFilter>) => setFilter((f) => ({ ...f, ...p }))

  const appOptions: PickerOption[] = useMemo(
    () => [{ value: 'all', label: 'All applications' }, ...apps.filter((a) => rows.some((r) => r.appId === a.id)).map((a) => ({ value: a.id, label: a.name }))],
    [apps, rows],
  )

  const openInChecks = (r: ActivityRow) => {
    session.load(formOf(r.facts, zones))
    go({ name: 'sign-in-tests' })
  }

  return (
    <div className="bpage sia">
      <PageHead
        title="Sign-in activity"
        caption="The week’s sign-ins across every application, and why any were refused."
        crumb={crumb}
      />
      <Tabs<View> className="bx-tabs--line sia__tabs" name="View" value={view} onChange={setView} options={VIEWS} />
      <PageBar
        left={
          <>
            <SearchBox value={filter.q} onChange={(q) => set({ q })} placeholder={view === 'sign-ins' ? 'Search by person, application or place…' : 'Search by policy, person or change…'} label="Search sign-in activity" />
            {view === 'sign-ins' && (
              <span className={`btoolbar__filter bbar__filter ${filter.result !== 'all' ? 'is-set' : ''}`}>
                <Picker label="Filter by result" size="md" icon={ListFilter} prefix="Result" value={filter.result} options={RESULTS} onChange={(v) => set({ result: v as ActivityFilter['result'] })} />
              </span>
            )}
            {view === 'sign-ins' && (
            <span className={`btoolbar__filter bbar__filter ${filter.appId !== 'all' ? 'is-set' : ''}`}>
              <Picker label="Filter by application" size="md" prefix="Application" value={filter.appId} options={appOptions} onChange={(v) => set({ appId: v })} searchable />
            </span>
            )}
          </>
        }
        right={
          <>
            <Button variant="secondary" icon={Download} onClick={() => (view === 'sign-ins' ? download('sign-in-activity.csv', activityCsv(shown)) : download('policy-changes.csv', changesCsv(changes)))}>
              Export
            </Button>
            <Badge tone="neutral">Sample</Badge>
            <TipDot text="Modelled sign-ins on every application, from eight places. Nothing is read from real sign-ins." label="About the sample" />
          </>
        }
      />

      {view === 'sign-ins' && why.length > 0 && (
        <div className="sia__why" role="group" aria-label="Why they were blocked">
          <span className="sia__whylabel">Why they were blocked</span>
          {why.map((w) => (
            <button key={w.reason} type="button" className="sia__chip" aria-pressed={filter.reason === w.reason} onClick={() => set({ reason: filter.reason === w.reason ? 'all' : w.reason, result: 'blocked' })}>
              {DENY_REASON_WORD[w.reason]}
              <span className="sia__chipn">{w.count}</span>
            </button>
          ))}
        </div>
      )}

      {view === 'changes' && (
        <div className="btable-wrap">
          {changes.length > 0 ? (
            <div className="btable__scroll">
              <table className="btable sia__table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Policy</th>
                    <th scope="col">By</th>
                    <th scope="col">What changed</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id}>
                      <td className="sia__when">{relativeTime(c.at, new Date())}</td>
                      <td>{c.policyName}</td>
                      <td>{c.by}</td>
                      <td className="sia__muted">{c.lines.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact icon={History} title="No changes yet" />
          )}
        </div>
      )}

      {view === 'sign-ins' && (
      <div className="btable-wrap">
        {shown.length > 0 ? (
          <div className="btable__scroll">
            <table className="btable sia__table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Person</th>
                  <th scope="col">Application</th>
                  <th scope="col">From</th>
                  <th scope="col">Result</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const on = open === r.id
                  return (
                    <SignInRow
                      key={r.id}
                      row={r}
                      open={on}
                      onToggle={() => setOpen(on ? null : r.id)}
                      when={r.when}
                      colSpan={6}
                      onOpenInChecks={openInChecks}
                      cells={(toggle) => (
                        <>
                          <td className="sia__when">{toggle}</td>
                          <td>{r.who}</td>
                          <td>
                            <span className="sia__app">
                              <AppLogo appId={r.appId} name={r.app} size={16} />
                              {r.app}
                            </span>
                          </td>
                          <td className="sia__muted">{r.from}</td>
                          <td>{r.decision ? <DecisionBadge decision={r.decision} /> : <CantTell />}</td>
                          <td className="sia__muted">{r.reason ? DENY_REASON_WORD[r.reason] : ''}</td>
                        </>
                      )}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact icon={History} title="No sign-ins match" />
        )}
        <footer className="btable__foot">{shown.length === rows.length ? `${rows.length} sign-ins` : `${shown.length} of ${rows.length} sign-ins`}</footer>
      </div>
      )}
    </div>
  )
}
