import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../fixtures'
import { leaves } from '../predicate'
import type { Policy, Rule } from '../data'
import { diagnose } from '../screens/diagnostics'
import {
  EXAMPLES,
  answerMissing,
  applyChoice,
  compose,
  dictionaryOf,
  emptyAnswers,
  firstNeeding,
  lastRowOf,
  leaveOutAsked,
  nameOf,
  openAfter,
  openChoices,
  readText,
  sentenceOf,
  signInMissing,
  summaryOf,
  valuesOf,
  type BranchId,
  type DescribeAnswers,
  type DescribeTenant,
  type Outcome,
  type Reading,
  type RiskAnswer,
  type WhenAnswer,
  type WhereAnswer,
  type DeviceAnswer,
} from './describe-model'

/* The showcase tenant, as the store holds it. */
const T = showcaseTenant()
const tenant: DescribeTenant = { ...T, users: T.directory.people }
const dict = dictionaryOf(tenant)
const read = (text: string) => readText(text, dict)
const policy = (id: string) => T.policies.find((p) => p.id === id) as Policy

/* What the round trip compares: every id, the estimate, the name, the switch
   and the blank marker go, and a deny message unless the sentence quotes one. */
function stripRule(r: Rule, keepMessage: boolean): unknown {
  const { id: _id, matchEstimate: _m, name: _n, enabled: _e, pristine: _p, denyMessage, ...rest } = r
  void _id
  void _m
  void _n
  void _e
  void _p
  return {
    ...rest,
    when: { ...rest.when, cards: rest.when.cards.map(({ id: _k, ...k }) => (void _k, { ...k, conditions: k.conditions.map(({ id: _c, ...c }) => (void _c, c)) })) },
    ...(keepMessage && denyMessage ? { denyMessage } : null),
  }
}

