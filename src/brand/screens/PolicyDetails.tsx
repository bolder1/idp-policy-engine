import { useState } from 'react'
import { useEffect } from 'react'
import { ArrowLeft, FileX } from 'lucide-react'

import { Button, SaveBar, TipDot } from '../kit'
import { EmptyState } from '../empty'
import { EVERYONE, evaluates, type Audience } from '../data'
import { ChangeState, useLeaveGuard } from '../leave-guard'
import { POLICY_NAME_MAX, policyNameIssue } from '../policy-name'
import { useBrand, type PolicyDetailsFrom } from '../store'
import { ApplicationField } from './scope-fields'
import { detailsChanges } from './policy-details-review'

import '../create/create.css'
import './policy-details.css'

/* -----------------------------------------------------------------------------
   The policy's details, on their own page.

   These three facts — the name, what it protects, and who it governs — are what
   make a policy a policy, and they were scattered: the name lived in the
   builder's top bar, the applications behind a dialog, and the audience in a
   card at the top of the rules list that made it look like the first step of
   writing them. It is not a step. It is the frame the rules are written inside.

   Same form as the create flow, deliberately: this IS that form, over a policy
   that already exists. Somebody who created a policy last week and comes back to
   widen it should meet the screen they filled in, not a different arrangement of
   the same three fields.

   It commits through the kit save bar, as the library pages do: the bar names
   what changed, Review changes lays the saved values beside the new ones, and
   Save stores them and goes back to where you came from.
   -------------------------------------------------------------------------- */

