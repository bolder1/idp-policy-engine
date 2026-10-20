import type { AccessDecision, Audience, Condition, Predicate, Rule, RuleWho } from '../../data'
import { DECISION_PHRASE } from '../../decision-words'
import { daysWords, type DescribeTenant } from '../../create/describe-model'
import { intersectWho, normaliseWho } from '../../rule-who'

/* -----------------------------------------------------------------------------
   What a change did, in plain lines (Guided setup, 19 Oct 2026; design §4,
   "Result lines").

   Read from the BOARD — its rules before and after — never from the answers
   that asked for the change, so a rule built by hand reads as well as one the
   panel wrote, and a line can only say what the canvas now holds. One line per
   decision: each rule added or changed, in canvas order, each rule removed, the
   last row when it changed, and the applications when they changed. A line is
   parts, so the panel can put an application's logo before its name, a face
   before a group or a person, and its family's icon before a condition.

     "Everyone signing in to ▣ HRMS now needs a second factor."
     "Sign-ins to ▣ HRMS from ■ Contractors outside ⌖ India are now denied."
     "Any other sign-in to ▣ HRMS now uses a password."
     "Removed the rule for ■ Contractors in ⌖ India."
     "This policy now covers ▣ HRMS and ▣ Microsoft Outlook."

   Pure and React-free: describe-said.test.ts holds every template.
   -------------------------------------------------------------------------- */

export type SaidPart =
  | { kind: 'text'; text: string }
  | { kind: 'app'; id: string; name: string }
  | { kind: 'who'; who: 'group' | 'user'; id: string; name: string }
  /** A condition's words, with its type for the family icon (zone, fingerprint, device-risk, time, day…). */
  | { kind: 'cond'; type: string; words: string }

export interface SaidLine {
  /** The rule's id, 'fallback' (the last row), 'apps', or 'none'. */
  key: string
  /** The decision the line is about, for its mark; null for applications and No change. */
  decision: AccessDecision | null
  /** A rule that went: its mark is drawn grey. */
  removed?: boolean
  parts: SaidPart[]
}

/** What a board holds, for the lines: its rules, its last row and its applications — and the policy's audience, when it is narrowed. */
export interface SaidBoard {
  rules: readonly Rule[]
  fallback: Rule | undefined
  appIds: readonly string[]
  audience?: Pick<Audience, 'everyone' | 'groupIds' | 'userIds'>
}

/** Two application lists hold the same applications, whatever their order. */
export const sameSet = (x: readonly string[], y: readonly string[]): boolean => x.length === y.length && x.every((v) => y.includes(v))

/** Whether the last row is ever reached: no enabled rule decides every sign-in (everyone, no condition) before it. */
export const lastRowReached = (rules: readonly Rule[]): boolean => !rules.some((r) => r.enabled && !normaliseWho(r.who) && r.when.cards.length === 0)

export type SaidTenant = Pick<DescribeTenant, 'apps' | 'groups' | 'users' | 'zones' | 'fingerprints' | 'methods'>

export const text = (t: string): SaidPart => ({ kind: 'text', text: t })

/* "A", "A and B", "A, B and C"; past three, "A, B and N more". */
function listed<T>(items: readonly T[], part: (x: T) => SaidPart): SaidPart[] {
  if (items.length === 0) return []
  const shown = items.length > 3 ? items.slice(0, 2) : items
  const out: SaidPart[] = []
  shown.forEach((x, i) => {
    if (i > 0) out.push(text(i === shown.length - 1 && items.length <= 3 ? ' and ' : ', '))
    out.push(part(x))
  })
  if (items.length > 3) out.push(text(` and ${items.length - 2} more`))
  return out
}

/** The applications, each with its logo. */
export function appParts(appIds: readonly string[], t: SaidTenant): SaidPart[] {
  return listed(appIds, (id) => ({ kind: 'app', id, name: t.apps.find((a) => a.id === id)?.name ?? id }))
}

const groupPart = (id: string, t: SaidTenant): SaidPart => ({ kind: 'who', who: 'group', id, name: t.groups.find((g) => g.id === id)?.name ?? id })
const userPart = (id: string, t: SaidTenant): SaidPart => ({ kind: 'who', who: 'user', id, name: t.users.find((u) => u.id === id)?.name ?? id })

