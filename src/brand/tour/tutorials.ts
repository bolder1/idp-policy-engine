/* -----------------------------------------------------------------------------
   The five tutorials.

   The tour is a minute long and points at things. These are the other half: the
   things somebody comes back for once they have used the builder for an hour
   and hit something the tour was too short to explain.

   Scope rule, and it is the reason there are five rather than fifteen: a
   tutorial earns its place only if getting it wrong produces a policy that
   looks right and behaves wrong. Where to click is not a tutorial. Why the
   relief rule has to sit under the guard rule is, because that mistake ships.

   Copy rule, inherited from the tour and relaxed exactly once: a tour stop gets
   one sentence because it is read standing up, beside the thing it describes. A
   tutorial step is read sitting down, so it gets a short paragraph — and a
   `tip`, which is the sentence somebody will actually quote back later.
   -------------------------------------------------------------------------- */

export type FigureId =
  | 'anatomy'
  | 'order'
  | 'checks'
  | 'test'
  | 'ship'

export interface TutorialStep {
  heading: string
  body: string
  /** The one line worth remembering. Rendered as a callout, never as prose. */
  tip?: string
}

export interface Tutorial {
  id: string
  figure: FigureId
  title: string
  /** One line, shown in the list. */
  summary: string
  minutes: number
  steps: TutorialStep[]
}

