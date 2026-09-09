import {
  Clock,
  Fingerprint,
  Globe,
  Maximize2,
  Network,
  Sparkles,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

import { Button, DecisionChip, Modal } from '../kit'
import { conditionType, type AccessDecision, type Scenario } from '../data'
import { leaves } from '../predicate'

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

   Colour survives in one place only: the decision. Green, amber and red are
   reserved for Allow, MFA and Deny across the whole product, and nothing on this
   card competes with them any more.

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
  meta: string
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
  Attributes: Sparkles,
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
   rather than picking a hue at random. */
const CAT_KEY: Record<string, string> = {
  'Quick Protection': 'quick',
  'Device-based': 'device',
  'Risk-based': 'risk',
  Compliance: 'compliance',
}
export const catKey = (c: string) => CAT_KEY[c] ?? 'neutral'

function SignalRow({ signals }: { signals: string[] }) {
  return (
    <span className="bgcard__signals">
      {signals.map((sig) => {
        const Ico = SIGNAL_ICON[sig] ?? Sparkles
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
  useLabel = 'Use template',
}: {
  m: CardModel
  onUse: () => void
  onPreview: () => void
  useLabel?: string
}) {
  const shown = m.rules.slice(0, shownCount(m.rules.length))
  const rest = m.rules.length - shown.length
  const post = posture(m.rules)

  return (
    <article className="bgcard">
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
      <div className="bgcard__canvas">
        {/* The shelf this template is on, in the shelf's own colour.

            Top-left of the thumbnail, mirroring the preview control top-right —
            the canvas already reserves 32px there, and its comment has called
            that "room for the badge" since before there was anything to put in
            it.

            NOT in `.bgcard__tags` with the other metadata: that row and
            `.bgcard__signals` are both `display: none` on request, because
            eight chips above a card's name made it lead with its taxonomy. One
            chip, on the picture rather than over the name, is the version of
            that idea somebody actually asked for. */}
        {m.category && (
          <span className={`bgcard__cat is-${catKey(m.category)}`}>{m.category}</span>
        )}
        <button
          type="button"
          className="bgcard__peek"
          onClick={onPreview}
          aria-label={`Preview the rules in ${m.name}`}
          title="Preview rules"
        >
          <Maximize2 size={13} strokeWidth={1.9} aria-hidden />
        </button>

        {/* The thumbnail: the rule stack as the builder draws it, in order. */}
        <ol className="bgcard__stack">
          {shown.map((r, i) => (
            <li key={r.name}>
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

          {/* The fall-through. Drawn dashed because it is not part of the
              template — it is what the engine does when nothing above matched. */}
          <li>
            <span className="bgcard__mrow bgcard__mrow--default">
              <span className="bgcard__mn" aria-hidden>
                ⌄
              </span>
              <span className="bgcard__mname">Everyone else</span>
              <span className="bgcard__mdec is-allow">Allow</span>
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
      </div>

      <div className="bgcard__body">
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

        {/* Truncated to one line, so the full name has to stay reachable. */}
        <h3 className="bgcard__h" title={m.name}>
          {m.name}
        </h3>
        <p className="bgcard__sub">{m.description}</p>
      </div>

      <footer className="bgcard__foot">
        {/* One control, and nothing beside it.

            This row has now lost three things in turn: a signal-and-author line
            (the signals were already drawn by the rules in the thumbnail above),
            then the author itself (who last touched the file is not whether the
            template is any good), and now the dated review claim — which was the
            one fact here that DID speak to quality, and still lost, because it
            was a second thing to read on a row whose job is to be pressed.

            `Scenario.reviewed` and `Template.reviewed` are still seeded in
            data.ts with the reasoning for a dated attribution over a rating. The
            model no longer carries it; if it is ever wanted again, that is where
            it comes from. */}
        <button type="button" className="bgcard__cta" onClick={onUse}>
          {useLabel}
        </button>
      </footer>
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
}: {
  m: CardModel | null
  onClose: () => void
  onUse: () => void
  useLabel?: string
}) {
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
          <Button variant="brand" onClick={onUse}>
            {useLabel}
          </Button>
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
          </dl>

          <p className="bprev__note">
            Evaluated top to bottom. The first rule that matches decides the sign-in, and the rest
            are skipped.
          </p>

          <ol className="bprev__stack">
            {m.rules.map((r, i) => (
              <li key={r.name} className="bprev__node">
                <span className="bprev__n">{i + 1}</span>
                <span className="bprev__body">
                  <strong>{r.name}</strong>
                  <span>
                    <i>IF</i> {r.ifText}
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
                <DecisionChip decision="1fa" size="sm" />
              </span>
            </li>
          </ol>

          <p className="bprev__foot">
            The last row is not part of the template — it is what the engine already does when no
            rule matches. You can change it after the policy is created.
          </p>
        </>
      )}
    </Modal>
  )
}

/* --- A scenario, in the shape this card renders --------------------------------

   It lived in CreatePolicy.tsx, which was a `lazy()` route. Anything importing
   it dragged the create page's whole chunk — the gallery, the marketplace sheet
   and a `lazy(() => import('./Interview'))` reference — into the importing
   bundle. It belongs beside `CardModel`, which is its return type and lives
   here, so the picker can have it without the page.
   -------------------------------------------------------------------------- */

/** Condition groups, said the way an admin would say them. */
const SIGNAL_OF: Record<string, string> = {
  Network: 'Network',
  Location: 'Location',
  Time: 'Time',
  Device: 'Device',
  User: 'Identity',
  Group: 'Identity',
  'Custom attributes': 'Attributes',
  Webhooks: 'External',
}

export function scenarioCard(s: Scenario): CardModel {
  const built = s.rules.map((r) => r.build())

  const signals: string[] = []
  for (const r of built)
    for (const c of leaves(r.when)) {
      const label = SIGNAL_OF[conditionType(c.typeId).group] ?? 'Other'
      if (!signals.includes(label)) signals.push(label)
    }

  const reach = built.reduce((n, r) => Math.max(n, r.matchEstimate), 0)

  return {
    id: s.id,
    name: s.name,
    description: s.description,
    badge: s.badge,
    category: s.category,
    // A template with no conditions applies to everyone, which is worth saying.
    signals: signals.length > 0 ? signals : ['Everyone'],
    /* "~340 people" not "340 people". matchEstimate is seed data that never
       recomputes, and the builder's impact panel already labels the same figure
       an estimate — the card was the one place stating it as a bare fact. */
    meta: s.provided ? `~${reach.toLocaleString()} people` : `${s.author} · ${s.when}`,
    rules: s.rules.map((r, i) => ({ ...r, reach: built[i].matchEstimate })),
  }
}
