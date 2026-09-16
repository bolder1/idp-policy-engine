import { describe, expect, it } from 'vitest'

import {
  anySignIn,
  blankRule,
  card,
  cond,
  fallbackRule,
  policies,
  reidRule,
  scenarios,
  users,
  when,
  type RuleWho,
} from './data'
import { DEPTHS, policiesAt, type Depth } from './fixtures'
import { sig } from './predicate'
import {
  hasWho,
  intersectWho,
  legacyWhoConditions,
  normaliseWho,
  ruleMatchesEveryone,
  ruleSig,
  setWhoIds,
  whoContains,
  whoCoversNobody,
  whoKey,
  whoPasses,
  whoSummary,
  withWho,
} from './rule-who'
import { DECK } from './screens/gauntlet'

/* -----------------------------------------------------------------------------
   Who a rule applies to is its own field, beside the WHEN.

   Groups and people are a union, exceptions subtract, absent is everyone. The
   stored shape is normalised so a dirty check that compares JSON sees a rule
   that went back to everyone as untouched.
   -------------------------------------------------------------------------- */

const who = (over: Partial<RuleWho> = {}): RuleWho => ({ groupIds: [], userIds: [], ...over })
const priya = { id: 'priya', groupId: 'finance' }
const devon = { id: 'devon', groupId: 'contractors' }
const mehak = { id: 'mehak', groupId: 'executives' }

describe('normaliseWho', () => {
  it('drops blanks and repeats, and keeps the order things were chosen in', () => {
    expect(normaliseWho(who({ groupIds: ['legal', 'finance', 'legal', ' '], userIds: ['priya', 'priya'] }))).toEqual({
      groupIds: ['legal', 'finance'],
      userIds: ['priya'],
    })
  })

  it('omits empty exception lists', () => {
    expect(normaliseWho(who({ groupIds: ['finance'], exceptGroupIds: [], exceptUserIds: [] }))).toEqual({
      groupIds: ['finance'],
      userIds: [],
    })
  })

  it('is undefined when every list is empty, so the field goes', () => {
    expect(normaliseWho(who())).toBeUndefined()
    expect(normaliseWho(undefined)).toBeUndefined()
    expect(hasWho(who({ exceptUserIds: [] }))).toBe(false)
  })

  it('keeps a who that only has exceptions', () => {
    expect(normaliseWho(who({ exceptGroupIds: ['contractors'] }))).toEqual({ groupIds: [], userIds: [], exceptGroupIds: ['contractors'] })
    expect(hasWho(who({ exceptGroupIds: ['contractors'] }))).toBe(true)
  })
})

describe('whoPasses', () => {
  it('covers everyone when nothing is chosen', () => {
    expect(whoPasses(undefined, devon)).toBe(true)
    expect(whoPasses(who(), devon)).toBe(true)
  })

  it('is a union of groups and people', () => {
    const w = who({ groupIds: ['finance'], userIds: ['mehak'] })
    expect(whoPasses(w, priya)).toBe(true)
    expect(whoPasses(w, mehak)).toBe(true)
    expect(whoPasses(w, devon)).toBe(false)
  })

  it('takes out an excepted group, even from a named person in it', () => {
    const w = who({ groupIds: ['finance'], userIds: ['devon'], exceptGroupIds: ['contractors'] })
    expect(whoPasses(w, priya)).toBe(true)
    expect(whoPasses(w, devon)).toBe(false)
  })

  it('takes out an excepted person', () => {
    const w = who({ groupIds: ['finance'], exceptUserIds: ['priya'] })
    expect(whoPasses(w, priya)).toBe(false)
    expect(whoPasses(w, { id: 'u-fin-2', groupId: 'finance' })).toBe(true)
  })

  it('reads everyone except, when only exceptions are set', () => {
    const w = who({ exceptGroupIds: ['contractors'] })
    expect(whoPasses(w, priya)).toBe(true)
    expect(whoPasses(w, devon)).toBe(false)
  })
})

describe('whoKey', () => {
  it('is the same whatever order things were chosen in', () => {
    expect(whoKey(who({ groupIds: ['a', 'b'], userIds: ['y', 'x'] }))).toBe(whoKey(who({ groupIds: ['b', 'a'], userIds: ['x', 'y'] })))
  })

  it('tells groups from people and inclusions from exceptions', () => {
    const keys = [who({ groupIds: ['a'] }), who({ userIds: ['a'] }), who({ exceptGroupIds: ['a'] }), who({ exceptUserIds: ['a'] })].map(whoKey)
    expect(new Set(keys).size).toBe(4)
  })

  it('is empty for everyone', () => {
    expect(whoKey(undefined)).toBe('')
    expect(whoKey(who())).toBe('')
  })
})

