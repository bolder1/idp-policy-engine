import { useMemo, useState } from 'react'
import { SearchBox } from '../kit'
import { useBrand } from '../store'
import { AppTile } from './parts'
import { OldCard } from './review-split'
import type { LegacyPolicy } from './legacy'
import './review-v2.css'
import './review-split.css'

/* -----------------------------------------------------------------------------
   Policies, Old policies tab (owner, 6 Nov 2026: "in the old policy, showcase all the
   policies in a view detail format, no need to add anything else"). Every old App
   Login row still in the console, read-only, as the same detail cards the builder's
   Old policies panel draws: who, which application, how they sign in, its Adaptive
   Access checks. Grouped by application, a search on top. Nothing to press but the
   cards themselves, which only hold themselves in view.
   -------------------------------------------------------------------------- */

export function OldPoliciesTab() {
  const store = useBrand()
  const [q, setQ] = useState('')
  const [pinned, setPinned] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const appName = (id: string) => store.moveApps.find((a) => a.id === id)?.name ?? id
  const groups = useMemo(() => {
    const key = q.trim().toLowerCase()
    const rows = store.legacy.policies.filter((lp) => !key || `${lp.name} ${appName(lp.appId)}`.toLowerCase().includes(key))
    const by = new Map<string, LegacyPolicy[]>()
    for (const lp of rows) by.set(lp.appId, [...(by.get(lp.appId) ?? []), lp])
    return [...by.entries()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.legacy.policies, q, store.moveApps])

  return (
    <div className="bold-tab">
      <div className="bold-tab__bar">
        <SearchBox value={q} onChange={setQ} placeholder="Search old policies or applications" label="Search old policies" />
      </div>
      {groups.length === 0 ? (
        <p className="bold-tab__empty">{q ? 'No old policies match.' : 'No old policies are left. Every one has moved.'}</p>
      ) : (
        groups.map(([appId, rows]) => (
          <section key={appId} className="bold-tab__app" aria-label={appName(appId)}>
            <h3 className="bold-tab__apphead">
              <AppTile appId={appId} size={20} />
              {appName(appId)}
            </h3>
            <ol className="bold-tab__grid">
              {rows.map((lp, i) => (
                <OldCard key={lp.id} index={i + 1} lp={lp} became="" on={hover === lp.id} linked={false} pinned={pinned === lp.id} onHover={() => setHover(lp.id)} onPin={() => setPinned((p) => (p === lp.id ? null : lp.id))} />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  )
}
