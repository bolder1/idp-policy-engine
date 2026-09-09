import { AnimatePresence, motion } from 'motion/react'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { BookmarkPlus, Copy, Pencil, Plus, Trash2, Waypoints } from 'lucide-react'

import { PageHead } from '../Shell'
import { Coverage } from './Coverage'
import { AppLogo } from '../logos/AppLogo'
import { Badge, Button, Modal, SearchBox, StatusPill } from '../kit'
import { Picker } from '../picker'
import { appsLabel, appsOf, blankPolicy, enforces, type Policy, type PolicyType } from '../data'
import { NewPolicyDialog } from '../create/NewPolicyDialog'
import { useBrand } from '../store'
import { NoResults } from '../empty'
import { runGauntlet, type GauntletResult } from './gauntlet'
import type { SimEnv } from './simulate'

/* Mounted only while it is open — the list is the landing screen and does not
   need the interview's questions, composer and figures in its chunk. */
const Interview = lazy(() => import('../create/Interview').then((m) => ({ default: m.Interview })))

/* -----------------------------------------------------------------------------
   Policies — the list.

   Same columns, same filters, same row actions as the console ships today. The
   changes are all craft: brand surfaces, sortable headers, a visible row count,
   and — the one real fix — the bare red dot now says what the configuration
   problem actually is instead of just asserting there is one.
   -------------------------------------------------------------------------- */

type SortKey = 'name' | 'type' | 'rules' | 'modified' | 'exposure'

/* -----------------------------------------------------------------------------
   Exposure.

   The gauntlet answers "what gets through this policy", and until now it
   answered it one policy at a time, inside a dialog inside a builder. That is
   the wrong altitude for the question an administrator actually has, which is
   "which of my nine policies has a hole in it".

   So the deck runs against every row. The column shows the finding rather than
   the letter — "5 got through" is actionable where "F" is a thing to feel bad
   about — and clicking it lands you in the gauntlet for that policy rather than
   merely near it.

   Cheap enough to do on every render: nine policies × thirteen cards × a
   handful of rules is a few hundred condition evaluations, and it is memoised
   on the policy list anyway.
   -------------------------------------------------------------------------- */
function exposureOf(r: GauntletResult) {
  if (r.breaches > 0) return { tone: 'bad' as const, label: `${r.breaches} got through`, rank: 3 }
  if (r.lockouts > 0) return { tone: 'warn' as const, label: `${r.lockouts} locked out`, rank: 2 }
  if (r.friction > 2) return { tone: 'notice' as const, label: `${r.friction} over-challenged`, rank: 1 }
  return { tone: 'ok' as const, label: 'Nothing got through', rank: 0 }
}

/* -----------------------------------------------------------------------------
   The rules cell.

   It used to print the count and then one chip per distinct outcome — "5 rules ·
   Deny · MFA · Allow". Three chips on every row, and between them they said only
   that the policy contains a mix, not which rule does what or in what order.
   With order being the whole semantics of this engine, a set of outcomes is the
   one summary that cannot be read back into anything useful.

   So the cell is the count, and pointing at it opens the actual stack.

   Rendered through a portal because .btable__scroll is an overflow-x container:
   anything absolutely positioned inside it gets clipped at the cell, and worse,
   widens the horizontal scroll. Fixed coordinates measured off the trigger are
   the only placement that survives that.
   -------------------------------------------------------------------------- */


/* `RulePeek` stood here — the rules count with the stack behind it on hover.

   The column it filled is gone: Type, Rules and Last modified came off this
   table, which leaves the name, the application it protects, whether it is on
   and what it is exposed to. `Peek` itself stays in peek.tsx, where zones and
   device profiles use it for their own Used-by columns. */


const TYPE_FILTERS: (PolicyType | 'All')[] = ['All', 'App Access', 'Session', 'Account Management']

