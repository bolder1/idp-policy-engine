import { card, cond, fallbackRule, rule, when as whenOf, type AccessDecision, type Condition, type ConditionCard, type Policy, type Predicate, type Rule, type RuleWho } from '../../data'
import { DECISION_WORDS } from '../../decision-words'
import {
  ckeyOf,
  compose,
  emptyAnswers,
  negatedCond,
  outcomeFields,
  rankCompare,
  rankOf,
  type Answer,
  type DescribeAnswers,
  type DeviceAnswer,
  type RiskAnswer,
  type WhereAnswer,
  type DescribeTenant,
  type Outcome,
  type RuleIds,
} from '../../create/describe-model'
import { normaliseWho, whoContains, whoKey } from '../../rule-who'
import { patchRule } from './model'
import { appParts, condWords, lastRowReached, ruleName, saidLines, sameSet, text, whoParts, type SaidBoard, type SaidLine, type SaidPart, type SaidTenant } from './describe-said'

export { lastRowReached, sameSet }

/* -----------------------------------------------------------------------------
   Guided setup's model (docs/specs/GUIDED-SETUP.md, 19 Oct 2026). Pure: the
   panel (GuidedSetup.tsx) draws from it, the board (BoardBuilder.tsx) writes
   what it plans, and guided-setup.test.ts holds it.

   ANSWERS FIRST, NO READER. A New rule form builds `DescribeAnswers` with
   origin `picked` and composes them with the describer's own `compose`, through
   its two opt-in options: `catchAll: 'card'` (Everyone with no condition is a
   card named "Everyone", last among the rules) and `only: 'per-rule'` ("Only
   from India" writes the rule and its refusal — the same people outside India,
   Deny). Each Add rule is a NEW rule with its own who, never pooled with
   another's; a quick action patches the selected rule in place; Deny at high
   risk is its own Deny rule for the same people.

   EVERY ACTION IS ONE ORDINARY BOARD EDIT, planned here from the board as it
   stands and written by the board as one history entry on the canvas beat —
   unsaved until Save policy, like any edit by hand. The audience is never
   written (Who belongs to rules, 14 Oct 2026); applications go through the
   start node's own path (the board runs it).

   ORDER. A new rule goes where it cannot shadow or be shadowed: denies first,
   named people before everyone, more conditions first, the Everyone card last —
   and never below a rule that already decides every sign-in it would see, nor
   above one it would cover. A rule asking exactly what another asks changes
   that one's Then instead of standing under it, never reached. So no action
   here raises PE103 or PE104 on a board that had none.
   -------------------------------------------------------------------------- */

/* --- Where the panel stands ------------------------------------------------------------------- */

export type GuidedSide = 'left' | 'right' | 'beside'
export const GUIDED_SIDES: readonly { id: GuidedSide; label: string }[] = [
  { id: 'left', label: 'On the left' },
  { id: 'right', label: 'On the right' },
  { id: 'beside', label: 'Beside the rule panel' },
]
/** Remembered per viewer: a convenience, so every read and write is guarded and the left is the answer when it fails. */
export const GUIDED_SIDE_KEY = 'bb.guided.side'
export function readGuidedSide(): GuidedSide {
  try {
    const v = window.localStorage.getItem(GUIDED_SIDE_KEY)
    return v === 'right' || v === 'beside' ? v : 'left'
  } catch {
    return 'left'
  }
}
export function writeGuidedSide(side: GuidedSide): void {
  try {
    window.localStorage.setItem(GUIDED_SIDE_KEY, side)
  } catch {
    /* Private window, blocked storage: the choice lasts the visit. */
  }
}

/** Where it is offered: any App Access policy that is not the system policy — draft or live. */
export function guidedOffered(on: boolean, p: Pick<Policy, 'type' | 'isSystem'> | undefined): boolean {
  return on && !!p && p.type === 'App Access' && !p.isSystem
}

/* --- The actions ------------------------------------------------------------------------------- */

/** The New rule form's answers. One zone and one profile at most ("Only from", "Only on"). */
export interface NewRulePick {
  apps: string[]
  decision: AccessDecision
  /** Undefined: Everyone. */
  who?: RuleWho
  zoneId?: string
  profileId?: string
  denyHighRisk: boolean
}

