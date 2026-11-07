import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { RULE_PART } from '../screens/board/parts'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  Building2,
  Check,
  Clock,
  Coffee,
  Globe,
  History,
  KeyRound,
  Laptop,
  Lock,
  MapPin,
  Monitor,
  MonitorSmartphone,
  Network,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Smartphone,
  Tablet,
  UserCheck,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AppLogo } from '../logos/AppLogo'
import { EASE_SCENE, HandoffContext, StoryClockContext, StoryDoneContext, useMood } from './intro-mood'

/* -----------------------------------------------------------------------------
   The intro's stories (IntroCarousel.tsx), one per section (owner, 5 Nov 2026: "an
   animated cartoon way ... less text, more concept", then "add text wherever needed, so
   the user understands what is happening"). Icons and the odd application logo carry
   each scene; a word or two names what they are. The builder slide is our own canvas
   assembling itself, then giving its answer; the rest are little scenes: old pages
   sliding into one policy, a zone built and two sign-ins checked against it, a device
   checked line by line, a sign-in walked down the rules, and every application waiting
   for its turn to move. Each loops; reduced motion shows its last frame, still.
   -------------------------------------------------------------------------- */

export type WidgetId = 'build' | 'merge' | 'parts' | 'rule' | 'builder' | 'zones' | 'devices' | 'check' | 'move'

type R = { reduce: boolean }
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'slate'

/* The pace of every scene (owner, 5 Nov 2026: "too fast ... I get lost"): each step and frame is held this much longer. */
/* One pace for every story (owner, 4 Nov 2026: pauses placed with care): build-up beats are short, the beats you read
   hold. Each story's own list says which is which. */
const PACE = 1.2
const spring = { type: 'spring' as const, stiffness: 110, damping: 22 }
const enter = (reduce: boolean, delay = 0) =>
  reduce ? { initial: false as const } : { initial: { opacity: 0, y: 10, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { ...spring, delay } }

/** Step 0..n-1, one every `ms`, holding the last a while before it starts again. Reduced motion: the last, still. */


/** A small word on a scene: a chip with its icon. */
function Chip({ icon: Icon, children, tone = 'slate' }: { icon?: LucideIcon; children: string; tone?: Tone }) {
  return (
    <span className={`bich is-${tone}`}>
      {Icon && <Icon size={12} strokeWidth={2.2} />}
      {children}
    </span>
  )
}

export function IntroWidget({ id, reduce }: { id: WidgetId } & R) {
  if (id === 'build') return <Build reduce={reduce} />
  if (id === 'merge') return <Merge reduce={reduce} />
  if (id === 'parts') return <Parts reduce={reduce} />
  if (id === 'rule') return <RuleStory reduce={reduce} />
  if (id === 'builder') return <BuilderStory reduce={reduce} />
  if (id === 'zones') return <Zones reduce={reduce} />
  if (id === 'devices') return <Devices reduce={reduce} />
  if (id === 'check') return <CheckAccess reduce={reduce} />
  return <MoveStory reduce={reduce} />
}

/** One line of a rule: its word, and what it says. */
function Line({ k, children, reduce }: { k: 'who' | 'if' | 'then'; children: ReactNode } & R) {
  return (
    <motion.span className="bic-row" {...enter(reduce)}>
      <i className="bic-k">{RULE_PART[k]}</i>
      {children}
    </motion.span>
  )
}

/** A scene's frames, each shown for its own time; the last holds, then it starts again. Reduced motion: the last, still. */
/* The opening line of slides 2 to 5, in kinetic type: "Introducing" fades in, then the name builds letter by letter. */
function KineticTitle({ text, reduce }: { text: string } & R) {
  return (
    <span className="bkt" aria-label={`Introducing ${text}`}>
      <motion.span className="bkt__pre" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        Introducing
      </motion.span>
      <span className="bkt__word" aria-hidden>
        {[...text].map((ch, n) => (
          <motion.span
            key={n}
            initial={reduce ? false : { opacity: 0, y: 14, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: reduce ? 0 : 0.25 + n * 0.035, duration: 0.45, ease: EASE_SCENE }}
          >
            {ch === ' ' ? '\u00a0' : ch}
          </motion.span>
        ))}
      </span>
    </span>
  )
}

/* The opening of slides 2 to 5 (owner, 5 Nov 2026: "an intro for each slide"): the part's window draws in around its
   first scene, with its name and the New tag. */
function Win({ title, icon: Icon, reduce, pick, children }: { title: string; icon: LucideIcon; pick?: string; children: ReactNode } & R) {
  /* A selection, as in a design tool (owner, 5 Nov 2026): once the window is in, a frame with handles lands on the New
     tag, then on the element marked data-pick, with a small label. Not under reduced motion. */
  const root = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number; label: string } | null>(null)
  useEffect(() => {
    if (reduce) return
    const frame = (q: string, label: string) => {
      const el = root.current
      const t = el?.querySelector<HTMLElement>(q)
      if (!el || !t) return
      const a = el.getBoundingClientRect()
      const b = t.getBoundingClientRect()
      setSel({ x: b.left - a.left - 4, y: b.top - a.top - 4, w: b.width + 8, h: b.height + 8, label })
    }
    const t1 = window.setTimeout(() => frame('.bis8__new', 'New'), 1500)
    const t2 = window.setTimeout(() => frame('[data-pick]', pick ?? title), 2500)
    const t3 = window.setTimeout(() => setSel(null), 4300)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [reduce, pick, title])
  return (
    <motion.div ref={root} className="bis8__win" initial={reduce ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: EASE_SCENE }}>
      <AnimatePresence>
        {sel && (
          <motion.span
            key="sel"
            className="bis8__sel"
            aria-hidden
            initial={{ opacity: 0, left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
            animate={{ opacity: 1, left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 170, damping: 22 }}
          >
            <i className="is-tl" />
            <i className="is-tr" />
            <i className="is-bl" />
            <i className="is-br" />
            <motion.b key={sel.label} className="bis8__sellabel" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              {sel.label}
            </motion.b>
          </motion.span>
        )}
      </AnimatePresence>
      <motion.span className="bis8__bar" initial={reduce ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.35, duration: 0.5 }}>
        <span className="bis8__dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <Icon size={13} strokeWidth={2.2} />
        <b>{title}</b>
        <motion.span className="bis8__new" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: reduce ? 0 : 0.8, type: 'spring', stiffness: 420, damping: 16 }}>
          New
        </motion.span>
      </motion.span>
      {children}
    </motion.div>
  )
}

