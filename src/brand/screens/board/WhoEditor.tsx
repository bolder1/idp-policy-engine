import { useState } from 'react'
import { ChevronDown, UserRound, Users } from 'lucide-react'

import { useBrand, useNameLookup } from '../../store'
import type { Predicate, Rule } from '../../data'
import { restConditions, setWho, setWhoOperator, whoEditable, whoIds, whoOperator, type WhoType } from '../../audience-ops'
import { ConditionPopover, summarise, type ValueOption } from '../ConditionPopover'

/* -----------------------------------------------------------------------------
   WHO — the first thing a rule is about.

   Writing a rule starts with a person: "for contractors, when they are off the
   office network, ask for a second factor." The form used to open on the second
   clause. Groups and people were two attributes among twenty-eight in a
   catalogue, reached the same way as Day of week, so the question everybody
   starts with was the one the form made you go looking for.

   It is its own step now, and the step is only a VIEW. What it writes is the
   `group` and `user` conditions the rule could always hold — see
   `audience-ops.ts` for why that matters and why `Rule.appliesTo` is not coming
   back. Nothing downstream changes: the linter still subsumes them, the
   simulator still evaluates them, the read-back still says them.

   The two are edited separately because they answer differently. Groups follow
   whoever is in them on the day; a named person is a person somebody has to
   remember to remove. A rule can use either, both, or neither.
   -------------------------------------------------------------------------- */

export function WhoEditor({ rule, onPatch }: { rule: Rule; onPatch: (p: Partial<Rule>) => void }) {
  const store = useBrand()
  const resolve = useNameLookup()
  const write = (next: Predicate) => onPatch({ when: next })

  /* In an OR of alternatives, "who" has no single place to live — see
     `whoEditable`. Rather than write it somewhere that means something else,
     the step stands down and says where to go. */
  if (!whoEditable(rule.when)) {
    return (
      <p className="bb__whonote">
        This rule has more than one way in, so who it covers is part of each alternative rather than one setting. Edit the
        group and people conditions below.
      </p>
    )
  }

  return (
    <div className="bb__who">
      <WhoRow
        kind="group"
        icon={Users}
        rule={rule}
        write={write}
        options={store.groups.map((g) => ({ value: g.id, label: g.name, meta: `${g.memberCount.toLocaleString()} people`, icon: Users }))}
        names={whoIds(rule.when, 'group').map((id) => resolve('group', id) ?? id)}
        empty="Any group"
        ops={['in', 'not in']}
      />
      <WhoRow
        kind="user"
        icon={UserRound}
        rule={rule}
        write={write}
        options={store.users.map((u) => ({ value: u.id, label: u.name, meta: u.email, icon: UserRound }))}
        names={whoIds(rule.when, 'user').map((id) => resolve('user', id) ?? id)}
        empty="Nobody named"
        ops={['is', 'is not']}
        footer={store.unlistedUsers > 0 ? `${store.unlistedUsers.toLocaleString()} more in the directory` : undefined}
      />

      {/* Said once, at the foot, and only when it is true.

          A rule that names nobody applies to everyone the POLICY governs, which
          is the audience set on the policy itself — not to everyone in the
          tenant. That is the sentence somebody needs before they decide whether
          leaving this blank is safe, and it is worth nothing on a rule that has
          already been narrowed. */}
      {whoIds(rule.when, 'group').length === 0 && whoIds(rule.when, 'user').length === 0 && (
        <p className="bb__whonote">Everyone this policy governs. Narrow it by choosing groups or people.</p>
      )}
    </div>
  )
}

/* One of the two, as a labelled pill.

   The same `ConditionPopover` the conditions use, so choosing a group here and
   choosing one in a condition are the same gesture with the same list — they
   are, after all, writing the same condition. What differs is that the
   attribute is fixed: this row is about groups, so it does not offer to become
   a row about the time of day. */
function WhoRow({
  kind,
  icon: Ico,
  rule,
  write,
  options,
  names,
  empty,
  ops,
  footer,
}: {
  kind: WhoType
  icon: typeof Users
  rule: Rule
  write: (p: Predicate) => void
  options: ValueOption[]
  names: string[]
  /** What the pill says when nothing is chosen — never a bare "Choose…". */
  empty: string
  ops: string[]
  footer?: string
}) {
  const ids = whoIds(rule.when, kind)
  const op = whoOperator(rule.when, kind)
  const [nonce, setNonce] = useState(0)

  return (
    <div className="bb__whorow">
      <span className="bb__whorow__mark" aria-hidden>
        <Ico size={14} strokeWidth={2} />
      </span>
      <span className="bb__whorow__label">{kind === 'group' ? 'Groups' : 'People'}</span>

      {/* A local pill rather than the shared one: `ConditionPopover` edits a
          whole condition, and this row must never let somebody retype the
          attribute out from under the step it belongs to. */}
      <WhoPill
        key={nonce}
        summary={summarise(names, empty)}
        operator={op}
        ops={ops}
        options={options}
        picked={ids}
        unset={false}
        footer={footer}
        onOperator={(o) => write(setWhoOperator(rule.when, kind, o))}
        onValues={(v) => {
          write(setWho(rule.when, kind, v, op))
          /* Remounting on the transition to empty, because removing the last id
             deletes the condition — and the popover's open state is keyed to a
             condition that no longer exists. */
          if (v.length === 0) setNonce((n) => n + 1)
        }}
      />
    </div>
  )
}

/* The pill for one who-row: an operator and a value list, no attribute.

   Built on the same parts as the condition pill and deliberately NOT on
   `ConditionPopover` itself — that component's first segment retypes the
   condition, which is exactly the thing this row must not offer. */
function WhoPill({
  summary,
  operator,
  ops,
  options,
  picked,
  unset,
  footer,
  onOperator,
  onValues,
}: {
  summary: string
  operator: string
  ops: string[]
  options: ValueOption[]
  picked: string[]
  unset: boolean
  footer?: string
  onOperator: (o: string) => void
  onValues: (v: string[]) => void
}) {
  return (
    <ConditionPopover
      /* A synthetic condition: the popover reads `typeId` for its list and
         `operator` for its middle segment, and this row supplies both. The id
         is stable per row, and nothing writes it back to the model — every
         change goes out through the two callbacks. */
      c={{ id: 'who', typeId: ops[0] === 'in' ? 'group' : 'user', operator, values: picked }}
      summary={summary}
      options={options}
      names={picked}
      unset={unset}
      hideAttribute
      footer={footer}
      onRetype={() => undefined}
      onOperator={onOperator}
      onValues={onValues}
      onScope={() => undefined}
      onRemove={() => onValues([])}
    />
  )
}

/** How many conditions the second step is left with, for its heading. */
export const restCount = (p: Predicate) => restConditions(p).length

export { ChevronDown }
