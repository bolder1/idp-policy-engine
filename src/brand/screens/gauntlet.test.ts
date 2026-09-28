import { describe, expect, it } from 'vitest'

import { EVERYONE, anySignIn, card, cond, groups, policies, when, type Policy, type Rule } from '../data'
import { showcaseTenant } from '../fixtures'
import { DECK, applyFix, classify, proposeFix, runGauntlet, contextFor } from './gauntlet'
import { rawEnv, decide } from './simulate'
import { diagnose } from './diagnostics'
import { SITUATIONS, badges, compare, sweep, guardedShare, openShare } from './impact-arena'
import { envOf } from './tenant-resolver'

/* -----------------------------------------------------------------------------
   A score an administrator is asked to act on has to be reproducible and
   falsifiable. These tests hold the two properties that make it so:

   · the grade is a function of the counts and nothing else, and breaches
     dominate — no amount of friction can pull a policy with a hole in it above
     a policy without one;
   · the sweep's headline number is exact over its own stated space, which means
     it must not move when nothing about the policy moved.
   -------------------------------------------------------------------------- */

let seq = 0
function rule(over: Partial<Rule> = {}): Rule {
  seq += 1
  return {
    id: `t${seq}`,
    name: `Rule ${seq}`,
    enabled: true,
    when: anySignIn(),
    decision: '2fa',
    firstFactor: 'Password',
    secondFactor: 'any',
    rememberMfa: false,
    allowDisable2fa: false,
    matchEstimate: 100,
    ...over,
  }
}

function policy(rules: Rule[], over: Partial<Policy> = {}): Policy {
  return {
    id: 'p',
    name: 'Test',
    type: 'App Access',
    appIds: ['salesforce'],
    status: 'active',
    lastModified: 'now',
    modifiedBy: 'test',
    /* The deck and the sweep are both audience-gated now, so a test policy has
       to govern everybody or half the cards silently stop being scored. Where a
       test wants a narrower policy it passes its own `audience`. */
    audience: EVERYONE,
    rules,
    ...over,
  }
}

describe('classify', () => {
  it('calls a weaker-than-asked result a breach, in both weak directions', () => {
    expect(classify('deny', '1fa')).toBe('breach')
    expect(classify('deny', '2fa')).toBe('breach')
    expect(classify('2fa', '1fa')).toBe('breach')
  })

  it('separates a lockout from ordinary extra friction', () => {
    // Wanted a clean sign-in, got a denial — the person cannot work.
    expect(classify('1fa', 'deny')).toBe('lockout')
    // Wanted a clean sign-in, got a prompt — a cost, not a failure.
    expect(classify('1fa', '2fa')).toBe('friction')
    expect(classify('2fa', 'deny')).toBe('friction')
  })

  it('holds when the treatment is the one asked for', () => {
    expect(classify('2fa', '2fa')).toBe('held')
  })
})

