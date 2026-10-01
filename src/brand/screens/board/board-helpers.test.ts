import { describe, expect, it } from 'vitest'

import { audienceOf, blankRule, card, cond, scenarios, when, type Rule, type Scenario } from '../../data'
import { scenarioCard } from '../../create/TemplateCard'
import { buildTemplate, templateBlocker, withoutMissing } from './apply-template'
import { journeyOf } from './model'
import { copyName, isPristine, settledName } from './parts'
import { patchRule } from './model'
import { boardShortcuts, chord, isMacPlatform } from './shortcuts'

/* -----------------------------------------------------------------------------
   The pure helpers behind the board's fixes: what a template really applies,
   when a rule counts as untouched, how copies are named, and what the keyboard
   sheet lists.
   -------------------------------------------------------------------------- */

describe('a rule nobody has touched', () => {
  it('is a blank rule, whatever it is called', () => {
    expect(isPristine(blankRule())).toBe(true)
    expect(isPristine({ ...blankRule(), name: 'Renamed' })).toBe(true)
  })

  it('stops being pristine once an outcome, a who or a condition is set', () => {
    expect(isPristine({ ...blankRule(), decision: 'deny' })).toBe(false)
    expect(isPristine({ ...blankRule(), decision: '1fa' })).toBe(false)
    expect(isPristine({ ...blankRule(), who: { groupIds: ['finance'], userIds: [] } })).toBe(false)
    expect(isPristine({ ...blankRule(), when: when(card(cond('zone', 'in zone', ['office']))) })).toBe(false)
    expect(isPristine({ ...blankRule(), secondFactor: 'specific', secondFactorMethods: ['TOTP Authenticator'] })).toBe(false)
  })

  it('stops being blank the moment an outcome is chosen, even one equal to the default', () => {
    const r = blankRule()
    expect(isPristine(patchRule(r, { name: 'Everyone else' }))).toBe(true)
    expect(isPristine(patchRule(r, { enabled: false }))).toBe(true)
    const allowed = patchRule(r, { decision: '1fa' })
    expect(isPristine(allowed)).toBe(false)
    // back to the blank's own values — Allow, then "any enabled method" — and still written
    expect(isPristine(patchRule(allowed, { decision: '2fa', secondFactor: 'any' }))).toBe(false)
  })

  it('never calls a rule blank that was not born blank', () => {
    expect(isPristine({ ...blankRule(), pristine: undefined })).toBe(false)
  })
})

describe('naming a duplicated rule', () => {
  it('adds one copy suffix and numbers the rest', () => {
    expect(copyName('MFA', ['MFA'])).toBe('MFA (copy)')
    expect(copyName('MFA (copy)', ['MFA', 'MFA (copy)'])).toBe('MFA (copy 2)')
    expect(copyName('MFA (copy 2)', ['MFA', 'MFA (copy)', 'MFA (copy 2)'])).toBe('MFA (copy 3)')
  })

  it('never stacks the suffix', () => {
    const taken = ['Block']
    let name = 'Block'
    for (let i = 0; i < 3; i++) {
      name = copyName(name, taken)
      taken.push(name)
    }
    expect(taken).toEqual(['Block', 'Block (copy)', 'Block (copy 2)', 'Block (copy 3)'])
  })

  it('names a blank rule before copying it', () => {
    expect(copyName('   ', [])).toBe('Untitled rule (copy)')
  })
})

describe('a rule name left blank', () => {
  it('keeps what was typed, trimmed', () => {
    expect(settledName('  VPN only ', 'Old', 0)).toBe('VPN only')
  })
  it('goes back to the previous name, or to the rule number', () => {
    expect(settledName('   ', 'Old', 0)).toBe('Old')
    expect(settledName('', '', 2)).toBe('Rule 3')
  })
})

describe('the journey of a specific first factor with no method', () => {
  it('says no method was chosen and that it cannot be completed', () => {
    const r: Rule = { ...blankRule(), decision: '1fa', firstFactor: 'Specific' }
    expect(journeyOf(r)[0]).toMatchObject({ label: 'No method chosen', sub: 'cannot be completed' })
  })
  it('names the method once one is chosen', () => {
    const r: Rule = { ...blankRule(), decision: '1fa', firstFactor: 'Specific', firstFactorMethod: 'TOTP Authenticator' }
    expect(journeyOf(r)[0].label).toBe('TOTP Authenticator')
    expect(journeyOf(r)[0].sub).toBeUndefined()
  })
})

