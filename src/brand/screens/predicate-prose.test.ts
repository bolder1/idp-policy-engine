import { describe, expect, it } from 'vitest'

import { anySignIn, blankRule, card, cond, when, type Rule } from '../data'
import { conditionSentence, nextRuleName, ruleIfLine, ruleLabel, ruleSentence, ruleSummary, whoSentence, type NameLookup } from './predicate-prose'

/* -----------------------------------------------------------------------------
   A deleted zone, device profile or hook reads as deleted.

   A resolver is the live library, so an id it cannot name no longer exists.
   Falling back to the seed name there printed "in zone Office Network" for a
   rule the linter reports as naming a deleted zone. With no resolver there is
   no live library, and the seed name is still the answer.
   -------------------------------------------------------------------------- */

const LIVE: Record<string, string> = {
  'zone:eu': 'EU Countries',
  'group:finance': 'Finance',
}
const resolve: NameLookup = (kind, id) => LIVE[`${kind}:${id}`]

describe('conditionSentence with a live library', () => {
  it('says (deleted), not the seed name, for a zone the library no longer has', () => {
    expect(conditionSentence(cond('zone', 'in zone', ['office']), resolve)).toBe('in zone (deleted)')
  })

  it('names the zones that still exist beside one that does not', () => {
    expect(conditionSentence(cond('zone', 'not in zone', ['eu', 'office']), resolve)).toBe('not in zone EU Countries or (deleted)')
  })

  it('says deleted device profile for a profile the library no longer has', () => {
    expect(conditionSentence(cond('fingerprint', 'matches', ['fp-corp']), resolve)).toBe('matches a deleted device profile')
  })

  it('says deleted hook for a hook the library no longer has', () => {
    expect(conditionSentence(cond('webhook', 'returns true', ['hk-fraud']), resolve)).toBe('External hook returns true (deleted)')
  })

  it('uses the live name when the library has one', () => {
    const renamed: NameLookup = (kind, id) => (kind === 'zone' && id === 'office' ? 'HQ network' : undefined)
    expect(conditionSentence(cond('zone', 'in zone', ['office']), renamed)).toBe('in zone HQ network')
  })
})

describe('conditionSentence with no resolver', () => {
  it('still reads the seed name', () => {
    expect(conditionSentence(cond('zone', 'in zone', ['office']))).toBe('in zone Office Network')
  })
})

/* -----------------------------------------------------------------------------
   Who is its own part of the sentence.

   The IF text describes the sign-in and never names people or groups; who the
   rule applies to comes back separately, and `null` means everyone.
   -------------------------------------------------------------------------- */

const ruleOf = (w: Rule['when'], who?: Rule['who']): Rule => ({ ...blankRule('R'), ...(who ? { who } : null), when: w })

describe('who in the rule sentence', () => {
  it('is null for a rule with no who', () => {
    expect(ruleSentence(ruleOf(anySignIn())).who).toBeNull()
    expect(whoSentence(undefined)).toBeNull()
  })

  it('names every group and person, and keeps them out of the IF text', () => {
    const r = ruleOf(when(card(cond('zone', 'in zone', ['eu']))), { groupIds: ['finance'], userIds: ['mehak'] })
    const prose = ruleSentence(r, resolve)
    expect(prose.who).toBe('Finance and Mehak Garg')
    expect(prose.iff).toBe('in zone EU Countries')
    expect(prose.iff).not.toContain('Finance')
  })

  it('leaves groups and people on the seed fallback — only zones, profiles and hooks read as deleted', () => {
    expect(whoSentence({ groupIds: ['engineering'], userIds: [] }, resolve)).toBe('Engineering')
  })

  it('says the exceptions', () => {
    expect(whoSentence({ groupIds: [], userIds: [], exceptGroupIds: ['contractors'] })).toBe('Everyone except Contractors')
  })

  it('prints one line with who first', () => {
    const eu = when(card(cond('zone', 'in zone', ['eu'])))
    const fin = { groupIds: ['finance'], userIds: [] }
    expect(ruleIfLine(ruleOf(eu, fin), resolve)).toBe('For Finance, if in zone EU Countries')
    expect(ruleIfLine(ruleOf(anySignIn(), fin), resolve)).toBe('For Finance, any sign-in')
    expect(ruleIfLine(ruleOf(eu), resolve)).toBe('If in zone EU Countries')
    expect(ruleIfLine(ruleOf(anySignIn()), resolve)).toBe('Any sign-in that reaches this rule')
  })

  it('does not say Always matches for a rule that names people', () => {
    const fin = { groupIds: ['finance'], userIds: [] }
    expect(ruleSummary(ruleOf(anySignIn(), fin), resolve)).toBe('Finance · No conditions')
    expect(ruleSummary(ruleOf(when(card(cond('day', 'is', ['Monday']))), fin), resolve)).toBe('Finance · 1 condition')
    expect(ruleSummary(ruleOf(anySignIn()), resolve)).toBe('Always matches')
  })
})

describe('rule labels and new rule names', () => {
  it('labels a blank or whitespace-only name as Untitled rule', () => {
    expect(ruleLabel({ name: '' })).toBe('Untitled rule')
    expect(ruleLabel({ name: '   ' })).toBe('Untitled rule')
    expect(ruleLabel({ name: ' Finance ' })).toBe('Finance')
  })

  it('picks the lowest Rule N nobody has, so deleting Rule 1 never makes two Rule 2s', () => {
    expect(nextRuleName([])).toBe('Rule 1')
    expect(nextRuleName([{ name: 'Rule 2' }])).toBe('Rule 1')
    expect(nextRuleName([{ name: 'Rule 1' }, { name: 'rule 2' }, { name: 'Finance' }])).toBe('Rule 3')
  })

  it('says no method is chosen for a specific first factor without one', () => {
    const r: Rule = { ...blankRule(), decision: '1fa', firstFactor: 'Specific', firstFactorMethod: undefined }
    expect(ruleSentence(r).then).toBe('Access is granted after a specific first factor, but no method is chosen yet.')
    expect(ruleSentence({ ...r, firstFactorMethod: 'Email OTP' }).then).toBe('Access is granted after Email OTP alone. Nothing further is asked.')
  })
})
