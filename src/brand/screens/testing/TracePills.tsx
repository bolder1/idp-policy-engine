import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AppWindow, ArrowRight, Check, Clock, Eye, Gauge, Globe, ListFilter, MapPin, MonitorSmartphone, Users, X, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../data'
import { CantTell, DecisionBadge } from '../../decision-badge'
import { CANT_TELL, DECISION_WORDS } from '../../decision-words'
import { Face } from '../../faces'
import { Badge, Tip, TipDot } from '../../kit'
import { AppLogo } from '../../logos/AppLogo'
import type { ColumnView, DecisionView } from '../board/try-sign-in'
import { WatchingBadge } from '../watching-line'
import { AnchoredPopover } from './AnchoredPopover'
import { CONDITION_WORDS, type CardState } from './evidence'
import { answerWord, cardWord, versionPair, type CheckPill, type PillCategory } from './trace-pills'

/* -----------------------------------------------------------------------------
   The trace's pieces on the board (TESTING-V4 §2.3): the check pills under a
   card's head, the rule's outcome beside its name, the grey word on a card the
   sign-in never met, the start node's "who → where", the spine's "which
   policy", and the outcome node the route lands on.

   Presentational, all of it. Board and BoardBuilder own the run — which stage
   the marker is on, what each card says (trace-pills.ts), whether the answer
   has landed — and hand it down as props, so nothing here reads the store or
   keeps time except the one thing only this file can: how long "Changed by"
   stays on screen.

   Colour is the owner's rule and nothing else: green, amber and red only on a
   decision (DecisionBadge) and on a check that failed; the accent (blue in
   the rebrand look) on what is active — the lit card, the lit spine, the
   change that just happened. "Can't tell" is grey text, never a badge.

   Motion is motion's. Every element here that motion animates — a pill, a
   pill's glyph, the outcome node, its content, the Changed by chip — takes no
   transform and no transition from trace.css; the glyph's pop is a `scale` in
   motion's props, never a stylesheet's. Reduced motion is the final state at
   once: no stagger, no pop, no scale.
   -------------------------------------------------------------------------- */

// --- Check pills --------------------------------------------------------------------

/* The same marks the attribute picker files conditions under (board/tones.ts):
   a zone is a globe, a device profile a monitor and phone, a window a clock. A
   place — the location half of a zone — is the pin the sign-in sentence's From
   token uses, so the two halves of one zone never share a mark. */
const CATEGORY_ICON: Record<PillCategory, LucideIcon> = {
  who: Users,
  network: Globe,
  place: MapPin,
  device: MonitorSmartphone,
  time: Clock,
  risk: Gauge,
  app: AppWindow,
  other: ListFilter,
}

/** What a screen reader hears before a pill's text, since the mark says it only to the eye. */
const CATEGORY_WORD: Record<PillCategory, string> = {
  who: 'Who',
  network: 'Network',
  place: 'Place',
  device: 'Device',
  time: 'When',
  risk: 'Risk',
  app: 'Application',
  other: 'Check',
}

/** The gap between one pill arriving and the next, left to right (spec: 50–60 ms). */
const STAGGER = 0.05

function Glyph({ status }: { status: CheckPill['status'] }) {
  if (status === 'pass') return <Check size={12} strokeWidth={2.6} />
  if (status === 'fail') return <X size={12} strokeWidth={2.6} />
  return <>?</>
}

/* A card's checks, one pill per evidence line, under its head.

   Held at nothing while the marker has not reached the card — in its place,
   so the chain does not shift under a marker travelling down it — and brought
   up left to right when it arrives: each pill fades in 50 ms after the one
   before, and its glyph pops from small (motion's `scale`, on the glyph
   alone). A pill whose words or standing change on an update is a new element
   (the key is what it says) and arrives the same way, unless `fade` is off —
   a slider held under the thumb, where it would flicker.

   The card is one click target and opens the rule; a pill is part of it, so
   a press on one goes where a press on the card goes. The sentence behind a
   pill is its tooltip. */
