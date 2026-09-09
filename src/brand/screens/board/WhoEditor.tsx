import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, UserRound, Users } from 'lucide-react'

import { Button, Modal, SearchBox } from '../../kit'
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

/* How many faces the summary draws before the rest become a count.

   Four, and the number is set by the line rather than by taste: four 18px
   avatars, overlapped, plus a count, a label and an Edit is what fits across a
   340px panel without wrapping. The summary exists to stay one line — a fifth
   face would cost the thing it is for. */
const FACES = 4

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
  const [picking, setPicking] = useState(false)

  if (!whoEditable(rule.when)) return <WhoStandDown rule={rule} onOpenPart={onOpenPart} />

  const groupIds = whoIds(rule.when, 'group')
  const userIds = whoIds(rule.when, 'user')
  /* Reads the stored operator and never changes it. Removing the control must
     not silently rewrite a rule that already excludes: an exclusion built in
     the Condition section survives every tick and untick here, and is reported
     below rather than being quietly read as its opposite. */
  const opFor = (k: WhoType) => (whoIds(rule.when, k).length > 0 ? whoOperator(rule.when, k) : AFFIRMATIVE[k])
  const negated = (k: WhoType) => whoIds(rule.when, k).length > 0 && opFor(k).includes('not')
  const outside = outsideAudience(audience, groupIds, userIds, store.users)

  const chosen = [
    ...groupIds.map((id) => ({
      kind: 'group' as WhoType,
      id,
      name: resolve('group', id) ?? `deleted · ${id}`,
      flagged: outside.groups.includes(id),
    })),
    ...userIds.map((id) => ({
      kind: 'user' as WhoType,
      id,
      name: resolve('user', id) ?? `deleted · ${id}`,
      flagged: outside.users.includes(id),
    })),
  ]

  /* Counted rather than listed. Which of the fourteen are outside the policy's
     audience is a question the dialog answers per row; here the useful fact is
     that some are, and how many. */
  const flaggedCount = chosen.filter((c) => c.flagged).length

  return (
    <div className="bb__who">
      {chosen.length === 0 ? (
        /* The empty state says what the rule DOES while empty, not what the
           control is for.

           A rule that names nobody is not broken and is not unfinished — it
           covers everyone the policy governs, which is the commonest shape a
           rule has. Saying "no one selected" would report that legitimate
           default as a gap, and the button beside it is the same offer either
           way. */
        /* ONE LINE: the state, and the way out of it.

           It was a mark, a bold line, a grey line explaining what the control
           was for, and a button under all three — four rows for a section whose
           whole content is "nobody in particular". The explanation is the thing
           that went: "Narrow it to particular groups or people, or leave it as
           it is" is the button re-typed as prose, and it was printed on every
           visit forever to be read once.

           The row now reads as the sentence it is: everyone, unless you choose.
           `Choose people` rather than `Add people`, because nothing is being
           added to a set — it is being narrowed from everyone to some. */
        <div className="bb__whonone">
          <Users size={15} strokeWidth={1.8} aria-hidden />
          <b>Everyone this policy governs</b>
          <button type="button" className="bb__wholink" onClick={() => setPicking(true)}>
            <Plus size={12} strokeWidth={2.4} aria-hidden />
            Choose people
          </button>
        </div>
      ) : (
        /* A CAP, a count, and the way in — on one line.

           Every chosen group and person was drawn as a named chip with its own
           remove button, so a rule naming six groups and eight people filled
           the section with fourteen chips over five rows and pushed the
           conditions off the panel. The section is a summary; five rows of
           chips is not a summary of anything.

           Four faces, then "+10". The faces are there because a face is
           recognisable at a glance where a name has to be read, and four is
           what fits beside a count and an Edit on one line. Everything past
           four is a number, and the number is honest about being one — it does
           not pretend the rest are unimportant, it says how many there are and
           opens the same dialog.

           No per-chip remove. Removing one of fourteen is an editing gesture,
           and editing happens in the dialog where the whole set is visible;
           keeping a delete on each face meant the summary carried the one
           control that could not be undone from where it stood. */
        <button
          type="button"
          className="bb__whosum"
          onClick={() => setPicking(true)}
          title={chosen.map((c) => c.name).join(', ')}
        >
          <span className="bb__whosum__faces" aria-hidden>
            {chosen.slice(0, FACES).map((c) => (
              <Avatar key={`${c.kind}:${c.id}`} name={c.name} on />
            ))}
            {chosen.length > FACES && <i className="bb__whosum__more">+{chosen.length - FACES}</i>}
          </span>
          <span className="bb__whosum__text">
            {chosen.length === 1 ? chosen[0].name : `${chosen.length} groups and people`}
            {flaggedCount > 0 && (
              <em title="This policy does not govern them, so this rule can never decide one of their sign-ins.">
                {flaggedCount} outside
              </em>
            )}
          </span>
          <span className="bb__whosum__edit">
            <Pencil size={12} strokeWidth={2} aria-hidden />
            Edit
          </span>
        </button>
      )}

      {/* An exclusion cannot be BUILT here, but one that already exists must not
          be drawn as its opposite. A rule can arrive holding `not in` — the
          Condition section edits who-conditions directly whenever the rule has
          more than one way in, and deleting an alternative can then hand a
          negated condition back here. */}
      {(negated('group') || negated('user')) && (
        <p className="bb__whohint is-warn">
          These are <b>excluded</b> — the rule covers everyone else. Change that in the conditions below.
        </p>
      )}

      {/* The standalone `Add people` button stood here, under the empty state.
          It is on the empty state's own line now — one row instead of two — and
          once somebody is chosen the summary above IS the button, which it
          always was. */}

      <WhoPicker
        open={picking}
        rule={rule}
        audience={audience}
        onClose={() => setPicking(false)}
        onSave={(when) => {
          onPatch({ when })
          setPicking(false)
        }}
      />
    </div>
  )
}

