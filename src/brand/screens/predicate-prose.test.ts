import { describe, expect, it } from 'vitest'

import { anySignIn, blankPolicy, blankRule, card, cond, when, type Policy, type Rule } from '../data'
import { showcaseTenant } from '../fixtures'
import {
  cardSentence,
  conditionSentence,
  nextRuleName,
  outcomePhrase,
  policySentences,
  policyText,
  predicateSentence,
  ruleIfLine,
  ruleLabel,
  ruleSentence,
  ruleSummary,
  whoSentence,
  type NameLookup,
} from './predicate-prose'
import { patchRule } from './board/model'

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

/* The showcase tenant's own names, as the store resolves them. */
const tenant = showcaseTenant()
const tenantLookup: NameLookup = (kind, id) =>
  kind === 'zone'
    ? tenant.zones.find((z) => z.id === id)?.name
    : kind === 'fingerprint'
      ? tenant.fingerprints.find((p) => p.id === id)?.name
      : kind === 'group'
        ? tenant.groups.find((g) => g.id === id)?.name
        : kind === 'user'
          ? tenant.directory.people.find((u) => u.id === id)?.name
          : undefined
const appName = (id: string) => tenant.apps.find((a) => a.id === id)?.name ?? id
const policy = (id: string) => tenant.policies.find((p) => p.id === id)!
const texts = (p: Policy) => policySentences(p, tenantLookup, appName).map((l) => (l.n === null ? l.text : `${l.n}. ${l.text}`))

/* -----------------------------------------------------------------------------
   The renderer fixes (describe spec, §7.1).

   Each one is a rule two surfaces printed identically although the rules
   differ: a 2FA rule's first factor, a deny's own message, the zone a window
   is read in, the attribute a condition is about, and a risk band said as two
   bounds instead of the scores that pass.
   -------------------------------------------------------------------------- */

describe('decisionSentence says the first factor and the deny message', () => {
  const twoFa: Rule = { ...blankRule(), decision: '2fa', firstFactor: 'Password', secondFactor: 'specific', secondFactorMethods: ['Google Authenticator'] }

  it('names the password before the second factor on a 2FA rule', () => {
    expect(ruleSentence(twoFa).then).toBe('After the password, the user completes a second factor — Google Authenticator — before access is granted.')
  })

  it('names a specific first factor, and says when it is not chosen', () => {
    expect(ruleSentence({ ...twoFa, firstFactor: 'Specific', firstFactorMethod: 'OTP over Email' }).then).toBe(
      'After OTP over Email, the user completes a second factor — Google Authenticator — before access is granted.',
    )
    expect(ruleSentence({ ...twoFa, firstFactor: 'Specific', firstFactorMethod: undefined }).then).toMatch(/^After a first factor not chosen yet, the user completes/)
  })

  it('keeps the first factor on every kind of second factor', () => {
    expect(ruleSentence({ ...twoFa, secondFactor: 'any' }).then).toBe('After the password, the user completes any enabled second factor before access is granted.')
    expect(ruleSentence({ ...twoFa, secondFactor: 'preferred' }).then).toBe('After the password, the user completes their preferred second factor before access is granted.')
    expect(ruleSentence({ ...twoFa, secondFactor: 'chain', methodChain: ['miniOrange Push', 'Yubikey Token'] }).then).toBe(
      'After the password, the user completes every step in order — miniOrange Push → Yubikey Token — before access is granted.',
    )
  })

  it('says the deny message when the rule has its own, and the plain block when it has none', () => {
    const deny: Rule = { ...blankRule(), decision: 'deny' }
    expect(ruleSentence(deny).then).toBe('Access is blocked. No alternative path.')
    expect(ruleSentence({ ...deny, denyMessage: 'Update your device, or contact IT.' }).then).toBe('Access is blocked with the message “Update your device, or contact IT.”')
    // A message with no stop of its own is closed by the sentence's.
    expect(ruleSentence({ ...deny, denyMessage: 'Ask IT for access' }).then).toBe('Access is blocked with the message “Ask IT for access”.')
  })
})

