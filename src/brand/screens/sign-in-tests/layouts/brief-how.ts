import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import type { BreakInCounts } from '../../gauntlet'
import type { Finding } from '../conflicts'
import type { EngineRun } from '../engine-run'
import { eachGroupRows, type GroupRowView } from '../journey'
import type { EvCheck, EvPolicy, EvRule, Evidence, HowLink, HowStep, Mark } from './brief-evidence'
import type { CiteId } from './brief-model'

/* -----------------------------------------------------------------------------
   HOW IT WAS DECIDED, as the panel lays it out (brief-panel.tsx), pure. The
   evidence (brief-evidence.ts) said section by section, top to bottom, each
   only when it has something true to say:

     the verdict      the answer, who → app, the factors / the deny message
     decided by       the deciding policy and rule, in one row
     the path         the engine's order on a rail: the policies before, the
                      one that decides, each rule passed over, the one that
                      matched (each rule opens to its checks), the outcome
     also covers      a later policy that covers them too; their groups,
                      when each alone gets another answer
     what changes it  previews (assistant/what-if.ts), never runs
     what they see    the screens
     break-in         the attempts' counts

   Every word is the plan's, its findings' or the screens'. `summaryOf` is
   the whole of it as plain text, for a ticket.
   -------------------------------------------------------------------------- */

// --- The path -----------------------------------------------------------------------------

export type PathKind = 'before' | 'decider' | 'rule' | 'outcome'

export interface PathNode {
  /** The step's key (brief-evidence.ts `howStepsOf`): a cited part pressed finds its node by it. */
  key: string
  kind: PathKind
  mark: Mark
  /** "AWS for engineering teams", "Rule 1 · Contractors", "Nothing else matched"; the outcome's own line. */
  title: string
  /** "Covers Maya, through Engineering", "Skipped: Maya isn’t in Contractors."; ''. */
  sub: string
  cites: CiteId[]
  link: HowLink | null
  /** A rule's rows, for its table; [] for the rest (nothing to open). */
  checks: EvCheck[]
  /** The rule that decided (matched, Nothing else matched) or could not tell. */
  deciding: boolean
}

const cap = (t: string): string => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)

function ruleTitle(r: EvRule): string {
  if (r.number === null) return r.name || 'Nothing else matched'
  return r.name ? `Rule ${r.number} · ${r.name}` : `Rule ${r.number}`
}

function ruleSub(r: EvRule): string {
  const why = r.failing ? r.failing.line.replace(/^The /, 'the ') : ''
  switch (r.state) {
    case 'skipped':
      return why ? `Skipped: ${why}` : 'Skipped.'
    case 'unknown':
      return why ? `Can’t tell: ${why}` : 'Can’t tell.'
    case 'off':
      return 'Switched off.'
    case 'matched': {
      const said = r.line.replace(/^Rule \d+ matches:?\s*/, '')
      return said && said !== r.line ? `Matches: ${said}` : 'Matches.'
    }
    default:
      return r.line
  }
}

/** The steps (howStepsOf) on the panel's rail, each with what opens under it. */
export function pathOf(ev: Evidence, steps: readonly HowStep[]): PathNode[] {
  const rules = new Map(ev.rules.map((r) => [`rule:${r.key}`, r]))
  return steps.map((st): PathNode => {
    const base = { key: st.key, mark: st.mark, cites: st.cites, link: st.link, checks: [] as EvCheck[], deciding: false }
    if (st.key === 'before') {
      const one = ev.before.length === 1 ? ev.before[0] : null
      return { ...base, kind: 'before', title: one ? one.name : 'Asked first', sub: one ? cap(one.short) : st.text }
    }
    if (st.key === 'decider' && ev.decider) {
      const d = ev.decider
      return { ...base, kind: 'decider', title: d.name, sub: d.isGlobalDefault ? st.text : cap(d.short) }
    }
    const r = rules.get(st.key)
    if (r) {
      const deciding = r === ev.deciding
      const checks = r.checks.length > 0 ? r.checks : deciding ? ev.checks : []
      /* Only the deciding rule is the sentence's "rule 2": a rule passed over lights nothing there. */
      return { ...base, kind: 'rule', title: ruleTitle(r), sub: ruleSub(r), checks, deciding, cites: deciding ? st.cites : [] }
    }
    /* The outcome's Add is the verdict's own (brief-panel.tsx), and so is a deny's message (quoted there): each said once. */
    const o = ev.outcome
    const title = st.key === 'outcome' && o.kind === 'deny' && o.message ? st.text.replace(/\s+and sees\s+“[^”]*”\.?$/, '.') : st.text
    return { ...base, kind: st.key === 'outcome' ? 'outcome' : 'decider', title, sub: '', link: st.link?.kind === 'add' ? null : st.link }
  })
}

