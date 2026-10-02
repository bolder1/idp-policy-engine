import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import type { FormField } from '../../testing/sign-in-form'
import type { TokenId } from '../../testing/sign-in-sentence'
import { checkPhase, policyFound, policyPhase, type CheckRow, type EnginePolicy, type EngineRule, type EngineRun } from '../engine-run'
import { traceResult } from '../journey'

/* -----------------------------------------------------------------------------
   Jarvis v3, the REACTOR — what the HUD shows at step `s`, pure.

   The reactor IS the run: its outer ring the policies on the application,
   its middle ring the deciding policy's rules, its inner ring the checks of
   the rule in focus, its core the verdict. Each ring turns like a
   combination lock so the segment that decides comes to rest under the
   pointer at 12 o'clock; what failed sits counter-clockwise of it, what was
   never reached clockwise, in order. While the run plays, each ring turns to
   the segment being examined.

   Every word and number below is a fact of the run (engine-run.ts): counts,
   positions, the checks' words and values. Nothing is made up.
   -------------------------------------------------------------------------- */

/*   ghost   not drawn yet
     idle    drawn, not reached / not read
     work    being examined (cyan)
     ok      matched / covers / allow (green)
     bad     failed / deny (red)
     warn    a conflict, or can't tell (amber)
     miss    a policy that does not cover the person (dim, ✕)
     off     switched off, or not turned on */
export type Tone = 'ghost' | 'idle' | 'work' | 'ok' | 'bad' | 'warn' | 'miss' | 'off'

export type Mark = 'pass' | 'fail' | 'unknown' | 'conflict' | 'none'

export type Target = { kind: 'policy'; policyId: string } | { kind: 'rule'; policyId: string; ruleId: string } | null

export interface RingSeg {
  key: string
  /** The HUD id a row and its segment share (an answer lights it): `policy:…`, `rule:…`, `check:…`. */
  jv: string
  tone: Tone
  /** On the ring: a number, a short name where the arc is long enough, a mark. */
  label: string
  /** The whole of it, for the segment's title. */
  full: string
  /** Drawn dashed: can't tell, or "if not". */
  dashed: boolean
  target: Target
}

export interface Ring {
  segs: RingSeg[]
  /** The segment under the pointer, or null (the ring rests at 0). */
  focus: number | null
  /** The focus is the answer: the lock's clamps snap shut on it. */
  locked: boolean
  /** The ring is drawn (its segments have arrived). */
  shown: boolean
}

export type ReadTone = 'idle' | 'work' | 'done' | 'ok' | 'bad' | 'warn'

export interface Readout {
  key: 'policies' | 'rules' | 'checks' | 'outcome'
  label: string
  value: string
  sub: string
  tone: ReadTone
}

export type CoreTone = 'work' | 'ok' | 'bad' | 'warn' | 'idle'

export interface Core {
  tone: CoreTone
  /** Over the word, while it runs: what the engine is on ("RULE 2"). */
  kicker: string
  word: string
  sub: string
  icon: 'allow' | 'deny' | 'depends' | 'none' | 'work'
  /** Lit cells in the dial round the core: one per factor. */
  cells: number
}

export interface PolicyRow {
  key: string
  jv: string
  n: number
  name: string
  line: string
  tone: Tone
  mark: Mark
  lock: boolean
  policyId: string
}

export interface CheckLine {
  key: string
  jv: string
  word: string
  value: string
  needs: string
  tone: Tone
  mark: Mark
  subs: { key: string; label: string; actual: string; required: string; mark: Mark }[]
}

export interface RuleRow {
  key: string
  jv: string
  /** 1-based, or null for "Nothing else matched". */
  n: number | null
  name: string
  line: string
  tone: Tone
  mark: Mark
  open: boolean
  checks: CheckLine[]
  then: { text: string; tone: Tone } | null
  ruleId: string
  policyId: string | null
}

export type Folded<T> = T | { fold: true; key: string; items: T[]; first: number; last: number; line: string }

export interface FactIn {
  token: TokenId
  field: FormField
  label: string
  value: string
  unset: boolean
}

export interface CondRow {
  key: string
  jv: string
  token: TokenId
  field: FormField
  label: string
  value: string
  tone: Tone
  status: string
  mark: Mark
  add: boolean
}

export interface GroupTag {
  name: string
  tone: Tone
  note: string
}