function useFrames(ms: readonly number[], reduce: boolean, onLoop?: () => void) {
  const [f, setF] = useState(0)
  const clock = useContext(StoryClockContext)
  /* A slide's own story tells the carousel how long it plays, for its chapter bar. */
  useEffect(() => {
    if (onLoop) clock.begin(ms.reduce((a, b) => a + b, 0) * PACE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (reduce || clock.paused) return
    const t = window.setTimeout(() => {
      /* A story that has played through once hands over to the next slide (autoplay); a nested one just repeats. */
      if (f === ms.length - 1 && onLoop) onLoop()
      setF((v) => (v + 1) % ms.length)
    }, ms[f] * PACE)
    return () => window.clearTimeout(t)
  }, [f, ms, reduce, onLoop, clock.paused])
  return reduce ? ms.length - 1 : f
}

/** One move between scenes, everywhere (owner, 4 Nov 2026: "smooth, like a loop that keeps rolling"): the old scene rises
    and eases back as it fades, the new one rises in from just below and settles. The same curve carries a story from its
    last beat back to its first, so each one rolls on rather than restarting. */

const cut = (reduce: boolean) =>
  reduce
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 18, scale: 0.985 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -18, scale: 0.985 },
        transition: { duration: 0.75, ease: EASE_SCENE },
      }

/** A caption over a scene, in the stage's quiet voice. */
const Caption = ({ children }: { children: string }) => <span className="bisc">{children}</span>

/* --- 1. The builder, in three cuts: a sign-in to Salesforce; a rule, who then if then then; the rules together; the answer --- */

const BUILD_MS = [3800, 2400, 1000, 1200, 1200, 2600] as const

/* Slide 1's opening (owner, 4 Nov 2026: "a carousel of multiple applications"): the applications slide past and settle,
   Salesforce in the middle, picked. Any application works the same way. */
/* Slide 1's opening (owner, 4 Nov 2026: "an infinite number of applications"): three rows of applications rolling past
   in turn, each its own way and speed; then the rows fall back and one, Salesforce, comes forward. */
const APP_ROWS = [
  ['slack', 'zoom', 'workday', 'github', 'jira', 'dropbox'],
  ['m365', 'google', 'okta', 'aws', 'box', 'zendesk'],
  ['servicenow', 'confluence', 'slack', 'google', 'zoom', 'github'],
] as const

