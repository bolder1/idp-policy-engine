import { useState } from 'react'
import { Check, UserRound, Users } from 'lucide-react'

import { Button } from '../../kit'
import { useBrand, useNameLookup } from '../../store'
import { conditionType, reach, type Audience, type Predicate, type Rule } from '../../data'
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

   The two are edited separately because they answer differently. Groups follow
   whoever is in them on the day; a named person is a person somebody has to
   remember to remove. A rule can use either, both, or neither.

   IT IS A FORM NOW, NOT TWO PILLS.

   Two `ConditionPopover` pills were the right size for a third of a shared
   column and the wrong shape for the question: choosing who a rule is about
   meant opening a floating layer, reading a list you could not see beside the
   rest of the form, and closing it again — twice, once per kind. Given a panel
   of its own the lists are simply on screen, which is what makes "who does this
   cover" answerable at a glance rather than by opening two menus.

   The `nonce` remount went with the popover it existed for. Removing the last
   id DELETES the condition, and the popover's open state was keyed to a
   condition that no longer existed — a floating-layer problem. The checkboxes
   here derive from `whoIds` on every render, an empty list is just an empty
   list, and remounting would blow away the search box mid-type.
   -------------------------------------------------------------------------- */

/* "Any of these" / "None of these" rather than `in` / `not in`.

   That is what the operators MEAN about a list, and this is a list. The raw
   string round-trips untouched, which matters more than it looks: the
   evaluator tests `c.operator.includes('not')` as a substring and nothing
   validates these strings anywhere, so the words are a label and never a
   value. */
const OP_WORD: Record<string, string> = {
  in: 'Any of these',
  'not in': 'None of these',
  is: 'Any of these',
  'is not': 'None of these',
}

