import type { AccessDecision } from '../../../data'
import { DECISION_WORDS } from '../../../decision-words'
import type { Via } from '../conflicts'
import type { CheckRow, EngineRule, EngineRun } from '../engine-run'
import type { TokenValue } from '../../testing/sign-in-sentence'

/* -----------------------------------------------------------------------------
   The brief's model (BriefLayout.tsx), pure: the run said as ONE sentence,
   answer first, whose key phrases cite the evidence cards under it — and,
   for every part of it, the step it is written at, so the sentence is built
   as the engine reaches each thing. Every word comes from the plan.

     Maya Iyer [1] gets into AWS Console on one factor [5]: AWS for
     engineering teams [2] applies through Engineering [1], and rule 2 [3]
     matches because the Windows 11 laptop meets Compliant devices [4].

   The cards, in the engine's order, are numbered as they are present:
   who (the person and the group that let them in), policy (the stack, the
   one that applies lit), rule (the rules in order), check (the one that
   decided it), outcome (the factors, what they see).
   -------------------------------------------------------------------------- */

export type CiteId = 'who' | 'policy' | 'rule' | 'check' | 'outcome'
export const CITE_ORDER: readonly CiteId[] = ['who', 'policy', 'rule', 'check', 'outcome']
export const CITE_LABEL: Record<CiteId, string> = { who: 'Who', policy: 'Policy', rule: 'Rule', check: 'Check', outcome: 'Outcome' }

export type Tone = 'positive' | 'negative' | 'notice' | 'neutral'

/* What the admin picked in the Configure panel, named in the sentence: each
   kind its own colour (brief.css) — who blue, the application orange, the
   conditions violet. The engine's things (the policy, the rule) and the
   answer keep their own ink. */
export type Entity = 'person' | 'group' | 'app' | 'condition'

/** The mark drawn before a named thing, sized to the text. */
export type Glyph =
  | { kind: 'face'; name: string }
  | { kind: 'logo'; appId: string; name: string }
  | { kind: 'fact'; value: TokenValue }
  | { kind: 'group' }
  | { kind: 'place' }
  | { kind: 'policy' }
  | { kind: 'rule' }
  | { kind: 'outcome'; decision: AccessDecision | 'depends' }

/** A run of a part's words: plain, or a picked thing in its colour, with its mark before it. */
export interface Seg {
  text: string
  entity?: Entity
  glyph?: Glyph
}

/** One piece of the sentence: glue text, or a phrase that cites a card. `at` is the step it is written at. */
export interface Part {
  key: string
  text: string
  /** The text, cut where it names a picked thing; its pieces join back to `text`. Absent: the text is one plain run. */
  segs?: Seg[]
  cite?: CiteId
  at: number
  /** The answer's own words: drawn in the outcome's tone once landed. */
  answer?: boolean
  /** A conflict's words: amber. */
  notice?: boolean
}

export interface Decisive {
  rule: number
  check: number
}

export interface BriefModel {
  parts: Part[]
  /** The conflict, said after the answer: its own sentence. Empty without one. */
  after: Part[]
  cites: CiteId[]
  num: Partial<Record<CiteId, number>>
  decisive: Decisive | null
  tone: Tone
  /** The steps each card's content arrives at. */
  cardAt: Record<CiteId, number>
}

export interface BriefInput {
  /** "Maya Iyer", or "A member of Finance". */
  person: string
  /** "Maya", or "them". */
  first: string
  app: string
  /** How the deciding policy covers the person (its audience). */
  via: Via | null
  /** The second factor's name, for "with 2FA (miniOrange Push)". */
  second: string
  /** The person's own name ('' when signed in as a group's member), for their face and their colour. */
  name?: string
  /** The person's groups (or the group chosen), by name: blue wherever named. */
  groups?: readonly string[]
  /** The application's id, for its logo. */
  appId?: string | null
  /** The sign-in's stated facts, as the row on top says them: their marks. */
  facts?: readonly TokenValue[]
}

/* Cut `text` where it names one of `picks` — each at its first place, the
   longest first where two start together — into runs that join back to it. */
export function splitBy(text: string, picks: readonly Seg[]): Seg[] {
  const hits: { at: number; seg: Seg }[] = []
  for (const p of picks) {
    if (!p.text) continue
    const at = text.indexOf(p.text)
    if (at < 0) continue
    if (hits.some((h) => at < h.at + h.seg.text.length && h.at < at + p.text.length)) continue
    hits.push({ at, seg: p })
  }
  hits.sort((a, b) => a.at - b.at)
  const out: Seg[] = []
  let i = 0
  for (const h of hits) {
    if (h.at > i) out.push({ text: text.slice(i, h.at) })
    out.push({ ...h.seg })
    i = h.at + h.seg.text.length
  }
  if (i < text.length) out.push({ text: text.slice(i) })
  return out
}

