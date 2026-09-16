import { normaliseHook, type Hook, type HookField, type HookIssue } from '../hooks'
import type { Policy } from '../data'
import { deleteImpact } from './usage'

/* -----------------------------------------------------------------------------
   The hook form's decisions, kept out of the component so they can be tested.

   - Whether the draft differs from what was opened (compared as it would be
     stored, so a trailing space or an emptied optional field is not a change).
   - What an edit does to live policies that call the hook.
   - Which invalid field gets focus when Save is pressed.
   -------------------------------------------------------------------------- */

/** Form order. The first invalid field in this order gets focus on Save. */
export const HOOK_FIELD_ORDER: readonly HookField[] = ['name', 'url', 'responsePath', 'timeoutMs', 'maxAgeHours']

export function hookDirty(seed: Hook, draft: Hook): boolean {
  return JSON.stringify(normaliseHook(seed)) !== JSON.stringify(normaliseHook(draft))
}

/** The first field with an error, in form order, or null. */
export function firstInvalidField(issues: readonly HookIssue[]): HookField | null {
  const bad = new Set(issues.filter((i) => i.level === 'error').map((i) => i.field))
  return HOOK_FIELD_ORDER.find((f) => bad.has(f)) ?? null
}

/* The fields whose change alters what a live sign-in gets from this hook. A
   name or description change does not. */
const BEHAVIOUR: readonly (keyof Hook)[] = ['mode', 'url', 'method', 'timeoutMs', 'responsePath', 'onFailure', 'authHeader']

export interface HookEditImpact {
  /** Blocks the save: a hook live rules call can't stop being synchronous. */
  modeError: string | null
  /** Names of live policies whose sign-ins change when this edit is saved. Empty when nothing live changes. */
  liveChanged: string[]
}

/** What saving `draft` over `saved` does to the policies that call it. `saved` is undefined for a new hook. */
export function hookEditImpact(saved: Hook | undefined, draft: Hook, policies: Policy[]): HookEditImpact {
  if (!saved) return { modeError: null, liveChanged: [] }
  const live = deleteImpact('webhook', saved.id, policies).live.map((u) => u.policy.name)
  if (live.length === 0) return { modeError: null, liveChanged: [] }

  if (saved.mode === 'sync' && draft.mode === 'attribute-sync') {
    return { modeError: 'Live policies call this hook. Remove it from their rules first.', liveChanged: [] }
  }

  const a = normaliseHook(saved)
  const b = normaliseHook(draft)
  const changed = BEHAVIOUR.some((k) => a[k] !== b[k])
  return { modeError: null, liveChanged: changed ? live : [] }
}
