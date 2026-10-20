import { describe, expect, it } from 'vitest'

import { blankPolicy, card, cond, fallbackRule, rule, when, type Policy, type Rule } from '../../data'
import { showcaseTenant } from '../../fixtures'
import { compose, dictionaryOf, negatedCond, type DescribeTenant } from '../../create/describe-model'
import { diagnose } from '../diagnostics'
import { lineText } from './describe-said'
import { GUIDED_SETUP, finishStage, STAGE_MS } from './describe-stage'
import {
  GUIDED_SIDE_KEY,
  answersOfPick,
  covers,
  guidedOffered,
  lastRowReached,
  placeRule,
  planGuided,
  quickActions,
  readGuidedSide,
  ruleLabel,
  scopeOf,
  writeGuidedSide,
  type GuidedBoard,
  type NewRulePick,
} from './guided-setup'

/* -----------------------------------------------------------------------------
   Guided setup's model (docs/specs/GUIDED-SETUP.md): answers first, no reader;
   each Add rule a new rule with its own who; quick actions in place; the order
   that keeps PE103 and PE104 away; and the play's Finish now as a value.
   -------------------------------------------------------------------------- */

const T = showcaseTenant()
const tenant: DescribeTenant = { ...T, users: T.directory.people }
const cut = dictionaryOf(tenant).cutoffs
const board = (rules: Rule[] = [], fallback: Rule | undefined = fallbackRule('deny'), appIds: string[] = ['hrms']): GuidedBoard => ({ rules, fallback, appIds })
const pick = (p: Partial<NewRulePick> = {}): NewRulePick => ({ apps: ['hrms'], decision: '2fa', denyHighRisk: false, ...p })
const contractors = { groupIds: ['contractors'], userIds: [] }
const finance = { groupIds: ['finance'], userIds: [] }

/* A plan's rules as a policy, through the linter: reachability findings only. */
const findings = (rules: Rule[], fallback?: Rule): string[] => {
  const p: Policy = { ...blankPolicy('Guided', ['hrms']), rules, fallback }
  return diagnose(p, T.groups, T.hooks, T.directory.people, { zones: T.zones, fingerprints: T.fingerprints })
    .map((d) => d.code)
    .filter((c) => c === 'PE103' || c === 'PE104')
}
const names = (rules: readonly Rule[]) => rules.map((r) => `${r.name} → ${r.decision}`)

describe('the flag and where it is offered', () => {
  it('is on, beside the Describe it flags', () => {
    expect(GUIDED_SETUP).toBe(true)
  })

  it('works on any App Access policy but the system one — draft or live', () => {
    const draft = blankPolicy('Untitled policy', [])
    const live: Policy = { ...draft, status: 'active' }
    expect(guidedOffered(true, draft)).toBe(true)
    expect(guidedOffered(true, live)).toBe(true)
    expect(guidedOffered(true, { ...draft, isSystem: true })).toBe(false)
    expect(guidedOffered(true, { ...draft, type: 'Session' as Policy['type'] })).toBe(false)
    expect(guidedOffered(false, draft)).toBe(false)
    expect(guidedOffered(true, undefined)).toBe(false)
  })
})

describe('the side it stands on', () => {
  it('is remembered, and is the left when storage fails or holds nothing it knows', () => {
    /* No window here (node): every read and write is guarded. */
    expect(readGuidedSide()).toBe('left')
    expect(() => writeGuidedSide('right')).not.toThrow()
    const store = new Map<string, string>()
    const g = globalThis as unknown as { window?: unknown }
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } }
    try {
      writeGuidedSide('beside')
      expect(store.get(GUIDED_SIDE_KEY)).toBe('beside')
      expect(readGuidedSide()).toBe('beside')
      store.set(GUIDED_SIDE_KEY, 'top')
      expect(readGuidedSide()).toBe('left')
    } finally {
      delete g.window
    }
  })
})

