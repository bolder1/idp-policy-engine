import { FALLBACK_NAME, type AccessDecision, type Policy, type PolicyStatus } from '../../data'
import { DECISION_PHRASE, decisionsOr, factWords } from '../../decision-words'
import { incompleteLine, type DecisionView } from '../board/try-sign-in'
import { personOf, type SignInFacts, type SimEnv } from '../simulate'
import type { StandingKind, TenantResolution } from '../tenant-resolver'
import { LAST_ROW, evidenceOf, type CardState } from '../testing/evidence'
import { cardTone, cardWord, checkPills, nameLookupOf, outcomeOf, type CardTone, type CheckPill, type NameLookup } from '../testing/trace-pills'
import { whichPolicyRows, type WhichRowKind } from '../testing/which-policy'
import { differingWatch } from '../watching-words'

/* -----------------------------------------------------------------------------
   Try a sign-in on the Sign-in tests page: the journey, as a model
   (TESTING-V4 §3.1).

   The board draws one policy's chain top to bottom, because on the board the
   policy is given and the question is which of its rules. The tenant's page
   asks the question before that one — of every policy, which decides — so
   its journey runs left to right, a column per question:

     Sign-in  →  Which policy  →  Rules  →  Outcome  →  What they see

   and the route a sign-in takes is one line through them: from the person,
   to the policy that governs them on this application, down that policy's
   rules to the first that matches, and out to the answer.

   Nothing here decides anything. Every column is read off the resolver
   (`resolveSignIn`): which policy from its standings (`whichPolicyRows`),
   the rules from its trace (`evidenceOf`, then `checkPills` — the very
   words a card on the board says), the answer from its status. The board and
   this page can never say two things about one sign-in.

   The second half of the file is the canvas's geometry, also pure: where the
   columns sit so the route runs straight (`alignPads`), the connectors
   between measured boxes (`journeyWires`), and the marker's timeline along
   the route (`travelPlan`). The component measures and draws; these decide.
   -------------------------------------------------------------------------- */

// --- Nodes ------------------------------------------------------------------------

/* Every box the canvas measures, by id. A rule card is `rule:{rule id}`, and
   the last row is `rule:fallback` (evidence.ts files it under `LAST_ROW`). */
export type NodeId = 'sign-in' | 'outcome' | 'see' | `policy:${string}` | `rule:${string}`

export const policyNode = (policyId: string): NodeId => `policy:${policyId}`
export const ruleNode = (ruleId: string): NodeId => `rule:${ruleId}`
export const LAST_ROW_NODE: NodeId = ruleNode(LAST_ROW)

// --- The model ----------------------------------------------------------------------

export interface JourneySignIn {
  person: { id: string; name: string; group: string } | null
  app: { id: string; name: string } | null
  /** No person or no application: the journey is its first node and nothing else. */
  empty: boolean
}

/* One policy that could govern this application, as its row in the Which
   policy column says it. `reason` is the few words under the name; `tip` is
   the resolver's own sentence, one hover away. */
export interface JourneyWhich {
  policyId: string
  node: NodeId
  name: string
  status: PolicyStatus
  kind: WhichRowKind
  /** "Not in this policy", "Checked after Developer tools", "Switched off"; '' on the row that decides. */
  reason: string
  /** The resolver's reason, verbatim. */
  tip: string
  decides: boolean
  isGlobalDefault: boolean
}

export interface JourneyRule {
  /** The rule's id, or `LAST_ROW` for the last row. */
  id: string
  node: NodeId
  /** 0-based position in the policy; null for the last row, which has no number. */
  index: number | null
  name: string
  state: CardState
  tone: CardTone
  /** One per evidence line; none on a card nothing was asked of. */
  pills: CheckPill[]
  /** The rule's THEN — what it decides when it matches. */
  outcome: AccessDecision
  /** "No match", "Not reached", "Switched off", "Can't tell"; null on the card that matched. */
  word: string | null
}

