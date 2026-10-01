import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../fixtures'
import { leaves } from '../../predicate'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { rowsRead } from '../testing/rows-read'
import { factsOf, formOf, originPatch, type SignInForm } from '../testing/sign-in-form'
import { engineRun, type EngineRun } from './engine-run'
import {
  LANES_MIN_W,
  LANE_HYSTERESIS,
  conflictCount,
  engineWires,
  factMarks,
  foldOpen,
  foldRule,
  followTo,
  followTop,
  laneFit,
  marksSig,
  othersLine,
  outcomePad,
  sentenceSay,
  tokenMark,
  policyWhy,
  roundedPath,
  ruleMarks,
  ruleOpenAuto,
  traceResult,
  whyLine,
  type Boxes,
  type WireModel,
} from './journey'
import { emptyDraft } from './sign-in-card'

/* The engine run's canvas geometry (journey.ts, TESTING-V4 §8.6): the wires
   between measured boxes, where the answer hangs, and how far the canvas
   scrolls to keep the engine's step in view. The component measures; this
   decides.

     Sign-in ──┬── [Developer tools                         Decides]
               │   [ 1  In the office …                    No match ]
               │   [ 2  Compliant device, working remotely  ✓ ✓   ]━━ [Allow with 2FA]
               └── [Global Default Policy                Not reached] */

const model: WireModel = {
  policies: [
    { policyId: 'dev', node: 'policy:dev', decides: true },
    { policyId: 'global-default', node: 'policy:global-default', decides: false },
  ],
  container: 'policy:dev',
  from: 'rule:r2',
}

/* The rules are INSIDE the policy that decides: their boxes sit within its box. */
const boxes: Boxes = {
  'sign-in': { x: 24, y: 100, w: 200, h: 150, port: 30 },
  'policy:dev': { x: 280, y: 100, w: 480, h: 320, port: 22 },
  'rule:r1': { x: 292, y: 160, w: 456, h: 50, port: 17 },
  'rule:r2': { x: 292, y: 222, w: 456, h: 120, port: 17 },
  'policy:global-default': { x: 280, y: 432, w: 480, h: 40, port: 20 },
  outcome: { x: 820, y: 180, w: 260, h: 260, port: 59 },
}

describe('roundedPath', () => {
  it('draws an orthogonal line with rounded corners, and says how long it is', () => {
    const p = roundedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ])
    expect(p.d.startsWith('M0 0 L90 0 Q100 0 100 10')).toBe(true)
    expect(p.length).toBeGreaterThan(190)
    expect(p.length).toBeLessThan(200)
  })

  it('never rounds a corner past half of either leg', () => {
    const p = roundedPath([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 100 },
    ])
    expect(p.d).toContain('L4 0 Q8 0 8 4')
  })

  it('drops repeated points and draws nothing for none', () => {
    expect(roundedPath([]).d).toBe('')
    expect(roundedPath([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 1 }]).d).toBe('M1 1 L5 1')
  })
})

describe('engineWires', () => {
  const w = engineWires(boxes, model)

  it('fans from the sign-in to every policy, meeting each at its head, and lights the one that decides', () => {
    expect(w.fan.map((f) => f.policyId)).toEqual(['dev', 'global-default'])
    expect(w.fan[1].d.startsWith('M224 130')).toBe(true)
    expect(w.fan[1].d.endsWith('280 452')).toBe(true)
    expect(w.toDecider?.d.startsWith('M224 130')).toBe(true)
    expect(w.toDecider?.d.endsWith('280 122')).toBe(true)
  })

  it('every line of the fan turns on one vertical, half way across the gap', () => {
    /* The first corner's control point is the corner itself. */
    const turn = (d: string) => d.match(/Q(\d+(?:\.\d+)?) /)![1]
    expect(new Set(w.fan.map((f) => turn(f.d)))).toEqual(new Set([String((224 + 280) / 2)]))
  })

  it('the last wire leaves the policy’s right edge level with the rule it stopped at, and meets the answer at its badge', () => {
    expect(w.out?.d.startsWith('M760 239')).toBe(true)
    expect(w.out?.d.endsWith('820 239')).toBe(true)
    /* Level: the answer hung by outcomePad, the wire is one straight line. */
    expect(w.out?.d).not.toContain('Q')
  })

  it('leaves the policy’s head when it is closed', () => {
    const closed = engineWires(boxes, { ...model, from: 'policy:dev' })
    expect(closed.out?.d.startsWith('M760 122')).toBe(true)
  })

  it('draws only what it has boxes for, and no last wire while the answer is not to the right', () => {
    expect(engineWires({}, model).fan).toEqual([])
    const early = engineWires({ 'sign-in': boxes['sign-in'], 'policy:dev': boxes['policy:dev'] }, model)
    expect(early.fan).toHaveLength(1)
    expect(early.out).toBeNull()
    expect(engineWires({ ...boxes, outcome: { ...boxes.outcome!, x: 700 } }, model).out).toBeNull()
  })
})

