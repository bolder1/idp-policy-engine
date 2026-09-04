import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, Copy, Plus, Split, X } from 'lucide-react'

import { Picker } from '../../picker'
import { modeLabel } from '../../fingerprint'
import { cardJoin, cardLetter, ckey, duplicatedAcrossCards, topJoin } from '../../predicate'
import {
  card,
  cond,
  conditionType,
  emptyGroup,
  type Condition,
  type ConditionCard,
  type ConditionType,
  type Joiner,
  type Rule,
} from '../../data'
import { useBrand, useNameLookup } from '../../store'
import { predicateParts } from '../predicate-prose'
import { ConditionPicker } from '../rule-form'
import { IfChip, IfKw } from './IfBlock'
import { GROUP_TONE, groupIcon } from './tones'

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

const GROUP_LABEL: Record<string, string> = {
  Device: 'Device profiles',
  Webhooks: 'External hooks',
  Group: 'Groups',
  User: 'People',
}

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

  /* `...rule.when`, not a fresh object.

     This wrote `{ cards: next }`, which dropped `when.join` — so the moment
     you edited any condition, a predicate whose groups were joined by AND
     silently reverted to OR. Every edit here goes through this one function,
     so the whole editor had the bug. */
  const setCards = (next: ConditionCard[]) => onPatch({ when: { ...rule.when, cards: next } })

  /* --- The operators ---------------------------------------------------------

     One joiner per level, and pressing any pill at a level flips that level.

     This is the model's own shape rather than a UI convention: a level holds
     ONE joiner, so mixed precedence inside a run cannot be expressed and
     nobody has to guess whether `A and B or C` binds the and or the or first.
     It is also why the pills at a level all read the same word — they are one
     setting shown between each pair, not one setting per gap. */
  const flipCardJoin = (id: string) =>
    setCards(cards.map((k) => (k.id === id ? { ...k, join: cardJoin(k) === 'and' ? 'or' : 'and' } : k)))

  const flipTopJoin = () => onPatch({ when: { ...rule.when, join: topJoin(rule.when) === 'or' ? 'and' : 'or' } })

  /* A GROUP survives losing its last condition; a loose run does not.

     Deleting the last condition used to delete the frame with it, so a group
     you had just made vanished under you the moment you cleared it out to
     start again — and there was no way back except Add group. A group is a
     thing the author made on purpose, so it stays until they remove it, and
     says it is empty while it is. A loose card is not something anybody made;
     it is where ungrouped conditions live, so an empty one has nothing to
     represent and goes. */
  const patchCard = (id: string, nextCard: ConditionCard | null) =>
    setCards(
      cards.flatMap((k) => {
        if (k.id !== id) return [k]
        if (!nextCard) return []
        if (nextCard.conditions.length > 0) return [nextCard]
        return nextCard.grouped ? [nextCard] : []
      }),
    )

  const add = (typeId: string) => {
    const t = conditionType(typeId)
    const c = cond(typeId, t.operators[0], [])
    if (!adding) return

    if (adding.cardId === 'group') {
      /* A group starts empty of everything that came before it. Adding one
         used to leave the existing conditions where they were and then draw a
         frame around them too, so the act of creating a NEW group visually
         swallowed the old conditions into one. Nothing that already existed
         moves, and nothing that was loose becomes grouped. */
      setCards([...cards, { ...card(c), grouped: true }])
    } else if (adding.cardId === 'loose') {
      /* At the END, which is where the button that opened this sits.

         It used to search backwards for any ungrouped card and join that. With
         `[loose, group]` the search found the loose run at the top, so a
         condition added from a button below the group appeared above it — and
         there was then no way to put one after a group at all, because the
         only loose run the search could ever find was the first.

         So: join the last card if it is loose, and start a new loose run if it
         is a group. Adding lands where you pressed, and a group can be followed
         by conditions the same way it can be preceded by them. */
      const last = cards[cards.length - 1]
      setCards(
        last && !last.grouped
          ? cards.map((k) => (k.id === last.id ? { ...k, conditions: [...k.conditions, c] } : k))
          : [...cards, card(c)],
      )
    } else {
      setCards(cards.map((k) => (k.id === adding.cardId ? { ...k, conditions: [...k.conditions, c] } : k)))
    }

    setAdding(null)
    setFresh(c.id)
  }

  /* The two moves the operators make, and they are the same move in reverse.

     A group is an unbroken run of ANDs and the groups are alternatives, which
     is the whole model — two levels, deliberately, for the reasons in
     predicate.ts. So "make these alternatives" is a SPLIT of one group into
     two, and "require both" is a MERGE of two groups into one. Neither can
     produce a third level, and nothing here offers one: an operator inside a
     group is always AND and an operator between groups is always OR, so what
     you can build is exactly what the evaluator can run. */
  const splitAt = (cardId: string, at: number) => {
    const idx = cards.findIndex((k) => k.id === cardId)
    if (idx === -1) return
    const k = cards[idx]
    const head = k.conditions.slice(0, at)
    const tail = k.conditions.slice(at)
    if (!head.length || !tail.length) return
    /* `join` travels with the halves. Splitting an OR-run into two produced
       two AND-runs without it, which is a different rule. */
    setCards([...cards.slice(0, idx), { ...k, conditions: head }, { ...card(...tail), grouped: k.grouped, join: k.join }, ...cards.slice(idx + 1)])
  }

  /* The inverse of split, and it needs to exist for the same reason: without
     it, moving a condition into its own group is a one-way door. It keeps the
     absorbing group's joiner — two runs being merged cannot both keep theirs,
     and the one you are merging INTO is the one whose shape survives. */
  const mergeUp = (i: number) => {
    if (i < 1 || i >= cards.length) return
    const prev = cards[i - 1]
    const cur = cards[i]
    setCards([
      ...cards.slice(0, i - 1),
      { ...prev, conditions: [...prev.conditions, ...cur.conditions] },
      ...cards.slice(i + 1),
    ])
  }

  const dupes = duplicatedAcrossCards(rule.when)
  const parts = predicateParts(rule.when, resolve)
  const openCatalogue = (cardId: string | 'new') => () => setAdding({ cardId })

  /* An empty frame, and nothing else.

     "Add group" used to open the attribute picker and build the group around
     whatever you chose, which made it the same gesture as "Add condition" with
     a different label — and it dropped you into choosing an attribute when
     what you had asked for was a bracket. Now the bracket appears, empty, with
     its own adder inside it and its own operator; the next move is yours. */
  const addGroup = () => setCards([...cards, emptyGroup()])

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
                  <Fragment key={c.id}>
                    {j > 0 && <Junction join={cardJoin(k)} scope="group" onFlip={() => flipCardJoin(k.id)} />}
                    <ConditionRow
                      c={c}
                      showIf={i === 0 && j === 0}
                      fresh={fresh === c.id}
                      /* `duplicatedAcrossCards` returns ckeys, not ids. Asking it
                         about `c.id` compared two string spaces that never meet, so
                         the ·2 badge and its tooltip were unreachable. */
                      dupe={dupes.includes(ckey(c))}
                      store={store}
                      resolve={resolve}
                      onChange={(nextC) => patchCard(k.id, { ...k, conditions: k.conditions.map((x) => (x.id === c.id ? nextC : x)) })}
                      onRemove={() => patchCard(k.id, { ...k, conditions: k.conditions.filter((x) => x.id !== c.id) })}
                      onDuplicate={() => patchCard(k.id, { ...k, conditions: k.conditions.flatMap((x) => (x.id === c.id ? [x, cond(x.typeId, x.operator, [...x.values])] : [x])) })}
                      /* Splitting is a deliberate restructure now, on the row
                         that moves, rather than a side effect of pressing an
                         operator. */
                      onSplit={k.conditions.length > 1 ? () => splitAt(k.id, j) : undefined}
                    />
                  </Fragment>
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
                    onClick={() => patchCard(k.id, null)}
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