describe('answers from the form', () => {
  it('are all picked: nothing to read, nothing to ask', () => {
    const a = answersOfPick(pick({ who: contractors, zoneId: 'india', profileId: 'fp-corp-devices', denyHighRisk: true }), cut)
    expect(a.apps).toEqual({ value: ['hrms'], origin: 'picked', spans: [] })
    expect(a.who).toEqual({ value: contractors, origin: 'picked', spans: [] })
    expect(a.signIn.match?.value?.decision).toBe('2fa')
    expect(a.where.value).toEqual({ mode: 'only', zoneId: 'india', scope: 'both' })
    expect(a.devices.value).toEqual({ mode: 'only', profileId: 'fp-corp-devices' })
    expect(a.only).not.toBeNull()
    expect(a.more).toHaveLength(1)
    expect(a.more[0].risk.value).toEqual({ mode: 'above', score: cut.highAbove })
    expect(a.more[0].outcome.value?.decision).toBe('deny')
  })

  it('leave Everyone as everyone, and say "only" only with a zone or a profile', () => {
    const a = answersOfPick(pick(), cut)
    expect(a.who.value).toBe('everyone')
    expect(a.only).toBeNull()
    expect(a.more).toEqual([])
  })
})

describe('compose, with its two opt-in options', () => {
  it('writes Everyone with no condition as a card named Everyone, and leaves the last row alone', () => {
    const c = compose(answersOfPick(pick(), cut), tenant, new Map(), { catchAll: 'card' })
    expect(c.rules.map((r) => r.name)).toEqual(['Everyone'])
    expect(c.rules[0].when.cards).toEqual([])
    expect(c.rules[0].who).toBeUndefined()
    expect(c.merged).toBe(false)
    expect(c.fallback).toBeUndefined()
  })

  it('keeps today’s default: the catch-all merges into the last row', () => {
    const c = compose(answersOfPick(pick(), cut), tenant)
    expect(c.rules).toEqual([])
    expect(c.merged).toBe(true)
    expect(c.fallback?.decision).toBe('2fa')
  })

  it('writes "only" per rule: the rule, and its refusal for the same people, the condition negated, Deny — first', () => {
    const c = compose(answersOfPick(pick({ who: contractors, decision: '1fa', zoneId: 'india' }), cut), tenant, new Map(), { catchAll: 'card', only: 'per-rule' })
    expect(c.rules.map((r) => [r.decision, r.when.cards.map((k) => k.conditions.map((x) => `${x.operator} ${x.values}`))])).toEqual([
      ['deny', [['not in zone india']]],
      ['1fa', [['in zone india']]],
    ])
    expect(c.rules.every((r) => JSON.stringify(r.who) === JSON.stringify(contractors))).toBe(true)
    expect(c.rules[0].name).toBe('Contractors outside India')
  })

  it('refuses outside any one of several "only"s: one card per negated condition', () => {
    const c = compose(answersOfPick(pick({ zoneId: 'india', profileId: 'fp-corp-devices' }), cut), tenant, new Map(), { catchAll: 'card', only: 'per-rule' })
    const refusal = c.rules.find((r) => r.decision === 'deny')!
    expect(refusal.when.cards.map((k) => k.conditions.map((x) => x.operator))).toEqual([['not in zone'], ['does not match']])
    expect(refusal.name).toBe('Everyone outside India, or not on Corporate devices')
  })

  it('negates every operator it can be asked to', () => {
    const flip = (typeId: string, op: string, values: string[]) => {
      const n = negatedCond(cond(typeId, op, values))
      return `${n.operator} ${n.values}`
    }
    expect(flip('zone', 'in zone', ['india'])).toBe('not in zone india')
    expect(flip('fingerprint', 'matches', ['fp'])).toBe('does not match fp')
    expect(flip('device-risk', 'above', ['70'])).toBe('below 71')
    expect(flip('device-risk', 'below', ['40'])).toBe('above 39')
    expect(flip('time', 'between', ['09:00', '18:00'])).toBe('not between 09:00,18:00')
    expect(flip('day', 'is', ['Monday'])).toBe('is not Monday')
  })
})