describe('ruleSig and ruleMatchesEveryone', () => {
  const office = () => when(card(cond('zone', 'in zone', ['office'])))

  it('signs a rule with no who exactly as its WHEN always signed', () => {
    const w = office()
    expect(ruleSig({ when: w })).toBe(sig(w))
  })

  it('separates two rules with the same WHEN and different people', () => {
    expect(ruleSig({ who: who({ groupIds: ['finance'] }), when: office() })).not.toBe(
      ruleSig({ who: who({ groupIds: ['contractors'] }), when: office() }),
    )
    expect(ruleSig({ who: who({ groupIds: ['finance'] }), when: office() })).not.toBe(ruleSig({ when: office() }))
  })

  it('does not call a who with no conditions a catch-all', () => {
    expect(ruleMatchesEveryone({ when: anySignIn() })).toBe(true)
    expect(ruleMatchesEveryone({ who: who({ userIds: ['mehak'] }), when: anySignIn() })).toBe(false)
    expect(ruleMatchesEveryone({ when: office() })).toBe(false)
  })
})

describe('whoContains', () => {
  it('everyone contains anyone', () => {
    expect(whoContains(undefined, who({ groupIds: ['finance'] }))).toBe(true)
    expect(whoContains(undefined, undefined)).toBe(true)
  })

  it('a narrowed who never contains everyone', () => {
    expect(whoContains(who({ groupIds: ['finance'] }), undefined)).toBe(false)
    expect(whoContains(who({ exceptGroupIds: ['contractors'] }), undefined)).toBe(false)
  })

  it('compares group lists as sets', () => {
    expect(whoContains(who({ groupIds: ['finance', 'legal'] }), who({ groupIds: ['legal'] }))).toBe(true)
    expect(whoContains(who({ groupIds: ['legal'] }), who({ groupIds: ['finance', 'legal'] }))).toBe(false)
  })

  it('needs a directory to place a named person inside a group', () => {
    const outer = who({ groupIds: ['finance'] })
    const inner = who({ userIds: ['priya'] })
    expect(whoContains(outer, inner)).toBe(false)
    expect(whoContains(outer, inner, users)).toBe(true)
  })

  it('does not contain someone it excepts', () => {
    expect(whoContains(who({ exceptGroupIds: ['contractors'] }), who({ groupIds: ['finance'] }))).toBe(true)
    expect(whoContains(who({ exceptGroupIds: ['contractors'] }), who({ groupIds: ['contractors'] }))).toBe(false)
    expect(whoContains(who({ exceptUserIds: ['devon'] }), who({ userIds: ['devon'] }))).toBe(false)
  })

  it('ignores an outer exception the inner who already makes', () => {
    expect(whoContains(who({ exceptGroupIds: ['contractors'] }), who({ exceptGroupIds: ['contractors'] }))).toBe(true)
  })
})

describe('whoCoversNobody and intersectWho', () => {
  it('knows a who whose every choice is also an exception covers nobody', () => {
    expect(whoCoversNobody(who({ groupIds: ['finance'], exceptGroupIds: ['finance'] }))).toBe(true)
    expect(whoCoversNobody(who({ exceptGroupIds: ['finance'] }))).toBe(false)
    expect(whoCoversNobody(who({ groupIds: ['finance'], userIds: ['devon'], exceptGroupIds: ['finance'] }))).toBe(false)
  })

  it('intersects groups with groups and people with people', () => {
    expect(intersectWho(who({ groupIds: ['finance', 'legal'], userIds: ['a', 'b'] }), who({ groupIds: ['legal'], userIds: ['b'] }))).toEqual({
      groupIds: ['legal'],
      userIds: ['b'],
    })
  })

  it('unions the exceptions', () => {
    expect(intersectWho(who({ exceptUserIds: ['a'] }), who({ groupIds: ['finance'], exceptUserIds: ['b'] }))).toEqual({
      groupIds: ['finance'],
      userIds: [],
      exceptUserIds: ['a', 'b'],
    })
  })

  it('is null — nobody — when the two share no one', () => {
    expect(intersectWho(who({ groupIds: ['finance'] }), who({ groupIds: ['contractors'] }))).toBeNull()
  })

  it('treats a missing side as everyone', () => {
    expect(intersectWho(undefined, who({ groupIds: ['finance'] }))).toEqual({ groupIds: ['finance'], userIds: [] })
    expect(intersectWho(undefined, undefined)).toBeUndefined()
  })
})

