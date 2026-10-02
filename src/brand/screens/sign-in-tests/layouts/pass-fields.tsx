import type { ReactNode } from 'react'
import { ChevronRight, Lock } from 'lucide-react'

import { checkPhase, policyPhase, type EngineRule } from '../engine-run'
import type { FieldKey, PassCtx } from './pass-ctx'
import { ruleField, ruleNo, stopRow } from './pass-model'
import { Mark, Skel, Stamp, type MarkStatus, type StampTone } from './pass-parts'

/* -----------------------------------------------------------------------------
   The pass's four fields (PassLayout.tsx), a boarding pass's row of boxes:
     Policy      the policy being asked while the scan runs, then the one that
                 issued the pass, stamped "Covers"
     Rule        the rule being read, its checks landing; a rule that fails is
                 stamped ✕ and drops to the tried line; the one that matches
                 stays, stamped
     Factors     what the person is asked for, once the answer lands
     Conditions  the sign-in's facts, each marked as the deciding rule reads it
   Each is a button: a press opens its evidence under the pass.
   -------------------------------------------------------------------------- */

type FieldState = 'waiting' | 'working' | 'settled'

function Field({
  k,
  label,
  state,
  open,
  node,
  onPress,
  stamp,
  children,
}: {
  k: FieldKey
  label: string
  state: FieldState
  open: boolean
  node?: string
  onPress: (k: FieldKey) => void
  stamp?: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`rl-pass__field is-${k} is-${state}${open ? ' is-open' : ''}`}
      data-node={node}
      aria-expanded={open}
      aria-label={`${label}: evidence`}
      onClick={() => onPress(k)}
    >
      <span className="rl-pass__lbl">
        {label}
        <ChevronRight className="rl-pass__fieldgo" size={12} strokeWidth={2.4} aria-hidden />
      </span>
      <span className="rl-pass__fval">{children}</span>
      {stamp}
    </button>
  )
}

interface FieldsProps {
  c: PassCtx
  open: FieldKey | null
  onPress: (k: FieldKey) => void
}

export function PolicyField({ c, open, onPress }: FieldsProps) {
  const { plan, s, decider } = c
  const total = plan.policies.length
  /* While the scan runs the wallet's edge is the one thing lit; the field fills once the policy is found. */
  const settled = decider ? policyPhase(decider, s) === 'settled' || c.landed : c.landed
  const state: FieldState = settled ? 'settled' : 'waiting'
  const gd = decider?.isGlobalDefault === true && total > 1
  return (
    <Field
      k="policy"
      label="Policy"
      state={state}
      open={open === 'policy'}
      onPress={onPress}
      stamp={settled && decider ? <Stamp text={gd ? 'Fallback' : 'Covers'} tone={c.landed && c.tone === 'negative' ? 'neutral' : 'positive'} pop={c.animate} ms={c.durOf(decider.settleAt)} tilt={-6} /> : null}
    >
      {state === 'waiting' && (
        <>
          <Skel w="82%" h={12} />
          <Skel w="48%" />
        </>
      )}
      {state === 'settled' &&
        (decider ? (
          <>
            <span className="rl-pass__fmain" title={decider.name}>
              {decider.name}
            </span>
            <span className="rl-pass__fsub">
              {gd ? `Policy ${decider.order} of ${total}` : `Policy ${decider.order} of ${total}${c.via ? ` · ${c.via}` : ''}`}
            </span>
          </>
        ) : (
          <span className="rl-pass__fmain is-quiet">No policy decides</span>
        ))}
    </Field>
  )
}

const triedMark = (r: EngineRule): MarkStatus => (r.state === 'no-match' ? 'fail' : r.state === 'unknown' ? 'unknown' : 'none')

/** The stamp a rule is settled with. */
function ruleStamp(c: PassCtx, r: EngineRule, isLanding: boolean): { text: string; tone: StampTone } | null {
  if (r.state === 'no-match') return { text: `✕ ${stopRow(r)?.word ?? 'No match'}`, tone: 'negative' }
  if (r.state === 'unknown') return { text: 'Can’t tell', tone: 'notice' }
  if (r.state === 'off') return { text: 'Off', tone: 'neutral' }
  if (!isLanding) return null
  if (c.plan.outcome.status === 'depends') return { text: r.index === null ? 'If not' : 'Depends', tone: 'notice' }
  if (r.index === null) return { text: 'Last rule', tone: c.tone === 'negative' ? 'negative' : 'positive' }
  return { text: 'Match', tone: r.decision === 'deny' ? 'negative' : 'positive' }
}

