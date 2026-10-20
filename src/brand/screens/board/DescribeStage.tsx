import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronRight } from 'lucide-react'

import { WORKING, readMs, type StepLine } from './describe-stage'

/* The pieces Describe it's play draws (describe-stage.ts has the beats and the hook). */
const EASE = [0.2, 0, 0, 1] as const

/* Words that come into focus one after another (Questions' answer, AnswerText.tsx). */
export function BlurWords({ text, animate, delay = 0, per = 0.04 }: { text: string; animate: boolean; delay?: number; per?: number }) {
  if (!animate) return <>{text}</>
  let w = 0
  return (
    <>
      {text.split(/(\s+)/).map((bit, i) =>
        bit.trim() === '' ? (
          bit
        ) : (
          <motion.span
            key={i}
            className="bdst__w"
            initial={{ opacity: 0, filter: 'blur(5px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.32, delay: delay + w++ * per, ease: EASE }}
          >
            {bit}
          </motion.span>
        ),
      )}
    </>
  )
}

/* The message being read: each word lifts from faint to full, left to right, over the reading beat. */
export function ReadingWords({ text }: { text: string }) {
  const words = text.split(/(\s+)/)
  const count = Math.max(1, words.filter((b) => b.trim() !== '').length)
  const per = readMs(text) / 1000 / (count + 1)
  let w = 0
  return (
    <>
      {words.map((bit, i) =>
        bit.trim() === '' ? (
          bit
        ) : (
          <motion.span key={i} className="bdst__w" initial={{ opacity: 0.32 }} animate={{ opacity: 1 }} transition={{ duration: 0.28, delay: w++ * per, ease: EASE }}>
            {bit}
          </motion.span>
        ),
      )}
    </>
  )
}

function Mark({ state }: { state: 'done' | 'working' | 'waiting' }) {
  if (state === 'done')
    return (
      <motion.span className="bdst__mark is-done" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}>
        <Check size={11} strokeWidth={3} aria-hidden />
      </motion.span>
    )
  return <span className={`bdst__mark is-${state}`} aria-hidden />
}

/* The working list: every line of the turn, those not reached yet faint, the current one spinning. */
export function WorkLog({ lines, step, reading }: { lines: StepLine[]; step: number; reading?: boolean }) {
  const total = lines.length + 1
  const at = Math.min(step + 1, total)
  return (
    <div className="bdst" role="status" aria-live="polite">
      <p className="bdst__head">
        <span className="bdst__shimmer">{reading ? 'Reading your message' : 'Building the policy'}</span>
        {!reading && (
          <span className="bdst__count" aria-hidden>
            {at}/{total}
          </span>
        )}
      </p>
      {!reading && (
        <ol className="bdst__list">
          {[...lines.map((l) => ({ id: l.key as string, working: WORKING[l.key], done: <DoneText label={l.label} found={l.found} animate /> })), { id: 'canvas', working: 'Updating the canvas', done: <>Updated the canvas</> }].map(
            (l, i) => {
              const state = i < step ? 'done' : i === step ? 'working' : 'waiting'
              return (
                <motion.li key={l.id} className={`bdst__line is-${state}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: i * 0.05, ease: EASE }}>
                  <Mark state={state} />
                  <span className="bdst__text">{state === 'done' ? l.done : <span className={state === 'working' ? 'bdst__shimmer' : ''}>{l.working}</span>}</span>
                </motion.li>
              )
            },
          )}
        </ol>
      )}
    </div>
  )
}

/* A done line: the row's label, then what was found — which comes into focus word by word as the line turns done. */
function DoneText({ label, found, animate = false }: { label: string; found: string; animate?: boolean }) {
  return (
    <>
      <span className="bdst__label">{label}</span>{' '}
      <span className="bdst__found">
        <BlurWords text={found} animate={animate} delay={0.05} />
      </span>
    </>
  )
}

/* A finished turn's list, folded to one line that opens again. */
export function DoneLog({ lines, open, onToggle, animate }: { lines: StepLine[]; open: boolean; onToggle: () => void; animate: boolean }) {
  return (
    <div className="bdst is-done">
      <button type="button" className="bdst__fold" aria-expanded={open} onClick={onToggle}>
        <motion.span className="bdst__chev" animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.18, ease: EASE }}>
          <ChevronRight size={13} strokeWidth={2.2} aria-hidden />
        </motion.span>
        <span>Understood</span>
        <span className="bdst__count">
          {lines.length + 1} steps
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            key="list"
            className="bdst__list"
            initial={animate ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            {lines.map((l) => (
              <li key={l.key} className="bdst__line is-done">
                <span className="bdst__mark is-done">
                  <Check size={11} strokeWidth={3} aria-hidden />
                </span>
                <span className="bdst__text">
                  <DoneText label={l.label} found={l.found} />
                </span>
              </li>
            ))}
            <li className="bdst__line is-done">
              <span className="bdst__mark is-done">
                <Check size={11} strokeWidth={3} aria-hidden />
              </span>
              <span className="bdst__text">Updated the canvas</span>
            </li>
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  )
}
