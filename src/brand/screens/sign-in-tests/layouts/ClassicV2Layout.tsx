import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { foldAllWord } from './classic2-model'
import { Classic2Chain } from './classic2-chain'
import { useChainFold, useChainRun } from './classic2-run'
import type { RunLayoutProps } from './types'
import './classic2.css'

/* -----------------------------------------------------------------------------
   CLASSIC V2 — Check access drawn as the policy builder draws a policy
   (run-layout.ts `classic2`). Owner, 5 Oct 2026, the team's ask: "the same
   experience we have in creating policy … 4 basic cards: one for the user
   form, one for the policy selection, one for the rules that pass and one for
   the outcome. As basic as you can." And then, pointing at the builder's rule
   card: "they want the same cards … beautifully crafted, well executed, easy
   to read and simple … focus on the cards and the vertical flow only." Classic
   (the column, EngineJourney.tsx) stays as it is.

                 ( [logo] A sign-in arrives at AWS Console )         the builder's start pill, read-only
                                    ╎
             ┌ (MI)  Sign-in                           ✎ ↻ ⇕ ┐      the builder's head, three lines as the
             │       Maya Iyer → [logo] AWS Console          │      Overview's node: the step, what was
             │       2 sign-in conditions                    │      selected, one meta line
             └  who (MI) Maya Iyer · (EN) Engineering … if … ┘      the builder's body: keyword, guide, rows
                                    ╎
             ┌ [≡]   Policies                              ⇕ ┐
             │       AWS for engineering teams               │
             └       ✓ Policy 1 of 4 applies · via Engineering
                                    ╎
             ┌ [2]   Rule 2 of 3                         ↗ ⇕ ┐      the rule that passed, ringed in its
             │       Engineers on a compliant device         │      decision's colour; open, the rules it
             └       ✓ Matches · Then Allow on 1 factor      ┘      read and passed over are one quiet line
                                    ╎
             ▌[✓]   Outcome                                ⇕ ┐      the builder's end card, its decision
             │       Allow on 1 factor                       │      down the edge
             └       Decided by Rule 2                       ┘
                          [ ⇕ Expand all ]                           the builder's dock, its one button

   The canvas is the builder's: the start pill, its connector (`.bb__link`,
   minus the `+` — the line keeps the gap the `+` stood in), cards
   `--bb-card` wide down the middle, each the builder's card (`.bb__card`):
   its head (`.bb__idx` tile, then the Overview's kicker / title / meta in the
   title's track, the fold in the head's right slot as its Centred skin puts
   it) and its sunken body (`.bb__if`: a lowercase keyword with its mark, and
   under it the content on the guide `.bb__ifbody`) — the rule's body IS the
   builder's `IfBlock`, the others are built from its pieces (`IfKw`,
   `IfChip`, `IfSub`, the condition row).

   What the run does to it: the cards arrive as the engine reaches them, top to
   bottom (opacity and a few px, Motion's), each open as it arrives so the
   admin sees it work — the policy's spinner while it is found, the rule's rows
   marked as they are read. When it lands, every card folds to its head
   (owner, 5 Oct 2026: "by default, all cards should be collapsed when we reach
   the last outcome so the user can read easily, like we have in the policy
   build") and the chain reads as four heads. Each card's fold opens it again;
   the dock's one button does all four. Reduced motion, Skip or a revisit: the
   settled, folded chain at once.

   Its own top (run-layout.ts `OWN_TOP`): the sign-in card carries the pencil
   (the panel on the form) and Replay; with two or more identities run, the
   sign-in row's chips switch between them, under its head.
   -------------------------------------------------------------------------- */

/* THE CHAIN IS SHARED (owner, 5 Oct 2026: "Classic v2 should be merged here as it is, as a vertical card view"): the
   start pill, the connectors and the four cards are classic2-chain.tsx's, their words classic2-run.ts `useChainRun`'s
   and their fold `useChainFold`'s, so Focus's Vertical draws the very same chain. What is this file's alone is the
   canvas it stands on: the scroller, following the engine down it, the fit once it lands, and the builder's dock. */

