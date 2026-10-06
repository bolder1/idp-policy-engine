import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { factsOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { engineRun, timeline, type EngineRun, type Intro } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import {
  BEAT_MIN,
  CHECKED_MIN,
  CHECK_MIN,
  NOTICE_MS,
  OFF_RULE_MIN,
  PRESENT_CAP_MS,
  READ_HOLD,
  READ_HOLD_MIN,
  advance,
  beatOfStep,
  fillOf,
  jumped,
  landedAt,
  presentTimeline,
  presentedStep,
  replayed,
  skipped,
  startState,
  storyOf,
  type Beat,
  type PaceState,
  type PresentedTimeline,
} from './focus2-pace'

/* -----------------------------------------------------------------------------
   Focus v2's presenter, over REAL runs of the showcase tenant: the beats the
   story is cut into, how long each one is held, and the state machine that
   walks them without ever drawing a step the engine has not run.

   The plans are built the way focus-polish.test.tsx builds them — resolver,
   columns, engineRun — because a hand-made plan would not have the shapes the
   presenter has to survive: a conflict's 2000 ms notice step, a Deny that
   falls through to the catch-all, a Depends the form itself cannot reach, and
   the Global Default deciding for an application whose own policy is off.

   The hook (`usePresenter`) is not rendered here: this repo's vitest runs in
   node, with no jsdom and no testing-library, which is exactly why every
   decision the hook makes lives in the pure functions below. `drive()` plays
   frames through them the way the hook's requestAnimationFrame loop does,
   with the engine's own clock running underneath.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }

function planOf(personName: string, appName: string, opts: { origin?: 'home' | 'tor'; patch?: Partial<SignInForm>; intro?: Intro } = {}): EngineRun {
  const person = t.directory.people.find((p) => p.name === personName)
  const app = t.apps.find((a) => a.name === appName)
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(t.policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...(opts.origin ? originPatch(opts.origin) : {}), personId: person.id, appId: app.id }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...(opts.patch ?? {}) } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const res = runColumns([AS_IT_STANDS], t.policies, facts, env)[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  return engineRun({ res, policies: t.policies, form, facts, env, ctx, intro: opts.intro ?? 'none' })
}

/* Maya Iyer on AWS: rule 1 (contractors away from the office) misses, rule 2
   (engineers on a compliant device) matches — two rules read, and an Allow. */
const MAYA = planOf('Maya Iyer', 'AWS Console')
/* Devon on a Windows 10 laptop: nothing matches, so the run reads every rule
   and falls to "Nothing else matched" — the longest of the real stories, and
   the one the 16 s cap actually binds on. */
const DENY = planOf('Devon Rao', 'AWS Console', { patch: { device: { kind: 'preset', id: 'win10' } } as Partial<SignInForm> })
/* HRMS's own policy is Inactive in the seed, so Kavya's run passes over it
   and the Global Default Policy decides. */
const KAVYA = planOf('Kavya Menon', 'HRMS')
/* No device stated at all: a check that cannot be told, and the answer
   Depends — a shape the form cannot otherwise reach. */
const DEPENDS = planOf('Arun Patel', 'GitHub Enterprise', { patch: { device: { kind: 'none' } } as Partial<SignInForm> })
/* Maya on GitHub: Engineering lets her in on rule 1, and Finance's rule 3
   would also apply — the conflict, named on the deciding step with `notice`. */
const CONFLICT = planOf('Maya Iyer', 'GitHub Enterprise')

const EVERY = [
  { name: 'Maya', plan: MAYA },
  { name: 'Devon Deny', plan: DENY },
  { name: 'Kavya', plan: KAVYA },
  { name: 'Depends', plan: DEPENDS },
  { name: 'Conflict', plan: CONFLICT },
]

const msOf = (plan: EngineRun) => presentTimeline(plan, storyOf(plan))
const bare = (tl: PresentedTimeline): Beat[] => tl.beats.map((b) => b.beat)

/* The owner's ms table, repeated here on purpose: a test that read the
   module's own numbers would pass whatever they were changed to. */
const TABLE: Record<string, number> = {
  fill: 460,
  collapse: 280,
  find: 400,
  scan: 420,
  found: 520,
  decides: 420,
  expand: 300,
  rule: 320,
  check: 360,
  checked: 380,
  'rule-end': 360,
  compact: 0,
  deciding: 520,
  outcome: 1400,
  done: 0,
}

// --- The six beats ----------------------------------------------------------------------

describe('storyOf: the run cut into the story', () => {
  it('Maya: sign-in, the policies passed over, the covering policy, each rule read, the Then, the outcome', () => {
    const beats = storyOf(MAYA)
    expect(beats.map((b) => b.kind)).toEqual(['sign', 'policies', 'covers', 'rule', 'rule', 'then', 'outcome'])
    expect(beats.map((b) => b.label)).toEqual(['Sign-in', 'Policies', 'Covering policy', 'Rule 1 of 2', 'Rule 2 of 2', 'Then', 'Outcome'])
    expect(beats.map((b) => b.short)).toEqual(['Sign-in', 'Policies', 'Covers', 'Rule 1', 'Rule 2', 'Then', 'Outcome'])
    expect(beats[2].name).toBe('AWS for engineering teams')
    expect(beats[4].name).toBe('Rule 2 · Engineers on a compliant device')
  })

  it('Devon Deny: one beat a rule read, and the catch-all last', () => {
    const rules = storyOf(DENY).filter((b) => b.kind === 'rule')
    expect(rules).toHaveLength(4)
    expect(rules.at(-1)?.label).toBe('Last rule')
    expect(rules.at(-1)?.name).toBe('Nothing else matched')
    /* "Rule 2 of 3" counts the numbered rules in the story; the catch-all has
       no number of its own and is not one of them. */
    const numbered = rules.filter((b) => b.short.startsWith('Rule '))
    expect(numbered).toHaveLength(3)
    numbered.forEach((b, i) => expect(b.label).toBe(`Rule ${i + 1} of 3`))
  })

  it('Kavya: the policy that is off is passed over, and the Global Default is the one that covers', () => {
    const beats = storyOf(KAVYA)
    expect(beats.map((b) => b.kind)).toEqual(['sign', 'policies', 'covers', 'rule', 'then', 'outcome'])
    expect(beats.find((b) => b.kind === 'covers')?.name).toBe('Global Default Policy')
    expect(KAVYA.steps.filter((st) => st.kind === 'scan')).toHaveLength(2)
  })

  it('the Then takes the deciding step and the outcome takes at.outcome: one beat to a step, in order', () => {
    for (const { name, plan } of EVERY) {
      const beats = storyOf(plan)
      const then = beats.find((b) => b.kind === 'then')
      const out = beats.at(-1)
      expect(out?.kind, name).toBe('outcome')
      expect(out?.at, name).toBe(plan.at.outcome)
      expect(then, name).toBeDefined()
      expect(then!.at, name).toBe(plan.steps.findIndex((st) => st.kind === 'deciding'))
      expect(then!.rule, name).toBe(plan.landing)
      /* v1 spent the deciding step on the outcome (focus-model.ts:43). If the
         two shared it, the Then's segment could never fill and the clock
         could never pass it. */
      expect(then!.at, name).toBeLessThan(out!.at)
      beats.forEach((b, i) => {
        if (i > 0) expect(b.at, `${name} beat ${i}`).toBeGreaterThan(beats[i - 1].at)
      })
    }
  })

  it('every step belongs to exactly one beat, and the spans cover the plan end to end', () => {
    for (const { name, plan } of EVERY) {
      const beats = storyOf(plan)
      expect(beats[0].from, name).toBe(0)
      expect(beats.at(-1)?.to, name).toBe(plan.steps.length - 1)
      beats.forEach((b, i) => {
        expect(b.to, `${name} beat ${i}`).toBeGreaterThanOrEqual(b.from)
        if (i > 0) expect(b.from, `${name} beat ${i}`).toBe(beats[i - 1].to + 1)
      })
      for (let step = 0; step < plan.steps.length; step++) {
        const i = beatOfStep(beats, step)
        expect(step, `${name} step ${step}`).toBeGreaterThanOrEqual(beats[i].from)
        expect(step, `${name} step ${step}`).toBeLessThanOrEqual(beats[i].to)
      }
    }
  })

  it('the sign-in keeps the find step: the stack is drawn there, but the story only moves on as the first policy is asked', () => {
    const beats = storyOf(MAYA)
    expect(MAYA.steps[beats[0].to].kind).toBe('find')
    expect(MAYA.steps[beats[1].at].kind).toBe('scan')
  })

  it('a rule the walk never reached is no beat, and one switched off would be', () => {
    for (const { name, plan } of EVERY) {
      const keys = storyOf(plan)
        .filter((b) => b.kind === 'rule')
        .map((b) => b.rule)
      plan.rules.forEach((r, i) => {
        if (r.state === 'not-reached') expect(keys, `${name} rule ${i}`).not.toContain(i)
        else if (r.visited || r.state === 'off') expect(keys, `${name} rule ${i}`).toContain(i)
      })
    }
  })

  it('an empty run (no person, no application) is one beat and nothing to tell', () => {
    const form = emptyDraft(TODAY, '09:30')
    const { facts } = factsOf(form, t.zones)
    const empty = engineRun({
      res: runColumns([AS_IT_STANDS], t.policies, facts, env)[0].resolution,
      policies: t.policies,
      form,
      facts,
      env,
      ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows: rowsRead(t.policies, null, '', lib) },
      intro: 'none',
    })
    expect(empty.empty).toBe(true)
    const beats = storyOf(empty)
    expect(beats).toHaveLength(1)
    expect(beats[0].from).toBe(0)
    expect(beats[0].to).toBe(0)
    expect(presentTimeline(empty, beats).total).toBe(BEAT_MIN.sign)
  })
})

