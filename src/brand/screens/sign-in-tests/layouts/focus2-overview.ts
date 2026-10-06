import { CANT_TELL, DECISION_WORDS, decisionsOr } from '../../../decision-words'
import type { EngineRun } from '../engine-run'
import type { Target } from './assistant/intents'
import { policyRows, ruleHead, type HeadMeta, type MetaMark } from './classic2-model'
import type { Moment } from './focus-model'
import { checksRuleOf } from './focus2-faq'
import type { Focus2Place } from './focus2-geometry'

/* -----------------------------------------------------------------------------
   FOCUS'S HORIZONTAL VIEW: THE RUN AS A ROUTE (owner, 5 Oct 2026: "try a type
   of view, the overview, in an animated way … all the cards should animatedly
   organise, and vice versa"; then, for the build he presents: "revamp the
   horizontal as discussed; and in the rule part you show the matched rule on
   top — do rules in their hierarchy (order), but whatever matched should show",
   and "redo the Overview cards like that [Classic v2's] — the same experience
   from both").

   One bold line, left to right, through four STATIONS — the sign-in, the
   policy that applies, the rule that decided, the outcome — and each station is
   a COLUMN of its items in the order the engine asks them, the line passing
   through the one it selected:

                 Rule 1 · Contractors away…          ← read, failed: ✕ Who (red branch)
                 │
     [Sign-in]━━━[AWS for engineering teams]━━━[Rule 2 · Engineers on a…]━━━[Allow on 1 factor]
                 │ AWS billing for Finance       │ Rule 3 · Not reached
                 │ Allow with 2FA · not used      └ Nothing else matched · Not reached
                 │ AWS production for DevOps
                 └ Global Default Policy

   STATIONS are Classic v2's own cards (classic2-chain.tsx `Classic2Card`), their
   heads by default and their bodies opened in place by their fold — the same
   cards as the Vertical view, so the two views read as one product. The rule
   station is the match, the catch-all, or on a Depends the first rule that
   can't tell (focus2-faq.ts `checksRuleOf`, the rule every other part of Focus
   points at).

   THE OTHER ITEMS hang from the line on thin branches, ABOVE the station where
   the engine read them before it (a policy that did not cover them, a rule that
   did not match — red, with its ✕ and the check that failed) and BELOW it where
   it never got to them (not reached; the policy that also covers them, amber,
   with what it would have given). They are slim rows. A rule the engine read is
   a CARD of the story (focus2-story.ts `cardsOf`), so its row is that card's own
   slot, drawn as a row — the morph to the cards one at a time carries it.

   THIS FILE IS THE SECOND PLACEMENT. Focus2Layout draws every card of the story
   in a motion slot sprung to a place; `focus2Places` (focus2-geometry.ts) is the
   carousel's and `overviewPlaces` is this one, in the same `Focus2Place` shape,
   so opening the carousel from the route swaps which feeds the slots and Motion
   springs every card from where it stands to where it goes. Pure: the plan, the
   cards, the presented step, the room and what the stations measured in; the
   places out. The heights it is handed are measured off the cards (a head's
   words, an opened body), so a body opened in place moves the rows under it; it
   plans with ROUTE_HEAD_H until they have been.
   -------------------------------------------------------------------------- */

/** A station's drawn width, by the room: four fit across 1440 and 1280 with the questions panel open, at zoom 1 (the
    head lays its title and meta line under the tile at this width, focus2-overview.css). */
export const STATION_MIN = 176
export const STATION_MAX = 300
/** Narrower than this (1280 with the questions panel open), the rule station's "Open in its policy" gives its room to
    the step, "Rule 2 of 3": the card at the centre of the carousel, and the Vertical view, still carry it. */
export const STATION_OPENS = 200
/** Between two stations, where the line is seen. */
export const STATION_GAP = 40
/** The least room kept round the map, inside the band. */
export const MAP_EDGE = 16
/** A station's head before it has been measured (a static paint): the step, two lines of what was selected, two of its
    meta line. */
export const ROUTE_HEAD_H = 112
/** The card's own border, over and under its head. */
export const CARD_EDGE = 2
/** From a station's edge to the nearest row, above or below it. */
export const SIDING_DROP = 20
/** A slim row, and the room between two. */
export const ROW_H = 44
export const SIDING_GAP = 8
/** The branch runs this far in from the station's left edge; a row starts this far right of it. */
export const TRUNK_IN = 18
export const ELBOW = 14
/** The elbow's radius, where a branch turns from the trunk to its row. */
export const ELBOW_R = 8
/** At most this many rows a side of a station; past them, one row folds the rest ("+2 more"). The story's own cards and
    a policy that also covers the person are never folded. */