describe('the four examples', () => {
  it('each reads to exactly its seeded policy', () => {
    for (const ex of EXAMPLES) {
      const seeded = policy(ex.policyId)
      const quoted = /[“"]/.test(ex.text)
      const r = read(ex.text)
      const c = compose(r.answers, tenant)
      expect(c.rules.map((x) => stripRule(x, quoted)), ex.label).toEqual(seeded.rules.map((x) => stripRule(x, quoted)))
      expect(c.fallback?.decision, ex.label).toBe(seeded.fallback?.decision)
      if (quoted) expect(c.fallback?.denyMessage, ex.label).toBe(seeded.fallback?.denyMessage)
      expect(c.audience, ex.label).toEqual(seeded.audience)
      expect(r.answers.apps.value, ex.label).toEqual(seeded.appIds)
    }
  })

  it('ask nothing and leave nothing out', () => {
    for (const ex of EXAMPLES) {
      const r = read(ex.text)
      expect(r.choices, ex.label).toEqual([])
      expect(r.notAdded, ex.label).toEqual([])
    }
  })

  it('read back from the sentence their answers make', () => {
    for (const ex of EXAMPLES) {
      const a = read(ex.text).answers
      const again = read(sentenceOf(a, tenant))
      expect(valuesOf(again.answers), ex.label).toEqual({ ...(valuesOf(a) as object), only: false })
      expect(again.choices, ex.label).toEqual([])
      expect(again.notAdded, ex.label).toEqual([])
    }
  })

  it('say what each answer is, in the panel’s words', () => {
    const hrms = read(EXAMPLES[0].text).answers
    expect(summaryOf('apps', hrms, tenant)).toBe('HRMS')
    expect(summaryOf('who', hrms, tenant)).toBe('Human Resources and Finance')
    expect(summaryOf('where', hrms, tenant)).toBe('Only from Corporate offices · Any time')
    expect(summaryOf('devices', hrms, tenant)).toBe('Any device')
    expect(summaryOf('signIn', hrms, tenant)).toBe('Allow with 2FA · Google Authenticator')
    expect(summaryOf('fallback', hrms, tenant)).toBe('Deny')
    expect(hrms.where.spans.map((s) => s.phrase)).toEqual(['only from a corporate office'])
    expect(hrms.scopeSaid).toBe(false)
    expect(compose(hrms, tenant).sources).toEqual(expect.objectContaining({}))
    expect(Object.values(compose(hrms, tenant).sources)).toEqual(['only from a corporate office'])

    const risk = read(EXAMPLES[1].text).answers
    expect(summaryOf('devices', risk, tenant)).toBe('Only Corporate devices · Medium from 40, high above 70')
    expect(risk.risk.spans.map((s) => s.phrase)).toEqual(['at low risk', 'at medium risk', 'at high risk'])
    expect(compose(risk, tenant).rules.map((r) => r.name)).toEqual(['Low risk', 'Medium risk', 'High risk'])
    expect(nameOf(risk, tenant)).toBe('Google Workspace on Corporate devices')

    const compliant = read(EXAMPLES[2].text).answers
    expect(compliant.who.origin).toBe('default')
    expect(summaryOf('who', compliant, tenant)).toBe('Everyone')
    expect(summaryOf('fallback', compliant, tenant)).toBe('Deny · Custom message')
    expect(leaveOutAsked(compliant, tenant)).toBe(false)

    const dev = read(EXAMPLES[3].text).answers
    expect(summaryOf('where', dev, tenant)).toBe('Corporate offices, inside and outside · Any time')
    expect(summaryOf('signIn', dev, tenant)).toBe('In Corporate offices: Allow on 1 factor · Elsewhere: Allow with 2FA')
    expect(Object.values(compose(dev, tenant).sources)).toEqual(['password in the office', 'miniOrange Push elsewhere'])
  })

  it('name the policy from the answers', () => {
    expect(nameOf(read(EXAMPLES[0].text).answers, tenant)).toBe('HRMS from Corporate offices')
    expect(nameOf(read(EXAMPLES[3].text).answers, tenant)).toBe('GitHub Enterprise and Jira from Corporate offices')
    expect(nameOf(read(EXAMPLES[0].text).answers, tenant, ['HRMS from Corporate offices'])).toBe('HRMS from Corporate offices 2')
  })
})

// --- Every combination ----------------------------------------------------------------

const GA: Outcome = { decision: '2fa', method: 'Google Authenticator', message: null }
const CYCLE: Outcome[] = [{ decision: '1fa', method: null, message: null }, GA, { decision: 'deny', method: null, message: null }]

const WHO: DescribeAnswers['who']['value'][] = ['everyone', { groupIds: ['hr'], userIds: [] }, { groupIds: ['sales', 'finance'], userIds: ['u-exec-2'] }]
const LEAVE = [{ groupIds: [], userIds: [] }, { groupIds: ['it-admins'], userIds: [] }]
const WHERE: WhereAnswer[] = [
  { mode: 'anywhere' },
  { mode: 'only', zoneId: 'corp-offices', scope: 'both' },
  { mode: 'split', zoneId: 'corp-offices', scope: 'both' },
  { mode: 'not', zoneId: 'india', scope: 'both' },
]
const WHEN: WhenAnswer[] = [{ mode: 'any' }, { mode: 'between', from: '09:00', to: '18:00', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], timeZone: 'Asia/Kolkata' }]
const DEVICES: DeviceAnswer[] = [{ mode: 'any' }, { mode: 'only', profileId: 'fp-compliant' }, { mode: 'not', profileId: 'fp-corp-devices' }]
const RISK: RiskAnswer[] = [{ mode: 'any' }, { mode: 'bands', mediumFrom: 40, highAbove: 70 }, { mode: 'above', score: 70 }]
const LAST: (Outcome | null)[] = [{ decision: 'deny', method: null, message: null }, { decision: '2fa', method: null, message: null }, null]

function* everyCombination(): Generator<DescribeAnswers> {
  for (const who of WHO)
    for (const leave of LEAVE)
      for (const where of WHERE)
        for (const when of WHEN)
          for (const devices of DEVICES)
            for (const risk of RISK) {
              if (where.mode === 'split' && risk.mode === 'bands') continue
              for (const last of LAST) {
                const a = emptyAnswers()
                a.apps = { value: ['hrms'], origin: 'picked', spans: [] }
                a.who = { value: who, origin: 'picked', spans: [] }
                a.leaveOut = { value: leave, origin: 'picked', spans: [] }
                a.where = { value: where, origin: 'picked', spans: [] }
                a.when = { value: when, origin: 'picked', spans: [] }
                a.devices = { value: devices, origin: 'picked', spans: [] }
                a.risk = { value: risk, origin: 'picked', spans: [] }
                const branches: BranchId[] = where.mode === 'split' ? ['inside', 'outside'] : risk.mode === 'bands' ? ['low', 'medium', 'high'] : ['match']
                branches.forEach((b, i) => {
                  a.signIn[b] = { value: CYCLE[i % 3], origin: 'picked', spans: [] }
                })
                a.fallback = last ? { value: last, origin: 'picked', spans: [] } : { value: null, origin: 'unset', spans: [] }
                yield a
              }
            }
}

