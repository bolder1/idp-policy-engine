import type { ReactNode } from 'react'
import { Clock, Globe, MapPin, MonitorSmartphone, Network } from 'lucide-react'
import { RESOLVED_LOGOS } from '../logos/manifest.generated'
import { cam2D, tilt2D, tiltMatrix } from './intro-film-2d-camera'

/* -----------------------------------------------------------------------------
   The Explainer in 2D (owner, 6 Nov 2026: "a 2D view with the same story, more
   readable ... use the elements we use in our product, our cards and the builder").
   Its own flat layout, not the isometric world laid down: the old App Login and
   Adaptive Access pages as the console's cards, a zone and a device profile as
   Library rows, the builder as the start node and rule cards with their Who / If /
   Then rows, and Check access as a person and a token running down the rules.

   Same script and clock as the isometric film (IntroFilm.tsx ACTS), so the words, the
   scrub bar and the chapters land on the same moments. Everything is a pure function
   of `t`; the camera is the viewBox, eased between keyframes.
   -------------------------------------------------------------------------- */

type P = [number, number]
const END = 88
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (x: number) => {
  const k = clamp(x)
  return k * k * (3 - 2 * k)
}
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const span = (t: number, a: number, b: number, f = 0.5) => Math.min(seg(t, a, a + f), 1 - seg(t, b - f, b))
const logo = (id: string) => RESOLVED_LOGOS[id]?.file ?? undefined
/** Roughly how wide a line of 12px text is. */
const textW = (s: string, px = 12) => s.length * px * 0.56

/* --- Pieces ------------------------------------------------------------------------------ */

type Tone = 'plain' | 'dash' | 'blue' | 'lit' | 'good' | 'bad' | 'soft'

/** A console card: top-left at (x, y). */
function Card({ x, y, w, h, tone = 'plain', op = 1, children }: { x: number; y: number; w: number; h: number; tone?: Tone; op?: number; children?: ReactNode }) {
  if (op <= 0.001) return null
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} opacity={op}>
      <rect width={w} height={h} rx={10} className={`f2c is-${tone}`} />
      {children}
    </g>
  )
}

/** A chip, as the console's condition tokens: centred on (cx, cy). */
function Chip({ cx, cy, label, tone = 'plain', op = 1 }: { cx: number; cy: number; label: string; tone?: Tone; op?: number }) {
  if (op <= 0.001) return null
  const w = textW(label) + 20
  return (
    <g transform={`translate(${(cx - w / 2).toFixed(1)},${(cy - 12).toFixed(1)})`} opacity={op}>
      <rect width={w} height={24} rx={6} className={`f2chip is-${tone}`} />
      <text x={w / 2} y={16} textAnchor="middle" className={`f2t is-chip is-${tone}`}>
        {label}
      </text>
    </g>
  )
}

function Pill({ x, y, label, tone }: { x: number; y: number; label: string; tone: 'draft' | 'approved' | 'active' | 'good' | 'bad' }) {
  const w = textW(label, 11.5) + 16
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}>
      <rect width={w} height={20} rx={10} className={`f2pill is-${tone}`} />
      <text x={w / 2} y={14} textAnchor="middle" className={`f2t is-pill is-${tone}`}>
        {label}
      </text>
    </g>
  )
}

function Wire({ path, k, tone = 'blue' }: { path: P[]; k: number; tone?: 'blue' | 'grey' }) {
  if (k <= 0.001) return null
  const d = `M${path.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L')}`
  const end = path[path.length - 1]
  return (
    <g className={`f2w is-${tone}`}>
      <path d={d} className="f2w__track" opacity={k} />
      <path d={d} className="f2w__live" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - k} />
      {k > 0.98 && <circle cx={end[0]} cy={end[1]} r={4} className="f2w__dot" />}
    </g>
  )
}

function Logo({ id, x, y, size = 18 }: { id: string; x: number; y: number; size?: number }) {
  const href = logo(id)
  return href ? <image href={href} x={x} y={y} width={size} height={size} /> : null
}

/* --- The cast ------------------------------------------------------------------------------ */

/* Today's estate (owner, 6 Nov 2026: "one app can hold several App Login and Adaptive Access policies ... show the
   mess, a lot of policies, like the 146"). 24 applications in a wall, each with its own stack of old policies, 146 in
   all. The middle four are the ones the film follows; Salesforce alone has five. */