export const MAX_SIDE = 3

/* THE MORPH'S TIMING, shared by the view (Focus2Layout's slots) and the route's marks (focus2-route.tsx), so the line
   is drawn off when the cards actually arrive rather than off a guess (5 Oct 2026: the line used to start at 0.24 s,
   before the last card had left the carousel). Out to the route the cards leave together after the press's own frame,
   ~40 ms apart from the presented one outwards; back, they wait while the rows fade and the line un-draws. */
export const MORPH_LEAD = 0.1
export const MORPH_STAGGER = 0.04
export const MORPH_HOLD = 0.25
/** How far into its move a card is about 70 % of the way there, on the view's one spring (stiffness 190, damping 26). */
export const SPRING_70 = 0.17
/** When the line starts drawing on the way to the route: once the last of `cards` to leave is ~70 % there. */
export const lineAt = (cards: number): number => MORPH_LEAD + Math.max(0, cards - 1) * MORPH_STAGGER + SPRING_70

// --- The route: the stations, and each column's items in the engine's order -------------------

export type StationKind = 'sign' | 'policies' | 'rule' | 'outcome'

/** How a row's branch is drawn: amber dashed (also covers, not used), red (read and failed), amber (can't tell), or
    faint (not reached, passed over, switched off). */
export type SidingTone = 'also' | 'fail' | 'warn' | 'quiet'

/** Above the station (the engine read it before the one it selected), or below (it never got to it). */
export type Side = 'above' | 'below'

/** A slim row: another policy, another rule, or the fold. */
export interface RouteRow {
  key: string
  kind: 'policy' | 'rule' | 'more'
  name: string
  /** What it came to, in the cards' own words: "Not matched · Who", "Not in this policy", "Not reached", "not used". */
  says: string
  /** Its mark before those words, as a card's meta line leads with one: ✕ ? –, or none. */
  mark: Exclude<MetaMark, 'spin' | 'check'>
  /** The engine read it (or, for a policy that also covers the person, weighed it): drawn solid; never reached, dashed. */
  read: boolean
  /** A policy that also covers the person: what it would have given, struck as the Tree view strikes it. */
  would: string | null
  tone: SidingTone
  /** What a press lights once its card is open, and what an answer lights it by: `policy:<id>`, `rule:<id>`. */
  target: Target | null
  /** The fold: the rows it holds. */
  folded?: RouteRow[]
}

export type ColumnItem = { kind: 'card'; card: number; side: Side; row: RouteRow } | { kind: 'row'; side: Side; row: RouteRow }

export interface Route {
  /** The stations, left to right: their kind and the card each is (an index into the story's cards). */
  stations: { kind: StationKind; card: number }[]
  /** Each column's items besides its station, top to bottom: above it, then below it. */
  columns: { policies: ColumnItem[]; rule: ColumnItem[] }
  /** The rule station's rule (an index into `plan.rules`), or null when no policy decides. */
  stationRule: number | null
}

const NOT_REACHED: Pick<RouteRow, 'says' | 'mark' | 'tone'> = { says: 'Not reached', mark: 'dash', tone: 'quiet' }
const TONE_OF: Partial<Record<HeadMeta['tone'], SidingTone>> = { bad: 'fail', warn: 'warn' }

/* A side's rows, capped: every card stays (it is the story's) and so does a policy that also covers the person (it is
   a finding); past MAX_SIDE the rows furthest from the line fold into one — at the top of the column above the
   station, at its foot below it. */
export function capSide(items: ColumnItem[], side: Side, station: string): ColumnItem[] {
  if (items.length <= MAX_SIDE) return items
  const keeps = (x: ColumnItem) => x.kind === 'card' || x.row.tone === 'also'
  let budget = Math.max(0, MAX_SIDE - 1 - items.filter(keeps).length)
  /* Nearest the line first: the last of those above, the first of those below. */
  const near = side === 'above' ? [...items].reverse() : items
  const kept = new Set<ColumnItem>()
  const folded: RouteRow[] = []
  for (const x of near) {
    if (keeps(x)) kept.add(x)
    else if (budget > 0) {
      kept.add(x)
      budget--
    } else folded.push(x.row)
  }
  if (folded.length === 0) return items
  if (side === 'above') folded.reverse()
  /* The fold is the rows' own count — the only number the route adds, and nothing else on the canvas says it. */
  const more: ColumnItem = { kind: 'row', side, row: { key: `${station}:${side}:more`, kind: 'more', name: `+${folded.length} more`, says: '', mark: null, read: folded.some((r) => r.read), would: null, tone: 'quiet', target: null, folded } }
  const left = items.filter((x) => kept.has(x))
  return side === 'above' ? [more, ...left] : [...left, more]
}