export type GuidedAct =
  | { kind: 'add'; pick: NewRulePick }
  | { kind: 'decision'; ruleId: string; decision: AccessDecision }
  | { kind: 'only-zone'; ruleId: string; zoneId: string }
  | { kind: 'only-profile'; ruleId: string; profileId: string }
  | { kind: 'deny-risk'; ruleId: string }
  | { kind: 'who'; ruleId: string; who: RuleWho | undefined }
  | { kind: 'delete'; ruleId: string }
  | { kind: 'rest'; decision: AccessDecision }

/** A step line of the play: what it does while it works, and its label and what it found once done. */
export interface GuidedStep {
  key: string
  working: string
  label: string
  parts: SaidPart[]
  decision?: AccessDecision
}

/** What an action does, planned on the board as it stands; the board writes `rules` and `fallback` on the canvas beat. */
export interface GuidedPlan {
  rules: Rule[]
  fallback: Rule | undefined
  appIds: string[]
  steps: GuidedStep[]
  lines: SaidLine[]
  /** The rule to select once it lands: the rule added or changed. */
  focus: string | null
  /** Whether the rules or the last row change at all. */
  changed: boolean
}

/** One action as the panel's log keeps it. */
export interface GuidedEntry {
  id: number
  act: GuidedAct
  plan: GuidedPlan
  /** The board the plan was made on, by reference: a board that moved before the canvas beat is planned again. */
  base: Policy
  /** The present the write left, by reference — null while it is held. Undo is offered while it is still the present. */
  after: Policy | null
  /** Whether the write made a history entry (an action that changed no rule makes none). */
  wrote: boolean
  /** The applications the board showed before the action. */
  appsBefore: string[]
  /** Saved with the policy while it was in force: on the stored policy now, whatever the history says. */
  kept?: boolean
}

export interface GuidedCutoffs {
  highAbove: number
}

/* --- Answers from the form ---------------------------------------------------------------------- */

export const outcomeOf = (decision: AccessDecision): Outcome => ({ decision, method: null, message: null })
const picked = <T>(value: T): Answer<T> => ({ value, origin: 'picked', spans: [] })
const said = (phrase: string) => ({ start: 0, end: 0, phrase })

/** The form's picks as the describer's answers, every one `picked`: nothing is read, so nothing is asked. */
export function answersOfPick(p: NewRulePick, cut: GuidedCutoffs): DescribeAnswers {
  const a = emptyAnswers()
  const who = normaliseWho(p.who)
  a.apps = picked([...p.apps])
  a.who = picked<RuleWho | 'everyone'>(who && who.groupIds.length + who.userIds.length > 0 ? who : 'everyone')
  a.signIn = { match: picked(outcomeOf(p.decision)) }
  if (p.zoneId) a.where = picked<WhereAnswer>({ mode: 'only', zoneId: p.zoneId, scope: 'both' })
  if (p.profileId) a.devices = picked<DeviceAnswer>({ mode: 'only', profileId: p.profileId })
  /* "Only" keeps an Allow to its zone or profile. A Deny has nothing to keep: the zone or profile is simply where it
     denies ("blocked in India"), never a second Deny for everywhere else. */
  if ((p.zoneId || p.profileId) && p.decision !== 'deny') a.only = said('only')
  if (p.denyHighRisk)
    a.more = [
      {
        where: { value: { mode: 'anywhere' }, origin: 'default', spans: [] },
        devices: { value: { mode: 'any' }, origin: 'default', spans: [] },
        when: { value: { mode: 'any' }, origin: 'default', spans: [] },
        risk: picked<RiskAnswer>({ mode: 'above', score: cut.highAbove }),
        outcome: picked(outcomeOf('deny')),
        span: said('deny at high risk'),
      },
    ]
  return a
}

/* --- Order ---------------------------------------------------------------------------------------- */

const cardKeys = (k: ConditionCard) => k.conditions.map(ckeyOf).sort()
const plainCards = (p: Predicate) => p.join !== 'and' && p.cards.every((k) => k.join !== 'or')
/** Who a rule is for and what it asks, by value: two rules with one scope decide the same sign-ins. */
export const scopeOf = (r: Pick<Rule, 'who' | 'when'>): string => `${whoKey(r.who)}#${r.when.cards.map((k) => cardKeys(k).join('&')).sort().join('|')}`

