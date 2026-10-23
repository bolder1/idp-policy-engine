import { describe, expect, it } from 'vitest'

import type { SignInScreens } from '../testing/screens-of'
import { seeSteps, seeTold } from './see-model'

/* What they see, as a page of the details panel (20 Oct 2026): the steps are the player's own chips, in order. */
const person = { name: 'Aisha Khan', email: 'aisha@mo.test' }

const allow: SignInScreens = {
  decision: '1fa',
  policyName: 'P',
  ruleName: 'R',
  person,
  steps: [{ kind: 'password', username: person.email }],
}

const deny: SignInScreens = {
  decision: 'deny',
  policyName: 'P',
  ruleName: 'R',
  person,
  steps: [{ kind: 'deny', message: 'No.', action: 'Update it', contact: 'IT help desk' }],
}

describe('seeSteps', () => {
  it('numbers the player\'s chips from 1, each with what it asks for', () => {
    const steps = seeSteps(allow, 'Dropbox')
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.map((s) => s.n)).toEqual(steps.map((_, i) => i + 1))
    expect(steps.every((s) => s.label !== '')).toBe(true)
    expect(steps[steps.length - 1].asks).toBe('Dropbox opens')
  })

  it('opens a refusal on the username page, then the deny message', () => {
    const steps = seeSteps(deny, 'Dropbox')
    expect(steps[0].asks).toBe('Enter your username')
    expect(steps[steps.length - 1].asks).toBe('The deny message')
  })
})

describe('seeTold', () => {
  it('says a deny\'s message, next step and contact', () => {
    expect(seeTold(deny)).toEqual({ kind: 'deny', message: 'No.', rows: [['Next step', 'Update it'], ['Contact', 'IT help desk']] })
  })

  it('names the factors an allow asks for', () => {
    expect(seeTold(allow)).toEqual({ kind: 'allow', rows: [['First factor', 'Password']] })
  })
})
