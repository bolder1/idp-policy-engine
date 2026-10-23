import { ChevronDown, ChevronUp, Minus } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'

import { Tip } from '../../../kit'
import { Board, type BoardRunGroup, type BoardRunView } from '../../board/Board'
import type { RunCard } from '../../board/RuleCard'
import { RUN_ID_PREFIX, RUN_STOPS, RUN_STOP_AWAY, runKeyStop, type RunFold } from './board-run-fold'
import { RUN_NOT_MATCHED, groupsFormed, lanePart, runCards, runLane, runLink, type RunCardModel, type RunGroup, type RunLinkKind, type RunMark, type RunWord } from './board-run-model'
import { Classic2Card, Mark, type ChainWhy } from './classic2-chain'
import { signInSentence, type CardKey } from './classic2-model'
import type { ChainRun } from './classic2-run'
import { Resolve } from './shared/run-text'
import type { RunLayoutProps } from './types'
import '../../board/board-run.css'

/* -----------------------------------------------------------------------------
   CHECK ACCESS V3: THE RUN ON THE BUILDER'S OWN CANVAS (phase.ts
   BUILDER_CANVAS_CHECK; owner, 20 Oct 2026: "the v3 is mainly based on how we
   have it in the builder's edit part … the same policy rule cards in the whole
   canvas instead of showing everything in one card … reuse the same cards and
   the same canvas … just focus on the animation and interactions").

   READ IN THREE MOVES (owner, 20 Oct 2026, evening: "so he can get the policy
   at the top, then which rule matters and what the outcome will be. That's
   it"): the policy, the rule that decided, the outcome right under it.

     ( [MI] Maya Iyer signs in to [⬡] AWS Console · 2 sign-in conditions │ ✎ ↻ )   the sign-in
                                   │
       ┌ [≡] Policy  AWS access                                          ▣ ┐   the policy's head (Classic2Card canvas)
       │     ↳ Outside this policy, Global Default Policy · Not reached      │
       └ Review conflict ›                                                  ┘
                                   │
       ┌ 1  Contractors away from the office                               ┐   a walked miss: the engine's sentence
       └    ✕ Not matched · Maya Iyer is not in Contractors                ┘
                                   │
       ┌ 2  Engineers on a compliant device                                ┐   the card that decided, in its tone
       │    ✓ Matches · via Engineering                                    │
       └      Rule 4 also matches · via Finance · not used                 ┘   the conflict, one quiet note
                   ⌄ Not reached · rules 3–6 and Nothing else matched          the rules never reached, ON the connector
       ┌ [✓] Outcome  Allow on 1 factor · Password                         ┐   right under the card that decided

   The policy arrives as ONE piece when it is found, every card one quiet line,
   as the builder draws it. The walk happens on each card's second line (`RunLine`):
   "Reading", then one token per check that ticks in turn; the check that failed
   lights for its beat, then the line settles to the engine's sentence, the
   connector below inks and the next card wakes. No card's body opens on its own,
   so the column never jumps. As the walk stops, the rules never reached fold
   onto the connector under the deciding card as one label, and walked misses
   that say the same stack into one card (board-run-model.ts `runGroups`): a
   press opens either in place. The deciding card locks once and keeps only its
   decision's edge.

   Nothing here keeps time: Focus2Layout's presenter hands the step (`run.s`, the
   presented one) and the fold (`useBoardRunFold`); the words are
   board-run-model.ts's. Board's own camera is switched off (canvas-view.ts
   `still`): Focus's RunStage scrolls, follows and frames.
   -------------------------------------------------------------------------- */

/** Decelerating: what arrives (classic2-chain.tsx's). */
const EASE_OUT = [0.2, 0, 0, 1] as const
const ARRIVE = { duration: 0.24, ease: EASE_OUT }
const PILL_IN = { duration: 0.2, ease: EASE_OUT }
/* --- The chain ---------------------------------------------------------------------------------------------------- */

