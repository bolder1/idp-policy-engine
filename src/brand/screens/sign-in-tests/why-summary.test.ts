import { describe, expect, it } from 'vitest'

import { LAST_ROW } from '../testing/evidence'
import { whySummaryOf, type WhySummaryInput } from './why-summary'

const plan = (decision: 'deny' | '2fa', by: string): WhySummaryInput['plan'] =>
  ({ appName: 'AWS Console', outcome: { status: 'decided', decision, by }, rules: [{ id: LAST_ROW, checks: [] }], landing: 0 }) as unknown as WhySummaryInput['plan']

describe('whySummaryOf', () => {
  it('says a refusal for a ticket: who, where to, the answer, what decided it, the reason, what else, how to get in', () => {
    const text = whySummaryOf({
      plan: plan('deny', 'Decided by AWS for engineering teams · Rule 1 — Contractors away from the office'),
      items: [{ head: 'Leo is in Engineering and Contractors', detail: 'Contractors’ rule applies first', fix: '' }],
      person: 'Leo Fernandes',
      getIn: [{ label: 'From Office network', decision: '1fa', source: 'rule 2' }],
    })
    expect(text.split('\n')).toEqual([
      'Access check: Leo Fernandes → AWS Console',
      'Answer: Deny',
      'Decided by AWS for engineering teams · Rule 1 — Contractors away from the office',
      'Reason: No rule let this person in',
      '',
      'Also worth knowing:',
      '- Leo is in Engineering and Contractors — Contractors’ rule applies first',
      '',
      'How to get in:',
      '- From Office network: Allow on 1 factor (rule 2)',
    ])
  })

  it('leaves out the reason and the sections that have nothing to say on an allow', () => {
    const text = whySummaryOf({ plan: plan('2fa', 'Decided by Box for design · Rule 2'), items: [], person: 'Maya Iyer' })
    expect(text).toBe('Access check: Maya Iyer → AWS Console\nAnswer: Allow with 2FA\nDecided by Box for design · Rule 2')
  })
})
