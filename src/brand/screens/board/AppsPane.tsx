import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'

import { Button, SearchBox } from '../../kit'
import { NoMatches } from '../../empty'
import { enforces } from '../../data'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'
import type { ReadyFix } from '../guard'
import { GuardDrawer } from '../guard-page'
import { detailsChanges } from '../policy-details-review'
import { portalRoot } from '../status-options'
import { useAppsGuard } from './apps-guard'

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

   On an enforcing policy the save runs the checks first (final spec, D.2:
   Before saving: applications) — a new application is sign-ins it starts
   deciding, a removed one is sign-ins it hands to another policy. A clean
   result saves in the same press; the page opens only when a Must pass or
   Protected sign-in newly fails, or somebody is newly let in. The checks
   themselves are apps-guard.ts, which an application's own page runs too.
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
  const appsGuard = useAppsGuard()
  /* Undo on a ready fix's toast. It runs after later renders, so it reads the
     pane as it is then, not as it was when the fix was made (below). */
  const undoFix = useRef<(back: string[], fixed: string[]) => void>(() => {})
  /* The toast outlives the pane: an Undo pressed after it closed has nothing to put back. */
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  if (!saved) return null

  if (saved.isSystem) {
    return (
      <div className="bb__insphead">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2>Every application</h2>
          <p>The system policy covers every application. It decides sign-ins no other policy matches.</p>
        </div>
      </div>
    )
  }

  const appName = (id: string) => store.appById(id).name
  const diffOf = (ids: string[]) => detailsChanges(saved, { name: saved.name, appIds: ids }, appName)
  const diff = diffOf(picked)
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

  const commitApps = (ids: string[]) => {
    const d = diffOf(ids)
    store.savePolicy({ ...saved, appIds: ids, status: d.becomesDraft ? 'draft' : saved.status })
    store.showToast(d.becomesDraft ? `${saved.name} saved as a draft` : 'Applications saved')
    /* The pane has done its one job, so it closes (owner, 21 Sep 2026) — the
       start node now says the new list, and the toast says it was saved. */
    onSaved?.()
  }

  /* --- Before saving: applications (apps-guard.ts) ------------------------------ */
  const save = () => {
    if (!appsGuard.guards(saved)) return commitApps(picked)
    appsGuard.check(saved, picked, commitApps)
  }

  /* A ready fix here keeps or leaves out one application. It changes the
     ticks, not the policy: nothing is saved until Save applications. Undo puts
     the ticks back and, while the page is open, runs the checks on them. */
  const applyFix = (f: ReadyFix) => {
    const ids = f.policy.appIds
    const back = picked
    setPicked(ids)
    if (diffOf(ids).changes.length === 0) {
      appsGuard.close()
      store.showToast('Nothing left to save')
      return
    }
    store.showToast(`${f.label}. Not saved yet.`, { label: 'Undo', run: () => undoFix.current(back, ids) })
    appsGuard.rerun(ids)
  }
  undoFix.current = (back, fixed) => {
    if (!alive.current) return
    if (picked !== fixed) {
      store.showToast('Other changes came after it.')
      return
    }
    setPicked(back)
    if (appsGuard.open) appsGuard.rerun(back)
    store.showToast('Restored')
  }
  /* The ticks are the page's subject here: stale when they moved, and Run again reads them. */
  const page = appsGuard.page({ primaryLabel: 'Save applications', onConfirm: commitApps, current: picked, onApplyFix: applyFix })

  return (
    <div className="bb__apps">
      {/* No heading: the panel's bar already says Applications. */}
      <p className="bb__apps__lede">Sign-ins to these applications are decided by this policy’s rules.</p>

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
            {enforces(saved)
              ? 'With no applications this policy becomes a draft and stops deciding sign-ins.'
              : saved.status === 'monitor'
                ? 'With no applications this policy becomes a draft and stops monitoring.'
                : 'With no applications this policy becomes a draft.'}
            {diff.takesSavedDraft && ' Its saved draft replaces the published rules.'}
          </p>
        )}
        <Button
          variant="brand"
          size="sm"
          block
          disabled={!dirty || appsGuard.checking}
          busy={appsGuard.checking}
          title={dirty ? undefined : 'No changes to save'}
          onClick={save}
        >
          {appsGuard.checking ? 'Checking…' : 'Save applications'}
        </Button>
      </div>

      {page && createPortal(<GuardDrawer {...page} />, portalRoot())}
    </div>
  )
}
