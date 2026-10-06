import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { factsOf, type SignInForm } from '../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import { answer, type AskProps } from './assistant/intents'
import { fieldOfCategory, focusedTargets, litOf, NOTHING_LIT, targetsOf } from './jarvis1-lit'

/* -----------------------------------------------------------------------------
   What the Jarvis HUD lights for the shared assistant's answers
   (jarvis1-lit.ts), over REAL runs of the showcase tenant built as the page
   builds them: every lit id is a real piece of the HUD (a policy's node, a
   rule's node, the verdict), a why lights the decider and the deciding rule
   and pulses the route, "why not rule 1?" opens rule 1 (and not rule 2), a
   Depends rings its unknown fact amber, a hovered citation lights only itself.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }

function runOf(personName: string, appName: string, patch: Partial<SignInForm> = {}): { plan: EngineRun; props: AskProps } {
  const person = t.directory.people.find((p) => p.name === personName)
  const app = t.apps.find((a) => a.name === appName)
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(t.policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: person.id, appId: app.id }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...patch } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const res = runColumns([AS_IT_STANDS], t.policies, facts, env)[0].resolution
  const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
  const screens = screensOf(res, { policies: t.policies, methods: t.methods, defaultMethodId: undefined, person })
  const noop = () => {}
  return { plan, props: { asGroup: null, screens, form, rows, onAsGroup: noop, onAdd: noop, onOpenRule: noop, onOpenPolicy: noop, onRunWith: noop, onReplay: noop, onPressPerson: noop } }
}

const C = runOf('Maya Iyer', 'AWS Console')
const DEP = runOf('Maya Iyer', 'AWS Console', { device: { kind: 'none' } } as Partial<SignInForm>)

/** Every id the HUD can light on this plan. */
const hudIds = (plan: EngineRun) => new Set<string>(['outcome', ...plan.policies.map((p) => p.node), ...plan.rules.map((r) => r.node)])

describe('jarvis1-lit: what an answer lights on the HUD', () => {
  it('lights nothing with no answer and no citation', () => {
    expect(litOf(null, null, C.plan)).toBe(NOTHING_LIT)
  })

  it('maps each check category onto the sign-in row', () => {
    expect(fieldOfCategory('who')).toBe('person')
    expect(fieldOfCategory('network')).toBe('address')
    expect(fieldOfCategory('place')).toBe('address')
    expect(fieldOfCategory('place', true)).toBe('place')
    expect(fieldOfCategory('device')).toBe('device')
    expect(fieldOfCategory('time')).toBe('when')
    expect(fieldOfCategory('risk')).toBe('risk')
  })

  it('a why lights the decider, its deciding rule and the verdict, closes the reticle again and pulses the route', () => {
    const a = answer('why allowed?', C.plan, C.props)
    const lit = litOf(a, null, C.plan)
    const decider = C.plan.policies.find((p) => p.decides)
    const landing = C.plan.landing !== null ? C.plan.rules[C.plan.landing] : undefined
    expect(decider && landing).toBeTruthy()
    expect(lit.ids.has(decider!.node)).toBe(true)
    expect(lit.ids.has(landing!.node)).toBe(true)
    expect(lit.relock).toBe(decider!.node)
    expect(lit.wire).toBe(true)
    for (const id of lit.ids) expect(hudIds(C.plan).has(id)).toBe(true)
    /* Its checks, by `${ruleId}:${category}`, each a real check of the deciding rule. */
    for (const k of lit.checks) expect(landing!.checks.some((c) => `${landing!.id}:${c.category}` === k)).toBe(true)
  })

  it('"why not rule 1?" opens rule 1 and lights its failing check, not the rule it reads on to', () => {
    const r1 = C.plan.rules[0]
    const a = answer('why not rule 1?', C.plan, C.props)
    expect(a.kind).toBe('why-rule')
    const lit = litOf(a, null, C.plan)
    expect(lit.ids.has(r1.node)).toBe(true)
    expect(lit.open.has(r1.node)).toBe(true)
    expect([...lit.checks].every((k) => k.startsWith(`${r1.id}:`))).toBe(true)
    const landing = C.plan.rules[C.plan.landing ?? -1]
    expect(lit.ids.has(landing.node)).toBe(false)
    expect(lit.wire).toBe(false)
  })

  it('"who else covers her?" lights the other covering policy, not the decider', () => {
    const a = answer('who else covers Maya?', C.plan, C.props)
    expect(a.kind).toBe('others')
    const lit = litOf(a, null, C.plan)
    const decider = C.plan.policies.find((p) => p.decides)!
    const other = C.plan.policies.find((p) => !p.decides && (C.plan.conflicts?.policies ?? []).some((x) => x.policyId === p.policyId))
    expect(other).toBeTruthy()
    expect(lit.ids.has(other!.node)).toBe(true)
    expect(lit.ids.has(decider.node)).toBe(false)
  })

  it('a Depends rings its unknown fact amber and lights the checks that could not tell', () => {
    expect(DEP.plan.outcome.status).toBe('depends')
    const a = answer('what does it depend on?', DEP.plan, DEP.props)
    expect(a.kind).toBe('depends')
    const lit = litOf(a, null, DEP.plan)
    expect(lit.warn).toContain('device')
    expect(lit.checks.size).toBeGreaterThan(0)
    for (const k of lit.checks) {
      const [ruleId, cat] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)]
      const c = DEP.plan.rules.find((r) => r.id === ruleId)?.checks.find((x) => x.category === cat)
      expect(c?.status).toBe('unknown')
    }
    expect(lit.rowLit).not.toBe('device')
  })

  it('"what will she see?" opens What they see; a checks answer shows every check', () => {
    expect(litOf(answer('what will Maya see?', C.plan, C.props), null, C.plan).see).toBe(true)
    expect(litOf(answer('show every check', C.plan, C.props), null, C.plan).all).toBe(true)
  })

  it('a citation hovered lights only itself, and a cited check rings its fact', () => {
    const landing = C.plan.rules[C.plan.landing ?? -1]
    const dev = landing.checks.find((c) => c.category === 'device')!
    const lit = litOf(null, `check:${landing.id}:${dev.category}`, C.plan)
    expect([...lit.ids]).toEqual([landing.node])
    expect([...lit.checks]).toEqual([`${landing.id}:device`])
    expect(lit.rowLit).toBe('device')
    expect(lit.wire).toBe(false)
    expect(litOf(null, 'person', C.plan).rowLit).toBe('person')
  })

  it('names every target an answer cites, focus first, once each', () => {
    const a = answer('why allowed?', C.plan, C.props)
    const ts = targetsOf(a)
    expect(new Set(ts).size).toBe(ts.length)
    if (a.focus) expect(ts[0]).toBe(a.focus)
    expect(focusedTargets(a)).toEqual(ts)
  })
})
