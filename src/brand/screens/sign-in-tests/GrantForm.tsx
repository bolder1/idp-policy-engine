import { useId, useState, type FormEvent } from 'react'

import { Button, Field } from '../../kit'
import { TEMP_ACCESS_MAX_DAYS, TEMP_ACCESS_REASON_MAX, addDays, tempAccessIssue } from './temp-access'

/* Let this person in for a while (temp-access.ts): under a refusal, an end date
   and a reason, then the policy that refused them gets a first rule that ends
   by itself. Never disabled — a blocked step says why under its field, and the
   buttons are only buttons (owner, 26 Sep 2026). */
export function GrantForm({ today, person, onGrant }: { today: string; person: string; onGrant: (until: string, reason: string) => void }) {
  const [open, setOpen] = useState(false)
  const [until, setUntil] = useState(() => addDays(today, 7))
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const untilId = useId()
  const reasonId = useId()
  const issue = tried ? tempAccessIssue(until, today, reason) : null

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Let in for a while
      </Button>
    )
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (tempAccessIssue(until, today, reason)) {
      setTried(true)
      return
    }
    setOpen(false)
    onGrant(until, reason)
  }
  return (
    <form
      className="bbi__accept tj-grant"
      aria-label={`Let ${person} in for a while`}
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          setOpen(false)
        }
      }}
    >
      <Field label="Until" htmlFor={untilId} hint={`Up to ${TEMP_ACCESS_MAX_DAYS} days`}>
        <input id={untilId} type="date" min={today} max={addDays(today, TEMP_ACCESS_MAX_DAYS)} value={until} aria-invalid={issue?.field === 'until'} onChange={(e) => setUntil(e.target.value)} />
      </Field>
      {issue?.field === 'until' && (
        <p className="bbi__said" role="alert">
          {issue.text}
        </p>
      )}
      <Field label="Reason" htmlFor={reasonId}>
        <input id={reasonId} type="text" maxLength={TEMP_ACCESS_REASON_MAX} value={reason} aria-invalid={issue?.field === 'reason'} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {issue?.field === 'reason' && (
        <p className="bbi__said" role="alert">
          {issue.text}
        </p>
      )}
      <div className="bbi__acts">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button variant="neutral" size="sm" type="submit">
          Let in
        </Button>
      </div>
    </form>
  )
}
