import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../fixtures'
import {
  ATTEMPTS_LINK,
  REVIEW_ATTEMPTS,
  attemptPlay,
  attemptsGetThroughSaid,
  attemptsOnSaid,
  breakInOnApp,
  breakInSummary,
  decidedByLine,
  fixOnArrival,
  holesOf,
  offeredAppFix,
  runBreakInOnApp,
  type AppBreakInResult,
} from './break-in-app'
import { acceptanceFor, fixLine, groupRows } from './break-in-model'
import { TYPED_DECK, runBreakIn } from './gauntlet'
import { outcomePhrase, type NameLookup } from './predicate-prose'
import { expectMark } from './sign-in-tests/journey'
import { envOf, resolveSignIn } from './tenant-resolver'
import { factsOf, formOf } from './testing/sign-in-form'
import { loosens } from './what-changes'

/* -----------------------------------------------------------------------------
   Break-in attempts on an application, across the tenant (break-in-app.ts),
   on the showcase tenant as the page opens on it — HRMS still Inactive.

   Pinned per application, so a seed change that moves what gets through on
   AWS or Box is seen here first: the counts, which policy decided which
   cards, the fixes offered and the ones withheld. Then the properties the
   page leans on: no card is skipped, a card is judged exactly as the
   builder's run judges it, pressing a row plays the same sign-in, and a fix
   is never looser.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const env = envOf(t)
const stored = (id: string) => t.policies.find((p) => p.id === id)!
const resolve: NameLookup = (kind, id) =>
  kind === 'zone' ? t.zones.find((z) => z.id === id)?.name : kind === 'fingerprint' ? t.fingerprints.find((p) => p.id === id)?.name : undefined
const APPS = [...new Set(t.policies.filter((p) => p.type === 'App Access' && !p.isSystem).flatMap((p) => p.appIds))]
const rowOf = (r: AppBreakInResult, cardId: string) => r.rows.find((x) => x.id === cardId)!
const GD = t.policies.find((p) => p.isSystem)!

describe('AWS Console', () => {
  const r = runBreakInOnApp(t.policies, 'aws', env)

  it('counts 3 got through, 2 locked out, 1 less than asked and 1 can’t tell', () => {
    expect(r.counts).toEqual({ held: 8, gotThrough: 3, weakerFactor: 0, lessThanAsked: 1, lockedOut: 2, extraPrompts: 0, undecided: 1, skipped: 0 })
    expect(breakInSummary(r, env)).toEqual({ appId: 'aws', appName: 'AWS Console', counts: r.counts, holes: 4 })
  })

  /* In the order the resolver asks them: the custom policies, then the
     Global Default — the last resort, though it is first in the list. */
  it('hands each card to the policy that covers its person, in tenant order, and the executive to the Global Default', () => {
    expect(t.policies.findIndex((p) => p.isSystem)).toBe(0)
    expect(r.deciders.map((d) => [d.policyId, d.cardIds])).toEqual([
      ['sc-aws-engineering', ['no-mfa', 'expired-trust', 'nightshift', 'unmanaged-contractor', 'aitm-relay', 'office-regular', 'after-reset', 'roaming-unknown-origin']],
      ['sc-aws-finance', ['proxy-finance', 'risk-inside', 'push-bombing', 'finance-home', 'first-login']],
      [GD.id, ['tor-exec', 'exec-office']],
    ])
  })

  it('lists the holes first, each with the policy and rule that decided it', () => {
    const groups = groupRows(r.rows)
    expect(groups.map((g) => [g.word, g.rows.map((x) => x.id)])).toEqual([
      ['Got through', ['proxy-finance', 'expired-trust', 'aitm-relay']],
      ['Less than asked', ['after-reset']],
      ['Locked out', ['first-login', 'roaming-unknown-origin']],
      ["Can't tell", ['tor-exec']],
      ['Held', ['no-mfa', 'nightshift', 'risk-inside', 'unmanaged-contractor', 'push-bombing', 'office-regular', 'exec-office', 'finance-home']],
    ])
    const proxy = rowOf(r, 'proxy-finance')
    expect([proxy.expected, proxy.got, proxy.policyName, proxy.ruleRef]).toEqual(['deny', '2fa', 'AWS billing for Finance', stored('sc-aws-finance').rules[0].id])
    expect(decidedByLine(proxy)).toBe('Decided by AWS billing for Finance · Rule 1')
    expect(decidedByLine(rowOf(r, 'roaming-unknown-origin'))).toBe('Decided by AWS for engineering teams · Last row')
    /* The Global Default decides it, and which of its rules can't be told: a Tor exit has no place. */
    const tor = rowOf(r, 'tor-exec')
    expect([tor.isGlobalDefault, tor.status, decidedByLine(tor)]).toEqual([true, 'depends', 'Decided by Global Default Policy'])
    expect(rowOf(r, 'expired-trust').story).toBe('A device last verified over a year ago comes back from an unrecognised network.')
  })

  it('closes the proxy with a rule above Compliant device, and previews Got through 2', () => {
    const proxy = rowOf(r, 'proxy-finance')
    const offer = offeredAppFix(proxy, t.policies, 'aws', env, r.counts)!
    expect(offer.policy.id).toBe('sc-aws-finance')
    expect(fixLine(offer.fix, offer.policy, resolve)).toBe('Deny sign-ins from outside India — If not in zone India → Deny · at position 1')
    expect(offer.preview.counts.gotThrough).toBe(2)
    expect(offer.preview.changed).toEqual(['gotThrough'])
    expect(offer.preview.moved).toBe('Got through now 2.')
    /* The rule it adds has its outcome chosen: the card says Deny, not "Outcome not chosen yet". */
    if (offer.fix.kind !== 'rule') throw new Error('expected a rule fix')
    expect(offer.fix.fix.rule.pristine).toBeUndefined()
    expect(outcomePhrase(offer.fix.fix.rule)).toBe('deny')
    expect(offer.preview.line.appNames).toEqual(['AWS Console'])
    expect(loosens(offer.preview.line)).toBe(false)
  })

  it('offers no fix where the card names none, or where its fix would loosen', () => {
    for (const id of ['expired-trust', 'aitm-relay', 'after-reset', 'first-login', 'roaming-unknown-origin', 'tor-exec']) {
      expect(offeredAppFix(rowOf(r, id), t.policies, 'aws', env, r.counts), id).toBeNull()
    }
  })
})

