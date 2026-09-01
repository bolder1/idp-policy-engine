import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

import { LayoutGrid } from 'lucide-react'
import { EmptyState } from '../empty'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   The end user's landing screen: the apps they can sign in to.

   Copied in structure from the live end-user dashboard — the heading is its
   sentence, there is a search, there is a "show hidden apps" checkbox, and when
   there is nothing it says "No Apps Found" over a drawing.

   It is a launcher and nothing else, which is the point of including it. Half
   of what makes the two sides feel different is not this screen's content but
   its neighbours: an admin's landing screen is a list of policies with a rail
   of fourteen destinations beside it, and a person's is this, with two.
   -------------------------------------------------------------------------- */

export function UserApps() {
  const { apps } = useBrand()
  const [q, setQ] = useState('')
  const [hidden, setHidden] = useState(false)

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return apps
    return apps.filter((a) => a.name.toLowerCase().includes(needle))
  }, [apps, q])

  return (
    <div className="bpage buapps">
      <header className="buapps__head">
        <h1>Sign in to your apps</h1>
        <p>Everything your administrator has given you access to. Opening one signs you in.</p>
      </header>

      <div className="buapps__bar">
        <label className="buapps__search">
          <Search size={15} strokeWidth={1.9} aria-hidden />
          <input
            type="text"
            value={q}
            placeholder="Search apps…"
            aria-label="Search apps"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="buapps__hidden">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Show hidden apps
        </label>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={q ? 'No apps match that' : 'No apps yet'}
          blurb={
            q
              ? 'The search reads app names only — try part of one.'
              : 'When your administrator gives you access to an app it appears here, and one click signs you in.'
          }
        />
      ) : (
        <ul className="buapps__grid">
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" className="buapps__card">
                <AppLogo appId={a.id} name={a.name} size={40} />
                <span className="buapps__name">{a.name}</span>
                <span className="buapps__proto">{a.protocol}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
