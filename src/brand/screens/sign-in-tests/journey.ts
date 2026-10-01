import type { AccessDecision } from '../../data'
import { DECISION_TONE } from '../../decision-words'
import type { LineStatus } from '../testing/evidence'
import { FIELD_OF_FACT } from '../testing/sign-in-fields'
import type { FormField } from '../testing/sign-in-form'
import { CONNECTOR, type TokenId, type TokenValue } from '../testing/sign-in-sentence'
import type { AsGroupRow, Finding, FindingKind, RuleConflict } from './conflicts'
import type { EnginePolicy, EngineRule, EngineRun, NodeId } from './engine-run'

/* -----------------------------------------------------------------------------
   The engine run's canvas geometry (TESTING-V4 §8.6): where the wires between
   the measured boxes go, where the answer hangs, and how far the canvas scrolls
   to keep the engine's step in view. Pure; TryJourney.tsx measures the boxes
   and draws what this returns.

     Sign-in ──┬── [Developer tools — office and device checks   Decides]
               │   [ 1  In the office …                        No match ]
               │   [ 2  Compliant device, working remotely      ✓ ✓    ]━━ [Allow with 2FA]
               │   [ ↳  Nothing else matched                Not reached ]
               └── [Global Default Policy                    Not reached]

   The rules are INSIDE the policy that decides, so the only wires are the fan
   from the sign-in to every policy, and the one from the rule the walk stopped
   at out to the answer — leaving the policy's right edge at that rule's line.

   Boxes are measured against the stage by offsets, never by transformed
   rects: the sign-in node arrives by a layout animation and the answer by a
   spring, and a wire that followed a transform would wobble while they move.
   They are measured again after every step and whenever a part resizes (a
   policy opening, a rule folding), so a wire never aims at where a card USED
   to be (the old journey's bug: cards grew as it travelled, and its route was
   frozen at the start).

   Two orientations (§11.1, §12.3). Horizontal is the drawing above. Vertical
   is one column — the Sign-in tests page's only layout: the start on top, the
   card of policies under it and the answer under that, one flow into one
   thing, joined by a SPINE down the middle:

                 [Sign-in]
                     │
     ┌ Policies on GitHub Enterprise ─────────────────┐
     │ 1  Developer tools — office and device …  Decides │
     │      1  In the office …               No match   │
     │      2  Compliant device, working remotely  ✓ ✓  │
     │ 2  Global Default Policy              Not reached │
     └───────────────────────────────────────────────────┘
                     │
               [Allow with 2FA]

   The spine drops from the start's foot into the card's top, and from the
   card's foot into the answer's top; inside the card the rail through the
   rules' numbers carries the way on. The spine is neutral as the card
   arrives, lit once a policy decides, and lit on out to the answer as it
   lands.
   -------------------------------------------------------------------------- */

/** Side by side, or one column. */
export type Orientation = 'horizontal' | 'vertical'

/* The least width the three lanes stand side by side in: the lanes at their
   narrowest (208 + 400 + 216), two gaps of 32 and the stage's padding of 24 a
   side. journey.css's grid is these numbers (journey-ui.test pins them), and
   its gaps and padding give way near it so the stage always leaves a
   scrollbar's room: side by side at this width or wider never scrolls
   sideways. */
export const LANES_MIN_W = 936

/** How far past the least a canvas must grow before the lanes go back side by side: a grip dragged, or a scrollbar coming and going, never flaps the layout. */
export const LANE_HYSTERESIS = 16

/* The orientation a canvas `width` wide can hold, given the one it holds now
   (`prev`). Below the least it is one column; back side by side only once it
   is the hysteresis past it. A canvas not measured yet (0 wide, hidden)
   keeps what it had. */
export function laneFit(width: number, prev: Orientation | null = null): Orientation {
  if (!(width > 0)) return prev ?? 'horizontal'
  if (width < LANES_MIN_W) return 'vertical'
  if (prev === 'vertical' && width < LANES_MIN_W + LANE_HYSTERESIS) return 'vertical'
  return 'horizontal'
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
  /* Where a wire meets it, down from its top: a policy's head, a rule's
     title line, the sign-in's person, the answer's badge. A tall card is met at
     its name, not half way down. Absent, the middle. */
  port?: number
}

export type Boxes = Partial<Record<NodeId, Box>>

const portY = (b: Box) => b.y + (b.port ?? b.h / 2)
const right = (b: Box) => b.x + b.w

export const boxesSig = (b: Boxes): string =>
  Object.entries(b)
    .map(([k, v]) => `${k}:${Math.round(v!.x)},${Math.round(v!.y)},${Math.round(v!.w)},${Math.round(v!.h)},${Math.round(v!.port ?? -1)}`)
    .join(';')

// --- A line ------------------------------------------------------------------------------

export interface Point {
  x: number
  y: number
}

/** A quadratic corner of radius r, as drawn: a quarter circle is 1.571 r; this curve is 1.623 r. */
const CORNER = 1.6232

/* An orthogonal line through `points` with its corners rounded, as an SVG
   path, and its length. A corner's radius is at most half of either leg, so
   two corners close together never overlap. */
export function roundedPath(points: readonly Point[], radius = 10): { d: string; length: number } {
  const pts = points.filter((p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) > 0.01 || Math.abs(p.y - points[i - 1].y) > 0.01)
  if (pts.length === 0) return { d: '', length: 0 }
  const f = (n: number) => String(Math.round(n * 100) / 100)
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  let length = 0
  const legs: number[] = []
  for (let i = 1; i < pts.length; i++) legs.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const radii: number[] = pts.map(() => 0)
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const turns = Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > 0.01
    radii[i] = turns ? Math.min(radius, legs[i - 1] / 2, legs[i] / 2) : 0
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const leg = legs[i - 1]
    const ux = leg === 0 ? 0 : (b.x - a.x) / leg
    const uy = leg === 0 ? 0 : (b.y - a.y) / leg
    const r = radii[i]
    const straight = leg - radii[i - 1] - r
    if (r > 0) {
      const c = pts[i + 1]
      const out = legs[i]
      const vx = (c.x - b.x) / out
      const vy = (c.y - b.y) / out
      d += ` L${f(b.x - ux * r)} ${f(b.y - uy * r)} Q${f(b.x)} ${f(b.y)} ${f(b.x + vx * r)} ${f(b.y + vy * r)}`
      length += straight + CORNER * r
    } else {
      d += ` L${f(b.x)} ${f(b.y)}`
      length += straight
    }
  }
  return { d, length }
}

