import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, Fingerprint, Globe, Plus, Split, UserRound, Users, Webhook, X } from 'lucide-react'

import { modeLabel } from '../../fingerprint'
import { cardJoin, cardLetter, ckey, duplicatedAcrossCards, topJoin } from '../../predicate'
import {
  conditionType,
  type Condition,
  type ConditionType,
  type Joiner,
  type Predicate,
  type Rule,
  type ZoneScope,
} from '../../data'
import * as ops from '../../when-ops'
import { useBrand, useNameLookup } from '../../store'
import { predicateParts } from '../predicate-prose'
import { ConditionPicker } from '../rule-form'
import { IfChip, IfKw } from './IfBlock'
import { ConditionPopover, summarise, zoneShape, type ValueOption } from '../ConditionPopover'

/* -----------------------------------------------------------------------------
   WHEN — the conditional, editable.

   The same block the card draws, with every chip live: the operator is a
   picker, the value is the control the attribute needs, `and` adds into the
   group, `or` starts another way in, and the `└` under `if` is the decision.
   The `else` is real — it names the rule that inherits whatever this one lets
   past — because that is the half of a conditional people forget to think
   about, and under first-match it is most of what a rule does.

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
  const flipTopJoin = () => write(ops.flipTrunkJoin(rule.when))

  /* Still three destinations, because there are still three things a person can
     mean by "add": into this group, into the loose run at the end, or into a
     group of its own. */
  const add = (typeId: string) => {
    if (!adding) return
    const t = conditionType(typeId)
    const c = ops.freshCondition(typeId, t.operators[0])

    if (adding.cardId === 'group') {
      /* A group starts empty of everything that came before it. Adding one used
         to leave the existing conditions where they were and draw a frame round
         them too, so making a NEW group visually swallowed the old ones. */
      const next = ops.addCondition(rule.when, 'new', c)
      write(ops.setGrouped(next, next.cards[next.cards.length - 1].id, true))
    } else if (adding.cardId === 'loose') {
      /* Join the last card when it is loose, and start a new run when it is a
         group — so a condition added from the button below a group lands after
         it rather than jumping to the top. */
      const last = cards[cards.length - 1]
      write(last && !last.grouped ? ops.addCondition(rule.when, last.id, c) : ops.addCondition(rule.when, 'new', c))
    } else {
      write(ops.addCondition(rule.when, adding.cardId, c))
    }

    setAdding(null)
    setFresh(c.id)
  }

  const removeCondition = (conditionId: string) => write(ops.removeCondition(rule.when, conditionId))
  const patchCondition = (conditionId: string, next: Partial<Condition>) => write(ops.patchCondition(rule.when, conditionId, next))
  const splitOut = (conditionId: string) => write(ops.splitOut(rule.when, conditionId))
  const mergeUp = (i: number) => {
    if (i < 1 || i >= cards.length) return
    write(ops.mergeBranches(rule.when, cards[i].id, cards[i - 1].id))
  }
  const removeGroup = (id: string) => write(ops.removeBranch(rule.when, id))
  const addGroup = () => write(ops.addBranch(rule.when))

  const dupes = duplicatedAcrossCards(rule.when)
  const parts = predicateParts(rule.when, resolve)
  const openCatalogue = (cardId: string | 'new') => () => setAdding({ cardId })


  return (
    <div>
      <div className="bb__if is-editable">
        {cards.length === 0 ? (
          <div className="bb__ifrow">
            <span className="bb__ifbranch" aria-hidden>
              <Split size={12} strokeWidth={2} />
            </span>
            <IfKw>if</IfKw>
            <IfChip muted icon={<Plus size={10} strokeWidth={2.4} />} onClick={openCatalogue('loose')}>
              add a condition
            </IfChip>
            <span className="bb__ifjourney">— until then, any sign-in that reaches it</span>
          </div>
        ) : (
          cards.map((k, i) => (
            <Fragment key={k.id}>
              {/* The operator between two groups, and it is a control.

                  It used to be a word printed at the start of the second
                  group's first row, which said what the model held and offered
                  no way to change it: making `A and B` into `A or B` meant
                  finding the split icon on a row, and going back meant deleting
                  a condition and retyping it into the other group. Both
                  directions are one click on the operator now. */}
              {i > 0 && <Junction join={topJoin(rule.when)} scope="top" onFlip={flipTopJoin} />}

              {/* Framed only once a group actually exists.

                  Every condition lives in a card because a card IS an
                  unbroken run of ANDs — that is the model. But drawing a frame
                  around the first one told a different story: it said the
                  first condition you add creates a group and everything after
                  it goes inside, when what is really happening is that plain
                  independent conditions are being ANDed together.

                  So a single card draws as bare rows. Press "Add group" and a
                  second card appears; only then does either wear a frame,
                  because only then is there a bracket to show. */}
              <div className={k.grouped ? 'bb__ifgroup' : 'bb__ifplain'}>
                {k.conditions.map((c, j) => (
                  <ConditionRow
                    key={c.id}
                    c={c}
                    join={cardJoin(k)}
                    /* ONE joiner per run, drawn at the first gap, with a rail
                       down the rest.

                       A run holds a single joiner — pressing any pill always
                       flipped every condition in it — but drawing that pill in
                       every gap presented one setting as four controls, and
                       nothing said they moved together until you pressed one
                       and watched the others change. */
                    showJoin={j === 1}
                    railed={j > 1}
                    /* `if` opens the sentence once, on the very first row of
                       the block. The second run had one too, which reads as a
                       second rule starting — the OR above it is what introduces
                       an alternative, and a keyword meaning "here is the
                       condition" is not the thing to repeat at the head of one. */
                    lead={i === 0 && j === 0}
                    fresh={fresh === c.id}
                    /* `duplicatedAcrossCards` returns ckeys, not ids. Asking it
                       about `c.id` compared two string spaces that never meet, so
                       the ·2 badge and its tooltip were unreachable. */
                    dupe={dupes.includes(ckey(c))}
                    store={store}
                    resolve={resolve}
                    onChange={(nextC) => patchCondition(c.id, nextC)}
                    onRetype={(typeId) => write(ops.retypeCondition(rule.when, c.id, typeId, conditionType(typeId).operators[0]))}
                    /* Through `when-ops` like every other edit, because "both"
                       has to DELETE the field rather than store the word — a
                       patch merges and cannot express that, and a scope
                       materialised at its default lights the save bar on a rule
                       that means exactly what it did. */
                    onScope={(s) => write(ops.setScope(rule.when, c.id, s))}
                    onFlipJoin={() => flipCardJoin(k.id)}
                    onRemove={() => removeCondition(c.id)}
                    /* Gated on the same predicate the writer uses. The two used to
                       disagree — the button was drawn on every row while the
                       writer bailed whenever the row was the only one — so the
                       first row of every group had a control that did nothing. */
                    onSplit={k.conditions.length > 1 ? () => splitOut(c.id) : undefined}
                  />
                ))}

                {/* A group gets its own adder, inside its frame, because that is
                    where the condition will land. A loose run does not: the one
                    at the foot of the block already adds to it, and two buttons
                    saying "Add condition" a centimetre apart is a choice nobody
                    can make correctly. */}
                {/* A group with nothing in it says so, rather than rendering as
                    an empty frame somebody has to guess the purpose of. The
                    linter reports the same fact as PE320 at the same moment, so
                    this is the friendly half of a finding that also blocks
                    publishing. */}
                {k.grouped && k.conditions.length === 0 && (
                  <p className="bb__ifempty">
                    Nothing in this group yet — it matches everything until you add a condition.
                  </p>
                )}

                {k.grouped && (
                <div className="bb__ifgroupfoot">
                  <button type="button" className="bb__ifadd" onClick={openCatalogue(k.id)}>
                    <Plus size={11} strokeWidth={2.4} aria-hidden />
                    Add condition
                  </button>
                  {/* Only once there is more than one group. Ungrouped, this
                      would delete every condition on the rule from a control
                      sitting beside "Add condition". */}
                  {i > 0 && k.conditions.length > 0 && (
                    <button
                      type="button"
                      className="bb__ifadd"
                      title="Fold these conditions into the group above"
                      onClick={() => mergeUp(i)}
                    >
                      Merge up
                    </button>
                  )}
                  <button
                    type="button"
                    className="bb__ifdrop"
                    aria-label={`Remove group ${cardLetter(i)}`}
                    title="Remove this group"
                    onClick={() => removeGroup(k.id)}
                  >
                    <X size={11} strokeWidth={2.2} aria-hidden />
                  </button>
                </div>
                )}
              </div>
            </Fragment>
          ))
        )}

        {cards.length > 0 && (
          <div className="bb__iffoot">
            {/* Two destinations, said as two buttons. "Add condition" here puts
                one at the top level beside the others; "Add group" starts a
                bracket. Inside a group there is a third — that group's own
                "Add condition" — so every place a condition can land has a
                control sitting in it. */}
            <button type="button" className="bb__ifadd" onClick={openCatalogue('loose')}>
              <Plus size={11} strokeWidth={2.4} aria-hidden />
              Add condition
            </button>
            <button type="button" className="bb__ifaddgroup" onClick={addGroup}>
              <Plus size={11} strokeWidth={2.4} aria-hidden />
              Add group
            </button>
          </div>
        )}
      </div>

      {/* Folded, and shut by default.

          It restates in a paragraph what the rows directly above it already
          say in a structure — which is worth having when a predicate has grown
          brackets and you want to check you meant it, and is noise the rest of
          the time. Read open, it grew with every condition: five conditions
          across two groups is three lines of prose sitting between the editor
          and the outcome, pushing THEN off the screen precisely when the rule
          is complicated enough that you want to see both.

          A `<details>`, so it costs one line closed and no JavaScript. */}
      {cards.length > 0 && (
        <details className="bb__reads">
          <summary>
            <ChevronDown size={13} strokeWidth={2} aria-hidden />
            Reads as
          </summary>
          {/* The words come from the predicate, not from the shape it used to
              have. This printed a hardcoded `or` between groups and joined each
              group's clauses with `and`, which was right only while those were
              the only joiners the model could hold. `predicateParts` reports
              each group's own joiner now. */}
          <p className="bb__readback">
            This rule matches when{' '}
            {parts.map((part, i) => (
              <Fragment key={part.id}>
                {i > 0 && (
                  <>
                    {' '}
                    <b>{topJoin(rule.when)}</b>{' '}
                  </>
                )}
                {part.label && cards.length > 1 ? <b>{part.label}: </b> : null}
                {/* An empty group is not nothing — it matches everything, which
                    is precisely what makes it dangerous. Printing its clauses
                    gave "… or ." and left a dangling joiner; dropping it
                    altogether would have been worse, because the sentence would
                    then describe a narrower rule than the one that would run.
                    So it says the thing it does. */}
                {part.clauses.length === 0 ? (
                  <em>anything</em>
                ) : (
                  <>
                    {part.clauses.length > 1 && cards.length > 1 ? '(' : ''}
                    {part.clauses.map((c) => c.text).join(part.join === 'or' ? ' or ' : ' and ')}
                    {part.clauses.length > 1 && cards.length > 1 ? ')' : ''}
                  </>
                )}
              </Fragment>
            ))}
            .
          </p>
        </details>
      )}

      <ConditionPicker
        open={adding !== null}
        title={adding?.cardId === 'group' ? 'Start a group' : 'Add a condition'}
        onClose={() => setAdding(null)}
        onPick={add}
      />
    </div>
  )
}

