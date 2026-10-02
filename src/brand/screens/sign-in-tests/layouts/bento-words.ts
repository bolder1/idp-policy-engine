import { Ban, KeyRound, ShieldCheck, Split, type LucideIcon } from 'lucide-react'

import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import type { EnginePolicy, EngineRun } from '../engine-run'
import { conflictOf, type CheckRef } from './bento-model'

/* -----------------------------------------------------------------------------
   Bento's words and small pure helpers (BentoLayout.tsx), apart from the
   components so fast refresh keeps working: the eases things move on, what a
   policy's one word is, what a verdict is called, what the conflict tile
   says, which rule is held open, what the checks tile is titled.
   -------------------------------------------------------------------------- */

export const EASE = [0.2, 0, 0, 1] as const
export const LAYOUT = { duration: 0.42, ease: [0.32, 0.72, 0, 1] as const }

export interface AlsoCover {
  name: string
  conflict: boolean
  /** "Allow with 2FA (rule 1)": what it would give on its own. */
  would: string
  via: string
}

/** One word for where a policy stands in this run. */
export function policyWord(x: EnginePolicy, decider: EnginePolicy | undefined, also: AlsoCover | undefined, first: string): string {
  if (x.decides) return 'Applies'
  if (also) return 'Also covers'
  if (/switched off/i.test(x.reason)) return 'Switched off'
  if (/not turned on|draft/i.test(x.reason)) return 'Draft'
  if (x.kind === 'watching') return x.reason || 'Monitoring'
  if (decider && x.order > decider.order) return 'Not reached'
  if (/ is not in /.test(x.reason)) return `Doesn’t cover ${first}`
  return x.reason || 'Not read'
}

/** What a later policy that also covers them would give, said once. */
export const wouldOf = (pc: { status: 'decided' | 'depends'; decision: string | null; possible: readonly string[]; ruleNumber: number | null }): string =>
  pc.status === 'decided' && pc.decision
    ? `${DECISION_WORDS[pc.decision as keyof typeof DECISION_WORDS]}${pc.ruleNumber !== null ? ` (rule ${pc.ruleNumber})` : ''}`
    : pc.possible.length > 0
      ? 'can’t tell'
      : ''

export const ICON: Record<AccessDecision, LucideIcon> = { '1fa': ShieldCheck, '2fa': KeyRound, deny: Ban }

export function verdictOf(plan: EngineRun): { decided: AccessDecision | null; word: string; Icon: LucideIcon } {
  const o = plan.outcome
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  return { decided, word: decided ? DECISION_WORDS[decided] : o.status === 'depends' ? 'Depends' : o.view.line || 'No policy decides', Icon: decided ? ICON[decided] : Split }
}

export interface ConflictView {
  /** The tile's label: "Also covers" (another policy), "Also applies" (a later rule), "Left out" (an exception). */
  title: string
  head: string
  line: string
  would: string
  why: string
  fix: string
  caution: string
  fixAt: { policyId: string; ruleId: string | null } | null
}

const capital = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)

export function conflictView(plan: EngineRun, first: string): ConflictView | null {
  const f = conflictOf(plan)
  if (!f) return null
  const c = plan.conflicts
  const pc = f.target.ruleId === null ? c?.policies.find((x) => x.policyId === f.target.policyId) : undefined
  const rc = f.target.ruleId !== null ? c?.rules.find((x) => x.ruleId === f.target.ruleId) : undefined
  const ex = f.target.ruleId !== null ? c?.exceptions.find((x) => x.ruleId === f.target.ruleId) : undefined
  if (pc) {
    const would = wouldOf(pc)
    return { title: 'Also covers', head: pc.policyName, line: `Also covers ${first}${pc.via.say ? ` ${pc.via.say}` : ''}`, would: would ? `On its own: ${would}` : '', why: capital(pc.notUsed.replace(/^Not used — /, '')), fix: pc.fix || f.fix, caution: pc.caution || f.caution, fixAt: f.fixAt }
  }
  if (rc) {
    return {
      title: 'Also applies',
      head: `Rule ${rc.number} · ${rc.name}`,
      line: `${rc.match === 'unknown' ? 'Might also apply' : 'Also applies'}${rc.via.say ? ` ${rc.via.say}` : ''}`,
      would: `It would give ${DECISION_WORDS[rc.ask.decision]}`,
      why: capital(rc.notUsed.replace(/^Not used — /, '')),
      fix: rc.fix || f.fix,
      caution: rc.caution || f.caution,
      fixAt: f.fixAt,
    }
  }
  if (ex) return { title: 'Left out', head: `Rule ${ex.number} · ${ex.name}`, line: ex.why, would: '', why: '', fix: ex.fix || f.fix, caution: f.caution, fixAt: f.fixAt }
  return { title: 'Conflict', head: f.title, line: f.line, would: '', why: f.why, fix: f.fix, caution: f.caution, fixAt: f.fixAt }
}

/** The rule held open: the one that matched; else the first that could not be told. */
export function featuredRule(plan: Pick<EngineRun, 'rules' | 'landing'>): number | null {
  if (plan.landing === null) return null
  const land = plan.rules[plan.landing]
  if (land && land.index !== null && land.state === 'match') return plan.landing
  const unk = plan.rules.findIndex((r) => r.index !== null && r.state === 'unknown')
  return unk >= 0 ? unk : null
}


export const checksTitle = (plan: EngineRun, refs: CheckRef[], kind: 'match' | 'unknown' | 'misses' | 'none'): string => {
  if (kind === 'misses') return 'Checks that failed'
  const r = refs[0] ? plan.rules[refs[0].rule] : undefined
  return r && r.index !== null ? `Checks · rule ${r.index + 1}` : 'Checks'
}
