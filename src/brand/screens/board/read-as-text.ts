import type { Policy, PolicyStatus } from '../../data'
import { differsFromLive, openForEditing } from '../../policy-draft'

/* -----------------------------------------------------------------------------
   Read as text: which version is read, and the line under it.

   The sentences themselves are `policySentences` in predicate-prose.ts, the
   one renderer every read-back uses. What is here is the rest of the panel
   and the Policies drawer (describe spec, §7.2): the Draft · Live choice, only
   when there are two different things to read, and the status line.
   -------------------------------------------------------------------------- */

export type TextVersion = 'draft' | 'live'

/* The versions a policy can be read in.

   `draft` is what the builder is editing — the board's rules, or a saved
   draft reopened. `live` is what decides sign-ins, offered only when it says
   something the draft does not: a policy that has never been published has
   no live rules to read (its stored rules ARE the draft), and a draft equal
   to live would be a switch between two copies of one text. */
export function readVersions(saved: Policy, draft: Policy): { draft: Policy; live: Policy | null } {
  const live = saved.status !== 'draft' && differsFromLive(saved, draft) ? saved : null
  return { draft, live }
}

/* The same, for a stored policy read from the list: its saved draft when it
   has one, and live beside it. */
export function storedVersions(p: Policy): { draft: Policy; live: Policy | null } {
  return readVersions(p, openForEditing(p))
}

/* The words the status pill uses, not the enum. */
export const STATUS_WORD: Record<PolicyStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  monitor: 'Monitoring',
  inactive: 'Inactive',
  'always-on': 'Always on',
}

/* "Active · Changed 2 hours ago by Jaspreet Toor".

   Mid-sentence, a relative time reads lower case ("Changed yesterday", not
   "Changed Yesterday"), and the store's own "You" becomes "you". The system
   policy was changed by nobody — its stamp is the word "System" — so it
   says its status alone rather than "Changed System by System". */
export function readFoot(p: Pick<Policy, 'status' | 'lastModified' | 'modifiedBy'>): string {
  const status = STATUS_WORD[p.status]
  const when = p.lastModified.trim()
  const who = p.modifiedBy.trim()
  if (!when || !who || when === 'System' || who === 'System') return status
  const said = /^(Just now|Yesterday|Today)\b/.test(when) ? when[0].toLowerCase() + when.slice(1) : when
  return `${status} · Changed ${said} by ${who === 'You' ? 'you' : who}`
}
