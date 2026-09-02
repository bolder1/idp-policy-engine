import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Fingerprint,
  Gauge,
  Globe,
  Info,
  ListFilter,
  MapPin,
  MonitorSmartphone,
  MoreHorizontal,
  Plus,
  Search,
  ShieldAlert,
  Users,
  Webhook,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import { Counter, MenuButton, Tip, TipDot, Toggle, type MenuItem } from '../kit'
import { Picker } from '../picker'
import { cardLetter, ckey, duplicatedAcrossCards, leaves } from '../predicate'
import { predicateParts, type NameLookup } from './predicate-prose'
import {
  CONDITION_CATALOGUE,
  CONDITION_GROUPS,
  card,
  cond,
  conditionType,
  type AccessDecision,
  type Condition,
  type ConditionCard,
  type ConditionType,
  type Policy,
  type Rule,
} from '../data'
import { useBrand, useNameLookup } from '../store'
import { modeLabel } from '../fingerprint'
import { ruleSentence } from './builder-dialogs'
import { impactOf, type Diagnostic } from './diagnostics'
import { SITUATIONS, sweep } from './impact-arena'
import {
  SIM_USERS,
  evalCond,
  type SimContext,
  type SimEnv,
} from './simulate'

/* -----------------------------------------------------------------------------
   The rule form, and the live preview that answers it.

   Pulled out of v4 the moment v5 needed the same form in three different
   layouts. Two implementations of a form this long is two places for the factor
   configuration to drift, and drift in THIS form means two screens disagreeing
   about what a rule does.

   So: v4 gives the form a permanent middle column, v5 hosts it inside an
   expanding step or a fixed inspector, and both are rendering these components.
   The host owns layout, selection and history; this module owns the fields.
   -------------------------------------------------------------------------- */

const GROUP_ICON: Record<string, LucideIcon> = {
  Network: Globe,
  Location: MapPin,
  Device: MonitorSmartphone,
  Risk: Gauge,
  User: Fingerprint,
  Group: Users,
  Time: Clock,
  'Custom attributes': ListFilter,
  Webhooks: Webhook,
}

/* What the catalogue's top level CALLS each component.

   "Device" is the catalogue's internal group name; "Device profiles" is what
   the console's own navigation calls the library those conditions reach into,
   and the brief asks for the major components by the names the product already
   uses for them. */
const GROUP_LABEL: Record<string, string> = {
  Device: 'Device profiles',
  Webhooks: 'External hooks',
  Group: 'Groups',
  User: 'People',
}
/* One feedback triad per condition category. Eight groups, seven distinct tones
   and neutral for the rest — and never `negative`, because red means danger in
   this kit and a network condition is not a danger. */
const GROUP_TONE: Record<string, string> = {
  Network: 'info',
  Location: 'lime',
  Device: 'accent',
  Risk: 'notice',
  User: 'magenta',
  Group: 'positive',
  Time: 'notice',
  'Custom attributes': 'neutral',
  Webhooks: 'neutral',
}

const METHOD_GROUPS = new Set(['Phishing-Resistant', 'Standard MFA', 'Fallback & Recovery'])

/* Two outcomes, not three.

   "Require MFA" was never a third thing that can happen to a sign-in. It is
   Allow with a condition attached — the person still gets in, they are just
   asked for more on the way — and standing it beside Deny as a peer made the
   one genuinely binary decision in the product look like a three-way choice.
   It also hid a rule: Allow and Require MFA shared every control beneath them,
   which you could only discover by picking one.

   So: Allow or Deny, and the second factor is a switch inside Allow.

   The MODEL keeps all three values. `2fa` is still a distinct decision — it is
   what the flow rail tints, what the gauntlet grades and what the review counts
   — and collapsing it would throw that away to tidy a form. Only the
   presentation changes. */
export const OUTCOMES: { id: AccessDecision; label: string; sub: string; icon: LucideIcon }[] = [
  { id: '1fa', label: 'Allow', sub: 'The sign-in goes through', icon: Users },
  { id: 'deny', label: 'Deny', sub: 'The sign-in is refused outright', icon: ShieldAlert },
]

/** Allow covers both allow-flavours; the second-factor switch chooses between them. */
export const allows = (d: AccessDecision) => d !== 'deny'
export const DEC_KEY: Record<AccessDecision, string> = { deny: 'deny', '2fa': 'mfa', '1fa': 'allow' }

/** The console's first-factor catalogue, in its order — same list v1 uses. */
const METHODS = [
  'miniOrange Push',
  'TOTP Authenticator',
  'WebAuthn / FIDO2',
  'SMS / OTP',
  'Email OTP',
  'Hardware Token',
  'Security Questions',
]

/* `audience` is gone: who a policy governs is a policy-level fact now, so
   there is no per-rule section to anchor. */
export const FORM_SECTIONS = [
  { id: 'identity', label: 'Name' },
  { id: 'if', label: 'When it applies' },
  { id: 'then', label: 'What happens' },
  { id: 'checks', label: 'Checks & impact' },
] as const
export type SectionId = (typeof FORM_SECTIONS)[number]['id']

export type RuleState = 'ready' | 'setup' | 'warn'

export function ruleState(diags: Diagnostic[]): RuleState {
  if (diags.some((d) => d.severity === 'error')) return 'setup'
  if (diags.some((d) => d.severity === 'warning')) return 'warn'
  return 'ready'
}

/* `matchMode` is gone, and so is the segmented "All of these / Any of these"
   control it drove.

   That control rewrote EVERY joiner in the rule at once, so flipping it on a
   grouped predicate would silently flatten the brackets somebody had authored.
   There is nothing left for it to do: a card is all-AND by construction, cards
   are alternatives by construction, and neither is a setting. */

/* `seedValues` lived here. It filled a new condition with the first zone, the
   first profile or the first option in its list, so a freshly added row would
   not trip the linter's blank-value error.

   That is backwards: it made "add a condition" mean "add a condition that
   already says something", and it is why the old picker felt like it was
   choosing a zone rather than choosing what to check. A new row now inserts
   unset, shows "Needs a value" in neutral, and opens its own value control. */

export interface PreviewState {
  userId: string
  place: string
  device: string
  authState: string
  risk: string
}

