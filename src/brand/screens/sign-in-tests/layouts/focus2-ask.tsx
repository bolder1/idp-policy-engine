import { ArrowUpRight, Check, Copy, Eye, MessageCircleQuestion, PanelLeftClose, Pencil, Play, Plus, ShieldAlert, Square, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type KeyboardEvent, type MouseEvent } from 'react'

import { Tip } from '../../../kit'
import { PartsLine } from './assistant/AnswerText'
import { iconOf, type Action, type Answer, type Part, type SuggestionIcon, type Target } from './assistant/intents'
import { MuteToggle } from './assistant/voice'
import { FAQ_AT_REST, FOCUS2_ASK_RAIL, FOCUS2_ASK_W, FOCUS2_FLOOR_PAD, FOCUS2_SIDE_PAD, FOCUS2_TOP_PAD, copyText, noteOf, shownSentence, type FaqGroup, type FaqRow } from './focus2-faq'
/* The sentence's, the evidence's and the Stop / Mute buttons' own rules live here. Only AssistantDock imported it, and Focus v2
   no longer renders the dock, so on a fresh load of this lazy layout they were absent: a bare, unstyled citation. It comes BEFORE
   our own sheet so the overrides below are the later ones. */
import './assistant/assistant.css'
import './focus2-ask.css'

/* -----------------------------------------------------------------------------
   FOCUS v2 — THE ANSWERS PANEL (Focus2Layout.tsx; its questions are
   focus2-faq.ts, its rules focus2-ask.css).

   WHAT WAS WRONG. The canvas carried the assistant dock at its foot, and row 1
   of that dock is a free text field. A prototype cannot answer an arbitrary
   question, so the field promised what nothing behind it could keep — and the
   questions this run CAN answer were folded away behind it. There is no prop
   that removes the field (`AssistantDock.tsx` draws it whenever the narrator is
   not speaking, and opens itself on focus, on `/` and on the chevron), so the
   "pass the dock less" technique that removed the stepper and the zoom group
   does not reach it. Focus v2 therefore stops rendering the dock at all. The
   dock itself is untouched, exactly as Brief, Focus v1 and Jarvis use it.

   WHY THIS IS RIGHT. A column on the LEFT of the canvas, opposite the
   Configure panel, holding the questions the run can answer as presses —
   grouped in the order an admin thinks, each one an answer that already
   exists. No field, and no thread: one answer at a time, at the panel's head.

   WHAT WAS KEPT, because it is the part the owner has said he likes most:
   the sentence with its citations. The words arrive out of focus and sharpen
   one after another (`PartsLine` owns that, and it is Motion's, never a CSS
   transform), a citation hovered lights the matching thing on the canvas and
   brings its card to the centre, and a citation PRESSED pins it there. The
   voice is kept too — moved to the foot, which is where the subtitle has
   always been (the canvas's own bar since 5 Oct 2026, focus2-canvasbar.tsx),
   so the narrator stays stoppable and mutable in every state. Without that strip the dock's departure would take Voice on /
   off with it, which is a regression, not a trade.

   THREE THINGS ARE DELIBERATELY NOT HERE. The path rail: the canvas IS the
   path, and focus2-story.ts exists to stop one thing being drawn twice. The
   verdict block: the outcome card is the verdict. And numbers on the
   citations: the canvas has none to match, so a citation points by bringing
   its card to the centre — the same decision `FocusCaption` made.
   -------------------------------------------------------------------------- */

/** No superscripts: the canvas has no numbers for them to match. */
const NO_NUMS = new Map<Target, number>()

const ICON: Record<SuggestionIcon, typeof Play> = { question: MessageCircleQuestion, run: Play, open: ArrowUpRight, add: Plus, breakIn: ShieldAlert, show: Eye, edit: Pencil }

/** What the panel holds, by where the run has got to (the PRESENTED landing, never the engine's). */
export type AskState = 'empty' | 'playing' | 'landed'

/* The one line in the list's place while the run is still being told: the dock's own gate wording, shortened.
   Offering a question before the thing it is about is on screen is offering an answer to a picture the admin has
   not seen yet. */
const PLAYING_LINE = 'Questions come once the run lands.'