/* --- The operator at a level --------------------------------------------------

   A pill you press. It reads the joiner the level currently holds, and pressing
   it flips that level — every pill at the level reads the same word, because
   there is one joiner per level rather than one per gap.

   It used to restructure instead: the AND pill split the run at that point and
   the OR pill merged the previous group in. That gave two operators without a
   model that could hold them, at the cost of pressing AND between the second
   and third of four conditions turning `A and B and C and D` into
   `(A and B) or (C and D)` — regrouping everything after the press. The model
   carries a joiner per level now, so the operator changes the operator, and
   restructuring moved to the row that actually moves. */

const SAYS: Record<Joiner, { top: string; group: string }> = {
  and: { top: 'Every group must match.', group: 'All of these must be true.' },
  or: { top: 'Any one group is enough.', group: 'Any one of these is enough.' },
}

function Junction({ join, scope, onFlip }: { join: Joiner; scope: 'top' | 'group'; onFlip: () => void }) {
  const other: Joiner = join === 'and' ? 'or' : 'and'
  return (
    <div className={`bb__ifjoin is-${join}`}>
      {/* The same pill the rows use, deliberately.

          Two joiner controls were on screen at once and they looked nothing
          alike — a bordered select inside the runs, a bare coloured word
          between them — so the block appeared to offer two different KINDS of
          operator when it has one kind at two levels. Same control and same
          affordance now; what differs is what each one joins, which the rule it
          sits on already says. */}
      <button
        type="button"
        className={`bb__joinsel is-${join}`}
        aria-label={`${SAYS[join][scope]} Switch to ${other.toUpperCase()}.`}
        title={`${SAYS[join][scope]} Click for ${other.toUpperCase()}.`}
        onClick={onFlip}
      >
        {join}
        <ChevronDown size={11} strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  )
}

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
      <span className={`bb__cond__join ${railed ? 'is-railed' : ''}`}>
        {showJoin && (
          <button
            type="button"
            className={`bb__joinsel is-${join}`}
            /* Says what it governs, not just what it is. One press changes
               every condition in this run, and a control that announces itself
               as "and" gives no hint of that. */
            aria-label={`${join === 'and' ? 'Every condition here must match' : 'Any one condition here is enough'}. Switch to ${join === 'and' ? 'OR' : 'AND'} for all of them.`}
            title={`All of these are joined by ${join.toUpperCase()}. Click for ${join === 'and' ? 'OR' : 'AND'}.`}
            onClick={onFlipJoin}
          >
            {join}
            <ChevronDown size={11} strokeWidth={2.2} aria-hidden />
          </button>
        )}
        {lead && (
          <span className="bb__cond__first" aria-hidden>
            if
          </span>
        )}
      </span>

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
          <button type="button" className="bb__ifact" aria-label={`Move ${t.label} into its own group`} title="Move into its own group" onClick={onSplit}>
            <Split size={11} strokeWidth={2} />
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
