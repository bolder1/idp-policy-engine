import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, Clock, Combine, FileClock, Globe, KeyRound, ListOrdered, Lock, MonitorSmartphone, Power, ShieldCheck, Split, Users } from 'lucide-react'
import { Picker } from '../picker'
import { WorldScene } from './IntroWorld'
import { ArtActive, ArtParts, ArtPolicy, ArtRule } from './move-steps-art'
import './intro-world.css'

/* -----------------------------------------------------------------------------
   Move policies, every version made on 5-6 Nov 2026, behind one Version dropdown for
   the review (owner, 6 Nov 2026: "add a dropdown and add all the versions we created
   for today's review").

     Basic     four cards, a picture each, a numbered track (the latest)
     World     the step list beside the Walkthrough's isometric world
     Journey   one canvas, a line through four stations, pictures and words in turn
     Stepper   four tabs, the chosen step drawn large
     Bento     four tiles of generic pieces

   Same four steps and the same words in every version, so they compare on layout.
   -------------------------------------------------------------------------- */

export type MoveLook = 'basic' | 'world' | 'journey' | 'stepper' | 'bento'
const LOOKS: { value: MoveLook; label: string }[] = [
  { value: 'basic', label: 'Basic' },
  { value: 'world', label: 'World' },
  { value: 'journey', label: 'Journey' },
  { value: 'stepper', label: 'Stepper' },
  { value: 'bento', label: 'Bento' },
]
const KEY = 'idp.move.look'
function readLook(): MoveLook {
  try {
    const v = localStorage.getItem(KEY)
    return LOOKS.some((l) => l.value === v) ? (v as MoveLook) : 'basic'
  } catch {
    return 'basic'
  }
}

/* The four steps, said the same way in every version. */
const STEPS: { title: string; line: string; icon: typeof Lock; art: () => ReactNode; pic: () => ReactNode; world: number }[] = [
  { title: 'Checks become reusable parts', line: 'IP ranges and locations become zones. Device limits become device profiles. Define them once, use them in any policy.', icon: Split, art: ArtParts, pic: PicParts, world: 1 },
  { title: 'Rules built from your groups', line: 'Each group in App Login becomes a rule: who it applies to, the conditions, and how they sign in.', icon: ListOrdered, art: ArtRule, pic: PicMerge, world: 2 },
  { title: 'One policy, many applications', line: 'An application’s settings come together in one policy. Rules are evaluated top to bottom; Everyone else comes last.', icon: Combine, art: ArtPolicy, pic: PicReview, world: 3 },
  { title: 'Approve, then publish', line: 'Policies arrive as drafts. Compare each with its old policies, approve it, then publish it. Your old policies stay in effect until then.', icon: Power, art: ArtActive, pic: PicActive, world: 4 },
]

/** The dropdown and the chosen version. */
export function MoveVersions() {
  const [look, setLook] = useState<MoveLook>(readLook)
  const pick = (v: string) => {
    const next = (LOOKS.some((l) => l.value === v) ? v : 'basic') as MoveLook
    setLook(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* the pick just isn't remembered */
    }
  }
  return (
    <>
      <span className="bmpk__version">
        <Picker label="Move page version" size="sm" prefix="Version" value={look} options={LOOKS} onChange={pick} />
      </span>
      {look === 'basic' ? <Basic /> : look === 'world' ? <World /> : look === 'journey' ? <Journey /> : look === 'stepper' ? <Stepper /> : <Bento />}
    </>
  )
}

/* --- Basic ------------------------------------------------------------------------- */

