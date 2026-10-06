import type { FormField } from '../../testing/sign-in-form'
import type { CheckRow, EngineRun } from '../engine-run'
import type { Answer, Target } from './assistant/intents'

/* -----------------------------------------------------------------------------
   What the Jarvis HUD lights for an answer (JarvisLayout.tsx). PURE: the
   shared assistant (assistant/intents.ts) answers in TARGETS — 'person',
   'policy:<id>', 'rule:<id>', 'check:<ruleId>:<category>', 'outcome',
   'screens' — and this maps them onto the HUD's pieces (their `data-jv` ids:
   a policy's segment and label, a rule row, a check row, the verdict) and
   onto the sign-in row over the stage (SignInRow: a fact's ring).

     litOf(answer, cite, plan, hasPlace) → HudLit

   `answer` is the one on show (or null), `cite` a citation hovered in the
   chat (lights just that). Beside the targets, an answer's KIND adds what
   the HUD does for it (SPEC D, the commands table):
     why / verdict / policy    the route pulses and the decider's reticle
                               closes again on it; the deciding rule row lit
     why-rule                  that rule row lit and OPENED (a folded miss
                               shows its ✕ check)
     depends                   the unknown fact in the row and its ? check
                               amber
     group                     the policy the person is covered through
     see                       What they see opens
     checks                    every check of the deciding rule shows
   -------------------------------------------------------------------------- */

export interface HudLit {
  /** The HUD's pieces lit, by their data-jv id: a policy's node, a rule's node, 'outcome'. */
  ids: ReadonlySet<string>
  /** Check rows lit: `${ruleId}:${category}`. */
  checks: ReadonlySet<string>
  /** Rule rows opened (by node): a folded miss shows its checks again. */
  open: ReadonlySet<string>
  /** A fact in the sign-in row with a blue ring (a citation): 'person' lights Who → App. */
  rowLit: 'person' | FormField | null
  /** Facts in the sign-in row lit amber: what a Depends waits on. */
  warn: readonly FormField[]
  /** What they see opens. */
  see: boolean
  /** Every check shows. */
  all: boolean
  /** The route (lock → rules → verdict) pulses again. */
  wire: boolean
  /** A policy node whose reticle closes on it again. */
  relock: string | null
}

export const NOTHING_LIT: HudLit = { ids: new Set(), checks: new Set(), open: new Set(), rowLit: null, warn: [], see: false, all: false, wire: false, relock: null }

/** The sign-in row's fact a check category reads: network → the address, place → the place (when the row states it apart), who → the person. */
export function fieldOfCategory(cat: CheckRow['category'] | string, hasPlace = false): 'person' | FormField | null {
  switch (cat) {
    case 'who':
      return 'person'
    case 'network':
      return 'address'
    case 'place':
      return hasPlace ? 'place' : 'address'
    case 'device':
      return 'device'
    case 'time':
      return 'when'
    case 'risk':
      return 'risk'
    default:
      return null
  }
}

/** Every target an answer names: its focus, then each citation of its sentence and further lines. */
export function targetsOf(a: Pick<Answer, 'focus' | 'sentence' | 'more'>): Target[] {
  const out: Target[] = []
  const add = (t: Target | undefined) => {
    if (t && !out.includes(t)) out.push(t)
  }
  add(a.focus)
  for (const p of a.sentence) add(p.cite)
  for (const line of a.more ?? []) for (const p of line) add(p.cite)
  return out
}

/* Answers about ONE thing light that thing, not everything they name on the way: "why not rule 1?" lights
   rule 1 and its checks (not rule 2, "so the engine reads on to rule 2"); "who else covers her?" the other
   policy (not the decider it is compared with). */
const FOCUSED: readonly Answer['kind'][] = ['why-rule', 'others', 'off', 'gd']

export function focusedTargets(a: Pick<Answer, 'kind' | 'focus' | 'sentence' | 'more'>): Target[] {
  const all = targetsOf(a)
  if (!FOCUSED.includes(a.kind) || !a.focus) return all
  const focus = a.focus
  const ruleId = focus.startsWith('rule:') ? focus.slice('rule:'.length) : focus.startsWith('check:') ? focus.slice('check:'.length, focus.lastIndexOf(':')) : null
  const notice = new Set<Target>()
  for (const p of [...a.sentence, ...(a.more ?? []).flat()]) if (p.cite && p.tone === 'notice' && p.cite.startsWith('policy:')) notice.add(p.cite)
  return all.filter((t) => t === focus || (ruleId !== null && (t === `rule:${ruleId}` || t.startsWith(`check:${ruleId}:`))) || notice.has(t))
}

