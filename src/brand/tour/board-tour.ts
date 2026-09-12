import { cond, type Policy, type Rule } from '../data'
import { restConditions, setWho, whoIds } from '../audience-ops'
import { addCondition } from '../when-ops'

/* -----------------------------------------------------------------------------
   The board's guided demo — the six steps, as data.

   The trail's tour (tour-stops.ts) is a walk PAST things: it dims the page,
   lights one element and says a sentence about it. That is the right shape for
   ideas about the model — first match wins is a fact you read, not a thing you
   do — and it is the wrong shape for a surface whose whole argument is that a
   policy is assembled out of three answers.

   So this one is a walk THROUGH. Every step names a task, watches the draft
   until the task is done, and says so. Three consequences, and each is a
   decision rather than a detail:

   · **It is a soft gate.** Next is never disabled. A tour that traps somebody
     on step 2 because their edition withholds the control the step names, or
     because the rule already satisfies it in a way the check did not
     anticipate, is a tour that has to be escaped rather than finished. The card
     reports the task's state; it does not hold the door.

   · **Every step can do itself.** "Do it for me" performs the task on the draft
     through the same writers the board's own controls use — so what lands is an
     ordinary edit, undo puts it back, and nothing is saved until you publish.
     It is for the reader who wants to see the result before doing it
     themselves, and for the one who is stuck.

   · **Completion is read from the DRAFT, never remembered.** A step is done
     when the policy says it is, so undoing the thing you just did takes the
     tick away again — which is the honest reading, and the only one that
     survives arriving at the tour with work already in progress.

   --- Why every step works on every edition ----------------------------------

   There was a fork here. The fifth step pointed at the Check and What-changes
   readings on the bar, which the shipping `lite` edition withholds, so it had
   to have a second version that pointed somewhere else — and the tour needed to
   know which edition it was in to pick.

   The fork is gone, because the two steps that replaced it are true everywhere.
   The dock is on the canvas in every edition, and every edition ends in a
   review before anything is saved; only the button's WORDING differs, which is
   why step six's copy says neither "publish" nor "save". A walkthrough that
   needs to know what the tenant bought is a walkthrough with two sets of copy
   to keep true, and one of them will rot.
   -------------------------------------------------------------------------- */

export type BoardStopId = 'rule' | 'who' | 'when' | 'then' | 'tools' | 'review'

/* What a step asks for, and how the two halves of the answer are found.

   `done` is a pure read of the board. The write that satisfies it is beside it
   in this same file, which is what lets a test assert that every step's
   automatic answer actually satisfies that step's own check — the one bug this
   shape can have is a demo that cannot satisfy itself. */
export interface StopTask {
  /** The imperative, on the card. One line, present tense. */
  ask: string
  /** What the card says once it has happened. */
  didIt: string
  /** Read from the board — never cached, so an undo un-ticks it. */
  done: (ctx: TaskCtx) => boolean
  /** The label on the button that does it for you. */
  doLabel: string
}

export interface TaskCtx {
  draft: Policy
  /** The rule the demo is building, resolved fresh each render. Null before step 1. */
  rule: Rule | null
  /** How much of each card the chain is showing — step five. */
  density: 'outline' | 'detailed'
  /** Whether the review dialog is up — step six. */
  review: boolean
  /** What `rule.decision` was when the Then step began — see that step's note. */
  decisionAtStart: string | null
}

export interface BoardStop {
  id: BoardStopId
  /** `data-tour` value to light. Absent = centred. */
  anchor?: string
  /** Tried first. The board has two shapes, and step 1 points at both. */
  anchorAlt?: string
  heading: string
  body: string
  task: StopTask
}

/* The group the demo narrows to, and the condition it writes.

   Real ids from the fixture, not invented ones: `setWho` writes
   `group in ['finance']` and the evaluator, the linter, the gauntlet and the
   sweep all read it, so the rule this tour builds is a rule the rest of the
   product can reason about. A demo that writes data only the demo understands
   is a demo about a different product. */
export const DEMO_GROUP = 'finance'
export const DEMO_CONDITION = { typeId: 'device-risk', operator: 'above', value: '70' }