export function CheckPills({
  pills,
  show,
  reduced,
  fade = true,
}: {
  pills: readonly CheckPill[]
  /** The marker has reached this card. */
  show: boolean
  reduced: boolean
  /** A changed pill may animate in. False while a slider is held. */
  fade?: boolean
}) {
  if (pills.length === 0) return null
  const moving = show && fade && !reduced
  return (
    <ul className="bb-checks" aria-label="Checks" aria-hidden={show ? undefined : true}>
      {pills.map((p, i) => {
        const Icon = CATEGORY_ICON[p.category]
        const delay = moving ? i * STAGGER : 0
        return (
          <motion.li
            key={`${p.key}|${p.status}|${p.text}`}
            className={`bb-check is-${p.status}`}
            initial={moving ? { opacity: 0 } : false}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ duration: moving ? 0.14 : 0, delay }}
          >
            <Tip text={<span className="bb-check__tip">{p.tip}</span>}>
              <span className="bb-check__pill">
                <Icon className="bb-check__icon" size={12} strokeWidth={2} aria-hidden />
                <span className="u-sr-only">{CATEGORY_WORD[p.category]}: </span>
                <span className="bb-check__text">{p.text}</span>
                <motion.span
                  className="bb-check__mark"
                  aria-hidden
                  initial={moving ? { scale: 0.4 } : false}
                  animate={{ scale: show || reduced ? 1 : 0.4 }}
                  transition={moving ? { type: 'spring', stiffness: 560, damping: 24, delay: delay + 0.04 } : { duration: 0 }}
                >
                  <Glyph status={p.status} />
                </motion.span>
                {/* Why it failed, or what would settle it, is the point of the
                    pill for anyone who cannot hover it: the tooltip's words,
                    said after the standing. A pass says only that it passed. */}
                <span className="u-sr-only">
                  , {CONDITION_WORDS[p.status]}
                  {p.status !== 'pass' && `. ${p.tip.replace(/\n/g, '. ')}`}
                </span>
              </span>
            </Tip>
          </motion.li>
        )
      })}
    </ul>
  )
}

// --- A card's head ---------------------------------------------------------------------

/* The rule's THEN, on the right of its head: in full tone on the card that
   matched, and in the neutral pill everywhere else — the same geometry, so a
   card that lights up does not also change width. The muted pill is still the
   decision's words, so every card says what it WOULD have decided. */
export function RuleOutcome({ decision, lit }: { decision: AccessDecision; lit: boolean }) {
  if (lit) return <DecisionBadge decision={decision} className="bb-ruleout is-lit" />
  return (
    <Badge tone="neutral" className="bx-decision-badge bb-ruleout is-muted">
      {DECISION_WORDS[decision]}
    </Badge>
  )
}

/** "Not reached", "Switched off", "No match", "Can't tell": grey, small, and nothing on the card that matched. */
export function CardWord({ state }: { state: CardState }) {
  const word = cardWord(state)
  return word ? <span className={`bb-cardword is-${state}`}>{word}</span> : null
}

// --- The start node, and which policy decides ----------------------------------------------

export type AudienceStanding = 'in' | 'out' | 'everyone'

/* Whether this policy is for the person: a neutral pill with a green check,
   or the negative tint. "Everyone" is in. It stood as a gate of its own (Who),
   one card-height of chain to say one word; it is a pill on the start node
   now, beside the person it is about. */
export function AudiencePill({ standing }: { standing: AudienceStanding }) {
  if (standing === 'out') return <span className="bb-tpill bb-aud is-out">Not in this policy</span>
  return (
    <span className="bb-tpill bb-aud is-in">
      <Check className="bb-aud__mark" size={12} strokeWidth={2.6} aria-hidden />
      In this policy
    </span>
  )
}

/* The start pill's content in test mode: "[face] Arun Patel → [logo] GitHub
   Enterprise", and the audience pill once a person is chosen. Spans only — it
   is mounted inside the start node, which is itself a button. */
export function StartSignIn({
  person,
  appId,
  appName,
  audience,
}: {
  person: { name: string } | null
  appId: string | null
  appName: string | null
  /** Null until somebody is chosen: there is nobody to be in or out. */
  audience: AudienceStanding | null
}) {
  return (
    <span className="bb-startsign">
      {person ? (
        <>
          <Face kind="user" name={person.name} size="sm" decorative />
          <span className="bb-startsign__name">{person.name}</span>
        </>
      ) : (
        <span className="bb-startsign__none">Choose a person</span>
      )}
      <ArrowRight className="bb-startsign__arrow" size={12} strokeWidth={2} aria-hidden />
      <span className="u-sr-only"> signs in to </span>
      {appId && <AppLogo appId={appId} name={appName ?? undefined} size={16} />}
      {appName ? <span className="bb-startsign__name">{appName}</span> : <span className="bb-startsign__none">Choose an application</span>}
      {person && audience && <AudiencePill standing={audience} />}
    </span>
  )
}

