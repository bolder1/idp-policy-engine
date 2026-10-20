import type { AccessDecision } from './data'
import { CANT_TELL, DECISION_BADGE_TONE, DECISION_ICON, DECISION_WORDS, decisionsOr } from './decision-words'
import { Badge } from './kit'

/* A decision as a mark alone: its icon on a round of its tone — 1 factor on the positive tint, 2FA on the deeper
   green, Deny on the negative — or grey, `muted`, where it is history rather than news (Guided setup's lines and
   tiles, guided-setup.css `.bx-dmark`). Decorative: the words beside it say the decision. */
export function DecisionMark({ decision, size = 'md', muted = false }: { decision: AccessDecision; size?: 'xs' | 'sm' | 'md'; muted?: boolean }) {
  const Icon = DECISION_ICON[decision]
  const px = size === 'md' ? 14 : size === 'sm' ? 12 : 10
  return (
    <span className={`bx-dmark is-${DECISION_BADGE_TONE[decision]} is-${size}${muted ? ' is-muted' : ''}`} aria-hidden>
      <Icon size={px} strokeWidth={2.2} />
    </span>
  )
}

/* A decision, as the testing surfaces show one: the kit's own badge, in the
   decision's tone, saying exactly the three words.

   Not `DecisionChip`. That chip prints "Allow / MFA / Deny" and belongs to the
   rule editors until the one copy pass moves them all (decision-words.ts). A
   badge rather than a new pill, so a decision is the same object as every
   other pill in the console — one pill family.

   There is no "Can't tell" badge, on purpose. An unknown result is grey text
   beside or instead of this, and a badge for it would look like a fourth
   decision.

   `muted` draws it grey, the kit's neutral badge (20 Oct 2026, Check access's merged Policy card): a rule that did not
   decide still says what it does, and the colour stays on the row that did. Opt-in; every other badge is as it was. */
export function DecisionBadge({ decision, className, muted = false }: { decision: AccessDecision; className?: string; muted?: boolean }) {
  return (
    <Badge tone={muted ? 'neutral' : DECISION_BADGE_TONE[decision]} className={`bx-decision-badge${className ? ` ${className}` : ''}`}>
      {DECISION_WORDS[decision]}
    </Badge>
  )
}

/* The answer when the facts reach more than one decision: grey text, in
   `--text-tertiary`, never a badge and never a pass. With the decisions it
   could be — "Allow on 1 factor or Deny", in the order given — beside it, or
   under it where a table cell is narrow. */
export function CantTell({
  outcomes,
  stacked = false,
  className,
}: {
  outcomes?: readonly AccessDecision[]
  stacked?: boolean
  className?: string
}) {
  const or = outcomes && outcomes.length > 0 ? decisionsOr(outcomes) : null
  return (
    <span className={`bx-canttell${stacked ? ' is-stacked' : ''}${className ? ` ${className}` : ''}`}>
      <span className="bx-canttell__word">{CANT_TELL}</span>
      {or && <span className="bx-canttell__or">{or}</span>}
    </span>
  )
}
