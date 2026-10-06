import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { factsOf, type SignInForm } from '../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import { storyOf } from './focus2-pace'
import { elideTrail, trailOf } from './focus2-trail-model'

/* The decision trail, over REAL runs of the showcase tenant: one step per thing to look at, the answer last, exactly
   one step on screen, and nothing said before the story has got to it. */

const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const LIVE: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }

function planOf(personId: string, appId: string): EngineRun {
  const rows = rowsRead(t.policies, null, appId, lib)
  const base: SignInForm = { ...emptyDraft('2026-10-05', '09:30'), personId, appId }
  const form = { ...forRun(withDefaults(base, rows, [], '2026-10-05', '09:30'), rows) } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const res = runColumns([LIVE], t.policies, facts, env)[0].resolution
  return engineRun({ res, policies: t.policies, form, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
}

const RUNS = t.directory.people.flatMap((p) => t.apps.map((a) => ({ name: `${p.name} → ${a.name}`, plan: planOf(p.id, a.id), person: p.name }))).filter((r) => !r.plan.empty)

describe('the decision trail', () => {
  it('is the person, the policy, each rule read, and the answer, with one step on screen', () => {
    expect(RUNS.length).toBeGreaterThan(0)
    for (const { name, plan, person } of RUNS) {
      const beats = storyOf(plan)
      const timeline = beats.map((b, i) => ({ beat: b, at: i, dur: 1 }))
      const last = timeline.length - 1
      const steps = trailOf(timeline, plan, { person, at: last, reached: last, p: plan.steps.length - 1, landed: true })
      expect(steps[0]?.kind, name).toBe('sign')
      expect(steps[0]?.label, name).toBe(person)
      expect(steps.at(-1)?.kind, name).toBe('outcome')
      expect(steps.filter((s) => s.current).length, name).toBe(1)
      expect(steps.every((s) => s.reachable), name).toBe(true)
      expect(steps.filter((s) => s.kind === 'rule').length, name).toBe(beats.filter((b) => b.kind === 'rule').length)
    }
  })

  it('says nothing of a result the story has not reached', () => {
    for (const { name, plan, person } of RUNS) {
      const beats = storyOf(plan)
      const timeline = beats.map((b, i) => ({ beat: b, at: i, dur: 1 }))
      const steps = trailOf(timeline, plan, { person, at: 0, reached: 0, p: 0, landed: false })
      expect(steps[0]?.current, name).toBe(true)
      for (const s of steps.slice(1)) {
        expect(s.reachable, name).toBe(false)
        expect(s.mark, name).toBeNull()
        expect(s.tone, name).toBeNull()
        expect(s.detail, name).toBeNull()
      }
      expect(steps.at(-1)?.label, name).toBe('Outcome')
    }
  })

  it('gives up the middle for room, keeping the ends and the step on screen', () => {
    const run = RUNS.find((r) => r.plan.rules.length >= 3) ?? RUNS[0]
    const beats = storyOf(run.plan)
    const timeline = beats.map((b, i) => ({ beat: b, at: i, dur: 1 }))
    const last = timeline.length - 1
    const steps = trailOf(timeline, run.plan, { person: run.person, at: last, reached: last, p: run.plan.steps.length - 1, landed: true })
    const items = elideTrail(steps, 3)
    const kept = items.flatMap((i) => (i.gap ? [] : [i.step]))
    expect(kept[0]?.kind).toBe('sign')
    expect(kept.at(-1)?.kind).toBe('outcome')
    expect(kept.some((s) => s.current)).toBe(true)
    if (steps.length > 3) expect(items.some((i) => i.gap)).toBe(true)
    expect(elideTrail(steps, 99).every((i) => !i.gap)).toBe(true)
  })
})
