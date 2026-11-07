import { useEffect, useState, type ReactNode } from 'react'
import { motion, useReducedMotion, AnimatePresence } from 'motion/react'
import { ArrowLeft, ArrowRight, Pause } from 'lucide-react'
import { Button } from '../kit'
import { RESOLVED_LOGOS } from '../logos/manifest.generated'
import './intro-story2.css'

/* -----------------------------------------------------------------------------
   The intro, Story v2 (owner, 5 Nov 2026; redone the same day: "very bad execution,
   please redo", with five references: an isometric layer stack fed by wires, an
   isometric card graph, a fan of curves into one point, a pile through a glowing gate,
   a node with labelled branches). Light grey stage, blue as the one accent.

     How it works today        app cards wired into a two-layer stack: App Login, Adaptive Access
     One policy, taken apart   the stack lifts apart: who, how, when and where, devices
     Parts you can reuse       a zone and a device profile fanning out to many policies
     Built again               an isometric card graph: sign-in, rules, everyone else
     Moved, reviewed, active   old pages through a gate into one active policy

   Each scene is one SVG drawn in true isometric (a slab has a top, a front and a side;
   its words sit on the top face). Motion moves whole groups by x / y / opacity and
   draws wires by pathLength; nothing carries a CSS transform. Each slide plays its
   beats, rests, then walks on; hovering the stage holds it. Reduced motion shows each
   slide settled. The last Next hands on to the closing panel.
   -------------------------------------------------------------------------- */

const EASE = [0.22, 1, 0.36, 1] as const
const BEAT_MS = 1150
const REST_MS = 2000

/* --- Isometric drawing -------------------------------------------------------------- */

const C = 0.866
const S = 0.5
type P = [number, number]
type Iso = (x: number, y: number, z?: number) => P
const pts = (a: P[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
const logo = (id: string) => RESOLVED_LOGOS[id]?.file ?? undefined

function makeIso(ox: number, oy: number): Iso {
  return (x, y, z = 0) => [ox + (x - y) * C, oy + (x + y) * S - z]
}

type Tone = 'plain' | 'outline' | 'lit'

/** A slab: top, front (+y) and side (+x) faces. Children draw on the top face in its own units (u along x, v along y). */
function Slab({ iso, x, y, z = 0, w, d, h = 8, tone = 'plain', children }: { iso: Iso; x: number; y: number; z?: number; w: number; d: number; h?: number; tone?: Tone; children?: ReactNode }) {
  const top = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const front = [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)]
  const side = [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)]
  const [tx, ty] = iso(x, y, z + h)
  return (
    <g className={`s2s is-${tone}`}>
      <polygon points={pts(front)} className="s2s__front" />
      <polygon points={pts(side)} className="s2s__side" />
      <polygon points={pts(top)} className="s2s__top" />
      {children && <g transform={`matrix(${C},${S},${-C},${S},${tx.toFixed(1)},${ty.toFixed(1)})`}>{children}</g>}
    </g>
  )
}

/** An isometric wire: a polyline through 3D points, drawn by pathLength, a dot where it lands. */
function Wire({ iso, path, on, delay = 0, reduce }: { iso: Iso; path: [number, number, number][]; on: boolean; delay?: number; reduce: boolean }) {
  const d = 'M' + path.map(([x, y, z]) => iso(x, y, z).map((n) => n.toFixed(1)).join(' ')).join(' L')
  const last = path[path.length - 1]
  const end = iso(last[0], last[1], last[2])
  return (
    <g className="s2w">
      <path d={d} className="s2w__track" />
      <motion.path d={d} className="s2w__live" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: on ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : delay, ease: 'easeInOut' }} />
      <motion.circle cx={end[0]} cy={end[1]} r={3.5} className="s2w__dot" initial={false} animate={{ opacity: on ? 1 : 0 }} transition={{ delay: reduce ? 0 : delay + 0.8 }} />
    </g>
  )
}

function Defs() {
  return (
    <defs>
      <filter id="s2-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b" />
        <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.05  0 0 0 0 0.43  0 0 0 0 0.99  0 0 0 0.55 0" />
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <linearGradient id="s2-fan" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#0d6efd" />
        <stop offset="1" stopColor="#1a7f4b" />
      </linearGradient>
      <linearGradient id="s2-funnel" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#0d6efd" stopOpacity="0.26" />
        <stop offset="1" stopColor="#0d6efd" stopOpacity="0.02" />
      </linearGradient>
    </defs>
  )
}

