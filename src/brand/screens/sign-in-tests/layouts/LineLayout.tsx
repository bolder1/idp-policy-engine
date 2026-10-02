import { motion } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, Ban, Check, ChevronDown, ChevronRight, CircleHelp, Info, KeyRound, Lock, ShieldCheck, Split, TriangleAlert, X, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import type { LineStatus } from '../../testing/evidence'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { answerWords, sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../../testing/sign-in-sentence'
import { WhatTheySee } from '../../testing/WhatTheySee'
import { activeNode, checkPhase, policyFound, policyOpen, policyPhase, type CheckRow, type EnginePolicy, type EngineRule, type EngineRun } from '../engine-run'
import type { Finding, PolicyConflict, RuleConflict, Via } from '../conflicts'
import { expectMark, findingsCount, isQuiet, policyWhy, traceResult } from '../journey'
import { Spinner } from '../PolicyStack'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import { RunStage, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './line.css'

/* -----------------------------------------------------------------------------
   The run as a line (run-layout.ts `line`): the decision line.

     Sign-in      Policies on AWS Console 4   Rules in AWS for eng… 3      Outcome
                                              ┌ 1 Contractors away  ✕ ┐
     ┌─────────┐  ┌ 1 AWS for engineering ✓┐  ┌ 2 Engineers on a…   ✓ ┐  ┌ Allow on 1 factor ┐
     │ Maya    │━━│   First that covers Maya│━━│ Who    Maya  in Eng  ✓ │━━│ Decided by …      │
     └─────────┘  └─────────────────────────┘  │ Device Win 11 meets ✓ │  │ Password          │
                  ┌ 2 AWS billing      amber┐  └───────────────────────┘  └───────────────────┘
                    3 …  (40%)                   3 …  (40%)
                    4 …  (40%)                   ✱ Nothing else matched (40%)

   Four stage columns, left to right: how deep the engine went. Inside a
   column, top to bottom: the order it reads them in. The chosen card of every
   column sits on ONE horizontal line — the sign-in, the policy that applies,
   the rule that matched (open: what the sign-in showed, what the rule asks,
   the mark), the outcome — so position says what happened before colour
   does: above the line was read and passed over, below it was never needed
   (quiet), or, in the conflict's amber, also covers the person.

   Every chosen card's head row is ROW tall and its top sits at LINE_TOP, so
   the path is a straight 2px line at LINE_TOP + PORT, drawn in the gaps
   between the columns — nothing is measured. Cards above the line are folded
   to ROW, so a column's stack is offset by whole STEPs: the stack of
   policies glides so the one being asked sits on the line, and the rules'
   stack glides up as each rule that missed folds off it. The settled offsets
   are the columns' own padding (so the world is the landed run's size from
   the first frame); while the run plays, the stacks are moved by motion's y
   from there, and no CSS transform or transition is put on them.

   Colour is meaning: blue only where the engine works now, the path grey
   behind it; once the answer lands the whole path, its rings and the answer
   take ONE tone — green for an allow (any number of factors), red for a deny,
   amber for Depends. ✓ is green, ✕ red, ? amber. Amber otherwise only for a
   policy that also covers the person and was not used.
   -------------------------------------------------------------------------- */

// --- Geometry (px, at zoom 1) -----------------------------------------------------------

type Col = 'sign' | 'pol' | 'rule' | 'out'
const COL_W: Record<Col, number> = { sign: 232, pol: 288, rule: 384, out: 304 }
const GAP = 32
const COL_X: Record<Col, number> = {
  sign: 0,
  pol: COL_W.sign + GAP,
  rule: COL_W.sign + GAP + COL_W.pol + GAP,
  out: COL_W.sign + GAP + COL_W.pol + GAP + COL_W.rule + GAP,
}
const WORLD_W = COL_X.out + COL_W.out
/** The header row and the room under it. */
const HEAD = 34
/** A folded card's height, and the head row of every card on the line. */
const ROW = 52
/** A folded card and the gap under it: what a stack moves by. */
const STEP = ROW + 8
/** Where the line crosses a card on it: the middle of its head row. */
const PORT = ROW / 2
/** The stacks' glide. */
const GLIDE = { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const }
const EASE_OUT = [0.2, 0, 0, 1] as const

type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

/* The landed path's one colour. An allow is green on any number of factors —
   an extra factor is not a warning; amber only while it can't be told. */
function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

/* Where the stacks stand once the run has landed: the policy that decides
   and the rule the walk stopped at, each on the line. With nothing deciding,
   the last policy asked stands there, quiet. */
function settledOf(plan: EngineRun): { pol: number; rule: number; above: number } {
  const d = plan.policies.findIndex((p) => p.decides)
  const pol = d >= 0 ? d : Math.max(0, plan.policies.length - 1)
  const rule = plan.rules.length === 0 ? -1 : Math.min(plan.rules.length - 1, Math.max(0, plan.landing ?? plan.rules.length - 1))
  return { pol, rule, above: Math.max(pol, rule, 0) }
}

/* How tall the landed run will stand, from the plan alone — the world's least
   height from the first frame, so it never grows (and re-centres) under the
   eye as cards open and the answer lands. Generous by a row or so. */
function heightOf(plan: EngineRun, settled: { pol: number; rule: number }, lineTop: number, facts: number): number {
  const sign = 52 + 40 + facts * 24 + 16
  const below = (n: number, h: number) => n * (h + 8)
  const also = new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId))
  const polBelow = plan.policies.slice(settled.pol + 1).reduce((n, p) => n + (also.has(p.policyId) ? 60 : 46), 0)
  const pol = 72 + polBelow
  const landing = settled.rule >= 0 ? plan.rules[settled.rule] : undefined
  const open = landing ? 52 + 10 + landing.checks.length * 46 + 44 : 0
  const rule = open + below(Math.max(0, plan.rules.length - 1 - settled.rule), 38)
  const out = 210 + (plan.outcome.status === 'depends' ? plan.outcome.view.outcomes.length * 22 + 24 : 0)
  return lineTop + Math.max(sign, pol, rule, out) + 8
}

