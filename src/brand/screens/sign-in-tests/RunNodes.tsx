import { AnimatePresence, motion } from 'motion/react'
import { memo, useId, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowUpRight, Check, CircleHelp, Info, Layers, Minus, PenLine, ShieldCheck, TriangleAlert, UserRound, Users, X } from 'lucide-react'

import { fallbackRule, type Policy } from '../../data'
import { Face } from '../../faces'
import { AppLogo } from '../../logos/AppLogo'
import { leaves } from '../../predicate'
import { RuleTraceCard } from '../board/RuleCard'
import type { NameLookup } from '../predicate-prose'
import { CONNECTOR } from '../testing/sign-in-sentence'
import { policyFound, policyPhase, type EngineRule, type EngineRun, type NodeId } from './engine-run'
import { alsoMarks, policyWhy, ruleMarks, sentenceSay, traceResult, type SentenceView, type TraceResult } from './journey'
import { PolicyCard, Spinner, type PolicyFlag } from './PolicyStack'
import { Drawer, FoldButton, RuleConflictNotice } from './RunChain'
import { ValueMark } from './SignInCard'
import { stepMs } from './use-engine-run'

/* -----------------------------------------------------------------------------
   The run's four stops, one card each, in the builder's look (owner, 1 Oct
   2026: "the experience for the cards is awful — so much content, conflict
   and all … the top node should be treated like the other nodes … I need a
   separate node for the policy selection … for the matched policy only show
   which rule matched; the rest can be a hidden part, like 'total 3 rules,
   matched rule 2'").

     [MI] Maya Iyer  Engineering  Finance                                  ✎
          signs in to ▦ AWS Console · from ⌂ Office network · on ⊞ Windows 11 laptop
                            │
     [≡]  4 policies on AWS Console                                         ⇕
          Read in order — the first that covers Maya Iyer decides
          1  AWS for engineering teams                              Decides
          2  AWS billing for Finance          ⚠ Also covers Maya · not used
          3  AWS production for DevOps                    Not in this policy
          4  Global Default Policy                               Not reached
                            │
     [✓]  AWS for engineering teams  [Decides] [⚠ 1 conflict]        ↗  ⇕
          Rule 2 of 3 matched
          ( 1 ✕ ) ( 2 ✓ ) ( 3 – ) ( ✱ – )
          ┌ 2  Engineers on a compliant device                [Matched] ┐
          │   who … ✓ · if … ✓ · then Allow · Password                 │
          └────────────────────────────────────────────────────────────┘
                            │
                        the answer

   Each says what the others do not, in the fewest words that answer it —
   the scannable shape of Entra's What If (will apply / will not apply) and
   Okta's Access Testing Tool (the matched rule and what it matched on):

   - The sign-in: who (their every group), the application and the
     conditions stated — a card like the others, its pencil the way to the
     form (a press anywhere on it too).
   - Which policy: the application's policies in their order, one line
     each — Decides; Also covers <person>, not used, in the notice tone with
     a pulse as the answer lands (the conflict the owner could not find);
     else the reason it did not decide. The scan runs down these same rows
     while the engine searches.
   - The policy that decided: its rules as a rail of numbered marks — ✓
     matched, ✕ did not, – not reached, ⚠ also applies — and ONE rule's card
     under it: the one the engine is reading while it works, the one that
     decided once it is done, any other a press on its mark away. Expand all
     (the dock) draws every card.

   Motion owns every move (the rail's marks, the card swapping, the pulses):
   no CSS transform or transition on anything here moves. Reduced motion:
   each as it ends.
   -------------------------------------------------------------------------- */

const EASE_OUT = [0.2, 0, 0, 1] as const

/* A folded stop opens on a press anywhere on it; an open one does nothing,
   so a press on its words never folds it away. */
const pressOpen = (open: boolean, onFold?: () => void) => (onFold && !open ? (e: MouseEvent) => (e.target as Element).closest?.('button, a') === null && onFold() : undefined)