/* Does `a` decide every sign-in `b` would? Sound, not complete — said only when certain: `a`'s people include `b`'s,
   and every alternative of `b` asks at least what one of `a`'s asks. */
export function covers(a: Pick<Rule, 'who' | 'when' | 'enabled'>, b: Pick<Rule, 'who' | 'when'>): boolean {
  if (!a.enabled || !whoContains(a.who, b.who)) return false
  if (a.when.cards.length === 0) return true
  if (b.when.cards.length === 0 || !plainCards(a.when) || !plainCards(b.when)) return false
  return b.when.cards.every((bk) => {
    const has = cardKeys(bk)
    return a.when.cards.some((ak) => cardKeys(ak).every((c) => has.includes(c)))
  })
}

/* A rule into the chain: at its rank (`rankOf`), or at `keep` for a rule already there, moved only as far as it has to
   — above any rule that decides all it would see, below any rule it would decide all of. */
export function placeRule(rules: readonly Rule[], r: Rule, keep?: number): Rule[] {
  const out = [...rules]
  let lo = 0
  let hi = out.length
  out.forEach((x, i) => {
    if (covers(x, r)) hi = Math.min(hi, i)
    if (covers(r, x)) lo = Math.max(lo, i + 1)
  })
  let at = keep ?? out.findIndex((x) => rankCompare(rankOf(r), rankOf(x)) < 0)
  if (at < 0) at = out.length
  at = lo <= hi ? Math.min(Math.max(at, lo), hi) : hi
  out.splice(at, 0, r)
  return out
}

const thenFields = (r: Rule): Partial<Rule> => outcomeFields(outcomeOf(r.decision))

/** The enabled rule, other than `r` itself, that decides exactly the sign-ins `r` would: the same scope, or each deciding all of the other's. -1 when none does. */
export function twinOf(rules: readonly Rule[], r: Rule): number {
  return rules.findIndex((x) => x.id !== r.id && x.enabled && (scopeOf(x) === scopeOf(r) || (covers(x, r) && covers({ ...r, enabled: true }, x))))
}

/* A changed rule back into the chain (Change who, Only from, Only on): its twin, if it now has one, takes its Then and
   the changed rule goes — never two rules with one scope, one of them never reached (PE103, PE104). Otherwise it is
   placed from `at`, moved only as far as it must be. Returns the chain and the rule that now stands for it. */
function settle(rest: readonly Rule[], changed: Rule, at: number): { rules: Rule[]; id: string } {
  const twin = twinOf(rest, changed)
  if (twin >= 0) return { rules: rest.map((x, i) => (i === twin ? patchRule(x, thenFields(changed)) : x)), id: rest[twin].id }
  return { rules: placeRule(rest, changed, at), id: changed.id }
}

/* A rule a quick action adds for the selected rule's people (its refusal, Deny at high risk): directly above that rule,
   so it changes only sign-ins that reached it — never ones an earlier rule already decided. A twin takes its Then. */
function addAbove(rules: readonly Rule[], r: Rule, anchorId: string): Rule[] {
  const twin = twinOf(rules, r)
  if (twin >= 0) return rules.map((x, i) => (i === twin ? patchRule(x, thenFields(r)) : x))
  const at = rules.findIndex((x) => x.id === anchorId)
  return placeRule(rules, r, at < 0 ? undefined : at)
}

/* New rules into the chain, one by one: one asking exactly what an enabled rule asks changes that one's Then instead
   (its id and place kept); anything else is placed. Returns the chain and, for each rule given, the id it landed as. */
export function addRules(rules: readonly Rule[], added: readonly Rule[]): { rules: Rule[]; landed: string[] } {
  let out = [...rules]
  const landed: string[] = []
  for (const r of added) {
    const twin = twinOf(out, r)
    if (twin >= 0) {
      out = out.map((x, i) => (i === twin ? patchRule(x, thenFields(r)) : x))
      landed.push(out[twin].id)
      continue
    }
    out = placeRule(out, r)
    landed.push(r.id)
  }
  return { rules: out, landed }
}