export const BOARD_STOPS: BoardStop[] = [
  {
    id: 'rule',
    anchor: 'add-rule',
    /* The empty board draws a chooser instead of a chain, so the thing to point
       at on a brand new policy is not the thing to point at on one that already
       has rules. Two anchors, and the alt is tried first because it only exists
       in the emptier of the two cases. */
    anchorAlt: 'empty-start',
    heading: 'A policy is a list of rules',
    body: 'Add one and it joins a chain that every sign-in falls down until something matches it, which makes where a rule sits as much of the policy as what it says.',
    task: {
      ask: 'Add a rule to the chain.',
      didIt: 'Added — and it is the rule the panel on the right is now editing.',
      done: ({ rule }) => rule !== null,
      doLabel: 'Add one for me',
    },
  },
  {
    id: 'who',
    anchor: 'insp-who',
    heading: 'Who the rule is about',
    body: 'Naming a group narrows the rule to those people and makes it invisible to everybody else, so it is a filter on who the rule can see rather than a claim about what they are doing.',
    task: {
      ask: 'Pick a group in the Who section.',
      didIt: 'Narrowed — everyone outside that group now skips this rule entirely.',
      done: ({ rule }) => !!rule && (whoIds(rule.when, 'group').length > 0 || whoIds(rule.when, 'user').length > 0),
      doLabel: 'Pick Finance for me',
    },
  },
  {
    id: 'when',
    anchor: 'insp-when',
    heading: 'What has to be true',
    body: 'A condition is a fact about the sign-in happening right now — its risk, its network, its device, its hour — and everything inside one group has to hold before the rule fires.',
    task: {
      ask: 'Add a condition.',
      didIt: 'Added — the rule now fires only when that is true of the attempt.',
      done: ({ rule }) => !!rule && restConditions(rule.when).length > 0,
      doLabel: 'Add risk above 70',
    },
  },
  {
    id: 'then',
    anchor: 'insp-then',
    heading: 'And what happens then',
    body: 'Allow signs them in, Second factor asks for more proof and Deny ends it there — one of the three, because a rule that could do two of them would not be one rule.',
    task: {
      /* Not "set an outcome": a new rule already HAS one. `blankRule()` seeds
         `2fa`, so a check of "is it set?" would tick the instant the step opened
         and teach nothing at all. What the step actually asks for is a
         deliberate choice, and the only honest reading of that is a change from
         whatever it was when the step began. */
      ask: 'Choose what this rule does.',
      didIt: 'Chosen — and that is the whole rule: these people, this circumstance, this result.',
      done: ({ rule, decisionAtStart }) => !!rule && decisionAtStart !== null && rule.decision !== decisionAtStart,
      doLabel: 'Make it Deny',
    },
  },
  {
    id: 'tools',
    anchor: 'board-dock',
    heading: 'How to read the chain',
    body: 'Undo and redo, zoom in and out or reset it, and expand or collapse every card at once — with the rest of it on the ? key.',
    task: {
      /* Density, of everything down there, because it is the only tool in the
         dock whose effect lands on the chain itself. Undo — on a board somebody
         has just been walked through building — would take their rule away
         again, which is a poor thing to teach a person to press. */
      ask: 'Expand the cards.',
      didIt: 'Every condition on every card — one policy, read at a different distance.',
      done: ({ density }) => density === 'detailed',
      doLabel: 'Show every condition',
    },
  },
  {
    id: 'review',
    anchor: 'review',
    heading: 'Read it back before it is live',
    body: 'Every rule is written out as a sentence, with the checks attached to the rule each one is about — which is the last place a rule that can never run gets caught.',
    task: {
      /* Opening it is the whole task. Going through with it is not: this is
         somebody's real policy, and a walkthrough that publishes it on their
         behalf has done something they cannot undo from here. The step shows
         the door and stops. */
      ask: 'Open the review.',
      didIt: 'Nothing here is live until you go through with it — closing this changes nothing.',
      done: ({ review }) => review,
      doLabel: 'Open it for me',
    },
  },
]

/* --- The writes behind "Do it for me" ----------------------------------------

   Separate from the stops so a test can pair each one with its own `done`
   check. Everything here is a patch to ONE rule; adding a rule, changing the
   density and opening the review are the three tasks that are not, and the
   component owns those because they are board state rather than rule state.
   -------------------------------------------------------------------------- */

export function whoPatch(rule: Rule): Partial<Rule> {
  return { when: setWho(rule.when, 'group', [DEMO_GROUP]) }
}

export function conditionPatch(rule: Rule): Partial<Rule> {
  /* Into the run that is already there, or the first one — the same choice
     `setWho` makes, for the same reason: a second branch would turn the rule
     into an OR of alternatives and quietly widen it. */
  const target = rule.when.cards[0]?.id
  return {
    when: addCondition(
      rule.when,
      target ?? 'new',
      cond(DEMO_CONDITION.typeId, DEMO_CONDITION.operator, [DEMO_CONDITION.value]),
    ),
  }
}

/* Deny, unless it is already Deny, in which case Allow.

   The point of the step is that the outcome CHANGED, and a button that wrote
   back the value already there would leave the card still saying "waiting for
   you" immediately after you pressed the thing meant to answer it. */
export function thenPatch(rule: Rule): Partial<Rule> {
  return { decision: rule.decision === 'deny' ? '1fa' : 'deny' }
}

/* --- The demo recording ------------------------------------------------------

   One constant, so the tour has exactly one thing to know about the video and
   the file can be replaced without touching a component. A null `src` is a
   supported state rather than a broken one: the offer simply is not made, and
   the rest of the tour is unaffected.

   `.webm` because that is what the recording script produces, and every browser
   this console supports plays it — see scripts/record-demo.mjs.
   -------------------------------------------------------------------------- */

export const DEMO_VIDEO: { src: string | null; duration: string; caption: string } = {
  src: '/policy-board-demo.webm',
  /* Stated rather than measured, because it labels a 28px button that is drawn
     before any of the recording has been fetched — reading it off the file
     would mean downloading the whole video to print four characters. Kept true
     by `npm run demo:record`, which measures what it wrote and prints the line
     to paste here. */
  duration: '1:16',
  caption: 'A policy built end to end — named, scoped, two rules, reviewed and saved.',
}

export const BOARD_TOUR_SEEN = 'idp.board-tour.seen'

export function boardTourSeen(): boolean {
  try {
    return window.localStorage.getItem(BOARD_TOUR_SEEN) === '1'
  } catch {
    /* Private mode, or storage disabled. Never interrupt twice in one session. */
    return true
  }
}

export function markBoardTourSeen() {
  try {
    window.localStorage.setItem(BOARD_TOUR_SEEN, '1')
  } catch {
    /* Nothing to do — it is re-runnable from the bar either way. */
  }
}
