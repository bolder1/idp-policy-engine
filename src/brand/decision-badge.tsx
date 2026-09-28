import type { AccessDecision } from './data'
import { CANT_TELL, DECISION_TONE, DECISION_WORDS, decisionsOr } from './decision-words'
import { Badge } from './kit'

/* A decision, as the testing surfaces show one: the kit's own badge, in the
   decision's tone, saying exactly the three words.

   Not `DecisionChip`. That chip prints "Allow / MFA / Deny" and belongs to the
   rule editors until the one copy pass moves them all (decision-words.ts). A
   badge rather than a new pill, so a decision is the same object as every
   other pill in the console — one pill family.

   There is no "Can't tell" badge, on purpose. An unknown result is grey text
   beside or instead of this, and a badge for it would look like a fourth
   decision. */
export function DecisionBadge({ decision, className }: { decision: AccessDecision; className?: string }) {
  return (
    <Badge tone={DECISION_TONE[decision]} className={`bx-decision-badge${className ? ` ${className}` : ''}`}>
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
