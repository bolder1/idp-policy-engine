/* -----------------------------------------------------------------------------
   What a Review changes row says, beyond its words.

   Four pages build review rows — a zone, a device profile, a risk profile and a
   policy's details — as `{ label, before, after }`, and the dialog drew them as
   one flat table under "Change | Saved | After saving". Nobody could read it
   (owner, 17 Sep 2026: "can't understand anything — what's saved, what's after
   saving?"). The redesign groups rows into the page's own sections and marks
   each one added, removed or changed, which the dialog cannot guess from the
   words alone. So a row may now say:

     group   the section it belongs to, in the page's words ("IP networks")
     kind    added / removed / changed; inferred from empty values if absent
     item    its name inside that section, when the label repeats the section
             ("Signals: added TPM ID" is "TPM ID" under Signals)
     effect  a consequence of the edits rather than an edit (risk scores, a
             policy going back to draft); reviewed last, on its own, under
             its own group when the consequences share one
     count   how many changes the row stands for, when it lists several
             ("10.0.0.2, 10.0.0.3" is two added networks); 1 if absent
     check   a consequence that is a check's finding rather than a change: a
             saved sign-in that now fails, can't be told, or passes after the
             edit (the library guard, spec D.6). Filed under its own Fails,
             Can't tell or Passes chip inside the consequences, fails first

   All optional, and `label` still reads on its own, so a row without them is
   still a valid row. No React here: the producers are plain modules.
   -------------------------------------------------------------------------- */

export type ReviewKind = 'added' | 'removed' | 'changed'

/** What a check found: the guard pages' three chips, in the order they are read. */
export type CheckFinding = 'fail' | 'neutral' | 'pass'
export const CHECK_ORDER: readonly CheckFinding[] = ['fail', 'neutral', 'pass']

export interface ReviewLine {
  /** The whole change in words, on its own: "Signals: added TPM ID". */
  label: string
  before: string
  after: string
  group?: string
  kind?: ReviewKind
  item?: string
  effect?: boolean
  count?: number
  check?: CheckFinding
}

/* Nothing there: an added row's before, a removed row's after. */
const isEmptyReviewValue = (v: unknown): boolean => v === '' || v === null || v === undefined || v === false

export function reviewKind(r: { kind?: ReviewKind; before: unknown; after: unknown }): ReviewKind {
  if (r.kind) return r.kind
  if (isEmptyReviewValue(r.before)) return 'added'
  if (isEmptyReviewValue(r.after)) return 'removed'
  return 'changed'
}

export interface ReviewGroup<R> {
  title: string
  rows: R[]
  /** The consequences section. */
  effect: boolean
}

/* The heading for rows that name no section — in every review, a name.

   It was "General". The owner, 1 Oct 2026: "Call it Basic details", which is
   what the name is on the pages it belongs to. On a device profile the setup
   rows already file under a section of exactly that title (fingerprint.ts), so
   a name row joins that same section rather than opening a second one of the
   same name: `groupReview` files by title.

   Fewer reviews hold one now. A rename saves itself from the name field's ✓
   on a stored item (rename-now.ts), so the name shows here only for an item
   not stored yet — a new zone or device profile — and on Policy details,
   whose name is a field of the form the footer saves. */
export const GENERAL_GROUP = 'Basic details'
/** The heading for consequences that name no section of their own. */
export const EFFECT_GROUP = 'Other settings'

type Groupable = { group?: string; effect?: boolean; kind?: ReviewKind; count?: number; check?: CheckFinding; before: unknown; after: unknown }

/* Sections in the order the page first names them, rows without one leading,
   consequences last whatever order they came in. */
export function groupReview<R extends Groupable>(rows: R[]): ReviewGroup<R>[] {
  const order: string[] = []
  const byTitle = new Map<string, R[]>()
  const effects: R[] = []
  for (const r of rows) {
    if (r.effect) {
      effects.push(r)
      continue
    }
    const title = r.group ?? GENERAL_GROUP
    if (!byTitle.has(title)) {
      byTitle.set(title, [])
      order.push(title)
    }
    byTitle.get(title)!.push(r)
  }
  const general = order.indexOf(GENERAL_GROUP)
  if (general > 0) order.unshift(...order.splice(general, 1))
  const make = (title: string, list: R[], effect: boolean): ReviewGroup<R> => ({ title, rows: list, effect })
  const groups = order.map((t) => make(t, byTitle.get(t)!, false))
  if (effects.length > 0) {
    /* Named for what moves when every consequence is one thing ("Risk
       scores"), otherwise generically. */
    const own = new Set(effects.map((r) => r.group))
    const title = own.size === 1 && effects[0].group ? effects[0].group : EFFECT_GROUP
    groups.push(make(title, effects, true))
  }
  return groups
}

