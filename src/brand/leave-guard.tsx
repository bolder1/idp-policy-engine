import { useEffect, useMemo, useRef } from 'react'

import { Badge, Confirm } from './kit'
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
  /** Why saving is not possible right now ("Enter a policy name"), or null.
      A function is asked only when somebody tries to leave: a check that costs
      something to run (a zone's saved sign-ins) is not run on every render. */
  blocked?: string | null | (() => string | null)
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
      blocked: () => {
        const b = latest.current.blocked
        return typeof b === 'function' ? b() : (b ?? null)
      },
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
    /* The hero shape (owner, 22 Oct 2026: "hero shape for delete and discard").
       One sentence and no list, which is what the hero is for — and leaving
       unsaved work behind is the most interrupting thing this console does, so
       it is the one that earns the moment.

       `warning`, not `removed`: nothing is deleted from the tenant, the edits in
       front of you are. The three-way decision — stay, lose it, keep it — is the
       product's only genuine one, which is why `alt` exists at all. */
    <Confirm
      open={!!pendingLeave}
      onClose={leaveStay}
      tone="warning"
      shape="hero"
      title="Unsaved changes"
      cancelLabel="Keep editing"
      confirmLabel="Discard"
      onConfirm={leaveDiscard}
      /* No dimmed Save. It used to render disabled with the reason in a
         `title`, so the footer offered a red Discard beside a 45%-opacity
         orange button that was both the recommended action and unpressable —
         and the reason why sat in a tooltip no keyboard or touch user could
         reach. When saving is not on offer, the dialog says so in the body and
         the button is simply not there. */
      alt={p?.canSave && !reason ? { label: p.saveLabel, onClick: leaveSave } : undefined}
    >
      {/* With Save on offer the three buttons ARE the content: "save your
          changes or discard them before you leave" is those buttons written out
          as a sentence. A body earns its place here only when it says something
          they cannot — why saving is blocked, or that there is no way to keep
          this work. */}
      {reason ? `This can't be saved yet. ${reason}` : p?.canSave ? undefined : 'Leaving discards your changes.'}
    </Confirm>
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
