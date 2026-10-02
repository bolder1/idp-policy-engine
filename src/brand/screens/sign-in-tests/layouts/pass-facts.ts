import type { PillCategory } from '../../testing/trace-pills'
import type { RowsRead } from '../../testing/rows-read'
import type { SignInForm } from '../../testing/sign-in-form'
import { sentenceTokens, tokenValue, type SentenceContext, type TokenId } from '../../testing/sign-in-sentence'
import type { EngineRule, EngineRun } from '../engine-run'
import { heroFinding } from '../journey'
import type { PassCtx, PassFact } from './pass-ctx'

/* -----------------------------------------------------------------------------
   The pass's Conditions (PassLayout.tsx): the sign-in's facts the
   application's rules read, each marked by the rule that decided — or, when
   nothing above the last row matched, by the last rule that was read — once
   that rule's row for it lands. And the one finding the pass carries.
   -------------------------------------------------------------------------- */

const CATS: Partial<Record<TokenId, PillCategory[]>> = {
  from: ['network', 'place'],
  device: ['device'],
  when: ['time'],
  risk: ['risk'],
}

/** The rule whose rows mark the facts once the answer lands: the first that could not tell (a Depends), the one that decided, else the last read. */
export function sourceRuleIx(plan: EngineRun): number | null {
  if (plan.outcome.status === 'depends') {
    const u = plan.rules.findIndex((r) => r.index !== null && r.state === 'unknown')
    if (u >= 0) return u
  }
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  if (land && land.index !== null) return plan.landing
  for (let i = plan.rules.length - 1; i >= 0; i--) {
    const r = plan.rules[i]
    if (r.index !== null && r.visited && r.checks.length > 0) return i
  }
  return null
}

/* The facts, marked by the rows of rule `ix` — the rule on the pass's Rule
   field as the run plays, so a fact a rule fails on shows ✕ while that rule
   is read, then the next rule's marks. */
export function factsOfPass(plan: EngineRun, form: SignInForm, rows: RowsRead, ctx: SentenceContext, ix: number | null): PassFact[] {
  const src: EngineRule | undefined = ix !== null ? plan.rules[ix] : undefined
  let tokens: TokenId[] = []
  try {
    tokens = sentenceTokens(rows).filter((t) => t !== 'person' && t !== 'app')
  } catch {
    tokens = []
  }
  return tokens.map((token) => {
    const v = tokenValue(token, form, ctx)
    const cats = CATS[token] ?? []
    const k = src ? src.checks.findIndex((c) => cats.includes(c.category)) : -1
    const row = src && k >= 0 ? src.checks[k] : undefined
    const read = row !== undefined && src !== undefined && k < src.checked
    /* Not stated, and some rule could not tell without it: Add opens that field. */
    let missing = row?.missing ?? null
    if (!missing) {
      for (const r of plan.rules) {
        const m = r.checks.find((c) => cats.includes(c.category) && c.status === 'unknown' && c.missing)
        if (m) {
          missing = m.missing
          break
        }
      }
    }
    return {
      token,
      label: v.label,
      text: token === 'risk' && !v.unset ? `Risk score ${v.text}` : v.text,
      unset: v.unset,
      mark: read && row ? (row.status === 'pass' ? 'pass' : row.status === 'fail' ? 'fail' : 'unknown') : null,
      markAt: read && src ? (src.markAt[k] ?? null) : null,
      requirement: row?.requirement ?? '',
      missing,
    }
  })
}

/** The one line the pass carries beside its answer: a conflict (amber), else a quiet finding; never the Depends (the stub says it). */
export function findingOf(plan: EngineRun): PassCtx['finding'] {
  try {
    const h = heroFinding(plan)
    if (!h || h.tone === 'depends') return null
    const top = plan.conflicts?.findings.find((f) => f.tone === 'conflict')
    return { text: h.text, tone: h.tone === 'conflict' ? 'notice' : 'quiet', policyId: top?.target.policyId ?? null }
  } catch {
    return null
  }
}