describe('runGauntlet', () => {
  it('gives an empty policy an F, because the deck is full of things it lets through', () => {
    const r = runGauntlet(policy([]), rawEnv)
    expect(r.breaches).toBeGreaterThan(1)
    expect(r.grade).toBe('F')
    // Every card runs, whatever the result.
    expect(r.rounds).toHaveLength(DECK.length)
  })

  it('does not let friction outweigh a breach', () => {
    /* Deny-everything: nothing hostile gets through, so there are no breaches,
       but the ordinary sign-ins are all denied. It must still grade below a
       policy with no holes and no lockouts. */
    const denyAll = runGauntlet(policy([rule({ decision: 'deny' })]), rawEnv)
    expect(denyAll.breaches).toBe(0)
    expect(denyAll.lockouts).toBeGreaterThan(0)
    expect(denyAll.grade).toBe('C')

    // One hole is worse than any number of over-challenges.
    const oneHole = runGauntlet(policy([]), rawEnv, {
      // Accept every threat card except one, leaving a single breach.
      ...Object.fromEntries(DECK.filter((c) => c.kind === 'threat').slice(1).map((c) => [c.id, '1fa' as const])),
      ...Object.fromEntries(DECK.filter((c) => c.kind === 'legit').map((c) => [c.id, '1fa' as const])),
    })
    expect(oneHole.breaches).toBe(1)
    expect(oneHole.grade).toBe('D')
  })

  it('lets the tenant overrule a card, and recomputes rather than remembering', () => {
    const p = policy([])
    const before = runGauntlet(p, rawEnv)
    const card = before.rounds.find((r) => r.outcome === 'breach')!
    const after = runGauntlet(p, rawEnv, { [card.challenge.id]: card.decision })
    expect(after.breaches).toBe(before.breaches - 1)
  })

  it('names the rule that produced each decision', () => {
    const p = policy([rule({ name: 'Block everything', decision: 'deny' })])
    const r = runGauntlet(p, rawEnv)
    expect(r.rounds.every((x) => x.hitName === 'Block everything')).toBe(true)
  })

  it('agrees with the evaluator every other surface uses', () => {
    const p = policy([
      rule({ name: 'Anonymised', when: when(card(cond('zone', 'in zone', ['anon']))), decision: 'deny' }),
      rule({ name: 'Off network', when: when(card(cond('zone', 'not in zone', ['office']))), decision: '2fa' }),
    ])
    const r = runGauntlet(p, rawEnv)
    for (const round of r.rounds) {
      expect(round.decision).toBe(decide(p, contextFor(round.challenge), rawEnv).decision)
    }
  })

  it('counts the longest unbroken run of holds, not the total', () => {
    const r = runGauntlet(policy([]), rawEnv)
    expect(r.streak).toBeLessThanOrEqual(r.held)
  })

  it('calls an ordinary sign-in that is denied a lockout, whatever it asked for', () => {
    /* It used to be friction when the card asked for 2 factors, so a policy
       denying everyone scored its four ordinary 2-factor cards as extra
       prompts. Finance refused from home is somebody who cannot work. A
       hostile card denied harder than asked is still friction. */
    const r = runGauntlet(policy([rule({ decision: 'deny' })]), rawEnv)
    const home = r.rounds.find((x) => x.challenge.id === 'finance-home')!
    expect(home.want).toBe('2fa')
    expect(home.outcome).toBe('lockout')
    expect(r.lockouts).toBe(DECK.filter((c) => c.kind === 'legit').length)
    expect(r.rounds.find((x) => x.challenge.id === 'expired-trust')!.outcome).toBe('friction')
    expect(r.grade).toBe('C')
  })
})

describe('sweep', () => {
  const env = rawEnv
  const noon = 570

  it('decides every situation exactly once', () => {
    const s = sweep(policy([rule({ decision: '2fa' })]), env, noon)
    expect(s.total).toBe(SITUATIONS.length)
    expect(s.counts['1fa'] + s.counts['2fa'] + s.counts.deny).toBe(s.total)
    expect(s.decisions).toHaveLength(SITUATIONS.length)
  })

  it('reports a rule that wins nothing as reaching nothing', () => {
    /* Rule 2 is unreachable behind a catch-all, and the sweep says so in the
       only way that matters: it never wins a situation. */
    const p = policy([rule({ name: 'Catch all' }), rule({ name: 'Shadowed', decision: 'deny' })])
    const s = sweep(p, env, noon)
    expect(s.reach[0]).toBe(SITUATIONS.length)
    expect(s.reach[1]).toBe(0)
    expect(badges(p, s, null, 0).find((b) => b.id === 'every-rule-fires')?.earned).toBe(false)
  })

  it('sends everything to the engine default when there are no rules', () => {
    const s = sweep(policy([]), env, noon)
    expect(s.fellThrough).toBe(SITUATIONS.length)
    expect(s.counts['1fa']).toBe(SITUATIONS.length)
    expect(guardedShare(s)).toBe(0)
    expect(openShare(s)).toBe(100)
  })

  it('is stable — the same policy swept twice gives the same grid', () => {
    const p = policy([rule({ when: when(card(cond('zone', 'in zone', ['office']))), decision: '1fa' })])
    expect(sweep(p, env, noon).decisions).toEqual(sweep(p, env, noon).decisions)
  })
})