/* --- Choosing, in a dialog ---------------------------------------------------

   Both lists live here now, and the reason is room rather than tidiness. In the
   panel they were a 340px column of checkboxes that pushed the conditions and
   the outcome below the fold — so the two questions a rule answers after "who"
   were only reachable by scrolling past the answer to the first one. The dialog
   has the width for a list and gives the panel back to the rule.

   It keeps its own draft and commits on Save, which is the one place in this
   panel where that is true. Everything else here writes as it is touched
   because the board has its own save bar over the whole policy; a dialog that
   wrote through would make Cancel a lie.

   The two lists are still separate because they answer differently. Groups
   follow whoever is in them on the day; a named person is a person somebody has
   to remember to remove. */
function WhoPicker({
  open,
  rule,
  audience,
  onClose,
  onSave,
}: {
  open: boolean
  rule: Rule
  audience: Audience
  onClose: () => void
  onSave: (when: Predicate) => void
}) {
  const store = useBrand()
  const [tab, setTab] = useState<WhoType>('group')
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Predicate>(rule.when)

  /* The seed as a STRING, and that is what lets the effect below name
     everything it reads.

     `rule.when` is a fresh object on every render of the panel behind this
     dialog, so depending on it directly would re-seed — discarding the ticks
     somebody had just made — every time anything in the policy moved.
     Depending on `[open]` alone fixes that by lying to the linter about what
     the effect uses. Serialising gives a value that changes only when the
     predicate actually changes, so the dependency list can be honest and the
     effect still runs only when it should. */
  const seed = JSON.stringify(rule.when)

  useEffect(() => {
    if (!open) return
    setDraft(JSON.parse(seed) as Predicate)
    setTab('group')
    setQ('')
  }, [open, seed])

  const groupIds = whoIds(draft, 'group')
  const userIds = whoIds(draft, 'user')
  const opFor = (k: WhoType) => (whoIds(draft, k).length > 0 ? whoOperator(draft, k) : AFFIRMATIVE[k])
  const outside = outsideAudience(audience, groupIds, userIds, store.users)
  const ids = tab === 'group' ? groupIds : userIds

  /* Always passing the operator on the tick path: omitting it is only correct
     while the condition already exists, and the first tick is exactly when it
     does not. `new Set` because `whoIds` filters falsy and nothing else — the
     de-duplication is this form's job. */
  const toggle = (kind: WhoType, id: string, on: boolean) => {
    const now = whoIds(draft, kind)
    setDraft(setWho(draft, kind, on ? [...new Set([...now, id])] : now.filter((x) => x !== id), opFor(kind)))
  }

  /* Every row the list is SHOWING, on or off in one press.

     Scoped to the filtered rows on purpose, and the label says so: with a
     search typed, "Select all 4 matching" selects those four and leaves the
     other fourteen alone. A select-all that quietly reached past the filter
     would be the one control on this dialog that ignores what you just typed.

     A toggle, not a one-way button. Ticking eighteen groups by accident is a
     plausible slip, and the way back from it cannot be eighteen clicks. */
  const allOn = (list: { id: string }[]) => list.length > 0 && list.every((r) => ids.includes(r.id))
  const setMany = (list: { id: string }[], on: boolean) => {
    const now = whoIds(draft, tab)
    const next = on
      ? [...new Set([...now, ...list.map((r) => r.id)])]
      : now.filter((x) => !list.some((r) => r.id === x))
    setDraft(setWho(draft, tab, next, opFor(tab)))
  }

  const query = q.trim().toLowerCase()
  const rows =
    tab === 'group'
      ? store.groups
          .filter((g) => !query || g.name.toLowerCase().includes(query))
          .map((g) => ({
            id: g.id,
            name: g.name,
            meta: `${g.memberCount.toLocaleString()} members`,
            empty: g.memberCount === 0,
          }))
      : store.users
          .filter((u) => !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
          .map((u) => ({ id: u.id, name: u.name, meta: u.email, empty: false }))

  const total = groupIds.length + userIds.length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Who is this rule about?"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={() => onSave(draft)}>
            {total === 0 ? 'Apply to everyone' : `Save ${total} selected`}
          </Button>
        </>
      }
    >
      <div className="bb__whopicker">
        <p className="bb__whopicker__lede">
          Leave this empty and the rule covers everyone the policy governs. Narrowing it here writes ordinary
          conditions, so the rule reads the same way to the linter and the simulator.
        </p>

        {/* A segmented control, not tabs. The dialog has one title; this
            switches a filter within it. */}
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

        {/* Both lists get a search now that both are long enough to want one:
            the dialog shows every group rather than the handful the panel had
            room for. */}
        <SearchBox
          block
          value={q}
          onChange={setQ}
          placeholder={tab === 'group' ? 'Search groups' : `Search the ${store.users.length} people listed`}
          label={tab === 'group' ? 'Search groups' : 'Search people'}
        />

        {/* Select-all, over the list rather than in it.

            Not a row at the top of the scroller: it would scroll away, and a
            checkbox whose job is to tick the other checkboxes reads as one of
            them. Above the box, on the line that says how many are on, it is
            plainly a control ABOUT the list. */}
        {rows.length > 0 && (
          <div className="bb__whoall">
            <button type="button" onClick={() => setMany(rows, !allOn(rows))}>
              {allOn(rows)
                ? `Clear ${rows.length}`
                : query
                  ? `Select all ${rows.length} matching`
                  : `Select all ${rows.length}`}
            </button>
            <span>{ids.length} selected</span>
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
                <span className="bx-tick" aria-hidden>
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
            reached by naming a group.
          </p>
        )}
      </div>
    </Modal>
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

