import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  AppWindow,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  CircleHelp,
  Clock,
  Gauge,
  Globe,
  KeyRound,
  ListFilter,
  Lock,
  MapPin,
  Minus,
  MonitorSmartphone,
  ShieldCheck,
  Split,
  TriangleAlert,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react'

import { FALLBACK_NAME, memberGroupIds, type AccessDecision, type Policy, type User } from '../../../data'
import { DECISION_WORDS, decisionsOr } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import type { LineStatus } from '../../testing/evidence'
import type { SignInScreens } from '../../testing/screens-of'
import type { FormField } from '../../testing/sign-in-form'
import { CONNECTOR, sentenceTokens, tokenValue, type SentenceContext } from '../../testing/sign-in-sentence'
import type { PillCategory } from '../../testing/trace-pills'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { PolicyConflict, RuleConflict } from '../conflicts'
import { NOT_STATED_WORD, activeNode, askOf, checkPhase, policyPhase, ruleFolded, type CheckRow, type EnginePolicy, type EngineRule, type EngineRun } from '../engine-run'
import { eachGroupRows, expectMark, heroFinding, traceResult } from '../journey'
import { Spinner } from '../PolicyStack'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import { stepMs } from '../use-engine-run'
import { RunStage, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './chat.css'

/* -----------------------------------------------------------------------------
   The run as a CHAT — the engine explains itself (run-layout.ts `chat`).

     Sign-in  ●   ┌ Maya Iyer  Engineering, Finance → AWS Console … ┐   (you)
              │   ◆ 4 policies on AWS Console — the first that covers Maya applies.
     Policies ●     [1 AWS for engineering teams ✓ Applies]
              │     [2 AWS billing for Finance  ⚠ Also covers Maya · not used]
              │     AWS for engineering teams covers Maya — via Engineering.
     Rules    ●     [1 Contractors away from the office  ✕ Who]
              │     Rule 1 doesn't fit — Maya Iyer is not in Contractors.
              │     [2 Engineers on a compliant device ✓ ✓]  Rule 2 fits …
     Outcome  ●     Allowed on 1 factor.  [Decided by · Asked for]   [What they see]
                    (Why not rule 1?) (Who else covers Maya?) (What will Maya see?) …

   One thread, top to bottom in the engine's order: the admin's sign-in as
   the first message, then the engine's replies as the plan reaches them —
   the policies on the app (the first that covers applies), a card per rule
   it reads (the first match wins), the answer last and biggest. Every
   message is drawn from `s` with the engine's pure helpers; the clock is the
   host's. A reply arrives after a short typing beat (the step before it),
   rows grow into a rule card as they are read, a rule that missed folds to
   the row that failed, the policies never asked fold into one line.

   The rail at the left lights the four stages as they pass; each marker is a
   button that brings its stage into view. Once the run lands, reply chips
   ask the engine why — each answer composed from the plan (engine-run.ts,
   journey.ts, conflicts.ts), never invented.

   Colour is meaning: blue only while the engine works (the card being read,
   the policy being asked, the typing dots, the active stage); green what
   matched or applies and an allow; red a failed check and a Deny; amber only
   a conflict or a can't-tell; grey the rest. Motion owns opacity, y and the
   growing heights — nothing in chat.css transitions or transforms those.
   -------------------------------------------------------------------------- */

// --- Words and marks ------------------------------------------------------------------------

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

/** The answer, said: "Allowed on 1 factor." */
const VERDICT: Record<AccessDecision, string> = { '1fa': 'Allowed on 1 factor.', '2fa': 'Allowed with 2FA.', deny: 'Denied.' }

const SAID: Record<LineStatus, string> = { pass: 'passed', fail: 'failed', unknown: "can't tell" }

const firstName = (name: string) => name.split(' ')[0] || name
const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const trimDot = (s: string) => s.replace(/[.\s]+$/, '')

/** "rules 1, 2 and 3". */
function listed(ns: readonly (string | number)[]): string {
  if (ns.length <= 1) return ns.map(String).join('')
  return `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`
}

/** What a rule asks for, mid-sentence: "needs below 40", "needs not in Corporate offices". */
function needsOf(req: string): string {
  return /^(Not|Above|Below|Between|Any|In) /.test(req) ? req.charAt(0).toLowerCase() + req.slice(1) : req
}

/** Two names said, the rest counted. */
function namesOf(names: readonly string[]): string {
  return `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`
}

/** How the deciding policy covers the person: "via Engineering", "by name", "for everyone". */
function coverOf(p: Policy | undefined, person: User | null, groupName: (id: string) => string): string {
  if (!p || !person) return ''
  const a = p.audience
  if (a.everyone) return 'for everyone'
  if (a.userIds.includes(person.id)) return 'by name'
  const gs = memberGroupIds(person).filter((g) => a.groupIds.includes(g))
  return gs.length > 0 ? `via ${namesOf(gs.map(groupName))}` : ''
}

/** The factors the person goes through, from the pages they would get: Password → Google Authenticator → Signed in. */
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

/** A fact a Depends needs, as the panel's field that states it. */
const FACT_FIELD: Record<string, FormField> = { network: 'address', place: 'place', device: 'device', time: 'when', risk: 'risk' }

function Mark({ status, pop, size = 13 }: { status: LineStatus; pop: boolean; size?: number }) {
  const glyph = status === 'pass' ? <Check size={size} strokeWidth={2.6} /> : status === 'fail' ? <X size={size} strokeWidth={2.6} /> : <Minus size={size} strokeWidth={2.4} />
  return (
    <motion.span
      className={`rl-chat__mark is-${status}`}
      aria-hidden
      initial={pop ? { scale: 0.5, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { scale: { type: 'spring', stiffness: 620, damping: 24 }, opacity: { duration: 0.1 } } : { duration: 0 }}
    >
      {glyph}
    </motion.span>
  )
}

/** Where an element is in the thread, by its layout offsets (zoom and transforms leave them be). */
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

/** Something that grows into place (a row read, a line said) and folds away again. */
function Grow({ open, animate, dur = 0.24, className, children }: { open: boolean; animate: boolean; dur?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={`rl-chat__grow${className ? ` ${className}` : ''}`}
      initial={animate ? { height: 0, opacity: 0 } : false}
      animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
      transition={{ duration: animate ? dur : 0, ease: [0.2, 0, 0, 1] }}
      aria-hidden={!open || undefined}
      inert={!open || undefined}
    >
      {children}
    </motion.div>
  )
}

// --- The thread's messages -------------------------------------------------------------------

/* A message arriving: it fades up into its place. The wrapper never moves
   (the camera and the rail measure it); what is inside it does. */
function Msg({
  side,
  node,
  stage,
  avatar,
  working = false,
  animate,
  className = '',
  children,
}: {
  side: 'you' | 'engine'
  node?: string
  stage?: StageId
  /** The engine's mark beside it: the first message of each of its turns. */
  avatar?: boolean
  working?: boolean
  animate: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`rl-chat__msg is-${side}${className ? ` ${className}` : ''}`} data-card data-node={node} data-stage={stage}>
      {side === 'engine' && (
        <span className={`rl-chat__avatar${avatar ? '' : ' is-blank'}${working ? ' is-working' : ''}`} aria-hidden>
          {avatar && <Workflow size={15} strokeWidth={2} />}
        </span>
      )}
      <motion.div
        className="rl-chat__content"
        initial={animate ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={animate ? { opacity: { duration: 0.2 }, y: { type: 'spring', stiffness: 380, damping: 32 } } : { duration: 0 }}
      >
        {children}
      </motion.div>
    </div>
  )
}

function Typing({ animate }: { animate: boolean }) {
  return (
    <span className="rl-chat__typing" role="status" aria-label="The engine is working">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="rl-chat__tdot"
          animate={animate ? { opacity: [0.35, 1, 0.35], y: [0, -3, 0] } : { opacity: 1 }}
          transition={animate ? { duration: 0.9, repeat: Infinity, delay: i * 0.14, ease: 'easeInOut' } : { duration: 0 }}
        />
      ))}
    </span>
  )
}

