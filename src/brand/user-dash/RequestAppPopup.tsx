import { useState } from 'react'

import { CharCount } from '../CharCount'
import { Button, Field, Modal } from '../kit'
import { Picker } from '../picker'
import { useBrand } from '../store'

/* -----------------------------------------------------------------------------
   Request an app (spec goal 1): pick an app that is not on your dashboard, add a note if you like, and send. The admin
   sees it in Requests; approving it puts the app on the dashboard (state.ts `granted`).
   -------------------------------------------------------------------------- */

const NOTE_MAX = 200

export function RequestAppPopup({ open, onClose, offered }: { open: boolean; onClose: () => void; offered: readonly { id: string; name: string }[] }) {
  const { actUserDash, showToast, userDash } = useBrand()
  const [appId, setAppId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const asked = (id: string) => userDash.requests.some((r) => r.kind === 'app' && r.appId === id && r.status !== 'declined')

  const close = () => {
    setAppId(null)
    setNote('')
    setTried(false)
    onClose()
  }
  const send = () => {
    setTried(true)
    if (!appId) return
    const name = offered.find((a) => a.id === appId)?.name ?? 'the app'
    actUserDash({ type: 'ask', request: { id: `app-${appId}-${userDash.requests.length}`, kind: 'app', personId: 'priya', at: 'Just now', status: 'pending', appId, note: note.trim() || undefined } })
    showToast(`Request for ${name} sent to your administrator`)
    close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Request an app"
      footer={
        <>
          <Button variant="neutral" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={send}>
            Send request
          </Button>
        </>
      }
    >
      <div className="bud bud-form">
        <Field label="App" htmlFor="bud-req-app">
          <Picker
            label="App"
            width="fill"
            size="md"
            value={appId}
            searchable
            options={offered.map((a) => ({ value: a.id, label: a.name, meta: asked(a.id) ? 'Asked for' : undefined, disabled: asked(a.id) }))}
            onChange={setAppId}
          />
        </Field>
        {tried && !appId && (
          <p className="bud-err" role="alert">
            Choose an app
          </p>
        )}
        <Field label="Note (optional)" htmlFor="bud-req-note">
          <textarea id="bud-req-note" rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          <CharCount value={note} max={NOTE_MAX} />
        </Field>
      </div>
    </Modal>
  )
}