// --- The wires -----------------------------------------------------------------------------

export interface WireModel {
  policies: readonly { policyId: string; node: NodeId; decides: boolean }[]
  /** The policy that decides: the last wire leaves its right edge. */
  container: NodeId | null
  /** Where the last wire leaves it, level with: the rule the walk stopped at, or the policy's head while it is closed. */
  from: NodeId | null
}

export interface Drawn {
  d: string
  length: number
}

export interface EngineWires {
  /** The sign-in to every policy on the application: neutral. Horizontal only. */
  fan: { policyId: string; d: string }[]
  /** Vertical: the spine from the start into the card of policies, neutral under the lit way. */
  trunk: Drawn | null
  /** The sign-in to the policy that decides: the lit part of the fan — vertical, the spine into the card, lit. */
  toDecider: Drawn | null
  /** From the rule it stopped at, out of the policy, to the answer — vertical, the spine out of the card's foot into the answer. */
  out: Drawn | null
}

const NONE: EngineWires = { fan: [], trunk: null, toDecider: null, out: null }

/* Every elbow turns half way across the gutter between two lanes, so the
   lines of the fan share a vertical and read as one branching line. Vertical,
   that shared vertical is the trunk down the left (`verticalWires`). */
export function engineWires(boxes: Boxes, m: WireModel, orient: Orientation = 'horizontal'): EngineWires {
  const signIn = boxes['sign-in']
  if (!signIn) return NONE
  const rows = m.policies.map((p) => ({ p, box: boxes[p.node] })).filter((r): r is { p: WireModel['policies'][number]; box: Box } => r.box !== undefined)
  if (rows.length === 0) return NONE
  if (orient === 'vertical') return verticalWires(boxes, m, signIn, rows)

  const xFan = (right(signIn) + Math.min(...rows.map((r) => r.box.x))) / 2
  const fanTo = (box: Box) =>
    roundedPath([
      { x: right(signIn), y: portY(signIn) },
      { x: xFan, y: portY(signIn) },
      { x: xFan, y: portY(box) },
      { x: box.x, y: portY(box) },
    ])
  const fan = rows.map((r) => ({ policyId: r.p.policyId, d: fanTo(r.box).d }))
  const decider = rows.find((r) => r.p.decides)?.box
  const toDecider = decider ? fanTo(decider) : null

  const container = m.container ? boxes[m.container] : undefined
  const from = m.from ? boxes[m.from] : undefined
  const outcome = boxes.outcome
  let out: Drawn | null = null
  if (container && from && outcome && outcome.x > right(container)) {
    const xOut = (right(container) + outcome.x) / 2
    out = roundedPath([
      { x: right(container), y: portY(from) },
      { x: xOut, y: portY(from) },
      { x: xOut, y: portY(outcome) },
      { x: outcome.x, y: portY(outcome) },
    ])
  }
  return { fan, trunk: null, toDecider, out }
}

/** Vertical: how far down the gap between two blocks the spine turns, when the two are not centred on one line. */
const SPINE_TURN = 0.5

/* Vertical: the spine, centre to centre. From the start's foot into the top
   of the card of policies (`which`; before it is measured, the policies' own
   box), and — once the answer stands below the card — from the card's foot
   into the answer's top. Two blocks not centred on one line are joined by a
   step half way down the gap between them. */
function verticalWires(boxes: Boxes, m: WireModel, signIn: Box, rows: readonly { p: WireModel['policies'][number]; box: Box }[]): EngineWires {
  const card: Box = boxes.which ?? {
    x: Math.min(...rows.map((r) => r.box.x)),
    y: Math.min(...rows.map((r) => r.box.y)),
    w: Math.max(...rows.map((r) => right(r.box))) - Math.min(...rows.map((r) => r.box.x)),
    h: Math.max(...rows.map((r) => r.box.y + r.box.h)) - Math.min(...rows.map((r) => r.box.y)),
  }
  const mid = (b: Box) => b.x + b.w / 2
  const join = (a: Point, b: Point): Drawn => {
    if (Math.abs(a.x - b.x) < 1) return roundedPath([a, { x: a.x, y: b.y }])
    const turn = a.y + (b.y - a.y) * SPINE_TURN
    return roundedPath([a, { x: a.x, y: turn }, { x: b.x, y: turn }, b], 8)
  }
  const foot = signIn.y + signIn.h
  const trunk = card.y > foot ? join({ x: mid(signIn), y: foot }, { x: mid(card), y: card.y }) : null
  const decides = rows.some((r) => r.p.decides)
  const outcome = boxes.outcome
  const cardFoot = card.y + card.h
  const out = m.container && outcome && outcome.y > cardFoot ? join({ x: mid(card), y: cardFoot }, { x: mid(outcome), y: outcome.y }) : null
  return { fan: [], trunk, toDecider: decides ? trunk : null, out }
}

/** How far past the floor an answer may hang before it rises: less than a check row is not worth a bend in the wire. */
export const PAD_SLACK = 48

/* How far down its lane the answer hangs, so it sits level with what it is
   aligned to — the rule the walk stopped at, or the policy's head when the
   policy is closed — and the last wire runs straight. The answer's own port
   is its badge, `port` down from its top; before it has been measured,
   `fallbackPort`. Never above the lane's top.

   And never lower than it must be: an answer whose foot would hang past
   `floor` — the foot of the policies, or of the canvas as it shows, whichever
   is lower — rises until its foot meets it, and the wire bends up to it. A
   tall answer (Depends lists every outcome) hung level with the last row
   would push the stage past the canvas and leave the policies' side empty
   below, for nothing. */