export interface JourneyOutcome {
  status: TenantResolution['status']
  decision: AccessDecision | null
  /** Every decision it could reach, in rule order, when it cannot be told. */
  possible: AccessDecision[]
  policyId: string | null
  policyName: string | null
  /** "Rule 2 · In the office", "Nothing else matched", or '' while it cannot be told. */
  ruleLine: string
  /** The sentence's one line: "Decided by {policy} · Rule 2 · {rule}", or what is missing. */
  why: string
  /** The board's outcome node takes this shape (TracePills.tsx `OutcomeNode`). */
  view: DecisionView
}

export interface Journey {
  signIn: JourneySignIn
  /** The policies on this application and the Global Default, Global Default last. */
  which: JourneyWhich[]
  /** The policy that decides, whose rules the Rules column draws. */
  policy: { id: string; name: string; isGlobalDefault: boolean } | null
  rules: JourneyRule[]
  lastRow: JourneyRule | null
  outcome: JourneyOutcome
  /* The nodes the marker visits, in order: the sign-in, the deciding policy,
     each rule it asked on the way down, the one it stopped at, the outcome
     and what they see. A switched-off rule is passed on the spine, never
     visited — nothing about it was asked. */
  path: NodeId[]
  /** Where the route stops in the Rules column, or null when no policy decides. */
  landing: NodeId | null
  /** It stopped there unsure: the facts given do not say which way — a hollow ring, not a dot. */
  landingUnknown: boolean
}

// --- Which policy, in a few words -------------------------------------------------------

/* The row's words. The resolver's reasons are sentences written for a list
   with room ("Same app and group as Developer tools — office and device
   checks; the earlier policy in the list applies"); a row in a 240 px column
   says the gist, and the sentence is its tooltip. */
function whichReason(kind: WhichRowKind, standing: StandingKind | undefined, decider: string | null, watched: { decision: AccessDecision | null; possible: { decision: AccessDecision }[] } | null): string {
  switch (kind) {
    case 'decides':
      return ''
    case 'watching':
      if (!watched) return 'Only watching'
      return watched.decision ? `Would ${DECISION_PHRASE[watched.decision]}` : `Would ${decisionsOr(watched.possible.map((o) => o.decision)).toLowerCase()}`
    case 'waiting':
      return standing === 'draft' ? 'Not turned on yet' : 'Switched off'
    default:
      if (standing === 'not-in-audience') return 'Not in this policy'
      return decider ? `Checked after ${decider}` : 'Another policy applies'
  }
}

// --- The journey --------------------------------------------------------------------------

const NOTHING: DecisionView = { status: 'incomplete', decision: null, line: '', outcomes: [], needs: [], watching: [] }

/* The lookup a pill names zones, profiles, groups and people by. The store's
   (`useNameLookup`) when the caller has one — it also knows hooks — else one
   built from the env's own library, else the env's name functions. */
function namesOf(env: SimEnv): NameLookup {
  const lib = env.library
  if (lib) return nameLookupOf({ zones: lib.zones, fingerprints: lib.fingerprints, groups: lib.groups, users: lib.people })
  return (kind, id) => {
    if (kind === 'zone') return env.zoneName(id)
    if (kind === 'fingerprint') return env.fingerprintName(id)
    if (kind === 'group') return env.groupName(id)
    if (kind === 'user') return env.userName?.(id)
    return undefined
  }
}

