import { DECISION_WORDS } from '../../decision-words'
import { DENY_REASON_WORD } from '../testing/deny-reason'
import { denyReasonOf } from './deny-reason'
import type { EngineRun } from './engine-run'
import type { GetIn } from './get-in'
import type { WhyItem } from './journey'

/* -----------------------------------------------------------------------------
   The why as plain text, for a ticket (docs/specs/DENIAL-NEXT.md, P0 item 2):
   who, where to, the answer, what decided it, the reason when it was a
   refusal, what else applies, and what would let them in. Admin and help desk
   text, so it may say the reason (owner, 5 Oct 2026). PURE.
   -------------------------------------------------------------------------- */

export interface WhySummaryInput {
  plan: Pick<EngineRun, 'outcome' | 'rules' | 'landing' | 'appName'>
  items: readonly Pick<WhyItem, 'head' | 'detail' | 'fix'>[]
  person: string
  getIn?: readonly Pick<GetIn, 'label' | 'decision' | 'source'>[] | null
}

export function whySummaryOf({ plan, items, person, getIn }: WhySummaryInput): string {
  const o = plan.outcome
  const answer = o.status === 'decided' && o.decision ? DECISION_WORDS[o.decision] : o.status === 'depends' ? 'Depends' : 'No policy decides'
  const out: string[] = [`Access check: ${person} → ${plan.appName}`, `Answer: ${answer}`]
  if (o.by) out.push(o.by)
  const reason = denyReasonOf(plan)
  if (reason) out.push(`Reason: ${DENY_REASON_WORD[reason]}`)
  if (items.length > 0) {
    out.push('', 'Also worth knowing:')
    for (const it of items) out.push(`- ${it.head}${it.detail ? ` — ${it.detail}` : ''}${it.fix ? ` (${it.fix})` : ''}`)
  }
  if (getIn && getIn.length > 0) {
    out.push('', 'How to get in:')
    for (const g of getIn) out.push(`- ${g.label}: ${DECISION_WORDS[g.decision]}${g.source ? ` (${g.source})` : ''}`)
  }
  return out.join('\n')
}
