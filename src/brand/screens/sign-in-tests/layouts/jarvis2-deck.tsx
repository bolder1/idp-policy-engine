import { motion } from 'motion/react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, Ref } from 'react'
import { Check, CircleHelp, CornerDownLeft, Maximize, Mic, Minus, Plus, Volume2, VolumeX, X } from 'lucide-react'

import { Tip } from '../../../kit'
import { Decode, Typed } from './jarvis2-decode'
import type { Answer, Chip } from './jarvis-intents'

/* -----------------------------------------------------------------------------
   The COMMAND DECK (JarvisLayout.tsx), at the canvas's foot, outside the
   zoomed world: the narrator's waveform and subtitle, the assistant's
   suggestions as bracketed HUD keys, the ask bar as a "›" command line with
   the mic, and the dock — voice, fit, zoom out and in — as round bezel
   buttons. An answer opens over it, in the HUD's glass.
   -------------------------------------------------------------------------- */

export interface DeckProps {
  /** Where each row sits, px from the canvas's top (jarvis-geometry.ts `deck`), and the canvas's height. */
  at: { say: number; chips: number; ask: number }
  compact: boolean
  /** The subtitle: what has been said this run, the last line the one being said. */
  said: { text: string; n: number }[]
  speaking: boolean
  voiceOn: boolean
  onVoice: () => void
  reduced: boolean
  chips: Chip[]
  chipOn: string | null
  onChip: (c: Chip) => void
  text: string
  onText: (t: string) => void
  onSubmit: (e: FormEvent) => void
  onKey: (e: ReactKeyboardEvent<HTMLInputElement>) => void
  placeholder: string
  disabled: boolean
  hasMic: boolean
  listening: boolean
  onMic: () => void
  working: boolean
  inputRef: Ref<HTMLInputElement>
  zoom: number
  zoomMin: number
  zoomMax: number
  onFit: () => void
  onZoom: (dir: -1 | 1) => void
  answer: Answer | null
  answerKey: string
  onCloseAnswer: () => void
}

const BARS = Array.from({ length: 14 }, (_, i) => i)