export function outcomePad(boxes: Boxes, anchor: NodeId | null, laneTop: number, fallbackPort: number, floor = Infinity): number {
  const at = anchor ? boxes[anchor] : undefined
  if (!at) return 0
  const port = boxes.outcome?.port ?? fallbackPort
  const level = Math.max(0, Math.round(portY(at) - laneTop - port))
  const h = boxes.outcome?.h
  if (h === undefined || !Number.isFinite(floor)) return level
  const room = Math.max(0, Math.round(floor - laneTop - h))
  return level - room > PAD_SLACK ? room : level
}

// --- Keeping the step in view --------------------------------------------------------------

/** The scroller as it stands: where it has scrolled to, and how much it shows. */
export interface View {
  left: number
  top: number
  width: number
  height: number
}

export interface Inset {
  top: number
  right: number
  bottom: number
  left: number
}

/* Where to scroll so `target` (in the scroller's content, the way `View` is)
   is in view, clear of `inset` — the engine line over the top, a margin on the
   other sides — or null when it already is. A target still growing (a rule
   whose rows are sliding open) asks for at least `reach` of height. One
   taller or wider than the view is shown from its start. */
export function followTo(view: View, target: Box, inset: Inset, reach = 0): { left: number; top: number } | null {
  const axis = (pos: number, size: number, start: number, extent: number, before: number, after: number) => {
    const lo = start - before
    const hi = start + extent + after
    if (hi - lo > size) return lo
    if (lo < pos) return lo
    if (hi > pos + size) return hi - size
    return pos
  }
  const top = Math.max(0, Math.round(axis(view.top, view.height, target.y, Math.max(target.h, reach), inset.top, inset.bottom)))
  const left = Math.max(0, Math.round(axis(view.left, view.width, target.x, target.w, inset.left, inset.right)))
  if (Math.abs(top - view.top) < 2 && Math.abs(left - view.left) < 2) return null
  return { left, top }
}

// --- The chain's nodes, as data (TESTING-V4 §13.2, §14.3) --------------------------------------

/* The vertical run is drawn in the POLICY BUILDER'S visual language: the
   builder's start pill, then three nodes on its spine — the PERSON, the
   POLICY (its rules as the builder's rule cards, read-only), the OUTCOME. What
   each node says is worked out here, pure, from the plan and the sign-in; the
   components (RunChain.tsx) only draw it.

     (A sign-in arrives at GitHub Enterprise)
                    │
     ┌ [AP] Arun Patel · arun.patel@… ─────────────────┐
     │ groups        [Engineering] [Finance]            │
     │ this sign-in  [Network] Office network in zone [Corporate offices]
     │               [Device] Windows 11 laptop meets [Compliant devices]
     └──────────────────────────────────────────────────┘
                    │
     ┌ Developer tools — office and device checks [Decides]
     │ First policy on GitHub Enterprise that covers Arun Patel
     │ 1 other: Global Default Policy · not reached ›
     │  [1 In the office …           No match   ] ✕ Network · Home broadband …
     │  [2 Compliant device …        Matched    ] who ✓ · if ✓ · then …
     │  [3 Finance, on a compliant … Not reached]
     └──────────────────────────────────────────────────┘
                    │
              [Allow with 2FA] */

/** Where a rule card stands at a step, as its head says. */
export type TraceResult = 'waiting' | 'reading' | 'matched' | 'missed' | 'folded' | 'unknown' | 'possible' | 'off' | 'not-reached'

/** A rule card's standing at step `s`: quiet until the engine opens it, read, then its result — a miss folded once the engine leaves it (unless Show all checks). */
export function traceResult(r: Pick<EngineRule, 'state' | 'startAt' | 'endAt' | 'compactAt'>, s: number, showAll = false): TraceResult {
  if (r.state === 'not-reached') return r.startAt >= 0 && s >= r.startAt ? 'not-reached' : 'waiting'
  if (r.startAt < 0 || s < r.startAt) return 'waiting'
  if (r.state === 'off') return 'off'
  if (s < r.endAt) return 'reading'
  switch (r.state) {
    case 'match':
      return 'matched'
    case 'no-match':
      return !showAll && r.compactAt !== null && s >= r.compactAt ? 'folded' : 'missed'
    case 'unknown':
      return 'unknown'
    default:
      return 'possible'
  }
}

/** A row's mark on a rule card: the answer landed (✓ ✕ –), or the spinner while it is read. */
export interface RowMark {
  status: LineStatus
  working: boolean
}

export interface RuleMarks {
  /** The who row's mark, or null while it is not read (or the rule has no who). */
  who: RowMark | null
  /** Each condition's mark, by its id; absent while it is not read. */
  conds: Record<string, RowMark>
  /** Rows the engine never read because an earlier one ended the rule: "Not checked". `who` for the who row. */
  skipped: string[]
}

const NO_MARKS: RuleMarks = { who: null, conds: {}, skipped: [] }

/* The marks on a rule card at step `s`, from the plan's check rows. A row of
   the plan is a CATEGORY (Who, Network, Device …) and may hold several of the
   card's conditions; each condition takes its own standing where the row
   names it among its parts, else the row's. A row's conditions are marked
   together, as the engine reads that row: a spinner while it is read, its mark
   as it lands. The rows after the failing one of a run of ANDs are never
   read — "Not checked", once the rule has settled. */
