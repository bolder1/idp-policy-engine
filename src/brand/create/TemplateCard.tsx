import {
  Check,
  ClipboardCheck,
  Clock,
  CopyPlus,
  Fingerprint,
  Gauge,
  Globe,
  Laptop,
  ListFilter,
  type LucideIcon,
  Network,
  ShieldCheck,
  Tag,
  Trash2,
  Users,
  Webhook,
} from 'lucide-react'
import { useState } from 'react'

import { Badge, Button, DecisionChip, Modal, RowMenu } from '../kit'
import { conditionType, type AccessDecision, type Rule, type Scenario } from '../data'
import { leaves } from '../predicate'
import { narrowToAudience, withoutMissing, type TemplateLibrary, type TemplateNeed } from '../screens/board/apply-template'
import { whoSentence } from '../screens/predicate-prose'
import { hasWho, type WhoDirectory } from '../rule-who'
import { SHOWCASE } from '../showcase'

import { CardPicture } from './CardPicture'
import { AppLogo } from '../logos/AppLogo'
import { TEMPLATE_CATEGORIES } from '../template-phase'
import { usePills } from '../source-pills'

/* -----------------------------------------------------------------------------
   The template card, shared by the create gallery and the Templates library.

   The face used to be a tinted panel with an icon in the middle of it. Six
   decorative hues and a glyph told you which family the template belonged to,
   which is the one thing the heading underneath already said. It cost 150px to
   repeat a word.

   So the face is now a thumbnail of the thing itself: the rule stack, drawn the
   way the builder's canvas draws it — numbered, in order, each with the outcome
   it lands on. That is what you are actually choosing between, and it is legible
   at a glance across a grid, which is exactly the case a Figma file thumbnail is
   built for.

   Green and red stay reserved for the decisions, on the white rows. Since 2 Nov
   2026 the canvas behind them takes the shelf's retro colour, the builder's start
   cards' look (tokens.css `--tpl-*`), and the shelf names itself in a corner tab.

   The thumbnail is inert on purpose. It briefly had hoverable rows that read
   their condition into a strip below, which put a second interactive layer
   inside a card that is already one big target — you could not point anywhere
   on the face without something reacting. A thumbnail's job is to be looked at.
   Everything you might want to do to it lives in the preview dialog, one click
   away and always visible.
   -------------------------------------------------------------------------- */

export interface CardRule {
  name: string
  ifText: string
  decision: AccessDecision
  /** People the rule reaches. Optional — the library's templates have no estimate. */
  reach?: number
  /** Who the rule is for — "Contractors". Absent for everyone, or when `ifText` already says it. */
  who?: string
}

export interface CardModel {
  id: string
  name: string
  description: string
  rules: CardRule[]
  /** Condition groups the rules read — "Device", "Network", … */
  signals: string[]
  badge?: string
  /* Which shelf the template sits on — "Device-based", "Compliance".

     A plain `string`, deliberately, not `Scenario['category']`: the Templates
     library builds this same model from `Template`, whose category union has a
     fifth member (`'Uncategorized'`), and typing it narrowly here breaks that
     caller at compile time for no gain. The hue map falls back to neutral for
     anything it does not recognise. */
  category?: string
  /** The type of a card with no category, as a shelf's key: a tenant's own policy, in the reuse picker, takes the shelf its
      rules are most like (TemplateSheet `policyKind`), and with it that shelf's colour and picture. */
  tone?: string
  meta: string
  /** The applications a tenant's own policy is on (the reuse picker), drawn as logos under its name. */
  apps?: { id: string; name: string }[]
  /** Rules left out because they apply to nobody. Their rows are not in `rules`. */
  dropped?: string[]
  /** Library kinds the template names that this tenant does not have. */
  needs?: TemplateNeed[]
  /** Where a tenant's own copy came from: "Xecurify templates", on one added from the store. */
  from?: string
}

