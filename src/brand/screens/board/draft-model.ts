import { useSyncExternalStore } from 'react'

import { evaluates, type Policy } from '../../data'
import { shows } from '../../rollout'
import { isBuilderUnlocked, useBuilderUnlocked } from './builder-version'

/* -----------------------------------------------------------------------------
   THE DRAFT MODEL SWITCH (owner, 23 Nov 2026: "inside the design and inside the
   policy builder, I need a dropdown"). Design only (rollout.ts `draftModels`).

   Two answers to "what does saving do to a live policy?", on the same builder:

     Today  The builder as it is. Save draft keeps edits beside the live rules;
            Save policy writes them live at once and makes a draft active.
     Fix    The same pieces, said plainly. Status (Active / Inactive) is about
            what people sign in with and is never changed by saving; the edit
            chip is about your copy. A published policy with edits shows a
            Live / Draft switch (Live is read-only), and Save policy asks
            "Update live policy?" first, naming who it reaches. Compare, the
            "Save to live" label and Discard were tried and taken out the same
            day (owner, 23 Nov 2026).

   The parked third answer (publish, review, versions) is in the owner's memory
   note draft-publish-v3-direction-23-nov, built later on the Full builder.

   Where the switch is not shown, the model is Today whatever was stored.
   -------------------------------------------------------------------------- */

/* V3 (owner, 23 Nov 2026, "go fast, functional first, visuals later"): Fix plus publishing as numbered versions —
   Version history, View, Compare, Restore as draft, Roll back, Publish with a note, and an approval step with a
   reviewer (policy-versions.ts, draft-v3.tsx). Built for the Full builder. */
/* View and edit (24 Nov 2026, the stakeholders through the owner): Fix with a mode. A published policy, or a saved
   draft, opens view-only; Edit enters draft mode; status changes only outside it (rollout.ts `viewEdit`). */
/* Simple (25 Nov 2026 evening, owner: "save draft means save draft and save policy means active … make things short and
   simple"): View and edit with two saves and one status rule. Save draft keeps a draft; Save policy makes the policy
   active, or inactive while it has no application; Show live version is in every edit state (rollout.ts `simpleDraft`). */
export type DraftModel = 'today' | 'fix' | 'v3' | 'view' | 'simple'

export const DRAFT_MODELS: boolean = shows('draftModels')

/** The "View and edit" choice exists (rollout.ts `viewEdit`). */
export const VIEW_EDIT: boolean = shows('viewEdit')

/** The "Simple" choice exists (rollout.ts `simpleDraft`). */
export const SIMPLE_DRAFT: boolean = shows('simpleDraft')

/** Simple's main save, by name, everywhere it is named (owner, 25 Nov 2026: "call it save and activate", then the same
 *  evening "call it activate policy or something instead of save and activate"). */
export const SAVE_AND_ACTIVATE = 'Activate policy'

/** Simple's words: the green button, its panel, the button while nothing is live, the ask before a save reaches sign-ins. */
export const LIVE_BUTTON = 'Show live version'
export const LIVE_PANEL = 'Live version'
export const NOTHING_LIVE = 'Nothing is live yet'
/** Show live version waits for a change, as Save draft and Save policy do (owner, 25 Nov 2026). */
export const NO_CHANGE_YET = 'No changes yet'
/** Activate policy's confirm and toast name the press, not a save (rollout.ts `simpleActivateWords`, 26 Nov 2026). */
const ACTIVATE_WORDS: boolean = shows('simpleActivateWords')
export const SAVE_ASK = ACTIVATE_WORDS ? 'Activate this policy?' : 'Save this policy?'
/** Simple, Activate policy with no application: what happens, and the way to active (owner, 25 Nov 2026). */
export const NO_APP_ASK = 'No application chosen'
export const NO_APP_BODY = 'This policy will be saved as inactive. Add an application to make it active.'
export const SIMPLE_DRAFT_TOAST = 'Draft saved. The live version is unchanged.'

