import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppWindow, Users } from 'lucide-react'

import { Button } from '../../kit'
import { enforces, type Audience } from '../../data'
import { AppLogo } from '../../logos/AppLogo'
import { useBrand } from '../../store'
import type { ReadyFix } from '../guard'
import { GuardDrawer } from '../guard-page'
import { audienceLabel } from '../app-standing'
import { ownerOf } from '../app-policies'
import { AppTransfer } from '../app-transfer'
import { detailsChanges } from '../policy-details-review'
import { portalRoot } from '../status-options'
import { isPostSignIn } from '../../post-sign-in'
import { useAppsGuard } from './apps-guard'
import { linkedRows } from './post-board'
import { AudienceEditor } from './WhoEditor'

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

   WHO, above the applications (owner, 13 Oct 2026): the policy's audience is
   seen and changed here, at the start node, and nowhere else on the board —
   picking groups from an application's page was ruled out the same day. It is
   a standing fact of the policy as the applications are, so it saves with
   them, by the same button and through the same checks: narrowing a live
   policy to some groups hands everyone else to whatever decides for them next.

   A SMALL FORM (owner, 23 Oct 2026: "fix this design … make the form smaller,
   no need to stretch for no reason, redo"). The panel's bar says Applications,
   so the form does not say it again, and the sentence explaining what the list
   is for has gone. What an empty list does to the policy is said under the
   chips, where the list is emptied, and only then: the foot holds two buttons
   and no words. Save is the panel's, so it is grey, beside a Cancel that drops
   the picks and closes; the bar keeps the one orange Save policy.
   -------------------------------------------------------------------------- */

export function AppsPane({
  policyId,
  onSaved,
  onCancel,
}: {
  policyId: string
  /** After a save: the board closes the pane. */
  onSaved?: () => void
  /** Cancel: the picks are dropped and the board closes the pane, as its × does. */
  onCancel?: () => void
}) {
  const store = useBrand()
  const saved = store.policyById(policyId)
  const [picked, setPicked] = useState<string[]>(saved?.appIds ?? [])
  const [aud, setAud] = useState<Audience | null>(null)
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

  /* A post sign-in policy (post-sign-in.ts): Who as here, and its linked
     applications read only — they are linked from each application's own
     page, never from the policy (owner, 13 Oct 2026). */
  if (isPostSignIn(saved))
    return (
      <PostAppsPane
        policyId={policyId}
        audience={aud ?? saved.audience}
        onAudience={setAud}
        onSaved={onSaved}
        onCancel={() => {
          setAud(null)
          onCancel?.()
        }}
      />
    )

  const appName = (id: string) => store.appById(id).name
  const audience = aud ?? saved.audience
  const whoSaid = (a: Audience) => audienceLabel(a, store.groups, store.users)
  const diffOf = (ids: string[]) => detailsChanges(saved, { name: saved.name, appIds: ids, audience }, appName, whoSaid)
  const diff = diffOf(picked)
  const dirty = diff.changes.length > 0
  const whoChanged = diff.changes.includes('Who')
  const commitApps = (ids: string[], who: Audience = audience) => {
    const d = detailsChanges(saved, { name: saved.name, appIds: ids, audience: who }, appName, whoSaid)
    store.savePolicy({ ...saved, appIds: ids, audience: who, status: d.becomesDraft ? 'draft' : saved.status })
    const what = d.changes.includes('Who') ? `${saved.name} saved` : 'Applications saved'
    store.showToast(d.becomesDraft ? `${saved.name} saved as a draft` : what)
    /* The pane has done its one job, so it closes (owner, 21 Sep 2026) — the
       start node now says the new list, and the toast says it was saved. */
    onSaved?.()
  }

  /* --- Before saving: applications (apps-guard.ts) ------------------------------ */
  const save = () => {
    if (!appsGuard.guards(saved)) return commitApps(picked, audience)
    appsGuard.check(saved, picked, (ids, who) => commitApps(ids, who ?? audience), whoChanged ? audience : undefined)
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
  const saveLabel = whoChanged ? 'Save who and applications' : 'Save applications'
  const page = appsGuard.page({
    primaryLabel: saveLabel,
    onConfirm: (ids, _p, who) => commitApps(ids, who ?? audience),
    current: picked,
    onApplyFix: applyFix,
  })

  /* Under the field, once the last chip is gone (`becomesDraft` is an empty list on a policy that is not a draft):
     "stops deciding sign-ins" only where it was deciding them. */
  const emptyNote =
    dirty && diff.becomesDraft ? (
      <p className="bb__apps__note">
        {enforces(saved)
          ? 'With no applications this policy becomes a draft and stops deciding sign-ins.'
          : saved.status === 'monitor'
            ? 'With no applications this policy becomes a draft and stops monitoring.'
            : 'With no applications this policy becomes a draft.'}
        {diff.takesSavedDraft && ' Its saved draft replaces the published rules.'}
      </p>
    ) : null

  return (
    <div className="bb__apps">
      {/* Who is a rule's question only (owner, 14 Oct 2026): a policy names applications, and its rules name people.
          No heading of its own: the panel's bar already says Applications (23 Oct 2026). */}
      <section className="bb__sec bb__apps__sec" aria-label="Applications">
        <div className="bb__sec__body bb__apps__body">
          {/* One field (app-transfer.tsx, 24 Oct 2026): the ones in this policy as chips with the search after them, and
              the ones that can be added listed under it. The empty-list note sits right under the field. */}
          <AppTransfer
            apps={store.apps}
            picked={picked}
            onChange={setPicked}
            takenBy={(id) => (picked.includes(id) ? undefined : ownerOf(id, store.policies, saved.id)?.name)}
            emptyNote={emptyNote}
          />
        </div>
      </section>

      <div className="bb__apps__foot">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setPicked(saved.appIds)
            setAud(null)
            onCancel?.()
          }}
        >
          Cancel
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!dirty || appsGuard.checking}
          busy={appsGuard.checking}
          title={dirty ? undefined : 'No changes to save'}
          onClick={save}
        >
          {appsGuard.checking ? 'Checking…' : saveLabel}
        </Button>
      </div>

      {page && createPortal(<GuardDrawer {...page} />, portalRoot())}
    </div>
  )
}

