import { useCallback, useState } from 'react'

import { COPILOT_NAME } from './jarvis-mode/copilot-name'
import { CANVAS_OPTIONS } from './phase'

/* -----------------------------------------------------------------------------
   Which layout the run is drawn in (owner, 1 Oct 2026: "give me a fresh
   approach … we can have cards but not the same orientation … spread out
   the cards to have a better view and experience … so I want some more
   options"). One run, the same plan (engine-run.ts), drawn more than one way.

   Then, the same evening: "only the tree and the line view — remove the
   rest and give me some more options". Pipeline (four nodes and their
   trays) and Sheet (rules × facts) went, and the old column left the
   switch; three more spread-out layouts came in their place.

     line   stage columns left to right, the chosen card of each on ONE
            horizontal line — above it what was read and passed over,
            below it what was never needed (layouts/LineLayout.tsx)
     tree   the person at the root, the application's policies branching
            from it, the deciding policy's rules branching from that, the
            route lit and every other branch quiet (layouts/TreeLayout.tsx)

   Three more spread-out ones stood here for a while and went: Board (every
   policy as a builder column, the person's route drawn over them), Lanes
   (one swimlane per policy, each read left to right) and Story (the run as
   storyboard frames) — owner: "remove the lanes view", then "remove board
   and story as well".

   And then: "add 5 more options — something different, animated,
   intuitive, unique … more playful … interactive". Five playful ones, the
   colour rules unchanged (the play is in the motion and the metaphor):

     gates   the person walks a path of checkpoints: a gate per policy that
             opens or stays shut, a turnstile per rule whose scanners light
             check by check, an extra booth for a second factor, the app's
             door at the end (layouts/GatesLayout.tsx)
     marble  the sign-in drops as a marble through a sorting machine: policy
             funnels deflect it until one catches it, rule filters pass or
             deflect it, it lands in its outcome's bin
             (layouts/MarbleLayout.tsx)
     chat    the engine explains itself as a conversation, step by step,
             with reply chips that ask it why (layouts/ChatLayout.tsx)
     deck    the policies are a deck the engine deals and flips; the one
             that covers deals its rules face down, and they flip ✕ or ✓;
             the answer is dealt last (layouts/DeckLayout.tsx)
     depth   the policies are plates stacked in depth; the sign-in drops
             through those that do not cover the person, the first that does
             catches it and unfolds into its rules (layouts/DepthLayout.tsx)

   And: "give me a Jarvis-like version as well — how Iron Man has a
   Jarvis, that kind of experience, super interactive, fun and intuitive,
   with animations":

     jarvis  a holographic HUD on a dimmed stage: the person at the core,
             the sign-in's facts in orbit, the policies a ring the sweep
             locks onto, the rules analysed check by check, the verdict
             assembling — narrated aloud, with a command bar (and the mic,
             where the browser hears) that answers and acts
             (layouts/JarvisLayout.tsx)

   Then: "the Jarvis one is so cool — come up with some more ideas and
   options like the Jarvis one, give me 5 more". Five more of its kind —
   cinematic, an assistant at work, things to press and ask:

     mission     mission control: each policy is a station polled in order,
                 GO / NO-GO, each rule's checks the controllers' calls, the
                 flight director's GO for sign-in or a scrub — called aloud
                 (layouts/MissionLayout.tsx)
     synapse     the engine as a network firing: the sign-in's facts feed the
                 checks, the checks the rules, the rules the policies, the
                 decision lights at the end; flip a fact and it fires again
                 (layouts/SynapseLayout.tsx)

   X-ray (the person's sign-in page under a lens), Multiverse (the run among
   its one-fact variations) and Glass (a gesture wall) were built with them
   and went (owner, 2 Oct: "remove the X-ray and the multiverse, and the
   glass — I don't like these three").

   And the same day: "give me five more … intuitive and interactive, an
   animated way to showcase the policy outcomes, easy to use, very
   futuristic … the user can easily scan and go through whatever is
   happening and how the rules are working":

     pulse    the run as a heartbeat line you scrub: every step a beat, the
              policies and rules pinned at their beats, the outcome the last
              (layouts/PulseLayout.tsx)
     focus    a spatial carousel: one step in focus at a time, the steps
              before and after receding, the whole run a ribbon under it
              (layouts/FocusLayout.tsx)
     brief    answer first: the outcome as one sentence whose phrases cite
              the evidence, each citation opening its animated proof
              (layouts/BriefLayout.tsx)
     circuit  the decision as a lit circuit: each rule a circuit of its
              checks in series, the current reaching the outcome through the
              first circuit that closes; flip a fact to switch it
              (layouts/CircuitLayout.tsx)
     stream   the sign-in as a flow: it streams from the person through the
              policies' channels and the rules' gates into the outcome's
              pool; blocked channels stop it (layouts/StreamLayout.tsx)

   Then: "I love the Focus and the Brief thing — what a great job — can you
   give me 5 more of this kind of idea". Five more in their spirit — the
   answer first, one clear thing at a time, premium cards, things to poke:

     bento       the outcome as a bento grid: the verdict the hero tile, who,
                 the policy, the rule, the checks, what they see, conflicts
                 and what would change around it; any tile expands in place
                 (layouts/BentoLayout.tsx)
     directions  turn-by-turn directions with the route drawn beside them:
                 start at the person, take the policy that applies, no entry
                 at a rule that fails, turn in at the one that matches,
                 arrive; reroute chips are what-ifs (layouts/DirectionsLayout.tsx)
     explainer   scrollytelling: short paragraphs walk the run while a pinned
                 visual beside them changes with each step
                 (layouts/ExplainerLayout.tsx)
     pass        the decision as an access pass the engine issues, stamped
                 at each step, flipped for its checks; a deny voids it
                 (layouts/PassLayout.tsx)

   Tour (a spotlight guiding through the whole run) left the switch for a
   Guided tour button marked Coming soon (owner: "tour will be a guided
   tour — as of now just add a button with coming soon; we will add a guided
   tour after we select the final view").

   Then two shelves (owner, 2 Oct: "give me 2 filters, one with my
   favourites and one with an archive of the ones I don't like … the rest
   you can move to archive"): FAVOURITES — Tree, Depth, Focus, Brief,
   Directions, Explainer, Pass — and ARCHIVE, everything else on the
   switch. And Jarvis on neither: "one personal favourite, Jarvis — add a
   dedicated Jarvis button with a transition, a good real Jarvis-type
   transition, and the whole experience should be special" (JarvisMode.tsx),
   only ever dark ("Jarvis only available in dark mode … a special
   experience"). Focus and Brief went the same way: dedicated views, each
   its own button ("those are very good"). The shelves and the views on
   them are two dropdowns, the console's filter dropdowns ("make this into a
   dropdown like the filters we have").

   Light and dark: the cinematic ones (Jarvis, Mission, Synapse and the
   five above) draw on a light stage in the console's own look by default,
   with a dark stage behind a toggle in the dock — each layout's own theme
   file (jarvis-theme.tsx, mission-theme.tsx …), one shared key
   `idp.check-stage` —
   owner: "the dark mode in Jarvis is good, but I need a light mode as well
   that matches our theme and branding … with the dark mode as a toggle".

   The column (EngineJourney.tsx) is the run as it was; it is what the page
   draws with the switch off (phase.ts `CANVAS_OPTIONS`). It left the switch
   with Pipeline and Sheet and came back as Classic (owner, 2 Oct: "the
   classic version that we used to have, the very first card view in the
   row — add that as a classic version").

   Each choice names its group (Original, Spread out, Playful, Cinematic,
   Newest) for a grouped dropdown; the switch draws them as segments.

   Remembered in this browser (`idp.check-canvas`), as the other comparison
   switches are; read on arrival, never trusted past its list.
   -------------------------------------------------------------------------- */