export function ruleMarks(
  r: Pick<EngineRule, 'checks' | 'checked' | 'checkAt' | 'markAt' | 'visited'>,
  conditionIds: readonly string[],
  s: number,
): RuleMarks {
  if (!r.visited || r.checks.length === 0) return NO_MARKS
  const phase = (k: number): 'hidden' | 'working' | 'settled' => {
    const at = r.checkAt[k]
    if (at === undefined || s < at) return 'hidden'
    return s < (r.markAt[k] ?? at + 1) ? 'working' : 'settled'
  }
  const markOf = (k: number, status: LineStatus): RowMark | null => {
    const p = phase(k)
    return p === 'hidden' ? null : { status, working: p === 'working' }
  }
  const last = r.markAt.at(-1)
  const settled = last !== undefined && s >= last
  const skipped: string[] = []
  const whoK = r.checks.findIndex((c) => c.category === 'who')
  let who: RowMark | null = null
  if (whoK >= r.checked) {
    if (settled) skipped.push('who')
  } else if (whoK >= 0) who = markOf(whoK, r.checks[whoK].status)
  const conds: Record<string, RowMark> = {}
  for (const id of conditionIds) {
    const k = r.checks.findIndex((c) => c.category !== 'who' && (c.key === id || c.subs.some((sub) => sub.key === id)))
    if (k < 0) continue
    if (k >= r.checked) {
      if (settled) skipped.push(id)
      continue
    }
    const row = r.checks[k]
    const own = row.subs.find((sub) => sub.key === id)
    const m = markOf(k, own ? own.status : row.status)
    if (m) conds[id] = m
  }
  return { who, conds, skipped }
}

/* A later rule that also applies (a conflict): the rows that held, and the
   ones that could not be told, from the resolver's own trace — the engine
   never read it, so nothing turns; the marks are simply there once its
   notice is. A row that did not hold is left unmarked: it would not be a
   conflict. */
export function alsoMarks(r: Pick<EngineRule, 'alsoChecks'>, conditionIds: readonly string[]): RuleMarks {
  const rows = r.alsoChecks
  if (!rows || rows.length === 0) return NO_MARKS
  const settled = (status: LineStatus): RowMark | null => (status === 'pass' || status === 'unknown' ? { status, working: false } : null)
  const whoRow = rows.find((c) => c.category === 'who')
  const conds: Record<string, RowMark> = {}
  for (const id of conditionIds) {
    const row = rows.find((c) => c.category !== 'who' && (c.key === id || c.subs.some((sub) => sub.key === id)))
    if (!row) continue
    const m = settled(row.subs.find((sub) => sub.key === id)?.status ?? row.status)
    if (m) conds[id] = m
  }
  return { who: whoRow ? settled(whoRow.status) : null, conds, skipped: [] }
}

/** What a card's marks show, as a string: two steps that show the same draw the same. */
export const marksSig = (m: RuleMarks): string =>
  `${m.who ? `${m.who.status}${m.who.working ? '~' : ''}` : '-'}|${Object.entries(m.conds)
    .map(([k, v]) => `${k}:${v.status}${v.working ? '~' : ''}`)
    .join(',')}|${m.skipped.join(',')}`

// --- The policy node's words ---

/* Why the policy that decides is the one: "First policy that covers Arun
   Patel"; the Global Default, when no policy of the application's decides —
   one switched off, or not for them: "No other policy decides for Kavya
   Menon". Short, to share one line with the others (the start pill above
   names the application). */
export function whyLine(plan: Pick<EngineRun, 'appName' | 'decider'>, person: string | null): string {
  const who = person ?? 'this person'
  if (!plan.decider) return `No policy on ${plan.appName} decides`
  if (plan.decider.isGlobalDefault) return `No other policy decides for ${who}`
  return `First policy that covers ${who}`
}

/* A policy that did not decide, in the others line: its reason in lower
   case, the person's name said "does not cover …". */
function otherWord(p: Pick<EnginePolicy, 'reason'>, person: string | null): string {
  const r = p.reason
  if (!r) return 'not asked'
  if (/ is not in (it|this policy)$/.test(r)) return `does not cover ${person ?? 'this person'}`
  return r.charAt(0).toLowerCase() + r.slice(1)
}

/* The other policies on the application, as ONE line that expands: "1 other:
   Global Default Policy · not reached"; "2 others: 1 switched off, 1 does
   not cover Kavya Menon". Empty when the one that decides is the only one. */
export function othersLine(plan: Pick<EngineRun, 'policies'>, person: string | null): { count: number; text: string } {
  const others = plan.policies.filter((p) => !p.decides)
  if (others.length === 0) return { count: 0, text: '' }
  if (others.length === 1) return { count: 1, text: `1 other: ${others[0].name} · ${otherWord(others[0], person)}` }
  const by = new Map<string, number>()
  for (const p of others) {
    const w = otherWord(p, person)
    by.set(w, (by.get(w) ?? 0) + 1)
  }
  return { count: others.length, text: `${others.length} others: ${[...by.entries()].map(([w, n]) => `${n} ${w}`).join(', ')}` }
}

// --- The facts of a sign-in the rules read ---

/** A fact of the sign-in a rule reads: what a mark on the sentence is keyed by. */
export type FactKey = 'network' | 'place' | 'device' | 'time' | 'risk'

// --- The sentence at the top of the chain (owner, 1 Oct: "merge these two … a full sentence") ---

/** A stated fact of the sentence: its connector, its value as the form says it, and its mark on the run. */
export interface SentenceFact {
  token: TokenId
  value: TokenValue
  /** It failed a check the engine read (✕), or could not be told (–); null otherwise. */
  mark: FactMark | null
}

/** The sign-in as the sentence at the top of the chain says it. */
export interface SentenceView {
  /** "Priya Sharma", "A member of Finance"; null with nobody chosen. */
  who: string | null
  /** A group was chosen in the Person picker: the face is the group's mark. */
  isGroup: boolean
  /** Every group the person is in, in brackets after the name; none when a group was chosen. */
  groups: readonly string[]
  /** A group was chosen: the person tested as its member, in brackets after it. */
  testedAs?: string
  app: { id: string; name: string } | null
  /** The facts stated that the application's rules read, in the sentence's order. */
  facts: readonly SentenceFact[]
}

