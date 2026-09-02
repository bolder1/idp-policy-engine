import { conditionType, type Condition, type Policy, type Predicate, type Rule } from '../data'
import { ckey, leaves } from '../predicate'
import type { SimContext, SimEnv } from './simulate'
import { evalCond, walk } from './simulate'

/* -----------------------------------------------------------------------------
   The ledger's projections.

   Everything here is derived and read-only. Nothing in this file writes to a
   rule: a grid that quietly rewrote the predicate to make its own columns line
   up would be a grid you cannot trust, and the column that most invites it —
   "narrows to" — is exactly the one where a wrong answer is invisible.
   -------------------------------------------------------------------------- */

/* Which condition types are audience narrowing rather than sign-in signal.

   The policy governs a set of people; a rule can narrow within it, and after the
   audience hoist that narrowing is spelled as an ordinary `group` or `user`
   condition. The ledger pulls those out into their own column because they
   answer a different question from the rest — WHO this rule is about, versus
   WHEN it fires — and reading a column of predicates that each begin "group in
   finance and…" is reading the same six words nine times. */
const NARROWING = new Set(['group', 'user'])

export interface Hoisted {
  /** The `group`/`user` conditions, if EVERY alternative carries the same ones. */
  narrowing: Condition[]
  /** What is left once they are lifted out. Display only. */
  rest: Predicate
}

/* Only lifts a narrowing that is genuinely common to every alternative.

   A `group` condition in one card and not another is not a property of the
   rule — it is part of one branch of the predicate, and showing it in the
   NARROWS TO column would claim the rule is scoped when it is not. In that
   case nothing is lifted and the conditions stay in WHEN, where they are true. */
export function hoistNarrowing(when: Predicate): Hoisted {
  if (when.cards.length === 0) return { narrowing: [], rest: when }

  const perCard = when.cards.map((k) => k.conditions.filter((c) => NARROWING.has(c.typeId)))
  if (perCard.some((list) => list.length === 0)) return { narrowing: [], rest: when }

  const first = perCard[0].map(ckey).sort().join('|')
  const common = perCard.every((list) => list.map(ckey).sort().join('|') === first)
  if (!common) return { narrowing: [], rest: when }

  const lifted = new Set(perCard[0].map(ckey))
  const rest = {
    cards: when.cards
      .map((k) => ({ ...k, conditions: k.conditions.filter((c) => !lifted.has(ckey(c))) }))
      .filter((k) => k.conditions.length > 0),
  }
  return { narrowing: perCard[0], rest }
}

/** The narrowing as names — group ids and user ids resolved through the caller's lookup. */
export function narrowingNames(narrowing: Condition[], resolve: (kind: 'group' | 'user', id: string) => string | undefined) {
  return narrowing.flatMap((c) =>
    c.values.map((v) => resolve(c.typeId === 'group' ? 'group' : 'user', v) ?? v),
  )
}

/* --- The WHEN cell -------------------------------------------------------------

   Two lines, hard. The cell is inside a row whose height is the layout's one
   invariant, so overflow is a designed control — a `+N more` button — rather
   than a CSS ellipsis that silently eats the half of a rule you needed. */

export interface Clause {
  id: string
  text: string
  /** First clause of a card other than the first — the one that reads "or …". */
  startsAlternative: boolean
}

export function clausesOf(
  when: Predicate,
  phrase: (c: Condition) => string,
): { shown: Clause[]; overflow: number } {
  const all: Clause[] = []
  when.cards.forEach((k, ci) => {
    k.conditions.forEach((c, i) => {
      all.push({ id: c.id, text: phrase(c), startsAlternative: ci > 0 && i === 0 })
    })
  })
  /* Three is what two lines hold at the column's narrowest supported width with
     the longest condition label in the catalogue. Counted rather than measured,
     because a measured clamp reflows the row and the row height is the one
     thing that may not move. */
  const CAP = 3
  return { shown: all.slice(0, CAP), overflow: Math.max(0, all.length - CAP) }
}

/** A condition as the ledger says it — no operator jargon the column cannot fit. */
export function shortPhrase(c: Condition, resolve: (kind: string, id: string) => string | undefined): string {
  const t = conditionType(c.typeId)
  const vals = c.values.filter((v) => v.trim() !== '')
  const shown =
    t.valueKind === 'zone' || t.valueKind === 'fingerprint' || t.valueKind === 'hook' || t.valueKind === 'group' || t.valueKind === 'user'
      ? vals.map((v) => resolve(t.valueKind, v) ?? v).join(', ')
      : t.valueKind === 'time'
        ? vals.join('–')
        : vals.join(', ')
  return `${t.label} ${c.operator} ${shown || '…'}`
}

/* --- Trace -------------------------------------------------------------------

   The trace is a MODE of the grid rather than a dialog beside it. There is
   nowhere for the two to disagree, which is the failure the simulator's own
   header comment exists to prevent — so this returns marks the grid renders,
   never a second rendering of the policy. */

export type RowTrace = 'hit' | 'miss' | 'unreached' | 'ungoverned'

export interface Trace {
  rows: Record<string, RowTrace>
  /** Per-condition verdicts, so a clause can carry its own mark. */
  marks: Map<string, 'pass' | 'fail' | 'unknown'>
  hitIndex: number | null
  outOfAudience: boolean
}

export function traceOf(policy: Policy, ctx: SimContext, env: SimEnv): Trace {
  const t = walk(policy, ctx, env)
  const rows: Record<string, RowTrace> = {}
  const marks = new Map<string, 'pass' | 'fail' | 'unknown'>()

  for (const r of policy.rules) {
    for (const c of leaves(r.when)) marks.set(c.id, evalCond(c, ctx).state)
  }

  if (t.outOfAudience) {
    for (const r of policy.rules) rows[r.id] = 'ungoverned'
    return { rows, marks, hitIndex: null, outOfAudience: true }
  }

  for (const step of t.steps) {
    rows[step.rule.id] = step.kind === 'hit' ? 'hit' : step.kind === 'unreached' ? 'unreached' : 'miss'
  }
  return { rows, marks, hitIndex: t.hitIndex, outOfAudience: false }
}

/* --- Bulk ---------------------------------------------------------------------

   One patch over many rules, committed as ONE history entry. Four separate
   edits would be four undos, and an admin who set four rules to Deny by mistake
   should not have to press ⌘Z four times to find out which ones they were. */
export function bulkPatch(rules: Rule[], ids: Set<string>, patch: Partial<Rule>): Rule[] {
  return rules.map((r) => (ids.has(r.id) ? { ...r, ...patch } : r))
}

/** Move a rule, clamped. Returns the same array when the move is a no-op. */
export function moveRule(rules: Rule[], from: number, to: number): Rule[] {
  if (to < 0 || to >= rules.length || from === to) return rules
  const next = [...rules]
  const [r] = next.splice(from, 1)
  next.splice(to, 0, r)
  return next
}
