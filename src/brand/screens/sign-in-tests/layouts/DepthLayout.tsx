import { animate, motion, motionValue, useMotionValue, type MotionValue } from 'motion/react'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  AppWindow,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  Gauge,
  Globe,
  Info,
  KeyRound,
  ListFilter,
  Lock,
  MapPin,
  Minus,
  MonitorSmartphone,
  ShieldCheck,
  Split,
  StepBack,
  StepForward,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'

import { memberGroupIds, type AccessDecision, type Policy, type User } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { Tip } from '../../../kit'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import type { LineStatus } from '../../testing/evidence'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { answerWords, sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../../testing/sign-in-sentence'
import type { PillCategory } from '../../testing/trace-pills'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { Via } from '../conflicts'
import { NOT_STATED_WORD, activeNode, checkPhase, policyFound, policyOpen, policyPhase, type CheckRow, type EnginePolicy, type EngineRule, type EngineRun } from '../engine-run'
import { expectMark, findingsCount, traceResult, type TraceResult } from '../journey'
import { Spinner } from '../PolicyStack'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import { stepMs } from '../use-engine-run'
import {
  HOLE_R,
  REACH_Y,
  THICK,
  THICK_BASE,
  YAW_MAX,
  YAW_MIN,
  YAW_REST,
  corners,
  holeRimPath,
  leaderPath,
  morph,
  polyPath,
  rimPath,
  sidesPath,
  spacingOf,
  topPath,
  wallPath,
  type Pt,
} from './depth-geometry'
import { RunStage, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './depth.css'

/* -----------------------------------------------------------------------------
   The run in DEPTH (run-layout.ts `depth`): the plates.

       ┌ Maya Iyer → AWS Console ┐
       └──────────(●)────────────┘          ┌ 1 AWS for engineering teams ─────────┐   ┌ Allow on 1 factor ┐
            ◇  1 AWS for eng…   ✓ ━━━━━━━━━━│ [1 Contractors away ✕] [            ]│   │ Decided by …      │
           ◇○  2 AWS billing  ⚠ also        │ [2 Engineers on a compliant device ✓]│━━━│ Password          │
           ◇   3 AWS production · not reached│   Who · Device · Then                │   └───────────────────┘
           ▭   4 Global Default             │ [3 Contractors …] [✱ Nothing else]   │
                                            └──────────────────────────────────────┘

   The application's policies are slabs stacked in depth, the first the
   engine reads on top. The sign-in is a token (the person's face and the
   app's logo) that DROPS: it lands on each plate as the engine asks it; one
   that does not cover the person opens a hole and the token falls through,
   the plate going grey with its reason; the first that covers the person
   CATCHES it. That plate then lifts out of the stack and unfolds, flat and
   large, into its rules as tiles in order — the ones read before the match
   in a row above, the rule the walk stopped at across the whole plate, the
   ones never needed in a quiet row below — and the token hops from tile to
   tile as each is read: a check lights blue, then ✓ or ✕; a tile that
   fails darkens with the check that failed in words; the first match rises.
   The answer rises out of that tile into its card beside the plate.

   Every shape of the stack is a 2D projection (depth-geometry.ts), so lines
   stay crisp; everything read is on flat, untransformed surfaces (the
   labels beside the plates, the board, the answer). Every state is read off
   the step on screen with the engine's pure helpers; the token's moves and
   the unfold last as long as the step that plays them (stepMs), so the
   motion and the engine line keep time. Skip and reduced motion draw the
   landed frame at once.

   Colour is meaning: blue only where the engine works now (the plate it
   asks, the light round the one found, the tile being read); green for a
   check that passed, red for one that failed; once the answer lands, the
   way it took — the plate's slot, the board, the tile, the answer — takes
   ONE tone: green for an allow (any factors), red for Deny, amber for
   Depends. Amber otherwise only for a plate that would also catch the
   person and is not used. Grey is not reached.

   Interactive: hover, focus or press a plate (or its label) to lift it and
   read it — its reason, its rules; press a tile for its checks, the
   sign-in's fact against what the rule asks; drag across the stack (or the
   dock's Tilt) to turn it; the dock's Step walks the run back and forth;
   press the token to drop it again.
   -------------------------------------------------------------------------- */

// --- Geometry (px, at zoom 1) ---------------------------------------------------------------

/* The stack's column, the board, the answer (36px apart, depth.css) — and,
   where the canvas is narrower than that (a 1280 window), a tighter set
   (28px apart) so the landed frame still fits at full size. */
const WIDE = { left: 452, board: 476, out: 264, gap: 36 }
const NARROW = { left: 432, board: 424, out: 244, gap: 28 }
type Dims = typeof WIDE
const sumOf = (d: Dims) => d.left + d.board + d.out + d.gap * 2
/** Where the plates stand in the stack's column, and their labels beside them. */
const CX = 96
const LABEL_X = 190
/** Above the first plate: room for the token to hover. */
const CY0 = REACH_Y + 50
const TOKEN_W = 50
const TOKEN_H = 30

const EASE_OUT = [0.2, 0, 0, 1] as const
const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const
const UNFOLD_EASE = [0.32, 0, 0.16, 1] as const

type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

/** "Ravi Menon is not in it" in a few words: "Doesn't cover Ravi". */
function reasonWords(reason: string, first: string): string {
  if (/ is not in (it|this policy)$/.test(reason) || reason === 'Not in this policy') return `Doesn't cover ${first}`
  return reason
}

/** Two names said, the rest counted. */
const namesOf = (names: readonly string[]): string => `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`

/** How the policy that decides covers the person: "via Engineering", "by name", "everyone", "fallback". */
function coverWords(p: Policy | undefined, person: User | null, isDefault: boolean, groupName: (id: string) => string, via?: Via): string {
  if (isDefault) return 'fallback'
  if (via?.matches) return via.kind === 'groups' ? `via ${via.label}` : via.kind === 'person' ? 'by name' : 'everyone'
  if (!p || !person) return ''
  const a = p.audience
  if (a.everyone) return 'everyone'
  if (a.userIds.includes(person.id)) return 'by name'
  const gs = memberGroupIds(person).filter((g) => a.groupIds.includes(g))
  return gs.length > 0 ? `via ${namesOf(gs.map(groupName))}` : ''
}

const CATEGORY_ICON: Record<PillCategory, LucideIcon> = {
  who: Users,
  network: Globe,
  place: MapPin,
  device: MonitorSmartphone,
  time: Clock,
  risk: Gauge,
  app: AppWindow,
  other: ListFilter,
}

const DECISION_ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }
const SAID: Record<LineStatus, string> = { pass: 'Passed', fail: 'Failed', unknown: "Can't tell" }

function Mark({ status, pop, label }: { status: LineStatus; pop: boolean; label?: string }) {
  const glyph = status === 'pass' ? <Check size={13} strokeWidth={2.6} /> : status === 'fail' ? <X size={13} strokeWidth={2.6} /> : <CircleHelp size={13} strokeWidth={2.2} />
  return (
    <motion.span
      className={`rl-depth__mark is-${status}`}
      role="img"
      aria-label={label ?? SAID[status]}
      initial={pop ? { scale: 0.5, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { scale: { type: 'spring', stiffness: 620, damping: 24 }, opacity: { duration: 0.1 } } : { duration: 0 }}
    >
      {glyph}
    </motion.span>
  )
}

/** Where an element is in the world, by its layout offsets (zoom and transforms leave them be). */
function offsetIn(el: HTMLElement, root: HTMLElement): { x: number; y: number } {
  let x = 0
  let y = 0
  let e: HTMLElement | null = el
  while (e && e !== root) {
    x += e.offsetLeft
    y += e.offsetTop
    e = e.offsetParent as HTMLElement | null
  }
  return { x, y }
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}
interface Geo {
  stack: Box | null
  seat: Box | null
  board: Box | null
  boardHead: Box | null
  out: Box | null
  tiles: Record<string, Box>
}
const NO_GEO: Geo = { stack: null, seat: null, board: null, boardHead: null, out: null, tiles: {} }
const sigOf = (g: Geo) =>
  [g.stack, g.seat, g.board, g.boardHead, g.out]
    .map((b) => (b ? `${b.x},${b.y},${b.w},${b.h}` : '-'))
    .concat(Object.entries(g.tiles).map(([k, b]) => `${k}:${b.x},${b.y},${b.w},${b.h}`))
    .join('|')

/* A motion value kept from others — the plates' shapes from the Tilt and a
   hole's size — recomputed on any change, never through React. */
function useDerived<T>(sources: readonly MotionValue<number>[], fn: (vals: number[]) => T, deps: readonly unknown[]): MotionValue<T> {
  const out = useMotionValue<T>(fn(sources.map((m) => m.get())))
  const fnRef = useRef(fn)
  fnRef.current = fn
  useLayoutEffect(() => {
    const update = () => out.set(fnRef.current(sources.map((m) => m.get())))
    update()
    const offs = sources.map((m) => m.on('change', update))
    return () => offs.forEach((off) => off())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the sources and the caller's deps
  }, [out, ...sources, ...deps])
  return out
}

// --- Where things stand at a step -------------------------------------------------------------

type PlateState = 'hidden' | 'skel' | 'working' | 'found' | 'caught' | 'out' | 'passed' | 'off' | 'below' | 'conflict' | 'also'

/** A plate that never stops the token: switched off, a draft, report-only, not an access policy. */
const hollowOf = (p: EnginePolicy) => p.kind === 'waiting' || p.kind === 'elsewhere' || p.kind === 'watching'

/** The rule the engine is on at step `v`, from the decider's opening: the last step that names one. */
function ruleAt(plan: EngineRun, v: number, from: number): number {
  for (let j = Math.min(v, plan.steps.length - 1); j >= from; j--) {
    const r = plan.steps[j]?.rule
    if (r !== undefined) return r
  }
  return -1
}

type TokenAt =
  | { kind: 'seat' }
  | { kind: 'hover' }
  | { kind: 'plate'; i: number }
  | { kind: 'floor' }
  | { kind: 'board' }
  | { kind: 'tile'; id: string; lift: number }

// --- The plates -------------------------------------------------------------------------------

interface PlateProps {
  p: EnginePolicy
  cy: number
  thick: number
  z: number
  state: PlateState
  shown: boolean
  lifted: boolean
  moving: boolean
  /** The light travelling once round the one found, for this long (s); 0 for none. */
  light: number
  delay: number
  yaw: MotionValue<number>
  hole: MotionValue<number>
  bump: MotionValue<number>
  stackH: number
  leftW: number
  onEnter: (id: string) => void
  onLeave: (id: string) => void
  onPress: (id: string) => void
}

const Plate = memo(function Plate({ p, cy, thick, z, state, shown, lifted, moving, light, delay, yaw, hole, bump, stackH, leftW, onEnter, onLeave, onPress }: PlateProps) {
  const top = useDerived([yaw, hole], ([y, h]) => topPath(CX, cy, y, h), [cy])
  const sides = useDerived([yaw], ([y]) => sidesPath(CX, cy, y, thick), [cy, thick])
  const rim = useDerived([yaw], ([y]) => rimPath(CX, cy, y), [cy])
  const wall = useDerived([yaw, hole], ([y, h]) => wallPath(CX, cy, y, h, thick), [cy, thick])
  const holeRim = useDerived([yaw, hole], ([y, h]) => holeRimPath(CX, cy, y, h), [cy])
  const leader = useDerived([yaw], ([y]) => leaderPath(CX, cy, y, LABEL_X - 6), [cy])
  return (
    <svg className={`rl-depth__plate is-${state}${p.isGlobalDefault ? ' is-base' : ''}${lifted ? ' is-lifted' : ''}`} style={{ zIndex: z }} width={leftW} height={stackH} aria-hidden>
      <motion.g
        initial={moving ? { opacity: 0, y: 22 } : false}
        animate={{ opacity: shown ? 1 : 0, y: shown ? (lifted ? -12 : 0) : 22 }}
        transition={moving || lifted ? { duration: lifted || !shown ? 0.22 : 0.42, delay: shown && !lifted ? delay : 0, ease: EASE_OUT } : { duration: 0.18 }}
      >
        <motion.g style={{ y: bump }}>
          <motion.path className="rl-depth__leader" d={leader} />
          <motion.path className="rl-depth__side" d={sides} />
          <motion.path
            className="rl-depth__top"
            d={top}
            fillRule="evenodd"
            pointerEvents="all"
            onPointerEnter={() => onEnter(p.policyId)}
            onPointerLeave={() => onLeave(p.policyId)}
            onClick={() => onPress(p.policyId)}
          />
          <motion.path className="rl-depth__wall" d={wall} />
          <motion.path className="rl-depth__hole" d={holeRim} />
          <motion.path className="rl-depth__rim" d={rim} />
          {light > 0 && (
            <motion.path className="rl-depth__light" d={rim} initial={{ pathLength: 0, opacity: 1 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: light, ease: 'linear' }} />
          )}
        </motion.g>
      </motion.g>
    </svg>
  )
})

/* A plate's label, beside it: the order, the name, and where it stands —
   flat, so it reads crisply at any tilt. A press pins its card; hover or
   focus shows it. */
function PlateLabel({
  p,
  state,
  cy,
  sub,
  open,
  pinned,
  compact,
  width,
  onEnter,
  onLeave,
  onFocus,
  onBlur,
  onPress,
}: {
  p: EnginePolicy
  state: PlateState
  cy: number
  sub: ReactNode
  open: boolean
  pinned: boolean
  compact: boolean
  width: number
  onEnter: (id: string) => void
  onLeave: (id: string) => void
  onFocus: (id: string) => void
  onBlur: (id: string) => void
  onPress: (id: string) => void
}) {
  const skel = state === 'skel' || state === 'hidden'
  const working = state === 'working' || state === 'found'
  const caught = state === 'caught' || state === 'out'
  const h = compact ? 24 : 38
  return (
    <button
      type="button"
      className={`rl-depth__label is-${state}${open ? ' is-open' : ''}${compact ? ' is-compact' : ''}`}
      style={{ top: cy - h / 2, left: LABEL_X, width, height: h, opacity: state === 'hidden' ? 0 : 1 }}
      data-card
      data-node={p.node}
      aria-expanded={pinned}
      aria-label={skel ? `Policy ${p.order}` : `Policy ${p.order}: ${p.name}`}
      tabIndex={state === 'hidden' ? -1 : 0}
      onPointerEnter={() => onEnter(p.policyId)}
      onPointerLeave={() => onLeave(p.policyId)}
      onFocus={(e) => {
        /* A keyboard's focus reads the plate; a press's focus leaves it to the press. */
        if (e.currentTarget.matches(':focus-visible')) onFocus(p.policyId)
      }}
      onBlur={() => onBlur(p.policyId)}
      onClick={() => onPress(p.policyId)}
    >
      <span className="rl-depth__lnum" aria-hidden>
        {p.order}
      </span>
      <span className="rl-depth__ltext">
        <span className="rl-depth__lname" title={skel ? undefined : p.name}>
          {skel ? <span className="tj-skel is-line" /> : p.name}
        </span>
        {!compact && (sub || working) && (
          <span className="rl-depth__lsub">
            {working ? <Spinner small /> : caught ? <Mark status="pass" pop={false} label="Applies" /> : null}
            {!working && sub}
          </span>
        )}
      </span>
    </button>
  )
}

// --- The rules: tiles on the unfolded plate ----------------------------------------------------------

/** The person's fact for a check, said apart from what the rule asks: "Maya Iyer · via Engineering". */
function factOf(c: CheckRow, via?: Via): string {
  if (c.missing || c.value === NOT_STATED_WORD) return NOT_STATED_WORD
  if (c.category === 'who' && c.status === 'pass' && via?.matches) {
    if (via.kind === 'groups') return `${c.value} · via ${via.label}`
    if (via.kind === 'person') return `${c.value} · by name`
  }
  return c.value
}

/** The one line a tile that did not match keeps: its check that ended it, in words. */
function missOf(r: EngineRule): { c: CheckRow | null; status: LineStatus | 'off'; text: string } {
  if (r.state === 'off') return { c: null, status: 'off', text: 'Switched off' }
  if (r.state === 'unknown' || r.state === 'possible') {
    const c = r.checks.find((x) => x.status === 'unknown') ?? null
    return { c, status: 'unknown', text: c ? NOT_STATED_WORD : "Can't tell" }
  }
  const c = r.failing !== null ? (r.checks[r.failing] ?? null) : null
  return { c, status: 'fail', text: c ? c.line || c.say : r.miss || 'No match' }
}

type TileState = 'waiting' | 'reading' | 'matched' | 'missed' | 'unknown' | 'possible' | 'off' | 'quiet' | 'last'

function tileStateOf(result: TraceResult, r: EngineRule): TileState {
  switch (result) {
    case 'reading':
      return 'reading'
    case 'matched':
      return 'matched'
    case 'missed':
    case 'folded':
      return 'missed'
    case 'unknown':
      return 'unknown'
    case 'possible':
      return 'possible'
    case 'off':
      return 'off'
    case 'not-reached':
      return 'quiet'
    default:
      return r.index === null ? 'last' : 'waiting'
  }
}

/* The ticker of a tile read before the match: one line, the check being
   read, then the next in the same place, ending on the one that failed. */
function Ticker({ r, v, moving }: { r: EngineRule; v: number; moving: boolean }) {
  const settled = v >= r.endAt && r.endAt >= 0
  if (r.state === 'off') return <span className="rl-depth__tick is-off">Switched off</span>
  if (settled) {
    const m = missOf(r)
    const Icon = m.c ? CATEGORY_ICON[m.c.category] : Minus
    return (
      <span className={`rl-depth__tick is-${m.status}`} title={m.c?.tip || m.c?.say || undefined}>
        <Icon className="rl-depth__ticon" size={13} strokeWidth={2} aria-hidden />
        <span className="rl-depth__ttext">
          {m.c && <span className="rl-depth__tword">{m.c.word} </span>}
          {m.text}
        </span>
      </span>
    )
  }
  let k = -1
  for (let i = r.checked - 1; i >= 0; i--) {
    if (checkPhase(r, i, v) !== 'hidden') {
      k = i
      break
    }
  }
  if (k < 0) return <span className="rl-depth__tick is-empty" aria-hidden />
  const c = r.checks[k]
  const working = checkPhase(r, k, v) === 'working'
  const Icon = CATEGORY_ICON[c.category]
  return (
    <span className={`rl-depth__tick is-${working ? 'working' : c.status}`}>
      <Icon className="rl-depth__ticon" size={13} strokeWidth={2} aria-hidden />
      <span className="rl-depth__ttext">
        <span className="rl-depth__tword">{c.word} </span>
        {working ? c.requirement : c.status === 'pass' ? factOf(c, r.via) : c.line || c.say}
      </span>
      {working ? <Spinner small /> : <Mark status={c.status} pop={moving} />}
    </span>
  )
}

/** A tile's checks, whole: what the sign-in showed against what the rule asks — the tile's card, on a press. */
function ChecksCard({ r, policyId, landed, onOpenRule, onAdd, onClose }: { r: EngineRule; policyId: string | null; landed: boolean; onOpenRule: RunLayoutProps['onOpenRule']; onAdd: RunLayoutProps['onAdd']; onClose: () => void }) {
  const read = r.visited ? r.checked : 0
  return (
    <div className="rl-depth__pop rl-depth__tilepop" data-card role="dialog" aria-label={`Checks of ${r.index === null ? r.name : `rule ${r.index + 1}`}`}>
      <div className="rl-depth__pophead">
        <span className="rl-depth__poptitle">{r.index === null ? r.name : `Rule ${r.index + 1} · ${r.name}`}</span>
        <button type="button" className="rl-depth__x" aria-label="Close" onClick={onClose}>
          <X size={13} strokeWidth={2.2} />
        </button>
      </div>
      {r.checks.length > 0 ? (
        <table className="rl-depth__ctable">
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Sign-in</th>
              <th scope="col">Rule asks</th>
              <th scope="col">
                <span className="u-sr-only">Result</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {r.checks.map((c, k) => {
              const Icon = CATEGORY_ICON[c.category]
              const isRead = k < read
              return [
                <tr key={c.key} className={isRead ? `is-${c.status}` : 'is-unread'} title={c.tip || undefined}>
                  <td className="rl-depth__cword">
                    <Icon size={13} strokeWidth={2} aria-hidden />
                    {c.word}
                  </td>
                  <td className="rl-depth__cfact">
                    {factOf(c, r.via)}
                    {isRead && c.missing && (
                      <button type="button" className="rl-depth__add" onClick={() => onAdd(c.missing!)}>
                        Add
                      </button>
                    )}
                  </td>
                  <td className="rl-depth__creq">{c.requirement}</td>
                  <td className="rl-depth__cmark">{isRead ? <Mark status={c.status} pop={false} /> : <span className="rl-depth__unread">Not checked</span>}</td>
                </tr>,
                ...(isRead
                  ? c.subs.map((sub) => (
                      <tr key={`${c.key}:${sub.key}`} className={`rl-depth__sub is-${sub.status}`}>
                        <td />
                        <td className="rl-depth__cfact">{sub.label}</td>
                        <td className="rl-depth__creq">{sub.actual && sub.required ? `${sub.actual} · ${sub.required}` : sub.required || sub.actual}</td>
                        <td className="rl-depth__cmark">
                          <Mark status={sub.status} pop={false} />
                        </td>
                      </tr>
                    ))
                  : []),
              ]
            })}
          </tbody>
        </table>
      ) : (
        <p className="rl-depth__popline">{r.index === null ? 'Locked · every sign-in that reaches it' : r.visited ? 'No checks' : 'Not read · an earlier rule decided'}</p>
      )}
      <p className="rl-depth__popthen">
        <span>Then</span> {DECISION_WORDS[r.decision]}
      </p>
      {landed && policyId && r.index !== null && (
        <button type="button" className="rl-depth__poplink" onClick={() => onOpenRule(policyId, r.id)}>
          Open rule <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
        </button>
      )}
    </div>
  )
}

/** A rule as a tile on the plate: read before the match, or never needed (compact, in a row). */
function Tile({
  r,
  v,
  shown,
  delay,
  band,
  moving,
  open,
  side,
  policyId,
  landed,
  onToggle,
  onOpenRule,
  onAdd,
}: {
  r: EngineRule
  v: number
  shown: boolean
  delay: number
  band: 'before' | 'after'
  moving: boolean
  open: boolean
  side: 'left' | 'right'
  policyId: string | null
  landed: boolean
  onToggle: (id: string) => void
  onOpenRule: RunLayoutProps['onOpenRule']
  onAdd: RunLayoutProps['onAdd']
}) {
  const result = traceResult(r, v)
  const state = tileStateOf(result, r)
  const n = r.index === null ? null : r.index + 1
  const head = state === 'reading' ? null : state === 'missed' ? <Mark status="fail" pop={moving} label="No match" /> : state === 'unknown' ? <Mark status="unknown" pop={moving} /> : null
  return (
    <motion.div
      className={`rl-depth__tile is-${state} is-${band}${open ? ' is-open' : ''}`}
      data-tile={r.id}
      initial={moving ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 8 }}
      transition={{ duration: moving ? 0.28 : 0, delay: shown && moving ? delay : 0, ease: EASE_OUT }}
    >
      <button type="button" className="rl-depth__tilebtn" data-card data-node={r.node} aria-expanded={open} tabIndex={shown ? 0 : -1} onClick={() => onToggle(r.id)} title={r.miss || r.name}>
        <span className="rl-depth__tnum" aria-hidden>
          {n === null ? <Lock size={11} strokeWidth={2.2} /> : n}
        </span>
        <span className="rl-depth__tname">{r.name}</span>
        <span className="rl-depth__tmark">{state === 'reading' && !r.checks.some((_, k) => checkPhase(r, k, v) === 'working') ? <Spinner small /> : head}</span>
      </button>
      {band === 'before' && (
        <div className="rl-depth__tbody">
          <Ticker r={r} v={v} moving={moving} />
        </div>
      )}
      {open && <div className={`rl-depth__popwrap is-${side}`}>{<ChecksCard r={r} policyId={policyId} landed={landed} onOpenRule={onOpenRule} onAdd={onAdd} onClose={() => onToggle(r.id)} />}</div>}
    </motion.div>
  )
}

/* The rule the walk stopped at, across the whole plate: each check, the
   sign-in's fact and what the rule asks side by side, its mark; then what it
   gives. Drawn at its settled size from the first frame: rows not read yet
   hold their place. */
function LandTile({
  r,
  v,
  shown,
  delay,
  moving,
  tone,
  landed,
  open,
  policyId,
  onToggle,
  onOpenRule,
  onAdd,
}: {
  r: EngineRule
  v: number
  shown: boolean
  delay: number
  moving: boolean
  tone: Tone
  landed: boolean
  open: boolean
  policyId: string | null
  onToggle: (id: string) => void
  onOpenRule: RunLayoutProps['onOpenRule']
  onAdd: RunLayoutProps['onAdd']
}) {
  const result = traceResult(r, v)
  const state = tileStateOf(result, r)
  const last = r.index === null
  const reached = result !== 'waiting'
  const settled = r.endAt >= 0 ? v >= r.endAt : reached
  const up = state === 'matched' || state === 'possible' || (last && reached)
  const rowWorking = r.checks.some((_, k) => checkPhase(r, k, v) === 'working')
  const head =
    state === 'reading' ? (
      rowWorking ? null : <Spinner small />
    ) : state === 'matched' ? (
      <Mark status="pass" pop={moving} label="Matches" />
    ) : state === 'unknown' ? (
      <Mark status="unknown" pop={moving} />
    ) : state === 'missed' ? (
      <Mark status="fail" pop={moving} label="No match" />
    ) : null
  const rows = r.checks.slice(0, r.visited ? r.checked : 0)
  const thenWord = r.state === 'possible' ? `If not · ${DECISION_WORDS[r.decision]}` : DECISION_WORDS[r.decision]
  return (
    <motion.div
      className={`rl-depth__tile rl-depth__land is-${state}${up ? ` is-up is-${tone}` : ''}${open ? ' is-open' : ''}`}
      data-tile={r.id}
      initial={moving ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: shown ? 1 : 0, y: shown ? (up ? -4 : 0) : 8 }}
      transition={{ duration: moving ? 0.32 : 0, delay: shown && moving && !up ? delay : 0, ease: EASE_OUT }}
    >
      <button type="button" className="rl-depth__tilebtn" data-card data-node={r.node} aria-expanded={open} tabIndex={shown ? 0 : -1} onClick={() => onToggle(r.id)}>
        <span className="rl-depth__tnum" aria-hidden>
          {last ? <Lock size={11} strokeWidth={2.2} /> : (r.index ?? 0) + 1}
        </span>
        <span className="rl-depth__tname">{r.name}</span>
        <span className="rl-depth__tmark">{head}</span>
      </button>
      {rows.length > 0 && (
        <table className="rl-depth__rows">
          <thead>
            <tr>
              <th scope="col">
                <span className="u-sr-only">Check</span>
              </th>
              <th scope="col">Sign-in</th>
              <th scope="col">Rule asks</th>
              <th scope="col">
                <span className="u-sr-only">Result</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, k) => {
              const ph = checkPhase(r, k, v)
              const Icon = CATEGORY_ICON[c.category]
              return (
                <tr key={c.key} className={`is-${ph === 'settled' ? c.status : ph}`} title={ph === 'settled' ? c.tip || c.say : undefined}>
                  <td className="rl-depth__cword">
                    <Icon size={13} strokeWidth={2} aria-hidden />
                    {c.word}
                  </td>
                  <td className="rl-depth__cfact">
                    <span className="rl-depth__cin">{factOf(c, r.via)}</span>
                    {ph === 'settled' && c.missing && landed && (
                      <button type="button" className="rl-depth__add" onClick={() => onAdd(c.missing!)}>
                        Add
                      </button>
                    )}
                  </td>
                  <td className="rl-depth__creq">
                    <span className="rl-depth__cin">{c.requirement}</span>
                  </td>
                  <td className="rl-depth__cmark">{ph === 'working' ? <Spinner small /> : ph === 'settled' ? <Mark status={c.status} pop={moving} /> : null}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className={`rl-depth__then${settled || (last && reached) ? '' : ' is-hidden'}`}>
        <span className="rl-depth__thenlabel">Then</span>
        <span className="rl-depth__thenword">{thenWord}</span>
      </p>
      {open && (
        <div className="rl-depth__popwrap is-left">
          <ChecksCard r={r} policyId={policyId} landed={landed} onOpenRule={onOpenRule} onAdd={onAdd} onClose={() => onToggle(r.id)} />
        </div>
      )}
    </motion.div>
  )
}

// --- The answer -------------------------------------------------------------------------------------

function OutcomeCard({ props, tone, moving, seeOpen, onSee }: { props: RunLayoutProps; tone: Tone; moving: boolean; seeOpen: boolean; onSee: () => void }) {
  const { plan, screens, form, changed, expected, weaker, columns, onOpenRule, onOpenPolicy } = props
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? DECISION_ICON[decided] : o.status === 'depends' ? Split : CircleHelp
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides'
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const where = landing ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1}`) : ''
  const by = o.policyName ? `${o.policyName}${where && decided ? ` · ${where}` : ''}` : ''
  const open = () => {
    if (!o.policyId) return
    if (decided && landing && landing.index !== null) onOpenRule(o.policyId, landing.id)
    else onOpenPolicy(o.policyId)
  }
  const screen: SignInScreens | undefined = decided ? (screens.find((sc) => sc.decision === decided) ?? screens[0]) : undefined
  const steps = screen?.steps ?? []
  const deny = steps.find((st) => st.kind === 'deny')
  const factors = steps.filter((st) => st.kind !== 'deny')
  const count = findingsCount(plan)
  const mark = expectMark(decided, expected, weaker)
  const was = columns.length > 1 ? columns[0] : null
  const now = columns.length > 1 ? columns[columns.length - 1] : null
  const versus = was && now && answerWords(was) !== answerWords(now) ? { was, now } : null
  const see = screens.length > 0 && form.appId !== null
  const line = { out: { opacity: 0, y: 4 }, in: { opacity: 1, y: 0, transition: { duration: moving ? 0.24 : 0, ease: EASE_OUT } } }
  return (
    <div className={`rl-depth__out is-${tone}`} role="group" aria-label={`Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ''}`}>
      <motion.div className="rl-depth__outin" initial={moving ? 'out' : false} animate="in" variants={{ out: {}, in: { transition: moving ? { staggerChildren: 0.07, delayChildren: 0.18 } : {} } }}>
        <div className="rl-depth__verdict">
          <span className="rl-depth__vtile" aria-hidden>
            <Icon size={18} strokeWidth={2} />
          </span>
          <span className="rl-depth__vword">{word}</span>
        </div>
        {mark && expected && (
          <motion.p className="rl-depth__expect" variants={line} title={mark === 'weaker' ? weaker || undefined : `This sign-in expects ${DECISION_WORDS[expected]}`}>
            <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
            {mark === 'fails' ? `Expected ${DECISION_WORDS[expected]}` : 'Weaker factor'}
          </motion.p>
        )}
        {by && (
          <motion.p className="rl-depth__by" variants={line}>
            <span className="rl-depth__bylabel">{decided ? 'Decided by' : 'Policy'}</span>
            <button type="button" className="rl-depth__bylink" title={`Open ${where && decided ? `${where} of ` : ''}${o.policyName ?? 'the policy'}`} onClick={open}>
              {where && decided ? (
                <>
                  <span>{(o.policyName ?? '').slice(0, (o.policyName ?? '').lastIndexOf(' ') + 1)}</span>
                  <span className="rl-depth__bylast">
                    <span>
                      {(o.policyName ?? '').slice((o.policyName ?? '').lastIndexOf(' ') + 1)} · {where}
                    </span>
                    <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                  </span>
                </>
              ) : (
                <>
                  <span>{by.slice(0, by.lastIndexOf(' ') + 1)}</span>
                  <span className="rl-depth__bylast">
                    <span>{by.slice(by.lastIndexOf(' ') + 1)}</span>
                    <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                  </span>
                </>
              )}
            </button>
          </motion.p>
        )}
        {factors.length > 0 && !deny && (
          <motion.ol className="rl-depth__factors" variants={line} aria-label="Asked for">
            {factors.map((st, i) => (
              <li key={`${st.kind}:${i}`}>
                {i > 0 && <ChevronRight className="rl-depth__farrow" size={12} strokeWidth={2.2} aria-hidden />}
                <span className="rl-depth__factor">{stepLabel(st)}</span>
              </li>
            ))}
          </motion.ol>
        )}
        {deny && deny.kind === 'deny' && (
          <motion.p className="rl-depth__deny" variants={line} title={deny.message}>
            “{deny.message}”
          </motion.p>
        )}
        {o.status === 'depends' && o.view.outcomes.length > 0 && (
          <motion.ul className="rl-depth__ifs" variants={line}>
            {o.view.outcomes.map((x) => (
              <li key={`${x.label}:${x.decision}`}>
                <span className="rl-depth__if">{x.label}</span>
                <span className="rl-depth__ifword">{DECISION_WORDS[x.decision]}</span>
              </li>
            ))}
          </motion.ul>
        )}
        {o.status === 'depends' && o.view.needs.length > 0 && (
          <motion.p className="rl-depth__needs" variants={line}>
            <CircleHelp size={12} strokeWidth={2.2} aria-hidden />
            Needs {o.view.needs.join(', ').toLowerCase()}
          </motion.p>
        )}
        {versus && (
          <motion.p className="rl-depth__vs" variants={line}>
            {versus.was.label} {answerWords(versus.was)}
            <ArrowRight size={12} strokeWidth={2} aria-hidden />
            {versus.now.label} {answerWords(versus.now)}
          </motion.p>
        )}
        {(changed || count || see) && (
          <motion.div className="rl-depth__foot" variants={line}>
            {count && (
              <span className={`rl-depth__finding${count.conflict ? ' is-conflict' : ''}`}>
                {count.conflict ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
                {count.text}
              </span>
            )}
            {changed && <span className="rl-depth__changed">Changed by {changed}</span>}
            {see && (
              <button type="button" className={`rl-depth__seebtn${seeOpen ? ' is-open' : ''}`} aria-expanded={seeOpen} onClick={onSee}>
                What they see
                {seeOpen ? <ChevronDown size={13} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={13} strokeWidth={2.2} aria-hidden />}
              </button>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}

// --- The layout -----------------------------------------------------------------------------------------

/** The beats Step walks through: the moves worth seeing, not the spinners between them. */
const BEAT_KINDS = new Set(['find', 'scan', 'decides', 'expand', 'rule', 'checked', 'rule-end', 'compact', 'deciding', 'outcome'])

export default function DepthLayout(props: RunLayoutProps) {
  const { plan, s, running, animate: hostAnimate, reduced, jumped, runKey, form, rows: rowsRead, asGroup, screens, onPressPerson, onOpenPolicy, onOpenRule, onAdd } = props
  const brand = useBrand()
  const { users, groups, apps, zones } = brand
  const tenant = props.policies ?? brand.policies
  const stage = useRef<StageView | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const stackRef = useRef<HTMLDivElement | null>(null)
  const seatRef = useRef<HTMLSpanElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const boardHeadRef = useRef<HTMLDivElement | null>(null)
  const outRef = useRef<HTMLDivElement | null>(null)
  const outMoverRef = useRef<HTMLDivElement | null>(null)
  const tokenRef = useRef<HTMLButtonElement | null>(null)
  const tokenBodyRef = useRef<HTMLSpanElement | null>(null)

  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id
  const first = asGroup ?? (person ? firstName(person.name) : plan.conflicts?.personName ? firstName(plan.conflicts.personName) : 'them')
  const tone = toneOf(plan)
  const last = Math.max(0, plan.steps.length - 1)

  // --- The step on screen: the host's, or one the admin stepped to ---

  const [view, setView] = useState<number | null>(null)
  const [auto, setAuto] = useState(false)
  const [local, setLocal] = useState(false)
  const [runFor, setRunFor] = useState(runKey)
  const [seeOpen, setSeeOpen] = useState(false)
  const [tileOpen, setTileOpen] = useState<string | null>(null)
  const [hoverPlate, setHoverPlate] = useState<string | null>(null)
  const [focusPlate, setFocusPlate] = useState<string | null>(null)
  const [pinPlate, setPinPlate] = useState<string | null>(null)
  const [narrow, setNarrow] = useState(false)
  const dims = narrow ? NARROW : WIDE
  if (runFor !== runKey) {
    setRunFor(runKey)
    setView(null)
    setAuto(false)
    setLocal(false)
    setSeeOpen(false)
    setTileOpen(null)
    setPinPlate(null)
    setHoverPlate(null)
    setFocusPlate(null)
  }
  if (running && (view !== null || local)) {
    setView(null)
    setAuto(false)
    setLocal(false)
  }
  const v = running ? s : (view ?? s)
  const moving = !reduced && (running ? hostAnimate && !jumped : local)
  /** How long the move of step `j` lasts (s): the step's own time as it plays; a beat's when stepped by hand. */
  const durOf = useCallback((j: number) => (running || auto ? Math.max(0.12, stepMs(plan, j) / 1000) : 0.46), [running, auto, plan])

  /* Drop again: the run's own steps, at their own pace, on this layout only. */
  useEffect(() => {
    if (!auto || view === null) return
    if (view >= last) {
      setView(null)
      setAuto(false)
      return
    }
    const t = window.setTimeout(() => setView(view + 1), Math.max(16, stepMs(plan, view)))
    return () => window.clearTimeout(t)
  }, [auto, view, last, plan])

  const beats = useMemo(() => {
    const out: number[] = []
    plan.steps.forEach((st, i) => {
      if (BEAT_KINDS.has(st.kind)) out.push(i)
    })
    if (out.at(-1) !== last) out.push(last)
    return out
  }, [plan, last])
  const stepTo = (next: number | null) => {
    setAuto(false)
    setLocal(true)
    setView(next === null || next >= last ? null : next)
  }
  const stepBack = () => {
    const prev = [...beats].reverse().find((b) => b < v)
    stepTo(prev ?? beats[0] ?? 0)
  }
  const stepFwd = () => {
    const next = beats.find((b) => b > v)
    stepTo(next ?? null)
  }
  const dropAgain = () => {
    if (running || plan.empty || plan.policies.length === 0) return
    setTileOpen(null)
    setPinPlate(null)
    setHoverPlate(null)
    setFocusPlate(null)
    setLocal(!reduced)
    if (reduced) {
      setView(null)
      return
    }
    setView(0)
    setAuto(true)
  }

  // --- Where the run is at `v` ---

  const at = plan.at
  const N = plan.policies.length
  const SP = spacingOf(N)
  const cyOf = (i: number) => CY0 + i * SP
  const stackH = N > 0 ? cyOf(N - 1) + REACH_Y + THICK_BASE + 34 : 64
  const deciderIdx = plan.policies.findIndex((p) => p.decides)
  const decider = deciderIdx >= 0 ? plan.policies[deciderIdx] : undefined
  const landedAt = at.outcome >= 0 ? at.outcome : last
  const landed = v >= landedAt
  const stackIn = !plan.empty && at.which >= 0 && v >= at.which
  const opened = decider !== undefined && policyOpen(decider, v)
  const decidingAt = plan.steps.findIndex((st) => st.kind === 'deciding')
  const outShown = !plan.empty && (decidingAt >= 0 ? v >= decidingAt : landed)
  const active = running && !landed ? activeNode(plan, v) : null
  const settledAll = decider ? v >= decider.settleAt : landed

  const deciderPolicy = decider ? tenant.find((p) => p.id === decider.policyId) : undefined
  const deciderVia = plan.conflicts?.policies[0]?.deciderVia
  const via = decider ? coverWords(deciderPolicy, person, decider.isGlobalDefault, groupName, deciderVia) : ''

  const conflictIds = useMemo(
    () => new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId)),
    [plan.conflicts],
  )
  const alsoOf = (id: string) => plan.conflicts?.policies.find((c) => c.policyId === id) ?? null

  const plateState = (p: EnginePolicy, i: number): PlateState => {
    if (!stackIn) return 'hidden'
    if (p.decides) {
      if (policyFound(p, v)) return 'found'
      const ph = policyPhase(p, v)
      if (ph === 'working') return 'working'
      if (ph === 'waiting') return 'skel'
      return opened ? 'out' : 'caught'
    }
    const ph = policyPhase(p, v)
    const above = deciderIdx < 0 || i < deciderIdx
    if (above) {
      if (ph === 'working' && (active === null || active === p.node)) return 'working'
      if (ph === 'waiting') return settledAll ? (hollowOf(p) ? 'off' : 'below') : 'skel'
      return hollowOf(p) ? 'off' : 'passed'
    }
    if (!settledAll) return 'skel'
    if (landed && alsoOf(p.policyId)) return conflictIds.has(p.policyId) ? 'conflict' : 'also'
    return hollowOf(p) ? 'off' : 'below'
  }
  const states = plan.policies.map((p, i) => plateState(p, i))

  const subOf = (p: EnginePolicy, st: PlateState): ReactNode => {
    switch (st) {
      case 'caught':
      case 'out':
        return <span className="rl-depth__applies">{via ? `Applies · ${via}` : 'Applies'}</span>
      case 'passed':
        return reasonWords(p.reason, first) || 'Not used'
      case 'off':
        return p.reason || 'Switched off'
      case 'below':
        return 'Not reached'
      case 'conflict':
        return (
          <span className="rl-depth__also is-conflict">
            <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
            Also catches {first} · not used
          </span>
        )
      case 'also':
        return <span className="rl-depth__also">Also covers {first} · not used</span>
      default:
        return null
    }
  }

  /* The token: where it stands at `v`. */
  const tokenAt: TokenAt = (() => {
    if (plan.empty || N === 0 || !stackIn) return { kind: 'seat' }
    if (decider && opened) {
      const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
      if ((landed || (decidingAt >= 0 && v >= decidingAt)) && land) return { kind: 'tile', id: land.id, lift: 4 }
      const ri = ruleAt(plan, v, decider.expandAt ?? 0)
      const r = ri >= 0 ? plan.rules[ri] : undefined
      if (r) return { kind: 'tile', id: r.id, lift: plan.landing === ri && traceResult(r, v) === 'matched' ? 4 : 0 }
      return { kind: 'board' }
    }
    let k = -1
    plan.policies.forEach((p, i) => {
      if (p.scanAt !== null && v >= p.scanAt) k = i
    })
    if (k < 0) return { kind: 'hover' }
    if (!decider && landed) return { kind: 'floor' }
    return { kind: 'plate', i: k }
  })()
  /** In the stack, the token stands just over the plate it is on: under every plate above it. */
  const tokenZ = tokenAt.kind === 'plate' ? 100 + (N - tokenAt.i) * 2 + 1 : tokenAt.kind === 'floor' ? 99 : 400

  // --- Measuring (by offsets) ---

  const [geo, setGeo] = useState<Geo>(NO_GEO)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every render measures; the setState is guarded by a change, so it settles
  useLayoutEffect(() => {
    const world = worldRef.current
    if (!world) return
    const box = (el: HTMLElement | null): Box | null => {
      if (!el) return null
      const o = offsetIn(el, world)
      return { x: o.x, y: o.y, w: el.offsetWidth, h: el.offsetHeight }
    }
    const tiles: Record<string, Box> = {}
    world.querySelectorAll<HTMLElement>('[data-tile]').forEach((el) => {
      const b = box(el)
      if (b && el.dataset.tile) tiles[el.dataset.tile] = b
    })
    const g: Geo = { stack: box(stackRef.current), seat: box(seatRef.current), board: box(boardRef.current), boardHead: box(boardHeadRef.current), out: box(outRef.current), tiles }
    if (sigOf(g) !== sigOf(geo)) setGeo(g)
  })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const w = worldRef.current
    if (!w || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(w)
    return () => ro.disconnect()
  }, [runKey])
  void tick

  // --- The Tilt ---

  const yaw = useMotionValue(YAW_REST)
  const tiltBy = (d: number) => {
    const to = Math.min(YAW_MAX, Math.max(YAW_MIN, yaw.get() + d))
    if (reduced) yaw.set(to)
    else animate(yaw, to, { duration: 0.42, ease: EASE_IN_OUT })
  }
  const drag = useRef<{ id: number; x: number; yaw: number; moved: boolean } | null>(null)
  const dragging = useRef(false)
  const hoverTimer = useRef(0)
  const swallowClick = useRef(false)
  const onStackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    drag.current = { id: e.pointerId, x: e.clientX, yaw: yaw.get(), moved: false }
  }
  const onStackMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    if (!d.moved && Math.abs(dx) < 4) return
    if (!d.moved) {
      d.moved = true
      dragging.current = true
      window.clearTimeout(hoverTimer.current)
      setHoverPlate(null)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    yaw.set(Math.min(YAW_MAX, Math.max(YAW_MIN, d.yaw + dx * 0.32)))
  }
  const onStackUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    dragging.current = false
    if (d.moved) {
      swallowClick.current = true
      window.setTimeout(() => (swallowClick.current = false), 0)
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  // --- The plates' motion: holes, bumps ---

  const holes = useMemo(() => plan.policies.map(() => new Holder()), [plan])
  const holeOpen = (p: EnginePolicy, i: number) => !hollowOf(p) && !p.decides && (deciderIdx < 0 || i < deciderIdx) && p.scanned && v >= p.settleAt
  const holeSig = plan.policies.map((p, i) => (holeOpen(p, i) ? 1 : 0)).join('')
  useLayoutEffect(() => {
    plan.policies.forEach((p, i) => {
      const to = holeOpen(p, i) ? HOLE_R : 0
      const mv = holes[i].hole
      if (mv.get() === to) return
      if (moving) animate(mv, to, { duration: to > 0 ? 0.2 : 0.3, ease: EASE_OUT })
      else mv.set(to)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by the holes' standing
  }, [holeSig, holes])

  // --- The token's moves ---

  const tx = useMotionValue(0)
  const ty = useMotionValue(0)
  const [tokenSeen, setTokenSeen] = useState(false)
  const posOf = useCallback(
    (t: TokenAt): { x: number; y: number } | null => {
      const st = geo.stack
      switch (t.kind) {
        case 'seat':
          return geo.seat ? { x: geo.seat.x + geo.seat.w / 2 - TOKEN_W / 2, y: geo.seat.y + geo.seat.h / 2 - TOKEN_H / 2 } : null
        case 'hover':
          return st ? { x: st.x + CX - TOKEN_W / 2, y: st.y + CY0 - REACH_Y - TOKEN_H - 6 } : null
        case 'plate':
          return st ? { x: st.x + CX - TOKEN_W / 2, y: st.y + cyOf(t.i) - TOKEN_H + 7 } : null
        case 'floor':
          return st ? { x: st.x + CX - TOKEN_W / 2, y: st.y + stackH - TOKEN_H - 2 } : null
        case 'board': {
          /* Riding the plate as it unfolds: where its first rule will be. */
          const b = plan.rules[0] ? geo.tiles[plan.rules[0].id] : undefined
          if (b) return { x: b.x + b.w - TOKEN_W - 34, y: b.y - TOKEN_H + 9 }
          return geo.boardHead ? { x: geo.boardHead.x + geo.boardHead.w - TOKEN_W - 4, y: geo.boardHead.y - TOKEN_H / 2 + 4 } : null
        }
        case 'tile': {
          const b = geo.tiles[t.id]
          return b ? { x: b.x + b.w - TOKEN_W - 34, y: b.y - TOKEN_H + 9 - t.lift } : null
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the geometry and the stack's spacing
    [geo, SP, stackH, plan],
  )
  const unfoldDur = Math.max(0.52, durOf(decider?.expandAt ?? v))
  const tokenKey = `${tokenAt.kind}:${'i' in tokenAt ? tokenAt.i : ''}${'id' in tokenAt ? `${tokenAt.id}:${tokenAt.lift}` : ''}`
  const prevToken = useRef<TokenAt | null>(null)
  const prevRun = useRef(runKey)
  useLayoutEffect(() => {
    const to = posOf(tokenAt)
    if (!to) return
    const from = prevToken.current
    const fresh = prevRun.current !== runKey
    prevRun.current = runKey
    prevToken.current = tokenAt
    if (!tokenSeen) setTokenSeen(true)
    const x0 = tx.get()
    const y0 = ty.get()
    const d = durOf(v)
    const body = tokenBodyRef.current
    /* The run's first move: the token lifts out of the sign-in card and floats over the stack. */
    const seat = posOf({ kind: 'seat' })
    if ((!from || fresh) && moving && seat && tokenAt.kind === 'hover') {
      tx.set(seat.x)
      ty.set(seat.y)
      const dur = Math.max(0.42, d)
      animate(tx, to.x, { duration: dur, ease: EASE_IN_OUT })
      animate(ty, [seat.y, Math.min(seat.y, to.y) - 14, to.y], { duration: dur, times: [0, 0.4, 1], ease: ['easeOut', 'easeInOut'] })
      if (body) animate(body, { scale: [0.6, 1.08, 1] }, { duration: dur, times: [0, 0.6, 1], ease: 'easeOut' })
      return
    }
    if (!moving || !from || fresh || (Math.abs(x0 - to.x) < 0.5 && Math.abs(y0 - to.y) < 0.5)) {
      tx.set(to.x)
      ty.set(to.y)
      return
    }
    const squash = (delay: number) => {
      if (body) animate(body, { scaleY: [1, 0.84, 1.05, 1], scaleX: [1, 1.1, 0.97, 1] }, { duration: 0.32, delay, ease: 'easeOut' })
    }
    if (tokenAt.kind === 'plate' || tokenAt.kind === 'floor') {
      /* A fall: slow off the edge, quick at the end, a small bounce as it lands — and the plate gives under it. */
      const fall = Math.min(0.62, Math.max(0.26, d * 0.85))
      const upFirst = from.kind === 'seat'
      animate(tx, to.x, { duration: fall * (upFirst ? 1 : 0.6), ease: EASE_IN_OUT })
      animate(ty, upFirst ? [y0, Math.min(y0, to.y) - 24, to.y + 4, to.y] : [y0, to.y + 5, to.y - 1, to.y], {
        duration: fall,
        times: upFirst ? [0, 0.35, 0.86, 1] : [0, 0.74, 0.88, 1],
        ease: upFirst ? ['easeOut', 'easeIn', 'easeOut'] : ['easeIn', 'easeOut', 'easeInOut'],
      })
      squash(fall * (upFirst ? 0.84 : 0.72))
      if (tokenAt.kind === 'plate') holes[tokenAt.i]?.bumpIn(fall * 0.72)
      return
    }
    if (tokenAt.kind === 'hover') {
      animate(tx, to.x, { duration: d, ease: EASE_IN_OUT })
      animate(ty, [y0, Math.min(y0, to.y) - 18, to.y], { duration: Math.max(0.3, d), times: [0, 0.45, 1], ease: ['easeOut', 'easeInOut'] })
      return
    }
    /* A hop — onto the board as it unfolds, or tile to tile: an arc. */
    const far = from.kind !== 'tile' && from.kind !== 'board'
    /* Off the stack it rides the plate as it unfolds: the same time, the same ease. */
    const dur = far ? unfoldDur : Math.min(0.5, Math.max(0.24, d * 0.9))
    const peak = Math.min(y0, to.y) - (far ? 40 : 22)
    animate(tx, to.x, { duration: dur, ease: far ? UNFOLD_EASE : EASE_IN_OUT })
    animate(ty, [y0, peak, to.y], { duration: dur, times: [0, 0.45, 1], ease: ['easeOut', 'easeIn'] })
    squash(dur * 0.92)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new place, or new geometry
  }, [tokenKey, posOf, runKey])

  // --- The unfold: the plate lifts out of the stack and lies flat as the board ---

  const unfold = useMotionValue(0)
  const boardOp = useMotionValue(opened ? 1 : 0)
  const [unfolding, setUnfolding] = useState(false)
  const unfoldPath = useMotionValue('')
  /* The rules ride the plate as it opens: each tile's outline, in the plate's plane, lands on its tile. */
  const unfoldTiles = useMotionValue('')
  const sheetOp = useMotionValue(1)
  const tileLinesOp = useMotionValue(0)
  const unfoldPts = useRef<{ from: Pt[]; to: Pt[]; rects: [number, number, number, number][] } | null>(null)
  useEffect(() => {
    const update = (k: number) => {
      const u = unfoldPts.current
      if (u) {
        const q = morph(u.from, u.to, k, 24)
        unfoldPath.set(polyPath(q))
        unfoldTiles.set(u.rects.map(([u0, v0, u1, v1]) => polyPath([bilerp(q, u0, v0), bilerp(q, u1, v0), bilerp(q, u1, v1), bilerp(q, u0, v1)])).join(' '))
      }
      tileLinesOp.set(Math.min(1, k / 0.3))
      /* The sheet hands over to the board as it lands: one crossfade, no pop. */
      sheetOp.set(k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3))
      /* The board's frame comes through as the sheet lands on it: its words are on a flat surface. */
      boardOp.set(Math.min(1, Math.max(0, (k - 0.62) / 0.34)))
      if (k > 0.66 && !tilesInRef.current) {
        tilesInRef.current = true
        setTilesIn(true)
      }
    }
    return unfold.on('change', update)
  }, [unfold, unfoldPath, unfoldTiles, sheetOp, tileLinesOp, boardOp])
  const [boardIn, setBoardIn] = useState(opened)
  const [tilesIn, setTilesIn] = useState(opened)
  const tilesInRef = useRef(opened)
  useLayoutEffect(() => {
    if (!opened) {
      setBoardIn(false)
      setTilesIn(false)
      tilesInRef.current = false
      unfold.set(0)
      boardOp.set(0)
      setUnfolding(false)
      return
    }
    if (boardIn) {
      boardOp.set(1)
      return
    }
    const st = geo.stack
    const b = geo.board
    if (!moving || !st || !b || deciderIdx < 0) {
      boardOp.set(1)
      setBoardIn(true)
      return
    }
    const from = corners(st.x + CX, st.y + cyOf(deciderIdx), yaw.get())
    const to: Pt[] = [
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x + b.w, b.y + b.h],
      [b.x, b.y + b.h],
    ]
    const rects = Object.values(geo.tiles)
      .filter((t) => t.x >= b.x && t.y >= b.y && t.x + t.w <= b.x + b.w + 1 && t.y + t.h <= b.y + b.h + 1)
      .map((t) => [(t.x - b.x) / b.w, (t.y - b.y) / b.h, (t.x + t.w - b.x) / b.w, (t.y + t.h - b.y) / b.h] as [number, number, number, number])
    unfoldPts.current = { from: [...from], to, rects }
    unfold.set(0)
    unfoldPath.set(polyPath(from))
    unfoldTiles.set('')
    sheetOp.set(1)
    tileLinesOp.set(0)
    setUnfolding(true)
    const ctl = animate(unfold, 1, {
      duration: unfoldDur,
      ease: UNFOLD_EASE,
      onComplete: () => {
        boardOp.set(1)
        setBoardIn(true)
        setUnfolding(false)
      },
    })
    return () => ctl.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as the decider opens
  }, [opened, geo.board !== null])
  const boardShown = opened && boardIn
  const tilesShown = opened && (boardIn || tilesIn)

  // --- The answer rises out of the tile ---

  const [outSeen, setOutSeen] = useState(false)
  /** The answer has landed in its place: only then does the route's last link reach it. */
  const [outIn, setOutIn] = useState(false)
  useLayoutEffect(() => {
    const el = outMoverRef.current
    if (!el) return
    if (!outShown) {
      setOutSeen(false)
      setOutIn(false)
      el.style.opacity = '0'
      el.style.transform = 'none'
      return
    }
    if (outSeen) return
    setOutSeen(true)
    const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
    const tb = land ? geo.tiles[land.id] : undefined
    const ob = geo.out
    if (!moving || !tb || !ob) {
      el.style.opacity = '1'
      el.style.transform = 'none'
      setOutIn(true)
      return
    }
    const dx = tb.x + tb.w - 120 - ob.x
    const dy = tb.y + 20 - ob.y
    const dur = Math.max(0.7, durOf(decidingAt >= 0 ? decidingAt : v) + 0.4)
    const ctl = animate(
      el,
      { opacity: [0, 1, 1], x: [dx, dx + 10, 0], y: [dy, dy - 30, 0], scale: [0.5, 0.78, 1] },
      { duration: dur, times: [0, 0.32, 1], ease: ['easeOut', [0.3, 0, 0.1, 1]], onComplete: () => setOutIn(true) },
    )
    return () => {
      ctl.stop()
      setOutIn(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as it is reached
  }, [outShown, geo.out !== null])

  // --- The camera ---

  /* The set of widths, from the canvas's own width, before the first paint. */
  useLayoutEffect(() => {
    const ground = worldRef.current?.closest('.rstage') as HTMLElement | null
    if (ground && ground.clientWidth > 0) setNarrow(ground.clientWidth - 96 < sumOf(WIDE))
  }, [])
  const narrowSeen = useRef(narrow)
  useLayoutEffect(() => {
    if (narrowSeen.current === narrow) return
    narrowSeen.current = narrow
    stage.current?.fit({ max: 1, jump: true })
  }, [narrow])
  const fittedFor = useRef<number | null>(null)
  useLayoutEffect(() => {
    fittedFor.current = landed && !running ? runKey : null
    stage.current?.fit({ max: 1, jump: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new run, and as the layout mounts
  }, [runKey])
  useEffect(() => {
    if (!running || landed || !active) return
    const el = worldRef.current?.querySelector(`[data-node="${active}"]`)
    if (el) stage.current?.follow(el, { lazy: true, jump: reduced })
  }, [active, running, landed, reduced])
  useEffect(() => {
    if (!landed || running || fittedFor.current === runKey) return
    fittedFor.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !hostAnimate })
  }, [landed, running, runKey, reduced, jumped, hostAnimate])
  const settledNow = useRef(!running)
  settledNow.current = !running
  useEffect(() => {
    const ground = worldRef.current?.closest('.rstage')
    if (!ground || typeof ResizeObserver === 'undefined') return
    let seen = ''
    let frame = 0
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      const size = `${Math.round(r.width)}x${Math.round(r.height)}`
      if (size === seen) return
      const firstSize = seen === ''
      seen = size
      /* Too narrow for the wide set at full size (the scroller's sides, 48 each): the tighter one. */
      setNarrow(r.width - 96 < sumOf(WIDE))
      if (firstSize || !settledNow.current) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => stage.current?.fit({ max: 1, jump: true }))
    })
    ro.observe(ground)
    return () => {
      ro.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])

  // --- Inspecting ---

  const onPlateEnter = useCallback((id: string) => {
    if (dragging.current) return
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHoverPlate(id), 90)
  }, [])
  const onPlateFocus = useCallback((id: string) => setFocusPlate(id), [])
  const onPlateBlur = useCallback((id: string) => setFocusPlate((f) => (f === id ? null : f)), [])
  const onPlateLeave = useCallback((id: string) => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHoverPlate((h) => (h === id ? null : h)), 120)
  }, [])
  const onPlatePress = useCallback((id: string) => {
    if (swallowClick.current) return
    setTileOpen(null)
    setPinPlate((p) => (p === id ? null : id))
  }, [])
  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])
  const onToggleTile = useCallback((id: string) => {
    setPinPlate(null)
    setTileOpen((t) => (t === id ? null : id))
  }, [])
  useEffect(() => {
    if (!tileOpen && !pinPlate) return
    /* A press anywhere else puts a pinned card away. */
    const onDown = (e: PointerEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest('.rl-depth__pop, .rl-depth__label, .rl-depth__tilebtn, .rl-depth__top')) return
      setTileOpen(null)
      setPinPlate(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [tileOpen, pinPlate])
  useEffect(() => {
    if (!tileOpen && !pinPlate && !seeOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setTileOpen(null)
      setPinPlate(null)
      setSeeOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tileOpen, pinPlate, seeOpen])
  const inspect = pinPlate ?? focusPlate ?? hoverPlate
  const inspected = inspect ? plan.policies.find((p) => p.policyId === inspect) : undefined
  const inspectedIdx = inspected ? plan.policies.indexOf(inspected) : -1

  // --- The sign-in's facts ---

  const ctx: SentenceContext = { people: users, apps, zones, rows: rowsRead }
  const SHORT: Partial<Record<TokenId, string>> = { from: 'From', device: 'Device', when: 'When', risk: 'Risk' }
  const facts = sentenceTokens(rowsRead)
    .filter((t) => t !== 'person' && t !== 'app')
    .map((t) => tokenValue(t, form, ctx))
  const groupLine = asGroup ? `A member of ${asGroup}` : person ? groupNamesOf(person, groups).join(', ') : ''
  const depends = plan.outcome.status === 'depends' && landed

  // --- The board's bands ---

  const landIdx = decider && plan.rules.length > 0 ? Math.min(plan.rules.length - 1, Math.max(0, plan.landing ?? plan.rules.length - 1)) : -1
  const before = landIdx > 0 ? plan.rules.slice(0, landIdx) : []
  const land = landIdx >= 0 ? plan.rules[landIdx] : undefined
  const after = landIdx >= 0 ? plan.rules.slice(landIdx + 1) : []

  // --- The route's two links: the plate that caught to the board, the tile to the answer ---

  const links: { id: string; d: string; kind: string }[] = []
  if (geo.stack && geo.board && geo.boardHead && boardShown && deciderIdx >= 0) {
    const x1 = geo.stack.x + dims.left
    const y1 = geo.stack.y + cyOf(deciderIdx)
    const x2 = geo.board.x
    const y2 = geo.boardHead.y + geo.boardHead.h / 2
    const mx = x1 + (x2 - x1) / 2
    const r = Math.min(8, Math.abs(y2 - y1) / 2)
    const dir = y2 > y1 ? 1 : -1
    const d = Math.abs(y2 - y1) < 1 ? `M${x1} ${y1} H${x2}` : `M${x1} ${y1} H${mx - r} Q${mx} ${y1} ${mx} ${y1 + dir * r} V${y2 - dir * r} Q${mx} ${y2} ${mx + r} ${y2} H${x2}`
    links.push({ id: 'in', d, kind: landed ? `is-${tone}` : 'is-drawn' })
  }
  if (land && geo.tiles[land.id] && geo.out && outShown && outIn) {
    const tb = geo.tiles[land.id]
    const x1 = tb.x + tb.w
    const y1 = tb.y + 22 - 4
    const x2 = geo.out.x
    const y2 = geo.out.y + 30
    const mx = x1 + (x2 - x1) / 2
    const r = Math.min(8, Math.abs(y2 - y1) / 2)
    const dir = y2 > y1 ? 1 : -1
    const d = Math.abs(y2 - y1) < 1 ? `M${x1} ${y1} H${x2}` : `M${x1} ${y1} H${mx - r} Q${mx} ${y1} ${mx} ${y1 + dir * r} V${y2 - dir * r} Q${mx} ${y2} ${mx + r} ${y2} H${x2}`
    links.push({ id: 'out', d, kind: landed ? `is-${tone}` : 'is-working' })
  }

  const step = plan.steps[v]
  const dock = (
    <>
      <Tip text="Tilt left" placement="top">
        <button type="button" className="bb__act" aria-label="Tilt the stack left" onClick={() => tiltBy(-12)}>
          <ChevronLeft size={15} strokeWidth={2} />
        </button>
      </Tip>
      <span className="rl-depth__docklabel" aria-hidden>
        Tilt
      </span>
      <Tip text="Tilt right" placement="top">
        <button type="button" className="bb__act" aria-label="Tilt the stack right" onClick={() => tiltBy(12)}>
          <ChevronRight size={15} strokeWidth={2} />
        </button>
      </Tip>
      <span className="bb__float__sep" />
      <Tip text="Step back" placement="top">
        <button type="button" className="bb__act" aria-label="Step back" disabled={running || plan.empty || v <= (beats[0] ?? 0)} onClick={stepBack}>
          <StepBack size={14} strokeWidth={2} />
        </button>
      </Tip>
      <Tip text="Step forward" placement="top">
        <button type="button" className="bb__act" aria-label="Step forward" disabled={running || plan.empty || view === null} onClick={stepFwd}>
          <StepForward size={14} strokeWidth={2} />
        </button>
      </Tip>
      {view !== null && step && (
        <span className="rl-depth__beat" aria-live="polite" title={step.text}>
          {step.text || plan.summary}
        </span>
      )}
    </>
  )

  return (
    <RunStage ref={stage} reduced={reduced} pad={narrow ? { left: 28, right: 28 } : undefined} className={`rl-depth${landed ? ` is-landed is-${tone}` : ''}`} dock={dock} label={`Sign-in run: ${plan.appName}`}>
      <div key={runKey} ref={worldRef} className="rl-depth__world" style={{ gap: dims.gap }} role="group" aria-label={`${person?.name ?? 'Sign-in'} to ${plan.appName || app?.name || 'the application'}`}>
        {/* The stack's column: the sign-in, then the plates. */}
        <div className="rl-depth__left" style={{ width: dims.left }}>
          <button type="button" className="rl-depth__sign" data-card data-node="sign-in" onClick={onPressPerson} title="Change the sign-in">
            <span className="rl-depth__signhead">
              <span ref={seatRef} className="rl-depth__seat">
                {person && <Face kind="user" name={person.name} size="md" decorative />}
              </span>
              <span className="rl-depth__signwho">
                <strong>{person?.name ?? 'Choose a person'}</strong>
                {groupLine && <span>{groupLine}</span>}
              </span>
            </span>
            <span className="rl-depth__signapp">
              <ArrowRight className="rl-depth__signto" size={13} strokeWidth={2} aria-hidden />
              {app && <AppLogo appId={app.id} name={app.name} size={16} />}
              <span>{app?.name ?? (plan.appName || 'Choose an application')}</span>
            </span>
            {facts.length > 0 && (
              <span className="rl-depth__facts">
                {facts.map((f) => (
                  <span key={f.token} className={`rl-depth__fact${f.unset ? ` is-unset${depends ? ' is-needed' : ''}` : ''}`}>
                    <span className="rl-depth__factlabel">{SHORT[f.token] ?? f.label}</span>
                    <span className="rl-depth__factmark" aria-hidden>
                      {f.unset ? <CircleHelp size={12} strokeWidth={2} /> : <ValueMark v={f} size={12} />}
                    </span>
                    <span className="rl-depth__facttext">{f.unset ? NOT_STATED_WORD : f.text}</span>
                  </span>
                ))}
              </span>
            )}
          </button>

          <div
            ref={stackRef}
            className="rl-depth__stack"
            style={{ height: stackH, width: dims.left }}
            data-card
            data-node="which"
            role="group"
            aria-label={`Policies on ${plan.appName}, in the order they are read`}
            onPointerDown={onStackDown}
            onPointerMove={onStackMove}
            onPointerUp={onStackUp}
            onPointerCancel={onStackUp}
          >
            {plan.policies.map((p, i) => (
              <Plate
                key={p.policyId}
                p={p}
                cy={cyOf(i)}
                thick={p.isGlobalDefault ? THICK_BASE : THICK}
                z={100 + (N - i) * 2}
                state={states[i]}
                shown={states[i] !== 'hidden'}
                lifted={inspect === p.policyId}
                moving={moving}
                light={states[i] === 'found' && moving ? Math.max(0.3, durOf(p.foundAt ?? v)) : 0}
                delay={moving ? i * 0.05 : 0}
                yaw={yaw}
                hole={holes[i].hole}
                bump={holes[i].bump}
                stackH={stackH}
                leftW={dims.left}
                onEnter={onPlateEnter}
                onLeave={onPlateLeave}
                onPress={onPlatePress}
              />
            ))}
            {plan.policies.map((p, i) => (
              <PlateLabel
                key={p.policyId}
                p={p}
                state={states[i]}
                cy={cyOf(i)}
                sub={subOf(p, states[i])}
                open={inspect === p.policyId}
                pinned={pinPlate === p.policyId}
                compact={SP < 40}
                width={dims.left - LABEL_X}
                onEnter={onPlateEnter}
                onLeave={onPlateLeave}
                onFocus={onPlateFocus}
                onBlur={onPlateBlur}
                onPress={onPlatePress}
              />
            ))}
            {inspected && states[inspectedIdx] !== 'hidden' && (
              <PlateCard
                p={inspected}
                state={states[inspectedIdx]}
                cy={cyOf(inspectedIdx)}
                sub={subOf(inspected, states[inspectedIdx])}
                rules={inspected.decides ? plan.rules.map((r) => ({ id: r.id, index: r.index, name: r.name, decision: r.decision })) : inspected.lines.map((l) => ({ id: l.id, index: l.index, name: l.name, decision: l.decision }))}
                also={alsoOf(inspected.policyId)}
                pinned={pinPlate === inspected.policyId}
                landed={landed && !running}
                left={dims.left}
                onOpen={onOpenPolicy}
                onClose={() => {
                  setPinPlate(null)
                  setHoverPlate(null)
                  setFocusPlate(null)
                }}
                onEnter={onPlateEnter}
                onLeave={onPlateLeave}
              />
            )}
          </div>
        </div>

        {/* The plate that caught the sign-in, unfolded: its rules as tiles. */}
        <motion.div
          ref={boardRef}
          className={`rl-depth__board${landed ? ` is-${tone}` : ''}`}
          data-card
          style={{ width: dims.board, opacity: boardOp, pointerEvents: boardShown ? undefined : 'none' }}
          aria-hidden={!boardShown}
          role="group"
          aria-label={decider ? `Rules in ${decider.name}` : 'Rules'}
        >
          {decider ? (
            <>
              <div ref={boardHeadRef} className="rl-depth__bhead">
                <span className="rl-depth__lnum">{decider.order}</span>
                <span className="rl-depth__bname" title={decider.name}>
                  {decider.name}
                </span>
                {landed && !running && (
                  <button type="button" className="rl-depth__bopen" aria-label={`Open ${decider.name}`} onClick={() => onOpenPolicy(decider.policyId)}>
                    <ArrowUpRight size={13} strokeWidth={2.2} />
                  </button>
                )}
              </div>
              {before.length > 0 && (
                <div className={`rl-depth__band is-before${before.length === 1 ? ' is-one' : ''}`}>
                  {before.map((r, i) => (
                    <Tile
                      key={r.id}
                      r={r}
                      v={v}
                      shown={tilesShown}
                      delay={0.02 + i * 0.04}
                      band="before"
                      moving={moving}
                      open={tileOpen === r.id}
                      side={i % 2 === 0 ? 'left' : 'right'}
                      policyId={decider.policyId}
                      landed={landed && !running}
                      onToggle={onToggleTile}
                      onOpenRule={onOpenRule}
                      onAdd={onAdd}
                    />
                  ))}
                </div>
              )}
              {land && (
                <LandTile
                  r={land}
                  v={v}
                  shown={tilesShown}
                  delay={0.02 + before.length * 0.04}
                  moving={moving}
                  tone={tone}
                  landed={landed}
                  open={tileOpen === land.id}
                  policyId={decider.policyId}
                  onToggle={onToggleTile}
                  onOpenRule={onOpenRule}
                  onAdd={onAdd}
                />
              )}
              {after.length > 0 && (
                <div className={`rl-depth__band is-after${after.length === 1 ? ' is-one' : ''}`}>
                  {after.map((r, i) => (
                    <Tile
                      key={r.id}
                      r={r}
                      v={v}
                      shown={tilesShown}
                      delay={0.06 + (before.length + i) * 0.04}
                      band="after"
                      moving={moving}
                      open={tileOpen === r.id}
                      side={i % 2 === 0 ? 'left' : 'right'}
                      policyId={decider.policyId}
                      landed={landed && !running}
                      onToggle={onToggleTile}
                      onOpenRule={onOpenRule}
                      onAdd={onAdd}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div ref={boardHeadRef} className="rl-depth__bhead is-none">
              <span className="rl-depth__bname">No policy decides</span>
            </div>
          )}
        </motion.div>

        {/* The answer, beside the plate. */}
        <div className="rl-depth__outcol" style={{ width: dims.out }}>
          <div ref={outRef} className="rl-depth__outslot" data-card data-node="outcome" aria-hidden={!outShown}>
            <div ref={outMoverRef} className="rl-depth__outmover" style={{ opacity: 0 }}>
              <OutcomeCard props={props} tone={landed ? tone : 'neutral'} moving={moving} seeOpen={seeOpen} onSee={() => setSeeOpen((o) => !o)} />
            </div>
            {seeOpen && screens.length > 0 && form.appId && (
              <motion.div className="rl-depth__see" data-card initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.2, ease: EASE_OUT }}>
                <WhatTheySee screens={screens} appId={form.appId} compact collapsible={false} />
              </motion.div>
            )}
          </div>
        </div>

        {/* Over everything: the unfold in flight, and the route's links. */}
        <svg className="rl-depth__over" style={{ zIndex: unfolding ? 450 : 15 }} aria-hidden>
          {links.map((l) => (
            <motion.path
              key={l.id}
              className={`rl-depth__link ${l.kind}`}
              d={l.d}
              initial={moving ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: moving ? 0.34 : 0, ease: EASE_OUT }}
            />
          ))}
          {unfolding && (
            <motion.g style={{ opacity: sheetOp }}>
              <motion.path className="rl-depth__flight" d={unfoldPath} />
              <motion.path className="rl-depth__flighttiles" d={unfoldTiles} style={{ opacity: tileLinesOp }} />
            </motion.g>
          )}
        </svg>

        {/* The sign-in, as the token that drops. */}
        <motion.button
          ref={tokenRef}
          type="button"
          className={`rl-depth__token${tokenAt.kind === 'seat' ? ' is-seat' : ''}`}
          style={{ x: tx, y: ty, zIndex: tokenZ, opacity: tokenSeen && tokenAt.kind !== 'seat' ? 1 : 0 }}
          data-card
          tabIndex={tokenAt.kind === 'seat' || running ? -1 : 0}
          aria-label="Drop the sign-in again"
          title="Drop again"
          onClick={dropAgain}
        >
          <span ref={tokenBodyRef} className="rl-depth__tokenbody">
            {person ? <Face kind="user" name={person.name} size="sm" decorative /> : <Users size={14} strokeWidth={2} aria-hidden />}
            {app && (
              <span className="rl-depth__tokenapp">
                <AppLogo appId={app.id} name={app.name} size={14} />
              </span>
            )}
          </span>
          <span className="rl-depth__tokenshadow" aria-hidden />
        </motion.button>
      </div>
    </RunStage>
  )
}

/** A point on a four-corner shape (top-left, top-right, bottom-right, bottom-left) at (u, v) in 0..1. */
function bilerp(q: readonly Pt[], u: number, v: number): Pt {
  const tx = q[0][0] + (q[1][0] - q[0][0]) * u
  const ty = q[0][1] + (q[1][1] - q[0][1]) * u
  const bx = q[3][0] + (q[2][0] - q[3][0]) * u
  const by = q[3][1] + (q[2][1] - q[3][1]) * u
  return [tx + (bx - tx) * v, ty + (by - ty) * v]
}

/* A plate's motion values, kept by the plan: its hole and the give as the token lands on it. */
class Holder {
  hole: MotionValue<number>
  bump: MotionValue<number>
  constructor() {
    this.hole = motionValue(0)
    this.bump = motionValue(0)
  }
  bumpIn(delay: number) {
    animate(this.bump, [0, 4, -1, 0], { duration: 0.34, delay, times: [0, 0.35, 0.7, 1], ease: 'easeOut' })
  }
}

/** A plate's card, beside its label: why it stands where it does, and its rules as titles. */
function PlateCard({
  p,
  state,
  cy,
  sub,
  rules,
  also,
  pinned,
  landed,
  left,
  onOpen,
  onClose,
  onEnter,
  onLeave,
}: {
  left: number
  p: EnginePolicy
  state: PlateState
  cy: number
  sub: ReactNode
  rules: { id: string; index: number | null; name: string; decision: AccessDecision }[]
  also: { why: string; notUsed: string } | null
  pinned: boolean
  landed: boolean
  onOpen: (id: string) => void
  onClose: () => void
  onEnter: (id: string) => void
  onLeave: (id: string) => void
}) {
  const skel = state === 'skel'
  const why = skel ? 'Not read yet' : state === 'conflict' || state === 'also' ? also?.why || p.tip : p.tip || (typeof sub === 'string' ? '' : p.reason)
  return (
    <div
      className="rl-depth__pop rl-depth__platepop"
      style={{ left: left + 6, top: Math.max(0, cy - 24) } as CSSProperties}
      data-card
      role="dialog"
      aria-label={p.name}
      onPointerEnter={() => onEnter(p.policyId)}
      onPointerLeave={() => onLeave(p.policyId)}
    >
      <div className="rl-depth__pophead">
        <span className="rl-depth__lnum">{p.order}</span>
        <span className="rl-depth__poptitle">{p.name}</span>
        {pinned && (
          <button type="button" className="rl-depth__x" aria-label="Close" onClick={onClose}>
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>
      {!skel && sub && <p className={`rl-depth__popsub is-${state}`}>{sub}</p>}
      {why && <p className="rl-depth__popline">{why}</p>}
      {rules.length > 0 && !skel && (
        <ol className="rl-depth__poprules">
          {rules.map((r) => (
            <li key={r.id}>
              <span className="rl-depth__prnum">{r.index === null ? <Lock size={10} strokeWidth={2.2} aria-hidden /> : r.index + 1}</span>
              <span className="rl-depth__prname">{r.name}</span>
              <span className="rl-depth__prword">{DECISION_WORDS[r.decision]}</span>
            </li>
          ))}
        </ol>
      )}
      {landed && (
        <button type="button" className="rl-depth__poplink" onClick={() => onOpen(p.policyId)}>
          Open policy <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
        </button>
      )}
    </div>
  )
}