describe('Add rule', () => {
  it('writes a card for Everyone, last among the rules, and the last row is then not reached', () => {
    const plan = planGuided(board(), { kind: 'add', pick: pick() }, tenant, cut)
    expect(names(plan.rules)).toEqual(['Everyone → 2fa'])
    expect(plan.fallback?.decision).toBe('deny')
    expect(lastRowReached(plan.rules)).toBe(false)
    expect(plan.lines.map(lineText)).toEqual(['Everyone signing in to HRMS now needs a second factor.'])
    expect(plan.steps.map((s) => s.label)).toEqual(['Applications', 'Who', 'Then'])
    expect(plan.focus).toBe(plan.rules[0].id)
    expect(plan.changed).toBe(true)
  })

  it('adds a NEW rule with its own who: never pooled, never replacing another rule’s who', () => {
    const first = planGuided(board(), { kind: 'add', pick: pick() }, tenant, cut)
    const second = planGuided(board(first.rules), { kind: 'add', pick: pick({ who: contractors, decision: '1fa' }) }, tenant, cut)
    expect(names(second.rules)).toEqual(['Contractors → 1fa', 'Everyone → 2fa'])
    expect(second.rules[1]).toEqual(first.rules[0])
    const third = planGuided(board(second.rules), { kind: 'add', pick: pick({ who: finance, decision: 'deny' }) }, tenant, cut)
    expect(names(third.rules)).toEqual(['Finance → deny', 'Contractors → 1fa', 'Everyone → 2fa'])
    expect(third.rules.map((r) => r.who?.groupIds ?? [])).toEqual([['finance'], ['contractors'], []])
  })

  it('orders denies first, named people before everyone, the Everyone card last — and raises no PE103 or PE104', () => {
    let b = board()
    const picks: NewRulePick[] = [
      pick(),
      pick({ who: contractors, decision: '1fa', zoneId: 'india', denyHighRisk: true }),
      pick({ who: finance, profileId: 'fp-corp-devices' }),
      pick({ zoneId: 'corp-offices', decision: '1fa' }),
    ]
    for (const p of picks) {
      const plan = planGuided(b, { kind: 'add', pick: p }, tenant, cut)
      expect(findings(plan.rules, plan.fallback), names(plan.rules).join(' / ')).toEqual([])
      b = board(plan.rules, plan.fallback)
    }
    const deny = b.rules.map((r) => r.decision === 'deny')
    expect(deny.indexOf(false)).toBeGreaterThan(deny.lastIndexOf(true))
    expect(b.rules.at(-1)?.name).toBe('Everyone')
    expect(names(b.rules)).toEqual([
      'Contractors at risk above 70 → deny',
      'Contractors outside India → deny',
      'Finance not on Corporate devices → deny',
      'Everyone outside Corporate offices → deny',
      /* As specific as each other: the stricter first. */
      'Finance on Corporate devices → 2fa',
      'Contractors in India → 1fa',
      'Everyone in Corporate offices → 1fa',
      'Everyone → 2fa',
    ])
  })

  it('changes the Then of a rule that asks exactly what it asks, rather than standing under it, never reached', () => {
    const first = planGuided(board(), { kind: 'add', pick: pick() }, tenant, cut)
    const again = planGuided(board(first.rules), { kind: 'add', pick: pick({ decision: 'deny' }) }, tenant, cut)
    expect(again.rules).toHaveLength(1)
    expect(again.rules[0].id).toBe(first.rules[0].id)
    expect(again.rules[0].decision).toBe('deny')
    expect(again.lines.map(lineText)).toEqual(['Everyone signing in to HRMS is now denied (was allow with 2FA).'])
    expect(again.focus).toBe(first.rules[0].id)
  })

  it('Block with a zone or a profile denies there, once — never a second Deny for everywhere else', () => {
    const z = planGuided(board(), { kind: 'add', pick: pick({ decision: 'deny', zoneId: 'india' }) }, tenant, cut)
    expect(names(z.rules)).toEqual(['Everyone in India → deny'])
    const f = planGuided(board(), { kind: 'add', pick: pick({ decision: 'deny', who: contractors, profileId: 'fp-corp-devices' }) }, tenant, cut)
    expect(names(f.rules)).toEqual(['Contractors on Corporate devices → deny'])
    expect(answersOfPick(pick({ decision: 'deny', zoneId: 'india' }), cut).only).toBeNull()
    /* compose itself writes no refusal for a Deny, whoever asks. */
    const a = { ...answersOfPick(pick({ decision: 'deny', zoneId: 'india' }), cut), only: { start: 0, end: 0, phrase: 'only' } }
    expect(compose(a, tenant, new Map(), { catchAll: 'card', only: 'per-rule' }).rules.map((r) => r.decision)).toEqual(['deny'])
  })

  it('the same applications in another order are no change: the policy keeps its order', () => {
    const plan = planGuided(board([], fallbackRule('deny'), ['hrms', 'outlook']), { kind: 'add', pick: pick({ apps: ['outlook', 'hrms'] }) }, tenant, cut)
    expect(plan.appIds).toEqual(['hrms', 'outlook'])
    expect(plan.lines.map(lineText)).not.toContain('This policy now covers Microsoft Outlook and HRMS.')
  })

  it('names the applications when they change, and never writes the audience', () => {
    const plan = planGuided(board([], fallbackRule('deny'), []), { kind: 'add', pick: pick({ apps: ['hrms', 'outlook'] }) }, tenant, cut)
    expect(plan.appIds).toEqual(['hrms', 'outlook'])
    expect(lineText(plan.lines[0])).toBe('This policy now covers HRMS and Microsoft Outlook.')
    expect(Object.keys(plan)).not.toContain('audience')
  })
})