type Scene = (p: { beat: number; reduce: boolean }) => ReactNode

/* --- 1. How it works today ---------------------------------------------------------- */

const APPS = [
  ['salesforce', 'Salesforce'],
  ['workday', 'Workday'],
  ['servicenow', 'ServiceNow'],
  ['slack', 'Slack'],
]
const SceneToday: Scene = ({ beat, reduce }) => {
  const iso = makeIso(405, 120)
  return (
    <svg viewBox="0 0 640 440" className="s2svg" aria-hidden>
      <Defs />
      {APPS.map((_, n) => (
        <Wire key={n} iso={iso} reduce={reduce} on={beat >= 1} delay={n * 0.12} path={[[-20, 70 + n * 56 + 17, 3], [20 + n * 10, 70 + n * 56 + 17, 3], [20 + n * 10, 150, 3], [70, 150, 3]]} />
      ))}
      <motion.g initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
        <Slab iso={iso} x={70} y={40} z={0} w={210} d={210} h={16}>
          <text x={18} y={188} className="s2t is-big">App Login policy</text>
          <text x={18} y={202} className="s2t is-sub">who signs in, and how</text>
        </Slab>
      </motion.g>
      <motion.g initial={false} animate={{ opacity: beat >= 2 ? 1 : 0, y: beat >= 2 ? 0 : -50 }} transition={{ duration: 0.8, ease: EASE }}>
        <Slab iso={iso} x={70} y={40} z={78} w={210} d={210} h={16} tone="outline">
          <text x={18} y={188} className="s2t is-big is-blue">Adaptive Access policy</text>
          <text x={18} y={202} className="s2t is-sub">when, where, on what device</text>
        </Slab>
      </motion.g>
      {APPS.map(([id, name], n) => (
        <motion.g key={id} initial={reduce ? false : { opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: reduce ? 0 : 0.1 + n * 0.1, ease: EASE }}>
          <Slab iso={iso} x={-190} y={70 + n * 56} z={0} w={170} d={34} h={7}>
            {logo(id) && <image href={logo(id)} x={12} y={9} width={16} height={16} />}
            <text x={36} y={22} className="s2t">{name}</text>
            <rect x={130} y={8} width={28} height={18} rx={3} className="s2grid" />
          </Slab>
        </motion.g>
      ))}
    </svg>
  )
}

/* --- 2. One policy, taken apart ----------------------------------------------------- */

const PARTS = [
  ['Devices', 'at most 2 devices'],
  ['When and where', 'working hours · India'],
  ['How', 'password, then OTP'],
  ['Who', 'Sales · Finance'],
]
const SceneApart: Scene = ({ beat }) => {
  const iso = makeIso(330, 236)
  const lit = beat - 2
  return (
    <svg viewBox="0 0 640 440" className="s2svg" aria-hidden>
      <Defs />
      {PARTS.map(([name, sub], n) => {
        const z = beat >= 1 ? n * 54 : n * 16
        const on = lit === PARTS.length - 1 - n
        const done = lit > PARTS.length - 1 - n
        return (
          <motion.g key={name} initial={false} animate={{ y: -z, x: beat >= 1 ? n * 14 : 0 }} transition={{ duration: 0.85, ease: EASE, delay: beat >= 1 ? n * 0.05 : 0 }} filter={on ? 'url(#s2-glow)' : undefined}>
            <Slab iso={iso} x={-40} y={-40} z={0} w={175} d={175} h={13} tone={on ? 'lit' : done ? 'outline' : 'plain'}>
              <text x={14} y={148} className={`s2t is-big${on ? ' is-white' : done ? ' is-blue' : ''}`}>{name}</text>
              <text x={14} y={163} className={`s2t is-sub${on ? ' is-white' : ''}`}>{sub}</text>
            </Slab>
          </motion.g>
        )
      })}
      <motion.g initial={false} animate={{ opacity: beat >= 1 ? 1 : 0 }}>
        <text x={40} y={420} className="s2cap">One App Login row and its Adaptive check, as four parts</text>
      </motion.g>
    </svg>
  )
}

/* --- 3. Parts you can reuse --------------------------------------------------------- */