interface Stack { id: string; name: string; login: string[]; adaptive: string[]; x: number; y: number; d: number }
const LOGIN_NAMES = ['Sales', 'Finance', 'IT', 'Default']
/* An App Login row is a group and its result (owner, 6 Nov 2026: "it also holds the then part"). */
const RESULT: Record<string, string> = { Sales: 'Password, then OTP', Finance: 'Password, then OTP', IT: 'Password, then Push', Default: 'Password' }
const AD_NAMES = ['On the road', 'Office only', 'Contractors']
const MAIN_IDS = ['salesforce', 'workday', 'servicenow', 'zoom']
const SEED: [string, string, number, number][] = [
  ['slack', 'Slack', 4, 3], ['github', 'GitHub', 3, 3], ['jira', 'Jira', 4, 2], ['confluence', 'Confluence', 4, 3],
  ['box', 'Box', 3, 3], ['m365', 'Microsoft 365', 4, 3], ['google', 'Google Workspace', 4, 2], ['aws', 'AWS Console', 4, 3],
  ['zendesk', 'Zendesk', 4, 3], ['notion', 'Notion', 3, 3], ['salesforce', 'Salesforce', 3, 2], ['workday', 'Workday', 2, 1],
  ['servicenow', 'ServiceNow', 4, 2], ['zoom', 'Zoom', 1, 1], ['figma', 'Figma', 4, 2], ['hubspot', 'HubSpot', 4, 3],
  ['docusign', 'DocuSign', 3, 3], ['tableau', 'Tableau', 4, 3], ['snowflake', 'Snowflake', 4, 2], ['datadog', 'Datadog', 4, 3],
  ['gitlab', 'GitLab', 3, 3], ['asana', 'Asana', 4, 3], ['miro', 'Miro', 4, 2], ['okta', 'Okta', 4, 3],
]
const COLS = 8
const STACK_W = 250
const ROW_W = STACK_W - 20
const STACKS: Stack[] = SEED.map(([id, name, l, a], n) => {
  const c = n % COLS
  const r = Math.floor(n / COLS)
  /* Salesforce reads Sales, Finance, Default; the rest take the first names. */
  const login = id === 'salesforce' ? ['Sales', 'Finance', 'Default'] : LOGIN_NAMES.slice(0, l)
  return { id, name, login, adaptive: AD_NAMES.slice(0, a), x: -980 + c * 280 - STACK_W / 2, y: -500 + r * 340, d: Math.abs(c - 3.5) + Math.abs(r - 1) * 1.4 }
})
const MAIN = MAIN_IDS.map((id) => STACKS.findIndex((s) => s.id === id))
/* Closed, on the wall (owner, 6 Nov 2026: "close the application, and add the number of policies inside it"): six
   across, four down, the four followed ones in the middle of the second row. */
const TILE = { w: 250, h: 108 }
const SLOT_OF = (() => {
  const order = [...STACKS.keys()].filter((n) => !MAIN.includes(n))
  const slots: number[] = []
  let k = 0
  for (let slot = 0; slot < 24; slot++) {
    if (slot >= 7 && slot <= 10) slots[MAIN[slot - 7]] = slot
    else slots[order[k++]] = slot
  }
  return slots
})()
const tileAt = (n: number): P => [-700 + (SLOT_OF[n] % 6) * 280 - TILE.w / 2, -330 + Math.floor(SLOT_OF[n] / 6) * 150]
const tileChip = (n: number, label: string): P => [tileAt(n)[0] + 14 + (textW(label) + 20) / 2, tileAt(n)[1] + 82]
const SF = MAIN[0]
/* Inside a stack: the head (logo, name), then one card with App Login rows and Adaptive Access rows. */
const loginY = (i: number) => 30 + i * 32
const adHeadY = (s: Stack) => 30 + s.login.length * 32 + 18
const adY = (s: Stack, i: number) => 30 + s.login.length * 32 + 28 + i * 32
const cardH = (s: Stack) => adY(s, s.adaptive.length) + 6
/* An Adaptive row's check, by row: the IP range, the device limit, the hours. */
const CHIPS = ['India · IP range', 'At most 2 devices', '08:00–20:00']
const chipAt = (s: Stack, i: number, label = CHIPS[i]): P => [s.x + 10 + ROW_W - (textW(label) + 20) / 2 - 6, s.y + 30 + adY(s, i) + 14]
/* Act 2: the copies the admin edits by hand after Salesforce's, one at a time. */
const HOPS = [MAIN[1], MAIN[2], MAIN[3], 9, 14, 3]
const hopAt = (i: number) => 25.9 + i * 0.36

/* Act 3: the two parts, centre stage, then into the Library panel. */
/* Act 3, as Story mode tells it (owner, 6 Nov 2026: "showcase the device and zones like the story mode; the blue one
   doesn't look good"): one old Adaptive Access policy, its checks lifted out into a zone and a device profile, both
   named once, then into the Library. No blue blocks, nothing merged in a pile. */
