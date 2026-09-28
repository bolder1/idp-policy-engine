import type { Audience, Policy, Rule } from '../../data'
import { audienceOfAnswers, compose, emptyAnswers, nameOf, type DescribeAnswers, type DescribeTenant, type Reading, type RuleIds } from '../../create/describe-model'
import { amend, commit, undo, type History } from '../history'

/* -----------------------------------------------------------------------------
   One Describe it session, as the board's history sees it.

   The panel rewrites the rules after every answer, and all of it is ONE thing
   to take back (describe spec, §4.8): the first write of a session commits,
   so the draft as it was before the panel is on the undo stack, and every
   later write amends the present in place. One Undo — the toolbar's, ⌘Z, or
   the toast's — returns to the draft as it was before the panel wrote
   anything.

   Amending is only safe while the present IS the session's last write. If
   something else moved the history in between — ⌘Z pressed with the panel
   open, a save, a fix from a guard page — amending would overwrite a state
   the session never wrote and lose it from the stack. So a write checks, and
   commits afresh when the present is not its own.

   The board (BoardBuilder.tsx) holds the state and does the saving; what it
   decides is here, as plain functions, so the door, the write, Done and the
   toast's Undo are each one call a test can make without a browser.
   -------------------------------------------------------------------------- */

export interface DescribeSession {
  /** A write reached the history this session. */
  wrote: boolean
  /** The policy's audience when the panel opened, for the toast's Undo. */
  audienceBefore: Audience
  /* The draft's last row when the panel opened: what a reading that says
     nothing about the rest leaves in place. Not the session's own earlier
     write — a text read again replaces what the text before it said. */
  fallbackBefore: Rule | undefined
  /** The present the session last wrote, by reference. */
  last: Policy | null
}

export const describeSession = (audienceBefore: Audience, fallbackBefore?: Rule): DescribeSession => ({ wrote: false, audienceBefore, fallbackBefore, last: null })

/* The rules, the last row and the checks they were tried with (describe spec,
   §4.8): the name, applications and audience are saved straight to the policy. */
const body = (p: Policy) => JSON.stringify({ rules: p.rules, fallback: p.fallback, checks: p.checks })

export function writeDescribed(h: History, next: Policy, s: DescribeSession): { hist: History; session: DescribeSession } {
  if (body(h.present) === body(next)) return { hist: h, session: s }
  const hist = s.wrote && s.last === h.present ? amend(h, next) : commit(h, next)
  return { hist, session: { ...s, wrote: true, last: hist.present } }
}

/** A name the product gave, which Describe it may replace with one from the answers. */
export const UNTITLED_NAME = /^Untitled policy( \d+)?$/

/** What the board holds for the visit: the box as typed, and the reading behind the answers. */
export interface DescribeState {
  text: string
  reading: Reading
}
export const emptyDescribe = (): DescribeState => ({ text: '', reading: { text: '', answers: emptyAnswers(), choices: [], notAdded: [], clauses: [] } })

/* --- The door ------------------------------------------------------------------

   On a new draft only (describe spec, §2 and Assumption 5). The panel saves
   the audience straight to the policy at Done, and a direct write to one that
   decides sign-ins would skip the checks before saving — so a live policy with
   no rules keeps the two cards it had. `on` is the edition's flag, passed by
   name at the call site so the gate reads where it is used. */
export function describeOffered(on: boolean, p: Pick<Policy, 'status' | 'type' | 'isSystem'>): boolean {
  return on && p.status === 'draft' && p.type === 'App Access' && !p.isSystem
}

/* The Applications answer, when the text named none: the policy's own
   applications, as a default — so the answer and the start node agree, and a
   read that names no application never takes one away. */
export function withDraftApps(st: DescribeState, appIds: readonly string[]): DescribeState {
  const apps = st.reading.answers.apps
  if (apps.origin === 'text' || apps.origin === 'picked' || appIds.length === 0) return st
  /* Already the policy's own: the same state, so a keystroke in the box —
     which passes through here — leaves the reading, and everything computed
     from it, exactly as it was. */
  if (apps.origin === 'default' && apps.value?.join() === appIds.join()) return st
  return { ...st, reading: { ...st.reading, answers: { ...st.reading.answers, apps: { value: [...appIds], origin: 'default', spans: [] } } } }
}

/* --- A write --------------------------------------------------------------------

   The draft the answers make: the composed rules, and the composed last row
   when the answers give one — otherwise the last row the draft had when the
   panel opened (`lastRow`), exactly as it was. Everything else on the draft
   stays. `ids` keeps each card's id across recompositions, so the board moves
   a card rather than remounting it. */
export function describedDraft(
  draft: Policy,
  answers: DescribeAnswers,
  t: DescribeTenant,
  ids: RuleIds,
  lastRow: Rule | undefined = draft.fallback,
): { policy: Policy; sources: Record<string, string> } {
  const c = compose(answers, t, ids)
  return { policy: { ...draft, rules: c.rules, fallback: c.fallback ?? lastRow }, sources: c.sources }
}

/* --- Done ---------------------------------------------------------------------------

   What Done saves straight to the policy, once (describe spec, §3.9): a name
   from the answers while the policy still carries the one the product gave
   it, and the audience the answers describe. `taken` is every other policy's
   name, so two described drafts never share one. */
export function doneFacts(p: Policy, answers: DescribeAnswers, t: DescribeTenant, taken: readonly string[]): { name: string; audience: Audience } {
  return { name: UNTITLED_NAME.test(p.name) ? nameOf(answers, t, taken) : p.name, audience: audienceOfAnswers(answers) }
}

/** The toast Done shows when the session wrote anything. */
export const RULES_ADDED = 'Rules added. Not saved yet.'

/* The toast's Undo. It steps back over the session's one entry and hands back
   the audience from before the panel opened — but only while the session's
   write is still the present. After any other edit it would undo THAT, so it
   does nothing and the board says where the full history is (null), as
   `offerUndo` does. `chooser`: no rules are left, so the three cards return. */
export function undoDescribed(h: History, after: Policy, s: DescribeSession): { hist: History; audience: Audience; chooser: boolean } | null {
  if (h.present !== after) return null
  const hist = undo(h)
  return { hist, audience: s.audienceBefore, chooser: hist.present.rules.length === 0 }
}