/* Vertical (§12.3): one centred column at x 24, 540 wide — the start on
   top, the card of policies under it, the answer under that — joined by a
   spine down the middle, x 294.

                 [Sign-in]
                     │
     ┌ Policies on GitHub Enterprise ─────────┐
     │ 1  Developer tools              Decides │
     │ 2  Global Default Policy    Not reached │
     └─────────────────────────────────────────┘
                     │
               [Allow with 2FA] */
const tall: Boxes = {
  'sign-in': { x: 24, y: 68, w: 540, h: 96, port: 30 },
  which: { x: 24, y: 204, w: 540, h: 420 },
  'policy:dev': { x: 32, y: 252, w: 524, h: 320, port: 22 },
  'rule:r1': { x: 68, y: 316, w: 472, h: 50, port: 17 },
  'rule:r2': { x: 68, y: 378, w: 472, h: 120, port: 17 },
  'policy:global-default': { x: 32, y: 576, w: 524, h: 44, port: 22 },
  outcome: { x: 24, y: 664, w: 540, h: 200, port: 59 },
}

describe('engineWires — vertical: a spine', () => {
  const w = engineWires(tall, model, 'vertical')

  it('drops from the start’s foot into the top of the card of policies, down the middle; no fan', () => {
    expect(w.fan).toEqual([])
    expect(w.trunk?.d).toBe('M294 164 L294 204')
    /* Lit, the same line, once a policy decides. */
    expect(w.toDecider?.d).toBe(w.trunk?.d)
    const none = engineWires(tall, { ...model, policies: model.policies.map((p) => ({ ...p, decides: false })) }, 'vertical')
    expect(none.trunk?.d).toBe('M294 164 L294 204')
    expect(none.toDecider).toBeNull()
  })

  it('and on from the card’s foot into the answer’s top, once the answer stands below it', () => {
    expect(w.out?.d).toBe('M294 624 L294 664')
    expect(engineWires({ ...tall, outcome: { ...tall.outcome!, y: 500 } }, model, 'vertical').out).toBeNull()
    expect(engineWires(tall, { ...model, container: null }, 'vertical').out).toBeNull()
  })

  it('two blocks off one line are joined by a step half way down the gap', () => {
    const off = engineWires({ ...tall, 'sign-in': { ...tall['sign-in']!, x: 24, w: 320 } }, model, 'vertical')
    /* From the start's middle (184) to the card's (294), turning at 184 on the way down. */
    expect(off.trunk?.d.startsWith('M184 164 L184 ')).toBe(true)
    expect(off.trunk?.d.endsWith('294 204')).toBe(true)
  })

  it('reads the policies’ own box before the card is measured; the horizontal drawing is the default', () => {
    const { which: _card, ...early } = tall
    expect(engineWires(early, model, 'vertical').trunk?.d).toBe('M294 164 L294 252')
    expect(engineWires(boxes, model)).toEqual(engineWires(boxes, model, 'horizontal'))
    expect(engineWires(boxes, model).trunk).toBeNull()
  })
})

describe('laneFit — side by side, or one column', () => {
  it('side by side from the lanes’ least width up, one column below it', () => {
    expect(LANES_MIN_W).toBe(208 + 400 + 216 + 2 * 32 + 2 * 24)
    expect(laneFit(1141)).toBe('horizontal')
    expect(laneFit(LANES_MIN_W)).toBe('horizontal')
    expect(laneFit(LANES_MIN_W - 1)).toBe('vertical')
    expect(laneFit(800, 'horizontal')).toBe('vertical')
  })

  it('back side by side only past the hysteresis, so a canvas near the edge never flaps', () => {
    expect(LANE_HYSTERESIS).toBe(16)
    expect(laneFit(LANES_MIN_W + 4, 'vertical')).toBe('vertical')
    expect(laneFit(LANES_MIN_W + LANE_HYSTERESIS - 1, 'vertical')).toBe('vertical')
    expect(laneFit(LANES_MIN_W + LANE_HYSTERESIS, 'vertical')).toBe('horizontal')
    expect(laneFit(LANES_MIN_W + 4, 'horizontal')).toBe('horizontal')
  })

  it('a canvas not measured yet keeps what it had', () => {
    expect(laneFit(0, 'vertical')).toBe('vertical')
    expect(laneFit(0)).toBe('horizontal')
    expect(laneFit(Number.NaN, 'vertical')).toBe('vertical')
  })
})

