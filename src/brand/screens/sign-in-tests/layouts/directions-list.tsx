import { motion } from 'motion/react'
import {
  ArrowDown,
  ArrowUpRight,
  Ban,
  Check,
  CircleDot,
  CircleHelp,
  CircleMinus,
  CornerDownRight,
  CornerRightDown,
  Flag,
  Minus,
  Plus,
  Signpost,
  Split,
  X,
  type LucideIcon,
} from 'lucide-react'

import type { FormField } from '../../testing/sign-in-form'
import { Spinner } from '../PolicyStack'
import type { EngineRun } from '../engine-run'
import { reasonWords, type DirIcon, type DirStep } from './directions-model'

/* The directions (DirectionsLayout.tsx): one step per row, a manoeuvre icon,
   what to do, what it took on the right. The step the engine is on is lit;
   a step pressed opens its detail under it — the checks, the person's fact
   beside what the rule needs — and the map looks at it. */

const ICONS: Record<DirIcon, LucideIcon> = {
  start: CircleDot,
  head: Signpost,
  pass: ArrowDown,
  take: CornerDownRight,
  noentry: CircleMinus,
  turn: CornerRightDown,
  unknown: CircleHelp,
  off: Minus,
  arrive: Flag,
  deny: Ban,
  depends: Split,
}
const MARK = { pass: Check, fail: X, unknown: CircleHelp } as const

export interface ListProps {
  steps: DirStep[]
  plan: EngineRun
  current: string | null
  selected: string | null
  onSelect: (key: string) => void
  /** The map element the pointer is on, and the way to say which a row is. */
  hot: string | null
  onHot: (node: string | null) => void
  first: string
  /** The sign-in's facts, for the start's detail. */
  facts: { label: string; text: string; unset: boolean }[]
  animate: boolean
  onAdd: (field: FormField) => void
  onOpenRule: (policyId: string, ruleId: string) => void
  onOpenPolicy: (policyId: string) => void
  onPressPerson: () => void
}

export function DirectionsList(p: ListProps) {
  return (
    <ol className="rl-directions__steps" aria-label="Directions">
      {p.steps.map((st, i) => {
        const Icon = ICONS[st.icon]
        const current = p.current === st.key
        const open = p.selected === st.key
        return (
          <motion.li
            key={st.key}
            className={`rl-directions__step is-${current ? 'work' : st.tone}${open ? ' is-open' : ''}${isHot(st, p.hot, p.plan) ? ' is-hot' : ''}`}
            data-step={st.key}
            initial={p.animate && st.kind !== 'arrive' && i > 0 ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}
          >
            <button type="button" className="rl-directions__stepbtn" data-card aria-expanded={open} aria-current={current ? 'step' : undefined}
              onClick={() => p.onSelect(st.key)}
              onMouseEnter={() => p.onHot(st.node)}
              onMouseLeave={() => p.onHot(null)}
              onFocus={() => p.onHot(st.node)}
              onBlur={() => p.onHot(null)}
            >
              <span className="rl-directions__icon" aria-hidden>
                {current && st.kind !== 'start' ? <Spinner small /> : <Icon size={16} strokeWidth={2.2} />}
              </span>
              <span className="rl-directions__stepwords">
                <span className="rl-directions__steptitle">{st.title}</span>
                {st.sub && <span className="rl-directions__stepsub">{st.sub}</span>}
                {st.also?.map((a) => (
                  <span key={a.policyId} className={`rl-directions__also is-${a.conflict ? 'warn' : 'quiet'}`}>
                    {a.text}
                  </span>
                ))}
              </span>
              {st.dist && <span className="rl-directions__dist">{st.dist}</span>}
            </button>
            {open && <StepDetail st={st} {...p} />}
          </motion.li>
        )
      })}
    </ol>
  )
}

/* A row is lit when the pointer is on its place on the map: its own node, a policy it passes, or a later policy it names. */
function isHot(st: DirStep, hot: string | null, plan: EngineRun): boolean {
  if (!hot) return false
  if (st.node === hot) return true
  if (st.policies?.some((i) => plan.policies[i]?.node === hot)) return true
  return st.also?.some((a) => `policy:${a.policyId}` === hot) ?? false
}