export interface BoardRunChainProps {
  /** The run as Focus presents it: its `s` the presented step. */
  run: RunLayoutProps
  data: ChainRun
  fold: RunFold
  /** The run is told: cards arrive, marks pop, words resolve. */
  animate: boolean
  /** Nothing moves: reduced motion, a Skip, a run drawn settled. */
  snap: boolean
  /** The run's motion (RUN_MOTION): the lock, the decode, the folds. */
  motion: boolean
  /** The first node: the sign-in (classic2-pill.tsx `SignInNode`). */
  start: ReactNode
  why: ChainWhy | null
  lit: CardKey | null
  /** A card an answer or the brief points at (its engine id): traced while pinned. */
  litRow: string | null
  /** The folds of this run (board-run-model.ts `runGroups`): the rules never reached, and each stack of misses. */
  groups: readonly RunGroup[]
  /** The outcome has a body to read (a Deny's reason, a Depends' ways). */
  outcomeBody: boolean
  /** A press on a card while the run plays: the camera stands down for this run. */
  onHold?: () => void
  /** What they see's Preview (focus2-see.tsx, the button variant), in the outcome's head once the run has landed (owner,
      20 Oct 2026: "add a button to show the preview, the animated preview of the outcome we used to have"). */
  see?: ReactNode
}

