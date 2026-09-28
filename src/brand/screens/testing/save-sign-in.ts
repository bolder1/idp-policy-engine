import { nameTaken, type AccessDecision, type App, type User, type Zone } from '../../data'
import { freeName } from '../../policy-name'
import { SAVED_NAME_MAX, type SavedSignIn, type SignInLevel } from '../../saved-sign-ins'
import { factsOf, type SignInForm } from './sign-in-form'

/* -----------------------------------------------------------------------------
   Saving the sign-in on screen, with the decision it should keep getting.

   Opened inline, under the result that prompted it, never as a dialog: the
   answer being saved stays in view while it is named. Three questions — a
   name, the expected decision, and how hard a change may push against it —
   and each starts from what is already on screen:

     name      "{person} on {app}", made unique the way a policy copy is
     expected  the decision shown, because "this should keep happening" is
               the usual reason to save one. Can't tell has no default: a
               sign-in the tenant cannot decide has no answer to promise, so
               the admin has to choose one before Save is on
     level     Note, the one that never blocks anything

   What is saved is the facts, not the form (saved-sign-ins.ts).
   -------------------------------------------------------------------------- */

export interface SaveDraft {
  name: string
  expected: AccessDecision | null
  level: SignInLevel
}

export const INCOMPLETE = 'Choose a person and an application'

export function defaultSaveDraft(
  form: Pick<SignInForm, 'personId' | 'appId'>,
  shown: AccessDecision | null,
  people: readonly Pick<User, 'id' | 'name'>[],
  apps: readonly Pick<App, 'id' | 'name'>[],
  saved: readonly Pick<SavedSignIn, 'name'>[],
): SaveDraft {
  const person = people.find((u) => u.id === form.personId)?.name ?? 'Somebody'
  const app = apps.find((a) => a.id === form.appId)?.name ?? 'an application'
  return {
    name: freeName(`${person} on ${app}`, saved.map((s) => s.name), SAVED_NAME_MAX),
    expected: shown,
    level: 'note',
  }
}

/* What the form holds: each answer the screen's, until the admin gives their
   own. The sign-in stays editable while the form is open, so a name and an
   expected decision taken once, on opening, were saved against whatever the
   sign-in had become by Save — Kavya's name and her 2FA on Aisha's facts. */
export function currentDraft(screen: SaveDraft, edits: Partial<SaveDraft>): SaveDraft {
  return { ...screen, ...edits }
}

/** Why Save is off, in the words its title says; null when it is on. */
export function saveIssue(form: Pick<SignInForm, 'personId' | 'appId'>, draft: SaveDraft, saved: readonly Pick<SavedSignIn, 'name'>[]): string | null {
  if (!form.personId || !form.appId) return INCOMPLETE
  if (!draft.name.trim()) return 'Enter a name'
  if (nameTaken(draft.name, saved.map((s) => s.name))) return 'A saved sign-in with this name already exists'
  if (!draft.expected) return 'Choose the expected decision'
  return null
}

/* The saved sign-in, ready for the store, which gives it its id. Refuses a
   draft `saveIssue` has not passed, so a caller cannot skip the check. */
export function savedSignInOf(form: SignInForm, draft: SaveDraft, zones: readonly Zone[], by: string, at: string): SavedSignIn {
  if (!draft.expected || !form.personId || !form.appId) throw new Error('savedSignInOf: the draft is not ready to save')
  return {
    id: '',
    name: draft.name.trim(),
    facts: factsOf(form, zones).facts,
    expected: draft.expected,
    level: draft.level,
    savedBy: by,
    savedAt: at,
  }
}