export interface JvContext {
  /** "Maya", or the group's name. */
  first: string
  /** The person's groups, by name (or the one group a member of it is tested as). */
  groups: readonly string[]
  facts: readonly FactIn[]
  /** The decision on screen's factors (jarvis-intents.ts `factorsOf`). */
  factors: readonly string[]
  /** Show every check: every visited rule open, sub-checks shown. */
  all?: boolean
}

export interface JvModel {
  landed: boolean
  stage: 'boot' | 'find' | 'scan' | 'rules' | 'deciding' | 'landed'
  policies: Ring
  rules: Ring
  checks: Ring & { rule: number | null }
  readouts: Readout[]
  core: Core
  polRows: PolicyRow[]
  ruleRows: RuleRow[]
  conds: CondRow[]
  groups: GroupTag[]
  /** The step's check, read now: its category (the condition row says "Checking now"). */
  reading: CheckRow['category'] | null
  /** Find's lap: the satellite rides the outer ring, drawing the policies behind it. */
  finding: boolean
  /** While it runs, what the decision waits for, and what the engine has done so far, in one sentence. */
  waits: { head: string; line: string }
  verdict: Tone
}

/* The categories each fact of the sign-in is read by. */
export const TOKEN_CATS: Partial<Record<TokenId, readonly CheckRow['category'][]>> = {
  from: ['network', 'place'],
  device: ['device'],
  when: ['time'],
  risk: ['risk'],
}

const MARK_OF: Record<CheckRow['status'], Mark> = { pass: 'pass', fail: 'fail', unknown: 'unknown' }
const TONE_OF: Record<CheckRow['status'], Tone> = { pass: 'ok', fail: 'bad', unknown: 'warn' }
const SYMBOL: Record<Mark, string> = { pass: '✓', fail: '✕', unknown: '?', conflict: '!', none: '' }

const ruleNum = (r: Pick<EngineRule, 'index'>, n: number) => (r.index === null ? n : r.index + 1)
const ruleWord = (r: Pick<EngineRule, 'index'>) => (r.index === null ? 'Nothing else matched' : `Rule ${r.index + 1}`)
const upper = (t: string) => t.toUpperCase()
const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After|Any) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

/** "Not in it" said of the person. */
function missWords(reason: string, first: string): string {
  if (/ is not in (it|this policy)$/.test(reason)) return `Doesn't cover ${first}`
  return reason || `Doesn't cover ${first}`
}

/** The verdict as a tone. */
export function verdictTone(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'bad' : 'ok'
  return o.status === 'depends' ? 'warn' : 'idle'
}

/** The rule the walk stopped at, the rule the checks ring shows once landed: the decider with checks; on a Depends the first it could not tell; else the nearest miss (the rule whose checks got furthest). */
export function focusRuleOf(plan: EngineRun): number | null {
  const rules = plan.rules
  if (plan.outcome.status === 'depends') {
    const u = rules.findIndex((r) => r.state === 'unknown')
    if (u >= 0) return u
  }
  const L = plan.landing
  if (L !== null && rules[L] && rules[L].index !== null && rules[L].checks.length > 0) return L
  let best: number | null = null
  let bestPass = -1
  rules.forEach((r, i) => {
    if (!r.visited || r.index === null || r.checked === 0) return
    const pass = r.checks.slice(0, r.checked).filter((c) => c.status === 'pass').length
    if (pass >= bestPass) {
      best = i
      bestPass = pass
    }
  })
  return best
}

/** Where the rules ring locks once landed: the rule the answer hinges on (the first it could not tell), else the rule that decided. */
function ruleLockOf(plan: EngineRun): number | null {
  if (plan.outcome.status === 'depends') {
    const u = plan.rules.findIndex((r) => r.state === 'unknown')
    if (u >= 0) return u
  }
  return plan.landing
}

/** The check the checks ring locks on: the one that failed, the one it could not tell, else the last it read. */
function checkLockOf(r: EngineRule): number | null {
  if (r.checks.length === 0) return null
  if (r.failing !== null) return r.failing
  const u = r.checks.slice(0, r.checked).findIndex((c) => c.status === 'unknown')
  if (u >= 0) return u
  return Math.max(0, Math.min(r.checks.length, r.checked) - 1)
}

/** The rule the engine is reading at s (or read last), while it runs. */
function ruleAt(plan: EngineRun, s: number): number | null {
  const st = plan.steps[s]
  if (st && st.rule !== undefined) return st.rule
  let at: number | null = null
  plan.rules.forEach((r, i) => {
    if (r.visited && r.startAt >= 0 && r.startAt <= s) at = i
  })
  return at
}