export function RuleField({ c, open, onPress }: FieldsProps) {
  const { plan, s } = c
  const f = ruleField(plan, s, c.landed)
  const r = f.current !== null ? plan.rules[f.current] : undefined
  const isLanding = f.current !== null && f.current === plan.landing
  const ended = r ? c.landed || (r.endAt >= 0 && s >= r.endAt) : false
  const state: FieldState = !r ? 'waiting' : c.landed || (ended && isLanding) ? 'settled' : 'working'
  const st = r && ended ? ruleStamp(c, r, isLanding) : null
  const real = plan.rules.filter((x) => x.index !== null).length
  const shown = f.tried.slice(0, 3)
  return (
    <Field
      k="rule"
      label="Rule"
      state={state}
      open={open === 'rule'}
      node={r?.node}
      onPress={onPress}
      stamp={st && r ? <Stamp key={r.node} text={st.text} tone={st.tone} pop={c.animate} ms={c.durOf(Math.max(0, r.endAt))} tilt={-5} /> : null}
    >
      {!r ? (
        <>
          <Skel w="70%" h={12} />
          <Skel w="40%" />
        </>
      ) : (
        <>
          <span className={`rl-pass__fmain${state === 'working' && c.live && !ended ? ' is-asking' : ''}`} title={r.name}>
            {r.index === null ? (
              <>
                <Lock size={12} strokeWidth={2.4} aria-hidden /> Nothing else matched
              </>
            ) : (
              <>
                <span className="rl-pass__rno">{ruleNo(r)}</span>
                {r.name}
              </>
            )}
          </span>
          {!ended && r.checks.length > 0 && (
            <span className="rl-pass__fmarks" aria-label="Checks">
              {r.checks.map((k, i) => {
                const ph = checkPhase(r, i, s)
                if (ph === 'hidden') return <span key={k.key} className="rl-pass__markgap" aria-hidden />
                return <Mark key={k.key} status={k.status} working={ph === 'working' && c.live} pop={c.animate} />
              })}
            </span>
          )}
          <span className="rl-pass__fsub rl-pass__tried">
            {shown.length === 0 ? (
              r.index !== null ? `Rule ${r.index + 1} of ${real}` : real > 0 ? `After ${real} ${real === 1 ? 'rule' : 'rules'}` : 'No rules'
            ) : (
              <>
                {shown.map((i) => {
                  const t = plan.rules[i]
                  return (
                    <span key={t.node} className={`rl-pass__triedchip is-${triedMark(t)}`}>
                      {ruleNo(t)}
                      <Mark status={triedMark(t)} />
                      {stopRow(t)?.word ?? ''}
                    </span>
                  )
                })}
                {f.tried.length > shown.length && <span className="rl-pass__triedchip">+{f.tried.length - shown.length}</span>}
              </>
            )}
          </span>
        </>
      )}
    </Field>
  )
}

const POSSIBLE: Record<string, string> = { '1fa': 'Password', '2fa': 'Password + 2FA', deny: 'Refused' }

export function FactorsField({ c, open, onPress }: FieldsProps) {
  const o = c.plan.outcome
  return (
    <Field k="factors" label="Factors" state={c.landed ? 'settled' : 'waiting'} open={open === 'factors'} onPress={onPress}>
      {!c.landed ? (
        <>
          <Skel w="56%" h={12} />
          <Skel w="36%" />
        </>
      ) : o.status === 'depends' ? (
        <span className="rl-pass__flist">
          {[...new Set(o.possible.map((d) => POSSIBLE[d]))].map((x, i) => (
            <span key={x} className="rl-pass__fitem">
              <span className="rl-pass__fno">{i === 0 ? 'if' : 'or'}</span>
              {x}
            </span>
          ))}
        </span>
      ) : c.factors.length > 0 && !c.deny ? (
        <span className="rl-pass__flist">
          {c.factors.map((x, i) => (
            <span key={`${x}:${i}`} className="rl-pass__fitem is-factor">
              <span className="rl-pass__fno">{i + 1}</span>
              {x}
            </span>
          ))}
        </span>
      ) : (
        <>
          <span className="rl-pass__fmain is-quiet">None</span>
          <span className="rl-pass__fsub">{c.deny ? 'Refused before any' : '—'}</span>
        </>
      )}
    </Field>
  )
}

export function ConditionsField({ c, open, onPress }: FieldsProps) {
  return (
    <Field k="conditions" label="Conditions" state={c.s >= 0 ? 'settled' : 'waiting'} open={open === 'conditions'} onPress={onPress}>
      {c.facts.length === 0 ? (
        <span className="rl-pass__fmain is-quiet">None read</span>
      ) : (
        <span className="rl-pass__facts">
          {c.facts.map((f) => {
            const on = f.mark !== null && f.markAt !== null && c.s >= f.markAt
            const working = !on && f.markAt !== null && c.live && c.s >= f.markAt - 1
            return (
              <span key={f.token} className={`rl-pass__fact${f.unset ? ' is-unset' : ''}`}>
                <span className="rl-pass__facttext" title={`${f.label}: ${f.text}`}>
                  {f.unset ? `${f.label} not stated` : f.text}
                </span>
                {on ? <Mark status={f.mark!} pop={c.animate} /> : working ? <Mark status="none" working /> : null}
              </span>
            )
          })}
        </span>
      )}
    </Field>
  )
}
