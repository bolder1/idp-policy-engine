import { animate as play, motion, useMotionValue, type AnimationPlaybackControls } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AppWindow, ArrowDownToDot, ArrowRight, ArrowUpRight, Ban, Check, CircleHelp, Clock, Gauge, Globe, KeyRound, ListFilter, MapPin, Minus, MonitorSmartphone, ShieldCheck, Split, Users, X, type LucideIcon } from 'lucide-react'

import { memberGroupIds, type AccessDecision, type Policy, type User } from '../../../data'
import { DECISION_WORDS, decisionsOr } from '../../../decision-words'
import { Face } from '../../../faces'
import { Tip } from '../../../kit'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import type { LineStatus } from '../../testing/evidence'
import type { SignInScreens } from '../../testing/screens-of'
import { sentenceTokens, tokenValue } from '../../testing/sign-in-sentence'
import type { PillCategory } from '../../testing/trace-pills'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { PolicyConflict, Via } from '../conflicts'
import { NOT_STATED_WORD, activeNode, checkPhase, policyPhase, type CheckRow, type EnginePolicy, type EngineRule, type EngineRun } from '../engine-run'
import { expectMark, traceResult } from '../journey'
import { Spinner } from '../PolicyStack'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import { stepMs } from '../use-engine-run'
import { TIGHT, TILT, WIDE, keysOf, machine, posOf, route, smoothD, spotsOf, tiltedAt, wholePath, windowOf, type MachineGeo } from './marble-geometry'
import { RunStage, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './marble.css'

/* -----------------------------------------------------------------------------
   The run as MARBLE — the sorting machine (run-layout.ts `marble`).

   The sign-in is a marble: the person's initials, the application's mark. It
   rolls out of the sign-in card along the top rail, under the policies'
   labels, past each policy's funnel in the order the engine asks them. A
   funnel that does not cover the person keeps its lid shut and the marble
   rolls on; the first that covers opens its lid and catches it. Down its
   pipe, the deciding policy's rules wait as plates, in rule order: the marble
   lands on a plate and rolls across its checks left to right, each slot lit
   as the engine reads it — a check that fails tips the plate, and the marble
   rolls off its left end onto the plate below; the first plate it crosses
   whole lets it roll off the right, down the chute, into the bin of its
   outcome. The bin it lands in lights and opens into the answer.

   Gravity is reading order: left to right along the rail, top to bottom down
   the plates, left to right across a plate's checks. Every move means
   something true about this run.

   Everything is drawn from `s` with the engine's pure helpers; the marble's
   path is computed (marble-geometry.ts), never measured, and each step's
   stretch of it plays as long as the step does (`stepMs`). Skip, a revisit
   and reduced motion put it where it lands at once. Colour is meaning: blue
   only where the engine is working, green an allow, red a failed check and a
   Deny, amber a conflict or a can't-tell, grey the rest. Never orange.
   -------------------------------------------------------------------------- */

// --- Words and marks --------------------------------------------------------------------------

type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

function toneOf(plan: EngineRun): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
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

function namesOf(names: readonly string[]): string {
  return `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`
}

/** How a policy's audience lets the person in: "via Engineering", "by name", "everyone"; '' when it does not. */
function policyVia(p: Policy | undefined, person: User | null, groupName: (id: string) => string): string {
  if (!p || !person) return ''
  const a = p.audience
  if (a.everyone) return 'everyone'
  if (a.userIds.includes(person.id)) return 'by name'
  const gs = memberGroupIds(person).filter((g) => a.groupIds.includes(g))
  return gs.length > 0 ? `via ${namesOf(gs.map(groupName))}` : ''
}

function audienceOf(p: Policy | undefined, groupName: (id: string) => string, userName: (id: string) => string): string {
  if (!p) return ''
  const a = p.audience
  if (a.everyone) return 'Everyone'
  const names = [...a.groupIds.map(groupName), ...a.userIds.map(userName)]
  return names.length > 0 ? namesOf(names) : 'Nobody'
}

function viaWords(v: Via): string {
  if (!v.matches) return ''
  if (v.kind === 'everyone') return 'everyone'
  if (v.kind === 'person') return 'by name'
  return v.groups.length > 0 ? `via ${namesOf(v.groups.map((x) => x.name))}` : ''
}

/** The factors the person goes through: Password → Google Authenticator → Signed in. */
function chainOf(screens: readonly SignInScreens[], decision: AccessDecision | null): { steps: string[]; deny: string | null } {
  if (!decision) return { steps: [], deny: null }
  const sc = screens.find((x) => x.decision === decision) ?? screens[0]
  if (!sc) return { steps: [], deny: null }
  const steps: string[] = []
  let deny: string | null = null
  for (const st of sc.steps) {
    if (st.kind === 'password') steps.push('Password')
    else if (st.kind === 'first-method') steps.push(st.method)
    else if (st.kind === 'second') steps.push(st.name)
    else if (st.kind === 'deny') deny = st.message
  }
  if (deny === null) steps.push('Signed in')
  return { steps, deny }
}

function ghostWould(c: PolicyConflict): string {
  return c.status === 'decided' && c.decision ? DECISION_WORDS[c.decision] : decisionsOr(c.possible) || 'Can’t tell'
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '?'
}

const SAID: Record<LineStatus, string> = { pass: 'passed', fail: 'failed', unknown: "can't tell" }

const UNSTATED: Record<string, string> = {
  from: 'Network not stated',
  device: 'Device not stated',
  when: 'Time not stated',
  risk: 'Risk score not stated',
}

function Mark({ status, pop, size = 13 }: { status: LineStatus; pop: boolean; size?: number }) {
  const glyph = status === 'pass' ? <Check size={size} strokeWidth={2.6} /> : status === 'fail' ? <X size={size} strokeWidth={2.6} /> : <Minus size={size} strokeWidth={2.4} />
  return (
    <motion.span
      className={`rl-marble__mark is-${status}`}
      aria-hidden
      initial={pop ? { scale: 0.5, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { scale: { type: 'spring', stiffness: 620, damping: 24 }, opacity: { duration: 0.1 } } : { duration: 0 }}
    >
      {status === 'unknown' ? <span className="rl-marble__q">?</span> : glyph}
    </motion.span>
  )
}

// --- Why: a part of the machine, pressed or rested on ----------------------------------------------

interface WhyPair {
  key: string
  word: string
  needs: string
  has: string
  status: LineStatus
}
interface WhyBody {
  title: string
  tone: Tone
  lines: string[]
  pairs: WhyPair[]
}
interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Peek {
  enabled: boolean
  shown: string | null
  hover: (k: string | null, from?: string) => void
  focus: (k: string | null, from?: string) => void
  press: (k: string) => void
}
const WHY_ID = 'rl-marble-why'

/** A part's press target: a button once the run has landed (the engine has the floor while it plays). */
function Hit({ k, peek, className, label, children }: { k: string; peek: Peek; className: string; label?: string; children: ReactNode }) {
  if (!peek.enabled) return <span className={className}>{children}</span>
  const on = peek.shown === k
  return (
    <button
      type="button"
      className={`${className} rl-marble__hit`}
      aria-expanded={on}
      aria-label={label}
      aria-describedby={on ? WHY_ID : undefined}
      onClick={() => peek.press(k)}
      onFocus={() => peek.focus(k)}
      onBlur={() => peek.focus(null, k)}
    >
      {children}
    </button>
  )
}

function hoverProps(k: string, peek: Peek) {
  return peek.enabled ? { onPointerEnter: () => peek.hover(k), onPointerLeave: () => peek.hover(null, k) } : null
}

function WhyCard({ body, box, W, H }: { body: WhyBody; box: Box; W: number; H: number }) {
  const width = Math.max(Math.min(box.w, 340), 280)
  const left = Math.max(0, Math.min(box.x + box.w / 2 - width / 2, W - width))
  const below = box.y + box.h + 200 < H || box.y < 180
  const pos: CSSProperties = below ? { left, top: box.y + box.h + 8, width } : { left, bottom: H - box.y + 8, width }
  return (
    <motion.div id={WHY_ID} role="note" className={`rl-marble__why is-${body.tone}`} style={pos} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.14 }}>
      <p className="rl-marble__wtitle">{body.title}</p>
      {body.pairs.length > 0 && (
        <ul className="rl-marble__wpairs">
          {body.pairs.map((x) => (
            <li key={x.key} className={`rl-marble__wpair is-${x.status}`}>
              <span className="rl-marble__wword">{x.word}</span>
              <span className="rl-marble__wvals">
                <span className="rl-marble__wlab">Needs</span>
                <span className="rl-marble__wneed">{x.needs || '—'}</span>
                <span className="rl-marble__wlab">Has</span>
                <span className="rl-marble__whas">{x.has || '—'}</span>
              </span>
              <span className="rl-marble__wmark">
                <Mark status={x.status} pop={false} />
                <span className="u-sr-only">{SAID[x.status]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {body.lines.map((l, i) => (
        <p key={`${i}:${l}`} className="rl-marble__wline">
          {l}
        </p>
      ))}
    </motion.div>
  )
}

// --- The parts -----------------------------------------------------------------------------------

type PolState = 'idle' | 'working' | 'route' | 'passed' | 'quiet' | 'also' | 'also-info' | 'off'
type RuleState = 'idle' | 'working' | 'route' | 'passed' | 'fail' | 'unknown' | 'off' | 'quiet' | 'also'
type SlotState = 'idle' | 'working' | 'skip' | LineStatus

/** The lid's flap: shut along the rail, open folded down along the funnel's wall. */
function Flap({ x, y, len, dir, angle, open, tone, animate, dur, slide = false }: { x: number; y: number; len: number; dir: 1 | -1; angle: number; open: boolean; tone: string; animate: boolean; dur: number; slide?: boolean }) {
  /* A funnel's flap folds down onto its wall; a bin's slides back into its corner. */
  const a = open && !slide ? (angle * Math.PI) / 180 : 0
  const l = open && slide ? 5 : len
  const x2 = x + dir * l * Math.cos(a)
  const y2 = y + l * Math.sin(a)
  return (
    <motion.line
      className={`rl-marble__lid is-${tone}`}
      x1={x}
      y1={y}
      initial={false}
      animate={{ x2, y2 }}
      transition={{ duration: animate ? dur : 0, ease: [0.3, 0, 0.2, 1.2] }}
    />
  )
}

export default function MarbleLayout(props: RunLayoutProps) {
  const { plan, s, running, animate, reduced, jumped, runKey, form, rows: rowsRead, asGroup, screens, expected, weaker, changed, onPressPerson, onOpenPolicy, onOpenRule, onAdd } = props
  const brand = useBrand()
  const { users, groups, apps, zones } = brand
  const tenant = props.policies ?? brand.policies
  const stage = useRef<StageView | null>(null)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const outRef = useRef<HTMLDivElement | null>(null)

  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id
  const tone = toneOf(plan)
  const first = asGroup ? `anyone in ${asGroup}` : (person?.name.split(' ')[0] ?? 'them')
  const who = asGroup ? `anyone in ${asGroup}` : (person?.name ?? 'this person')
  const whoName = asGroup ? `Anyone in ${asGroup}` : (person?.name ?? 'This person')

  // --- The machine for this plan, at the view's width ---

  const [tight, setTight] = useState(false)
  const wide = useMemo(() => machine(plan, WIDE), [plan])
  const g: MachineGeo = useMemo(() => (tight ? machine(plan, TIGHT) : wide), [plan, tight, wide])
  const spots = useMemo(() => spotsOf(plan, g), [plan, g])
  const { R } = g.d

  /* Where the run is. */
  const landed = plan.at.outcome >= 0 ? s >= plan.at.outcome : !running
  const settled = landed && !running
  /* The answer lights as the marble drops into its bin, a little after the outcome step begins: then the route takes its tone. */
  const [dropped, setDropped] = useState<number | null>(null)
  const atOutcome = animate && s === plan.at.outcome
  useEffect(() => {
    if (!atOutcome) return
    const t = window.setTimeout(() => setDropped(runKey), Math.max(0, stepMs(plan, s) * 0.6))
    return () => window.clearTimeout(t)
  }, [atOutcome, plan, s, runKey])
  const lit = landed && (!atOutcome || dropped === runKey)
  /* A later rule that also applies (a conflict): its plate glows amber from the engine's notice beat on. */
  const noticeAt = plan.steps.findIndex((st) => st.kind === 'deciding' && st.notice)
  const noticeOn = noticeAt >= 0 && s >= noticeAt
  const policiesIn = plan.at.which >= 0 && s >= plan.at.which
  const rulesIn = plan.at.expand >= 0 && s >= plan.at.expand
  const deciderIdx = g.decider
  const decider = deciderIdx >= 0 ? plan.policies[deciderIdx] : undefined
  const deciderPolicy = decider ? tenant.find((p) => p.id === decider.policyId) : undefined
  const landing = plan.landing
  const landRule = landing !== null ? plan.rules[landing] : undefined
  const active = running && !landed ? activeNode(plan, s) : null
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const depends = o.status === 'depends'

  /* Who else covers the person, said once the answer lands: the conflicts amber, the rest grey. */
  const also = useMemo(() => {
    const c = plan.conflicts
    const conflictIds = new Set((c?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId))
    return (c?.policies ?? []).filter((x) => plan.policies.some((p) => p.policyId === x.policyId)).map((x) => ({ c: x, conflict: conflictIds.has(x.policyId) }))
  }, [plan])
  const alsoOf = (id: string) => also.find((a) => a.c.policyId === id) ?? null

  // --- Each part's state at this step ---

  const policyState = (p: EnginePolicy): PolState => {
    if (!policiesIn) return 'idle'
    const ph = policyPhase(p, s)
    if (ph === 'waiting') return 'idle'
    if (ph === 'working' && (active === null || active === p.node)) return 'working'
    if (p.decides) return 'route'
    const a = lit ? alsoOf(p.policyId) : null
    if (a) return a.conflict ? 'also' : 'also-info'
    if (p.kind === 'waiting' || p.kind === 'elsewhere') return 'off'
    return p.scanned ? 'passed' : 'quiet'
  }
  const ruleState = (r: EngineRule, i: number): RuleState => {
    if ((lit || noticeOn) && r.alsoChecks && r.state === 'not-reached') return 'also'
    switch (traceResult(r, s)) {
      case 'waiting':
        return 'idle'
      case 'reading':
        return 'working'
      case 'matched':
        return i === landing ? 'route' : 'passed'
      case 'missed':
      case 'folded':
        return 'fail'
      case 'unknown':
        return 'unknown'
      case 'possible':
        return i === landing ? 'route' : 'unknown'
      case 'off':
        return 'off'
      default:
        return 'quiet'
    }
  }
  const slotState = (r: EngineRule, k: number): SlotState => {
    if (k >= r.checked) return r.visited && s >= r.endAt ? 'skip' : 'idle'
    const ph = checkPhase(r, k, s)
    if (ph === 'hidden') return 'idle'
    if (ph === 'working') return 'working'
    return r.checks[k].status
  }

  // --- The marble: its place, played step by step ---

  const mx = useMotionValue(posOf(plan, g, spots[s] ?? { k: 'start' }, s).x)
  const my = useMotionValue(posOf(plan, g, spots[s] ?? { k: 'start' }, s).y)
  const mr = useMotionValue(0)
  const anims = useRef<AnimationPlaybackControls[]>([])
  const shownS = useRef<{ s: number; runKey: number; g: MachineGeo } | null>(null)
  const [replaying, setReplaying] = useState(false)
  const stopAll = () => {
    for (const a of anims.current) a.stop()
    anims.current = []
  }
  useEffect(() => () => stopAll(), [])

  useLayoutEffect(() => {
    const prev = shownS.current
    shownS.current = { s, runKey, g }
    const to = spots[s] ?? { k: 'start' as const }
    const rest = posOf(plan, g, to, s)
    const stepOn = prev !== null && prev.runKey === runKey && prev.g === g && s === prev.s + 1
    if (!animate || !stepOn) {
      stopAll()
      setReplaying(false)
      mx.set(rest.x)
      my.set(rest.y)
      return
    }
    const from = spots[s - 1] ?? { k: 'start' as const }
    const pts = route(plan, g, from, to, s)
    if (pts.length === 0) return
    stopAll()
    const k = keysOf({ x: mx.get(), y: my.get() }, pts, mr.get(), windowOf(plan, s), R)
    const duration = Math.max(0.12, stepMs(plan, s) / 1000)
    const opts = { duration, times: k.times, ease: k.ease }
    anims.current = [play(mx, k.x, opts), play(my, k.y, opts), play(mr, k.r, opts)]
  }, [s, runKey, g, animate, plan, spots, mx, my, mr, R])

  /* Drop again: the whole way, once more, from the settled frame — the machine stays as it landed. */
  const path = useMemo(() => wholePath(plan, g, spots, plan.steps.length - 1), [plan, g, spots])
  const dropAgain = () => {
    if (path.length < 2 || running) return
    stopAll()
    const [p0, ...rest] = path
    const k = keysOf(p0, rest, 0, [0, 1], R)
    const duration = Math.min(5, Math.max(2.4, k.cost / 520))
    const opts = { duration, times: k.times, ease: k.ease }
    mx.set(p0.x)
    my.set(p0.y)
    mr.set(0)
    setReplaying(true)
    const ax = play(mx, k.x, { ...opts, onComplete: () => setReplaying(false) })
    anims.current = [ax, play(my, k.y, opts), play(mr, k.r, opts)]
  }

  // --- The view: fit as a run starts and as it lands; keep the engine's part in view while it plays ---

  const [outH, setOutH] = useState(0)
  const pendingFit = useRef<{ jump: boolean } | null>({ jump: true })
  const seenRun = useRef(runKey)
  if (seenRun.current !== runKey) {
    seenRun.current = runKey
    pendingFit.current = { jump: true }
  }
  const wasLanded = useRef(landed)
  if (wasLanded.current !== landed) {
    wasLanded.current = landed
    if (landed) pendingFit.current = { jump: reduced || jumped }
  }
  const connY = g.binRailY + g.d.cupH + g.d.binLabelH + 8
  /* The answer stands on the bins' floor and grows upwards as What they see opens, as far as the plates' top; past that, down. */
  const outTop = Math.max(g.out.y, g.out.bottom - outH)
  const H = Math.max(g.H, connY + 10, landed ? outTop + outH + 12 : 0)
  const W = g.W

  // eslint-disable-next-line react-hooks/exhaustive-deps -- every render checks; each setState is guarded by a change
  useLayoutEffect(() => {
    const map = mapRef.current
    if (!map) return
    const sc = map.closest<HTMLElement>('.rstage__scroll')
    if (sc) {
      const room = sc.clientWidth - 96
      const t = room > 0 && room < wide.W
      if (t !== tight) {
        setTight(t)
        pendingFit.current = { jump: true }
        return
      }
    }
    if (pendingFit.current) {
      const opts = pendingFit.current
      pendingFit.current = null
      stage.current?.fit({ max: 1, jump: opts.jump || reduced })
    }
  })

  /* The answer's height (What they see opening) and the view's width, as they change. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const h = outRef.current?.offsetHeight ?? 0
      setOutH((x) => (Math.abs(x - h) > 0.5 ? h : x))
      const sc = map.closest<HTMLElement>('.rstage__scroll')
      if (sc) {
        const room = sc.clientWidth - 96
        setTight(room > 0 && room < wide.W)
      }
    })
    if (outRef.current) ro.observe(outRef.current)
    const sc = map.closest('.rstage__scroll')
    if (sc) ro.observe(sc)
    return () => ro.disconnect()
  }, [wide.W, landed])

  useEffect(() => {
    if (!active || !animate) return
    const el = mapRef.current?.querySelector(`[data-node="${active}"]`)
    if (el) stage.current?.follow(el, { lazy: true })
  }, [active, animate, s])

  // --- The sign-in's facts ---

  const facts = useMemo(
    () =>
      sentenceTokens(rowsRead)
        .filter((t) => t !== 'person' && t !== 'app')
        .map((t) => tokenValue(t, form, { people: users, apps, zones, rows: rowsRead }))
        .filter((v) => !v.unset || depends)
        .map((v) => ({ v, text: v.unset ? UNSTATED[v.token] : v.token === 'risk' ? `Risk score ${v.text}` : v.text })),
    [rowsRead, form, users, apps, zones, depends],
  )
  const groupLine = asGroup ? `A member of ${asGroup}` : person ? groupNamesOf(person, groups).join(', ') : ''
  const whoGroups = asGroup ? `Anyone in ${asGroup}` : person ? `${person.name} · ${groupNamesOf(person, groups).join(', ') || 'no groups'}` : ''

  // --- Why ---

  const [hoverK, setHoverK] = useState<string | null>(null)
  const [focusK, setFocusK] = useState<string | null>(null)
  const [pinK, setPinK] = useState<string | null>(null)
  const seenPeekRun = useRef(runKey)
  if (seenPeekRun.current !== runKey) {
    seenPeekRun.current = runKey
    if (hoverK) setHoverK(null)
    if (focusK) setFocusK(null)
    if (pinK) setPinK(null)
  }
  const shownK = settled ? (hoverK ?? focusK ?? pinK) : null
  const peek: Peek = {
    enabled: settled,
    shown: shownK,
    hover: (k, from) => setHoverK((h) => (k !== null ? k : h === from ? null : h)),
    focus: (k, from) => setFocusK((f) => (k !== null ? k : f === from ? null : f)),
    press: (k) => {
      if (pinK === k) {
        setPinK(null)
        setFocusK(null)
        setHoverK(null)
      } else setPinK(k)
    },
  }

  const ruleFact = (r: EngineRule) => (asGroup ? `Anyone in ${asGroup}` : person && r.via?.matches && r.via.say ? `${person.name} · ${r.via.say}` : '')
  const pairOf = (r: EngineRule, row: CheckRow): WhyPair => ({
    key: row.key,
    word: row.word,
    needs: row.requirement,
    has: row.category === 'who' ? (row.status === 'pass' ? ruleFact(r) || whoName : whoGroups) : row.value,
    status: row.status,
  })

  const whyOf = (k: string): { body: WhyBody; box: Box } | null => {
    if (k === 'm') {
      const p = posOf(plan, g, spots[s] ?? { k: 'start' }, s)
      return {
        box: { x: p.x - R, y: p.y - R, w: R * 2, h: R * 2 },
        body: {
          title: `${whoName} → ${app?.name ?? plan.appName}`,
          tone: 'neutral',
          pairs: [],
          lines: [groupLine ? `Groups · ${groupLine}` : '', ...facts.map((f) => `${f.v.label} · ${f.text}`)].filter(Boolean),
        },
      }
    }
    if (k.startsWith('p:')) {
      const id = k.slice(2)
      const i = plan.policies.findIndex((x) => x.policyId === id)
      const p = plan.policies[i]
      const f = g.funnels[i]
      const pol = tenant.find((x) => x.id === id)
      if (!p || !f) return null
      const box = { x: f.x, y: 0, w: f.w, h: g.d.labelH }
      const st = policyState(p)
      const a = alsoOf(id)
      const audience = audienceOf(pol, groupName, userName)
      if (a && (st === 'also' || st === 'also-info')) {
        const via = viaWords(a.c.via) || policyVia(pol, person, groupName)
        return {
          box,
          body: {
            title: `Would also take ${who} · not used`,
            tone: a.conflict ? 'notice' : 'neutral',
            pairs: [{ key: 'who', word: 'Who', needs: audience, has: via ? `${whoName} · ${via}` : whoName, status: 'pass' }],
            lines: [`It would give ${ghostWould(a.c)}`, decider ? `${decider.name} comes first` : '', a.c.fix].filter(Boolean),
          },
        }
      }
      switch (st) {
        case 'route': {
          const via = policyVia(pol, person, groupName)
          return {
            box,
            body: p.isGlobalDefault
              ? { title: `Fallback · no policy before it covers ${who}`, tone, pairs: [], lines: [o.ruleLine].filter(Boolean) }
              : { title: `First policy that covers ${who}`, tone, pairs: [{ key: 'who', word: 'Who', needs: audience, has: `${whoName}${via ? ` · ${via}` : ''}`, status: 'pass' }], lines: [o.ruleLine].filter(Boolean) },
          }
        }
        case 'passed':
          return {
            box,
            body: {
              title: p.reason && !/not in/i.test(p.reason) ? p.reason : `Doesn’t cover ${who} · lid stays shut`,
              tone: 'neutral',
              pairs: pol && /not in/i.test(p.reason) ? [{ key: 'who', word: 'Who', needs: audience, has: whoGroups, status: 'fail' }] : [],
              lines: [p.tip].filter(Boolean),
            },
          }
        case 'quiet':
          return { box, body: { title: 'Not reached', tone: 'neutral', pairs: [], lines: [decider ? `${decider.name} caught ${first} first` : p.reason].filter(Boolean) } }
        case 'off':
          return { box, body: { title: p.reason || 'Switched off', tone: 'neutral', pairs: [], lines: [p.tip, 'Passed over'].filter(Boolean) } }
        default:
          return null
      }
    }
    if (k.startsWith('r:')) {
      const i = plan.rules.findIndex((x) => `r:${x.id}` === k)
      const r = plan.rules[i]
      const pg = g.plates[i]
      if (!r || !pg) return null
      const box = { x: pg.x, y: pg.y, w: pg.w, h: pg.h }
      const st = ruleState(r, i)
      const read = r.checks.slice(0, r.checked).map((row) => pairOf(r, row))
      const last = r.index === null
      const then = `Then ${DECISION_WORDS[r.decision]}`
      switch (st) {
        case 'fail': {
          const f = r.failing !== null ? r.checks[r.failing] : undefined
          return { box, body: { title: f ? `No match · ${f.word} failed, the plate tips` : 'No match', tone: 'negative', pairs: read, lines: r.checked < r.checks.length ? [`${r.checks.length - r.checked} not checked`] : [] } }
        }
        case 'route':
          if (last) return { box, body: { title: r.state === 'possible' ? 'If no rule above matches' : 'No rule above matched', tone, pairs: [], lines: [then] } }
          return { box, body: { title: 'First match · every check passed', tone, pairs: read, lines: [then] } }
        case 'passed':
          return { box, body: { title: 'Matches', tone: 'positive', pairs: read, lines: [then] } }
        case 'unknown':
          return { box, body: { title: 'Can’t tell · a fact is not stated', tone: 'notice', pairs: read, lines: [`If it matches: ${DECISION_WORDS[r.decision]}`] } }
        case 'also':
          return { box, body: { title: `Also applies to ${who} · not used`, tone: 'notice', pairs: (r.alsoChecks ?? []).map((row) => pairOf(r, row)), lines: [then, landRule && landRule.index !== null ? `Rule ${landRule.index + 1} comes first` : ''].filter(Boolean) } }
        case 'off':
          return { box, body: { title: 'Switched off', tone: 'neutral', pairs: [], lines: ['Passed over'] } }
        case 'quiet':
          return { box, body: { title: 'Not read', tone: 'neutral', pairs: [], lines: [landRule && landRule.index !== null ? `Rule ${landRule.index + 1} matched first` : 'A rule above decided', then] } }
        default:
          return null
      }
    }
    if (k.startsWith('c:')) {
      const [, rid, kk] = k.split('|')
      const i = plan.rules.findIndex((x) => x.id === rid)
      const r = plan.rules[i]
      const pg = g.plates[i]
      const n = Number(kk)
      const row = r?.checks[n]
      const sl = pg?.slots[n]
      if (!r || !row || !pg || !sl) return null
      const box = { x: sl.x, y: pg.y + 30, w: sl.w, h: 28 }
      if (n >= r.checked) return { box, body: { title: `${row.word} · not checked`, tone: 'neutral', pairs: [], lines: [r.failing !== null ? `${r.checks[r.failing].word} failed first` : 'The rule was settled before it', `Needs ${row.requirement}`] } }
      const pair = pairOf(r, row)
      return {
        box,
        body: {
          title: row.status === 'pass' ? `${row.word} · passed` : row.status === 'fail' ? `${row.word} · failed` : `${row.word} · can’t tell`,
          tone: row.status === 'pass' ? 'positive' : row.status === 'fail' ? 'negative' : 'notice',
          pairs: [pair],
          lines: row.subs.slice(0, 5).map((x) => `${x.status === 'pass' ? '✓' : x.status === 'fail' ? '✕' : '–'} ${x.label} · ${x.actual}`),
        },
      }
    }
    if (k.startsWith('b:')) {
      const d = k.slice(2) as AccessDecision
      const b = g.bins.find((x) => x.d === d)
      if (!b) return null
      const box = { x: b.x, y: g.binRailY, w: b.w, h: g.d.cupH + g.d.binLabelH }
      const ends = plan.rules.filter((r) => r.decision === d).map((r) => (r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1} · ${r.name}`))
      const here = decided === d
      const maybe = depends && o.possible.includes(d)
      return {
        box,
        body: {
          title: here ? `${DECISION_WORDS[d]} · this sign-in lands here` : maybe ? `${DECISION_WORDS[d]} · it could land here` : DECISION_WORDS[d],
          tone: here ? tone : maybe ? 'notice' : 'neutral',
          pairs: [],
          lines: [ends.length > 0 ? 'Rules that end here' : '', ...ends.slice(0, 6)].filter(Boolean),
        },
      }
    }
    return null
  }
  const why = shownK ? whyOf(shownK) : null

  // --- The answer ---

  const Icon = decided ? DECISION_ICON[decided] : depends ? Split : CircleHelp
  const word = decided ? DECISION_WORDS[decided] : depends ? 'Depends' : o.view.line || 'No policy decides'
  const byRule = o.ruleLine ? o.ruleLine.split(' · ')[0] : ''
  const chain = chainOf(screens, decided)
  const mark = expectMark(decided, expected, weaker)
  const see0 = screens.length > 0 && form.appId !== null

  // --- Drawing ---

  const d = g.d
  const outcomeAt = plan.at.outcome
  const lidDur = (at: number | null) => (at !== null && at >= 0 ? Math.min(0.4, (stepMs(plan, at) / 1000) * 0.55) : 0.3)
  const funnelAngle = (Math.atan2(d.hopH, d.fw / 2 - 12 - d.neckW / 2) * 180) / Math.PI
  const flapLen = (f: { hingeL: number; cx: number }) => f.cx - f.hingeL
  const neckBottom = d.railY + d.hopH + d.neckH
  const ballTone = lit ? tone : 'neutral'
  const litBin = decided && lit ? g.bins.find((b) => b.d === decided) : undefined
  const traceShown = lit && !replaying && path.length > 1 && !plan.empty
  const traceD = smoothD(path.filter((p) => p.m !== 'up'))
  
  /* The answer's body draws once per run, not every step: it holds What they see. */
  const outBody = useMemo(
    () => (
      <>
              <div className="rl-marble__verdict">
                <span className="rl-marble__vicon" aria-hidden>
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className="rl-marble__vword">{word}</span>
              </div>
              {mark && expected && <p className="rl-marble__expect">{mark === 'fails' ? `Expected ${DECISION_WORDS[expected]}` : 'Weaker factor'}</p>}
              {changed && <p className="rl-marble__changed">Changed by {changed}</p>}
              {o.policyName && (
                <p className="rl-marble__by">
                  <span className="rl-marble__bylabel">Decided by</span>
                  {o.policyId ? (
                    <button type="button" className="rl-marble__bylink" onClick={() => o.policyId && onOpenPolicy(o.policyId)}>
                      {o.policyName}
                      {byRule && <span className="rl-marble__byrule"> · {byRule}</span>}
                    </button>
                  ) : (
                    <span>
                      {o.policyName}
                      {byRule && <span className="rl-marble__byrule"> · {byRule}</span>}
                    </span>
                  )}
                </p>
              )}
              {chain.steps.length > 0 && (
                <p className="rl-marble__chain" aria-label={`Asked for: ${chain.steps.join(', then ')}`}>
                  {chain.steps.map((st, i) => (
                    <span key={`${st}:${i}`} className="rl-marble__step">
                      {i > 0 && <ArrowRight className="rl-marble__arrow" size={11} strokeWidth={2} aria-hidden />}
                      <span className={i === chain.steps.length - 1 ? 'is-end' : undefined}>{st}</span>
                    </span>
                  ))}
                </p>
              )}
              {chain.deny && <p className="rl-marble__deny">“{chain.deny}”</p>}
              {depends && o.view.outcomes.length > 0 && (
                <ul className="rl-marble__ifs">
                  {o.view.outcomes.map((x) => (
                    <li key={`${x.label}:${x.decision}`}>
                      <span>{x.label}</span>
                      <strong>{DECISION_WORDS[x.decision]}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {depends && o.view.needs.length > 0 && <p className="rl-marble__needs">Needs {o.view.needs.join(', ').toLowerCase()}</p>}
              {also.length > 0 && (
                <p className={`rl-marble__also${also.some((a) => a.conflict) ? ' is-conflict' : ''}`}>
                  {also.map((a) => `${a.c.policyName} would give ${ghostWould(a.c)}`).join(' · ')}
                </p>
              )}
              {see0 && (
                <div className="rl-marble__see">
                  <WhatTheySee key={runKey} screens={screens} appId={form.appId} compact defaultOpen={false} />
                </div>
              )}
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every input is a function of the plan, the run and the answer's props
    [plan, runKey, screens, form.appId, expected, weaker, changed, also, onOpenPolicy],
  )

  /* The answer's wire: from under the bin it landed in, along, and up into the card (or into its side). */
  const conn = (() => {
    const b = litBin ?? (depends && lit ? g.bins.find((x) => o.possible.includes(x.d)) : undefined)
    if (!b || !lit || g.plates.length === 0) return null
    const sx = b.cx
    const sy = g.binRailY + d.cupH + d.binLabelH + 2
    const cardL = g.out.x
    const cardR = g.out.x + g.out.w
    const cardB = outTop + outH
    const tx = g.out.side === 'right' ? cardL + 48 : cardR - 48
    if (outH > 0 && cardB < connY - 12) return `M${sx} ${sy} V${connY - 8} Q${sx} ${connY} ${sx + (tx > sx ? 8 : -8)} ${connY} H${tx + (tx > sx ? -8 : 8)} Q${tx} ${connY} ${tx} ${connY - 8} V${cardB}`
    const ex = g.out.side === 'right' ? cardL : cardR
    return `M${sx} ${sy} V${connY - 8} Q${sx} ${connY} ${sx + (ex > sx ? 8 : -8)} ${connY} H${ex}`
  })()

  if (plan.policies.length === 0) {
    return (
      <RunStage ref={stage} reduced={reduced} className="rl-marble" label="Sign-in run, as a sorting machine">
        <div data-card data-node="outcome" style={{ width: 640 }}>
          {props.answer}
        </div>
      </RunStage>
    )
  }

  const dock = (
    <Tip text="Drop again" placement="top">
      <button type="button" className="bb__act" aria-label="Drop the marble again" disabled={running || !landed} onClick={dropAgain}>
        <ArrowDownToDot size={15} strokeWidth={2} />
      </button>
    </Tip>
  )

  return (
    <RunStage ref={stage} reduced={reduced} className={`rl-marble${lit ? ` is-landed is-${tone}` : ''}${tight ? ' is-tight' : ''}`} dock={dock} label="Sign-in run, as a sorting machine">
      <div
        ref={mapRef}
        className="rl-marble__map"
        style={{ width: W, height: H }}
        role="group"
        aria-label={`${person?.name ?? 'Sign-in'} to ${plan.appName || app?.name || 'the application'}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && (pinK || focusK || hoverK)) {
            setPinK(null)
            setFocusK(null)
            setHoverK(null)
          }
        }}
        onPointerDown={(e) => {
          if (pinK && !(e.target instanceof Element && e.target.closest('.rl-marble__hit, .rl-marble__why'))) setPinK(null)
        }}
      >
        {/* The machine's frame: rail, funnels, pipe, gutter, chute, bins — and, once it lands, the way the marble came. */}
        <svg className="rl-marble__frame" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
          {/* The top rail, from the sign-in to the last funnel, broken only by the lids. */}
          {(() => {
            const segs: [number, number][] = []
            let x = g.railX0
            for (const f of g.funnels) {
              segs.push([x, f.hingeL])
              x = f.hingeR
            }
            segs.push([x, g.railX1])
            return segs.map(([a, b], i) => <line key={`rail${i}`} className="rl-marble__rail" x1={a} y1={d.railY} x2={b} y2={d.railY} />)
          })()}
          <line className="rl-marble__rail is-stop" x1={g.railX1} y1={d.railY - 14} x2={g.railX1} y2={d.railY} />

          {plan.policies.map((p, i) => {
            const f = g.funnels[i]
            if (!f) return null
            const st = policyState(p)
            const nl = f.cx - d.neckW / 2
            const nr = f.cx + d.neckW / 2
            const open = p.decides && ((p.foundAt !== null && s >= p.foundAt) || landed)
            const lidTone = st === 'working' ? 'working' : st === 'route' ? 'route' : st === 'also' ? 'also' : 'idle'
            return (
              <g key={p.policyId} className={`rl-marble__hopper is-${st}`}>
                <path d={`M${f.hingeL} ${d.railY} L${nl} ${d.railY + d.hopH} V${neckBottom} M${f.hingeR} ${d.railY} L${nr} ${d.railY + d.hopH} V${neckBottom}`} />
                {!p.decides && <line className="rl-marble__neckcap" x1={nl} y1={neckBottom} x2={nr} y2={neckBottom} />}
                <Flap x={f.hingeL} y={d.railY} len={flapLen(f)} dir={1} angle={funnelAngle} open={open} tone={lidTone} animate={animate} dur={lidDur(p.foundAt)} />
                <Flap x={f.hingeR} y={d.railY} len={flapLen(f)} dir={-1} angle={funnelAngle} open={open} tone={lidTone} animate={animate} dur={lidDur(p.foundAt)} />
              </g>
            )
          })}

          {/* Under the deciding funnel: its pipe, the gutter, the chute and the bins. */}
          <motion.g initial={false} animate={{ opacity: rulesIn || landed ? 1 : 0 }} transition={{ duration: animate ? 0.3 : 0 }}>
            {/* The deciding funnel's neck, run on down into the tower when it stands right under it. */}
            {!g.incline && deciderIdx >= 0 && g.funnels[deciderIdx] && g.plates.length > 0 && (
              <path
                className="rl-marble__neckrun"
                d={`M${g.funnels[deciderIdx].cx - d.neckW / 2} ${neckBottom} V${d.top0 - 14} M${g.funnels[deciderIdx].cx + d.neckW / 2} ${neckBottom} V${d.top0 - 14}`}
              />
            )}
            {g.incline && (
              <>
                <line className="rl-marble__incline" x1={g.incline.x1 + Math.sign(g.incline.x1 - g.incline.x2) * 20} y1={g.incline.y1 - 0.6} x2={g.incline.x2} y2={g.incline.y2} />
                <line className="rl-marble__incline is-lip" x1={g.incline.x2} y1={g.incline.y2} x2={g.incline.x2} y2={g.incline.y2 - 8} />
              </>
            )}
            {g.plates.length > 0 && (
              <>
                <rect className="rl-marble__housing" x={g.gutterX - 8} y={d.top0 - 14} width={g.chuteX - g.gutterX + 16} height={g.binRailY + d.cupH + d.binLabelH + 4 - (d.top0 - 14)} rx={14} />
                <path className="rl-marble__wall" d={`M${g.chuteX} ${d.top0 - 4} V${g.binRailY - 10} Q${g.chuteX} ${g.binRailY} ${g.chuteX - 10} ${g.binRailY}`} />
                {(() => {
                  const segs: [number, number][] = []
                  let x = g.chuteX - 10
                  for (const b of [...g.bins].reverse()) {
                    segs.push([b.x + b.w, x])
                    x = b.x
                  }
                  segs.push([g.gutterX + 10, x])
                  return segs.map(([a, b], i) => <line key={`br${i}`} className="rl-marble__rail" x1={a} y1={g.binRailY} x2={b} y2={g.binRailY} />)
                })()}
                {g.bins.map((b) => {
                  const here = litBin?.d === b.d
                  const maybe = depends && lit && o.possible.includes(b.d)
                  /* Its gate slides open as the marble rolls up to it. */
                  const open = decided === b.d && outcomeAt >= 0 && s >= outcomeAt
                  const st = here ? `lit is-${tone}` : maybe ? 'maybe' : 'idle'
                  const half = b.w / 2
                  return (
                    <g key={b.d} className={`rl-marble__bin is-${st}`}>
                      <path className="rl-marble__cup" d={`M${b.x} ${g.binRailY} V${g.binRailY + d.cupH - 8} Q${b.x} ${g.binRailY + d.cupH} ${b.x + 8} ${g.binRailY + d.cupH} H${b.x + b.w - 8} Q${b.x + b.w} ${g.binRailY + d.cupH} ${b.x + b.w} ${g.binRailY + d.cupH - 8} V${g.binRailY}`} />
                      <Flap x={b.x} y={g.binRailY} len={half} dir={1} angle={0} open={open} tone={here ? 'route' : 'idle'} animate={animate} dur={0.22} slide />
                      <Flap x={b.x + b.w} y={g.binRailY} len={half} dir={-1} angle={0} open={open} tone={here ? 'route' : 'idle'} animate={animate} dur={0.22} slide />
                    </g>
                  )
                })}
              </>
            )}
          </motion.g>

          {traceShown && (
            <motion.g key={`trace:${runKey}`} className="rl-marble__traceg" initial={animate || jumped ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.6, delay: animate ? 0.3 : 0 }}>
              <path className="rl-marble__trace" d={traceD} />
            </motion.g>
          )}
          {conn && (
            <motion.path
              className={`rl-marble__conn is-${tone}`}
              d={conn}
              initial={animate ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: animate ? 0.4 : 0, delay: animate ? 0.2 : 0 }}
            />
          )}
        </svg>

        {/* The sign-in: who signs in to what, and the facts the rules read. The marble starts on its edge. */}
        <div className="rl-marble__card rl-marble__signin" data-card data-node="sign-in" style={{ left: 0, top: 0, width: d.signW }}>
          <button type="button" className="rl-marble__signbtn" onClick={onPressPerson} aria-label={`Change the sign-in: ${person?.name ?? 'nobody'} to ${app?.name ?? 'no application'}`}>
            <span className="rl-marble__who">
              {person && <Face kind="user" name={person.name} size="md" decorative />}
              <span className="rl-marble__whotext">
                <strong>{person?.name ?? 'Choose a person'}</strong>
                {groupLine && <span>{groupLine}</span>}
              </span>
            </span>
            <span className="rl-marble__app">
              <ArrowRight className="rl-marble__to" size={13} strokeWidth={2} aria-hidden />
              {app && <AppLogo appId={app.id} name={app.name} size={16} />}
              <span>{app?.name ?? plan.appName ?? 'Choose an application'}</span>
            </span>
            {facts.length > 0 && (
              <span className="rl-marble__facts">
                {facts.slice(0, 4).map(({ v, text }) => (
                  <span key={v.token} className={`rl-marble__fact${v.unset ? ' is-unset' : ''}`}>
                    <span className="rl-marble__fmark" aria-hidden>
                      {v.unset ? <CircleHelp size={13} strokeWidth={2} /> : <ValueMark v={v} size={13} />}
                    </span>
                    <span className="u-sr-only">{v.label}: </span>
                    <span>{text}</span>
                  </span>
                ))}
              </span>
            )}
          </button>
        </div>

        {/* The policies' labels, over their funnels, in the order the engine asks them. */}
        <div className="rl-marble__labels" data-node="which" style={{ left: g.funnels[0]?.x ?? 0, top: 0, width: (g.funnels[g.funnels.length - 1]?.x ?? 0) + d.fw - (g.funnels[0]?.x ?? 0), height: d.labelH }}>
          {plan.policies.map((p, i) => {
            const f = g.funnels[i]
            if (!f) return null
            const st = policyState(p)
            const via = policyVia(deciderPolicy, person, groupName)
            const line =
              st === 'route'
                ? p.isGlobalDefault
                  ? `Fallback · catches ${first}`
                  : `Covers ${first}${via ? ` ${via}` : ''}`
                : st === 'passed'
                  ? /not in/i.test(p.reason)
                    ? `Doesn’t cover ${first}`
                    : p.reason
                  : st === 'also'
                    ? `Also takes ${first} · not used`
                    : st === 'also-info'
                      ? `Also covers ${first} · not used`
                      : st === 'quiet'
                        ? 'Not reached'
                        : st === 'off'
                          ? p.reason || 'Switched off'
                          : ''
            const k = `p:${p.policyId}`
            return (
              <div
                key={p.policyId}
                className={`rl-marble__card rl-marble__label is-${st}${peek.shown === k ? ' is-peek' : ''}`}
                data-card
                data-node={p.node}
                style={{ left: f.x - (g.funnels[0]?.x ?? 0), width: f.w, height: d.labelH }}
                {...hoverProps(k, peek)}
              >
                <Hit k={k} peek={peek} className="rl-marble__lhit" label={`${p.order}. ${p.name}${line ? ` · ${line}` : ''}`}>
                  <span className="rl-marble__lhead">
                    <span className="rl-marble__num">{p.order}</span>
                    <span className="rl-marble__lname" title={p.name}>
                      {p.name}
                    </span>
                  </span>
                  <span className="rl-marble__lline">{st === 'working' ? <Spinner small /> : line || ' '}</span>
                </Hit>
                {settled && st === 'route' && (
                  <button type="button" className="rl-marble__go" aria-label={`Open ${p.name}`} onClick={() => onOpenPolicy(p.policyId)}>
                    <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* The deciding policy's rules: plates, in rule order. */}
        {g.plates.map((pg, i) => {
          const r = plan.rules[i]
          if (!r) return null
          const st = ruleState(r, i)
          const last = r.index === null
          const shown = rulesIn || landed
          const tilted = tiltedAt(r, s)
          const unknownNow = st === 'unknown' && animate
          const k = `r:${r.id}`
          const live = active === r.node && st !== 'working'
          const then = last ? DECISION_WORDS[r.decision] : st === 'off' ? 'Switched off' : st === 'also' ? 'Also applies · not used' : DECISION_WORDS[r.decision]
          return (
            <motion.div
              key={r.id}
              className="rl-marble__plateslot"
              style={{ left: pg.x, top: pg.y, width: pg.w, height: pg.h }}
              initial={animate ? { opacity: 0, rotate: 0 } : false}
              animate={unknownNow ? { opacity: shown ? 1 : 0, rotate: [0, 1.2, -1, 0.5, 0] } : { opacity: shown ? 1 : 0, rotate: tilted ? -TILT : 0 }}
              transition={
                animate
                  ? { opacity: { duration: 0.24, delay: i * 0.05 }, rotate: unknownNow ? { duration: 0.6 } : { type: 'spring', stiffness: 260, damping: 15 } }
                  : { duration: 0 }
              }
              aria-hidden={!shown}
            >
              <div
                className={`rl-marble__card rl-marble__plate is-${st}${live ? ' is-live' : ''}${last ? ' is-last' : ''}${peek.shown === k ? ' is-peek' : ''}`}
                data-card
                data-node={r.node}
                {...hoverProps(k, peek)}
              >
                <div className="rl-marble__phead">
                  <Hit k={k} peek={peek} className="rl-marble__phit" label={`${last ? 'Nothing else matched' : `Rule ${(r.index ?? 0) + 1} · ${r.name}`} · ${then}`}>
                    <span className="rl-marble__num">{last ? '✱' : (r.index ?? 0) + 1}</span>
                    <span className="rl-marble__pname" title={r.name}>
                      {r.name}
                    </span>
                    <span className="rl-marble__then">{then}</span>
                  </Hit>
                  {st === 'working' && <Spinner small />}
                  {settled && !last && decider && st === 'route' && (
                    <button type="button" className="rl-marble__go" aria-label={`Open rule ${(r.index ?? 0) + 1}`} onClick={() => onOpenRule(decider.policyId, r.id)}>
                      <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
                    </button>
                  )}
                </div>
                {r.checks.length > 0 && (
                  <div className="rl-marble__slots">
                    {r.checks.map((row, n) => {
                      const sl = pg.slots[n]
                      if (!sl) return null
                      const ss = slotState(r, n)
                      const SIcon = CATEGORY_ICON[row.category] ?? ListFilter
                      const text =
                        ss === 'fail' ? row.line : ss === 'unknown' ? (row.value === NOT_STATED_WORD ? 'Not stated' : row.line) : ss === 'skip' ? 'Not checked' : row.requirement
                      const ck = `c:|${r.id}|${n}`
                      const showWord = sl.w >= 244 && ss !== 'fail' && ss !== 'unknown'
                      return (
                        <span key={row.key} className={`rl-marble__slot is-${ss}${sl.compact ? ' is-compact' : ''}${peek.shown === ck ? ' is-peek' : ''}`} style={{ width: sl.w }} {...hoverProps(ck, peek)}>
                          <Hit k={ck} peek={peek} className="rl-marble__shit" label={`${row.word}: ${text}${ss === 'pass' || ss === 'fail' || ss === 'unknown' ? `, ${SAID[ss]}` : ''}`}>
                            <SIcon className="rl-marble__sicon" size={13} strokeWidth={2} aria-hidden />
                            {showWord && !sl.compact && <span className="rl-marble__sword">{row.word}</span>}
                            {!sl.compact && <span className="rl-marble__stext">{text}</span>}
                            <span className="rl-marble__smark">
                              {ss === 'working' ? <Spinner small /> : ss === 'pass' || ss === 'fail' || ss === 'unknown' ? <Mark status={ss} pop={animate} /> : null}
                            </span>
                          </Hit>
                          {ss === 'unknown' && row.missing && settled && (
                            <button type="button" className="rl-marble__add" onClick={() => row.missing && onAdd(row.missing)} aria-label={`Add ${row.word.toLowerCase()}`}>
                              Add
                            </button>
                          )}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}

        {/* The bins' words, under their cups. */}
        {g.plates.length > 0 &&
          g.bins.map((b) => {
            const here = litBin?.d === b.d
            const maybe = depends && lit && o.possible.includes(b.d)
            const k = `b:${b.d}`
            return (
              <motion.div
                key={b.d}
                className={`rl-marble__binlabel is-${here ? `lit is-${tone}` : maybe ? 'maybe' : 'idle'}${peek.shown === k ? ' is-peek' : ''}`}
                data-card
                style={{ left: b.x - 6, top: g.binRailY, width: b.w + 12, height: d.cupH + d.binLabelH }}
                initial={false}
                animate={{ opacity: rulesIn || landed ? 1 : 0 }}
                transition={{ duration: animate ? 0.3 : 0 }}
                {...hoverProps(k, peek)}
              >
                <Hit k={k} peek={peek} className="rl-marble__bhit" label={`Bin: ${DECISION_WORDS[b.d]}`}>
                  {!here && !(decided === b.d && outcomeAt >= 0 && s >= outcomeAt) && (
                    <span className="rl-marble__bicon" style={{ height: d.cupH }} aria-hidden>
                      {(() => {
                        const BIcon = DECISION_ICON[b.d]
                        return <BIcon size={16} strokeWidth={1.8} />
                      })()}
                    </span>
                  )}
                  <span className="rl-marble__bword">{DECISION_WORDS[b.d]}</span>
                </Hit>
              </motion.div>
            )
          })}

        {/* The answer, opened out of the bin it landed in. */}
        <motion.div
          className="rl-marble__outslot"
          style={{ left: g.out.x, top: outTop, width: g.out.w }}
          initial={animate ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: lit ? 1 : 0, y: lit ? 0 : 10 }}
          transition={animate ? { opacity: { duration: 0.26, delay: 0.12 }, y: { type: 'spring', stiffness: 380, damping: 30, delay: 0.12 } } : { duration: 0 }}
          aria-hidden={!lit}
        >
          <div ref={outRef} className={`rl-marble__card rl-marble__out is-${tone}`} data-card data-node="outcome" role="group" aria-label={`Decision: ${word}`}>
            {outBody}
          </div>
        </motion.div>

        {/* Depends: the marble could land in more than one bin — a ghost over each. */}
        {depends &&
          lit &&
          g.bins
            .filter((b) => o.possible.includes(b.d))
            .map((b, i) => {
              const from = posOf(plan, g, { k: 'hover' }, s)
              return (
                <motion.span
                  key={`ghost:${b.d}`}
                  className="rl-marble__ghost"
                  aria-hidden
                  style={{ left: -R, top: -R, width: R * 2, height: R * 2 }}
                  initial={animate ? { x: from.x, y: from.y, opacity: 0 } : false}
                  animate={{ x: b.cx, y: g.binRailY - R - 1, opacity: 1 }}
                  transition={animate ? { duration: 0.5, delay: 0.3 + i * 0.06, ease: [0.3, 0, 0.2, 1] } : { duration: 0 }}
                />
              )
            })}

        {/* The marble: the sign-in itself. */}
        <motion.div className={`rl-marble__ball is-${ballTone}${depends && lit ? ' is-depends' : ''}`} style={{ x: mx, y: my, left: -R, top: -R, width: R * 2, height: R * 2 }}>
          <motion.span className="rl-marble__spin" style={{ rotate: mr }} aria-hidden />
          <Hit k="m" peek={peek} className="rl-marble__ballbtn" label={`The sign-in: ${whoName} to ${app?.name ?? plan.appName}`}>
            <span className="rl-marble__init">{asGroup ? initialsOf(asGroup) : initialsOf(person?.name ?? '?')}</span>
          </Hit>
          {app && (
            <span className="rl-marble__ballapp" aria-hidden>
              <AppLogo appId={app.id} name={app.name} size={11} />
            </span>
          )}
          {depends && lit && <span className="rl-marble__ballq" aria-hidden>?</span>}
        </motion.div>

        {why && <WhyCard key={shownK} body={why.body} box={why.box} W={W} H={H} />}
      </div>
    </RunStage>
  )
}