/** The sentence as plain words: the node's accessible name. */
export function sentenceSay(v: SentenceView): string {
  const who = v.who ?? 'Nobody chosen'
  const groups = v.groups.length > 0 ? ` (${v.groups.join(', ')})` : v.testedAs ? ` (tested as ${v.testedAs})` : ''
  const facts = v.facts.map((f) => ` ${CONNECTOR[f.token]} ${f.value.text}`).join('')
  return `${who}${groups} signs in to ${v.app?.name ?? 'no application'}${facts}`
}

/* Which of the person's facts a token of the sentence states: its mark on
   the run is that fact's (`factMarks`). "From" is the network, or the place
   stated with it. */
const TOKEN_FACT: Partial<Record<TokenId, readonly FactKey[]>> = { from: ['network', 'place'], device: ['device'], when: ['time'], risk: ['risk'] }

/** A token's mark on the run: the first of its facts that failed a check, or could not be told. */
export function tokenMark(token: TokenId, marks: Partial<Record<FactKey, FactMark>>): FactMark | null {
  const keys = TOKEN_FACT[token] ?? []
  return keys.map((k) => marks[k]).find((m) => m === 'fail') ?? keys.map((k) => marks[k]).find((m) => m === 'unknown') ?? null
}

// --- The settled chain, at a glance (owner, 30 Sep: "at the first glance the user should see the OUTCOME") ---

/* Once the run is done the policy folds to its head and the answer is the
   hero:

     ( [DR] Devon Rao (Contractors) signs in to Microsoft Outlook on ✕ Android 12 phone › )
     [✓] Device compliance for Outlook and Dropbox [Decides]                      ⇕
         Rule 1 didn’t match: Device
     [ ⊘ Deny ⓘ · Open policy                  |  What they see ▶ ]

   Each says only what the other two do not: the sentence the sign-in, a ✕
   on a fact that failed a check; the policy why it decided, on
   its own line under the name; the answer the decision, what they are asked
   for (a Deny's message is What they see's) and a conflict, once. */

/** A mark on a fact of the sentence: it failed a check (✕), or could not be told (–). */
export type FactMark = 'fail' | 'unknown'

const FACT_CATEGORY: Record<FactKey, string> = { network: 'network', place: 'place', device: 'device', time: 'time', risk: 'risk' }

/* Which facts failed a check the engine read, or could not be told — none
   that the rule that decided held (a fact that let the sign-in in is not
   marked against it). A failure outranks what could not be told. */
export function factMarks(plan: Pick<EngineRun, 'rules' | 'landing'>): Partial<Record<FactKey, FactMark>> {
  const landing = plan.landing !== null ? plan.rules[plan.landing] : null
  const held = new Set<string>((landing?.checks.slice(0, landing.checked) ?? []).filter((c) => c.status === 'pass').map((c) => c.category))
  const by = new Map<string, FactMark>()
  for (const r of plan.rules) {
    if (!r.visited) continue
    for (const c of r.checks.slice(0, r.checked)) {
      if (c.category === 'who' || held.has(c.category)) continue
      if (c.status === 'fail') by.set(c.category, 'fail')
      else if (c.status === 'unknown' && by.get(c.category) !== 'fail') by.set(c.category, 'unknown')
    }
  }
  const out: Partial<Record<FactKey, FactMark>> = {}
  for (const [key, cat] of Object.entries(FACT_CATEGORY) as [FactKey, string][]) {
    const m = by.get(cat)
    if (m) out[key] = m
  }
  return out
}

/* The policy folded, in one line after its name and "Decides": why it
   decided as it did, short and result first, so a line cut short keeps what
   happened — the rule that matched ("Rule 2 matched: Compliant device,
   working remotely"); where nothing else matched, the rules above it that
   missed and on what ("Rule 1 didn’t match: Device"); what could not be
   told, when it depends. */
export function policyWhy(plan: Pick<EngineRun, 'decider' | 'landing' | 'rules' | 'outcome'>): string {
  if (!plan.decider) return ''
  const view = plan.outcome.view
  if (view.status === 'depends') return view.needs.length > 0 ? `Can’t tell: ${view.needs.join(', ')}` : 'Depends'
  const at = plan.landing !== null ? plan.rules[plan.landing] : null
  if (!at) return ''
  if (at.index !== null) return `Rule ${at.index + 1} matched: ${at.name}`
  const missed = plan.rules.filter((r) => r.index !== null && r.visited && r.state === 'no-match')
  if (missed.length === 0) return 'No rule matched'
  const on = [...new Set(missed.map((r) => (r.failing !== null ? (r.checks[r.failing]?.word ?? '') : '')).filter((w) => w !== ''))]
  const tail = on.length > 0 ? `: ${on.join(', ')}` : ''
  const nums = missed.map((r) => (r.index ?? 0) + 1)
  return `${nums.length === 1 ? `Rule ${nums[0]}` : `Rules ${nums.slice(0, -1).join(', ')} and ${nums.at(-1)}`} didn’t match${tail}`
}

/* How many things would answer this sign-in otherwise — the findings the
   troubleshooting run says in the conflict tone (conflicts.ts): a rule that
   also applies with another answer, a policy after the one that decides, an
   exception, a Deny first. What it says is by design (a group's policy
   before Everyone's) is not one. The answer's conflict line is there exactly
   when this is more than none. */
export function conflictCount(plan: Pick<EngineRun, 'conflicts'>): number {
  return plan.conflicts ? plan.conflicts.findings.filter((f) => f.tone === 'conflict').length : 0
}

// --- Folding the chain (owner, 30 Sep: "make the cards collapsible like we have in the policy builder") ---

/* How the page's dock asks the chain to stand: 'auto' after a run, 'expand'
   (Expand all) or 'collapse' (Collapse all) — each press a new `seq`, so the
   same press twice still applies. */
export type FoldMode = 'auto' | 'expand' | 'collapse'
export interface FoldAsk {
  mode: FoldMode
  seq: number
}
export const AUTO_FOLD: FoldAsk = { mode: 'auto', seq: 0 }

