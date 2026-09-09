import type { AccessDecision, Rule } from '../../data'
import type { SimContext, TraceResult } from '../simulate'

/* -----------------------------------------------------------------------------
   The board's own vocabulary — the few types every part of it shares.

   Kept out of the components so the inspector, the stage and the tabs can all
   agree on what "selected" means without importing each other.
   -------------------------------------------------------------------------- */

/** What the inspector is looking at. The start node selects the policy. */
/* What the inspector is looking at.

   By id, not by index, and that difference is two bugs rather than a
   preference. A position is only meaningful against one particular ordering of
   one particular list, and both of those move underneath it: reordering rules
   left the selection pointing at whatever had taken that slot — so dragging
   rule 1 to the bottom swapped the panel onto rule 2 without anybody asking —
   and undo could shorten the list past the stored index, leaving the header
   naming a rule that no longer existed.

   An id needs no arithmetic. It survives reordering because it travels with
   the rule, and when the rule goes the id resolves to nothing, which is
   already the "show the library" case.

   The PART rides here too, and it is worth saying why it is not a `useState`
   in the Inspector instead.

   Which third of a rule you are editing is not a fact about the panel; it is
   half of what you clicked. Pressing Condition on rule 3 names a rule AND a
   question in one gesture, and the two have to travel together or they come
   apart in the four places that already move a selection without the panel's
   help: ↑/↓ walks to the next rule, "Open rule 5" arrives from the sheet, the
   palette jumps, and a delete clears. Worse, the panel is UNMOUNTED whenever
   it has no subject, so any state it owned about which part is open would be
   destroyed by ⌘\ and rebuilt from a default — the panel would forget where
   you were every time you hid it to read the chain.

   It is also the only place the CARD can read it from. The card draws the open
   part as a ring on one of its three buttons, and the card is not inside the
   panel.

   Beside the `kind`, never inside it. `kind: 'rule-who' | 'rule-when' |
   'rule-then'` would fold a second question into the discriminator that
   already answers identity, and force every `kind === 'rule'` test in the
   builder to widen with it — which is how a discriminator stops
   discriminating.

   And on the `rule` member ONLY. The default at the bottom has no Who and no
   If: the evaluator reads `p.fallback?.decision` and nothing else, yet
   `fallbackRule()` goes through `rule()` and carries a real `Predicate` that
   `whoEditable` would accept. A Who form mounted against it would cheerfully
   write `group in […]` into a predicate no evaluator, linter, gauntlet or
   sweep will ever read — precisely the invisible gate `Rule.appliesTo` was
   deleted to prevent. Making the fallback partless is not a hidden button; it
   is a value that cannot be spelt. */
export type Selection = { kind: 'none' } | { kind: 'rule'; id: string; part: Part } | { kind: 'fallback' }

/* The three questions a rule answers, in the order it is written.

   The union is derived from the tuple rather than declared beside it, so the
   type and the ordered list cannot drift — `nextPart` steps through the same
   array the panel and the card render from.

   `'when'`, not `'condition'`: the model field is `rule.when`, the writer is
   `when-ops.ts`, the editor is `WhenEditor`. There are already three names for
   that one thing and a fourth id would be exactly the drift this file's
   comments spend their life undoing. The SCREEN says Condition — see
   `PART_LABEL` in `parts.ts`. Ids follow the model; labels follow the person.

   TWO, not three. `'then'` was a pane of its own for exactly as long as it took
   to use: the outcome is the second half of the sentence the condition starts,
   and splitting them made you change panes mid-thought to answer "when this
   happens, do that". They share a pane again — which is what they had before
   the split, and the split's one good idea, that WHO is a different question,
   survives it. */
export const PARTS = ['who', 'when'] as const
export type Part = (typeof PARTS)[number]

/* The one constructor, so the default part is written down once.

   Navigation lands on Who — a new rule, the palette's "Go to rule 3", a click
   on the card body — because a rule is written starting from a person, which
   is the argument the inspector already records. A FINDING names its own part
   at its own call site; see CheckTab and ImpactTab. */
