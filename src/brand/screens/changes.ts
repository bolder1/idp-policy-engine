import { DECISION_LABEL, FALLBACK_NAME, fallbackRule, groups as seedGroups, users as seedUsers, type Group, type Policy, type Rule, type User } from '../data'
import { leafCount, sig } from '../predicate'
import { hasWho, normaliseWho, whoKey, type WhoList } from '../rule-who'

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

/* `sig` rather than a hand-rolled join, because this has to see a REGROUPING.

   The old key was a positional list over a flat array. Move a condition from
   one alternative to another and the leaves are identical, so the key matched
   and the save bar reported nothing — while the rule now catches a different
   set of people. `sig` nests the join characters, so it distinguishes them. */
const conditionKey = (r: Rule) => sig(r.when)

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

export function describeChanges(
  saved: Policy,
  draft: Policy,
  groups: Group[] = seedGroups,
  directory: User[] = seedUsers,
): string[] {
  const out: string[] = []

  if (saved.name !== draft.name) out.push(`Renamed to “${draft.name}”`)

  /* --- Audience ------------------------------------------------------------

     Named, not merely flagged. This used to be a per-rule line reading "now
     applies to a different audience", which tells the reader that the single
     biggest claim the policy makes has changed and refuses to say how. It is
     one policy-level fact now, so it can be diffed properly and say who. */
  const a = saved.audience
  const b = draft.audience
  if (a.everyone !== b.everyone) {
    out.push(b.everyone ? 'Now applies to everyone in the directory' : 'No longer applies to everyone')
  }
  const gname = (id: string) => groups.find((g) => g.id === id)?.name ?? id
  const uname = (id: string) => directory.find((u) => u.id === id)?.name ?? id
  for (const id of b.groupIds) if (!a.groupIds.includes(id)) out.push(`${gname(id)} added to the audience`)
  for (const id of a.groupIds) if (!b.groupIds.includes(id)) out.push(`${gname(id)} removed from the audience`)
  for (const id of b.userIds) if (!a.userIds.includes(id)) out.push(`${uname(id)} added to the audience`)
  for (const id of a.userIds) if (!b.userIds.includes(id)) out.push(`${uname(id)} removed from the audience`)

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

    /* Who, named the way the audience is. It is not a condition and is not
       counted as one: choosing Finance changes who the rule is for, and "1
       condition added" would say something else. */
    if (whoKey(before.who) !== whoKey(r.who)) {
      if (!hasWho(r.who)) {
        out.push(`“${r.name}” now applies to everyone`)
      } else {
        const was = normaliseWho(before.who)
        const now = normaliseWho(r.who)!
        const ids = (w: typeof was, list: WhoList) => (w ? (w[list] ?? []) : [])
        const lists: { list: WhoList; name: (id: string) => string; added: string; removed: string }[] = [
          { list: 'groupIds', name: gname, added: 'added to Who on', removed: 'removed from Who on' },
          { list: 'userIds', name: uname, added: 'added to Who on', removed: 'removed from Who on' },
          { list: 'exceptGroupIds', name: gname, added: 'added as an exception on', removed: 'no longer an exception on' },
          { list: 'exceptUserIds', name: uname, added: 'added as an exception on', removed: 'no longer an exception on' },
        ]
        for (const { list, name, added, removed } of lists) {
          for (const id of ids(now, list)) if (!ids(was, list).includes(id)) out.push(`${name(id)} ${added} “${r.name}”`)
          for (const id of ids(was, list)) if (!ids(now, list).includes(id)) out.push(`${name(id)} ${removed} “${r.name}”`)
        }
      }
    }

    if (conditionKey(before) !== conditionKey(r)) {
      /* Leaves, not containers. Counting `cards` would report "+1 condition
         added" when the author merely wrapped two existing conditions in a new
         alternative, and nothing was added at all. */
      const d = leafCount(r.when) - leafCount(before.when)
      out.push(
        d === 0
          ? `Conditions edited on “${r.name}”`
          : d > 0
            ? `${d} condition${d === 1 ? '' : 's'} added to “${r.name}”`
            : `${-d} condition${d === -1 ? '' : 's'} removed from “${r.name}”`,
      )
    }

    if (before.enabled !== r.enabled) out.push(`“${r.name}” switched ${r.enabled ? 'on' : 'off'}`)

    /* The rationale line has gone with the field it reported.

       A rule has a name and nothing else to explain itself with now, and a
       rename is already reported below. */


    if (factorKey(before) !== factorKey(r)) out.push(`Authentication settings changed on “${r.name}”`)
  })

  /* The last rule decides every sign-in no rule above catches, so a change to it
     is reported like any other rule's. */
  const fbBefore = saved.fallback ?? fallbackRule()
  const fbAfter = draft.fallback ?? fallbackRule()
  if (fbBefore.decision !== fbAfter.decision)
    out.push(`“${FALLBACK_NAME}” now ${DECISION_LABEL[fbAfter.decision]} instead of ${DECISION_LABEL[fbBefore.decision]}`)
  else if (factorKey(fbBefore) !== factorKey(fbAfter)) out.push(`Authentication settings changed on “${FALLBACK_NAME}”`)

  /* Named, not counted. "Now applies to 1 app" was true and useless; which
     applications a policy gained or lost is the whole of what changed — and
     with a list there can be one of each in a single edit, so they are reported
     as two lines rather than as one replacement. */
  const gained = draft.appIds.filter((id) => !saved.appIds.includes(id))
  const lost = saved.appIds.filter((id) => !draft.appIds.includes(id))
  if (gained.length > 0) out.push(`Now protects ${gained.join(', ')}`)
  if (lost.length > 0) {
    out.push(
      draft.appIds.length === 0
        ? 'No longer attached to an application'
        : `No longer protects ${lost.join(', ')}`,
    )
  }

  return out
}
