import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, PresenceContext, motion, type Transition } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { useBrand } from '../../../store'
import { sentenceTokens, tokenValue } from '../../testing/sign-in-sentence'
import { useCheckStage } from '../canvas-shelf'
import { RunStage, type StageView } from './RunStage'
import { answer, runAction, type Action, type Answer, type AskProps, type Target } from './assistant/intents'
import { useNarrator } from './assistant/voice'
import { useWhatIfs } from './assistant/what-if'
import { BRIEF_NARROW, briefWidth, useBriefRun } from './brief-input'
import { FarFace, type FarNames } from './focus-far'
import { firstName, momentKeyOf, stateKeyOf, tallestOf, toneOf, type Moment } from './focus-model'
import { LitCtx, NoteCtx, type NoteState } from './focus-shared'
import { useFocusNarration } from './focus-speech'
import { beatsOf, fixPossessive } from './focus-voice'
import { Focus2Ask, Focus2Voice } from './focus2-ask'
import { Focus2Brief } from './focus2-brief'
import { footerBeside, saidOf } from './focus2-brief-model'
import { Focus2Full, Focus2Reveal, type Focus2Calls } from './focus2-cards'
import { CANVASBAR_FNS_LANE, CANVASBAR_H, CANVASBAR_LANE, CANVASBAR_NARROW, Focus2CanvasBar } from './focus2-canvasbar'
import { DETAILS_IN_BAR } from '../phase'
import { MORPH_HOLD, MORPH_LEAD, MORPH_STAGGER, ROW_H, STATION_OPENS, lineAt, overviewPlaces, rowLabel, type RouteRow, type StationKind, type StationSize } from './focus2-overview'
import { readFocusView, writeFocusView, type FocusView } from './focus2-view'
import { Focus2Route, LINE_S, RowFace, type RouteMood } from './focus2-route'
import { Classic2Card, Classic2Chain } from './classic2-chain'
import { glideTotal, type Glide } from './classic2-glide'
import { CARDS, chainCardOf, type CardKey } from './classic2-model'
import { SignInNode } from './classic2-pill'
import { useChainFold, useChainRun } from './classic2-run'
import type { OutcomeV2 } from './focus-outcome'
import { FAQ_EACH, FAQ_WATCHING, FOCUS2_ASK_W, FOCUS2_FLOOR_PAD, FOCUS2_ROOM_SEED, FOCUS2_SIDE_PAD, FOCUS2_TOP_PAD, checksRuleOf, eachAnswer, faqOf, presentAnswer, topQuestions, watchingAnswer, type FaqRow } from './focus2-faq'
import { COMPACT_ROOM, FAR_COMPACT, FOCUS2_DEPTH, PERSPECTIVE, answerWidth, cardWidth, depthOf, focus2Places, type Focus2Place } from './focus2-geometry'
import { usePresenter } from './focus2-pace'
import { playerKeyAction } from './focus2-player-model'
import { beatOfCard, cardName, cardsOf, pickLabel } from './focus2-story'
import { DIM_MS, playsLanding } from './focus2-draw-model'
import { Focus2Bar } from './focus2-trail'
import { trailOf } from './focus2-trail-model'
import { useFocusWhy } from './focus2-why'
import { heroFinding } from '../journey'
import type { RunLayoutProps } from './types'
import './focus.css'
import './focus2.css'

/* -----------------------------------------------------------------------------
   THE RUN AS A STORY: FOCUS (run-layout.ts `focus2`, the main view).

   v1 was a carousel of separate moments. This is the same run told as
   something a person watching can follow — who signed in, which policies were
   passed over, the one that covers them, each of its rules read in turn, the
   rule that decided, and the answer — one card open at a time, at a pace that
   can be read. Under the open card there is no bar (owner, 5 Oct 2026): the path is the
   trail, and the keys, the edge pills and the receded cards walk it. The bar that was
   there (‹ ›, the decision trail, the voice) is kept behind TRAIL_BAR; the voice has its
   own strip at the foot.

      ( [MI] Maya Iyer signs in to [logo] AWS Console · 2 sign-in conditions │ ✎ ↻ )
                                      ╎
                         ┌ [≡] Policies                 ⇕ ┐
                         └     AWS for engineering teams   ┘
                                      ╎
                         ┌ [2] Rule 2 of 3            ↗ ⇕ ┐     … or the same nodes,
                         └     Engineers on a compliant …  ┘       left to right
                                      ╎
                         ▌[✓] Outcome · Allow on 1 factor ⇕ ┐
      [▤ Vertical | ▥ Horizontal] | [❝ Brief] [? Questions] | [⇕ Expand all]

   WHAT THIS FILE OWNS is the composition, and little else. The three hard
   parts were built as modules of their own and are wired here:

     focus2-pace.ts      the presenter: the six beats of the story, how long
                         each is held, and the PRESENTED STEP `p` the whole
                         view draws at — never the host's `s`.
     focus2-geometry.ts  where every card stands: the open one centred at
                         room.w / 2, the rest receding either side of it.
     focus2-trail.tsx    the bar that stood under the card (‹ ›, the decision trail,
                         the voice), behind TRAIL_BAR (the model is focus2-trail-model.ts).
     focus2-see.tsx      What they see as a thumbnail, opening in a popover: behind
                         OUTCOME_EXTRAS, with the card's other v2 additions.

   The card bodies are v1's, imported read-only, because they were already
   right: each takes the step it is drawn at as an ordinary prop, so handing
   them `p` instead of `s` is the whole of what a presenter needed from them.
   What v2 adds around them is in focus2-cards.tsx and focus2.css — the focus
   pull as a card takes the centre, and its lines sharpening as they are
   proven.

     focus2-faq.ts       which questions this run can answer, in what order;
                         the panel's geometry; and the two answers composed
                         here rather than by the assistant's own words.
     focus2-ask.tsx      the answers panel on the left.
     focus2-overview.ts  the route map: the overview's placement of the same cards
                         (focus2-route.tsx draws its line, branches and rows).
     focus2-canvasbar.tsx  the two views, Brief and Questions, at the canvas's foot.
     focus2-view.ts      which of the two views is on, and how that is remembered.

   THE PRESENTED STEP is the one rule to hold on to when changing anything
   here: `p` is what the view draws, `s` is only how far the engine has got,
   and `p ≤ s` always. The sign-in node and the panel are handed `{...props, s:
   p}` with `running` widened by the presentation, so Replay, the "Expected ✓"
   chip and the panel's questions never arrive before the picture they are
   about.

   SIX BEATS, FOUR KINDS OF CARD. Two beats go deeper into a card that is
   already open rather than bringing a new one — the covering policy is the
   policy list a beat later, and the Then is the deciding rule's own row
   lighting — so the trail has one step per thing to look at and the path has
   one card per thing to look at. focus2-story.ts holds that mapping and says why.

   THE STORY IS TOLD ONCE (owner, 5 Oct 2026). Mounting the view plays it, and so
   does the top bar's Replay; a later Run lands at once, sharp and settled, as a
   Skip does. There is no bottom player, no Step mode, no Play again or Skip
   button — Escape still skips while it plays, and the keys and the path walk back.

   WHAT WENT, and did not come back (owner, 4 Oct 2026): the dock's "Walk
   through" button — the run IS the walkthrough now — its ‹ n / n › stepper,
   which the rail replaces, and the zoom group with Fit beside it ("no use,
   remove the zoom"). All three went by passing the dock less, never by
   editing it: the zoom group and Fit are drawn only when the dock is handed
   `stage`, and the stepper only when it is handed `controls`.

   AND THEN THE DOCK ITSELF (owner, 4 Oct 2026, pointing at it: "instead of
   this I want a left side panel with text and all, and add a good FAQ —
   because we can't provide text based on a few questions"). Its row 1 is a
   free text field, and that field is NOT conditional on any prop: it is drawn
   whenever the narrator is not speaking, the thread opens itself on focus, on
   `/` and on the chevron, and `onOpenChange` only reports. So "pass it less"
   does not reach this one, and dropping `renderAnswer` / `onAnswer` / `onCite`
   would have destroyed the parts he likes and left the field exactly where it
   was. Focus v2 therefore stops rendering `AssistantDock` altogether; the dock
   is untouched and stays exactly as Brief, Focus v1 and Jarvis use it.

   What it was the only carrier of came here instead: the questions it folded
   away are now the panel's own list (focus2-faq.ts), and the voice line with
   Stop and Voice on / off are the strip at the foot of the canvas — without which the
   narrator would be neither mutable nor stoppable, which is a regression and
   not a trade.

   CARDS, BRIEF, OR BOTH (owner, 5 Oct 2026, of the Brief view's sentence: "add this
   in the focus mode … the user can see this as a view; if needed can switch or can
   add both"). The brief is a toggle, remembered on this browser where its builder
   keeps it (`idp.focus-views`). Over the cards it is their headline and the band
   moves down under it — the places are worked out from the headline's measured
   height, so the cards' own spring carries them there. Alone it is the sentence
   centred at Brief's own size, its "How it was decided" turning the cards back on.
   focus2-brief.tsx draws the sentence and says how it moves; this file owns the
   pick and the room.

   THE OVERVIEW (owner, 5 Oct 2026: "try a type of view, the overview, in an
   animated way … on card view when I switch, all the cards should animatedly
   organise, and vice versa", and "Overview first"). The cards have two
   ARRANGEMENTS — the route map (focus2-overview.ts), which is the default, and one
   card at a time — at most one on, kept under `idp.focus-arrange`. They are the
   same cards in the same slots: the arrangement only swaps which placement feeds
   the slots, so a switch springs every card from where it stands to where it goes,
   the carousel's turn flattening onto the line. Around that spring the route's
   own marks draw in after the cards are most of the way there, and leave before
   they fly back (focus2-route.tsx); the open card's full face fades as it leaves
   the centre and racks back in once it has nearly returned. On the map a press on
   a card opens it in the carousel; an answer's citation lights it in place.

   TWO BARS (owner, 5 Oct 2026: "segregate both: one for the form, one for the
   canvas functions"). The row on top is the sign-in and nothing else; Questions,
   the views and the voice are the canvas's own bar at its foot
   (focus2-canvasbar.tsx), where the voice strip stood.

   SEVERAL IDENTITIES IN ONE RUN (owner, 5 Oct 2026: "one run each, switch"). The
   canvas still tells one; the sign-in node holds a chip per identity to switch
   (classic2-pill.tsx), and the questions add "What does each one get?" under the
   decision (focus2-faq.ts `eachAnswer`), read off each identity's own plan.

   TWO VIEWS AND TWO FUNCTIONS (owner, 5 Oct 2026, for the build he presents: "in
   focus mode Brief and Questions are two functions, and I want 2 views … so 2 views
   and 2 functions. Remove the audio part completely, no use"). The bar is the pair
   Vertical | Horizontal, one always on (focus2-view.ts, Vertical first), and the
   Brief and Questions toggles; Overview, Cards and the voice went from it.
     · The brief is a function over either view — the headline over the cards —
       and never the canvas alone any more, so a view is always drawn.
     · The cards one at a time are NOT a view ("in the overview, if we click one
       card it converts into the card view, which is okay, but we don't call it a
       dedicated view … I must be able to go back"): a station pressed on the
       Horizontal view opens them at that card, the bar keeps Horizontal pressed and
       grows a Back, and Back, Escape or Horizontal again morph back to the route.
     · The voice is behind FOCUS_VOICE: no line, no Stop, no Voice on / off, and
       nothing said — not the story, not an answer. The narrator is still mounted,
       because a hook cannot be, and assistant/voice.ts is the other views' as it was.

   ONE PRODUCT, TWO SHAPES (owner, the same day: "Classic v2 should be merged here as
   it is, as a vertical card view … redo the Overview cards like that — the same
   experience from both"). Both views are drawn with Classic v2's own cards
   (classic2-chain.tsx), read off the presented run (classic2-run.ts), so a card
   looks and folds the same in either:
     · VERTICAL is Classic v2's chain itself: its first node, its connectors, its
       cards opening as the story reaches them and folding when it lands. A press
       opens or folds a card, as on the builder — never the carousel.
     · HORIZONTAL was the route (focus2-overview.ts), and is kept behind ROUTE_MAP:
       see ONE CHAIN, TWO SHAPES.

   ONE NODE FOR THE SIGN-IN (owner, 5 Oct 2026, later: "remove the first node, the
   sign-in node … the first pill-shaped node should be the node as we have in the
   top, so we can showcase 'Maya Iyer signs in at AWS with 2 sign-in conditions' …
   remove the sign-in node and the top node; and make the main pill node editable.
   Also move the Expand all button to the bottom bar"). There is no sign-in row on
   top any more, and no sign-in card: the chain's first node is the sign-in itself
   (classic2-pill.tsx) — who signs in to what and how many conditions it states,
   pressed to edit it, with the pencil and Replay at its end and the identity chips
   in it for a Run of several — and the chain is its three cards after it. The
   stage's top pad is only the canvas's own now. Expand all / Collapse all is the
   canvas's bar's last button.

   ONE CHAIN, TWO SHAPES (owner, 5 Oct 2026: "change the horizontal mode the same as
   the vertical mode, so on click the cards themselves should convert into vertical
   — no need to add all those extra cards, just 4 simple cards will be enough. Give
   me a good transition experience"). Horizontal is the same chain laid across the
   canvas: the node on the left, the three cards after it, top-aligned on their
   heads, the connectors on their side — nothing else on the canvas. The switch IS
   the transition: the bar's pair answers at once; the connectors fade; the chain
   takes its other shape (`shape`, a beat behind `view`), and the very same node and
   cards glide from their old boxes to their new ones, landing 40 ms apart with the
   node first (classic2-glide.ts); once they have landed the connectors are drawn
   again, the new way. A card open stays open through it. The route, its carousel
   and the bar's Back are behind ROUTE_MAP.

   THE WHY (6 Oct 2026; phase.ts `WHY_IN_FOCUS`). How to get in, Let in for a while,
   What changed, Copy summary, the conflicts and As each group — the troubleshooting
   built on 5 Oct — are the why's (WhyCard.tsx), and only the column's answer opened
   it: this view never read the page's `why`, so none of it could be reached from the
   view the owner presents. Now the outcome card's body ends in one quiet link
   (classic2-chain.tsx `ChainWhy`: "Why", "Review conflict", "Why, and how to get in"),
   offered by the column's own rule once the presented run has landed, and the why is
   drawn into the page's right-hand panel (`why.slot`) while it is open on it — out of
   the stage, so nothing pressed in the panel reaches the stage's own presses. One
   panel: the inspector taking it shuts the why, and the why taking it shuts the
   inspector. focus2-why.tsx reads it all as EngineJourney.tsx does.
   -------------------------------------------------------------------------- */

