import { conditionType, FALLBACK_NAME, type AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import type { FormField } from '../../testing/sign-in-form'
import type { Via } from '../conflicts'
import { policyPhase, type EngineRun } from '../engine-run'
import { traceResult, type TraceResult } from '../journey'
import type { RowFact } from './shared/sign-in-row'

/* -----------------------------------------------------------------------------
   Classic v2's words and timing (ClassicV2Layout.tsx), PURE — so they are pinned
   without drawing them (classic2-layout.test.tsx), and the .tsx exports its
   component only.

     arrivals(plan)            the step each of the four cards arrives at
     cardsAt(plan, s)          the cards on screen at step s, top to bottom
     workingOn(plan, s)        the card the engine is still working on, or null
     foldOpen(cards, …)        which cards are open: as reached while it plays, folded once it lands
     chainCardOf(target)       the card an answer points at, where the chain has a questions panel beside it
     factRows(facts)           the sign-in card's `if`: each stated fact as a condition row
     policyRows(plan, s, …)    the policy card's rows: one line a policy
     policySections(rows)      the policy card's body: applies / also covers / skipped / not reached
     ruleShown(plan, s, …)     the rule card 3 draws: the one being read, then the one that passed
     passedOver(plan, i, s)    the rules read before it that did not pass: one quiet line
     outcomeView(plan, …)      the outcome card: the decision, Decided by, the factors
     signInHead · policyHead · ruleHead · outcomeHead
                               each card's head, as the Overview's nodes: kicker, what was selected, one meta line
     signsIn(facts)            the sign-in node's count and its tip, where a page says the sign-in in the first node
     ROW_CARD · ROW_START      the chain's widths laid across the canvas
   -------------------------------------------------------------------------- */

/** The four cards, top to bottom (owner, 5 Oct 2026: "one for the user form, one for the policy selection, one for the rules that passes and one for the outcome"). */
export type CardKey = 'sign-in' | 'policy' | 'rule' | 'outcome'
export const CARDS: readonly CardKey[] = ['sign-in', 'policy', 'rule', 'outcome']

/* THE ROW (owner, 5 Oct 2026, of Focus's Horizontal view: "the cards themselves should convert … just 4 simple cards
   will be enough"): the chain laid across the canvas — the sign-in node, then its cards left to right — at these
   widths, so the node, three cards, their 32 px connectors and the row's 12 px edges (1180 at most) stand at zoom 1 on
   a 1280 × 800 canvas with the questions panel shut (measured: 1184 of room there), and the stage's fit zooms them no
   lower than 0.85 at 1440 with it open (1024 of room). A card's head lays out for the narrower width (classic2.css):
   what was selected wraps to two lines rather than being cut. The first node wraps its words at ROW_START rather than
   growing past it: who signs in to what on its first line, the count and its two buttons on the second. */
export const ROW_CARD = 240
export const ROW_START = 340

/** Never: a card an empty plan does not draw. */
const NEVER = Number.POSITIVE_INFINITY

/* The step each card arrives at, as the engine reaches it: the sign-in at once,
   the policy as the engine starts finding one, the rule as it opens the one
   that applies, the outcome as the answer lands. No policy applies: the rule
   card arrives with the answer and says so. An empty plan (nobody, or no
   application) draws the sign-in alone. */
export function arrivals(plan: Pick<EngineRun, 'empty' | 'decider' | 'at'>): Record<CardKey, number> {
  if (plan.empty) return { 'sign-in': 0, policy: NEVER, rule: NEVER, outcome: NEVER }
  const { at } = plan
  const outcome = at.outcome >= 0 ? at.outcome : at.done
  const rule = plan.decider && at.expand >= 0 ? at.expand : outcome
  return { 'sign-in': 0, policy: Math.max(0, at.which), rule, outcome }
}

/** The cards on screen at step `s`, top to bottom. */
export function cardsAt(plan: Pick<EngineRun, 'empty' | 'decider' | 'at'>, s: number): CardKey[] {
  const at = arrivals(plan)
  return CARDS.filter((k) => s >= at[k])
}

/* The card the engine is still at work on — its head turns the builder's
   spinner: the policy while it finds the one that applies, the rule while it
   reads them. The sign-in is stated, and the outcome lands done. */
export function workingOn(plan: Pick<EngineRun, 'empty' | 'decider' | 'at' | 'steps'>, s: number): CardKey | null {
  if (plan.empty) return null
  const { at } = plan
  if (s >= at.which && at.decides >= 0 && s < at.decides) return 'policy'
  const deciding = plan.steps.findIndex((k) => k.kind === 'deciding')
  const until = deciding >= 0 ? deciding : at.outcome
  if (plan.decider && at.expand >= 0 && s >= at.expand && s < until) return 'rule'
  return null
}

// --- The fold ---------------------------------------------------------------------------------

/* Which cards are open (owner, 5 Oct 2026: "by default, all cards should be
   collapsed when we reach the last outcome so the user can read easily, like
   we have in the policy build"): while the run plays, each card is open as the
   engine reaches it, so the admin sees it work; once it lands, every one
   folds to its head and the chain reads as a four-line summary. What the admin
   opened or folded by hand (`hand`) stands until the next run. */
export function foldOpen(cards: readonly CardKey[], landed: boolean, hand: Partial<Record<CardKey, boolean>> = {}): Record<CardKey, boolean> {
  const open: Record<CardKey, boolean> = { 'sign-in': false, policy: false, rule: false, outcome: false }
  for (const k of cards) open[k] = hand[k] ?? !landed
  return open
}

/** The dock's one button, the builder's: it says what it will do — "Collapse all" while any card is open, "Expand all" once all are folded. */
export const foldAllWord = (anyOpen: boolean): 'Collapse all' | 'Expand all' => (anyOpen ? 'Collapse all' : 'Expand all')

/* The card an answer points at (assistant/intents.ts `Target`: 'person', 'policy:<id>', 'rule:<id>',
   'check:<ruleId>:<category>', 'outcome', 'screens'), where the chain is drawn inside a view that has a questions panel
   (Focus's Vertical): the person is the sign-in, any policy the policies card, any rule the rule card — its body says
   the rules it passed over too — and the outcome or what they see the outcome. Null for anything else. */
export function chainCardOf(target: string | null | undefined): CardKey | null {
  if (!target) return null
  if (target === 'person') return 'sign-in'
  if (target === 'outcome' || target === 'screens') return 'outcome'
  if (target.startsWith('policy:')) return 'policy'
  if (target.startsWith('rule:') || target.startsWith('check:')) return 'rule'
  return null
}

// --- The sign-in ------------------------------------------------------------------------------

/** A stated fact of the sign-in, as the builder draws a condition row: "[globe] Network zone · is · Office network". */
export interface FactRow {
  field: FormField
  /** The condition's own label (data.ts catalogue): "Network zone", "Device profile". */
  attr: string
  /** Always "is": a sign-in states what it is; the rules say what they want of it. */
  op: 'is'
  /** "Office network", "Windows 11 laptop · registered". */
  value: string
  /** The condition its rules read it with (board/tones.ts), for its mark and family colour: a network is a zone's globe. */
  cond: 'zone' | 'fingerprint' | 'time' | 'device-risk'
}

const FACT_COND: Partial<Record<FormField, FactRow['cond']>> = { address: 'zone', place: 'zone', device: 'fingerprint', when: 'time', risk: 'device-risk' }
/* A place is a zone's other half — where on the map, not where on the network — so it wears the zone's globe under the half's own word (a condition "by location only"). */
const FACT_ATTR: Partial<Record<FormField, string>> = { place: 'Location' }

/* What was stated, in form order — the sign-in row's facts (shared/sign-in-row.ts
   `rowFacts`), stated ones only: a fact the rules read and nobody stated is the
   form's to ask for, not the card's to list ("only cover the basics"). Assumed
   on is how the run was asked, not a fact of the sign-in. The application is
   the start pill's, and not said again here. */
export function factRows(facts: readonly RowFact[]): FactRow[] {
  return facts.flatMap((f) => {
    const cond = FACT_COND[f.field]
    if (!f.stated || !cond) return []
    const value = f.field === 'risk' ? f.value.replace(/^Risk /, '') : f.value
    return [{ field: f.field, attr: FACT_ATTR[f.field] ?? conditionType(cond).label, op: 'is' as const, value, cond }]
  })
}

// --- The policies ----------------------------------------------------------------------------

/*   waiting   the engine has not asked it yet: its name, quiet
     working   being asked: the builder's spinner where its answer will be
     applies   the one that decides: ✓, and "via Engineering" when a group lets them in
     also      a later one that also covers the person, not used: in the notice tone when it would answer otherwise
     other     its own reason: "Not reached", "Not in this policy", "Switched off" */
export type PolicyStanding = 'waiting' | 'working' | 'applies' | 'also' | 'other'

export interface PolicyRow {
  id: string
  /** 1-based: where the engine asks it. */
  order: number
  name: string
  standing: PolicyStanding
  /** It would give this person another answer: amber, not grey. Only on `also`. */
  conflict: boolean
  /** What the row says at its right end; '' while waiting or working. */
  words: string
  /** How the one that applies lets this person in: "via Engineering"; '' otherwise. */
  via: string
}

export const ALSO_WORDS = 'Also covers · not used'
export const NOT_REACHED = 'Not reached'

/* A policy the person is not in says so without their name ("Maya Iyer is not in it"): the sign-in card above names
   them once, and three rows of it was the name three times. */
const plainReason = (reason: string): string => (/ is not in (it|this policy)$/.test(reason) ? 'Not in this policy' : reason)

/** One line a policy, in the order the engine asks them, as they stand at step `s`. `via` is how the one that decides lets this person in (conflicts.ts `audienceViaOf`). */
export function policyRows(plan: Pick<EngineRun, 'policies' | 'conflicts'>, s: number, via: Via | null = null): PolicyRow[] {
  const also = new Map((plan.conflicts?.policies ?? []).map((c) => [c.policyId, c]))
  return plan.policies.map((p) => {
    const base = { id: p.policyId, order: p.order, name: p.name, conflict: false, via: '' }
    const phase = policyPhase(p, s)
    if (phase !== 'settled') return { ...base, standing: phase, words: '' }
    if (p.decides) {
      const by = viaWords(via)
      return { ...base, standing: 'applies', via: by, words: by ? `Applies · ${by}` : 'Applies' }
    }
    const c = also.get(p.policyId)
    /* A group's policy before Everyone's is by design: covered, not a conflict. */
    if (c) return { ...base, standing: 'also', conflict: c.decisionDiffers && c.standing !== 'default-group-yields', words: ALSO_WORDS }
    return { ...base, standing: 'other', words: plainReason(p.reason) || NOT_REACHED }
  })
}

/** How the one that decides lets this person in, as its row and its head say it: "via Engineering"; '' for everyone. */
export const viaWords = (via: Via | null): string => (via?.matches && (via.kind === 'groups' || via.kind === 'person') ? via.say : '')

/* The policy card's body, in the builder's section-and-line pattern: a lowercase
   keyword with its mark, and under it, on the guide, one quiet line a policy —
   its number, its name, and only what is news about it:

     skipped       asked before the one that applies, and passed over: its reason
     checking      while the engine is still asking: the spinner on the one it is on
     applies       the one that applies: "via Engineering", and its ✓
     also covers   a later one that also covers them: "not used", amber where it would answer otherwise
     not reached   the rest, quiet */
export type PolicySectionKey = 'skipped' | 'checking' | 'applies' | 'also' | 'not-reached'

export interface PolicySection {
  key: PolicySectionKey
  /** The keyword: "applies", "also covers". */
  kw: string
  rows: (PolicyRow & { say: string })[]
}

const SECTION_KW: Record<PolicySectionKey, string> = { skipped: 'skipped', checking: 'checking', applies: 'applies', also: 'also covers', 'not-reached': 'not reached' }
const SECTION_ORDER: readonly PolicySectionKey[] = ['skipped', 'checking', 'applies', 'also', 'not-reached']

export function policySections(rows: readonly PolicyRow[]): PolicySection[] {
  const keyOf = (r: PolicyRow): PolicySectionKey =>
    r.standing === 'waiting' || r.standing === 'working' ? 'checking' : r.standing === 'applies' ? 'applies' : r.standing === 'also' ? 'also' : r.words === NOT_REACHED ? 'not-reached' : 'skipped'
  /* The keyword says what the row's words said, so a row says only the rest. */
  const sayOf = (r: PolicyRow, k: PolicySectionKey): string => (k === 'skipped' ? r.words : k === 'also' ? 'not used' : k === 'applies' ? r.via : '')
  return SECTION_ORDER.flatMap((key) => {
    const mine = rows.filter((r) => keyOf(r) === key)
    return mine.length > 0 ? [{ key, kw: SECTION_KW[key], rows: mine.map((r) => ({ ...r, say: sayOf(r, key) })) }] : []
  })
}

// --- The rule ---------------------------------------------------------------------------------

/* The rule card 3 draws — ONE rule, a top-level card on the chain (owner, 5 Oct
   2026: "they want the same cards … focus on the cards and the vertical flow
   only"): while the engine reads, the rule it is on, its rows marked as they
   are read; once the walk has settled, the rule it landed on — the one that
   passed, or the policy's last row when none did. A rule that did not pass is
   never a card: it is a word in the line `passedOver` makes. Null: no policy
   decides, so no rule is read. */
export function ruleShown(plan: Pick<EngineRun, 'rules' | 'landing' | 'decider'>, s: number, settled: boolean): number | null {
  if (!plan.decider || plan.rules.length === 0) return null
  if (settled && plan.landing !== null) return plan.landing
  let on: number | null = null
  plan.rules.forEach((r, i) => {
    if (r.visited && r.startAt >= 0 && s >= r.startAt) on = i
  })
  if (on !== null) return on
  const first = plan.rules.findIndex((r) => r.visited)
  return first >= 0 ? first : (plan.landing ?? 0)
}

/** A rule read before the one card 3 draws, that did not pass: its number, and the row that ended it. */
export interface PassedRule {
  n: number
  /** "Who", "Network", "Device": the check that failed — or, when it could not be told, the one that could not. */
  word: string
  state: 'no-match' | 'unknown'
}

/* The rules the engine read and moved past, at step `s` — only those that were
   read and did not pass: "Rule 3 and Nothing else matched not reached" is not
   news. A rule that could not be told (the answer Depends) is one of them. */
export function passedOver(plan: Pick<EngineRun, 'rules'>, shown: number | null, s: number): PassedRule[] {
  if (shown === null) return []
  return plan.rules.flatMap((r, i): PassedRule[] => {
    if (i >= shown || r.index === null) return []
    const t = traceResult(r, s)
    if (t === 'missed' || t === 'folded') return [{ n: r.index + 1, word: r.failing !== null ? (r.checks[r.failing]?.word ?? '') : '', state: 'no-match' }]
    if (t === 'unknown') return [{ n: r.index + 1, word: r.checks.find((c) => c.status === 'unknown')?.word ?? '', state: 'unknown' }]
    return []
  })
}

const listed = (ns: readonly number[]): string => (ns.length < 2 ? ns.join('') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`)

/* The one quiet line under the rule's title: "Rule 1 not matched · Who"; two or
   more, "Rules 1 and 2 not matched · Device, Who" with each rule's own check on
   its title; "Rule 3 can’t tell · Device" for one that could not be told. */
export function passedLine(rules: readonly PassedRule[]): { state: PassedRule['state']; said: string; full: string }[] {
  return (['no-match', 'unknown'] as const).flatMap((state) => {
    const mine = rules.filter((r) => r.state === state)
    if (mine.length === 0) return []
    const verb = state === 'no-match' ? 'not matched' : 'can’t tell'
    const words = [...new Set(mine.map((r) => r.word).filter(Boolean))].join(', ')
    const head = mine.length === 1 ? `Rule ${mine[0].n} ${verb}` : `Rules ${listed(mine.map((r) => r.n))} ${verb}`
    return [{ state, said: words ? `${head} · ${words}` : head, full: mine.map((r) => `Rule ${r.n}${r.word ? ` · ${r.word}` : ''}`).join(', ') }]
  })
}

// --- The outcome -----------------------------------------------------------------------------

export type OutcomeTone = 'allow' | 'mfa' | 'deny' | 'depends' | 'none'

export interface OutcomeView {
  tone: OutcomeTone
  /** The decision itself, for the builder's decision chip; null when it depends or none decides. */
  decision: AccessDecision | null
  /** "Allow on 1 factor", "Allow with 2FA", "Deny", "Depends", or what is missing. */
  title: string
  /** "Decided by AWS for engineering teams · Rule 2"; '' when no policy decides. */
  by: string
  /** The `decided by` link's words: "AWS for engineering teams · Rule 2". */
  link: string
  /** Where Decided by opens: the rule that decided — or, when it depends, the policy (`ruleId` null). */
  open: { policyId: string; ruleId: string | null } | null
  /** What the person is asked for, in order: "Password", "Google Authenticator". None on a Deny. */
  factors: string[]
  /** A Deny's message, as the person reads it; null otherwise. */
  message: string | null
  /** When it depends: each answer it could be, "If rule 1 matches" … "If not". */
  outcomes: { label: string; decision: AccessDecision }[]
  /** When it depends, what was not stated: "Device". */
  needs: string[]
}

const TONE_OF: Record<AccessDecision, OutcomeTone> = { '1fa': 'allow', '2fa': 'mfa', deny: 'deny' }

/* The answer, and nothing more (owner, 5 Oct 2026: "as basic as you can"):
   the decision in its colour, Decided by the policy and the rule — Rule 2, or
   Nothing else matched — and the factors asked for, from the pages the person
   would get (screens-of.ts), or the Deny's message. When it depends: each
   answer it could be. No policy decides: what is missing, plainly. */
export function outcomeView(plan: Pick<EngineRun, 'outcome' | 'landing' | 'rules'>, screens: readonly SignInScreens[]): OutcomeView {
  const o = plan.outcome
  const none: OutcomeView = { tone: 'none', decision: null, title: o.view.line || 'No policy decides', by: '', link: '', open: null, factors: [], message: null, outcomes: [], needs: [] }
  if (o.status === 'decided' && o.decision) {
    const landing = plan.landing !== null ? (plan.rules[plan.landing] ?? null) : null
    const rule = landing ? (landing.index !== null ? `Rule ${landing.index + 1}` : FALLBACK_NAME) : ''
    const steps = (screens.find((sc) => sc.decision === o.decision) ?? screens[0])?.steps ?? []
    const deny = steps.find((k) => k.kind === 'deny')
    const tone = TONE_OF[o.decision]
    const link = o.policyName ? [o.policyName, rule].filter(Boolean).join(' · ') : ''
    return {
      tone,
      decision: o.decision,
      title: DECISION_WORDS[o.decision],
      by: link ? `Decided by ${link}` : '',
      link,
      open: o.policyId && landing ? { policyId: o.policyId, ruleId: landing.id } : null,
      factors: o.decision === 'deny' ? [] : steps.filter((k) => k.kind !== 'deny').map(stepLabel),
      message: o.decision === 'deny' && deny?.kind === 'deny' ? deny.message : null,
      outcomes: [],
      needs: [],
    }
  }
  if (o.status === 'depends') {
    return { ...none, tone: 'depends', title: 'Depends', by: o.by, link: o.policyName ?? '', open: o.policyId ? { policyId: o.policyId, ruleId: null } : null, outcomes: o.view.outcomes, needs: o.view.needs }
  }
  return none
}

// --- The heads -----------------------------------------------------------------------------------

/* Each card's head says what was SELECTED, as the Overview's four nodes do
   (owner, 5 Oct 2026, pointing at Focus's Overview route: "instead of naming
   the node, showcase the selected thing there so the user can easily read
   and go through in collapsed mode"). Three lines in the builder's head, its
   tile before them (the Overview's far face, focus-far.tsx):

     kicker   the step, small and grey: "Sign-in", "Policies", "Rule 2 of 3", "Outcome"
     title    what was chosen: "Maya Iyer → AWS Console", "AWS for engineering teams",
              "Engineers on a compliant device", "Allow on 1 factor"
     meta     one line, its mark first: "2 sign-in conditions", "✓ Policy 1 of 4 applies ·
              via Engineering", "✓ Matches · Then Allow on 1 factor", "Decided by Rule 2"

   No status pill: the meta line carries the state with its ✓ / ✕, as the
   Overview does. Folded, the chain reads as these four heads. */

/** The meta line's colour: the Overview's line tones, and `decision` — the rule's own answer, in its card's tone. */
export type MetaTone = 'ok' | 'bad' | 'warn' | 'work' | 'quiet' | 'plain' | 'decision'
/** What leads the meta line: ✓ ✕ ? –, the builder's spinner, or nothing. */
export type MetaMark = 'check' | 'cross' | 'help' | 'dash' | 'spin' | null

export interface HeadMeta {
  tone: MetaTone
  mark: MetaMark
  text: string
  /** After the words, in the decision's colour: "Then Allow on 1 factor". */
  then?: AccessDecision
}

export interface CardHead {
  kicker: string
  title: string
  meta: HeadMeta | null
}

/** The meta line as words, its decision included: what the tests and a card's name read. */
export const metaWords = (m: HeadMeta | null): string => (m ? `${m.text}${m.then ? DECISION_WORDS[m.then] : ''}` : '')

/** "2 sign-in conditions", "1 sign-in condition", "No sign-in conditions". */
export const conditionsWord = (n: number): string => (n === 0 ? 'No sign-in conditions' : n === 1 ? '1 sign-in condition' : `${n} sign-in conditions`)

/* The sign-in: who, to which application — "Maya Iyer → AWS Console",
   "Anyone in Finance → AWS Console" — and how many conditions it states; the
   body lists them. `to` is the application, drawn with its logo after the
   arrow; null before one is chosen. */
export function signInHead(who: string, appName: string | null, stated: number): CardHead & { to: string | null } {
  return { kicker: 'Sign-in', title: who, to: appName, meta: { tone: 'plain', mark: null, text: conditionsWord(stated) } }
}

/* The sign-in said in the chain's first node, where a page has no sign-in card (owner, 5 Oct 2026: "the first
   pill-shaped node should be the node as we have in the top, so we can showcase 'Maya Iyer signs in at AWS with 2
   sign-in conditions'"): "Maya Iyer signs in to AWS Console · 2 sign-in conditions" — "Anyone in Finance signs in
   to …" for a group — and with nothing stated, nothing after the application. `said` is what the count's tip lists, in
   the form's order: "Office network · Windows 11 laptop · registered". */
export function signsIn(facts: readonly FactRow[]): { count: string; said: string } {
  return { count: facts.length === 0 ? '' : conditionsWord(facts.length), said: facts.map((f) => f.value).join(' · ') }
}

/* The policies: the one that applies, and where it stands among the
   application's — "✓ Policy 1 of 4 applies · via Engineering". While the
   engine still asks them in order, the builder's spinner. The tenant's default
   taking a sign-in none of the application's own policies covers: "No policy
   covers Maya Iyer", and plainly which one does. */
export function policyHead(
  plan: Pick<EngineRun, 'policies' | 'decider' | 'appName'>,
  s: number,
  who: string,
  via: Via | null = null,
): CardHead & { kind: 'finding' | 'applies' | 'default' | 'none' } {
  const row = plan.policies.find((p) => p.decides) ?? null
  const covers = `No policy covers ${who}`
  if (!plan.decider) return { kind: 'none', kicker: 'Policies', title: covers, meta: { tone: 'plain', mark: null, text: 'No policy decides' } }
  if (row && policyPhase(row, s) !== 'settled') return { kind: 'finding', kicker: 'Policies', title: `On ${plan.appName}`, meta: { tone: 'work', mark: 'spin', text: 'Reading in order' } }
  if (plan.decider.isGlobalDefault) return { kind: 'default', kicker: 'Policies', title: covers, meta: { tone: 'plain', mark: null, text: `${plan.decider.name} applies` } }
  const by = viaWords(via)
  const of = `Policy ${row?.order ?? 1} of ${plan.policies.length} applies`
  return { kind: 'applies', kicker: 'Policies', title: plan.decider.name, meta: { tone: 'ok', mark: 'check', text: by ? `${of} · ${by}` : of } }
}

/** A rule's meta line, from what the engine has made of it at step `s`. */
function ruleMeta(r: EngineRun['rules'][number], state: TraceResult): HeadMeta {
  switch (state) {
    case 'matched':
      return { tone: 'decision', mark: 'check', text: 'Matches · Then ', then: r.decision }
    case 'missed':
    case 'folded': {
      const word = r.failing !== null ? (r.checks[r.failing]?.word ?? '') : ''
      return { tone: 'bad', mark: 'cross', text: word ? `Not matched · ${word}` : 'Not matched' }
    }
    case 'unknown': {
      const word = r.checks.find((c) => c.status === 'unknown')?.word ?? ''
      return { tone: 'warn', mark: 'help', text: word ? `Can’t tell · ${word} not stated` : 'Can’t tell' }
    }
    case 'possible':
      return { tone: 'warn', mark: 'help', text: 'If not · Then ', then: r.decision }
    case 'off':
      return { tone: 'quiet', mark: 'dash', text: 'Switched off' }
    case 'not-reached':
      return { tone: 'quiet', mark: 'dash', text: 'Not reached' }
    default:
      return { tone: 'work', mark: 'spin', text: 'Reading' }
  }
}

/* The rule card 3 draws: "Rule 2 of 3" ("Last rule" for the last row), its
   name, and what it came to — "✓ Matches · Then Allow on 1 factor" in the
   answer's colour; the spinner while it is read; "✕ Not matched · Who" for a
   rule read and failed, on screen only while the engine moves past it. No
   policy decides: "No rule". */
export function ruleHead(plan: Pick<EngineRun, 'rules'>, i: number | null, s: number): CardHead & { n: number | null; terminal: boolean; state: TraceResult | null } {
  const r = i !== null ? (plan.rules[i] ?? null) : null
  if (!r) return { kicker: 'Rules', title: 'No rule', meta: { tone: 'quiet', mark: 'dash', text: 'No policy decides' }, n: null, terminal: false, state: null }
  const terminal = r.index === null
  const n = r.index === null ? null : r.index + 1
  const count = plan.rules.filter((x) => x.index !== null).length
  const state = traceResult(r, s)
  return {
    kicker: n === null ? 'Last rule' : `Rule ${n} of ${count}`,
    title: terminal ? FALLBACK_NAME : r.name.trim() || 'Untitled rule',
    meta: ruleMeta(r, state),
    n,
    terminal,
    state,
  }
}

/* The outcome: the decision in its colour, and which rule decided it —
   "Decided by Rule 2", "Decided by the last rule". When it depends, what was
   not stated ("Device not stated"); its body has each answer it could be. */
export function outcomeHead(plan: Pick<EngineRun, 'landing' | 'rules'>, view: OutcomeView): CardHead {
  const landing = plan.landing !== null ? (plan.rules[plan.landing] ?? null) : null
  const plain = (text: string): HeadMeta | null => (text ? { tone: 'plain', mark: null, text } : null)
  const by =
    view.tone === 'depends'
      ? view.needs.length > 0
        ? `${view.needs.join(', ')} not stated`
        : view.link && `Decided by ${view.link}`
      : view.decision && landing
        ? landing.index === null
          ? 'Decided by the last rule'
          : `Decided by Rule ${landing.index + 1}`
        : view.link && `Decided by ${view.link}`
  return { kicker: 'Outcome', title: view.title, meta: plain(by) }
}
