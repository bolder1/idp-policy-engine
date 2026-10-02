import type { EnginePolicy, EngineRule, EngineRun } from '../engine-run'

/* -----------------------------------------------------------------------------
   Pulse's model (PulseLayout.tsx): the run as ONE trace, left to right in the
   order the engine did things. Built by walking the plan's steps, so every
   piece of the line belongs to the step that draws it — the clock's `s` says
   how far the trace has been drawn, nothing else does.

     seg     a piece of the trace: flat, or a beat (a spike where a policy
             covers the person or a rule matches, a tick for a check that
             passed, a dip for one that failed, a blip for a can't-tell or an
             "also applies", a dashed run of nodes for what was never read)
     stop    what the playhead can rest on, and the card pinned to it
     span    for each step, the segs it draws: the tip travels across them
             in that step's time (use-engine-run.ts `stepMs`)

   Pure: no React, no DOM. Never throws for a plan of any shape.
   -------------------------------------------------------------------------- */

export type Shape = 'flat' | 'gap' | 'notch' | 'spike' | 'tick' | 'dip' | 'blip' | 'nodes' | 'complex'
/** What a beat means, which is its colour: green, red, amber, the trace's ink, grey for not read, the answer's tone. */
export type Tone = 'pass' | 'fail' | 'notice' | 'ink' | 'off' | 'path'
export type Section = 'lead' | 'pol' | 'rule' | 'out'

export interface Seg {
  key: string
  shape: Shape
  /** Its natural width (px, zoom 1). */
  w: number
  tone: Tone
  section: Section
  /** The stop it belongs to: hover says its finding, a press moves the playhead there. */
  stop: string | null
  /** The one line a hover says. */
  hint: string
  /** "Findings only" folds it: it found nothing. */
  foldable: boolean
  /** A run of what was never read: one node each. */
  nodes?: { node: string; label: string }[]
}

export type StopKind = 'policy' | 'rule' | 'unread' | 'outcome'

export interface Stop {
  id: string
  kind: StopKind
  /** Above the trace (what applies, what matched), below it (the rest), or the end. */
  side: 'above' | 'below' | 'end'
  /** The seg its card is pinned to. */
  seg: number
  /** Where along that seg the pin stands (0..1): the spike's tip. */
  at: number
  foldable: boolean
  policy?: number
  rule?: number
  /** For a run of things never read. */
  unread?: { node: string; label: string; reason: string }[]
  /** Its card is the amber "also applies". */
  also?: boolean
  /** The card's width. */
  cardW: number
}

export interface Track {
  segs: Seg[]
  stops: Stop[]
  /** Per step: the segs it draws, [from, to). */
  span: [number, number][]
}

const W = { lead: 24, gap: 30, notch: 40, spike: 60, tick: 36, dip: 40, blip: 36, node: 22, complex: 76, head: 14, wait: 12, fold: 12, tail: 20 }

export const CARD_W = { decider: 228, passed: 200, also: 228, rule: 240, unread: 0, outcome: 292 }

export const ruleNo = (r: Pick<EngineRule, 'index'>): string => (r.index === null ? '✱' : String(r.index + 1))

/** Which kind of rule card, from its settled state. */
export function ruleBeat(r: EngineRule): { shape: Shape; tone: Tone } {
  if (r.state === 'match') return { shape: 'spike', tone: 'path' }
  if (r.state === 'unknown' || r.state === 'possible') return { shape: 'blip', tone: 'notice' }
  return { shape: 'flat', tone: 'ink' }
}