/* Which policy decides, on the spine. This one: a tiny neutral pill, because
   it is the ordinary case and the chain under it is the proof. Another one:
   the gate's content — "Decided by Global Default Policy" and why this one
   did not, as a pill — which the host puts in the gate with the disclosure
   for the list of every policy on the application. */
export function DecidesPill({ decides, policyName, reason }: { decides: boolean; policyName?: string; reason?: string }) {
  if (decides) return <span className="bb-tpill bb-decides">This policy decides</span>
  return (
    <span className="bb-decidedby">
      <span className="bb-decidedby__text">
        Decided by <strong>{policyName || 'another policy'}</strong>
      </span>
      {reason && (
        <>
          <span className="u-sr-only">, </span>
          <span className="bb-tpill bb-decidedby__reason">{reason}</span>
        </>
      )}
    </span>
  )
}

// --- The outcome node ------------------------------------------------------------------

/** How long "Changed by …" stays before it fades (spec: about 2.5 s). */
const CHANGED_MS = 2500

/* One version's answer, for the "Live → Your edits" line: its name (what it
   is, on hover) and its decision — or Depends / Can't tell in grey. */
function VersionAnswer({ col }: { col: ColumnView }) {
  return (
    <span className="bb-outcome__version">
      <Tip text={col.tip}>
        <span className="bb-outcome__vlabel">{col.label}</span>
      </Tip>
      {col.status === 'decided' && col.decision ? (
        <DecisionBadge decision={col.decision} />
      ) : (
        <span className="bb-outcome__vword">{col.status === 'depends' ? 'Depends' : CANT_TELL}</span>
      )}
    </span>
  )
}

/* Where the sign-in lands, centred under the last row with the lit spine
   running into it. It replaces the Decision gate (RouteDecision).

     decided      the decision, big, then the policy and rule that gave it
     depends      "Depends", then one mini row per outcome — "If rule 1
                  matches → [badge]", "If not → [badge]" — and what would
                  settle it
     incomplete   Can't tell, in grey, and what is missing

   Under it, only when they differ: the version deciding today beside the one
   on the board ("Live [badge] → Your edits [badge]"). After an update that
   moved the answer, what moved it — "Changed by IP address" — for a couple of
   seconds. A monitor that would decide it differently says so under it, in
   its own info badge, never in the decision's tone. Then What they see, and
   the note that this is a model.

   Held at nothing in its place until the marker lands (`hidden`), then scaled
   in by motion — opacity and scale on this element, nothing from a
   stylesheet. An update that changes what it says cross-fades the content,
   which is keyed by it. The accessible name is "Decision: {answer}, {line}",
   the shape the board's other tests read.

   What they see: pass `whatTheySee` and the node hangs it off its own button
   in an AnchoredPopover; pass `onWhatTheySee` instead (or as well) to be told
   the button was pressed, with the button to anchor a popover of your own. */
