import { motion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import type { GateView } from './try-sign-in'
import './try-sign-in.css'

/* -----------------------------------------------------------------------------
   The one gate left on the chain: Which policy, when another policy decides
   the sign-in (Policy testing V4, §2.3). The Who gate, a card's evidence rows
   and the Decision card went with V4 — the start node carries who, a card
   carries check pills and the outcome node the answer (TracePills.tsx).

   A gate is a stage like a card, and the same width as one: a label, what the
   sign-in showed, and one word for how it stands — or, on the board today,
   "Decided by {policy}" and why this one did not (`content`). The stage the
   marker is on takes the blue edge.

   Motion is opacity only, and only where the route says so (`fade`): a stage
   that the marker has just reached, or whose text an update changed. Every
   piece is keyed by what it says, so an update that leaves a stage's text
   alone leaves the stage alone. No element here takes a transform — the cards
   and the marker are motion's.
   -------------------------------------------------------------------------- */

/* Held at nothing while the marker has not reached it — in its place, so the
   chain does not shift under a marker that is travelling down it — and faded
   up when the marker arrives, or when an update changes what it says (the
   key is the text, so only a stage whose text changed is a new element). */
const reveal = (hidden: boolean, fade: boolean, seconds: number) => ({
  initial: fade && !hidden ? { opacity: 0 } : false,
  animate: { opacity: hidden ? 0 : 1 },
  transition: { duration: fade && !hidden ? seconds : 0 },
})

/* A gate. With `children`, the gate row opens a list under it — Which
   policy's every policy on the application. With `content`, the row says that
   instead of its label, value and word. */
export function RouteGate({
  label,
  view,
  marked,
  marker,
  hidden,
  fade,
  disclosure,
  content,
  children,
}: {
  label: string
  view: GateView
  /** The row's own words in place of label · value · word. */
  content?: ReactNode
  /** The marker stands here: the blue edge. */
  marked: boolean
  marker?: ReactNode
  /** The marker has not reached it yet, on a run that travels. */
  hidden: boolean
  fade: boolean
  /* The accessible name of the row that opens `children` — or, with
     `content`, what is said after the row's own words: the content is who
     decided and why, and a name in its place hid both from a screen reader. */
  disclosure?: { label: string; hint?: string; open: boolean; onToggle: () => void }
  children?: ReactNode
}) {
  const bodyId = useId()
  const said = `${label}: ${view.value}, ${view.word}`
  const row = content ? (
    <motion.span key={`c:${view.value}|${view.word}`} className="bb__gate__content" aria-hidden={hidden || undefined} {...reveal(hidden, fade, 0.12)}>
      {content}
    </motion.span>
  ) : (
    <>
      <span className="bb__gate__label">{label}</span>
      <motion.span key={`v:${view.value}`} className="bb__gate__value" title={view.value} aria-hidden={hidden || undefined} {...reveal(hidden, fade, 0.12)}>
        {view.value}
      </motion.span>
      <motion.span key={`w:${view.word}`} className={`bb__gate__word is-${view.state}`} aria-hidden={hidden || undefined} {...reveal(hidden, fade, 0.12)}>
        {view.word}
      </motion.span>
    </>
  )
  return (
    <div className={`bb__gate${marked ? ' is-marked' : ''}`} role="group" aria-label={hidden ? label : said}>
      {marker}
      <div className="bb__gate__in">
        {disclosure ? (
          <button
            type="button"
            className={`bb__gate__row is-button${content ? ' has-content' : ''}`}
            aria-expanded={disclosure.open}
            aria-controls={bodyId}
            aria-label={content ? undefined : disclosure.label}
            onClick={(e) => {
              e.stopPropagation()
              disclosure.onToggle()
            }}
          >
            {row}
            {content && <span className="u-sr-only">. {disclosure.hint ?? disclosure.label}</span>}
            <ChevronDown size={14} strokeWidth={2} aria-hidden className="bb__gate__chev" />
          </button>
        ) : (
          <div className={`bb__gate__row${content ? ' has-content' : ''}`}>{row}</div>
        )}
      </div>
      {disclosure?.open && (
        <motion.div id={bodyId} className="bb__gate__body" aria-hidden={hidden || undefined} {...reveal(hidden, fade, 0.12)}>
          {children}
        </motion.div>
      )}
    </div>
  )
}

/* Which policy, as a gate that opens on its list. Open by default only when
   this policy is not the one deciding — then the list is the answer — and
   reopened that way whenever that changes; the admin's own open or close holds
   until it does. `onToggle` is told of the admin's own turn, which moves
   everything under the gate by the list's height: the board shows its
   Decision gate again for it (`revealKey`). */
export function WhichGate({
  view,
  appName,
  marked,
  marker,
  hidden,
  fade,
  onToggle,
  content,
  children,
}: {
  view: GateView & { decides: boolean }
  content?: ReactNode
  appName: string
  marked: boolean
  marker?: ReactNode
  hidden: boolean
  fade: boolean
  /* Required, so the board cannot leave it out: its reveal on a turn hangs
     on it, and nothing but the type checker would notice it gone. */
  onToggle: () => void
  children: ReactNode
}) {
  const [chosen, setChosen] = useState<{ decides: boolean; open: boolean } | null>(null)
  const open = chosen && chosen.decides === view.decides ? chosen.open : !view.decides
  return (
    <RouteGate
      label="Which policy"
      view={view}
      marked={marked}
      marker={marker}
      hidden={hidden}
      fade={fade}
      content={content}
      disclosure={{
        label: `Which policy: every policy on ${appName}`,
        hint: `Every policy on ${appName}`,
        open,
        onToggle: () => {
          setChosen({ decides: view.decides, open: !open })
          onToggle()
        },
      }}
    >
      {children}
    </RouteGate>
  )
}
