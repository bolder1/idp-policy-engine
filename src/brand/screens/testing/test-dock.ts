import type { AccessDecision, App, Group, Policy, User, Zone } from '../../data'
import { CANT_TELL, DECISION_WORDS } from '../../decision-words'
import { changeOf, monitorSamples, type MonitorChange, type MonitorSample } from '../monitor-sample'
import type { SimEnv } from '../simulate'
import { resolveSignIn, type TenantResolution } from '../tenant-resolver'
import { decisionSig, personRows, type PersonRow, type SavedRow } from './selectors'
import { ORIGIN_PRESETS, type SignInForm } from './sign-in-form'
import { tokenValue, type SentenceContext, type TokenId } from './sign-in-sentence'

/* -----------------------------------------------------------------------------
   The tests beside Try a sign-in: the tabs of the board's test panel
   (Policy testing V4, §2.4-bis).

   The right-hand column was a form with three pill tabs over it, and inside a
   policy it showed things about the whole tenant — every application for one
   person, every saved sign-in. The owner's question was the right one: "why
   can I see all the apps for one user inside a panel where I only add this
   policy for specific apps?" The lists went to a bottom dock for a day, and
   came back to the right-hand column as ONE panel under the sign-in
   (owner, 28 Sep 2026: "fix this so this is good in the right side panel").
   Every tab is scoped to THIS policy:

     saved      the saved sign-ins on this policy's applications, judged by
                the version on the board (`boardVersion`)
     people     this policy's people × this policy's applications only
     past       a week of modelled sign-ins on its applications, today and
                with the edits (a report, and it says it is a sample)
     break-in   the Break-in test, where the edition has it and the policy is
                one it runs on

   The tenant-wide versions of the first three live on the Sign-in tests page;
   the panel links there and never repeats them. The module keeps its name
   from the dock: what it holds is the tabs' rules, which did not move.

   Pure, so the rules — which tabs, how wide, who is listed, what each cell
   says, what the report adds up to — are pinned without drawing anything.
   Nothing here decides a sign-in: every answer is the resolver's.
   -------------------------------------------------------------------------- */

// --- Tabs -----------------------------------------------------------------------

export type DockTab = 'saved' | 'people' | 'past' | 'break-in'

export const DOCK_TAB_LABEL: Record<DockTab, string> = {
  saved: 'Saved sign-ins',
  people: 'People',
  past: 'Past sign-ins',
  'break-in': 'Break-in test',
}

/* No counts, on the tabs or beside them (owner: numbers once, never on tabs).
   The Break-in test only where the host says it runs: the edition has it and
   the policy is one it runs on (`breakInEligible`). */
export function dockTabs(opts: { breakIn: boolean }): { value: DockTab; label: string }[] {
  const tabs: DockTab[] = opts.breakIn ? ['saved', 'people', 'past', 'break-in'] : ['saved', 'people', 'past']
  return tabs.map((value) => ({ value, label: DOCK_TAB_LABEL[value] }))
}

/** The tab drawn for the tab asked for: the Break-in test falls back to Saved sign-ins where it cannot run. */
export const dockTabShown = (tab: DockTab, breakIn: boolean): DockTab => (tab === 'break-in' && !breakIn ? 'saved' : tab)

/* Where "Open Sign-in tests" goes from each tab: the page's own tab for the
   same question. Past sign-ins is a report, like the page's Runs; the Break-in
   test has no page tab of its own, so it goes to the library. */
export function libraryTabOf(tab: DockTab): 'saved' | 'people' | 'runs' {
  if (tab === 'people') return 'people'
  if (tab === 'past') return 'runs'
  return 'saved'
}

// --- The panel's width and tab, as the viewer left them ------------------------------

/* The panel is the board's right-hand column while a sign-in is tried: 460 px
   to start, dragged by its leading edge between 420 and 640. Under 420 the
   four tabs no longer fit their row — at 400 "Break-in test" and its underline
   ran into the panel's edge (review, 29 Sep 2026) — and the Break-in test's
   four counts stop fitting theirs; over 640 the canvas, which is the trace,
   is what gives. */