/* The picked things a check's words name: the person and their groups for a
   who; the device, the network, the time, the place, the risk score — the
   fact the sign-in stated — for the rest. Never what the rule asks for. */
const FACT_OF: Partial<Record<CheckRow['category'], TokenValue['token']>> = { network: 'from', device: 'device', time: 'when', risk: 'risk' }

export function checkPicks(c: CheckRow, inp: Pick<BriefInput, 'name' | 'groups' | 'facts'>): Seg[] {
  if (c.category === 'who') return [...whoPicks(inp, true)]
  if (c.missing || c.value === 'Not stated' || c.category === 'app' || c.category === 'other') return []
  const tok = FACT_OF[c.category]
  const fact = tok ? inp.facts?.find((f) => f.token === tok && !f.unset) : undefined
  const glyph: Glyph | undefined = fact ? { kind: 'fact', value: fact } : c.category === 'place' ? { kind: 'place' } : undefined
  if (c.category === 'device') {
    const v = c.value.split(' · ')[0]
    return [{ text: `the ${v}`, entity: 'condition', glyph }, { text: v, entity: 'condition', glyph }]
  }
  if (c.category === 'risk') return [{ text: `Risk score ${c.value}`, entity: 'condition', glyph }, { text: c.value, entity: 'condition', glyph }]
  return [{ text: c.value, entity: 'condition', glyph }]
}

/** The person (their face) and their groups, as picks; `marks` false for words tinted alone. */
function whoPicks(inp: Pick<BriefInput, 'name' | 'groups'>, marks: boolean): Seg[] {
  const out: Seg[] = []
  if (inp.name) out.push({ text: inp.name, entity: 'person', glyph: marks ? { kind: 'face', name: inp.name } : undefined })
  for (const g of inp.groups ?? []) out.push({ text: g, entity: 'group', glyph: marks ? { kind: 'group' } : undefined })
  return out
}

export function toneOf(plan: Pick<EngineRun, 'outcome'>): Tone {
  const o = plan.outcome
  if (o.status === 'decided' && o.decision) return o.decision === 'deny' ? 'negative' : 'positive'
  return o.status === 'depends' ? 'notice' : 'neutral'
}

/* The check that decided it: in a rule that matched, the last condition
   past its who (the who alone, when that is all it asks); in a rule that
   could not be told, its first unknown; with nothing matching, the check the
   last rule read failed on. */
export function decisiveOf(plan: Pick<EngineRun, 'rules' | 'landing'>): Decisive | null {
  if (plan.landing === null) return null
  const land = plan.rules[plan.landing]
  if (!land) return null
  const unknownRule = plan.rules.findIndex((r) => r.index !== null && r.state === 'unknown')
  if (unknownRule >= 0) {
    const r = plan.rules[unknownRule]
    const k = r.checks.findIndex((c) => c.status === 'unknown')
    return { rule: unknownRule, check: Math.max(0, k) }
  }
  if (land.index !== null && land.checks.length > 0) {
    let k = -1
    land.checks.forEach((c, i) => {
      if (c.category !== 'who' && c.status !== 'fail') k = i
    })
    return { rule: plan.landing, check: k >= 0 ? k : 0 }
  }
  for (let i = plan.landing - 1; i >= 0; i--) {
    const r = plan.rules[i]
    if (r.visited && r.failing !== null && r.checks[r.failing]) return { rule: i, check: r.failing }
  }
  return null
}

/** The check, said as the sign-in's finding: "the Windows 11 laptop meets Compliant devices". */
export function checkWords(c: CheckRow, mid = true): string {
  if (c.missing) return `${mid ? 'the ' : ''}${c.word.toLowerCase()} is not stated`
  const line = c.line || c.say || `${c.word} · ${c.value}`
  return c.category === 'device' && mid ? `the ${line}` : line
}

/** "through Engineering", "by name", "for everyone"; '' when it does not say. */
export function viaWords(via: Via | null | undefined): string {
  if (!via || !via.matches) return ''
  if (via.kind === 'groups' && via.label) return `through ${via.label}`
  if (via.kind === 'person') return 'by name'
  if (via.kind === 'everyone') return 'to everyone'
  return ''
}

/** A no-break space: "rule 2" never splits over two lines. */
export const NB = String.fromCharCode(160)

const ruleNo = (r: EngineRule): string => (r.index === null ? 'Nothing else matched' : `rule${NB}${r.index + 1}`)

