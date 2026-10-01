import { AnimatePresence } from 'motion/react'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppWindow,
  Check,
  CopyPlus,
  Grid3x3,
  LayoutTemplate,
  ListFilter,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Table2,
  ShieldCheck,
  ShieldPlus,
  Trash2,
  Waypoints,
} from 'lucide-react'

import { PageHead } from '../Shell'
import { Coverage } from './Coverage'
import { AppsPeek } from './apps-peek'
import { AppLogo } from '../logos/AppLogo'
import { Badge, Button, Modal, RowMenu, SearchBox, StatusPill, TipMark, type MenuItem } from '../kit'
import { LibraryRows, ViewSwitch, type LibRow } from './library-view'
import type { LibView, ViewOption } from './library-view-state'
import { PageBar } from './page-bar'
import { Picker } from '../picker'
import { appsOf, blankPolicy, enforces, type Policy } from '../data'
import { NewPolicyDialog } from '../create/NewPolicyDialog'
import { useBrand, useNameLookup } from '../store'
import { ChangeState } from '../leave-guard'
import { EmptyState, NoMatches } from '../empty'
import { openForEditing } from '../policy-draft'
import { freeName } from '../policy-name'
import { scenarioFromPolicy } from '../template-from-policy'
import { SaveTemplateDialog } from './builder-dialogs'
import { ConfirmDelete } from './confirm-delete'
import { decidesFor, deleteDetail, protectionOf } from './app-policies'
import { runGauntlet, type GauntletResult } from './gauntlet'
import type { SimEnv } from './simulate'
import { statusOptions, type StatusTarget } from './status-options'
import { useStatusChange } from './use-status-change'
import { SHOWCASE } from '../showcase'

/* Mounted only while it is open — the list is the landing screen and does not
   need the interview's questions, composer and figures in its chunk. */
const Interview = lazy(() => import('../create/Interview').then((m) => ({ default: m.Interview })))

/* -----------------------------------------------------------------------------
   Policies — the list.

   Name, applications, status and the row menu; Exposure too in the full
   edition. One status filter and a search. Every dialog a row opens lives on
   the page, not in the row, so a row that is deleted or filtered out does not
   take its dialog — and the keyboard focus — with it.
   -------------------------------------------------------------------------- */

type SortKey = 'name' | 'modified' | 'exposure'
type StatusFilter = 'all' | 'draft' | 'active' | 'inactive'
type RowAction = 'edit' | 'trail' | 'template' | 'duplicate' | 'delete' | 'assign' | StatusTarget
type RowDialog = { kind: 'delete' | 'assign' | 'template'; policy: Policy }

/* -----------------------------------------------------------------------------
   Exposure (full edition only).

   The gauntlet runs against every row. The column shows the finding rather than
   the letter — "5 got through" is actionable where "F" is not — and clicking it
   opens the gauntlet for that policy.
   -------------------------------------------------------------------------- */
function exposureOf(r: GauntletResult) {
  if (r.breaches > 0) return { tone: 'bad' as const, label: `${r.breaches} got through`, rank: 3 }
  if (r.lockouts > 0) return { tone: 'warn' as const, label: `${r.lockouts} locked out`, rank: 2 }
  if (r.friction > 2) return { tone: 'notice' as const, label: `${r.friction} over-challenged`, rank: 1 }
  return { tone: 'ok' as const, label: 'Nothing got through', rank: 0 }
}

/* In the order they are used: what decides sign-ins first. They were out as
   segments across the bar until 23 Sep 2026 — owner: "remove the open filter
   from Policies, just add a filter icon" — so status now answers in the same
   one-line dropdown every other library page uses. */
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
]

/* The ONE policies view is the TABLE (owner, 16 Sep 2026). The same day it
   went table/list/card, then list only — "the list view" having meant the
   table, which this page called List before it had three — and then back to
   the table. The list and card renderings below are still in the source behind
   this one word. Typed wide on purpose, so those branches still compile. */