const asPolicy = (a: DescribeAnswers): Policy => {
  const c = compose(a, tenant)
  return {
    id: 'p-described',
    name: 'Described',
    type: 'App Access',
    appIds: a.apps.value ?? [],
    audience: c.audience,
    status: 'draft',
    lastModified: 'Just now',
    modifiedBy: 'You',
    rules: c.rules,
    fallback: c.fallback,
  }
}

describe('every combination of answers', () => {
  const all = [...everyCombination()]

  it('is the number the enumeration says', () => {
    expect(all.length).toBe(1188)
  })

  it('composes a policy the linter finds no error in', () => {
    for (const a of all) {
      const p = asPolicy(a)
      const errors = diagnose(p, T.groups, T.hooks, T.directory.people, { zones: T.zones, fingerprints: T.fingerprints }).filter((d) => d.severity === 'error')
      expect(errors.map((d) => `${d.code} ${d.title}`), sentenceOf(a, tenant)).toEqual([])
    }
  })

  it('names nothing the tenant does not have', () => {
    const known = new Set([...T.zones, ...T.fingerprints, ...T.groups, ...T.directory.people, ...T.apps].map((x) => x.id))
    for (const a of all) {
      const p = asPolicy(a)
      const ids = [
        ...p.appIds,
        ...p.audience.groupIds,
        ...p.audience.userIds,
        ...p.rules.flatMap((r) => [...(r.who?.groupIds ?? []), ...(r.who?.userIds ?? []), ...(r.who?.exceptGroupIds ?? []), ...(r.who?.exceptUserIds ?? [])]),
        ...p.rules.flatMap((r) => leaves(r.when).filter((c) => c.typeId === 'zone' || c.typeId === 'fingerprint').flatMap((c) => c.values)),
      ]
      expect(ids.filter((id) => !known.has(id)), sentenceOf(a, tenant)).toEqual([])
    }
  })

  it('never writes a catch-all', () => {
    for (const a of all) {
      const bad = compose(a, tenant).rules.filter((r) => r.when.cards.length === 0 && !r.who)
      expect(bad, sentenceOf(a, tenant)).toEqual([])
    }
  })

  it('reads back, answer for answer, from the sentence it makes', () => {
    for (const a of all) {
      const s = sentenceOf(a, tenant)
      const r = read(s)
      expect(valuesOf(r.answers), s).toEqual(valuesOf(a))
      expect(r.choices, s).toEqual([])
      expect(r.notAdded, s).toEqual([])
    }
  })
})

// --- Words that are not what they look like ------------------------------------------

const pick = (r: Reading, phrase: string, value: string): Reading => {
  const c = r.choices.find((x) => x.span.phrase === phrase)
  if (!c) throw new Error(`No choice for “${phrase}”: ${r.choices.map((x) => x.span.phrase).join(', ')}`)
  return applyChoice(r, c.id, value, dict)
}
const conditionsOf = (r: Rule) => leaves(r.when).map((c) => `${c.typeId} ${c.operator} ${c.values.join(',')}`)

describe('word boundaries', () => {
  it('reads "admin dashboard" as nothing on this tenant', () => {
    const r = read('Step up admins on the admin dashboard')
    expect(r.notAdded.map((n) => [n.span.phrase, n.reason])).toEqual([['admin dashboard', 'Not an application, group or person on this tenant']])
    /* "admins" is the IT Admins alias in the spec's own table (§4.2), which
       leaves out "admin" and "it" alone — so the two words after it are no
       group, but "admins" is one. Scene 10 says Who stays Everyone; the
       table is kept, and which of the two is right is the owner's call. */
    expect(r.answers.who.value).toEqual({ groupIds: ['it-admins'], userIds: [] })
    expect(r.answers.who.origin).toBe('text')
    expect(r.answers.who.spans.map((x) => x.phrase)).toEqual(['admins'])
    expect(r.answers.signIn.match?.value).toEqual({ decision: '2fa', method: null, message: null })
  })

  it('reads "outside the office" as not in it, and writes no office rule', () => {
    const r = read('Block contractors signing in from outside the office')
    expect(r.notAdded).toEqual([])
    const c = compose(r.answers, tenant)
    expect(c.rules).toHaveLength(1)
    expect(c.rules[0].who).toEqual({ groupIds: ['contractors'], userIds: [] })
    expect(conditionsOf(c.rules[0])).toEqual(['zone not in zone corp-offices'])
    expect(c.rules[0].decision).toBe('deny')
    expect(c.rules.some((x) => leaves(x.when).some((k) => k.operator === 'in zone'))).toBe(false)
  })

  it('reads a two-letter place only in capitals', () => {
    /* "Let" is a verb it reads past; "us" is not the United States. */
    expect(read('Sales reach Salesforce. Let us know').notAdded.map((n) => n.span.phrase)).toEqual(['know'])
    expect(read('Sales reach Salesforce from the US').notAdded.map((n) => [n.span.phrase, n.reason])).toEqual([['from the US', 'No zone for United States']])
  })
})

