import { describe, expect, it } from 'vitest'

import { FAMILIES, allSettings, type MfaSetting } from './mfa-settings'

/* The field descriptors are data, and data of this shape fails quietly: a preset
   outside its own range draws a chip that cannot be selected, a pattern with no
   rule marks a field red and never says why, a `reveals` key that matches no
   option is a branch nobody can reach. None of that throws — it just renders
   slightly wrong, on one of forty-four rows, inside a drawer. These are the
   alarm. */

const settings = () => allSettings().map((s) => s.setting)

const named = (s: MfaSetting) => `${s.id} (${s.label})`

describe('presets', () => {
  it('are inside the range they belong to', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'number' || !s.field.presets) continue
      for (const p of s.field.presets) {
        expect(
          `${named(s)}: ${p} in ${s.field.min}-${s.field.max} → ${p >= s.field.min && p <= s.field.max}`,
        ).toBe(`${named(s)}: ${p} in ${s.field.min}-${s.field.max} → true`)
      }
    }
  })

  it('are unique and in ascending order, because they are drawn in the order given', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'number' || !s.field.presets) continue
      const p = s.field.presets
      expect(`${named(s)}: ${p.join(',')}`).toBe(`${named(s)}: ${[...new Set(p)].sort((a, b) => a - b).join(',')}`)
    }
  })

  /* The rule they exist under. A range small enough to read off the tick scale
     does not need a shortcut to a value already printed under the track — and
     otp-length, 4 to 8, is exactly that case. */
  it('only appear on ranges too wide to show every step', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'number' || !s.field.presets) continue
      expect(`${named(s)} spans ${s.field.max - s.field.min}`).toBe(
        `${named(s)} spans ${s.field.max - s.field.min > 12 ? s.field.max - s.field.min : 'too little to need presets'}`,
      )
    }
  })

  it('leave the tick-scale ranges alone', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'number') continue
      if (s.field.max - s.field.min > 12) continue
      expect(`${named(s)}: ${s.field.presets ? 'has presets' : 'none'}`).toBe(`${named(s)}: none`)
    }
  })
})

describe('text constraints', () => {
  it('compile', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'text' || !s.field.pattern) continue
      expect(() => new RegExp(s.field.kind === 'text' ? s.field.pattern! : ''), named(s)).not.toThrow()
    }
  })

  /* A constraint with nothing to say marks the field red and leaves the user to
     guess which of the two rules they broke. */
  it('always carry the sentence that explains them', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'text') continue
      const constrained = s.field.pattern !== undefined || s.field.maxLength !== undefined
      expect(`${named(s)}: constrained=${constrained} rule=${Boolean(s.field.rule)}`).toBe(
        `${named(s)}: constrained=${constrained} rule=${constrained}`,
      )
    }
  })

  /* A field that opens showing an error is a field nobody trusts. Blank counts
     as fine — both gateway fields start empty and are filled in later. */
  it('start on a value that keeps its own rule', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'text' || s.field.value === '') continue
      const okPattern = !s.field.pattern || new RegExp(s.field.pattern).test(s.field.value)
      const okLength = s.field.maxLength === undefined || s.field.value.length <= s.field.maxLength
      expect(`${named(s)}: pattern=${okPattern} length=${okLength}`).toBe(
        `${named(s)}: pattern=true length=true`,
      )
    }
  })
})

describe('revealed settings', () => {
  it('hang off an option that actually exists', () => {
    for (const s of settings()) {
      for (const key of Object.keys(s.reveals ?? {})) {
        const reachable =
          s.field.kind === 'choice'
            ? s.field.options.includes(key)
            : s.field.kind === 'toggle'
              ? key === 'on' || key === 'off'
              : false
        expect(`${named(s)} reveals on "${key}": reachable=${reachable}`).toBe(
          `${named(s)} reveals on "${key}": reachable=true`,
        )
      }
    }
  })

  /* They store against the same scope as their parent, so an id that clashes
     with a sibling silently shares its value. allSettings() walks them for
     exactly this reason — see the key test in mfa-join.test.ts. */
  it('are included in the walk that checks for key collisions', () => {
    const ids = settings().map((s) => s.id)
    expect(ids).toContain('sms-gw-url')
    expect(ids).toContain('call-gw-auth')
  })

  it('do not reveal further settings of their own', () => {
    // Two levels of disclosure inside one row is a form, not a setting.
    for (const s of settings()) {
      for (const branch of Object.values(s.reveals ?? {})) {
        for (const child of branch) {
          expect(`${named(child)}: nested=${Boolean(child.reveals)}`).toBe(`${named(child)}: nested=false`)
        }
      }
    }
  })

  /* The gap this closed: both provider settings offered "Custom provider" and
     had nowhere to put a gateway, so the option was a dead end that looked like
     a feature. If either loses its branch, that is the regression. */
  it('give both custom-provider options somewhere to go', () => {
    for (const id of ['sms-provider', 'call-provider']) {
      const s = settings().find((x) => x.id === id)
      expect(s, `${id} is missing`).toBeDefined()
      expect(`${id}: ${s!.reveals?.['Custom provider']?.length ?? 0} fields`).toBe(`${id}: 3 fields`)
    }
  })
})

describe('the catalogue as a whole', () => {
  it('has a label on every setting, revealed ones included', () => {
    for (const s of settings()) expect(s.label.trim(), `${s.id} has no label`).not.toBe('')
  })

  it('keeps every number default inside its own bounds', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'number') continue
      const inside = s.field.value >= s.field.min && s.field.value <= s.field.max
      expect(`${named(s)}: ${s.field.value} inside ${s.field.min}-${s.field.max} → ${inside}`).toBe(
        `${named(s)}: ${s.field.value} inside ${s.field.min}-${s.field.max} → true`,
      )
    }
  })

  it('keeps every choice default among its own options', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'choice') continue
      expect(`${named(s)}: ${s.field.options.includes(s.field.value)}`).toBe(`${named(s)}: true`)
    }
  })

  it('still covers all eleven families', () => {
    expect(FAMILIES.length).toBe(11)
  })
})
