import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, useReducedMotion } from 'motion/react'
import { Pause, Play } from 'lucide-react'
import { Button } from '../kit'
import { RESOLVED_LOGOS } from '../logos/manifest.generated'
import { Scene2D } from './intro-film-2d'
import { camera2D } from './intro-film-2d-camera'
import { NewBuilderButton } from './new-builder-button'
import './old-policies.css'
import './intro-film.css'

/* -----------------------------------------------------------------------------
   The intro, Explainer (owner, 6 Nov 2026: "a SaaS explainer with an actual story ...
   text goes one by one, the whole video in a big section ... zoom in and out, join
   things together"). The script is docs/artifacts/policy-builder-explainer-script.md.

   One 88-second film in one isometric world, on the light grey stage with one blue.
   Seven acts: Today · The cost · Taken apart · The builder · Many rules · Check access ·
   Your move. Everything on screen is a pure function of one clock `t`, so the scrub
   bar and the chapter marks land on exactly the frame the film would show; the camera
   is the SVG viewBox, eased between keyframes. Reduced motion: no autoplay, the
   chapters jump. The film ends on Start migration, which opens the closing panel.
   -------------------------------------------------------------------------- */

const END = 88
const C = 0.866
const S = 0.5
type P = [number, number]

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (x: number) => {
  const k = clamp(x)
  return k * k * (3 - 2 * k)
}
/** 0 before a, 1 after b, eased between. */
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** Shown from a (fading in) until b (fading out); 1 between. */
const span = (t: number, a: number, b: number, f = 0.5) => Math.min(seg(t, a, a + f), 1 - seg(t, b - f, b))

const iso = (x: number, y: number, z = 0): P => [(x - y) * C, (x + y) * S - z]
const pts = (a: P[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
const logo = (id: string) => RESOLVED_LOGOS[id]?.file ?? undefined

type Tone = 'plain' | 'outline' | 'lit' | 'good' | 'bad' | 'ghost' | 'board' | 'copy'

/* Two views of the same film (owner, 6 Nov 2026: "a 2D view with the same story, more readable ... keep both"). In
   2D every piece is an upright card at the same screen point; height becomes a lift with a soft shadow. */
const FlatContext = createContext(false)

/** A slab placed by the screen point its centre sits on; children draw on its top face (u along w, v along d). */
function Box({ cx, cy, z = 0, w, d, h = 8, tone = 'plain', op = 1, children }: { cx: number; cy: number; z?: number; w: number; d: number; h?: number; tone?: Tone; op?: number; children?: ReactNode }) {
  const flat = useContext(FlatContext)
  if (op <= 0.001) return null
  if (flat) {
    const lift = z * 1.15
    const x0 = cx - w / 2
    const y0 = cy - d / 2 - lift
    const edge = Math.max(2, h * 0.45)
    return (
      <g className={`fv is-${tone} is-flat`} opacity={op}>
        {z > 6 && tone !== 'ghost' && tone !== 'board' && <rect x={x0 + 4} y={y0 + 8 + lift * 0.35} width={w - 8} height={d} rx={9} className="fv__shadow" />}
        <rect x={x0} y={y0 + edge} width={w} height={d} rx={8} className="fv__front" />
        <rect x={x0} y={y0} width={w} height={d} rx={8} className="fv__top" />
        {children && <g transform={`translate(${x0.toFixed(1)},${y0.toFixed(1)})`}>{children}</g>}
      </g>
    )
  }
  const a = cx / C
  const b = 2 * cy
  const x = (a + b) / 2 - w / 2
  const y = (b - a) / 2 - d / 2
  const top = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const front = [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)]
  const side = [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)]
  const [tx, ty] = iso(x, y, z + h)
  return (
    <g className={`fv is-${tone}`} opacity={op}>
      <polygon points={pts(front)} className="fv__front" />
      <polygon points={pts(side)} className="fv__side" />
      <polygon points={pts(top)} className="fv__top" />
      {children && <g transform={`matrix(${C},${S},${-C},${S},${tx.toFixed(1)},${ty.toFixed(1)})`}>{children}</g>}
    </g>
  )
}

