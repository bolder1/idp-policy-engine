import { describe, expect, it } from 'vitest'

import { EVERYONE, audienceOf, groups } from '../data'
import { leaves } from '../predicate'
import { diagnose } from '../screens/diagnostics'
import {
  QUESTIONS,
  compose,
  composeAudience,
  nameFor,
  narrate,
  readPrompt,
  type Answers,
} from './interview-model'

/* The interview writes rules on somebody's behalf, which means it has to be
   held to a higher bar than the builder: a person editing a rule can see their
   own mistake, and a person answering five questions cannot. So every
   combination of answers is composed and linted, and none of them is allowed to
   produce an error. */

/* The shell takes the ANSWERS rather than the rules, because the interview now
   produces two things — the ordered rules and the one audience the policy
   governs — and linting the rules without the audience they were written for
   would leave the policy-scoped findings (PE310 and friends) untested. */
const shell = (answers: Answers) => ({
  id: 'test',
  name: 'Test',
  type: 'App Access' as const,
  appId: 'a1',
  status: 'inactive' as const,
  lastModified: '',
  modifiedBy: '',
  audience: composeAudience(answers),
  rules: compose(answers),
})

/** Every combination of every answer — 6 × 4 × 3 × 2 × 4 = 576 policies. */
function everyCombination(): Answers[] {
  let out: Answers[] = [{}]
  for (const q of QUESTIONS) {
    out = out.flatMap((a) => q.options.map((o) => ({ ...a, [q.id]: o.id })))
  }
  return out
}

describe('the interview', () => {
  it('produces a policy the linter cannot fault, for every possible set of answers', () => {
    const combos = everyCombination()
    expect(combos).toHaveLength(576)

    const broken = combos
      .map((a) => ({ a, errors: diagnose(shell(a), groups).filter((d) => d.severity === 'error') }))
      .filter((x) => x.errors.length > 0)

    expect(broken.map((b) => `${JSON.stringify(b.a)} → ${b.errors[0].code} ${b.errors[0].title}`)).toEqual([])
  })

  it('always governs the audience rather than letting it fall through', () => {
    for (const a of everyCombination()) {
      const rules = compose(a)
      const last = rules[rules.length - 1]
      // A catch-all at the end is what stops the engine default deciding for
      // people this policy was written for.
      expect(last.when.cards).toHaveLength(0)
      /* The audience used to be stamped on every rule, so this asserted all
         three agreed. It is one policy-level fact now, and the equivalent
         assertion is that the single audience is exactly the one answered —
         "Everyone" being the flag rather than a group id. */
      expect(composeAudience(a)).toEqual(
        !a.audience || a.audience === 'all' ? EVERYONE : audienceOf([a.audience]),
      )
    }
  })

  it('puts the guard above the relief, because first match wins', () => {
    const rules = compose({ audience: 'finance', threat: 'unmanaged', response: 'mfa', relief: 'yes', remember: '30' })
    const guard = rules.findIndex((r) => leaves(r.when).some((c) => c.typeId === 'mdm'))
    const relief = rules.findIndex((r) =>
      leaves(r.when).some((c) => c.typeId === 'zone' && c.operator === 'in zone'),
    )
    expect(guard).toBeGreaterThanOrEqual(0)
    expect(relief).toBeGreaterThan(guard)
  })

  it('never seeds an answer the prompt does not mention', () => {
    expect(readPrompt('')).toEqual({})
    expect(readPrompt('something entirely unrelated to security')).toEqual({})
  })

  it('reads the audience, the threat and the response out of a prompt', () => {
    expect(readPrompt('Protect finance apps from unmanaged devices')).toMatchObject({
      audience: 'finance',
      threat: 'unmanaged',
    })
    expect(readPrompt('Block contractors signing in from outside the office')).toMatchObject({
      audience: 'contractors',
      response: 'deny',
    })
  })

  it('answers differently when the answers differ', () => {
    const strict = compose({ audience: 'executives', threat: 'risky', response: 'deny', relief: 'no', remember: '0' })
    const loose = compose({ audience: 'all', threat: 'risky', response: 'mfa', relief: 'yes', remember: '90' })
    expect(strict[0].decision).toBe('deny')
    expect(loose[0].decision).toBe('2fa')
    expect(strict).toHaveLength(2)
    expect(loose).toHaveLength(3)
    // The two audiences differ at the policy, which is where scope now lives.
    expect(composeAudience({ audience: 'executives' })).toEqual(audienceOf(['executives']))
    expect(composeAudience({ audience: 'all' })).toEqual(EVERYONE)
  })

  it('asks for a phishing-resistant factor when that is what was chosen', () => {
    const [guard] = compose({ audience: 'all', threat: 'unmanaged', response: 'strong' })
    expect(guard.secondFactor).toBe('specific')
    expect(guard.secondFactorMethods).toEqual(['WebAuthn / FIDO2'])
  })

  it('narrates one line per rule, in evaluation order', () => {
    const rules = compose({ audience: 'finance', threat: 'offsite', response: 'mfa', relief: 'yes', remember: '7' })
    const lines = narrate(rules)
    expect(lines).toHaveLength(rules.length)
    expect(lines[0]).toMatch(/^1\./)
    expect(lines[lines.length - 1]).toMatch(/anyone still unmatched/)
  })

  it('names the policy from the prompt when the prompt is a usable name', () => {
    expect(nameFor('Protect finance apps', { audience: 'finance' })).toBe('Protect finance apps')
    // Too long to be a name — falls back to something composed from the answers.
    expect(nameFor('a'.repeat(90), { audience: 'finance', threat: 'unmanaged' })).toBe('Finance — device trust')
    expect(nameFor('', {})).toBe('Everyone — access')
  })
})
