import type { Policy, PolicyStatus } from '../data'
import type { ReviewLine } from '../review-rows'

/* What a Policy details edit changes, in the words the save bar and the Review
   changes dialog use.

   Compared as the save will store it: the name trimmed, the applications as a
   set. A trailing space or a reordered list is not a change, so it neither
   raises the bar nor trips the leave guard. */

export interface DetailsDraft {
  name: string
  appIds: string[]
}

/* A Review changes row. The name leads the review on its own (no group); each
   application added or removed sits under Applications, named by `item`, with
   "Assigned" as its value — the app's name again would read "GitHub  GitHub".
   The status and rules rows are consequences of the edit (`effect`), shown
   last. */
export type DetailsRow = ReviewLine

export interface DetailsChanges {
  /** Short names for the save bar: "Name", "Applications". Empty means nothing to save. */
  changes: string[]
  /** One row per change, saved value against the value after saving. */
  rows: DetailsRow[]
  /** Saving leaves the policy with no applications, so it goes back to draft. */
  becomesDraft: boolean
  /** Going back to draft puts the saved draft's rules in place of the published ones. */
  takesSavedDraft: boolean
}

const STATUS_WORD: Record<PolicyStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  inactive: 'Inactive',
  'always-on': 'Always on',
}

const ASSIGNED = 'Assigned'

/** The system policy covers every application, so its applications are never edited here. */
export function detailsChanges(saved: Policy, draft: DetailsDraft, appName: (id: string) => string): DetailsChanges {
  const changes: string[] = []
  const rows: DetailsRow[] = []

  const name = draft.name.trim()
  if (name !== saved.name) {
    changes.push('Name')
    rows.push({ label: 'Name', before: saved.name, after: name, kind: 'changed' })
  }

  const appIds = saved.isSystem ? saved.appIds : draft.appIds
  const added = appIds.filter((id) => !saved.appIds.includes(id))
  const removed = saved.appIds.filter((id) => !appIds.includes(id))
  if (added.length + removed.length > 0) changes.push('Applications')
  for (const id of added) {
    const app = appName(id)
    rows.push({ label: `Applications: added ${app}`, before: '', after: ASSIGNED, group: 'Applications', kind: 'added', item: app })
  }
  for (const id of removed) {
    const app = appName(id)
    rows.push({ label: `Applications: removed ${app}`, before: ASSIGNED, after: '', group: 'Applications', kind: 'removed', item: app })
  }

  const becomesDraft = !saved.isSystem && appIds.length === 0 && saved.status !== 'draft'
  /* A consequence, not an edit: listed only beside a change somebody made. */
  if (becomesDraft && changes.length > 0) {
    rows.push({ label: 'Status', before: STATUS_WORD[saved.status], after: 'Draft', kind: 'changed', effect: true })
  }
  /* A draft holds one set of rules, so the store folds a saved draft into the
     rules when the policy goes back to draft (`settled`). Said here, because
     the published rules are what stop existing. */
  const takesSavedDraft = becomesDraft && !!saved.pendingDraft
  if (takesSavedDraft && changes.length > 0) {
    rows.push({ label: 'Rules', before: 'Published rules', after: 'Saved draft', kind: 'changed', effect: true })
  }

  return { changes, rows, becomesDraft, takesSavedDraft }
}