/** The check being read at s, if any. */
function checkAt(plan: EngineRun, s: number): { rule: number; check: number } | null {
  const st = plan.steps[s]
  if (!st || (st.kind !== 'check' && st.kind !== 'checked') || st.rule === undefined || st.check === undefined) return null
  return { rule: st.rule, check: st.check }
}

/** A check's state at s: not reached, being read, or its result. */
function checkTone(r: EngineRule, k: number, s: number, landed: boolean): { tone: Tone; mark: Mark } {
  const c = r.checks[k]
  if (!c) return { tone: 'idle', mark: 'none' }
  if (k >= r.checked) return { tone: landed || (r.endAt >= 0 && s >= r.endAt) ? 'idle' : 'ghost', mark: 'none' }
  const ph = landed ? 'settled' : checkPhase(r, k, s)
  if (ph === 'hidden') return { tone: 'ghost', mark: 'none' }
  if (ph === 'working') return { tone: 'work', mark: 'none' }
  return { tone: TONE_OF[c.status], mark: MARK_OF[c.status] }
}

/** A check's value as the sign-in showed it: a Who that let the person in says how. */
function factOf(c: CheckRow, via?: EngineRule['via']): string {
  if (c.missing || c.status === 'unknown') return c.value && c.value !== 'Not stated' && !c.missing ? c.value : 'Not stated'
  if (c.category === 'who' && c.status === 'pass' && via?.matches && via.say) return `${c.value} · ${via.say}`
  return c.value
}

/** "Device · not registered": a check's word and the last part of what it found, short enough for the core. */
export function shortFinding(c: CheckRow): string {
  if (c.status === 'unknown' || c.missing) return `${c.word} not stated`
  const parts = c.value.split(' · ')
  const tail = parts.length > 1 ? parts[parts.length - 1] : ''
  return tail ? `${c.word} · ${tail}` : `${c.word} failed`
}

/* Long lists fold (the stress case: 8 policies, 10 rules): past `max` rows,
   each run of entries `keep` says no to becomes one row that names its first
   and counts the rest; it opens the whole list. */
export function fold<T>(list: readonly T[], keep: (t: T) => boolean, num: (t: T) => number, max = 5, line = 'Not reached'): Folded<T>[] {
  if (list.length <= max) return [...list]
  const out: Folded<T>[] = []
  for (const it of list) {
    const last = out[out.length - 1]
    if (!keep(it) && last && typeof last === 'object' && last !== null && 'fold' in last) {
      last.items.push(it)
      last.last = num(it)
      continue
    }
    if (!keep(it)) {
      out.push({ fold: true, key: `fold:${num(it)}`, items: [it], first: num(it), last: num(it), line })
      continue
    }
    out.push(it)
  }
  return out.map((x) => (typeof x === 'object' && x !== null && 'fold' in x && x.items.length === 1 ? x.items[0] : x))
}

export const isFold = <T,>(x: Folded<T>): x is Extract<Folded<T>, { fold: true }> => typeof x === 'object' && x !== null && 'fold' in x

// --- The model ------------------------------------------------------------------------------

