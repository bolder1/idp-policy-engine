import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, Fingerprint, Globe, Plus, Split, Trash2, UserRound, Users, Webhook, X } from 'lucide-react'

import { Picker } from '../../picker'
import { modeLabel } from '../../fingerprint'
import { cardJoin, cardLetter, ckey, duplicatedAcrossCards, topJoin } from '../../predicate'
import {
  CONDITION_CATALOGUE,
  ZONE_SCOPE_LABEL,
  conditionRank,
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
import { ValueSheet, zoneShape, type SheetOption } from '../ValueSheet'
import { groupIcon } from './tones'

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
                    at={j}
                    join={cardJoin(k)}
                    /* Every row but the first carries it, and pressing any one
                       flips the whole level — a level holds ONE joiner, so this
                       is one setting shown between each pair rather than one
                       setting per gap. */
                    showJoin={j > 0}
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
      <button
        type="button"
        className={`bb__ifkw is-${join} is-flip`}
        aria-label={`${SAYS[join][scope]} Switch to ${other.toUpperCase()}.`}
        title={`${SAYS[join][scope]} Click for ${other.toUpperCase()}.`}
        onClick={onFlip}
      >
        {join}
      </button>
    </div>
  )
}

/* --- One condition, live ------------------------------------------------------ */

/* One condition, as one row of controls.

   Four cells that line up down the whole block: the joiner, what is being
   checked, how, and what against — then a delete. It used to be a run of inline
   chips of whatever width their contents happened to be, wrapping onto two and
   three lines, so no two rows agreed about where anything was and a rule of
   five conditions had no column to read down.

   The attribute is a picker rather than a label now. It was the one part of a
   condition you could not change: choosing the wrong one meant deleting the row
   and adding another, losing your place in a list you were halfway through. The
   writer resets the operator and the value with the type, because carrying them
   over produces a condition naming an operator its type does not have.

   The joiner lives in the row rather than between rows for the same reason the
   rest of it moved: a control floating in the gap belongs to neither row above
   nor below it, and it made every second row start at a different height. */
