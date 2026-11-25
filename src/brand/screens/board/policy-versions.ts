import { useSyncExternalStore } from 'react'

import type { Policy, Rule } from '../../data'
import { sameRules, type RuleSet } from '../../policy-draft'

/* -----------------------------------------------------------------------------
   POLICY VERSIONS: the Draft model's V3 (draft-model.ts; owner, 23 Nov 2026:
   "the brutal version … publish, approve and reject, versions, restore, roll
   back"). Design only, on the Full builder.

   Every publish is a numbered snapshot of the rules, the last row and the
   applications, with who, when, an optional note and who approved it. The last
   one is live. History is never rewritten: a roll back is a new version that
   copies an older one.

   Beside the versions, per policy:
     draftBase  the live version the open draft started from, so the builder can
                say "Live changed since your draft started" when it moves on;
     review     a draft sent for review (locked for its author), or the reason
                it was rejected.

   And two settings for the tenant: "Publishing needs approval", and the Design
   demo's "Acting as" (Author / Reviewer), which stands in for a second admin.

   In memory, like the rest of the prototype's seed: a reload starts again from
   the seeded history. A policy nobody has opened in V3 is seeded lazily — a
   short believable history whose last version is its live rules — and is only
   stored once something is written to it.
   -------------------------------------------------------------------------- */

export interface PolicyVersion {
  n: number
  rules: Rule[]
  fallback?: Rule
  appIds: string[]
  /** Who published it. */
  by: string
  /** When, as the console writes a time: "Nov 14, 2026, 10:42". */
  at: string
  note?: string
  /** Another admin, when publishing needed approval. */
  approvedBy?: string
  /** A roll back: the version it copies. */
  copies?: number
  /** Saved live from outside V3 (Today or Fix): read from the policy, never stored. */
  outside?: true
}

export type Review =
  | { kind: 'in-review'; by: string; at: string; note?: string }
  | { kind: 'rejected'; by: string; at: string; reason: string }

export interface Track {
  /** Oldest first; the last is live. Empty for a policy never published. */
  versions: PolicyVersion[]
  draftBase?: number
  review?: Review
}

export type Actor = 'author' | 'reviewer'

/** The second admin the Design demo acts as (Acting as: Reviewer). */
export const REVIEWER_NAME = 'Meera Iyer'

/* The review demo — "Acting as" beside the Draft model dropdown, and "Publishing needs approval" in Version history —
   is hidden as of now (owner, 23 Nov 2026: "Remove this as of now", of Acting as; history first). Without a second
   admin a review could only be withdrawn, so the approval switch goes with it. Kept, not dead: true brings both back
   as they were, and Request review, Approve, Reject and Withdraw with them. */
export const REVIEW_DEMO: boolean = false

interface State {
  tracks: Record<string, Track>
  /** Publishing needs approval, for the whole tenant. */
  approval: boolean
  actor: Actor
}

