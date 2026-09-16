import { useEffect, useMemo, useRef } from 'react'

import { Badge, Button, Modal } from './kit'
import { useBrand, type LeaveGuard } from './store'

/* --- Leaving a screen with unsaved work ---------------------------------------

   Every screen that edits a local draft calls `useLeaveGuard`. Every way out
   then asks before the work is lost: store navigation (the rail, breadcrumbs,
   Edit details, persona and role switches) through `go`, in-page backs through
   the `confirmLeave` this returns, and closing or reloading the tab through
   `beforeunload`. The one dialog below answers for all of them. */

export interface LeaveGuardOptions {
  /** True while there is something to lose. */
  dirty: boolean
  /** Commits the work; return false if it could not be saved. Omit when the screen cannot save from the dialog. */
  save?: () => boolean
  /** "Save as draft" in a builder; "Save" on library pages and details. */
  saveLabel?: string
  /** Why saving is not possible right now ("Enter a policy name"), or null. */
  blocked?: string | null
}

export function useLeaveGuard(opts: LeaveGuardOptions): (run: () => void) => void {
  const { registerLeaveGuard, releaseLeaveGuard, requestLeave } = useBrand()
  const latest = useRef(opts)
  latest.current = opts

  /* One stable object per mounted screen. Its functions read `latest`, so the
     dialog sees the screen's state at the moment somebody tries to leave. */
  const guard = useMemo<LeaveGuard>(
    () => ({
      dirty: () => latest.current.dirty,
      save: () => (latest.current.save ? latest.current.save() : false),
      saveLabel: () => latest.current.saveLabel ?? 'Save',
      blocked: () => latest.current.blocked ?? null,
    }),
    [],
  )
  /* `save` is optional on the options but always present on the guard, so the
     dialog needs to know whether there is a real one behind it. */
  const hasSave = !!opts.save

  useEffect(() => {
    /* Released by identity, so release exactly the object that was registered. */
    const registered = hasSave ? guard : { ...guard, save: undefined }
    registerLeaveGuard(registered)
    return () => releaseLeaveGuard(registered)
  }, [guard, hasSave, registerLeaveGuard, releaseLeaveGuard])

  useEffect(() => {
    if (!opts.dirty) return
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [opts.dirty])

  return requestLeave
}

/* The one leave dialog, mounted once in the shell.

   Save is the primary action because keeping the work is what somebody almost
   always wants; Discard is the destructive one and says so; Keep editing closes
   the dialog. When saving is blocked the reason is the whole body. */
export function LeaveDialog() {
  const { pendingLeave, leaveSave, leaveDiscard, leaveStay } = useBrand()
  /* The last request, held while the dialog animates out. Read live, the Save
     button vanished and the sentence switched to "Leaving discards your
     changes." in the frames after Save was pressed. */
  const last = useRef(pendingLeave)
  if (pendingLeave) last.current = pendingLeave
  const p = pendingLeave ?? last.current
  /* A reason for a Save that is not on offer explains nothing. */
  const reason = p?.canSave ? (p.blocked ?? null) : null

  return (
    <Modal
      open={!!pendingLeave}
      onClose={leaveStay}
      title="Unsaved changes"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={leaveStay}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={leaveDiscard}>
            Discard
          </Button>
          {p?.canSave && (
            <Button variant="brand" disabled={!!reason} title={reason ?? undefined} onClick={leaveSave}>
              {p.saveLabel}
            </Button>
          )}
        </>
      }
    >
      <p className="bx-leave__body">
        {reason ?? (p?.canSave ? 'Save your changes or discard them before you leave.' : 'Leaving discards your changes.')}
      </p>
    </Modal>
  )
}

/* The change-state pill. One spec for "something here is not saved" on every
   screen that edits a draft, beside the title or the policy's status.

   - `unsaved`: edits since the last save or draft.
   - `draft`: a saved draft on a published policy that is not live yet.
   Unsaved wins when both are true — it is the more urgent fact. */
export function ChangeState({ unsaved, draft = false }: { unsaved: boolean; draft?: boolean }) {
  if (unsaved) return <Badge tone="notice" className="bx-change">Unsaved changes</Badge>
  if (draft) return <Badge tone="info" className="bx-change">Draft not published</Badge>
  return null
}