describe('setWhoIds and withWho', () => {
  it('writes one list and normalises', () => {
    const r = setWhoIds(blankRule('R'), 'groupIds', ['finance', 'finance'])
    expect(r.who).toEqual({ groupIds: ['finance'], userIds: [] })
  })

  it('deletes the field when the last id goes, so the rule is byte-identical to one that never had a who', () => {
    const plain = blankRule('R')
    const back = setWhoIds(setWhoIds(plain, 'userIds', ['priya']), 'userIds', [])
    expect('who' in back).toBe(false)
    expect(JSON.stringify(back)).toBe(JSON.stringify(plain))
  })

  it('rebuilds a seeded rule byte for byte when its people are cleared and chosen again', () => {
    for (const p of policies) {
      for (const seeded of p.rules.filter((r) => hasWho(r.who))) {
        const cleared = withWho(seeded, undefined)
        expect('who' in cleared).toBe(false)
        expect(JSON.stringify(withWho(cleared, seeded.who)), `${p.id} / ${seeded.name}`).toBe(JSON.stringify(seeded))
        const list = seeded.who!.groupIds.length > 0 ? 'groupIds' : 'userIds'
        const again = setWhoIds(setWhoIds(seeded, list, []), list, seeded.who![list])
        expect(JSON.stringify(again), `${p.id} / ${seeded.name}`).toBe(JSON.stringify(seeded))
      }
    }
  })

  it('puts a new who immediately before the WHEN', () => {
    const keys = Object.keys(setWhoIds(blankRule('R'), 'groupIds', ['finance']))
    expect(keys.indexOf('who')).toBe(keys.indexOf('when') - 1)
  })

  it('leaves the rule itself alone when there was nothing to remove', () => {
    const plain = blankRule('R')
    expect(withWho(plain, undefined)).toBe(plain)
  })
})

describe('the rule helpers', () => {
  it('reidRule copies the who, list by list', () => {
    const r = withWho(blankRule('R'), who({ groupIds: ['finance'], exceptUserIds: ['priya'] }))
    const copy = reidRule(r)
    expect(copy.who).toEqual(r.who)
    expect(copy.who!.groupIds).not.toBe(r.who!.groupIds)
    expect(copy.who!.exceptUserIds).not.toBe(r.who!.exceptUserIds)
  })

  it('reidRule adds no who to a rule without one', () => {
    expect(JSON.stringify(reidRule(blankRule('R'))).includes('"who"')).toBe(false)
  })

  it('a blank rule and the last rule carry no who', () => {
    expect(blankRule().who).toBeUndefined()
    expect(fallbackRule().who).toBeUndefined()
  })
})

describe('whoSummary', () => {
  const NAMES: Record<string, string> = {
    'group:finance': 'Finance',
    'group:legal': 'Legal',
    'group:contractors': 'Contractors',
    'group:engineering': 'Engineering',
    'user:mehak': 'Mehak Rao',
    'user:priya': 'Priya Sharma',
  }
  const name = (kind: 'group' | 'user', id: string) => NAMES[`${kind}:${id}`]

  it('says everyone when nobody is chosen', () => {
    expect(whoSummary(undefined, name)).toBe('Everyone')
  })

  it('names two with "and"', () => {
    expect(whoSummary(who({ groupIds: ['finance'], userIds: ['mehak'] }), name)).toBe('Finance and Mehak Rao')
  })

  it('counts the rest past three', () => {
    expect(whoSummary(who({ groupIds: ['finance', 'legal', 'contractors', 'engineering'] }), name)).toBe('Finance, Legal and 2 more')
  })

  it('reads exceptions after the people', () => {
    expect(whoSummary(who({ exceptGroupIds: ['contractors'] }), name)).toBe('Everyone except Contractors')
    expect(whoSummary(who({ groupIds: ['finance'], exceptUserIds: ['priya'] }), name)).toBe('Finance except Priya Sharma')
  })

  it('prints the id for a name it cannot find, and every name when asked', () => {
    expect(whoSummary(who({ groupIds: ['gone'] }), name)).toBe('gone')
    expect(whoSummary(who({ groupIds: ['finance', 'legal', 'contractors', 'engineering'] }), name, Infinity)).toBe(
      'Finance, Legal, Contractors and Engineering',
    )
  })
})

/* Nothing seeded may still write who the old way. */
describe('the seeds', () => {
  it('no seeded policy rule holds a group or user condition', () => {
    for (const p of policies) {
      for (const r of [...p.rules, ...(p.fallback ? [p.fallback] : []), ...(p.pendingDraft?.rules ?? [])]) {
        expect(legacyWhoConditions(r.when), `${p.name} / ${r.name}`).toEqual([])
      }
    }
  })

  it('no tenant fixture rule holds one either', () => {
    for (const depth of Object.keys(DEPTHS) as Depth[]) {
      for (const p of policiesAt(depth)) {
        for (const r of p.rules) expect(legacyWhoConditions(r.when), `${depth} · ${p.name} / ${r.name}`).toEqual([])
      }
    }
  })

  it('no template builds one', () => {
    for (const s of scenarios) {
      for (const spec of s.rules) expect(legacyWhoConditions(spec.build().when), `${s.id} / ${spec.name}`).toEqual([])
    }
  })

  it('no gauntlet fix proposes one', () => {
    for (const c of DECK) {
      for (const x of c.fix?.conditions ?? []) expect(['group', 'user'], `${c.id}`).not.toContain(x.typeId)
    }
  })

  it('the rules that name people carry them as a who', () => {
    const named = policies.flatMap((p) => p.rules.filter((r) => hasWho(r.who)).map((r) => `${p.id} / ${r.name}`))
    expect(named).toEqual([
      's21-oncall / After hours, on-call rotation only',
      's23-vault / Paralegal, cleared, on matter, from the office',
      's9-finance / CFO anywhere, hardened',
    ])
  })
})
