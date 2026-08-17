/* -----------------------------------------------------------------------------
   The builder tour — the six stops, as data.

   Scoped to the builder and nothing else. The create flow has the guided setup;
   this exists for the screen you land on afterwards.

   The obvious tour points at chrome — this is the Policy menu, this is undo.
   That teaches the furniture, and the furniture is not what people get wrong
   here. Three things are, and all three belong to the model rather than the
   layout:

     · a policy is an ordered list and the first match wins
     · a rule is an audience, then conditions, then an outcome
     · the consequence of publishing is knowable before you publish

   So these six stops are about those three, on the real screen, and the tour
   drives the product as it goes — arriving at the conditions stop actually
   switches the trail to When, so the thing being described is the thing you are
   looking at.

   Copy rule, same as the form's: one sentence per stop. A stop that needs a
   paragraph is two stops, or it is documentation.
   -------------------------------------------------------------------------- */

export type HeroId = 'welcome' | 'order' | 'trail' | 'conditions' | 'answer' | 'publish'

export interface Stop {
  id: HeroId
  /** `data-tour` value of the element to light up. Absent = centred, no spotlight. */
  anchor?: string
  heading: string
  body: string
  /** Switch the trail to this step before the stop is shown. */
  step?: 'who' | 'when' | 'then' | 'check' | 'review'
  /** Open this side panel before the stop is shown. */
  panel?: 'preview' | 'review' | 'launch'
  /** Replaces "Next" on the last stop. */
  finish?: string
}

export const STOPS: Stop[] = [
  {
    id: 'welcome',
    heading: 'This is where a policy gets written',
    body: 'Six stops and about a minute — leave whenever you like, and pick it up again from the Policy menu.',
  },
  {
    id: 'order',
    anchor: 'flow',
    heading: 'First match wins',
    body: 'A sign-in falls down this list and stops at the first rule that matches it — so the order is the policy, not a detail of it.',
  },
  {
    id: 'trail',
    anchor: 'trail',
    heading: 'A rule is four questions',
    body: 'Who it applies to, when it applies, what happens, and what the checks say — one at a time, or all together.',
    step: 'who',
  },
  {
    id: 'conditions',
    anchor: 'stage',
    heading: 'Conditions compose',
    body: 'Each row is one signal, coloured by the kind of thing it looks at, and the junction between two rows is yours to change.',
    step: 'when',
  },
  {
    id: 'answer',
    anchor: 'panels',
    heading: 'Ask what it would do',
    body: 'Pick somebody and a situation, and the panel says which rule decides it and why — before anything is saved.',
    step: 'when',
    panel: 'preview',
  },
  {
    id: 'publish',
    anchor: 'gauntlet',
    heading: 'Find out before you publish',
    body: 'Thirteen sign-in attempts are dealt at these rules and graded, and the blast radius counts what a draft moves.',
    finish: 'Run the gauntlet',
  },
]

export const TOUR_SEEN = 'idp.tour.seen'

export function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN) === '1'
  } catch {
    // Private mode, or storage disabled. Never show it twice in one session.
    return true
  }
}

export function markTourSeen() {
  try {
    window.localStorage.setItem(TOUR_SEEN, '1')
  } catch {
    /* nothing to do — the tour is re-runnable from the menu either way */
  }
}
