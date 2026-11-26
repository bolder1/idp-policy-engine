import { shows } from './rollout'

/* The draft's tag, its flag and its words (rollout.ts `draftTag`). Kept out of leave-guard.tsx, which draws the tag, so
   that file exports components only and fast refresh keeps working there. */

/** A saved draft has its own tag beside the status again (rollout `draftTag`). */
export const DRAFT_TAG: boolean = shows('draftTag')
export const HAS_DRAFT = 'Has draft'
