import { describe, expect, it } from 'vitest'

import { cond, groups, policies, type Policy, type Rule } from '../data'
import { DECK, applyFix, classify, proposeFix, runGauntlet, contextFor } from './gauntlet'
import { rawEnv, decide } from './simulate'
import { diagnose } from './diagnostics'
import { SITUATIONS, badges, compare, sweep, guardedShare, openShare } from './impact-arena'

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
    appliesTo: ['all'],
    conditions: [],
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
      rule({ name: 'Anonymised', conditions: [cond('zone', 'in zone', ['anon'])], decision: 'deny' }),
      rule({ name: 'Off network', conditions: [cond('zone', 'not in zone', ['office'])], decision: '2fa' }),
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
    const p = policy([rule({ conditions: [cond('zone', 'in zone', ['office'])], decision: '1fa' })])
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
    /* Deny anonymised sources and everything non-compliant; both gate badges
       should then hold, and they should not hold for an empty policy. */
    const guarded = policy([
      rule({ conditions: [cond('zone', 'in zone', ['anon'])], decision: 'deny' }),
      rule({ conditions: [cond('posture', 'not compliant with', ['corp'])], decision: 'deny' }),
    ])
    const got = badges(guarded, sweep(guarded, env, noon), null, 0)
    expect(got.find((b) => b.id === 'anon-gated')?.earned).toBe(true)
    expect(got.find((b) => b.id === 'posture-enforced')?.earned).toBe(true)

    const open = policy([])
    const none = badges(open, sweep(open, env, noon), null, 0)
    expect(none.find((b) => b.id === 'anon-gated')?.earned).toBe(false)
    expect(none.find((b) => b.id === 'posture-enforced')?.earned).toBe(false)
  })
})

describe('the seeded catalogue', () => {
  /* A product whose best available score is F teaches its user that the score
     only ever says "bad", after which nobody reads it. One seeded policy has to
     reach the top of the ladder, and it has to keep reaching it — a change to
     the deck, the evaluator or the seed that quietly makes A unreachable is a
     change worth failing a build over. */
  it('contains a policy that actually survives the deck', () => {
    const zt = policies.find((p) => p.id === 'zero-trust')
    expect(zt, 'the Zero-Trust Baseline seed').toBeDefined()

    const r = runGauntlet(zt!, rawEnv)
    const missed = r.rounds.filter((x) => x.outcome !== 'held').map((x) => `${x.challenge.id}: wanted ${x.want}, got ${x.decision}`)
    expect(missed).toEqual([])
    expect(r.grade).toBe('A')
  })

  it('keeps that policy clean under the linter too', () => {
    const zt = policies.find((p) => p.id === 'zero-trust')!
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
      rule({ name: 'Filler', conditions: [cond('country', 'is', ['India'])], decision: '2fa' }),
    ])
    const r = runGauntlet(p, rawEnv)
    const leak = r.rounds.find((x) => x.outcome === 'breach' && x.hitIndex === 0)!
    const fix = proposeFix(leak, p)!
    expect(fix.at).toBe(0)
    expect(fix.placement).toContain('Everyone in on one factor')
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
        conditions: [cond('user-type', 'is', ['Contractor'])],
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
