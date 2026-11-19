import { shows } from './rollout'

/* Rail items with no page behind them are locked outside the Design line (owner, 19 Nov 2026: "lock all the other
   unnecessary tabs, those don't have any work, for devs and testers"). Locked: greyed, a lock in place of the chevron,
   no submenu, a Tip. Which lines get it is the rollout table's `railLock` entry. */
export const LOCK_EMPTY_TABS: boolean = shows('railLock')

export const LOCKED_TIP = 'Not in this build.'