const TARGETS = ['salesforce', 'workday', 'servicenow', 'slack', 'github', 'zoom']
const TARGET_NAMES: Record<string, string> = { salesforce: 'Salesforce', workday: 'Workday', servicenow: 'ServiceNow', slack: 'Slack', github: 'GitHub', zoom: 'Zoom' }
const SOURCES = [
  { y: 150, title: 'India only', sub: 'Zone · from a country check', to: [0, 1, 2, 4] },
  { y: 290, title: 'Trusted device', sub: 'Device profile · from a device limit', to: [1, 3, 4, 5] },
]
const SceneReuse: Scene = ({ beat, reduce }) => (
  <svg viewBox="0 0 640 440" className="s2svg" aria-hidden>
    <Defs />
    {SOURCES.map((s, si) =>
      s.to.map((t, k) => {
        const ty = 52 + t * 66
        const d = `M256 ${s.y} C 340 ${s.y}, 370 ${ty}, 452 ${ty}`
        return (
          <g key={`${si}-${t}`}>
            <path d={d} className="s2f__track" />
            <motion.path d={d} className="s2f__live" initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: beat >= 1 ? 1 : 0, opacity: beat >= 1 ? 1 : 0 }} transition={{ duration: reduce ? 0 : 1, delay: reduce ? 0 : si * 0.35 + k * 0.1, ease: 'easeInOut' }} />
          </g>
        )
      }),
    )}
    {SOURCES.map((s, si) => (
      <motion.g key={s.title} initial={reduce ? false : { opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: reduce ? 0 : si * 0.15, ease: EASE }}>
        <rect x={10} y={s.y - 34} width={246} height={68} rx={14} className="s2n" filter={beat >= 2 ? 'url(#s2-glow)' : undefined} />
        <rect x={24} y={s.y - 18} width={36} height={36} rx={9} className="s2n__ico" />
        {si === 0 ? (
          <path d={`M42 ${s.y - 9} a7 7 0 0 1 7 7 c0 5 -7 12 -7 12 s-7 -7 -7 -12 a7 7 0 0 1 7 -7 z`} className="s2n__glyph" />
        ) : (
          <path d={`M33 ${s.y - 8} h14 a2 2 0 0 1 2 2 v9 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 v-9 a2 2 0 0 1 2 -2 z M37 ${s.y + 9} h6`} className="s2n__glyph" />
        )}
        <text x={72} y={s.y - 2} className="s2t is-big">{s.title}</text>
        <text x={72} y={s.y + 15} className="s2t is-sub">{s.sub}</text>
      </motion.g>
    ))}
    {TARGETS.map((id, t) => {
      const ty = 52 + t * 66
      return (
        <motion.g key={id} initial={reduce ? false : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: reduce ? 0 : 0.3 + t * 0.08, ease: EASE }}>
          <motion.circle cx={452} cy={ty} r={4} className="s2f__dot" initial={false} animate={{ opacity: beat >= 1 ? 1 : 0 }} transition={{ delay: reduce ? 0 : 1.1 }} />
          <rect x={462} y={ty - 20} width={160} height={40} rx={10} className={`s2p${beat >= 2 ? ' is-on' : ''}`} />
          {logo(id) && <image href={logo(id)} x={474} y={ty - 8} width={16} height={16} />}
          <text x={498} y={ty + 4} className="s2t">{TARGET_NAMES[id]} sign-in</text>
        </motion.g>
      )
    })}
  </svg>
)

/* --- 4. Built again in the Policy builder ------------------------------------------- */