export function journeyOf(
  res: TenantResolution,
  policies: readonly Policy[],
  appId: string | null,
  env: SimEnv,
  facts: SignInFacts,
  opts: { names?: NameLookup } = {},
): Journey {
  const names = opts.names ?? namesOf(env)
  const person = personOf(facts.personId, env)
  const missing = res.missing as readonly string[]
  const empty = missing.includes('person') || missing.includes('app')
  const signIn: JourneySignIn = {
    person: person ? { id: person.id, name: person.name, group: person.groupName } : null,
    app: appId ? { id: appId, name: env.appName?.(appId) ?? appId } : null,
    empty,
  }

  const decider = res.decidedBy ? (policies.find((p) => p.id === res.decidedBy?.policyId) ?? null) : null
  const byId = new Map(policies.map((p) => [p.id, p]))
  const standing = new Map(res.standings.map((s) => [s.policyId, s.kind]))

  /* The application's policies, and the Global Default last: it is only ever
     the answer when nothing above it is, and a column that read top to bottom
     in list order would put the fallback wherever the list happens to. */
  const which: JourneyWhich[] = empty
    ? []
    : whichPolicyRows(res, policies, appId)
        .on.map((row): JourneyWhich => {
          const p = byId.get(row.policyId)
          return {
            policyId: row.policyId,
            node: policyNode(row.policyId),
            name: row.name,
            status: p?.status ?? 'inactive',
            kind: row.kind,
            reason: whichReason(row.kind, standing.get(row.policyId), decider?.name ?? null, row.watched),
            tip: row.reason,
            decides: row.kind === 'decides',
            isGlobalDefault: p?.isSystem === true,
          }
        })
        .sort((a, b) => Number(a.isGlobalDefault) - Number(b.isGlobalDefault))

  // --- The deciding policy's rules ---

  const trace = decider ? res.trace : null
  const cards = decider ? evidenceOf(decider, trace, facts, env) : {}
  const rules: JourneyRule[] = decider
    ? decider.rules.map((r, i) => {
        const ev = cards[r.id]
        return { id: r.id, node: ruleNode(r.id), index: i, name: r.name, state: ev.state, tone: cardTone(ev.state), pills: checkPills(r, ev, names), outcome: r.decision, word: cardWord(ev.state) }
      })
    : []
  const lastEv = cards[LAST_ROW]
  const lastRow: JourneyRule | null =
    decider && lastEv
      ? { id: LAST_ROW, node: LAST_ROW_NODE, index: null, name: FALLBACK_NAME, state: lastEv.state, tone: cardTone(lastEv.state), pills: checkPills(null, lastEv, names), outcome: outcomeOf(null, decider), word: cardWord(lastEv.state) }
      : null

  /* Where it stops. Settled: the rule the walk matched, or the last row.
     Depends: the first rule that might match — the route stops there unsure,
     which the board's marker says with a hollow ring. */
  let landing: JourneyRule | null = null
  let landingUnknown = false
  if (decider && trace && res.status !== 'incomplete') {
    if (res.status === 'depends') {
      landing = rules.find((r) => r.state === 'unknown') ?? lastRow
      landingUnknown = true
    } else {
      landing = trace.hitIndex === null ? lastRow : (rules[trace.hitIndex] ?? lastRow)
    }
  }

  /* The route: every rule that was asked on the way down to the landing, in
     order, and the landing itself. */
  const all = lastRow ? [...rules, lastRow] : rules
  const stop = landing ? all.indexOf(landing) : -1
  const visited = stop < 0 ? [] : all.slice(0, stop + 1).filter((r) => r === landing || (r.state !== 'off' && r.state !== 'not-reached'))
  const path: NodeId[] = ['sign-in']
  if (decider && landing) path.push(policyNode(decider.id), ...visited.map((r) => r.node), 'outcome', 'see')

  // --- The answer ---

  const hit = trace?.hitIndex ?? null
  const hitRule = decider && hit !== null ? decider.rules[hit] : undefined
  const ruleLine = res.status === 'decided' ? (hitRule && hit !== null ? `Rule ${hit + 1} · ${hitRule.name}` : FALLBACK_NAME) : ''
  const needs = factWords((res.trace?.unknowns ?? []).flatMap((u) => u.missing))
  const policyName = res.decidedBy?.policyName ?? null

  let view: DecisionView = NOTHING
  let why = ''
  if (res.status === 'incomplete') {
    const line = incompleteLine(res)
    view = { ...NOTHING, line }
    why = line
  } else if (res.status === 'decided') {
    view = { status: 'decided', decision: res.decision, line: `${policyName} · ${ruleLine}`, outcomes: [], needs: [], watching: differingWatch(res) }
    why = `Decided by ${policyName} · ${ruleLine}`
  } else {
    /* The rules column numbers the deciding policy's rules, so the outcomes
       can name them by number, as the board's do; the last is always the walk
       past every undecided rule — "If not". */
    const outcomes = res.possible.map((o, i, list) => ({
      label: (i === list.length - 1 && list.length > 1) || o.ruleIndex === null ? 'If not' : `If rule ${o.ruleIndex + 1} matches`,
      decision: o.decision,
    }))
    view = { status: 'depends', decision: null, line: policyName ?? '', outcomes, needs, watching: differingWatch(res) }
    why = needs.length > 0 ? `Decided by ${policyName} · Needs: ${needs.join(', ')}` : `Decided by ${policyName}`
  }

  return {
    signIn,
    which,
    policy: decider ? { id: decider.id, name: decider.name, isGlobalDefault: decider.isSystem === true } : null,
    rules,
    lastRow,
    outcome: {
      status: res.status,
      decision: res.decision,
      possible: res.possible.map((o) => o.decision),
      policyId: res.decidedBy?.policyId ?? null,
      policyName,
      ruleLine,
      why,
      view,
    },
    path,
    landing: landing?.node ?? null,
    landingUnknown,
  }
}