export function jarvisModel(plan: EngineRun, s: number, ctx: JvContext): JvModel {
  const at = plan.at
  const last = plan.steps.length - 1
  const landed = s >= last || (at.outcome >= 0 && s >= at.outcome)
  const step = plan.steps[s]
  const nP = plan.policies.length
  const nR = plan.rules.length
  const first = ctx.first
  const verdict = verdictTone(plan)
  const deciderIdx = plan.policies.findIndex((p) => p.decides)
  const decider = deciderIdx >= 0 ? plan.policies[deciderIdx] : undefined
  const deciderSettled = decider ? s >= decider.settleAt : landed
  const expanded = decider?.expandAt !== null && decider?.expandAt !== undefined && s >= decider.expandAt
  const conflictPol = new Set((plan.conflicts?.policies ?? []).map((p) => p.policyId))
  const conflictRule = new Map((plan.conflicts?.rules ?? []).map((r) => [r.ruleId, r]))
  const viaDecider = plan.conflicts?.policies[0]?.deciderVia
  const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const via = viaDecider?.matches ? viaDecider : landing?.via?.matches ? landing.via : undefined

  const stage: JvModel['stage'] = landed
    ? 'landed'
    : at.which < 0 || s < at.which
      ? 'boot'
      : s === at.which
        ? 'find'
        : !expanded
          ? 'scan'
          : step?.kind === 'deciding'
            ? 'deciding'
            : 'rules'

  // --- The outer ring: the policies ---
  const many = nP > 5
  const polSegs: RingSeg[] = plan.policies.map((p) => {
    const t = polTone(p, s, landed, conflictPol.has(p.policyId), at.which)
    const mark: Mark = t === 'miss' ? 'fail' : t === 'warn' ? 'conflict' : 'none'
    return {
      key: p.policyId,
      jv: p.node,
      tone: t,
      /* The mark rides with the number, so a label cut to its arc keeps it. */
      label: [`P${p.order}`, SYMBOL[mark], many ? '' : upper(p.name)].filter(Boolean).join(' '),
      full: `Policy ${p.order} · ${p.name}`,
      dashed: false,
      target: { kind: 'policy', policyId: p.policyId },
    }
  })
  let polFocus: number | null = null
  plan.policies.forEach((p, i) => {
    if (p.scanAt !== null && s >= p.scanAt) polFocus = i
  })
  if (decider && (landed || (decider.foundAt !== null && s >= decider.foundAt))) polFocus = deciderIdx
  if (landed) polFocus = deciderIdx >= 0 ? deciderIdx : null
  const polRing: Ring = { segs: polSegs, focus: polFocus, locked: deciderIdx >= 0 && deciderSettled, shown: at.which >= 0 && s >= at.which }

  // --- The middle ring: the deciding policy's rules ---
  const manyR = nR > 6
  const lockRule = landed ? ruleLockOf(plan) : null
  const ruleNow = landed ? lockRule : expanded ? ruleAt(plan, s) : null
  const ruleMarks: Mark[] = []
  const ruleSegs: RingSeg[] = plan.rules.map((r) => {
    const res = landed ? traceResult(r, Number.MAX_SAFE_INTEGER) : traceResult(r, s)
    const { tone, mark, dashed } = ruleTone(r, res, verdict, conflictRule.get(r.id)?.kind === 'conflict' && landed)
    ruleMarks.push(mark)
    const num = r.index === null ? 'LAST' : `R${r.index + 1}`
    let word = ''
    if (!manyR) {
      if (res === 'reading') word = 'CHECKING'
      else if (res === 'matched' || res === 'possible') word = r.index === null ? (res === 'possible' ? 'IF NOT' : 'DECIDES') : 'MATCH'
      else if (res === 'missed' || res === 'folded') word = upper(r.checks[r.failing ?? -1]?.word ?? '')
      else if (res === 'unknown') word = upper(r.checks.find((c) => c.status === 'unknown')?.word ?? '')
      else if (res === 'off') word = 'OFF'
      else if (r.index === null) word = 'RULE'
    }
    const sym = SYMBOL[mark]
    const label = manyR ? [num, sym].filter(Boolean).join(' ') : [num, sym, word].filter(Boolean).join(' ')
    return {
      key: r.id,
      jv: r.node,
      tone: !expanded && !landed ? 'ghost' : tone,
      label,
      full: `${ruleWord(r)}${r.index !== null ? ` · ${r.name}` : ''}`,
      dashed,
      target: plan.decider ? (r.index === null ? { kind: 'policy', policyId: plan.decider.id } : { kind: 'rule', policyId: plan.decider.id, ruleId: r.id }) : null,
    }
  })
  const ruleRing: Ring = {
    segs: ruleSegs,
    focus: ruleNow,
    locked: landed && lockRule !== null,
    shown: nR > 0 && (landed || expanded),
  }

  // --- The inner ring: the checks of the rule in focus ---
  const focusRule = landed ? focusRuleOf(plan) : ruleNow
  const fr = focusRule !== null ? plan.rules[focusRule] : undefined
  const reading = checkAt(plan, s)
  const chkSegs: RingSeg[] = fr
    ? fr.checks.map((c, k) => {
        const { tone, mark } = checkTone(fr, k, s, landed)
        const n = ruleNum(fr, nR)
        const sym = SYMBOL[mark]
        const long = `R${n} · ${upper(c.word)}${sym ? ` ${sym}` : ''}`
        return {
          key: `${fr.id}:${c.key}`,
          jv: `check:${fr.id}:${k}`,
          tone,
          label: fr.checks.length > 3 ? `${upper(c.word)}${sym ? ` ${sym}` : ''}` : long,
          full: `${ruleWord(fr)} · ${c.word} · ${factOf(c, fr.via)}`,
          dashed: c.status === 'unknown' && tone === 'warn',
          target: plan.decider && fr.index !== null ? { kind: 'rule', policyId: plan.decider.id, ruleId: fr.id } : null,
        }
      })
    : []
  const chkFocus = fr ? (landed ? checkLockOf(fr) : reading && reading.rule === focusRule ? reading.check : lastRead(fr, s)) : null
  const chkRing = { segs: chkSegs, focus: chkFocus, locked: landed && chkFocus !== null, shown: chkSegs.length > 0, rule: focusRule }

  // --- The readouts on the compass ---
  const settledChecks = plan.rules.reduce((n, r) => n + r.checkAt.filter((_, k) => landed || (r.markAt[k] !== undefined && s >= r.markAt[k])).length, 0)
  const polRead: Readout = {
    key: 'policies',
    label: 'Policies',
    value: polRing.shown && polFocus !== null ? String((polFocus as number) + 1) : '—',
    sub: nP > 0 ? `of ${nP}` : '',
    tone: !polRing.shown ? 'idle' : deciderSettled ? 'done' : 'work',
  }
  const rulesLive = ruleRing.shown && ruleNow !== null
  const ruleRead: Readout = {
    key: 'rules',
    label: 'Rules',
    value: rulesLive ? String(ruleNum(plan.rules[ruleNow as number], nR)) : '—',
    sub: nR > 0 ? `of ${nR}` : '',
    tone: !rulesLive ? 'idle' : landed ? 'done' : 'work',
  }
  const chkRead: Readout = {
    key: 'checks',
    label: 'Checks',
    value: settledChecks > 0 || landed ? String(settledChecks) : '—',
    sub: !landed && stage === 'rules' ? 'so far' : '',
    tone: landed ? 'done' : stage === 'rules' ? 'work' : 'idle',
  }
  const o = plan.outcome
  const outWord = o.status === 'decided' && o.decision ? (o.decision === 'deny' ? 'DENY' : 'ALLOW') : o.status === 'depends' ? 'DEPENDS' : 'NONE'
  const outRead: Readout = {
    key: 'outcome',
    label: 'Outcome',
    value: landed ? outWord : '—',
    sub: landed ? '' : 'not yet',
    tone: !landed ? (stage === 'deciding' ? 'work' : 'idle') : verdict === 'ok' ? 'ok' : verdict === 'bad' ? 'bad' : verdict === 'warn' ? 'warn' : 'done',
  }

  // --- The core ---
  const core = coreOf(plan, landed, stage, fr, ctx.factors, reading, polFocus, ruleNow)

  // --- The rows ---
  const polRows: PolicyRow[] = plan.policies.map((p, i) => {
    const t = polSegs[i].tone
    return {
      key: p.policyId,
      jv: p.node,
      n: p.order,
      name: p.name,
      line: polLine(p, t, s, landed, first, via?.say ?? '', plan, at.decides),
      tone: t,
      mark: t === 'miss' ? 'fail' : t === 'warn' ? 'conflict' : t === 'ok' ? 'pass' : 'none',
      lock: p.decides && t === 'ok',
      policyId: p.policyId,
    }
  })

  const ruleRows: RuleRow[] = plan.rules.map((r, i) => {
    const res = landed ? traceResult(r, Number.MAX_SAFE_INTEGER, ctx.all) : traceResult(r, s, ctx.all)
    const seg = ruleSegs[i]
    const clash = conflictRule.get(r.id)
    const tone = seg.tone === 'ghost' ? 'idle' : seg.tone
    const isFocus = landed ? i === focusRule || (ctx.all === true && r.visited && r.index !== null) : i === ruleNow && res === 'reading'
    const open = isFocus && r.checks.length > 0 && r.index !== null
    const checks: CheckLine[] = open
      ? r.checks.map((c, k) => {
          const ct = checkTone(r, k, s, landed)
          return {
            key: c.key,
            jv: `check:${r.id}:${k}`,
            word: c.word,
            value: k >= r.checked ? 'Not read' : factOf(c, r.via),
            needs: c.requirement ? `needs ${lowerFirst(c.requirement)}` : '',
            tone: ct.tone,
            mark: ct.mark,
            subs: ctx.all && k < r.checked ? c.subs.map((x) => ({ key: x.key, label: x.label, actual: x.actual, required: x.required, mark: MARK_OF[x.status] })) : [],
          }
        })
      : []
    const thenTone: Tone = r.decision === 'deny' ? 'bad' : 'ok'
    return {
      key: r.id,
      jv: r.node,
      n: r.index === null ? null : r.index + 1,
      name: r.name,
      line: ruleLine(r, res, landed, first, clash, plan.landing === i),
      tone,
      mark: ruleMarks[i] ?? 'none',
      open,
      checks,
      then: open && (res === 'matched' || (landed && plan.landing === i)) ? { text: DECISION_WORDS[r.decision], tone: thenTone } : null,
      ruleId: r.id,
      policyId: plan.decider?.id ?? null,
    }
  })

  // --- The conditions: what the run did with each fact ---
  const readCat = reading ? (plan.rules[reading.rule]?.checks[reading.check]?.category ?? null) : null
  const conds: CondRow[] = ctx.facts.map((f) => condOf(plan, f, s, landed, readCat))

  // --- The person's groups: the ones that let them in, and the ones that also cover them ---
  const viaNames = new Set((via?.groups ?? []).map((g) => g.name))
  const alsoNames = new Set((plan.conflicts?.policies ?? []).flatMap((p) => p.via.groups.map((g) => g.name)))
  const found = decider ? decider.foundAt !== null && s >= decider.foundAt : false
  const groups: GroupTag[] = ctx.groups.map((g) => {
    if ((landed || found) && viaNames.has(g)) return { name: g, tone: 'ok', note: `lets ${first} in` }
    if (landed && alsoNames.has(g)) return { name: g, tone: 'warn', note: 'also covers' }
    return { name: g, tone: 'idle', note: '' }
  })

  return {
    landed,
    stage,
    policies: polRing,
    rules: ruleRing,
    checks: chkRing,
    readouts: [polRead, ruleRead, chkRead, outRead],
    core,
    polRows,
    ruleRows,
    conds,
    groups,
    reading: readCat,
    finding: stage === 'find',
    waits: waitsOf(plan, s, stage, first, ruleNow, reading),
    verdict,
  }
}

