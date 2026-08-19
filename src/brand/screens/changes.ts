import { DECISION_LABEL, type Policy, type Rule } from '../data'

/* -----------------------------------------------------------------------------
   What changed, in words.

   COMPONENTS.md's rule for the unsaved-changes bar is "name what changed, not
   how many things changed", and the reason is specific to this screen: a policy
   is an ordered list where moving a rule is a semantic edit indistinguishable
   from an accidental drag. "3 unsaved changes" cannot tell those apart.
   "Executive step-up moved to position 2" can.

   Kept deliberately shallow. This describes edits an author would recognise
   making; it is not a diff engine, and a rule whose conditions were edited says
   so rather than enumerating them — the review dialog prints the whole rule in
   prose two clicks later, which is the right place for detail.
   -------------------------------------------------------------------------- */

const conditionKey = (r: Rule) =>
  r.conditions.map((c) => `${c.typeId}|${c.operator}|${c.values.join(',')}|${c.joiner}`).join('␟')

const factorKey = (r: Rule) =>
  [
    r.firstFactor,
    r.firstFactorMethod ?? '',
    r.secondFactor,
    (r.secondFactorMethods ?? []).join(','),
    (r.methodChain ?? []).join(','),
    r.preferredFallback ?? '',
    r.rememberMfa,
    r.rememberDays ?? '',
    r.forceMfaEachLogin ?? false,
    r.allowDisable2fa,
  ].join('|')

export function describeChanges(saved: Policy, draft: Policy): string[] {
  const out: string[] = []

  if (saved.name !== draft.name) out.push(`Renamed to “${draft.name}”`)

  const savedById = new Map(saved.rules.map((r) => [r.id, r]))
  const draftById = new Map(draft.rules.map((r) => [r.id, r]))

  for (const r of draft.rules) if (!savedById.has(r.id)) out.push(`Added “${r.name}”`)
  for (const r of saved.rules) if (!draftById.has(r.id)) out.push(`Removed “${r.name}”`)

  draft.rules.forEach((r, i) => {
    const before = savedById.get(r.id)
    if (!before) return

    if (before.name !== r.name) out.push(`“${before.name}” renamed to “${r.name}”`)

    /* Position is only worth reporting when the rule itself did not move
       because something else was inserted above it — but the model has no way
       to tell those apart, and first-match-wins means both genuinely change
       what this rule decides. So both are reported. */
    const wasAt = saved.rules.findIndex((x) => x.id === r.id)
    if (wasAt !== i) out.push(`“${r.name}” moved to position ${i + 1} — evaluation order changed`)

    if (before.decision !== r.decision)
      out.push(`“${r.name}” now ${DECISION_LABEL[r.decision]} instead of ${DECISION_LABEL[before.decision]}`)

    if (conditionKey(before) !== conditionKey(r)) {
      const d = r.conditions.length - before.conditions.length
      out.push(
        d === 0
          ? `Conditions edited on “${r.name}”`
          : d > 0
            ? `${d} condition${d === 1 ? '' : 's'} added to “${r.name}”`
            : `${-d} condition${d === -1 ? '' : 's'} removed from “${r.name}”`,
      )
    }

    if (JSON.stringify(before.appliesTo) !== JSON.stringify(r.appliesTo))
      out.push(`“${r.name}” now applies to a different audience`)

    if (before.enabled !== r.enabled) out.push(`“${r.name}” switched ${r.enabled ? 'on' : 'off'}`)

    /* Reported, even though it changes no decision. The save bar's job is to
       name what changed, not to rank it — and a rationale quietly rewritten is
       exactly the edit an auditor needs to see, precisely because the engine
       behaves identically afterwards. */
    if ((before.description ?? '') !== (r.description ?? ''))
      out.push(
        !before.description
          ? `Rationale added to “${r.name}”`
          : !r.description
            ? `Rationale removed from “${r.name}”`
            : `Rationale reworded on “${r.name}”`,
      )

    if (factorKey(before) !== factorKey(r)) out.push(`Authentication settings changed on “${r.name}”`)
  })

  const appsBefore = saved.allApps ? 'all' : [...saved.appIds].sort().join(',')
  const appsAfter = draft.allApps ? 'all' : [...draft.appIds].sort().join(',')
  if (appsBefore !== appsAfter) {
    const n = draft.allApps ? null : draft.appIds.length
    out.push(draft.allApps ? 'Now applies to all apps' : `Now applies to ${n} app${n === 1 ? '' : 's'}`)
  }

  return out
}