function StepDetail(p: ListProps & { st: DirStep }) {
  const { st, plan } = p
  if (st.kind === 'start') {
    return (
      <div className="rl-directions__detail">
        <dl className="rl-directions__facts">
          {p.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd className={f.unset ? 'is-unset' : ''}>{f.text}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="rl-directions__link" onClick={p.onPressPerson}>
          Change the sign-in
        </button>
      </div>
    )
  }
  if (st.kind === 'head' || (st.kind === 'pass' && st.policies)) {
    const list = st.policies ? st.policies.map((i) => plan.policies[i]).filter(Boolean) : plan.policies
    return (
      <div className="rl-directions__detail">
        <ol className="rl-directions__order">
          {list.map((pol) => (
            <li key={pol.policyId} className={pol.decides ? 'is-ok' : ''}>
              <span className="rl-directions__ordno">{pol.order}</span>
              <span className="rl-directions__ordname">{pol.name}</span>
              <span className="rl-directions__ordwhy">{pol.decides ? 'Taken' : reasonWords(pol.reason, p.first)}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }
  if (st.kind === 'pass' || st.kind === 'take') {
    const pol = st.policy !== undefined ? plan.policies[st.policy] : undefined
    if (!pol) return null
    return (
      <div className="rl-directions__detail">
        {pol.tip && <p className="rl-directions__note">{pol.tip}</p>}
        {!pol.tip && st.kind === 'pass' && <p className="rl-directions__note">{reasonWords(pol.reason, p.first)}</p>}
        {st.kind === 'take' && (
          <p className="rl-directions__note">
            {pol.isGlobalDefault ? 'The Global Default decides when no policy on the application covers the person.' : `The first policy on ${plan.appName} that covers ${p.first}.`}
          </p>
        )}
        <button type="button" className="rl-directions__link" onClick={() => p.onOpenPolicy(pol.policyId)}>
          Open policy
          <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden />
        </button>
      </div>
    )
  }
  if (st.kind === 'rule') {
    const r = st.rule !== undefined ? plan.rules[st.rule] : undefined
    if (!r) return null
    const policyId = plan.decider?.id ?? null
    return (
      <div className="rl-directions__detail">
        {r.checks.length === 0 && <p className="rl-directions__note">{r.index === null ? 'Reached only when no rule above it matches.' : 'No checks: it matches everyone it covers.'}</p>}
        {r.checks.length > 0 && (
          <ul className="rl-directions__checks">
            {r.checks.map((c, k) => {
              const read = k < r.checked
              const Icon = MARK[c.status]
              const via = c.category === 'who' && c.status === 'pass' && r.via?.matches ? r.via.say : ''
              return (
                <li key={c.key} className={`rl-directions__check is-${read ? c.status : 'unread'}${r.failing === k ? ' is-decisive' : ''}`}>
                  <span className="rl-directions__checkmark" aria-hidden>
                    {read ? <Icon size={12} strokeWidth={2.8} /> : <Minus size={12} strokeWidth={2.4} />}
                  </span>
                  <span className="rl-directions__checkword">{c.word}</span>
                  <span className="rl-directions__checkfact">
                    {c.missing ? 'Not stated' : c.value}
                    {via && <span className="rl-directions__via"> · {via}</span>}
                  </span>
                  <span className="rl-directions__checkneed">{read ? `needs ${c.requirement}` : 'Not checked'}</span>
                  {c.missing && (
                    <button type="button" className="rl-directions__add" onClick={() => p.onAdd(c.missing!)}>
                      <Plus size={12} strokeWidth={2.6} aria-hidden />
                      Add
                    </button>
                  )}
                  {read && c.status !== 'pass' && c.subs.length > 1 && (
                    <span className="rl-directions__subs">
                      {c.subs.map((x) => (
                        <span key={x.key} className={`is-${x.status}`}>
                          {x.label} {x.status === 'pass' ? '✓' : x.status === 'fail' ? '✕' : '–'}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {policyId && r.index !== null && (
          <button type="button" className="rl-directions__link" onClick={() => p.onOpenRule(policyId, r.id)}>
            Open rule {r.index + 1}
            <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden />
          </button>
        )}
      </div>
    )
  }
  return null
}