/** The route the engine took: the stations, and every other policy and rule in its column, in order. Pure. */
export function routeOf(plan: EngineRun, cards: readonly Moment[]): Route {
  const find = (kind: Moment['kind'], rule?: number) => cards.findIndex((c) => c.kind === kind && (rule === undefined || c.rule === rule))
  const stationRule = plan.decider ? checksRuleOf(plan) : null
  const stations: Route['stations'] = []
  const sign = find('sign')
  if (sign >= 0) stations.push({ kind: 'sign', card: sign })
  const pol = find('policies')
  if (pol >= 0) stations.push({ kind: 'policies', card: pol })
  const ruleCard = stationRule === null ? -1 : find('rule', stationRule)
  if (ruleCard >= 0) stations.push({ kind: 'rule', card: ruleCard })
  const out = find('outcome')
  if (out >= 0) stations.push({ kind: 'outcome', card: out })

  // The policies, in the order the engine asks them: those before the one that applies above it, the rest below.
  const di = plan.policies.findIndex((p) => p.decides)
  const covers = new Map((plan.conflicts?.policies ?? []).map((c) => [c.policyId, c]))
  const words = policyRows(plan, Number.MAX_SAFE_INTEGER)
  const policies: ColumnItem[] =
    pol < 0
      ? []
      : plan.policies.flatMap((p, i): ColumnItem[] => {
          if (i === di) return []
          const side: Side = di < 0 || i < di ? 'above' : 'below'
          const target: Target = `policy:${p.policyId}`
          const base = { key: target, kind: 'policy' as const, name: p.name, target }
          const cover = di >= 0 && i > di ? covers.get(p.policyId) : undefined
          if (cover) {
            const would = cover.status === 'decided' && cover.decision ? DECISION_WORDS[cover.decision] : decisionsOr(cover.possible) || CANT_TELL
            return [{ kind: 'row', side, row: { ...base, says: 'not used', mark: null, read: true, would, tone: 'also' } }]
          }
          const said = side === 'below' ? NOT_REACHED.says : words[i]?.words || NOT_REACHED.says
          return [{ kind: 'row', side, row: { ...base, says: said, mark: 'dash', read: side === 'above', would: null, tone: 'quiet' } }]
        })

  // The deciding policy's rules, in order: those read before the station's above it, the rest below.
  const rules: ColumnItem[] =
    ruleCard < 0 || stationRule === null
      ? []
      : plan.rules.flatMap((r, i): ColumnItem[] => {
          if (i === stationRule) return []
          const side: Side = i < stationRule ? 'above' : 'below'
          const head = ruleHead(plan, i, Number.MAX_SAFE_INTEGER)
          /* A rule the engine never started on: not reached, and nothing more. */
          const meta = head.state === 'waiting' || !head.meta ? null : head.meta
          const said = meta ? { says: `${meta.text}${meta.then ? DECISION_WORDS[meta.then] : ''}`, mark: meta.mark === 'spin' || meta.mark === 'check' ? null : meta.mark, tone: TONE_OF[meta.tone] ?? 'quiet' } : NOT_REACHED
          const read = !!meta && (head.state === 'missed' || head.state === 'folded' || head.state === 'unknown' || head.state === 'possible' || head.state === 'matched')
          const row: RouteRow = { key: `rule:${r.id}`, kind: 'rule', name: r.index === null ? head.title : `Rule ${r.index + 1} · ${head.title}`, ...said, read, would: null, target: `rule:${r.id}` }
          const card = find('rule', i)
          return [card >= 0 ? { kind: 'card', card, side, row } : { kind: 'row', side, row }]
        })

  const capped = (items: ColumnItem[], station: string) => [
    ...capSide(
      items.filter((x) => x.side === 'above'),
      'above',
      station,
    ),
    ...capSide(
      items.filter((x) => x.side === 'below'),
      'below',
      station,
    ),
  ]
  return { stations, columns: { policies: capped(policies, 'policies'), rule: capped(rules, 'rule') }, stationRule }
}