export type RunLayoutId = 'column' | 'classic2' | 'line' | 'tree' | 'gates' | 'marble' | 'chat' | 'deck' | 'depth' | 'jarvis' | 'jarvis2' | 'mission' | 'synapse' | 'pulse' | 'focus' | 'focus2' | 'brief' | 'circuit' | 'stream' | 'bento' | 'directions' | 'explainer' | 'pass'

/** The switch's choices, in its order, each in its group (the dropdown's headings). */
export const RUN_LAYOUTS: readonly { value: RunLayoutId; label: string; group: string }[] = [
  { value: 'column', label: 'Classic', group: 'Original' },
  /* Classic v2 (owner, 5 Oct 2026: "double down on the classic mode … the same experience we have in creating policy
     … 4 basic cards"): the sign-in, the policies, the rules, the outcome, on the policy builder's own cards
     (layouts/ClassicV2Layout.tsx). Classic stays as it is beside it. */
  { value: 'classic2', label: 'Classic v2', group: 'Original' },
  { value: 'line', label: 'Line', group: 'Spread out' },
  { value: 'tree', label: 'Tree', group: 'Spread out' },
  { value: 'gates', label: 'Gates', group: 'Playful' },
  { value: 'marble', label: 'Marble', group: 'Playful' },
  { value: 'chat', label: 'Chat', group: 'Playful' },
  { value: 'deck', label: 'Deck', group: 'Playful' },
  { value: 'depth', label: 'Depth', group: 'Playful' },
  /* The copilot's name, not the code name (owner, 3 Oct 2026: it ships as Aruna — jarvis-mode/copilot-name.ts). */
  { value: 'jarvis', label: COPILOT_NAME, group: 'Cinematic' },
  { value: 'jarvis2', label: `${COPILOT_NAME} v2`, group: 'Cinematic' },
  { value: 'mission', label: 'Mission', group: 'Cinematic' },
  { value: 'synapse', label: 'Synapse', group: 'Cinematic' },
  { value: 'pulse', label: 'Pulse', group: 'Newest' },
  { value: 'focus', label: 'Focus v1', group: 'Newest' },
  { value: 'focus2', label: 'Focus', group: 'Newest' },
  { value: 'brief', label: 'Brief', group: 'Newest' },
  { value: 'circuit', label: 'Circuit', group: 'Newest' },
  { value: 'stream', label: 'Stream', group: 'Newest' },
  { value: 'bento', label: 'Bento', group: 'Clear' },
  { value: 'directions', label: 'Directions', group: 'Clear' },
  { value: 'explainer', label: 'Explainer', group: 'Clear' },
  { value: 'pass', label: 'Pass', group: 'Clear' },
]