describe('the manager’s sentences', () => {
  it('"MFA for all sales team members accessing the CRM from outside the US"', () => {
    const r = read('MFA for all sales team members accessing the CRM from outside the US')
    expect(r.notAdded.map((n) => [n.span.phrase, n.reason, n.action])).toEqual([['outside the US', 'No zone for United States', 'create-zone']])
    expect(openChoices(r).map((c) => [c.slot, c.span.phrase, c.options.map((o) => o.label)])).toEqual([['apps', 'the CRM', ['Salesforce', 'Another application']]])
    expect(r.answers.apps.origin).toBe('unset')
    expect(summaryOf('apps', r.answers, tenant)).toBe('Not set')
    expect(summaryOf('who', r.answers, tenant)).toBe('Sales')
    expect(r.answers.who.spans.map((s) => s.phrase)).toEqual(['sales team'])
    expect(summaryOf('signIn', r.answers, tenant)).toBe('Allow with 2FA · Any enabled method')

    const picked = pick(r, 'the CRM', 'salesforce')
    expect(picked.answers.apps.value).toEqual(['salesforce'])
    const c = compose(picked.answers, tenant)
    expect(c.rules).toHaveLength(1)
    expect(c.rules[0].who).toEqual({ groupIds: ['sales'], userIds: [] })
    expect(c.rules[0].when.cards).toEqual([])
    expect(c.rules[0].decision).toBe('2fa')
    expect(summaryOf('fallback', picked.answers, tenant)).toBe('Not reached')

    /* The policy's own applications, shown as the default, are replaced by
       the pick, as they would be by an application the text named. */
    const onDefault: Reading = { ...r, answers: { ...r.answers, apps: { value: ['github', 'jira'], origin: 'default', spans: [] } } }
    expect(pick(onDefault, 'the CRM', 'salesforce').answers.apps.value).toEqual(['salesforce'])
  })

  it('"block logins from unmanaged devices when the risk profile is high"', () => {
    const r = read('block logins from unmanaged devices when the risk profile is high')
    expect(r.notAdded).toEqual([])
    expect(openChoices(r).map((c) => [c.span.phrase, c.options.map((o) => o.label)])).toEqual([
      ['unmanaged devices', ['Not Corporate devices', "Don't add"]],
      ['the risk profile is high', ['Above 70', 'Above 39']],
    ])
    expect(compose(r.answers, tenant).rules).toEqual([])
    expect(summaryOf('apps', r.answers, tenant)).toBe('Not set')
    /* No rule refuses anybody yet, so nobody is asked to be left out. */
    expect(leaveOutAsked(r.answers, tenant)).toBe(false)

    const both = pick(pick(r, 'unmanaged devices', 'not:fp-corp-devices'), 'the risk profile is high', 'above:70')
    const c = compose(both.answers, tenant)
    expect(c.rules.map(conditionsOf)).toEqual([['fingerprint does not match fp-corp-devices', 'device-risk above 70']])
    expect(c.rules[0].decision).toBe('deny')
    expect(c.rules[0].who).toBeUndefined()
    expect(leaveOutAsked(both.answers, tenant)).toBe(true)
    expect(summaryOf('leaveOut', both.answers, tenant)).toBe('Nobody')

    const refused = pick(r, 'unmanaged devices', '-')
    expect(refused.notAdded.map((n) => [n.span.phrase, n.reason])).toEqual([['unmanaged devices', 'No MDM condition']])
  })
})