// --- The policies, in the order the engine asks them ---------------------------------------------

type PState = 'skel' | 'working' | 'applies' | 'passed' | 'off' | 'quiet' | 'also' | 'also-info'

function PolicyRow({
  p,
  state,
  first,
  also,
  landed,
  open,
  onToggle,
}: {
  p: EnginePolicy
  state: PState
  first: string
  also: PolicyConflict | null
  landed: boolean
  open: boolean
  onToggle: () => void
}) {
  const skel = state === 'skel'
  let said: ReactNode = null
  if (state === 'working') said = <Spinner small />
  else if (state === 'applies')
    said = (
      <span className="rl-chat__pstate is-applies">
        <Check size={14} strokeWidth={2.6} aria-hidden />
        {p.isGlobalDefault ? 'Applies · the fallback' : 'Applies'}
      </span>
    )
  else if (state === 'also' || state === 'also-info')
    said = (
      <span className={`rl-chat__pstate is-${state}`}>
        {state === 'also' && <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />}
        Also covers {first} · not used
      </span>
    )
  else if (state === 'passed' || state === 'off' || state === 'quiet') {
    const r = p.reason
    const words = / is not in (it|this policy)$/.test(r) || r === 'Not in this policy' ? `Doesn’t cover ${first}` : r || 'Not reached'
    said = <span className="rl-chat__pstate">{words}</span>
  }
  const why = [also?.why, p.tip].filter(Boolean)[0] ?? ''
  const head = (
    <>
      <span className="rl-chat__num">{p.order}</span>
      <span className="rl-chat__pname">
        <span className={skel ? 'is-hidden' : undefined}>{p.name}</span>
        {skel && <span className="rl-chat__skel" aria-hidden />}
      </span>
      <span className="rl-chat__pside">{said}</span>
      {landed && why && <ChevronDown className={`rl-chat__chev${open ? ' is-open' : ''}`} size={14} strokeWidth={2} aria-hidden />}
    </>
  )
  return (
    <li className={`rl-chat__prow is-${state}`} data-node={p.node} title={skel ? undefined : [p.name, p.reason, p.tip].filter(Boolean).join(' · ')}>
      {landed && why ? (
        <button type="button" className="rl-chat__phead" aria-expanded={open} onClick={onToggle}>
          {head}
        </button>
      ) : (
        <div className="rl-chat__phead">{head}</div>
      )}
      {landed && why && (
        <Grow open={open} animate>
          <p className="rl-chat__pwhy">{why}</p>
        </Grow>
      )}
    </li>
  )
}

// --- A rule, as a compact card ------------------------------------------------------------------

interface RowCtx {
  person: string
  groupsLine: string
}

/** The person's fact, apart from what the rule asks: "Maya Iyer · via Engineering", "Office network". */
function factOf(row: CheckRow, r: Pick<EngineRule, 'via'>, ctx: RowCtx): string {
  if (row.category === 'who') {
    if (row.status === 'pass' && r.via?.matches && r.via.say) return `${row.value} · ${r.via.say}`
    return ctx.groupsLine ? `${row.value} · in ${ctx.groupsLine}` : row.value
  }
  if (row.category === 'risk' && /^\d/.test(row.value)) return `Score ${row.value}`
  return row.value
}