/* -----------------------------------------------------------------------------
   The canvas's geometry.

   Boxes are measured against the stage (the positioned element the SVG and
   the marker share), in px, ignoring transforms — the columns rise in with
   motion's `y`, and a connector that followed that would wobble.
   -------------------------------------------------------------------------- */

export interface Box {
  x: number
  y: number
  w: number
  h: number
  /* Where a connector meets it, down from its top: a rule card's title line,
     the sign-in's person, the outcome's answer. A tall card — nine device
     checks — is met at its name, not half way down its pills. Absent, the
     middle. */
  port?: number
}

export type Boxes = Partial<Record<NodeId, Box>>

const portY = (b: Box) => b.y + (b.port ?? b.h / 2)
const right = (b: Box) => b.x + b.w

// --- Alignment ------------------------------------------------------------------------

/** The top padding of each column's body, which the canvas sets so the route runs straight. */
export type ColumnId = 'sign-in' | 'which' | 'rules' | 'outcome' | 'see'
export type Pads = Record<ColumnId, number>

export const NO_PADS: Pads = { 'sign-in': 0, which: 0, rules: 0, outcome: 0, see: 0 }

/* The route is straightest when every node it enters sits level with the one
   it came from: the sign-in level with the policy that decides, that
   policy's first rule level with it too (the spine then only ever runs DOWN
   the rules), the outcome level with the rule it stopped at, and What they
   see — when it has a column of its own — level with the outcome.

   Columns can only be pushed down, never pulled up past their heading, so a
   target above a column's natural place leaves it where it is and the
   connector takes an elbow instead. One pass moves each column by what it is
   off by now; a column whose target moves in that pass (the outcome follows
   the rules) settles on the next. The caller measures again until nothing
   moves. */
export function alignPads(boxes: Boxes, pads: Pads, j: Pick<Journey, 'path' | 'landing' | 'rules' | 'lastRow'>, seeBeside: boolean): Pads {
  const policy = j.path.find((n) => n.startsWith('policy:'))
  const row = policy ? boxes[policy] : undefined
  if (!row) return NO_PADS
  const next: Pads = { ...pads }
  const toward = (col: ColumnId, box: Box | undefined, anchorY: number | undefined, target: number | undefined) => {
    if (!box || anchorY === undefined || target === undefined) {
      next[col] = 0
      return
    }
    next[col] = Math.max(0, Math.round(pads[col] + target - anchorY))
  }
  const signIn = boxes['sign-in']
  toward('sign-in', signIn, signIn && portY(signIn), portY(row))
  const first = [...j.rules, ...(j.lastRow ? [j.lastRow] : [])].map((r) => boxes[r.node]).find((b) => b !== undefined)
  toward('rules', first, first && portY(first), portY(row))
  const land = j.landing ? boxes[j.landing] : undefined
  const outcome = boxes.outcome
  toward('outcome', outcome, outcome && portY(outcome), land && portY(land))
  const see = boxes.see
  toward('see', seeBeside ? see : undefined, see && portY(see), outcome && portY(outcome))
  next.which = 0
  return next
}

