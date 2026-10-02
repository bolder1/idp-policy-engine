import { motion, type Transition } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Info,
  KeyRound,
  Lock,
  Minus,
  RotateCcw,
  ShieldCheck,
  Split,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'

import { memberGroupIds, type AccessDecision, type Policy, type Rule, type User } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { Tip } from '../../../kit'
import { AppLogo } from '../../../logos/AppLogo'
import { leaves } from '../../../predicate'
import { useBrand, useNameLookup } from '../../../store'
import type { LineStatus } from '../../testing/evidence'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import { answerWords, sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../../testing/sign-in-sentence'
import { conditionRequirement, whoRequirement, type NameLookup, type PillCategory } from '../../testing/trace-pills'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { PolicyConflict, RuleConflict, Via } from '../conflicts'
import { CATEGORY_WORD, activeNode, checkPhase, policyFound, type CheckRow, type EnginePolicy, type EngineRule, type EngineRun, type StepKind } from '../engine-run'
import { expectMark, findingsCount, traceResult, type TraceResult } from '../journey'
import { Spinner } from '../PolicyStack'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import { stepMs } from '../use-engine-run'
import { RunStage, type StageView } from './RunStage'
import type { RunLayoutProps } from './types'
import './deck.css'

/* -----------------------------------------------------------------------------
   The run as a deck (run-layout.ts `deck`): dealt and flipped.

     ┌ sign-in ┐   ┌ 1 AWS for engineering ✓ ┐  ┌ 2 AWS billing ┐ (amber: also covers)
     │ Maya    │   │ Applies · via Eng…      │  └───────────────┘
     └─────────┘   └─────────────────────────┘
     Policies 2       ┌R2 ✓┐ lifted                         ┌ Allow on 1 factor ┐
     [▒▒▒ deck ]   ┌R1 ✕┐│    │ ┌ 3 ┐ ┌ ✱ ┐ face down      │ Decided by …      │
     Passed over   └────┘└────┘ └───┘ └───┘                 └───────────────────┘
     [ discard ]

   The policies on the application are a deck, face down, in the engine's
   order. The engine draws the top card and flips it on the table: one that
   does not cover the person is tossed face up onto the discard pile, greyed,
   its reason in a few words; the first that covers stays in the middle, and
   its rules are dealt in a row, face down, in order. They are flipped one by
   one, their checks landing ✓ / ✕; a rule that fails slides down out of the
   row, its failing check in words; the first that matches lifts. The rules
   after it stay face down (not reached), "Nothing else matched" last. The
   outcome is dealt last, biggest, and flips face up.

   Everything is drawn from `s` (the plan's step): a card's place, its face
   and its edge are pure functions of where the run is, and each move lasts
   as long as the step that makes it (`stepMs`). Cards are placed by x / y on
   a table whose geometry is constant, so nothing is measured off a moving
   element; only the heights of the sign-in, the rule row and the outcome
   are read (offsetHeight) to size the table.

   Colour is meaning: blue only on the card the engine is working on; green
   for applies, ✓ and an allow; red for ✕ and a deny; amber only for a card
   that also covers the person, or a can't-tell. Once the answer lands, the
   cards it ran through take the answer's one tone.
   -------------------------------------------------------------------------- */

// --- The table (px, at zoom 1) -------------------------------------------------------------

const POL_W = 216
const POL_H = 100
const LEFT_W = POL_W
const GAP = 32
/** The middle of the table: the reading spot, and the rule row under it. */
const CX = LEFT_W + GAP
const RULE_W = 172
const RULE_G = 12
const ROW_Y = POL_H + 56
/** A rule that matched lifts; one that failed slides down. */
const LIFT = 16
const SLIDE = 22
const OUT_W = 264
const OUT_Y = ROW_Y - LIFT
/** The rules never reached, gathered face down once the match lands: each card's edge showing by this much. */
const FAN = 30
/** A passed-over card on the pile is a strip (its number, name and reason), each the next one's step down. */
const STRIP_H = 60
const PILE = 54
/** A card's depth in the deck, as an edge showing. */
const STACK = 4
const CAPTION = 26
const ALSO_GAP = 20
const EASE_OUT = [0.2, 0, 0, 1] as const

type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Two names said, the rest counted. */
function namesOf(names: readonly string[]): string {
  return `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`
}

/** How the deciding policy covers the person: "via Engineering", "by name", "everyone", "the fallback". */
function coverWords(p: Policy | undefined, person: User | null, isDefault: boolean, groupName: (id: string) => string): string {
  if (isDefault) return 'the fallback'
  if (!p || !person) return ''
  const a = p.audience
  if (a.everyone) return 'everyone'
  if (a.userIds.includes(person.id)) return 'by name'
  const gs = memberGroupIds(person).filter((g) => a.groupIds.includes(g))
  return gs.length > 0 ? `via ${namesOf(gs.map(groupName))}` : ''
}

/** A later policy's way in: "via Finance", "by name", "for everyone". */
function viaWords(v: Via): string {
  if (!v.matches) return ''
  if (v.kind === 'everyone') return 'for everyone'
  if (v.kind === 'person') return 'by name'
  return v.groups.length > 0 ? `via ${namesOf(v.groups.map((x) => x.name))}` : v.say
}

/** A passed-over policy's reason, in a few words. */
function reasonWords(p: EnginePolicy): string {
  const r = p.reason
  if (/ is not in (it|this policy)$/.test(r) || r === 'Not in this policy') return 'Not in it'
  if (r === 'Not turned on yet') return 'Not turned on'
  return r || 'Not used'
}

/* "Below 40" read on from "asks": "asks below 40"; a zone's or a profile's name keeps its capital. */
const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After|Outside) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

// --- The plan at a step --------------------------------------------------------------------

type PolWhere = 'hidden' | 'deck' | 'reading' | 'applies' | 'discard' | 'also'

interface PolView {
  where: PolWhere
  x: number
  y: number
  z: number
  /** Its index in the pile, the deck (0 = top) or the row of cards that also cover. */
  k: number
}

interface Geo {
  deckY: number
  discardY: number
}

function polWhere(p: EnginePolicy, s: number, plan: EngineRun, also: ReadonlySet<string>, decidingAt: number): PolWhere {
  if (plan.at.which < 0 || s < plan.at.which) return 'hidden'
  if (p.decides) {
    if (s >= p.settleAt) return 'applies'
    return p.scanAt !== null && s >= p.scanAt ? 'reading' : 'deck'
  }
  if (p.scanned) {
    if (s >= p.settleAt) return 'discard'
    return p.scanAt !== null && s >= p.scanAt ? 'reading' : 'deck'
  }
  return also.has(p.policyId) && decidingAt >= 0 && s >= decidingAt ? 'also' : 'deck'
}

function polViews(plan: EngineRun, s: number, geo: Geo, also: ReadonlySet<string>, decidingAt: number): PolView[] {
  let d = 0
  let k = 0
  let j = 0
  return plan.policies.map((p) => {
    const where = polWhere(p, s, plan, also, decidingAt)
    switch (where) {
      case 'hidden':
      case 'deck': {
        const depth = d++
        const o = Math.min(depth, 3) * STACK
        return { where, x: o, y: geo.deckY + o, z: 40 - Math.min(depth, 30), k: depth }
      }
      case 'reading':
        return { where, x: CX, y: 0, z: 90, k: 0 }
      case 'applies':
        return { where, x: CX, y: 0, z: 80, k: 0 }
      case 'discard': {
        const n = k++
        return { where, x: 0, y: geo.discardY + n * PILE, z: 50 + n, k: n }
      }
      case 'also': {
        const n = j++
        return { where, x: CX + POL_W + ALSO_GAP + n * (POL_W + 12), y: 0, z: 70, k: n }
      }
    }
  })
}