// --- The presented times ----------------------------------------------------------------

describe('presentTimeline: a pace a person can read', () => {
  /* Measured, 4 Oct 2026, from the owner's own ms table over the six-beat
     story. SPEC.md's figures — Maya 9.5 s, Devon Deny 13.5 s, Kavya 8 s —
     were written for v1's four moments; v2 has two beats more (the covering
     policy, and the deciding rule's Then), which is two more 800 ms read
     holds and two more 1200 ms floors, so about 2.5 to 3 s more a run. Devon
     reaches the 16 s cap exactly, which is the cap doing its job. The owner
     judges the pace in the browser; these are here so that a change to the
     table cannot move them quietly. */
  it('the totals: Maya 12.4 s, Devon Deny 16 s at the cap, Kavya 11 s', () => {
    expect(msOf(MAYA).total).toBe(12400)
    expect(msOf(DENY).total).toBe(16000)
    expect(msOf(KAVYA).total).toBe(10960)
    expect(msOf(CONFLICT).total).toBe(12760)
  })

  it('every run is slower than the engine ran it, which is the whole point', () => {
    for (const { name, plan } of EVERY) {
      const engine = timeline(plan.steps, 'full').total
      expect(engine, name).toBeLessThanOrEqual(9000)
      expect(msOf(plan).total, name).toBeGreaterThan(engine)
    }
  })

  it('no presentation is longer than 16 s', () => {
    for (const { name, plan } of EVERY) {
      expect(msOf(plan).total, name).toBeLessThanOrEqual(PRESENT_CAP_MS)
      expect(msOf(plan).over, name).toBe(0)
    }
  })

  it('each step away from a hand-over is held exactly what the table says', () => {
    const tl = msOf(MAYA)
    const edges = new Set(bare(tl).map((b) => b.to))
    MAYA.steps.forEach((st, i) => {
      if (edges.has(i)) return
      expect(tl.dur[i], `${i}:${st.kind}`).toBe(TABLE[st.kind])
    })
  })

  it('the step the story hands over on carries the +800 ms read hold: the finding that ended the beat can be read', () => {
    const tl = msOf(MAYA)
    expect(tl.shrunk).toBe(false)
    for (const span of tl.beats.slice(0, -1)) {
      /* The sign-in is the one exception on this run, and only because its
         1600 ms floor is higher than its step plus the hold. */
      if (span.beat.kind === 'sign') continue
      const at = span.beat.to
      expect(tl.dur[at] - TABLE[MAYA.steps[at].kind], `${span.beat.label} hand-over (${MAYA.steps[at].kind})`).toBe(READ_HOLD)
    }
    /* A rule folds as it recedes, so its own step is 0 ms and the hold is all
       there is: 800 ms to read what ended it. */
    expect(MAYA.steps[tl.beats[3].beat.to].kind).toBe('compact')
    expect(tl.dur[tl.beats[3].beat.to]).toBe(READ_HOLD)
  })

  it('every beat is held long enough to read, and none of them drags', () => {
    for (const { name, plan } of EVERY) {
      for (const span of msOf(plan).beats) {
        const b = span.beat
        const off = b.kind === 'rule' && plan.rules[b.rule ?? -1]?.state === 'off'
        const least = off ? OFF_RULE_MIN : b.kind === 'outcome' ? TABLE.outcome : BEAT_MIN[b.kind]
        expect(span.dur, `${name} · ${b.label}`).toBeGreaterThanOrEqual(least)
        expect(span.dur, `${name} · ${b.label}`).toBeLessThanOrEqual(4000)
      }
    }
  })

  it('a beat the engine raced through is topped up to its floor, on the step whose result is already on screen', () => {
    const tl = msOf(KAVYA)
    /* find (400) plus the read hold (800) is 1200, under the sign-in's 1600. */
    expect(tl.beats[0].dur).toBe(BEAT_MIN.sign)
    expect(tl.dur[tl.beats[0].beat.to]).toBe(BEAT_MIN.sign)
  })

  it('a conflict holds 2000 ms on the Then, where the finding is', () => {
    const notice = CONFLICT.steps.findIndex((st) => !!st.notice)
    expect(notice).toBeGreaterThan(-1)
    expect(CONFLICT.steps[notice].kind).toBe('deciding')
    const beats = storyOf(CONFLICT)
    expect(beats[beatOfStep(beats, notice)].kind).toBe('then')
    const tl = presentTimeline(CONFLICT, beats)
    /* 2000 for the notice, and the read hold on top: it is the last step of
       the Then's beat. And it is 2000 in place of the 520 its kind would
       otherwise get. */
    expect(tl.dur[notice]).toBe(NOTICE_MS + READ_HOLD)
    expect(tl.dur[notice]).toBeGreaterThan(msOf(MAYA).dur[MAYA.steps.findIndex((st) => st.kind === 'deciding')])
  })

  it('the spans add up to the total, and `at` is their running sum', () => {
    for (const { name, plan } of EVERY) {
      const tl = msOf(plan)
      expect(
        tl.beats.reduce((n, b) => n + b.dur, 0),
        name,
      ).toBe(tl.total)
      expect(
        tl.dur.reduce((n, d) => n + d, 0),
        name,
      ).toBe(tl.total)
      tl.at.forEach((at, i) =>
        expect(at, `${name} step ${i}`).toBe(
          tl.dur.slice(0, i).reduce((n, d) => n + d, 0),
        ),
      )
      tl.beats.forEach((span) => expect(span.at, `${name} · ${span.beat.label}`).toBe(tl.at[span.beat.from]))
    }
  })

  it('the sign-in is held the same whether the card folds into the run or not', () => {
    const run = planOf('Maya Iyer', 'AWS Console', { intro: 'collapse' })
    expect(run.steps[0].kind).toBe('collapse')
    expect(msOf(run).beats[0].dur).toBe(msOf(MAYA).beats[0].dur)
  })

  it('an edit re-run presents at 0.7 ×', () => {
    const full = msOf(MAYA)
    const edit = presentTimeline(MAYA, storyOf(MAYA), { pace: 'edit' })
    /* The test is the engine's own pace, not a guess: an edit ran at 0.6 of
       the full one, inside the spec's 0.65. */
    expect(timeline(MAYA.steps, 'edit').total / timeline(MAYA.steps, 'full').total).toBeLessThanOrEqual(0.65)
    expect(edit.total).toBeLessThanOrEqual(Math.round(full.total * 0.7))
    expect(edit.total).toBeGreaterThan(Math.round(full.total * 0.7) - edit.dur.length)
    /* A full-pace run is not touched. */
    expect(presentTimeline(MAYA, storyOf(MAYA), { pace: 'full' }).total).toBe(full.total)
  })
})

