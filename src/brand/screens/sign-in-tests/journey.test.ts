import { describe, expect, it } from 'vitest'

import { showcaseTenant, showcaseTenantHrmsOn, type Tenant } from '../../fixtures'
import { envOf, resolveSignIn } from '../tenant-resolver'
import { defaultForm, factsOf, originPatch, type SignInForm } from '../testing/sign-in-form'
import {
  LAST_ROW_NODE,
  NO_PADS,
  alignPads,
  journeyOf,
  journeyWires,
  padsEqual,
  reachedAt,
  roundedPath,
  travelPlan,
  type Box,
  type Boxes,
  type Journey,
  type Route,
} from './journey'

/* The journey canvas's model, on the showcase tenant the console opens on:
   which policies stand in the Which policy column and what each says, the
   deciding policy's rules as the board's cards say them, the answer, and
   the route the marker takes — then the geometry the canvas draws from. */

const TODAY = '2026-09-28'

function journey(t: Tenant, patch: Partial<SignInForm> = {}): Journey {
  const env = envOf(t)
  const form = { ...defaultForm(t.directory.people, t.apps, TODAY), ...patch }
  const { facts } = factsOf(form, t.zones)
  return journeyOf(resolveSignIn(t.policies, facts, env), t.policies, form.appId, env, facts)
}

const engineer = (t: Tenant) => t.directory.people.find((u) => u.groupId === 'engineering')!

describe('journeyOf — who decides', () => {
  it('opens on Kavya on HRMS: the HRMS policy is off, so the Global Default decides, last in the column', () => {
    const j = journey(showcaseTenant())
    expect(j.signIn.empty).toBe(false)
    expect(j.signIn.person).toEqual({ id: 'u-hr-1', name: 'Kavya Menon', group: 'Human Resources' })
    expect(j.signIn.app).toEqual({ id: 'hrms', name: 'HRMS' })
    expect(j.which.map((w) => [w.name, w.kind, w.reason])).toEqual([
      ['HRMS access from corporate offices', 'waiting', 'Switched off'],
      ['Global Default Policy', 'decides', ''],
    ])
    expect(j.which[1]).toMatchObject({ decides: true, isGlobalDefault: true, status: 'always-on', tip: 'Decides this sign-in' })
    expect(j.policy).toEqual({ id: 'global-default', name: 'Global Default Policy', isGlobalDefault: true })
    expect(j.outcome).toMatchObject({ status: 'decided', decision: '1fa', ruleLine: 'Rule 1 · Baseline access', why: 'Decided by Global Default Policy · Rule 1 · Baseline access' })
    expect(j.outcome.view.line).toBe('Global Default Policy · Rule 1 · Baseline access')
  })

  it('with the HRMS policy on, it decides by rule 1 and the Global Default is checked after it', () => {
    const j = journey(showcaseTenantHrmsOn())
    expect(j.which.map((w) => [w.name, w.kind, w.reason])).toEqual([
      ['HRMS access from corporate offices', 'decides', ''],
      ['Global Default Policy', 'lost', 'Checked after HRMS access from corporate offices'],
    ])
    expect(j.which[1].tip).toBe('An app policy applies')
    expect(j.outcome).toMatchObject({ decision: '2fa', why: 'Decided by HRMS access from corporate offices · Rule 1 · In a corporate office' })
  })

  it('a person outside the audience is "Not in this policy", and falls through to the Global Default', () => {
    const j = journey(showcaseTenantHrmsOn(), { personId: 'u-sales-1' })
    const hrms = j.which.find((w) => w.policyId === 'sc-hrms-office')!
    expect(hrms).toMatchObject({ kind: 'lost', reason: 'Not in this policy', decides: false })
    expect(hrms.tip).toMatch(/^Not in audience: Human Resources, Finance/)
    expect(j.policy?.id).toBe('global-default')
  })

  it('no person or no application: the first node and nothing else', () => {
    for (const patch of [{ personId: null }, { appId: null }] as Partial<SignInForm>[]) {
      const j = journey(showcaseTenant(), patch)
      expect(j.signIn.empty).toBe(true)
      expect(j.which).toEqual([])
      expect(j.rules).toEqual([])
      expect(j.path).toEqual(['sign-in'])
      expect(j.landing).toBeNull()
      expect(j.outcome.status).toBe('incomplete')
    }
    expect(journey(showcaseTenant(), { personId: null }).outcome.why).toBe('Choose a person')
  })
})

