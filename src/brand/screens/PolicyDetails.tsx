import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { Button } from '../kit'
import { reach, type Audience } from '../data'
import { useBrand } from '../store'
import { AudiencePicker } from './audience-drawer'
import { AppList } from '../create/CreatePolicy'

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

export function PolicyDetails({ policyId }: { policyId: string }) {
  const store = useBrand()
  const saved = store.policyById(policyId)

  const [name, setName] = useState(saved?.name ?? '')
  const [appId, setAppId] = useState<string | null>(saved?.appId ?? null)
  const [audience, setAudience] = useState<Audience>(
    saved?.audience ?? { everyone: false, groupIds: [], userIds: [] },
  )

  if (!saved) {
    return (
      <div className="bpage">
        <p style={{ padding: 24 }}>That policy no longer exists.</p>
      </div>
    )
  }

  const noAudience = !audience.everyone && audience.groupIds.length === 0 && audience.userIds.length === 0
  const dirty =
    name !== saved.name ||
    appId !== (saved.appId ?? null) ||
    JSON.stringify(audience) !== JSON.stringify(saved.audience)

  const back = () => store.go({ name: 'builder', policyId })

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

          <div className="bname2__field bname2__field--fill">
            <span className="bname2__label">
              Application <em>Optional</em>
            </span>
            <AppList chosen={appId} onChange={setAppId} />
          </div>

          <div className="bname2__field bname2__field--fill">
            <span className="bname2__label">
              Applies to <em>Groups and people</em>
            </span>
            <AudiencePicker
              audience={audience}
              groups={store.groups}
              users={store.users}
              unlisted={store.unlistedUsers}
              onChange={setAudience}
            />
          </div>
        </div>
      </section>

      <div className="bbar">
        <p className="bbar__note">
          {!name.trim()
            ? 'A policy needs a name.'
            : noAudience
              ? 'Choose at least one group or person for this policy to govern.'
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
            disabled={!name.trim() || noAudience || !dirty}
            onClick={() => {
              /* Saved straight through rather than staged into the builder's
                 undo stack. These are policy facts, not rule edits, and mixing
                 them into the same history would make ⌘Z on the rules screen
                 quietly rename the policy. */
              store.savePolicy({ ...saved, name: name.trim(), appId: appId ?? undefined, audience })
              store.showToast(`${name.trim()} updated`)
              store.go({ name: 'builder', policyId })
            }}
          >
            Save details
          </Button>
        </div>
      </div>
    </div>
  )
}