/** Jarvis: on no shelf — its own button on the bar, its own entrance, and only ever dark. */
export const JARVIS: RunLayoutId = 'jarvis'
/* Jarvis v2, the Reactor (2 Oct 2026): the owner kept the first Jarvis — "the older version is more simple and better, so
   revert that and keep the current version as v2". Both are Jarvis: one bar button, the transition, the dark stage; the
   version switch beside the button while Jarvis is on picks which, and is remembered. */
/* v2, the Reactor, is an ARCHIVED canvas (owner, 3 Oct 2026: "move v2 inside the archive — not needed in the main
   view, no need for v1 / v2 … no need to work on that"): on the Canvas dropdown's Archive shelf, not a dedicated
   view; the bar's button enters Aruna (v1) only. */
export const JARVIS2: RunLayoutId = 'jarvis2'
export const isJarvis = (l: RunLayoutId) => l === JARVIS

/* The dedicated views (owner, 2 Oct 2026: "Brief and Focus can be two
   dedicated views — exclude those, those are very good"; and Jarvis, "one
   personal favourite"): each its own button on the bar, on neither shelf. */
/* Focus is the main view and Brief is archived (owner, 4 Oct 2026: "Brief — just move it to archive, and Focus will be
   our main view; it should have that Brief part as well … we can remove the Blend mode"). */
