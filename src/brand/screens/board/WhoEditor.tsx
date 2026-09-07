import { useState } from 'react'
import { Check, UserRound, Users } from 'lucide-react'

import { Button } from '../../kit'
import { useBrand, useNameLookup } from '../../store'
import { conditionType, type Audience, type Predicate, type Rule } from '../../data'
import { cardLetter } from '../../predicate'
import {
  isWho,
  outsideAudience,
  setWho,
  setWhoOperator,
  whoEditable,
  whoIds,
  whoOperator,
  type WhoType,
} from '../../audience-ops'
import { conditionSentence } from '../predicate-prose'
import { Seg } from './Section'
import type { Part } from './model'

/* -----------------------------------------------------------------------------
   WHO — the first thing a rule is about.

   Writing a rule starts with a person: "for contractors, when they are off the
   office network, ask for a second factor." The form used to open on the second
   clause. Groups and people were two attributes among twenty-eight in a
   catalogue, reached the same way as Day of week, so the question everybody
   starts with was the one the form made you go looking for.

   It is its own PANEL now, and the panel is only a VIEW. What it writes is the
   `group` and `user` conditions the rule could always hold — see
   `audience-ops.ts` for why that matters and why `Rule.appliesTo` is not coming
   back. Nothing downstream changes: the linter still subsumes them, the
   simulator still evaluates them, the read-back still says them.

   ONE LIST AT A TIME, BEHIND TWO TABS.

   It was two stacked sections, each with a heading, an operator, a list and a
   count, under three paragraphs of prose explaining what the form was for. All
   of that was true and almost none of it was being read: a form whose first
   screenful is explanation is a form that has decided you will not understand
   it. Groups and people are answered one at a time, so they are a tab each, and
   what is chosen rides above the tabs as avatars — visible whichever list is
   open, which is the thing two stacked sections could never do.

   The two are still edited separately because they answer differently. Groups
   follow whoever is in them on the day; a named person is a person somebody has
   to remember to remove.
   -------------------------------------------------------------------------- */

/* "Any of these" / "None of these" rather than `in` / `not in`.

   That is what the operators MEAN about a list, and this is a list. The raw
   string round-trips untouched, which matters more than it looks: the evaluator
   tests `c.operator.includes('not')` as a substring and nothing validates these
   strings anywhere, so the words are a label and never a value. */
const OP_WORD: Record<string, string> = {
  in: 'Any of these',
  'not in': 'None of these',
  is: 'Any of these',
  'is not': 'None of these',
}

/** How many avatars are drawn before the rest become a count. */
const AVATAR_CAP = 6