export const ruleAt = (id: string, part: Part = 'who'): Selection => ({ kind: 'rule', id, part })

/* Step to the next or previous part, wrapping.

   Wrapping rather than clamping, because `[` and `]` are the only route
   between parts on the keyboard and a `]` on Then that does nothing is a key
   that appears broken. The card's three buttons are peers on one row and read
   as a ring; ↑/↓ on the chain clamps instead, because a chain has ends and a
   rule before rule 1 does not exist. */
export const nextPart = (p: Part, dir: -1 | 1): Part => PARTS[(PARTS.indexOf(p) + dir + PARTS.length) % PARTS.length]

/* The sheet's two tabs.

   `'rule'` used to be a third. It meant "show the rule pane in the sheet", from
   before the inspector was a pane of its own — and it outlived that: five call
   sites still asked for it, and `BoardSheet` has only ever rendered check and
   impact, so each one flipped the sheet to Impact with NEITHER tab marked
   selected. The panel is where a rule is read now, and jumping to one closes
   the sheet rather than switching it. */
export type Tab = 'check' | 'impact'

/* One rehearsed sign-in, and where it landed.

   `runId` changes on every run so the stage can replay the cascade for the
   same context twice — a person who presses "Try again" to watch it a second
   time should get a second time. */
export interface Trace {
  ctx: SimContext
  result: TraceResult
  runId: number
}

/* How a decision is named on this surface.

   The model's labels count factors — "1 factor", "2 factors". These name what
   the person signing in experiences, which is the thing an administrator is
   actually choosing between. The MODEL keeps its three values untouched. */
export const DECISION_NAME: Record<AccessDecision, string> = {
  '1fa': 'Let in',
  '2fa': 'Let in, then verify',
  /* "and flag it", not "and warn them". The person signing in may well see a
     notice, but that is the client's business; what the RULE does is raise the
     event, and an administrator choosing this outcome is choosing to be told.
     Naming it after the notice would make the audit trail sound optional. */
  warn: 'Let in, and flag it',
  deny: 'Deny',
}

export const DECISION_SHORT: Record<AccessDecision, string> = {
  '1fa': 'Let in',
  '2fa': 'Verify',
  warn: 'Flag',
  deny: 'Deny',
}

/* Tone class suffix for a decision — shared with the flow rail's colours.

   Two things about the fourth one, and neither is arbitrary.

   It is called `flag`, not `warn`, even though the decision it draws is
   `warn`. `is-warn` is already a class in this console and it means something
   else everywhere it appears — a breadcrumb with a problem, a readiness row
   that failed, a coverage stat worth looking at. `Coverage.tsx` alone would
   have carried both senses, one on `.bcov__stat` and one on
   `.bcov__statvalue`. A tone that shares a name with the console's word for
   "something is wrong here" would be read as exactly that, on a card whose
   whole point is that nothing is wrong — the sign-in went through.

   And it takes the INFO ramp rather than notice. Notice is amber, amber reads
   as caution, and caution is arguably what this outcome is — but amber is
   already spent on `2fa`, and two outcomes in one colour on a board whose job
   is showing which sign-in falls where is worse than a colour one step off the
   feeling. Blue is what the kit already uses for "recorded, look at it later",
   which is the literal content of this decision. */
export const TONE: Record<AccessDecision, 'allow' | 'mfa' | 'flag' | 'deny'> = { '1fa': 'allow', '2fa': 'mfa', warn: 'flag', deny: 'deny' }

/* The journey a rule produces, as steps a person walks.

   One renderer now: the card, via IfBlock. The inspector drew this too, from
   this same function, and the two were on screen together every time the panel
   was open — the panel only opens beside the stage. The panel's copy went, and
   the card's is the one that was always visible.

   Worth saying because the sameness used to be the point of this comment: with
   two renderers, `sub` could be dropped by one of them and still reach the
   screen from the other, which is exactly what had happened. There is nowhere
   to fall back to now, so every field here has to be drawn where it is read. */
