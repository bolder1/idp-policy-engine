import type { EngineRun } from '../engine-run'
import type { Moment } from './focus-model'
import type { Beat } from './focus2-pace'

/* -----------------------------------------------------------------------------
   THE BEATS, AND THE CARDS THEY OPEN (Focus v2).

   The story has six beats (focus2-pace.ts `storyOf`): the sign-in, the
   policies passed over, the one that covers, each rule read, the deciding
   rule's Then, and the outcome. It does NOT have six cards, and that is the
   whole job of this file.

   Two of those beats go deeper into a card that is already open rather than
   bringing a new one. "The covering policy" is the same policy list a beat
   later — the row that covers locking green, "Applies ✓", "via Engineering"
   written under it, the rows after it reading "Not read". And the Then is the
   deciding rule's own card, its Then row lighting in the decision's colour.
   Giving each of those a card of its own would stand two near-identical
   policy lists side by side on the path, and two copies of one rule: the
   admin would be made to read the same card twice to be told it had changed.

   So the RAIL has six segments (the player's) and the PATH has one card per
   thing there is to look at: sign-in · policies · rule 1 … rule n · outcome.
   Those four kinds are exactly v1's `MomentKind`, which is why a card is a
   `Moment` here: `FarFace`, `stateKeyOf`, `tallestOf` and `momentKeyOf` are
   the engine's reading rather than the carousel's, and they all take one.

   Pure, and no component, so the view's files export only components.
   -------------------------------------------------------------------------- */

/** The cards on the path, and which card each beat opens. */
export interface Story {
  /** One card per thing to look at, in the order the story reaches them. */
  cards: Moment[]
  /** `ofBeat[i]`: the card the beat at `i` opens. */
  ofBeat: number[]
}

/** The cards the story's beats open, in order: two beats share a card where the second only goes deeper into it. */
export function cardsOf(beats: readonly Beat[], plan: Pick<EngineRun, 'rules'>): Story {
  const cards: Moment[] = []
  const ofBeat: number[] = []
  const seen = new Map<string, number>()
  const open = (key: string, kind: Moment['kind'], at: number, rule?: number): number => {
    const had = seen.get(key)
    if (had !== undefined) return had
    const i = cards.length
    cards.push({ key, kind, at, ...(rule === undefined ? {} : { rule }) })
    seen.set(key, i)
    return i
  }
  for (const b of beats) {
    if (b.kind === 'sign') {
      ofBeat.push(open('sign', 'sign', b.at))
      continue
    }
    if (b.kind === 'policies' || b.kind === 'covers') {
      ofBeat.push(open('policies', 'policies', b.at))
      continue
    }
    if (b.kind === 'outcome') {
      ofBeat.push(open('outcome', 'outcome', b.at))
      continue
    }
    /* A rule beat names its node; the Then names the rule it belongs to, so it opens that rule's card again. */
    const r = b.rule === undefined ? undefined : plan.rules[b.rule]
    if (r) {
      ofBeat.push(open(r.node, 'rule', b.at, b.rule))
      continue
    }
    /* A Then with no rule behind it (a plan shape not seen yet): it says nothing of its own, so it stays on the card
       already open rather than opening an empty one. */
    ofBeat.push(Math.max(0, cards.length - 1))
  }
  return { cards, ofBeat }
}

/** The beat a press on this card goes to: the furthest of its beats the story has reached, else its first. */
export function beatOfCard(story: Story, card: number, reached: number): number {
  let first = -1
  let best = -1
  story.ofBeat.forEach((c, i) => {
    if (c !== card) return
    if (first < 0) first = i
    if (i <= reached) best = i
  })
  return best >= 0 ? best : Math.max(0, first)
}

/** A receded card's one button: "Show rule 2". */
export function pickLabel(m: Moment, plan: Pick<EngineRun, 'rules'>): string {
  if (m.kind === 'sign') return 'Show the sign-in'
  if (m.kind === 'policies') return 'Show the policies'
  if (m.kind === 'outcome') return 'Show the outcome'
  const r = plan.rules[m.rule ?? -1]
  return r && r.index !== null ? `Show rule ${r.index + 1}` : 'Show the last rule'
}

/** The card, named for the path's label: "Rule 2, Contractors in the office". */
export function cardName(m: Moment | undefined, plan: EngineRun, person: string, landed: boolean): string {
  if (!m) return ''
  if (m.kind === 'sign') return `Sign-in, ${person}`
  if (m.kind === 'policies') return plan.decider ? `Policies, ${plan.decider.name}` : 'Policies'
  if (m.kind === 'outcome') {
    const o = plan.outcome
    if (!landed) return 'Outcome, deciding'
    return `Outcome, ${o.status === 'decided' && o.decision ? (o.decision === 'deny' ? 'Deny' : 'Allow') : o.status === 'depends' ? 'Depends' : 'no policy decides'}`
  }
  const r = plan.rules[m.rule ?? -1]
  return r ? `${r.index === null ? 'Last rule' : `Rule ${r.index + 1}`}, ${r.name}` : 'Rule'
}