/** A wire between screen points, drawn to `k` of its length. */
function Wire({ path, k, tone = 'blue' }: { path: P[]; k: number; tone?: 'blue' | 'good' | 'bad' }) {
  if (k <= 0.001) return null
  const d = `M${path.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L')}`
  const end = path[path.length - 1]
  return (
    <g className={`fw is-${tone}`}>
      <path d={d} className="fw__track" opacity={k} />
      <path d={d} className="fw__live" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - k} />
      {k > 0.98 && <circle cx={end[0]} cy={end[1]} r={4} className="fw__dot" />}
    </g>
  )
}

/* --- The cast ------------------------------------------------------------------------ */

const APPS = [
  { id: 'salesforce', name: 'Salesforce', c: [-170, -70] as P },
  { id: 'workday', name: 'Workday', c: [170, -70] as P },
  { id: 'servicenow', name: 'ServiceNow', c: [-170, 100] as P },
  { id: 'zoom', name: 'Zoom', c: [170, 100] as P },
]
const GHOSTS: P[] = [
  [-510, -70],
  [510, -70],
  [-510, 100],
  [510, 100],
  [0, -240],
  [0, 270],
]
const OLD = { w: 150, d: 90 }
const AD_Z = 48
const CHIP = { w: 74, d: 22 }
const ZONE_AT: P = [-150, 20]
const DEV_AT: P = [150, 20]
const TRAY_Z: P = [-330, -40]
const TRAY_D: P = [-330, 110]
const BOARD: P = [50, 40]
const PILL: P = [50, -128]
const R1: P = [50, -38]
const R2: P = [50, 52]
const R3: P = [50, 142]
const RULE = { w: 200, d: 70 }

/* The camera: (t, centre x, centre y, width). */
const CAM: [number, number, number, number][] = [
  [0, -170, -70, 520],
  [11, -170, -70, 520],
  [13.5, 0, 15, 860],
  [17, 0, 15, 1000],
  [22, 0, 15, 1000],
  [23.5, -190, -92, 380],
  [25, -190, -92, 380],
  [26.5, 0, 15, 1000],
  [28, 0, 15, 1000],
  [41, 0, 15, 880],
  [44.5, -80, -10, 880],
  [46.5, 40, -30, 640],
  [54, 40, -30, 640],
  [57.5, -60, 0, 900],
  [61, -60, 0, 940],
  [64.5, -40, -20, 1080],
  [72, -40, -20, 1080],
  [73.5, 70, -40, 820],
  [82, 70, -40, 820],
  [84, -40, -20, 1080],
  [END, -40, -20, 1080],
]
function camera(t: number): string {
  let i = 0
  while (i < CAM.length - 2 && t >= CAM[i + 1][0]) i++
  const [t0, x0, y0, w0] = CAM[i]
  const [t1, x1, y1, w1] = CAM[i + 1]
  const k = seg(t, t0, t1)
  const w = lerp(w0, w1, k)
  const h = w * 0.5625
  return `${(lerp(x0, x1, k) - w / 2).toFixed(1)} ${(lerp(y0, y1, k) - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`
}

/* The words: one line at a time, grouped by act; the act's earlier lines stay, dimmed. */
const ACTS: { title: string; at: number; lines: [number, string][] }[] = [
  { title: 'Today', at: 0, lines: [[0.6, 'Every application gets its own policies.'], [5, 'One for who signs in, and how.'], [8, 'Another for where, when, and on what device.'], [12, 'Then do it again for the next application.'], [16, 'And the next.']] },
  { title: 'The cost', at: 18, lines: [[18.3, 'The same checks, copied everywhere.'], [22.3, 'Change one IP range…'], [25, '…and you change it in four places.']] },
  { title: 'Taken apart', at: 28, lines: [[28.3, 'The new Policy builder starts by pulling the checks out.'], [33, 'Places and networks become one zone.'], [36.5, 'Device limits become one device profile.'], [39.5, 'Made once. Kept in your library.']] },
  { title: 'The builder', at: 42, lines: [[42.3, 'This is the Policy builder.'], [46, 'A rule says who…'], [50, '…if what is true…'], [54, '…then how they sign in.'], [57, 'One rule holds what used to take two pages.']] },
  { title: 'Many rules', at: 60, lines: [[60.3, 'Add another rule. And another.'], [65, 'One policy can cover many applications.'], [69, 'Eight policies become one.']] },
  { title: 'Check access', at: 72, lines: [[72.3, 'Know the answer before it goes live.'], [75.5, 'Priya gets in.'], [79.5, 'Arun doesn’t.']] },
  { title: 'Your move', at: 82, lines: [[82.3, 'Your old policies move over as drafts.'], [84.5, 'Approve them, then publish.']] },
]

