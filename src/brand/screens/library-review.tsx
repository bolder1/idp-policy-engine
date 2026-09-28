import { useCallback, useMemo, useRef } from 'react'

import type { ReviewGuard, ReviewRow } from '../kit'
import { useBrand } from '../store'
import { overridePatch, type SignInCheck } from './guard'
import { LibraryCheckValue } from './guard-page'
import {
  LIBRARY_STOP,
  fixWithUndo,
  libraryLines,
  stopLine,
  type FixPage,
  type LibraryGuard,
  type LibraryOptions,
  type LibraryTenant,
} from './library-guard'
import { useSimEnv } from './sim-env'

/* -----------------------------------------------------------------------------
   The library guard, on a page: the rows a zone, a device profile or the risk
   profile in use adds to its Review changes, and why a save is stopped
   (final spec D.6).

   The page hands over the object as saved and as drafted; this reads the
   checks when the review asks (`guard`, for the SaveBar) or when somebody
   leaves (`stopped`, for the leave dialog), never on a keystroke. A saved
   sign-in the edit breaks says so beside its own row, with the ready fix —
   the one edit to the draft that lets every blocker pass again — and, for a
   Must pass, "Expect {Decision} instead". Nothing is said in a footer.
   -------------------------------------------------------------------------- */

export interface LibraryReview {
  /** The SaveBar's `guard`: undefined when the object is not checked — a new one, or an edition without the guard. */
  guard: (() => ReviewGuard) | undefined
  /** Why the checks stop saving the draft now, or null. The leave dialog's reason; saved sign-ins only, no sweeps. */
  stopped: () => string | null
}

/** The rows for Review changes, from a run of the checks. `onFix` absent, no fix is offered (Use, where the fix would be not to). `stop` is the word the review's primary carries while a check holds it. */
export function libraryRows<T>(
  g: LibraryGuard<T>,
  onFix: ((value: T, label: string) => void) | null,
  onOverride: (c: SignInCheck, reason: string) => void,
  stop: string = LIBRARY_STOP,
): ReviewGuard {
  const first = g.blocking[0]
  const fix = g.fix
  const rows: ReviewRow[] = libraryLines(g).map((line) => {
    if (line.unknown) return { ...line, after: <span className="bgd__grey">{line.after}</span> }
    const c = line.signInId ? g.checks.find((x) => x.signIn.id === line.signInId) : undefined
    if (!c) return line
    const offer = c === first && fix && onFix ? { label: fix.label, run: () => onFix(fix.value, fix.label) } : null
    return { ...line, after: <LibraryCheckValue c={c} fix={offer} onOverride={onOverride} stop={stop} /> }
  })
  return { rows, stop: g.blocking.length > 0 ? stop : null }
}

/* The page's side of it. `check` is one of library-guard's module functions,
   so its identity is stable and the reading changes only when the object, the
   draft or the tenant does. */
export function useLibraryReview<T>(
  check: (t: LibraryTenant, saved: T, draft: T, opts?: LibraryOptions) => LibraryGuard<T>,
  saved: T,
  draft: T,
  opts: {
    /** Whether this object is checked at all (`libraryChecked`): a saved zone or device profile, the risk profile in use. */
    on: boolean
    /** Puts a ready fix into the page's draft. Absent, no fix is offered. */
    onFix?: (value: T) => void
    /** Whether a fix leaves nothing to save, so the review closes with it. */
    restored?: (value: T) => boolean
    /** The word the review's primary carries while a check holds it. "Can't save" unless given. */
    stop?: string
  },
): LibraryReview {
  const store = useBrand()
  const env = useSimEnv()
  const { policies, apps, savedSignIns, account, features, updateSavedSignIn, showToast } = store
  const on = opts.on && features.beforeTurningOn
  const stop = opts.stop ?? LIBRARY_STOP

  /* Read when a fix is made or undone, not when the rows were built. */
  const page: FixPage<T> = { draft, onFix: opts.onFix, restored: opts.restored }
  const latest = useRef(page)
  latest.current = page

  const tenant = useMemo<LibraryTenant>(
    () => ({ policies, env, apps, savedSignIns, adminId: account.id }),
    [policies, env, apps, savedSignIns, account.id],
  )

  /* Only whether there is a fix handler decides the rows; the handler itself is read through `latest`. */
  const fixes = !!opts.onFix
  const guard = useMemo(() => {
    if (!on) return undefined
    const applyFix = (value: T, label: string) => fixWithUndo(() => latest.current, showToast, value, label)
    const override = (c: SignInCheck, reason: string) => {
      const patch = overridePatch(c, reason, account.name, new Date().toISOString())
      if (patch) updateSavedSignIn(c.signIn.id, patch)
    }
    return () => libraryRows(check(tenant, saved, draft), fixes ? applyFix : null, override, stop)
  }, [on, fixes, check, tenant, saved, draft, account.name, updateSavedSignIn, showToast, stop])

  const stopped = useCallback(() => (on ? stopLine(check(tenant, saved, draft, { sweep: false })) : null), [on, check, tenant, saved, draft])

  return { guard, stopped }
}