describe('asking where the tenant holds more than one', () => {
  it('asks which Nadia Haddad, and names nobody until answered', () => {
    const r = read('Nadia Haddad needs a passkey on Jira')
    expect(openChoices(r).map((c) => [c.slot, c.options.map((o) => `${o.label} · ${o.meta}`)])).toEqual([['who', ['Nadia Haddad · Contractors', 'Nadia Haddad · DevOps']]])
    expect(summaryOf('who', r.answers, tenant)).toBe('Not set')
    expect(compose(r.answers, tenant).rules).toEqual([])
    const done = pick(r, 'Nadia Haddad', 'user:u-dev-2')
    const c = compose(done.answers, tenant)
    expect(c.rules.map((x) => x.who)).toEqual([{ groupIds: [], userIds: ['u-dev-2'] }])
    expect(c.rules[0].secondFactorMethods).toEqual(['FIDO2 / Passkey'])
  })

  it('asks which profile a company laptop is, and writes no device condition until answered', () => {
    const r = read('Contractors reach GitHub and Jira only from the office on a company laptop; everyone else needs Google Authenticator.')
    expect(openChoices(r).map((c) => [c.slot, c.span.phrase, c.options.map((o) => o.label)])).toEqual([['devices', 'company laptop', ['Corporate devices', 'Compliant devices']]])
    expect(compose(r.answers, tenant).rules.map(conditionsOf)).toEqual([['zone in zone corp-offices'], []])
    const done = pick(r, 'company laptop', 'fp-corp-devices')
    const c = compose(done.answers, tenant)
    expect(c.rules.map((x) => [x.name, conditionsOf(x), x.decision])).toEqual([
      ['In Corporate offices, Corporate devices', ['zone in zone corp-offices', 'fingerprint matches fp-corp-devices'], '1fa'],
      ['Contractors elsewhere', [], 'deny'],
    ])
    expect(c.rules.every((x) => JSON.stringify(x.who) === JSON.stringify({ groupIds: ['contractors'], userIds: [] }))).toBe(true)
    expect(c.fallback?.decision).toBe('2fa')
    expect(c.fallback?.secondFactorMethods).toEqual(['Google Authenticator'])
    expect(c.audience.everyone).toBe(true)
  })

  it('gives a card no words from a question still open', () => {
    const r = read('Contractors reach GitHub and Jira only from the office on a company laptop; everyone else needs Google Authenticator.')
    const c = compose(r.answers, tenant)
    expect(c.sources[c.rules[0].id]).toBe('only from the office')
    const done = compose(pick(r, 'company laptop', 'fp-corp-devices').answers, tenant)
    expect(done.sources[done.rules[0].id]).toBe('only from the office · on a company laptop')
  })

  /* The box is rewritten from the answers after a click (describe spec,
     Assumption 9), so the sentence it gets must read back to the same policy —
     "only" and "everyone else" included, which decide a rule and the audience. */
  it('says "only" and "everyone else" back when they write a rule and keep the audience', () => {
    const done = pick(read('Contractors reach GitHub and Jira only from the office on a company laptop; everyone else needs Google Authenticator.'), 'company laptop', 'fp-corp-devices')
    const s = sentenceOf(done.answers, tenant)
    expect(s).toBe('Contractors reach GitHub Enterprise and Jira only from Corporate offices on Corporate devices: password. Everyone else needs Google Authenticator.')
    const again = read(s)
    expect(again.choices).toEqual([])
    expect(again.notAdded).toEqual([])
    const before = compose(done.answers, tenant)
    const after = compose(again.answers, tenant)
    expect(after.rules.map((x) => stripRule(x, false))).toEqual(before.rules.map((x) => stripRule(x, false)))
    expect(after.fallback?.secondFactorMethods).toEqual(['Google Authenticator'])
    expect(after.audience).toEqual(before.audience)
  })
})

describe('what the tenant has switched off', () => {
  it('sets a method that is off aside, and asks for any enabled one', () => {
    const r = read('Sales use Salesforce with OTP over SMS')
    expect(r.notAdded.map((n) => [n.span.phrase, n.reason, n.action])).toEqual([['OTP over SMS', 'OTP over SMS is off in Authentication methods', 'auth-methods']])
    expect(r.answers.signIn.match).toEqual({ value: { decision: '2fa', method: null, message: null }, origin: 'default', spans: [] })
  })
})

describe('two rules one sign-in can meet', () => {
  const text = 'Engineering and DevOps reach GitHub and Jira on a compliant device with miniOrange Push; in the office, password only.'

  it('asks which decides, as one sign-in, and writes neither until answered', () => {
    const r = read(text)
    const q = openChoices(r)
    expect(q.map((c) => [c.slot, c.span.phrase, c.options.map((o) => o.label)])).toEqual([
      ['order', 'in the office, password only', ['Allow on 1 factor · Password', 'Allow with 2FA · miniOrange Push']],
    ])
    expect(q[0].detail).toMatch(/^Arun Patel · GitHub Enterprise · Office network · /)
    expect(compose(r.answers, tenant).rules).toEqual([])
  })

  it('writes the chosen one first, and neither order is unreachable', () => {
    const r = read(text)
    const c = r.choices[0]
    for (const [value, first] of [
      ['1', 'zone in zone corp-offices'],
      ['0', 'fingerprint matches fp-compliant'],
    ]) {
      const done = applyChoice(r, c.id, value, dict)
      const comp = compose(done.answers, tenant)
      expect(comp.rules.map(conditionsOf)[0]).toEqual([first])
      expect(comp.rules).toHaveLength(2)
      const p = { ...asPolicy(done.answers), rules: comp.rules }
      const codes = diagnose(p, T.groups, T.hooks, T.directory.people, { zones: T.zones, fingerprints: T.fingerprints }).map((d) => d.code)
      expect(codes).not.toContain('PE102')
      expect(codes).not.toContain('PE103')
    }
  })

  it('drops a rule the first one always reaches before it', () => {
    const r = read('Engineering use Jira with miniOrange Push; in the office on a compliant device, password only.')
    const done = applyChoice(r, r.choices[0].id, '0', dict)
    const c = compose(done.answers, tenant)
    expect(c.rules).toHaveLength(1)
    expect(c.notAdded.map((n) => [n.span.phrase, n.reason])).toEqual([['in the office on a compliant device, password only', 'Never reached: Engineering decides first']])
  })
})

