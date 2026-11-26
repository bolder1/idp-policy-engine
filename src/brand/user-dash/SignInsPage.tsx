import { useState } from 'react'

import { Badge, Button, Modal } from '../kit'
import { AppLogo } from '../logos/AppLogo'
import { useBrand } from '../store'
import type { PersonalSignIn } from './state'

/* -----------------------------------------------------------------------------
   Recent sign-ins (spec goal 2): what happened on your account, with "This wasn't me" on each row. The person sees the
   result, never which policy or rule decided it (the owner's ruling: the reason is admin only).
   -------------------------------------------------------------------------- */

const RESULT: Record<PersonalSignIn['result'], { word: string; tone: 'positive' | 'info' | 'negative' }> = {
  allowed: { word: 'Signed in', tone: 'positive' },
  asked: { word: 'Second step', tone: 'info' },
  blocked: { word: 'Blocked', tone: 'negative' },
}

export function SignInTable({ rows, reported, onReport }: { rows: readonly PersonalSignIn[]; reported: readonly string[]; onReport: (r: PersonalSignIn) => void }) {
  const { apps } = useBrand()
  const nameOf = (id: string) => apps.find((a) => a.id === id)?.name ?? id
  return (
    <div className="bud-table" role="table" aria-label="Recent sign-ins">
      <div className="bud-table__row bud-table__row--head" role="row">
        <span role="columnheader">App</span>
        <span role="columnheader">Device</span>
        <span role="columnheader">Place</span>
        <span role="columnheader">When</span>
        <span role="columnheader">Result</span>
        <span role="columnheader">
          <span className="u-sr-only">Report</span>
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="bud-table__row" role="row">
          <span role="cell" className="bud-table__app">
            <AppLogo appId={r.appId} name={nameOf(r.appId)} size={24} />
            {nameOf(r.appId)}
          </span>
          <span role="cell">{r.device}</span>
          <span role="cell">{r.place}</span>
          <span role="cell">{r.when}</span>
          <span role="cell">
            <Badge tone={RESULT[r.result].tone}>{RESULT[r.result].word}</Badge>
          </span>
          <span role="cell" className="bud-table__end">
            {reported.includes(r.id) ? (
              <Badge tone="notice">Reported</Badge>
            ) : (
              <Button size="sm" variant="link" onClick={() => onReport(r)}>
                This wasn&apos;t me
              </Button>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

export function SignInsPage() {
  const { userDash, actUserDash, showToast, go } = useBrand()
  const [confirm, setConfirm] = useState<PersonalSignIn | null>(null)

  const report = () => {
    if (!confirm) return
    actUserDash({ type: 'report', signInId: confirm.id })
    setConfirm(null)
    showToast('Reported to your administrator', { label: 'Change password', run: () => go({ name: 'account', page: 'password' }) })
  }

  return (
    <div className="bud-page">
      <header className="bud-head">
        <h1>Recent sign-ins</h1>
        <p>Sign-ins to your account from the last 7 days. Places are approximate.</p>
      </header>
      <SignInTable rows={userDash.signIns} reported={userDash.reported} onReport={setConfirm} />
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Report this sign-in?"
        width={480}
        footer={
          <>
            <Button variant="neutral" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={report}>
              Report
            </Button>
          </>
        }
      >
        {confirm && (
          <p className="bud-modal__text">
            {confirm.when}, {confirm.place}, {confirm.device}. We&apos;ll tell your administrator and ask you to change your password.
          </p>
        )}
      </Modal>
    </div>
  )
}