let state: State = { tracks: {}, approval: false, actor: 'author' }
const listeners = new Set<() => void>()
const emit = (next: State) => {
  state = next
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The whole store, for the builder: tracks, the approval setting and who the demo acts as. */
export const useVersionStore = (): State => useSyncExternalStore(subscribe, () => state, () => state)

export const setApprovalNeeded = (on: boolean) => emit({ ...state, approval: on })
export const setActor = (actor: Actor) => emit({ ...state, actor })

/** Writes a policy's track from what is stored (undefined before the first write, when the caller seeds it). */
export function writeTrack(policyId: string, change: (stored: Track | undefined) => Track) {
  emit({ ...state, tracks: { ...state.tracks, [policyId]: change(state.tracks[policyId]) } })
}

/** Test seam: back to an empty store. */
export function resetVersions() {
  emit({ tracks: {}, approval: false, actor: 'author' })
}

/* --- Pure rules ------------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** "Nov 14, 2026, 10:42", in local time. */
export function whenLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A small stable number from a policy id, so each policy's seeded history has its own dates. */
function spread(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** The admins the seeded histories name, besides the signed-in one. */
const SEED_ADMINS = ['Dev Malhotra', REVIEWER_NAME]

/* The seed's dates count back from a fixed day, so a history reads the same on every load and in tests. */
const SEED_ANCHOR = new Date(2026, 10, 20, 9, 0)
const daysBefore = (days: number, minutes: number): string => {
  const d = new Date(SEED_ANCHOR)
  d.setDate(d.getDate() - days)
  d.setMinutes(d.getMinutes() + minutes)
  return whenLabel(d)
}

/** True when a policy has rules people have published: not a draft, not new. */
const everPublished = (p: Pick<Policy, 'status' | 'provisional'>) => !p.provisional && p.status !== 'draft'

/* A believable short history for a published policy nobody has versioned yet. Each step is one edit an admin would
   recognise, so the change lines between neighbours read as real work:
     v1  the first rule switched the other way,
     v2  the first rule as it is now,
     v3  the last rule added: the live rules.
   Fewer rules, fewer steps. The last version is always the live rules. */
export function seedTrack(p: Policy, you: string): Track {
  if (!everPublished(p)) return { versions: [] }
  const s = spread(p.id)
  const live: RuleSet = { rules: p.rules, fallback: p.fallback }
  const flipFirst = (rules: Rule[]): Rule[] => rules.map((r, i) => (i === 0 ? { ...r, enabled: !r.enabled } : r))
  const steps: { set: RuleSet; note?: string }[] =
    p.rules.length >= 2
      ? [
          { set: { rules: flipFirst(p.rules.slice(0, -1)), fallback: p.fallback }, note: 'First version' },
          { set: { rules: p.rules.slice(0, -1), fallback: p.fallback }, note: 'After the pilot week' },
          { set: live, note: 'Covers the audit findings' },
        ]
      : p.rules.length === 1
        ? [
            { set: { rules: flipFirst(p.rules), fallback: p.fallback }, note: 'First version' },
            { set: live, note: 'After the pilot week' },
          ]
        : [{ set: live, note: 'First version' }]
  const who = [SEED_ADMINS[s % 2], SEED_ADMINS[(s + 1) % 2], you]
  const ages = [40 + (s % 20), 18 + (s % 9), 3 + (s % 4)]
  const offset = steps.length === 3 ? 0 : 3 - steps.length
  return {
    versions: steps.map((step, i) => ({
      n: i + 1,
      rules: step.set.rules,
      fallback: step.set.fallback,
      appIds: p.appIds,
      by: who[i + offset],
      at: daysBefore(ages[i + offset], (s % 50) + i * 7),
      ...(step.note ? { note: step.note } : null),
    })),
  }
}

/* The track as the builder reads it. A live policy saved from outside V3 (the Today or Fix model's save, a status
   switch that rewrote it) has rules no version holds: it shows as one more version, read from the policy itself, so
   the last version is always what people sign in with. */
export function reconcile(t: Track, p: Policy, you: string): Track {
  if (!everPublished(p)) return t
  const last = t.versions.at(-1)
  if (last && sameRules(last, { rules: p.rules, fallback: p.fallback })) return t
  const v: PolicyVersion = {
    n: (last?.n ?? 0) + 1,
    rules: p.rules,
    fallback: p.fallback,
    appIds: p.appIds,
    by: p.modifiedBy === 'You' ? you : p.modifiedBy,
    at: p.lastModified,
    outside: true,
  }
  return { ...t, versions: [...t.versions, v] }
}

/** The live version's number, or 0 for a policy never published. */
export const liveNumber = (t: Track): number => t.versions.at(-1)?.n ?? 0

/** One more version on the end. History is never rewritten. The draft beside it is the caller's to settle: a publish
 *  ends it, a roll back leaves it open (and so "Live changed since your draft started"). */
export function appended(t: Track, v: Omit<PolicyVersion, 'n' | 'outside'>): Track {
  return { ...t, versions: [...t.versions, { ...v, n: liveNumber(t) + 1 }] }
}

/** A publish: the draft becomes the next version, and its base and review end with it. */
export function publishedTrack(t: Track, v: Omit<PolicyVersion, 'n' | 'outside'>): Track {
  const { draftBase: _b, review: _r, ...rest } = appended(t, v)
  return rest
}

/** Only the version just before live can be rolled back to, and only once there is something before it. */
export const canRollBack = (t: Track, n: number): boolean => n >= 1 && n === liveNumber(t) - 1

/** What the draft beside live is doing. */
export type DraftState = 'live' | 'draft' | 'in-review' | 'rejected'

export function draftState(t: Track, hasEdits: boolean): DraftState {
  if (t.review?.kind === 'in-review') return 'in-review'
  if (t.review?.kind === 'rejected') return 'rejected'
  return hasEdits || liveNumber(t) === 0 ? 'draft' : 'live'
}

const STATE_WORD: Record<Exclude<DraftState, 'live'>, string> = { draft: 'Draft', 'in-review': 'In review', rejected: 'Rejected' }

type Tone = 'positive' | 'info' | 'notice' | 'negative' | 'neutral'

/** The chip on the name: "v3 · Live", "v4 · Draft", "v4 · In review", "v4 · Rejected". `inUse` false says Published, not Live. */
export function versionChip(t: Track, s: DraftState, inUse: boolean): { n: number; word: string; label: string; tone: Tone } {
  const live = liveNumber(t)
  /* Live is grey: the status pill beside it is already the green, and selection is never coloured. */
  const n = s === 'live' ? live : live + 1
  const word = s === 'live' ? (inUse ? 'Live' : 'Published') : STATE_WORD[s]
  const tone: Tone = s === 'live' ? 'neutral' : s === 'draft' ? 'info' : s === 'in-review' ? 'notice' : 'negative'
  return { n, word, label: `v${n} · ${word}`, tone }
}

/* --- What a version changed, by kind -------------------------------------------

   Version history says a version's change lines (screens/changes.ts) under one chip per kind, as Review changes does
   (owner, 18 Sep 2026: "one Added, Changed and Removed and under that all"). The lines are read by their wording,
   which `describeChanges` keeps fixed. */

export type ChangeKind = 'added' | 'changed' | 'removed'

export function kindOf(line: string): ChangeKind {
  if (/^(Added “|Now protects )/.test(line) || / added (to|as) /.test(line)) return 'added'
  if (/^(Removed “|No longer )/.test(line) || / removed from | no longer an exception /.test(line)) return 'removed'
  return 'changed'
}

/** The lines under their kinds, in the order Added, Changed, Removed; a kind with no line is left out. */
export function groupChanges(lines: string[]): { kind: ChangeKind; lines: string[] }[] {
  const order: ChangeKind[] = ['added', 'changed', 'removed']
  return order.map((kind) => ({ kind, lines: lines.filter((l) => kindOf(l) === kind) })).filter((g) => g.lines.length > 0)
}

/* A change line as the console's change list draws one (change-list.tsx): the rule's name, and what happened to it,
   on one line under the kind's chip — "Low risk — password   Moved to position 2". The chip already says Added or
   Removed, so the line does not say it again. A line about no one rule (applications, the audience) keeps its words
   and no name. */
export function changeItem(line: string): { name?: string; what: string } {
  const m = /“([^”]*)”/.exec(line)
  if (!m) return { what: line }
  const name = m[1]
  if (/^Added “/.test(line)) return { name, what: 'New rule' }
  if (/^Removed “/.test(line)) return { name, what: 'Rule removed' }
  /* "Conditions edited on “X”": the name ended the line, so the word before it goes with it. Not "“X” switched on". */
  const endsWithName = m.index + m[0].length === line.length
  const cut = (line.slice(0, m.index) + line.slice(m.index + m[0].length)).trim().replace(/ — evaluation order changed$/, '')
  const rest = endsWithName ? cut.replace(/\s+(on|to|from)$/, '') : cut
  return { name, what: rest.charAt(0).toUpperCase() + rest.slice(1) }
}

/* --- Compare, side by side --------------------------------------------------------

   Two versions' rules lined up row by row (owner, 23 Nov 2026: "showcase both things side by side … the left side is
   read-only, and the right side can be the new version … the user can just check it side by side"). A row is one
   rule: on both sides when both versions have it (the same, or changed), on the right only when B added it, on the
   left only when B removed it. B's order leads; a removed rule sits after the rule it followed in A, so it reads
   where it used to be. */

export type RowKind = 'same' | 'changed' | 'added' | 'removed'

export interface AlignedRow {
  id: string
  kind: RowKind
  /** The rule in A and its number there. */
  a?: { rule: Rule; n: number }
  /** The rule in B and its number there. */
  b?: { rule: Rule; n: number }
  /** Both have it, at a different number. */
  moved: boolean
}

export function alignRules(a: readonly Rule[], b: readonly Rule[]): AlignedRow[] {
  const inA = new Map(a.map((r, i) => [r.id, i]))
  const inB = new Set(b.map((r) => r.id))
  const rows: AlignedRow[] = b.map((r, i) => {
    const ai = inA.get(r.id)
    if (ai === undefined) return { id: r.id, kind: 'added', b: { rule: r, n: i + 1 }, moved: false }
    return { id: r.id, kind: sameRule(a[ai], r) ? 'same' : 'changed', a: { rule: a[ai], n: ai + 1 }, b: { rule: r, n: i + 1 }, moved: ai !== i }
  })
  a.forEach((r, i) => {
    if (inB.has(r.id)) return
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = rows.findIndex((x) => x.id === a[j].id)
      if (k >= 0) {
        at = k + 1
        break
      }
    }
    rows.splice(at, 0, { id: r.id, kind: 'removed', a: { rule: r, n: i + 1 }, moved: false })
  })
  return rows
}

/** Whether the last row differs between two versions. */
export const fallbackChanged = (a: Pick<RuleSet, 'fallback'>, b: Pick<RuleSet, 'fallback'>): boolean => !sameRule(a.fallback, b.fallback)

/** The rules a version brought in that the one before it did not have: their cards say New on the canvas. */
export const addedRuleIds = (before: Pick<RuleSet, 'rules'> | undefined, after: Pick<RuleSet, 'rules'>): string[] =>
  before ? after.rules.filter((r) => !before.rules.some((b) => b.id === r.id)).map((r) => r.id) : []

/** Why this admin cannot approve the request, or null when they can. */
export function approveBlocker(review: Review | undefined, actorName: string): string | null {
  if (review?.kind !== 'in-review') return 'Nothing is waiting for review'
  return review.by === actorName ? 'Another admin must approve' : null
}

/** The draft started from an older version than live: someone published, or rolled back, since. */
export const liveMoved = (t: Track): boolean => t.draftBase !== undefined && t.draftBase < liveNumber(t)

export const versionAt = (t: Track, n: number): PolicyVersion | undefined => t.versions.find((v) => v.n === n)

/** A version as a policy, so the change lines (screens/changes.ts) can be read between any two. */
export const asPolicy = (p: Policy, v: Pick<PolicyVersion, 'rules' | 'fallback' | 'appIds'>): Policy => ({
  ...p,
  rules: v.rules,
  fallback: v.fallback,
  appIds: v.appIds,
  pendingDraft: undefined,
})

const sameRule = (a: Rule | undefined, b: Rule | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/* Update draft: the draft's own edits, carried onto the new live rules. Rule by rule, by id, against the version the
   draft started from (`base`):
     - live's order, and live's copy of every rule the draft did not touch;
     - the draft's copy of a rule it edited, even where live changed it too (the draft is the newer intent);
     - a rule the draft removed stays removed;
     - a rule the draft added, or edited where live removed it, goes back in after the rule it followed in the draft;
     - the last row: the draft's if it edited it, otherwise live's.
   The draft's own reordering of untouched rules is not carried; live's order wins. */
export function rebaseDraft(base: RuleSet, live: RuleSet, mine: RuleSet): RuleSet {
  const baseById = new Map(base.rules.map((r) => [r.id, r]))
  const mineById = new Map(mine.rules.map((r) => [r.id, r]))
  const liveIds = new Set(live.rules.map((r) => r.id))
  const edited = (r: Rule) => baseById.has(r.id) && !sameRule(baseById.get(r.id), r)

  const out: Rule[] = []
  for (const l of live.rules) {
    const m = mineById.get(l.id)
    if (baseById.has(l.id) && !m) continue
    out.push(m && edited(m) ? m : l)
  }
  mine.rules.forEach((m, i) => {
    if (liveIds.has(m.id)) return
    if (baseById.has(m.id) && !edited(m)) return
    const before = mine.rules
      .slice(0, i)
      .reverse()
      .find((p) => out.some((o) => o.id === p.id))
    const at = before ? out.findIndex((o) => o.id === before.id) + 1 : 0
    out.splice(at, 0, m)
  })
  const fallback = sameRule(base.fallback, mine.fallback) ? live.fallback : mine.fallback
  return { rules: out, fallback }
}