function lastRead(r: EngineRule, s: number): number | null {
  let at: number | null = null
  r.checkAt.forEach((t, k) => {
    if (s >= t) at = k
  })
  return at ?? (r.checks.length > 0 ? 0 : null)
}

function polTone(p: EnginePolicy, s: number, landed: boolean, conflict: boolean, which: number): Tone {
  if (which < 0 || s < which) return 'ghost'
  const ph = landed ? 'settled' : policyPhase(p, s)
  if (!landed && (policyFound(p, s) || ph === 'working')) return 'work'
  if (ph === 'waiting') return p.kind === 'waiting' || p.kind === 'watching' ? 'off' : 'idle'
  if (p.decides) return 'ok'
  if (landed && conflict) return 'warn'
  if (p.scanned) return 'miss'
  if (p.kind === 'waiting' || p.kind === 'watching' || p.kind === 'elsewhere') return 'off'
  return 'idle'
}

function polLine(p: EnginePolicy, t: Tone, s: number, landed: boolean, first: string, via: string, plan: EngineRun, decidesAt: number): string {
  switch (t) {
    case 'ghost':
      return ''
    case 'work':
      return policyFound(p, s) ? `Covers ${first}${via ? ` ${via}` : ''}` : 'Checking'
    case 'ok':
      return p.isGlobalDefault ? 'No policy above covers · decides' : `Covers ${via || first} · decides`
    case 'warn': {
      const c = plan.conflicts?.policies.find((x) => x.policyId === p.policyId)
      return `Also covers ${first}${c?.via.say ? `, ${c.via.say}` : ''} · not used`
    }
    case 'miss':
      return missWords(p.reason, first)
    case 'off':
      return p.reason || 'Switched off'
    default:
      return landed || (decidesAt >= 0 && s >= decidesAt) ? p.reason || 'Not reached' : ''
  }
}

