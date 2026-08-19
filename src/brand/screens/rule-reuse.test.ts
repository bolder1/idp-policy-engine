import { describe, expect, it } from 'vitest'

import { blankRule, cond, groups, policies, type Policy, type Rule } from '../data'
import { describeChanges } from './changes'
import { diagnose } from './diagnostics'

/* -----------------------------------------------------------------------------
   Gap 3 (copy a rule between policies) and the rationale field.

   The copy itself is three lines in the store and needs no test. What needs a
   test is the two claims the dialog makes on its behalf — that the copy is
   independent, and that it can or cannot fire from the position it lands in.
   Both are the kind of claim that stays true right up until somebody makes the
   copy a reference "so edits stay in sync", which is a reasonable-sounding
   change that breaks the model.
   -------------------------------------------------------------------------- */

/** The store's copy, extracted so it can be exercised without React. */
function copyInto(target: Policy, r: Rule): Policy {
  return { ...target, rules: [...target.rules, { ...r, id: `copied-${target.rules.length}` }] }
}

const ruleWith = (over: Partial<Rule>): Rule => ({ ...blankRule('Off-network finance'), ...over })

describe('copying a rule into another policy', () => {
  it('lands at the end, so nothing already in the target changes meaning', () => {
    const target: Policy = { ...policies[1], rules: policies[1].rules.slice(0, 2) }
    const before = target.rules.map((r) => r.name)
    const after = copyInto(target, ruleWith({ name: 'Copied' }))

    expect(after.rules.slice(0, 2).map((r) => r.name)).toEqual(before)
    expect(after.rules[after.rules.length - 1].name).toBe('Copied')
  })

  it('gives the copy its own id, so editing one cannot reach the other', () => {
    const source = ruleWith({ name: 'Shared logic', id: 'original' })
    const after = copyInto({ ...policies[1], rules: [] }, source)
    const copy = after.rules[0]

    expect(copy.id).not.toBe(source.id)

    // The real claim: mutate the copy, and the source is untouched. A shallow
    // spread is enough for the scalar fields; conditions are the ones that
    // would alias if anybody ever "optimised" the spread away.
    copy.name = 'Changed'
    expect(source.name).toBe('Shared logic')
  })

  /* The dialog builds the target as it *would* be and runs the real linter over
     it. If that stops reporting the appended rule, the dialog silently starts
     promising every copy will work. */
  it('detects when the copy would be unreachable at the end of the target', () => {
    const catchAll = ruleWith({ name: 'Everyone', conditions: [], appliesTo: ['all'] })
    const specific = ruleWith({
      name: 'Finance off-network',
      appliesTo: ['finance'],
      conditions: [cond('zone', 'not in zone', ['office'])],
    })
    const target: Policy = { ...policies[1], isSystem: false, rules: [catchAll] }

    const would = copyInto(target, specific)
    const atCopy = diagnose(would, groups).filter((d) => d.ruleIndex === would.rules.length - 1)

    expect(atCopy.some((d) => d.severity === 'error')).toBe(true)
  })

  it('reports nothing when the target cannot shadow the copy', () => {
    const narrow = ruleWith({
      name: 'Executives on Tor',
      appliesTo: ['executives'],
      conditions: [cond('zone', 'in zone', ['anon'])],
    })
    const incoming = ruleWith({
      name: 'Contractors off-network',
      appliesTo: ['contractors'],
      conditions: [cond('zone', 'not in zone', ['office'])],
    })
    const would = copyInto({ ...policies[1], isSystem: false, rules: [narrow] }, incoming)
    const atCopy = diagnose(would, groups).filter((d) => d.ruleIndex === would.rules.length - 1)

    expect(atCopy.filter((d) => d.severity === 'error')).toHaveLength(0)
  })
})

describe('rule rationale', () => {
  const base: Policy = { ...policies[1], rules: [ruleWith({ id: 'r-x', name: 'Step up off-network' })] }
  const withText = (t?: string): Policy => ({
    ...base,
    rules: [{ ...base.rules[0], description: t }],
  })

  /* Named in the save bar even though it changes no decision. An audit trail
     that only records behaviour changes cannot answer "who decided this was
     still needed", which is most of what an audit trail is for. */
  it('is named when it is added, reworded and removed', () => {
    expect(describeChanges(base, withText('Required by the FY26 audit finding.'))).toEqual([
      'Rationale added to “Step up off-network”',
    ])
    expect(describeChanges(withText('One reason.'), withText('A different reason.'))).toEqual([
      'Rationale reworded on “Step up off-network”',
    ])
    expect(describeChanges(withText('One reason.'), withText(undefined))).toEqual([
      'Rationale removed from “Step up off-network”',
    ])
  })

  it('is not reported when nothing changed', () => {
    expect(describeChanges(withText('Same words.'), withText('Same words.'))).toEqual([])
    // Absent and empty are the same state as far as an admin is concerned, and
    // reporting a change between them would fire on every focus-and-blur.
    expect(describeChanges(withText(undefined), withText(''))).toEqual([])
  })

  it('does not change what a rule decides', () => {
    const a = withText(undefined)
    const b = withText('A long and opinionated explanation.')
    expect(diagnose(b, groups).map((d) => d.id)).toEqual(diagnose(a, groups).map((d) => d.id))
  })
})
