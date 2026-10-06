import { GalleryHorizontal } from 'lucide-react'
import { AnimatePresence, motion, type Transition } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { stepMs } from '../use-engine-run'
import type { Target } from './assistant/intents'
import { workingCite, type BriefModel, type CiteId } from './brief-model'
import { Sentence } from './brief-sentence'
import { QUIET } from './brief-text'
import { EASE_OUT } from './focus-shared'
import { citeOfLit, citeTargets } from './focus2-brief-model'
import type { RunLayoutProps } from './types'
import './brief.css'
import './brief-text.css'
import './focus2-brief.css'

/* -----------------------------------------------------------------------------
   THE BRIEF, INSIDE FOCUS (owner, 5 Oct 2026, pointing at the Brief view's
   sentence: "add this in the focus mode … on click, in an animated way, add
   the brief thing as well so the user can see this as a view; if needed can
   switch or can add both").

   Two toggles in the sign-in row, Cards and Brief, either or both on
   (Focus2Layout.tsx owns the pick). This is the brief's half of it:

     both    the sentence is the canvas's headline — under the row, centred, a
             step or two under the Brief view's own size — with the finding
             line under it, and the cards under that. No "How it was
             decided": the cards ARE how it was decided.
     alone   the sentence alone, as the Brief view draws it: centred in the
             canvas at Brief's own size, the finding line, and "How it was
             decided" — which here turns the cards back on.

   It is the Brief view's own sentence, not a second one: the words are said
   by brief-input.ts (which BriefLayout reads too), drawn by brief-sentence.tsx
   with the version 0 call (brief-text-0.tsx, quiet underlines, no numbers),
   and written in by that file's own word animation — blur 6 px → 0, one sweep
   through the words already proven when the block opens, then each part at
   its own step as the story reaches it. It is handed the PRESENTED step, so
   it never says what the cards have not reached.

   A cited phrase is Focus's citation: hovered it lights its card (and, once
   the story is told, brings it to the centre); pressed it pins it, pressed
   again it lets go — focus2-brief-model.ts says which card each phrase is.

   MOTION, all on Motion props: the block opens from height 0 and collapses
   back to it; between the headline and alone it glides (top / y in percent,
   so it lands centred whatever its height) and grows (font-size between two
   custom properties, focus2-brief.css — tokens, resolved by Motion at the
   start of each move). Reduced motion: everything in place at once.
   -------------------------------------------------------------------------- */

/** One move: the stage's ease, the focus pull's 420 ms. */
const MOVE: Transition = { duration: 0.42, ease: EASE_OUT }
const NONE: Transition = { duration: 0 }
/** The sweep's pace per word (brief-sentence.tsx `sweep`), for when the finding line follows it. */
const SWEEP_WORD = 0.035
const SWEEP_CAP = 1

export interface Focus2BriefProps {
  /** The presented props (`{...props, s: p}`): the sentence is built at the picture's step, never the engine's. */
  run: RunLayoutProps
  /** The sentence, as brief-input.ts says it for this run (read once by the layout, which also keeps its numbers once). */
  model: BriefModel
  /** The brief alone on the canvas (the cards off), or the headline over them. */
  alone: boolean
  /** The PRESENTED landing. */
  landed: boolean
  /** Words arrive as written (the story being told, or the block opened by a press); off, they are simply there. */
  animate: boolean
  reduced: boolean
  look: 'light' | 'dark'
  /** What Focus has lit and pinned (focus-shared.ts `LitCtx`): the phrase that stands for it lights too. */
  lit: string | null
  pinned: string | null
  /** The headline's width, and the brief's own when it is alone. */
  headW: number
  aloneW: number
  /** The canvas is narrow: the brief at its floor size (brief.css `.is-narrow`), the headline a step under it. */
  narrow: boolean
  onCite: (t: Target | null) => void
  onPin: (t: Target) => void
  /** "How it was decided", alone: the cards back on. */
  onHow: () => void
  /** The headline's height, measured off its ghost: the cards stand under it. */
  onHead: (h: number) => void
}

