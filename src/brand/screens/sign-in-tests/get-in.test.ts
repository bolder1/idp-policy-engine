import { describe, expect, it } from 'vitest'

import { LAST_ROW } from '../testing/evidence'
import type { SignInForm } from '../testing/sign-in-form'
import type { EngineRun } from './engine-run'
import { getInOptions, type Variant } from './get-in'

const run = (decision: 'deny' | '2fa' | '1fa' | null, status: 'decided' | 'depends' = 'decided') =>
  ({ outcome: { status, decision }, rules: [{ id: LAST_ROW, checks: [] }], landing: 0 }) as unknown as Pick<EngineRun, 'outcome' | 'rules' | 'landing'>
const form = { appId: 'aws' } as unknown as SignInForm
const v = (key: string, decision: 'deny' | '2fa' | '1fa' | null, status: 'decided' | 'depends' = 'decided', f: SignInForm = form): Variant => ({
  key,
  label: key,
  source: 'rule 1',
  plan: { outcome: run(decision, status).outcome },
  form: f,
})

describe('getInOptions', () => {
  it('keeps the what-ifs that let the person in, in order, and drops the ones that still refuse or cannot be told', () => {
    const got = getInOptions(run('deny'), [v('from:office', '1fa'), v('device:android', 'deny'), v('risk:12', '2fa'), v('maybe', null, 'depends')])
    expect(got?.map((g) => [g.key, g.decision])).toEqual([
      ['from:office', '1fa'],
      ['risk:12', '2fa'],
    ])
    expect(got?.[0].form).toBe(form)
  })

  it('is null when the sign-in was not refused, and empty when nothing gets in', () => {
    expect(getInOptions(run('2fa'), [v('from:office', '1fa')])).toBeNull()
    expect(getInOptions(run('deny'), [v('device:android', 'deny')])).toEqual([])
  })

  it('leaves out a what-if the page cannot run (no form, no run of its own)', () => {
    expect(getInOptions(run('deny'), [{ ...v('as:finance', '1fa'), form: undefined }, { key: 'g', label: 'g', source: '', plan: null }])).toEqual([])
  })
})
