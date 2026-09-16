import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Button, Modal } from '../kit'
import { appsOf, type App, type Policy } from '../data'
import { turnOnBlocker } from '../policy-draft'
import { useBrand } from '../store'
import { listPhrase } from './app-policies'
import { diagnose } from './diagnostics'
import { portalRoot, type StatusTarget } from './status-options'

/* -----------------------------------------------------------------------------
   Switching a published policy on and off.

   One confirmation and one menu, used by both builder bars and the Policies row
   menu, so the same choice leaves the same status wherever it is made. Reads
   and writes the STORED policy: a builder holds its own copy, and the status is
   not part of what a builder edits.
   -------------------------------------------------------------------------- */

/* The applications, as words in a sentence. Null when there are none. */
function appsPhrase(policy: Policy, apps: App[]): string | null {
  if (policy.isSystem) return 'every application'
  const named = appsOf(policy, apps)
  return named.length === 0 ? null : listPhrase(named.map((a) => a.name))
}

interface Ask {
  policy: Policy
  target: StatusTarget
  blocker: string | null
  /* Where the fix is: the policy's rules, or its applications. */
  fix: 'open' | 'apps' | null
}

export interface StatusChangeOptions {
  /* "Assign applications" in the Can't-turn-on dialog. Given, it runs this
     instead of leaving for Policy details — the list opens its own dialog. */
  onAssignApps?: (policy: Policy) => void
  /** Called just before a confirmed change is written. */
  onChange?: (policy: Policy, target: StatusTarget) => void
}

export function useStatusChange(options: StatusChangeOptions = {}): {
  request: (policy: Policy, target: StatusTarget) => void
  dialog: ReactNode
} {
  const store = useBrand()
  const [ask, setAsk] = useState<Ask | null>(null)
  /* Separate from `ask`, so the dialog keeps its words while it animates out. */
  const [open, setOpen] = useState(false)

  const request = (given: Policy, target: StatusTarget) => {
    const policy = store.policyById(given.id) ?? given
    let blocker: string | null = null
    let fix: Ask['fix'] = null
    if (target === 'active') {
      /* The live rules only: a saved draft or a builder copy is not what turns on. */
      const errors = diagnose(policy, store.groups, store.hooks, store.users, {
        zones: store.zones,
        fingerprints: store.fingerprints,
      }).filter((d) => d.severity === 'error' && policy.rules[d.ruleIndex]?.enabled !== false).length
      blocker = turnOnBlocker(policy, errors)
      if (blocker) fix = policy.status !== 'draft' && !policy.isSystem && policy.appIds.length === 0 ? 'apps' : 'open'
    }
    setAsk({ policy, target, blocker, fix })
    setOpen(true)
  }

  const close = () => setOpen(false)

  let dialog: ReactNode = null
  if (ask) {
    const { policy, target, blocker, fix } = ask
    const name = policy.name
    const apps = appsPhrase(policy, store.apps)
    const to = apps ? ` to ${apps}` : ''
    const screen = store.screen
    /* Already in this policy's builder, "Open policy" would go nowhere. */
    const here = (screen.name === 'board' || screen.name === 'builder') && screen.policyId === policy.id

    if (blocker) {
      dialog = (
        <Modal
          open={open}
          onClose={close}
          title={`Can't turn on ${name}`}
          width={480}
          footer={
            <>
              <Button variant="secondary" onClick={close}>
                Close
              </Button>
              {fix === 'apps' && (
                <Button
                  variant="brand"
                  onClick={() => {
                    close()
                    if (options.onAssignApps) {
                      options.onAssignApps(policy)
                      return
                    }
                    const from = screen.name === 'builder' ? 'builder' : screen.name === 'policies' ? 'policies' : 'board'
                    store.go({ name: 'policy-details', policyId: policy.id, from })
                  }}
                >
                  Assign applications
                </Button>
              )}
              {fix === 'open' && !here && (
                <Button
                  variant="brand"
                  onClick={() => {
                    close()
                    store.go({ name: 'board', policyId: policy.id })
                  }}
                >
                  Open policy
                </Button>
              )}
            </>
          }
        >
          <div className="bx-confirm">
            <p>{blocker}</p>
          </div>
        </Modal>
      )
    } else {
      const copy =
        target === 'active'
          ? { title: `Turn on ${name}?`, body: `It starts deciding sign-ins${to}.`, verb: 'Turn on', toast: `${name} is on` }
          : { title: `Turn off ${name}?`, body: `It stops deciding sign-ins${to}.`, verb: 'Turn off', toast: `${name} is off` }

      dialog = (
        <Modal
          open={open}
          onClose={close}
          title={copy.title}
          width={480}
          footer={
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="brand"
                onClick={() => {
                  options.onChange?.(policy, target)
                  store.setPolicyStatus(policy.id, target)
                  store.showToast(copy.toast)
                  close()
                }}
              >
                {copy.verb}
              </Button>
            </>
          }
        >
          <div className="bx-confirm">
            <p>{copy.body}</p>
            {target === 'active' && policy.pendingDraft && <p>Your saved draft is not included.</p>}
          </div>
        </Modal>
      )
    }
  }

  /* Portalled, so a sticky cell or a bar cannot trap its scrim. */
  return { request, dialog: dialog ? createPortal(dialog, portalRoot()) : null }
}
