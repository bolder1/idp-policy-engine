import { useEffect, useRef } from 'react'

import type { App, Group, Policy, User } from '../../data'
import { CANT_TELL, DECISION_WORDS } from '../../decision-words'
import type { SavedSignIn } from '../../saved-sign-ins'
import { TENANT_TZ } from '../sign-in-facts'
import type { TenantResolution } from '../tenant-resolver'
import { DEVICE_ROWS, rowsRead, type DeviceRowId, type RowId, type RowsLibrary, type RowsRead } from '../testing/rows-read'
import { answerSaid, decisionSig, type LevelFilter, type PersonRow, type SavedRow } from '../testing/selectors'
import { sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../testing/sign-in-sentence'
import { originPatch, type FormField, type SignInForm } from '../testing/sign-in-form'
import type { RunFilter } from './runs'

/* -----------------------------------------------------------------------------
   The Sign-in tests page's library tabs, as words and rows (V4 §3.1): Saved
   sign-ins — the whole tenant's promises, judged as the tenant stands — and
   People, the directory across every application.

   A policy's board shows only its own slice of each (the Tests dock,
   test-dock.ts). This page is where the tenant-wide versions live, so here
   the Saved sign-ins table lists every saved sign-in whatever it is on, and
   People has a column for every application.

   Pure, so what each row says, what the filters leave and which rows a run
   flashes are pinned without drawing anything. Nothing here decides a
   sign-in: every answer is the resolver's, through `savedRows` and
   `personRows` (selectors.ts), and every word is decision-words.ts's. The
   one exception is at the end: what the tabs keep between visits, a small
   memory outside React, and the hook that puts a pager back where it was.
   -------------------------------------------------------------------------- */

/* A row's height in each table. Fixed, because the paged-list hook divides
   the free height by it to know how many fit (paged-list.ts): a Saved
   sign-in is two lines (the name and the sentence under it), a person is a
   face beside two lines. The stylesheet sets the same numbers. */
export const SAVED_ROW_H = 60
export const PEOPLE_ROW_H = 56

// --- The sign-in, as one line -------------------------------------------------------

/* "Kavya Menon · HRMS · Office network · Windows laptop": who, where to,
   where from, and on what — the sign-in bar's own words (sign-in-sentence.ts)
   at list size. The device only when one is stated; a sign-in from nowhere in
   particular says "Anywhere", which is what the evaluator reads. */
const LINE_TOKENS: readonly TokenId[] = ['person', 'app', 'from', 'device']

export function sentenceLine(form: SignInForm, ctx: Pick<SentenceContext, 'people' | 'apps' | 'zones'>): string {
  return LINE_TOKENS.flatMap((t) => {
    const v = tokenValue(t, form, ctx)
    return t === 'device' && v.unset ? [] : [v.text]
  }).join(' · ')
}

// --- Saved sign-ins -----------------------------------------------------------------------

/** A saved sign-in as the table prints it: the judged row, and its sentence. */
export interface LibraryRow {
  row: SavedRow
  /** "Kavya Menon · HRMS · Office network · Windows laptop". */
  line: string
}

export type AppFilter = 'all' | string

/* The Application filter: All, then every application a saved sign-in is on,
   in the catalogue's order. An application nothing is saved on is not a
   choice — picking it could only ever empty the table. */
export function appFilterOptions(saved: readonly Pick<SavedSignIn, 'facts'>[], apps: readonly Pick<App, 'id' | 'name'>[]): { value: AppFilter; label: string }[] {
  const on = new Set(saved.map((s) => s.facts.appId))
  return [{ value: 'all', label: 'All' }, ...apps.filter((a) => on.has(a.id)).map((a) => ({ value: a.id, label: a.name }))]
}

export interface LibraryFilter {
  query: string
  appId: AppFilter
  level: LevelFilter
}

/* The rows a search and the two filters leave, in the order they came
   (`savedRows` already sorts: failing, then Can't tell, then passing; within
   each the strongest level first; then by name). The search reads the name
   and the sentence, so "Kavya", "HRMS" and "Windows" each find what they
   say. */
export function filterLibrary(rows: readonly LibraryRow[], f: LibraryFilter): LibraryRow[] {
  const q = f.query.trim().toLowerCase()
  return rows.filter(
    (r) =>
      (f.appId === 'all' || r.row.saved.facts.appId === f.appId) &&
      (f.level === 'all' || r.row.saved.level === f.level) &&
      (!q || `${r.row.saved.name} ${r.line}`.toLowerCase().includes(q)),
  )
}

/** Any filter narrowing the table besides the search: NoMatches offers to clear it. */
export const filtered = (f: Pick<LibraryFilter, 'appId' | 'level'>): boolean => f.appId !== 'all' || f.level !== 'all'

/** Each row's answer as one string, taken when a run is made. */
export function librarySnapshot(rows: readonly Pick<SavedRow, 'saved' | 'res'>[]): Map<string, string> {
  return new Map(rows.map((r) => [r.saved.id, decisionSig(r.res)]))
}

/* The rows Run all flashes: every one whose answer moved since the last run —
   or, on the first run, since the page opened (the host takes that snapshot).
   A row saved since has no last answer and flashes too: it is new to this
   list. The rows on this page are judged as the tenant stands, so there is
   no "with your edits" to flash for, as the board's dock has. */
export function libraryFlash(prev: ReadonlyMap<string, string> | null, rows: readonly Pick<SavedRow, 'saved' | 'res'>[]): Set<string> {
  const out = new Set<string>()
  if (!prev) return out
  for (const r of rows) if (prev.get(r.saved.id) !== decisionSig(r.res)) out.add(r.saved.id)
  return out
}

/* A Run all, against the memory: which rows moved since the last run — or,
   before the first, since the Saved tab first drew in this session — and the
   snapshot this run leaves for the next one. The last run is the memory's
   (below), not the tab's, so leaving the page to edit a policy and coming back
   to Run all flashes exactly the rows the edit moved. */
export function takeRun(memory: Pick<LibraryMemory, 'lastRun'>, rows: readonly Pick<SavedRow, 'saved' | 'res'>[]): Set<string> {
  const moved = libraryFlash(memory.lastRun, rows)
  memory.lastRun = librarySnapshot(rows)
  return moved
}

/* The baseline before any Run all: the answers when the library first drew
   in this session — the Saved tab or the Runs tab, whichever came first.
   Taken once; a later draw leaves it be. */
export function seedLastRun(memory: Pick<LibraryMemory, 'lastRun'>, rows: readonly Pick<SavedRow, 'saved' | 'res'>[]): void {
  if (!memory.lastRun) memory.lastRun = librarySnapshot(rows)
}

/* What the status region says after Run all: how many ran, how many fail, and
   what moved. Words for a screen reader, never drawn — the table already
   shows each row's result once. */
export function runAllSaid(rows: readonly Pick<SavedRow, 'result'>[], moved: number): string {
  const n = rows.length
  const failing = rows.filter((r) => r.result === 'fail').length
  const ran = `Ran ${n} saved sign-in${n === 1 ? '' : 's'}.`
  const fails = failing === 0 ? ' All as expected or can’t be told.' : ` ${failing} not as expected.`
  const move = moved === 0 ? ' Nothing moved since the last run.' : ` ${moved} moved since the last run.`
  return `${ran}${fails}${move}`
}

export const RESULT_WORD: Record<SavedRow['result'], string> = { pass: 'Pass', fail: 'Fail', unknown: CANT_TELL }

/* The policy a row's answer came from, for the Decided by link: its id and
   name. Null while nothing decides (no person or application, or no Global
   Default to fall back to). */
export function decidedByOf(res: Pick<TenantResolution, 'decidedBy'>): { policyId: string; name: string } | null {
  const d = res.decidedBy
  return d ? { policyId: d.policyId, name: d.policyName } : null
}

/* A row read out in one go, for the name's button: "Kavya Menon in the
   office: expected Allow with 2FA, now Allow on 1 factor, Fail". */
export function savedRowSaid(r: Pick<SavedRow, 'saved' | 'res' | 'result'>): string {
  return `${r.saved.name}: expected ${DECISION_WORDS[r.saved.expected]}, now ${answerSaid(r.res)}, ${RESULT_WORD[r.result]}`
}

// --- People -----------------------------------------------------------------------------------

export interface DirectoryRow {
  person: User
  groupName: string
}

export type GroupFilter = 'all' | string

/* The Group filter: All, then every group somebody in the directory is in,
   in the directory's group order. */
export function groupFilterOptions(groups: readonly Pick<Group, 'id' | 'name'>[], people: readonly Pick<User, 'groupId'>[]): { value: GroupFilter; label: string }[] {
  const used = new Set(people.map((p) => p.groupId))
  return [{ value: 'all', label: 'All' }, ...groups.filter((g) => used.has(g.id)).map((g) => ({ value: g.id, label: g.name }))]
}

/* The directory as the People table lists it: everybody, in the directory's
   order, narrowed by the group and a search over name, group and email. The
   page is the tenant's, so nobody is left out for not being in some policy —
   the pager, not a cap, keeps the table to the window. */
export function directoryRows(people: readonly User[], groups: readonly Pick<Group, 'id' | 'name'>[], query: string, groupId: GroupFilter): DirectoryRow[] {
  const q = query.trim().toLowerCase()
  return people
    .map((person) => ({ person, groupName: groups.find((g) => g.id === person.groupId)?.name ?? person.groupId }))
    .filter((r) => (groupId === 'all' || r.person.groupId === groupId) && (!q || `${r.person.name} ${r.groupName} ${r.person.email}`.toLowerCase().includes(q)))
}

type Cell = Pick<PersonRow, 'appId' | 'res'>

/* The application a person's row opens Try on: the first one, in catalogue
   order, that a policy of the tenant's own answers for them — decided, or
   waiting on a fact Try can state — since that is where their sign-in has
   something to show; else the first one anything decides (the Global
   Default); else none, and Try opens with the person and no application. */
export function firstDecidedApp(cells: readonly Cell[]): string | null {
  const own = cells.find((c) => c.res.status !== 'incomplete' && c.res.decidedBy && !c.res.decidedBy.isGlobalDefault)
  return (own ?? cells.find((c) => c.res.status === 'decided'))?.appId ?? null
}

/* A cell's tooltip: the policy and the rule behind the badge. "No policy
   decides" where nothing can. */
export function cellTip(c: Pick<PersonRow, 'policyName' | 'ruleName'>): string {
  return [c.policyName, c.ruleName].filter(Boolean).join(' · ')
}

/* A person's row read out: "Kavya Menon, Human Resources. HRMS Allow with
   2FA, Slack Allow on 1 factor…". The button's name, so the row is heard as
   it is seen. */
export function personSaid(r: DirectoryRow, cells: readonly Pick<PersonRow, 'appName' | 'res'>[]): string {
  const said = cells.map((c) => `${c.appName} ${answerSaid(c.res)}`).join(', ')
  return `${r.person.name}, ${r.groupName}${said ? `. ${said}` : ''}`
}

// --- People: the sign-in every cell assumes ---------------------------------------------

/* The rest of the sign-in, the People tab's own (V4 §7 F2): where from, on
   what, when and at what risk — everything but who and where to, which are
   the row and the column. It is NOT Try's form. A grid judged on Try's
   sign-in stated no device, so every application that reads one said Can't
   tell down its whole column; this one states a registered corporate laptop,
   so the grid answers, and "Can't tell" is left for what truly cannot be. */
export function defaultPeopleContext(today: string): SignInForm {
  return {
    personId: null,
    appId: null,
    ...originPatch('office'),
    place: { kind: 'from-address' },
    date: today,
    time: '09:30',
    timeZone: TENANT_TZ,
    device: { kind: 'preset', id: 'win11-registered' },
    risk: '12',
    assumeOn: null,
  }
}

/* The tokens the People sentence may show: never who or where to. Which of
   these do show is the next function's. */
export const PEOPLE_TOKENS: readonly TokenId[] = ['from', 'device', 'when', 'risk']

/** The words before the first token: "Everyone signs in from [Office network ▾] …". */
export const PEOPLE_LEAD = 'Everyone signs in'

/* What the rules of SOME application read — every column is an application, so
   a fact any one of them reads can change a cell. The union of `rowsRead` over
   the catalogue. */
export function peopleRowsRead(policies: readonly Policy[], apps: readonly Pick<App, 'id'>[], lib: RowsLibrary): RowsRead {
  const rows = new Set<RowId>()
  const device = new Set<DeviceRowId>()
  for (const a of apps) {
    const r = rowsRead(policies, null, a.id, lib)
    r.rows.forEach((x) => rows.add(x))
    r.device.forEach((x) => device.add(x))
  }
  return { rows, device: new Set(DEVICE_ROWS.filter((d) => device.has(d))) }
}

/** The People sentence's tokens, in sentence order: where from always, the rest only where some application reads them. */
export const peopleTokens = (read: RowsRead): TokenId[] => sentenceTokens(read).filter((t) => PEOPLE_TOKENS.includes(t))

/* A patch to the context from its sentence. Who and where to are never the
   context's, whatever a panel sends. */
export function patchContext(ctx: SignInForm, p: Partial<SignInForm>, field: FormField): SignInForm {
  if (field === 'person' || field === 'app') return ctx
  return { ...ctx, ...p, personId: null, appId: null }
}

// --- What the tabs keep between visits -------------------------------------------------------

/* Each tab body is drawn only while its tab is open, so a Try from a row —
   which switches to the Try tab — used to throw away the search, the filters,
   the page and the last Run all (V4 review P5, P8). They live here instead: a
   small module-level memory, one per tenant, that lasts until a reload. Not on
   the store, whose every change re-renders the console, and not in the page,
   which is another view's; the tabs read it when they draw and write it back
   as it changes.

   A page is kept by the row at its top, not by its number: the page size is
   measured to the window (paged-list.ts), and the row stays in view however
   many fit when the tab comes back. */

export interface SavedTabMemory {
  query: string
  appId: AppFilter
  level: LevelFilter
  /** The id of the row at the top of the page, or null for the first page. */
  first: string | null
}

export interface PeopleTabMemory {
  query: string
  group: GroupFilter
  first: string | null
  /** The sentence every cell assumes; null until the tab first draws, which fills it with today's default. */
  context: SignInForm | null
}

export interface RunsTabMemory {
  chosenId: string | null
  /** The tile pressed, and the run it was pressed on: another run opens on its own default. */
  filterBy: { runId: string; filter: RunFilter } | null
}

export interface LibraryMemory {
  tenant: string
  saved: SavedTabMemory
  people: PeopleTabMemory
  runs: RunsTabMemory
  /** Each saved sign-in's answer at the last Run all — or when the Saved tab first drew — or null before either. */
  lastRun: ReadonlyMap<string, string> | null
}

const fresh = (tenant: string): LibraryMemory => ({
  tenant,
  saved: { query: '', appId: 'all', level: 'all', first: null },
  people: { query: '', group: 'all', first: null, context: null },
  runs: { chosenId: null, filterBy: null },
  lastRun: null,
})

let memory: LibraryMemory | null = null

/* This tenant's memory: another tenant starts again, as the testing session
   does (session.tsx). The object is live — the tabs write into it. */
export function libraryMemory(tenant: string): LibraryMemory {
  if (!memory || memory.tenant !== tenant) memory = fresh(tenant)
  return memory
}

/** For tests: forget everything, as a reload would. */
export function forgetLibraryMemory(): void {
  memory = null
}

/** The People tab's sentence for this tenant, for Try to carry into a person's sign-in; null until the tab has drawn. */
export const peopleContextOf = (tenant: string): SignInForm | null => (memory && memory.tenant === tenant ? memory.people.context : null)

interface PagedView<T> {
  page: number
  size: number
  pageRows: readonly T[]
  prev: () => void
  next: () => void
}

/* Keeps a paged list on the page that shows `keep.first`, and writes the top
   row back as the list moves. On the way back to a tab the pager starts at
   page 1 with a guessed size; this steps it to the kept row's page, one page a
   render, and lets go a frame after it is there, so a page size still settling
   to the window re-aims it first. A kept row since deleted or filtered out
   lets go at once. */
export function useKeptPage<T>(paged: PagedView<T>, rows: readonly T[], idOf: (r: T) => string, keep: { first: string | null }): void {
  const pending = useRef(keep.first)
  const { page, size, pageRows, prev, next } = paged
  useEffect(() => {
    const want = pending.current
    if (want === null) {
      keep.first = page > 1 && pageRows[0] ? idOf(pageRows[0]) : null
      return
    }
    const at = rows.findIndex((r) => idOf(r) === want)
    if (at < 0) {
      pending.current = null
      return
    }
    const target = Math.floor(at / Math.max(1, size)) + 1
    if (target > page) next()
    else if (target < page) prev()
    else {
      const frame = window.requestAnimationFrame(() => {
        pending.current = null
      })
      return () => window.cancelAnimationFrame(frame)
    }
  })
}
