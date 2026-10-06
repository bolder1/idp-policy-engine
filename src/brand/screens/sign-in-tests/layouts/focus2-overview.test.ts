import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { factsOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { engineRun, type EngineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import { landedAt } from './focus-model'
import { checksRuleOf } from './focus2-faq'
import { storyOf } from './focus2-pace'
import { cardsOf } from './focus2-story'
import { MAX_SIDE, MAP_EDGE, STATION_GAP, STATION_MAX, STATION_MIN, capSide, lineAt, overlaps, overviewPlaces, routeOf, rowLabel, stationWidth, type ColumnItem, type RouteRow } from './focus2-overview'
import layoutRaw from './Focus2Layout.tsx?raw'

/* -----------------------------------------------------------------------------
   THE ROUTE MAP (focus2-overview.ts), kept behind Focus2Layout's ROUTE_MAP since
   the owner's 5 Oct 2026 ruling ("change the horizontal mode the same as the
   vertical mode … just 4 simple cards will be enough"): Horizontal is the chain
   laid across now, and focus2-layout.test.tsx pins that nothing of the route is
   drawn. The module stays, so that `true` brings the route back as it was, and
   these keep its pure functions honest while it waits — over real runs of the
   showcase tenant: the columns in the engine's order with the selected item on
   the line, nothing overlapping, the room fitted, the fold of a long side.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }

function planOf(personName: string | null, appName: string | null, patch: Partial<SignInForm> = {}): EngineRun {
  const person = personName === null ? null : (t.directory.people.find((p) => p.name === personName) ?? null)
  const app = appName === null ? null : (t.apps.find((a) => a.name === appName) ?? null)
  const rows = rowsRead(t.policies, null, app?.id ?? null, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), personId: person?.id ?? null, appId: app?.id ?? null }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...patch } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const res = runColumns([AS_IT_STANDS], t.policies, facts, env)[0].resolution
  return engineRun({ res, policies: t.policies, form, facts, env, ctx: { people: t.directory.people, apps: t.apps, zones: t.zones, rows }, intro: 'none' })
}

const MAYA = planOf('Maya Iyer', 'AWS Console')
const LEO_HOME = planOf('Leo Fernandes', 'AWS Console', originPatch('home'))
const ARUN_NO_DEVICE = planOf('Arun Patel', 'GitHub Enterprise', { device: { kind: 'none' } } as Partial<SignInForm>)
const RUNS = [
  { name: 'Maya on AWS (Allow)', plan: MAYA },
  { name: 'Leo from home on AWS (Deny)', plan: LEO_HOME },
  { name: 'Arun with no device (Depends)', plan: ARUN_NO_DEVICE },
]
const cardsOfPlan = (plan: EngineRun) => cardsOf(storyOf(plan), plan).cards
/** The route at the landing, in a room the size of 1440 × 900's. */
const landedPlaces = (plan: EngineRun, roomW = 1024) => {
  const cards = cardsOfPlan(plan)
  const last = plan.steps.length - 1
  return overviewPlaces({ plan, cards, count: cards.length, p: last, landed: landedAt(plan, last), roomW, roomH: 652, top: 0 })
}

describe('the route map, kept behind ROUTE_MAP (focus2-overview.ts)', () => {
  it('is off: Focus draws the chain on both views, and this module waits for the flag', () => {
    expect(layoutRaw.replace(/\r\n/g, '\n')).toMatch(/\nconst ROUTE_MAP = false\n/)
  })

  it('stands the sign-in, the policy that applies, the rule that decided and the outcome on the line, left to right', () => {
    for (const { name, plan } of RUNS) {
      const route = routeOf(plan, cardsOfPlan(plan))
      expect(route.stations.map((s) => s.kind), name).toEqual(['sign', 'policies', 'rule', 'outcome'])
      /* The rule station is the rule every other part of Focus points at. */
      expect(route.stationRule, name).toBe(checksRuleOf(plan))
    }
  })

  it("hangs every other policy and rule in the engine's order: those read before the selected one above it, the rest below", () => {
    for (const { name, plan } of RUNS) {
      const route = routeOf(plan, cardsOfPlan(plan))
      const sides = (items: ColumnItem[]) => items.map((x) => x.side)
      /* Above, then below — never interleaved. */
      for (const col of [route.columns.policies, route.columns.rule]) expect(sides(col).join(' '), name).toMatch(/^(above ?)*(below ?)*$/)
      /* Rules above the station failed or could not be told; below it, on a run that was decided, the engine never got to
         them (a run that depends reads on past the station, so its rows below say what each came to). */
      const decided = plan.outcome.status === 'decided'
      for (const it of route.columns.rule) {
        if (it.side === 'above') expect(['fail', 'warn'], `${name} ${it.row.name}`).toContain(it.row.tone)
        if (decided && it.side === 'below' && it.row.kind === 'rule') expect(it.row.says, `${name} ${it.row.name}`).toBe('Not reached')
      }
    }
    /* Maya: the policy that also covers her, amber, says what it would have given. */
    const also = routeOf(MAYA, cardsOfPlan(MAYA)).columns.policies.find((x) => x.row.tone === 'also')
    expect(also?.row.name).toBe('AWS billing for Finance')
    expect(also && rowLabel(also.row)).toBe('AWS billing for Finance: Allow with 2FA, not used')
  })

  it('places nothing over anything else, keeps every box inside the map, and runs the line through each head', () => {
    for (const { name, plan } of RUNS) {
      const ov = landedPlaces(plan)
      for (let i = 0; i < ov.boxes.length; i++)
        for (let j = i + 1; j < ov.boxes.length; j++) expect(overlaps(ov.boxes[i].box, ov.boxes[j].box), `${name}: ${ov.boxes[i].key} × ${ov.boxes[j].key}`).toBe(false)
      for (const { key, box } of ov.boxes) {
        expect(box.x, `${name} ${key}`).toBeGreaterThanOrEqual(0)
        expect(box.x + box.w, `${name} ${key}`).toBeLessThanOrEqual(ov.w)
      }
      /* The line passes through every station's head. */
      for (const st of ov.stations) {
        expect(ov.line.y, name).toBeGreaterThan(st.y)
        expect(ov.line.y, name).toBeLessThan(st.y + ov.head + 2)
      }
      expect(ov.line.reached, name).toBe(ov.stations.length)
    }
  })

  it('fits four stations to the room, and grows the map rather than shrink them past their least', () => {
    expect(stationWidth(1024, 4)).toBe(Math.min(STATION_MAX, Math.round((1024 - 2 * MAP_EDGE - 3 * STATION_GAP) / 4)))
    expect(stationWidth(400, 4)).toBe(STATION_MIN)
    expect(stationWidth(4000, 4)).toBe(STATION_MAX)
    const narrow = landedPlaces(MAYA, 400)
    expect(narrow.w).toBeGreaterThan(400)
    expect(landedPlaces(MAYA, 1400).w).toBe(1400)
  })

  it('folds a long side into one "+n more" row, never folding a card of the story or a policy that also covers them', () => {
    const row = (n: number, tone: RouteRow['tone'] = 'quiet'): ColumnItem => ({ kind: 'row', side: 'below', row: { key: `r${n}`, kind: 'policy', name: `Policy ${n}`, says: 'Not reached', mark: 'dash', read: false, would: null, tone, target: null } })
    const items = [row(1, 'also'), row(2), row(3), row(4), row(5)]
    const capped = capSide(items, 'below', 'policies')
    expect(capped.length).toBe(MAX_SIDE)
    expect(capped[0].row.tone).toBe('also')
    const more = capped[capped.length - 1].row
    expect(more.kind).toBe('more')
    expect(more.name).toBe('+3 more')
    expect(rowLabel(more)).toBe('+3 more: Policy 3, Policy 4, Policy 5')
    /* A short side is left as it is. */
    expect(capSide(items.slice(0, MAX_SIDE), 'below', 'policies')).toEqual(items.slice(0, MAX_SIDE))
  })

  it('draws the line once the last card is most of the way there, never before the first has left', () => {
    expect(lineAt(1)).toBeLessThan(lineAt(4))
    expect(lineAt(6) - lineAt(5)).toBeCloseTo(0.04)
    expect(lineAt(4)).toBeGreaterThan(0.26)
  })
})