describe('outcomePad', () => {
  it('hangs the answer so its badge is level with the rule the walk stopped at', () => {
    /* rule r2's head at 222 + 17 = 239; the lane starts at 100; the badge is 59 down the answer. */
    expect(outcomePad(boxes, 'rule:r2', 100, 44)).toBe(239 - 100 - 59)
  })

  it('uses the fallback port before the answer is measured', () => {
    const { outcome: _, ...unmeasured } = boxes
    expect(outcomePad(unmeasured, 'rule:r2', 100, 44)).toBe(239 - 100 - 44)
  })

  it('a tall answer rises until its foot meets the floor, rather than hang past it', () => {
    const tall: Boxes = { ...boxes, outcome: { ...boxes.outcome!, h: 420 } }
    /* Level would be 80 down, its foot at 100 + 80 + 420 = 600; the floor is 540. */
    expect(outcomePad(tall, 'rule:r2', 100, 44, 540)).toBe(540 - 100 - 420)
    /* Taller than the room there is: at the lane's top. */
    expect(outcomePad(tall, 'rule:r2', 100, 44, 400)).toBe(0)
  })

  it('stays level when it fits, or overshoots the floor by less than a check row', () => {
    expect(outcomePad(boxes, 'rule:r2', 100, 44, 700)).toBe(80)
    /* Its foot at 100 + 80 + 260 = 440, the floor 400: 40 px over is let be. */
    expect(outcomePad(boxes, 'rule:r2', 100, 44, 400)).toBe(80)
    expect(outcomePad(boxes, 'rule:r2', 100, 44, 380)).toBe(380 - 100 - 260)
  })

  it('at the top when nothing has landed, and never above the lane', () => {
    expect(outcomePad(boxes, null, 100, 44)).toBe(0)
    expect(outcomePad(boxes, 'rule:r1', 400, 44)).toBe(0)
  })
})

describe('followTo — keeping the step in view', () => {
  const view = { left: 0, top: 0, width: 800, height: 500 }
  const inset = { top: 64, right: 24, bottom: 24, left: 24 }

  it('stays put when the step is already in view, clear of the engine line', () => {
    expect(followTo(view, { x: 100, y: 100, w: 200, h: 100 }, inset)).toBeNull()
  })

  it('scrolls down just enough to show a step below, with its margin', () => {
    expect(followTo(view, { x: 100, y: 600, w: 200, h: 100 }, inset)).toEqual({ left: 0, top: 600 + 100 + 24 - 500 })
  })

  it('scrolls back up so a step above clears the engine line', () => {
    expect(followTo({ ...view, top: 400 }, { x: 100, y: 300, w: 200, h: 40 }, inset)).toEqual({ left: 0, top: 300 - 64 })
  })

  it('asks for a growing step’s reach, and shows one taller than the view from its start', () => {
    expect(followTo(view, { x: 100, y: 380, w: 200, h: 20 }, inset, 160)).toEqual({ left: 0, top: 380 + 160 + 24 - 500 })
    expect(followTo(view, { x: 100, y: 200, w: 200, h: 900 }, inset)).toEqual({ left: 0, top: 200 - 64 })
  })

  it('sideways too, and never past the start', () => {
    expect(followTo(view, { x: 900, y: 100, w: 200, h: 100 }, inset)).toEqual({ left: 900 + 200 + 24 - 800, top: 0 })
    expect(followTo({ ...view, left: 50 }, { x: 10, y: 100, w: 100, h: 100 }, inset)).toEqual({ left: 0, top: 0 })
  })
})

/* The chain's nodes, as data (journey.ts, TESTING-V4 §13.2): what each rule
   card, the policy node and the person node say at a step — read off the
   plan the showcase tenant gives, so the words and the marks are the
   engine's own. */