const NEED_LABEL: Record<TemplateNeed, string> = { zone: 'Needs a network zone', fingerprint: 'Needs a device profile' }

/* What stands between this template and using it, as tinted pills. */
function CardNotes({ m }: { m: CardModel }) {
  const dropped = m.dropped ?? []
  const needs = m.needs ?? []
  const empty = m.rules.length === 0
  if (!empty && dropped.length === 0 && needs.length === 0) return null
  return (
    <span className="bgcard__notes" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
      {empty ? (
        /* A template saved from a policy with no rules has nothing to apply either. */
        <Badge tone="notice">{dropped.length > 0 ? 'No rules apply' : 'No rules'}</Badge>
      ) : (
        dropped.length > 0 && (
          <span title={`Not included: ${dropped.join(', ')}`}>
            <Badge tone="notice">{dropped.length === 1 ? '1 rule left out' : `${dropped.length} rules left out`}</Badge>
          </span>
        )
      )}
      {needs.map((n) => (
        <Badge key={n} tone="notice">
          {NEED_LABEL[n]}
        </Badge>
      ))}
    </span>
  )
}

/** A policy's applications: "Used by", then one logo with its name, or the logos alone (on the card and in its preview). */
export function UsedBy({ apps }: { apps: { id: string; name: string }[] }) {
  return (
    <p className="bgcard__apps">
      <span className="bgcard__appslabel">Used by</span>
      {apps.length === 1 ? (
        <span className="bgcard__app">
          <AppLogo appId={apps[0].id} name={apps[0].name} size={18} />
          <span>{apps[0].name}</span>
        </span>
      ) : (
        <span className="bgcard__applogos">
          {apps.slice(0, 6).map((a) => (
            <span key={a.id} title={a.name}>
              <AppLogo appId={a.id} name={a.name} size={18} />
            </span>
          ))}
          {apps.length > 6 && <span className="bgcard__appsmore">+{apps.length - 6}</span>}
        </span>
      )}
    </p>
  )
}

/* `monthOf` stood here — "2026-01" into "Jan 2026", for the review line in the
   card's footer. Both are gone; the seed data still carries the dates. */

const DEC_WORD: Record<AccessDecision, string> = { deny: 'Deny', '2fa': 'MFA', '1fa': 'Allow' }
const DEC_KEY: Record<AccessDecision, string> = { deny: 'deny', '2fa': 'mfa', '1fa': 'allow' }

/* Strictest outcome present — used by the readout and the preview dialog.

   The `flag` rung between `2fa` and the bare allow is gone with the outcome it
   summarised. */
export function posture(rules: CardRule[]): 'deny' | 'mfa' | 'allow' | 'none' {
  if (rules.length === 0) return 'none'
  if (rules.some((r) => r.decision === 'deny')) return 'deny'
  if (rules.some((r) => r.decision === '2fa')) return 'mfa'
  return 'allow'
}

const POSTURE_WORD = { deny: 'Deny', mfa: 'MFA', allow: 'Allow', none: '—' } as const

/* --- The signal row ------------------------------------------------------------
   Apollo puts a row of small round glyphs at the top of every workflow card, one
   per kind of step the workflow contains. It works because it answers the
   question you actually have while scanning a gallery — not "what is this
   called" but "what does it need from me" — and it answers it in a shape the eye
   reads without stopping.

   Ours carries the condition groups the template's rules read, which is the same
   question in this product: a template that needs a Network zone is one you
   cannot use until you have made one. The labels are already derived from the
   built rules, so the row cannot drift from what the template does. */

const SIGNAL_ICON: Record<string, LucideIcon> = {
  Network: Network,
  Location: Globe,
  Device: Fingerprint,
  Identity: Users,
  Time: Clock,
  Attributes: ListFilter,
  External: Webhook,
  Everyone: Users,
}

/* One tone per signal so the row is scannable rather than seven grey circles.
   Tokens only — these are the same feedback hues the conditions use in the
   builder, so a Network glyph here is the colour a Network row is there. */