function AppCarousel({ reduce }: R) {
  /* Pieces travel between slides only when the story plays on; a press of Next or Back is a plain cut. */
  const hand = useContext(HandoffContext)
  const [picked, setPicked] = useState(reduce)
  useEffect(() => {
    if (reduce) return
    const t = window.setTimeout(() => setPicked(true), 1900)
    return () => window.clearTimeout(t)
  }, [reduce])
  return (
    <div className="bis1m">
      <motion.div className="bis1m__rows" animate={{ opacity: picked ? 0.18 : 1, scale: picked ? 0.96 : 1 }} transition={{ duration: 0.8, ease: EASE_SCENE }}>
        {APP_ROWS.map((row, n) => (
          <div key={n} className="bis1m__row">
            <motion.div
              className="bis1m__strip"
              initial={false}
              animate={reduce ? undefined : { x: n % 2 ? ['-50%', '0%'] : ['0%', '-50%'] }}
              transition={{ duration: 14 + n * 4, repeat: Infinity, ease: 'linear' }}
            >
              {[...row, ...row].map((id, j) => (
                <span key={`${id}-${j}`} className="bis1m__app">
                  <AppLogo appId={id} size={28} />
                </span>
              ))}
            </motion.div>
          </div>
        ))}
      </motion.div>
      <AnimatePresence>
        {picked && (
          <motion.div key="pick" className="bis1m__pick" initial={reduce ? false : { opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
            <motion.span layoutId={hand ? 'story-app' : undefined} className="bis1m__picktile">
              <AppLogo appId="salesforce" size={44} />
            </motion.span>
            <b>Salesforce</b>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Build({ reduce }: R) {
  /* Pieces travel between slides only when the story plays on; a press of Next or Back is a plain cut. */
  const hand = useContext(HandoffContext)
  /* The connected story (owner, 4 Nov 2026): the one card from slide 1 lands as rule 1 on the builder's canvas; the view
     zooms into that rule; its zone condition lights and is handed to the Zones slide. */
  const f = useFrames(BUILD_MS, reduce, useContext(StoryDoneContext))
  const scene = f <= 1 ? 'canvas' : 'rule'
  useMood('calm')
  return (
    <div className="bix bisx">
      <AnimatePresence mode="wait">
        {scene === 'canvas' && (
          <motion.div key="canvas" className="bisx__scene" initial={hand || reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, scale: 1.06 }} transition={{ duration: 0.6, ease: EASE_SCENE }}>
            {f === 0 ? <KineticTitle text="Policy builder" reduce={reduce} /> : <Caption>One canvas for the whole policy</Caption>}
            {/* The builder opens around the canvas (owner, 5 Nov 2026: "an intro for the new policy builder, animated"): its
                window draws in, its name and New tag arrive, and the card from slide 1 lands inside as rule 1. */}
            <Win title="Policy builder" icon={Workflow} reduce={reduce} pick="Your rule, carried over">
            <div className="bis-chain">
              <motion.span className="bic-start" {...enter(reduce, 0.5)}>
                <AppLogo appId="salesforce" size={16} />
                Sign-in to <b>Salesforce</b>
              </motion.span>
              <motion.div data-pick layoutId={hand ? 'story-card' : undefined} className="bis-line" transition={{ layout: { duration: 0.9, ease: EASE_SCENE } }}>
                <span className="bic-n">1</span>
                <b>Sales</b>
                <span className="bis-if">Corporate offices · Device health</span>
                <span className="bis-then">
                  <KeyRound size={12} strokeWidth={2.2} />
                  Ask for 2FA
                </span>
              </motion.div>
              {[
                { n: '2', who: 'Contractors', then: 'Deny', icon: ShieldX },
                { n: 'else', who: 'Everyone else', then: 'Allow', icon: Check },
              ].map((r, i) => (
                <motion.div key={r.n} className={`bis-line${r.n === 'else' ? ' is-else' : ''}`} {...enter(reduce, 0.9 + i * 0.3)}>
                  <span className="bic-n">{r.n === 'else' ? '·' : r.n}</span>
                  <b>{r.who}</b>
                  <span className="bis-then">
                    <r.icon size={12} strokeWidth={2.2} />
                    {r.then}
                  </span>
                </motion.div>
              ))}
            </div>
            </Win>
          </motion.div>
        )}
        {scene === 'rule' && (
          <motion.div key="rule" className="bisx__scene" initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: EASE_SCENE }}>
            <Caption>{f >= 5 ? 'Its conditions use zones and device profiles' : 'Inside a rule: people, conditions, outcome'}</Caption>
            <div className="bic-card is-big">
              <span className="bic-n">1</span>
              <div className="bic-rows">
                <Line k="who" reduce={reduce}>
                  <Chip icon={Users}>Sales</Chip>
                </Line>
                {f >= 3 && (
                  <Line k="if" reduce={reduce}>
                    <span className="bis2__ors">
                      <motion.span layoutId={hand ? 'story-zone' : undefined} className={`bich is-slate bis-handoff${f >= 5 ? ' is-lit' : ''}`}>
                        <Globe size={12} strokeWidth={2.2} />
                        Corporate offices
                      </motion.span>
                      <motion.span layoutId={hand ? 'story-device' : undefined} className={`bich is-slate bis-handoff${f >= 5 ? ' is-lit' : ''}`}>
                        <MonitorSmartphone size={12} strokeWidth={2.2} />
                        Device health
                      </motion.span>
                    </span>
                  </Line>
                )}
                {f >= 4 && (
                  <Line k="then" reduce={reduce}>
                    <Chip icon={KeyRound} tone="blue">
                      Ask for 2FA
                    </Chip>
                  </Line>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* --- 2. Two old pages into one policy, in three cuts: the two pages; moved in one go; one policy, its rules falling in ---- */

/* Three beats (owner, 4 Nov 2026: "make it simple"): the two old policies; their pieces, tangled; one card. */
const MERGE_MS = [3600, 3400, 3600] as const

/* One continuous shot, no cuts (owner, 4 Nov 2026: "the elements arrange themselves"): the old policy's pieces lie strewn
   across two pages; the pages fall away and the pieces sort themselves into people, conditions and outcome; then the
   three lanes close up into one card. Every piece is the same element the whole way (shared layout), so it travels. */
type Part = 'who' | 'if' | 'then'
const BITS: { id: string; page: 'login' | 'adaptive'; t: string; icon: LucideIcon; part: Part; x: number; y: number; r: number; drift: number }[] = [
  { id: 'sales', page: 'login', t: 'Sales', icon: Users, part: 'who', x: 64, y: 4, r: 7, drift: 5 },
  { id: 'clock', page: 'adaptive', t: 'Working hours', icon: Clock, part: 'if', x: 50, y: 32, r: -6, drift: -5 },
  { id: 'otp', page: 'login', t: 'OTP', icon: KeyRound, part: 'then', x: 10, y: 42, r: 9, drift: 4 },
  { id: 'india', page: 'adaptive', t: 'India only', icon: MapPin, part: 'if', x: 68, y: 56, r: 10, drift: -4 },
  { id: 'finance', page: 'login', t: 'Finance', icon: Users, part: 'who', x: 2, y: 84, r: -8, drift: -3 },
  { id: 'device', page: 'adaptive', t: 'Laptop', icon: Laptop, part: 'if', x: 72, y: 86, r: -5, drift: 4 },
]
const OLD_PAGE_BITS = [
  { id: 'login', t: 'App Login Policy', icon: Lock, x: 4, y: 6, r: -4 },
  { id: 'adaptive', t: 'Adaptive Access Policy', icon: Globe, x: 30, y: 66, r: 3 },
]
const MERGE_CAPTION = ['Pick an application', 'Today: two policies for one application', 'Its settings, scattered across both']

function Merge({ reduce }: R) {
  /* Pieces travel between slides only when the story plays on; a press of Next or Back is a plain cut. */
  const hand = useContext(HandoffContext)
  const f = useFrames(MERGE_MS, reduce, useContext(StoryDoneContext))
  useMood('calm')
  /* Each loop is a fresh take: the pieces travel within a loop, never from the last card back to the first beat. */
  const cycle = useRef(0)
  const was = useRef(f)
  if (f === 0 && was.current !== 0) cycle.current += 1
  was.current = f
  const c = cycle.current
  /* Every piece moves on the same curve, in reading order: deliberate, never springy. */
  const glide = (n: number) => (reduce ? { duration: 0 } : { duration: 0.9, ease: EASE_SCENE, delay: n * 0.05 })
  const bit = (b: (typeof BITS)[number], n: number, loose: boolean) => (
    <motion.span
      key={b.id}
      layoutId={`m${c}-${b.id}`}
      layout="position"
      className={`bis2s__bit${loose ? '' : ' is-set'}`}
      style={loose ? { left: `${b.x}%`, top: `${b.y}%` } : undefined}
      initial={false}
      animate={{ rotate: loose && !reduce ? b.r : 0 }}
      transition={{ layout: glide(n), rotate: glide(n) }}
    >
      <b.icon size={12} strokeWidth={2} />
      {b.t}
    </motion.span>
  )
  return (
    <div className="bix bisx">
      <div className="bisx__scene">
        <AnimatePresence mode="wait">
          <motion.span key={f} className="bisc" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.4 }}>
            {MERGE_CAPTION[f]}
          </motion.span>
        </AnimatePresence>
          <div className="bis2x">
            <AnimatePresence>
            {f === 2 && (
              <motion.div key={`t${c}`} className="bis2x__layer is-tangle" exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.5 } }}>
              <div className="bis2s">
                {OLD_PAGE_BITS.map((p, n) => (
                  <motion.span
                    key={p.id}
                    layoutId={`m${c}-p-${p.id}`}
                    layout="position"
                    className="bis2s__bit is-page"
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    initial={reduce ? false : { opacity: 0, scale: 0.85, rotate: 0 }}
                    animate={{ opacity: 1, scale: 1, rotate: p.r }}
                    transition={{ duration: 0.9, ease: EASE_SCENE, delay: reduce ? 0 : n * 0.05 }}
                  >
                    <p.icon size={14} strokeWidth={2} />
                    {p.t}
                  </motion.span>
                ))}
                {BITS.map((b, n) => bit(b, n, true))}
              </div>
              </motion.div>
            )}
            {f === 0 && (
              <motion.div key={`a${c}`} className="bis2x__layer" initial={hand || reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.5 } }}>
                <AppCarousel reduce={reduce} />
              </motion.div>
            )}
            {f === 1 && (
              <motion.div key={`p${c}`} className="bis2x__layer" initial={false} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.5 } }} transition={{ duration: 0.75, ease: EASE_SCENE, delay: c > 0 && !reduce ? 0.65 : 0 }}>
              <div className="bis2t">
                <span className="bis2t__top">
                  <motion.span layoutId={hand ? 'story-app' : undefined} className="bis2__app" transition={{ layout: { duration: 0.8, ease: EASE_SCENE } }}>
                    <AppLogo appId="salesforce" size={22} />
                    <b>Salesforce</b>
                  </motion.span>
                  <motion.span className="bis2t__tag" initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduce ? 0 : 0.4, duration: 0.4 }}>
                    <History size={12} strokeWidth={2.2} />
                    Old policies
                  </motion.span>
                </span>
                {OLD_PAGE_BITS.map((p, n) => (
                  <motion.div key={p.id} className="bis2t__page" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.5 + n * 0.25, duration: 0.6, ease: EASE_SCENE }}>
                    <motion.span layoutId={`m${c}-p-${p.id}`} layout="position" className="bis2t__name" initial={false} animate={{ rotate: 0 }} transition={{ layout: glide(0), rotate: glide(0) }}>
                      <p.icon size={14} strokeWidth={2} />
                      {p.t}
                    </motion.span>
                    <span className="bis2t__bits">{BITS.filter((b) => b.page === p.id).map((b) => bit(b, BITS.indexOf(b), false))}</span>
                  </motion.div>
                ))}
              </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
      </div>
    </div>
  )
}

