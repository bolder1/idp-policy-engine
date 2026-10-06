import { motion } from 'motion/react'

import { PartsLine } from './assistant/AnswerText'
import { citeNumbers, type Answer, type AnswerKind, type Target } from './assistant/intents'
import { COPILOT_NAME } from '../jarvis-mode/copilot-name'
import { Decode } from './jarvis-decode'

/* -----------------------------------------------------------------------------
   An answer in the Jarvis dock (JarvisLayout.tsx's `renderAnswer` for the
   shared AssistantDock): the HUD's answer card — a small kicker in the
   answer's tone (what kind of answer it is; "Preview · not run" for a
   what-if), the sentence with its numbered citations (hovered or focused,
   each lights its piece of the HUD through `onCite`), then the further lines
   with their marks. Every word is the shared answer's (assistant/intents.ts).
   -------------------------------------------------------------------------- */

const KICKER: Partial<Record<AnswerKind, string>> = {
  verdict: 'Verdict',
  why: 'Why',
  'why-rule': 'Rule',
  others: 'Other policies',
  gd: 'Global Default',
  depends: 'Depends',
  'what-if': 'What would change it',
  'what-if-value': 'Preview · not run',
  'sign-in': 'Preview · not run',
  off: 'Switched off',
  see: 'What they see',
  checks: 'Checks',
  group: 'Groups',
  'break-in': 'Break-in attempts',
  save: 'Save',
  policy: 'Policy',
  person: 'Sign-in',
  edit: 'Sign-in',
  replay: 'Replay',
  add: 'Sign-in',
  open: 'Builder',
}

const NO_NUMS = new Map<Target, number>()

export function JarvisAnswer({ a, animate, onCite }: { a: Answer; animate: boolean; onCite: (t: Target | null) => void }) {
  const kicker = KICKER[a.kind] ?? COPILOT_NAME
  const nums = citeNumbers(a)
  return (
    <div className={`jv1-ans is-${a.tone}${a.known ? '' : ' is-unknown'}`}>
      <p className="jv1-ans__kicker">
        <Decode text={kicker} play={animate} ms={300} />
      </p>
      <p className="jv1-ans__sentence">
        <PartsLine parts={a.sentence} nums={nums} animate={animate} onCite={onCite} />
      </p>
      {a.more && a.more.length > 0 && (
        <ul className="jv1-ans__more">
          {a.more.map((line, i) => (
            <motion.li key={i} initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.24, delay: animate ? 0.3 + i * 0.07 : 0 }}>
              <PartsLine parts={line} nums={NO_NUMS} animate={false} onCite={onCite} />
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}