describe('Box', () => {
  const r = runBreakInOnApp(t.policies, 'box', env)

  it('counts 1 got through, 1 less than asked and 2 can’t tell', () => {
    expect(r.counts).toEqual({ held: 11, gotThrough: 1, weakerFactor: 0, lessThanAsked: 1, lockedOut: 0, extraPrompts: 0, undecided: 2, skipped: 0 })
    expect(holesOf(r.counts)).toBe(2)
  })

  it('leaves everybody outside Engineering and Design to the Global Default', () => {
    expect(r.deciders.map((d) => [d.policyId, d.cardIds])).toEqual([
      ['sc-box-engineering', ['expired-trust', 'aitm-relay', 'office-regular', 'after-reset', 'roaming-unknown-origin']],
      [GD.id, ['tor-exec', 'proxy-finance', 'no-mfa', 'nightshift', 'risk-inside', 'unmanaged-contractor', 'push-bombing', 'exec-office', 'finance-home', 'first-login']],
    ])
  })

  it('names the Global Default as what lets the risky office session through, and offers it no fix', () => {
    const risk = rowOf(r, 'risk-inside')
    expect([risk.group, risk.isGlobalDefault, decidedByLine(risk)]).toEqual(['got-through', true, 'Decided by Global Default Policy · Rule 1'])
    expect(offeredAppFix(risk, t.policies, 'box', env, r.counts)).toBeNull()
  })
})