export function WhoEditor({
  rule,
  audience,
  onPatch,
  onOpenPart,
}: {
  rule: Rule
  /** The policy's own audience, for the out-of-scope badge. Never written here. */
  audience: Audience
  onPatch: (p: Partial<Rule>) => void
  onOpenPart: (part: Part) => void
}) {
  const store = useBrand()
  const resolve = useNameLookup()
  const write = (next: Predicate) => onPatch({ when: next })

  const [tab, setTab] = useState<WhoType>('group')
  const [q, setQ] = useState('')

  /* The operator the form intends, for while there is no condition to hold it.

     Two traps a visible list makes reachable in one gesture. The exclusion is
     lost on a round trip through empty: `not in [contractors]` → untick the
     last one → the condition is DELETED → `whoOperator` falls back to the
     default `in` → tick a group → you have built a narrowing where an exclusion
     was, and the only visible change was a checkbox. And `setWhoOperator` is a
     no-op when nothing is picked, so above an empty list "None of these" was a
     visibly dead button.

     Answered here rather than in `setWho`, which is pure and stateless by
     design and has nowhere to keep a remembered operator. The model wins
     whenever it has an opinion: this is read only while there is no condition,
     so an undo that restores `not in` shows immediately. */
  const [pending, setPending] = useState<Record<WhoType, string>>({ group: 'in', user: 'is' })

  if (!whoEditable(rule.when)) return <WhoStandDown rule={rule} onOpenPart={onOpenPart} />

  const groupIds = whoIds(rule.when, 'group')
  const userIds = whoIds(rule.when, 'user')
  const opFor = (k: WhoType) => (whoIds(rule.when, k).length > 0 ? whoOperator(rule.when, k) : pending[k])
  const outside = outsideAudience(audience, groupIds, userIds, store.users)
  const ids = tab === 'group' ? groupIds : userIds

  /* Always passing the operator on the tick path: omitting it is only correct
     while the condition already exists, and the first tick is exactly when it
     does not. `new Set` because `whoIds` filters falsy and nothing else — the
     de-duplication is this form's job. */
  const toggle = (kind: WhoType, id: string, on: boolean) => {
    const now = whoIds(rule.when, kind)
    write(setWho(rule.when, kind, on ? [...new Set([...now, id])] : now.filter((x) => x !== id), opFor(kind)))
  }

  const flip = (o: string) => {
    setPending((p) => ({ ...p, [tab]: o }))
    write(setWhoOperator(rule.when, tab, o))
  }

  /* Everything chosen, both kinds, in one row above the tabs — which is the
     whole reason the lists became tabs. Two stacked sections could only ever
     show you the half you were looking at. */
  const chosen = [
    ...groupIds.map((id) => ({ kind: 'group' as WhoType, id, name: resolve('group', id) ?? `deleted · ${id}` })),
    ...userIds.map((id) => ({ kind: 'user' as WhoType, id, name: resolve('user', id) ?? `deleted · ${id}` })),
  ]

  const query = q.trim().toLowerCase()
  const rows =
    tab === 'group'
      ? store.groups.map((g) => ({
          id: g.id,
          name: g.name,
          meta: `${g.memberCount.toLocaleString()} members`,
          empty: g.memberCount === 0,
        }))
      : store.users
          .filter((u) => !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
          .map((u) => ({ id: u.id, name: u.name, meta: u.email, empty: false }))

  return (
    <div className="bb__who">
      {/* What is chosen, as faces. Round, one letter, and the overflow says how
          many more rather than growing the row — the same thing an avatar stack
          does anywhere else, for the same reason. */}
      <WhoChosen chosen={chosen} outside={outside} onRemove={(k, id) => toggle(k, id, false)} />

      <div className="bb__whotabs" role="tablist" aria-label="What this rule is about">
        <button
          role="tab"
          type="button"
          aria-selected={tab === 'group'}
          className={tab === 'group' ? 'is-on' : ''}
          onClick={() => {
            setTab('group')
            setQ('')
          }}
        >
          <Users size={13} strokeWidth={2} aria-hidden />
          Groups
          {groupIds.length > 0 && <b>{groupIds.length}</b>}
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={tab === 'user'}
          className={tab === 'user' ? 'is-on' : ''}
          onClick={() => {
            setTab('user')
            setQ('')
          }}
        >
          <UserRound size={13} strokeWidth={2} aria-hidden />
          People
          {userIds.length > 0 && <b>{userIds.length}</b>}
        </button>

        {/* The operator belongs to the list it governs, so it rides on the tab
            strip and changes meaning with the tab. */}
        <span className="bb__whoop">
          <Seg
            value={opFor(tab)}
            options={conditionType(tab).operators.map((o) => ({ value: o, label: OP_WORD[o] ?? o }))}
            onChange={flip}
            label={tab === 'group' ? 'How the groups are matched' : 'How the people are matched'}
          />
        </span>
      </div>

      {/* People are a directory and groups are a list that ends — so only one
          of them gets a search box. */}
      {tab === 'user' && store.users.length > 0 && (
        <div className="bb__whosearch">
          <input
            type="search"
            value={q}
            placeholder={`Search the ${store.users.length} people listed`}
            aria-label="Search people"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      )}

      <div className="bb__whorows" role="group" aria-label={tab === 'group' ? 'Groups' : 'People'}>
        {rows.length === 0 && <p className="bb__whohint">Nobody listed matches that.</p>}
        {rows.map((r) => {
          const on = ids.includes(r.id)
          const flagged = tab === 'group' ? outside.groups.includes(r.id) : outside.users.includes(r.id)
          return (
            <button
              key={r.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              className={`bb__whoitem ${on ? 'is-on' : ''}`}
              onClick={() => toggle(tab, r.id, !on)}
            >
              <span className="bb__whotick" aria-hidden>
                {on && <Check size={12} strokeWidth={3} />}
              </span>
              <Avatar name={r.name} />
              <b>{r.name}</b>
              <em>{r.meta}</em>
              {/* Both badges inform and neither blocks — no disabled rows,
                  because a redundant or unusual selection is legal and is
                  sometimes deliberate. */}
              {r.empty && (
                <small className="bb__whotag" title="Nobody is in this group today, so a rule that names it decides nothing.">
                  Empty
                </small>
              )}
              {flagged && (
                <small
                  className="bb__whotag is-warn"
                  title="This policy does not govern them, so this rule can never decide one of their sign-ins."
                >
                  Outside
                </small>
              )}
            </button>
          )
        })}
      </div>

      {/* The one line of prose that survived, and only on the tab it is true
          of: `unlistedUsers` is a count with no rows behind it, so the search
          can only ever reach the loaded rows. Saying so is not decoration. */}
      {tab === 'user' && store.unlistedUsers > 0 && (
        <p className="bb__whohint">
          {store.users.length} of {(store.users.length + store.unlistedUsers).toLocaleString()} listed. The rest can be
          reached by the group they are in.
        </p>
      )}
    </div>
  )
}

/* A round mark with one letter.

   Deliberately not initials from two words: half these names are one word, and
   a stack where some marks carry one letter and some two reads as two kinds of
   thing. The tint is derived from the name so the same group is the same colour
   everywhere it appears, without a colour having to be stored on anything. */
function Avatar({ name }: { name: string }) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return (
    <span className="bb__avatar" style={{ background: `hsl(${h} 62% 92%)`, color: `hsl(${h} 58% 32%)` }} aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function WhoChosen({
  chosen,
  outside,
  onRemove,
}: {
  chosen: { kind: WhoType; id: string; name: string }[]
  outside: { groups: string[]; users: string[] }
  onRemove: (kind: WhoType, id: string) => void
}) {
  if (chosen.length === 0) {
    return (
      <div className="bb__whochosen is-empty">
        <span className="bb__avatar is-all" aria-hidden>
          <Users size={13} strokeWidth={2} />
        </span>
        <b>Everyone this policy governs</b>
      </div>
    )
  }

  const shown = chosen.slice(0, AVATAR_CAP)
  const rest = chosen.length - shown.length

  return (
    <div className="bb__whochosen">
      {shown.map((c) => {
        const flagged = c.kind === 'group' ? outside.groups.includes(c.id) : outside.users.includes(c.id)
        return (
          <button
            key={`${c.kind}:${c.id}`}
            type="button"
            className={`bb__whoface ${flagged ? 'is-warn' : ''}`}
            title={`${c.name} — remove`}
            aria-label={`Remove ${c.name}`}
            onClick={() => onRemove(c.kind, c.id)}
          >
            <Avatar name={c.name} />
            <span>{c.name}</span>
          </button>
        )
      })}
      {/* The overflow is a count, not more faces. A row that grows with the
          selection stops being a summary at about seven. */}
      {rest > 0 && (
        <span className="bb__whomore" title={chosen.slice(AVATAR_CAP).map((c) => c.name).join(', ')}>
          +{rest} more
        </span>
      )}
    </div>
  )
}

/* When the rule has more than one way in.

   `setWho` has NO `whoEditable` guard of its own — call it on an OR predicate
   and it writes into the first card, producing a third alternative. The guard
   has always lived in the caller and it stays here, so the claim this makes is
   "the panel guarantees this" rather than "the model guarantees this". */
function WhoStandDown({ rule, onOpenPart }: { rule: Rule; onOpenPart: (part: Part) => void }) {
  const resolve = useNameLookup()
  return (
    <div className="bb__whodown">
      <h4>Who has more than one place to be</h4>
      {/* Said as a consequence rather than as a constraint, and the surprising
          half is the true one: the gesture that looks like narrowing is the one
          that would make the rule broader. */}
      <p>
        This rule has more than one way in, so who it covers belongs to each alternative rather than to the rule.
        Choosing people here would add a third way in.
      </p>

      <ul className="bb__whodown__list">
        {rule.when.cards.map((k, i) => {
          /* `isWho`, not a second copy of the typeId test. Filtered per card
             rather than with `whoConditions`, which flattens across cards and
             would lose the very grouping this read-back exists to show. */
          const who = k.conditions.filter(isWho)
          return (
            <li key={k.id}>
              <span className="bb__whodown__letter" aria-hidden>
                {cardLetter(i)}
              </span>
              <span>{who.length === 0 ? 'nobody named' : who.map((c) => conditionSentence(c, resolve)).join(', ')}</span>
            </li>
          )
        })}
      </ul>

      {/* Lands somewhere true: the Condition list shows the who-conditions
          again exactly when this pane gives up, so the button is not a
          consolation. */}
      <Button size="sm" onClick={() => onOpenPart('when')}>
        Edit these in Condition
      </Button>
    </div>
  )
}