function ruleTone(r: EngineRule, res: ReturnType<typeof traceResult>, verdict: Tone, conflict: boolean): { tone: Tone; mark: Mark; dashed: boolean } {
  switch (res) {
    case 'waiting':
      return { tone: 'idle', mark: 'none', dashed: false }
    case 'reading':
      return { tone: 'work', mark: 'none', dashed: false }
    case 'matched':
      /* The rule that decided carries the answer's colour: green on an allow, red where it denies. */
      return { tone: r.decision === 'deny' ? 'bad' : verdict === 'warn' ? 'warn' : 'ok', mark: 'pass', dashed: false }
    case 'missed':
    case 'folded':
      return { tone: 'bad', mark: 'fail', dashed: false }
    case 'unknown':
      return { tone: 'warn', mark: 'unknown', dashed: true }
    case 'possible':
      return { tone: 'warn', mark: 'none', dashed: true }
    case 'off':
      return { tone: 'off', mark: 'none', dashed: false }
    default:
      return conflict ? { tone: 'warn', mark: 'conflict', dashed: false } : { tone: 'idle', mark: 'none', dashed: false }
  }
}

function ruleLine(r: EngineRule, res: ReturnType<typeof traceResult>, landed: boolean, first: string, clash: { kind: string; match?: string; via: { say: string } } | undefined, decides: boolean): string {
  const d = DECISION_WORDS[r.decision]
  switch (res) {
    case 'waiting':
      /* One line: the dash says it was not reached; the catch-all keeps what it would do. */
      return landed && r.index === null ? `${d} · not reached` : ''
    case 'reading':
      return 'Checking'
    case 'matched':
      return r.index === null ? `Catch-all · decides · ${d}` : decides ? `Matches · ${d}` : 'Matches'
    case 'missed':
    case 'folded':
      return r.miss || (r.failing !== null ? `${r.checks[r.failing]?.word ?? 'A check'} failed` : "Doesn't apply")
    case 'unknown': {
      const c = r.checks.find((x) => x.status === 'unknown')
      return c ? `Can't tell · ${c.word} not stated` : "Can't tell"
    }
    case 'possible':
      return `If not · ${d}`
    case 'off':
      return 'Switched off'
    default:
      if (clash && landed) return `${clash.match === 'unknown' ? 'Might apply' : 'Also applies'} to ${first}${clash.via.say ? ` ${clash.via.say}` : ''} · not used`
      return r.index === null ? `${d} · not reached` : ''
  }
}