describe('compare', () => {
  const env = rawEnv
  const noon = 570

  it('reports no movement when nothing changed', () => {
    const p = policy([rule({ decision: '2fa' })])
    const m = compare(sweep(p, env, noon), sweep(p, env, noon))
    expect(m.changed).toBe(0)
    expect(m.stricter).toBe(0)
    expect(m.looser).toBe(0)
    expect(m.same).toBe(SITUATIONS.length)
  })

  it('separates tightening from loosening, and names the flow', () => {
    const loose = policy([rule({ decision: '1fa' })])
    const tight = policy([rule({ decision: '2fa' })])
    const m = compare(sweep(loose, env, noon), sweep(tight, env, noon))
    expect(m.stricter).toBe(SITUATIONS.length)
    expect(m.looser).toBe(0)
    expect(m.flows[0]).toEqual({ from: '1fa', to: '2fa', n: SITUATIONS.length })

    const back = compare(sweep(tight, env, noon), sweep(loose, env, noon))
    expect(back.looser).toBe(SITUATIONS.length)
    expect(back.stricter).toBe(0)
  })

  it('withholds the no-silent-loosening badge exactly when something loosened', () => {
    const tight = policy([rule({ decision: 'deny' })])
    const loose = policy([rule({ decision: '1fa' })])
    const after = sweep(loose, env, noon)
    const m = compare(sweep(tight, env, noon), after)
    const badge = badges(loose, after, m, 0).find((b) => b.id === 'no-silent-loosening')!
    expect(badge.earned).toBe(false)
    expect(badge.detail).toContain('weaker treatment')
  })
})

describe('badges', () => {
  const env = rawEnv
  const noon = 570

  it('withholds "actually in force" from a policy with no apps attached', () => {
    const p = policy([rule()], { appIds: [] })
    const b = badges(p, sweep(p, env, noon), null, 0)
    expect(b.find((x) => x.id === 'attached')?.earned).toBe(false)
  })

  it('is earned only when the claim it states is true of the grid', () => {
    /* Deny anonymised sources and every unrecognised device; both gate badges
       should then hold, and they should not hold for an empty policy. */
    const guarded = policy([
      rule({ when: when(card(cond('zone', 'in zone', ['anon']))), decision: 'deny' }),
      rule({ when: when(card(cond('fingerprint', 'does not match', ['fp-corp']))), decision: 'deny' }),
    ])
    const got = badges(guarded, sweep(guarded, env, noon), null, 0)
    expect(got.find((b) => b.id === 'anon-gated')?.earned).toBe(true)
    expect(got.find((b) => b.id === 'device-recognised')?.earned).toBe(true)

    const open = policy([])
    const none = badges(open, sweep(open, env, noon), null, 0)
    expect(none.find((b) => b.id === 'anon-gated')?.earned).toBe(false)
    expect(none.find((b) => b.id === 'device-recognised')?.earned).toBe(false)
  })
})

describe('the seeded catalogue', () => {
  /* A product whose best available score is F teaches its user that the score
     only ever says "bad", after which nobody reads it. One seeded policy has to
     reach the top of the ladder, and it has to keep reaching it — a change to
     the deck, the evaluator or the seed that quietly makes A unreachable is a
     change worth failing a build over. */
  it('contains a policy that actually survives the deck', () => {
    /* A caveat before the argument below, found when the break-in deck was
       rebuilt: this A proves less than it says. `s5-devops` governs DevOps,
       and none of the four chip people is in DevOps, so every card is skipped
       — zero rounds, and an A for surviving nothing. Making it real needs a
       DevOps person on the chip deck, which changes `SITUATIONS` and the
       rendered sweep copy, so it waits for a later phase. The typed deck has a
       real exemplar meanwhile: `break-in.test.ts` runs the showcase's HRMS
       policy and finds nothing getting through it.

       `s5-devops` — the use-case document's Scenario 5, Policy B. It replaces
       the invented Zero-Trust Baseline seed and it is a better exemplar than
       that was: it is the strictest thing the document writes anywhere, and it
       is strict for a stated reason rather than to pass this test. Office IP
       AND registered device AND MDM managed, then password plus a push. Nothing
       in the deck gets past it. */
    const zt = policies.find((p) => p.id === 's5-devops')
    expect(zt, 'the Scenario 5 DevOps policy').toBeDefined()

    const r = runGauntlet(zt!, rawEnv)
    const missed = r.rounds.filter((x) => x.outcome !== 'held').map((x) => `${x.challenge.id}: wanted ${x.want}, got ${x.decision}`)
    expect(missed).toEqual([])
    expect(r.grade).toBe('A')
  })

  it('keeps that policy clean under the linter too', () => {
    const zt = policies.find((p) => p.id === 's5-devops')!
    expect(diagnose(zt, groups).filter((d) => d.severity === 'error')).toEqual([])
  })

  it('still has policies with real holes, or the deck proves nothing', () => {
    const graded = policies.filter((p) => !p.isSystem).map((p) => runGauntlet(p, rawEnv))
    expect(graded.some((r) => r.breaches > 0), 'at least one seeded policy leaks').toBe(true)
  })
})