// --- The cap, and the order things are shrunk in ----------------------------------------

/* A run long enough that no amount of shrinking fits it into 16 s, built out
   of a real one: the plan's own rules, read over and over. Nothing here
   invents a step kind the engine does not produce — the point is a plan with
   a great many rows, which the showcase tenant has no policy big enough to
   give. */
function longRun(plan: EngineRun, times: number): EngineRun {
  const read = plan.rules.filter((r) => r.visited && r.index !== null)
  if (read.length === 0) throw new Error('the long run needs a plan whose rules were read')
  const steps = plan.steps.slice(0, Math.max(0, plan.at.outcome - 1))
  const extra: EngineRun['rules'] = []
  for (let n = 0; n < times; n++) {
    for (const r of read) {
      const startAt = steps.length
      const checkAt: number[] = []
      const markAt: number[] = []
      steps.push({ kind: 'rule', text: r.name, rule: plan.rules.length + extra.length })
      for (let k = 0; k < r.checked; k++) {
        checkAt.push(steps.length)
        steps.push({ kind: 'check', text: '', check: k })
        markAt.push(steps.length)
        steps.push({ kind: 'checked', text: '', check: k })
      }
      const endAt = steps.length
      steps.push({ kind: 'rule-end', text: '' })
      extra.push({ ...r, id: `${r.id}-${n}`, node: `rule:${r.id}-${n}`, index: read.length + extra.length, startAt, endAt, checkAt, markAt, compactAt: null })
    }
  }
  steps.push({ kind: 'deciding', text: '' })
  const outcome = steps.length
  steps.push({ kind: 'outcome', text: '' })
  steps.push({ kind: 'done', text: '' })
  return { ...plan, rules: [...plan.rules.filter((r) => r.visited), ...extra], steps, landing: 0, at: { ...plan.at, outcome, done: outcome + 1 } }
}