export const DEFAULT_PREVIEW: PreviewState = {
  userId: SIM_USERS[0].id,
  place: 'Office Network',
  device: 'Known < 90 days',
  authState: 'Normal returning user',
  risk: 'Low',
}

/** The context every preview and checklist in a host is answered against. */
export function previewContext(pv: PreviewState): SimContext {
  const now = new Date()
  return {
    user: SIM_USERS.find((u) => u.id === pv.userId) ?? SIM_USERS[0],
    place: pv.place,
    device: pv.device,
    authState: pv.authState,
    risk: pv.risk,
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
  }
}

/* `RuleForm` lived here: the whole rule as one long scrolling form with a
   sticky identity header and its own section numbering. It existed for v5,
   which hosted the same form in three different layouts, and v5 is gone. The
   builder composes the sections itself — a rule holds WhenSection and
   ThenSection directly — so a component whose only job was to stack them in a
   fixed order is one more place for the two to drift apart. */

/* --- A form section -----------------------------------------------------------

   The hint used to be a paragraph under every heading. Five of them accounted
   for a third of the words on the screen and none of them carried data, so they
   are demoted to a Tip on the heading: still one gesture away, no longer
   occupying the form.

   `bare` is for hosts that already supply the heading — the step trail names the
   step it is on, and a second copy of the same title inside it is furniture. */

export function Section({
  id,
  n,
  title,
  hint,
  aside,
  bare,
  children,
}: {
  id: SectionId
  n?: number
  title?: string
  hint?: string
  aside?: React.ReactNode
  bare?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={`bf__sec ${bare ? 'is-bare' : ''}`} id={`sec-${id}`}>
      {!bare && (
        <header>
          {n !== undefined && <span className="bf__secn">{n}</span>}
          <div>
            <h2>
              {title}
              {hint && <TipDot text={hint} />}
            </h2>
          </div>
          {aside}
        </header>
      )}
      {/* Hosted by the trail. The trail's chip is an abbreviation — "When" — so
          the panel still says the whole thing once, with the demoted sentence
          on the dot beside it. */}
      {bare && (
        <div className="bf__secbar">
          <h2>
            {title}
            {hint && <TipDot text={hint} />}
          </h2>
          {aside}
        </div>
      )}
      <div className="bf__secbody">{children}</div>
    </section>
  )
}

/* --- WHEN: the composer ---------------------------------------------------------

   A rule's WHEN is a disjunction of cards: a card holds conditions that are all
   required, and two cards are alternatives. `(location and IP) or (user and
   group)` is two cards, and needs no brackets on screen because the boxes ARE
   the brackets.

   **There is no AND/OR control anywhere.** Inside a card the connective is the
   lowercase word `and`, rendered as static text at every position; between
   cards it is an `OR` pill on a rail, also not a control. That is the fix for
   the old editor, where every row carried a clickable joiner and the model had
   no precedence — so `A AND B OR C` had no defined meaning and the linter had
   to warn about it. Every product that ships this well arrived at the same
   answer: n8n forbids mixed operators outright, Zapier exposes OR only as "add
   an OR group". A mixed run is now unrepresentable rather than discouraged.

   The asymmetry is deliberate and does the teaching: `and` is punctuation and
   costs a small dashed button inside the card, `or` is a full-width commitment
   that opens a new box. Nobody has to be told what they mean.
   -------------------------------------------------------------------------- */

const AND_HINT = 'All of these must be true'

/** A card, addressed by id — never by index, because cards move. */
type CardPatch = (cardId: string, next: ConditionCard | null) => void