describe('the last row', () => {
  it('is the sign-in outcome when that outcome would have been everyone’s', () => {
    const r = read('Everyone reaches Salesforce with MFA. Block anything else.')
    const c = compose(r.answers, tenant)
    expect(c.rules).toEqual([])
    expect(c.merged).toBe(true)
    expect(c.fallback?.decision).toBe('2fa')
    expect(lastRowOf(r.answers, tenant)).toBe('merged')
    /* The last row holds the outcome, so it says the outcome, in the same words. */
    expect(summaryOf('fallback', r.answers, tenant)).toBe('Allow with 2FA · Any enabled method')
  })

  it('is left as it is when the text says nothing about it', () => {
    expect(compose(read('Sales reach Salesforce with MFA from the office').answers, tenant).fallback).toBeUndefined()
  })
})

describe('the answers before anything is typed', () => {
  it('are defaults, with Sign-in and the last row not set', () => {
    const a = emptyAnswers()
    expect(summaryOf('apps', a, tenant)).toBe('Not set')
    expect(summaryOf('who', a, tenant)).toBe('Everyone')
    expect(summaryOf('where', a, tenant)).toBe('Anywhere · Any time')
    expect(summaryOf('devices', a, tenant)).toBe('Any device')
    expect(summaryOf('signIn', a, tenant)).toBe('Not set')
    expect(summaryOf('fallback', a, tenant)).toBe('Not set')
    expect(compose(a, tenant).rules).toEqual([])
  })

  it('make the sentence scene 13 builds by clicks alone', () => {
    const a = emptyAnswers()
    a.apps = { value: ['outlook', 'dropbox'], origin: 'picked', spans: [] }
    a.devices = { value: { mode: 'only', profileId: 'fp-compliant' }, origin: 'picked', spans: [] }
    a.signIn.match = { value: { decision: '1fa', method: null, message: null }, origin: 'picked', spans: [] }
    a.fallback = { value: { decision: 'deny', method: null, message: null }, origin: 'picked', spans: [] }
    const s = sentenceOf(a, tenant)
    expect(s).toBe('Everyone reaches Microsoft Outlook and Dropbox on Compliant devices: password. Block anything else.')
    const seeded = policy('sc-device-compliance')
    expect(compose(read(s).answers, tenant).rules.map((x) => stripRule(x, false))).toEqual(seeded.rules.map((x) => stripRule(x, false)))
  })
})

describe('a sentence that asks for no decision', () => {
  it('writes no rule: only a verb that lets people in defaults to Allow on 1 factor', () => {
    const r = read('Contractors on Jira')
    expect(r.answers.signIn.match).toBeUndefined()
    expect(summaryOf('signIn', r.answers, tenant)).toBe('Not set')
    expect(compose(r.answers, tenant).rules).toEqual([])
    /* With the verb, it is the default the spec gives (§4.3). */
    expect(read('Contractors use Jira').answers.signIn.match).toEqual({ value: { decision: '1fa', method: null, message: null }, origin: 'default', spans: [] })
  })

  it('is said back with no verb that lets anyone in, so the box reads back to Sign-in not set', () => {
    const a = emptyAnswers()
    a.apps = { value: ['salesforce'], origin: 'picked', spans: [] }
    a.when = { value: { mode: 'between', from: '09:00', to: '18:00', days: [], timeZone: 'Asia/Kolkata' }, origin: 'picked', spans: [] }
    const s = sentenceOf(a, tenant)
    expect(s).toBe('Everyone signing in to Salesforce between 09:00 and 18:00.')
    const again = read(s)
    expect(again.answers.signIn).toEqual({})
    expect(valuesOf(again.answers)).toEqual(valuesOf(a))
    expect(compose(again.answers, tenant).rules).toEqual([])
  })
})