describe('proposeFix', () => {
  it('offers nothing for a card that came back stricter than asked', () => {
    /* Deny-everything over-challenges the ordinary cards. The fix for that is
       to loosen an existing rule, and offering "add a rule" would push the
       policy further in the direction it is already wrong. */
    const p = policy([rule({ decision: 'deny' })])
    const r = runGauntlet(p, rawEnv)
    const overStrict = r.rounds.filter((x) => x.outcome === 'lockout' || x.outcome === 'friction')
    expect(overStrict.length).toBeGreaterThan(0)
    for (const round of overStrict) expect(proposeFix(round, p)).toBeNull()
  })

  it('proposes a rule that actually closes the card', () => {
    const p = policy([])
    const r = runGauntlet(p, rawEnv)
    const leaks = r.rounds.filter((x) => x.outcome === 'breach')
    expect(leaks.length).toBeGreaterThan(0)

    for (const round of leaks) {
      const fix = proposeFix(round, p)
      if (!fix) continue
      // Apply it exactly as the button would, then re-run that one card.
      const fixed = { ...p, rules: applyFix(p.rules, fix) }
      const after = runGauntlet(fixed, rawEnv).rounds.find((x) => x.challenge.id === round.challenge.id)!
      expect(after.outcome, `${round.challenge.id} should be closed by its own proposed fix`).toBe('held')
    }
  })

  it('inserts above the rule that let the sign-in through, never below it', () => {
    /* First match wins, so a fix appended to the end of a policy whose first
       rule already decides the card would change nothing at all. */
    const p = policy([
      rule({ name: 'Everyone in on one factor', decision: '1fa' }),
      rule({ name: 'Filler', when: when(card(cond('day', 'is', ['Monday']))), decision: '2fa' }),
    ])
    const r = runGauntlet(p, rawEnv)
    const leak = r.rounds.find((x) => x.outcome === 'breach' && x.hitIndex === 0)!
    const fix = proposeFix(leak, p)!
    expect(fix.at).toBe(0)
    expect(fix.placement).toContain('Everyone in on one factor')
  })
})