/** The steps a press of ‹ › moves between: every one that changes the table (a row arriving is the next one's spinner). */
const KEY_STEPS: ReadonlySet<StepKind> = new Set(['find', 'scan', 'found', 'decides', 'expand', 'rule', 'checked', 'rule-end', 'compact', 'deciding', 'outcome', 'done'])

/* A rule's rows as its definition has them — for a card turned over by hand
   that the engine never read: the category, and what it asks. */
interface DefRow {
  key: string
  word: string
  requirement: string
}
function defRowsOf(rule: Rule | undefined, names: NameLookup): DefRow[] {
  if (!rule) return []
  try {
    const out: { category: PillCategory; key: string; reqs: string[] }[] = []
    const add = (category: PillCategory, key: string, text: string) => {
      const g = out.find((x) => x.category === category)
      if (g) g.reqs.push(text)
      else out.push({ category, key, reqs: [text] })
    }
    if (rule.who) {
      const w = whoRequirement(rule, names)
      if (w.text) add('who', 'who', w.text)
    }
    for (const c of leaves(rule.when)) {
      const r = conditionRequirement(c, names)
      add(r.category, c.id, r.text)
    }
    return out.map((g) => ({ key: g.key, word: CATEGORY_WORD[g.category] ?? 'Check', requirement: g.reqs.join(', ') }))
  } catch {
    return []
  }
}

// --- Small pieces --------------------------------------------------------------------------

const MARK: Record<LineStatus, { Icon: LucideIcon; label: string }> = {
  pass: { Icon: Check, label: 'Passed' },
  fail: { Icon: X, label: 'Failed' },
  unknown: { Icon: CircleHelp, label: "Can't tell" },
}

/** A mark that lands: it pops in once, as it arrives. */
function Mark({ status, pop, label }: { status: LineStatus | 'none'; pop: boolean; label?: string }) {
  if (status === 'none') {
    return (
      <span className="rl-deck__mark is-none" role="img" aria-label={label ?? 'Not read'}>
        <Minus size={13} strokeWidth={2.4} aria-hidden />
      </span>
    )
  }
  const { Icon, label: said } = MARK[status]
  return (
    <motion.span
      className={`rl-deck__mark is-${status}`}
      role="img"
      aria-label={label ?? said}
      initial={pop ? { scale: 0.3, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop ? { type: 'spring', duration: 0.34, bounce: 0.45 } : { duration: 0 }}
    >
      <Icon size={13} strokeWidth={2.6} aria-hidden />
    </motion.span>
  )
}

function Num({ n }: { n: number | null }) {
  return (
    <span className="rl-deck__num" aria-hidden>
      {n === null ? <Lock size={11} strokeWidth={2.2} /> : n}
    </span>
  )
}

/** The press on a card: Enter or Space, as a button's. */
function onKeys(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }
}

// --- The sign-in ---------------------------------------------------------------------------

