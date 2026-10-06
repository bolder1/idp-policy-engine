import { Ban } from 'lucide-react'
import { useState } from 'react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { AppLogo } from '../../../logos/AppLogo'
import { asksForCode, promptText, stepLabel, type ScreenStep, type SignInScreens } from '../../testing/screens-of'

/* -----------------------------------------------------------------------------
   What the person sees (brief-panel.tsx, "What Maya sees"): the sign-in
   pages, drawn small and plain — the product's own pages are not in this
   prototype, and a picture that looked exact would be read as exact, so the
   panel marks it "Approximation". Each page's prompt in the words a sign-in
   page uses (screens-of.ts `promptText`), the deny page with its message
   verbatim. Components only.
   -------------------------------------------------------------------------- */

interface SeeScreensProps {
  screens: readonly SignInScreens[]
  appId: string
  appName: string
  /** The person's first name ("Maya"), or "they". */
  first: string
}

function Page({ step, appId, appName, big }: { step: ScreenStep | undefined; appId: string; appName: string; big: boolean }) {
  if (!step) return null
  if (step.kind === 'deny') {
    return (
      <div className="rl-brief__seepage is-deny">
        <Ban className="rl-brief__seeban" size={big ? 20 : 14} strokeWidth={2.2} aria-hidden />
        <span className="rl-brief__seeprompt">{big ? step.message : 'Access denied'}</span>
      </div>
    )
  }
  const code = asksForCode(step)
  return (
    <div className="rl-brief__seepage">
      <span className="rl-brief__seeapp">
        <AppLogo appId={appId} name={appName} size={big ? 16 : 14} />
        {big && <span>{appName}</span>}
      </span>
      <span className="rl-brief__seeprompt">{big ? promptText(step) : stepLabel(step)}</span>
      {code ? (
        <span className="rl-brief__seecode" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      ) : (
        <span className="rl-brief__seefield" aria-hidden />
      )}
      <span className="rl-brief__seego" aria-hidden />
    </div>
  )
}

/* What the person sees, at the panel's width (brief-panel.tsx, "What Maya
   sees"): the steps as small tabs over one browser frame — the page each step
   shows, in the words a sign-in page uses — and a switch per answer when the
   answer depends. Marked "Approximation": the product's own pages are not in
   this prototype. */
export function SeeScreens({ screens, appId, appName, first }: SeeScreensProps) {
  const [pick, setPick] = useState(0)
  const [tab, setTab] = useState(0)
  const sig = screens.map((s) => `${s.decision}:${s.steps.map(stepLabel).join('>')}`).join('|')
  const [seen, setSeen] = useState(sig)
  if (seen !== sig) {
    setSeen(sig)
    setPick(0)
    setTab(0)
  }
  const screen = screens[Math.min(pick, screens.length - 1)]
  if (!screen) return null
  const steps = screen.steps
  const at = Math.min(tab, steps.length - 1)
  const step = steps[at]
  return (
    <div className="bfp-see">
      {screens.length > 1 && (
        <div className="bfp-see__tabs is-answers" role="group" aria-label="If the answer is">
          {screens.map((s, i) => (
            <button
              key={`${s.decision}:${i}`}
              type="button"
              className={`is-${s.decision}`}
              aria-pressed={i === pick}
              onClick={() => {
                setPick(i)
                setTab(0)
              }}
            >
              {DECISION_WORDS[s.decision as AccessDecision]}
            </button>
          ))}
        </div>
      )}
      {steps.length > 1 && (
        <div className="bfp-see__tabs" role="group" aria-label="Steps">
          {steps.map((s, i) => (
            <button key={`${s.kind}:${i}`} type="button" aria-pressed={i === at} onClick={() => setTab(i)}>
              <span className="bfp-see__n" aria-hidden>
                {i + 1}
              </span>
              {stepLabel(s)}
            </button>
          ))}
        </div>
      )}
      <div className="rl-brief__seeframe is-open bfp-see__frame" role="img" aria-label={`What ${first} sees${steps.length > 1 ? `, step ${at + 1} of ${steps.length}` : ''}: ${step ? (step.kind === 'deny' ? step.message : promptText(step)) : ''}`}>
        <span className="rl-brief__seebar" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <Page step={step} appId={appId} appName={appName} big />
      </div>
    </div>
  )
}
