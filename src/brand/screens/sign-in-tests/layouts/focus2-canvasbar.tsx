import { ArrowLeft, ChevronsDownUp, ShieldAlert, ChevronsUpDown, Columns3, MessageCircleQuestion, PanelRight, Rows3, Square, TextQuote, Volume2, VolumeX, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { foldAllWord } from './classic2-model'
import { EASE_OUT } from './focus-shared'
import type { FocusView } from './focus2-view'
import './focus2-canvasbar.css'

/* -----------------------------------------------------------------------------
   THE CANVAS'S OWN BAR, AT ITS FOOT (owner, 5 Oct 2026, pointing at the top row
   holding Voice, Cards, Brief and Questions: "the mute button, the view buttons
   and Questions can be a separate bar in the bottom, as a function and view
   change, as we used to have — so segregate both: one for the form, one for the
   canvas functions").

   The sign-in row on top is the form (Who → App | facts | state | pencil |
   Replay). This is everything that changes the canvas, one line, 40 tall.

   TWO VIEWS AND TWO FUNCTIONS (owner, the same day: "Brief and Questions are two
   functions, and I want 2 views … so 2 views and 2 functions. Remove the audio
   part completely, no use"):

     [← Back |] [▤ Vertical | ▥ Horizontal] | [❝ Brief] [? Questions] | [⇕ Expand all]

   the pair      Vertical and Horizontal (focus2-view.ts): one segmented pair,
                 one always pressed — the console's own view switch, its pressed
                 side raised and greyscale. Horizontal pressed again over the
                 cards one at a time goes back to the route.
   Brief         the sentence over either view; a toggle.
   Questions     the panel's toggle (the panel's own "Hide the questions" stays
                 in its head).
   Expand all    every card on the canvas opened, or "Collapse all" while any
                 is open: Classic v2's dock button, here at the bar's end (owner,
                 5 Oct 2026: "move the Expand all button to the bottom bar"). A
                 press, not a toggle: it is never drawn pressed.
   Back          only while the cards one at a time are showing over the
                 horizontal view, which is not a view of its own (owner: "we
                 don't call it a dedicated view … I must be able to go back") —
                 the route's, behind Focus2Layout's ROUTE_MAP.

   Overview, Cards and the voice went from here. The voice — the line being said,
   Stop, Voice on / off — is drawn only when it is handed (Focus2Layout's
   FOCUS_VOICE), so it can come back as it was.

   Pressed toggles are the row's pressed look (the stage's blue on its soft blue),
   never orange. It never wraps: under ~900 px of canvas the words go and the
   icons keep their names (title, aria-label) — or, holding only its functions,
   under a 360 px lane (CANVASBAR_FNS_LANE).
   -------------------------------------------------------------------------- */

/** Under this much canvas the bar's words go and its icons stay — and under this much lane beside the questions panel,
    where the bar with a line being said would no longer fit with its words. */
export const CANVASBAR_NARROW = 900
export const CANVASBAR_LANE = 760
/** The lane the bar keeps its words in when it holds only the functions — Break-in attempts, Brief, Questions, Expand all
    (Details too, behind DETAILS_IN_BAR); no pair, no voice, no Back. Measured 578 wide with Details and its words at 1440
    (6 Oct 2026), so about 490 without it, and a step of air either side. */
export const CANVASBAR_FNS_LANE = 530
/** The bar's own height (`--space-10`), for the room the view keeps clear under its cards. */
export const CANVASBAR_H = 40
/** The line being said: at most this wide, then it ellipses — narrower in a tight lane. */
const SAID_MAX = 280
const SAID_TIGHT = 180

export interface Focus2CanvasBarProps {
  view: FocusView
  /** A press on either side of the pair (Focus2Layout decides what it does: the other view, or back to the route). */
  onView: (v: FocusView) => void
  /** Draw the Vertical | Horizontal pair. Off while Focus has one view (HORIZONTAL_VIEW, 5 Oct 2026). */
  pair?: boolean
  brief: boolean
  onBrief: () => void
  questions: { open: boolean; onToggle: () => void }
  /** The cards' fold-all: whether any is open (the button says what it will do), whether there is a card to fold, the press. */
  fold?: { any: boolean; can: boolean; onPress: () => void } | null
  /** Break-in attempts on the application, once the run has landed: a prominent press that opens the attempts panel at the right. Null where there are none (the builder). `holes`: some got through, so it is drawn as a warning. */
  breakIn?: { holes: boolean; onPress: () => void } | null
  /** Details, once the run has landed: the policy that decided — or the application, when none did — in the page's
      right-hand panel, where every name on the run can be read without leaving (inspect-model.ts). A place, not a toggle. */
  details?: { onPress: () => void } | null
  /** The cards one at a time are showing over the horizontal view: Back returns to the route. Null on a view itself. */
  onBack: (() => void) | null
  /** How long Back waits before it opens (s): the cards' own wait on their way into the carousel, so it opens as they
      travel rather than before them, and never in the press's own heavy frame. */
  backAfter: number
  /** The voice, drawn only when handed (Focus2Layout's FOCUS_VOICE). */
  voice?: { line: string | null; muted: boolean; onMuted: (muted: boolean) => void; onStop: () => void } | null
  /** The canvas is narrow: icons only. */
  narrow: boolean
  /** The lane beside the questions panel is tight: the line being said is shorter. */
  tight: boolean
  reduced: boolean
  /** Where it stands in the stage: the room the questions panel leaves, the foot's inset. */
  left: number
  right: number
  bottom: number
}

interface ViewSide {
  key: FocusView
  icon: LucideIcon
  word: string
}

const SIDES: readonly ViewSide[] = [
  { key: 'vertical', icon: Rows3, word: 'Vertical' },
  { key: 'horizontal', icon: Columns3, word: 'Horizontal' },
]

export function Focus2CanvasBar({ view, onView, pair = true, breakIn = null, details = null, brief, onBrief, questions, fold = null, onBack, backAfter, voice, narrow, tight, reduced, left, right, bottom }: Focus2CanvasBarProps) {
  const said = voice?.line ?? null
  const move = { duration: reduced ? 0 : 0.24, ease: EASE_OUT }
  return (
    <div className="f2cb-dock" style={{ left, right, bottom }}>
      <div className={`f2cb${narrow ? ' is-narrow' : ''}`} role="toolbar" aria-label="Canvas">
        {/* Back, at the bar's left, only over the cards one at a time: it opens out of the bar's edge as they travel in,
            and folds back at once when it is pressed. */}
        <AnimatePresence initial={false}>
          {onBack && (
            <motion.span
              key="back"
              className="f2cb__backwrap"
              initial={reduced ? false : { opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, width: 0, transition: move }}
              transition={{ ...move, delay: reduced ? 0 : backAfter }}
            >
              <button type="button" className="f2cb__btn f2cb__back" aria-label="Back to the horizontal view" title="Back to the horizontal view" onClick={onBack}>
                <ArrowLeft size={15} strokeWidth={2} aria-hidden />
                {!narrow && 'Back'}
              </button>
              <span className="f2cb__div" aria-hidden />
            </motion.span>
          )}
        </AnimatePresence>
        {/* Break-in attempts, first and prominent (owner, 5 Oct 2026: "move the break-in button to the bottom bar and make it
            prominent; on click open the right side tab"): it opens the attempts panel, which is a place, not a toggle. */}
        {breakIn && (
          <>
            <button
              type="button"
              className={`f2cb__btn f2cb__break${breakIn.holes ? ' is-holes' : ''}`}
              data-fn="break-in"
              aria-label={narrow ? 'Break-in attempts' : undefined}
              title="Review break-in attempts"
              onClick={breakIn.onPress}
            >
              <ShieldAlert size={15} strokeWidth={2.2} aria-hidden />
              {!narrow && 'Break-in attempts'}
            </button>
            <span className="f2cb__div" aria-hidden />
          </>
        )}
        {/* One always pressed. Over the cards one at a time Horizontal stays pressed: they are not a view. Not drawn
            while Focus has one view (HORIZONTAL_VIEW off, 5 Oct 2026). */}
        {pair && (
        <>
        <span className="f2cb__pair" role="group" aria-label="View">
          {SIDES.map((v) => {
            const Icon = v.icon
            const on = view === v.key
            const title = !on ? `Show the ${v.word.toLowerCase()} view` : onBack && v.key === 'horizontal' ? 'Back to the horizontal view' : `${v.word} view`
            return (
              <button
                key={v.key}
                type="button"
                className={`f2cb__btn f2cb__side${on ? ' is-on' : ''}`}
                data-view={v.key}
                aria-label={narrow ? v.word : undefined}
                aria-pressed={on}
                title={title}
                onClick={() => onView(v.key)}
              >
                <Icon size={15} strokeWidth={2} aria-hidden />
                {!narrow && v.word}
              </button>
            )
          })}
        </span>
        <span className="f2cb__div" aria-hidden />
        </>
        )}
        <button type="button" className={`f2cb__btn f2cb__fn${brief ? ' is-on' : ''}`} data-fn="brief" aria-label={narrow ? 'Brief' : undefined} aria-pressed={brief} title={brief ? 'Hide the brief' : 'Show the brief'} onClick={onBrief}>
          <TextQuote size={15} strokeWidth={2} aria-hidden />
          {!narrow && 'Brief'}
        </button>
        <button type="button" className={`f2cb__btn f2cb__fn f2cb__q${questions.open ? ' is-on' : ''}`} data-fn="questions" aria-label={narrow ? 'Questions' : undefined} aria-pressed={questions.open} title={questions.open ? 'Hide the questions' : 'Show the questions'} onClick={questions.onToggle}>
          <MessageCircleQuestion size={15} strokeWidth={2} aria-hidden />
          {!narrow && 'Questions'}
        </button>
        {details && (
          <button type="button" className="f2cb__btn f2cb__fn" data-fn="details" aria-label={narrow ? 'Details' : undefined} title="Policy and rule details" onClick={details.onPress}>
            <PanelRight size={15} strokeWidth={2} aria-hidden />
            {!narrow && 'Details'}
          </button>
        )}
        {fold && (
          <>
            <span className="f2cb__div" aria-hidden />
            <button
              type="button"
              className="f2cb__btn f2cb__fn f2cb__fold"
              data-fn="fold"
              aria-label={narrow ? foldAllWord(fold.any) : undefined}
              aria-disabled={fold.can ? undefined : true}
              title={fold.any ? 'Fold every card' : 'Open every card'}
              onClick={() => fold.can && fold.onPress()}
            >
              {fold.any ? <ChevronsDownUp size={15} strokeWidth={2} aria-hidden /> : <ChevronsUpDown size={15} strokeWidth={2} aria-hidden />}
              {/* Its two words take the room of the longer, so the bar never shifts as they change. */}
              {!narrow && (
                <span className="f2cb__words">
                  <span>{foldAllWord(fold.any)}</span>
                  <span className="f2cb__ghost" aria-hidden>
                    {foldAllWord(!fold.any)}
                  </span>
                </span>
              )}
            </button>
          </>
        )}
        {/* The voice, when handed: what is being said while it is said, then on / off, always. */}
        {voice && (
          <>
            <span className="f2cb__div" aria-hidden />
            <AnimatePresence initial={false}>
              {said && (
                <motion.span
                  key="said"
                  className="f2cb__said"
                  role="status"
                  aria-live="off"
                  initial={reduced ? false : { opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, width: 0 }}
                  transition={move}
                >
                  <span className="rl-focus__wave f2cb__wave" aria-hidden>
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="f2cb__line" style={{ maxWidth: tight ? SAID_TIGHT : SAID_MAX }}>
                    {said}
                  </span>
                  <button type="button" className="f2cb__btn f2cb__stop" aria-label="Stop the voice" title="Stop" onClick={voice.onStop}>
                    <Square size={11} strokeWidth={2.4} fill="currentColor" aria-hidden />
                  </button>
                </motion.span>
              )}
            </AnimatePresence>
            <button
              type="button"
              className={`f2cb__btn f2cb__voice${voice.muted ? '' : ' is-on'}`}
              aria-label="Voice"
              aria-pressed={!voice.muted}
              title={voice.muted ? 'Voice off · turn it on' : 'Voice on · turn it off'}
              onClick={() => voice.onMuted(!voice.muted)}
            >
              {voice.muted ? <VolumeX size={15} strokeWidth={2} aria-hidden /> : <Volume2 size={15} strokeWidth={2} aria-hidden />}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