function CheckLine({
  row,
  r,
  phase,
  ctx,
  animate,
  subs,
  onAdd,
}: {
  row: CheckRow
  r: Pick<EngineRule, 'via'>
  phase: 'working' | 'settled' | 'unread'
  ctx: RowCtx
  animate: boolean
  subs: boolean
  onAdd?: () => void
}) {
  const Icon = CATEGORY_ICON[row.category]
  const status = phase === 'settled' ? row.status : null
  const unstated = row.value === NOT_STATED_WORD
  return (
    <div className={`rl-chat__row${status ? ` is-${status}` : ` is-${phase}`}`} title={phase === 'settled' ? row.say || row.tip : undefined}>
      <div className="rl-chat__rmain">
        <Icon className="rl-chat__ricon" size={14} strokeWidth={2} aria-hidden />
        <span className="rl-chat__rword">{row.word}</span>
        <span className={`rl-chat__rfact${unstated ? ' is-unstated' : ''}`}>{phase === 'unread' ? 'Not read' : factOf(row, r, ctx)}</span>
        <span className="rl-chat__rneeds">
          <span className="rl-chat__rlabel">needs</span> {needsOf(row.requirement)}
        </span>
        {status === 'unknown' && row.missing && onAdd ? (
          <button type="button" className="rl-chat__add" onClick={onAdd} aria-label={`Add ${row.word.toLowerCase()}`}>
            Add
          </button>
        ) : (
          <span className="rl-chat__add is-none" />
        )}
        <span className="rl-chat__rmark">
          {phase === 'working' ? <Spinner small /> : status ? <Mark status={status} pop={animate} /> : null}
          {status && <span className="u-sr-only">{SAID[status]}</span>}
        </span>
      </div>
      {subs && status && row.subs.length > 0 && (
        <ul className="rl-chat__subs">
          {row.subs.map((x) => (
            <li key={x.key} className={`is-${x.status}`}>
              <span className="rl-chat__sfact">
                <span className="rl-chat__slabel">{x.label}</span> {x.actual || NOT_STATED_WORD}
              </span>
              <span className="rl-chat__rneeds">
                <span className="rl-chat__rlabel">needs</span> {needsOf(x.required)}
              </span>
              <span className="rl-chat__rmark">
                <Mark status={x.status} pop={false} size={12} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type CardTone = 'working' | 'match' | 'miss' | 'unknown' | 'off' | 'last' | 'quiet'

function RuleHead({ r, tone, open, miss = null }: { r: EngineRule; tone: CardTone; open: (() => void) | null; miss?: CheckRow | null }) {
  const last = r.index === null
  return (
    <div className="rl-chat__rhead">
      <span className="rl-chat__num">{last ? <Lock size={11} strokeWidth={2.4} aria-label="Last row" /> : (r.index ?? 0) + 1}</span>
      <span className="rl-chat__rname">{r.name}</span>
      {miss ? (
        <span className="rl-chat__misstag" title={miss.say}>
          <X size={13} strokeWidth={2.6} aria-hidden />
          {miss.word}
          <span className="u-sr-only"> failed</span>
        </span>
      ) : (
      <span className="rl-chat__then">
        {tone === 'off' ? 'Switched off' : (
          <>
            <span className="rl-chat__rlabel">then</span> {DECISION_WORDS[r.decision]}
          </>
        )}
      </span>
      )}
      <span className="rl-chat__go-slot">
        {open && (
          <button type="button" className="rl-chat__go" aria-label={last ? 'Open the policy' : `Open rule ${(r.index ?? 0) + 1}`} onClick={open}>
            <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </span>
    </div>
  )
}

/** A rule as the engine reads it at step `s`: rows grow in as they are read; a miss folds to the row that failed. */
function LiveRule({ r, s, ctx, animate, landed, dur, onOpen, onAdd }: { r: EngineRule; s: number; ctx: RowCtx; animate: boolean; landed: boolean; dur: number; onOpen: (() => void) | null; onAdd: (f: FormField) => void }) {
  const res = traceResult(r, s)
  const tone: CardTone =
    r.index === null ? (res === 'reading' ? 'working' : 'last') : res === 'reading' ? 'working' : res === 'matched' ? 'match' : res === 'missed' || res === 'folded' ? 'miss' : res === 'unknown' || res === 'possible' ? 'unknown' : res === 'off' ? 'off' : 'quiet'
  /* A rule that missed folds, as the engine leaves it, to one line: its head and the check that failed. */
  const folded = ruleFolded(r, s) && r.state === 'no-match'
  const read = r.checks.slice(0, r.checked)
  const miss = folded && r.failing !== null ? (r.checks[r.failing] ?? null) : null
  return (
    <div className={`rl-chat__card rl-chat__rule is-${tone}${folded ? ' is-folded' : ''}${r.decision === 'deny' ? ' is-deny' : ''}`}>
      <RuleHead r={r} tone={tone} open={landed ? onOpen : null} miss={miss} />
      {read.length > 0 && (
        <div className={`rl-chat__rows${folded ? ' is-folded' : ''}`}>
          {read.map((row, k) => {
            const ph = checkPhase(r, k, s)
            const shown = ph !== 'hidden' && !folded
            return (
              <Grow key={row.key} open={shown} animate={animate} dur={dur}>
                <CheckLine
                  row={row}
                  r={r}
                  phase={ph === 'working' ? 'working' : 'settled'}
                  ctx={ctx}
                  animate={animate}
                  subs={false}
                  onAdd={row.missing ? () => onAdd(row.missing as FormField) : undefined}
                />
              </Grow>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** A rule drawn whole, for an answer: every row, read or not, with its sub-checks. */
function FullRule({ r, rows, ctx, onOpen, onAdd, unreadFrom }: { r: EngineRule; rows: CheckRow[]; ctx: RowCtx; onOpen: (() => void) | null; onAdd: (f: FormField) => void; unreadFrom: number }) {
  const tone: CardTone = r.state === 'match' ? 'match' : r.state === 'no-match' ? 'miss' : r.state === 'unknown' || r.state === 'possible' ? 'unknown' : 'quiet'
  return (
    <div className={`rl-chat__card rl-chat__rule is-${tone} is-full${r.decision === 'deny' ? ' is-deny' : ''}`}>
      <RuleHead r={r} tone={tone} open={onOpen} />
      {rows.length > 0 && (
        <div className="rl-chat__rows">
          {rows.map((row, k) => (
            <CheckLine
              key={row.key}
              row={row}
              r={r}
              phase={k >= unreadFrom ? 'unread' : 'settled'}
              ctx={ctx}
              animate={false}
              subs
              onAdd={row.missing ? () => onAdd(row.missing as FormField) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// --- The stages rail ------------------------------------------------------------------------------

type StageId = 'signin' | 'policies' | 'rules' | 'outcome'
const STAGES: readonly { id: StageId; label: string }[] = [
  { id: 'signin', label: 'Sign-in' },
  { id: 'policies', label: 'Policies' },
  { id: 'rules', label: 'Rules' },
  { id: 'outcome', label: 'Outcome' },
]
type StagePhase = 'waiting' | 'working' | 'done'

function Rail({
  ys,
  phases,
  tone,
  animate,
  onGo,
}: {
  ys: Record<StageId, number>
  phases: Record<StageId, StagePhase>
  tone: Tone
  animate: boolean
  onGo: (id: StageId) => void
}) {
  const top = ys.signin
  const bottom = ys.outcome
  /* The line fills to the stage the engine is on (or the last one done). */
  let reach = top
  for (const st of STAGES) if (phases[st.id] !== 'waiting') reach = ys[st.id]
  const glide = animate ? { type: 'spring' as const, stiffness: 260, damping: 34 } : { duration: 0 }
  return (
    <nav className="rl-chat__rail" aria-label="Stages">
      <motion.span className="rl-chat__rline" initial={false} animate={{ top, height: Math.max(0, bottom - top) }} transition={glide} aria-hidden />
      <motion.span className="rl-chat__rfill" initial={false} animate={{ top, height: Math.max(0, reach - top) }} transition={glide} aria-hidden />
      {STAGES.map((st) => {
        const ph = phases[st.id]
        const out = st.id === 'outcome' && ph === 'done'
        const OutIcon = tone === 'negative' ? X : tone === 'notice' ? Split : Check
        return (
          <motion.button
            key={st.id}
            type="button"
            className={`rl-chat__stage is-${ph}${out ? ` is-${tone}` : ''}`}
            initial={false}
            animate={{ top: ys[st.id] }}
            transition={glide}
            disabled={ph === 'waiting'}
            aria-label={`${st.label}${ph === 'working' ? ', working' : ph === 'done' ? ', done' : ''}`}
            onClick={() => onGo(st.id)}
          >
            <span className="rl-chat__slabel2">{st.label}</span>
            <span className="rl-chat__sdot" aria-hidden>
              {ph === 'working' ? <Spinner small /> : ph === 'done' ? out ? <OutIcon size={12} strokeWidth={2.8} /> : <Check size={11} strokeWidth={2.8} /> : null}
            </span>
          </motion.button>
        )
      })}
    </nav>
  )
}

// --- The questions the admin can ask, once it lands ------------------------------------------------

type ChipId = 'whynot' | 'also' | 'others' | 'see' | 'checks' | 'groups' | 'depends'

/** Which question a finding is the answer to. */
const FINDING_CHIP: Record<string, ChipId> = {
  'rule-conflict': 'also',
  'named-later': 'also',
  'deny-first': 'also',
  'also-matches': 'also',
  exception: 'whynot',
  'policy-conflict': 'others',
  'same-group-policy': 'others',
  'group-policy-first': 'others',
  'not-covered': 'others',
  'off-would-change': 'others',
  'off-no-change': 'others',
  depends: 'depends',
}

// --- The layout ------------------------------------------------------------------------------

/** The room the host keeps: the engine line over the canvas, the dock under it. */
const PAD = { top: 64, right: 48, bottom: 76, left: 48 }
/** The least zoom a landed run fits at: the 13 px floor stays at 12 px. */
const FIT_MIN = 0.92
/** A room shorter than this (a 1280 × 800 window) sets the thread tighter from the start, so a landed run still fits with the words at size. */
const DENSE_ROOM = 640

export default function ChatLayout(props: RunLayoutProps) {
  const stage = useRef<StageView | null>(null)
  return (
    <RunStage ref={stage} reduced={props.reduced} pad={PAD} className="rl-chat" label="Sign-in run, as a conversation">
      <Thread key={props.runKey} {...props} stage={stage} />
    </RunStage>
  )
}

function Thread(props: RunLayoutProps & { stage: RefObject<StageView | null> }) {
  const { plan, s, running, animate, reduced, jumped, runKey, form, rows: rowsRead, asGroup, screens, expected, weaker, changed, onPressPerson, onOpenPolicy, onOpenRule, onAdd, onAsGroup, stage } = props
  const brand = useBrand()
  const { users, groups, apps, zones } = brand
  const tenant = props.policies ?? brand.policies
  const worldRef = useRef<HTMLDivElement | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)

  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id
  const who = person ? firstName(person.name) : asGroup ? `anyone in ${asGroup}` : 'them'
  const appName = plan.appName || app?.name || 'the application'
  const tone = toneOf(plan)
  const groupsLine = person ? groupNamesOf(person, groups).join(', ') : ''
  const rowCtx: RowCtx = { person: person?.name ?? '', groupsLine }

  // --- Where the run is ---

  const steps = plan.steps
  const at = plan.at
  const landed = at.outcome >= 0 ? s >= at.outcome : !running
  const settled = landed && (!running || s >= at.done)
  const decidingAt = steps.findIndex((st) => st.kind === 'deciding')
  const firstScan = steps.findIndex((st) => st.kind === 'scan')
  const listAt = firstScan >= 0 ? firstScan : at.found >= 0 ? at.found : at.which >= 0 ? at.which + 1 : -1
  const reach = (k: number) => k >= 0 && s >= k
  const active = running && !landed ? activeNode(plan, s) : null
  const deciderIdx = plan.policies.findIndex((p) => p.decides)
  const decider = deciderIdx >= 0 ? plan.policies[deciderIdx] : undefined
  const deciderPolicy = decider ? tenant.find((p) => p.id === decider.policyId) : undefined
  const landing = plan.landing !== null ? (plan.rules[plan.landing] ?? null) : null
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null

  /* The rules the engine walks into, in order: each its own message. */
  const walked = plan.rules.filter((r) => r.startAt >= 0 && (r.visited || r.state === 'off' || r === landing) && r.state !== 'not-reached')
  const firstRuleAt = walked[0]?.startAt ?? -1

  /* Who else covers the person: the conflicts amber, the rest grey (the tree's reading). */
  const alsoById = useMemo(() => {
    const c = plan.conflicts
    const conflictIds = new Set((c?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId))
    const m = new Map<string, { c: PolicyConflict; conflict: boolean }>()
    for (const x of c?.policies ?? []) m.set(x.policyId, { c: x, conflict: conflictIds.has(x.policyId) })
    return m
  }, [plan])

  const policyState = (p: EnginePolicy): PState => {
    const ph = policyPhase(p, s)
    if (ph === 'waiting') return 'skel'
    if (ph === 'working' && (active === null || active === p.node)) return 'working'
    if (ph === 'working') return p.decides ? 'working' : p.scanned ? 'passed' : 'quiet'
    if (p.decides) return 'applies'
    const a = landed ? alsoById.get(p.policyId) : undefined
    if (a) return a.conflict ? 'also' : 'also-info'
    if (p.kind === 'waiting' || p.kind === 'elsewhere') return 'off'
    return p.scanned ? 'passed' : 'quiet'
  }
  /* The policies never asked fold into one line once the one that covers is found — all but one that also covers the person. */
  const foldable = (p: EnginePolicy) => !p.decides && !p.scanned && !alsoById.has(p.policyId)
  const foldAt = at.decides >= 0 ? at.decides : -1
  const [showAllPolicies, setShowAllPolicies] = useState(false)
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({})
  /* The admin has opened or asked something: the view is theirs now, nothing refits by itself. */
  const touched = useRef(false)

  // --- What the engine says ---

  const n = plan.policies.length
  const onlyDefault = n === 1 && plan.policies[0]?.isGlobalDefault
  const intro = onlyDefault
    ? `${appName} has no policy of its own — the Global Default applies.`
    : n === 1
      ? `1 policy on ${appName}. If it covers ${who}, it applies.`
      : `${n} policies on ${appName} — the first that covers ${who} applies.`
  let cover: ReactNode = null
  if (decider && !onlyDefault) {
    if (decider.isGlobalDefault) {
      const before = plan.policies.filter((p) => p.scanned && !p.decides).length
      cover = before > 0 ? <>{before === 1 ? 'It doesn’t' : `None of the ${before}`} cover{before === 1 ? 's' : ''} {who}, so the <strong>Global Default</strong> applies.</> : <>The <strong>Global Default</strong> applies.</>
    } else {
      const via = coverOf(deciderPolicy, person, groupName)
      cover = (
        <>
          <strong>{decider.name}</strong> covers {who}
          {via ? ` — ${via}` : ''}.
        </>
      )
    }
  }

  const ruleWords = (r: EngineRule): ReactNode => {
    const num = (r.index ?? 0) + 1
    if (r.index === null) return r.state === 'possible' ? <>If none of those fit, “{FALLBACK_NAME}” decides.</> : <>No rule fits, so “{FALLBACK_NAME}” decides.</>
    if (r.state === 'off') return <>Rule {num} is switched off — skipped.</>
    if (r.state === 'match') return <>Rule {num} fits — the first match decides.</>
    if (r.state === 'unknown') {
      const u = r.checks.slice(0, r.checked).find((c) => c.status === 'unknown')
      return <>Can’t tell if rule {num} fits{u ? ` — ${trimDot(u.line)}` : ''}. The engine reads on.</>
    }
    const f = r.failing !== null ? r.checks[r.failing] : undefined
    return <>Rule {num} doesn’t fit{f ? ` — ${trimDot(f.line)}` : ''}.</>
  }

  const ruleConflict: RuleConflict | null = plan.conflicts?.conflicts[0] ?? null
  const notice = decidingAt >= 0 && steps[decidingAt]?.notice === true
  const noticeWords = ruleConflict
    ? `Rule ${ruleConflict.number} also fits ${who}${ruleConflict.via.say ? ` — ${ruleConflict.via.say}` : ''} — but rule ${plan.conflicts?.landing?.number ?? (landing?.index ?? 0) + 1} comes first.`
    : steps[decidingAt]?.text ?? ''

  // --- The answer ---

  const Icon = decided ? DECISION_ICON[decided] : o.status === 'depends' ? Split : CircleHelp
  const needs = o.view.needs
  const verdict = decided
    ? VERDICT[decided]
    : o.status === 'depends'
      ? `It depends${needs.length > 0 ? ` on the ${needs.join(' and ').toLowerCase()}` : ''}.`
      : plan.empty
        ? 'Choose a person and an application, then Run.'
        : `${o.view.line || 'No policy decides'}.`
  const byRule = o.ruleLine ? o.ruleLine.split(' · ')[0] : ''
  const openDecider = () => {
    if (!o.policyId) return
    if (landing && landing.index !== null) onOpenRule(o.policyId, landing.id)
    else onOpenPolicy(o.policyId)
  }
  const chain = chainOf(screens, decided)
  const mark = expectMark(decided, expected, weaker)
  const finding = heroFinding(plan)
  const firstFinding = plan.conflicts?.findings.find((f) => f.line && (f.line === finding?.text || plan.conflicts?.headline === finding?.text)) ?? plan.conflicts?.findings[0]

  // --- The questions there are answers to ---

  const missed = plan.rules.filter((r) => r.index !== null && r.visited && r.state === 'no-match' && (plan.landing === null || plan.rules.indexOf(r) < plan.landing))
  const others = plan.policies.filter((p) => !p.decides)
  const covering = plan.conflicts?.policies ?? []
  const groupRows = eachGroupRows(plan)
  const alsoRules = plan.conflicts?.rules ?? []
  const chips: { id: ChipId; label: string }[] = []
  if (!plan.empty && decider) {
    if (o.status === 'depends' && plan.conflicts?.depends) chips.push({ id: 'depends', label: 'Why does it depend?' })
    if (missed.length > 0) chips.push({ id: 'whynot', label: missed.length === 1 ? `Why not rule ${(missed[0].index ?? 0) + 1}?` : `Why not rules ${listed(missed.map((r) => (r.index ?? 0) + 1))}?` })
    if (alsoRules.length > 0) chips.push({ id: 'also', label: `Does another rule fit ${who}?` })
    if (covering.length > 0) chips.push({ id: 'others', label: `Who else covers ${who}?` })
    else if (decider.isGlobalDefault && others.length > 0) chips.push({ id: 'others', label: 'Why the Global Default?' })
    else if (others.length > 0) chips.push({ id: 'others', label: 'What about the other policies?' })
    if (screens.length > 0 && form.appId) chips.push({ id: 'see', label: `What will ${who} see?` })
    if (landing && landing.index !== null && landing.checks.length > 0) chips.push({ id: 'checks', label: 'Every check' })
    if (groupRows && person) chips.push({ id: 'groups', label: `${capital(who)} in one group?` })
  }
  const chipIds = new Set(chips.map((c) => c.id))
  const [asked, setAsked] = useState<ChipId[]>([])
  const [pending, setPending] = useState<ChipId | null>(null)
  const pendingTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current)
  }, [])
  const ask = (id: ChipId) => {
    if (asked.includes(id) || !chipIds.has(id)) return
    touched.current = true
    setAsked((a) => [...a, id])
    if (reduced) return
    /* A short typing beat before the answer: decorative, it moves nothing of the run. */
    setPending(id)
    if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current)
    pendingTimer.current = window.setTimeout(() => {
      pendingTimer.current = null
      setPending(null)
    }, 520)
  }
  const findingChip = firstFinding ? FINDING_CHIP[firstFinding.kind] : undefined
  const findingAsk = findingChip && chipIds.has(findingChip) && !asked.includes(findingChip) ? findingChip : null

  // --- The answers, composed from the plan ---

  const openRuleOf = (r: EngineRule): (() => void) | null => {
    const pid = decider?.policyId
    if (!pid) return null
    return r.index !== null ? () => onOpenRule(pid, r.id) : () => onOpenPolicy(pid)
  }

  const answerOf = (id: ChipId): { said: ReactNode; body: ReactNode } => {
    switch (id) {
      case 'whynot':
        return {
          said:
            missed.length === 1 ? (
              <>Rule {(missed[0].index ?? 0) + 1} stops at its first ✕ — the rows after it are never read.</>
            ) : (
              <>Each stops at its first ✕ — the rows after it are never read.</>
            ),
          body: (
            <div className="rl-chat__stack">
              {missed.map((r) => (
                <FullRule key={r.id} r={r} rows={r.checks} ctx={rowCtx} onOpen={openRuleOf(r)} onAdd={onAdd} unreadFrom={r.shortCircuit ? r.checked : r.checks.length} />
              ))}
            </div>
          ),
        }
      case 'also': {
        const first = alsoRules[0]
        return {
          said: first ? (
            <>
              {alsoRules.length === 1 ? `Rule ${first.number} also fits ${who}` : `Rules ${listed(alsoRules.map((x) => x.number))} also fit ${who}`} — but the first match decides.
            </>
          ) : null,
          body: (
            <div className="rl-chat__stack">
              {alsoRules.map((c) => {
                const r = plan.rules.find((x) => x.id === c.ruleId)
                return (
                  <div key={c.ruleId} className="rl-chat__stack">
                    {r && <FullRule r={r} rows={r.alsoChecks ?? r.checks} ctx={rowCtx} onOpen={openRuleOf(r)} onAdd={onAdd} unreadFrom={Infinity} />}
                    <p className={`rl-chat__note${c.kind === 'conflict' ? ' is-notice' : ''}`}>
                      {c.kind === 'conflict' && <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />}
                      <span>
                        {c.via.say ? `${capital(c.via.say)} · ` : ''}
                        {c.notUsed}
                        {c.fix ? `. ${c.fix}.` : '.'}
                      </span>
                    </p>
                  </div>
                )
              })}
            </div>
          ),
        }
      }
      case 'others': {
        const c = plan.conflicts
        const said =
          covering.length > 0 ? (
            <>
              {covering.length === 1 ? <strong>{covering[0].policyName}</strong> : `${covering.length} more policies`} also cover{covering.length === 1 ? 's' : ''} {who} — only the first that covers applies.
            </>
          ) : decider?.isGlobalDefault ? (
            <>{c?.headline ? `${trimDot(c.headline)}.` : `No ${appName} policy covers ${who}.`}</>
          ) : (
            <>No other live policy on {appName} covers {who}.</>
          )
        return {
          said,
          body: (
            <ul className="rl-chat__card rl-chat__list">
              {others.map((p) => {
                const pc = covering.find((x) => x.policyId === p.policyId)
                const off = c?.off.find((x) => x.policyId === p.policyId)
                const miss = c?.missedBy.find((x) => x.policyId === p.policyId)
                const conflict = pc ? alsoById.get(p.policyId)?.conflict === true : false
                const would = pc ? (pc.status === 'decided' && pc.decision ? DECISION_WORDS[pc.decision] : decisionsOr(pc.possible) || 'Can’t tell') : ''
                const head = pc
                  ? `Covers ${who} ${pc.via.say || ''} · would be ${would}${pc.ruleNumber !== null ? ` (rule ${pc.ruleNumber})` : ''}`.replace(/\s+·/, ' ·')
                  : off
                    ? off.say
                    : miss
                      ? `${miss.say} — not ${who}`
                      : p.reason || 'Not reached'
                const detail = pc ? [pc.why ? `${trimDot(pc.why)}.` : '', pc.fix ? `${trimDot(pc.fix)}.` : ''].filter(Boolean).join(' ') : p.tip
                return (
                  <li key={p.policyId} className={`rl-chat__lrow${conflict ? ' is-notice' : ''}`}>
                    <span className="rl-chat__num">{p.order}</span>
                    <span className="rl-chat__ltext">
                      <span className="rl-chat__lname">{p.name}</span>
                      <span className="rl-chat__lhead">
                        {conflict && <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />}
                        {head}
                      </span>
                      {detail && <span className="rl-chat__ldetail">{detail}</span>}
                    </span>
                    <button type="button" className="rl-chat__go is-shown" aria-label={`Open ${p.name}`} onClick={() => onOpenPolicy(p.policyId)}>
                      <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          ),
        }
      }
      case 'see': {
        const list = decided ? screens.filter((x) => x.decision === decided).slice(0, 1) : screens
        const shownList = list.length > 0 ? list : screens.slice(0, 1)
        return {
          said: decided ? <>{askOf(screens, decided) || 'Here is what they get'}.</> : <>One run of pages for each answer it could be.</>,
          body: (
            <div className="rl-chat__stack">
              {shownList.map((sc) => (
                <div key={`${sc.decision}:${sc.ruleName}`} className="rl-chat__card rl-chat__see">
                  {shownList.length > 1 && <p className="rl-chat__seehead">{DECISION_WORDS[sc.decision]} · {sc.ruleName}</p>}
                  <ol className="rl-chat__seesteps">
                    {sc.steps.map((st, i) => (
                      <li key={i}>
                        <span className="rl-chat__num">{i + 1}</span>
                        {st.kind === 'password' ? (
                          <span>
                            Password <span className="rl-chat__muted">· {st.username}</span>
                          </span>
                        ) : st.kind === 'first-method' ? (
                          <span>{st.method}</span>
                        ) : st.kind === 'second' ? (
                          <span>
                            {st.name}
                            {st.masked ? <span className="rl-chat__muted"> · {st.masked}</span> : null}
                            {!st.method && <span className="rl-chat__warn"> · nobody can be offered it</span>}
                          </span>
                        ) : (
                          <span className="rl-chat__deny">Blocked · “{st.message}”</span>
                        )}
                      </li>
                    ))}
                    {!sc.steps.some((st) => st.kind === 'deny') && (
                      <li>
                        <span className="rl-chat__num is-positive">
                          <Check size={11} strokeWidth={2.8} aria-hidden />
                        </span>
                        <span>Signed in to {appName}</span>
                      </li>
                    )}
                  </ol>
                </div>
              ))}
            </div>
          ),
        }
      }
      case 'checks': {
        const r = landing as EngineRule
        const read = r.checks.slice(0, r.checked)
        const passed = read.filter((c) => c.status === 'pass').length
        return {
          said: (
            <>
              Rule {(r.index ?? 0) + 1} read {plural(read.length, 'condition', 'conditions')}
              {passed === read.length ? (read.length === 1 ? ' — it passed.' : ' — all passed.') : ` — ${passed} passed.`}
            </>
          ),
          body: <FullRule r={r} rows={r.checks} ctx={rowCtx} onOpen={openRuleOf(r)} onAdd={onAdd} unreadFrom={r.checked} />,
        }
      }
      case 'groups': {
        const groupOnly = (groupRows ?? []).filter((row) => !row.current)
        const same = new Set(groupOnly.map((row) => row.words)).size <= 1
        return {
          said: <>{same ? `In any one group alone, ${who} gets the same answer.` : `Alone, each group gets a different answer.`}</>,
          body: (
            <ul className="rl-chat__card rl-chat__list">
              {(groupRows ?? []).map((row) => {
                const t: Tone = row.status === 'decided' && row.decision ? (row.decision === 'deny' ? 'negative' : 'positive') : row.status === 'depends' ? 'notice' : 'neutral'
                return (
                  <li key={row.key} className={`rl-chat__lrow${row.current ? ' is-current' : ''}`}>
                    <span className="rl-chat__ltext">
                      <span className="rl-chat__lname">{row.label}</span>
                      <span className="rl-chat__ldetail">{row.source}</span>
                    </span>
                    <span className={`rl-chat__decision is-${t}`}>{row.words}</span>
                    {row.groupId && onAsGroup ? (
                      <button type="button" className="rl-chat__run" onClick={() => onAsGroup(row.groupId as string)}>
                        Run
                      </button>
                    ) : (
                      <span className="rl-chat__run is-none">{row.current ? 'This run' : ''}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          ),
        }
      }
      case 'depends': {
        const d = plan.conflicts?.depends
        const fields = [...new Set((d?.facts ?? []).map((f) => FACT_FIELD[f]).filter(Boolean))]
        return {
          said: <>{d?.say ? `${trimDot(d.say)}.` : 'It depends on a fact that is not stated.'}</>,
          body: (
            <div className="rl-chat__card rl-chat__ifs">
              <ul>
                {(d?.outcomes ?? []).map((x, i) => (
                  <li key={`${x.decision}:${i}`}>
                    <span>{x.ruleNumber !== null ? `If rule ${x.ruleNumber} matches` : 'If not'}</span>
                    <strong className={`rl-chat__decision is-${x.decision === 'deny' ? 'negative' : 'positive'}`}>{x.words || DECISION_WORDS[x.decision]}</strong>
                  </li>
                ))}
              </ul>
              {fields.length > 0 && (
                <div className="rl-chat__ifadd">
                  {d?.fix && <span>{trimDot(d.fix)}.</span>}
                  {fields.map((f, i) => (
                    <button key={f} type="button" className="rl-chat__add" onClick={() => onAdd(f)}>
                      Add {(d?.factWords[i] ?? f).toLowerCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        }
      }
    }
  }

  // --- Measuring: the rail's markers, the landing's lift, the room ---

  const [ys, setYs] = useState<Record<StageId, number>>({ signin: 16, policies: 56, rules: 96, outcome: 136 })
  const [lift, setLift] = useState(0)
  const [room, setRoom] = useState(0)
  const [paneUp, setPaneUp] = useState(true)
  /* Tighter spacing (never smaller words) when the room is short, or when a landed run would not fit otherwise. */
  const [tight, setTight] = useState(false)
  /* Landed and taller than the room even so: the end is in view, so the answer names who signs in to what itself. */
  const [over, setOver] = useState(false)
  const dense = tight || (room > 0 && room < DENSE_ROOM)
  const pendingFit = useRef<{ jump: boolean } | null>({ jump: true })
  const fittedH = useRef<number | null>(null)
  const wasLanded = useRef(landed)
  if (wasLanded.current !== landed) {
    wasLanded.current = landed
    if (landed) pendingFit.current = { jump: reduced || jumped }
  }

  /* The room between the engine line and the dock, unzoomed: the thread stands at its top while it plays. */
  useEffect(() => {
    const sc = worldRef.current?.closest<HTMLElement>('.rstage__scroll')
    if (!sc) return
    const measure = () => setRoom(Math.max(0, sc.clientHeight - PAD.top - PAD.bottom))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(sc)
    return () => ro.disconnect()
  }, [])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = threadRef.current
    if (!t || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setTick((k) => k + 1))
    ro.observe(t)
    return () => ro.disconnect()
  }, [])
  void tick

  // eslint-disable-next-line react-hooks/exhaustive-deps -- every render measures; each setState is guarded by a change
  useLayoutEffect(() => {
    const t = threadRef.current
    if (!t) return
    /* The rail: each stage at its first message; a stage not reached yet waits just under the thread. */
    const tail = t.offsetHeight
    const next = {} as Record<StageId, number>
    let k = 0
    for (const st of STAGES) {
      const el = t.querySelector<HTMLElement>(`[data-stage="${st.id}"]`)
      if (el) next[st.id] = Math.round(offsetIn(el, t).y + 14)
      else next[st.id] = tail + 18 + 30 * k++
    }
    if (STAGES.some((st) => Math.abs(next[st.id] - ys[st.id]) > 0.5)) setYs(next)
    /* What they see, beside the answer: hung from its bottom when there is room above, else from its top. */
    const out = t.querySelector<HTMLElement>('[data-node="outcome"]')
    const pane = t.querySelector<HTMLElement>('.rl-chat__pane')
    if (out && pane) {
      const up = out.offsetTop + out.offsetHeight - pane.offsetHeight >= 0
      if (up !== paneUp) setPaneUp(up)
    }
    /* Landed: the conversation settles into the middle of the room — by `top`, so the world's size never carries it. */
    const h = Math.max(tail, out && pane ? out.offsetTop + (paneUp ? out.offsetHeight : pane.offsetHeight) : 0)
    const want = landed && room > 0 ? Math.max(0, Math.round((room - h) / 2)) : 0
    /* Once the admin opens or asks something, the thread stays where it stands and grows downward. */
    if (!touched.current && Math.abs(want - lift) > 1) setLift(want)
    /* Laid out: the view may move now. */
    /* A landed thread that changes size by itself (a font arriving, What they see drawing) fits again, until the admin asks something. */
    if (landed && !touched.current && fittedH.current !== null && Math.abs(h - fittedH.current) > 4 && !pendingFit.current) pendingFit.current = { jump: true }
    const st = stage.current
    if (pendingFit.current && room > 0 && st) {
      /* Too tall at the least zoom: tighten first (the next render measures again). */
      if (landed && !dense && h * FIT_MIN > room) {
        setTight(true)
        return
      }
      const tooTall = landed && h * FIT_MIN > room
      if (tooTall !== over) {
        setOver(tooTall)
        return
      }
      fittedH.current = landed ? h : null
      const opts = pendingFit.current
      pendingFit.current = null
      if (tooTall) {
        /* Still too tall with the words at size: the thread's end in view — the answer, who it is for, and what to ask. */
        st.follow(t.querySelector('[data-tail]'), { lazy: false, y: 0.98, jump: opts.jump || reduced })
      } else st.fit({ max: 1, min: FIT_MIN, jump: opts.jump || reduced })
    }
  })

  /* While it plays, the camera keeps the newest message in view. */
  useEffect(() => {
    if (!animate) return
    const el = threadRef.current?.querySelector('[data-tail]')
    if (el) stage.current?.follow(el, { lazy: true, y: 0.86 })
  }, [animate, s, stage])

  /* An answer arriving: brought into view. */
  const lastAsked = asked.at(-1) ?? null
  useEffect(() => {
    if (!lastAsked || pending) return
    const el = threadRef.current?.querySelector(`[data-answer="${lastAsked}"]`)
    if (el) stage.current?.follow(el, { lazy: true, y: 0.62, jump: reduced })
  }, [lastAsked, pending, reduced, stage])

  const goStage = (id: StageId) => {
    const el = threadRef.current?.querySelector(`[data-stage="${id}"]`)
    if (el) stage.current?.follow(el, { lazy: false, y: 0.35, jump: reduced })
  }

  // --- The stages' phases ---

  const phases: Record<StageId, StagePhase> = {
    signin: 'done',
    policies: at.which < 0 || s < at.which ? 'waiting' : at.decides >= 0 && s >= at.decides ? 'done' : landed ? 'done' : 'working',
    rules: firstRuleAt < 0 || s < (at.expand >= 0 ? at.expand : firstRuleAt) ? 'waiting' : (decidingAt >= 0 && s >= decidingAt) || landed ? 'done' : 'working',
    outcome: landed ? 'done' : decidingAt >= 0 && s >= decidingAt ? 'working' : 'waiting',
  }
  if (!running && !landed) phases.policies = phases.rules = 'waiting'

  // --- The sign-in, as the admin's message ---

  const ctx: SentenceContext = { people: users, apps, zones, rows: rowsRead }
  const facts = sentenceTokens(rowsRead)
    .filter((t) => t !== 'person' && t !== 'app')
    .map((t) => tokenValue(t, form, ctx))
    .filter((v) => !v.unset || o.status === 'depends')

  // --- What is on screen ---

  const typingFor =
    !animate
      ? null
      : at.which >= 0 && s >= at.which && !reach(listAt)
        ? 'policies'
        : at.expand >= 0 && s >= at.expand && !reach(firstRuleAt)
          ? 'rules'
          : decidingAt >= 0 && s >= decidingAt && !landed
            ? 'outcome'
            : null
  const working = running && !landed
  /* The step's own length: what grows in plays in time with the engine line. */
  const beat = Math.min(0.32, Math.max(0.12, stepMs(plan, s) / 1000))

  const listShown = reach(listAt)
  const coverShown = cover !== null && reach(at.decides)
  const outcomeShown = landed && (at.outcome >= 0 || plan.empty || !running)
  const see = screens.length > 0 && form.appId !== null && (decided !== null || o.status === 'depends')

  return (
    <div ref={worldRef} className={`rl-chat__world is-${tone}${landed ? ' is-landed' : ''}${dense ? ' is-dense' : ''}`} style={{ minHeight: room || undefined }}>
      <motion.div className="rl-chat__body" initial={false} animate={{ top: lift }} transition={animate || landed ? { type: 'spring', stiffness: 200, damping: 30 } : { duration: 0 }}>
        <Rail ys={ys} phases={phases} tone={tone} animate={animate || settled} onGo={goStage} />
        <div ref={threadRef} className="rl-chat__thread" role="log" aria-label={`${person?.name ?? 'Sign-in'} to ${appName}`}>
          {/* The admin's side: the sign-in, as one sentence. */}
          <Msg side="you" node="sign-in" stage="signin" animate={false}>
            <button type="button" className="rl-chat__you" onClick={onPressPerson} aria-label={`Change the sign-in: ${person?.name ?? 'nobody'} to ${app?.name ?? 'no application'}`}>
              <span className="rl-chat__tok">
                {person ? <Face kind="user" name={person.name} size="sm" decorative /> : <Users size={14} strokeWidth={2} aria-hidden />}
                <strong>{person?.name ?? (asGroup ? `A member of ${asGroup}` : 'Choose a person')}</strong>
                {(asGroup || groupsLine) && <span className="rl-chat__muted">{asGroup ? `tested as a member of ${asGroup}` : groupsLine}</span>}
              </span>
              <span className="rl-chat__tok">
                <ArrowRight className="rl-chat__muted" size={14} strokeWidth={2} aria-hidden />
                {app && <AppLogo appId={app.id} name={app.name} size={16} />}
                <strong>{app?.name ?? 'Choose an application'}</strong>
              </span>
              {facts.map((v) => (
                <span key={v.token} className={`rl-chat__tok${v.unset ? ' is-unset' : ''}`}>
                  <span className="rl-chat__muted">{CONNECTOR[v.token]}</span>
                  <span className="rl-chat__tmark" aria-hidden>
                    {v.unset ? <CircleHelp size={14} strokeWidth={2} /> : <ValueMark v={v} size={14} />}
                  </span>
                  <span className="u-sr-only">{v.label}: </span>
                  <span>{v.unset ? `${v.label} not stated` : v.token === 'risk' ? `risk score ${v.text}` : v.text}</span>
                </span>
              ))}
            </button>
          </Msg>

          {/* The policies on the application, in the order the engine asks them. */}
          {listShown && (
            <Msg side="engine" node="which" stage="policies" avatar working={working} animate={animate}>
              <p className="rl-chat__said">{intro}</p>
              {!onlyDefault || n > 0 ? (
                <ul className="rl-chat__card rl-chat__plist">
                  {plan.policies.map((p) => {
                    const folded = !showAllPolicies && reach(foldAt) && foldable(p)
                    return (
                      <Grow key={p.policyId} open={!folded} animate={animate || landed} dur={0.3} className="rl-chat__pslot">
                        <PolicyRow
                          p={p}
                          state={policyState(p)}
                          first={who}
                          also={alsoById.get(p.policyId)?.c ?? null}
                          landed={settled}
                          open={openRows[p.policyId] === true}
                          onToggle={() => {
                            touched.current = true
                            setOpenRows((m) => ({ ...m, [p.policyId]: !m[p.policyId] }))
                          }}
                        />
                      </Grow>
                    )
                  })}
                  {(() => {
                    const k = plan.policies.filter(foldable).length
                    if (k === 0) return null
                    return (
                      <Grow open={reach(foldAt)} animate={animate} dur={0.3} className="rl-chat__pslot">
                        <li className="rl-chat__prow is-more">
                          <button type="button" className="rl-chat__phead" aria-expanded={showAllPolicies} onClick={() => {
                              touched.current = true
                              setShowAllPolicies((v) => !v)
                            }}>
                            <span className="rl-chat__num is-more">{showAllPolicies ? '−' : `+${k}`}</span>
                            <span className="rl-chat__pname">{showAllPolicies ? 'Fold the ones not asked' : 'Not reached — the first that covers applies'}</span>
                            <ChevronDown className={`rl-chat__chev${showAllPolicies ? ' is-open' : ''}`} size={14} strokeWidth={2} aria-hidden />
                          </button>
                        </li>
                      </Grow>
                    )
                  })()}
                </ul>
              ) : null}
              {cover !== null && (
                <Grow open={coverShown} animate={animate} dur={0.24}>
                  <p className="rl-chat__said is-after">{cover}</p>
                </Grow>
              )}
            </Msg>
          )}
          {typingFor === 'policies' && (
            <Msg side="engine" avatar working animate={animate}>
              <Typing animate={animate} />
            </Msg>
          )}

          {/* A message per rule the engine reads, in the policy's order. */}
          {typingFor === 'rules' && (
            <Msg side="engine" animate={animate}>
              <Typing animate={animate} />
            </Msg>
          )}
          {walked.map((r, i) => {
            if (!reach(r.startAt)) return null
            const done = s >= r.endAt && traceResult(r, s) !== 'reading'
            return (
              <Msg key={r.id} side="engine" node={r.node} stage={i === 0 ? 'rules' : undefined} animate={animate}>
                <LiveRule r={r} s={s} ctx={rowCtx} animate={animate} landed={settled} dur={beat} onOpen={openRuleOf(r)} onAdd={onAdd} />
                <Grow open={done} animate={animate} dur={0.22}>
                  <p className={`rl-chat__said is-after${r.state === 'unknown' ? ' is-notice' : ''}`}>{ruleWords(r)}</p>
                </Grow>
              </Msg>
            )
          })}

          {/* A later rule that also applies: the engine says so as it decides. */}
          {notice && reach(decidingAt) && (
            <Msg side="engine" animate={animate} className="is-notice">
              <p className="rl-chat__said is-notice">
                <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />
                <span>{noticeWords}</span>
              </p>
            </Msg>
          )}
          {typingFor === 'outcome' && (
            <Msg side="engine" working animate={animate}>
              <Typing animate={animate} />
            </Msg>
          )}

          {/* The answer: the biggest message. */}
          {outcomeShown && (
            <Msg side="engine" node="outcome" stage="outcome" animate={animate} className="is-outcome">
              <p className={`rl-chat__verdict is-${tone}`} role="status">
                <span className="rl-chat__vicon" aria-hidden>
                  <Icon size={17} strokeWidth={2.2} />
                </span>
                <span>{verdict}</span>
              </p>
              {!plan.empty && (o.policyName || chain.steps.length > 0 || chain.deny || o.status === 'depends') && (
                <div className="rl-chat__card rl-chat__vcard">
                  {over && (
                    <div className="rl-chat__kv">
                      <span className="rl-chat__k">Sign-in</span>
                      <button type="button" className="rl-chat__link is-quiet" onClick={() => goStage('signin')} aria-label="Show the sign-in">
                        {person?.name ?? (asGroup ? `A member of ${asGroup}` : 'Nobody')}
                        <ArrowRight className="rl-chat__muted" size={12} strokeWidth={2} aria-hidden />
                        {appName}
                      </button>
                    </div>
                  )}
                  {o.policyName && (
                    <div className="rl-chat__kv">
                      <span className="rl-chat__k">Decided by</span>
                      <button type="button" className="rl-chat__link" onClick={openDecider}>
                        {o.policyName}
                        {byRule && <span className="rl-chat__muted"> · {byRule}</span>}
                        <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
                      </button>
                    </div>
                  )}
                  {chain.steps.length > 0 && (
                    <div className="rl-chat__kv">
                      <span className="rl-chat__k">Asked for</span>
                      <span className="rl-chat__chain" aria-label={chain.steps.join(', then ')}>
                        {chain.steps.map((st, i) => (
                          <span key={`${st}:${i}`} className="rl-chat__step">
                            {i > 0 && <ArrowRight className="rl-chat__muted" size={12} strokeWidth={2} aria-hidden />}
                            <span className={i === chain.steps.length - 1 ? 'is-end' : undefined}>{st}</span>
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  {chain.deny && (
                    <div className="rl-chat__kv">
                      <span className="rl-chat__k">They read</span>
                      <span className="rl-chat__deny">“{chain.deny}”</span>
                    </div>
                  )}
                  {o.status === 'depends' && o.view.outcomes.length > 0 && (
                    <div className="rl-chat__kv">
                      <span className="rl-chat__k">Could be</span>
                      <span className="rl-chat__could">
                        {o.view.outcomes.map((x) => (
                          <span key={`${x.label}:${x.decision}`}>
                            <span className="rl-chat__muted">{x.label}</span> <strong className={`rl-chat__decision is-${x.decision === 'deny' ? 'negative' : 'positive'}`}>{DECISION_WORDS[x.decision]}</strong>
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  {mark && expected && <p className="rl-chat__note is-notice">{mark === 'fails' ? `Expected ${DECISION_WORDS[expected]}` : 'Weaker factor'}</p>}
                  {changed && <p className="rl-chat__note">Changed by {changed}</p>}
                  {finding &&
                    (findingAsk ? (
                      <button type="button" className={`rl-chat__finding is-${finding.tone}`} onClick={() => ask(findingAsk)}>
                        {finding.tone === 'info' ? <CircleHelp size={14} strokeWidth={2} aria-hidden /> : <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />}
                        <span>{finding.text}</span>
                        <span className="rl-chat__why">Why?</span>
                      </button>
                    ) : (
                      <p className={`rl-chat__finding is-${finding.tone}`}>
                        {finding.tone === 'info' ? <CircleHelp size={14} strokeWidth={2} aria-hidden /> : <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />}
                        <span>{finding.text}</span>
                      </p>
                    ))}
                </div>
              )}
              {see && (
                <motion.div
                  className={`rl-chat__pane${paneUp ? ' is-up' : ''}`}
                  data-card
                  initial={animate ? { opacity: 0, x: -14 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={animate ? { delay: 0.18, opacity: { duration: 0.24 }, x: { type: 'spring', stiffness: 320, damping: 30 } } : { duration: 0 }}
                >
                  <WhatTheySee key={runKey} screens={screens} appId={form.appId} compact collapsible={false} />
                </motion.div>
              )}
            </Msg>
          )}

          {/* The admin's questions and the engine's answers. */}
          {asked.map((id) => {
            const label = chips.find((c) => c.id === id)?.label ?? ''
            const a = pending === id ? null : answerOf(id)
            return (
              <div key={id} className="rl-chat__pair">
                <Msg side="you" animate={!reduced}>
                  <p className="rl-chat__q">{label}</p>
                </Msg>
                <div data-answer={id}>
                  <Msg side="engine" avatar working={pending === id} animate={!reduced}>
                    {a ? (
                      <>
                        {a.said && <p className="rl-chat__said">{a.said}</p>}
                        {a.body}
                      </>
                    ) : (
                      <Typing animate={!reduced} />
                    )}
                  </Msg>
                </div>
              </div>
            )
          })}

          {/* What the admin can ask next: only the questions this run has an answer to. */}
          {settled && chips.some((c) => !asked.includes(c.id)) && (
            <motion.div
              className="rl-chat__chips"
              data-card
              role="group"
              aria-label="Ask the engine"
              initial={animate || !jumped ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { delay: 0.12, duration: 0.24 }}
            >
              {chips
                .filter((c) => !asked.includes(c.id))
                .map((c) => (
                  <button key={c.id} type="button" className="rl-chat__chip" disabled={pending !== null} onClick={() => ask(c.id)}>
                    {c.label}
                  </button>
                ))}
            </motion.div>
          )}
          <div className="rl-chat__tail" data-tail aria-hidden />
        </div>
      </motion.div>
    </div>
  )
}