describe('the 16 s cap and the order things are shrunk in', () => {
  const tl = msOf(DENY)
  const edges = new Set(bare(tl).map((b) => b.to))

  it('Devon Deny is the real run the cap binds on, and it lands exactly on it', () => {
    expect(tl.shrunk).toBe(true)
    expect(tl.total).toBe(PRESENT_CAP_MS)
    expect(tl.over).toBe(0)
  })

  it('a run that fits is not shrunk at all', () => {
    for (const plan of [MAYA, KAVYA, CONFLICT]) expect(msOf(plan).shrunk).toBe(false)
  })

  it('the read holds go first, towards 400 ms and never below', () => {
    for (const span of tl.beats.slice(0, -1)) {
      if (span.beat.kind === 'sign') continue
      const hold = tl.dur[span.beat.to] - TABLE[DENY.steps[span.beat.to].kind]
      expect(hold, `${span.beat.label} hand-over`).toBeGreaterThanOrEqual(READ_HOLD_MIN)
      expect(hold, `${span.beat.label} hand-over`).toBeLessThan(READ_HOLD)
    }
  })

  it('and the rows after them, never below 280 and 300 ms: the order is holds first, not both at once', () => {
    const rows = DENY.steps.map((st, i) => ({ st, i })).filter(({ st, i }) => !edges.has(i) && (st.kind === 'check' || st.kind === 'checked'))
    expect(rows.length).toBeGreaterThan(4)
    for (const { st, i } of rows) {
      expect(tl.dur[i], `${i}:${st.kind}`).toBeGreaterThanOrEqual(st.kind === 'check' ? CHECK_MIN : CHECKED_MIN)
      expect(tl.dur[i], `${i}:${st.kind}`).toBeLessThanOrEqual(TABLE[st.kind])
    }
    /* Devon's read holds alone cover its overflow, so its rows are whole. */
    expect(rows.every(({ st, i }) => tl.dur[i] === TABLE[st.kind])).toBe(true)
  })

  it('a long run shrinks its rows too, each to its own floor', () => {
    const long = longRun(DENY, 4)
    const over = presentTimeline(long, storyOf(long))
    const edge = new Set(bare(over).map((b) => b.to))
    const rows = long.steps.map((st, i) => ({ st, i })).filter(({ st, i }) => !edge.has(i) && (st.kind === 'check' || st.kind === 'checked'))
    for (const { st, i } of rows) expect(over.dur[i], `${i}:${st.kind}`).toBeGreaterThanOrEqual(st.kind === 'check' ? CHECK_MIN : CHECKED_MIN)
    expect(rows.some(({ st, i }) => over.dur[i] < TABLE[st.kind])).toBe(true)
    /* And the read holds went all the way to their own floor first. */
    expect([...edge].filter((at) => over.dur[at] - TABLE[long.steps[at].kind] === READ_HOLD_MIN).length).toBeGreaterThan(4)
  })

  it('nothing else is shrunk: not the outcome’s build, not a conflict’s hold', () => {
    expect(tl.dur[DENY.at.outcome]).toBe(TABLE.outcome)
    const long = longRun(CONFLICT, 6)
    const over = presentTimeline(long, storyOf(long))
    expect(over.shrunk).toBe(true)
    expect(over.dur[long.at.outcome]).toBe(TABLE.outcome)
    long.steps.forEach((st, i) => {
      if (st.notice) expect(over.dur[i], `${i}:notice`).toBeGreaterThanOrEqual(NOTICE_MS)
    })
  })

  it('a beat is never shrunk below its own floor, even to reach the cap', () => {
    const long = longRun(DENY, 4)
    const over = presentTimeline(long, storyOf(long))
    expect(over.beats.length).toBeGreaterThan(18)
    expect(over.shrunk).toBe(true)
    /* Twenty-one beats cannot be both readable and 16 s long. The beats stay
       readable and `over` says by how much, rather than the story quietly
       making itself unreadable. */
    expect(over.over).toBeGreaterThan(0)
    expect(over.total).toBe(PRESENT_CAP_MS + over.over)
    for (const span of over.beats) {
      const b = span.beat
      expect(span.dur, b.label).toBeGreaterThanOrEqual(b.kind === 'outcome' ? TABLE.outcome : BEAT_MIN[b.kind])
    }
  })
})