export function Deck(p: DeckProps) {
  const last = p.said[p.said.length - 1]
  /* The line before stays while both fit on the one line. */
  const prev = p.said.length > 1 ? p.said[p.said.length - 2] : null
  const before = prev && last && prev.text.length + last.text.length <= 118 ? prev : null
  return (
    <div className={`jv2-deck${p.compact ? ' is-compact' : ''}`}>
      {p.answer && (
        <div className="jv2-answer-slot" style={{ top: p.at.say - 8 }}>
          <AnswerCard key={p.answerKey} a={p.answer} play={!p.reduced} onClose={p.onCloseAnswer} />
        </div>
      )}
      <p className={`jv2-say${p.speaking && p.voiceOn ? ' is-speaking' : ''}`} style={{ top: p.at.say }} aria-hidden={!last || undefined} hidden={p.answer !== null || undefined}>
        {last && (
          <>
            <span className="jv2-wave" aria-hidden>
              {BARS.map((i) => (
                <i key={i} style={{ animationDelay: `${(i * 97) % 700}ms` }} />
              ))}
            </span>
            <span className="jv2-say__t">
              {before && <span className="jv2-say__was">{before.text} </span>}
              <span className="jv2-say__now">
                <Typed key={last.n} text={last.text} play={!p.reduced} />
              </span>
            </span>
          </>
        )}
      </p>
      {p.chips.length > 0 && (
        <div className="jv2-keys" style={{ top: p.at.chips }} role="group" aria-label="Ask about this sign-in">
          {p.chips.map((c, i) => (
            <motion.button
              key={c.key}
              type="button"
              className={`jv2-key${p.chipOn === c.key ? ' is-on' : ''}`}
              initial={p.reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: p.reduced ? 0 : 0.24, delay: p.reduced ? 0 : 0.45 + i * 0.04 }}
              onClick={() => p.onChip(c)}
            >
              {c.label}
            </motion.button>
          ))}
        </div>
      )}
      <div className="jv2-cmd" style={{ top: p.at.ask }}>
        <form className={`jv2-ask${p.listening ? ' is-listening' : ''}${p.working ? ' is-working' : ''}`} onSubmit={p.onSubmit} role="search">
          <span className="jv2-ask__p" aria-hidden>
            ›
          </span>
          <input ref={p.inputRef} className="jv2-ask__in" type="text" value={p.text} placeholder={p.placeholder} aria-label="Ask about this sign-in" onChange={(e) => p.onText(e.target.value)} onKeyDown={p.onKey} disabled={p.disabled} />
          {p.hasMic && (
            <button type="button" className={`jv2-ask__mic${p.listening ? ' is-on' : ''}`} aria-label={p.listening ? 'Stop listening' : 'Ask by voice'} aria-pressed={p.listening} onClick={p.onMic} disabled={p.disabled}>
              <Mic size={16} strokeWidth={2} aria-hidden />
            </button>
          )}
          <button type="submit" className="jv2-ask__go" aria-label="Ask" disabled={!p.text.trim()}>
            <CornerDownLeft size={15} strokeWidth={2} aria-hidden />
          </button>
        </form>
        <div className="jv2-dock" role="toolbar" aria-label="View">
          <Tip text={p.voiceOn ? 'Mute the voice' : 'Turn the voice on'} placement="top">
            <button type="button" className={`jv2-bezel-btn${p.voiceOn ? ' is-on' : ''}`} aria-label="Voice" aria-pressed={p.voiceOn} onClick={p.onVoice}>
              {p.voiceOn ? <Volume2 size={16} strokeWidth={2} aria-hidden /> : <VolumeX size={16} strokeWidth={2} aria-hidden />}
            </button>
          </Tip>
          <Tip text="Fit to view" placement="top">
            <button type="button" className="jv2-bezel-btn" aria-label="Fit to view" onClick={p.onFit}>
              <Maximize size={15} strokeWidth={2} aria-hidden />
            </button>
          </Tip>
          <Tip text="Zoom out" placement="top">
            <button type="button" className="jv2-bezel-btn" aria-label="Zoom out" disabled={p.zoom <= p.zoomMin} onClick={() => p.onZoom(-1)}>
              <Minus size={16} strokeWidth={2} aria-hidden />
            </button>
          </Tip>
          <Tip text="Zoom in" placement="top">
            <button type="button" className="jv2-bezel-btn" aria-label="Zoom in" disabled={p.zoom >= p.zoomMax} onClick={() => p.onZoom(1)}>
              <Plus size={16} strokeWidth={2} aria-hidden />
            </button>
          </Tip>
        </div>
      </div>
    </div>
  )
}

function AnswerCard({ a, play, onClose }: { a: Answer; play: boolean; onClose: () => void }) {
  return (
    <motion.section
      className={`jv2-answer is-${a.tone}`}
      role="status"
      aria-label={a.title}
      initial={play ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: play ? 0.24 : 0, ease: [0.2, 0, 0, 1] }}
    >
      <header className="jv2-answer__h">
        <span className="jv2-answer__t">
          <Decode text={a.title} play={play} ms={340} />
        </span>
        <button type="button" className="jv2-x" aria-label="Close the answer" onClick={onClose}>
          <X size={13} strokeWidth={2.2} aria-hidden />
        </button>
      </header>
      <ul className="jv2-answer__lines">
        {a.lines.map((l, i) => (
          <li key={`${i}:${l.text}`} className={l.tone ? `is-${l.tone}` : undefined}>
            <span className="jv2-answer__text">
              {l.text}
              {l.sub && <small>{l.sub}</small>}
            </span>
            {l.mark === 'pass' && <Check size={13} strokeWidth={2.6} className="m-pass" aria-label="Passed" />}
            {l.mark === 'fail' && <X size={13} strokeWidth={2.6} className="m-fail" aria-label="Failed" />}
            {l.mark === 'unknown' && <CircleHelp size={13} strokeWidth={2.4} className="m-unknown" aria-label="Can't tell" />}
          </li>
        ))}
      </ul>
    </motion.section>
  )
}
