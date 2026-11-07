import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Combine, Layers, ListOrdered, Lock, ScanSearch, Split } from 'lucide-react'
import { RESOLVED_LOGOS } from '../logos/manifest.generated'
import './intro-world.css'

/* -----------------------------------------------------------------------------
   The intro, Walkthrough (owner, 5 Nov 2026: "a very fresh approach ... interactive,
   yet simple, minimal ... keep the isometric part ... the story feels very empty, no
   connection": old policies → zones and devices → one rule → many rules → Check access).

   One isometric world, not slides. The same objects carry the whole story, so every
   step visibly comes from the one before:

     1  Your policies today   Salesforce's App Login slab with its Adaptive Access slab on
                              top, the checks sitting on it as chips (IP range, India,
                              2 devices, 08:00–20:00)
     2  Pull the checks out   the chips fly off: IP and India build a Zone, the device
                              limit a Device profile; the old slabs fade to outlines
     3  Build one rule        a rule rises in front; the zone and the profile wire into
                              its if, the hours chip lands on it
     4  Reuse it             the rule becomes a stack (Sales, Finance, Everyone else),
                              the same zone and profile wired into more than one
     5  Check access          pick a person; their sign-in drops through the rules and
                              lands on an outcome

   The admin drives it: one button per step says what happens next. The rail on the
   left jumps anywhere. Isometric planes are SVG; Motion moves groups by x / y /
   opacity and draws wires by pathLength. Reduced motion jumps straight to each state.
   -------------------------------------------------------------------------- */

const EASE = [0.22, 1, 0.36, 1] as const
const C = 0.866
const S = 0.5
const OX = 360
const OY = 214
type P = [number, number]
const logo = (id: string) => RESOLVED_LOGOS[id]?.file ?? undefined

/** World (x, y, z) to the screen. */
const iso = (x: number, y: number, z = 0): P => [OX + (x - y) * C, OY + (x + y) * S - z]
/** The world corner that puts a w × d slab's centre at this screen point (relative to the origin). */
function at(sx: number, sy: number, w: number, d: number): { x: number; y: number } {
  const a = sx / C
  const b = 2 * sy
  return { x: (a + b) / 2 - w / 2, y: (b - a) / 2 - d / 2 }
}
const pts = (a: P[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')

type Tone = 'plain' | 'ghost' | 'outline' | 'lit' | 'good' | 'bad'

function Slab({ x, y, z = 0, w, d, h = 10, tone = 'plain', children }: { x: number; y: number; z?: number; w: number; d: number; h?: number; tone?: Tone; children?: ReactNode }) {
  const top = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const front = [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)]
  const side = [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)]
  const [tx, ty] = iso(x, y, z + h)
  return (
    <g className={`wv is-${tone}`}>
      <polygon points={pts(front)} className="wv__front" />
      <polygon points={pts(side)} className="wv__side" />
      <polygon points={pts(top)} className="wv__top" />
      {children && <g transform={`matrix(${C},${S},${-C},${S},${tx.toFixed(1)},${ty.toFixed(1)})`}>{children}</g>}
    </g>
  )
}

/** A wire between two screen points, drawn as an isometric elbow (along x, then along y). */
function Wire({ from, to, on, delay = 0, reduce, tone = 'blue' }: { from: [number, number, number]; to: [number, number, number]; on: boolean; delay?: number; reduce: boolean; tone?: 'blue' | 'good' | 'bad' }) {
  const mid: [number, number, number] = [to[0], from[1], from[2]]
  const ptsW = [iso(...from), iso(...mid), iso(...to)]
  const d = `M${ptsW.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L')}`
  return (
    <g className={`ww is-${tone}`}>
      <motion.path d={d} className="ww__track" initial={false} animate={{ opacity: on ? 1 : 0 }} />
      <motion.path d={d} className="ww__live" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : delay, ease: 'easeInOut' }} />
      <motion.circle cx={ptsW[2][0]} cy={ptsW[2][1]} r={3.5} className="ww__dot" initial={false} animate={{ opacity: on ? 1 : 0 }} transition={{ delay: reduce ? 0 : delay + 0.75 }} />
    </g>
  )
}

/* --- The world's fixed places ------------------------------------------------------- */

