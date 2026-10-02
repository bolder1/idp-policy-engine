import { DECISION_WORDS } from '../../../decision-words'
import type { EngineRule, EngineRun } from '../engine-run'
import type { CiteId } from './brief-model'

/* -----------------------------------------------------------------------------
   "Why not …?" (BriefLayout.tsx): under the evidence, one line for every
   rule the engine read and passed over, every later rule that also applies,
   and every policy that also covers the person — each the plan's own words,
   each pointing at the card (and the row in it) it is about. A conflict is
   amber; a fact not stated amber; the rest quiet.
   -------------------------------------------------------------------------- */

export interface WhyNot {
  key: string
  /** "Why not rule 1?" */
  ask: string
  /** "Who · Maya Iyer is not in Contractors". */
  answer: string
  /** What the admin can do, when the plan says. */
  fix: string
  tone: 'notice' | 'quiet'
  cite: CiteId
  /** The row in the card: `policy:<id>` or `rule:<id>`. */
  node: string
}

const said = (r: EngineRule): string => {
  if (r.miss) return r.miss
  const c = r.failing !== null ? r.checks[r.failing] : undefined
  return c ? c.say || c.line : 'No match'
}

export function whyNotsOf(plan: EngineRun, first: string): WhyNot[] {
  const out: WhyNot[] = []
  const c = plan.conflicts
  const conflictPolicy = new Set((c?.findings ?? []).filter((f) => f.tone === 'conflict' && f.target.ruleId === null).map((f) => f.target.policyId))
  const conflictRule = new Set((c?.findings ?? []).filter((f) => f.tone === 'conflict' && f.target.ruleId !== null).map((f) => f.target.ruleId))

  /* The policies before the one that applies, which do not cover them: one line for all. */
  const di = plan.policies.findIndex((p) => p.decides)
  const before = di > 0 ? plan.policies.slice(0, di).filter((p) => p.scanned) : []
  if (before.length > 0) {
    const one = before.length === 1
    const off = before.filter((p) => p.status !== 'active' && /off|turned on/i.test(p.reason))
    out.push({
      key: 'pol-before',
      ask: one ? `Why not ${before[0].name}?` : `Why not policies ${before[0].order}–${before.at(-1)!.order}?`,
      answer: one ? before[0].reason || `It doesn’t cover ${first}` : off.length === before.length ? 'They are switched off' : `None of them covers ${first}`,
      fix: '',
      tone: 'quiet',
      cite: 'policy',
      node: before[0].node,
    })
  }

  /* The rules read and passed over. */
  const land = plan.landing ?? -1
  plan.rules.forEach((r, i) => {
    if (r.index === null || !r.visited || i === land) return
    if (r.state !== 'no-match' && r.state !== 'unknown' && r.state !== 'off') return
    const ex = c?.exceptions.find((e) => e.ruleId === r.id)
    const unk = r.state === 'unknown'
    const cu = unk ? r.checks.find((x) => x.status === 'unknown') : undefined
    out.push({
      key: r.node,
      ask: `Why not rule ${r.index + 1}?`,
      answer: r.state === 'off' ? 'Switched off' : ex ? ex.why : unk ? `Can’t tell: ${cu ? `${cu.word.toLowerCase()} not stated` : 'a fact is not stated'}` : said(r),
      fix: ex?.fix ?? '',
      tone: unk || (ex && ex.wouldHaveDecided) ? 'notice' : 'quiet',
      cite: 'rule',
      node: r.node,
    })
  })

  /* Later rules that also apply. */
  for (const rc of c?.rules ?? []) {
    const then = DECISION_WORDS[rc.ask.decision]
    out.push({
      key: `also:${rc.ruleId}`,
      ask: `Why not rule ${rc.number}?`,
      answer: `${rc.match === 'unknown' ? 'It might apply' : 'It also applies'} ${rc.via.say || ''}`.trim() + ` — ${rc.notUsed.replace(/^Not used — /, '')}. It would give ${then}`,
      fix: rc.fix ? `${rc.fix}${rc.caution ? `. ${rc.caution}` : ''}` : '',
      tone: conflictRule.has(rc.ruleId) || rc.kind === 'conflict' ? 'notice' : 'quiet',
      cite: 'rule',
      node: `rule:${rc.ruleId}`,
    })
  }

  /* Later policies that also cover them. */
  for (const pc of c?.policies ?? []) {
    const would =
      pc.status === 'decided' && pc.decision
        ? `On its own: ${DECISION_WORDS[pc.decision]}${pc.ruleNumber !== null ? ` (rule ${pc.ruleNumber})` : ''}`
        : pc.possible.length > 0
          ? `On its own: can’t tell`
          : ''
    out.push({
      key: `cover:${pc.policyId}`,
      ask: `Why not ${pc.policyName}?`,
      answer: [`It also covers ${first} ${pc.via.say}`.trim() + ` — ${pc.notUsed.replace(/^Not used — /, '')}`, would].filter(Boolean).join('. '),
      fix: pc.fix ? `${pc.fix}${pc.caution ? `. ${pc.caution}` : ''}` : '',
      tone: conflictPolicy.has(pc.policyId) ? 'notice' : 'quiet',
      cite: 'policy',
      node: `policy:${pc.policyId}`,
    })
  }

  /* Switched off or drafts that cover them. */
  for (const op of c?.off ?? []) {
    out.push({ key: `off:${op.policyId}`, ask: `Why not ${op.policyName}?`, answer: op.say, fix: '', tone: 'quiet', cite: 'policy', node: `policy:${op.policyId}` })
  }
  return out
}