/** A node of the chain, for its fold: the person, the policy, the answer, the why under it, or a rule by its id. */
export type FoldKey = 'policies' | 'policy' | 'outcome' | 'why' | `rule:${string}`

/* Whether a rule's card is open, by itself, once the run is done ('auto'):
   what its result shows — the rule that matched, one being read, one that
   could not be told, the last row when it Depends — and a conflict, which is
   never folded. A rule that did not match, one never reached and one switched
   off are their one line. */
export function ruleOpenAuto(result: TraceResult, conflict: boolean): boolean {
  return conflict || result === 'reading' || result === 'matched' || result === 'missed' || result === 'unknown' || result === 'possible'
}

/* A node's fold: what the admin set by hand since the dock last asked; else
   what the dock asked (Expand all, Collapse all); else, after a run, the
   node's own (`auto`) — the person, the policy and the answer open, the
   rules as `ruleOpenAuto` says. While the engine works the chain is always
   its own: the run is there to be followed. */
export function foldOpen(key: FoldKey, nodes: Readonly<Record<string, boolean>>, mode: FoldMode, auto: boolean, running: boolean): boolean {
  if (running) return auto
  const set = nodes[key]
  if (set !== undefined) return set
  return mode === 'expand' ? true : mode === 'collapse' ? false : auto
}

/* A rule pressed: it opens or folds. Opening one folds every other rule
   open beside it — the builder's accordion, one rule open at a time — but
   never a conflict (drawn whole) and not after Expand all, which asked for
   every rule. */
export function foldRule(
  nodes: Readonly<Record<string, boolean>>,
  key: `rule:${string}`,
  isOpen: (k: `rule:${string}`) => boolean,
  rules: readonly `rule:${string}`[],
  keep: ReadonlySet<string>,
  mode: FoldMode,
): Record<string, boolean> {
  const opening = !isOpen(key)
  const next: Record<string, boolean> = { ...nodes, [key]: opening }
  if (opening && mode !== 'expand') for (const k of rules) if (k !== key && !keep.has(k) && isOpen(k)) next[k] = false
  return next
}

// --- Following the engine down the column ---

/* Where the canvas scrolls so the engine's step stays in view as the chain
   grows (owner, 30 Sep: "the loading is very fast … the user can't trace the
   whole process with their eyes"): nowhere, while it sits in the band the
   canvas shows clear of the engine line; else so it stands a little way down
   that band — `at` of the room left above it — rather than pinned to its
   foot, so the next step appears below it, in view. A target taller than
   most of the band is shown from its top. A step still growing (a rule whose
   rows are arriving) asks for at least `reach` of height. The top to glide
   to, or null. */
export function followTop(view: Pick<View, 'top' | 'height'>, target: Pick<Box, 'y' | 'h'>, inset: Pick<Inset, 'top' | 'bottom'>, reach = 0, at = 0.3): number | null {
  const bandTop = view.top + inset.top
  const band = Math.max(0, view.height - inset.top - inset.bottom)
  const h = Math.max(target.h, reach)
  if (target.y >= bandTop && target.y + h <= bandTop + band) return null
  const lead = h > band * 0.7 ? 0 : Math.round((band - h) * at)
  const top = Math.max(0, Math.round(target.y - inset.top - lead))
  return Math.abs(top - view.top) < 2 ? null : top
}

// --- The decided path's colour (owner, 1 Oct: "here it's a match but Deny, so for the deny I think we should use red only") ---

/* The way the sign-in took wears ONE colour, the outcome's: the policy's
   "Decides", the rule that matched — its frame, its label, its rows that
   held — the spine into the answer, and the answer. Allow on 1 factor green,
   Allow with 2FA yellow, Deny red; yellow while it can't be told; grey when
   nothing decides. Never green and red on one path. Blue is only the engine
   at work; a rule that did not match is quiet, its failing ✕ the one red. */
export type PathTone = 'positive' | 'notice' | 'negative' | 'neutral'

export function pathTone(plan: Pick<EngineRun, 'outcome'>): PathTone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return DECISION_TONE[o.decision]
  return o.status === 'depends' ? 'notice' : 'neutral'
}

// --- Troubleshooting, at a glance (owner, 1 Oct: "how will the user troubleshoot from here, how can they understand things faster") ---

/* What the settled chain says about the findings (conflicts.ts), without
   competing with the answer:

     [✓] Developer tools — office and device checks [Decides] [1 conflict]   the policy's line, counted once
     [ Allow on 1 factor
       ⚠ Maya Iyer is in Engineering and Finance — Engineering's rule applies first · Why? ]
     [ Why: as each group, then every finding, ranked as the model ranks them ]

   The count on the policy's line (the one place a number is said: yellow
   for a conflict, the neutral pill with ⓘ for what is only worth knowing);
   the answer's ONE line, the model's headline; and Why?, which opens the why
   under the answer (WhyCard.tsx). What is quiet (`isQuiet`: a draft that
   would change nothing, a same-answer rule) is neither — the why alone says
   it, opened by a quiet Why? beside Open policy. */

/** A finding's tone, drawn: a conflict yellow, a fact not stated yellow (it can't be told), the rest quiet. */
export type WhyTone = 'conflict' | 'depends' | 'info'

const toneOf = (f: Pick<Finding, 'tone' | 'kind'>): WhyTone => (f.tone === 'conflict' ? 'conflict' : f.kind === 'depends' ? 'depends' : 'info')

/* What is said only inside the why, never on the chain (owner, 1 Oct: "at
   the first glance … which policy, and the outcome; the rest is
   secondary"): a draft or a switched-off policy that would change nothing,
   and a later rule that gives the same answer another way. Nothing is wrong
   with either — they are not counted, and not the answer's line. */
const QUIET: readonly FindingKind[] = ['off-no-change', 'also-matches']
export const isQuiet = (f: Pick<Finding, 'kind'>): boolean => QUIET.includes(f.kind)

