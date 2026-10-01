import { motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

import { DECISION_WORDS } from '../../decision-words'
import { useBrand } from '../../store'
import { TipDot } from '../../kit'
import { Seg } from '../board/Section'
import { SignInPlayer } from './player/SignInPlayer'
import { stepLabel, type SignInScreens } from './screens-of'
import './testing.css'

/* -----------------------------------------------------------------------------
   What they see: the sign-in the person would go through, for the answer on
   screen (screens-of.ts builds the pages), played (player/SignInPlayer.tsx):
   the username typing in, the code arriving, the press, and the app's home
   or the deny page at the end.

   One component for every surface (final spec, Assumption 28), and open on
   every one of them (owner, 30 Sep 2026: "by default make it active so the
   user can see the thing in action") — the board's outcome popover and the
   Sign-in tests page's outcome card alike. The card can fold it away; the
   popover cannot (`collapsible={false}`), since the popover is the
   disclosure and folding it would leave a popover with only its title. It plays once, a beat after it
   comes into view, and holds on its end; its step chips replay a step,
   Replay the whole of it.

   One switch, only when there is something to switch between: the decision,
   when the sign-in could get more than one answer — each plays its own.

   A caption says it is an approximation, every time. The product's own pages
   are not in this prototype, and a picture of one that looked exact would be
   read as exact.

   Beside an answer's words, split (`side`): the stage alone in its place,
   and its label, the decision switch and the steps in the slot the outcome
   card keeps under its words — so the card is as tall as the stage and
   neither half stands empty (owner, 1 Oct: "so much white space"). There the
   caption is the label's ⓘ, said on hover, not a line of its own.
   -------------------------------------------------------------------------- */

export function WhatTheySee({
  screens,
  appId,
  title = 'What they see',
  defaultOpen = true,
  collapsible = true,
  hidden = false,
  fade = true,
  compact = false,
  side,
}: {
  screens: readonly SignInScreens[]
  appId: string | null
  title?: string
  /** Open unless a caller says otherwise; every surface now opens it. */
  defaultOpen?: boolean
  /** A title that folds the pages away. False where the surface is itself a
      disclosure — the board's popover: a plain heading, always open. */
  collapsible?: boolean
  /** The answer has not landed yet — a marker is still travelling to it. Held
      at nothing in its place, and brought up 80 ms after it lands; the film
      waits for it. */
  hidden?: boolean
  /** A new answer may cross-fade. False while a slider is held, where it would
      flicker under the thumb. */
  fade?: boolean
  /** Beside the words of an answer (the Sign-in tests page's outcome): the
      stage 16:10 at a narrow width, its title a quiet label. */
  compact?: boolean
  /** Split: where the label, the decision switch, the steps and the caption go,
      apart from the stage — drawn there once the slot is mounted. Absent, all
      in one column. */
  side?: HTMLElement | null
}) {
  const { apps } = useBrand()
  const reduced = useReducedMotion() === true
  const bodyId = useId()
  const [open, setOpen] = useState(defaultOpen)
  const [pick, setPick] = useState(0)
  /* Split: the steps' row inside the side, for the player to draw its chips in. */
  const [steps, setSteps] = useState<HTMLDivElement | null>(null)

  /* A new answer starts again from its first decision. The pages are
     compared by what they say, so a re-render with the same answer keeps the
     tester's choice. */
  const sig = JSON.stringify(screens.map((s) => [s.decision, s.ruleName, s.steps.map(stepLabel)]))
  const [seen, setSeen] = useState(sig)
  if (seen !== sig) {
    setSeen(sig)
    setPick(0)
  }

  if (screens.length === 0 || !appId) return null
  const at = Math.min(pick, screens.length - 1)
  const chosen = screens[at]
  const appName = apps.find((a) => a.id === appId)?.name ?? appId
  const shown = open || !collapsible
  const decisions = screens.length > 1 && (
    <Seg
      label="Decision"
      value={String(at)}
      options={screens.map((s, i) => ({ value: String(i), label: DECISION_WORDS[s.decision] }))}
      onChange={(v) => setPick(Number(v))}
    />
  )
  const caption = <p className="tsee__caption">Approximation of the sign-in page</p>

  if (side !== undefined) {
    return (
      <section className="tsee is-compact is-split">
        {side &&
          createPortal(
            <div className="tsee__side">
              <h3 className="tsee__title">
                {title}
                <TipDot text="An approximation of the sign-in page" label="About what they see" />
              </h3>
              {decisions}
              <div ref={setSteps} className="tsee__steps" />
            </div>,
            side,
          )}
        <motion.div
          className="tsee__body"
          aria-hidden={hidden || undefined}
          initial={false}
          animate={{ opacity: hidden ? 0 : 1 }}
          transition={{ duration: hidden || reduced ? 0 : 0.16, delay: hidden || reduced ? 0 : 0.08 }}
        >
          <motion.div
            key={`${sig}:${at}`}
            className="tsee__page"
            initial={reduced || !fade || hidden ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced || !fade ? 0 : 0.16 }}
          >
            <SignInPlayer screens={chosen} appId={appId} appName={appName} hold={hidden} compact barIn={steps} />
          </motion.div>
        </motion.div>
      </section>
    )
  }

  return (
    <section className={`tsee${shown ? '' : ' is-closed'}${compact ? ' is-compact' : ''}`}>
      {collapsible ? (
        <button type="button" className="tsee__head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
          <ChevronDown size={14} strokeWidth={2} aria-hidden className="tsee__chev" />
          {title}
        </button>
      ) : (
        <h3 className="tsee__title">{title}</h3>
      )}
      {shown && (
        <motion.div
          id={bodyId}
          className="tsee__body"
          aria-hidden={hidden || undefined}
          initial={false}
          animate={{ opacity: hidden ? 0 : 1 }}
          transition={{ duration: hidden || reduced ? 0 : 0.16, delay: hidden || reduced ? 0 : 0.08 }}
        >
          {decisions}
          {/* A new answer, or another decision, cross-fades in and plays its
              own — unless the whole body is still held back for a landing,
              which brings it up itself. */}
          <motion.div
            key={`${sig}:${at}`}
            className="tsee__page"
            initial={reduced || !fade || hidden ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced || !fade ? 0 : 0.16 }}
          >
            <SignInPlayer screens={chosen} appId={appId} appName={appName} hold={hidden} compact={compact} />
          </motion.div>
          {caption}
        </motion.div>
      )}
    </section>
  )
}