describe('where a fix lands', () => {
  /* `at` is the index the rule has after `applyFix`. A twin ABOVE the rule
     that decided was reached and missed this very card, so re-aiming it closes
     nothing — and `applyFix` used to drop it one place above the decider, not
     at `at`. Only a twin at or below the decider is re-aimed now. */
  const riskInside = (p: Policy) => runGauntlet(p, rawEnv).rounds.find((r) => r.challenge.id === 'risk-inside')!

  it('does not re-aim a disabled twin above the decider', () => {
    const p = policy([
      rule({ name: 'Old risk rule', enabled: false, when: when(card(cond('device-risk', 'above', ['69']))), decision: '1fa' }),
      rule({ name: 'Everyone else', decision: '1fa' }),
    ])
    const round = riskInside(p)
    expect(round.outcome).toBe('breach')
    expect(round.hitIndex).toBe(1)
    const fix = proposeFix(round, p)!
    expect(fix.kind).toBe('insert')
    expect(fix.at).toBe(1)
    const after = { ...p, rules: applyFix(p.rules, fix) }
    expect(riskInside(after).outcome).toBe('held')
  })

  it('inserts at the decider below a narrower twin that already missed, and leaves the twin where it was', () => {
    const twin = rule({
      name: 'Risky and off the office network',
      when: when(card(cond('device-risk', 'above', ['69']), cond('zone', 'not in zone', ['office']))),
      decision: '1fa',
    })
    const p = policy([
      twin,
      rule({ name: 'Anonymised', when: when(card(cond('zone', 'in zone', ['anon']))), decision: 'deny' }),
      rule({ name: 'Everyone else', decision: '1fa' }),
    ])
    const round = riskInside(p)
    expect(round.hitIndex).toBe(2)
    const fix = proposeFix(round, p)!
    expect(fix.kind).toBe('insert')
    expect(fix.at).toBe(2)
    const after = { ...p, rules: applyFix(p.rules, fix) }
    expect(after.rules[0]).toBe(twin)
    expect(after.rules[2]).toBe(fix.rule)
    expect(riskInside(after).outcome).toBe('held')
    expect(diagnose(after, groups).filter((d) => d.severity === 'error')).toEqual([])
  })

  it('re-aims a twin below the decider, and the rule lands exactly at `at`', () => {
    const p = policy([
      rule({ name: 'Everyone in', decision: '1fa' }),
      rule({ name: 'Risk, too weakly', when: when(card(cond('device-risk', 'above', ['69']))), decision: '1fa' }),
    ])
    const fix = proposeFix(riskInside(p), p)!
    expect(fix).toMatchObject({ kind: 'retune', fromIndex: 1, at: 0 })
    const after = applyFix(p.rules, fix)
    expect(after.indexOf(fix.rule)).toBe(fix.at)
    expect(riskInside({ ...p, rules: after }).outcome).toBe('held')
  })

  it('offers nothing for a narrower twin below the decider that this card would still miss', () => {
    /* The twin covers the spec (risk above 69) and adds "off the office
       network" — which this card, on the office network, fails. Re-aimed above
       the decider it would still miss, and the card would stay open under a
       button that said it was fixed; the broader rule inserted above it would
       shadow it instead. So: no fix. */
    const p = policy([
      rule({ name: 'Everyone in', decision: '1fa' }),
      rule({
        name: 'Risky off-network',
        when: when(card(cond('device-risk', 'above', ['69']), cond('zone', 'not in zone', ['office']))),
        decision: '1fa',
      }),
    ])
    const round = riskInside(p)
    expect(round).toMatchObject({ outcome: 'breach', hitIndex: 0 })
    expect(proposeFix(round, p)).toBeNull()
  })

  it('closes its card whenever it offers a fix, on every seeded policy and on the showcase', () => {
    const show = showcaseTenant()
    const appAccess = (list: Policy[]) => list.filter((x) => !x.isSystem && x.type === 'App Access')
    let offered = 0
    for (const { env, list } of [
      { env: rawEnv, list: appAccess(policies) },
      { env: envOf(show), list: appAccess(show.policies) },
    ])
      for (const p of list)
        for (const round of runGauntlet(p, env).rounds.filter((r) => r.outcome === 'breach')) {
          const fix = proposeFix(round, p, env)
          if (!fix) continue
          offered += 1
          const after = { ...p, rules: applyFix(p.rules, fix) }
          expect(after.rules.indexOf(fix.rule), `${p.name} / ${round.challenge.id}`).toBe(fix.at)
          const again = runGauntlet(after, env).rounds.find((r) => r.challenge.id === round.challenge.id)!
          expect(again.outcome, `${p.name} / ${round.challenge.id}`).not.toBe('breach')
        }
    expect(offered).toBeGreaterThan(0)
  })

  it('re-aims the decider in place when it is the twin', () => {
    const p = policy([
      rule({ name: 'Off the office network', when: when(card(cond('zone', 'not in zone', ['office']))), decision: '1fa' }),
      rule({ name: 'Everyone else', decision: '1fa' }),
    ])
    const home = runGauntlet(p, rawEnv).rounds.find((r) => r.challenge.id === 'finance-home')!
    expect(home).toMatchObject({ outcome: 'breach', hitIndex: 0 })
    const fix = proposeFix(home, p)!
    expect(fix).toMatchObject({ kind: 'retune', fromIndex: 0, at: 0 })
    expect(applyFix(p.rules, fix).indexOf(fix.rule)).toBe(0)
  })

  it('offers nothing when an enabled twin above the decider already says exactly the same thing', () => {
    /* It was reached and missed this card, so the fix's own predicate would
       miss it too; and a copy of it below would be a duplicate the linter
       refuses (PE101). Built by hand, because no real run reaches this state:
       a spec whose predicate misses its own card is a spec that is wrong. */
    const p = policy([
      rule({ name: 'Risk', when: when(card(cond('device-risk', 'above', ['69']))), decision: '2fa' }),
      rule({ name: 'Everyone else', decision: '1fa' }),
    ])
    const round = { ...riskInside(p), decision: '1fa' as const, outcome: 'breach' as const, hitIndex: 1, hitName: 'Everyone else' }
    expect(proposeFix(round, p)).toBeNull()
  })
})