const OLD = { w: 200, d: 130 } // the App Login and Adaptive Access slabs
const OLDAT = at(0, 40, OLD.w, OLD.d)
const PART = { w: 170, d: 84 } // a zone, a device profile
const ZONE = at(-218, 34, PART.w, PART.d)
const DEV = at(218, 34, PART.w, PART.d)
const RULE = { w: 210, d: 96 }
const RULEAT = at(0, 150, RULE.w, RULE.d)
const CARD = { w: 150, d: 62 }
const PERSON = at(-222, -128, CARD.w, CARD.d)
const OUT = at(222, -128, CARD.w, CARD.d)
const CHIP = { w: 82, d: 28 }

/* A chip: drawn at its first home, moved to where the step puts it. */
type ChipId = 'ip' | 'india' | 'devices' | 'hours'
const CHIPS: { id: ChipId; label: string; home: [number, number] }[] = [
  { id: 'ip', label: 'IP 203.0.113.0/24', home: [-50, -46] },
  { id: 'india', label: 'Country: India', home: [42, -46] },
  { id: 'devices', label: 'At most 2 devices', home: [-50, -10] },
  { id: 'hours', label: '08:00–20:00', home: [42, -10] },
]
function chipSpot(id: ChipId, step: number): { x: number; y: number; z: number } {
  const home = CHIPS.find((c) => c.id === id)!.home
  const onOld = { x: OLDAT.x + OLD.w / 2 + home[0], y: OLDAT.y + OLD.d / 2 + home[1] - 14, z: 82 }
  if (step === 0) return onOld
  if (id === 'ip') return { x: ZONE.x + 6, y: ZONE.y + 8, z: 10 }
  if (id === 'india') return { x: ZONE.x + 84, y: ZONE.y + 8, z: 10 }
  if (id === 'devices') return { x: DEV.x + 44, y: DEV.y + 8, z: 10 }
  /* hours: waits beside the old slab, then lands on the rule */
  if (step === 1) return { x: OLDAT.x + OLD.w / 2 + home[0], y: OLDAT.y + OLD.d / 2 + home[1] - 14, z: 40 }
  return { x: RULEAT.x + RULE.w - CHIP.w - 8, y: RULEAT.y + 8, z: step >= 3 ? 90 : 10 }
}

/* --- Check access: two people, two outcomes ---------------------------------------- */

const PEOPLE = [
  { id: 'priya', name: 'Priya', line: 'Sales · in India · trusted laptop', match: 0, outcome: 'Allowed', how: 'Password, then OTP', tone: 'good' as const },
  { id: 'arun', name: 'Arun', line: 'Sales · abroad · new phone', match: 2, outcome: 'Denied', how: 'Everyone else is denied', tone: 'bad' as const },
]

const STEPS: { title: string; line: string; action: string; icon: typeof Lock }[] = [
  { title: 'Your policies today', line: 'Salesforce has an App Login policy and an Adaptive Access policy. The checks sit inside them, one application at a time.', action: 'Pull the checks out', icon: Layers },
  { title: 'Pull the checks out', line: 'Places and IP ranges become a zone. The device limit becomes a device profile. Made once, kept in your library.', action: 'Build the rule', icon: Split },
  { title: 'Build one rule', line: 'Who, if, then. The zone and the device profile plug straight into the rule.', action: 'Reuse it', icon: Combine },
  { title: 'Reuse it', line: 'The same zone and device profile feed every rule that needs them. Rules read from the top; Everyone else is last.', action: 'Check access', icon: ListOrdered },
  { title: 'Check access', line: 'Pick a person. Their sign-in goes down the rules, and the first rule that matches decides.', action: 'Next', icon: ScanSearch },
]