describe('journeyOf — the rules and the route', () => {
  it('the matched rule is lit, carries its checks as pills, and the route stops on it', () => {
    const j = journey(showcaseTenantHrmsOn())
    const [r1] = j.rules
    expect(r1).toMatchObject({ index: 0, name: 'In a corporate office', state: 'pass', tone: 'lit', outcome: '2fa', word: null })
    expect(r1.pills.map((p) => [p.category, p.text, p.status])).toEqual([
      ['who', 'Human Resources, Finance', 'pass'],
      ['network', 'Corporate offices · IP', 'pass'],
      ['place', 'Corporate offices · Location', 'pass'],
    ])
    expect(j.lastRow).toMatchObject({ index: null, name: 'Nothing else matched', state: 'not-reached', tone: 'dim', outcome: 'deny', word: 'Not reached' })
    expect(j.landing).toBe(r1.node)
    expect(j.landingUnknown).toBe(false)
    expect(j.path).toEqual(['sign-in', 'policy:sc-hrms-office', r1.node, 'outcome', 'see'])
  })

  it('from home the rule fails on the network and the last row refuses, passing rule 1 on the way down', () => {
    const j = journey(showcaseTenantHrmsOn(), originPatch('home'))
    expect(j.rules[0]).toMatchObject({ state: 'fail', tone: 'missed', word: 'No match' })
    expect(j.rules[0].pills.some((p) => p.status === 'fail')).toBe(true)
    expect(j.lastRow).toMatchObject({ state: 'pass', tone: 'lit', word: null })
    expect(j.landing).toBe(LAST_ROW_NODE)
    expect(j.path).toEqual(['sign-in', 'policy:sc-hrms-office', 'rule:' + j.rules[0].id, LAST_ROW_NODE, 'outcome', 'see'])
    expect(j.outcome).toMatchObject({ decision: 'deny', ruleLine: 'Nothing else matched' })
  })

  it('a sign-in that cannot be told stops unsure on the first rule that might match, and names what it needs', () => {
    const t = showcaseTenant()
    const j = journey(t, { personId: engineer(t).id, appId: 'github', device: { kind: 'none' } })
    expect(j.policy?.id).toBe('sc-dev-tools')
    expect(j.outcome.status).toBe('depends')
    expect(j.landingUnknown).toBe(true)
    expect(j.landing).toBe(j.rules[0].node)
    expect(j.rules[0]).toMatchObject({ state: 'unknown', tone: 'missed', word: "Can't tell" })
    expect(j.outcome.view.outcomes.map((o) => o.label)).toEqual(['If rule 1 matches', 'If rule 2 matches', 'If not'])
    expect(j.outcome.view.needs).toEqual(['Device'])
    expect(j.outcome.why).toBe('Decided by Developer tools — office and device checks · Needs: Device')
  })

  it('never re-decides: the outcome is the resolver’s, word for word', () => {
    const t = showcaseTenantHrmsOn()
    const env = envOf(t)
    const form = defaultForm(t.directory.people, t.apps, TODAY)
    const { facts } = factsOf(form, t.zones)
    const res = resolveSignIn(t.policies, facts, env)
    const j = journeyOf(res, t.policies, form.appId, env, facts)
    expect(j.outcome.decision).toBe(res.decision)
    expect(j.outcome.policyId).toBe(res.decidedBy?.policyId)
    expect(j.outcome.possible).toEqual(res.possible.map((o) => o.decision))
  })
})

// --- Geometry -------------------------------------------------------------------------

describe('roundedPath', () => {
  it('a straight run is one line, and its stops are where they lie', () => {
    const p = roundedPath([
      { x: 0, y: 10 },
      { x: 40, y: 10 },
      { x: 100, y: 10 },
    ])
    expect(p.d).toBe('M0 10 L40 10 L100 10')
    expect(p.at).toEqual([0, 40, 100])
    expect(p.length).toBe(100)
  })

  it('rounds a corner no wider than half the shorter leg, and repeated points are kept as stops', () => {
    const p = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 8 },
        { x: 50, y: 8 },
        { x: 100, y: 8 },
      ],
      12,
    )
    expect(p.d).toContain('Q50 0')
    expect(p.d).toContain('Q50 8')
    expect(p.at).toHaveLength(5)
    expect(p.at[2]).toBe(p.at[3])
    /* Two 4 px corners cut 16 px of legs and add about 13 px of curve. */
    expect(p.length).toBeGreaterThan(104)
    expect(p.length).toBeLessThan(108)
    expect(p.at.every((a, i) => i === 0 || a >= p.at[i - 1])).toBe(true)
  })
})

/* A journey laid out the way the canvas lays it out: sign-in at the left, two
   policies, two rules and the last row, the outcome. */
function laid(j: Pick<Journey, 'which' | 'rules' | 'lastRow' | 'path' | 'landing'>, over: Boxes = {}): Boxes {
  const col = (x: number, y: number, w = 200, h = 40): Box => ({ x, y, w, h })
  const out: Boxes = { 'sign-in': col(0, 40, 180, 120), outcome: col(1000, 60, 220, 120), see: col(1280, 40, 260, 300) }
  j.which.forEach((w, i) => (out[w.node] = col(240, 40 + i * 56, 220, 48)))
  ;[...j.rules, ...(j.lastRow ? [j.lastRow] : [])].forEach((r, i) => (out[r.node] = col(520, 40 + i * 96, 300, 80)))
  return { ...out, ...over }
}