export function buildTrack(plan: EngineRun, alsoPolicies: ReadonlySet<string>, alsoRules: ReadonlySet<string>, first: string): Track {
  const segs: Seg[] = []
  const stops: Stop[] = []
  const span: [number, number][] = []
  const polDone = new Set<number>()
  const ruleDone = new Set<number>()
  const push = (s: Omit<Seg, 'key'> & { key?: string }) => {
    segs.push({ key: s.key ?? `s${segs.length}`, ...s })
    return segs.length - 1
  }
  const flat = (w: number, section: Section, foldable = false) => push({ shape: 'flat', w, tone: 'ink', section, stop: null, hint: '', foldable })
  const stop = (st: Stop) => {
    stops.push(st)
    return st.id
  }

  /* The policies never asked, as one dashed run — save one that also covers the person, which is a finding (amber). */
  const flushPolicies = () => {
    let run: { node: string; label: string; reason: string }[] = []
    const flushRun = () => {
      if (run.length === 0) return
      const id = `unread-pol:${run[0].node}`
      const seg = push({ shape: 'nodes', w: W.node * run.length + 12, tone: 'off', section: 'pol', stop: id, hint: `Not read: ${run.map((r) => r.label).join(', ')}`, foldable: true, nodes: run })
      stop({ id, kind: 'unread', side: 'below', seg, at: 0.5, foldable: true, unread: run, cardW: CARD_W.unread })
      run = []
    }
    plan.policies.forEach((p, i) => {
      if (polDone.has(i)) return
      polDone.add(i)
      if (alsoPolicies.has(p.policyId)) {
        flushRun()
        const seg = push({ shape: 'blip', w: W.blip, tone: 'notice', section: 'pol', stop: p.node, hint: `${p.name} also covers ${first} · not used`, foldable: false })
        stop({ id: p.node, kind: 'policy', side: 'below', seg, at: 0.5, foldable: false, policy: i, also: true, cardW: CARD_W.also })
        return
      }
      run.push({ node: p.node, label: `${p.order} ${p.name}`, reason: p.reason })
    })
    flushRun()
  }

  /* The rules never read: one dashed run, a rule that also applies its own amber blip. */
  const flushRules = () => {
    let run: { node: string; label: string; reason: string }[] = []
    const flushRun = () => {
      if (run.length === 0) return
      const id = `unread-rule:${run[0].node}`
      const seg = push({ shape: 'nodes', w: W.node * run.length + 12, tone: 'off', section: 'rule', stop: id, hint: `Not read: ${run.map((r) => r.label).join(', ')}`, foldable: true, nodes: run })
      stop({ id, kind: 'unread', side: 'below', seg, at: 0.5, foldable: true, unread: run, cardW: CARD_W.unread })
      run = []
    }
    plan.rules.forEach((r, i) => {
      if (ruleDone.has(i)) return
      ruleDone.add(i)
      if (alsoRules.has(r.id)) {
        flushRun()
        const seg = push({ shape: 'blip', w: W.blip, tone: 'notice', section: 'rule', stop: r.node, hint: `Rule ${ruleNo(r)} also applies to ${first} · not used`, foldable: false })
        stop({ id: r.node, kind: 'rule', side: 'below', seg, at: 0.5, foldable: false, rule: i, also: true, cardW: CARD_W.rule })
        return
      }
      run.push({ node: r.node, label: r.index === null ? 'Nothing else matched' : `${r.index + 1} ${r.name}`, reason: r.state === 'off' ? 'Switched off' : 'Not read' })
    })
    flushRun()
  }

  let polsFlushed = false
  const ensurePolicies = () => {
    if (polsFlushed) return
    polsFlushed = true
    flushPolicies()
  }

  plan.steps.forEach((step, si) => {
    const from = segs.length
    const pi = step.policy
    const ri = step.rule
    const p: EnginePolicy | undefined = pi !== undefined ? plan.policies[pi] : undefined
    const r: EngineRule | undefined = ri !== undefined ? plan.rules[ri] : undefined
    switch (step.kind) {
      case 'find':
        flat(W.lead, 'lead')
        break
      case 'scan':
        if (p && pi !== undefined && !polDone.has(pi)) {
          if (p.decides) {
            flat(W.wait, 'pol')
          } else {
            polDone.add(pi)
            const seg = push({ shape: 'notch', w: W.notch, tone: 'ink', section: 'pol', stop: p.node, hint: `${p.order} ${p.name}: ${p.reason || 'not used'}`, foldable: true })
            stop({ id: p.node, kind: 'policy', side: 'below', seg, at: 0.5, foldable: true, policy: pi, cardW: CARD_W.passed })
          }
        }
        break
      case 'found':
        if (p && pi !== undefined && !polDone.has(pi)) {
          polDone.add(pi)
          const seg = push({ shape: 'spike', w: W.spike, tone: 'path', section: 'pol', stop: p.node, hint: `${p.name} covers ${first}`, foldable: false })
          stop({ id: p.node, kind: 'policy', side: 'above', seg, at: 0.5, foldable: false, policy: pi, cardW: CARD_W.decider })
        }
        break
      case 'decides':
        flat(W.fold, 'pol')
        ensurePolicies()
        break
      case 'expand':
        ensurePolicies()
        push({ shape: 'gap', w: W.gap, tone: 'ink', section: 'rule', stop: null, hint: '', foldable: false })
        break
      case 'rule':
        if (r && ri !== undefined && !ruleDone.has(ri)) {
          if (r.state === 'off') {
            ruleDone.add(ri)
            const seg = push({ shape: 'flat', w: W.notch, tone: 'off', section: 'rule', stop: r.node, hint: `Rule ${ruleNo(r)} is switched off`, foldable: true })
            stop({ id: r.node, kind: 'rule', side: 'below', seg, at: 0.5, foldable: true, rule: ri, cardW: CARD_W.passed })
          } else {
            flat(W.head, 'rule')
            /* Its card stands from here; pinned to the beat that settles it. */
            stops.push({ id: r.node, kind: 'rule', side: r.state === 'match' ? 'above' : 'below', seg: -1, at: 0.5, foldable: false, rule: ri, cardW: CARD_W.rule })
          }
        }
        break
      case 'check':
        if (r && ri !== undefined && !ruleDone.has(ri)) flat(W.wait, 'rule')
        break
      case 'checked': {
        if (!r || ri === undefined || ruleDone.has(ri) || step.check === undefined) break
        const c = r.checks[step.check]
        if (!c) break
        const shape: Shape = c.status === 'pass' ? 'tick' : c.status === 'fail' ? 'dip' : 'blip'
        const tone: Tone = c.status === 'pass' ? 'pass' : c.status === 'fail' ? 'fail' : 'notice'
        const seg = push({ shape, w: shape === 'tick' ? W.tick : shape === 'dip' ? W.dip : W.blip, tone, section: 'rule', stop: r.node, hint: c.line || c.say, foldable: false })
        const st = stops.find((x) => x.id === r.node)
        /* A failing check ends a rule of ANDs: the card hangs from its dip. */
        if (st && st.seg < 0 && c.status !== 'pass' && r.state !== 'match') st.seg = seg
        if (st && r.failing === step.check && r.shortCircuit) ruleDone.add(ri)
        break
      }
      case 'rule-end': {
        if (!r || ri === undefined || ruleDone.has(ri)) break
        const b = ruleBeat(r)
        const st = stops.find((x) => x.id === r.node)
        if (b.shape === 'spike') {
          const seg = push({ shape: 'spike', w: W.spike, tone: 'path', section: 'rule', stop: r.node, hint: r.index === null ? 'Nothing else matched' : `Rule ${ruleNo(r)} matches`, foldable: false })
          if (st) st.seg = seg
        } else if (b.shape === 'blip' && (st?.seg ?? -1) < 0) {
          /* A can't-tell with no check of its own to hang from (the last row's "if not"). */
          const seg = push({ shape: 'blip', w: W.blip, tone: 'notice', section: 'rule', stop: r.node, hint: r.index === null ? 'Nothing else matched · if not' : `Rule ${ruleNo(r)} · can't tell`, foldable: false })
          if (st) st.seg = seg
        } else {
          const seg = flat(W.head, 'rule')
          if (st && st.seg < 0) st.seg = seg
        }
        ruleDone.add(ri)
        break
      }
      case 'compact':
        if (r && ri !== undefined) {
          ruleDone.add(ri)
          flat(W.fold, 'rule')
        }
        break
      case 'deciding':
        ensurePolicies()
        flat(W.fold, 'rule')
        flushRules()
        flat(W.tail, 'out')
        break
      case 'outcome': {
        ensurePolicies()
        flushRules()
        const seg = push({ shape: 'complex', w: W.complex, tone: 'path', section: 'out', stop: 'outcome', hint: 'The answer', foldable: false })
        stop({ id: 'outcome', kind: 'outcome', side: 'end', seg, at: 0.54, foldable: false, cardW: CARD_W.outcome })
        break
      }
      default:
        break
    }
    span[si] = [from, segs.length]
  })

  /* Whatever the steps never drew (a plan cut short): drawn at the end, so nothing is lost. */
  ensurePolicies()
  flushRules()
  if (!stops.some((x) => x.id === 'outcome')) {
    const seg = push({ shape: 'complex', w: W.complex, tone: 'path', section: 'out', stop: 'outcome', hint: 'The answer', foldable: false })
    stops.push({ id: 'outcome', kind: 'outcome', side: 'end', seg, at: 0.54, foldable: false, cardW: CARD_W.outcome })
    if (span.length > 0) span[span.length - 1] = [span[span.length - 1][0], segs.length]
  }
  /* A rule card that never found its beat hangs from the seg after its head. */
  for (const st of stops) if (st.seg < 0) st.seg = Math.max(0, segs.findIndex((g) => g.stop === st.id))
  stops.sort((a, b) => a.seg - b.seg)
  return { segs, stops, span }
}