// --- The sign-in ---------------------------------------------------------------------------

/* Who signs in, to what, from where, on what — the first stop, a card like
   the others (it was a pill, then a sentence on the builder's start pill;
   the owner, 1 Oct: "treat it like the other nodes"). The head the person:
   their face, their name, every group they are in; under it the rest of the
   sentence, each value with its mark, a fact that failed a check its red ✕.
   Its pencil opens the form; so does a press anywhere on it. */
export const SignInStop = memo(function SignInStop({ view, onPress }: { view: SentenceView; onPress?: () => void }) {
  const say = sentenceSay(view)
  const press = onPress ? (e: MouseEvent) => (e.target as Element).closest?.('button, a') === null && onPress() : undefined
  return (
    <div className={`bb__card is-trace tj-pnode is-signin${onPress ? ' is-pressable' : ''}`} data-node="sign-in" role="group" aria-label={say} onClick={press}>
      <div className="bb__cardhead" data-port>
        <span className="tj-pnode__face" aria-hidden>
          {view.who === null ? (
            <span className="bx-face is-user is-sm">
              <UserRound size={12} strokeWidth={2.2} />
            </span>
          ) : view.isGroup ? (
            <span className="bx-face is-group is-sm">
              <Users size={12} strokeWidth={2.2} />
            </span>
          ) : (
            <Face kind="user" name={view.who} size="sm" decorative />
          )}
        </span>
        <div className="bb__title">
          <span className="bb__titlerow">
            <strong>{view.who ?? 'Choose a person'}</strong>
            {view.groups.map((g) => (
              <span key={g} className="tj-sin2__group">
                {g}
              </span>
            ))}
            {view.groups.length === 0 && view.testedAs && <span className="tj-sin2__as">tested as {view.testedAs}</span>}
          </span>
          <span className="tj-sin2__line">
            <span className="tj-sin2__tok">
              <span className="tj-sin2__word">signs in to</span>
              {view.app ? (
                <>
                  <AppLogo appId={view.app.id} name={view.app.name} size={14} />
                  <b className="tj-sin2__app">{view.app.name}</b>
                </>
              ) : (
                <span className="tj-sin2__none">Choose an application</span>
              )}
            </span>
            {view.facts.map((f) => (
              <span key={f.token} className={`tj-sin2__tok${f.mark ? ` is-${f.mark}` : ''}`}>
                <span className="tj-sin2__dot" aria-hidden>
                  ·
                </span>
                <span className="tj-sin2__word">{CONNECTOR[f.token]}</span>
                {f.mark === 'fail' ? (
                  <X className="tj-sin2__mark" size={12} strokeWidth={2.6} aria-hidden />
                ) : f.mark === 'unknown' ? (
                  <Minus className="tj-sin2__mark" size={12} strokeWidth={2.4} aria-hidden />
                ) : (
                  <span className="tj-sin2__icon" aria-hidden>
                    <ValueMark v={f.value} size={12} />
                  </span>
                )}
                <span className="tj-sin2__val">{f.value.text}</span>
              </span>
            ))}
          </span>
        </div>
        {onPress && (
          <span className="bb__cardmeta">
            <button type="button" className="bb__act tj-sin2__edit" aria-label="Edit the sign-in" title="Edit the sign-in" onClick={onPress}>
              <PenLine size={13} strokeWidth={2} />
            </button>
          </span>
        )}
      </div>
    </div>
  )
})

// --- Which policy --------------------------------------------------------------------------

export interface PoliciesStopProps {
  plan: EngineRun
  s: number
  person: string | null
  animate: boolean
  interactive: boolean
  hoverable: boolean
  toggled: Record<string, boolean>
  onToggle: (policyId: string, open: boolean) => void
  hot: NodeId | null
  active: NodeId | null
  onHover: (n: NodeId | null) => void
  onOpenRule: (policyId: string, ruleId: string) => void
  open?: boolean
  onFold?: () => void
}

