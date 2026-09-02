import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Clock,
  Gavel,
  Loader2,
  Pencil,
  ShieldAlert,
  Sparkles,
  Users,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react'

import { Button, DecisionChip, TipDot } from '../kit'
import { EVERYONE, type Audience, type Rule } from '../data'
import { useBrand } from '../store'
import { runGauntlet } from '../screens/gauntlet'
import type { SimEnv } from '../screens/simulate'
import { QUESTIONS, compose, composeAudience, nameFor, narrate, readPrompt, type Answers, type QuestionId } from './interview-model'

/* -----------------------------------------------------------------------------
   The guided build.

   Say what you want in a sentence, answer five questions, watch the rules get
   written. It exists because the builder's first screen assumes you already
   know three things — that a policy is an ordered list, that conditions are
   composed, and that the first match wins — and a first-time administrator
   knows none of them.

   The shape is a split stage, not a form in a void. The step is on the left and
   the policy you are assembling is on the right, live, from the first answer:
   `compose()` runs on whatever has been answered so far, so the panel is not a
   mock-up of the output — it *is* the output, one answer behind. Perplexity and
   Remote both settle their onboarding this way, and the reason is the same
   here: a question is much easier to answer when you can see what the last one
   did.

   Where it is a game and where it deliberately is not:

   · Answering is fast and physical — number keys, arrows, Enter, one question
     at a time, a bar that fills. That part is meant to be enjoyable.
   · The build is a real loader with a real checklist: one task per rule, named
     after the rule it writes, ticking off as that rule lands on the spine. The
     pattern is Klaviyo's and Rox's — done / running / pending, with a
     determinate bar — and the tasks are not theatre: the timeline drives the
     spine, so the checklist cannot claim work the output does not show.
   · The grade at the end is the real gauntlet, run against the real rules. It
     is not a reward and it is not always an A — a policy this simple usually
     leaks, and being shown that on the way in is the whole point.
   -------------------------------------------------------------------------- */

const EXAMPLES = [
  'Protect finance apps from unmanaged devices',
  'Step up executives when the risk engine flags a session',
  'Block contractors signing in from outside the office',
]

/* One icon per question, so the same five appear in the same order on the
   what's-coming list, the answer record and the question header itself. */
const Q_ICON: Record<QuestionId, LucideIcon> = {
  audience: Users,
  threat: ShieldAlert,
  response: Gavel,
  relief: Building2,
  remember: Clock,
}

/* Short titles for the rail — the prompts themselves are sentences. */
const Q_SHORT: Record<QuestionId, string> = {
  audience: 'Audience',
  threat: 'The worry',
  response: 'The response',
  relief: 'Office network',
  remember: 'Trusted devices',
}

type Stage = 'prompt' | 'ask' | 'build' | 'done'

/* One task per rule, named after the rule it writes, plus a read at the front
   and the gauntlet at the back. Derived from the composed rules rather than
   from the answers, so the checklist and the spine cannot disagree. */
function buildTasks(rules: Rule[]): string[] {
  return [
    'Reading your answers',
    ...rules.map((r, i) => (i === 0 ? `Writing “${r.name}”` : `Placing “${r.name}” at ${i + 1}`)),
    'Running the gauntlet against it',
  ]
}