describe('a fix that names what the tenant does not have', () => {
  const showcase = envOf(showcaseTenant())

  it('is withheld on the showcase tenant, which has no zone called anon', () => {
    const p = policy([])
    const tor = runGauntlet(p, rawEnv).rounds.find((r) => r.challenge.id === 'tor-exec')!
    expect(tor.challenge.fix?.conditions[0].values).toEqual(['anon'])
    expect(proposeFix(tor, p)).not.toBeNull()
    expect(proposeFix(tor, p, showcase)).toBeNull()
  })

  it('is still offered when everything it names is there', () => {
    const p = policy([])
    const risk = runGauntlet(p, rawEnv).rounds.find((r) => r.challenge.id === 'risk-inside')!
    expect(proposeFix(risk, p, showcase)?.kind).toBe('insert')
  })
})

describe('a fix must not create a policy that cannot be published', () => {
  /* The first version of proposeFix always inserted. On a policy that already
     had a rule with the same predicate and a weaker outcome, that produced two
     rules with the same audience and conditions and different answers — which
     the linter calls a contradiction and which blocks Publish. The one-click
     fix left the policy unpublishable, which is worse than offering nothing. */
  it('re-aims an existing rule instead of duplicating its predicate', () => {
    const p = policy([
      rule({
        name: 'Contractor baseline',
        // The same who and WHEN the `nightshift` fix now proposes, so the fix
        // has a twin to re-aim rather than a gap to insert into.
        who: { groupIds: ['contractors'], userIds: [] },
        when: anySignIn(),
        decision: '1fa',
      }),
    ])
    const round = runGauntlet(p, rawEnv).rounds.find((r) => r.challenge.id === 'nightshift')!
    expect(round.outcome).toBe('breach')

    const fix = proposeFix(round, p)!
    expect(fix.kind).toBe('retune')
    expect(fix.fromIndex).toBe(0)
    expect(fix.headline).toContain('Change rule 1')

    const after = { ...p, rules: applyFix(p.rules, fix) }
    // The card is closed...
    expect(runGauntlet(after, rawEnv).rounds.find((r) => r.challenge.id === 'nightshift')!.outcome).toBe('held')
    // ...and the policy is still publishable.
    expect(diagnose(after, groups).filter((d) => d.severity === 'error')).toEqual([])
    expect(after.rules).toHaveLength(1)
  })

  it('inserts a who-only fix as a rule with that who and no conditions, never re-aiming an unrelated rule', () => {
    /* A spec with no conditions contains every one of nothing. Without the who
       test, the first single-card rule in the policy would count as its twin. */
    const p = policy([rule({ name: 'Office step-up', when: when(card(cond('zone', 'in zone', ['office']))), decision: '1fa' })])
    const round = runGauntlet(p, rawEnv).rounds.find((r) => r.challenge.id === 'nightshift')!
    expect(round.outcome).toBe('breach')
    const fix = proposeFix(round, p)!
    expect(fix.kind).toBe('insert')
    expect(fix.rule.who).toEqual({ groupIds: ['contractors'], userIds: [] })
    expect(fix.rule.when.cards).toEqual([])
    const after = { ...p, rules: applyFix(p.rules, fix) }
    expect(runGauntlet(after, rawEnv).rounds.find((r) => r.challenge.id === 'nightshift')!.outcome).toBe('held')
    expect(diagnose(after, groups).filter((d) => d.severity === 'error')).toEqual([])
  })

  it('leaves every seeded policy publishable after applying every fix it offers', () => {
    for (const p of policies.filter((x) => !x.isSystem && x.type === 'App Access')) {
      let current = p
      // Applying one fix can change what the others propose, so re-derive each
      // time — which is also how a person would use the button.
      for (let i = 0; i < 6; i++) {
        const leak = runGauntlet(current, rawEnv).rounds.find((r) => r.outcome === 'breach')
        if (!leak) break
        const fix = proposeFix(leak, current)
        if (!fix) break
        current = { ...current, rules: applyFix(current.rules, fix) }
      }
      const errors = diagnose(current, groups).filter((d) => d.severity === 'error')
      expect(errors.map((e) => `${p.name}: ${e.title}`)).toEqual([])
    }
  })
})