interface Acc {
  ids: Set<string>
  checks: Set<string>
  open: Set<string>
  rowLit: 'person' | FormField | null
  warn: FormField[]
  see: boolean
}

function place(t: Target, plan: EngineRun, hasPlace: boolean, acc: Acc, opts: { open?: boolean; warn?: boolean }) {
  if (t === 'person') {
    acc.rowLit ??= 'person'
    return
  }
  if (t === 'outcome') {
    acc.ids.add('outcome')
    return
  }
  if (t === 'screens') {
    acc.see = true
    return
  }
  if (t.startsWith('policy:')) {
    const id = t.slice('policy:'.length)
    const p = plan.policies.find((x) => x.policyId === id)
    if (p) acc.ids.add(p.node)
    return
  }
  if (t.startsWith('rule:')) {
    const r = plan.rules.find((x) => x.id === t.slice('rule:'.length))
    if (!r) return
    acc.ids.add(r.node)
    if (opts.open) acc.open.add(r.node)
    return
  }
  if (t.startsWith('check:')) {
    const rest = t.slice('check:'.length)
    const cut = rest.lastIndexOf(':')
    const ruleId = rest.slice(0, cut)
    const cat = rest.slice(cut + 1)
    const r = plan.rules.find((x) => x.id === ruleId)
    if (!r) return
    acc.ids.add(r.node)
    acc.checks.add(`${ruleId}:${cat}`)
    acc.open.add(r.node)
    const c = r.checks.find((x) => x.category === cat)
    const f = c?.missing ?? fieldOfCategory(cat, hasPlace)
    if (opts.warn && f && f !== 'person' && (c?.status === 'unknown' || c?.missing)) {
      if (!acc.warn.includes(f)) acc.warn.push(f)
    } else if (f) acc.rowLit ??= f
  }
}

/** What the HUD lights for the answer on show and a citation hovered. */
export function litOf(answer: Answer | null, cite: Target | null, plan: EngineRun, hasPlace = false): HudLit {
  if (!answer && !cite) return NOTHING_LIT
  const acc: Acc = { ids: new Set(), checks: new Set(), open: new Set(), rowLit: null, warn: [], see: false }
  let wire = false
  let relock: string | null = null
  let all = false

  if (cite) {
    place(cite, plan, hasPlace, acc, { open: true })
  } else if (answer) {
    const kind = answer.kind
    const depends = kind === 'depends'
    for (const t of focusedTargets(answer)) place(t, plan, hasPlace, acc, { open: kind === 'why-rule' || kind === 'checks', warn: depends })

    const decider = plan.policies.find((p) => p.decides)
    const landing = plan.landing !== null ? plan.rules[plan.landing] : undefined
    if (kind === 'why' || kind === 'verdict' || kind === 'policy') {
      wire = decider !== undefined
      if (decider) {
        acc.ids.add(decider.node)
        relock = decider.node
      }
      if (landing) acc.ids.add(landing.node)
    }
    if (depends) {
      /* Every check the run could not tell, in the rules it reached. */
      for (const r of plan.rules) {
        if (!r.visited || r.state !== 'unknown') continue
        acc.ids.add(r.node)
        for (const c of r.checks) {
          if (c.status !== 'unknown') continue
          acc.checks.add(`${r.id}:${c.category}`)
          const f = c.missing ?? fieldOfCategory(c.category, hasPlace)
          if (f && f !== 'person' && !acc.warn.includes(f)) acc.warn.push(f)
        }
      }
      if (acc.rowLit && acc.warn.includes(acc.rowLit as FormField)) acc.rowLit = null
    }
    if (kind === 'group' && decider) acc.ids.add(decider.node)
    if (kind === 'see') acc.see = true
    if (kind === 'checks') all = true
  }

  return { ids: acc.ids, checks: acc.checks, open: acc.open, rowLit: acc.rowLit, warn: acc.warn, see: acc.see, all, wire, relock }
}