export function WhenSection({
  rule,
  ctx,
  onPatch,
  bare,
  n = 2,
  hit,
}: {
  rule: Rule
  ctx: SimContext
  onPatch: (p: Partial<Rule>) => void
  bare?: boolean
  n?: number
  /** Which card the docked tester says is carrying the match, if any. */
  hit?: number | null
}) {
  const store = useBrand()
  const resolve = useNameLookup()
  const [adding, setAdding] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const cards = rule.when.cards
  const setCards = (next: ConditionCard[]) => onPatch({ when: { cards: next } })

  /* Removing the last condition removes the card. That invariant is what makes
     "one card is one unbroken run of ANDs" true, and the linter is built on it —
     an empty card would match everything and silently turn the rule into a
     catch-all. */
  const patchCard: CardPatch = (cardId, next) =>
    setCards(cards.flatMap((k) => (k.id !== cardId ? [k] : next && next.conditions.length > 0 ? [next] : [])))

  const addCondition = (cardId: string, typeId: string) => {
    const t = conditionType(typeId)
    const c = cond(typeId, t.operators[0], [])
    setCards(cards.map((k) => (k.id === cardId ? { ...k, conditions: [...k.conditions, c] } : k)))
    setAdding(null)
    setJustAdded(c.id)
  }

  const addCard = (typeId: string) => {
    const t = conditionType(typeId)
    const c = cond(typeId, t.operators[0], [])
    setCards([...cards, card(c)])
    setAdding(null)
    setJustAdded(c.id)
  }

  /* Split: the move people actually reach for. You discover you need an
     alternative AFTER writing the conditions, not before — Notion's "add to
     advanced filter" on an existing row exists for the same reason. Forcing an
     empty group and a retype is the friction that kills the feature. */
  const splitOut = (cardId: string, conditionId: string) => {
    const from = cards.find((k) => k.id === cardId)
    const moving = from?.conditions.find((c) => c.id === conditionId)
    if (!from || !moving) return
    const rest = from.conditions.filter((c) => c.id !== conditionId)
    const kept = rest.length > 0 ? [{ ...from, conditions: rest }] : []
    setCards([...cards.flatMap((k) => (k.id === cardId ? kept : [k])), card(moving)])
  }

  const moveCondition = (cardId: string, conditionId: string, toCardId: string) => {
    const from = cards.find((k) => k.id === cardId)
    const moving = from?.conditions.find((c) => c.id === conditionId)
    if (!from || !moving || cardId === toCardId) return
    setCards(
      cards.flatMap((k) => {
        if (k.id === cardId) {
          const rest = k.conditions.filter((c) => c.id !== conditionId)
          return rest.length > 0 ? [{ ...k, conditions: rest }] : []
        }
        if (k.id === toCardId) return [{ ...k, conditions: [...k.conditions, moving] }]
        return [k]
      }),
    )
  }

  const mergeUp = (cardId: string) => {
    const i = cards.findIndex((k) => k.id === cardId)
    if (i < 1) return
    const above = cards[i - 1]
    const mine = cards[i]
    /* De-duplicated on merge: two alternatives that both required "in zone HQ"
       would otherwise leave the same condition twice in one card, which the
       linter reports as a duplicate the moment you look away. */
    const have = new Set(above.conditions.map(ckey))
    const merged = { ...above, conditions: [...above.conditions, ...mine.conditions.filter((c) => !have.has(ckey(c)))] }
    setCards(cards.flatMap((k) => (k.id === above.id ? [merged] : k.id === mine.id ? [] : [k])))
  }

  /* Every condition's verdict against the docked tester's context, so a card
     can say whether it is carrying the match. `unknown` is not a pass. */
  const verdicts = useMemo(() => {
    const m = new Map<string, ReturnType<typeof evalCond>>()
    for (const c of leaves(rule.when)) m.set(c.id, evalCond(c, ctx))
    return m
  }, [rule.when, ctx])

  const dupes = duplicatedAcrossCards(rule.when)

  return (
    <Section
      id="if"
      n={n}
      bare={bare}
      title="When it applies"
      hint="Conditions in one box must all be true. Extra boxes are alternatives — any one of them is enough."
    >
      <div className="bf__when">
        {/* The rule read back, always visible and always live. The one place
            the whole predicate is a sentence rather than a set of controls. */}
        <p className="bf__whenread">
          <span className="u-label">This rule matches when</span>
          <Readback rule={rule} resolve={resolve} />
        </p>

        {cards.length === 0 ? (
          <div className="bf__whenempty">
            <p>This rule has no conditions, so it decides every sign-in that reaches it.</p>
            <CatalogueButton
              open={adding === 'first'}
              onToggle={() => setAdding(adding === 'first' ? null : 'first')}
              onPick={addCard}
              label="Add a condition"
              variant="solid"
            />
          </div>
        ) : (
          <ol className="bf__cards">
            {cards.map((k, ci) => (
              <Fragment key={k.id}>
                {ci > 0 && (
                  /* Not a control. The relationship between two alternatives is
                     fixed by the shape, so making it look clickable would be a
                     promise the model cannot keep. */
                  <li className="bf__or" aria-hidden>
                    <span>OR</span>
                  </li>
                )}
                <CardBlock
                  card={k}
                  index={ci}
                  total={cards.length}
                  cards={cards}
                  hit={hit === ci}
                  verdicts={verdicts}
                  dupes={dupes}
                  resolve={resolve}
                  store={store}
                  adding={adding === k.id}
                  onAdding={(v) => setAdding(v ? k.id : null)}
                  justAdded={justAdded}
                  onAddCondition={(typeId) => addCondition(k.id, typeId)}
                  onPatch={patchCard}
                  onSplit={(cid) => splitOut(k.id, cid)}
                  onMove={(cid, to) => moveCondition(k.id, cid, to)}
                  onMergeUp={() => mergeUp(k.id)}
                />
              </Fragment>
            ))}
          </ol>
        )}

        {cards.length > 0 && (
          <CatalogueButton
            open={adding === 'new'}
            onToggle={() => setAdding(adding === 'new' ? null : 'new')}
            onPick={addCard}
            label="Or match a different set"
            variant="or"
          />
        )}

        {/* The cost of a normal form, named rather than engineered around.

            Two alternatives that both require the same condition mean editing
            it twice. The honest answer is to say so and suggest two rules — not
            to add a third container above the cards, which would break the one
            invariant the linter depends on. */}
        {dupes.length > 0 && (
          <p className="bf__dupehint">
            <Info size={13} strokeWidth={1.9} aria-hidden />
            <span>
              {dupes.length === 1 ? 'One condition is' : `${dupes.length} conditions are`} repeated in every
              alternative. If {dupes.length === 1 ? 'it is' : 'they are'} always required, two rules may read better
              than one.
            </span>
          </p>
        )}
      </div>
    </Section>
  )
}

/* --- One alternative ------------------------------------------------------------ */

