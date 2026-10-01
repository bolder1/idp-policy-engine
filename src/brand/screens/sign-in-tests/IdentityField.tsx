import { useState, type ReactNode } from 'react'
import { Check, Pencil, Plus, UserRound, Users } from 'lucide-react'

import { memberGroupIds, type Audience, type Group, type User } from '../../data'
import { NoMatches } from '../../empty'
import { Face } from '../../faces'
import { Badge, Button, IconButton, Modal, SearchBox } from '../../kit'
import { Picker } from '../../picker'
import { GROUP_PREFIX, groupNamesOf, memberOf, personPickerOptions } from './sign-in-card'

/* -----------------------------------------------------------------------------
   Who signs in, in Entra's What If shape (owner, 1 Oct 2026: "for the
   configuration I want an Entra-style thing: first an option to select the
   identity, with the identity type; and the list of users and groups as we
   have it in policy creation"):

     Identity type   [User ▾]
     User            [👤 PS Priya Sharma                   ✎ ]
                     Member of [Engineering] [Design]
                     In 2 groups: the outcome shows what each group gets.
   or
     Identity type   [Group ▾]
     Group           [👥 Design                             ✎ ]
                     Tested as Riya Shah, who is in Design alone.

   The identity type is User or Group. The row under it is the policy
   builder's Who row (WhoEditor.tsx, `.bb__whorow`): its kind's mark, what
   is chosen — its name is the label over it — and its pencil — or, nothing chosen yet, "None
   selected yet" and its +. Either opens the builder's Who dialog, for one
   choice: the search, the faces, the names, what each is — a person's every
   group, a group's members — the chosen one ticked, and a press that chooses
   and closes. Inside a policy the people come in its two lists, In this
   policy first (sign-in-card.ts `personPickerOptions`).

   Changing the identity type opens the dialog for the other kind at once;
   closed without a choice, the type is what it was — the row never says a
   kind it holds nothing of.

   One person in more than one group is the case the owner asked to see
   (Tanmay, in Engineering and Design, a policy each): the row says every
   group, and that the outcome shows what each one gets. A group stands for
   one of its members — someone in that group alone (`memberOf`) — and the
   row says who.
   -------------------------------------------------------------------------- */

type Kind = 'user' | 'group'

const TYPES = [
  { value: 'user', label: 'User' },
  { value: 'group', label: 'Group' },
]

const WORD: Record<Kind, { one: string; choose: string; search: string; noun: string }> = {
  user: { one: 'User', choose: 'Choose a user', search: 'Search people', noun: 'people' },
  group: { one: 'Group', choose: 'Choose a group', search: 'Search groups', noun: 'groups' },
}

export function IdentityField({
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
  /** The row's id, the one a "Needs" link and the canvas's Check access focus. */
  domId: string
  /** What stops a run, under the row. */
  error?: ReactNode
  /** A person's id, or `group:<id>`. */
  onPick: (value: string) => void
}) {
  const held: Kind = asGroup ? 'group' : 'user'
  /* The dialog, and which kind it lists; the type shows it while it is open. */
  const [picking, setPicking] = useState<Kind | null>(null)
  const kind = picking ?? held

  const person = personId ? (users.find((u) => u.id === personId) ?? null) : null
  const group = asGroup ? (groups.find((g) => g.id === asGroup) ?? null) : null
  const chosen = held === 'group' ? group?.name : person?.name
  const theirGroups = person && held === 'user' ? groupNamesOf(person, groups) : []

  return (
    <div className="sit-ident">
      <span className="sit-ident__label">Identity type</span>
      <Picker label="Identity type" width="fill" value={kind} options={TYPES} onChange={(v) => setPicking(v as Kind)} />

      <span className="sit-ident__label">{WORD[held].one}</span>
      <div id={domId} className={`bb__whorow ${chosen ? 'is-set' : 'is-empty'}${error ? ' is-invalid' : ''}`}>
        {/* The kind's mark until something is chosen; then the face says it. */}
        {!chosen && (
          <span className="bb__whorow__ico" aria-hidden>
            {held === 'group' ? <Users size={14} strokeWidth={1.9} /> : <UserRound size={14} strokeWidth={1.9} />}
          </span>
        )}
        <span className="bb__whorow__val sit-ident__val">
          {chosen ? (
            <>
              <Face kind={held} name={chosen} size="sm" decorative />
              <span className="sit-ident__name">{chosen}</span>
            </>
          ) : (
            'None selected yet'
          )}
        </span>
        <span className="bb__whorow__acts">
          <IconButton size="sm" tone="ghost" icon={chosen ? Pencil : Plus} label={chosen ? `Change the ${WORD[held].one.toLowerCase()}` : WORD[held].choose} onClick={() => setPicking(held)} />
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

      <IdentityDialog
        kind={kind}
        open={picking !== null}
        users={users}
        groups={groups}
        audience={audience}
        chosen={kind === 'group' ? asGroup : held === 'user' ? personId : null}
        onClose={() => setPicking(null)}
        onPick={(value) => {
          setPicking(null)
          onPick(value)
        }}
      />
    </div>
  )
}