/* THE ROUTE MAP (owner, 5 Oct 2026: "just 4 simple cards will be enough"): Horizontal is the chain laid across the
   canvas now. The route — its stations, sidings and branches — the cards one at a time it opened, and the bar's Back
   that returned from them are kept behind this, none of them drawn or reachable; true brings them back as they were. */
const ROUTE_MAP = false

/* ONE VIEW (owner, 5 Oct 2026, later the same day: "Hide the horizontal part from the main focus view — we will go
   with one, only the vertical; will think about it later"). Off: Focus always draws Vertical, a stored 'horizontal'
   is ignored, and the bar has no Vertical | Horizontal pair. Horizontal itself — the row and the glide between the two
   — is kept whole; true brings the pair back. A test's static render may still hand `initialView`. */
const HORIZONTAL_VIEW = false

/* The canvas's own room on top, and the path's either side (focus2-faq.ts, with the panel's). */
const TOP_PAD = FOCUS2_TOP_PAD
const SIDE_PAD = FOCUS2_SIDE_PAD
/* The landed card's v2 additions (two questions, the group finding, the thumbnail): the owner preferred the older card
   on 5 Oct 2026, so it draws without them; true brings them back. */
const OUTCOME_EXTRAS = false
/* The bar under the card (‹ ›, the decision trail, the voice): the owner removed it on 5 Oct 2026; the path and the
   keys walk the story. true brings it back, the voice inside it. */
const TRAIL_BAR = false
/* The voice in Focus (owner, 5 Oct 2026: "remove the audio part completely, no use"): no line being said, no Stop, no
   Voice on / off, and the narrator never speaks here — not the story's lines, not a question's answer. true brings
   all of it back as it was, in the canvas's bar. */
const FOCUS_VOICE = false
/* The room kept under the path for the canvas's bar, so no card and no map runs under it. The bar is CANVASBAR_H tall
   and SIDE_PAD off the canvas's foot, and the world already stops FOCUS2_FLOOR_PAD above that foot, so it reaches
   16 + 40 − 24 = 32 into the world; a step of air over it makes 40. It was 56 while the bar carried the voice; the
   bar under the card (TRAIL_BAR) keeps its own 56. */
const BAR_AIR = 8
const TRAIL_H = 56
const PLAYER_H = TRAIL_BAR ? TRAIL_H : SIDE_PAD + CANVASBAR_H - FOCUS2_FLOOR_PAD + BAR_AIR
/* What those additions cost in height, over what tallestOf plans for: the two questions, the thumbnail row, and (for a
   person in more than one group) the finding. Only counted when OUTCOME_EXTRAS is on. */
const OUT_QS = 30
const OUT_SEE = 126
const OUT_GROUP = 82
/* The story has been told once this session (owner, 5 Oct 2026): from then on a new Run lands at once, and only
   mounting the view or a Replay tells it again. A module variable so it outlives the view, and sessionStorage so it
   outlives a reload of the view's code; both guarded, because storage throws in a private window. */
const TOLD_KEY = 'f2-story-told'
function readTold(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(TOLD_KEY) === '1'
  } catch {
    return false
  }
}
let storyTold = readTold()
function markTold() {
  storyTold = true
  try {
    window.sessionStorage.setItem(TOLD_KEY, '1')
  } catch {
    /* Blocked site data: the flag still holds for as long as the page does. */
  }
}
/* A far face's height, for the line the edge pills sit on. */
const FAR_H = 152
const FAR_H_COMPACT = 178
/* How long "Deciding" is read before the verdict is built into the same box. The engine settles the outcome on one
   step, so this half-second is the presentation's own. */
const DECIDING_MS = 520
/* Only this moves a card: one spring, no overshoot (the view's one motion language). */
const SPRING: Transition = { type: 'spring', stiffness: 190, damping: 26, mass: 1 }
const NONE: Transition = { duration: 0 }
const EASE = [0.2, 0, 0, 1] as const
/* A card put on the path fades in where it stands, before the row turns to it. */
const ARRIVE = 0.16
/* The verdict's own build is animated for this long after the presented landing, whatever the host's `animate` says:
   the presentation is still running when the engine has stopped. */
const LANDING_MS = 1800
/** The brief's fallback cue: this long after a landing whose cards stay open, it comes anyway. */
const BRIEF_AFTER_MS = 1600
/* The brief over the cards (Both): its headline is at most this wide, and the cards stand this far under it. Before
   the headline has been measured — a static paint — it is planned at two lines and the finding line. */
const HEAD_W = 760
const HEAD_GAP = 12
const HEAD_SEED = 112
/* A view turned on or off moves the cards even on a run drawn sharp: for this long their spring runs whatever
   `instant` says, so the band glides to its new place rather than jumping there. */
const VIEW_MOVE_MS = 900
/* THE MORPH between the route and the carousel. Out to the route the cards leave together, ~40 ms apart from the
   presented one outwards, and the line draws once they are most of the way there (focus2-overview.ts `lineAt`, worked
   out from the number of cards and the spring); back, they wait while the rows fade and the line un-draws. On the way
   a card's two looks cross: the route's (its station's Classic v2 card, or its row) fades as it leaves, the carousel's
   far face fades in as it travels, and back again. The open card's full face fades over the first part of the way
   out, and racks back in once the card has nearly reached the centre again — not where it starts, on its station.

   NOTHING HEAVY WHILE THE CARDS FLY (measured 5 Oct 2026, frame by frame in Chrome). A spring is timed, so a frame
   the browser spends drawing something new is a card first seen a third of the way there. So the cards wait out the
   press's own frame (MORPH_LEAD), and the leaving full face is only taken away once nothing moves. The arriving one is
   built AT the press, so React's part is done before anything moves, but not drawn until its card — leading the way
   home, the others following by their distance from it — has landed (focus2-overview.css `is-arriving`): drawing it
   at the press stalled the start by a third of a second, and building it on arrival held the card bare at the centre
   for half a second. Then it racks in. Every face stands out of the flow at its own width meanwhile, centred on the
   card, so the card's own width can spring without re-flowing any of them. */
const FULL_FADE: Transition = { duration: 0.14, ease: EASE }
/* A look crossing to the other on the way: the leaving one goes as the card starts to move, the arriving one comes
   just behind it. */
const FACE_OUT = 0.2
const FACE_IN = 0.28
const FACE_LAG = 0.05
/* The carousel's edge pills, opened from the route: once its cards are most of the way in. */
const EDGES_LAG = 0.3
/* Its rack is the pull without the blur: a blur over a face this size was a tenth of a second a frame to draw. */
const FULL_HIDDEN = { opacity: 0, scale: 0.985 }
const FULL_RACK_IN = { opacity: 1, scale: 1 }
const FULL_RACK: Transition = { delay: 0.62, duration: 0.36, ease: EASE }
/* The band leaving and coming back: it fades and sinks, and rises in from below. */
const BAND_FADE: Transition = { duration: 0.3, ease: EASE }
const BAND_SINK = 16
/* VERTICAL (Classic v2's chain). A body folding takes this long (classic2-chain.tsx); once the landed chain has folded,
   it is fitted down to FIT_MIN at the least — Classic v2's own floor — and when it is taller even then, the outcome is
   kept in view at zoom 1 instead. */
const FOLD_S = 0.26
const FIT_MIN = 0.85
/* THE SWITCH between the chain's two shapes (ONE CHAIN, TWO SHAPES). The connectors fade first, over LINKS_OUT_MS, and
   only then does the chain take its new shape, so no line is ever seen turning on its side; they are drawn again once
   the last of its four boxes — the node and its three cards — has landed (classic2-glide.ts `onLanded`)… */
const LINKS_OUT_MS = 120
const GLIDE_BOXES = 4
/* …and should the browser not say so (a node that did not move), they come back this long after it would have. */
const LINKS_LATE_MS = 300
/* Across, where the row stands: this far down the room over the canvas's bar, a touch above the middle where the eye
   rests, so the cards the story opens have room to grow down under it — planned for a row of folded heads, ROW_SEED
   tall. With the brief on it stands under the headline, and moves only if the headline would reach it. */
const ROW_RISE = 0.4
const ROW_SEED = 120
const ROW_GAP = 24
/* The route's stations are Classic v2's cards, and each station kind is one of the chain's four. */
const CARD_OF: Record<StationKind, CardKey> = { sign: 'sign-in', policies: 'policy', rule: 'rule', outcome: 'outcome' }
/** A route station's rule card hands its passed-over rules to the rows above it, so it says none of them itself. */
const NO_PASSED: [] = []
/** The cards a chain without its sign-in card draws: what its fold opens and folds. */
const chainCards = (shown: readonly CardKey[]): CardKey[] => shown.filter((k) => k !== 'sign-in')
/** A face standing out of the flow at its own width, centred on its card while the card's own width springs. */
const faceBox = (w: number): CSSProperties => ({ position: 'absolute', top: 0, left: `calc(50% - ${w / 2}px)`, width: w })

/* The ground the path stands on: the canvas inside its side padding, and the height under the canvas's top pad and over
   the voice strip. `ready` once it has been read off the canvas, so the camera is never fitted to the guess.

   The panel's own width is NOT taken off here. What it costs depends on whether it is open, and whether it is open
   depends on what it would cost (A4) — so both are worked out in the body, from `ground`, where the one answer can
   be given once. */
function useGround(el: HTMLElement | null): { w: number; h: number; ready: boolean } {
  const [room, setRoom] = useState({ w: FOCUS2_ROOM_SEED, h: 620, ready: false })
  useLayoutEffect(() => {
    const ground = el?.closest<HTMLElement>('.rstage')
    if (!ground) return
    const read = () => {
      const w = Math.round(ground.clientWidth - 2 * SIDE_PAD)
      const h = Math.round(Math.min(860, Math.max(420, ground.clientHeight - TOP_PAD - FOCUS2_FLOOR_PAD - 4)))
      setRoom((r) => (r.w === w && r.h === h && r.ready ? r : { w, h, ready: true }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(ground)
    return () => ro.disconnect()
  }, [el])
  return room
}

/** The path's width once something has taken `take` off the ground: the band's own clamp, in one place. */
const pathWidth = (ground: number, take: number) => Math.round(Math.min(1480, Math.max(560, ground - take)))
/** The least lane the chain down the canvas is handed (its column 48 under it): only a canvas narrower than any the
    console draws Focus on reaches it — 1280 with both panels open leaves 305. */
const CHAIN_LANE_MIN = 280

/* What the route's station cards measure, for focus2-overview.ts: each head's own words (its title block and the
   head's padding — not the head, which the route evens out to the tallest), and what its body adds once open (the
   body's natural height, read while it is still opening). Layout px, which the stage's zoom does not touch. Read on
   every resize of a card, but set only when a number moves, so a body opening — a resize every frame — draws nothing
   again until it has a new size to give; the rows under it then spring to make room while it opens. */
function useStationSizes() {
  const [sizes, setSizes] = useState<Partial<Record<StationKind, StationSize>>>({})
  const els = useRef(new Map<string, { kind: StationKind; el: HTMLElement }>())
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const ro = useRef<ResizeObserver | null>(null)
  const read = useCallback(() => {
    setSizes((was) => {
      const now: Partial<Record<StationKind, StationSize>> = {}
      for (const { kind, el } of els.current.values()) {
        const head = el.querySelector<HTMLElement>('.bb__cardhead')
        /* The head's pieces as the route lays them out (focus2-overview.css): the tile, the step and the buttons, then
           the title and the meta line. Their span, not the head's box, which the route evens out. */
        const parts = head ? [...head.querySelectorAll<HTMLElement>(':scope > .bb__idx, :scope > .bb__cardmeta, :scope > .bb__title > *')] : []
        if (!head || parts.length === 0) continue
        const cs = getComputedStyle(head)
        const top = Math.min(...parts.map((x) => x.offsetTop))
        const bottom = Math.max(...parts.map((x) => x.offsetTop + x.offsetHeight))
        const h = Math.ceil(bottom - top + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom))
        const body = el.querySelector<HTMLElement>('.bb__tbody')
        const b = body ? body.scrollHeight : (was[kind]?.body ?? 0)
        const had = now[kind]
        now[kind] = { head: Math.max(had?.head ?? 0, h), body: Math.max(had?.body ?? 0, b) }
      }
      const same = (Object.keys(now) as StationKind[]).every((k) => was[k] && Math.abs((was[k]?.head ?? 0) - (now[k]?.head ?? 0)) < 1 && Math.abs((was[k]?.body ?? 0) - (now[k]?.body ?? 0)) < 1)
      return same && Object.keys(was).length === Object.keys(now).length ? was : now
    })
  }, [])
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(() => read())
    ro.current = o
    for (const { el } of els.current.values()) o.observe(el)
    return () => {
      o.disconnect()
      ro.current = null
    }
  }, [read])
  /* One ref per card slot (a rule read at the station hands it on to the next), kept so a render does not re-observe. */
  const measure = useCallback(
    (kind: StationKind, slot: string) => {
      const id = `${kind}|${slot}`
      let fn = refs.current.get(id)
      if (!fn) {
        fn = (el: HTMLElement | null) => {
          const had = els.current.get(id)
          if (had) ro.current?.unobserve(had.el)
          if (el) {
            els.current.set(id, { kind, el })
            ro.current?.observe(el)
          } else els.current.delete(id)
          read()
        }
        refs.current.set(id, fn)
      }
      return fn
    },
    [read],
  )
  return { sizes, measure }
}