describe('quick actions on the selected rule', () => {
  const start = () => {
    const p = planGuided(board(), { kind: 'add', pick: pick({ who: contractors, decision: '1fa' }) }, tenant, cut)
    return { b: board(p.rules), id: p.rules[0].id }
  }

  it('What happens changes the rule in place: its id and place kept, said with what it was', () => {
    const { b, id } = start()
    const plan = planGuided(b, { kind: 'decision', ruleId: id, decision: '2fa' }, tenant, cut)
    expect(plan.rules.map((r) => r.id)).toEqual([id])
    expect(plan.rules[0].decision).toBe('2fa')
    expect(plan.lines.map(lineText)).toEqual(['Sign-ins to HRMS from Contractors now need a second factor (was allow on 1 factor).'])
  })

  it('Only from a zone narrows the rule and writes its refusal: same who, outside the zone, Deny', () => {
    const { b, id } = start()
    const plan = planGuided(b, { kind: 'only-zone', ruleId: id, zoneId: 'india' }, tenant, cut)
    expect(names(plan.rules)).toEqual(['Contractors outside India → deny', 'Contractors in India → 1fa'])
    expect(plan.rules[1].id).toBe(id)
    expect(findings(plan.rules)).toEqual([])
    expect(plan.lines.map(lineText)).toEqual([
      'Sign-ins to HRMS from Contractors outside India are now denied.',
      'Sign-ins to HRMS from Contractors in India now use a password.',
    ])
  })

  it('Only on a profile does the same with the device profile', () => {
    const { b, id } = start()
    const plan = planGuided(b, { kind: 'only-profile', ruleId: id, profileId: 'fp-corp-devices' }, tenant, cut)
    expect(names(plan.rules)).toEqual(['Contractors not on Corporate devices → deny', 'Contractors on Corporate devices → 1fa'])
  })

  it('Deny at high risk is its own Deny rule for the same people, above them', () => {
    const { b, id } = start()
    const plan = planGuided(b, { kind: 'deny-risk', ruleId: id }, tenant, cut)
    expect(names(plan.rules)).toEqual([`Contractors at risk above ${cut.highAbove} → deny`, 'Contractors → 1fa'])
    expect(findings(plan.rules)).toEqual([])
    expect(quickActions(plan.rules[1], plan.rules, tenant, cut).denyRisk).toBe(false)
  })

  it('Change who keeps the rule, and moves it only as far as it must to shadow nothing', () => {
    const a = planGuided(board(), { kind: 'add', pick: pick({ who: contractors, decision: '1fa', zoneId: 'india' }) }, tenant, cut)
    const b = planGuided(board(a.rules), { kind: 'add', pick: pick({ who: finance }) }, tenant, cut)
    const fin = b.rules.find((r) => r.name === 'Finance')!
    /* Finance (no condition) to Everyone: a catch-all now, so it goes last. */
    const plan = planGuided(board(b.rules), { kind: 'who', ruleId: fin.id, who: undefined }, tenant, cut)
    expect(plan.rules.at(-1)?.id).toBe(fin.id)
    expect(plan.rules.at(-1)?.name).toBe('Everyone')
    expect(findings(plan.rules)).toEqual([])
  })

  it('Change who onto a rule that asks the same merges into it, never two rules with one scope (PE103, PE104)', () => {
    /* (a) Contractors → 2FA, Finance → 1 factor; Finance becomes Contractors. */
    const a1 = rule({ name: 'Contractors', who: contractors, when: { cards: [] }, decision: '2fa' })
    const a2 = rule({ name: 'Finance', who: finance, when: { cards: [] }, decision: '1fa', firstFactor: 'Password' })
    const a = planGuided(board([a1, a2]), { kind: 'who', ruleId: a2.id, who: contractors }, tenant, cut)
    expect(names(a.rules)).toEqual(['Contractors → 1fa'])
    expect(a.rules[0].id).toBe(a1.id)
    expect(a.focus).toBe(a1.id)
    expect(findings(a.rules)).toEqual([])
    expect(a.lines.map(lineText)).toEqual(['Sign-ins to HRMS from Contractors now use a password (was allow with 2FA).', 'Removed the rule for Finance.'])
    /* (b) Contractors, Finance, Everyone; Finance becomes Everyone. */
    const ev = rule({ name: 'Everyone', when: { cards: [] }, decision: '1fa', firstFactor: 'Password' })
    const b2 = { ...a2, decision: '2fa' as const }
    const b = planGuided(board([a1, b2, ev]), { kind: 'who', ruleId: b2.id, who: undefined }, tenant, cut)
    expect(names(b.rules)).toEqual(['Contractors → 2fa', 'Everyone → 2fa'])
    expect(findings(b.rules)).toEqual([])
  })

  it('Only from onto a rule that already asks it merges too, and refuses only above the rule', () => {
    /* (c) Contractors in India → 2FA, Contractors → 1 factor, Everyone; Only from India on rule 2. */
    const c1 = rule({ name: 'Contractors in India', who: contractors, when: when(card(cond('zone', 'in zone', ['india']))), decision: '2fa' })
    const c2 = rule({ name: 'Contractors', who: contractors, when: { cards: [] }, decision: '1fa', firstFactor: 'Password' })
    const ev = rule({ name: 'Everyone', when: { cards: [] }, decision: '2fa' })
    const plan = planGuided(board([c1, c2, ev]), { kind: 'only-zone', ruleId: c2.id, zoneId: 'india' }, tenant, cut)
    expect(names(plan.rules)).toEqual(['Contractors outside India → deny', 'Contractors in India → 1fa', 'Everyone → 2fa'])
    expect(plan.rules[1].id).toBe(c1.id)
    expect(plan.focus).toBe(c1.id)
    expect(findings(plan.rules)).toEqual([])
  })

  it('a quick action’s refusal or high-risk Deny goes directly above the rule, so earlier rules keep their sign-ins', () => {
    const c = rule({ name: 'Contractors', who: contractors, when: { cards: [] }, decision: '1fa', firstFactor: 'Password' })
    const ev = rule({ name: 'Everyone', when: { cards: [] }, decision: '2fa' })
    const only = planGuided(board([c, ev]), { kind: 'only-zone', ruleId: ev.id, zoneId: 'india' }, tenant, cut)
    expect(names(only.rules)).toEqual(['Contractors → 1fa', 'Everyone outside India → deny', 'Everyone in India → 2fa'])
    expect(findings(only.rules)).toEqual([])
    const risk = planGuided(board([c, ev]), { kind: 'deny-risk', ruleId: ev.id }, tenant, cut)
    expect(names(risk.rules)).toEqual(['Contractors → 1fa', `Everyone at risk above ${cut.highAbove} → deny`, 'Everyone → 2fa'])
    /* The refusal asks what the rule asks as well: only those on Corporate devices are refused outside India. */
    const dev = rule({ name: 'Contractors on Corporate devices', who: contractors, when: when(card(cond('fingerprint', 'matches', ['fp-corp-devices']))), decision: '1fa', firstFactor: 'Password' })
    const narrowed = planGuided(board([dev, ev]), { kind: 'only-zone', ruleId: dev.id, zoneId: 'india' }, tenant, cut)
    expect(names(narrowed.rules)).toEqual(['Contractors on Corporate devices and outside India → deny', 'Contractors on Corporate devices and in India → 1fa', 'Everyone → 2fa'])
    expect(findings(narrowed.rules)).toEqual([])
  })

  it('Delete rule takes it away, and says so', () => {
    const { b, id } = start()
    const plan = planGuided(b, { kind: 'delete', ruleId: id }, tenant, cut)
    expect(plan.rules).toEqual([])
    expect(plan.lines.map(lineText)).toEqual(['Removed the rule for Contractors.'])
    expect(plan.focus).toBeNull()
  })

  it('Everyone else sets the last row', () => {
    const plan = planGuided(board(), { kind: 'rest', decision: '1fa' }, tenant, cut)
    expect(plan.fallback?.decision).toBe('1fa')
    expect(plan.lines.map(lineText)).toEqual(['Any other sign-in to HRMS now uses a password (was deny).'])
  })

  it('offer "only" for an Allow without that condition, and never for a Deny', () => {
    const { b } = start()
    const q = quickActions(b.rules[0], b.rules, tenant, cut)
    expect(q.zones.map((z) => z.name)).toEqual(['Corporate offices', 'India'])
    expect(q.profiles.map((z) => z.name)).toEqual(['Corporate devices'])
    expect(q.denyRisk).toBe(true)
    const deny = { ...b.rules[0], decision: 'deny' as const }
    expect(quickActions(deny, [deny], tenant, cut)).toEqual({ zones: [], profiles: [], denyRisk: false })
  })

  it('say "No change" when nothing changes', () => {
    const { b, id } = start()
    const plan = planGuided(b, { kind: 'decision', ruleId: id, decision: '1fa' }, tenant, cut)
    expect(plan.changed).toBe(false)
    expect(plan.lines.map(lineText)).toEqual(['No change'])
  })
})