function ConditionRow({
  c,
  at,
  join,
  showJoin,
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
  at: number
  join: Joiner
  /** Every row but the first carries the level's joiner. */
  showJoin: boolean
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
  const Ico = groupIcon(t.group)

  return (
    <div className={`bb__cond ${fresh ? 'is-new' : ''}`}>
      <span className="bb__cond__join">
        {showJoin ? (
          <button
            type="button"
            className={`bb__joinsel is-${join}`}
            aria-label={`${join === 'and' ? 'All of these must be true' : 'Any one of these is enough'}. Switch to ${join === 'and' ? 'OR' : 'AND'}.`}
            title={`Click for ${join === 'and' ? 'OR' : 'AND'}`}
            onClick={onFlipJoin}
          >
            {join}
            {/* The chevron is the affordance, and dropping it cost the control
                its only visible claim to being one. A coloured pill reading
                "AND" is a label everywhere else in this product — it is exactly
                what the read-only card draws — so without the mark the one
                place it is pressable looks identical to the places it is not.
                The pill does not move when it flips, which is the whole point
                of putting the joiner in the row. */}
            <ChevronDown size={11} strokeWidth={2.2} aria-hidden />
          </button>
        ) : (
          <span className="bb__cond__first" aria-hidden>
            {at === 0 ? 'if' : ''}
          </span>
        )}
      </span>

      <span className="bb__cond__what">
        <Picker
          label="What to check"
          size="sm"
          width="fill"
          searchable
          value={c.typeId}
          /* Same lead order the catalogue dialog uses, so the row and the
             dialog do not disagree about what comes first. */
          options={[...CONDITION_CATALOGUE]
            .sort((a, b) => conditionRank(a.id) - conditionRank(b.id))
            .map((x) => ({ value: x.id, label: x.label, meta: x.group }))}
          onChange={onRetype}
        />
        <i className="bb__cond__mark" aria-hidden>
          <Ico size={12} strokeWidth={2} />
        </i>
        {dupe && (
          <span className="bb__ifdupe" title="This exact condition is also in another branch" aria-label="Also in another branch">
            ·2
          </span>
        )}
      </span>

      <span className="bb__cond__op">
        <Picker
          label={`${t.label} operator`}
          size="sm"
          width="fill"
          value={c.operator}
          options={t.operators.map((o) => ({ value: o, label: o }))}
          onChange={(operator) => onChange({ ...c, operator })}
        />
      </span>

      <span className="bb__cond__val">
        <ValueControl
          c={c}
          type={t}
          store={store}
          resolve={resolve}
          autoOpen={fresh}
          onChange={(values) => onChange({ ...c, values })}
          onScope={onScope}
        />
      </span>

      <span className="bb__cond__acts">
        {onSplit && (
          <button type="button" className="bb__ifact" aria-label={`Move ${t.label} into its own group`} title="Move into its own group" onClick={onSplit}>
            <Split size={11} strokeWidth={2} />
          </button>
        )}
        <button type="button" className="bb__ifact is-danger" aria-label={`Remove ${t.label}`} title="Remove" onClick={onRemove}>
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </span>
    </div>
  )
}

/* --- The value, by kind ---------------------------------------------------------

   Every kind that can hold more than one thing now shows ONE control: a trigger
   naming what is chosen, opening the sheet to change it. The row therefore has
   a fixed number of cells whatever the condition is, which is the whole point —
   it used to grow a chip per value inside the cell, so three groups wrapped the
   row onto a second line and a rule of five conditions had no column to read
   down.

   The three kinds that stay inline are the three that are genuinely one control
   already: a time range (two 92px fields and the word between them), a number
   with its unit, and a line of free text. Sending those to a sheet would be a
   click to reach a box you can already see.
   -------------------------------------------------------------------------- */

/* The summary on the trigger: what is chosen, in the row's width.

   One name and a count, never a run of names. "Finance, Engineering, Contractors"
   is three names in a 200px cell — it elides to "Finance, Engi…", which reads as
   a truncated single value rather than as three. "Finance +2" is the same
   information and cannot be mistaken for one thing. */
function summarise(names: string[], placeholder: string): string {
  if (names.length === 0) return placeholder
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}

function ValueTrigger({
  label,
  summary,
  sub,
  count,
  open,
  unset,
  onOpen,
}: {
  label: string
  summary: string
  /** A second line — the zone half, once it is narrower than the default. */
  sub?: string
  /** How many are chosen. The summary elides to "Finance +2"; this does not. */
  count: number
  open: boolean
  unset: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={`bb__valtrig ${unset ? 'is-unset' : ''}`}
      /* The whole state, not just the field name.

         `aria-label` REPLACES a button's text, so labelling this with the
         attribute alone — "Network Zone" — announced the control and hid the
         one thing it exists to show. A sighted reader saw "Office Network +1,
         IP networks only"; a screen reader heard "Network Zone, button", with
         no way to find out what the condition was actually testing short of
         opening the sheet.

         `count` rather than the elided summary once there are several, because
         "+1" is a visual abbreviation and reads as part of a name out loud. */
      aria-label={[
        label,
        unset ? 'nothing chosen' : count > 1 ? `${summary.replace(/ \+\d+$/, '')} and ${count - 1} more` : summary,
        sub,
      ]
        .filter(Boolean)
        .join(', ')}
      aria-haspopup="dialog"
      aria-expanded={open}
      title={sub ? `${summary} · ${sub}` : summary}
      onClick={onOpen}
    >
      <span className="bb__valtrig__text">
        <b>{summary}</b>
        {sub && <em>{sub}</em>}
      </span>
      <ChevronDown size={12} strokeWidth={2.1} aria-hidden />
    </button>
  )
}

function ValueControl({
  c,
  type,
  store,
  resolve,
  autoOpen,
  onChange,
  onScope,
}: {
  c: Condition
  type: ConditionType
  store: ReturnType<typeof useBrand>
  resolve: ReturnType<typeof useNameLookup>
  autoOpen: boolean
  onChange: (v: string[]) => void
  onScope: (s: 'both' | ZoneScope) => void
}) {
  /* Open on mount for a row that was just added, which is the one moment the
     next thing somebody wants is certainly this sheet. */
  const [open, setOpen] = useState(autoOpen)
  const values = c.values.filter(Boolean)
  const v = values[0] ?? ''

  /* --- Library references: zones, device profiles, hooks --------------------- */
  if (type.valueKind === 'zone' || type.valueKind === 'fingerprint' || type.valueKind === 'hook') {
    const kind = type.valueKind
    /* A hook holds exactly one, and that is not a simplification — `diagnostics`
       reads `values[0]` to check the endpoint still exists, and a rule that
       consulted two external services would need to say what to do when they
       disagree. */
    const single = kind === 'hook'
    const items: SheetOption[] =
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
          : store.hooks
              .filter((h) => h.mode === 'sync')
              .map((h) => ({ value: h.id, label: h.name, meta: `Answers within ${h.timeoutMs}ms`, icon: Webhook }))

    const names = values.map((id) => resolve(kind, id) ?? `deleted · ${id}`)
    /* Every value, not `values[0]`. The stale check only ever looked at the
       first, so a zone deleted from the library sitting at index 1 rendered as
       perfectly valid. */
    const stale = values.some((id) => !items.some((o) => o.value === id))

    return (
      <>
        <ValueTrigger
          label={type.label}
          summary={summarise(names, 'Choose…')}
          /* Said only when it is narrower than the zone as written. A row that
             printed "IP and location" on every zone condition would spend its
             second line on the default. */
          sub={kind === 'zone' && c.scope ? ZONE_SCOPE_LABEL[c.scope] : undefined}
          count={values.length}
          open={open}
          unset={values.length === 0 || stale}
          onOpen={() => setOpen(true)}
        />
        <ValueSheet
          open={open}
          onClose={() => setOpen(false)}
          title={kind === 'zone' ? 'Network zones' : kind === 'fingerprint' ? 'Device profiles' : 'External hooks'}
          caption={
            kind === 'zone'
              ? 'Zones come from your library, so an address block that moves is edited once rather than in every rule that names it.'
              : kind === 'fingerprint'
                ? 'A profile decides whether this is the same device as last time — not whether the device is healthy.'
                : 'Only a hook that answers synchronously can decide a sign-in. An async hook is notified and cannot hold the request up.'
          }
          options={items}
          picked={values}
          single={single}
          scope={kind === 'zone' ? (c.scope ?? 'both') : undefined}
          onScope={onScope}
          onToggle={(id) => onChange(single ? [id] : values.includes(id) ? values.filter((x) => x !== id) : [...values, id])}
          footer={kind === 'zone' ? 'Manage zones' : kind === 'fingerprint' ? 'Manage device profiles' : 'Manage hooks'}
          onFooter={() => store.go({ name: kind === 'zone' ? 'zones' : kind === 'fingerprint' ? 'fingerprint' : 'hooks' } as never)}
          empty={
            kind === 'zone'
              ? 'No zones yet. A day-one tenant starts with none — nothing is restricted until somebody says so.'
              : kind === 'fingerprint'
                ? 'No device profiles yet.'
                : 'No synchronous hooks yet.'
          }
        />
      </>
    )
  }

  /* --- Directory references: groups and people ------------------------------- */
  if (type.valueKind === 'group' || type.valueKind === 'user') {
    const kind = type.valueKind
    const items: SheetOption[] =
      kind === 'group'
        ? store.groups.map((g) => ({ value: g.id, label: g.name, meta: `${g.memberCount.toLocaleString()} people`, icon: Users }))
        : store.users.map((u) => ({ value: u.id, label: u.name, meta: u.email, icon: UserRound }))
    const names = values.map((id) => resolve(kind, id) ?? `deleted · ${id}`)

    return (
      <>
        <ValueTrigger label={type.label} summary={summarise(names, 'Choose…')} count={values.length} open={open} unset={values.length === 0} onOpen={() => setOpen(true)} />
        <ValueSheet
          open={open}
          onClose={() => setOpen(false)}
          title={kind === 'group' ? 'Groups' : 'People'}
          caption={
            kind === 'group'
              ? 'Membership is read at sign-in, so the rule follows whoever is in the group on the day rather than who was in it when it was written.'
              : 'Named individuals. A group is usually the better answer — a person named in a rule is a rule somebody has to remember to edit when they change team.'
          }
          options={items}
          picked={values}
          onToggle={(id) => onChange(values.includes(id) ? values.filter((x) => x !== id) : [...values, id])}
          footer={kind === 'user' && store.unlistedUsers > 0 ? `${store.unlistedUsers.toLocaleString()} more in the directory` : undefined}
        />
      </>
    )
  }

  /* --- A fixed list ---------------------------------------------------------- */
  if (type.options?.length) {
    return (
      <>
        <ValueTrigger label={type.label} summary={summarise(values, 'Choose…')} count={values.length} open={open} unset={values.length === 0} onOpen={() => setOpen(true)} />
        <ValueSheet
          open={open}
          onClose={() => setOpen(false)}
          title={type.label}
          caption={type.hint}
          options={type.options.map((o) => ({ value: o, label: o }))}
          picked={values}
          onToggle={(o) => onChange(values.includes(o) ? values.filter((x) => x !== o) : [...values, o])}
        />
      </>
    )
  }

  /* --- The three that are already one control -------------------------------- */
  if (type.valueKind === 'time') {
    return (
      <span className="bb__valrange">
        <input type="time" className="bb__ifinput" aria-label="From" value={c.values[0] ?? '09:00'} onChange={(e) => onChange([e.target.value, c.values[1] ?? '17:00'])} />
        <IfKw tone="op">to</IfKw>
        <input type="time" className="bb__ifinput" aria-label="To" value={c.values[1] ?? '17:00'} onChange={(e) => onChange([c.values[0] ?? '09:00', e.target.value])} />
      </span>
    )
  }

  if (type.valueKind === 'range') {
    return (
      <span className="bb__valrange">
        <input type="number" className="bb__ifinput is-num" aria-label={type.label} value={v} placeholder="0" onChange={(e) => onChange([e.target.value])} />
        <IfKw tone="op">{type.id === 'trust-age' ? 'days' : type.id === 'coords' ? 'km' : 'score'}</IfKw>
      </span>
    )
  }

  return <input className="bb__ifinput is-text" aria-label={type.label} placeholder="value…" value={v} onChange={(e) => onChange([e.target.value])} />
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
