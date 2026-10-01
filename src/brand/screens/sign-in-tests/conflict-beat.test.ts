import { describe, expect, it } from 'vitest'

import { leaves } from '../../predicate'
import { showcaseTenant, type Tenant } from '../../fixtures'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { rowsRead } from '../testing/rows-read'
import { factsOf, formOf, type SignInForm } from '../testing/sign-in-form'
import { CONFLICT_MS, conflictText, engineRun, timeline, type EngineRun } from './engine-run'
import { alsoMarks } from './journey'

/* -----------------------------------------------------------------------------
   The conflict, as the run plays it (TESTING-V4 §13.2; owner, 30 Sep: "the
   user can't trace the whole process with their eyes"). Maya Iyer is in
   Engineering and Finance: on GitHub rule 1 decides through Engineering, and
   rule 3 would also apply through Finance, with 2FA. The engine names that
   as it decides — a step of its own, in the notice tone, held long enough to
   be read at any pace — and the rule's card marks the rows that held, from
   the resolver's own trace, though the engine never read it.
   -------------------------------------------------------------------------- */

function run(t: Tenant, f: SignInForm): EngineRun {
  const env = envOf(t)
  const { facts } = factsOf(f, t.zones)
  const res = resolveSignIn(t.policies, facts, env)
  const rows = rowsRead(t.policies, null, f.appId, { zones: t.zones, fingerprints: t.fingerprints })
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  return engineRun({ res, policies: t.policies, form: f, facts, env, ctx, intro: 'none' })
}

const saved = (t: Tenant, id: string) => formOf(t.savedSignIns.find((s) => s.id === id)!.facts, t.zones)

describe('the conflict beat', () => {
  const t = showcaseTenant()
  const maya = saved(t, 'ssi-maya-github')

  it('is named as the engine decides: the rule, the person and the group, in the notice tone', () => {
    const r = run(t, maya)
    const deciding = r.steps[r.at.outcome - 1]
    expect(deciding).toMatchObject({ kind: 'deciding', stage: 'Deciding', text: 'Rule 3 also applies to Maya Iyer · via Finance', notice: true })
    expect(conflictText(3, 'Maya Iyer', 'via Finance')).toBe('Rule 3 also applies to Maya Iyer · via Finance')
    expect(conflictText(2, '', '')).toBe('Rule 2 also applies')
  })

  it('holds at least CONFLICT_MS at every pace, before the answer', () => {
    const r = run(t, maya)
    const k = r.at.outcome - 1
    expect(CONFLICT_MS).toBeGreaterThanOrEqual(1500)
    for (const pace of ['full', 'edit'] as const) expect(timeline(r.steps, pace).dur[k]).toBe(CONFLICT_MS)
  })

  it('a run with no conflict keeps its quiet deciding step', () => {
    /* Arun, in Engineering alone, in the same office on the same laptop: rule 1 decides, and nothing else applies differently. */
    const r = run(t, { ...maya, personId: 'arun' })
    expect(r.empty).toBe(false)
    expect(r.landing).toBe(0)
    const deciding = r.steps.find((s) => s.kind === 'deciding')
    expect(deciding).toMatchObject({ text: 'Rule 1 matches' })
    expect(deciding?.notice).toBeUndefined()
    expect(r.conflicts?.conflicts).toEqual([])
    expect(r.rules.some((x) => x.alsoChecks)).toBe(false)
  })

  it('the conflicting rule carries its traced rows, and its card marks the ones that held', () => {
    const r = run(t, maya)
    const dev = t.policies.find((p) => p.id === 'sc-dev-tools')!
    const rule3 = r.rules[2]
    expect(rule3.state).toBe('not-reached')
    expect(rule3.checks).toEqual([])
    expect(rule3.alsoChecks?.map((c) => [c.category, c.status])).toEqual([
      ['who', 'pass'],
      ['device', 'pass'],
    ])
    const marks = alsoMarks(rule3, leaves(dev.rules[2].when).map((c) => c.id))
    expect(marks.who).toEqual({ status: 'pass', working: false })
    expect(Object.values(marks.conds)).toEqual([{ status: 'pass', working: false }])
    expect(marks.skipped).toEqual([])
    /* Only the conflict carries them. */
    expect(r.rules.filter((x) => x.alsoChecks).map((x) => x.index)).toEqual([2])
  })
})