/* The application's policies, in the order they are read, one line each.
   While the engine searches: "Finding the policy for AWS Console", a spinner
   for its mark, the scan running down the rows (PolicyCard). Once it has
   decided: "4 policies on AWS Console", ONE line of how they are read, and
   each row's standing — Decides; a later policy that also covers the person
   flagged in the notice tone ("Also covers Maya · not used"), pulsing as the
   answer lands, or quiet when it would answer the same or comes second by
   design; else the reason it did not decide. Folded: its head, and the one
   that decides — how many would answer otherwise is the next stop's count,
   said once. */
export function PoliciesStop({ plan, s, person, animate, interactive, hoverable, toggled, onToggle, hot, active, onHover, onOpenRule, open = true, onFold }: PoliciesStopProps) {
  const bodyId = useId()
  const decided = s >= plan.at.decides
  const decider = plan.decider
  const n = plan.policies.length
  const cx = plan.conflicts
  const who = person ?? cx?.personName ?? 'this person'
  const first = who.split(' ')[0]
  /* The flags land a beat before the answer, with the engine deciding. */
  const decidingAt = plan.steps.findIndex((k) => k.kind === 'deciding')
  const landed = s >= (decidingAt >= 0 ? decidingAt : plan.at.outcome)
  const flags = useMemo(() => {
    const m = new Map<string, PolicyFlag>()
    /* A conflict only where it would answer otherwise and is not second by
       design — a group's policy before Everyone's (`default-group-yields`)
       is the model's info, never its conflict. */
    for (const c of cx?.policies ?? []) {
      const conflict = c.decisionDiffers && c.standing !== 'default-group-yields'
      m.set(c.policyId, { tone: conflict ? 'conflict' : 'info', text: `Also covers ${first} · not used` })
    }
    return m
  }, [cx, first])
  const title = decided ? `${n} ${n === 1 ? 'policy' : 'policies'} on ${plan.appName}` : `Finding the policy for ${plan.appName}`
  const line = !decided
    ? ''
    : open
      ? `Read in order — the first that covers ${who} decides`
      : decider
        ? `${decider.name} decides`
        : policyWhy(plan) || `No policy covers ${who}`

  return (
    <div
      className={`bb__card is-trace tj-pnode is-policies${decided ? ' is-decided' : ' is-finding'}${open ? ' is-open' : ' is-folded'}${onFold ? ' is-foldable' : ''}`}
      data-node="which"
      role="group"
      aria-label="Which policy decides"
      onClick={pressOpen(open, onFold)}
    >
      <div className="bb__cardhead" data-port>
        <span className={`bb__idx tj-pnode__mark is-list${decided ? '' : ' is-finding'}`} aria-hidden>
          {decided ? <Layers size={14} strokeWidth={2} /> : <Spinner />}
        </span>
        <div className="bb__title">
          <span className="bb__titlerow">
            <strong title={title}>
              <motion.span key={decided ? 'decided' : 'finding'} className="tj-pnode__say" initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1, transition: { duration: animate ? 0.24 : 0, ease: EASE_OUT } }}>
                {title}
              </motion.span>
            </strong>
          </span>
          {line && (
            <em className="tj-pnode__why1" title={line}>
              {line}
            </em>
          )}
        </div>
        {onFold && decided && <FoldButton open={open} onFold={onFold} what="the policies" titles={['Fold the policies', 'Show the policies']} controls={bodyId} />}
      </div>
      <Drawer open={open || !decided} animate={animate} id={bodyId}>
        <ol className="tj-pstack tj-pnode__scan" aria-label={`Policies on ${plan.appName}`}>
          {plan.policies.map((p) => (
            <PolicyCard
              key={p.policyId}
              p={p}
              phase={policyPhase(p, s)}
              found={policyFound(p, s)}
              sweepMs={p.scanAt !== null ? stepMs(plan, p.scanAt) : undefined}
              lightMs={p.foundAt !== null ? stepMs(plan, p.foundAt) : undefined}
              open={!p.decides && (toggled[p.policyId] ?? false)}
              interactive={interactive && !p.decides}
              hoverable={hoverable}
              onToggle={onToggle}
              hot={hot === p.node}
              active={active === p.node}
              animate={animate}
              onHover={onHover}
              onOpenRule={onOpenRule}
              flag={landed ? flags.get(p.policyId) : undefined}
            />
          ))}
        </ol>
      </Drawer>
    </div>
  )
}