const OLD_AD = { x: -190, y: -150, w: 380, h: 172 }
/* The device limit sits on top, so the zone's two rows leave downward without crossing it. */
const OLD_ROWS = ['At most 2 devices per user', 'IP 203.0.113.0/24', 'India']
const toZone = (i: number) => i > 0
const oldRowAt = (i: number): P => [OLD_AD.x + 16, OLD_AD.y + 54 + i * 36]
const ZONE: P = [-172, 120]
const DEV: P = [172, 120]
const PART = { w: 300, h: 64 }
const PILL_H = 34
const LIB = { x: -520, y: -190, w: 240, h: 400 }
const LIB_ZONE: P = [LIB.x + LIB.w / 2, LIB.y + 104]
const LIB_DEV: P = [LIB.x + LIB.w / 2, LIB.y + 204]
const LIB_ROW = { w: 208, h: 50 }

/* Rule 1's If, as the Inspector shows it: one group, all must match. */
const COND = [
  { icon: Globe, attr: 'Network zone', op: 'is in zone', value: 'Corporate offices', at: 50.2 },
  { icon: MonitorSmartphone, attr: 'Device profile', op: 'is', value: 'Known devices', at: 50.9 },
  { icon: Clock, attr: 'Sign-in hours', op: 'between', value: '08:00 – 20:00', at: 52 },
]

/* Act 4 on: the canvas. */
const RX = -120
const RW = 400
const START = { x: RX + RW / 2 - 150, y: -210, w: 300, h: 44 }
/* Rule 1's Inspector, to the right of the canvas (owner, 6 Nov 2026: "show the right-side panel with the condition"). */
const INSP = { x: RX + RW + 44, y: -214, w: 356, h: 430 }
const R1 = { y: -128, h: 150 }
const R2 = { y: 52, h: 56 }
const R3 = { y: 138, h: 56 }