describe('library items a template names', () => {
  const zoneRule = (): Rule => ({ ...blankRule('Office'), when: when(card(cond('zone', 'in zone', ['office', 'hq']))) })

  it('clears zones and device profiles the tenant does not have, and says which kind', () => {
    const { rule, needs } = withoutMissing(zoneRule(), { zones: [{ id: 'hq' }], fingerprints: [] })
    expect(rule.when.cards[0].conditions[0].values).toEqual(['hq'])
    expect(needs).toEqual(['zone'])
  })

  it('leaves a rule untouched when the library has everything', () => {
    const r = zoneRule()
    const { rule, needs } = withoutMissing(r, { zones: [{ id: 'hq' }, { id: 'office' }], fingerprints: [] })
    expect(rule).toBe(r)
    expect(needs).toEqual([])
  })

  it('reports needs from the template build, and applies no id the tenant lacks', () => {
    const t = scenarios.find((s) => s.rules.some((spec) => spec.build().when.cards.some((k) => k.conditions.some((c) => c.typeId === 'zone'))))!
    expect(t).toBeDefined()
    const built = buildTemplate(t, undefined, { zones: [], fingerprints: [] })
    expect(built.needs).toContain('zone')
    for (const r of built.rules) {
      for (const k of r.when.cards) for (const c of k.conditions) if (c.typeId === 'zone') expect(c.values).toEqual([])
    }
  })
})

describe('what stops a template from being applied', () => {
  const base: Omit<Scenario, 'rules'> = { id: 't', name: 'T', description: 'x', category: 'Compliance', audience: audienceOf(['contractors']) }

  it('refuses a template with no rules', () => {
    const t: Scenario = { ...base, rules: [] }
    expect(templateBlocker(t, buildTemplate(t))).toBe('T has no rules.')
  })

  it('refuses a template whose every rule applies to nobody', () => {
    const t: Scenario = {
      ...base,
      rules: [{ name: 'Execs', ifText: 'x', decision: 'deny', build: () => ({ ...blankRule('Execs'), who: { groupIds: ['executives'], userIds: [] } }) }],
    }
    expect(templateBlocker(t, buildTemplate(t))).toMatch(/not applied/)
  })

  it('lets a template with a kept rule through', () => {
    const t: Scenario = { ...base, rules: [{ name: 'All', ifText: 'x', decision: '2fa', build: () => blankRule('All') }] }
    expect(templateBlocker(t, buildTemplate(t))).toBeNull()
  })
})

describe('the template card lists only what applying keeps', () => {
  it('leaves out a dropped rule and names it', () => {
    const t: Scenario = {
      id: 't2',
      name: 'Mixed',
      description: 'x',
      category: 'Compliance',
      audience: audienceOf(['contractors']),
      rules: [
        { name: 'Execs', ifText: 'x', decision: 'deny', build: () => ({ ...blankRule('Execs'), who: { groupIds: ['executives'], userIds: [] } }) },
        { name: 'Everyone', ifText: 'x', decision: '2fa', build: () => blankRule('Everyone') },
      ],
    }
    const m = scenarioCard(t)
    expect(m.rules.map((r) => r.name)).toEqual(['Everyone'])
    expect(m.dropped).toEqual(['Execs'])
    expect(m.rules.length).toBe(buildTemplate(t).rules.length)
  })

  it('agrees with applying for every seeded template', () => {
    for (const s of scenarios) {
      expect(scenarioCard(s).rules.length, s.id).toBe(buildTemplate(s).rules.length)
    }
  })
})

describe('the keyboard sheet', () => {
  it('spells chords per platform', () => {
    expect(chord(['mod', 'shift'], 'Z', true)).toBe('⇧⌘Z')
    expect(chord(['mod', 'shift'], 'Z', false)).toBe('Ctrl+Shift+Z')
    expect(chord(['mod'], 'Enter', true)).toBe('⌘↵')
    expect(chord(['alt'], '↑', false)).toBe('Alt+↑')
  })

  it('detects a Mac from the platform string', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true)
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false)
    expect(isMacPlatform(undefined)).toBe(false)
  })

  it('lists no palette and no rehearsal in Lite, and no Mac glyphs on Windows', () => {
    const lite = boardShortcuts({ mac: false, commands: false, gauntlet: false, publish: false })
    const text = lite.map(([k, v]) => `${k} ${v}`).join('\n')
    expect(text).not.toMatch(/Command palette/)
    expect(text).not.toMatch(/rehearsal/)
    expect(text).not.toMatch(/[⌘⌥⇧]/)
    expect(text).toMatch(/Review and save/)
    expect(lite.find(([k]) => k === '[ ]')?.[1]).toBe('Previous or next section')
    expect(lite.some(([k]) => /Backspace/.test(k))).toBe(false)
  })

  it('lists the palette and publish in Full', () => {
    const full = boardShortcuts({ mac: true, commands: true, gauntlet: true, publish: true })
    expect(full.some(([k, v]) => k === '⌘K' && v === 'Command palette')).toBe(true)
    expect(full.some(([, v]) => v === 'Review and publish')).toBe(true)
  })
})
