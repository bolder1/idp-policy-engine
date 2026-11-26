import { useState } from 'react'

import { Button, Field } from '../kit'
import { useBrand } from '../store'
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_SYMBOLS, passwordIssue } from './password'

/* -----------------------------------------------------------------------------
   Password (spec goal 2, live parity): the live end-user page's three fields and its rules beside them, read on
   26 Nov 2026. Its "Save" and "Cancel" stay; a problem is said under its field.
   -------------------------------------------------------------------------- */

export function PasswordPage() {
  const { actUserDash, showToast, go } = useBrand()
  const [v, setV] = useState({ current: '', next: '', confirm: '' })
  const [tried, setTried] = useState(false)
  const issue = tried ? passwordIssue(v.current, v.next, v.confirm) : null
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((o) => ({ ...o, [k]: e.target.value }))

  const save = () => {
    setTried(true)
    if (passwordIssue(v.current, v.next, v.confirm)) return
    actUserDash({ type: 'password-changed' })
    setV({ current: '', next: '', confirm: '' })
    setTried(false)
    showToast('Password changed')
  }

  const field = (k: keyof typeof v, label: string, id: string) => (
    <>
      <Field label={label} htmlFor={id}>
        <input id={id} type="password" autoComplete={k === 'current' ? 'current-password' : 'new-password'} value={v[k]} aria-invalid={issue?.field === k} onChange={set(k)} />
      </Field>
      {issue?.field === k && (
        <p className="bud-err" role="alert">
          {issue.text}
        </p>
      )}
    </>
  )

  return (
    <div className="bud-page">
      <header className="bud-head">
        <h1>Password</h1>
      </header>
      <div className="bud-pw">
        <section className="bud-card bud-form">
          {field('current', 'Current password', 'bud-pw-current')}
          {field('next', 'New password', 'bud-pw-next')}
          {field('confirm', 'Confirm password', 'bud-pw-confirm')}
          <div className="bud-actions">
            <Button variant="primary" onClick={save}>
              Save
            </Button>
            <Button variant="neutral" onClick={() => go({ name: 'account', page: 'overview' })}>
              Cancel
            </Button>
          </div>
        </section>
        <aside className="bud-card bud-pw__rules" aria-label="Password rules">
          <h2>Passwords must contain</h2>
          <ul>
            <li>
              {PASSWORD_MIN} to {PASSWORD_MAX} characters
            </li>
            <li>Only these symbols: {PASSWORD_SYMBOLS}</li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
