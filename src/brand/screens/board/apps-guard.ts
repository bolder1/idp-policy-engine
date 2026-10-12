import { useState, type ComponentProps } from 'react'

import type { Policy } from '../../data'
import { guardSignIns } from '../../draft-checks'
import type { SavedSignIn } from '../../saved-sign-ins'
import { useBrand, useNameLookup } from '../../store'
import { engineDecides } from '../app-standing'
import { afterPaint, guardOpens, isStale, overridePatch, patchSignIns, tryRunGuard, type GuardInput, type GuardResult, type GuardStamp, type ReadyFix, type SignInCheck } from '../guard'
import type { GuardDrawer } from '../guard-page'
import { detailsChanges } from '../policy-details-review'
import { useSimEnv } from '../sim-env'

/* -----------------------------------------------------------------------------
   Before saving: applications — the checks a change to a policy's applications
   runs first (final spec, D.2), wherever the change is made.

   Lifted out of the builder's Applications pane (AppsPane.tsx) so that an
   application's own page runs the same ones when it adds an existing policy
   or takes one off. Only a policy that decides sign-ins is checked
   (`engineDecides`): a new application is sign-ins it starts deciding, a
   removed one is sign-ins it hands to another policy. A draft, an inactive or
   monitoring policy, or one that is not an app access policy decides nobody's
   sign-in either way.

   A clean result writes in the same press; the page opens only when a Must
   pass or Protected sign-in newly fails, or somebody is newly let in. The
   policy is an argument of `check` rather than of the hook, because the
   application page guards a different policy on each press.

   State and logic only: the caller renders GuardDrawer with `page(…)`'s props,
   so each place keeps its own primary label, its own write and, where it has
   ticks to change, its own ready fixes.
   -------------------------------------------------------------------------- */

/** Before saving: applications, as it last ran — the policy, and the applications it read. */
export interface AppsGuardRun {
  policyId: string
  result: GuardResult | 'error'
  stamp: GuardStamp
  run: number
  appIds: string[]
}

export interface AppsGuardPage {
  /** "Save applications", "Add to Box", "Remove from Box". */
  primaryLabel: string
  /** The write, once the page is confirmed: the applications it read, and the policy as stored now. */
  onConfirm: (appIds: string[], policy: Policy) => void
  /* The ticks as they stand, where the caller has ticks: the page is stale
     when they are not the ones it read, and Run again reads them. */
  current?: string[]
  /** A ready fix the caller applies itself. Absent: one that leaves nothing to save closes the page; any other runs the checks on it. */
  onApplyFix?: (fix: ReadyFix) => void
}

export function useAppsGuard() {
  const store = useBrand()
  const env = useSimEnv()
  const resolve = useNameLookup()
  const [checking, setChecking] = useState(false)
  const [held, setHeld] = useState<AppsGuardRun | null>(null)
  const [open, setOpen] = useState(false)

  const appName = (id: string) => store.appById(id).name
  const changesOf = (p: Policy, ids: string[]) => detailsChanges(p, { name: p.name, appIds: ids }, appName)
  /* The page's policy as stored now. Gone, and there is no page to show. */
  const stored = held ? store.policyById(held.policyId) : undefined

  /** Whether a change of this policy's applications runs the checks. */
  const guards = (p: Policy) => store.features.beforeTurningOn && engineDecides(p)

  const stampNow = (): GuardStamp => ({ policies: store.policies, zones: store.zones, fingerprints: store.fingerprints, riskScale: store.riskScale })
  const inputFor = (p: Policy, ids: string[], signIns: readonly SavedSignIn[] = store.savedSignIns): GuardInput => ({
    kind: 'apps',
    before: p,
    after: { ...p, appIds: ids, status: changesOf(p, ids).becomesDraft ? 'draft' : p.status },
    changedFrom: null,
    policies: store.policies,
    env,
    apps: store.apps,
    /* The policy's own checks too, as stored (describe spec, §5.5). */
    savedSignIns: guardSignIns(signIns, p, store.users, store.apps, store.features.draftChecks),
    adminId: store.account.id,
    breakIn: store.features.breakInTest ? (store.breakInAccepted[p.id] ?? {}) : null,
    resolve,
  })
  const hold = (p: Policy, ids: string[], result: GuardResult | 'error', run: number) =>
    setHeld({ policyId: p.id, result, stamp: stampNow(), run, appIds: ids })

  /* Runs the checks on `ids` once "Checking…" has painted. A clean result
     commits in the same press; anything else holds the result and opens the page. */
  const check = (p: Policy, ids: string[], commit: (ids: string[]) => void) => {
    if (checking) return
    setChecking(true)
    afterPaint(() => {
      const result = tryRunGuard(inputFor(p, ids))
      setChecking(false)
      if (result !== 'error' && !guardOpens(result)) return commit(ids)
      hold(p, ids, result, 0)
      setOpen(true)
    })
  }

  /** The checks again, on `ids`, for the page that is held. */
  const rerun = (ids: string[], signIns?: readonly SavedSignIn[]) => {
    if (!held || !stored) return
    hold(stored, ids, tryRunGuard(inputFor(stored, ids, signIns)), held.run + 1)
  }

  const close = () => setOpen(false)

  /* A Must pass, expected otherwise from the page, with a reason: saved, and the checks read it. */
  const override = (c: SignInCheck, reason: string) => {
    const patch = overridePatch(c, reason, store.account.name, new Date().toISOString())
    if (!patch || !held) return
    store.updateSavedSignIn(c.signIn.id, patch)
    rerun(held.appIds, patchSignIns(store.savedSignIns, c.signIn.id, patch))
  }

  /* With no ticks to change, a ready fix on an application keeps the one taken
     away or leaves out the one added — undoing the change the page is about. */
  const applyFix = (f: ReadyFix) => {
    if (!stored) return
    const ids = f.policy.appIds
    if (changesOf(stored, ids).changes.length === 0) {
      setOpen(false)
      store.showToast('Nothing left to save')
      return
    }
    rerun(ids)
  }

  /** GuardDrawer's props for the held page, or null when there is none. */
  const page = (o: AppsGuardPage): ComponentProps<typeof GuardDrawer> | null => {
    if (!held || !stored) return null
    return {
      open,
      kind: 'apps',
      policyName: stored.name,
      result: held.result,
      run: held.run,
      primaryLabel: o.primaryLabel,
      appChanges: changesOf(stored, held.appIds).rows,
      onConfirm: () => {
        setOpen(false)
        o.onConfirm(held.appIds, stored)
      },
      onClose: close,
      stale: open && (isStale(held.stamp, stampNow()) || (o.current !== undefined && held.appIds !== o.current)),
      onRerun: () => rerun(o.current ?? held.appIds),
      onApplyFix: o.onApplyFix ?? applyFix,
      onOverride: override,
    }
  }

  return { guards, checking, open, held, check, rerun, close, page }
}
