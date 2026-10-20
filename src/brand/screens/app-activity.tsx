import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUpRight, Copy, Eye, History, ListFilter, LogIn, X } from 'lucide-react'

import { CantTell, DecisionBadge } from '../decision-badge'
import { EmptyState, NoMatches } from '../empty'
import { Face } from '../faces'
import { FALLBACK_NAME, type App, type Policy } from '../data'
import { Badge, Button, IconButton, RowMenu, SearchBox, type MenuItem } from '../kit'
import { Picker, type PickerOption } from '../picker'
import { useBrand } from '../store'
import { appUserRows } from './app-people-tabs-model'
import {
  byRule,
  chainKeyOf,
  checkFormFor,
  decidedSaid,
  findPeople,
  revealTop,
  ruleChoices,
  ruleNamedIn,
  ruleSummary,
  whenSaid,
  type ChainKey,
  type RuleFilter,
} from './app-policy-model'
import { checkAccessFrom } from './guarded-moves'
import { ListPager } from './list-pager'
import { SAMPLE_DAY } from './monitor-sample'
import { containWhileScrolling } from './scroll-contain'
import { pageForRow, pageSlice } from './paged-list'
import { useSimEnv } from './sim-env'
import { NO_FILTER, activitySummaryOf, deviceSaid, filterActivity, signInActivity, type ActivityFilter, type ActivityRow } from './sign-in-tests/activity'
import { SignInRow } from './sign-in-tests/activity-row'
import { copyToClipboard } from './sign-in-tests/clipboard'
import { attemptsOnSaid, breakInOnApp, breakInSummary } from './break-in-app'
import { ACCESS_CHECK } from './sign-in-tests/names'
import { relativeTime } from './sign-in-tests/runs'
import { DENY_REASON_WORD } from './testing/deny-reason'
import { useTestingSession } from './testing/session-state'
import { formOf, todayIn } from './testing/sign-in-form'

/* -----------------------------------------------------------------------------
   An application's Policies tab, below its rules (docs/specs/APP-POLICY-TAB.md):
   what actually happened on this application (D), and what changed in its
   policy (E1). The break-in attempts (E3) are here too, kept behind their flag
   (app-policy-view.tsx `BREAK_IN_ON_APP`).

   Sign-in activity is the application's own modelled week — the same sample
   the Sign-in activity page lists (`appReport`, activity.ts), newest first.
   Each row's Rule opens that row of the chain above (`onRule`); a row opens
   in place on what decided it (sign-in-tests/activity-row.tsx). Finding a
   person says who decides for them and how, with Check access for them —
   which fills the form in and runs nothing until Run.

   At a glance (`GlanceActivity`, 20 Oct 2026) the same sign-ins are paged in a
   frame of fixed height, and a row is picked rather than opened in place.
   -------------------------------------------------------------------------- */

const SHOWN = 5

/* The words the whole page's Result filter uses (SignInActivity.tsx), in the tab's order. */
const RESULTS: PickerOption[] = [
  { value: 'all', label: 'All results' },
  { value: 'allowed', label: 'Allowed' },
  { value: 'blocked', label: 'Blocked' },
]

/** "Rule 2", "Nothing else matched", or the Global Default's name: the chain row a sign-in landed on. */
function ruleSaid(key: ChainKey, policy: Policy | null, globalDefault: Policy | null): string {
  if (key === 'default') return globalDefault?.name ?? ''
  if (key === 'last') return FALLBACK_NAME
  const rules = (policy ?? globalDefault)?.rules ?? []
  const i = rules.findIndex((r) => r.id === key)
  return i === -1 ? '' : `Rule ${i + 1}`
}

const stamp = (r: ActivityRow) => `${r.date} ${r.facts.when?.time ?? ''}`

/** This application's week alone — the same sample the page and the chain count — not every application's, newest first. */
function useSignIns(app: App): ActivityRow[] {
  const { policies } = useBrand()
  const env = useSimEnv()
  return useMemo(() => signInActivity(policies, env, SAMPLE_DAY, [app]).sort((a, b) => stamp(b).localeCompare(stamp(a))), [policies, env, app])
}

