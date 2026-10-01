import type { Policy } from '../../data'
import { DECISION_WORDS } from '../../decision-words'
import { offeredAppFix, type AppBreakInResult, type AppBreakInRow, type AppFixOffer } from '../break-in-app'
import { GROUP_ORDER, GROUP_WORDS, needsSaid, secondFactorSaid, type Accepted, type BreakInGroup, type CountKey } from '../break-in-model'
import type { BreakInCounts } from '../gauntlet'
import type { SimEnv } from '../simulate'
import { WHAT_CHANGES, type WhatChangesLine } from '../what-changes'

/* -----------------------------------------------------------------------------
   Break-in attempts on Access checks, as the page draws them: the Why
   section's cells, the attempts panel's groups and rows, and what a row's fix
   would move.

   The deck and its judge are break-in-app.ts's; this is only how the page
   reads them (owner, 1 Oct 2026: "can we implement it in the check part? as a
   suggestion inside conflicts or somewhere else" — then "go with your picks,
   start building"). Counts, never a grade. The four cells are the builder's
   own (`COUNT_CELLS`); a hole — Got through, Weaker factor — that is not 0 is
   said in the conflict tone, a 0 is quiet, and the two costs are plain.

   The panel lists every card under its result, in `GROUP_ORDER`, and Held
   last, folded: what held is not the question, and its count is said once,
   on the fold. A hole row offers its fix with what it would move — each
   count it moves, at its new number, and across the tenant only what moves
   there — computed for that row when it is drawn, never for a row that held,
   and kept per run, so the panel opened again is not asked again.

   Pure, so every word the panel prints is pinned without drawing it.
   -------------------------------------------------------------------------- */

/** The attempts panel's id: the strip and the quiet link control it. */
export const ATTEMPTS_PANEL_ID = 'sit-attempts'

/** Where Review attempts was pressed: the Why panel's section (the panel gets a way back), or the outcome. */
export type AttemptsFrom = 'why' | 'outcome'

/** The results that let a sign-in in more easily than its card asks: the rows that offer a fix. */
export const HOLE_GROUPS: readonly BreakInGroup[] = ['got-through', 'weaker-factor', 'less-than-asked']

export const isHole = (row: Pick<AppBreakInRow, 'group'>): boolean => HOLE_GROUPS.includes(row.group)

/** A cell's tone: a hole that is not 0 in the conflict tone, a 0 quiet, a cost plain. */
export type CellTone = 'hole' | 'quiet' | 'plain'

export function cellTone(key: CountKey, counts: Pick<BreakInCounts, CountKey>): CellTone {
  if (counts[key] === 0) return 'quiet'
  return key === 'gotThrough' || key === 'weakerFactor' ? 'hole' : 'plain'
}

export interface AttemptGroup {
  group: BreakInGroup
  word: string
  rows: AppBreakInRow[]
}

/* The rows under their headings, in `GROUP_ORDER`, an empty one left out —
   and what held, apart, for the fold at the foot. */
export function attemptGroups(rows: readonly AppBreakInRow[]): { groups: AttemptGroup[]; held: AppBreakInRow[] } {
  const groups = GROUP_ORDER.filter((g) => g !== 'held')
    .map((group) => ({ group, word: GROUP_WORDS[group], rows: rows.filter((r) => r.group === group) }))
    .filter((g) => g.rows.length > 0)
  return { groups, held: rows.filter((r) => r.group === 'held') }
}

/* What a fix moves, in the counts' words: the four cells and Less than
   asked, which has no cell but is a hole all the same — a fix for an
   ordinary sign-in let in too easily moves only it. The number after only:
   the one before is the cell's at the head of the panel, said once there
   (review, 1 Oct 2026: "Got through 3 → 2" said it twice). "Got through now
   1 · Locked out now 3". Null when nothing moves. */
const MOVES: readonly { key: keyof BreakInCounts; word: string }[] = [
  { key: 'gotThrough', word: GROUP_WORDS['got-through'] },
  { key: 'weakerFactor', word: GROUP_WORDS['weaker-factor'] },
  { key: 'lessThanAsked', word: GROUP_WORDS['less-than-asked'] },
  { key: 'lockedOut', word: GROUP_WORDS['locked-out'] },
  { key: 'extraPrompts', word: GROUP_WORDS['extra-prompts'] },
]