const SIGNAL_TONE: Record<string, string> = {
  Network: 'info',
  Location: 'lime',
  Device: 'accent',
  Identity: 'magenta',
  Time: 'notice',
  Attributes: 'neutral',
  External: 'neutral',
  Everyone: 'neutral',
}

/* Category to hue, and the reasoning is about what each hue ALREADY means here.

   Green, amber and red are reserved product-wide for Allow, MFA and Deny —
   stated at the top of this file and enforced by `DecisionChip` — which leaves
   exactly four non-decision families for exactly four categories. Two of the
   four assign themselves:

   · Device-based -> accent. `Device` is already accent in the board's
     `GROUP_TONE` and in `SIGNAL_TONE` below, and every Device-based template
     carries the `Device` tag. The pill and the signal chip say one word in one
     colour.
   · Compliance -> magenta, which is Identity. All three Compliance templates
     are about WHO — contractors, regulated data, lifecycle.

   The other two are the cheap moves. Risk-based takes info (blue) because
   tokens.css argues for blue in exactly these terms where it defines the
   priority ramp: it is the one hue in the palette with no valence, so it reads
   as magnitude, which is what risk is. Quick Protection takes lime, which is
   green-adjacent and reads "start here" — 62 degrees off Allow's green, and a
   curation shelf has no condition group of its own to contradict.

   Anything unrecognised — the library's `'Uncategorized'` — falls to neutral
   rather than picking a hue at random.

   2 Nov 2026: the four keys now name the retro set instead (owner: "same retro
   colour family"): terracotta, faded teal, ochre and plum, in that order. */
const CAT_KEY: Record<string, string> = {
  'Quick Protection': 'quick',
  'Device-based': 'device',
  'Risk-based': 'risk',
  Compliance: 'compliance',
}
export const catKey = (c: string) => CAT_KEY[c] ?? 'neutral'

/* A card's icon when its picture is off (card-hero.ts): one per shelf, on a tile in the shelf's colour. A policy to
   reuse takes the one its rules are most like, as its picture does. */
const HUE_ICON: Record<string, LucideIcon> = {
  quick: ShieldCheck,
  device: Laptop,
  risk: Gauge,
  compliance: ClipboardCheck,
  reuse: CopyPlus,
  neutral: ShieldCheck,
}

function SignalRow({ signals }: { signals: string[] }) {
  return (
    <span className="bgcard__signals">
      {signals.map((sig) => {
        const Ico = SIGNAL_ICON[sig] ?? Tag
        return (
          <span key={sig} className={`bgcard__sig is-${SIGNAL_TONE[sig] ?? 'neutral'}`} title={`Reads ${sig}`}>
            <Ico size={13} strokeWidth={1.9} aria-hidden />
            <em>{sig}</em>
          </span>
        )
      })}
    </span>
  )
}

/* The thumbnail holds four rows at a size the grid can still scan, and the
   fall-through always takes the last one. So three rules fit exactly; beyond
   that the third row becomes the overflow count rather than a fourth rule
   appearing and pushing the stack past the canvas floor. */
const CAP = 3
const shownCount = (n: number) => (n > CAP ? CAP - 1 : n)