/* --- The tour, retold (owner, 5 Nov 2026): old policies → their parts → one rule → the builder → check access. ------ */

/* 2 · The Adaptive Access check breaks into parts you name once: its networks and places become a zone, its device
   limit a device profile; each then folds into a chip, ready for any rule (the chips travel into slide 3). */
const PARTS_MS = [3600, 3400, 3000] as const
const PARTS_CAPTION = ['', 'It breaks into parts', 'Named once, used in any rule']

function Parts({ reduce }: R) {
  const hand = useContext(HandoffContext)
  const f = useFrames(PARTS_MS, reduce, useContext(StoryDoneContext))
  useMood('calm')
  return (
    <div className="bix bisx">
      <div className="bisx__scene">
        {f === 0 ? <KineticTitle text="Zones and device profiles" reduce={reduce} /> : (
          <AnimatePresence mode="wait">
            <motion.span key={f} className="bisc" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
              {PARTS_CAPTION[f]}
            </motion.span>
          </AnimatePresence>
        )}
        <div className="bpt">
          <AnimatePresence mode="popLayout" initial={false}>
            {f === 0 && (
              <motion.div key="adaptive" className="bpt__old" initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, scale: 0.9 }} transition={{ duration: 0.6, ease: EASE_SCENE }}>
                <span className="bpt__oldhead">
                  <Globe size={14} strokeWidth={2} />
                  <b>Adaptive Access Policy</b>
                </span>
                <span className="bpt__row">
                  <Network size={13} strokeWidth={2} />
                  IP 203.0.113.0/24
                </span>
                <span className="bpt__row">
                  <MapPin size={13} strokeWidth={2} />
                  India
                </span>
                <span className="bpt__row">
                  <MonitorSmartphone size={13} strokeWidth={2} />
                  At most 2 devices per user
                </span>
              </motion.div>
            )}
            {f === 1 && (
              <motion.div key="split" className="bpt__split" initial={false} exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.3 } }}>
                <motion.div className="bpt__part" initial={reduce ? false : { opacity: 0, x: 60, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.8, ease: EASE_SCENE }}>
                  <span className="bpt__parthead">
                    <Globe size={15} strokeWidth={2} />
                    <b>Corporate offices</b>
                    <i>Zone</i>
                  </span>
                  <span className="bpt__row">
                    <Network size={13} strokeWidth={2} />
                    203.0.113.0/24
                  </span>
                  <span className="bpt__row">
                    <MapPin size={13} strokeWidth={2} />
                    India
                  </span>
                </motion.div>
                <motion.div className="bpt__part" initial={reduce ? false : { opacity: 0, x: -60, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.8, ease: EASE_SCENE, delay: reduce ? 0 : 0.15 }}>
                  <span className="bpt__parthead">
                    <MonitorSmartphone size={15} strokeWidth={2} />
                    <b>Known devices</b>
                    <i>Device profile</i>
                  </span>
                  <span className="bpt__row">
                    <Laptop size={13} strokeWidth={2} />
                    Trusted device
                  </span>
                  <span className="bpt__row">
                    <Smartphone size={13} strokeWidth={2} />
                    At most 2 per person
                  </span>
                </motion.div>
              </motion.div>
            )}
            {f === 2 && (
              <motion.div key="chips" className="bpt__chips" initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: EASE_SCENE }}>
                <motion.span layoutId={hand ? 'story-zone' : undefined} className="bich is-slate bis-handoff is-lit" transition={{ layout: { duration: 0.9, ease: EASE_SCENE } }}>
                  <Globe size={12} strokeWidth={2.2} />
                  Corporate offices
                </motion.span>
                <motion.span layoutId={hand ? 'story-device' : undefined} className="bich is-slate bis-handoff is-lit" transition={{ layout: { duration: 0.9, ease: EASE_SCENE } }}>
                  <MonitorSmartphone size={12} strokeWidth={2.2} />
                  Known devices
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/* 3 · One rule: who it is for, the conditions — the zone and the device profile, arriving from slide 2 — and the
   outcome. The card itself travels on into slide 4 as rule 1. */
const RULE_MS = [4200, 2600] as const

function RuleStory({ reduce }: R) {
  const hand = useContext(HandoffContext)
  const f = useFrames(RULE_MS, reduce, useContext(StoryDoneContext))
  useMood('calm')
  return (
    <div className="bix bisx">
      <div className="bisx__scene">
        <AnimatePresence mode="wait">
          <motion.span key={f} className="bisc" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
            {f === 0 ? 'Put them in a rule' : 'People, conditions, outcome'}
          </motion.span>
        </AnimatePresence>
        <motion.div layoutId={hand ? 'story-card' : undefined} className="bic-card is-big" initial={hand || reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ layout: { duration: 0.9, ease: EASE_SCENE }, duration: 0.6 }}>
          <span className="bic-n">1</span>
          <div className="bic-rows">
            <motion.span className="bic-row" initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduce ? 0 : 0.2, duration: 0.5 }}>
              <i className="bic-k">{RULE_PART.who}</i>
              <Chip icon={Users}>Sales</Chip>
            </motion.span>
            <span className="bic-row">
              <i className="bic-k">{RULE_PART.if}</i>
              <span className="bis2__ors">
                <motion.span layoutId={hand ? 'story-zone' : undefined} className="bich is-slate" transition={{ layout: { duration: 0.9, ease: EASE_SCENE } }}>
                  <Globe size={12} strokeWidth={2.2} />
                  Corporate offices
                </motion.span>
                <motion.span layoutId={hand ? 'story-device' : undefined} className="bich is-slate" transition={{ layout: { duration: 0.9, ease: EASE_SCENE } }}>
                  <MonitorSmartphone size={12} strokeWidth={2.2} />
                  Known devices
                </motion.span>
              </span>
            </span>
            <motion.span className="bic-row" initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduce ? 0 : 1.5, duration: 0.5 }}>
              <i className="bic-k">{RULE_PART.then}</i>
              <Chip icon={KeyRound} tone="blue">
                Ask for 2FA
              </Chip>
            </motion.span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

