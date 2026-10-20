import { audienceOf, type Policy } from '../../../data'

/* -----------------------------------------------------------------------------
   Test-only. The showcase tenant has ONE sign-in policy per application (14 Oct
   2026), so a second policy covering AWS can no longer come from the seed. The
   tests that read two policies for one application (a decider, and another that
   also covers the person) rebuild the old second one here from the merged
   'sc-aws-engineering': Finance, a compliant device, then Thomas Byrne's Deny,
   listed after it.
   -------------------------------------------------------------------------- */

const awsOf = (policies: Policy[]): Policy => {
  const aws = policies.find((p) => p.id === 'sc-aws-engineering')
  if (!aws) throw new Error('no sc-aws-engineering in the tenant')
  return aws
}

/** The old 'AWS billing for Finance' built from the merged policy's Finance and Thomas Byrne rules. */
function billingOf(aws: Policy): Policy {
  const finance = aws.rules[3]
  const thomas = aws.rules[4]
  return {
    ...aws,
    id: 'sc-aws-finance',
    name: 'AWS billing for Finance',
    audience: audienceOf(['finance']),
    rules: [
      { ...finance, id: `${finance.id}-billing`, name: 'Compliant device', who: { groupIds: [], userIds: [] } },
      { ...thomas, id: `${thomas.id}-billing` },
    ],
  }
}

/** The tenant's policies with the billing policy listed straight after the merged AWS one. */
export function withBillingFinance(policies: Policy[]): Policy[] {
  const aws = awsOf(policies)
  const i = policies.indexOf(aws)
  return [...policies.slice(0, i + 1), billingOf(aws), ...policies.slice(i + 1)]
}

/* The old pair, for the tests that time or count a run (pace, route): the merged
   policy cut back to what AWS for engineering teams was (its first three rules,
   Engineering, DevOps and Contractors as the audience), then the billing policy
   for Finance after it. */
export function splitAws(policies: Policy[]): Policy[] {
  const aws = awsOf(policies)
  const first: Policy = { ...aws, name: 'AWS for engineering teams', audience: audienceOf(['engineering', 'devops', 'contractors']), rules: aws.rules.slice(0, 3) }
  return [...policies.slice(0, policies.indexOf(aws)), first, billingOf(aws), ...policies.slice(policies.indexOf(aws) + 1)]
}
