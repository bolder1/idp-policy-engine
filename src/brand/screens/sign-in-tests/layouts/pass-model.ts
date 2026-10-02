import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import type { CheckRow, EnginePolicy, EngineRule, EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   The pass's model (PassLayout.tsx), pure: the run as the ACCESS PASS the
   engine issues — what each field of it holds at step `s`, the passes it did
   NOT issue (the wallet: the application's other policies, each with its one
   state), the moments a press can step through, and the pass's code line.
   Every word comes from the plan; nothing here throws for any plan.
   -------------------------------------------------------------------------- */

export type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

export function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

/** The step the answer lands at: the outcome, else the last. */
export function landAt(plan: Pick<EngineRun, 'at' | 'steps'>): number {
  const last = Math.max(0, plan.steps.length - 1)
  return plan.at.outcome >= 0 ? plan.at.outcome : last
}

// --- The wallet: the passes not issued -----------------------------------------------------------

export interface Edge {
  key: string
  policyId: string
  node: string
  order: number
  name: string
  /** Its one state: "Doesn't cover", "Not reached", "Also covers · not used", "Off", "Draft". */
  word: string
  /** A conflict: amber. */
  notice: boolean
  /** Why, in the plan's words. */
  why: string
  /** More, when the plan says more: the resolver's sentence, what it would decide on its own. */
  more: string
  /** The scan asks it (it is before the one that issued the pass). */
  scanAt: number | null
  settleAt: number
  /** The one that issued the pass: its slot in the stack, the pass pulled out in front. */
  issued: boolean
}

/* Every policy on the application in the engine's order — the one that
   issued the pass keeps its slot (green, "this pass"), so the stack reads
   1, 2, 3 … top to bottom and the first that covers is plain to see. */
export function edgesOf(plan: EngineRun, first: string, via = ''): Edge[] {
  const c = plan.conflicts
  const conflictIds = new Set((c?.findings ?? []).filter((f) => f.tone === 'conflict').map((f) => f.target.policyId))
  return plan.policies
    .map((p) => {
      const cover = c?.policies.find((x) => x.policyId === p.policyId)
      const off = c?.off.find((x) => x.policyId === p.policyId)
      const base = { key: p.node, policyId: p.policyId, node: p.node, order: p.order, name: p.name, scanAt: p.scanAt, settleAt: p.settleAt, issued: false }
      if (p.decides) {
        const before = plan.policies.filter((x) => x.order < p.order).length
        return {
          ...base,
          issued: true,
          word: p.isGlobalDefault ? 'Fallback · this pass' : 'Covers · this pass',
          notice: false,
          why: p.isGlobalDefault
            ? `No policy above it covers ${first}, so the Global Default decides.`
            : `Covers ${first}${via ? ` ${via}` : ''} — the first policy on ${plan.appName || 'the application'} that does${before > 0 ? ` (${before} asked before it)` : ''}.`,
          more: '',
        }
      }
      if (cover) {
        const own =
          cover.status === 'decided' && cover.decision
            ? `On its own: ${DECISION_WORDS[cover.decision]}${cover.ruleNumber !== null ? ` (rule ${cover.ruleNumber})` : ''}`
            : cover.possible.length > 0
              ? 'On its own: can’t tell'
              : ''
        return {
          ...base,
          word: 'Also covers · not used',
          notice: conflictIds.has(p.policyId),
          why: `It also covers ${first} ${cover.via.say}`.trim() + (cover.notUsed ? ` — ${cover.notUsed.replace(/^Not used — /, '')}` : ''),
          more: own,
        }
      }
      if (off) return { ...base, word: off.status === 'draft' ? 'Draft' : 'Off', notice: false, why: off.say, more: '' }
      const word =
        p.status === 'inactive' ? 'Off' : p.status === 'draft' ? 'Draft' : p.kind === 'watching' ? 'Watching' : p.scanned ? 'Doesn’t cover' : 'Not reached'
      return { ...base, word, notice: false, why: p.reason || word, more: p.tip }
    })
}

// --- The rule field: the rule being read, and the ones tried before it ---------------------------

export interface RuleField {
  /** Index into `plan.rules`: the rule on the field now, or null before any is read. */
  current: number | null
  /** The rules read before it, each stamped ✕ (or ? or off). */
  tried: number[]
}

export function ruleField(plan: EngineRun, s: number, landed: boolean): RuleField {
  const started: number[] = []
  plan.rules.forEach((r, i) => {
    if ((r.visited || r.state === 'off' || i === plan.landing) && r.startAt >= 0 && s >= r.startAt) started.push(i)
  })
  /* A Depends: the field holds the first rule that could not tell — the one the answer hangs on — not the last row. */
  const open = landed && plan.outcome.status === 'depends' ? plan.rules.findIndex((r) => r.index !== null && r.state === 'unknown') : -1
  if (open >= 0) {
    const tried = plan.rules.map((r, i) => ({ r, i })).filter(({ r, i }) => i !== open && (r.visited || r.state === 'off') && r.index !== null).map(({ i }) => i)
    return { current: open, tried }
  }
  if (landed && plan.landing !== null) {
    const tried = plan.rules.map((r, i) => ({ r, i })).filter(({ r, i }) => i !== plan.landing && (r.visited || r.state === 'off') && r.index !== null).map(({ i }) => i)
    return { current: plan.landing, tried }
  }
  return { current: started.at(-1) ?? null, tried: started.slice(0, -1) }
}

/** The row a rule was settled by: its failing row, else its first can't-tell, else null. */
export function stopRow(r: EngineRule): CheckRow | null {
  if (r.failing !== null && r.checks[r.failing]) return r.checks[r.failing]
  return r.checks.find((c) => c.status === 'unknown') ?? null
}

/** "Who · Maya Iyer is not in Contractors"; the word once. */
export const said = (row: CheckRow): string => {
  const text = row.line || row.value
  return text.toLowerCase().startsWith(row.word.toLowerCase()) ? text : `${row.word} · ${text}`
}

export const ruleNo = (r: Pick<EngineRule, 'index'>): string => (r.index === null ? 'Last' : String(r.index + 1))

// --- Moments: what the dock steps through ---------------------------------------------------------

export interface Moment {
  key: string
  label: string
  at: number
  /** The step the engine starts on it — the dock names it from then while the run plays. */
  from: number
  mark: 'pass' | 'fail' | 'unknown' | 'none'
}

export function momentsOf(plan: EngineRun, word: string): Moment[] {
  const out: Moment[] = [{ key: 'sign-in', label: 'Sign-in', at: 0, from: 0, mark: 'none' }]
  const dec = plan.policies.find((p) => p.decides)
  if (dec) out.push({ key: dec.node, label: `Policy ${dec.order} covers`, at: dec.settleAt, from: dec.scanAt ?? dec.settleAt, mark: 'pass' })
  plan.rules.forEach((r) => {
    if (!r.visited || r.startAt < 0 || r.index === null) return
    const mark = r.state === 'match' ? 'pass' : r.state === 'no-match' ? 'fail' : r.state === 'unknown' ? 'unknown' : 'none'
    out.push({ key: r.node, label: `Rule ${r.index + 1}`, at: Math.max(r.startAt, r.endAt), from: r.startAt, mark })
  })
  out.push({ key: 'outcome', label: word === 'Allow' ? 'Issued' : word, at: Math.max(0, plan.steps.length - 1), from: landAt(plan), mark: 'none' })
  return out
}

// --- The stub: the boarding status, and its code ---------------------------------------------------

export interface Status {
  /** "Allow", "Deny", "Provisional", "Not issued". */
  word: string
  /** "1 factor", "with 2FA", the deny's "Refused", "Depends on the device". */
  sub: string
  tone: Tone
  decision: AccessDecision | null
}

export function statusOf(plan: EngineRun): Status {
  const o = plan.outcome
  const tone = toneOf(plan)
  if (o.status === 'decided' && o.decision) {
    if (o.decision === 'deny') return { word: 'Deny', sub: '', tone, decision: 'deny' }
    return { word: 'Allow', sub: o.decision === '1fa' ? 'On 1 factor' : 'With 2FA', tone, decision: o.decision }
  }
  if (o.status === 'depends') {
    const needs = o.view.needs.map((n) => n.toLowerCase())
    return { word: 'Depends', sub: needs.length > 0 ? `On the ${needs.join(' and the ')}` : 'On a fact not stated', tone, decision: null }
  }
  return { word: 'Not issued', sub: o.view.line || 'No policy decides', tone, decision: null }
}

const initials = (name: string): string =>
  name
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 2 || /^[A-Z0-9]/.test(w))
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, 5) || 'POL'

/** The pass's reference: the policy, its place, the rule, the verdict — "AFET-1 · R2 · 1F". */
export function codeOf(plan: EngineRun, decider: EnginePolicy | undefined): string {
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const o = plan.outcome
  const verdict = o.status === 'decided' && o.decision ? { '1fa': '1F', '2fa': '2F', deny: 'VOID' }[o.decision] : o.status === 'depends' ? 'PROV' : 'NONE'
  const pol = decider ? `${decider.isGlobalDefault ? 'GDP' : initials(decider.name)}-${decider.order}` : 'NONE'
  const rule = land ? (land.index === null ? 'R*' : `R${land.index + 1}`) : 'R-'
  return `${pol} · ${rule} · ${verdict}`
}

/** The code as bars: widths 1–3, deterministic from its characters — the code line, drawn. */
export function barsOf(code: string): { x: number; w: number }[] {
  const out: { x: number; w: number }[] = []
  let x = 0
  for (const ch of code.replace(/\s/g, '')) {
    const c = ch.charCodeAt(0)
    for (let k = 0; k < 3; k++) {
      const w = ((c >> (k * 2)) % 3) + 1
      out.push({ x, w })
      x += w + (((c >> k) & 1) + 1)
    }
  }
  return out
}