describe('every application with a policy', () => {
  const runs = APPS.map((appId) => runBreakInOnApp(t.policies, appId, env))

  it('is every App Access application in the showcase', () => {
    expect(APPS).toEqual(['hrms', 'google-workspace', 'outlook', 'dropbox', 'github', 'jira', 'aws', 'slack', 'box'])
  })

  it('skips no card: someone always decides, and every card is counted once', () => {
    for (const r of runs) {
      expect(r.rows.map((x) => x.id), r.appId).toEqual(TYPED_DECK.map((c) => c.id))
      expect(r.counts.skipped).toBe(0)
      const { skipped, ...rest } = r.counts
      expect(skipped + Object.values(rest).reduce((a, b) => a + b, 0), r.appId).toBe(TYPED_DECK.length)
      expect(r.rows.every((x) => x.policyId !== null)).toBe(true)
    }
  })

  it('judges each card exactly as the builder’s run on the deciding policy does', () => {
    for (const r of runs) {
      for (const row of r.rows) {
        if (row.isGlobalDefault) continue
        const alone = runBreakIn(stored(row.policyId!), env, { deck: [row.round.challenge] }).rounds[0]
        expect(alone.outcome, `${r.appId} ${row.id}`).toBe(row.round.outcome)
        expect(alone.trace.hitIndex, `${r.appId} ${row.id}`).toBe(row.round.trace.hitIndex)
      }
    }
  })

  /* Pressing a row plays it as a normal access check, through the page's form:
     the run there must land where the row says. */
  it('plays a row through the form to the same policy and the same answer', () => {
    for (const r of runs) {
      for (const row of r.rows) {
        const play = attemptPlay(row, r.appId, t.policies)
        const res = resolveSignIn(t.policies, factsOf(formOf(play.facts, t.zones), t.zones).facts, env)
        expect(res.decidedBy?.policyId, `${r.appId} ${row.id}`).toBe(row.policyId)
        expect(res.decision, `${r.appId} ${row.id}`).toBe(row.round.trace.settled ? row.got : null)
      }
    }
  })

  /* And the canvas says of the run what the panel said of the row (review,
     1 Oct 2026): a held attempt never plays as a failure, even stopped
     harder than its card asks; a Weaker factor one, given the answer it
     asked for, says the factor; every other hole and cost fails; and can't
     tell is no pass either (Depends, "Expected …"). Every application,
     every card. */
  it('plays a row to the verdict its group says: the answer’s mark is the panel’s heading', () => {
    const want: Record<string, ReturnType<typeof expectMark>> = { held: null, 'weaker-factor': 'weaker' }
    const seen = new Set<string>()
    let stricter = 0
    for (const r of runs) {
      for (const row of r.rows) {
        const play = attemptPlay(row, r.appId, t.policies)
        const res = resolveSignIn(t.policies, factsOf(formOf(play.facts, t.zones), t.zones).facts, env)
        const decided = res.status === 'decided' ? res.decision : null
        const mark = expectMark(decided, play.expected, play.weaker)
        expect(mark, `${r.appId} ${row.id} ${row.group}`).toBe(row.group in want ? want[row.group] : 'fails')
        seen.add(row.group)
        if (row.group === 'held' && row.got !== row.round.want) stricter += 1
        if (row.group !== 'held') expect(play.expected, `${r.appId} ${row.id}`).toBe(row.expected)
      }
    }
    /* Not vacuous: every group the showcase reaches is played, threats stopped harder than asked among the held. */
    expect([...seen].sort()).toEqual(['cant-tell', 'got-through', 'held', 'less-than-asked', 'locked-out', 'weaker-factor'])
    expect(stricter).toBeGreaterThan(0)
  })

  it('a Weaker factor row carries what was offered and what the attack needs; a held one, the answer it held with', () => {
    const relay = rowOf(runBreakInOnApp(t.policies, 'github', env), 'aitm-relay')
    expect(relay.group).toBe('weaker-factor')
    expect(attemptPlay(relay, 'github', t.policies)).toMatchObject({ expected: '2fa', weaker: 'miniOrange Push · standard · needs phishing-resistant' })
    const held = rowOf(runBreakInOnApp(t.policies, 'aws', env), 'unmanaged-contractor')
    expect([held.group, held.expected, held.got]).toEqual(['held', '2fa', 'deny'])
    expect(attemptPlay(held, 'aws', t.policies)).toMatchObject({ expected: 'deny', weaker: null })
  })

  it('never offers a looser fix, nor one for the Global Default', () => {
    let offered = 0
    for (const r of runs) {
      for (const row of r.rows) {
        const offer = offeredAppFix(row, t.policies, r.appId, env, r.counts)
        if (!offer) continue
        offered += 1
        expect(row.isGlobalDefault).toBe(false)
        expect(loosens(offer.preview.line), `${r.appId} ${row.id}`).toBe(false)
      }
    }
    /* Not vacuous: the proxy on Outlook, Dropbox, GitHub, Jira and AWS, and the relay on GitHub and Jira. */
    expect(offered).toBe(7)
  })

  it('previews the counts that applying the fix gives', () => {
    for (const r of runs) {
      for (const row of r.rows) {
        const offer = offeredAppFix(row, t.policies, r.appId, env, r.counts)
        if (!offer) continue
        const arrived = fixOnArrival(offer.policy, row.id, r.appId, env)
        if (!('next' in arrived)) throw new Error(`${r.appId} ${row.id}: ${arrived.none}`)
        const fixed = t.policies.map((p) => (p.id === offer.policy.id ? arrived.next : p))
        expect(runBreakInOnApp(fixed, r.appId, env).counts, `${r.appId} ${row.id}`).toEqual(offer.preview.counts)
      }
    }
  })
})