/* --- Quick actions ------------------------------------------------------------------------------ */

const conds = (p: Predicate): Condition[] => p.cards.flatMap((k) => k.conditions)

/** A condition ANDed into every alternative of a predicate (a fresh id in each), or the one card when it had none. */
export function withCond(p: Predicate, make: () => Condition): Predicate {
  if (p.cards.length === 0) return whenOf(card(make()))
  return { ...p, cards: p.cards.map((k) => ({ ...k, conditions: [...k.conditions, make()] })) }
}

/** What the selected rule offers, past What happens, Change who and Delete. Only an Allow is narrowed by "only". */
export function quickActions(r: Rule, rules: readonly Rule[], t: Pick<DescribeTenant, 'zones' | 'fingerprints'>, cut: GuidedCutoffs) {
  const allow = r.decision !== 'deny'
  const has = (type: string) => conds(r.when).some((c) => c.typeId === type)
  const riskDeny = rules.some((x) => x.decision === 'deny' && whoKey(x.who) === whoKey(r.who) && conds(x.when).some((c) => c.typeId === 'device-risk' && c.operator === 'above' && Number(c.values[0]) <= cut.highAbove))
  return {
    zones: allow && !has('zone') ? t.zones.slice(0, 2) : [],
    profiles: allow && !has('fingerprint') ? t.fingerprints.slice(0, 1) : [],
    denyRisk: allow && !riskDeny,
  }
}

/* --- Planning --------------------------------------------------------------------------------------- */

export interface GuidedBoard extends SaidBoard {
  rules: Rule[]
}

const WORKING = {
  apps: 'Finding the applications',
  who: 'Finding the people and groups',
  where: 'Matching zones',
  devices: 'Matching device profiles',
  risk: 'Matching the risk score',
  signIn: 'Choosing what happens',
  fallback: 'Choosing what happens to everyone else',
  remove: 'Removing the rule',
} as const

const decisionStep = (key: 'signIn' | 'fallback' | 'risk', label: string, d: AccessDecision, words = DECISION_WORDS[d]): GuidedStep => ({
  key,
  working: WORKING[key],
  label,
  parts: [text(words)],
  decision: d,
})
const zoneStep = (c: Condition, t: SaidTenant): GuidedStep => ({ key: 'where', working: WORKING.where, label: 'Where', parts: [{ kind: 'cond', type: 'zone', words: condWords(c, t) }] })
const profileStep = (c: Condition, t: SaidTenant): GuidedStep => ({ key: 'devices', working: WORKING.devices, label: 'Device', parts: [{ kind: 'cond', type: 'fingerprint', words: condWords(c, t) }] })
const whoStep = (who: RuleWho | undefined, t: SaidTenant): GuidedStep => ({ key: 'who', working: WORKING.who, label: 'Who', parts: whoParts(who, t) })

/* A rule the panel named keeps a name that says it: renamed with its people and conditions, unless the admin gave it
   one of their own. */
const renamed = (before: Rule, after: Rule, t: SaidTenant): Rule => (before.name === ruleName(before, t) ? { ...after, name: ruleName(after, t) } : after)