export function Basic() {
  return (
    <div className="bm4">
      <ol className="bm4__track" aria-hidden>
        {STEPS.map((s, n) => (
          <li key={s.title}>
            <span className="bm4__node">{n + 1}</span>
          </li>
        ))}
      </ol>
      <ol className="bm4__cards" aria-label="How the move works">
        {STEPS.map((s, n) => (
          <li key={s.title} className={`bm4__card${n === STEPS.length - 1 ? ' is-last' : ''}`}>
            <span className="bm4__pic" aria-hidden>
              <s.art />
            </span>
            <span className="bm4__words">
              <b>{s.title}</b>
              <p>{s.line}</p>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* --- World ------------------------------------------------------------------------- */

function World() {
  const reduce = useReducedMotion() === true
  const [at, setAt] = useState(0)
  const [auto, setAuto] = useState(!reduce)
  useEffect(() => {
    if (!auto) return
    const t = window.setTimeout(() => setAt((n) => (n + 1) % STEPS.length), 4000)
    return () => window.clearTimeout(t)
  }, [at, auto])
  const pick = (n: number) => {
    setAuto(false)
    setAt(n)
  }
  return (
    <div className="bmw">
      <ol className="bmw__list" aria-label="How the move works">
        {STEPS.map((s, n) => (
          <li key={s.title}>
            <button type="button" className={`bmw__step${n === at ? ' is-on' : ''}${n < at ? ' is-done' : ''}`} aria-current={n === at ? 'step' : undefined} onClick={() => pick(n)} onMouseEnter={() => pick(n)}>
              <span className="bmw__n">{n < at ? <Check size={13} strokeWidth={2.6} aria-hidden /> : n + 1}</span>
              <span className="bmw__text">
                <b>{s.title}</b>
                <span>{s.line}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="bmw__stage" aria-hidden>
        <WorldScene step={STEPS[at].world} />
      </div>
    </div>
  )
}

/* --- Journey ----------------------------------------------------------------------- */

function Journey() {
  return (
    <div className="bmpk__journey">
      <span className="bmpk__path" aria-hidden>
        <i />
      </span>
      <ol className="bmpk__flow4" aria-label="How the move works">
        {STEPS.map((s, n) => (
          <li key={s.title} className={`bmpk__col${n % 2 ? ' is-down' : ''}`}>
            <span className="bmpk__pic" aria-hidden>
              <s.pic />
            </span>
            <span className="bmpk__node" aria-hidden>
              <s.icon size={16} strokeWidth={2} />
            </span>
            <span className="bmpk__words">
              <em>Step {n + 1}</em>
              <b>{s.title}</b>
              <p>{s.line}</p>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* --- Stepper ----------------------------------------------------------------------- */

function Stepper() {
  const reduce = useReducedMotion()
  const [at, setAt] = useState(0)
  const [auto, setAuto] = useState(!reduce)
  useEffect(() => {
    if (!auto) return
    const t = window.setTimeout(() => setAt((n) => (n + 1) % STEPS.length), 4000)
    return () => window.clearTimeout(t)
  }, [at, auto])
  const pick = (n: number) => {
    setAuto(false)
    setAt(n)
  }
  const step = STEPS[at]
  return (
    <section className="bmpk__steps" aria-label="How the move works">
      <ol className="bmpk__rail" role="tablist">
        {STEPS.map((s, n) => (
          <li key={s.title} className={`${n === at ? 'is-on' : ''}${n < at ? ' is-past' : ''}`}>
            <button type="button" role="tab" aria-selected={n === at} onClick={() => pick(n)}>
              <span className="bmpk__dot">{n < at ? <Check size={13} strokeWidth={2.6} aria-hidden /> : n + 1}</span>
              <span className="bmpk__label">
                <em>Step {n + 1}</em>
                <b>{s.title}</b>
              </span>
            </button>
            {n < STEPS.length - 1 && <span className="bmpk__link" aria-hidden>{n < at && <i style={{ width: '100%' }} />}</span>}
          </li>
        ))}
      </ol>
      <div className="bmpk__stage" role="tabpanel">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={at} className="bmpk__scene" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
            <span className="bmpk__pic" aria-hidden>
              <step.pic />
            </span>
            <span className="bmpk__words">
              <span className="bmpk__tileicon" aria-hidden>
                <step.icon size={18} strokeWidth={2} />
              </span>
              <b>{step.title}</b>
              <p>{step.line}</p>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

/* --- Bento ------------------------------------------------------------------------- */

function Bento() {
  return (
    <div className="bmpk__bento" aria-label="How the move works">
      <Tile icon={STEPS[0].icon} title={STEPS[0].title} line={STEPS[0].line} wide>
        <PicParts />
      </Tile>
      <Tile icon={STEPS[3].icon} title={STEPS[3].title} line={STEPS[3].line} tall>
        <PicActive />
      </Tile>
      <Tile icon={STEPS[1].icon} title={STEPS[1].title} line={STEPS[1].line}>
        <PicMerge />
      </Tile>
      <Tile icon={STEPS[2].icon} title={STEPS[2].title} line={STEPS[2].line}>
        <PicReview />
      </Tile>
    </div>
  )
}

function Tile({ icon: Icon, title, line, wide, tall, children }: { icon: typeof Lock; title: string; line: string; wide?: boolean; tall?: boolean; children: ReactNode }) {
  return (
    <section className={`bmpk__tile${wide ? ' is-wide' : ''}${tall ? ' is-tall' : ''}`}>
      <span className="bmpk__pic" aria-hidden>
        {children}
      </span>
      <span className="bmpk__words">
        <span className="bmpk__tilehead">
          <span className="bmpk__tileicon" aria-hidden>
            <Icon size={16} strokeWidth={2} />
          </span>
          <b>{title}</b>
        </span>
        <p>{line}</p>
      </span>
    </section>
  )
}

/* --- The generic pictures the Journey, Stepper and Bento draw ----------------------- */

function PicMerge() {
  return (
    <>
      <span className="bmpk__duo">
        <OldPage icon={Lock} name="App Login" rows={2} />
        <OldPage icon={Globe} name="Adaptive" rows={2} />
      </span>
      <ArrowRight size={20} strokeWidth={2} className="bmpk__to" aria-hidden />
      <span className="bmpk__policy">
        <span className="bmpk__policyhead">
          <ShieldCheck size={14} strokeWidth={2.2} aria-hidden />
          <b>Policy</b>
          <i>Draft</i>
        </span>
        {['Rule', 'Everyone else'].map((r, n) => (
          <span key={n} className={`bmpk__policyrow${n === 1 ? ' is-else' : ''}`}>
            <KeyRound size={12} strokeWidth={2.2} aria-hidden />
            {r}
            <span className="bmpk__bar" />
          </span>
        ))}
      </span>
    </>
  )
}

function PicParts() {
  const pairs: [typeof Lock, string, string, boolean][] = [
    [Globe, 'Place or IP', 'Zone', true],
    [MonitorSmartphone, 'Device limit', 'Device profile', true],
    [Clock, 'Hours', 'Condition', false],
  ]
  return (
    <span className="bmpk__pairs">
      {pairs.map(([Icon, from, to, made]) => (
        <span key={from} className="bmpk__pair">
          <Piece icon={Icon} old>
            {from}
          </Piece>
          <ArrowRight size={14} strokeWidth={2} className="bmpk__to is-side" aria-hidden />
          <Piece icon={Icon} made={made}>
            {to}
          </Piece>
        </span>
      ))}
    </span>
  )
}

function PicReview() {
  return (
    <>
      <span className="bmpk__oldcard is-on">
        <Users size={12} strokeWidth={2.2} aria-hidden />
        Group row
        <em>Rule 1</em>
      </span>
      <span className="bmpk__policy">
        <span className="bmpk__policyhead">
          <ShieldCheck size={14} strokeWidth={2.2} aria-hidden />
          <b>New policy</b>
          <i>Draft</i>
        </span>
        {['Rule', 'Everyone else'].map((r, n) => (
          <span key={n} className={`bmpk__policyrow${n === 0 ? ' is-traced' : ' is-else'}`}>
            <KeyRound size={12} strokeWidth={2.2} aria-hidden />
            {r}
            <span className="bmpk__bar" />
          </span>
        ))}
        <span className="bmpk__approve">
          <Check size={13} strokeWidth={2.4} aria-hidden /> Approve
        </span>
      </span>
    </>
  )
}

function PicActive() {
  return (
    <span className="bmpk__states">
      <span className="bmpk__state">
        <FileClock size={14} strokeWidth={2.2} aria-hidden />
        <b>Draft</b>
        <span className="bmpk__bar" />
      </span>
      <span className="bmpk__down" aria-hidden />
      <span className="bmpk__state">
        <Check size={14} strokeWidth={2.4} aria-hidden />
        <b>Approved</b>
        <span className="bmpk__bar" />
      </span>
      <span className="bmpk__down" aria-hidden />
      <span className="bmpk__state is-on">
        <Power size={14} strokeWidth={2.2} aria-hidden />
        <b>Active</b>
        <span className="bmpk__toggle" aria-hidden>
          <i />
        </span>
      </span>
    </span>
  )
}

function OldPage({ icon: Icon, name, rows }: { icon: typeof Lock; name: string; rows: number }) {
  return (
    <span className="bmpk__page">
      <span className="bmpk__pagehead">
        <Icon size={12} strokeWidth={2.2} aria-hidden />
        {name}
      </span>
      {Array.from({ length: rows }, (_, n) => (
        <span key={n} className="bmpk__pagerow">
          <span className="bmpk__bar" />
          <span className="bmpk__bar is-short" />
        </span>
      ))}
    </span>
  )
}

function Piece({ icon: Icon, children, old, made }: { icon: typeof Lock; children: ReactNode; old?: boolean; made?: boolean }) {
  return (
    <span className={`bmpk__piece${old ? ' is-old' : ''}${made ? ' is-made' : ''}`}>
      <Icon size={13} strokeWidth={2.2} aria-hidden />
      {children}
    </span>
  )
}

/** The four steps as a short vertical list, for the Migrate popup (MoveDialog.tsx MigrateLayout). */
export function StepList() {
  return (
    <ol className="bmg2__steps">
      {STEPS.map((st, n) => (
        <li key={st.title} className="bmg2__step">
          <span className="bmg2__node" aria-hidden>
            <st.icon size={16} strokeWidth={2} />
          </span>
          <span className="bmg2__words">
            <span className="bmg2__n">Step {n + 1}</span>
            <b>{st.title}</b>
            <p>{st.line}</p>
          </span>
        </li>
      ))}
    </ol>
  )
}
