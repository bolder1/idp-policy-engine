import { motion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'

import { CANT_TELL, DECISION_WORDS } from '../../decision-words'
import { DecisionBadge } from '../../decision-badge'
import { TipDot } from '../../kit'
import { WatchingBadge } from '../watching-line'
import { CONDITION_WORDS, lineText, type CardEvidence } from '../testing/evidence'
import type { DecisionView, GateView } from './try-sign-in'
import './try-sign-in.css'

/* -----------------------------------------------------------------------------
   The route's own pieces on the chain: the gates a sign-in passes before any
   rule — Which policy, Who — the evidence a card carries in test mode, and the
   Decision it lands on.

   A gate is a stage like a card, and the same width as one: a label, what the
   sign-in showed, and one word for how it stands. The stage the marker is on
   takes the blue edge; nothing else here is coloured but the status words and
   the decision, which carry their own meaning.

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

/* A gate: Which policy, or Who. With `children`, the gate row opens a list
   under it — Which policy's every policy on the application. */
export function RouteGate({
  label,
  view,
  marked,
  marker,
  hidden,
  fade,
  disclosure,
  children,
}: {
  label: string
  view: GateView
  /** The marker stands here: the blue edge. */
  marked: boolean
  marker?: ReactNode
  /** The marker has not reached it yet, on a run that travels. */
  hidden: boolean
  fade: boolean
  /** The accessible name of the row that opens `children`. */
  disclosure?: { label: string; open: boolean; onToggle: () => void }
  children?: ReactNode
}) {
  const bodyId = useId()
  const said = `${label}: ${view.value}, ${view.word}`
  const row = (
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
            className="bb__gate__row is-button"
            aria-expanded={disclosure.open}
            aria-controls={bodyId}
            aria-label={disclosure.label}
            onClick={(e) => {
              e.stopPropagation()
              disclosure.onToggle()
            }}
          >
            {row}
            <ChevronDown size={14} strokeWidth={2} aria-hidden className="bb__gate__chev" />
          </button>
        ) : (
          <div className="bb__gate__row">{row}</div>
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
  children,
}: {
  view: GateView & { decides: boolean }
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
      disclosure={{
        label: `Which policy: every policy on ${appName}`,
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

/* A card's evidence in test mode, under its head: the rule's word, then one
   line per condition — label, "actual · required", and Passes, Fails or Can't
   tell. The words are evidence.ts's, so the board and Policy testing say the
   same thing about the same rule. */
export function RouteEvidence({ evidence, hidden, fade }: { evidence: CardEvidence; hidden: boolean; fade: boolean }) {
  return (
    <motion.div key={JSON.stringify(evidence)} className="bb__evidence" aria-hidden={hidden || undefined} {...reveal(hidden, fade, 0.16)}>
      <p className={`bb__evword is-${evidence.state}`}>{evidence.word}</p>
      {evidence.lines.length > 0 && (
        <ul className="bb__evlines">
          {evidence.lines.map((l) => (
            <li key={l.key} className="bb__evline">
              <span className="bb__evlabel">{l.label}</span>
              <span className="bb__evtext">
                {lineText(l)}
                {l.tip && (
                  /* The card is one click target; the tip is not a click on it. */
                  <span className="bb__evtip" onClick={(e) => e.stopPropagation()}>
                    <TipDot text={l.tip} label={`About ${l.label.toLowerCase()}`} />
                  </span>
                )}
              </span>
              <span className={`bb__evstatus is-${l.status}`}>{CONDITION_WORDS[l.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}

/* Where the sign-in lands. The decision in its badge, then the policy and rule
   that gave it, then — after an update that moved it — what moved it. A
   monitor that would decide it differently says so under it, never in the
   decision's own tone. Where the facts reach more than one decision, it
   "Depends": each outcome with the rule that gives it, and what would settle
   it. */
export function RouteDecision({
  view,
  changed,
  hidden,
  fade,
}: {
  view: DecisionView
  /** "IP address", "your edits": what moved the answer last, or null. */
  changed: string | null
  hidden: boolean
  fade: boolean
}) {
  const answer = view.status === 'decided' && view.decision ? DECISION_WORDS[view.decision] : view.status === 'depends' ? 'Depends' : CANT_TELL
  return (
    <div className="bb__gate is-decision" role="group" aria-label={hidden ? 'Decision' : `Decision: ${answer}, ${view.line}`}>
      <div className="bb__gate__row">
        <span className="bb__gate__label">Decision</span>
        <motion.div
          key={JSON.stringify(view, (k, v) => (k === 'trace' ? undefined : v))}
          className="bb__gate__decision"
          aria-hidden={hidden || undefined}
          {...reveal(hidden, fade, 0.16)}
        >
          {view.status === 'decided' && view.decision ? (
            <>
              <DecisionBadge decision={view.decision} />
              <span className="bb__gate__line">{view.line}</span>
            </>
          ) : view.status === 'depends' ? (
            <>
              <span className="bb__gate__unknown">Depends</span>
              {view.line && <span className="bb__gate__line">{view.line}</span>}
              <ul className="bb__gate__outcomes">
                {view.outcomes.map((o) => (
                  <li key={`${o.label}:${o.decision}`}>
                    <span>{o.label}</span>
                    <ArrowRight size={12} strokeWidth={2} aria-hidden />
                    <DecisionBadge decision={o.decision} />
                  </li>
                ))}
              </ul>
              {view.needs.length > 0 && <span className="bb__gate__needs">Needs: {view.needs.join(', ')}</span>}
            </>
          ) : (
            <>
              <span className="bb__gate__unknown">{CANT_TELL}</span>
              <span className="bb__gate__line">{view.line}</span>
            </>
          )}
          {changed && <span className="bb__gate__changed">Changed by {changed}</span>}
          {view.watching.map((w) => (
            <span key={w.policyId} className="bb__gate__watch">
              <span className="bb__gate__line">{w.policyName}</span>
              <WatchingBadge watched={w} yields={false} />
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