export function movedSaid(now: BreakInCounts, after: BreakInCounts): string | null {
  const moved = MOVES.filter((m) => now[m.key] !== after[m.key])
  return moved.length === 0 ? null : moved.map((m) => `${m.word} now ${after[m.key]}`).join(' · ')
}

/* What the fix changes across the tenant — only when it says something, and
   then only what moved: "Of 720 modelled sign-ins: Now denied 48". A fix is
   never looser (`offeredAppFix` withholds one that is), so Now allowed and
   Now on 1 factor are 0 on every fix this panel shows; `whatChangesSaid`
   (the guard page's and the builder's, which keep all four) printed them
   anyway, a line of zeros in a box already dense with numbers. */
export function tenantSaid(line: WhatChangesLine): string | null {
  const moved = WHAT_CHANGES.filter((m) => line.counts[m.key] > 0)
  if (moved.length === 0) return null
  return `Of ${line.total.toLocaleString('en-US')} modelled sign-ins: ${moved.map((m) => `${m.word} ${line.counts[m.key]}`).join(' · ')}`
}

/* A threat stopped harder than its card asks has held (`classifyAttempt`):
   what a hostile card asks is a floor, so a Held row whose answer is not
   the card's says "Expected at least" — "Expected Allow with 2FA · Got
   Deny" read as a miss under the Held fold. */
export const atLeast = (row: Pick<AppBreakInRow, 'group' | 'expected' | 'got'>): boolean => row.group === 'held' && row.got !== null && row.got !== row.expected

/* "Expected Deny, got Allow on 1 factor" — the row's result, as its press is
   read aloud after its name; "Expected Deny, can't tell" where nothing
   decided one answer. */
export function resultSpoken(row: Pick<AppBreakInRow, 'group' | 'expected' | 'got'>): string {
  const want = `Expected ${atLeast(row) ? 'at least ' : ''}${DECISION_WORDS[row.expected]}`
  return row.got ? `${want}, got ${DECISION_WORDS[row.got]}` : `${want}, can't tell`
}

/* The one quiet line a row needs past Expected and Got, where those two do
   not say why it sits under its heading (review, 1 Oct 2026): a Weaker
   factor row's badges are the same — "Expected Allow with 2FA · Got Allow
   with 2FA" — so it says the factor, "Second factor: miniOrange Push ·
   standard · needs phishing-resistant"; a can't tell row says what would
   settle it, "Needs: IP address, Place". The builder's Break-in view's own
   lines (break-in-model.ts `secondFactorSaid`, `needsSaid`), read in the
   policy that decided. Null on every other row. */
export function rowNote(row: AppBreakInRow, policies: readonly Policy[]): string | null {
  if (row.group === 'weaker-factor') {
    const policy = policies.find((p) => p.id === row.policyId)
    const factor = policy ? secondFactorSaid(row, policy) : null
    return factor ? `Second factor: ${factor}` : null
  }
  const needs = needsSaid(row)
  return needs ? `Needs: ${needs}` : null
}

/* The fix a row offers, with its preview — or none — once per run.

   `offeredAppFix` re-runs the deck and sweeps the tenant twice, so it is asked
   only for a hole row as it is drawn, and kept against the run it was asked
   of: the page's run is `breakInOnApp`'s, the same object until a policy, the
   env or an acceptance changes, and a new run asks again. Never a row that
   held, can't be told or costs (none of those has a fix), and never the
   Global Default's (it takes no scripted rules from here). */
const OFFERS = new WeakMap<AppBreakInResult, Map<string, AppFixOffer | null>>()

export function attemptOffer(
  result: AppBreakInResult,
  row: AppBreakInRow,
  policies: readonly Policy[],
  env: SimEnv,
  accepted?: Readonly<Record<string, Accepted>>,
): AppFixOffer | null {
  if (!isHole(row) || row.policyId === null || row.isGlobalDefault) return null
  let byCard = OFFERS.get(result)
  if (!byCard) {
    byCard = new Map()
    OFFERS.set(result, byCard)
  }
  if (byCard.has(row.id)) return byCard.get(row.id) ?? null
  const offer = offeredAppFix(row, policies, result.appId, env, result.counts, { accepted })
  byCard.set(row.id, offer)
  return offer
}
