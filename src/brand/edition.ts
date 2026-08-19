/* -----------------------------------------------------------------------------
   Two editions of the policy console, over one codebase.

   `lite` is the product as it was asked for: the deployed scope from
   docs/v0-policy-flow.md and nothing beyond it. `full` is what this prototype
   has been arguing for. The switch exists so the two can be compared on the
   same policy, in the same session, rather than from memory or a screenshot.

   **Gated, not forked.** Every difference below is a subtraction — the same
   screens with capabilities withheld. A fork would drift within a week and the
   comparison would stop being a comparison, which is the only thing this is
   for.

   --- On what `lite` keeps, which is the part that needed checking -----------

   The brief said "remove the Review step". v0 §8 is *Review & Save*, so taken
   literally that would have removed a v0 requirement in the name of matching
   v0. They are two different things wearing one name:

   · v4's **Review step** is a publish gate — diagnostics, blast radius and a
     gauntlet grade standing between a draft and production. That is ours, and
     it goes.
   · v0's **Review & Save dialog** reads the rules back as prose and ends in
     Confirm & Save. That is v0's, and it stays.

   The same split settles testing: the gauntlet (a graded thirteen-attempt deck)
   is ours and goes; Test policy (one simulated sign-in) is v0's and stays.
   -------------------------------------------------------------------------- */

export type Edition = 'lite' | 'full'

export interface Features {
  /** Policies list: the Coverage tab beside List. */
  coverage: boolean
  /** Policies list: the Exposure column and its sort. */
  exposure: boolean
  /** Create: the animated template preview beside the scenario list. */
  templateHero: boolean
  /** Create and builder: the five-question guided build. */
  guidedSetup: boolean
  /** Builder: the graded thirteen-attempt deck. */
  gauntlet: boolean
  /** Builder: the Check step, i.e. the diagnostics panel as a trail stop. */
  checkStep: boolean
  /** Builder: the Review step, i.e. the publish gate. Not v0's Review dialog. */
  reviewStep: boolean
  /** Builder: how many sign-ins a draft moves against what is published. */
  blastRadius: boolean
  /** Builder: the ⌘K palette. */
  commands: boolean
  /** Builder: the publish/launch affordances the trail ends in. */
  publish: boolean
  /** The prototype's own design-version switchers. */
  designSwitcher: boolean
}

const FULL: Features = {
  coverage: true,
  exposure: true,
  templateHero: true,
  guidedSetup: true,
  gauntlet: true,
  checkStep: true,
  reviewStep: true,
  blastRadius: true,
  commands: true,
  publish: true,
  designSwitcher: true,
}

/* Everything on the brief, off. What remains is v0's scope: the flow, the
   editor, the objects rail, and the five toolbar dialogs including Review &
   Save — which is not in this table because Lite keeps it. */
const LITE: Features = {
  coverage: false,
  exposure: false,
  templateHero: false,
  guidedSetup: false,
  gauntlet: false,
  checkStep: false,
  reviewStep: false,
  blastRadius: false,
  commands: false,
  publish: false,
  designSwitcher: false,
}

export const featuresOf = (e: Edition): Features => (e === 'full' ? FULL : LITE)

/* --- The gaps ------------------------------------------------------------------

   The second half of the brief: give them what they asked for, then show what
   it costs. Each entry is one withheld capability, written as a question the
   product can no longer answer rather than as a feature that is missing —
   because "no blast radius" persuades nobody and "you cannot tell who a change
   moves until it has moved them" persuades everybody.

   `answered` is the honest version of the loss. `covered` is how the full
   edition answers it. Both are one sentence, same rule as the tour. */

export interface Gap {
  id: keyof Features
  /** Where it bites, for grouping. */
  surface: 'List' | 'Create' | 'Builder'
  title: string
  /** The question this capability answers. */
  question: string
  /** What happens in its absence. */
  cost: string
  /** How the full edition answers it. */
  covered: string
  /** Roughly how much of the risk this one carries. Drives the ordering. */
  weight: 'high' | 'medium' | 'low'
}