/** Simple's toast after Save policy. With no application it says how the policy becomes active. */
export function simpleSaveToast(before: Pick<Policy, 'status'>, after: Pick<Policy, 'name' | 'status' | 'appIds' | 'isSystem'>): string {
  if (after.status === 'inactive' && !after.isSystem && after.appIds.length === 0) return `${after.name} saved. It is inactive until it has an application.`
  if (ACTIVATE_WORDS && after.status === 'active') return `${after.name} is active`
  if (after.status === before.status) return `${after.name} saved`
  if (after.status === 'active') return `${after.name} saved. It is active.`
  if (after.status === 'inactive') return `${after.name} saved. It is inactive.`
  return `${after.name} saved`
}

/** Fix's Live / Draft on the canvas rather than the bar (rollout.ts `fixViewOnCanvas`, draft-fix.tsx `CanvasViewPick`). */
export const FIX_VIEW_ON_CANVAS: boolean = shows('fixViewOnCanvas')

/** Fix's save, by name (rollout.ts `saveAndPublish`): the bar's button and every place that names it. */
export const FIX_SAVE_AND_PUBLISH: boolean = shows('saveAndPublish')
export const SAVE_AND_PUBLISH = 'Save and publish'

/** Fix's bar follows the version on screen (rollout.ts `versionBar`): status belongs to the published version only. */
export const FIX_VERSION_BAR: boolean = shows('versionBar')
/** The canvas chip's name for what people sign in with, active or not. */
export const PUBLISHED = 'Published'
export const PUBLISH_ASK = 'Publish this draft?'

/** The toast after Save and publish, in its own verb. A first publish arrives inactive (owner, 24 Nov 2026). */
export function publishToast(before: Pick<Policy, 'status'>, after: Pick<Policy, 'name' | 'status'>): string {
  if (after.status === before.status) return `${after.name} published`
  if (after.status === 'inactive') return `${after.name} published. It is inactive.`
  if (after.status === 'active') return `${after.name} published. It is active.`
  if (after.status === 'monitor') return `${after.name} published. It is monitoring.`
  return `${after.name} saved as a draft`
}

export const DRAFT_MODEL_OPTIONS: { value: DraftModel; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'fix', label: 'Fix' },
  { value: 'v3', label: 'V3' },
  ...(VIEW_EDIT ? [{ value: 'view' as const, label: 'View and edit' }] : []),
  ...(VIEW_EDIT && SIMPLE_DRAFT ? [{ value: 'simple' as const, label: 'Simple' }] : []),
]

const KEY = 'idp.builder.draft-model'
const listeners = new Set<() => void>()

function read(): DraftModel {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'fix' || v === 'v3' || (v === 'view' && VIEW_EDIT) || (v === 'simple' && VIEW_EDIT && SIMPLE_DRAFT) ? v : 'today'
  } catch {
    return 'today'
  }
}

let current: DraftModel = typeof window === 'undefined' ? 'today' : read()

export function setDraftModel(m: DraftModel) {
  current = m
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* Private window or blocked storage: the switch still works for this load. */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/* Behind the builder's lock too (owner, 23 Nov 2026: "Hide this with the V0, V1 and V2, this draft model as well. When
   I enter the password, I can explore this part"). Locked, the switch is not drawn and the builder is Today whatever
   was stored, as a locked builder is V0 whatever was stored (builder-version.ts); Ctrl+P and the password bring both
   back with the choices kept. */

/** Whether the Draft model switch is drawn: the Design line, and the builder unlocked. */
export function useDraftModelsShown(): boolean {
  return useBuilderUnlocked() && DRAFT_MODELS
}

/** The model in force: Today wherever the switch is not shown. Server render is Today, so tests see the builder as it is. */
export function useDraftModel(): DraftModel {
  const m = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'today' as DraftModel,
  )
  return useDraftModelsShown() ? m : 'today'
}

/** "View and edit" is the model in force (rollout.ts `viewEdit`): the builder, the application page and the Policies
 *  list all read it, so one choice changes the three together. Server render is Today. */
export function useViewEdit(): boolean {
  const m = useDraftModel()
  /* Simple is View and edit with fewer words, so everything that reads the mode reads it for Simple too. */
  return m === 'view' || m === 'simple'
}