describe('the chain: rule cards, the policy node, the person node', () => {
  const t = showcaseTenant()
  const env = envOf(t)
  const planOf = (f: SignInForm) => {
    const { facts } = factsOf(f, t.zones)
    const res = resolveSignIn(t.policies, facts, env)
    const rows = rowsRead(t.policies, null, f.appId, { zones: t.zones, fingerprints: t.fingerprints })
    return engineRun({ res, policies: t.policies, form: f, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
  }
  const arun: SignInForm = { ...emptyDraft('2026-09-28', '09:30'), personId: 'arun', appId: 'github' }
  const home = planOf({ ...arun, ...originPatch('home') })
  const office = planOf(arun)
  const condIds = (plan: EngineRun, i: number) => {
    const p = t.policies.find((x) => x.id === plan.decider!.id)!
    return leaves(p.rules[i].when).map((c) => c.id)
  }

  it('a rule card: waiting until the engine opens it, read, then its result — a miss folded as the engine leaves it', () => {
    const [r1, r2] = home.rules
    expect(traceResult(r1, r1.startAt - 1)).toBe('waiting')
    expect(traceResult(r1, r1.startAt)).toBe('reading')
    expect(traceResult(r1, r1.endAt)).toBe('missed')
    expect(traceResult(r1, r1.compactAt!)).toBe('folded')
    /* Show all checks opens it again. */
    expect(traceResult(r1, home.at.done, true)).toBe('missed')
    expect(traceResult(r2, home.at.done)).toBe('matched')
    /* The rules after the one that matched: not reached, from the step it matched. */
    const after = home.rules.filter((r) => r.state === 'not-reached')
    expect(after.length).toBeGreaterThan(0)
    after.forEach((r) => {
      expect(traceResult(r, r.startAt - 1)).toBe('waiting')
      expect(traceResult(r, home.at.done)).toBe('not-reached')
    })
  })

  it('its marks: a spinner while a row is read, its mark as it lands; the rows after the failing one never read', () => {
    const r1 = home.rules[0]
    const ids = condIds(home, 0)
    expect(ruleMarks(r1, ids, r1.startAt)).toEqual({ who: null, conds: {}, skipped: [] })
    expect(ruleMarks(r1, ids, r1.checkAt[0]).who).toEqual({ status: 'pass', working: true })
    expect(ruleMarks(r1, ids, r1.markAt[0]).who).toEqual({ status: 'pass', working: false })
    const settled = ruleMarks(r1, ids, home.at.done)
    /* Who held, the network did not, the device was never read. */
    expect(Object.values(settled.conds).map((m) => m.status)).toEqual(['fail'])
    expect(settled.skipped).toHaveLength(ids.length - 1)
    /* The rule that matched: every row held. */
    const r2 = ruleMarks(home.rules[1], condIds(home, 1), home.at.done)
    expect(r2.who?.status).toBe('pass')
    expect(Object.values(r2.conds).every((m) => m.status === 'pass' && !m.working)).toBe(true)
    expect(r2.skipped).toEqual([])
    /* Two steps that show the same, sign the same. */
    expect(marksSig(ruleMarks(r1, ids, home.at.done))).toBe(marksSig(ruleMarks(r1, ids, home.at.done - 1)))
  })

  it('the policy node: why it decides, and the others as one line', () => {
    expect(whyLine(office, 'Arun Patel')).toBe('First policy that covers Arun Patel')
    /* Two since the Code review for Finance draft is on GitHub too (the troubleshooting seed, 30 Sep 2026). */
    expect(othersLine(office, 'Arun Patel')).toEqual({ count: 2, text: '2 others: 1 not turned on yet, 1 not reached' })
    const kavya = planOf({ ...emptyDraft('2026-09-28', '09:30'), personId: 'u-hr-1', appId: 'hrms' })
    expect(whyLine(kavya, 'Kavya Menon')).toBe('No other policy decides for Kavya Menon')
    expect(othersLine(kavya, 'Kavya Menon').text).toBe('1 other: HRMS access from corporate offices · switched off')
    /* Several others, counted by what they say. */
    const many = othersLine(
      { policies: [{ decides: true, reason: '' }, { decides: false, reason: 'Switched off' }, { decides: false, reason: 'Kavya Menon is not in it' }, { decides: false, reason: 'Switched off' }] as EngineRun['policies'] },
      'Kavya Menon',
    )
    expect(many).toEqual({ count: 3, text: '3 others: 2 switched off, 1 does not cover Kavya Menon' })
    expect(othersLine({ policies: [{ decides: true, reason: '' }] as EngineRun['policies'] }, null)).toEqual({ count: 0, text: '' })
  })

  /* The arrival pill and the person's card are one node now (owner, 1 Oct:
     "merge these two … a full sentence"): the sentence says who — with every
     group, in brackets — the application, and the facts stated that the
     rules read, with the form's connectors. */
  it('the top of the chain is one sentence: who (their groups), the application, the facts the rules read', () => {
    const v = (over: Partial<Parameters<typeof sentenceSay>[0]> = {}) => ({ who: 'Maya Iyer', isGroup: false, groups: ['Engineering', 'Finance'], app: { id: 'github', name: 'GitHub Enterprise' }, facts: [], ...over })
    const fact = (token: 'from' | 'device', text: string) => ({ token, value: { token, label: '', text, unset: false, mark: { kind: 'icon' as const, icon: 'device' as const } }, mark: null })
    expect(sentenceSay(v())).toBe('Maya Iyer (Engineering, Finance) signs in to GitHub Enterprise')
    expect(sentenceSay(v({ facts: [fact('from', 'Home broadband'), fact('device', 'Windows 11 laptop · registered')] }))).toBe(
      'Maya Iyer (Engineering, Finance) signs in to GitHub Enterprise from Home broadband on Windows 11 laptop · registered',
    )
    /* A group chosen in the Person picker is the subject; who was tested, in brackets. */
    expect(sentenceSay(v({ who: 'A member of Finance', isGroup: true, groups: [], testedAs: 'Priya Sharma' }))).toBe('A member of Finance (tested as Priya Sharma) signs in to GitHub Enterprise')
    expect(sentenceSay(v({ who: null, groups: [], app: null }))).toBe('Nobody chosen signs in to no application')
  })
})

/* The chain folds (owner, 30 Sep: "make the cards collapsible like we have in
   the policy builder"): what each node says folded, which are open after a
   run, what the dock's Expand all and Collapse all do, and the builder's
   accordion. */
describe('the fold: one line each, the dock, the accordion', () => {
  const t = showcaseTenant()
  const env = envOf(t)
  const planOf = (f: SignInForm) => {
    const { facts } = factsOf(f, t.zones)
    const res = resolveSignIn(t.policies, facts, env)
    const rows = rowsRead(t.policies, null, f.appId, { zones: t.zones, fingerprints: t.fingerprints })
    return engineRun({ res, policies: t.policies, form: f, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
  }
  const arun: SignInForm = { ...emptyDraft('2026-09-28', '09:30'), personId: 'arun', appId: 'github' }
  const home = planOf({ ...arun, ...originPatch('home') })

  const devon = planOf(formOf(t.savedSignIns.find((s) => s.name === 'Devon Rao on Android 12')!.facts, t.zones))
  const maya = planOf(formOf(t.savedSignIns.find((s) => s.id === 'ssi-maya-github')!.facts, t.zones))

  it('a fact that failed a check the engine read carries a ✕; one the rule that decided held never does', () => {
    /* Devon: rule 1 read his device and it failed; nothing else matched. */
    expect(factMarks(devon)).toEqual({ device: 'fail' })
    /* The sentence's "on" carries it; its "from" is the network's, or the place's. */
    expect(tokenMark('device', factMarks(devon))).toBe('fail')
    expect(tokenMark('from', factMarks(devon))).toBeNull()
    expect(tokenMark('from', { place: 'unknown' })).toBe('unknown')
    expect(tokenMark('from', { network: 'unknown', place: 'fail' })).toBe('fail')
    /* Arun at home: rule 1 failed on the network; rule 2 held the device — the network is marked, the device is not. */
    expect(factMarks(home)).toEqual({ network: 'fail' })
    /* A device not stated could not be told. */
    expect(factMarks(planOf({ ...arun, device: { kind: 'none' } }))).toEqual({ device: 'unknown' })
    /* Everything held: nothing marked. */
    expect(factMarks(maya)).toEqual({})
  })

  it('folded, the policy says why it decided, result first: the rule that matched, or the rules above the last row that missed and on what', () => {
    expect(policyWhy(home)).toBe('Rule 2 matched: Compliant device, working remotely')
    expect(policyWhy(devon)).toBe('Rule 1 didn’t match: Device')
    expect(policyWhy(planOf({ ...arun, device: { kind: 'none' } }))).toBe('Can’t tell: Device')
  })

  it('what would answer otherwise is counted once: the findings in the conflict tone — a rule or a policy that would answer otherwise — never what comes first by design', () => {
    expect(conflictCount(maya)).toBe(1)
    for (const p of [home, devon]) expect(conflictCount(p)).toBe(0)
    const saved = (start: string) => planOf(formOf(t.savedSignIns.find((s) => s.name.startsWith(start))!.facts, t.zones))
    /* A second policy on AWS that would answer otherwise: one, and the answer's line says it. */
    const aws = saved('Maya Iyer on AWS')
    expect(conflictCount(aws)).toBe(1)
    expect(aws.conflicts?.line).not.toBe('')
    /* Slack's policy for Contractors before Slack for everyone: by design, none. */
    expect(conflictCount(saved('Devon Rao on Slack'))).toBe(0)
  })

  it('after a run, only the rule that matched and a conflict are open; a miss, a rule never reached, one switched off are their line', () => {
    expect(ruleOpenAuto('matched', false)).toBe(true)
    expect(ruleOpenAuto('folded', false)).toBe(false)
    expect(ruleOpenAuto('not-reached', false)).toBe(false)
    expect(ruleOpenAuto('off', false)).toBe(false)
    expect(ruleOpenAuto('not-reached', true)).toBe(true)
    /* What cannot be told, and the last row when it depends, say what is needed: open. */
    expect(ruleOpenAuto('unknown', false)).toBe(true)
    expect(ruleOpenAuto('possible', false)).toBe(true)
  })

  it('the dock asks, a press overrides it, and while the engine works the chain is its own', () => {
    expect(foldOpen('policies', {}, 'auto', true, false)).toBe(true)
    expect(foldOpen('rule:r1', {}, 'auto', false, false)).toBe(false)
    expect(foldOpen('rule:r1', {}, 'expand', false, false)).toBe(true)
    expect(foldOpen('policy', {}, 'collapse', true, false)).toBe(false)
    expect(foldOpen('policy', { policy: true }, 'collapse', true, false)).toBe(true)
    expect(foldOpen('rule:r1', { 'rule:r1': false }, 'expand', true, false)).toBe(false)
    /* Running: its own, whatever was asked or pressed. */
    expect(foldOpen('policy', { policy: false }, 'collapse', true, true)).toBe(true)
  })

  it('opening a rule folds the others open beside it — never a conflict, and not after Expand all', () => {
    const rules = ['rule:r1', 'rule:r2', 'rule:r3', 'rule:fallback'] as const
    const open = new Set<string>(['rule:r2', 'rule:r3'])
    const isOpen = (k: string) => open.has(k)
    const keep = new Set(['rule:r3'])
    expect(foldRule({}, 'rule:r1', isOpen, rules, keep, 'auto')).toEqual({ 'rule:r1': true, 'rule:r2': false })
    expect(foldRule({}, 'rule:r1', isOpen, rules, keep, 'expand')).toEqual({ 'rule:r1': true })
    /* Folding one folds only it. */
    expect(foldRule({}, 'rule:r2', isOpen, rules, keep, 'auto')).toEqual({ 'rule:r2': false })
  })
})

/* The canvas follows the engine down the column (owner, 30 Sep: "the user
   can't trace the whole process with their eyes"): it glides so the step
   stands a little way down the canvas, with room under it. */
describe('followTop — following the engine down the column', () => {
  const view = { top: 0, height: 800 }
  const inset = { top: 72, bottom: 72 }

  it('stays put while the step is in the band the canvas shows', () => {
    expect(followTop(view, { y: 200, h: 120 }, inset)).toBeNull()
    expect(followTop(view, { y: 400, h: 100 }, inset, 150)).toBeNull()
  })

  it('a step reaching past the foot is brought up to stand 30 % down the room left', () => {
    const band = 800 - 72 - 72
    expect(followTop(view, { y: 700, h: 120 }, inset)).toBe(Math.round(700 - 72 - (band - 120) * 0.3))
    /* It asks for the room a growing rule will take. */
    expect(followTop(view, { y: 600, h: 40 }, inset, 168)).toBe(Math.round(600 - 72 - (band - 168) * 0.3))
  })

  it('a step above the band is brought down into it; one taller than most of it is shown from its top; never past the start', () => {
    expect(followTop({ top: 600, height: 800 }, { y: 500, h: 100 }, inset)).toBe(Math.round(500 - 72 - (656 - 100) * 0.3))
    expect(followTop(view, { y: 900, h: 700 }, inset)).toBe(900 - 72)
    expect(followTop({ top: 300, height: 800 }, { y: 40, h: 40 }, inset)).toBe(0)
  })
})