/* Focus v2 IS Focus now, and v1 is archived (owner, 4 Oct 2026, pointing at the bar's v1 | v2: "Move the v1 to
   archive"). v2 is the story that goes deeper — the policy, inside it its rules, the deciding rule's Then, the
   outcome; v1, the carousel of separate cards, sits on the Archive shelf as "Focus v1". No version switch. */
export const DEDICATED: readonly RunLayoutId[] = ['focus2', 'jarvis']
/** The main view: Focus (the layout id stays 'focus2' — v1 keeps 'focus', so a stored pick still means what it did). */
export const MAIN_VIEW: RunLayoutId = 'focus2'

/** The owner's favourites, in his order (2 Oct 2026), the dedicated views apart — Pass and Explainer moved to the archive the same day ("remove Pass and Explainer from the favourites"). Everything else on the switch is the archive. */
export const DEFAULT_FAVOURITES: readonly RunLayoutId[] = ['tree', 'depth', 'directions']

/** The layouts that draw on a stage with a dark option — the Configure panel follows their stage. */
export const STAGED_LAYOUTS: readonly RunLayoutId[] = ['jarvis', 'jarvis2', 'mission', 'synapse', 'pulse', 'focus', 'focus2', 'brief', 'circuit', 'stream', 'bento', 'directions', 'explainer', 'pass']

/** The layouts that are only ever dark (owner: "Jarvis only available in dark mode … a special experience"). */
/* Jarvis itself has a light stage again (owner, 3 Oct 2026: "add the light mode in Jarvis as well, based on our brand");
   only Jarvis v2, the unfinished Reactor, stays dark. */
export const DARK_ONLY: readonly RunLayoutId[] = ['jarvis2']

/** The layouts that show an edit pencil of their own on the sign-in (owner, 2 Oct 2026: "only add the pencil
    button wherever they don't have the option"): the run line's pencil is left out of them. Measured, on screen
    once a run has landed, at 1440×900 and 1280×800 — Focus's own sits on a card that recedes, so it keeps the line's. */
export const OWN_EDIT: readonly RunLayoutId[] = ['column', 'brief', 'directions', 'explainer']

/** The views that draw their own top — the sign-in row, its pencil and a basic Replay — so the run line is left out
    of them (owner, 3 Oct 2026: "all 3 should have the same things … I don't like that constant change with the whole
    top replay thing — just a replay button").

    ARUNA STAYS IN IT, and the reason is worth writing down because taking her out of it was tried first and was wrong.
    Her circle had swallowed the sign-in on 4 Oct 2026 — the person at the core, the application at the ring's gate, the
    conditions orbiting as chips, the pencil and Replay on the core — and the owner reversed that: "revert the circle,
    and give me the old top bar as we have in Focus". The circle is the engine's again, so the facts have to come back.

    But this list is not the switch for that. Leaving it hands a view the HOST's `EngineLine` — the clock sentence,
    "Checked 1 policy · 2 rules · 3 checks" — which is a reading of the run, not the sign-in. The bar he means is
    `SignInRow`, the one Focus and Brief draw THEMSELVES inside their own overlay, which is exactly what being in this
    list allows. So Aruna is in it and draws the row too (JarvisLayout.tsx). The component was built for her: it takes
    `look="jarvis"` and sign-in-row.css carries her ember palette for it.

    TREE JOINED IT on 5 Oct 2026 (owner, on the run line over the tree: "remove the current top bar and add this one
    that we have in Focus mode") — TreeLayout.tsx draws the same row in its stage's overlay.

    CLASSIC V2 draws its own top too (5 Oct 2026): its first card IS the sign-in — the form, read as the builder reads
    a rule — with the pencil and Replay on its head (layouts/ClassicV2Layout.tsx). */