export function WorldScene({ step, who = 0, run = 0 }: { step: number; who?: number; run?: number }) {
  const reduce = useReducedMotion() === true
  const person = PEOPLE[who]
  /* Where the rules sit: one in step 3, a stack of three from step 4. */
  const stack = step >= 3
  const rules = [
    { key: 'r1', title: '1 · Sales', z: stack ? 92 : 0, show: step >= 2 },
    { key: 'r2', title: '2 · Finance', z: 46, show: stack },
    { key: 'r3', title: 'Everyone else', z: 0, show: stack },
  ]
  const ruleTop = (z: number): [number, number, number] => [RULEAT.x + RULE.w / 2, RULEAT.y, z + 10]
  const checking = step === 4
  const tokenPath = checking ? [iso(PERSON.x + CARD.w / 2, PERSON.y + CARD.d / 2, 10), ...(person.match === 0 ? [iso(...ruleTop(92))] : [iso(...ruleTop(92)), iso(...ruleTop(46)), iso(...ruleTop(0))]), iso(OUT.x + CARD.w / 2, OUT.y + CARD.d / 2, 10)] : []
  const travel = reduce ? 0 : 0.7 * (tokenPath.length - 1)

  return (
    <svg viewBox="0 0 720 470" className="biw__svg" role="img" aria-label={STEPS[step].title}>
      <defs>
        <filter id="biw-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="b" />
          <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.05  0 0 0 0 0.43  0 0 0 0 0.99  0 0 0 0.5 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* the ground: a faint isometric grid that holds the world together */}
      <g className="biw__ground" aria-hidden>
        {Array.from({ length: 13 }, (_, i) => -300 + i * 50).map((v) => (
          <g key={v}>
            <line x1={iso(v, -300)[0]} y1={iso(v, -300)[1]} x2={iso(v, 300)[0]} y2={iso(v, 300)[1]} />
            <line x1={iso(-300, v)[0]} y1={iso(-300, v)[1]} x2={iso(300, v)[0]} y2={iso(300, v)[1]} />
          </g>
        ))}
      </g>

      {/* 1 — the old slabs */}
      <motion.g initial={false} animate={{ opacity: step === 0 ? 1 : step === 1 ? 0.55 : 0, y: step === 0 ? 0 : -24 }} transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}>
        <Slab x={OLDAT.x} y={OLDAT.y} w={OLD.w} d={OLD.d} h={12} tone={step === 0 ? 'plain' : 'ghost'}>
          {logo('salesforce') && <image href={logo('salesforce')} x={14} y={OLD.d - 40} width={16} height={16} />}
          <text x={36} y={OLD.d - 28} className="wt is-big">App Login policy</text>
          <text x={14} y={OLD.d - 12} className="wt is-sub">Sales, Finance, DEFAULT · password, OTP</text>
        </Slab>
        <Slab x={OLDAT.x} y={OLDAT.y} z={70} w={OLD.w} d={OLD.d} h={12} tone={step === 0 ? 'outline' : 'ghost'}>
          <text x={14} y={OLD.d - 12} className="wt is-big is-blue">Adaptive Access policy</text>
        </Slab>
      </motion.g>

      {/* 2 — the parts */}
      <motion.g initial={false} animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 16 }} transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : step === 1 ? 0.35 : 0, ease: EASE }}>
        <Slab x={ZONE.x} y={ZONE.y} w={PART.w} d={PART.d} h={10} tone={checking ? 'plain' : 'outline'}>
          <text x={12} y={PART.d - 24} className="wt is-kicker">Zone</text>
          <text x={12} y={PART.d - 9} className="wt is-big">India office</text>
        </Slab>
        <Slab x={DEV.x} y={DEV.y} w={PART.w} d={PART.d} h={10} tone={checking ? 'plain' : 'outline'}>
          <text x={12} y={PART.d - 24} className="wt is-kicker">Device profile</text>
          <text x={12} y={PART.d - 9} className="wt is-big">Trusted device</text>
        </Slab>
      </motion.g>

      {/* 3 & 4 — wires from the parts into the rules */}
      <Wire reduce={reduce} on={step >= 2} delay={0.3} from={[ZONE.x + PART.w, ZONE.y + PART.d / 2, 6]} to={[RULEAT.x + 40, RULEAT.y, rules[0].z + 6]} />
      <Wire reduce={reduce} on={step >= 2} delay={0.45} from={[DEV.x + PART.w / 2, DEV.y + PART.d, 6]} to={[RULEAT.x + RULE.w, RULEAT.y + 40, rules[0].z + 6]} />
      <Wire reduce={reduce} on={stack} delay={0.6} from={[ZONE.x + PART.w, ZONE.y + PART.d / 2 + 18, 6]} to={[RULEAT.x + 70, RULEAT.y, 46 + 6]} />

      {/* the rules: one, then a stack */}
      {[...rules].reverse().map((r) => (
        <motion.g key={r.key} initial={false} animate={{ opacity: r.show ? 1 : 0, y: r.show ? 0 : 30 }} transition={{ duration: reduce ? 0 : 0.65, ease: EASE, delay: reduce ? 0 : r.key === 'r1' ? 0.15 : r.key === 'r2' ? 0.35 : 0.5 }}>
          <motion.g initial={false} animate={{ y: -r.z }} transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}>
            <RuleSlab k={r.key} title={r.title} step={step} person={person} run={run} />
          </motion.g>
        </motion.g>
      ))}

      {/* the chips, in flight between their homes */}
      {CHIPS.map((c, n) => {
        const home = chipSpot(c.id, 0)
        const now = chipSpot(c.id, step)
        const a = iso(home.x, home.y, home.z)
        const b = iso(now.x, now.y, now.z)
        const gone = c.id !== 'hours' && step >= 3
        return (
          <motion.g key={c.id} initial={false} animate={{ x: b[0] - a[0], y: b[1] - a[1], opacity: gone ? 0 : 1 }} transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : n * 0.08, ease: EASE }}>
            <Slab x={home.x} y={home.y} z={home.z} w={CHIP.w} d={CHIP.d} h={7} tone={step >= 1 && c.id !== 'hours' ? 'lit' : 'plain'}>
              <text x={8} y={18} className={`wt is-chip${step >= 1 && c.id !== 'hours' ? ' is-white' : ''}`}>{c.label}</text>
            </Slab>
          </motion.g>
        )
      })}

      {/* 5 — the person, the outcome, the sign-in in flight */}
      <motion.g initial={false} animate={{ opacity: checking ? 1 : 0, y: checking ? 0 : -16 }} transition={{ duration: reduce ? 0 : 0.5, ease: EASE }}>
        <Slab x={PERSON.x} y={PERSON.y} w={CARD.w} d={CARD.d} h={8} tone="outline">
          <text x={12} y={24} className="wt is-big">{person.name}</text>
          <text x={12} y={42} className="wt is-sub">{person.line}</text>
        </Slab>
      </motion.g>
      <AnimatePresence>
        {checking && (
          <motion.g key={`out-${run}-${who}`} initial={reduce ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, delay: reduce ? 0 : travel, ease: EASE }} filter="url(#biw-glow)">
            <Slab x={OUT.x} y={OUT.y} w={CARD.w} d={CARD.d} h={8} tone={person.tone}>
              <text x={12} y={26} className="wt is-big is-white">{person.outcome}</text>
              <text x={12} y={44} className="wt is-sub is-white">{person.how}</text>
            </Slab>
          </motion.g>
        )}
      </AnimatePresence>
      {checking && tokenPath.length > 1 && (
        <motion.circle
          key={`tok-${run}-${who}`}
          r={7}
          className={`biw__token is-${person.tone}`}
          initial={{ cx: tokenPath[0][0], cy: tokenPath[0][1], opacity: 0 }}
          animate={reduce ? { cx: tokenPath[tokenPath.length - 1][0], cy: tokenPath[tokenPath.length - 1][1], opacity: 0 } : { cx: tokenPath.map((p) => p[0]), cy: tokenPath.map((p) => p[1]), opacity: [1, ...tokenPath.slice(1, -1).map(() => 1), 0] }}
          transition={{ duration: travel || 0.01, ease: 'easeInOut', delay: 0.3 }}
        />
      )}

    </svg>
  )
}