// --- The policy that decided ---------------------------------------------------------------

export interface DeciderStopProps {
  plan: EngineRun
  s: number
  person: string | null
  /** The policies the run was resolved against: the rules drawn are these. */
  policies: readonly Policy[]
  resolve: NameLookup
  animate: boolean
  running: boolean
  interactive: boolean
  active: NodeId | null
  showAll: boolean
  onOpenRule: (policyId: string, ruleId: string) => void
  onOpenPolicy: (policyId: string) => void
  /** A notice for a rule's card, where the caller says one; absent, the plan's own conflicts say. */
  ruleNotice?: (r: EngineRule) => ReactNode
  open?: boolean
  onFold?: () => void
  /** Expand all: every rule's card, in order, not one. */
  every?: boolean
  /** The findings, counted, on its head once the answer has landed; null for none. */
  count?: { text: string; conflict: boolean } | null
  /** The count pressed: the why opens in the panel. */
  onCount?: () => void
  countOpen?: boolean
}

/** A mark on the rail, by where its rule stands. */
type ChipTone = 'waiting' | 'reading' | 'match' | 'miss' | 'skip' | 'unknown' | 'off'

const CHIP_TONE: Record<TraceResult, ChipTone> = {
  waiting: 'waiting',
  reading: 'reading',
  matched: 'match',
  missed: 'miss',
  folded: 'miss',
  'not-reached': 'skip',
  unknown: 'unknown',
  possible: 'unknown',
  off: 'off',
}

const CHIP_WORD: Record<ChipTone, string> = {
  waiting: 'Not read yet',
  reading: 'Being read',
  match: 'Matched',
  miss: 'Did not match',
  skip: 'Not reached',
  unknown: 'Can’t tell',
  off: 'Switched off',
}

/* The policy that decided: its head — the shield in the decided path's
   colour, its name, Decides, what else would answer otherwise counted (a
   press opens the why in the panel), Open policy and the fold — then where
   it stopped, in words ("Rule 2 of 3 matched"), then its rules as a rail of
   numbered marks and ONE rule's card under it. While the engine works the
   card is the rule being read, swapping as it moves on; once it is done, the
   rule that decided — or the one pressed on the rail. A rule that would
   also apply is ⚠ on the rail, pulsing as the answer lands, and its card
   carries the notice. Expand all draws every card. */
