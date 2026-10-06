import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { BrandProvider } from '../../../store'
import { columnView, runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { TestingSessionProvider } from '../../testing/session'
import { factsOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { engineRun } from '../engine-run'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import { FarFace } from './focus-far'
import { PEEK, cardWidth, focusPlaces } from './focus-geometry'
import { closestMiss, momentsOf, stateKeyOf, toneOf } from './focus-model'
import { OutcomeMoment } from './focus-outcome'
import { fixPossessive, reasonLine } from './focus-voice'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   Focus's polish (3 Oct 2026) over REAL runs of the showcase tenant: the
   Depends answer the form cannot reach, drawn whole; the closest miss on a
   Deny that fell to the last rule; the landed answer never let go of (kept
   on stage as a far face or a 64 px peek); the reason said, not the verdict
   again; a policy's name never takes 's.
   -------------------------------------------------------------------------- */

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const noop = () => {}

function propsOf(personName: string, appName: string, opts: { origin?: 'home' | 'tor'; patch?: Partial<SignInForm> } = {}): RunLayoutProps {
  const person = t.directory.people.find((p) => p.name === personName)
  const app = t.apps.find((a) => a.name === appName)
  if (!person || !app) throw new Error(`no ${personName} or ${appName} in the showcase`)
  const rows = rowsRead(t.policies, null, app.id, lib)
  const base: SignInForm = { ...emptyDraft(TODAY, '09:30'), ...(opts.origin ? originPatch(opts.origin) : {}), personId: person.id, appId: app.id }
  const form = { ...forRun(withDefaults(base, rows, [], TODAY, '09:30'), rows), ...(opts.patch ?? {}) } as SignInForm
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns([AS_IT_STANDS], t.policies, facts, env)
  const res = cols[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx, intro: 'none' })
  return {
    plan,
    s: plan.steps.length - 1,
    running: false,
    animate: false,
    reduced: true,
    jumped: true,
    runKey: 1,
    form,
    rows,
    asGroup: null,
    start: <div />,
    answer: <div />,
    screens: screensOf(res, { policies: t.policies, methods: t.methods, defaultMethodId: undefined, person }),
    columns: cols.map((c) => columnView(c, '', t.policies, (id) => t.apps.find((a) => a.id === id)?.name ?? id)),
    changed: null,
    expected: null,
    weaker: null,
    onPressPerson: noop,
    onAdd: noop,
    onOpenPolicy: noop,
    onOpenRule: noop,
    onAsGroup: noop,
  }
}

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>{node}</TestingSessionProvider>
    </BrandProvider>,
  )
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

const DEP = propsOf('Arun Patel', 'GitHub Enterprise', { patch: { device: { kind: 'none' } } as Partial<SignInForm> })
const DENY = propsOf('Devon Rao', 'AWS Console', { patch: { device: { kind: 'preset', id: 'win10' } } as Partial<SignInForm> })
const ALLOW = propsOf('Maya Iyer', 'AWS Console')

describe('the Depends answer (the form cannot reach it): drawn whole', () => {
  it('amber tile and word, the ifs and what it needs, no who → app line', () => {
    expect(DEP.plan.outcome.status).toBe('depends')
    const tone = toneOf(DEP.plan)
    expect(tone).toBe('notice')
    const html = wrap(<OutcomeMoment props={DEP} tone={tone} animate={false} inert={false} />)
    expect(html).toContain('rl-focus__vtile is-notice')
    expect(html).toContain('is-landed is-notice')
    expect(text(html)).toContain('Depends')
    expect(html).toContain('rl-focus__ifs')
    expect(text(html)).toMatch(/Needs /)
    expect(html).not.toContain('rl-focus__who')
    expect(html).not.toContain('rl-focus__closest')
  })
  it('its far face says Depends in its tone', () => {
    const moments = momentsOf(DEP.plan)
    const out = moments[moments.length - 1]
    const names = { person: 'Arun Patel', first: 'Arun', group: false, appId: DEP.form.appId, appName: 'GitHub Enterprise' }
    const html = wrap(<FarFace m={out} plan={DEP.plan} s={DEP.s} landed tone="notice" names={names} compact={false} stateKey={stateKeyOf(out, DEP.plan, DEP.s, true)} />)
    expect(html).toContain('is-landed is-notice')
    expect(text(html)).toContain('Depends')
  })
})