interface AnswerProps {
  answer: Answer
  /** The asked row's own label, the card's title: an answer that does not name its question reads as a loose paragraph. */
  question: string | null
  animate: boolean
  lit: Target | null
  speaking: boolean
  onCite: (t: Target | null) => void
  onPin: (t: Target) => void
  onAction: (a: Action) => void
  onStop: () => void
  onClear?: () => void
}

/* The citation a press pins. `PartsLine` is shared with Brief and Jarvis and has no onClick of its own, and
   `assistant/` is not ours to edit — but it does write `data-cite` and `tabIndex` on every citation span, so the
   press is delegated on the paragraph and reads the attribute the shared component already publishes.

   A citation with NO CARD: `momentKeyOf` returns null for a rule the engine never read, and a card is made per
   beat, so a rule after the landing has none. For those the phrase still underlines and the press does nothing
   visible — the answer's own "Open rule n" is the way there. Nothing fakes a card. */
const hit = (e: { target: EventTarget | null }): Target | undefined => (e.target instanceof HTMLElement ? (e.target.closest<HTMLElement>('[data-cite]')?.dataset.cite as Target | undefined) : undefined)

function Focus2Answer({ answer: raw, question, animate, lit, speaking, onCite, onPin, onAction, onStop, onClear }: AnswerProps) {
  const [copied, setCopied] = useState(false)
  /* A policy's name never takes 's, as the caption does it: "None of the 3 rules in AWS for engineering teams". The same
     function builds what Copy answer puts on the clipboard, so the two cannot say different things. */
  const sentence: Part[] = shownSentence(raw.sentence)
  const words = sentence.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0)
  const note = noteOf(raw)
  const pressCite = (e: MouseEvent) => {
    const t = hit(e)
    if (t) onPin(t)
  }
  const keyCite = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const t = hit(e)
    if (!t) return
    e.preventDefault()
    onPin(t)
  }
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(copyText(raw))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* No clipboard (a private window, an old browser): the words are on screen to read either way. */
    }
  }
  return (
    /* A card titled by its question (5 Oct). The wrapper is the one that moves, so the card keeps plain CSS. */
    <motion.div initial={animate ? { opacity: 0, y: 4 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }} className="rl-f2a__answrap">
    <div className={`ad-ans rl-f2a__ans is-${raw.tone}${raw.known ? '' : ' is-unknown'}`}>
      {(question !== null || onClear) && (
        <div className="rl-f2a__anshead">
          {question !== null && <h3 className="rl-f2a__ansq">{question}</h3>}
          {onClear && (
            <Tip text="Close" placement="bottom">
              <button type="button" className="rl-f2a__ansx" aria-label="Close the answer" onClick={onClear}>
                <X size={14} strokeWidth={2.2} aria-hidden />
              </button>
            </Tip>
          )}
        </div>
      )}
      {/* The press is delegated here, not bound on the citation: `PartsLine` is shared with Brief and Jarvis and
          gives the span its own tabIndex and data-cite, so this reads what it already publishes. */}
      <p className="ad-ans__sentence" onClick={pressCite} onKeyDown={keyCite}>
        {speaking && (
          <span className="rl-focus__wave rl-focus__capwave" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
        <PartsLine parts={sentence} nums={NO_NUMS} animate={animate} onCite={onCite} lit={lit} />
        {speaking && (
          <button type="button" className="rl-focus__substop rl-focus__capstop" aria-label="Stop the voice" title="Stop the voice" onClick={onStop}>
            <Square size={10} strokeWidth={2.4} fill="currentColor" aria-hidden />
          </button>
        )}
      </p>
      {/* The evidence, never truncated: truncating is how a fix loses its caution. */}
      {raw.more && raw.more.length > 0 && (
        <ul className="ad-ans__more">
          {raw.more.map((line, i) => (
            <motion.li key={i} initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: animate ? Math.min(1.2, words * 0.035) + i * 0.08 : 0 }}>
              <PartsLine parts={line} nums={NO_NUMS} animate={false} onCite={onCite} lit={lit} />
            </motion.li>
          ))}
        </ul>
      )}
      {note && <p className="rl-f2a__note">{note}</p>}
      <div className="rl-f2a__acts">
        {/* Break-in attempts moved to the canvas bar (focus2-canvasbar.tsx). */}
        {raw.actions.filter((a) => a.kind !== 'breakIn').map((a, i) => {
          const Icon = ICON[iconOf(a)]
          return (
            <button key={`${a.kind}:${a.label}`} type="button" className={`rl-f2a__act${i === 0 ? ' is-primary' : ''}`} onClick={() => onAction(a)}>
              <Icon size={13} strokeWidth={2.2} aria-hidden />
              {a.label}
            </button>
          )
        })}
        <span className="rl-f2a__actspace" />
        <Tip text={copied ? 'Copied' : 'Copy the answer'} placement="top">
          <button type="button" className="rl-f2a__copy" aria-label="Copy the answer" onClick={copy}>
            {copied ? <Check size={13} strokeWidth={2.4} aria-hidden /> : <Copy size={13} strokeWidth={2} aria-hidden />}
          </button>
        </Tip>
      </div>
    </div>
    </motion.div>
  )
}

