import type { EngineRun } from '../engine-run'
import { isQuiet } from '../journey'
import { answer, type Action, type AskProps, type Target } from './assistant/intents'

/* -----------------------------------------------------------------------------
   What the companion NOTICES (jarvis/COMPANION.md §2.3): after the verdict
   line, as the last beat, it says at most ONE thing — the first of these the
   plan has — and the verdict's "Noticed" line shows it with its one press:

     1. a conflict, or another policy or rule that also covers the person
        (the plan's findings, conflicts first)            amber · the `others` answer's first press
     2. a fact it can't tell (Depends)                     amber · "Add the device" (opens the panel)
     3. break-in attempts that got through                 red   · "Review break-in attempts"
     4. a switched-off policy that would decide otherwise  quiet · "Run as if Code review were on"

   Every word is the plan's (its findings' lines, its numbers); the press is
   the one the dock's own answer offers (intents.ts), so a notice press and
   the same words typed do the same thing. Only a press that says Run runs.
   -------------------------------------------------------------------------- */

export interface Notice {
  /** One sentence, as shown and said. */
  text: string
  /** The meaning ink: amber for a conflict or a fact it can't tell, red for a hole, neutral for a switched-off policy. */
  tone: 'notice' | 'negative' | 'neutral'
  /** Its one press (never more), or none. */
  action: Action | null
  /** What it is about, lit on the HUD while it is said, hovered or focused. */
  target: Target | null
}

const COVERS = new Set(['rule-conflict', 'named-later', 'deny-first', 'exception', 'policy-conflict', 'same-group-policy', 'group-policy-first', 'also-matches'])

const sentence = (s: string) => {
  const t = s.trim()
  return t && !/[.!?]$/.test(t) ? `${t}.` : t
}

/** The one thing worth saying after the verdict, or null (nothing is noticed then, and nothing extra is said). */
export function noticeOf(plan: EngineRun, props: AskProps): Notice | null {
  if (plan.empty) return null
  const cf = plan.conflicts
  const findings = (cf?.findings ?? []).filter((f) => !isQuiet(f))

  /* 1. Another policy or rule that also covers them — a conflict first. */
  const covers = findings.filter((f) => COVERS.has(f.kind))
  const cover = covers.find((f) => f.tone === 'conflict') ?? covers[0]
  if (cover && cover.line) {
    const first = cf?.findings[0] === cover && cf.headline ? cf.headline : cover.line
    const offered = answer('ask:others', plan, props).actions[0] ?? null
    const target: Target = cover.target.ruleId && plan.rules.some((r) => r.id === cover.target.ruleId) ? `rule:${cover.target.ruleId}` : `policy:${cover.target.policyId}`
    return { text: sentence(first), tone: 'notice', action: offered, target }
  }

  /* 2. A fact it can't tell: the rule waits on it. */
  if (plan.outcome.status === 'depends') {
    const missing = plan.rules.flatMap((r) => r.checks.map((c) => ({ r, c }))).find(({ c }) => c.status === 'unknown' && c.missing)
    const field = missing?.c.missing ?? 'device'
    const a = answer(`ask:add:${field}`, plan, props)
    const said = findings.find((f) => f.kind === 'depends')?.line ?? `Depends on the ${plan.outcome.view.needs.map((n) => n.toLowerCase()).join(' and ') || 'facts'}`
    const add = a.actions.find((x) => x.kind === 'add') ?? null
    return { text: sentence(said), tone: 'notice', action: add, target: missing ? `rule:${missing.r.id}` : null }
  }

  /* 3. Break-in attempts that got through. */
  const holes = props.breakIn?.summary.holes ?? 0
  if (holes > 0) {
    return {
      text: `${holes} break-in attempt${holes === 1 ? '' : 's'} got through on ${plan.appName}.`,
      tone: 'negative',
      action: props.onReviewBreakIn ? { kind: 'breakIn', label: 'Review break-in attempts' } : null,
      target: 'outcome',
    }
  }

  /* 4. A switched-off policy that would decide otherwise. */
  const off = findings.find((f) => f.kind === 'off-would-change')
  if (off && off.line) {
    const a = answer(`ask:off:${off.target.policyId}`, plan, props)
    return { text: sentence(off.line), tone: 'neutral', action: a.actions.find((x) => x.kind === 'assumeOn') ?? null, target: `policy:${off.target.policyId}` }
  }
  return null
}