export function TemplateCard({
  m,
  onUse,
  onPreview,
  onDelete,
  useLabel = 'Use',
  done,
  fallback = '1fa',
  compact = false,
}: {
  m: CardModel
  /** Omitted where the template cannot be used yet: the card shows no control. */
  onUse?: () => void
  onPreview: () => void
  /** Only on this tenant's own templates, which it may take away; a template Xecurify ships has no menu. */
  onDelete?: () => void
  useLabel?: string
  /** The store: what has been done with it already ("Added"), said where the button was. */
  done?: string
  /** What the policy's own default decides. The template does not change it. */
  fallback?: AccessDecision
  /** No picture: the card is its icon, its words and its button (the Copy a policy popup, with Pictures off). */
  compact?: boolean
}) {
  const shown = m.rules.slice(0, shownCount(m.rules.length))
  const rest = m.rules.length - shown.length
  const post = posture(m.rules)
  /* One button where there were two (owner, 2 Nov 2026: "combine both … a single button for both, a big button in one
     row"): the eye on the picture and Use beside the name were two doors to the same choice. It opens the preview, which
     has the rules in full and the template's own Use. Once the store's card is added, it only previews. */
  const offer = !done && !!onUse && m.rules.length > 0
  const verb = offer ? `Preview and ${useLabel.toLowerCase()}` : 'Preview'
  /* A policy of the tenant's own, in the reuse picker, has no colour (owner, 3 Nov 2026: "remove the colours from reuse"). */
  const hue = m.category ? catKey(m.category) : 'neutral'
  /* The pointer or the keyboard on the card: its picture plays its use while it is. */
  const [hot, setHot] = useState(false)
  /* Xecurify's own templates are drawn (CardPicture.tsx); a policy of the tenant's is shown by its rules. */
  const pictured = !!m.category
  /* The category tab: with the categories, or while Alt+T has the pills showing (source-pills.ts). */
  const pills = usePills()

  return (
    /* The shelf's colour, on the whole card (owner, 2 Nov 2026: "make it colourful … same retro colour family"):
       create.css reads it for the tab's words and the canvas's wash on hover ("simple as it used to be, and on hover add
       this colour"). A card with no shelf takes its tone. */
    <article
      className={`bgcard is-cat-${hue}${compact ? ' is-bare' : ''}`}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
    >
      {/* The shelf, cut out of the card's top-left corner (owner, 2 Nov 2026: "remove the border from this section so it
          looks like a cut out"): on the card rather than in the canvas, so it can cover the card's own edge there. */}
      {(TEMPLATE_CATEGORIES || pills) && m.category && <span className={`bgcard__cat is-${catKey(m.category)}`}>{m.category}</span>}
      {/* The illustration is the live preview: the template's rules drawn as
          the builder would order them, plus the control that expands them.

          It used to be withheld in the lite edition, on the reasoning that a
          template chosen from its name and its description is v0's behaviour.
          That gate is gone, and it was the wrong kind of gap: the thumbnail is
          a DRAWING of the template's own rules — the same fact the card states
          in words, in the shape the builder will draw it — not a capability
          anybody is paying for. All it withheld was the ability to see what you
          were choosing, and it took the preview dialog with it, because the
          only control that opens the preview lives inside this block. */}
      {/* The picture and the words, in a column, or side by side once the card is wide (create.css, a container query):
          a card alone in its row (owner, 2 Nov 2026: "auto adaptable … single, double or max 3 in a row"). */}
      <div className="bgcard__in">
      <div className={`bgcard__canvas${pictured ? ' is-picture' : ''}`}>
        {/* A generic picture of the shelf (card-hero.ts, the Pictures version); the template's rules are in the preview. */}
        {pictured ? (
          <CardPicture hue={hue} hot={hot} />
        ) : (
        <>
        {/* The thumbnail: the rule stack as the builder draws it, in order. */}
        <ol className="bgcard__stack">
          {shown.map((r, i) => (
            <li key={`${i}-${r.name}`}>
              <span className="bgcard__mrow">
                <span className="bgcard__mn" aria-hidden>
                  {i + 1}
                </span>
                <span className="bgcard__mname">{r.name}</span>
                <span className={`bgcard__mdec is-${DEC_KEY[r.decision]}`}>{DEC_WORD[r.decision]}</span>
              </span>
            </li>
          ))}

          {rest > 0 && (
            <li>
              <span className="bgcard__mrow bgcard__mrow--rest">
                <span className="bgcard__mn" aria-hidden>
                  +
                </span>
                <span className="bgcard__mname">
                  {rest} more rule{rest === 1 ? '' : 's'}
                </span>
              </span>
            </li>
          )}

          {/* The fall-through. Not part of the template: it is the policy's
              own default, so it shows what that default decides. */}
          <li>
            <span className="bgcard__mrow bgcard__mrow--default">
              <span className="bgcard__mn" aria-hidden>
                ⌄
              </span>
              <span className="bgcard__mname">Everyone else</span>
              <span className={`bgcard__mdec is-${DEC_KEY[fallback]}`}>{DEC_WORD[fallback]}</span>
            </span>
          </li>
        </ol>

        {/* The caption under the thumbnail — the two facts the stack cannot
            state for itself once it is truncated. */}
        <p className="bgcard__readout">
          <span className="bgcard__rlabel">
            {m.rules.length} rule{m.rules.length === 1 ? '' : 's'}
          </span>
          <span className="bgcard__rtext">strictest outcome is {POSTURE_WORD[post]}</span>
        </p>
        </>
        )}
      </div>

      <div className="bgcard__body">
        {/* Pictures off: the card's icon on a tile, in place of the picture above it. */}
        {compact && (
          <div className="bgcard__top">
            <span className="bgcard__icon" aria-hidden>
              {(() => {
                const Ico = HUE_ICON[hue] ?? Tag
                return <Ico size={18} strokeWidth={1.9} />
              })()}
            </span>
          </div>
        )}
        {/* Signals first, then the labels, then the words — Apollo's order, and
            it is the right one: the glyph row is read at a glance across the
            grid, the heading only once the glyphs have narrowed the field. */}
        <SignalRow signals={m.signals} />

        <span className="bgcard__tags">
          {m.badge && <span className="bgcard__tag is-cat">{m.badge}</span>}
          <span className={`bgcard__tag is-${post}`}>{POSTURE_WORD[post]}</span>
          <span className="bgcard__tag is-count">
            {m.rules.length} rule{m.rules.length === 1 ? '' : 's'}
          </span>
        </span>

        {/* The name, truncated, so it keeps its title. No icon beside it (owner, 3 Nov 2026: "remove this icon from here"):
            the picture above already says what the template is about. */}
        <div className="bgcard__head">
          <h3 className="bgcard__h" title={m.name}>
            {m.name}
          </h3>
          {/* The template's own door to being taken away (owner, 27 Oct 2026: the template audit). A tenant could save
              one and never remove it. Only its own; the confirm is the shared one. */}
          {onDelete && (
            <RowMenu
              label={`More for ${m.name}`}
              items={[{ id: 'delete', label: 'Delete template', icon: Trash2, danger: true }]}
              onSelect={() => onDelete()}
            />
          )}
        </div>
        {/* A policy's applications as their logos (owner, 2 Nov 2026: "showcase logos here … for a single one, logo with
            name; more than one, logos only"), after "Used by", the console's word for what a thing is on. A policy on
            none keeps its line of words. */}
        {m.apps && m.apps.length > 0 ? <UsedBy apps={m.apps} /> : <p className="bgcard__sub">{m.description}</p>}
        <CardNotes m={m} />
        {/* The card's one button, the width of the card, on the card's floor so a grid row's buttons line up. Its name
            says which template it opens. */}
        <div className="bgcard__go">
          {done && (
            <span className="bgcard__done">
              <Check size={14} strokeWidth={2.2} aria-hidden />
              {done}
            </span>
          )}
          <button type="button" className={`bgcard__cta${offer ? '' : ' is-quiet'}`} onClick={onPreview} aria-label={`${verb} ${m.name}`}>
            {verb}
          </button>
        </div>
      </div>
      </div>
    </article>
  )
}