export function OutcomeNode({
  view,
  columns,
  changed,
  hidden,
  fade,
  reduced,
  onWhatTheySee,
  whatTheySee,
}: {
  view: DecisionView
  /** Every version in play, left to right; only the first and last are compared. */
  columns: readonly ColumnView[]
  /** "IP address", "your edits": what moved the answer last, or null. */
  changed: string | null
  /** The marker has not landed yet. */
  hidden: boolean
  /** A new answer may cross-fade. False while a slider is held. */
  fade: boolean
  reduced: boolean
  onWhatTheySee?: (anchor: HTMLElement) => void
  /** The pages the person would see (WhatTheySee), for the node's own popover. */
  whatTheySee?: ReactNode
}) {
  const answer = answerWord(view)
  const pair = versionPair(columns)
  const sig = JSON.stringify(view, (k, v) => (k === 'trace' ? undefined : v))
  const moving = fade && !hidden && !reduced

  /* "Changed by …", once per change. The key is the cause AND the answer it
     led to, so a second address that moves the answer again shows it again,
     and a re-render that moves nothing does not. Set while rendering, as
     WhatTheySee resets its pick, so the chip and the answer arrive in one
     frame. */
  const chipSig = changed ? `${changed}|${answer}|${view.line}` : null
  const [chip, setChip] = useState<{ sig: string; text: string } | null>(chipSig && changed ? { sig: chipSig, text: changed } : null)
  const [seenChip, setSeenChip] = useState(chipSig)
  if (seenChip !== chipSig) {
    setSeenChip(chipSig)
    setChip(chipSig && changed ? { sig: chipSig, text: changed } : null)
  }
  useEffect(() => {
    if (!chip) return
    const t = window.setTimeout(() => setChip(null), CHANGED_MS)
    return () => window.clearTimeout(t)
  }, [chip])

  const seeRef = useRef<HTMLButtonElement | null>(null)
  const [seeOpen, setSeeOpen] = useState(false)
  const canSee = whatTheySee !== undefined || onWhatTheySee !== undefined

  return (
    <motion.div
      className="bb-outcome"
      role="group"
      aria-label={hidden ? 'Decision' : `Decision: ${answer}, ${view.line}`}
      initial={false}
      animate={{ opacity: hidden ? 0 : 1, scale: hidden && !reduced ? 0.94 : 1 }}
      transition={{ duration: moving ? 0.18 : 0, ease: [0.2, 0, 0, 1] }}
    >
      <motion.div
        key={sig}
        className="bb-outcome__in"
        aria-hidden={hidden || undefined}
        initial={moving ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: moving ? 0.16 : 0 }}
      >
        {view.status === 'decided' && view.decision ? (
          <DecisionBadge decision={view.decision} className="bb-outcome__badge" />
        ) : view.status === 'depends' ? (
          <>
            <span className="bb-outcome__word">Depends</span>
            <ul className="bb-outcome__rows">
              {view.outcomes.map((o) => (
                <li key={`${o.label}:${o.decision}`}>
                  <span className="bb-outcome__if">{o.label}</span>
                  <ArrowRight className="bb-outcome__arrow" size={12} strokeWidth={2} aria-hidden />
                  <DecisionBadge decision={o.decision} />
                </li>
              ))}
            </ul>
            {view.needs.length > 0 && <span className="bb-outcome__needs">Needs: {view.needs.join(', ')}</span>}
          </>
        ) : (
          <CantTell className="bb-outcome__word" />
        )}
        {view.line && <p className="bb-outcome__line">{view.line}</p>}
        {pair && (
          <p className="bb-outcome__versions">
            <VersionAnswer col={pair[0]} />
            <ArrowRight className="bb-outcome__arrow" size={12} strokeWidth={2} aria-hidden />
            <VersionAnswer col={pair[1]} />
          </p>
        )}
        {view.watching.map((w) => (
          <span key={w.policyId} className="bb-outcome__watch">
            <span>{w.policyName}</span>
            <WatchingBadge watched={w} yields={false} />
          </span>
        ))}
      </motion.div>

      {!hidden && (
        <>
          <AnimatePresence initial={false}>
            {chip && (
              <motion.span
                key={chip.sig}
                className="bb-tpill bb-outcome__changed"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.24 }}
              >
                Changed by {chip.text}
              </motion.span>
            )}
          </AnimatePresence>
          <div className="bb-outcome__foot">
            {canSee && (
              <button
                ref={seeRef}
                type="button"
                className="bx-btn bx-btn--ghost bx-btn--sm bb-outcome__see"
                aria-haspopup="dialog"
                aria-expanded={whatTheySee !== undefined ? seeOpen : undefined}
                onClick={(e) => {
                  /* The stage behind is a click target of its own. */
                  e.stopPropagation()
                  if (whatTheySee !== undefined) setSeeOpen((v) => !v)
                  onWhatTheySee?.(e.currentTarget)
                }}
              >
                <Eye size={13} strokeWidth={2} aria-hidden />
                What they see
              </button>
            )}
            <span className="bb-outcome__note" onClick={(e) => e.stopPropagation()}>
              Modelled result
              <TipDot text="This tenant’s policies, zones and devices; addresses from a sample table" label="About the modelled result" />
            </span>
          </div>
        </>
      )}

      {whatTheySee !== undefined && (
        <AnchoredPopover anchor={seeRef} open={seeOpen && !hidden} onClose={() => setSeeOpen(false)} label="What they see" width={360} align="center">
          {whatTheySee}
        </AnchoredPopover>
      )}
    </motion.div>
  )
}
