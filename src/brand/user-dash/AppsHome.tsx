import { useMemo, useState } from 'react'
import { AppWindow, ChevronRight, EyeOff, Eye, Plus, Search, Star } from 'lucide-react'

import { shownOnDashboard } from '../app-setup'
import { EmptyState, NoMatches } from '../empty'
import { AppsArt } from '../empty-art'
import { NEW_EMPTY_ART } from '../empty-art-phase'
import { Button, IconButton } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { SHOWCASE } from '../showcase'
import { useBrand } from '../store'
import { RequestAppPopup } from './RequestAppPopup'
import { homeEmpty, homeSections, type AppLike } from './home'
import { useCheckup } from './use-configured'

/* -----------------------------------------------------------------------------
   The proposed Apps home (spec goal 1): the daily job stays one click from landing. Things to do (from the account
   checkup) sits above Favourites, Recently used and All apps; hidden apps come back with the live page's checkbox; an
   app that is not here can be asked for. No protocol names: they mean nothing to the person.
   -------------------------------------------------------------------------- */


export function AppsHome() {
  const store = useBrand()
  const { userDash: s, actUserDash, showToast, go } = store
  const { todo } = useCheckup()
  const [q, setQ] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [asking, setAsking] = useState(false)

  /* Hers: what the dashboard setting shows, plus any app an admin added for her through a request. */
  const mine = useMemo(() => store.apps.filter((a) => shownOnDashboard(a.setup) || s.granted.includes(a.id)), [store.apps, s.granted])
  const { favourites, recent, all } = homeSections(mine, s, q, showHidden)
  const empty = homeEmpty(mine.length, all.length, q)

  const open = (id: string, name: string) => {
    actUserDash({ type: 'open', appId: id })
    showToast(SHOWCASE ? `Opening ${name} is coming soon.` : `Opening ${name} is not built in this prototype.`)
  }

  const card = (a: AppLike) => {
    const fav = s.favourites.includes(a.id)
    const hidden = s.hidden.includes(a.id)
    return (
      <li key={a.id} className={`bud-app${hidden ? ' is-hidden' : ''}`}>
        <button type="button" className="bud-app__open" onClick={() => open(a.id, a.name)}>
          <AppLogo appId={a.id} name={a.name} size={36} />
          <span className="bud-app__name">{a.name}</span>
        </button>
        <span className="bud-app__tools">
          <IconButton
            icon={Star}
            size="sm"
            label={fav ? `Remove ${a.name} from favourites` : `Add ${a.name} to favourites`}
            pressed={fav}
            onClick={() => actUserDash({ type: 'favourite', appId: a.id })}
          />
          <IconButton
            icon={hidden ? Eye : EyeOff}
            size="sm"
            label={hidden ? `Show ${a.name}` : `Hide ${a.name}`}
            onClick={() => actUserDash({ type: 'hide', appId: a.id })}
          />
        </span>
      </li>
    )
  }

  const section = (title: string, list: AppLike[]) =>
    list.length > 0 && (
      <section className="bud-apps__sec" aria-label={title}>
        <h2>{title}</h2>
        <ul className="bud-apps__grid">{list.map(card)}</ul>
      </section>
    )

  return (
    <div className="bpage bud bud-apps">
      <header className="bud-head">
        <h1>Your apps</h1>
        <p>Apps your administrator has given you access to.</p>
      </header>

      {todo.length > 0 && (
        <button type="button" className="bud-todo" onClick={() => go({ name: 'account', page: 'overview' })}>
          <span className="bud-todo__title">Things to do</span>
          <span className="bud-todo__items">{todo.map((t) => t.todo).join(' · ')}</span>
          <ChevronRight size={16} strokeWidth={1.9} aria-hidden />
        </button>
      )}

      <div className="bud-apps__bar">
        <label className="bud-apps__search">
          <Search size={15} strokeWidth={1.9} aria-hidden />
          <input type="search" value={q} placeholder="Search apps…" aria-label="Search apps" onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="bud-apps__hidden">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          Show hidden apps
        </label>
        <Button variant="neutral" icon={Plus} onClick={() => setAsking(true)}>
          Request an app
        </Button>
      </div>

      {empty === 'none' ? (
        <EmptyState art={NEW_EMPTY_ART && <AppsArt badge="check" />} icon={AppWindow} title="No apps yet" blurb="Apps your administrator gives you access to appear here." />
      ) : empty === 'search' ? (
        <NoMatches noun="apps" query={q} onClear={() => setQ('')} />
      ) : empty === 'hidden' ? (
        <EmptyState
          icon={EyeOff}
          title="All your apps are hidden"
          action={
            <Button variant="neutral" onClick={() => setShowHidden(true)}>
              Show hidden apps
            </Button>
          }
        />
      ) : (
        <>
          {section('Favourites', favourites)}
          {section('Recently used', recent)}
          {section('All apps', all)}
        </>
      )}

      <RequestAppPopup open={asking} onClose={() => setAsking(false)} offered={store.apps.filter((a) => !mine.includes(a))} />
    </div>
  )
}