export const PANEL_MIN_W = 420
export const PANEL_MAX_W = 640
export const PANEL_DEFAULT_W = 460

/** A width the panel may take: whole pixels, 420 to 640; anything unreadable is the default. */
export function clampPanelWidth(w: number): number {
  if (!Number.isFinite(w)) return PANEL_DEFAULT_W
  return Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, Math.round(w)))
}

export interface PanelPrefs {
  tab: DockTab
  width: number
}

export const PANEL_KEY = 'idp.testPanel'
export const PANEL_DEFAULTS: PanelPrefs = { tab: 'saved', width: PANEL_DEFAULT_W }

type Store = Pick<Storage, 'getItem' | 'setItem'>

/* localStorage can be absent (tests, SSR), blocked (a private window) or
   throw on read; each is the defaults, never an error. */
function storage(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const TABS: readonly DockTab[] = ['saved', 'people', 'past', 'break-in']

/* Per viewer, not per policy: an IDE's side panel stays the width and on the
   tab it was left at whichever file is open. Each field is checked on its
   own, so one bad value costs that value and not the other. */
export function readPanel(from: Store | null = storage()): PanelPrefs {
  try {
    const raw = from?.getItem(PANEL_KEY)
    if (!raw) return { ...PANEL_DEFAULTS }
    const v = JSON.parse(raw) as Partial<Record<keyof PanelPrefs, unknown>> | null
    if (!v || typeof v !== 'object') return { ...PANEL_DEFAULTS }
    return {
      tab: TABS.includes(v.tab as DockTab) ? (v.tab as DockTab) : PANEL_DEFAULTS.tab,
      width: typeof v.width === 'number' ? clampPanelWidth(v.width) : PANEL_DEFAULTS.width,
    }
  } catch {
    return { ...PANEL_DEFAULTS }
  }
}

export function writePanel(prefs: PanelPrefs, to: Store | null = storage()): void {
  try {
    to?.setItem(PANEL_KEY, JSON.stringify({ tab: prefs.tab, width: clampPanelWidth(prefs.width) }))
  } catch {
    /* A full or blocked store: the panel still works, it just forgets. */
  }
}

// --- This policy's applications ------------------------------------------------------

/* The applications the panel's tabs ask about, in the catalogue's order: the Global
   Default protects every one; a draft with none has none — it is asked "as if
   on" one only by the sign-in, never across the tabs' lists. */
export function policyApps<A extends Pick<App, 'id'>>(draft: Pick<Policy, 'appIds' | 'isSystem'>, apps: readonly A[]): A[] {
  if (draft.isSystem) return [...apps]
  return apps.filter((a) => draft.appIds.includes(a.id))
}

/* "A, B or C": the applications as one phrase. More than three is the first
   two and a count — a list the width of the panel says less than that. */
export function appsPhrase(apps: readonly Pick<App, 'name'>[]): string {
  const names = apps.map((a) => a.name)
  if (names.length <= 1) return names[0] ?? ''
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
  return `${names[0]}, ${names[1]} or ${names.length - 2} more`
}

/** The Saved sign-ins tab's empty title. */
export function savedEmptyTitle(draft: Pick<Policy, 'isSystem'>, apps: readonly Pick<App, 'name'>[]): string {
  if (draft.isSystem) return 'No saved sign-ins'
  if (apps.length === 0) return 'No applications on this policy'
  return `No saved sign-ins on ${appsPhrase(apps)}`
}

// --- A saved sign-in, in words ------------------------------------------------------------

/* The sign-in in the sentence's own words (sign-in-sentence.ts), as one grey
   line: who, where to when the policy has more than one application, from
   where, and the device when one is stated. */
export function signInWords(form: SignInForm, ctx: Pick<SentenceContext, 'people' | 'apps' | 'zones'>, withApp: boolean): string {
  const ids: TokenId[] = withApp ? ['person', 'app', 'from', 'device'] : ['person', 'from', 'device']
  return ids
    .map((t) => ({ t, v: tokenValue(t, form, ctx) }))
    .filter(({ t, v }) => !(t === 'device' && v.unset))
    .map(({ v }) => v.text)
    .join(' · ')
}

// --- People ----------------------------------------------------------------------------

/** How many people the People tab lists before a search. */
export const PEOPLE_CAP = 12

export interface PeopleRow {
  person: User
  groupName: string
}

const governs = (a: Policy['audience'], u: Pick<User, 'id' | 'groupId'>) => a.everyone || a.groupIds.includes(u.groupId) || a.userIds.includes(u.id)

/* The people the tab lists: this policy's audience and nobody else, in the
   directory's order — for an audience of everyone, the directory as it is.
   The first twelve until a search; a search reaches the whole audience, by
   name, group or email. Inside a policy the panel shows only what the policy
   is for (V4 §1): somebody outside it is tried from the sentence's Person
   token, which lists them under "Not in this policy", and the Sign-in tests
   page is where the whole directory is asked. */
export function peopleRows(
  draft: Pick<Policy, 'audience' | 'isSystem'>,
  people: readonly User[],
  groups: readonly Pick<Group, 'id' | 'name'>[],
  query: string,
): PeopleRow[] {
  const everyone = draft.isSystem || draft.audience.everyone
  const rows = people
    .filter((person) => everyone || governs(draft.audience, person))
    .map((person) => ({ person, groupName: groups.find((g) => g.id === person.groupId)?.name ?? person.groupId }))
  const q = query.trim().toLowerCase()
  if (!q) return rows.slice(0, PEOPLE_CAP)
  return rows.filter((r) => `${r.person.name} ${r.groupName} ${r.person.email}`.toLowerCase().includes(q))
}

/* One person on each of THIS policy's applications — the fix for "all apps":
   `personRows` asked with the policy's applications and nobody else's. The
   rest of the sign-in is the board's own, so a cell answers what the sign-in
   sentence would for that person there. With the board's version standing in, a
   cell it changes carries what decides today (`PersonRow.today`). */
export function personCells(
  policies: readonly Policy[],
  draftApps: readonly Pick<App, 'id' | 'name'>[],
  person: Pick<User, 'id'>,
  form: SignInForm,
  env: SimEnv,
  zones: readonly Zone[],
  substitute?: Policy,
): PersonRow[] {
  return personRows(policies, draftApps, { ...form, personId: person.id }, env, zones, substitute)
}

// --- Hover: the card a sign-in lands on ---------------------------------------------------

/* The card on the board a sign-in lands on, for the row hovered in a tab:
   the rule that matched, "fallback" for Nothing else matched, and — where it
   cannot be told — the first rule it could not read, the one standing between
   it and an answer (selectors.ts, `ruleOf`). Null when another policy decides
   it: nothing on this board is where it lands. */
export function landingRuleOf(res: TenantResolution, draftId: string): string | 'fallback' | null {
  if (res.status === 'incomplete' || !res.trace || res.decidedBy?.policyId !== draftId) return null
  const trace = res.trace
  const index =
    res.status === 'decided'
      ? trace.hitIndex
      : (trace.steps.find((s) => s.kind !== 'off' && s.kind !== 'unreached' && s.match === 'unknown')?.index ?? null)
  if (index === null) return 'fallback'
  return trace.steps.find((s) => s.index === index)?.ruleId ?? 'fallback'
}

// --- Saved sign-ins: a run, and what it says -----------------------------------------------

/** Each row's answer as one string, to tell a row that moved from one that did not. */
export function runSnapshot(rows: readonly SavedRow[]): Map<string, string> {
  return new Map(rows.map((r) => [r.saved.id, decisionSig(r.res)]))
}

/* The rows Run all flashes: every one the board's edits decide differently
   from today, and every one whose answer moved since the last run. The first
   run has no last one, so it shows what the edits change. */
export function runFlash(prev: ReadonlyMap<string, string> | null, rows: readonly SavedRow[]): Set<string> {
  const out = new Set<string>()
  for (const r of rows) {
    const before = prev?.get(r.saved.id)
    if (r.today || (prev && before !== decisionSig(r.res))) out.add(r.saved.id)
  }
  return out
}

const denies = (r: Pick<TenantResolution, 'status' | 'decision'> | null) => r?.status === 'decided' && r.decision === 'deny'

/* What Run all says it found: what the edits do to this policy's saved
   sign-ins, when it matters. Red for a sign-in they newly refuse, which is the
   one to read first; amber for any other change; nothing when nothing
   moved. Said once — never both. */
export function lastRunSummary(rows: readonly SavedRow[]): { tone: 'negative' | 'notice'; text: string } | null {
  const changed = rows.filter((r) => r.today !== null)
  const blocked = changed.filter((r) => denies(r.res) && !denies(r.today))
  if (blocked.length > 0) return { tone: 'negative', text: `${blocked.length} newly blocked` }
  if (changed.length > 0) return { tone: 'notice', text: `${changed.length} changed` }
  return null
}

// --- Past sign-ins: the report ---------------------------------------------------------------

export type PastFilter = 'change' | 'blocked' | 'same'

export const PAST_TILES: { filter: PastFilter; label: string }[] = [
  { filter: 'change', label: 'Would change' },
  { filter: 'blocked', label: 'Newly blocked' },
  { filter: 'same', label: 'Unchanged' },
]

export interface PastRow {
  id: string
  sample: MonitorSample
  /** "Mon 09:30". */
  when: string
  /** "Office network", "London, United Kingdom", or the address. */
  from: string
  today: TenantResolution
  edits: TenantResolution
  change: MonitorChange
  /** Refused with the edits, and not refused today. */
  newlyBlocked: boolean
  /** How many of the week's sign-ins this modelled one stands for. */
  weight: number
}

export type DistKey = AccessDecision | 'unknown'

export interface DistSegment {
  key: DistKey
  label: string
  count: number
  /** 0…1 of the week. */
  share: number
}

export interface PastReport {
  rows: PastRow[]
  total: number
  /* "Last 7 days · 1,284 sign-ins": the week's total, said once — and only
     where no tile already says it. With nothing to compare it is the one
     number there is; with edits it is dropped when a tile's count is the
     whole week ("Unchanged 1,284" when nothing would change). */
  headline: string
  /** Whether a version stands in to compare with: the edits, or the policy turned on. */
  compared: boolean
  today: DistSegment[]
  /** The same as `today` when nothing is compared. */
  edits: DistSegment[]
  /** The filter tiles; none when nothing is compared, where every row is unchanged. */
  tiles: { filter: PastFilter; label: string; count: number }[]
}

/** "1,284". A fixed locale, so the number reads the same wherever the browser is. */
export const formatCount = (n: number): string => new Intl.NumberFormat('en-US').format(n)

/* A modelled sign-in stands for between 40 and 160 of the week's: FNV-1a over
   its id, so the headline is the same number on every open of the same policy
   and a test can pin it, without every policy's week being twelve times one
   number. */
export function sampleWeight(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return 40 + (h % 121)
}

/* Where a modelled sign-in came from, as the sign-in sentence would say it: the
   origin's own name when it is one of the four, else the place the address
   looks up to, else the address. */
function fromOf(s: MonitorSample): string {
  return ORIGIN_PRESETS.find((o) => o.address === s.address)?.label ?? s.place ?? s.address
}

const distKey = (r: TenantResolution): DistKey => (r.status === 'decided' && r.decision ? r.decision : 'unknown')
const DIST_ORDER: readonly DistKey[] = ['1fa', '2fa', 'deny', 'unknown']
const distLabel = (k: DistKey) => (k === 'unknown' ? CANT_TELL : DECISION_WORDS[k])

function distribution(rows: readonly PastRow[], side: 'today' | 'edits', total: number): DistSegment[] {
  return DIST_ORDER.map((key) => {
    const count = rows.filter((r) => distKey(r[side]) === key).reduce((n, r) => n + r.weight, 0)
    return { key, label: distLabel(key), count, share: total > 0 ? count / total : 0 }
  }).filter((s) => s.count > 0)
}

const CHANGE_RANK: Record<MonitorChange, number> = { 'to-deny': 0, 'to-2fa': 1, 'to-1fa': 2, 'cant-tell': 3, unchanged: 4 }
const momentOf = (r: PastRow) => `${r.sample.facts.when?.date ?? ''} ${r.sample.time}`

/* A week of this policy's sign-ins, today and with the board's version — the
   report the panel's Past sign-ins tab draws. Built on the Monitoring page's
   model (monitor-sample.ts): the same twelve modelled people, origins and
   days, resolved across the whole tenant twice, then each weighted up so the
   totals read like a week (`sampleWeight`). Dummy, but deterministic for a
   given day, and labelled "Sample" wherever it is drawn.

   `appIds` are the applications to model sign-ins on — the panel passes
   `policyApps`, which for the Global Default is every application. With no
   stand-in (a live policy with nothing edited) the two sides are one: every
   row is unchanged, which is the true answer. The rows run newly blocked
   first, then the other changes, then the unchanged, newest first within. */
export function pastReport(
  policy: Pick<Policy, 'id' | 'appIds' | 'audience'>,
  policies: readonly Policy[],
  env: SimEnv,
  substitute: Policy | undefined,
  today: Date,
  appIds: readonly string[] = policy.appIds,
): PastReport {
  const samples = monitorSamples({ ...policy, appIds: [...appIds] }, env, today)
  const rows: PastRow[] = samples
    .map((sample) => {
      const now = resolveSignIn(policies, sample.facts, env)
      const edits = substitute ? resolveSignIn(policies, sample.facts, env, { substitute }) : now
      return {
        id: sample.id,
        sample,
        when: `${sample.day} ${sample.time}`,
        from: fromOf(sample),
        today: now,
        edits,
        change: changeOf(now, edits),
        newlyBlocked: denies(edits) && !denies(now),
        weight: sampleWeight(sample.id),
      }
    })
    .sort((a, b) => CHANGE_RANK[a.change] - CHANGE_RANK[b.change] || momentOf(b).localeCompare(momentOf(a)))
  const total = rows.reduce((n, r) => n + r.weight, 0)
  const count = (f: PastFilter) => pastRowsOf(rows, f).reduce((n, r) => n + r.weight, 0)
  const compared = substitute !== undefined
  const tiles = compared ? PAST_TILES.map((t) => ({ ...t, count: count(t.filter) })) : []
  const said = tiles.some((t) => t.count === total)
  return {
    rows,
    total,
    headline: said ? 'Last 7 days' : `Last 7 days · ${formatCount(total)} sign-ins`,
    compared,
    today: distribution(rows, 'today', total),
    edits: distribution(rows, 'edits', total),
    tiles,
  }
}

/* The tile a report opens on: the first with anything in it, so the list is
   never empty on arrival — Would change when something would, else
   Unchanged. Nothing compared, nothing to filter: the week as it is. */
export function pastDefaultFilter(report: Pick<PastReport, 'tiles'>): PastFilter | null {
  return report.tiles.find((t) => t.count > 0)?.filter ?? report.tiles[0]?.filter ?? null
}

/** The rows a tile keeps: Would change is every move (Newly blocked among them). */
export function pastRowsOf(rows: readonly PastRow[], filter: PastFilter): PastRow[] {
  if (filter === 'blocked') return rows.filter((r) => r.newlyBlocked)
  if (filter === 'change') return rows.filter((r) => r.change !== 'unchanged')
  return rows.filter((r) => r.change === 'unchanged')
}

/* The report's two sides. Today is what decided those sign-ins; the other is
   the board's version — the edits, or for a policy that is off (and a draft)
   its rules as though turned on, which is what "Stored version" and "Draft"
   mean in the panel's verdict. */
export function pastColumns(version: { label: string } | null): { left: string; right: string } {
  const on = version && version.label !== 'Your edits'
  return { left: 'Today', right: on ? 'If turned on' : 'With your edits' }
}

/** A past tile's empty list. */
export const PAST_EMPTY: Record<PastFilter, string> = {
  change: 'No sign-ins would change',
  blocked: 'No sign-ins newly blocked',
  same: 'Every sign-in would change',
}