function coreOf(
  plan: EngineRun,
  landed: boolean,
  stage: JvModel['stage'],
  fr: EngineRule | undefined,
  factors: readonly string[],
  reading: { rule: number; check: number } | null,
  polFocus: number | null,
  ruleNow: number | null,
): Core {
  const o = plan.outcome
  if (!landed) {
    const r = ruleNow !== null ? plan.rules[ruleNow] : undefined
    const c = reading ? plan.rules[reading.rule]?.checks[reading.check] : undefined
    const kicker =
      stage === 'rules' && r ? (r.index === null ? 'LAST RULE' : `RULE ${r.index + 1}`) : stage === 'scan' && polFocus !== null ? `POLICY ${polFocus + 1}` : stage === 'deciding' ? 'OUTCOME' : 'POLICIES'
    const sub = stage === 'rules' ? (c ? c.word : r ? (r.index === null ? 'Nothing else matched' : `${r.checks.length} check${r.checks.length === 1 ? '' : 's'}`) : '') : stage === 'deciding' ? 'Deciding' : stage === 'scan' && polFocus !== null ? 'Covers?' : 'Finding'
    return { tone: 'work', kicker, word: 'CHECKING', sub, icon: 'work', cells: 0 }
  }
  if (o.status === 'decided' && o.decision) {
    if (o.decision !== 'deny') {
      const n = factors.length > 0 ? factors.length : o.decision === '2fa' ? 2 : 1
      return { tone: 'ok', kicker: '', word: 'ALLOW', sub: `${n} factor${n === 1 ? '' : 's'}`, icon: 'allow', cells: n }
    }
    const L = plan.landing !== null ? plan.rules[plan.landing] : undefined
    let sub = 'Nothing else matched'
    if (L && L.index !== null) sub = `Rule ${L.index + 1} matched`
    else if (fr && fr.failing !== null && fr.checks[fr.failing]) sub = shortFinding(fr.checks[fr.failing])
    return { tone: 'bad', kicker: '', word: 'DENY', sub, icon: 'deny', cells: 0 }
  }
  if (o.status === 'depends') {
    const needs = o.view.needs
    return { tone: 'warn', kicker: '', word: 'DEPENDS', sub: needs.length > 0 ? `${needs.join(' and ')} not stated` : "Can't tell", icon: 'depends', cells: 0 }
  }
  return { tone: 'idle', kicker: '', word: 'NO POLICY', sub: 'decides', icon: 'none', cells: 0 }
}

