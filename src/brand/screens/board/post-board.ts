import { createContext, useContext } from 'react'

import type { App, Policy } from '../../data'
import { published, type CommitIntent } from '../../policy-draft'
import { eventById, isPostSignIn, setupOf, settledPostSignIn, turnOnIssue, type PostAction } from '../../post-sign-in'
import type { Diagnostic } from '../diagnostics'

/* -----------------------------------------------------------------------------
   The board, building a post sign-in policy (owner, 13 Oct 2026: "use the same
   sign-in builder for post sign-in as well … I don't want to add a new builder
   until needed").

   One board for both types. A post sign-in policy (`type: 'Session'`,
   post-sign-in.ts) is the same chain — the start node, the rules with their
   Who / If / Then, and "Nothing else matched" — with three differences, all
   decided here so the components only ask one question ("is this the post
   sign-in board?"):

   - THEN is one of five actions (`Rule.action`), not a decision and factors.
   - IF offers the post sign-in conditions (`phase: 'post'` in the catalogue)
     and the shared ones, never the sign-in-only ones.
   - The start node says where events come from: the applications linked to
     the policy, from OUTSIDE it (an application's Post sign-in tab), read only.

   Everything that runs a sign-in through the engine — Check access, Past
   sign-ins, Describe it, the template chooser, the checks before saving — is
   left out for this type: there is no sign-in for it to read.

   Pure, apart from the context: no store, no DOM.
   -------------------------------------------------------------------------- */

/* Why a post sign-in policy cannot be turned on, and the card it is about:
   a rule by id, or the last row ('fallback'). Said under that card's Then in
   the panel, and the card is marked, once a save or a Turn on was refused —
   never as a disabled button (26 Sep 2026). */
export interface Refusal {
  at: string
  text: string
}

export interface PostBoard {
  /** This board is building a post sign-in policy. */
  on: boolean
  /** A refused Turn on or save, while it still stands: what is left, and where. */
  refusal: Refusal | null
}

/* Read by the canvas, the cards and the panel; provided by the builder.
   Absent — every other surface that draws a card — it is a sign-in board. */
export const PostBoardContext = createContext<PostBoard>({ on: false, refusal: null })
export const usePostBoard = (): PostBoard => useContext(PostBoardContext)

/** What is left before it can be turned on, at the card it is about; null when nothing is. */
export function issueTarget(p: Pick<Policy, 'rules' | 'fallback'>): Refusal | null {
  const text = turnOnIssue(p)
  if (!text) return null
  const open = p.rules.find((r) => r.enabled && !r.action)
  return { at: open ? open.id : 'fallback', text }
}

/* The tone each action wears on the card, the chip and its option card: the
   three the board already has. Step up lets the event through after a second
   factor, as `2fa` lets a sign-in through; the three that stop something are
   the deny tone. */
export const POST_TONE: Record<PostAction, 'allow' | 'mfa' | 'deny'> = {
  allow: 'allow',
  deny: 'deny',
  'step-up': 'mfa',
  terminate: 'deny',
  'block-device': 'deny',
}

/** A rule's tone on a post sign-in board: its action's, or none while it has no action. */
export const postTone = (action: PostAction | undefined): 'allow' | 'mfa' | 'deny' | 'none' => (action ? POST_TONE[action] : 'none')

/* The linter's findings that read a rule as a SIGN-IN: shadowing and
   reachability (worked out from what each rule decides), the factor settings,
   a hook's effect on a sign-in's speed and outcome, and who a rule matches
   today. A post sign-in rule has no decision or factors, so these would be
   about fields it never reads. The structural ones stay: an empty branch, a
   condition with no value, a zone, profile or hook that no longer exists,
   people in a condition, an empty name, a rule switched off, an audience of
   nobody. */
export const SIGN_IN_FINDINGS: readonly string[] = ['PE101', 'PE102', 'PE103', 'PE104', 'PE120', 'PE121', 'PE122', 'PE123', 'PE131', 'PE132', 'PE133', 'PE141']

export const postFindings = (diags: readonly Diagnostic[]): Diagnostic[] => diags.filter((d) => !SIGN_IN_FINDINGS.includes(d.code))

/* What a save stores, for a post sign-in policy. The board's sign-in rule
   (`committed`, policy-draft.ts) with one difference: having no application is
   no reason to stay a draft — the policy is independent of them (owner, 13 Oct
   2026), so a draft saved complete becomes a policy that is off, as a sign-in
   one does, linked or not. Saved with a rule or the last row still without an
   action, it stays a draft (`settledPostSignIn`): unfinished means draft. */
export function committedPost(saved: Policy, draft: Policy, intent: CommitIntent = 'keep-off'): Policy {
  const base = published({ ...draft, status: saved.status })
  const next = saved.status === 'draft' ? { ...base, status: intent === 'turn-on' ? ('active' as const) : ('inactive' as const) } : base
  return settledPostSignIn(next)
}

/* A save the board refuses: one that would take a live policy back to draft
   because a rule or the last row has no action. The admin chooses it, or
   keeps the edit as a saved draft; the policy stays on as it was. A draft is
   never refused — it saves as a draft. */
export const saveRefused = (saved: Pick<Policy, 'status'>, draft: Pick<Policy, 'rules' | 'fallback'>): Refusal | null =>
  saved.status === 'draft' ? null : issueTarget(draft)

/** The applications linked to the policy, in link order, that the tenant still has. */
export function linkedAppsOf(p: Pick<Policy, 'session'>, apps: readonly App[]): App[] {
  return setupOf(p)
    .links.map((l) => apps.find((a) => a.id === l.appId))
    .filter((a): a is App => a !== undefined)
}

/** Each linked application with the names of its events, for the start node's pane. */
export function linkedRows(p: Pick<Policy, 'session'>, apps: readonly App[]): { appId: string; name: string; events: string[] }[] {
  return setupOf(p).links.map((l) => ({
    appId: l.appId,
    name: apps.find((a) => a.id === l.appId)?.name ?? l.appId,
    events: l.eventIds.map((id) => eventById(l.appId, id)?.name ?? id),
  }))
}

/** The board's own view of the policy it holds. */
export const postBoardOf = (p: Pick<Policy, 'type'>, refusal: Refusal | null = null): PostBoard => ({ on: isPostSignIn(p), refusal: isPostSignIn(p) ? refusal : null })
