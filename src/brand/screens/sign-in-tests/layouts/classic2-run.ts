import { useMemo, useState } from 'react'

import type { Policy } from '../../../data'
import { useBrand, useNameLookup } from '../../../store'
import type { NameLookup } from '../../predicate-prose'
import { useSimEnv } from '../../sim-env'
import { personOf } from '../../simulate'
import { audienceViaOf, type Via } from '../conflicts'
import {
  arrivals,
  cardsAt,
  foldOpen,
  outcomeView,
  passedLine,
  passedOver,
  policyHead,
  policyRows,
  policySections,
  ruleShown,
  workingOn,
  type CardKey,
  type OutcomeView,
  type PolicySection,
} from './classic2-model'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   What the Classic v2 chain reads off a run, and how it folds — the two hooks
   behind its cards (classic2-chain.tsx), kept out of the .tsx so that file
   exports components only.

     useChainRun(run)     who signs in, the policy that decides and how it lets
                          them in, the rule card 3 draws, the outcome: the four
                          cards' words, at the run's own step
     useChainFold(…)      which cards are open: as reached while it plays,
                          folded once it lands, a press standing until the
                          next run

   Classic v2 hands them the host's run; Focus hands them its presented one (its
   `s` the presenter's step), so in either the cards arrive at the picture's pace.
   -------------------------------------------------------------------------- */

export interface ChainRun {
  /** The cards on screen, top to bottom; the one the engine is still at work on; the step each arrives at. */
  shown: CardKey[]
  working: CardKey | null
  at: Record<CardKey, number>
  /** The run has stopped; it has landed on its outcome; the walk of its rules has settled. */
  done: boolean
  landed: boolean
  settled: boolean
  /** "Anyone in Finance" for a group pick, else the person's name. */
  who: string
  group: string | null
  appId: string | null
  appName: string | null
  /** The policy that decides, as stored, and how its audience lets this person in. */
  decider: Policy | null
  via: Via | null
  policyHead: ReturnType<typeof policyHead>
  sections: PolicySection[]
  outcome: OutcomeView
  /** The rule card 3 draws, and the rules read before it that did not pass. */
  shownRule: number | null
  passed: ReturnType<typeof passedLine>
  resolve: NameLookup
}

/** The chain's words for a run at its own step (`run.s`). */
export function useChainRun(run: RunLayoutProps): ChainRun {
  const { plan, s, running, form, asGroup, screens } = run
  const brand = useBrand()
  const resolve = useNameLookup()
  const env = useSimEnv()
  const tenant = run.policies ?? brand.policies
  const { users, groups, apps } = brand

  const shown = cardsAt(plan, s)
  const done = !running
  const landed = done && shown.includes('outcome')
  const settled = done || (plan.at.outcome >= 0 && s >= plan.at.outcome)

  /* Who signs in, as the cards name them: a person, or "Anyone in Finance". */
  const person = users.find((u) => u.id === form.personId) ?? null
  const group = asGroup ? (groups.find((g) => g.id === asGroup || g.name === asGroup)?.name ?? asGroup) : null
  const who = group ? `Anyone in ${group}` : (person?.name ?? 'Choose a person')
  const app = apps.find((a) => a.id === form.appId) ?? null

  /* The policy that decides, as stored (a policy's draft inside one): its rules, and how its audience lets this person in. */
  const decider = useMemo(() => (plan.decider ? (tenant.find((p) => p.id === plan.decider?.id) ?? null) : null), [plan.decider, tenant])
  const simPerson = useMemo(() => personOf(form.personId || undefined, env), [form.personId, env])
  const via = useMemo(() => (decider && simPerson ? audienceViaOf(decider, simPerson, env) : null), [decider, simPerson, env])
  const outcome = useMemo(() => outcomeView(plan, screens), [plan, screens])
  const shownRule = ruleShown(plan, s, settled)

  return {
    shown,
    working: workingOn(plan, s),
    at: arrivals(plan),
    done,
    landed,
    settled,
    who,
    group,
    appId: app?.id ?? null,
    appName: app?.name ?? null,
    decider,
    via,
    policyHead: policyHead(plan, s, who, via),
    sections: policySections(policyRows(plan, s, via)),
    outcome,
    shownRule,
    passed: passedLine(passedOver(plan, shownRule, s)),
    resolve,
  }
}

export interface ChainFold {
  open: Record<CardKey, boolean>
  /** Any card on screen is open: the fold-all button says "Collapse all". */
  anyOpen: boolean
  /** One card's fold, pressed. */
  fold: (k: CardKey) => void
  /** One card opened or folded by something other than its fold (an answer pointing at it). */
  set: (k: CardKey, open: boolean) => void
  /** Every card on screen, the fold-all button: all folded when any is open, else all open. */
  foldAll: () => void
}

/* The fold: open as reached while it plays, folded once it lands; what the admin pressed stands until the next run (or
   another identity of it) — `key` is what says which run that is. */
export function useChainFold(key: string, shown: readonly CardKey[], landed: boolean): ChainFold {
  const [hand, setHand] = useState<{ key: string; open: Partial<Record<CardKey, boolean>> }>({ key, open: {} })
  const pressed = hand.key === key ? hand.open : {}
  const open = foldOpen(shown, landed, pressed)
  const anyOpen = shown.some((k) => open[k])
  return {
    open,
    anyOpen,
    fold: (k) => setHand({ key, open: { ...pressed, [k]: !open[k] } }),
    set: (k, v) => {
      if (open[k] !== v) setHand({ key, open: { ...pressed, [k]: v } })
    },
    foldAll: () => setHand({ key, open: Object.fromEntries(shown.map((k) => [k, !anyOpen])) }),
  }
}