describe('acceptances from the builder', () => {
  it('are read for the policy that decided the card, and only that one', () => {
    const before = runBreakInOnApp(t.policies, 'aws', env)
    const proxy = rowOf(before, 'proxy-finance')
    const a = acceptanceFor(proxy.round, 'Jaspreet Toor', '2026-10-01T08:35:00.000Z', 'Finance is on 2FA everywhere')!
    const after = runBreakInOnApp(t.policies, 'aws', env, { accepted: { 'sc-aws-finance': { 'proxy-finance': a } } })
    expect(after.counts.gotThrough).toBe(2)
    expect(rowOf(after, 'proxy-finance')).toMatchObject({ group: 'held', accepted: a, expected: '2fa' })
    const elsewhere = runBreakInOnApp(t.policies, 'aws', env, { accepted: { 'sc-aws-engineering': { 'proxy-finance': a } } })
    expect(elsewhere.counts).toEqual(before.counts)
  })
})

describe('a tenant with no Global Default', () => {
  it('reads a card nobody covers as can’t tell, with no policy named', () => {
    const r = runBreakInOnApp(t.policies.filter((p) => !p.isSystem), 'aws', env)
    const tor = rowOf(r, 'tor-exec')
    expect([tor.group, tor.policyId, tor.status, tor.ruleLabel, tor.got]).toEqual(['cant-tell', null, 'incomplete', '', null])
    expect(decidedByLine(tor)).toBe('No policy decides this sign-in')
    /* The executive at their desk too: the Global Default was all that covered Mehak on AWS. */
    expect(rowOf(r, 'exec-office').policyId).toBeNull()
    expect(r.counts.undecided).toBe(2)
    expect(r.rows).toHaveLength(TYPED_DECK.length)
    expect(offeredAppFix(tor, t.policies, 'aws', env, r.counts)).toBeNull()
  })
})

describe('breakInOnApp', () => {
  it('is one run until the policies, the env or the acceptances change', () => {
    const accepted = {}
    const first = breakInOnApp(t.policies, 'aws', env, { accepted })
    expect(breakInOnApp(t.policies, 'aws', env, { accepted })).toBe(first)
    expect(breakInOnApp(t.policies, 'box', env, { accepted })).not.toBe(first)
    expect(breakInOnApp(t.policies, 'aws', env, { accepted: {} })).not.toBe(first)
    expect(breakInOnApp([...t.policies], 'aws', env, { accepted })).not.toBe(first)
    expect(breakInOnApp(t.policies, 'aws', env, { accepted }).counts).toEqual(runBreakInOnApp(t.policies, 'aws', env).counts)
  })
})

