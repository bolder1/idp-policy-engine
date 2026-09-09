import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LayoutGrid, Pencil, Plus, Rows3, Table2, Trash2 } from 'lucide-react'

import { Button } from '../kit'
import { NoResults } from '../empty'
import { PageHead } from '../Shell'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'
import type { App } from '../data'
import { summarise, type AppSummary } from './app-policies'
import { AppProtection } from './AppProtection'
import { NewPolicyDialog } from '../create/NewPolicyDialog'

/* -----------------------------------------------------------------------------
   Applications — the console's own Apps page, and the one place an application
   says what protects it.

   The four columns, the search, the button and the pager are the real page's,
   reproduced: "Application Name", "App Type", "Last Updated", "Actions", a
   "Search Application" box, an "Add Application" button, and a "1–10 of 10"
   footer with two chevrons. A fifth column, Protection, is the new one — see
   the note on it below for why it earns the place.

   What is deliberately NOT here is a menu item that attaches a policy. The row
   menu offers Edit and Delete and stops. Attaching is a decision with a
   consequence — it can take a policy off another application — and a decision
   with a consequence does not belong behind a kebab where it is made by the
   act of finding it. It has a form, in a panel, where the choice between a new
   policy and an existing one is visible before either is made.
   -------------------------------------------------------------------------- */

type SortKey = 'name' | 'type' | 'protection' | 'updated'

/* Ten fixture applications page in one go, so the pager sits at both ends
   disabled — which is exactly what the live page does with its single row and
   its "1–1 of 1". It pages for real rather than being drawn and dead: a
   control that cannot be pressed is honest, a control that can be pressed and
   does nothing is not. */
const PAGE_SIZE = 10

