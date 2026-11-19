import { LINE, type Line } from './lines'

/* -----------------------------------------------------------------------------
   ROLLOUT: which line sees which change (owner, 19 Nov 2026: "might not need multiple GitHub and Vercel ... based on
   login we can showcase ... push things in a subtle way").

   One repo, one deploy. The sign-in picks the line (lines.ts); this table decides what each line sees. A change ships
   to main with ['design'] only, so it is live but only the owner sees it. When he approves it, add 'handoff' and/or
   'tester' to its entry and push once. Taking a change back is removing a line, nothing else.

   Entries are named for the change, newest last. A change every line has had for a while can leave the table: drop
   the entry and its `shows()` calls.
   -------------------------------------------------------------------------- */

const ALL: readonly Line[] = ['design', 'handoff', 'tester']

export const ROLLOUT = {
  /** Authentication methods → General settings: Users row hidden, Mobile issuer name added (19 Nov). */
  mobileIssuer: ALL,
  /** Rail items with no page are locked (19 Nov). Design keeps every row open. */
  railLock: ['handoff', 'tester'],
} as const satisfies Record<string, readonly Line[]>

export type Change = keyof typeof ROLLOUT

/** Whether the line open now shows this change. On the sign-in screen (no line) nothing is shown. */
export function shows(change: Change): boolean {
  return LINE !== null && (ROLLOUT[change] as readonly Line[]).includes(LINE)
}
