import { AnimatePresence, animate as tween, motion, useMotionValue } from 'motion/react'
import { createContext, memo, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { ArrowRight, ArrowUpRight, Ban, Check, ChevronRight, CircleHelp, Info, KeyRound, RotateCcw, ShieldCheck, Split, TriangleAlert, type LucideIcon } from 'lucide-react'

import { memberGroupIds, type AccessDecision, type Policy } from '../../data'
import { DecisionBadge } from '../../decision-badge'
import { DECISION_TONE, DECISION_WORDS } from '../../decision-words'
import { Button, TipDot } from '../../kit'
import { useBrand, useNameLookup } from '../../store'
import { ATTEMPTS_LINK, REVIEW_ATTEMPTS, attemptsGetThroughSaid, attemptsOnSaid, type AppBreakInSummary } from '../break-in-app'
import { GROUP_WORDS } from '../break-in-model'
import type { ColumnView } from '../board/try-sign-in'
import { WatchingBadge } from '../watching-line'
import { rowsRead } from '../testing/rows-read'
import type { SignInScreens } from '../testing/screens-of'
import type { FormField, SignInForm } from '../testing/sign-in-form'
import { answerWords, sentenceTokens, tokenValue } from '../testing/sign-in-sentence'
import { TestingSessionContext } from '../testing/session-state'
import { WhatTheySee } from '../testing/WhatTheySee'
import { ATTEMPTS_PANEL_ID, type AttemptsFrom } from './attempts'
import { activeNode, askOf, policyFound, policyOpen, policyPhase, type EngineOutcome, type EnginePolicy, type EngineRule, type EngineRun, type NodeId } from './engine-run'
import {
  AUTO_FOLD,
  boxesSig,
  eachGroupRows,
  engineWires,
  expectMark,
  factMarks,
  findingsCount,
  foldOpen,
  followTo,
  followTop,
  heroFinding,
  outcomePad,
  pathTone,
  tokenMark,
  whyItems,
  whyTitle as whyTitleOf,
  type Box,
  type Boxes,
  type FoldAsk,
  type FoldMode,
  type Orientation,
  type SentenceView,
  type WhyTone,
} from './journey'
import { PolicyCard, RuleRow, Spinner, WhichCard } from './PolicyStack'
import { ChainLink, FoldButton, Seg } from './RunChain'
import { DeciderStop, PoliciesStop, SignInStop } from './RunNodes'
import { stepMs } from './use-engine-run'
import { WhyCard } from './WhyCard'

/* -----------------------------------------------------------------------------
   The engine run, drawn (TESTING-V4 §8.3–8.6, §11.1, §12.3–12.4): ONE
   renderer for the Sign-in tests page and, later, Try a sign-in inside a
   policy. The caller keeps the form (the page's sentence bar), the session's
   wiring and the start node, and hands this the plan, the step and what to
   put at each end.

              [engine line: spinner · "Finding the policy for HRMS" · Skip]

                               [Sign-in]
                                   │
       ┌ Policies on HRMS ───────────────────────────────────────┐
       │ 1  HRMS access from corporate offices     Switched off › │
       │ ┌ 2  Global Default Policy                   Decides ⌄ ┐ │
       │ │      1  Baseline access               [Allow on 1 factor] │
       │ └      ↳  Nothing else matched               Not reached ┘ │
       └──────────────────────────────────────────────────────────┘
                                   │
                    [✓ Allow on 1 factor — the answer]

   The loading IS the explanation (§12.4). The card of policies arrives with
   its rows as skeletons; each row takes a soft accent tint as the engine asks
   it, a solid accent line filling under it for as long as the asking takes,
   its name coming up and its reason landing as the engine moves on; the one
   that decides has a solid accent ring drawn once around it, settles to the
   accent ring and "Decides", and only then opens: its rules appear
   inside it, each read one row at a time, spinner then mark, the first
   failing row ending the rule — which folds to one line naming that check as
   the engine leaves it. The rule that matched stays open; the answer lands
   last, under the card, the spine drawn down into it: the decision large in
   its tone, what the person is asked for, who decided, and What they see.
   One line at the top says what the engine is doing in plain words — solid
   words beside a spinner while it works — a hairline under it filling as it
   goes, and settles into a quiet summary with Replay
   (`EngineLine`). The plan is engine-run.ts's and the clock
   use-engine-run.ts's — this file only draws a step of it, and every step it
   shows is the resolver's answer.

   Space. Three lanes — the sign-in, the policies, the answer — centred in
   the canvas when they fit, the policies taking the room they need; or, in
   the vertical orientation, one centred column of them, the start on top
   and the answer under the policies (journey.ts draws both). The canvas
   scrolls itself, both ways, when the run is larger — and follows the
   engine's step so what it works on stays in view. A change of orientation
   is only a change of layout: the lanes glide to their new places (motion's
   layout, 240 ms; at once under reduced motion, and while the window itself
   is resizing), the wires wait unseen until they land and are measured
   again, and the run is never played again.

   Motion, as one sequence — never two things asking to be looked at at once:
     the fan of wires draws out to the policies' skeletons as the stack fades in
     the scan's ring steps down the stack (CSS on the ring, so it eases from
       one card to the next); the one that decides takes the accent, and the
       lit wire draws to it
     it opens like a drawer (320 ms), its rules fading in a beat behind the
       edge; each rule's ring, then its rows — each arriving with a spinner,
       its mark landing a beat later with the least overshoot, the engine
       line saying what was found as the mark lands
     a rule that missed folds to its failing row: the rows before it close
       up, the failing row keeps its icon, word and ✕, its words cross-fade to
       one line, its height eases — nothing below jumps
     the rule that matched takes the ring; a wire draws out of it to the
       answer's place, and the answer lands at its end (a spring, the least
       overshoot); the engine line settles to its summary
   The engine line hugs its words: a new sentence cross-fades over the last,
   and the pill's width eases to it, so it never jumps. Motion owns every
   element it moves, and journey.css gives none of them a transform or a
   transition. Reduced motion is the settled canvas at once: no shimmer, no
   drawing, and the canvas jumps rather than glides; Skip is the same jump.

   Cost. The canvas renders once a step; the start, the answer, a policy that
   did not decide and every rule not being read are memoised on what they
   show, so a step draws the one rule it works on and the line — a render
   that took a frame's budget would stall every height and wire mid-ease. A
   caller passes the start and the answer as elements that only change when
   what they show does.
   -------------------------------------------------------------------------- */

/// --- The outcome ---------------------------------------------------------------------------

/* What the journey tells the answer it holds (§12.4), beside what the caller
   hands it: the plan's own outcome (who decided, by which rule), whether it
   has landed, whether it may move, Open policy, its fold, and the conflict
   line. A context rather than props, so the page's `<Answer …/>` stays as it
   was and the answer still draws once, as it lands, not once a step. */
interface HeroContext {
  outcome: EngineOutcome | null
  /** It has landed: its lines come up, 60 ms apart, and its ring pulses once. */
  landed: boolean
  /** A run is playing and motion is allowed. */
  animate: boolean
  onOpenPolicy: (() => void) | null
  /** Its body shown; folded, the decision and the ask in one line. */
  open: boolean
  /** The builder's fold control on it; null while the engine works (and where nothing folds). */
  onFold: (() => void) | null
  /* The findings' ONE line (journey.ts `heroFinding`, the model's headline):
     "Maya Iyer is in Engineering and Finance — Engineering's rule applies
     first", in the top finding's tone; null when there is nothing to say. */
  finding: { text: string; tone: WhyTone } | null
  /** Why? pressed: the why under the answer opens, or closes; null while the engine works. */
  onWhy: (() => void) | null
  /** The why is open. */
  whyOpen: boolean
  /** The why's id, for Why?'s aria-controls. */
  whyId: string
  /* Break-in attempts on the application (break-in-app.ts), once the run is
     done: what the strip, or the quiet link, says them by. Null while the
     engine works, and where there are none (the builder's Check access). */
  attempts: { appName: string; holes: boolean } | null
  /** Review attempts, or Break-in attempts, pressed: the attempts panel opens, or shuts; null where nothing is pressed. */
  onAttempts: (() => void) | null
  /** The attempts panel is open. */
  attemptsOpen: boolean
  /** They come in as the run settles — a run played here, motion allowed, not yet come in for it — rather than simply being there. */
  attemptsArrive: boolean
  /** They have come in for this run: an unfold after it finds them simply there. */
  onAttemptsIn: (() => void) | null
}
const Hero = createContext<HeroContext>({
  outcome: null,
  landed: true,
  animate: false,
  onOpenPolicy: null,
  open: true,
  onFold: null,
  finding: null,
  onWhy: null,
  whyOpen: false,
  whyId: '',
  attempts: null,
  onAttempts: null,
  attemptsOpen: false,
  attemptsArrive: false,
  onAttemptsIn: null,
})

const DECISION_ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }
/** The findings' line's mark: a conflict, what can't be told, or only worth knowing. */
const FINDING_MARK: Record<WhyTone, LucideIcon> = { conflict: TriangleAlert, depends: CircleHelp, info: Info }

/* The attempts' strip, or their quiet link, coming in ONCE a run (review,
   1 Oct 2026: they live in the answer's body, which a fold takes away, and
   every unfold faded them in and pulsed the strip again — the finding's
   strip pulses only as the answer lands). Whether to arrive is read as it
   mounts and kept for its life, so the arrival it began plays out; and the
   journey is told it has come in, so the next mount — an unfold — finds it
   simply there. A new run arrives again. */
function ArrivesOnce({ arrive, onIn, children }: { arrive: boolean; onIn: (() => void) | null; children: (arrive: boolean) => ReactNode }) {
  const [first] = useState(arrive)
  useEffect(() => {
    if (first) onIn?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it mounts
  }, [])
  return <>{children(first)}</>
}

/** Its lines, one after another as it lands. */
const LINE_GAP_S = 0.06