export const padsEqual = (a: Pads, b: Pads): boolean => (Object.keys(a) as ColumnId[]).every((k) => Math.abs(a[k] - b[k]) < 1)

// --- Connectors -------------------------------------------------------------------------

export interface Point {
  x: number
  y: number
}

/** A quadratic corner of radius r, as drawn: a quarter circle is 1.571 r; this curve is 1.623 r. */
const CORNER = 1.6232

/* An orthogonal line through `points` with its corners rounded, as an SVG
   path, and how far along it each point is. A corner's radius is at most half
   of either leg, so two corners close together never overlap. Points on a
   straight run (a stop the route passes) are kept as stops and drawn
   straight through. */
export function roundedPath(points: readonly Point[], radius = 12): { d: string; at: number[]; length: number } {
  const pts = points.filter((p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) > 0.01 || Math.abs(p.y - points[i - 1].y) > 0.01)
  const at: number[] = []
  if (pts.length === 0) return { d: '', at: points.map(() => 0), length: 0 }
  const f = (n: number) => String(Math.round(n * 100) / 100)
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  let length = 0
  const cum: number[] = [0]
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
      /* The point itself is half way round the corner. */
      cum.push(length + straight + (CORNER * r) / 2)
      length += straight + CORNER * r
    } else {
      d += ` L${f(b.x)} ${f(b.y)}`
      length += straight
      cum.push(length)
    }
  }
  /* Back onto the caller's points, repeated ones included. */
  let k = 0
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && (Math.abs(points[i].x - points[i - 1].x) > 0.01 || Math.abs(points[i].y - points[i - 1].y) > 0.01)) k++
    at.push(cum[k] ?? length)
  }
  return { d, at, length }
}

/** How far short of the outcome's edge the marker comes to rest: its radius and a hair. */
export const REST_GAP = 9

export interface Wire {
  id: string
  d: string
  /** On the route the sign-in took: drawn in the accent. */
  lit: boolean
}

export interface Route {
  d: string
  length: number
  /** Each node the marker visits and how far along the route it arrives. */
  stops: { node: NodeId; at: number }[]
}

export interface Wires {
  wires: Wire[]
  /** The line the marker travels, or null when no policy decides. */
  route: Route | null
}

/* The connectors between the measured boxes.

     fan      the sign-in to every policy on the application; the deciding
              one lit
     trunk    the deciding policy out to the spine, and the spine down the
              rules to the last row
     stubs    the spine into each rule card; the one it stopped at lit
     out      the card it stopped at to the outcome
     see      the outcome to What they see, when that has a column of its own

   Every elbow turns half way across the gutter between two columns, so the
   lines of one fan share a vertical and read as one branching line. */
