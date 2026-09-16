import type { Policy, Rule } from './data'

/* Draft mode for policies — the rules both builders share.

   A policy has at most two versions of its rules:
   - the LIVE rules (`rules`, `fallback`), which decide sign-ins, and
   - a saved DRAFT (`pendingDraft`), only on a published policy, which the
     builders open on until it is published or discarded.

   A policy whose status is `draft` has nothing live to protect, so saving a
   draft writes straight into it and it never carries `pendingDraft`. */

export interface RuleSet {
  rules: Rule[]
  fallback?: Rule
}

const ruleSet = (p: Pick<Policy, 'rules' | 'fallback'>): RuleSet => ({ rules: p.rules, fallback: p.fallback })

/** The policy as a builder should open it: the saved draft if there is one, otherwise the live rules. */
export function openForEditing(p: Policy): Policy {
  return p.pendingDraft ? { ...p, rules: p.pendingDraft.rules, fallback: p.pendingDraft.fallback } : p
}

/** What was last saved — the draft if there is one, otherwise the live rules. The "unsaved changes" baseline. */
export function lastSaved(p: Policy): RuleSet {
  return p.pendingDraft ? { rules: p.pendingDraft.rules, fallback: p.pendingDraft.fallback } : ruleSet(p)
}

const same = (a: RuleSet, b: RuleSet) => JSON.stringify({ r: a.rules, f: a.fallback }) === JSON.stringify({ r: b.rules, f: b.fallback })

/** Edits made since the last save or draft. Drives the leave guard, Save draft and the "Unsaved changes" pill. */
export function hasUnsavedChanges(saved: Policy, draft: RuleSet): boolean {
  return !same(lastSaved(saved), draft)
}

/** The draft differs from what is live — something to publish. Drives Review & save. */
export function differsFromLive(saved: Policy, draft: RuleSet): boolean {
  return !same(ruleSet(saved), draft)
}

/** Saving a draft: into the policy while it is still a draft, into `pendingDraft` once it is published. */
export function withSavedDraft(p: Policy, d: RuleSet, who = 'You', when = 'Just now'): Policy {
  if (p.status === 'draft') {
    return { ...p, rules: d.rules, fallback: d.fallback, pendingDraft: undefined, lastModified: when, modifiedBy: who }
  }
  /* Saving a draft identical to what is live keeps nothing worth keeping. */
  if (same(ruleSet(p), d)) return { ...p, pendingDraft: undefined }
  return { ...p, pendingDraft: { rules: d.rules, fallback: d.fallback, savedAt: when, savedBy: who } }
}

/** Publishing makes the draft live and ends it. */
export function published(draft: Policy): Policy {
  return { ...draft, pendingDraft: undefined }
}

/* --- Committing and switching on -----------------------------------------------

   One rule for both builders and the list, so the same button leaves the same
   status wherever it is pressed:
   - a policy with no applications is unfinished, so it is a draft whatever else
     happens (the system policy excepted);
   - a draft that is committed becomes a published policy, switched off unless
     the admin chose to turn it on;
   - a published policy keeps its status. The status is read from the SAVED
     policy, never the builder's copy, because the status can be changed from
     the bar while an edit is open. */

export type CommitIntent = 'keep-off' | 'turn-on'

const hasApps = (p: Pick<Policy, 'appIds' | 'isSystem'>) => p.isSystem === true || p.appIds.length > 0

/** The policy as Review & save stores it. */
export function committed(saved: Policy, draft: Policy, intent: CommitIntent = 'keep-off'): Policy {
  const base = published({ ...draft, status: saved.status })
  if (!hasApps(base)) return { ...base, status: 'draft' }
  if (saved.status === 'draft') return { ...base, status: intent === 'turn-on' ? 'active' : 'inactive' }
  return base
}

/** Why a policy cannot be switched on, or null when it can. `errors` counts blocking errors on its live rules. */
export function turnOnBlocker(p: Pick<Policy, 'appIds' | 'isSystem' | 'status' | 'pendingDraft'>, errors: number): string | null {
  if (p.status === 'draft') return 'Review and save this draft first.'
  if (!hasApps(p)) return 'Assign an application first.'
  /* "Live" when a saved draft exists, because that draft may already be fixed. */
  const rules = p.pendingDraft ? 'its live rules' : 'its rules'
  if (errors > 0) return errors === 1 ? `Fix the error in ${rules} first.` : `Fix the ${errors} errors in ${rules} first.`
  return null
}

/* A draft has nothing live to keep apart, so a policy that becomes a draft (its
   last application removed) takes its saved draft as its rules. */
export function asStored(p: Policy): Policy {
  return p.status === 'draft' && p.pendingDraft
    ? { ...p, rules: p.pendingDraft.rules, fallback: p.pendingDraft.fallback, pendingDraft: undefined }
    : p
}

/** True when `next` differs from `prev` in anything but the audit stamp. */
export function changedBeyondStamp(prev: Policy, next: Policy): boolean {
  const strip = ({ lastModified: _m, modifiedBy: _b, ...rest }: Policy) => rest
  return JSON.stringify(strip(prev)) !== JSON.stringify(strip(next))
}

/** The toast after a commit, from the status before and after. Shared by both builders so they say the same thing. */
export function commitToast(before: Policy, after: Policy): string {
  const name = after.name
  if (after.status === 'draft') return `${name} saved as a draft`
  if (after.status === before.status) return `${name} saved`
  if (after.status === 'inactive') return `${name} saved. It is off.`
  return `${name} saved and turned on`
}