function CardBlock({
  card: k,
  index,
  total,
  cards,
  hit,
  verdicts,
  dupes,
  resolve,
  store,
  adding,
  onAdding,
  justAdded,
  onAddCondition,
  onPatch,
  onSplit,
  onMove,
  onMergeUp,
}: {
  card: ConditionCard
  index: number
  total: number
  cards: ConditionCard[]
  hit: boolean
  verdicts: Map<string, { state: string; detail: string }>
  dupes: string[]
  resolve: NameLookup
  store: ReturnType<typeof useBrand>
  adding: boolean
  onAdding: (v: boolean) => void
  justAdded: string | null
  onAddCondition: (typeId: string) => void
  onPatch: CardPatch
  onSplit: (conditionId: string) => void
  onMove: (conditionId: string, toCardId: string) => void
  onMergeUp: () => void
}) {
  const set = (conditions: Condition[]) => onPatch(k.id, { ...k, conditions })
  const patchOne = (id: string, p: Partial<Condition>) =>
    set(k.conditions.map((c) => (c.id === id ? { ...c, ...p } : c)))

  const menu: MenuItem[] = [
    { id: 'name', label: k.label ? 'Rename this alternative' : 'Name this alternative' },
    { id: 'merge', label: 'Merge into the alternative above', disabled: index === 0, divide: true },
    { id: 'delete', label: 'Delete this alternative', disabled: total === 1 },
  ]

  return (
    <li className={`bf__card ${hit ? 'is-hit' : ''}`}>
      <div className="bf__cardhead">
        {/* Lettered, never numbered. Cards have no evaluation order — rules do —
            and a number here would imply one. */}
        <span className="bf__cardn" aria-hidden>
          {cardLetter(index)}
        </span>
        <input
          className="bf__cardname"
          aria-label={`Name for alternative ${cardLetter(index)}`}
          placeholder={total > 1 ? 'Name this alternative (optional)' : ''}
          value={k.label ?? ''}
          onChange={(e) => onPatch(k.id, { ...k, label: e.target.value || undefined })}
        />
        <em className="bf__cardcount">{AND_HINT}</em>
        {hit && (
          <span className="bf__cardhit">
            <Check size={11} strokeWidth={3} aria-hidden />
            Matches
          </span>
        )}
        <MenuButton
          label={`Alternative ${cardLetter(index)} actions`}
          iconOnly
          icon={MoreHorizontal}
          size="sm"
          items={menu}
          onSelect={(id) => {
            if (id === 'merge') return onMergeUp()
            if (id === 'delete') return onPatch(k.id, null)
            if (id === 'name') {
              const el = document.querySelector<HTMLInputElement>(
                `[aria-label="Name for alternative ${cardLetter(index)}"]`,
              )
              el?.focus()
            }
          }}
        />
      </div>

      <ol className="bf__cardconds">
        {k.conditions.map((c, i) => (
          <Fragment key={c.id}>
            {i > 0 && (
              /* Punctuation, not an operator anybody chose. No border, no
                 background, no hover, no cursor — and rendered at EVERY
                 position, because it is never editable at any of them, so
                 uniform rendering is the honest one. */
              <li className="bf__and" aria-hidden>
                and
              </li>
            )}
            <ConditionRow
              c={c}
              cardId={k.id}
              cards={cards}
              store={store}
              resolve={resolve}
              verdict={verdicts.get(c.id)}
              duplicated={dupes.includes(ckey(c))}
              autoOpen={justAdded === c.id}
              onPatch={(p) => patchOne(c.id, p)}
              onRemove={() => set(k.conditions.filter((x) => x.id !== c.id))}
              onDuplicate={() => set([...k.conditions, cond(c.typeId, c.operator, [...c.values])])}
              onSplit={() => onSplit(c.id)}
              onMove={(to) => onMove(c.id, to)}
              canSplit={k.conditions.length > 1}
            />
          </Fragment>
        ))}
      </ol>

      {/* Inside the card it appends to. A single button in the section footer
          could not say which alternative it was adding to. */}
      <CatalogueButton open={adding} onToggle={() => onAdding(!adding)} onPick={onAddCondition} label="Add a condition" />
    </li>
  )
}

/* --- One condition -------------------------------------------------------------- */

function ConditionRow({
  c,
  cardId,
  cards,
  store,
  resolve,
  verdict,
  duplicated,
  autoOpen,
  onPatch,
  onRemove,
  onDuplicate,
  onSplit,
  onMove,
  canSplit,
}: {
  c: Condition
  cardId: string
  cards: ConditionCard[]
  store: ReturnType<typeof useBrand>
  resolve: NameLookup
  verdict?: { state: string; detail: string }
  duplicated: boolean
  autoOpen: boolean
  onPatch: (p: Partial<Condition>) => void
  onRemove: () => void
  onDuplicate: () => void
  onSplit: () => void
  onMove: (toCardId: string) => void
  canSplit: boolean
}) {
  const t = conditionType(c.typeId)
  const Ico = GROUP_ICON[t.group] ?? ListFilter
  const unset = c.values.length === 0 || c.values.every((v) => !v.trim())

  /* Every condition type, grouped by major component, so changing a row's field
     never means deleting and re-adding it.

     Sorted into CONDITION_GROUPS order first. The catalogue's own order
     interleaves components — the two risk scores sit between two device
     conditions, and Group Attribute sits after the User block — and `Picker`
     emits a heading whenever the group CHANGES rather than bucketing, so an
     unsorted list prints "Device, Risk, Device" and "Group, User, Group". The
     sort belongs here rather than in the Picker: the caller owns the order, so
     a list somebody deliberately arranged is never silently reshuffled. */
  const fieldOptions = useMemo(() => {
    const rank = (g: string) => {
      const i = (CONDITION_GROUPS as readonly string[]).indexOf(g)
      return i === -1 ? CONDITION_GROUPS.length : i
    }
    return CONDITION_CATALOGUE.filter((x) => !METHOD_GROUPS.has(x.group))
      .slice()
      .sort((a, b) => rank(a.group) - rank(b.group))
      .map((x) => ({ value: x.id, label: x.label, meta: x.hint, group: GROUP_LABEL[x.group] ?? x.group }))
  }, [])

  const menu: MenuItem[] = [
    { id: 'dup', label: 'Duplicate' },
    {
      id: 'split',
      label: 'Split into a new alternative',
      hint: 'These are required together. Split only if this should be an alternative.',
      disabled: !canSplit,
    },
    ...cards
      .filter((k) => k.id !== cardId)
      .map((k, i) => ({ id: `move:${k.id}`, label: `Move to ${k.label?.trim() || `alternative ${cardLetter(i)}`}` })),
    { id: 'remove', label: 'Remove', divide: true },
  ]

  return (
    <li className={`bf__cond ${unset ? 'is-unset' : ''} is-${GROUP_TONE[t.group] ?? 'neutral'} ${verdictClass(verdict)}`}>
      <span className="bf__condicon" aria-hidden>
        <Ico size={13} strokeWidth={1.9} />
      </span>

      <Picker
        label="Condition"
        value={c.typeId}
        options={fieldOptions}
        searchable
        onChange={(typeId) => {
          /* Operators are type-dependent, so carrying the old one over would
             produce a condition the engine cannot evaluate. Values go too —
             "Registered" means nothing to a country test. */
          const next = conditionType(typeId)
          onPatch({ typeId, operator: next.operators[0], values: [] })
        }}
      />

      <Picker
        label={`${t.label} operator`}
        value={c.operator}
        options={t.operators.map((o) => ({ value: o, label: o }))}
        onChange={(operator) => onPatch({ operator })}
      />

      <ValueControl
        type={t}
        values={c.values}
        store={store}
        resolve={resolve}
        autoOpen={autoOpen}
        onChange={(values) => onPatch({ values })}
      />

      <span className="bf__condstate">
        {unset && <span className="bf__condbadge">Needs a value</span>}
        {!unset && duplicated && (
          <Tip text="This exact condition also appears in another alternative." placement="top">
            <span className="bf__conddupe" aria-label="Repeated in another alternative">
              <Copy size={11} strokeWidth={2} aria-hidden />
            </span>
          </Tip>
        )}
      </span>

      <MenuButton
        label={`${t.label} actions`}
        iconOnly
        icon={MoreHorizontal}
        size="sm"
        items={menu}
        onSelect={(id) => {
          if (id === 'dup') return onDuplicate()
          if (id === 'split') return onSplit()
          if (id === 'remove') return onRemove()
          if (id.startsWith('move:')) return onMove(id.slice(5))
        }}
      />
    </li>
  )
}

