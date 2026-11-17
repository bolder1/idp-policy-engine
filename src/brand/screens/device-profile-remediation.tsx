import { useId } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { NumberStepper, TipDot } from '../kit'
import { Picker } from '../picker'
import { GRACE_LABEL, tidyRemediation, type GraceKind, type Remediation } from '../fingerprint'
import { ChoiceTiles } from './device-profile-parts'
import type { Choice } from './device-profile-choices'

/* -----------------------------------------------------------------------------
   Device health · Remediation (V1).

   What happens after a health check fails: whether the sign-in page shows the
   user how to fix the device, and whether they get time to do it first. The
   words and the order follow the console's own panel (heading, the question
   "If users don't meet compliance settings", then Grace period); the controls
   are this app's own — the profile's pick-one tiles, a Picker and a stepper.

   The sentence the console prints under its heading is on the `?` here, so the
   page carries no line explaining itself. Saving is the page's save bar or the
   wizard's footer: there is no Save and Cancel of its own.
   -------------------------------------------------------------------------- */

type Show = 'hide' | 'display'

const SHOW_CHOICES: Choice<Show>[] = [
  {
    id: 'hide',
    label: 'Hide remediation instructions',
    icon: EyeOff,
    summary: 'A user who fails a check is denied with the deny message',
    tip: 'A user who fails a check is denied with the deny message and no steps to fix the device.',
  },
  {
    id: 'display',
    label: 'Display remediation instructions',
    icon: Eye,
    summary: 'The sign-in page shows what to fix, with time to do it',
    tip: 'The sign-in page tells a denied user which check failed and how to fix it. You can give them time to fix it before access is blocked.',
  },
]

const GRACE_OPTIONS = (Object.keys(GRACE_LABEL) as GraceKind[]).map((g) => ({ value: g, label: GRACE_LABEL[g] }))

/** Today as yyyy-mm-dd, the earliest a due date can be. */
const today = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function RemediationForm({
  value,
  onChange,
  issue,
}: {
  value: Remediation
  onChange: (next: Remediation) => void
  /** Said under the field it is about, never in the footer. */
  issue?: string | null
}) {
  const headId = useId()
  const dateId = useId()
  const set = (patch: Partial<Remediation>) => onChange(tidyRemediation({ ...value, ...patch }))
  const days = value.days.trim() === '' ? null : Number(value.days)

  return (
    <div className="bfp2__basic">
      <section className="bfp2__basicsec">
        <header className="bfp2__sechead">
          <h2 id={headId}>Remediation</h2>
          <TipDot
            label="Remediation"
            text="For users who are denied access because a device fails a check, you can include remediation instructions in the sign-in page."
          />
        </header>
        <p className="bfp2__remlabel" id={`${headId}-q`}>
          If users don’t meet compliance settings
        </p>
        <ChoiceTiles
          labelledBy={`${headId}-q`}
          options={SHOW_CHOICES}
          value={value.show ? 'display' : 'hide'}
          onPick={(id) => set({ show: id === 'display' })}
        />
      </section>

      {value.show && (
        <section className="bfp2__basicsec">
          <header className="bfp2__sechead">
            <h2>Grace period</h2>
          </header>
          <div className="bfp2__remfield">
            <span className="bfp2__remlabel">Grant users time to remediate issues</span>
            <Picker
              label="Grant users time to remediate issues"
              size="md"
              width="fill"
              value={value.grace}
              options={GRACE_OPTIONS}
              onChange={(g) => set({ grace: g as GraceKind })}
            />
          </div>

          {value.grace === 'date' && (
            <div className="bfp2__remfield">
              <label className="bfp2__remlabel" htmlFor={dateId}>
                Due date
              </label>
              <div className="bfp2__field">
                <input
                  id={dateId}
                  type="date"
                  min={today()}
                  value={value.dueDate}
                  aria-invalid={issue ? true : undefined}
                  onChange={(e) => set({ dueDate: e.target.value })}
                />
              </div>
            </div>
          )}

          {value.grace === 'days' && (
            <div className="bfp2__remfield">
              <span className="bfp2__remlabel">Number of days</span>
              <NumberStepper
                value={days}
                min={1}
                max={365}
                unit="days"
                width="fill"
                label="Number of days"
                placeholder="Enter the number of days"
                invalid={!!issue}
                onChange={(n) => set({ days: String(n) })}
              />
              <p className="bfp2__remhint">Timer starts after the first unsuccessful access attempt</p>
            </div>
          )}
          {issue && (
            <p className="bdpw__said" role="alert">
              {issue}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
