/* Rail items with no page behind them are locked outside the Design line (owner, 19 Nov 2026: "lock all the other
   unnecessary tabs, those don't have any work, for devs and testers"). Locked: greyed, a lock in place of the chevron,
   no submenu, a Tip. Design keeps today's rail.

   Reads the stored line itself (the same key lines.ts writes) rather than importing lines.ts, so the handoff and tester
   repos, which carry no sign-in, get the lock too: no stored line means not Design. */
function storedLine(): string | null {
  try {
    return localStorage.getItem('idp.line')
  } catch {
    return null
  }
}

export const LOCK_EMPTY_TABS: boolean = import.meta.env.MODE === 'tester' || storedLine() !== 'design'

export const LOCKED_TIP = 'Not in this build.'
