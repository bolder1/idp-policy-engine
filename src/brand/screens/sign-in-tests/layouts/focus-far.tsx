import { memo, useContext, type ReactNode } from 'react'
import { ArrowRight, Ban, Check, CircleHelp, KeyRound, Layers, Minus, ShieldCheck, Split, Users, X, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import type { EngineRun } from '../engine-run'
import { traceResult } from '../journey'
import { Spinner } from '../PolicyStack'
import { foldLine, policiesState, type Moment, type Tone } from './focus-model'
import { LitCtx } from './focus-shared'

/* -----------------------------------------------------------------------------
   A receded card's FAR FACE (FocusLayout.tsx): what that moment found, at a
   size that reads from a distance — its kicker, its title, one result line
   led by its mark. The full face (focus-cards, focus-rule, focus-outcome) is
   drawn only for the card in focus; every other card, and every card in
   Overview, shows this. It wears the card's own chrome and tone edge.

     sign-in    Sign-in · Maya Iyer · → AWS Console
     policies   Policies · AWS for engineering teams · ✓ Policy 1 of 4 applies
     rule       Rule 2 of 3 · Contractors in the office · ✕ Device: …
     outcome    Outcome · Deny · Decided by the last rule

   Pure of the clock beyond `s`: memoised on `stateKey`, so a step of the run
   re-renders only the faces whose state changed.
   -------------------------------------------------------------------------- */

const DECISION_ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }

export interface FarNames {
  /** "Maya Iyer", or "Anyone in Finance". */
  person: string
  first: string
  group: boolean
  appId: string | null
  appName: string
}

export interface FarProps {
  m: Moment
  plan: EngineRun
  s: number
  landed: boolean
  tone: Tone
  names: FarNames
  /** Small room: two lines for the title. */
  compact: boolean
  /** Overview: the card's number in reading order, 1-based. */
  num?: number
  /** The deciding rule's result, said once as the verdict is reached. */
  pulse?: boolean
  /** What makes this face look different: it re-renders only when this changes. */
  stateKey: string
}

type LineTone = 'ok' | 'bad' | 'warn' | 'work' | 'quiet' | 'plain'

function Line({ tone, icon, children, pulse = false }: { tone: LineTone; icon: ReactNode; children: ReactNode; pulse?: boolean }) {
  return (
    <p className={`rl-focus__farline is-${tone}${pulse ? ' is-pulse' : ''}`}>
      <span className="rl-focus__farmark" aria-hidden>
        {icon}
      </span>
      <span className="rl-focus__fartext">{children}</span>
    </p>
  )
}