/** A body folding to its head, or opening from it (classic2-chain.tsx's): the fit waits it out. */
const FOLD_S = 0.26
/** The least the landed chain is zoomed to fit; below it the view settles on the outcome instead (owner's "readable" floor). */
const FIT_MIN = 0.85
/** The canvas's top fade (journey.css `.tj-canvas::after`): a card under it is a card cut. */
const FADE_PX = 64

export default function ClassicV2Layout(props: RunLayoutProps) {
  const { s, running, animate, reduced, jumped, runKey } = props
  const data = useChainRun(props)
  const { shown, landed } = data
  /* No motion for what is folded or opened by itself when the admin asked for none, or skipped to the answer. */
  const snap = reduced || jumped

  /* The fold: open as reached while it plays, folded once it lands; what the admin pressed stands until the next run
     (or another identity of it). */
  const fold = useChainFold(`${runKey}:${props.identities?.find((i) => i.active)?.key ?? ''}`, shown, landed)

  /* Following the engine: the card it is on, scrolled into view by as little as shows it, while it plays. */
  const scroller = useRef<HTMLDivElement | null>(null)
  const chain = useRef<HTMLDivElement | null>(null)
  const followKey = running ? `${s}` : ''
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !followKey) return
    const target = el.querySelector<HTMLElement>('[data-follow]') ?? el.querySelector<HTMLElement>('.rl-c2__chain > .rl-c2__seg:last-child')
    target?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [followKey, reduced])

  /* Landed, and folded: the whole chain in view (owner, 5 Oct 2026: "so the user can read easily"). Taller than the
     canvas — a short window, or chips — it is zoomed to fit, down to FIT_MIN; still taller, the view settles on the
     outcome, with no card left half under the top fade. Once a run; a new run starts at zoom 1. */
  const [zoom, setZoom] = useState<{ key: number; z: number }>({ key: runKey, z: 1 })
  const z = zoom.key === runKey ? zoom.z : 1
  const landedKey = landed ? runKey : null
  useEffect(() => {
    if (landedKey === null) return
    const fit = () => {
      const el = scroller.current
      const ch = chain.current
      if (!el || !ch) return
      const now = Number(getComputedStyle(ch).getPropertyValue('--rl-c2-z')) || 1
      const natural = ch.getBoundingClientRect().height / now
      const room = el.clientHeight
      const want = natural <= room ? 1 : Math.max(FIT_MIN, Math.floor((room / natural) * 100) / 100)
      setZoom({ key: landedKey, z: want })
      if (natural * want <= room) {
        el.scrollTo({ top: 0, behavior: snap ? 'auto' : 'smooth' })
        return
      }
      /* Too tall even at the floor: the outcome in view, at the foot; a card the top fade would cut is moved clear of it. */
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
        const top = el.getBoundingClientRect().top + FADE_PX
        const cut = [...el.querySelectorAll<HTMLElement>('.rl-c2__card')].find((c) => {
          const b = c.getBoundingClientRect()
          return b.top < top && b.bottom > top
        })
        if (cut) el.scrollTop -= top - cut.getBoundingClientRect().top
      })
    }
    const t = window.setTimeout(fit, snap ? 0 : FOLD_S * 1000 + 60)
    return () => window.clearTimeout(t)
  }, [landedKey, snap])

  return (
    <>
      <div ref={scroller} className="tj-scroll rl-c2">
        <Classic2Chain run={props} data={data} fold={fold} animate={animate} snap={snap} chainRef={chain} zoom={z} />
      </div>
      {/* The builder's view dock (Board.tsx `.bb__dock`), its one labelled button and nothing else: no zoom, undo or fit. */}
      <div className="bb__dock rl-c2__dock">
        <div className="bb__float bb__dockbar" role="toolbar" aria-label="View">
          <button type="button" className="bb__densitybtn" onClick={fold.foldAll}>
            {fold.anyOpen ? <ChevronsDownUp size={14} strokeWidth={2} aria-hidden /> : <ChevronsUpDown size={14} strokeWidth={2} aria-hidden />}
            {foldAllWord(fold.anyOpen)}
          </button>
        </div>
      </div>
    </>
  )
}