describe('alignPads', () => {
  it('levels the sign-in and the first rule with the policy that decides, and the outcome with the rule it stopped at', () => {
    const j = journey(showcaseTenantHrmsOn(), originPatch('home'))
    const boxes = laid(j)
    const pads = alignPads(boxes, NO_PADS, j, true)
    const row = boxes['policy:sc-hrms-office']!
    const rowMid = row.y + row.h / 2
    expect(pads['sign-in']).toBe(Math.max(0, Math.round(rowMid - (40 + 60))))
    expect(pads.rules).toBe(Math.max(0, Math.round(rowMid - (40 + 40))))
    const land = boxes[LAST_ROW_NODE]!
    expect(pads.outcome).toBe(Math.round(land.y + land.h / 2 - (60 + 60)))
    expect(pads.which).toBe(0)
  })

  it('never pulls a column up past its heading, and settles: aligned boxes ask for nothing more', () => {
    const j = journey(showcaseTenantHrmsOn())
    const boxes = laid(j, { 'sign-in': { x: 0, y: 400, w: 180, h: 120 } })
    expect(alignPads(boxes, NO_PADS, j, true)['sign-in']).toBe(0)
    const once = alignPads(laid(j), NO_PADS, j, true)
    expect(padsEqual(once, once)).toBe(true)
  })

  it('nothing to align to with no policy deciding', () => {
    const j = journey(showcaseTenant(), { personId: null })
    expect(alignPads(laid(j), { ...NO_PADS, rules: 30 }, j, true)).toEqual(NO_PADS)
  })
})

describe('journeyWires', () => {
  it('fans the sign-in out to every policy on the application, lit to the one that decides', () => {
    const j = journey(showcaseTenantHrmsOn())
    const w = journeyWires(laid(j), j, true)
    const fans = w.wires.filter((x) => x.id.startsWith('fan:'))
    expect(fans.map((f) => [f.id, f.lit])).toEqual([
      ['fan:sc-hrms-office', true],
      ['fan:global-default', false],
    ])
    expect(w.wires.find((x) => x.id === 'trunk')?.lit).toBe(false)
    expect(w.wires.filter((x) => x.id.startsWith('stub:')).map((s) => s.lit)).toEqual([true, false])
    expect(w.wires.some((x) => x.id === 'out' && x.lit)).toBe(true)
    expect(w.wires.some((x) => x.id === 'see')).toBe(true)
  })

  it('the route runs through every node on the path, in order, ending at the outcome’s edge', () => {
    const j = journey(showcaseTenantHrmsOn(), originPatch('home'))
    const { route } = journeyWires(laid(j), j, true)
    expect(route).not.toBeNull()
    expect(route!.stops.map((s) => s.node)).toEqual(j.path.filter((n) => n !== 'see'))
    const at = route!.stops.map((s) => s.at)
    expect(at.every((a, i) => i === 0 || a > at[i - 1])).toBe(true)
    expect(at[at.length - 1]).toBeCloseTo(route!.length, 0)
  })

  it('draws no route and no What they see line when nothing decides, or when What they see sits under the outcome', () => {
    const empty = journey(showcaseTenant(), { personId: null })
    expect(journeyWires(laid(empty), empty, true)).toEqual({ wires: [], route: null })
    const j = journey(showcaseTenantHrmsOn())
    expect(journeyWires(laid(j), j, false).wires.some((x) => x.id === 'see')).toBe(false)
  })
})

describe('travelPlan', () => {
  const route: Route = {
    d: '',
    length: 1000,
    stops: [
      { node: 'sign-in', at: 0 },
      { node: 'policy:p', at: 200 },
      { node: 'rule:a', at: 500 },
      { node: 'rule:b', at: 700 },
      { node: 'outcome', at: 1000 },
    ],
  }

  it('about 1.4 s: a least hop, the rest by length, a breath at the policy and at the rule it stops on', () => {
    const p = travelPlan(route, 'rule:b')
    expect(p.total).toBe(1150 + 240)
    expect(p.frames).toEqual([0, 0.2, 0.2, 0.5, 0.7, 0.7, 1])
    expect(p.times[0]).toBe(0)
    expect(p.times[p.times.length - 1]).toBe(1)
    expect(p.times.every((t, i) => i === 0 || t >= p.times[i - 1])).toBe(true)
    expect(p.arrive.map((a) => a.node)).toEqual(['sign-in', 'policy:p', 'rule:a', 'rule:b', 'outcome', 'see'])
    /* Four hops of at least 140 ms; the other 590 ms by length. */
    expect(p.arrive[1].ms).toBe(Math.round(140 + 0.2 * 590))
    expect(p.arrive[2].ms).toBe(Math.round(140 + 0.2 * 590 + 120 + 140 + 0.3 * 590))
    expect(p.arrive[5].ms).toBeGreaterThan(p.total)
  })

  it('what the marker has reached at a moment', () => {
    const p = travelPlan(route, 'rule:b')
    expect(reachedAt(p, -1)).toBe(-1)
    expect(reachedAt(p, 0)).toBe(0)
    expect(reachedAt(p, 260)).toBe(1)
    expect(reachedAt(p, 10_000)).toBe(5)
  })
})
