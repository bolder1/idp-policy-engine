import { motion } from 'motion/react'
import { useContext, useMemo } from 'react'
import { ArrowRight, Layers, TriangleAlert, Users } from 'lucide-react'

import { DECISION_WORDS } from '../../../decision-words'
import { Face } from '../../../faces'
import { AppLogo } from '../../../logos/AppLogo'
import { useBrand } from '../../../store'
import { sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../../testing/sign-in-sentence'
import type { EnginePolicy, EngineRun } from '../engine-run'
import { isQuiet, policyWhy } from '../journey'
import { Spinner } from '../PolicyStack'
import { ValueMark } from '../SignInCard'
import { groupNamesOf } from '../sign-in-card'
import { stepMs } from '../use-engine-run'
import type { RunLayoutProps } from './types'
import { policiesState, policyRow, reasonWords, type PolicyRow } from './focus-model'
import { Mark, NoteLines, Num, Poke } from './focus-parts'
import { LitCtx } from './focus-shared'

/* The first two moments of Focus (FocusLayout.tsx): the sign-in, and the
   application's policies read in order until the first that covers the
   person — the one that applies lit, the rest saying why they did not. */

// --- The sign-in ----------------------------------------------------------------------------

const SHORT: Partial<Record<TokenId, string>> = { from: 'From', device: 'Device', when: 'When', risk: 'Risk' }

/* No edit control here: the engine pill carries the one Edit sign-in pencil (2 Oct). */
export function SignInMoment({ props, landed }: { props: RunLayoutProps; landed: boolean }) {
  const { form, rows, asGroup, plan } = props
  const { users, groups, apps, zones } = useBrand()
  const person = users.find((u) => u.id === form.personId) ?? null
  const app = apps.find((a) => a.id === form.appId) ?? null
  /* A group run is checked as one of its members (sign-in-card.ts `personPick`): the card names the group, as the row
     does, and says whose sign-in stands for it. */
  const groupLine = asGroup ? (person ? `Checked as ${person.name}, a member` : '') : person ? groupNamesOf(person, groups).join(', ') : ''
  const ctx: SentenceContext = { people: users, apps, zones, rows }
  const facts = sentenceTokens(rows)
    .filter((t) => t !== 'person' && t !== 'app')
    .map((t) => tokenValue(t, form, ctx))
  const depends = plan.outcome.status === 'depends' && landed
  const lit = useContext(LitCtx) === 'person'
  return (
    <div className={`rl-focus__card is-sign${lit ? ' is-lit' : ''}`} data-card data-node="sign-in">
      <header className="rl-focus__head">
        {asGroup ? (
          <span className="rl-focus__tile is-group">
            <Users size={20} strokeWidth={2} aria-hidden />
          </span>
        ) : (
          <span className="rl-focus__tile is-face">{person ? <Face kind="user" name={person.name} size="md" decorative /> : null}</span>
        )}
        <span className="rl-focus__heading">
          <span className="rl-focus__kicker">Sign-in</span>
          <h3 className="rl-focus__title">{asGroup ? `Anyone in ${asGroup}` : (person?.name ?? 'Choose a person')}</h3>
        </span>
      </header>
      {groupLine && <p className="rl-focus__sub">{groupLine}</p>}
      <p className="rl-focus__to">
        <ArrowRight size={15} strokeWidth={2} aria-hidden className="rl-focus__toarrow" />
        {app && <AppLogo appId={app.id} name={app.name} size={20} />}
        <span>{app?.name ?? plan.appName ?? 'Choose an application'}</span>
      </p>
      {facts.length > 0 && (
        <dl className="rl-focus__facts">
          {facts.map((v) => (
            <div key={v.token} className={`rl-focus__fact${v.unset ? ` is-unset${depends ? ' is-needed' : ''}` : ''}`}>
              <dt>{SHORT[v.token] ?? v.label}</dt>
              <dd>
                <span className="rl-focus__factmark" aria-hidden>
                  <ValueMark v={v} size={14} />
                </span>
                <span className="rl-focus__facttext">{v.unset ? 'Not stated' : v.text}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

// --- The policies ---------------------------------------------------------------------------

/** More rows than this and the ones never read fold into one line. */
const MANY = 7

export function PoliciesMoment({ plan, s, first, landed, animate, focused }: { plan: EngineRun; s: number; first: string; landed: boolean; animate: boolean; focused: boolean }) {
  const deciderIndex = plan.policies.findIndex((p) => p.decides)
  const covers = useMemo(() => new Map((plan.conflicts?.policies ?? []).map((p) => [p.policyId, p])), [plan.conflicts])
  const conflictIds = useMemo(
    () => new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict' && (f.kind === 'policy-conflict' || f.kind === 'same-group-policy')).map((f) => f.target.policyId)),
    [plan.conflicts],
  )
  const findings = useMemo(() => (plan.conflicts?.findings ?? []).filter((f) => !isQuiet(f)), [plan.conflicts])
  const state = policiesState(plan, s)
  const dv = plan.conflicts?.policies[0]?.deciderVia
  const via = dv?.matches ? dv.say : ''
  const rows = plan.policies.map((p, i) => ({ p, i, row: policyRow(p, s, deciderIndex, i, covers.has(p.policyId), landed) }))
  const quietRows = rows.filter((r) => r.row === 'not-read')
  const fold = plan.policies.length > MANY && quietRows.length > 1
  const shown = fold ? rows.filter((r) => r.row !== 'not-read') : rows
  const working = state === 'working' && !landed
  const decider = deciderIndex >= 0 ? plan.policies[deciderIndex] : undefined
  const sub = decider && s >= decider.settleAt ? (decider.isGlobalDefault ? 'None above covers them: the Global Default applies' : `The first that covers ${first} applies`) : `Read in order · the first that covers ${first} applies`
  return (
    <div className={`rl-focus__card is-policies${working ? ' is-working' : state === 'pass' ? ' is-positive is-settled' : ''}`} data-card data-node="which">
      <header className="rl-focus__head">
        <span className={`rl-focus__tile${working ? ' is-working' : state === 'pass' ? ' is-positive' : ''}`}>
          <Layers size={18} strokeWidth={2} aria-hidden />
        </span>
        <span className="rl-focus__heading">
          <span className="rl-focus__kicker">Policies</span>
          <h3 className="rl-focus__title">{plan.appName ? `On ${plan.appName}` : 'Policies'}</h3>
        </span>
        {working ? <Spinner /> : state === 'pass' ? <Mark status="pass" big label="A policy applies" pop={animate} /> : null}
      </header>
      <p className="rl-focus__sub">{sub}</p>
      <ol className="rl-focus__plist">
        {shown.map(({ p, i, row }) => (
          <PolicyLine
            key={p.policyId}
            p={p}
            row={row}
            s={s}
            plan={plan}
            first={first}
            via={via}
            conflict={conflictIds.has(p.policyId) && i > deciderIndex}
            cover={covers.get(p.policyId)}
            findings={findings.filter((f) => f.target.policyId === p.policyId && f.target.ruleId === null).map((f) => f.line || f.title)}
            animate={animate && focused}
          />
        ))}
        {fold && (
          <li className="rl-focus__prow is-not-read">
            <Poke id="policies:rest" className="rl-focus__pbtn" label={`${quietRows.length} more, not read`} note={<NoteLines lines={[`Not read: ${decider?.name ?? 'an earlier policy'} applies first`, quietRows.map((r) => r.p.name).join(', ')]} />}>
              <span className="rl-focus__pname">{quietRows.length} more · not read</span>
            </Poke>
          </li>
        )}
      </ol>
    </div>
  )
}

function PolicyLine({
  p,
  row,
  s,
  plan,
  first,
  via,
  conflict,
  cover,
  findings,
  animate,
}: {
  p: EnginePolicy
  row: PolicyRow
  s: number
  plan: EngineRun
  first: string
  via: string
  conflict: boolean
  cover: NonNullable<EngineRun['conflicts']>['policies'][number] | undefined
  findings: string[]
  animate: boolean
}) {
  const lit = useContext(LitCtx) === `policy:${p.policyId}` ? ' is-lit' : ''
  const name = (
    <span className="rl-focus__pname" title={p.name}>
      {p.name}
    </span>
  )
  if (row === 'skeleton') {
    return (
      <li className={`rl-focus__prow is-skeleton${lit}`} data-node={p.node}>
        <span className="rl-focus__pbtn">
          <Num n={p.order} />
          <span className="tj-skel is-line" />
        </span>
      </li>
    )
  }
  if (row === 'asking' || row === 'found') {
    const ms = stepMs(plan, s)
    return (
      <li className={`rl-focus__prow is-${row}${lit}`} data-node={p.node}>
        <span className="rl-focus__pbtn">
          {row === 'asking' && animate && (
            <motion.span key={s} className="rl-focus__sweep" aria-hidden initial={{ x: '-100%' }} animate={{ x: '260%' }} transition={{ duration: Math.max(0.2, ms / 1000), ease: [0.4, 0, 0.6, 1] }} />
          )}
          {row === 'found' && (
            <motion.span className="rl-focus__lock" aria-hidden initial={animate ? { opacity: 0, scale: 1.08 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 26 }} />
          )}
          <Num n={p.order} tone={row === 'found' ? 'working' : undefined} />
          {name}
          <span className="rl-focus__pstate">{row === 'found' ? `Covers ${first}` : <Spinner small />}</span>
        </span>
      </li>
    )
  }
  if (row === 'applies') {
    const note = (
      <NoteLines
        lines={[
          p.isGlobalDefault ? `No policy above it covers ${first}: the Global Default applies` : `The first policy on ${plan.appName} that covers ${first}${via ? `, ${via}` : ''}`,
          policyWhy(plan),
          p.tip,
          ...findings,
        ]}
      />
    )
    return (
      <li className={`rl-focus__prow is-applies${lit}`} data-node={p.node}>
        <Poke id={p.node} className="rl-focus__pbtn" label={`${p.order}. ${p.name}: applies. Why`} note={note}>
          <Num n={p.order} tone="positive" />
          {name}
          <span className="rl-focus__pstate is-positive">
            Applies
            <Mark status="pass" label="Applies" pop={animate} />
          </span>
        </Poke>
      </li>
    )
  }
  if (row === 'also') {
    const would = cover
      ? cover.status === 'decided' && cover.decision
        ? `On its own: ${DECISION_WORDS[cover.decision]}${cover.ruleNumber !== null ? ` · rule ${cover.ruleNumber}` : ''}`
        : cover.possible.length > 0
          ? `On its own: ${cover.possible.map((d) => DECISION_WORDS[d]).join(' or ')}`
          : ''
      : ''
    const note = <NoteLines lines={[cover ? `Covers ${first} ${cover.via.say}`.trim() : `Also covers ${first}`, cover?.notUsed ?? '', would, ...findings]} fix={cover?.fix || undefined} />
    return (
      <li className={`rl-focus__prow is-also${conflict ? ' is-conflict' : ''}${lit}`} data-node={p.node}>
        <Poke id={p.node} className="rl-focus__pbtn" label={`${p.order}. ${p.name}: also covers ${first}, not used. Why`} note={note}>
          <Num n={p.order} />
          {name}
          <span className="rl-focus__pstate is-notice">
            {conflict && <TriangleAlert size={13} strokeWidth={2.2} aria-hidden />}
            Also covers {first} · not used
          </span>
        </Poke>
      </li>
    )
  }
  if (row === 'not-read') {
    const said = p.reason && !/^not reached$/i.test(p.reason) ? p.reason : ''
    const note = <NoteLines lines={[plan.decider ? `Not read: ${plan.decider.name} applies first` : 'Not read', said, p.tip, ...findings]} />
    return (
      <li className={`rl-focus__prow is-not-read${lit}`} data-node={p.node}>
        <Poke id={p.node} className="rl-focus__pbtn" label={`${p.order}. ${p.name}: not read. Why`} note={note}>
          <Num n={p.order} />
          {name}
          <span className="rl-focus__pstate">Not read</span>
        </Poke>
      </li>
    )
  }
  /* Read and passed over. */
  const note = <NoteLines lines={[p.reason || 'Not used', p.tip, ...findings]} />
  return (
    <li className={`rl-focus__prow is-passed${lit}`} data-node={p.node}>
      <Poke id={p.node} className="rl-focus__pbtn" label={`${p.order}. ${p.name}: ${p.reason || 'not used'}. Why`} note={note}>
        <Num n={p.order} />
        {name}
        <span className="rl-focus__pstate">{reasonWords(p.reason, first) || 'Not used'}</span>
      </Poke>
    </li>
  )
}