export function Policies() {
  const store = useBrand()
  const [view, setView] = useState<'list' | 'coverage'>('list')
  const [type, setType] = useState<PolicyType | 'All'>('All')
  const [status, setStatus] = useState<'all' | 'draft' | 'active' | 'monitor' | 'inactive'>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'modified', dir: 1 })
  const [menuFor, setMenuFor] = useState<string | null>(null)
  /* Creating a policy is a form, and the form opens here.

     It was a whole SCREEN: `New policy` navigated to a gallery of templates,
     you chose one, and only then were you asked the two questions that
     actually make a policy — what it is called and what it protects. That put
     the catalogue in front of the decision. Somebody who already knows they
     are writing a rule for Workday had to browse twelve strangers' policies
     before they could say so, and somebody who wanted a template was choosing
     one for a policy that did not exist yet.

     So the button opens the form, the form lands you in the builder, and the
     catalogue is offered from the empty board — where "how would you like to
     start?" is a question you are in a position to answer, and where taking a
     template is an edit to a real policy that undo can put back. */
  const [naming, setNaming] = useState(false)
  const [interview, setInterview] = useState(false)
  /** The application the form had already collected, carried into the guided build. */
  const [guidedApps, setGuidedApps] = useState<string[]>([])

  /* Keyed on the three collections it reads, not on the store object.

     `store` changes identity whenever anything in it changes, so this memo was
     rebuilt by edits that had nothing to do with it — and because the gauntlet
     memo below lists `env` as a dependency, every policy was re-scored each
     time. Naming the real inputs means the deck recomputes when a zone,
     fingerprint or group actually changes, and not otherwise. */
  const { zones, fingerprints, groups, riskScale } = store
  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => zones.find((z) => z.id === id)?.name ?? id,
      fingerprintName: (id) => fingerprints.find((p) => p.id === id)?.name ?? id,
      groupName: (id) => (groups.find((g) => g.id === id) ?? groups[0]).name,
      riskScale,
    }),
    [zones, fingerprints, groups, riskScale],
  )

  /* Two exclusions, both to stop the column asserting things it cannot know.

     The system default is a documented catch-all that lets everyone in on one
     factor. The deck would report it as nothing but holes and it would head
     every sort, which tells nobody anything about a rule whose entire job is to
     be the fall-through.

     Session and Account Management policies are excluded because the deck asks
     app-access questions. "Was this Tor sign-in blocked" is not a session
     policy's job — it governs how long a session lasts once access has already
     been decided — so scoring one against these cards produces eleven failures
     that are all category errors. A column that cries wolf on two thirds of the
     table is a column administrators learn to skip. */
  const grades = useMemo(() => {
    const m = new Map<string, GauntletResult>()
    for (const p of store.policies) {
      if (p.isSystem || p.type !== 'App Access') continue
      m.set(p.id, runGauntlet(p, env, store.gauntletOverrides[p.id] ?? {}))
    }
    return m
  }, [store.policies, store.gauntletOverrides, env])

  const rows = useMemo(() => {
    let list = store.policies.filter((p) => {
      if (type !== 'All' && p.type !== type) return false
      /* "Active" filters to what actually decides sign-ins, so a monitor
         policy is excluded from it — the filter has to mean the same thing the
         pill does or the two teach different models of one state. */
      if (status === 'active' && !enforces(p)) return false
      /* Draft was an <option> with no branch behind it: choosing it matched
         every policy, so the one status that means "not finished" was the one
         the filter could not find. It is the whole of what used to be called a
         configuration issue, so it has to be findable. */
      if (status === 'draft' && p.status !== 'draft') return false
      if (status === 'monitor' && p.status !== 'monitor') return false
      if (status === 'inactive' && p.status !== 'inactive') return false
      if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false
      return true
    })
    list = [...list].sort((a, b) => {
      const d = sort.dir
      switch (sort.key) {
        case 'name':
          return a.name.localeCompare(b.name) * d
        case 'type':
          return a.type.localeCompare(b.type) * d
        case 'rules':
          return (a.rules.length - b.rules.length) * d
        case 'exposure': {
          const ra = grades.get(a.id)
          const rb = grades.get(b.id)
          // Ungraded (the system default) sorts to the bottom either way.
          if (!ra || !rb) return ra ? -1 : rb ? 1 : 0
          const byRank = exposureOf(rb).rank - exposureOf(ra).rank
          return (byRank !== 0 ? byRank : rb.breaches - ra.breaches) * d
        }
        default:
          return 0
      }
    })
    // System policy is pinned regardless of sort — it always evaluates.
    return [...list.filter((p) => p.isSystem), ...list.filter((p) => !p.isSystem)]
  }, [store.policies, type, status, query, sort, grades])

  const counts = useMemo(() => {
    const active = store.policies.filter(enforces).length
    const monitoring = store.policies.filter((p) => p.status === 'monitor').length
    return { total: store.policies.length, active, monitoring }
  }, [store.policies])

  /* Counted across everything graded, not just the filtered rows — a filter
     that hides four failing policies should not also hide the fact that they
     are failing. */
  const leaking = [...grades.values()].filter((r) => r.breaches > 0).length

  /* `scope` and `aria-sort` are the two things a sortable header owes a screen
     reader, and neither was here: the column had no association with its cells,
     and the direction lived only in an arrow glyph marked `aria-hidden`. So the
     table announced "button, Policy name" and never said it was sorted, or
     which way. */
  function head(key: SortKey, label: string, extra?: string) {
    const on = sort.key === key
    return (
      <th className={extra} scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
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
    <div className="bpage" onClick={() => setMenuFor(null)}>
      <PageHead
        title="Policies"
        caption="Every sign-in is checked against the policies on the app being opened."
        actions={
          <>
            {/* Two tabs or none, and the gate is on the LIST rather than on
                the second tab.

                That sentence was already written here, one line above the
                second tab, and the code did not do it: hiding Coverage left the
                switch behind with "List" alone in it — a tablist with one tab,
                which is a label with a border round it and a `role="tablist"`
                announcing a choice that does not exist. Now the whole control
                comes and goes with the thing it would switch to. */}
            {store.features.coverage && (
              <div className="bviewswitch" role="tablist" aria-label="Policy view">
                <button
                  role="tab"
                  aria-selected={view === 'list'}
                  className={view === 'list' ? 'is-on' : ''}
                  onClick={() => setView('list')}
                >
                  List
                </button>
                <button
                  role="tab"
                  aria-selected={view === 'coverage'}
                  className={view === 'coverage' ? 'is-on' : ''}
                  onClick={() => setView('coverage')}
                >
                  Coverage
                </button>
              </div>
            )}
            {/* "Manage templates" stood here, beside "New policy".

                It is a second destination in the one place on this page that
                should carry a single action — and it is a destination the left
                rail already lists, one item below "All Policies". A header
                action that duplicates a nav item spends the page's most
                valuable position on a shortcut to somewhere you can already
                see. */}
            <Button variant="brand" onClick={() => setNaming(true)}>
              New policy
            </Button>
          </>
        }
      />

      {store.features.coverage && view === 'coverage' && <Coverage onNew={() => setNaming(true)} />}

      {/* Two questions, then the builder.

          `NewPolicyDialog` hands back a finished, rules-empty policy and does
          not navigate — the Applications screen calls it the same way and
          deliberately stays put. What happens next is the caller's, and from
          here the errand was "I want to write a policy", so it ends in the one
          place that can. */}
      <NewPolicyDialog
        open={naming}
        onClose={() => setNaming(false)}
        onCreate={(policy) => {
          store.addPolicy(policy)
          store.showToast(`${policy.name} created`)
          store.go({ name: 'board', policyId: policy.id })
        }}
        onGuided={store.features.guidedSetup ? (ids) => { setGuidedApps(ids); setNaming(false); setInterview(true) } : undefined}
      />

      <AnimatePresence>
        {interview && store.features.guidedSetup && (
          <Suspense fallback={null}>
            <Interview
              open={interview}
              onClose={() => setInterview(false)}
              onCreate={(rules, builtName, audience) => {
                /* The application the form had already collected. Without it
                   the guided path silently produced a policy protecting nothing
                   — the one field the form marks required with a red asterisk. */
                const policy = blankPolicy(builtName, guidedApps)
                policy.rules = rules
                policy.audience = audience
                store.addPolicy(policy)
                store.showToast(`${policy.name} created with ${rules.length} rule${rules.length === 1 ? '' : 's'}`)
                store.go({ name: 'board', policyId: policy.id })
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {(view === 'list' || !store.features.coverage) && (
        <>
      {/* An attention banner stood here — "N policies need attention. They are
          switched on but cannot take effect as configured."

          It counted a state this product does not have. An unfinished policy is
          not saved and switched on; it is a DRAFT, which the status column
          already says in a word and the status filter already finds. The banner
          was reporting a fault class invented by the prototype, and the red dot
          it told you to hover was the same invention on the row. */}
      <div className="btoolbar">
        {/* Search left, filters right — the order zones already used, and now
            the order every list screen uses. You type a name far more often
            than you narrow a kind, so the control reached first sits where
            reading starts; the controls that narrow sit with the count of what
            survived, which is the thing they change. */}
        <div className="btoolbar__left">
          <SearchBox value={query} onChange={setQuery} placeholder="Search policies…" label="Search policies" />
        </div>
        <div className="btoolbar__right">
          {/* Both filters are dropdowns, and they sit together.

              Type used to be a row of four chips while status was already a
              select, so two controls doing the same job looked like two different
              kinds of thing — and the chip row grew a line every time a policy
              type was added. A select costs one row at any number of types. */}
          <div className="btoolbar__filters">
            {/* `Picker`, not `<select>`.

                Both were `<select>`, which closed looked like the console and
                OPEN was whatever the operating system draws — no ticks, no
                marks, no search, a different font on every machine. The console
                has its own list control and its own header calls it "the
                replacement for the native `<select>`"; it had simply never been
                finished. Two implementations of one control is the only reason
                a filter here and a filter in the rule editor behave
                differently. */}
            <span className={`btoolbar__filter ${type !== 'All' ? 'is-set' : ''}`}>
              <Picker
                label="Filter by policy type"
                value={type}
                width="fill"
                size="md"
                options={TYPE_FILTERS.map((t) => ({ value: t, label: t === 'All' ? 'All types' : t }))}
                onChange={(v) => setType(v as PolicyType | 'All')}
              />
            </span>
            <span className={`btoolbar__filter ${status !== 'all' ? 'is-set' : ''}`}>
              <Picker
                label="Filter by status"
                value={status}
                width="fill"
                size="md"
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'active', label: 'Active' },
                  { value: 'monitor', label: 'Monitor' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
                onChange={(v) => setStatus(v as typeof status)}
              />
            </span>
            {/* Only appears once something is filtered — a permanent Clear that
                clears nothing is just another thing to read. */}
            {(type !== 'All' || status !== 'all') && (
              <button
                type="button"
                className="btoolbar__clear"
                onClick={() => {
                  setType('All')
                  setStatus('all')
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <span className="btoolbar__count">
            {rows.length === counts.total
              ? `${counts.total} policies`
              : `${rows.length} of ${counts.total}`}
          </span>
        </div>
      </div>

      <div className="btable-wrap">
        <div className="btable__scroll">
        <table className="btable">
          <thead>
            <tr>
              {head('name', 'Policy name')}

              <th scope="col">Application</th>

              {store.features.exposure && head('exposure', 'Exposure')}
              <th scope="col" className="btable__col-status">Status</th>

              <th scope="col" className="btable__actions btable__col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <PolicyRow
                key={p.id}
                policy={p}
                gauntlet={grades.get(p.id)}
                menuOpen={menuFor === p.id}
                onMenu={(e) => {
                  e.stopPropagation()
                  setMenuFor((m) => (m === p.id ? null : p.id))
                }}
              />
            ))}
          </tbody>
        </table>
        </div>

        {rows.length === 0 && (
          <div className="btable__empty">
            <NoResults>No policies match those filters.</NoResults>
            <Button
              onClick={() => {
                setType('All')
                setStatus('all')
                setQuery('')
              }}
            >
              Clear filters
            </Button>
          </div>
        )}

        <footer className="btable__foot">
          <span>
            Showing {rows.length} of {counts.total} policies · {counts.active} enforcing
            {counts.monitoring > 0 && ` · ${counts.monitoring} in monitor`}
            {leaking > 0 && (
              <>
                {' · '}
                <button type="button" className="btable__leaking" onClick={() => setSort({ key: 'exposure', dir: 1 })}>
                  {leaking} with holes
                </button>
              </>
            )}
          </span>
        </footer>
      </div>
        </>
      )}
    </div>
  )
}

function PolicyRow({
  policy,
  gauntlet,
  menuOpen,
  onMenu,
}: {
  policy: Policy
  gauntlet?: GauntletResult
  menuOpen: boolean
  onMenu: (e: React.MouseEvent) => void
}) {
  const store = useBrand()
  const named = appsOf(policy, store.apps)
  const [assigning, setAssigning] = useState(false)

  return (
    <tr className={policy.isSystem ? 'is-system' : ''}>
      <td className="btable__primary">
        <button type="button" className="btable__link" onClick={() => store.go({ name: 'board', policyId: policy.id })}>
          {policy.name}
        </button>
        <span className="btable__marks">
          {policy.isSystem && <Badge tone="system">System</Badge>}
        </span>
      </td>
      {/* The applications, named — and the cell is a control when there are
          none.

          "Not assigned" was a grey label and a dead end: the one row that told
          you something needed doing was the one row you could not act on, and
          the fix was three screens away in Policy details. It is a button now,
          which is the shortest path between noticing and fixing.

          Several applications print as the first mark and a count rather than a
          stack of marks. A stack was the old shape for `appIds` and it is worth
          not repeating: three 20px logos in a table cell are three things to
          identify before you can read the one name beside them, and the count
          is what actually says "this policy is shared". */}
      <td>
        {policy.isSystem ? (
          <span className="btable__allapps">Every application</span>
        ) : named.length > 0 ? (
          <button
            type="button"
            className="btable__app btable__app--edit"
            title={`Change the applications this policy covers — currently ${named.map((a) => a.name).join(', ')}`}
            onClick={() => setAssigning(true)}
          >
            <AppLogo appId={named[0].id} size={20} />
            {appsLabel(named)}
            {/* The affordance, as a mark rather than as an underline.

                The cell used to underline itself on hover, which says "link" —
                and this is not a link, it does not go anywhere. It opens the
                dialog that CHANGES which applications the policy covers, so the
                mark that says so is a pencil, and it appears when the pointer
                is anywhere on the ROW rather than only on the four words
                themselves: you notice a row is editable while reading the row,
                not after finding the exact glyph to point at.

                `aria-hidden`, because the button's accessible name already says
                what pressing it does. */}
            <Pencil className="btable__appedit" size={12} strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <button type="button" className="btable__assign" onClick={() => setAssigning(true)}>
            <Plus size={13} strokeWidth={2.2} aria-hidden />
            Assign apps
          </button>
        )}
        <AssignAppsDialog
          open={assigning}
          policy={policy}
          onClose={() => setAssigning(false)}
        />
      </td>
      {/* The Exposure column is the grade in the list. Withheld in lite, so
          the cell goes with the header rather than leaving an empty column. */}
      {store.features.exposure && (
      <td>
        {gauntlet ? (
          (() => {
            const e = exposureOf(gauntlet)
            return (
              <button
                type="button"
                className={`btable__exposure is-${e.tone}`}
                title={gauntlet.gradeReason}
                onClick={() => store.go({ name: 'board', policyId: policy.id, open: 'gauntlet' })}
              >
                {e.label}
                <b>{gauntlet.grade}</b>
              </button>
            )
          })()
        ) : (
          <span
            className="u-muted"
            title={
              policy.isSystem
                ? 'The engine fall-through. It is meant to catch everything, so a hole is its definition rather than a defect.'
                : `The deck asks app-access questions. A ${policy.type} policy decides something else, so scoring it against these cards would only report category errors.`
            }
          >
            —
          </span>
        )}
      </td>
      )}
      <td>
        <StatusPill status={policy.status} />
      </td>
      <td className="btable__actions">
        <div className="btable__menuwrap">
          <button type="button" className="btable__kebab" onClick={onMenu} aria-label={`Actions for ${policy.name}`} aria-expanded={menuOpen}>
            ⋯
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="bmenu"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.13 }}
                onClick={(e) => e.stopPropagation()}
                role="menu"
              >
                {/* An icon per item.

                    Four bare strings in a column are read word by word; with a
                    mark in front, the one you came for is found by shape before
                    it is read — which is the whole reason a menu you open a
                    hundred times has icons. Every row-action menu worth copying
                    does it: Zoom, Amplitude, Lightfield. */}
                <button role="menuitem" onClick={() => store.go({ name: 'board', policyId: policy.id })}>
                  <Pencil size={14} strokeWidth={1.9} aria-hidden />
                  Edit policy
                </button>
                {/* The OTHER builder over the same policy — the trail, a
                    scrolling column of forms. Both edit the same draft; this
                    is a different shape for the same work, and it is the one
                    you now have to ask for. */}
                <button role="menuitem" onClick={() => store.go({ name: 'builder', policyId: policy.id })}>
                  <Waypoints size={14} strokeWidth={1.9} aria-hidden />
                  Open in trail
                </button>
                <button role="menuitem" onClick={() => store.showToast(`${policy.name} saved as a template`)}>
                  <BookmarkPlus size={14} strokeWidth={1.9} aria-hidden />
                  Save as template
                </button>
                <button role="menuitem" onClick={() => store.duplicatePolicy(policy.id)}>
                  <Copy size={14} strokeWidth={1.9} aria-hidden />
                  Duplicate
                </button>
                {!policy.isSystem && (
                  <>
                    <span className="bmenu__rule" />
                    {/* This was deliberately neutral, on the reasoning that the
                        red belongs in the confirmation where the decision is
                        actually made. Reversed, because the two are not
                        alternatives: a menu is scanned and clicked fast, and
                        "Delete policy" sitting in identical grey among three
                        harmless items is easy to hit by accident. The dialog
                        still catches it — this reduces how often it has to.

                        Every reference that has a destructive item colours it:
                        Lightfield, Retool. The confirmation keeps its red too. */}
                    <button
                      role="menuitem"
                      className="is-danger"
                      onClick={() => store.showToast('Deleting a policy opens a confirmation with its blast radius')}
                    >
                      <Trash2 size={14} strokeWidth={1.9} aria-hidden />
                      Delete policy
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </td>
    </tr>
  )
}

/* --- Assigning applications from the list ---------------------------------------

   The shortest path between noticing that a policy protects nothing and fixing
   it. It opens from the Application cell — the cell that states the problem —
   rather than sending anybody to Policy details, which is where this used to be
   answered and is two navigations away from the row that raised it.

   A checklist, not a picker. `ApplicationField` is the right control inside a
   form, where it sits in a column of other fields and has to stay one line
   tall; here the dialog IS the question, so the list can be the body of it and
   every application is visible without opening a second layer. The two agree on
   what they write — an `appIds` array in catalogue order — which is the part
   that has to match.

   It edits a local set and saves on Save. The rest of this table writes through
   immediately, and this does not, because assigning applications is the one
   edit here that changes what gets enforced: a half-finished multi-select
   landing on the store a click at a time would enforce each intermediate state
   for as long as it took to make the next click. */
function AssignAppsDialog({
  open,
  policy,
  onClose,
}: {
  open: boolean
  policy: Policy
  onClose: () => void
}) {
  const store = useBrand()
  const [picked, setPicked] = useState<string[]>(policy.appIds)
  const [q, setQ] = useState('')

  /* The seed as a STRING, and that is what makes the effect below honest.

     `policy.appIds` is a fresh array on every store change, so depending on it
     directly would re-seed — and discard the ticks somebody had just made —
     every time anything in the tenant moved. Depending on `[open]` alone fixes
     that by lying to the linter about what the effect reads. Joining gives a
     value that changes only when the assignment actually changes, so the effect
     can name everything it uses and still re-run only when it should. */
  const seed = policy.appIds.join()

  useEffect(() => {
    if (!open) return
    setPicked(seed === '' ? [] : seed.split(','))
    setQ('')
  }, [open, seed])

  const shown = store.apps.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : store.apps.filter((a) => a.id === id || p.includes(a.id)).map((a) => a.id),
    )

  const changed = picked.join() !== policy.appIds.join()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Applications for ${policy.name}`}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={!changed}
            onClick={() => {
              /* The same demotion rule the rest of the product follows: a policy
                 left with no application is not finished, and unfinished is a
                 draft. Assigning one does NOT promote in return — publishing is
                 a decision somebody makes on the policy, not a side effect of
                 filling in a field. */
              const next = { ...policy, appIds: picked }
              store.savePolicy(picked.length === 0 ? { ...next, status: 'draft' as const } : next)
              store.showToast(
                picked.length === 0
                  ? `${policy.name} has no application — back to draft`
                  : `${policy.name} now protects ${picked.length} application${picked.length === 1 ? '' : 's'}`,
              )
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="bassign">
        <p className="bassign__lede">Every sign-in to one of these is checked against this policy.</p>

        {/* Only once the list is long enough to need it. Twenty-six rows is
            past that; a tenant with six would spend a control on nothing. */}
        {store.apps.length > 8 && (
          <input
            type="search"
            className="bassign__search"
            placeholder="Search applications…"
            aria-label="Search applications"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        )}

        <div className="bassign__list">
          {shown.map((a) => {
            const on = picked.includes(a.id)
            return (
              <label key={a.id} className={`bassign__row ${on ? 'is-on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(a.id)} />
                <AppLogo appId={a.id} name={a.name} size={22} />
                <span className="bassign__name">{a.name}</span>
                <span className="bassign__meta">{a.protocol}</span>
              </label>
            )
          })}
          {shown.length === 0 && <p className="bassign__none">No application matches “{q}”.</p>}
        </div>

        {/* Says what the save will do, in the terms the row will read back.
            A count that only appears once something is ticked, because "0
            selected" under an empty list is a restatement of the list. */}
        {picked.length > 0 && (
          <p className="bassign__foot">
            {picked.length} selected — {appsLabel(store.apps.filter((a) => picked.includes(a.id)))}
          </p>
        )}
      </div>
    </Modal>
  )
}
