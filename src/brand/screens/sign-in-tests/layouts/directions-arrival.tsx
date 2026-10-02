import { ArrowRight, ArrowUpRight, Ban, ChevronDown, ChevronRight, KeyRound, ShieldCheck, Split, TriangleAlert, Undo2, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import type { ColumnView } from '../../board/try-sign-in'
import { answerWords } from '../../testing/sign-in-sentence'
import type { SignInScreens } from '../../testing/screens-of'
import { WhatTheySee } from '../../testing/WhatTheySee'
import type { EngineRun } from '../engine-run'
import { expectMark, heroFinding } from '../journey'
import type { AltRoute } from './directions-map-parts'
import { askedWords, verdictWords, type Tone } from './directions-model'

/* The arrival card (directions-map.tsx draws it at the pin): the verdict in
   its colour, the policy and rule that decided it — the way into that rule —
   what the person is asked for or refused with, the one thing worth knowing,
   and What they see on demand. A reroute's arrival says it is a what-if and
   offers the way back. */

const ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }

export interface ArrivalProps {
  plan: EngineRun
  screens: readonly SignInScreens[]
  appId: string | null
  tone: Tone
  columns: ColumnView[]
  changed: string | null
  expected: AccessDecision | null
  weaker: string | null
  see: boolean
  onSee: () => void
  onOpenRule: (policyId: string, ruleId: string) => void
  onOpenPolicy: (policyId: string) => void
  /** A reroute on show: its arrival, not the run's. */
  alt: AltRoute | null
  altPlan: EngineRun | null
  onBack: () => void
}

export function Arrival(p: ArrivalProps) {
  if (p.alt && !p.altPlan) return <GroupArrival alt={p.alt} onBack={p.onBack} />
  const plan = p.alt && p.altPlan ? p.altPlan : p.plan
  const tone = p.alt ? p.alt.tone : p.tone
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const Icon = decided ? ICON[decided] : Split
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  /* A Depends has no one rule that decided: the policy alone. */
  const where = landing && o.status !== 'depends' ? (landing.index === null ? 'Nothing else matched' : `Rule ${landing.index + 1}`) : ''
  const by = o.policyName ? `${o.policyName}${where ? ` · ${where}` : ''}` : ''
  const asked = askedWords(plan, p.alt ? [] : p.screens)
  const hero = p.alt ? null : heroFinding(plan)
  const mark = p.alt ? null : expectMark(decided, p.expected, p.weaker)
  const was = !p.alt && p.columns.length > 1 ? p.columns[0] : null
  const now = !p.alt && p.columns.length > 1 ? p.columns[p.columns.length - 1] : null
  const versus = was && now && answerWords(was) !== answerWords(now) ? { was, now } : null
  const open = () => {
    if (!o.policyId) return
    if (landing && landing.index !== null && o.status !== 'depends') p.onOpenRule(o.policyId, landing.id)
    else p.onOpenPolicy(o.policyId)
  }
  return (
    <div className={`rl-directions__arr is-${tone}${p.alt ? ' is-whatif' : ''}`}>
      {p.alt && <WhatIfTag alt={p.alt} />}
      <p className="rl-directions__verdict">
        <span className="rl-directions__verdicttile" aria-hidden>
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <span>{verdictWords(plan)}</span>
      </p>
      {mark && (
        <p className="rl-directions__expect">
          <TriangleAlert size={12} strokeWidth={2.4} aria-hidden />
          {mark === 'weaker' ? 'Weaker factor' : `Expected ${p.expected ? DECISION_WORDS[p.expected] : ''}`}
        </p>
      )}
      {by && (
        <div className="rl-directions__by">
          <span className="rl-directions__label">{o.status === 'depends' ? 'In' : 'Decided by'}</span>
          {p.alt ? (
            <span className="rl-directions__bytext">{by}</span>
          ) : (
            <button type="button" className="rl-directions__bylink" onClick={open}>
              {by}
              <ArrowUpRight className="rl-directions__byicon" size={13} strokeWidth={2.4} aria-hidden />
            </button>
          )}
        </div>
      )}
      {decided && decided !== 'deny' && asked.factors.length > 0 && (
        <ol className="rl-directions__factors" aria-label="Asked for">
          {asked.factors.map((f, i) => (
            <li key={`${f}:${i}`}>
              {i > 0 && <ChevronRight size={12} strokeWidth={2.4} aria-hidden />}
              <span>{f}</span>
            </li>
          ))}
        </ol>
      )}
      {decided === 'deny' && asked.deny && <p className="rl-directions__denymsg">“{asked.deny}”</p>}
      {o.status === 'depends' && o.view.outcomes.length > 0 && (
        <ul className="rl-directions__ifs">
          {o.view.outcomes.map((x) => (
            <li key={`${x.label}:${x.decision}`}>
              <span>{x.label}</span>
              <strong>{DECISION_WORDS[x.decision]}</strong>
            </li>
          ))}
        </ul>
      )}
      {versus && (
        <p className="rl-directions__versus">
          {versus.was.label} {answerWords(versus.was)}
          <ArrowRight size={12} strokeWidth={2.2} aria-hidden />
          {versus.now.label} {answerWords(versus.now)}
        </p>
      )}
      {p.changed && !p.alt && <p className="rl-directions__changed">Changed by {p.changed}</p>}
      {p.alt && p.altPlan && whatChanged(p.plan, p.altPlan) && <p className="rl-directions__why">{whatChanged(p.plan, p.altPlan)}</p>}
      {hero && <p className={`rl-directions__hero is-${hero.tone}`}>{hero.text}</p>}
      <div className="rl-directions__arrfoot">
        {p.alt ? (
          <button type="button" className="rl-directions__back" onClick={p.onBack}>
            <Undo2 size={13} strokeWidth={2.2} aria-hidden />
            Back to this route
          </button>
        ) : (
          decided &&
          p.screens.length > 0 &&
          p.appId && (
            <button type="button" className="rl-directions__seebtn" aria-expanded={p.see} onClick={p.onSee}>
              What they see
              {p.see ? <ChevronDown size={13} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={13} strokeWidth={2.2} aria-hidden />}
            </button>
          )
        )}
      </div>
      {p.see && !p.alt && p.appId && (
        <div className="rl-directions__see">
          <WhatTheySee screens={p.screens} appId={p.appId} compact collapsible={false} title="" />
        </div>
      )}
    </div>
  )
}

