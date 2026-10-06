import { AnimatePresence, motion } from 'motion/react'

import { COPILOT_NAME } from '../jarvis-mode/copilot-name'
import { CX } from './jarvis1-geometry'

/* -----------------------------------------------------------------------------
   The companion's PRESENCE (owner, 3 Oct 2026: a companion-type experience
   for the access copilot): her presence is the two rings round the ENGINE's
   core, drawn on the circle's presence layer (jarvis1-hub.tsx, the jv1-pr
   classes). For one day they ringed the person's orb instead, while the
   circle was the sign-in; the owner took the sign-in back out of it on
   4 Oct 2026, and the core they light is the engine's again. One mark, one
   home (Copilot web's lit mic, ChatGPT's orb — jarvis/MOBBIN.md §1–2), its
   motion the state, one word for it on the nameplate under the ring
   (jarvis/COMPANION.md §1; the word's precedence is JarvisLayout's):

     listening  rings close IN on the core                         "Listening"
     acting     one pulse out, then still, until the act lands     "Running" / "Opening"
     thinking   one arc turns round the core                       "Reading your question"
     working    the engine's own sweep (the Ring draws it)         "Checking"
     speaking   rings breathe OUT from the core                    "Speaking"
     greeting   rings breathe OUT; its line under the name         —
     idle       the core breathes (landed: in the answer's tone)   — the name alone

   Colour is meaning: every state is the engine's ember orange (--jv-work, the
   colour of what is active); the answer's tone is the only other colour the
   core takes, at landed idle. Only CSS
   animates the rings (transform and opacity on elements motion never
   touches); under reduced motion nothing loops and the word does the work.
   -------------------------------------------------------------------------- */

export type Presence = 'listening' | 'acting' | 'thinking' | 'working' | 'speaking' | 'greeting' | 'idle'

const WORD: Record<Presence, string | null> = {
  listening: 'Listening',
  acting: 'Running',
  thinking: 'Reading your question',
  working: 'Checking',
  speaking: 'Speaking',
  greeting: null,
  idle: null,
}

const NAMEPLATE_W = 248

/** The nameplate under the ring: the copilot's name, its state in a word (an act names itself: "Running",
    "Opening"), and the line it greets with while it greets. Hidden where the dock leaves it no room: the
    mark in the ask field and the live region still carry the state. */
export function Nameplate({ state, top, greeting, act = null, hidden = false, animate }: { state: Presence; top: number; greeting: string | null; act?: string | null; hidden?: boolean; animate: boolean }) {
  const word = state === 'acting' ? (act ?? WORD.acting) : WORD[state]
  /* Said to a screen reader: that it listens, the greeting, an act — never the run's own chatter. */
  const told = state === 'listening' ? `${COPILOT_NAME} is listening` : state === 'acting' ? word : state === 'greeting' ? greeting : null
  return (
    <div className="jv1-np" data-state={state} data-hidden={hidden || undefined} style={{ left: CX - NAMEPLATE_W / 2, top, width: NAMEPLATE_W }}>
      <p className="jv1-np__head" aria-hidden>
        <span className="jv1-np__name">{COPILOT_NAME}</span>
        {word && (
          <span className="jv1-np__state">
            <span className="jv1-np__sig">
              <i />
              <i />
              <i />
            </span>
            {word}
          </span>
        )}
      </p>
      <AnimatePresence initial={false}>
        {greeting && (
          <motion.p
            key="hello"
            className="jv1-np__line"
            aria-hidden
            initial={animate ? { opacity: 0, filter: 'blur(4px)' } : false}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={animate ? { opacity: 0, transition: { duration: 0.3 } } : undefined}
            transition={{ duration: 0.5 }}
          >
            {greeting}
          </motion.p>
        )}
      </AnimatePresence>
      <p className="rl-jarvis__sr" role="status" aria-live="polite">
        {told ?? ''}
      </p>
    </div>
  )
}

/** The presence at its smallest, at the head of the ask field: the reactor mark, moving with the state. */
export function CopilotMark({ state }: { state: Presence }) {
  return (
    <svg className="ad__lead jv1-mark" data-state={state} viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <circle className="jv1-mark__outer" cx="12" cy="12" r="9.5" />
      <circle className="jv1-mark__inner" cx="12" cy="12" r="5.5" />
      <circle className="jv1-mark__core" cx="12" cy="12" r="2.4" />
    </svg>
  )
}