/* The policy on the line at step `s`: the one being asked, until the one that
   decides is found. */
function policyOnLine(plan: EngineRun, s: number, settled: number): number {
  if (plan.at.found >= 0 && s >= plan.at.found) return settled
  if (s >= plan.steps.length - 1) return settled
  let on = 0
  plan.policies.forEach((p, i) => {
    if (p.scanAt !== null && s >= p.scanAt) on = i
  })
  return Math.min(on, settled)
}

/* The rule on the line at step `s`: each rule before the one the walk stops
   at leaves the line as it folds — or, one that does not fold, as the next
   is opened. */
function ruleOnLine(rules: readonly EngineRule[], landing: number, s: number): number {
  let on = 0
  for (let i = 0; i < landing; i++) {
    const r = rules[i]
    const next = rules[i + 1]
    const passAt = r.compactAt ?? (next && next.startAt >= 0 ? next.startAt : Number.POSITIVE_INFINITY)
    if (s >= passAt) on = i + 1
    else break
  }
  return on
}

/* "Ravi Menon is not in it" said in a few words: "Doesn't cover Ravi". */
function reasonWords(reason: string, first: string): string {
  if (/ is not in (it|this policy)$/.test(reason)) return `Doesn't cover ${first}`
  return reason
}

/* The rule's requirement, after "needs": "below 40", "not in Corporate
   offices"; a zone's, a profile's or a group's name keeps its capital. */
const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

const MARK: Record<LineStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Passed' },
  fail: { Icon: X, label: 'Failed' },
  unknown: { Icon: CircleHelp, label: "Can't tell" },
}

function Mark({ status, working = false, label }: { status: LineStatus; working?: boolean; label?: string }) {
  if (working) return <Spinner small />
  const { Icon, label: said } = MARK[status]
  return (
    <span className={`rl-line__mark is-${status}`} role="img" aria-label={label ?? said}>
      <Icon size={13} strokeWidth={2.6} aria-hidden />
    </span>
  )
}

/** A card's number: its place in the engine's order; the last row is locked. */
function Num({ n }: { n: number | null }) {
  return (
    <span className="rl-line__num" aria-hidden>
      {n === null ? <Lock size={11} strokeWidth={2.2} /> : n}
    </span>
  )
}

// --- Press to see why -------------------------------------------------------------------

/* One note open at a time, under what was pressed: why a policy was passed
   over or applies, what a folded rule checked, how a check was read. It floats
   (out of the flow), so opening one never moves the line. */
interface NoteState {
  open: string | null
  toggle: (id: string, from: HTMLElement) => void
}
const NoteCtx = createContext<NoteState>({ open: null, toggle: () => {} })