// --- Driving the story ------------------------------------------------------------------

interface Driven {
  st: PaceState
  /** Every (p, s) the frames went through. */
  seen: { p: number; s: number }[]
  /** Where the engine's clock got to, so a second drive can carry on from it. */
  ms: number
}

interface DriveOptions {
  paused?: (ms: number) => boolean
  /** The engine's clock is frozen at step 0: the run is producing nothing. */
  engine?: 'frozen'
  frames?: number
  /** Carry on from an earlier drive. */
  at?: PaceState
  from?: number
  /** Called after every frame; return a state to take the admin's hand. */
  on?: (d: { ms: number; st: PaceState; p: number; s: number }) => PaceState | void
}

/* Plays frames the way the hook's requestAnimationFrame loop does: a 16 ms
   frame, the engine's own step advancing on the engine's own timeline, and
   `p` read after every one of them. */
function drive(plan: EngineRun, tl: PresentedTimeline, opts: DriveOptions = {}): Driven {
  const engine = timeline(plan.steps, 'full')
  const last = plan.steps.length - 1
  const from = opts.from ?? 0
  let st = opts.at ?? startState(1)
  const seen: { p: number; s: number }[] = []
  let ms = from
  for (let f = 0; f < (opts.frames ?? 1400); f++) {
    ms = from + f * 16
    const s = opts.engine === 'frozen' ? 0 : Math.min(last, stepOf(engine.at, ms))
    st = advance(st, { dt: 16, s, tl, paused: opts.paused?.(ms) ?? false })
    const p = presentedStep(st, { s, tl })
    seen.push({ p, s })
    const next = opts.on?.({ ms, st, p, s })
    if (next) st = next
  }
  return { st, seen, ms }
}

