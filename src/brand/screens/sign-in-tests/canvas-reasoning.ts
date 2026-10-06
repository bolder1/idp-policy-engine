import { COPILOT_NAME } from './jarvis-mode/copilot-name'
import type { RunLayoutId } from './run-layout'

/* -----------------------------------------------------------------------------
   The reasoning behind each layout of the run (owner, 2 Oct 2026: "add a
   reasoning button where we can share the thought — the good and bads of
   each view"). What each one is, what works and what does not — said
   plainly, as a reviewer would, from the layouts as they stand on the
   showcase tenant (Maya Iyer on AWS Console the reference run). The owner's
   own thoughts sit beside these in the panel (canvas-shelf.ts `notes`).

   `early`: still being built when this was written; the notes are a first
   look, from the idea and its first frames.
   -------------------------------------------------------------------------- */

export interface LayoutReasoning {
  /** What it is, in one line. */
  idea: string
  good: string[]
  bad: string[]
  early?: boolean
}

export const REASONING: Partial<Record<RunLayoutId, LayoutReasoning>> = {
  column: {
    idea: 'The original run: one vertical column of cards — the sign-in, the policies, the deciding policy, the outcome.',
    good: ['Familiar: the builder’s own card language', 'Every stop shows its full detail', 'Works in a narrow canvas'],
    bad: ['Uses under half the width', 'Who, which policy and the outcome never fit on one screen', 'A conflicting rule is never on the canvas, only a pulsing chip'],
  },
  classic2: {
    idea: 'Four of the policy builder’s own cards, top to bottom — the sign-in, the policies, the rules, the outcome — on its canvas.',
    good: ['Reads exactly like the builder: the same cards, rows, chips and rule cards', 'Only the basics: who, which policy, which rule, what they get', 'The rule cards are the ones the admin edits'],
    bad: ['No conflicts, What they see or why on the canvas', 'A policy of many rules runs below the fold at 1280 wide', 'One column: half the width stays empty'],
    early: true,
  },
  line: {
    idea: 'Stage columns left to right; the chosen card of each column sits on one horizontal line.',
    good: ['The decision reads as one straight line', 'Above the line = passed over, below = never needed', 'Fits a 1440 canvas at full size'],
    bad: ['Many cards at once can feel dense', 'Zooms to 0.88 at 1280 wide, so small text dips under 12px', 'A conflict sits off the line and is easy to miss'],
  },
  tree: {
    idea: 'The person at the root, the policies and the deciding policy’s rules branching from it, the route lit and the reason on each branch.',
    good: ['Shows every option the engine considered, at a glance', 'The reason on each edge explains each branch', 'The lit route makes the answer obvious'],
    bad: ['Edge labels crowd when an app has many policies', 'Curved wires take space', 'Long policy names wrap'],
  },
  gates: {
    idea: 'The person walks the checkpoints: a gate per policy, a turnstile per rule, a booth per extra factor, the app’s door.',
    good: ['An instantly intuitive metaphor', 'The walk itself explains the order', 'The door is the outcome'],
    bad: ['Once settled it reads like a list with small icons', 'May feel playful for an enterprise admin', 'Check lights are small'],
  },
  marble: {
    idea: 'A marble rolls through a sorting machine: policy funnels, rule plates that tilt it away, outcome bins.',
    good: ['Memorable and fun', 'A tilted plate shows a failed rule clearly', 'The bins show what else could have happened'],
    bad: ['Busy geometry', 'The settled machine is harder to scan than the motion', 'The physics metaphor stretches for can’t tell'],
  },
  chat: {
    idea: 'The engine explains itself as a conversation, with reply chips that answer follow-up questions.',
    good: ['Plain language, easy to follow', 'Reply chips answer real questions from the run', 'Works in a narrow canvas'],
    bad: ['A long run is a long thread', 'Hard to see the whole decision at once', 'Reads like a transcript'],
  },
  deck: {
    idea: 'The policies are dealt and flipped like cards; the one that covers deals its rules face down, and they flip ✕ or ✓.',
    good: ['Each flip makes a step an event', 'The lifted matched card stands out', 'Compact'],
    bad: ['Face-down cards hide information until flipped', 'Piles of “not reached” feel abstract', 'Less obvious order'],
  },
  depth: {
    idea: 'The policies are plates stacked in depth; the sign-in drops through those that do not cover the person, and the first that does catches it and unfolds into its rules.',
    good: ['Makes “the first that covers decides” literal', 'The unfolded plate is a clear rule board', 'Tilt invites play'],
    bad: ['Text on the stack is secondary', 'The stack grows tall with many policies', 'Depth cues are subtle in the light stage'],
  },
  jarvis: {
    idea: 'A holographic HUD: a sweep target-locks the policy, the rules are analysed, the verdict decodes — narrated aloud, with a command bar that answers and acts.',
    good: ['Cinematic and memorable', 'The command bar answers from the run and acts: re-run as a group, set a fact, open the rule', 'Voice with subtitles; light and dark stages'],
    bad: ['A dense HUD', 'Voice can surprise in an open office (mute in the dock)', 'More to read than the calmer layouts'],
  },
  jarvis2: {
    idea: `${COPILOT_NAME} v2, the Reactor: concentric rings are the run — the policies, the rules, the checks — around a verdict core, with wedge panels for who, the decision, the policies and the rule trace.`,
    good: ['The most HUD-like: the path the engine took reads as lit rings', 'Deny floods the reactor red and names the failing check', 'Every readout is a fact of the run'],
    bad: [`Busier than the first ${COPILOT_NAME} — the owner kept that one`, 'Names appear twice (on the rings and in the wedges)', 'Still being finished: stopped part-way through its build'],
    early: true,
  },
  focus2: {
    idea: 'Focus v2, the run as a story that goes deeper: the sign-in, the policies, then inside the policy that covers its rules, then the deciding rule’s Then, then the outcome.',
    good: ['Each card leads into the next, so the order of the engine reads as one story', 'The policy is shown once, with its rules inside it'],
    bad: ['Still being built'],
    early: true,
  },
  mission: {
    idea: 'Mission control: each policy a station polled GO / NO-GO in order, the rules’ telemetry, a launch arc to the app’s orbit.',
    good: ['The poll order is the engine’s order, very clear', 'GO / NO-GO is unambiguous', 'The mission log timestamps every call'],
    bad: ['A heavy metaphor (launch pad, orbit)', 'Many consoles on screen at once', 'Monospace telemetry is less friendly'],
  },
  synapse: {
    idea: 'A network firing from the facts through the policies, the checks and the rules to the outcome; flip a fact and it fires again.',
    good: ['Shows which facts carried the decision', 'Flipping a fact is a powerful what-if', 'The possible outcomes are visible'],
    bad: ['Wires cross and get busy', 'Five columns need a wide canvas', 'The neural metaphor is not intuitive to every admin'],
  },
  pulse: {
    idea: 'A heartbeat line that spikes at each finding — green where something matched, red where a check failed — with a card at each beat and a playhead to scrub.',
    good: ['The shape of the line tells the story', 'Scrubbing is natural', '“Findings only” cuts the noise'],
    bad: ['Cards above and below the line compete for space', 'The trace adds little beyond the cards', 'Small timeline labels'],
  },
  focus: {
    idea: 'One moment of the run in focus at a time, in a spatial carousel, with the whole run as a ribbon of step chips under it.',
    good: ['Calm: one thing at a time', 'The ribbon keeps the whole run in reach', 'The outcome card with What they see is excellent'],
    bad: ['Receded cards are small', 'Seeing everything at once needs Overview'],
  },
  brief: {
    idea: 'The answer first: one sentence that is the outcome, its key phrases citing evidence cards below.',
    good: ['The fastest way to understand an outcome', 'Citations tie each word to its proof', '“Why not” lines answer the obvious questions'],
    bad: ['The sentence gets long for complex runs', 'Text-heavy for people who scan visually'],
  },
  circuit: {
    idea: 'Each rule a circuit of its checks in series; the current reaches the outcome through the first circuit that closes; flip a fact to re-route it.',
    good: ['Checks in series is exactly how a rule works (all must hold)', 'An open switch shows the failing check', 'What-if flips re-route the current'],
    bad: ['An engineering metaphor', 'Dense labels under the switches', 'Reads technical'],
  },
  stream: {
    idea: 'Access as a stream: it flows from the person through the policies’ channels and the rules’ gates into the outcome’s pool.',
    good: ['Where access flows and where it is stopped is intuitive', 'The other outcomes’ pools show the alternatives', 'What-if chips re-route the stream'],
    bad: ['Particle motion can distract', 'The route line is thin', 'The what-if panel takes space'],
  },
  bento: {
    idea: 'The whole answer in one glance: a verdict hero tile with tiles for who, the policy, the rule, the checks and what they see.',
    good: ['Everything at a glance: the verdict, who, the policy, the rule, the checks', 'Tiles open in place; the what-ifs are real re-runs', 'Fits at 1280×800 without clipping'],
    bad: ['Less sense of the order things happened in', 'Risks a dashboard feel', 'On a small screen the Who tile folds into a chip'],
  },
  directions: {
    idea: 'Turn-by-turn directions to the answer, with the route drawn on a map beside them; reroute chips are what-ifs.',
    good: ['A familiar maps metaphor', 'The answer first, then the steps in order', 'Reroutes answer “what if”'],
    bad: ['Two views to read (the list and the map)', 'When a late policy decides, the map grows tall and its text small', 'The map metaphor stretches for checks'],
  },
  explainer: {
    idea: 'Scrollytelling: short paragraphs walk the run while a pinned visual beside them changes with each step.',
    good: ['A plain story with a picture that follows it', 'The answer is the headline; scrub to any step'],
    bad: ['Reading-heavy', 'Slower for an expert who wants the answer', 'The settled outcome leaves empty room around it'],
  },
  pass: {
    idea: 'The decision as an access pass the engine issues, stamped at each step; flip it for its checks; a deny voids it.',
    good: ['Access as a pass is instantly intuitive', 'Stamps make each step tangible', 'Void and provisional passes say deny and can’t tell clearly'],
    bad: ['Ticket fields are a fixed form', 'Conflicts strain the metaphor', 'Flipping it or opening a slip moves what is below'],
  },
}