const noteDomId = (id: string) => `rl-line-note-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

/* A card (or a check) that can be pressed: a real button — focus ring, Enter
   and Space — with its note beside it, never inside it. */
function Poke({ id, className, node, label, note, children }: { id: string; className: string; node?: string; label: string; note: ReactNode; children: ReactNode }) {
  const { open, toggle } = useContext(NoteCtx)
  const isOpen = open === id
  return (
    <div className={`rl-line__poke${isOpen ? ' is-open' : ''}`} data-card>
      <button
        type="button"
        className={`${className} is-poke${isOpen ? ' is-pressed' : ''}`}
        data-card
        data-node={node}
        aria-expanded={isOpen}
        aria-controls={isOpen ? noteDomId(id) : undefined}
        aria-label={label}
        onClick={(e) => toggle(id, e.currentTarget)}
      >
        {children}
      </button>
      {isOpen && (
        <motion.div
          id={noteDomId(id)}
          className="rl-line__note"
          role="note"
          data-card
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: EASE_OUT }}
        >
          {note}
        </motion.div>
      )}
    </div>
  )
}

/* A note's lines: the first said firmly, the rest quiet; a fix last. */
function NoteLines({ lines, fix }: { lines: readonly string[]; fix?: string }) {
  const said = [...new Set(lines.filter((l) => l && l.trim() !== ''))]
  return (
    <>
      {said.map((l, i) => (
        <p key={l} className={`rl-line__notep${i === 0 ? ' is-lead' : ''}`}>
          {l}
        </p>
      ))}
      {fix && <p className="rl-line__notefix">{fix}</p>}
    </>
  )
}

// --- The columns ------------------------------------------------------------------------

/* One stage: its quiet header (the only count), and its cards from `top`. */
function Column({ col, head, count, top, children, label, node }: { col: Col; head: string; count?: number; top: number; children: ReactNode; label: string; node?: string }) {
  return (
    <section className={`rl-line__col is-${col}`} style={{ width: COL_W[col] }} aria-label={label} data-node={node}>
      <h3 className="rl-line__head" title={head}>
        <span className="rl-line__headtext">{head}</span>
        {count !== undefined && <span className="rl-line__count">{count}</span>}
      </h3>
      <div className="rl-line__body" style={{ paddingTop: top - HEAD }}>
        {children}
      </div>
    </section>
  )
}

/* The sign-in: who, to what, and the facts the application's rules read —
   an unstated one said so, since the answer may hang on it. It starts the
   line but is never judged, so it never takes the answer's colour. */
function SignInCard({ props, landed }: { props: RunLayoutProps; landed: boolean }) {
  const { form, rows, asGroup, onPressPerson } = props
  const { users, groups, apps, zones } = useBrand()
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  const groupLine = asGroup ? `A member of ${asGroup}` : person ? groupNamesOf(person, groups).join(', ') : ''
  const ctx: SentenceContext = { people: users, apps, zones, rows }
  const facts = sentenceTokens(rows)
    .filter((t) => t !== 'person' && t !== 'app')
    .map((t) => tokenValue(t, form, ctx))
  const SHORT: Partial<Record<TokenId, string>> = { from: 'From', device: 'Device', when: 'When', risk: 'Risk' }
  const depends = props.plan.outcome.status === 'depends' && landed
  return (
    <button
      type="button"
      className="rl-line__card rl-line__sign is-chosen"
      data-card
      data-node="sign-in"
      onClick={onPressPerson}
      title="Change the sign-in"
    >
      <span className="rl-line__signhead">
        {person && <Face kind="user" name={person.name} size="md" decorative />}
        <span className="rl-line__signwho">
          <strong>{person?.name ?? 'Choose a person'}</strong>
          {groupLine && <span>{groupLine}</span>}
        </span>
      </span>
      <span className="rl-line__signapp">
        <ArrowRight className="rl-line__signto" size={13} strokeWidth={2} aria-hidden />
        {app && <AppLogo appId={app.id} name={app.name} size={16} />}
        <span>{app?.name ?? 'Choose an application'}</span>
      </span>
      {facts.length > 0 && (
        <span className="rl-line__facts">
          {facts.map((v) => (
            <span key={v.token} className={`rl-line__fact${v.unset ? ` is-unset${depends ? ' is-needed' : ''}` : ''}`}>
              <span className="rl-line__factlabel">{SHORT[v.token] ?? v.label}</span>
              <span className="rl-line__factmark" aria-hidden>
                <ValueMark v={v} size={12} />
              </span>
              <span className="rl-line__facttext">{v.unset ? 'Not stated' : v.text}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

/* A policy, where it stands at step `s`. */
function PolicyCard({
  p,
  where,
  s,
  first,
  tone,
  landed,
  conflict,
  also,
  ctx,
}: {
  p: EnginePolicy
  where: 'above' | 'line' | 'below'
  s: number
  first: string
  tone: Tone
  landed: boolean
  conflict: boolean
  also: boolean
  ctx: CardCtx
}) {
  const phase = policyPhase(p, s)
  const working = phase === 'working' || policyFound(p, s)
  const title = (
    <span className="rl-line__name" title={p.name}>
      {p.name}
    </span>
  )
  if (phase === 'waiting' && !working) {
    return (
      <div className={`rl-line__card rl-line__pol is-skel is-${where}`} data-card data-node={p.node} aria-label={`Policy ${p.order}`}>
        <span className="rl-line__cardhead">
          <Num n={p.order} />
          <span className="tj-skel is-line" />
        </span>
      </div>
    )
  }
  if (working) {
    return (
      <div className="rl-line__card rl-line__pol is-line is-working" data-card data-node={p.node}>
        <span className="rl-line__cardhead">
          <Num n={p.order} />
          {title}
          <Spinner small />
        </span>
        <span className="rl-line__sub">
          <span className="tj-skel is-short" />
        </span>
      </div>
    )
  }
  const findings = (ctx.findings ?? []).filter((f) => f.target.policyId === p.policyId && f.target.ruleId === null)
  const fLines = findings.map((f) => f.line || f.title)
  const fFix = findings.find((f) => f.fix)?.fix
  if (where === 'line' && p.decides) {
    const why = p.isGlobalDefault ? 'None above applies' : `First that covers ${first}`
    const note = (
      <NoteLines
        lines={[
          p.isGlobalDefault ? `No policy above it covers ${first}: the Global Default applies` : `The first policy on ${ctx.appName} that covers ${first}${ctx.deciderVia ? `, ${ctx.deciderVia}` : ''}`,
          ctx.ruleWhy,
          p.tip,
          ...fLines,
        ]}
        fix={fFix}
      />
    )
    return (
      <Poke id={p.node} node={p.node} className={`rl-line__card rl-line__pol is-line is-chosen${landed ? ` is-${tone}` : ''}`} label={`${p.order}. ${p.name}: applies. Why`} note={note}>
        <span className="rl-line__cardhead">
          <Num n={p.order} />
          {title}
          <Mark status="pass" label="Decides" />
        </span>
        <span className="rl-line__sub">{why}</span>
      </Poke>
    )
  }
  if (where === 'below') {
    if (conflict || also) {
      const pc = ctx.cover
      const would = pc
        ? pc.status === 'decided' && pc.decision
          ? `On its own: ${DECISION_WORDS[pc.decision]}${pc.ruleNumber !== null ? ` · rule ${pc.ruleNumber}` : ''}`
          : pc.possible.length > 0
            ? `On its own: ${pc.possible.map((d) => DECISION_WORDS[d]).join(' or ')}`
            : ''
        : ''
      const note = <NoteLines lines={[pc ? `Covers ${first} ${pc.via.say}`.trim() : `Also covers ${first}`, pc?.notUsed ?? '', would]} fix={pc?.fix || fFix} />
      return (
        <Poke id={p.node} node={p.node} className={`rl-line__card rl-line__pol is-below is-also${conflict ? ' is-conflict' : ''}`} label={`${p.order}. ${p.name}: also covers ${first}, not used. Why`} note={note}>
          <span className="rl-line__cardhead">
            <Num n={p.order} />
            {title}
          </span>
          <span className="rl-line__sub rl-line__tag">
            {conflict && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
            Also covers {first} · not used
          </span>
        </Poke>
      )
    }
    const said = p.reason && !/^not reached$/i.test(p.reason) ? p.reason : ''
    const note = <NoteLines lines={[ctx.deciderName ? `Not read: ${ctx.deciderName} applies first` : 'Not read', said, p.tip, ...fLines]} fix={fFix} />
    return (
      <Poke id={p.node} node={p.node} className="rl-line__card rl-line__pol is-below is-dim" label={`${p.order}. ${p.name}: not read. Why`} note={note}>
        <span className="rl-line__cardhead">
          <Num n={p.order} />
          {title}
        </span>
      </Poke>
    )
  }
  /* Read and passed over (or, with nothing deciding, the last one asked). */
  const note = <NoteLines lines={[p.reason || 'Not used', p.tip, ...fLines]} fix={fFix} />
  return (
    <Poke id={p.node} node={p.node} className={`rl-line__card rl-line__pol is-${where} is-passed`} label={`${p.order}. ${p.name}: ${p.reason || 'not used'}. Why`} note={note}>
      <span className="rl-line__cardhead">
        <Num n={p.order} />
        {title}
      </span>
      <span className="rl-line__sub">{reasonWords(p.reason, first) || 'Not used'}</span>
    </Poke>
  )
}

/* What a card's note needs to know about the run around it. */
interface CardCtx {
  appName: string
  /** The policy that decides, by name. */
  deciderName: string
  /** How the deciding policy covers the person: "via Engineering". */
  deciderVia: string
  /** "Rule 2 matched: Engineers on a compliant device". */
  ruleWhy: string
  /** This policy, as a later policy that also covers the person. */
  cover?: PolicyConflict
  findings?: readonly Finding[]
}

/* One check, read across: what it is; what the sign-in showed (a Who that
   passed, the way in: "Maya Iyer · via Engineering"), and under it what the
   rule needs ("needs Engineering, DevOps") — the fact and the requirement
   never run together into one claim; then the mark. */
function CheckBody({ word, fact, by, need, status, working, label }: { word: string; fact: string; by?: string; need: string; status: LineStatus; working: boolean; label?: string }) {
  return (
    <>
      <span className="rl-line__cword">{word}</span>
      <span className="rl-line__ctext">
        <span className="rl-line__cfact">
          <span className="rl-line__cval">{fact}</span>
          {by && <span className="rl-line__cvia"> · {by}</span>}
        </span>
        {need && (
          <span className="rl-line__cneed">
            <span className="rl-line__cjoin">needs </span>
            {lowerFirst(need)}
          </span>
        )}
      </span>
      <Mark status={status} working={working} label={working ? undefined : label} />
    </>
  )
}

const viaOf = (c: CheckRow, working: boolean, via?: Via): string => (c.category === 'who' && c.status === 'pass' && !working && via?.matches ? via.say : '')

/* A check of the rule on the line. Once read, a press says how it was read:
   each of its parts (a device profile's checks, a zone's two halves), the
   fact against the requirement. */
function CheckLine({ c, working, via, noteKey }: { c: CheckRow; working: boolean; via?: Via; noteKey: string }) {
  const body = <CheckBody word={c.word} fact={c.missing ? 'Not stated' : c.value} by={viaOf(c, working, via)} need={c.requirement} status={c.status} working={working} label={c.line || undefined} />
  if (working) return <li className="rl-line__check is-working">{body}</li>
  return (
    <li className={`rl-line__check is-${c.status}`}>
      <Poke id={noteKey} className="rl-line__crow" label={`${c.word}: how it was read`} note={<CheckNote c={c} />}>
        {body}
      </Poke>
    </li>
  )
}

/* What a check was read on, part by part; a check of one part says its sentence. */
function CheckNote({ c }: { c: CheckRow }) {
  const parts = c.subs.filter((x) => x.label || x.actual || x.required)
  if (parts.length <= 1) return <p className="rl-line__notep">{c.line || c.say || c.tip}</p>
  return (
    <ul className="rl-line__parts">
      {parts.map((x) => (
        <li key={x.key} className={`rl-line__part is-${x.status}`}>
          <CheckBody word={x.label} fact={x.actual || 'Not stated'} need={x.required} status={x.status} working={false} />
        </li>
      ))}
    </ul>
  )
}

/** What a rule passed over is folded to: its mark and the check that ended it. */
function foldLine(r: EngineRule): { status: LineStatus | 'off'; text: string } {
  if (r.state === 'off') return { status: 'off', text: 'Switched off' }
  if (r.state === 'unknown' || r.state === 'possible') {
    const c = r.checks.find((x) => x.status === 'unknown')
    return { status: 'unknown', text: c ? `${c.word} · not stated` : "Can't tell" }
  }
  if (r.miss) return { status: 'fail', text: r.miss }
  const c = r.failing !== null ? r.checks[r.failing] : undefined
  return { status: 'fail', text: c ? c.say : 'No match' }
}

/* A rule, where it stands at step `s`. */
function RuleCard({
  r,
  where,
  s,
  tone,
  landed,
  reading,
  first,
  matchedFirst,
  clash,
}: {
  r: EngineRule
  where: 'above' | 'line' | 'below'
  s: number
  tone: Tone
  landed: boolean
  reading: boolean
  first: string
  /** "Rule 2 matched first", for a rule never read. */
  matchedFirst: string
  /** This rule also applies to the person, once landed: a conflict (amber) or worth knowing. */
  clash?: RuleConflict
}) {
  const n = r.index === null ? null : r.index + 1
  const title = (
    <span className="rl-line__name" title={r.name}>
      {r.name}
    </span>
  )
  const result = traceResult(r, s)
  const then = r.index === null && r.state === 'possible' ? `If not · ${DECISION_WORDS[r.decision]}` : DECISION_WORDS[r.decision]
  if (where === 'above') {
    const f = foldLine(r)
    const read = r.checks.slice(0, Math.max(r.checked, r.failing !== null ? r.failing + 1 : 0))
    const note =
      f.status === 'off' || read.length === 0 ? (
        <NoteLines lines={[f.status === 'off' ? 'Switched off: passed over, nothing asked' : f.text]} />
      ) : (
        <>
          <ul className="rl-line__parts">
            {read.map((c, k) => (
              <li key={c.key || k} className={`rl-line__part is-${c.status}`}>
                <CheckBody word={c.word} fact={c.missing ? 'Not stated' : c.value} by={viaOf(c, false, r.via)} need={c.requirement} status={c.status} working={false} label={c.line || undefined} />
              </li>
            ))}
          </ul>
          <p className="rl-line__notethen">
            <span className="rl-line__cword">Then</span>
            <span>{then}</span>
            <span className="rl-line__notequiet">{f.status === 'unknown' ? "· can't tell, read on" : '· not used'}</span>
          </p>
        </>
      )
    return (
      <Poke id={r.node} node={r.node} className={`rl-line__card rl-line__rule is-above is-passed is-${f.status}`} label={`Rule ${n ?? ''} ${r.name}: ${f.text}. Its checks`} note={note}>
        <span className="rl-line__cardhead">
          <Num n={n} />
          {title}
          {f.status !== 'off' && <Mark status={f.status} />}
        </span>
        <span className="rl-line__sub">{f.text}</span>
      </Poke>
    )
  }
  if (where === 'below') {
    if (clash && landed) {
      const conflict = clash.kind === 'conflict'
      const note = (
        <NoteLines
          lines={[`Also applies to ${first} ${clash.via.say}`.trim(), clash.notUsed, `Then ${then}`]}
          fix={clash.fix ? `${clash.fix}${clash.caution ? `. ${clash.caution}` : ''}` : undefined}
        />
      )
      return (
        <Poke id={r.node} node={r.node} className={`rl-line__card rl-line__rule is-below is-also${conflict ? ' is-conflict' : ''}`} label={`Rule ${n ?? ''} ${r.name}: also applies to ${first}, not used. Why`} note={note}>
          <span className="rl-line__cardhead">
            <Num n={n} />
            {title}
          </span>
          <span className="rl-line__sub rl-line__tag">
            {conflict && <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />}
            {clash.match === 'unknown' ? `Might apply to ${first}` : `Also applies to ${first}`} · not used
          </span>
        </Poke>
      )
    }
    const note = <NoteLines lines={[r.state === 'off' ? 'Switched off' : `Not read: ${matchedFirst}`, `Then ${then}`]} />
    return (
      <Poke id={r.node} node={r.node} className="rl-line__card rl-line__rule is-below is-dim" label={`Rule ${n ?? ''} ${r.name}: not read. Why`} note={note}>
        <span className="rl-line__cardhead">
          <Num n={n} />
          {title}
        </span>
      </Poke>
    )
  }
  /* On the line: open, its checks arriving one by one. */
  const working = reading && (result === 'reading' || result === 'waiting')
  const read = r.checks.slice(0, r.checked).map((c, k) => ({ c, k, phase: checkPhase(r, k, s) })).filter((x) => x.phase !== 'hidden')
  const matched = result === 'matched'
  /* One spinner at a time: the head's while the rule opens, then the row's being read. */
  const rowWorking = read.some((x) => x.phase === 'working')
  const head: ReactNode =
    result === 'reading' ? (
      rowWorking ? null : <Spinner small />
    ) : result === 'matched' ? (
      <Mark status="pass" label="Matches" />
    ) : result === 'missed' || result === 'folded' ? (
      <Mark status="fail" label="No match" />
    ) : result === 'unknown' ? (
      <Mark status="unknown" />
    ) : null
  const showThen = matched || result === 'possible' || (r.index === null && result !== 'waiting')
  const ring = working ? ' is-working' : matched || result === 'possible' || (r.index === null && showThen) ? ` is-chosen${landed ? ` is-${tone}` : ''}` : ''
  return (
    <div className={`rl-line__card rl-line__rule is-line is-open${ring}`} data-card data-node={r.node}>
      <span className="rl-line__cardhead">
        <Num n={n} />
        {title}
        {head}
      </span>
      {read.length > 0 && (
        <ul className="rl-line__checks">
          {read.map(({ c, k, phase }) => (
            <CheckLine key={c.key || k} c={c} working={phase === 'working'} via={r.via} noteKey={`${r.node}:${c.key || k}`} />
          ))}
        </ul>
      )}
      {showThen && (
        <p className="rl-line__then">
          <span className="rl-line__cword">Then</span>
          <span className="rl-line__thenword">{result === 'possible' ? then : DECISION_WORDS[r.decision]}</span>
        </p>
      )}
    </div>
  )
}

/* The answer: the verdict, who decided (the way to that rule), the factors
   the person is asked for — or the message they are refused with — and What
   they see on demand, under it. */
const DECISION_ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }

function OutcomeCard({
  props,
  tone,
  animate,
  note,
  onNote,
}: {
  props: RunLayoutProps
  tone: Tone
  animate: boolean
  note: string | null
  onNote: (id: string, from: HTMLElement) => void
}) {
  const seeOpen = note === 'see'
  const findingsOpen = note === 'findings'
  const { plan, screens, form, changed, expected, weaker, columns, onOpenRule, onOpenPolicy } = props
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? DECISION_ICON[decided] : Split
  const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides'
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const where = landing ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1}`) : ''
  /* A Depends is not decided by the rule the walk stopped at: it names the policy only. */
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
  const line = {
    out: { opacity: 0 },
    in: { opacity: 1, transition: { duration: animate ? 0.24 : 0, ease: EASE_OUT } },
  }
  return (
    <motion.div
      className={`rl-line__card rl-line__out is-line is-landed is-${tone}`}
      data-card
      data-node="outcome"
      role="group"
      aria-label={`Decision: ${word}${o.policyName ? `, by ${o.policyName}` : ''}`}
      initial={animate ? { opacity: 0, x: -16 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={animate ? { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } : { duration: 0 }}
    >
      <motion.div className="rl-line__outin" initial={animate ? 'out' : false} animate="in" variants={{ out: {}, in: { transition: animate ? { staggerChildren: 0.07, delayChildren: 0.1 } : {} } }}>
        <span className="rl-line__cardhead rl-line__verdict">
          <span className="rl-line__tile" aria-hidden>
            <Icon size={18} strokeWidth={2} />
          </span>
          <span className="rl-line__word">{word}</span>
          {mark === 'fails' && expected && (
            <span className="rl-line__expect" title={`This sign-in expects ${DECISION_WORDS[expected]}`}>
              <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
              Expected {DECISION_WORDS[expected]}
            </span>
          )}
          {mark === 'weaker' && (
            <span className="rl-line__expect" title={weaker || undefined}>
              <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
              Weaker factor
            </span>
          )}
        </span>
        {by && (
          <motion.p className="rl-line__by" variants={line}>
            <span className="rl-line__bylabel">{decided ? 'Decided by' : 'Policy'}</span>
            <button type="button" className="rl-line__bylink" title={`Open ${where && decided ? `${where} of ` : ''}${o.policyName ?? 'the policy'}`} onClick={open}>
              <span>{by}</span>
              <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
            </button>
          </motion.p>
        )}
        {factors.length > 0 && !deny && (
          <motion.ol className="rl-line__factors" variants={line} aria-label="Asked for">
            {factors.map((st, i) => (
              <li key={`${st.kind}:${i}`}>
                {i > 0 && <ChevronRight className="rl-line__then-arrow" size={12} strokeWidth={2.2} aria-hidden />}
                <span className="rl-line__factor">{stepLabel(st)}</span>
              </li>
            ))}
          </motion.ol>
        )}
        {deny && deny.kind === 'deny' && (
          <motion.p className="rl-line__deny" variants={line} title={deny.message}>
            “{deny.message}”
          </motion.p>
        )}
        {o.status === 'depends' && o.view.outcomes.length > 0 && (
          <motion.ul className="rl-line__ifs" variants={line}>
            {o.view.outcomes.map((x) => (
              <li key={`${x.label}:${x.decision}`}>
                <span className="rl-line__if">{x.label}</span>
                <span className="rl-line__ifword">{DECISION_WORDS[x.decision]}</span>
              </li>
            ))}
          </motion.ul>
        )}
        {o.status === 'depends' && o.view.needs.length > 0 && (
          <motion.p className="rl-line__needs" variants={line}>
            <CircleHelp size={12} strokeWidth={2.2} aria-hidden />
            Needs {o.view.needs.join(', ').toLowerCase()}
          </motion.p>
        )}
        {versus && (
          <motion.p className="rl-line__vs" variants={line}>
            {versus.was.label} {answerWords(versus.was)}
            <ArrowRight size={12} strokeWidth={2} aria-hidden />
            {versus.now.label} {answerWords(versus.now)}
          </motion.p>
        )}
        {(changed || count || see) && (
          <motion.p className="rl-line__foot" variants={line}>
            {count && (
              <button
                type="button"
                className={`rl-line__finding${count.conflict ? ' is-conflict' : ''}${findingsOpen ? ' is-open' : ''}`}
                aria-expanded={findingsOpen}
                onClick={(e) => onNote('findings', e.currentTarget)}
              >
                {count.conflict ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
                {count.text}
              </button>
            )}
            {changed && <span className="rl-line__changed">Changed by {changed}</span>}
            {see && (
              <button type="button" className={`rl-line__seebtn${seeOpen ? ' is-open' : ''}`} aria-expanded={seeOpen} onClick={(e) => onNote('see', e.currentTarget)}>
                What they see
                {seeOpen ? <ChevronDown size={13} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={13} strokeWidth={2.2} aria-hidden />}
              </button>
            )}
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  )
}

// --- The line ---------------------------------------------------------------------------

export default function LineLayout(props: RunLayoutProps) {
  const { plan, s, running, animate, reduced, jumped, runKey, form, screens, asGroup } = props
  const { users } = useBrand()
  const stage = useRef<StageView | null>(null)
  const slots = useRef<Partial<Record<Col, HTMLDivElement | null>>>({})
  const seeRef = useRef<HTMLDivElement | null>(null)
  /* The one note open — a card's why, the answer's findings, What they see — and what opened it. */
  const [note, setNote] = useState<string | null>(null)
  const noteFrom = useRef<HTMLElement | null>(null)
  const [noteFor, setNoteFor] = useState(runKey)
  if (noteFor !== runKey) {
    setNoteFor(runKey)
    setNote(null)
  }
  const toggleNote = useCallback((id: string, from: HTMLElement) => {
    noteFrom.current = from
    setNote((n) => (n === id ? null : id))
  }, [])
  const notes = useMemo<NoteState>(() => ({ open: note, toggle: toggleNote }), [note, toggleNote])
  const seeOpen = note === 'see'

  const settled = useMemo(() => settledOf(plan), [plan])
  const LINE_TOP = HEAD + settled.above * STEP
  const tone = toneOf(plan)
  const at = plan.at
  const step = plan.steps[s]
  const last = s >= plan.steps.length - 1
  const landed = last || (at.outcome >= 0 && s >= at.outcome)

  const person = users.find((u) => u.id === form.personId) ?? null
  const first = asGroup ?? (person ? firstName(person.name) : plan.conflicts?.personName ? firstName(plan.conflicts.personName) : 'them')

  /* Policies: shown from the stack's first step; the one on the line now, and the glide to it. */
  const decider = plan.policies[settled.pol]
  const polShown = s >= Math.max(0, at.which)
  const polOn = policyOnLine(plan, s, settled.pol)
  const polY = (settled.pol - polOn) * STEP
  const conflictIds = useMemo(
    () => new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId)),
    [plan.conflicts],
  )
  const alsoIds = useMemo(() => new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId)), [plan.conflicts])

  /* What the cards' notes say about the run around them. */
  const findings = useMemo(() => (plan.conflicts?.findings ?? []).filter((f) => !isQuiet(f)), [plan.conflicts])
  const cardCtx = useMemo<CardCtx>(() => {
    const dv = plan.conflicts?.policies[0]?.deciderVia
    return {
      appName: plan.appName,
      deciderName: plan.decider?.name ?? '',
      deciderVia: dv?.matches ? dv.say : '',
      ruleWhy: policyWhy(plan),
      findings,
    }
  }, [plan, findings])
  const covers = useMemo(() => new Map((plan.conflicts?.policies ?? []).map((p) => [p.policyId, p])), [plan.conflicts])
  const clashes = useMemo(() => new Map((plan.conflicts?.rules ?? []).map((r) => [r.ruleId, r])), [plan.conflicts])
  const landingRule = settled.rule >= 0 ? plan.rules[settled.rule] : undefined
  const matchedFirst = landingRule && landingRule.index !== null && plan.landing !== null ? `rule ${landingRule.index + 1} matched first` : 'the walk stopped before it'

  /* Rules: shown once the policy that decides opens. */
  const rulesShown = decider !== undefined && decider.decides && policyOpen(decider, s) && settled.rule >= 0
  const ruleOn = settled.rule >= 0 ? ruleOnLine(plan.rules, settled.rule, s) : 0
  const ruleY = (settled.rule - ruleOn) * STEP
  const reading = rulesShown && !landed && (step?.kind === 'rule' || step?.kind === 'check' || step?.kind === 'checked' || step?.kind === 'rule-end' || step?.kind === 'compact' || step?.kind === 'expand')

  const deciding = step?.kind === 'deciding' && !landed
  const outShown = landed && plan.outcome.view !== undefined

  /* The path, in the gaps: grey behind the engine, blue where it works, the answer's tone once it lands. */
  const working: Col | null = landed ? null : deciding ? 'out' : rulesShown ? 'rule' : polShown ? 'pol' : null
  const segs: { from: Col; to: Col; shown: boolean }[] = [
    { from: 'sign', to: 'pol', shown: polShown },
    { from: 'pol', to: 'rule', shown: rulesShown },
    { from: 'rule', to: 'out', shown: deciding || landed },
  ]
  const segTone = (to: Col) => (landed ? `is-${tone}` : working === to ? 'is-working' : 'is-drawn')

  /* The rules' header names the policy only once it has opened: before that, the engine has not found it. */
  const ruleHead = plan.decider && rulesShown ? `Rules in ${plan.decider.name}` : 'Rules'
  const factCount = sentenceTokens(props.rows).filter((t) => t !== 'person' && t !== 'app').length
  const minHeight = useMemo(() => heightOf(plan, settled, LINE_TOP, factCount), [plan, settled, LINE_TOP, factCount])
  const ruleCount = plan.rules.filter((r) => r.index !== null).length

  // --- The camera ---

  /* A new run starts at full size, the sign-in in view; a settled one (a
     revisit, Skip, reduced motion) is fitted at once. */
  const fittedFor = useRef<number | null>(null)
  useLayoutEffect(() => {
    const v = stage.current
    if (!v) return
    if (running && animate && !landed) {
      fittedFor.current = null
      v.fit({ min: 1, max: 1, jump: true })
      v.follow(slots.current.sign, { lazy: true, jump: true })
    } else {
      fittedFor.current = runKey
      v.fit({ max: 1, jump: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new run, and as the layout mounts
  }, [runKey])

  /* While it plays: the column the engine works in, kept in view. */
  useEffect(() => {
    if (!running || landed) return
    const node = activeNode(plan, s)
    const col: Col | null = node === 'outcome' ? 'out' : node?.startsWith('rule:') ? 'rule' : node?.startsWith('policy:') ? 'pol' : null
    if (col) stage.current?.follow(slots.current[col], { lazy: true, jump: reduced })
  }, [s, running, landed, plan, reduced])

  /* Landed: the whole line in view, once a run. */
  useEffect(() => {
    if (!landed || fittedFor.current === runKey) return
    fittedFor.current = runKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, runKey, reduced, jumped, animate])

  /* The canvas changed size (the panel opened or shut, the window): a landed run is fitted again. */
  const worldRef = useRef<HTMLDivElement | null>(null)
  const settledNow = useRef(!running)
  settledNow.current = !running
  useEffect(() => {
    const ground = worldRef.current?.closest('.rstage')
    if (!ground || typeof ResizeObserver === 'undefined') return
    let last = ''
    let frame = 0
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      const size = `${Math.round(r.width)}x${Math.round(r.height)}`
      if (size === last) return
      const first = last === ''
      last = size
      if (first || !settledNow.current) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => stage.current?.fit({ max: 1, jump: true }))
    })
    ro.observe(ground)
    return () => {
      ro.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])

  /* A later policy that also covers the person: one dashed branch off the
     line, in the gap before the policies, into its card — never a second path.
     Measured by offsets (the stack's glide is a transform), once landed. */
  const [branches, setBranches] = useState<number[]>([])
  useLayoutEffect(() => {
    const world = worldRef.current
    if (!landed || !world) {
      setBranches((b) => (b.length ? [] : b))
      return
    }
    const ys: number[] = []
    world.querySelectorAll<HTMLElement>('.rl-line__pol.is-conflict').forEach((el) => {
      let y = 0
      let n: HTMLElement | null = el
      while (n && n !== world) {
        y += n.offsetTop
        n = n.offsetParent as HTMLElement | null
      }
      if (n === world) ys.push(y + el.offsetHeight / 2)
    })
    setBranches((b) => (b.length === ys.length && b.every((v, i) => v === ys[i]) ? b : ys))
  }, [landed, plan, runKey])

  /* A note opened: brought into view (What they see under the answer, a card's
     under the card). Escape, or a press anywhere else, shuts it; Escape hands
     the focus back to what opened it. */
  useEffect(() => {
    if (!note) return
    const id = window.requestAnimationFrame(() => {
      const el = note === 'see' ? seeRef.current : worldRef.current?.querySelector('.rl-line__note')
      stage.current?.follow(el, { lazy: true, jump: reduced })
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setNote(null)
      noteFrom.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (t?.closest('.rl-line__note, .rl-line__see, [aria-expanded="true"]')) return
      setNote(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.cancelAnimationFrame(id)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [note, reduced])

  const stackGlide = animate ? GLIDE : { duration: 0 }
  const enter = (shown: boolean) => ({
    initial: animate ? { opacity: 0 } : false,
    animate: { opacity: shown ? 1 : 0 },
    transition: { duration: animate ? 0.3 : 0, ease: EASE_OUT },
  })

  const slot = (col: Col) => (
    <div
      key={col}
      ref={(el) => {
        slots.current[col] = el
      }}
      className="rl-line__slot"
      style={{ left: COL_X[col], top: LINE_TOP, width: COL_W[col], height: ROW } as CSSProperties}
      aria-hidden
    />
  )

  return (
    <RunStage ref={stage} reduced={reduced} className="rl-line" pad={{ left: 32, right: 32 }} label={`Sign-in run: ${plan.appName}`}>
      <NoteCtx.Provider value={notes}>
      <div key={runKey} ref={worldRef} className="rl-line__world" style={{ width: WORLD_W, minHeight } as CSSProperties}>
        {(['sign', 'pol', 'rule', 'out'] as const).map(slot)}

        {branches.length > 0 && (
          <motion.svg
            className="rl-line__branches"
            width={GAP / 2 + 1}
            height={Math.max(...branches) + 2}
            style={{ left: COL_X.pol - GAP / 2 - 1, top: 0 }}
            initial={animate ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: animate ? 0.3 : 0, delay: animate ? 0.4 : 0 }}
            aria-hidden
          >
            {branches.map((y) => {
              const x0 = 1
              const y0 = LINE_TOP + PORT + 1
              const r = Math.min(6, Math.max(0, y - y0))
              return <path key={y} d={`M ${x0} ${y0} V ${y - r} Q ${x0} ${y} ${x0 + r} ${y} H ${GAP / 2 + 1}`} />
            })}
          </motion.svg>
        )}

        {/* The path: one 2px line in the gaps between the chosen cards. */}
        {segs.map((g) =>
          g.shown ? (
            <motion.span
              key={g.to}
              className={`rl-line__seg ${segTone(g.to)}`}
              style={{ left: COL_X[g.from] + COL_W[g.from], width: GAP, top: LINE_TOP + PORT - 1, originX: 0 }}
              initial={animate ? { scaleX: 0 } : false}
              animate={{ scaleX: 1 }}
              transition={{ duration: animate ? 0.32 : 0, ease: EASE_OUT }}
              aria-hidden
            />
          ) : null,
        )}

        <Column col="sign" head="Sign-in" top={LINE_TOP} label="Sign-in">
          <SignInCard props={props} landed={landed} />
        </Column>

        <Column col="pol" head={`Policies on ${plan.appName}`} count={plan.policies.length} top={LINE_TOP - settled.pol * STEP} label={`Policies on ${plan.appName}`} node="which">
          <motion.div {...enter(polShown)}>
            <motion.div className="rl-line__stack" initial={false} animate={{ y: polY }} transition={stackGlide}>
              {plan.policies.map((p, i) => (
                <PolicyCard
                  key={p.policyId}
                  p={p}
                  where={i < polOn ? 'above' : i === polOn ? 'line' : 'below'}
                  s={s}
                  first={first}
                  tone={tone}
                  landed={landed}
                  conflict={landed && i > settled.pol && conflictIds.has(p.policyId)}
                  also={landed && i > settled.pol && alsoIds.has(p.policyId)}
                  ctx={i > settled.pol && covers.has(p.policyId) ? { ...cardCtx, cover: covers.get(p.policyId) } : cardCtx}
                />
              ))}
            </motion.div>
          </motion.div>
        </Column>

        <Column col="rule" head={ruleHead} count={plan.decider && rulesShown ? ruleCount : undefined} top={LINE_TOP - Math.max(0, settled.rule) * STEP} label={ruleHead}>
          {rulesShown ? (
            <motion.div {...enter(true)}>
              <motion.div className="rl-line__stack" initial={false} animate={{ y: ruleY }} transition={stackGlide}>
                {plan.rules.map((r, i) => (
                  <RuleCard
                    key={r.id}
                    r={r}
                    where={i < ruleOn ? 'above' : i === ruleOn ? 'line' : 'below'}
                    s={s}
                    tone={tone}
                    landed={landed}
                    reading={reading}
                    first={first}
                    matchedFirst={matchedFirst}
                    clash={i > settled.rule ? clashes.get(r.id) : undefined}
                  />
                ))}
              </motion.div>
            </motion.div>
          ) : !plan.decider && landed ? (
            <div className="rl-line__card rl-line__ghost is-line" data-card style={{ marginTop: Math.max(0, settled.rule) * STEP }}>
              <span className="rl-line__cardhead">
                <span className="rl-line__name">No policy decides</span>
              </span>
            </div>
          ) : (
            !landed && <div className="rl-line__card rl-line__ghost is-line is-empty" style={{ marginTop: Math.max(0, settled.rule) * STEP }} aria-hidden />
          )}
        </Column>

        <Column col="out" head="Outcome" top={LINE_TOP} label="Outcome">
          {outShown ? (
            <>
              <OutcomeCard props={props} tone={tone} animate={animate} note={note} onNote={toggleNote} />
              {note === 'findings' && findings.length > 0 && (
                <motion.div
                  className="rl-line__card rl-line__see rl-line__findings"
                  data-card
                  role="note"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduced ? 0 : 0.2, ease: EASE_OUT }}
                >
                  <ul className="rl-line__flist">
                    {findings.map((f, i) => (
                      <li key={`${f.kind}:${i}`} className={f.tone === 'conflict' ? 'is-conflict' : undefined}>
                        <span className="rl-line__fhead">
                          {f.tone === 'conflict' ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
                          {f.title}
                        </span>
                        {f.line && f.line !== f.title && <span className="rl-line__fline">{f.line}</span>}
                        {f.fix && <span className="rl-line__notefix">{f.fix}</span>}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
              {seeOpen && screens.length > 0 && form.appId && (
                <motion.div
                  ref={seeRef}
                  className="rl-line__card rl-line__see"
                  data-card
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduced ? 0 : 0.2, ease: EASE_OUT }}
                >
                  <WhatTheySee screens={screens} appId={form.appId} compact collapsible={false} />
                </motion.div>
              )}
            </>
          ) : (
            <div className={`rl-line__card rl-line__ghost is-line${deciding ? ' is-working' : ' is-empty'}`} data-card data-node="outcome" aria-label="Outcome">
              {deciding && (
                <span className="rl-line__cardhead">
                  <Spinner small />
                </span>
              )}
            </div>
          )}
        </Column>
      </div>
      </NoteCtx.Provider>
    </RunStage>
  )
}
