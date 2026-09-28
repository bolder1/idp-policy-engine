import { useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, ShieldAlert } from 'lucide-react'

import { EmptyState } from '../../empty'
import { Picker } from '../../picker'
import { useBrand } from '../../store'
import { breakInPolicies, statusMeta, testedVersion, versionWord } from '../break-in-model'
import { BreakInView } from '../break-in-view'
import { useSimEnv } from '../sim-env'
import { breakInStart } from './selectors'
import { useTestingSession } from './session-state'

/* -----------------------------------------------------------------------------
   The Break-in test, pushed inside Saved sign-ins: Versions 1 and 2.

   A page on top of the Saved sign-ins view, with Back naming where it goes.
   The policy is the admin's to choose — Policy testing asks the whole tenant,
   so nothing here is "the" policy — and it opens on the one Try's sign-in
   points at: the policy assumed on, else the one deciding it unless that is
   the Global Default, else the first one a Break-in test can run on (final
   spec, B.8). The choice is the session's, so it survives a switch of view.

   A stored policy is tested as the builders open it: its saved draft when it
   has one, and the caption says which. A fix is not applied from here — this
   page edits no policy — so it opens the board at the rule it would change.
   Going to the board closes this page: the next way back to Saved sign-ins,
   such as the board's own link, means the list.
   -------------------------------------------------------------------------- */

export function BreakInPage({ onBack }: { onBack: () => void }) {
  const { policies, zones, go } = useBrand()
  const session = useTestingSession()
  const env = useSimEnv()
  const back = useRef<HTMLButtonElement | null>(null)

  const eligible = useMemo(() => breakInPolicies(policies), [policies])
  const chosen = session.breakIn.policyId
  const fallback = useMemo(() => breakInStart(policies, session.form, env, zones), [policies, session.form, env, zones])
  const id = chosen && eligible.some((p) => p.id === chosen) ? chosen : fallback
  const stored = eligible.find((p) => p.id === id)
  const tested = useMemo(() => (stored ? testedVersion(stored) : null), [stored])
  const options = useMemo(() => eligible.map((p) => ({ value: p.id, label: p.name, meta: statusMeta(p) })), [eligible])

  /* A pushed page takes focus to its way back, the first thing on it. */
  useEffect(() => {
    back.current?.focus()
  }, [])

  return (
    <div className="tst__view">
      <button type="button" ref={back} className="tst__back" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        Saved sign-ins
      </button>

      {!stored || !tested ? (
        <EmptyState compact icon={ShieldAlert} title="No policy to test" />
      ) : (
        <>
          <div className="tst__bar">
            <Picker label="Policy to test" size="md" prefix="Policy" value={stored.id} options={options} onChange={(v) => session.openBreakIn(v)} />
          </div>
          <BreakInView
            policy={tested}
            policies={policies}
            env={env}
            caption={versionWord(stored)}
            onOpenInBoard={(rule) => {
              session.closeBreakIn()
              go({ name: 'board', policyId: stored.id, rule })
            }}
          />
        </>
      )}
    </div>
  )
}
