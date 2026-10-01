import type { AccessDecision } from '../../data'
import type { SavedSignIn } from '../../saved-sign-ins'
import type { SavedRow } from '../testing/selectors'

/* -----------------------------------------------------------------------------
   The Runs tab: every time the saved sign-ins were run, and what moved
   (V4 §3.1, the report). Two kinds of run, drawn the same way:

     live     "All saved sign-ins", now — every saved sign-in judged as the
              tenant stands, against what it expects. Computed from the
              store on every draw (`liveRun`), so an edit anywhere in the
              tenant shows here at once.
     sample   the week before it, from runs-fixture.ts: the saves, zone edits
              and nightly checks that ran the library, each with what every
              sign-in it touched got before and after. Modelled, and the page
              says so with a "Sample" badge.

   A run's answer per sign-in is a decision or Can't tell ('unknown'). Three
   buckets, which are the tiles and the filter at once:

     changed  before and after differ (for the live run: now is not what was
              expected, Can't tell included — never a pass)
     blocked  of those, refused after and not refused before — the one an
              admin opens the run for
     same     before and after agree

   Newly blocked is a part of Changed, not a fourth kind, so the tiles say
   "Changed 3 · Newly blocked 1 · Unchanged 12" of sixteen and the numbers
   never have to add up across the row.

   Pure. "Now" is always a parameter — the component defaults it — so a test
   pins "2 h ago" and a fixture never drifts with the clock.
   -------------------------------------------------------------------------- */

export type RunAnswer = AccessDecision | 'unknown'

export interface RunItem {
  savedId: string
  before: RunAnswer
  after: RunAnswer
}

/* What set a run off. A save, a turn-on or an edit names its object by id, so
   the title follows a rename and a test can prove the object is real; the
   nightly check names nothing. */
export type RunTrigger =
  | { verb: 'Saving' | 'Turning on' | 'Editing'; kind: 'policy' | 'zone' | 'profile'; id: string }
  | { verb: 'Nightly check' }

/** A run in the fixture: when is hours before the page's "now". */
export interface RunFixture {
  id: string
  trigger: RunTrigger
  who: string
  hoursAgo: number
  items: RunItem[]
}

export interface Run {
  id: string
  /** The live run: judged now, against Expected. False for the fixture's. */
  live: boolean
  title: string
  who: string
  /** ISO 8601. */
  at: string
  items: RunItem[]
}

export const LIVE_RUN_ID = 'live'
export const LIVE_RUN_TITLE = 'All saved sign-ins'

// --- Titles ---------------------------------------------------------------------

/** How a trigger's object is named: the store's current name, or undefined when it has gone. */
export interface RunNames {
  policy: (id: string) => string | undefined
  zone: (id: string) => string | undefined
  profile: (id: string) => string | undefined
}

/* "Saving HRMS access from corporate offices", "Editing zone Corporate
   offices", "Editing device profile Corporate devices", "Nightly check". An
   object deleted since is said by its kind — "Editing a zone that was
   deleted" — rather than by an id nobody knows. */
export function triggerTitle(t: RunTrigger, names: RunNames): string {
  if (t.verb === 'Nightly check') return 'Nightly check'
  const name = names[t.kind](t.id)
  const noun = t.kind === 'profile' ? 'device profile' : t.kind
  if (!name) return `${t.verb} a ${noun} that was deleted`
  return t.kind === 'policy' ? `${t.verb} ${name}` : `${t.verb} ${noun} ${name}`
}

// --- Building the runs -------------------------------------------------------------

const answerOf = (r: Pick<SavedRow, 'res'>): RunAnswer => (r.res.status === 'decided' && r.res.decision ? r.res.decision : 'unknown')

/* The live run: every saved sign-in, Expected as before and the tenant's
   answer as after, in the table's order (failing first). Its time is now. */
export function liveRun(rows: readonly Pick<SavedRow, 'saved' | 'res'>[], now: Date): Run {
  return {
    id: LIVE_RUN_ID,
    live: true,
    title: LIVE_RUN_TITLE,
    who: 'As the tenant stands',
    at: now.toISOString(),
    items: rows.map((r) => ({ savedId: r.saved.id, before: r.saved.expected, after: answerOf(r) })),
  }
}

/* The fixture's runs, placed before "now" and newest first. An item whose
   saved sign-in has since been deleted is dropped — a run can only show a
   sign-in the library still has — and a run left with none is dropped too. */
