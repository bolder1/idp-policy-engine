import { ArrowUpRight, ChevronRight, Download, History, ListChecks, ListFilter, type LucideIcon } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'

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
import { CopyText } from './sign-in-tests/CopyText'
import { NO_FILTER, activityCsv, activitySummaryOf, changesCsv, filterActivity, reasonCounts, signInActivity, type ActivityFilter, type ActivityRow } from './sign-in-tests/activity'
import { ACCESS_CHECK } from './sign-in-tests/names'
import { relativeTime } from './sign-in-tests/runs'
import { DENY_REASON_WORD, denyRef } from './testing/deny-reason'
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

export function SignInActivity() {
  const { policies, apps, zones, go, changeLog } = useBrand()
  const [view, setView] = useState<View>('sign-ins')
  const env = useSimEnv()
  const session = useTestingSession()
  const rows = useMemo(() => signInActivity(policies, env, SAMPLE_DAY, apps), [policies, env, apps])
  const [filter, setFilter] = useState<ActivityFilter>({ ...NO_FILTER, result: 'blocked' })
  const [open, setOpen] = useState<string | null>(null)
  const shown = useMemo(() => filterActivity(rows, filter), [rows, filter])
  const why = useMemo(() => reasonCounts(rows), [rows])
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
        crumb={{ label: 'Policies', onClick: () => go({ name: 'policies' }) }}
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
                    <Fragment key={r.id}>
                      <tr className={`sia__row${on ? ' is-open' : ''}`}>
                        <td className="sia__when">
                          <button type="button" className="sia__toggle" aria-expanded={on} aria-label={`${r.who} on ${r.app}, ${r.when}. Show details`} onClick={() => setOpen(on ? null : r.id)}>
                            <ChevronRight size={14} strokeWidth={2} aria-hidden className="sia__chev" />
                            {r.when}
                          </button>
                        </td>
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
                      </tr>
                      {on && (
                        <tr className="sia__detail">
                          <td colSpan={6}>
                            <div className="sia__panel">
                              <dl className="sia__lines">
                                {r.policyName && (
                                  <div>
                                    <dt>Decided by</dt>
                                    <dd>
                                      {r.policyName}
                                      {r.ruleLine && <span className="sia__muted"> · {r.ruleLine}</span>}
                                    </dd>
                                  </div>
                                )}
                                {r.reason && (
                                  <div>
                                    <dt>Reason</dt>
                                    <dd>
                                      {DENY_REASON_WORD[r.reason]} <span className="sia__muted">· {denyRef(r.reason)}</span>
                                    </dd>
                                  </div>
                                )}
                              </dl>
                              <div className="sia__acts">
                                <Button variant="secondary" size="sm" iconRight={ArrowUpRight} onClick={() => openInChecks(r)}>
                                  Open in {ACCESS_CHECK}
                                </Button>
                                <CopyText text={activitySummaryOf(r)} className="bb__act sia__copy" />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
