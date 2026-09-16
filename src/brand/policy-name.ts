import { nameTaken } from './data'

/* Policy names: one check for every form that names a policy.

   Delete, status and copy dialogs, toasts and the list all identify a policy by
   its name, so two policies with one name are two rows nobody can tell apart.
   Compared trimmed and case-insensitive, like every other library name. */

/** The longest policy name any form accepts. */
export const POLICY_NAME_MAX = 50

/** Why `name` cannot be saved, or null. `selfId` is the policy being renamed, which does not clash with itself. */
export function policyNameIssue(
  name: string,
  policies: readonly { id: string; name: string }[],
  selfId?: string,
): string | null {
  if (!name.trim()) return 'A policy needs a name.'
  const others = policies.filter((p) => p.id !== selfId).map((p) => p.name)
  if (nameTaken(name, others)) return 'A policy with this name already exists.'
  return null
}

/* A name nothing else has, for a name the product suggests: "X", then "X 2",
   "X 3"… Not "X (copy)" — a policy made from a template or the guided build is
   not a copy of anything. The base is shortened so the whole name fits `max`. */
export function freeName(base: string, taken: Iterable<string>, max = POLICY_NAME_MAX): string {
  const others = [...taken]
  const root = base.trim()
  const first = root.slice(0, max).trimEnd()
  if (!nameTaken(first, others)) return first
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`
    const candidate = `${root.slice(0, Math.max(1, max - suffix.length)).trimEnd()}${suffix}`
    if (!nameTaken(candidate, others)) return candidate
  }
}