export function fixtureRuns(fixture: readonly RunFixture[], now: Date, names: RunNames, savedIds: ReadonlySet<string>): Run[] {
  return fixture
    .map((f) => ({
      id: f.id,
      live: false,
      title: triggerTitle(f.trigger, names),
      who: f.who,
      at: new Date(now.getTime() - f.hoursAgo * HOUR).toISOString(),
      items: f.items.filter((i) => savedIds.has(i.savedId)),
    }))
    .filter((r) => r.items.length > 0)
    .sort((a, b) => b.at.localeCompare(a.at))
}

/** The list, newest first: the live run on top, then the fixture's. */
export function allRuns(live: Run, older: readonly Run[]): Run[] {
  return [live, ...older.filter((r) => r.id !== live.id)]
}

// --- Buckets: the tiles and the filter -----------------------------------------------

export type RunFilter = 'changed' | 'blocked' | 'same'

export const RUN_FILTERS: readonly RunFilter[] = ['changed', 'blocked', 'same']

/* The live run compares with what each sign-in expects, not with a before,
   so its tiles say so. */
const TILE_LABEL: Record<'live' | 'sample', Record<RunFilter, string>> = {
  live: { changed: 'Not as expected', blocked: 'Newly blocked', same: 'As expected' },
  sample: { changed: 'Changed', blocked: 'Newly blocked', same: 'Unchanged' },
}

/** The two answers' column words: Expected → Now on the live run, Before → After on the others. */
export function runColumns(run: Pick<Run, 'live'>): { before: string; after: string } {
  return run.live ? { before: 'Expected', after: 'Now' } : { before: 'Before', after: 'After' }
}

export const changedItem = (i: Pick<RunItem, 'before' | 'after'>): boolean => i.before !== i.after
export const blockedItem = (i: Pick<RunItem, 'before' | 'after'>): boolean => i.after === 'deny' && i.before !== 'deny'

export function runItemsOf(run: Pick<Run, 'items'>, filter: RunFilter): RunItem[] {
  if (filter === 'changed') return run.items.filter(changedItem)
  if (filter === 'blocked') return run.items.filter(blockedItem)
  return run.items.filter((i) => !changedItem(i))
}

export interface RunTile {
  filter: RunFilter
  label: string
  count: number
}

/** The three tiles: each number said once, here and nowhere else in the view. */
export function runTiles(run: Pick<Run, 'live' | 'items'>): RunTile[] {
  const labels = TILE_LABEL[run.live ? 'live' : 'sample']
  return RUN_FILTERS.map((filter) => ({ filter, label: labels[filter], count: runItemsOf(run, filter).length }))
}

/* The tile a run opens on: Changed, unless nothing changed, when Unchanged —
   an empty list under a pressed tile is a click spent on nothing. */
export function defaultFilter(run: Pick<Run, 'items'>): RunFilter {
  return run.items.some(changedItem) ? 'changed' : 'same'
}

/** What a filter says when it leaves nothing. */
export const RUN_EMPTY: Record<RunFilter, string> = {
  changed: 'Nothing changed',
  blocked: 'Nobody newly blocked',
  same: 'Everything changed',
}

/* The list item's tiny bar: the share that changed and the share that did
   not, 0…1. No number is printed from it — the detail's tiles have those. */
export function runShares(run: Pick<Run, 'items'>): { changed: number; same: number } {
  const n = run.items.length
  if (n === 0) return { changed: 0, same: 0 }
  const changed = run.items.filter(changedItem).length / n
  return { changed, same: 1 - changed }
}

// --- Time -----------------------------------------------------------------------------

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/* "Just now", "12 min ago", "2 h ago", "Yesterday", "3 days ago". Relative to
   the "now" given, so the same run reads the same in a test on any day. A
   time after now (a clock skew) is "Just now", never "in 3 min". */
export function relativeTime(at: string, now: Date): string {
  const ms = now.getTime() - new Date(at).getTime()
  if (!(ms >= MINUTE)) return 'Just now'
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`
  if (ms < 2 * DAY) return 'Yesterday'
  return `${Math.floor(ms / DAY)} days ago`
}

/* "Jaspreet Toor · 2 h ago", or for the live run "As the tenant stands · Now":
   who and when, the line under every run's title. */
export function runMeta(run: Pick<Run, 'live' | 'who' | 'at'>, now: Date): string {
  return `${run.who} · ${run.live ? 'Now' : relativeTime(run.at, now)}`
}

/* A run item joined to its saved sign-in, for drawing. Items whose sign-in is
   gone never reach here (`fixtureRuns` drops them; the live run is built from
   the library). */
export function itemsWithSaved(items: readonly RunItem[], saved: readonly SavedSignIn[]): { item: RunItem; saved: SavedSignIn }[] {
  const byId = new Map(saved.map((s) => [s.id, s]))
  return items.flatMap((item) => {
    const s = byId.get(item.savedId)
    return s ? [{ item, saved: s }] : []
  })
}