function condOf(plan: EngineRun, f: FactIn, s: number, landed: boolean, readCat: CheckRow['category'] | null): CondRow {
  const cats = TOKEN_CATS[f.token] ?? []
  const base = { key: f.token, jv: `fact:${f.field}`, token: f.token, field: f.field, label: f.label, value: f.value }
  if (!landed && readCat && cats.includes(readCat)) return { ...base, tone: 'work', status: 'Checking now', mark: 'none', add: false }
  /* What the rules read of it, so far: the rule that decided first, then a failure, then what could not be told. */
  const reads: { r: EngineRule; c: CheckRow }[] = []
  for (const r of plan.rules) {
    if (!r.visited) continue
    r.checks.forEach((c, k) => {
      if (k >= r.checked || !cats.includes(c.category)) return
      if (!landed && !(r.markAt[k] !== undefined && s >= r.markAt[k])) return
      reads.push({ r, c })
    })
  }
  const L = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const held = landed && L ? reads.find((x) => x.r === L && x.c.status === 'pass') : undefined
  const n = (r: EngineRule) => (r.index === null ? plan.rules.length : r.index + 1)
  if (held) return { ...base, tone: 'ok', status: `Passes rule ${n(held.r)}`, mark: 'pass', add: false }
  const failed = reads.find((x) => x.c.status === 'fail')
  if (failed) return { ...base, tone: 'bad', status: `Fails rule ${n(failed.r)}`, mark: 'fail', add: false }
  const unknown = reads.find((x) => x.c.status === 'unknown')
  if (unknown || (f.unset && landed)) return { ...base, tone: 'warn', status: f.unset ? 'Not stated' : `Can't tell · rule ${unknown ? n(unknown.r) : ''}`, mark: 'unknown', add: f.unset && landed }
  const passed = reads[reads.length - 1]
  if (passed) return { ...base, tone: 'ok', status: `Passes rule ${n(passed.r)}`, mark: 'pass', add: false }
  return { ...base, tone: 'idle', status: landed ? 'Not checked' : '', mark: 'none', add: false }
}

function waitsOf(plan: EngineRun, s: number, stage: JvModel['stage'], first: string, ruleNow: number | null, reading: { rule: number; check: number } | null): { head: string; line: string } {
  if (stage === 'landed') return { head: '', line: '' }
  const missed = plan.rules.filter((r) => r.visited && r.index !== null && r.state === 'no-match' && r.endAt >= 0 && s >= r.endAt).map((r) => (r.index ?? 0) + 1)
  const said = missed.length === 0 ? '' : missed.length === 1 ? `Rule ${missed[0]} didn't apply. ` : `Rules ${missed.slice(0, -1).join(', ')} and ${missed[missed.length - 1]} didn't apply. `
  const r = ruleNow !== null ? plan.rules[ruleNow] : undefined
  const rn = r ? (r.index === null ? 'the last rule' : `rule ${r.index + 1}`) : ''
  switch (stage) {
    case 'boot':
    case 'find':
      return { head: 'waits for the policies', line: `Finding the policies on ${plan.appName}.` }
    case 'scan': {
      const d = plan.policies.find((p) => p.decides)
      const found = d && d.foundAt !== null && s >= d.foundAt
      return { head: 'waits for a policy', line: found && d ? `${d.name} covers ${first}. Its rules are next.` : `Asking each policy on ${plan.appName}, in order, if it covers ${first}.` }
    }
    case 'deciding':
      return { head: 'locking', line: `${said}Deciding.` }
    default: {
      const c = reading ? plan.rules[reading.rule]?.checks[reading.check] : undefined
      return { head: r ? `waits for ${rn}` : 'waits for the rules', line: `${said}${c ? `Checking ${rn}'s ${c.word} check` : r ? `Checking ${rn}` : 'Checking the rules'} — the verdict locks when it lands.` }
    }
  }
}

/** The decision, said whole (the DECISION wedge): its flag, its word split for size, its factors. */
export function decisionWords(d: AccessDecision | null, status: EngineRun['outcome']['status'], needs: readonly string[]): { flag: string; big: string; rest: string } {
  if (d) {
    const w = DECISION_WORDS[d]
    const sp = w.indexOf(' ')
    return { flag: d === 'deny' ? 'Access denied' : 'Access granted', big: sp > 0 ? w.slice(0, sp) : w, rest: sp > 0 ? w.slice(sp + 1) : '' }
  }
  if (status === 'depends') return { flag: "Can't tell yet", big: 'Depends', rest: needs.length > 0 ? `on the ${needs.map((n) => n.toLowerCase()).join(' and ')}` : '' }
  return { flag: 'No decision', big: 'No policy', rest: 'decides' }
}