/** Plans one action on the board as it stands. Nothing is written here. */
export function planGuided(board: GuidedBoard, act: GuidedAct, t: DescribeTenant, cut: GuidedCutoffs): GuidedPlan {
  /* The same applications in another order are no change: the policy keeps its own order (and its first application). */
  const appIds = act.kind === 'add' && !sameSet(act.pick.apps, board.appIds) ? [...act.pick.apps] : [...board.appIds]
  let rules = [...board.rules]
  let fallback = board.fallback
  let focus: string | null = null
  const steps: GuidedStep[] = []
  const at = 'ruleId' in act ? rules.findIndex((r) => r.id === act.ruleId) : -1
  const sel = at >= 0 ? rules[at] : undefined

  switch (act.kind) {
    case 'add': {
      const p = act.pick
      const ids: RuleIds = new Map()
      const c = compose(answersOfPick(p, cut), t, ids, { catchAll: 'card', only: 'per-rule' })
      const named = c.rules.map((r) => ({ ...r, name: ruleName(r, t) }))
      const out = addRules(rules, named)
      rules = out.rules
      const main = ids.get('match')
      focus = main ? (out.landed[named.findIndex((r) => r.id === main)] ?? main) : (out.landed[0] ?? null)
      steps.push({ key: 'apps', working: WORKING.apps, label: 'Applications', parts: appParts(p.apps, t) })
      steps.push(whoStep(p.who, t))
      if (p.zoneId) steps.push(zoneStep(cond('zone', 'in zone', [p.zoneId]), t))
      if (p.profileId) steps.push(profileStep(cond('fingerprint', 'matches', [p.profileId]), t))
      steps.push(decisionStep('signIn', 'Then', p.decision))
      if (p.denyHighRisk) steps.push(decisionStep('risk', `At risk above ${cut.highAbove}`, 'deny'))
      break
    }
    case 'decision': {
      if (!sel) break
      rules[at] = patchRule(sel, outcomeFields(outcomeOf(act.decision)))
      focus = sel.id
      steps.push(decisionStep('signIn', 'Then', act.decision))
      break
    }
    case 'only-zone':
    case 'only-profile': {
      if (!sel) break
      const zone = act.kind === 'only-zone'
      const make = () => (zone ? cond('zone', 'in zone', [act.zoneId]) : cond('fingerprint', 'matches', [act.profileId]))
      const narrowed = renamed(sel, patchRule(sel, { when: withCond(sel.when, make) }), t)
      const kept = settle(rules.filter((r) => r.id !== sel.id), narrowed, at)
      /* Its refusal: the same people and whatever else the rule asks, the new condition the other way round, Deny —
         directly above the rule, so only sign-ins that reached it are refused. */
      const refusal = rule({ name: '', ...(sel.who ? { who: sel.who } : null), when: withCond(sel.when, () => negatedCond(make())), ...outcomeFields(outcomeOf('deny')) })
      rules = addAbove(kept.rules, { ...refusal, name: ruleName(refusal, t) }, kept.id)
      focus = kept.id
      steps.push(zone ? zoneStep(make(), t) : profileStep(make(), t))
      steps.push(decisionStep('signIn', 'Otherwise', 'deny'))
      break
    }
    case 'deny-risk': {
      if (!sel) break
      /* The same people and whatever else the rule asks, at high risk — directly above the rule. */
      const risk = rule({ name: '', ...(sel.who ? { who: sel.who } : null), when: withCond(sel.when, () => cond('device-risk', 'above', [String(cut.highAbove)])), ...outcomeFields(outcomeOf('deny')) })
      rules = addAbove(rules, { ...risk, name: ruleName(risk, t) }, sel.id)
      focus = sel.id
      steps.push(decisionStep('risk', `At risk above ${cut.highAbove}`, 'deny'))
      break
    }
    case 'who': {
      if (!sel) break
      const changed = renamed(sel, patchRule(sel, { who: act.who }), t)
      const kept = settle(rules.filter((r) => r.id !== sel.id), changed, at)
      rules = kept.rules
      focus = kept.id
      steps.push(whoStep(act.who, t))
      break
    }
    case 'delete': {
      if (!sel) break
      rules = rules.filter((r) => r.id !== sel.id)
      steps.push({ key: 'remove', working: WORKING.remove, label: 'Removed', parts: [text(sel.name.trim() || 'Untitled rule')] })
      break
    }
    case 'rest': {
      fallback = { ...(board.fallback ?? fallbackRule()), ...outcomeFields(outcomeOf(act.decision)) }
      steps.push(decisionStep('fallback', 'Everyone else', act.decision))
      break
    }
  }

  const after: SaidBoard = { rules, fallback, appIds, audience: board.audience }
  const lines = saidLines(board, after, t)
  const changed = JSON.stringify({ r: board.rules, f: board.fallback }) !== JSON.stringify({ r: rules, f: fallback })
  return { rules, fallback, appIds, steps, lines, focus, changed }
}

/** The context chip's words for a rule: "Rule 2 · Contractors in India". */
export const ruleLabel = (rules: readonly Rule[], id: string): string | null => {
  const at = rules.findIndex((r) => r.id === id)
  return at < 0 ? null : `Rule ${at + 1} · ${rules[at].name.trim() || 'Untitled rule'}`
}
