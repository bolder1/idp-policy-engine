import { DECISION_WORDS } from '../../../decision-words'
import type { Via } from '../conflicts'
import type { CheckRow, EngineRule, EngineRun } from '../engine-run'
import type { GroupRowView } from '../journey'
import { stepLabel, type SignInScreens } from '../../testing/screens-of'
import type { TokenValue } from '../../testing/sign-in-sentence'
import type { FormField } from '../../testing/sign-in-form'
import type { Moment } from './explainer-model'

/* -----------------------------------------------------------------------------
   The Explainer's words (ExplainerLayout.tsx): one short paragraph per
   moment, every word from the plan. Its key nouns are segments the story
   emphasises — a policy or a rule a link that opens it in the visual, a
   finding underlined in what it came to (green held, red failed, amber
   can't tell), the answer in its colour. The person's fact and the rule's
   requirement are said apart: "Maya Iyer is in Engineering", never "Maya
   Iyer in Engineering, DevOps".
   -------------------------------------------------------------------------- */

export type SegKind = 'key' | 'link' | 'pass' | 'fail' | 'unknown' | 'notice' | 'answer'

export interface Seg {
  t: string
  kind?: SegKind
  /** A link: the moment it opens. */
  to?: string
  /** The step it is written at, as the engine reaches it; absent, with its paragraph. */
  at?: number
}

export interface Para {
  key: string
  segs: Seg[]
  /** A finding worth knowing, said under it: amber only for a conflict. */
  note?: { text: string; tone: 'conflict' | 'info' }
  /** A fact not stated that the answer waits on: Add opens that field. */
  add?: { field: FormField; label: string }
  /** "Run as Finance only": the person's groups alone. */
  runAs?: { groupId: string; label: string }[]
}

export interface WordsInput {
  person: string
  first: string
  app: string
  /** How the deciding policy covers the person. */
  via: Via | null
  facts: TokenValue[]
  screens: SignInScreens[]
  groups: GroupRowView[] | null
  hero: { text: string; tone: string } | null
}

const k = (t: string): Seg => ({ t, kind: 'key' })
const g = (t: string): Seg => ({ t })
const an = (t: string) => (/^[aeiou]/i.test(t) ? 'an' : 'a')

/** A check, said as what the sign-in showed against what the rule asks. */
export function findingOf(c: CheckRow): string {
  if (c.status === 'unknown') return c.missing || /not stated/i.test(c.value) ? `the ${c.word.toLowerCase()} is not stated` : c.line || c.say
  const line = c.line || c.say || `${c.word} · ${c.value}`
  if (c.status === 'fail' && /^Not in /.test(c.requirement)) return `${line}, which this rule excludes`
  if (c.category === 'device') return `the ${line}`
  if (c.category === 'risk') return line.charAt(0).toLowerCase() + line.slice(1)
  return line
}

const segKind = (c: CheckRow): SegKind => (c.status === 'pass' ? 'pass' : c.status === 'fail' ? 'fail' : 'unknown')

function signPara(inp: WordsInput): Seg[] {
  const segs: Seg[] = [k(inp.person), g(' signs in to '), k(inp.app)]
  const bits: Seg[][] = []
  for (const f of inp.facts) {
    if (f.token === 'person' || f.token === 'app') continue
    if (f.unset) bits.push([g(`${f.label.toLowerCase()} `), k('not stated')])
    else if (f.token === 'from') bits.push([g(/^\d/.test(f.text) ? 'from ' : 'from the '), k(f.text)])
    else if (f.token === 'device') bits.push([g(`on ${an(f.text)} `), k(f.text)])
    else if (f.token === 'risk') bits.push([g('device risk score '), k(f.text)])
    else bits.push([g(`${f.label.toLowerCase()} `), k(f.text)])
  }
  bits.forEach((b, i) => segs.push(g(i === 0 ? ' — ' : ', '), ...b))
  segs.push(g('.'))
  return segs
}

function policiesPara(plan: EngineRun, inp: WordsInput): Seg[] {
  const own = plan.policies.filter((p) => !p.isGlobalDefault)
  const gd = plan.policies.find((p) => p.isGlobalDefault)
  if (own.length === 0) return [k(inp.app), g(' has no policy of its own, so the '), k(gd?.name ?? 'Global Default Policy'), g(' decides.')]
  const n = own.length
  return [
    k(inp.app),
    g(' has '),
    k(`${n} ${n === 1 ? 'policy' : 'policies'}`),
    g(gd ? `, with the Global Default behind ${n === 1 ? 'it' : 'them'}. ` : '. '),
    g(`They are read in order, and the first that covers ${inp.first} applies.`),
  ]
}