const stepOf = (at: readonly number[], ms: number): number => {
  let k = 0
  at.forEach((t2, i) => {
    if (t2 <= ms) k = i
  })
  return k
}

describe('the presented step: never ahead of the engine', () => {
  it('p ≤ s at every frame of every run', () => {
    for (const { name, plan } of EVERY) {
      const { seen } = drive(plan, msOf(plan))
      for (const { p, s } of seen) expect(p, name).toBeLessThanOrEqual(s)
    }
  })

  it('it only ever rises, and it gets all the way to the answer', () => {
    for (const { name, plan } of EVERY) {
      const { seen } = drive(plan, msOf(plan))
      seen.forEach((f, i) => {
        if (i > 0) expect(f.p, name).toBeGreaterThanOrEqual(seen[i - 1].p)
      })
      expect(seen.at(-1)?.p, name).toBe(plan.steps.length - 1)
      expect(landedAt(plan, seen.at(-1)?.p ?? 0), name).toBe(true)
    }
  })

  it('a step is never drawn before the engine has run it, beat by beat', () => {
    for (const { name, plan } of EVERY) {
      const tl = msOf(plan)
      const { seen } = drive(plan, tl)
      for (const beat of bare(tl)) {
        const first = seen.findIndex((f) => f.p >= beat.at)
        expect(first, `${name} · ${beat.label}`).toBeGreaterThan(-1)
        expect(seen[first].s, `${name} · ${beat.label}`).toBeGreaterThanOrEqual(beat.at)
      }
    }
  })

  it('a frozen engine freezes the picture, and the clock banks no time while it waits', () => {
    const tl = msOf(DENY)
    const { st, seen } = drive(DENY, tl, { engine: 'frozen', frames: 400 })
    expect(seen.every((f) => f.p === 0)).toBe(true)
    /* Stopped at the start of step 1, not six seconds past it: when the
       engine does produce step 1, the picture shows that step rather than
       leaping through half the run. */
    expect(st.elapsed).toBe(tl.at[1])
    expect(presentedStep(st, { s: 1, tl })).toBe(1)
    expect(presentedStep(st, { s: 9, tl })).toBe(1)
  })

  it('the story is behind the engine all the way: the run has landed long before the picture has', () => {
    const tl = msOf(DENY)
    const engine = timeline(DENY.steps, 'full')
    const { seen } = drive(DENY, tl, { frames: Math.round(engine.total / 16) + 1 })
    expect(seen.at(-1)?.s).toBe(DENY.steps.length - 1)
    expect(seen.at(-1)?.p).toBeLessThan(DENY.steps.length - 1)
    expect(landedAt(DENY, seen.at(-1)!.p)).toBe(false)
  })
})