const verdictClass = (v?: { state: string }) =>
  v?.state === 'pass' ? 'is-pass' : v?.state === 'fail' ? 'is-fail' : ''

/* --- The value ------------------------------------------------------------------ */

/* Library objects are values, not conditions.

   The old picker listed every zone and every fingerprint profile at its top
   level, as if each were its own condition — so the list of things you could
   check grew every time somebody saved a zone, and "Network Zone" as a concept
   never appeared at all. A zone is what you compare against; the condition is
   "Network Zone". The footer is the way back to the library that holds them. */
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
  resolve: NameLookup
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
          : store.hooks
              .filter((h) => h.mode === 'sync')
              .map((h) => ({ value: h.id, label: h.name, meta: `${h.timeoutMs}ms` }))

    const screen =
      type.valueKind === 'zone' ? 'zones' : type.valueKind === 'fingerprint' ? 'fingerprints' : 'hooks'
    const footer =
      type.valueKind === 'zone'
        ? 'Manage zones →'
        : type.valueKind === 'fingerprint'
          ? 'Manage device profiles →'
          : 'Manage hooks →'

    return (
      <span className="bf__val">
        <Picker
          label={type.label}
          value={v}
          options={items}
          width="fill"
          autoOpen={autoOpen}
          onChange={(id) => onChange([id])}
          footer={footer}
          onFooter={() => store.go({ name: screen } as never)}
        />
        {/* A reference to something that has been deleted renders as itself,
            not as a plausible substitute. `groupById` falls back to the first
            group, which is exactly how a stale id comes to read as real. */}
        {v && !items.some((i) => i.value === v) && <span className="bf__valgone">Deleted · {v}</span>}
      </span>
    )
  }

  if (type.valueKind === 'group' || type.valueKind === 'user') {
    const items =
      type.valueKind === 'group'
        ? store.groups.map((g) => ({ value: g.id, label: g.name, meta: `${g.memberCount.toLocaleString()} people` }))
        : store.users.map((u) => ({ value: u.id, label: u.name, meta: u.email }))
    return (
      <span className="bf__val bf__val--chips">
        {values.filter(Boolean).map((id) => (
          <button
            key={id}
            type="button"
            className="bf__vchip is-on"
            onClick={() => onChange(values.filter((x) => x !== id))}
          >
            {resolve(type.valueKind as 'group' | 'user', id) ?? id}
            <X size={10} strokeWidth={2.6} aria-hidden />
          </button>
        ))}
        <Picker
          label={type.label}
          value={null}
          options={items.filter((i) => !values.includes(i.value))}
          placeholder={values.length ? 'Add another…' : 'Choose…'}
          searchable
          autoOpen={autoOpen}
          onChange={(id) => onChange([...values.filter(Boolean), id])}
          footer={type.valueKind === 'user' && store.unlistedUsers > 0 ? `${store.unlistedUsers.toLocaleString()} more in the directory` : undefined}
        />
      </span>
    )
  }

  /* Fixed lists stay chips. `values` has always been an array on the model and
     "Country is India, United Kingdom or Germany" has always been expressible;
     a single select was the control lying about it. */
  if (type.options?.length) {
    return (
      <span className="bf__val bf__val--chips" role="group" aria-label={type.label}>
        {type.options.map((o) => {
          const on = values.includes(o)
          return (
            <button
              key={o}
              type="button"
              className={`bf__vchip ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onChange(on ? values.filter((x) => x !== o) : [...values.filter(Boolean), o])}
            >
              {o}
            </button>
          )
        })}
      </span>
    )
  }

  if (type.valueKind === 'time') {
    return (
      <span className="bf__val bf__val--time">
        <input
          type="time"
          aria-label="From"
          value={values[0] ?? '09:00'}
          onChange={(e) => onChange([e.target.value, values[1] ?? '17:00'])}
        />
        <em>to</em>
        <input
          type="time"
          aria-label="To"
          value={values[1] ?? '17:00'}
          onChange={(e) => onChange([values[0] ?? '09:00', e.target.value])}
        />
      </span>
    )
  }

  if (type.valueKind === 'range') {
    return (
      <span className="bf__val bf__val--range">
        <input
          type="number"
          aria-label={type.label}
          value={v}
          placeholder="0"
          onChange={(e) => onChange([e.target.value])}
        />
        <em>{type.id === 'trust-age' ? 'days' : type.id === 'coords' ? 'km' : 'score'}</em>
      </span>
    )
  }

  return (
    <span className="bf__val">
      <input aria-label={type.label} placeholder="Enter a value…" value={v} onChange={(e) => onChange([e.target.value])} />
    </span>
  )
}

/* --- The readback --------------------------------------------------------------- */

/* The same sentence `predicateSentence` produces, rendered as elements so the
   brackets and the `or` can carry the structure visually. One renderer feeds
   both — the review dialog promises in-product that the sentence and the rule
   cannot disagree, and two implementations is one chance for that to be false. */
function Readback({ rule, resolve }: { rule: Rule; resolve: NameLookup }) {
  const parts = predicateParts(rule.when, resolve)
  if (parts.length === 0) return <em className="bf__readany">any sign-in that reaches it</em>

  return (
    <span className="bf__readexpr">
      {parts.map((k, i) => (
        <Fragment key={k.id}>
          {i > 0 && <b className="bf__reador">or</b>}
          <span className="bf__readcard">
            {parts.length > 1 && <i aria-hidden>(</i>}
            {k.label && <u>{k.label}:</u>}
            {k.clauses.map((cl, j) => (
              <Fragment key={cl.id}>
                {j > 0 && <b className="bf__readand">and</b>}
                <span data-node-id={cl.id}>{cl.text}</span>
              </Fragment>
            ))}
            {parts.length > 1 && <i aria-hidden>)</i>}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

/* --- The catalogue -------------------------------------------------------------- */

/* Nine major components at the top level, and the types inside each one behind
   them. Zones, device profiles and hook endpoints are NOT here — they are
   values, reached from the row's value control, which is where the brief's
   "showcase the major option, not what is inside" lands. */
function CatalogueButton({
  open,
  onToggle,
  onPick,
  label,
  variant = 'dashed',
}: {
  open: boolean
  onToggle: () => void
  onPick: (typeId: string) => void
  label: string
  variant?: 'dashed' | 'solid' | 'or'
}) {
  return (
    <div className={`bf__addwrap is-${variant}`}>
      <button type="button" className={`bf__add is-${variant} ${open ? 'is-open' : ''}`} onClick={onToggle}>
        {open ? <X size={13} strokeWidth={2.4} aria-hidden /> : <Plus size={13} strokeWidth={2.4} aria-hidden />}
        {open ? 'Cancel' : label}
      </button>
      <AnimatePresence>{open && <Catalogue onPick={onPick} onClose={onToggle} />}</AnimatePresence>
    </div>
  )
}

/** Five fully-valued inserts, so the fast path survives the two-click walk. */
const COMMON: { id: string; label: string; typeId: string }[] = [
  { id: 'offnet', label: 'Off the corporate network', typeId: 'zone' },
  { id: 'unreg', label: 'Unregistered device', typeId: 'device-reg' },
  { id: 'risk', label: 'High ML risk', typeId: 'ml-risk' },
  { id: 'hours', label: 'Outside working hours', typeId: 'time' },
  { id: 'contractor', label: 'Contractors', typeId: 'user-type' },
]

function Catalogue({ onPick, onClose }: { onPick: (typeId: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<string>(CONDITION_GROUPS[0])
  const el = useRef<HTMLDivElement | null>(null)

  /* It opens inline under the card that summoned it and is about 380px tall, so
     pressed from anywhere below the fold it expands entirely off-screen — the
     button appears to do nothing. Waits for the open animation so it scrolls to
     the real height rather than to zero. */
  useEffect(() => {
    const t = window.setTimeout(() => el.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 220)
    return () => window.clearTimeout(t)
  }, [])

  const inGroup = useMemo(
    () => (g: string) => CONDITION_CATALOGUE.filter((c) => !METHOD_GROUPS.has(c.group) && c.group === g),
    [],
  )

  const hits = useMemo(() => {
    if (!q) return null
    const n = q.toLowerCase()
    return CONDITION_CATALOGUE.filter(
      (c) =>
        !METHOD_GROUPS.has(c.group) &&
        (c.label.toLowerCase().includes(n) || c.hint.toLowerCase().includes(n) || c.id.includes(n)),
    )
  }, [q])

  return (
    <motion.div
      ref={el}
      className="bf__cat"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
    >
      <div className="bf__catbar">
        <Search size={14} strokeWidth={2} aria-hidden />
        <input
          autoFocus
          aria-label="Search conditions"
          placeholder="Search conditions…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
      </div>

      {hits ? (
        <div className="bf__catitems is-flat">
          {hits.length === 0 ? (
            <p className="bf__catempty">
              No condition matches “{q}”.
              <button type="button" onClick={() => setQ('')}>
                Clear
              </button>
            </p>
          ) : (
            hits.map((c) => <CatalogueItem key={c.id} c={c} onPick={onPick} />)
          )}
        </div>
      ) : (
        <>
          <div className="bf__catcommon">
            <span className="u-label">Common</span>
            {COMMON.map((s) => (
              <button key={s.id} type="button" onClick={() => onPick(s.typeId)}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="bf__catsplit">
            <ul className="bf__catgroups" role="tablist" aria-label="Condition categories">
              {CONDITION_GROUPS.map((g) => {
                const Ico = GROUP_ICON[g] ?? ListFilter
                const n = inGroup(g).length
                if (n === 0) return null
                return (
                  <li key={g}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={group === g}
                      className={group === g ? 'is-on' : ''}
                      onClick={() => setGroup(g)}
                      onMouseEnter={() => setGroup(g)}
                    >
                      <span className={`bf__cationic is-${GROUP_TONE[g] ?? 'neutral'}`} aria-hidden>
                        <Ico size={13} strokeWidth={1.8} />
                      </span>
                      {GROUP_LABEL[g] ?? g}
                      <em>{n}</em>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="bf__catitems">
              {inGroup(group).map((c) => (
                <CatalogueItem key={c.id} c={c} onPick={onPick} />
              ))}
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}

const LIBRARY_KINDS = new Set(['zone', 'fingerprint', 'hook'])

function CatalogueItem({ c, onPick }: { c: ConditionType; onPick: (typeId: string) => void }) {
  return (
    <button type="button" className="bf__catitem" onClick={() => onPick(c.id)}>
      <span>
        <strong>{c.label}</strong>
        <em>{c.hint}</em>
      </span>
      {/* The statement that this is a major component whose contents live
          elsewhere: you pick the condition here and the specific zone on the
          row. */}
      {LIBRARY_KINDS.has(c.valueKind) && <span className="bf__catlib">from your library</span>}
    </button>
  )
}

/* --- THEN: the outcome, and everything behind it -------------------------------- */

export function ThenSection({
  rule,
  onPatch,
  bare,
  n = 4,
}: {
  rule: Rule
  onPatch: (p: Partial<Rule>) => void
  bare?: boolean
  n?: number
}) {
  const chain = rule.methodChain ?? ['TOTP Authenticator']

  /* Which allow-flavour this rule was last on, so Deny -> Allow restores "second
     factor required" instead of silently downgrading the rule to one factor. */
  const lastAllow = useRef<AccessDecision>(rule.decision === 'deny' ? '1fa' : rule.decision)
  if (rule.decision !== 'deny') lastAllow.current = rule.decision

  return (
    <Section
      id="then"
      n={n}
      bare={bare}
      title="What happens"
      hint="The decision, and the authentication it asks for. Evaluation stops here — nothing below this rule runs for anyone it matched."
    >
      <>
        <div className="bf__outs">
          {OUTCOMES.map((o) => {
            const Ico = o.icon
            const on = o.id === 'deny' ? rule.decision === 'deny' : allows(rule.decision)
            /* Allow keeps the tint of the flavour it is actually on, so the
               tile agrees with the rule's number in the flow rail and with its
               chip in the list. */
            const tone = o.id === 'deny' ? 'deny' : DEC_KEY[allows(rule.decision) ? rule.decision : '1fa']
            return (
              <button
                key={o.id}
                type="button"
                className={`bf__out is-${tone} ${on ? 'is-on' : ''}`}
                aria-pressed={on}
                onClick={() => onPatch({ decision: o.id === 'deny' ? 'deny' : (lastAllow.current ?? '1fa') })}
              >
                <Ico size={17} strokeWidth={1.9} aria-hidden />
                <strong>{o.label}</strong>
                <em>{o.sub}</em>
              </button>
            )
          })}
        </div>

        <AnimatePresence initial={false}>
          {rule.decision === 'deny' ? (
            <motion.p key="deny" className="bf__denynote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Blocked users see an access-denied page. No prompt, no alternate path. The ML engine may escalate other
              decisions on behavioural signals, but a Deny here is final.
            </motion.p>
          ) : (
            <motion.div
              key="factors"
              className="bf__factors"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            >
              {/* The second factor, as a switch rather than as a tile.

                  Above First factor because it is the larger decision: this
                  changes what the rule DOES, where First factor only changes
                  how the thing it already does is performed. */}
              <Prop label="Second factor">
                <label className="bf__switchrow">
                  <Toggle
                    checked={rule.decision === '2fa'}
                    onChange={(v) => onPatch({ decision: v ? '2fa' : '1fa' })}
                    label="Require a second factor"
                    size="sm"
                  />
                  <span>
                    {rule.decision === '2fa'
                      ? 'A second factor is required before access'
                      : 'The first factor alone is enough'}
                  </span>
                </label>
              </Prop>

              <Prop label="First factor">
                <div className="bf__seg">
                  {(['Password', 'Any', 'Specific'] as const).map((f) => (
                    <button key={f} type="button" className={rule.firstFactor === f ? 'is-on' : ''} aria-pressed={rule.firstFactor === f} onClick={() => onPatch({ firstFactor: f })}>
                      {f}
                    </button>
                  ))}
                </div>
              </Prop>

              {rule.firstFactor === 'Specific' && (
                <Prop label="Method" sub>
                  <select aria-label="First-factor method" value={rule.firstFactorMethod ?? METHODS[0]} onChange={(e) => onPatch({ firstFactorMethod: e.target.value })}>
                    {METHODS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Prop>
              )}

              {rule.decision === '2fa' && (
                <Prop label="Which" sub>
                  <Picker
                    label="Second factor method"
                    width="fill"
                    value={rule.secondFactor}
                    options={[
                      { value: 'any', label: 'Any enabled method' },
                      { value: 'specific', label: 'Specific method(s)' },
                      { value: 'chain', label: 'Method chain', meta: 'Every step, in order' },
                      { value: 'preferred', label: 'The user’s preferred method' },
                    ]}
                    onChange={(v) => onPatch({ secondFactor: v as Rule['secondFactor'] })}
                  />
                </Prop>
              )}

              {rule.decision === '2fa' && rule.secondFactor === 'specific' && (
                <Prop label="Allowed" sub>
                  <div className="bf__val bf__val--chips" role="group" aria-label="Allowed second-factor methods">
                    {METHODS.map((m) => {
                      const on = (rule.secondFactorMethods ?? []).includes(m)
                      return (
                        <button
                          key={m}
                          type="button"
                          className={`bf__vchip ${on ? 'is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => {
                            const cur = rule.secondFactorMethods ?? []
                            onPatch({ secondFactorMethods: on ? cur.filter((x) => x !== m) : [...cur, m] })
                          }}
                        >
                          {m}
                        </button>
                      )
                    })}
                  </div>
                </Prop>
              )}

              {rule.decision === '2fa' && rule.secondFactor === 'specific' && (rule.secondFactorMethods ?? []).length === 0 && (
                <p className="bf__factorwarn">
                  <XCircle size={13} strokeWidth={2} aria-hidden />
                  Nothing is selected, so there is no method any user could complete. This rule cannot be satisfied.
                </p>
              )}

              {rule.decision === '2fa' && rule.secondFactor === 'chain' && (
                <Prop label="In order" sub>
                  <div className="bf__chain">
                    {chain.map((step, si) => (
                      <span className="bf__chainstep" key={si}>
                        <b>{si + 1}</b>
                        <select
                          aria-label={`Chain step ${si + 1}`}
                          value={step}
                          onChange={(e) => {
                            const next = [...chain]
                            next[si] = e.target.value
                            onPatch({ methodChain: next })
                          }}
                        >
                          {['Password', ...METHODS].map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={chain.length === 1}
                          aria-label={`Remove step ${si + 1}`}
                          onClick={() => onPatch({ methodChain: chain.filter((_, n) => n !== si) })}
                        >
                          <X size={12} strokeWidth={2.2} />
                        </button>
                      </span>
                    ))}
                    <button type="button" className="bf__chainadd" onClick={() => onPatch({ methodChain: [...chain, 'miniOrange Push'] })}>
                      <Plus size={12} strokeWidth={2.4} /> Add step
                    </button>
                    <p className="bf__chainsum">{chain.join(' → ')} — every step required, in this order.</p>
                  </div>
                </Prop>
              )}

              {rule.decision === '2fa' && rule.secondFactor === 'preferred' && (
                <Prop label="Fallback" sub>
                  <select aria-label="Fallback method" value={rule.preferredFallback ?? METHODS[0]} onChange={(e) => onPatch({ preferredFallback: e.target.value })}>
                    {METHODS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Prop>
              )}

              {rule.decision === '2fa' && (
                <Prop label="Remember device">
                  <label className="bf__switchrow">
                    <Toggle checked={rule.rememberMfa} onChange={(v) => onPatch({ rememberMfa: v })} label="Remember this device" size="sm" />
                    <span>Skip the second factor on a device that already passed</span>
                  </label>
                </Prop>
              )}

              {rule.decision === '2fa' && rule.rememberMfa && (
                <>
                  <Prop label="For" sub>
                    <span className="bf__val bf__val--range">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        aria-label="Days to remember"
                        value={rule.rememberDays ?? 30}
                        onChange={(e) => onPatch({ rememberDays: Number(e.target.value) || 30 })}
                      />
                      <em>days</em>
                    </span>
                  </Prop>
                  <Prop label="Override" sub>
                    <label className="bf__switchrow">
                      <Toggle
                        checked={rule.forceMfaEachLogin ?? false}
                        onChange={(v) => onPatch({ forceMfaEachLogin: v })}
                        label="Force MFA on every login"
                        size="sm"
                      />
                      <span>Prompt every time anyway, remembered device or not</span>
                    </label>
                  </Prop>
                </>
              )}

              {rule.decision === '2fa' && (
                <Prop label="End users">
                  <label className="bf__switchrow">
                    <Toggle checked={rule.allowDisable2fa} onChange={(v) => onPatch({ allowDisable2fa: v })} label="Allow users to disable 2FA" size="sm" />
                    <span>Let users switch their own second factor off</span>
                  </label>
                </Prop>
              )}

              {rule.allowDisable2fa && rule.decision === '2fa' && (
                <p className="bf__factorwarn is-warn">
                  <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                  This rule requires a second factor and also lets users turn theirs off. Anyone who does is no longer
                  covered by it.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    </Section>
  )
}

/** A Figma-style property row: label at a fixed measure, control beside it. */
function Prop({ label, sub, children }: { label: string; sub?: boolean; children: React.ReactNode }) {
  return (
    <div className={`bf__prop ${sub ? 'is-sub' : ''}`}>
      <span className="bf__proplabel">{label}</span>
      <div className="bf__propctl">{children}</div>
    </div>
  )
}

/* --- Checks & impact ------------------------------------------------------------ */

const SEVERITY_ICON = { error: XCircle, warning: AlertTriangle, info: Info }

export function ChecksSection({
  policy,
  index,
  env,
  diagnostics,
  onJump,
  bare,
  n = 5,
}: {
  policy: Policy
  index: number
  env: SimEnv
  diagnostics: Diagnostic[]
  onJump: (i: number) => void
  bare?: boolean
  n?: number
}) {
  const store = useBrand()
  const resolve = useNameLookup()
  const impact = impactOf(policy, index, store.groups, undefined, store.users)

  /* The reach number is swept, not estimated.

     `impactOf().matches` reads `matchEstimate`, which is seed data that never
     recomputes — honest enough beside a rule you are reading, and not honest
     enough beside a rule you are about to publish. The sweep answers the same
     question exactly over a space it can state: how many of the 1,440 modelled
     situations does THIS rule actually win, first-match and all.

     The two numbers in this row are deliberately in different units and say so.
     The audience is people and is exact. The reach is situations and is exact
     over the model. Presenting situations as people would be the same fake
     precision in a new costume. */
  const swept = useMemo(() => sweep(policy, env, 570), [policy, env])
  const reach = swept.reach[index] ?? 0
  const share = Math.round((reach / swept.total) * 100)
  const rule = policy.rules[index]
  const { iff, then } = ruleSentence(rule, resolve)

  return (
    <Section id="checks" n={n} bare={bare} title="Checks &amp; impact">
      <>
        <div className="bf__prose">
          <p>
            <span>IF</span> {iff}
          </p>
          <p>
            <span>THEN</span> {then}
          </p>
        </div>

        <div className="bf__impact">
          <div>
            <strong>
              <Counter value={impact.audience} />
            </strong>
            <em>
              people in the audience <b className="bf__basis is-exact">exact</b>
            </em>
          </div>
          <div className={reach === 0 && policy.rules[index].enabled ? 'is-empty' : ''}>
            <strong>
              <Counter value={reach} />
            </strong>
            <em>
              {reach === 0 && policy.rules[index].enabled ? (
                <>
                  modelled situations reach it — nothing gets this far{' '}
                  <b className="bf__basis is-stale">check this</b>
                </>
              ) : (
                <>
                  of {SITUATIONS.length.toLocaleString()} modelled situations, {share}%{' '}
                  <b className="bf__basis is-exact">exact</b>
                </>
              )}
            </em>
          </div>
          <div>
            {impact.fallsTo ? (
              <>
                <strong className="bf__falls">
                  <button type="button" onClick={() => onJump(impact.fallsTo!.index)}>
                    Rule {impact.fallsTo.index + 1} · {impact.fallsTo.name}
                  </button>
                </strong>
                <em>takes over if this rule stops matching</em>
              </>
            ) : (
              <>
                <strong>Default rule</strong>
                <em>takes over if this rule stops matching</em>
              </>
            )}
          </div>
        </div>

        {diagnostics.length === 0 ? (
          <p className="bf__clean">
            <Check size={13} strokeWidth={3} aria-hidden />
            Nothing the linter can prove wrong about this rule.
          </p>
        ) : (
          <ul className="bf__diags">
            {diagnostics.map((d) => {
              const Ico = SEVERITY_ICON[d.severity]
              return (
                <li key={d.id} className={`is-${d.severity}`}>
                  <Ico size={14} strokeWidth={2} aria-hidden />
                  <span>
                    <strong>{d.title}</strong>
                    {d.detail}
                    {d.relatedIndex !== undefined && (
                      <button type="button" className="bf__diaggo" onClick={() => onJump(d.relatedIndex!)}>
                        Open rule {d.relatedIndex + 1} →
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </>
    </Section>
  )
}

/* `PreviewPanel` and `PvAxis` lived here: the standing "what would this do"
   panel that used to take turns with two others behind an icon in the top
   right. The tester is docked under the work now — always on, one line, and
   still the only writer of the preview context every condition is evaluated
   against — so the panel form of it had no remaining host.

   `PREVIEW_CAVEAT` stays: the docked tester carries the same footnote, and it
   is the sentence that keeps the whole simulation honest. */

export const PREVIEW_CAVEAT =
  'Heuristic, not the engine — the context here maps to condition values through a fixed table. The order and the first-match stop are real.'
