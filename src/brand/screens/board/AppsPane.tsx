import { useState } from 'react'
import { Check } from 'lucide-react'

import { Button, SearchBox } from '../../kit'
import { NoMatches } from '../../empty'
import { evaluates } from '../../data'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'
import { detailsChanges } from '../policy-details-review'

/* -----------------------------------------------------------------------------
   The applications a sign-in arrives from — the start node's pane.

   Every application, ticked where the policy protects it. The ones it protects
   when the pane opens are listed first, so a policy on two apps out of thirty
   does not scatter its answer down a scroller. That order is a snapshot: a
   row does not jump to the top under the pointer that just ticked it.

   It saves straight to the policy, the way Policy details does, and not into
   the rules' draft. The applications are a fact about the policy rather than
   a rule edit — mixing them into the rules' undo stack would make ⌘Z quietly
   unassign an application — and removing the last one takes a live policy to
   draft, which is a change worth a button press rather than a tick.
   -------------------------------------------------------------------------- */

export function AppsPane({ policyId, onSaved }: { policyId: string; /** After a save: the board closes the pane. */ onSaved?: () => void }) {
  const store = useBrand()
  const saved = store.policyById(policyId)
  const [picked, setPicked] = useState<string[]>(saved?.appIds ?? [])
  const [q, setQ] = useState('')
  const [order] = useState<string[]>(() => {
    const on = new Set(saved?.appIds ?? [])
    return [...store.apps.filter((a) => on.has(a.id)), ...store.apps.filter((a) => !on.has(a.id))].map((a) => a.id)
  })

  if (!saved) return null

  if (saved.isSystem) {
    return (
      <div className="bb__insphead">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2>Every application</h2>
          <p>The system policy covers every application. It decides logins no other policy matches.</p>
        </div>
      </div>
    )
  }

  const diff = detailsChanges(saved, { name: saved.name, appIds: picked }, (id) => store.appById(id).name)
  const dirty = diff.changes.length > 0
  const query = q.trim().toLowerCase()
  const rows = order
    .map((id) => store.apps.find((a) => a.id === id))
    .filter((a) => a !== undefined)
    .filter((a) => !query || a.name.toLowerCase().includes(query) || a.protocol.toLowerCase().includes(query))

  /* Catalogue order, not click order — `appsOf` reads it back that way, and
     two orders for one list is how a "changed" check fires on nothing. */
  const toggle = (id: string) =>
    setPicked((now) =>
      now.includes(id) ? now.filter((x) => x !== id) : store.apps.filter((a) => a.id === id || now.includes(a.id)).map((a) => a.id),
    )

  const save = () => {
    store.savePolicy({ ...saved, appIds: picked, status: diff.becomesDraft ? 'draft' : saved.status })
    store.showToast(diff.becomesDraft ? `${saved.name} saved as a draft` : 'Applications saved')
    /* The pane has done its one job, so it closes (owner, 21 Sep 2026) — the
       start node now says the new list, and the toast says it was saved. */
    onSaved?.()
  }

  return (
    <div className="bb__apps">
      {/* No heading: the panel's bar already says Applications. */}
      <p className="bb__apps__lede">Logins to these applications are decided by this policy’s rules.</p>

      <div className="bb__apps__body">
        <SearchBox block value={q} onChange={setQ} placeholder="Search applications" label="Search applications" />
        <p className="bb__apps__count">{picked.length === 0 ? 'None selected' : `${picked.length} selected`}</p>
        <div className="bb__apps__list" role="group" aria-label="Applications">
          {rows.length === 0 && <NoMatches compact noun="applications" query={q} onClear={() => setQ('')} />}
          {rows.map((a) => {
            const on = picked.includes(a.id)
            return (
              <button
                key={a.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`bb__apps__item${on ? ' is-on' : ''}`}
                onClick={() => toggle(a.id)}
              >
                <span className="bx-tick" aria-hidden>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
                <AppLogo appId={a.id} name={a.name} size={18} />
                <b>{a.name}</b>
                <em>{a.protocol}</em>
              </button>
            )
          })}
        </div>
      </div>

      <div className="bb__apps__foot">
        {/* "Stops deciding sign-ins" only where it was deciding them. */}
        {dirty && diff.becomesDraft && (
          <p className="bb__apps__note">
            {evaluates(saved)
              ? 'With no applications this policy becomes a draft and stops deciding logins.'
              : 'With no applications this policy becomes a draft.'}
            {diff.takesSavedDraft && ' Its saved draft replaces the published rules.'}
          </p>
        )}
        <Button variant="brand" size="sm" block disabled={!dirty} title={dirty ? undefined : 'No changes to save'} onClick={save}>
          Save applications
        </Button>
      </div>
    </div>
  )
}