export function journeyWires(boxes: Boxes, j: Pick<Journey, 'which' | 'rules' | 'lastRow' | 'path' | 'landing'>, seeBeside: boolean): Wires {
  const wires: Wire[] = []
  const signIn = boxes['sign-in']
  const rows = j.which.map((w) => ({ w, box: boxes[w.node] })).filter((r): r is { w: JourneyWhich; box: Box } => r.box !== undefined)
  if (!signIn) return { wires, route: null }

  const whichLeft = rows.length > 0 ? Math.min(...rows.map((r) => r.box.x)) : null
  const xFan = whichLeft === null ? 0 : (right(signIn) + whichLeft) / 2
  for (const { w, box } of rows) {
    const p = roundedPath([
      { x: right(signIn), y: portY(signIn) },
      { x: xFan, y: portY(signIn) },
      { x: xFan, y: portY(box) },
      { x: box.x, y: portY(box) },
    ])
    wires.push({ id: `fan:${w.policyId}`, d: p.d, lit: w.decides })
  }

  const decider = rows.find((r) => r.w.decides)?.box
  const cards = [...j.rules, ...(j.lastRow ? [j.lastRow] : [])].map((r) => ({ r, box: boxes[r.node] })).filter((c): c is { r: JourneyRule; box: Box } => c.box !== undefined)
  const outcome = boxes.outcome
  if (!decider || cards.length === 0) return { wires, route: null }

  const whichRight = Math.max(...rows.map((r) => right(r.box)))
  const rulesLeft = Math.min(...cards.map((c) => c.box.x))
  const spine = (whichRight + rulesLeft) / 2
  const top = Math.min(portY(decider), portY(cards[0].box))
  const bottom = portY(cards[cards.length - 1].box)
  wires.push({
    id: 'trunk',
    d: roundedPath([
      { x: right(decider), y: portY(decider) },
      { x: spine, y: portY(decider) },
      ...(top < portY(decider) ? [{ x: spine, y: top }] : []),
      { x: spine, y: Math.max(bottom, portY(decider)) },
    ]).d,
    lit: false,
  })
  for (const { r, box } of cards) {
    wires.push({ id: `stub:${r.id}`, d: `M${spine} ${portY(box)} L${box.x} ${portY(box)}`, lit: r.node === j.landing })
  }

  const land = cards.find((c) => c.r.node === j.landing)?.box
  const rulesRight = Math.max(...cards.map((c) => right(c.box)))
  const xOut = outcome ? (rulesRight + outcome.x) / 2 : 0
  if (land && outcome) {
    wires.push({
      id: 'out',
      d: roundedPath([
        { x: right(land), y: portY(land) },
        { x: xOut, y: portY(land) },
        { x: xOut, y: portY(outcome) },
        { x: outcome.x, y: portY(outcome) },
      ]).d,
      lit: true,
    })
  }
  const see = boxes.see
  if (seeBeside && see && outcome && see.x > right(outcome)) {
    const xSee = (right(outcome) + see.x) / 2
    wires.push({
      id: 'see',
      d: roundedPath([
        { x: right(outcome), y: portY(outcome) },
        { x: xSee, y: portY(outcome) },
        { x: xSee, y: portY(see) },
        { x: see.x, y: portY(see) },
      ]).d,
      lit: true,
    })
  }

  if (!land || !outcome) return { wires, route: null }

  /* The route, as one line: the marker rides it and the lit stroke draws
     along it, so the two can never part. It passes THROUGH the policy row
     and the rule card it stops at — under them, since the cards are drawn
     over the lines — and stops at the outcome's edge. */
  const policyStop = j.path.find((n) => n.startsWith('policy:'))!
  const visited = cards.filter((c) => j.path.includes(c.r.node))
  const points: Point[] = [
    { x: right(signIn), y: portY(signIn) },
    { x: xFan, y: portY(signIn) },
    { x: xFan, y: portY(decider) },
    { x: decider.x, y: portY(decider) },
    { x: right(decider), y: portY(decider) },
    { x: spine, y: portY(decider) },
  ]
  const stopAt: { node: NodeId; index: number }[] = [
    { node: 'sign-in', index: 0 },
    { node: policyStop, index: 3 },
  ]
  let y = portY(decider)
  for (const { r, box } of visited) {
    const cy = portY(box)
    if (r.node === j.landing) {
      points.push({ x: spine, y: cy }, { x: box.x, y: cy })
      stopAt.push({ node: r.node, index: points.length - 1 })
      points.push({ x: right(box), y: cy })
    } else if (cy >= y) {
      /* Passed on the spine: the marker is level with the card, and moves on. */
      points.push({ x: spine, y: cy })
      stopAt.push({ node: r.node, index: points.length - 1 })
      y = cy
    }
  }
  /* It rests just outside the outcome, whole, rather than half under its edge. */
  points.push({ x: xOut, y: portY(land) }, { x: xOut, y: portY(outcome) }, { x: outcome.x - REST_GAP, y: portY(outcome) })
  stopAt.push({ node: 'outcome', index: points.length - 1 })
  const p = roundedPath(points)
  return { wires, route: { d: p.d, length: p.length, stops: stopAt.map((s) => ({ node: s.node, at: p.at[s.index] })) } }
}