describe('the verb in the sentence the answers make', () => {
  const answersFor = (who: DescribeAnswers['who']['value']): DescribeAnswers => {
    const a = emptyAnswers()
    a.apps = { value: ['hrms'], origin: 'picked', spans: [] }
    a.who = { value: who, origin: 'picked', spans: [] }
    a.signIn.match = { value: { decision: '1fa', method: null, message: null }, origin: 'picked', spans: [] }
    return a
  }

  it('agrees with who: one person or everyone reaches, a group reach', () => {
    expect(sentenceOf(answersFor('everyone'), tenant)).toBe('Everyone reaches HRMS: password.')
    expect(sentenceOf(answersFor({ groupIds: [], userIds: ['u-exec-2'] }), tenant)).toBe('Vikram Nair reaches HRMS: password.')
    expect(sentenceOf(answersFor({ groupIds: ['sales'], userIds: [] }), tenant)).toBe('Sales reach HRMS: password.')
    const whos: DescribeAnswers['who']['value'][] = ['everyone', { groupIds: [], userIds: ['u-exec-2'] }]
    for (const who of whos) {
      const a = answersFor(who)
      const again = read(sentenceOf(a, tenant))
      expect(valuesOf(again.answers)).toEqual(valuesOf(a))
      expect(again.notAdded).toEqual([])
    }
  })
})

describe('an answer picked by hand with its object still to choose', () => {
  const hand = (where: WhereAnswer, devices: DeviceAnswer, who: DescribeAnswers['who']['value']): DescribeAnswers => {
    const a = emptyAnswers()
    a.apps = { value: ['hrms'], origin: 'picked', spans: [] }
    a.who = { value: who, origin: 'picked', spans: [] }
    a.where = { value: where, origin: where.mode !== 'anywhere' && !where.zoneId ? 'unset' : 'picked', spans: [] }
    a.devices = { value: devices, origin: devices.mode !== 'any' && !devices.profileId ? 'unset' : 'picked', spans: [] }
    for (const b of ['match', 'inside', 'outside'] as const) a.signIn[b] = { value: { decision: '1fa', method: null, message: null }, origin: 'picked', spans: [] }
    a.fallback = { value: { decision: 'deny', method: null, message: null }, origin: 'picked', spans: [] }
    return a
  }
  const cases: DescribeAnswers[] = []
  const whos: DescribeAnswers['who']['value'][] = ['everyone', { groupIds: ['sales'], userIds: [] }]
  for (const who of whos) {
    for (const mode of ['only', 'not'] as const) cases.push(hand({ mode: 'anywhere' }, { mode, profileId: '' }, who))
    for (const mode of ['only', 'not', 'split'] as const) cases.push(hand({ mode, zoneId: '', scope: 'both' }, { mode: 'any' }, who))
  }

  it('composes no condition with a blank value, and nothing the linter calls an error', () => {
    for (const a of cases) {
      const p = asPolicy(a)
      const blank = p.rules.flatMap((r) => leaves(r.when)).filter((c) => c.values.length === 0 || c.values.some((v) => v === ''))
      expect(blank, JSON.stringify([a.where.value, a.devices.value])).toEqual([])
      const errors = diagnose(p, T.groups, T.hooks, T.directory.people, { zones: T.zones, fingerprints: T.fingerprints }).filter((d) => d.severity === 'error')
      expect(errors.map((d) => d.code), JSON.stringify([a.where.value, a.devices.value])).toEqual([])
    }
  })

  it('reads Not set, and names and says nothing of it', () => {
    const a = cases[2]
    expect(summaryOf('where', a, tenant)).toBe('Not set')
    expect(nameOf(a, tenant)).toBe('HRMS')
    expect(sentenceOf(a, tenant)).toBe('Everyone reaches HRMS: password. Block anything else.')
  })
})

describe('the Sign-in rows', () => {
  it('names a later sentence’s rule with no conditions by the name its card carries', () => {
    const a = emptyAnswers()
    a.apps = { value: ['jira'], origin: 'picked', spans: [] }
    a.who = { value: { groupIds: ['engineering'], userIds: [] }, origin: 'picked', spans: [] }
    a.signIn.match = { value: { decision: '1fa', method: null, message: null }, origin: 'picked', spans: [] }
    a.more = [
      {
        where: { value: { mode: 'anywhere' }, origin: 'default', spans: [] },
        devices: { value: { mode: 'any' }, origin: 'default', spans: [] },
        risk: { value: { mode: 'any' }, origin: 'default', spans: [] },
        when: { value: { mode: 'any' }, origin: 'default', spans: [] },
        outcome: { value: { decision: 'deny', method: null, message: null }, origin: 'text', spans: [] },
        span: { start: 0, end: 0, phrase: 'block' },
      },
    ]
    expect(compose(a, tenant).rules.map((r) => r.name)).toContain('Engineering')
    expect(summaryOf('signIn', a, tenant)).toBe('When it matches: Allow on 1 factor · Engineering: Deny')
  })
})