// --- Where everything stands ---------------------------------------------------------------------

/** What a station's card measured: its head's own words (before the route evens the heads out), and its body. */
export interface StationSize {
  head: number
  /** What the card adds under its head while it is open; 0 until it has opened once. */
  body: number
}

export interface OverviewInput {
  plan: EngineRun
  /** Every card of the story, in order (focus2-story.ts `cardsOf`). */
  cards: readonly Moment[]
  /** How many are on stage: the prefix the story has reached. */
  count: number
  /** The presented step, and the presented landing (never the engine's). */
  p: number
  landed: boolean
  /** The band's width, and its height under the headline, in world px: the map is centred in them. */
  roomW: number
  roomH: number
  /** The band's top line: the headline's room when the brief is on, else 0. */
  top: number
  /** What the stations' cards measured, and which are open; absent (a static paint), planned at ROUTE_HEAD_H, all folded. */
  sizes?: Partial<Record<StationKind, StationSize>>
  open?: Partial<Record<StationKind, boolean>>
}

/** A box in world px. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface PlacedRow {
  row: RouteRow
  /** The station it hangs from. */
  under: 'policies' | 'rule'
  box: Box
  /** On screen at this step: the item it stands for has been decided. */
  shown: boolean
  /** Its place out from the line, for the stagger. */
  order: number
}

export interface PlacedBranch {
  key: string
  under: 'policies' | 'rule'
  /** From the line (or the row before it, nearer the line) along the trunk, round the elbow, to its row. */
  d: string
  tone: SidingTone
  shown: boolean
  order: number
}

export interface OverviewPlacement {
  /** One place per card on stage, in the carousel's own shape (turn 0, depth 0, scale 1, nothing veiled or hidden). */
  places: Focus2Place[]
  /** For each card on stage, how the route draws it: its station's card, or a row. */
  faces: ({ kind: 'station'; station: StationKind } | { kind: 'row'; row: RouteRow; tone: SidingTone })[]
  route: Route
  /** The line: its height, each station's middle left to right, how many the story has reached, and whether the last
      stretch is the one being read. */
  line: { y: number; xs: number[]; reached: number; reading: boolean }
  /** Each station's box as drawn, its body included when open; and the heads' one height. */
  stations: Box[]
  head: number
  /** The rows that are not cards (another policy, an unread rule, the fold). */
  rows: PlacedRow[]
  branches: PlacedBranch[]
  /** Every box on the route, the stations' and every row's, cards' rows included: what must never overlap. */
  boxes: { key: string; box: Box }[]
  /** The map's world box with every station folded — what the stage fits — and with the open bodies too. */
  w: number
  h: number
  hOpen: number
}

/** A station's drawn width for this room and this many stations. */
export function stationWidth(roomW: number, n: number): number {
  if (n <= 1) return STATION_MAX
  const fit = (roomW - 2 * MAP_EDGE - (n - 1) * STATION_GAP) / n
  return Math.round(Math.min(STATION_MAX, Math.max(STATION_MIN, Number.isFinite(fit) ? fit : STATION_MIN)))
}

/** A side's rows, stacked: their height, with the drop from the station. */
const stackH = (n: number) => (n > 0 ? SIDING_DROP + n * ROW_H + (n - 1) * SIDING_GAP : 0)

