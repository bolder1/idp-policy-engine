import { motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { DECISION_WORDS } from '../../decision-words'
import { useBrand } from '../../store'
import { Seg } from '../board/Section'
import { SignInScreen } from './SignInScreen'
import { stepLabel, type SignInScreens } from './screens-of'
import './testing.css'

/* -----------------------------------------------------------------------------
   What they see: the pages the person signing in would get, for the answer
   on screen (screens-of.ts builds them).

   One component for every surface (final spec, Assumption 28). On the board it
   sits open under the result; on the Policy testing page it is a disclosure
   that starts closed, because there the answer is the decision and the pages
   are the detail.

   Two switches, each only when there is something to switch between:

     decision  when the sign-in could get more than one answer — one set of
               pages per decision, named by it
     page      when the answer is more than one page — "Password | Google
               Authenticator" — opening on the last, the one the rule chose

   A caption says it is an approximation, every time. The product's own pages
   are not in this prototype, and a picture of one that looked exact would be
   read as exact.
   -------------------------------------------------------------------------- */

export function WhatTheySee({
  screens,
  appId,
  title = 'What they see',
  defaultOpen = false,
  hidden = false,
  fade = true,
}: {
  screens: readonly SignInScreens[]
  appId: string | null
  title?: string
  defaultOpen?: boolean
  /** The answer has not landed yet — a marker is still travelling to it. Held
      at nothing in its place, and brought up 80 ms after it lands. */
  hidden?: boolean
  /** A new answer may cross-fade. False while a slider is held, where it would
      flicker under the thumb. */
  fade?: boolean
}) {
  const { apps } = useBrand()
  const reduced = useReducedMotion() === true
  const bodyId = useId()
  const [open, setOpen] = useState(defaultOpen)
  const [pick, setPick] = useState<{ decision: number; step: number | null }>({ decision: 0, step: null })

  /* A new answer starts again from its first decision and its last page. The
     pages are compared by what they say, so a re-render with the same answer
     keeps the tester's choice. */
  const sig = JSON.stringify(screens.map((s) => [s.decision, s.ruleName, s.steps.map(stepLabel)]))
  const [seen, setSeen] = useState(sig)
  if (seen !== sig) {
    setSeen(sig)
    setPick({ decision: 0, step: null })
  }

  if (screens.length === 0 || !appId) return null
  const chosen = screens[Math.min(pick.decision, screens.length - 1)]
  const last = chosen.steps.length - 1
  const at = pick.step === null ? last : Math.min(pick.step, last)
  const appName = apps.find((a) => a.id === appId)?.name ?? appId

  return (
    <section className={`tsee${open ? '' : ' is-closed'}`}>
      <button type="button" className="tsee__head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
        <ChevronDown size={14} strokeWidth={2} aria-hidden className="tsee__chev" />
        {title}
      </button>
      {open && (
        <motion.div
          id={bodyId}
          className="tsee__body"
          aria-hidden={hidden || undefined}
          initial={false}
          animate={{ opacity: hidden ? 0 : 1 }}
          transition={{ duration: hidden || reduced ? 0 : 0.16, delay: hidden || reduced ? 0 : 0.08 }}
        >
          {screens.length > 1 && (
            <Seg
              label="Decision"
              value={String(Math.min(pick.decision, screens.length - 1))}
              options={screens.map((s, i) => ({ value: String(i), label: DECISION_WORDS[s.decision] }))}
              onChange={(v) => setPick({ decision: Number(v), step: null })}
            />
          )}
          {chosen.steps.length > 1 && (
            <Seg
              label="Page"
              value={String(at)}
              options={chosen.steps.map((s, i) => ({ value: String(i), label: stepLabel(s) }))}
              onChange={(v) => setPick((p) => ({ ...p, step: Number(v) }))}
            />
          )}
          {/* A new page cross-fades — unless the whole body is still held
              back for a landing, which brings it up itself. */}
          <motion.div
            key={`${sig}:${pick.decision}:${at}`}
            className="tsee__page"
            initial={reduced || !fade || hidden ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced || !fade ? 0 : 0.16 }}
          >
            <SignInScreen appId={appId} appName={appName} step={chosen.steps[at]} />
          </motion.div>
          <p className="tsee__caption">Approximation of the sign-in page</p>
        </motion.div>
      )}
    </section>
  )
}