export function Applications() {
  const store = useBrand()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [page, setPage] = useState(0)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  /** Which application's protection panel is open. Null is closed. */
  const [panelFor, setPanelFor] = useState<string | null>(null)
  /** The name dialog, over the panel. See the two kit notes at the foot. */
  const [naming, setNaming] = useState(false)
  /** The policy the dialog just made, so the panel can mark its arrival. */
  const [added, setAdded] = useState<string | null>(null)

  const summaries = useMemo(() => {
    const m = new Map<string, AppSummary>()
    for (const a of store.apps) m.set(a.id, summarise(a.id, store.policies))
    return m
  }, [store.apps, store.policies])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const kept = q
      ? store.apps.filter((a) => a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q))
      : [...store.apps]

    /* `updated` sorts by the order the fixture states, not by parsing the
       display string. A pre-formatted date is a sentence, and parsing
       sentences to sort them is how a list starts disagreeing with itself
       about which of two rows is newer. */
    const order = new Map(store.apps.map((a, i) => [a.id, i]))
    const cmp: Record<SortKey, (a: App, b: App) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      type: (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
      updated: (a, b) => order.get(a.id)! - order.get(b.id)!,
      protection: (a, b) => {
        const s = summaries.get(a.id)!
        const t = summaries.get(b.id)!
        return s.decides - t.decides || s.own - t.own || a.name.localeCompare(b.name)
      },
    }
    return kept.sort((a, b) => cmp[sort.key](a, b) * sort.dir)
  }, [store.apps, query, sort, summaries])

  const total = rows.length
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)
  const shown = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const head = (key: SortKey, label: string) => {
    const on = sort.key === key
    return (
      <th
        className={on ? 'is-sorted' : ''}
        scope="col"
        aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          className={`btable__sort ${on ? 'is-on' : ''}`}
          onClick={() => {
            setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }))
            setPage(0)
          }}
        >
          {label}
          <span aria-hidden>{on ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
        </button>
      </th>
    )
  }

  return (
    /* The wrapper is the only outside-click dismisser for the row menu — the
       same three-part pattern the policies table uses, with no document
       listener and no effect to leak. */
    <div className="bpage bapl" onClick={() => setMenuFor(null)}>
      <PageHead
        title="Applications"
        caption="Every application connected to this tenant."
        actions={
          <>
          <Button variant="brand" onClick={() => store.showToast('Adding an application is outside this revamp')}>
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            Add application
          </Button>
          <div className="bviewswitch bapl__viewswitch" role="tablist" aria-label="Application view">
            <button role="tab" aria-selected className="is-on" aria-label="Table view">
              <Table2 size={15} strokeWidth={1.9} aria-hidden />
            </button>
            {/* Three toggles is what the live page carries, and the other two
                were never opened — nobody knows what its list and grid render.
                So they are here, because the page has them, and disabled with
                the console's own sentence for this, the one the rail puts on
                Identity Providers. Guessing at two unseen layouts and shipping
                the guess as fidelity would be the worse lie. */}
            <button
              role="tab"
              aria-selected={false}
              disabled
              aria-label="List view"
              title="Outside the scope of this revamp"
            >
              <Rows3 size={15} strokeWidth={1.9} aria-hidden />
            </button>
            <button
              role="tab"
              aria-selected={false}
              disabled
              aria-label="Card view"
              title="Outside the scope of this revamp"
            >
              <LayoutGrid size={15} strokeWidth={1.9} aria-hidden />
            </button>
          </div>
          </>
        }
      />

      {/* One toolbar shape on every list screen: what narrows the list on the
          left, what counts or reframes it on the right, and the primary action
          in the page head with the title it belongs to.

          This page had the primary button down here instead, on the argument
          that the live console puts it there. It does — and the cost was that
          "Add Application" and "New policy" sat at two different heights on two
          pages one nav click apart, so the one control an admin reaches for
          most had no fixed home. Fidelity to a single screen is worth less than
          the console agreeing with itself. */}
      <div className="btoolbar">
        <div className="btoolbar__filters">
          <input
            type="search"
            placeholder="Search applications…"
            aria-label="Search applications"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            className="btoolbar__search bapl__search"
          />
        </div>
        <div className="btoolbar__right">
          <span className="btoolbar__count">{total === 1 ? '1 application' : `${total} applications`}</span>
        </div>
      </div>

      <div className="btable-wrap">
        <div className="btable__scroll">
          <table className="btable">
            <thead>
              <tr>
                {head('name', 'Application Name')}
                {head('type', 'App Type')}
                {head('protection', 'Protection')}
                {head('updated', 'Last Updated')}
                <th scope="col" className="btable__right btable__col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <AppRow
                  key={a.id}
                  app={a}
                  summary={summaries.get(a.id)!}
                  menuOpen={menuFor === a.id}
                  onMenu={(e) => {
                    e.stopPropagation()
                    setMenuFor((m) => (m === a.id ? null : a.id))
                  }}
                  onOpen={() => setPanelFor(a.id)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {total === 0 && (
          <div className="btable__empty">
            <NoResults>No applications match that search.</NoResults>
            <Button onClick={() => setQuery('')}>Clear search</Button>
          </div>
        )}

        <footer className="btable__foot bapl__foot">
          <span>{total === 0 ? '0 of 0' : `${from}–${to} of ${total}`}</span>
          <span className="bapl__pager">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ‹
            </button>
            <button type="button" aria-label="Next page" disabled={to >= total} onClick={() => setPage((p) => p + 1)}>
              ›
            </button>
          </span>
        </footer>
      </div>

      {/* SIBLINGS, and the dialog second. Two kit facts make this the only
          arrangement that works, and both look like untidiness to anyone who
          has not hit them:

          `Modal` does not portal. Its scrim is `position: fixed; inset: 0`, and
          `Drawer` renders an aside carrying a transform — which makes that
          aside the containing block for any fixed descendant. A dialog rendered
          inside the drawer would centre itself inside the drawer and clip.
          Both sit at `--z-modal`, and equal z-index resolves on DOM order, so
          the dialog must come second to land on top.

          `Drawer` also does not join `Modal`'s Escape stack — its handler is
          unconditional — so one Escape would close the panel out from under
          the dialog and take the half-typed name with it. The panel declines
          to close while the dialog is up; the real repair belongs in the kit,
          with the five other drawers, not here. */}
      <AppProtection
        appId={panelFor}
        naming={naming}
        justAdded={added}
        onClose={() => setPanelFor(null)}
        onNew={() => setNaming(true)}
      />
      <NewPolicyDialog
        open={naming}
        fixedAppId={panelFor ?? undefined}
        onClose={() => setNaming(false)}
        onCreate={(policy) => {
          store.addPolicy(policy)
          store.showToast(`${policy.name} created on ${store.appById(policy.appId!).name}`)
          setAdded(policy.id)
          setNaming(false)
        }}
      />
    </div>
  )
}

