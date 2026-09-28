import type { AccessDecision, App, Policy, User } from './data'
import type { SavedSignIn } from './saved-sign-ins'
import type { SignInFacts } from './screens/sign-in-facts'

/* -----------------------------------------------------------------------------
   A policy's own checks: the sign-ins Describe it tried the draft with.

   Describe it writes a policy from a sentence and, under the answers, tries it
   against a handful of sign-ins built from the same answers (describe-checks.ts
   makes them): somebody it should let in, somebody it should stop, the sign-in
   on the edge of a band or a zone, the admin at the console, and somebody it
   does not name. They are kept on the policy (`Policy.checks`) when it is
   saved, so the checks before turning it on can read them again (describe
   spec, §5).

   Not the tenant's saved sign-ins. Those are promises an admin made and
   levelled — Note, Must pass, Protected — and they live in their own library.
   These are what the text said, generated, and they never block anything: to
   the guard each is a Note (`checksAsSignIns`), listed when a page opens and
   never a reason to stop — nor to open one (describe spec, Assumption 11), so
   one newly let in is not "somebody newly let in". An admin who wants one to
   hold promotes it with Try a sign-in's "Save sign-in".
   -------------------------------------------------------------------------- */

export type CheckKind = 'pass' | 'stop' | 'edge' | 'you' | 'not-named'

/** The kind, as the Checks rows and the guard's names say it. */
export const CHECK_KIND_WORDS: Record<CheckKind, string> = {
  pass: 'Should pass',
  stop: 'Should stop',
  edge: 'Edge',
  you: 'You',
  'not-named': 'Not named',
}

/** The order the rows are drawn in. */
export const CHECK_KINDS: readonly CheckKind[] = ['pass', 'stop', 'edge', 'you', 'not-named']

export interface DraftCheck {
  /** Unique on its policy. Describe it writes one check of each kind, and uses the kind. */
  id: string
  kind: CheckKind
  facts: SignInFacts
  /* From the text for pass, stop and edge; today's decision for not-named;
     the draft's own result for you. */
  expected: AccessDecision
  /** The words it came from, for pass, stop and edge. */
  phrase?: string
}

/* A policy's checks as note-level saved sign-ins, for the guard.

   Named for the row they become — "Kavya Menon on Workday · Should pass" —
   and keyed under the policy, so two policies' Should pass never share an id
   with each other or with a saved sign-in. */
export function checksAsSignIns(
  p: Pick<Policy, 'id' | 'checks' | 'modifiedBy'>,
  people: readonly Pick<User, 'id' | 'name'>[],
  apps: readonly Pick<App, 'id' | 'name'>[],
): SavedSignIn[] {
  return (p.checks ?? []).map((c) => {
    const person = people.find((u) => u.id === c.facts.personId)?.name ?? c.facts.personId ?? 'Somebody'
    const app = apps.find((a) => a.id === c.facts.appId)?.name ?? c.facts.appId ?? 'an application'
    return {
      id: `${p.id}:${c.id}`,
      name: `${person} on ${app} · ${CHECK_KIND_WORDS[c.kind]}`,
      facts: c.facts,
      expected: c.expected,
      level: 'note',
      savedBy: p.modifiedBy,
      savedAt: '',
      generated: true,
    }
  })
}

/* What the checks before a change read (describe spec, §5.5): the tenant's
   saved sign-ins, and — with the edition's flag on — the guarded policy's own
   checks after them. `on` is `features.draftChecks`, passed by name at each
   call site so the gate reads where it is used. */
export function guardSignIns(
  saved: readonly SavedSignIn[],
  p: Pick<Policy, 'id' | 'checks' | 'modifiedBy'> | null,
  people: readonly Pick<User, 'id' | 'name'>[],
  apps: readonly Pick<App, 'id' | 'name'>[],
  on: boolean,
): readonly SavedSignIn[] {
  if (!on || !p?.checks || p.checks.length === 0) return saved
  return [...saved, ...checksAsSignIns(p, people, apps)]
}
