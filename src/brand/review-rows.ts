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

   All optional, and `label` still reads on its own, so a row without them is
   still a valid row. No React here: the producers are plain modules.
   -------------------------------------------------------------------------- */

export type ReviewKind = 'added' | 'removed' | 'changed'

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

/** The heading for rows that name no section. */
export const GENERAL_GROUP = 'General'
/** The heading for consequences that name no section of their own. */
export const EFFECT_GROUP = 'Other settings'

type Groupable = { group?: string; effect?: boolean; kind?: ReviewKind; count?: number; before: unknown; after: unknown }

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
  kind: ReviewKind | 'effect'
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
      ? [{ kind: 'effect' as const, rows: section.rows }]
      : KIND_ORDER.map((kind) => ({ kind, rows: section.rows.filter((r) => reviewKind(r) === kind) })).filter(
          (b) => b.rows.length > 0,
        ),
  }))
}

const tally = (rows: { count?: number }[]) => rows.reduce((n, r) => n + (r.count ?? 1), 0)

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