function SignInCard({ props, landed, cardRef }: { props: RunLayoutProps; landed: boolean; cardRef: (el: HTMLButtonElement | null) => void }) {
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
    <button ref={cardRef} type="button" className="rl-deck__sign" data-card data-node="sign-in" onClick={onPressPerson} title="Change the sign-in">
      <span className="rl-deck__signhead">
        {person && <Face kind="user" name={person.name} size="md" decorative />}
        <span className="rl-deck__signwho">
          <strong>{person?.name ?? 'Choose a person'}</strong>
          {groupLine && <span>{groupLine}</span>}
        </span>
      </span>
      <span className="rl-deck__signapp">
        <ArrowRight className="rl-deck__signto" size={13} strokeWidth={2} aria-hidden />
        {app && <AppLogo appId={app.id} name={app.name} size={16} />}
        <span>{app?.name ?? 'Choose an application'}</span>
      </span>
      {facts.length > 0 && (
        <span className="rl-deck__facts">
          {facts.map((v) => (
            <span key={v.token} className={`rl-deck__fact${v.unset ? ` is-unset${depends ? ' is-needed' : ''}` : ''}`}>
              <span className="rl-deck__factlabel">{SHORT[v.token] ?? v.label}</span>
              <span className="rl-deck__factmark" aria-hidden>
                <ValueMark v={v} size={12} />
              </span>
              <span className="rl-deck__facttext">{v.unset ? 'Not stated' : v.text}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

// --- A rule's face -------------------------------------------------------------------------

/* One check: what it is and its mark; the sign-in's fact (and, for a Who
   that let them in, the group it was by); what the rule asks. */
function CheckLine({ c, phase, via, pop }: { c: CheckRow; phase: 'hidden' | 'working' | 'settled'; via?: Via; pop: boolean }) {
  const by = c.category === 'who' && c.status === 'pass' && phase === 'settled' && via?.matches ? via.say : ''
  const fact = c.missing ? 'Not stated' : c.value
  return (
    <li className={`rl-deck__check is-${phase === 'settled' ? c.status : phase}`} title={phase === 'settled' ? c.tip || c.say || undefined : undefined} aria-hidden={phase === 'hidden' || undefined}>
      <span className="rl-deck__cword">
        <span>{c.word}</span>
        {phase === 'working' ? <Spinner small /> : phase === 'settled' ? <Mark status={c.status} pop={pop} label={c.line || undefined} /> : null}
      </span>
      <span className="rl-deck__cfact">
        {fact}
        {by && <span className="rl-deck__cvia"> {by}</span>}
      </span>
      <span className="rl-deck__creq">asks {lowerFirst(c.requirement)}</span>
    </li>
  )
}

interface RuleFaceProps {
  r: EngineRule
  s: number
  result: TraceResult
  /** Turned over by hand: the engine never read it. */
  peeked: boolean
  defRows: DefRow[]
  clash: RuleConflict | null
  pop: boolean
}

function RuleFront({ r, s, result, peeked, defRows, clash, pop }: RuleFaceProps) {
  const n = r.index === null ? null : r.index + 1
  const folded = result === 'folded'
  const rowWorking = r.checks.some((_, k) => checkPhase(r, k, s) === 'working')
  const head: ReactNode =
    result === 'reading' ? (
      rowWorking ? null : <Spinner small />
    ) : result === 'matched' ? (
      <Mark status="pass" pop={pop} label="Matches" />
    ) : result === 'missed' || result === 'folded' ? (
      <Mark status="fail" pop={pop} label="No match" />
    ) : result === 'unknown' || result === 'possible' ? (
      <Mark status="unknown" pop={pop} label={result === 'possible' ? 'If not' : "Can't tell"} />
    ) : result === 'off' ? (
      <Mark status="none" pop={false} label="Switched off" />
    ) : null
  const showThen = result === 'matched' || result === 'possible' || peeked || (r.index === null && result !== 'waiting' && result !== 'not-reached')
  /* A conflict's rule, turned over: the rows the resolver traced, with their marks. */
  const also = peeked && r.alsoChecks && r.alsoChecks.length > 0 ? r.alsoChecks : null
  return (
    <>
      <span className="rl-deck__rtop">
        <Num n={n} />
        {head}
      </span>
      <span className="rl-deck__rname" title={r.name}>
        {r.name}
      </span>
      {result === 'off' && <span className="rl-deck__rnote">Switched off</span>}
      {peeked && !also && defRows.length > 0 && (
        <ul className="rl-deck__checks">
          {defRows.map((d) => (
            <li key={d.key} className="rl-deck__check is-unread">
              <span className="rl-deck__cword">
                <span>{d.word}</span>
                <Mark status="none" pop={false} />
              </span>
              <span className="rl-deck__cfact">Not read</span>
              <span className="rl-deck__creq">asks {lowerFirst(d.requirement)}</span>
            </li>
          ))}
        </ul>
      )}
      {also && (
        <ul className="rl-deck__checks">
          {also.map((c, k) => (
            <CheckLine key={c.key || k} c={c} phase="settled" via={clash?.via} pop={false} />
          ))}
        </ul>
      )}
      {!peeked && r.checks.length > 0 && (
        <ul className="rl-deck__checks">
          {r.checks.map((c, k) => {
            const phase = checkPhase(r, k, s)
            if (folded && k !== r.failing) return null
            return <CheckLine key={c.key || k} c={c} phase={phase} via={r.via} pop={pop} />
          })}
        </ul>
      )}
      {showThen && (
        <span className="rl-deck__then">
          <span className="rl-deck__cword">Then</span>
          <span className="rl-deck__thenword">{result === 'possible' ? `If not · ${DECISION_WORDS[r.decision]}` : DECISION_WORDS[r.decision]}</span>
        </span>
      )}
      {peeked && clash && (
        <span className="rl-deck__rtag is-notice">
          <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
          Also applies{clash.via.say ? ` · ${clash.via.say}` : ''} · not used
        </span>
      )}
    </>
  )
}

function RuleBack({ r, clash }: { r: EngineRule; clash: RuleConflict | null }) {
  const n = r.index === null ? null : r.index + 1
  return (
    <span className="rl-deck__backin">
      {/* Top right: the edge a gathered card shows under the one before it. */}
      <span className="rl-deck__backnum">
        <Num n={n} />
      </span>
      <span className="rl-deck__backname" title={r.name}>
        {r.name}
      </span>
      {clash && (
        <span className="rl-deck__rtag is-notice">
          <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
          Also applies{clash.via.say ? ` · ${clash.via.say}` : ''}
        </span>
      )}
    </span>
  )
}

// --- The outcome's face --------------------------------------------------------------------

const DECISION_ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }

function OutcomeFront({ props, seeOpen, onSee, pop }: { props: RunLayoutProps; seeOpen: boolean; onSee: () => void; pop: boolean }) {
  const { plan, screens, form, changed, expected, weaker, columns, onOpenRule, onOpenPolicy } = props
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? DECISION_ICON[decided] : Split
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
  const line = { out: { opacity: 0, y: 4 }, in: { opacity: 1, y: 0, transition: { duration: pop ? 0.26 : 0, ease: EASE_OUT } } }
  return (
    <motion.span
      className="rl-deck__outin"
      initial={pop ? 'out' : false}
      animate="in"
      variants={{ out: {}, in: { transition: pop ? { staggerChildren: 0.07, delayChildren: 0.32 } : {} } }}
    >
      <span className="rl-deck__verdict">
        <span className="rl-deck__tile" aria-hidden>
          <Icon size={20} strokeWidth={2} />
        </span>
        <span className="rl-deck__word">{word}</span>
      </span>
      {mark && (
        <motion.span className="rl-deck__expect" variants={line} title={mark === 'weaker' ? weaker || undefined : expected ? `This sign-in expects ${DECISION_WORDS[expected]}` : undefined}>
          <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
          {mark === 'weaker' ? 'Weaker factor' : expected ? `Expected ${DECISION_WORDS[expected]}` : ''}
        </motion.span>
      )}
      {by && (
        <motion.span className="rl-deck__by" variants={line}>
          <span className="rl-deck__bylabel">{decided ? 'Decided by' : 'Policy'}</span>
          <button type="button" className="rl-deck__bylink" title={`Open ${where && decided ? `${where} of ` : ''}${o.policyName ?? 'the policy'}`} onClick={open}>
            <span>{by}</span>
            <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
          </button>
        </motion.span>
      )}
      {factors.length > 0 && !deny && (
        <motion.ol className="rl-deck__factors" variants={line} aria-label="Asked for">
          {factors.map((st, i) => (
            <li key={`${st.kind}:${i}`}>
              {i > 0 && <ChevronRight className="rl-deck__factarrow" size={12} strokeWidth={2.2} aria-hidden />}
              <span className="rl-deck__factor">{stepLabel(st)}</span>
            </li>
          ))}
        </motion.ol>
      )}
      {deny && deny.kind === 'deny' && (
        <motion.span className="rl-deck__deny" variants={line} title={deny.message}>
          “{deny.message}”
        </motion.span>
      )}
      {o.status === 'depends' && o.view.outcomes.length > 0 && (
        <motion.ul className="rl-deck__ifs" variants={line}>
          {o.view.outcomes.map((x, i) => (
            <li key={`${x.label}:${x.decision}:${i}`}>
              <span className="rl-deck__if">{x.label}</span>
              <span className="rl-deck__ifword">{DECISION_WORDS[x.decision]}</span>
            </li>
          ))}
        </motion.ul>
      )}
      {o.status === 'depends' && o.view.needs.length > 0 && (
        <motion.span className="rl-deck__needs" variants={line}>
          <CircleHelp size={12} strokeWidth={2.2} aria-hidden />
          Needs {o.view.needs.join(', ').toLowerCase()}
        </motion.span>
      )}
      {versus && (
        <motion.span className="rl-deck__vs" variants={line}>
          {versus.was.label} {answerWords(versus.was)}
          <ArrowRight size={12} strokeWidth={2} aria-hidden />
          {versus.now.label} {answerWords(versus.now)}
        </motion.span>
      )}
      {(changed || count || see) && (
        <motion.span className="rl-deck__foot" variants={line}>
          {count && (
            <span className={`rl-deck__finding${count.conflict ? ' is-conflict' : ''}`}>
              {count.conflict ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <Info size={12} strokeWidth={2.2} aria-hidden />}
              {count.text}
            </span>
          )}
          {changed && <span className="rl-deck__changed">Changed by {changed}</span>}
          {see && (
            <button type="button" className={`rl-deck__seebtn${seeOpen ? ' is-open' : ''}`} aria-expanded={seeOpen} onClick={onSee}>
              What they see
              {seeOpen ? <ChevronDown size={13} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={13} strokeWidth={2.2} aria-hidden />}
            </button>
          )}
        </motion.span>
      )}
    </motion.span>
  )
}

// --- The table -----------------------------------------------------------------------------

type Forward = { kind: 'pol' | 'rule'; id: string } | null

export default function DeckLayout(props: RunLayoutProps) {
  const { plan, s: hostS, running, animate: hostAnimate, reduced, jumped, runKey, form, screens, asGroup } = props
  const brand = useBrand()
  const { users, groups } = brand
  const names = useNameLookup()
  const tenant = props.policies ?? brand.policies
  const stage = useRef<StageView | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const signRef = useRef<HTMLButtonElement | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const outRef = useRef<HTMLDivElement | null>(null)
  const seeRef = useRef<HTMLDivElement | null>(null)

  // --- What the admin has done here: reset on every new run ---
  const [forward, setForward] = useState<Forward>(null)
  const [peek, setPeek] = useState<ReadonlySet<string>>(() => new Set())
  const [spread, setSpread] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [seeOpen, setSeeOpen] = useState(false)
  /* Deal again, and ‹ › : the dealing played again here, from the settled
     plan, without running the engine — the same drawing at a step of its own. */
  const [local, setLocal] = useState<{ s: number; playing: boolean } | null>(null)
  const [dealN, setDealN] = useState(0)
  const [seenFor, setSeenFor] = useState(runKey)
  if (seenFor !== runKey) {
    setSeenFor(runKey)
    setForward(null)
    setPeek(new Set())
    setSpread(false)
    setHover(null)
    setSeeOpen(false)
    setLocal(null)
  }
  const localOn = local && !running ? local : null
  const s = localOn ? localOn.s : hostS
  /* Skip lands at once: nothing plays the last steps out. */
  const animate = localOn ? !reduced : hostAnimate && !jumped
  const playing = localOn ? localOn.playing : running
  const last = plan.steps.length - 1
  const interactive = !running && !localOn

  // --- Where the run is ---
  const at = plan.at
  const decidingAt = useMemo(() => plan.steps.findIndex((st) => st.kind === 'deciding'), [plan])
  const landed = s >= last || (at.outcome >= 0 && s >= at.outcome)
  const tone = toneOf(plan)
  const dur = animate ? stepMs(plan, s) : 0
  const durNext = animate ? stepMs(plan, Math.min(last, s + 1)) : 0
  const spring = (ms: number, bounce = 0.14, delay = 0): Transition =>
    animate ? { type: 'spring', duration: clamp(ms, 160, 900) / 1000, bounce, delay: delay / 1000 } : { duration: 0 }

  const person = users.find((u) => u.id === form.personId) ?? null
  const first = asGroup ?? (person ? firstName(person.name) : plan.conflicts?.personName ? firstName(plan.conflicts.personName) : 'them')
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id

  /* Who else covers the person: dealt to the side as the engine decides — amber for a conflict, quiet otherwise. */
  const alsoOf = useMemo(() => {
    const c = plan.conflicts
    const conflictIds = new Set((c?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId))
    const m = new Map<string, { c: PolicyConflict; conflict: boolean }>()
    for (const x of c?.policies ?? []) if (plan.policies.some((p) => p.policyId === x.policyId && !p.decides)) m.set(x.policyId, { c: x, conflict: conflictIds.has(x.policyId) })
    return m
  }, [plan])
  const alsoIds = useMemo(() => new Set(alsoOf.keys()), [alsoOf])
  /* A later rule that also applies to the person (a conflict): its card is marked as the engine decides. */
  const clashOf = useMemo(() => {
    const m = new Map<string, RuleConflict>()
    for (const c of plan.conflicts?.conflicts ?? []) m.set(c.ruleId, c)
    return m
  }, [plan])

  const deciderIdx = plan.policies.findIndex((p) => p.decides)
  const decider = deciderIdx >= 0 ? plan.policies[deciderIdx] : undefined
  const deciderPolicy = decider ? tenant.find((p) => p.id === decider.policyId) : undefined
  const cover = decider ? coverWords(deciderPolicy, person, decider.isGlobalDefault, groupName) : ''
  const ruleDefs = useMemo(() => {
    const m = new Map<string, DefRow[]>()
    for (const r of deciderPolicy?.rules ?? []) m.set(r.id, defRowsOf(r, names))
    return m
  }, [deciderPolicy, names])

  // --- The table's geometry: constant, but for the heights read below ---
  const factCount = sentenceTokens(props.rows).filter((t) => t !== 'person' && t !== 'app').length
  const [signH, setSignH] = useState(() => 52 + 40 + factCount * 22 + 14)
  const [rowH, setRowH] = useState(220)
  const [outH, setOutH] = useState(220)
  const deckCapY = signH + 18
  const deckY = deckCapY + CAPTION
  const discardCapY = deckY + POL_H + 3 * STACK + 18
  const discardY = discardCapY + CAPTION
  const geo: Geo = { deckY, discardY }
  const nRules = plan.rules.length
  const rowW = nRules > 0 ? nRules * RULE_W + (nRules - 1) * RULE_G : POL_W
  /* The rules after the match are never turned: as it lands they are gathered
     face down at the row's end, fanned so each one's number shows — the hand
     the engine never needed. The table is laid out for that from the start:
     the outcome is dealt beside the gathered hand. */
  const unread = useMemo(() => {
    const ids = plan.rules.map((r, i) => (r.state === 'not-reached' ? i : -1)).filter((i) => i >= 0)
    /* A later rule that also applies to the person stays in the row, face up to be read: never tucked under another. */
    return ids.some((i) => clashOf.has(plan.rules[i].id)) ? [] : ids
  }, [plan, clashOf])
  const unreadAt = new Map(unread.map((i, j) => [i, j]))
  const landRule = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const gatherAt =
    unread.length === 0
      ? Number.POSITIVE_INFINITY
      : landRule && landRule.endAt >= 0
        ? landRule.endAt
        : decidingAt >= 0
          ? decidingAt
          : at.outcome >= 0
            ? at.outcome
            : last
  const gathered = s >= gatherAt
  const stackX = (unread[0] ?? nRules) * (RULE_W + RULE_G)
  const stackW = RULE_W + Math.max(0, unread.length - 1) * FAN
  const handW = unread.length > 0 ? stackX + stackW : rowW
  const alsoW = alsoOf.size > 0 ? POL_W + ALSO_GAP + alsoOf.size * (POL_W + 12) - 12 : POL_W
  const OUT_X = CX + handW + GAP
  /* Until the hand is gathered, the row as dealt (when it reaches past the outcome's place). */
  const WORLD_W = Math.max(OUT_X + OUT_W, CX + alsoW, gathered ? 0 : CX + rowW)
  const nDiscard = plan.policies.filter((p) => p.scanned && !p.decides).length
  const leftH = nDiscard > 0 ? discardY + STRIP_H + (nDiscard - 1) * PILE : deckY + POL_H + 3 * STACK
  const WORLD_H = Math.max(leftH, ROW_Y + rowH + SLIDE, OUT_Y + outH) + 8

  /* The heights the table is sized by, read as they change (offsetHeight: no transform counts). */
  const worldKeyNow = `${runKey}.${dealN}`
  useLayoutEffect(() => {
    const read = () => {
      const sh = signRef.current?.offsetHeight
      const rh = rowRef.current?.offsetHeight
      const oh = outRef.current?.offsetHeight
      if (sh) setSignH(sh)
      if (rh) setRowH(rh)
      if (oh) setOutH(oh)
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    for (const el of [signRef.current, rowRef.current, outRef.current]) if (el) ro.observe(el)
    return () => ro.disconnect()
  }, [worldKeyNow])

  const views = polViews(plan, s, geo, alsoIds, decidingAt)
  const prevViews = s > 0 ? polViews(plan, s - 1, geo, alsoIds, decidingAt) : views
  const deckLeft = views.filter((v) => v.where === 'deck').length
  const discards = views.filter((v) => v.where === 'discard').length

  // --- The camera ---
  const fittedFor = useRef<string | null>(null)
  const worldKey = `${runKey}.${dealN}`
  useLayoutEffect(() => {
    const v = stage.current
    if (!v) return
    /* The table is its landed size from the first frame: fitted once, then kept. */
    fittedFor.current = playing && animate && !landed ? null : worldKey
    v.fit({ max: 1, jump: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new run, a new deal, and as the layout mounts
  }, [worldKey])
  useEffect(() => {
    if (!playing || landed) return
    const node = activeNode(plan, s)
    if (!node) return
    const el = worldRef.current?.querySelector(`[data-node="${node}"]`)
    stage.current?.follow(el, { lazy: true, jump: reduced })
  }, [s, playing, landed, plan, reduced])
  useEffect(() => {
    if (!landed || fittedFor.current === worldKey) return
    fittedFor.current = worldKey
    stage.current?.fit({ max: 1, jump: reduced || jumped || !animate })
  }, [landed, worldKey, reduced, jumped, animate])
  /* The table grew or shrank once settled (a height read in): fitted again. */
  const sizeKey = `${WORLD_W}x${WORLD_H}`
  const sizeWas = useRef(sizeKey)
  useEffect(() => {
    if (sizeWas.current === sizeKey) return
    sizeWas.current = sizeKey
    if (!playing) stage.current?.fit({ max: 1, jump: true })
  }, [sizeKey, playing])
  /* The canvas changed size (the panel opened or shut, the window): a settled run is fitted again. */
  const settledNow = useRef(!playing)
  settledNow.current = !playing
  useEffect(() => {
    const ground = worldRef.current?.closest('.rstage')
    if (!ground || typeof ResizeObserver === 'undefined') return
    let lastSize = ''
    let frame = 0
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      const size = `${Math.round(r.width)}x${Math.round(r.height)}`
      if (size === lastSize) return
      const firstTime = lastSize === ''
      lastSize = size
      if (firstTime || !settledNow.current) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => stage.current?.fit({ max: 1, jump: true }))
    })
    ro.observe(ground)
    return () => {
      ro.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])
  useEffect(() => {
    if (!seeOpen) return
    const id = window.requestAnimationFrame(() => stage.current?.follow(seeRef.current, { lazy: true, jump: reduced }))
    return () => window.cancelAnimationFrame(id)
  }, [seeOpen, reduced])

  // --- Deal again: the local clock, one step at a time at the plan's own pace ---
  useEffect(() => {
    if (!localOn?.playing) return
    if (localOn.s >= last) {
      setLocal(null)
      return
    }
    const id = window.setTimeout(
      () => setLocal((l) => (l && l.playing ? (l.s + 1 >= last ? null : { ...l, s: l.s + 1 }) : l)),
      Math.max(16, stepMs(plan, localOn.s)),
    )
    return () => window.clearTimeout(id)
  }, [localOn, plan, last])
  const keyIdx = useMemo(() => plan.steps.map((st, i) => (KEY_STEPS.has(st.kind) ? i : -1)).filter((i) => i >= 0), [plan])
  const clearPokes = () => {
    setForward(null)
    setPeek(new Set())
    setSpread(false)
    setSeeOpen(false)
  }
  const dealAgain = () => {
    clearPokes()
    setDealN((n) => n + 1)
    setLocal({ s: 0, playing: true })
  }
  const stepBy = (dir: -1 | 1) => {
    clearPokes()
    const cur = localOn ? localOn.s : last
    const next = dir < 0 ? [...keyIdx].reverse().find((i) => i < cur) : keyIdx.find((i) => i > cur)
    if (next === undefined) {
      if (dir < 0) setLocal({ s: 0, playing: false })
      return
    }
    if (dir > 0 && next >= last) setLocal(null)
    else setLocal({ s: next, playing: false })
  }

  /* Escape puts back whatever was brought forward or turned over. */
  const onWorldKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (forward || peek.size > 0 || spread) {
      e.stopPropagation()
      setForward(null)
      setPeek(new Set())
      setSpread(false)
    }
  }
  /* One thing brought forward at a time: a card brought forward puts back what was turned over, and the other way round. */
  const toggleForward = (f: NonNullable<Forward>) => {
    setPeek(new Set())
    setSpread(false)
    setForward((cur) => (cur && cur.kind === f.kind && cur.id === f.id ? null : f))
  }
  const isForward = (kind: 'pol' | 'rule', id: string) => forward !== null && forward.kind === kind && forward.id === id

  // --- A policy card ---

  const policyCard = (p: EnginePolicy, i: number) => {
    const v = views[i]
    const was = prevViews[i]
    const moving = animate && was.where !== v.where
    const spreadAt = spread && v.where === 'deck' && interactive ? v.k : -1
    const fwd = isForward('pol', p.policyId) && interactive
    const hov = hover === p.policyId && interactive && (v.where === 'discard' || v.where === 'deck')
    const faceUp = v.where !== 'deck' && v.where !== 'hidden' ? true : spreadAt >= 0
    const found = v.where === 'reading' && p.decides && policyFound(p, s)
    const working = v.where === 'reading' && !found
    const also = alsoOf.get(p.policyId) ?? null
    /* Its place: the deck fanned out by hand to the right, the pile's card raised under the pointer. */
    let x = v.x
    let y = v.y
    let z = v.z
    let scale = 1
    if (spreadAt >= 0) {
      /* Turned over by hand: fanned down from the deck as strips, in order, each one's name and reason showing. */
      x = 0
      y = geo.deckY + spreadAt * PILE
      z = 120 + spreadAt
    }
    /* On the pile, and fanned out of the deck: a strip, its number, name and reason on two lines. */
    const strip = v.where === 'discard' || spreadAt >= 0
    if (hov && !fwd) {
      y -= v.where === 'discard' ? 4 : 0
      z = 150
    }
    if (fwd) {
      scale = 1.06
      y -= 6
      z = 200
    }
    const hidden = v.where === 'hidden'
    const T: Transition = moving
      ? {
          x: spring(dur * 0.85, 0.12, v.where === 'reading' ? 60 : 0),
          y: spring(dur * 0.85, 0.12, v.where === 'reading' ? 60 : 0),
          rotateY: spring(Math.max(dur, 380) * 0.9, 0.1, v.where === 'reading' ? 80 : 0),
          scale: animate ? { duration: (dur * 0.85) / 1000, ease: 'easeInOut', times: [0, 0.45, 1] } : { duration: 0 },
          rotate: animate ? { duration: (dur * 0.85) / 1000, ease: 'easeInOut', times: [0, 0.45, 1] } : { duration: 0 },
          height: spring(dur * 0.6, 0),
          default: spring(260),
        }
      : hidden || v.where === 'deck'
        ? { default: spring(320, 0.1, v.where === 'deck' && s === at.which ? v.k * 50 : 0) }
        : { default: spring(300, 0.2) }

    const words =
      v.where === 'applies' || found
        ? `Applies${cover ? ` · ${cover}` : ''}`
        : v.where === 'also' && also
          ? `Also covers ${first}${viaWords(also.c.via) ? ` ${viaWords(also.c.via)}` : ''} · not used`
          : v.where === 'discard'
            ? reasonWords(p)
            : spreadAt >= 0
              ? p.reason || 'Not reached'
              : ''
    const chosen = v.where === 'applies'
    const edge =
      working || found
        ? ' is-working'
        : chosen
          ? ` is-chosen${landed ? ` is-${tone}` : ''}`
          : v.where === 'also'
            ? also?.conflict
              ? ' is-also is-conflict'
              : ' is-also'
            : v.where === 'discard' || spreadAt >= 0
              ? ' is-passed'
              : ''
    const press = () => {
      if (!interactive) return
      if (v.where === 'deck') {
        setForward(null)
        setPeek(new Set())
        setSpread((on) => !on)
      }
      else toggleForward({ kind: 'pol', id: p.policyId })
    }
    const label =
      v.where === 'deck' && spreadAt < 0
        ? `Policy ${p.order}, face down`
        : `Policy ${p.order}, ${p.name}${words ? `: ${words}` : ''}`
    const flipT: Transition = moving ? (T as Record<string, Transition>).rotateY : spring(420, 0.12)

    return (
      <motion.div
        key={p.policyId}
        className={`rl-deck__card is-pol is-${v.where}${moving ? ' is-flying' : ''}${fwd ? ' is-forward' : ''}${spreadAt >= 0 ? ' is-spread' : ''}`}
        style={{ width: POL_W, zIndex: z, pointerEvents: hidden ? 'none' : undefined } as CSSProperties}
        data-card
        data-node={p.node}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive && !hidden ? 0 : -1}
        aria-label={label}
        aria-expanded={interactive && v.where !== 'deck' ? fwd : undefined}
        title={v.where === 'discard' ? p.reason : undefined}
        initial={animate ? { x: v.x, y: v.y - 28, opacity: 0, scale: 1, height: POL_H } : false}
        animate={{
          x,
          y,
          height: strip ? STRIP_H : POL_H,
          opacity: hidden ? 0 : 1,
          scale: moving && !fwd ? [1, 1.05, 1] : scale,
          rotate: moving ? (v.where === 'discard' ? [0, 5, 0] : v.where === 'reading' ? [0, -4, 0] : [0, -2, 0]) : 0,
        }}
        transition={T}
        onClick={press}
        onKeyDown={onKeys(press)}
        onPointerEnter={() => setHover(p.policyId)}
        onPointerLeave={() => setHover((h) => (h === p.policyId ? null : h))}
        onFocus={() => setHover(p.policyId)}
        onBlur={() => setHover((h) => (h === p.policyId ? null : h))}
      >
        <motion.div className="rl-deck__flip" initial={false} animate={{ rotateY: faceUp ? 0 : 180 }} transition={flipT}>
          {strip ? (
            <div className={`rl-deck__face is-front is-pol is-strip${edge}`}>
              <span className="rl-deck__ptop">
                <Num n={p.order} />
                <span className="rl-deck__pname is-line" title={p.name}>
                  {p.name}
                </span>
              </span>
              <span className="rl-deck__psub">{words}</span>
            </div>
          ) : (
          <div className={`rl-deck__face is-front is-pol${edge}${found && animate ? ' is-found' : ''}`}>
            <span className="rl-deck__ptop">
              <Num n={p.order} />
              {working ? (
                <Spinner small />
              ) : chosen || found ? (
                <Mark status="pass" pop={animate && found} label="Covers the person" />
              ) : v.where === 'discard' || spreadAt >= 0 ? (
                <Mark status="none" pop={false} label="Not used" />
              ) : v.where === 'also' && also?.conflict ? (
                <TriangleAlert className="rl-deck__alsoicon" size={14} strokeWidth={2.2} aria-hidden />
              ) : null}
            </span>
            <span className="rl-deck__pname" title={p.name}>
              {p.name}
            </span>
            {working ? (
              <span className="rl-deck__psub">
                <span className="tj-skel is-short" />
              </span>
            ) : (
              words && <span className={`rl-deck__psub${chosen || found ? ' is-applies' : ''}`}>{words}</span>
            )}
          </div>
          )}
          <div className="rl-deck__face is-back is-pol" aria-hidden>
            <span className="rl-deck__backin is-pol">{form.appId && <AppLogo appId={form.appId} name={plan.appName} size={20} />}</span>
          </div>
        </motion.div>
        {fwd && (
          <PolicySheet
            p={p}
            where={v.where}
            words={words}
            cover={cover}
            also={also?.c ?? null}
            side={v.where === 'discard' || v.where === 'deck' ? 'right' : 'below'}
            onOpen={() => props.onOpenPolicy(p.policyId)}
            reduced={reduced}
          />
        )}
      </motion.div>
    )
  }

  // --- A rule card ---

  const rulesOpen = decider !== undefined && decider.expandAt !== null && s >= decider.expandAt
  const dealt = rulesOpen
  const ruleCard = (r: EngineRule, i: number) => {
    const result = traceResult(r, s)
    const clash = decidingAt >= 0 && s >= decidingAt ? (clashOf.get(r.id) ?? null) : null
    const notReached = result === 'not-reached' || result === 'waiting'
    const peeked = interactive && notReached && peek.has(r.id)
    const faceUp = (r.state !== 'not-reached' && r.startAt >= 0 && s >= r.startAt) || peeked
    const fwd = interactive && !notReached && isForward('rule', r.id)
    const isLanding = plan.landing === i
    const lifted = isLanding && result === 'matched'
    const folded = result === 'folded'
    const slotX = i * (RULE_W + RULE_G)
    /* Dealt from the policy that applies: from its middle, above. */
    const fromX = (POL_W - RULE_W) / 2 - slotX
    const fromY = -ROW_Y + 8
    /* Never reached: gathered into the hand at the row's end once the match lands, the first on top. */
    const j = unreadAt.get(i)
    const inHand = j !== undefined && gathered
    const y = !dealt ? fromY : lifted ? -LIFT : folded ? SLIDE : peeked ? -8 : fwd ? -10 : 0
    const x = !dealt ? fromX : inHand ? stackX + j * FAN - slotX : 0
    const startStep = r.startAt
    const flipping = animate && s === startStep
    const dealStagger = animate && decider?.expandAt === s ? Math.min(70, (dur * 0.55) / Math.max(1, nRules)) : 0
    /* The gather: one sweep as the match lifts, the nearest card first, each tucked under the one before. */
    const gathering = animate && inHand && s === gatherAt
    const T: Transition = {
      x: gathering ? spring(clamp(dur, 420, 620), 0.08, 120 + (j ?? 0) * 40) : spring(dealStagger ? 420 : 320, 0.12, i * dealStagger),
      y: lifted ? spring(Math.max(dur, 300), 0.35) : folded ? spring(Math.max(dur, 300), 0.1) : spring(dealStagger ? 420 : 320, 0.12, i * dealStagger),
      opacity: animate ? { duration: 0.2, delay: (i * dealStagger) / 1000 } : { duration: 0 },
      scale: spring(260, 0.2),
    }
    const flipT = flipping ? spring(clamp(dur + durNext, 300, 560), 0.12) : spring(420, 0.12)
    const decisionTone: Tone = r.decision === 'deny' ? 'negative' : 'positive'
    const edge =
      result === 'reading'
        ? ' is-working'
        : lifted
          ? ` is-match is-${landed ? tone : decisionTone}`
          : result === 'missed' || folded
            ? ' is-miss'
            : result === 'unknown' || result === 'possible'
              ? ' is-unknown'
              : result === 'off'
                ? ' is-off'
                : peeked
                  ? ' is-peek'
                  : ''
    const quiet = (landed || inHand) && notReached && !peeked && !clash
    const press = () => {
      if (!interactive) return
      if (notReached) {
        setForward(null)
        /* One turned over at a time: in the hand they would lie on each other. */
        setPeek((cur) => (cur.has(r.id) ? new Set() : new Set([r.id])))
      } else toggleForward({ kind: 'rule', id: r.id })
    }
    const n = r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}, ${r.name}`
    const said =
      result === 'matched' ? 'matches' : result === 'missed' || folded ? `no match${r.miss ? `: ${r.miss}` : ''}` : result === 'unknown' ? "can't tell" : result === 'possible' ? 'if not' : result === 'off' ? 'switched off' : 'not reached'
    return (
      <div key={r.id} className={`rl-deck__slot${folded ? ' is-folded' : ''}`} style={{ width: RULE_W }}>
        <motion.div
          className={`rl-deck__card is-rule${fwd ? ' is-forward' : ''}${quiet ? ' is-quiet' : ''}${folded ? ' is-folded' : ''}${inHand && (j ?? 0) > 0 && !peeked ? ' is-under' : ''}`}
          style={{ zIndex: fwd ? 200 : peeked ? 120 : lifted ? 30 : j !== undefined ? 60 - j : 10 + i, pointerEvents: dealt ? undefined : 'none' } as CSSProperties}
          data-card
          data-node={r.node}
          role={interactive ? 'button' : undefined}
          tabIndex={interactive && dealt ? 0 : -1}
          aria-label={`${n}: ${said}${peeked ? ', turned over' : ''}`}
          aria-expanded={interactive && !notReached ? fwd : undefined}
          aria-pressed={interactive && notReached ? peeked : undefined}
          initial={animate ? { x: fromX, y: fromY, opacity: 0 } : false}
          animate={{ x, y, opacity: dealt ? 1 : 0, scale: fwd ? 1.06 : 1 }}
          transition={T}
          onClick={press}
          onKeyDown={onKeys(press)}
        >
          <motion.div className="rl-deck__flip" initial={false} animate={{ rotateY: faceUp ? 0 : 180 }} transition={flipT}>
            <div className={`rl-deck__face is-front is-rule${edge}${lifted && animate ? ' is-glow' : ''}`}>
              <RuleFront r={r} s={s} result={result} peeked={peeked} defRows={ruleDefs.get(r.id) ?? []} clash={clashOf.get(r.id) ?? null} pop={animate} />
            </div>
            <div className={`rl-deck__face is-back is-rule${clash ? ' is-conflict' : ''}`} aria-hidden>
              <RuleBack r={r} clash={clash} />
            </div>
          </motion.div>
          {fwd && decider && <RuleSheet r={r} onOpen={() => r.index !== null && props.onOpenRule(decider.policyId, r.id)} reduced={reduced} />}
        </motion.div>
      </div>
    )
  }

  // --- The outcome ---

  const outDealt = decidingAt >= 0 && s >= decidingAt
  const outUp = at.outcome >= 0 && s >= at.outcome
  const landIdx = plan.landing
  const outFromX = (landIdx !== null && nRules > 0 ? CX + landIdx * (RULE_W + RULE_G) : CX) - OUT_X
  const outFromY = (landIdx !== null && nRules > 0 ? ROW_Y : 0) - OUT_Y
  const outDealing = animate && s === decidingAt
  /* A card that also covers the person is dealt to the side first, at this same step: the outcome follows it. */
  const outAfter = outDealing && alsoIds.size > 0 ? clamp(dur * 0.4, 0, 640) : 0
  const outFlipping = animate && s === at.outcome

  // --- The dock: Deal again, and a step at a time ---

  const canDeal = !running && !reduced && plan.steps.length > 1 && !plan.empty
  const dock = canDeal ? (
    <div className="rl-deck__dock">
      {localOn && <span className="rl-deck__docktext">{plan.steps[localOn.s]?.text || ' '}</span>}
      <Tip text="Previous step" placement="top">
        <button type="button" className="bb__act" aria-label="Previous step" disabled={localOn?.s === 0} onClick={() => stepBy(-1)}>
          <ChevronLeft size={15} strokeWidth={2} />
        </button>
      </Tip>
      <Tip text="Next step" placement="top">
        <button type="button" className="bb__act" aria-label="Next step" disabled={!localOn} onClick={() => stepBy(1)}>
          <ChevronRight size={15} strokeWidth={2} />
        </button>
      </Tip>
      <button type="button" className="bb__act rl-deck__deal" onClick={dealAgain} aria-label="Deal again">
        <RotateCcw size={14} strokeWidth={2} aria-hidden />
        <span>Deal again</span>
      </button>
    </div>
  ) : undefined

  if (plan.empty) {
    return (
      <RunStage ref={stage} reduced={reduced} className="rl-deck" label="Sign-in run">
        <div className="rl-deck__world" style={{ width: LEFT_W, height: signH }}>
          <SignInCard props={props} landed={false} cardRef={(el) => (signRef.current = el)} />
        </div>
      </RunStage>
    )
  }

  return (
    <RunStage ref={stage} reduced={reduced} className="rl-deck" dock={dock} label={`Sign-in run: ${plan.appName}`}>
      <div
        key={worldKey}
        ref={worldRef}
        className="rl-deck__world"
        style={{ width: WORLD_W, height: WORLD_H } as CSSProperties}
        onKeyDown={onWorldKey}
        onPointerDown={(e) => {
          if (e.target === worldRef.current) {
            setForward(null)
            setSpread(false)
          }
        }}
      >
        <SignInCard props={props} landed={landed} cardRef={(el) => (signRef.current = el)} />

        {/* The deck's place: what it is, how many are left in it. */}
        <div className="rl-deck__cap" style={{ top: deckCapY, width: LEFT_W }} data-node="which">
          <span className="rl-deck__captext">{landed && deckLeft > 0 ? 'Not needed' : `Policies on ${plan.appName}`}</span>
          {deckLeft > 0 && <span className="rl-deck__count">{deckLeft}</span>}
        </div>
        {/* Every card drawn: the deck's place, empty. */}
        {deckLeft === 0 && <div className="rl-deck__empty" style={{ top: deckY, width: POL_W, height: POL_H }} aria-hidden />}
        {(discards > 0 || nDiscard > 0) && (
          <motion.div
            className="rl-deck__cap"
            style={{ top: discardCapY, width: LEFT_W }}
            initial={false}
            animate={{ opacity: discards > 0 ? 1 : 0 }}
            transition={{ duration: animate ? 0.2 : 0 }}
          >
            <span className="rl-deck__captext">Passed over</span>
          </motion.div>
        )}

        {/* The outcome's place, from the first frame: where the last card is dealt (drawn once the row as dealt clears it). */}
        {!outDealt && (
          <motion.div
            className="rl-deck__ghost"
            style={{ left: OUT_X, top: OUT_Y, width: OUT_W, height: Math.min(outH, 200) }}
            data-node="outcome"
            aria-hidden
            initial={false}
            animate={{ opacity: gathered || CX + rowW + GAP / 2 <= OUT_X ? 1 : 0 }}
            transition={{ duration: animate ? 0.3 : 0, delay: animate && s === gatherAt ? 0.5 : 0 }}
          />
        )}

        {/* The row's name, and the hand's: what the engine never turned, and how many. */}
        <motion.div
          className="rl-deck__cap"
          style={{ left: CX, top: ROW_Y - LIFT - 24, width: Math.max(RULE_W, stackX - RULE_G) }}
          initial={false}
          animate={{ opacity: rulesOpen ? 1 : 0 }}
          transition={{ duration: animate ? 0.24 : 0 }}
          aria-hidden
        >
          <span className="rl-deck__captext">Rules</span>
        </motion.div>
        {unread.length > 0 && (
          <motion.div
            className="rl-deck__cap"
            style={{ left: CX + stackX, top: ROW_Y - LIFT - 24, width: stackW }}
            initial={false}
            animate={{ opacity: gathered ? 1 : 0 }}
            transition={{ duration: animate ? 0.24 : 0, delay: animate && s === gatherAt ? 0.4 : 0 }}
          >
            <span className="rl-deck__captext">Not reached</span>
            <span className="rl-deck__count">{unread.length}</span>
          </motion.div>
        )}

        {plan.policies.map(policyCard)}

        {/* The rule row: dealt from the policy that applies. */}
        <div ref={rowRef} className="rl-deck__row" style={{ left: CX, top: ROW_Y, width: rowW }} aria-label={decider ? `Rules in ${decider.name}` : undefined} role="group">
          {plan.rules.map(ruleCard)}
        </div>

        {/* The outcome: dealt last, face down, then turned over. */}
        <motion.div
          ref={outRef}
          className={`rl-deck__card is-out${outDealing ? ' is-flying' : ''}`}
          style={{ left: OUT_X, top: OUT_Y, width: OUT_W, zIndex: 95, pointerEvents: outDealt ? undefined : 'none' } as CSSProperties}
          data-card
          data-node={outDealt ? 'outcome' : undefined}
          role="group"
          aria-label={outUp ? `Outcome: ${plan.outcome.status === 'depends' ? 'Depends' : plan.outcome.decision ? DECISION_WORDS[plan.outcome.decision] : 'No policy decides'}` : 'Outcome'}
          initial={animate ? { x: outFromX, y: outFromY, opacity: 0, scale: 0.7 } : false}
          animate={outDealt ? { x: 0, y: 0, opacity: 1, scale: 1, rotate: outDealing ? [0, -3, 0] : 0 } : { x: outFromX, y: outFromY, opacity: 0, scale: 0.7, rotate: 0 }}
          transition={
            outDealing
              ? {
                  default: spring(clamp((dur - outAfter) * 0.8, 360, 620), 0.14, outAfter),
                  opacity: { duration: 0.15, delay: outAfter / 1000 },
                  rotate: { duration: clamp((dur - outAfter) * 0.8, 360, 620) / 1000, ease: 'easeInOut', delay: outAfter / 1000 },
                }
              : { duration: animate ? 0.2 : 0 }
          }
        >
          <motion.div className="rl-deck__flip" initial={false} animate={{ rotateY: outUp ? 0 : 180 }} transition={outFlipping ? spring(clamp(dur * 0.7, 420, 700), 0.16) : spring(420, 0.12)}>
            <div className={`rl-deck__face is-front is-out is-${outUp ? tone : 'neutral'}`}>
              {outUp ? <OutcomeFront props={props} seeOpen={seeOpen} onSee={() => setSeeOpen((v) => !v)} pop={animate} /> : <span className="rl-deck__outin" />}
            </div>
            <div className={`rl-deck__face is-back is-out${outDealt && !outUp ? ' is-working' : ''}`} aria-hidden>
              <span className="rl-deck__backin is-out">
                {outDealt && !outUp && playing ? <Spinner small /> : null}
                <span className="rl-deck__backname">Outcome</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
        {seeOpen && outUp && screens.length > 0 && form.appId && (
          <motion.div
            ref={seeRef}
            className="rl-deck__see"
            data-card
            style={{ left: OUT_X, top: OUT_Y + outH + 10, width: OUT_W + 120 }}
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: EASE_OUT }}
          >
            <WhatTheySee screens={screens} appId={form.appId} compact collapsible={false} />
          </motion.div>
        )}
      </div>
    </RunStage>
  )
}

// --- What a card brought forward says -------------------------------------------------------

function Sheet({ children, side, reduced }: { children: ReactNode; side: 'below' | 'right'; reduced: boolean }) {
  return (
    <motion.div
      className={`rl-deck__sheet is-${side}`}
      data-card
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      initial={reduced ? false : { opacity: 0, y: side === 'below' ? -6 : 0, x: side === 'right' ? -6 : 0 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

function PolicySheet({
  p,
  where,
  words,
  cover,
  also,
  side,
  onOpen,
  reduced,
}: {
  p: EnginePolicy
  where: PolWhere
  words: string
  cover: string
  also: PolicyConflict | null
  side: 'below' | 'right'
  onOpen: () => void
  reduced: boolean
}) {
  const lines: string[] = []
  if (where === 'applies') lines.push(p.isGlobalDefault ? 'No policy above covers them' : `First in order that covers them${cover && cover !== 'the fallback' ? `, ${cover}` : ''}`)
  else if (where === 'also' && also) {
    lines.push(also.notUsed || 'Not used: an earlier policy applies')
    const would = also.status === 'decided' && also.decision ? DECISION_WORDS[also.decision] : also.possible.map((d) => DECISION_WORDS[d]).join(' or ')
    if (would) lines.push(`Would give ${would}${also.ruleNumber !== null ? ` · Rule ${also.ruleNumber}` : ''}`)
  } else if (p.reason) lines.push(p.reason)
  else if (words) lines.push(words)
  if (p.tip && !lines.includes(p.tip)) lines.push(p.tip)
  return (
    <Sheet side={side} reduced={reduced}>
      {lines.map((l) => (
        <span key={l} className="rl-deck__sheetline">
          {l}
        </span>
      ))}
      <button type="button" className="rl-deck__sheetbtn" onClick={onOpen}>
        Open policy
        <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
      </button>
    </Sheet>
  )
}

function RuleSheet({ r, onOpen, reduced }: { r: EngineRule; onOpen: () => void; reduced: boolean }) {
  const read = r.checks.slice(0, r.checked)
  return (
    <Sheet side="below" reduced={reduced}>
      {read.length === 0 && <span className="rl-deck__sheetline">{r.index === null ? 'Reached when no rule above matches' : r.state === 'off' ? 'Switched off' : 'Nothing read'}</span>}
      {read.map((c, k) => (
        <span key={c.key || k} className="rl-deck__sheetrow">
          <span className={`rl-deck__sheethead is-${c.status}`}>{c.line || c.say}</span>
          {c.subs.length > 0 && (
            <span className="rl-deck__subs">
              {c.subs.map((sub) => (
                <span key={sub.key} className={`rl-deck__sub is-${sub.status}`}>
                  <span className="rl-deck__sublabel">{sub.label}</span>
                  <span className="rl-deck__subval">{[sub.actual, sub.required].filter(Boolean).join(' · ')}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      ))}
      {r.index !== null && (
        <button type="button" className="rl-deck__sheetbtn" onClick={onOpen}>
          Open rule
          <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden />
        </button>
      )}
    </Sheet>
  )
}
