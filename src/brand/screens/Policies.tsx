import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookmarkPlus, Copy, Pencil, Trash2 } from 'lucide-react'

import { PageHead } from '../Shell'
import { Coverage } from './Coverage'
import { AppLogoStack } from '../logos/AppLogo'
import { Badge, Button, DecisionChip, InfoDot, StatusPill } from '../kit'
import { enforces, type Policy, type PolicyType } from '../data'
import { useBrand } from '../store'
import { NoResults } from '../empty'
import { runGauntlet, type GauntletResult } from './gauntlet'
import type { SimEnv } from './simulate'

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

/* Long enough that crossing the column on the way somewhere else does not flash
   a window, short enough that aiming at one does not feel gated. */
const PEEK_DELAY = 130

function RulePeek({ policy }: { policy: Policy }) {
  const ref = useRef<HTMLButtonElement>(null)
  const timer = useRef<number>(0)
  const [at, setAt] = useState<DOMRect | null>(null)

  const place = () => {
    const el = ref.current
    if (el) setAt(el.getBoundingClientRect())
  }

  const open = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(place, PEEK_DELAY)
  }
  const close = () => {
    window.clearTimeout(timer.current)
    setAt(null)
  }

  /* Fixed coordinates go stale the moment anything moves under them, and the
     table itself scrolls. Closing is more honest than chasing. */
  useEffect(() => {
    if (!at) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [at])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`btable__rules ${at ? 'is-open' : ''}`}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={place}
        onBlur={close}
        aria-expanded={at !== null}
      >
        {policy.rules.length} rule{policy.rules.length === 1 ? '' : 's'}
      </button>

      {at && createPortal(<PeekWindow anchor={at} policy={policy} />, document.body)}
    </>
  )
}

/* Placement is measured, not estimated.

   The first version guessed the height from the rule count and, when the guess
   said there was no room below, flipped by writing transform: translateY(-100%)
   into the same style object motion animates `y` through. Motion owns transform
   on an animated element and overwrites it every frame, so the flip never
   applied — a window that should have opened upwards opened downwards over the
   rows instead. Nothing about that is visible until you measure it.

   So the box renders, useLayoutEffect measures it before paint, and top/left
   come from real numbers. No transform involved, nothing for motion to fight. */
function PeekWindow({ anchor, policy }: { anchor: DOMRect; policy: Policy }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const gap = 8
    const below = anchor.bottom + gap
    const fitsBelow = below + height <= window.innerHeight - gap
    const fitsAbove = anchor.top - height - gap >= gap
    setPos({
      top: fitsBelow || !fitsAbove ? Math.min(below, window.innerHeight - height - gap) : anchor.top - height - gap,
      left: Math.min(Math.max(gap, anchor.left), window.innerWidth - width - gap),
    })
  }, [anchor])

  return (
    <motion.div
      ref={box}
      className="brpk"
      role="tooltip"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      style={{ top: pos?.top ?? anchor.bottom + 8, left: pos?.left ?? anchor.left }}
    >
      <p className="brpk__head">Evaluated top to bottom · first match wins</p>
      <ol className="brpk__stack">
        {policy.rules.map((r, i) => (
          <li key={r.id} className={`brpk__row ${r.enabled ? '' : 'is-off'}`}>
            <span className="brpk__n">{i + 1}</span>
            <span className="brpk__name">{r.name}</span>
            <DecisionChip decision={r.decision} size="sm" />
          </li>
        ))}
        <li className="brpk__row brpk__row--default">
          <span className="brpk__n" aria-hidden>
            ⌄
          </span>
          <span className="brpk__name">Everyone else</span>
          <DecisionChip decision="1fa" size="sm" />
        </li>
      </ol>
    </motion.div>
  )
}

const TYPE_FILTERS: (PolicyType | 'All')[] = ['All', 'App Access', 'Session', 'Account Management']