/* The policy's count: the conflicts when there are any ("1 conflict", in
   the notice tone), else what is worth knowing ("1 finding", the neutral
   pill with ⓘ); null when there is nothing but the quiet (`isQuiet`). */
export function findingsCount(plan: Pick<EngineRun, 'conflicts'>): { count: number; text: string; conflict: boolean } | null {
  const said = (plan.conflicts?.findings ?? []).filter((f) => !isQuiet(f))
  if (said.length === 0) return null
  const n = said.filter((f) => f.tone === 'conflict').length
  if (n > 0) return { count: n, text: n === 1 ? '1 conflict' : `${n} conflicts`, conflict: true }
  return { count: said.length, text: said.length === 1 ? '1 finding' : `${said.length} findings`, conflict: false }
}

/** The answer's one line: the first finding that is not quiet, in its tone — the model's headline; null when there is none. */
export function heroFinding(plan: Pick<EngineRun, 'conflicts'>): { text: string; tone: WhyTone } | null {
  const c = plan.conflicts
  const top = c?.findings.find((f) => !isQuiet(f))
  if (!c || !top || !top.line) return null
  return { text: top === c.findings[0] ? c.headline : top.line, tone: toneOf(top) }
}

/* What the answer says, beside its word, of a sign-in that expects
   something — a saved sign-in, or a break-in attempt played from its panel:
   'fails' when the answer is not the one expected ("⚠ Expected [Allow with
   2FA]"); 'weaker' when it is, on a second factor the attack beats ("⚠
   Weaker factor", break-in-app.ts `attemptPlay`'s `weaker`) — the answer
   matching is no pass then (review, 1 Oct 2026: a Weaker factor row played
   as a clean "Allow with 2FA"); else nothing. Nothing decided counts as not
   the answer: Depends is no pass either. */
export type ExpectMark = 'fails' | 'weaker' | null

export function expectMark(decided: AccessDecision | null, expected: AccessDecision | null, weaker: string | null = null): ExpectMark {
  if (expected === null) return null
  if (decided !== expected) return 'fails'
  return weaker !== null ? 'weaker' : null
}

/* The why's title: the answer's line; where there is none — only the quiet
   is to be said — the top finding's, which the why alone says. Null with
   nothing at all. */
export function whyTitle(plan: Pick<EngineRun, 'conflicts'>): { text: string; tone: WhyTone } | null {
  const loud = heroFinding(plan)
  if (loud) return loud
  const c = plan.conflicts
  const top = c?.findings[0]
  return c && top && c.headline ? { text: c.headline, tone: toneOf(top) } : null
}

/** A finding's mark in the why: the rule it is about, an exception, another policy, one switched off, a fact not stated, who a policy covers. */
export type WhyIcon = 'rule' | 'exception' | 'policy' | 'off' | 'depends' | 'cover'

/** A finding's one action: the rule or the policy in its builder, or the fact's row in the panel. */
export interface WhyAction {
  kind: 'rule' | 'policy' | 'fact'
  label: string
  policyId: string
  ruleId: string | null
  field: FormField | null
}

export interface WhyItem {
  key: string
  kind: FindingKind
  tone: WhyTone
  icon: WhyIcon
  /** A rule of the policy that decides that also applies, drawn whole with its notice. Null for every other finding. */
  rule: RuleConflict | null
  /** Its one line. */
  head: string
  /** Why, in plain words; '' when the line says it. */
  detail: string
  /** What the admin can do; '' when nothing needs doing. */
  fix: string
  /** The fix loosens access. */
  caution: string
  /** Another policy that covers the person: what it would decide. */
  would: { decision: AccessDecision | null; possible: AccessDecision[] } | null
  /* The policy the line is about, named first in it as a quiet link that
     opens it — another policy that covers the person, when the action is
     the fix in the one that decides. Null otherwise. */
  link: { policyId: string; label: string } | null
  /** No policy covers the person: each one on the application, by name, and who it covers. */
  covers: { policyId: string; name: string; audience: string }[]
  /** A fact not stated: each answer it could lead to, and where from. */
  outcomes: { decision: AccessDecision; where: string }[]
  action: WhyAction | null
}

