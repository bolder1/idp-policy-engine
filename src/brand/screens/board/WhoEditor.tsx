import { useState } from 'react'
import { Check, UserRound, Users, X } from 'lucide-react'

import { Button } from '../../kit'
import { useBrand, useNameLookup } from '../../store'
import type { Audience, Predicate, Rule } from '../../data'
import { cardLetter } from '../../predicate'
import {
  isWho,
  outsideAudience,
  setWho,
  whoEditable,
  whoIds,
  whoOperator,
  type WhoType,
} from '../../audience-ops'
import { conditionSentence } from '../predicate-prose'
import { Avatar } from './Avatar'
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

/* What a fresh who-condition is written with.

   The pane used to carry an "Any of these / None of these" segment per tab and
   it is gone. Ticking a name in a list called "Who" means the rule is about
   them; the segment offered the opposite reading of the same ticks, one click
   away, with nothing in the list itself changing to show which of the two was
   in force. Two readings of one set of checkboxes is not a setting, it is a
   trap.

   An exclusion is still expressible — it is an ordinary condition, and the
   Condition pane edits it as one. What this pane will no longer do is offer to
   invert the meaning of its own list. */
const AFFIRMATIVE: Record<WhoType, string> = { group: 'in', user: 'is' }

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


  if (!whoEditable(rule.when)) return <WhoStandDown rule={rule} onOpenPart={onOpenPart} />

  const groupIds = whoIds(rule.when, 'group')
  const userIds = whoIds(rule.when, 'user')
  /* Reads the stored operator and never changes it. Removing the control must
     not silently rewrite a rule that already excludes: an exclusion built in
     the Condition pane survives every tick and untick here, and is reported
     below rather than being quietly read as its opposite. */
  const opFor = (k: WhoType) => (whoIds(rule.when, k).length > 0 ? whoOperator(rule.when, k) : AFFIRMATIVE[k])
  const negated = (k: WhoType) => whoIds(rule.when, k).length > 0 && opFor(k).includes('not')
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
      {/* A SEGMENTED control, not a second row of tabs.

          It was an underlined tab strip sitting directly beneath the panel's
          own underlined tab strip — two identical switchers, back to back,
          asking two unrelated questions. Nothing said which one moved you
          between forms and which one moved you inside this one.

          One of them had to stop looking like tabs, and it is this one: the
          panel's strip changes the SUBJECT and this changes a filter within it,
          which is what a segmented control means everywhere else in this kit. */}
      <div className="bb__whopick" role="radiogroup" aria-label="What this rule is about">
        {(['group', 'user'] as WhoType[]).map((k) => {
          const on = tab === k
          const n = k === 'group' ? groupIds.length : userIds.length
          const Ico = k === 'group' ? Users : UserRound
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              className={on ? 'is-on' : ''}
              onClick={() => {
                setTab(k)
                setQ('')
              }}
            >
              <Ico size={13} strokeWidth={2} aria-hidden />
              {k === 'group' ? 'Groups' : 'People'}
              {n > 0 && <b>{n}</b>}
            </button>
          )
        })}
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

      {/* An exclusion cannot be BUILT here any more, but one that already
          exists must not be drawn as its opposite. A rule can arrive holding
          `not in` — the Condition pane edits who-conditions directly whenever
          the rule has more than one way in, and deleting an alternative can
          then hand a negated condition back to this pane. */}
      {negated(tab) && (
        <p className="bb__whohint is-warn">
          These are <b>excluded</b> — the rule covers everyone else. Change that in Condition.
        </p>
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
              <Avatar name={r.name} on={on} />
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
          can only ever reach the loaded rows. */}
      {tab === 'user' && store.unlistedUsers > 0 && (
        <p className="bb__whohint">
          {store.users.length} of {(store.users.length + store.unlistedUsers).toLocaleString()} listed. The rest can be
          reached by the group they are in.
        </p>
      )}

      {/* What is chosen, UNDER the lists rather than above them.

          It sat at the top, between two switchers, where it was a third thing
          in a stack of controls before you had reached the one you came for.
          Below, it is what it actually is: the answer the lists have been
          building, both kinds together, so the total is visible whichever
          filter is showing. */}
      <WhoChosen chosen={chosen} outside={outside} onRemove={(k, id) => toggle(k, id, false)} />
    </div>
  )
}

/* The chosen, as faces. Round, one letter, and the overflow says how many
   more rather than growing the row. */
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
            <Avatar name={c.name} on />
            <span>{c.name}</span>
            {/* Outside the policy's audience, in a word.

                This was an amber border and nothing else — no glyph, no text —
                so the fact lived in a hue and in a `title` that a touch screen
                and a screen reader never see. The chip says it. */}
            {flagged && <em className="bb__whoface__flag">outside</em>}
            {/* What pressing it does, drawn rather than coloured.

                The whole chip is the remove target, and the only thing that
                said so was the red it turned under the pointer. A cross that
                appears on hover and focus says the same thing, in the shape
                this console already uses for it, and says it to a keyboard. */}
            <X className="bb__whoface__x" size={11} strokeWidth={2.4} aria-hidden />
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