export function Policies() {
  const store = useBrand()
  const [view, setView] = useState<'list' | 'coverage'>('list')
  const [type, setType] = useState<PolicyType | 'All'>('All')
  const [status, setStatus] = useState<'all' | 'active' | 'monitor' | 'inactive'>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'modified', dir: 1 })
  const [menuFor, setMenuFor] = useState<string | null>(null)

  /* Keyed on the three collections it reads, not on the store object.

     `store` changes identity whenever anything in it changes, so this memo was
     rebuilt by edits that had nothing to do with it — and because the gauntlet
     memo below lists `env` as a dependency, every policy was re-scored each
     time. Naming the real inputs means the deck recomputes when a zone,
     fingerprint or group actually changes, and not otherwise. */
  const { zones, fingerprints, groups } = store
  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => zones.find((z) => z.id === id)?.name ?? id,
      fingerprintName: (id) => fingerprints.find((p) => p.id === id)?.name ?? id,
      groupName: (id) => (groups.find((g) => g.id === id) ?? groups[0]).name,
    }),
    [zones, fingerprints, groups],
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
    const issues = store.policies.filter((p) => p.configIssue).length
    return { total: store.policies.length, active, monitoring, issues }
  }, [store.policies])

  /* Counted across everything graded, not just the filtered rows — a filter
     that hides four failing policies should not also hide the fact that they
     are failing. */
  const leaking = [...grades.values()].filter((r) => r.breaches > 0).length

  function head(key: SortKey, label: string, extra?: string) {
    const on = sort.key === key
    return (
      <th className={extra}>
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
            <div className="bviewswitch" role="tablist" aria-label="Policy view">
              <button
                role="tab"
                aria-selected={view === 'list'}
                className={view === 'list' ? 'is-on' : ''}
                onClick={() => setView('list')}
              >
                List
              </button>
              {/* Two tabs or none. A tablist with one tab is a label with a
                  border round it. */}
              {store.features.coverage && (
                <button
                  role="tab"
                  aria-selected={view === 'coverage'}
                  className={view === 'coverage' ? 'is-on' : ''}
                  onClick={() => setView('coverage')}
                >
                  Coverage
                </button>
              )}
            </div>
            <Button variant="ghost" onClick={() => store.go({ name: 'templates' })}>
              Manage templates
            </Button>
            <Button variant="brand" onClick={() => store.go({ name: 'create' })}>
              New policy
            </Button>
          </>
        }
      />

      {store.features.coverage && view === 'coverage' && <Coverage />}

      {(view === 'list' || !store.features.coverage) && (
        <>
      {counts.issues > 0 && (
        <div className="bpolicies__banner">
          <span className="bx-callout bx-callout--notice">
            <span className="bx-callout__mark" aria-hidden />
            <div>
              <strong>
                {counts.issues} polic{counts.issues === 1 ? 'y needs' : 'ies need'} attention
              </strong>
              <div>
                They are switched on but cannot take effect as configured. Hover the marker on the
                row to see why.
              </div>
            </div>
          </span>
        </div>
      )}

      <div className="btoolbar">
        {/* Both filters are dropdowns, and they sit together.

            Type used to be a row of four chips while status was already a
            select, so two controls doing the same job looked like two different
            kinds of thing — and the chip row grew a line every time a policy
            type was added. A select costs one row at any number of types. */}
        <div className="btoolbar__filters">
          <select
            aria-label="Filter by policy type"
            value={type}
            onChange={(e) => setType(e.target.value as PolicyType | 'All')}
            className={`btoolbar__select ${type !== 'All' ? 'is-set' : ''}`}
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t === 'All' ? 'All types' : t}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={`btoolbar__select ${status !== 'all' ? 'is-set' : ''}`}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="monitor">Monitor</option>
            <option value="inactive">Inactive</option>
          </select>
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
        <div className="btoolbar__right">
          <input
            type="search"
            placeholder="Search policies…"
            aria-label="Search policies"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="btoolbar__search"
          />
        </div>
      </div>

      <div className="btable-wrap">
        <div className="btable__scroll">
        <table className="btable">
          <thead>
            <tr>
              {head('name', 'Policy name')}
              {head('type', 'Type')}
              <th>Apps assigned</th>
              {head('rules', 'Rules')}
              {store.features.exposure && head('exposure', 'Exposure')}
              <th>Status</th>
              <th>Last modified</th>
              <th className="btable__right">Actions</th>
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
  const appNames = policy.appIds.map((id) => store.appById(id).name)

  return (
    <tr className={policy.isSystem ? 'is-system' : ''}>
      <td className="btable__primary">
        <button type="button" className="btable__link" onClick={() => store.go({ name: 'builder', policyId: policy.id })}>
          {policy.name}
        </button>
        <span className="btable__marks">
          {policy.isSystem && <Badge tone="system">System</Badge>}
          {policy.configIssue && <InfoDot text={policy.configIssue} />}
        </span>
      </td>
      <td>
        <Badge tone="info">{policy.type}</Badge>
      </td>
      <td>
        {policy.allApps ? (
          <span className="btable__allapps">All apps</span>
        ) : (
          <AppLogoStack appIds={policy.appIds} names={appNames} />
        )}
      </td>
      <td>
        {policy.rules.length === 0 ? (
          <span className="u-muted">No rules</span>
        ) : (
          <RulePeek policy={policy} />
        )}
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
                onClick={() => store.go({ name: 'builder', policyId: policy.id, open: 'gauntlet' })}
              >
                <i aria-hidden />
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
      <td className="u-muted">{policy.lastModified}</td>
      <td className="btable__right">
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
                <button role="menuitem" onClick={() => store.go({ name: 'builder', policyId: policy.id })}>
                  <Pencil size={14} strokeWidth={1.9} aria-hidden />
                  Edit policy
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