/* Where the tab's sign-ins lead, written once for both layouts. Both moves go ahead once the leave guard lets them
   (guarded-moves.ts). A person found fills Access checks' form in and plays nothing until Run (`prefill`); a past
   sign-in is loaded and played, as the Sign-in activity page's is. View all lists every sign-in of the application,
   with the way back to it. */
function useActivityActions(app: App, policy: Policy | null) {
  const store = useBrand()
  const { apps, zones, users, go } = store
  const session = useTestingSession()
  return {
    checkPerson: (personId: string) => checkAccessFrom(store, () => session.prefill(checkFormFor(app.id, policy, users, apps, todayIn(), personId))),
    openInChecks: (r: ActivityRow) => checkAccessFrom(store, () => session.load(formOf(r.facts, zones))),
    viewAll: () => go({ name: 'sign-in-activity', appId: app.id, from: { appId: app.id } }),
  }
}

export function AppActivity({
  app,
  policy,
  globalDefault,
  onRule,
  reduced,
}: {
  app: App
  /** The application's own policy, or null when only the Global Default decides. */
  policy: Policy | null
  globalDefault: Policy | null
  /** Opens that row of the chain above, and brings it into view. */
  onRule: (key: ChainKey) => void
  reduced: boolean
}) {
  const { policies, users, groups } = useBrand()
  const { checkPerson, openInChecks, viewAll } = useActivityActions(app, policy)
  const [q, setQ] = useState('')
  const [result, setResult] = useState<ActivityFilter['result']>('all')
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const rows = useSignIns(app)
  const shown = useMemo(() => filterActivity(rows, { ...NO_FILTER, appId: app.id, result, q }), [rows, app.id, result, q])
  const people = useMemo(() => findPeople(q, appUserRows(app.id, policies, users, groups), 3), [q, app.id, policies, users, groups])
  const listed = more ? shown : shown.slice(0, SHOWN)

  return (
    <section className="apol__sec apol__activity" aria-labelledby="apol-activity">
      <div className="apol__sechead">
        <h3 id="apol-activity">Sign-in activity</h3>
        {!app.addedAt && (
          <div className="apol__tools">
            <SearchBox value={q} onChange={setQ} placeholder="Find a person" label={`Find a person in ${app.name} sign-ins`} />
            <span className={`btoolbar__filter bbar__filter ${result !== 'all' ? 'is-set' : ''}`}>
              <Picker label="Filter by result" size="md" icon={ListFilter} prefix="Result" value={result} options={RESULTS} onChange={(v) => setResult(v as ActivityFilter['result'])} />
            </span>
            <Button variant="ghost" size="sm" iconRight={ArrowUpRight} onClick={viewAll}>
              View all<span className="u-sr-only"> sign-ins on {app.name}</span>
            </Button>
          </div>
        )}
      </div>

      {people.length > 0 && (
        <ul className="apol__people" aria-label="People found">
          {people.map((p) => (
            <li key={p.user.id} className="apol__person">
              <span className="apol__personsaid">
                <b>{p.user.name}</b>
                {p.decider && <span> · {p.decider.name}</span>}
                {p.reach && <span className="apol__muted"> · {p.reach}</span>}
              </span>
              <Button variant="secondary" size="sm" onClick={() => checkPerson(p.user.id)}>
                {ACCESS_CHECK}
                <span className="u-sr-only"> for {p.user.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {app.addedAt || rows.length === 0 ? (
        <EmptyState compact icon={History} title="No sign-ins yet" />
      ) : shown.length === 0 ? (
        <EmptyState compact icon={History} title="No sign-ins match" live />
      ) : (
        <div className="btable-wrap apol__table">
          <div className="btable__scroll">
            <table className="btable sia__table">
              <thead>
                <tr>
                  <th scope="col">Result</th>
                  <th scope="col">When</th>
                  <th scope="col">Person</th>
                  <th scope="col" className="apol__from">
                    From
                  </th>
                  <th scope="col">Rule</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((r) => {
                  const on = open === r.id
                  const key = chainKeyOf(r, policy, globalDefault)
                  const said = key ? ruleSaid(key, policy, globalDefault) : ''
                  return (
                    <SignInRow
                      key={r.id}
                      row={r}
                      open={on}
                      onToggle={() => setOpen(on ? null : r.id)}
                      when={whenSaid(r.date, r.facts.when?.time ?? '')}
                      colSpan={5}
                      onOpenInChecks={openInChecks}
                      tab
                      reduced={reduced}
                      cells={(toggle) => (
                        <>
                          <td>
                            <span className="apol__result">
                              {r.decision ? <DecisionBadge decision={r.decision} /> : <CantTell />}
                              {r.reason && <span className="apol__muted">{DENY_REASON_WORD[r.reason]}</span>}
                            </span>
                          </td>
                          <td className="sia__when">{toggle}</td>
                          <td>{r.who}</td>
                          <td className="sia__muted apol__from">{r.from}</td>
                          <td>
                            {key && said ? (
                              <button type="button" className="apol__link" onClick={() => onRule(key)}>
                                {said}
                              </button>
                            ) : null}
                          </td>
                        </>
                      )}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* No count: the rows are a sample, not the week's total. */}
      {shown.length > SHOWN && (
        <span className="apol__more">
          <Button variant="ghost" size="sm" expanded={more} onClick={() => setMore(!more)}>
            {more ? 'Show fewer' : 'Show more'}
          </Button>
        </span>
      )}
    </section>
  )
}

/* --- D at a glance (app-policy-view.tsx `APP_POLICY_GLANCE`, 20 Oct 2026) ------------------------------------

   The same sign-ins in a frame of fixed height beside the rules (owner, 19 Oct 2026: "add a fixed height for all
   the sections, add pagination … in Sign-in activity fix the table"). A bar — Find a person, Result, and Rule, which
   narrows the rows to one row of the chain — then `size` rows a page (the view's: as many as end above the fold, at
   most `GLANCE_ROWS`), then a foot with the pager. Nothing in the frame grows: a row no longer opens in place, which
   moved everything under it. A press picks the sign-in instead; the canvas beside it rings, opens and brings in the
   card that decided it, and the foot says what the open row said — why, or the device and its risk. Every row is one
   line, in the Sign-in activity page's order (owner, 20 Oct 2026: "fix the order of each item in the row"), and ends
   in its own menu — Open in Check access, Copy details — shown on hover, on focus and on the picked row (owner, 20
   Oct 2026: "add it to each list item on hover; use it as icon menu button").

   One tab stop for the table (the picked row, else the row last let go, else the page's first), then that row's
   menu; the arrow keys walk the rows and the pages, picking as they go, so the canvas follows. A new search, filter
   or page lets the pick go, since a pick must stay in sight. The rows are a sample: the pager's range is the one
   count of them on the tab. */
export function GlanceActivity({
  app,
  policy,
  globalDefault,
  rule,
  onRule,
  picked,
  onPick,
  size,
  onShowRule,
  reduced,
}: {
  app: App
  /** The application's own policy, or null when only the Global Default decides. */
  policy: Policy | null
  globalDefault: Policy | null
  /** The Rule filter, held by the view, which rings the card it names. */
  rule: RuleFilter
  onRule: (v: RuleFilter) => void
  /** The picked sign-in, held by the view, which traces it on the canvas. */
  picked: ActivityRow | null
  onPick: (r: ActivityRow | null) => void
  /** Rows a page, the view's (`glanceRows`): the frames' height is drawn from the same number. */
  size: number
  /** The panels stacked, the rules are out of sight above: each row's menu brings in the rule that decided it. */
  onShowRule?: (r: ActivityRow) => void
  reduced: boolean
}) {
  const { policies, users, groups, showToast } = useBrand()
  const { checkPerson, openInChecks, viewAll } = useActivityActions(app, policy)
  const rows = useSignIns(app)
  const [q, setQ] = useState('')
  const [result, setResult] = useState<ActivityFilter['result']>('all')
  const choices = useMemo(() => ruleChoices(policy, globalDefault), [policy, globalDefault])
  /* A rule that has left the policy narrows nothing. */
  const ruleOn: RuleFilter = choices.some((o) => o.value === rule) ? rule : 'all'
  const listed = useMemo(
    () => byRule(filterActivity(rows, { ...NO_FILTER, appId: app.id, result, q }), ruleOn, policy, globalDefault),
    [rows, app.id, result, q, ruleOn, policy, globalDefault],
  )
  const people = useMemo(() => findPeople(q, appUserRows(app.id, policies, users, groups), 3), [q, app.id, policies, users, groups])

  /* Back on page 1 whenever the search or a filter changes — derived, so the old page is never drawn first. The page
     size is the view's (`size`), not this list's own measure (`usePagedList`): the frame's height is drawn from it. A
     new size (the window changed) keeps the picked row on its page, else the first row the old page began with. */
  const sig = `${q}|${result}|${ruleOn}`
  const [paging, setPaging] = useState({ sig, page: 1, size })
  const pickedAt = picked ? listed.findIndex((r) => r.id === picked.id) : -1
  const at = paging.sig !== sig ? 1 : paging.size === size ? paging.page : pageForRow(pickedAt >= 0 ? pickedAt : (paging.page - 1) * paging.size, size)
  const pg = pageSlice(listed, at, size)
  const turn = (page: number) => {
    setPaging({ sig, page, size })
    onPick(null)
  }
  const search = (v: string) => {
    setQ(v)
    onPick(null)
  }
  const clearAll = () => {
    setQ('')
    setResult('all')
    onRule('all')
  }

  const shown = picked && pg.rows.some((r) => r.id === picked.id) ? picked : null
  /* The row a pick was let go on (Clear, Escape, a second press) stays the table's tab stop, so the button that holds
     focus is the one Tab comes back to. */
  const [home, setHome] = useState<string | null>(null)
  const stop = shown?.id ?? (home && pg.rows.some((r) => r.id === home) ? home : pg.rows[0]?.id)
  const body = useRef<HTMLDivElement>(null)
  /* The row the arrow keys moved to: focused once it is drawn (on the next page, if they turned it) and brought into
     the frame — the frame alone, never the page. */
  const focusTo = useRef<string | null>(null)
  useLayoutEffect(() => {
    const id = focusTo.current
    const box = body.current
    if (!id || !box) return
    focusTo.current = null
    const tr = box.querySelector<HTMLElement>(`tr[data-row="${CSS.escape(id)}"]`)
    if (!tr) return
    tr.querySelector<HTMLElement>('.apol__pick')?.focus({ preventScroll: true })
    const top = tr.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    const y = revealTop({ top, height: tr.offsetHeight }, { scrollTop: box.scrollTop, height: box.clientHeight }, parseFloat(getComputedStyle(box).scrollPaddingTop) || 0, 0)
    if (y !== null) box.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' })
  })
  /* The frame keeps the wheel only while its rows overflow it (scroll-contain.ts): its content changes only as it
     renders, so the panel itself is watched for a resize and the rest is checked after each render. */
  useEffect(() => {
    const box = body.current
    return box ? containWhileScrolling(box, []) : undefined
  }, [])
  useLayoutEffect(() => {
    const box = body.current
    box?.toggleAttribute('data-scrolls', box.scrollHeight > box.clientHeight + 1)
  })
  /* Let go of the pick, its row keeping the stop. From Clear, whose button goes with the pick, the focus goes back to
     that row's person (the layout effect above) rather than to the page. */
  const letGo = (id: string, refocus: boolean) => {
    setHome(id)
    if (refocus) focusTo.current = id
    onPick(null)
  }
  const press = (r: ActivityRow) => (picked?.id === r.id ? letGo(r.id, false) : onPick(r))
  const walk = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    /* Taken even at the list's ends, where they do nothing: the frame does not scroll under a row that holds focus. */
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) e.preventDefault()
    const to = (page: number, r: ActivityRow | undefined) => {
      if (!r) return
      if (page !== pg.page) setPaging({ sig, page, size })
      focusTo.current = r.id
      onPick(r)
    }
    const rowsOf = (page: number) => pageSlice(listed, page, size).rows
    if (e.key === 'ArrowDown') {
      if (i < pg.rows.length - 1) to(pg.page, pg.rows[i + 1])
      else if (pg.page < pg.pageCount) to(pg.page + 1, rowsOf(pg.page + 1)[0])
    } else if (e.key === 'ArrowUp') {
      if (i > 0) to(pg.page, pg.rows[i - 1])
      else if (pg.page > 1) to(pg.page - 1, rowsOf(pg.page - 1).at(-1))
    } else if (e.key === 'Home') to(pg.page, pg.rows[0])
    else if (e.key === 'End') to(pg.page, pg.rows.at(-1))
    else if (e.key === 'Escape' && picked) {
      e.preventDefault()
      letGo(pg.rows[i].id, false)
    }
  }
  /* What the open row said, on one line: why on a refusal, else the device and its risk — and the place, where the
     From column has gone (`.apol__pickfrom`). */
  const said = (r: ActivityRow) => (r.reason ? DENY_REASON_WORD[r.reason] : `${deviceSaid(r.facts.device)}${r.facts.risk ? ` · Risk ${r.facts.risk.score}` : ''}`)
  /* Each row's menu: what the open row's two buttons did, and — stacked, where the rules are out of sight above — the
     way to the rule that decided it. Neither of the first two picks the row. */
  const menuOf = (key: ChainKey | null): MenuItem[] => [
    ...(onShowRule && key ? [{ id: 'rule', label: 'Show rule', icon: Eye }] : []),
    { id: 'check', label: `Open in ${ACCESS_CHECK}`, icon: LogIn },
    { id: 'copy', label: 'Copy details', icon: Copy },
  ]
  const act = (r: ActivityRow, id: string) => {
    if (id === 'check') openInChecks(r)
    else if (id === 'copy') void copyToClipboard(activitySummaryOf(r)).then((ok) => showToast(ok ? 'Copied' : 'Could not copy the details'))
    else if (id === 'rule') onShowRule?.(r)
  }

  const sample = !app.addedAt
  return (
    <section className="apol__panel apol__activity" aria-labelledby="apol-activity">
      {/* The rules head's shape: a title, a quiet second word, one ghost ↗. */}
      <div className="apol__sechead apol__panelhead">
        <h3 id="apol-activity">Sign-in activity</h3>
        {sample && (
          <>
            <Badge tone="neutral">Sample</Badge>
            <span className="apol__push">
              <Button variant="ghost" size="sm" iconRight={ArrowUpRight} onClick={viewAll}>
                View all<span className="u-sr-only"> sign-ins on {app.name}</span>
              </Button>
            </span>
          </>
        )}
      </div>

      <div className={`btable-wrap apol__frame${sample ? ' has-bar has-foot' : ''}`}>
        {sample && (
          <div className="apol__bar">
            <SearchBox value={q} onChange={search} placeholder="Find a person" label={`Find a person in ${app.name} sign-ins`} />
            <span className={`btoolbar__filter bbar__filter ${result !== 'all' ? 'is-set' : ''}`}>
              <Picker
                label="Filter by result"
                size="md"
                width="fill"
                icon={ListFilter}
                prefix="Result"
                value={result}
                options={RESULTS}
                onChange={(v) => {
                  setResult(v as ActivityFilter['result'])
                  onPick(null)
                }}
              />
            </span>
            <span className={`btoolbar__filter bbar__filter apol__rulefilter ${ruleOn !== 'all' ? 'is-set' : ''}`}>
              <Picker
                label="Filter by rule"
                size="md"
                width="fill"
                prefix="Rule"
                value={ruleOn}
                options={choices}
                summary={ruleSummary(ruleOn, policy, globalDefault)}
                searchable={choices.length > 8}
                onChange={(v) => onRule(v as RuleFilter)}
              />
            </span>
          </div>
        )}

        <div className="apol__body apol__actbody" ref={body}>
          {/* Inside the frame, so a person found scrolls with the rows and never grows it. */}
          {people.length > 0 && (
            <ul className="apol__people" aria-label="People found">
              {people.map((p) => (
                <li key={p.user.id} className="apol__person">
                  <span className="apol__personsaid">
                    <b>{p.user.name}</b>
                    {p.decider && <span> · {p.decider.name}</span>}
                    {p.reach && <span className="apol__muted"> · {p.reach}</span>}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => checkPerson(p.user.id)}>
                    {ACCESS_CHECK}
                    <span className="u-sr-only"> for {p.user.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!sample || rows.length === 0 ? (
            <EmptyState compact icon={History} title="No sign-ins yet" />
          ) : listed.length === 0 ? (
            /* The title and the way back; no sentence explaining it. */
            <NoMatches compact noun="sign-ins" query={q} filtered={result !== 'all' || ruleOn !== 'all'} onClear={clearAll} blurb="" />
          ) : (
            <table className="btable sia__table apol__gtable" aria-labelledby="apol-activity">
              {/* The Sign-in activity page's order (SignInActivity.tsx): when, who, from where, then what happened and
                  the rule that did it; the row's menu last, in a narrow column of its own. */}
              <thead>
                <tr>
                  <th scope="col" className="apol__c-when">
                    When
                  </th>
                  <th scope="col" className="apol__c-who">
                    Person
                  </th>
                  <th scope="col" className="apol__from">
                    From
                  </th>
                  <th scope="col" className="apol__c-result">
                    Result
                  </th>
                  <th scope="col" className="apol__c-rule">
                    Rule
                  </th>
                  <th scope="col" className="btable__actions btable__col-actions apol__c-menu">
                    <span className="u-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((r, i) => {
                  const on = shown?.id === r.id
                  const key = chainKeyOf(r, policy, globalDefault)
                  const rowSaid = key ? ruleSaid(key, policy, globalDefault) : ''
                  const when = whenSaid(r.date, r.facts.when?.time ?? '')
                  return (
                    <tr
                      key={r.id}
                      data-row={r.id}
                      className={on ? 'is-picked' : undefined}
                      /* The whole row is the pointer's target; the keyboard's is the person's button, whose own press
                         arrives here too. The menu is not part of it: opening it picks nothing. */
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a, button:not(.apol__pick)')) return
                        press(r)
                      }}
                    >
                      <td>{when}</td>
                      <td>
                        <button
                          type="button"
                          className="apol__pick"
                          aria-pressed={on}
                          aria-label={`${r.who}, ${when}`}
                          tabIndex={r.id === stop ? 0 : -1}
                          onKeyDown={(e) => walk(e, i)}
                        >
                          {r.who}
                        </button>
                      </td>
                      <td className="sia__muted apol__from" title={r.from}>
                        {r.from}
                      </td>
                      <td title={r.reason ? DENY_REASON_WORD[r.reason] : undefined}>{r.decision ? <DecisionBadge decision={r.decision} /> : <CantTell />}</td>
                      {/* Plain text now: the row is the control, and picking it rings this rule on the canvas. */}
                      <td title={rowSaid || undefined}>{rowSaid}</td>
                      {/* The table's one stop leads on to its row's menu, and no other row's. */}
                      <td className="btable__actions apol__c-menu">
                        <RowMenu label={`Actions for ${r.who}, ${when}`} items={menuOf(key)} onSelect={(id) => act(r, id)} tabIndex={r.id === stop ? 0 : -1} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {sample && (
          <div className={`apol__foot apol__actfoot${shown ? ' is-picked' : ''}`}>
            {/* The pick's own line: let it go, and what the open row said. Its ways on are in the row's menu. */}
            {shown && (
              <>
                <IconButton icon={X} size="sm" tone="ghost" label="Clear selection" onClick={() => letGo(shown.id, true)} />
                <span className="apol__picksaid" title={said(shown)}>
                  {said(shown)}
                  <span className="apol__pickfrom"> · {shown.from}</span>
                </span>
              </>
            )}
            <ListPager
              start={pg.start}
              end={pg.end}
              total={pg.total}
              page={pg.page}
              pageCount={pg.pageCount}
              onPrev={() => turn(pg.page - 1)}
              onNext={() => turn(pg.page + 1)}
              label="Sign-in pages"
            />
            {/* What decided the picked sign-in, for a screen reader: the canvas's ring is for the eye. */}
            <p className="u-sr-only" role="status">
              {shown ? decidedSaid(shown) : ''}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

/* --- Changes: its policy's recent edits, newest first ----------------------------

   Three, then the rest in place up to ten. A line that quotes one of the
   policy's rules by its name links to that row of the chain. */
const CHANGES_SHOWN = 3
const CHANGES_MAX = 10

export function AppChanges({ policy, appId, onRule }: { policy: Policy; /** The application the tab is on: View all's way back. */ appId: string; onRule: (ruleId: string) => void }) {
  const { changeLog, go } = useBrand()
  const [all, setAll] = useState(false)
  const entries = useMemo(() => changeLog.filter((c) => c.policyId === policy.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, CHANGES_MAX), [changeLog, policy.id])
  const shown = all ? entries : entries.slice(0, CHANGES_SHOWN)
  const now = new Date()

  /* The link holds the name with its quotes: found by its quoted form, so a rename's old name ("“Contractors on a
     corporate device” renamed to “Contractors”") is never mistaken for it, and an opening quote is never left at a
     line's end apart from the name it opens. */
  const line = (text: string) => {
    const name = ruleNamedIn(text, policy)
    const rule = name ? policy.rules.find((r) => r.name === name) : undefined
    const quoted = `“${name}”`
    const at = name ? text.indexOf(quoted) : -1
    if (!name || !rule || at === -1) return text
    return (
      <>
        {text.slice(0, at)}
        <button type="button" className="apol__link" onClick={() => onRule(rule.id)}>
          {quoted}
        </button>
        {text.slice(at + quoted.length)}
      </>
    )
  }

  return (
    <section className="apol__sec" aria-labelledby="apol-changes">
      <div className="apol__sechead">
        <h3 id="apol-changes">Changes</h3>
        <Button variant="ghost" size="sm" iconRight={ArrowUpRight} onClick={() => go({ name: 'sign-in-activity', view: 'changes', q: policy.name, from: { appId } })}>
          View all<span className="u-sr-only"> changes to {policy.name}</span>
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="apol__quiet">No changes yet.</p>
      ) : (
        <ol className="apol__changes">
          {shown.map((c) => (
            <li key={c.id} className="apol__change">
              <span className="apol__changehead">
                <Face kind="user" name={c.by} size="sm" decorative />
                <span className="apol__by">{c.by}</span>
                <span className="apol__ago">{relativeTime(c.at, now)}</span>
              </span>
              {c.lines.map((l, i) => (
                <span key={`${c.id}-${i}`} className="apol__changeline">
                  {line(l)}
                </span>
              ))}
            </li>
          ))}
        </ol>
      )}
      {entries.length > CHANGES_SHOWN && (
        <span className="apol__more">
          <Button variant="ghost" size="sm" expanded={all} onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : 'Show all'}
          </Button>
        </span>
      )}
    </section>
  )
}

/* --- Break-in attempts on this application, and the ones worth a look first. ----- */
export function AppBreakIn({ appId, appName }: { appId: string; appName: string }) {
  const { policies, go } = useBrand()
  const env = useSimEnv()
  const summary = useMemo(() => breakInSummary(breakInOnApp(policies, appId, env), { appName: () => appName }), [policies, appId, env, appName])
  const { counts, holes } = summary
  return (
    <section className="insp__block" aria-label="Break-in attempts">
      <div className="insp__blockhead">
        <h3>{attemptsOnSaid(appName)}</h3>
        <span className="insp__secmeta">
          <Button variant="ghost" size="sm" onClick={() => go({ name: 'sign-in-tests' })}>
            Open Access checks
          </Button>
        </span>
      </div>
      <p className="insp__note">
        {holes > 0 ? `${counts.gotThrough + counts.weakerFactor + counts.lessThanAsked} got through or in on less.` : 'None got through.'}
      </p>
      {summary.top && summary.top.length > 0 && (
        /* The inspector's fact list (PeekViews.tsx): a term and its value per pair, no list inside it. */
        <dl className="insp__facts">
          {summary.top.map((t) => (
            <div key={t.id} className="insp__fact">
              <dt>{t.got ? 'Got in' : 'Held'}</dt>
              <dd>{t.name}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
