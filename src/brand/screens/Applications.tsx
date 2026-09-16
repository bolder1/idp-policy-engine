import { useEffect, useMemo, useState } from 'react'
import { AppWindow, Pencil, Plus, Trash2 } from 'lucide-react'

import { Button, RowMenu, SearchBox, type MenuItem } from '../kit'
import { EmptyState, NoMatches } from '../empty'
import { PageHead } from '../Shell'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'
import type { App } from '../data'
import { summarise, type AppSummary } from './app-policies'
import { compareUpdated } from './applications-model'
import { AppProtection } from './AppProtection'
import { ListPager } from './list-pager'
import { usePagedList } from './paged-list'
import { PageBar } from './page-bar'
import { ViewSwitch } from './library-view'
import { LIB_VIEWS } from './library-view-state'

/* -----------------------------------------------------------------------------
   Applications — the console's own Apps page, and the one place an application
   says what protects it.

   The columns, the search, the button and the pager follow the live page. The
   Protection column is new.

   The row menu offers Edit and Delete and nothing else. Attaching a policy has
   a form, in the protection panel, where new and existing are both visible
   before either is chosen.
   -------------------------------------------------------------------------- */

type SortKey = 'name' | 'type' | 'protection' | 'updated'

/* A table row's height. The page shows as many as fit the window and pages the
   rest, like every other paged page, so the pager sits on the bottom edge and
   the page never scrolls (16 Sep 2026). It was a fixed ten, which is taller
   than a laptop window. */
const ROW_H = 52

const NOT_BUILT = 'Not built in this prototype.'
const APP_VIEWS = LIB_VIEWS.map((v) => (v.id === 'table' ? v : { ...v, disabled: true, note: NOT_BUILT }))

const ROW_ACTIONS: MenuItem[] = [
  { id: 'edit', label: 'Edit application', icon: Pencil },
  { id: 'delete', label: 'Delete application', icon: Trash2, danger: true, divide: true },
]

export function Applications() {
  const store = useBrand()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  /** Which application's protection panel is open. Null is closed. */
  const [panelFor, setPanelFor] = useState<string | null>(null)
  /** The policy the panel just made, so the panel can mark its arrival. Cleared when the panel changes. */
  const [added, setAdded] = useState<string | null>(null)

  useEffect(() => {
    setAdded(null)
  }, [panelFor])

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

    const cmp: Record<SortKey, (a: App, b: App) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      type: (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
      updated: compareUpdated,
      protection: (a, b) => {
        const s = summaries.get(a.id)!
        const t = summaries.get(b.id)!
        return s.decides - t.decides || s.own - t.own || a.name.localeCompare(b.name)
      },
    }
    return kept.sort((a, b) => cmp[sort.key](a, b) * sort.dir)
  }, [store.apps, query, sort, summaries])

  /* A new search or sort starts at the first page; a list that shrank under the
     current page shows its last page rather than an empty one — both are the
     hook's. */
  const paged = usePagedList(rows, { rowHeight: ROW_H, resetKey: [query, sort] })
  const total = rows.length
  const shown = paged.pageRows

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
          onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }))}
        >
          {label}
          <span aria-hidden>{on ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
        </button>
      </th>
    )
  }

  const addApp = () => store.showToast('Adding applications is not built in this prototype.')
  const empty = store.apps.length === 0

  return (
    <div className="bpage bapl">
      <PageHead title="Applications" caption="Every application connected to this tenant." />

      {empty ? (
        <EmptyState
          icon={AppWindow}
          title="No applications yet"
          blurb="Connect an application to protect its sign-ins with a policy."
          action={
            <Button variant="brand" onClick={addApp}>
              <Plus size={15} strokeWidth={2.2} aria-hidden />
              Add application
            </Button>
          }
        />
      ) : (
        <>
          {/* The row every list page has — see `PageBar`: the search box on the
              left (no filter worth adding), the view and Add on the right. */}
          <PageBar
            left={
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="Search applications…"
                label="Search applications"
              />
            }
            right={
              <>
                {/* The live page has three views; the other two were never seen,
                    so they are disabled rather than guessed at. */}
                <ViewSwitch value="table" onChange={() => {}} label="Application view" views={APP_VIEWS} />
                <Button variant="brand" onClick={addApp}>
                  <Plus size={15} strokeWidth={2.2} aria-hidden />
                  Add application
                </Button>
              </>
            }
          />

          {total === 0 ? (
            <NoMatches
              noun="applications"
              query={query}
              onClear={() => setQuery('')}
            />
          ) : (
            <div className="btable-wrap">
              <div className="btable__scroll">
                <table className="btable">
                  <thead>
                    <tr>
                      {head('name', 'Application name')}
                      {head('type', 'App type')}
                      {head('protection', 'Protection')}
                      {head('updated', 'Last updated')}
                      <th scope="col" className="btable__actions btable__col-actions">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody ref={paged.listRef}>
                    {shown.map((a) => (
                      <AppRow key={a.id} app={a} summary={summaries.get(a.id)!} onOpen={() => setPanelFor(a.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* At the bottom of the page, as on every paged page — it was the
              table's footer, and so sat wherever the table happened to end. */}
          {total > 0 && (
            <ListPager {...paged.pager} label="Application pages" />
          )}
        </>
      )}

      {/* Naming a new policy is a page inside the panel, not a dialog over it. */}
      <AppProtection
        appId={panelFor}
        justAdded={added}
        onClose={() => setPanelFor(null)}
        onCreate={(policy) => {
          const id = store.addPolicy(policy)
          const app = store.apps.find((a) => a.id === policy.appIds[0])
          store.showToast(app ? `${policy.name} created as a draft on ${app.name}.` : `${policy.name} created as a draft.`)
          setAdded(id)
        }}
      />
    </div>
  )
}

function AppRow({ app, summary, onOpen }: { app: App; summary: AppSummary; onOpen: () => void }) {
  const store = useBrand()
  return (
    <tr>
      <td className="btable__primary">
        <span className="btable__app">
          <AppLogo appId={app.id} name={app.name} size={20} />
          {/* The name opens the protection panel. The row itself is not a
              target, so its text stays selectable and the kebab stays clear. */}
          <button type="button" className="btable__link" onClick={onOpen}>
            {app.name}
          </button>
        </span>
      </td>
      <td className="u-muted">{app.type}</td>
      <td>
        <ProtectionCell app={app} summary={summary} onOpen={onOpen} />
      </td>
      {/* Without the seconds; the full stamp is on hover. */}
      <td className="u-muted" title={app.lastUpdated}>
        {app.lastUpdated.replace(/:\d\d$/, '')}
      </td>
      <td className="btable__actions">
        <RowMenu
          label={`Actions for ${app.name}`}
          items={ROW_ACTIONS}
          onSelect={(id) =>
            store.showToast(id === 'edit' ? 'Editing applications is not built in this prototype.' : 'Deleting applications is not built in this prototype.')
          }
        />
      </td>
    </tr>
  )
}

/* What protects this application, without opening anything: the count, and the
   shortfall when there is one. */
function ProtectionCell({ app, summary, onOpen }: { app: App; summary: AppSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`bapl__prot is-${summary.tone}`}
      onClick={onOpen}
      title={summary.title}
      aria-label={`${summary.label}${summary.tag ? `, ${summary.tag}` : ''}. Open protection for ${app.name}`}
    >
      <span>{summary.label}</span>
      {summary.tag && <em>{summary.tag}</em>}
    </button>
  )
}
