import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ListFilter } from 'lucide-react'

import { Button, SearchBox } from '../kit'
import { NoMatches } from '../empty'
import { Picker } from '../picker'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'
import { SHOWCASE } from '../showcase'
import {
  ALL_CATALOG,
  APP_CATALOG,
  CATALOG_SHOWS,
  CATALOG_TYPES,
  featuredOf,
  filterCatalog,
  isNarrowed,
  protocolCaption,
  type CatalogApp,
  type CatalogFilter,
  type CatalogShow,
  type CatalogType,
} from './app-catalog'
import { notBuilt } from './directory-model'
import { PageBar } from './page-bar'
import './app-catalog.css'

/* -----------------------------------------------------------------------------
   Choose application: Apps → Add application, the live console's catalogue
   (spec APP-CREATE-AND-ACCESS.md §3.1). The model is app-catalog.ts.

   The head is the application page's — the way back, then the name — because
   this is a step under Applications, not a page of the rail. No caption: the
   heading and the tiles say what the page is for.

   One bar, the live page's controls in its order: the search, Type, the live
   "Show custom apps only" as a Show dropdown (the bar's filter shape, not a
   toggle among dropdowns), and Submit new app request against the right edge.
   That last is a link, not a boxed button: it leaves this page for something
   that is not built, and it is not the page's action — choosing a tile is.
   So the page has no orange button at all.

   Featured apps leads only while nothing narrows the page; under a search it
   would repeat the tiles All apps lists beneath it. All apps has no pager and
   no total: sixteen tiles fit, and "1–16 of 16" would be a number said twice.

   A tile is a button: the logo, the name and the live protocol caption. An
   entry the tenant already has is not marked (owner, 13 Oct 2026: remove the
   Added pill); it can be chosen again, and the second one is named
   "Salesforce 2".
   -------------------------------------------------------------------------- */

export function AppCatalog({ start }: { start?: Partial<CatalogFilter> } = {}) {
  const store = useBrand()
  /* `start` is how a test lands on a searched or filtered page; the route never sets it. */
  const [filter, setFilter] = useState<CatalogFilter>({ ...ALL_CATALOG, ...start })
  const set = (patch: Partial<CatalogFilter>) => setFilter((f) => ({ ...f, ...patch }))

  const shown = useMemo(() => filterCatalog(APP_CATALOG, filter), [filter])
  const narrowed = isNarrowed(filter)
  const featured = narrowed ? [] : featuredOf(APP_CATALOG)

  /* The heading takes focus on arrival, as an application's page does: the
     Add application button that opened this went with the page it was on. */
  const heading = useRef<HTMLHeadingElement | null>(null)
  useEffect(() => {
    const active = document.activeElement
    if (!active || active === document.body) heading.current?.focus({ preventScroll: true })
  }, [])

  const choose = (entry: CatalogApp) => store.go({ name: 'application-new', catalogId: entry.id })

  return (
    <div className="bpage bapc">
      <button type="button" className="bz7__back" onClick={() => store.go({ name: 'applications' })}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        All applications
      </button>

      <header className="bz7__pagehead">
        <h1 ref={heading} tabIndex={-1}>
          Choose application
        </h1>
      </header>

      <PageBar
        left={
          <>
            <SearchBox
              value={filter.query}
              onChange={(query) => set({ query })}
              placeholder="Search applications…"
              label="Search applications"
            />
            <span className={`btoolbar__filter bbar__filter ${filter.type !== 'all' ? 'is-set' : ''}`}>
              <Picker
                label="Filter by type"
                size="md"
                icon={ListFilter}
                prefix="Type"
                value={filter.type}
                options={CATALOG_TYPES}
                onChange={(v) => set({ type: v as CatalogType })}
              />
            </span>
            <span className={`btoolbar__filter bbar__filter ${filter.show !== 'all' ? 'is-set' : ''}`}>
              <Picker
                label="Filter by custom apps"
                size="md"
                icon={ListFilter}
                prefix="Show"
                value={filter.show}
                options={CATALOG_SHOWS}
                onChange={(v) => set({ show: v as CatalogShow })}
              />
            </span>
          </>
        }
        right={
          <Button variant="link" onClick={() => store.showToast(notBuilt('Submitting app requests', SHOWCASE))}>
            Submit new app request
          </Button>
        }
      />

      {shown.length === 0 ? (
        <NoMatches
          noun="applications"
          query={filter.query}
          filtered={filter.type !== 'all' || filter.show !== 'all'}
          onClear={() => setFilter(ALL_CATALOG)}
        />
      ) : (
        <>
          {featured.length > 0 && (
            <CatalogSection id="bapc-featured" title="Featured apps" entries={featured} onChoose={choose} />
          )}
          <CatalogSection id="bapc-all" title="All apps" entries={shown} onChoose={choose} />
        </>
      )}
    </div>
  )
}

/* A heading and its tiles. A list, so a screen reader says how many tiles the
   section holds — the count the page itself never prints. */
function CatalogSection({
  id,
  title,
  entries,
  onChoose,
}: {
  id: string
  title: string
  entries: CatalogApp[]
  onChoose: (entry: CatalogApp) => void
}) {
  return (
    <section className="bapc__section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul className="bapc__grid">
        {entries.map((e) => (
          <li key={e.id}>
            <CatalogTile entry={e} onChoose={() => onChoose(e)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/* The logo is a mark beside the name, so it is left out of the button's name,
   which is the tile's words: the name and the protocol. */
function CatalogTile({ entry, onChoose }: { entry: CatalogApp; onChoose: () => void }) {
  return (
    <button type="button" className="bapc__tile" onClick={onChoose}>
      <span className="bapc__logo" aria-hidden>
        <AppLogo appId={entry.logoId} name={entry.name} size={32} />
      </span>
      <span className="bapc__text">
        <span className="bapc__name">{entry.name}</span>
        <span className="bapc__meta">
          <span className="bapc__proto">{protocolCaption(entry.protocol)}</span>
        </span>
      </span>
    </button>
  )
}