export function BoardRunChain({ run, data, fold, animate, snap, motion: moving, start, why, lit, litRow, groups, outcomeBody, onHold, see }: BoardRunChainProps) {
  const { plan, s: p } = run
  const decider = data.decider
  const policyOn = data.shown.includes('policy') && !!decider && !plan.empty
  const outOn = data.shown.includes('outcome') && !plan.empty
  const play = animate && moving && !snap
  const cards = useMemo(() => runCards(plan, decider, p, { asGroup: data.group !== null, lock: play }), [plan, decider, p, data.group, play])
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const n = plan.rules.length
  const formed = groupsFormed(plan, p)
  const tail = groups.find((g) => g.kind === 'tail') ?? null
  const tailOpen = !!tail && formed && fold.open(tail.id)
  const lane = runLane(plan, p, tailOpen)
  /* The first card the admin opens by hand once the run has landed pops its marks, 40 ms apart; after that, settled. */
  const [popped, setPopped] = useState<{ key: number; id: string | null; seen: readonly string[] }>({ key: run.runKey, id: null, seen: [] })
  const pop = popped.key === run.runKey ? popped : { key: run.runKey, id: null, seen: [] as readonly string[] }
  const landed = data.landed
  /* The policy's head folds by hand or with Collapse all (20 Oct 2026); open at every new run. */
  const headOpen = fold.hand['policy-head'] !== false
  /* The connectors' ink: drawn in the accent as the walk reaches each card; the outcome's tone flowing down once it lands,
     then at rest. A connector the folded tail stands in for has no height. */
  const ink = (kind: RunLinkKind): string => {
    if (kind === 'idle') return ''
    if (kind === 'hidden') return 'is-hidden'
    if (kind === 'skip') return 'is-skip'
    if (kind === 'possible') return 'is-possible'
    if (!landed) return snap ? 'is-taken' : 'is-run'
    return snap ? 'is-taken' : `is-taken is-landed is-out-${data.outcome.tone}`
  }
  /* The lane by slot. Where the rules never reached are opened, their group carries the piece that passes them (the
     group's body folds, and a piece drawn by a card inside it would be clipped with it). */
  const inTail = (slot: number) => !!tail && formed && slot >= tail.from && slot <= tail.to
  const laneCls = (slot: number): { cls: string; i: number } | null => {
    if (inTail(slot)) return null
    const part = lanePart(lane, slot, n)
    if (!part || !lane) return null
    /* A decided run's lane is drawn only once its tail is opened by hand: at rest, never drawn in. */
    const rest = snap || !moving || lane.kind === 'taken'
    return { cls: `is-lane-${part.part} is-lane-${lane.kind}${part.tick ? ' is-lane-tick' : ''}${rest ? ' is-lane-rest' : ''}`, i: part.i }
  }

  /* --- The groups' folds ------------------------------------------------------------------------------------------- */

  /* A group's fold plays its keyframes while the run is told, and after it on a press (never on a run drawn settled,
     under reduced motion, or as a run re-renders): a group is marked moved, for this run, the first time its fold
     changes by hand. Read in render, so the class arrives in the same frame as the fold it plays. */
  const motionOk = moving && !run.reduced
  const moved = useRef<{ key: number; ids: Set<string>; was: Map<string, boolean> }>({ key: run.runKey, ids: new Set(), was: new Map() })
  if (moved.current.key !== run.runKey) moved.current = { key: run.runKey, ids: new Set(), was: new Map() }
  const openOf = (g: RunGroup) => formed && fold.open(g.id)
  for (const g of groups) {
    const now = openOf(g)
    const was = moved.current.was.get(g.id)
    if (formed && was !== undefined && was !== now && motionOk) moved.current.ids.add(g.id)
    moved.current.was.set(g.id, now)
  }
  /* Focus follows a press: opening a stack moves it to the label that folds it back, folding it back returns it to the
     stack's title (its card is drawn again). Collapse all, from the dock, takes it to the group's own control. */
  const focusTo = useRef<string | null>(null)
  const lastGroup = useRef<string | null>(null)
  const idOf = (g: RunGroup, part: 'btn' | 'title' | 'open' | 'body' | 'said'): string =>
    g.kind === 'tail' ? `${RUN_ID_PREFIX}bbr-tail-${part}` : `${RUN_ID_PREFIX}bbr-stack-${g.from}-${part}`
  const pressGroup = (g: RunGroup) => {
    const opening = !fold.open(g.id)
    if (!landed) onHold?.()
    if (g.kind === 'stack') focusTo.current = idOf(g, opening ? 'open' : 'title')
    fold.fold(g.id)
  }
  const wasOpen = useRef<Map<string, boolean>>(new Map())
  useLayoutEffect(() => {
    for (const g of groups) {
      const now = formed && fold.open(g.id)
      const before = wasOpen.current.get(g.id) ?? false
      wasOpen.current.set(g.id, now)
      if (!before || now || focusTo.current || lastGroup.current !== g.id) continue
      const active = typeof document === 'undefined' ? null : document.activeElement
      const lost = !active || active === document.body || !!active.closest('[inert],[hidden]')
      if (lost) focusTo.current = idOf(g, g.kind === 'tail' ? 'btn' : 'title')
    }
  })
  useEffect(() => {
    if (!focusTo.current) return
    const el = document.getElementById(focusTo.current)
    focusTo.current = null
    el?.focus()
  })
  /* Which group focus is in, so Collapse all can hand it back. */
  const onFocusIn = (e: FocusEvent<HTMLDivElement>) => {
    const t = e.target instanceof HTMLElement ? e.target : null
    const body = t?.closest('.bbr__group')?.querySelector<HTMLElement>(':scope > .bbr__groupbody')
    const g = body ? groups.find((x) => idOf(x, 'body') === body.id) : undefined
    lastGroup.current = g?.id ?? null
  }

  const groupViews: BoardRunGroup[] = groups.map((g) => {
    const open = openOf(g)
    const idle = !formed
    const anim = !idle && (play || moved.current.ids.has(g.id))
    /* The opened tail carries the lane past the rules in it (at rest). */
    const laneOn = g.kind === 'tail' && open && lane !== null
    const cls = `${idle ? ' is-idle' : ''}${open ? ' is-open' : ''}${anim ? ' is-play' : ''}${laneOn ? ` is-lane-through is-lane-${lane?.kind ?? 'taken'} is-lane-rest` : ''}`
    const link = ink(runLink(plan, g.from, p, tailOpen))
    const head =
      g.kind === 'tail' ? (
        <TailEdge group={g} open={open} formed={formed} link={link} btnId={idOf(g, 'btn')} bodyId={idOf(g, 'body')} onPress={() => pressGroup(g)} />
      ) : (
        <StackHead
          group={g}
          names={plan.rules.slice(g.from, g.to + 1).map((r) => r.name.trim() || 'Untitled rule')}
          open={open}
          formed={formed}
          link={link}
          ids={{ title: idOf(g, 'title'), open: idOf(g, 'open'), body: idOf(g, 'body'), said: idOf(g, 'said') }}
          onPress={() => pressGroup(g)}
        />
      )
    return { id: g.id, kind: g.kind, from: g.from, to: g.to, cls, head, bodyId: idOf(g, 'body'), label: g.open, idle, inert: !idle && !open }
  })

  /* --- The cards --------------------------------------------------------------------------------------------------- */

  const card = (m: RunCardModel): RunCard => {
    const r = plan.rules[m.at]
    const opened = fold.open(m.id)
    const handPop = pop.id === m.id
    return {
      state: m.state,
      word: m.word ? <RunLine word={m.word} play={play} tip={m.tip} note={m.note} /> : null,
      mark: (row: string) => {
        if (row === 'always') return <Mark mark={m.always} pop={play} />
        if (!m.marks) return null
        if (m.marks.skipped.includes(row)) return <span className="bbr__notchecked">Not checked</span>
        const ids = m.marks ? Object.keys(m.marks.conds) : []
        const delay = handPop ? 0.04 * (row === 'who' ? 0 : ids.indexOf(row) + 1) : 0
        return <Mark mark={row === 'who' ? m.marks.who : m.marks.conds[row]} pop={(play && !m.settled) || (handPop && opened)} delay={delay} />
      },
      row: r.id,
      follow: m.follow,
      lock: m.lock,
      decided: m.decided,
      describe: m.describe,
    }
  }
  /* A press on a card: its fold — never an editor, and never while text in it is being selected. While the run plays it
     stands, and the camera stands down. Once landed, the first card opened by hand pops its marks. */
  const selecting = () => {
    const sel = typeof window === 'undefined' ? null : window.getSelection()
    return !!sel && !sel.isCollapsed && sel.toString().trim() !== ''
  }
  const press = (id: string) => {
    if (selecting()) return
    const opening = !fold.open(id)
    if (!landed) onHold?.()
    else if (opening && !pop.seen.includes(id)) setPopped({ key: run.runKey, id, seen: [...pop.seen, id] })
    fold.fold(id)
  }
  const outLane = laneCls(n)
  const outLink = ink(runLink(plan, n, p, tailOpen))
  const view: BoardRunView = {
    idPrefix: RUN_ID_PREFIX,
    card: (id) => {
      const m = byId.get(id)
      return m ? card(m) : undefined
    },
    link: (slot) => ({ cls: ink(runLink(plan, slot, p, tailOpen)), i: slot + 2 }),
    lane: laneCls,
    groups: groupViews,
    end: outOn ? (
      <div className={`bb__runslot is-out${outLane ? ` ${outLane.cls}` : ''}`} style={outLane ? ({ '--bbr-lane-i': outLane.i } as CSSProperties) : undefined}>
        <div className={`bb__link is-bare${outLink ? ` ${outLink}` : ''}`} style={{ '--rl-c2-link-i': n + 2 } as CSSProperties} aria-hidden />
        <motion.div className="bbr__out" initial={play ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={play ? { duration: 0.2, delay: 0.12, ease: EASE_OUT } : { duration: 0 }}>
          <Classic2Card card="outcome" canvas motion={moving} run={run} data={data} open={outcomeBody && fold.open('outcome')} onFold={() => press('outcome')} snap={snap} animate={animate} lit={lit === 'outcome'} order={0} outcomeActs={landed ? see : undefined} />
        </motion.div>
      </div>
    ) : undefined,
  }
  /* ↑ ↓ Home End walk the cards' titles and the groups' labels, skipping whatever is folded away (Escape is never held). */
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target instanceof HTMLElement ? e.target : null
    if (!t || !(t.classList.contains('bb__titlebtn') || t.classList.contains('bbr__groupbtn'))) return
    const stops = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(RUN_STOPS)].filter((el) => !el.closest(RUN_STOP_AWAY))
    const to = runKeyStop(e.key, stops.indexOf(t as HTMLButtonElement), stops.length)
    if (to === null) return
    e.preventDefault()
    e.stopPropagation()
    stops[to]?.focus()
  }
  const sentence = signInSentence(data.who, data.appName ?? plan.appName)
  /* The connector into the policy's head: taken once it is found. */
  const headLink = policyOn ? ink('taken') : ''
  return (
    <div
      className={`bbr is-out-${data.outcome.tone}`}
      role="group"
      aria-label={sentence}
      aria-busy={animate && !landed ? true : undefined}
      onKeyDown={keys}
      onFocus={onFocusIn}
      style={{ '--rl-c2-step': '0.22s', '--bbr-lane-step': `${lane?.step ?? 80}ms` } as CSSProperties}
    >
      <motion.div className="bbr__pill" initial={play ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={play ? PILL_IN : { duration: 0 }}>
        {start}
      </motion.div>
      {policyOn && decider && (
        <>
          <div className={`bb__link is-bare${headLink ? ` ${headLink}` : ''}`} style={{ '--rl-c2-link-i': 1 } as CSSProperties} aria-hidden />
          {/* The policy as ONE piece, as the builder draws it (Board's own doctrine: nothing flies in card by card). */}
          <motion.div key={`policy-${run.runKey}`} className="bbr__policy" initial={play ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={play ? ARRIVE : { duration: 0 }}>
            <Classic2Card card="policy" canvas motion={moving} run={run} data={data} open={headOpen} onFold={() => fold.toggleHead()} snap={snap} animate={animate} lit={lit === 'policy'} why={why} order={0} />
            <BoardOfRun policy={decider} view={view} fold={fold} onPress={press} litRow={litRow} resolve={data.resolve} />
          </motion.div>
        </>
      )}
    </div>
  )
}

/* Board, read by the run: every handler stands down but the fold. */
function BoardOfRun({ policy, view, fold, onPress, litRow, resolve }: { policy: NonNullable<ChainRun['decider']>; view: BoardRunView; fold: RunFold; onPress: (id: string) => void; litRow: string | null; resolve: ChainRun['resolve'] }) {
  const traced = litRow ? [litRow] : []
  return (
    <Board
      policy={policy}
      destination={null}
      selection={NO_SELECTION}
      diagnostics={[]}
      shadowed={[]}
      traced={traced}
      resolve={resolve}
      onSelect={(sel) => {
        if (sel.kind === 'rule') onPress(sel.id)
        else if (sel.kind === 'fallback') onPress('fallback')
      }}
      onInsert={noop}
      onMove={noop}
      onToggle={noop}
      onDuplicate={noop}
      onDelete={noop}
      onHover={noop}
      expandedOf={fold.open}
      onToggleExpand={onPress}
      run={view}
    />
  )
}

const noop = () => {}
const NO_SELECTION = { kind: 'none' } as const

/* --- A card's second line ----------------------------------------------------------------------------------------- */

/* What the sign-in made of a card, on its own line under the name (owner, 20 Oct 2026, evening: "What if the rules get
   bigger? … put it under it"): a mark, the machine's words, and after them the engine's finding or a name.

     reading   ◌ Reading  Who ✓  Device ◌          one token per check, ticking in turn; the one that failed lights
     result    ✕ Not matched · Maya Iyer is not in Contractors

   The line opens under the name as the walk reaches the card; the machine's words resolve (Aruna's decode, quiet glyphs
   — never a name), what follows sharpens in. The deciding card's conflict note sits under it. The line is aria-hidden:
   the title's description says it once. Under a resting pointer, the evidence whole (the kit's Tip), only where it says
   more than the line. */
function RunLine({ word, play, tip, note }: { word: RunWord; play: boolean; tip: string | null; note: string | null }) {
  const after = word.why ?? word.name
  const why = after ? (
    <span className="bbr__why">
      {' · '}
      {after}
    </span>
  ) : null
  return (
    <span className={`bbr__statewrap${play ? ' is-play' : ''}`}>
      <span className="bbr__statein">
        <span className={`bbr__state is-${word.tone}`} aria-hidden>
          <span className="bbr__mk">{word.mark && <LineMark mark={word.mark} pop={play} />}</span>
          {word.tokens ? (
            <span className="bbr__strip">
              <span className="bbr__lead">
                <Resolve text={word.lead} play={play} ms={200} />
              </span>
              {word.tokens.map((t) => (
                <span key={t.key} className={`bbr__tok${t.hit ? ' is-hit' : ''}`}>
                  {t.word}
                  <Mark mark={{ status: t.mark === 'working' ? 'pass' : t.mark, working: t.mark === 'working' }} pop={play} />
                </span>
              ))}
            </span>
          ) : (
            <span className="bbr__txt">
              <span className="bbr__lead">
                <Resolve text={word.lead} play={play} ms={200} />
              </span>
              {why && tip ? (
                <Tip text={tip} placement="top">
                  {why}
                </Tip>
              ) : (
                why
              )}
            </span>
          )}
        </span>
        {note && (
          <span className="bbr__also" aria-hidden>
            {note}
          </span>
        )}
      </span>
    </span>
  )
}

/* The line's own mark: the rows' family (`Mark`: ✓ ✕ ? and the spinner), and the two the rows don't have — a possible way
   (an empty dashed ring) and switched off (a dash). */
function LineMark({ mark, pop }: { mark: RunMark; pop: boolean }) {
  if (mark === 'possible') return <span className="bb__tmark is-possible" aria-hidden />
  if (mark === 'off')
    return (
      <span className="bb__tmark is-off" aria-hidden>
        <Minus size={12} strokeWidth={2.4} />
      </span>
    )
  return <Mark mark={{ status: mark === 'working' ? 'pass' : mark, working: mark === 'working' }} pop={pop} />
}

/* --- The groups' heads -------------------------------------------------------------------------------------------- */

/* The rules never reached, on the connector under the card that decided: ONE quiet label, a disclosure — "⌄ Not
   reached · rules 3–6 and Nothing else matched"; opened, "⌃ Not reached". The label is the connector's sibling, never
   inside it (a hovered `.bb__link` takes the brand in board.css). Before the walk is over, no label and no height. */
function TailEdge({ group, open, formed, link, btnId, bodyId, onPress }: { group: RunGroup; open: boolean; formed: boolean; link: string; btnId: string; bodyId: string; onPress: () => void }) {
  return (
    <div className={`bb__runslot bbr__edge${formed ? ' is-label' : ''}`}>
      <div className={`bb__link is-bare${link ? ` ${link}` : ''}`} style={{ '--rl-c2-link-i': group.from + 2 } as CSSProperties} aria-hidden />
      {formed && (
        <button
          type="button"
          id={btnId}
          className="bbr__groupbtn"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={(e) => {
            e.stopPropagation()
            onPress()
          }}
        >
          {open ? <ChevronUp size={14} strokeWidth={2.2} aria-hidden /> : <ChevronDown size={14} strokeWidth={2.2} aria-hidden />}
          <span className="bbr__groupword">{open ? group.open : group.words}</span>
          {open && <span className="u-sr-only">{group.words.slice(group.open.length)}</span>}
        </button>
      )}
    </div>
  )
}

/* Walked misses that say the same, as ONE card: the builder's card shape with a range for its number, the rules' names
   on line 1 and the one sentence on line 2, two folded card edges under it. A press opens it in place: the card gives
   way to a slim label on the connector ("⌃ Rules 1–3") and the rules it holds, each with its own sentence. Before the
   walk is over, the head has no height and the rules stand as they always do. */
function StackHead({
  group,
  names,
  open,
  formed,
  link,
  ids,
  onPress,
}: {
  group: RunGroup
  names: readonly string[]
  open: boolean
  formed: boolean
  link: string
  ids: { title: string; open: string; body: string; said: string }
  onPress: () => void
}) {
  const joined = names.join(' · ')
  return (
    <div className="bbr__stackhead" inert={!formed}>
      <div className="bbr__stackin">
        <div className="bb__runslot">
          <div className={`bbr__edge${open ? ' is-label' : ''}`}>
            <div className={`bb__link is-bare${link ? ` ${link}` : ''}`} style={{ '--rl-c2-link-i': group.from + 2 } as CSSProperties} aria-hidden />
            {open && (
              <button
                type="button"
                id={ids.open}
                className="bbr__groupbtn"
                aria-expanded
                aria-controls={ids.body}
                onClick={(e) => {
                  e.stopPropagation()
                  onPress()
                }}
              >
                <ChevronUp size={14} strokeWidth={2.2} aria-hidden />
                <span className="bbr__groupword">{group.open}</span>
              </button>
            )}
          </div>
          <div className="bb__card bbr__stackcard is-r-stack" role="group" aria-labelledby={ids.title} hidden={open} onClick={onPress}>
            <div className="bb__cardhead">
              <span className="bb__idx is-still is-range" aria-hidden>
                <span className="bb__idx__n">{group.words}</span>
              </span>
              <div className="bb__title">
                <span className="bb__titlerow">
                  <button
                    type="button"
                    id={ids.title}
                    className="bb__titlebtn"
                    aria-expanded={false}
                    aria-controls={ids.body}
                    aria-describedby={ids.said}
                    title={joined}
                    onClick={(e) => {
                      e.stopPropagation()
                      onPress()
                    }}
                  >
                    <strong>{joined}</strong>
                  </button>
                </span>
                <RunLine word={{ lead: RUN_NOT_MATCHED, why: group.finding, mark: 'fail', tone: 'quiet' }} play={false} tip={null} note={null} />
                <span id={ids.said} className="u-sr-only">
                  {`${group.open}: ${names.join('; ')}. ${RUN_NOT_MATCHED}${group.finding ? ` · ${group.finding}` : ''}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