/* The full stack, with the conditions written out.

   Deliberately the same drawing as the card face — dotted canvas, numbered
   nodes, dashed fall-through — so opening a template reads as zooming into the
   thumbnail rather than arriving somewhere new. The thumbnail truncates and
   drops the conditions; this is the same object with nothing left out.

   The fall-through row is the part that earns its place. A template is a list
   of exceptions, and what happens to everyone who is *not* an exception is the
   thing a list of rules never says out loud. */
export function TemplatePreview({
  m,
  onClose,
  onUse,
  useLabel = 'Use this template',
  fallback = '1fa',
}: {
  m: CardModel | null
  onClose: () => void
  onUse?: () => void
  useLabel?: string
  /** What the policy's own default decides. The template does not change it. */
  fallback?: AccessDecision
}) {
  const canUse = !!onUse && !!m && m.rules.length > 0
  return (
    <Modal
      open={m !== null}
      onClose={onClose}
      title={m?.name ?? ''}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {canUse && (
            <Button variant="brand" onClick={onUse}>
              {useLabel}
            </Button>
          )}
        </>
      }
    >
      {m && (
        <>
          <p className="bprev__sub">{m.description}</p>

          <dl className="bprev__facts">
            <div>
              <dt>Rules</dt>
              <dd>{m.rules.length}</dd>
            </div>
            <div>
              <dt>Reads</dt>
              <dd>{m.signals.length ? m.signals.join(', ') : 'Nothing'}</dd>
            </div>
            <div>
              <dt>Strictest outcome</dt>
              <dd>{POSTURE_WORD[posture(m.rules)]}</dd>
            </div>
            {m.from && (
              <div>
                <dt>From</dt>
                <dd>{m.from}</dd>
              </div>
            )}
          </dl>

          {(m.dropped?.length ?? 0) > 0 && (
            <p className="bprev__note">Not included: {m.dropped!.join(', ')}. These rules apply to nobody.</p>
          )}
          {m.rules.length === 0 && (m.dropped?.length ?? 0) === 0 && <p className="bprev__note">This template has no rules.</p>}
          {(m.needs ?? []).map((n) => (
            <p key={n} className="bprev__note">
              {n === 'zone' ? 'Needs a network zone. Add one, then choose it in the rule.' : 'Needs a device profile. Add one, then choose it in the rule.'}
            </p>
          ))}

          {/* No line on how the list is read, and none under it on the last row (23 Oct 2026, the popups pass: no
              sentences explaining the UI). The numbered stack is the order, and the last row is drawn apart. */}
          <ol className="bprev__stack">
            {m.rules.map((r, i) => (
              <li key={`${i}-${r.name}`} className="bprev__node">
                <span className="bprev__n">{i + 1}</span>
                <span className="bprev__body">
                  <strong>{r.name}</strong>
                  {r.who && (
                    <span>
                      <i>Who</i> {r.who}
                    </span>
                  )}
                  {/* A one-line rule already opens with its who ("For Executives,
                      any sign-in"), and IF in front of that would misread. */}
                  <span>
                    {r.ifText.startsWith('For ') ? r.ifText : <><i>If</i> {r.ifText}</>}
                  </span>
                </span>
                <span className="bprev__right">
                  <DecisionChip decision={r.decision} size="sm" />
                  {r.reach !== undefined && <em>{r.reach.toLocaleString()} users</em>}
                </span>
              </li>
            ))}

            <li className="bprev__node bprev__node--default">
              <span className="bprev__n" aria-hidden>
                ⌄
              </span>
              <span className="bprev__body">
                <strong>Everyone else</strong>
                <span>Nothing above matched</span>
              </span>
              <span className="bprev__right">
                <DecisionChip decision={fallback} size="sm" />
              </span>
            </li>
          </ol>
        </>
      )}
    </Modal>
  )
}