export const KIND_ORDER: ReviewKind[] = ['added', 'changed', 'removed']

/* --- Sections, each split by kind ------------------------------------------------

   What the dialog draws: the page's own sections in the order the page names
   them, and inside each one the kinds present, added first. A change stays in
   the section it belongs to (owner, 18 Sep 2026) — pooling every added row
   from every section under one heading is what this replaced. */

export interface KindBlock<R> {
  kind: ReviewKind | 'effect' | CheckFinding
  rows: R[]
}

export interface SectionGroup<R> {
  title: string
  /** The consequences section. */
  effect: boolean
  blocks: KindBlock<R>[]
  /** Changes in the section — a row listing several counts each one. */
  count: number
}

export function groupSections<R extends Groupable>(rows: R[]): SectionGroup<R>[] {
  return groupReview(rows).map((section) => ({
    title: section.title,
    effect: section.effect,
    count: tally(section.rows),
    blocks: section.effect
      ? effectBlocks(section.rows)
      : KIND_ORDER.map((kind) => ({ kind, rows: section.rows.filter((r) => reviewKind(r) === kind) })).filter(
          (b) => b.rows.length > 0,
        ),
  }))
}

const tally = (rows: { count?: number }[]) => rows.reduce((n, r) => n + (r.count ?? 1), 0)

/* --- How the dialog opens, and what holds its Save ---------------------------------

   Sections open, because a review that hides what it is reviewing is not a
   review. Past this many ROWS one section starts open and the rest shut —
   rows, not counted changes, because it is rows that make the dialog long: a
   zone's single "10.0.0.2, 10.0.0.3 and 12 more" row counts fifteen changes
   and takes one line.

   The one left open is the biggest, not the first. The first is Basic details
   (GENERAL_GROUP) — the Name row — on every create, and was on every rename
   until a rename saved itself (1 Oct 2026), so "open the first" opened a
   one-row section and shut everything worth reading.

   A section holding something that fails is always open: what stops the save
   is never behind a chevron. */
export const REVIEW_OPEN_ALL = 12

/** Whether each section starts open. */
export function sectionsOpen(sections: readonly Pick<SectionGroup<unknown>, 'blocks'>[]): boolean[] {
  const rowsIn = (x: (typeof sections)[number]) => x.blocks.reduce((n, b) => n + b.rows.length, 0)
  const many = sections.reduce((n, x) => n + rowsIn(x), 0) > REVIEW_OPEN_ALL
  const openAt = sections.reduce((best, x, i) => (rowsIn(x) > rowsIn(sections[best]) ? i : best), 0)
  return sections.map((x, i) => !many || i === openAt || x.blocks.some((b) => b.kind === 'fail'))
}

/** The review's Save: held by the page's own validity, titled with its reason, or by a check, titled with the check's short word ("Can't save"). */
export function reviewSave(blocked: boolean, blockedReason: string | undefined, stop: string | null): { disabled: boolean; title: string | undefined } {
  return { disabled: blocked || !!stop, title: blocked ? blockedReason : (stop ?? undefined) }
}

/* The consequences: one block of what simply happens, then a check's findings
   under their own chips, fails first — so a saved sign-in the edit breaks is
   never filed as one more thing that "happens". */
function effectBlocks<R extends Groupable>(rows: R[]): KindBlock<R>[] {
  const plain: KindBlock<R> = { kind: 'effect', rows: rows.filter((r) => !r.check) }
  const found = CHECK_ORDER.map((kind): KindBlock<R> => ({ kind, rows: rows.filter((r) => r.check === kind) }))
  return [plain, ...found].filter((b) => b.rows.length > 0)
}

const KIND_WORDS = new Set(['added', 'removed', 'changed'])

type Nameable = { label: string; group?: string; item?: string; effect?: boolean }

/* A row's name inside its section. The item when there is one; otherwise
   the label without the section it already sits in. A label that is only its
   kind ("IP networks: added") is named for its section, since the heading
   already says added. A consequence keeps its whole label. */
export function reviewItemName(row: Nameable): string {
  if (row.effect) return row.label
  if (row.item) return row.item
  const prefix = row.group ? `${row.group}: ` : ''
  if (!prefix || !row.label.startsWith(prefix)) return row.label
  const rest = row.label.slice(prefix.length).trim()
  if (!rest || KIND_WORDS.has(rest.toLowerCase())) return row.group!
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}
