import { addedLabel, type Policy } from './data'

/* -----------------------------------------------------------------------------
   A policy's last activity: the one date the Policies table shows (owner, 3 Nov 2026:
   "showcase the important date, like added or opened or edited, based on the last
   action"). Whichever happened last, with its verb: "Edited 2 hours ago", "Opened just
   now", "Added Nov 3, 2026".

   The store logs what happens in this visit (`BrandStore.activity`). A seed policy has
   no log entry, so it reads its stamps: `lastModified` ("2 hours ago", "Yesterday")
   as an edit, then `addedOn` as the day it was added.
   -------------------------------------------------------------------------- */

export type ActivityKind = 'added' | 'edited' | 'opened'

export interface Activity {
  kind: ActivityKind
  /** Epoch milliseconds. */
  at: number
}

export type ActivityLog = Readonly<Record<string, Activity>>

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const UNIT: Record<string, number> = { minute: MINUTE, min: MINUTE, hour: HOUR, day: DAY, week: 7 * DAY }

/** How long ago a seed's relative stamp means, in ms. Null when it is not one. */
export function stampAgo(stamp: string): number | null {
  const s = stamp.trim().toLowerCase()
  if (s === 'just now') return 0
  if (s === 'yesterday') return DAY
  const m = /^(\d+|an?|one)\s+(minute|min|hour|day|week)s?\s+ago$/.exec(s)
  if (!m) return null
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1
  return n * UNIT[m[2]]
}

/** The latest thing that happened to the policy, or null when nothing says. */
export function lastActivity(p: Pick<Policy, 'id' | 'lastModified' | 'addedOn'>, log: ActivityLog, now: number): Activity | null {
  const logged = log[p.id]
  if (logged) return logged
  const ago = stampAgo(p.lastModified)
  if (ago !== null) return { kind: 'edited', at: now - ago }
  /* The console's own stamp, "Sep 05, 2026, 22:00:00", as the larger seeds write it. */
  const at = Date.parse(p.lastModified)
  if (!Number.isNaN(at)) return { kind: 'edited', at }
  if (p.addedOn) {
    const [y, m, d] = p.addedOn.split('-').map(Number)
    return { kind: 'added', at: new Date(y, m - 1, d).getTime() }
  }
  return null
}

const VERB: Record<ActivityKind, string> = { added: 'Added', edited: 'Edited', opened: 'Opened' }

/** "Edited 2 hours ago"; a week or more ago, the date. "—" when there is nothing to say. */
export function activityLabel(a: Activity | null, now: number): string {
  if (!a) return '—'
  const ago = Math.max(0, now - a.at)
  const verb = VERB[a.kind]
  if (ago < MINUTE) return `${verb} just now`
  if (ago < HOUR) return `${verb} ${Math.floor(ago / MINUTE)} min ago`
  if (ago < DAY) {
    const h = Math.floor(ago / HOUR)
    return `${verb} ${h} ${h === 1 ? 'hour' : 'hours'} ago`
  }
  if (ago < 2 * DAY) return `${verb} yesterday`
  if (ago < 7 * DAY) return `${verb} ${Math.floor(ago / DAY)} days ago`
  const d = new Date(a.at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${verb} ${addedLabel({ addedOn: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` })}`
}