/* The 2D film says the estate as it is (owner, 6 Nov 2026): many old policies per application, 146 in all. */
const LINES_2D: Record<number, string> = {
  5: 'App Login policies for who signs in, and how.',
  8: 'Adaptive Access policies for where, when, and on what device.',
  12: 'Then more for the next application.',
  16: 'Until there are 146 of them.',
  25: '…and only that copy changes.',
  69: 'Five Salesforce policies become one.',
}
/* Lines only the 2D film has: the copies, edited by hand (owner, 6 Nov 2026). */
const EXTRA_2D: Record<string, [number, string][]> = { 'The cost': [[26, 'Every other copy, you find and edit by hand. One at a time.']] }
const ACTS_2D = ACTS.map((a) => ({ ...a, lines: [...a.lines.map(([at, line]) => [at, LINES_2D[at] ?? line] as [number, string]), ...(EXTRA_2D[a.title] ?? [])] }))

/* --- The world at time t ------------------------------------------------------------ */

function Scene({ t }: { t: number }) {
  const flat = useContext(FlatContext)
  /* Act 1-3: the old slabs. They fade to outlines while the checks leave, then go. */
  const oldOp = (n: number) => (n === 0 ? seg(t, 0, 0.8) : seg(t, 12 + (n - 1) * 0.6, 12.8 + (n - 1) * 0.6)) * (1 - 0.7 * seg(t, 30, 32)) * (1 - seg(t, 40, 42))
  const adOp = (n: number) => (n === 0 ? seg(t, 2, 3) : seg(t, 12.3 + (n - 1) * 0.6, 13.1 + (n - 1) * 0.6)) * (1 - 0.7 * seg(t, 30, 32)) * (1 - seg(t, 40, 42))
  const adDrop = (n: number) => (1 - (n === 0 ? seg(t, 2, 3) : seg(t, 12.3 + (n - 1) * 0.6, 13.1 + (n - 1) * 0.6))) * 40
  const rowLit = (r: number) => span(t, 5 + r * 0.9, 8.2, 0.3)
  const ghostOp = seg(t, 16, 17.5) * (1 - seg(t, 26.5, 28.5)) * 0.8

  /* The chips: on each Adaptive slab, lifted, flown to the zone and the profile. */
  const zoneChip = (n: number) => {
    const [ax, ay] = APPS[n].c
    const from: P = [ax - 26, ay - 4]
    const lift = seg(t, 28.5 + n * 0.15, 30.5 + n * 0.15) * 30
    const k = seg(t, 31 + n * 0.5, 33.2 + n * 0.5)
    const x = lerp(from[0], ZONE_AT[0], k)
    const y = lerp(from[1], ZONE_AT[1], k)
    const z = lerp(AD_Z + 10 + lift, 12, k) + Math.sin(Math.PI * k) * 50
    const op = adOp(n) > 0.01 || k > 0 ? (k >= 1 ? 1 - seg(t, 33.2 + n * 0.5, 33.6 + n * 0.5) : Math.max(adOp(n), k > 0 ? 1 : 0)) : 0
    return { x, y, z, op: t < 28 ? adOp(n) / Math.max(0.0001, 1 - 0.7 * seg(t, 30, 32)) : op }
  }
  const devChip = (n: number) => {
    const [ax, ay] = APPS[n].c
    const from: P = [ax + 34, ay + 16]
    const lift = seg(t, 28.5 + n * 0.15, 30.5 + n * 0.15) * 30
    const k = seg(t, 34.6 + n * 0.45, 36.6 + n * 0.45)
    const x = lerp(from[0], DEV_AT[0], k)
    const y = lerp(from[1], DEV_AT[1], k)
    const z = lerp(AD_Z + 10 + lift, 12, k) + Math.sin(Math.PI * k) * 50
    const op = t < 34.6 + n * 0.45 ? adOp(n) / Math.max(0.0001, 1 - 0.7 * seg(t, 30, 32)) : 1 - seg(t, 36.6 + n * 0.45, 37 + n * 0.45)
    return { x, y, z, op }
  }
  /* Act 2: the copies light, one is edited, the others follow; Zoom is missed. */
  const copyTone = (n: number): Tone => {
    if (t >= 23 && t < 28 && n === 0) return 'lit'
    if (t >= 25.3 + n * 0.45 && t < 28 && n < 3) return 'lit'
    if (t >= 18.5 && t < 28) return 'copy'
    return 'plain'
  }

  /* Act 3-4: the zone and the profile, then the tray. */
  const zoneOp = seg(t, 32.6, 33.4)
  const devOp = seg(t, 36, 36.8)
  const toTray = seg(t, 42, 44)
  const zAt: P = [lerp(ZONE_AT[0], TRAY_Z[0], toTray), lerp(ZONE_AT[1], TRAY_Z[1], toTray)]
  const dAt: P = [lerp(DEV_AT[0], TRAY_D[0], toTray), lerp(DEV_AT[1], TRAY_D[1], toTray)]

  /* Act 4: the board, the start, rule 1 filling in. */
  const boardOp = seg(t, 42.5, 44)
  const pillOp = seg(t, 43.5, 44.5)
  const r1Op = seg(t, 45, 46)
  const r1Drop = (1 - r1Op) * 40
  const who = seg(t, 46.6, 47.6)
  const ifRow = seg(t, 50, 50.8)
  const then = seg(t, 54, 54.8)
  const outcome1 = span(t, 55.5, 72, 0.4)
  const ghostPages = span(t, 57.2, 59.8, 0.5)
  /* The hours chip waits on Salesforce's slab, then lands on rule 1's if. */
  const hk = seg(t, 51, 53)
  const hoursOp = t < 51 ? adOp(0) / Math.max(0.0001, 1 - 0.7 * seg(t, 30, 32)) * (t > 40 ? 0 : 1) + (t >= 40 && t < 51 ? 0 : 0) : 1 - seg(t, 53, 53.3)
  const hFrom: P = [APPS[0].c[0] + 30, APPS[0].c[1] - 22]

  /* Act 5: more rules, the apps, the old grid collapsing into one. */
  const r2Op = seg(t, 61, 62)
  const r3Op = seg(t, 62.4, 63.4)
  const appsK = (n: number) => seg(t, 65.2 + n * 0.5, 66.4 + n * 0.5)
  const collapse = seg(t, 69.6, 71.6)
  const collapseOp = span(t, 69, 71.8, 0.4) * 0.7

  /* Act 6: two sign-ins. */
  const priya = span(t, 72.4, 78.2, 0.4)
  const arun = span(t, 78.2, END + 1, 0.4)
  const tok1 = seg(t, 73.6, 75.4)
  const tok2 = seg(t, 78.6, 81)
  const r1Good = t >= 75.4 && t < 78.2
  const r3Bad = t >= 81 && t < 82.2

  /* Act 7: the policy's status, then the end card (HTML, over the stage). */
  const status = t < 82.6 ? null : t < 84.2 ? 'Draft' : t < 85.8 ? 'Approved' : 'Active'

  const ruleCard = (at: P, op: number, drop: number, tone: Tone, title: string, rows: ReactNode) => (
    <Box cx={at[0]} cy={at[1]} z={4 + drop} w={RULE.w} d={RULE.d} h={8} tone={tone} op={op}>
      <text x={10} y={16} className={`ft is-kicker${tone === 'good' || tone === 'bad' ? ' is-white' : ''}`}>{title}</text>
      {rows}
    </Box>
  )
  const lit = (tone: Tone) => (tone === 'good' || tone === 'bad' ? ' is-white' : '')
  const r1Tone: Tone = r1Good ? 'good' : t >= 45 && t < 58 ? 'outline' : 'plain'
  const r3Tone: Tone = r3Bad ? 'bad' : 'plain'

  /* Token path on screen: the pill, down the rules. */
  const pillPt: P = [PILL[0], PILL[1] - 12]
  const rulePt = (r: P): P => [r[0], r[1] - 14]
  const along = (k: number, path: P[]): P => {
    const n = path.length - 1
    const f = k * n
    const i = Math.min(n - 1, Math.floor(f))
    return [lerp(path[i][0], path[i + 1][0], f - i), lerp(path[i][1], path[i + 1][1], f - i)]
  }

  return (
    <>
      {/* the ground */}
      {flat ? (
        <rect x={-1400} y={-900} width={2800} height={1800} fill="url(#bfm-dots)" aria-hidden />
      ) : (
      <g className="fgrid" aria-hidden>
        {Array.from({ length: 23 }, (_, i) => -550 + i * 50).map((v) => (
          <g key={v}>
            <line x1={iso(v, -550)[0]} y1={iso(v, -550)[1]} x2={iso(v, 550)[0]} y2={iso(v, 550)[1]} />
            <line x1={iso(-550, v)[0]} y1={iso(-550, v)[1]} x2={iso(550, v)[0]} y2={iso(550, v)[1]} />
          </g>
        ))}
      </g>
      )}

      {/* Act 1: the old pages, one pair per application, more at the edges */}
      {GHOSTS.map((g, i) => (
        <Box key={i} cx={g[0]} cy={g[1]} w={OLD.w} d={OLD.d} h={8} tone="ghost" op={ghostOp} />
      ))}
      {APPS.map((a, n) => (
        <g key={a.id}>
          <Box cx={a.c[0]} cy={a.c[1]} w={OLD.w} d={OLD.d} h={10} op={oldOp(n)}>
            {logo(a.id) && <image href={logo(a.id)} x={10} y={flat ? 40 : OLD.d - 34} width={14} height={14} />}
            <text x={28} y={flat ? 51 : OLD.d - 23} className="ft is-b">App Login · {a.name}</text>
            {n === 0 &&
              ['Sales · password, OTP', 'Finance · password, OTP', 'DEFAULT · password'].map((r, i) => (
                <text key={r} x={10} y={(flat ? 64 : 16) + i * 11} className={`ft is-row${rowLit(i) > 0.5 ? ' is-blue' : ''}`}>
                  {r}
                </text>
              ))}
          </Box>
          <Box cx={a.c[0]} cy={a.c[1]} z={AD_Z + adDrop(n)} w={OLD.w} d={OLD.d} h={10} tone="outline" op={adOp(n)}>
            <text x={10} y={OLD.d - 10} className="ft is-b is-blue">Adaptive Access · {a.name}</text>
          </Box>
        </g>
      ))}

      {/* Act 3: the zone and the device profile */}
      <Box cx={zAt[0]} cy={zAt[1]} w={140} d={78} h={10} tone={t < 42 ? 'lit' : 'outline'} op={zoneOp}>
        <text x={10} y={50} className={`ft is-kicker${t < 42 ? ' is-white' : ''}`}>Zone</text>
        <text x={10} y={66} className={`ft is-big${t < 42 ? ' is-white' : ''}`}>India office</text>
      </Box>
      <Box cx={dAt[0]} cy={dAt[1]} w={140} d={78} h={10} tone={t < 42 ? 'lit' : 'outline'} op={devOp}>
        <text x={10} y={50} className={`ft is-kicker${t < 42 ? ' is-white' : ''}`}>Device profile</text>
        <text x={10} y={66} className={`ft is-big${t < 42 ? ' is-white' : ''}`}>Trusted device</text>
      </Box>

      {/* Act 4-7: the builder */}
      <Box cx={BOARD[0]} cy={BOARD[1]} z={-2} w={330} d={300} h={3} tone="board" op={boardOp} />
      <Box cx={PILL[0]} cy={PILL[1]} z={4} w={150} d={36} h={6} tone="outline" op={pillOp}>
        {logo('salesforce') && <image href={logo('salesforce')} x={8} y={11} width={14} height={14} />}
        <text x={26} y={22} className="ft is-b">A sign-in arrives</text>
        {status && (
          <text x={112} y={22} className={`ft is-pill is-${status.toLowerCase()}`}>
            {status}
          </text>
        )}
      </Box>
      <Wire path={[pillPt, rulePt(R1)]} k={seg(t, 45, 46)} />

      {ruleCard(R1, r1Op, r1Drop, r1Tone, 'Rule 1', (
        <>
          <text x={10} y={32} className={`ft is-row${lit(r1Tone)}`} opacity={who}>
            <tspan className="ft__k">who</tspan> Sales
          </text>
          <text x={10} y={46} className={`ft is-row${lit(r1Tone)}`} opacity={ifRow}>
            <tspan className="ft__k">if</tspan> India office · Trusted device · 08–20
          </text>
          <text x={10} y={60} className={`ft is-row${lit(r1Tone)}`} opacity={then}>
            <tspan className="ft__k">then</tspan> Password, then OTP
          </text>
        </>
      ))}
      {outcome1 > 0 && (
        <Box cx={R1[0] + 150} cy={R1[1] - 48} z={10} w={70} d={22} h={5} tone="good" op={outcome1}>
          <text x={8} y={15} className="ft is-chip is-white">Allowed</text>
        </Box>
      )}
      {ruleCard(R2, r2Op, (1 - r2Op) * 30, 'plain', 'Rule 2', (
        <text x={10} y={40} className="ft is-row">
          <tspan className="ft__k">who</tspan> Finance <tspan className="ft__k">then</tspan> Password, then OTP
        </text>
      ))}
      {ruleCard(R3, r3Op, (1 - r3Op) * 30, r3Tone, 'Everyone else', (
        <text x={10} y={40} className={`ft is-row${lit(r3Tone)}`}>
          <tspan className="ft__k">then</tspan> Deny
        </text>
      ))}

      {/* connectors: the zone and the profile into rule 1's if, the zone into rule 2 */}
      <Wire path={[[TRAY_Z[0] + 60, TRAY_Z[1] + 10], [R1[0] - 110, TRAY_Z[1] + 10], [R1[0] - 110, R1[1] + 4], [R1[0] - (flat ? 100 : 70), R1[1] + 4]]} k={seg(t, 50.2, 51.6)} />
      <Wire path={[[TRAY_D[0] + 60, TRAY_D[1] - 10], [R1[0] - 130, TRAY_D[1] - 10], [R1[0] - 130, R1[1] + 14], [R1[0] - (flat ? 100 : 70), R1[1] + 14]]} k={seg(t, 50.8, 52.2)} />
      <Wire path={[[TRAY_Z[0] + 60, TRAY_Z[1] + 24], [R2[0] - 150, TRAY_Z[1] + 24], [R2[0] - 150, R2[1]], [R2[0] - (flat ? 100 : 70), R2[1]]]} k={seg(t, 63, 64.4)} />

      {/* the two old pages, ghosted beside the rule that replaces them */}
      {ghostPages > 0 && (
        <>
          <Box cx={R1[0] + 230} cy={R1[1] + 30} w={110} d={66} h={8} tone="ghost" op={ghostPages}>
            <text x={8} y={56} className="ft is-sub">App Login</text>
          </Box>
          <Box cx={R1[0] + 230} cy={R1[1] + 30} z={36} w={110} d={66} h={8} tone="ghost" op={ghostPages}>
            <text x={8} y={56} className="ft is-sub">Adaptive Access</text>
          </Box>
        </>
      )}

      {/* the applications this one policy covers */}
      {[
        ['salesforce', [-120, -230] as P],
        ['workday', [50, -250] as P],
        ['zoom', [220, -230] as P],
      ].map(([id, at], n) => {
        const k = appsK(n)
        if (k <= 0) return null
        const p = at as P
        return (
          <g key={id as string}>
            <Wire path={[[p[0], p[1] + 8], [p[0], PILL[1] - 30], [PILL[0], PILL[1] - 30]]} k={k} />
            <Box cx={p[0]} cy={p[1]} z={4} w={56} d={56} h={8} op={k}>
              {logo(id as string) && <image href={logo(id as string)} x={18} y={18} width={20} height={20} />}
            </Box>
          </g>
        )
      })}

      {/* eight old pages collapsing into the one policy */}
      {collapseOp > 0 &&
        APPS.flatMap((a, n) => [0, 1].map((layer) => ({ a, n, layer }))).map(({ a, n, layer }) => (
          <Box key={`${n}-${layer}`} cx={lerp(a.c[0], BOARD[0], collapse)} cy={lerp(a.c[1], BOARD[1] - 40, collapse)} z={layer * 30} w={lerp(OLD.w, 20, collapse)} d={lerp(OLD.d, 14, collapse)} h={6} tone="ghost" op={collapseOp * (1 - collapse * 0.6)} />
        ))}

      {/* the chips in flight */}
      {APPS.map((_, n) => {
        const zc = zoneChip(n)
        const dc = devChip(n)
        return (
          <g key={n}>
            <Box cx={zc.x} cy={zc.y} z={zc.z} w={CHIP.w} d={CHIP.d} h={5} tone={t >= 28 ? 'lit' : copyTone(n)} op={zc.op}>
              <text x={6} y={15} className={`ft is-chip${t >= 28 || copyTone(n) === 'lit' ? ' is-white' : ''}`}>India · IP range</text>
            </Box>
            <Box cx={dc.x} cy={dc.y} z={dc.z} w={CHIP.w} d={CHIP.d} h={5} tone={t >= 28 ? 'lit' : 'plain'} op={dc.op}>
              <text x={6} y={15} className={`ft is-chip${t >= 28 ? ' is-white' : ''}`}>At most 2 devices</text>
            </Box>
          </g>
        )
      })}
      {hoursOp > 0 && (
        <Box cx={lerp(hFrom[0], R1[0] + 60, hk)} cy={lerp(hFrom[1], R1[1] + (flat ? 6 : -10), hk)} z={lerp(AD_Z + 10, 14, hk) + Math.sin(Math.PI * hk) * 60} w={CHIP.w} d={CHIP.d} h={5} op={hoursOp}>
          <text x={6} y={15} className="ft is-chip">08:00–20:00</text>
        </Box>
      )}
      {/* the missed copy */}
      {span(t, 26.4, 28, 0.3) > 0 && (
        <g opacity={span(t, 26.4, 28, 0.3)}>
          <rect x={APPS[3].c[0] - 58} y={APPS[3].c[1] - 118} width={86} height={22} rx={11} className="fmiss" />
          <text x={APPS[3].c[0] - 15} y={APPS[3].c[1] - 103} textAnchor="middle" className="ft is-chip">Not updated</text>
        </g>
      )}
      {/* the cursor editing the IP range */}
      {span(t, 22.4, 25.2, 0.3) > 0 && (
        <path d={`M${APPS[0].c[0] - 6} ${APPS[0].c[1] - 70} l0 18 l5 -5 l4 9 l3 -1.5 l-4 -9 l7 0 z`} className="fcursor" opacity={span(t, 22.4, 25.2, 0.3)} />
      )}

      {/* Act 6: the person and the sign-in in flight */}
      {priya > 0 && (
        <Box cx={300} cy={-150} z={4} w={150} d={46} h={6} tone="outline" op={priya}>
          <text x={10} y={20} className="ft is-b">Priya</text>
          <text x={10} y={34} className="ft is-sub">Sales · in India · trusted laptop</text>
        </Box>
      )}
      {arun > 0 && (
        <Box cx={300} cy={-150} z={4} w={150} d={46} h={6} tone="outline" op={arun}>
          <text x={10} y={20} className="ft is-b">Arun</text>
          <text x={10} y={34} className="ft is-sub">Sales · abroad · new phone</text>
        </Box>
      )}
      {tok1 > 0 && tok1 < 1 && <circle className="ftoken is-good" r={8} cx={along(tok1, [pillPt, rulePt(R1)])[0]} cy={along(tok1, [pillPt, rulePt(R1)])[1]} />}
      {tok2 > 0 && tok2 < 1 && <circle className="ftoken is-bad" r={8} cx={along(tok2, [pillPt, rulePt(R1), rulePt(R2), rulePt(R3)])[0]} cy={along(tok2, [pillPt, rulePt(R1), rulePt(R2), rulePt(R3)])[1]} />}
      {r3Bad && (
        <Box cx={R3[0] + 150} cy={R3[1] - 48} z={10} w={70} d={22} h={5} tone="bad">
          <text x={8} y={15} className="ft is-chip is-white">Denied</text>
        </Box>
      )}
    </>
  )
}