function passedOver(name: string, reason: string, first: string): Seg[] {
  if (/ is not in (it|this policy)$/i.test(reason)) return [k(name), g(` doesn’t cover ${first}`)]
  if (/switched off/i.test(reason)) return [k(name), g(' is switched off')]
  if (/not turned on/i.test(reason)) return [k(name), g(' is not turned on yet')]
  return [k(name), g(reason ? ` — ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : ' is passed over')]
}

function viaSeg(via: Via | null): Seg[] {
  if (!via || !via.matches) return []
  if (via.kind === 'groups' && via.label) return [g(' through '), k(via.label)]
  if (via.kind === 'person') return [g(' by name')]
  if (via.kind === 'everyone') return [g(' — it is for everyone')]
  return []
}

function appliesPara(plan: EngineRun, inp: WordsInput): Seg[] {
  const di = plan.policies.findIndex((p) => p.decides)
  const d = plan.policies[di]
  if (!d) return [g('No policy decides.')]
  const before = plan.policies.slice(0, di).filter((p) => p.scanned)
  const segs: Seg[] = []
  if (d.isGlobalDefault) {
    if (before.length === 0) return [{ t: d.name, kind: 'link', to: 'applies' }, g(' covers everyone, so it applies.')]
    if (before.length === 1) segs.push(...passedOver(before[0].name, before[0].reason, inp.first))
    else segs.push(g(`None of the ${before.length} covers ${inp.first}`))
    segs.push(g(', so the '), { t: d.name, kind: 'link', to: 'applies' }, g(' applies.'))
    return segs
  }
  if (before.length === 1) segs.push(...passedOver(before[0].name, before[0].reason, inp.first), g('. '))
  else if (before.length > 1) segs.push(g(`The first ${before.length} don’t cover ${inp.first}. `))
  segs.push({ t: d.name, kind: 'link', to: 'applies' }, g(` covers ${inp.first}`), ...viaSeg(inp.via), g(', so it applies.'))
  const conflictIds = new Set((plan.conflicts?.findings ?? []).filter((f) => f.tone === 'conflict').map((f) => f.target.policyId))
  for (const pc of (plan.conflicts?.policies ?? []).slice(0, 2)) {
    segs.push(g(' ('), { t: `${pc.policyName} also covers ${inp.first}${pc.via.say ? ` ${pc.via.say}` : ''}`, kind: conflictIds.has(pc.policyId) ? 'notice' : 'key' }, g(' — it is never used.)'))
  }
  return segs
}

function rulePara(plan: EngineRun, r: EngineRule, firstRule: boolean): Seg[] {
  const segs: Seg[] = []
  if (firstRule) segs.push(g('Its rules are read in order; the first that matches decides. '))
  if (r.index === null) {
    if (r.state === 'possible') return [...segs, g('If no rule above matches, the last rule, '), { t: 'Nothing else matched', kind: 'link', to: r.node }, g(`, decides: ${DECISION_WORDS[r.decision]}.`)]
    const n = plan.rules.filter((x) => x.index !== null).length
    return [...segs, g(n === 0 ? 'It has no rules, so the last rule, ' : 'No rule matched, so the last rule, '), { t: 'Nothing else matched', kind: 'link', to: r.node }, g(', decides.')]
  }
  const name = { t: `Rule ${r.index + 1}`, kind: 'link' as const, to: r.node }
  if (r.state === 'off') return [...segs, name, g(', '), k(r.name), g(', is switched off, so it is passed over.')]
  segs.push(name, g(', '), k(r.name), g(': '))
  const read = r.checks.slice(0, Math.max(0, r.checked))
  read.forEach((c, i) => {
    const at = r.markAt[i] ?? r.endAt
    if (i > 0) segs.push({ t: c.status === 'fail' || c.status === 'unknown' ? ', but ' : i === read.length - 1 ? ' and ' : ', ', at })
    const t = findingOf(c)
    segs.push({ t: i === 0 ? t.charAt(0).toUpperCase() + t.slice(1) : t, kind: segKind(c), at })
  })
  if (read.length === 0) segs.push(g('nothing to check'))
  const end = Math.max(r.endAt, r.markAt[read.length - 1] ?? r.endAt)
  segs.push({ t: r.state === 'match' ? '. It matches.' : r.state === 'unknown' || r.state === 'possible' ? '. It can’t tell, so the engine reads on.' : '. It doesn’t match.', at: end })
  return segs
}

function outcomePara(plan: EngineRun, inp: WordsInput): Para {
  const o = plan.outcome
  const para: Para = { key: 'outcome', segs: [] }
  const decided = o.status === 'decided' && o.decision ? o.decision : null
  const screen = decided ? (inp.screens.find((sc) => sc.decision === decided) ?? inp.screens[0]) : undefined
  const steps = screen?.steps ?? []
  if (decided === 'deny') {
    const deny = steps.find((st) => st.kind === 'deny')
    para.segs.push(g('So '), k(inp.first), g(' is '), { t: 'denied', kind: 'answer' })
    const msg = deny && deny.kind === 'deny' ? deny.message.trim() : ''
    if (msg) para.segs.push(g(', and sees “'), g(msg), g(/[.!?]$/.test(msg) ? '”' : '”.'))
    else para.segs.push(g('.'))
  } else if (decided) {
    const factors = steps.filter((st) => st.kind !== 'deny')
    const words = factors.map((st) => (st.kind === 'password' ? 'their password' : stepLabel(st)))
    const nobody = factors.some((st) => st.kind === 'second' && st.method === null)
    para.segs.push(g('So '), k(inp.first), g(' gets in '), { t: decided === '1fa' ? 'on one factor' : 'with 2FA', kind: 'answer' })
    if (words.length > 0) para.segs.push(g(' — asked for '), k(words.join(', then ')), g(nobody ? ', which nobody can be offered' : ''))
    para.segs.push(g('.'))
  } else if (o.status === 'depends') {
    const needs = o.view.needs.map((n) => n.toLowerCase())
    para.segs.push(g('So the answer '), { t: needs.length > 0 ? `depends on the ${needs.join(' and the ')}` : 'depends on a fact not stated', kind: 'answer' }, g('.'))
    for (const x of o.view.outcomes) para.segs.push(g(` ${x.label}: `), k(DECISION_WORDS[x.decision]), g('.'))
    const miss = plan.rules.flatMap((r) => r.checks).find((c) => c.status === 'unknown' && c.missing)
    if (miss?.missing) para.add = { field: miss.missing, label: `Add ${miss.word.toLowerCase()}` }
  } else {
    para.segs.push({ t: o.view.line || 'No policy decides', kind: 'answer' }, g('.'))
  }
  if (inp.hero?.text) para.note = { text: inp.hero.text, tone: inp.hero.tone === 'conflict' ? 'conflict' : 'info' }
  return para
}

function groupsPara(inp: WordsInput): Para {
  const all = inp.groups ?? []
  const me = all.find((r) => r.current)
  const rows = all.filter((r) => !r.current && (!me || r.words !== me.words))
  const segs: Seg[] = []
  if (rows.length === 0) segs.push(g(`Each of ${inp.first}’s groups alone gets the same answer.`))
  rows.forEach((r, i) => {
    segs.push(g(`${i > 0 ? ' ' : ''}${r.label} only, ${inp.first} would get `), { t: r.words, kind: 'key' }, g(r.source ? ` — ${r.source}.` : '.'))
  })
  const runAs = rows.filter((r) => r.groupId).map((r) => ({ groupId: r.groupId as string, label: `Run ${r.label.replace(/^As /, 'as ')} only` }))
  return { key: 'groups', segs, runAs }
}

/** The whole story, one paragraph per moment. Never throws: a plan it was not shaped for gets plain words. */
export function storyOf(plan: EngineRun, moments: readonly Moment[], inp: WordsInput): Para[] {
  const firstRule = moments.find((m) => m.kind === 'rule')?.key
  return moments.map((m): Para => {
    try {
      switch (m.kind) {
        case 'sign':
          return { key: m.key, segs: signPara(inp) }
        case 'policies':
          return { key: m.key, segs: policiesPara(plan, inp) }
        case 'applies':
          return { key: m.key, segs: appliesPara(plan, inp) }
        case 'rule': {
          const r = plan.rules[m.rule ?? -1]
          return { key: m.key, segs: r ? rulePara(plan, r, m.key === firstRule) : [g('A rule.')] }
        }
        case 'outcome':
          return plan.empty ? { key: m.key, segs: [g('Choose a person and an application, then run it.')] } : outcomePara(plan, inp)
        case 'groups':
          return groupsPara(inp)
      }
    } catch {
      return { key: m.key, segs: [g('—')] }
    }
  })
}

/** The headline over the story: the answer, once landed; the sign-in while it plays. */
export function headlineOf(plan: EngineRun, inp: Pick<WordsInput, 'person' | 'app' | 'screens'>, landed: boolean): Seg[] {
  const o = plan.outcome
  if (!landed || plan.empty) return [k(inp.person), g(' signs in to '), k(inp.app)]
  if (o.status === 'decided' && o.decision === 'deny') return [k(inp.person), g(' is '), { t: 'denied', kind: 'answer' }, g(' access to '), k(inp.app)]
  if (o.status === 'decided' && o.decision) return [k(inp.person), g(' gets into '), k(inp.app), g(' '), { t: o.decision === '1fa' ? 'on one factor' : 'with 2FA', kind: 'answer' }]
  if (o.status === 'depends') return [k(inp.person), g(' on '), k(inp.app), g(': it '), { t: 'depends', kind: 'answer' }]
  return [k(inp.person), g(' on '), k(inp.app), g(': '), { t: o.view.line || 'no policy decides', kind: 'answer' }]
}
