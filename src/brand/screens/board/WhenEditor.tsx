import { useEffect, useState } from 'react'
import { Braces, ChevronDown, Fingerprint, Globe, Plus, Split, Ungroup, UserRound, Users, Webhook, X } from 'lucide-react'

import { modeLabel } from '../../fingerprint'
import { cardJoin, cardLetter, ckey, drawsAsBracket, duplicatedAcrossCards, outerJoin } from '../../predicate'
import {
  conditionType,
  type Condition,
  type ConditionCard,
  type ConditionType,
  type Joiner,
  type Predicate,
  type Rule,
  type ZoneScope,
} from '../../data'
import * as ops from '../../when-ops'
import { isWho, whoEditable } from '../../audience-ops'
import { useBrand, useNameLookup } from '../../store'
import { ConditionPicker } from '../rule-form'
import { ConditionPopover, summarise, zoneShape, type ValueOption } from '../ConditionPopover'

/* -----------------------------------------------------------------------------
   WHEN — the conditional, editable.

   A rule is ONE bracket: `A · B · C · (group) · D`. Every plain condition is a
   member of it, every group is a member of it, and one and/or governs the lot.
   A group is a bracket of its own nested inside, and the operator in there is
   its own — which is the only place a second operator exists on this pane.

   That is the whole grammar, and it took four goes to arrive at. The joiner has
   been a word you could not press, a full-width divider, a pill at the head of
   every alternative, and a chip on the seam between two cards; the last of
   those was removed outright, which left `Predicate.join` with no control at
   all and two runs of conditions stacked with nothing between them. The model
   was never the problem — two levels of joining is exactly what it carries.
   What was wrong is that it divided them by CARD, and a person does not think
   in cards: they think in one list with a bracket in the middle of it.

   So `outerJoin` and `setOuterJoin` read and write the two fields as one
   operator, the members are laid out flat regardless of which card holds them,
   and every structural edit re-establishes the lockstep. See `predicate.ts` for
   why that costs no model change and no migration.

   Adding a condition opens the same catalogue dialog the trail uses, so the
   two builders cannot disagree about what the attributes are or how they are
   found.
   -------------------------------------------------------------------------- */

