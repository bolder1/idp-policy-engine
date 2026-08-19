import {
  BadgeCheck,
  Clock,
  Fingerprint,
  Globe,
  Maximize2,
  Network,
  Plus,
  Sparkles,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

import { Button, DecisionChip, Modal } from '../kit'
import type { AccessDecision } from '../data'
import { useBrand } from '../store'

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
  meta: string
  /** A dated, attributable review — deliberately not a rating. */
  reviewed?: { by: string; on: string }
}

/** "2026-01" → "Jan 2026". Always the real date, never "recently" — an old
    review date is the informative case, so it is not softened. */
function monthOf(iso: string) {
  const [y, m] = iso.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[Number(m) - 1] ?? ''} ${y}`.trim()
}

const DEC_WORD: Record<AccessDecision, string> = { deny: 'Deny', '2fa': 'MFA', '1fa': 'Allow' }
const DEC_KEY: Record<AccessDecision, string> = { deny: 'deny', '2fa': 'mfa', '1fa': 'allow' }

/** Strictest outcome present — used by the readout and the preview dialog. */
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
  const art = useBrand().features.templateHero
  const shown = m.rules.slice(0, shownCount(m.rules.length))
  const rest = m.rules.length - shown.length
  const post = posture(m.rules)

  return (
    <article className={`bgcard ${art ? '' : 'is-flat'}`}>
      {/* The illustration is the live preview: the template's rules drawn as
          the builder would order them, plus the control that expands them.
          Withheld in lite, where a template is chosen from its name and its
          description — which is v0's "Start from a scenario". The badge is
          metadata rather than illustration, so it survives on its own. */}
      {art && (
      <div className="bgcard__canvas">
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
      )}

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
        {/* The signals-and-author line is gone. The signals were already stated
            by the rules in the thumbnail above, and an author with a relative
            date told you who last touched the file, not whether the template is
            any good. A dated review claim is the one fact here that does — so
            it stays, and cards without one simply lead with the action. */}
        <span className="bgcard__meta">
          {m.reviewed && (
            <span className="bgcard__reviewed" title={`Last reviewed ${monthOf(m.reviewed.on)}`}>
              <BadgeCheck size={13} strokeWidth={1.9} aria-hidden />
              Reviewed {monthOf(m.reviewed.on)}
            </span>
          )}
        </span>
        <button type="button" className="bgcard__cta" onClick={onUse}>
          {useLabel}
        </button>
      </footer>
    </article>
  )
}

/** The blank card keeps the same skeleton so it sits in the grid, not beside it. */
export function BlankTemplateCard({ onUse }: { onUse: () => void }) {
  return (
    <article className="bgcard bgcard--blank">
      <div className="bgcard__canvas">
        <ol className="bgcard__stack">
          <li>
            <span className="bgcard__mrow bgcard__mrow--ghost">
              <span className="bgcard__mn" aria-hidden>
                <Plus size={12} strokeWidth={2.2} />
              </span>
              <span className="bgcard__mname">Your first rule</span>
            </span>
          </li>
          <li>
            <span className="bgcard__mrow bgcard__mrow--ghost" />
          </li>
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
        <p className="bgcard__readout">
          <span className="bgcard__rlabel">Empty</span>
          <span className="bgcard__rtext">every sign-in is allowed until you add a rule</span>
        </p>
      </div>

      <div className="bgcard__body">
        <h3 className="bgcard__h">Start from scratch</h3>
        <p className="bgcard__sub">
          An empty policy. Pick this when none of the templates match what you are protecting.
        </p>
      </div>

      <footer className="bgcard__foot">
        <span className="bgcard__meta">No rules yet</span>
        <button type="button" className="bgcard__cta" onClick={onUse}>
          Start blank
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
      width={540}
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
