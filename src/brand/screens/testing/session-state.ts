import { createContext, useContext } from 'react'

import type { TestingView } from '../../store'
import type { FormField, SignInForm } from './sign-in-form'

/* -----------------------------------------------------------------------------
   The testing session: the sign-in being tried, and where the tester is.

   Not on the store. A text field commits here a few times a second while
   somebody types an address, and every change to the store's value re-renders
   every `useBrand()` consumer in the console — the reason the toast moved out
   of it (store.tsx). This sits in its own context above both shells, so it
   lasts until a reload, survives navigation, a switch between testing versions
   and a trip to the User Dashboard, and is reset for another tenant.

   Two kinds of form live here. `form` is the Policy testing views' one
   sign-in, shared by Try, Check a person and every version of the page. The
   board keeps one per policy in `boardForms`, because the board tries a sign-in
   against the policy it has open, and the one that suits HRMS is not the one
   that suits Google Workspace.

   The provider is in session.tsx; this file is the state, so it can be tested
   without a render and imported without one.
   -------------------------------------------------------------------------- */

export type { TestingView }

export interface TestingSessionState {
  form: SignInForm
  boardForms: Record<string, SignInForm>
  view: TestingView
  /* Bumped by `load` and `replay`, never by `patch`: a run is what the route
     marker travels for, and it must not travel while somebody types. Starts at
     1, because the first open is a run. */
  runId: number
  /** The last field a patch changed, on the page or the board, for "Changed by …". Cleared by `load`. */
  lastEdited: FormField | null
  /** Which policy the Break-in test runs on, and whether its page is open. */
  breakIn: { policyId: string | null; open: boolean }
}

export type SessionAction =
  | { type: 'patch'; patch: Partial<SignInForm>; field: FormField }
  /** `base` is the policy's default board form, used when it has none yet. */
  | { type: 'patch-board'; policyId: string; base: SignInForm; patch: Partial<SignInForm>; field: FormField }
  /** A whole sign-in into the board's form for this policy: a saved sign-in's Try in the board's panel. */
  | { type: 'load-board'; policyId: string; form: SignInForm }
  | { type: 'load'; form: SignInForm }
  | { type: 'replay' }
  | { type: 'view'; view: TestingView }
  | { type: 'open-break-in'; policyId: string | null }
  | { type: 'close-break-in' }
  /** Another tenant: everything starts again from its first sign-in. */
  | { type: 'reset'; form: SignInForm }

export function initialSession(form: SignInForm): TestingSessionState {
  return { form, boardForms: {}, view: 'try', runId: 1, lastEdited: null, breakIn: { policyId: null, open: false } }
}

export function sessionReducer(s: TestingSessionState, a: SessionAction): TestingSessionState {
  switch (a.type) {
    case 'patch':
      return { ...s, form: { ...s.form, ...a.patch }, lastEdited: a.field }
    case 'patch-board':
      return {
        ...s,
        boardForms: { ...s.boardForms, [a.policyId]: { ...(s.boardForms[a.policyId] ?? a.base), ...a.patch } },
        lastEdited: a.field,
      }
    case 'load':
      return { ...s, form: a.form, runId: s.runId + 1, lastEdited: null }
    /* The board plays its own run (use-try-sign-in.ts), so no runId here; what
       changed is forgotten, as a load on the page forgets it. */
    case 'load-board':
      return { ...s, boardForms: { ...s.boardForms, [a.policyId]: a.form }, lastEdited: null }
    case 'replay':
      return { ...s, runId: s.runId + 1 }
    case 'view':
      return s.view === a.view ? s : { ...s, view: a.view }
    case 'open-break-in':
      return { ...s, breakIn: { policyId: a.policyId, open: true } }
    case 'close-break-in':
      return s.breakIn.open ? { ...s, breakIn: { ...s.breakIn, open: false } } : s
    case 'reset':
      return initialSession(a.form)
  }
}

export interface TestingSession extends TestingSessionState {
  patch(p: Partial<SignInForm>, field: FormField): void
  /** Patches the board's form for this policy, starting from its default the first time. */
  patchBoard(policyId: string, p: Partial<SignInForm>, field: FormField): void
  /** Replaces the board's form for this policy: a saved sign-in tried in the board's panel. */
  loadBoard(policyId: string, form: SignInForm): void
  /** Replaces the form and plays a run: a sample, a saved sign-in, a row-menu prefill. */
  load(form: SignInForm): void
  replay(): void
  setView(v: TestingView): void
  openBreakIn(policyId: string | null): void
  closeBreakIn(): void
}

export const TestingSessionContext = createContext<TestingSession | null>(null)

/* What Policy testing's status region says (spec B §7): the answer once per
   run, and on an edit that moves it. The region is the provider's, in the
   page from the console's first draw, because the views are drawn afresh
   whenever they open — the page, the slider, the Try tab — and a region
   inserted together with its words is often not announced (the toast's
   region in Shell.tsx is always there for the same reason). Its own context,
   so a sentence said re-renders nothing that reads the session. */
export const TestingSayContext = createContext<(text: string) => void>(() => {})

export const useTestingSay = (): ((text: string) => void) => useContext(TestingSayContext)

export function useTestingSession(): TestingSession {
  const s = useContext(TestingSessionContext)
  if (!s) throw new Error('useTestingSession must be used inside TestingSessionProvider')
  return s
}