describe('the closest miss: a Deny that fell to the last rule', () => {
  it('Devon Rao → AWS Console on a Windows 10 laptop: the rule read with the fewest failing checks, the earliest on a tie', () => {
    expect(DENY.plan.outcome.decision).toBe('deny')
    const landing = DENY.plan.rules[DENY.plan.landing ?? -1]
    expect(landing?.index).toBeNull()
    const c = closestMiss(DENY.plan)
    expect(c).not.toBeNull()
    const read = DENY.plan.rules.filter((r) => r.index !== null && r.visited && r.state === 'no-match')
    const fails = (r: (typeof read)[number]) => Math.max(1, r.checks.filter((x) => x.status === 'fail').length)
    const fewest = Math.min(...read.map(fails))
    expect(c!.rule).toBe(read.find((r) => fails(r) === fewest))
    expect(c!.says).toMatch(/^Closest: Rule \d+, missed (only on \w+|on \d+ checks)$/)
    const html = wrap(<OutcomeMoment props={DENY} tone="negative" animate={false} inert={false} onClosest={noop} />)
    expect(text(html)).toContain(c!.says)
    expect(html).not.toContain('rl-focus__who')
  })
  it('never on an allow, nor on a deny a rule decided', () => {
    expect(closestMiss(ALLOW.plan)).toBeNull()
  })
})

describe('focusPlaces: the landed answer is never let go of', () => {
  const W = 1408
  const cw = cardWidth(W)
  it('stepped back to the first card, the answer peeks 64 px at the right edge, drawn and pressable', () => {
    const n = 7
    const base = Array.from({ length: n }, (_, i) => (i === 0 ? cw : 335))
    const p = focusPlaces(n, 0, W, base, 100, n - 1)
    const out = p[n - 1]
    expect(out.hidden).toBe(false)
    expect(out.peek).toBe(true)
    expect(out.opacity).toBe(1)
    expect(out.rotateY).toBeLessThan(0)
    /* Its scaled left edge sits PEEK px in from the right. */
    const left = out.x + (out.w ?? 0) / 2 - ((out.w ?? 0) * out.scale) / 2
    expect(Math.round(W - left)).toBe(PEEK)
    /* The cards between it and the focus that do not fit stay hidden, never drawn under the peek. */
    expect(p.slice(1, n - 1).some((x) => x.hidden)).toBe(true)
  })
  it('without a kept card, nothing out of reach is drawn', () => {
    const n = 7
    const p = focusPlaces(n, 0, W, Array.from({ length: n }, () => cw), 100, -1)
    expect(p[n - 1].hidden).toBe(true)
    expect(p.some((x) => x.peek)).toBe(false)
  })
  it('one step back, the answer stands as a receded card at depth 1', () => {
    const n = 7
    const p = focusPlaces(n, n - 2, W, Array.from({ length: n }, (_, i) => (i === n - 2 ? cw : 335)), 100, n - 1)
    expect(p[n - 1].hidden).toBe(false)
    expect(p[n - 1].peek).toBeFalsy()
    expect(p[n - 1].scale).toBe(0.8)
  })
})

describe('the voice', () => {
  it('the answer says why, not the verdict again', () => {
    expect(reasonLine(DENY.plan, DENY.screens, { first: 'Devon' })).toBe('No rule above fits Devon, so the last rule denies.')
    expect(reasonLine(DEP.plan, DEP.screens, { first: 'Arun' })).toMatch(/^It depends on the /)
    expect(reasonLine(ALLOW.plan, ALLOW.screens, { first: 'Maya' })).toMatch(/^Rule \d+ lets Maya in/)
  })
  it("a policy's name never takes 's", () => {
    expect(fixPossessive("None of AWS for engineering teams's 3 rules match.")).toBe('None of the 3 rules in AWS for engineering teams match.')
  })
})