/* The builder's Who dialog (WhoEditor.tsx `WhoDialog`), for one choice: a
   search over the list, each row its face, its name and what it is, the one
   chosen ticked. A press chooses and closes; Cancel and Escape leave it as it
   was. Inside a policy the people are listed under In this policy and Not in
   this policy. Groups with nobody listed in them are left out — there is no
   one to test as. */
function IdentityDialog({
  kind,
  open,
  users,
  groups,
  audience,
  chosen,
  onClose,
  onPick,
}: {
  kind: Kind
  open: boolean
  users: readonly User[]
  groups: readonly Group[]
  audience: Audience | null
  chosen: string | null
  onClose: () => void
  onPick: (value: string) => void
}) {
  const [q, setQ] = useState('')
  const [was, setWas] = useState(open)
  if (was !== open) {
    setWas(open)
    if (open) setQ('')
  }
  const query = q.trim().toLowerCase()
  const options = personPickerOptions(users, groups, audience)
  const rows =
    kind === 'user'
      ? options
          .filter((o) => !o.value.startsWith(GROUP_PREFIX))
          .map((o) => ({ id: o.value, value: o.value, name: o.label, meta: o.meta ?? '', heading: audience ? o.group : undefined, hay: `${o.label} ${o.meta ?? ''} ${users.find((u) => u.id === o.value)?.email ?? ''}` }))
      : groups
          .filter((g) => memberOf(users, g.id))
          .map((g) => ({ id: g.id, value: `${GROUP_PREFIX}${g.id}`, name: g.name, meta: `${g.memberCount.toLocaleString()} members`, heading: undefined, hay: g.name }))
  const shown = rows.filter((r) => !query || r.hay.toLowerCase().includes(query))
  const word = WORD[kind]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={word.choose}
      width={560}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="bb__whopick">
        <SearchBox block value={q} onChange={setQ} placeholder={word.search} label={word.search} />
        <div className="bb__wholist sit-ident__list" role="radiogroup" aria-label={word.choose}>
          {shown.length === 0 && <NoMatches compact noun={word.noun} query={q} onClear={() => setQ('')} />}
          {shown.map((r, i) => {
            const on = r.id === chosen
            const head = r.heading && r.heading !== shown[i - 1]?.heading ? r.heading : null
            return (
              <div key={r.id} className="sit-ident__item">
                {head && <p className="sit-ident__head">{head}</p>}
                <button type="button" role="radio" aria-checked={on} className={`bb__whoitem${on ? ' is-on' : ''}`} onClick={() => onPick(r.value)}>
                  <span className="bx-tick" aria-hidden>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <Face kind={kind} name={r.name} decorative />
                  <b>{r.name}</b>
                  <em>{r.meta}</em>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