const CARDS: { y: number; x: number; title: string; sub: string; tone: Tone }[] = [
  { x: -150, y: -10, title: 'A sign-in arrives', sub: 'at Salesforce', tone: 'outline' },
  { x: -65, y: 82, title: '1  Sales, outside hours', sub: 'who Sales · if outside 08:00–20:00 · then Deny', tone: 'plain' },
  { x: 20, y: 174, title: '2  Finance', sub: 'who Finance · if outside India · then Deny', tone: 'plain' },
  { x: 105, y: 266, title: 'Everyone else', sub: 'then password, then OTP', tone: 'plain' },
]
const SceneBuilt: Scene = ({ beat, reduce }) => {
  const iso = makeIso(330, 98)
  return (
    <svg viewBox="0 0 640 440" className="s2svg" aria-hidden>
      <Defs />
      {CARDS.slice(1).map((c, n) => {
        const a = CARDS[n]
        return <Wire key={c.title} iso={iso} reduce={reduce} on={beat > n} delay={0.2} path={[[a.x + 30, a.y + 66, 2], [a.x + 30, c.y + 30, 2], [c.x, c.y + 30, 2]]} />
      })}
      {CARDS.map((c, n) => {
        const lit = beat >= 4 && n === 3
        return (
          <motion.g key={c.title} initial={false} animate={{ opacity: beat >= n ? 1 : 0, y: beat >= n ? 0 : -36 }} transition={{ duration: reduce ? 0 : 0.6, ease: EASE }} filter={lit ? 'url(#s2-glow)' : undefined}>
            <Slab iso={iso} x={c.x} y={c.y} w={220} d={66} h={6} tone={lit ? 'lit' : c.tone}>
              {n === 0 && logo('salesforce') && <image href={logo('salesforce')} x={14} y={14} width={16} height={16} />}
              <text x={n === 0 ? 38 : 14} y={27} className={`s2t is-big${lit ? ' is-white' : n === 0 ? ' is-blue' : ''}`}>{c.title}</text>
              <text x={14} y={50} className={`s2t is-sub${lit ? ' is-white' : ''}`}>{c.sub}</text>
            </Slab>
          </motion.g>
        )
      })}
      <motion.g initial={false} animate={{ opacity: beat >= 4 ? 1 : 0 }}>
        <text x={30} y={430} className="s2cap">Read from the top: the first rule that matches decides</text>
      </motion.g>
    </svg>
  )
}

/* --- 5. Moved, reviewed, active ----------------------------------------------------- */

const PILE: [number, number, number][] = [
  [40, 90, -12], [96, 60, 8], [70, 150, -4], [130, 120, 14], [36, 210, 6], [108, 196, -10], [160, 170, 4], [60, 280, -8], [132, 262, 10], [180, 230, -6], [90, 340, 12], [160, 320, -4], [210, 290, 8],
]
const STATES = ['Draft', 'Approved', 'Active']
const SceneMove: Scene = ({ beat, reduce }) => {
  const state = Math.min(STATES.length - 1, Math.max(0, beat - 1))
  const active = state === 2 && beat >= 3
  return (
    <svg viewBox="0 0 640 440" className="s2svg" aria-hidden>
      <Defs />
      <path d="M300 120 L300 320 C 380 290, 420 236, 470 226 L470 214 C 420 204, 380 150, 300 120 Z" fill="url(#s2-funnel)" />
      {PILE.map(([x, y, r], n) => (
        <motion.g key={n} initial={false} animate={beat >= 1 && !reduce ? { x: [0, 286 - x], y: [0, 220 - y], opacity: [1, 0] } : { x: 0, y: 0, opacity: beat >= 1 ? 0 : 1 }} transition={{ duration: 1.3, delay: n * 0.07, ease: 'easeIn' }}>
          <g transform={`rotate(${r} ${x + 18} ${y + 22})`}>
            <rect x={x} y={y} width={36} height={44} rx={5} className="s2doc" />
            <rect x={x + 7} y={y + 9} width={14} height={4} rx={2} className="s2doc__line" />
            <rect x={x + 7} y={y + 18} width={22} height={3} rx={1.5} className="s2doc__line is-soft" />
            <rect x={x + 7} y={y + 25} width={18} height={3} rx={1.5} className="s2doc__line is-soft" />
          </g>
        </motion.g>
      ))}
      <text x={40} y={420} className="s2cap">App Login and Adaptive Access pages</text>
      <rect x={290} y={100} width={20} height={240} rx={10} className={`s2gate${beat >= 1 ? ' is-on' : ''}`} filter={beat >= 1 ? 'url(#s2-glow)' : undefined} />
      <rect x={296} y={112} width={8} height={216} rx={4} className="s2gate__core" />
      <g className="s2cross">
        <line x1={540} y1={110} x2={540} y2={150} />
        <line x1={540} y1={290} x2={540} y2={330} />
        <line x1={430} y1={220} x2={452} y2={220} />
        <line x1={628} y1={220} x2={640} y2={220} />
        <circle cx={540} cy={220} r={92} />
      </g>
      <motion.g initial={false} animate={{ opacity: beat >= 1 ? 1 : 0.3 }} transition={{ duration: 0.6, ease: EASE }}>
        <rect x={456} y={180} width={168} height={80} rx={14} className={`s2target${active ? ' is-on' : ''}`} filter={active ? 'url(#s2-glow)' : undefined} />
        {logo('salesforce') && <image href={logo('salesforce')} x={470} y={194} width={18} height={18} />}
        <text x={496} y={208} className="s2t">Salesforce sign-in</text>
        <AnimatePresence mode="wait">
          <motion.g key={state} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
            <rect x={470} y={224} width={state === 1 ? 74 : 56} height={22} rx={11} className={`s2pill is-${STATES[state].toLowerCase()}`} />
            <text x={state === 1 ? 507 : 498} y={239} textAnchor="middle" className={`s2t is-pill is-${STATES[state].toLowerCase()}`}>
              {STATES[state]}
            </text>
          </motion.g>
        </AnimatePresence>
      </motion.g>
    </svg>
  )
}