interface GroupProps {
  group: FaqGroup
  asked: ReadonlySet<string>
  /** The row whose answer is on the head. */
  on: string | null
  onAsk: (row: FaqRow) => void
}

function Focus2Group({ group, asked, on, onAsk }: GroupProps) {
  /* Collapsed at rest, so the first paint is right with no effect: a static render holds every heading and the
     first two rows of each (focus2-ask.test.tsx asserts it). */
  const [all, setAll] = useState(false)
  const rows = all ? group.rows : group.rows.slice(0, FAQ_AT_REST)
  return (
    <section className="rl-f2a__grp">
      <h3 className="rl-f2a__gtitle">{group.title}</h3>
      {rows.map((r) => (
        <button
          key={r.id}
          type="button"
          /* An asked row is NOT removed — the dock removed them, and the ruling is the opposite. It is marked, and
             neutrally: blue is what the engine is reading, never what the admin is reading. */
          className={`rl-f2a__q${asked.has(r.id) ? ' is-asked' : ''}${on === r.id ? ' is-on' : ''}`}
          aria-current={on === r.id ? 'true' : undefined}
          onClick={() => onAsk(r)}
        >
          <span className="rl-f2a__qtext">{r.label}</span>
          {/* Marked, not removed: the tick says "you have read this one" without a colour of its own. */}
          {asked.has(r.id) && on !== r.id && <Check className="rl-f2a__tick" size={13} strokeWidth={2.4} aria-hidden />}
        </button>
      ))}
      {/* No counts, here or anywhere: numbers appear once per view, in the footer. */}
      {group.rows.length > FAQ_AT_REST && (
        <button type="button" className="rl-f2a__all" onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : 'Show all'}
        </button>
      )}
    </section>
  )
}

export interface Focus2AskProps {
  state: AskState
  groups: FaqGroup[]
  /** The answer on the head, or null: it does not exist until a question is pressed. */
  answer: Answer | null
  /** The `empty` answer's own sentence, drawn as the head before any run (one source, never retyped). */
  emptyLine: readonly Part[] | null
  /** Sharpen the words in: a just-arrived answer, motion allowed. */
  animate: boolean
  lit: Target | null
  speaking: boolean
  /** "Checked 2 policies · 1 rule · 4 checks" — the one place that number appears in Focus. */
  summary: string | null
  /** Every row asked on this run: marked, never removed. */
  asked: ReadonlySet<string>
  /** The row whose answer is on the head. */
  on: string | null
  /** Bumped by every press: the head's key, so a question asked again sharpens in again. */
  seq: number
  onAsk: (row: FaqRow) => void
  onCite: (t: Target | null) => void
  onPin: (t: Target) => void
  onAction: (a: Action) => void
  onStop: () => void
  onClose: () => void
  /** The X on the answer card: drops the answer back to the list. */
  onClear?: () => void
}