export function Scene2D({ t }: { t: number }) {
  /* Act 1: Salesforce's stack builds row by row; the other three, then the wall of 24 and its count. */
  const stackOp = (n: number) => (n === SF ? seg(t, 0, 0.8) : MAIN.includes(n) ? seg(t, 12.4 + MAIN.indexOf(n) * 0.4, 13 + MAIN.indexOf(n) * 0.4) : seg(t, 15.8 + STACKS[n].d * 0.12, 16.4 + STACKS[n].d * 0.12))
  const rowOp = (n: number, kind: 'l' | 'a', i: number) => (n !== SF ? 1 : kind === 'l' ? seg(t, 0.9 + i * 0.5, 1.4 + i * 0.5) : seg(t, 8.3 + i * 0.6, 8.8 + i * 0.6))
  /* The four followed stacks fold shut as the wall comes in; every other application arrives shut. */
  /* Only Salesforce opens; it shuts as the next applications arrive, shut (owner, 6 Nov 2026). */
  const shut = (n: number) => (n === SF ? seg(t, 12, 12.8) : 1)
  const litL = (n: number) => n === SF && span(t, 5, 8.2, 0.3) > 0.5
  const litA = (n: number) => n === SF && span(t, 8.6, 11.6, 0.3) > 0.5
  /* Act 3: the wall fades while its checks leave, then goes. */
  const wallFade = 1 - seg(t, 28.2, 29.2)
  /* The count is said once, when the whole wall is in (owner, 6 Nov 2026: "why 16, then 146?"): no running total. */
  const count = STACKS.reduce((sum, st) => sum + st.login.length + st.adaptive.length, 0)
  const countOp = span(t, 17, 28.6, 0.5)

  /* Act 2 (owner, 6 Nov 2026): the same IP range sits in every application's policies. Editing one changes only that
     one; every other copy is found and edited by hand, one at a time. */
  const editedAt = (n: number) => (n === SF ? 23.4 : HOPS.includes(n) ? hopAt(HOPS.indexOf(n)) + 0.25 : Infinity)
  const edited = (n: number) => t >= editedAt(n) && t < 28.2
  const ipTone = (n: number): Tone => (t >= 28.2 ? 'plain' : edited(n) ? 'lit' : t >= 18.5 ? 'dash' : 'plain')
  const ipLabel = (n: number) => (edited(n) ? 'India · new range' : CHIPS[0])
  const updated = (t >= 23.4 ? 1 : 0) + HOPS.filter((n) => t >= editedAt(n)).length
  /* The wall tilts while the film pans across it, and lies flat again for the edits. */
  /* The whole world sits under one light tilt, deeper on the wall (intro-film-2d-camera.ts). */
  const tiltM = `matrix(${tiltMatrix(tilt2D(t)).map((v) => v.toFixed(4)).join(',')},0,0)`
  /* The cursor: on Salesforce's chip, then hopping copy to copy. */
  const cursorAt = (): P | null => {
    if (t >= 22.4 && t < 24.8) return tileChip(SF, CHIPS[0])
    for (let i = HOPS.length - 1; i >= 0; i--) {
      if (t >= hopAt(i) - 0.3) {
        const from = i === 0 ? tileChip(SF, CHIPS[0]) : tileChip(HOPS[i - 1], CHIPS[0])
        const to = tileChip(HOPS[i], CHIPS[0])
        const k = seg(t, hopAt(i) - 0.3, hopAt(i))
        return t < 28.2 ? [lerp(from[0], to[0], k), lerp(from[1], to[1], k)] : null
      }
    }
    return null
  }
  const cur = cursorAt()
  const [camX, camY, camW] = cam2D(t)
  const camH = camW * 0.5625
  const camS = camW / 1000

  /* Act 3: the old Adaptive policy, its rows lifting out, the two parts becoming pills, then Library rows. */
  const oldOp = seg(t, 28.6, 29.6) * (1 - seg(t, 38.4, 39.2))
  const zoneLift = seg(t, 33.2, 34.6)
  const devLift = seg(t, 36.8, 38.2)
  const rowHot = (i: number) => (toZone(i) ? span(t, 32.4, 34.8, 0.3) : span(t, 36, 38.4, 0.3))
  /* A card appears the moment its checks land on it, so nothing is ever half there. */
  const zoneOp = seg(t, 34.45, 34.75)
  const devOp = seg(t, 38.05, 38.35)
  const toPill = seg(t, 39.6, 40.8)
  const toLib = seg(t, 42, 44)
  const named = span(t, 40, 42.4, 0.4)
  const part = (at: P, lib: P) => {
    const pillW = 190
    const w = toLib > 0 ? lerp(pillW, LIB_ROW.w, toLib) : lerp(PART.w, pillW, toPill)
    const h = toLib > 0 ? lerp(PILL_H, LIB_ROW.h, toLib) : lerp(PART.h, PILL_H, toPill)
    const rx = toLib > 0 ? lerp(PILL_H / 2, 10, toLib) : lerp(10, PILL_H / 2, toPill)
    const c: P = [lerp(at[0], lib[0], toLib), lerp(at[1], lib[1], toLib)]
    return { c, w, h, rx, sub: toLib > 0.6 ? seg(t, 43, 44) : 1 - toPill }
  }
  const zonePart = part(ZONE, LIB_ZONE)
  const devPart = part(DEV, LIB_DEV)

  /* Act 4: the builder. */
  const libOp = seg(t, 42.4, 43.6)
  const libFocus = 1 - 0.75 * seg(t, 59.5, 61)
  const startOp = seg(t, 43.5, 44.5)
  const r1Op = seg(t, 45, 46)
  const who = seg(t, 46.6, 47.6)
  const ifRow = seg(t, 50, 50.8)
  const then = seg(t, 54, 54.8)
  const ghostPages = span(t, 57.2, 59.8, 0.5)
  const inspOp = seg(t, 45.4, 46.6) * (1 - seg(t, 56.4, 57.2))

  /* Act 5. */
  const r2Op = seg(t, 61, 62)
  const r3Op = seg(t, 62.4, 63.4)
  const appsK = (n: number) => seg(t, 65.2 + n * 0.5, 66.4 + n * 0.5)
  const collapse = seg(t, 69.6, 71.6)
  const collapseOp = span(t, 69, 71.8, 0.4)

  /* Act 6. */
  const priya = span(t, 72.4, 78.2, 0.4)
  const arun = span(t, 78.2, END + 1, 0.4)
  const tok1 = seg(t, 73.6, 75.4)
  const tok2 = seg(t, 78.6, 81)
  const r1Good = t >= 75.4 && t < 78.2
  const r3Bad = t >= 81 && t < 82.2

  /* Act 7. */
  const status = t < 82.6 ? null : t < 84.2 ? 'Draft' : t < 85.8 ? 'Approved' : 'Active'

  const startPt: P = [START.x + START.w / 2, START.y + START.h]
  const spine = RX + 28
  const r1Pt: P = [spine, R1.y + 22]
  const r2Pt: P = [spine, R2.y + 28]
  const r3Pt: P = [spine, R3.y + 28]
  const along = (k: number, path: P[]): P => {
    const n = path.length - 1
    const f = k * n
    const i = Math.min(n - 1, Math.floor(f))
    return [lerp(path[i][0], path[i + 1][0], f - i), lerp(path[i][1], path[i + 1][1], f - i)]
  }
  const ruleTone = (good: boolean, bad: boolean, focus: boolean): Tone => (good ? 'good' : bad ? 'bad' : focus ? 'blue' : 'plain')
  const r1Tone = ruleTone(r1Good, false, t >= 45 && t < 58)
  const r3Tone = ruleTone(false, r3Bad, false)
  const onDark = (tone: Tone) => (tone === 'good' || tone === 'bad' ? ' is-white' : '')

  return (
    <>
      <g transform={tiltM}>
      <rect x={-2400} y={-1600} width={4800} height={3200} fill="url(#bfm-dots)" aria-hidden />

      {/* Act 1-3: each application with its stack of old policies: open while the film follows it, then shut */}
      {STACKS.map((st, n) => {
        const k = shut(n)
        const open = stackOp(n) * (1 - k) * wallFade
        const closed = stackOp(n) * k * wallFade
        const [tx, ty] = tileAt(n)
        const ox = lerp(st.x, tx, k)
        const oy = lerp(st.y, ty, k)
        const policies = st.login.length + st.adaptive.length
        return (
          <g key={st.id}>
            {open > 0.001 && (
              <g opacity={open} transform={`translate(${(ox - st.x).toFixed(1)},${(oy - st.y).toFixed(1)})`}>
                <Logo id={st.id} x={st.x} y={st.y} size={18} />
                <text x={st.x + 26} y={st.y + 14} className="f2t is-app">
                  {st.name}
                </text>
                <Card x={st.x} y={st.y + 30} w={STACK_W} h={n === SF ? lerp(30 + st.login.length * 32 + 2, cardH(st), seg(t, 8, 8.6)) : cardH(st)}>
                  <text x={14} y={20} className="f2t is-kicker">
                    App Login
                  </text>
                  {st.login.map((r, i) => (
                    <g key={r} transform={`translate(10,${loginY(i)})`} opacity={rowOp(n, 'l', i)}>
                      <rect width={ROW_W} height={28} rx={6} className={`f2row${litL(n) ? ' is-lit' : ''}`} />
                      <text x={10} y={18} className="f2t is-row is-strong">
                        {r}
                      </text>
                      <text x={ROW_W - 10} y={18} textAnchor="end" className="f2t is-sub">
                        {RESULT[r]}
                      </text>
                    </g>
                  ))}
                  <text x={14} y={adHeadY(st)} className="f2t is-kicker" opacity={rowOp(n, 'a', 0)}>
                    Adaptive Access
                  </text>
                  {st.adaptive.map((r, i) => (
                    <g key={r} transform={`translate(10,${adY(st, i)})`} opacity={rowOp(n, 'a', i)}>
                      <rect width={ROW_W} height={28} rx={6} className={`f2row${litA(n) ? ' is-lit' : ''}`} />
                      <text x={10} y={18} className="f2t is-row is-strong">
                        {r}
                      </text>
                    </g>
                  ))}
                </Card>
                {st.adaptive.map((_, i) => {
                  const at = chipAt(st, i)
                  return <Chip key={i} cx={at[0]} cy={at[1]} label={CHIPS[i]} op={rowOp(n, 'a', i)} />
                })}
              </g>
            )}
            {closed > 0.001 && (
              <g opacity={closed}>
                <Card x={tx} y={ty} w={TILE.w} h={TILE.h}>
                  <Logo id={st.id} x={14} y={14} size={18} />
                  <text x={40} y={28} className="f2t is-app">
                    {st.name}
                  </text>
                  <text x={14} y={54} className="f2t is-sub">
                    {`${st.login.length} App Login · ${st.adaptive.length} Adaptive Access`}
                  </text>
                  <text x={TILE.w - 14} y={28} textAnchor="end" className="f2t is-num">
                    {policies}
                  </text>
                </Card>
                <Chip cx={tileChip(n, ipLabel(n))[0]} cy={tileChip(n, ipLabel(n))[1]} label={ipLabel(n)} tone={ipTone(n)} />
              </g>
            )}
          </g>
        )
      })}

      {/* the cursor, editing one copy at a time */}
      {cur && <path d={`M${cur[0] + 30} ${cur[1] + 2} l0 18 l5 -5 l4 9 l3 -1.5 l-4 -9 l7 0 z`} className="f2cursor" />}

      {/* Act 4 on: the Library panel */}
      <Card x={LIB.x} y={LIB.y} w={LIB.w} h={LIB.h} tone="soft" op={libOp * libFocus}>
        <text x={16} y={28} className="f2t is-title">
          Library
        </text>
        <text x={16} y={66} className="f2t is-kicker">
          Zones
        </text>
        <text x={16} y={166} className="f2t is-kicker">
          Device profiles
        </text>
      </Card>

      {/* Act 3: one old Adaptive Access policy and its three checks */}
      {oldOp > 0 && (
        <g opacity={oldOp}>
          <Card x={OLD_AD.x} y={OLD_AD.y} w={OLD_AD.w} h={OLD_AD.h} tone="dash">
            <Globe x={16} y={15} width={16} height={16} strokeWidth={2} className="f2ico" />
            <text x={40} y={28} className="f2t is-b">
              Adaptive Access Policy
            </text>
          </Card>
          {OLD_ROWS.map((r, i) => {
            const [x, y] = oldRowAt(i)
            const lift = toZone(i) ? zoneLift : devLift
            const to = toZone(i) ? ZONE : DEV
            /* Lands on the card's own words: the first on its name, India on the line under it. */
            const px = lerp(x, to[0] - PART.w / 2 + 12, lift)
            const py = lerp(y, to[1] - 19 + (i === 2 ? 18 : 0), lift)
            const Icon = i === 0 ? MonitorSmartphone : i === 1 ? Network : MapPin
            return (
              <g key={r} transform={`translate(${px.toFixed(1)},${py.toFixed(1)})`} opacity={1 - seg(t, toZone(i) ? 34.55 : 38.15, toZone(i) ? 34.75 : 38.35)}>
                <rect x={-6} y={-4} width={OLD_AD.w - 20} height={30} rx={6} className={`f2row${rowHot(i) > 0.5 ? ' is-hot' : ''}`} opacity={rowHot(i)} />
                <Icon x={4} y={4} width={14} height={14} strokeWidth={2} className="f2ico" />
                <text x={26} y={16} className="f2t is-row">
                  {r}
                </text>
              </g>
            )
          })}
        </g>
      )}
      {named > 0 && (
        <text x={0} y={60} textAnchor="middle" className="f2t is-cap" opacity={named}>
          Named once, used in any rule
        </text>
      )}

      {/* Act 3-4: the zone and the device profile, named once, then kept in the Library */}
      {[
        { key: 'zone', p: zonePart, op: zoneOp, Icon: Globe, name: 'Corporate offices', kind: 'Zone', sub: 'IP 203.0.113.0/24 · India' },
        { key: 'dev', p: devPart, op: devOp, Icon: MonitorSmartphone, name: 'Known devices', kind: 'Device profile', sub: 'At most 2 devices per user' },
      ].map(({ key, p, op, Icon, name, kind, sub }) =>
        op > 0.001 ? (
          <g key={key} transform={`translate(${(p.c[0] - p.w / 2).toFixed(1)},${(p.c[1] - p.h / 2).toFixed(1)})`} opacity={op * libFocus}>
            <rect width={p.w} height={p.h} rx={p.rx} className={`f2part${toPill > 0.5 && toLib < 0.5 ? ' is-pill' : ''}`} />
            {p.h > 46 ? (
              <>
                <Icon x={14} y={p.h / 2 - 16} width={16} height={16} strokeWidth={2} className="f2ico is-dark" />
                <text x={38} y={p.h / 2 - 3} className="f2t is-b">
                  {name}
                </text>
                <text x={38} y={p.h / 2 + 15} className="f2t is-sub" opacity={p.sub}>
                  {toLib > 0.5 ? sub : `${kind} · ${sub}`}
                </text>
              </>
            ) : (
              <>
                <Icon x={14} y={p.h / 2 - 8} width={16} height={16} strokeWidth={2} className="f2ico is-dark" />
                <text x={38} y={p.h / 2 + 5} className="f2t is-b">
                  {name}
                </text>
              </>
            )}
          </g>
        ) : null,
      )}

      {/* the applications this one policy covers */}
      {[
        ['salesforce', RX + RW / 2 - 120],
        ['workday', RX + RW / 2],
        ['zoom', RX + RW / 2 + 120],
      ].map(([id, x], n) => {
        const k = appsK(n)
        if (k <= 0) return null
        const cx = x as number
        return (
          <g key={id as string}>
            <Wire path={[[cx, -262], [cx, -236], [START.x + START.w / 2, -236], [START.x + START.w / 2, START.y]]} k={k} tone="grey" />
            <Card x={cx - 22} y={-306} w={44} h={44} op={k}>
              <Logo id={id as string} x={11} y={11} size={22} />
            </Card>
          </g>
        )
      })}

      {/* the start of the canvas */}
      <Card x={START.x} y={START.y} w={START.w} h={START.h} tone="blue" op={startOp}>
        <Logo id="salesforce" x={14} y={13} size={18} />
        <text x={40} y={27} className="f2t is-b">
          {appsK(0) > 0.5 ? 'A sign-in arrives' : 'A sign-in arrives at Salesforce'}
        </text>
        {status && <Pill x={START.w - 92} y={12} label={status} tone={status.toLowerCase() as 'draft' | 'approved' | 'active'} />}
      </Card>
      <Wire path={[startPt, [startPt[0], R1.y - 14], [spine, R1.y - 14], [spine, R1.y]]} k={seg(t, 45, 46)} tone="grey" />

      {/* rule 1: who, if, then */}
      <Card x={RX} y={R1.y} w={RW} h={R1.h} tone={r1Tone} op={r1Op}>
        <rect x={14} y={12} width={22} height={22} rx={6} className={`f2num${onDark(r1Tone)}`} />
        <text x={25} y={27} textAnchor="middle" className={`f2t is-num${onDark(r1Tone)}`}>
          1
        </text>
        <text x={46} y={28} className={`f2t is-b${onDark(r1Tone)}`}>
          Sales
        </text>
        {[
          ['Who', 'Sales', who],
          ['If', 'Corporate offices · Known devices', ifRow],
          ['Then', 'Password, then OTP', then],
        ].map(([k, v, op], i) => (
          <g key={k as string} transform={`translate(14,${46 + i * 32})`} opacity={op as number}>
            <rect width={RW - 28} height={26} rx={6} className={`f2row${onDark(r1Tone) ? ' is-dark' : ''}`} />
            <text x={10} y={17} className={`f2t is-k${onDark(r1Tone)}`}>
              {k as string}
            </text>
            <text x={56} y={17} className={`f2t is-row${onDark(r1Tone)}`}>
              {v as string}
            </text>
          </g>
        ))}
      </Card>
      {t >= 52.4 && r1Op > 0 && <Chip cx={RX + RW - 50} cy={R1.y + 91} label="08–20" tone={r1Tone === 'good' ? 'plain' : 'blue'} op={seg(t, 52.4, 52.9) * r1Op} />}

      {/* rule 1's Inspector: Who, If (one group, all must match), Then, filling in as the card does */}
      {inspOp > 0 && (
        <g transform={`translate(${(INSP.x + (1 - seg(t, 45.4, 46.6)) * 50).toFixed(1)},${INSP.y})`} opacity={inspOp}>
          <rect width={INSP.w} height={INSP.h} rx={12} className="f2c" />
          <text x={18} y={30} className="f2t is-title">
            Rule 1 · Sales
          </text>
          <line x1={0} y1={46} x2={INSP.w} y2={46} className="f2rule" />
          <text x={18} y={72} className="f2t is-kicker">
            Who
          </text>
          <g opacity={who}>
            <Chip cx={18 + (textW('Sales') + 20) / 2} cy={92} label="Sales" />
          </g>
          <text x={18} y={130} className="f2t is-kicker" opacity={ifRow}>
            If
          </text>
          <g transform="translate(14,140)" opacity={ifRow}>
            <rect width={INSP.w - 28} height={186} rx={10} className="f2grp" />
            <text x={12} y={20} className="f2t is-k">
              Group A
            </text>
            <text x={70} y={20} className="f2t is-sub">
              all must match
            </text>
            {COND.map((c, i) => {
              const op = seg(t, c.at, c.at + 0.5)
              const Icon = c.icon
              return (
                <g key={c.attr} transform={`translate(10,${32 + i * 50})`} opacity={op}>
                  <rect width={INSP.w - 48} height={34} rx={7} className="f2cell" />
                  <line x1={118} y1={0} x2={118} y2={34} className="f2rule" />
                  <line x1={186} y1={0} x2={186} y2={34} className="f2rule" />
                  <Icon x={10} y={10} width={14} height={14} strokeWidth={2} className="f2ico" />
                  <text x={30} y={21} className="f2t is-cell">
                    {c.attr}
                  </text>
                  <text x={126} y={21} className="f2t is-cell is-soft">
                    {c.op}
                  </text>
                  <text x={194} y={21} className="f2t is-cell">
                    {c.value}
                  </text>
                  {i < COND.length - 1 && (
                    <text x={10} y={46} className="f2t is-sub" opacity={seg(t, COND[i + 1].at, COND[i + 1].at + 0.5)}>
                      and
                    </text>
                  )}
                </g>
              )
            })}
          </g>
          <text x={18} y={354} className="f2t is-kicker" opacity={then}>
            Then
          </text>
          <g transform="translate(14,364)" opacity={then}>
            <rect width={INSP.w - 28} height={46} rx={8} className="f2allow" />
            <text x={14} y={20} className="f2t is-b is-good">
              Allow
            </text>
            <text x={14} y={37} className="f2t is-sub">
              Password, then OTP
            </text>
          </g>
        </g>
      )}

      {/* the Library parts wired into rule 1's If, the zone into rule 2 */}
      <g opacity={libFocus}>
      <Wire path={[[LIB_ZONE[0] + LIB_ROW.w / 2, LIB_ZONE[1]], [RX - 50, LIB_ZONE[1]], [RX - 50, R1.y + 86], [RX, R1.y + 86]]} k={seg(t, 50.2, 51.6)} />
      <Wire path={[[LIB_DEV[0] + LIB_ROW.w / 2, LIB_DEV[1]], [RX - 30, LIB_DEV[1]], [RX - 30, R1.y + 96], [RX, R1.y + 96]]} k={seg(t, 50.8, 52.2)} />
      <Wire path={[[LIB_ZONE[0] + LIB_ROW.w / 2, LIB_ZONE[1] + 10], [RX - 70, LIB_ZONE[1] + 10], [RX - 70, R2.y + 28], [RX, R2.y + 28]]} k={seg(t, 63, 64.4)} />
      </g>

      {/* the two old pages one rule replaces */}
      {ghostPages > 0 && (
        <g opacity={ghostPages}>
          <Card x={RX + RW + 40} y={R1.y + 4} w={170} h={60} tone="dash">
            <text x={14} y={36} className="f2t is-sub">
              App Login · Salesforce
            </text>
          </Card>
          <Card x={RX + RW + 40} y={R1.y + 78} w={170} h={60} tone="dash">
            <text x={14} y={36} className="f2t is-sub">
              Adaptive Access · Salesforce
            </text>
          </Card>
          <Wire path={[[RX + RW + 40, R1.y + 70], [RX + RW + 6, R1.y + 70]]} k={1} tone="grey" />
        </g>
      )}
      {span(t, 55.5, 72, 0.4) > 0 && !r1Good && <Pill x={RX + RW - 84} y={R1.y + 12} label="Allowed" tone="good" />}

      {/* Act 5: more rules */}
      <Wire path={[[spine, R1.y + R1.h], [spine, R2.y]]} k={r2Op} tone="grey" />
      <Card x={RX} y={R2.y} w={RW} h={R2.h} op={r2Op}>
        <rect x={14} y={17} width={22} height={22} rx={6} className="f2num" />
        <text x={25} y={32} textAnchor="middle" className="f2t is-num">
          2
        </text>
        <text x={46} y={33} className="f2t is-b">
          Finance
        </text>
        <text x={RW - 16} y={33} textAnchor="end" className="f2t is-sub">
          Password, then OTP
        </text>
      </Card>
      <Wire path={[[spine, R2.y + R2.h], [spine, R3.y]]} k={r3Op} tone="grey" />
      <Card x={RX} y={R3.y} w={RW} h={R3.h} tone={r3Tone === 'bad' ? 'bad' : 'soft'} op={r3Op}>
        <text x={16} y={33} className={`f2t is-b${onDark(r3Tone)}`}>
          Nothing else matched
        </text>
        <text x={RW - 16} y={33} textAnchor="end" className={`f2t is-sub${onDark(r3Tone)}`}>
          Deny
        </text>
      </Card>

      {/* eight old pages folding into the one policy */}
      {collapseOp > 0 &&
        [...STACKS[SF].login.map((_, i) => loginY(i)), ...STACKS[SF].adaptive.map((_, i) => adY(STACKS[SF], i))].map((y, i) => {
          const w = lerp(ROW_W, 40, collapse)
          const h = lerp(28, 14, collapse)
          const sf = STACKS[SF]
          return <Card key={i} x={lerp(sf.x + 10, RX + RW / 2 - w / 2, collapse)} y={lerp(sf.y + 30 + y, R1.y + 60, collapse)} w={w} h={h} tone="dash" op={collapseOp * (1 - collapse * 0.7)} />
        })}

      {/* Act 6: two people, two sign-ins */}
      {priya > 0 && (
        <Card x={RX + RW + 50} y={-226} w={240} h={64} tone="plain" op={priya}>
          <text x={16} y={27} className="f2t is-b">
            Priya
          </text>
          <text x={16} y={47} className="f2t is-sub">
            Sales · in India · trusted laptop
          </text>
        </Card>
      )}
      {arun > 0 && (
        <Card x={RX + RW + 50} y={-226} w={240} h={64} tone="plain" op={arun}>
          <text x={16} y={27} className="f2t is-b">
            Arun
          </text>
          <text x={16} y={47} className="f2t is-sub">
            Sales · abroad · new phone
          </text>
        </Card>
      )}
      {tok1 > 0 && tok1 < 1 && <circle className="f2tok is-good" r={8} cx={along(tok1, [startPt, [startPt[0], R1.y - 14], [spine, R1.y - 14], r1Pt])[0]} cy={along(tok1, [startPt, [startPt[0], R1.y - 14], [spine, R1.y - 14], r1Pt])[1]} />}
      {tok2 > 0 && tok2 < 1 && (
        <circle className="f2tok is-bad" r={8} cx={along(tok2, [startPt, [startPt[0], R1.y - 14], [spine, R1.y - 14], r1Pt, r2Pt, r3Pt])[0]} cy={along(tok2, [startPt, [startPt[0], R1.y - 14], [spine, R1.y - 14], r1Pt, r2Pt, r3Pt])[1]} />
      )}
      {r1Good && <Pill x={RX + RW + 14} y={R1.y + 14} label="Allowed" tone="good" />}
      {r3Bad && <Pill x={RX + RW + 14} y={R3.y + 18} label="Denied" tone="bad" />}
      </g>

      {/* the count at the top of the picture: how many there are, then how few are done by hand */}
      {countOp > 0 && (
        <g transform={`translate(${camX.toFixed(1)},${(camY - camH / 2 + 56 * camS).toFixed(1)}) scale(${camS.toFixed(3)})`} opacity={countOp}>
          <rect x={-200} y={-34} width={400} height={64} rx={14} className="f2c" />
          <text x={0} y={9} textAnchor="middle" className="f2t is-count">
            {t >= 23.4 && t < 28.2 ? `${updated} of ${STACKS.length} updated` : `${count} old policies`}
          </text>
        </g>
      )}

    </>
  )
}