export function PolicyDetails({ policyId, from = 'builder' }: { policyId: string; from?: PolicyDetailsFrom }) {
  const store = useBrand()
  const saved = store.policyById(policyId)

  const [name, setName] = useState(saved?.name ?? '')
  const [appIds, setAppIds] = useState<string[]>(saved?.appIds ?? [])
  /* Carried, not edited. The form no longer asks who the policy governs — each
     rule's own Who field narrows it — so this holds whatever the policy already had
     and writes it back unchanged, rather than a save silently narrowing or
     widening a policy through a field that is not on screen. */
  const [audience] = useState<Audience>(saved?.audience ?? EVERYONE)
  /* Set by Save. The page leaves once the store holds the saved values, so the
     leave guard sees nothing unsaved and does not ask. */
  const [closing, setClosing] = useState(false)

  /* Compared as the save stores it — name trimmed, applications as a set — so a
     trailing space is not an unsaved change. Applications are optional here, as
     on the create form: a published policy saved with none goes back to draft,
     because a policy that names nothing cannot decide a sign-in. */
  const diff = saved ? detailsChanges(saved, { name, appIds }, (id) => store.appById(id).name) : null
  const dirty = !!diff && diff.changes.length > 0
  const becomesDraft = !!diff && diff.becomesDraft
  const blocked = saved ? policyNameIssue(name, store.policies, saved.id) : null

  /* Commits the details. Spreads the store's policy, so a saved draft of the
     rules (`pendingDraft`) survives a rename. The system policy covers every
     application, so its list is written back as it was. */
  const save = () => {
    if (!saved || blocked) return false
    const trimmed = name.trim()
    const ids = saved.isSystem ? saved.appIds : appIds
    store.savePolicy({ ...saved, name: trimmed, appIds: ids, audience, status: becomesDraft ? 'draft' : saved.status })
    /* From the list's "Assign applications", the turn-on that was refused is
       still the errand, and the list is where it is done. */
    const turnOn = from === 'policies' && saved.status === 'inactive' && ids.length > 0
    store.showToast(
      becomesDraft ? `${trimmed} saved as a draft` : turnOn ? `${trimmed} updated. Turn it on from the list.` : `${trimmed} updated`,
    )
    setName(trimmed)
    return true
  }

  useLeaveGuard({ dirty, save, saveLabel: 'Save', blocked })

  const go = store.go
  useEffect(() => {
    if (!closing || dirty) return
    if (from === 'policies') go({ name: 'policies' })
    else go({ name: from, policyId })
  }, [closing, dirty, go, from, policyId])

  if (!saved) {
    return (
      <div className="bpage">
        <EmptyState
          icon={FileX}
          title="Policy not found"
          blurb="It may have been deleted."
          action={
            <Button variant="brand" onClick={() => store.go({ name: 'policies' })}>
              Back to policies
            </Button>
          }
        />
      </div>
    )
  }

  const back = () => (from === 'policies' ? store.go({ name: 'policies' }) : store.go({ name: from, policyId }))
  /* The name in the crumb opens the policy: the builder you came from, or the
     board when you came from the list. */
  const openPolicy = () => store.go({ name: from === 'policies' ? 'board' : from, policyId })

  return (
    <div className="bpage bcp bcp--fit bpd">
      <header className="bcp__head">
        <nav className="bcp__crumb">
          <button onClick={() => store.go({ name: 'policies' })}>Policies</button>
          <span aria-hidden>/</span>
          <button onClick={openPolicy}>{saved.name}</button>
          <span aria-hidden>/</span>
          <span>Details</span>
        </nav>
        <div className="bcp__headrow">
          <div className="bpd__title">
            <h1>Policy details</h1>
            <ChangeState unsaved={dirty} />
          </div>
          <Button variant="ghost" icon={ArrowLeft} onClick={back}>
            {from === 'policies' ? 'Back to policies' : 'Back to the rules'}
          </Button>
        </div>
      </header>

      <section className="bname2">
        <div className="bname2__form bname2__card">
          <div className="bname2__field">
            <label htmlFor="pd-name" className="bname2__label">
              Policy name <i>*</i>
            </label>
            <input
              id="pd-name"
              type="text"
              value={name}
              maxLength={POLICY_NAME_MAX}
              aria-invalid={!!blocked}
              aria-describedby={blocked ? 'pd-name-error' : undefined}
              onChange={(e) => setName(e.target.value)}
              placeholder="Finance Team – High Security"
            />
            {blocked && (
              <p id="pd-name-error" className="bpd__error">
                {blocked}
              </p>
            )}
          </div>

          {/* Two questions, matching the create form exactly.

              Both were resident scrolling lists — ten applications and a
              tabbed roster of groups and people, 475px each. "Applies to" is
              gone: each rule says who it is for in its own Who field
              (`rule.who`, not a condition), and a policy-level audience asked
              in two places was two chances for the two to disagree. */}
          <div className="bname2__field">
            <span className="bname2__label">Applications</span>
            {saved.isSystem ? (
              /* Stated, not asked. The system policy decides the sign-ins no
                 other policy matches, on every application; choosing one here
                 drew that app's logo beside "Every application" in the board. */
              <div className="bname2__fixed">
                <strong>Every application</strong>
                <TipDot label="About the system policy" text="The system policy covers every application. It decides sign-ins no other policy matches." />
              </div>
            ) : (
              <ApplicationField appIds={appIds} onChange={setAppIds} />
            )}
            {/* "Stops deciding sign-ins" only where it was deciding them, as in
                Review & save: an inactive policy decides nothing already. */}
            {becomesDraft && dirty && (
              <p className="bpd__note">
                {evaluates(saved)
                  ? 'With no applications this policy becomes a draft and stops deciding sign-ins.'
                  : 'With no applications this policy becomes a draft.'}
                {diff?.takesSavedDraft && ' Its saved draft replaces the published rules.'}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Saved straight through rather than staged into the builder's undo
          stack. These are policy facts, not rule edits, and mixing them into
          the same history would make ⌘Z on the rules screen quietly rename the
          policy. */}
      <SaveBar
        open={dirty}
        changes={diff?.changes ?? []}
        onSave={() => {
          if (save()) setClosing(true)
        }}
        blocked={!!blocked}
        blockedReason={blocked ?? undefined}
        review={diff?.rows}
      />
    </div>
  )
}