const POLICY_VIEW: LibView = 'table'

/* Coverage is not one of the three library views; it is the matrix, and only
   where the product has it. Where it does, the switch is the two options the
   page had before today: the table, and Coverage. */
type PolicyView = 'table' | 'coverage'
const POLICY_VIEWS: ViewOption<PolicyView>[] = [
  { id: 'table', label: 'Table view', icon: Table2 },
  { id: 'coverage', label: 'Coverage view', icon: Grid3x3 },
]

export function Policies() {
  const store = useBrand()
  const resolveName = useNameLookup()
  const libView = POLICY_VIEW
  const [coverageOn, setCoverageOn] = useState(false)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'modified', dir: 1 })
  /* The naming form. Only the guided build opens it now — see `newPolicy`. */
  const [naming, setNaming] = useState(false)
  const [interview, setInterview] = useState(false)
  /** The application the form had already collected, carried into the guided build. */
  const [guidedApps, setGuidedApps] = useState<string[]>([])

  /* The row dialogs. `dialog` keeps the policy while the dialog animates out,
     including after a delete has removed it from the store. */
  const [dialog, setDialog] = useState<RowDialog | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const openDialog = (kind: RowDialog['kind'], policy: Policy) => {
    setDialog({ kind, policy })
    setDialogOpen(true)
  }
  const closeDialog = () => setDialogOpen(false)

  /* New policy, the way a design tool makes a new file (owner, 23 Sep 2026:
     "by default it should open in draft mode with an untitled name — how Figma
     works, no need to ask questions").

     One click, and you are in the builder looking at a draft called "Untitled
     policy". Nothing is asked first, because nothing had to be: the name sits
     at the top of the builder under a pencil, and the applications are the
     start node at the head of the chain. The dialog asked for both, then showed
     you both again a frame later — and it asked before you had seen anything,
     which is the worst moment to name a thing.

     Numbered by `freeName` ("Untitled policy", "Untitled policy 2", …), because
     policies are told apart by name across the list, the status dialogs and the
     toasts, and two drafts called the same thing would be a rename nobody asked
     for. The builder already knows the name — applying a template to a policy
     still called "Untitled policy" renames it to the template's.

     No toast. It named a thing you are looking at.

     The draft is real from this moment: `blankPolicy` is `status: 'draft'`, it
     lands in the list, and it cannot go live until it has an application. An
     empty Untitled draft left behind is the same thing an empty Untitled file
     is — the owner's reference, and the row menu deletes it. */
  const startDraft = () => {
    const name = freeName('Untitled policy', store.policies.map((p) => p.name))
    const id = store.addPolicy(blankPolicy(name, []))
    store.go({ name: 'board', policyId: id })
  }
  /* The one edition that still asks: the guided build is offered FROM the
     naming form, so where that feature exists the form has something the
     builder does not. Lite withholds the guided build (`featuresOf('lite')`),
     and with it the only reason to stop for a dialog. Gated, not forked. */
  const newPolicy = () => (store.features.guidedSetup ? setNaming(true) : startDraft())

  /* The rows' container in whichever view is showing, for the focus pass. */
  const bodyRef = useRef<HTMLElement | null>(null)
  const setBody = useCallback((el: HTMLElement | null) => {
    bodyRef.current = el
  }, [])
  const searchRef = useRef<HTMLInputElement | null>(null)
  /* The row a confirmed change may remove from the list: a delete, a status
     change under a status filter, an assignment that makes it a draft. */
  const leaving = useRef<{ id: string; index: number } | null>(null)

  const showExposure = store.features.exposure

  /* Keyed on the collections it reads, not on the store object, so the deck
     recomputes only when a zone, fingerprint or group actually changes. */
  const { zones, fingerprints, groups, riskScale } = store
  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => zones.find((z) => z.id === id)?.name ?? id,
      fingerprintName: (id) => fingerprints.find((p) => p.id === id)?.name ?? id,
      hasZone: (id) => zones.some((z) => z.id === id),
      hasFingerprint: (id) => fingerprints.some((p) => p.id === id),
      groupName: (id) => (groups.find((g) => g.id === id) ?? groups[0])?.name ?? id,
      riskScale,
    }),
    [zones, fingerprints, groups, riskScale],
  )

  /* Not run at all in Lite, where the Exposure column is withheld. The system
     default is skipped: it is the fall-through, so the deck would report it as
     nothing but holes. The deck asks app-access questions only. */
  const grades = useMemo(() => {
    const m = new Map<string, GauntletResult>()
    if (!showExposure) return m
    for (const p of store.policies) {
      if (p.isSystem || p.type !== 'App Access') continue
      m.set(p.id, runGauntlet(p, env, store.gauntletOverrides[p.id] ?? {}))
    }
    return m
  }, [showExposure, store.policies, store.gauntletOverrides, env])

  const q = query.trim().toLowerCase()

  const rows = useMemo(() => {
    let list = store.policies.filter((p) => {
      /* "Active" means what decides sign-ins, so the always-on default is in it. */
      if (status === 'active' && !enforces(p)) return false
      if ((status === 'draft' || status === 'inactive') && p.status !== status) return false
      if (q && !p.name.toLowerCase().includes(q)) return false
      return true
    })
    list = [...list].sort((a, b) => {
      const d = sort.dir
      switch (sort.key) {
        case 'name':
          return a.name.localeCompare(b.name) * d
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
  }, [store.policies, status, q, sort, grades])

  const deciding = useMemo(() => store.policies.filter(enforces).length, [store.policies])

  /* Counted across everything graded, not just the filtered rows. */
  const leaking = [...grades.values()].filter((r) => r.breaches > 0).length

  const filtered = status !== 'all'
  const systemPolicy = store.policies.find((p) => p.isSystem)
  /* A tenant with nothing but the system policy: the list is empty in every
     sense that matters, though the pinned row is there. */
  const noPolicies = !q && !filtered && store.policies.every((p) => p.isSystem)

  const markLeaving = (id: string) => {
    leaving.current = { id, index: rows.findIndex((r) => r.id === id) }
  }

  /* After a change that removed a row, focus the row now in its place (or the
     one above, at the end), or the search box when the list is empty. Runs
     after the closing dialog has tried to restore focus to the gone row. */
  useEffect(() => {
    const l = leaving.current
    if (!l) return
    leaving.current = null
    if (rows.some((r) => r.id === l.id)) return
    const links = bodyRef.current?.querySelectorAll<HTMLButtonElement>('.btable__link, .blist__open')
    const next = links && links.length > 0 ? links[Math.min(Math.max(l.index, 0), links.length - 1)] : null
    ;(next ?? searchRef.current)?.focus({ preventScroll: true })
  }, [rows])

  const statusChange = useStatusChange({
    onAssignApps: (p) => openDialog('assign', p),
    onChange: (p) => markLeaving(p.id),
  })

  const act = (policy: Policy, action: RowAction) => {
    switch (action) {
      case 'edit':
        store.go({ name: 'board', policyId: policy.id })
        break
      case 'trail':
        store.go({ name: 'builder', policyId: policy.id })
        break
      case 'active':
      case 'inactive':
        statusChange.request(policy, action)
        break
      case 'duplicate': {
        const id = store.duplicatePolicy(policy.id)
        if (!id) return
        store.showToast(`${store.policyById(id)?.name ?? 'Copy'} created as a draft`)
        store.go({ name: 'board', policyId: id })
        break
      }
      case 'delete':
      case 'assign':
      case 'template':
        openDialog(action, policy)
        break
    }
  }

  /* `scope` and `aria-sort` are what a sortable header owes a screen reader. */
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

  const isCoverage = store.features.coverage && coverageOn

  /* No matches, or no policies at all — the same two states in every view. */
  const empty = (
    <>
      {rows.length === 0 && (
        <NoMatches
          noun="policies"
          query={query}
          filtered={filtered}
          compact
          onClear={() => {
            setStatus('all')
            setQuery('')
          }}
        />
      )}
      {noPolicies && (
        <EmptyState
          compact
          icon={ShieldPlus}
          title="No policies yet"
          blurb={`Sign-ins use the ${systemPolicy?.name ?? 'default policy'} until you add a policy.`}
          action={
            <Button variant="secondary" icon={Plus} onClick={newPolicy}>
              New policy
            </Button>
          }
        />
      )}
    </>
  )

  /* The line under the list: how many decide sign-ins, and how many leak. */
  const summary = (
    <span>
      {deciding} {deciding === 1 ? 'policy' : 'policies'} deciding sign-ins
      {showExposure && leaking > 0 && (
        <>
          {', '}
          <button type="button" className="btable__leaking" onClick={() => setSort({ key: 'exposure', dir: 1 })}>
            {leaking} let test sign-ins through
          </button>
        </>
      )}
    </span>
  )

  /* The dialog's policy as it is now, or as it was when it was deleted. */
  const current = dialog ? (store.policies.find((p) => p.id === dialog.policy.id) ?? dialog.policy) : null

  return (
    <div className="bpage">
      <PageHead
        title="Policies"
        caption="Every sign-in is checked against the policies on the app being opened."
        docs
      />

      {/* The row every list page has — see `PageBar`: the search box, then the
          filter; the view and New on the right. Coverage has no rows to search
          or filter. */}
      <PageBar
        left={
          !isCoverage && (
            <>
              <SearchBox
                value={query}
                onChange={setQuery}
                inputRef={searchRef}
                placeholder="Search policies…"
                label="Search policies"
              />
              <span className={`btoolbar__filter bbar__filter ${status !== 'all' ? 'is-set' : ''}`}>
                <Picker
                  label="Filter by status"
                  size="md"
                  icon={ListFilter}
                  prefix="Status"
                  value={status}
                  options={STATUS_TABS}
                  onChange={(v) => setStatus(v as StatusFilter)}
                />
              </span>
            </>
          )
        }
        right={
          <>
            {/* No table/list/card switch — the table is the only view. The switch
                is drawn only where there is a second thing to switch to. */}
            {store.features.coverage && (
              <ViewSwitch<PolicyView>
                value={isCoverage ? 'coverage' : 'table'}
                views={POLICY_VIEWS}
                label="Policy view"
                onChange={(v) => setCoverageOn(v === 'coverage')}
              />
            )}
            <Button variant="brand" icon={Plus} onClick={newPolicy}>
              New policy
            </Button>
          </>
        }
      />

      {isCoverage && <Coverage onNew={newPolicy} />}

      {/* `NewPolicyDialog` hands back a rules-empty policy; from here the errand
          ends in the builder. The store may give it a different id, so the
          builder opens the id `addPolicy` returns.

          Reached only where the guided build exists — `newPolicy` above. It is
          still the Applications screen's own way in, from an application row,
          where the errand ends without ever opening a builder and the name has
          nowhere else to be asked. */}
      <NewPolicyDialog
        open={naming}
        onClose={() => setNaming(false)}
        onCreate={(policy) => {
          const id = store.addPolicy(policy)
          setNaming(false)
          store.showToast(`${policy.name} created`)
          store.go({ name: 'board', policyId: id })
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
                const policy = blankPolicy(builtName, guidedApps)
                policy.rules = rules
                policy.audience = audience
                const id = store.addPolicy(policy)
                store.showToast(`${policy.name} created with ${rules.length} rule${rules.length === 1 ? '' : 's'}`)
                store.go({ name: 'board', policyId: id })
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {!isCoverage && libView === 'table' && (
        <div className="btable-wrap">
          {rows.length > 0 && (
            <div className="btable__scroll">
              <table className="btable">
                <thead>
                  <tr>
                    {head('name', 'Policy name')}
                    <th scope="col">Applications</th>
                    {showExposure && head('exposure', 'Exposure')}
                    <th scope="col" className="btable__col-status">
                      Status
                    </th>
                    <th scope="col" className="btable__actions btable__col-actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody ref={setBody}>
                  {rows.map((p) => (
                    <PolicyRow
                      key={p.id}
                      policy={p}
                      gauntlet={grades.get(p.id)}
                      showExposure={showExposure}
                      onAction={(a) => act(p, a)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {empty}
          <footer className="btable__foot">{summary}</footer>
        </div>
      )}

      {/* List and card: the libraries' own two shapes, drawn by the component
          Zones, Device profiles and Risk signal profiles use. The table stays
          the policies' own — it sorts, and it grades. */}
      {!isCoverage && libView !== 'table' && (
        <>
          {rows.length > 0 && (
            <LibraryRows
              view={libView}
              listRef={setBody}
              columns={[]}
              rows={rows.map(
                (p): LibRow => ({
                  id: p.id,
                  name: p.name,
                  tile: <ShieldCheck size={18} strokeWidth={1.8} />,
                  tileClass: 'bpol__tile',
                  badge: <PolicyMarks policy={p} />,
                  onOpen: () => act(p, 'edit'),
                  facts: [
                    { label: 'Apps', value: <PolicyApps policy={p} onAssign={() => act(p, 'assign')} /> },
                    { label: 'Status', value: <StatusPill status={p.status} /> },
                    ...(showExposure
                      ? [{ label: 'Exposure', value: <PolicyExposure policy={p} gauntlet={grades.get(p.id)} /> }]
                      : []),
                  ],
                  menu: (
                    <RowMenu label={`Actions for ${p.name}`} items={policyMenu(p)} onSelect={(id) => act(p, id as RowAction)} />
                  ),
                }),
              )}
            />
          )}
          {empty}
          <p className="bpol__foot">{summary}</p>
        </>
      )}

      {/* The row dialogs, on the page so they outlive the row. */}
      {dialog && current && dialog.kind === 'delete' && (
        <ConfirmDelete
          open={dialogOpen}
          name={current.name}
          noun="policy"
          detail={deleteDetail(current, store.policies, store.apps) ?? undefined}
          onCancel={closeDialog}
          onConfirm={() => {
            markLeaving(current.id)
            closeDialog()
            store.deletePolicy(current.id)
            store.showToast(`${current.name} deleted`)
          }}
        />
      )}
      {dialog && current && dialog.kind === 'assign' && (
        <AssignAppsDialog
          open={dialogOpen}
          policy={current}
          onClose={closeDialog}
          onCommit={() => markLeaving(current.id)}
        />
      )}
      {dialog && current && dialog.kind === 'template' && (
        <SaveTemplateDialog
          open={dialogOpen}
          policy={openForEditing(current)}
          onClose={closeDialog}
          onSave={(t) => {
            store.addScenario(scenarioFromPolicy(current, t, Date.now(), resolveName))
            closeDialog()
            store.showToast(`${t.name.trim()} saved as a template`)
          }}
        />
      )}
      {statusChange.dialog}
    </div>
  )
}

/* A policy's row menu, the same in every view. */
function policyMenu(policy: Policy): MenuItem[] {
  return [
    { id: 'edit', label: 'Edit policy', icon: Pencil },
    ...statusOptions(policy).map((s) => ({ id: s.target, label: s.label, icon: s.target === 'active' ? Power : PowerOff })),
    /* The older trail builder: not in the showcase build, where the board is
       the one builder (see showcase.ts). */
    ...(SHOWCASE ? [] : [{ id: 'trail', label: 'Open in trail', icon: Waypoints }]),
    /* A template of a policy with no rules would apply nothing. */
    ...(openForEditing(policy).rules.length > 0 ? [{ id: 'template', label: 'Save as template', icon: LayoutTemplate }] : []),
    ...(policy.isSystem
      ? []
      : [
          /* CopyPlus, the glyph the policy builder's rule menu uses (owner, 23 Sep
       2026: "use the one we use inside the policy builder"). Two sheets alone
       read as "copy to the clipboard"; the plus says a second one is made. */
    { id: 'duplicate', label: 'Duplicate', icon: CopyPlus },
          { id: 'delete', label: 'Delete policy', icon: Trash2, danger: true, divide: true },
        ]),
  ]
}

/* The applications, as marks with the full list on hover; with none, the
   control that assigns them. The table's cell and the list's and card's fact. */
function PolicyApps({ policy, onAssign }: { policy: Policy; onAssign: () => void }) {
  const store = useBrand()
  const named = appsOf(policy, store.apps)
  if (policy.isSystem) return <span className="btable__allapps">Every application</span>
  if (named.length > 0) return <AppsPeek apps={named} policyName={policy.name} onEdit={onAssign} />
  return (
    <button type="button" className="btable__assign" onClick={onAssign}>
      <Plus size={13} strokeWidth={2.2} aria-hidden />
      Assign apps
    </button>
  )
}

/* How exposed a policy is, as a grade that opens the test deck. */
function PolicyExposure({ policy, gauntlet }: { policy: Policy; gauntlet?: GauntletResult }) {
  const store = useBrand()
  if (!gauntlet) {
    return (
      <span
        className="u-muted"
        title={policy.isSystem ? 'The default policy catches every sign-in, so it is not scored.' : 'Only app access policies are scored.'}
      >
        —
      </span>
    )
  }
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
}

/* The marks beside a policy's name: System, and a live policy's unpublished edits. */
function PolicyMarks({ policy }: { policy: Policy }) {
  if (!policy.isSystem && !policy.pendingDraft) return null
  return (
    <span className="btable__marks">
      {policy.isSystem && <Badge tone="system">System</Badge>}
      {policy.pendingDraft && <ChangeState unsaved={false} draft />}
    </span>
  )
}

function PolicyRow({
  policy,
  gauntlet,
  showExposure,
  onAction,
}: {
  policy: Policy
  gauntlet?: GauntletResult
  showExposure: boolean
  onAction: (action: RowAction) => void
}) {
  return (
    <tr className={policy.isSystem ? 'is-system' : ''}>
      {/* The row's layout lives on a wrapper INSIDE the cell. `.btable__primary`
          is a flex row, and set on the `<td>` itself it stopped the cell being
          a table cell: it sized to its own content instead of the row, so its
          bottom rule sat 5px above every other column's on each row. */}
      <td>
        <div className="btable__primary">
          {/* The mark the list and card views give a policy, so a row reads as
              the same object in all three. */}
          <span className="blist__tile bpol__tile" aria-hidden>
            <ShieldCheck size={18} strokeWidth={1.8} />
          </span>
          <button type="button" className="btable__link" onClick={() => onAction('edit')}>
            {policy.name}
          </button>
          <PolicyMarks policy={policy} />
        </div>
      </td>
      <td>
        <PolicyApps policy={policy} onAssign={() => onAction('assign')} />
      </td>
      {showExposure && (
        <td>
          <PolicyExposure policy={policy} gauntlet={gauntlet} />
        </td>
      )}
      <td>
        <StatusPill status={policy.status} />
      </td>
      <td className="btable__actions">
        <RowMenu label={`Actions for ${policy.name}`} items={policyMenu(policy)} onSelect={(id) => onAction(id as RowAction)} />
      </td>
    </tr>
  )
}

/* --- Assigning applications from the list ---------------------------------------

   Opens from the Applications cell. A checklist, not a picker: the dialog is the
   question, so every application is visible without a second layer. It edits a
   local set and saves on Save, because assigning applications changes what is
   enforced and each intermediate click should not be. */
function AssignAppsDialog({
  open,
  policy,
  onClose,
  onCommit,
}: {
  open: boolean
  policy: Policy
  onClose: () => void
  /** Called just before the assignment is written. */
  onCommit: () => void
}) {
  const store = useBrand()
  const [picked, setPicked] = useState<string[]>(policy.appIds)
  const [q, setQ] = useState('')

  /* The seed as a string, so the effect re-seeds only when the assignment
     actually changes, not on every store change. */
  const seed = policy.appIds.join()

  useEffect(() => {
    if (!open) return
    setPicked(seed === '' ? [] : seed.split(','))
    setQ('')
  }, [open, seed])

  /* Other deciding policies on each application, for the tooltip beside its name. */
  const alsoOn = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const a of store.apps) {
      const others = protectionOf(a.id, store.policies).decides.filter((p) => p.id !== policy.id)
      if (others.length > 0) m.set(a.id, others.map((p) => p.name))
    }
    return m
  }, [store.apps, store.policies, policy.id])

  const shown = store.apps.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : store.apps.filter((a) => a.id === id || p.includes(a.id)).map((a) => a.id),
    )

  const changed = picked.join() !== policy.appIds.join()
  const noApps = store.apps.length === 0

  const save = () => {
    /* Unfinished means draft: a policy left with no application becomes one.
       Assigning does not publish in return. */
    const next = { ...policy, appIds: picked }
    onCommit()
    store.savePolicy(picked.length === 0 ? { ...next, status: 'draft' as const } : next)
    const n = picked.length
    const count = `${n} application${n === 1 ? '' : 's'}`
    /* "Protects" only for a policy that decides sign-ins. An active policy with
       no rule turned on decides nothing either, and is not inactive. */
    const why =
      policy.status === 'draft' ? 'It is still a draft.' : policy.status === 'inactive' ? 'It is inactive.' : 'No rule is turned on.'
    store.showToast(
      n === 0
        ? policy.status === 'draft'
          ? `${policy.name} has no applications`
          : `${policy.name} is now a draft`
        : decidesFor(policy)
          ? `${policy.name} now protects ${count}`
          : `${policy.name} is assigned to ${count}. ${why}`,
    )
    onClose()
  }

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
          <Button variant="brand" disabled={!changed} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="bassign">
        {noApps ? (
          <EmptyState
            compact
            icon={AppWindow}
            title="No applications yet"
            blurb="Add an application, then assign it to this policy."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  onClose()
                  store.go({ name: 'applications' })
                }}
              >
                Go to applications
              </Button>
            }
          />
        ) : (
          <>
            <p className="bassign__lede">Every sign-in to one of these is checked against this policy.</p>

            {/* Only once the list is long enough to need it. */}
            {store.apps.length > 8 && (
              <SearchBox block placeholder="Search applications…" label="Search applications" value={q} onChange={setQ} />
            )}

            {shown.length > 0 ? (
              <div className="bassign__list">
                {shown.map((a) => {
                  const on = picked.includes(a.id)
                  const others = alsoOn.get(a.id)
                  const also = others ? `Also decided by ${others.join(', ')}.` : null
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className={`bassign__row ${on ? 'is-on' : ''}`}
                      onClick={() => toggle(a.id)}
                    >
                      <span className="bx-tick" aria-hidden>
                        <Check size={11} strokeWidth={3.2} />
                      </span>
                      <AppLogo appId={a.id} name={a.name} size={22} />
                      <span className="bassign__name">
                        {a.name}
                        {also && (
                          <>
                            {' '}
                            <TipMark text={also} />
                            <span className="u-sr-only">{also}</span>
                          </>
                        )}
                      </span>
                      <span className="bassign__meta">{a.protocol}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <NoMatches noun="applications" query={q} compact onClear={() => setQ('')} />
            )}

            {picked.length > 0 && <p className="bassign__foot">{picked.length} selected</p>}
            {picked.length === 0 && policy.status !== 'draft' && (
              <p className="bassign__foot">With no applications, this policy becomes a draft.</p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