/* The answer, the hero of the flow (§12.4), memoised on what it shows: drawn
   once as the run reaches it, not once a step. Rebuilt 1 Oct 2026 (owner:
   "the outcome card is awful"): fewer things, each said once.

     ┌──────────────────────────────────────┬─────────────────────────┐
     │ [✓] Allow on 1 factor ⓘ            ⇕ │ ┌─────────────────────┐ │
     │     Decided by AWS for engineering   │ │ the sign-in,        │ │
     │       teams · Rule 2 ↗               │ │ playing             │ │
     │     ┌ ⚠ AWS billing for Finance also │ │                     │ │
     │     │  covers Maya … Review conflict ›│ │                     │ │
     │     What they see ⓘ                  │ │                     │ │
     │     1 Password                       │ │                     │ │
     │     2 Signed in                    ⟲ │ └─────────────────────┘ │
     └──────────────────────────────────────┴─────────────────────────┘

   The decision large, in its tone (DECISION_TONE: green on 1 factor, amber
   with 2FA, red on Deny; yellow while it can't be told), the caveat's dot
   beside it. Then who decided, ONE line that is also the way to that policy
   (Open policy was a button of its own under it). Then, when there is one,
   the finding — a rule or a policy that also applies, an exception, one
   switched off — as ONE strip in its tone, the whole of it a press that
   opens the why in the right-hand panel ("Review conflict"); a conflict's
   strip pulses as it lands, so it is found (owner, 1 Oct: "very hard to
   find out"). Then What they see: its label, and the sign-in's steps as a
   numbered list that fills as it plays — what the person is asked for, said
   once (it was a line of its own, "Asked for their password", over the same
   steps as chips) — beside the stage, the sign-in playing, the whole of the
   right column. On a narrow canvas the stage drops under the words. Folded,
   the decision and the ask in one line.

   It lands with a spring (the journey's, on its wrapper) and ONE solid ring
   pulse in its tone, its lines fading in 60 ms apart. Depends lists what each
   way would give; no policy deciding says why. Under reduced motion, and on
   Skip, it is simply there.

   Inside a policy, where its draft decides otherwise than the policy does
   today, the two versions side by side, once: "Live [Allow on 1 factor] →
   Your edits [Allow with 2FA]" (`columns`, the first and the last).

   A saved sign-in — or a break-in attempt, played from its panel — that
   expects another answer says so once, beside the word, in the notice
   tone: "⚠ Expected [Allow with 2FA]"; an attempt given the answer it
   expects on a second factor its attack beats, "⚠ Weaker factor", the
   factor in its title (journey.ts `expectMark`). Only the quiet
   to say (a draft that would change nothing): no strip, a quiet Why? at the
   end of who decided.

   Break-in attempts on the application (owner, 1 Oct 2026: "as a suggestion
   inside conflicts or somewhere else"), once the run is done, never while it
   plays: with no finding to say and attempts getting through, the strip says
   so — "Break-in attempts get through on AWS Console · Review attempts ›",
   the conflict's tone and its pulse — and opens them in the panel; no
   number, the panel says those. A finding still comes first, and the
   attempts are then the why's last section. With nothing to say at all, a
   quiet "Break-in attempts ›" where Why? would sit: the why would only say
   them again. They come in with a short fade as the run settles, once
   (`ArrivesOnce`) — an unfold after it finds them there; on a revisit, Skip
   and under reduced motion they are simply there. */
export const Answer = memo(function Answer({
  view,
  columns = [],
  changed,
  reduced,
  screens,
  appId,
  expected = null,
  weaker = null,
}: {
  view: EngineRun['outcome']['view']
  /** The versions in play: the page has one; inside a policy, today's and the draft's. */
  columns?: readonly ColumnView[]
  changed: string | null
  reduced: boolean
  screens: readonly SignInScreens[]
  appId: string | null
  /** The saved sign-in on screen expects this; said beside the word only when it is not the answer. */
  expected?: AccessDecision | null
  /** A break-in attempt played on a factor its attack beats: what was offered and what it needs (journey.ts `expectMark`). */
  weaker?: string | null
}) {
  const { outcome, landed, animate: moving, onOpenPolicy, open, onFold, finding, onWhy, whyOpen, whyId, attempts, onAttempts, attemptsOpen, attemptsArrive, onAttemptsIn } = useContext(Hero)
  const bodyId = useId()
  /* The slot under the words where What they see puts its label and its steps. */
  const [side, setSide] = useState<HTMLDivElement | null>(null)
  const animate = moving && !reduced
  const decided = view.status === 'decided' && view.decision !== null ? view.decision : null
  /* The decision's tone; yellow while it can't be told (the decided path's colour, journey.ts `pathTone`). */
  const tone = decided ? DECISION_TONE[decided] : view.status === 'depends' ? 'notice' : 'neutral'
  const Icon = decided ? DECISION_ICON[decided] : Split
  const word = decided ? DECISION_WORDS[decided] : view.status === 'depends' ? 'Depends' : view.line || 'No policy decides'
  const ask = askOf(screens, decided)
  const see = screens.length > 0 && appId !== null
  /* The saved sign-in's expectation, when this is not it: it fails — and a
     break-in attempt given it on a factor its attack beats fails as well. */
  const mark = expectMark(decided, expected, weaker)
  /* Inside a policy: today's version and the draft, when they answer differently. */
  const was = columns.length > 1 ? columns[0] : null
  const now = columns.length > 1 ? columns[columns.length - 1] : null
  const versus = was && now && answerWords(was) !== answerWords(now) ? { was, now } : null
  /* Who decided: the policy, and where in it — "Rule 2", "Nothing else matched". */
  const by = outcome?.policyName ? `${outcome.policyName}${outcome.ruleLine ? ` · ${outcome.ruleLine.split(' · ')[0]}` : ''}` : ''

  /* The ring pulses once, as it lands — and not again for this answer. */
  const pulsing = landed && animate
  const [pulse, setPulse] = useState(pulsing)
  const [armed, setArmed] = useState(pulsing)
  if (armed !== pulsing) {
    setArmed(pulsing)
    if (pulsing) setPulse(true)
  }

  const line = {
    out: { opacity: 0, y: animate ? 6 : 0 },
    in: { opacity: 1, y: 0, transition: { duration: animate ? 0.24 : 0, ease: EASE_OUT } },
  }
  const lines = { out: {}, in: { transition: animate ? { staggerChildren: LINE_GAP_S, delayChildren: 0.08 } : {} } }

  /* What they see beside the words (open): the stage the whole of the right
     column, its label and steps under the words (`side`). */
  const beside = open && see
  const fold = onFold && <FoldButton open={open} onFold={onFold} what="the outcome" titles={['Fold the outcome', 'Show the outcome']} controls={bodyId} />
  const FindingMark = finding ? FINDING_MARK[finding.tone] : null
  const strip = finding && FindingMark && (
    <>
      <FindingMark className="tj-hero__smark" size={14} strokeWidth={2.2} aria-hidden />
      <span className="tj-hero__stext">{finding.text}</span>
      {onWhy && (
        <span className="tj-hero__sgo">
          {finding.tone === 'conflict' ? 'Review conflict' : 'Why'}
          <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
        </span>
      )}
    </>
  )
  /* The attempts: the strip when they get through and no finding is said;
     else — no why to open — the quiet link where Why? sits. */
  const attemptsStrip = !finding && attempts?.holes ? attempts : null
  const attemptsLink = !finding && !onWhy && attempts && !attempts.holes ? attempts : null
  const attemptsAria = { 'aria-expanded': attemptsOpen, 'aria-controls': attemptsOpen ? ATTEMPTS_PANEL_ID : undefined }
  const attemptsSaid = attemptsStrip && (
    <>
      <TriangleAlert className="tj-hero__smark" size={14} strokeWidth={2.2} aria-hidden />
      <span className="tj-hero__stext">{attemptsGetThroughSaid(attemptsStrip.appName)}</span>
      {onAttempts && (
        <span className="tj-hero__sgo">
          {REVIEW_ATTEMPTS}
          <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
        </span>
      )}
    </>
  )
  return (
    <div
      className={`tj-hero is-${tone}${open ? ' is-open' : ' is-folded'}${onFold ? ' is-foldable' : ''}${beside ? ' has-see' : ''}`}
      role="group"
      aria-label={`Decision: ${word}${outcome?.policyName ? `, by ${outcome.policyName}` : ''}`}
      onClick={onFold && !open ? (e) => (e.target as Element).closest?.('button, a') === null && onFold() : undefined}
    >
      {pulse && (
        <motion.span
          className="tj-hero__pulse"
          aria-hidden
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0, 1, 0], scale: [1, 1, 1.045] }}
          transition={{ duration: 1.1, delay: 0.12, times: [0, 0.22, 1], ease: EASE_OUT }}
          onAnimationComplete={() => setPulse(false)}
        />
      )}
      <motion.div className="tj-hero__in" variants={lines} initial={animate ? 'out' : false} animate={landed || !animate ? 'in' : 'out'}>
        <div className="tj-hero__main">
          <motion.div className="tj-hero__top" variants={line}>
            <span className="tj-hero__icon" aria-hidden>
              <Icon size={20} strokeWidth={2} />
            </span>
            <span className="tj-hero__word">{word}</span>
            {open && <TipDot text="This tenant’s policies, zones and devices; addresses from a sample table" label="About the result" />}
            {mark === 'fails' && expected && (
              <span className="tj-hero__expect" title={`This sign-in expects ${DECISION_WORDS[expected]}`}>
                <TriangleAlert className="tj-hero__emark" size={12} strokeWidth={2.2} aria-hidden />
                <span className="u-sr-only">Fails: </span>
                Expected
                <DecisionBadge decision={expected} />
              </span>
            )}
            {mark === 'weaker' && (
              <span className="tj-hero__expect" title={weaker || undefined}>
                <TriangleAlert className="tj-hero__emark" size={12} strokeWidth={2.2} aria-hidden />
                <span className="u-sr-only">Fails: </span>
                {GROUP_WORDS['weaker-factor']}
                {weaker && <span className="u-sr-only">. {weaker}</span>}
              </span>
            )}
            {!open && ask && (
              <span className="tj-hero__inline" title={ask}>
                {ask}
              </span>
            )}
            {changed && <span className="tj-hero__changed">Changed by {changed}</span>}
            {fold && <span className="tj-hero__open">{fold}</span>}
          </motion.div>
          {open && (
            <div id={bodyId} className="tj-hero__body">
              {by && (
                <motion.p className="tj-hero__by" variants={line}>
                  <span className="tj-hero__bylabel">Decided by</span>
                  {onOpenPolicy ? (
                    <button type="button" className="tj-hero__bylink" title={`Open ${outcome?.policyName ?? 'the policy'}`} onClick={onOpenPolicy}>
                      <span>{by}</span>
                      <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                    </button>
                  ) : (
                    <span className="tj-hero__byname">{by}</span>
                  )}
                  {/* Only the quiet to say: the why is a question the admin asks, not a strip. */}
                  {!finding && onWhy && (
                    <button type="button" className="tj-hero__whybtn" aria-expanded={whyOpen} aria-controls={whyOpen ? whyId : undefined} onClick={onWhy}>
                      Why?
                    </button>
                  )}
                  {/* Nothing to say, and nothing getting through: the attempts, as quietly as Why?. */}
                  {attemptsLink && onAttempts && (
                    <ArrivesOnce arrive={attemptsArrive} onIn={onAttemptsIn}>
                      {(arrive) => (
                        <motion.button
                          type="button"
                          className="tj-hero__whybtn tj-hero__attempts"
                          {...attemptsAria}
                          onClick={onAttempts}
                          initial={arrive ? { opacity: 0 } : false}
                          animate={{ opacity: 1 }}
                          transition={{ duration: arrive ? 0.24 : 0, ease: EASE_OUT }}
                        >
                          {ATTEMPTS_LINK}
                          <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
                        </motion.button>
                      )}
                    </ArrivesOnce>
                  )}
                </motion.p>
              )}
              {versus && (
                <motion.p className="tj-hero__vs" variants={line}>
                  {[versus.was, versus.now].map((c, i) => (
                    <span key={c.id} className="tj-hero__ver">
                      {i > 0 && <ArrowRight className="tj-hero__vsarrow" size={12} strokeWidth={2} aria-hidden />}
                      {i > 0 && <span className="u-sr-only">, then </span>}
                      <span className="tj-hero__vslabel">{c.label}</span>
                      {c.status === 'decided' && c.decision ? <DecisionBadge decision={c.decision} /> : <span className="tj-hero__vsword">{answerWords(c)}</span>}
                    </span>
                  ))}
                </motion.p>
              )}
              {view.status === 'depends' && view.outcomes.length > 0 && (
                <motion.ul className="tj-hero__ifs" variants={line}>
                  {view.outcomes.map((o) => (
                    <li key={`${o.label}:${o.decision}`}>
                      <span className="tj-hero__if">{o.label}</span>
                      <DecisionBadge decision={o.decision} />
                    </li>
                  ))}
                </motion.ul>
              )}
              {view.status === 'depends' && view.needs.length > 0 && (
                <motion.p className="tj-hero__needs" variants={line}>
                  Needs: {view.needs.join(', ')}
                </motion.p>
              )}
              {finding && (
                <motion.div className="tj-hero__stripwrap" variants={line}>
                  {onWhy ? (
                    <button type="button" className={`tj-hero__strip is-${finding.tone}`} aria-expanded={whyOpen} aria-controls={whyOpen ? whyId : undefined} onClick={onWhy}>
                      {strip}
                    </button>
                  ) : (
                    <p className={`tj-hero__strip is-${finding.tone}`}>{strip}</p>
                  )}
                  {finding.tone === 'conflict' && animate && (
                    <motion.span
                      className="tj-hero__spulse"
                      aria-hidden
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0.15, 1, 0] }}
                      transition={{ duration: 2.2, delay: 0.5, times: [0, 0.2, 0.45, 0.65, 1], ease: 'easeInOut' }}
                    />
                  )}
                </motion.div>
              )}
              {/* Attempts get through, and no finding is louder: the strip
                  says so and opens them, in the conflict's tone and pulse. */}
              {attemptsStrip && (
                <ArrivesOnce arrive={attemptsArrive} onIn={onAttemptsIn}>
                  {(arrive) => (
                    <motion.div
                      className="tj-hero__stripwrap"
                      initial={arrive ? { opacity: 0, y: 6 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: arrive ? 0.24 : 0, ease: EASE_OUT }}
                    >
                      {onAttempts ? (
                        <button type="button" className="tj-hero__strip is-conflict tj-hero__attempts" {...attemptsAria} onClick={onAttempts}>
                          {attemptsSaid}
                        </button>
                      ) : (
                        <p className="tj-hero__strip is-conflict">{attemptsSaid}</p>
                      )}
                      {arrive && (
                        <motion.span
                          className="tj-hero__spulse"
                          aria-hidden
                          initial={{ opacity: 0 }}
                          animate={{ opacity: [0, 1, 0.15, 1, 0] }}
                          transition={{ duration: 2.2, delay: 0.5, times: [0, 0.2, 0.45, 0.65, 1], ease: 'easeInOut' }}
                        />
                      )}
                    </motion.div>
                  )}
                </ArrivesOnce>
              )}
              {view.watching.map((w) => (
                <motion.p key={w.policyId} className="tj-hero__watch" variants={line}>
                  <span>{w.policyName}</span>
                  <WatchingBadge watched={w} yields={false} />
                </motion.p>
              ))}
            </div>
          )}
        </div>
        {/* Read before the stage: its label, then its steps (placed under the words by the grid). */}
        {beside && <motion.div ref={setSide} className="tj-hero__side" variants={line} />}
        {beside && (
          <motion.div className="tj-hero__see" variants={line}>
            <WhatTheySee screens={screens} appId={appId} collapsible={false} compact side={side} />
          </motion.div>
        )}
      </motion.div>
    </div>
  )
})

