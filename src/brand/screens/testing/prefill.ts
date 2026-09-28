import type { Policy, User } from '../../data'
import type { SignInForm } from './sign-in-form'

/* -----------------------------------------------------------------------------
   The patches Policy testing makes to its sign-in from outside Try: a policy
   row's "Try a sign-in", a Check a person row, a new application.

   Its own module, holding nothing but types, because the Policies list uses
   it and the list is the landing screen: importing it from selectors.ts pulled
   the evaluator into the first chunk every console load fetches, which the
   slider's lazy body exists to keep out.
   -------------------------------------------------------------------------- */

/** An app access policy on this application — the Global Default is on all of them. */
export const covers = (p: Policy, appId: string | null): boolean =>
  p.type === 'App Access' && (p.isSystem === true || (appId !== null && p.appIds.includes(appId)))

/* A patch as Try applies it. An application the assumed policy does not cover
   ends the assumption — it would otherwise stand on a policy the sign-in
   cannot meet, and read as though it had been tried. */
export function patchFor(form: SignInForm, patch: Partial<SignInForm>, policies: readonly Policy[]): Partial<SignInForm> {
  if (patch.appId === undefined || !form.assumeOn) return patch
  const p = policies.find((x) => x.id === form.assumeOn)
  return p && covers(p, patch.appId) ? patch : { ...patch, assumeOn: null }
}

/* A patch to the page's form, from a policy row's "Try a sign-in" (spec B,
   §2.3): its first application and somebody it is for; the policy assumed on
   when it is not on, so the answer is the policy's own. Everything else — the
   address, the time, the device — stays as the tester left it. The Global
   Default is on every application and for everybody, so it keeps both.

   Somebody it is for: the person already being tried when the policy is for
   them, else the first person in its first group — the board's own pick
   (`defaultBoardForm`), so the row menu and the board open on the same
   person — then its named people. */
export function formForPolicy(policy: Policy, people: readonly Pick<User, 'id' | 'groupId'>[], current: SignInForm, policies: readonly Policy[]): SignInForm {
  const appId = policy.isSystem ? current.appId : (policy.appIds[0] ?? current.appId)
  const a = policy.audience
  const now = people.find((u) => u.id === current.personId)
  const governed = now !== undefined && (a.groupIds.includes(now.groupId) || a.userIds.includes(now.id))
  const personId =
    a.everyone || governed
      ? current.personId
      : (a.groupIds.map((g) => people.find((u) => u.groupId === g)?.id).find((id) => id !== undefined) ?? a.userIds[0] ?? current.personId)
  const next: SignInForm = { ...current, appId, personId }
  const off = policy.status === 'inactive' || policy.status === 'draft'
  if (off && covers(policy, appId)) return { ...next, assumeOn: policy.id }
  return { ...next, ...patchFor(current, { appId }, policies) }
}