// --- Decided by ---------------------------------------------------------------------------

export interface DecidedBy {
  policyId: string
  policy: string
  /** "Rule 2 · Engineering devices", "Nothing else matched"; ''. */
  rule: string
  /** "Through Engineering", "By name", "For everyone"; ''. */
  via: string
  /** The rule to open, with its number; null for Nothing else matched (the policy opens instead). */
  open: { ruleId: string; label: string } | null
  isGlobalDefault: boolean
}

export function decidedByOf(ev: Evidence): DecidedBy | null {
  const d = ev.decider
  if (!d) return null
  const r = ev.deciding
  const rule = r ? ruleTitle(r) : ''
  const via = ev.who.via ? cap(ev.who.via) : ''
  const open = r && r.number !== null ? { ruleId: r.ruleId, label: `Open rule ${r.number}` } : null
  return { policyId: d.policyId, policy: d.name, rule, via, open, isGlobalDefault: d.isGlobalDefault }
}

/** A saved sign-in's expectation against the answer: "Expected Deny" and whether it held. Null without one. */
export function expectedOf(expected: AccessDecision | null, ev: Evidence, weaker: string | null): { words: string; held: boolean; weaker: string } | null {
  if (!expected) return null
  const got = ev.outcome.decision
  const held = got === expected && !weaker
  return { words: DECISION_WORDS[expected], held, weaker: weaker ?? '' }
}

// --- Also covers ---------------------------------------------------------------------------

export interface AlsoCovers {
  /** Amber: something gives this person another answer another way; grey: worth knowing. */
  conflict: boolean
  /** The later policies that cover them too, never reached. */
  policies: EvPolicy[]
  /** The top conflict's fix, and where it is made; null without one. */
  fix: { line: string; caution: string; policyId: string; ruleId: string | null; label: string } | null
  /** Each group alone, then the person — only when the groups alone get different answers. */
  groups: GroupRowView[]
  /** "Engineering's rule comes first"; ''. */
  why: string
}

/** The rule's "Open rule N" (or the policy's) where a fix is made. */
function fixLabel(plan: Pick<EngineRun, 'rules' | 'decider'>, at: { policyId: string; ruleId: string | null }): string {
  if (!at.ruleId) return 'Open policy'
  if (plan.decider?.id === at.policyId) {
    const r = plan.rules.find((x) => x.id === at.ruleId)
    if (r && r.index !== null) return `Open rule ${r.index + 1}`
  }
  return 'Open rule'
}

export function alsoCoversOf(plan: Pick<EngineRun, 'conflicts' | 'asEachGroup' | 'rules' | 'decider'>, ev: Evidence): AlsoCovers | null {
  const policies = ev.policies.filter((p) => p.state === 'also-covers')
  const g = plan.asEachGroup
  const rows = g && g.differs ? (eachGroupRows(plan) ?? []) : []
  if (policies.length === 0 && rows.length === 0) return null
  const top: Finding | undefined = plan.conflicts?.findings.find((f) => f.tone === 'conflict' && f.fix && f.fixAt)
  const fix = top && top.fixAt ? { line: top.fix, caution: top.caution, policyId: top.fixAt.policyId, ruleId: top.fixAt.ruleId, label: fixLabel(plan, top.fixAt) } : null
  const conflict = rows.length > 0 || policies.some((p) => p.notice) || !!plan.conflicts?.any
  return { conflict, policies, fix, groups: rows, why: g?.differs ? g.why : '' }
}