/** How the cards are placed: the route map, or one at a time. */
type Arrange = 'overview' | 'cards'

export default function Focus2Layout(
  props: RunLayoutProps & {
    /** The view on first paint (a test's static render); else the viewer's last pick, else Vertical. */
    initialView?: FocusView
    /** The brief on first paint (a test's static render); else the viewer's last pick. */
    initialBrief?: boolean
    /** The cards one at a time over the Horizontal view on first paint (a test's static render). */
    initialCarousel?: boolean
    /** The Questions panel open on first paint (a test's static render); else shut until the bar opens it. */
    initialAsk?: boolean
  },
) {
  const { plan, s, animate, reduced, jumped, runKey, form, asGroup, running } = props
  const look = useCheckStage()
  const { users, apps, zones } = useBrand()
  const stageRef = useRef<StageView | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  /* The root as state too: the What they see popover is drawn into it, and cannot be until it exists. */
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const setRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el
    setRootEl(el)
  }, [])
  const bandRef = useRef<HTMLDivElement | null>(null)
  const [worldEl, setWorldEl] = useState<HTMLDivElement | null>(null)
  const ground = useGround(worldEl)

  // --- The answers panel, and what it leaves the path ---
  /* The admin's own pick, null until they make one, and null again on every Run and Replay (the reset block below).
     Null is SHUT (owner, 5 Oct 2026: "when I run or replay in the focus mode don't open the question panel by
     default — it should not be in view; on click open the question panel"): it used to follow the room and open
     itself wherever a column fitted. Only the bar's Questions opens it. */
  const [askBy, setAskBy] = useState<boolean | null>(() => (props.initialAsk ? true : null))
  const askOpen = askBy ?? false
  /* The ONE number both levers read: the path's room, and the world's own box. Open it in a room that cannot hold
     it and the path is zoomed down to fit rather than overflowing — small but whole, and nothing under the panel.
     (`room` is worked out under the chain's shape, below: the chain down the canvas narrows instead.) */
  /* Shut, the panel takes no room at all: its toggle is the canvas's bar's (5 Oct 2026), not a rail at the edge. */
  const askW = askOpen ? FOCUS2_ASK_W : 0

  // --- What the canvas shows: one of two views, and the brief over it ---
  /* The view is Vertical or Horizontal, one always on (owner, 5 Oct 2026: "2 views and 2 functions … Vertical by
     default"), under its own key (focus2-view.ts), so neither the overview's nor the views' older keys can pick it.
     The brief is a function over either: its flag stays where its builder keeps it (`idp.focus-views`: anything but
     'cards' has it on), and it is never the canvas alone now. A test's static render hands any of the three. */
  const [view, setView] = useState<FocusView>(() => props.initialView ?? (HORIZONTAL_VIEW ? readFocusView() : 'vertical'))
  /* The brief is ON for every run by default and shows once the run has landed and its cards have folded (owner,
     6 Oct 2026: "after the run is done, when all the cards collapse, show the brief at the top by default — if the
     user wants they can hide it"). The bar's Brief hides it for this run; the next Run brings it back (the reset
     block below). A press on Brief while the run plays shows it at once (`briefPressed`). Its old remembered flag
     (`idp.focus-views`) is no longer read: a default that a past press could switch off was not a default. */
  const [briefOn, setBriefOn] = useState<boolean>(() => props.initialBrief ?? true)
  /* The cards one at a time, opened over the Horizontal view by a press on a station: not a view, so never stored, and
     a new run (the reset block below) or the other view lands on the view itself. Only the route opens it (ROUTE_MAP). */
  const [carouselOn, setCarouselOn] = useState<boolean>(() => ROUTE_MAP && props.initialCarousel === true)
  /* How the story's cards are placed. The chain draws Vertical, and Horizontal too unless the route is back (ROUTE_MAP):
     the route, or the carousel over it, are not the chain at all — so `arrange` only means something there. */
  const vertical = view === 'vertical'
  const chained = vertical || !ROUTE_MAP
  const arrange: Arrange = !chained && !carouselOn ? 'overview' : 'cards'
  const route = !chained && arrange === 'overview'
  /* Over the route's carousel: the bar's Back, and Escape, return to the route. */
  const drilled = !chained && carouselOn
  /* The chain's own shape, a beat behind the view on a switch (ONE CHAIN, TWO SHAPES): the connectors fade first, then
     the chain takes it and its nodes glide; `linksOn` draws them again once they have landed. */
  const [shape, setShape] = useState<FocusView>(view)
  const [linksOn, setLinksOn] = useState(true)
  const across = chained && shape === 'horizontal'
  /* The path's room. The chain down the canvas is a column that narrows with its lane (classic2.css `.rl-c2__chain`), so
     it is never handed more than the lane holds: the band's 560 floor (`pathWidth`) made its world wider than the lane
     left beside the questions on a canvas the Check access panel had already narrowed, and the chain ran under the
     panel (5 Oct 2026: 1440 with both open, 28 px under it). CHAIN_LANE_MIN is only the floor of a lane gone silly. */
  const down = chained && !across
  const room = { w: down ? Math.min(pathWidth(ground.w, askW), Math.max(CHAIN_LANE_MIN, ground.w - askW)) : pathWidth(ground.w, askW), h: ground.h, ready: ground.ready }
  /* The headline's height over the cards, measured off its unseen copy (focus2-brief.tsx); 0 until it has been. */
  const [headH, setHeadH] = useState(0)
  /* The brief was opened by a press on this run: its words sweep in even when the run was drawn sharp. */
  const [briefPressed, setBriefPressed] = useState(false)
  /* Until when the cards glide to a place a view change gave them, however the run was drawn: a mark taken at the
     press, so the very render that moves them already has the spring (an effect would come a frame too late). */
  const moveUntil = useRef(0)
  /* The morph between the two arrangements, marked at the press for the same reason: when, and which way. */
  const [morph, setMorph] = useState<{ at: number; to: Arrange }>({ at: -Infinity, to: arrange })
  /* Every change of view, and the carousel opened or left over Horizontal, goes through here: where the cards' placing
     changes on Horizontal, they morph from where they stand; a change of view is the one view leaving as the other
     arrives, the camera gliding to the new one's zoom. */
  const shift = useCallback(
    (nextView: FocusView, nextCarousel: boolean) => {
      const next: Arrange = nextView === 'horizontal' && !nextCarousel ? 'overview' : 'cards'
      if (nextView === 'horizontal' && view === 'horizontal' && next !== arrange) setMorph({ at: performance.now(), to: next })
      if (next !== arrange || nextView !== view) moveUntil.current = performance.now() + VIEW_MOVE_MS
      setView(nextView)
      setCarouselOn(nextCarousel)
    },
    [arrange, view],
  )
  /* The bar's pair: the other view, remembered — or Horizontal pressed again over the carousel, back to the route.
     The pair is pressed at once; the chain's shape follows once its connectors have faded, and the camera glides with
     it (`moveUntil`, taken as the shape changes). Pressed again before the move is over, the latest press wins. */
  const switchAt = useRef<number[]>([])
  useEffect(() => () => switchAt.current.forEach((t) => window.clearTimeout(t)), [])
  const pickView = useCallback(
    (v: FocusView) => {
      if (v === view && !(v === 'horizontal' && carouselOn)) return
      shift(v, false)
      if (v !== view) writeFocusView(v)
      switchAt.current.forEach((t) => window.clearTimeout(t))
      switchAt.current = []
      if (ROUTE_MAP || reduced) {
        setShape(v)
        setLinksOn(true)
        return
      }
      setLinksOn(false)
      switchAt.current = [
        window.setTimeout(() => {
          moveUntil.current = performance.now() + VIEW_MOVE_MS
          setShape(v)
        }, LINKS_OUT_MS),
        /* The chain says when its last node has landed (`glide.onLanded`); this is only the floor under that. */
        window.setTimeout(() => setLinksOn(true), LINKS_OUT_MS + Math.round(glideTotal(GLIDE_BOXES) * 1000) + LINKS_LATE_MS),
      ]
    },
    [view, carouselOn, shift, reduced],
  )
  const backToRoute = useCallback(() => shift('horizontal', false), [shift])
  const pickBrief = useCallback((brief: boolean) => {
    if (brief) setBriefPressed(true)
    moveUntil.current = performance.now() + VIEW_MOVE_MS
    setBriefOn(brief)
  }, [])

  // --- How the story is told: on its own ---
  const [paused, setPaused] = useState(false)
  /* The pointer is resting on the open card: the story waits for the reader (owner: "hovering the card pauses it"). */
  const [reading, setReading] = useState(false)
  /* SKIP, and only Skip (owner, 4 Oct 2026: "add the animation when I go forward and backward manually").

     This was `took` — one flag for Skip AND for every move the admin made by hand, on the argument that a focus pull
     is how a story arrives rather than how a picture answers a press. The owner stepped through a run and found the
     opposite: moving by hand with nothing moving on screen is the picture jump-cutting, and the step reads as a glitch
     rather than as going somewhere. A manual step is still a card taking the centre, so it still racks into focus —
     the admin is driving the clock instead of the presenter, and that is the only difference.

     Skip keeps its sharpness, because Skip's whole purpose is to stop presenting and show the answer NOW: a pull on
     the way to it would be the wait the press exists to escape. */
  const [skipped, setSkipped] = useState(false)
  /* The card under the pointer, or the one a trail step under it stands for: the path lifts it, the trail marks its step. */
  const [hover, setHover] = useState<number | null>(null)
  /* Which beat the admin is looking at once the story is told. It is the view's own, not the presenter's, because
     the presenter stops answering a jump the moment it starts following the engine — see `told` below. */
  const [browse, setBrowse] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [answerOn, setAnswerOn] = useState<Answer | null>(null)
  /* Which question the answer on the head came from, and every question asked on this run. An asked row is MARKED,
     never removed (owner: the dock's habit of taking them away is the opposite of what he asked for). */
  const [askedOn, setAskedOn] = useState<string | null>(null)
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set())
  /* Bumped by every press, and the answer head's key: that is what makes the words sharpen in AGAIN when a question
     already asked is pressed again. `PartsLine`'s blur is each word's `initial`, which only runs on mount, so
     without a new key the same answer would simply reappear sharp. */
  const [askSeq, setAskSeq] = useState(0)
  const [cite, setCite] = useState<Target | null>(null)
  /* Pinned by a press of the view's own: What they see (the outcome's), lit as an answer's target is. */
  const [pin, setPin] = useState<Target | null>(null)
  /* Bumped by the one clock this file keeps of its own: the half-second of "Deciding". */
  const [, setTick] = useState(0)
  const lit: Target | null = cite ?? pin ?? answerOn?.focus ?? null
  /* What they see, opened from its thumbnail (or by the `see` action). */
  const [seeOpen, setSeeOpen] = useState(false)
  /* The top bar's Replay is "tell it again": it sets this before it calls the real one, and the new run reads it. */
  const tell = useRef(false)
  /* The run key a story is NOT told for: a new Run after the first lands at once, as a Skip does. */
  const [quickKey, setQuickKey] = useState<number | null>(null)

  const born = useRef(new Set<string>())
  /* A new run — Run, Replay, or a view change, which all arrive as a new `runKey` (types.ts) — is a new story: the
     presenter starts it again from the sign-in, and the view gives back everything the admin had taken. */
  const [seen, setSeen] = useState(runKey)
  if (seen !== runKey) {
    setSeen(runKey)
    setSkipped(false)
    setPaused(false)
    setReading(false)
    setHover(null)
    setBrowse(null)
    setNote(null)
    setPin(null)
    setAnswerOn(null)
    setAskedOn(null)
    setAsked(new Set<string>())
    setAskSeq(0)
    setAskBy(null)
    setCite(null)
    setSeeOpen(false)
    /* The view stays as picked; the brief is back on for every run (owner, 6 Oct 2026), shown once it lands. The
       carousel over Horizontal was about the run it was opened on, so a new one lands on the route. */
    setBriefOn(true)
    setBriefPressed(false)
    setCarouselOn(false)
    /* Told on mount and on Replay; a Run after the first of the session lands straight away. */
    setQuickKey(!tell.current && storyTold ? runKey : null)
    tell.current = false
    born.current = new Set<string>()
  }
  /* Sharp and settled for this run: the host's own `jumped`, or a new Run after the story has been told. */
  const settled = jumped || quickKey === runKey
  /* The same landing a Skip makes: the engine's own clock is told to land, so the answer is there at once and not at
     the engine's own pace. */
  const { onLand } = props
  useEffect(() => {
    if (quickKey === runKey) onLand?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per new run
  }, [quickKey, runKey])

  const held = paused || reading
  const pace = usePresenter({ plan, s, runKey, reduced, jumped: settled, paused: held })
  const { p, beat, reached, beats, clock, presenting, jumpTo, skip: skipPace } = pace
  const landed = pace.landed
  /* Sharp and in place: reduced motion, a run drawn settled, or a Skip. Stepping by hand is NOT in this list — see
     `skipped`. */
  const instant = reduced || settled || skipped
  /* The brief over the cards: on, the run landed AND its cards folded (owner, 6 Oct 2026: "after the run is done,
     when all the cards collapse, show the brief") — or Brief pressed while it plays. The fold is read further down
     (`folds`), so it is latched per run in `briefDue` by the effect beside it; a run drawn sharp is folded already.
     Never over an empty canvas: before anything is run there is no sentence to show. */
  const [briefDue, setBriefDue] = useState<number | null>(null)
  const due = briefDue === runKey || (instant && landed)
  const both = briefOn && (briefPressed || (landed && !plan.empty && due))

  useEffect(() => {
    if (presenting) markTold()
  }, [presenting])

  /* The top bar's Replay is the one way to hear the story again: it says so first, and the new run it starts reads
     that. Any other new run lands at once. */
  const { onReplay: hostReplay } = props
  const replay = useMemo(
    () =>
      hostReplay
        ? () => {
            tell.current = true
            hostReplay()
          }
        : undefined,
    [hostReplay],
  )
  /* The presented step, and `running` widened by the presentation: everything downstream reads the picture's step and
     not the engine's — the sign-in node, the panel, and Classic v2's cards in both views. */
  const presented = useMemo<RunLayoutProps>(() => ({ ...props, s: p, running: running || presenting, onReplay: replay }), [props, p, running, presenting, replay])

  // --- The why, in the page's right-hand panel (THE WHY) ---
  /* Offered, and drawn, only once the presented run has landed and nothing plays: never before the picture has reached
     the answer it is about. The page's panel says whether it is open; the outcome card's link opens and shuts it. */
  const whyDone = landed && !running && !presenting
  const focusWhy = useFocusWhy(props, whyDone, rootRef)

  // --- Classic v2's cards: the Vertical view's chain, and the Horizontal view's stations ---
  const chain = useChainRun(presented)
  const identityKey = props.identities?.find((i) => i.active)?.key ?? ''
  /* Vertical: open as the story reaches each card, folded once it lands — Classic v2's fold. Horizontal: the heads, so
     the route reads at a glance; a station's fold opens it in place. Each view's presses stand until the next run. */
  /* The chain's own cards: Focus draws no sign-in card, so the fold-all and its words count only the three. */
  const vFold = useChainFold(`${runKey}:${identityKey}`, chainCards(chain.shown), chain.landed)
  const hFold = useChainFold(`${runKey}:${identityKey}:route`, CARDS, true)
  const { 'sign-in': signOpen, policy: policyOpen, rule: ruleOpen, outcome: outOpen } = hFold.open
  const stationOpen = useMemo<Partial<Record<StationKind, boolean>>>(() => ({ sign: signOpen, policies: policyOpen, rule: ruleOpen, outcome: outOpen }), [signOpen, policyOpen, ruleOpen, outOpen])
  const { sizes: stationSizes, measure } = useStationSizes()

  /* The story is told: it has caught up with the engine and the answer is on screen.
     From here the presenter FOLLOWS THE ENGINE and will not take a jump — `jumped()` and `released()` in
     focus2-pace.ts both return the state unchanged once `following` is set, and a Skip, a revisit and reduced motion
     all set it. So the rail would be full of pressable segments that do nothing, which is most of what the player is
     for. The beat the admin is looking at is therefore the view's own from here on; `p` is not touched, because a run
     that has landed draws every card in its settled state anyway, so browsing only moves which card is open. */
  const told = !presenting
  const beatShown = told && browse !== null ? Math.max(0, Math.min(browse, beats.length - 1)) : beat

  // --- The cards the beats open ---
  const story = useMemo(() => cardsOf(beats.map((b) => b.beat), plan), [beats, plan])
  /* Progressive, as the 3 Oct ruling asks: a card is put on the path only once the story has reached it — the
     outcome included, so the answer is never waiting on stage while its own run is still being read. */
  const count = landed ? story.cards.length : Math.max(1, story.cards.filter((c) => p >= c.at).length)
  const shown = useMemo(() => story.cards.slice(0, count), [story, count])
  const focus = Math.max(0, Math.min(count - 1, story.ofBeat[beatShown] ?? 0))
  const openCard = shown[focus]
  const openKey = openCard?.key ?? null
  const tone = toneOf(plan)

  const person = users.find((u) => u.id === form.personId) ?? null
  const first = asGroup ?? (person ? firstName(person.name) : plan.conflicts?.personName ? firstName(plan.conflicts.personName) : 'them')
  const personName = asGroup ? `Anyone in ${asGroup}` : (person?.name ?? plan.conflicts?.personName ?? 'Someone')
  const app = apps.find((a) => a.id === form.appId) ?? null
  const names = useMemo<FarNames>(() => ({ person: personName, first, group: !!asGroup, appId: app?.id ?? null, appName: app?.name ?? plan.appName ?? 'the application' }), [personName, first, asGroup, app, plan.appName])

  // --- Where every card stands ---
  const compact = room.w < COMPACT_ROOM
  const cw = cardWidth(room.w)
  const farW = compact ? FAR_COMPACT : cw
  /* The answer is the one wide card: its words stand beside What they see, so the verdict lands in the same box it
     was deciding in. */
  const outWide = props.screens.length > 0 && form.appId !== null
  const multi = !asGroup && (plan.asEachGroup?.groups.length ?? 0) > 1
  const facts = sentenceTokens(props.rows).filter((t) => t !== 'person' && t !== 'app').length
  const planned = useMemo(
    () => tallestOf(plan, shown, facts, outWide) + (OUTCOME_EXTRAS && shown.some((m) => m.kind === 'outcome') ? OUT_QS + (outWide ? OUT_SEE : 0) + (multi ? OUT_GROUP : 0) : 0),
    [plan, shown, facts, outWide, multi],
  )
  /* Both: the headline takes the top of the world and the band is what is left under it. The band's box still starts
     at the world's top — only the places move down — so a view change is the cards' own spring and not a jump. */
  const headSpace = both ? (headH > 0 ? headH : HEAD_SEED) + HEAD_GAP : 0
  const bandH = Math.max(220, room.h - PLAYER_H - headSpace)
  const top = headSpace + Math.round(Math.max(4, (bandH - Math.min(bandH, planned)) / 2))
  /* A headline and the run's tallest card that cannot both stand over the voice strip make the world taller rather than
     overlapping, and the stage's own fit zooms it down to the canvas. Read over the whole story, not the cards shown so
     far, so the zoom is the run's and does not step as the cards arrive. */
  const tallest = useMemo(() => (both ? tallestOf(plan, story.cards, facts, outWide) : 0), [both, plan, story.cards, facts, outWide])
  const worldH = room.h + Math.max(0, headSpace + 4 + tallest - (room.h - PLAYER_H))
  /* The headline's width, and the brief's own alone (BriefLayout's width for this canvas, inside the path). */
  const canvasW = room.w + 2 * SIDE_PAD
  const headW = Math.min(HEAD_W, room.w - 2 * FOCUS2_SIDE_PAD)
  const aloneW = Math.min(briefWidth(canvasW), room.w)
  /* The open answer is the wide card (focus2-geometry.ts answerWidth); with the v2 thumbnail it is one column, at cw. */
  const wideAt = outWide && !OUTCOME_EXTRAS ? answerWidth(cw) : cw
  const base = useMemo(() => shown.map((m, i) => (i === focus ? (m.kind === 'outcome' ? wideAt : cw) : farW)), [shown, focus, cw, farW, wideAt])
  const keep = landed ? shown.length - 1 : -1
  const carousel = useMemo(() => focus2Places({ n: shown.length, focus, roomW: room.w, base, top, keep }), [shown.length, focus, room.w, base, top, keep])
  /* The route is the second placement: the same cards, the same slots, laid out as the route the engine took. Worked
     out over the carousel too, because the route's own looks are what a card leaves from, or arrives at, in the morph. */
  const ov = useMemo(
    () => (chained ? null : overviewPlaces({ plan, cards: story.cards, count, p, landed, roomW: room.w, roomH: bandH, top: headSpace, sizes: stationSizes, open: stationOpen })),
    [chained, plan, story.cards, count, p, landed, room.w, bandH, headSpace, stationSizes, stationOpen],
  )
  const { places, earlier, later } = route && ov ? { places: ov.places, earlier: 0, later: 0 } : carousel
  const peekRight = places.some((pl) => pl.peek)
  /* A map that cannot stand in the room at zoom 1 makes the world bigger, and the stage's own fit zooms it down to the
     canvas — never overlapping, never clipped. What a station's opened body adds makes the world taller to scroll to,
     but is never fitted: opening a card in place does not shrink the route. */
  const worldW = route && ov ? Math.max(room.w, ov.w) : room.w
  const fitH = route && ov ? Math.max(worldH, headSpace + ov.h + PLAYER_H) : worldH
  const worldHt = route && ov ? Math.max(fitH, headSpace + ov.hOpen + PLAYER_H) : worldH
  /* The chain across: its row's top under the room over the canvas's bar (ROW_RISE), or under the headline when that
     reaches it — the spacer over the chain is the headline's own room, so this is what is left after it. */
  const rowTop = Math.max(ROW_GAP, Math.round((room.h - PLAYER_H - ROW_SEED) * ROW_RISE) - headSpace)
  /* The chain's glide (classic2-glide.ts): its nodes move to their new place whenever its shape, the headline's room
     over it or (across) the row's top changes — and never for anything else, nor before the canvas has been measured,
     so the first paint's planned room is never seen moving to the real one. Under reduced motion they are simply there. */
  const zoomNow = useCallback(() => stageRef.current?.zoom() ?? 1, [])
  const glideKey = `${shape}:${headSpace}:${across ? rowTop : 0}`
  const linksBack = useCallback(() => setLinksOn(true), [])
  const glide = useMemo<Glide | null>(() => (reduced || !room.ready ? null : { key: glideKey, zoom: zoomNow, onLanded: linksBack }), [reduced, room.ready, glideKey, zoomNow, linksBack])
  /* For this long after a switch the cards move on the morph's own timings, however the run was drawn; the line draws
     once the last of them is most of the way there. */
  const drawAt = lineAt(story.cards.length)
  const morphMs = Math.round((drawAt + LINE_S) * 1000) + 600

  /* A card drawn for the first time fades in where it stands. Recorded after the paint, so the first frame a card
     has is the one that fades in. */
  const isFresh = (key: string) => animate && !instant && !born.current.has(key)
  useEffect(() => {
    for (const m of shown) born.current.add(m.key)
  }, [shown])

  /* The presented landing, and the half-second of "Deciding" before it: both read off a mark taken while rendering,
     so the first frame the answer has is already the right one. A re-render is asked for at the end of the
     half-second, because by then the presenter's own frame loop may have nothing left to commit. */
  const mark = useRef({ key: '', landed: 0, out: 0 })
  const markKey = `${runKey}:${clock.key}`
  if (mark.current.key !== markKey) mark.current = { key: markKey, landed: 0, out: 0 }
  const nowMs = typeof performance === 'undefined' ? 0 : performance.now()
  if (landed && mark.current.landed === 0) mark.current.landed = nowMs
  if (openCard?.kind === 'outcome' && mark.current.out === 0) mark.current.out = nowMs
  const deciding = !instant && openCard?.kind === 'outcome' && mark.current.out > 0 && nowMs - mark.current.out < DECIDING_MS
  const recentLanding = landed && mark.current.landed > 0 && nowMs - mark.current.landed < LANDING_MS
  /* The card's own work is animated while the story is being told, and through the landing it presents. */
  const playing = !instant && (animate || presenting || recentLanding)
  /* A view just turned on or off: the cards spring to their new place even on a run drawn sharp. */
  const gliding = !reduced && nowMs < moveUntil.current
  useEffect(() => {
    if (!deciding) return
    const t = window.setTimeout(() => setTick((n) => n + 1), DECIDING_MS + 20)
    return () => window.clearTimeout(t)
  }, [deciding])
  /* Where the morph is, read off its mark like the rest of the clock here. Everything in it is timed by the motion
     itself (delays, not renders: a render of this view mid-flight is a dropped frame); one render is asked for, at the
     end, when nothing is moving, to hand the full face back to the flow. Under reduced motion there is none: the cards are simply in their new places. */
  const sinceMorph = nowMs - morph.at
  const morphing = !reduced && sinceMorph < morphMs
  const toRoute = morphing && morph.to === 'overview'
  const toCards = morphing && morph.to === 'cards'
  /* The card a switch to the carousel opened. The morph racks its full face in, so its own reveal does not pull it a
     second time — until the story or the keys open another. Kept as the clock's marks are, while rendering. */
  const racked = useRef<{ at: number; key: string | null }>({ at: -Infinity, key: null })
  if (toCards && racked.current.at !== morph.at) racked.current = { at: morph.at, key: openKey }
  else if (racked.current.key !== null && racked.current.key !== openKey) racked.current = { ...racked.current, key: null }
  useEffect(() => {
    if (reduced || !Number.isFinite(morph.at)) return
    const t = window.setTimeout(() => setTick((n) => n + 1), Math.max(0, morph.at + morphMs - performance.now()) + 20)
    return () => window.clearTimeout(t)
  }, [morph, reduced, morphMs])
  /* A card's move in the morph: after the press's own frame, ~40 ms apart — and on the way back after the route's marks
     have gone. The presented card leads and the rest follow by their distance from it: in order left to right, the
     card the admin was looking at waited the longest, still, while the ones off screen moved first. A move retargeted
     part-way (a hover) keeps only what is left of its wait. */
  const waitOf = (i: number) => Math.max(0, (toCards ? MORPH_HOLD : MORPH_LEAD) + Math.abs(i - focus) * MORPH_STAGGER - sinceMorph / 1000)
  const morphMove = (i: number): Transition => ({ ...SPRING, delay: waitOf(i) })
  /* The two looks crossing on the way, timed off the card's own wait: the one it leaves goes as it starts to move, the
     one it arrives in comes just behind. Out of a morph, each is simply on or off. */
  const faceOut = (i: number): Transition => (morphing ? { duration: FACE_OUT, delay: waitOf(i), ease: EASE } : NONE)
  const faceIn = (i: number): Transition => (morphing ? { duration: FACE_IN, delay: waitOf(i) + FACE_LAG, ease: EASE } : NONE)

  /* The verdict's landing flourish (F1, 5 Oct): once per presented landing — never for a run that lands at once, and
     never on a browse back to the card, which `flown` remembers. While it plays the cards that receded dim for 600 ms
     and settle (a class on the world; the dim itself is CSS opacity, so reduced motion has none to run: `instant`). */
  const [flown, setFlown] = useState<string | null>(null)
  const [dimmed, setDimmed] = useState(false)
  const playLand = playsLanding({ instant, landed, deciding, outcomeOpen: openCard?.kind === 'outcome', flown, key: markKey })
  useEffect(() => {
    if (!playLand) return
    setFlown(markKey)
    setDimmed(true)
  }, [playLand, markKey])
  useEffect(() => {
    if (!dimmed) return
    const t = window.setTimeout(() => setDimmed(false), DIM_MS)
    return () => window.clearTimeout(t)
  }, [dimmed])

  /* The card that has just left the centre softens over the same time the one arriving takes to sharpen, so focus
     reads as passing from one card to the next rather than two things happening at once. */
  const wasOpen = useRef(openKey)
  const [receding, setReceding] = useState<string | null>(null)
  useEffect(() => {
    if (wasOpen.current === openKey) return
    const left = wasOpen.current
    wasOpen.current = openKey
    if (instant || left === null) {
      setReceding(null)
      return
    }
    setReceding(left)
    const t = window.setTimeout(() => setReceding((r) => (r === left ? null : r)), 900)
    return () => window.clearTimeout(t)
  }, [openKey, instant])

  // --- The camera: the world is the view, fitted at zoom 1 so nothing overflows ---
  /* The route (ROUTE_MAP): a switch of arrangement, or of view, glides to the new zoom with the cards; anything else is
     there at once. Fitted to the route with its stations folded (`fitH`), so a body opened in place never shrinks it. */
  useLayoutEffect(() => {
    if (room.ready && !chained) stageRef.current?.fit({ max: 1, jump: !(morphing || gliding) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `morphing` and `gliding` say how, never whether
  }, [chained, runKey, room.w, room.h, room.ready, fitH, worldW])
  /* The chain across: the world is the row's own width (or the room's, if wider), and fitted at zoom 1 at most — down
     only when the row cannot stand in the room, the questions panel open on a small canvas — and never by the height a
     card opened in place adds (the world keeps the room's). Gliding with the cards when the chain has just turned. */
  useLayoutEffect(() => {
    if (room.ready && across) stageRef.current?.fit({ max: 1, jump: !gliding })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `gliding` says how, never whether
  }, [across, runKey, room.w, room.h, room.ready])
  /* …and once more, at once, when the row itself grows or shrinks after that (a longer sign-in, the chips folding). */
  useEffect(() => {
    if (!across || !worldEl || typeof ResizeObserver === 'undefined') return
    let w = worldEl.offsetWidth
    const ro = new ResizeObserver(() => {
      if (Math.abs(worldEl.offsetWidth - w) < 1) return
      w = worldEl.offsetWidth
      stageRef.current?.fit({ max: 1, jump: true })
    })
    ro.observe(worldEl)
    return () => ro.disconnect()
  }, [across, worldEl])
  /* Down: Classic v2's chain at zoom 1 from its top, as a new run starts it; it grows down the canvas as the story opens
     its cards, and the view follows the card the engine is on, by as little as shows it. */
  useLayoutEffect(() => {
    if (room.ready && chained && !across) stageRef.current?.fit({ max: 1, min: 1, jump: !gliding })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `gliding` says how, never whether
  }, [chained, across, runKey, room.w, room.h, room.ready])
  const vFollow = chained && (running || presenting) ? `${runKey}:${p}` : ''
  useEffect(() => {
    if (!vFollow) return
    /* After the card's body has opened, so what is followed is the card as it stands. */
    const t = window.setTimeout(
      () => {
        const root = rootRef.current
        const el = root?.querySelector('.rl-f2v [data-follow]') ?? root?.querySelector('.rl-f2v .rl-c2__seg:last-child')
        if (el) stageRef.current?.follow(el, { lazy: true, jump: reduced })
      },
      reduced ? 0 : FOLD_S * 1000 + 40,
    )
    return () => window.clearTimeout(t)
  }, [vFollow, reduced])
  /* Landed, and folded: Classic v2's own fit — the whole chain in view down to FIT_MIN, and when it is taller even then,
     the outcome kept in view at zoom 1. Once a run, and again when the brief moves it down. */
  const vLanded = chained && !across && room.ready && chain.landed ? `${runKey}:${identityKey}:${both ? headH : 0}` : null
  useEffect(() => {
    if (vLanded === null) return
    const t = window.setTimeout(
      () => {
        const stage = stageRef.current
        const scroller = worldEl?.closest<HTMLElement>('.rstage__scroll')
        const body = worldEl?.querySelector<HTMLElement>('.rl-f2v')
        if (!stage || !scroller || !body) return
        const roomH = scroller.clientHeight - TOP_PAD - FOCUS2_FLOOR_PAD
        if (body.offsetHeight * FIT_MIN <= roomH) stage.fit({ max: 1, min: FIT_MIN, jump: instant })
        else stage.follow(worldEl?.querySelector('.rl-f2v [data-card="outcome"]'), { lazy: true, jump: instant })
      },
      instant ? 0 : FOLD_S * 1000 + 60,
    )
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once a landing, and once a move of the brief
  }, [vLanded])

  /* The zoom the owner had removed is still reachable by a trackpad pinch, because RunStage binds ctrl/⌘ + wheel on
     its own scroller and that file is not ours to edit. Stopped here, on our own world, before the event reaches it. */
  useEffect(() => {
    const el = worldEl
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      e.stopPropagation()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [worldEl])

  // --- The voice: each card's line, said as the story reaches it — behind FOCUS_VOICE, so nothing is said ---
  const narrator = useNarrator({ runKey, running: running || presenting, jumped: settled, reduced })
  const fromText = useMemo(() => {
    try {
      const v = tokenValue('from', form, { people: users, apps, zones, rows: props.rows })
      return v.unset ? null : (v.text.split(' · ')[0] ?? null)
    } catch {
      return null
    }
  }, [form, users, apps, zones, props.rows])
  const lines = useMemo(
    () => beatsOf(plan, story.cards, { person: personName, first: asGroup ? 'them' : first, app: plan.appName || 'the application', from: fromText }, props.screens),
    [plan, story.cards, asGroup, personName, first, fromText, props.screens],
  )
  const order = useMemo(() => story.cards.map((m) => m.key), [story])
  /* Quiet without the voice: no line is ever queued, so the narrator is never asked to say one. */
  useFocusNarration({ narrator, plan, beats: lines, s: p, landed, runKey, quiet: settled || !FOCUS_VOICE, order, focusKey: openKey })

  // --- The presses ---
  /* Going somewhere by hand: the story holds where it is put, and Auto waits (owner: "a press on any reached card
     goes there and pauses Auto; ▶ resumes from there"). */
  const seeTimer = useRef(0)
  const goTo = useCallback(
    (to: number) => {
      setNote(null)
      setSeeOpen(false)
      if (seeTimer.current) window.clearTimeout(seeTimer.current)
      if (told) {
        setBrowse(to)
        return
      }
      setPaused(true)
      jumpTo(to)
    },
    [jumpTo, told],
  )
  const pickCard = useCallback(
    (card: number) => {
      setHover(null)
      goTo(beatOfCard(story, card, told ? story.ofBeat.length - 1 : reached))
    },
    [goTo, story, reached, told],
  )
  /* On the map, a card pressed is opened as a card: the carousel over the Horizontal view, its cards taking their
     carousel places with that one at the centre. The view stays Horizontal; Back returns. */
  const toCard = useCallback(
    (card: number) => {
      if (card < 0) return
      shift('horizontal', true)
      pickCard(card)
    },
    [shift, pickCard],
  )
  /* A siding that is not a card opens the card it belongs to: another policy the policies card, lit on its row; a rule
     never read, or the fold under the rule, the rule that decided. */
  const pressRow = useCallback(
    (row: RouteRow) => {
      const under = row.kind === 'policy' || row.key.startsWith('policies:') ? 'policies' : 'rule'
      const at = ov?.route.stations.find((st) => st.kind === under)?.card ?? -1
      toCard(at)
      /* Lit on its row there; a row with no row of its own lets go of whatever an earlier press had pinned. */
      setPin(row.target)
    },
    [ov, toCard],
  )
  const stepBy = useCallback(
    (d: -1 | 1) => {
      const to = beatShown + d
      if (to < 0 || to > (told ? beats.length - 1 : reached)) return
      goTo(to)
    },
    [goTo, beatShown, reached, told, beats.length],
  )
  const skip = useCallback(() => {
    setSkipped(true)
    skipPace()
  }, [skipPace])

  /* The card at the centre's own presses, through a ref so its memo holds: open a rule in the builder, bring the rule
     that came closest. */
  const calls = useRef<Focus2Calls>({ openRule: null, closest: () => {} })
  useLayoutEffect(() => {
    const d = plan.decider
    calls.current = {
      openRule: d
        ? (ri: number) => {
            const r = plan.rules[ri]
            if (!r) return
            if (r.index === null) props.onOpenPolicy(d.id)
            else props.onOpenRule(d.id, r.id)
          }
        : null,
      closest: (ri: number) => {
        const i = shown.findIndex((m) => m.kind === 'rule' && m.rule === ri)
        if (i >= 0) pickCard(i)
      },
    }
  })

  // --- The answers: a question pressed brings what its answer is about to the centre ---
  const bring = useCallback(
    (t: Target | null | undefined) => {
      if (!t) return
      /* In the chain nothing moves for a citation either: its card is lit where it stands, and kept in view — the
         person's being the sign-in node. */
      if (chained) {
        const k = chainCardOf(t)
        const el = k === 'sign-in' ? rootRef.current?.querySelector('.rl-f2v [data-node="sign-in"]') : k ? rootRef.current?.querySelector(`.rl-f2v [data-card="${k}"]`) : null
        if (el) stageRef.current?.follow(el)
        return
      }
      const key = momentKeyOf(t, shown, plan)
      /* On the map nothing moves for a citation: what it is about is lit where it stands (LitCtx, and a row's own
         target), and kept in view. */
      if (route) {
        const el = key ? rootRef.current?.querySelector(`[data-slot="${key}"]`) : null
        if (el) stageRef.current?.follow(el)
        return
      }
      const i = key ? shown.findIndex((m) => m.key === key) : -1
      if (i >= 0) pickCard(i)
    },
    [shown, plan, pickCard, route, chained],
  )
  /* Left, the canvas falls back to what is pinned, then to what the answer is about — the same ladder `lit` reads,
     or a pinned citation would stay lit while its card slid away under the pointer leaving it. */
  const onCite = useCallback(
    (t: Target | null) => {
      setCite(t)
      bring(t ?? pin ?? answerOn?.focus)
    },
    [bring, pin, answerOn],
  )
  /* A citation PRESSED pins it: the card stays at the centre and the phrase stays lit after the pointer leaves.
     A citation with no card — a rule the engine never read has no beat, so `momentKeyOf` returns null — underlines
     and does nothing visible; the answer's own "Open rule n" is the way there, and nothing fakes a card. */
  const pinCite = useCallback(
    (t: Target) => {
      setPin(t)
      /* In the chain, a citation pressed opens its card too, so what it points at is there to read. */
      const k = chained ? chainCardOf(t) : null
      if (k && k !== 'sign-in') vFold.set(k, true)
      bring(t)
    },
    [bring, chained, vFold],
  )
  /* The brief's phrases (focus2-brief.tsx) go down the same two paths, with two differences. A hover while the story
     is still being told lights its card and does not bring it: the headline sits under the row, the pointer crosses it
     on the way to anything, and a pass over it should not stop the story. And a phrase pressed again lets go, as the
     Brief view's own does — its `aria-pressed` says it is a toggle. */
  const citeBrief = useCallback(
    (t: Target | null) => {
      if (told) onCite(t)
      else setCite(t)
    },
    [told, onCite],
  )
  const pinBrief = useCallback(
    (t: Target) => {
      if (pin === t) setPin(null)
      else pinCite(t)
    },
    [pin, pinCite],
  )
  /* The presses that are the view's own. What they see is the answer's, so it brings the outcome and pins it.
     The checks action ("Open the deciding rule" / "Open the rule that can't tell", relabelled by `presentAnswer`)
     has no grid to open in v2 — the rail is how the story is browsed now — so it goes to the card of the rule that
     decided, or on a Depends the first rule that cannot tell: the rule whose checks the answer is about, not
     merely the first card. */
  const onAction = useCallback(
    (a: Action): boolean => {
      /* In the chain both open the card itself, where it stands, and bring it into view. */
      if (chained && (a.kind === 'checks' || a.kind === 'see')) {
        const k: CardKey = a.kind === 'checks' ? 'rule' : 'outcome'
        if (a.kind === 'see') setPin('screens')
        vFold.set(k, true)
        const at = rootRef.current?.querySelector(`.rl-f2v [data-card="${k}"]`)
        if (at) window.setTimeout(() => stageRef.current?.follow(at, { lazy: true, jump: reduced }), reduced ? 0 : FOLD_S * 1000 + 40)
        return true
      }
      /* Both open a card, so on the map they open it in the carousel. */
      const open = route ? toCard : pickCard
      if (a.kind === 'checks') {
        const at = checksRuleOf(plan)
        const i = shown.findIndex((m) => m.kind === 'rule' && at !== null && m.rule === at)
        const first = i >= 0 ? i : shown.findIndex((m) => m.kind === 'rule')
        if (first >= 0) open(first)
        return true
      }
      if (a.kind === 'see') {
        const i = shown.findIndex((m) => m.kind === 'outcome')
        if (i >= 0 && landed) {
          const there = i === focus && !route
          open(i)
          setPin('screens')
          /* The thumbnail's own popover. A card still travelling to the centre has no place to grow from yet. */
          if (OUTCOME_EXTRAS) seeTimer.current = window.setTimeout(() => setSeeOpen(true), there ? 0 : 480)
        }
        return true
      }
      return false
    },
    [shown, landed, pickCard, toCard, route, plan, focus, chained, vFold, reduced],
  )

  /* The view's ONE call of the previews: every entry is a real `resolveSignIn` + `engineRun` on a changed sign-in,
     which is what lets "What would change the answer?" say anything at all. The dock made the same call with the
     same arguments, so moving it here is cost-neutral and there is no second call to double it. Computed only once
     the run has landed — the PRESENTED landing, never the engine's, so no preview is worked out before the picture
     it is about. */
  const whatIfs = useWhatIfs(form, props.rows, plan, landed, props.policies)
  /* What the words need. Built as the dock built it, minus two fields: no `dict`, because nothing is typed here and
     the name reader is unreachable from this view; and no `how`, which is Brief's press into the page's right-hand
     panel — Focus v2 has none and never passed it. */
  const { screens, rows, breakIn, onAsGroup, onAdd, onOpenRule, onOpenPolicy, onRunWith, onPressPerson, onReviewBreakIn, onSave } = props
  const askProps = useMemo<AskProps>(
    () => ({
      asGroup,
      screens,
      form,
      rows,
      breakIn,
      onAsGroup,
      onAdd,
      onOpenRule,
      onOpenPolicy,
      onRunWith,
      onReplay: replay,
      onPressPerson,
      onReviewBreakIn,
      onSave,
      whatIfs: landed ? whatIfs.list : undefined,
      preview: landed ? whatIfs.preview : undefined,
    }),
    [asGroup, screens, form, rows, breakIn, onAsGroup, onAdd, onOpenRule, onOpenPolicy, onRunWith, replay, onPressPerson, onReviewBreakIn, onSave, whatIfs, landed],
  )
  /* A memo over the plan and the props, never an effect: `layouts-render.test.tsx` renders this view as static
     markup for 80-odd sign-ins and no effect of ours ever runs there, so the panel has to be right on first paint.
     A Run of several identities (5 Oct 2026) adds "What does each one get?", read off each identity's own plan. */
  const { identities } = props
  const faq = useMemo(() => (landed ? faqOf(plan, askProps, identities) : []), [landed, plan, askProps, identities])
  /* The brief's sentence, said as the Brief view says it (brief-input.ts). Read here rather than in the brief itself,
     because the panel's footer has to know what it says: a run where no rule matched has the sentence say "none of
     its 3 rules match", and with the brief on, the footer's "3 rules" goes (numbers once per view). */
  const brief = useBriefRun(props)
  const footer = useMemo(() => {
    if (!landed || plan.empty) return null
    return both ? footerBeside(plan.summary, saidOf(brief.model)) : plan.summary
  }, [landed, plan.empty, plan.summary, both, brief.model])
  /* Before a run, the head says the `empty` answer's own sentence — asked of the words themselves rather than
     retyped here, so there is one source for it. */
  const emptyLine = useMemo(() => (plan.empty ? answer('ask:why', plan, askProps).sentence : null), [plan, askProps])

  const press = useCallback(
    (a: Action) => {
      if (onAction(a)) return
      runAction(a, askProps)
    },
    [onAction, askProps],
  )
  /* A question pressed: its answer replaces the head and is brought to the centre — and said, only with the voice on
     (FOCUS_VOICE). Pressing one already asked replaces the head with the same answer and animates it again — so an
     answered question really can be asked again, and the words really do sharpen in again. */
  const ask = useCallback(
    (r: FaqRow) => {
      const raw = r.ask === FAQ_WATCHING ? watchingAnswer(plan) : r.ask === FAQ_EACH ? eachAnswer(identities, users) : answer(r.ask, plan, askProps, r.label)
      if (!raw) return
      const a = presentAnswer(raw, plan, askProps)
      setAnswerOn(a)
      setAskedOn(r.id)
      setAskSeq((n) => n + 1)
      setAsked((s) => (s.has(r.id) ? s : new Set(s).add(r.id)))
      setCite(null)
      setPin(null)
      bring(a.focus)
      if (FOCUS_VOICE && !narrator.muted) void narrator.say(fixPossessive(a.say), { gesture: true })
    },
    [plan, askProps, bring, narrator, identities, users],
  )

  // --- The trail (TRAIL_BAR), and what the landed card adds (OUTCOME_EXTRAS) ---
  const trail = useMemo(() => (TRAIL_BAR ? trailOf(beats, plan, { person: personName, at: beatShown, reached, p, landed }) : []), [beats, plan, personName, beatShown, reached, p, landed])
  /* The ask and the list are read through refs, so the answer card's own props hold still between presses and it is
     not drawn again for a narrator's state. */
  const askRef = useRef({ ask, faq })
  useLayoutEffect(() => {
    askRef.current = { ask, faq }
  })
  const topQs = useMemo(() => (OUTCOME_EXTRAS && landed && !plan.empty ? topQuestions(faq, plan, askedOn) : []), [faq, plan, landed, askedOn])
  const groupText = useMemo(() => {
    const g = plan.asEachGroup
    if (!OUTCOME_EXTRAS || !landed || !multi || !g || g.groups.length < 2 || !faq.some((x) => x.rows.some((r) => r.ask === 'ask:group'))) return null
    const names = g.groups.map((x) => x.name)
    const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join(' and ')
    /* The run's own finding says it best when it is the group one ("Maya is in Engineering and Finance — AWS for
       engineering teams applies first"); otherwise the comparison says it. */
    const hero = heroFinding(plan)
    const said = hero && / is in /.test(hero.text) ? hero.text : `${first} is in ${list}, and ${g.differs ? 'each group gets a different answer.' : 'each group gets the same answer.'}`
    return { text: said, conflict: hero?.tone === 'conflict' && said === hero.text }
  }, [landed, multi, plan, faq, first])
  const v2 = useMemo<OutcomeV2>(() => {
    const press = (id: string) => {
      const r = askRef.current.faq.flatMap((g) => g.rows).find((x) => x.id === id)
      if (r) askRef.current.ask(r)
    }
    /* Without the extras only the landing's draw-in is handed over, so the card is the wide v1 one that still strokes. */
    const land = playLand || dimmed
    if (!OUTCOME_EXTRAS) return { land }
    return {
      questions: topQs.map((r) => ({ id: r.id, label: r.label })),
      onAsk: press,
      group: groupText ? { text: groupText.text, label: 'See what each group gets', conflict: groupText.conflict, onSee: () => press('ask:group') } : null,
      see: { open: seeOpen, reduced, portal: rootEl, onOpen: () => setSeeOpen(true), onClose: () => setSeeOpen(false) },
      /* Held through the dim, not just the one render `playLand` is true for: the card can mount a beat later (the
         reveal holds its content through the focus pull), and it latches the flag on its first render. */
      land,
    }
  }, [topQs, groupText, seeOpen, reduced, rootEl, playLand, dimmed])

  // --- The keys: the player's own map, so the view's keys and its cannot drift apart ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current
      const t = e.target instanceof HTMLElement ? e.target : null
      /* Inside the view, or nowhere in particular — the body, or the canvas that holds the view (TryJourney focuses it
         after a Run and on a click on empty canvas); never over a field, and never with a modifier held. */
      if (!root || e.defaultPrevented || (t && t !== document.body && !root.contains(t) && !t.contains(root))) return
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]')) return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key === 'Escape') return
      /* On the map the keys walk the cards, not the beats — a beat that only goes deeper into a card already marked
         would be a press that shows nothing — and Enter opens the marked card in the carousel. A button keeps its own
         Enter. */
      if (route) {
        if (e.key === 'Enter') {
          if (t?.closest('button, a')) return
          e.preventDefault()
          toCard(focus)
          return
        }
        const to = e.key === 'ArrowRight' ? focus + 1 : e.key === 'ArrowLeft' ? focus - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : null
        if (to !== null) {
          if (to >= 0 && to < count && to !== focus) {
            e.preventDefault()
            pickCard(to)
          }
          return
        }
      }
      const act = playerKeyAction(e.key, { at: beatShown, count: beats.length, reached, landed, paused: held })
      if (!act) return
      /* The chain has no card at a centre to walk to, either way it is laid: there the keys only hold the story and let
         it go, and Tab walks its folds. */
      if (chained && act.do === 'jump') return
      e.preventDefault()
      if (act.do === 'jump') goTo(act.index)
      else if (act.do === 'pause') setPaused(true)
      else if (act.do === 'resume') setPaused(false)
      else skip()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [beatShown, beats.length, reached, landed, held, goTo, skip, route, chained, focus, count, toCard, pickCard])

  /* ESCAPE, ON THE WAY DOWN. One thing let go at a time: Skip while the story is still being told, then the note a
     row opened, then the carousel over the Horizontal view (back to the route, as the bar's Back), then the answers
     panel. Taken from the view or from the canvas that holds it, as the other keys are: TryJourney focuses that canvas
     after a Run and on a click on empty canvas, and Escape must still go back from there.

     It is a CAPTURE listener, and the other keys above are not, because Escape has a third claimant that is not
     ours: `SignInTests.tsx` registers a capture listener of its own that shuts whichever right-hand panel is open.
     Capture precedes bubble, so a `preventDefault()` from a bubble handler would come too late to stop it — but it
     does check `defaultPrevented`, so taking the key here stops it cleanly.

     IT IS BOUND ONCE, and reads what it needs through a ref, because WHEN it was bound is the whole of who wins:
     listeners on one node run in the order they were added, and `SignInTests`'s is added only when a right-hand
     panel opens. A handler re-bound on every beat and every state change would keep moving to the back of that
     queue — and then one Escape would close both. Bound at mount, it is always in front.

     The residual, said plainly so it is not read later as a bug: when Configure was ALREADY open before this view
     mounted, its listener was registered first and takes the first Escape. The panel then closes on the second.
     One thing at a time is the house behaviour, so that is the right order anyway. */
  const esc = useRef({ beatShown, count: beats.length, reached, landed, held, note, askOpen, seeOpen, skip, drilled, back: backToRoute })
  useLayoutEffect(() => {
    esc.current = { beatShown, count: beats.length, reached, landed, held, note, askOpen, seeOpen, skip, drilled, back: backToRoute }
  })
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const root = rootRef.current
      const t = e.target instanceof HTMLElement ? e.target : null
      if (!root || (t && t !== document.body && !root.contains(t) && !t.contains(root))) return
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]')) return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const st = esc.current
      const take = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      /* The What they see popover is the nearest thing: it closes first, and only it. */
      if (st.seeOpen) {
        take()
        setSeeOpen(false)
        return
      }
      /* Presenting: Escape is still Skip, by the key map's own word, so the view's keys and the story's cannot drift apart. */
      if (playerKeyAction('Escape', { at: st.beatShown, count: st.count, reached: st.reached, landed: st.landed, paused: st.held })) {
        take()
        st.skip()
        return
      }
      if (st.note) {
        take()
        setNote(null)
        return
      }
      if (st.drilled) {
        take()
        st.back()
        return
      }
      if (st.askOpen) {
        take()
        setAskBy(false)
      }
    }
    document.addEventListener('keydown', onEsc, true)
    return () => document.removeEventListener('keydown', onEsc, true)
  }, [])

  // --- What the cards are handed ---
  const notes = useMemo<NoteState>(() => ({ open: note, toggle: (id) => setNote((n) => (n === id ? null : id)), inert: false }), [note])
  const recededNotes = useMemo<NoteState>(() => ({ open: null, toggle: () => {}, inert: true }), [])
  /* While the narrator is saying the answer on show, the strip's line is suppressed and the waveform rides on the
     panel's head instead — as the caption already does it — so the words are never on screen twice. Without the voice
     (FOCUS_VOICE) neither is ever drawn. */
  const sayingAnswer = FOCUS_VOICE && !!answerOn && narrator.speaking !== null && narrator.speaking === fixPossessive(answerOn.say.trim())
  const voiceLine = FOCUS_VOICE && !sayingAnswer ? narrator.speaking : null

  /* The deciding rule's Then is a beat of its own: its row says so while that beat is on screen. */
  const onThen = beats[beatShown]?.beat.kind === 'then'
  const landingKey = plan.landing !== null ? plan.rules[plan.landing]?.node : undefined
  const denyMessage = useMemo(() => {
    for (const sc of props.screens) {
      const st = sc.steps.find((x) => x.kind === 'deny')
      if (st && st.kind === 'deny') return st.message
    }
    return ''
  }, [props.screens])
  const extra = `${props.screens.length}|${props.expected ?? ''}|${props.weaker ?? ''}|${props.changed ?? ''}|${props.columns.length}|${props.breakIn ? 1 : 0}|${form.appId ?? ''}`
  /* The edge pills ride in a layer of their own that moves by the headline's room, so they glide with the cards. */
  const pillTop = Math.round(top - headSpace + FOCUS2_DEPTH[1].drop + (compact ? FAR_H_COMPACT : FAR_H) * FOCUS2_DEPTH[1].scale + 24)
  const bandMove: Transition = reduced ? NONE : instant && !gliding ? { ...NONE, opacity: BAND_FADE } : { ...SPRING, opacity: BAND_FADE }
  /* What the headline draws at, and how its words arrive: in step with the story, or in one sweep when it is opened —
     by a press, or by the run landing (owner, 6 Oct 2026: "after the run is done it should appear the same way as when
     I toggle Brief on, with the whole animation"). A run drawn settled lands with `playing` off, so the landing itself
     asks for the sweep; the sweep is the block's first paint only (focus2-brief.tsx `Words`), so this changes nothing
     once it is up. */
  const briefAnimate = !reduced && (playing || briefPressed || landed)
  const narrowBrief = canvasW < BRIEF_NARROW

  const slotMove = (key: string, place: Focus2Place): Transition => {
    if (gliding && !isFresh(key)) return SPRING
    /* On the map a card moves only when it is lifted, or when a rule read at its station goes to its siding: the
       spring, however the run was drawn. */
    if (route) return reduced ? NONE : isFresh(key) ? { ...SPRING, opacity: { duration: ARRIVE, ease: EASE } } : SPRING
    if (instant) return NONE
    if (isFresh(key)) return { ...SPRING, opacity: { duration: ARRIVE, ease: EASE } }
    /* A card going out of reach fades before it slides past the edge: never a hard-clipped sliver. */
    if (place.hidden) return { ...SPRING, opacity: { duration: 0.16, ease: EASE } }
    return SPRING
  }
  /* The carousel sets a card's width at once, as it always has (the open card is the wider one); the morph and the map
     spring it with the rest of the card, so a card changes shape on its way rather than before it. */
  const slotTransition = (key: string, place: Focus2Place, i: number): Transition => {
    if (morphing) return morphMove(i)
    const t = slotMove(key, place)
    return route ? t : { ...t, width: NONE }
  }
  /* How the route's marks arrive: drawn after the cards on a switch, with the story while it is told, else in place. */
  const routeMood: RouteMood = toRoute ? 'arriving' : !instant || presenting ? 'playing' : 'settled'
  /* The canvas's bar: its words go where the canvas, or the lane the panel leaves it, is narrow. Those two widths were
     the bar with the pair and the voice in it; with neither, nor Back, it is its three functions, and keeps their words
     in any lane that holds them (5 Oct 2026: it went to icons whenever Check access was open, at 1440 too). */
  const barFull = HORIZONTAL_VIEW || FOCUS_VOICE || ROUTE_MAP
  const barNarrow = barFull ? ground.w + 2 * SIDE_PAD < CANVASBAR_NARROW || room.w < CANVASBAR_LANE : ground.w - askW < CANVASBAR_FNS_LANE

  /* What an answer or the brief points at, on Classic v2's cards: the chain's card, or the route's station or row that
     holds it — a rule by its own id, so a rule passed over lights its own row, never the station's. */
  const litCard = chainCardOf(lit)
  const litRule = (ri: number | undefined): boolean => {
    const r = ri === undefined ? undefined : plan.rules[ri]
    return !!r && !!lit && (lit === `rule:${r.id}` || lit.startsWith(`check:${r.id}:`))
  }
  const stationLit = (kind: StationKind, m: Moment): boolean =>
    kind === 'rule' ? litRule(m.rule) : kind === 'policies' ? !!plan.decider && lit === `policy:${plan.decider.id}` : litCard === CARD_OF[kind]
  /* The outcome's station says "Deciding" until the presented landing, and through its half-second: the answer is
     never on the route before the picture has reached it. */
  const outDeciding = !landed || deciding
  /* The chain's fold-all, the canvas's bar's last button (owner, 5 Oct 2026: "move the Expand all button to the bottom
     bar"): it folds or opens every card on screen, in either shape — or, on the route (ROUTE_MAP), its stations. With
     no card on screen yet there is nothing for it to do. */
  const folds = chained ? vFold : hFold
  const foldable = chained ? chainCards(chain.shown).length > 0 : !!ov
  /* The brief's cue (see `both`): the first moment of this run with it landed and no card open — or, where someone keeps
     a card open, a beat after the landing anyway. */
  const anyOpen = folds.anyOpen
  useEffect(() => {
    if (!landed || briefDue === runKey) return
    if (!anyOpen) {
      setBriefDue(runKey)
      return
    }
    const t = window.setTimeout(() => setBriefDue(runKey), BRIEF_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [landed, anyOpen, runKey, briefDue])

  return (
    <div ref={setRoot} className={`rl-focus-root rl-f2${instant ? ' is-sharp' : ''}`} data-stage={look}>
      <div className="rl-focus__backdrop" aria-hidden />
      {/* `pad.left` takes the panel's room as well as the path's, and `.rstage__world` is `margin: auto`, so the
          auto margin centres the world in what is LEFT and the open card keeps its centre (focus2-geometry.ts puts
          it at `roomW / 2` unconditionally, so both levers have to move or they drift). `RunStage.fit()` reads the
          same pads, so the camera follows for free. */}
      <RunStage
        ref={stageRef}
        reduced={reduced}
        className="rl-focus rl-f2__stage"
        label={`Sign-in run: ${plan.appName}`}
        pad={{ top: TOP_PAD, bottom: FOCUS2_FLOOR_PAD, left: SIDE_PAD + askW, right: SIDE_PAD }}
        externalDock
        overlay={
          <>
            {/* The canvas's own bar at its foot: the two views, Brief, Questions and the fold-all — outside the zoomed
                world, so it never shrinks with a row zoomed down to fit. The sign-in is the chain's first node now. */}
            <Focus2CanvasBar
              view={view}
              onView={pickView}
              pair={HORIZONTAL_VIEW}
              breakIn={landed && props.breakIn && props.onReviewBreakIn ? { holes: props.breakIn.summary.holes > 0, onPress: () => props.onReviewBreakIn?.('outcome') } : null}
              details={DETAILS_IN_BAR && landed && props.onInspect && (plan.decider || form.appId) ? { onPress: () => props.onInspect?.(plan.decider ? { kind: 'policy', policyId: plan.decider.id } : { kind: 'app', id: form.appId! }, true) } : null}
              brief={both}
              onBrief={() => pickBrief(!both)}
              questions={{ open: askOpen, onToggle: () => setAskBy(!askOpen) }}
              fold={{ any: folds.anyOpen, can: foldable, onPress: folds.foldAll }}
              onBack={drilled ? backToRoute : null}
              backAfter={MORPH_HOLD}
              voice={FOCUS_VOICE ? { line: voiceLine, muted: narrator.muted, onMuted: narrator.setMuted, onStop: () => narrator.cancel() } : null}
              narrow={barNarrow}
              tight={room.w < CANVASBAR_NARROW}
              reduced={reduced}
              left={SIDE_PAD + askW}
              right={SIDE_PAD}
              bottom={SIDE_PAD}
            />
            {askOpen && (
              <Focus2Ask
                state={plan.empty ? 'empty' : landed ? 'landed' : 'playing'}
                groups={faq}
                answer={answerOn}
                emptyLine={emptyLine}
                animate={!reduced}
                lit={lit}
                speaking={sayingAnswer}
                summary={footer}
                asked={asked}
                on={askedOn}
                seq={askSeq}
                onAsk={ask}
                onCite={onCite}
                onPin={pinCite}
                onAction={press}
                onStop={() => narrator.cancel()}
                onClose={() => setAskBy(false)}
                onClear={() => {
                  /* The answer leaves the head and no row is on; `asked` keeps its marks. */
                  setAnswerOn(null)
                  setAskedOn(null)
                  if (sayingAnswer) narrator.cancel()
                }}
              />
            )}
          </>
        }
      >
        <LitCtx.Provider value={lit}>
          <div
            ref={setWorldEl}
            className={`rl-focus__world rl-f2__world${dimmed ? ' is-landing' : ''}${chained && !across ? ' is-vertical' : ''}${across ? ' is-across' : ''}`}
            style={!chained ? { width: worldW, height: worldHt } : across ? { minWidth: room.w, width: 'max-content', height: room.h } : { width: room.w, minHeight: room.h }}
          >
            {/* THE VIEW. The chain, in the flow: down the canvas, so the world grows down with it as the story opens its
                cards — or across it, the world as wide as its row and as tall as the room, a card opened growing down past
                it to scroll to. The SAME element in both shapes, so its nodes glide between them (ONE CHAIN, TWO SHAPES).
                The band is the route's (ROUTE_MAP): the story's cards on it, or one at a time; its box is the world's top
                down to the canvas's bar, out of the flow so the chain never waits under it as one leaves and the other
                arrives. The brief over either only moves what is under it. */}
            <AnimatePresence initial={false}>
              {chained && (
                <motion.div
                  key="chain"
                  className="rl-f2v"
                  style={{ paddingBottom: PLAYER_H, '--rl-f2v-row-top': `${rowTop}px`, '--rl-f2v-lane': `${room.w}px` } as CSSProperties}
                  initial={{ opacity: 0, y: BAND_SINK }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: BAND_SINK }}
                  transition={reduced ? NONE : BAND_FADE}
                >
                  {/* The brief's room over the chain: the headline's measured height. Its change is one of the chain's
                      glides (`glideKey`), so the nodes move down under the headline rather than this box springing. */}
                  <div className="rl-f2v__room" aria-hidden style={{ height: headSpace }} />
                  {/* Out of the view's presence (see FRESH below): the chain's own arrivals and folds are its to play. */}
                  <PresenceContext.Provider value={null}>
                    <div className="rl-c2 rl-f2v__c2">
                      <Classic2Chain
                        run={presented}
                        data={chain}
                        fold={vFold}
                        animate={playing}
                        snap={instant}
                        orientation={across ? 'horizontal' : 'vertical'}
                        start={<SignInNode run={presented} lit={litCard === 'sign-in'} across={across} />}
                        signInCard={false}
                        glide={glide}
                        links={linksOn}
                        lit={litCard}
                        why={focusWhy.link}
                      />
                    </div>
                  </PresenceContext.Provider>
                </motion.div>
              )}
              {!chained && (
                <motion.div
                  key="band"
                  ref={bandRef}
                  className={`rl-focus__band rl-f2__band${route ? ' is-route' : ''}${morphing ? ' is-morphing' : ''}`}
                  style={{ height: headSpace + bandH, ...(ov ? { '--f2o-head-h': `${ov.head}px` } : null) } as CSSProperties}
                  initial={{ opacity: 0, y: BAND_SINK }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: BAND_SINK }}
                  transition={reduced ? NONE : BAND_FADE}
                  role="group"
                  tabIndex={0}
                  aria-label={`${route ? 'The route' : 'The run'}, ${focus + 1} of ${shown.length}: ${cardName(openCard, plan, personName, landed)}`}
                >
                  {/* FRESH. A view drawn on the page's first paint is a child of the presence above from its first render,
                      and Motion holds `initial: false` for everything under such a child for as long as it stands — so
                      no card mounted under it later would ever fade in, and no face would cross. The band's own content is
                      taken out of that presence: what it mounts plays its own `initial`. */}
                  <PresenceContext.Provider value={null}>
                    <AnimatePresence>{route && ov && <Focus2Route key="route" ov={ov} tone={tone} landed={landed} mood={routeMood} drawAt={drawAt} reduced={reduced} lit={lit} onRow={pressRow} />}</AnimatePresence>
                    <div className="rl-focus__track">
                      {shown.map((m, i) => {
                        const p0 = places[i]
                        if (!p0) return null
                        /* In the carousel the card at the centre is open. On the route every card is its station's Classic v2
                           card or its row, and the one the keys stand on, once the story is told, is MARKED. */
                        const isOpen = !route && i === focus
                        const atMark = route && i === focus
                        const inert = !isOpen
                        /* Lifted under the pointer; its veil and blur are cleared by focus.css's own hover rule. On the route
                           the lift is a touch, and it is there however the run was drawn. */
                        const lifted = hover === i && !p0.hidden && (route ? !reduced : !isOpen && !instant)
                        const place = lifted ? (route ? { ...p0, y: p0.y - 3 } : { ...p0, turn: p0.turn * 0.6, y: p0.y - 6, scale: p0.scale + 0.02, opacity: 1 }) : p0
                        const sk = stateKeyOf(m, plan, p, landed)
                        const pulse = onThen && m.key === landingKey
                        /* The full face of the card at the centre: faded out on its way to the route, and on the way home put
                           in place at the press but held back until the card has nearly arrived, so it racks in at the
                           centre rather than on its station. Either way it stands out of the flow at its carousel width. */
                        const leaving = route && toRoute && i === focus
                        const arriving = !route && toCards && i === focus
                        const fullOn = i === focus && (!route || leaving)
                        const fullLook = leaving ? { opacity: 0, scale: 1 } : arriving ? FULL_RACK_IN : { opacity: 1, scale: 1 }
                        const fullBox: CSSProperties | undefined = leaving || arriving ? { position: 'absolute', top: 0, left: 0, width: base[i] ?? place.w, pointerEvents: 'none' } : undefined
                        const move = slotTransition(m.key, place, i)
                        /* THE CARD'S TWO LOOKS. On the route, its station's Classic v2 card — or, for a rule read and passed
                           over, its row; in the carousel, its far face (and the full one at the centre). In a morph both
                           are drawn, each at its own width, centred on the card, the one it leaves fading as it starts to
                           move and the one it arrives in coming in behind it. */
                        const rf = ov?.faces[i]
                        const showRoute = !!rf && (route || toCards)
                        const showCarousel = !route || toRoute
                        const routeW = ov?.places[i]?.w ?? place.w
                        const carouselW = carousel.places[i]?.w ?? place.w
                        const hoverOn = () => setHover(i)
                        const hoverOff = () => setHover((h) => (h === i ? null : h))
                        return (
                          <motion.div
                            key={m.key}
                            className={`rl-focus__slot${isOpen ? ' is-focus' : ''}${atMark && !told ? ' is-reading' : ''}${atMark && told ? ' is-at' : ''}${atMark && told && browse !== null ? ' is-marked' : ''}${place.turn > 0 ? ' is-left' : place.turn < 0 ? ' is-right' : ''}${place.hidden ? ' is-hidden' : ''}${place.peek ? ' is-peek' : ''}${place.sliver ? ' is-sliver' : ''}${hover === i && !isOpen ? ' is-hover' : ''}${receding === m.key ? ' is-receding' : ''}`}
                            data-depth={depthOf(place)}
                            data-slot={m.key}
                            style={{ zIndex: place.z, originX: 0.5, originY: 0 }}
                            initial={isFresh(m.key) ? { x: place.x, y: place.y, scale: place.scale, opacity: 0, width: place.w } : false}
                            animate={{ x: place.x, y: place.y, scale: place.scale, opacity: place.opacity, width: place.w }}
                            transition={move}
                            aria-hidden={place.hidden || undefined}
                            /* The story waits for the reader: a pointer come to rest on the open card holds the fill. */
                            onPointerEnter={isOpen && !landed ? () => setReading(true) : undefined}
                            onPointerLeave={isOpen && !landed ? () => setReading(false) : undefined}
                          >
                            {/* The turn, about the card's own centre: each card is its own window seen square on, so a
                                turned card narrows towards its far edge and never spills into its neighbour. On the route it
                                eases to square, in the morph's own time. */}
                            <motion.div className="rl-focus__turn" style={{ originX: 0.5, originY: 0.5, transformPerspective: PERSPECTIVE }} animate={{ rotateY: place.turn }} transition={morphing ? move : instant ? NONE : SPRING}>
                              {showRoute && rf && (
                                <motion.div
                                  className={`rl-f2__rface${rf.kind === 'row' ? ' is-row' : ''}`}
                                  style={morphing ? { ...faceBox(routeW), pointerEvents: route ? undefined : 'none' } : undefined}
                                  initial={toRoute ? { opacity: 0 } : false}
                                  animate={{ opacity: route ? 1 : 0 }}
                                  transition={route ? faceIn(i) : faceOut(i)}
                                  onPointerEnter={route ? hoverOn : undefined}
                                  onPointerLeave={route ? hoverOff : undefined}
                                >
                                  {rf.kind === 'station' ? (
                                    <div className="rl-c2 f2o__station" ref={measure(rf.station, m.key)}>
                                      <Classic2Card
                                        card={CARD_OF[rf.station]}
                                        run={presented}
                                        data={chain}
                                        open={hFold.open[CARD_OF[rf.station]]}
                                        onFold={() => hFold.fold(CARD_OF[rf.station])}
                                        snap={instant}
                                        animate={playing}
                                        topRow
                                        lit={stationLit(rf.station, m)}
                                        onPress={() => toCard(i)}
                                        ruleAt={m.kind === 'rule' ? (m.rule ?? null) : undefined}
                                        passed={NO_PASSED}
                                        deciding={rf.station === 'outcome' && outDeciding}
                                        opens={routeW >= STATION_OPENS}
                                      />
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className={`f2o__row is-${rf.tone} is-card${rf.row.read ? ' is-read' : ''}${m.kind === 'rule' && litRule(m.rule) ? ' is-lit' : ''}`}
                                      style={{ height: ROW_H }}
                                      tabIndex={route ? 0 : -1}
                                      aria-label={rowLabel(rf.row)}
                                      title={rowLabel(rf.row)}
                                      onClick={() => toCard(i)}
                                    >
                                      <RowFace row={rf.row} />
                                    </button>
                                  )}
                                </motion.div>
                              )}
                              {showCarousel && (
                                <motion.div
                                  className="rl-f2__cface"
                                  style={morphing ? { ...faceBox(carouselW), pointerEvents: route ? 'none' : undefined } : undefined}
                                  initial={toCards ? { opacity: 0 } : false}
                                  animate={{ opacity: route ? 0 : 1 }}
                                  transition={route ? faceOut(i) : faceIn(i)}
                                >
                                  <NoteCtx.Provider value={inert ? recededNotes : notes}>
                                    <Focus2Reveal
                                      open={fullOn}
                                      strong={m.kind === 'outcome'}
                                      instant={instant || m.key === racked.current.key}
                                      far={<FarFace m={m} plan={plan} s={p} landed={landed} tone={tone} names={names} compact={compact} pulse={pulse} stateKey={sk} />}
                                      full={
                                        fullOn ? (
                                          <motion.div className={`rl-focus__content${arriving ? ' is-arriving' : ''}`} style={fullBox} initial={arriving ? FULL_HIDDEN : false} animate={fullLook} transition={leaving ? FULL_FADE : arriving ? FULL_RACK : NONE}>
                                            <Focus2Full m={m} stateKey={sk} extra={extra} props={presented} plan={plan} p={p} landed={landed} animate={playing} focused inert={false} first={first} tone={tone} wide={outWide} denyMessage={denyMessage} pulse={pulse} deciding={deciding} calls={calls} v2={v2} />
                                          </motion.div>
                                        ) : null
                                      }
                                    />
                                  </NoteCtx.Provider>
                                </motion.div>
                              )}
                              {!route && inert && !place.hidden && (
                                <button
                                  type="button"
                                  className="rl-focus__pick"
                                  tabIndex={-1}
                                  aria-label={pickLabel(m, plan)}
                                  onPointerEnter={hoverOn}
                                  onPointerLeave={hoverOff}
                                  onFocus={(e) => {
                                    if (e.currentTarget.matches(':focus-visible')) setHover(i)
                                  }}
                                  onBlur={hoverOff}
                                  onClick={(e) => {
                                    pickCard(i)
                                    /* From the keyboard, this button goes as its card comes to the front: the path keeps the keys. */
                                    if (e.detail === 0) bandRef.current?.focus({ preventScroll: true })
                                  }}
                                />
                              )}
                            </motion.div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </PresenceContext.Provider>
                </motion.div>
              )}
              {drilled && (
                <motion.div
                  key="edges"
                  className="rl-f2__edges"
                  initial={{ opacity: 0, y: headSpace + BAND_SINK }}
                  animate={{ opacity: 1, y: headSpace }}
                  exit={{ opacity: 0, y: headSpace + BAND_SINK }}
                  /* Opened from the route, the pills come in with the cards, not at the press. */
                  transition={toCards && !reduced ? { ...bandMove, delay: MORPH_HOLD + EDGES_LAG } : bandMove}
                >
                  {earlier > 0 && (
                    <button type="button" className="rl-focus__edge is-left" tabIndex={-1} style={{ top: pillTop }} onClick={() => stepBy(-1)}>
                      <ChevronLeft size={12} strokeWidth={2.2} aria-hidden />
                      {earlier} earlier
                    </button>
                  )}
                  {later > 0 && (
                    <button type="button" className={`rl-focus__edge is-right${peekRight ? ' is-by-peek' : ''}`} tabIndex={-1} style={{ top: pillTop }} onClick={() => stepBy(1)}>
                      {later} later
                      <ChevronRight size={12} strokeWidth={2.2} aria-hidden />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {/* The brief: the headline over the view (focus2-brief.tsx), at the presented step. Never alone now that a
                view is always on, so its "How it was decided" is never drawn and has nothing to do. */}
            <AnimatePresence initial={false}>
              {both && (
                <Focus2Brief
                  key="brief"
                  run={presented}
                  model={brief.model}
                  alone={false}
                  landed={landed}
                  animate={briefAnimate}
                  reduced={reduced}
                  look={look}
                  lit={lit}
                  pinned={pin}
                  headW={headW}
                  aloneW={aloneW}
                  narrow={narrowBrief}
                  onCite={citeBrief}
                  onPin={pinBrief}
                  onHow={() => {}}
                  onHead={setHeadH}
                />
              )}
            </AnimatePresence>
            {/* The voice is the canvas's bar's now (in the overlay); the bar under the card keeps its own, behind TRAIL_BAR. */}
            {TRAIL_BAR && (
              <div className="rl-f2__player" style={{ height: TRAIL_H }}>
                <Focus2Bar steps={trail} at={beatShown} last={beats.length - 1} reached={reached} landed={landed} presenting={presenting} reduced={reduced} onGo={goTo} onStep={stepBy} cardOf={(beat) => story.ofBeat[beat] ?? -1} hover={hover} onHover={setHover}>
                  <Focus2Voice inline line={voiceLine} muted={narrator.muted} onMuted={narrator.setMuted} onStop={() => narrator.cancel()} />
                </Focus2Bar>
              </div>
            )}
          </div>
        </LitCtx.Provider>
      </RunStage>
      {/* The why, in the page's right-hand panel while it is open on it (THE WHY): portalled from here, beside the stage
          and not inside it, so a press or a wheel in the panel never reaches the stage's pan and zoom. */}
      {focusWhy.card && props.why?.slot && createPortal(focusWhy.card, props.why.slot)}
    </div>
  )
}