function AppRow({
  app,
  summary,
  menuOpen,
  onMenu,
  onOpen,
}: {
  app: App
  summary: AppSummary
  menuOpen: boolean
  onMenu: (e: React.MouseEvent) => void
  onOpen: () => void
}) {
  const store = useBrand()
  return (
    <tr>
      <td className="btable__primary">
        <span className="btable__app">
          <AppLogo appId={app.id} name={app.name} size={20} />
          {/* The name opens the protection panel, not an application-config
              page this prototype does not have. The ROW is not clickable: a
              row-wide target makes the text unselectable and puts a hit area
              underneath the kebab. */}
          <button type="button" className="btable__link" onClick={onOpen}>
            {app.name}
          </button>
        </span>
      </td>
      <td className="u-muted">{app.type}</td>
      <td>
        <ProtectionCell app={app} summary={summary} onOpen={onOpen} />
      </td>
      {/* Without the seconds. "Sep 02, 2026, 09:30:11" is eleven characters of
          precision nobody reads on a list, and it made Last Updated the widest
          column on the table — wide enough to push Actions off the edge at
          1280px. The full stamp is on hover. */}
      <td className="u-muted" title={app.lastUpdated}>
        {app.lastUpdated.replace(/:\d\d$/, '')}
      </td>
      <td className="btable__right">
        <div className="btable__menuwrap">
          <button
            type="button"
            className="btable__kebab"
            onClick={onMenu}
            aria-label={`Actions for ${app.name}`}
            aria-expanded={menuOpen}
          >
            ⋯
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="bmenu"
                role="menu"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.13 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Two items, and no "Attach policy…" among them. That is the
                    point of the panel: attaching can take a policy off another
                    application, and a consequence like that is not something to
                    discover by opening a menu. */}
                <button
                  role="menuitem"
                  onClick={() => store.showToast('Editing an application is outside this revamp')}
                >
                  <Pencil size={14} strokeWidth={1.9} aria-hidden />
                  Edit application
                </button>
                <span className="bmenu__rule" />
                <button
                  role="menuitem"
                  className="is-danger"
                  onClick={() => store.showToast('Deleting an application is outside this revamp')}
                >
                  <Trash2 size={14} strokeWidth={1.9} aria-hidden />
                  Delete application
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </td>
    </tr>
  )
}

/* What protects this application, without opening anything.

   The count alone would overstate it. Three policies of which one is switched
   off is not "3 policies" in any sense somebody auditing coverage cares about,
   so the shortfall gets its own words and the dot carries whether anything is
   outstanding — the same argument the authentication-methods summary makes for
   its own collapsed rows: a summary that hides whether there is a problem is
   not a summary, it is a lid. */
function ProtectionCell({ app, summary, onOpen }: { app: App; summary: AppSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`bapl__prot is-${summary.tone}`}
      onClick={onOpen}
      title={summary.title}
      aria-label={`${summary.label}${summary.tag ? `, ${summary.tag}` : ''} — open protection for ${app.name}`}
    >
      <span>{summary.label}</span>
      {summary.tag && <em>{summary.tag}</em>}
    </button>
  )
}