/** "Covers Maya, through Finance, but comes after, so it isn’t reached." — the policy's line after its name, its would said apart;
 *  its "Also" left to the callout's title ("Also covers Maya"), so it is said once. */
export function alsoLineOf(p: EvPolicy): string {
  const rest = p.line.startsWith(p.name) ? p.line.slice(p.name.length).trim() : p.line
  return cap(rest.replace(/\s*On its own: .*$/, '').replace(/^also\s+/i, ''))
}

/** A later policy's "On its own" answer, unless a group row already says it (its source is that policy). */
export function alsoWouldShown(p: EvPolicy, groups: readonly { source: string }[]): boolean {
  return !!p.would && !groups.some((g) => g.source.startsWith(p.name))
}

// --- Break-in -----------------------------------------------------------------------------

export interface BreakInWords {
  held: number
  /** Got through, a weaker factor, less than asked: each said when above 0. */
  holes: { key: string; n: number; words: string }[]
}

export function breakInWordsOf(counts: Pick<BreakInCounts, 'held' | 'gotThrough' | 'weakerFactor' | 'lessThanAsked'>): BreakInWords {
  const holes = [
    { key: 'got', n: counts.gotThrough, words: 'got through' },
    { key: 'weak', n: counts.weakerFactor, words: counts.weakerFactor === 1 ? 'weaker factor' : 'weaker factors' },
    { key: 'less', n: counts.lessThanAsked, words: 'less than asked' },
  ].filter((h) => h.n > 0)
  return { held: counts.held, holes }
}

// --- Copy summary -------------------------------------------------------------------------

const MARK_TEXT: Record<Mark, string> = { pass: '✓', fail: '✕', unknown: '?', none: '–' }

export interface SummaryInput {
  /** "Maya Iyer", "Anyone in Finance". */
  who: string
  appName: string
  /** The sign-in's stated facts, as the row on top says them. */
  facts: readonly string[]
  /** "Allow on 1 factor", "Deny", "Depends on the device". */
  verdict: string
  /** "Password → Google Authenticator", the deny message in quotes; ''. */
  detail: string
  decided: DecidedBy | null
  /** A Depends: its rule is what it depends on ("Depends on: …"), as the panel says it. */
  depends?: boolean
  path: readonly PathNode[]
  also: AlsoCovers | null
  expected: { words: string; held: boolean; weaker: string } | null
}

/** The whole explanation as plain text, for a ticket. */
export function summaryOf(s: SummaryInput): string {
  const out: string[] = []
  out.push(`Access check: ${s.who} → ${s.appName}`)
  if (s.facts.length > 0) out.push(`Sign-in: ${s.facts.join(' · ')}`)
  out.push(`Answer: ${s.verdict}${s.detail ? ` (${s.detail})` : ''}`)
  if (s.expected) out.push(`Expected: ${s.expected.words}${s.expected.held ? '' : ' (not what it got)'}${s.expected.weaker ? `; weaker: ${s.expected.weaker}` : ''}`)
  if (s.decided) out.push(`${s.depends ? 'Depends on' : 'Decided by'}: ${s.decided.policy}${s.decided.rule ? ` · ${s.decided.rule}` : ''}`)
  out.push('', 'How it was decided:')
  for (const n of s.path) {
    out.push(`${MARK_TEXT[n.mark]} ${n.title}${n.sub ? ` — ${n.sub}` : ''}`)
    if (n.deciding) for (const c of n.checks) out.push(`    ${MARK_TEXT[c.mark]} ${c.word}: ${c.value} (needs ${c.needs})`)
  }
  if (s.also) {
    out.push('', 'Also covers:')
    for (const p of s.also.policies) out.push(`- ${p.line}`)
    for (const g of s.also.groups) out.push(`- ${g.label}: ${g.words}${g.source ? ` (${g.source})` : ''}`)
    if (s.also.fix) out.push(`- Fix: ${s.also.fix.line}`)
  }
  return out.join('\n')
}