/* --- A scenario, in the shape this card renders --------------------------------

   It lived in CreatePolicy.tsx, which was a `lazy()` route. Anything importing
   it dragged the create page's whole chunk — the gallery, the marketplace sheet
   and a lazy reference to the guided build since retired — into the importing
   bundle. It belongs beside `CardModel`, which is its return type and lives
   here, so the picker can have it without the page.
   -------------------------------------------------------------------------- */

/* One row of the preview: the who apart from the IF.

   `ifText` is written copy, and a one-line rule opens with its who — "For
   Executives, any sign-in". When that opening names exactly the built rule's
   who, it is lifted out onto its own line; when it names someone else (a
   renamed group), the text is left whole and no second who is printed. */
function cardRule(spec: Scenario['rules'][number], rule: Rule | null): CardRule {
  const base = { name: spec.name, ifText: spec.ifText, decision: spec.decision, reach: rule?.matchEstimate }
  const who = rule ? whoSentence(rule.who) : null
  if (!who) return base
  const lead = `For ${who}, `
  if (spec.ifText.startsWith(lead)) {
    const rest = spec.ifText.slice(lead.length)
    return { ...base, who, ifText: rest.charAt(0).toUpperCase() + rest.slice(1) }
  }
  return spec.ifText.startsWith('For ') ? base : { ...base, who }
}