const SLIDES: { title: string; line: string; beats: number; scene: Scene }[] = [
  { title: 'How it works today', line: 'Every application is set up on two pages: App Login for who signs in and how, Adaptive Access for when, where and on what device.', beats: 3, scene: SceneToday },
  { title: 'One policy, taken apart', line: 'The move reads every old row with its Adaptive check and splits it into four parts.', beats: 7, scene: SceneApart },
  { title: 'Parts you can reuse', line: 'Places and IP ranges become zones. Device limits become device profiles. Make one once, use it in any policy.', beats: 3, scene: SceneReuse },
  { title: 'Built again in the Policy builder', line: 'The parts go back together as one policy per application: rules in the order you had, Everyone else last.', beats: 5, scene: SceneBuilt },
  { title: 'Moved, reviewed, active', line: 'Moved policies arrive inactive, as drafts. Review them, make them active, and they join your new policies. The old ones stay.', beats: 4, scene: SceneMove },
]

export function IntroStory2({ extra, onStart, onLater }: { extra?: ReactNode; onStart: () => void; onLater: () => void }) {
  const reduce = useReducedMotion() === true
  const [at, setAt] = useState(0)
  const [beat, setBeat] = useState(reduce ? 99 : 0)
  const [hold, setHold] = useState(false)
  const slide = SLIDES[at]
  const last = at === SLIDES.length - 1
  const go = (n: number) => {
    setAt(n)
    setBeat(reduce ? 99 : 0)
  }
  /* The clock: a beat at a time, a rest after the last one, then the next slide. Held while hovered. */
  useEffect(() => {
    if (reduce || hold) return
    const done = beat >= slide.beats - 1
    if (done && last) return
    const t = window.setTimeout(() => (done ? go(at + 1) : setBeat((b) => b + 1)), done ? REST_MS : BEAT_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, at, hold, reduce])
  const Scene = slide.scene
  return (
    <div className="bs2">
      <div className="bs2__stage" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={at} className="bs2__scene" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.3 }}>
            <Scene beat={beat} reduce={reduce} />
          </motion.div>
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`w${at}`} className="bs2__words" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.35, ease: EASE }}>
            <h2>{slide.title}</h2>
            <p>{slide.line}</p>
          </motion.div>
        </AnimatePresence>
        {hold && !reduce && (
          <span className="bs2__paused">
            <Pause size={11} strokeWidth={2.4} aria-hidden /> Paused
          </span>
        )}
      </div>

      <footer className="bs2__foot">
        <Button variant="secondary" onClick={onLater}>
          Not now
        </Button>
        <span className="bs2__tools">{extra}</span>
        <span className="bs2__dots" role="group" aria-label="Slides">
          {SLIDES.map((s, n) => (
            <button key={s.title} type="button" aria-label={s.title} aria-current={n === at ? 'step' : undefined} className={n === at ? 'is-on' : ''} onClick={() => go(n)}>
              {n === at && !reduce && !hold && (n < SLIDES.length - 1 || beat < slide.beats - 1) && (
                <motion.i key={`${at}-${beat}`} initial={{ width: `${(beat / slide.beats) * 100}%` }} animate={{ width: `${((beat + 1) / slide.beats) * 100}%` }} transition={{ duration: BEAT_MS / 1000, ease: 'linear' }} />
              )}
            </button>
          ))}
        </span>
        {at > 0 && (
          <Button variant="secondary" icon={ArrowLeft} onClick={() => go(at - 1)}>
            Back
          </Button>
        )}
        <Button variant="brand" iconRight={ArrowRight} onClick={last ? onStart : () => go(at + 1)}>
          Next
        </Button>
      </footer>
    </div>
  )
}