/* Which answer is open (describe spec, §3.4): the first that needs something,
   and a change closes an answer only when it filled its last missing value. */
describe('which answer is open', () => {
  const reading = (a: DescribeAnswers): Reading => ({ text: '', answers: a, choices: [], notAdded: [], clauses: [] })
  const withApps = (): DescribeAnswers => ({ ...emptyAnswers(), apps: { value: ['hrms'], origin: 'picked', spans: [] } })
  const set = (x: DescribeAnswers, patch: Partial<DescribeAnswers>) => reading({ ...x, ...patch })
  const ONE: Outcome = { decision: '1fa', method: null, message: null }

  it('opens the first answer that needs something, on a panel nothing has been read into', () => {
    expect(firstNeeding(reading(emptyAnswers()), tenant)).toBe('apps')
    expect(firstNeeding(reading({ ...emptyAnswers(), apps: { value: ['hrms'], origin: 'default', spans: [] } }), tenant)).toBe('signIn')
  })

  it('stays open for a change that fills nothing: Between and its times, a band stepped', () => {
    const a = withApps()
    const between = set(a, { when: { value: { mode: 'between', from: '09:00', to: '18:00', days: [], timeZone: 'Asia/Kolkata' }, origin: 'picked', spans: [] } })
    expect(openAfter(reading(a), between, 'where', 'where', tenant)).toBe('where')
    const later = set(between.answers, { when: { value: { mode: 'between', from: '10:00', to: '18:00', days: [], timeZone: 'Asia/Kolkata' }, origin: 'picked', spans: [] } })
    expect(openAfter(between, later, 'where', 'where', tenant)).toBe('where')
    const bands = set(a, { risk: { value: { mode: 'bands', mediumFrom: 40, highAbove: 70 }, origin: 'picked', spans: [] } })
    const stepped = set(a, { risk: { value: { mode: 'bands', mediumFrom: 41, highAbove: 70 }, origin: 'picked', spans: [] } })
    expect(openAfter(bands, stepped, 'devices', 'devices', tenant)).toBe('devices')
  })

  it('closes on the pick that fills the last missing value, and opens the next that needs something', () => {
    const a = withApps()
    const only = set(a, { devices: { value: { mode: 'only', profileId: '' }, origin: 'unset', spans: [] } })
    expect(openAfter(reading(a), only, 'devices', 'devices', tenant)).toBe('devices')
    const chosen = set(a, { devices: { value: { mode: 'only', profileId: 'fp-compliant' }, origin: 'picked', spans: [] } })
    expect(openAfter(only, chosen, 'devices', 'devices', tenant)).toBe('signIn')
  })

  it('counts a Sign-in with one branch undecided as not set, though its summary names the other', () => {
    const split = withApps()
    split.where = { value: { mode: 'split', zoneId: 'corp-offices', scope: 'both' }, origin: 'picked', spans: [] }
    const one: DescribeAnswers = { ...split, signIn: { inside: { value: ONE, origin: 'picked', spans: [] } } }
    expect(summaryOf('signIn', one, tenant)).toBe('In Corporate offices: Allow on 1 factor · Elsewhere: Not set')
    expect(signInMissing(one)).toBe(true)
    expect(answerMissing('signIn', one, tenant)).toBe(true)
    expect(firstNeeding(reading(one), tenant)).toBe('signIn')
    expect(openAfter(reading(split), reading(one), 'signIn', 'signIn', tenant)).toBe('signIn')
    const both: DescribeAnswers = { ...one, signIn: { ...one.signIn, outside: { value: ONE, origin: 'picked', spans: [] } } }
    expect(openAfter(reading(one), reading(both), 'signIn', 'signIn', tenant)).toBeNull()
  })

  it('stays open for a change that brings a control of its own, or a list open for more', () => {
    const a = withApps()
    const twoFactor = set(a, { signIn: { match: { value: { decision: '2fa', method: null, message: null }, origin: 'picked', spans: [] } } })
    expect(openAfter(reading(a), twoFactor, 'signIn', 'signIn', tenant, true)).toBe('signIn')
    const first = set(emptyAnswers(), { apps: { value: ['outlook'], origin: 'picked', spans: [] } })
    expect(openAfter(reading(emptyAnswers()), first, 'apps', 'apps', tenant, true)).toBe('apps')
  })
})