/** Condition groups, said the way an admin would say them. */
const SIGNAL_OF: Record<string, string> = {
  Network: 'Network',
  Location: 'Location',
  Time: 'Time',
  Device: 'Device',
  'Custom attributes': 'Attributes',
  Webhooks: 'External',
}

export function scenarioCard(s: Scenario, directory?: WhoDirectory, library?: TemplateLibrary): CardModel {
  /* The rules as applying the template builds them, audience included, so a
     contractors-only template shows Identity rather than Everyone. Built one
     spec at a time, so each row keeps its written copy. A rule that applies to
     nobody is left out here exactly as applying leaves it out, and named in
     `dropped`; the directory is the one applying uses, so the two agree. */
  const pairs = s.rules.map((spec) => ({ spec, rule: narrowToAudience(spec.build(), s.audience, directory) }))
  const kept = pairs.flatMap((p) => (p.rule ? [{ spec: p.spec, rule: p.rule }] : []))
  const dropped = pairs.flatMap((p) => (p.rule ? [] : [p.spec.name]))
  const needs: TemplateNeed[] = []
  const built = kept.map(({ rule }) => {
    if (!library) return rule
    const checked = withoutMissing(rule, library)
    for (const n of checked.needs) if (!needs.includes(n)) needs.push(n)
    return checked.rule
  })

  const signals: string[] = []
  const add = (label: string) => {
    if (!signals.includes(label)) signals.push(label)
  }
  for (const r of built) {
    /* Who is the rule's own field now, never a condition in its cards. */
    if (hasWho(r.who)) add('Identity')
    for (const c of leaves(r.when)) add(SIGNAL_OF[conditionType(c.typeId).group] ?? 'Other')
  }

  const reach = built.reduce((n, r) => Math.max(n, r.matchEstimate), 0)

  return {
    id: s.id,
    name: s.name,
    description: s.description,
    /* Internal requirement-set codes ("SIB/HRS") are not customer copy; the
       showcase build drops the code and keeps the rest ("Recommended for
       SIB/HRS" → "Recommended"; a badge that was only the code goes). */
    badge: SHOWCASE ? s.badge?.replace(/\s*(?:for\s+)?SIB\/HRS$/, '') || undefined : s.badge,
    category: s.category,
    // A template with no conditions applies to everyone, which is worth saying.
    signals: signals.length > 0 ? signals : ['Everyone'],
    /* "~340 people" not "340 people". matchEstimate is seed data that never
       recomputes, and the builder's impact panel already labels the same figure
       an estimate — the card was the one place stating it as a bare fact. */
    meta: s.provided ? `~${reach.toLocaleString()} people` : `${s.author} · ${s.when}`,
    rules: kept.map(({ spec, rule }) => cardRule(spec, rule)),
    dropped,
    needs,
    from: !s.provided && s.addedFrom ? 'Xecurify templates' : undefined,
  }
}
