import { useMemo, useState } from 'react'
import { AppWindow, Search } from 'lucide-react'

import { EmptyState, NoMatches } from '../empty'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   The end user's landing screen: the apps they can sign in to.

   Copied in structure from the live end-user dashboard: a heading, a search and
   the app cards. The live page's "Show hidden apps" checkbox is left out: no
   app here can be hidden, so it would do nothing.
   -------------------------------------------------------------------------- */

export function UserApps() {
  const { apps, showToast } = useBrand()
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return apps
    return apps.filter((a) => a.name.toLowerCase().includes(needle))
  }, [apps, q])

  return (
    <div className="bpage buapps">
      <header className="buapps__head">
        <h1>Sign in to your apps</h1>
        <p>Apps your administrator has given you access to.</p>
      </header>

      {apps.length === 0 ? (
        <EmptyState
          icon={AppWindow}
          title="No apps yet"
          blurb="Apps your administrator gives you access to appear here."
        />
      ) : (
        <>
          <div className="buapps__bar">
            <label className="buapps__search">
              <Search size={15} strokeWidth={1.9} aria-hidden />
              <input
                type="search"
                value={q}
                placeholder="Search apps…"
                aria-label="Search apps"
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </div>

          {shown.length === 0 ? (
            <NoMatches noun="apps" query={q} onClear={() => setQ('')} />
          ) : (
            <ul className="buapps__grid">
              {shown.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="buapps__card"
                    onClick={() => showToast(`Opening ${a.name} is not built in this prototype.`)}
                  >
                    <AppLogo appId={a.id} name={a.name} size={40} />
                    <span className="buapps__name">{a.name}</span>
                    <span className="buapps__proto">{a.protocol}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