export function DeciderStop({
  plan,
  s,
  person,
  policies,
  resolve,
  animate,
  running,
  interactive,
  active,
  showAll,
  onOpenRule,
  onOpenPolicy,
  ruleNotice,
  open = true,
  onFold,
  every = false,
  count = null,
  onCount,
  countOpen = false,
}: DeciderStopProps) {
  const bodyId = useId()
  const decider = plan.decider
  const stored = decider ? (policies.find((p) => p.id === decider.id) ?? null) : null
  const lastRow = plan.rules.find((r) => r.index === null)
  const terminal = useMemo(() => stored?.fallback ?? fallbackRule(lastRow?.decision ?? '1fa'), [stored, lastRow?.decision])
  const byId = useMemo(() => new Map((stored?.rules ?? []).map((r) => [r.id, r])), [stored])
  const condIds = useMemo(() => new Map((stored?.rules ?? []).map((r) => [r.id, leaves(r.when).map((c) => c.id)])), [stored])
  const cx = plan.conflicts
  const who = person ?? cx?.personName ?? 'this person'
  const also = useMemo(() => new Map((cx?.rules ?? []).map((c) => [c.ruleId, c])), [cx])
  const decidingAt = plan.steps.findIndex((k) => k.kind === 'deciding')
  const landed = s >= (decidingAt >= 0 ? decidingAt : plan.at.outcome)
  const openable = s >= plan.at.done && interactive

  /* The rule a press on the rail chose, for this plan: a new run starts again from the one that decided. */
  const [pick, setPick] = useState<{ plan: EngineRun; id: string } | null>(null)
  const picked = pick && pick.plan === plan ? (plan.rules.find((r) => r.id === pick.id) ?? null) : null
  const reading = plan.rules.find((r) => r.node === active) ?? null
  /* The last rule the engine walked into — not one it settles as Not reached. */
  const seen = [...plan.rules].reverse().find((r) => r.visited && r.startAt >= 0 && s >= r.startAt) ?? null
  const landing = plan.landing !== null ? plan.rules[plan.landing] : null
  const shown = running ? (reading ?? (landed ? landing : null) ?? seen) : (picked ?? (landed ? landing : null) ?? seen)

  const numbered = plan.rules.filter((r) => r.index !== null).length
  const where = (() => {
    if (!landed) return seen && seen.index !== null ? `Reading rule ${seen.index + 1} of ${numbered}` : seen ? 'Reading its last row' : 'Reading its rules'
    if (plan.outcome.status === 'depends') return policyWhy(plan)
    if (landing?.index != null) return `Rule ${landing.index + 1} of ${numbered} matched`
    if (landing) return numbered > 1 ? `None of its ${numbered} rules matched · Nothing else matched decides` : numbered === 1 ? 'Its rule did not match · Nothing else matched decides' : 'Nothing else matched decides'
    return policyWhy(plan)
  })()

  const CountMark = count?.conflict === false ? Info : TriangleAlert
  const noticeOf = (r: EngineRule): ReactNode => {
    if (ruleNotice) return ruleNotice(r)
    const c = also.get(r.id)
    return c && landed ? <RuleConflictNotice c={c} person={who} onOpen={openable ? () => decider && onOpenRule(decider.id, r.id) : undefined} /> : null
  }
  const cardOf = (r: EngineRule) => {
    const rule = r.index === null ? terminal : byId.get(r.id)
    if (!rule) return null
    const c = also.get(r.id)
    const conflict = c?.kind === 'conflict' && landed
    const ids = condIds.get(r.id) ?? []
    const via = r.via?.matches && (r.via.kind === 'groups' || r.via.kind === 'person') ? r.via.say : ''
    return (
      <div className="tj-rcard" data-node={r.node} {...(active === r.node ? { 'data-active': '' } : null)}>
        <RuleTraceCard
          rule={rule}
          index={r.index}
          state={traceResult(r, s, true)}
          marks={conflict ? alsoMarks(r, ids) : ruleMarks(r, ids, s)}
          miss={r.miss}
          resolve={resolve}
          full
          notice={noticeOf(r)}
          active={active === r.node}
          animate={animate}
          onOpen={decider && openable ? () => onOpenRule(decider.id, r.id) : undefined}
          via={via}
          conflict={conflict}
        />
      </div>
    )
  }

  if (!decider) return null
  const openBtn = openable && (
    <button type="button" className="bb__act tj-decider__open" aria-label={`Open ${decider.name}`} title="Open policy" onClick={() => onOpenPolicy(decider.id)}>
      <ArrowUpRight size={13} strokeWidth={2.2} />
    </button>
  )
  return (
    <div
      className={`bb__card is-trace tj-pnode is-policy is-decided${open ? ' is-open' : ' is-folded'}${onFold ? ' is-foldable' : ''}`}
      data-node="decider"
      role="group"
      aria-label={`The policy that decides: ${decider.name}`}
      onClick={pressOpen(open, onFold)}
    >
      <div className="bb__cardhead" data-port>
        <span className="bb__idx tj-pnode__mark" aria-hidden>
          <ShieldCheck size={14} strokeWidth={2} />
        </span>
        <div className="bb__title">
          <span className="bb__titlerow">
            <strong title={decider.name}>{decider.name}</strong>
            <span className="bb__state bb__tstate is-decides">Decides</span>
            {landed &&
              count &&
              (onCount ? (
                <button
                  type="button"
                  className={`bb__state bb__tstate ${count.conflict ? 'is-conflict' : 'is-folded'} tj-pnode__count`}
                  aria-expanded={countOpen}
                  title="Why"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCount()
                  }}
                >
                  <CountMark size={11} strokeWidth={2.4} aria-hidden />
                  {count.text}
                </button>
              ) : (
                <span className={`bb__state bb__tstate ${count.conflict ? 'is-conflict' : 'is-folded'} tj-pnode__count`}>
                  <CountMark size={11} strokeWidth={2.4} aria-hidden />
                  {count.text}
                </span>
              ))}
          </span>
          <em className="tj-pnode__why1" title={where}>
            {where}
          </em>
        </div>
        {/* Open policy and the fold, one trail: side by side, never one over the other. */}
        {onFold ? (
          <FoldButton open={open} onFold={onFold} what="the policy" titles={['Fold this policy', 'Show its rules']} controls={bodyId} lead={openBtn} />
        ) : (
          openBtn && <span className="bb__cardmeta">{openBtn}</span>
        )}
      </div>

      <Drawer open={open} animate={animate} id={bodyId}>
        <div className="tj-decider">
          <ol className="tj-rail" aria-label={`Rules in ${decider.name}`}>
            {plan.rules.map((r) => {
              const res = traceResult(r, s, showAll)
              const tone = CHIP_TONE[res]
              const conflict = landed && also.get(r.id)?.kind === 'conflict'
              const on = !every && shown?.id === r.id
              const label = r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}: ${r.name}`
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`tj-rail__chip is-${conflict ? 'conflict' : tone}${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    aria-label={`${label} — ${conflict ? 'Also applies' : CHIP_WORD[tone]}`}
                    title={`${label} — ${conflict ? 'Also applies' : CHIP_WORD[tone]}`}
                    tabIndex={interactive ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (interactive) setPick({ plan, id: r.id })
                    }}
                  >
                    <span className="tj-rail__num">{r.index === null ? '✱' : r.index + 1}</span>
                    <span className="tj-rail__mark" aria-hidden>
                      {conflict ? (
                        <TriangleAlert size={11} strokeWidth={2.4} />
                      ) : tone === 'match' ? (
                        <Check size={11} strokeWidth={2.8} />
                      ) : tone === 'miss' ? (
                        <X size={11} strokeWidth={2.8} />
                      ) : tone === 'unknown' ? (
                        <CircleHelp size={11} strokeWidth={2.4} />
                      ) : tone === 'reading' ? (
                        <Spinner small />
                      ) : null}
                    </span>
                    {conflict && animate && (
                      <motion.span
                        className="tj-rail__pulse"
                        aria-hidden
                        initial={{ opacity: 0, scale: 1 }}
                        animate={{ opacity: [0, 1, 0, 1, 0], scale: [1, 1.12, 1.2, 1.12, 1.24] }}
                        transition={{ duration: 2, delay: 0.3, ease: EASE_OUT }}
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
          {every ? (
            <div className="tj-decider__all">{plan.rules.map((r) => <div key={r.id}>{cardOf(r)}</div>)}</div>
          ) : (
            <div className="tj-decider__one">
              <AnimatePresence initial={false} mode="wait">
                {shown && (
                  <motion.div
                    key={shown.id}
                    initial={animate ? { opacity: 0, y: 4 } : false}
                    animate={{ opacity: 1, y: 0, transition: { duration: animate ? 0.18 : 0, ease: EASE_OUT } }}
                    exit={{ opacity: 0, transition: { duration: animate ? 0.1 : 0 } }}
                  >
                    {cardOf(shown)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </Drawer>
    </div>
  )
}