function FarFaceImpl({ m, plan, s, landed, tone, names, compact, num, pulse = false }: FarProps) {
  const lit = useContext(LitCtx)
  let kicker = ''
  let title: ReactNode = ''
  let tile: ReactNode = null
  let tileTone = ''
  let cardTone = ''
  let line: ReactNode = null
  let isLit = false
  let label = ''
  let titleCls = ''

  if (m.kind === 'sign') {
    kicker = 'Sign-in'
    title = names.person
    tile = names.group ? <Users size={18} strokeWidth={2} aria-hidden /> : <Face kind="user" name={names.person} size="md" decorative />
    tileTone = names.group ? 'is-group' : 'is-face'
    line = (
      <Line tone="plain" icon={<ArrowRight size={16} strokeWidth={2} />}>
        {names.appId && <AppLogo appId={names.appId} name={names.appName} size={16} />}
        <span>{names.appName}</span>
      </Line>
    )
    isLit = lit === 'person'
    label = `Sign-in: ${names.person} to ${names.appName}`
  } else if (m.kind === 'policies') {
    const state = policiesState(plan, s)
    const dp = plan.policies.find((p) => p.decides)
    const settled = !!dp && s >= dp.settleAt
    kicker = 'Policies'
    tile = <Layers size={17} strokeWidth={2} aria-hidden />
    if (settled && dp) {
      title = dp.name
      tileTone = 'is-positive'
      line = dp.isGlobalDefault ? (
        <Line tone="ok" icon={<Check size={16} strokeWidth={2.6} />}>
          Global Default
        </Line>
      ) : (
        <Line tone="ok" icon={<Check size={16} strokeWidth={2.6} />}>
          Policy {dp.order} of {plan.policies.length} applies
        </Line>
      )
    } else if (landed || state === 'quiet') {
      title = 'No policy applies'
      line = (
        <Line tone="quiet" icon={<Minus size={16} strokeWidth={2.4} />}>
          {plan.policies.length} read
        </Line>
      )
    } else {
      title = plan.appName ? `On ${plan.appName}` : 'Policies'
      tileTone = 'is-working'
      cardTone = 'is-working'
      line = (
        <Line tone="work" icon={<Spinner small />}>
          Reading in order
        </Line>
      )
    }
    isLit = !!lit?.startsWith('policy:')
    label = `Policies: ${typeof title === 'string' ? title : ''}`
  } else if (m.kind === 'rule') {
    const r = plan.rules[m.rule ?? -1]
    if (!r) return null
    const n = r.index === null ? null : r.index + 1
    const count = plan.rules.filter((x) => x.index !== null).length
    kicker = n === null ? 'Last rule' : `Rule ${n} of ${count}`
    title = r.name
    tile = n === null ? <Minus size={16} strokeWidth={2.4} aria-hidden /> : <span className="rl-focus__farn">{n}</span>
    const result = landed ? traceResult(r, Number.MAX_SAFE_INTEGER) : traceResult(r, s)
    const matched = result === 'matched'
    const failed = result === 'missed' || result === 'folded'
    const unknown = result === 'unknown' || result === 'possible'
    if (matched) {
      const deny = r.decision === 'deny'
      const t: LineTone = deny ? 'bad' : 'ok'
      cardTone = deny ? 'is-negative' : 'is-positive'
      tileTone = cardTone
      line = (
        <Line tone={t} pulse={pulse} icon={<Check size={16} strokeWidth={2.6} />}>
          <span className="rl-focus__farquiet">Matches · Then </span>
          <b className="rl-focus__farverb">{DECISION_WORDS[r.decision]}</b>
        </Line>
      )
    } else if (failed) {
      cardTone = 'is-fail'
      tileTone = 'is-fail'
      line = (
        <Line tone="bad" icon={<X size={16} strokeWidth={2.6} />}>
          {foldLine(r).text}
        </Line>
      )
    } else if (unknown) {
      cardTone = 'is-notice'
      tileTone = 'is-notice'
      line = (
        <Line tone="warn" pulse={pulse} icon={<CircleHelp size={16} strokeWidth={2.4} />}>
          {r.index === null && r.state === 'possible' ? `If not · ${DECISION_WORDS[r.decision]}` : foldLine(r).text}
        </Line>
      )
    } else if (r.state === 'off') {
      cardTone = 'is-off'
      line = (
        <Line tone="quiet" icon={<Minus size={16} strokeWidth={2.4} />}>
          Switched off
        </Line>
      )
    } else {
      cardTone = 'is-working'
      tileTone = 'is-working'
      line = (
        <Line tone="work" icon={<Spinner small />}>
          Reading
        </Line>
      )
    }
    isLit = lit === `rule:${r.id}` || !!lit?.startsWith(`check:${r.id}:`)
    label = `${kicker}: ${r.name}`
  } else {
    kicker = 'Outcome'
    const o = plan.outcome
    if (landed) {
      const decided = o.status === 'decided' && o.decision ? o.decision : null
      const Icon = decided ? DECISION_ICON[decided] : Split
      const word = decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides'
      const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
      title = word
      titleCls = ' is-verdict'
      tile = (
        <span className={`rl-focus__vtile is-far is-${tone}`}>
          <Icon size={18} strokeWidth={2} aria-hidden />
        </span>
      )
      tileTone = 'is-bare'
      cardTone = `is-landed is-${tone}`
      line = landing ? (
        <Line tone="plain" icon={null}>
          {landing.index === null ? 'Decided by the last rule' : `Decided by Rule ${landing.index + 1}`}
        </Line>
      ) : o.policyName ? (
        <Line tone="plain" icon={null}>
          {o.policyName}
        </Line>
      ) : null
      isLit = lit === 'outcome' || lit === 'screens'
      label = `Outcome: ${word}`
    } else {
      const deciding = plan.steps[s]?.kind === 'deciding'
      title = deciding ? 'Deciding' : 'Not decided yet'
      titleCls = ' is-quiet'
      tile = deciding ? <Spinner small /> : <Split size={17} strokeWidth={2} aria-hidden />
      tileTone = deciding ? 'is-working' : ''
      cardTone = 'is-ghost'
      label = 'Outcome: not decided yet'
    }
  }

  return (
    <div className={`rl-focus__card is-far is-${m.kind}${cardTone ? ` ${cardTone}` : ''}${compact ? ' is-compact' : ''}${isLit ? ' is-lit' : ''}`} data-card data-far={m.key} aria-label={label}>
      {num !== undefined && (
        <span className="rl-focus__farnum" aria-hidden>
          {num}
        </span>
      )}
      <header className="rl-focus__head">
        <span className={`rl-focus__tile is-far${tileTone ? ` ${tileTone}` : ''}`}>{tile}</span>
        <span className="rl-focus__heading">
          <span className="rl-focus__kicker">{kicker}</span>
          <h3 className={`rl-focus__title${titleCls}`} title={typeof title === 'string' ? title : undefined}>
            {title}
          </h3>
        </span>
      </header>
      {line}
    </div>
  )
}

export const FarFace = memo(
  FarFaceImpl,
  (a, b) => a.stateKey === b.stateKey && a.m === b.m && a.plan === b.plan && a.tone === b.tone && a.names === b.names && a.compact === b.compact && a.num === b.num && a.pulse === b.pulse && a.landed === b.landed,
)