describe('conditionSentence says the time zone and the attribute', () => {
  it('reads a window as between one time and another, in its zone when it has one', () => {
    expect(conditionSentence(cond('time', 'between', ['09:00', '18:00'], undefined, { tz: 'Asia/Kolkata' }))).toBe('Time of day between 09:00 and 18:00 (Asia/Kolkata)')
    expect(conditionSentence(cond('time', 'not between', ['22:00', '06:00'], undefined, { tz: 'Europe/Berlin' }))).toBe('Time of day not between 22:00 and 06:00 (Europe/Berlin)')
    expect(conditionSentence(cond('time', 'between', ['09:00', '18:00']))).toBe('Time of day between 09:00 and 18:00')
  })

  it('names the attribute a condition is about', () => {
    expect(conditionSentence(cond('user-attr', 'is', ['FTE'], undefined, { key: 'employment_type' }))).toBe('User attribute employment_type is FTE')
    expect(conditionSentence(cond('custom-attr', 'above', ['5'], undefined, { key: 'clearance' }))).toBe('Custom attribute clearance above 5')
    expect(conditionSentence(cond('user-attr', 'is', ['FTE']))).toBe('User attribute is FTE')
  })

  it('says sign-in, never login, for a rule with no conditions', () => {
    for (const r of [ruleOf(anySignIn()), ruleOf(anySignIn(), { groupIds: ['finance'], userIds: [] })]) {
      expect(ruleIfLine(r, resolve)).toMatch(/sign-in/)
      expect(ruleIfLine(r, resolve)).not.toMatch(/log ?in/i)
    }
  })
})

describe('a risk band reads as the scores that pass', () => {
  const above = cond('device-risk', 'above', ['39'])
  const below = cond('device-risk', 'below', ['71'])

  it('folds above a and below b into a + 1 to b − 1, where the first of the pair stood', () => {
    expect(cardSentence([above, below])).toBe('Device risk score 40 to 70')
    expect(cardSentence([cond('fingerprint', 'matches', ['fp-corp']), below, above])).toBe('matches Corporate managed and Device risk score 40 to 70')
  })

  it('leaves two bounds as two where they are not one band', () => {
    // Either may hold: two bands, not one.
    expect(cardSentence([above, below], undefined, 'or')).toBe('Device risk score above 39 or Device risk score below 71')
    // No score passes both, so no range is printed.
    expect(cardSentence([cond('device-risk', 'above', ['70']), cond('device-risk', 'below', ['40'])])).toBe('Device risk score above 70 and Device risk score below 40')
    // One bound alone stays a bound.
    expect(cardSentence([above])).toBe('Device risk score above 39')
  })

  it('says a band one score wide as that score', () => {
    expect(cardSentence([cond('device-risk', 'above', ['49']), cond('device-risk', 'below', ['51'])])).toBe('Device risk score 50')
  })

  it('reads the showcase medium band as 40 to 70', () => {
    const medium = showcaseTenant().policies.find((p) => p.id === 'sc-corporate-devices')!.rules[1]
    expect(predicateSentence(medium.when, tenantLookup)).toBe('matches Corporate devices and Device risk score 40 to 70')
  })
})

/* -----------------------------------------------------------------------------
   The whole policy as text (describe spec, §7.1): where it applies, who it is
   for, one numbered sentence per rule, and the last row — built from the
   same renderer as every other read-back.
   -------------------------------------------------------------------------- */