/** Whether a who names its people (not everyone, not only exceptions). */
export const namesPeople = (who: RuleWho | undefined): boolean => {
  const w = normaliseWho(who)
  return !!w && w.groupIds.length + w.userIds.length > 0
}

/** The people a who names, each with a face, and " except …" for its exceptions. Everyone: "Everyone". */
export function whoParts(who: RuleWho | undefined, t: SaidTenant, everyone = 'Everyone'): SaidPart[] {
  const w = normaliseWho(who)
  const head: SaidPart[] = w && namesPeople(w)
    ? listed([...w.groupIds.map((id) => ({ g: true, id })), ...w.userIds.map((id) => ({ g: false, id }))], (x) => (x.g ? groupPart(x.id, t) : userPart(x.id, t)))
    : [text(everyone)]
  const ex = [...(w?.exceptGroupIds ?? []).map((id) => ({ g: true, id })), ...(w?.exceptUserIds ?? []).map((id) => ({ g: false, id }))]
  return ex.length > 0 ? [...head, text(' except '), ...listed(ex, (x) => (x.g ? groupPart(x.id, t) : userPart(x.id, t)))] : head
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

/** One condition, in the line's words: "in India", "outside India", "on Corporate devices", "at risk above 70"… */
export function condWords(c: Condition, t: SaidTenant): string {
  const zones = () => c.values.map((id) => t.zones.find((z) => z.id === id)?.name ?? id).join(' or ')
  const profiles = () => c.values.map((id) => t.fingerprints.find((p) => p.id === id)?.name ?? id).join(' or ')
  switch (c.typeId) {
    case 'zone':
      return c.operator === 'not in zone' ? `outside ${zones()}` : `in ${zones()}`
    case 'fingerprint':
      return c.operator === 'does not match' ? `not on ${profiles()}` : `on ${profiles()}`
    case 'device-risk':
      return `at risk ${c.operator === 'below' ? 'below' : 'above'} ${c.values[0] ?? ''}`.trim()
    case 'time':
      return c.operator === 'not between' ? `outside ${c.values[0] ?? ''} to ${c.values[1] ?? ''}` : `between ${c.values[0] ?? ''} and ${c.values[1] ?? ''}`
    case 'day': {
      const weekdays = c.values.length === WEEKDAYS.length && WEEKDAYS.every((d) => c.values.includes(d))
      const days = weekdays ? 'weekdays' : daysWords(c.values)
      return c.operator === 'is not' ? `not on ${days}` : `on ${days}`
    }
    default:
      return `${c.key ? `${c.key} ` : ''}${c.operator} ${c.values.join(', ')}`.trim()
  }
}

/** A rule's conditions as parts: within a card joined by "and", between cards by "or". None: no parts. */
export function condParts(when: Predicate, t: SaidTenant): SaidPart[] {
  const out: SaidPart[] = []
  when.cards.forEach((k, i) => {
    if (i > 0) out.push(text(when.join === 'and' ? ' and ' : ' or '))
    k.conditions.forEach((c, j) => {
      if (j > 0) out.push(text(k.join === 'or' ? ' or ' : ' and '))
      out.push({ kind: 'cond', type: c.typeId, words: condWords(c, t) })
    })
  })
  return out
}

/** A rule's name, as Guided setup gives one: its people, then its conditions — "Contractors in India", "Everyone". */
export function ruleName(r: Pick<Rule, 'who' | 'when'>, t: SaidTenant): string {
  const words = (ps: SaidPart[]) => ps.map((p) => (p.kind === 'text' ? p.text : p.kind === 'cond' ? p.words : p.name)).join('')
  const conds = words(condParts(r.when, t))
  return `${words(whoParts(r.who, t))}${conds ? ` ${conds}` : ''}`
}

const methodName = (id: string | undefined, t: SaidTenant) => (id ? (t.methods.find((m) => m.id === id || m.name === id)?.name ?? id) : undefined)

/* The verb, singular ("Everyone signing in … now needs …", "Any other sign-in … is now denied") or plural ("Sign-ins
   … now need …", "… are now denied"). */
function verb(r: Rule, one: boolean, t: SaidTenant): string {
  if (r.decision === 'deny') return one ? 'is now denied' : 'are now denied'
  if (r.decision === '2fa') {
    const m = r.secondFactor === 'specific' && r.secondFactorMethods?.length === 1 ? methodName(r.secondFactorMethods[0], t) : undefined
    return `${one ? 'now needs' : 'now need'} ${m ?? 'a second factor'}`
  }
  const m = r.firstFactor === 'Specific' ? methodName(r.firstFactorMethod, t) : undefined
  return `${one ? 'now uses' : 'now use'} ${m ?? 'a password'}`
}
/* The same, for a last row no sign-in reaches: what it WOULD do. */
function would(r: Rule, t: SaidTenant): string {
  if (r.decision === 'deny') return 'would now be denied'
  return verb(r, true, t).replace(/^now (needs|uses)/, (_, v: string) => `would now ${v === 'needs' ? 'need' : 'use'}`)
}
/* What it was, mid-sentence and in sentence case: "(was allow with 2FA)". */
const was = (from: AccessDecision | undefined) => (from ? ` (was ${DECISION_PHRASE[from]})` : '')
const to = (appIds: readonly string[], t: SaidTenant): SaidPart[] => (appIds.length > 0 ? [text(' to '), ...appParts(appIds, t)] : [])
/* The policy's own people, when it is narrowed to some: everyone a rule for Everyone can reach. */
const audienceWho = (a: SaidBoard['audience']): RuleWho | undefined => (a && !a.everyone && a.groupIds.length + a.userIds.length > 0 ? { groupIds: a.groupIds, userIds: a.userIds } : undefined)

/** What a line knows beyond its rule: the policy's audience, and whether a rule above may decide some of it first. */
export interface LineContext {
  audience?: SaidBoard['audience']
  /** An enabled rule above may take some of these sign-ins first. */
  above?: boolean
}
const ABOVE = ', unless a rule above decides first'

/** One rule's line: Everyone with no condition reads as one person; anything narrower as sign-ins. */
export function ruleLine(r: Rule, appIds: readonly string[], t: SaidTenant, from?: AccessDecision, ctx: LineContext = {}): SaidLine {
  const conds = condParts(r.when, t)
  const w = normaliseWho(r.who)
  const aud = audienceWho(ctx.audience)
  const everyone = !w && conds.length === 0
  const tail = text(` ${verb(r, !!everyone, t)}${was(from)}${ctx.above ? ABOVE : ''}.`)
  const parts: SaidPart[] = everyone
    ? [text('Everyone'), ...(aud ? [text(' in '), ...whoParts(aud, t)] : []), text(' signing in'), ...to(appIds, t), tail]
    : [
        text('Sign-ins'),
        ...to(appIds, t),
        ...(w ? [text(' from '), ...whoParts(w, t, 'everyone')] : aud ? [text(' from '), ...whoParts(aud, t)] : []),
        ...(conds.length > 0 ? [text(' '), ...conds] : []),
        tail,
      ]
  return { key: r.id, decision: r.decision, parts }
}

/** The last row's line: "Any other sign-in to ▣ HRMS is now denied." — or, while a rule above decides every sign-in, what it would do. */
export function lastRowLine(f: Rule, appIds: readonly string[], t: SaidTenant, from?: AccessDecision, reached = true): SaidLine {
  const said = reached ? `${verb(f, true, t)}${was(from)}.` : `${would(f, t)}${was(from)}, but a rule above decides every sign-in first.`
  return { key: 'fallback', decision: f.decision, parts: [text('Any other sign-in'), ...to(appIds, t), text(` ${said}`)] }
}

/* --- Whether a rule above may take some of a rule's sign-ins first ------------------------------------------------- */

const FLIP: Record<string, string> = {
  'in zone': 'not in zone',
  'not in zone': 'in zone',
  matches: 'does not match',
  'does not match': 'matches',
  between: 'not between',
  'not between': 'between',
  is: 'is not',
  'is not': 'is',
}
const valuesOf = (c: Condition) => [...c.values].sort().join('|')
/* Two conditions no sign-in meets both of: one the other way round ("in India" / "outside India"), or two risk ranges
   that do not meet ("above 70" / "below 71"). */
function opposite(c: Condition, d: Condition): boolean {
  if (c.typeId !== d.typeId || (c.key ?? '') !== (d.key ?? '')) return false
  if (FLIP[c.operator] === d.operator) return valuesOf(c) === valuesOf(d)
  const n = (x: Condition) => Number(x.values[0])
  if (c.operator === 'above' && d.operator === 'below') return Number.isFinite(n(c)) && n(d) <= n(c) + 1
  if (c.operator === 'below' && d.operator === 'above') return Number.isFinite(n(d)) && n(c) <= n(d) + 1
  return false
}
/* Whether `x` and `r` can match one sign-in: people in common (as far as the directory tells), and no alternative of
   one that rules out every alternative of the other. Said only when it may — a line errs toward the warning. */
export function mayShare(x: Pick<Rule, 'who' | 'when'>, r: Pick<Rule, 'who' | 'when'>, t: Pick<SaidTenant, 'users'>): boolean {
  if (intersectWho(x.who, r.who, t.users) === null) return false
  if (x.when.cards.length === 0 || r.when.cards.length === 0) return true
  if (x.when.join === 'and' || r.when.join === 'and') return true
  const apart = x.when.cards.every((xk) => xk.join !== 'or' && r.when.cards.every((rk) => rk.join !== 'or' && xk.conditions.some((c) => rk.conditions.some((d) => opposite(c, d)))))
  return !apart
}

/** A rule taken away: "Removed the rule for ■ Contractors in ⌖ India." */
export function removedLine(r: Rule, t: SaidTenant): SaidLine {
  const conds = condParts(r.when, t)
  return { key: r.id, decision: r.decision, removed: true, parts: [text('Removed the rule for '), ...whoParts(r.who, t, 'everyone'), ...(conds.length > 0 ? [text(' '), ...conds] : []), text('.')] }
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y)
/* A last row's Then, for "changed": the decision and the factors, not its id. */
const thenOf = (r: Rule | undefined) => (r ? [r.decision, r.firstFactor, r.firstFactorMethod, r.secondFactor, r.secondFactorMethods] : null)

/** Every line a change from `before` to `after` says, in the order above. Nothing changed: one "No change". */
export function saidLines(before: SaidBoard, after: SaidBoard, t: SaidTenant): SaidLine[] {
  const lines: SaidLine[] = []
  if (!sameSet(before.appIds, after.appIds) && after.appIds.length > 0) lines.push({ key: 'apps', decision: null, parts: [text('This policy now covers '), ...appParts(after.appIds, t), text('.')] })
  const prior = new Map(before.rules.map((r) => [r.id, r]))
  after.rules.forEach((r, i) => {
    const old = prior.get(r.id)
    if (old && same(old, r)) return
    /* Said for what it reaches: a rule above that may take some of these sign-ins first is said too. */
    const ctx: LineContext = { audience: after.audience, above: r.enabled && after.rules.slice(0, i).some((x) => x.enabled && mayShare(x, r, t)) }
    lines.push(ruleLine(r, after.appIds, t, old && old.decision !== r.decision ? old.decision : undefined, ctx))
  })
  const kept = new Set(after.rules.map((r) => r.id))
  for (const r of before.rules) if (!kept.has(r.id)) lines.push(removedLine(r, t))
  if (after.fallback && !same(thenOf(before.fallback), thenOf(after.fallback))) {
    const from = before.fallback && before.fallback.decision !== after.fallback.decision ? before.fallback.decision : undefined
    lines.push(lastRowLine(after.fallback, after.appIds, t, from, lastRowReached(after.rules)))
  }
  return lines.length > 0 ? lines : [{ key: 'none', decision: null, parts: [text('No change')] }]
}

/** A line's words alone, for a screen reader's announcement and for tests. */
export const lineText = (l: Pick<SaidLine, 'parts'>): string => l.parts.map((p) => (p.kind === 'text' ? p.text : p.kind === 'cond' ? p.words : p.name)).join('')