export function Interview({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  /* Handed the finished rules, the audience they were written for, and a name.
     The audience travels with them because it is a property of the policy the
     host is about to build, and the host has no other way to know it. */
  onCreate: (rules: Rule[], name: string, audience: Audience) => void
}) {
  const store = useBrand()
  const reduce = useReducedMotion()

  const [stage, setStage] = useState<Stage>('prompt')
  const [text, setText] = useState('')
  const [answers, setAnswers] = useState<Answers>({})
  const [seeded, setSeeded] = useState<Answers>({})
  const [qi, setQi] = useState(0)
  const [step, setStep] = useState(0)
  const [peek, setPeek] = useState(false)
  const input = useRef<HTMLTextAreaElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)

  const env = useMemo<SimEnv>(
    () => ({
      zoneName: (id) => store.zoneById(id)?.name ?? id,
      fingerprintName: (id) => store.fingerprintById(id)?.name ?? id,
      groupName: (id) => store.groupById(id).name,
    }),
    [store],
  )

  useEffect(() => {
    if (!open) return
    setStage('prompt')
    setText('')
    setAnswers({})
    setSeeded({})
    setQi(0)
    setStep(0)
    setPeek(false)
    const t = window.setTimeout(() => input.current?.focus(), 120)
    return () => window.clearTimeout(t)
  }, [open])

  /* The preview is the output, not a picture of it. `compose` is happy with a
     partial answer set — it writes the catch-all from the first question and
     adds the guard and the relief as those answers arrive — so the same
     function feeds the live panel, the loader and the finished policy. */
  const rules = useMemo(() => compose(answers), [answers])
  const audience = useMemo(() => composeAudience(answers), [answers])
  const lines = useMemo(() => narrate(rules), [rules])
  const tasks = useMemo(() => buildTasks(rules), [rules])

  /* Held back until the run is over, and memoised: the grade counts up over
     900ms, and re-grading the deck on every frame of that would be the most
     expensive animation on the page. */
  const grade = useMemo(
    () => (stage === 'done' ? runGauntlet({ ...blankShell(), audience, rules }, env, {}) : null),
    [stage, rules, audience, env],
  )

  /* How many rules the spine has drawn. During the build it trails the
     checklist by one — task 0 is the read, so rule i lands when task i+1
     completes. */
  const landed = stage === 'build' ? Math.max(0, Math.min(rules.length, step - 1)) : rules.length

  /* The loader. One interval, one cursor: it ticks the checklist, the bar and
     the spine off the same number, which is why they can never disagree.
     Reduced motion gets the finished state — the sequence is the explanation,
     but somebody who asked for less movement asked for it in one piece. */
  useEffect(() => {
    if (stage !== 'build') return
    if (reduce) {
      setStep(tasks.length)
      const t = window.setTimeout(() => setStage('done'), 260)
      return () => window.clearTimeout(t)
    }
    setStep(0)
    let n = 0
    const id = window.setInterval(() => {
      n += 1
      setStep(n)
      if (n >= tasks.length) {
        window.clearInterval(id)
        window.setTimeout(() => setStage('done'), 620)
      }
    }, 460)
    return () => window.clearInterval(id)
  }, [stage, tasks.length, reduce])

  const q = QUESTIONS[qi]
  const answered = QUESTIONS.filter((x) => answers[x.id]).length

  const next = useCallback(() => {
    if (qi < QUESTIONS.length - 1) setQi(qi + 1)
    else setStage('build')
  }, [qi])

  const back = useCallback(() => {
    if (qi > 0) setQi(qi - 1)
    else setStage('prompt')
  }, [qi])

  const answer = useCallback(
    (optionId: string) => {
      setAnswers((a) => ({ ...a, [q.id]: optionId }))
      window.setTimeout(() => next(), reduce ? 0 : 240)
    },
    [q.id, next, reduce],
  )

  /* Number keys pick, arrows move, Enter advances, Escape leaves. A
     five-question interview that needs a mouse is a form with extra steps. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (stage !== 'ask') return
      const n = Number(e.key)
      if (n >= 1 && n <= q.options.length) {
        e.preventDefault()
        answer(q.options[n - 1].id)
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault()
        back()
      }
      if ((e.key === 'ArrowRight' || e.key === 'Enter') && answers[q.id]) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, stage, q, answers, answer, back, next, onClose])

  /* Focus follows the step. Without this the tab order restarts at the close
     button on every question, which is the one control nobody wants next. */
  useEffect(() => {
    if (stage === 'ask') heading.current?.focus()
  }, [stage, qi])

  if (!open) return null

  function start() {
    const found = readPrompt(text)
    setSeeded(found)
    setAnswers(found)
    setQi(0)
    setStage('ask')
  }

  const name = nameFor(text, answers)

  /* One number for the whole run. The questions own most of it; the build owns
     the last stretch, because a bar that sits at 100% while a loader is still
     ticking is a bar that has lied. */
  const pct =
    stage === 'prompt'
      ? 2
      : stage === 'ask'
        ? 6 + (answered / QUESTIONS.length) * 74
        : stage === 'build'
          ? 80 + (step / tasks.length) * 20
          : 100

  const wide = stage === 'build' || stage === 'done'

  return (
    <motion.div
      className="biv"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="Build a policy by answering questions"
    >
      {/* --- The chrome. A bar at the very top edge, which is where every
              onboarding that gets this right puts it. -------------------- */}
      <div className="biv__rail" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <motion.span
          className="biv__railfill"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: reduce ? 0 : 0.45, ease: [0.2, 0, 0, 1] }}
        />
      </div>

      <header className="biv__top">
        <span className="biv__brandmark">
          <Wand2 size={14} strokeWidth={2} aria-hidden /> Guided setup
        </span>
        <span className="biv__step">
          {stage === 'prompt' && 'Start'}
          {stage === 'ask' && `Question ${qi + 1} of ${QUESTIONS.length}`}
          {stage === 'build' && 'Building'}
          {stage === 'done' && 'Ready'}
        </span>
        <button type="button" className="biv__x" aria-label="Leave the guided build" onClick={onClose}>
          <X size={17} strokeWidth={2} />
        </button>
      </header>

      <div className={`biv__body ${wide ? 'is-wide' : ''}`}>
        {/* --- The live panel. Present from the first screen, so the shape of
                the run is visible before it starts. ------------------------ */}
        {!wide && (
          <aside className={`biv__aside ${peek ? 'is-open' : ''}`}>
            <button type="button" className="biv__peek" onClick={() => setPeek((v) => !v)} aria-expanded={peek}>
              <span>
                {stage === 'prompt' ? 'What we will ask' : 'Policy so far'}
                <b>{stage === 'prompt' ? QUESTIONS.length : rules.length}</b>
              </span>
              <ChevronDown size={15} strokeWidth={2} aria-hidden />
            </button>

            <div className="biv__asidebody">
              <h2 className="biv__asidehead">
                {stage === 'prompt' ? 'What we will ask' : 'Policy so far'}
                {stage !== 'prompt' && <b>{rules.length} rules</b>}
              </h2>

              {stage === 'prompt' ? (
                <ol className="biv__coming">
                  {QUESTIONS.map((x, i) => (
                    <li key={x.id}>
                      <span className="biv__comingn">{i + 1}</span>
                      <QIcon id={x.id} size={14} />
                      {Q_SHORT[x.id]}
                    </li>
                  ))}
                </ol>
              ) : (
                <ol className="biv__mini">
                  <AnimatePresence initial={false}>
                    {rules.map((r, i) => (
                      <motion.li
                        key={r.name}
                        initial={{ opacity: 0, y: reduce ? 0 : -8, scale: reduce ? 1 : 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.97 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                      >
                        <span className="biv__minin">{i + 1}</span>
                        <span className="biv__minibody">
                          {/* The chip rides on the name's line rather than in a
                              column of its own — in a 340px panel a third
                              column costs the sentence half its width. */}
                          <strong>
                            {r.name}
                            <DecisionChip decision={r.decision} size="sm" />
                          </strong>
                          <em>{lines[i]?.replace(/^\d+\.\s*/, '')}</em>
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              )}

              {stage === 'ask' && answered > 0 && (
                <>
                  <h2 className="biv__asidehead">Your answers</h2>
                  <ul className="biv__record">
                    {QUESTIONS.map((x, i) => {
                      const picked = x.options.find((o) => o.id === answers[x.id])
                      if (!picked) return null
                      return (
                        <li key={x.id}>
                          <button type="button" onClick={() => setQi(i)}>
                            <QIcon id={x.id} size={13} />
                            <span>
                              <em>{Q_SHORT[x.id]}</em>
                              <strong>{picked.label}</strong>
                            </span>
                            <Pencil size={12} strokeWidth={2} aria-hidden />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
          </aside>
        )}
        <main className="biv__main">
          <AnimatePresence mode="wait" initial={false}>
            {/* --- 1. The sentence ------------------------------------------ */}
            {stage === 'prompt' && (
              <motion.div
                key="prompt"
                className="biv__panel"
                initial={{ opacity: 0, y: reduce ? 0 : 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -14 }}
                transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
              >
                <h1>What should this policy do?</h1>
                <p className="biv__sub">
                  One sentence, then five questions. We write the rules and grade them before you touch the builder.
                </p>

                <textarea
                  ref={input}
                  className="biv__input"
                  rows={2}
                  value={text}
                  placeholder="Protect finance apps from unmanaged devices…"
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      start()
                    }
                  }}
                />

                <p className="biv__orlabel">Or start from one of these</p>
                <div className="biv__examples">
                  {EXAMPLES.map((x) => (
                    <button key={x} type="button" className={text === x ? 'is-on' : ''} onClick={() => setText(x)}>
                      <Sparkles size={12} strokeWidth={2} aria-hidden />
                      {x}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* --- 2. The questions ------------------------------------------ */}
            {stage === 'ask' && (
              <motion.div
                key={`q-${q.id}`}
                className="biv__panel"
                initial={{ opacity: 0, x: reduce ? 0 : 26 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reduce ? 0 : -26 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
              >
                <span className="biv__qico" aria-hidden>
                  <QIcon id={q.id} size={20} />
                </span>
                <h1 ref={heading} tabIndex={-1}>
                  {q.prompt}
                  <TipDot text={q.hint} />
                </h1>

                {seeded[q.id] && (
                  <p className="biv__caught">
                    <Sparkles size={12} strokeWidth={2} aria-hidden />
                    Read from your sentence — change it if that is wrong
                  </p>
                )}

                <div className="biv__options">
                  {q.options.map((o, i) => {
                    const on = answers[q.id] === o.id
                    return (
                      <motion.button
                        key={o.id}
                        type="button"
                        className={`biv__option ${on ? 'is-on' : ''}`}
                        aria-pressed={on}
                        onClick={() => answer(o.id)}
                        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: reduce ? 0 : 0.18, delay: reduce ? 0 : i * 0.04 }}
                        whileTap={reduce ? undefined : { scale: 0.985 }}
                      >
                        <kbd>{i + 1}</kbd>
                        <span>
                          <strong>{o.label}</strong>
                          <em>{o.caption}</em>
                        </span>
                        <AnimatePresence initial={false}>
                          {on && (
                            <motion.span
                              className="biv__tick"
                              aria-hidden
                              initial={{ scale: 0.3, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.3, opacity: 0 }}
                              transition={{ type: 'spring', stiffness: 700, damping: 32 }}
                            >
                              <Check size={11} strokeWidth={3.2} />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* --- 3. The loader --------------------------------------------- */}
            {stage === 'build' && (
              <motion.div
                key="build"
                className="biv__panel is-build"
                initial={{ opacity: 0, y: reduce ? 0 : 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
              >
                <div className="biv__loader">
                  <h1>
                    Writing your policy
                    <span className="biv__count">
                      {Math.min(step, tasks.length)}/{tasks.length}
                    </span>
                  </h1>
                  <p className="biv__sub">Each rule goes in the order the engine will read it.</p>

                  <div className="biv__bar" aria-hidden>
                    <motion.span
                      initial={false}
                      animate={{ width: `${(Math.min(step, tasks.length) / tasks.length) * 100}%` }}
                      transition={{ duration: reduce ? 0 : 0.4, ease: [0.2, 0, 0, 1] }}
                    />
                  </div>

                  <ol className="biv__tasks">
                    {tasks.map((t, i) => {
                      const state = i < step ? 'done' : i === step ? 'run' : 'wait'
                      return (
                        <li key={t} className={`is-${state}`}>
                          <span className="biv__taskico" aria-hidden>
                            {state === 'done' ? (
                              <motion.span
                                className="biv__taskdone"
                                initial={{ scale: 0.4, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 700, damping: 30 }}
                              >
                                <Check size={10} strokeWidth={3.4} />
                              </motion.span>
                            ) : state === 'run' ? (
                              <motion.span
                                animate={reduce ? undefined : { rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                                style={{ display: 'grid', placeItems: 'center' }}
                              >
                                <Loader2 size={13} strokeWidth={2.4} />
                              </motion.span>
                            ) : null}
                          </span>
                          {t}
                        </li>
                      )
                    })}
                  </ol>
                </div>

                <Spine rules={rules} lines={lines} landed={landed} reduce={!!reduce} />
              </motion.div>
            )}

            {/* --- 4. The finished policy ------------------------------------ */}
            {stage === 'done' && (
              <motion.div
                key="done"
                className="biv__panel is-done"
                initial={{ opacity: 0, y: reduce ? 0 : 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
              >
                <span className="biv__eyebrow">Your policy</span>
                <h1>{name}</h1>

                {grade && <Grade grade={grade} reduce={!!reduce} />}

                <Spine rules={rules} lines={lines} landed={rules.length} reduce={!!reduce} />

                <p className="biv__order">
                  The guard rule is first on purpose. Under first-match-wins the rule below it never sees anything the
                  one above already caught — which is why relief goes underneath, never on top.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

      </div>

      {/* --- The actions. Docked, so the primary is in the same place on every
              step and within a thumb's reach on a phone. ------------------ */}
      {stage !== 'build' && (
        <footer className="biv__foot">
          {stage === 'prompt' ? (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" icon={ArrowLeft} onClick={stage === 'done' ? () => setStage('ask') : back}>
              {stage === 'done' ? 'Change an answer' : 'Back'}
            </Button>
          )}

          <span className="biv__hint">
            {stage === 'ask' ? `Press 1–${q.options.length}, or click` : stage === 'prompt' ? 'Enter to begin' : ''}
          </span>

          {stage === 'done' ? (
            <Button variant="primary" iconRight={ArrowRight} onClick={() => onCreate(rules, name, audience)}>
              Open it in the builder
            </Button>
          ) : stage === 'ask' ? (
            <Button variant="primary" iconRight={ArrowRight} disabled={!answers[q.id]} onClick={next}>
              {qi === QUESTIONS.length - 1 ? 'Build it' : 'Next'}
            </Button>
          ) : (
            <Button variant="primary" iconRight={ArrowRight} onClick={start}>
              {text.trim() ? 'Start' : 'Skip the sentence'}
            </Button>
          )}
        </footer>
      )}
    </motion.div>
  )
}

function QIcon({ id, size }: { id: QuestionId; size: number }) {
  const Ico = Q_ICON[id]
  return <Ico size={size} strokeWidth={1.9} aria-hidden />
}

/* The rules, in evaluation order, drawn one at a time. Shared by the loader and
   the finished screen so the spine you watch being written is the spine you
   end up reading. */
function Spine({
  rules,
  lines,
  landed,
  reduce,
}: {
  rules: Rule[]
  lines: string[]
  landed: number
  reduce: boolean
}) {
  return (
    <ol className="biv__spine">
      {rules.map((r, i) => (
        <AnimatePresence key={r.name} initial={false}>
          {i < landed && (
            <motion.li
              initial={{ opacity: 0, y: reduce ? 0 : 18, scale: reduce ? 1 : 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: reduce ? 'tween' : 'spring', stiffness: 420, damping: 32 }}
            >
              <span className="biv__n">{i + 1}</span>
              <span className="biv__rule">
                <strong>
                  {r.name}
                  <DecisionChip decision={r.decision} size="sm" />
                </strong>
                <em>{lines[i]?.replace(/^\d+\.\s*/, '')}</em>
              </span>
            </motion.li>
          )}
        </AnimatePresence>
      ))}
      {/* Placeholders for the rules still to come, so the panel does not grow
          under the reader while the loader runs. */}
      {rules.slice(landed).map((r, i) => (
        <li key={`ghost-${r.name}`} className="is-ghost" aria-hidden>
          <span className="biv__n">{landed + i + 1}</span>
          <span className="biv__rule">
            <span className="biv__skel" style={{ width: '42%' }} />
            <span className="biv__skel" style={{ width: '72%' }} />
          </span>
        </li>
      ))}
    </ol>
  )
}

/* The grade, counted up rather than stamped on. The number is the real one — a
   first policy this simple usually leaks, and the ring is honest about how
   much of the deck got through. */
function Grade({ grade, reduce }: { grade: ReturnType<typeof runGauntlet>; reduce: boolean }) {
  const total = grade.rounds.length
  const held = grade.held
  const shown = useCountUp(held, reduce)
  const tone = grade.breaches === 0 ? 'good' : grade.breaches > 4 ? 'bad' : 'warn'
  const frac = total > 0 ? held / total : 0
  const R = 26
  const C = 2 * Math.PI * R

  return (
    <div className={`biv__grade is-${tone}`}>
      <div className="biv__ring">
        <svg viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="32" r={R} className="biv__ringtrack" />
          {/* A round cap on a zero-length arc still paints a dot, which reads
              as a sliver of credit where the policy earned none. */}
          {frac > 0 && (
          <motion.circle
            cx="32"
            cy="32"
            r={R}
            className="biv__ringfill"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - frac) }}
            transition={{ duration: reduce ? 0 : 0.9, ease: [0.2, 0, 0, 1], delay: reduce ? 0 : 0.15 }}
          />
          )}
        </svg>
        <strong>{grade.grade}</strong>
      </div>
      <div className="biv__gradetext">
        <b>
          {shown} of {total} attempts landed as expected
        </b>
        <em>
          {grade.breaches === 0
            ? 'Nothing in the deck got through. You can tighten it further in the builder.'
            : `${grade.breaches} got through. Open the gauntlet in the builder to see which, and why.`}
        </em>
      </div>
    </div>
  )
}

/* Counts to the target over a fixed span, on rAF so it tracks real time rather
   than a frame count. Reduced motion gets the number. */
function useCountUp(target: number, reduce: boolean): number {
  const [n, setN] = useState(reduce ? target : 0)
  useEffect(() => {
    if (reduce) {
      setN(target)
      return
    }
    let raf = 0
    let start = 0
    const span = 900
    const tick = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / span)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, reduce])
  return n
}

/* The gauntlet grades a policy, and at this point there is not one yet — only
   rules. This is the smallest shell that lets the real evaluator run over them,
   so the grade shown here is the grade the builder will show. */
function blankShell() {
  return {
    id: 'interview-preview',
    name: 'Preview',
    type: 'App Access' as const,
    appId: undefined as string | undefined,
    status: 'inactive' as const,
    lastModified: '',
    modifiedBy: '',
    audience: EVERYONE,
    rules: [] as Rule[],
  }
}