// --- The engine line -------------------------------------------------------------------------

/** Decelerating: what arrives. */
const EASE_OUT = [0.2, 0, 0, 1] as const
/** What changes size in place. */
const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const
/** A drawer opening: quick to start, long to settle (RunChain.tsx's). */
const EASE_OPEN = [0.32, 0.72, 0, 1] as const

/* One raised pill at the top of the canvas: what the engine is doing, in
   plain words, with a spinner, Skip and a hairline filling under it while it
   works; the quiet summary and Replay once it is done.

   It hugs its words. A new sentence fades in over the last as the last
   fades out, both from the same left edge, and the pill's width eases from
   the one to the other (the words box is motion's width; a ruler measures
   the new sentence before it is painted), so it never jumps and never
   resizes under the words. A longer sentence waits for its room: the pill
   grows first (GROW_S, with the last sentence still in it), and only then do
   the new words come in — never cut off for the moment the width takes. A
   shorter one comes in at once, and the pill eases in behind it. Skip and
   Replay share one slot, as wide as Replay, so the swap as the run lands
   moves nothing. Past its widest the words are cut with an ellipsis (the
   title has them whole).

   A conflict, named as the engine decides (`notice`), is said in the notice
   tone, its mark in place of the spinner: amber, not the blue of work.

   The status region says only the stages (the clock above), so a screen
   reader hears "Checking rules in …" once, not every finding. */