export const GAPS: Gap[] = [
  {
    id: 'blastRadius',
    surface: 'Builder',
    title: 'Blast radius',
    question: 'How many people does this edit move?',
    cost: 'A one-word operator change and a rewrite of every rule look identical until the tickets arrive. The only way to find out who a draft moves is to publish it and watch.',
    covered: 'The bar counts the sign-ins that would land differently against what is published, before you publish, and names them.',
    weight: 'high',
  },
  {
    id: 'gauntlet',
    surface: 'Builder',
    title: 'The gauntlet',
    question: 'What gets through this policy?',
    cost: 'Testing is one sign-in at a time, and you can only test the case you thought of. The case you did not think of is the one that leaks.',
    covered: 'Thirteen attempts with declared expectations are dealt at the rules and graded, so a hole shows up without anybody having to imagine it first.',
    weight: 'high',
  },
  {
    id: 'checkStep',
    surface: 'Builder',
    title: 'The checks',
    question: 'Is any rule broken, unreachable or contradictory?',
    cost: 'A rule that can never fire, an empty audience, a deny with no way back — all publish silently and all read as working.',
    covered: 'The linter runs on every edit, separates what blocks a publish from what merely deserves reading, and points at the rule that caused it.',
    weight: 'high',
  },
  {
    id: 'reviewStep',
    surface: 'Builder',
    title: 'The publish gate',
    question: 'Is this safe to ship right now?',
    cost: 'Review & Save reads the rules back, which catches a typo. It does not know whether the policy leaks, or who it moves.',
    covered: 'The last stop gathers the checks, the blast radius and the grade in one place and puts Publish after them rather than beside them.',
    weight: 'medium',
  },
  {
    id: 'exposure',
    surface: 'List',
    title: 'Exposure column',
    question: 'Which of my policies is the weakest?',
    cost: 'The list sorts by name and date. Finding the policy that leaks means opening all of them.',
    covered: 'Every row carries its grade, and the column sorts by it, so the weakest policy is one click from the top of the list.',
    weight: 'medium',
  },
  {
    id: 'coverage',
    surface: 'List',
    title: 'Coverage',
    question: 'What is protected by nothing at all?',
    cost: 'An app nobody wrote a policy for does not appear anywhere. It is invisible precisely because it is unprotected.',
    covered: 'The Coverage tab lists apps and groups against the policies that name them, so the gaps are the point of the view rather than an absence in it.',
    weight: 'high',
  },
  {
    id: 'guidedSetup',
    surface: 'Create',
    title: 'Guided setup',
    question: 'How does somebody who has never written a policy write their first one?',
    cost: 'The builder assumes you already know that a policy is an ordered list, that conditions compose, and that the first match wins. A first-time administrator knows none of the three.',
    covered: 'Five questions write the rules, in order, and grade them — so the first policy teaches the model instead of requiring it.',
    weight: 'medium',
  },
  {
    id: 'templateHero',
    surface: 'Create',
    title: 'Template preview',
    question: 'What will this template actually do?',
    cost: 'A template is chosen from its name and a one-line description, and the rules it carries are only visible after it has been applied.',
    covered: 'The preview draws the rules the template will create, in evaluation order, before it is chosen.',
    weight: 'low',
  },
  {
    id: 'commands',
    surface: 'Builder',
    title: 'Command palette',
    question: 'How do I do the thing without hunting for it?',
    cost: 'Every action is reachable only from the control that owns it, so the toolbar has to carry everything and does.',
    covered: 'One shortcut reaches every action by name, which is what allows the bar to stay at two decisions.',
    weight: 'low',
  },
]

/** Ordered worst-first, so the panel opens on the argument that carries weight. */
export const gapsFor = (f: Features): Gap[] => {
  const rank = { high: 0, medium: 1, low: 2 }
  return GAPS.filter((g) => !f[g.id]).sort((a, b) => rank[a.weight] - rank[b.weight])
}
