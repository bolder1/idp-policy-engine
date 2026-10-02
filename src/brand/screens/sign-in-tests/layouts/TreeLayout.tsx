import { motion } from 'motion/react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, Ban, Check, CircleHelp, Clock, Gauge, Globe, KeyRound, ListFilter, MapPin, Minus, MonitorSmartphone, ShieldCheck, Split, Users, X, AppWindow, type LucideIcon } from 'lucide-react'

import { FALLBACK_NAME, memberGroupIds, type AccessDecision, type Policy, type User } from '../../../data'
import { DECISION_WORDS, decisionsOr } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import type { LineStatus } from '../../testing/evidence'
import type { SignInScreens } from '../../testing/screens-of'
import { sentenceTokens, tokenValue, type SentenceContext } from '../../testing/sign-in-sentence'
import type { PillCategory } from '../../testing/trace-pills'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { PolicyConflict, Via } from '../conflicts'
import { NOT_STATED_WORD, activeNode, checkPhase, policyPhase, type CheckRow, type EnginePolicy, type EngineRule, type EngineRun } from '../engine-run'
import { expectMark, traceResult, type TraceResult } from '../journey'
import { Spinner } from '../PolicyStack'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import { RunStage, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './tree.css'

/* -----------------------------------------------------------------------------
   The run as a TREE — the route through the map (run-layout.ts `tree`).

        ┌ 1 AWS for engineering ━━━━━━┳━ R1 ✕
     [Maya] ━━ covers via Engineering ━━┫  ━━ first match ━━ R2 ✓ ━━ [Allow on 1 factor]
        ├ 2 AWS billing  ┄┄ also covers ┣─ R3
        ├ 3 …   not reached              ┗─ ✱
        └ 4 …   not reached              ┄┄ [~~Allow with 2FA~~ · not used]

   Four columns, left to right: the sign-in (the root), the application's
   policies in engine order, the deciding policy's rules in rule order, the
   answer. Inside a column, top to bottom is the engine's order; each column
   slides so its chosen node — the policy that decides, the rule the walk
   stopped at, the answer's verdict — sits on ONE horizontal line, the spine:
   the route is a straight lit line across the middle of the map. What was
   read and passed over is above it, what was never needed below.

   The whole map is laid out from the first frame (the plan is known): every
   node has its place, so nothing reflows as the engine plays it — a node not
   reached yet is a skeleton, or nothing at all. Wires are measured from the
   nodes' layout offsets (never transformed rects) into one SVG under them:
   an orthogonal fan with rounded corners from a trunk beside each source,
   every branch's reason written on its own run into the target ("not in it",
   "switched off", "first match", "✕ Network").

   Colour is meaning: blue only where the engine is working (a branch being
   asked, a rule being read, the route's tip as it draws), the route a strong
   neutral while it plays and its tone once the answer lands — green for an
   allow, any factor; red for Deny; amber for Depends — a failed rule's
   branch red, a policy that also covers the person amber and dashed, the
   rest grey hairlines, not reached at half strength. Never orange.

   Motion is the plan's: every state is read off `s` with the engine's pure
   helpers; the only animation is a branch growing as the engine reaches it
   (motion's pathLength), a node fading in, a mark landing. The camera keeps
   the active node in view while it plays and fits the map as it lands.

   Once it has landed, every policy, rule and ghost can be asked why: rest on
   it, focus it (Tab) or press it (pinned until Escape or a press elsewhere)
   and one card beside it says what was asked and what this sign-in had —
   "Needs Contractors · Has Maya Iyer · Engineering, Finance". A who that
   passed says the person's way in on its own line under the rule's groups,
   so the fact is never read as the requirement. A view too narrow for the
   map at the words' size (1280) takes tighter columns (`is-tight`).
   -------------------------------------------------------------------------- */

// --- Words and marks ------------------------------------------------------------------------

type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

/** The route's one colour: an allow is green whatever its factors, Deny red, Depends amber. */
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

/** A policy's reason, as the few words on its branch. */
function branchWords(p: EnginePolicy): string {
  const r = p.reason
  if (!r) return ''
  if (/ is not in (it|this policy)$/.test(r) || r === 'Not in this policy') return 'not in it'
  if (r === 'Not turned on yet') return 'not turned on'
  return r.charAt(0).toLowerCase() + r.slice(1)
}

/** Two names said, the rest counted: "Engineering, Contractors", "Engineering, Finance +1". */
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

/** How the deciding policy covers the person: "covers via Engineering", "covers by name", "fallback". */
function coverWords(p: Policy | undefined, person: User | null, isDefault: boolean, groupName: (id: string) => string): string {
  if (isDefault) return 'fallback'
  const v = policyVia(p, person, groupName)
  return v ? `covers ${v}` : 'covers'
}

/** Who a policy is for, as its audience names them: "Engineering, DevOps", "Everyone". */
function audienceOf(p: Policy | undefined, groupName: (id: string) => string, userName: (id: string) => string): string {
  if (!p) return ''
  const a = p.audience
  if (a.everyone) return 'Everyone'
  const names = [...a.groupIds.map(groupName), ...a.userIds.map(userName)]
  return names.length > 0 ? names.join(', ') : 'Nobody'
}

/** A later policy's way in, as few words: " via Finance", " via Engineering +1", " by name", " everyone". */
function viaWords(v: Via): string {
  if (!v.matches) return ''
  if (v.kind === 'everyone') return ' everyone'
  if (v.kind === 'person') return ' by name'
  const g = v.groups
  return g.length > 0 ? ` via ${namesOf(g.map((x) => x.name))}` : ''
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

function Mark({ status, pop }: { status: LineStatus; pop: boolean }) {
  const glyph = status === 'pass' ? <Check size={13} strokeWidth={2.6} /> : status === 'fail' ? <X size={13} strokeWidth={2.6} /> : <Minus size={13} strokeWidth={2.4} />
  return (
    <motion.span
      className={`rl-tree__mark is-${status}`}
      aria-hidden
      initial={pop ? { scale: 0.55, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { scale: { type: 'spring', stiffness: 620, damping: 26 }, opacity: { duration: 0.1 } } : { duration: 0 }}
    >
      {glyph}
    </motion.span>
  )
}

const SAID: Record<LineStatus, string> = { pass: 'passed', fail: 'failed', unknown: "can't tell" }

/** A fact the sign-in leaves out, on the root: said where the answer depends on it. */
const UNSTATED: Record<string, string> = {
  from: 'Network not stated',
  device: 'Device not stated',
  when: 'Time not stated',
  risk: 'Risk score not stated',
}

// --- Geometry --------------------------------------------------------------------------------

interface Box {
  x: number
  y: number
  w: number
  h: number
  /** The port's height: where a wire meets the node. */
  py: number
}
type Boxes = Record<string, Box>

/** How far from its source a fan's trunk stands. */
const TRUNK = 22
const NEAR = 10
/** Room for a branch's words above its wire: two lines. */
const LABEL_H = 32
/** The ground around the map: the host's room over and under it, narrower sides so a 1280 window keeps the words near their size. */
const PAD = { left: 28, right: 28 }
/** The map's width with the wide columns (tree.css): a view with less room takes the tight ones. */
const WIDE_W = 1256
const CORNER = 10

/* A branch: out of the source, along to the trunk, round a corner, up or
   down the trunk, round again, and along into the target — or straight, on
   one line. `tx` is where the trunk stands. */
function branchPath(x1: number, y1: number, x2: number, y2: number, tx: number): string {
  if (Math.abs(y2 - y1) < 1.5) return `M${x1} ${y1} H${x2}`
  const r = Math.min(CORNER, Math.abs(y2 - y1) / 2)
  const d = y2 > y1 ? 1 : -1
  return `M${x1} ${y1} H${tx - r} Q${tx} ${y1} ${tx} ${y1 + d * r} V${y2 - d * r} Q${tx} ${y2} ${tx + r} ${y2} H${x2}`
}

/** Where an element is in the map, by its layout offsets (zoom and transforms leave them be). */
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

type EdgeKind = 'ask' | 'route' | 'passed' | 'quiet' | 'fail' | 'unknown' | 'also' | 'also-info' | 'off'

interface Edge {
  id: string
  from: string
  to: string
  kind: EdgeKind
  /** The trunk: a fan's, beside the source; or `near`, tighter in, so a branch from a policy that
      did not decide runs down inside the deciding policy's fan and never crosses it. */
  trunk: 'source' | 'near'
  label: string
  labelKind: 'route' | 'quiet' | 'fail' | 'notice' | 'ask'
  title?: string
  /** It grows as the engine reaches it. */
  grow: boolean
}

// --- The nodes ---------------------------------------------------------------------------------

type NodeState = 'hidden' | 'skel' | 'working' | 'route' | 'passed' | 'quiet' | 'fail' | 'unknown' | 'also' | 'also-info' | 'off'

/* A node's name, at its full size from the first frame: while the engine
   has not reached it, a bar over it in its place — so nothing reflows as the
   names come up. Its side slot (the spinner while it is worked on, Open once
   the run has landed) is always kept, for the same reason. */
function NameLine({ name, skel }: { name: string; skel: boolean }) {
  return (
    <span className="rl-tree__namewrap">
      <span className={`rl-tree__name${skel ? ' is-hidden' : ''}`}>{name}</span>
      {skel && <span className="rl-tree__skel is-over" aria-hidden />}
    </span>
  )
}

/* Pressing a node, or resting on it, says why it is where it is: one card
   under it (over it, above the route), the rule's ask beside the sign-in's
   fact. Only once the run has landed: while it plays, the engine has the floor. */
interface Peek {
  enabled: boolean
  shown: string | null
  hover: (k: string | null, from?: string) => void
  focus: (k: string | null, from?: string) => void
  press: (k: string) => void
}
const WHY_ID = 'rl-tree-why'

function WhyHit({ k, peek, className, children }: { k: string; peek: Peek; className: string; children: ReactNode }) {
  if (!peek.enabled) return <span className={className}>{children}</span>
  const on = peek.shown === k
  return (
    <button
      type="button"
      className={`${className} rl-tree__whybtn`}
      aria-expanded={on}
      aria-describedby={on ? WHY_ID : undefined}
      onClick={() => peek.press(k)}
      onFocus={() => peek.focus(k)}
      onBlur={() => peek.focus(null, k)}
    >
      {children}
    </button>
  )
}

/** Resting the pointer on a card peeks at its why. */
function hoverProps(k: string, peek: Peek) {
  return peek.enabled ? { onPointerEnter: () => peek.hover(k), onPointerLeave: () => peek.hover(null, k) } : null
}

function Side({ working, open }: { working: boolean; open: { label: string; go: () => void } | null }) {
  return (
    <span className="rl-tree__side">
      {working ? (
        <Spinner small />
      ) : open ? (
        <button type="button" className="rl-tree__go" aria-label={open.label} onClick={open.go}>
          <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

/** One policy of the application, compact: its number and its name. */
const PolicyNode = memo(function PolicyNode({
  p,
  state,
  live,
  anchor,
  landed,
  animate,
  onOpen,
  peek,
}: {
  p: EnginePolicy
  state: NodeState
  /** The engine is on it between its own beats (the decider opening): its ring blue, nothing else changes. */
  live: boolean
  anchor: boolean
  landed: boolean
  animate: boolean
  onOpen: (id: string) => void
  peek: Peek
}) {
  const shown = state !== 'hidden'
  const k = `p:${p.policyId}`
  return (
    <motion.div
      className="rl-tree__slot"
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: shown ? 1 : 0 }}
      transition={{ duration: animate ? 0.2 : 0 }}
      aria-hidden={!shown}
    >
      <div
        className={`rl-tree__card rl-tree__pol is-${state}${live && state !== 'working' ? ' is-live' : ''}${p.isGlobalDefault ? ' is-default' : ''}${peek.shown === k ? ' is-peek' : ''}`}
        data-card
        data-k={k}
        data-node={p.node}
        {...(anchor ? { 'data-anchor': '' } : null)}
        {...hoverProps(k, peek)}
      >
        <WhyHit k={k} peek={peek} className="rl-tree__hit">
          <span className="rl-tree__num">{p.order}</span>
          <NameLine name={p.name} skel={state === 'skel'} />
        </WhyHit>
        <Side working={state === 'working'} open={landed ? { label: `Open ${p.name}`, go: () => onOpen(p.policyId) } : null} />
      </div>
    </motion.div>
  )
})

/* One check row inside a rule: its category's icon and word, what the rule
   asks for (or, failing, what failed), and its mark — the spinner while it
   is read. Not stated: Add, which opens the panel on that field. Drawn at
   its settled size from the first frame — a bar over it until it is read,
   and the words it will settle to kept under the ones it shows — so the
   rule never changes height as it is read. */
function CheckLine({ row, phase, animate, onAdd, fact }: { row: CheckRow; phase: 'hidden' | 'working' | 'settled'; animate: boolean; onAdd?: () => void; fact?: string }) {
  const Icon = CATEGORY_ICON[row.category]
  const hidden = phase === 'hidden'
  const working = phase === 'working'
  const final = row.status === 'pass' ? row.requirement : row.status === 'unknown' && row.value === NOT_STATED_WORD ? NOT_STATED_WORD : row.line
  const text = working || hidden ? row.requirement : final
  const add = !working && !hidden && row.missing && row.status === 'unknown' && onAdd
  /* A who that passed says the person's way in under what the rule asks — the fact, apart from the requirement.
     Its room is kept from the first frame, so the rule never grows as the mark lands. */
  const by = fact && row.category === 'who' && row.status === 'pass' ? fact : ''
  return (
    <li className={`rl-tree__row is-${hidden ? 'skel' : working ? 'working' : row.status}`} title={hidden || working ? undefined : row.say || row.tip} aria-hidden={hidden || undefined}>
      <Icon className="rl-tree__ricon" size={13} strokeWidth={2} aria-hidden />
      <span className="rl-tree__rword">{row.word}</span>
      <span className="rl-tree__rtext">
        <span>{text}</span>
        {text !== final && (
          <span className="is-sizer" aria-hidden>
            {final}
          </span>
        )}
      </span>
      {add && (
        <button type="button" className="rl-tree__add" onClick={onAdd} aria-label={`Add ${row.word.toLowerCase()}`}>
          Add
        </button>
      )}
      <span className="rl-tree__rmark">
        {working ? <Spinner small /> : hidden ? null : <Mark status={row.status} pop={animate} />}
        {!working && !hidden && <span className="u-sr-only">{SAID[row.status]}</span>}
      </span>
      {by && <span className={`rl-tree__rfact${hidden || working ? ' is-hidden' : ''}`}>{by}</span>}
      {hidden && <span className="rl-tree__skel is-row" aria-hidden />}
    </li>
  )
}

function RuleNode({
  r,
  s,
  state,
  result,
  live,
  anchor,
  landed,
  animate,
  policyId,
  onOpen,
  onAdd,
  fact,
  peek,
}: {
  r: EngineRule
  s: number
  state: NodeState
  result: TraceResult
  /** The engine is still on it after its last mark (a match said, a miss kept): its ring blue. */
  live: boolean
  anchor: boolean
  landed: boolean
  animate: boolean
  policyId: string | null
  onOpen: (policyId: string, ruleId: string) => void
  onAdd: RunLayoutProps['onAdd']
  /** The person's way in, under a who that passed: "Maya Iyer · via Engineering". */
  fact: string
  peek: Peek
}) {
  const k = `r:${r.id}`
  const last = r.index === null
  const shown = state !== 'hidden'
  /* The rows the rule holds: every row read for a rule that matched or could
     not be told; for a rule that did not match, ONE row — the latest read,
     one after another in the same place, ending on the one that failed (the
     rows are stacked in one cell, so it is as tall as the tallest from the
     start); none for the rest. */
  const read = r.checks.slice(0, r.checked)
  let rows: ReactNode = null
  if (r.visited && read.length > 0) {
    if (r.state === 'no-match') {
      const settled = s >= r.endAt
      let k = settled && r.failing !== null ? r.failing : -1
      if (k < 0) {
        for (let i = read.length - 1; i >= 0; i--) {
          if (checkPhase(r, i, s) !== 'hidden') {
            k = i
            break
          }
        }
      }
      const showing = k >= 0 ? k : read.length - 1
      rows = (
        <div className="rl-tree__rows is-one">
          {read.map((row, i) => {
            const on = i === showing
            const phase = k < 0 ? 'hidden' : settled ? 'settled' : checkPhase(r, i, s)
            return (
              <motion.ul
                key={row.key}
                className={`rl-tree__tick${on ? '' : ' is-off'}`}
                initial={false}
                animate={{ opacity: on ? 1 : 0 }}
                transition={{ duration: animate ? 0.14 : 0 }}
                aria-hidden={!on || undefined}
              >
                <CheckLine row={row} phase={phase} animate={animate} onAdd={row.missing ? () => onAdd(row.missing!) : undefined} />
              </motion.ul>
            )
          })}
        </div>
      )
    } else {
      rows = (
        <ul className="rl-tree__rows">
          {read.map((row, k) => (
            <CheckLine key={row.key} row={row} phase={checkPhase(r, k, s)} animate={animate} fact={fact} onAdd={row.missing ? () => onAdd(row.missing!) : undefined} />
          ))}
        </ul>
      )
    }
  }
  const skel = result === 'waiting'
  const then = last ? DECISION_WORDS[r.decision] : state === 'off' ? 'Off' : ''
  return (
    <motion.div
      className="rl-tree__slot"
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: shown ? 1 : 0 }}
      transition={{ duration: animate ? 0.2 : 0 }}
      aria-hidden={!shown}
    >
      <div
        className={`rl-tree__card rl-tree__rule is-${state}${live && state !== 'working' ? ' is-live' : ''}${last ? ' is-last' : ''}${peek.shown === k ? ' is-peek' : ''}`}
        data-card
        data-k={k}
        data-node={r.node}
        {...(anchor ? { 'data-anchor': '' } : null)}
        {...hoverProps(k, peek)}
      >
        <div className="rl-tree__rhead" data-port>
          <WhyHit k={k} peek={peek} className="rl-tree__hit">
            <span className="rl-tree__num">{last ? '✱' : (r.index ?? 0) + 1}</span>
            <NameLine name={r.name} skel={skel && !last} />
            {then && <span className={`rl-tree__then${skel ? ' is-hidden' : ''}`}>{then}</span>}
          </WhyHit>
          {!last && <Side working={state === 'working'} open={landed && policyId ? { label: `Open rule ${(r.index ?? 0) + 1}`, go: () => onOpen(policyId, r.id) } : null} />}
        </div>
        {rows}
      </div>
    </motion.div>
  )
}

/* A policy that also covers the person, at the end of its dashed branch:
   what it would have given, struck through — it is not used. */
function GhostLeaf({ c, shown, conflict, animate, peek }: { c: PolicyConflict; shown: boolean; conflict: boolean; animate: boolean; peek: Peek }) {
  const would = ghostWould(c)
  const k = `g:${c.policyId}`
  return (
    <motion.div className="rl-tree__slot" initial={animate ? { opacity: 0 } : false} animate={{ opacity: shown ? 1 : 0 }} transition={{ duration: animate ? 0.24 : 0 }} aria-hidden={!shown}>
      <div className={`rl-tree__card rl-tree__ghost${conflict ? ' is-conflict' : ''}${peek.shown === k ? ' is-peek' : ''}`} data-card data-k={k} {...hoverProps(k, peek)}>
        <WhyHit k={k} peek={peek} className="rl-tree__ghit">
          <span className="rl-tree__gwould" data-port>
            <s>{would}</s>
            <span> · not used</span>
          </span>
          <span className="rl-tree__gby">{c.ruleNumber !== null ? `Rule ${c.ruleNumber} · ${c.ruleName}` : FALLBACK_NAME}</span>
        </WhyHit>
      </div>
    </motion.div>
  )
}

function ghostWould(c: PolicyConflict): string {
  return c.status === 'decided' && c.decision ? DECISION_WORDS[c.decision] : decisionsOr(c.possible) || 'Can’t tell'
}

// --- Why ---------------------------------------------------------------------------------------

/** One check, the rule's ask beside the sign-in's fact. */
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

function WhyCard({ body, box, below, mapH, mapW }: { body: WhyBody; box: Box; below: boolean; mapH: number; mapW: number }) {
  const width = Math.max(box.w, 288)
  const left = Math.max(0, Math.min(box.x, mapW - width))
  const pos: CSSProperties = below ? { left, top: box.y + box.h + 8, width } : { left, bottom: mapH - box.y + 8, width }
  return (
    <motion.div id={WHY_ID} role="note" className={`rl-tree__why is-${body.tone}`} data-card style={pos} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.14 }}>
      <p className="rl-tree__wtitle">{body.title}</p>
      {body.pairs.length > 0 && (
        <ul className="rl-tree__wpairs">
          {body.pairs.map((x) => (
            <li key={x.key} className={`rl-tree__wpair is-${x.status}`}>
              <span className="rl-tree__wword">{x.word}</span>
              <span className="rl-tree__wvals">
                <span className="rl-tree__wlab">Needs</span>
                <span className="rl-tree__wneed">{x.needs || '—'}</span>
                <span className="rl-tree__wlab">Has</span>
                <span className="rl-tree__whas">{x.has || '—'}</span>
              </span>
              <span className="rl-tree__rmark">
                <Mark status={x.status} pop={false} />
                <span className="u-sr-only">{SAID[x.status]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {body.lines.map((l) => (
        <p key={l} className="rl-tree__wline">
          {l}
        </p>
      ))}
    </motion.div>
  )
}

// --- The layout ------------------------------------------------------------------------------

type ColId = 'root' | 'pol' | 'rules' | 'out'
const COLS: readonly ColId[] = ['root', 'pol', 'rules', 'out']

export default function TreeLayout(props: RunLayoutProps) {
  const { plan, s, running, animate, reduced, jumped, runKey, form, rows: rowsRead, asGroup, screens, expected, weaker, changed, onPressPerson, onOpenPolicy, onOpenRule, onAdd } = props
  const brand = useBrand()
  const { users, groups, apps, zones } = brand
  const tenant = props.policies ?? brand.policies
  const stage = useRef<StageView | null>(null)
  const mapRef = useRef<HTMLDivElement | null>(null)

  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id
  const tone = toneOf(plan)

  /* Where the run is. */
  const decidingAt = plan.steps.findIndex((st) => st.kind === 'deciding')
  const landed = plan.at.outcome >= 0 ? s >= plan.at.outcome : !running
  const policiesIn = plan.at.which >= 0 && s >= plan.at.which
  const rulesIn = plan.at.expand >= 0 && s >= plan.at.expand
  const outDrawing = decidingAt >= 0 && s >= decidingAt
  const deciderIdx = plan.policies.findIndex((p) => p.decides)
  const landing = plan.landing
  const landRule = landing !== null ? plan.rules[landing] : undefined

  /* Who else covers the person, said once the answer lands: the conflicts amber, the rest grey. */
  const also = useMemo(() => {
    const c = plan.conflicts
    const conflictIds = new Set((c?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId))
    return (c?.policies ?? []).filter((x) => plan.policies.some((p) => p.policyId === x.policyId)).map((x) => ({ c: x, conflict: conflictIds.has(x.policyId) }))
  }, [plan])
  const alsoOf = (id: string) => also.find((a) => a.c.policyId === id) ?? null

  /* What the engine is on (engine-run.ts activeNode): the camera keeps it in view, and its ring is blue. */
  const active = running && !landed ? activeNode(plan, s) : null

  // --- Each node's state at this step ---

  const policyState = (p: EnginePolicy): NodeState => {
    if (!policiesIn) return 'hidden'
    const ph = policyPhase(p, s)
    if (ph === 'waiting') return 'skel'
    /* One asked at a time: the plan keeps the one before the last asked "working" until the decider
       settles, so the engine's own node (activeNode) says which is blue. */
    if (ph === 'working' && (active === null || active === p.node)) return 'working'
    if (p.decides) return 'route'
    const a = landed ? alsoOf(p.policyId) : null
    if (a) return a.conflict ? 'also' : 'also-info'
    if (p.kind === 'waiting' || p.kind === 'elsewhere') return 'off'
    return p.scanned ? 'passed' : 'quiet'
  }
  const ruleResult = (r: EngineRule) => traceResult(r, s)
  const ruleState = (r: EngineRule, i: number): NodeState => {
    if (!rulesIn) return 'hidden'
    switch (ruleResult(r)) {
      case 'waiting':
        return 'skel'
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

  // --- The edges at this step ---

  const decider = deciderIdx >= 0 ? plan.policies[deciderIdx] : undefined
  const deciderPolicy = decider ? tenant.find((p) => p.id === decider.policyId) : undefined
  const edges: Edge[] = []
  if (policiesIn) {
    for (const p of plan.policies) {
      const st = policyState(p)
      if (st === 'hidden' || st === 'skel') continue
      const id = `e:p:${p.policyId}`
      const a = alsoOf(p.policyId)
      if (st === 'working') edges.push({ id, from: 'root', to: `p:${p.policyId}`, kind: 'ask', trunk: 'source', label: '', labelKind: 'ask', grow: true })
      else if (st === 'route')
        edges.push({ id, from: 'root', to: `p:${p.policyId}`, kind: 'route', trunk: 'source', label: coverWords(deciderPolicy, person, p.isGlobalDefault, groupName), labelKind: 'route', grow: true })
      else if ((st === 'also' || st === 'also-info') && a)
        edges.push({ id, from: 'root', to: `p:${p.policyId}`, kind: st, trunk: 'source', label: `also covers${viaWords(a.c.via)}`, labelKind: st === 'also' ? 'notice' : 'quiet', title: a.c.why, grow: false })
      else edges.push({ id, from: 'root', to: `p:${p.policyId}`, kind: st === 'passed' ? 'passed' : st === 'off' ? 'off' : 'quiet', trunk: 'source', label: branchWords(p), labelKind: 'quiet', title: p.tip || p.reason, grow: p.scanned })
    }
  }
  if (rulesIn && decider) {
    plan.rules.forEach((r, i) => {
      const st = ruleState(r, i)
      if (st === 'hidden' || st === 'skel') return
      const base = { id: `e:r:${r.id}`, from: `p:${decider.policyId}`, to: `r:${r.id}`, trunk: 'source' as const }
      const fail = r.failing !== null ? r.checks[r.failing] : undefined
      if (st === 'working') edges.push({ ...base, kind: 'ask', label: '', labelKind: 'ask', grow: true })
      else if (st === 'route') edges.push({ ...base, kind: 'route', label: r.index === null ? (r.state === 'possible' ? 'if not' : 'none matched') : 'first match', labelKind: 'route', grow: true })
      else if (st === 'fail') edges.push({ ...base, kind: 'fail', label: fail ? `✕ ${fail.word}` : 'no match', labelKind: 'fail', title: r.miss, grow: true })
      else if (st === 'unknown') edges.push({ ...base, kind: 'unknown', label: "can't tell", labelKind: 'notice', grow: true })
      else if (st === 'off') edges.push({ ...base, kind: 'off', label: 'switched off', labelKind: 'quiet', grow: false })
      else edges.push({ ...base, kind: 'quiet', label: '', labelKind: 'quiet', grow: false })
    })
  }
  if (landed) {
    for (const a of also) edges.push({ id: `e:g:${a.c.policyId}`, from: `p:${a.c.policyId}`, to: `g:${a.c.policyId}`, kind: a.conflict ? 'also' : 'also-info', trunk: 'near', label: '', labelKind: 'quiet', grow: false })
  }
  /* The route's last hop, into the answer: from the rule the walk stopped at, else the policy, else the sign-in. */
  const outFrom = landRule && rulesIn ? `r:${landRule.id}` : decider ? `p:${decider.policyId}` : 'root'
  if (outDrawing || (landed && plan.at.outcome >= 0)) edges.push({ id: 'e:out', from: outFrom, to: 'out', kind: landed ? 'route' : 'ask', trunk: 'source', label: '', labelKind: 'route', grow: true })
  else if (landed && plan.empty) edges.push({ id: 'e:out', from: 'root', to: 'out', kind: 'quiet', trunk: 'source', label: '', labelKind: 'quiet', grow: false })

  // --- Measuring: the columns onto the spine, then every node's box ---

  const [margins, setMargins] = useState<Record<ColId, number>>({ root: 0, pol: 0, rules: 0, out: 0 })
  const [geo, setGeo] = useState<{ boxes: Boxes; w: number; h: number }>({ boxes: {}, w: 0, h: 0 })
  const [tick, setTick] = useState(0)
  const [compact, setCompact] = useState(false)
  const pendingFit = useRef<{ jump: boolean } | null>({ jump: true })

  /* A new run, or one drawn settled at once: the whole map in view. */
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- every render measures; each setState is guarded by a change, so it settles
  useLayoutEffect(() => {
    const map = mapRef.current
    if (!map) return
    /* A view too narrow for the map at its words' size (a 1280 window): the tighter columns, so fit keeps zoom 1. */
    const sc = map.closest<HTMLElement>('.rstage__scroll')
    if (sc) {
      const room = sc.clientWidth - PAD.left - PAD.right
      const tight = room > 0 && room < WIDE_W
      if (tight !== compact) {
        setCompact(tight)
        pendingFit.current = { jump: true }
        return
      }
    }
    /* The spine: each column's chosen node, its port's middle, on one height. */
    const centre: Partial<Record<ColId, number>> = {}
    for (const c of COLS) {
      const col = map.querySelector<HTMLElement>(`[data-col="${c}"]`)
      const anchor = col?.querySelector<HTMLElement>('[data-anchor]')
      if (!col || !anchor) continue
      const port = anchor.querySelector<HTMLElement>('[data-port]') ?? anchor
      centre[c] = offsetIn(port, map).y - offsetIn(col, map).y + port.offsetHeight / 2
    }
    const top = Math.max(0, ...Object.values(centre).map((v) => v ?? 0))
    const next = { root: 0, pol: 0, rules: 0, out: 0 } as Record<ColId, number>
    for (const c of COLS) next[c] = centre[c] !== undefined ? Math.round(top - (centre[c] as number)) : 0
    if (COLS.some((c) => Math.abs(next[c] - margins[c]) > 0.5)) {
      setMargins(next)
      return
    }
    /* Every node's box, for the wires. */
    const boxes: Boxes = {}
    map.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => {
      const k = el.dataset.k as string
      const o = offsetIn(el, map)
      const port = el.querySelector<HTMLElement>('[data-port]')
      const py = port ? offsetIn(port, map).y + port.offsetHeight / 2 : o.y + el.offsetHeight / 2
      boxes[k] = { x: o.x, y: o.y, w: el.offsetWidth, h: el.offsetHeight, py: Math.round(py * 2) / 2 }
    })
    const w = map.offsetWidth
    const h = map.offsetHeight
    const sig = (g: { boxes: Boxes; w: number; h: number }) => `${g.w}x${g.h}|${Object.entries(g.boxes).map(([k, b]) => `${k}:${b.x},${b.y},${b.w},${b.h},${b.py}`).join(';')}`
    const g = { boxes, w, h }
    if (sig(g) !== sig(geo)) {
      setGeo(g)
      return
    }
    /* Laid out and still: the view may move now. */
    if (pendingFit.current) {
      const opts = pendingFit.current
      pendingFit.current = null
      stage.current?.fit({ max: 1, jump: opts.jump || reduced })
    }
  })

  /* A size that changes by itself — a font arriving, What they see opening — measures again. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(map)
    map.querySelectorAll('[data-col]').forEach((c) => ro.observe(c))
    const sc = map.closest('.rstage__scroll')
    if (sc) ro.observe(sc)
    return () => ro.disconnect()
  }, [])
  void tick

  /* While it plays, the camera keeps the engine's node in view (lazily: only when it is not). */
  useEffect(() => {
    if (!active || !animate) return
    const el = mapRef.current?.querySelector(`[data-node="${active}"]`)
    if (el) stage.current?.follow(el, { lazy: true, x: 0.6 })
  }, [active, animate, s])

  // --- The sign-in's facts ---

  /* One line each, the words the panel says; a fact left unstated is said only
     where it is why the answer depends ("Device not stated", amber). */
  const ctx: SentenceContext = { people: users, apps, zones, rows: rowsRead }
  const depends = plan.outcome.status === 'depends'
  const facts = sentenceTokens(rowsRead)
    .filter((t) => t !== 'person' && t !== 'app')
    .map((t) => tokenValue(t, form, ctx))
    .filter((v) => !v.unset || depends)
    .map((v) => ({ v, text: v.unset ? UNSTATED[v.token] : v.token === 'risk' ? `Risk score ${v.text}` : v.text }))
  const groupLine = asGroup ? `A member of ${asGroup}` : person ? groupNamesOf(person, groups).join(', ') : ''

  // --- Why: a node pressed or rested on, once the run has landed ---

  const interactive = landed && !running
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
  const shownK = interactive ? (hoverK ?? focusK ?? pinK) : null
  const peek: Peek = {
    enabled: interactive,
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

  const who = asGroup ? `anyone in ${asGroup}` : (person?.name ?? 'this person')
  const whoName = asGroup ? `Anyone in ${asGroup}` : (person?.name ?? 'This person')
  const whoGroups = asGroup ? `Anyone in ${asGroup}` : person ? `${person.name} · ${groupNamesOf(person, groups).join(', ') || 'no groups'}` : ''
  /* The person's way in, under a who that passed — the fact, never the rule's groups. */
  const ruleFact = (r: EngineRule) => (asGroup ? `Anyone in ${asGroup}` : person && r.via?.matches && r.via.say ? `${person.name} · ${r.via.say}` : '')
  const pairOf = (r: EngineRule, row: CheckRow): WhyPair => ({
    key: row.key,
    word: row.word,
    needs: row.requirement,
    has: row.category === 'who' ? (row.status === 'pass' ? ruleFact(r) || whoName : whoGroups) : row.value,
    status: row.status,
  })
  const thenWords = (r: EngineRule) => `Then ${DECISION_WORDS[r.decision]}`

  const whyOf = (k: string): WhyBody | null => {
    if (k.startsWith('p:') || k.startsWith('g:')) {
      const id = k.slice(2)
      const p = plan.policies.find((x) => x.policyId === id)
      const pol = tenant.find((x) => x.id === id)
      if (!p) return null
      const st = policyState(p)
      const a = alsoOf(id)
      const audience = audienceOf(pol, groupName, userName)
      if (a && (k.startsWith('g:') || st === 'also' || st === 'also-info')) {
        const via = a.c.via.say || policyVia(pol, person, groupName)
        return {
          title: `Also covers ${who} · not used`,
          tone: a.conflict ? 'notice' : 'neutral',
          pairs: [{ key: 'who', word: 'Who', needs: audience, has: via ? `${whoName} · ${via}` : whoName, status: 'pass' }],
          lines: [`It would give ${ghostWould(a.c)}`, decider ? `${decider.name} comes first` : '', a.c.fix].filter(Boolean),
        }
      }
      switch (st) {
        case 'route':
          return p.isGlobalDefault
            ? { title: `Fallback · no policy before it covers ${who}`, tone, pairs: [], lines: [plan.outcome.ruleLine].filter(Boolean) }
            : {
                title: `First policy that covers ${who}`,
                tone,
                pairs: [{ key: 'who', word: 'Who', needs: audience, has: `${whoName}${policyVia(pol, person, groupName) ? ` · ${policyVia(pol, person, groupName)}` : ''}`, status: 'pass' }],
                lines: [plan.outcome.ruleLine].filter(Boolean),
              }
        case 'passed':
          return {
            title: p.reason && !/not in/i.test(p.reason) ? p.reason : `Doesn’t cover ${who}`,
            tone: 'neutral',
            pairs: pol && /not in/i.test(p.reason) ? [{ key: 'who', word: 'Who', needs: audience, has: whoGroups, status: 'fail' }] : [],
            lines: pol && /not in/i.test(p.reason) ? [] : [p.tip].filter(Boolean),
          }
        case 'quiet':
          return { title: 'Not asked', tone: 'neutral', pairs: [], lines: [decider ? `${decider.name} covers ${who} first` : p.reason].filter(Boolean) }
        case 'off':
          return { title: p.reason || 'Switched off', tone: 'neutral', pairs: [], lines: [p.tip, 'Passed over'].filter(Boolean) }
        default:
          return null
      }
    }
    if (k.startsWith('r:')) {
      const i = plan.rules.findIndex((x) => `r:${x.id}` === k)
      const r = plan.rules[i]
      if (!r) return null
      const st = ruleState(r, i)
      const read = r.checks.slice(0, r.checked).map((row) => pairOf(r, row))
      const last = r.index === null
      switch (st) {
        case 'fail': {
          const f = r.failing !== null ? r.checks[r.failing] : undefined
          return { title: f ? `No match · ${f.word} failed` : 'No match', tone: 'negative', pairs: read, lines: [] }
        }
        case 'route':
          if (last) return { title: r.state === 'possible' ? 'If no rule above matches' : 'No rule above matched', tone, pairs: [], lines: [thenWords(r)] }
          return { title: 'First match · every check passed', tone, pairs: read, lines: [thenWords(r)] }
        case 'passed':
          return { title: 'Matches', tone: 'positive', pairs: read, lines: [thenWords(r)] }
        case 'unknown':
          return { title: 'Can’t tell · a fact is not stated', tone: 'notice', pairs: read, lines: [`If it matches: ${DECISION_WORDS[r.decision]}`] }
        case 'off':
          return { title: 'Switched off', tone: 'neutral', pairs: [], lines: ['Passed over'] }
        case 'quiet':
          return {
            title: 'Not read',
            tone: 'neutral',
            pairs: [],
            lines: [landRule && landRule.index !== null ? `Rule ${landRule.index + 1} matched first` : 'A rule above decided'],
          }
        default:
          return null
      }
    }
    return null
  }
  const why = shownK ? whyOf(shownK) : null
  const whyBox = shownK ? geo.boxes[shownK] : undefined
  const spineY = geo.boxes.out?.py ?? geo.boxes.root?.py ?? 0

  // --- The answer ---

  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? DECISION_ICON[decided] : o.status === 'depends' ? Split : CircleHelp
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides'
  const byRule = o.ruleLine ? o.ruleLine.split(' · ')[0] : ''
  const by = o.policyName ? (
    <>
      {o.policyName}
      {byRule && <span className="rl-tree__byrule"> · {byRule}</span>}
    </>
  ) : null
  const chain = chainOf(screens, decided)
  const mark = expectMark(decided, expected, weaker)
  const see0 = screens.length > 0 && form.appId !== null

  // --- Drawing ---

  const wire = (e: Edge) => {
    const a = geo.boxes[e.from]
    const b = geo.boxes[e.to]
    if (!a || !b) return null
    const x1 = a.x + a.w
    const x2 = b.x
    const tx = e.trunk === 'source' ? x1 + TRUNK : x1 + NEAR
    return { d: branchPath(x1, a.py, x2, b.py, tx), x2, y2: b.py, tx }
  }
  const drawn = edges.map((e) => ({ e, w: wire(e) })).filter((x): x is { e: Edge; w: NonNullable<ReturnType<typeof wire>> } => x.w !== null)
  /* Quiet under loud: the hairlines first, the route last, so a shared trunk takes the stronger colour. */
  const RANK: Record<EdgeKind, number> = { quiet: 0, off: 0, 'also-info': 1, passed: 1, also: 2, unknown: 3, fail: 3, ask: 4, route: 5 }
  const ordered = [...drawn].sort((p, q) => RANK[p.e.kind] - RANK[q.e.kind])
  const pathLen = animate ? { pathLength: 0 } : false

  return (
    <RunStage ref={stage} reduced={reduced} pad={PAD} className={`rl-tree${landed ? ` is-landed is-${tone}` : ''}${compact ? ' is-tight' : ''}`} label="Sign-in run, as a tree">
      <div
        ref={mapRef}
        className="rl-tree__map"
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
          if (pinK && !(e.target instanceof Element && e.target.closest('.rl-tree__whybtn, .rl-tree__why'))) setPinK(null)
        }}
      >
        <svg className="rl-tree__wires" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w || 1} ${geo.h || 1}`} aria-hidden>
          {ordered.map(({ e, w }) => {
            const dashed = e.kind === 'also' || e.kind === 'also-info'
            return (
              <motion.path
                key={e.id}
                className={`rl-tree__wire is-${e.kind}`}
                d={w.d}
                fill="none"
                initial={e.grow && !dashed ? pathLen : animate ? { opacity: 0 } : false}
                animate={e.grow && !dashed ? { pathLength: 1 } : { opacity: 1 }}
                transition={{ duration: animate ? (e.grow ? 0.36 : 0.24) : 0, ease: [0.4, 0, 0.2, 1] }}
              />
            )
          })}
        </svg>
        {drawn
          .filter(({ e }) => e.label)
          .map(({ e, w }) => {
            const left = w.tx + CORNER + 6
            /* Sat on the wire, growing upward: a long reason takes a second line, never the next branch. */
            return (
              <span key={`l:${e.id}`} className="rl-tree__lblbox" style={{ left, top: w.y2 - LABEL_H - 3, width: Math.max(0, w.x2 - 8 - left), height: LABEL_H } as CSSProperties}>
                <motion.span
                  className={`rl-tree__lbl is-${e.labelKind}`}
                  title={e.title || e.label}
                  initial={animate ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: animate ? 0.2 : 0, delay: animate ? 0.12 : 0 }}
                >
                  {e.label}
                </motion.span>
              </span>
            )
          })}

        {why && whyBox && <WhyCard key={shownK} body={why} box={whyBox} below={whyBox.py >= spineY - 1} mapH={geo.h} mapW={geo.w} />}

        <div className="rl-tree__cols">
          {/* The root: who signs in to what, and the facts the application's rules read. */}
          <div className="rl-tree__col is-root" data-col="root" style={{ marginTop: margins.root }}>
            <div className="rl-tree__card rl-tree__root" data-card data-k="root" data-node="sign-in" data-anchor="">
              <button type="button" className="rl-tree__rootbtn" onClick={onPressPerson} aria-label={`Change the sign-in: ${person?.name ?? 'nobody'} to ${app?.name ?? 'no application'}`}>
                <span className="rl-tree__who">
                  {person && <Face kind="user" name={person.name} size="md" decorative />}
                  <span className="rl-tree__whotext">
                    <strong>{person?.name ?? 'Choose a person'}</strong>
                    {groupLine && <span>{groupLine}</span>}
                  </span>
                </span>
                <span className="rl-tree__app">
                  <ArrowRight className="rl-tree__to" size={13} strokeWidth={2} aria-hidden />
                  {app && <AppLogo appId={app.id} name={app.name} size={16} />}
                  <span>{app?.name ?? plan.appName ?? 'Choose an application'}</span>
                </span>
                {facts.length > 0 && (
                  <span className="rl-tree__facts">
                    {facts.map(({ v, text }) => (
                      <span key={v.token} className={`rl-tree__fact${v.unset ? ' is-unset' : ''}`}>
                        <span className="rl-tree__fmark" aria-hidden>
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
          </div>

          {/* The application's policies, in the order the engine asks them. */}
          <div className="rl-tree__col is-pol" data-col="pol" data-node="which" style={{ marginTop: margins.pol }}>
            {plan.policies.map((p, i) => (
              <PolicyNode key={p.policyId} p={p} state={policyState(p)} live={active === p.node} anchor={i === (deciderIdx >= 0 ? deciderIdx : 0)} landed={landed && !running} animate={animate} onOpen={onOpenPolicy} peek={peek} />
            ))}
          </div>

          {/* The deciding policy's rules, in order; under them, what another policy would have given. */}
          <div className="rl-tree__col is-rules" data-col="rules" style={{ marginTop: margins.rules }}>
            {plan.rules.map((r, i) => (
              <RuleNode
                key={r.id}
                r={r}
                s={s}
                state={ruleState(r, i)}
                live={active === r.node}
                result={ruleResult(r)}
                anchor={i === (landing ?? 0)}
                landed={landed && !running}
                animate={animate}
                policyId={decider?.policyId ?? null}
                onOpen={onOpenRule}
                onAdd={onAdd}
                fact={ruleFact(r)}
                peek={peek}
              />
            ))}
            {also.length > 0 && (
              <div className="rl-tree__ghosts">
                {also.map((a) => (
                  <GhostLeaf key={a.c.policyId} c={a.c} conflict={a.conflict} shown={landed} animate={animate} peek={peek} />
                ))}
              </div>
            )}
          </div>

          {/* The answer: the leaf at the route's end. */}
          <div className="rl-tree__col is-out" data-col="out" style={{ marginTop: margins.out }}>
            <motion.div
              className="rl-tree__slot"
              initial={animate ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: landed ? 1 : 0, y: landed ? 0 : 6 }}
              transition={animate ? { opacity: { duration: 0.24 }, y: { type: 'spring', stiffness: 420, damping: 32 } } : { duration: 0 }}
              aria-hidden={!landed}
            >
              <div className={`rl-tree__card rl-tree__out is-${tone}`} data-card data-k="out" data-node="outcome" data-anchor="" role="group" aria-label={`Decision: ${word}`}>
                <div className="rl-tree__verdict" data-port>
                  <span className="rl-tree__vicon" aria-hidden>
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="rl-tree__vword">{word}</span>
                </div>
                {mark && expected && (
                  <p className="rl-tree__expect">{mark === 'fails' ? `Expected ${DECISION_WORDS[expected]}` : 'Weaker factor'}</p>
                )}
                {changed && <p className="rl-tree__changed">Changed by {changed}</p>}
                {by && (
                  <p className="rl-tree__by">
                    <span className="rl-tree__bylabel">Decided by</span>
                    {o.policyId ? (
                      <button type="button" className="rl-tree__bylink" onClick={() => o.policyId && onOpenPolicy(o.policyId)}>
                        {by}
                      </button>
                    ) : (
                      <span>{by}</span>
                    )}
                  </p>
                )}
                {chain.steps.length > 0 && (
                  <p className="rl-tree__chain" aria-label={`Asked for: ${chain.steps.join(', then ')}`}>
                    {chain.steps.map((st, i) => (
                      <span key={`${st}:${i}`} className="rl-tree__step">
                        {i > 0 && <ArrowRight className="rl-tree__arrow" size={11} strokeWidth={2} aria-hidden />}
                        <span className={i === chain.steps.length - 1 ? 'is-end' : undefined}>{st}</span>
                      </span>
                    ))}
                  </p>
                )}
                {chain.deny && <p className="rl-tree__deny">“{chain.deny}”</p>}
                {o.status === 'depends' && o.view.outcomes.length > 0 && (
                  <ul className="rl-tree__ifs">
                    {o.view.outcomes.map((x) => (
                      <li key={`${x.label}:${x.decision}`}>
                        <span>{x.label}</span>
                        <strong>{DECISION_WORDS[x.decision]}</strong>
                      </li>
                    ))}
                  </ul>
                )}
                {o.status === 'depends' && o.view.needs.length > 0 && <p className="rl-tree__needs">Needs {o.view.needs.join(', ').toLowerCase()}</p>}
                {see0 && (
                  <div className="rl-tree__see">
                    <WhatTheySee key={runKey} screens={screens} appId={form.appId} compact defaultOpen={false} />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </RunStage>
  )
}
