import { useEffect, useId, useState } from 'react'
import { Check, CircleAlert, CircleCheck, ListChecks } from 'lucide-react'

import { Badge } from '../kit'
import { CheckMark } from './device-profile-parts'
import { kindChoices } from './device-profile-choices'
import {
  canOpenStep,
  liveSections,
  sectionStatus,
  type LiveStatus,
  type Step3Shape,
  type WizardState,
  type WizardStep,
  type WizardStepId,
} from './device-profile-wizard-model'

/* -----------------------------------------------------------------------------
   The live builder — the profile, drawn as it is answered.

   Beside every step of the page wizard (owner, 17 Sep 2026: "a live builder …
   at the end a live building experience which helps the user understand the
   overview of the profile and what he chooses"). The column that held each
   step's notes holds the profile instead: its name and type, then one section
   per step on a rail, each done, here or not yet, filling in as answers are
   given. What was just chosen arrives with a brief tint, so the preview says
   what the last press did.

   At Review it does not hand over to a page of its own. The form column folds
   away and this panel opens out across the page into the review — the same
   sections, every row shown, an Edit on each — so the review is visibly the
   thing that was being built all along ("when the review comes, the live
   builder should expand as a review mode, in an animated way").

   Read-only. Edit jumps to a step the ladder would open; nothing here writes.
   -------------------------------------------------------------------------- */

/* Rows a section shows before "Show all", beside a step. The review shows them
   all: it is the one place the whole list is read. */
const LIVE_MAX = 6

const STATUS_WORDS: Record<LiveStatus, string> = {
  done: 'done',
  current: 'current step',
  upcoming: 'not started',
}

export function LiveBuilder({
  state,
  step3,
  steps,
  at,
  reached,
  issueOf,
  finalIssue,
  expanded,
  onOpen,
}: {
  state: WizardState
  step3: Step3Shape
  steps: WizardStep[]
  at: number
  reached: number
  issueOf: (id: WizardStepId) => string | null
  /** What still stops Create, or null when the profile could be created. */
  finalIssue: string | null
  /** On Review: the panel is the review. */
  expanded: boolean
  onOpen: (index: number) => void
}) {
  const headingId = useId()
  const sections = liveSections(state, step3)
  const statuses = sections.map((sec) => sectionStatus(sec, steps, at, reached, issueOf))
  const done = statuses.filter((x) => x === 'done').length
  const kind = kindChoices().find((c) => c.id === state.mode)
  const Mark = kind?.icon ?? ListChecks
  const name = state.name.trim()

  /* Rows only tint on arrival after the panel has settled, so opening the page
     does not flash every row at once. A timer, not a frame: frames do not run
     in a hidden tab. */
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 60)
    return () => window.clearTimeout(t)
  }, [])

  const [showAll, setShowAll] = useState<Partial<Record<WizardStepId, boolean>>>({})

  return (
    <aside
      className={`bdlv${expanded ? ' is-expanded' : ''}${settled ? ' is-settled' : ''}`}
      aria-labelledby={headingId}
    >
      <header className="bdlv__head">
        <div className="bdlv__headtext">
          <h2 id={headingId} tabIndex={-1}>
            {expanded ? 'Review' : 'Preview'}
          </h2>
          <p>{expanded ? 'Check the profile before you create it.' : 'Fills in as you answer.'}</p>
        </div>
        {/* How far along, as a bar. The ladder above says which step; this
            says how much of the profile exists. */}
        <span className="bdlv__progress" aria-hidden>
          <span style={{ width: `${(done / Math.max(sections.length, 1)) * 100}%` }} />
        </span>
      </header>

      <ol className="bdlv__secs">
        {sections.map((sec, i) => {
          const status = statuses[i]
          const first = steps.findIndex((x) => sec.steps.includes(x.id))
          const canOpen = first >= 0 && canOpenStep(steps, at, reached, first, issueOf)
          const long = sec.facts.length > LIVE_MAX
          const all = expanded || showAll[sec.step] === true
          const facts = all ? sec.facts : sec.facts.slice(0, LIVE_MAX)
          return (
            <li key={sec.step} className={`bdlv__sec is-${status}`}>
              <span className="bdlv__disc" aria-hidden>
                {status === 'done' ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <div className="bdlv__body">
                <div className="bdlv__sechead">
                  <h3>
                    {sec.title}
                    <span className="u-sr-only">, {STATUS_WORDS[status]}</span>
                  </h3>
                  {sec.step !== 'profile' && !sec.pending && <Badge tone="system">{sec.summary}</Badge>}
                  {canOpen && (
                    <button
                      type="button"
                      className="bdlv__edit"
                      aria-label={`Edit ${sec.title.toLowerCase()}`}
                      onClick={() => onOpen(first)}
                    >
                      Edit
                    </button>
                  )}
                </div>

                {sec.step === 'profile' ? (
                  <div className="bdlv__id">
                    <span className="bdlv__mark" aria-hidden>
                      <Mark size={expanded ? 20 : 18} strokeWidth={1.8} />
                    </span>
                    <span className="bdlv__idtext">
                      <strong className={name ? 'bdlv__name' : 'bdlv__name is-empty'}>{name || 'Untitled profile'}</strong>
                      <span key={state.mode} className="bdlv__kind">
                        {kind?.label}
                      </span>
                    </span>
                  </div>
                ) : sec.pending ? (
                  <p className="bdlv__pending">{sec.pending}</p>
                ) : (
                  <>
                    <dl className="bdlv__facts">
                      {facts.map((f) => (
                        /* Keyed on the value too, so a changed answer is a
                           new row and arrives with the tint. */
                        <div key={`${f.attr?.id ?? f.label}|${f.value}`} className="bdlv__fact">
                          <dt>
                            {f.attr && <CheckMark attr={f.attr} />}
                            <span>{f.label}</span>
                          </dt>
                          <dd>{f.pill ? <Badge tone="neutral">{f.value}</Badge> : f.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {long && !expanded && (
                      <button
                        type="button"
                        className="bdlv__more"
                        aria-expanded={all}
                        onClick={() => setShowAll((cur) => ({ ...cur, [sec.step]: !all }))}
                      >
                        {all ? 'Show fewer' : `Show all ${sec.facts.length}`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Whether Create would go through, in words. Beside a step it is a quiet
          "still to do"; on the review, a problem is the one thing to fix. */}
      <p className={`bdlv__foot ${finalIssue ? 'is-todo' : 'is-ready'}`} role="status">
        {finalIssue ? (
          <CircleAlert size={15} strokeWidth={2} aria-hidden />
        ) : (
          <CircleCheck size={15} strokeWidth={2} aria-hidden />
        )}
        <span>{finalIssue ? (expanded ? finalIssue : `Still to do: ${finalIssue}`) : 'Ready to create'}</span>
      </p>
    </aside>
  )
}
