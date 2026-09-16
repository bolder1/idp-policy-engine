import type { Policy, PolicyStatus } from '../data'

/* What a Policy details edit changes, in the words the save bar and the Review
   changes dialog use.

   Compared as the save will store it: the name trimmed, the applications as a
   set. A trailing space or a reordered list is not a change, so it neither
   raises the bar nor trips the leave guard. */

export interface DetailsDraft {
  name: string
  appIds: string[]
}

export interface DetailsRow {
  label: string
  before: string
  after: string
}

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

/** The system policy covers every application, so its applications are never edited here. */
export function detailsChanges(saved: Policy, draft: DetailsDraft, appName: (id: string) => string): DetailsChanges {
  const changes: string[] = []
  const rows: DetailsRow[] = []

  const name = draft.name.trim()
  if (name !== saved.name) {
    changes.push('Name')
    rows.push({ label: 'Name', before: saved.name, after: name })
  }

  const appIds = saved.isSystem ? saved.appIds : draft.appIds
  const added = appIds.filter((id) => !saved.appIds.includes(id))
  const removed = saved.appIds.filter((id) => !appIds.includes(id))
  if (added.length + removed.length > 0) changes.push('Applications')
  for (const id of added) rows.push({ label: `Applications: added ${appName(id)}`, before: '', after: appName(id) })
  for (const id of removed) rows.push({ label: `Applications: removed ${appName(id)}`, before: appName(id), after: '' })

  const becomesDraft = !saved.isSystem && appIds.length === 0 && saved.status !== 'draft'
  /* A consequence, not an edit: listed only beside a change somebody made. */
  if (becomesDraft && changes.length > 0) rows.push({ label: 'Status', before: STATUS_WORD[saved.status], after: 'Draft' })
  /* A draft holds one set of rules, so the store folds a saved draft into the
     rules when the policy goes back to draft (`settled`). Said here, because
     the published rules are what stop existing. */
  const takesSavedDraft = becomesDraft && !!saved.pendingDraft
  if (takesSavedDraft && changes.length > 0) rows.push({ label: 'Rules', before: 'Published rules', after: 'Saved draft' })

  return { changes, rows, becomesDraft, takesSavedDraft }
}
