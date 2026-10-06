import { useMemo, type ReactNode } from 'react'

import { memberGroupIds, type Audience, type Group, type User } from '../../data'
import { Badge } from '../../kit'
import { IdentityCombo } from './identity-combo'
import { groupNamesOf, identityOptions, personPick, type IdentityValue } from './sign-in-card'

/* -----------------------------------------------------------------------------
   Who signs in: users and groups in ONE field, several at once (owner, 5 Oct
   2026, of "Identity type: User" over "User: Choose a user": "I think we can
   combine both and it can be multiple select, so the user can select more
   than one thing"), chosen in place the way Jira chooses an assignee (owner,
   3 Oct 2026: "check the Jira assignee part — I like that experience"), one
   kind at a time (owner, 5 Oct 2026, of one list with Users and Groups
   headings: "I want the user to first select a user or group, and based on
   that selection display the list in a single dropdown"):

     [(MI) Maya Iyer ×] [[FI] Finance ×] [(RM) Ravi Menon ×]     ▾
     ┌──────────────────────────────────────────────────────┐
     │ [       Users       ]         Groups                  │
     │   Clear all                                           │
     │ ✓ (MI) Maya Iyer            Engineering, Finance      │
     │ ✓ (RM) Ravi Menon           Engineering               │
     │   (PS) Priya Sharma         Finance                   │
     └──────────────────────────────────────────────────────┘

   The field is the in-place combobox (identity-combo.tsx): at rest the
   picks as chips, each mark saying its kind — a person's round face, a
   group's square; one press turns it into a search with the list dropping
   below — on top the switch, Users | Groups, on the last pick's kind, and
   under it that kind alone, its picks ticked at the top, Clear all over
   them. A press on a row picks it or puts it back, and the list stays open
   for the next; a switch keeps every pick; five at most — the canvas's top
   bar holds a chip for each. Inside a policy the people come under In this
   policy first (sign-in-card.ts `identityOptions`, from
   `personPickerOptions`). A pick is the same value as ever: a person's id,
   or `group:<id>` (`personPick`).

   Run runs every pick, one sign-in each (the page's `runOfPicks`), and the
   canvas tells one at a time. A group is ONE run: it stands for one of its
   members — someone in that group alone (`memberOf`) — and the line under
   it says who.

   Under the field, for ONE pick only — two or more say themselves, as
   chips: a person's every group, and where that is more than one, that the
   outcome shows what each one gets (the owner's Tanmay case); a group's
   "Tested as …".
   -------------------------------------------------------------------------- */

export function IdentityField({
  users,
  groups,
  values,
  audience,
  domId,
  error,
  onChange,
}: {
  users: readonly User[]
  groups: readonly Group[]
  /** The picks, in the order chosen: a person's id, or `group:<id>`. */
  values: readonly IdentityValue[]
  /** Inside a policy: its audience, for its people first. */
  audience: Audience | null
  /** The field's id, the one a "Needs" link and the canvas's Check access focus. */
  domId: string
  /** What stops a run, under the field. */
  error?: ReactNode
  onChange: (next: readonly IdentityValue[]) => void
}) {
  const options = useMemo(() => identityOptions(users, groups, audience), [users, groups, audience])
  const one = values.length === 1 ? personPick(values[0], users) : null
  const person = one?.personId ? (users.find((u) => u.id === one.personId) ?? null) : null
  const group = one?.asGroup ? (groups.find((g) => g.id === one.asGroup) ?? null) : null
  const theirGroups = person && !one?.asGroup ? groupNamesOf(person, groups) : []

  return (
    <div className="sit-ident">
      <IdentityCombo
        label="Identity"
        choose="Choose users or groups"
        options={options}
        value={values}
        domId={domId}
        invalid={!!error}
        onChange={onChange}
      />
      {error}
      {theirGroups.length > 0 && (
        <div className="sit-ident__groups">
          <span className="sit-ident__label">Member of</span>
          {theirGroups.map((g) => (
            <Badge key={g} tone="neutral">
              {g}
            </Badge>
          ))}
        </div>
      )}
      {theirGroups.length > 1 && <p className="sit-ident__note">In {theirGroups.length} groups: the outcome shows what each group gets.</p>}
      {group && person && (
        <p className="sit-ident__note">
          Tested as {person.name}
          {memberGroupIds(person).length === 1 ? `, who is in ${group.name} alone` : ''}.
        </p>
      )}
    </div>
  )
}