// --- The marker's timeline ----------------------------------------------------------------

/** The route's travel, not counting the pauses: with them, about 1.4 s (spec §3.1). */
export const TRAVEL_MS = 1150
/** A breath where the route decides something: at the policy that governs, and at the rule it stops at. */
export const DWELL_MS = 120
/* The least a hop takes. The sign-in sits level with the policy that decides
   and a few px from it; at an even pace that hop is over before the column
   has risen, and the first thing the route explains goes by unseen. */
export const MIN_HOP_MS = 140

export interface TravelPlan {
  /** Keyframes for the marker's `offsetDistance` and the lit stroke's `pathLength`, as 0–1 fractions of the route. */
  frames: number[]
  /** When each frame is reached, 0–1 of the whole. */
  times: number[]
  /** The whole run, ms. */
  total: number
  /** When the marker reaches each node, ms. What they see follows the outcome. */
  arrive: { node: NodeId; ms: number }[]
}

/* The marker's run along the route: every hop takes at least `MIN_HOP_MS`,
   and the rest of the budget is shared by length, so a longer leg takes
   longer; it pauses a breath at the policy that decides and at the rule it
   stops at, where the chain's decisions are made. What they see arrives just
   after the outcome. */
export function travelPlan(route: Route, landing: NodeId | null, travelMs = TRAVEL_MS, dwellMs = DWELL_MS): TravelPlan {
  const len = route.length > 0 ? route.length : 1
  const frames: number[] = []
  const ms: number[] = []
  const arrive: { node: NodeId; ms: number }[] = []
  const tail = route.stops.length > 0 && route.stops[route.stops.length - 1].at < len ? 1 : 0
  const hops = Math.max(0, route.stops.length - 1) + tail
  const hop = Math.min(MIN_HOP_MS, travelMs / Math.max(1, hops))
  const share = travelMs - hops * hop
  const leg = (from: number, to: number) => (from === to && hops > 0 ? 0 : hop + ((to - from) / len) * share)
  let t = 0
  let last = 0
  for (const [i, s] of route.stops.entries()) {
    if (i > 0) t += leg(last, s.at)
    last = s.at
    const frac = Math.min(1, Math.max(0, s.at / len))
    frames.push(frac)
    ms.push(t)
    arrive.push({ node: s.node, ms: Math.round(t) })
    if (s.node.startsWith('policy:') || s.node === landing) {
      t += dwellMs
      frames.push(frac)
      ms.push(t)
    }
  }
  if (frames.length === 0 || frames[frames.length - 1] < 1) {
    t += leg(last, len)
    frames.push(1)
    ms.push(t)
  }
  const total = Math.max(1, Math.round(t))
  arrive.push({ node: 'see', ms: total + 80 })
  return { frames, times: ms.map((m) => Math.min(1, m / total)), total, arrive }
}

/** The node the marker has most recently reached at `ms` into the run, as an index into `plan.arrive`; -1 before the first. */
export function reachedAt(plan: Pick<TravelPlan, 'arrive'>, ms: number): number {
  let at = -1
  plan.arrive.forEach((a, i) => {
    if (a.ms <= ms) at = i
  })
  return at
}