export function WhenEditor({
  rule,
  onPatch,
  openAt,
}: {
  rule: Rule
  onPatch: (p: Partial<Rule>) => void
  /* The section header's `+`, anchored. One group adds into it; several add
     a new one — the buttons inside the block are the explicit route. */
  openAt?: { nonce: number } | null
}) {
  const store = useBrand()
  const resolve = useNameLookup()
  const cards = rule.when.cards
  /* `'loose'` adds a condition at the top level, `'group'` starts a new group,
     and an id adds into that card. Three destinations, because there are three
     things a person can mean by "add". */
  const [adding, setAdding] = useState<{ cardId: string | 'loose' | 'group' } | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)

  useEffect(() => {
    if (!openAt) return
    setAdding({ cardId: 'loose' })
    // Keyed on the nonce, not the rect: the same button pressed twice opens twice.
  }, [openAt?.nonce])

  /* Every edit goes through `when-ops`, which is the only writer.

     These operations used to live here, inline, and a near-identical set lived
     in the trail's form — which is how the two drifted into costing data: the
     trail dropped `when.join` on every edit and deleted groups an author had
     deliberately made, while this copy did neither. One writer, seventeen tests
     pinning it, and both surfaces call it.

     It also fixes something this copy still had. `flipTopJoin` wrote
     `{ ...rule.when, join: ... }`, so returning a joiner to its default
     MATERIALISED the field rather than removing it — and every dirty check in
     this app is a `JSON.stringify` comparison, so flipping a joiner there and
     back left the save bar lit on a rule that meant exactly what it did before.
     `when-ops` deletes at the default instead, and a test asserts the round
     trip. */
  const write = (next: Predicate) => onPatch({ when: next })

  const flipCardJoin = (id: string) => write(ops.flipBranchJoin(rule.when, id))

  /* THE operator. One rule, one bracket, one and/or over everything in it.

     `outerJoin` reads it off whichever field is carrying it — a lone run holds
     it on the card, a rule with groups holds it on the trunk — and
     `setOuterJoin` writes both at once so the two can never say different
     things. Every structural edit below goes back through it, which is what
     keeps `A ∧ B` from silently acquiring an OR the moment somebody adds a
     group beside it: the operator that was on screen before the edit is the
     operator on screen after it.

     `flipTrunkJoin` still has no caller, and neither does `mergeBranches` now.
     Both stay in `when-ops` with their tests for the reason the first one
     already did: the FIELDS are live — `topJoin` is read by the evaluator, the
     prose read-back and the card — and what has gone is a way to author them
     from here, not a way to hold them. */
  const outer = outerJoin(rule.when)
  const flipOuter = () => write(ops.flipOuterJoin(rule.when))
  /* Every edit that changes the SHAPE lands through here, so the lockstep is
     re-established on each one rather than only where somebody remembered. */
  const restructure = (next: Predicate) => write(ops.setOuterJoin(next, outer))

  /* Still three destinations, because there are still three things a person can
     mean by "add": into this group, into the run at the end, or into a group of
     its own. */
  const add = (typeId: string) => {
    if (!adding) return
    const t = conditionType(typeId)
    const c = ops.freshCondition(typeId, t.operators[0])

    if (adding.cardId === 'group') {
      /* A group starts empty of everything that came before it. Adding one used
         to leave the existing conditions where they were and draw a frame round
         them too, so making a NEW group visually swallowed the old ones. */
      const next = ops.addCondition(rule.when, 'new', c)
      restructure(ops.setGrouped(next, next.cards[next.cards.length - 1].id, true))
    } else if (adding.cardId === 'loose') {
      /* Join the last card when it is loose, and start a new run when it is a
         group — so a condition added from the button below a group lands after
         it rather than jumping to the top. Either way it is a member of the
         same bracket: two loose runs on the same predicate carry the same
         joiner, which is what makes them read as one flat list with a group
         sitting in the middle of it. */
      const last = cards[cards.length - 1]
      restructure(last && !last.grouped ? ops.addCondition(rule.when, last.id, c) : ops.addCondition(rule.when, 'new', c))
    } else {
      restructure(ops.addCondition(rule.when, adding.cardId, c))
    }

    setAdding(null)
    setFresh(c.id)
  }

  const removeCondition = (conditionId: string) => write(ops.removeCondition(rule.when, conditionId))
  const patchCondition = (conditionId: string, next: Partial<Condition>) => write(ops.patchCondition(rule.when, conditionId, next))
  /* "Move into a group of its own" now makes a GROUP.

     `splitOut` copies `grouped` from the card it came out of, which was right
     when a bare second card drew as a second alternative — and is wrong now
     that a bare card's conditions are members of the one bracket. Splitting a
     loose condition used to move it to the end of the list and change nothing
     else, so the button did visibly nothing. */
  const splitOut = (conditionId: string) => {
    const next = ops.splitOut(rule.when, conditionId)
    if (next === rule.when) return
    restructure(ops.setGrouped(next, next.cards[next.cards.length - 1].id, true))
  }
  /* The inverse of "Add group", and it replaces "Merge up".

     "Merge up" folded a group into whatever card happened to precede it, which
     was a group on some rules and the loose run on others — one button with two
     outcomes, neither of them named by its label. Dissolving the bracket is the
     thing people actually want back, it is the exact undo of the button that
     made it, and it means one thing wherever it is pressed. The conditions stay
     where they are in reading order and join the bracket around them. */
  const ungroup = (id: string) => restructure(ops.setGrouped(rule.when, id, false))
  const removeGroup = (id: string) => restructure(ops.removeBranch(rule.when, id))
  const addGroup = () => restructure(ops.addBranch(rule.when))

  const dupes = duplicatedAcrossCards(rule.when)
  const openCatalogue = (cardId: string | 'new') => () => setAdding({ cardId })

  /* Drawn the way the model is read, not the way it is stored.

     The bracket's members are laid out in one flat list: a plain condition is a
     member, and a whole group is ONE member however much is inside it. Which
     card a plain condition happens to live in does not survive into the
     drawing, because it is not a fact about the rule — `A ∧ B ∧ (group) ∧ C`
     stores C in a second card only because a group sits between them.

     The who-conditions are filtered out wherever the Who pane owns them, so a
     card can contribute no members at all and simply not appear. */
  const shownIn = (k: ConditionCard) => (whoEditable(rule.when) ? k.conditions.filter((c) => !isWho(c)) : k.conditions)

  type Member =
    | { kind: 'cond'; key: string; c: Condition; card: ConditionCard }
    | { kind: 'group'; key: string; card: ConditionCard; index: number }

  const members: Member[] = []
  cards.forEach((k, i) => {
    if (drawsAsBracket(rule.when, k)) members.push({ kind: 'group', key: k.id, card: k, index: i })
    else shownIn(k).forEach((c) => members.push({ kind: 'cond', key: c.id, c, card: k }))
  })

  /* Counted in members, not conditions. A group somebody just made holds
     nothing yet and is still the thing on the screen, so the empty state must
     not take the pane back off them. */
  const empty = members.length === 0


  return (
    <div>
      <div className="bb__if is-editable">
        {empty ? (
          /* A proper empty state, and it fires on NO CONDITIONS rather than on
             no cards.

             `cards.length === 0` was the old test, and it is not the state you
             land in: removing the last condition leaves the card behind, so
             the pane rendered an empty grey box with two dashed buttons
             floating in it and no sentence at all. A rule with nothing to check
             is a rule that catches everything reaching it, which is the fact
             worth saying — and it is the reason somebody is on this pane. */
          <div className="bb__ifblank">
            <span className="bb__ifblank__mark" aria-hidden>
              <Split size={18} strokeWidth={1.8} />
            </span>
            <h4>No conditions yet</h4>
            <p>Every sign-in that reaches this rule matches it. Add a condition to narrow that.</p>
            <div className="bb__ifblank__acts">
              <button type="button" className="bb__ifadd" onClick={openCatalogue('loose')}>
                <Plus size={11} strokeWidth={2.4} aria-hidden />
                Add condition
              </button>
              <button type="button" className="bb__ifaddgroup" onClick={addGroup}>
                <Plus size={11} strokeWidth={2.4} aria-hidden />
                Add group
              </button>
            </div>
          </div>
        ) : (
          /* ONE bracket, drawn as one.

             This used to be a list of cards, each drawn as its own block, with
             a dashed accent rule on every seam. That is the model's shape, not
             the rule's: a person writing `IP network, then two more conditions,
             then a group, then one more` means one bracket with four members in
             it, and the fourth is a bracket of its own. Drawn as cards it came
             out as three separate blocks with no operator between them, and the
             group read as an ALTERNATIVE to the conditions above it rather than
             as another thing that has to hold alongside them.

             So the frame is the bracket, everything in it is a member, and the
             one operator governing them sits in the joiner column at the first
             gap with a rail running down the rest — the same drawing the run
             inside a group gets, one level in. */
          <div className="bb__ifbracket" role="group" aria-label={`All of this rule's conditions, joined by ${outer.toUpperCase()}`}>
            {members.map((m, i) =>
              m.kind === 'cond' ? (
                <ConditionRow
                  key={m.key}
                  c={m.c}
                  join={outer}
                  /* ONE joiner for the bracket, drawn at the first gap, with a
                     rail down the rest.

                     The bracket holds a single operator — pressing it changes
                     how every member joins — but drawing a pill in every gap
                     presented one setting as four controls, and nothing said
                     they moved together until you pressed one and watched the
                     others change. */
                  showJoin={i === 1}
                  railed={i > 1}
                  /* `if` opens the sentence once, on the very first member. */
                  lead={i === 0}
                  scope="rule"
                  fresh={fresh === m.c.id}
                  /* `duplicatedAcrossCards` returns ckeys, not ids. Asking it
                     about `c.id` compared two string spaces that never meet, so
                     the ·2 badge and its tooltip were unreachable. */
                  dupe={dupes.includes(ckey(m.c))}
                  store={store}
                  resolve={resolve}
                  onChange={(nextC) => patchCondition(m.c.id, nextC)}
                  onRetype={(typeId) => write(ops.retypeCondition(rule.when, m.c.id, typeId, conditionType(typeId).operators[0]))}
                  /* Through `when-ops` like every other edit, because "both"
                     has to DELETE the field rather than store the word — a
                     patch merges and cannot express that, and a scope
                     materialised at its default lights the save bar on a rule
                     that means exactly what it did. */
                  onScope={(s) => write(ops.setScope(rule.when, m.c.id, s))}
                  onFlipJoin={flipOuter}
                  onRemove={() => removeCondition(m.c.id)}
                  /* Gated on the same predicate the writer uses. The two used to
                     disagree — the button was drawn on every row while the
                     writer bailed whenever the row was the only one — so the
                     first row of every group had a control that did nothing. */
                  onSplit={m.card.conditions.length > 1 ? () => splitOut(m.c.id) : undefined}
                />
              ) : (
                <GroupMember
                  key={m.key}
                  k={m.card}
                  letter={cardLetter(m.index)}
                  outer={outer}
                  showJoin={i === 1}
                  railed={i > 1}
                  lead={i === 0}
                  onFlipOuter={flipOuter}
                  rows={shownIn(m.card)}
                  fresh={fresh}
                  dupes={dupes}
                  store={store}
                  resolve={resolve}
                  onAdd={openCatalogue(m.card.id)}
                  onUngroup={() => ungroup(m.card.id)}
                  onRemove={() => removeGroup(m.card.id)}
                  onFlipJoin={() => flipCardJoin(m.card.id)}
                  patchCondition={patchCondition}
                  removeCondition={removeCondition}
                  retype={(id, typeId) => write(ops.retypeCondition(rule.when, id, typeId, conditionType(typeId).operators[0]))}
                  setScope={(id, s) => write(ops.setScope(rule.when, id, s))}
                  splitOut={splitOut}
                />
              ),
            )}

            {/* The bracket's own foot, INSIDE the frame.

                It sat outside, under everything, which put the control that
                adds a member to this bracket in the one place that does not
                look like part of it — and it read as a footer for the pane
                rather than for the thing above it. */}
            <div className="bb__iffoot">
              <button type="button" className="bb__ifadd" onClick={openCatalogue('loose')}>
                <Plus size={12} strokeWidth={2.4} aria-hidden />
                Add condition
              </button>
              <button type="button" className="bb__ifaddgroup" onClick={addGroup}>
                <Braces size={12} strokeWidth={2.2} aria-hidden />
                Add group
              </button>
            </div>
          </div>
        )}
      </div>

      <ConditionPicker
        open={adding !== null}
        title={adding?.cardId === 'group' ? 'Start a group' : 'Add a condition'}
        onClose={() => setAdding(null)}
        onPick={add}
      />
    </div>
  )
}