export function WhoEditor({
  rule,
  audience,
  onPatch,
  onOpenPart,
}: {
  rule: Rule
  /** The policy's own audience, for the ceiling line. Never written here. */
  audience: Audience
  onPatch: (p: Partial<Rule>) => void
  onOpenPart: (part: Part) => void
}) {
  const store = useBrand()
  const resolve = useNameLookup()
  const write = (next: Predicate) => onPatch({ when: next })

  /* The operator the form intends, for while there is no condition to hold it.

     Two traps the pills hid and a visible list makes reachable in one gesture.

     The exclusion is lost on a round trip through empty: `not in [contractors]`
     → untick the last one → the condition is DELETED → `whoOperator` falls back
     to the default `in` → tick a group → you have built a narrowing where an
     exclusion was, and the only visible change was a checkbox.

     And `setWhoOperator` is a no-op when nothing is picked, so above an empty
     list "None of these" was a visibly dead button.

     Both are answered here rather than in `setWho`, which is pure and stateless
     by design and has nowhere to keep a remembered operator. The model wins
     whenever it has an opinion: this is read only while there is no condition,
     so an undo that restores `not in` shows immediately instead of being
     overwritten by a stale segment. */
  const [pending, setPending] = useState<Record<WhoType, string>>({ group: 'in', user: 'is' })
  const [q, setQ] = useState('')

  if (!whoEditable(rule.when)) return <WhoStandDown rule={rule} onOpenPart={onOpenPart} />

  const groupIds = whoIds(rule.when, 'group')
  const userIds = whoIds(rule.when, 'user')
  const opFor = (k: WhoType) => (whoIds(rule.when, k).length > 0 ? whoOperator(rule.when, k) : pending[k])
  const outside = outsideAudience(audience, groupIds, userIds, store.users)

  const OPS: Record<WhoType, string[]> = {
    group: conditionType('group').operators,
    user: conditionType('user').operators,
  }

  /* Always passing the operator on the tick path: omitting it is only correct
     while the condition already exists, and the first tick is exactly when it
     does not. `new Set` because `whoIds` filters falsy and nothing else — the
     de-duplication is this form's job. */
  const toggleGroup = (id: string, on: boolean) =>
    write(setWho(rule.when, 'group', on ? [...new Set([...groupIds, id])] : groupIds.filter((x) => x !== id), opFor('group')))

  const togglePerson = (id: string, on: boolean) =>
    write(setWho(rule.when, 'user', on ? [...new Set([...userIds, id])] : userIds.filter((x) => x !== id), opFor('user')))

  const flip = (k: WhoType, o: string) => {
    setPending((p) => ({ ...p, [k]: o }))
    write(setWhoOperator(rule.when, k, o))
  }

  const chosenPeople = userIds.map((id) => ({ id, user: store.users.find((u) => u.id === id) }))
  const query = q.trim().toLowerCase()
  const results = query
    ? store.users.filter(
        (u) => !userIds.includes(u.id) && (u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)),
      )
    : []
  const nothing = groupIds.length === 0 && userIds.length === 0

  return (
    <div className="bb__who">
      {/* Said first, because it is the thing most likely to be assumed wrong.
          A form that looks like the policy's audience picker, inside a rule,
          has to say which of the two it is before anything else. */}
      <p className="bb__whonote">This rule only — the policy's audience and every other rule are untouched.</p>
      <p className="bb__whoceil">
        This policy governs about {reach(audience, store.groups, store.users).toLocaleString()} people. Narrowing here
        changes which sign-ins this rule decides — everyone else it lets past falls through to the rules below.
      </p>

      {/* --- Groups: exhaustive, no search, and it ENDS ---------------------
          That is the whole difference between a group picker and a people
          picker, and they must not be drawn as one control. There is no "all
          groups" row and there must not be: a synthetic one beside Finance let
          a picker build "All AND Finance", which reads narrower than it is. */}
      <section className="bb__wholist">
        <header className="bb__wholist__head">
          <h4>
            <Users size={13} strokeWidth={2} aria-hidden /> Groups
          </h4>
          <Seg
            value={opFor('group')}
            options={OPS.group.map((o) => ({ value: o, label: OP_WORD[o] ?? o }))}
            onChange={(o) => flip('group', o)}
            label="How the groups are matched"
          />
          {groupIds.length > 0 && (
            <span className="bb__whocount">
              {groupIds.length} of {store.groups.length} chosen
            </span>
          )}
        </header>

        <div className="bb__whorows" role="group" aria-label="Groups this rule is about">
          {store.groups.map((g) => {
            const on = groupIds.includes(g.id)
            return (
              <button
                key={g.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`bb__whoitem ${on ? 'is-on' : ''}`}
                onClick={() => toggleGroup(g.id, !on)}
              >
                <span className="bb__whotick" aria-hidden>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
                <b>{g.name}</b>
                <em>{g.memberCount.toLocaleString()} members</em>
                {/* Both badges inform, never block. No disabled rows and no
                    auto-untick: a redundant or unusual selection is legal and
                    is sometimes deliberate. */}
                {g.memberCount === 0 && (
                  <small className="bb__whotag" title="Nobody is in this group today, so a rule that names it decides nothing.">
                    Empty
                  </small>
                )}
                {outside.groups.includes(g.id) && (
                  <small
                    className="bb__whotag is-warn"
                    title="This policy does not govern this group, so this rule can never decide a sign-in from it."
                  >
                    Outside this policy
                  </small>
                )}
              </button>
            )
          })}
        </div>

        {groupIds.length === 0 && opFor('group') === 'not in' && (
          <p className="bb__whohint">None of these — choose the groups to exclude.</p>
        )}
      </section>

      {/* --- People: chosen first, then search, then an honest count -------- */}
      <section className="bb__wholist">
        <header className="bb__wholist__head">
          <h4>
            <UserRound size={13} strokeWidth={2} aria-hidden /> People
          </h4>
          <Seg
            value={opFor('user')}
            options={OPS.user.map((o) => ({ value: o, label: OP_WORD[o] ?? o }))}
            onChange={(o) => flip('user', o)}
            label="How the people are matched"
          />
          {userIds.length > 0 && <span className="bb__whocount">{userIds.length} chosen</span>}
        </header>

        <div className="bb__whorows" role="group" aria-label="People this rule is about">
          {/* Rendered unconditionally — even off-query, even when the id no
              longer resolves. What you have picked must never be hidden by a
              filter; that is how somebody removes a person by accident. */}
          {chosenPeople.map(({ id, user }) => {
            const inGroup = user && groupIds.includes(user.groupId) ? resolve('group', user.groupId) : null
            return (
              <button
                key={id}
                type="button"
                role="checkbox"
                aria-checked
                className="bb__whoitem is-on"
                onClick={() => togglePerson(id, false)}
              >
                <span className="bb__whotick" aria-hidden>
                  <Check size={12} strokeWidth={3} />
                </span>
                {/* The informative fallback the rest of the condition surface
                    already uses, rather than printing a bare slug. */}
                <b>{user?.name ?? `deleted · ${id}`}</b>
                {user && <em>{user.email}</em>}
                {inGroup && (
                  <small
                    className="bb__whotag"
                    title="Already covered by a group you chose. Kept, because a named person survives somebody editing the group."
                  >
                    In {inGroup}
                  </small>
                )}
              </button>
            )
          })}

          {store.users.length > 0 && (
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

          {/* Results only once something is typed. With no query this renders
              nothing at all, rather than a scrolling directory with a filter
              bolted on top of it. */}
          {query && results.length === 0 && <p className="bb__whohint">Nobody listed matches that.</p>}
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              role="checkbox"
              aria-checked={false}
              className="bb__whoitem"
              onClick={() => togglePerson(u.id, true)}
            >
              <span className="bb__whotick" aria-hidden />
              <b>{u.name}</b>
              <em>{u.email}</em>
            </button>
          ))}
        </div>

        {/* The fiction, recorded rather than hidden: `unlistedUsers` is a count
            with no rows behind it, so the search can only ever reach the loaded
            rows. The placeholder says "the people listed" and this says where
            the rest are — a knowing prototype limit, not a design. A
            neighbouring screen says "Search to find someone", which promises a
            directory search it cannot perform. */}
        <p className="bb__whohint">
          {store.users.length === 0
            ? 'No one in the directory yet. Choose a group instead.'
            : `${store.users.length} of ${(store.users.length + store.unlistedUsers).toLocaleString()} people are listed here. The rest can be named on the group they are in.`}
        </p>

        {userIds.length === 0 && opFor('user') === 'is not' && (
          <p className="bb__whohint">None of these — choose the people to exclude.</p>
        )}
      </section>

      {nothing ? (
        <p className="bb__whonote">Everyone this policy governs. Narrow it by choosing groups or people.</p>
      ) : (
        <div className="bb__whofoot">
          <p>
            Only these people reach this rule. Everyone else the policy governs falls through to the rules below.
          </p>
          {/* Composed, never two `onPatch` calls in one handler — both would
              read the pre-patch predicate and the second would win, dropping
              the first. */}
          <Button
            size="sm"
            onClick={() => write(setWho(setWho(rule.when, 'group', []), 'user', []))}
            title="Clear every group and person on this rule"
          >
            Clear all
          </Button>
        </div>
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
        Choosing people here would add a third way in — the rule would fire for them whatever the circumstances.
      </p>

      {/* What is actually there, read-only, per alternative. The difference
          between an explanation and an assertion. */}
      <p className="bb__whodown__lead">Today, in the alternatives:</p>
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