/** The same, outside React (a store write, a model function): unlocked, on the Design line, with "View and edit" chosen. */
export function viewEditOn(): boolean {
  return DRAFT_MODELS && VIEW_EDIT && isBuilderUnlocked() && (current === 'view' || (SIMPLE_DRAFT && current === 'simple'))
}

/** "Simple" is the model in force (rollout.ts `simpleDraft`). Server render is Today. */
export function useSimpleDraft(): boolean {
  return useDraftModel() === 'simple'
}

/** The same, outside React: the Policies page's Applications dialog and an application's Remove read it. */
export function simpleDraftOn(): boolean {
  return DRAFT_MODELS && VIEW_EDIT && SIMPLE_DRAFT && isBuilderUnlocked() && current === 'simple'
}

/* --- View and edit's rules, pure ---------------------------------------------------- */

/** What Save and publish says when the draft has no application (owner, 24 Nov 2026: such a policy is a draft only). */
export const NO_APP_REASON = 'Add an application first'

/** "Can't remove the only application": an active policy keeps its last one; make it inactive first. */
export const ONLY_APP_TITLE = "Can't remove the only application"

/** The applications a draft holds: its own list once one is saved, otherwise the policy's. */
export const draftAppsOf = (p: Pick<Policy, 'appIds' | 'pendingDraft'>): string[] => p.pendingDraft?.appIds ?? p.appIds

/** Taking `appId` off `p` would leave an active sign-in policy with no application: refused while it is active. */
export function removeLeavesActiveEmpty(p: Pick<Policy, 'appIds' | 'status' | 'isSystem' | 'type'>, appId: string): boolean {
  if (p.isSystem || p.type === 'Session') return false
  /* Simple has no Make inactive to do first: the policy goes inactive with its last application (owner, 25 Nov 2026). */
  if (simpleDraftOn()) return false
  return p.appIds.length === 1 && p.appIds[0] === appId && (p.status === 'active' || p.status === 'monitor' || p.status === 'always-on')
}

/* --- The Fix model's rules, pure ----------------------------------------------- */

type Stored = Pick<Policy, 'status' | 'provisional' | 'isSystem'>

/** Something people sign in with already: a policy that has been saved and is not a draft. */
export const isPublished = (p: Stored | undefined): boolean => !!p && !p.provisional && p.status !== 'draft'

/* "View and edit": a policy never published opens in draft mode, and a published one (Active, Inactive, Monitoring) in
   its view with Edit policy (owner, 25 Nov 2026: "Draft policy should open in draft mode. Active policy should open in
   view only with edit button"; rollout.ts `draftOpensEditing`). A migrated draft keeps its own review (BoardBuilder
   `movedDraft`), which opens it read only beside its old policies. Exit edit mode still leads to the view. */
const DRAFT_OPENS_EDITING: boolean = shows('draftOpensEditing')

/** Whether the builder opens this policy in draft mode rather than its view. A new policy is in draft mode regardless. */
export const opensInDraftMode = (p: (Stored & Pick<Policy, 'movedFrom'>) | undefined): boolean =>
  DRAFT_OPENS_EDITING && !!p && !p.provisional && !isPublished(p) && !p.movedFrom?.length

/** A save that changes what decides real sign-ins, so it asks first: Active, Always on or Monitoring. */
export const reachesSignIns = (p: Stored | undefined): boolean => !!p && isPublished(p) && evaluates(p)

/** The Live / Draft switch: a published policy whose copy differs from live, saved or not. */
export const offersLiveView = (p: Stored | undefined, differs: boolean): boolean => isPublished(p) && differs

/** The edit chip's words for a saved draft. */
export const FIX_DRAFT_CHIP = 'Draft saved'

/** The sentence under "Update live policy?": who the new rules reach, and a status that changes with them. */
export function liveConfirmBody(appNames: string[], becomesInactive: boolean): string {
  if (becomesInactive) return 'No application is left, so the policy becomes inactive and stops deciding sign-ins.'
  const who =
    appNames.length === 0
      ? 'Every sign-in it covers'
      : appNames.length === 1
        ? `Sign-ins to ${appNames[0]}`
        : `Sign-ins to ${appNames[0]} and ${appNames.length - 1} more`
  return `${who} will use these rules at once.`
}