/* Why the what-if goes another way: the rule the run turned in at, and the check that now stops it — or the rule that now matches first. */
function whatChanged(base: EngineRun, alt: EngineRun): string {
  if (!base.decider || alt.decider?.id !== base.decider.id || base.landing === null) return ''
  const was = base.rules[base.landing]
  const now = alt.landing !== null ? alt.rules[alt.landing] : undefined
  if (!was || now?.id === was.id) return ''
  const name = (r: { index: number | null }) => (r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}`)
  const same = alt.rules.find((r) => r.id === was.id)
  const stop = same && same.failing !== null ? same.checks[same.failing] : undefined
  if (same && same.visited && stop) return `${name(was)} no longer matches · ${stop.line || same.miss || `${stop.word} fails`}`
  if (now && now.index !== null && (was.index === null || now.index < was.index)) return `${name(now)} now matches first`
  return ''
}

function WhatIfTag({ alt }: { alt: AltRoute }) {
  return (
    <p className="rl-directions__arrtag">
      <span>What if</span>
      {alt.label}
      {alt.same && <em>· same route</em>}
    </p>
  )
}

/* The person as one group alone: the run's own comparison, no run of its own to draw from. */
function GroupArrival({ alt, onBack }: { alt: AltRoute; onBack: () => void }) {
  const Icon = alt.tone === 'bad' ? Ban : alt.tone === 'warn' ? Split : alt.words === DECISION_WORDS['2fa'] ? KeyRound : ShieldCheck
  return (
    <div className={`rl-directions__arr is-${alt.tone} is-whatif`}>
      <WhatIfTag alt={alt} />
      <p className="rl-directions__verdict">
        <span className="rl-directions__verdicttile" aria-hidden>
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <span>{alt.words}</span>
      </p>
      {alt.source && (
        <div className="rl-directions__by">
          <span className="rl-directions__label">Decided by</span>
          <span className="rl-directions__bytext">{alt.source}</span>
        </div>
      )}
      <div className="rl-directions__arrfoot">
        <button type="button" className="rl-directions__back" onClick={onBack}>
          <Undo2 size={13} strokeWidth={2.2} aria-hidden />
          Back to this route
        </button>
      </div>
    </div>
  )
}
