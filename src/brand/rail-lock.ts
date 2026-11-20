import { shows } from './rollout'

/* Rail items with no page behind them are locked outside the Design line (owner, 19 Nov 2026: "lock all the other
   unnecessary tabs, those don't have any work, for devs and testers"). Locked: greyed, a lock in place of the chevron,
   no submenu, a Tip. Which lines get it is the rollout table's `railLock` entry. */
export const LOCK_EMPTY_TABS: boolean = shows('railLock')

/* Apps is locked too where the rollout table's `lockApps` entry says (Tester, 20 Nov), though it has a page. */
export const LOCK_APPS: boolean = shows('lockApps')

/** Whether a rail item with this label, empty or not, is locked on the line open now. */
export function railLocked(label: string, empty: boolean): boolean {
  return (LOCK_EMPTY_TABS && empty) || (LOCK_APPS && label === 'Apps')
}

export const LOCKED_TIP = 'Not in this build.'
