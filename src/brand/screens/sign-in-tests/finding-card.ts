import { DECISION_PHRASE } from '../../decision-words'
import type { EngineRun } from './engine-run'
import type { WhyItem } from './journey'

/* -----------------------------------------------------------------------------
   A finding, as a card that is read in a glance and acted on in a click (owner,
   6 Oct 2026: "a heading — don't call it problem, you decide — then a one- or
   two-liner at most, then a solution button; they don't want to read, so only
   click"):

     ⚠ Two policies cover Maya Iyer
       AWS billing for Finance would allow with 2FA, but AWS for engineering
       teams comes first.
       [🔧 Add a rule for Maya Iyer above rule 2]   Open rule ↗

   The heading names what is going on in plain words, by the finding's kind;
   the line says what the other policy or rule would do and why it does not —
   the model's longer why stays in its tooltip. The fix is the press
   (conflict-fix.ts); Open rule only looks.
   -------------------------------------------------------------------------- */

export interface FindingCard {
  title: string
  line: string
}

/** A finding's picture (FindingArt.tsx): two policies, or rules in order; none for the rest. */
export type ArtKind = 'policies' | 'rules'

export function artOf(kind: WhyItem['kind']): ArtKind | null {
  if (kind === 'policy-conflict' || kind === 'same-group-policy' || kind === 'group-policy-first') return 'policies'
  if (kind === 'rule-conflict' || kind === 'named-later' || kind === 'deny-first' || kind === 'exception') return 'rules'
  return null
}

const sentence = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s)

/** The card's heading and its line, from the finding and the run it was found on. */
export function findingCardOf(it: Pick<WhyItem, 'kind' | 'head' | 'detail' | 'short' | 'link' | 'would' | 'rule' | 'fix'>, plan: Pick<EngineRun, 'decider' | 'rules' | 'landing' | 'conflicts'>): FindingCard {
  const person = plan.conflicts?.personName || 'this person'
  const decider = plan.decider?.name ?? 'the policy that decides'
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const landing = land && land.index !== null ? land.index + 1 : null
  const fallback = { title: it.head, line: sentence(it.short || it.detail) }
  const would = it.would?.decision ? DECISION_PHRASE[it.would.decision] : null
  /* The groups both policies cover, as the fix names them ("Add a rule for Finance to …"); the head's via names every
     group the other policy covers the person by, shared or not. */
  const shared = /^Add a rule for (.+?) to /.exec(it.fix ?? '')?.[1] ?? /· via (.+)$/.exec(it.head)?.[1] ?? null

  switch (it.kind) {
    case 'policy-conflict':
    case 'same-group-policy':
    case 'group-policy-first': {
      const title = it.kind === 'same-group-policy' && shared ? `Two policies cover ${shared}` : it.kind === 'group-policy-first' ? `Another policy covers ${person}` : `Two policies cover ${person}`
      if (!it.link) return { ...fallback, title }
      /* Where the other policy can't tell, it is still named: nothing else on the card says which one it is. */
      if (!would) return { title, line: `${it.link.label} may also apply, but ${decider} comes first.` }
      return { title, line: `${it.link.label} would ${would}, but ${decider} comes first.` }
    }
    case 'rule-conflict':
    case 'named-later':
    case 'deny-first': {
      const c = it.rule
      const title = it.kind === 'named-later' ? `${person} is named in a later rule` : it.kind === 'deny-first' ? `A refusal comes first for ${person}` : `Two rules match ${person}`
      if (!c || landing === null) return { ...fallback, title }
      return { title, line: `Rule ${c.number} would ${DECISION_PHRASE[c.ask.decision]}, but rule ${landing} matched first.` }
    }
    case 'exception': {
      const [title, why] = it.head.split(' · ')
      return { title, line: why ? `${why}, and an exception always wins.` : fallback.line }
    }
    case 'also-matches':
      return { title: 'Another rule also matches', line: sentence(it.short || it.detail) }
    default:
      return fallback
  }
}