describe('outcomePhrase', () => {
  const base: Rule = { ...blankRule(), pristine: undefined }

  it('says each decision in the testing words, with its factors', () => {
    expect(outcomePhrase({ ...base, decision: '1fa', firstFactor: 'Password' })).toBe('allow on 1 factor, password')
    expect(outcomePhrase({ ...base, decision: '1fa', firstFactor: 'Specific', firstFactorMethod: 'FIDO2 / Passkey' })).toBe('allow on 1 factor, FIDO2 / Passkey')
    expect(outcomePhrase({ ...base, decision: '1fa', firstFactor: 'Any' })).toBe('allow on 1 factor, any enabled factor')
    expect(outcomePhrase({ ...base, decision: 'deny' })).toBe('deny')
    expect(outcomePhrase({ ...base, decision: 'deny', denyMessage: 'Contact IT.' })).toBe('deny, “Contact IT.”')
  })

  it('says the first factor, then the second, on a 2FA rule', () => {
    const twoFa: Rule = { ...base, decision: '2fa', firstFactor: 'Password' }
    expect(outcomePhrase({ ...twoFa, secondFactor: 'specific', secondFactorMethods: ['Google Authenticator'] })).toBe('allow with 2FA, password then Google Authenticator')
    expect(outcomePhrase({ ...twoFa, secondFactor: 'any' })).toBe('allow with 2FA, password then any enabled method')
    expect(outcomePhrase({ ...twoFa, secondFactor: 'chain', methodChain: ['miniOrange Push', 'Yubikey Token'] })).toBe('allow with 2FA, password then miniOrange Push then Yubikey Token')
    expect(outcomePhrase({ ...twoFa, secondFactor: 'preferred' })).toBe('allow with 2FA, password then their preferred method')
    expect(outcomePhrase({ ...twoFa, firstFactor: 'Specific', firstFactorMethod: 'OTP over Email', secondFactor: 'any' })).toBe('allow with 2FA, OTP over Email then any enabled method')
  })

  it('says how long a remembered device lasts, or that 2FA is asked every sign-in', () => {
    const kept: Rule = { ...base, decision: '2fa', secondFactor: 'any', rememberMfa: true, rememberDays: 14 }
    expect(outcomePhrase(kept)).toBe('allow with 2FA, password then any enabled method, device remembered for 14 days')
    expect(outcomePhrase({ ...kept, rememberDays: undefined })).toBe('allow with 2FA, password then any enabled method, device remembered for 30 days')
    // The Remember field takes 1, and the test estate seeds it.
    expect(outcomePhrase({ ...kept, rememberDays: 1 })).toBe('allow with 2FA, password then any enabled method, device remembered for 1 day')
    expect(outcomePhrase({ ...kept, forceMfaEachLogin: true })).toBe('allow with 2FA, password then any enabled method, 2FA every sign-in')
    // Only a 2FA rule asks for a second factor to remember.
    expect(outcomePhrase({ ...kept, decision: '1fa' })).toBe('allow on 1 factor, password')
  })

  /* A rule added with + holds the default `decision: '2fa'` until a tile is
     pressed, and its card says "Outcome not chosen yet" (IfBlock). */
  it('says an outcome nobody has chosen is not chosen, until one is', () => {
    expect(outcomePhrase(blankRule())).toBe('outcome not chosen yet')
    expect(outcomePhrase(patchRule(blankRule(), { decision: '2fa' }))).toBe('allow with 2FA, password then any enabled method')
  })
})

