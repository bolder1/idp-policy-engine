import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { createContext, Fragment, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import {
  AppWindow,
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDashed,
  CircleHelp,
  KeyRound,
  Layers,
  ListOrdered,
  Minus,
  PanelRight,
  PenLine,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Split,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'

import { fallbackRule, type Rule } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { leaves } from '../../../predicate'
import { useBrand } from '../../../store'
import { IfBlock, IfChip, IfKw, IfSub } from '../../board/IfBlock'
import { DECISION_NAME, TONE } from '../../board/model'
import { conditionIcon, conditionTone } from '../../board/tones'
import type { NameLookup } from '../../predicate-prose'
import { ruleMarks, type RowMark } from '../journey'
import { groupNamesOf } from '../sign-in-card'
import {
  CARDS,
  ROW_CARD,
  ROW_START,
  factRows,
  metaWords,
  outcomeHead,
  ruleHead,
  signInHead,
  type CardKey,
  type HeadMeta,
  type MetaMark,
  type OutcomeTone,
  type OutcomeView,
  type PolicySectionKey,
} from './classic2-model'
import { GlideCtx, useGlide, type Glide } from './classic2-glide'
import type { ChainFold, ChainRun } from './classic2-run'
import { IdentityChips, type ChipFold } from './shared/IdentityChips'
import { identityChips, rowFacts, rowState, type IdentityChip } from './shared/sign-in-row'
import type { RunLayoutProps } from './types'
import { DENIAL_REASONS } from '../phase'
import { PEEK_FALLBACK, targetLabel, type InspectTarget } from '../inspect-model'
import { objectsOfRule, peekNames } from '../peek-model'
import { DENY_REASON_WORD, denyReasonOf, denyRef } from '../deny-reason'
import './classic2.css'

/* -----------------------------------------------------------------------------
   CLASSIC V2'S CHAIN, AND ITS FOUR CARDS — one module, so the two places that
   draw them draw the same thing (owner, 5 Oct 2026: "Classic v2 should be
   merged here as it is, as a vertical card view … redo the Overview cards like
   that — the same experience from both").

     ClassicV2Layout.tsx   the chain on its own canvas: its scroller, the fit
                           once it lands, and the builder's dock under it
     Focus (both views)    the same chain, down the canvas or across it, its
                           first node the sign-in itself and its fold-all in
                           the canvas's own bar
     Focus's route         the same cards one at a time, by `Classic2Card`
                           (kept behind the view's ROUTE_MAP)

   The chain is the builder's (ClassicV2Layout.tsx says what each piece is): the
   start pill, its connector without the `+`, and its cards, each the builder's
   card and head — tile, then the step, what was selected and one meta line —
   with the builder's fold and its sunken reading under it. Its words are
   classic2-model.ts's, read off the run by classic2-run.ts `useChainRun`; which
   cards are open is classic2-run.ts `useChainFold`'s, so the fold-all button can
   stand wherever its page puts it.

   What a page may change, and only this:
     orientation  down the canvas (the builder's own column), or across it: the
                  same nodes left to right, top-aligned on their heads, the
                  connector turned on its side (owner, 5 Oct 2026: "just 4
                  simple cards will be enough")
     start        the chain's first node: the builder's start pill, or the
                  page's own sign-in node in its place (Focus's, which says who
                  signs in and is pressed to edit it)
     signInCard   the sign-in card under it; a page whose start node says the
                  sign-in leaves it out, and the chain is its other three
     glide        the nodes glide between the two shapes (classic2-glide.ts)
     links        the connectors drawn, or faded while the chain changes shape
     topRow       the page's own top row already carries the pencil, Replay and
                  the identity chips, so the sign-in card does not repeat them
     lit          the card an answer points at, ringed where it stands
     onPress      (one card) a press on it does something other than open it
     why          the outcome's way to the why in the page's right-hand panel:
                  one quiet link at the foot of its body (`ChainWhy`). Only a
                  page that draws the why there hands it — Focus, on the page;
                  never ClassicV2Layout, and never the builder's Check access
   -------------------------------------------------------------------------- */

/** Decelerating: what arrives. */
const EASE_OUT = [0.2, 0, 0, 1] as const
/** A drawer opening, and closing (RuleCard.tsx's, for its trace body). */
const EASE_OPEN = [0.32, 0.72, 0, 1] as const
const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const
/** A card arriving: its fade, and the beat between two that arrive together. */
const ARRIVE_S = 0.2
const STAGGER_S = 0.12
/** A body folding to its head, or opening from it (ClassicV2Layout's fit waits it out). */
const FOLD_S = 0.26

/** The outcome's mark, by its tone. */
const OUT_ICON: Record<OutcomeTone, LucideIcon> = { allow: ShieldCheck, mfa: KeyRound, deny: Ban, depends: CircleHelp, none: Minus }
/** The builder's card tone class for each (board.css `.bb__card.is-allow` …); Depends takes the notice tone of its own (classic2.css). */
const OUT_CLASS: Record<OutcomeTone, string> = { allow: 'is-allow', mfa: 'is-mfa', deny: 'is-deny', depends: 'is-depends', none: '' }
/** Each of the policy card's sections, its mark. */
const SECTION_ICON: Record<PolicySectionKey, LucideIcon> = { skipped: SkipForward, checking: ListOrdered, applies: ShieldCheck, also: Layers, 'not-reached': CircleDashed }
/** The meta line's lead, as the Overview's line carries it (the spinner is the builder's own, drawn apart). */
const META_ICON: Record<Exclude<MetaMark, 'spin' | null>, LucideIcon> = { check: Check, cross: X, help: CircleHelp, dash: Minus }

/** The chain's two shapes: the builder's column down the canvas, or the same nodes across it. */
export type ChainOrientation = 'vertical' | 'horizontal'

/* THE WAY TO THE WHY (owner's ruling, 6 Oct 2026: what opens the page's right-hand panel is a name or a link INSIDE a
   card — never a button on the canvas's bar, never an icon on a card's head). The outcome card's body ends in one quiet
   link: what it says, whether the panel is open on the why, the why's id once it is (the link's aria-controls), and the
   press, which opens the panel or shuts it. The page decides all four; the card only draws them. */
export interface ChainWhy {
  /** "Why", "Review conflict", or "Why, and how to get in" — the page's words for what the why holds. */
  label: string
  open: boolean
  id: string
  onPress: () => void
}

export interface Classic2ChainProps {
  /** The run as the page draws it: Classic v2 the host's, Focus its presented one. */
  run: RunLayoutProps
  data: ChainRun
  fold: ChainFold
  /** Cards arrive and marks pop: a run playing with motion allowed. */
  animate: boolean
  /** Nothing moves: reduced motion, a Skip, a run drawn settled. */
  snap: boolean
  /** Down the canvas (the default, the builder's column) or across it. */
  orientation?: ChainOrientation
  /** The chain's first node, in the start pill's place: the page's own (Focus's sign-in node). Default the builder's pill. */
  start?: ReactNode
  /** The sign-in card under the first node (default); off where the first node says the sign-in itself. */
  signInCard?: boolean
  /** The nodes glide between the two shapes (classic2-glide.ts): what changes to move them, and the stage's zoom. */
  glide?: Glide | null
  /** The connectors drawn (default), or faded while the chain changes shape. */
  links?: boolean
  /** The page's own top row carries the pencil, Replay and the identity chips: the sign-in card does not repeat them. */
  topRow?: boolean
  /** The card an answer points at. */
  lit?: CardKey | null
  chainRef?: Ref<HTMLDivElement>
  /** The landed chain's zoom (ClassicV2Layout's fit): `--rl-c2-z`. */
  zoom?: number
  /** The outcome's link to the why in the page's right-hand panel (`ChainWhy`). Absent, no link. */
  why?: ChainWhy | null
}

/** A connector fading out as the chain starts to change shape, and back in once its nodes have landed. */
const LINK_OUT = { duration: 0.12, ease: EASE_OUT }
const LINK_IN = { duration: 0.2, ease: EASE_OUT }

/* The chain: the first node, then each card on screen after its connector — top to bottom, or left to right — arriving
   as the run reaches it. Across, the row keeps a place for every card the run will draw from the start, so the nodes
   already there never move as the next arrives; the places are its grid's tracks (`--rl-c2-tracks`). */
export function Classic2Chain({ run, data, fold, animate, snap, orientation = 'vertical', start, signInCard = true, glide = null, links = true, topRow = false, lit = null, chainRef, zoom, why = null }: Classic2ChainProps) {
  const { at, shown } = data
  /* Two cards that arrive at the same step (a Replay finds the policy at once) come in a beat apart, top to bottom. */
  const delayOf = (k: CardKey) => (animate ? shown.filter((j) => j !== k && at[j] === at[k] && shown.indexOf(j) < shown.indexOf(k)).length * STAGGER_S : 0)
  /* Each node's place in the glide's order: the first node leads, then the cards as the chain reads them. */
  const cards = signInCard ? CARDS : CARDS.filter((k) => k !== 'sign-in')
  const orderOf = (k: CardKey) => cards.indexOf(k) + 1
  const arrive = (k: CardKey, first?: ReactNode) => (
    <motion.div
      key={k}
      className="rl-c2__seg"
      initial={animate ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: animate ? ARRIVE_S : 0, delay: delayOf(k), ease: EASE_OUT }}
    >
      {first}
      {(k !== 'sign-in' || signInCard) && (
        <>
          <Link order={orderOf(k)} shown={links} />
          <Classic2Card card={k} run={run} data={data} open={fold.open[k]} onFold={() => fold.fold(k)} snap={snap} animate={animate} topRow={topRow} lit={lit === k} order={orderOf(k)} why={k === 'outcome' ? why : null} />
        </>
      )}
    </motion.div>
  )
  const across = orientation === 'horizontal'
  /* The glide's last box is the last one on screen: its landing is the move's end (a switch mid-run has fewer). */
  const last = Math.max(0, ...shown.filter((k) => k !== 'sign-in' || signInCard).map(orderOf))
  const moving = useMemo(() => (glide ? { ...glide, last } : null), [glide, last])
  /* The tracks across: one a card after the first node that the run will draw (an empty plan draws none). */
  const tracks = cards.filter((k) => k !== 'sign-in' && Number.isFinite(at[k])).length
  const style = {
    ...(zoom === undefined ? null : { '--rl-c2-z': zoom }),
    ...(across ? { '--rl-c2-tracks': tracks, '--rl-c2-row-card': `${ROW_CARD}px`, '--rl-c2-row-start': `${ROW_START}px` } : null),
  } as CSSProperties
  return (
    <GlideCtx.Provider value={moving}>
      <LayoutGroup id={`rl-c2-${run.runKey}`}>
        <div key={run.runKey} ref={chainRef} className={`rl-c2__chain${across ? ' is-across' : ''}${links ? '' : ' is-moving'}`} style={Object.keys(style).length > 0 ? style : undefined}>
          {arrive('sign-in', <StartNode>{start ?? <StartPill appId={data.appId} appName={data.appName ?? run.plan.appName} />}</StartNode>)}
          {shown.includes('policy') && arrive('policy')}
          {shown.includes('rule') && arrive('rule')}
          {shown.includes('outcome') && arrive('outcome')}
        </div>
      </LayoutGroup>
    </GlideCtx.Provider>
  )
}

/* The first node's place: where it stands in either shape (across, on the connectors' line). A page's own node glides
   as a box of its own (it takes the glide itself); the builder's pill is drawn as it always was. */
function StartNode({ children }: { children: ReactNode }) {
  return <div className="rl-c2__first">{children}</div>
}

/* A connector, as the builder draws it between two cards (classic2.css turns it on its side across). It moves as a piece
   with its card — a headline arriving over the chain carries it down with the rest — and while the chain changes shape
   it is faded, out at the start and back once the cards have landed: a line is never seen bending. */
function Link({ order, shown }: { order: number; shown: boolean }) {
  const { piece, on } = useGlide(order)
  if (!on) return <div className="bb__link rl-c2__link" aria-hidden />
  return (
    <motion.div
      className="bb__link rl-c2__link"
      aria-hidden
      {...piece}
      initial={false}
      animate={{ opacity: shown ? 1 : 0 }}
      transition={{ ...piece.transition, opacity: shown ? LINK_IN : LINK_OUT }}
    />
  )
}

/** The page's inspector, for what a card's body names (a rule's zones): handed down by Classic2Card, absent elsewhere. */
const InspectCtx = createContext<((t: InspectTarget) => void) | null>(null)

export interface Classic2CardProps {
  card: CardKey
  run: RunLayoutProps
  data: ChainRun
  open: boolean
  onFold: () => void
  snap: boolean
  animate: boolean
  topRow?: boolean
  lit?: boolean
  /** A press on the card does this instead of opening it (Focus's route: the cards one at a time); its fold still folds. */
  onPress?: () => void
  /** The rule card's rule, where it is not the one the chain's card 3 draws (the route's rule being read). */
  ruleAt?: number | null
  /** The rules passed over, over the rule's reading; the route hangs them beside it instead, and hands none. */
  passed?: ChainRun['passed']
  /** (The outcome) on stage before the picture has reached the answer — the route's station: "Deciding", and nothing it decided. */
  deciding?: boolean
  /** (The rule) its "Open in its policy" beside the fold; a card too narrow for it gives the room to its step. */
  opens?: boolean
  /** Its place in the chain's glide (classic2-glide.ts): the stagger of its move. */
  order?: number
  /** (The outcome) its link to the why in the page's right-hand panel; never while it is still deciding. */
  why?: ChainWhy | null
}

/** The outcome before it is told: no decision, no tone, nothing to open. */
const DECIDING: OutcomeView = { tone: 'none', decision: null, title: 'Deciding', by: '', link: '', open: null, factors: [], message: null, outcomes: [], needs: [] }

/** One of the four cards, on its own: the chain's, or a station of Focus's route. */
export function Classic2Card({ card, run, data, open, onFold, snap, animate, topRow = false, lit = false, onPress, ruleAt, passed, deciding = false, opens: canOpen = true, order = 0, why = null }: Classic2CardProps) {
  const { plan, running, onOpenRule, onOpenPolicy } = run
  const { decider, done, outcome } = data
  const pressed = { lit, onPress, order }
  if (card === 'sign-in') return <SignInCard run={run} who={data.who} group={data.group} appId={data.appId} appName={data.appName} open={open} onFold={onFold} snap={snap} topRow={topRow} {...pressed} />
  if (card === 'policy')
    return (
      <PolicyCard
        head={data.policyHead}
        sections={data.sections}
        appName={plan.appName}
        open={open}
        onFold={onFold}
        snap={snap}
        animate={animate}
        follow={data.working === 'policy'}
        onOpen={canOpen && done ? onOpenPolicy : undefined}
        {...pressed}
      />
    )
  if (card === 'rule')
    return (
      <InspectCtx.Provider value={run.onInspect ?? null}>
      <PassedRuleCard
        plan={plan}
        at={ruleAt === undefined ? data.shownRule : ruleAt}
        rules={decider?.rules ?? []}
        fallback={decider?.fallback ?? null}
        s={run.s}
        passed={passed ?? data.passed}
        open={open}
        onFold={onFold}
        snap={snap}
        animate={animate}
        follow={data.working === 'rule'}
        resolve={data.resolve}
        onOpen={canOpen && done && decider ? (ruleId) => onOpenRule(decider.id, ruleId) : undefined}
        inspects={!!run.onInspect}
        onDetails={done && decider && run.onInspect ? (ruleId) => onOpenRule(decider.id, ruleId) : undefined}
        {...pressed}
      />
      </InspectCtx.Provider>
    )
  const opens = deciding ? null : outcome.open
  return (
    <OutcomeCard
      plan={plan}
      view={deciding ? DECIDING : outcome}
      open={open}
      onFold={onFold}
      snap={snap}
      follow={running}
      onOpen={done && opens ? () => (opens.ruleId ? onOpenRule(opens.policyId, opens.ruleId) : onOpenPolicy(opens.policyId)) : undefined}
      inspects={!!run.onInspect}
      why={deciding ? null : why}
      {...pressed}
    />
  )
}

// --- The chain's pieces -----------------------------------------------------------------------

/* The builder's start pill (Board.tsx `.bb__start`), read: where the sign-in arrives, the application's own mark in
   its left slot. Not a button and no chevron — on the board it opens the Applications pane; here the pencil on the
   sign-in card (or the page's own top row) is the way to the form. */
function StartPill({ appId, appName }: { appId: string | null; appName: string }) {
  return (
    <div className="bb__start rl-c2__start">
      {appId ? (
        <AppLogo appId={appId} name={appName} size={18} />
      ) : (
        <span className="bb__startmark" aria-hidden>
          <AppWindow size={13} strokeWidth={1.8} />
        </span>
      )}
      {appId ? (
        <span>
          A sign-in arrives at <b className="bb__start__at">{appName}</b>
        </span>
      ) : (
        <span>
          <b className="bb__start__at">No application</b>
        </span>
      )}
    </div>
  )
}

/* The head's third line, as the Overview's node carries it (focus-far.tsx `Line`): its mark first — ✓ ✕ ? –, or the
   builder's spinner while the engine is on it — then the words, and the decision in its colour where the line ends
   in one ("Then Allow on 1 factor"). `extra` follows the words: the sign-in's "Not run". */
function Meta({ meta, extra }: { meta: HeadMeta | null; extra?: ReactNode }) {
  if (!meta && !extra) return null
  const Icon = meta?.mark && meta.mark !== 'spin' ? META_ICON[meta.mark] : null
  return (
    <em className={`rl-c2__meta is-${meta?.tone ?? 'plain'}`}>
      {meta?.mark === 'spin' && (
        <span className="rl-c2__mk" aria-hidden>
          <span className="bb__tspin" />
        </span>
      )}
      {Icon && (
        <span className="rl-c2__mk" aria-hidden>
          <Icon size={13} strokeWidth={2.6} />
        </span>
      )}
      {meta && (
        <span className="rl-c2__mt">
          {meta.text}
          {meta.then && <b className="rl-c2__then">{DECISION_WORDS[meta.then]}</b>}
        </span>
      )}
      {extra}
    </em>
  )
}

/* One card on the chain: the builder's card and head — its tile, then in the title's track the Overview's three lines
   (the step, what was selected, one meta line), and in the head's right slot (where its Centred skin merges the
   trail) whatever the card does, then the builder's fold: the same button, glyph, tooltip and aria. Under the head
   what stays when it folds (the identity chips); then the body, which folds to nothing — its height Motion's, its
   words fading. Folded, a press anywhere on it opens it, as the builder's trace card does — unless the page that
   draws it hands a press of its own (`onPress`). */
function Card({
  card,
  className = '',
  tile,
  kicker,
  title,
  titleNode,
  meta,
  acts,
  under,
  body,
  open,
  onFold,
  what,
  fold,
  snap,
  follow = false,
  lit = false,
  onPress,
  order = 0,
}: {
  card: CardKey
  className?: string
  tile: ReactNode
  /** The step, small and grey: "Sign-in", "Rule 2 of 3". */
  kicker: string
  /** What was selected, in words: the card's name, and the title's tooltip. */
  title: string
  /** The title as drawn, where it is more than its words (the sign-in's arrow and logo). */
  titleNode?: ReactNode
  meta: ReactNode
  acts?: ReactNode
  under?: ReactNode
  body: ReactNode
  open: boolean
  onFold: () => void
  /** What the fold shows or hides, after "Show" / "Hide": "what the sign-in states", "what rule 2 checks". */
  what: string
  /** The fold's tooltip, open and folded: the builder's "Fold this rule" / "Show what it checks". */
  fold: readonly [string, string]
  snap: boolean
  follow?: boolean
  lit?: boolean
  onPress?: () => void
  /** Its place in the chain's glide: the stagger of its move. */
  order?: number
}) {
  const bodyId = useId()
  /* Gliding (classic2-glide.ts), the card is a box — its size and place moved together — and its head, what stays under
     it and its body are pieces, carried with it at their own size, so the words are never stretched on the way. */
  const { box, piece, on } = useGlide(order, card)
  return (
    <motion.div
      className={`bb__card rl-c2__card${open ? ' is-open' : ''}${className ? ` ${className}` : ''}${lit ? ' is-lit' : ''}${onPress ? ' is-pressable' : ''}`}
      data-card={card}
      role="group"
      aria-label={`${kicker}: ${title}`}
      onClick={onPress ?? (open ? undefined : onFold)}
      {...(follow ? { 'data-follow': '' } : null)}
      {...box}
    >
      <motion.div className="bb__cardhead" {...piece}>
        {tile}
        <div className="bb__title">
          <span className="rl-c2__kicker">{kicker}</span>
          <strong className="rl-c2__name" title={title}>
            {titleNode ?? <span className="rl-c2__nm">{title}</span>}
          </strong>
          {meta}
        </div>
        <div className="bb__cardmeta" onClick={(e) => e.stopPropagation()}>
          <span className="bb__acts">
            {acts}
            <button
              type="button"
              className={`bb__act bb__fold__btn${open ? ' is-open' : ''}`}
              aria-expanded={open}
              aria-controls={open ? bodyId : undefined}
              aria-label={`${open ? 'Hide' : 'Show'} ${what}`}
              title={open ? fold[0] : fold[1]}
              onClick={onFold}
            >
              {open ? <ChevronsDownUp size={13} strokeWidth={2.2} /> : <ChevronsUpDown size={13} strokeWidth={2.2} />}
            </button>
          </span>
        </div>
      </motion.div>
      {under && on ? <motion.div {...piece}>{under}</motion.div> : under}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            id={bodyId}
            className="bb__tbody"
            {...piece}
            initial={snap ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: snap ? { duration: 0 } : { height: { duration: FOLD_S, ease: EASE_OPEN }, opacity: { duration: 0.18, delay: 0.04, ease: EASE_OUT } } }}
            exit={{ height: 0, opacity: 0, transition: snap ? { duration: 0 } : { height: { duration: FOLD_S - 0.02, ease: EASE_IN_OUT }, opacity: { duration: 0.12 } } }}
          >
            <div className="bb__cardbody">{body}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* A section of the builder's reading (IfBlock.tsx): the keyword on its own line, its mark before it, and what
   answers it indented under the guide. */
function Section({ icon: Icon, kw, className, children }: { icon?: LucideIcon; kw: string; className?: string; children: ReactNode }) {
  return (
    <>
      <div className="bb__ifrow">
        {Icon && (
          <span className="bb__ifbranch" aria-hidden>
            <Icon size={12} strokeWidth={2} />
          </span>
        )}
        <IfKw>{kw}</IfKw>
      </div>
      <IfSub className={className}>{children}</IfSub>
    </>
  )
}

/* A row's answer, at its right end, as the builder's trace card marks it (`.bb__tmark`): the spinner while it is
   read, then ✓ ✕ –, popping in when the run moves. */
function Mark({ mark, pop }: { mark: RowMark | null | undefined; pop: boolean }) {
  if (!mark) return null
  if (mark.working)
    return (
      <span className="bb__tmark is-working" aria-hidden>
        <span className="bb__tspin" />
      </span>
    )
  const glyph = mark.status === 'pass' ? <Check size={12} strokeWidth={2.6} /> : mark.status === 'fail' ? <X size={12} strokeWidth={2.6} /> : <Minus size={12} strokeWidth={2.4} />
  return (
    <>
      <motion.span
        className={`bb__tmark is-${mark.status}`}
        aria-hidden
        initial={pop ? { scale: 0.55, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={pop ? { scale: { type: 'spring', stiffness: 620, damping: 26 }, opacity: { duration: 0.1 } } : { duration: 0 }}
      >
        {glyph}
      </motion.span>
      <span className="u-sr-only">{mark.status === 'pass' ? 'Held' : mark.status === 'fail' ? 'Did not hold' : 'Can’t tell'}</span>
    </>
  )
}

/** What every card is handed from the page that draws it, besides its own words. */
interface Pressed {
  lit?: boolean
  onPress?: () => void
  order?: number
}

// --- 1. The sign-in ---------------------------------------------------------------------------

/* Who signs in, to what, and what the sign-in states — the form, as the
   builder reads a rule. The head: their face (a group's square), "Sign-in",
   "Maya Iyer → [logo] AWS Console", "2 sign-in conditions" (and "Not run"
   once the form has changes this run has not checked); the pencil opens the
   form, Replay runs it again (never while it plays). Two or more identities
   run: their chips under the head, folded or not. The body: `who` — the
   person, and under them their groups as the builder's group tiles with their
   names; `if` — each fact stated, as the builder's condition row, joined by
   its "and". The application is the start pill's and the title's. Where the
   page's own top row carries the pencil, Replay and the chips (`topRow`), the
   card has its fold alone. */
function SignInCard({
  run,
  who,
  group,
  appId,
  appName,
  open,
  onFold,
  snap,
  topRow,
  lit,
  onPress,
  order,
}: {
  run: RunLayoutProps
  who: string
  group: string | null
  appId: string | null
  appName: string | null
  open: boolean
  onFold: () => void
  snap: boolean
  topRow: boolean
} & Pressed) {
  const { form, rows, plan, running, unrun, changed, expected, editing, onPressPerson, onReplay, onPickIdentity } = run
  const { users, groups, zones } = useBrand()
  const person = users.find((u) => u.id === form.personId) ?? null
  const facts = useMemo(() => factRows(rowFacts(form, rows, { zones })), [form, rows, zones])
  const state = rowState({ plan, running, unrun, changed, expected })
  const chips = useMemo(() => (topRow ? null : identityChips(run.identities, !running)), [topRow, run.identities, running])
  const memberOf = person && !group ? groupNamesOf(person, groups) : []
  const head = signInHead(who, appName, facts.length)

  return (
    <Card
      card="sign-in"
      lit={lit}
      onPress={onPress}
      order={order}
      tile={
        <span className={`bb__idx rl-c2__idx${group || person ? ' is-face' : ''}`} aria-hidden>
          {group ? <Face kind="group" name={group} decorative /> : person ? <Face kind="user" name={person.name} decorative /> : <Users size={14} strokeWidth={2.2} />}
        </span>
      }
      kicker={head.kicker}
      title={head.to ? `${head.title} → ${head.to}` : head.title}
      titleNode={
        <>
          <span className="rl-c2__nm">{head.title}</span>
          {head.to && (
            <>
              <ArrowRight className="rl-c2__to" size={14} strokeWidth={2} aria-hidden />
              <span className="u-sr-only"> to </span>
              {/* The application's mark and name as one, so a narrow card that wraps the title keeps them together. */}
              <span className="rl-c2__app">
                {appId && <AppLogo appId={appId} name={head.to} size={16} />}
                <span className="rl-c2__nm">{head.to}</span>
              </span>
            </>
          )}
        </>
      }
      meta={
        <Meta
          meta={head.meta}
          extra={
            state && (
              <span className={`rl-c2__state is-${state.kind}`}>
                {state.kind === 'expected' && state.met !== null && (state.met ? <Check size={12} strokeWidth={2.6} aria-hidden /> : <X size={12} strokeWidth={2.6} aria-hidden />)}
                {state.words}
              </span>
            )
          }
        />
      }
      acts={
        !topRow && (
          <>
            <button type="button" className="bb__act rl-c2__edit" aria-label="Edit sign-in" aria-pressed={editing === true} title="Edit sign-in" onClick={onPressPerson}>
              <PenLine size={13} strokeWidth={2} />
            </button>
            {onReplay && (
              <button
                type="button"
                className="bb__act rl-c2__replay"
                aria-label="Replay"
                aria-disabled={running || undefined}
                title={running ? 'The run is playing' : 'Run this sign-in again'}
                onClick={() => !running && onReplay()}
              >
                <RotateCcw size={13} strokeWidth={2.2} />
              </button>
            )}
          </>
        )
      }
      under={
        chips && (
          <div className="rl-c2__under" onClick={(e) => e.stopPropagation()}>
            <ChipSwitch chips={chips} onPick={onPickIdentity} />
          </div>
        )
      }
      open={open}
      onFold={onFold}
      what="what the sign-in states"
      fold={['Fold this card', 'Show what it states']}
      snap={snap}
      body={
        <div className="bb__if">
          <Section icon={Users} kw="who" className="rl-c2__stack">
            {group ? (
              <>
                <div className="bb__ifwho">
                  <Face kind="group" name={group} size="sm" decorative />
                  <span className="bb__ifwho__text">{who}</span>
                </div>
                {person && (
                  <div className="bb__ifwho rl-c2__members">
                    <span className="rl-c2__member">
                      <Face kind="user" name={person.name} size="sm" decorative />
                      <span>as {person.name}</span>
                    </span>
                  </div>
                )}
              </>
            ) : person ? (
              <>
                <div className="bb__ifwho">
                  <Face kind="user" name={person.name} size="sm" decorative />
                  <span className="bb__ifwho__text">{person.name}</span>
                </div>
                {memberOf.length > 0 && (
                  <div className="bb__ifwho rl-c2__members" aria-label="Their groups">
                    {memberOf.map((g) => (
                      <span key={g} className="rl-c2__member">
                        <Face kind="group" name={g} size="sm" decorative />
                        <span>{g}</span>
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="bb__ifwho">
                <span className="bb__ifkw is-blank">Choose a person</span>
              </div>
            )}
          </Section>
          {facts.length > 0 && (
            <Section icon={Split} kw="if">
              <div className="bb__ifplain">
                {facts.map((f, i) => {
                  const Ico = conditionIcon(f.cond, '')
                  return (
                    <Fragment key={f.field}>
                      {i > 0 && (
                        <div className="bb__ifrow bb__ifjoin is-run">
                          <IfKw tone="and">and</IfKw>
                        </div>
                      )}
                      <div className="bb__ifrow is-cond">
                        <IfChip tone={conditionTone(f.cond, '')} variant="attr" icon={<Ico size={11} strokeWidth={2.2} />}>
                          {f.attr}
                        </IfChip>
                        <IfKw tone="op">{f.op}</IfKw>
                        <IfChip variant="val" title={f.value}>
                          {f.value}
                        </IfChip>
                      </div>
                    </Fragment>
                  )
                })}
              </div>
            </Section>
          )}
        </div>
      }
    />
  )
}

/* Several identities: the sign-in row's chips (IdentityChips.tsx), in the column's chip look (journey.css
   `.tj-engine__ids`). Too wide for the card, the names fold — the short ones, then the faces alone. `refit` is what
   else changes the room they have (the chain's shape, for a page's own first node), so they are measured again. */
export function ChipSwitch({ chips, onPick, lit = false, refit = '' }: { chips: readonly IdentityChip[]; onPick?: (key: string) => void; lit?: boolean; refit?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const key = `${chips.map((c) => `${c.key}:${c.mark ?? ''}:${c.active ? 1 : 0}`).join('|')}#${refit}`
  const [fold, setFold] = useState<{ key: string; fold: ChipFold }>({ key, fold: 'name' })
  const now = fold.key === key ? fold.fold : 'name'
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || now === 'face' || el.scrollWidth <= el.clientWidth + 1) return
    setFold({ key, fold: now === 'name' ? 'short' : 'face' })
  }, [key, now])
  return (
    <span ref={ref} className="rl-c2__who">
      <IdentityChips chips={chips} fold={now} lit={lit} onPick={onPick} className={`tj-engine__ids rl-c2__ids${now === 'face' ? ' is-faces' : ''}`} />
    </span>
  )
}

// --- 2. The policy ----------------------------------------------------------------------------

/* The policy that applies, as the Overview heads its node: the layers mark,
   "Policies", its name, "✓ Policy 1 of 4 applies · via Engineering" — or,
   while the engine is still finding it, "On AWS Console" and the builder's
   spinner; the tenant's default taking a sign-in none of the application's
   own policies covers: "No policy covers Maya Iyer". The body: the
   application's policies in the builder's section-and-line pattern —
   applies, also covers, skipped, not reached — one quiet line each, in the
   order the engine asks them. */
function PolicyCard({
  head,
  sections,
  appName,
  open,
  onFold,
  snap,
  animate,
  follow,
  onOpen,
  lit,
  onPress,
  order,
}: {
  head: ChainRun['policyHead']
  sections: ChainRun['sections']
  appName: string
  open: boolean
  onFold: () => void
  snap: boolean
  animate: boolean
  follow: boolean
  /** A policy's name pressed opens it in the page's panel (inspect-model.ts). */
  onOpen?: (policyId: string) => void
} & Pressed) {
  return (
    <Card
      card="policy"
      className={head.kind === 'finding' ? 'is-reading' : ''}
      lit={lit}
      onPress={onPress}
      order={order}
      tile={
        <span className="bb__idx rl-c2__idx" aria-hidden>
          <Layers size={14} strokeWidth={2.2} />
        </span>
      }
      kicker={head.kicker}
      title={head.title}
      meta={<Meta meta={head.meta} />}
      open={open}
      onFold={onFold}
      what={`the policies on ${appName}`}
      fold={['Fold this card', 'Show the policies']}
      snap={snap}
      follow={follow}
      body={
        <div className="bb__if">
          {sections.map((sec) => (
            <Section key={sec.key} icon={SECTION_ICON[sec.key]} kw={sec.kw} className="rl-c2__rows">
              {sec.rows.map((r) => (
                <div key={r.id} className={`bb__ifrow rl-c2__prow is-${sec.key}${r.conflict ? ' is-conflict' : ''}`}>
                  <span className="rl-c2__n">{r.order}</span>
                  {onOpen ? (
                    <button type="button" className="rl-c2__pname rl-c2__pnamebtn" title={`Open ${r.name}`} onClick={() => onOpen(r.id)}>
                      {r.name}
                    </button>
                  ) : (
                    <span className="rl-c2__pname" title={r.name}>
                      {r.name}
                    </span>
                  )}
                  {r.say && (
                    <motion.span className="rl-c2__say" initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: animate ? ARRIVE_S : 0, ease: EASE_OUT }}>
                      {r.say}
                    </motion.span>
                  )}
                  {r.standing === 'working' && <Mark mark={{ status: 'pass', working: true }} pop={false} />}
                  {r.standing === 'applies' && <Mark mark={{ status: 'pass', working: false }} pop={animate} />}
                </div>
              ))}
            </Section>
          ))}
        </div>
      }
    />
  )
}

// --- 3. The rule that passed ------------------------------------------------------------------

/* ONE rule, a card of its own on the chain, as the builder draws it — its
   number in the builder's tile, "Rule 2 of 3", its name, and what it came to
   ("✓ Matches · Then Allow on 1 factor"), ringed in its decision's colour
   once it has matched (owner, 1 Oct 2026: a rule card rings in its decision's
   colour). Its body is the builder's own IfBlock (who / if with its "and" /
   then), with a ✓ or ✕ at the right end of each row that was read — the only
   addition — and above it, the rules the engine read and moved past as one
   quiet line ("✕ Rule 1 not matched · Who"), never cards. While the engine
   reads, it is the rule the engine is on. None passed: the policy's last row,
   as the builder draws it. No policy decides: "No rule". */
function PassedRuleCard({
  plan,
  at: i,
  rules,
  fallback,
  s,
  open,
  onFold,
  snap,
  animate,
  follow,
  resolve,
  onOpen,
  inspects = false,
  onDetails,
  lit,
  onPress,
  order,
}: {
  plan: RunLayoutProps['plan']
  at: number | null
  rules: readonly Rule[]
  fallback: Rule | null
  s: number
  passed: ChainRun['passed']
  open: boolean
  onFold: () => void
  snap: boolean
  animate: boolean
  follow: boolean
  resolve: NameLookup
  onOpen?: (ruleId: string) => void
  /** The names open in the page's panel rather than in the builder: the icons say Details. */
  inspects?: boolean
  /** A rule of the list pressed for its details (the page's panel). */
  onDetails?: (ruleId: string) => void
} & Pressed) {
  const r = i !== null ? (plan.rules[i] ?? null) : null
  const head = ruleHead(plan, i, s)
  const { terminal, n, state } = head
  const tone = r ? TONE[r.decision] : ''
  const opens = onOpen && r ? () => onOpen(r.id) : undefined

  return (
    <Card
      card="rule"
      className={`${tone ? `is-${tone}` : ''}${terminal ? ' is-terminal' : ''}${state === 'matched' ? ' is-matched' : ''}${state === 'reading' || state === 'waiting' ? ' is-reading' : ''}`}
      lit={lit}
      onPress={onPress}
      order={order}
      tile={
        terminal ? (
          <span className="bb__idx is-home rl-c2__idx" aria-hidden>
            <span>
              <Asterisk size={13} strokeWidth={2} />
            </span>
          </span>
        ) : (
          <span className="bb__idx rl-c2__idx" aria-hidden>
            <span className="bb__idx__n">{n ?? '–'}</span>
          </span>
        )
      }
      kicker={head.kicker}
      title={head.title}
      meta={<Meta meta={head.meta} />}
      acts={
        /* Where the page's panel takes the names, no head icon: the canvas bar's Details and the names inside the cards
           are the way in (owner, 6 Oct 2026). In the builder, the ↗ into the rule's own card stays. */
        opens &&
        !inspects && (
          <button type="button" className="bb__act bb__topen" aria-label={terminal ? 'Open the default in its policy' : `Open rule ${n} in its policy`} title="Open in its policy" onClick={opens}>
            <ArrowUpRight size={13} strokeWidth={2.2} />
          </button>
        )
      }
      open={open}
      onFold={onFold}
      what={terminal ? 'what the default does' : n !== null ? `what rule ${n} checks` : 'the rule'}
      fold={['Fold this rule', terminal ? 'Show what it does' : 'Show what it checks']}
      snap={snap}
      follow={follow}
      body={
        <>
          {r ? (
            <RuleList plan={plan} current={r.id} rules={rules} fallback={fallback} s={s} settled={state !== 'reading' && state !== 'waiting'} animate={animate} resolve={resolve} onDetails={onDetails} />
          ) : (
            <div className="bb__if">
              <div className="bb__ifrow">
                <span className="bb__ifkw is-blank">{plan.outcome.view.line || 'No policy decides'}</span>
              </div>
            </div>
          )}
        </>
      }
    />
  )
}

/* Every rule of the policy that decided, in the policy's own order, then its last row — one list, not a card per rule
   (owner, 5 Oct 2026: "don't change the rule order … no need for 'other rules', just show the list of rules, and the one
   that matches or passes should be open"). The rule the engine is on, or that decided, is open by default; the others
   are a line — its number, its name, how it fared — and a press opens the builder's own rule body under it, with the
   ✓ and ✕ of the rows that were read (none on a rule never reached, which was not asked). A press again folds it.
   While the engine is still reading, only the rule it is on is drawn: the rest would give the answer away. */
const RULE_WORDS: Record<string, string> = { match: 'Matches', 'no-match': 'Not matched', unknown: 'Can’t tell', possible: 'Can’t tell', off: 'Switched off', 'not-reached': 'Not reached' }

function RuleList({ plan, current, rules, fallback, s, settled, animate, resolve, onDetails }: { plan: RunLayoutProps['plan']; current: string; rules: readonly Rule[]; fallback: Rule | null; s: number; settled: boolean; animate: boolean; resolve: NameLookup; onDetails?: (ruleId: string) => void }) {
  /* What the admin opened or folded by hand; the rest follows the rule that is on. */
  const [manual, setManual] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  const uid = useId()
  const listed = settled ? plan.rules : plan.rules.filter((r) => r.id === current)
  const toggle = (id: string, now: boolean) =>
    setManual((cur) => {
      const next = new Map(cur)
      next.set(id, !now)
      return next
    })
  return (
    <ul className="rl-c2__rules" aria-label="Rules in this policy">
      {listed.map((r) => {
        const terminal = r.index === null
        const rule = terminal ? (fallback ?? fallbackRule(r.decision)) : (rules.find((x) => x.id === r.id) ?? null)
        const open = manual.get(r.id) ?? r.id === current
        const word = RULE_WORDS[r.state] ?? ''
        const why = r.state === 'no-match' && r.failing !== null ? (r.checks[r.failing]?.word ?? '') : ''
        const marks = rule && r.visited && !terminal ? ruleMarks(r, leaves(rule.when).map((k) => k.id), s) : null
        const bodyId = `${uid}-${r.id}`
        return (
          <li key={r.id} className={`rl-c2__rule is-${r.state}${open ? ' is-open' : ''}`}>
            <div className="rl-c2__rulerow">
            <button type="button" className="rl-c2__rulehead" aria-expanded={open} aria-controls={bodyId} onClick={() => toggle(r.id, open)}>
              <span className="rl-c2__rulen">{terminal ? <Asterisk size={12} strokeWidth={2.2} aria-hidden /> : (r.index ?? 0) + 1}</span>
              <span className="rl-c2__rulename">{r.name}</span>
              <span className="rl-c2__rulestate">
                {word}
                {why && ` · ${why}`}
              </span>
              {open ? <ChevronUp size={13} strokeWidth={2} aria-hidden /> : <ChevronDown size={13} strokeWidth={2} aria-hidden />}
            </button>
            {onDetails && (
              <button type="button" className="bb__act rl-c2__ruledetails" aria-label={terminal ? 'Details of the last row' : `Details of rule ${(r.index ?? 0) + 1}`} title="Details" onClick={() => onDetails(r.id)}>
                <PanelRight size={13} strokeWidth={2.2} />
              </button>
            )}
            </div>
            {open && rule && (
              <div id={bodyId} className="rl-c2__rulebody">
                <IfBlock rule={rule} resolve={resolve} terminal={terminal} mark={marks ? (row) => <Mark mark={row === 'who' ? marks.who : marks.conds[row]} pop={animate} /> : undefined} />
                {onDetails && !terminal && <RuleUses rule={rule} />}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* What an open rule leans on — its zones, device profiles, hooks, the risk profile — each a press into the page's
   panel (the peeks). Only where the panel is there to take them. */
function RuleUses({ rule }: { rule: Rule }) {
  const lib = useBrand()
  const inspect = useContext(InspectCtx)
  const uses = objectsOfRule(rule, lib.activeRiskProfileId)
  if (!inspect || uses.length === 0) return null
  return (
    <p className="rl-c2__uses">
      <span className="rl-c2__useslabel">Uses</span>
      {uses.map((o) => (
        <button key={`${o.kind}-${o.id}`} type="button" className="rl-c2__use" onClick={() => inspect(o)}>
          {targetLabel(o, [], peekNames(lib))}
          <em>{PEEK_FALLBACK[o.kind]}</em>
        </button>
      ))}
    </p>
  )
}

// --- 4. The outcome ---------------------------------------------------------------------------

/* The answer, as the builder's end card draws a decision — down its edge, and
   here in its tile and title too: "Outcome", "Allow on 1 factor", "Decided by
   Rule 2". The body: `then` — the decision's chip and what the person is
   asked for, the builder's then-row (or the Deny's message; when it depends,
   each answer it could be); `decided by` — the policy and the rule, which
   opens it. Where the page hands it (`why`, Focus on the page), the body's
   last line is the way to the why in the page's right-hand panel — at the
   keywords' edge, after everything the card itself says, so it reads as the
   card's next step rather than as part of who decided. */
function OutcomeCard({
  plan,
  view,
  open,
  onFold,
  snap,
  follow,
  onOpen,
  inspects = false,
  why = null,
  lit,
  onPress,
  order,
}: {
  plan: RunLayoutProps['plan']
  view: OutcomeView
  open: boolean
  onFold: () => void
  snap: boolean
  follow: boolean
  onOpen?: () => void
  /** Decided by opens in the page's panel: its mark says Details. */
  inspects?: boolean
  /** The way to the why in the page's right-hand panel (`ChainWhy`); absent, the body ends at who decided. */
  why?: ChainWhy | null
} & Pressed) {
  const Icon = OUT_ICON[view.tone]
  const head = outcomeHead(plan, view)
  const reason = DENIAL_REASONS ? denyReasonOf(plan) : null
  return (
    <Card
      card="outcome"
      className={`is-terminal rl-c2__out ${OUT_CLASS[view.tone]}`}
      lit={lit}
      onPress={onPress}
      order={order}
      tile={
        <span className="bb__idx rl-c2__idx" aria-hidden>
          <Icon size={14} strokeWidth={2.2} />
        </span>
      }
      kicker={head.kicker}
      title={head.title}
      meta={<Meta meta={head.meta} />}
      open={open}
      onFold={onFold}
      what="what they get"
      fold={['Fold this card', 'Show what they get']}
      snap={snap}
      follow={follow}
      body={
        <div className="bb__if">
          {view.decision && (
            <>
              <div className="bb__ifrow">
                <IfKw>then</IfKw>
              </div>
              <IfSub className="bb__ifaction">
                <IfChip tone={TONE[view.decision]}>{DECISION_NAME[view.decision]}</IfChip>
                {view.decision === 'deny' ? (
                  <span className="bb__ifjourney rl-c2__said">{view.message ? `“${view.message}”` : 'Refused'}</span>
                ) : (
                  <span className="bb__ifjourney" aria-label="What they are asked for">
                    {[...view.factors, 'Signed in'].map((f, k) => (
                      <Fragment key={`${k}-${f}`}>
                        {k > 0 && <ArrowRight size={10} strokeWidth={2} aria-hidden />}
                        <span>{f}</span>
                      </Fragment>
                    ))}
                  </span>
                )}
              </IfSub>
              {reason && (
                <IfSub className="bb__ifaction">
                  <span className="bb__ifjourney rl-c2__reason">
                    {DENY_REASON_WORD[reason]} · <span>{denyRef(reason)}</span>
                  </span>
                </IfSub>
              )}
            </>
          )}
          {view.tone === 'depends' && (
            <>
              <div className="bb__ifrow">
                <IfKw>then</IfKw>
              </div>
              <IfSub className="rl-c2__rows">
                {view.outcomes.map((o) => (
                  <div key={o.label} className="bb__ifrow">
                    <span className="bb__ifjourney">{o.label}</span>
                    <ArrowRight size={10} strokeWidth={2} aria-hidden className="rl-c2__arrow" />
                    <IfChip tone={TONE[o.decision]}>{DECISION_NAME[o.decision]}</IfChip>
                  </div>
                ))}
              </IfSub>
            </>
          )}
          {view.link && (
            <>
              <div className="bb__ifrow">
                <IfKw>decided by</IfKw>
              </div>
              <IfSub className="bb__ifaction">
                {onOpen ? (
                  <button type="button" className="bb__titlebtn rl-c2__by" title={inspects ? 'Details' : 'Open in its policy'} onClick={onOpen}>
                    <span>{view.link}</span>
                    {inspects ? <PanelRight size={12} strokeWidth={2.2} aria-hidden /> : <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />}
                  </button>
                ) : (
                  <span className="rl-c2__by is-static">{view.link}</span>
                )}
              </IfSub>
            </>
          )}
          {!view.decision && view.tone !== 'depends' && !view.link && (
            <div className="bb__ifrow">
              <span className="bb__ifkw is-blank">{metaWords(head.meta) || view.title}</span>
            </div>
          )}
          {why && (
            <div className="bb__ifrow rl-c2__whyrow">
              <button type="button" className="rl-c2__why" aria-expanded={why.open} aria-controls={why.open ? why.id : undefined} onClick={why.onPress}>
                {why.label}
                <ChevronRight size={12} strokeWidth={2.2} aria-hidden />
              </button>
            </div>
          )}
        </div>
      }
    />
  )
}