function ConditionRow({
  c,
  showIf,
  fresh,
  dupe,
  store,
  resolve,
  onChange,
  onRemove,
  onDuplicate,
  onSplit,
}: {
  c: Condition
  /** Only the very first row of the first group wears the `if`. */
  showIf: boolean
  fresh: boolean
  dupe: boolean
  store: ReturnType<typeof useBrand>
  resolve: ReturnType<typeof useNameLookup>
  onChange: (c: Condition) => void
  onRemove: () => void
  onDuplicate: () => void
  /** Absent when the row is the only condition in its run — nothing to split. */
  onSplit?: () => void
}) {
  const t = conditionType(c.typeId)
  const Ico = groupIcon(t.group)
  const tone = GROUP_TONE[t.group] ?? 'neutral'
  return (
    <div className={`bb__ifrow ${fresh ? 'is-new' : ''}`}>
      {/* `if` once, on the very first row. Every other junction is a pill
          between rows now, so a keyword here would be the same operator said
          twice — and the `or` this used to print at the head of a second group
          was a word standing where the control belongs. */}
      {showIf && (
        <>
          <span className="bb__ifbranch" aria-hidden>
            <Split size={12} strokeWidth={2} />
          </span>
          <IfKw>if</IfKw>
        </>
      )}

      <IfChip tone={tone} icon={<Ico size={9} strokeWidth={2.2} />} title={dupe ? `${t.label} — also in another way in` : GROUP_LABEL[t.group] ?? t.group}>
        {t.label}
        {dupe && <span className="bb__ifdupe" aria-label="Also in another branch">·2</span>}
      </IfChip>

      <span className="bb__ifop">
        <Picker label={`${t.label} operator`} size="sm" value={c.operator} options={t.operators.map((o) => ({ value: o, label: o }))} onChange={(operator) => onChange({ ...c, operator })} />
      </span>

      <ValueControl type={t} values={c.values} store={store} resolve={resolve} autoOpen={fresh} onChange={(values) => onChange({ ...c, values })} />

      {/* The row's own `+ and` chip and its split icon both moved to the
          junctions between rows, where the same two moves are one press each
          and are visible without hovering first. */}
      <span className="bb__ifacts">
        {onSplit && (
          <button type="button" className="bb__ifact" aria-label={`Move ${t.label} into its own group`} title="Move into its own group" onClick={onSplit}>
            <Split size={11} strokeWidth={2} />
          </button>
        )}
        <button type="button" className="bb__ifact" aria-label={`Duplicate ${t.label}`} title="Duplicate" onClick={onDuplicate}>
          <Copy size={11} strokeWidth={2} />
        </button>
        <button type="button" className="bb__ifact" aria-label={`Remove ${t.label}`} title="Remove" onClick={onRemove}>
          <X size={11} strokeWidth={2.2} />
        </button>
      </span>
    </div>
  )
}

