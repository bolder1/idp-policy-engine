import { useState } from 'react'
import { Pencil } from 'lucide-react'

import { Button, Field, IconButton } from '../kit'
import { END_USER_ACCOUNT, useBrand } from '../store'
import { PROFILE } from '../user-methods'

/* -----------------------------------------------------------------------------
   Profile (spec goal 2, live parity): the live end-user page's two cards in its order, read on 26 Nov 2026 — Account
   information (username, email, phone, each with an edit control) and Profile information (first name, last name,
   alternate email, Save). Save is off until something changed (the house Draft rule).
   -------------------------------------------------------------------------- */

const START = { first: 'Priya', last: 'Sharma', alt: PROFILE.altEmail }

export function ProfilePage() {
  const { showToast } = useBrand()
  const [saved, setSaved] = useState(START)
  const [v, setV] = useState(START)
  const changed = v.first !== saved.first || v.last !== saved.last || v.alt !== saved.alt
  const missing = v.first.trim() === '' ? 'first' : v.last.trim() === '' ? 'last' : null
  const soon = () => showToast('Editing this is coming soon.')

  const account: { label: string; value: string }[] = [
    { label: 'Username', value: END_USER_ACCOUNT.username },
    { label: 'Email', value: PROFILE.email },
    { label: 'Phone', value: PROFILE.phone },
  ]

  return (
    <div className="bud-page">
      <header className="bud-head">
        <h1>Profile</h1>
      </header>

      <section className="bud-card">
        <h2>Account information</h2>
        <dl className="bud-facts">
          {account.map((f) => (
            <div key={f.label} className="bud-facts__row">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
              <IconButton icon={Pencil} size="sm" label={`Edit ${f.label.toLowerCase()}`} onClick={soon} />
            </div>
          ))}
        </dl>
      </section>

      <section className="bud-card bud-form">
        <h2>Profile information</h2>
        <Field label="First name *" htmlFor="bud-pf-first">
          <input id="bud-pf-first" type="text" value={v.first} aria-invalid={missing === 'first'} onChange={(e) => setV({ ...v, first: e.target.value })} />
        </Field>
        <Field label="Last name *" htmlFor="bud-pf-last">
          <input id="bud-pf-last" type="text" value={v.last} aria-invalid={missing === 'last'} onChange={(e) => setV({ ...v, last: e.target.value })} />
        </Field>
        <Field label="Alternate email" htmlFor="bud-pf-alt">
          <input id="bud-pf-alt" type="email" value={v.alt} onChange={(e) => setV({ ...v, alt: e.target.value })} />
        </Field>
        {missing && (
          <p className="bud-err" role="alert">
            Enter your {missing === 'first' ? 'first' : 'last'} name
          </p>
        )}
        <div className="bud-actions">
          <Button
            variant="primary"
            disabled={!changed || missing !== null}
            onClick={() => {
              setSaved(v)
              showToast('Profile saved')
            }}
          >
            Save
          </Button>
        </div>
      </section>
    </div>
  )
}
