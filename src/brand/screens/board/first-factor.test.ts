import { describe, expect, it } from 'vitest'

import { METHODS } from '../rule-form'
import { METHOD_PREFIX, firstFactorPatch, firstFactorValue } from './first-factor'

describe('the first factor as one picker', () => {
  it('reads the two plain answers as themselves', () => {
    expect(firstFactorValue({ firstFactor: 'Password' })).toBe('Password')
    expect(firstFactorValue({ firstFactor: 'Any' })).toBe('Any')
  })

  it('reads a specific method as that method, not as "Specific"', () => {
    expect(firstFactorValue({ firstFactor: 'Specific', firstFactorMethod: 'SMS / OTP' })).toBe(`${METHOD_PREFIX}SMS / OTP`)
  })

  it('reads a specific method with none chosen as no value, so the placeholder shows', () => {
    /* Only a rule saved before the merge can hold this. Showing "Password"
       instead would state an answer the rule does not have. */
    expect(firstFactorValue({ firstFactor: 'Specific' })).toBe('')
  })

  it('sets both fields at once when a method is chosen', () => {
    expect(firstFactorPatch(`${METHOD_PREFIX}WebAuthn / FIDO2`)).toEqual({
      firstFactor: 'Specific',
      firstFactorMethod: 'WebAuthn / FIDO2',
    })
  })

  it('clears a leftover method when a plain answer is chosen', () => {
    expect(firstFactorPatch('Password')).toEqual({ firstFactor: 'Password', firstFactorMethod: undefined })
    expect(firstFactorPatch('Any')).toEqual({ firstFactor: 'Any', firstFactorMethod: undefined })
  })

  it('round-trips every option the picker offers', () => {
    const offered = ['Password', 'Any', ...METHODS.map((m) => METHOD_PREFIX + m)]
    for (const v of offered) expect(firstFactorValue(firstFactorPatch(v)), v).toBe(v)
  })

  it('cannot produce the unfinished "specific, but which?" state', () => {
    /* The whole point of the merge: no single choice leaves Specific without a
       method, so the pane's "No method chosen" can only ever describe old data. */
    const offered = ['Password', 'Any', ...METHODS.map((m) => METHOD_PREFIX + m)]
    for (const v of offered) {
      const p = firstFactorPatch(v)
      expect(p.firstFactor === 'Specific' && !p.firstFactorMethod, v).toBe(false)
    }
  })
})