/* One rule slab. In step 3 it reads in full; in the stack each shows its title on the front edge, and Check access lights the one being read. */
function RuleSlab({ k, title, step, person, run }: { k: string; title: string; step: number; person: (typeof PEOPLE)[number]; run: number }) {
  const idx = k === 'r1' ? 0 : k === 'r2' ? 1 : 2
  const checking = step === 4
  const decided = checking && idx === person.match
  const tone: Tone = decided ? person.tone : step === 2 && idx === 0 ? 'outline' : 'plain'
  const full = idx === 0 && step <= 3
  return (
    <g key={`${k}-${run}`}>
      <Slab x={RULEAT.x} y={RULEAT.y} w={RULE.w} d={RULE.d} h={10} tone={tone}>
        {full ? (
          <>
            <text x={12} y={20} className={`wt is-kicker${decided ? ' is-white' : ''}`}>Rule</text>
            <text x={12} y={38} className={`wt is-row${decided ? ' is-white' : ''}`}>
              <tspan className="wt__k">who</tspan> Sales
            </text>
            <text x={12} y={56} className={`wt is-row${decided ? ' is-white' : ''}`}>
              <tspan className="wt__k">if</tspan> India office · Trusted device
            </text>
            <text x={12} y={74} className={`wt is-row${decided ? ' is-white' : ''}`}>
              <tspan className="wt__k">then</tspan> Password, then OTP
            </text>
          </>
        ) : (
          <text x={12} y={RULE.d - 12} className={`wt is-big${decided ? ' is-white' : ''}`}>
            {title}
            {idx === 2 ? ' · Deny' : idx === 1 ? ' · Password' : ''}
          </text>
        )}
      </Slab>
    </g>
  )
}