/** "IT Admins", "Engineering and Finance", "Engineering, Finance and DevOps". */
const listGroups = (ns: readonly string[]) => (ns.length <= 1 ? (ns[0] ?? '') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`)
const RULE_KINDS: readonly FindingKind[] = ['rule-conflict', 'named-later', 'deny-first']
const POLICY_KINDS: readonly FindingKind[] = ['policy-conflict', 'same-group-policy', 'group-policy-first']

/* Every finding, in the model's order (conflicts first), as the why draws
   it — each one line with its mark, its tone and at most one action, in the
   model's own words:

     a rule that also applies   the rule's card, whole, its notice in its foot
                                ("Also applies to Maya Iyer · via Finance",
                                "Not used: <the model's why>", the fix), Open rule
     an exception               "Rule 1 leaves Leo Fernandes out · Contractors is an exception"
     another policy             its name — a quiet link that opens it — "also covers
                                Maya Iyer · via Finance" [what it would decide],
                                "Not used: <why>", the fix, and Open rule: the rule
                                of the policy that DECIDES the fix adds one above
                                (`fixAt`), never the policy that lost
     one switched off, a draft  "HRMS access from corporate offices · Switched off · …"
     a fact not stated          each answer it could lead to, and Add its row
     no policy covers them      their groups once, then each policy by name (a
                                quiet link) and who it covers; no fix — nothing in
                                this build edits who a policy covers */
export function whyItems(plan: Pick<EngineRun, 'conflicts' | 'rules'>): WhyItem[] {
  const c = plan.conflicts
  if (!c) return []
  const person = c.personName
  const fieldOf = (keys: readonly string[]): FormField | null => {
    for (const k of keys) {
      const f = (FIELD_OF_FACT as Record<string, FormField | undefined>)[k]
      if (f) return f
    }
    return null
  }
  return c.findings.map((f, i): WhyItem => {
    const base: WhyItem = {
      key: `${f.kind}:${f.target.policyId}:${f.target.ruleId ?? ''}:${i}`,
      kind: f.kind,
      tone: toneOf(f),
      icon: 'policy',
      rule: null,
      head: f.title,
      detail: f.why,
      fix: f.fix,
      caution: f.caution,
      would: null,
      link: null,
      covers: [],
      outcomes: [],
      action: null,
    }
    const openRule: WhyAction | null = f.target.ruleId ? { kind: 'rule', label: 'Open rule', policyId: f.target.policyId, ruleId: f.target.ruleId, field: null } : null
    const openPolicy: WhyAction = { kind: 'policy', label: 'Open policy', policyId: f.target.policyId, ruleId: null, field: null }
    /* The fix's own place — for a policy that lost, the rule of the one that
       decided it would go above — so the board opens where the fix says. */
    const openFix: WhyAction | null = f.fix && f.fixAt ? (f.fixAt.ruleId ? { kind: 'rule', label: 'Open rule', policyId: f.fixAt.policyId, ruleId: f.fixAt.ruleId, field: null } : { kind: 'policy', label: 'Open policy', policyId: f.fixAt.policyId, ruleId: null, field: null }) : null
    if (RULE_KINDS.includes(f.kind)) {
      const rc = c.conflicts.find((x) => x.ruleId === f.target.ruleId) ?? null
      const drawn = rc !== null && plan.rules.some((r) => r.id === rc.ruleId)
      return drawn ? { ...base, icon: 'rule', rule: rc, action: openRule } : { ...base, icon: 'rule', action: openRule }
    }
    if (f.kind === 'exception') return { ...base, icon: 'exception', action: openRule }
    if (POLICY_KINDS.includes(f.kind)) {
      const p = c.policies.find((x) => x.policyId === f.target.policyId)
      if (!p) return { ...base, action: openFix ?? openPolicy }
      /* Its name opens it; the one action is the fix, where it is made. */
      return {
        ...base,
        head: `also covers ${person}${p.via.say ? ` · ${p.via.say}` : ''}`,
        link: { policyId: p.policyId, label: p.policyName },
        detail: `Not used: ${p.why}`,
        would: { decision: p.status === 'decided' ? p.decision : null, possible: p.possible },
        action: openFix,
      }
    }
    if (f.kind === 'off-would-change' || f.kind === 'off-no-change') return { ...base, icon: 'off', action: openPolicy }
    if (f.kind === 'depends') {
      const d = c.depends
      const field = d ? fieldOf(d.facts) : null
      const word = d?.factWords[0] ?? ''
      return {
        ...base,
        icon: 'depends',
        detail: '',
        fix: '',
        outcomes: (d?.outcomes ?? []).map((o) => ({ decision: o.decision, where: o.ruleNumber !== null ? `Rule ${o.ruleNumber}` : o.ruleName })),
        action: field && word ? { kind: 'fact', label: `Add ${word === 'IP address' ? word : word.toLowerCase()}`, policyId: f.target.policyId, ruleId: null, field } : null,
      }
    }
    if (f.kind === 'not-covered') {
      /* Their groups once, then each policy by name — a quiet link — and who it covers. */
      const covers = c.missedBy.map((m) => ({ policyId: m.policyId, name: m.policyName, audience: m.audience }))
      return covers.length > 0
        ? { ...base, icon: 'cover', detail: `${person} is in ${c.groups.length > 0 ? listGroups(c.groups.map((g) => g.name)) : 'no group'}`, covers, action: null }
        : { ...base, icon: 'cover', action: null }
    }
    /* A later rule with the same answer, reached another way. */
    return { ...base, icon: 'rule', action: openRule }
  })
}

/** One row of "As each group": a group alone, or the person. */
export interface GroupRowView {
  key: string
  /** The group a press re-runs as ("Anyone in Finance"); null on the person's own row. */
  groupId: string | null
  /** "As Engineering", "As Maya (both)". */
  label: string
  status: AsGroupRow['status']
  decision: AccessDecision | null
  possible: AccessDecision[]
  /** "Allow on 1 factor", "Can't tell (…)". */
  words: string
  /** Where the answer comes from — "Rule 3 · Finance, on a compliant device", "AWS billing for Finance · rule 1" — or, on the person's row, why theirs is the one it is. */
  source: string
  /** The person's own row: the answer on screen. */
  current: boolean
}

const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/* "As each group" (conflicts.ts `asEachGroup`): a row for each of the
   person's groups alone, then the person — each answer as a decision, where
   it comes from, and on the person's own row (the answer on screen) why it is
   the one it is ("Engineering's rule comes first"). One policy for every row,
   the rule is enough; else the policy too. Null for somebody in one group. */
export function eachGroupRows(plan: Pick<EngineRun, 'asEachGroup'>): GroupRowView[] | null {
  const g = plan.asEachGroup
  if (!g || g.rows.filter((r) => r.kind === 'group').length < 2) return null
  const one = new Set(g.rows.map((r) => r.policyId)).size === 1
  const where = (r: AsGroupRow) => {
    if (!r.policyName) return 'No policy decides'
    /* Can't be told: no rule is where it comes from — only the policy, when the rows are not all one. */
    if (r.status !== 'decided') return one ? '' : r.policyName
    const rule = r.ruleNumber !== null ? `Rule ${r.ruleNumber}` : r.ruleName
    if (one) return r.ruleNumber !== null && r.ruleName ? `${rule} · ${r.ruleName}` : rule
    return `${r.policyName} · ${r.ruleNumber !== null ? `rule ${r.ruleNumber}` : r.ruleName}`
  }
  return g.rows.map((r) => ({
    key: r.key,
    groupId: r.kind === 'group' ? (r.groups[0]?.id ?? null) : null,
    label: r.label,
    status: r.status,
    decision: r.decision,
    possible: r.possible,
    words: r.words,
    source: r.kind === 'person' && g.why ? capital(g.why) : where(r),
    current: r.kind === 'person',
  }))
}
