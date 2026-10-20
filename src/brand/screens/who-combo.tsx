import { useId, useMemo } from 'react'

import type { Group, RuleWho, User } from '../data'
import { IdentityCombo } from './sign-in-tests/identity-combo'
import { valuesOfWho, whoOfValues, whoOptions } from './who-options'

/* -----------------------------------------------------------------------------
   A rule's Who as the Access checks Identity field (Guided setup, 19 Oct 2026).

   The same field, unchanged where Access checks draws it: chips with faces, the
   Users | Groups switch over a portalled list, ranked search, "Search groups"
   when the words match only the other kind. Three of its optional props make it
   a rule's Who: no cap on the picks, nothing picked read as the answer
   "Everyone" (a group's square, in the answer's colour), and the list opening on
   Groups — the commoner pick for a rule. The values go back and forth through
   who-options.ts, keeping any exceptions the who already had.
   -------------------------------------------------------------------------- */

export function WhoCombo({
  who,
  onChange,
  users,
  groups,
  label = 'Who',
  empty = 'Everyone',
}: {
  who: RuleWho | undefined
  onChange: (who: RuleWho | undefined) => void
  users: readonly User[]
  groups: readonly Group[]
  /** The field's name, for its accessible label. */
  label?: string
  /** What nothing picked means. */
  empty?: string
}) {
  const domId = useId()
  const options = useMemo(() => whoOptions(users, groups), [users, groups])
  return (
    <IdentityCombo
      label={label}
      choose={empty}
      options={options}
      value={valuesOfWho(who)}
      domId={domId}
      invalid={false}
      max={Infinity}
      answer={{ text: empty, kind: 'group' }}
      openOn="group"
      onChange={(next) => onChange(whoOfValues(next, who))}
    />
  )
}
