import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { ArrowUpRight, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import { checkPhase, type CheckRow, type EngineRule } from '../engine-run'
import { Spinner } from '../PolicyStack'
import { ruleMark, type MarkState } from './explainer-model'
import { Mark, Num, OnPlate, Plate } from './explainer-parts'
import { EASE_OUT, MORPH } from './explainer-motion'
import type { VisualCtx } from './explainer-visual'

/* The policy opened into its rules (explainer-visual.tsx): the policy's card
   has become the bar on top; down the left its rules in order, each with
   what it came to; beside them the rule the story is at, large — its checks
   arriving one by one, each read across as what the sign-in showed against
   what the rule asks, the mark landing as the engine finds it. The first
   that fails ends the rule (the ones after it are never read). A new rule
   slides in over the last. Press a check for how it was read; Open takes the
   rule to the builder. */

const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

export function RulesView({ c, rule }: { c: VisualCtx; rule: number }) {
  const { props, s, first, via, animate, morph, onPick } = c
  const plan = props.plan
  const d = plan.policies.find((p) => p.decides)
  const r = plan.rules[rule]
  const how = d?.isGlobalDefault ? `none above covers ${first}` : via?.matches ? `covers ${first} ${via.say}` : `covers ${first}`
  return (
    <div className="rl-explainer__rules">
      <div className="rl-explainer__bar" data-card>
        <Plate id="x-policy" tone="positive" morph={morph} />
        <OnPlate className="rl-explainer__barin" animate={animate}>
          <Mark state="pass" />
          <span className="rl-explainer__barname">{d?.name ?? plan.decider?.name ?? 'Policy'}</span>
          <span className="rl-explainer__barhow">applies · {how}</span>
        </OnPlate>
      </div>
      <div className="rl-explainer__rbody">
        <ol className="rl-explainer__rlist" aria-label="Rules, in order">
          {plan.rules.map((x) => {
            const mk: MarkState = ruleMark(x, s)
            const on = x.id === r?.id
            const reachable = (x.visited || x.state === 'off') && x.startAt >= 0 && s >= x.startAt
            return (
              <li key={x.id} className={`rl-explainer__ritem is-${mk}${on ? ' is-on' : ''}`}>
                <button type="button" className="rl-explainer__rbtn" disabled={!reachable} aria-current={on ? 'step' : undefined} onClick={() => onPick(x.node)} title={reachable ? x.name : `${x.name} · not reached`}>
                  <Num n={x.index === null ? null : x.index + 1} tone={on && mk === 'working' ? 'working' : undefined} />
                  <span className="rl-explainer__rname">{x.name}</span>
                  {mk === 'waiting' || mk === 'quiet' ? <span className="rl-explainer__rnot">{reachable ? '' : 'Not reached'}</span> : <Mark state={mk} />}
                </button>
              </li>
            )
          })}
        </ol>
        <div className="rl-explainer__rstage">
          <AnimatePresence initial={false} mode="popLayout">
            {r && (
              <motion.div
                key={r.id}
                className="rl-explainer__rslot"
                initial={animate ? { opacity: 0, y: 28 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={animate ? { opacity: 0, y: -20, transition: { duration: 0.2 } } : { opacity: 0, transition: { duration: 0 } }}
                transition={animate ? MORPH : { duration: 0 }}
              >
                <RuleCard c={c} r={r} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function RuleCard({ c, r }: { c: VisualCtx; r: EngineRule }) {
  const { props, s, final, first, animate, morph } = c
  const plan = props.plan
  const [open, setOpen] = useState<string | null>(null)
  const mk = ruleMark(r, s)
  const n = r.index === null ? null : r.index + 1
  const count = plan.rules.filter((x) => x.index !== null).length
  const read = r.checks.slice(0, Math.max(0, r.checked)).map((ck, k) => ({ ck, k, ph: checkPhase(r, k, s) })).filter((x) => x.ph !== 'hidden')
  const settled = mk !== 'working' && mk !== 'waiting'
  const unread = settled ? r.checks.slice(Math.max(0, r.checked)) : []
  const matched = mk === 'pass' || mk === 'negative'
  const pill = mk === 'working' ? 'Reading' : matched ? 'Matches' : mk === 'fail' ? 'No match' : mk === 'unknown' ? 'Can’t tell' : mk === 'off' ? 'Switched off' : ''
  const isLanding = plan.landing !== null && plan.rules[plan.landing]?.id === r.id
  const deciding = plan.steps.findIndex((st) => st.kind === 'deciding')
  const clashes = isLanding && (final || (deciding >= 0 && s >= deciding)) ? (plan.conflicts?.rules ?? []) : []
  const tone = matched ? (r.decision === 'deny' ? 'negative' : 'positive') : mk === 'fail' ? 'fail' : mk === 'unknown' ? 'notice' : mk === 'working' ? 'working' : 'quiet'
  return (
    <div className={`rl-explainer__card is-rule is-${tone}`} data-card data-node={r.node}>
      <Plate id={isLanding ? 'x-rule' : undefined} tone={tone} morph={morph} />
      <OnPlate animate={animate} delay={0.08}>
        <div className="rl-explainer__lhead">
          <span className="rl-explainer__kick">{n === null ? 'Last rule · always matches when none above did' : `Rule ${n} of ${count}`}</span>
          {pill && (
            <span className={`rl-explainer__pill is-${mk === 'working' ? 'working' : tone}`}>
              {mk === 'working' ? <Spinner small /> : <Mark state={mk} pop={animate} />}
              {pill}
            </span>
          )}
        </div>
        <h3 className="rl-explainer__title" title={r.name}>{r.name}</h3>
        {(read.length > 0 || unread.length > 0) && (
          <div className="rl-explainer__checks">
            <div className="rl-explainer__chead">
              <span>Check</span>
              <span>The sign-in shows</span>
              <span>The rule asks</span>
              <span className="rl-explainer__sr">Result</span>
            </div>
            {read.map(({ ck, k, ph }) => (
              <CheckLine key={ck.key || k} ck={ck} working={ph === 'working'} via={ck.category === 'who' && ck.status === 'pass' && r.via?.matches ? r.via.say : ''} open={open === (ck.key || String(k))} onToggle={() => setOpen((o) => (o === (ck.key || String(k)) ? null : ck.key || String(k)))} animate={animate} />
            ))}
            {unread.map((ck, k) => (
              <div key={`u:${ck.key || k}`} className="rl-explainer__crow is-unread">
                <span className="rl-explainer__cword">{ck.word}</span>
                <span className="rl-explainer__cfact">Not checked</span>
                <span className="rl-explainer__cneed">{lowerFirst(ck.requirement)}</span>
                <span className="rl-explainer__cmark"><Mark state="quiet" label="Not checked" /></span>
              </div>
            ))}
          </div>
        )}
        {settled && (
          <motion.p className={`rl-explainer__then is-${matched ? tone : 'quiet'}`} initial={animate ? { opacity: 0, y: 4 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE_OUT }}>
            <span className="rl-explainer__thenk">Then</span>
            <strong>{DECISION_WORDS[r.decision]}</strong>
            {!matched && <span className="rl-explainer__thenq">{mk === 'off' ? 'switched off · passed over' : mk === 'unknown' ? 'can’t tell · read on' : 'not used'}</span>}
          </motion.p>
        )}
        {clashes.map((x) => (
          <p key={x.ruleId} className={`rl-explainer__clash${x.kind === 'conflict' ? ' is-conflict' : ''}`}>
            {x.kind === 'conflict' && <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />}
            Rule {x.number} {x.match === 'unknown' ? 'might apply' : 'also applies'} to {first}
            {x.via.say ? ` ${x.via.say}` : ''} · {DECISION_WORDS[x.ask.decision]}, never used
          </p>
        ))}
        {n !== null && plan.decider && (
          <button type="button" className="rl-explainer__link" onClick={() => props.onOpenRule(plan.decider!.id, r.id)}>
            Open in builder
            <ArrowUpRight size={13} strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </OnPlate>
    </div>
  )
}

/** One check read across: the fact, then what the rule asks — never run together — and the mark. Press for its parts. */
function CheckLine({ ck, working, via, open, onToggle, animate }: { ck: CheckRow; working: boolean; via: string; open: boolean; onToggle: () => void; animate: boolean }) {
  const parts = ck.subs.filter((x) => x.label || x.actual || x.required)
  const state: MarkState = working ? 'working' : ck.status === 'pass' ? 'pass' : ck.status === 'fail' ? 'fail' : 'unknown'
  const why = parts.length > 1 || (ck.tip && ck.tip !== ck.line)
  return (
    <motion.div className={`rl-explainer__cwrap is-${working ? 'working' : ck.status}`} initial={animate ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE_OUT }}>
      <button type="button" className="rl-explainer__crow" disabled={working} aria-expanded={why ? open : undefined} onClick={onToggle} aria-label={`${ck.word}: ${working ? 'reading' : ck.line || ck.say}`}>
        <span className="rl-explainer__cword">
          {why && !working ? open ? <ChevronDown size={12} strokeWidth={2.4} aria-hidden /> : <ChevronRight size={12} strokeWidth={2.4} aria-hidden /> : null}
          {ck.word}
        </span>
        <span className="rl-explainer__cfact">
          {ck.missing ? 'Not stated' : ck.value}
          {via && <span className="rl-explainer__cvia"> · {via}</span>}
        </span>
        <span className="rl-explainer__cneed">{lowerFirst(ck.requirement)}</span>
        <span className="rl-explainer__cmark"><Mark state={state} pop={animate} /></span>
      </button>
      {open && !working && (
        <motion.div className="rl-explainer__cparts" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: EASE_OUT }}>
          {parts.length > 1 ? (
            parts.map((x) => (
              <div key={x.key} className={`rl-explainer__cpart is-${x.status}`}>
                <span>{x.label}</span>
                <span>{x.actual || 'Not stated'}</span>
                <span>{lowerFirst(x.required)}</span>
                <Mark state={x.status === 'pass' ? 'pass' : x.status === 'fail' ? 'fail' : 'unknown'} />
              </div>
            ))
          ) : (
            <p>{ck.line || ck.say || ck.tip}</p>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
