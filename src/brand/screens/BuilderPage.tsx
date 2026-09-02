import { PolicyBuilderV4 } from './PolicyBuilderV4'

/* -----------------------------------------------------------------------------
   The builder.

   There were six, behind a switcher: v0 recreated the deployed prototype, v1
   was a canvas and inspector, v2 the three-zone tool layout, v3 a column of
   numbered steps, v5 all of them over one state — and v4, the shipping
   candidate. The switch existed because comparison was the point: the argument
   between the layouts could only be settled on the same policy, in the same
   session, rather than from memory or a screenshot.

   That argument is settled. v4 is the answer, and the other five had already
   stopped being able to express the model — none of them can author a grouped
   predicate, so each had been reduced to a read-only readout of a rule it could
   no longer edit. Five layouts that can show a policy and not change one are
   not a comparison, they are five ways to reach a dead end.

   So the switcher is gone and so are they. They are in the history if the
   argument is ever reopened.
   -------------------------------------------------------------------------- */

export function BuilderPage({ policyId, open }: { policyId: string; open?: 'gauntlet' | 'impact' }) {
  return <PolicyBuilderV4 policyId={policyId} open={open} />
}