/* --- A post sign-in policy's start node pane -----------------------------------

   Who, as on a sign-in policy, saved straight to the policy by its own button
   — the sign-in checks do not run: a post sign-in policy decides no sign-in.
   Then the applications linked to it, READ ONLY, each with the events of it
   this policy decides, by name. The application's name opens its Post sign-in
   tab, where links are made and changed: the policy is independent of its
   applications (owner, 13 Oct 2026). */
export function PostAppsPane({
  policyId,
  audience,
  onAudience,
  onSaved,
  onCancel,
}: {
  policyId: string
  audience: Audience
  onAudience: (a: Audience) => void
  onSaved?: () => void
  /** Cancel: Who goes back to what is saved, and the pane closes. */
  onCancel?: () => void
}) {
  const store = useBrand()
  const saved = store.policyById(policyId)
  if (!saved) return null
  const dirty = JSON.stringify(audience) !== JSON.stringify(saved.audience)
  const save = () => {
    store.savePolicy({ ...saved, audience })
    store.showToast(`${saved.name} saved`)
    onSaved?.()
  }
  return (
    <div className="bb__apps">
      <section className="bb__sec" aria-labelledby="bb-sec-aud">
        <div className="bb__sec__head">
          <h3 id="bb-sec-aud">
            <Users size={15} strokeWidth={2} aria-hidden />
            Who
          </h3>
        </div>
        <div className="bb__sec__body">
          <AudienceEditor audience={audience} onChange={onAudience} />
        </div>
      </section>

      <section className="bb__sec bb__apps__sec" aria-labelledby="bb-sec-apps">
        <div className="bb__sec__head">
          <h3 id="bb-sec-apps">
            <AppWindow size={15} strokeWidth={2} aria-hidden />
            Applications
          </h3>
        </div>
        <div className="bb__sec__body bb__apps__body">
          <LinkedApps policyId={policyId} />
        </div>
      </section>

      {/* The same foot as a sign-in policy's pane (23 Oct 2026): Cancel and the panel's grey save. */}
      <div className="bb__apps__foot">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="secondary" size="sm" disabled={!dirty} title={dirty ? undefined : 'No changes to save'} onClick={save}>
          Save who
        </Button>
      </div>
    </div>
  )
}

/* The linked applications, read only: logo, name, and the events this policy
   decides there. One line when there are none. */
export function LinkedApps({ policyId }: { policyId: string }) {
  const store = useBrand()
  const saved = store.policyById(policyId)
  const rows = saved ? linkedRows(saved, store.apps) : []
  if (rows.length === 0) return <p className="bb__apps__lede">Not linked to any application</p>
  return (
    <ul className="bb__linked" aria-label="Linked applications">
      {rows.map((r) => (
        <li key={r.appId} className="bb__linked__row">
          <AppLogo appId={r.appId} name={r.name} size={18} />
          <div className="bb__linked__text">
            <button type="button" className="bb__linked__name" onClick={() => store.go({ name: 'application', appId: r.appId, tab: 'post-sign-in' })}>
              {r.name}
            </button>
            <span className="bb__linked__events">{r.events.join(', ')}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