function listNos(rs: readonly EngineRule[]): string {
  const n = rs.map((r) => (r.index ?? 0) + 1)
  if (n.length === 1) return `rule${NB}${n[0]}`
  return `rules${NB}${n.slice(0, -1).join(', ')} and${NB}${n.at(-1)}`
}

const orList = (ds: readonly AccessDecision[]): string => {
  const w = [...new Set(ds)].map((d) => DECISION_WORDS[d])
  return w.length <= 1 ? (w[0] ?? '') : `${w.slice(0, -1).join(', ')} or ${w.at(-1)}`
}

/** The whole brief, from the plan. Never throws: a plan it was not shaped for gets the plainest sentence. */
export function briefOf(plan: EngineRun, inp: BriefInput): BriefModel {
  const last = Math.max(0, plan.steps.length - 1)
  const at = plan.at
  const atOut = at.outcome >= 0 ? at.outcome : last
  const deciderIx = plan.policies.findIndex((p) => p.decides)
  const decider = deciderIx >= 0 ? plan.policies[deciderIx] : undefined
  const atPol = decider ? Math.min(atOut, decider.settleAt) : atOut
  const land = plan.landing !== null ? plan.rules[plan.landing] : undefined
  const decisive = decisiveOf(plan)
  const dRule = decisive ? plan.rules[decisive.rule] : undefined
  const dCheck = decisive && dRule ? dRule.checks[decisive.check] : undefined
  const atRule = land ? Math.min(atOut, land.index === null ? Math.max(land.startAt, atPol) : land.endAt >= 0 ? land.endAt : atOut) : atOut
  const atCheck = dRule && decisive ? Math.min(atOut, dRule.markAt[decisive.check] ?? atRule) : atRule
  const tone = toneOf(plan)
  const o = plan.outcome
  const parts: Part[] = []
  let k = 0
  const t = (text: string, when: number, extra: Partial<Part> = {}) => parts.push({ key: `p${k++}`, text, at: when, ...extra })

  /* The picked things, in their colours and marks. */
  const whoSegs = (text: string): Seg[] =>
    inp.name ? splitBy(text, [{ text: inp.name, entity: 'person', glyph: { kind: 'face', name: inp.name } }]) : splitBy(text, whoPicks({ groups: inp.groups }, true))
  const appSegs = (): Seg[] => [{ text: inp.app, entity: 'app', glyph: inp.appId ? { kind: 'logo', appId: inp.appId, name: inp.app } : undefined }]
  const marked = (text: string, glyph: Glyph): Seg[] => [{ text, glyph }]

  const cites: CiteId[] = ['who']
  if (plan.policies.length > 0) cites.push('policy')
  if (plan.decider && plan.rules.length > 0) cites.push('rule')
  if (dCheck) cites.push('check')
  cites.push('outcome')
  const num: Partial<Record<CiteId, number>> = {}
  cites.forEach((c, i) => (num[c] = i + 1))
  const cardAt: Record<CiteId, number> = {
    who: 0,
    policy: Math.max(0, at.which),
    rule: decider?.expandAt ?? atOut,
    check: dRule && decisive ? Math.min(atOut, dRule.checkAt[decisive.check] ?? atCheck) : atOut,
    outcome: atOut,
  }

  /* The answer first. */
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  if (decided === 'deny') {
    t(inp.person, 0, { cite: 'who', segs: whoSegs(inp.person) })
    t(' ', atOut)
    t('is denied', atOut, { cite: 'outcome', answer: true, segs: marked('is denied', { kind: 'outcome', decision: 'deny' }) })
    t(' ', 0)
    t(inp.app, 0, { segs: appSegs() })
  } else if (decided) {
    const said = decided === '1fa' ? 'on one factor' : inp.second ? `with 2FA (${inp.second})` : 'with 2FA'
    t(inp.person, 0, { cite: 'who', segs: whoSegs(inp.person) })
    t(' gets into ', atOut)
    t(inp.app, 0, { segs: appSegs() })
    t(' ', atOut)
    t(said, atOut, { cite: 'outcome', answer: true, segs: marked(said, { kind: 'outcome', decision: decided }) })
  } else if (o.status === 'depends') {
    const needs = o.view.needs.map((n) => n.toLowerCase())
    const said = needs.length > 0 ? `depends on the ${needs.join(' and the ')}` : 'depends on a fact not stated'
    t(inp.person, 0, { cite: 'who', segs: whoSegs(inp.person) })
    t(' on ', 0)
    t(inp.app, 0, { segs: appSegs() })
    t(' ', atOut)
    t(said, atOut, { cite: 'outcome', answer: true, segs: marked(said, { kind: 'outcome', decision: 'depends' }) })
  } else {
    t(inp.person, 0, { cite: 'who', segs: whoSegs(inp.person) })
    t(' on ', 0)
    t(inp.app, 0, { segs: appSegs() })
    t(': ', atOut)
    t(o.view.line || 'no policy decides', atOut, { cite: 'outcome', answer: true })
    t('.', atOut)
    return { parts, after: [], cites, num, decisive, tone, cardAt }
  }

  /* Then the policy, and how it covers them. */
  if (decider) {
    if (decider.isGlobalDefault && plan.policies.length > 1) {
      t(': no policy on ', atPol)
      t(inp.app, atPol, { segs: appSegs() })
      t(' ', atPol)
      t(`covers ${inp.first}`, atPol, { cite: 'who', segs: inp.name ? splitBy(`covers ${inp.first}`, [{ text: inp.first, entity: 'person', glyph: { kind: 'face', name: inp.name } }]) : undefined })
      t(', so the ', atPol)
      t(decider.name, atPol, { cite: 'policy', segs: marked(decider.name, { kind: 'policy' }) })
      t(' applies', atPol)
    } else {
      t(': ', atPol)
      t(decider.name, atPol, { cite: 'policy', segs: marked(decider.name, { kind: 'policy' }) })
      t(' applies', atPol)
      const v = decider.isGlobalDefault ? '' : viaWords(inp.via)
      if (v) {
        const named = inp.via?.groups.map((g): Seg => ({ text: g.name, entity: 'group', glyph: { kind: 'group' } })) ?? []
        t(' ', atPol)
        t(v, atPol, { cite: 'who', segs: splitBy(v, named) })
      }
    }
  }

  /* Then the rule, and the check that decided it. */
  const real = plan.rules.filter((r) => r.index !== null)
  if (land && o.status === 'depends') {
    const unk = real.filter((r) => r.state === 'unknown')
    t(', and ', atRule)
    const nos = unk.length > 0 ? listNos(unk) : 'its rules'
    t(nos, atRule, { cite: 'rule', segs: unk.length > 0 ? marked(nos, { kind: 'rule' }) : undefined })
    t(unk.length === 1 ? ' can’t tell without it' : ' can’t tell without it', atRule)
    if (o.possible.length > 0) {
      t(' — it could be ', atOut)
      t(orList(o.possible), atOut, { cite: 'outcome' })
    }
  } else if (land && land.index !== null) {
    t(', and ', atRule)
    t(ruleNo(land), atRule, { cite: 'rule', segs: marked(ruleNo(land), { kind: 'rule' }) })
    t(' matches', atRule)
    if (dCheck) {
      const w = checkWords(dCheck)
      t(' because ', atCheck)
      t(w, atCheck, { cite: 'check', segs: splitBy(w, checkPicks(dCheck, inp)) })
    }
  } else if (land) {
    t(real.length > 0 ? ', but ' : ', and ', atRule)
    t(real.length === 0 ? 'it has no rules' : real.length === 1 ? 'its one rule doesn’t match' : `none of its ${real.length} rules match`, atRule, { cite: 'rule' })
    t(', so Nothing else matched decides', atRule)
    if (dCheck && dRule) {
      t(' — ', atCheck)
      const w = `${ruleNo(dRule)}: ${checkWords(dCheck, false)}`
      t(w, atCheck, { cite: 'check', segs: splitBy(w, checkPicks(dCheck, inp)) })
    }
  }
  t('.', atOut)

  /* A conflict, plainly: its own sentence, after. */
  const after: Part[] = []
  const f = plan.conflicts?.findings.find((x) => x.tone === 'conflict')
  if (f && f.line) {
    const cite: CiteId = f.target.ruleId ? 'rule' : 'policy'
    after.push({ key: 'a0', text: f.line, segs: splitBy(f.line, whoPicks({ groups: inp.groups }, false)), at: atOut, cite: cites.includes(cite) ? cite : undefined, notice: true })
    after.push({ key: 'a1', text: '.', at: atOut })
  }
  return { parts, after, cites, num, decisive, tone, cardAt }
}

/** What the engine is working on at step `s`, as a card: blue there, and only there. */
export function workingCite(plan: EngineRun, s: number, decisive: Decisive | null): CiteId | null {
  const step = plan.steps[s]
  if (!step || s >= plan.steps.length - 1) return null
  switch (step.kind) {
    case 'find':
    case 'scan':
    case 'found':
    case 'decides':
      return 'policy'
    case 'expand':
    case 'rule':
    case 'rule-end':
    case 'compact':
      return 'rule'
    case 'check':
    case 'checked':
      return decisive && step.rule === decisive.rule && step.check === decisive.check ? 'check' : 'rule'
    case 'deciding':
      return 'outcome'
    default:
      return null
  }
}