/** Where every card, row and branch of the route stands at the presented step. Pure. */
export function overviewPlaces({ plan, cards, count, p, landed, roomW, roomH, top, sizes = {}, open = {} }: OverviewInput): OverviewPlacement {
  const route = routeOf(plan, cards)
  const n = route.stations.length
  const S = stationWidth(roomW, n)
  const span = n * S + Math.max(0, n - 1) * STATION_GAP
  const w = Math.max(Math.round(roomW), Math.round(span + 2 * MAP_EDGE))
  const rowW = Math.round(S - TRUNK_IN - ELBOW + STATION_GAP / 2 - 4)

  /* The heads are evened out to the tallest that has been measured (focus2-overview.css takes it off the band), so the
     line passes through every one's middle; a station's card is its head, and its body while open. */
  const measured = route.stations.map((st) => sizes[st.kind]?.head ?? 0).filter((h) => h > 0)
  const H = Math.round(measured.length > 0 ? Math.max(...measured) : ROUTE_HEAD_H)
  const closed = H + CARD_EDGE
  const bodyOf = (kind: StationKind) => (open[kind] ? (sizes[kind]?.body ?? 0) : 0)
  const colItems = (kind: StationKind): ColumnItem[] => (kind === 'policies' ? route.columns.policies : kind === 'rule' ? route.columns.rule : [])
  const sideOf = (kind: StationKind, side: Side) => colItems(kind).filter((x) => x.side === side)

  /* Planned folded, so a body opened in place never moves the line: the room above it is the deepest column above, and
     the map is centred in the room on that. What an open body adds below is the world's to grow by (`hOpen`). */
  const above = Math.max(0, ...route.stations.map((st) => stackH(sideOf(st.kind, 'above').length)))
  const below = Math.max(0, ...route.stations.map((st) => stackH(sideOf(st.kind, 'below').length)))
  const mapH = above + closed + below
  const h = Math.max(Math.round(roomH), Math.round(mapH + 2 * MAP_EDGE))
  const y0 = top + Math.max(MAP_EDGE, (h - mapH) / 2)
  const lineY = Math.round(y0 + above + closed / 2)

  // The stations, left to right.
  const stations: Box[] = []
  let x = Math.round((w - span) / 2)
  for (const st of route.stations) {
    stations.push({ x, y: lineY - closed / 2, w: S, h: closed + bodyOf(st.kind) })
    x += S + STATION_GAP
  }
  const colOf = (kind: StationKind) => route.stations.findIndex((st) => st.kind === kind)
  const placeAt = (box: Box, z: number): Focus2Place => ({ x: box.x, y: box.y, scale: 1, turn: 0, z, depth: 0, veil: 0, blur: 0, opacity: 1, hidden: false, sliver: false, peek: false, w: box.w })

  /* Which card the rule station holds while the story is told. A rule is read AT the station, and stays there with its
     finding until the next rule comes in to be read — or the answer lands — and only then goes up to its row: so the
     line never runs on to an empty station, and the failure is read where it happened before it is put in its place.
     That is only while the station's own rule has not come in; a rule read after it (a Depends reads on) is read where
     it hangs, below. */
  const ruleCol = colOf('rule')
  const stationRuleCard = ruleCol >= 0 ? route.stations[ruleCol].card : -1
  const lastRule = (() => {
    let at = -1
    for (let i = 0; i < Math.min(count, cards.length); i++) if (cards[i].kind === 'rule') at = i
    return at
  })()
  const ruleCards = new Set(route.columns.rule.flatMap((it) => (it.kind === 'card' ? [it.card] : [])))
  const atStation = (i: number) => !landed && ruleCol >= 0 && ruleCards.has(i) && i === lastRule && stationRuleCard > i && stationRuleCard >= count

  // When each row is on screen: once the engine has decided what it is.
  const decider = plan.policies.find((pol) => pol.decides)
  const stationRule = route.stationRule === null ? undefined : plan.rules[route.stationRule]
  const policyShown = (row: RouteRow, side: Side): boolean => {
    if (landed) return true
    /* The one that also covers is said at the landing, as every other view says it. */
    if (row.tone === 'also') return false
    const pol = plan.policies.find((x) => `policy:${x.policyId}` === row.key)
    if (!pol) return false
    return side === 'above' ? p >= pol.settleAt : !!decider && p >= decider.settleAt
  }
  const ruleShown = (row: RouteRow, side: Side): boolean => {
    if (landed) return true
    const r = plan.rules.find((x) => `rule:${x.id}` === row.key)
    if (side === 'above' && r && r.endAt >= 0) return p >= r.endAt
    return !!stationRule && stationRule.endAt >= 0 && p >= stationRule.endAt
  }
  const rowShown = (row: RouteRow, side: Side): boolean =>
    row.kind === 'policy' ? policyShown(row, side) : row.kind === 'rule' ? ruleShown(row, side) : (row.folded ?? []).some((r) => (r.kind === 'policy' ? policyShown(r, side) : ruleShown(r, side)))

  // The rows: boxes, and the branches to them.
  const rows: PlacedRow[] = []
  const branches: PlacedBranch[] = []
  const cardBox = new Map<number, { box: Box; row: RouteRow }>()
  const boxes: { key: string; box: Box }[] = route.stations.map((st, c) => ({ key: `station:${st.kind}`, box: stations[c] }))
  for (const under of ['policies', 'rule'] as const) {
    const col = colOf(under)
    if (col < 0) continue
    const st = stations[col]
    const trunkX = st.x + TRUNK_IN
    const left = trunkX + ELBOW
    for (const side of ['above', 'below'] as const) {
      const items = sideOf(under, side)
      /* Out from the line: the last of those above first, going up; the first of those below first, going down. */
      const out = side === 'above' ? [...items].reverse() : items
      let y = side === 'above' ? st.y - SIDING_DROP - ROW_H : st.y + st.h + SIDING_DROP
      /* A branch comes from the nearest row before it that is on screen, or from the line: never from one that has not
         arrived yet, which would leave it hanging. */
      let prev = lineY
      out.forEach((it, order) => {
        const box: Box = { x: left, y, w: rowW, h: ROW_H }
        const mid = y + ROW_H / 2
        const shown = it.kind === 'card' ? it.card < count && !atStation(it.card) : rowShown(it.row, side)
        if (it.kind === 'card') cardBox.set(it.card, { box, row: it.row })
        else rows.push({ row: it.row, under, box, shown, order })
        boxes.push({ key: `${under}:${it.row.key}`, box })
        const r = Math.min(ELBOW_R, Math.abs(mid - prev))
        const d = side === 'above' ? `M ${trunkX} ${prev} V ${mid + r} Q ${trunkX} ${mid} ${trunkX + r} ${mid} H ${left}` : `M ${trunkX} ${prev} V ${mid - r} Q ${trunkX} ${mid} ${trunkX + r} ${mid} H ${left}`
        branches.push({ key: `${under}:${it.row.key}`, under, d, tone: it.row.tone, shown, order })
        if (shown) prev = mid
        y += side === 'above' ? -(ROW_H + SIDING_GAP) : ROW_H + SIDING_GAP
      })
    }
  }

  // The cards on stage: a station, a row — or, the rule being read, the rule station.
  const places: Focus2Place[] = []
  const faces: OverviewPlacement['faces'] = []
  for (let i = 0; i < Math.min(count, cards.length); i++) {
    const col = route.stations.findIndex((st) => st.card === i)
    if (col >= 0) {
      places.push(placeAt({ ...stations[col], h: closed }, 20))
      faces.push({ kind: 'station', station: route.stations[col].kind })
      continue
    }
    if (atStation(i)) {
      places.push(placeAt(stations[ruleCol], 21))
      faces.push({ kind: 'station', station: 'rule' })
      continue
    }
    const onRow = cardBox.get(i)
    if (onRow) {
      places.push(placeAt(onRow.box, 10))
      faces.push({ kind: 'row', row: onRow.row, tone: onRow.row.tone })
      continue
    }
    /* A card with no place on the route (a plan shape not seen yet): under the last station, so it is never lost. */
    const last = stations[stations.length - 1] ?? { x: MAP_EDGE, y: lineY - closed / 2, w: S, h: closed }
    places.push(placeAt({ x: last.x, y: last.y + last.h + SIDING_DROP, w: S, h: closed }, 10))
    faces.push({ kind: 'station', station: route.stations[stations.length - 1]?.kind ?? 'outcome' })
  }

  /* The line: a station is reached once its card is on stage — the rule station once any rule has come to be read there,
     so the line does not draw back while a rule read and failed goes up to its row and the next comes in. */
  const ruleRead = cards.slice(0, count).some((c) => c.kind === 'rule')
  const reachedCol = (c: number) => route.stations[c].card < count || (route.stations[c].kind === 'rule' && ruleRead)
  let reached = 0
  for (let c = 0; c < n; c++) if (reachedCol(c)) reached = c + 1
  const foot = Math.max(lineY + closed / 2, ...boxes.map((b) => b.box.y + b.box.h))
  return {
    places,
    faces,
    route,
    line: { y: lineY, xs: stations.map((b) => b.x + b.w / 2), reached, reading: !landed },
    stations,
    head: H,
    rows,
    branches,
    boxes,
    w,
    h,
    hOpen: Math.max(h, Math.round(foot + MAP_EDGE - top)),
  }
}

/** A row's words, as the route draws them for a row of its own and for a card of the story standing as a row. */
export const rowLabel = (row: RouteRow): string =>
  row.kind === 'more' ? `${row.name}: ${(row.folded ?? []).map((x) => x.name).join(', ')}` : `${row.name}: ${row.would ? `${row.would}, ` : ''}${row.says}`

/** Two boxes overlap (touching is not overlapping). */
export const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