export function IntroFilm({
  extra,
  onStart,
  onLater,
  flat = false,
  end,
}: {
  extra?: ReactNode
  /** Start migration: the Migrate popup. */
  onStart: () => void
  onLater: () => void
  flat?: boolean
  /** The film's last scene (owner, 6 Nov 2026: "at the end of the video, this round visual, and the migration starts
      from there only"): its picture and words, over the stage. */
  end?: { hero: ReactNode; title: string; body: string }
}) {
  const reduce = useReducedMotion() === true
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(!reduce)
  const tRef = useRef(t)
  tRef.current = t
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const next = Math.min(END, tRef.current + (now - last) / 1000)
      last = now
      setT(next)
      if (next >= END) setPlaying(false)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const acts = flat ? ACTS_2D : ACTS
  const act = acts.reduce((cur, a, i) => (t >= a.at ? i : cur), 0)
  const shown = acts[act].lines.filter(([at]) => t >= at)
  const endOp = end ? seg(t, 84.6, 85.4) : 0
  const jump = (to: number) => {
    setT(to)
    if (to >= END) setPlaying(false)
  }
  const toggle = () => {
    if (t >= END) setT(0)
    setPlaying((p) => !p)
  }

  return (
    <div className="bfm">
      <div className="bfm__stage">
        <svg viewBox={flat ? camera2D(t) : camera(t)} className={`bfm__svg${flat ? ' is-2d' : ''}`} role="img" aria-label={`${acts[act].title}: ${shown.length ? shown[shown.length - 1][1] : ''}`}>
          <defs>
            <filter id="bfm-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b" />
              <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.05  0 0 0 0 0.43  0 0 0 0 0.99  0 0 0 0.45 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="bfm-dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.3" className="fdot" />
            </pattern>
          </defs>
          <FlatContext.Provider value={flat}>
            {flat ? <Scene2D t={t} /> : <Scene t={t} />}
          </FlatContext.Provider>
        </svg>
        {end && endOp > 0 && (
          <div className="bfm__end" style={{ opacity: endOp }} aria-hidden={endOp < 0.5}>
            {/* Staged, as Story mode plays it (owner, 6 Nov 2026): the last frame fades to this ground, then the round
                visual mounts, so its applications pop in one by one and the ring starts turning; then the words. */}
            <div className="bfm__endhero">
              {/* Its own presence: the carousel's AnimatePresence initial={false} would otherwise skip every entrance in here. */}
              {t >= 85.4 && (
                <AnimatePresence>
                  <div key="hero" className="bfm__endscale">
                    {end.hero}
                  </div>
                </AnimatePresence>
              )}
            </div>
            <h2 style={{ opacity: seg(t, 86.2, 86.8) }}>{end.title}</h2>
            <p style={{ opacity: seg(t, 86.5, 87.1) }}>{end.body}</p>
          </div>
        )}
      </div>

      {/* The timeline, a row of its own (owner, 6 Nov 2026): play, then one segment per chapter, named; a press
          anywhere in a segment goes to that moment. */}
      <div className="bfm__timeline">
        <button type="button" className="bfm__play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
          {playing ? <Pause size={15} strokeWidth={2.4} aria-hidden /> : <Play size={15} strokeWidth={2.4} aria-hidden />}
        </button>
        <ol className="bfm__chapters" aria-label="Chapters">
          {acts.map((a, i) => {
            const to = i < acts.length - 1 ? acts[i + 1].at : END
            const fill = Math.max(0, Math.min(1, (t - a.at) / (to - a.at)))
            return (
              <li key={a.title} style={{ flexGrow: to - a.at }}>
                <button
                  type="button"
                  className={`bfm__chapter${i === act ? ' is-on' : i < act ? ' is-done' : ''}`}
                  aria-current={i === act ? 'step' : undefined}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    jump(a.at + Math.max(0, Math.min(0.98, (e.clientX - r.left) / r.width)) * (to - a.at))
                  }}
                >
                  <span className="bfm__track" aria-hidden>
                    <i style={{ width: `${fill * 100}%` }} />
                  </span>
                  <span className="bfm__chaptername">{a.title}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {/* The words and the buttons, one row */}
      <div className="bfm__row">
        <div className="bfm__words" aria-live="polite">
          <span className="bfm__act">{acts[act].title}</span>
          {shown.map(([at, line], i) => (
            <p key={at} className={i === shown.length - 1 ? 'is-now' : ''} style={{ opacity: i === shown.length - 1 ? Math.max(0.2, seg(t, at, at + 0.45)) : 0.38 }}>
              {line}
            </p>
          ))}
        </div>
        <span className="bfm__tools">{extra}</span>
        {/* One Start migration, always in this place (owner, 6 Nov 2026: "don't move the button"), in the old banner's
            blue; the end scene above it only shows where it leads. */}
        <span className="bfm__acts">
          <Button variant="secondary" onClick={onLater}>
            Not now
          </Button>
          <NewBuilderButton label="Start migration" door={false} onOpen={onStart} />
        </span>
      </div>
    </div>
  )
}