export interface JourneyStep {
  id: string
  label: string
  /** The qualification on a step — "or TOTP", "for 30 days", "cannot be completed". */
  sub?: string
  kind: 'first' | 'second' | 'remember' | 'flag' | 'end' | 'stop'
}

export function journeyOf(rule: Rule): JourneyStep[] {
  if (rule.decision === 'deny') return [{ id: 'stop', label: 'Refused', sub: 'No prompt, no way round', kind: 'stop' }]

  const first: JourneyStep = {
    id: 'first',
    label: rule.firstFactor === 'Specific' ? (rule.firstFactorMethod ?? 'A chosen method') : rule.firstFactor === 'Any' ? 'Any first factor' : 'Password',
    kind: 'first',
  }
  const out: JourneyStep[] = [first]

  /* The flag is a step, not a footnote.

     It could have been a `sub` on "Signed in" — the person does get signed in,
     and nothing else about their journey changes. But the journey on the card
     is read to answer "what does this rule DO", and the whole of what this rule
     does that `1fa` does not is this. A qualification hung off the last step
     would put the entire difference between two outcomes in the smallest type
     on the card. */
  if (rule.decision === 'warn') {
    out.push({ id: 'flag', label: 'Raised for review', sub: 'signed in, and recorded', kind: 'flag' })
  }

  if (rule.decision === '2fa') {
    const methods = rule.secondFactorMethods ?? []
    const chain = rule.methodChain ?? []
    const second: JourneyStep =
      rule.secondFactor === 'specific'
        ? {
            id: 'second',
            label: methods[0] ?? 'Nothing chosen',
            sub: methods.length > 1 ? `or ${methods.length - 1} other${methods.length > 2 ? 's' : ''}` : methods.length === 0 ? 'cannot be completed' : undefined,
            kind: 'second',
          }
        : rule.secondFactor === 'chain'
          ? { id: 'second', label: chain.join(' → ') || 'Empty chain', sub: 'every step, in order', kind: 'second' }
          : rule.secondFactor === 'preferred'
            ? { id: 'second', label: 'Their preferred method', sub: rule.preferredFallback ? `else ${rule.preferredFallback}` : undefined, kind: 'second' }
            : { id: 'second', label: 'Any enrolled method', kind: 'second' }
    out.push(second)
    if (rule.rememberMfa) {
      out.push({
        id: 'remember',
        label: rule.forceMfaEachLogin ? 'Asked every time' : `Remembered ${rule.rememberDays ?? 30} days`,
        sub: rule.forceMfaEachLogin ? 'even on a trusted device' : 'on this device',
        kind: 'remember',
      })
    }
  }

  out.push({ id: 'end', label: 'Signed in', kind: 'end' })
  return out
}

/** The three preset clocks the sweeps and rehearsals run at. */
export const CLOCKS = [
  { label: '03:00', minutes: 180, caption: 'Night' },
  { label: '09:30', minutes: 570, caption: 'Working hours' },
  { label: '21:00', minutes: 1260, caption: 'Evening' },
] as const

/** A stable, human short label for a situation axis value. */
export const shortPlace = (p: string) =>
  ({ 'Any location': 'Anywhere', 'Office Network': 'Office', 'Outside all zones': 'Off-network', 'Tor exit node': 'Tor', 'Known proxy': 'Proxy' })[p] ?? p

export const shortDevice = (d: string) =>
  ({ 'New / unknown': 'New device', 'Known < 90 days': 'Known < 90d', 'Known > 90 days': 'Known > 90d', 'Expired trust': 'Expired', 'Managed (MDM)': 'Managed', 'Changed fingerprint': 'Changed' })[d] ?? d

export const shortAuth = (a: string) =>
  ({ 'Normal returning user': 'Returning', 'First time login': 'First login', 'MFA recently reset': 'MFA reset', 'No MFA configured': 'No MFA' })[a] ?? a
