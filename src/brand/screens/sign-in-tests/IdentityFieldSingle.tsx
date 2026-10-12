import { useMemo, type ReactNode } from 'react'

import { memberGroupIds, type Audience, type Group, type User } from '../../data'
import { Face } from '../../faces'
import { Badge } from '../../kit'
import { Picker, type PickerOption } from '../../picker'
import { GROUP_PREFIX, groupNamesOf, memberOf, personPickerOptions } from './sign-in-card'

/* -----------------------------------------------------------------------------
   Who signs in: ONE field (owner, 6 Oct 2026: "like that Jira-type experience
   … the first input is the identity type, which is fine; now merge the user
   part with a dropdown only, in the same input — I don't need two labels").

     ┌──────────┬──────────────────────────────────────┐
     │ User   ▾ │ (PS) Priya Sharma                  ▾ │
     └──────────┴──────────────────────────────────────┘
     Member of [Engineering] [Design]
     In 2 groups: the outcome shows what each group gets.

   The type on the left (User or Group), and on the right the dropdown of that
   kind, searched as it is typed: each with its face, what it is, and — inside a
   policy — the people in it first (sign-in-card.ts `personPickerOptions`). The
   section's own heading names it; no label over either half.

   Changing the type takes the nearest thing of the other kind at once — a
   person's first group, or the member a group was tested as — so the field
   never says a kind it holds nothing of; the dropdown is there to change it.

   One person in more than one group is the case the owner asked to see
   (Tanmay, in Engineering and Design, a policy each): the line under it says
   every group, and that the outcome shows what each one gets. A group stands
   for one of its members — someone in that group alone (`memberOf`) — and the
   line says who.
   -------------------------------------------------------------------------- */

type Kind = 'user' | 'group'

const TYPES = [
  { value: 'user', label: 'User' },
  { value: 'group', label: 'Group' },
]

const WORD: Record<Kind, { choose: string; noun: string }> = {
  user: { choose: 'Choose a user', noun: 'people' },
  group: { choose: 'Choose a group', noun: 'groups' },
}

export function IdentityFieldSingle({
  users,
  groups,
  personId,
  asGroup,
  audience,
  domId,
  error,
  onPick,
}: {
  users: readonly User[]
  groups: readonly Group[]
  personId: string | null
  /** A group chosen: its id. The person is then the member it stands for. */
  asGroup: string | null
  /** Inside a policy: its audience, for its people first. */
  audience: Audience | null
  /** The field's id, the one a "Needs" link and the canvas's Check access focus. */
  domId: string
  /** What stops a run, under the field. */
  error?: ReactNode
  /** A person's id, or `group:<id>`. */
  onPick: (value: string) => void
}) {
  const held: Kind = asGroup ? 'group' : 'user'
  const person = personId ? (users.find((u) => u.id === personId) ?? null) : null
  const group = asGroup ? (groups.find((g) => g.id === asGroup) ?? null) : null
  const theirGroups = person && held === 'user' ? groupNamesOf(person, groups) : []

  /* The dropdown's rows: people (inside a policy, its own first), or the groups somebody is listed in. */
  const options = useMemo<PickerOption[]>(
    () =>
      held === 'user'
        ? personPickerOptions(users, groups, audience)
            .filter((o) => !o.value.startsWith(GROUP_PREFIX))
            .map((o) => ({ value: o.value, label: o.label, meta: o.meta, group: audience ? o.group : undefined, art: <Face kind="user" name={o.label} size="sm" decorative /> }))
        : groups
            .filter((g) => memberOf(users, g.id))
            .map((g) => ({ value: `${GROUP_PREFIX}${g.id}`, label: g.name, meta: `${g.memberCount.toLocaleString()} members`, art: <Face kind="group" name={g.name} size="sm" decorative /> })),
    [held, users, groups, audience],
  )

  /* The type changed: the nearest thing of that kind, at once — the person's first group, or the member a group stood for. */
  const switchTo = (k: Kind) => {
    if (k === held) return
    if (k === 'group') {
      const first = person ? memberGroupIds(person).find((g) => memberOf(users, g)) : undefined
      const any = first ?? groups.find((g) => memberOf(users, g.id))?.id
      if (any) onPick(`${GROUP_PREFIX}${any}`)
      return
    }
    const who = person ?? users[0]
    if (who) onPick(who.id)
  }

  return (
    <div className="sit-ident">
      <div className={`sit-ident__combo${error ? ' is-invalid' : ''}`} role="group" aria-label="Identity">
        <Picker label="Identity type" value={held} options={TYPES} onChange={(v) => switchTo(v as Kind)} />
        {/* The row's id is on the person or group, not the type: the sign-in card and Needs open the row's first button. */}
        <span id={domId} className="sit-ident__pick">
          <Picker
            label={WORD[held].choose}
            width="fill"
            searchable
            value={held === 'group' ? (asGroup ? `${GROUP_PREFIX}${asGroup}` : null) : personId}
            options={options}
            placeholder={WORD[held].choose}
            noun={WORD[held].noun}
            invalid={!!error}
            onChange={onPick}
          />
        </span>
      </div>
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
      {held === 'group' && person && (
        <p className="sit-ident__note">
          Tested as {person.name}
          {memberGroupIds(person).length === 1 && group ? `, who is in ${group.name} alone` : ''}.
        </p>
      )}
    </div>
  )
}