describe('pause, jump, Skip and Play again', () => {
  it('pause freezes the picture in Auto, and letting go carries on from where it stopped', () => {
    const tl = msOf(MAYA)
    const held = drive(MAYA, tl, { paused: (ms) => ms >= 1600, frames: 400 })
    const free = drive(MAYA, tl, { frames: 400 })
    expect(held.st.elapsed).toBeLessThan(free.st.elapsed)
    expect(held.seen.at(-1)!.p).toBeLessThan(free.seen.at(-1)!.p)
    /* Let go from where the pause left it: it carries on rather than catching
       up, so nothing is skipped. */
    const on = drive(MAYA, tl, { at: held.st, from: held.ms, frames: 60 })
    expect(on.seen[0].p).toBe(held.seen.at(-1)!.p)
    expect(on.st.elapsed).toBeGreaterThan(held.st.elapsed)
  })

  it('a jump goes only to a beat the story has reached', () => {
    const tl = msOf(DENY)
    const run = drive(DENY, tl, { frames: 300 })
    const p = run.seen.at(-1)!.p
    const reached = beatOfStep(bare(tl), p)
    expect(reached).toBeGreaterThan(0)
    expect(reached).toBeLessThan(tl.beats.length - 1)
    /* Forward, past what has been shown: it goes no further than the story,
       so a press cannot give away an answer the admin has not been shown. */
    expect(jumped(run.st, tl, tl.beats.length - 1, reached).elapsed).toBe(tl.beats[reached].at)
    /* Back to the sign-in, and the picture is the sign-in again. */
    const back = jumped(run.st, tl, 0, reached)
    expect(presentedStep(back, { s: DENY.steps.length - 1, tl })).toBe(0)
    expect(fillOf(back, tl, 0)).toBe(0)
    /* Once it has landed, every segment is reachable. */
    const landed = jumped(startState(1), tl, tl.beats.length - 1, tl.beats.length - 1)
    expect(presentedStep(landed, { s: DENY.steps.length - 1, tl })).toBe(DENY.at.outcome)
  })

  it('Skip shows the engine’s step at once and follows it live from then on', () => {
    const tl = msOf(DENY)
    const run = drive(DENY, tl, { frames: 200 })
    const skip = skipped(run.st)
    expect(presentedStep(skip, { s: 5, tl })).toBe(5)
    expect(presentedStep(skip, { s: DENY.steps.length - 1, tl })).toBe(DENY.steps.length - 1)
    /* The clock stops mattering: no frame moves it again. */
    expect(advance(skip, { dt: 16, s: 3, tl, paused: false })).toBe(skip)
    /* And it still cannot pass the engine: Skip shows the answer as soon as
       the engine has it, never before. */
    expect(presentedStep(skip, { s: 0, tl })).toBe(0)
    expect(fillOf(skip, tl, 0)).toBe(1)
  })

  it('Play again starts from the sign-in, on the same run', () => {
    const tl = msOf(MAYA)
    const run = drive(MAYA, tl)
    expect(run.seen.at(-1)?.p).toBe(MAYA.steps.length - 1)
    const again = replayed(skipped(run.st))
    expect(again.key).toBe(run.st.key)
    expect(again.elapsed).toBe(0)
    expect(again.following).toBe(false)
    expect(presentedStep(again, { s: MAYA.steps.length - 1, tl })).toBe(0)
    /* And it plays through again by itself, with the engine already landed. */
    expect(drive(MAYA, tl, { at: again }).seen.at(-1)?.p).toBe(MAYA.steps.length - 1)
  })

  it('a new run starts the story again, from nothing', () => {
    const fresh = startState(7)
    expect(fresh.elapsed).toBe(0)
    expect(fresh.key).toBe(7)
    expect(fresh.following).toBe(false)
    expect(presentedStep(fresh, { s: 12, tl: msOf(MAYA) })).toBe(0)
  })

  it('reduced motion, a revisit and a settled plan: the answer is there at once', () => {
    /* What the hook does with `reduced` or `jumped` is exactly this state,
       which is why it derives it rather than storing it. */
    for (const { name, plan } of EVERY) {
      const tl = msOf(plan)
      const at: PaceState = { ...startState(1), following: true }
      const last = plan.steps.length - 1
      expect(presentedStep(at, { s: last, tl }), name).toBe(last)
      expect(landedAt(plan, presentedStep(at, { s: last, tl })), name).toBe(true)
      /* Nothing is held: a whole second of frames changes nothing at all. */
      expect(advance(at, { dt: 1000, s: last, tl, paused: false }), name).toBe(at)
    }
  })
})

describe('the rail’s fill', () => {
  it('runs 0 to 1 over the beat on screen, and stops where the clock does', () => {
    const tl = msOf(MAYA)
    const start = jumped(startState(1), tl, 0, 0)
    expect(fillOf(start, tl, 0)).toBe(0)
    expect(fillOf({ ...start, elapsed: tl.beats[0].at + tl.beats[0].dur / 2 }, tl, 0)).toBeCloseTo(0.5, 5)
    expect(fillOf({ ...start, elapsed: tl.beats[0].at + tl.beats[0].dur }, tl, 0)).toBe(1)
    /* A beat not reached yet is empty; one already told is full. */
    const at2 = jumped(startState(1), tl, 2, 2)
    expect(fillOf(at2, tl, 3)).toBe(0)
    expect(fillOf(at2, tl, 1)).toBe(1)
    /* A beat that is not there has no fill, rather than NaN. */
    expect(fillOf(at2, tl, 99)).toBe(0)
  })
})