describe('fixOnArrival', () => {
  it('adds the proxy’s rule to AWS billing for Finance and selects the new rule', () => {
    const p = stored('sc-aws-finance')
    const arrived = fixOnArrival(p, 'proxy-finance', 'aws', env, { policies: t.policies })
    if (!('next' in arrived)) throw new Error(arrived.none)
    expect(arrived.toast).toBe('Rule added. Not saved yet.')
    expect(arrived.next.rules).toHaveLength(p.rules.length + 1)
    expect(arrived.ruleRef).toBe(arrived.next.rules[0].id)
    expect(arrived.next.rules[0].name).toBe('Deny sign-ins from outside India')
    /* Born with its outcome chosen: no pristine mark for the card to read as "Outcome not chosen yet", saved or not. */
    expect(arrived.next.rules[0].pristine).toBeUndefined()
    expect(outcomePhrase(arrived.next.rules[0])).toBe('deny')
    /* And on the draft it made, the card holds. */
    expect(fixOnArrival(arrived.next, 'proxy-finance', 'aws', env)).toEqual({ none: 'This draft already holds that sign-in.' })
  })

  it('asks the relay’s rule on GitHub for FIDO2 / Passkey', () => {
    const tools = stored('sc-dev-tools')
    const arrived = fixOnArrival(tools, 'aitm-relay', 'github', env, { policies: t.policies })
    if (!('next' in arrived)) throw new Error(arrived.none)
    expect(arrived.toast).toBe('Second factor changed on rule 2. Not saved yet.')
    expect(arrived.ruleRef).toBe(tools.rules[1].id)
    expect(arrived.next.rules[1]).toMatchObject({ secondFactor: 'specific', secondFactorMethods: ['FIDO2 / Passkey'] })
  })

  it('changes nothing, and says why in a line, when no fix fits the draft', () => {
    const p = stored('sc-aws-finance')
    expect(fixOnArrival(p, 'proxy-finance', 'box', env)).toEqual({ none: 'This draft does not cover Box.' })
    expect(fixOnArrival(p, 'unmanaged-contractor', 'aws', env)).toEqual({ none: 'This draft does not cover Devon Rao.' })
    expect(fixOnArrival(stored('sc-box-engineering'), 'after-reset', 'box', env)).toEqual({ none: 'No fix fits this draft. Nothing changed.' })
    expect(fixOnArrival(GD, 'risk-inside', 'box', env)).toEqual({ none: 'The Global Default takes no fixes from here.' })
    expect(fixOnArrival(p, 'no-such-card', 'aws', env)).toEqual({ none: 'That sign-in is not in the Break-in test.' })
  })

  /* expired-trust's own fix is there on AWS for engineering teams, and the
     page withholds it: it would let in, with 2FA, sign-ins the rules below
     deny today. Handed the tenant, the builder withholds it too. */
  it('withholds a looser fix when it is handed the tenant', () => {
    const eng = stored('sc-aws-engineering')
    expect('next' in fixOnArrival(eng, 'expired-trust', 'aws', env)).toBe(true)
    expect(fixOnArrival(eng, 'expired-trust', 'aws', env, { policies: t.policies })).toEqual({ none: 'That fix would let others in more easily. Nothing changed.' })
  })
})

describe('the words', () => {
  it('name the application, and no number', () => {
    expect(attemptsOnSaid('AWS Console')).toBe('Break-in attempts on AWS Console')
    expect(attemptsGetThroughSaid('AWS Console')).toBe('Break-in attempts get through on AWS Console')
    expect([REVIEW_ATTEMPTS, ATTEMPTS_LINK]).toEqual(['Review attempts', 'Break-in attempts'])
  })
})