export function Focus2Brief({ run, model, alone, landed, animate, reduced, look, lit, pinned, headW, aloneW, narrow, onCite, onPin, onHow, onHead }: Focus2BriefProps) {
  const { plan, s, runKey } = run
  const targets = useMemo(() => citeTargets(plan, model), [plan, model])
  const working = landed ? null : workingCite(plan, s, model.decisive)
  const durOf = useCallback((at: number) => stepMs(plan, at), [plan])
  const onHot = useCallback((c: CiteId | null) => onCite(c ? (targets[c] ?? null) : null), [onCite, targets])
  const onPress = useCallback(
    (c: CiteId) => {
      const t = targets[c]
      if (t) onPin(t)
    },
    [onPin, targets],
  )
  const move = reduced ? NONE : MOVE

  /* The headline's height, read off an unseen copy of it at the headline's size and width: the live block grows and
     shrinks as it moves, and the cards are placed for where it ends, once, rather than chasing it. */
  const ghost = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = ghost.current
    if (!el) return
    const read = () => onHead(Math.ceil(el.offsetHeight))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHead])

  /* Where it stands. Opening, it starts there at its own width — read off the page instead, the width would be the
     world's, and the height it opens to would be measured for lines it never has. */
  const place = { top: alone ? '50%' : '0%', y: alone ? '-50%' : '0%', width: alone ? aloneW : headW }
  return (
    <motion.div
      className={`rl-brief rl-f2b is-${alone ? 'alone' : 'head'}${narrow ? ' is-narrow' : ''}`}
      data-stage={look}
      initial={{ ...place, height: 0, opacity: 0 }}
      animate={{ ...place, height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={move}
    >
      <div className="rl-f2b__body">
        {/* A new run is a new sentence, written in afresh (the parts' keys are the same from run to run). */}
        <Words key={runKey} model={model} s={s} landed={landed} animate={animate} working={working} lit={citeOfLit(lit, targets)} pinned={citeOfLit(pinned, targets)} durOf={durOf} onHot={onHot} onPin={onPress} alone={alone} move={move} />
        <AnimatePresence initial={false}>
          {alone && (
            <motion.div key="how" className="rl-f2b__how" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={move}>
              <button type="button" className={`rl-brief__how${landed ? '' : ' is-waiting'}`} disabled={!landed} onClick={onHow}>
                <GalleryHorizontal size={14} strokeWidth={2} aria-hidden />
                How it was decided
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div ref={ghost} className="rl-f2b__ghost" style={{ width: headW }} aria-hidden inert>
        <div className="rl-brief__answer">
          <Sentence className={QUIET} parts={model.parts} num={model.num} s={s} landed animate={false} working={null} lit={null} pinned={null} tone={model.tone} durOf={durOf} onHot={noop} onPin={noop} numbers={false} />
          {model.after.length > 0 && <Sentence className="is-after" parts={model.after} num={model.num} s={s} landed animate={false} working={null} lit={null} pinned={null} tone={model.tone} durOf={durOf} onHot={noop} onPin={noop} numbers={false} />}
        </div>
      </div>
    </motion.div>
  )
}

const noop = () => {}

interface WordsProps {
  model: BriefModel
  s: number
  landed: boolean
  animate: boolean
  working: CiteId | null
  lit: CiteId | null
  pinned: CiteId | null
  durOf: (at: number) => number
  onHot: (c: CiteId | null) => void
  onPin: (c: CiteId) => void
  alone: boolean
  move: Transition
}

/* The sentence and its finding line, at the size the block is at. Brief's version 0 call (brief-text-0.tsx), with one
   addition: `sweep` on the first paint, so the words already proven when the block opens arrive as one sweep through
   the sentence rather than every part at once; the finding line follows the sweep. */
function Words({ model, s, landed, animate, working, lit, pinned, durOf, onHot, onPin, alone, move }: WordsProps) {
  const [opening, setOpening] = useState(true)
  useEffect(() => setOpening(false), [])
  const sweep = opening && animate
  const said = model.parts.filter((p) => landed || s >= p.at).reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0)
  return (
    <motion.div className="rl-brief__answer rl-f2b__say" initial={false} animate={{ fontSize: alone ? 'var(--f2b-alone)' : 'var(--f2b-head)' }} transition={move}>
      <Sentence className={QUIET} parts={model.parts} num={model.num} s={s} landed={landed} animate={animate} working={working} lit={lit} pinned={pinned} tone={model.tone} durOf={durOf} onHot={onHot} onPin={onPin} numbers={false} sweep={sweep} />
      {model.after.length > 0 && (
        <motion.div className="rl-f2b__find" initial={sweep ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={sweep ? { duration: 0.32, delay: Math.min(SWEEP_CAP, said * SWEEP_WORD), ease: EASE_OUT } : NONE}>
          <Sentence className="is-after" parts={model.after} num={model.num} s={s} landed={landed} animate={animate && !sweep} working={null} lit={lit} pinned={pinned} tone={model.tone} durOf={durOf} onHot={onHot} onPin={onPin} numbers={false} />
        </motion.div>
      )}
    </motion.div>
  )
}