export const TUTORIALS: Tutorial[] = [
  {
    id: 'anatomy',
    figure: 'anatomy',
    title: 'Write your first rule',
    summary: 'Audience, conditions, outcome — and what each one is allowed to do.',
    minutes: 3,
    steps: [
      {
        heading: 'A rule is three answers and nothing else',
        body: 'Who it applies to, what has to be true, and what happens when it is. The builder asks them in that order because the engine evaluates them in that order: the audience is checked first, and somebody outside it never reaches the conditions at all.',
        tip: 'If a rule is not firing for somebody, check the audience before you touch the conditions.',
      },
      {
        heading: 'The audience is a filter, not a target',
        body: 'Picking Finance does not mean the rule is about finance apps. It means the rule is invisible to everybody who is not in that group. A rule with an empty audience applies to nobody, which is why the builder flags it as an error rather than a warning.',
      },
      {
        heading: 'Conditions describe the sign-in, not the person',
        body: 'Network zone, device posture, risk score, time of day — every condition is a fact about the attempt happening right now. Two conditions in one rule are joined by AND by default, so both have to hold. Change the junction to OR when either one on its own should be enough.',
        tip: 'AND narrows a rule. OR widens it. Widening a deny rule is how a policy gets stricter than anyone meant.',
      },
      {
        heading: 'The outcome is one of three things',
        body: 'Allow lets the sign-in through on one factor. MFA asks for a second one, and you can require a specific method rather than any enrolled method. Deny ends it — there is no alternate path once a rule denies, which is what makes deny rules worth reading twice.',
      },
      {
        heading: 'A rule with no conditions is a catch-all',
        body: 'It matches every sign-in from its audience that got past the rules above it. That is not a mistake — it is how you stop the engine default deciding for people your policy was written for. Put it last.',
        tip: 'Every audience you govern should end in a catch-all. Without one, the engine decides, and the engine does not know what you meant.',
      },
    ],
  },
  {
    id: 'order',
    figure: 'order',
    title: 'Get the order right',
    summary: 'First match wins, and why relief always goes underneath the guard.',
    minutes: 3,
    steps: [
      {
        heading: 'The list is evaluated top to bottom, once',
        body: 'A sign-in falls down the rules and stops at the first one that matches it. Nothing below that rule is consulted — not to refine the answer, not to add a condition, not at all. The order is not a presentation choice. It is the policy.',
        tip: 'There is no "most specific rule wins". There is only "the first one".',
      },
      {
        heading: 'Guard rules go above relief rules',
        body: 'A guard rule catches something you are worried about — an unmanaged device, a flagged session. A relief rule makes life easier for a safe case, like one factor on the office network. Put the relief on top and an unmanaged laptop sitting in the office takes the easy path, because the relief rule matched first and the guard never ran.',
        tip: 'Relief above a guard is not a convenience. It is a hole with a friendly name.',
      },
      {
        heading: 'Reordering changes behaviour immediately',
        body: 'Drag a rule up the flow and every sign-in that used to reach the rules below it may now stop earlier. The builder does not warn you rule by rule, because any given move can be correct — it shows you the consequence instead, in the blast radius and the gauntlet.',
      },
      {
        heading: 'Unreachable rules are a real category',
        body: 'If a rule above matches everything a rule below would have matched, the lower rule can never fire. The checks call this out, and it is almost always one of two things: a catch-all that drifted upwards, or two rules whose conditions overlap more than their author realised.',
        tip: 'A rule that never fires is not harmless. It is a stated intention the engine is ignoring.',
      },
    ],
  },
  {
    id: 'checks',
    figure: 'checks',
    title: 'Read the checks',
    summary: 'Errors block, warnings do not, and both are worth the same minute.',
    minutes: 2,
    steps: [
      {
        heading: 'Three severities, one question each',
        body: 'An error means the policy cannot do what it says — an empty audience, a rule with no outcome. A warning means it can, but probably should not — an unreachable rule, a deny with no way back. A note is an observation you can take or leave.',
      },
      {
        heading: 'Errors stop the publish, warnings do not',
        body: 'That is deliberate. A warning is a judgement about your intent, and the builder does not get a veto over your intent. It gets to make sure you saw it.',
        tip: 'Publishing over a warning is a decision. Publishing without reading one is an accident.',
      },
      {
        heading: 'Every check points at the rule that caused it',
        body: 'Selecting a check moves the builder to that rule and the step within it, so you are looking at the thing being complained about rather than hunting for it. If a check has no rule, it is about the policy as a whole — usually a missing catch-all.',
      },
      {
        heading: 'The checks run on the draft, not the published policy',
        body: 'They describe what you are about to ship, which means a clean panel on a draft you have not saved says nothing about what is live right now. The blast radius is the control that compares the two.',
      },
    ],
  },
  {
    id: 'test',
    figure: 'test',
    title: 'Test before you publish',
    summary: 'One sign-in at a time, thirteen at once, and who a draft actually moves.',
    minutes: 3,
    steps: [
      {
        heading: 'Preview answers one question exactly',
        body: 'Pick a person and a situation — office network, unmanaged device, high risk — and the preview names the rule that decides it and why. It runs the same evaluator the engine runs, so a disagreement between the preview and production is a bug, not a rounding error.',
        tip: 'Use the preview on the case you are least sure about, not the one you designed the rule for.',
      },
      {
        heading: 'The gauntlet deals thirteen attempts at once',
        body: 'A fixed deck of sign-ins, each with an expected outcome, run against your rules and graded. The grade is not a score to beat — it is a count of how many landed where you said they would. A simple policy usually leaks, and the leak is the useful part.',
      },
      {
        heading: 'A breach is an attempt that got through',
        body: 'The gauntlet names the rule that let it in and the rule you probably meant to catch it. Most breaches resolve to one of two fixes: a condition that was narrower than intended, or an order problem.',
        tip: 'Fix the breach, then re-run. A grade that improved for a reason you cannot name has not improved.',
      },
      {
        heading: 'Blast radius counts people, not rules',
        body: 'It compares the draft against what is published and reports how many sign-ins would land differently. Two rules can be rewritten entirely and move nobody; one operator can move four hundred people. The number is the one to read before publishing.',
      },
    ],
  },
  {
    id: 'ship',
    figure: 'ship',
    title: 'Ship it safely',
    summary: 'Drafts, review, publishing, and getting back to where you were.',
    minutes: 2,
    steps: [
      {
        heading: 'Nothing you do here is live until you publish',
        body: 'Edits accumulate on a draft. The policy that is deciding sign-ins right now is the last published version, and it stays that way whatever the builder looks like.',
      },
      {
        heading: 'Review is the last stop, not a separate screen',
        body: 'It gathers the checks, the blast radius and the gauntlet grade in one place and puts the publish button after them rather than beside them. If something there is red, it is red because publishing would make it somebody else’s problem.',
      },
      {
        heading: 'Publish records who and when',
        body: 'Every published version is kept with its author and timestamp, and the history is readable from the Policy menu. That is what makes the next question answerable: not "is this policy right" but "what changed on the day the tickets started".',
        tip: 'The most valuable thing in the history is not the rule that changed. It is the date.',
      },
      {
        heading: 'Rolling back is publishing an older version',
        body: 'It is not an undo — it is a new publish with the old content, and it appears in the history as one. That is the honest model: the thing that was live is a fact, and facts do not get deleted because they turned out to be wrong.',
      },
    ],
  },
]

/* Read state, so the list can say what is left rather than only what exists.
   localStorage rather than the store: it is about this person on this machine,
   not about the tenant, and it should survive a reload like the tour flag
   does. */
const READ_KEY = 'idp.tutorials.read'

export function readTutorials(): string[] {
  try {
    const raw = window.localStorage.getItem(READ_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    // Private mode, or a value somebody else wrote. Either way, nothing is read.
    return []
  }
}

export function markTutorialRead(id: string) {
  try {
    const all = new Set(readTutorials())
    all.add(id)
    window.localStorage.setItem(READ_KEY, JSON.stringify([...all]))
  } catch {
    /* nothing to do — the guide is readable either way, it just forgets */
  }
}