/* --- A group: a bracket inside the bracket -------------------------------------

   One member of the outer bracket, however many conditions are inside it — so
   it takes one slot in the outer joiner column, exactly as a plain condition
   does, and then opens a frame of its own with its own operator in it.

   That is the whole grammar of this pane: the outer operator says how the
   members join, the frame says where a member stops, and the operator inside a
   frame is that group's own business. Naming it (`Group A`) is what makes the
   second one distinguishable from the first at a glance, and it is the name the
   linter and the change log already use for it. */
function GroupMember({
  k,
  letter,
  outer,
  showJoin,
  railed,
  lead,
  onFlipOuter,
  rows,
  fresh,
  dupes,
  store,
  resolve,
  onAdd,
  onUngroup,
  onRemove,
  onFlipJoin,
  patchCondition,
  removeCondition,
  retype,
  setScope,
  splitOut,
}: {
  k: ConditionCard
  letter: string
  outer: Joiner
  showJoin: boolean
  railed: boolean
  lead: boolean
  onFlipOuter: () => void
  rows: Condition[]
  fresh: string | null
  dupes: string[]
  store: ReturnType<typeof useBrand>
  resolve: ReturnType<typeof useNameLookup>
  onAdd: () => void
  onUngroup: () => void
  onRemove: () => void
  onFlipJoin: () => void
  patchCondition: (id: string, next: Partial<Condition>) => void
  removeCondition: (id: string) => void
  retype: (id: string, typeId: string) => void
  setScope: (id: string, s: 'both' | ZoneScope) => void
  splitOut: (id: string) => void
}) {
  const join = cardJoin(k)
  const name = k.label?.trim() || `Group ${letter}`

  return (
    <div className="bb__ifmember">
      <JoinCell join={outer} show={showJoin} railed={railed} lead={lead} scope="rule" onFlip={onFlipOuter} />

      <div
        className="bb__ifgroup"
        role="group"
        aria-label={`${name}: ${rows.length} condition${rows.length === 1 ? '' : 's'}, joined by ${join.toUpperCase()}. One member of the rule's conditions.`}
      >
        <div className="bb__ifgrouphead">
          <span className="bb__ifgroupname">
            <Braces size={12} strokeWidth={2.2} aria-hidden />
            {name}
          </span>
          {/* Said once, in words, for the run that is about to be read — and
              only when there is more than one thing in it to join. The pill in
              the column below is the control; this is the caption. */}
          {rows.length > 1 && (
            <span className="bb__ifgroupjoin">{join === 'and' ? 'all must match' : 'any one matches'}</span>
          )}
        </div>

        {rows.map((c, j) => (
          <ConditionRow
            key={c.id}
            c={c}
            join={join}
            showJoin={j === 1}
            railed={j > 1}
            /* Never. `if` opens the rule, and the rule opened above this
               frame — a second one here reads as a second rule starting. */
            lead={false}
            scope="group"
            fresh={fresh === c.id}
            dupe={dupes.includes(ckey(c))}
            store={store}
            resolve={resolve}
            onChange={(nextC) => patchCondition(c.id, nextC)}
            onRetype={(typeId) => retype(c.id, typeId)}
            onScope={(s) => setScope(c.id, s)}
            onFlipJoin={onFlipJoin}
            onRemove={() => removeCondition(c.id)}
            onSplit={k.conditions.length > 1 ? () => splitOut(c.id) : undefined}
          />
        ))}

        {/* A group with nothing in it says so, rather than rendering as an
            empty frame somebody has to guess the purpose of. The linter reports
            the same fact as PE320 at the same moment, so this is the friendly
            half of a finding that also blocks publishing. */}
        {rows.length === 0 && <p className="bb__ifempty">Nothing in this group yet — it matches everything until you add a condition.</p>}

        <div className="bb__ifgroupfoot">
          {/* Adding on the left, restructuring on the right, and the two no
              longer look alike.

              "Merge up" wore the same dashed outline as "Add condition" — one
              adds a row, the other folded this whole group into whatever card
              preceded it — and they were a centimetre apart in the same
              clothes. Dashed means exactly one thing on this surface now:
              something is about to be added. The two controls that RESTRUCTURE
              are quiet, labelled, and clustered at the other end where a
              group's own housekeeping belongs. */}
          <button type="button" className="bb__ifadd" onClick={onAdd}>
            <Plus size={12} strokeWidth={2.4} aria-hidden />
            Add condition
          </button>
          <span className="bb__ifgroupacts">
            <button
              type="button"
              className="bb__ifutil"
              aria-label={`Ungroup ${name}`}
              title="Dissolve this bracket — its conditions join the ones around it"
              onClick={onUngroup}
            >
              <Ungroup size={12} strokeWidth={2.2} aria-hidden />
              Ungroup
            </button>
            {/* Labelled. It was a bare glyph, which is the one control here
                that cannot be undone by pressing it again. */}
            <button
              type="button"
              className="bb__ifutil is-danger"
              aria-label={`Remove ${name} and the conditions in it`}
              title="Remove this group and the conditions in it"
              onClick={onRemove}
            >
              <X size={12} strokeWidth={2.2} aria-hidden />
              Remove
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

/* --- The joiner column ---------------------------------------------------------

   One cell, two states: the operator for this bracket, drawn once at the first
   gap, and a rail on every member after it saying the operator above governs
   them too.

   Shared by both levels rather than written twice, because the two ARE the same
   control at different depths — and the moment they were two pieces of code
   they started drifting apart in copy, size and colour, which is precisely what
   made a group look like a different kind of thing from the conditions beside
   it. */
function JoinCell({
  join,
  show,
  railed,
  lead,
  scope,
  onFlip,
}: {
  join: Joiner
  show: boolean
  railed: boolean
  lead: boolean
  /** What the operator governs, which is the only thing the two levels say differently. */
  scope: 'rule' | 'group'
  onFlip: () => void
}) {
  const where = scope === 'group' ? 'in this group' : 'in this rule'
  return (
    <span className={`bb__cond__join ${railed ? 'is-railed' : ''}`}>
      {show && (
        <button
          type="button"
          className={`bb__joinsel is-${join}`}
          /* Says what it governs, not just what it is. One press changes every
             condition at this level, and a control that announces itself as
             "and" gives no hint of that. */
          aria-label={`${join === 'and' ? `Every condition ${where} must match` : `Any one condition ${where} is enough`}. Switch to ${join === 'and' ? 'OR' : 'AND'} for all of them.`}
          title={`Everything ${where} is joined by ${join.toUpperCase()}. Click for ${join === 'and' ? 'OR' : 'AND'}.`}
          onClick={onFlip}
        >
          {join}
          <ChevronDown size={12} strokeWidth={2.2} aria-hidden />
        </button>
      )}
      {lead && (
        <span className="bb__cond__first" aria-hidden>
          if
        </span>
      )}
    </span>
  )
}

/* --- The two operators, and where they live -----------------------------------

   `Junction` stood here: the trunk joiner drawn as a full-width divider with a
   pill sitting on it, between two runs. Then it was a chip on the seam. Then it
   was nothing at all, which is how a predicate could carry an OR that no
   control on the pane could show you, let alone change.

   Both operators are pills in the joiner column now, one per bracket, drawn by
   the same `JoinCell` at both depths: the rule's on the second member of the
   block, a group's on the second row inside its frame. Same column, same
   control, one per level — and a rail down every member after it, because a
   bracket has ONE operator and drawing it in every gap presented one setting as
   four controls that happened to agree.

   The operator still changes the operator and nothing else. An older version
   restructured instead — AND split the run at that point, OR merged the
   previous group in — which gave two operators without a model that could hold
   them, at the cost of pressing AND between the second and third of four
   conditions turning `A and B and C and D` into `(A and B) or (C and D)`.
   Restructuring lives on the controls that say they restructure: "Add group",
   "Ungroup", and the split on a row. */

/* --- One condition, live ------------------------------------------------------ */

/* One condition, as one row: the joiner, the condition, and a way out of it.

   It was five cells — joiner, attribute, operator, value, actions — and that
   is three decisions laid out as though they were independent. They are not:
   the operators come from the attribute and the values come from the operator,
   so reading a row meant assembling one sentence out of three boxes and
   changing a condition meant visiting them in order.

   The condition is a pill now, and everything about it is inside what the pill
   opens. Jira's filter bar is the reference: a filter there is one chip you
   press, and the operator and the values live in the panel under it. */
function ConditionRow({
  c,
  join,
  showJoin,
  railed,
  lead,
  scope,
  fresh,
  dupe,
  store,
  resolve,
  onChange,
  onRetype,
  onScope,
  onFlipJoin,
  onRemove,
  onSplit,
}: {
  c: Condition
  join: Joiner
  /** The first gap in the run, and the only place the joiner is drawn. */
  showJoin: boolean
  /** A later row in the same run: a rail, tying it to the joiner above. */
  railed: boolean
  /** The very first row of the whole block, which opens with `if`. */
  lead: boolean
  /** Which bracket's operator this row's joiner cell governs. */
  scope: 'rule' | 'group'
  fresh: boolean
  dupe: boolean
  store: ReturnType<typeof useBrand>
  resolve: ReturnType<typeof useNameLookup>
  onChange: (c: Condition) => void
  onRetype: (typeId: string) => void
  /** Zone conditions only — the one writer for `scope` runs through here. */
  onScope: (s: 'both' | ZoneScope) => void
  onFlipJoin: () => void
  onRemove: () => void
  /** Absent when the row is the only condition in its run — nothing to split. */
  onSplit?: () => void
}) {
  const t = conditionType(c.typeId)
  const values = c.values.filter(Boolean)
  const { options, names, single, footer, onFooter } = valueSource(t, values, store, resolve)
  /* Every value, not `values[0]`. The stale check only ever looked at the
     first, so a zone deleted from the library sitting at index 1 rendered as
     perfectly valid. */
  const stale = options.length > 0 && values.some((id) => !options.some((o) => o.value === id))

  const summary =
    t.valueKind === 'time'
      ? `${c.values[0] ?? '09:00'} – ${c.values[1] ?? '17:00'}`
      : t.valueKind === 'range'
        ? values[0]
          ? `${values[0]} ${t.id === 'trust-age' ? 'days' : t.id === 'coords' ? 'km' : ''}`.trim()
          : 'Choose…'
        : summarise(names.length ? names : values, 'Choose…')

  return (
    <div className={`bb__cond ${fresh ? 'is-new' : ''}`}>
      <JoinCell join={join} show={showJoin} railed={railed} lead={lead} scope={scope} onFlip={onFlipJoin} />

      <span className="bb__cond__body">
        <ConditionPopover
          c={c}
          summary={summary}
          options={options}
          names={names}
          single={single}
          unset={values.length === 0 || stale}
          autoOpen={fresh}
          onRetype={onRetype}
          onOperator={(operator) => onChange({ ...c, operator })}
          onValues={(v) => onChange({ ...c, values: v })}
          onScope={onScope}
          onRemove={onRemove}
          footer={footer}
          onFooter={onFooter}
        />
        {dupe && (
          <span className="bb__ifdupe" title="This exact condition is also in another branch" aria-label="Also in another branch">
            ·2
          </span>
        )}
      </span>

      <span className="bb__cond__acts">
        {onSplit && (
          <button
            type="button"
            className="bb__ifact"
            aria-label={`Move ${t.label} into a group of its own`}
            title="Move into a group of its own"
            onClick={onSplit}
          >
            <Split size={13} strokeWidth={2} />
          </button>
        )}
      </span>
    </div>
  )
}

/* Where a condition's choices come from, by kind — one place, so the pill's
   summary and the panel's list can never be built from different lists.

   The three kinds that have no list (a time window, a number, a line of text)
   return none, and the panel renders the control they need instead. */
function valueSource(
  t: ConditionType,
  values: string[],
  store: ReturnType<typeof useBrand>,
  resolve: ReturnType<typeof useNameLookup>,
): { options: ValueOption[]; names: string[]; single?: boolean; footer?: string; onFooter?: () => void } {
  if (t.valueKind === 'zone' || t.valueKind === 'fingerprint' || t.valueKind === 'hook') {
    const kind = t.valueKind
    const options: ValueOption[] =
      kind === 'zone'
        ? store.zones.map((z) => ({
            value: z.id,
            label: z.name,
            meta: zoneShape(z),
            note: z.usedIn ? `Used by ${z.usedIn} rule${z.usedIn === 1 ? '' : 's'}` : undefined,
            icon: Globe,
          }))
        : kind === 'fingerprint'
          ? store.fingerprints.map((p) => ({ value: p.id, label: p.name, meta: modeLabel(p), icon: Fingerprint }))
          : store.hooks.filter((h) => h.mode === 'sync').map((h) => ({ value: h.id, label: h.name, meta: `Answers within ${h.timeoutMs}ms`, icon: Webhook }))
    return {
      options,
      names: values.map((id) => resolve(kind, id) ?? `deleted · ${id}`),
      /* A hook holds one. `diagnostics` reads `values[0]` to check the endpoint
         still exists, and a rule consulting two services would have to say what
         happens when they disagree. */
      single: kind === 'hook',
      footer: kind === 'zone' ? 'Manage zones' : kind === 'fingerprint' ? 'Manage device profiles' : 'Manage hooks',
      onFooter: () => store.go({ name: kind === 'zone' ? 'zones' : kind === 'fingerprint' ? 'fingerprint' : 'hooks' } as never),
    }
  }

  if (t.valueKind === 'group' || t.valueKind === 'user') {
    const kind = t.valueKind
    const options: ValueOption[] =
      kind === 'group'
        ? store.groups.map((g) => ({ value: g.id, label: g.name, meta: `${g.memberCount.toLocaleString()} people`, icon: Users }))
        : store.users.map((u) => ({ value: u.id, label: u.name, meta: u.email, icon: UserRound }))
    return {
      options,
      names: values.map((id) => resolve(kind, id) ?? `deleted · ${id}`),
      footer: kind === 'user' && store.unlistedUsers > 0 ? `${store.unlistedUsers.toLocaleString()} more in the directory` : undefined,
    }
  }

  if (t.options?.length) return { options: t.options.map((o) => ({ value: o, label: o })), names: values }

  return { options: [], names: values }
}

/* The catalogue is the trail's dialog, not a popover of its own.

   The board had its own anchored version: the same twenty-six attributes in a
   320px column that opened under whichever chip you pressed. Two problems, and
   the second is why it goes rather than gets fixed.

   It was too small for what it holds. Twenty-six attributes across nine
   components, each with a sentence of hint, in a column narrow enough to sit
   under a chip — so the categories became a horizontal strip of icons and the
   list scrolled, which is the arrangement the trail's dialog was built to
   replace. And it was a second implementation of one thing. Two pickers over
   one catalogue drift: an attribute added to the model appears in both, but a
   fix to the search ranking, the keyboard cursor or the empty state lands in
   whichever one the person was looking at.

   `ConditionPicker` is the one the trail already uses — 800px, categories down
   the left with counts, search that spans everything and ignores the selected
   category, arrow keys and Enter from the field. Being a dialog rather than an
   anchored popover also settles a thing the popover could never do well: it
   does not have to fit beside the chip you pressed, so it does not move when
   the chip is near an edge. */