export const OWN_TOP: readonly RunLayoutId[] = ['focus', 'focus2', 'brief', 'jarvis', 'tree', 'classic2']

export type CanvasShelf = 'favourites' | 'archive'

/** A layout's shelf, given the favourites; a dedicated view is on neither. */
export function shelfOf(id: RunLayoutId, favourites: readonly RunLayoutId[]): CanvasShelf | null {
  if (DEDICATED.includes(id)) return null
  return favourites.includes(id) ? 'favourites' : 'archive'
}

/** The layouts on a shelf, in the switch's order. */
/* Focus is the main view (owner, 4 Oct 2026): first on either shelf, so the Canvas dropdown always leads back to it now
   the bar has no Focus button. */
export function layoutsOn(shelf: CanvasShelf, favourites: readonly RunLayoutId[]): (typeof RUN_LAYOUTS)[number][] {
  const main = RUN_LAYOUTS.filter((l) => l.value === MAIN_VIEW)
  return [...main, ...RUN_LAYOUTS.filter((l) => !DEDICATED.includes(l.value) && (shelf === 'favourites' ? favourites.includes(l.value) : !favourites.includes(l.value)))]
}

/** What the page shows before anything is chosen: Focus, the main view (owner, 4 Oct 2026). */
export const FIRST_LAYOUT: RunLayoutId = MAIN_VIEW

/* ONE VIEW ON THE PAGE (owner, 5 Oct 2026, for the build he presents: "the user comes here, adds his form, then we
   showcase one view — hide the rest: the archive, favourites and the canvas type; we focus on one type where we
   showcase all"). Off, the page head carries neither the Show (Favourites / Archive) nor the Canvas picker, and the
   page draws Focus whatever `idp.check-canvas` holds — the key is read for nothing and never written, so the stored
   pick comes back as it was when this is turned on. true brings both pickers back. */
export const CANVAS_PICKER: boolean = false

/* Aruna's way in on this page (owner, the same day: one view, nothing else to choose): off, the floating "Ask Aruna"
   on the canvas is not drawn, and with the Canvas picker off there is no other way in — her layout is on no shelf, and
   a stored 'jarvis' draws Focus (`shownLayout`). true brings the button, her entrance and her way out back. */
export const ARUNA_ENTRY: boolean = false

/** What the page draws for a stored pick: the pick itself while the pickers are on; with them off, Focus — or Aruna,
    when her own button is on and took the page there. Off with the switch (phase.ts), always the column. */
export function shownLayout(stored: RunLayoutId): RunLayoutId {
  if (!CANVAS_OPTIONS) return 'column'
  if (CANVAS_PICKER) return stored
  return ARUNA_ENTRY && isJarvis(stored) ? stored : MAIN_VIEW
}

export const RUN_LAYOUT_KEY = 'idp.check-canvas'

/** A stored value, read back: one of the switch's, else the first of them. */
export function parseRunLayout(raw: string | null): RunLayoutId {
  return RUN_LAYOUTS.some((l) => l.value === raw) ? (raw as RunLayoutId) : FIRST_LAYOUT
}

export function readRunLayout(): RunLayoutId {
  if (!CANVAS_OPTIONS) return 'column'
  try {
    return parseRunLayout(window.localStorage.getItem(RUN_LAYOUT_KEY))
  } catch {
    return FIRST_LAYOUT
  }
}

/** The layout, and the way to change it — remembered as it changes. Off with the switch, always the column; with the
    pickers off, Focus (`shownLayout`). */
export function useRunLayout(): [RunLayoutId, (next: RunLayoutId) => void] {
  const [layout, setLayout] = useState<RunLayoutId>(readRunLayout)
  const set = useCallback((next: RunLayoutId) => {
    setLayout(next)
    try {
      window.localStorage.setItem(RUN_LAYOUT_KEY, next)
    } catch {
      /* Storage refused: the choice holds for this visit. */
    }
  }, [])
  return [shownLayout(layout), set]
}