/** How long the pill takes to grow to a longer sentence, before the sentence comes in. */
const GROW_S = 0.12
/** How long the last sentence takes to fade as the next comes in. */
const TEXT_OUT_S = 0.1
export function EngineLine({
  text,
  running,
  arrive,
  smooth,
  progress,
  inert,
  onSkip,
  onReplay,
  skipRef,
  replayRef,
  notice = false,
}: {
  text: string
  running: boolean
  /** A run is playing: the pill drops in, the hairline fills. */
  arrive: boolean
  /** Words cross-fade and the width eases (not under reduced motion, nor on Skip's jump). */
  smooth: boolean
  /** Where the hairline fills to by the end of this step, and how long that takes. */
  progress: { to: number; ms: number } | null
  /** The card is open over the journey: Skip and Replay are behind it. */
  inert: boolean
  onSkip: () => void
  onReplay: () => void
  skipRef: RefObject<HTMLButtonElement | null>
  replayRef: RefObject<HTMLSpanElement | null>
  /** The step names a conflict: said in the notice tone, its mark in place of the spinner. */
  notice?: boolean
}) {
  /* The words box's width: the first sentence's at once, each after it
     eased to — measured by the ruler before the frame is painted. `said` is
     the sentence in the box: a longer one only once the box has grown to it. */
  const ruler = useRef<HTMLSpanElement | null>(null)
  const width = useMotionValue<number | 'auto'>('auto')
  const measured = useRef(false)
  const [said, setSaid] = useState(text)
  /* A shorter sentence's width, waiting for the last words to have faded (AnimatePresence's `onExitComplete`). */
  const shrinkTo = useRef<number | null>(null)
  const shrinking = useRef<{ stop: () => void } | null>(null)
  const onTextGone = () => {
    const w = shrinkTo.current
    shrinkTo.current = null
    if (w === null) return
    shrinking.current?.stop()
    shrinking.current = tween(width, w, { duration: 0.28, ease: EASE_IN_OUT })
  }
  useEffect(() => () => shrinking.current?.stop(), [])
  useLayoutEffect(() => {
    const r = ruler.current
    shrinking.current?.stop()
    shrinking.current = null
    shrinkTo.current = null
    if (!r) {
      setSaid(text)
      return
    }
    const w = Math.ceil(r.getBoundingClientRect().width)
    if (!measured.current || !smooth) {
      measured.current = true
      width.jump(w)
      setSaid(text)
      return
    }
    const now = width.get()
    if (typeof now !== 'number' || w <= now + 1) {
      /* Shorter: in at once; the pill eases in once the last words have faded (their exit), never cutting them. */
      setSaid(text)
      shrinkTo.current = w
      return
    }
    const run = tween(width, w, { duration: GROW_S, ease: EASE_OUT })
    const t = window.setTimeout(() => setSaid(text), GROW_S * 1000)
    return () => {
      run.stop()
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new sentence, and only that, moves the width
  }, [text])
  /* The notice tone arrives with its own words, not over the last sentence while the pill grows. */
  const tone = notice && running && said === text
  return (
    <div className={`tj-engine${running ? ' is-running' : ' is-done'}${tone ? ' is-notice' : ''}`} inert={inert || undefined}>
      <motion.div
        className="tj-engine__pill"
        initial={arrive ? { opacity: 0, y: -8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: arrive ? 0.26 : 0, ease: EASE_OUT }}
      >
        <span className="tj-engine__icon">
          {tone ? (
            <span className="tj-engine__notice" aria-hidden>
              <TriangleAlert size={14} strokeWidth={2.2} />
            </span>
          ) : running ? (
            <Spinner />
          ) : (
            <motion.span
              className="tj-engine__done"
              initial={smooth ? { scale: 0.6, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={smooth ? { scale: { type: 'spring', stiffness: 520, damping: 28 }, opacity: { duration: 0.12 } } : { duration: 0 }}
            >
              <Check size={14} strokeWidth={2.4} aria-hidden />
            </motion.span>
          )}
        </span>
        <motion.span className="tj-engine__words" style={{ width }} title={text}>
          <span ref={ruler} className="tj-engine__ruler" aria-hidden>
            {text}
          </span>
          <AnimatePresence initial={false} onExitComplete={onTextGone}>
            <motion.span
              key={said}
              className="tj-engine__text"
              initial={smooth ? { opacity: 0 } : false}
              animate={{ opacity: 1, transition: { duration: smooth ? 0.18 : 0, delay: smooth ? 0.04 : 0, ease: EASE_OUT } }}
              exit={{ opacity: 0, transition: { duration: smooth ? TEXT_OUT_S : 0, ease: EASE_IN_OUT } }}
            >
              {said}
            </motion.span>
          </AnimatePresence>
        </motion.span>
        <span className="tj-engine__act">
          {running ? (
            <button ref={skipRef} type="button" className="bx-btn bx-btn--ghost bx-btn--sm tj-engine__skip" onClick={onSkip}>
              Skip
            </button>
          ) : (
            <span ref={replayRef} className="tj-engine__replay">
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onReplay}>
                Replay
              </Button>
            </span>
          )}
        </span>
        {/* How far through its plan the run is: time, so it fills at an
            even rate — the one thing here that is linear — and fades as
            the run lands. */}
        <AnimatePresence>
          {running && progress && arrive && (
            <motion.span key="track" className="tj-engine__track" aria-hidden initial={false} exit={{ opacity: 0, transition: { duration: 0.24 } }}>
              <motion.span
                className="tj-engine__bar"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: progress.to }}
                transition={{ duration: progress.ms / 1000, ease: 'linear' }}
                style={{ originX: 0 }}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// --- The journey ---------------------------------------------------------------------------------

interface Show {
  which: boolean
  deciding: boolean
  outcome: boolean
}

/* Where the answer's badge sits down from the top of its wrapper, before
   it has been measured: the lane's small label over it, then the card's
   padding and half a badge. The wrapper is placed by it on its first frame. */
const OUT_PORT = 44

/* The answer, before it lands and as it lands: there unseen while the wire
   draws out to it (so the wire ends where it will be, measured), then up
   from a touch small and low with the least of an overshoot. */
const OUT_AWAY = { opacity: 0, scale: 0.97, y: 16 } as const
const OUT_HERE = { opacity: 1, scale: 1, y: 0 } as const
const OUT_SPRING = { type: 'spring', stiffness: 320, damping: 24, mass: 0.9 } as const

/** The engine line over the canvas's top, and a margin on the other sides: what "in view" leaves clear. */
const VIEW_INSET = { top: 64, right: 24, bottom: 24, left: 24 }

/* How far the canvas scrolls, as a run lands, to show the foot of the
   policies rather than leave the last one cut in half — no further, or the
   answer and the rule it came from go under the engine line. */
const FOOT_SLACK = 120

/** How the lanes glide to a new orientation. */
const SWITCH = { duration: 0.24, ease: EASE_IN_OUT } as const
/** Longest a switch may keep the wires unseen, should the lanes not move at all. */
const SWITCH_MS = 420

export interface EngineJourneyProps {
  /** The plan on screen (use-engine-run.ts `shown`). */
  plan: EngineRun
  /** The step on screen. */
  s: number
  /** A run is playing and motion is allowed: things arrive as they are reached. */
  animate: boolean
  reduced: boolean
  running: boolean
  /** The sign-in card is open over the journey: the rest steps back and is inert. */
  editing: boolean
  toggled: Record<string, boolean>
  onToggle: (policyId: string, open: boolean) => void
  showAll: boolean
  onShowAll: () => void
  /** Skip (or Edit) landed the run: the answer takes its place at once. */
  jumped: boolean
  /** Three lanes side by side, or one column (journey.ts `laneFit` says which a canvas can hold). Default horizontal. */
  orientation?: Orientation
  /* The start of the journey, side by side: an element carrying
     `data-node="sign-in"` (and a `data-port`), memoised by the caller. In one
     column the chain draws its own start (the builder's pill) and the person
     node from `form`, and this is not drawn. */
  start: ReactNode
  editCard: ReactNode
  /** The answer (`Answer`), memoised by the caller. */
  outcome: ReactNode
  onOpenPolicy: (policyId: string) => void
  onOpenRule: (policyId: string, ruleId: string) => void
  onAdd: (field: FormField) => void
  /** The sign-in the plan is of, for the person node (one column). Absent, the testing session's form. */
  form?: SignInForm | null
  /** The policies the rule cards are drawn from — a policy's draft, where the run was resolved with one. Absent, the tenant's. */
  policies?: readonly Policy[]
  /** The person node pressed (one column): where the sign-in is changed. Absent, the node is not a button. */
  onPressPerson?: () => void
  /** A notice for a rule card — a conflict ("Also applies to …") — or null. A card with one is drawn whole, never folded. */
  ruleNotice?: (rule: EngineRule) => ReactNode
  /* How the page's dock asks the chain to stand (one column): 'auto' after
     a run — the person, the policy and the answer open, only the rule that
     matched and any conflict open, the rest one line each — or Expand all /
     Collapse all, each press a new `seq`. What the admin folds by hand holds
     until the dock asks again or a new run plays. Absent, 'auto'. */
  fold?: FoldAsk
  /** The Person picker chose "Anyone in <group>" (the group's name, or its id): the person node says "A member of <group>". */
  asGroup?: string | null
  /* As the answer lands (one column), the chain's height (CSS px at zoom 1),
     so the page places the view itself — once, in place of the canvas
     following the engine down to the answer; again once the chain has
     folded to its glance; after a run that skipped its answer step (Skip,
     reduced motion), once it has settled. */
  onFit?: (height: number) => void
  /* One column: once the run is done — a beat after the answer lands, at
     once on a revisit, Skip or under reduced motion — the person and the
     policy fold to their heads and the answer is the hero (owner, 30 Sep:
     "at the first glance the user should see the OUTCOME"). A press opens
     either again; Expand all opens everything. False, they stay open as the
     engine left them. Default true. */
  glance?: boolean
  /* The why under the answer (WhyCard.tsx): a row of "As each group"
     pressed — the sign-in runs again as "Anyone in <group>". Absent, its rows
     are only read. */
  onAsGroup?: (groupId: string) => void
  /* The why in the page's right-hand panel (owner, 1 Oct 2026: "for the
     conflict we should open the right side panel instead of opening under
     the outcome"): whether it is open, the panel's body to draw it in, and
     the way to open or shut it. Absent, the why opens under the answer. */
  why?: { open: boolean; slot: HTMLElement | null; onOpen: (open: boolean) => void }
  /* Break-in attempts on the run's application (break-in-app.ts, the page's
     run of them) and whether their panel is open — the strip or the quiet
     link on the answer, and the why's last section, once the run is done.
     Absent — the builder's Check access — none. */
  breakIn?: { summary: AppBreakInSummary; open: boolean } | null
  /** Review attempts pressed — on the answer, or in the why — and where: the page opens their panel. */
  onReviewBreakIn?: (from: AttemptsFrom) => void
}

/* The why's title when the attempts are all it has to say: their label, in the conflict's tone while some get through. */
const attemptsTitle = (s: Pick<AppBreakInSummary, 'appName' | 'holes'>): { text: string; tone: WhyTone } => ({
  text: attemptsOnSaid(s.appName),
  tone: s.holes > 0 ? 'conflict' : 'info',
})

/** Nothing folded or opened by hand. */
const NO_NODES: Readonly<Record<string, boolean>> = {}

/** Following the engine down the column: the glide's length and its ease. */
const GLIDE_S = 0.6
/** One column: the engine line over the canvas's top, the dock over its foot — what "in view" leaves clear. */
const CHAIN_INSET = { top: 72, bottom: 72 }
/* A conflict's card, followed as the engine names it: its notice — at the
   card's foot — clear of the dock (34 px, in the scroller's 64 px of room)
   with air, not only of the canvas's edge. */
const CONFLICT_INSET = { top: 72, bottom: 112 }
/** How tall a conflict's card grows to, drawn whole with its notice: the glide leaves it the room. */
const CONFLICT_REACH = 220
/** How tall a rule, or the answer, grows to as it is read or lands: the glide leaves it the room. */
const RULE_REACH = 168
const OUT_REACH = 180
/** How long after a run lands its cards have finished folding, so the chain is measured settled. */
const FIT_AFTER_MS = 520
/** The policy node at its line (folded: its head and why) is no taller than this: the why keeps it in view as it opens. */
const POLICY_LINE_MAX = 120
/** How long the why takes to open under the answer (its drawer, 320 ms, and a frame’s air), or the answer to open again as it closes: then the view is placed. */
const WHY_SETTLE_MS = 360
/** The beat after a run is done — the answer landed a second before — before the person and the policy fold to their lines. */
const GLANCE_AFTER_MS = 160
/** How long that fold takes (RunChain.tsx's drawer, 260 ms, and a frame's air): then the chain is fitted. */
const GLANCE_FOLD_MS = 340

/* The sign-in at the top of the chain (RunNodes.tsx `SignInStop`): who,
   with every group they are in — or the group chosen in the Person picker —
   the application, and the facts its rules read that the form states, each
   with its mark on the run (journey.ts `factMarks`). */
function useSentenceView(form: SignInForm | null, plan: EngineRun, policies: readonly Policy[], asGroup: string | null = null): SentenceView {
  const { users, groups, apps, zones, fingerprints } = useBrand()
  return useMemo(() => {
    const u = form?.personId ? (users.find((x) => x.id === form.personId) ?? null) : null
    const a = form?.appId ? (apps.find((x) => x.id === form.appId) ?? null) : null
    const app = a ? { id: a.id, name: a.name } : form?.appId ? { id: form.appId, name: plan.appName } : null
    if (!form || !u) return { who: null, isGroup: false, groups: [], app, facts: [] }
    const rows = rowsRead(policies, null, form.appId, { zones, fingerprints })
    const ctx = { people: users, apps, zones, rows }
    const marks = factMarks(plan)
    const facts = sentenceTokens(rows)
      .filter((t) => t !== 'person' && t !== 'app')
      .map((t) => ({ token: t, value: tokenValue(t, form, ctx), mark: tokenMark(t, marks) }))
      .filter((f) => !f.value.unset)
    const group = asGroup ? (groups.find((g) => g.id === asGroup)?.name ?? asGroup) : null
    if (group) return { who: `A member of ${group}`, isGroup: true, groups: [], testedAs: u.name, app, facts }
    return { who: u.name, isGroup: false, groups: memberGroupIds(u).map((id) => groups.find((g) => g.id === id)?.name ?? id), app, facts }
  }, [form, plan, policies, users, groups, apps, zones, fingerprints, asGroup])
}

/* What the lanes show at a step: the policies from the scan's start, the
   answer's place from the step the wire starts to draw out to it, the
   answer from the step it lands. In one column the answer's place is taken
   as it lands — the spine drawing down into it as it springs up — rather
   than held open, empty, under the policies for a beat while the canvas
   scrolls to it. */
const showOf = (plan: EngineRun, s: number, vertical = false): Show => ({
  which: s >= plan.at.which,
  deciding: s >= (vertical ? plan.at.outcome : plan.at.outcome - 1),
  outcome: s >= plan.at.outcome,
})

export function EngineJourney({
  plan,
  s,
  animate,
  reduced,
  running,
  editing,
  toggled,
  onToggle,
  showAll,
  onShowAll,
  jumped,
  orientation = 'horizontal',
  start,
  editCard,
  outcome,
  onOpenPolicy,
  onOpenRule,
  onAdd,
  form: formProp,
  policies: policiesProp,
  onPressPerson,
  ruleNotice,
  fold = AUTO_FOLD,
  asGroup = null,
  onFit,
  glance: glanceOn = true,
  onAsGroup,
  why,
  breakIn = null,
  onReviewBreakIn,
}: EngineJourneyProps) {
  const vertical = orientation === 'vertical'
  const show = showOf(plan, s, vertical)
  const brand = useBrand()
  const resolve = useNameLookup()
  const session = useContext(TestingSessionContext)
  const form = formProp !== undefined ? formProp : (session?.form ?? null)
  const tenantPolicies = policiesProp ?? brand.policies
  /* The person tested, by name, whatever the sentence says: the policy's lines name them. */
  const personName = (form?.personId && brand.users.find((u) => u.id === form.personId)?.name) || null
  const sentence = useSentenceView(form, plan, tenantPolicies, asGroup)
  const stage = useRef<HTMLElement | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const [hot, setHot] = useState<NodeId | null>(null)
  const [pad, setPad] = useState(0)
  /* The pointer has moved since the run landed: until it does, nothing under
     it is hovered and no tooltip opens — the canvas grew under a pointer that
     stayed where Run, a suggestion or a saved sign-in was pressed. A run
     starting forgets the hover and the move. */
  const [moved, setMoved] = useState(false)
  /* What the admin folded or opened by hand (one column), for this plan and
     the dock's last ask: a new run, or a press of Expand all or Collapse all,
     starts again from what the chain shows by itself. */
  const [folds, setFolds] = useState<{ plan: EngineRun; seq: number; nodes: Record<string, boolean> }>(() => ({ plan, seq: fold.seq, nodes: {} }))
  const nodes = folds.plan === plan && folds.seq === fold.seq ? folds.nodes : NO_NODES
  /* The glance (`glance`): the person and the policy folded to their lines
     once the run is done. Settled from the start on a revisit; a run
     playing takes it away, and a beat after it lands it comes back. */
  const [glanced, setGlanced] = useState(!running)
  const [runSeen, setRunSeen] = useState(running)
  /* The runs played here: what comes in as one settles (the attempts) comes
     in, rather than being there — once for that run (`attemptsIn`, the run
     whose attempts have come in); on a revisit it is simply there. */
  const [played, setPlayed] = useState(running ? 1 : 0)
  const [attemptsIn, setAttemptsIn] = useState(0)
  if (runSeen !== running) {
    setRunSeen(running)
    if (running) {
      setHot(null)
      setMoved(false)
      setFolds({ plan, seq: fold.seq, nodes: {} })
      setGlanced(false)
      setPlayed(played + 1)
    }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!running && !moved && (e.movementX !== 0 || e.movementY !== 0)) setMoved(true)
  }
  /* The keyboard acts too: a Tab once the run is done lets the tooltips be,
     so a policy's opens as its head takes the focus. Rendered before the Tab
     moves the focus (`flushSync`), so the head it lands on is already the one
     with its tooltip, and not replaced under the focus. */
  useEffect(() => {
    if (running || moved) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Tab') flushSync(() => setMoved(true))
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [running, moved])
  const decider = plan.decider
  const deciding = plan.policies.find((p) => p.decides) ?? null
  const isOpen = (p: EnginePolicy) => toggled[p.policyId] ?? (p.decides && policyOpen(p, s))
  const deciderOpen = deciding ? isOpen(deciding) : false
  const landing = plan.landing !== null ? plan.rules[plan.landing] : null
  /* The last wire leaves the policy level with the rule it stopped at — its
     last row too, when that decided — and the answer sits level with that
     rule, so the wire runs straight across; level with the policy's head once
     the policy has been closed, or when the answer Depends and the last row
     is only "If not": nothing matched, so nothing is wired as if it had. */
  const from = deciderOpen && landing && landing.state !== 'possible' ? landing.node : (deciding?.node ?? null)
  const active = running ? activeNode(plan, s) : null
  const interactive = !running && !editing
  const hoverable = interactive && moved
  const foldable = plan.rules.some((r) => r.state === 'no-match' || (r.state === 'unknown' && r.checks.some((c) => c.status === 'pass')))
  /* Skip is a jump to the settled canvas: nothing folds, glides or springs
     on the way there, as under reduced motion. */
  const motionOk = !reduced && !jumped
  /* At a glance: after a beat once a run lands; at once where nothing moves
     (reduced motion, Skip). */
  const glance = vertical && glanceOn && !running && (glanced || !motionOk)
  useEffect(() => {
    if (running || glanced) return
    if (!motionOk) {
      setGlanced(true)
      return
    }
    const t = window.setTimeout(() => setGlanced(true), GLANCE_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [running, glanced, motionOk])
  /* The engine walked into a rule: it opened it (or passed it, switched off). */
  const walked = (r: EngineRun['rules'][number]) => r.startAt >= 0 && s >= r.startAt && (r.visited || r.state === 'off')

  /* A new orientation: the lanes glide (their layout, below) while the
     wires wait unseen — measured by offsets, they would stand where the
     lanes are going while the lanes were still on their way — and come back
     once the lanes have landed, measured again. Under reduced motion the
     lanes are there at once, and so are the wires. Motion holds a layout
     still while the window itself is resizing (its projection's own rule):
     then too the lanes are simply there, and the wires come back two frames
     on rather than waiting out a glide that never starts. */
  const [laidOut, setLaidOut] = useState(orientation)
  const [switching, setSwitching] = useState(false)
  if (laidOut !== orientation) {
    setLaidOut(orientation)
    setSwitching(!reduced)
  }
  const glided = useRef(false)
  useEffect(() => {
    if (!switching) return
    glided.current = false
    let b = 0
    const a = window.requestAnimationFrame(() => {
      b = window.requestAnimationFrame(() => {
        if (!glided.current) setSwitching(false)
      })
    })
    const t = window.setTimeout(() => setSwitching(false), SWITCH_MS)
    return () => {
      window.cancelAnimationFrame(a)
      window.cancelAnimationFrame(b)
      window.clearTimeout(t)
    }
  }, [switching])
  /* Each lane's layout, measured only when the orientation changes — a step
     that grows a lane moves nothing by it. */
  const lane = {
    layout: 'position' as const,
    layoutDependency: orientation,
    transition: reduced ? { duration: 0 } : SWITCH,
    onLayoutAnimationStart: () => {
      glided.current = true
    },
    onLayoutAnimationComplete: () => setSwitching(false),
  }

  /* Keep the engine's step in view: glide the canvas (jump, under reduced
     motion) so what it works on is clear of the engine line. Again once a
     growing part has grown — a policy opening, a rule's rows sliding in. */
  const follow = useCallback(
    (n: NodeId) => {
      const sc = scroller.current
      /* In one column a policy's row folds away as it decides: the policy node holds it. */
      const el = stage.current?.querySelector<HTMLElement>(`[data-node="${n}"]`) ?? (n.startsWith('policy:') ? stage.current?.querySelector<HTMLElement>('[data-node="which"]') : null)
      if (!sc || !el) return
      const r = el.getBoundingClientRect()
      const v = sc.getBoundingClientRect()
      const target: Box = { x: r.left - v.left + sc.scrollLeft, y: r.top - v.top + sc.scrollTop, w: r.width, h: r.height }
      const reach = n.startsWith('rule:') ? 96 : n.startsWith('policy:') ? 160 : 0
      const to = followTo({ left: sc.scrollLeft, top: sc.scrollTop, width: sc.clientWidth, height: sc.clientHeight }, target, VIEW_INSET, reach)
      if (to) sc.scrollTo({ ...to, behavior: reduced ? 'auto' : 'smooth' })
    },
    [reduced],
  )
  /* One column: the canvas FOLLOWS the engine down the chain (owner, 30 Sep:
     "the user can't trace the whole process with their eyes") — one eased
     glide of the scroll (motion's tween of a number, written to scrollTop;
     nothing is transformed), so the step the engine works on is always in
     view, a little way down the canvas, with room under it for what comes
     next. A glide already heading about there is let be; the wheel or a
     press on the canvas stops it, so it never fights the admin. At once
     under reduced motion. */
  const glide = useRef<{ stop: () => void; to: number } | null>(null)
  const stopGlide = useCallback(() => {
    glide.current?.stop()
    glide.current = null
  }, [])
  useEffect(() => stopGlide, [stopGlide])
  const glideTo = useCallback(
    (top: number) => {
      const sc = scroller.current
      if (!sc) return
      const to = Math.min(Math.max(0, sc.scrollHeight - sc.clientHeight), Math.max(0, Math.round(top)))
      if (glide.current && Math.abs(glide.current.to - to) < 24) return
      stopGlide()
      if (Math.abs(to - sc.scrollTop) < 2) return
      if (reduced) {
        sc.scrollTop = to
        return
      }
      const run = tween(sc.scrollTop, to, {
        duration: GLIDE_S,
        ease: EASE_IN_OUT,
        onUpdate: (v) => {
          sc.scrollTop = v
        },
        onComplete: () => {
          if (glide.current?.to === to) glide.current = null
        },
      })
      glide.current = { stop: () => run.stop(), to }
    },
    [reduced, stopGlide],
  )
  const followV = useCallback(
    (n: NodeId, clash = false) => {
      const sc = scroller.current
      const st = stage.current
      const el = st?.querySelector<HTMLElement>(`[data-node="${n}"]`) ?? (n.startsWith('policy:') ? st?.querySelector<HTMLElement>('[data-node="which"]') : null)
      if (!sc || !el) return
      const r = el.getBoundingClientRect()
      const v = sc.getBoundingClientRect()
      /* From where a glide under way is going, not where it has got to. */
      const top = glide.current ? glide.current.to : sc.scrollTop
      const y = r.top - v.top + sc.scrollTop
      const reach = clash ? CONFLICT_REACH : n.startsWith('rule:') ? RULE_REACH : n === 'outcome' ? OUT_REACH : 0
      const to = followTop({ top, height: sc.clientHeight }, { y, h: r.height }, clash ? CONFLICT_INSET : CHAIN_INSET, reach)
      if (to !== null) glideTo(to)
    },
    [glideTo],
  )
  /* As the engine decides, a rule that would also apply opens whole and the
     line names it (engine-run.ts: a step of its own, held): the canvas takes
     the eye to that card and its notice, clear of the dock. */
  const alsoFirst = plan.conflicts?.conflicts[0]?.ruleId ?? null
  const clashBeat = vertical && alsoFirst !== null && plan.steps[s]?.kind === 'deciding' && plan.steps[s]?.notice === true
  const target: NodeId | null = clashBeat ? `rule:${alsoFirst}` : active
  /* As the answer lands in one column, a page that fits the run (`onFit`)
     places the view itself — once, in place of following the engine down to
     the answer and then being moved again as it settles. Once a run; again
     for a Replay. */
  const placed = useRef(false)
  const onFitRef = useRef(onFit)
  useLayoutEffect(() => {
    onFitRef.current = onFit
  })
  const landsNow = vertical && running && plan.steps[s]?.kind === 'outcome'
  useEffect(() => {
    if (running) placed.current = false
  }, [running])
  /* Folded to its glance: the page places the view again — the whole chain
     now fits — once the fold has run. */
  const glancedFrom = useRef(glance)
  useEffect(() => {
    const now = glance && !glancedFrom.current
    glancedFrom.current = glance
    if (!now) return
    const t = window.setTimeout(
      () => {
        const chain = stage.current?.querySelector<HTMLElement>('.tj-chain')
        if (!chain || !onFitRef.current) return
        placed.current = true
        stopGlide()
        onFitRef.current(chain.offsetHeight)
      },
      motionOk ? GLANCE_FOLD_MS : 0,
    )
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as the chain takes its glance
  }, [glance])
  useEffect(() => {
    if (!target) return
    if (landsNow && onFitRef.current) {
      if (placed.current) return
      /* Two frames on: the answer has taken its place (its spring is a
         transform, and the fit reads layout, so it is measured where it will stand). */
      let b = 0
      const a = window.requestAnimationFrame(() => {
        b = window.requestAnimationFrame(() => {
          const chain = stage.current?.querySelector<HTMLElement>('.tj-chain')
          if (!chain || !onFitRef.current || placed.current) return
          placed.current = true
          stopGlide()
          onFitRef.current(chain.offsetHeight)
        })
      })
      return () => {
        window.cancelAnimationFrame(a)
        window.cancelAnimationFrame(b)
      }
    }
    const go = vertical ? (n: NodeId) => followV(n, clashBeat) : follow
    go(target)
    const t = window.setTimeout(() => go(target), 320)
    return () => window.clearTimeout(t)
  }, [target, s, follow, followV, vertical, clashBeat, landsNow, stopGlide])

  /* Landed a little taller than the canvas: show the foot of the policies,
     so no row is left cut in half at the bottom — only as far as the head
     of the policy that decides, the rule it stopped at and the answer stay
     clear of the engine line, and never back up. Once the answer has taken
     its place. */
  const landedFrom = useRef(running)
  useEffect(() => {
    const landed = landedFrom.current && !running
    landedFrom.current = running
    if (!landed || editing) return
    /* In one column the answer is the foot: the steps kept it in view as it
       landed — all but a run settled at once (reduced motion), which is
       brought to its answer here, at once. */
    if (vertical) {
      /* Settled — the rules folded to their lines — the chain's height, for
         the page to fit: it then places the view itself, so the canvas's own
         glide stops and does not follow on. Without a page to fit it, the
         canvas brings its answer into view. */
      const fits = onFitRef.current !== undefined
      const t = fits ? 0 : window.setTimeout(() => followV('outcome'), reduced ? 0 : 320)
      /* Placed as the answer landed already; else (Skip, reduced motion) now. */
      const f = window.setTimeout(
        () => {
          const chain = stage.current?.querySelector<HTMLElement>('.tj-chain')
          if (!chain || !onFitRef.current || placed.current) return
          placed.current = true
          stopGlide()
          onFitRef.current(chain.offsetHeight)
        },
        reduced ? 0 : FIT_AFTER_MS,
      )
      return () => {
        window.clearTimeout(t)
        window.clearTimeout(f)
      }
    }
    const t = window.setTimeout(() => {
      const sc = scroller.current
      const st = stage.current
      const lane = st?.querySelector<HTMLElement>('[data-col="which"]')
      if (!sc || !st || !lane) return
      const v = sc.getBoundingClientRect()
      const y = (el: Element) => el.getBoundingClientRect().top - v.top + sc.scrollTop
      const foot = lane.getBoundingClientRect().bottom - v.top + sc.scrollTop
      const need = Math.ceil(foot + VIEW_INSET.bottom - (sc.scrollTop + sc.clientHeight))
      if (need <= 0 || need > FOOT_SLACK) return
      /* Clear of the engine line: its foot, and a little air. */
      const line = st.parentElement?.parentElement?.querySelector('.tj-engine')?.getBoundingClientRect()
      const clear = line ? line.bottom - v.top + 4 : VIEW_INSET.top
      const keep = [
        st.querySelector('[data-node="outcome"]'),
        from ? st.querySelector(`[data-node="${from}"]`) : null,
        deciding ? st.querySelector(`[data-node="${deciding.node}"]`) : null,
      ].filter((el): el is Element => el !== null)
      const most = Math.min(...keep.map((el) => y(el) - clear))
      const top = Math.floor(Math.min(sc.scrollTop + need, most))
      if (top <= sc.scrollTop) return
      sc.scrollTo({ top, left: sc.scrollLeft, behavior: reduced ? 'auto' : 'smooth' })
    }, reduced ? 0 : 320)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as a run lands
  }, [running])

  const fade = {
    initial: animate && motionOk ? { opacity: 0 } : false,
    animate: { opacity: 1 },
    transition: { duration: animate && motionOk ? 0.26 : 0, ease: EASE_OUT },
  } as const
  const openRuleOfDecider = useCallback((ruleId: string) => decider && onOpenRule(decider.id, ruleId), [decider, onOpenRule])

  // --- The fold (one column; owner, 30 Sep: "make the cards collapsible like we have in the policy builder") ---

  /* While the engine works the chain is its own, to be followed; once done,
     what the dock asked and what the admin pressed (journey.ts `foldOpen`). */
  const mode: FoldMode = running ? 'auto' : fold.mode
  /* Expand all opens every rule to every row it read: Show all checks, for all. */
  const showAllNow = showAll || mode === 'expand'

  /* Troubleshooting (owner, 1 Oct: "how will the user troubleshoot from
     here … understand things faster"): the findings (conflicts.ts), counted
     once on the policy that decided, said in ONE strip on the answer, and the
     why (WhyCard.tsx) — in the page's right-hand panel where it has one
     (`why`), else under the answer — opened by the strip or the count, closed
     by its × or either again. What is only in the why (a draft that would
     change nothing, a same-answer rule — journey.ts `isQuiet`) is neither
     counted nor the answer's strip: a quiet Why? on the answer opens it. One
     column, once the run is done.

     Break-in attempts on the application, where the page has them and a
     policy decided (`breakIn`, the page's run of the deck, break-in-app.ts):
     the why's last section, its own — the findings are about this person,
     the attempts about the application — and, with no finding to say, the
     answer's strip or its quiet link (`Answer`). Never counted on the policy:
     its count is the findings'. With no finding at all the why is theirs
     alone, titled by them. Once the run is done, never during it. */
  const attempts = vertical && breakIn && decider ? breakIn.summary : null
  const finding = useMemo(() => (vertical ? heroFinding(plan) : null), [plan, vertical])
  const whyHead = useMemo(() => (vertical ? (whyTitleOf(plan) ?? (attempts ? attemptsTitle(attempts) : null)) : null), [plan, vertical, attempts])
  const items = useMemo(() => (vertical ? whyItems(plan) : []), [plan, vertical])
  const groupRows = useMemo(() => (vertical ? eachGroupRows(plan) : null), [plan, vertical])
  const counted = useMemo(() => (vertical ? findingsCount(plan) : null), [plan, vertical])
  const hasWhy = whyHead !== null && items.length > 0
  const whyOpen = (hasWhy || attempts !== null) && !running && (why ? why.open : nodes.why === true)
  /* Review attempts calls the page's latest: the answer is memoised. */
  const reviewLatest = useRef(onReviewBreakIn)
  useLayoutEffect(() => {
    reviewLatest.current = onReviewBreakIn
  })
  const reviewFromOutcome = useCallback(() => reviewLatest.current?.('outcome'), [])
  const reviewFromWhy = useCallback(() => reviewLatest.current?.('why'), [])
  const whyBreakIn = useMemo(() => (attempts ? { summary: attempts, onReview: reviewFromWhy } : null), [attempts, reviewFromWhy])
  /* Every stop is open by itself — each says little enough to (1 Oct 2026):
     the dock's Collapse all, or a press, folds one to its head. */
  const nodeOpen = (k: 'policies' | 'policy' | 'outcome') => foldOpen(k, nodes, mode, true, running)
  /* The presses call the latest of all of this: the cards they are on are memoised. */
  const latestFold = useRef({ plan, seq: fold.seq, nodes, nodeOpen })
  useLayoutEffect(() => {
    latestFold.current = { plan, seq: fold.seq, nodes, nodeOpen }
  })
  const foldNode = useCallback((k: 'policies' | 'policy' | 'outcome') => {
    const f = latestFold.current
    setFolds({ plan: f.plan, seq: f.seq, nodes: { ...f.nodes, [k]: !f.nodeOpen(k) } })
  }, [])
  const foldPolicy = useCallback(() => foldNode('policy'), [foldNode])
  const foldPolicies = useCallback(() => foldNode('policies'), [foldNode])
  const foldOutcome = useCallback(() => foldNode('outcome'), [foldNode])

  const whyId = useId()
  const whyTitle = useRef<HTMLHeadingElement | null>(null)
  const whyTimer = useRef(0)
  /* Read at the press: whether the why opens with motion. */
  const reducedRef = useRef(!motionOk)
  useLayoutEffect(() => {
    reducedRef.current = !motionOk
  })
  useEffect(() => () => window.clearTimeout(whyTimer.current), [])
  /* The policy's fold before the why opened: given back as it closes. */
  const policyBeforeWhy = useRef<boolean | undefined>(undefined)
  /* The page's panel, read at the press: the why opens there, and nothing on the chain folds for it. */
  const whyPanel = useRef(why)
  useLayoutEffect(() => {
    whyPanel.current = why
  })
  const toggleWhy = useCallback(() => {
    const panel = whyPanel.current
    if (panel) {
      panel.onOpen(!panel.open)
      return
    }
    const f = latestFold.current
    const opening = f.nodes.why !== true
    /* Opening folds the answer — and the policy, opened to its rules after
       Expand all — to their lines, so which policy decided and what it
       decided stand together over the why; closing gives both back. */
    const nodes: Record<string, boolean> = { ...f.nodes, why: opening, outcome: !opening }
    if (opening) {
      policyBeforeWhy.current = f.nodes.policy
      nodes.policy = false
    } else if (policyBeforeWhy.current === undefined) delete nodes.policy
    else nodes.policy = policyBeforeWhy.current
    setFolds({ plan: f.plan, seq: f.seq, nodes })
    window.clearTimeout(whyTimer.current)
    const moves = !reducedRef.current
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        if (opening) whyTitle.current?.focus({ preventScroll: true })
        else stage.current?.querySelector<HTMLElement>('.tj-hero__whybtn, button.tj-hero__strip')?.focus({ preventScroll: true })
        whyTimer.current = window.setTimeout(
          () => {
            const sc = scroller.current
            const st = stage.current
            if (!sc || !st) return
            if (!opening) {
              /* The answer back: the page places the chain again, as it did at its glance. */
              const chain = st.querySelector<HTMLElement>('.tj-chain')
              if (chain && onFitRef.current) {
                stopGlide()
                onFitRef.current(chain.offsetHeight)
              }
              return
            }
            /* The policy that decided, the answer and the why under them in
               view, together — from the policy's line when all do not fit, so
               which policy decided and what it decided never leave the view
               while the why is read (the why itself scrolls on under them).
               A policy opened to its rules is taller than that is worth: then
               from the answer, as its rules above already say it. */
            const which = st.querySelector<HTMLElement>('[data-node="decider"]')
            const hero = st.querySelector<HTMLElement>('[data-node="outcome"]')
            const why = st.querySelector<HTMLElement>('[data-node="why"]')
            const from = which && which.offsetHeight <= POLICY_LINE_MAX ? which : hero
            if (!from || !why) return
            const v = sc.getBoundingClientRect()
            const top = from.getBoundingClientRect().top - v.top + sc.scrollTop
            const bottom = why.getBoundingClientRect().bottom - v.top + sc.scrollTop
            const to = followTop({ top: sc.scrollTop, height: sc.clientHeight }, { y: top, h: bottom - top }, CHAIN_INSET)
            if (to !== null) glideTo(to)
          },
          moves ? WHY_SETTLE_MS : 0,
        )
      }),
    )
  }, [glideTo, stopGlide])

  /* What the answer is told (the `Hero` context): steady between steps, so it draws only as it lands. */
  const deciderId = decider?.id ?? null
  const openDecider = useCallback(() => deciderId !== null && onOpenPolicy(deciderId), [deciderId, onOpenPolicy])
  const heroAnimate = animate && motionOk
  const landedOut = show.outcome
  const heroOpen = vertical ? nodeOpen('outcome') : true
  const heroFold = vertical && interactive ? foldOutcome : null
  const heroWhy = vertical && interactive && hasWhy ? toggleWhy : null
  /* The attempts on the answer: once the run is done, by name and whether any get through — no number. */
  const attemptsApp = !running && attempts ? attempts.appName : null
  const attemptsHoles = attempts !== null && attempts.holes > 0
  const heroAttempts = useMemo(() => (attemptsApp !== null ? { appName: attemptsApp, holes: attemptsHoles } : null), [attemptsApp, attemptsHoles])
  const heroReview = interactive && heroAttempts && onReviewBreakIn ? reviewFromOutcome : null
  const attemptsOpen = breakIn?.open === true
  const attemptsArrive = motionOk && played > attemptsIn
  const onAttemptsIn = useCallback(() => setAttemptsIn(played), [played])
  const hero = useMemo(
    () => ({
      outcome: plan.outcome,
      landed: landedOut,
      animate: heroAnimate,
      onOpenPolicy: deciderId !== null ? openDecider : null,
      open: heroOpen,
      onFold: heroFold,
      finding,
      onWhy: heroWhy,
      whyOpen,
      whyId,
      attempts: heroAttempts,
      onAttempts: heroReview,
      attemptsOpen,
      attemptsArrive,
      onAttemptsIn,
    }),
    [plan.outcome, landedOut, heroAnimate, deciderId, openDecider, heroOpen, heroFold, finding, heroWhy, whyOpen, whyId, heroAttempts, heroReview, attemptsOpen, attemptsArrive, onAttemptsIn],
  )
  /* The decided path's colour, the outcome's (journey.ts `pathTone`): on the stage, for every part of the way. */
  const path = pathTone(plan)

  /* What moves the boxes the wires aim at: a step, a policy opened or closed
     by hand, Show all checks, the card opening, the orientation (and the
     lanes landing after it). Not a hover. */
  const layoutKey = `${s}|${showAll}|${editing}|${Object.entries(toggled).join(';')}|${orientation}|${switching}`

  /* One column: the builder's chain (RunChain.tsx, §13.2, §14.3) — the
     sign-in as one sentence on the builder's start pill (a press opens the
     form), the policy with its rules as the builder's cards, the answer —
     joined by the builder's spine. No wires to measure: the spine is the
     builder's connectors between the stops. Every card folds. */
  if (vertical) {
    const moving = animate && motionOk
    const reachedOutcome = show.deciding
    const policyOpenNow = nodeOpen('policy')
    return (
      <div ref={scroller} className="tj-scroll" onPointerMove={onPointerMove} onWheel={stopGlide} onPointerDown={stopGlide}>
        <section
          ref={stage}
          className={`tj-stage is-vertical is-chain is-path-${path}${editing ? ' is-editing' : ''}${hoverable ? ' is-pointing' : ''}${running ? ' is-running' : ''}`}
          aria-label="Sign-in journey"
        >
          <div className="tj-chain" inert={editing || undefined}>
            <Seg animate={moving}>
              <SignInStop view={sentence} onPress={onPressPerson} />
            </Seg>
            {show.which && (
              <Seg animate={moving} delay={0.2}>
                <ChainLink lit={s >= plan.at.decides && decider !== null} animate={moving} />
                <PoliciesStop
                  plan={plan}
                  s={s}
                  person={personName}
                  animate={moving || (motionOk && !running)}
                  interactive={interactive}
                  hoverable={hoverable}
                  toggled={toggled}
                  onToggle={onToggle}
                  hot={hot}
                  active={active}
                  onHover={setHot}
                  onOpenRule={onOpenRule}
                  open={nodeOpen('policies')}
                  onFold={interactive ? foldPolicies : undefined}
                />
              </Seg>
            )}
            {decider && deciding?.expandAt != null && s >= deciding.expandAt && (
              <Seg animate={moving}>
                <ChainLink lit={plan.rules.some((r) => r.startAt >= 0 && s >= r.startAt)} animate={moving} />
                <DeciderStop
                  plan={plan}
                  s={s}
                  person={personName}
                  policies={tenantPolicies}
                  resolve={resolve}
                  animate={moving || (motionOk && !running)}
                  running={running}
                  interactive={interactive}
                  active={active}
                  showAll={showAllNow}
                  onOpenRule={onOpenRule}
                  onOpenPolicy={onOpenPolicy}
                  ruleNotice={ruleNotice}
                  open={policyOpenNow}
                  onFold={interactive ? foldPolicy : undefined}
                  every={!running && mode === 'expand'}
                  count={hasWhy ? counted : null}
                  onCount={interactive && hasWhy ? toggleWhy : undefined}
                  countOpen={whyOpen}
                />
              </Seg>
            )}
            {reachedOutcome && (
              <>
                <ChainLink lit={show.outcome && plan.landing !== null} animate={moving} />
                <motion.div
                  className={`tj-out${show.outcome ? '' : ' is-waiting'}`}
                  data-node="outcome"
                  {...(active === 'outcome' ? { 'data-active': '' } : null)}
                  aria-hidden={show.outcome ? undefined : true}
                  inert={editing || !show.outcome || undefined}
                  initial={animate && motionOk ? OUT_AWAY : false}
                  animate={show.outcome ? OUT_HERE : OUT_AWAY}
                  transition={show.outcome && animate && motionOk ? OUT_SPRING : { duration: 0 }}
                >
                  <Hero.Provider value={hero}>{outcome}</Hero.Provider>
                </motion.div>
              </>
            )}
            {/* Why (WhyCard.tsx): in the page's right-hand panel where it has
                one — drawn into its body — else under the answer, opening
                like a drawer, by its height, the answer folding above it. */}
            {why
              ? whyOpen &&
                whyHead &&
                why.slot &&
                createPortal(
                  <WhyCard
                    plan={plan}
                    items={items}
                    groups={groupRows}
                    headline={whyHead}
                    policies={tenantPolicies}
                    resolve={resolve}
                    person={personName ?? plan.conflicts?.personName ?? ''}
                    id={whyId}
                    titleRef={whyTitle}
                    interactive={interactive}
                    onClose={toggleWhy}
                    onOpenRule={onOpenRule}
                    onOpenPolicy={onOpenPolicy}
                    onAdd={onAdd}
                    onAsGroup={onAsGroup}
                    breakIn={whyBreakIn}
                  />,
                  why.slot,
                )
              : null}
            <AnimatePresence initial={false}>
              {!why && whyOpen && whyHead && (
                <motion.div
                  key="why"
                  className="tj-whywrap"
                  initial={motionOk ? { height: 0, opacity: 0 } : false}
                  animate={{ height: 'auto', opacity: 1, transition: motionOk ? { height: { duration: 0.32, ease: EASE_OPEN }, opacity: { duration: 0.2, delay: 0.06, ease: EASE_OUT } } : { duration: 0 } }}
                  exit={{ height: 0, opacity: 0, transition: motionOk ? { height: { duration: 0.26, ease: EASE_IN_OUT }, opacity: { duration: 0.12 } } : { duration: 0 } }}
                >
                  <WhyCard
                    plan={plan}
                    items={items}
                    groups={groupRows}
                    headline={whyHead}
                    policies={tenantPolicies}
                    resolve={resolve}
                    person={personName ?? plan.conflicts?.personName ?? ''}
                    id={whyId}
                    titleRef={whyTitle}
                    interactive={interactive}
                    onClose={toggleWhy}
                    onOpenRule={onOpenRule}
                    onOpenPolicy={onOpenPolicy}
                    onAdd={onAdd}
                    onAsGroup={onAsGroup}
                    breakIn={whyBreakIn}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div ref={scroller} className="tj-scroll" onPointerMove={onPointerMove}>
      <section
        ref={stage}
        className={`tj-stage is-path-${path}${vertical ? ' is-vertical' : ''}${switching ? ' is-switching' : ''}${editing ? ' is-editing' : ''}${hoverable ? ' is-pointing' : ''}`}
        aria-label="Sign-in journey"
      >
        <JourneyWires
          stage={stage}
          plan={plan}
          s={s}
          show={show}
          hot={hot}
          animate={animate && motionOk}
          container={deciding?.node ?? null}
          from={from}
          layoutKey={layoutKey}
          orientation={orientation}
          onPad={setPad}
        />

        <motion.div className="tj-lane is-signin" data-col="sign-in" {...lane}>
          {!vertical && <p className="tj-lane__head">Sign-in</p>}
          <div className="tj-lane__body">
            {/* The node's slot: the fold fades it in as the card's copy
                settles onto it (plain, so nothing else owns its opacity). */}
            <div className="tj-sinslot">{start}</div>
            {editCard && <div className="tj-editcard">{editCard}</div>}
          </div>
        </motion.div>

        <motion.div className="tj-lane is-which" data-col="which" aria-hidden={show.which ? undefined : true} inert={editing || !show.which} {...lane}>
          {show.which && (
            <motion.div className="tj-lane__fade" {...fade}>
              {!vertical && <p className="tj-lane__head">Which policy</p>}
              <WhichCard appName={plan.appName}>
                {plan.policies.map((p) => (
                  <PolicyCard
                    key={p.policyId}
                    p={p}
                    phase={policyPhase(p, s)}
                    found={policyFound(p, s)}
                    sweepMs={p.scanAt !== null ? stepMs(plan, p.scanAt) : undefined}
                    lightMs={p.foundAt !== null ? stepMs(plan, p.foundAt) : undefined}
                    open={isOpen(p)}
                    interactive={interactive}
                    hoverable={hoverable}
                    onToggle={onToggle}
                    hot={hot === p.node}
                    active={active === p.node}
                    animate={motionOk}
                    onHover={setHot}
                    onOpenRule={onOpenRule}
                    body={
                      p.decides && decider ? (
                        <>
                          <div className="tj-pol__bar">
                            <span className="tj-pol__label">Rules</span>
                            {/* There from the start, unseen while the engine
                                works, so the bar does not grow as it lands. */}
                            {foldable && (
                              <button
                                type="button"
                                className={`tj-toggle${running ? ' is-waiting' : ''}`}
                                aria-expanded={showAll}
                                aria-hidden={running || undefined}
                                tabIndex={running ? -1 : undefined}
                                onClick={() => !running && onShowAll()}
                              >
                                {showAll ? 'Show less' : 'Show all checks'}
                              </button>
                            )}
                          </div>
                          <ol className="tj-rlist" aria-label={`Rules in ${decider.name}`}>
                            {plan.rules.map((r, i) => (
                              <RuleRow
                                key={r.id}
                                rule={r}
                                s={s}
                                showAll={showAll}
                                walked={walked(r)}
                                onward={i + 1 < plan.rules.length && walked(plan.rules[i + 1])}
                                interactive={interactive}
                                hoverable={hoverable}
                                hot={hot === r.node}
                                active={active === r.node}
                                animate={motionOk}
                                reduced={!motionOk}
                                onHover={setHot}
                                onOpen={openRuleOfDecider}
                                onAdd={onAdd}
                              />
                            ))}
                          </ol>
                        </>
                      ) : undefined
                    }
                  />
                ))}
              </WhichCard>
            </motion.div>
          )}
        </motion.div>

        <motion.div className="tj-lane is-outcome" data-col="outcome" aria-hidden={show.deciding ? undefined : true} inert={editing || !show.outcome} {...lane}>
          <motion.div
            className="tj-lane__pad"
            initial={false}
            animate={{ height: pad }}
            transition={{ duration: show.outcome && !running && motionOk ? 0.24 : 0, ease: [0.2, 0, 0, 1] }}
          />
          {/* The answer is there, unseen, from the step the wire starts to
              draw out to it — measured, so the wire ends where it will
              stand — and lands (its spring) as the wire arrives. No
              placeholder: a grey skeleton said nothing the wire does not. */}
          {show.deciding && (
            <motion.div
              className={`tj-out${show.outcome ? '' : ' is-waiting'}`}
              data-node="outcome"
              {...(active === 'outcome' ? { 'data-active': '' } : null)}
              aria-hidden={show.outcome ? undefined : true}
              initial={animate && motionOk ? OUT_AWAY : false}
              animate={show.outcome ? OUT_HERE : OUT_AWAY}
              transition={show.outcome && animate && motionOk ? OUT_SPRING : { duration: 0 }}
            >
              {!vertical && <p className="tj-lane__head">Outcome</p>}
              <Hero.Provider value={hero}>{outcome}</Hero.Provider>
            </motion.div>
          )}
        </motion.div>
      </section>
    </div>
  )
}

// --- The wires --------------------------------------------------------------------------------------

/* Where a wire meets a node, when not in its middle: the element marked
   `data-port` in it (a policy's head, a rule's head, the sign-in's person, the
   waiting answer's badge), or the answer's first line in the board's outcome
   node. The first one, so a policy is met at its head and not at a rule inside it. */
const PORT = '[data-port], .bb-outcome__in > :first-child'

/* Where every measured box is, against the stage, by offsets — not by
   `getBoundingClientRect`: the node arrives by a layout animation and the
   answer by a spring, and a wire that followed a transform would wobble as they
   land. A port is its element's middle, by offsets too. */
function measure(stage: HTMLElement): { boxes: Boxes; cols: Record<string, Box> } {
  const off = (el: HTMLElement): { x: number; y: number } | null => {
    let x = 0
    let y = 0
    let at: HTMLElement | null = el
    while (at && at !== stage) {
      x += at.offsetLeft
      y += at.offsetTop
      at = at.offsetParent as HTMLElement | null
    }
    return at === stage ? { x, y } : null
  }
  const boxes: Boxes = {}
  stage.querySelectorAll<HTMLElement>('[data-node]').forEach((el) => {
    const o = off(el)
    if (!o) return
    const box: Box = { x: o.x, y: o.y, w: el.offsetWidth, h: el.offsetHeight }
    const portEl = el.querySelector<HTMLElement>(PORT)
    const p = portEl ? off(portEl) : null
    if (portEl && p) box.port = Math.round(p.y - o.y + portEl.offsetHeight / 2)
    boxes[el.dataset.node as NodeId] = box
  })
  const cols: Record<string, Box> = {}
  stage.querySelectorAll<HTMLElement>('[data-col]').forEach((el) => {
    const o = off(el)
    if (o) cols[el.dataset.col!] = { x: o.x, y: o.y, w: el.offsetWidth, h: el.offsetHeight }
  })
  return { boxes, cols }
}

interface Geo {
  w: number
  h: number
  /** How far down the canvas shows the stage before its bottom padding: the scroller's client height, less the stage's own padding. */
  view: number
  boxes: Boxes
  cols: Record<string, Box>
  sig: string
}

/* The wires, drawn under the nodes in one SVG the size of the stage — its
   client size, so it can shrink as well as grow and never props the stage
   open (and clipped to the stage's box, for the frame it is a size behind).
   Measured after every step and whenever a part changes size (a policy
   opening, a rule folding), so no wire aims at a stale box.

     neutral   the sign-in to every policy
     lit       the sign-in to the policy that decides, drawn on as it lights;
               from the rule it stopped at out to the answer, as it lands

   Hovering a policy or a rule brightens its wire and steps the rest back
   (on the wire's group, `.tj-fan`: the path is motion's). */
function JourneyWires({
  stage,
  plan,
  s,
  show,
  hot,
  animate,
  container,
  from,
  layoutKey,
  orientation,
  onPad,
}: {
  stage: RefObject<HTMLElement | null>
  plan: EngineRun
  s: number
  show: Show
  hot: NodeId | null
  animate: boolean
  container: NodeId | null
  /** The rule the last wire leaves from, and the answer sits level with; the policy's head while it is closed. */
  from: NodeId | null
  /** Changes whenever something the wires aim at may have moved: a step, a policy opened by hand, Show all checks. */
  layoutKey: string
  orientation: Orientation
  onPad: (pad: number) => void
}) {
  const [geo, setGeo] = useState<Geo | null>(null)
  const ro = useRef<ResizeObserver | null>(null)

  const remeasure = useCallback(() => {
    const st = stage.current
    if (!st) return
    const { boxes, cols } = measure(st)
    const view = (st.parentElement?.clientHeight ?? 0) - (parseFloat(getComputedStyle(st).paddingBottom) || 0)
    const sig = `${st.clientWidth}x${st.clientHeight}/${view}|${boxesSig(boxes)}|${Object.entries(cols).map(([k, c]) => `${k}:${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.h)}`).join(';')}`
    setGeo((g) => (g?.sig === sig ? g : { w: st.clientWidth, h: st.clientHeight, view, boxes, cols, sig }))
  }, [stage])

  /* A part resizing — a policy opening, a rule folding, the answer's place
     growing — measures again, once a frame however many resize, and right
     there, in the observer's callback: the browser has just laid the frame
     out, so the offsets are read for free. Put off to the next frame, they
     were read after motion had written that frame's heights, and every read
     laid the stage out again. */
  const watch = useCallback(() => {
    const st = stage.current
    if (!st || !ro.current) return
    ro.current.observe(st)
    st.querySelectorAll<HTMLElement>('.tj-lane, .tj-which, .tj-pol, .tj-r').forEach((el) => ro.current?.observe(el))
  }, [stage])
  /* Created once the stage is there — on the first commit the stage's ref is
     set only after this component's own layout effect has run, so the first
     measure is here too: without it, the first run's spine waited for the
     second step to be drawn. */
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => remeasure())
    ro.current = observer
    watch()
    remeasure()
    return () => observer.disconnect()
  }, [remeasure, watch])

  /* When something may have moved (a step, a toggle — not every render: a
     hover moves nothing): measure before the frame is painted, so no wire
     is drawn to where a box was, and watch every part that is there now. */
  useLayoutEffect(() => {
    watch()
    remeasure()
  }, [layoutKey, plan, remeasure, watch])

  /* The lowest the answer's foot may hang: the policies' foot, or the
     canvas's as it shows (the stage's padding kept), whichever is lower. */
  const which = geo?.cols.which
  const floor = geo ? Math.max(which ? which.y + which.h : 0, geo.view) : Infinity
  /* In one column the answer stands under the policies: nothing to hang it level with. */
  const pad = geo && orientation === 'horizontal' ? outcomePad(geo.boxes, from, geo.cols.outcome?.y ?? 0, OUT_PORT, floor) : 0
  useEffect(() => onPad(pad), [pad, onPad])

  if (!geo) return null
  const wires = engineWires(geo.boxes, { policies: plan.policies, container, from }, orientation)
  const vertical = orientation === 'vertical'
  const decidesShown = s >= plan.at.decides && wires.toDecider !== null
  const hotPolicy = hot?.startsWith('policy:') ? hot : null
  const hotRule = hot?.startsWith('rule:') ? hot : null
  const deciderNode = plan.policies.find((p) => p.decides)?.node ?? null
  /* A wire draws on from where it starts — the sign-in, the rule — to
     where it goes: the fan decelerating out to the skeletons as they
     arrive, the lit way easing in and out. */
  const draw = (duration: number, ease: readonly [number, number, number, number], delay = 0) => ({
    initial: animate ? { pathLength: 0 } : false,
    animate: { pathLength: 1 },
    transition: { duration: animate ? duration : 0, delay: animate ? delay : 0, ease },
  })
  /* A hovered policy other than the one that decides, or a rule other than
     the one it stopped at, steps the lit way back. */
  const back = (hotPolicy !== null && hotPolicy !== deciderNode) || (hotRule !== null && hotRule !== from)

  return (
    <div className="tj-wirebox" aria-hidden>
      <svg className={`tj-wires${hot ? ' has-hot' : ''}`} width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden focusable="false">
        {show.which && wires.trunk && (
          <g className="tj-fan">
            <motion.path key="trunk" className="tj-wire" d={wires.trunk.d} {...draw(0.3, EASE_OUT)} />
          </g>
        )}
        {show.which &&
          wires.fan.map((f, i) => (
            <g key={`fan-${f.policyId}`} className={`tj-fan${hotPolicy === `policy:${f.policyId}` ? ' is-hot' : ''}`}>
              <motion.path className="tj-wire" d={f.d} {...draw(0.36, EASE_OUT, 0.06 + i * 0.05)} />
            </g>
          ))}
        {decidesShown && wires.toDecider && (
          <g className={`tj-lit${back ? ' is-back' : ''}`}>
            <motion.path key="to-decider" className="tj-route" d={wires.toDecider.d} {...draw(0.34, EASE_IN_OUT)} />
          </g>
        )}
        {show.deciding && wires.out && (
          <g className={`tj-lit${back ? ' is-back' : ''}${hotRule !== null && hotRule === from ? ' is-hot' : ''}`}>
            <motion.path key="out" className="tj-route" d={wires.out.d} {...draw(vertical ? 0.22 : 0.26, EASE_IN_OUT)} />
          </g>
        )}
      </svg>
    </div>
  )
}
