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

describe('number options', () => {
  it('are inside the range they belong to', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'number') continue
      const { min, max, options } = s.field
      const outside = options.filter((o) => o < min || o > max)
      expect(`${named(s)}: outside ${min}-${max} → ${outside.join(',') || 'none'}`).toBe(
        `${named(s)}: outside ${min}-${max} → none`,
      )
    }
  })

  it('are unique and ascending, because they are drawn in the order given', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'number') continue
      const o = s.field.options
      expect(`${named(s)}: ${o.join(',')}`).toBe(
        `${named(s)}: ${[...new Set(o)].sort((x, y) => x - y).join(',')}`,
      )
    }
  })

  /* The whole point of naming the set: a control that offers five values and
     opens showing a sixth is a control reporting a state you cannot return to. */
  it('always contain the default the field opens on', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'number') continue
      expect(`${named(s)}: ${s.field.value} in [${s.field.options.join(',')}]`).toBe(
        `${named(s)}: ${s.field.options.includes(s.field.value) ? s.field.value : 'MISSING'} in [${s.field.options.join(',')}]`,
      )
    }
  })

  it('give every number setting something to choose from', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'number') continue
      expect(`${named(s)}: ${s.field.options.length} options`).not.toBe(`${named(s)}: 0 options`)
      expect(s.field.options.length, `${named(s)} offers only one value`).toBeGreaterThan(1)
    }
  })

  /* Numbers all render through one control now — a dropdown — so the old
     assertion that both a segmented group and a dropdown were reached has been
     replaced rather than deleted. What matters instead is that every option can
     carry its unit, because the dropdown puts the unit on each option and the
     closed trigger has to read as a whole value rather than a bare number. */
  it('gives every number setting a unit its options can carry', () => {
    for (const s of settings()) {
      if (s.field.kind !== 'number') continue
      expect(`${named(s)}: unit=${s.field.unit ?? 'MISSING'}`).not.toBe(`${named(s)}: unit=MISSING`)
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

  /* The catalogue was pruned to exactly the options the brief lists. Asserted by
     id rather than by count, so re-adding one is a change somebody makes on
     purpose rather than a drift nobody notices. */
  it('holds only the settings the brief kept', () => {
    const ids = settings().map((s) => s.id).sort()
    expect(ids).toEqual(
      [
        'grid-length', 'grid-size',
        'kba-change', 'kba-limit', 'kba-verify',
        'otp-length', 'otp-length', 'otp-validity', 'otp-validity',
        'push-biometric', 'push-number',
        'token-assign',
      ].sort(),
    )
  })
})
