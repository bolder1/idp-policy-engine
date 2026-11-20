import type { Line } from './lines'

/* Who the account menu names on each line (owner, 20 Nov 2026), beside the line's badge (role-avatar.tsx). The
   sign-in's email stands under the name; `username` is the stand-in where there is none (the tester deploy). */

export interface RoleAccount {
  name: string
  /** Under the name when the load has no sign-in email. */
  username: string
}

export const ROLE_ACCOUNT: Record<Line, RoleAccount> = {
  design: { name: 'Designer', username: 'Design view' },
  handoff: { name: 'Developer', username: 'Dev handoff view' },
  tester: { name: 'Tester', username: 'Tester view' },
}