/* --- The value, by kind ---------------------------------------------------------
   The same shapes the trail uses, so a rule reads the same in both builders. */

function ValueControl({
  type,
  values,
  store,
  resolve,
  autoOpen,
  onChange,
}: {
  type: ConditionType
  values: string[]
  store: ReturnType<typeof useBrand>
  resolve: ReturnType<typeof useNameLookup>
  autoOpen: boolean
  onChange: (v: string[]) => void
}) {
  const v = values[0] ?? ''

  if (type.valueKind === 'zone' || type.valueKind === 'fingerprint' || type.valueKind === 'hook') {
    const items =
      type.valueKind === 'zone'
        ? store.zones.map((z) => ({ value: z.id, label: z.name, meta: z.usedIn ? `${z.usedIn} uses` : undefined }))
        : type.valueKind === 'fingerprint'
          ? store.fingerprints.map((p) => ({ value: p.id, label: p.name, meta: modeLabel(p) }))
          : store.hooks.filter((h) => h.mode === 'sync').map((h) => ({ value: h.id, label: h.name, meta: `${h.timeoutMs}ms` }))
    const screen = type.valueKind === 'zone' ? 'zones' : type.valueKind === 'fingerprint' ? 'fingerprint' : 'hooks'
    return (
      <>
        <Picker
          label={type.label}
          size="sm"
          value={v}
          options={items}
          autoOpen={autoOpen}
          placeholder="choose…"
          invalid={!v}
          onChange={(id) => onChange([id])}
          footer={type.valueKind === 'zone' ? 'Manage zones →' : type.valueKind === 'fingerprint' ? 'Manage device profiles →' : 'Manage hooks →'}
          onFooter={() => store.go({ name: screen } as never)}
        />
        {v && !items.some((i) => i.value === v) && <IfChip unset>deleted · {v}</IfChip>}
      </>
    )
  }

  if (type.valueKind === 'group' || type.valueKind === 'user') {
    const items =
      type.valueKind === 'group'
        ? store.groups.map((g) => ({ value: g.id, label: g.name, meta: `${g.memberCount.toLocaleString()} people` }))
        : store.users.map((u) => ({ value: u.id, label: u.name, meta: u.email }))
    return (
      <>
        {values.filter(Boolean).map((id) => (
          <IfChip
            key={id}
            onClick={() => onChange(values.filter((x) => x !== id))}
            title="Remove"
            ariaLabel={`Remove ${resolve(type.valueKind as 'group' | 'user', id) ?? id}`}
          >
            {resolve(type.valueKind as 'group' | 'user', id) ?? id}
            <X size={9} strokeWidth={2.6} aria-hidden />
          </IfChip>
        ))}
        <Picker
          label={type.label}
          size="sm"
          value={null}
          options={items.filter((i) => !values.includes(i.value))}
          placeholder={values.length ? '+ add' : 'choose…'}
          invalid={values.filter(Boolean).length === 0}
          searchable
          autoOpen={autoOpen}
          onChange={(id) => onChange([...values.filter(Boolean), id])}
          footer={type.valueKind === 'user' && store.unlistedUsers > 0 ? `${store.unlistedUsers.toLocaleString()} more in the directory` : undefined}
        />
      </>
    )
  }

  if (type.options?.length) {
    const picked = values.filter(Boolean)
    return (
      <>
        {picked.map((o) => (
          <IfChip key={o} onClick={() => onChange(values.filter((x) => x !== o))} title="Remove" ariaLabel={`Remove ${o}`}>
            {o}
            <X size={9} strokeWidth={2.6} aria-hidden />
          </IfChip>
        ))}
        <Picker
          label={type.label}
          size="sm"
          value={null}
          options={type.options.filter((o) => !picked.includes(o)).map((o) => ({ value: o, label: o }))}
          placeholder={picked.length ? '+ add' : 'choose…'}
          invalid={picked.length === 0}
          autoOpen={autoOpen}
          onChange={(o) => onChange([...picked, o])}
        />
      </>
    )
  }

  if (type.valueKind === 'time') {
    return (
      <>
        <input type="time" className="bb__ifinput" aria-label="From" value={values[0] ?? '09:00'} onChange={(e) => onChange([e.target.value, values[1] ?? '17:00'])} />
        <IfKw tone="op">to</IfKw>
        <input type="time" className="bb__ifinput" aria-label="To" value={values[1] ?? '17:00'} onChange={(e) => onChange([values[0] ?? '09:00', e.target.value])} />
      </>
    )
  }

  if (type.valueKind === 'range') {
    return (
      <>
        <input type="number" className="bb__ifinput is-num" aria-label={type.label} value={v} placeholder="0" onChange={(e) => onChange([e.target.value])} />
        <IfKw tone="op">{type.id === 'trust-age' ? 'days' : type.id === 'coords' ? 'km' : 'score'}</IfKw>
      </>
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