describe('policySentences', () => {
  it('reads HRMS access from corporate offices', () => {
    expect(texts(policy('sc-hrms-office'))).toEqual([
      'Applies to HRMS.',
      'For Human Resources and Finance.',
      '1. For Human Resources and Finance, if in zone Corporate offices: allow with 2FA, password then Google Authenticator.',
      'Nothing else matched: deny, “HRMS opens only from a corporate office. Contact IT if you need access from elsewhere.”',
    ])
  })

  it('reads the corporate-device bands as three numbered rules, the middle one as a band', () => {
    expect(texts(policy('sc-corporate-devices'))).toEqual([
      'Applies to Google Workspace.',
      'For Sales, Finance and Vikram Nair.',
      '1. For Sales, Finance and Vikram Nair, if matches Corporate devices and Device risk score below 40: allow on 1 factor, password.',
      '2. For Sales, Finance and Vikram Nair, if matches Corporate devices and Device risk score 40 to 70: allow with 2FA, password then OTP over Email.',
      '3. For Sales, Finance and Vikram Nair, if matches Corporate devices and Device risk score above 70: deny, “This sign-in looks risky. Try again later, or contact IT.”',
      'Nothing else matched: deny, “Google Workspace opens only on a registered corporate device.”',
    ])
  })

  it('says nothing about who when the policy is for everyone', () => {
    expect(texts(policy('sc-device-compliance'))).toEqual([
      'Applies to Microsoft Outlook and Dropbox.',
      '1. If matches Compliant devices: allow on 1 factor, password.',
      'Nothing else matched: deny, “Your device does not meet the security requirements. Update it, or contact IT.”',
    ])
  })

  it('names no raw id and says the first factor on every 2FA rule of the four scenario policies', () => {
    for (const id of ['sc-hrms-office', 'sc-corporate-devices', 'sc-device-compliance', 'sc-dev-tools']) {
      const p = policy(id)
      const all = texts(p).join('\n')
      for (const ref of ['corp-offices', 'fp-compliant', 'fp-corp-devices', 'u-exec-2', 'hrms', 'google-workspace', 'github']) expect(all).not.toContain(` ${ref}`)
      expect(all).not.toMatch(/\(deleted\)|a deleted device profile/)
      p.rules.filter((r) => r.decision === '2fa').forEach((r) => expect(all).toContain(`: allow with 2FA, password then ${r.secondFactorMethods?.[0]}`))
    }
  })

  it('reads the system policy as applying everywhere, and a policy with no applications as applying to none', () => {
    expect(texts(tenant.policies.find((p) => p.isSystem)!)[0]).toBe('Applies to every application.')
    expect(texts({ ...policy('sc-device-compliance'), appIds: [] })[0]).toBe('Applies to no applications yet.')
  })

  it('names every application, however many there are', () => {
    const three = blankPolicy('Untitled policy 1', ['hrms', 'google-workspace', 'github'])
    expect(texts(three)[0]).toBe('Applies to HRMS, Google Workspace and GitHub Enterprise.')
    expect(texts({ ...three, appIds: ['hrms', 'github'] })[0]).toBe('Applies to HRMS and GitHub Enterprise.')
  })

  /* New policy › Start from scratch › +: conditions and a who do not clear
     the blank flag, only choosing an outcome does (board/model.ts). */
  it('reads a rule with no outcome chosen as such, with or without conditions', () => {
    const base = blankPolicy('Untitled policy 1', ['hrms'])
    const blank = blankRule()
    expect(texts({ ...base, rules: [blank] })[1]).toBe('1. Any sign-in that reaches this rule: outcome not chosen yet.')
    const office = patchRule(blank, { when: when(card(cond('zone', 'in zone', ['corp-offices']))) })
    expect(texts({ ...base, rules: [office] })[1]).toBe('1. If in zone Corporate offices: outcome not chosen yet.')
    expect(texts({ ...base, rules: [patchRule(office, { decision: 'deny' })] })[1]).toBe('1. If in zone Corporate offices: deny.')
  })

  it('keeps a switched-off rule in its place and says it is off', () => {
    const p = policy('sc-dev-tools')
    const off = { ...p, rules: [{ ...p.rules[0], enabled: false }, p.rules[1]] }
    const lines = texts(off)
    expect(lines[2]).toBe('1. Switched off. For Engineering and DevOps, if in zone Corporate offices and matches Compliant devices: allow on 1 factor, password.')
    expect(lines[3]).toBe('2. For Engineering and DevOps, if matches Compliant devices: allow with 2FA, password then miniOrange Push.')
  })

  it('ends each line on one full stop, whether or not a quoted message brings its own', () => {
    const p = policy('sc-device-compliance')
    const lines = texts({ ...p, fallback: { ...p.fallback!, denyMessage: 'Ask IT for access' } })
    expect(lines.at(-1)).toBe('Nothing else matched: deny, “Ask IT for access”.')
    expect(texts(p).every((l) => !l.endsWith('.”.'))).toBe(true)
  })

  it('reads the default last row when the policy has none of its own', () => {
    const lines = policySentences({ ...policy('sc-device-compliance'), fallback: undefined }, tenantLookup, appName)
    expect(lines.at(-1)).toEqual({ key: 'fallback', ruleId: 'fallback', n: null, text: 'Nothing else matched: allow on 1 factor, password.' })
  })

  it('ties each rule line to its card, and numbers only the rules', () => {
    const p = policy('sc-dev-tools')
    const lines = policySentences(p, tenantLookup, appName)
    expect(lines.map((l) => l.ruleId)).toEqual([null, null, p.rules[0].id, p.rules[1].id, p.rules[2].id, 'fallback'])
    expect(lines.map((l) => l.n)).toEqual([null, null, 1, 2, 3, null])
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length)
  })

  it('copies as numbered plain text, one line each', () => {
    expect(policyText(policySentences(policy('sc-device-compliance'), tenantLookup, appName))).toBe(
      [
        'Applies to Microsoft Outlook and Dropbox.',
        '1. If matches Compliant devices: allow on 1 factor, password.',
        'Nothing else matched: deny, “Your device does not meet the security requirements. Update it, or contact IT.”',
      ].join('\n'),
    )
  })
})
