import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { factsOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import { arcChars, geometry, lockAngle, rails, segments, wedgeBox, type WedgeId } from './jarvis2-geometry'
import { fold, isFold, jarvisModel, type JvContext } from './jarvis2-model'

/* -----------------------------------------------------------------------------
   Jarvis v3, the reactor (jarvis-model.ts, jarvis-geometry.ts): the rings lock
   the answer under the pointer, every readout is a fact of the run, and the
   HUD lays out at zoom 1 on a 1440 × 900 and a 1280 × 800 page.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const LIVE: ColumnSpec = { id: 'live', label: 'live', tip: '' }

function planOf(person: string, app: string, patch: Partial<SignInForm> = {}): EngineRun {
  const pid = t.directory.people.find((p) => p.name === person)?.id ?? ''
  const aid = t.apps.find((a) => a.name === app)?.id ?? ''
  const rows0 = rowsRead(t.policies, null, aid, lib)
  const form = { ...forRun(withDefaults({ ...emptyDraft(TODAY, '09:30'), personId: pid, appId: aid }, rows0, [], TODAY, '09:30'), rows0), ...patch } as SignInForm
  const rows = rowsRead(t.policies, null, form.appId, lib)
  const { facts } = factsOf(form, t.zones)
  const res = runColumns([LIVE], t.policies, facts, env)[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  return engineRun({ res, policies: t.policies, form, facts, env, ctx, intro: 'collapse' })
}

const ctxOf = (first: string, groups: string[], facts: JvContext['facts'] = [], factors: string[] = ['Password']): JvContext => ({ first, groups, facts, factors })
const FACTS: JvContext['facts'] = [
  { token: 'from', field: 'address', label: 'Network', value: 'Office network', unset: false },
  { token: 'device', field: 'device', label: 'Device', value: 'Windows 11 laptop · registered', unset: false },
]
const settled = (p: EngineRun) => p.steps.length - 1

describe('the reactor locks the answer under the pointer', () => {
  it('Maya on AWS Console: P1 decides, rule 2 matches, rule 1 failed on Who, Finance also covers her', () => {
    const p = planOf('Maya Iyer', 'AWS Console')
    const m = jarvisModel(p, settled(p), ctxOf('Maya', ['Engineering', 'Finance'], FACTS))
    expect(m.landed).toBe(true)
    expect(m.policies.focus).toBe(0)
    expect(m.policies.locked).toBe(true)
    expect(m.policies.segs.map((x) => x.tone)).toEqual(['ok', 'warn', 'idle', 'idle'])
    expect(m.rules.focus).toBe(1)
    expect(m.rules.segs.map((x) => x.tone)).toEqual(['bad', 'ok', 'idle', 'idle'])
    expect(m.rules.segs[0].label).toBe('R1 ✕ WHO')
    expect(m.rules.segs[1].label).toBe('R2 ✓ MATCH')
    expect(m.checks.rule).toBe(1)
    expect(m.checks.segs.map((x) => x.tone)).toEqual(['ok', 'ok'])
    expect(m.core).toMatchObject({ tone: 'ok', word: 'ALLOW', sub: '1 factor', cells: 1 })
    expect(m.readouts.map((r) => `${r.value} ${r.sub}`.trim())).toEqual(['1 of 4', '2 of 4', '3', 'ALLOW'])
    expect(m.conds.map((c) => c.status)).toEqual(['Not checked', 'Passes rule 2'])
    expect(m.groups.map((g) => g.tone)).toEqual(['ok', 'warn'])
    expect(m.polRows[0].line).toBe('Covers via Engineering · decides')
    expect(m.polRows[1].line).toBe('Also covers Maya, via Finance · not used')
    expect(m.ruleRows[1].open).toBe(true)
    expect(m.ruleRows[1].then?.text).toBe('Allow on 1 factor')
  })

  it('Ravi on AWS Console: no policy covers him, the Global Default locks at the pointer', () => {
    const p = planOf('Ravi Menon', 'AWS Console')
    const m = jarvisModel(p, settled(p), ctxOf('Ravi', ['IT Admins'], FACTS))
    expect(m.policies.focus).toBe(3)
    expect(lockAngle(m.policies.focus, 4)).toBe(-270)
    expect(m.policies.segs.map((x) => x.tone)).toEqual(['miss', 'miss', 'miss', 'ok'])
    expect(m.policies.segs[0].label.startsWith('P1 ✕')).toBe(true)
    expect(m.polRows[0].line).toBe("Doesn't cover Ravi")
    expect(m.polRows[3].line).toBe('No policy above covers · decides')
    expect(m.readouts[0].value).toBe('4')
  })

  it('Devon from home: a deny rule matched — red, and the core says which rule', () => {
    const p = planOf('Devon Rao', 'AWS Console', originPatch('home'))
    const m = jarvisModel(p, settled(p), ctxOf('Devon', ['Contractors'], FACTS, []))
    expect(m.verdict).toBe('bad')
    expect(m.core).toMatchObject({ tone: 'bad', word: 'DENY', sub: 'Rule 1 matched' })
    expect(m.rules.segs[0].tone).toBe('bad')
    expect(m.readouts[3]).toMatchObject({ value: 'DENY', tone: 'bad' })
  })

  it('Arun with the device not stated: it depends — amber, dashed, and the fact offers Add', () => {
    const p = planOf('Arun Patel', 'GitHub Enterprise', { device: { kind: 'none' } } as Partial<SignInForm>)
    const facts: JvContext['facts'] = [FACTS[0], { token: 'device', field: 'device', label: 'Device', value: 'Not stated', unset: true }]
    const m = jarvisModel(p, settled(p), ctxOf('Arun', ['Engineering'], facts, []))
    expect(m.verdict).toBe('warn')
    expect(m.core).toMatchObject({ tone: 'warn', word: 'DEPENDS', sub: 'Device not stated' })
    expect(m.rules.focus).toBe(0)
    expect(m.rules.segs[0]).toMatchObject({ tone: 'warn', dashed: true })
    expect(m.rules.segs[3].label).toBe('LAST IF NOT')
    expect(m.checks.segs[m.checks.focus ?? -1]?.dashed).toBe(true)
    expect(m.conds[1]).toMatchObject({ add: true, tone: 'warn' })
  })

  it('while it runs, each ring turns one way only — a combination dial — and nothing is decided early', () => {
    for (const [who, app] of [
      ['Maya Iyer', 'AWS Console'],
      ['Ravi Menon', 'AWS Console'],
      ['Arun Patel', 'GitHub Enterprise'],
    ] as const) {
      const p = planOf(who, app)
      let lastPol = 0
      let lastRule = 0
      for (let s = 0; s < p.at.outcome; s++) {
        const m = jarvisModel(p, s, ctxOf('X', [], FACTS))
        expect(m.landed, `${who} s=${s}`).toBe(false)
        expect(m.core.tone).toBe('work')
        expect(m.readouts[3].value).toBe('—')
        const a = lockAngle(m.policies.focus, m.policies.segs.length)
        const b = lockAngle(m.rules.focus, m.rules.segs.length)
        expect(a).toBeLessThanOrEqual(lastPol)
        if (m.rules.shown) expect(b).toBeLessThanOrEqual(lastRule)
        lastPol = a
        if (m.rules.shown) lastRule = b
      }
    }
  })

  it('the find lap: only the find step draws the policies behind the satellite', () => {
    const p = planOf('Maya Iyer', 'AWS Console')
    const at = p.at.which
    expect(jarvisModel(p, at, ctxOf('Maya', [])).finding).toBe(true)
    expect(jarvisModel(p, at + 1, ctxOf('Maya', [])).finding).toBe(false)
    expect(jarvisModel(p, at - 1, ctxOf('Maya', [])).policies.segs.every((x) => x.tone === 'ghost')).toBe(true)
  })
})

describe('eight policies and ten rules (stress, invented names: geometry only)', () => {
  const base = planOf('Maya Iyer', 'AWS Console')
  const long = 'An invented policy name that is well past forty characters long'
  const plan: EngineRun = {
    ...base,
    policies: Array.from({ length: 8 }, (_, i) => ({ ...base.policies[Math.min(i, base.policies.length - 1)], policyId: `p${i}`, node: `policy:p${i}` as const, order: i + 1, name: `${long} ${i + 1}`, decides: i === 0 })),
    rules: [...Array.from({ length: 9 }, (_, i) => ({ ...base.rules[Math.min(i, 2)], id: `r${i}`, node: `rule:r${i}` as const, index: i, name: `${long} rule ${i + 1}` })), { ...base.rules[3], id: 'fallback', node: 'rule:fallback' as const }],
  }
  it('the rings carry numbers only, and the lists fold what was never reached', () => {
    const m = jarvisModel(plan, settled(plan), ctxOf('Maya', [], FACTS))
    expect(m.policies.segs.every((x) => /^P\d+( [✕!])?$/.test(x.label))).toBe(true)
    expect(m.rules.segs.every((x) => /^(R\d+|LAST)( [✓✕?!])?$/.test(x.label))).toBe(true)
    const folded = fold(m.polRows, (r) => r.tone !== 'idle', (r) => r.n)
    expect(folded.length).toBeLessThan(8)
    expect(folded.some((x) => isFold(x) && x.items.length >= 5)).toBe(true)
  })
})

describe('the geometry lays the HUD out at zoom 1', () => {
  it('1376 × 800 (a 1440 × 900 page) and 1216 × 700 (1280 × 800)', () => {
    const big = geometry(1376, 800)
    expect(big).toMatchObject({ K: 1, compact: false, CX: 688, CY: 354 })
    const small = geometry(1216, 700)
    expect(small.compact).toBe(true)
    expect(small.K).toBeCloseTo(0.9, 5)
    for (const g of [big, small]) {
      const ids: WedgeId[] = ['who', 'policies', 'decision', 'rules']
      for (const id of ids) {
        const b = wedgeBox(g, id)
        /* Every wedge's copy stays clear of the ring and inside the canvas, above the deck. */
        expect(b.left).toBeGreaterThanOrEqual(30)
        expect(b.left + b.width).toBeLessThanOrEqual(g.W - 30)
        expect(b.left + b.width <= g.CX - g.RW || b.left >= g.CX + g.RW).toBe(true)
        expect(b.top + b.height).toBeLessThanOrEqual(g.deck.say)
        expect(b.width).toBeGreaterThan(300)
      }
      for (const [a0, a1] of Object.values(rails(g))) expect(a1).toBeGreaterThan(a0)
      /* The compass sits under the page's pill and above the tick ring. */
      expect(g.CY - g.RC).toBeGreaterThan(g.readTop + g.readH)
    }
  })

  it('segments are centred so the lock turns segment i under 12 o’clock', () => {
    const s = segments(4)
    expect(s.map((x) => x.mid)).toEqual([0, 90, 180, 270])
    expect(lockAngle(2, 4)).toBe(-180)
    expect(arcChars(201, -43.4, 43.4)).toBeGreaterThan(30)
    expect(arcChars(201, -20, 20)).toBeLessThan(18)
  })
})