/** The panel, open: a fixed head, the list in its own scroller, the footer line. */
export function Focus2Ask({ state, groups, answer, emptyLine, animate, lit, speaking, summary, asked, on, seq, onAsk, onCite, onPin, onAction, onStop, onClose, onClear }: Focus2AskProps) {
  const question = on === null ? null : (groups.flatMap((g) => g.rows).find((r) => r.id === on)?.label ?? null)
  return (
    <aside className="rl-f2a" aria-label="Questions" style={{ top: FOCUS2_TOP_PAD, left: FOCUS2_SIDE_PAD, bottom: FOCUS2_FLOOR_PAD, width: FOCUS2_ASK_W }}>
      <div className="rl-f2a__head">
        <h2 className="rl-f2a__title">Questions</h2>
        <Tip text="Hide the questions" placement="bottom">
          <button type="button" className="rl-f2a__fold" aria-label="Hide the questions" onClick={onClose}>
            <PanelLeftClose size={15} strokeWidth={2} aria-hidden />
          </button>
        </Tip>
      </div>
      {answer ? (
        <Focus2Answer key={seq} answer={answer} question={question} onClear={onClear} animate={animate} lit={lit} speaking={speaking} onCite={onCite} onPin={onPin} onAction={onAction} onStop={onStop} />
      ) : (
        /* Before a run: the `empty` answer's own words. Never a verdict — the outcome card is the verdict, and
           drawing it twice is the mistake focus2-story.ts exists to avoid. */
        emptyLine && <p className="rl-f2a__quiet">{emptyLine.map((p) => p.text).join('')}</p>
      )}
      <div className="rl-f2a__list">
        {state === 'playing' ? <p className="rl-f2a__quiet">{PLAYING_LINE}</p> : groups.map((g) => <Focus2Group key={g.key} group={g} asked={asked} on={on} onAsk={onAsk} />)}
      </div>
      {summary && <p className="rl-f2a__foot">{summary}</p>}
    </aside>
  )
}

/** The panel, shut: 36 px of rail that takes its room, so a receded card can never slide under it. Not drawn since
    5 Oct 2026 — the toggle moved into the sign-in row ("move the question button with the top bar") — and kept. */
export function Focus2AskRail({ onOpen }: { onOpen: () => void }) {
  return (
    <aside className="rl-f2a-rail" style={{ top: FOCUS2_TOP_PAD, left: FOCUS2_SIDE_PAD, bottom: FOCUS2_FLOOR_PAD, width: FOCUS2_ASK_RAIL }}>
      <button type="button" className="rl-f2a-rail__btn" aria-label="Show the questions" title="Show the questions" onClick={onOpen}>
        <MessageCircleQuestion size={15} strokeWidth={2} aria-hidden />
        <span className="rl-f2a-rail__word">Questions</span>
      </button>
    </aside>
  )
}

export interface Focus2VoiceProps {
  /** The line being said, or null. Suppressed while the answer on the head is the thing being said: its waveform rides there. */
  line: string | null
  muted: boolean
  onMuted: (muted: boolean) => void
  onStop: () => void
  /** Drawn inside the bar under the open card, in the flow, rather than as a strip of its own at the foot. */
  inline?: boolean
}

/**
 * The voice strip: one line, the waveform, the words being said and Stop, then Voice on / off. It never grows, never
 * opens and has no field. Focus draws its voice in the canvas's own bar now (focus2-canvasbar.tsx, 5 Oct 2026: the
 * bare subtitle strip it kept at the foot is retired); this is the voice inside the bar under the card, behind
 * Focus2Layout's TRAIL_BAR.
 */
export function Focus2Voice({ line, muted, onMuted, onStop, inline = false }: Focus2VoiceProps) {
  return (
    <div className={`rl-f2a-voice${inline ? ' is-inline' : ''}`} style={inline ? undefined : { bottom: FOCUS2_SIDE_PAD }}>
      {line && (
        <div className="rl-f2a-voice__said" role="status" aria-live="off">
          <span className="rl-focus__wave" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="rl-f2a-voice__line">{line}</span>
          <Tip text="Stop" placement="top">
            <button type="button" className="ad-btn" aria-label="Stop the voice" onClick={onStop}>
              <Square size={12} strokeWidth={2.4} fill="currentColor" aria-hidden />
            </button>
          </Tip>
        </div>
      )}
      <span className="rl-f2a-voice__space" />
      <MuteToggle muted={muted} onChange={onMuted} />
    </div>
  )
}
