import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { Button } from '../kit'
import { EVERYONE, reach, type Audience } from '../data'
import { useBrand } from '../store'
import { ApplicationField } from './scope-fields'

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
   -------------------------------------------------------------------------- */

export function PolicyDetails({ policyId, from = 'builder' }: { policyId: string; from?: 'builder' | 'board' }) {
  const store = useBrand()
  const saved = store.policyById(policyId)

  const [name, setName] = useState(saved?.name ?? '')
  const [appId, setAppId] = useState<string | null>(saved?.appId ?? null)
  /* Carried, not edited. The form no longer asks who the policy governs — the
     Who step on each rule does — so this holds whatever the policy already had
     and writes it back unchanged, rather than a save silently narrowing or
     widening a policy through a field that is not on screen. */
  const [audience] = useState<Audience>(saved?.audience ?? EVERYONE)

  if (!saved) {
    return (
      <div className="bpage">
        <p style={{ padding: 24 }}>That policy no longer exists.</p>
      </div>
    )
  }

  const noApp = appId === null
  const dirty =
    name !== saved.name ||
    appId !== (saved.appId ?? null) ||
    JSON.stringify(audience) !== JSON.stringify(saved.audience)

  const back = () => store.go({ name: from, policyId })

  return (
    <div className="bpage bcp bcp--fit bpd">
      <header className="bcp__head">
        <nav className="bcp__crumb">
          <button onClick={() => store.go({ name: 'policies' })}>Policies</button>
          <span aria-hidden>/</span>
          <button onClick={back}>{saved.name}</button>
          <span aria-hidden>/</span>
          <span>Details</span>
        </nav>
        <div className="bcp__headrow">
          <h1>Policy details</h1>
        </div>
      </header>

      <section className="bname2">
        <div className="bname2__form bcard">
          <div className="bname2__field">
            <label htmlFor="pd-name" className="bname2__label">
              Policy name <i>*</i>
            </label>
            <input
              id="pd-name"
              type="text"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              placeholder="Finance Team – High Security"
            />
          </div>

          {/* Two questions, matching the create form exactly.

              Both were resident scrolling lists — ten applications and a
              tabbed roster of groups and people, 475px each. "Applies to" is
              gone: it is answered per RULE now by the Who step, which writes
              the `group` and `user` conditions the rule already held, and a
              policy-level audience asked in two places was two chances for the
              two to disagree. The application is required, because a policy
              that names nothing is a set of rules no sign-in can reach. */}
          <div className="bname2__field">
            <span className="bname2__label">
              Application <i>*</i>
            </span>
            <ApplicationField appId={appId} onChange={setAppId} />
          </div>
        </div>
      </section>

      <div className="bbar">
        <p className="bbar__note">
          {!name.trim()
            ? 'A policy needs a name.'
            : noApp
              ? 'Choose the application this policy protects.'
              : dirty
                ? `About ${reach(audience, store.groups, store.users).toLocaleString()} people will be governed by this policy.`
                : 'Nothing changed.'}
        </p>
        <div className="bbar__acts">
          <Button variant="ghost" icon={ArrowLeft} onClick={back}>
            Back to the rules
          </Button>
          <Button
            variant="brand"
            disabled={!name.trim() || noApp || !dirty}
            onClick={() => {
              /* Saved straight through rather than staged into the builder's
                 undo stack. These are policy facts, not rule edits, and mixing
                 them into the same history would make ⌘Z on the rules screen
                 quietly rename the policy. */
              store.savePolicy({ ...saved, name: name.trim(), appId: appId ?? undefined, audience })
              store.showToast(`${name.trim()} updated`)
              store.go({ name: from, policyId })
            }}
          >
            Save details
          </Button>
        </div>
      </div>
    </div>
  )
}