describe('the order', () => {
  it('places a rule above one that would decide all it sees, and below one it would decide all of', () => {
    const everyone = rule({ name: 'Everyone', when: { cards: [] }, decision: '2fa' })
    const fin = rule({ name: 'Finance', who: finance, when: when(card(cond('zone', 'in zone', ['india']))), decision: '1fa' })
    const placed = placeRule([everyone], fin)
    expect(placed.map((r) => r.name)).toEqual(['Finance', 'Everyone'])
    expect(covers(everyone, fin)).toBe(true)
    expect(covers(fin, everyone)).toBe(false)
    /* A hand-placed Everyone on top: the new rule still goes above it. */
    const finAll = rule({ name: 'Finance all', who: finance, when: { cards: [] }, decision: 'deny' })
    expect(placeRule([fin], finAll).map((r) => r.name)).toEqual(['Finance', 'Finance all'])
    expect(scopeOf(fin)).not.toBe(scopeOf(finAll))
  })

  it('names the context by the rule’s place: "Rule 2 · Contractors"', () => {
    const plan = planGuided(board(), { kind: 'add', pick: pick() }, tenant, cut)
    const more = planGuided(board(plan.rules), { kind: 'add', pick: pick({ who: contractors }) }, tenant, cut)
    expect(ruleLabel(more.rules, more.rules[1].id)).toBe('Rule 2 · Everyone')
    expect(ruleLabel(more.rules, 'gone')).toBeNull()
  })
})

describe('the play', () => {
  it('plays a pick at the picked tempo', () => {
    expect(STAGE_MS.picked).toBe(280)
    expect(STAGE_MS.pickedCanvas).toBe(700)
  })

  it('finishes as a value — the hook acts on it outside any state updater', () => {
    expect(finishStage(null)).toBeNull()
    expect(finishStage({ phase: 'read', text: 'Contractors use a password', before: 0 })).toEqual({ send: 'Contractors use a password', commit: false, arrived: null })
    expect(finishStage({ phase: 'await', before: 2 })).toEqual({ send: null, commit: true, arrived: null })
    expect(finishStage({ phase: 'steps', turnId: 3, step: 1 })).toEqual({ send: null, commit: true, arrived: 3 })
  })
})