/* 4 · The builder: that card lands as rule 1 of a policy with more rules under it; then the rules are read from the
   top, one at a time, down to the last row. */
const BUILDER_MS = [3800, 1000, 1000, 1000, 2600] as const
const BUILDER_RULES = [
  { n: '2', who: 'Contractors', then: 'Deny', icon: ShieldX },
  { n: 'else', who: 'Everyone else', then: 'Allow', icon: Check },
]

function BuilderStory({ reduce }: R) {
  const hand = useContext(HandoffContext)
  const f = useFrames(BUILDER_MS, reduce, useContext(StoryDoneContext))
  useMood('calm')
  const reading = f >= 1 && f <= 3 ? f - 1 : -1
  return (
    <div className="bix bisx">
      <div className="bisx__scene" >
        {f === 0 ? <KineticTitle text="Policy builder" reduce={reduce} /> : <Caption>{f <= 3 ? 'Rules are read from the top' : 'The first that matches decides'}</Caption>}
        <Win title="Policy builder" icon={Workflow} reduce={reduce} pick="Your rule, rule 1">
          <div className="bis-chain">
            <motion.span className="bic-start" {...enter(reduce, 0.5)}>
              <AppLogo appId="salesforce" size={16} />
              Sign-in to <b>Salesforce</b>
            </motion.span>
            <motion.div data-pick layoutId={hand ? 'story-card' : undefined} className={`bis-line${reading === 0 || f === 4 ? ' is-read' : ''}`} transition={{ layout: { duration: 0.9, ease: EASE_SCENE } }}>
              <span className="bic-n">1</span>
              <b>Sales</b>
              <span className="bis-if">Corporate offices · Known devices</span>
              <span className="bis-then">
                <KeyRound size={12} strokeWidth={2.2} />
                Ask for 2FA
              </span>
            </motion.div>
            {BUILDER_RULES.map((r, i) => (
              <motion.div key={r.n} className={`bis-line${r.n === 'else' ? ' is-else' : ''}${reading === i + 1 ? ' is-read' : ''}${f === 4 ? ' is-quiet' : ''}`} {...enter(reduce, 0.9 + i * 0.3)}>
                <span className="bic-n">{r.n === 'else' ? '·' : r.n}</span>
                <b>{r.who}</b>
                <span className="bis-then">
                  <r.icon size={12} strokeWidth={2.2} />
                  {r.then}
                </span>
              </motion.div>
            ))}
          </div>
        </Win>
      </div>
    </div>
  )
}

/* --- 3. Zones, in cuts: the zone, named; the kinds of network it can hold; the kinds of place; sign-ins checked -------- */

const ZONE_NETS = [
  { kind: 'IP address', v: '10.0.0.1' },
  { kind: 'IP network', v: '2001:db8::/32' },
  { kind: 'IP range', v: '10.1.0.1 – 10.1.0.99' },
  { kind: 'ASN', v: 'AS15169' },
]
const ZONE_PLACES = [
  { kind: 'Country', v: 'Japan' },
  { kind: 'City', v: 'Toronto' },
  { kind: 'City with a range', v: 'Within 50 km of Berlin' },
]
const ZONE_ARRIVALS = [
  { icon: Network, from: 'From 10.1.0.42', ok: true },
  { icon: Building2, from: 'From Toronto', ok: true },
  { icon: Coffee, from: 'From a café in Paris', ok: false },
]
const ZONES_MS = [3600, 2800, 2800, 1300, 1300, 3600] as const


function Zones({ reduce }: R) {
  /* Pieces travel between slides only when the story plays on; a press of Next or Back is a plain cut. */
  const hand = useContext(HandoffContext)
  /* 0 the zone · 1 its networks · 2 its places · 3-5 three sign-ins, answered */
  const f = useFrames(ZONES_MS, reduce, useContext(StoryDoneContext))
  const scene = f <= 2 ? 'zone' : 'check'
  const answered = Math.max(0, f - 2)
  useMood(answered >= 3 ? 'warn' : answered >= 1 ? 'allow' : 'calm')
  return (
    <div className="bix bisx">
      <AnimatePresence mode="wait">
        {scene === 'zone' ? (
          <motion.div key="zone" className="bisx__scene" initial={hand || reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -18 }} transition={{ duration: 0.75, ease: EASE_SCENE }}>
            {f === 0 ? <KineticTitle text="Zones" reduce={reduce} /> : <Caption>A zone is a set of networks and places</Caption>}
            <Win title="Zones" icon={Globe} reduce={reduce} pick="One zone, many places">
            <div className="bis3 is-handoff">
              <span className="bis3__head" data-pick>
                <motion.span layoutId={hand ? 'story-zone' : undefined} className="bis3__title" transition={{ layout: { duration: 0.9, ease: EASE_SCENE } }}>
                  <span className="bis3__mark">
                    <Globe size={20} strokeWidth={1.9} />
                  </span>
                  <b>Corporate offices</b>
                </motion.span>
                <span className="bix-pill is-info">Zone</span>
              </span>
              {f >= 1 &&
                [
                  { title: 'Networks', icon: Network, items: ZONE_NETS, lag: 0 },
                  { title: 'Locations', icon: MapPin, items: ZONE_PLACES, lag: ZONE_NETS.length * 0.35 + 0.3 },
                ].map((g) => (
                  <motion.div key={g.title} className="bis3__group" {...enter(reduce, g.lag)}>
                    <span className="bis3__label">
                      <g.icon size={12} strokeWidth={2.2} />
                      {g.title}
                    </span>
                    {g.items.map((x, i) => (
                      <motion.span key={x.v} className="bis3__kind" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : g.lag + 0.2 + i * 0.35, duration: 0.5 }}>
                        <span>{x.kind}</span>
                        <code>{x.v}</code>
                      </motion.span>
                    ))}
                  </motion.div>
                ))}
            </div>
            </Win>
          </motion.div>
        ) : (
          <motion.div key="check" className="bisx__scene" {...cut(reduce)}>
            <Caption>Then any rule can ask: is this sign-in inside?</Caption>
            <motion.span layoutId={hand ? 'story-zone-back' : undefined} className="bis3__tag" transition={{ layout: { duration: 0.9, ease: EASE_SCENE } }}>
              <Globe size={13} strokeWidth={2.2} />
              Corporate offices
            </motion.span>
            <div className="bis3__arrivals">
              {ZONE_ARRIVALS.map((a, i) => (
                <motion.div key={a.from} className={`bis3__arrival${i < answered ? (a.ok ? ' is-in' : ' is-out') : ''}`} {...enter(reduce, i * 0.3)}>
                  <a.icon size={14} strokeWidth={2} />
                  <span className="bis3__from">{a.from}</span>
                  <AnimatePresence>
                    {i < answered && (
                      <motion.span key="v" className={`bis3__verdict ${a.ok ? 'is-in' : 'is-out'}`} initial={reduce ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
                        {a.ok ? <Check size={12} strokeWidth={3} /> : <KeyRound size={12} strokeWidth={2.4} />}
                        {a.ok ? 'Inside' : 'Outside: ask for 2FA'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* --- 4. Device profiles in three scenes (owner, 4 Nov 2026: "the devices, the checks, the result"): the devices that
   sign in; each checked against the profile, a grid filling in; each device's answer. -------------------------------- */

const DEV3 = [
  { id: 'laptop', icon: Laptop, name: 'Work laptop', os: 'Windows 11', fails: [] as string[] },
  { id: 'phone', icon: Smartphone, name: 'Old phone', os: 'Android 10', fails: ['os', 'lock'] },
  { id: 'tablet', icon: Tablet, name: 'Tablet', os: 'iPadOS 17', fails: [] as string[] },
]
const DEV3_MS = [3600, 3000, 6600, 4600] as const
const DEV3_CAPTION = ['Introducing Device profiles', 'Every device that signs in', 'Each device, its own checks', 'Each gets its answer']

function Devices({ reduce }: R) {
  /* Pieces travel between slides only when the story plays on; a press of Next or Back is a plain cut. */
  const hand = useContext(HandoffContext)
  const f = useFrames(DEV3_MS, reduce, useContext(StoryDoneContext))
  useMood('calm')
  return (
    <div className="bix bisx">
      <AnimatePresence mode="wait">
        <motion.div key={f} className="bisx__scene" {...cut(reduce)} initial={reduce || (f === 0 && hand) ? false : { opacity: 0, y: 18, scale: 0.985 }}>
          {f === 0 ? <KineticTitle text="Device profiles" reduce={reduce} /> : <Caption>{DEV3_CAPTION[f]}</Caption>}
          {f === 0 && (
            <Win title="Device profiles" icon={MonitorSmartphone} reduce={reduce} pick="The device condition">
            <div className="bic-card is-big bis-reprise">
              <span className="bic-n">1</span>
              <div className="bic-rows">
                <span className="bic-row">
                  <i className="bic-k">{RULE_PART.if}</i>
                  <span className="bis2__ors">
                    <motion.span layoutId={hand ? 'story-zone-back' : undefined} className="bich is-slate is-dim" transition={{ layout: { duration: 0.9, ease: EASE_SCENE } }}>
                      <Globe size={12} strokeWidth={2.2} />
                      Corporate offices
                    </motion.span>
                    <motion.span data-pick className="bich is-slate bis-handoff is-lit" initial={reduce ? false : { scale: 1 }} animate={reduce ? undefined : { scale: [1, 1.08, 1] }} transition={{ delay: 0.8, duration: 0.8 }}>
                      <MonitorSmartphone size={12} strokeWidth={2.2} />
                      Device health
                    </motion.span>
                  </span>
                </span>
              </div>
            </div>
            </Win>
          )}
          {f === 1 && (
            <div className="bid5__lineup">
              {DEV3.map((d, i) => (
                <motion.div
                  key={d.id}
                  className="bid5__dev"
                  initial={reduce ? false : { opacity: 0, y: 30, rotate: i === 0 ? -6 : i === 2 ? 6 : 0 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, y: [0, -5, 0], rotate: 0 }}
                  transition={{ opacity: { delay: i * 0.25, duration: 0.5 }, rotate: { delay: i * 0.25, type: 'spring', stiffness: 120, damping: 12 }, y: { delay: 0.8 + i * 0.3, duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
                >
                  <span className="bid5__devicon">
                    <d.icon size={38} strokeWidth={1.4} />
                  </span>
                  <b>{d.name}</b>
                  <span className="bid5__os">{d.os}</span>
                </motion.div>
              ))}
            </div>
          )}
          {f === 2 && <DeviceGrid reduce={reduce} />}
          {f === 3 && (
            <div className="bid5__answers">
              {DEV3.map((d, i) => {
                const ok = d.fails.length === 0
                return (
                  <motion.div
                    key={d.id}
                    layoutId={hand && d.id === 'laptop' ? 'story-laptop' : undefined}
                    className={`bid5__answer ${ok ? 'is-pass' : 'is-warn'}`}
                    style={{ transformPerspective: 600 }}
                    initial={reduce ? false : { opacity: 0, rotateX: -70, y: -10 }}
                    animate={{ opacity: 1, rotateX: 0, y: 0 }}
                    transition={{ delay: reduce ? 0 : 0.2 + i * 0.35, type: 'spring', stiffness: 140, damping: 14 }}
                  >
                    <span className="bid5__answericon">
                      <d.icon size={18} strokeWidth={1.8} />
                    </span>
                    <b>{d.name}</b>
                    <span className="bid5__verdict">
                      {ok ? <Check size={12} strokeWidth={3} /> : <RefreshCw size={12} strokeWidth={2.6} />}
                      {ok ? 'Signs in' : 'Update first'}
                    </span>
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* The checks, a device at a time (owner, 4 Nov 2026): phone, then tablet, then laptop, each with the checks that suit
   it. The device turns in as it arrives, and the ring of checks turns a quarter round to bring the next set in. */
const SCAN = [
  {
    id: 'phone',
    icon: Smartphone,
    name: 'Old phone',
    checks: [
      { id: 'os', icon: Smartphone, label: 'Android version' },
      { id: 'app', icon: RefreshCw, label: 'App version' },
      { id: 'integrity', icon: ShieldCheck, label: 'Not rooted' },
      { id: 'lock', icon: Lock, label: 'Screen lock' },
    ],
    fails: ['os', 'lock'],
  },
  {
    id: 'tablet',
    icon: Tablet,
    name: 'Tablet',
    checks: [
      { id: 'os', icon: Tablet, label: 'iPadOS version' },
      { id: 'browser', icon: Globe, label: 'Browser' },
      { id: 'integrity', icon: ShieldCheck, label: 'Not jailbroken' },
      { id: 'lock', icon: Lock, label: 'Passcode' },
    ],
    fails: [] as string[],
  },
  {
    id: 'laptop',
    icon: Laptop,
    name: 'Work laptop',
    checks: [
      { id: 'os', icon: Monitor, label: 'Windows version' },
      { id: 'browser', icon: Globe, label: 'Browser' },
      { id: 'integrity', icon: ShieldCheck, label: 'Integrity' },
      { id: 'lock', icon: Lock, label: 'Screen lock' },
    ],
    fails: [] as string[],
  },
]

function DeviceGrid({ reduce }: R) {
  const per = 5
  const total = SCAN.length * per
  const [n, setN] = useState(reduce ? total - 1 : 0)
  useEffect(() => {
    if (reduce || n >= total - 1) return
    const t = window.setTimeout(() => setN((v) => v + 1), n % per === 0 ? 900 : 360)
    return () => window.clearTimeout(t)
  }, [n, total, reduce])
  const di = Math.floor(n / per)
  const d = SCAN[di]
  const k = n % per
  return (
    <div className="bid6">
      {!reduce && <motion.span key={`ring-${d.id}`} className="bid6__ring" initial={{ scale: 0.4, opacity: 0.6 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />}
      <AnimatePresence mode="wait">
        <motion.div
          key={d.id}
          className="bid6__core"
          style={{ transformPerspective: 700 }}
          initial={reduce ? false : { opacity: 0, rotateY: -90 }}
          animate={{ opacity: 1, rotateY: 0 }}
          exit={reduce ? undefined : { opacity: 0, rotateY: 90 }}
          transition={{ duration: 0.45, ease: EASE_SCENE }}
        >
          <motion.span
            className="bid6__coreicon"
            initial={false}
            animate={reduce || d.id !== 'phone' ? { rotate: 0 } : { rotate: [0, -90, -90, 0] }}
            transition={{ duration: 1.6, times: [0, 0.3, 0.7, 1], ease: 'easeInOut', delay: 0.3 }}
          >
            <d.icon size={34} strokeWidth={1.5} />
          </motion.span>
          <b>{d.name}</b>
        </motion.div>
      </AnimatePresence>
      {[0, 1, 2, 3].map((j) => {
        const c = d.checks[j]
        const done = k > j
        const fail = d.fails.includes(c.id)
        /* Each slot moves a quarter round per device: the ring turns. */
        const angle = ((-90 + j * 90 + di * 90) * Math.PI) / 180
        return (
          <motion.span
            key={j}
            className={`bid6__req${done ? (fail ? ' is-fail' : ' is-pass') : ''}`}
            initial={false}
            animate={{ x: Math.cos(angle) * 132, y: Math.sin(angle) * 94 }}
            transition={{ duration: reduce ? 0 : 0.8, ease: EASE_SCENE }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={c.label} className="bid6__reqlabel" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.25 }}>
                <c.icon size={13} strokeWidth={2} />
                {c.label}
              </motion.span>
            </AnimatePresence>
            <AnimatePresence>
              {done && (
                <motion.i key={`${d.id}-${c.id}`} className="bid6__mark" initial={reduce ? false : { scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 18 }}>
                  {fail ? <X size={10} strokeWidth={3.2} /> : <Check size={10} strokeWidth={3.2} />}
                </motion.i>
              )}
            </AnimatePresence>
          </motion.span>
        )
      })}
    </div>
  )
}

/* Check access in three shots (owner, 4 Nov 2026): who signs in, with what about them; the policy's rules walked; the
   sign-in itself, password typed, code asked, and in. */
const ACCESS_MS = [3800, 6400, 7600] as const
const ACCESS_CAPTION = ['Introducing Check access', 'Each rule is asked in turn', 'What Priya sees']
const PRIYA_FACTS = [
  { icon: Users, t: 'Sales' },
  { icon: Laptop, t: 'Work laptop' },
  { icon: Building2, t: 'Bengaluru office' },
  { icon: Clock, t: '11:00' },
]

function CheckAccess({ reduce }: R) {
  /* Pieces travel between slides only when the story plays on; a press of Next or Back is a plain cut. */
  const hand = useContext(HandoffContext)
  const f = useFrames(ACCESS_MS, reduce, useContext(StoryDoneContext))
  useMood('calm')
  return (
    <div className="bix bisx">
      <AnimatePresence mode="wait">
        <motion.div
          key={f}
          className="bisx__scene"
          initial={reduce || (f === 0 && hand) ? false : f === 0 ? { opacity: 0, y: 18 } : { opacity: 0, x: 90 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={reduce ? undefined : f === 0 ? { opacity: 0, x: -40 } : { opacity: 0, x: -90 }}
          transition={{ duration: 0.7, ease: EASE_SCENE }}
        >
          {f === 0 ? <KineticTitle text="Check access" reduce={reduce} /> : <Caption>{ACCESS_CAPTION[f]}</Caption>}
          {f === 0 && (
            <Win title="Check access" icon={UserCheck} reduce={reduce} pick="Who signs in">
              <motion.div data-pick className="bis5__node is-big" {...enter(reduce, 0.2)}>
                <span className="bis5__face">PS</span>
                <span>
                  <b>Priya Sharma</b> signs in to
                </span>
                <span className="bis5__app">
                  <AppLogo appId="salesforce" size={16} />
                  <b>Salesforce</b>
                </span>
              </motion.div>
              <div className="bis5__facts">
                {PRIYA_FACTS.map((x, i) =>
                  x.t === 'Work laptop' ? (
                    <motion.span key={x.t} layoutId={hand ? 'story-laptop' : undefined} className="bich" transition={{ layout: { duration: 0.9, ease: EASE_SCENE } }}>
                      <x.icon size={12} strokeWidth={2.2} />
                      {x.t}
                    </motion.span>
                  ) : (
                  <motion.span key={x.t} className="bich" {...enter(reduce, 0.4 + i * 0.3)}>
                    <x.icon size={12} strokeWidth={2.2} />
                    {x.t}
                  </motion.span>
                  ),
                )}
              </div>
            </Win>
          )}
          {f === 1 && <CheckTrace reduce={reduce} />}
          {f === 2 && (
            <>
              <motion.span
                className="bis7__verdict"
                style={{ originY: 0 }}
                initial={reduce ? false : { opacity: 0, rotate: -14, y: -16 }}
                animate={{ opacity: 1, rotate: 0, y: 0 }}
                transition={{ delay: reduce ? 0 : 0.5, type: 'spring', stiffness: 140, damping: 7 }}
              >
                <KeyRound size={13} strokeWidth={2.2} />
                Allowed with 2FA
              </motion.span>
              <SignInScreen reduce={reduce} />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

const SIGNIN_MS = [600, 170, 170, 170, 170, 170, 170, 170, 700, 2000, 3000] as const

/* The sign-in page itself: email filled, the password typed a dot at a time, the code asked for, then in. */
function SignInScreen({ reduce }: R) {
  /* 0 email · 1-8 password dots, quick, the last held a beat · 9 code · 10 in */
  const s = useFrames(SIGNIN_MS, reduce)
  const dots = Math.min(8, Math.max(0, s))
  const stage = s < 9 ? 'password' : s === 9 ? 'code' : 'in'
  return (
    <div className="bis5__page bis7__page">
      <span className="bis5__bar">
        <Lock size={10} strokeWidth={2.4} />
        salesforce.com
      </span>
      <div className="bis7__body">
        <span className="bis7__brand">
          <AppLogo appId="salesforce" size={26} />
        </span>
        <AnimatePresence mode="wait">
          {stage === 'password' && (
            <motion.div key="pw" className="bis7__form" {...cut(reduce)}>
              <span className="bis7__field">
                <i>Email</i>
                priya.sharma@acme.com
              </span>
              <span className="bis7__field is-active">
                <i>Password</i>
                <span className="bis7__dots">
                  {'•'.repeat(dots)}
                  <motion.span className="bis7__caret" animate={reduce ? undefined : { opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
                </span>
              </span>
              <span className="bis7__btn">Sign in</span>
            </motion.div>
          )}
          {stage === 'code' && (
            <motion.div key="code" className="bis7__form" {...cut(reduce)}>
              <b className="bis7__ask">Enter the code sent to your email</b>
              <span className="bis5__code">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <motion.i key={i} initial={reduce ? false : { opacity: 0.2 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 0.3 + i * 0.18 }}>
                    •
                  </motion.i>
                ))}
              </span>
            </motion.div>
          )}
          {stage === 'in' && (
            <motion.div key="in" className="bis7__form is-in" initial={reduce ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
              <motion.span className="bis5__ok" initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>
                <Check size={18} strokeWidth={2.8} />
              </motion.span>
              <b>Signed in</b>
              <em>Welcome back, Priya</em>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* --- 5. Check access, as one trace (owner, 4 Nov 2026: "come up with different visuals"): who signs in at the top, the
   policy's rules under it, one marker walking down them; rule 1 is passed by, rule 2 holds, and the answer lands under the
   policy with its reason. No cuts: the marker is one element travelling. ------------------------------------------------ */

const CHECK_MS = [600, 1300, 1300, 1500, 4000] as const
const CHECK_RULES = [
  { n: 1, name: 'Contractors away from the office', why: 'Not in Contractors' },
  { n: 2, name: 'Sales on a work device', why: 'Sales · work laptop' },
  { n: 3, name: 'Everyone else', why: '' },
]

function CheckTrace({ reduce }: R) {
  /* 0 the sign-in arrives · 1 at rule 1 · 2 rule 1 passed by · 3 at rule 2, it holds · 4 the answer */
  const f = useFrames(CHECK_MS, reduce)
  useMood('calm')
  const at = f === 0 ? -1 : f <= 2 ? 0 : 1
  return (
    <>
        <motion.span className="bis6__who" initial={reduce ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          <span className="bis5__face">PS</span>
          <b>Priya Sharma</b>
          <ArrowRight size={13} strokeWidth={2} className="bis6__arrow" />
          <AppLogo appId="salesforce" size={16} />
          <b>Salesforce</b>
        </motion.span>
        <span className="bis6__stem" aria-hidden />
        <div className="bis6__policy">
          {CHECK_RULES.map((r, i) => {
            const passed = (i === 0 && f >= 2) || false
            const holds = i === 1 && f >= 3
            const dim = f >= 3 && i === 2
            return (
              <div key={r.n} className={`bis6__rule${passed ? ' is-passed' : ''}${holds ? ' is-holds' : ''}${dim ? ' is-dim' : ''}`}>
                <span className="bic-n">{r.n === 3 ? '·' : r.n}</span>
                <b>{r.name}</b>
                <span className="bis6__end">
                  {at === i && <motion.span layoutId="bis6-marker" className="bis6__marker" transition={{ type: 'spring', stiffness: 120, damping: 18 }} />}
                  <AnimatePresence>
                    {passed && (
                      <motion.span key="x" className="bis6__why" initial={reduce ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                        <X size={11} strokeWidth={3} />
                        {r.why}
                      </motion.span>
                    )}
                    {holds && (
                      <motion.span key="y" className="bis6__why is-yes" initial={reduce ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                        <Check size={11} strokeWidth={3} />
                        {r.why}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </div>
            )
          })}
        </div>
    </>
  )
}

/* --- 6. The close: every application, popping in around the builder, gently afloat, waiting to move -------------------- */

const RING = ['salesforce', 'slack', 'zoom', 'workday', 'm365', 'servicenow', 'github', 'jira', 'google', 'dropbox']
const spot = (i: number) => {
  const a = (i / RING.length) * Math.PI * 2 - Math.PI / 2
  return { x: 50 + 40 * Math.cos(a), y: 50 + 40 * Math.sin(a) }
}

const ORBIT_S = 40

function MoveStory({ reduce }: R) {
  useMood('multi')
  return (
    <div className="bih">
      <svg className="bih__orbit" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="40" />
        <circle cx="50" cy="50" r="27" className="is-inner" />
      </svg>
      {/* The ring turns slowly, for ever (owner, 4 Nov 2026); each logo turns back the other way so it stays upright. */}
      <motion.div className="bih__spin" animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: ORBIT_S, repeat: Infinity, ease: 'linear' }}>
      {RING.map((app, i) => {
        const p = spot(i)
        return (
          <span key={app} className="bih__spot" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <motion.span
              className="bih__app"
              initial={reduce ? false : { opacity: 0, scale: 0.3 }}
              animate={reduce ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: [0, -5, 0], rotate: -360 }}
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                      opacity: { delay: 0.15 + i * 0.09, duration: 0.3 },
                      scale: { delay: 0.15 + i * 0.09, type: 'spring', stiffness: 480, damping: 16 },
                      y: { delay: 1.2 + i * 0.2, duration: 3.2, repeat: Infinity, ease: 'easeInOut' },
                      rotate: { duration: ORBIT_S, repeat: Infinity, ease: 'linear' },
                    }
              }
            >
              <AppLogo appId={app} size={26} />
            </motion.span>
          </span>
        )
      })}
      </motion.div>
      <div className="bih__hub">
        {!reduce && <motion.span className="bih__ring" aria-hidden animate={{ scale: [1, 1.5], opacity: [0.35, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }} />}
        <motion.span className="bih__core" initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 18 }}>
          <ShieldCheck size={30} strokeWidth={1.8} />
        </motion.span>
      </div>
    </div>
  )
}
